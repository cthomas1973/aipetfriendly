import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { LocateFixed, MapPin, Navigation, Search } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { AndroidSettings, IOSSettings, NativeSettings } from 'capacitor-native-settings';
import { Circle, MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import { divIcon, type LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_QUERY = 'veterinaria';
const MIN_ACCEPTABLE_ACCURACY_METERS = 150;
const MAX_BROWSER_ACCEPTABLE_ACCURACY_METERS = 3000;
const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const SEARCH_RADIUS_METERS = 1200;
const FETCH_TIMEOUT_MS = 8000;
const FALLBACK_CENTER: LatLngExpression = [-34.6037, -58.3816];
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

const vetMarkerIcon = divIcon({
  className: '',
  html: '<div style="width:26px;height:26px;border-radius:999px;background:#ef4444;border:3px solid #fff;box-shadow:0 6px 16px rgba(239,68,68,.45)"></div>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

const selectedVetMarkerIcon = divIcon({
  className: '',
  html: '<div style="width:32px;height:32px;border-radius:999px;background:#059669;border:3px solid #fff;box-shadow:0 8px 20px rgba(5,150,105,.5)"></div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const locationMarkerIcon = divIcon({
  className: '',
  html: '<div style="width:24px;height:24px;border-radius:999px;background:#2563eb;border:3px solid #fff;box-shadow:0 6px 16px rgba(37,99,235,.45)"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

type NearbyVet = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  distanceMeters: number;
};

function haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildAddress(tags: Record<string, string> | undefined) {
  if (!tags) return 'Direccion no informada';
  const street = tags['addr:street'];
  const number = tags['addr:housenumber'];
  const city = tags['addr:city'] || tags['addr:suburb'];
  const composed = [street, number, city].filter(Boolean).join(' ');
  return composed || tags.address || 'Direccion no informada';
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchNearbyVets(lat: number, lng: number): Promise<NearbyVet[]> {
  const query = `[out:json][timeout:25];
(
  node["amenity"="veterinary"](around:${SEARCH_RADIUS_METERS},${lat},${lng});
  way["amenity"="veterinary"](around:${SEARCH_RADIUS_METERS},${lat},${lng});
  relation["amenity"="veterinary"](around:${SEARCH_RADIUS_METERS},${lat},${lng});

  node["healthcare"="veterinary"](around:${SEARCH_RADIUS_METERS},${lat},${lng});
  way["healthcare"="veterinary"](around:${SEARCH_RADIUS_METERS},${lat},${lng});
  relation["healthcare"="veterinary"](around:${SEARCH_RADIUS_METERS},${lat},${lng});
);
out center tags;`;

  let payload: { elements?: Array<Record<string, unknown>> } | null = null;
  let anyEndpointReachable = false;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: query,
        },
        FETCH_TIMEOUT_MS,
      );

      if (!response.ok) continue;
      anyEndpointReachable = true;
      payload = (await response.json()) as { elements?: Array<Record<string, unknown>> };
      break;
    } catch {
      continue;
    }
  }

  const overpassResults = (payload?.elements ?? [])
    .map((element) => {
      const tags = (element.tags as Record<string, string> | undefined) ?? {};
      const latValue =
        typeof element.lat === 'number'
          ? element.lat
          : element.center && typeof (element.center as { lat?: unknown }).lat === 'number'
            ? (element.center as { lat: number }).lat
            : null;
      const lngValue =
        typeof element.lon === 'number'
          ? element.lon
          : element.center && typeof (element.center as { lon?: unknown }).lon === 'number'
            ? (element.center as { lon: number }).lon
            : null;

      if (latValue === null || lngValue === null) return null;

      return {
        id: `${element.type ?? 'item'}-${element.id ?? Math.random()}`,
        name: tags.name || 'Veterinaria',
        lat: latValue,
        lng: lngValue,
        address: buildAddress(tags),
        distanceMeters: haversineDistanceMeters(lat, lng, latValue, lngValue),
      } as NearbyVet;
    })
    .filter((item): item is NearbyVet => item !== null)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 20);

  if (overpassResults.length > 0) {
    return overpassResults;
  }

  const latOffset = SEARCH_RADIUS_METERS / 111320;
  const lngOffset = SEARCH_RADIUS_METERS / (111320 * Math.cos((lat * Math.PI) / 180));
  const left = lng - lngOffset;
  const right = lng + lngOffset;
  const top = lat + latOffset;
  const bottom = lat - latOffset;

  try {
    const nominatimUrl = new URL(NOMINATIM_ENDPOINT);
    nominatimUrl.searchParams.set('q', 'veterinaria');
    nominatimUrl.searchParams.set('format', 'jsonv2');
    nominatimUrl.searchParams.set('addressdetails', '1');
    nominatimUrl.searchParams.set('limit', '20');
    nominatimUrl.searchParams.set('bounded', '1');
    nominatimUrl.searchParams.set('viewbox', `${left},${top},${right},${bottom}`);

    const response = await fetchWithTimeout(
      nominatimUrl.toString(),
      { headers: { 'Accept-Language': 'es' } },
      FETCH_TIMEOUT_MS,
    );

    if (!response.ok) {
      if (!anyEndpointReachable) {
        throw new Error('network-unreachable');
      }
      return [];
    }

    anyEndpointReachable = true;

    const places = (await response.json()) as Array<{
      place_id: number;
      lat: string;
      lon: string;
      display_name: string;
      name?: string;
    }>;

    return places
      .map((place) => {
        const placeLat = Number(place.lat);
        const placeLng = Number(place.lon);
        if (!Number.isFinite(placeLat) || !Number.isFinite(placeLng)) return null;

        return {
          id: `nominatim-${place.place_id}`,
          name: place.name || place.display_name.split(',')[0] || 'Veterinaria',
          lat: placeLat,
          lng: placeLng,
          address: place.display_name,
          distanceMeters: haversineDistanceMeters(lat, lng, placeLat, placeLng),
        } as NearbyVet;
      })
      .filter((item): item is NearbyVet => item !== null)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, 20);
  } catch (error) {
    if (!anyEndpointReachable) {
      throw error instanceof Error ? error : new Error('network-unreachable');
    }
    return [];
  }
}

function buildExternalMapsUrl(options?: { lat?: number; lng?: number; address?: string }) {
  const url = new URL('https://www.google.com/maps/search/');

  const hasCoords = typeof options?.lat === 'number' && typeof options?.lng === 'number';
  const cleanedAddress = options?.address?.trim();

  const query = hasCoords
    ? `${options!.lat},${options!.lng} ${DEFAULT_QUERY}`
    : cleanedAddress
      ? `${DEFAULT_QUERY} cerca de ${cleanedAddress}`
      : DEFAULT_QUERY;

  url.searchParams.set('api', '1');
  url.searchParams.set('query', query);

  return url.toString();
}

function RecenterMap({ center }: { center: LatLngExpression }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, 15, { animate: true });
  }, [center, map]);

  return null;
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const url = new URL(NOMINATIM_ENDPOINT);
  url.searchParams.set('q', address);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '0');

  const response = await fetch(url.toString(), {
    headers: {
      'Accept-Language': 'es',
    },
  });

  if (!response.ok) {
    return null;
  }

  const results = (await response.json()) as Array<{ lat: string; lon: string }>;
  if (!results.length) {
    return null;
  }

  const lat = Number(results[0].lat);
  const lng = Number(results[0].lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

export function NearbyVetsMapSection() {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [showSettingsCta, setShowSettingsCta] = useState(false);
  const [manualAddress, setManualAddress] = useState('');
  const [manualSearching, setManualSearching] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [nearbyVets, setNearbyVets] = useState<NearbyVet[]>([]);
  const [selectedVetId, setSelectedVetId] = useState<string | null>(null);
  const [loadingVets, setLoadingVets] = useState(false);
  const [vetsError, setVetsError] = useState<string | null>(null);

  const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  const mapCenter = useMemo<LatLngExpression>(
    () => (location ? [location.lat, location.lng] : FALLBACK_CENTER),
    [location],
  );

  const loadNearbyVets = useCallback(async (lat: number, lng: number) => {
    setLoadingVets(true);
    setVetsError(null);

    try {
      const vets = await fetchNearbyVets(lat, lng);
      setNearbyVets(vets);
      setSelectedVetId(null);
      if (vets.length === 0) {
        setVetsError('No se encontraron veterinarias registradas en esta zona.');
      }
    } catch (error) {
      setNearbyVets([]);
      setSelectedVetId(null);
      const isNetworkError = error instanceof Error && error.message === 'network-unreachable';
      setVetsError(
        isNetworkError
          ? 'No se pudo conectar con el servicio de veterinarias. Revisa tu conexion (datos moviles/WiFi) y toca Reintentar.'
          : 'No se pudieron cargar veterinarias cercanas para esta ubicacion.',
      );
    } finally {
      setLoadingVets(false);
    }
  }, []);

  const openInMapsUrl = useMemo(
    () => buildExternalMapsUrl({ lat: location?.lat, lng: location?.lng, address: manualAddress }),
    [location, manualAddress],
  );

  const requestLocation = useCallback(async (silent = false) => {
    setLocating(true);
    if (!silent) {
      setLocationError(null);
      setManualError(null);
    }
    setPermissionDenied(false);
    setShowSettingsCta(false);

    try {
      if (Capacitor.isNativePlatform()) {
        const permission = await Geolocation.requestPermissions();
        if (permission.location === 'denied' || permission.coarseLocation === 'denied') {
          setPermissionDenied(true);
          setShowSettingsCta(true);
          if (!silent) {
            setLocationError('Permiso de ubicacion denegado. Puedes habilitarlo y reintentar.');
          }
          return;
        }

        let position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0,
        });

        if ((position.coords.accuracy ?? Number.MAX_SAFE_INTEGER) > MIN_ACCEPTABLE_ACCURACY_METERS) {
          position = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 0,
          });
        }

        const nativeAccuracy = position.coords.accuracy ?? Number.MAX_SAFE_INTEGER;
        if (nativeAccuracy > MIN_ACCEPTABLE_ACCURACY_METERS) {
          setPermissionDenied(isNativeAndroid);
          setShowSettingsCta(isNativeAndroid);
          if (!silent) {
            setLocationError(
              `Ubicacion imprecisa (${Math.round(nativeAccuracy)} m). Activa "Ubicacion precisa" y GPS de alta precision para centrar correctamente.`,
            );
          }
          return;
        }

        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setLocation(nextLocation);
        setLocationAccuracy(nativeAccuracy);
        await loadNearbyVets(nextLocation.lat, nextLocation.lng);
        return;
      }

      if (!navigator.geolocation) {
        if (!silent) {
          setLocationError('Tu navegador no soporta geolocalizacion.');
        }
        return;
      }

      const getBrowserPosition = (timeout: number) =>
        new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout,
            maximumAge: 0,
          });
        });

      let browserPosition = await getBrowserPosition(12000);
      if ((browserPosition.coords.accuracy ?? Number.MAX_SAFE_INTEGER) > MIN_ACCEPTABLE_ACCURACY_METERS) {
        browserPosition = await getBrowserPosition(20000);
      }

      const browserAccuracy = browserPosition.coords.accuracy ?? Number.MAX_SAFE_INTEGER;
      if (browserAccuracy > MAX_BROWSER_ACCEPTABLE_ACCURACY_METERS) {
        if (!silent) {
          setLocationError(
            `Ubicacion demasiado imprecisa (${Math.round(browserAccuracy)} m). Activa ubicacion precisa en el telefono y vuelve a intentar.`,
          );
        }
        return;
      }

      const nextLocation = {
        lat: browserPosition.coords.latitude,
        lng: browserPosition.coords.longitude,
      };

      setLocation(nextLocation);
      setLocationAccuracy(browserAccuracy);
      await loadNearbyVets(nextLocation.lat, nextLocation.lng);

      if (!silent && browserAccuracy > MIN_ACCEPTABLE_ACCURACY_METERS) {
        setLocationError(`Ubicacion aproximada (${Math.round(browserAccuracy)} m). Se centro el mapa con precision reducida.`);
      }
    } catch (error) {
      const geoError = error as GeolocationPositionError | { message?: string };
      const denied =
        (typeof (geoError as GeolocationPositionError).code === 'number' &&
          (geoError as GeolocationPositionError).code === 1) ||
        geoError.message?.toLowerCase().includes('denied') ||
        geoError.message?.toLowerCase().includes('permission') ||
        false;

      setPermissionDenied(denied);
      if (!silent) {
        setLocationError(
          denied
            ? 'Permiso de ubicacion denegado. Puedes habilitarlo y reintentar.'
            : 'No se pudo obtener tu ubicacion con precision suficiente. Puedes ingresar una direccion manualmente.',
        );
      }

      setNearbyVets([]);
    } finally {
      setLocating(false);
    }
  }, [isNativeAndroid, loadNearbyVets]);

  useEffect(() => {
    const isMobileWeb = !Capacitor.isNativePlatform() && typeof window !== 'undefined' && window.innerWidth < 768;
    if (!isMobileWeb) {
      void requestLocation(true);
    }
  }, [requestLocation]);

  const handleManualSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanedAddress = manualAddress.trim();
    if (!cleanedAddress) {
      setManualError('Ingresa una direccion para buscar veterinarias cercanas.');
      return;
    }

    setManualSearching(true);
    setManualError(null);
    setLocationError(null);

    try {
      const point = await geocodeAddress(cleanedAddress);
      if (point) {
        setLocation(point);
        setLocationAccuracy(null);
        await loadNearbyVets(point.lat, point.lng);
        return;
      }

      setNearbyVets([]);
      setSelectedVetId(null);
      setManualError('No pudimos geocodificar la direccion exacta. Intenta con una direccion mas especifica.');
    } catch {
      setManualError('No se pudo buscar por direccion. Intenta nuevamente.');
    } finally {
      setManualSearching(false);
    }
  };

  const openLocationSettings = async () => {
    try {
      if (isNativeAndroid) {
        try {
          await NativeSettings.openAndroid({
            option: AndroidSettings.Location,
          });
          return;
        } catch {
          await NativeSettings.openAndroid({
            option: AndroidSettings.ApplicationDetails,
          });
        }
        return;
      }

      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') {
        await NativeSettings.openIOS({
          option: IOSSettings.App,
        });
        return;
      }

      setLocationError('Abre manualmente los ajustes del navegador/app y habilita la ubicacion para continuar.');
    } catch {
      setLocationError('No se pudieron abrir los ajustes. Ve a Ajustes > Apps > AiPetFriendly > Permisos > Ubicacion.');
    }
  };

  return (
    <section className="space-y-4 pb-2">
      <div className="rounded-3xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <MapPin size={20} />
          </span>
          <div className="flex-1">
            <p className="font-extrabold text-slate-900">Veterinarias Cercanas</p>
            <p className="text-sm text-slate-500">Mapa interactivo dentro de AiPetFriendly</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void requestLocation();
            }}
            disabled={locating}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
          >
            <LocateFixed size={16} />
            {locating ? 'Buscando ubicacion...' : 'Usar mi ubicacion'}
          </button>

          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <Navigation size={13} />
            {location
              ? locationAccuracy
                ? `Radio 10 cuadras (${Math.round(locationAccuracy)} m de precision)`
                : 'Ubicacion manual aplicada'
              : 'Modo busqueda general'}
          </span>
        </div>

        <form onSubmit={handleManualSearch} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={manualAddress}
            onChange={(event) => {
              setManualAddress(event.target.value);
            }}
            placeholder="Ingresa direccion o barrio (ej: Av. Rivadavia 1988, CABA)"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none ring-emerald-200 focus:ring"
          />
          <button
            type="submit"
            disabled={manualSearching}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:opacity-60"
          >
            <Search size={16} />
            {manualSearching ? 'Buscando...' : 'Buscar por direccion'}
          </button>
        </form>

        {locationError && (
          <div className="mt-3 space-y-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
            <p>{locationError}</p>
            <p>Si no funciona la geolocalizacion, usa la busqueda por direccion.</p>
            {(permissionDenied || showSettingsCta) && isNativeAndroid && (
              <button
                type="button"
                onClick={() => {
                  void openLocationSettings();
                }}
                className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800"
              >
                Abrir ajustes de ubicacion
              </button>
            )}
          </div>
        )}

        {manualError && <p className="mt-2 text-sm text-amber-700">{manualError}</p>}
      </div>

      <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-emerald-100">
        <div className="h-[62vh] min-h-[460px] w-full">
          <MapContainer center={mapCenter} zoom={15} className="h-full w-full" scrollWheelZoom>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <RecenterMap center={mapCenter} />

            {location && (
              <>
                <Circle center={[location.lat, location.lng]} radius={SEARCH_RADIUS_METERS} pathOptions={{ color: '#10b981' }} />
                <Marker position={[location.lat, location.lng]} icon={locationMarkerIcon} />
              </>
            )}

            {nearbyVets.map((vet) => (
              <Marker
                key={vet.id}
                position={[vet.lat, vet.lng]}
                icon={selectedVetId === vet.id ? selectedVetMarkerIcon : vetMarkerIcon}
                eventHandlers={{
                  click: () => {
                    setSelectedVetId(vet.id);
                  },
                }}
              />
            ))}
          </MapContainer>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-emerald-100">
        <a
          href={openInMapsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
        >
          <Navigation size={16} />
          Abrir en Google Maps
        </a>
      </div>

      <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-emerald-100">
        <p className="text-sm font-semibold text-slate-900">Veterinarias cercanas</p>
        {loadingVets && <p className="mt-2 text-sm text-slate-500">Buscando veterinarias en tu zona...</p>}
        {!loadingVets && vetsError && (
          <div className="mt-2 space-y-2">
            <p className="text-sm text-amber-700">{vetsError}</p>
            {location && (
              <button
                type="button"
                onClick={() => {
                  void loadNearbyVets(location.lat, location.lng);
                }}
                className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800"
              >
                Reintentar busqueda de veterinarias
              </button>
            )}
          </div>
        )}
        {!loadingVets && !vetsError && nearbyVets.length > 0 && (
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {nearbyVets.map((vet) => {
              const vetMapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${vet.lat},${vet.lng}`)}`;
              const isSelected = selectedVetId === vet.id;
              return (
                <li
                  key={vet.id}
                  className={`rounded-xl p-3 ring-1 transition ${isSelected ? 'bg-emerald-50 ring-emerald-300' : 'bg-slate-50 ring-slate-100'}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedVetId(vet.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedVetId(vet.id);
                    }
                  }}
                >
                  <p className="font-semibold text-slate-900">{vet.name}</p>
                  <p className="text-xs text-slate-600">{vet.address}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-emerald-700">{Math.round(vet.distanceMeters)} m</span>
                    <a
                      href={vetMapLink}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="text-xs font-semibold text-emerald-700 underline"
                    >
                      Ver en Google Maps
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
