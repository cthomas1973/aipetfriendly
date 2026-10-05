-- Cotutores: contactos adicionales (nombre/email/whatsapp) que un titular Premium
-- puede dar de alta para que reciban los mismos avisos de Agenda que el. Por ahora
-- es solo un contacto de notificacion (sin login propio); la carga de datos la
-- sigue haciendo el titular desde su cuenta.
create table if not exists public.pet_cotutors (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  email text not null,
  whatsapp_phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pet_cotutors_name_check check (char_length(trim(name)) > 0),
  constraint pet_cotutors_email_check check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  unique (owner_user_id, email)
);

create index if not exists idx_pet_cotutors_owner on public.pet_cotutors(owner_user_id);

alter table public.pet_cotutors enable row level security;

create policy "Owners can view their own cotutors" on public.pet_cotutors
  for select using (auth.uid() = owner_user_id);
create policy "Owners can insert their own cotutors" on public.pet_cotutors
  for insert with check (auth.uid() = owner_user_id);
create policy "Owners can update their own cotutors" on public.pet_cotutors
  for update using (auth.uid() = owner_user_id);
create policy "Owners can delete their own cotutors" on public.pet_cotutors
  for delete using (auth.uid() = owner_user_id);

create or replace function public.touch_pet_cotutors_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_pet_cotutors_updated_at on public.pet_cotutors;
create trigger trg_touch_pet_cotutors_updated_at
before update on public.pet_cotutors
for each row
execute function public.touch_pet_cotutors_updated_at();

-- Defensa en profundidad: ademas de ocultar el bloque en la UI para no-premium,
-- se valida en el server que el titular sea premium y que no supere 3 cotutores.
-- security definer porque necesita leer public.users.access_mode sin depender
-- de politicas RLS de esa tabla.
create or replace function public.enforce_pet_cotutors_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access text;
  v_count integer;
begin
  select access_mode into v_access from public.users where id = new.owner_user_id;

  if v_access is distinct from 'premium' then
    raise exception 'Agregar cotutores es una funcion exclusiva para cuentas Premium';
  end if;

  select count(*) into v_count from public.pet_cotutors where owner_user_id = new.owner_user_id;
  if v_count >= 3 then
    raise exception 'Alcanzaste el limite de 3 cotutores por cuenta';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_pet_cotutors_limits on public.pet_cotutors;
create trigger trg_enforce_pet_cotutors_limits
before insert on public.pet_cotutors
for each row
execute function public.enforce_pet_cotutors_limits();

-- Habilita multiples destinatarios (titular + cotutores) por canal/tarea/dia: antes
-- solo se podia registrar un envio por tarea+canal+fecha sin importar el target.
alter table public.notification_logs
  drop constraint if exists notification_logs_task_id_channel_scheduled_date_key;

alter table public.notification_logs
  add constraint notification_logs_task_id_channel_target_scheduled_date_key
  unique (task_id, channel, target, scheduled_date);
