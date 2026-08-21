-- Campañas de email personalizadas creadas desde Admin -> pestaña "Novedades".
-- Permite al admin redactar un correo (texto, imagen opcional, boton con link) y
-- programar fecha/hora de envio a todos los usuarios con news_opt_in = true.
-- El envio real lo hace la funcion edge "send-news-campaigns" (service role,
-- disparada por cron), no pasa por RLS. Las policies de abajo solo gobiernan el
-- acceso directo del panel admin (crear, listar, cancelar).

create table if not exists public.news_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body_text text not null,
  image_url text,
  button_text text,
  button_url text,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  users_notified integer not null default 0,
  error_message text
);

create index if not exists idx_news_campaigns_status_scheduled_at
  on public.news_campaigns(status, scheduled_at);

alter table public.news_campaigns enable row level security;

drop policy if exists "Admins can manage news campaigns" on public.news_campaigns;
create policy "Admins can manage news campaigns" on public.news_campaigns
  for all using (
    exists (select 1 from public.admin_users au where au.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.admin_users au where au.user_id = auth.uid())
  );
