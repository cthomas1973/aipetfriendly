-- Agrega columnas para que el cron de generacion de posts (ver
-- api/cron/generate-blog-post.js) pueda chequear los ultimos N articulos y
-- evitar repetir subtema y especie/raza de mascota, para que el blog no se
-- vuelva monotono (ej. varios articulos seguidos de alimentacion, o varias
-- imagenes seguidas de gatos).
alter table public.blog_posts
  add column if not exists topic text,
  add column if not exists pet_focus text;

create index if not exists idx_blog_posts_created_at_topic on public.blog_posts (created_at desc, topic);
