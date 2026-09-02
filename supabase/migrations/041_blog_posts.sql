-- Blog "Tips del día": posts generados automáticamente una vez por día
-- (SerpApi + IA), ver api/cron/generate-blog-post.js. Se leen publicamente
-- desde /blog y /blog/{slug} (ver src/components/BlogSection.tsx) y desde el
-- teaser de la home/landing (ver src/components/BlogTeaser.tsx).
--
-- A diferencia de la mayoria de las tablas del proyecto, esta tabla no tiene
-- datos de usuarios: es contenido publico de solo lectura. La escritura la
-- hace exclusivamente el cron job (via service role key, que bypassea RLS);
-- la lectura publica pasa por funciones security definer (sin policies
-- directas de select), mismo patron general que el resto del esquema.

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  content text not null,
  image_url text,
  source_name text,
  estimated_reading_time integer not null default 2,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_blog_posts_created_at on public.blog_posts (created_at desc);

alter table public.blog_posts enable row level security;
-- Sin policies directas: la escritura la hace el cron (service role) y la
-- lectura publica pasa por las funciones de abajo.

-- Listado publico de posts, mas recientes primero (paginado simple, para la
-- grilla de /blog y para el teaser de home/landing).
create or replace function public.list_blog_posts(p_limit integer default 20, p_offset integer default 0)
returns setof public.blog_posts
language sql
security definer
set search_path = public
stable
as $$
  select * from public.blog_posts
  order by created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
$$;

grant execute on function public.list_blog_posts(integer, integer) to anon, authenticated;

-- Detalle publico de un post por slug (para /blog/{slug}).
create or replace function public.get_blog_post_by_slug(p_slug text)
returns public.blog_posts
language sql
security definer
set search_path = public
stable
as $$
  select * from public.blog_posts where slug = p_slug limit 1;
$$;

grant execute on function public.get_blog_post_by_slug(text) to anon, authenticated;
