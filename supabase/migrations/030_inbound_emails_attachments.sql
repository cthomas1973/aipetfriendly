-- Deteccion de adjuntos en correos entrantes (Resend Inbound).
-- No guardamos el contenido de los adjuntos en la base de datos: si un correo
-- trae adjuntos, la Edge Function "inbound-email-webhook" los reenvia (con el
-- archivo real, no solo un aviso) a ADMIN_NOTIFICATION_EMAIL para verlos desde
-- el correo personal. Aca solo persistimos si tenia adjuntos y cuantos.

alter table public.inbound_emails
  add column if not exists has_attachments boolean not null default false,
  add column if not exists attachment_count integer not null default 0;

drop function if exists public.admin_list_inbound_emails();

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
  replied_at timestamp with time zone,
  has_attachments boolean,
  attachment_count integer
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
         ie.subject, ie.html_body, ie.text_body, ie.received_at, ie.is_read, ie.replied_at,
         ie.has_attachments, ie.attachment_count
  from public.inbound_emails ie
  order by ie.received_at desc
  limit 300;
end;
$$;

grant execute on function public.admin_list_inbound_emails() to authenticated;
