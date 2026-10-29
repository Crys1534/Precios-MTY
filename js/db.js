/* db.js - almacenamiento de la app (IndexedDB).
   Antes todo vivía en localStorage, que se llena a los ~5 MB (por eso las fotos "llenaban la memoria").
   IndexedDB no tiene ese tope: solo depende del espacio libre del teléfono.

   Tablas:
     products  { id, name, image, entries:[{id,price,qty,unit,store,addr,date}], createdAt, updatedAt }
     stores    { key, name, logo }          key = nombre normalizado
     photos    { id, blob }                 foto grande (máx. 900 px)
     thumbs    { id, blob }                 miniatura (máx. 320 px) para las listas
     meta      { k, v }                     ajustes sueltos (migración, última copia...)
   image / logo: null | {t:'blob', id} | {t:'file', name} (carpeta images/) | {t:'url', url}
*/
(function (global) {
  'use strict';
  const PT = (global.PT = global.PT || {});
  const { norm } = PT.u;

  const DB_NAME = 'preciosmty';
  const DB_VERSION = 1;
  let idb = null;

  const state = (PT.state = {
    products: [],
    stores: new Map(),   // key -> {key,name,logo}
    thumbs: new Map(),   // photoId -> objectURL de la miniatura
    meta: {},
    persisted: null,
    ready: false
  });

  const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  function open() {
    return new Promise((res, rej) => {
      if (!global.indexedDB) return rej(new Error('Este dispositivo no permite guardar datos.'));
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('products', { keyPath: 'id' });
        d.createObjectStore('stores', { keyPath: 'key' });
        d.createObjectStore('photos', { keyPath: 'id' });
        d.createObjectStore('thumbs', { keyPath: 'id' });
        d.createObjectStore('meta', { keyPath: 'k' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('El almacenamiento está bloqueado por otra ventana.'));
    });
  }

  // Ejecuta escrituras y espera a que queden realmente guardadas (oncomplete)
  function run(names, mode, fn) {
    return new Promise((res, rej) => {
      const t = idb.transaction(names, mode);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('No se pudo guardar.'));
      fn(t);
    });
  }
  const write = (name, fn) => run([name], 'readwrite', (t) => fn(t.objectStore(name)));
  const getAll = (name) => reqP(idb.transaction(name).objectStore(name).getAll());
  const getKeys = (name) => reqP(idb.transaction(name).objectStore(name).getAllKeys());
  const get = (name, key) => reqP(idb.transaction(name).objectStore(name).get(key));

  const skey = (name) => norm(name);

  const api = (PT.db = {
    skey,

    async init() {
      idb = await open();
      const [products, stores, thumbs, meta] = await Promise.all([
        getAll('products'), getAll('stores'), getAll('thumbs'), getAll('meta')
      ]);
      state.products = products;
      stores.forEach((s) => state.stores.set(s.key, s));
      thumbs.forEach((t) => state.thumbs.set(t.id, URL.createObjectURL(t.blob)));
      meta.forEach((m) => { state.meta[m.k] = m.v; });

      // Datos de la versión anterior (localStorage): se copian una sola vez
      if (!state.meta.migrated && PT.backup && PT.backup.hasLegacy()) {
        try { await PT.backup.migrateLegacy(); } catch (e) { console.error('Migración', e); state.migrationError = String((e && e.message) || e); }
      }

      state.ready = true;
      api.gcPhotos().catch(() => {});
      // Pide al sistema que no limpie estos datos por falta de espacio (puede decir que no; no pasa nada)
      try {
        if (navigator.storage && navigator.storage.persist) state.persisted = await navigator.storage.persist();
      } catch (e) { state.persisted = null; }
    },

    saveProduct(p) {
      p.updatedAt = new Date().toISOString();
      if (!state.products.includes(p)) state.products.push(p);
      return write('products', (s) => s.put(p));
    },
    saveProducts(list) { return write('products', (s) => list.forEach((p) => s.put(p))); },
    removeProduct(p) {
      const i = state.products.indexOf(p);
      if (i >= 0) state.products.splice(i, 1);
      return write('products', (s) => s.delete(p.id));
    },
    saveStore(st) { state.stores.set(st.key, st); return write('stores', (s) => s.put(st)); },
    saveStores(list) { list.forEach((st) => state.stores.set(st.key, st)); return write('stores', (s) => list.forEach((st) => s.put(st))); },
    removeStore(key) { state.stores.delete(key); return write('stores', (s) => s.delete(key)); },

    putPhoto(id, full, thumb) {
      state.thumbs.set(id, URL.createObjectURL(thumb));
      return run(['photos', 'thumbs'], 'readwrite', (t) => {
        t.objectStore('photos').put({ id, blob: full });
        t.objectStore('thumbs').put({ id, blob: thumb });
      });
    },
    async getPhoto(id) { const r = await get('photos', id); return r ? r.blob : null; },
    allPhotoIds() { return getKeys('photos'); },
    async getAllPhotosIter(fn) {
      // Lee las fotos de una en una (sin cargar todas en memoria)
      const ids = await getKeys('photos');
      for (const id of ids) { const r = await get('photos', id); if (r) await fn(id, r.blob); }
    },

    async setMeta(k, v) { state.meta[k] = v; await write('meta', (s) => s.put({ k, v })); },
    getMeta(k) { return state.meta[k]; },

    // Borra las fotos que ya nadie usa (se llama al abrir la app)
    async gcPhotos() {
      const used = new Set();
      state.products.forEach((p) => { if (p.image && p.image.t === 'blob') used.add(p.image.id); });
      state.stores.forEach((s) => { if (s.logo && s.logo.t === 'blob') used.add(s.logo.id); });
      const [pk, tk] = await Promise.all([getKeys('photos'), getKeys('thumbs')]);
      const dead = new Set([...pk, ...tk].filter((id) => !used.has(id)));
      if (!dead.size) return;
      await run(['photos', 'thumbs'], 'readwrite', (t) => {
        dead.forEach((id) => { t.objectStore('photos').delete(id); t.objectStore('thumbs').delete(id); });
      });
      dead.forEach((id) => { const u = state.thumbs.get(id); if (u) URL.revokeObjectURL(u); state.thumbs.delete(id); });
    },

    // Borra TODO (solo se usa al "Reemplazar todo" de una copia de seguridad)
    async wipe() {
      await run(['products', 'stores', 'photos', 'thumbs'], 'readwrite', (t) => {
        ['products', 'stores', 'photos', 'thumbs'].forEach((n) => t.objectStore(n).clear());
      });
      state.products = [];
      state.stores.clear();
      state.thumbs.forEach((u) => URL.revokeObjectURL(u));
      state.thumbs.clear();
    },

    async estimate() {
      const out = { usage: null, quota: null, persisted: state.persisted };
      try {
        if (navigator.storage && navigator.storage.estimate) {
          const e = await navigator.storage.estimate();
          out.usage = e.usage; out.quota = e.quota;
        }
        if (navigator.storage && navigator.storage.persisted) out.persisted = await navigator.storage.persisted();
      } catch (e) { /* sin datos */ }
      return out;
    }
  });
})(window);
