/* ui-products.js - pantalla de Productos (lista) y hoja de detalle de un producto */
(function (global) {
  'use strict';
  const PT = (global.PT = global.PT || {});
  const ui = PT.ui;
  const { el, icon, clear, money, num, date, dateShort, ago, norm } = PT.u;
  const calc = PT.calc;

  const store = () => PT.state;
  const byId = (id) => store().products.find((p) => p.id === id);
  const lsGet = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* nada */ } };

  // ---------- Lista ----------
  let query = '';
  let sort = lsGet('priceSort', 'recent');
  let listBox, countEl, bannerBox, chipsBox, input;
  let renderToken = 0;

  function trendNode(t) {
    if (!t || t.dir === 'same') return null;
    const pct = Math.abs(Math.round(t.pct));
    return el('span', { class: 'trend ' + t.dir, 'aria-label': (t.dir === 'down' ? 'Bajó ' : 'Subió ') + pct + ' por ciento' },
      icon(t.dir === 'down' ? 'arrow-down' : 'arrow-up'), pct + ' %');
  }

  function productRow(p) {
    const s = calc.summarize(p);
    const last = s.latest;
    const best = s.rows.find((r) => r.cheapest);
    const bestElsewhere = best && best.key !== calc.skey(last.store);
    return el('button', { class: 'prod', type: 'button', dataset: { id: p.id } },
      PT.img.node(p.image, p.name, 'sq'),
      el('div', { class: 'mid' },
        el('div', { class: 'name', text: p.name }),
        el('div', { class: 'meta', text: last.store + ' · ' + num(last.qty) + ' ' + last.unit + ' · ' + ago(last.date) }),
        bestElsewhere ? el('div', { class: 'best' }, icon('circle-check'), 'Más barato en ' + best.name) : null),
      el('div', { class: 'end' },
        el('div', { class: 'price', text: money(last.price) }),
        trendNode(s.trend),
        s.spark ? PT.chart.spark(s.spark) : null));
  }

  function backupBanner() {
    clear(bannerBox);
    const st = store();
    if (st.migrationError) {
      bannerBox.append(el('div', { class: 'banner', role: 'alert' }, icon('triangle-exclamation'),
        el('span', { text: 'No pude traer tus datos de la versión anterior. No se borró nada; avísale a Claude.' })));
      return;
    }
    if (st.products.length < 3) return;
    const snooze = +PT.db.getMeta('bannerSnooze') || 0;
    if (Date.now() < snooze) return;
    const last = PT.db.getMeta('lastBackup');
    const days = last ? Math.floor((Date.now() - new Date(last)) / 86400000) : null;
    if (last && days < 30) return;
    bannerBox.append(el('div', { class: 'banner' }, icon('shield-halved'),
      el('span', { text: last ? 'Tu última copia de seguridad fue hace ' + days + ' días.' : 'Aún no has guardado una copia de seguridad.' }),
      el('div', { class: 'acts' },
        el('button', { type: 'button', text: 'Guardar copia', onclick: () => ui.exportBackup() }),
        el('button', { type: 'button', 'aria-label': 'Recordármelo después', text: 'Luego', onclick: () => { PT.db.setMeta('bannerSnooze', Date.now() + 7 * 86400000); backupBanner(); } }))));
  }

  function refreshList() {
    const all = store().products;
    renderToken++;
    clear(listBox);
    countEl.textContent = all.length ? PT.u.plural(all.length, 'producto', 'productos') : '';
    chipsBox.hidden = !all.length;
    if (!all.length) {
      listBox.append(el('div', { class: 'empty' },
        el('div', { class: 'big' }, icon('basket-shopping')),
        el('h2', { text: 'Aquí vivirán tus precios' }),
        el('p', { text: 'Anota lo que pagas en cada tienda y la app te dice dónde sale más barato.' }),
        el('button', { class: 'btn', type: 'button', onclick: () => ui.form.openNew() }, icon('plus'), 'Agregar el primero')));
      return;
    }
    const found = calc.sortProducts(all.filter((p) => calc.matches(p, query)), sort);
    if (!found.length) {
      const q = query.trim();
      listBox.append(el('div', { class: 'empty' },
        el('div', { class: 'big' }, icon('magnifying-glass')),
        el('h2', { text: 'Nada con «' + q + '»' }),
        el('p', { text: 'Revisa cómo está escrito o agrégalo como producto nuevo.' }),
        el('button', { class: 'btn', type: 'button', onclick: () => ui.form.openNew(q) }, icon('plus'), 'Agregar «' + q + '»')));
      return;
    }
    // Con listas largas se dibuja en tandas, para que la pantalla aparezca de inmediato
    const list = el('div', { class: 'list' });
    listBox.append(list);
    const mine = ++renderToken;
    const v = ui.viewEl();
    let i = 0;
    let quota = Math.max(40, Math.ceil(((v ? v.scrollTop + v.clientHeight * 2 : 0)) / 86));
    const step = () => {
      if (mine !== renderToken) return;
      const end = Math.min(found.length, i + quota);
      const frag = document.createDocumentFragment();
      for (; i < end; i++) frag.append(productRow(found[i]));
      list.append(frag);
      quota = 60;
      if (i < found.length) requestAnimationFrame(step);
    };
    step();
  }

  ui.views.products = {
    mount(top, view) {
      input = el('input', { type: 'search', placeholder: 'Buscar producto o tienda', 'aria-label': 'Buscar producto o tienda', autocomplete: 'off', enterkeyhint: 'search', value: query });
      input.value = query;
      const clearBtn = el('button', { class: 'clear', type: 'button', 'aria-label': 'Borrar búsqueda', hidden: !query }, icon('xmark'));
      const apply = PT.u.debounce(() => { query = input.value; refreshList(); }, 120);
      input.addEventListener('input', () => { clearBtn.hidden = !input.value; apply(); });
      clearBtn.addEventListener('click', () => { input.value = ''; clearBtn.hidden = true; query = ''; refreshList(); input.focus(); });
      countEl = el('span', { class: 'sub' });
      top.append(
        el('div', { class: 'top-row' }, el('h1', { text: 'Productos' }), countEl),
        el('label', { class: 'search' }, icon('magnifying-glass'), el('span', { class: 'sr', text: 'Buscar' }), input, clearBtn));

      bannerBox = el('div');
      listBox = el('div');
      const mk = (id, label) => el('button', { class: 'chip', type: 'button', 'aria-pressed': String(sort === id), text: label, onclick: (ev) => {
        sort = id; lsSet('priceSort', id);
        chipsBox.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === ev.currentTarget)));
        refreshList();
      } });
      chipsBox = el('div', { class: 'chips' }, el('span', { class: 'count', text: 'Ordenar por' }), mk('recent', 'Recientes'), mk('az', 'A–Z'));
      listBox.addEventListener('click', (ev) => {
        const b = ev.target.closest('.prod');
        if (b) ui.detail.open(b.dataset.id);
      });
      view.append(el('div', { class: 'wrap' }, bannerBox, chipsBox, listBox));
      backupBanner();
      refreshList();
    },
    refresh() { backupBanner(); refreshList(); }
  };

  // ---------- Detalle ----------
  function mapsUrl(e) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(e.addr + ', ' + e.store);
  }

  function removeProduct(id, handle) {
    const p = byId(id);
    if (!p) return;
    PT.db.removeProduct(p).then(() => {
      handle.close();
      ui.changed();
      ui.toast('Se borró «' + p.name + '»', { action: 'Deshacer', onAction: () => PT.db.saveProduct(p).then(() => ui.changed()) });
    }).catch(() => ui.toast('No se pudo borrar. Intenta de nuevo.'));
  }

  function open(id) {
    if (!byId(id)) return;
    let photoKey = null, photoNode = null, revoke = null;
    const handle = ui.openSheet({
      title: byId(id).name,
      foot: true,
      actions: [
        { icon: 'pen', label: 'Editar producto', onClick: () => ui.form.openProduct(id) },
        { icon: 'trash', label: 'Borrar producto', onClick: () => removeProduct(id, handle) }
      ],
      refresh: (h) => render(h),
      onClose: () => { if (revoke) revoke(); },
      build: (h) => {
        h.foot.append(el('button', { class: 'btn grow', type: 'button', onclick: () => ui.form.openPrice(id) }, icon('plus'), 'Agregar precio'));
        render(h);
      }
    });

    function render(h) {
      const p = byId(id);
      if (!p) { h.close(); return; }
      h.setTitle(p.name);
      const s = calc.summarize(p);
      const last = s.latest;
      const body = h.body;
      clear(body);

      // Foto
      const key = JSON.stringify(p.image || null);
      if (key !== photoKey) {
        photoKey = key;
        if (revoke) { revoke(); revoke = null; }
        photoNode = null;
        if (p.image) {
          photoNode = el('div', { class: 'sec', style: { marginTop: 0 } }, PT.img.node(p.image, p.name, 'hero', true));
          PT.img.full(p.image).then((f) => {
            if (!f) return;
            if (photoKey !== key) { f.revoke(); return; }
            revoke = f.revoke;
            const im = photoNode && photoNode.querySelector('img');
            if (im) im.src = f.src;
          });
        }
      }
      if (photoNode) body.append(photoNode);

      // Precio actual
      const per = calc.unitPrice(last);
      const sameAsPrice = Math.abs(per - last.price) < 0.005;
      const head = el('div', { class: 'sec', style: { marginTop: photoNode ? '' : '0' } },
        el('div', { class: 'd-price', text: money(last.price) }),
        el('div', { class: 'd-sub' }, el('strong', { text: last.store }), ' · ' + num(last.qty) + ' ' + last.unit + ' · ' + ago(last.date)),
        sameAsPrice ? null : el('div', { class: 'd-sub', text: 'Sale en ' + money(per) + ' por ' + s.base }));
      if (s.trend && s.trend.dir !== 'same') {
        const t = s.trend;
        head.append(el('div', { class: 'trend ' + t.dir, style: { marginTop: '6px' } },
          icon(t.dir === 'down' ? 'arrow-down' : 'arrow-up'),
          (t.dir === 'down' ? 'Bajó ' : 'Subió ') + Math.abs(Math.round(t.pct)) + ' % desde el ' + dateShort(t.prev.date) + ' (antes ' + money(t.prev.price) + ')'));
      }
      body.append(head);

      // Comparación entre tiendas
      if (s.rows.length > 1) {
        const ul = el('ul', { class: 'cmp card' });
        s.rows.forEach((r) => {
          ul.append(el('li', null,
            PT.img.node(calc.storeLogo(r.name), r.name, 'rd sm'),
            el('div', { class: 'who' }, el('b', { text: r.name }),
              el('span', { text: money(r.entry.price) + ' · ' + num(r.entry.qty) + ' ' + r.entry.unit + ' · ' + ago(r.entry.date) })),
            el('div', { class: 'amt' }, el('b', { text: money(r.unit) + ' / ' + s.base }),
              r.cheapest ? el('span', { class: 'tag good' }, icon('circle-check'), 'Más barato')
                : el('span', { class: 'tag more', text: r.pct > 0 ? '+' + r.pct + ' %' : 'Igual' }))));
        });
        body.append(el('section', { class: 'sec' }, el('h3', { text: 'Dónde sale más barato' }),
          el('p', { class: 'cap', text: 'Último precio de cada tienda, comparado por ' + s.base + '.' }), ul));
      }

      // Gráfica
      const canPlot = s.series.some((x) => x.points.length > 1);
      const capText = (s.metric === 'price' ? 'Lo que pagaste en cada compra.' : 'Precio por ' + s.base + ', para comparar tamaños distintos.')
        + (s.hiddenStores ? ' Se muestran las ' + PT.calc.COLOR_SLOTS + ' tiendas con más registros.' : '');
      body.append(el('section', { class: 'sec' }, el('h3', { text: 'Historial de precios' }), el('p', { class: 'cap', text: canPlot ? capText : '' }),
        el('div', { class: 'card' }, canPlot
          ? PT.chart.line(s.series, { label: 'Gráfica del historial de precios de ' + p.name })
          : el('div', { class: 'note', text: 'Agrega otro precio de la misma tienda para ver cómo cambia con el tiempo.' }))));

      // Registros (tabla)
      const recs = el('ul', { class: 'recs card' });
      s.desc.forEach((e) => {
        recs.append(el('li', null, el('button', { class: 'rec', type: 'button', dataset: { entry: e.id }, 'aria-label': 'Corregir el registro de ' + money(e.price) + ' en ' + e.store },
          el('span', { class: 'p', text: money(e.price) }),
          el('span', { class: 'd', text: date(e.date) }),
          el('span', { class: 's', text: e.store + ' · ' + num(e.qty) + ' ' + e.unit }))));
      });
      recs.addEventListener('click', (ev) => {
        const b = ev.target.closest('.rec');
        if (b) ui.form.openEntry(id, b.dataset.entry);
      });
      body.append(el('section', { class: 'sec' }, el('h3', { text: 'Registros' }), el('p', { class: 'cap', text: 'Toca uno para corregirlo.' }), recs));

      // Ubicación
      if (last.addr) {
        body.append(el('section', { class: 'sec' }, el('h3', { text: 'Ubicación' }),
          el('div', { class: 'card maprow', style: { marginTop: '8px' } }, icon('location-dot'), el('span', { text: last.addr }),
            el('a', { href: mapsUrl(last), target: '_blank', rel: 'noopener', text: 'Abrir en Maps' }))));
      }
    }
  }

  ui.detail = { open };
})(window);
