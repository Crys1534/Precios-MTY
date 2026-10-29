/* main.js - arranque de la app */
(function (global) {
  'use strict';
  const PT = global.PT;
  const { el, icon } = PT.u;
  const root = document.getElementById('root');

  function fatal(ex) {
    console.error(ex);
    root.textContent = '';
    root.append(el('div', { class: 'boot' }, el('div', null,
      el('div', { class: 'empty' },
        el('div', { class: 'big' }, icon('triangle-exclamation')),
        el('h2', { text: 'No pude abrir tus datos' }),
        el('p', { text: 'No se borró nada. Cierra la app por completo y ábrela otra vez. Si sigue igual, avísale a Claude con este mensaje:' }),
        el('p', { class: 'fine', text: String((ex && ex.message) || ex) }),
        el('button', { class: 'btn', type: 'button', onclick: () => location.reload() }, 'Reintentar')))));
  }

  async function start() {
    let theme = 'indigo';
    try { theme = localStorage.getItem('priceTheme') || 'indigo'; } catch (e) { /* nada */ }
    PT.ui.applyTheme(theme);
    try { await PT.db.init(); } catch (ex) { return fatal(ex); }

    PT.ui.mount(root);
    PT.ui.go('products');
    PT.native.onBack(() => PT.ui.back());

    const m = PT.db.getMeta('migrated');
    if (m && !PT.db.getMeta('migratedSeen')) {
      PT.db.setMeta('migratedSeen', true);
      PT.ui.toast('Traje tus ' + PT.u.plural(PT.state.products.length, 'producto', 'productos') + ' de la versión anterior', { ms: 6000 });
    }

    if (!PT.native.isNative() && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  global.addEventListener('unhandledrejection', (ev) => console.error('Promesa sin atender:', ev.reason));
  start();
})(window);
