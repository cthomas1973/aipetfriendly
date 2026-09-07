-- Agrega campos opcionales de contacto (email, web, red social) a la sugerencia
-- de lugar pet friendly, para poder ubicar al negocio y pedirle autorizacion
-- cuando la sugerencia llega a las validaciones necesarias.

-- El nuevo parametro agrega args, por lo que "create or replace" crearia un
-- overload en vez de reemplazar la firma anterior; se elimina explicitamente.
drop function if exists public.create_pet_friendly_place_suggestion(text, text, text, text, text, double precision, double precision, uuid);

create or replace function public.create_pet_friendly_place_suggestion(
  p_name text,
  p_category text,
  p_zone_label text,
  p_address text,
  p_phone_whatsapp text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_claim_source_ref_user_id uuid default null,
  p_contact_email text default null,
  p_website_url text default null,
  p_instagram_url text default null,
  p_facebook_url text default null
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
    status, suggested_by_user_id, claim_source_ref_user_id,
    contact_email, website_url, instagram_url, facebook_url
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
    p_claim_source_ref_user_id,
    nullif(trim(coalesce(p_contact_email, '')), ''),
    nullif(trim(coalesce(p_website_url, '')), ''),
    nullif(trim(coalesce(p_instagram_url, '')), ''),
    nullif(trim(coalesce(p_facebook_url, '')), '')
  )
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.create_pet_friendly_place_suggestion(text, text, text, text, text, double precision, double precision, uuid, text, text, text, text) to authenticated;
