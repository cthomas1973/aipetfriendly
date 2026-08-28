"""
CLI standalone para generar la chapita QR sin levantar el servidor FastAPI:
recibe un texto/URL por linea de comandos y escribe `qr_modelo.stl` y
`qr_modelo.3mf` en el directorio de salida indicado.

Reutiliza el mismo motor de geometria que usa el servicio (`geometry.py` /
`threemf.py`), asi que hereda automaticamente todas las optimizaciones:

  1) QR minimizado: version de QR minima necesaria (empezando en la version 1,
     21x21 modulos) + ERROR_CORRECT_L (~7%, el nivel de correccion mas bajo,
     que maximiza la capacidad de datos por version). El modo de codificacion
     (numerico/alfanumerico/byte) NO se fuerza a mano porque la libreria
     `qrcode` ya segmenta el contenido y usa automaticamente el modo mas
     compacto que aplique a cada tramo del texto.
  2) Modelo 3D: modulos del QR de 0.8mm-1.2mm (configurable, pensado para
     boquillas de 0.4mm), base de 1.2mm-2.0mm de espesor (configurable). El QR
     queda AL RAS/coplanar con la base (mismo plano, sin relieve) para que esa
     cara se pueda imprimir apoyada en la cama sin soportes; la chapita entera
     nunca excede 30mm de lado (se clampea automaticamente si se pide mas).
  3) Salida: un unico Trimesh valido para imprimir (base + QR ya soldados en
     la interfaz, sin cuerpos sueltos) exportado como STL, y un .3mf
     multi-color (un objeto por pieza: base/qr) para slicers con soporte de
     multi-material/cambio de filamento.

Uso:
    python generate_cli.py "https://www.aipetfriendly.ar/m/ABC12345" \
        --width 30 --height 30 --module-size 1.0 --thickness 1.6

Con solo el texto/URL (usa todos los defaults, ya dentro de los rangos
recomendados):
    python generate_cli.py "https://www.aipetfriendly.ar/m/ABC12345"

Instalar dependencias primero (ver requirements.txt):
    pip install -r requirements.txt
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from geometry import MAX_TAG_SIDE_MM, TagColors, TagDimensions, build_tag_meshes, merge_single_color
from threemf import ColoredPart, write_3mf


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Genera qr_modelo.stl y qr_modelo.3mf a partir de un texto/URL.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("data", help="Texto o URL a codificar en el QR (ej. la URL publica de la mascota).")
    parser.add_argument("--width", type=float, default=30.0, help=f"Ancho de la chapita en mm (maximo {MAX_TAG_SIDE_MM}).")
    parser.add_argument("--height", type=float, default=30.0, help=f"Alto de la chapita en mm (maximo {MAX_TAG_SIDE_MM}).")
    parser.add_argument(
        "--module-size", type=float, default=1.0, dest="module_size",
        help="Tamano objetivo de cada modulo del QR en mm (rango recomendado 0.8-1.2).",
    )
    parser.add_argument(
        "--module-size-min", type=float, default=0.8, dest="module_size_min",
        help="Piso absoluto del tamano de modulo en mm (nunca se genera un modulo mas chico).",
    )
    parser.add_argument(
        "--thickness", type=float, default=1.6, dest="thickness",
        help="Grosor de la base en mm (rango recomendado 1.2-2.0).",
    )
    parser.add_argument("--out-dir", default=".", dest="out_dir", help="Directorio donde escribir los archivos.")
    return parser.parse_args(argv)


def generate(
    data: str,
    *,
    width_mm: float = 30.0,
    height_mm: float = 30.0,
    module_size_mm: float = 1.0,
    module_size_min_mm: float = 0.8,
    base_thickness_mm: float = 1.6,
    out_dir: str | Path = ".",
) -> tuple[Path, Path]:
    """Genera los 2 archivos de salida y devuelve sus paths (stl, 3mf)."""
    dims = TagDimensions(
        width_mm=width_mm,
        height_mm=height_mm,
        base_thickness_mm=base_thickness_mm,
        module_size_mm=module_size_mm,
        module_size_min_mm=module_size_min_mm,
    )

    meshes = build_tag_meshes(data, dims=dims)

    out_path = Path(out_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    # --- STL: unico objeto (base + QR ya soldados) ---
    stl_path = out_path / "qr_modelo.stl"
    merged = merge_single_color(meshes)
    merged.export(stl_path)

    # --- 3MF: multi-color, un objeto por pieza (base/qr) ---
    colors = TagColors()
    parts = [
        ColoredPart("base", meshes.base, colors.base_hex),
        ColoredPart("qr", meshes.qr, colors.qr_hex),
    ]
    threemf_bytes = write_3mf(parts)
    threemf_path = out_path / "qr_modelo.3mf"
    threemf_path.write_bytes(threemf_bytes)

    print(f"QR: version {meshes.qr_version} ({meshes.qr_module_count}x{meshes.qr_module_count} modulos), "
          f"modulo final {meshes.qr_module_size_mm:.3f}mm")
    print(f"Chapita: {dims.width_mm:.1f}mm x {dims.height_mm:.1f}mm x {dims.base_thickness_mm:.1f}mm")
    print(f"STL generado: {stl_path} ({len(merged.vertices)} vertices, watertight={merged.is_watertight})")
    print(f"3MF generado: {threemf_path}")

    return stl_path, threemf_path


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        generate(
            args.data,
            width_mm=args.width,
            height_mm=args.height,
            module_size_mm=args.module_size,
            module_size_min_mm=args.module_size_min,
            base_thickness_mm=args.thickness,
            out_dir=args.out_dir,
        )
    except ValueError as exc:
        # Ej.: el QR no entra en la chapita ni con el modulo minimo.
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
