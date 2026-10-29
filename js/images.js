/* images.js - fotos y logos.
   Las fotos se guardan como archivos (blobs) dentro de IndexedDB, ya reducidas:
   una grande (máx. 900 px) y una miniatura (máx. 320 px) para las listas. */
(function (global) {
  'use strict';
  const PT = (global.PT = global.PT || {});
  const { el, icon, uid } = PT.u;

  function dataUrlToBlob(dataUrl) {
    const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
    if (!m) throw new Error('Imagen no válida');
    const type = m[1] || 'application/octet-stream';
    const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type });
  }

  function blobToDataUrl(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
  }

  async function decode(blob) {
    if (global.createImageBitmap) {
      try { return await createImageBitmap(blob); } catch (e) { /* se prueba el otro camino */ }
    }
    const url = URL.createObjectURL(blob);
    try {
      return await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('No se pudo leer la imagen'));
        im.src = url;
      });
    } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
  }

  const toBlob = (canvas, type, q) => new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo procesar la imagen'))), type, q));

  async function resize(bitmap, max, type, q) {
    const w0 = bitmap.width, h0 = bitmap.height;
    const s = Math.min(1, max / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * s)), h = Math.max(1, Math.round(h0 * s));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (type === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);
    return toBlob(c, type, q);
  }

  // Archivos de la carpeta images/ que son SVG pero tienen otra extensión (ej. soriana.png)
  const svgCache = new Map();
  function sniffSvg(name) {
    if (!svgCache.has(name)) {
      svgCache.set(name, fetch('images/' + encodeURIComponent(name))
        .then((r) => (r.ok ? r.blob() : null))
        .then(async (b) => {
          if (!b) return null;
          const head = await b.slice(0, 300).text();
          return /<svg[\s>]/i.test(head) || /^\s*<\?xml/i.test(head) ? URL.createObjectURL(new Blob([b], { type: 'image/svg+xml' })) : null;
        })
        .catch(() => null));
    }
    return svgCache.get(name);
  }

  const PHOTO = { max: 900, thumb: 320, type: 'image/jpeg', q: 0.8, tq: 0.7 };
  const LOGO = { max: 256, thumb: 128, type: 'image/png', q: 0.92, tq: 0.92 };

  const img = (PT.img = {
    PHOTO, LOGO, dataUrlToBlob, blobToDataUrl,

    // Reduce una imagen (archivo o blob) -> {full, thumb}
    async shrink(source, kind) {
      const o = kind || PHOTO;
      const bmp = await decode(source);
      try {
        const full = await resize(bmp, o.max, o.type, o.q);
        const thumb = await resize(bmp, o.thumb, o.type, o.tq);
        return { full, thumb };
      } finally { if (bmp.close) bmp.close(); }
    },

    // Reduce y guarda; devuelve la referencia {t:'blob', id}
    async store(source, kind) {
      const { full, thumb } = await img.shrink(source, kind);
      const id = 'p' + uid();
      await PT.db.putPhoto(id, full, thumb);
      return { t: 'blob', id };
    },

    // Para fotos que ya vienen reducidas (copias de seguridad): se guardan tal cual y solo se crea la miniatura
    async ingest(source, kind) {
      const o = kind || PHOTO;
      const bmp = await decode(source);
      try {
        const small = Math.max(bmp.width, bmp.height) <= o.max * 1.15 && /^image\/(jpeg|png)$/.test(source.type);
        const full = small ? source : await resize(bmp, o.max, o.type, o.q);
        const thumb = await resize(bmp, o.thumb, o.type, o.tq);
        const id = 'p' + uid();
        await PT.db.putPhoto(id, full, thumb);
        return { t: 'blob', id };
      } finally { if (bmp.close) bmp.close(); }
    },

    // Dirección para mostrar en <img>, sin esperar (miniatura si es foto guardada)
    src(ref) {
      if (!ref) return null;
      if (ref.t === 'blob') return PT.state.thumbs.get(ref.id) || null;
      if (ref.t === 'file') return 'images/' + encodeURIComponent(ref.name);
      if (ref.t === 'url') return ref.url;
      return null;
    },

    // Foto grande (para el detalle). Devuelve {src, revoke}
    async full(ref) {
      if (ref && ref.t === 'blob') {
        const b = await PT.db.getPhoto(ref.id);
        if (!b) return null;
        const u = URL.createObjectURL(b);
        return { src: u, revoke: () => URL.revokeObjectURL(u) };
      }
      const s = img.src(ref);
      return s ? { src: s, revoke() {} } : null;
    },

    // Cuadro con la foto; si no hay foto o falla, muestra la inicial del nombre
    node(ref, name, cls, big) {
      const letter = (Array.from(String(name || '?').trim())[0] || '?').toUpperCase();
      const tile = () => el('span', { class: 'tile ' + (cls || ''), 'aria-hidden': 'true' }, big ? icon('basket-shopping') : letter);
      const s = img.src(ref);
      if (!s) return tile();
      const im = el('img', { class: 'pic ' + (cls || ''), src: s, alt: '', loading: 'lazy', decoding: 'async' });
      im.addEventListener('error', async () => {
        // Un logo .png que en realidad es un SVG no se ve; se detecta y se muestra bien
        if (ref && ref.t === 'file' && !im.dataset.sniffed) {
          im.dataset.sniffed = '1';
          const u = await sniffSvg(ref.name);
          if (u) { im.src = u; return; }
        }
        if (im.parentNode) im.replaceWith(tile());
      });
      return im;
    }
  });
})(window);
