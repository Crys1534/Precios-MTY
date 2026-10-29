/* native.js - lo que solo existe dentro de la app de Android (APK):
   barras del sistema, botón "atrás", y guardar/compartir archivos.
   En el navegador todo esto se ignora o usa su versión web. */
(function (global) {
  'use strict';
  const PT = (global.PT = global.PT || {});

  const cap = () => global.Capacitor;
  const isNative = () => { const c = cap(); return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform()); };
  const call = (plugin, method, opts) => cap().nativePromise(plugin, method, opts || {});

  // Iconos claros u oscuros en la barra de estado y la de navegación
  function setBars(theme) {
    if (!isNative()) return;
    try {
      // Con WebView 140 o mayor la app se dibuja debajo de las barras (pantalla completa)
      const m = /Chrome\/(\d+)/.exec(navigator.userAgent);
      const full = !!m && parseInt(m[1], 10) >= 140;
      const status = full ? 'DARK' : 'DEFAULT';              // encabezado de color: iconos claros
      const nav = full ? (theme === 'dark' ? 'DARK' : 'LIGHT') : 'DEFAULT';
      call('SystemBars', 'setStyle', { style: status, bar: 'StatusBar' }).catch(() => {});
      call('SystemBars', 'setStyle', { style: nav, bar: 'NavigationBar' }).catch(() => {});
    } catch (e) { /* no pasa nada */ }
  }

  // Botón "atrás" de Android: sin esto, en la pantalla principal no haría nada
  function onBack(handler) {
    if (!isNative()) return false;
    try { cap().nativeCallback('App', 'addListener', { eventName: 'backButton' }, handler); return true; }
    catch (e) { return false; }
  }
  function minimize() {
    if (isNative()) call('App', 'minimizeApp').catch(() => {});
  }

  const CHUNK = 1500000; // ~1.5 MB por envío, así una copia con cientos de fotos no revienta la memoria

  // Guarda un archivo de texto armado por partes y lo comparte / descarga.
  // produce(emit) debe llamar `await emit(texto)` varias veces.
  async function saveShare(filename, produce, title, mime) {
    if (isNative()) {
      let uri = null, started = false, buf = [], size = 0;
      const flush = async () => {
        if (!size) return;
        const data = buf.join(''); buf = []; size = 0;
        const o = { path: filename, data, directory: 'CACHE', encoding: 'utf8' };
        if (!started) { const r = await call('Filesystem', 'writeFile', o); uri = r.uri; started = true; }
        else await call('Filesystem', 'appendFile', o);
      };
      await produce(async (s) => { buf.push(s); size += s.length; if (size >= CHUNK) await flush(); });
      await flush();
      try {
        await call('Share', 'share', { title, files: [uri], dialogTitle: title });
        return 'shared';
      } catch (err) {
        if (/cancel/i.test(String((err && err.message) || err))) return 'cancelled';
        throw err;
      }
    }
    const parts = [];
    await produce(async (s) => { parts.push(s); });
    const blob = new Blob(parts, { type: mime || 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    return 'downloaded';
  }

  PT.native = { isNative, call, setBars, onBack, minimize, saveShare };
})(window);
