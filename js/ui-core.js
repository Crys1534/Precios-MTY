/* ui-core.js - armazón de la pantalla: temas, barra de abajo, hojas que se abren encima, avisos y botón "atrás" */
(function (global) {
  'use strict';
  const PT = (global.PT = global.PT || {});
  const { el, icon, $, clear, uid } = PT.u;
  const ui = (PT.ui = { views: {}, tab: 'products' });

  // ---------- Temas ----------
  ui.THEMES = [
    { id: 'indigo', name: 'Índigo', head: '#3730A3', accent: '#4F46E5', bg: '#F9FAFB' },
    { id: 'eco', name: 'Verde ecológico', head: '#065F46', accent: '#047857', bg: '#F0FDF4' },
    { id: 'dark', name: 'Oscuro', head: '#1E293B', accent: '#2563EB', bg: '#0F172A' },
    { id: 'warm', name: 'Terracota cálido', head: '#92400E', accent: '#B45309', bg: '#FFFBEB' }
  ];
  ui.theme = () => document.documentElement.getAttribute('data-theme') || 'indigo';
  ui.applyTheme = function (id) {
    const t = ui.THEMES.find((x) => x.id === id) || ui.THEMES[0];
    document.documentElement.setAttribute('data-theme', t.id);
    try { localStorage.setItem('priceTheme', t.id); } catch (e) { /* sin almacenamiento del navegador */ }
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.head);
    PT.native.setBars(t.id);
  };

  // ---------- Avisos ----------
  let toastBox = null, toastState = null;
  ui.toast = function (text, opt) {
    const o = opt || {};
    if (toastState) toastState.end(false);
    let timer = null;
    const node = el('div', { class: 'toast', role: 'status' }, el('span', { text }));
    const st = toastState = {
      end(acted) {
        clearTimeout(timer);
        node.remove();
        if (toastState === st) toastState = null;
        if (!acted && o.onExpire) o.onExpire();
      }
    };
    if (o.action) node.append(el('button', { type: 'button', text: o.action, onclick: () => { st.end(true); if (o.onAction) o.onAction(); } }));
    toastBox.append(node);
    timer = setTimeout(() => st.end(false), o.ms || (o.action ? 7000 : 3200));
  };

  // ---------- Hojas ----------
  const layer = el('div', { class: 'layer' });
  const stack = [];
  const native = () => PT.native.isNative();

  function sync() {
    const app = $('#app');
    if (app) { if (stack.length) app.setAttribute('inert', ''); else app.removeAttribute('inert'); }
    stack.forEach((h, i) => { if (i < stack.length - 1) h.el.setAttribute('inert', ''); else h.el.removeAttribute('inert'); });
    document.body.classList.toggle('sheet-open', stack.length > 0);
  }

  function removeTop() {
    const h = stack.pop();
    if (!h) return;
    h.el.remove();
    h.scrim.remove();
    sync();
    try { if (h.onClose) h.onClose(); } catch (e) { console.error(e); }
    if (h.opener && h.opener.isConnected && stack.length === 0) { try { h.opener.focus({ preventScroll: true }); } catch (e) { /* nada */ } }
  }

  ui.openSheet = function (opts) {
    const o = opts || {};
    const titleId = 'sh' + uid();
    const handle = { onClose: o.onClose, opener: document.activeElement, refresh: o.refresh || null };
    const title = el('h2', { id: titleId, text: o.title || '' });
    const back = el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Volver', onclick: () => handle.close() }, icon(o.closeIcon || 'chevron-left'));
    const head = el('div', { class: 'sheet-head' }, back, title);
    (o.actions || []).forEach((a) => head.append(el('button', { class: 'icon-btn', type: 'button', 'aria-label': a.label, title: a.label, onclick: a.onClick }, icon(a.icon))));
    const body = el('div', { class: 'sheet-body' });
    const foot = o.foot ? el('div', { class: 'sheet-foot' }) : null;
    const sheet = el('section', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId }, head, body, foot);
    const scrim = el('div', { class: 'scrim', onclick: () => handle.close() });
    Object.assign(handle, {
      el: sheet, scrim, body, foot, title,
      setTitle(t) { title.textContent = t; },
      close() {
        const i = stack.indexOf(handle);
        if (i < 0 || handle.closing) return;      // cerrar dos veces no debe retroceder dos veces
        handle.closing = true;
        if (i === stack.length - 1) { if (native()) removeTop(); else history.back(); }
        else { stack.splice(i, 1); sheet.remove(); scrim.remove(); sync(); if (handle.onClose) handle.onClose(); }
      }
    });
    layer.append(scrim, sheet);
    stack.push(handle);
    if (!native()) history.pushState({ pt: stack.length }, '');
    sync();
    if (o.build) o.build(handle);
    if (o.focus) setTimeout(() => { const f = $(o.focus, sheet); if (f) f.focus(); }, 120);
    return handle;
  };
  ui.sheetsOpen = () => stack.length;

  // El usuario retrocede con el navegador (web)
  global.addEventListener('popstate', (ev) => {
    const target = (ev.state && ev.state.pt) || 0;
    while (stack.length > target) removeTop();
  });
  global.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && stack.length) stack[stack.length - 1].close(); });

  // Botón "atrás" de Android: cierra la hoja de arriba; si no hay, vuelve a Productos; si ya está ahí, minimiza la app
  ui.back = function () {
    if (stack.length) removeTop();
    else if (ui.tab !== 'products') ui.go('products');
    else PT.native.minimize();
  };

  // ---------- Pestañas ----------
  const TABS = [
    { id: 'products', label: 'Productos', icon: 'basket-shopping' },
    { id: 'stores', label: 'Tiendas', icon: 'store' },
    { id: 'add', label: 'Agregar', icon: 'plus' },
    { id: 'settings', label: 'Ajustes', icon: 'gear' }
  ];
  let top, view, bar;

  ui.go = function (id) {
    if (id === 'add') { ui.form.openNew(); return; }
    ui.tab = id;
    const v = ui.views[id];
    clear(top); clear(view);
    view.scrollTop = 0;
    v.mount(top, view);
    bar.querySelectorAll('.tab').forEach((b) => {
      if (b.dataset.tab === id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  };

  // Se llama después de cualquier cambio en los datos: refresca la pantalla de fondo y las hojas abiertas
  ui.changed = function () {
    const v = ui.views[ui.tab];
    if (v && v.refresh) { const y = view.scrollTop; v.refresh(); view.scrollTop = y; }
    stack.slice().forEach((h) => { if (h.refresh && !h.closing) h.refresh(h); });
  };

  ui.mount = function (root) {
    top = el('header', { class: 'top' });
    view = el('main', { id: 'view' });
    bar = el('nav', { class: 'tabbar', 'aria-label': 'Secciones' },
      TABS.map((t) => el('button', { class: 'tab' + (t.id === 'add' ? ' add' : ''), type: 'button', dataset: { tab: t.id }, onclick: () => ui.go(t.id) },
        el('span', { class: 'ico' }, icon(t.icon)), el('span', { text: t.label }))));
    const app = el('div', { id: 'app' }, top, view, bar);
    toastBox = el('div', { id: 'toasts', 'aria-live': 'polite' });
    clear(root);
    root.append(app, layer, toastBox);
    // Al enfocar un campo con el teclado abierto, que no quede tapado
    root.addEventListener('focusin', (ev) => {
      const t = ev.target;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) setTimeout(() => { try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* nada */ } }, 320);
    });
  };
  ui.viewEl = () => view;
})(window);
