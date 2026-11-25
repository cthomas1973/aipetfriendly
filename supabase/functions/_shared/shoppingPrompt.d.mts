export function buildShoppingPrompt(
  pet: { species: string; breed: string; age_years: number; age_months: number; weight_kg: number },
  products: unknown[],
  question: string,
): string;
export const SHOPPING_SYSTEM_PROMPT: string;
export function eligibleShoppingProduct(
  pet: { species: string; breed: string | null; age_years: number | null; age_months: number | null; weight_kg: number | null; birth_date?: string | null },
  dimensions: { species: string[]; stage: string[]; size: string[] } | null,
  category: string,
  now?: number,
  options?: { allowHealth?: boolean },
): boolean;
