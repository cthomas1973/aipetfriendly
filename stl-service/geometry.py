"""
Generacion parametrica de la geometria 3D de la chapita de identificacion.

La chapita es una placa plana (rectangulo redondeado + agujero de llavero)
con el codigo QR (link publico de la mascota) AL RAS/coplanar con la placa
-no en relieve-, ocupando todo el espesor de la base (z: 0 -> base_thickness).
El QR se arma en 2 capas apiladas en Z (cada una de la mitad del espesor):
arriba el patron normal, abajo el mismo patron pero ESPEJADO en X. Al dar
vuelta fisicamente la chapita para ver el reverso, ese espejo se cancela con
el espejo que produce el propio giro, y el reverso se lee como el patron
correcto (no invertido) -> el QR queda escaneable desde AMBAS caras. Ninguna
de las 2 caras tiene relieve/escalones, asi que se puede imprimir apoyada en
la cama sin necesitar soportes. Cada modulo oscuro se imprime en un
color/material distinto al resto de la placa (mismo plano, sin escalon).

Se descarto un logo/emblema en relieve en la cara superior (no quedaba bien
a esta escala); la chapita solo tiene 2 piezas: `base` y `qr`.

Todo el modelado 2D (rectangulo redondeado, agujero del llavero, pixeles del
QR) se hace con `shapely` (booleanas 2D robustas, sin depender de un motor de
booleanas 3D) y luego se extruye con `trimesh`.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
import qrcode
import trimesh
from shapely.geometry import MultiPolygon, Polygon, box
from shapely.ops import unary_union


# Tope fisico duro de la chapita: nunca debe exceder 30mm de lado (requerimiento
# de fabricacion/impresion). Los defaults de TagDimensions usan 28mm para dejar
# un margen de seguridad, pero se clamp-ea igual por si alguien pide mas.
MAX_TAG_SIDE_MM = 30.0


@dataclass
class TagDimensions:
    # Se usa el maximo fisico permitido (30mm) por defecto: con un agujero de
    # llavero real reservando espacio en la parte de arriba, una URL completa
    # (con dominio) necesita casi todo ese margen para poder codificarse con
    # modulos >= 0.8mm; ver __post_init__ para el clamp de seguridad.
    width_mm: float = 30.0
    height_mm: float = 30.0
    corner_radius_mm: float = 4.0
    base_thickness_mm: float = 1.6  # rango recomendado: 1.2mm - 2.0mm
    # Agujero de llavero y margenes ajustados al minimo razonable para 3D-print
    # (boquilla 0.4mm) para dejarle al QR la mayor area posible dentro de 30mm.
    ring_hole_diameter_mm: float = 3.2
    ring_margin_mm: float = 2.6  # distancia del centro del agujero al borde superior
    ring_clearance_mm: float = 0.8  # separacion minima entre el agujero de la argolla y el QR
    qr_quiet_margin_mm: float = 1.2  # margen sin QR alrededor del borde (para no debilitar la pieza)
    # Tamano de modulo (pixel) del QR objetivo. Se intenta respetar este valor;
    # si el QR no entra en el area disponible se reduce automaticamente hasta
    # `module_size_min_mm` (nunca menos, para no perder imprimibilidad con
    # boquillas de 0.4mm). Rango recomendado: 0.8mm - 1.2mm.
    module_size_mm: float = 1.0
    module_size_min_mm: float = 0.8

    def __post_init__(self) -> None:
        # Nunca generar una chapita mas grande que el maximo fisico permitido.
        self.width_mm = min(self.width_mm, MAX_TAG_SIDE_MM)
        self.height_mm = min(self.height_mm, MAX_TAG_SIDE_MM)



@dataclass
class TagColors:
    base_hex: str = "#2F2F2F"
    qr_hex: str = "#111111"


@dataclass
class TagMeshes:
    base: trimesh.Trimesh
    qr: trimesh.Trimesh
    dims: TagDimensions = field(default_factory=TagDimensions)
    # Info de diagnostico sobre el QR generado (utiles para loguear/mostrar en el
    # panel admin y para depurar si un texto/URL no entra en la chapita).
    qr_version: int = 0
    qr_module_count: int = 0
    qr_module_size_mm: float = 0.0


def _rounded_rect(width: float, height: float, radius: float) -> Polygon:
    """Rectangulo con esquinas redondeadas, centrado en el origen."""
    radius = max(0.1, min(radius, width / 2 - 0.1, height / 2 - 0.1))
    inner = box(-width / 2 + radius, -height / 2 + radius, width / 2 - radius, height / 2 - radius)
    return inner.buffer(radius, resolution=24, join_style=1)


def _qr_matrix(data: str) -> tuple[list[list[bool]], int]:
    """Genera la matriz binaria del QR minimizando su tamano:

    - `version=None` + `qr.make(fit=True)`: usa la MENOR version de QR (empezando
      en la version 1 = 21x21 modulos) que alcance a codificar `data` con el
      nivel de correccion de errores elegido. `qrcode` prueba versiones
      crecientes y se queda con la primera que entra, asi que esto ya satisface
      "version minima necesaria" sin tener que buscarla a mano.
    - `error_correction=ERROR_CORRECT_L` (~7% de recuperacion, el mas bajo de
      los 4 niveles del estandar QR): a menor correccion de errores, mayor
      capacidad de datos por version, por lo que para el mismo texto/URL se
      necesitan MENOS modulos que con M/Q/H. Es el principal factor para
      achicar la matriz.
    - Modo de datos (numerico/alfanumerico/byte): no se fuerza a mano porque
      `qrcode` ya hace segmentacion optima por defecto (`add_data(...,
      optimize=20)`): parte el contenido en tramos y usa el modo mas compacto
      que aplique a cada tramo (numerico > alfanumerico > byte). Una URL con
      minusculas/`:`/`/`/`?` no puede ir 100% en modo alfanumerico (ese modo
      solo admite 0-9, A-Z mayuscula, espacio y `$%*+-./:`), pero cualquier
      tramo que si cumpla ese charset (ej. el codigo publico en mayusculas) se
      codifica igual en el modo mas chico posible sin intervencion manual.
    """
    qr = qrcode.QRCode(version=None, border=0, error_correction=qrcode.constants.ERROR_CORRECT_L)
    qr.add_data(data)
    qr.make(fit=True)
    return qr.get_matrix(), qr.version


def _qr_layout(
    data: str,
    available_size_mm: float,
    target_module_mm: float,
    min_module_mm: float,
) -> tuple[list[list[bool]], float, int, int]:
    """Calcula el tamano de modulo final a usar para el QR (sin generar
    geometria todavia). Devuelve `(matrix, module_size, qr_version, n)` con
    `n` la cantidad de modulos por lado (n x n).

    El tamano de modulo prioriza `target_module_mm` (pensado para boquillas de
    0.4mm, rango tipico 0.8mm-1.2mm); si el QR no entra en `available_size_mm`
    con ese tamano, se reduce automaticamente hasta `min_module_mm`. Si ni con
    el modulo minimo entra, se levanta un error claro (en vez de generar una
    chapita rota o modulos ilegibles) para que quien llama use un texto/URL
    mas corto o una chapita mas grande.
    """
    matrix, qr_version = _qr_matrix(data)
    n = len(matrix)
    if n == 0:
        return matrix, 0.0, qr_version, 0

    max_module_that_fits = available_size_mm / n
    module_size = min(target_module_mm, max_module_that_fits)
    if module_size < min_module_mm:
        if max_module_that_fits < min_module_mm:
            raise ValueError(
                f"El QR resultante necesita {n}x{n} modulos (version {qr_version}) y con el "
                f"tamano de modulo minimo ({min_module_mm}mm) ocuparia "
                f"{n * min_module_mm:.1f}mm de lado, pero el area disponible en la chapita es de "
                f"solo {available_size_mm:.1f}mm. Usa un texto/URL mas corto o una chapita mas grande."
            )
        module_size = min_module_mm

    return matrix, module_size, qr_version, n


def _qr_module_mesh(
    matrix: list[list[bool]],
    module_size: float,
    n: int,
    height: float,
    z_offset: float = 0.0,
) -> trimesh.Trimesh:
    """Genera la malla 3D del QR como una caja rectangular independiente por
    cada modulo oscuro (en vez de unir los modulos en un unico Polygon 2D con
    `shapely.unary_union` y extruirlo con earcut).

    Se probo el enfoque de union 2D + extrusion, pero produce mallas no
    watertight: la triangulacion de earcut para poligonos con muchos agujeros
    (los modulos claros rodeados de oscuros, como en los patrones de
    localizacion) genera bordes no-manifold cuando el poligono tiene vertices
    redundantes/casi-colineales (subproducto inevitable de unir cientos de
    cuadrados). Generar cada modulo como una caja 3D independiente evita ese
    problema por completo: `trimesh.creation.box` siempre produce una malla
    cerrada y valida, sin depender de ninguna triangulacion de poligonos.

    Los modulos se agrandan levemente (un ~2% de su lado) para que los
    vecinos -incluidos los que solo se tocan en diagonal, patron "tablero de
    ajedrez"- se superpongan en volumen real en vez de solo tocarse en un
    punto/arista. La superposicion es intrascendente para impresion 3D (los
    slicers fusionan solidos superpuestos sin problema) y no afecta la
    legibilidad del QR porque los lectores muestrean el centro de cada modulo.
    """
    if n == 0:
        return trimesh.Trimesh()

    qr_side = module_size * n
    offset = qr_side / 2
    pad = module_size * 0.02
    boxes = []
    for row_idx, row in enumerate(matrix):
        for col_idx, is_dark in enumerate(row):
            if not is_dark:
                continue
            x0 = col_idx * module_size - offset
            y0 = (n - row_idx - 1) * module_size - offset  # invertir Y (SVG/matriz vs cartesiano)
            cube = trimesh.creation.box(extents=[module_size + pad, module_size + pad, height])
            cube.apply_translation(
                [x0 + module_size / 2, y0 + module_size / 2, z_offset + height / 2]
            )
            boxes.append(cube)
    if not boxes:
        return trimesh.Trimesh()
    return trimesh.util.concatenate(boxes)


def _extrude(polygon: Polygon | MultiPolygon, height: float, z_offset: float = 0.0) -> trimesh.Trimesh:
    """Extruye un Polygon o MultiPolygon (con agujeros) a la altura indicada."""
    polys = list(polygon.geoms) if isinstance(polygon, MultiPolygon) else [polygon]
    meshes = []
    for poly in polys:
        if poly.is_empty or poly.area <= 0:
            continue
        mesh = trimesh.creation.extrude_polygon(poly, height=height, engine="earcut")
        meshes.append(mesh)
    if not meshes:
        return trimesh.Trimesh()
    combined = trimesh.util.concatenate(meshes) if len(meshes) > 1 else meshes[0]
    combined.apply_translation([0, 0, z_offset])
    return combined


def build_tag_meshes(
    qr_data: str,
    dims: TagDimensions | None = None,
) -> TagMeshes:
    """Construye las 2 piezas de la chapita: base (con agujero de llavero y el
    hueco del QR ya recortado) y QR AL RAS/coplanar con la base (mismo plano,
    sin relieve -> imprimible sin soportes), armado en 2 capas en Z (patron
    normal arriba, espejado en X abajo) para que se pueda escanear
    correctamente desde AMBAS caras de la chapita."""
    dims = dims or TagDimensions()

    base_outline = _rounded_rect(dims.width_mm, dims.height_mm, dims.corner_radius_mm)

    ring_cx = 0.0
    ring_cy = dims.height_mm / 2 - dims.ring_margin_mm
    from shapely.geometry import Point as _Point

    ring_hole_poly = _Point(ring_cx, ring_cy).buffer(dims.ring_hole_diameter_mm / 2, resolution=32)

    # Se calcula el layout del QR (posicion/tamano) para poder recortar su
    # hueco de la base ANTES de extruirla. El QR ocupa el area disponible
    # debajo del agujero del llavero (con margen de separacion para que nunca
    # quede cortado por el agujero) y deja un margen sin grabar en
    # los bordes.
    ring_bottom_y = ring_cy - dims.ring_hole_diameter_mm / 2
    qr_top_limit = ring_bottom_y - dims.ring_clearance_mm
    qr_bottom_limit = -dims.height_mm / 2 + dims.qr_quiet_margin_mm
    qr_available_height = max(qr_top_limit - qr_bottom_limit, 1.0)
    qr_available_width = dims.width_mm - 2 * dims.qr_quiet_margin_mm
    qr_area = min(qr_available_height, qr_available_width)
    qr_center_y = (qr_top_limit + qr_bottom_limit) / 2
    qr_matrix, module_size_used, qr_version, qr_module_count = _qr_layout(
        qr_data,
        available_size_mm=qr_area,
        target_module_mm=dims.module_size_mm,
        min_module_mm=dims.module_size_min_mm,
    )
    qr_side = module_size_used * qr_module_count

    # La base se recorta con SOLO 2 agujeros simples (argolla + el cuadrado
    # completo del QR), no con un hueco por cada modulo oscuro: unir cientos
    # de cuadrados chicos en un unico Polygon complejo y extruirlo con earcut
    # es lo que rompia el watertightness del QR embutido (ver `_qr_module_mesh`).
    # Con un solo hueco rectangular la triangulacion es simple y confiable.
    qr_cutout = box(
        -qr_side / 2, qr_center_y - qr_side / 2, qr_side / 2, qr_center_y + qr_side / 2
    )
    base_polygon = base_outline.difference(ring_hole_poly).difference(qr_cutout)
    base_mesh = _extrude(base_polygon, dims.base_thickness_mm, z_offset=0.0)

    # El QR se arma en 2 capas independientes apiladas en Z (cada una de la
    # MITAD del espesor de la base), no como una unica caja de lado a lado:
    # - Capa de ARRIBA (z: half -> base_thickness): patron normal del QR, tal
    #   como lo devuelve la libreria (correcto al leerlo mirando esa cara).
    # - Capa de ABAJO (z: 0 -> half): patron ESPEJADO en X (columnas
    #   invertidas). Al dar vuelta fisicamente la chapita (girarla como una
    #   moneda/tarjeta sobre su eje vertical para ver el reverso), esa capa
    #   -que en el objeto queda invertida en X respecto al observador- se ve
    #   otra vez COMO el patron normal (2 espejados se cancelan), quedando
    #   valida/escaneable en las 2 caras. Si se usara el mismo patron en las 2
    #   capas (como antes), el reverso se veria espejado (patron invalido/no
    #   necesariamente legible por todos los lectores).
    #
    #   Las 2 capas se solapan un poco en Z (`z_pad`) en vez de tocarse en el
    #   plano exacto `z=half`: si se tocaran exacto, al soldar vertices
    #   coincidentes (`merge_vertices` en `merge_single_color`) la interfaz
    #   queda con aristas usadas por 4 caras en vez de 2 (no-manifold) y la
    #   malla final deja de ser watertight, aunque cada capa por separado si
    #   lo sea. Mismo principio que el padding lateral de `_qr_module_mesh`
    #   (agrandar un poco para solapar en vez de solo tocar), aplicado ahora
    #   en el eje Z.
    half_thickness = dims.base_thickness_mm / 2
    z_pad = min(0.05, half_thickness * 0.1)
    qr_matrix_mirrored = [list(reversed(row)) for row in qr_matrix]
    qr_light_matrix = [[not is_dark for is_dark in row] for row in qr_matrix]
    qr_light_matrix_mirrored = [list(reversed(row)) for row in qr_light_matrix]

    qr_dark_top = _qr_module_mesh(
        qr_matrix, module_size_used, qr_module_count,
        height=half_thickness + z_pad, z_offset=half_thickness - z_pad,
    )
    qr_dark_bottom = _qr_module_mesh(
        qr_matrix_mirrored, module_size_used, qr_module_count,
        height=half_thickness + z_pad, z_offset=0.0,
    )
    qr_dark_mesh = trimesh.util.concatenate([qr_dark_top, qr_dark_bottom])
    qr_dark_mesh.apply_translation([0, qr_center_y, 0])

    qr_light_top = _qr_module_mesh(
        qr_light_matrix, module_size_used, qr_module_count,
        height=half_thickness + z_pad, z_offset=half_thickness - z_pad,
    )
    qr_light_bottom = _qr_module_mesh(
        qr_light_matrix_mirrored, module_size_used, qr_module_count,
        height=half_thickness + z_pad, z_offset=0.0,
    )
    qr_light_mesh = trimesh.util.concatenate([qr_light_top, qr_light_bottom])
    qr_light_mesh.apply_translation([0, qr_center_y, 0])
    if len(qr_light_mesh.vertices) > 0:
        base_mesh = trimesh.util.concatenate([base_mesh, qr_light_mesh])

    return TagMeshes(
        base=base_mesh,
        qr=qr_dark_mesh,
        dims=dims,
        qr_version=qr_version,
        qr_module_count=qr_module_count,
        qr_module_size_mm=module_size_used,
    )


def merge_single_color(meshes: TagMeshes) -> trimesh.Trimesh:
    """Une base + QR en un unico Trimesh imprimible.

    El QR queda AL RAS/coplanar con la base (mismo rango Z, encastrado en el
    hueco recortado de la base), asi que concatenar ambas piezas ya da una
    malla valida para imprimir sin necesidad de una union booleana 3D (evita
    depender de un motor CSG nativo como OpenSCAD/CGAL solo para esto).
    Igualmente se sueldan los vertices coincidentes en la interfaz
    (`merge_vertices`) para dejar un unico objeto prolijo en vez de varios
    cuerpos sueltos que solo se tocan.
    """
    parts = [m for m in (meshes.base, meshes.qr) if m is not None and len(m.vertices) > 0]
    merged = trimesh.util.concatenate(parts)
    merged.merge_vertices()
    merged.remove_unreferenced_vertices()
    return merged
