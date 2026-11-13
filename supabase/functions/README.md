# Supabase Edge Functions

## Deployment

Deploy con Supabase CLI:

```bash
supabase functions deploy send-clinical-pdf --no-verify-jwt
supabase functions deploy pet-ai-chat
supabase functions deploy send-veterinary-consent-whatsapp
supabase functions deploy send-feedback
supabase functions deploy inbound-email-webhook --no-verify-jwt
supabase functions deploy admin-reply-inbound-email
supabase functions deploy send-guide-notifications --no-verify-jwt
supabase functions deploy send-news-campaigns --no-verify-jwt
supabase functions deploy send-blog-post-notifications --no-verify-jwt
supabase functions deploy search-google-places
supabase functions deploy publish-social-posts --no-verify-jwt
```

## Variables de entorno

Configurar en Supabase Dashboard:

- `SUPABASE_URL`: URL de tu proyecto Supabase
- `SUPABASE_SERVICE_ROLE_KEY`: Clave de servicio (cuidado: solo en servidor)
- `APP_BASE_URL`: URL publica de la app web (ej. `https://tu-dominio.com`), usada en botones de emails
- `EMAIL_LOGO_URL`: opcional, URL absoluta del logo para emails (si no se define usa `${APP_BASE_URL}/logo-aipetfriendly.png`)
- `AI_API_KEY`: API key del proveedor de IA (OpenAI-compatible)
- `AI_MODEL`: modelo a usar (ejemplo: `gpt-4o-mini`)
- `AI_BASE_URL`: endpoint base de API compatible (por defecto `https://api.openai.com/v1`)
- `TWILIO_WHATSAPP_CONTENT_SID`: Content SID `HX...` de la plantilla aprobada de WhatsApp. Si está presente, `send-preventive-reminders` la usa para enviar recordatorios.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`: credenciales para envios WhatsApp desde Twilio.
- `SUPABASE_ANON_KEY`: requerido por `send-veterinary-consent-whatsapp` para validar JWT de quien dispara el envio automatico.
- `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_NOTIFICATION_EMAIL`: requeridos por `send-feedback` para enviar las sugerencias/reclamos por email (mismo servicio que usan `send-clinical-pdf` y `send-preventive-reminders`).
- `RESEND_WEBHOOK_SECRET`: signing secret que entrega Resend al crear el webhook `email.received` (Resend → Webhooks). Usado por `inbound-email-webhook` para verificar la firma svix antes de procesar el evento.
- `GUIDE_NOTIFICATIONS_API_KEY`: clave propia (inventada) que valida el header `x-guide-notifications-key` en `send-guide-notifications`, para que solo el workflow de GitHub Actions pueda dispararla.
- `NEWS_CAMPAIGNS_API_KEY`: clave propia (inventada) que valida el header `x-news-campaigns-key` en `send-news-campaigns`.
- `BLOG_NOTIFICATIONS_API_KEY`: clave propia (inventada) que valida el header `x-blog-notifications-key` en `send-blog-post-notifications`, para que solo el workflow de GitHub Actions pueda dispararla.
- `GOOGLE_PLACES_API_KEY`: API key de Google Cloud con "Places API (New)" habilitada y facturacion activa, usada por `search-google-places` para complementar los resultados de OpenStreetMap. Nunca se expone al frontend (solo vive en este secret de servidor).
- `GOOGLE_PLACES_MONTHLY_LIMIT` (opcional): cantidad maxima de llamadas reales a Google que hace `search-google-places` por mes calendario, antes de pasar a servir solo cache. Default `1000` (cuota gratis del SKU mas restrictivo que usa la funcion). Subirlo tiene costo real en Google Cloud.

### Lugares y veterinarias via Google Places (`search-google-places`)

- Se invoca desde `PetFriendlyPlacesSection.tsx` y `NearbyVetsMapSection.tsx` (funcion `fetchGooglePlacesByZone` en `src/lib/supabase.ts`) ademas de la consulta a OpenStreetMap/Overpass, para complementar zonas donde OSM tiene poca cobertura.
- Para `pet_friendly_place` solo se guardan resultados donde Google marca explicitamente `allowsDogs = true` (campo real de Places API New); si Google no tiene ese dato cargado para un lugar, no se muestra.
- Para `veterinary` se usa el tipo `veterinary_care` sin filtro adicional.
- Los resultados se cachean por zona (lat/lng redondeados a 2 decimales, ~1km) en `public.external_places_cache` / `public.external_places_cache_zones` (migracion `048_external_places_cache.sql`). Una zona ya consultada no se vuelve a pedir a Google hasta pasados 30 dias, para acotar el costo de la API paga. La escritura la hace unicamente esta funcion (service role); la lectura es publica.
- Limite de cuota mensual (migracion `049_google_places_usage_limit.sql`): cada llamada real a Google (no cache hit) se cuenta en `public.google_places_api_usage` por mes calendario. Al llegar a `GOOGLE_PLACES_MONTHLY_LIMIT` la funcion deja de llamar a Google hasta el mes siguiente y responde solo con lo que ya haya cacheado. Asi, al principio hay pocas zonas cubiertas, pero a medida que usuarios de distintas zonas van consultando la app el cache se completa solo, y la cuota que sobra cada mes se destina a refrescar zonas ya cacheadas (`public.external_places_cache_zones.query_count` registra que zonas se consultan mas seguido, para priorizarlas a futuro).

### Campañas de novedades a medida (`send-news-campaigns`)

- Panel en la app: Admin → pestaña "Novedades" (`AdminNewsCampaignsSection.tsx`). El admin redacta asunto, texto, imagen y boton opcionales, y programa fecha/hora de envio; el registro se guarda en `public.news_campaigns` (RLS admin-only).
- `send-news-campaigns` se dispara cada 15 minutos por `.github/workflows/send-news-campaigns.yml` (o manualmente), busca campanias con `status = 'scheduled'` cuyo `scheduled_at` ya llego, envia el email (mismo formato visual que `send-guide-notifications`) a todos los usuarios con `news_opt_in = true`, y marca la campania como `sent`/`failed`.
- Requiere los mismos secrets de Resend que `send-preventive-reminders` (`RESEND_API_KEY`, `EMAIL_FROM`, `APP_BASE_URL`, `EMAIL_LOGO_URL`) mas `NEWS_CAMPAIGNS_API_KEY`.
- Secret de GitHub Actions a crear: `NEWS_CAMPAIGNS_API_KEY` (mismo valor que el secret de Supabase).

### Aviso por email de guias nuevas (`send-guide-notifications`)

- Se dispara por cron (`.github/workflows/send-guide-notifications.yml`, diario) o manualmente desde GitHub Actions.
- Lee `${APP_BASE_URL}/guides-feed.json` (generado en cada build por `scripts/generate-sitemap.mjs` a partir de `src/data/petGuides.ts`) para saber que guias ya estan publicadas.
- Compara contra la tabla `public.notified_guides` para detectar guias todavia no avisadas.
- Para cada guia nueva, envia un email (con boton "Leer la guia") a todos los usuarios con `news_opt_in = true` en `public.users`, y despues registra la guia en `notified_guides` para no repetir el aviso.
- Requiere los mismos secrets de Resend que `send-preventive-reminders` (`RESEND_API_KEY`, `EMAIL_FROM`, `APP_BASE_URL`, `EMAIL_LOGO_URL`) mas `GUIDE_NOTIFICATIONS_API_KEY`.
- Secret de GitHub Actions a crear: `GUIDE_NOTIFICATIONS_API_KEY` (mismo valor que el secret de Supabase).

### Aviso por email de posts nuevos del blog (`send-blog-post-notifications`)

- Se dispara por cron (`.github/workflows/send-blog-notifications.yml`, diario) o manualmente desde GitHub Actions.
- Consulta `public.blog_posts` directamente (service role) filtrando `status = 'published'` — los drafts generados por el cron de IA (`api/cron/generate-blog-post.js`) nunca se notifican, solo lo que un admin aprobo desde Admin → Blog (`AdminBlogSection.tsx`).
- Compara contra la tabla `public.notified_blog_posts` para detectar posts publicados todavia no avisados (mismo patron que `notified_guides`).
- Para cada post nuevo, envia un email (con boton "Leer el artículo") a todos los usuarios con `news_opt_in = true` en `public.users`, y despues registra el post en `notified_blog_posts` para no repetir el aviso.
- Requiere los mismos secrets de Resend que `send-preventive-reminders` (`RESEND_API_KEY`, `EMAIL_FROM`, `APP_BASE_URL`, `EMAIL_LOGO_URL`) mas `BLOG_NOTIFICATIONS_API_KEY`.
- Secret de GitHub Actions a crear: `BLOG_NOTIFICATIONS_API_KEY` (mismo valor que el secret de Supabase).

### Buzon de correo entrante (`notificacion@aipetfriendly.ar`)

- `inbound-email-webhook` (publica, `--no-verify-jwt`): recibe el webhook `email.received` de Resend, verifica la firma svix con `RESEND_WEBHOOK_SECRET`, pide el contenido completo a la API de Resend (`GET /emails/receiving/{id}`) y lo guarda en la tabla `inbound_emails`.
- `admin-reply-inbound-email` (requiere JWT de un usuario en `admin_users`): envia una respuesta via Resend con headers `In-Reply-To`/`References` para mantener el hilo, y guarda la respuesta en `inbound_email_replies`.
- Panel en la app: pestaña "Buzon" dentro de Admin → `AdminInboxSection.tsx`.
- Configuracion externa (una sola vez, ya realizada en Resend + DNS del proyecto): dominio con "Habilitar recepcion" activado (registro MX en la raiz del dominio) y un Webhook apuntando a `inbound-email-webhook` con el evento `email.received`.

## Storage Bucket

Crear un bucket **privado** en Supabase Storage llamado `clinical-pdfs`.
La funcion rechaza buckets publicos o ausentes. No crea ni cambia buckets
automaticamente. Los enlaces firmados duran 7 dias y el correo lleva adjunto.

## PDF clinico (Etapa 5.3.1)

- Descarga local gratuita para cuentas Free/Premium, sin invocar el servicio
  de envio ni consumir cupo.
- Correo Free: 2 por mes calendario; Premium: 5 por dia calendario, zona
  `America/Argentina/Buenos_Aires`. Gracia y `canceled_pending` usan Premium
  solo mientras [user_premium_effective](../migrations/067_subscription_grace_active_pet.sql)
  concede acceso completo. Guest y Auth anonima no pueden enviar.
- Un solo cupo por cuenta para historial, libreta sanitaria y medicacion.
- Los tres informes deben enviar `pet_id` (UUID). Despues de autenticar el JWT,
  la Edge consulta `pets` con el cliente administrativo y comprueba existencia
  y `user_id` contra la identidad verificada, antes de reservar, subir o enviar.
  Mascota inexistente: 404; ajena o identificador invalido: 403; error de consulta:
  503 sin envio. La propiedad permite enviar tambien en Free y para mascotas
  protegidas: no se exige permiso de edicion ni Premium.
  El PDF sigue generado por el cliente: esta validacion NO certifica su
  contenido ni prueba que corresponda a los registros clinicos de la mascota.
  No cambia el hash/idempotencia de 069/070 ni la recuperacion de pendientes.
  Coordinar despliegue de Edge y frontend: clientes anteriores sin `pet_id`
  recibiran rechazo, sin consumo de cupo. La descarga local no se modifica.
- Dependencias: migracion [069](../migrations/069_clinical_pdf_send_quota.sql)
  (con preflight de 066/067) y [070](../migrations/070_clinical_pdf_recovery_reconciliation.sql),
  bucket privado y secrets existentes `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`.
  No se agregan secrets de cliente ni se acepta el plan/user_id del payload.
- La reserva RPC, exclusiva de service role, serializa operaciones por usuario
  mediante advisory lock transaccional. `get_clinical_pdf_quota()` solo consulta
  `auth.uid()`; el ledger no es accesible por anon/authenticated.
- UUID `requestId` obligatorio por envio y hash del contenido normalizado.
  Reintentar el mismo envio exige mismos bytes, destinatario y UUID.
  Un confirmado devuelve exito sin reenviar; una clave con otro contenido se
  rechaza. El cliente persiste solamente el UUID por cuenta/informe en
  localStorage, antes de generar el documento. No persiste PDF, email, JWT
  ni datos clinicos. Web Locks impide crear claves distintas simultaneamente
  para ese informe entre componentes/pestanas (requiere HTTPS y navegador
  compatible; falla explicitamente si no esta disponible).
  Al remontar consulta el estado propio con JWT fijo: `not_found` permite
  reintento explicito con el mismo UUID; un pendiente nunca vuelve a enviarse;
  `sent` confirma sin transporte y limpia la referencia; `failed` la limpia y
  pide otra accion explicita. El siguiente envio intencional tiene otro UUID.
  Cambiar destinatario no esquiva una operacion pendiente del mismo informe.
  Si se borra el almacenamiento local, la lista RPC sigue mostrando las
  reservas del servidor; conservar sus identificadores para soporte.
  No se deduplican globalmente documentos iguales: pueden enviarse
  intencionalmente otra vez con nueva clave, consumiendo el cupo correspondiente.
- El transporte captura/verifica la sesion original y vuelve a comprobarla
  antes de invocar la Edge. Usa Authorization explicito con ese JWT y
  AbortSignal ante cambios de cuenta, sin permitir sustitucion por el token
  de otra cuenta. Un aborto despues de iniciar la red conserva la referencia
  para consultar el resultado; no demuestra que el proveedor no lo acepto.
- La UI consulta cupo/pendientes al montar, cambiar cuenta/suscripcion, vencer
  expiresAt/graceUntil, cambiar ventana, recuperar foco y finalizar un envio.
  Los eventos se agrupan (200 ms), sin polling; el boton consulta sin enviar.
- Tope tecnico separado: 10 intentos por 24 h, incluidos fallidos. Permite
  cinco envios antes y cinco despues de medianoche; fallos repetidos pueden
  activar el tope aun cuando quede cupo comercial.

### Fallos y conciliacion

`reserved -> sending -> sent`; los fallos previos al proveedor o rechazos
inequivocos 4xx (excepto 408/409) pasan a `failed` y liberan cupo comercial,
pero siguen contando como intentos tecnicos. Una nueva solicitud usa otro UUID.
Timeout, error de red, 408/409/5xx o falta de confirmacion conservan reserva
(`uncertain`, o estado previo si la base no responde). Nunca se reenvian
automaticamente: ni al vencer un lease ni al repetirse un UUID.
Ademas se envia al proveedor una clave de idempotencia derivada de cuenta/UUID.

Las reservas pendientes cuentan en el periodo de su creacion; no se borran
ni liberan por tiempo. Una caida entre reserva y envio puede retener cupo sin
haber enviado correo. La migracion 070 agrega consultas propias por `auth.uid()`
y `reconcile_clinical_pdf_send`, exclusivamente para `service_role`.
Nunca se concede al usuario acceso al ledger ni transiciones administrativas.
La transicion normal preserva el ID Resend existente ante un parametro null;
si falla confirmar `sent`, la Edge conserva ese ID al intentar `uncertain`
y lo registra junto con cuenta/UUID si tambien falla SQL.

Procedimiento administrativo (solo ejecutar en entorno autorizado):

1. Identificar cuenta y UUID exactos mediante la lista de pendientes o logs.
   Suspender nuevos envios y esperar que terminen las ejecuciones en vuelo
   antes de resolver `reserved`/`sending`; no conciliar una llamada activa.
2. Consultar Resend y los logs usando el ID conocido y/o la clave
   `clinical-pdf/<user_id>/<request_id>`. Un timeout, antiguedad o ausencia
   momentanea en un listado NO prueba que no hubo envio.
3. Si no hay evidencia concluyente, no cambiar el estado ni reenviar.
   Si hubo aceptacion, resolver `sent` indicando ID Resend. Solo resolver
   `failed` con confirmacion concluyente de no aceptacion y sin ID conocido.
   Una aceptacion con posterior rebote no permite devolver cupo.
4. Desde un proceso administrativo de confianza con service_role (nunca
   desde React), invocar la RPC con todos estos parametros:

   ```text
   reconcile_clinical_pdf_send(
     p_user: UUID de cuenta, p_request: UUID de operacion,
     p_status: sent | failed, p_actor: identificador del operador,
     p_reason: motivo explicito (10..2000 caracteres),
     p_evidence: referencia verificable a logs/consulta del proveedor (10..4000),
     p_provider_id: ID Resend para sent, null para failed sin aceptacion
   )
   ```

   `p_actor` es una atribucion declarada por el backend administrativo
   confiable; la RPC no permite a usuarios finales declararla.
   No incluir JWT, API keys, PDF ni datos clinicos en la evidencia.
5. Verificar resultado y registro en `clinical_pdf_reconciliations`: actor,
   instante, motivo, evidencia, estados anterior/final y proveedor. Estado y
   auditoria se confirman juntos bajo el mismo lock por cuenta. El servicio
   solo puede leer directamente la auditoria, no insertarla/editarla/borrarla.
   Una operacion terminal no puede volver a resolverse ni liberar su cupo.
6. La UI puede consultar el resultado y retirar la referencia terminal;
   cualquier envio posterior requiere una accion intencional y otro UUID.

No reciclar UUID ni borrar registros confirmados. Los PDF subidos antes de
un fallo pueden quedar huerfanos en Storage; su limpieza/retencion debe
autorizarse por separado, sin usar el bucket como contador comercial.

### Validacion y activacion pendientes

Pruebas locales mockeadas: `tests/clinicalPdfPolicy.test.mjs`,
`tests/clinicalPdfEdge.test.mjs`, `tests/clinicalPdfFrontend.test.mjs`.
Pruebas SQL preparadas: [069_clinical_pdf_send_quota.test.sql](../tests/069_clinical_pdf_send_quota.test.sql)
y [070_clinical_pdf_recovery_reconciliation.test.sql](../tests/070_clinical_pdf_recovery_reconciliation.test.sql).
No sustituye una prueba de concurrencia real: verificar solicitudes paralelas
con UUID distintos (solo 2/5 reservas aceptadas) y con el mismo UUID (un unico
envio) en una instancia local antes de autorizar despliegue.

No se ejecutaron SQL/pgTAP, `deno check` ni integracion real con Storage/Resend:
faltan PostgreSQL/Supabase local y Deno. No se aplicaron migraciones, commits,
deploys ni cambios remotos. La UI muestra error explicito si falta la 069,
y la Edge falla cerrado sin enviar. Si falta 070, la recuperacion/consulta
de pendientes falla explicitamente, nunca genera una segunda clave.

Orden exacto: baseline 001..065 -> 066 -> 067 -> 069 -> 070.
No existe una migracion 068 en este repositorio. La 069 aborta antes de crear
objetos si faltan guards, permisos/RLS protegidos de 066 o funciones/columnas
de 067; 070 verifica la presencia de 069. No modificar 066/067.
En una base local desechable probar tambien los fallos de preflight,
omitiendo 066 y luego 067 por separado: no deben quedar objetos de 069.

Activacion futura, solo con autorizacion: validar 066/067/069/070 en local,
ejecutar pgTAP y concurrencia, comprobar bucket privado/remitente, y coordinar
RPC + Edge + frontend. Para rollback, suspender envios y revertir Edge/UI;
conservar ledger y claves de idempotencia (no borrar reservas ni volver al
emisor antiguo mientras existan envios sin confirmar).

## Uso

Desde el cliente React se usa el cliente autenticado centralizado de
[supabase.ts](../../src/lib/supabase.ts), no una anon key como identidad.
Formato HTTP de referencia (Authorization debe llevar el JWT de la sesion):

```typescript
const response = await fetch(`${supabaseUrl}/functions/v1/send-clinical-pdf`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify({
    requestId: crypto.randomUUID(), // Reutilizar junto con los mismos bytes al reintentar
    pet_id: 'uuid-de-la-mascota-propia',
    email: 'usuario@example.com',
    fileName: 'informe-clinico-mascota.pdf',
    pdfBytes: [...], // Array de bytes del PDF
  }),
});
```

### Chat IA contextual por mascota

```typescript
const { data, error } = await supabase.functions.invoke('pet-ai-chat', {
  body: {
    petId: 'uuid-de-la-mascota',
    question: 'Hace dos dias que no quiere comer, que hago?',
    recentMessages: [
      { role: 'user', content: '...' },
      { role: 'assistant', content: '...' },
    ],
    // Opcional: foto para que la IA la analice (ej. una mancha en la piel).
    // Data URL base64 (png/jpeg/webp), ya redimensionada/comprimida en el cliente.
    imageBase64: 'data:image/jpeg;base64,...',
  },
});

if (error) throw error;
console.log(data.answer);
// Si se envio imageBase64 y el usuario esta autenticado, data.imageUrl trae la
// URL publica ya persistida en el bucket de Storage "chat-images" (se crea
// solo, la primera vez que se usa). Para invitados siempre viene en null.
// data.recommendVetVisit (boolean) indica si la IA considera que la mascota
// deberia ser atendida presencialmente por un veterinario (mas alla del
// descargo de responsabilidad de rutina que va en toda respuesta).
```

También acepta un modo especial `mode: 'weight_insight'` (usado internamente por
`usePetFood.ts` al registrar un nuevo peso con cambio significativo respecto al
anterior): recibe `{ petId, question, recentMessages: [], mode: 'weight_insight',
previousWeightKg, currentWeightKg, daysBetween }`, genera un aviso proactivo corto
comparando el cambio contra lo esperable para esa raza/especie/edad, puede sugerir
un producto "control de peso" o recomendar visita veterinaria (misma logica de
marcadores ocultos que el chat normal), y NO consume el cupo de consultas IA del
usuario (no toca `ai_pet_usage` ni `ai_query_logs`).


### Asesor contextual de tienda

`pet-ai-chat` tambien acepta `{ mode: 'shopping', petId, question, shoppingProductIds: [] }`.
El frontend envia solo IDs (hasta ocho); el servidor obtiene perfil, catalogo activo, especificaciones e historial desde Supabase. No acepta precios, propietario ni plan enviados por el cliente. Conserva verificacion de propiedad, proteccion de mascota activa y cupos existentes; en guest usa el contexto habitual, sin catalogo privado.

El prompt de sistema de compras y [shoppingPrompt.mjs](_shared/shoppingPrompt.mjs) excluyen diagnosticos, dosis, precios inventados y recomendaciones clinicas. El contexto shopping no consulta historial clinico. Los reintentos conservan IDs de productos; siguen el manejo y los limites habituales del chat.

Requiere [071/072 y su orden de activacion](../../SUPABASE_SETUP.md#tienda-personalizada-migraciones-071-y-072). El despliegue autorizado de esta funcion debe incluir sus modulos compartidos, sin `--no-verify-jwt`. No requiere otro proveedor IA ni secrets nuevos; reutiliza `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` y los secretos incorporados de Supabase.

### Radar de productos (descubrimiento e investigacion)

`scripts/sync-ml-products.mjs` reutiliza infraestructura y ahora ejecuta Radar diario opt-in:

- Descubrimiento: `claim_shop_radar_run` + ranking oficial por subcategoria (`/highlights/MLA/category/{id}`), maximo 5 candidatos por dia.
- Investigacion: `claim_shop_radar_research` + consulta de publicacion oficial (`/items/{id}` y opcional descripcion), con lease e idempotencia.
- Aprobacion: siempre manual via `admin_review_shop_radar`; el script no publica automaticamente.
- Precios (`update-shop-prices.mjs`) sigue separado y no dispara una nueva investigacion del producto.

Variables opt-in por nombre (sin mostrar valores):
- `SHOP_RADAR_ENABLED`
- `SHOP_RADAR_RESEARCH_ENABLED`
- `ML_APP_ID`, `ML_APP_SECRET`, `ML_REFRESH_TOKEN`

### Sugerencias y reclamos (Mi Cuenta)

```typescript
const { data, error } = await supabase.functions.invoke('send-feedback', {
  body: {
    userId: user?.id ?? null,
    name: 'Juan Perez',
    email: 'juan@example.com',
    type: 'sugerencia', // 'sugerencia' | 'reclamo' | 'otro'
    message: 'Estaria bueno poder...',
    page: 'mi-cuenta',
  },
});

if (error) throw error;
```

Guarda el mensaje en la tabla `feedback_messages` (visible solo para admins via RLS) y envia un email a `ADMIN_NOTIFICATION_EMAIL` con `reply-to` al email del usuario, para poder responderle directamente desde el mismo hilo de correo.
