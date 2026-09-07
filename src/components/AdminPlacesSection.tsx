import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Star, Trash2 } from 'lucide-react';
import {
  adminDeletePetFriendlyPlaceReview,
  adminUpdatePetFriendlyPlace,
  fetchAdminPetFriendlyPlaces,
  fetchPetFriendlyPlaceReviews,
} from '../lib/supabase';
import type { PetFriendlyPlace, PetFriendlyPlaceCategory, PetFriendlyPlaceReview } from '../types';

const CATEGORY_LABEL: Record<PetFriendlyPlaceCategory, string> = {
  restaurante: 'Restaurante',
  hotel_alojamiento: 'Hotel / Alojamiento',
  playa: 'Playa',
  tienda: 'Tienda',
  plaza_parque: 'Plaza / Parque',
  bar_cafe: 'Bar / Café',
  otro: 'Otro',
};

const STATUS_LABEL: Record<string, string> = {
  IN_INCUBATOR: 'Incubadora',
  CLAIMABLE_PROFILE: 'Reclamable',
  ACTIVE_FREE: 'Activo (free)',
  ACTIVE_PREMIUM: 'Activo (premium)',
  REJECTED: 'Rechazado',
};

const STATUS_OPTIONS = Object.keys(STATUS_LABEL);

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
}

export function AdminPlacesSection() {
  const [places, setPlaces] = useState<PetFriendlyPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewsByPlace, setReviewsByPlace] = useState<Record<string, PetFriendlyPlaceReview[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchAdminPetFriendlyPlaces();
      setPlaces(rows);
    } catch (err) {
      console.error('Error cargando lugares pet friendly:', err);
      setError('No se pudieron cargar los lugares.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleStatusChange = useCallback(
    async (place: PetFriendlyPlace, status: string) => {
      setSavingId(place.id);
      try {
        await adminUpdatePetFriendlyPlace({ id: place.id, status });
        await load();
      } catch (err) {
        console.error('Error actualizando estado del lugar:', err);
        setError('No se pudo actualizar el estado.');
      } finally {
        setSavingId(null);
      }
    },
    [load],
  );

  const handleHighlightChange = useCallback(
    async (place: PetFriendlyPlace, highlightPriority: number) => {
      setSavingId(place.id);
      try {
        await adminUpdatePetFriendlyPlace({ id: place.id, highlightPriority });
        await load();
      } catch (err) {
        console.error('Error actualizando prioridad del lugar:', err);
        setError('No se pudo actualizar la prioridad.');
      } finally {
        setSavingId(null);
      }
    },
    [load],
  );

  const toggleReviews = useCallback(
    async (placeId: string) => {
      if (expandedId === placeId) {
        setExpandedId(null);
        return;
      }
      setExpandedId(placeId);
      if (!reviewsByPlace[placeId]) {
        const reviews = await fetchPetFriendlyPlaceReviews(placeId);
        setReviewsByPlace((current) => ({ ...current, [placeId]: reviews }));
      }
    },
    [expandedId, reviewsByPlace],
  );

  const handleDeleteReview = useCallback(async (placeId: string, reviewId: string) => {
    try {
      await adminDeletePetFriendlyPlaceReview(reviewId);
      const reviews = await fetchPetFriendlyPlaceReviews(placeId);
      setReviewsByPlace((current) => ({ ...current, [placeId]: reviews }));
    } catch (err) {
      console.error('Error eliminando reseña:', err);
      setError('No se pudo eliminar la reseña.');
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">Lugares Pet Friendly</h2>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-60"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {loading && places.length === 0 && <p className="text-sm text-slate-500">Cargando...</p>}
      {!loading && places.length === 0 && <p className="text-sm text-slate-500">No hay lugares cargados.</p>}

      <div className="space-y-2">
        {places.map((place) => (
          <div key={place.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-800">{place.name}</p>
                <p className="text-xs text-slate-500">
                  {CATEGORY_LABEL[place.category]} · {place.zoneLabel} · {place.address}
                </p>
                <p className="text-xs text-slate-400">
                  Creado {formatDate(place.createdAt)} · {place.upvotesCount}/{place.validationsGoal} validaciones ·{' '}
                  <span className="inline-flex items-center gap-0.5">
                    <Star size={11} className="fill-amber-400 text-amber-400" /> {place.ratingAvg.toFixed(1)} ({place.ratingCount})
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={place.status}
                  disabled={savingId === place.id}
                  onChange={(e) => handleStatusChange(place, e.target.value)}
                  className="rounded-lg border border-slate-200 p-1.5 text-xs"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{STATUS_LABEL[status]}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={place.highlightPriority}
                  disabled={savingId === place.id}
                  onChange={(e) => handleHighlightChange(place, Number(e.target.value) || 0)}
                  className="w-16 rounded-lg border border-slate-200 p-1.5 text-xs"
                  title="Prioridad de destacado"
                />
                <button type="button" onClick={() => toggleReviews(place.id)} className="text-xs font-semibold text-emerald-700">
                  Reseñas
                </button>
              </div>
            </div>

            {expandedId === place.id && (
              <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                {(reviewsByPlace[place.id] || []).length === 0 && <p className="text-xs text-slate-400">Sin reseñas.</p>}
                {(reviewsByPlace[place.id] || []).map((review) => (
                  <div key={review.id} className="flex items-center justify-between rounded-lg bg-slate-50 p-2 text-xs">
                    <div>
                      <span className="font-semibold">{review.userLabel || 'Usuario'}</span> · {review.rating}★
                      {review.comment && <p className="text-slate-500">{review.comment}</p>}
                    </div>
                    <button type="button" onClick={() => handleDeleteReview(place.id, review.id)} className="text-rose-500">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
