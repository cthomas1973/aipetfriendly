-- Panel admin de "Chapitas": nuevo flujo de estados en español para
-- pet_tag_requests + funciones RPC admin (listar / actualizar estado),
-- siguiendo el mismo patron de seguridad que admin_list_inbound_emails()
-- (security definer + chequeo contra admin_users).

-- 1) Nuevo enum de estados -----------------------------------------------------
-- solicitado -> pendiente de pago -> generado stl -> impreso -> enviado -> linkeado
-- (+ cancelado como salida de emergencia). Mantenemos 'requested' como primer
-- valor para no romper las filas ya existentes (creadas con el default viejo).

alter table public.pet_tag_requests
  drop constraint if exists pet_tag_requests_status_check;

update public.pet_tag_requests set status = 'requested' where status not in (
  'requested', 'pending_payment', 'stl_generated', 'printed', 'shipped', 'linked', 'cancelled'
);

alter table public.pet_tag_requests
  add constraint pet_tag_requests_status_check
  check (status in ('requested', 'pending_payment', 'stl_generated', 'printed', 'shipped', 'linked', 'cancelled'));

-- 2) Listado admin (con datos de la mascota y del tutor) -----------------------

create or replace function public.admin_list_pet_tag_requests()
returns table (
  id uuid,
  pet_id uuid,
  pet_name text,
  pet_public_code text,
  user_id uuid,
  user_email text,
  user_full_name text,
  user_whatsapp_phone text,
  status text,
  shipping_address text,
  notes text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
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
    r.id, r.pet_id, p.name, p.public_code,
    r.user_id, u.email, u.full_name, u.whatsapp_phone,
    r.status, r.shipping_address, r.notes, r.created_at, r.updated_at
  from public.pet_tag_requests r
  join public.pets p on p.id = r.pet_id
  join public.users u on u.id = r.user_id
  order by r.created_at desc
  limit 500;
end;
$$;

grant execute on function public.admin_list_pet_tag_requests() to authenticated;

-- 3) Actualizar estado / notas ---------------------------------------------------

create or replace function public.admin_update_pet_tag_request(
  p_id uuid,
  p_status text,
  p_notes text default null
)
returns boolean
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

  if p_status not in ('requested', 'pending_payment', 'stl_generated', 'printed', 'shipped', 'linked', 'cancelled') then
    raise exception 'Estado invalido';
  end if;

  update public.pet_tag_requests
  set status = p_status,
      notes = coalesce(p_notes, notes),
      updated_at = now()
  where id = p_id;

  return true;
end;
$$;

grant execute on function public.admin_update_pet_tag_request(uuid, text, text) to authenticated;
