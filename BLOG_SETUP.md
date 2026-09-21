# Configuracion del Blog "Tips del dia" (pipeline automatico de IA)

## Que hace

Todos los dias a las 07:00 (hora Argentina, UTC-3) Vercel dispara un Cron Job
que genera automaticamente un post nuevo para `/blog`:

1. Busca noticias recientes en SerpApi (1 sola busqueda/dia, eligiendo un
   subtema entre una lista fija evitando los usados en los ultimos 10 posts,
   para no repetir siempre el mismo eje -ej. alimentacion- ni gastar de mas
   la cuota gratuita mensual).
2. Le pide a la IA (mismo proveedor que el consultorio) que elija la mejor
   noticia y redacte un articulo corto en tono "veterinaria influencer".
3. Genera una imagen con DALL-E y la sube a Supabase Storage. La especie/raza
   protagonista de la imagen (y, si encaja, del ejemplo del articulo) tambien
   rota evitando las usadas en los ultimos 10 posts, para que no se repita
   siempre el mismo tipo de mascota.
4. Guarda el post en la tabla `blog_posts` (migraciones
   `supabase/migrations/041_blog_posts.sql` y
   `supabase/migrations/050_blog_posts_topic_variety.sql`, esta ultima agrega
   las columnas `topic`/`pet_focus` usadas para chequear el historial).
5. Si la imagen se genero bien, arma ademas un borrador de publicacion para
   redes sociales (titulo, imagen con el logo de AiPetFriendly estampado -con
   el fondo del logo removido para que no tape la foto-, un extracto del
   articulo a modo de "tip" y el link a `/blog/{slug}`) y lo inserta en
   `social_posts` con `status='draft'`, `media_type='image'` y
   `source='blog_auto'` (migracion
   `supabase/migrations/052_social_posts_draft_source.sql`). Este borrador NO
   se publica solo: queda esperando en Admin > Publicaciones para que un
   admin revise el texto/imagen, elija redes y horario, y lo apruebe.
   Si falla (falta el logo, error de Storage, etc.) no afecta la generacion
   del post del blog: solo queda sin borrador de redes para ese post.
6. Unos minutos despues, un segundo Cron Job (`api/cron/generate-blog-social-video.js`)
   busca ese borrador (mientras siga en `status='draft'` y `media_type='image'`)
   y lo convierte en un video corto "Ken Burns" (zoom lento con ffmpeg sobre
   la misma imagen), actualizando el mismo registro a `media_type='video'`.
   Se separo en un cron aparte a proposito: generar el video es lo mas lento
   del pipeline y el cron principal ya gasta su presupuesto de 60s en
   SerpApi/IA texto/IA imagen: si el video fallara por falta de tiempo, el
   post entero corria riesgo. Con presupuesto propio y completo, este segundo
   cron puede usar mejor calidad de encoding sin apuro. Si por algun motivo
   no logra generar el video, el borrador simplemente se queda con la imagen
   fija (nunca rompe nada).

Archivos relevantes:
- `api/cron/generate-blog-post.js` — funcion serverless que corre el pipeline principal (post + imagen + borrador social con imagen).
- `api/cron/generate-blog-social-video.js` — segundo cron que convierte ese borrador a video Ken Burns cuando hay tiempo de sobra.
- `vercel.json` — define el horario de ambos Cron Jobs (`crons`).
- `src/components/BlogSection.tsx` — paginas publicas `/blog` y `/blog/{slug}`.
- `src/components/BlogTeaser.tsx` — vidriera de "Tips del dia" en home y landing.

## Variables de entorno a cargar en Vercel

Repo -> Vercel Project -> Settings -> Environment Variables:

| Variable | Descripcion |
| --- | --- |
| `SUPABASE_URL` | Ya deberia existir (usada por `api/mercadopago`). |
| `SUPABASE_SERVICE_ROLE_KEY` | Ya deberia existir (idem). |
| `SERPAPI_KEY` | Clave de [serpapi.com](https://serpapi.com/) (plan free = 250 busquedas/mes; este cron usa ~31/mes). |
| `AI_API_KEY` | Clave de OpenAI (o proveedor compatible). Si ya usas `pet-ai-chat` en Supabase, es una cuenta separada: esta variable vive en Vercel, no en Supabase. |
| `AI_MODEL` | Opcional, default `gpt-4o-mini` (texto del articulo). |
| `AI_BASE_URL` | Opcional, default `https://api.openai.com/v1`. |
| `AI_IMAGE_MODEL` | Opcional, default `dall-e-3` (requiere que la cuenta de `AI_API_KEY` tenga acceso a generacion de imagenes). |
| `CRON_SECRET` | Recomendado en produccion: Vercel envia automaticamente `Authorization: Bearer <CRON_SECRET>` en cada ejecucion del cron si esta variable existe, y el endpoint la valida. Sin esta variable el endpoint queda sin autenticacion. |

Nota sobre imagenes: si la cuenta de `AI_API_KEY` no tiene acceso a DALL-E 3,
el pipeline **no falla**: publica el post igual, sin imagen, y loguea el error
en la consola de Vercel (ver "Deployments" -> función -> "Logs").

## Probar manualmente

```powershell
Invoke-RestMethod -Method GET -Uri "https://tu-dominio.com/api/cron/generate-blog-post" -Headers @{ Authorization = "Bearer TU_CRON_SECRET" }
```

Si ya existe un post generado hoy, la respuesta es `{"skipped": true, ...}` sin
gastar llamadas a SerpApi ni a la IA (evita duplicados si el cron se dispara
mas de una vez el mismo dia).

Para forzar el paso del video sobre el ultimo borrador pendiente (sin esperar
al cron automatico):

```powershell
Invoke-RestMethod -Method GET -Uri "https://tu-dominio.com/api/cron/generate-blog-social-video" -Headers @{ Authorization = "Bearer TU_CRON_SECRET" }
```

Si no hay ningun borrador en `status='draft'` + `media_type='image'`, la
respuesta es `{"skipped": true, ...}`.

## Deploy pendiente

1. Aplicar la migracion: `npx supabase db push --project-ref apejkczbthvbxoksmlye`
   (incluye la migracion 050 con las columnas de variedad de tema/mascota).
2. Cargar las variables de entorno de la tabla de arriba en Vercel.
3. Redeployar en Vercel para que tome el nuevo `vercel.json` (2 Cron Jobs) y
   las funciones `api/cron/generate-blog-post.js` +
   `api/cron/generate-blog-social-video.js`.
4. Probar la ejecucion manual (ver arriba) antes de esperar al cron automatico.
