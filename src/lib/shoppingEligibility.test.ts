import { describe, expect, it } from 'vitest';
import { eligibleShoppingProduct } from '../../supabase/functions/_shared/shoppingPrompt.mjs';
import { filterEligibleShopProducts } from '../../supabase/functions/_shared/shopEligibleProducts.mjs';

describe('Filtro del asesor en servidor', () => {
  const pet = { species:'dog', breed:'caniche toy', age_years:3, age_months:0, weight_kg:5 };
  const dimensions = { species:['perro'], stage:['adulto'], size:['pequeño'] };
  it('solo permite evidencia completa que coincide con la mascota', () => {
    expect(eligibleShoppingProduct(pet, null, 'alimentos')).toBe(false);
    expect(eligibleShoppingProduct(pet, dimensions, 'alimentos')).toBe(true);
    expect(eligibleShoppingProduct(pet, { ...dimensions, species:['gato'] }, 'alimentos')).toBe(false);
    expect(eligibleShoppingProduct(pet, { ...dimensions, stage:['cachorro'] }, 'alimentos')).toBe(false);
    expect(eligibleShoppingProduct(pet, { ...dimensions, size:['grande'] }, 'alimentos')).toBe(false);
    expect(eligibleShoppingProduct(pet, dimensions, 'salud')).toBe(false);
    expect(eligibleShoppingProduct({ ...pet, birth_date:'2026-01-01' }, dimensions, 'alimentos', Date.parse('2026-06-01'))).toBe(false);
  });
  it('exige el RPC para sugerencias generales y asesor, sin confiar en etiquetas heredadas', async () => {
    const products = [
      { id:'legacy', grupo:'alimentos', pet_types:['perro'] },
      { id:'enabled', grupo:'alimentos', pet_types:['gato'] },
      { id:'different', grupo:'alimentos', pet_types:['perro'] },
    ];
    const fetch = async (ids: string[]) => {
      expect(ids).toEqual(['legacy', 'enabled', 'different']);
      return { data: [
        { product_id:'enabled', dimensions },
        { product_id:'different', dimensions:{ ...dimensions, size:['grande'] } },
      ], error:null };
    };
    for (const profile of [pet, { ...pet, birth_date:null }]) {
      expect((await filterEligibleShopProducts(profile, products, fetch)).map(row => row.product.id)).toEqual(['enabled']);
    }
    await expect(filterEligibleShopProducts(pet, products, async () => ({ data:null, error:new Error('RPC') }))).rejects.toThrow('verificar compatibilidad');
    await expect(filterEligibleShopProducts(pet, products, async () => ({ data:[{ product_id:'legacy', dimensions:null }], error:null }))).rejects.toThrow('verificar compatibilidad');
  });
});
