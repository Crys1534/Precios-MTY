#!/usr/bin/env bash
# Crea el APK de PriceTracker (archivo instalable para Android).
#
# Lo usa GitHub automáticamente (ver .github/workflows/crear-apk.yml), así que
# normalmente NO necesitas ejecutarlo tú. Si lo ejecutas en una computadora
# necesitas Node 22, Java 21 y el Android SDK (variable ANDROID_HOME).
#
# Resultado: salida/PriceTracker.apk
set -euo pipefail
cd "$(dirname "$0")/.."

APK="PriceTracker.apk"

# Llave de firma. Es siempre la misma para que cada APK nuevo se pueda instalar
# encima del anterior sin perder tus datos.
LLAVE="android-assets/firma/crys1534.keystore"
LLAVE_ALIAS="crys1534"
LLAVE_CLAVE="crys1534apk"

paso() { echo; echo "=== $1 ==="; }

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
[ -n "$SDK" ] && [ -d "$SDK" ] || { echo "ERROR: no encuentro el Android SDK (variable ANDROID_HOME)"; exit 1; }

paso "1/6 Copiando los archivos de la app"
rm -rf www salida
mkdir www salida
cp index.html manifest.json sw.js www/
cp -r css js images vendor www/

paso "2/6 Instalando Capacitor"
npm ci --no-audit --no-fund

paso "3/6 Creando el proyecto Android"
rm -rf android
npx cap add android
node scripts/personalizar-android.mjs
npx cap sync android

paso "4/6 Compilando la app"
(cd android && ./gradlew --no-daemon assembleRelease)

paso "5/6 Firmando el APK"
SIN_FIRMAR="android/app/build/outputs/apk/release/app-release-unsigned.apk"
[ -f "$SIN_FIRMAR" ] || { echo "ERROR: no se generó $SIN_FIRMAR"; exit 1; }
HERRAMIENTAS="$(ls -d "$SDK"/build-tools/* | sort -V | tail -n 1)"
"$HERRAMIENTAS/zipalign" -p -f 4 "$SIN_FIRMAR" salida/alineado.apk
"$HERRAMIENTAS/apksigner" sign \
  --ks "$LLAVE" --ks-key-alias "$LLAVE_ALIAS" \
  --ks-pass "pass:$LLAVE_CLAVE" --key-pass "pass:$LLAVE_CLAVE" \
  --out "salida/$APK" salida/alineado.apk
rm -f salida/alineado.apk salida/*.idsig

paso "6/6 Comprobando la firma"
"$HERRAMIENTAS/apksigner" verify --verbose "salida/$APK" | head -n 6

echo
echo "LISTO: salida/$APK ($(du -h "salida/$APK" | cut -f1))"
