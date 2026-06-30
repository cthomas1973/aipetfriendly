-- Perfil persistente de WhatsApp y consentimiento del usuario

alter table public.users
  add column if not exists whatsapp_phone text,
  add column if not exists whatsapp_opt_in boolean not null default false,
  add column if not exists whatsapp_opt_in_at timestamptz,
  add column if not exists whatsapp_opt_in_source text;

create index if not exists idx_users_whatsapp_opt_in on public.users(whatsapp_opt_in);
