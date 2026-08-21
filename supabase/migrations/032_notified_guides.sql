-- Registro de guias ya notificadas por email a los usuarios con news_opt_in=true,
-- para que la funcion edge "send-guide-notifications" (disparada por cron) no
-- reenvie el mismo aviso en cada ejecucion.

create table if not exists public.notified_guides (
  slug text primary key,
  notified_at timestamptz not null default now(),
  users_notified integer not null default 0
);

alter table public.notified_guides enable row level security;
-- Sin policies: solo el service role (usado por la funcion edge) puede leer/escribir.
