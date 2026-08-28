"""
API para generar archivos .stl / .3mf de la chapita de identificacion de mascotas.

Ejecutar localmente:
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000

Ver README.md para ejemplos de uso con curl/Postman.
"""
from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from geometry import TagColors, TagDimensions, build_tag_meshes, merge_single_color
from threemf import ColoredPart, write_3mf

OUTPUT_DIR = Path(__file__).parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

app = FastAPI(title="AiPetFriendly - Generador de chapitas 3D", version="1.0.0")

# Permite llamar a este servicio desde el panel admin (dev en localhost:5173 y produccion).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateTagRequest(BaseModel):
    pet_id: str = Field(..., description="ID interno de la mascota (para nombrar los archivos).")
    public_code: str = Field(..., description="Codigo publico de la mascota (para armar la URL del QR).")
    pet_name: str | None = Field(None, description="Nombre de la mascota (solo informativo).")
    qr_url: str | None = Field(
        None,
        description="URL completa a codificar en el QR. Si no se manda, se arma con base_url + public_code.",
    )
    base_url: str = Field(
        "https://www.aipetfriendly.ar/m",
        description="Prefijo usado para armar la URL del QR si no se manda qr_url explicito. "
        "Se usa el alias corto /m/ (en vez de /mascota/) para que el QR tenga menos caracteres y menos modulos.",
    )
    format: Literal["stl_single", "stl_multi", "3mf"] = Field(
        "3mf", description="stl_single = un solo STL combinado. stl_multi = 2 STL (base/qr). 3mf = un solo archivo multi-color."
    )
    # La chapita fisica nunca debe superar 30mm de lado (limite de fabricacion/impresion).
    width_mm: float = Field(30.0, gt=0, le=30.0, description="Ancho de la placa en mm (maximo 30mm).")
    height_mm: float = Field(30.0, gt=0, le=30.0, description="Alto de la placa en mm (maximo 30mm).")
    base_thickness_mm: float = Field(
        1.6, ge=1.2, le=2.0, description="Grosor de la base en mm (rango recomendado 1.2mm - 2.0mm)."
    )
    module_size_mm: float = Field(
        1.0,
        ge=0.8,
        le=1.2,
        description="Tamano objetivo de cada modulo (pixel) del QR en mm, pensado para boquillas de 0.4mm "
        "(rango recomendado 0.8mm - 1.2mm). Si el QR no entra en la chapita con este tamano, se reduce "
        "automaticamente (nunca por debajo de 0.8mm); si ni asi entra, se informa un error.",
    )
    base_color: str = "#2F2F2F"
    qr_color: str = "#111111"


class GenerateTagResponse(BaseModel):
    job_id: str
    format: str
    files: list[str]
    qr_url: str
    qr_version: int = Field(..., description="Version de QR usada (1 = 21x21 modulos, la minima posible).")
    qr_module_count: int = Field(..., description="Cantidad de modulos por lado de la matriz del QR (n x n).")
    qr_module_size_mm: float = Field(..., description="Tamano de modulo finalmente usado en mm.")



def _safe_slug(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9_-]+", "-", value).strip("-")
    return slug or "tag"


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/generate-tag", response_model=GenerateTagResponse)
def generate_tag(payload: GenerateTagRequest) -> GenerateTagResponse:
    qr_url = payload.qr_url or f"{payload.base_url.rstrip('/')}/{payload.public_code}?src=chapita"

    dims = TagDimensions(
        width_mm=payload.width_mm,
        height_mm=payload.height_mm,
        base_thickness_mm=payload.base_thickness_mm,
        module_size_mm=payload.module_size_mm,
    )
    colors = TagColors(base_hex=payload.base_color, qr_hex=payload.qr_color)

    try:
        meshes = build_tag_meshes(qr_url, dims=dims)
    except ValueError as exc:
        # Ej.: el QR no entra en la chapita ni con el modulo minimo (URL demasiado larga).
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensivo, geometria puede fallar con datos raros
        raise HTTPException(status_code=422, detail=f"No se pudo generar la geometria: {exc}") from exc

    job_id = uuid.uuid4().hex[:10]
    slug = _safe_slug(payload.pet_id)
    job_dir = OUTPUT_DIR / f"{slug}-{job_id}"
    job_dir.mkdir(parents=True, exist_ok=True)

    files: list[str] = []

    if payload.format == "stl_single":
        merged = merge_single_color(meshes)
        out_path = job_dir / f"chapita-{slug}.stl"
        merged.export(out_path)
        files.append(out_path.name)

    elif payload.format == "stl_multi":
        for name, mesh in (("base", meshes.base), ("qr", meshes.qr)):
            if mesh is None or len(mesh.vertices) == 0:
                continue
            out_path = job_dir / f"chapita-{slug}-{name}.stl"
            mesh.export(out_path)
            files.append(out_path.name)

    else:  # "3mf"
        parts = [
            ColoredPart("base", meshes.base, colors.base_hex),
            ColoredPart("qr", meshes.qr, colors.qr_hex),
        ]
        data = write_3mf(parts)
        out_path = job_dir / f"chapita-{slug}.3mf"
        out_path.write_bytes(data)
        files.append(out_path.name)

    return GenerateTagResponse(
        job_id=f"{slug}-{job_id}",
        format=payload.format,
        files=files,
        qr_url=qr_url,
        qr_version=meshes.qr_version,
        qr_module_count=meshes.qr_module_count,
        qr_module_size_mm=round(meshes.qr_module_size_mm, 3),
    )


@app.get("/download/{job_id}/{filename}")
def download_file(job_id: str, filename: str) -> FileResponse:
    file_path = (OUTPUT_DIR / job_id / filename).resolve()
    if OUTPUT_DIR.resolve() not in file_path.parents or not file_path.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return FileResponse(file_path, filename=filename)
