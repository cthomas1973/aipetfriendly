import { validateAffiliateUrl } from '../../supabase/functions/_shared/affiliateLink.mjs';

interface AffiliateLinkResponse {
  affiliateAvailable?: boolean;
  link?: unknown;
}

export function validateAffiliateLink(value: unknown): string | null {
  return validateAffiliateUrl(value);
}

export async function fetchProductAffiliateLink(productId: string): Promise<string | null> {
  if (!productId) return null;

  try {
    const response = await fetch(`/api/beneficios?productId=${encodeURIComponent(productId)}`);
    if (!response.ok) return null;

    const payload = (await response.json()) as AffiliateLinkResponse;
    if (payload.affiliateAvailable !== true || typeof payload.link !== 'string') return null;
    return validateAffiliateLink(payload.link);
  } catch {
    return null;
  }
}
