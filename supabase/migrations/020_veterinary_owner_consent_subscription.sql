-- Landing de consentimiento/edicion/suscripcion para veterinarias sugeridas.

alter table public.veterinary_profiles
  add column if not exists contact_email text,
  add column if not exists consent_granted boolean not null default false,
  add column if not exists consent_requested_at timestamptz,
  add column if not exists consent_response_at timestamptz,
  add column if not exists basic_data_confirmed boolean not null default false,
  add column if not exists subscription_plan text not null default 'free',
  add column if not exists subscription_billing_mode text,
  add column if not exists business_days text,
  add column if not exists business_hours text,
  add column if not exists services text,
  add column if not exists website_url text,
  add column if not exists instagram_url text,
  add column if not exists facebook_url text,
  add column if not exists denied_reason text,
  add column if not exists denied_at timestamptz,
  add column if not exists highlight_priority integer not null default 0,
  add column if not exists notify_identity boolean not null default false,
  add column if not exists suggested_owner_alias text,
  add column if not exists suggested_owner_pets text;

alter table public.veterinary_profiles
  drop constraint if exists veterinary_profiles_status_check;

alter table public.veterinary_profiles
  add constraint veterinary_profiles_status_check
  check (status in ('IN_INCUBATOR', 'CLAIMABLE_PROFILE', 'ACTIVE_FREE', 'ACTIVE_PREMIUM', 'REJECTED'));

alter table public.veterinary_profiles
  drop constraint if exists veterinary_profiles_subscription_plan_check;

alter table public.veterinary_profiles
  add constraint veterinary_profiles_subscription_plan_check
  check (subscription_plan in ('free', 'premium'));

alter table public.veterinary_profiles
  drop constraint if exists veterinary_profiles_subscription_billing_mode_check;

alter table public.veterinary_profiles
  add constraint veterinary_profiles_subscription_billing_mode_check
  check (subscription_billing_mode in ('monthly_auto', 'annual') or subscription_billing_mode is null);

alter table public.billing_pricing_settings
  add column if not exists veterinary_premium_monthly_ars numeric(12,2) not null default 24900,
  add column if not exists veterinary_premium_annual_ars numeric(12,2) not null default 239000;

create or replace function public.get_veterinary_claim_landing(p_claim_token text)
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
  suggested_clients integer,
  contact_email text,
  consent_granted boolean,
  basic_data_confirmed boolean,
  subscription_plan text,
  subscription_billing_mode text,
  business_days text,
  business_hours text,
  services text,
  website_url text,
  instagram_url text,
  facebook_url text,
  veterinary_premium_monthly_ars numeric,
  veterinary_premium_annual_ars numeric
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
    set
      status = 'CLAIMABLE_PROFILE',
      consent_requested_at = coalesce(consent_requested_at, now())
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
    v_profile.upvotes_count as suggested_clients,
    v_profile.contact_email,
    v_profile.consent_granted,
    v_profile.basic_data_confirmed,
    v_profile.subscription_plan,
    v_profile.subscription_billing_mode,
    v_profile.business_days,
    v_profile.business_hours,
    v_profile.services,
    v_profile.website_url,
    v_profile.instagram_url,
    v_profile.facebook_url,
    s.veterinary_premium_monthly_ars,
    s.veterinary_premium_annual_ars
  from public.billing_pricing_settings s
  where s.singleton = true
  limit 1;
end;
$$;

create or replace function public.submit_veterinary_claim_decision(
  p_claim_token text,
  p_action text,
  p_name text default null,
  p_zone_label text default null,
  p_address text default null,
  p_phone_whatsapp text default null,
  p_contact_email text default null,
  p_consent_granted boolean default null,
  p_basic_data_confirmed boolean default null,
  p_business_days text default null,
  p_business_hours text default null,
  p_services text default null,
  p_website_url text default null,
  p_instagram_url text default null,
  p_facebook_url text default null,
  p_subscription_billing_mode text default null,
  p_notify_identity boolean default false,
  p_suggested_owner_alias text default null,
  p_suggested_owner_pets text default null
)
returns public.veterinary_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.veterinary_profiles;
  v_action text;
begin
  v_action := lower(trim(coalesce(p_action, 'correct')));

  select *
  into v_profile
  from public.veterinary_profiles
  where claim_token = trim(p_claim_token)
  for update;

  if not found then
    raise exception 'claim_token_not_found';
  end if;

  if v_action = 'reject' then
    update public.veterinary_profiles
    set
      status = 'REJECTED',
      consent_granted = false,
      consent_response_at = now(),
      denied_reason = coalesce(p_services, denied_reason),
      denied_at = now(),
      notify_identity = p_notify_identity,
      suggested_owner_alias = p_suggested_owner_alias,
      suggested_owner_pets = p_suggested_owner_pets
    where id = v_profile.id
    returning * into v_profile;

    return v_profile;
  end if;

  update public.veterinary_profiles
  set
    name = case
      when subscription_plan = 'premium' and status = 'ACTIVE_PREMIUM' then name
      else coalesce(nullif(trim(p_name), ''), name)
    end,
    zone_label = coalesce(nullif(trim(p_zone_label), ''), zone_label),
    address = case
      when subscription_plan = 'premium' and status = 'ACTIVE_PREMIUM' then address
      else coalesce(nullif(trim(p_address), ''), address)
    end,
    phone_whatsapp = coalesce(nullif(trim(p_phone_whatsapp), ''), phone_whatsapp),
    contact_email = coalesce(nullif(trim(p_contact_email), ''), contact_email),
    consent_granted = coalesce(p_consent_granted, consent_granted),
    consent_requested_at = coalesce(consent_requested_at, now()),
    consent_response_at = case when p_consent_granted is not null then now() else consent_response_at end,
    basic_data_confirmed = coalesce(p_basic_data_confirmed, basic_data_confirmed),
    business_days = coalesce(nullif(trim(p_business_days), ''), business_days),
    business_hours = coalesce(nullif(trim(p_business_hours), ''), business_hours),
    services = coalesce(nullif(trim(p_services), ''), services),
    website_url = coalesce(nullif(trim(p_website_url), ''), website_url),
    instagram_url = coalesce(nullif(trim(p_instagram_url), ''), instagram_url),
    facebook_url = coalesce(nullif(trim(p_facebook_url), ''), facebook_url),
    notify_identity = p_notify_identity,
    suggested_owner_alias = p_suggested_owner_alias,
    suggested_owner_pets = p_suggested_owner_pets,
    status = case
      when v_action = 'subscribe' then 'ACTIVE_PREMIUM'
      when coalesce(p_consent_granted, consent_granted) = true then 'ACTIVE_FREE'
      else status
    end,
    subscription_plan = case
      when v_action = 'subscribe' then 'premium'
      else subscription_plan
    end,
    subscription_billing_mode = case
      when v_action = 'subscribe' then coalesce(nullif(trim(p_subscription_billing_mode), ''), subscription_billing_mode)
      else subscription_billing_mode
    end,
    highlight_priority = case
      when v_action = 'subscribe' then 100
      else highlight_priority
    end,
    is_verified = case
      when v_action = 'subscribe' then true
      else is_verified
    end,
    activated_at = case
      when v_action in ('subscribe', 'correct') and coalesce(p_consent_granted, consent_granted) = true then coalesce(activated_at, now())
      else activated_at
    end,
    denied_reason = null,
    denied_at = null
  where id = v_profile.id
  returning * into v_profile;

  return v_profile;
end;
$$;

create or replace function public.get_veterinary_pricing_settings()
returns table (
  veterinary_premium_monthly_ars numeric,
  veterinary_premium_annual_ars numeric
)
language sql
security definer
set search_path = public
as $$
  select
    s.veterinary_premium_monthly_ars,
    s.veterinary_premium_annual_ars
  from public.billing_pricing_settings s
  where s.singleton = true
  limit 1;
$$;

create or replace function public.admin_update_veterinary_pricing_settings(
  p_veterinary_premium_monthly_ars numeric,
  p_veterinary_premium_annual_ars numeric
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

  if p_veterinary_premium_monthly_ars < 0
    or p_veterinary_premium_annual_ars < 0 then
    raise exception 'Los precios no pueden ser negativos';
  end if;

  insert into public.billing_pricing_settings (
    singleton,
    veterinary_premium_monthly_ars,
    veterinary_premium_annual_ars,
    updated_at
  )
  values (
    true,
    p_veterinary_premium_monthly_ars,
    p_veterinary_premium_annual_ars,
    now()
  )
  on conflict (singleton) do update
    set veterinary_premium_monthly_ars = excluded.veterinary_premium_monthly_ars,
        veterinary_premium_annual_ars = excluded.veterinary_premium_annual_ars,
        updated_at = now();
end;
$$;

drop function if exists public.get_billing_pricing_settings();
create function public.get_billing_pricing_settings()
returns table (
  premium_monthly_auto_ars numeric,
  premium_monthly_auto_usd numeric,
  premium_annual_auto_ars numeric,
  premium_annual_auto_usd numeric,
  premium_monthly_manual_ars numeric,
  premium_monthly_manual_usd numeric,
  veterinary_premium_monthly_ars numeric,
  veterinary_premium_annual_ars numeric
)
language sql
security definer
set search_path = public
as $$
  select
    s.premium_monthly_auto_ars,
    s.premium_monthly_auto_usd,
    s.premium_annual_auto_ars,
    s.premium_annual_auto_usd,
    s.premium_monthly_manual_ars,
    s.premium_monthly_manual_usd,
    s.veterinary_premium_monthly_ars,
    s.veterinary_premium_annual_ars
  from public.billing_pricing_settings s
  where s.singleton = true
  limit 1;
$$;

drop function if exists public.admin_get_billing_pricing_settings();
create function public.admin_get_billing_pricing_settings()
returns table (
  premium_monthly_auto_ars numeric,
  premium_monthly_auto_usd numeric,
  premium_annual_auto_ars numeric,
  premium_annual_auto_usd numeric,
  premium_monthly_manual_ars numeric,
  premium_monthly_manual_usd numeric,
  veterinary_premium_monthly_ars numeric,
  veterinary_premium_annual_ars numeric
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
    s.premium_monthly_auto_ars,
    s.premium_monthly_auto_usd,
    s.premium_annual_auto_ars,
    s.premium_annual_auto_usd,
    s.premium_monthly_manual_ars,
    s.premium_monthly_manual_usd,
    s.veterinary_premium_monthly_ars,
    s.veterinary_premium_annual_ars
  from public.billing_pricing_settings s
  where s.singleton = true
  limit 1;
end;
$$;

drop function if exists public.admin_update_billing_pricing_settings(numeric, numeric, numeric, numeric, numeric, numeric);
create function public.admin_update_billing_pricing_settings(
  p_premium_monthly_auto_ars numeric,
  p_premium_monthly_auto_usd numeric,
  p_premium_annual_auto_ars numeric,
  p_premium_annual_auto_usd numeric,
  p_premium_monthly_manual_ars numeric,
  p_premium_monthly_manual_usd numeric,
  p_veterinary_premium_monthly_ars numeric default null,
  p_veterinary_premium_annual_ars numeric default null
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

  if p_premium_monthly_auto_ars < 0
    or p_premium_monthly_auto_usd < 0
    or p_premium_annual_auto_ars < 0
    or p_premium_annual_auto_usd < 0
    or p_premium_monthly_manual_ars < 0
    or p_premium_monthly_manual_usd < 0
    or coalesce(p_veterinary_premium_monthly_ars, 0) < 0
    or coalesce(p_veterinary_premium_annual_ars, 0) < 0 then
    raise exception 'Los precios no pueden ser negativos';
  end if;

  insert into public.billing_pricing_settings (
    singleton,
    premium_monthly_auto_ars,
    premium_monthly_auto_usd,
    premium_annual_auto_ars,
    premium_annual_auto_usd,
    premium_monthly_manual_ars,
    premium_monthly_manual_usd,
    veterinary_premium_monthly_ars,
    veterinary_premium_annual_ars,
    updated_at
  )
  values (
    true,
    p_premium_monthly_auto_ars,
    p_premium_monthly_auto_usd,
    p_premium_annual_auto_ars,
    p_premium_annual_auto_usd,
    p_premium_monthly_manual_ars,
    p_premium_monthly_manual_usd,
    coalesce(p_veterinary_premium_monthly_ars, 24900),
    coalesce(p_veterinary_premium_annual_ars, 239000),
    now()
  )
  on conflict (singleton) do update
    set premium_monthly_auto_ars = excluded.premium_monthly_auto_ars,
        premium_monthly_auto_usd = excluded.premium_monthly_auto_usd,
        premium_annual_auto_ars = excluded.premium_annual_auto_ars,
        premium_annual_auto_usd = excluded.premium_annual_auto_usd,
        premium_monthly_manual_ars = excluded.premium_monthly_manual_ars,
        premium_monthly_manual_usd = excluded.premium_monthly_manual_usd,
        veterinary_premium_monthly_ars = excluded.veterinary_premium_monthly_ars,
        veterinary_premium_annual_ars = excluded.veterinary_premium_annual_ars,
        updated_at = now();
end;
$$;

grant execute on function public.get_veterinary_claim_landing(text) to anon, authenticated;
grant execute on function public.submit_veterinary_claim_decision(text, text, text, text, text, text, text, boolean, boolean, text, text, text, text, text, text, text, boolean, text, text) to anon, authenticated;
grant execute on function public.get_veterinary_pricing_settings() to anon, authenticated;
grant execute on function public.admin_update_veterinary_pricing_settings(numeric, numeric) to authenticated;
grant execute on function public.get_billing_pricing_settings() to anon, authenticated;
grant execute on function public.admin_get_billing_pricing_settings() to authenticated;
grant execute on function public.admin_update_billing_pricing_settings(numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;
