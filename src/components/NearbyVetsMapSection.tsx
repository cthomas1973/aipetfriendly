import { useMemo, useState } from 'react';
import { LocateFixed, MapPin, Navigation } from 'lucide-react';

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

export function NearbyVetsMapSection() {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const mapUrl = useMemo(() => {
    if (!GOOGLE_MAPS_EMBED_KEY) {
      return null;
    }

    if (!location) {
      return buildMapUrl({
        apiKey: GOOGLE_MAPS_EMBED_KEY,
        query: DEFAULT_QUERY,
      });
    }

    return buildMapUrl({
      apiKey: GOOGLE_MAPS_EMBED_KEY,
      query: `Veterinarias cerca de ${location.lat},${location.lng}`,
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
        setLocationError(
          error.code === error.PERMISSION_DENIED
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
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">{locationError}</p>
        )}
      </div>

      {!GOOGLE_MAPS_EMBED_KEY ? (
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="font-semibold text-slate-800">Falta configurar Google Maps Embed API</p>
          <p className="mt-2 text-sm text-slate-600">
            Define la variable de entorno VITE_GOOGLE_MAPS_EMBED_API_KEY para habilitar el mapa embebido.
          </p>
        </div>
      ) : (
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
      )}
    </section>
  );
}
