// Regla unica de vigencia Premium, compartida por frontend (Vite) y Edge
// Functions (Deno). Sin dependencias ni acceso a red: solo decide a partir de
// los datos ya leidos de public.users (access_mode) y public.subscriptions.
//
// Regla:
// 1. access_mode 'guest' nunca es Premium.
// 2. Si se conoce access_mode, debe ser 'premium'.
// 3. Si existe fila de suscripcion, debe ser plan 'premium' con is_active true
//    (cancelada / pausada / free => no Premium).
// 4. expires_at null/ausente => sin vencimiento (suscripcion recurrente
//    autorizada o alta administrativa). Si tiene valor, debe ser una fecha
//    valida con zona horaria explicita y estrictamente posterior a "ahora".
//    Fecha invalida o ambigua => no Premium (falla cerrado).

const TIMESTAMP_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}(?::?\d{2})?)$/i;

/**
 * @param {unknown} value
 * @returns {{ kind: 'none' } | { kind: 'valid', epochMs: number } | { kind: 'invalid' }}
 */
export function parseSubscriptionExpiry(value) {
  if (value === null || value === undefined) return { kind: 'none' };
  if (typeof value !== 'string') return { kind: 'invalid' };

  const match = TIMESTAMP_RE.exec(value.trim());
  if (!match) return { kind: 'invalid' };

  const [, y, mo, d, h, mi, s, frac, zone] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = s === undefined ? 0 : Number(s);
  const millis = frac === undefined ? 0 : Number(frac.slice(0, 3).padEnd(3, '0'));

  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) {
    return { kind: 'invalid' };
  }

  let offsetMinutes = 0;
  if (zone.toUpperCase() !== 'Z') {
    const sign = zone[0] === '-' ? -1 : 1;
    const digits = zone.slice(1).replace(':', '');
    const offH = Number(digits.slice(0, 2));
    const offM = digits.length > 2 ? Number(digits.slice(2, 4)) : 0;
    if (offH > 23 || offM > 59) return { kind: 'invalid' };
    offsetMinutes = sign * (offH * 60 + offM);
  }

  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second, millis);
  // Rechaza fechas imposibles (p. ej. 30 de febrero) que Date normalizaria.
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return { kind: 'invalid' };
  }

  const epochMs = utcMs - offsetMinutes * 60_000;
  if (!Number.isFinite(epochMs)) return { kind: 'invalid' };
  return { kind: 'valid', epochMs };
}

/**
 * @param {{
 *   accessMode?: string | null,
 *   subscription?: { plan?: unknown, isActive?: unknown, expiresAt?: unknown } | null,
 * }} input
 * @param {number} [nowMs]
 * @returns {boolean}
 */
export function isPremiumEffective(input, nowMs = Date.now()) {
  if (!input || typeof input !== 'object') return false;
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return false;

  const { accessMode, subscription } = input;
  const hasAccessMode = accessMode !== undefined && accessMode !== null;

  if (hasAccessMode && accessMode !== 'premium') return false;

  if (subscription) {
    if (subscription.plan !== 'premium' || subscription.isActive !== true) return false;
  } else if (!hasAccessMode) {
    return false;
  }

  const expiry = parseSubscriptionExpiry(subscription ? subscription.expiresAt : null);
  if (expiry.kind === 'none') return true;
  if (expiry.kind === 'invalid') return false;
  return nowMs < expiry.epochMs;
}

// ---------------------------------------------------------------------------
// Estados efectivos de acceso (Fase 7).
//
// resolveAccessState() clasifica el acceso del usuario en uno de:
//   'guest'            -> access_mode 'guest'. Nunca tiene acceso Premium.
//   'premium'          -> isPremiumEffective() true y sin cancelacion pedida.
//   'canceled_pending' -> cancelacion voluntaria (cancelRequestedAt valido)
//                         con periodo pagado aun vigente. Acceso completo
//                         hasta que expire expiresAt.
//   'grace'            -> la regla Premium normal fallo (vencido / pago
//                         rechazado) pero facturacion autorizo explicitamente
//                         un periodo de gracia vigente (graceUntil > ahora).
//                         Acceso completo temporal.
//   'free'             -> todo lo demas (incluye datos invalidos: falla
//                         cerrado).
//
// Entradas nuevas (columnas de public.subscriptions, opcionales):
//   subscription.graceUntil        -> fin del periodo de gracia. Solo lo
//                                     escribe el flujo de facturacion; nunca
//                                     se infiere de un estado de pago.
//   subscription.cancelRequestedAt -> momento en que el usuario pidio cancelar.
//
// Prioridad de evaluacion (de mayor a menor):
//   1. Entrada invalida -> 'free'.
//   2. accessMode 'guest' -> 'guest'.
//   3. nowMs invalido -> 'free' (no se puede evaluar vigencia).
//   4. Premium efectivo (regla isPremiumEffective intacta):
//        con cancelRequestedAt valido -> 'canceled_pending'
//        sin cancelacion              -> 'premium'
//   5. No Premium + cancelRequestedAt valido -> 'free'. La cancelacion
//      voluntaria vencida NO recibe gracia, aunque graceUntil tenga valor.
//   6. No Premium + gracia explicita -> 'grace' solo si:
//        - accessMode es 'premium' o no se conoce (un 'free' ya degradado
//          no se revive), y
//        - la fila de suscripcion sigue con plan 'premium', y
//        - graceUntil es un timestamp valido estrictamente futuro.
//      graceUntil invalido o vencido => sin gracia (falla cerrado).
//   7. Resto -> 'free'.
//
// Notas:
// - Timestamps con el mismo formato estricto de expiresAt (zona explicita).
//   Un cancelRequestedAt invalido se ignora (es metadato, no concede acceso).
// - 'canceled_pending' sin expiresAt (facturacion incompleta) mantiene acceso
//   completo hasta que facturacion complete el vencimiento; el cron de ciclo
//   de vida es quien cierra ese estado.

/**
 * @typedef {'guest' | 'premium' | 'grace' | 'canceled_pending' | 'free'} AccessState
 */

/**
 * @typedef {{
 *   accessMode?: string | null,
 *   subscription?: {
 *     plan?: unknown,
 *     isActive?: unknown,
 *     expiresAt?: unknown,
 *     graceUntil?: unknown,
 *     cancelRequestedAt?: unknown,
 *   } | null,
 * }} AccessStateInput
 */

/**
 * @param {AccessStateInput} input
 * @param {number} [nowMs]
 * @returns {AccessState}
 */
export function resolveAccessState(input, nowMs = Date.now()) {
  if (!input || typeof input !== 'object') return 'free';

  const { accessMode, subscription } = input;
  if (accessMode === 'guest') return 'guest';

  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return 'free';

  const cancelRequested = parseSubscriptionExpiry(
    subscription ? subscription.cancelRequestedAt : null,
  );
  const hasCancelRequest = cancelRequested.kind === 'valid';

  if (isPremiumEffective(input, nowMs)) {
    return hasCancelRequest ? 'canceled_pending' : 'premium';
  }

  // Cancelacion voluntaria con periodo pagado vencido: Free directo, sin
  // gracia (la gracia es solo para fallos de cobro, no para cancelaciones).
  if (hasCancelRequest) return 'free';

  // Gracia explicitamente autorizada por facturacion.
  const hasAccessMode = accessMode !== undefined && accessMode !== null;
  if (hasAccessMode && accessMode !== 'premium') return 'free';
  if (!subscription || subscription.plan !== 'premium') return 'free';

  const grace = parseSubscriptionExpiry(subscription.graceUntil);
  if (grace.kind === 'valid' && nowMs < grace.epochMs) return 'grace';

  return 'free';
}

/**
 * Acceso completo efectivo: Premium vigente, cancelacion con periodo pagado
 * vigente o gracia autorizada vigente.
 *
 * @param {AccessStateInput} input
 * @param {number} [nowMs]
 * @returns {boolean}
 */
export function isPremiumOrGraceEffective(input, nowMs = Date.now()) {
  const state = resolveAccessState(input, nowMs);
  return state === 'premium' || state === 'canceled_pending' || state === 'grace';
}
