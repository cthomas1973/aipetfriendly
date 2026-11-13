export type AffiliateLinkResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'invalid_configuration' | 'unconfigured' | 'invalid_tracking' | 'invalid_permalink' };

export type AffiliateTrackingResult =
  | { ok: true; value: string }
  | { ok: false; reason: 'invalid_configuration' | 'unconfigured' };

export function isAllowedMercadoLibrePermalink(permalink: unknown): boolean;
export function isAllowedMercadoLibreAffiliateUrl(url: unknown): boolean;
export function validateAffiliateUrl(url: unknown): string | null;
export function resolveAffiliateTracking(config?: {
  template?: string | null;
  id?: string | null;
}): AffiliateTrackingResult;
export function buildAffiliateUrl(permalink: unknown, trackingValue: unknown): AffiliateLinkResult;
export function buildAffiliateSearchUrl(search: unknown, trackingValue: unknown): AffiliateLinkResult;