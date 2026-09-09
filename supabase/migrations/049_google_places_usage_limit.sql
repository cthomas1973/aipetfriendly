-- Limite mensual de consultas pagas a Google Places API (New).
--
-- La cuota gratuita de Google es mensual y se resetea cada mes calendario.
-- Esta tabla lleva la cuenta de cuantas llamadas reales a Google (no cache
-- hits) se hicieron en el mes actual, para que la edge function
-- `search-google-places` deje de llamar a Google apenas se alcanza el
-- limite configurado (`GOOGLE_PLACES_MONTHLY_LIMIT`) y siga sirviendo solo
-- lo que ya este cacheado hasta que el mes cambie.
create table public.google_places_api_usage (
  id uuid primary key default gen_random_uuid(),
  year_month text not null, -- formato 'YYYY-MM'
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (year_month)
);

alter table public.google_places_api_usage enable row level security;
-- Sin policies: solo el service role (edge function) accede a esta tabla.

-- Cuenta cuantas veces se consulto cada zona/categoria, sin importar si la
-- consulta gasto cuota de Google o se sirvio desde cache. Sirve para, a
-- futuro, priorizar la actualizacion de las zonas mas consultadas cuando
-- quede cuota gratuita disponible.
alter table public.external_places_cache_zones
  add column query_count integer not null default 0;

-- Reserva atomicamente un "cupo" de llamada a Google para el mes indicado.
-- Devuelve true si quedaba cuota disponible (y la consumio), false si el
-- limite mensual ya se alcanzo. Al ser un unico UPDATE con WHERE, Postgres
-- serializa los llamados concurrentes por el lock de fila y evita que dos
-- requests simultaneos pasen el limite a la vez.
create or replace function public.try_increment_google_places_usage(
  p_year_month text,
  p_limit integer
) returns boolean
language plpgsql
as $$
declare
  v_count integer;
begin
  insert into public.google_places_api_usage (year_month, request_count)
  values (p_year_month, 0)
  on conflict (year_month) do nothing;

  update public.google_places_api_usage
  set request_count = request_count + 1,
      updated_at = now()
  where year_month = p_year_month
    and request_count < p_limit
  returning request_count into v_count;

  return v_count is not null;
end;
$$;

-- Suma 1 al contador de consultas de una zona/categoria (crea la fila si no
-- existia todavia, marcandola como vencida para que se intente refrescar en
-- cuanto haya cuota).
create or replace function public.increment_zone_query_count(
  p_entity_type text,
  p_category text,
  p_zone_lat double precision,
  p_zone_lng double precision
) returns void
language plpgsql
as $$
begin
  insert into public.external_places_cache_zones (entity_type, category, zone_lat, zone_lng, query_count, last_fetched_at)
  values (p_entity_type, p_category, p_zone_lat, p_zone_lng, 1, '1970-01-01T00:00:00Z')
  on conflict (entity_type, category, zone_lat, zone_lng)
  do update set query_count = public.external_places_cache_zones.query_count + 1;
end;
$$;
