import { useMemo, useState } from 'react';
import { LocateFixed, MapPin, Navigation } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { AndroidSettings, IOSSettings, NativeSettings } from 'capacitor-native-settings';

const DEFAULT_QUERY = 'Veterinarias cerca de mi';
const GOOGLE_MAPS_EMBED_KEY = (import.meta.env.VITE_GOOGLE_MAPS_EMBED_API_KEY as string | undefined)?.trim() || '';

function buildMapUrl(params: { apiKey: string; query: string; center?: { lat: number; lng: number } | null }) {
  const url = new URL('https://www.google.com/maps/embed/v1/search');
  url.searchParams.set('key', params.apiKey);
  url.searchParams.set('q', params.query);
  url.searchParams.set('language', 'es');
  url.searchParams.set('region', 'AR');

  if (params.center) {
    url.searchParams.set('center', `${params.center.lat},${params.center.lng}`);
    url.searchParams.set('zoom', '13');
  }

  return url.toString();
}

function buildPublicMapEmbedUrl(params: { query: string; center?: { lat: number; lng: number } | null }) {
  const url = new URL('https://maps.google.com/maps');
  url.searchParams.set('q', params.query);
  if (params.center) {
    url.searchParams.set('ll', `${params.center.lat},${params.center.lng}`);
    url.searchParams.set('z', '13');
  }
  url.searchParams.set('hl', 'es');
  url.searchParams.set('output', 'embed');
  return url.toString();
}

export function NearbyVetsMapSection() {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  const mapUrl = useMemo(() => {
    if (!location) {
      return GOOGLE_MAPS_EMBED_KEY
        ? buildMapUrl({
            apiKey: GOOGLE_MAPS_EMBED_KEY,
            query: DEFAULT_QUERY,
          })
        : buildPublicMapEmbedUrl({ query: DEFAULT_QUERY });
    }

    const locationQuery = 'Veterinarias';
    return GOOGLE_MAPS_EMBED_KEY
      ? buildMapUrl({
          apiKey: GOOGLE_MAPS_EMBED_KEY,
          query: locationQuery,
          center: location,
        })
      : buildPublicMapEmbedUrl({
          query: locationQuery,
          center: location,
        });
  }, [location]);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Tu navegador no soporta geolocalizacion.');
      return;
    }

    setLocating(true);
    setLocationError(null);
    setPermissionDenied(false);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocating(false);
      },
      (error) => {
        setLocating(false);
        const denied = error.code === error.PERMISSION_DENIED;
        setPermissionDenied(denied);
        setLocationError(
          denied
            ? 'Permiso de ubicacion denegado. Puedes habilitarlo y reintentar.'
            : 'No se pudo obtener tu ubicacion. Intenta nuevamente.',
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
      },
    );
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
            onClick={requestLocation}
            disabled={locating}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
          >
            <LocateFixed size={16} />
            {locating ? 'Buscando ubicacion...' : 'Usar mi ubicacion'}
          </button>

          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <Navigation size={13} />
            {location ? 'Mapa centrado en tu zona' : 'Modo busqueda general'}
          </span>
        </div>

        {locationError && (
          <div className="mt-3 space-y-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
            <p>{locationError}</p>
            {permissionDenied && isNativeAndroid && (
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

      {!GOOGLE_MAPS_EMBED_KEY && (
        <div className="rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Mapa en modo compatible. Para la version completa con API oficial, define VITE_GOOGLE_MAPS_EMBED_API_KEY.
        </div>
      )}

      <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-emerald-100">
        <iframe
          title="Veterinarias cercanas"
          src={mapUrl || undefined}
          className="h-[62vh] min-h-[460px] w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allow="geolocation"
        />
      </div>
    </section>
  );
}
