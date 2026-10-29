#!/usr/bin/env python3
"""
Genera los iconos de Android a partir de images/icon-512.png.

NO hace falta ejecutarlo para crear el APK: los iconos ya generados viven en
android-assets/res/. Solo se usa si algún día cambias el dibujo del icono.

Uso (necesita Python y la libreria Pillow):
    python scripts/hacer-iconos.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "images" / "icon-512.png"
SALIDA = RAIZ / "android-assets" / "res"

FONDO = (245, 245, 245, 255)  # gris del dibujo original (#F5F5F5)

DENSIDADES = {  # carpeta: (icono normal en px, icono adaptable en px)
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}


def escalar(img, lado):
    return img.resize((lado, lado), Image.LANCZOS)


def icono_cuadrado(base, lado):
    """Icono para Android 7 (esquinas redondeadas)."""
    grande = lado * 4
    img = escalar(base, grande)
    mascara = Image.new("L", (grande, grande), 0)
    ImageDraw.Draw(mascara).rounded_rectangle((0, 0, grande - 1, grande - 1), radius=int(grande * 0.18), fill=255)
    img.putalpha(mascara)
    return img.resize((lado, lado), Image.LANCZOS)


def icono_redondo(base, lado):
    """Version redonda: el dibujo se reduce para que no se corte en el circulo."""
    grande = lado * 4
    lienzo = Image.new("RGBA", (grande, grande), FONDO)
    interior = escalar(base, int(grande * 0.80))
    lienzo.paste(interior, ((grande - interior.width) // 2, (grande - interior.height) // 2))
    mascara = Image.new("L", (grande, grande), 0)
    ImageDraw.Draw(mascara).ellipse((0, 0, grande - 1, grande - 1), fill=255)
    lienzo.putalpha(mascara)
    return lienzo.resize((lado, lado), Image.LANCZOS)


def capa_frontal(base, lado):
    """Capa frontal del icono adaptable: el dibujo ocupa ~62% (zona segura de Android)."""
    grande = lado * 2
    lienzo = Image.new("RGBA", (grande, grande), FONDO)
    interior = escalar(base, int(grande * 0.62))
    lienzo.paste(interior, ((grande - interior.width) // 2, (grande - interior.height) // 2))
    return lienzo.resize((lado, lado), Image.LANCZOS)


def main():
    base = Image.open(ORIGEN).convert("RGBA")
    for dens, (normal, adaptable) in DENSIDADES.items():
        carpeta = SALIDA / f"mipmap-{dens}"
        carpeta.mkdir(parents=True, exist_ok=True)
        icono_cuadrado(base, normal).save(carpeta / "ic_launcher.png", optimize=True)
        icono_redondo(base, normal).save(carpeta / "ic_launcher_round.png", optimize=True)
        capa_frontal(base, adaptable).save(carpeta / "ic_launcher_foreground.png", optimize=True)

    valores = SALIDA / "values"
    valores.mkdir(parents=True, exist_ok=True)
    (valores / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        '    <color name="ic_launcher_background">#F5F5F5</color>\n'
        "</resources>\n",
        encoding="utf-8",
    )

    # Pantalla de carga: fondo gris con el icono en el centro
    dibujable = SALIDA / "drawable"
    dibujable.mkdir(parents=True, exist_ok=True)
    (dibujable / "splash.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<layer-list xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <item>\n'
        '        <color android:color="#F5F5F5" />\n'
        '    </item>\n'
        '    <item android:width="180dp" android:height="180dp" android:gravity="center">\n'
        '        <bitmap android:src="@mipmap/ic_launcher_foreground" android:gravity="fill" />\n'
        '    </item>\n'
        '</layer-list>\n',
        encoding="utf-8",
    )
    print("Iconos generados en", SALIDA)


if __name__ == "__main__":
    main()
