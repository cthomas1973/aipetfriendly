import type { ShopProduct, ShopResearchRecord } from '../../../src/types';
export function isShopResearchRecord(record: unknown): record is ShopResearchRecord;
export function publicShopResearch(row: {
  research_record?: unknown;
  researched_at?: string | null;
  approval_status?: string;
  catalog_product_id?: string | null;
  compatibility_dimensions?: unknown;
}): Required<Pick<ShopProduct, 'research' | 'catalogProductId' | 'researchedAt' | 'approvalStatus' | 'compatibilityEvidence' | 'verifiedDimensions'>>;
