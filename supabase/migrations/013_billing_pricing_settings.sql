-- Precios de planes Premium (editable desde Admin)

create table if not exists public.billing_pricing_settings (
  singleton boolean primary key default true,
  premium_monthly_auto_ars numeric(12,2) not null default 9900,
  premium_monthly_auto_usd numeric(12,2) not null default 9.90,
  premium_annual_auto_ars numeric(12,2) not null default 99900,
  premium_annual_auto_usd numeric(12,2) not null default 99.90,
  premium_monthly_manual_ars numeric(12,2) not null default 9900,
  premium_monthly_manual_usd numeric(12,2) not null default 9.90,
  updated_at timestamp with time zone not null default now()
);

insert into public.billing_pricing_settings (
  singleton,
  premium_monthly_auto_ars,
  premium_monthly_auto_usd,
  premium_annual_auto_ars,
  premium_annual_auto_usd,
  premium_monthly_manual_ars,
  premium_monthly_manual_usd
)
values (true, 9900, 9.90, 99900, 99.90, 9900, 9.90)
on conflict (singleton) do nothing;

alter table public.billing_pricing_settings enable row level security;

drop policy if exists "Public can view billing pricing settings" on public.billing_pricing_settings;
create policy "Public can view billing pricing settings"
  on public.billing_pricing_settings
  for select
  using (true);

create or replace function public.get_billing_pricing_settings()
returns table (
  premium_monthly_auto_ars numeric,
  premium_monthly_auto_usd numeric,
  premium_annual_auto_ars numeric,
  premium_annual_auto_usd numeric,
  premium_monthly_manual_ars numeric,
  premium_monthly_manual_usd numeric
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
    s.premium_monthly_manual_usd
  from public.billing_pricing_settings s
  where s.singleton = true
  limit 1;
$$;

create or replace function public.admin_get_billing_pricing_settings()
returns table (
  premium_monthly_auto_ars numeric,
  premium_monthly_auto_usd numeric,
  premium_annual_auto_ars numeric,
  premium_annual_auto_usd numeric,
  premium_monthly_manual_ars numeric,
  premium_monthly_manual_usd numeric
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
    s.premium_monthly_manual_usd
  from public.billing_pricing_settings s
  where s.singleton = true
  limit 1;
end;
$$;

create or replace function public.admin_update_billing_pricing_settings(
  p_premium_monthly_auto_ars numeric,
  p_premium_monthly_auto_usd numeric,
  p_premium_annual_auto_ars numeric,
  p_premium_annual_auto_usd numeric,
  p_premium_monthly_manual_ars numeric,
  p_premium_monthly_manual_usd numeric
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
    or p_premium_monthly_manual_usd < 0 then
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
    now()
  )
  on conflict (singleton) do update
    set premium_monthly_auto_ars = excluded.premium_monthly_auto_ars,
        premium_monthly_auto_usd = excluded.premium_monthly_auto_usd,
        premium_annual_auto_ars = excluded.premium_annual_auto_ars,
        premium_annual_auto_usd = excluded.premium_annual_auto_usd,
        premium_monthly_manual_ars = excluded.premium_monthly_manual_ars,
        premium_monthly_manual_usd = excluded.premium_monthly_manual_usd,
        updated_at = now();
end;
$$;

grant execute on function public.get_billing_pricing_settings() to anon, authenticated;
grant execute on function public.admin_get_billing_pricing_settings() to authenticated;
grant execute on function public.admin_update_billing_pricing_settings(numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;
