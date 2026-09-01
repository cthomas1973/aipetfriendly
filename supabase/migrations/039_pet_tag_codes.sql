-- Chapitas pre-generadas por lote: codigos de chapita independientes de una
-- mascota. El admin genera lotes de codigos "huerfanos" (sin mascota), se
-- imprimen fisicamente, y luego cualquier usuario los vincula a una de sus
-- mascotas escaneando el QR (o tipeando el codigo a mano). Una mascota solo
-- puede tener UN codigo vinculado a la vez; al vincular uno nuevo, el anterior
-- de esa misma mascota vuelve a quedar huerfano.

create table if not exists public.pet_tag_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  status text not null default 'orphan' check (status in ('orphan', 'linked')),
  pet_id uuid references public.pets(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  linked_at timestamp with time zone
);

create unique index if not exists idx_pet_tag_codes_code on public.pet_tag_codes (code);
-- Un unico codigo "linked" por mascota (los huerfanos, o los que quedaron sin
-- mascota tras un delete, no entran en este indice).
create unique index if not exists idx_pet_tag_codes_pet_linked
  on public.pet_tag_codes (pet_id)
  where status = 'linked';

alter table public.pet_tag_codes enable row level security;
-- Sin policies directas: alta (admin), listado (admin) y vinculacion (dueño de
-- la mascota) pasan todas por funciones security definer, mismo patron que
-- discount_codes/billing_pricing_settings.

-- Genera un codigo unico de 8 caracteres, evitando colision tanto con otros
-- codigos de chapita como con el public_code propio de las mascotas (mismo
-- estilo que generate_pet_public_code, migracion 034).
create or replace function public.generate_pet_tag_code()
returns text
language plpgsql
as $$
declare
  candidate text;
  exists_already boolean;
begin
  loop
    candidate := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    select exists(select 1 from public.pet_tag_codes where code = candidate)
        or exists(select 1 from public.pets where public_code = candidate)
    into exists_already;
    exit when not exists_already;
  end loop;
  return candidate;
end;
$$;

-- Genera un lote de codigos huerfanos (solo admin). Devuelve los codigos creados.
create or replace function public.admin_create_pet_tag_codes_batch(p_quantity integer)
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  i integer;
begin
  if not exists (select 1 from public.admin_users au where au.user_id = auth.uid()) then
    raise exception 'No autorizado';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 500 then
    raise exception 'La cantidad debe estar entre 1 y 500.';
  end if;

  for i in 1..p_quantity loop
    v_code := public.generate_pet_tag_code();
    insert into public.pet_tag_codes (code) values (v_code);
    return next v_code;
  end loop;
  return;
end;
$$;

grant execute on function public.admin_create_pet_tag_codes_batch(integer) to authenticated;

-- Listado admin de codigos de chapita, con datos de la mascota/tutor si esta vinculado.
create or replace function public.admin_list_pet_tag_codes(p_status text default null)
returns table (
  id uuid,
  code text,
  status text,
  pet_id uuid,
  pet_name text,
  pet_public_code text,
  user_email text,
  user_full_name text,
  created_at timestamp with time zone,
  linked_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admin_users au where au.user_id = auth.uid()) then
    raise exception 'No autorizado';
  end if;

  if p_status is not null and p_status not in ('orphan', 'linked') then
    raise exception 'Estado invalido';
  end if;

  return query
  select
    t.id, t.code, t.status, t.pet_id, p.name, p.public_code,
    u.email, u.full_name, t.created_at, t.linked_at
  from public.pet_tag_codes t
  left join public.pets p on p.id = t.pet_id
  left join public.users u on u.id = p.user_id
  where p_status is null or t.status = p_status
  order by t.created_at desc
  limit 2000;
end;
$$;

grant execute on function public.admin_list_pet_tag_codes(text) to authenticated;

-- Vincula un codigo de chapita (huerfano, o ya vinculado a la MISMA mascota) a
-- una mascota del usuario autenticado. Si esa mascota ya tenia otro codigo
-- vinculado, ese codigo anterior vuelve a quedar huerfano.
create or replace function public.link_pet_tag_code(p_code text, p_pet_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_tag public.pet_tag_codes%rowtype;
begin
  select user_id into v_owner from public.pets where id = p_pet_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'No autorizado';
  end if;

  select * into v_tag from public.pet_tag_codes
  where upper(code) = upper(btrim(p_code))
  for update;

  if not found then
    raise exception 'Codigo de chapita no encontrado.';
  end if;

  if v_tag.status = 'linked' and v_tag.pet_id is distinct from p_pet_id then
    raise exception 'Este codigo ya esta vinculado a otra mascota.';
  end if;

  -- Libera el codigo anterior de esta mascota (si tenia otro vinculado).
  update public.pet_tag_codes
  set status = 'orphan', pet_id = null, linked_at = null
  where pet_id = p_pet_id and id <> v_tag.id;

  update public.pet_tag_codes
  set status = 'linked', pet_id = p_pet_id, linked_at = now()
  where id = v_tag.id;
end;
$$;

grant execute on function public.link_pet_tag_code(text, uuid) to authenticated;

-- Desvincula el codigo de chapita actualmente asociado a una mascota (vuelve a
-- quedar huerfano, disponible para vincularse a cualquier mascota).
create or replace function public.unlink_pet_tag_code(p_pet_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.pets where id = p_pet_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'No autorizado';
  end if;

  update public.pet_tag_codes
  set status = 'orphan', pet_id = null, linked_at = null
  where pet_id = p_pet_id and status = 'linked';
end;
$$;

grant execute on function public.unlink_pet_tag_code(uuid) to authenticated;

-- Devuelve el codigo de chapita actualmente vinculado a una mascota (o null).
create or replace function public.get_pet_tag_code(p_pet_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_code text;
begin
  select user_id into v_owner from public.pets where id = p_pet_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'No autorizado';
  end if;

  select code into v_code from public.pet_tag_codes
  where pet_id = p_pet_id and status = 'linked'
  limit 1;

  return v_code;
end;
$$;

grant execute on function public.get_pet_tag_code(uuid) to authenticated;
