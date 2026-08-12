-- Permitir marcar como favorita tambien una veterinaria de OpenStreetMap (sin ficha propia en la plataforma).
-- source = 'platform' -> veterinary_id referencia veterinary_profiles (activa/reclamada).
-- source = 'osm'      -> se guarda de forma independiente (osm_place_id/name/address/lat/lng), sin FK.

alter table public.veterinary_favorites
  add column if not exists source text not null default 'platform',
  add column if not exists osm_place_id text,
  add column if not exists name text,
  add column if not exists address text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

alter table public.veterinary_favorites
  alter column veterinary_id drop not null;

alter table public.veterinary_favorites
  drop constraint if exists veterinary_favorites_source_check;

alter table public.veterinary_favorites
  add constraint veterinary_favorites_source_check
  check (source in ('platform', 'osm'));

alter table public.veterinary_favorites
  drop constraint if exists veterinary_favorites_source_data_check;

alter table public.veterinary_favorites
  add constraint veterinary_favorites_source_data_check
  check (
    (source = 'platform' and veterinary_id is not null)
    or (source = 'osm' and osm_place_id is not null and name is not null)
  );
