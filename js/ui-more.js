/* ui-more.js - pantallas de Tiendas y Ajustes, y copias de seguridad (guardar / restaurar) */
(function (global) {
  'use strict';
  const PT = (global.PT = global.PT || {});
  const ui = PT.ui;
  const { el, icon, clear, ago, plural, norm } = PT.u;
  const calc = PT.calc;
  const state = () => PT.state;

  PT.VERSION = '2.0';

  // ---------- Copias de seguridad ----------
  ui.exportBackup = async function () {
    if (!state().products.length) { ui.toast('Todavía no hay nada que guardar.'); return; }
    ui.toast('Preparando la copia…', { ms: 2000 });
    try {
      const r = await PT.backup.exportAll();
      if (r === 'shared') ui.toast('Copia lista');
      else if (r === 'downloaded') ui.toast('Copia descargada');
      ui.changed();
    } catch (ex) {
      console.error(ex);
      ui.toast('No se pudo guardar la copia: ' + String((ex && ex.message) || ex));
    }
  };

  ui.importBackup = async function (file) {
    let parsed;
    try { parsed = await PT.backup.readFile(file); }
    catch (ex) { ui.toast(String((ex && ex.message) || ex)); return; }
    const st = parsed.stats;
    const msg = el('p', null, 'Esta copia tiene ',
      el('strong', { text: plural(st.products, 'producto', 'productos') }), ', ',
      el('strong', { text: plural(st.entries, 'precio', 'precios') }),
      st.photos ? [' y ', el('strong', { text: plural(st.photos, 'foto', 'fotos') })] : null, '.');
    const err = el('div', { class: 'err', role: 'alert', hidden: true });
    const prog = el('p', { class: 'fine', 'aria-live': 'polite' });
    let armed = false;
    const run = async (replace, btns) => {
      btns.forEach((b) => { b.disabled = true; });
      err.hidden = true;
      try {
        const sum = await PT.backup.ingest(parsed, { replace, onProgress: (i, n) => { prog.textContent = 'Importando ' + i + ' de ' + n + '…'; } });
        handle.close();
        ui.changed();
        ui.toast(replace ? 'Copia restaurada'
          : !sum.added && !sum.merged ? 'Todo eso ya estaba guardado'
          : 'Listo: ' + plural(sum.added, 'producto nuevo', 'productos nuevos') + (sum.merged ? ' y ' + plural(sum.merged, 'actualizado', 'actualizados') : ''));
      } catch (ex) {
        console.error(ex);
        err.textContent = 'No se pudo importar: ' + String((ex && ex.message) || ex);
        err.hidden = false;
        btns.forEach((b) => { b.disabled = false; });
      }
    };
    const merge = el('button', { class: 'btn block', type: 'button', onclick: () => run(false, [merge, repl]) }, icon('right-left'), 'Combinar con lo que ya tengo');
    const repl = el('button', { class: 'btn danger block', type: 'button', onclick: () => {
      if (!armed) { armed = true; repl.textContent = 'Toca otra vez para borrar todo y reemplazar'; return; }
      run(true, [merge, repl]);
    } }, icon('rotate-left'), 'Reemplazar todo');
    const handle = ui.openSheet({
      title: 'Restaurar copia', closeIcon: 'xmark',
      build: (h) => h.body.append(msg,
        el('div', { class: 'choice' }, merge, el('p', { class: 'fine', text: 'Suma lo nuevo y no repite lo que ya está.' }),
          repl, el('p', { class: 'fine', text: 'Borra lo que tienes ahora y deja solo lo de la copia.' })), err, prog)
    });
  };

  // ---------- Tiendas ----------
  function openStore(key) {
    const logoInput = el('input', { type: 'file', accept: 'image/*', hidden: true });
    logoInput.addEventListener('change', async () => {
      const file = logoInput.files && logoInput.files[0];
      logoInput.value = '';
      if (!file) return;
      try { setLogo(await PT.img.store(file, PT.img.LOGO)); }
      catch (ex) { ui.toast('No pude leer esa imagen. Prueba con otra.'); }
    });
    async function setLogo(ref) {
      const idx = calc.storeIndex().get(key);
      const rec = state().stores.get(key) || { key, name: idx ? idx.name : key, logo: null };
      rec.logo = ref;
      await PT.db.saveStore(rec);
      ui.changed();
    }
    function render(h) {
      const idx = calc.storeIndex().get(key);
      if (!idx) { h.close(); return; }
      h.setTitle(idx.name);
      clear(h.body);
      let cheapest = 0;
      state().products.forEach((p) => { if (calc.summarize(p).rows.some((r) => r.cheapest && r.key === key)) cheapest++; });
      const fileName = el('input', { type: 'text', placeholder: 'soriana.png', autocomplete: 'off', autocapitalize: 'none', id: 'logoFile' });
      fileName.value = idx.logo && idx.logo.t === 'file' ? idx.logo.name : '';
      h.body.append(
        el('div', { style: { display: 'grid', justifyItems: 'center', gap: '14px', marginBottom: '20px' } },
          PT.img.node(idx.logo, idx.name, 'rd lg'),
          el('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' } },
            el('button', { class: 'btn ghost', type: 'button', onclick: () => logoInput.click() }, icon('image'), idx.logo ? 'Cambiar logo' : 'Elegir logo'),
            idx.logo ? el('button', { class: 'btn ghost', type: 'button', onclick: () => setLogo(null) }, 'Quitar logo') : null)),
        logoInput,
        el('div', { class: 'card' },
          el('div', { class: 'stat' }, el('span', { text: 'Productos con precio aquí' }), el('b', { text: String(idx.products) })),
          el('div', { class: 'stat' }, el('span', { text: 'Precios registrados' }), el('b', { text: String(idx.entries) })),
          el('div', { class: 'stat' }, el('span', { text: 'Es la más barata en' }), el('b', { text: plural(cheapest, 'producto', 'productos') })),
          el('div', { class: 'stat' }, el('span', { text: 'Último precio' }), el('b', { text: idx.last ? ago(new Date(idx.last).toISOString()) : '-' }))),
        el('div', { class: 'sect', text: 'Usar un archivo del proyecto' }),
        el('form', { class: 'field', onsubmit: (ev) => { ev.preventDefault(); const v = fileName.value.trim(); if (v) setLogo({ t: 'file', name: v }); } },
          el('label', { for: 'logoFile', text: 'Nombre del archivo en la carpeta images/' }), fileName,
          el('div', { class: 'hint', text: 'Para logos que agregues al proyecto, por ejemplo soriana.png.' }),
          el('button', { class: 'btn ghost', type: 'submit', style: { marginTop: '10px' }, text: 'Usar este archivo' })));
    }
    ui.openSheet({ title: '', refresh: (h) => render(h), build: (h) => render(h) });
  }

  ui.views.stores = {
    mount(top, view) {
      const idx = calc.storeIndex();
      const list = [...idx.values()].filter((s) => s.entries > 0);
      top.append(el('div', { class: 'top-row' }, el('h1', { text: 'Tiendas' }), el('span', { class: 'sub', text: list.length ? plural(list.length, 'tienda', 'tiendas') : '' })));
      const wrap = el('div', { class: 'wrap' });
      if (!list.length) {
        wrap.append(el('div', { class: 'empty' }, el('div', { class: 'big' }, icon('store')), el('h2', { text: 'Aún no hay tiendas' }),
          el('p', { text: 'Aparecen aquí cuando guardas un precio. Después puedes ponerles su logo.' })));
      } else {
        list.sort((a, b) => b.last - a.last);
        const ul = el('ul', { class: 'rows card' });
        list.forEach((s) => ul.append(el('li', null, el('button', { class: 'row', type: 'button', dataset: { key: s.key } },
          PT.img.node(s.logo, s.name, 'rd'),
          el('div', { class: 'txt' }, el('b', { text: s.name }), el('span', { text: plural(s.products, 'producto', 'productos') + ' · ' + ago(new Date(s.last).toISOString()) })),
          icon('chevron-right', 'go')))));
        ul.addEventListener('click', (ev) => { const b = ev.target.closest('.row'); if (b) openStore(b.dataset.key); });
        wrap.append(ul);
      }
      view.append(wrap);
    },
    refresh() { const v = ui.viewEl(); const t = document.querySelector('.top'); clear(t); clear(v); this.mount(t, v); }
  };

  // ---------- Ajustes ----------
  const mb = (n) => (n == null ? '-' : n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1) + ' MB');

  ui.views.settings = {
    mount(top, view) {
      top.append(el('div', { class: 'top-row' }, el('h1', { text: 'Ajustes' })));
      const st = state();
      const last = PT.db.getMeta('lastBackup');
      // sin filtro de tipo: algunos teléfonos no reconocen los .json y los dejarían en gris
      const restore = el('input', { type: 'file', hidden: true });
      restore.addEventListener('change', () => { const f = restore.files && restore.files[0]; restore.value = ''; if (f) ui.importBackup(f); });

      const themes = el('div', { class: 'themes' }, ui.THEMES.map((t) => el('button', { class: 'theme', type: 'button', 'aria-pressed': String(ui.theme() === t.id), dataset: { id: t.id } },
        el('span', { class: 'swatch', style: { background: 'linear-gradient(135deg, ' + t.head + ' 50%, ' + t.bg + ' 50%)' } }), t.name)));
      themes.addEventListener('click', (ev) => {
        const b = ev.target.closest('.theme');
        if (!b) return;
        ui.applyTheme(b.dataset.id);
        themes.querySelectorAll('.theme').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      });

      const space = el('b', { text: '…' });
      const prot = el('b', { text: '…' });
      PT.db.estimate().then((e) => { space.textContent = mb(e.usage); prot.textContent = e.persisted ? 'Sí' : 'No garantizado'; });

      view.append(el('div', { class: 'wrap' },
        el('div', { class: 'sect', text: 'Copia de seguridad' }),
        el('ul', { class: 'rows card' },
          el('li', null, el('button', { class: 'row', type: 'button', onclick: () => ui.exportBackup() }, el('span', { class: 'ico' }, icon('file-export')),
            el('div', { class: 'txt' }, el('b', { text: 'Guardar una copia' }),
              el('span', { text: last ? 'La última fue ' + ago(last) : 'Aún no has hecho ninguna' })))),
          el('li', null, el('button', { class: 'row', type: 'button', onclick: () => restore.click() }, el('span', { class: 'ico' }, icon('file-import')),
            el('div', { class: 'txt' }, el('b', { text: 'Restaurar una copia' }), el('span', { text: 'Desde un archivo de PriceTracker' }))))),
        restore,
        el('p', { class: 'fine', style: { marginTop: '8px' }, text: 'Tus datos viven en este teléfono. Solo se pierden si desinstalas la app o borras sus datos, así que guarda una copia de vez en cuando.' }),
        el('div', { class: 'sect', text: 'Apariencia' }), themes,
        el('div', { class: 'sect', text: 'Lo que tienes guardado' }),
        el('div', { class: 'card' },
          el('div', { class: 'stat' }, el('span', { text: 'Productos' }), el('b', { text: String(st.products.length) })),
          el('div', { class: 'stat' }, el('span', { text: 'Precios registrados' }), el('b', { text: String(st.products.reduce((n, p) => n + p.entries.length, 0)) })),
          el('div', { class: 'stat' }, el('span', { text: 'Fotos' }), el('b', { text: String(st.thumbs.size) })),
          el('div', { class: 'stat' }, el('span', { text: 'Espacio que ocupa' }), space),
          el('div', { class: 'stat' }, el('span', { text: 'Protegido contra limpieza automática' }), prot)),
        el('p', { class: 'fine', style: { marginTop: '8px' }, text: 'No hay un tope de productos ni de fotos: solo cuenta el espacio libre del teléfono.' }),
        el('p', { class: 'fine', style: { margin: '22px 0 0', textAlign: 'center' }, text: 'PriceTracker ' + PT.VERSION })));
    },
    refresh() { const v = ui.viewEl(); const t = document.querySelector('.top'); clear(t); clear(v); this.mount(t, v); }
  };
})(window);
