import { isPremiumOrGraceEffective } from '../../supabase/functions/_shared/premiumAccess.mjs';

export const CLINICAL_SEND_TIMEZONE = 'America/Argentina/Buenos_Aires';
export const CLINICAL_SEND_LIMITS = {
  free: { limit: 2, window: 'month' },
  premium: { limit: 5, window: 'day' },
};

function dateParts(nowMs) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINICAL_SEND_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(nowMs));
  const part = (type) => Number(parts.find(value => value.type === type).value);
  return { year: part('year'), month: part('month'), day: part('day') };
}

export function clinicalSendWindowKey(plan, nowMs = Date.now()) {
  const { year, month, day } = dateParts(nowMs);
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return plan === 'premium' ? `${prefix}-${String(day).padStart(2, '0')}` : prefix;
}

export function clinicalSendWindowResetIso(plan, nowMs = Date.now()) {
  const { year, month, day } = dateParts(nowMs);
  return new Date(plan === 'premium'
    ? Date.UTC(year, month - 1, day + 1, 3)
    : Date.UTC(year, month, 1, 3)).toISOString();
}

// Solo recibe filas confiables del servidor; la UI no autoriza envios.
export function resolveClinicalSendPlan(profileRow, subscriptionRow, nowMs = Date.now()) {
  if (!profileRow || !['free', 'premium'].includes(profileRow.access_mode)) return 'guest';
  return isPremiumOrGraceEffective({
    accessMode: profileRow.access_mode,
    subscription: subscriptionRow ? {
      plan: subscriptionRow.plan,
      isActive: subscriptionRow.is_active,
      expiresAt: subscriptionRow.expires_at,
      graceUntil: subscriptionRow.grace_until,
      cancelRequestedAt: subscriptionRow.cancel_requested_at,
    } : null,
  }, nowMs) ? 'premium' : 'free';
}

export function validateRequestId(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)
    ? normalized : null;
}

export function clinicalDownloadAccessError(user) {
  if (!user || user.isGuest) return 'Crea una cuenta para descargar el informe en PDF.';
  return null;
}
