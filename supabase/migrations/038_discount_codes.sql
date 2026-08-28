-- Codigos de descuento para la suscripcion Premium (checkout Mercado Pago)

create table if not exists public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  percent_off numeric(5,2) not null check (percent_off > 0 and percent_off <= 100),
  active boolean not null default true,
  max_uses integer check (max_uses is null or max_uses > 0),
  used_count integer not null default 0,
  expires_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- El codigo se guarda siempre normalizado en mayusculas (ver admin_upsert_discount_code),
-- este indice asegura ademas unicidad case-insensitive ante cualquier dato legado.
create unique index if not exists idx_discount_codes_code_upper
  on public.discount_codes (upper(code));

alter table public.discount_codes enable row level security;

-- Sin policies de select/insert/update/delete directas: todo el acceso pasa por
-- funciones security definer (validate_discount_code para el checkout del usuario,
-- admin_* para el panel de administracion), igual que billing_pricing_settings.

-- Valida un codigo desde el checkout (usuario autenticado o anonimo) y devuelve el
-- porcentaje de descuento si es valido (activo, no vencido, con cupo disponible).
-- No expone ninguna otra columna/fila del catalogo si el codigo no matchea.
create or replace function public.validate_discount_code(p_code text)
returns table (code text, percent_off numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.discount_codes%rowtype;
begin
  if p_code is null or btrim(p_code) = '' then
    return;
  end if;

  select * into v_row
  from public.discount_codes d
  where upper(d.code) = upper(btrim(p_code))
  limit 1;

  if not found then
    return;
  end if;

  if not v_row.active then
    return;
  end if;

  if v_row.expires_at is not null and v_row.expires_at < now() then
    return;
  end if;

  if v_row.max_uses is not null and v_row.used_count >= v_row.max_uses then
    return;
  end if;

  return query select v_row.code, v_row.percent_off;
end;
$$;

-- Incrementa el contador de uso de un codigo ya validado. Lo llama el backend de
-- checkout (service role) al momento de aplicar el descuento sobre una orden nueva
-- (create-subscription.js / create-checkout.js), no el cliente.
create or replace function public.increment_discount_code_usage(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.discount_codes
  set used_count = used_count + 1,
      updated_at = now()
  where upper(code) = upper(btrim(p_code));
end;
$$;

create or replace function public.admin_list_discount_codes()
returns table (
  id uuid,
  code text,
  percent_off numeric,
  active boolean,
  max_uses integer,
  used_count integer,
  expires_at timestamp with time zone,
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
  select d.id, d.code, d.percent_off, d.active, d.max_uses, d.used_count, d.expires_at, d.notes, d.created_at, d.updated_at
  from public.discount_codes d
  order by d.created_at desc;
end;
$$;

-- Alta o edicion (si p_id no es null) de un codigo de descuento.
create or replace function public.admin_upsert_discount_code(
  p_id uuid,
  p_code text,
  p_percent_off numeric,
  p_active boolean,
  p_max_uses integer,
  p_expires_at timestamp with time zone,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from public.admin_users au where au.user_id = auth.uid()
  ) then
    raise exception 'No autorizado';
  end if;

  if p_code is null or btrim(p_code) = '' then
    raise exception 'El codigo no puede estar vacio';
  end if;

  if p_percent_off is null or p_percent_off <= 0 or p_percent_off > 100 then
    raise exception 'El porcentaje debe estar entre 1 y 100';
  end if;

  if p_max_uses is not null and p_max_uses <= 0 then
    raise exception 'El maximo de usos debe ser mayor a 0';
  end if;

  begin
    if p_id is not null then
      update public.discount_codes
      set code = upper(btrim(p_code)),
          percent_off = p_percent_off,
          active = coalesce(p_active, true),
          max_uses = p_max_uses,
          expires_at = p_expires_at,
          notes = p_notes,
          updated_at = now()
      where id = p_id
      returning id into v_id;

      if v_id is null then
        raise exception 'Codigo no encontrado';
      end if;

      return v_id;
    end if;

    insert into public.discount_codes (code, percent_off, active, max_uses, expires_at, notes)
    values (upper(btrim(p_code)), p_percent_off, coalesce(p_active, true), p_max_uses, p_expires_at, p_notes)
    returning id into v_id;

    return v_id;
  exception
    when unique_violation then
      raise exception 'Ya existe un codigo de descuento con ese nombre';
  end;
end;
$$;

create or replace function public.admin_delete_discount_code(p_id uuid)
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

  delete from public.discount_codes where id = p_id;
end;
$$;

grant execute on function public.validate_discount_code(text) to anon, authenticated;
grant execute on function public.admin_list_discount_codes() to authenticated;
grant execute on function public.admin_upsert_discount_code(uuid, text, numeric, boolean, integer, timestamp with time zone, text) to authenticated;
grant execute on function public.admin_delete_discount_code(uuid) to authenticated;
