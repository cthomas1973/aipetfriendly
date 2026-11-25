import type { ShopProduct } from '../../../src/types/index.ts';

type PetProfile = {
  species: string;
  breed: string | null;
  age_years: number | null;
  age_months: number | null;
  weight_kg: number | null;
  birth_date?: string | null;
};
type CatalogRow = {
  id: string;
  grupo: string;
  research_record?: unknown;
  researched_at?: string | null;
  approval_status?: string;
};
export function filterEligibleShopProducts<T extends CatalogRow>(
  pet: PetProfile,
  products: T[],
  fetchDimensions: (ids: string[]) => PromiseLike<{ data: unknown; error: unknown }>,
  options?: { allowHealth?: boolean },
): Promise<Array<{ product: T; global: Required<Pick<ShopProduct, 'research' | 'verifiedDimensions' | 'compatibilityEvidence'>> }>>;
