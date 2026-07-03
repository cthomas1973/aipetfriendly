---
applyTo: "src/**/*.{ts,tsx,css}"
description: "Usar cuando se editen componentes, hooks o estilos frontend en React/TypeScript para mantener patrones de estado y tipado del proyecto."
---

# Instrucciones Frontend React

## Objetivo
Mantener consistencia en componentes, hooks y tipos del frontend sin introducir regresiones de estado.

## Reglas
- Antes de cambiar UI, validar tipos en `src/types/index.ts` y reusar tipos existentes.
- Evitar duplicar estado global en estado local cuando ya exista en `AppStateContext`.
- En operaciones async de hooks, usar `useCallback` y manejo de errores explicito.
- Mantener cambios acotados al dominio (pets, clinical, agenda, chat, subscription, admin).
- Si un cambio impacta limites de plan (`free`/`premium`), revisar coherencia cruzada entre `usePets` y `useChat`.

## Archivos de referencia
- [src/types/index.ts](../../src/types/index.ts)
- [src/context/AppStateContext.ts](../../src/context/AppStateContext.ts)
- [src/hooks/usePets.ts](../../src/hooks/usePets.ts)
- [src/hooks/useChat.ts](../../src/hooks/useChat.ts)
- [src/hooks/usePreventive.ts](../../src/hooks/usePreventive.ts)

## Verificacion minima
1. Ejecutar `npm run build`.
2. Validar flujo guest y autenticado cuando cambie persistencia o sincronizacion.
3. Confirmar que no se rompieron unions literales ni contratos de tipos compartidos.
