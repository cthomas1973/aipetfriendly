// Trae lugares desde Google Places API (New) para complementar los
// resultados de OpenStreetMap/Overpass, que en algunas zonas (ej. AMBA) estan
// muy incompletos. Los resultados se cachean en `external_places_cache` por
// zona (lat/lng redondeados a 2 decimales) durante CACHE_MAX_AGE_DAYS, para
// no pagar una consulta a Google cada vez que alguien mira la misma zona.
//
// - entityType 'pet_friendly_place': solo se guardan lugares donde Google
//   confirma explicitamente `allowsDogs = true` (campo real de Places API
//   New, SKU "Enterprise + Atmosphere"). Si el dato no esta cargado en
//   Google para ese lugar, no aparece (no se puede inferir).
// - entityType 'veterinary': se usa el tipo `veterinary_care` sin filtrar
//   por allowsDogs (no aplica a veterinarias).
//
// Limite de cuota: las llamadas reales a Google (no cache hits) se cuentan
// por mes calendario en `google_places_api_usage`. Al llegar a
// GOOGLE_PLACES_MONTHLY_LIMIT se deja de llamar a Google hasta el mes
// siguiente y se sirve solo lo que ya este cacheado por zona. Esto hace que
// al principio haya pocas zonas cubiertas, pero a medida que distintos
// usuarios consultan distintas zonas el cache se va completando, y la cuota
// que quede libre cada mes se usa para refrescar zonas ya cacheadas (las
// mas consultadas se marcan como vencidas y se intentan re-consultar antes,
// via `external_places_cache_zones.query_count`).
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GOOGLE_PLACES_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? '';

const CACHE_MAX_AGE_DAYS = 30;
const CACHE_MAX_AGE_MS = CACHE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
const DEFAULT_RADIUS_METERS = 2500;
const MIN_RADIUS_METERS = 200;
const MAX_RADIUS_METERS = 5000;
const VETERINARY_CACHE_CATEGORY = 'veterinary_care';

// Cuota gratuita mensual de Google (SKU "Nearby Search Enterprise +
// Atmosphere", la mas restrictiva de las que usa esta funcion, da 1000
// llamadas gratis por mes). Configurable por si se contrata mas cuota.
const GOOGLE_PLACES_MONTHLY_LIMIT = (() => {
  const raw = Number(Deno.env.get('GOOGLE_PLACES_MONTHLY_LIMIT'));
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1000;
})();

function currentYearMonth(): string {
  return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

// Mismo dominio que `PetFriendlyPlaceCategory` en src/types/index.ts; "otro"
// no tiene un tipo de Google equivalente razonable, se omite.
const PLACE_CATEGORY_TO_GOOGLE_TYPE: Record<string, string> = {
  restaurante: 'restaurant',
  hotel_alojamiento: 'lodging',
  playa: 'tourist_attraction',
  tienda: 'pet_store',
  plaza_parque: 'park',
  bar_cafe: 'cafe',
};

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Redondeo a 2 decimales (~1km) para agrupar consultas cercanas en la misma
// "zona" de cache, igual que el cache local de OSM en el frontend.
function roundZone(value: number): number {
  return Math.round(value * 100) / 100;
}

type GooglePlaceRow = {
  google_place_id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  allows_dogs: boolean | null;
};

async function fetchFromGoogle(
  entityType: 'veterinary' | 'pet_friendly_place',
  category: string | null,
  lat: number,
  lng: number,
  radius: number,
): Promise<GooglePlaceRow[]> {
  const includedTypes = entityType === 'veterinary'
    ? ['veterinary_care']
    : [PLACE_CATEGORY_TO_GOOGLE_TYPE[category ?? '']];

  const fieldMask = entityType === 'veterinary'
    ? 'places.id,places.displayName,places.formattedAddress,places.location'
    : 'places.id,places.displayName,places.formattedAddress,places.location,places.allowsDogs';

  const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify({
      includedTypes,
      maxResultCount: 20,
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius },
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Google Places respondio HTTP ${response.status}: ${errText}`);
  }

  const payload = (await response.json()) as { places?: Array<Record<string, unknown>> };
  const places = payload.places ?? [];

  return places
    .filter((place) => (entityType === 'veterinary' ? true : place.allowsDogs === true))
    .map((place) => {
      const location = place.location as { latitude?: number; longitude?: number } | undefined;
      const displayName = place.displayName as { text?: string } | undefined;
      return {
        google_place_id: String(place.id ?? ''),
        name: displayName?.text || 'Sin nombre',
        address: (place.formattedAddress as string | undefined) || 'Direccion no informada',
        latitude: typeof location?.latitude === 'number' ? location.latitude : lat,
        longitude: typeof location?.longitude === 'number' ? location.longitude : lng,
        allows_dogs: entityType === 'veterinary' ? null : true,
      };
    })
    .filter((place) => place.google_place_id.length > 0);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  if (!supabase) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return jsonResponse(200, { places: [], reason: 'not_configured' });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const entityType = body?.entityType === 'veterinary' || body?.entityType === 'pet_friendly_place'
      ? body.entityType
      : null;
    const latitude = Number(body?.latitude);
    const longitude = Number(body?.longitude);
    const category = typeof body?.category === 'string' ? body.category : null;
    const radiusMeters = Math.max(
      MIN_RADIUS_METERS,
      Math.min(Number(body?.radiusMeters) || DEFAULT_RADIUS_METERS, MAX_RADIUS_METERS),
    );

    if (!entityType || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return jsonResponse(400, { error: 'entityType, latitude y longitude son requeridos' });
    }

    if (entityType === 'pet_friendly_place' && (!category || !PLACE_CATEGORY_TO_GOOGLE_TYPE[category])) {
      // Categoria sin tipo de Google equivalente (ej. "otro"): no hay nada
      // que buscar, se devuelve vacio sin gastar cuota.
      return jsonResponse(200, { places: [] });
    }

    const cacheCategory = entityType === 'veterinary' ? VETERINARY_CACHE_CATEGORY : (category as string);
    const zoneLat = roundZone(latitude);
    const zoneLng = roundZone(longitude);

    const { data: zoneRow } = await supabase
      .from('external_places_cache_zones')
      .select('last_fetched_at')
      .eq('entity_type', entityType)
      .eq('category', cacheCategory)
      .eq('zone_lat', zoneLat)
      .eq('zone_lng', zoneLng)
      .maybeSingle();

    const isFresh = !!zoneRow && (Date.now() - new Date(zoneRow.last_fetched_at as string).getTime()) < CACHE_MAX_AGE_MS;

    // Best-effort: registra que esta zona/categoria fue consultada (haya o
    // no llamado a Google), para poder priorizar a futuro las zonas mas
    // consultadas cuando quede cuota gratuita disponible.
    const { error: queryCountError } = await supabase.rpc('increment_zone_query_count', {
      p_entity_type: entityType,
      p_category: cacheCategory,
      p_zone_lat: zoneLat,
      p_zone_lng: zoneLng,
    });
    if (queryCountError) {
      console.error('Error incrementing zone query count:', queryCountError);
    }

    if (!isFresh) {
      if (!GOOGLE_PLACES_API_KEY) {
        console.error('Missing GOOGLE_PLACES_API_KEY, skipping Google Places fetch');
      } else {
        const { data: canUseGoogle, error: usageError } = await supabase.rpc('try_increment_google_places_usage', {
          p_year_month: currentYearMonth(),
          p_limit: GOOGLE_PLACES_MONTHLY_LIMIT,
        });
        if (usageError) {
          console.error('Error checking Google Places monthly usage:', usageError);
        }

        if (usageError || !canUseGoogle) {
          // Cuota gratuita mensual agotada (o no se pudo verificar, por las
          // dudas no se gasta cuota paga): se sirve solo lo que ya haya en
          // cache para esta zona. La zona sigue marcada como vencida, asi
          // que se reintenta apenas haya cupo (mes nuevo o limite ampliado).
          console.warn(
            `Google Places: limite mensual (${GOOGLE_PLACES_MONTHLY_LIMIT}) alcanzado, se sirve solo cache para zona`,
            { entityType, cacheCategory, zoneLat, zoneLng },
          );
        } else {
          try {
            const googlePlaces = await fetchFromGoogle(entityType, category, latitude, longitude, radiusMeters);
            if (googlePlaces.length > 0) {
              const rows = googlePlaces.map((place) => ({
                entity_type: entityType,
                category: cacheCategory,
                zone_lat: zoneLat,
                zone_lng: zoneLng,
                google_place_id: place.google_place_id,
                name: place.name,
                address: place.address,
                latitude: place.latitude,
                longitude: place.longitude,
                allows_dogs: place.allows_dogs,
                fetched_at: new Date().toISOString(),
              }));
              const { error: upsertError } = await supabase
                .from('external_places_cache')
                .upsert(rows, { onConflict: 'entity_type,category,zone_lat,zone_lng,google_place_id' });
              if (upsertError) {
                console.error('Error upserting external_places_cache:', upsertError);
              }
            }
            const { error: zoneUpsertError } = await supabase
              .from('external_places_cache_zones')
              .upsert(
                {
                  entity_type: entityType,
                  category: cacheCategory,
                  zone_lat: zoneLat,
                  zone_lng: zoneLng,
                  last_fetched_at: new Date().toISOString(),
                },
                { onConflict: 'entity_type,category,zone_lat,zone_lng' },
              );
            if (zoneUpsertError) {
              console.error('Error upserting external_places_cache_zones:', zoneUpsertError);
            }
          } catch (googleError) {
            // Un fallo de Google (rate limit, timeout, etc.) no debe romper la
            // respuesta: se devuelve lo que ya haya en cache para esa zona.
            console.error('Google Places fetch error:', googleError);
          }
        }
      }
    }

    const { data: cached, error: cacheError } = await supabase
      .from('external_places_cache')
      .select('google_place_id,name,address,latitude,longitude,allows_dogs,fetched_at')
      .eq('entity_type', entityType)
      .eq('category', cacheCategory)
      .eq('zone_lat', zoneLat)
      .eq('zone_lng', zoneLng);

    if (cacheError) {
      console.error('Error reading external_places_cache:', cacheError);
      return jsonResponse(200, { places: [] });
    }

    return jsonResponse(200, { places: cached ?? [] });
  } catch (error) {
    console.error('search-google-places error:', error);
    return jsonResponse(500, { error: 'Internal error' });
  }
});
