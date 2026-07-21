import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { LocateFixed, MapPin, MessageCircleHeart, Navigation, Search, Star, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { AndroidSettings, IOSSettings, NativeSettings } from 'capacitor-native-settings';
import { Circle, MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import { divIcon, type LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AdBanner } from './AdBanner';
import { useAppState } from '../context/AppStateContext';
import {
  fetchActiveVeterinaryProfilesByZone,
  fetchVeterinaryIncubatorByZone,
  getVeterinaryClaimLanding,
  submitVeterinaryClaimDecision,
  suggestVeterinary,
  triggerVeterinaryConsentWhatsApp,
  validateVeterinary,
} from '../lib/supabase';
import type { VeterinaryClaimLanding, VeterinaryIncubatorItem, VeterinaryProfile } from '../types';

const DEFAULT_QUERY = 'veterinaria';
const MIN_ACCEPTABLE_ACCURACY_METERS = 150;
const MAX_BROWSER_ACCEPTABLE_ACCURACY_METERS = 3000;
const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
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

const VET_ZONE_FAVORITE_KEY = 'apf_vet_zone_favorite';

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

function inferZoneLabel(address: string) {
  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return parts[parts.length - 2];
  }

  return parts[0] || 'Tu zona';
}

function readFavoriteZone(userId?: string) {
  if (typeof window === 'undefined') {
    return '';
  }

  const scopedKey = userId ? `${VET_ZONE_FAVORITE_KEY}_${userId}` : VET_ZONE_FAVORITE_KEY;
  const scopedValue = window.localStorage.getItem(scopedKey)?.trim();
  if (scopedValue) {
    return scopedValue;
  }

  const genericValue = window.localStorage.getItem(VET_ZONE_FAVORITE_KEY)?.trim();
  return genericValue || '';
}

function writeFavoriteZone(zoneLabel: string, userId?: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const cleaned = zoneLabel.trim();
  if (!cleaned) {
    return;
  }

  window.localStorage.setItem(VET_ZONE_FAVORITE_KEY, cleaned);
  if (userId) {
    window.localStorage.setItem(`${VET_ZONE_FAVORITE_KEY}_${userId}`, cleaned);
  }
}

async function reverseGeocodeZone(lat: number, lng: number): Promise<string | null> {
  const reverseUrl = new URL(NOMINATIM_REVERSE_ENDPOINT);
  reverseUrl.searchParams.set('lat', String(lat));
  reverseUrl.searchParams.set('lon', String(lng));
  reverseUrl.searchParams.set('format', 'jsonv2');
  reverseUrl.searchParams.set('addressdetails', '1');
  reverseUrl.searchParams.set('zoom', '14');

  const response = await fetchWithTimeout(
    reverseUrl.toString(),
    { headers: { 'Accept-Language': 'es' } },
    FETCH_TIMEOUT_MS,
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    address?: {
      suburb?: string;
      neighbourhood?: string;
      city_district?: string;
      city?: string;
      town?: string;
      village?: string;
      county?: string;
      state?: string;
    };
  };

  const zone = [
    payload.address?.suburb,
    payload.address?.neighbourhood,
    payload.address?.city_district,
    payload.address?.city,
    payload.address?.town,
    payload.address?.village,
    payload.address?.county,
    payload.address?.state,
  ].find((item) => Boolean(item && item.trim()));

  return zone?.trim() || null;
}

function buildClaimUrl(claimToken: string, refUserId?: string) {
  if (typeof window === 'undefined') {
    return '';
  }

  const claimUrl = new URL(window.location.origin + window.location.pathname);
  claimUrl.searchParams.set('tab', 'map');
  claimUrl.searchParams.set('vet_claim', claimToken);
  if (refUserId) {
    claimUrl.searchParams.set('ref', refUserId);
  }
  return claimUrl.toString();
}

function buildVetInvitationMessage(vetName: string, claimUrl: string) {
  return `Hola ${vetName}, te contacta el equipo de AiPetFriendly. Queremos invitarte a activar tu perfil verificado para que las familias de tu zona te encuentren facilmente. Desde este enlace puedes confirmar o corregir datos, rechazar la publicacion o activar plan premium: ${claimUrl}`;
}

function formatArs(value: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}

export function NearbyVetsMapSection() {
  const { user, pets, setActiveTab } = useAppState();
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
  const [incubatorZone, setIncubatorZone] = useState(() => readFavoriteZone() || 'Tu zona');
  const [incubatorItems, setIncubatorItems] = useState<VeterinaryIncubatorItem[]>([]);
  const [loadingIncubator, setLoadingIncubator] = useState(false);
  const [incubatorError, setIncubatorError] = useState<string | null>(null);
  const [activeProfiles, setActiveProfiles] = useState<VeterinaryProfile[]>([]);
  const [loadingActiveProfiles, setLoadingActiveProfiles] = useState(false);
  const [activeProfilesError, setActiveProfilesError] = useState<string | null>(null);

  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [suggestName, setSuggestName] = useState('');
  const [suggestAddress, setSuggestAddress] = useState('');
  const [suggestZone, setSuggestZone] = useState('');
  const [suggestPhone, setSuggestPhone] = useState('');
  const [lastSuggestedVet, setLastSuggestedVet] = useState<VeterinaryIncubatorItem | null>(null);

  const [claimToken, setClaimToken] = useState<string | null>(null);
  const [claimPreview, setClaimPreview] = useState<VeterinaryClaimLanding | null>(null);
  const [loadingClaimPreview, setLoadingClaimPreview] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimActionLoading, setClaimActionLoading] = useState<'correct' | 'reject' | 'subscribe' | null>(null);
  const [claimFormName, setClaimFormName] = useState('');
  const [claimFormZone, setClaimFormZone] = useState('');
  const [claimFormAddress, setClaimFormAddress] = useState('');
  const [claimFormPhone, setClaimFormPhone] = useState('');
  const [claimFormEmail, setClaimFormEmail] = useState('');
  const [claimFormBusinessDays, setClaimFormBusinessDays] = useState('');
  const [claimFormBusinessHours, setClaimFormBusinessHours] = useState('');
  const [claimFormServices, setClaimFormServices] = useState('');
  const [claimFormWebsite, setClaimFormWebsite] = useState('');
  const [claimFormInstagram, setClaimFormInstagram] = useState('');
  const [claimFormFacebook, setClaimFormFacebook] = useState('');
  const [claimConsentGranted, setClaimConsentGranted] = useState(false);
  const [claimBasicDataConfirmed, setClaimBasicDataConfirmed] = useState(false);
  const [claimBillingMode, setClaimBillingMode] = useState<'monthly_auto' | 'annual'>('monthly_auto');

  const [sectionMessage, setSectionMessage] = useState<string | null>(null);

  const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  const suggestedItems = useMemo(
    () => incubatorItems.filter((item) => item.status === 'CLAIMABLE_PROFILE'),
    [incubatorItems],
  );

  const incubatorOnlyItems = useMemo(
    () => incubatorItems.filter((item) => item.status === 'IN_INCUBATOR'),
    [incubatorItems],
  );

  const applyZoneSelection = useCallback((zoneLabel: string, persist = false) => {
    const cleaned = zoneLabel.trim();
    if (!cleaned) {
      return;
    }

    setIncubatorZone(cleaned);
    setSuggestZone(cleaned);

    if (persist) {
      writeFavoriteZone(cleaned, user?.id);
    }
  }, [user?.id]);

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

  const loadIncubator = useCallback(async (zoneLabel: string) => {
    if (!user || user.isGuest) {
      setIncubatorItems([]);
      return;
    }

    setLoadingIncubator(true);
    setIncubatorError(null);

    try {
      const items = await fetchVeterinaryIncubatorByZone({
        zoneLabel,
        userId: user.id,
        limit: 30,
      });
      setIncubatorItems(items);
    } catch {
      setIncubatorItems([]);
      setIncubatorError('No se pudo cargar la incubadora de veterinarias para esta zona.');
    } finally {
      setLoadingIncubator(false);
    }
  }, [user]);

  const loadActiveProfiles = useCallback(async (zoneLabel: string) => {
    setLoadingActiveProfiles(true);
    setActiveProfilesError(null);

    try {
      const profiles = await fetchActiveVeterinaryProfilesByZone({
        zoneLabel,
        limit: 50,
      });
      setActiveProfiles(profiles);
    } catch {
      setActiveProfiles([]);
      setActiveProfilesError('No se pudo cargar el listado de veterinarias activas para esta zona.');
    } finally {
      setLoadingActiveProfiles(false);
    }
  }, []);

  const sortedActiveProfiles = useMemo(() => {
    const scored = activeProfiles.map((profile) => {
      const hasCoords = typeof profile.latitude === 'number' && typeof profile.longitude === 'number' && !!location;
      const distanceMeters = hasCoords
        ? haversineDistanceMeters(location!.lat, location!.lng, profile.latitude!, profile.longitude!)
        : Number.MAX_SAFE_INTEGER;

      return {
        profile,
        isPremium: profile.subscriptionPlan === 'premium' || profile.status === 'ACTIVE_PREMIUM',
        distanceMeters,
      };
    });

    scored.sort((a, b) => {
      if (a.isPremium !== b.isPremium) {
        return a.isPremium ? -1 : 1;
      }
      if (a.distanceMeters !== b.distanceMeters) {
        return a.distanceMeters - b.distanceMeters;
      }
      return b.profile.upvotesCount - a.profile.upvotesCount;
    });

    return scored;
  }, [activeProfiles, location]);

  const openInviteOnWhatsApp = useCallback((item: { name: string; claimToken?: string }) => {
    if (!item.claimToken) {
      setSectionMessage('La veterinaria fue sugerida, pero todavia no se genero un enlace de claim.');
      return;
    }

    const claimUrl = buildClaimUrl(item.claimToken, user?.id);
    const inviteMessage = buildVetInvitationMessage(item.name, claimUrl);
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(inviteMessage)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  }, [user?.id]);

  const notifySuggestedVetByWhatsApp = useCallback((args: {
    vetName: string;
    vetPhone?: string;
    zoneLabel: string;
    address: string;
    shareIdentity: boolean;
    claimToken?: string;
    upvotesCount?: number;
  }) => {
    const digitsOnlyPhone = (args.vetPhone || '').replace(/\D/g, '');
    if (!digitsOnlyPhone) {
      setSectionMessage('La sugerencia fue guardada, pero no hay un WhatsApp valido para avisar a la veterinaria.');
      return;
    }

    const userAlias = user?.email?.split('@')[0] || 'usuario';
    const ownerPetNames = pets.map((pet) => pet.name).filter(Boolean);
    const petSummary = ownerPetNames.length > 0 ? ownerPetNames.join(', ') : 'mascotas de la comunidad';
    const claimUrl = args.claimToken ? buildClaimUrl(args.claimToken, user?.id) : '';

    const whoSuggested = args.shareIdentity
      ? `La sugerencia fue hecha por ${userAlias} (${petSummary}).`
      : 'La sugerencia fue enviada por la comunidad AiPetFriendly (anonima).';

    const backingText = typeof args.upvotesCount === 'number'
      ? `Mas de ${args.upvotesCount} usuarios solicitaron que aparezcas en la app.`
      : 'Usuarios de tu zona solicitaron que aparezcas en la app.';

    const consentMessage = [
      `Hola ${args.vetName}.`,
      'Te escribe el equipo de AiPetFriendly.',
      whoSuggested,
      backingText,
      `Queremos pedirte consentimiento para publicar tus datos en la zona ${args.zoneLabel}.`,
      `Datos sugeridos: ${args.vetName} | ${args.address}${args.vetPhone ? ` | WhatsApp ${args.vetPhone}` : ''}.`,
      'Puedes confirmar o corregir datos, rechazar la publicacion, o activar Premium para aparecer destacada.',
      claimUrl ? `Activalo aqui: ${claimUrl}` : '',
    ].join(' ');

    const url = `https://wa.me/${digitsOnlyPhone}?text=${encodeURIComponent(consentMessage)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [pets, user?.email]);

  const handleSuggestVet = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || user.isGuest) {
      setSuggestionError('Debes iniciar sesion para sugerir veterinarias.');
      return;
    }

    const cleanedName = suggestName.trim();
    const cleanedAddress = suggestAddress.trim();
    const cleanedZone = (suggestZone.trim() || incubatorZone || 'Tu zona').trim();

    if (!cleanedName || !cleanedAddress || !cleanedZone) {
      setSuggestionError('Completa nombre, direccion y zona para enviar la sugerencia.');
      return;
    }

    setSuggesting(true);
    setSuggestionError(null);

    try {
      const created = await suggestVeterinary({
        name: cleanedName,
        address: cleanedAddress,
        zoneLabel: cleanedZone,
        phoneWhatsapp: suggestPhone.trim() || undefined,
        latitude: location?.lat,
        longitude: location?.lng,
      });

      if (!created) {
        setSuggestionError('No se pudo registrar la veterinaria sugerida.');
        return;
      }

      setLastSuggestedVet({ ...created, userHasValidated: false });
      setSectionMessage(`Sugerencia enviada: ${created.name}. Ahora puedes invitarla por WhatsApp.`);
      setShowSuggestModal(false);
      setSuggestName('');
      setSuggestAddress('');
      setSuggestZone(cleanedZone);
      setSuggestPhone('');
      applyZoneSelection(cleanedZone, true);
      await loadIncubator(cleanedZone);
    } catch {
      setSuggestionError('No se pudo registrar la sugerencia en este momento.');
    } finally {
      setSuggesting(false);
    }
  }, [applyZoneSelection, incubatorZone, loadIncubator, location?.lat, location?.lng, suggestAddress, suggestName, suggestPhone, suggestZone, user]);

  const handleValidateVet = useCallback(async (vetId: string) => {
    if (!user || user.isGuest) {
      setSectionMessage('Debes iniciar sesion para validar una veterinaria sugerida.');
      return;
    }

    const updated = await validateVeterinary(vetId);
    if (!updated) {
      setSectionMessage('No se pudo registrar tu validacion.');
      return;
    }

    setIncubatorItems((current) => current.map((item) => (
      item.id === vetId
        ? { ...item, ...updated, userHasValidated: true }
        : item
    )));

    if (updated.upvotesCount > 5) {
      const autoDispatch = await triggerVeterinaryConsentWhatsApp(updated.id);
      if (autoDispatch.sent) {
        setSectionMessage(`${updated.name} supero los 5 respaldos. Se envio automaticamente la solicitud de consentimiento por WhatsApp.`);
      } else {
        setSectionMessage(`${updated.name} alcanzo el umbral y ya esta lista para activar su perfil.`);
      }
    } else {
      setSectionMessage('Gracias por validar la veterinaria sugerida.');
    }
  }, [user]);

  const handleClaimDecision = useCallback(async (action: 'correct' | 'reject' | 'subscribe') => {
    if (!claimToken) {
      return;
    }

    if (action === 'subscribe' && (!user || user.isGuest)) {
      setClaimError('Para activar el plan premium debes iniciar sesion con una cuenta.');
      return;
    }

    setClaimActionLoading(action);
    setClaimError(null);

    if (!claimConsentGranted && action !== 'reject') {
      setClaimError('Debes aceptar el consentimiento de publicacion para continuar.');
      setClaimActionLoading(null);
      return;
    }

    try {
      const claimed = await submitVeterinaryClaimDecision({
        claimToken,
        action,
        name: claimFormName,
        zoneLabel: claimFormZone,
        address: claimFormAddress,
        phoneWhatsapp: claimFormPhone,
        contactEmail: claimFormEmail,
        consentGranted: action === 'reject' ? false : claimConsentGranted,
        basicDataConfirmed: claimBasicDataConfirmed,
        businessDays: claimFormBusinessDays,
        businessHours: claimFormBusinessHours,
        services: claimFormServices,
        websiteUrl: claimFormWebsite,
        instagramUrl: claimFormInstagram,
        facebookUrl: claimFormFacebook,
        subscriptionBillingMode: action === 'subscribe' ? claimBillingMode : undefined,
        notifyIdentity: false,
      });

      if (!claimed) {
        setClaimError('No se pudo guardar tu respuesta del perfil en este momento.');
        return;
      }

      setClaimPreview((current) => {
        if (!current) return current;
        return {
          ...current,
          status: claimed.status,
          isClaimed: claimed.status === 'ACTIVE_FREE' || claimed.status === 'ACTIVE_PREMIUM',
          consentGranted: claimed.consentGranted,
          basicDataConfirmed: claimed.basicDataConfirmed,
          subscriptionPlan: claimed.subscriptionPlan,
          subscriptionBillingMode: claimed.subscriptionBillingMode,
        };
      });

      if (action === 'reject') {
        setSectionMessage(`Registramos que ${claimed.name} no desea aparecer en AiPetFriendly por ahora.`);
      } else if (action === 'subscribe') {
        setSectionMessage(`${claimed.name} fue activada en Premium y aparecera destacada en el mapa.`);
      } else {
        setSectionMessage(`${claimed.name} fue activada y ya figura en el mapa de su zona.`);
      }

      await loadActiveProfiles(claimed.zoneLabel || incubatorZone);
      await loadIncubator(claimed.zoneLabel || incubatorZone);
    } catch {
      setClaimError('No se pudo guardar la decision del perfil.');
    } finally {
      setClaimActionLoading(null);
    }
  }, [claimBasicDataConfirmed, claimBillingMode, claimConsentGranted, claimFormAddress, claimFormBusinessDays, claimFormBusinessHours, claimFormEmail, claimFormFacebook, claimFormInstagram, claimFormName, claimFormPhone, claimFormServices, claimFormWebsite, claimFormZone, claimToken, incubatorZone, loadActiveProfiles, loadIncubator, user]);

  const openInMapsUrl = useMemo(
    () => buildExternalMapsUrl({ lat: location?.lat, lng: location?.lng, address: manualAddress }),
    [location, manualAddress],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('vet_claim');
    const tabFromUrl = params.get('tab');
    if (tabFromUrl === 'map') {
      setActiveTab('map');
    }
    if (tokenFromUrl) {
      setClaimToken(tokenFromUrl);
    }
  }, [setActiveTab]);

  useEffect(() => {
    if (!claimToken) {
      return;
    }

    const run = async () => {
      setLoadingClaimPreview(true);
      setClaimError(null);
      const preview = await getVeterinaryClaimLanding(claimToken);
      if (!preview) {
        setClaimError('El enlace de claim no es valido o ya expiro.');
        setLoadingClaimPreview(false);
        return;
      }

      setClaimFormName(preview.name || '');
      setClaimFormZone(preview.zoneLabel || '');
      setClaimFormAddress(preview.address || '');
      setClaimFormPhone(preview.phoneWhatsapp || '');
      setClaimFormEmail(preview.contactEmail || '');
      setClaimFormBusinessDays(preview.businessDays || '');
      setClaimFormBusinessHours(preview.businessHours || '');
      setClaimFormServices(preview.services || '');
      setClaimFormWebsite(preview.websiteUrl || '');
      setClaimFormInstagram(preview.instagramUrl || '');
      setClaimFormFacebook(preview.facebookUrl || '');
      setClaimConsentGranted(preview.consentGranted);
      setClaimBasicDataConfirmed(preview.basicDataConfirmed);
      setClaimBillingMode(preview.subscriptionBillingMode || 'monthly_auto');
      setClaimPreview(preview);
      setLoadingClaimPreview(false);
    };

    void run();
  }, [claimToken]);

  useEffect(() => {
    if (!showSuggestModal) {
      return;
    }

    setSuggestZone((current) => (current.trim().length > 0 ? current : incubatorZone));
  }, [incubatorZone, showSuggestModal]);

  useEffect(() => {
    const preferredZone = readFavoriteZone(user?.id);
    if (!preferredZone) {
      return;
    }

    setIncubatorZone(preferredZone);
    setSuggestZone(preferredZone);
  }, [user?.id]);

  useEffect(() => {
    if (!user || user.isGuest) {
      return;
    }
    if (!incubatorZone.trim()) {
      return;
    }
    void loadIncubator(incubatorZone);
  }, [incubatorZone, loadIncubator, user]);

  useEffect(() => {
    if (!incubatorZone.trim()) {
      setActiveProfiles([]);
      return;
    }
    void loadActiveProfiles(incubatorZone);
  }, [incubatorZone, loadActiveProfiles]);

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

        const detectedZone = await reverseGeocodeZone(nextLocation.lat, nextLocation.lng).catch(() => null);
        if (detectedZone) {
          applyZoneSelection(detectedZone, true);
        }

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

      const detectedZone = await reverseGeocodeZone(nextLocation.lat, nextLocation.lng).catch(() => null);
      if (detectedZone) {
        applyZoneSelection(detectedZone, true);
      }

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
  }, [applyZoneSelection, isNativeAndroid, loadNearbyVets]);

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
        applyZoneSelection(inferZoneLabel(cleanedAddress), true);
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
        {sectionMessage && <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{sectionMessage}</p>}
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

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-emerald-100">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-900">Veterinarias activas en AiPetFriendly</p>
            <p className="text-xs text-slate-500">Ordenadas por plan premium y luego cercania a tu ubicacion.</p>
          </div>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">Premium primero</span>
        </div>

        {loadingActiveProfiles && <p className="mt-3 text-sm text-slate-500">Cargando veterinarias activas...</p>}
        {activeProfilesError && <p className="mt-3 text-sm text-amber-700">{activeProfilesError}</p>}

        {!loadingActiveProfiles && !activeProfilesError && sortedActiveProfiles.length === 0 && (
          <p className="mt-3 text-sm text-slate-500">Aun no hay veterinarias activas en esta zona.</p>
        )}

        {!loadingActiveProfiles && !activeProfilesError && sortedActiveProfiles.length > 0 && (
          <ul className="mt-3 space-y-2">
            {sortedActiveProfiles.map(({ profile, isPremium, distanceMeters }) => (
              <li
                key={profile.id}
                className={`rounded-xl border p-3 ${isPremium ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200 bg-slate-50'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{profile.name}</p>
                    <p className="text-xs text-slate-600">{profile.address}</p>
                    <p className="mt-1 text-xs text-slate-500">Zona: {profile.zoneLabel}</p>
                  </div>
                  {isPremium ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800">
                      <Star size={12} /> Premium
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700">Free</span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {distanceMeters < Number.MAX_SAFE_INTEGER ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-700">
                      A {Math.round(distanceMeters)} m
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-200 px-2 py-1 font-semibold text-slate-700">Distancia no disponible</span>
                  )}

                  {profile.phoneWhatsapp && (
                    <a
                      href={`https://wa.me/${profile.phoneWhatsapp.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-emerald-300 bg-white px-2 py-1 font-semibold text-emerald-700"
                    >
                      WhatsApp
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-emerald-100">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-900">Incubadora comunitaria</p>
            <p className="text-xs text-slate-500">Veterinarias sugeridas y validadas por vecinos. Al superar 5 respaldos, se envia WhatsApp automaticamente para consentimiento.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!user || user.isGuest) {
                setSectionMessage('Debes iniciar sesion para sugerir veterinarias.');
                return;
              }
              setShowSuggestModal(true);
              setSuggestionError(null);
            }}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-3 py-2 text-xs font-semibold text-white"
          >
            <MessageCircleHeart size={14} />
            Sugerir veterinaria
          </button>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            value={incubatorZone}
            onChange={(event) => setIncubatorZone(event.target.value)}
            placeholder="Zona o barrio (ej: Caballito, CABA)"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none ring-emerald-200 focus:ring"
          />
          <button
            type="button"
            onClick={() => {
              if (!incubatorZone.trim()) {
                setIncubatorError('Indica una zona para cargar la incubadora.');
                return;
              }
              applyZoneSelection(incubatorZone, true);
              void loadIncubator(incubatorZone);
            }}
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white"
          >
            Cargar zona
          </button>
        </div>

        <p className="mt-2 text-xs text-slate-500">Zona favorita actual: {incubatorZone}</p>

        {!user || user.isGuest ? (
          <p className="mt-3 text-sm text-amber-700">Inicia sesion para sugerir, validar y ayudar a activar perfiles de veterinarias.</p>
        ) : null}

        {loadingIncubator && <p className="mt-3 text-sm text-slate-500">Cargando sugerencias e incubadora...</p>}
        {incubatorError && <p className="mt-3 text-sm text-amber-700">{incubatorError}</p>}

        {!loadingIncubator && incubatorItems.length === 0 && !incubatorError && (
          <p className="mt-3 text-sm text-slate-500">Todavia no hay sugerencias en esta zona. Puedes cargar la primera.</p>
        )}

        {!loadingIncubator && incubatorItems.length > 0 && (
          <div className="mt-3 space-y-4">
            {suggestedItems.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">Sugeridas por la comunidad</p>
                <ul className="space-y-2">
                  {suggestedItems.map((item) => {
                    const reachedGoal = item.upvotesCount >= item.validationsGoal;
                    return (
                      <li key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                            <p className="text-xs text-slate-600">{item.address}</p>
                            <p className="mt-1 text-xs text-slate-500">Zona: {item.zoneLabel}</p>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${reachedGoal ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {reachedGoal ? 'Lista para activar' : 'Sugerida'}
                          </span>
                        </div>

                        <p className="mt-2 text-xs text-slate-700">
                          Respaldo comunitario: {item.upvotesCount} / {item.validationsGoal}
                        </p>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${Math.min(100, Math.round((item.upvotesCount / item.validationsGoal) * 100))}%` }}
                          />
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void handleValidateVet(item.id);
                            }}
                            disabled={item.userHasValidated}
                            className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55"
                          >
                            {item.userHasValidated ? 'Ya validaste' : 'Yo tambien me atiendo aca'}
                          </button>
                          {user?.isAdmin && item.phoneWhatsapp && (
                            <button
                              type="button"
                              onClick={() => notifySuggestedVetByWhatsApp({
                                vetName: item.name,
                                vetPhone: item.phoneWhatsapp,
                                zoneLabel: item.zoneLabel,
                                address: item.address,
                                shareIdentity: false,
                                claimToken: item.claimToken,
                                upvotesCount: item.upvotesCount,
                              })}
                              className="rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700"
                            >
                              Reenviar consentimiento (admin)
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {incubatorOnlyItems.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">En incubadora</p>
                <ul className="space-y-2">
                  {incubatorOnlyItems.map((item) => {
                    const reachedGoal = item.upvotesCount >= item.validationsGoal;
                    return (
                      <li key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                            <p className="text-xs text-slate-600">{item.address}</p>
                            <p className="mt-1 text-xs text-slate-500">Zona: {item.zoneLabel}</p>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${reachedGoal ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {reachedGoal ? 'Lista para activar' : 'En incubadora'}
                          </span>
                        </div>

                        <p className="mt-2 text-xs text-slate-700">
                          Respaldo comunitario: {item.upvotesCount} / {item.validationsGoal}
                        </p>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${Math.min(100, Math.round((item.upvotesCount / item.validationsGoal) * 100))}%` }}
                          />
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void handleValidateVet(item.id);
                            }}
                            disabled={item.userHasValidated}
                            className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55"
                          >
                            {item.userHasValidated ? 'Ya validaste' : 'Yo tambien me atiendo aca'}
                          </button>
                          {user?.isAdmin && item.phoneWhatsapp && (
                            <button
                              type="button"
                              onClick={() => notifySuggestedVetByWhatsApp({
                                vetName: item.name,
                                vetPhone: item.phoneWhatsapp,
                                zoneLabel: item.zoneLabel,
                                address: item.address,
                                shareIdentity: false,
                                claimToken: item.claimToken,
                                upvotesCount: item.upvotesCount,
                              })}
                              className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700"
                            >
                              Reenviar consentimiento (admin)
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {lastSuggestedVet && (
        <div className="rounded-2xl bg-emerald-50 p-4 shadow-sm ring-1 ring-emerald-200">
          <p className="text-sm font-semibold text-emerald-800">Hace que {lastSuggestedVet.name} se entere</p>
          <p className="mt-1 text-xs text-emerald-700">Comparte el enlace de claim para que complete su perfil y aparezca en la zona.</p>
          <button
            type="button"
            onClick={() => openInviteOnWhatsApp(lastSuggestedVet)}
            className="mt-3 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white"
          >
            Compartir por WhatsApp
          </button>
        </div>
      )}

      {(claimToken || claimPreview || loadingClaimPreview || claimError) && (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-emerald-100">
          <p className="text-sm font-semibold text-slate-900">Activacion de perfil veterinario</p>
          {loadingClaimPreview && <p className="mt-2 text-sm text-slate-500">Cargando datos del perfil sugerido...</p>}
          {claimError && <p className="mt-2 text-sm text-amber-700">{claimError}</p>}

          {claimPreview && (
            <div className="mt-3 space-y-2">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                <p className="text-sm font-semibold text-emerald-800">{claimPreview.name}</p>
                <p className="text-xs text-emerald-700">{claimPreview.address}</p>
                <p className="mt-1 text-xs text-emerald-700">
                  {claimPreview.suggestedClients} familias en {claimPreview.zoneLabel} la recomendaron.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-700">
                  Nombre comercial
                  <input
                    value={claimFormName}
                    onChange={(event) => setClaimFormName(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    disabled={claimPreview.subscriptionPlan === 'premium' && claimPreview.status === 'ACTIVE_PREMIUM'}
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  Zona
                  <input
                    value={claimFormZone}
                    onChange={(event) => setClaimFormZone(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
                  Direccion
                  <input
                    value={claimFormAddress}
                    onChange={(event) => setClaimFormAddress(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    disabled={claimPreview.subscriptionPlan === 'premium' && claimPreview.status === 'ACTIVE_PREMIUM'}
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  WhatsApp
                  <input
                    value={claimFormPhone}
                    onChange={(event) => setClaimFormPhone(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  Email de contacto
                  <input
                    type="email"
                    value={claimFormEmail}
                    onChange={(event) => setClaimFormEmail(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  Dias de atencion
                  <input
                    value={claimFormBusinessDays}
                    onChange={(event) => setClaimFormBusinessDays(event.target.value)}
                    placeholder="Lunes a sabado"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  Horarios
                  <input
                    value={claimFormBusinessHours}
                    onChange={(event) => setClaimFormBusinessHours(event.target.value)}
                    placeholder="09:00 a 19:00"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
                  Servicios
                  <input
                    value={claimFormServices}
                    onChange={(event) => setClaimFormServices(event.target.value)}
                    placeholder="Clinica, cirugias, guardia, laboratorio"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  Sitio web
                  <input
                    value={claimFormWebsite}
                    onChange={(event) => setClaimFormWebsite(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  Instagram
                  <input
                    value={claimFormInstagram}
                    onChange={(event) => setClaimFormInstagram(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <label className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={claimConsentGranted}
                  onChange={(event) => setClaimConsentGranted(event.target.checked)}
                  className="mt-0.5"
                />
                Acepto que estos datos se publiquen en AiPetFriendly.
              </label>

              <label className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={claimBasicDataConfirmed}
                  onChange={(event) => setClaimBasicDataConfirmed(event.target.checked)}
                  className="mt-0.5"
                />
                Confirmo que los datos basicos son correctos.
              </label>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-800">Suscripcion Premium</p>
                <p className="mt-1 text-xs text-amber-700">
                  Mensual: {formatArs(claimPreview.veterinaryPremiumMonthlyArs)} · Anual: {formatArs(claimPreview.veterinaryPremiumAnnualArs)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setClaimBillingMode('monthly_auto')}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${claimBillingMode === 'monthly_auto' ? 'border-amber-400 bg-amber-100 text-amber-900' : 'border-slate-200 bg-white text-slate-700'}`}
                  >
                    Mensual
                  </button>
                  <button
                    type="button"
                    onClick={() => setClaimBillingMode('annual')}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${claimBillingMode === 'annual' ? 'border-amber-400 bg-amber-100 text-amber-900' : 'border-slate-200 bg-white text-slate-700'}`}
                  >
                    Anual
                  </button>
                </div>
              </div>

              {claimPreview.status === 'REJECTED' ? (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                  Este perfil fue marcado como no disponible para publicacion.
                </p>
              ) : (
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => {
                      void handleClaimDecision('correct');
                    }}
                    disabled={claimActionLoading !== null}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                  >
                    {claimActionLoading === 'correct' ? 'Guardando...' : 'Corregir / Confirmar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleClaimDecision('reject');
                    }}
                    disabled={claimActionLoading !== null}
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
                  >
                    {claimActionLoading === 'reject' ? 'Guardando...' : 'No quiero aparecer'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleClaimDecision('subscribe');
                    }}
                    disabled={claimActionLoading !== null}
                    className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-semibold text-white"
                  >
                    {claimActionLoading === 'subscribe' ? 'Activando...' : 'Suscribirme Premium'}
                  </button>
                </div>
              )}

              {(!user || user.isGuest) && claimPreview.status !== 'REJECTED' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('subscription')}
                  className="mt-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"
                >
                  Iniciar sesion para activar Premium
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {showSuggestModal && (
        <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-slate-900/45 md:items-center">
          <form onSubmit={handleSuggestVet} className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-4 md:rounded-3xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-900">Sugerir veterinaria</p>
                <p className="text-xs text-slate-500">Incubadora por demanda comunitaria</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Tu sugerencia entra en incubadora y se valida con recomendaciones de otros usuarios. Antes de publicar, pedimos consentimiento de la veterinaria.
                </p>
              </div>
              <button type="button" onClick={() => setShowSuggestModal(false)} className="text-slate-400">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Nombre</label>
                <input value={suggestName} onChange={(event) => setSuggestName(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Direccion o zona</label>
                <input value={suggestAddress} onChange={(event) => setSuggestAddress(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Barrio / zona</label>
                <input value={suggestZone} onChange={(event) => setSuggestZone(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" required />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Telefono o WhatsApp (opcional)</label>
                <input value={suggestPhone} onChange={(event) => setSuggestPhone(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-700">Solicitud de consentimiento automatica</p>
                <p className="mt-1 text-[11px] text-slate-500">Cuando esta veterinaria supere los 5 respaldos comunitarios, AiPetFriendly enviara automaticamente el WhatsApp con el enlace a la landing de consentimiento.</p>
              </div>
            </div>

            {suggestionError && <p className="mt-3 text-sm text-rose-700">{suggestionError}</p>}

            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setShowSuggestModal(false)} className="w-full rounded-full border border-slate-200 py-2 text-sm font-semibold text-slate-700">Cancelar</button>
              <button type="submit" disabled={suggesting} className="w-full rounded-full bg-emerald-500 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {suggesting ? 'Enviando...' : 'Enviar sugerencia'}
              </button>
            </div>
          </form>
        </div>
      )}

      <AdBanner adSenseSlotId="1111111111" />
    </section>
  );
}
