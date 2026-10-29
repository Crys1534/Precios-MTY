/* ui-form.js - formulario para agregar productos, agregar precios, corregir registros y editar productos */
(function (global) {
  'use strict';
  const PT = (global.PT = global.PT || {});
  const ui = PT.ui;
  const { el, icon, clear, uid, money, num, parseNum, UNITS, safeUnit } = PT.u;
  const calc = PT.calc;
  const state = () => PT.state;
  const byId = (id) => state().products.find((p) => p.id === id);

  const two = (n) => String(n).padStart(2, '0');
  const dayText = (d) => d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate());

  // Registra la tienda si es nueva y devuelve el nombre "oficial" (así Sam's y Sam’s son la misma)
  function canonStore(name) {
    const key = calc.skey(name);
    let rec = state().stores.get(key);
    if (!rec) { rec = { key, name: name.trim(), logo: null }; PT.db.saveStore(rec); }
    return rec.name;
  }

  /* cfg: { mode:'new'|'price'|'entry'|'product', product?, entry?, name? } */
  function openForm(cfg) {
    const mode = cfg.mode;
    const p = cfg.product || null;
    const e = cfg.entry || null;
    const last = p ? calc.entriesDesc(p)[0] : null;
    const base = e || last || null;                 // de dónde se copian los valores iniciales
    const hasName = mode === 'new' || mode === 'product';
    const hasPhoto = hasName;
    const hasPrice = mode !== 'product';
    const fid = 'f' + uid();

    // Estado de la foto: nueva (aún sin guardar), quitada o la que ya tenía
    const photo = { pending: null, removed: false, url: null };

    const f = {};   // campos
    const mkField = (label, input, hint, id) => el('div', { class: 'field' }, el('label', { for: id, text: label }), input, hint ? el('div', { class: 'hint', text: hint }) : null);
    const id = (n) => fid + n;

    if (hasName) {
      f.name = el('input', { id: id('n'), type: 'text', autocomplete: 'off', autocapitalize: 'words', enterkeyhint: 'next', maxlength: 120, placeholder: 'Ej. Pegamento Resistol', value: cfg.name || (p ? p.name : '') });
      f.name.value = cfg.name || (p ? p.name : '');
    }
    if (hasPrice) {
      f.price = el('input', { id: id('p'), type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0.00' });
      f.price.value = e ? String(e.price) : '';
      f.store = el('input', { id: id('s'), type: 'text', list: id('sl'), autocomplete: 'off', autocapitalize: 'words', placeholder: 'Ej. Walmart', maxlength: 80 });
      f.store.value = base ? base.store : '';
      f.qty = el('input', { id: id('q'), type: 'text', inputmode: 'decimal', autocomplete: 'off' });
      f.qty.value = base ? String(base.qty) : '1';
      f.unit = el('select', { id: id('u') }, Object.keys(UNITS).map((k) => el('option', { value: k, text: UNITS[k].name })));
      f.unit.value = base ? safeUnit(base.unit) : 'pza';
      f.addr = el('input', { id: id('a'), type: 'text', autocomplete: 'off', placeholder: 'Calle, número, colonia…', maxlength: 200 });
      f.addr.value = base ? base.addr || '' : '';
      f.date = el('input', { id: id('d'), type: 'date', max: dayText(new Date()) });
      f.date.value = dayText(e ? new Date(e.date) : new Date());
    }

    const storeList = el('datalist', { id: id('sl') });
    const names = new Map();
    state().stores.forEach((s) => names.set(s.key, s.name));
    calc.storeIndex().forEach((s) => names.set(s.key, s.name));
    [...names.values()].sort((a, b) => a.localeCompare(b, 'es')).forEach((n) => storeList.append(el('option', { value: n })));

    const err = el('div', { class: 'err', role: 'alert', hidden: true });
    const showErr = (msg, field) => {
      err.textContent = msg; err.hidden = false;
      if (field) { field.focus(); field.closest('.field').classList.add('bad'); }
    };

    // Vista de la foto: una entrada abre la cámara y otra la galería (en Android una sola no ofrece las dos cosas)
    const photoBox = el('div', { class: 'photo-row' });
    const camInput = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
    const galInput = el('input', { type: 'file', accept: 'image/*', hidden: true });
    function drawPhoto() {
      clear(photoBox);
      let node;
      if (photo.url) node = el('img', { class: 'pic pv', src: photo.url, alt: '' });
      else if (!photo.removed && p && p.image) node = PT.img.node(p.image, p.name, 'pv');
      else node = el('span', { class: 'tile pv', 'aria-hidden': 'true' }, icon('camera'));
      const has = !!photo.url || (!photo.removed && p && p.image);
      photoBox.append(node, el('div', { class: 'btns' },
        el('button', { class: 'btn ghost', type: 'button', onclick: () => camInput.click() }, icon('camera'), has ? 'Tomar otra foto' : 'Tomar foto'),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => galInput.click() }, icon('image'), 'Elegir de la galería'),
        has ? el('button', { class: 'btn ghost', type: 'button', onclick: () => { photo.pending = null; photo.removed = true; if (photo.url) URL.revokeObjectURL(photo.url); photo.url = null; drawPhoto(); } }, 'Quitar foto') : null));
    }
    const onPicked = async (input) => {
      const file = input.files && input.files[0];
      input.value = '';
      if (!file) return;
      try {
        const shrunk = await PT.img.shrink(file);
        if (photo.url) URL.revokeObjectURL(photo.url);
        photo.pending = shrunk; photo.removed = false; photo.url = URL.createObjectURL(shrunk.thumb);
        drawPhoto();
      } catch (ex) { showErr('No pude leer esa imagen. Prueba con otra foto.'); }
    };
    camInput.addEventListener('change', () => onPicked(camInput));
    galInput.addEventListener('change', () => onPicked(galInput));

    // "Equivale a..." en vivo
    const calcBox = el('div', { class: 'calc', hidden: true });
    function liveCalc() {
      if (!hasPrice) return;
      const price = parseNum(f.price.value), qty = parseNum(f.qty.value);
      const u = UNITS[safeUnit(f.unit.value)];
      if (!(price > 0) || !(qty > 0)) { calcBox.hidden = true; return; }
      const per = price / (qty * u.f);
      clear(calcBox);
      if (Math.abs(per - price) >= 0.005) calcBox.append('Equivale a ', el('strong', { text: money(per) }), ' por ' + u.base);
      // Aviso si el precio por kilo/litro/pieza se aleja mucho de lo que ya había (típico error de dedo o de unidad)
      if (p) {
        const prev = p.entries.filter((x) => x !== e && calc.dimOf(x) === u.dim).map(calc.unitPrice).sort((a, b) => a - b);
        if (prev.length) {
          const med = prev[Math.floor(prev.length / 2)], r = per / med;
          if (r > 4 || r < 0.25) calcBox.append(el('div', { class: 'warn', text: 'Ojo: antes salía en unos ' + money(med) + ' por ' + u.base + '. Revisa el precio y la cantidad.' }));
        }
      }
      calcBox.hidden = !calcBox.firstChild;
    }

    const form = el('form', { id: fid, novalidate: true, autocomplete: 'off' });
    if (p && mode !== 'new') {
      form.append(el('div', { class: 'photo-row', style: { marginBottom: '16px' } },
        PT.img.node(p.image, p.name, 'sq'), el('div', null, el('div', { style: { fontWeight: 700 }, text: p.name }),
          el('div', { class: 'fine', text: mode === 'entry' ? 'Corrige este registro' : mode === 'price' ? 'Nuevo precio' : '' }))));
    }
    if (hasName && mode === 'new') {
      const dl = el('datalist', { id: id('nl') });
      state().products.forEach((x) => dl.append(el('option', { value: x.name })));
      f.name.setAttribute('list', id('nl'));
      form.append(mkField('Producto', f.name, null, id('n')), dl);
    } else if (hasName) {
      form.append(mkField('Nombre del producto', f.name, null, id('n')));
    }
    if (hasPhoto) { drawPhoto(); form.append(el('div', { class: 'field' }, el('span', { class: 'lbl', text: 'Foto (opcional)' }), photoBox, camInput, galInput)); }
    if (hasPrice) {
      form.append(
        el('div', { class: 'pair' }, mkField('Precio ($)', f.price, null, id('p')), mkField('Tienda', f.store, null, id('s'))), storeList,
        el('div', { class: 'pair' }, mkField('Cantidad o tamaño', f.qty, null, id('q')), mkField('Unidad', f.unit, null, id('u'))),
        calcBox,
        mkField('Sucursal o dirección (opcional)', f.addr, 'Sirve para abrir la ubicación en Maps.', id('a')),
        mkField('Fecha', f.date, null, id('d')));
      ['input', 'change'].forEach((t) => [f.price, f.qty, f.unit].forEach((x) => x.addEventListener(t, liveCalc)));
      liveCalc();
    }
    form.append(err);

    // Borrar un registro (solo al corregir, y solo si no es el único)
    if (mode === 'entry' && p.entries.length > 1) {
      form.append(el('button', { class: 'btn danger block', type: 'button', onclick: () => removeEntry() }, icon('trash'), 'Borrar este registro'));
    }

    const titles = { new: 'Nuevo producto', price: 'Agregar precio', entry: 'Corregir registro', product: 'Editar producto' };
    const saveText = { new: 'Guardar producto', price: 'Guardar precio', entry: 'Guardar cambios', product: 'Guardar cambios' };
    const handle = ui.openSheet({
      title: titles[mode], closeIcon: 'xmark', foot: true,
      focus: mode === 'price' ? '#' + id('p') : mode === 'new' ? '#' + id('n') : null,
      onClose: () => { if (photo.url) URL.revokeObjectURL(photo.url); },
      build: (h) => {
        h.body.append(form);
        h.foot.append(el('button', { class: 'btn grow', type: 'submit', form: fid, text: saveText[mode] }));
      }
    });

    function removeEntry() {
      const i = p.entries.indexOf(e);
      if (i < 0) return;
      p.entries.splice(i, 1);
      PT.db.saveProduct(p).then(() => {
        handle.close();
        ui.changed();
        ui.toast('Registro borrado', { action: 'Deshacer', onAction: () => { p.entries.splice(Math.min(i, p.entries.length), 0, e); PT.db.saveProduct(p).then(() => ui.changed()); } });
      });
    }

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      err.hidden = true;
      form.querySelectorAll('.bad').forEach((x) => x.classList.remove('bad'));
      const btn = handle.foot.querySelector('button');

      const name = hasName ? f.name.value.trim() : p.name;
      if (hasName && !name) return showErr('Escribe el nombre del producto.', f.name);
      if (hasName && mode === 'product' && calc.findByName(name, p.id)) return showErr('Ya tienes otro producto con ese nombre.', f.name);
      let entry = null;
      if (hasPrice) {
        const price = parseNum(f.price.value), qty = parseNum(f.qty.value), store = f.store.value.trim();
        if (!(price > 0)) return showErr('Escribe un precio mayor a cero.', f.price);
        if (!store) return showErr('Escribe en qué tienda lo viste.', f.store);
        if (!(qty > 0)) return showErr('La cantidad debe ser mayor a cero.', f.qty);
        const d = f.date.value ? new Date(f.date.value + 'T12:00:00') : new Date();
        const sameDay = e && dayText(new Date(e.date)) === f.date.value;
        const today = dayText(new Date()) === f.date.value;
        entry = { id: e ? e.id : uid(), price, qty, unit: safeUnit(f.unit.value), store: canonStore(store), addr: f.addr.value.trim(),
          date: sameDay ? e.date : today ? new Date().toISOString() : d.toISOString() };
      }

      btn.disabled = true;
      try {
        // Foto
        let image = p ? p.image || null : null;
        if (photo.removed) image = null;
        if (photo.pending) {
          const pid = 'p' + uid();
          await PT.db.putPhoto(pid, photo.pending.full, photo.pending.thumb);
          image = { t: 'blob', id: pid };
        }

        let toast = 'Guardado';
        if (mode === 'new') {
          const dup = calc.findByName(name);
          if (dup) {
            dup.entries.push(entry);
            if (!dup.image && image) dup.image = image;
            await PT.db.saveProduct(dup);
            toast = 'Ya tenías «' + dup.name + '»: agregué este precio ahí.';
          } else {
            const now = new Date().toISOString();
            await PT.db.saveProduct({ id: uid(), name, image, entries: [entry], createdAt: now, updatedAt: now });
            toast = '«' + name + '» guardado';
          }
        } else if (mode === 'price') {
          p.entries.push(entry);
          await PT.db.saveProduct(p);
          toast = 'Precio guardado';
        } else if (mode === 'entry') {
          Object.assign(e, entry);
          await PT.db.saveProduct(p);
          toast = 'Registro corregido';
        } else {
          p.name = name; p.image = image;
          await PT.db.saveProduct(p);
        }
        handle.close();
        ui.changed();
        ui.toast(toast);
      } catch (ex) {
        console.error(ex);
        btn.disabled = false;
        showErr('No se pudo guardar. Revisa que haya espacio en el teléfono e intenta de nuevo.');
      }
    });
    return handle;
  }

  ui.form = {
    openNew(name) { return openForm({ mode: 'new', name: name || '' }); },
    openPrice(id) { const p = byId(id); if (p) openForm({ mode: 'price', product: p }); },
    openProduct(id) { const p = byId(id); if (p) openForm({ mode: 'product', product: p }); },
    openEntry(id, entryId) {
      const p = byId(id);
      const e = p && p.entries.find((x) => x.id === entryId);
      if (p && e) openForm({ mode: 'entry', product: p, entry: e });
    }
  };
})(window);
