# Generador de chapitas 3D (STL / 3MF) — AiPetFriendly

Microservicio Python (FastAPI) que genera el modelo 3D imprimible de la
chapita de identificación de una mascota:

- **QR (ambas caras)**: código QR con el link público de la mascota, **al ras
  (coplanar) con la base** — no en relieve —, ocupando todo el espesor de la
  placa. Como cada módulo atraviesa todo el espesor, el mismo patrón queda
  visible en las 2 caras de la chapita, y ninguna tiene relieve/escalones, así
  que se puede imprimir apoyada en la cama sin necesitar soportes. Generado a
  partir del código público de cada mascota.
- **Base**: placa con esquinas redondeadas y un agujero para el llavero.

**La chapita física nunca puede superar 30mm de lado** (límite de
fabricación/impresión, se valida tanto en la API como en el script CLI).

El rectángulo redondeado y el agujero del llavero se modelan con `shapely`
(booleanas 2D robustas) y se extruyen a 3D con `trimesh`. El QR se genera
aparte: cada módulo (píxel) se crea como una caja 3D independiente (en vez de
unir los módulos en un único polígono 2D y extruirlo), porque esa unión
producía mallas no-watertight en algunos casos (triangulación con vértices
redundantes). Nada de esto depende de un kernel CAD nativo (OCCT/CadQuery),
para que la instalación sea simple y portable en Windows/Linux/Mac.

El QR usa siempre la versión mínima posible (`ERROR_CORRECT_L`, tamaño
`fit=True`) para el texto/URL dado — la versión 1 (21x21 módulos) sólo es
alcanzable con textos muy cortos (~17 caracteres en modo byte); una URL
completa con dominio normalmente necesita versión 2 o 3.

## Instalación

```bash
cd stl-service
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/Mac:
source .venv/bin/activate

pip install -r requirements.txt
```

## Ejecutar el servidor

```bash
uvicorn main:app --reload --port 8000
```

Health check: `GET http://localhost:8000/health` → `{"status": "ok"}`

## Uso — generar una chapita

`POST /generate-tag`

Body (JSON):

```json
{
  "pet_id": "0c917d01-fa3a-4797-abdd-f3d310626679",
  "public_code": "ABC12345",
  "pet_name": "Homero",
  "format": "3mf",
  "base_url": "https://www.aipetfriendly.ar/m",
  "width_mm": 30,
  "height_mm": 30,
  "base_color": "#2F2F2F",
  "qr_color": "#111111"
}
```

Parámetros:

| Campo | Requerido | Descripción |
|---|---|---|
| `pet_id` | sí | Identificador interno de la mascota (se usa para nombrar los archivos). |
| `public_code` | sí | Código público de la mascota, usado para armar la URL del QR. |
| `pet_name` | no | Solo informativo. |
| `qr_url` | no | URL completa a codificar. Si se omite, se arma como `base_url/public_code?src=chapita`. |
| `base_url` | no | Prefijo para armar la URL del QR (default apunta al alias corto `aipetfriendly.ar/m`). |
| `format` | no | `"3mf"` (default, un solo archivo multi-color), `"stl_multi"` (2 STL: base/qr) o `"stl_single"` (1 STL combinado, monocromo). |
| `width_mm` / `height_mm` | no | Tamaño de la placa en mm (default 30x30, **máximo 30mm de lado**). |
| `base_thickness_mm` | no | Grosor de la base en mm (default 1.6, rango 1.2 - 2.0). El QR ocupa todo ese espesor (queda al ras/coplanar con la base, sin relieve propio). |
| `module_size_mm` | no | Tamaño objetivo de cada módulo del QR en mm, pensado para boquillas de 0.4mm (default 1.0, rango 0.8 - 1.2). Si el QR no entra con este tamaño se reduce automáticamente hasta 0.8mm; si ni así entra, la API responde `422` con un mensaje explicando cuánto espacio faltó (sugiere acortar la URL o agrandar la chapita). |
| `base_color` / `qr_color` | no | Colores (hex) usados en el `.3mf` para asignar filamentos por pieza en slicers multi-material. |

Respuesta:

```json
{
  "job_id": "0c917d01-fa-48dad67a40",
  "format": "3mf",
  "files": ["chapita-0c917d01-fa.3mf"],
  "qr_url": "https://www.aipetfriendly.ar/m/ABC12345?src=chapita",
  "qr_version": 3,
  "qr_module_count": 29,
  "qr_module_size_mm": 0.821
}
```

`qr_version` / `qr_module_count` / `qr_module_size_mm` son informativos: permiten
confirmar qué versión de QR terminó usándose y si el tamaño de módulo tuvo que
reducirse por debajo del objetivo (`module_size_mm`) para entrar en la chapita.

Luego, descargar el archivo con:

`GET /download/{job_id}/{filename}`

## Probar con curl

```bash
curl -X POST http://localhost:8000/generate-tag \
  -H "Content-Type: application/json" \
  -d "{\"pet_id\":\"test123\",\"public_code\":\"ABC12345\",\"format\":\"3mf\"}"

curl -O -J http://localhost:8000/download/test123-XXXXXXXXXX/chapita-test123.3mf
```

## Probar con Postman

1. `POST http://localhost:8000/generate-tag`, body raw JSON como el ejemplo de arriba.
2. Copiar `job_id` y el primer elemento de `files` de la respuesta.
3. `GET http://localhost:8000/download/{job_id}/{filename}` → guardar la respuesta como archivo.

## Notas de diseño

- **QR al ras, escaneable en ambas caras (sin soportes)**: el QR no tiene
  relieve propio. Se recorta un único hueco rectangular simple en la placa
  base (igual de simple que el agujero del llavero) y ese hueco se rellena
  con cajas 3D independientes por módulo, en **2 capas apiladas en Z**: la
  mitad superior del espesor (`z: half → thickness`) usa el patrón QR
  normal, y la mitad inferior (`z: 0 → half`) usa el mismo patrón pero
  **espejado en X** (columnas invertidas). Al dar vuelta la chapita
  físicamente (rotación que invierte el eje X para quien la mira), ese
  espejo pre-aplicado se cancela con el espejo del giro físico, y la cara
  inferior también se ve con el patrón correcto (no espejado). Las 2 capas
  se solapan una fracción de mm (`z_pad`) en vez de tocarse exactas, para
  evitar aristas no-manifold al fusionar vértices coincidentes. Todo esto
  ocupa exactamente el espesor de la base (sin escalones), así que la
  chapita sigue siendo apta para imprimir apoyada en la cama sin soportes.
  (Se descartó un logo/emblema en relieve en la cara superior: no quedaba
  bien a esta escala.)
- **Multi-color en `.3mf`**: se generan 2 piezas (base/qr) como objetos
  separados dentro del mismo archivo `.3mf`, cada una con su color vía
  `<basematerials>`. Slicers con soporte multi-material (Bambu Studio,
  PrusaSlicer + MMU/AMS) permiten asignar un filamento distinto a cada
  objeto. El escritor de `.3mf` es propio (`threemf.py`, basado en
  `zipfile` de la librería estándar) para no depender de la compatibilidad
  variable del exportador 3MF de `trimesh` entre versiones.
- **`stl_multi`**: exporta las 2 piezas como archivos `.stl` separados,
  útil para impresión con cambio de filamento manual (pausa en altura Z)
  o para revisar cada pieza en un visor STL.
- **`stl_single`**: un solo STL con las 3 piezas ya combinadas (concatenadas,
  no se solapan), para impresión monocroma simple.
- **Este servicio no está desplegado/hosteado**. Para usarlo desde el panel
  admin de la app en producción hace falta desplegarlo en algún host (Render,
  Fly.io, un VPS, etc.) y configurar `VITE_STL_SERVICE_URL` en el frontend
  apuntando a esa URL. Mientras tanto, funciona en `localhost:8000` para
  desarrollo/pruebas.

## Uso — script CLI standalone (`generate_cli.py`)

Para generar un modelo puntual sin levantar el servidor FastAPI:

```bash
python generate_cli.py "https://www.aipetfriendly.ar/m/ABC12345?src=chapita"
```

Genera `qr_modelo.stl` y `qr_modelo.3mf` en el directorio actual (o el que se
indique con `--out-dir`). Opciones: `--width` / `--height` (default 30mm,
tope 30mm), `--module-size` / `--module-size-min` (default 1.0 / 0.8mm),
`--thickness` (default 1.6mm). Imprime en
consola la versión de QR usada, cantidad de módulos, tamaño de módulo final y
si la malla resultante es watertight (cerrada, apta para imprimir).
