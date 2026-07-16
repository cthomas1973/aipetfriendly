import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { LocateFixed, MapPin, Navigation, Search } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { AndroidSettings, IOSSettings, NativeSettings } from 'capacitor-native-settings';

const DEFAULT_QUERY = 'veterinaria';
const DEFAULT_ZOOM = 14;
const MIN_ACCEPTABLE_ACCURACY_METERS = 150;
const MAX_BROWSER_ACCEPTABLE_ACCURACY_METERS = 3000;
const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';

function buildEmbedUrl(options?: {
  lat?: number;
  lng?: number;
  address?: string;
  refreshToken?: number;
}) {
  const url = new URL('https://maps.google.com/maps');

  const hasCoords = typeof options?.lat === 'number' && typeof options?.lng === 'number';
  const cleanedAddress = options?.address?.trim();

  const query = cleanedAddress ? `${DEFAULT_QUERY} ${cleanedAddress}` : DEFAULT_QUERY;

  url.searchParams.set('q', query);

  if (hasCoords) {
    const point = `${options!.lat},${options!.lng}`;
    url.searchParams.set('ll', point);
    url.searchParams.set('sll', point);
    url.searchParams.set('near', point);
  }

  url.searchParams.set('t', '');
  url.searchParams.set('z', String(DEFAULT_ZOOM));
  url.searchParams.set('hl', 'es');
  url.searchParams.set('ie', 'UTF8');
  url.searchParams.set('iwloc', '');
  if (options?.refreshToken) {
    url.searchParams.set('v', String(options.refreshToken));
  }
  url.searchParams.set('output', 'embed');

  return url.toString();
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
  const [mapUrl, setMapUrl] = useState(buildEmbedUrl({ refreshToken: Date.now() }));
  const [mapFrameKey, setMapFrameKey] = useState(0);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [showSettingsCta, setShowSettingsCta] = useState(false);
  const [manualAddress, setManualAddress] = useState('');
  const [manualSearching, setManualSearching] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  const openInMapsUrl = useMemo(
    () => buildExternalMapsUrl({ lat: location?.lat, lng: location?.lng, address: manualAddress }),
    [location, manualAddress],
  );

  const refreshMap = useCallback((nextUrl: string) => {
    setMapUrl(nextUrl);
    setMapFrameKey((current) => current + 1);
  }, []);

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
        refreshMap(
          buildEmbedUrl({
            lat: nextLocation.lat,
            lng: nextLocation.lng,
            refreshToken: Date.now(),
          }),
        );
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
      refreshMap(
        buildEmbedUrl({
          lat: nextLocation.lat,
          lng: nextLocation.lng,
          refreshToken: Date.now(),
        }),
      );

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

      refreshMap(buildEmbedUrl({ refreshToken: Date.now() }));
    } finally {
      setLocating(false);
    }
  }, [isNativeAndroid, refreshMap]);

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
        refreshMap(
          buildEmbedUrl({
            lat: point.lat,
            lng: point.lng,
            address: cleanedAddress,
            refreshToken: Date.now(),
          }),
        );
        return;
      }

      refreshMap(
        buildEmbedUrl({
          address: cleanedAddress,
          refreshToken: Date.now(),
        }),
      );
      setManualError('No pudimos geocodificar la direccion exacta. Mostramos busqueda cercana por texto.');
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

      <div className="rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
        Mapa en modo compatible. Para la version completa con API oficial, define VITE_GOOGLE_MAPS_EMBED_API_KEY.
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
    </section>
  );
}
