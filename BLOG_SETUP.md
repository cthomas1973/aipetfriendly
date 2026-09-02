# Configuracion del Blog "Tips del dia" (pipeline automatico de IA)

## Que hace

Todos los dias a las 07:00 (hora Argentina, UTC-3) Vercel dispara un Cron Job
que genera automaticamente un post nuevo para `/blog`:

1. Busca noticias recientes en SerpApi (1 sola busqueda/dia, rotando entre 4
   temas fijos para no gastar de mas la cuota gratuita mensual).
2. Le pide a la IA (mismo proveedor que el consultorio) que elija la mejor
   noticia y redacte un articulo corto en tono "veterinaria influencer".
3. Genera una imagen con DALL-E y la sube a Supabase Storage.
4. Guarda el post en la tabla `blog_posts` (migracion
   `supabase/migrations/041_blog_posts.sql`).

Archivos relevantes:
- `api/cron/generate-blog-post.js` — funcion serverless que corre el pipeline.
- `vercel.json` — define el horario del Cron Job (`crons`).
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

## Deploy pendiente

1. Aplicar la migracion: `npx supabase db push --project-ref apejkczbthvbxoksmlye`.
2. Cargar las variables de entorno de la tabla de arriba en Vercel.
3. Redeployar en Vercel para que tome el nuevo `vercel.json` (Cron Job) y la
   nueva funcion `api/cron/generate-blog-post.js`.
4. Probar la ejecucion manual (ver arriba) antes de esperar al cron automatico.
