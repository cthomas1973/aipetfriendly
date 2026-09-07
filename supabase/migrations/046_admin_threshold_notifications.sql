-- Aviso por email al administrador cuando una veterinaria o un lugar pet
-- friendly sugerido junta las validaciones necesarias (validations_goal) y
-- pasa a CLAIMABLE_PROFILE. Se agrega una columna de "ya avisado" en cada
-- tabla para que el aviso se dispare una sola vez (sin importar cuantas
-- validaciones extra sumen despues), y una funcion RPC "claim" atomica que
-- el cliente llama antes de invocar la edge function que envia el email;
-- solo la llamada que efectivamente marca la columna dispara el email.

alter table public.veterinary_profiles
  add column if not exists admin_notified_at timestamptz;

alter table public.pet_friendly_places
  add column if not exists admin_notified_at timestamptz;

create or replace function public.claim_veterinary_admin_notification(p_veterinary_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row_count integer;
begin
  update public.veterinary_profiles
  set admin_notified_at = now()
  where id = p_veterinary_id
    and admin_notified_at is null
    and upvotes_count >= validations_goal;

  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$$;

create or replace function public.claim_pet_friendly_place_admin_notification(p_place_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row_count integer;
begin
  update public.pet_friendly_places
  set admin_notified_at = now()
  where id = p_place_id
    and admin_notified_at is null
    and upvotes_count >= validations_goal;

  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$$;

grant execute on function public.claim_veterinary_admin_notification(uuid) to authenticated;
grant execute on function public.claim_pet_friendly_place_admin_notification(uuid) to authenticated;
