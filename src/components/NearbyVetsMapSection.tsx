import { useCallback, useEffect, useMemo, useState } from 'react';
import { LocateFixed, MapPin, Navigation } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { AndroidSettings, IOSSettings, NativeSettings } from 'capacitor-native-settings';

const DEFAULT_QUERY = 'veterinaria';
const DEFAULT_ZOOM = 15;
const MIN_ACCEPTABLE_ACCURACY_METERS = 150;
const MAX_BROWSER_ACCEPTABLE_ACCURACY_METERS = 3000;
const SEARCH_RADIUS_METERS = 1200;
const OVERPASS_ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

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

async function fetchNearbyVets(lat: number, lng: number): Promise<NearbyVet[]> {
  const query = `[out:json][timeout:25];\n(\n  node["amenity"="veterinary"](around:${SEARCH_RADIUS_METERS},${lat},${lng});\n  way["amenity"="veterinary"](around:${SEARCH_RADIUS_METERS},${lat},${lng});\n  relation["amenity"="veterinary"](around:${SEARCH_RADIUS_METERS},${lat},${lng});\n);\nout center tags;`;

  let payload: { elements?: Array<Record<string, unknown>> } | null = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: query,
      });

      if (!response.ok) continue;
      payload = (await response.json()) as { elements?: Array<Record<string, unknown>> };
      break;
    } catch {
      continue;
    }
  }

  if (!payload?.elements) return [];

  return payload.elements
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
    .slice(0, 12);
}

function buildEmbedUrl(params?: { lat: number; lng: number }, refreshToken?: number) {
  const url = new URL('https://maps.google.com/maps');
  const query = params ? `${DEFAULT_QUERY} cerca de ${params.lat},${params.lng}` : DEFAULT_QUERY;

  url.searchParams.set('q', query);
  if (params) {
    // Anchor search results to the user's zone to avoid re-centering on broad zoom gestures.
    const point = `${params.lat},${params.lng}`;
    url.searchParams.set('ll', point);
    url.searchParams.set('sll', point);
    url.searchParams.set('near', point);
  }
  url.searchParams.set('t', '');
  url.searchParams.set('z', String(DEFAULT_ZOOM));
  url.searchParams.set('hl', 'es');
  url.searchParams.set('ie', 'UTF8');
  url.searchParams.set('iwloc', '');
  if (refreshToken) {
    // Force iframe refresh so Google reruns the search around the new detected location.
    url.searchParams.set('v', String(refreshToken));
  }
  url.searchParams.set('output', 'embed');

  return url.toString();
}

function buildExternalMapsUrl(params?: { lat: number; lng: number }) {
  const url = new URL('https://www.google.com/maps/search/');
  const query = params ? `${params.lat},${params.lng} ${DEFAULT_QUERY}` : DEFAULT_QUERY;

  url.searchParams.set('api', '1');
  url.searchParams.set('query', query);

  return url.toString();
}

export function NearbyVetsMapSection() {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [mapUrl, setMapUrl] = useState(buildEmbedUrl(undefined, Date.now()));
  const [mapFrameKey, setMapFrameKey] = useState(0);
  const [nearbyVets, setNearbyVets] = useState<NearbyVet[]>([]);
  const [loadingVets, setLoadingVets] = useState(false);
  const [vetsError, setVetsError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [showSettingsCta, setShowSettingsCta] = useState(false);
  const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  const openInMapsUrl = useMemo(
    () => buildExternalMapsUrl(location ? { lat: location.lat, lng: location.lng } : undefined),
    [location],
  );

  const loadNearbyVets = useCallback(async (lat: number, lng: number) => {
    setLoadingVets(true);
    setVetsError(null);

    try {
      const vets = await fetchNearbyVets(lat, lng);
      setNearbyVets(vets);
    } catch {
      setNearbyVets([]);
      setVetsError('No se pudieron cargar veterinarias cercanas para esta ubicacion.');
    } finally {
      setLoadingVets(false);
    }
  }, []);

  const requestLocation = useCallback(async (silent = false) => {
    setLocating(true);
    if (!silent) {
      setLocationError(null);
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
        setMapUrl(buildEmbedUrl(nextLocation, Date.now()));
        setMapFrameKey((current) => current + 1);
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
      setMapUrl(buildEmbedUrl(nextLocation, Date.now()));
      setMapFrameKey((current) => current + 1);
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
            : 'No se pudo obtener tu ubicacion con precision suficiente. Intenta nuevamente en un lugar con mejor senal GPS.',
        );
      }

      setMapUrl(buildEmbedUrl(undefined, Date.now()));
      setMapFrameKey((current) => current + 1);
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
                : 'Mapa centrado en tu zona'
              : 'Centrando en tu zona...'}
          </span>
        </div>

        {locationError && (
          <div className="mt-3 space-y-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
            <p>{locationError}</p>
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
      </div>

      <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-emerald-100">
        <iframe
          key={mapFrameKey}
          id="mapa-veterinarias"
          title="Veterinarias cercanas"
          src={mapUrl}
          className="h-[62vh] min-h-[460px] w-full border-0"
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>

      <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-emerald-100">
        <p className="text-sm text-slate-700">
          Esta vista usa Google Maps embebido para mostrar resultados similares a la busqueda nativa de Google.
        </p>
        <a
          href={openInMapsUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
        >
          <Navigation size={16} />
          Abrir en Google Maps
        </a>
      </div>

      <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-emerald-100">
        <p className="text-sm font-semibold text-slate-900">Veterinarias detectadas en tu nueva ubicacion</p>
        {loadingVets && <p className="mt-2 text-sm text-slate-500">Actualizando veterinarias cercanas...</p>}
        {vetsError && <p className="mt-2 text-sm text-amber-700">{vetsError}</p>}
        {!loadingVets && !vetsError && nearbyVets.length === 0 && (
          <p className="mt-2 text-sm text-slate-500">No se encontraron veterinarias cercanas en esta zona.</p>
        )}
        {!loadingVets && nearbyVets.length > 0 && (
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {nearbyVets.map((vet) => {
              const vetMapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${vet.lat},${vet.lng}`)}`;
              return (
                <li key={vet.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                  <p className="font-semibold text-slate-900">{vet.name}</p>
                  <p className="text-xs text-slate-600">{vet.address}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-emerald-700">{Math.round(vet.distanceMeters)} m</span>
                    <a href={vetMapLink} target="_blank" rel="noreferrer" className="text-xs font-semibold text-emerald-700 underline">
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
