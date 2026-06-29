-- Configuracion y consumo de consultas IA por mascota

create table if not exists public.ai_usage_settings (
  singleton boolean primary key default true,
  guest_limit_per_pet integer not null default 3 check (guest_limit_per_pet >= 0),
  free_limit_per_pet integer not null default 10 check (free_limit_per_pet >= 0),
  premium_limit_per_pet integer not null default 100 check (premium_limit_per_pet >= 0),
  updated_at timestamp with time zone not null default now()
);

insert into public.ai_usage_settings (singleton, guest_limit_per_pet, free_limit_per_pet, premium_limit_per_pet)
values (true, 3, 10, 100)
on conflict (singleton) do nothing;

create table if not exists public.ai_pet_usage (
  user_id uuid not null references public.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  usage_count integer not null default 0 check (usage_count >= 0),
  updated_at timestamp with time zone not null default now(),
  primary key (user_id, pet_id)
);

create index if not exists idx_ai_pet_usage_user_id on public.ai_pet_usage(user_id);
create index if not exists idx_ai_pet_usage_pet_id on public.ai_pet_usage(pet_id);

alter table public.ai_usage_settings enable row level security;
alter table public.ai_pet_usage enable row level security;

drop policy if exists "Public can view ai usage settings" on public.ai_usage_settings;
create policy "Public can view ai usage settings" on public.ai_usage_settings
  for select using (true);

drop policy if exists "Users can view own ai pet usage" on public.ai_pet_usage;
create policy "Users can view own ai pet usage" on public.ai_pet_usage
  for select using (auth.uid() = user_id);

create or replace function public.get_ai_usage_settings()
returns table (
  guest_limit_per_pet integer,
  free_limit_per_pet integer,
  premium_limit_per_pet integer
)
language sql
security definer
set search_path = public
as $$
  select
    s.guest_limit_per_pet,
    s.free_limit_per_pet,
    s.premium_limit_per_pet
  from public.ai_usage_settings s
  where s.singleton = true
  limit 1;
$$;

create or replace function public.admin_get_ai_usage_settings()
returns table (
  guest_limit_per_pet integer,
  free_limit_per_pet integer,
  premium_limit_per_pet integer
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
  select
    s.guest_limit_per_pet,
    s.free_limit_per_pet,
    s.premium_limit_per_pet
  from public.ai_usage_settings s
  where s.singleton = true
  limit 1;
end;
$$;

create or replace function public.admin_update_ai_usage_settings(
  p_guest_limit integer,
  p_free_limit integer,
  p_premium_limit integer
)
returns void
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

  if p_guest_limit < 0 or p_free_limit < 0 or p_premium_limit < 0 then
    raise exception 'Los limites no pueden ser negativos';
  end if;

  insert into public.ai_usage_settings (singleton, guest_limit_per_pet, free_limit_per_pet, premium_limit_per_pet, updated_at)
  values (true, p_guest_limit, p_free_limit, p_premium_limit, now())
  on conflict (singleton) do update
    set guest_limit_per_pet = excluded.guest_limit_per_pet,
        free_limit_per_pet = excluded.free_limit_per_pet,
        premium_limit_per_pet = excluded.premium_limit_per_pet,
        updated_at = now();
end;
$$;

create or replace function public.get_user_pet_ai_usage()
returns table (
  pet_id uuid,
  usage_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select u.pet_id, u.usage_count
  from public.ai_pet_usage u
  where u.user_id = auth.uid();
end;
$$;

grant execute on function public.get_ai_usage_settings() to anon, authenticated;
grant execute on function public.get_user_pet_ai_usage() to authenticated;
grant execute on function public.admin_get_ai_usage_settings() to authenticated;
grant execute on function public.admin_update_ai_usage_settings(integer, integer, integer) to authenticated;
