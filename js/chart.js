/* chart.js - gráfica del historial (líneas, una por tienda) y mini-gráfica de las tarjetas.
   Colores de las series: --s1 ... --s6 (definidos en theme.css, validados para fondo claro y oscuro).
   Reglas: líneas de 2 px, puntos de 8 px con aro del color del fondo, rejilla finísima,
   textos en color de texto (nunca en el color de la serie), leyenda si hay 2 o más tiendas. */
(function (global) {
  'use strict';
  const PT = (global.PT = global.PT || {});
  const { el, svg, money, date, dateShort } = PT.u;

  function niceTicks(min, max, target) {
    if (max - min < 1e-9) { const pad = Math.max(1, Math.abs(max) * 0.1); min -= pad; max += pad; }
    const raw = (max - min) / (target || 4);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / mag;
    const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
    const lo = Math.floor(min / step + 1e-9) * step;
    const hi = Math.ceil(max / step - 1e-9) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
    return { ticks, step, lo: ticks[0], hi: ticks[ticks.length - 1] };
  }

  function tickText(v, step) {
    if (Math.abs(v) >= 10000) return '$' + Math.round(v / 1000) + ' mil';
    const dec = step < 1 ? 2 : 0;
    return '$' + new Intl.NumberFormat('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);
  }

  const monthYear = new Intl.DateTimeFormat('es-MX', { month: 'short', year: '2-digit' });

  function line(series, opts) {
    const o = opts || {};
    const H = 176;
    const times = [...new Set([].concat(...series.map((s) => s.points.map((p) => p.t))))].sort((a, b) => a - b);
    const wrap = el('div', { class: 'chart' });

    // Leyenda (solo con 2 o más tiendas)
    if (series.length > 1) {
      wrap.append(el('ul', { class: 'chart-legend', 'aria-label': 'Tiendas' },
        series.map((s) => el('li', null, el('span', { class: 'key', style: { background: 'var(--s' + s.slot + ')' } }), el('span', { text: s.name })))));
    }
    const plot = el('div', { class: 'chart-plot' });
    const tip = el('div', { class: 'chart-tip', role: 'status', hidden: true });
    wrap.append(plot);

    let active = -1; // índice dentro de times
    let lastW = 0;

    function draw() {
      const W = Math.max(240, Math.floor(plot.clientWidth || wrap.clientWidth || 320));
      lastW = Math.floor(plot.clientWidth);
      const all = series.flatMap((s) => s.points.map((p) => p.v));
      const yt = niceTicks(Math.min(...all), Math.max(...all), 3);
      const labelW = Math.max(...yt.ticks.map((v) => tickText(v, yt.step).length)) * 6.4 + 10;
      const m = { l: Math.round(labelW), r: 14, t: 12, b: 26 };
      let t0 = times[0], t1 = times[times.length - 1];
      if (t1 - t0 < 3600e3) { t0 -= 12 * 3600e3; t1 += 12 * 3600e3; }
      const x = (t) => m.l + ((t - t0) / (t1 - t0)) * (W - m.l - m.r);
      const y = (v) => m.t + (1 - (v - yt.lo) / (yt.hi - yt.lo)) * (H - m.t - m.b);

      const root = svg('svg', { class: 'chart-svg', width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img', tabindex: 0,
        'aria-label': o.label || 'Gráfica del historial de precios' });

      // Rejilla y eje Y
      yt.ticks.forEach((v, i) => {
        root.append(svg('line', { class: i === 0 ? 'axis' : 'grid', x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }));
        root.append(svg('text', { class: 'tick', x: m.l - 8, y: y(v), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, tickText(v, yt.step)));
      });
      // Eje X: primera, media y última fecha
      const span = t1 - t0;
      const fx = span > 330 * 86400e3 ? (t) => monthYear.format(new Date(t)) : (t) => dateShort(new Date(t).toISOString());
      const xl = [[times[0], 'start'], [times[times.length - 1], 'end']];
      if (times.length > 2 && span > 4 * 86400e3) xl.splice(1, 0, [(times[0] + times[times.length - 1]) / 2, 'middle']);
      if (times.length === 1) xl.length = 1, xl[0][1] = 'middle';
      xl.forEach(([t, a]) => {
        const xx = a === 'start' ? Math.max(x(t), m.l) : a === 'end' ? Math.min(x(t), W - m.r) : x(t);
        root.append(svg('text', { class: 'tick', x: xx, y: H - 6, 'text-anchor': a }, fx(t)));
      });

      // Líneas y puntos
      series.forEach((s) => {
        const color = 'var(--s' + s.slot + ')';
        if (s.points.length > 1) {
          root.append(svg('path', { class: 'ln', stroke: color, d: s.points.map((p, i) => (i ? 'L' : 'M') + x(p.t).toFixed(1) + ' ' + y(p.v).toFixed(1)).join(' ') }));
        }
        const dots = s.points.length <= 14 ? s.points : [s.points[s.points.length - 1]];
        dots.forEach((p) => root.append(svg('circle', { class: 'dot', cx: x(p.t).toFixed(1), cy: y(p.v).toFixed(1), r: 4, fill: color })));
      });

      // Cruz de lectura (se mueve con el dedo o el mouse) y puntos resaltados
      const cross = svg('line', { class: 'cross', y1: m.t, y2: H - m.b, visibility: 'hidden' });
      const marks = series.map((s) => svg('circle', { class: 'dot hot', r: 5.5, fill: 'var(--s' + s.slot + ')', visibility: 'hidden' }));
      root.append(cross, ...marks);

      function show(i) {
        if (i < 0 || i >= times.length) return hide();
        active = i;
        const t = times[i], cx = x(t);
        cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
        while (tip.firstChild) tip.removeChild(tip.firstChild);
        tip.append(el('div', { class: 'tip-date', text: date(new Date(t).toISOString()) }));
        series.forEach((s, k) => {
          let cur = null;
          s.points.forEach((p) => { if (p.t <= t) cur = p; });
          if (!cur) { marks[k].setAttribute('visibility', 'hidden'); return; }
          marks[k].setAttribute('cx', x(cur.t)); marks[k].setAttribute('cy', y(cur.v)); marks[k].setAttribute('visibility', 'visible');
          tip.append(el('div', { class: 'tip-row' },
            el('span', { class: 'key', style: { background: 'var(--s' + s.slot + ')' } }),
            el('strong', { text: money(cur.v) }),
            el('span', { class: 'tip-store', text: s.name + (cur.t < t ? ' · ' + dateShort(new Date(cur.t).toISOString()) : '') })));
        });
        tip.hidden = false;
        const w = tip.offsetWidth;
        const left = cx > W / 2 ? Math.max(4, cx - w - 12) : Math.min(W - w - 4, cx + 12);
        tip.style.left = left + 'px';
      }
      function hide() {
        active = -1; tip.hidden = true;
        cross.setAttribute('visibility', 'hidden');
        marks.forEach((c) => c.setAttribute('visibility', 'hidden'));
      }
      function nearest(ev) {
        const r = root.getBoundingClientRect();
        const px = (ev.clientX - r.left) * (W / r.width);
        let best = 0, d = Infinity;
        times.forEach((t, i) => { const dd = Math.abs(x(t) - px); if (dd < d) { d = dd; best = i; } });
        return best;
      }
      root.addEventListener('pointerdown', (ev) => show(nearest(ev)));
      root.addEventListener('pointermove', (ev) => { if (ev.pointerType === 'mouse' || ev.buttons || active >= 0) show(nearest(ev)); });
      root.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') hide(); });
      root.addEventListener('keydown', (ev) => {
        if (ev.key === 'ArrowLeft') { show(Math.max(0, (active < 0 ? times.length : active) - 1)); ev.preventDefault(); }
        else if (ev.key === 'ArrowRight') { show(Math.min(times.length - 1, active + 1)); ev.preventDefault(); }
        else if (ev.key === 'Escape') hide();
      });
      root.addEventListener('blur', hide);

      while (plot.firstChild) plot.removeChild(plot.firstChild);
      plot.append(root, tip);
      tip.hidden = true;
    }

    // Se dibuja cuando ya tiene ancho real y se redibuja si cambia (girar el teléfono)
    requestAnimationFrame(draw);
    if (global.ResizeObserver) {
      new ResizeObserver(() => {
        const w = Math.floor(plot.clientWidth);
        if (w && w !== lastW) draw();
      }).observe(plot);
    }
    return wrap;
  }

  // Mini-gráfica de las tarjetas: últimos precios de la tienda más reciente
  function spark(points) {
    const vals = points.slice(-10).map((p) => p.v);
    const W = 64, H = 26, pad = 5;
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const x = (i) => pad + (i / (vals.length - 1)) * (W - pad * 2);
    const y = (v) => (hi - lo < 1e-9 ? H / 2 : pad + (1 - (v - lo) / (hi - lo)) * (H - pad * 2));
    return svg('svg', { class: 'spark', width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true' },
      svg('path', { class: 'ln', stroke: 'var(--s1)', d: vals.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ') }),
      svg('circle', { class: 'dot', cx: x(vals.length - 1).toFixed(1), cy: y(vals[vals.length - 1]).toFixed(1), r: 4, fill: 'var(--s1)' }));
  }

  PT.chart = { line, spark, niceTicks };
})(window);
