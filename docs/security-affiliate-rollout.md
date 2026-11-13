# Despliegue de seguridad de catálogo y afiliación

Este documento describe los pasos posteriores para revisar y desplegar la migración `066_beneficios_products_admin_rls.sql` y el comportamiento fail-closed de afiliación. **No se ejecutó ningún paso remoto durante la preparación local.**

## Prerrequisitos

- Confirmar qué proyecto Supabase y proyecto Vercel son los de producción; no asumir que el `project-ref` local basta.
- Revisar en Supabase las policies existentes de `beneficios_productos`, `users`, `subscriptions` y `admin_users`, además de los propietarios de las funciones `admin_*`.
- Confirmar que la migración 065 es la última aplicada y revisar diferencias de esquema antes de aplicar la 066. No aplicar si hay drift sin resolver.
- Configurar por los paneles de administración correspondientes al menos una variable de afiliación estructuralmente válida: `ML_AFFILIATE_TEMPLATE` o `ML_AFFILIATE_ID` en Vercel, y el valor equivalente entre los Edge Function Secrets de Supabase para `pet-ai-chat`. No copiar valores al repositorio, ticket ni chat.
- La validación local solo confirma formato, HTTPS, dominio y presencia única del parámetro. No prueba que Mercado Libre reconozca el identificador ni que atribuya conversiones.
- Usar usuarios de prueba separados: anónimo, Free, Premium sin Admin, Admin sin Premium y Admin Premium. No cambiar usuarios reales para probar.

## Validación local

Ejecutar pruebas sin acceso a producción:

```powershell
npm test
npx tsc -p tsconfig.app.json --noEmit --incremental false
node --check api/beneficios.js
deno check supabase/functions/pet-ai-chat/index.ts
node node_modules/vite/bin/vite.js build
```

`npm run build` primero regenera `public/guides-feed.json` y `public/sitemap.xml`. Si esos archivos tienen cambios locales, conservarlos antes de usar dicho script. El build directo de Vite valida compilación del frontend, pero no sustituye el generador de sitemap ni `deno check`.

`tests/beneficiosRlsMigration.test.mjs` comprueba el contrato estático de la migración. `supabase/tests/066_security_policy_metadata.test.sql` comprueba metadatos PostgreSQL en un entorno Supabase de prueba, pero no simula escrituras de cada identidad. La integración RLS debe ejecutarse contra una base local/aislada con Supabase CLI y Docker (`supabase test db`); esta máquina no tiene CLI, Docker ni `supabase/config.toml`, por lo que queda pendiente tanto la ejecución como la simulación real de roles. No apuntar esas pruebas al proyecto de producción.

## Orden de despliegue

1. **Preflight:** confirmar esquema y políticas instaladas; validar las variables por entorno desde los paneles sin revelar sus valores. Si la afiliación no está disponible, detener el despliegue del frontend hasta tener un plan aprobado para evitar que bundles antiguos continúen exponiendo permalinks crudos.
2. **Supabase:** revisar y aplicar la migración 066 únicamente con autorización separada. No restaurar la policy 014 basada en Premium como rollback. Si falla la aplicación, detener los cambios y revisar el estado transaccional antes de reintentar.
3. **Vercel:** desplegar el código de la rama revisada. Verificar que la API responde `affiliateAvailable: false` y `link: null` cuando la configuración está ausente en un entorno de prueba, y que un permalink incorrecto tampoco produce CTA.
4. **Edge Function:** validar y desplegar `pet-ai-chat` con el helper compartido y sus secrets configurados en Supabase. El push a GitHub no despliega esta función.
5. **Regresión:** comprobar los cinco roles contra la base aislada; revisar Tienda, Blog/Guías, Consultorio IA y análisis de peso, tanto con tracking estructuralmente válido como ausente. Confirmar que los enlaces comerciales tienen `rel="sponsored nofollow noopener noreferrer"`.
6. **Producción:** después de autorizaciones, verificar estado de deployment, migración aplicada, policies efectivas y puntos de salida. No realizar compras ni pruebas de atribución con transacciones reales.

## Rollback y respuesta a fallos

- **No revertir RLS a la policy histórica 014.** Una reversión que vuelva a permitir Premium no es segura. Si la migración 066 ya se aplicó, preferir una migración correctiva hacia delante. La migración usa transacción, por lo que un fallo durante su aplicación debe dejarla sin aplicar; confirmar el estado antes de actuar.
- Si `/api/beneficios` falla, el frontend debe conservar las fichas y filtros, pero deshabilitar los enlaces de compra. No sustituir el error por el permalink original.
- No revertir aisladamente `pet-ai-chat` a una versión que devuelva enlaces crudos. La capa cliente filtra esas respuestas en el código nuevo, pero un bundle anterior podría no hacerlo.
- Si un despliegue parcial deja clientes antiguos y tracking no validado, detener el rollout y mantener CTAs fuera de servicio hasta coordinar API, frontend y Edge Function. No cambiar secretos como medida improvisada.
- No hay un rollback SQL destructivo preparado: las policies de bloqueo deben permanecer. Cualquier ajuste posterior requiere revisión de políticas y pruebas de roles antes de otra migración.

## Verificación posterior

- RLS: probar lectura pública de activos; lectura Admin de inactivos; y CRUD denegado para anónimo, Free y Premium sin Admin. Confirmar Admin sin Premium y Admin Premium autorizados.
- Perfil/suscripción: comprobar que el bootstrap permite únicamente perfil Free y suscripción Free/inactiva, y que `access_mode`, `plan` e `is_active` no se pueden elevar desde cliente.
- Afiliación: comprobar URL absoluta HTTPS, hostname permitido, MLA preservado, exactamente un `matt_tool` y fallo cerrado para configuración ausente/inválida, respuesta de servicio fallida y permalink no permitido.
- Revisar logs sin imprimir tokens, URL de configuración, payloads secretos ni datos personales.