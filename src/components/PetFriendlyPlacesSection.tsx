import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  BedDouble,
  Coffee,
  Facebook,
  Globe,
  Instagram,
  Mail,
  MapPin,
  Phone,
  ShoppingBag,
  Star,
  Trees,
  Utensils,
  Waves,
  X,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import { divIcon, type LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AdBanner } from './AdBanner';
import { useAppState } from '../context/AppStateContext';
import {
  claimPetFriendlyPlaceAdminNotification,
  deletePetFriendlyPlaceReview,
  fetchActivePetFriendlyPlacesByZone,
  fetchPetFriendlyPlaceIncubatorByZone,
  fetchPetFriendlyPlaceReviews,
  getPetFriendlyPlaceClaimLanding,
  notifyAdminThreshold,
  submitPetFriendlyPlaceClaimDecision,
  suggestPetFriendlyPlace,
  uploadPetFriendlyPlaceImage,
  upsertPetFriendlyPlaceReview,
  validatePetFriendlyPlace,
} from '../lib/supabase';
import type {
  PetFriendlyPlace,
  PetFriendlyPlaceCategory,
  PetFriendlyPlaceClaimLanding,
  PetFriendlyPlaceIncubatorItem,
  PetFriendlyPlaceReview,
} from '../types';

// Slot de AdSense a crear en la cuenta (unidad "Anuncios de display" nueva);
// hasta cargarlo, AdBanner simplemente no va a mostrar nada (mismo criterio
// que el resto de las secciones).
const PLACES_ADSENSE_SLOT_ID = '0000000000';

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];
const SEARCH_RADIUS_METERS = 2500;
const FETCH_TIMEOUT_MS = 8000;
const FALLBACK_CENTER: LatLngExpression = [-34.6037, -58.3816];

type CategoryFilter = PetFriendlyPlaceCategory | 'todos';

const CATEGORY_META: Record<PetFriendlyPlaceCategory, { label: string; icon: typeof MapPin; osmQuery: string | null }> = {
  restaurante: { label: 'Restaurante', icon: Utensils, osmQuery: '["amenity"="restaurant"]' },
  hotel_alojamiento: { label: 'Hotel / Alojamiento', icon: BedDouble, osmQuery: '["tourism"~"hotel|hostel|guest_house"]' },
  playa: { label: 'Playa', icon: Waves, osmQuery: '["natural"="beach"]' },
  tienda: { label: 'Tienda', icon: ShoppingBag, osmQuery: '["shop"="pet"]' },
  plaza_parque: { label: 'Plaza / Parque', icon: Trees, osmQuery: '["leisure"="park"]' },
  bar_cafe: { label: 'Bar / Café', icon: Coffee, osmQuery: '["amenity"~"bar|cafe|pub"]' },
  otro: { label: 'Otro', icon: MapPin, osmQuery: null },
};

const placeMarkerIcon = divIcon({
  className: '',
  html: '<div style="width:26px;height:26px;border-radius:999px;background:#059669;border:3px solid #fff;box-shadow:0 6px 16px rgba(5,150,105,.45)"></div>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

const osmMarkerIcon = divIcon({
  className: '',
  html: '<div style="width:20px;height:20px;border-radius:999px;background:#94a3b8;border:2px solid #fff;box-shadow:0 4px 10px rgba(100,116,139,.4)"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const locationMarkerIcon = divIcon({
  className: '',
  html: '<div style="width:24px;height:24px;border-radius:999px;background:#2563eb;border:3px solid #fff;box-shadow:0 6px 16px rgba(37,99,235,.45)"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

type OsmPlace = {
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

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildAddress(tags: Record<string, string> | undefined) {
  if (!tags) return 'Direccion no informada';
  const street = tags['addr:street'];
  const number = tags['addr:housenumber'];
  const city = tags['addr:city'] || tags['addr:suburb'];
  const composed = [street, number, city].filter(Boolean).join(' ');
  return composed || tags.name || 'Direccion no informada';
}

async function fetchNearbyOsmPlaces(lat: number, lng: number, category: PetFriendlyPlaceCategory): Promise<OsmPlace[]> {
  const tagFilter = CATEGORY_META[category].osmQuery;
  if (!tagFilter) {
    return [];
  }

  const query = `[out:json][timeout:25];
(
  node${tagFilter}(around:${SEARCH_RADIUS_METERS},${lat},${lng});
  way${tagFilter}(around:${SEARCH_RADIUS_METERS},${lat},${lng});
);
out center tags;`;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetchWithTimeout(
        endpoint,
        { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: query },
        FETCH_TIMEOUT_MS,
      );
      if (!response.ok) continue;

      const payload = (await response.json()) as { elements?: Array<Record<string, unknown>> };
      const results = (payload.elements ?? [])
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
            name: tags.name || CATEGORY_META[category].label,
            lat: latValue,
            lng: lngValue,
            address: buildAddress(tags),
            distanceMeters: haversineDistanceMeters(lat, lng, latValue, lngValue),
          } as OsmPlace;
        })
        .filter((item): item is OsmPlace => item !== null)
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
        .slice(0, 20);

      if (results.length > 0) {
        return results;
      }
    } catch {
      continue;
    }
  }

  return [];
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const url = new URL(NOMINATIM_ENDPOINT);
  url.searchParams.set('q', address);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');

  const response = await fetch(url.toString(), { headers: { 'Accept-Language': 'es' } });
  if (!response.ok) return null;

  const results = (await response.json()) as Array<{ lat: string; lon: string }>;
  if (!results.length) return null;

  const lat = Number(results[0].lat);
  const lng = Number(results[0].lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

async function reverseGeocodeZone(lat: number, lng: number): Promise<string | null> {
  const url = new URL(NOMINATIM_REVERSE_ENDPOINT);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('zoom', '14');

  const response = await fetchWithTimeout(url.toString(), { headers: { 'Accept-Language': 'es' } }, FETCH_TIMEOUT_MS);
  if (!response.ok) return null;

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

function buildExternalMapsUrl(name: string, address: string) {
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', `${name} ${address}`.trim());
  return url.toString();
}

function buildClaimUrl(claimToken: string) {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('tab', 'places');
  url.searchParams.set('place_claim', claimToken);
  return url.toString();
}

function formatArs(value: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
}

async function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  if (Capacitor.isNativePlatform()) {
    try {
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
      return { lat: position.coords.latitude, lng: position.coords.longitude };
    } catch {
      return null;
    }
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

function StarRating({ value, onChange }: { value: number; onChange?: (value: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(star)}
          className={onChange ? 'cursor-pointer' : 'cursor-default'}
        >
          <Star
            size={onChange ? 22 : 14}
            className={star <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}
          />
        </button>
      ))}
    </div>
  );
}

function ContactLinks({ place }: { place: PetFriendlyPlace }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {place.phoneWhatsapp && (
        <a
          href={`https://wa.me/${place.phoneWhatsapp.replace(/[^0-9]/g, '')}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700"
        >
          <Phone size={12} /> WhatsApp
        </a>
      )}
      {place.contactEmail && (
        <a
          href={`mailto:${place.contactEmail}`}
          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700"
        >
          <Mail size={12} /> Email
        </a>
      )}
      {place.websiteUrl && (
        <a
          href={place.websiteUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700"
        >
          <Globe size={12} /> Web
        </a>
      )}
      {place.instagramUrl && (
        <a
          href={place.instagramUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700"
        >
          <Instagram size={12} /> Instagram
        </a>
      )}
      {place.facebookUrl && (
        <a
          href={place.facebookUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700"
        >
          <Facebook size={12} /> Facebook
        </a>
      )}
      <a
        href={buildExternalMapsUrl(place.name, place.address)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700"
      >
        <MapPin size={12} /> Google Maps
      </a>
    </div>
  );
}

export function PetFriendlyPlacesSection() {
  const { user, setActiveTab } = useAppState();

  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [manualAddress, setManualAddress] = useState('');
  const [manualSearching, setManualSearching] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [zoneLabel, setZoneLabel] = useState('Tu zona');

  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('todos');

  const [activePlaces, setActivePlaces] = useState<PetFriendlyPlace[]>([]);
  const [loadingActive, setLoadingActive] = useState(false);
  const [incubatorItems, setIncubatorItems] = useState<PetFriendlyPlaceIncubatorItem[]>([]);
  const [, setLoadingIncubator] = useState(false);
  const [osmPlaces, setOsmPlaces] = useState<OsmPlace[]>([]);
  const [loadingOsm, setLoadingOsm] = useState(false);

  const [sectionMessage, setSectionMessage] = useState<string | null>(null);

  const [expandedPlaceId, setExpandedPlaceId] = useState<string | null>(null);
  const [reviewsByPlace, setReviewsByPlace] = useState<Record<string, PetFriendlyPlaceReview[]>>({});
  const [loadingReviewsPlaceId, setLoadingReviewsPlaceId] = useState<string | null>(null);
  const [reviewRatingDraft, setReviewRatingDraft] = useState(5);
  const [reviewCommentDraft, setReviewCommentDraft] = useState('');
  const [savingReview, setSavingReview] = useState(false);

  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [suggestName, setSuggestName] = useState('');
  const [suggestCategory, setSuggestCategory] = useState<PetFriendlyPlaceCategory>('restaurante');
  const [suggestAddress, setSuggestAddress] = useState('');
  const [suggestZone, setSuggestZone] = useState('');
  const [suggestPhone, setSuggestPhone] = useState('');
  const [suggestEmail, setSuggestEmail] = useState('');
  const [suggestWebsite, setSuggestWebsite] = useState('');
  const [suggestSocial, setSuggestSocial] = useState('');

  const [claimToken, setClaimToken] = useState<string | null>(null);
  const [claimPreview, setClaimPreview] = useState<PetFriendlyPlaceClaimLanding | null>(null);
  const [loadingClaimPreview, setLoadingClaimPreview] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimActionLoading, setClaimActionLoading] = useState<'correct' | 'reject' | 'subscribe' | null>(null);
  const [claimFormName, setClaimFormName] = useState('');
  const [claimFormCategory, setClaimFormCategory] = useState<PetFriendlyPlaceCategory>('restaurante');
  const [claimFormZone, setClaimFormZone] = useState('');
  const [claimFormAddress, setClaimFormAddress] = useState('');
  const [claimFormPhone, setClaimFormPhone] = useState('');
  const [claimFormEmail, setClaimFormEmail] = useState('');
  const [claimFormPetPolicy, setClaimFormPetPolicy] = useState('');
  const [claimFormBusinessDays, setClaimFormBusinessDays] = useState('');
  const [claimFormBusinessHours, setClaimFormBusinessHours] = useState('');
  const [claimFormWebsite, setClaimFormWebsite] = useState('');
  const [claimFormInstagram, setClaimFormInstagram] = useState('');
  const [claimFormFacebook, setClaimFormFacebook] = useState('');
  const [claimConsentGranted, setClaimConsentGranted] = useState(false);
  const [claimBasicDataConfirmed, setClaimBasicDataConfirmed] = useState(false);
  const [claimBillingMode, setClaimBillingMode] = useState<'monthly_auto' | 'annual'>('monthly_auto');
  const [claimImageUploading, setClaimImageUploading] = useState(false);

  const suggestedItems = useMemo(
    () => incubatorItems.filter((item) => item.status === 'CLAIMABLE_PROFILE'),
    [incubatorItems],
  );
  const incubatorOnlyItems = useMemo(
    () => incubatorItems.filter((item) => item.status === 'IN_INCUBATOR'),
    [incubatorItems],
  );

  const loadActivePlaces = useCallback(async (zone: string, category: CategoryFilter) => {
    setLoadingActive(true);
    try {
      const places = await fetchActivePetFriendlyPlacesByZone({
        zoneLabel: zone,
        category: category === 'todos' ? undefined : category,
      });
      setActivePlaces(places);
    } finally {
      setLoadingActive(false);
    }
  }, []);

  const loadIncubator = useCallback(
    async (zone: string, category: CategoryFilter) => {
      setLoadingIncubator(true);
      try {
        const items = await fetchPetFriendlyPlaceIncubatorByZone({
          zoneLabel: zone,
          userId: user && !user.isGuest ? user.id : undefined,
          category: category === 'todos' ? undefined : category,
        });
        setIncubatorItems(items);
      } finally {
        setLoadingIncubator(false);
      }
    },
    [user],
  );

  const loadOsmPlaces = useCallback(async (lat: number, lng: number, category: CategoryFilter) => {
    if (category === 'todos' || category === 'otro') {
      setOsmPlaces([]);
      return;
    }
    setLoadingOsm(true);
    try {
      const results = await fetchNearbyOsmPlaces(lat, lng, category);
      setOsmPlaces(results);
    } finally {
      setLoadingOsm(false);
    }
  }, []);

  const applyZoneSelection = useCallback(
    (zone: string) => {
      const cleaned = zone.trim() || 'Tu zona';
      setZoneLabel(cleaned);
      loadActivePlaces(cleaned, selectedCategory);
      loadIncubator(cleaned, selectedCategory);
    },
    [loadActivePlaces, loadIncubator, selectedCategory],
  );

  const handleUseMyLocation = useCallback(async () => {
    setLocating(true);
    setLocationError(null);
    const position = await getCurrentPosition();
    setLocating(false);

    if (!position) {
      setLocationError('No pudimos acceder a tu ubicacion. Revisa los permisos o busca por destino.');
      return;
    }

    setLocation(position);
    loadOsmPlaces(position.lat, position.lng, selectedCategory);

    const zone = await reverseGeocodeZone(position.lat, position.lng);
    applyZoneSelection(zone || 'Tu zona');
  }, [applyZoneSelection, loadOsmPlaces, selectedCategory]);

  const handleManualSearch = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const address = manualAddress.trim();
      if (!address) return;

      setManualSearching(true);
      setManualError(null);
      try {
        const coords = await geocodeAddress(address);
        if (!coords) {
          setManualError('No pudimos encontrar esa direccion o destino.');
          return;
        }
        setLocation(coords);
        loadOsmPlaces(coords.lat, coords.lng, selectedCategory);
        applyZoneSelection(address);
      } catch {
        setManualError('No pudimos buscar ese destino en este momento.');
      } finally {
        setManualSearching(false);
      }
    },
    [applyZoneSelection, loadOsmPlaces, manualAddress, selectedCategory],
  );

  const handleCategoryChange = useCallback(
    (category: CategoryFilter) => {
      setSelectedCategory(category);
      loadActivePlaces(zoneLabel, category);
      loadIncubator(zoneLabel, category);
      if (location) {
        loadOsmPlaces(location.lat, location.lng, category);
      }
    },
    [loadActivePlaces, loadIncubator, loadOsmPlaces, location, zoneLabel],
  );

  useEffect(() => {
    loadActivePlaces(zoneLabel, selectedCategory);
    loadIncubator(zoneLabel, selectedCategory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleReviews = useCallback(
    async (placeId: string) => {
      if (expandedPlaceId === placeId) {
        setExpandedPlaceId(null);
        return;
      }
      setExpandedPlaceId(placeId);
      setReviewRatingDraft(5);
      setReviewCommentDraft('');
      if (!reviewsByPlace[placeId]) {
        setLoadingReviewsPlaceId(placeId);
        const reviews = await fetchPetFriendlyPlaceReviews(placeId);
        setReviewsByPlace((current) => ({ ...current, [placeId]: reviews }));
        setLoadingReviewsPlaceId(null);
      }
    },
    [expandedPlaceId, reviewsByPlace],
  );

  const handleSubmitReview = useCallback(
    async (placeId: string) => {
      if (!user || user.isGuest) {
        setSectionMessage('Inicia sesion con una cuenta para dejar una reseña.');
        return;
      }
      setSavingReview(true);
      try {
        const saved = await upsertPetFriendlyPlaceReview({
          placeId,
          rating: reviewRatingDraft,
          comment: reviewCommentDraft.trim() || undefined,
        });
        if (saved) {
          const refreshed = await fetchPetFriendlyPlaceReviews(placeId);
          setReviewsByPlace((current) => ({ ...current, [placeId]: refreshed }));
          setReviewCommentDraft('');
          await loadActivePlaces(zoneLabel, selectedCategory);
          setSectionMessage('¡Gracias por tu reseña!');
        } else {
          setSectionMessage('No se pudo guardar tu reseña.');
        }
      } finally {
        setSavingReview(false);
      }
    },
    [loadActivePlaces, reviewCommentDraft, reviewRatingDraft, selectedCategory, user, zoneLabel],
  );

  const handleDeleteReview = useCallback(
    async (placeId: string) => {
      const ok = await deletePetFriendlyPlaceReview(placeId);
      if (ok) {
        const refreshed = await fetchPetFriendlyPlaceReviews(placeId);
        setReviewsByPlace((current) => ({ ...current, [placeId]: refreshed }));
        await loadActivePlaces(zoneLabel, selectedCategory);
      }
    },
    [loadActivePlaces, selectedCategory, zoneLabel],
  );

  const handleValidate = useCallback(
    async (placeId: string) => {
      if (!user || user.isGuest) {
        setSectionMessage('Inicia sesion con una cuenta para validar un lugar sugerido.');
        return;
      }
      const updated = await validatePetFriendlyPlace(placeId);
      if (updated) {
        setSectionMessage(`¡Gracias! ${updated.name} suma tu respaldo (${updated.upvotesCount}/${updated.validationsGoal}).`);
        await loadIncubator(zoneLabel, selectedCategory);

        if (updated.upvotesCount >= updated.validationsGoal) {
          const shouldNotifyAdmin = await claimPetFriendlyPlaceAdminNotification(updated.id);
          if (shouldNotifyAdmin) {
            await notifyAdminThreshold({
              entityType: 'place',
              name: updated.name,
              zoneLabel: updated.zoneLabel,
              address: updated.address,
              upvotesCount: updated.upvotesCount,
              validationsGoal: updated.validationsGoal,
              claimUrl: updated.claimToken ? buildClaimUrl(updated.claimToken) : undefined,
            });
          }
        }
      }
    },
    [loadIncubator, selectedCategory, user, zoneLabel],
  );

  const handleCopyClaimLink = useCallback(async (item: PetFriendlyPlaceIncubatorItem) => {
    if (!item.claimToken) return;
    const url = buildClaimUrl(item.claimToken);
    try {
      await navigator.clipboard.writeText(url);
      setSectionMessage(`Enlace copiado para compartir con ${item.name}.`);
    } catch {
      setSectionMessage(url);
    }
  }, []);

  const handleSuggestSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!user || user.isGuest) {
        setSuggestionError('Inicia sesion con una cuenta para sugerir un lugar.');
        return;
      }
      if (!suggestName.trim() || !suggestAddress.trim() || !suggestZone.trim()) {
        setSuggestionError('Completa nombre, zona y direccion.');
        return;
      }
      setSuggesting(true);
      setSuggestionError(null);
      try {
        const created = await suggestPetFriendlyPlace({
          name: suggestName,
          category: suggestCategory,
          zoneLabel: suggestZone,
          address: suggestAddress,
          phoneWhatsapp: suggestPhone || undefined,
          latitude: location?.lat,
          longitude: location?.lng,
          contactEmail: suggestEmail || undefined,
          websiteUrl: suggestWebsite || undefined,
          instagramUrl: suggestSocial || undefined,
        });
        if (!created) {
          setSuggestionError('No se pudo guardar la sugerencia.');
          return;
        }
        setShowSuggestModal(false);
        setSuggestName('');
        setSuggestAddress('');
        setSuggestPhone('');
        setSuggestEmail('');
        setSuggestWebsite('');
        setSuggestSocial('');
        setSectionMessage(`¡Gracias! ${created.name} quedo cargado, invita a otros usuarios a validarlo.`);
        await loadIncubator(zoneLabel, selectedCategory);
      } finally {
        setSuggesting(false);
      }
    },
    [
      loadIncubator,
      location,
      selectedCategory,
      suggestAddress,
      suggestCategory,
      suggestEmail,
      suggestName,
      suggestPhone,
      suggestSocial,
      suggestWebsite,
      suggestZone,
      user,
      zoneLabel,
    ],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('place_claim');
    if (tokenFromUrl) {
      setClaimToken(tokenFromUrl);
    }
  }, []);

  useEffect(() => {
    if (!claimToken) return;

    const run = async () => {
      setLoadingClaimPreview(true);
      setClaimError(null);
      const preview = await getPetFriendlyPlaceClaimLanding(claimToken);
      if (!preview) {
        setClaimError('El enlace no es valido o ya expiro.');
        setLoadingClaimPreview(false);
        return;
      }
      setClaimPreview(preview);
      setClaimFormName(preview.name || '');
      setClaimFormCategory(preview.category || 'restaurante');
      setClaimFormZone(preview.zoneLabel || '');
      setClaimFormAddress(preview.address || '');
      setClaimFormPhone(preview.phoneWhatsapp || '');
      setClaimFormEmail(preview.contactEmail || '');
      setClaimFormPetPolicy(preview.petPolicy || '');
      setClaimFormBusinessDays(preview.businessDays || '');
      setClaimFormBusinessHours(preview.businessHours || '');
      setClaimFormWebsite(preview.websiteUrl || '');
      setClaimFormInstagram(preview.instagramUrl || '');
      setClaimFormFacebook(preview.facebookUrl || '');
      setClaimConsentGranted(preview.consentGranted);
      setClaimBasicDataConfirmed(preview.basicDataConfirmed);
      setLoadingClaimPreview(false);
    };

    run();
  }, [claimToken]);

  const handleClaimImageChange = useCallback(
    async (file: File | null) => {
      if (!file || !claimToken) return;
      setClaimImageUploading(true);
      try {
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        const imageUrl = await uploadPetFriendlyPlaceImage({ claimToken, imageDataUrl: dataUrl });
        if (imageUrl) {
          setClaimPreview((current) => (current ? { ...current, imageUrl } : current));
          setSectionMessage('Imagen actualizada.');
        } else {
          setSectionMessage('No se pudo subir la imagen.');
        }
      } finally {
        setClaimImageUploading(false);
      }
    },
    [claimToken],
  );

  const handleClaimDecision = useCallback(
    async (action: 'correct' | 'reject' | 'subscribe') => {
      if (!claimToken) return;

      if (action === 'subscribe' && (!user || user.isGuest)) {
        setClaimError('Para activar el plan premium debes iniciar sesion con una cuenta.');
        return;
      }
      if (action !== 'reject' && !claimConsentGranted) {
        setClaimError('Debes aceptar el consentimiento de publicacion para continuar.');
        return;
      }

      setClaimActionLoading(action);
      setClaimError(null);
      try {
        const updated = await submitPetFriendlyPlaceClaimDecision({
          claimToken,
          action,
          name: claimFormName,
          category: claimFormCategory,
          zoneLabel: claimFormZone,
          address: claimFormAddress,
          phoneWhatsapp: claimFormPhone,
          contactEmail: claimFormEmail,
          consentGranted: action === 'reject' ? false : claimConsentGranted,
          basicDataConfirmed: claimBasicDataConfirmed,
          petPolicy: claimFormPetPolicy,
          businessDays: claimFormBusinessDays,
          businessHours: claimFormBusinessHours,
          websiteUrl: claimFormWebsite,
          instagramUrl: claimFormInstagram,
          facebookUrl: claimFormFacebook,
          subscriptionBillingMode: action === 'subscribe' ? claimBillingMode : undefined,
        });

        if (!updated) {
          setClaimError('No se pudo guardar tu respuesta en este momento.');
          return;
        }

        setClaimPreview((current) =>
          current
            ? {
                ...current,
                status: updated.status,
                isClaimed: updated.status === 'ACTIVE_FREE' || updated.status === 'ACTIVE_PREMIUM',
                consentGranted: updated.consentGranted,
                basicDataConfirmed: updated.basicDataConfirmed,
                subscriptionPlan: updated.subscriptionPlan,
                subscriptionBillingMode: updated.subscriptionBillingMode,
              }
            : current,
        );

        if (action === 'reject') {
          setSectionMessage(`Registramos que ${updated.name} no desea aparecer en AiPetFriendly por ahora.`);
        } else if (action === 'subscribe') {
          setSectionMessage(`${updated.name} fue activado en Premium y aparecera destacado.`);
        } else {
          setSectionMessage(`${updated.name} fue activado y ya figura en el listado de su zona.`);
        }

        await loadActivePlaces(updated.zoneLabel || zoneLabel, selectedCategory);
        await loadIncubator(updated.zoneLabel || zoneLabel, selectedCategory);
      } finally {
        setClaimActionLoading(null);
      }
    },
    [
      claimBasicDataConfirmed,
      claimBillingMode,
      claimConsentGranted,
      claimFormAddress,
      claimFormBusinessDays,
      claimFormBusinessHours,
      claimFormCategory,
      claimFormEmail,
      claimFormFacebook,
      claimFormInstagram,
      claimFormName,
      claimFormPetPolicy,
      claimFormPhone,
      claimFormWebsite,
      claimFormZone,
      claimToken,
      loadActivePlaces,
      loadIncubator,
      selectedCategory,
      user,
      zoneLabel,
    ],
  );

  const mapCenter: LatLngExpression = location
    ? [location.lat, location.lng]
    : activePlaces.find((p) => p.latitude && p.longitude)
      ? [activePlaces[0].latitude as number, activePlaces[0].longitude as number]
      : FALLBACK_CENTER;

  if (claimToken) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <h1 className="text-xl font-bold text-slate-800">Perfil de tu negocio en AiPetFriendly</h1>
        {loadingClaimPreview && <p className="text-sm text-slate-500">Cargando...</p>}
        {claimError && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{claimError}</p>}
        {claimPreview && (
          <div className="space-y-4 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">
              {claimPreview.isClaimed
                ? 'Este perfil ya fue activado. Podes actualizar los datos cuando quieras.'
                : `${claimPreview.suggestedClients} usuario(s) de la comunidad ya lo recomendaron. Confirma los datos para publicarlo.`}
            </p>

            {claimPreview.imageUrl && (
              <img src={claimPreview.imageUrl} alt={claimPreview.name} className="h-40 w-full rounded-xl object-cover" />
            )}
            <label className="block text-sm">
              <span className="mb-1 block font-semibold text-slate-700">Foto del lugar</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={claimImageUploading}
                onChange={(e) => handleClaimImageChange(e.target.files?.[0] || null)}
                className="block w-full text-xs"
              />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-slate-700">Nombre</span>
                <input className="w-full rounded-lg border border-slate-200 p-2" value={claimFormName} onChange={(e) => setClaimFormName(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-slate-700">Categoria</span>
                <select
                  className="w-full rounded-lg border border-slate-200 p-2"
                  value={claimFormCategory}
                  onChange={(e) => setClaimFormCategory(e.target.value as PetFriendlyPlaceCategory)}
                >
                  {Object.entries(CATEGORY_META).map(([key, meta]) => (
                    <option key={key} value={key}>{meta.label}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-slate-700">Zona</span>
                <input className="w-full rounded-lg border border-slate-200 p-2" value={claimFormZone} onChange={(e) => setClaimFormZone(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-slate-700">Direccion</span>
                <input className="w-full rounded-lg border border-slate-200 p-2" value={claimFormAddress} onChange={(e) => setClaimFormAddress(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-slate-700">WhatsApp</span>
                <input className="w-full rounded-lg border border-slate-200 p-2" value={claimFormPhone} onChange={(e) => setClaimFormPhone(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-slate-700">Email de contacto</span>
                <input className="w-full rounded-lg border border-slate-200 p-2" value={claimFormEmail} onChange={(e) => setClaimFormEmail(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-slate-700">Dias</span>
                <input className="w-full rounded-lg border border-slate-200 p-2" placeholder="Lun a Dom" value={claimFormBusinessDays} onChange={(e) => setClaimFormBusinessDays(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-slate-700">Horario</span>
                <input className="w-full rounded-lg border border-slate-200 p-2" placeholder="9 a 20hs" value={claimFormBusinessHours} onChange={(e) => setClaimFormBusinessHours(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-slate-700">Sitio web</span>
                <input className="w-full rounded-lg border border-slate-200 p-2" value={claimFormWebsite} onChange={(e) => setClaimFormWebsite(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-slate-700">Instagram</span>
                <input className="w-full rounded-lg border border-slate-200 p-2" value={claimFormInstagram} onChange={(e) => setClaimFormInstagram(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-slate-700">Facebook</span>
                <input className="w-full rounded-lg border border-slate-200 p-2" value={claimFormFacebook} onChange={(e) => setClaimFormFacebook(e.target.value)} />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold text-slate-700">Politica con mascotas</span>
              <textarea
                className="w-full rounded-lg border border-slate-200 p-2"
                rows={2}
                placeholder="Ej: aceptamos mascotas medianas en el patio, con correa"
                value={claimFormPetPolicy}
                onChange={(e) => setClaimFormPetPolicy(e.target.value)}
              />
            </label>

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={claimConsentGranted} onChange={(e) => setClaimConsentGranted(e.target.checked)} className="mt-1" />
              <span>Autorizo publicar estos datos en AiPetFriendly.</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={claimBasicDataConfirmed} onChange={(e) => setClaimBasicDataConfirmed(e.target.checked)} className="mt-1" />
              <span>Confirmo que los datos cargados son correctos.</span>
            </label>

            <div className="rounded-xl bg-emerald-50 p-3 text-sm">
              <p className="mb-2 font-semibold text-emerald-800">Plan Premium (destacado arriba del listado)</p>
              <div className="mb-2 flex gap-3">
                <label className="flex items-center gap-1">
                  <input type="radio" checked={claimBillingMode === 'monthly_auto'} onChange={() => setClaimBillingMode('monthly_auto')} />
                  Mensual: {formatArs(claimPreview.placePremiumMonthlyArs)}
                </label>
                <label className="flex items-center gap-1">
                  <input type="radio" checked={claimBillingMode === 'annual'} onChange={() => setClaimBillingMode('annual')} />
                  Anual: {formatArs(claimPreview.placePremiumAnnualArs)}
                </label>
              </div>
              {(!user || user.isGuest) && <p className="text-xs text-emerald-700">Inicia sesion con una cuenta para activar Premium.</p>}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={claimActionLoading !== null}
                onClick={() => handleClaimDecision('correct')}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {claimActionLoading === 'correct' ? 'Guardando...' : 'Guardar y publicar gratis'}
              </button>
              <button
                type="button"
                disabled={claimActionLoading !== null}
                onClick={() => handleClaimDecision('subscribe')}
                className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {claimActionLoading === 'subscribe' ? 'Activando...' : 'Activar Premium'}
              </button>
              <button
                type="button"
                disabled={claimActionLoading !== null}
                onClick={() => handleClaimDecision('reject')}
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-60"
              >
                No quiero aparecer
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 pb-24">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Lugares Pet Friendly</h1>
        <p className="text-sm text-slate-500">Restaurantes, hoteles, playas, plazas y locales que aceptan mascotas.</p>
      </div>

      {sectionMessage && (
        <div className="flex items-start justify-between gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
          <span>{sectionMessage}</span>
          <button type="button" onClick={() => setSectionMessage(null)}><X size={14} /></button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => handleCategoryChange('todos')}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${selectedCategory === 'todos' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          Todos
        </button>
        {(Object.keys(CATEGORY_META) as PetFriendlyPlaceCategory[]).map((key) => {
          const meta = CATEGORY_META[key];
          const Icon = meta.icon;
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleCategoryChange(key)}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ${selectedCategory === key ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              <Icon size={12} /> {meta.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-100 bg-white p-3 shadow-sm">
        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={locating}
          className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {locating ? 'Ubicando...' : 'Usar mi ubicacion'}
        </button>
        <form onSubmit={handleManualSearch} className="flex flex-1 min-w-[220px] gap-2">
          <input
            value={manualAddress}
            onChange={(e) => setManualAddress(e.target.value)}
            placeholder="Buscar por destino (ej: Mar del Plata)"
            className="flex-1 rounded-xl border border-slate-200 p-2 text-sm"
          />
          <button type="submit" disabled={manualSearching} className="rounded-xl bg-slate-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
            Buscar
          </button>
        </form>
      </div>
      {locationError && <p className="text-xs text-rose-600">{locationError}</p>}
      {manualError && <p className="text-xs text-rose-600">{manualError}</p>}
      <p className="text-xs text-slate-500">Zona actual: {zoneLabel}</p>

      <div className="h-64 overflow-hidden rounded-2xl border border-emerald-100 shadow-sm">
        <MapContainer center={mapCenter} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
          {location && <Marker position={[location.lat, location.lng]} icon={locationMarkerIcon} />}
          {activePlaces
            .filter((p) => typeof p.latitude === 'number' && typeof p.longitude === 'number')
            .map((p) => (
              <Marker key={p.id} position={[p.latitude as number, p.longitude as number]} icon={placeMarkerIcon} />
            ))}
          {osmPlaces.map((p) => (
            <Marker key={p.id} position={[p.lat, p.lng]} icon={osmMarkerIcon} />
          ))}
        </MapContainer>
      </div>

      <AdBanner adSenseSlotId={PLACES_ADSENSE_SLOT_ID} />

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase text-slate-500">En tu zona</h2>
        <button type="button" onClick={() => setShowSuggestModal(true)} className="text-xs font-semibold text-emerald-700">
          + Sugerir un lugar
        </button>
      </div>

      {loadingActive && <p className="text-sm text-slate-500">Cargando...</p>}
      {!loadingActive && activePlaces.length === 0 && (
        <p className="text-sm text-slate-500">Todavia no hay lugares publicados en esta zona. ¡Se el primero en sugerir uno!</p>
      )}

      <div className="space-y-3">
        {activePlaces.map((place) => {
          const Icon = CATEGORY_META[place.category].icon;
          const distance =
            location && typeof place.latitude === 'number' && typeof place.longitude === 'number'
              ? haversineDistanceMeters(location.lat, location.lng, place.latitude, place.longitude)
              : null;
          const reviews = reviewsByPlace[place.id] || [];
          const isExpanded = expandedPlaceId === place.id;

          return (
            <div key={place.id} className={`rounded-2xl border bg-white p-3 shadow-sm ${place.subscriptionPlan === 'premium' ? 'border-amber-300' : 'border-slate-100'}`}>
              <div className="flex gap-3">
                {place.imageUrl && (
                  <img src={place.imageUrl} alt={place.name} className="h-20 w-20 flex-shrink-0 rounded-xl object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Icon size={14} className="text-emerald-600" />
                    <h3 className="truncate font-bold text-slate-800">{place.name}</h3>
                    {place.subscriptionPlan === 'premium' && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">DESTACADO</span>
                    )}
                  </div>
                  <p className="truncate text-xs text-slate-500">{place.address}</p>
                  {place.petPolicy && <p className="mt-0.5 text-xs italic text-slate-500">"{place.petPolicy}"</p>}
                  <div className="mt-1 flex items-center gap-2">
                    <StarRating value={Math.round(place.ratingAvg)} />
                    <span className="text-xs text-slate-500">
                      {place.ratingCount > 0 ? `${place.ratingAvg.toFixed(1)} (${place.ratingCount})` : 'Sin reseñas todavia'}
                    </span>
                    {distance !== null && <span className="text-xs text-slate-400">· {(distance / 1000).toFixed(1)} km</span>}
                  </div>
                  <div className="mt-2">
                    <ContactLinks place={place} />
                  </div>
                </div>
              </div>

              <button type="button" onClick={() => toggleReviews(place.id)} className="mt-2 text-xs font-semibold text-emerald-700">
                {isExpanded ? 'Ocultar reseñas' : 'Ver reseñas y comentarios'}
              </button>

              {isExpanded && (
                <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                  {loadingReviewsPlaceId === place.id && <p className="text-xs text-slate-500">Cargando reseñas...</p>}
                  {reviews.length === 0 && loadingReviewsPlaceId !== place.id && (
                    <p className="text-xs text-slate-500">Todavia no hay reseñas. ¡Deja la primera!</p>
                  )}
                  {reviews.map((review) => (
                    <div key={review.id} className="rounded-xl bg-slate-50 p-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <StarRating value={review.rating} />
                          <span className="text-xs font-semibold text-slate-600">{review.userLabel || 'Usuario'}</span>
                        </div>
                        {user && review.userId === user.id && (
                          <button type="button" onClick={() => handleDeleteReview(place.id)} className="text-[10px] text-rose-500">
                            Eliminar
                          </button>
                        )}
                      </div>
                      {review.comment && <p className="mt-1 text-xs text-slate-600">{review.comment}</p>}
                    </div>
                  ))}

                  {user && !user.isGuest ? (
                    <div className="rounded-xl bg-emerald-50 p-2">
                      <p className="mb-1 text-xs font-semibold text-emerald-800">Dejar una reseña</p>
                      <StarRating value={reviewRatingDraft} onChange={setReviewRatingDraft} />
                      <textarea
                        value={reviewCommentDraft}
                        onChange={(e) => setReviewCommentDraft(e.target.value)}
                        placeholder="Contanos tu experiencia con tu mascota..."
                        className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs"
                        rows={2}
                      />
                      <button
                        type="button"
                        disabled={savingReview}
                        onClick={() => handleSubmitReview(place.id)}
                        className="mt-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {savingReview ? 'Guardando...' : 'Publicar reseña'}
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setActiveTab('subscription')} className="text-xs font-semibold text-emerald-700">
                      Inicia sesion para dejar una reseña
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {suggestedItems.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-bold uppercase text-slate-500">Casi listos (esperan al dueño)</h2>
          <div className="space-y-2">
            {suggestedItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-3 text-sm">
                <div>
                  <p className="font-semibold text-slate-700">{item.name}</p>
                  <p className="text-xs text-slate-500">{CATEGORY_META[item.category].label} · {item.upvotesCount}/{item.validationsGoal} validaciones</p>
                </div>
                <button type="button" onClick={() => handleCopyClaimLink(item)} className="text-xs font-semibold text-emerald-700">
                  Copiar enlace para el dueño
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {incubatorOnlyItems.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-bold uppercase text-slate-500">Sugeridos por la comunidad</h2>
          <div className="space-y-2">
            {incubatorOnlyItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-3 text-sm">
                <div>
                  <p className="font-semibold text-slate-700">{item.name}</p>
                  <p className="text-xs text-slate-500">{CATEGORY_META[item.category].label} · {item.upvotesCount}/{item.validationsGoal} validaciones</p>
                </div>
                <button
                  type="button"
                  disabled={item.userHasValidated}
                  onClick={() => handleValidate(item.id)}
                  className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50"
                >
                  {item.userHasValidated ? 'Ya validaste' : 'Validar'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {osmPlaces.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-bold uppercase text-slate-500">Otros lugares en la zona (OpenStreetMap)</h2>
          <div className="space-y-2">
            {osmPlaces.slice(0, 8).map((place) => (
              <div key={place.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-700">{place.name}</p>
                  <p className="truncate text-xs text-slate-500">{place.address}</p>
                </div>
                <a href={buildExternalMapsUrl(place.name, place.address)} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-600">
                  Google Maps
                </a>
              </div>
            ))}
          </div>
          {loadingOsm && <p className="mt-1 text-xs text-slate-400">Buscando mas lugares...</p>}
        </div>
      )}

      {showSuggestModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4" onClick={() => setShowSuggestModal(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">Sugerir un lugar</h3>
              <button type="button" onClick={() => setShowSuggestModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSuggestSubmit} className="space-y-2">
              <input required placeholder="Nombre del lugar" value={suggestName} onChange={(e) => setSuggestName(e.target.value)} className="w-full rounded-lg border border-slate-200 p-2 text-sm" />
              <select value={suggestCategory} onChange={(e) => setSuggestCategory(e.target.value as PetFriendlyPlaceCategory)} className="w-full rounded-lg border border-slate-200 p-2 text-sm">
                {Object.entries(CATEGORY_META).map(([key, meta]) => (
                  <option key={key} value={key}>{meta.label}</option>
                ))}
              </select>
              <input required placeholder="Zona/ciudad" value={suggestZone} onChange={(e) => setSuggestZone(e.target.value)} className="w-full rounded-lg border border-slate-200 p-2 text-sm" />
              <input required placeholder="Direccion" value={suggestAddress} onChange={(e) => setSuggestAddress(e.target.value)} className="w-full rounded-lg border border-slate-200 p-2 text-sm" />
              <input placeholder="Telefono/WhatsApp (opcional)" value={suggestPhone} onChange={(e) => setSuggestPhone(e.target.value)} className="w-full rounded-lg border border-slate-200 p-2 text-sm" />
              <p className="pt-1 text-xs text-slate-400">Opcional: nos ayuda a ubicar al negocio para pedirle autorizacion cuando la sugerencia junte las validaciones necesarias.</p>
              <input type="email" placeholder="Email de contacto (opcional)" value={suggestEmail} onChange={(e) => setSuggestEmail(e.target.value)} className="w-full rounded-lg border border-slate-200 p-2 text-sm" />
              <input placeholder="Pagina web (opcional)" value={suggestWebsite} onChange={(e) => setSuggestWebsite(e.target.value)} className="w-full rounded-lg border border-slate-200 p-2 text-sm" />
              <input placeholder="Instagram/Facebook (opcional)" value={suggestSocial} onChange={(e) => setSuggestSocial(e.target.value)} className="w-full rounded-lg border border-slate-200 p-2 text-sm" />
              {suggestionError && <p className="text-xs text-rose-600">{suggestionError}</p>}
              <button type="submit" disabled={suggesting} className="w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {suggesting ? 'Guardando...' : 'Sugerir lugar'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
