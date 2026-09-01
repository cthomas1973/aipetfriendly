-- Historial de lotes de chapitas generados desde Admin > Chapitas > Lotes de QR.
-- Permite volver a descargar el ZIP (PNG) o el PDF de un lote ya generado en
-- otro momento, y saber si ya fue descargado o no.

create table if not exists public.pet_tag_code_batches (
  id uuid primary key default gen_random_uuid(),
  quantity integer not null,
  created_at timestamp with time zone not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  downloaded_zip_at timestamp with time zone,
  downloaded_pdf_at timestamp with time zone
);

alter table public.pet_tag_code_batches enable row level security;
-- Sin policies directas: todo el acceso pasa por funciones security definer (admin),
-- mismo patron que pet_tag_codes.

alter table public.pet_tag_codes
  add column if not exists batch_id uuid references public.pet_tag_code_batches(id) on delete set null;

create index if not exists idx_pet_tag_codes_batch_id on public.pet_tag_codes (batch_id);

-- Reemplaza la funcion de la migracion 039: ahora agrupa los codigos generados
-- bajo un lote (fila en pet_tag_code_batches) y devuelve tambien el batch_id.
-- Se dropea antes porque cambia el tipo de retorno (setof text -> table).
drop function if exists public.admin_create_pet_tag_codes_batch(integer);

create or replace function public.admin_create_pet_tag_codes_batch(p_quantity integer)
returns table (batch_id uuid, code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_batch_id uuid;
  i integer;
begin
  if not exists (select 1 from public.admin_users au where au.user_id = auth.uid()) then
    raise exception 'No autorizado';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 500 then
    raise exception 'La cantidad debe estar entre 1 y 500.';
  end if;

  insert into public.pet_tag_code_batches (quantity, created_by)
  values (p_quantity, auth.uid())
  returning id into v_batch_id;

  for i in 1..p_quantity loop
    v_code := public.generate_pet_tag_code();
    insert into public.pet_tag_codes (code, batch_id) values (v_code, v_batch_id);
    batch_id := v_batch_id;
    code := v_code;
    return next;
  end loop;
  return;
end;
$$;

grant execute on function public.admin_create_pet_tag_codes_batch(integer) to authenticated;

-- Listado de lotes generados (mas recientes primero) con contadores de estado.
create or replace function public.admin_list_pet_tag_code_batches()
returns table (
  id uuid,
  quantity integer,
  created_at timestamp with time zone,
  downloaded_zip_at timestamp with time zone,
  downloaded_pdf_at timestamp with time zone,
  linked_count integer,
  orphan_count integer
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
    b.id, b.quantity, b.created_at, b.downloaded_zip_at, b.downloaded_pdf_at,
    count(*) filter (where t.status = 'linked')::integer as linked_count,
    count(*) filter (where t.status = 'orphan')::integer as orphan_count
  from public.pet_tag_code_batches b
  left join public.pet_tag_codes t on t.batch_id = b.id
  group by b.id
  order by b.created_at desc
  limit 500;
end;
$$;

grant execute on function public.admin_list_pet_tag_code_batches() to authenticated;

-- Codigos de un lote especifico, para volver a generar el ZIP/PDF en otro momento.
create or replace function public.admin_get_pet_tag_code_batch_codes(p_batch_id uuid)
returns setof text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admin_users au where au.user_id = auth.uid()) then
    raise exception 'No autorizado';
  end if;

  return query
  select code from public.pet_tag_codes where batch_id = p_batch_id order by created_at asc;
end;
$$;

grant execute on function public.admin_get_pet_tag_code_batch_codes(uuid) to authenticated;

-- Marca un lote como descargado (zip o pdf), para reflejarlo en el historial.
create or replace function public.admin_mark_pet_tag_code_batch_downloaded(p_batch_id uuid, p_format text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admin_users au where au.user_id = auth.uid()) then
    raise exception 'No autorizado';
  end if;

  if p_format not in ('zip', 'pdf') then
    raise exception 'Formato invalido';
  end if;

  if p_format = 'zip' then
    update public.pet_tag_code_batches set downloaded_zip_at = now() where id = p_batch_id;
  else
    update public.pet_tag_code_batches set downloaded_pdf_at = now() where id = p_batch_id;
  end if;
end;
$$;

grant execute on function public.admin_mark_pet_tag_code_batch_downloaded(uuid, text) to authenticated;
