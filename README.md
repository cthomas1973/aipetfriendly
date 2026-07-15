# Android (Windows)

Para actualizar la app Android local con los ultimos cambios frontend en Windows:

```powershell
npm run android:update
```

Ese comando:

- compila la web
- limpia caches/carpetas temporales que suelen provocar `EPERM`
- resetea permisos sobre `android/`
- ejecuta `npx cap sync android`
- abre Android Studio

Si Android Studio estaba abierto y vuelve a bloquear archivos, cierralo y corre otra vez `npm run android:update`.

# AiPetFriendly

Plataforma modular, profesional y completamente funcional para gestión de mascotas, historial clínico preventivo, consultorio virtual con IA y sistema de suscripción.

## 🎯 Características principales

### 📱 Diseño Mobile-First
- Interfaz fluida con BottomNav para navegación rápida
- Paleta de colores pet-friendly (verde suave, tonos pastel)
- Responsive design para desktop (Tailwind CSS)

### 🐾 Gestión de Mascotas
- Registro ilimitado en plan Premium (máx. 2 en plan free)
- Formulario dinámico: foto, datos generales, peso, sexo, edad
- Selección rápida de mascota activa

### 📋 Historial Clínico Completo
- Timeline unificada ordenada de más reciente a más antiguo
- Categorías: Medicamentos, Desparasitarios, Vacunas, Tratamientos, Notas clínicas
- Filtros rápidos por categoría con emojis
- Generación de PDF profesional con jsPDF (encabezado, datos mascota, foto, timeline)
- Envío de PDF por email via Edge Function Supabase

### 🤖 Consultorio Virtual IA
- Chat asistente veterinario preventivo
- Límite diario de consultas en plan free (5), ilimitadas en Premium
- Disclaimer: aclara que no reemplaza consulta presencial
- Flujo de mensajes en tiempo real

### 📅 Agenda Preventiva
- Calendario de alertas: turnos, dosis, comidas
- Tareas con estado completado/pendiente
- Categorías: Turno, Vacuna, Desparasitario, Alimentación, Otro

### 💳 Sistema de Suscripción (Paywall)
- **Plan Gratis**: 2 mascotas, 5 consultas IA/día, historial básico
- **Plan Premium**: Mascotas ilimitadas, IA ilimitada, PDF/Email, ofertas exclusivas
- Banner de estado y acceso condicionado a funciones

### 🎁 Ofertas Exclusivas
- Acceso solo para usuarios Premium
- Ejemplos: 15% OFF alimento, 2x1 antiparasitarios

## 🛠️ Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **UI Components**: Lucide React
- **Database**: Supabase (PostgreSQL + RLS)
- **Autenticación**: Supabase Auth
- **PDF**: jsPDF + html2canvas
- **Backend/Serverless**: Supabase Edge Functions
- **Package Manager**: npm

## 📦 Estructura del proyecto

```
AiPetFriendly/
├── src/
│   ├── types/              # TypeScript interfaces centrales
│   ├── context/            # AppStateContext global
│   ├── hooks/              # Lógica reutilizable
│   │   ├── useUser.ts
│   │   ├── usePets.ts
│   │   ├── useMedications.ts
│   │   ├── usePreventive.ts
│   │   ├── useClinical.ts
│   │   ├── useChat.ts
│   │   └── useSupabaseSync.ts
│   ├── lib/
│   │   └── supabase.ts     # Cliente y queries Supabase
│   ├── components/         # Componentes modulares
│   │   ├── AuthScreens.tsx
│   │   ├── PetsSection.tsx
│   │   ├── ClinicalHistorySection.tsx
│   │   ├── ChatSection.tsx
│   │   ├── AgendaSection.tsx
│   │   └── SubscriptionComponents.tsx
│   ├── App.tsx             # Componente principal + navegación
│   ├── main.tsx            # Entry point
│   └── index.css           # Estilos globales
├── supabase/
│   ├── migrations/
│   │   └── 001_init.sql    # Schema + RLS
│   └── functions/
│       └── send-clinical-pdf/
│           ├── index.ts    # Edge Function para envío de PDF
│           └── deno.json
├── index.html              # HTML root
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── .env.local              # Variables de entorno
├── .env.local.example      # Ejemplo
└── SUPABASE_SETUP.md       # Guía de setup Supabase
```

## 🚀 Deployment

### 1. Setup Local de Desarrollo

```bash
# Clonar repo
git clone <repo-url>
cd AiPetFriendly

# Instalar dependencias
npm install

# Crear .env.local con variables Supabase
cp .env.local.example .env.local
# Editar con tus claves de Supabase

# Ejecutar desarrollo
npm run dev
```

### 2. Crear proyecto Supabase

1. Ir a [supabase.com](https://supabase.com)
2. Crear nuevo proyecto
3. Ir a SQL Editor y ejecutar `supabase/migrations/001_init.sql`
4. Obtener claves (Settings > API) y agregar a `.env.local`:
   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGc...
   ```

### 3. Configurar Storage Bucket

1. Ir a Storage > New Bucket
2. Nombre: `clinical-pdfs`
3. Privacidad: Public
4. Crear

### 4. Deploy Edge Function

```bash
# Instalar Supabase CLI
npm install -g supabase

# Autenticarse
supabase login

# Deployar función
supabase functions deploy send-clinical-pdf
```

### 5. Build para Producción

```bash
npm run build
```

Genera carpeta `dist/` lista para deploy en Vercel, Netlify, GitHub Pages, etc.

## 📚 Guías

### Setup Supabase Detallado
Ver [SUPABASE_SETUP.md](SUPABASE_SETUP.md)

### Integracion Mercado Pago (suscripciones y cobro manual)

La app ya incluye:

- Suscripcion mensual automatica (debito automatico)
- Suscripcion anual automatica (debito automatico)
- Pago mensual manual (debito/credito)
- Webhook idempotente para activar/desactivar Premium en Supabase

#### Variables de entorno requeridas (Vercel)

```
MP_ACCESS_TOKEN=APP_USR-...
APP_BASE_URL=https://tu-dominio.com
MP_WEBHOOK_KEY=clave-segura-unica

MP_PLAN_MONTHLY_ID=            # opcional
MP_PLAN_ANNUAL_ID=             # opcional
MP_MONTHLY_AMOUNT_ARS=9900
MP_ANNUAL_AMOUNT_ARS=99900
MP_MONTHLY_AMOUNT_USD=9.90
MP_ANNUAL_AMOUNT_USD=99.90

USD_GATEWAY_PROVIDER=stripe
USD_GATEWAY_CREATE_SESSION_URL=
USD_GATEWAY_API_KEY=

SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
VITE_SUPABASE_ANON_KEY=...
```

#### Endpoint de webhook

Configurar en Mercado Pago:

```
https://tu-dominio.com/api/mercadopago/webhook?webhook_key=MP_WEBHOOK_KEY
```

#### Migracion SQL nueva

Aplicar `supabase/migrations/012_mercadopago_billing.sql` para crear:

- `payment_subscriptions`
- `payment_webhook_events`

Aplicar `supabase/migrations/013_billing_pricing_settings.sql` para crear:

- `billing_pricing_settings`
- RPCs de admin/public para precios ARS/USD

#### Flujo de activacion Premium

- El frontend redirige al checkout de Mercado Pago.
- El estado Premium se confirma por webhook (no por redirect).
- El webhook actualiza `subscriptions` y `users.access_mode`.

#### Ruteo por pais y moneda

- Usuarios AR: checkout via Mercado Pago en ARS.
- Usuarios no-AR: checkout preparado para pasarela USD externa (`USD_GATEWAY_CREATE_SESSION_URL`).
- Precios ARS/USD se gestionan desde la pestaña Admin y se muestran en Mi Plan.

### Crear nueva mascota
1. Ir a tab "Mascotas"
2. Llenar formulario con datos del animal
3. Clickear "Guardar mascota"
4. Si es plan free, máximo 2 mascotas

### Registrar nota clínica
1. Ir a tab "Consultorio"
2. Seleccionar mascota activa
3. En sección "Historial Clínico", hacer scroll a "+ Agregar nota clinica"
4. Llenar datos y clickear "Guardar nota"

### Generar informe PDF
1. Ir a "Consultorio" > "Historial Clínico"
2. Clickear botón "Descargar PDF"
3. Se descarga informe con encabezado, datos mascota y timeline clínica

### Enviar PDF por email
1. Clickear "Enviar Email"
2. Ingresar email destino
3. Se envía PDF generado (requiere Premium)

### Usar chat IA
1. Ir a tab "Consultorio" (segunda sección)
2. Escribir consulta veterinaria preventiva
3. El asistente responde en tiempo real
4. Plan free: 5 consultas/día; Premium: ilimitadas

### Crear alerta preventiva
1. Ir a tab "Agenda"
2. Ingresar título (ej: "Refuerzo vacuna")
3. Seleccionar fecha y categoría
4. Clickear "Guardar alerta"
5. Marcar como completada cuando se realize

## 🔐 Seguridad (Row Level Security)

Todas las tablas están protegidas con políticas RLS que garantizan:
- ✅ Usuarios solo ven sus propios datos
- ✅ No hay acceso a datos de otros usuarios
- ✅ Operaciones CRUD restringidas por user_id
- ✅ Datos sensibles protegidos a nivel BD

## 📊 Modelos de Datos

### Usuario
```typescript
{
  id: uuid,
  email: string,
  fullName?: string,
  avatarUrl?: string,
  subscription: { plan: 'free' | 'premium', isActive: boolean, expiresAt?: date }
}
```

### Mascota
```typescript
{
  id: uuid,
  userId: uuid,
  name: string,
  breed: string,
  species: 'dog' | 'cat' | 'other',
  sex: 'male' | 'female' | 'unknown',
  ageYears: number,
  ageMonths: number,
  weightKg: number,
  photoUrl?: string,
  notes?: string,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### Entrada Clínica
```typescript
{
  id: uuid,
  petId: uuid,
  category: 'medication' | 'deworming' | 'vaccine' | 'treatment' | 'clinical_note',
  title: string,
  description: string,
  eventDate: date,
  metadata?: object,
  createdAt: timestamp
}
```

## ✨ Next Steps (Futuro)

- [ ] Integración de pago real (Stripe, MercadoPago)
- [ ] Autenticación social (Google, GitHub)
- [ ] Exportación de reportes en Excel
- [ ] Recordatorios por email/SMS
- [ ] Integración con clínicas veterinarias
- [ ] Búsqueda y filtros avanzados
- [ ] Galería de fotos por mascota
- [ ] Multiidioma (ES, EN, PT)

## 📝 Licencia

Proyecto propietario © 2026 AiPetFriendly

## 👨‍💻 Autor

Desarrollado como solución modular, tipada y lista para producción.
