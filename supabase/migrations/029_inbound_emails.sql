-- Bandeja de entrada para correos recibidos en notificacion@aipetfriendly.ar (Resend Inbound).
-- El insert lo hace la Edge Function "inbound-email-webhook" con la service role key
-- (no pasa por RLS), asi que solo hace falta politicas de lectura para admins + RPCs.

create table if not exists public.inbound_emails (
  id uuid primary key default gen_random_uuid(),
  resend_email_id text not null unique,
  message_id text,
  in_reply_to text,
  from_address text not null,
  to_addresses text[] not null default '{}',
  subject text,
  html_body text,
  text_body text,
  received_at timestamp with time zone not null default now(),
  is_read boolean not null default false,
  replied_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

create index if not exists idx_inbound_emails_from_address on public.inbound_emails(from_address);
create index if not exists idx_inbound_emails_received_at on public.inbound_emails(received_at desc);

alter table public.inbound_emails enable row level security;

drop policy if exists "Admins can view inbound emails" on public.inbound_emails;
create policy "Admins can view inbound emails" on public.inbound_emails
  for select using (
    exists (select 1 from public.admin_users au where au.user_id = auth.uid())
  );

-- Respuestas enviadas desde el panel admin, para mostrar el historial de la conversacion.
create table if not exists public.inbound_email_replies (
  id uuid primary key default gen_random_uuid(),
  inbound_email_id uuid not null references public.inbound_emails(id) on delete cascade,
  admin_user_id uuid references public.users(id) on delete set null,
  body text not null,
  resend_message_id text,
  created_at timestamp with time zone default now()
);

create index if not exists idx_inbound_email_replies_inbound_email_id on public.inbound_email_replies(inbound_email_id);

alter table public.inbound_email_replies enable row level security;

drop policy if exists "Admins can view inbound email replies" on public.inbound_email_replies;
create policy "Admins can view inbound email replies" on public.inbound_email_replies
  for select using (
    exists (select 1 from public.admin_users au where au.user_id = auth.uid())
  );

create or replace function public.admin_list_inbound_emails()
returns table (
  id uuid,
  message_id text,
  from_address text,
  to_addresses text[],
  subject text,
  html_body text,
  text_body text,
  received_at timestamp with time zone,
  is_read boolean,
  replied_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.admin_users au where au.user_id = auth.uid()
  ) then
    raise exception 'No autorizado';
  end if;

  return query
  select ie.id, ie.message_id, ie.from_address, ie.to_addresses,
         ie.subject, ie.html_body, ie.text_body, ie.received_at, ie.is_read, ie.replied_at
  from public.inbound_emails ie
  order by ie.received_at desc
  limit 300;
end;
$$;

grant execute on function public.admin_list_inbound_emails() to authenticated;

create or replace function public.admin_list_inbound_email_replies(p_inbound_email_id uuid)
returns table (
  id uuid,
  body text,
  created_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.admin_users au where au.user_id = auth.uid()
  ) then
    raise exception 'No autorizado';
  end if;

  return query
  select r.id, r.body, r.created_at
  from public.inbound_email_replies r
  where r.inbound_email_id = p_inbound_email_id
  order by r.created_at asc;
end;
$$;

grant execute on function public.admin_list_inbound_email_replies(uuid) to authenticated;

create or replace function public.admin_mark_inbound_email_read(p_inbound_email_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.admin_users au where au.user_id = auth.uid()
  ) then
    raise exception 'No autorizado';
  end if;

  update public.inbound_emails set is_read = true where id = p_inbound_email_id;
  return true;
end;
$$;

grant execute on function public.admin_mark_inbound_email_read(uuid) to authenticated;
