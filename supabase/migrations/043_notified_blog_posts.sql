-- Registro de posts del blog ya notificados por email a los usuarios con
-- news_opt_in=true, para que la funcion edge "send-blog-post-notifications"
-- (disparada por cron) no reenvie el mismo aviso en cada ejecucion.
-- Mismo patron que 032_notified_guides.sql pero para public.blog_posts.

create table if not exists public.notified_blog_posts (
  slug text primary key,
  notified_at timestamptz not null default now(),
  users_notified integer not null default 0
);

alter table public.notified_blog_posts enable row level security;
-- Sin policies: solo el service role (usado por la funcion edge) puede leer/escribir.
