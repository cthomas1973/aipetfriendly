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

### Buzon de correo entrante (`notificacion@aipetfriendly.ar`)

- `inbound-email-webhook` (publica, `--no-verify-jwt`): recibe el webhook `email.received` de Resend, verifica la firma svix con `RESEND_WEBHOOK_SECRET`, pide el contenido completo a la API de Resend (`GET /emails/receiving/{id}`) y lo guarda en la tabla `inbound_emails`.
- `admin-reply-inbound-email` (requiere JWT de un usuario en `admin_users`): envia una respuesta via Resend con headers `In-Reply-To`/`References` para mantener el hilo, y guarda la respuesta en `inbound_email_replies`.
- Panel en la app: pestaña "Buzon" dentro de Admin → `AdminInboxSection.tsx`.
- Configuracion externa (una sola vez, ya realizada en Resend + DNS del proyecto): dominio con "Habilitar recepcion" activado (registro MX en la raiz del dominio) y un Webhook apuntando a `inbound-email-webhook` con el evento `email.received`.

## Storage Bucket

Crear un bucket en Supabase Storage llamado `clinical-pdfs` con políticas públicas de lectura.

## Uso

Desde el cliente React:

```typescript
const response = await fetch(`${supabaseUrl}/functions/v1/send-clinical-pdf`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify({
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
