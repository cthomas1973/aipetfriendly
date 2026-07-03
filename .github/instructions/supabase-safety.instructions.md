---
applyTo: "supabase/**,src/lib/supabase.ts,src/hooks/useSupabaseSync.ts,src/types/index.ts"
description: "Usar cuando se cambien migraciones, politicas RLS, edge functions o el cliente Supabase para evitar roturas de datos y seguridad."
---

# Instrucciones Supabase

## Objetivo
Proteger integridad de datos y seguridad RLS en cambios de base, funciones edge o capa de acceso.

## Reglas
- Todo cambio de schema requiere nueva migracion numerada en `supabase/migrations/`.
- No editar migraciones historicas ya aplicadas salvo que el usuario lo pida explicitamente.
- Si cambia DB, actualizar en el mismo trabajo:
  - consultas en `src/lib/supabase.ts`
  - tipos en `src/types/index.ts`
  - flujo de sincronizacion en `src/hooks/useSupabaseSync.ts` si aplica
- Revisar impacto de RLS/policies para lecturas y escrituras por `user_id`.
- Si se toca notificaciones o funciones edge, mantener alineacion con docs existentes.

## Archivos de referencia
- [SUPABASE_SETUP.md](../../SUPABASE_SETUP.md)
- [NOTIFICATIONS_SETUP.md](../../NOTIFICATIONS_SETUP.md)
- [supabase/functions/README.md](../../supabase/functions/README.md)
- [supabase/migrations/001_init.sql](../../supabase/migrations/001_init.sql)
- [supabase/migrations/005_admin_user_access.sql](../../supabase/migrations/005_admin_user_access.sql)

## Verificacion minima
1. Ejecutar `npm run build`.
2. Si hubo cambios en auth/sync, validar migracion guest a usuario autenticado.
3. Confirmar variables de entorno/secrets requeridas para edge functions afectadas.
