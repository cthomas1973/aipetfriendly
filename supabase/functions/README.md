# Supabase Edge Functions

## Deployment

Deploy con Supabase CLI:

```bash
supabase functions deploy send-clinical-pdf --no-verify-jwt
```

## Variables de entorno

Configurar en Supabase Dashboard:

- `SUPABASE_URL`: URL de tu proyecto Supabase
- `SUPABASE_SERVICE_ROLE_KEY`: Clave de servicio (cuidado: solo en servidor)

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
