/* util.js - herramientas comunes.
   Regla de oro de esta app: NUNCA se arma HTML pegando textos (innerHTML).
   Todo se construye con el() y se escribe con textContent, así un nombre como
   M&M’s, Sam's Club o "Dos Equis" nunca rompe un botón ni la pantalla. */
(function (global) {
  'use strict';
  const PT = (global.PT = global.PT || {});

  function add(node, kids) {
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }

  // el('div', {class:'x', dataset:{id}}, 'texto', otroNodo)
  function el(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (v === true) node.setAttribute(k, '');
        else node.setAttribute(k, v);
      }
    }
    return add(node, kids);
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, ...kids) {
    const node = document.createElementNS(SVG_NS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] != null) node.setAttribute(k, attrs[k]);
    return add(node, kids);
  }

  function icon(name, extra) {
    return el('i', { class: 'fa-solid fa-' + name + (extra ? ' ' + extra : ''), 'aria-hidden': 'true' });
  }

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };

  // --- Textos: sin acentos, minúsculas y con apóstrofes unificados (’ ‘ ´ ` -> ') ---
  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[‘’‛ʼ′´`]/g, "'")
      .replace(/[“”„″]/g, '"')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // --- Unidades: todo se compara por kilo, litro o pieza ---
  const UNITS = {
    pza: { name: 'Pieza (pza)', dim: 'count', f: 1, base: 'pza' },
    g:   { name: 'Gramos (g)', dim: 'mass', f: 0.001, base: 'kg' },
    kg:  { name: 'Kilos (kg)', dim: 'mass', f: 1, base: 'kg' },
    ml:  { name: 'Mililitros (ml)', dim: 'vol', f: 0.001, base: 'L' },
    L:   { name: 'Litros (L)', dim: 'vol', f: 1, base: 'L' }
  };
  const safeUnit = (u) => (UNITS[u] ? u : 'pza');

  // --- Formatos ---
  const moneyFmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  const money = (n) => (isFinite(n) ? moneyFmt.format(n) : '-');
  const numFmt = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });
  const num = (n) => numFmt.format(n);
  const dateFmt = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  const dateShortFmt = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
  const date = (iso) => dateFmt.format(new Date(iso));
  const dateShort = (iso) => dateShortFmt.format(new Date(iso));

  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  function daysAgo(iso) {
    return Math.round((dayStart(new Date()) - dayStart(new Date(iso))) / 86400000);
  }
  function ago(iso) {
    const n = daysAgo(iso);
    if (n <= 0) return 'hoy';
    if (n === 1) return 'ayer';
    if (n <= 30) return 'hace ' + n + ' días';
    return date(iso);
  }

  // "42.50" -> 42.5 ; "42,50" -> 42.5 ; "1,250" -> 1250 ; vacío o inválido -> NaN
  function parseNum(text) {
    let t = String(text == null ? '' : text).trim().replace(/\s/g, '').replace(/^\$/, '');
    if (!t) return NaN;
    if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.');
    else t = t.replace(/,/g, '');
    return /^\d*\.?\d+$|^\d+\.$/.test(t) ? parseFloat(t) : NaN;
  }

  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);

  PT.u = { el, svg, icon, add, $, $$, clear, norm, uid, UNITS, safeUnit, money, num, date, dateShort, daysAgo, ago, parseNum, debounce, sleep, plural };
})(window);
