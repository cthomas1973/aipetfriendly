export const CLINICAL_SEND_TIMEZONE: string;
export const CLINICAL_SEND_LIMITS: {
  free: { limit: number; window: 'month' };
  premium: { limit: number; window: 'day' };
};
export function clinicalSendWindowKey(plan: 'free' | 'premium', nowMs?: number): string;
export function clinicalSendWindowResetIso(plan: 'free' | 'premium', nowMs?: number): string;
export function resolveClinicalSendPlan(
  profileRow: Record<string, unknown> | null | undefined,
  subscriptionRow: Record<string, unknown> | null | undefined,
  nowMs?: number,
): 'guest' | 'free' | 'premium';
export function validateRequestId(value: unknown): string | null;
export function clinicalDownloadAccessError(user: { isGuest?: boolean } | null | undefined): string | null;
