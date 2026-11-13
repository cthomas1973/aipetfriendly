# Entorno local de pruebas integrales

## Estado comprobado

- Node/npm están disponibles y `npm test` ejecuta Vitest.
- Docker, Supabase CLI y Deno no están disponibles en el entorno inspeccionado.
- Falta `supabase/config.toml`; existe un `supabase/.temp/project-ref`, que identifica un proyecto remoto y **no debe usarse para pruebas**.
- Existe `.env.local`, cuyo contenido no fue leído. Puede contener URLs o valores de producción; no arrancar Vite sin sobrescribir las variables `VITE_SUPABASE_*` en el proceso.
- No se creó ni instaló herramienta alguna, y no se probó ninguna escritura contra servicios.

El entorno todavía no está listo para pruebas integrales reales. Este procedimiento debe completarse primero en Docker/Supabase local. No usar `supabase link`, `db push`, `functions deploy` ni credenciales de producción.

## 1. Preparar herramientas y configuración

1. Instalar Docker Desktop y dejarlo iniciado. No es necesario instalar Supabase CLI globalmente; se ejecutará mediante `npx` con versión fijada.
2. Desde la raíz del repo, confirmar que `supabase/config.toml` sigue ausente. Entonces inicializar la configuración local:

```powershell
npx supabase@2.122.0 init
```

Esto crea configuración local; revisar el diff antes de conservarlo. No ejecutar `supabase link`: el `project-ref` que hay en `.temp` es remoto.
3. Iniciar exclusivamente el stack local y comprobar su destino:

```powershell
npx supabase@2.122.0 start
npx supabase@2.122.0 status
```

Continuar solo si `API URL` es `http://127.0.0.1:54321`, la base informa `localhost` y Studio es local. Detenerse ante cualquier URL o referencia remota.
4. Aplicar las migraciones a la base local desechable y ejecutar la prueba pgTAP de metadatos:

```powershell
npx supabase@2.122.0 db reset --local
npx supabase@2.122.0 test db
```

`db reset --local` elimina y reconstruye **la base local**; no ejecutarlo hasta confirmar el destino con `supabase status`. La migración 066 se aplica al reconstruir desde cero. `supabase test db` ejecuta [066_security_policy_metadata.test.sql](../supabase/tests/066_security_policy_metadata.test.sql) y [067_beneficios_rls_roles.test.sql](../supabase/tests/067_beneficios_rls_roles.test.sql). El primero inspecciona el catálogo; el segundo crea identidades/productos ficticios dentro de una transacción, simula roles y termina con `ROLLBACK`. Ambos siguen pendientes de ejecución real en Supabase local.

## 2. Ejecutar frontend aislado de `.env.local`

No usar `npm run dev` directamente: Vite puede leer `.env.local`. Obtener el `API_URL` y `ANON_KEY` **del Supabase local** en memoria y pasarlos al proceso, sin imprimirlos ni escribirlos a archivos:

```powershell
$statusOutput = npx supabase@2.122.0 status -o env
if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar el estado local de Supabase.' }

$localValues = @{}
foreach ($line in $statusOutput) {
  if ($line -match '^([A-Z_]+)="?(.*?)"?$') { $localValues[$matches[1]] = $matches[2].Trim('"') }
}
if ($localValues.API_URL -ne 'http://127.0.0.1:54321' -or -not $localValues.ANON_KEY) {
  throw 'Destino local no confirmado; no iniciar el frontend.'
}

$env:VITE_SUPABASE_URL = $localValues.API_URL
$env:VITE_SUPABASE_ANON_KEY = $localValues.ANON_KEY
npm run dev -- --host 127.0.0.1
```

El entorno del proceso prevalece sobre `.env.local`. No imprimir `$statusOutput`, `$localValues` ni las variables resultantes. Dirección local: `http://127.0.0.1:5173`.

## 3. Crear identidades ficticias

Usar Supabase Studio local (`http://127.0.0.1:54323`) y correos reservados como `free@example.test`, `premium@example.test`, `admin@example.test` y `admin-premium@example.test`; contraseñas ficticias creadas solo para esta instancia.

Crear primero esas cuentas desde la autenticación local/la UI, de modo que existan en `auth.users` y `public.users`. Para designar Admin, abrir el SQL Editor **solo después de verificar en el encabezado que Studio es el local** y ejecutar una sola vez por identidad:

```sql
insert into public.admin_users (user_id)
select id
from auth.users
where email = 'admin@example.test'
on conflict (user_id) do nothing;
```

La membresía se asigna desde la consola local porque es una acción privilegiada; no existe autoasignación desde el cliente. El Admin inicialmente Free prueba Admin sin Premium. Para Admin Premium, y para el usuario Premium sin Admin, usar `admin_set_user_access` desde una sesión Admin local o el flujo administrativo existente. No elevar el plan desde SQL como sustituto del flujo que se quiere probar.

Los datos de prueba (cuentas, membresías y productos) viven únicamente en la base desechable local. `supabase db reset --local` los elimina.

## 4. Prueba RLS real pendiente

El test pgTAP de metadatos por sí solo **no basta para certificar** la matriz de roles. El archivo `067_beneficios_rls_roles.test.sql` deja preparada una prueba transaccional local que establece claims/JWT de `anon` y `authenticated` para identidades ficticias e intenta CRUD antes de hacer rollback. Debe ejecutarse y corregirse si el entorno Supabase local presenta diferencias de esquema, triggers o configuración de Auth. Incluir y confirmar también:

- Lectura de activos e inactivos por público y Admin.
- Autopromoción de `users.access_mode` y `subscriptions.plan/is_active`.
- Perfil propio (campos permitidos) y fila ajena.
- Admin que pierde membresía.
- CRUD de producto y cambio de campos durante UPDATE.

No implementar ni declarar aprobada esa prueba hasta poder correrla en una base local limpia y observar resultados reales. Nunca usar usuarios reales ni producción.

## 5. Afiliación local

Las pruebas con `fetch` mockeado están en `tests/affiliateLink.test.mjs` y `tests/beneficiosAffiliateApi.test.mjs`; usan únicamente `test-affiliate-value`, que es una cadena sintética **no válida ni verificada ante Mercado Libre**. Se pueden correr sin Supabase:

```powershell
npm test -- tests/affiliateLink.test.mjs tests/beneficiosAffiliateApi.test.mjs
```

En la UI, si no hay tracking, se espera ficha/tarjeta informativa sin `<a>` comercial y el mensaje “Enlace de compra temporalmente no disponible”. No llamar al endpoint de producción, no iniciar OAuth ni generar compras para probarlo.

## 6. Edge Function

Con Deno instalado, validar estáticamente:

```powershell
deno check supabase/functions/pet-ai-chat/index.ts
```

No ejecutar `supabase functions serve` con `.env.local` ni valores de producción. Para probar pet-ai-chat en local se necesita una configuración explícitamente local y un proveedor de IA mockeado o sandbox. Esa integración no está preparada ni ejecutada en este entorno; no usar la cuota/credenciales reales.

## 7. Build y cierre

Pruebas, TypeScript y Vite build (sin regenerar sitemap/feed):

```powershell
npm test
npx tsc -p tsconfig.app.json --noEmit --incremental false
node --check api/beneficios.js
node node_modules/vite/bin/vite.js build
```

El script `npm run build` llama primero a `generate-sitemap` y puede reescribir `public/guides-feed.json`/`public/sitemap.xml`, que ya tienen cambios locales ajenos. Antes de usarlo, revisar esos cambios y preservar su contenido. `git diff --check` y `git status --short` deben mostrar que esos cambios siguen intactos.

La validación local no confirma configuración Vercel, despliegue de Edge Functions, reconocimiento real de `matt_tool` ni atribución de ventas. Esos puntos requieren una fase posterior, con autorización, sin compartir secretos.