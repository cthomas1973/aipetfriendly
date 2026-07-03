---
name: release-readiness
description: "Usar cuando se necesite checklist de salida, pre-merge o pre-deploy para validar build, riesgos y compatibilidad de cambios frontend/Supabase en AiPetFriendly."
---

# Release Readiness

## Cuando usar
- Antes de merge a rama principal.
- Antes de deploy a Vercel o cambios en Supabase.
- Cuando una tarea toca varios dominios (UI + hooks + DB/edge).

## Workflow
1. Clasificar alcance del cambio:
   - Frontend solamente
   - Supabase/edge solamente
   - Mixto
2. Ejecutar validacion base:
   - `npm run build`
3. Verificaciones por dominio:
   - Frontend: revisar consistencia de tipos en `src/types/index.ts` y estado global/contexto.
   - Supabase: revisar migracion nueva y compatibilidad en `src/lib/supabase.ts`.
   - Auth/sync: validar ruta guest -> autenticado.
4. Riesgos y rollback:
   - Enumerar riesgo principal.
   - Definir rollback minimo (revert de commit o rollback de migracion si aplica).
5. Salida esperada:
   - Resumen de validaciones ejecutadas.
   - Riesgos remanentes.
   - Recomendacion final: listo / no listo.

## Referencias
- [AGENTS.md](../../../AGENTS.md)
- [README.md](../../../README.md)
- [SUPABASE_SETUP.md](../../../SUPABASE_SETUP.md)
- [NOTIFICATIONS_SETUP.md](../../../NOTIFICATIONS_SETUP.md)
