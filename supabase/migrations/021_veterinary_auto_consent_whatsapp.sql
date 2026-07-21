-- Envio automatico de solicitud de consentimiento por WhatsApp al alcanzar respaldo comunitario.

alter table public.veterinary_profiles
  add column if not exists consent_whatsapp_sent_at timestamptz,
  add column if not exists consent_whatsapp_last_error text;

create index if not exists idx_veterinary_profiles_consent_pending
  on public.veterinary_profiles (status, upvotes_count, consent_requested_at, consent_whatsapp_sent_at);

create table if not exists public.veterinary_notification_logs (
  id uuid primary key default gen_random_uuid(),
  veterinary_id uuid not null references public.veterinary_profiles(id) on delete cascade,
  channel text not null check (channel in ('whatsapp')),
  target text not null,
  status text not null check (status in ('accepted', 'queued', 'sending', 'sent', 'delivered', 'read', 'undelivered', 'failed')),
  provider_message_id text,
  provider_status text,
  provider_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_veterinary_notification_logs_veterinary_id
  on public.veterinary_notification_logs(veterinary_id);

create index if not exists idx_veterinary_notification_logs_provider_message_id
  on public.veterinary_notification_logs(provider_message_id);
