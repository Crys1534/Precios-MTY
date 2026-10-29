/* calc.js - las cuentas: precio por kilo/litro/pieza, tienda más barata, tendencia, series de la gráfica */
(function (global) {
  'use strict';
  const PT = (global.PT = global.PT || {});
  const { UNITS, safeUnit, norm, money } = PT.u;
  const skey = (s) => norm(s);

  // Precio por kilo, litro o pieza (para poder comparar 500 g contra 1 kg)
  function unitPrice(e) {
    const u = UNITS[safeUnit(e.unit)];
    return e.price / (e.qty * u.f);
  }
  const dimOf = (e) => UNITS[safeUnit(e.unit)].dim;
  const baseOf = (e) => UNITS[safeUnit(e.unit)].base;
  const unitText = (e) => money(unitPrice(e)) + ' / ' + baseOf(e);

  // Registros del más nuevo al más viejo
  function entriesDesc(p) {
    return p.entries
      .map((e, i) => ({ e, i }))
      .sort((a, b) => (new Date(b.e.date) - new Date(a.e.date)) || (b.i - a.i))
      .map((x) => x.e);
  }

  const COLOR_SLOTS = 6;

  function summarize(p) {
    const desc = entriesDesc(p);
    const latest = desc[0];
    const dim = dimOf(latest);
    const base = baseOf(latest);
    const same = desc.filter((e) => dimOf(e) === dim);

    // Último precio de cada tienda
    const byStore = new Map();
    same.forEach((e) => { const k = skey(e.store); if (!byStore.has(k)) byStore.set(k, e); });
    const rows = [...byStore].map(([key, e]) => ({ key, name: e.store, entry: e, unit: unitPrice(e) }));
    rows.sort((a, b) => a.unit - b.unit);
    const min = rows.length ? rows[0].unit : 0;
    rows.forEach((r) => {
      r.cheapest = rows.length > 1 && r.unit <= min * 1.0005;
      r.pct = min > 0 ? Math.round((r.unit / min - 1) * 100) : 0;
    });

    // Tendencia: último precio contra el anterior de la misma tienda
    let trend = null;
    const lk = skey(latest.store);
    const prev = same.find((e, i) => i > 0 && e !== latest && skey(e.store) === lk);
    if (prev) {
      const pct = (unitPrice(latest) / unitPrice(prev) - 1) * 100;
      trend = { pct, dir: pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'same', prev };
    }

    // ¿Siempre se compró la misma cantidad? Entonces la gráfica muestra el precio tal cual
    const sizes = new Set(same.map((e) => +(e.qty * UNITS[safeUnit(e.unit)].f).toPrecision(6)));
    const metric = sizes.size <= 1 ? 'price' : 'unit';
    const val = (e) => (metric === 'price' ? e.price : unitPrice(e));

    // Una línea por tienda, en orden fijo (el color sigue a la tienda, no a su lugar)
    const groups = new Map();
    same.forEach((e) => {
      const k = skey(e.store);
      if (!groups.has(k)) groups.set(k, { key: k, name: e.store, points: [] });
      groups.get(k).points.push({ t: new Date(e.date).getTime(), v: val(e), entry: e });
    });
    let series = [...groups.values()];
    series.forEach((s) => s.points.sort((a, b) => a.t - b.t));
    const total = series.length;
    if (series.length > COLOR_SLOTS) {
      series = series.slice().sort((a, b) => b.points.length - a.points.length || b.points[b.points.length - 1].t - a.points[a.points.length - 1].t).slice(0, COLOR_SLOTS);
    }
    series.sort((a, b) => a.points[0].t - b.points[0].t);
    series.forEach((s, i) => { s.slot = i + 1; });

    const mine = series.find((s) => s.key === lk) || series[0];
    return { desc, latest, dim, base, rows, trend, metric, series, hiddenStores: total - series.length, spark: mine && mine.points.length > 1 ? mine.points : null };
  }

  // Índice de tiendas con su logo y cuántos productos tienen
  function storeIndex() {
    const idx = new Map();
    PT.state.stores.forEach((s) => idx.set(s.key, { key: s.key, name: s.name, logo: s.logo || null, products: 0, entries: 0, last: 0 }));
    PT.state.products.forEach((p) => {
      const seen = new Set();
      p.entries.forEach((e) => {
        const k = skey(e.store);
        let r = idx.get(k);
        if (!r) { r = { key: k, name: e.store, logo: null, products: 0, entries: 0, last: 0 }; idx.set(k, r); }
        r.entries++;
        r.last = Math.max(r.last, new Date(e.date).getTime());
        if (!seen.has(k)) { seen.add(k); r.products++; }
      });
    });
    return idx;
  }

  function storeLogo(name) {
    const s = PT.state.stores.get(skey(name));
    return s ? s.logo : null;
  }

  // Búsqueda por nombre del producto o de una tienda donde se registró
  const cache = new WeakMap();
  function haystack(p) {
    const c = cache.get(p);
    if (c && c.v === p.updatedAt && c.n === p.entries.length) return c.h;
    const h = norm(p.name) + '|' + p.entries.map((e) => norm(e.store)).join('|');
    cache.set(p, { v: p.updatedAt, n: p.entries.length, h });
    return h;
  }
  function matches(p, q) {
    const n = norm(q);
    return !n || haystack(p).indexOf(n) >= 0;
  }

  function sortProducts(list, how) {
    const out = list.slice();
    if (how === 'az') {
      const c = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
      out.sort((a, b) => c.compare(a.name, b.name));
    } else {
      const last = (p) => Math.max.apply(null, p.entries.map((e) => new Date(e.date).getTime()));
      const t = new Map(out.map((p) => [p, last(p)]));
      out.sort((a, b) => t.get(b) - t.get(a));
    }
    return out;
  }

  function findByName(name, exceptId) {
    const n = norm(name);
    return PT.state.products.find((p) => p.id !== exceptId && norm(p.name) === n) || null;
  }

  // Dos registros iguales (misma tienda, precio, cantidad y día) cuentan como el mismo
  const entrySig = (e) => [skey(e.store), e.price, e.qty, safeUnit(e.unit), String(e.date).slice(0, 10)].join('|');

  PT.calc = { unitPrice, dimOf, baseOf, unitText, entriesDesc, summarize, storeIndex, storeLogo, matches, sortProducts, findByName, entrySig, skey, COLOR_SLOTS };
})(window);
