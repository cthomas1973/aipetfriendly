"""
Escritor minimo de archivos .3mf (Core Spec) con soporte multi-color:
cada pieza (base/logo/qr) se exporta como un <object> independiente con su
propio color via <basematerials>, para que un slicer multi-material/multi-color
(ej. Bambu Studio, PrusaSlicer con AMS/MMU) pueda asignar un filamento por pieza.

No depende de librerias externas de 3MF (lib3mf, etc.), solo de `zipfile` +
plantillas XML, para minimizar dependencias nativas dificiles de instalar.
"""
from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass

import trimesh

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>
"""

RELS = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
"""


@dataclass
class ColoredPart:
    name: str
    mesh: trimesh.Trimesh
    color_hex: str  # "#RRGGBB"


def _hex_to_srgb(color_hex: str) -> str:
    color_hex = color_hex.lstrip("#")
    return f"#{color_hex.upper()}FF"


def write_3mf(parts: list[ColoredPart]) -> bytes:
    """Genera un .3mf valido (zip) con un objeto por pieza, cada uno con su color."""
    parts = [p for p in parts if p.mesh is not None and len(p.mesh.vertices) > 0]

    basematerials_items = []
    objects_xml = []
    build_items = []

    for idx, part in enumerate(parts):
        object_id = idx + 1
        pid = 1  # un unico grupo "basematerials" con todos los colores
        p1 = idx

        verts = part.mesh.vertices
        faces = part.mesh.faces
        v_xml = "".join(f'<vertex x="{x:.5f}" y="{y:.5f}" z="{z:.5f}"/>' for x, y, z in verts)
        t_xml = "".join(
            f'<triangle v1="{a}" v2="{b}" v3="{c}" pid="{pid}" p1="{p1}"/>' for a, b, c in faces
        )
        objects_xml.append(
            f'<object id="{object_id}" name="{part.name}" type="model">'
            f'<mesh><vertices>{v_xml}</vertices><triangles>{t_xml}</triangles></mesh>'
            f'</object>'
        )
        build_items.append(f'<item objectid="{object_id}"/>')
        basematerials_items.append(f'<base name="{part.name}" displaycolor="{_hex_to_srgb(part.color_hex)}"/>')

    basematerials_xml = (
        f'<basematerials id="1">{"".join(basematerials_items)}</basematerials>'
    )

    model_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="es-AR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    {basematerials_xml}
    {''.join(objects_xml)}
  </resources>
  <build>
    {''.join(build_items)}
  </build>
</model>
"""

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", CONTENT_TYPES)
        zf.writestr("_rels/.rels", RELS)
        zf.writestr("3D/3dmodel.model", model_xml)
    return buffer.getvalue()
