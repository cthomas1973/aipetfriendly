-- Amplia estados y tracking de entrega para notification_logs

alter table public.notification_logs
  drop constraint if exists notification_logs_status_check;

alter table public.notification_logs
  add constraint notification_logs_status_check
  check (status in ('accepted', 'queued', 'sending', 'sent', 'delivered', 'read', 'undelivered', 'failed'));

alter table public.notification_logs
  add column if not exists provider_status text,
  add column if not exists delivered_at timestamptz,
  add column if not exists last_status_at timestamptz;

create index if not exists idx_notification_logs_provider_message_id on public.notification_logs(provider_message_id);
