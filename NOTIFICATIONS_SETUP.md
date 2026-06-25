# Configuracion de avisos (Email, WhatsApp y Pop-up)

## Estado actual (ya configurado)

- Migracion aplicada: `supabase/migrations/006_notification_logs.sql`
- Funcion desplegada: `send-preventive-reminders`
- Funcion URL:
  - `https://apejkczbthvbxoksmlye.supabase.co/functions/v1/send-preventive-reminders`
- Secret cargado en Supabase:
  - `REMINDERS_API_KEY`
- Pop-up in-app activo para recordatorios pendientes/vencidos.
- Workflow automatico creado para ejecutar cada 30 minutos:
  - `.github/workflows/send-reminders.yml`

## Lo que falta (manual)

## 1) Cargar secretos de proveedores en Supabase

Necesitas cuentas activas en Resend y Twilio.

```bash
npx supabase secrets set RESEND_API_KEY=re_xxx
npx supabase secrets set EMAIL_FROM="AiPetFriendly <notificaciones@tu-dominio.com>"

npx supabase secrets set TWILIO_ACCOUNT_SID=ACxxxxxxxx
npx supabase secrets set TWILIO_AUTH_TOKEN=xxxxxxxx
npx supabase secrets set TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

Notas:
- `EMAIL_FROM` debe ser remitente validado en Resend.
- `TWILIO_WHATSAPP_FROM` depende de tu sandbox o numero productivo.

## 2) Crear secret en GitHub Actions

El workflow automatico necesita este secret del repo:

- Nombre: `REMINDERS_API_KEY`
- Valor: el mismo que cargaste en Supabase.

Ruta en GitHub:
- Repo -> Settings -> Secrets and variables -> Actions -> New repository secret

## 3) Probar ejecucion manual

### Desde terminal local (PowerShell)

```powershell
$REM_KEY = "TU_REMINDERS_API_KEY"
Invoke-RestMethod -Method POST -Uri "https://apejkczbthvbxoksmlye.supabase.co/functions/v1/send-preventive-reminders" -Headers @{ "x-reminders-key" = "$REM_KEY" }
```

### Desde GitHub Actions

- Repo -> Actions -> workflow `Send Preventive Reminders` -> Run workflow

## 4) Verificar funcionamiento en la app

1. Crea una tarea en Agenda con:
   - `Activar recordatorios`
   - Canal `Push`, `Email` y/o `WhatsApp`
2. Si usas WhatsApp, completa `notificationPhone` con formato internacional, por ejemplo `+54911...`.
3. Para pop-up, entra de nuevo a la app y revisa alertas en pantalla.

## Troubleshooting rapido

- No llega email:
  - Verifica `RESEND_API_KEY` y que `EMAIL_FROM` este validado.
- No llega WhatsApp:
  - Verifica SID/TOKEN y formato `whatsapp:+...` del sender.
  - Verifica sandbox de Twilio autorizado.
- El workflow falla:
  - Confirma que el secret de GitHub `REMINDERS_API_KEY` exista.
- No sale pop-up:
  - La tarea debe estar pendiente, con recordatorios activos, y vencida/hoy.
