// Banner y selector de mascota activa para el plan Free (Etapa 5.1, Fase 7).
//
// Estados que comunica (sin bloqueo general: cada mascota conserva lectura y
// las herramientas de recuperacion):
// * free + varias mascotas sin seleccion -> invitacion a elegir la activa.
// * free + mascota activa elegida       -> resumen + cambio (con cooldown).
// * grace                                -> aviso empatico de pago pendiente.
// * canceled_pending                     -> acceso completo hasta vencimiento.
// Pre-067 (activePetSupport false) no se muestra nada: comportamiento previo.
import { useMemo, useState } from 'react';
import { CheckCircle2, Clock3, HeartHandshake, PawPrint, X } from 'lucide-react';
import { useAppState } from '../context/AppStateContext';
import { usePets } from '../hooks/usePets';
import { PET_ACCESS_MESSAGES } from '../lib/petAccess';

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString('es-AR');
}

export function ActivePetBanner() {
  const { user, subscription } = useAppState();
  const { pets, selectActivePet } = usePets();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [pendingPetId, setPendingPetId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activePet = useMemo(
    () => pets.find((pet) => pet.id === subscription.activePetId) ?? null,
    [pets, subscription.activePetId],
  );

  if (!user || user.isGuest) return null;

  const graceDate = formatDate(user.subscription?.graceUntil);
  const expiresDate = formatDate(user.subscription?.expiresAt);
  const cooldownUntil = subscription.activePetCooldownUntil;

  if (subscription.accessState === 'grace') {
    return (
      <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-900">
          Tu ultimo pago no pudo procesarse, pero mantenes todas las funciones Premium
          {graceDate ? ` hasta el ${graceDate}` : ' por unos dias'} mientras se reintenta.
        </p>
        <p className="mt-1 text-xs text-amber-800">
          Ninguna mascota ni dato se pierde. Si el pago se acredita, no tenes que hacer nada.
        </p>
      </div>
    );
  }

  if (subscription.accessState === 'canceled_pending') {
    return (
      <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-800">
          Tu suscripcion esta cancelada, pero conservas el acceso Premium completo
          {expiresDate ? ` hasta el ${expiresDate}` : ' hasta el fin del periodo pagado'}.
        </p>
        <p className="mt-1 text-xs text-slate-600">{PET_ACCESS_MESSAGES.premiumExpired}</p>
      </div>
    );
  }

  // Resto del banner: solo para Free con proteccion activa (067 aplicada) y
  // mas de una mascota.
  if (subscription.accessState !== 'free' || !subscription.activePetSupport || pets.length <= 1) {
    return null;
  }

  const openSelector = () => {
    setPendingPetId(subscription.activePetId);
    setError(null);
    setSelectorOpen(true);
  };

  const confirmSelection = async () => {
    if (!pendingPetId || pendingPetId === subscription.activePetId) {
      setSelectorOpen(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await selectActivePet(pendingPetId);
      setSelectorOpen(false);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo guardar la seleccion.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {subscription.needsActivePetSelection ? (
        <div className="rounded-2xl border-2 border-sky-200 bg-sky-50 p-4">
          <div className="flex items-start gap-3">
            <HeartHandshake size={22} className="mt-0.5 shrink-0 text-sky-600" />
            <div>
              <p className="text-sm font-semibold text-sky-900">{PET_ACCESS_MESSAGES.premiumExpired}</p>
              <p className="mt-1 text-xs text-sky-800">{PET_ACCESS_MESSAGES.selectionNeeded}</p>
              <p className="mt-1 text-xs text-sky-800">{PET_ACCESS_MESSAGES.recoveryAvailable}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={openSelector}
            className="mt-3 w-full rounded-full bg-sky-500 py-2.5 font-bold text-white transition hover:bg-sky-600"
          >
            Elegir mi mascota activa
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={20} className="shrink-0 text-emerald-500" />
            <p className="min-w-0 flex-1 text-sm text-slate-700">
              Mascota activa: <span className="font-bold">{activePet?.name ?? 'sin seleccion'}</span>.
              Las demas siguen disponibles en modo lectura, con todos sus datos.
            </p>
            <button
              type="button"
              onClick={openSelector}
              disabled={Boolean(cooldownUntil)}
              className="shrink-0 rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold text-slate-600 transition enabled:hover:bg-slate-50 disabled:opacity-50"
            >
              Cambiar
            </button>
          </div>
          {cooldownUntil && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
              <Clock3 size={14} /> {PET_ACCESS_MESSAGES.cooldown(cooldownUntil)}
            </p>
          )}
        </div>
      )}

      {selectorOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Elegi tu mascota activa</h3>
                <p className="mt-1 text-sm text-slate-500">{PET_ACCESS_MESSAGES.selectionNeeded}</p>
              </div>
              <button type="button" aria-label="Cerrar" onClick={() => setSelectorOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
              {pets.map((pet) => (
                <label
                  key={pet.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3 transition ${
                    pendingPetId === pet.id ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="active-pet"
                    checked={pendingPetId === pet.id}
                    onChange={() => setPendingPetId(pet.id)}
                    className="accent-emerald-500"
                  />
                  {pet.photoUrl
                    ? <img src={pet.photoUrl} alt={pet.name} className="h-10 w-10 rounded-xl object-cover" />
                    : <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-500"><PawPrint size={18} /></span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-800">{pet.name}</span>
                    <span className="block truncate text-xs text-slate-500">{pet.breed}</span>
                  </span>
                  {pet.id === subscription.activePetId && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Activa</span>
                  )}
                </label>
              ))}
            </div>

            <p className="mt-3 text-xs text-slate-500">
              Vas a poder cambiar la seleccion nuevamente dentro de 30 dias. Las demas mascotas
              quedan en modo lectura: nada se borra y las herramientas de busqueda siguen disponibles.
            </p>

            {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setSelectorOpen(false)}
                className="w-full rounded-full border-2 border-slate-200 py-2.5 font-semibold text-slate-600">
                Ahora no
              </button>
              <button type="button" onClick={confirmSelection} disabled={saving || !pendingPetId}
                className="w-full rounded-full bg-emerald-500 py-2.5 font-bold text-white disabled:opacity-60">
                {saving ? 'Guardando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
