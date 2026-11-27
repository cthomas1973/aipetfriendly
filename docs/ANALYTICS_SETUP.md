# Medicion web: Google Tag Manager + GA4

- Contenedor GTM: `GTM-NKKZ8ZF5`
- Propiedad GA4: `G-WNZLHW2NJB` (se configura **solo dentro de GTM**; no esta en el codigo)
- No instalar `gtag.js` en el codigo ni otra integracion de Analytics (duplicaria las visitas).
  `src/lib/analytics.test.ts` falla si aparece `gtag`, el ID de GA4 o un segundo snippet de GTM en `index.html`.

## Estrategia unica

**La app emite `virtual_page_view` y GTM es el unico que envia `page_view` a GA4.**
Se apagan todas las mediciones automaticas de paginas (carga y cambios de historial), tanto en GTM como en GA4,
para que no haya duplicados ni URLs sin sanear.

---

## 1. Ya implementado en el codigo

| Que | Donde |
|---|---|
| Snippet de GTM en `<head>` (antes de AdSense) y `<noscript>` en `<body>`. Llega a todas las rutas, incluidas `/blog/*`, `/guias/*` y las publicas, porque `middleware.js` y `api/content-status.js` parten del mismo `index.html`. | `index.html` |
| Evento `virtual_page_view` en `dataLayer` con `page_path`, `page_location`, `page_title`. | `src/lib/analytics.ts` |
| Emision: una vez en la carga inicial y una por cada cambio real de pagina o seccion (`pushState`, `replaceState`, Atras/Adelante y cambios de pestaña sin cambio de URL). No se repite si la pagina/seccion no cambia. Espera 50 ms para descartar renders intermedios. Si GTM aun no termino de cargar, el evento queda en cola en `dataLayer` y se procesa al cargar. | `useEffect` en `src/App.tsx` |
| Saneo: nunca se envia query ni hash. En la Home solo se conserva `?tab=<seccion>`. Los enlaces `/?tab=map&vet_claim=…&ref=…` se miden como `/?tab=map`. `/mascota/*`, `/m/*`, `/chapita/*`, `/t/*` se miden como `…/:codigo` con titulo generico. | `src/lib/analytics.ts` |
| La app no envia a `dataLayer` emails, nombres, datos de mascotas, contenido de chat ni de formularios (el evento tiene solo 4 campos). | `src/lib/analytics.ts` |
| Tests: saneo, forma del evento y que `index.html` tenga una sola integracion. | `src/lib/analytics.test.ts` |

## 2. Estado real del contenedor `GTM-NKKZ8ZF5` (diagnosticado el 2026-11-27)

Verificado leyendo el `gtm.js` publicado (`https://www.googletagmanager.com/gtm.js?id=GTM-NKKZ8ZF5`), solo lectura:

| Pregunta | Resultado |
|---|---|
| ¿Etiqueta Google con `G-WNZLHW2NJB`? | **No.** El ID no aparece, ni ningun otro `G-…` / `AW-…`. |
| ¿Etiquetas GA4 o eventos? | **No.** `tags` vacio. |
| ¿Medicion automatica de paginas vistas / historial? | **No** (no hay etiqueta que la ejecute). |
| ¿Recopilacion de datos proporcionados por el usuario? | **No** (no existe esa configuracion). |
| ¿Activadores y variables? | **Ninguno propio.** `predicates` y `rules` vacios; solo variables internas de URL/host/ruta/referrer que GTM incluye siempre. |

**El contenedor esta vacio: hay que configurarlo desde cero.** No hay nada que adaptar ni desactivar.
Hasta que se configure y publique, el sitio carga GTM pero **no se mide nada ni se envia ningun dato** a Google
(por eso desplegar el codigo antes de configurar no expone datos; solo deja la medicion en cero).

Limites de este diagnostico:

- Solo se ve la version **publicada**. Un borrador o un espacio de trabajo sin publicar no aparece: si ya se
  empezo a configurar algo, revisarlo en el panel antes de seguir.
- No se ve el lado de GA4 (flujo web, Medicion mejorada, redaccion de datos). Se debe revisar en el panel.
- El contenedor anterior `GTM-PJ4482HJ` conserva su configuracion vieja (etiqueta Google con todas las mediciones
  automaticas y datos de usuario activos). **El codigo ya no lo carga.** No reutilizar su configuracion ni
  volver a poner su ID.

Para volver a comprobar el estado publicado:
`curl "https://www.googletagmanager.com/gtm.js?id=GTM-NKKZ8ZF5"` y revisar que el bloque `"resource"` tenga las
etiquetas esperadas (`"tags":[ … ]`).

## 3. Procedimiento: secuencia correcta de configuracion, pruebas y publicacion

Los nombres de menu pueden variar levemente segun el idioma o la version de la interfaz de Google.
Hacer los pasos **en este orden**: primero GA4 (para que nada se envie sin sanear), despues GTM en un espacio de trabajo,
probar sin publicar, publicar y recien despues desplegar el codigo.

### Paso A. GA4 (antes de tocar GTM)

Ruta: GA4 > Administrar > flujo de datos web de `G-WNZLHW2NJB`. Confirmar ademas que el flujo existe y pertenece
a la cuenta correcta.

1. **Medicion mejorada** (engranaje del flujo):
   - **Vistas de pagina > Avanzado**: desactivar **"Cambios de pagina segun eventos del historial del navegador"**.
     **Es obligatorio.** Segun la documentacion de Google, con Medicion mejorada activa GA4 envia `page_view` por cambios de
     historial **aunque** la etiqueta tenga `send_page_view=false`; sin este paso cada navegacion interna contaria dos veces
     (el automatico, con la URL completa y query, y el propio saneado).
   - Desactivar tambien: **Scrolls**, **Clics salientes**, **Busqueda en el sitio**, **Interacciones con formularios**,
     **Interaccion con videos**, **Descargas de archivos**.
   - Queda activa solo *Vistas de pagina* (no se puede apagar).
2. **Administrar > Recopilacion y modificacion de datos > Recopilacion de datos**: desactivar la
   **recopilacion de datos proporcionados por el usuario** (*User-provided data collection*), si esta activa.
3. **Flujo web > Redaccion de datos (Redact data)**:
   - Activar la redaccion de **Correo electronico**.
   - En **Parametros de consulta de URL**, agregar estas claves (se enmascaran en `page_location` y `page_referrer`):
     `email, vet_claim, place_claim, ref, pet_messages, token, access_token, refresh_token, code, payment`.
   - El evento propio ya viene sin query; esto es una defensa adicional para cualquier otro evento o error de configuracion.
     `tab` no se redacta a proposito: es la seccion de la app y no es un dato personal.

### Paso B. GTM: configurar en un espacio de trabajo (sin publicar)

Ruta: `tagmanager.google.com` > contenedor `GTM-NKKZ8ZF5` > **Espacio de trabajo**.

1. **Etiqueta Google** (Etiquetas > Nueva > *Etiqueta de Google*):
   - ID de etiqueta: `G-WNZLHW2NJB`.
   - Activador: **Initialization – All Pages**.
   - Configuracion: agregar el parametro `send_page_view` = `false` (evita el `page_view` automatico de la carga inicial).
   - Ajustes de la etiqueta Google (**Mostrar todo**):
     - **Permitir funciones de datos proporcionados por el usuario** (*Allow user-provided data capabilities*) →
       **desactivar**. Verificarlo explicitamente: por defecto viene activo y recolectaria email, telefono y direccion.
     - **Administrar la deteccion automatica de eventos** → apagar **Vistas de pagina por cambio en el historial del
       navegador**, **Scrolls**, **Clics salientes**, **Interacciones con formularios**, **Interaccion con videos** y
       **Descargas de archivos**. (*Vistas de pagina* de carga no se puede apagar aqui; la cubre `send_page_view=false`.)
2. **Variables** (Variables > Nueva > *Variable de capa de datos*, version 2):

   | Nombre | Nombre de la variable de capa de datos |
   |---|---|
   | `DLV - page_path` | `page_path` |
   | `DLV - page_location` | `page_location` |
   | `DLV - page_title` | `page_title` |

3. **Activador** (Activadores > Nuevo):
   - Nombre: `CE - virtual_page_view`.
   - Tipo: **Evento personalizado**; nombre del evento `virtual_page_view` (coincidencia exacta, sin regex).
   - Se activa en: **Todos los eventos personalizados**.
4. **Etiqueta de evento GA4** (Etiquetas > Nueva > *Evento de Google Analytics: GA4*):
   - Nombre: `GA4 - page_view (SPA)`.
   - ID de medicion: `G-WNZLHW2NJB`.
   - Nombre del evento: `page_view`.
   - Parametros del evento:

     | Parametro | Valor |
     |---|---|
     | `page_location` | `{{DLV - page_location}}` |
     | `page_path` | `{{DLV - page_path}}` |
     | `page_title` | `{{DLV - page_title}}` |

   - Activador: **solo** `CE - virtual_page_view`. No agregar *Todas las paginas* ni *Cambio en el historial*: duplicarian.
5. **No crear** variables integradas de clic o formulario (Click Text, Form ID, etc.), etiquetas HTML personalizadas que lean
   el DOM, ni `user_id` / propiedades de usuario con datos de la cuenta.

### Paso C. Probar sin publicar (Vista previa + DebugView)

La Vista previa funciona con una pagina que ya incluya el snippet, aunque el contenedor no este publicado. Como el sitio
publico aun no carga GTM, probar contra el codigo local:

1. Levantar el sitio con el codigo de este repositorio (`npm run dev`, o `npm run build` + `npm run preview`).
2. En GTM, **Vista previa** (Tag Assistant) con la URL local (por ejemplo `http://localhost:5173`).
3. Recorrer: **Home → Blog → una guia → Mascotas → Agenda → Home → Atras → Adelante**.
4. Resultado esperado, en cada paso y en la carga inicial:
   - La etiqueta Google dispara una vez en *Initialization* y **no** envia `page_view`.
   - `GA4 - page_view (SPA)` dispara **una vez** por cada evento `virtual_page_view`.
   - Ninguna etiqueta dispara por historial, scroll, formularios ni clics.
5. En **GA4 > Administrar > DebugView**: un `page_view` por paso, con `page_location` sin `?` salvo `?tab=…`, sin codigos de
   mascota/chapita y sin parametros de la lista de redaccion. Si aparece **mas de un** `page_view` por paso o alguno con la
   URL completa, **no publicar**: revisar los pasos A.1 y B.1.

### Paso D. Publicar el contenedor

Solo si el Paso C salio limpio: GTM > **Enviar (Submit)** > **Publicar**, con un nombre de version descriptivo
(p. ej. "GA4 page_view SPA via virtual_page_view").

### Paso E. Desplegar el codigo (requiere autorizacion expresa; este documento no lo ejecuta)

Con el contenedor ya publicado, desplegar el cambio de `index.html` y `src/`. Hacerlo en este orden evita medir en cero.
(Si se desplegara antes, el sitio cargaria un contenedor vacio: no se envia nada, pero tampoco se mide.)

### Paso F. Verificar en produccion

- **GA4 > Informes > Tiempo real** y **DebugView** (Vista previa de GTM apuntando a `https://www.aipetfriendly.ar`): navegar y
  confirmar un unico `page_view` por navegacion real y la carga inicial.
- Revisar que `page_location` no contenga `vet_claim`, `place_claim`, `ref`, `email`, tokens ni codigos de mascota/chapita.
- Dar un par de dias y comprobar en GA4 que los usuarios y las vistas no estan inflados (señal de duplicados).

### Rollback

- Medicion: GTM > Versiones > volver a publicar la version anterior (o pausar las etiquetas y publicar).
- Codigo: revertir `index.html` (GTM deja de cargarse).

---

## 4. Privacidad y consentimiento

### Advertencia

- **Nunca** reactivar en este contenedor ni en GA4: datos proporcionados por el usuario (email, telefono, direccion),
  medicion automatica de formularios, historial, clics, scroll, videos o descargas. Esto enviaria URLs con query y
  datos de formularios (la app tiene formularios con email y datos de mascotas).
- **Nunca** enviar a GA4 emails, nombres, telefonos, datos de mascotas, contenido del chat ni de formularios, ni como
  parametro ni como propiedad de usuario. No configurar `user_id` con el ID de Supabase salvo decision explicita y base legal.
- El `page_location` que llega a GA4 debe tener solo ruta y, en la Home, `?tab=<seccion>`.

### Parametros que se redactan en GA4

`email, vet_claim, place_claim, ref, pet_messages, token, access_token, refresh_token, code, payment` (mas la redaccion de
correo electronico). Si se agregan nuevos parametros privados a la app, sumarlos a esta lista.

### Consentimiento (pendiente de decision del titular)

- **No hay banner ni Consent Mode**; una vez publicado el contenedor, GTM y GA4 se cargan siempre. `PublicLegalPages.tsx`
  (seccion 4) declara cookies propias y de terceros para analitica y publicidad, pero el usuario no tiene control.
  No se implemento un consentimiento ficticio.
- UE/EEE/Reino Unido: requiere consentimiento previo → CMP con Consent Mode v2 (`analytics_storage` en `denied` por defecto y
  actualizado al aceptar) y ajustar el disparo de las etiquetas de GA4. Para Argentina no se asumio un requisito de opt-in:
  validarlo con asesoria legal y actualizar la politica de privacidad (finalidad, proveedor Google, derechos).
- En GA4, mantener desactivados **Google Signals** y la personalizacion de anuncios salvo decision expresa.
- Mientras no haya consentimiento, la medicion se limita a visitantes anonimos y paginas vistas, sin `user_id` ni datos del usuario.
- La app Android (Capacitor) carga el mismo `index.html` y tambien enviaria datos; si no se quiere medir, filtrar en GA4 por nombre de host.
