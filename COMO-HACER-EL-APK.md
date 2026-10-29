# Cómo funciona el APK de PriceTracker

Este repositorio es una página web (`index.html` + las carpetas `css/` y `js/`) y, además, se convierte solo en una app de Android (APK).
**No necesitas instalar nada en tu computadora.** GitHub fabrica el APK por ti.

## Primera vez (se hace una sola vez)

GitHub no deja que Claude escriba en la carpeta `.github`, así que ese último archivo se pone a mano:

1. En **GitHub Desktop**: pulsa **Commit to main** y luego **Push origin** (sube todos los archivos nuevos).
2. En el navegador entra a https://github.com/Crys1534/Precios-MTY y pulsa **Add file → Create new file**.
3. En el cuadro del nombre escribe exactamente: `.github/workflows/crear-apk.yml`
   (al escribir cada `/` se crea la carpeta sola).
4. Abre el archivo `crear-apk.yml` que está en tu carpeta de Precios MTY (con Bloc de notas o Notepad++),
   copia **todo** su contenido y pégalo en el cuadro grande de GitHub.
5. Pulsa **Commit changes...** y confirma con **Commit changes**.
6. Entra a la pestaña **Actions**: verás "Crear APK" trabajando (tarda de 5 a 10 minutos).
   Cuando salga la palomita verde, el APK ya está listo para descargar (ver abajo).

Después de eso, el archivo `crear-apk.yml` de tu carpeta ya no hace falta; puedes dejarlo o borrarlo.

## Cada vez que cambies algo en la app

1. Cambia lo que quieras (la app vive en `index.html`, `css/` y `js/`) y guarda.
2. En **GitHub Desktop**: escribe un título para el cambio, pulsa **Commit to main** y luego **Push origin**.
3. Espera unos 5 minutos. GitHub fabrica el APK nuevo automáticamente.
4. En el celular abre este enlace y descarga el APK:

   **https://github.com/Crys1534/Precios-MTY/releases/latest/download/PriceTracker.apk**

5. Ábrelo para instalarlo. Se instala **encima** de la versión anterior y **conserva tus datos**.

Para ver cómo va la fabricación: en GitHub, pestaña **Actions**. Un círculo amarillo significa "trabajando",
una palomita verde significa "listo" y una X roja significa "falló" (entra al registro y mándaselo a Claude).

También puedes fabricarlo sin cambiar nada: **Actions → Crear APK → Run workflow**.

## Tus datos

- **Al actualizar la app** (instalar el APK nuevo encima), tus datos se quedan y la versión 2.0 trae sola lo que
  tenías guardado en la versión anterior.
- Ahora todo se guarda en una base de datos del teléfono (IndexedDB): **no hay tope** de productos ni de fotos,
  solo cuenta el espacio libre del teléfono.
- Tus datos se pierden únicamente si **desinstalas la app** o **borras sus datos** desde los ajustes de Android.
  Por eso, de vez en cuando: **Ajustes → Guardar una copia** (abre el menú de compartir de Android: Drive, Archivos, WhatsApp...).
  La app te lo recuerda si pasan más de 30 días.
- Para recuperar una copia (o pasar los datos de la versión web a la app): **Ajustes → Restaurar una copia** y elige el archivo.
  Sirve tanto con copias nuevas como con las `.json` que sacabas de la versión anterior.

## Qué hay en cada carpeta (no hace falta tocarlas)

| Archivo / carpeta | Para qué sirve |
| --- | --- |
| `index.html`, `css/`, `js/`, `manifest.json`, `sw.js`, `images/`, `vendor/` | La app en sí (`js/` tiene las piezas: base de datos, gráfica, pantallas...) |
| `capacitor.config.json`, `package.json`, `package-lock.json` | Configuración de Capacitor, la herramienta que convierte la web en app |
| `crear-apk.yml` (y su copia en `.github/workflows/`) | La receta con la que GitHub fabrica el APK |
| `scripts/` | Pasos para compilar y personalizar el APK |
| `android-assets/` | Ícono, pantalla de carga y llave de firma de la app |

## Notas

- Los logos de tiendas que pongas en `images/` entran al APK la próxima vez que se fabrique.
- La llave de firma (`android-assets/firma/`) hace que cada APK nuevo se instale sobre el anterior.
  **No la borres ni la cambies**, porque si cambia, Android obliga a desinstalar la app (y se pierden los datos
  que no hayas exportado). Está en el repositorio a propósito: es práctico para una app personal. Si algún día
  quieres subir la app a Google Play, se cambia por una llave privada.
- Si quieres cambiar el dibujo del ícono: `scripts/hacer-iconos.py` lo regenera (pídeselo a Claude).
