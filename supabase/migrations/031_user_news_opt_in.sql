-- Consentimiento para recibir novedades del sitio por email (nuevas guias, tips,
-- funcionalidades nuevas). Se pide al registrarse (opt-in explicito, sin marcar
-- por defecto) y se puede cambiar despues desde "Mi Cuenta". Mismo patron que
-- whatsapp_opt_in (migracion 010_user_whatsapp_opt_in.sql).

alter table public.users
  add column if not exists news_opt_in boolean not null default false,
  add column if not exists news_opt_in_at timestamptz,
  add column if not exists news_opt_in_source text;

create index if not exists idx_users_news_opt_in on public.users(news_opt_in);
