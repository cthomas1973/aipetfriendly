-- Lugares Pet Friendly: mismo patron de incubadora + validacion comunitaria +
-- claim de perfil + plan free/premium que veterinary_profiles (019/020), mas
-- categorias, imagen y resenas de usuarios (nuevo).

create table if not exists public.pet_friendly_places (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'otro' check (category in (
    'restaurante', 'hotel_alojamiento', 'playa', 'tienda', 'plaza_parque', 'bar_cafe', 'otro'
  )),
  name text not null,
  zone_label text not null,
  address text not null,
  phone_whatsapp text,
  phone_secondary text,
  contact_email text,
  latitude double precision,
  longitude double precision,
  status text not null default 'IN_INCUBATOR' check (status in (
    'IN_INCUBATOR', 'CLAIMABLE_PROFILE', 'ACTIVE_FREE', 'ACTIVE_PREMIUM', 'REJECTED'
  )),
  suggested_by_user_id uuid references public.users(id) on delete set null,
  upvotes_count integer not null default 0,
  validations_goal integer not null default 5,
  claimed_by_owner_id uuid references public.users(id) on delete set null,
  claim_token text unique not null default replace(gen_random_uuid()::text, '-', ''),
  claim_source_ref_user_id uuid references public.users(id) on delete set null,
  is_verified boolean not null default false,
  consent_granted boolean not null default false,
  consent_requested_at timestamptz,
  consent_response_at timestamptz,
  basic_data_confirmed boolean not null default false,
  denied_reason text,
  denied_at timestamptz,
  subscription_plan text not null default 'free' check (subscription_plan in ('free', 'premium')),
  subscription_billing_mode text check (subscription_billing_mode in ('monthly_auto', 'annual') or subscription_billing_mode is null),
  pet_policy text,
  business_days text,
  business_hours text,
  website_url text,
  instagram_url text,
  facebook_url text,
  image_url text,
  highlight_priority integer not null default 0,
  rating_avg numeric(3,2) not null default 0,
  rating_count integer not null default 0,
  activated_at timestamptz,
  last_validation_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pet_friendly_places_validations_goal_check check (validations_goal > 0),
  constraint pet_friendly_places_lat_lng_check check (
    (latitude is null and longitude is null) or (latitude is not null and longitude is not null)
  )
);

create table if not exists public.pet_friendly_place_validations (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.pet_friendly_places(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (place_id, user_id)
);

create table if not exists public.pet_friendly_place_reviews (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.pet_friendly_places(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  -- Solo el primer nombre (o 'Usuario'), calculado server-side en el upsert:
  -- evita tener que exponer via RLS el resto de la fila de public.users a
  -- cualquiera que pueda leer resenas de un lugar activo.
  author_label text not null default 'Usuario',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (place_id, user_id)
);

create index if not exists idx_pet_friendly_places_status_zone on public.pet_friendly_places(status, zone_label);
create index if not exists idx_pet_friendly_places_category on public.pet_friendly_places(category);
create index if not exists idx_pet_friendly_places_upvotes on public.pet_friendly_places(upvotes_count desc);
create index if not exists idx_pet_friendly_places_claim_token on public.pet_friendly_places(claim_token);
create index if not exists idx_pet_friendly_place_validations_place on public.pet_friendly_place_validations(place_id);
create index if not exists idx_pet_friendly_place_validations_user on public.pet_friendly_place_validations(user_id);
create index if not exists idx_pet_friendly_place_reviews_place on public.pet_friendly_place_reviews(place_id);

create or replace function public.touch_pet_friendly_place_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_pet_friendly_place_updated_at on public.pet_friendly_places;
create trigger trg_touch_pet_friendly_place_updated_at
before update on public.pet_friendly_places
for each row
execute function public.touch_pet_friendly_place_updated_at();

drop trigger if exists trg_touch_pet_friendly_place_review_updated_at on public.pet_friendly_place_reviews;
create trigger trg_touch_pet_friendly_place_review_updated_at
before update on public.pet_friendly_place_reviews
for each row
execute function public.touch_pet_friendly_place_updated_at();

create or replace function public.refresh_pet_friendly_place_upvotes(p_place_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  select count(*)::integer into v_total
  from public.pet_friendly_place_validations
  where place_id = p_place_id;

  update public.pet_friendly_places as p
  set
    upvotes_count = v_total,
    last_validation_at = now(),
    status = case
      when p.claimed_by_owner_id is not null then p.status
      when p.status = 'IN_INCUBATOR' and v_total >= p.validations_goal then 'CLAIMABLE_PROFILE'
      else p.status
    end
  where p.id = p_place_id;
end;
$$;

create or replace function public.refresh_pet_friendly_place_rating(p_place_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_avg numeric;
begin
  select count(*)::integer, coalesce(avg(rating), 0)
  into v_count, v_avg
  from public.pet_friendly_place_reviews
  where place_id = p_place_id;

  update public.pet_friendly_places
  set rating_count = v_count, rating_avg = round(v_avg, 2)
  where id = p_place_id;
end;
$$;

create or replace function public.create_pet_friendly_place_suggestion(
  p_name text,
  p_category text,
  p_zone_label text,
  p_address text,
  p_phone_whatsapp text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_claim_source_ref_user_id uuid default null
)
returns public.pet_friendly_places
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_row public.pet_friendly_places;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  insert into public.pet_friendly_places (
    name, category, zone_label, address, phone_whatsapp, latitude, longitude,
    status, suggested_by_user_id, claim_source_ref_user_id
  )
  values (
    trim(p_name),
    coalesce(nullif(trim(p_category), ''), 'otro'),
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

create or replace function public.validate_pet_friendly_place(p_place_id uuid)
returns public.pet_friendly_places
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_row public.pet_friendly_places;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  insert into public.pet_friendly_place_validations (place_id, user_id)
  values (p_place_id, v_user_id)
  on conflict (place_id, user_id) do nothing;

  perform public.refresh_pet_friendly_place_upvotes(p_place_id);

  select * into v_row from public.pet_friendly_places where id = p_place_id;
  if not found then
    raise exception 'place_not_found';
  end if;

  return v_row;
end;
$$;

create or replace function public.get_pet_friendly_place_claim_landing(p_claim_token text)
returns table (
  id uuid,
  name text,
  category text,
  zone_label text,
  address text,
  phone_whatsapp text,
  phone_secondary text,
  status text,
  upvotes_count integer,
  validations_goal integer,
  is_claimed boolean,
  suggested_clients integer,
  contact_email text,
  consent_granted boolean,
  basic_data_confirmed boolean,
  subscription_plan text,
  subscription_billing_mode text,
  pet_policy text,
  business_days text,
  business_hours text,
  website_url text,
  instagram_url text,
  facebook_url text,
  image_url text,
  place_premium_monthly_ars numeric,
  place_premium_annual_ars numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_place public.pet_friendly_places;
begin
  select * into v_place
  from public.pet_friendly_places
  where claim_token = trim(p_claim_token)
  limit 1;

  if not found then
    return;
  end if;

  if v_place.claimed_by_owner_id is null and v_place.status = 'IN_INCUBATOR' then
    update public.pet_friendly_places
    set status = 'CLAIMABLE_PROFILE', consent_requested_at = coalesce(consent_requested_at, now())
    where id = v_place.id;

    select * into v_place from public.pet_friendly_places where id = v_place.id;
  end if;

  return query
  select
    v_place.id, v_place.name, v_place.category, v_place.zone_label, v_place.address,
    v_place.phone_whatsapp, v_place.phone_secondary, v_place.status, v_place.upvotes_count,
    v_place.validations_goal, (v_place.claimed_by_owner_id is not null), v_place.upvotes_count,
    v_place.contact_email, v_place.consent_granted, v_place.basic_data_confirmed,
    v_place.subscription_plan, v_place.subscription_billing_mode, v_place.pet_policy,
    v_place.business_days, v_place.business_hours, v_place.website_url, v_place.instagram_url,
    v_place.facebook_url, v_place.image_url,
    s.place_premium_monthly_ars, s.place_premium_annual_ars
  from public.billing_pricing_settings s
  where s.singleton = true
  limit 1;
end;
$$;

create or replace function public.submit_pet_friendly_place_claim_decision(
  p_claim_token text,
  p_action text,
  p_name text default null,
  p_category text default null,
  p_zone_label text default null,
  p_address text default null,
  p_phone_whatsapp text default null,
  p_phone_secondary text default null,
  p_contact_email text default null,
  p_consent_granted boolean default null,
  p_basic_data_confirmed boolean default null,
  p_pet_policy text default null,
  p_business_days text default null,
  p_business_hours text default null,
  p_website_url text default null,
  p_instagram_url text default null,
  p_facebook_url text default null,
  p_subscription_billing_mode text default null,
  p_denied_reason text default null
)
returns public.pet_friendly_places
language plpgsql
security definer
set search_path = public
as $$
declare
  v_place public.pet_friendly_places;
  v_action text;
begin
  v_action := lower(trim(coalesce(p_action, 'correct')));

  select * into v_place
  from public.pet_friendly_places
  where claim_token = trim(p_claim_token)
  for update;

  if not found then
    raise exception 'claim_token_not_found';
  end if;

  if v_action = 'reject' then
    update public.pet_friendly_places
    set
      status = 'REJECTED',
      consent_granted = false,
      consent_response_at = now(),
      denied_reason = coalesce(p_denied_reason, denied_reason),
      denied_at = now()
    where id = v_place.id
    returning * into v_place;

    return v_place;
  end if;

  update public.pet_friendly_places
  set
    name = coalesce(nullif(trim(p_name), ''), name),
    category = coalesce(nullif(trim(p_category), ''), category),
    zone_label = coalesce(nullif(trim(p_zone_label), ''), zone_label),
    address = coalesce(nullif(trim(p_address), ''), address),
    phone_whatsapp = coalesce(nullif(trim(p_phone_whatsapp), ''), phone_whatsapp),
    phone_secondary = coalesce(nullif(trim(p_phone_secondary), ''), phone_secondary),
    contact_email = coalesce(nullif(trim(p_contact_email), ''), contact_email),
    consent_granted = coalesce(p_consent_granted, consent_granted),
    consent_requested_at = coalesce(consent_requested_at, now()),
    consent_response_at = case when p_consent_granted is not null then now() else consent_response_at end,
    basic_data_confirmed = coalesce(p_basic_data_confirmed, basic_data_confirmed),
    pet_policy = coalesce(nullif(trim(p_pet_policy), ''), pet_policy),
    business_days = coalesce(nullif(trim(p_business_days), ''), business_days),
    business_hours = coalesce(nullif(trim(p_business_hours), ''), business_hours),
    website_url = coalesce(nullif(trim(p_website_url), ''), website_url),
    instagram_url = coalesce(nullif(trim(p_instagram_url), ''), instagram_url),
    facebook_url = coalesce(nullif(trim(p_facebook_url), ''), facebook_url),
    status = case
      when v_action = 'subscribe' then 'ACTIVE_PREMIUM'
      when coalesce(p_consent_granted, consent_granted) = true then 'ACTIVE_FREE'
      else status
    end,
    subscription_plan = case when v_action = 'subscribe' then 'premium' else subscription_plan end,
    subscription_billing_mode = case
      when v_action = 'subscribe' then coalesce(nullif(trim(p_subscription_billing_mode), ''), subscription_billing_mode)
      else subscription_billing_mode
    end,
    highlight_priority = case when v_action = 'subscribe' then 100 else highlight_priority end,
    is_verified = case when v_action = 'subscribe' then true else is_verified end,
    activated_at = case
      when v_action in ('subscribe', 'correct') and coalesce(p_consent_granted, consent_granted) = true then coalesce(activated_at, now())
      else activated_at
    end,
    denied_reason = null,
    denied_at = null
  where id = v_place.id
  returning * into v_place;

  return v_place;
end;
$$;

create or replace function public.set_pet_friendly_place_image(p_claim_token text, p_image_url text)
returns public.pet_friendly_places
language plpgsql
security definer
set search_path = public
as $$
declare
  v_place public.pet_friendly_places;
begin
  update public.pet_friendly_places
  set image_url = p_image_url
  where claim_token = trim(p_claim_token)
  returning * into v_place;

  if not found then
    raise exception 'claim_token_not_found';
  end if;

  return v_place;
end;
$$;

create or replace function public.upsert_pet_friendly_place_review(
  p_place_id uuid,
  p_rating integer,
  p_comment text default null
)
returns public.pet_friendly_place_reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_author_label text;
  v_row public.pet_friendly_place_reviews;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_rating';
  end if;

  select coalesce(nullif(split_part(trim(u.full_name), ' ', 1), ''), 'Usuario')
  into v_author_label
  from public.users u
  where u.id = v_user_id;

  insert into public.pet_friendly_place_reviews (place_id, user_id, rating, comment, author_label)
  values (p_place_id, v_user_id, p_rating, nullif(trim(coalesce(p_comment, '')), ''), coalesce(v_author_label, 'Usuario'))
  on conflict (place_id, user_id) do update
    set rating = excluded.rating, comment = excluded.comment, updated_at = now()
  returning * into v_row;

  perform public.refresh_pet_friendly_place_rating(p_place_id);

  return v_row;
end;
$$;

create or replace function public.delete_pet_friendly_place_review(p_place_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  delete from public.pet_friendly_place_reviews
  where place_id = p_place_id and user_id = v_user_id;

  perform public.refresh_pet_friendly_place_rating(p_place_id);
end;
$$;

create or replace function public.admin_delete_pet_friendly_place_review(p_review_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_place_id uuid;
begin
  if not exists (select 1 from public.admin_users au where au.user_id = auth.uid()) then
    raise exception 'No autorizado';
  end if;

  delete from public.pet_friendly_place_reviews
  where id = p_review_id
  returning place_id into v_place_id;

  if v_place_id is not null then
    perform public.refresh_pet_friendly_place_rating(v_place_id);
  end if;
end;
$$;

create or replace function public.admin_list_pet_friendly_places()
returns setof public.pet_friendly_places
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admin_users au where au.user_id = auth.uid()) then
    raise exception 'No autorizado';
  end if;

  return query
  select * from public.pet_friendly_places
  order by
    case status when 'IN_INCUBATOR' then 0 when 'CLAIMABLE_PROFILE' then 1 else 2 end,
    created_at desc;
end;
$$;

create or replace function public.admin_update_pet_friendly_place(
  p_id uuid,
  p_status text default null,
  p_highlight_priority integer default null,
  p_image_url text default null
)
returns public.pet_friendly_places
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.pet_friendly_places;
begin
  if not exists (select 1 from public.admin_users au where au.user_id = auth.uid()) then
    raise exception 'No autorizado';
  end if;

  update public.pet_friendly_places
  set
    status = coalesce(nullif(trim(p_status), ''), status),
    highlight_priority = coalesce(p_highlight_priority, highlight_priority),
    image_url = coalesce(nullif(trim(p_image_url), ''), image_url)
  where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'place_not_found';
  end if;

  return v_row;
end;
$$;

-- Pricing del plan premium para lugares pet friendly: se agrega a la MISMA
-- billing_pricing_settings/RPCs compartidas que ya usa veterinaria (no una
-- pareja de RPCs aparte), para que Admin/SubscriptionComponents/SocialLanding
-- sigan leyendo un unico objeto de precios (BillingPricingSettings).
alter table public.billing_pricing_settings
  add column if not exists place_premium_monthly_ars numeric(12,2) not null default 9900,
  add column if not exists place_premium_annual_ars numeric(12,2) not null default 95000;

drop function if exists public.get_billing_pricing_settings();
create or replace function public.get_billing_pricing_settings()
returns table (
  premium_monthly_auto_ars numeric,
  premium_monthly_auto_usd numeric,
  premium_annual_auto_ars numeric,
  premium_annual_auto_usd numeric,
  premium_monthly_manual_ars numeric,
  premium_monthly_manual_usd numeric,
  veterinary_premium_monthly_ars numeric,
  veterinary_premium_annual_ars numeric,
  place_premium_monthly_ars numeric,
  place_premium_annual_ars numeric
)
language sql
security definer
set search_path = public
as $$
  select
    s.premium_monthly_auto_ars, s.premium_monthly_auto_usd,
    s.premium_annual_auto_ars, s.premium_annual_auto_usd,
    s.premium_monthly_manual_ars, s.premium_monthly_manual_usd,
    s.veterinary_premium_monthly_ars, s.veterinary_premium_annual_ars,
    s.place_premium_monthly_ars, s.place_premium_annual_ars
  from public.billing_pricing_settings s
  where s.singleton = true
  limit 1;
$$;

drop function if exists public.admin_get_billing_pricing_settings();
create or replace function public.admin_get_billing_pricing_settings()
returns table (
  premium_monthly_auto_ars numeric,
  premium_monthly_auto_usd numeric,
  premium_annual_auto_ars numeric,
  premium_annual_auto_usd numeric,
  premium_monthly_manual_ars numeric,
  premium_monthly_manual_usd numeric,
  veterinary_premium_monthly_ars numeric,
  veterinary_premium_annual_ars numeric,
  place_premium_monthly_ars numeric,
  place_premium_annual_ars numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admin_users au where au.user_id = auth.uid()) then
    raise exception 'No autorizado';
  end if;

  return query
  select
    s.premium_monthly_auto_ars, s.premium_monthly_auto_usd,
    s.premium_annual_auto_ars, s.premium_annual_auto_usd,
    s.premium_monthly_manual_ars, s.premium_monthly_manual_usd,
    s.veterinary_premium_monthly_ars, s.veterinary_premium_annual_ars,
    s.place_premium_monthly_ars, s.place_premium_annual_ars
  from public.billing_pricing_settings s
  where s.singleton = true
  limit 1;
end;
$$;

drop function if exists public.admin_update_billing_pricing_settings(numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric);
create or replace function public.admin_update_billing_pricing_settings(
  p_premium_monthly_auto_ars numeric,
  p_premium_monthly_auto_usd numeric,
  p_premium_annual_auto_ars numeric,
  p_premium_annual_auto_usd numeric,
  p_premium_monthly_manual_ars numeric,
  p_premium_monthly_manual_usd numeric,
  p_veterinary_premium_monthly_ars numeric default null,
  p_veterinary_premium_annual_ars numeric default null,
  p_place_premium_monthly_ars numeric default null,
  p_place_premium_annual_ars numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admin_users au where au.user_id = auth.uid()) then
    raise exception 'No autorizado';
  end if;

  if p_premium_monthly_auto_ars < 0
    or p_premium_monthly_auto_usd < 0
    or p_premium_annual_auto_ars < 0
    or p_premium_annual_auto_usd < 0
    or p_premium_monthly_manual_ars < 0
    or p_premium_monthly_manual_usd < 0
    or coalesce(p_veterinary_premium_monthly_ars, 0) < 0
    or coalesce(p_veterinary_premium_annual_ars, 0) < 0
    or coalesce(p_place_premium_monthly_ars, 0) < 0
    or coalesce(p_place_premium_annual_ars, 0) < 0 then
    raise exception 'Los precios no pueden ser negativos';
  end if;

  update public.billing_pricing_settings
  set
    premium_monthly_auto_ars = p_premium_monthly_auto_ars,
    premium_monthly_auto_usd = p_premium_monthly_auto_usd,
    premium_annual_auto_ars = p_premium_annual_auto_ars,
    premium_annual_auto_usd = p_premium_annual_auto_usd,
    premium_monthly_manual_ars = p_premium_monthly_manual_ars,
    premium_monthly_manual_usd = p_premium_monthly_manual_usd,
    veterinary_premium_monthly_ars = coalesce(p_veterinary_premium_monthly_ars, veterinary_premium_monthly_ars),
    veterinary_premium_annual_ars = coalesce(p_veterinary_premium_annual_ars, veterinary_premium_annual_ars),
    place_premium_monthly_ars = coalesce(p_place_premium_monthly_ars, place_premium_monthly_ars),
    place_premium_annual_ars = coalesce(p_place_premium_annual_ars, place_premium_annual_ars),
    updated_at = now()
  where singleton = true;
end;
$$;

grant execute on function public.create_pet_friendly_place_suggestion(text, text, text, text, text, double precision, double precision, uuid) to authenticated;
grant execute on function public.validate_pet_friendly_place(uuid) to authenticated;
grant execute on function public.get_pet_friendly_place_claim_landing(text) to anon, authenticated;
grant execute on function public.submit_pet_friendly_place_claim_decision(text, text, text, text, text, text, text, text, text, boolean, boolean, text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.set_pet_friendly_place_image(text, text) to anon, authenticated;
grant execute on function public.upsert_pet_friendly_place_review(uuid, integer, text) to authenticated;
grant execute on function public.delete_pet_friendly_place_review(uuid) to authenticated;
grant execute on function public.admin_delete_pet_friendly_place_review(uuid) to authenticated;
grant execute on function public.admin_list_pet_friendly_places() to authenticated;
grant execute on function public.admin_update_pet_friendly_place(uuid, text, integer, text) to authenticated;
grant execute on function public.get_billing_pricing_settings() to anon, authenticated;
grant execute on function public.admin_get_billing_pricing_settings() to authenticated;
grant execute on function public.admin_update_billing_pricing_settings(numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;

alter table public.pet_friendly_places enable row level security;
alter table public.pet_friendly_place_validations enable row level security;
alter table public.pet_friendly_place_reviews enable row level security;

drop policy if exists "Anyone can view active pet friendly places" on public.pet_friendly_places;
create policy "Anyone can view active pet friendly places" on public.pet_friendly_places
  for select using (status in ('ACTIVE_FREE', 'ACTIVE_PREMIUM'));

drop policy if exists "Authenticated users can view incubator pet friendly places" on public.pet_friendly_places;
create policy "Authenticated users can view incubator pet friendly places" on public.pet_friendly_places
  for select to authenticated using (true);

drop policy if exists "Authenticated users can suggest pet friendly places" on public.pet_friendly_places;
create policy "Authenticated users can suggest pet friendly places" on public.pet_friendly_places
  for insert to authenticated with check (auth.uid() = suggested_by_user_id and status = 'IN_INCUBATOR');

drop policy if exists "Authenticated users can read own place validations" on public.pet_friendly_place_validations;
create policy "Authenticated users can read own place validations" on public.pet_friendly_place_validations
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Authenticated users can validate place once" on public.pet_friendly_place_validations;
create policy "Authenticated users can validate place once" on public.pet_friendly_place_validations
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Anyone can read reviews of active places" on public.pet_friendly_place_reviews;
create policy "Anyone can read reviews of active places" on public.pet_friendly_place_reviews
  for select using (
    exists (
      select 1 from public.pet_friendly_places p
      where p.id = place_id and p.status in ('ACTIVE_FREE', 'ACTIVE_PREMIUM')
    )
  );

drop policy if exists "Authenticated users can manage own reviews" on public.pet_friendly_place_reviews;
create policy "Authenticated users can manage own reviews" on public.pet_friendly_place_reviews
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
