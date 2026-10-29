// Personaliza el proyecto Android que crea Capacitor:
//  - número de versión (para que cada APK nuevo se pueda instalar encima del anterior)
//  - icono y pantalla de carga de PriceTracker
// Lo ejecuta scripts/build-apk.sh automáticamente. No hace falta tocarlo.

import fs from 'node:fs';
import path from 'node:path';

const RES = 'android/app/src/main/res';
const GRADLE = 'android/app/build.gradle';

function fallar(mensaje) {
  console.error('ERROR en personalizar-android: ' + mensaje);
  process.exit(1);
}

// 1) Número de versión
const versionCode = process.env.VERSION_CODE || '1';
const versionName = process.env.VERSION_NAME || '1.0';
let gradle = fs.readFileSync(GRADLE, 'utf8');
if (!/versionCode \d+/.test(gradle) || !/versionName "[^"]*"/.test(gradle)) {
  fallar('no encontré versionCode/versionName en ' + GRADLE);
}
gradle = gradle.replace(/versionCode \d+/, `versionCode ${versionCode}`);
gradle = gradle.replace(/versionName "[^"]*"/, `versionName "${versionName}"`);
fs.writeFileSync(GRADLE, gradle);
console.log(`Versión: ${versionName} (código ${versionCode})`);

// 2) Quitar las pantallas de carga de ejemplo de Capacitor (son .png) para usar la nuestra (splash.xml)
function borrarSplash(dir) {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) borrarSplash(ruta);
    else if (entrada.name === 'splash.png') fs.rmSync(ruta);
  }
}
borrarSplash(RES);

// 3) Copiar nuestros iconos y pantalla de carga encima de los de ejemplo
fs.cpSync('android-assets/res', RES, { recursive: true, force: true });

// 4) Pantalla de carga de Android 12+ (mismo fondo gris e icono de la tienda)
const estilos = path.join(RES, 'values/styles.xml');
let xml = fs.readFileSync(estilos, 'utf8');
const marca = '<item name="android:background">@drawable/splash</item>';
if (!xml.includes(marca)) fallar('no encontré el estilo de la pantalla de carga en styles.xml');
xml = xml.replace(
  marca,
  marca +
    '\n        <item name="windowSplashScreenBackground">#F5F5F5</item>' +
    '\n        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>',
);
fs.writeFileSync(estilos, xml);

console.log('Icono y pantalla de carga listos.');
