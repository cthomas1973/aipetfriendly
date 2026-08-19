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
  },
});

if (error) throw error;
console.log(data.answer);
```

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
