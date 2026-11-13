import { publicShopResearch } from './shopResearchRecord.mjs';
import { eligibleShoppingProduct } from './shoppingPrompt.mjs';

export async function filterEligibleShopProducts(pet, products, fetchDimensions) {
  if (!products.length) return [];
  const { data, error } = await fetchDimensions(products.map(product => product.id));
  if (error || !Array.isArray(data) || !data.every(row =>
    typeof row?.product_id === 'string' && publicShopResearch({ compatibility_dimensions: row.dimensions }).verifiedDimensions)) {
    throw new Error('No se pudo verificar compatibilidad de productos.');
  }
  const dimensions = new Map(data.map(row => [row.product_id, row.dimensions]));
  return products.flatMap(product => {
    const global = publicShopResearch({ ...product, compatibility_dimensions: dimensions.get(product.id) });
    return eligibleShoppingProduct(pet, global.verifiedDimensions, global.research?.category || product.grupo)
      ? [{ product, global }] : [];
  });
}
