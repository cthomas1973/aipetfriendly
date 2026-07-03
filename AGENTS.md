# AGENTS.md

Guia rapida para agentes de codigo en AiPetFriendly.

## Alcance
- App web React + TypeScript + Vite para gestion de mascotas.
- Backend en Supabase (Postgres + RLS + Edge Functions Deno).
- Hay flujo guest y flujo autenticado; no asumir siempre sesion activa.

## Comandos de trabajo
- `npm install`
- `npm run dev`
- `npm run build` (validacion principal: `tsc -b && vite build`)
- `npm run preview`

Nota: no hay scripts de test/lint en `package.json`.

## Leer primero
- [README.md](README.md)
- [SUPABASE_SETUP.md](SUPABASE_SETUP.md)
- [NOTIFICATIONS_SETUP.md](NOTIFICATIONS_SETUP.md)
- [src/types/index.ts](src/types/index.ts)
- [src/context/AppStateContext.ts](src/context/AppStateContext.ts)
- [src/lib/supabase.ts](src/lib/supabase.ts)
- [src/hooks/useSupabaseSync.ts](src/hooks/useSupabaseSync.ts)

## Arquitectura (resumen operativo)
- UI por secciones en `src/components/*Section.tsx`.
- Logica de dominio en `src/hooks/use*.ts`.
- Tipos compartidos en `src/types/index.ts` (fuente de verdad).
- Estado global en `AppStateContext`; evitar estado duplicado innecesario.
- Acceso a datos centralizado en `src/lib/supabase.ts`.

## Convenciones del proyecto
- Componentes: PascalCase (`PetsSection`).
- Hooks: `useX` con `useCallback` para operaciones async.
- Tipos de dominio: unions literales (`'free' | 'premium'`, etc.) y interfaces en `src/types/index.ts`.
- Mantener cambios acotados al dominio afectado; no reformatear archivos no relacionados.

## Reglas de cambio (importante)
- Si cambias schema SQL:
  - Crear nueva migracion en `supabase/migrations/` (numeracion incremental).
  - Ajustar consultas/tipos en `src/lib/supabase.ts` y `src/types/index.ts`.
  - Verificar impacto de RLS/politicas.
- Si cambias limites de planes (free/premium):
  - Revisar `usePets` y `useChat` para mantener consistencia funcional.
- Si tocas guest->auth:
  - Revisar cuidadosamente `useSupabaseSync.ts` (migracion y mapeo de IDs).
- Si tocas notificaciones:
  - Mantener consistencia con [NOTIFICATIONS_SETUP.md](NOTIFICATIONS_SETUP.md) y edge function `send-preventive-reminders`.

## Supabase y funciones edge
- Funciones en `supabase/functions/`:
  - `pet-ai-chat`
  - `send-clinical-pdf`
  - `send-preventive-reminders`
  - `twilio-whatsapp-status`
- Migraciones fuente de verdad en `supabase/migrations/`.
- Para detalles de deploy/secrets, enlazar docs existentes en vez de duplicar:
  - [SUPABASE_SETUP.md](SUPABASE_SETUP.md)
  - [supabase/functions/README.md](supabase/functions/README.md)

## Checklist minimo antes de cerrar cambios
1. Ejecutar `npm run build`.
2. Si se cambio flujo de datos: validar guest y autenticado.
3. Si se cambio DB/Edge: confirmar variables de entorno y compatibilidad de migraciones.
4. Describir en PR que se cambio, riesgo y rollback simple.

## Customizaciones del workspace
- Instruccion frontend: `.github/instructions/frontend-react.instructions.md`
- Instruccion Supabase: `.github/instructions/supabase-safety.instructions.md`
- Skill de salida: `.github/skills/release-readiness/SKILL.md`
