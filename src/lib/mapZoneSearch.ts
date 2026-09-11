// Utilidades compartidas por PetFriendlyPlacesSection y NearbyVetsMapSection
// para que la busqueda (OSM/Google) siga el area visible del mapa segun el
// zoom, y para calcular el encuadre inicial cuando el usuario ubica el mapa
// por direccion/barrio/localidad.

export type MapBounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };

const METERS_PER_DEGREE_LAT = 111320;

export function haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function boundsFromCenterRadius(lat: number, lng: number, radiusMeters: number): MapBounds {
  const latDelta = radiusMeters / METERS_PER_DEGREE_LAT;
  const lngDelta = radiusMeters / (METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180) || 1);
  return { minLat: lat - latDelta, maxLat: lat + latDelta, minLng: lng - lngDelta, maxLng: lng + lngDelta };
}

export function boundsCenter(bounds: MapBounds): { lat: number; lng: number } {
  return { lat: (bounds.minLat + bounds.maxLat) / 2, lng: (bounds.minLng + bounds.maxLng) / 2 };
}

// Radio que cubre toda el area visible del mapa (usado para Google Places,
// que no acepta un bounding box, solo centro + radio): distancia del centro
// a la esquina mas lejana de los limites actuales.
export function radiusFromBounds(centerLat: number, centerLng: number, bounds: MapBounds): number {
  const corners: Array<[number, number]> = [
    [bounds.minLat, bounds.minLng],
    [bounds.minLat, bounds.maxLng],
    [bounds.maxLat, bounds.minLng],
    [bounds.maxLat, bounds.maxLng],
  ];
  return Math.max(...corners.map(([lat, lng]) => haversineDistanceMeters(centerLat, centerLng, lat, lng)));
}

// 1 cuadra ~ 120m (misma convencion que ya usaba el badge de radio de
// veterinarias). "20 cuadras" = rango inicial al buscar una direccion puntual.
export const CUADRA_METERS = 120;
export const ADDRESS_INITIAL_RADIUS_METERS = 20 * CUADRA_METERS;

const LOCALITY_TYPES = new Set(['city', 'town', 'village', 'municipality', 'county', 'state']);
const NEIGHBOURHOOD_TYPES = new Set(['suburb', 'neighbourhood', 'quarter', 'city_district', 'borough']);

export type GeocodedZone = {
  lat: number;
  lng: number;
  bounds: MapBounds;
  // 'locality' (localidad/ciudad) y 'neighbourhood' (barrio) ajustan el
  // encuadre a toda su superficie; 'address' usa un rango fijo acotado.
  kind: 'address' | 'neighbourhood' | 'locality';
};

const NOMINATIM_SEARCH_ENDPOINT = 'https://nominatim.openstreetmap.org/search';

// Geocodifica una direccion/barrio/localidad y calcula el encuadre inicial
// del mapa segun el tipo de resultado que devuelve Nominatim.
export async function geocodeZone(query: string): Promise<GeocodedZone | null> {
  const url = new URL(NOMINATIM_SEARCH_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');

  const response = await fetch(url.toString(), { headers: { 'Accept-Language': 'es' } });
  if (!response.ok) return null;

  const results = (await response.json()) as Array<{
    lat: string;
    lon: string;
    type?: string;
    boundingbox?: [string, string, string, string];
  }>;
  if (!results.length) return null;

  const result = results[0];
  const lat = Number(result.lat);
  const lng = Number(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const type = result.type ?? '';
  const kind: GeocodedZone['kind'] = LOCALITY_TYPES.has(type)
    ? 'locality'
    : NEIGHBOURHOOD_TYPES.has(type)
      ? 'neighbourhood'
      : 'address';

  if (kind !== 'address' && result.boundingbox && result.boundingbox.length === 4) {
    const [south, north, west, east] = result.boundingbox.map(Number);
    if ([south, north, west, east].every(Number.isFinite)) {
      return { lat, lng, bounds: { minLat: south, maxLat: north, minLng: west, maxLng: east }, kind };
    }
  }

  return { lat, lng, bounds: boundsFromCenterRadius(lat, lng, ADDRESS_INITIAL_RADIUS_METERS), kind };
}
