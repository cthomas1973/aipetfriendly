-- Cache de lugares (pet friendly y veterinarias) traidos de Google Places API
-- (New) por zona, para no repetir consultas pagas cada vez que alguien busca
-- una zona ya consultada recientemente. La escritura la hace unicamente la
-- edge function `search-google-places` (usa service role, bypassea RLS); el
-- frontend solo lee.
--
-- "Zona" = lat/lng redondeados a 2 decimales (~1km), mismo criterio que ya
-- usa el cache local de OSM en PetFriendlyPlacesSection.tsx.

create table public.external_places_cache (
  id uuid primary key default gen_random_uuid(),
  -- 'veterinary' no usa categoria de negocio real; se guarda como
  -- 'veterinary_care' para que la clave unica no dependa de NULL (Postgres
  -- trata cada NULL como distinto y rompe el upsert de-dup).
  entity_type text not null check (entity_type in ('veterinary', 'pet_friendly_place')),
  category text not null default 'veterinary_care',
  zone_lat double precision not null,
  zone_lng double precision not null,
  google_place_id text not null,
  name text not null,
  address text not null default 'Direccion no informada',
  latitude double precision not null,
  longitude double precision not null,
  -- Solo aplica a pet_friendly_place (campo allowsDogs de Google Places);
  -- null para veterinarias, donde no corresponde.
  allows_dogs boolean,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (entity_type, category, zone_lat, zone_lng, google_place_id)
);

create index idx_external_places_cache_zone
  on public.external_places_cache(entity_type, category, zone_lat, zone_lng);

-- Marca "esta zona/categoria ya se consulto a Google" independientemente de
-- si trajo resultados, para no reintentar la llamada paga durante 30 dias
-- aunque la zona no tenga ningun lugar con allowsDogs=true.
create table public.external_places_cache_zones (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('veterinary', 'pet_friendly_place')),
  category text not null default 'veterinary_care',
  zone_lat double precision not null,
  zone_lng double precision not null,
  last_fetched_at timestamptz not null default now(),
  unique (entity_type, category, zone_lat, zone_lng)
);

alter table public.external_places_cache enable row level security;
alter table public.external_places_cache_zones enable row level security;

drop policy if exists "Anyone can view cached external places" on public.external_places_cache;
create policy "Anyone can view cached external places" on public.external_places_cache
  for select using (true);

drop policy if exists "Anyone can view cached zone markers" on public.external_places_cache_zones;
create policy "Anyone can view cached zone markers" on public.external_places_cache_zones
  for select using (true);

-- Sin policies de insert/update/delete: solo el service role (edge function
-- search-google-places) puede escribir, y ese rol bypassea RLS.
