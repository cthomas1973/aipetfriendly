-- PREPARADA. No aplicar sin autorizacion. Requiere 066 -> 067 -> 069.
begin;

do $$
begin
  if to_regclass('public.clinical_pdf_sends') is null
    or to_regprocedure('public.transition_clinical_pdf_send(uuid,uuid,text,text)') is null then
    raise exception '070 requiere la migracion 069 completa.';
  end if;
end;
$$;

create table public.clinical_pdf_reconciliations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  request_id uuid not null,
  previous_status text not null,
  resolved_status text not null check (resolved_status in ('sent', 'failed')),
  actor text not null check (length(btrim(actor)) between 3 and 200),
  reason text not null check (length(btrim(reason)) between 10 and 2000),
  evidence text not null check (length(btrim(evidence)) between 10 and 4000),
  provider_id text,
  reconciled_at timestamptz not null default clock_timestamp(),
  unique (user_id, request_id),
  foreign key (user_id, request_id) references public.clinical_pdf_sends(user_id, request_id)
);
alter table public.clinical_pdf_reconciliations enable row level security;
revoke all on public.clinical_pdf_reconciliations from public, anon, authenticated, service_role;
grant select on public.clinical_pdf_reconciliations to service_role;

-- El cliente puede consultar solo estado/identificador propios, nunca PDF,
-- hash, destinatarios ni evidencia administrativa.
create function public.get_clinical_pdf_send_status(p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.clinical_pdf_sends%rowtype;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Cuenta registrada requerida.' using errcode = '42501';
  end if;
  select * into v_row from public.clinical_pdf_sends
    where user_id = auth.uid() and request_id = p_request;
  return jsonb_build_object('requestId', p_request,
    'status', case when found then v_row.status else 'not_found' end);
end;
$$;

create function public.get_pending_clinical_pdf_sends()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Cuenta registrada requerida.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'requestId', request_id, 'status', status) order by created_at)
    from public.clinical_pdf_sends
    where user_id = auth.uid() and status in ('reserved', 'sending', 'uncertain')), '[]'::jsonb);
end;
$$;

create or replace function public.transition_clinical_pdf_send(
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
    set status = p_status, provider_id = coalesce(provider_id, nullif(btrim(p_provider_id), '')),
      updated_at = clock_timestamp()
    where user_id = p_user and request_id = p_request
      and (provider_id is null or p_provider_id is null or provider_id = p_provider_id)
      and (
        (status = 'reserved' and p_status in ('sending', 'failed'))
        or (status = 'sending' and p_status in ('sent', 'failed', 'uncertain'))
      );
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'Transicion de envio invalida o evidencia incompatible.' using errcode = '22023';
  end if;
  return public.clinical_pdf_quota_for_user(p_user);
end;
$$;

create function public.reconcile_clinical_pdf_send(
  p_user uuid, p_request uuid, p_status text, p_actor text,
  p_reason text, p_evidence text, p_provider_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.clinical_pdf_sends%rowtype;
  v_provider text;
begin
  if p_user is null or p_request is null or p_status is null or p_status not in ('sent', 'failed')
    or p_actor is null or length(btrim(p_actor)) not between 3 and 200
    or p_reason is null or length(btrim(p_reason)) not between 10 and 2000
    or p_evidence is null or length(btrim(p_evidence)) not between 10 and 4000 then
    raise exception 'Conciliacion requiere operacion, actor, motivo y evidencia verificable.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('clinical-pdf:' || p_user::text, 0));
  select * into v_row from public.clinical_pdf_sends
    where user_id = p_user and request_id = p_request for update;
  if not found or v_row.status not in ('reserved', 'sending', 'uncertain') then
    raise exception 'Operacion inexistente o ya resuelta.' using errcode = '22023';
  end if;
  if v_row.provider_id is not null and nullif(btrim(p_provider_id), '') is not null
    and v_row.provider_id <> btrim(p_provider_id) then
    raise exception 'El identificador contradice la evidencia existente.' using errcode = '22023';
  end if;
  v_provider := coalesce(v_row.provider_id, nullif(btrim(p_provider_id), ''));
  if p_status = 'sent' and v_provider is null then
    raise exception 'Confirmar envio requiere identificador del proveedor.' using errcode = '22023';
  end if;
  if p_status = 'failed' and v_provider is not null then
    raise exception 'Un envio con identificador de aceptacion no puede liberar cupo.' using errcode = '22023';
  end if;
  insert into public.clinical_pdf_reconciliations (
    user_id, request_id, previous_status, resolved_status, actor, reason, evidence, provider_id
  ) values (p_user, p_request, v_row.status, p_status,
    btrim(p_actor), btrim(p_reason), btrim(p_evidence), v_provider);
  update public.clinical_pdf_sends
    set status = p_status, provider_id = v_provider, updated_at = clock_timestamp()
    where user_id = p_user and request_id = p_request;
  -- No consulta cupo aqui: una baja a guest no debe impedir conciliar evidencia.
  return jsonb_build_object('requestId', p_request, 'status', p_status);
end;
$$;

revoke all on function public.get_clinical_pdf_send_status(uuid) from public, anon, authenticated;
revoke all on function public.get_pending_clinical_pdf_sends() from public, anon, authenticated;
revoke all on function public.transition_clinical_pdf_send(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.reconcile_clinical_pdf_send(uuid,uuid,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.get_clinical_pdf_send_status(uuid) to authenticated;
grant execute on function public.get_pending_clinical_pdf_sends() to authenticated;
grant execute on function public.transition_clinical_pdf_send(uuid,uuid,text,text) to service_role;
grant execute on function public.reconcile_clinical_pdf_send(uuid,uuid,text,text,text,text,text) to service_role;

commit;
