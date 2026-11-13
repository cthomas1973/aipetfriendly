-- PREPARADA: no aplicar sin autorizacion. Requiere 066 y 067.
-- Ventanas calendario en Buenos Aires, compartidas por todos los informes.
begin;

do $$
begin
  if to_regprocedure('public.guard_user_access_mode()') is null
    or to_regprocedure('public.guard_subscription_authorization()') is null
    or not exists (select 1 from pg_trigger where tgrelid = 'public.users'::regclass
      and tgname = 'trg_guard_user_access_mode' and tgenabled = 'O')
    or not exists (select 1 from pg_trigger where tgrelid = 'public.subscriptions'::regclass
      and tgname = 'trg_guard_subscription_authorization' and tgenabled = 'O')
    or has_column_privilege('authenticated', 'public.users', 'access_mode', 'UPDATE')
    or not exists (select 1 from pg_class where oid = 'public.users'::regclass and relrowsecurity)
    or not exists (select 1 from pg_class where oid = 'public.subscriptions'::regclass and relrowsecurity)
    or not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'users' and policyname = 'User profile insert guard'
      and permissive = 'RESTRICTIVE')
    or not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'subscriptions' and policyname = 'Subscription update guard'
      and permissive = 'RESTRICTIVE' and qual = 'false' and with_check = 'false')
    or not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'subscriptions' and policyname = 'Subscription insert guard'
      and permissive = 'RESTRICTIVE')
    or not exists (select 1 from pg_policies where schemaname = 'public'
      and tablename = 'subscriptions' and policyname = 'Subscription delete guard'
      and permissive = 'RESTRICTIVE' and qual = 'false') then
    raise exception '069 requiere 066 completa: guards, RLS y permisos de autorizacion protegidos.';
  end if;
  if to_regprocedure('public.user_premium_effective(uuid)') is null
    or not exists (select 1 from information_schema.columns where table_schema = 'public'
      and table_name = 'subscriptions' and column_name = 'grace_until')
    or not exists (select 1 from information_schema.columns where table_schema = 'public'
      and table_name = 'subscriptions' and column_name = 'cancel_requested_at')
    or not exists (select 1 from information_schema.columns where table_schema = 'public'
      and table_name = 'users' and column_name = 'active_pet_id') then
    raise exception '069 requiere 067 completa: user_premium_effective, gracia y cancelacion pendiente.';
  end if;
end;
$$;

create table public.clinical_pdf_sends (
  user_id uuid not null references public.users(id) on delete cascade,
  request_id uuid not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'reserved'
    check (status in ('reserved', 'sending', 'sent', 'failed', 'uncertain')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  provider_id text,
  primary key (user_id, request_id)
);

create index clinical_pdf_sends_user_created_idx
  on public.clinical_pdf_sends (user_id, created_at);

alter table public.clinical_pdf_sends enable row level security;
revoke all on public.clinical_pdf_sends from public, anon, authenticated;
grant all on public.clinical_pdf_sends to service_role;

-- No se almacenan PDF, destinatario ni datos clinicos en el registro.
-- Las reservas sin confirmar NO caducan automaticamente: liberar un envio
-- ambiguo podria duplicar correo/cupo. Requieren conciliacion operativa.
create function public.clinical_pdf_quota_for_user(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text;
  v_plan text;
  v_limit integer;
  v_start timestamptz;
  v_reset timestamptz;
  v_used integer;
  v_local timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
begin
  select access_mode into v_mode from public.users where id = p_user;
  if v_mode is null or v_mode not in ('free', 'premium')
    or exists (select 1 from auth.users where id = p_user and is_anonymous is true) then
    raise exception 'Se requiere una cuenta registrada para enviar PDF.' using errcode = '42501';
  end if;

  v_plan := case when public.user_premium_effective(p_user) then 'premium' else 'free' end;
  v_limit := case when v_plan = 'premium' then 5 else 2 end;
  v_start := date_trunc(case when v_plan = 'premium' then 'day' else 'month' end, v_local)
    at time zone 'America/Argentina/Buenos_Aires';
  v_reset := (date_trunc(case when v_plan = 'premium' then 'day' else 'month' end, v_local)
    + case when v_plan = 'premium' then interval '1 day' else interval '1 month' end)
    at time zone 'America/Argentina/Buenos_Aires';

  -- Cuenta tambien reservas de otro plan: cambiar de plan no reinicia el uso.
  select count(*) into v_used from public.clinical_pdf_sends
    where user_id = p_user and created_at >= v_start and created_at < v_reset
      and status <> 'failed';
  return jsonb_build_object(
    'plan', v_plan, 'limit', v_limit, 'used', v_used,
    'remaining', greatest(0, v_limit - v_used),
    'window', case when v_plan = 'premium' then 'day' else 'month' end,
    'resetAt', v_reset, 'timezone', 'America/Argentina/Buenos_Aires'
  );
end;
$$;

create function public.get_clinical_pdf_quota()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sesion requerida.' using errcode = '42501';
  end if;
  return public.clinical_pdf_quota_for_user(auth.uid());
end;
$$;

create function public.reserve_clinical_pdf_send(
  p_user uuid, p_request uuid, p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.clinical_pdf_sends%rowtype;
  v_quota jsonb;
  v_attempts integer;
begin
  if p_user is null or p_request is null or p_payload_hash is null
    or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Solicitud de envio invalida.' using errcode = '22023';
  end if;
  -- Serializa todas las reservas/finalizaciones del usuario, no solo una clave.
  perform pg_advisory_xact_lock(hashtextextended('clinical-pdf:' || p_user::text, 0));
  v_quota := public.clinical_pdf_quota_for_user(p_user);
  select * into v_existing from public.clinical_pdf_sends
    where user_id = p_user and request_id = p_request;
  if found then
    return jsonb_build_object(
      'result', case
        when v_existing.payload_hash <> p_payload_hash then 'conflict'
        when v_existing.status = 'sent' then 'sent'
        when v_existing.status = 'failed' then 'failed'
        else 'pending' end,
      'quota', v_quota
    );
  end if;
  if (v_quota->>'remaining')::integer = 0 then
    return jsonb_build_object('result', 'quota_exceeded', 'quota', v_quota);
  end if;
  -- Tope tecnico separado: incluye fallos y reservas de ambos planes.
  -- Permite 5 + 5 Premium al cruzar medianoche.
  select count(*) into v_attempts from public.clinical_pdf_sends
    where user_id = p_user and created_at > now() - interval '24 hours';
  if v_attempts >= 10 then
    return jsonb_build_object('result', 'rate_limited', 'quota', v_quota);
  end if;
  insert into public.clinical_pdf_sends (user_id, request_id, payload_hash)
    values (p_user, p_request, p_payload_hash);
  return jsonb_build_object('result', 'reserved',
    'quota', public.clinical_pdf_quota_for_user(p_user));
end;
$$;

create function public.transition_clinical_pdf_send(
  p_user uuid, p_request uuid, p_status text, p_provider_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('clinical-pdf:' || p_user::text, 0));
  update public.clinical_pdf_sends
    set status = p_status, provider_id = p_provider_id, updated_at = now()
    where user_id = p_user and request_id = p_request
      and (
        (status = 'reserved' and p_status in ('sending', 'failed'))
        or (status = 'sending' and p_status in ('sent', 'failed', 'uncertain'))
      );
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'Transicion de envio invalida o ya procesada.' using errcode = '22023';
  end if;
  return public.clinical_pdf_quota_for_user(p_user);
end;
$$;

revoke all on function public.clinical_pdf_quota_for_user(uuid) from public, anon, authenticated;
revoke all on function public.get_clinical_pdf_quota() from public, anon, authenticated;
revoke all on function public.reserve_clinical_pdf_send(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.transition_clinical_pdf_send(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.clinical_pdf_quota_for_user(uuid) to service_role;
grant execute on function public.get_clinical_pdf_quota() to authenticated;
grant execute on function public.reserve_clinical_pdf_send(uuid, uuid, text) to service_role;
grant execute on function public.transition_clinical_pdf_send(uuid, uuid, text, text) to service_role;

commit;
