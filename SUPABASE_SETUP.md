# AiPetFriendly - Integración Supabase

## Setup Inicial

### 1. Crear proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com)
2. Crea un nuevo proyecto
3. Espera a que se inicialice la base de datos

### 2. Aplicar migraciones SQL

1. Abre el SQL Editor en Supabase Dashboard
2. Copia el contenido de `supabase/migrations/001_init.sql`
3. Ejecuta el script completo

### 3. Configurar variables de entorno

1. Copia `.env.local.example` a `.env.local`
2. Obtén tus claves de Supabase:
   - `VITE_SUPABASE_URL`: Project URL (Settings > API)
   - `VITE_SUPABASE_ANON_KEY`: Anon Key (Settings > API)

### 4. Instalar cliente Supabase

```bash
npm install @supabase/supabase-js
```

### 5. Crear Storage Bucket

1. Ve a Storage > New bucket
2. Nombre: `clinical-pdfs`
3. Privacidad: **Private** (PDF clinico; nunca lectura publica)
4. Crea

La Etapa 5.3.1 requiere la migracion preparada
[069_clinical_pdf_send_quota.sql](supabase/migrations/069_clinical_pdf_send_quota.sql)
y [070_clinical_pdf_recovery_reconciliation.sql](supabase/migrations/070_clinical_pdf_recovery_reconciliation.sql),
en orden baseline 001..065 -> 066 -> 067 -> 069 -> 070, ademas de la Edge
Function y frontend actualizados. La 069 comprueba dependencias antes de
crear objetos; 070 incorpora recuperacion y conciliacion administrativa auditada.
No se aplicaron migraciones ni se modifico el remoto durante su implementacion.
Ver [operacion de PDF](supabase/functions/README.md#pdf-clinico-etapa-531)
antes de autorizar una puesta en marcha.

### 6. Configurar Edge Function

```bash
npm install -g supabase

supabase functions deploy send-clinical-pdf
supabase functions deploy pet-ai-chat
```

### 7. Secrets para IA contextual

En Supabase Dashboard > Edge Functions > Secrets, agregar:

- `AI_API_KEY`: clave de tu proveedor IA
- `AI_MODEL`: por ejemplo `gpt-4o-mini`
- `AI_BASE_URL`: opcional, default `https://api.openai.com/v1`
- `SUPABASE_SERVICE_ROLE_KEY`: necesaria para que la function lea historial por usuario

### 8. Recuperación de contraseña por email

Para que el enlace de recuperación salga por email, revisa en Supabase Dashboard:

1. Authentication > Providers > Email.
2. Verifica que el proveedor Email esté habilitado.
3. Si usas SMTP propio, carga Host, Port, User y Password.
4. Authentication > URL Configuration.
5. Agrega a la lista de redirect URLs la ruta de recuperación de tu app, por ejemplo:
   - `https://www.aipetfriendly.ar/reset-password`
   - `https://aipetfriendly.vercel.app/reset-password`
6. Revisa también Spam/Promociones en el correo destino.

Si esta parte no está configurada, la app puede disparar la solicitud correctamente pero el email no saldrá.

## Variables de entorno requeridas

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

## Estructura de datos

### Tabla: users
- id (uuid, PK)
- email (text)
- full_name (text)
- avatar_url (text)
- created_at, updated_at

### Tabla: pets
- id (uuid, PK)
- user_id (uuid, FK)
- name, breed, species, sex, age_years, age_months, weight_kg
- photo_url, notes
- created_at, updated_at

### Tabla: clinical_entries
- id (uuid, PK)
- pet_id (uuid, FK)
- category, title, description, event_date
- metadata (jsonb)
- created_at

### Tabla: preventive_tasks
- id (uuid, PK)
- pet_id (uuid, FK)
- title, category, due_date, completed, notes
- created_at

### Tabla: chat_messages
- id (uuid, PK)
- user_id (uuid, FK)
- role, content
- created_at

### Tabla: subscriptions
- id (uuid, PK)
- user_id (uuid, FK, UNIQUE)
- plan (free|premium), is_active, expires_at
- created_at, updated_at

## Políticas RLS habilitadas

Todos los datos están protegidos con políticas RLS que aseguran que:
- Los usuarios solo vean sus propios datos
- No puedan acceder a datos de otros usuarios
- Las operaciones CRUD estén restringidas por usuario_id

## Tienda personalizada (migraciones 071 y 072)

La [migracion 071](supabase/migrations/071_shop_price_history.sql) esta preparada para aplicacion manual autorizada **despues de las migraciones anteriores**. No cambia mascotas, suscripciones, precios comerciales ni sus politicas de acceso.

- `shop_tracked_products` guarda precio actual/regular/promocional, moneda, fuente, especificaciones y fechas de intento/exito.
- `shop_price_samples` registra una primera referencia y solo cambios reales posteriores. Una consulta sin cambios actualiza la fecha exitosa sin crear una variacion. Monedas distintas inician series separadas.
- `shop_price_settings` permite configurar consultas para activos (24 horas), destacados o vistos durante los ultimos siete dias (6 horas), lotes y retencion. La frecuencia es minima entre consultas; el cron de seis horas puede agregar demora y GitHub no garantiza puntualidad.
- Se conservan al menos cinco muestras aun fuera de la retencion (365 dias por defecto). La lectura publica devuelve solo las ultimas cuatro variaciones de la serie monetaria actual; minimo/maximo corresponden al historial retenido, no al mercado completo.
- Reservas con `SKIP LOCKED`, lease de cinco minutos e identificador unico impiden procesar dos veces una consulta. Repetir el mismo resultado del ultimo lease es idempotente; un resultado distinto o lease vencido se rechaza.
- Ante API fallida se conserva precio, moneda y fecha de la ultima consulta exitosa, y se programa backoff. No se fabrican precios ni nuevas fechas exitosas.
- Todas las tablas nuevas tienen RLS; solamente `service_role` puede acceder directamente y actualizar. Anonimos y autenticados solo ejecutan RPC acotadas para historial publico de productos activos y prioridad agregada de visitas, sin preferencias personales.
- `shop_provider_credentials` es privado. Un unico renovador persiste el refresh token rotado antes de usar el access token y coordina API, actualizador y sync existente.

### Radar y catálogo global (072)

La [migracion 072](supabase/migrations/072_global_catalog_radar.sql) agrega el catalogo global investigado y el Radar administrativo, separado de precios y de filtros por mascota:

- `beneficios_productos` incorpora `catalog_product_id`, `research_record`, `researched_at` y `approval_status`.
- Solo `approval_status='approved'` se publica al catalogo general. Las fichas pendientes/rechazadas no aparecen para usuarios.
- `shop_radar_runs` limita una ejecucion diaria y un maximo de 5 detecciones.
- `shop_radar_candidates` guarda deteccion, estado de investigacion, duplicados y decision administrativa.
- `shop_radar_events` conserva trazabilidad de deteccion, investigacion y decisiones.
- `admin_review_shop_radar` separa aprobar/rechazar/posponer/revisar/reintentar y bloquea candidatos ya resueltos.
- `claim_shop_radar_research` y `finish_shop_radar_research` investigan aparte, con lease e idempotencia, sin publicar automaticamente.
- `guard_shop_global_research` impide inconsistencias entre ficha investigada y etiquetas globales publicadas.

### Activacion manual indispensable

1. Aplicar 071 una sola vez en el entorno autorizado, tras verificar las migraciones anteriores. No reejecutar 066, 067, 069 ni 070.
2. Comprobar por nombre las variables servidor existentes: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (o `SUPABASE_SERVICE_KEY`), `ML_APP_ID`, `ML_APP_SECRET`, `ML_REFRESH_TOKEN` inicial y `ML_AFFILIATE_ID` o `ML_AFFILIATE_TEMPLATE`. Nunca convertirlas en variables `VITE_*`. El refresh inicial no sobrescribe el ya rotado.
3. Publicar coordinadamente frontend/API y `pet-ai-chat` con sus modulos compartidos y JWT habilitado cuando se autorice. Las rutas OAuth de API y los workers de tienda requieren 071 y 072 antes de actualizar esos consumidores.
4. Verificar permiso real de la aplicacion Mercado Libre para `/items/{id}` y [`/items/{id}/sale_price?context=channel_marketplace`](https://developers.mercadolibre.cl/es_ar/categorias-y-publicaciones/api-de-precios). Una URL de catalogo `/p/MLA...` no identifica una publicacion: requiere un ID de publicacion valido. No se usan scraping ni campos de precio retirados.
5. Solo tras esa comprobacion, activar los interruptores necesarios con administracion autorizada:
   - `shop_price_settings.enabled` + `SHOP_PRICE_TRACKING_ENABLED=true` para precios.
   - `shop_radar_settings.enabled` y opcionalmente `shop_radar_settings.research_enabled` + variables de repositorio `SHOP_RADAR_ENABLED=true` y `SHOP_RADAR_RESEARCH_ENABLED=true` para Radar.
   Ambos procesos siguen separados. Reutiliza [.github/workflows/check-ml-products-status.yml](.github/workflows/check-ml-products-status.yml) y [.github/workflows/sync-ml-products.yml](.github/workflows/sync-ml-products.yml), sin crear nuevos crons.

El worker usa hasta diez lotes de veinte productos y cuatro consultas simultaneas, con presupuesto de cinco minutos para iniciar lotes; termina el lote ya reservado. `SHOP_PRICE_MAX_BATCHES` permite limitarlo (1..50). El workflow admite esa variable opcional de repositorio. Los retrasos, limites y backlog pueden demorar actualizaciones; revisar contadores del job. Un 401/403/429 corta nuevas consultas del lote y registra errores, sin reintentos inmediatos. El job de precios no envia correos; el control diario preexistente conserva su comportamiento.

El Radar diario usa ranking oficial (`/highlights/MLA/category/{id}`), recorre subcategorias oficiales de mascotas, detecta maximo cinco candidatos por dia y no inventa popularidad ni atributos cuando la fuente no los expone. Si Mercado Libre responde 401/403/429 o una categoria no tiene ranking, se registra como limitacion y no se publica ningun candidato.

La API y el cliente nativo muestran advertencias si faltan configuracion o historial. En nativo se conserva el catalogo publico de Supabase, sin inventar enlaces cuando la API web no esta disponible.

Para detener precios o Radar, desactivar sus interruptores correspondientes, sin borrar historial. Ante un problema de publicacion, recuperar la version anterior del frontend/API/Edge y conservar 071/072; no eliminar tablas ni restaurar datos de mascotas.
