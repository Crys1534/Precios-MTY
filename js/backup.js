/* backup.js - copias de seguridad (exportar / importar) y paso de datos de la versión anterior.
   Entiende 3 cosas:
     1. Copias nuevas  {format:2, products, stores, photos}
     2. Copias de la versión anterior  {version:"10.1", prices:{...}, logos:{...}}  (o solo el objeto de precios)
     3. Lo que la versión anterior dejó guardado en el teléfono (localStorage): se copia solo, una vez. */
(function (global) {
  'use strict';
  const PT = (global.PT = global.PT || {});
  const { uid, norm, safeUnit } = PT.u;
  const skey = (s) => norm(s);

  // ---------- Leer y limpiar lo que llega ----------
  function cleanEntry(e) {
    if (!e || typeof e !== 'object') return null;
    const price = parseFloat(e.price);
    if (!isFinite(price) || price < 0) return null;
    let qty = parseFloat(e.qty);
    if (!isFinite(qty) || qty <= 0) qty = 1;
    const d = new Date(e.date);
    const { price: _p, qty: _q, unit, store, addr, date: _d, id, unitPrice: _u, ...rest } = e;
    // lo desconocido (por ejemplo etiquetas viejas) se conserva en la copia, pero no se muestra
    return Object.assign(rest, {
      id: id ? String(id) : uid(),
      price, qty, unit: safeUnit(unit),
      store: String(store == null ? '' : store).trim() || 'Sin tienda',
      addr: String(addr == null ? '' : addr).trim(),
      date: isNaN(d) ? new Date().toISOString() : d.toISOString()
    });
  }

  function cleanProduct(p, id) {
    if (!p || typeof p !== 'object') return null;
    const raw = Array.isArray(p.entries) ? p.entries : Array.isArray(p.history) ? p.history : [];
    const entries = raw.map(cleanEntry).filter(Boolean);
    const name = String(p.name == null ? '' : p.name).trim();
    if (!name || !entries.length) return null;
    const { id: _i, name: _n, image: _im, entries: _e, history: _h, createdAt, updatedAt, ...rest } = p;
    const first = entries.reduce((a, e) => (e.date < a ? e.date : a), entries[0].date);
    return Object.assign(rest, { id: String(id || p.id || uid()), name, image: p.image, entries, createdAt: createdAt || first, updatedAt: updatedAt || new Date().toISOString() });
  }

  function legacyImage(v) {
    if (!v || typeof v !== 'string') return null;
    if (/^data:image/i.test(v)) return { t: 'dataurl', data: v };
    if (/^https?:/i.test(v)) return { t: 'url', url: v };
    return { t: 'file', name: v };
  }

  function fromLegacy(prices, logos) {
    const products = [];
    Object.keys(prices || {}).forEach((k) => {
      const p = prices[k];
      if (!p || typeof p !== 'object') return;
      const c = cleanProduct(Object.assign({}, p, { image: legacyImage(p.image) }), 'L' + k);
      if (c) products.push(c);
    });
    const stores = [];
    const seen = new Set();
    const addStore = (name, logo) => {
      const key = skey(name);
      if (!key || seen.has(key)) return;
      seen.add(key);
      stores.push({ key, name: String(name).trim(), logo: legacyImage(logo) });
    };
    Object.keys(logos || {}).forEach((n) => { if (logos[n]) addStore(n, logos[n]); });
    return { products, stores, photos: {} };
  }

  function parseIncoming(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('El archivo no es una copia de PriceTracker.');
    let out;
    if (Array.isArray(obj.products)) {
      const photos = obj.photos && typeof obj.photos === 'object' ? obj.photos : {};
      const products = obj.products.map((p) => cleanProduct(p, p && p.id)).filter(Boolean);
      const stores = (Array.isArray(obj.stores) ? obj.stores : [])
        .filter((s) => s && s.name).map((s) => ({ key: skey(s.name), name: String(s.name).trim(), logo: s.logo || null }));
      out = { products, stores, photos };
    } else if (obj.prices && typeof obj.prices === 'object') {
      out = fromLegacy(obj.prices, obj.logos);
    } else if (Object.values(obj).some((v) => v && typeof v === 'object' && Array.isArray(v.history))) {
      out = fromLegacy(obj, {});
    } else {
      throw new Error('El archivo no es una copia de PriceTracker.');
    }
    if (!out.products.length) throw new Error('La copia no tiene productos con precios.');
    out.stats = {
      products: out.products.length,
      entries: out.products.reduce((n, p) => n + p.entries.length, 0),
      photos: out.products.filter((p) => p.image && (p.image.t === 'dataurl' || p.image.t === 'blob')).length
    };
    return out;
  }

  // ---------- Meter lo que llega a la base de datos ----------
  async function ingest(parsed, opts) {
    const o = opts || {};
    const progress = o.onProgress || (() => {});
    if (o.replace) await PT.db.wipe();
    const state = PT.state;

    const storeQueue = new Map();
    const canon = (name) => {
      const key = skey(name);
      let rec = state.stores.get(key) || storeQueue.get(key);
      if (!rec) { rec = { key, name: String(name).trim(), logo: null }; storeQueue.set(key, rec); state.stores.set(key, rec); }
      return rec.name;
    };

    const photoCache = new Map();
    const toRef = async (ref, kind) => {
      if (!ref) return null;
      if (ref.t === 'file' && ref.name) return { t: 'file', name: String(ref.name) };
      if (ref.t === 'url' && ref.url) return { t: 'url', url: String(ref.url) };
      let data = null, cacheKey = null;
      if (ref.t === 'dataurl') data = ref.data;
      else if (ref.t === 'blob') { data = parsed.photos[ref.id]; cacheKey = ref.id; }
      if (!data || !/^data:image/i.test(data)) return null;
      if (cacheKey && photoCache.has(cacheKey)) return photoCache.get(cacheKey);
      try {
        const r = await PT.img.ingest(PT.img.dataUrlToBlob(data), kind);
        if (cacheKey) photoCache.set(cacheKey, r);
        return r;
      } catch (e) { return null; }
    };

    const changed = new Set();
    const sum = { added: 0, merged: 0, entries: 0 };
    let n = 0;
    for (const inc of parsed.products) {
      progress(++n, parsed.products.length);
      inc.entries.forEach((e) => { e.store = canon(e.store); });
      let cur = state.products.find((p) => p.id === inc.id) || state.products.find((p) => norm(p.name) === norm(inc.name));
      // La foto solo se procesa si hace falta (producto nuevo, o uno que no tenía foto)
      const image = !cur || !cur.image ? await toRef(inc.image, PT.img.PHOTO) : null;
      if (!cur) {
        const p = Object.assign({}, inc, { image });
        if (state.products.some((x) => x.id === p.id)) p.id = uid();
        state.products.push(p);
        changed.add(p);
        sum.added++; sum.entries += p.entries.length;
      } else {
        const sigs = new Set(cur.entries.map(PT.calc.entrySig));
        const fresh = inc.entries.filter((e) => !sigs.has(PT.calc.entrySig(e)));
        if (fresh.length) { cur.entries.push(...fresh); sum.entries += fresh.length; }
        if (!cur.image && image) cur.image = image;
        if (fresh.length || (!cur.image && image)) { changed.add(cur); sum.merged++; }
      }
    }

    // Logos de tiendas
    for (const s of parsed.stores) {
      const key = skey(s.name);
      const cur = state.stores.get(key);
      const logo = !cur || !cur.logo ? await toRef(s.logo, PT.img.LOGO) : null;
      if (!cur) { storeQueue.set(key, { key, name: s.name, logo }); state.stores.set(key, storeQueue.get(key)); }
      else if (!cur.logo && logo) { cur.logo = logo; storeQueue.set(key, cur); }
    }

    const now = new Date().toISOString();
    changed.forEach((p) => { p.updatedAt = now; });
    await PT.db.saveProducts([...changed]);
    if (storeQueue.size) await PT.db.saveStores([...storeQueue.values()]);
    if (o.replace) PT.db.gcPhotos().catch(() => {});
    return sum;
  }

  // ---------- Versión anterior (localStorage) ----------
  function hasLegacy() {
    try { const r = localStorage.getItem('pricesDB'); return !!r && r.length > 2; } catch (e) { return false; }
  }
  async function migrateLegacy() {
    const prices = JSON.parse(localStorage.getItem('pricesDB') || '{}');
    let logos = {};
    try { logos = JSON.parse(localStorage.getItem('storeLogosDB') || '{}') || {}; } catch (e) { /* sin logos */ }
    const parsed = fromLegacy(prices, logos);
    const sum = await ingest(parsed, {});
    await PT.db.setMeta('migrated', { at: new Date().toISOString(), products: parsed.products.length, entries: sum.entries });
    // Se deja la copia vieja intacta en el teléfono como respaldo extra (no estorba).
    return sum;
  }

  // ---------- Exportar ----------
  const two = (n) => String(n).padStart(2, '0');
  function fileName() {
    const d = new Date();
    return 'PriceTracker_' + d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + '.json';
  }

  async function exportAll() {
    const state = PT.state;
    const used = new Set();
    state.products.forEach((p) => { if (p.image && p.image.t === 'blob') used.add(p.image.id); });
    state.stores.forEach((s) => { if (s.logo && s.logo.t === 'blob') used.add(s.logo.id); });

    const produce = async (emit) => {
      await emit('{"app":"PriceTracker","format":2,"exportedAt":' + JSON.stringify(new Date().toISOString()) + ',"products":[');
      for (let i = 0; i < state.products.length; i++) await emit((i ? ',' : '') + JSON.stringify(state.products[i]));
      await emit('],"stores":' + JSON.stringify([...state.stores.values()]) + ',"photos":{');
      let first = true;
      await PT.db.getAllPhotosIter(async (id, blob) => {
        if (!used.has(id)) return;
        await emit((first ? '' : ',') + JSON.stringify(id) + ':' + JSON.stringify(await PT.img.blobToDataUrl(blob)));
        first = false;
      });
      await emit('}}');
    };
    const res = await PT.native.saveShare(fileName(), produce, 'Copia de seguridad PriceTracker', 'application/json');
    if (res !== 'cancelled') await PT.db.setMeta('lastBackup', new Date().toISOString());
    return res;
  }

  async function readFile(file) {
    const text = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(new Error('No se pudo leer el archivo.'));
      r.readAsText(file);
    });
    let obj;
    try { obj = JSON.parse(text); } catch (e) { throw new Error('El archivo está dañado o no es una copia de PriceTracker.'); }
    return parseIncoming(obj);
  }

  PT.backup = { hasLegacy, migrateLegacy, exportAll, readFile, parseIncoming, ingest, fromLegacy };
})(window);
