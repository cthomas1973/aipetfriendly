// Logica centralizada de acceso Free/Premium por mascota (Etapa 5.1, Fase 7).
//
// Unica fuente de verdad en frontend para:
// * estado de acceso efectivo (guest | premium | grace | canceled_pending | free),
//   delegando la regla de vigencia en premiumAccess.mjs (compartida con Edge
//   Functions y con la futura RLS de la migracion 067);
// * escritura por mascota en plan Free (mascota activa + fallback de unica
//   mascota, espejo de public.pet_is_writable de la 067);
// * excepcion de recuperacion de mascotas perdidas;
// * mensajes de usuario (empaticos, sin condicionar emergencias al pago).
//
// COMPATIBILIDAD PRE-067 (importante): las columnas users.active_pet_id,
// users.active_pet_changed_at, subscriptions.grace_until y
// subscriptions.cancel_requested_at todavia NO existen en la base remota.
// `activePetSupport` (detectado en fetchUserProfile por presencia de la
// columna) controla el bloqueo: si el backend no la expone, NO se protege
// ninguna mascota (comportamiento actual intacto) y el selector queda
// deshabilitado. Asi el frontend puede desplegarse ANTES de aplicar la 067
// sin bloquear usuarios ni generar escrituras inconsistentes.

import { resolveAccessState } from '../../supabase/functions/_shared/premiumAccess.mjs';
import type { AccessState, AppUser, Pet } from '../types';

export const ACTIVE_PET_COOLDOWN_DAYS = 30;

export const PET_ACCESS_MESSAGES = {
  premiumExpired:
    'Tu plan Premium termino, pero no te preocupes: ninguna de tus mascotas ni sus datos fue eliminado. Todo sigue guardado y disponible para consulta.',
  selectionNeeded:
    'Elegi la mascota que queres seguir editando con el plan gratuito. Las demas quedan protegidas en modo lectura, con todos sus datos intactos.',
  protectedPet:
    'Esta mascota esta en modo lectura: podes consultar toda su informacion (historial, agenda, vacunas, peso y chat), pero no agregar ni modificar registros. Con Premium volvera a estar editable al instante.',
  protectedPetWrite:
    'Esta mascota esta protegida en modo lectura con el plan gratuito. Sus datos siguen intactos y podes consultarlos; para volver a editarla, elegila como mascota activa o reactiva Premium.',
  protectedPetChat:
    'El Consultorio IA esta disponible solo para tu mascota activa en el plan gratuito. El historial de chat de esta mascota sigue disponible para consulta.',
  protectedPetEdit:
    'Esta mascota esta en modo lectura: solo se pueden actualizar la foto y las señas particulares (datos para encontrarla si se pierde). El resto de la ficha queda protegido, sin perder nada.',
  recoveryAvailable:
    'Las herramientas para buscar una mascota perdida (cartel, QR, avisos de hallazgo) siguen disponibles para todas tus mascotas, sin importar el plan.',
  cooldown: (untilIso: string) =>
    `Vas a poder cambiar tu mascota activa a partir del ${new Date(untilIso).toLocaleDateString('es-AR')}. Mientras tanto, todas siguen visibles y consultables.`,
  premiumRecovered:
    'Con Premium activo, todas tus mascotas vuelven a estar habilitadas automaticamente, con todo su historial intacto.',
  selectionUnavailable:
    'La seleccion de mascota activa todavia no esta habilitada en el servidor. Tus mascotas siguen funcionando con normalidad.',
  needsAccount: 'Crea una cuenta para administrar la mascota activa.',
  posterNeedsSession: 'Debes iniciar sesion para generar el cartel de busqueda.',
  posterNotOwnPet: 'Solo podes generar el cartel de tus propias mascotas.',
  posterNeedsCode: 'Esta mascota todavia no tiene codigo de identificacion.',
  tagNeedsSession: 'Debes iniciar sesion para solicitar la chapita.',
  tagNeedsPremium: 'Solicitar la chapita fisica es exclusivo para Premium.',
} as const;

const FULL_ACCESS_STATES: ReadonlySet<AccessState> = new Set(['premium', 'grace', 'canceled_pending']);

export function hasFullAccess(state: AccessState): boolean {
  return FULL_ACCESS_STATES.has(state);
}

// Estado de acceso efectivo para la UI. Usa el accessState calculado por
// fetchUserProfile (que conoce access_mode y la fila cruda de suscripcion);
// si no esta presente (p. ej. usuarios construidos localmente o tests), lo
// deriva de la suscripcion visible con la regla compartida.
// Limitacion documentada: el estado se refresca al recargar el perfil; un
// vencimiento ocurrido en medio de la sesion se refleja en el proximo fetch.
export function resolveUserAccessState(user: AppUser | null, nowMs: number = Date.now()): AccessState {
  if (!user || user.isGuest) return 'guest';
  if (user.accessState) return user.accessState;
  return resolveAccessState(
    {
      subscription: {
        plan: user.subscription?.plan,
        isActive: user.subscription?.isActive,
        expiresAt: user.subscription?.expiresAt ?? null,
        graceUntil: user.subscription?.graceUntil ?? null,
        cancelRequestedAt: user.subscription?.cancelRequestedAt ?? null,
      },
    },
    nowMs,
  );
}

export interface PetEditableInput {
  accessState: AccessState;
  activePetSupport: boolean;
  activePetId: string | null;
  petId: string;
  petCount: number;
}

// Espejo exacto de public.pet_is_writable (migracion 067):
// dueño AND (acceso completo OR mascota activa OR unica mascota).
// Guest conserva su comportamiento actual (todo editable, datos locales).
// Pre-067 (sin soporte de columna) no se bloquea nada.
export function isPetEditable(input: PetEditableInput): boolean {
  if (input.accessState === 'guest') return true;
  if (hasFullAccess(input.accessState)) return true;
  if (!input.activePetSupport) return true;
  if (input.petCount <= 1) return true;
  return input.activePetId !== null && input.activePetId === input.petId;
}

export function needsActivePetSelection(input: {
  accessState: AccessState;
  activePetSupport: boolean;
  activePetId: string | null;
  petCount: number;
}): boolean {
  return (
    input.accessState === 'free'
    && input.activePetSupport
    && input.petCount > 1
    && input.activePetId === null
  );
}

// Fin del cooldown de cambio de mascota activa (espejo del trigger
// guard_user_active_pet: 30 dias desde active_pet_changed_at). Devuelve ISO
// si el cooldown sigue vigente, o null si ya se puede cambiar.
export function activePetCooldownUntil(
  changedAt: string | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (!changedAt) return null;
  const changedMs = Date.parse(changedAt);
  if (!Number.isFinite(changedMs)) return null;
  const untilMs = changedMs + ACTIVE_PET_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  return untilMs > nowMs ? new Date(untilMs).toISOString() : null;
}

export function canChangeActivePet(
  input: {
    accessState: AccessState;
    activePetSupport: boolean;
    activePetChangedAt: string | null;
  },
  nowMs: number = Date.now(),
): boolean {
  if (input.accessState !== 'free') return true;
  if (!input.activePetSupport) return false;
  return activePetCooldownUntil(input.activePetChangedAt, nowMs) === null;
}

// Excepcion de recuperacion: sobre una mascota protegida solo pueden
// modificarse foto y señas particulares (espejo del trigger
// enforce_pet_write_protection de la 067, que ademas tolera updated_at).
const RECOVERY_FIELDS: ReadonlySet<string> = new Set(['photoUrl', 'distinguishingMarks', 'updatedAt']);

export function isRecoveryOnlyPetUpdate(updates: Partial<Pet>): boolean {
  const keys = Object.entries(updates)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
  return keys.length > 0 && keys.every((key) => RECOVERY_FIELDS.has(key));
}

export function recoveryOnlyPetUpdate(updates: Partial<Pet>): Partial<Pet> {
  const next: Partial<Pet> = {};
  if (updates.photoUrl !== undefined) next.photoUrl = updates.photoUrl;
  if (updates.distinguishingMarks !== undefined) next.distinguishingMarks = updates.distinguishingMarks;
  return next;
}

// Carteles de busqueda (PDF/imagen): disponibles para cualquier usuario con
// sesion y mascota propia con codigo publico, INCLUSO en plan Free y sobre
// mascotas protegidas (decision de producto Fase 7.2.2 / MEDIO-3). Se genera
// 100% en frontend, sin escrituras: no abre acceso Premium ni edicion.
export function posterAccessError(user: AppUser | null, pet: Pet): string | null {
  if (!user) return PET_ACCESS_MESSAGES.posterNeedsSession;
  if (pet.userId && pet.userId !== user.id) return PET_ACCESS_MESSAGES.posterNotOwnPet;
  if (!pet.publicCode) return PET_ACCESS_MESSAGES.posterNeedsCode;
  return null;
}

// La chapita fisica sigue siendo un beneficio Premium (sin cambios).
export function tagRequestAccessError(user: AppUser | null, isPremiumUser: boolean): string | null {
  if (!user || user.isGuest) return PET_ACCESS_MESSAGES.tagNeedsSession;
  if (!isPremiumUser) return PET_ACCESS_MESSAGES.tagNeedsPremium;
  return null;
}

// Guarda comun para hooks de escritura por mascota (clinico, agenda, peso,
// chat). La proteccion definitiva la impone RLS cuando se aplique la 067;
// esta guarda evita operaciones que el servidor rechazaria y da un mensaje
// claro al usuario.
export function assertPetWritable(
  subscription: { isPetEditable: (petId: string) => boolean },
  petId: string | null | undefined,
  message: string = PET_ACCESS_MESSAGES.protectedPetWrite,
): void {
  if (petId && !subscription.isPetEditable(petId)) {
    throw new Error(message);
  }
}
