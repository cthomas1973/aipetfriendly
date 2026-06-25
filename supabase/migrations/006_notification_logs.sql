-- Log de notificaciones para evitar envios duplicados por tarea/canal/fecha.

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.preventive_tasks(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp')),
  target text not null,
  scheduled_date date not null,
  status text not null check (status in ('sent', 'failed')),
  provider_message_id text,
  provider_response jsonb,
  created_at timestamptz not null default now(),
  unique (task_id, channel, scheduled_date)
);

create index if not exists idx_notification_logs_task_id on public.notification_logs(task_id);
create index if not exists idx_notification_logs_scheduled_date on public.notification_logs(scheduled_date);

alter table public.notification_logs enable row level security;

create policy "Users can view their own notification logs" on public.notification_logs
  for select using (
    exists (
      select 1
      from public.preventive_tasks pt
      join public.pets p on p.id = pt.pet_id
      where pt.id = notification_logs.task_id
        and p.user_id = auth.uid()
    )
  );
