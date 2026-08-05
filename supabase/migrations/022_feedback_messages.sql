-- Mensajes de sugerencias y reclamos enviados por usuarios desde "Mi Cuenta".
-- El insert lo hace la Edge Function "send-feedback" con la service role key
-- (no pasa por RLS), asi que solo hace falta una politica de lectura para admins.

create table if not exists public.feedback_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  name text,
  email text not null,
  type text not null default 'sugerencia' check (type in ('sugerencia', 'reclamo', 'otro')),
  message text not null,
  page text,
  created_at timestamp with time zone default now()
);

create index if not exists idx_feedback_messages_created_at on public.feedback_messages(created_at desc);

alter table public.feedback_messages enable row level security;

drop policy if exists "Admins can view feedback messages" on public.feedback_messages;
create policy "Admins can view feedback messages" on public.feedback_messages
  for select using (
    exists (select 1 from public.admin_users au where au.user_id = auth.uid())
  );
