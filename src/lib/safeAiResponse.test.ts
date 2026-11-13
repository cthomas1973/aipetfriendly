import { describe, expect, it } from 'vitest';
import { filterEligibleShopProducts } from '../../supabase/functions/_shared/shopEligibleProducts.mjs';
import { safeAiResponse } from '../../supabase/functions/_shared/safeAiResponse.mjs';

describe('Protección de recomendaciones en respuestas IA', () => {
  const pet = { species:'dog', breed:'caniche toy', age_years:3, age_months:0, weight_kg:5 };
  const products = [
    { id:'compatible', title:'Producto compatible', grupo:'alimentos' },
    { id:'incompatible', title:'Producto incompatible', grupo:'alimentos' },
    { id:'unknown', title:'Producto desconocido', grupo:'alimentos' },
    { id:'disabled', title:'Producto deshabilitado', grupo:'alimentos' },
  ];
  const dimensions = { species:['perro'], stage:['adulto'], size:['pequeño'] };
  const resolve = (data: unknown[]) => filterEligibleShopProducts(pet, products, async () => ({ data, error:null }));
  const answer = (authorized: Array<{ title:string }>, modelAnswer = '') =>
    safeAiResponse({ mode:'shopping', question:'¿Qué producto conviene?', products:authorized, modelAnswer });

  it('permite mencionar un producto compatible devuelto por la validación del servidor', async () => {
    const authorized = await resolve([{ product_id:'compatible', dimensions }]);
    expect(answer(authorized.map(row => row.product))).toContain('Producto compatible');
  });

  it('excluye un producto con dimensiones que no coinciden con la mascota', async () => {
    const authorized = await resolve([{ product_id:'incompatible', dimensions:{ ...dimensions, species:['gato'] } }]);
    expect(answer(authorized.map(row => row.product))).not.toContain('Producto incompatible');
  });

  it('excluye un producto sin evidencia registrada', async () => {
    const authorized = await resolve([]);
    expect(answer(authorized.map(row => row.product))).not.toContain('Producto desconocido');
  });

  it('excluye productos que no aparecen habilitados en el RPC', async () => {
    const authorized = await resolve([{ product_id:'compatible', dimensions }]);
    expect(answer(authorized.map(row => row.product))).not.toContain('Producto deshabilitado');
  });

  it('descarta el texto libre si la IA introduce otro producto del catálogo', async () => {
    const authorized = await resolve([{ product_id:'compatible', dimensions }]);
    const response = answer(authorized.map(row => row.product), 'Recomiendo Producto incompatible y Producto desconocido.');
    expect(response).toContain('Producto compatible');
    expect(response).not.toContain('Producto incompatible');
    expect(response).not.toContain('Producto desconocido');
  });

  it('no inventa alternativas comerciales cuando no hay compatibles', () => {
    const response = answer([]);
    expect(response).toContain('No hay productos compatibles verificados');
    expect(response).not.toContain('Producto compatible');
  });

  it('mantiene una respuesta general de cuidados sin recomendaciones comerciales concretas', () => {
    const response = safeAiResponse({
      question:'¿Cómo cuido su hidratación?',
      modelAnswer:'Recomiendo una marca de agua saborizada que no fue validada.',
    });
    expect(response).toContain('agua limpia y fresca');
    expect(response).not.toContain('marca de agua saborizada');
  });
});
