-- Flujo incubadora + validacion comunitaria + claim profile para veterinarias.

create table if not exists public.veterinary_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  zone_label text not null,
  address text not null,
  phone_whatsapp text,
  latitude double precision,
  longitude double precision,
  status text not null default 'IN_INCUBATOR' check (status in ('IN_INCUBATOR', 'CLAIMABLE_PROFILE', 'ACTIVE_FREE', 'ACTIVE_PREMIUM')),
  suggested_by_user_id uuid references public.users(id) on delete set null,
  upvotes_count integer not null default 0,
  validations_goal integer not null default 5,
  claimed_by_owner_id uuid references public.users(id) on delete set null,
  claim_token text unique not null default replace(gen_random_uuid()::text, '-', ''),
  claim_source_ref_user_id uuid references public.users(id) on delete set null,
  is_verified boolean not null default false,
  activated_at timestamptz,
  last_validation_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint veterinary_profiles_validations_goal_check check (validations_goal > 0),
  constraint veterinary_profiles_lat_lng_check check (
    (latitude is null and longitude is null)
    or
    (latitude is not null and longitude is not null)
  )
);

create table if not exists public.veterinary_validations (
  id uuid primary key default gen_random_uuid(),
  veterinary_id uuid not null references public.veterinary_profiles(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (veterinary_id, user_id)
);

create index if not exists idx_veterinary_profiles_status_zone on public.veterinary_profiles(status, zone_label);
create index if not exists idx_veterinary_profiles_upvotes on public.veterinary_profiles(upvotes_count desc);
create index if not exists idx_veterinary_profiles_claim_token on public.veterinary_profiles(claim_token);
create index if not exists idx_veterinary_validations_veterinary on public.veterinary_validations(veterinary_id);
create index if not exists idx_veterinary_validations_user on public.veterinary_validations(user_id);

create or replace function public.touch_veterinary_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_veterinary_profile_updated_at on public.veterinary_profiles;
create trigger trg_touch_veterinary_profile_updated_at
before update on public.veterinary_profiles
for each row
execute function public.touch_veterinary_profile_updated_at();

create or replace function public.refresh_veterinary_upvotes(p_veterinary_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  select count(*)::integer
  into v_total
  from public.veterinary_validations
  where veterinary_id = p_veterinary_id;

  update public.veterinary_profiles as vp
  set
    upvotes_count = v_total,
    last_validation_at = now(),
    status = case
      when vp.claimed_by_owner_id is not null then vp.status
      when vp.status = 'IN_INCUBATOR' and v_total >= vp.validations_goal then 'CLAIMABLE_PROFILE'
      else vp.status
    end
  where vp.id = p_veterinary_id;
end;
$$;

create or replace function public.create_veterinary_suggestion(
  p_name text,
  p_zone_label text,
  p_address text,
  p_phone_whatsapp text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_claim_source_ref_user_id uuid default null
)
returns public.veterinary_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_row public.veterinary_profiles;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  insert into public.veterinary_profiles (
    name,
    zone_label,
    address,
    phone_whatsapp,
    latitude,
    longitude,
    status,
    suggested_by_user_id,
    claim_source_ref_user_id
  )
  values (
    trim(p_name),
    trim(p_zone_label),
    trim(p_address),
    nullif(trim(coalesce(p_phone_whatsapp, '')), ''),
    p_latitude,
    p_longitude,
    'IN_INCUBATOR',
    v_user_id,
    p_claim_source_ref_user_id
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.validate_veterinary(p_veterinary_id uuid)
returns public.veterinary_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_row public.veterinary_profiles;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  insert into public.veterinary_validations (veterinary_id, user_id)
  values (p_veterinary_id, v_user_id)
  on conflict (veterinary_id, user_id) do nothing;

  perform public.refresh_veterinary_upvotes(p_veterinary_id);

  select *
  into v_row
  from public.veterinary_profiles
  where id = p_veterinary_id;

  if not found then
    raise exception 'veterinary_not_found';
  end if;

  return v_row;
end;
$$;

create or replace function public.get_veterinary_claim_preview(p_claim_token text)
returns table (
  id uuid,
  name text,
  zone_label text,
  address text,
  phone_whatsapp text,
  status text,
  upvotes_count integer,
  validations_goal integer,
  is_claimed boolean,
  suggested_clients integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.veterinary_profiles;
begin
  select *
  into v_profile
  from public.veterinary_profiles
  where claim_token = trim(p_claim_token)
  limit 1;

  if not found then
    return;
  end if;

  if v_profile.claimed_by_owner_id is null and v_profile.status = 'IN_INCUBATOR' then
    update public.veterinary_profiles
    set status = 'CLAIMABLE_PROFILE'
    where id = v_profile.id;

    select *
    into v_profile
    from public.veterinary_profiles
    where id = v_profile.id;
  end if;

  return query
  select
    v_profile.id,
    v_profile.name,
    v_profile.zone_label,
    v_profile.address,
    v_profile.phone_whatsapp,
    v_profile.status,
    v_profile.upvotes_count,
    v_profile.validations_goal,
    (v_profile.claimed_by_owner_id is not null) as is_claimed,
    v_profile.upvotes_count as suggested_clients;
end;
$$;

create or replace function public.claim_veterinary_profile(
  p_claim_token text,
  p_plan text default 'free'
)
returns public.veterinary_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_profile public.veterinary_profiles;
  v_new_status text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  select *
  into v_profile
  from public.veterinary_profiles
  where claim_token = trim(p_claim_token)
  for update;

  if not found then
    raise exception 'claim_token_not_found';
  end if;

  if v_profile.claimed_by_owner_id is not null and v_profile.claimed_by_owner_id <> v_user_id then
    raise exception 'already_claimed';
  end if;

  v_new_status := case
    when lower(coalesce(p_plan, 'free')) = 'premium' then 'ACTIVE_PREMIUM'
    else 'ACTIVE_FREE'
  end;

  update public.veterinary_profiles
  set
    claimed_by_owner_id = v_user_id,
    status = v_new_status,
    activated_at = coalesce(activated_at, now()),
    claim_token = null
  where id = v_profile.id
  returning * into v_profile;

  return v_profile;
end;
$$;

grant execute on function public.create_veterinary_suggestion(text, text, text, text, double precision, double precision, uuid) to authenticated;
grant execute on function public.validate_veterinary(uuid) to authenticated;
grant execute on function public.get_veterinary_claim_preview(text) to anon, authenticated;
grant execute on function public.claim_veterinary_profile(text, text) to authenticated;

alter table public.veterinary_profiles enable row level security;
alter table public.veterinary_validations enable row level security;

drop policy if exists "Anyone can view active veterinary profiles" on public.veterinary_profiles;
drop policy if exists "Authenticated users can view incubator and claimable veterinary profiles" on public.veterinary_profiles;
drop policy if exists "Authenticated users can suggest veterinary profiles" on public.veterinary_profiles;
drop policy if exists "Authenticated users can read own veterinary validations" on public.veterinary_validations;
drop policy if exists "Authenticated users can validate veterinary once" on public.veterinary_validations;
drop policy if exists "Authenticated users can remove own veterinary validation" on public.veterinary_validations;

create policy "Anyone can view active veterinary profiles" on public.veterinary_profiles
  for select using (status in ('ACTIVE_FREE', 'ACTIVE_PREMIUM'));

create policy "Authenticated users can view incubator and claimable veterinary profiles" on public.veterinary_profiles
  for select to authenticated using (true);

create policy "Authenticated users can suggest veterinary profiles" on public.veterinary_profiles
  for insert to authenticated with check (
    auth.uid() = suggested_by_user_id and status = 'IN_INCUBATOR'
  );

create policy "Authenticated users can read own veterinary validations" on public.veterinary_validations
  for select to authenticated using (auth.uid() = user_id);

create policy "Authenticated users can validate veterinary once" on public.veterinary_validations
  for insert to authenticated with check (auth.uid() = user_id);

create policy "Authenticated users can remove own veterinary validation" on public.veterinary_validations
  for delete to authenticated using (auth.uid() = user_id);
