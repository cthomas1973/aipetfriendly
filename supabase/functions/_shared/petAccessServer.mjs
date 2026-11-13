// Decision de acceso por mascota del lado SERVIDOR (Etapa 5.2, Fase 7).
//
// Pensado para Edge Functions que usan service_role (bypassean RLS) y por lo
// tanto deben validar por su cuenta. Sin dependencias ni acceso a red: decide
// exclusivamente a partir de filas ya leidas de la base por el servidor
// (public.users y public.subscriptions) y datos verificados (dueño real de la
// mascota, cantidad real de mascotas). NUNCA acepta estados enviados por el
// cliente: ni tier, ni activePetId, ni user_id.
//
// Compatibilidad pre/post migracion 067:
// * Pre-067 las columnas active_pet_id / grace_until / cancel_requested_at no
//   existen. Las filas se leen con select('*') y la ausencia de la clave
//   active_pet_id en la fila de users desactiva la proteccion de mascota
//   activa (comportamiento historico: un Free puede operar sobre todas sus
//   mascotas). La ausencia de columnas NUNCA se interpreta como Premium: el
//   tier sigue saliendo de access_mode + plan/is_active/expires_at.
// * Post-067 la clave existe (aunque sea null) y se aplica la regla espejo de
//   public.pet_is_writable: acceso completo OR mascota activa OR unica
//   mascota.
//
// Falla cerrado: entradas invalidas o inconsistentes => denegado (salvo el
// modo visitante explicito de access_mode 'guest', que conserva su
// comportamiento historico ya autorizado).

import { isPremiumOrGraceEffective, resolveAccessState } from './premiumAccess.mjs';

/**
 * Mapea filas crudas (snake_case, posiblemente sin columnas 067) a la entrada
 * de premiumAccess.mjs. Tolerante: claves ausentes => null.
 * @param {Record<string, unknown> | null | undefined} profileRow
 * @param {Record<string, unknown> | null | undefined} subscriptionRow
 */
export function buildAccessInput(profileRow, subscriptionRow) {
  return {
    accessMode: profileRow && typeof profileRow.access_mode === 'string' ? profileRow.access_mode : null,
    subscription: subscriptionRow
      ? {
          plan: subscriptionRow.plan,
          isActive: subscriptionRow.is_active,
          expiresAt: subscriptionRow.expires_at ?? null,
          graceUntil: subscriptionRow.grace_until ?? null,
          cancelRequestedAt: subscriptionRow.cancel_requested_at ?? null,
        }
      : null,
  };
}

/**
 * true solo si la fila de users expone la columna active_pet_id (067 aplicada).
 * @param {Record<string, unknown> | null | undefined} profileRow
 */
export function detectActivePetSupport(profileRow) {
  return Boolean(profileRow) && Object.prototype.hasOwnProperty.call(profileRow, 'active_pet_id');
}

/**
 * @typedef {{
 *   allowed: boolean,
 *   tier: 'guest' | 'premium' | 'free',
 *   accessState: 'guest' | 'premium' | 'grace' | 'canceled_pending' | 'free',
 *   reason:
 *     | 'guest_mode'        // access_mode guest: comportamiento visitante historico
 *     | 'full_access'       // premium | grace | canceled_pending vigentes
 *     | 'pre_067'           // columna active_pet_id ausente: sin proteccion (documentado)
 *     | 'single_pet'        // unica mascota: fallback aprobado
 *     | 'active_pet'        // es la mascota activa elegida
 *     | 'not_owner'         // la mascota no pertenece al usuario autenticado
 *     | 'selection_required'// free sin seleccion: ninguna escribible
 *     | 'protected_pet'     // free con otra activa: esta esta protegida
 *     | 'invalid_input',    // datos faltantes o inconsistentes: falla cerrado
 * }} PetAccessDecision
 */

/**
 * Decide si el usuario autenticado puede operar (consultar IA / escribir)
 * sobre una mascota concreta. Todos los datos deben venir de lecturas del
 * servidor, nunca del payload del cliente.
 *
 * @param {{
 *   userId: unknown,        // auth.getUser(jwt).user.id
 *   profileRow: Record<string, unknown> | null | undefined,   // select('*') de users
 *   subscriptionRow: Record<string, unknown> | null | undefined, // select('*') de subscriptions (o null)
 *   petId: unknown,         // mascota solicitada
 *   petOwnerId: unknown,    // pets.user_id leido de la base
 *   petCount: unknown,      // count real de mascotas del usuario
 * }} input
 * @param {number} [nowMs]
 * @returns {PetAccessDecision}
 */
export function resolvePetWriteAccess(input, nowMs = Date.now()) {
  const deny = (reason, accessState = 'free', tier = 'free') => ({ allowed: false, reason, accessState, tier });

  if (!input || typeof input !== 'object') return deny('invalid_input');
  const { userId, profileRow, subscriptionRow, petId, petOwnerId, petCount } = input;

  if (typeof userId !== 'string' || !userId) return deny('invalid_input');
  if (typeof petId !== 'string' || !petId) return deny('invalid_input');
  if (!profileRow || typeof profileRow !== 'object') return deny('invalid_input');
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return deny('invalid_input');

  // Propiedad real: el dueño leido de la base debe ser el usuario del JWT.
  // (Un UUID ajeno enviado por el cliente muere aca, aunque la query upstream
  // ya filtre por user_id: defensa en profundidad.)
  if (typeof petOwnerId !== 'string' || petOwnerId !== userId) {
    return deny('not_owner');
  }

  const accessInput = buildAccessInput(profileRow, subscriptionRow);
  const accessState = resolveAccessState(accessInput, nowMs);

  // Modo visitante autenticado (access_mode guest): conserva el comportamiento
  // historico ya autorizado (limites guest); la proteccion de mascota activa
  // no aplica a este modo.
  if (accessState === 'guest') {
    return { allowed: true, reason: 'guest_mode', accessState, tier: 'guest' };
  }

  if (isPremiumOrGraceEffective(accessInput, nowMs)) {
    return { allowed: true, reason: 'full_access', accessState, tier: 'premium' };
  }

  // Plan Free: regla espejo de public.pet_is_writable (067).
  if (!detectActivePetSupport(profileRow)) {
    // Pre-067: sin proteccion (comportamiento previo intacto). La ausencia de
    // columnas NO otorga Premium: el tier ya quedo en 'free'.
    return { allowed: true, reason: 'pre_067', accessState, tier: 'free' };
  }

  const count = typeof petCount === 'number' && Number.isFinite(petCount) ? petCount : null;
  if (count === null || count < 1) return deny('invalid_input', accessState);
  if (count === 1) return { allowed: true, reason: 'single_pet', accessState, tier: 'free' };

  const activePetId = typeof profileRow.active_pet_id === 'string' ? profileRow.active_pet_id : null;
  if (activePetId === petId) {
    return { allowed: true, reason: 'active_pet', accessState, tier: 'free' };
  }
  return deny(activePetId === null ? 'selection_required' : 'protected_pet', accessState);
}

export const PET_ACCESS_DENIED_MESSAGES = {
  not_owner: 'Pet not found for this user',
  selection_required:
    'Con el plan gratuito tenes que elegir una mascota activa para usar el Consultorio IA. Todas tus mascotas y sus datos siguen intactos.',
  protected_pet:
    'El Consultorio IA esta disponible solo para tu mascota activa en el plan gratuito. El historial de esta mascota sigue disponible para consulta.',
  invalid_input: 'No se pudo validar el acceso a la mascota. Proba nuevamente.',
};
