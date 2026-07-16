import { useCallback, useEffect, useMemo, useState } from 'react';
import { LocateFixed, MapPin, Navigation } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { AndroidSettings, IOSSettings, NativeSettings } from 'capacitor-native-settings';
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { divIcon, type LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER: LatLngExpression = [-34.6098, -58.3921];
const SEARCH_RADIUS_METERS = 1000;
const MIN_ACCEPTABLE_ACCURACY_METERS = 150;
const OVERPASS_ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

type VetPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  openingHours: string;
  contact: string;
  website: string | null;
  distanceMeters: number;
};

const vetMarkerIcon = divIcon({
  className: '',
  html: `
    <div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9999px;background:#059669;border:3px solid #ffffff;box-shadow:0 8px 20px rgba(5,150,105,0.35);transform:translateY(-4px)">
      <span style="color:#ffffff;font-weight:800;font-size:18px;line-height:1">+</span>
    </div>
  `,
  iconSize: [34, 34],
  iconAnchor: [17, 30],
  popupAnchor: [0, -28],
});

const locationMarkerIcon = divIcon({
  className: '',
  html: `
    <div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9999px;background:#2563eb;border:3px solid #ffffff;box-shadow:0 8px 20px rgba(37,99,235,0.35);transform:translateY(-4px)">
      <span style="width:10px;height:10px;border-radius:9999px;background:#ffffff"></span>
    </div>
  `,
  iconSize: [30, 30],
  iconAnchor: [15, 26],
  popupAnchor: [0, -24],
});

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

function pickTag(tags: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = tags[key]?.trim();
    if (value) {
      return value;
    }
  }

  return '';
}

function normalizeWebsite(url: string) {
  const value = url.trim();
  if (!value) {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `https://${value}`;
}

async function fetchNearbyVets(lat: number, lng: number): Promise<VetPlace[]> {
  const query = `[out:json][timeout:25];\n(\n  node["amenity"="veterinary"](around:${SEARCH_RADIUS_METERS},${lat},${lng});\n  way["amenity"="veterinary"](around:${SEARCH_RADIUS_METERS},${lat},${lng});\n  relation["amenity"="veterinary"](around:${SEARCH_RADIUS_METERS},${lat},${lng});\n);\nout center tags;`;

  let payload: { elements?: Array<Record<string, unknown>> } | null = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: query,
      });

      if (!response.ok) {
        continue;
      }

      payload = (await response.json()) as { elements?: Array<Record<string, unknown>> };
      break;
    } catch {
      continue;
    }
  }

  if (!payload?.elements) {
    throw new Error('No se pudo consultar veterinarias cercanas.');
  }

  const vets = payload.elements
    .map((element) => {
      const tags = (element.tags as Record<string, string> | undefined) ?? {};
      const latValue =
        typeof element.lat === 'number'
          ? element.lat
          : element.center && typeof (element.center as { lat?: unknown }).lat === 'number'
            ? ((element.center as { lat: number }).lat as number)
            : null;
      const lngValue =
        typeof element.lon === 'number'
          ? element.lon
          : element.center && typeof (element.center as { lon?: unknown }).lon === 'number'
            ? ((element.center as { lon: number }).lon as number)
            : null;

      if (latValue === null || lngValue === null) {
        return null;
      }

      const distanceMeters = haversineDistanceMeters(lat, lng, latValue, lngValue);
      const openingHours = pickTag(tags, ['opening_hours']) || 'No informado';
      const contact =
        pickTag(tags, ['phone', 'contact:phone', 'contact:mobile', 'mobile', 'contact:whatsapp', 'whatsapp']) ||
        pickTag(tags, ['email', 'contact:email']) ||
        'No informado';
      const website = normalizeWebsite(pickTag(tags, ['website', 'contact:website', 'url']));

      return {
        id: `${element.type ?? 'item'}-${element.id ?? Math.random()}`,
        name: tags.name || 'Veterinaria',
        lat: latValue,
        lng: lngValue,
        address: buildAddress(tags),
        openingHours,
        contact,
        website,
        distanceMeters,
      } as VetPlace;
    })
    .filter((item): item is VetPlace => item !== null)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  return vets;
}

function RecenterMap({ center }: { center: LatLngExpression }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, 15, { animate: true });
  }, [center, map]);

  return null;
}

export function NearbyVetsMapSection() {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [nearbyVets, setNearbyVets] = useState<VetPlace[]>([]);
  const [selectedVet, setSelectedVet] = useState<VetPlace | null>(null);
  const [loadingVets, setLoadingVets] = useState(false);
  const [vetsError, setVetsError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [showSettingsCta, setShowSettingsCta] = useState(false);
  const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  const mapCenter = useMemo<LatLngExpression>(
    () => (location ? [location.lat, location.lng] : DEFAULT_CENTER),
    [location],
  );

  const loadNearbyVets = useCallback(async (lat: number, lng: number) => {
    setLoadingVets(true);
    setVetsError(null);

    try {
      const vets = await fetchNearbyVets(lat, lng);
      setNearbyVets(vets);
      setSelectedVet((currentSelected) => currentSelected && vets.some((vet) => vet.id === currentSelected.id) ? currentSelected : vets[0] ?? null);
    } catch {
      setNearbyVets([]);
      setSelectedVet(null);
      setVetsError('No se pudo cargar el listado de veterinarias cercanas.');
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
      if (browserAccuracy > MIN_ACCEPTABLE_ACCURACY_METERS) {
        if (!silent) {
          setLocationError(
            `Ubicacion imprecisa (${Math.round(browserAccuracy)} m). Activa ubicacion precisa en el telefono y vuelve a intentar.`,
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
    } finally {
      setLocating(false);
    }
  }, [isNativeAndroid, loadNearbyVets]);

  useEffect(() => {
    void requestLocation(true);
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
                <Marker position={[location.lat, location.lng]} icon={locationMarkerIcon}>
                  <Popup>Tu ubicacion</Popup>
                </Marker>
              </>
            )}

            {nearbyVets.map((vet) => (
              <Marker
                key={vet.id}
                position={[vet.lat, vet.lng]}
                icon={vetMarkerIcon}
                eventHandlers={{
                  click: () => {
                    setSelectedVet(vet);
                  },
                }}
              >
                <Popup>
                  <div className="space-y-2">
                    <p className="font-semibold text-slate-900">{vet.name}</p>
                    <p className="text-xs text-slate-600">{vet.address}</p>
                    <p className="text-xs text-slate-600">Horarios: {vet.openingHours}</p>
                    <p className="text-xs text-slate-600">Contacto: {vet.contact}</p>
                    {vet.website && (
                      <a
                        href={vet.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-emerald-700 underline"
                      >
                        Ver web
                      </a>
                    )}
                    <p className="text-xs text-emerald-700">A {Math.round(vet.distanceMeters)} m</p>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-emerald-100">
        <p className="text-sm font-semibold text-slate-800">Veterinarias en un radio de 10 cuadras</p>
        {loadingVets && <p className="mt-2 text-sm text-slate-500">Buscando veterinarias cercanas...</p>}
        {vetsError && <p className="mt-2 text-sm text-amber-700">{vetsError}</p>}
        {!loadingVets && !vetsError && location && nearbyVets.length === 0 && (
          <p className="mt-2 text-sm text-slate-500">No encontramos veterinarias dentro de 10 cuadras de tu ubicacion.</p>
        )}
        {!loadingVets && nearbyVets.length > 0 && (
          <ul className="mt-3 space-y-3 text-sm text-slate-700">
            {nearbyVets.slice(0, 8).map((vet) => (
              <li
                key={`list-${vet.id}`}
                className={`rounded-2xl p-3 ring-1 transition ${selectedVet?.id === vet.id ? 'bg-emerald-50 ring-emerald-200' : 'bg-slate-50 ring-slate-100'}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSelectedVet(vet);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedVet(vet);
                  }
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{vet.name}</p>
                    <p className="text-xs text-slate-600">{vet.address}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                    {Math.round(vet.distanceMeters)} m
                  </span>
                </div>
                <div className="mt-2 grid gap-1 text-xs text-slate-600">
                  <p>Horarios: {vet.openingHours}</p>
                  <p>Contacto: {vet.contact}</p>
                  {vet.website ? (
                    <a href={vet.website} target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 underline">
                      Web oficial
                    </a>
                  ) : (
                    <p>Web: No informada</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedVet && (
        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-emerald-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Veterinaria seleccionada</p>
              <h3 className="mt-1 text-lg font-extrabold text-slate-900">{selectedVet.name}</h3>
            </div>
            <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
              {Math.round(selectedVet.distanceMeters)} m
            </span>
          </div>

          <div className="mt-4 grid gap-2 text-sm text-slate-700">
            <p><span className="font-semibold text-slate-900">Direccion:</span> {selectedVet.address}</p>
            <p><span className="font-semibold text-slate-900">Dias y horarios:</span> {selectedVet.openingHours}</p>
            <p><span className="font-semibold text-slate-900">Contacto:</span> {selectedVet.contact}</p>
            <p>
              <span className="font-semibold text-slate-900">Web:</span>{' '}
              {selectedVet.website ? (
                <a href={selectedVet.website} target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 underline">
                  Abrir web
                </a>
              ) : (
                'No informada'
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              if (location) {
                setSelectedVet(selectedVet);
              }
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
          >
            <Navigation size={16} />
            Centrar seleccionada
          </button>
        </div>
      )}
    </section>
  );
}
