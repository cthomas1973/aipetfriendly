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
3. Privacidad: Public
4. Crea

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
