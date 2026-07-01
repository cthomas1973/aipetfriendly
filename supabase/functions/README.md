# Supabase Edge Functions

## Deployment

Deploy con Supabase CLI:

```bash
supabase functions deploy send-clinical-pdf --no-verify-jwt
supabase functions deploy pet-ai-chat
```

## Variables de entorno

Configurar en Supabase Dashboard:

- `SUPABASE_URL`: URL de tu proyecto Supabase
- `SUPABASE_SERVICE_ROLE_KEY`: Clave de servicio (cuidado: solo en servidor)
- `AI_API_KEY`: API key del proveedor de IA (OpenAI-compatible)
- `AI_MODEL`: modelo a usar (ejemplo: `gpt-4o-mini`)
- `AI_BASE_URL`: endpoint base de API compatible (por defecto `https://api.openai.com/v1`)
- `TWILIO_WHATSAPP_CONTENT_SID`: Content SID `HX...` de la plantilla aprobada de WhatsApp. Si está presente, `send-preventive-reminders` la usa para enviar recordatorios.

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
