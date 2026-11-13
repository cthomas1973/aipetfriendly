import { describe, expect, it } from 'vitest';
import { loadShopCatalog } from '../../api/_lib/shopCatalog.mjs';

describe('Verificación de catálogo en servidor', () => {
  const row = { id:'72000000-0000-4000-8000-000000000003', mla_id:'MLA123456789', title:'Producto',
    grupo:'alimentos', pet_types:['gato'], life_stages:['cachorro'], size_categories:['grande'],
    price:null, approval_status:'approved' };
  const dimensions = { species:['perro'], stage:['adulto'], size:['pequeño'] };
  const env = { SUPABASE_URL:'https://test.invalid', SUPABASE_SERVICE_KEY:'test' };
  const response = value => new Response(JSON.stringify(value), { status:200 });
  it('utiliza los valores validados del RPC y no etiquetas heredadas', async () => {
    const fetcher = async url => url.includes('/beneficios_productos?') ? response([row])
      : url.includes('/rpc/get_shop_compatibility') ? response([{product_id:row.id,dimensions}]) : response([]);
    const result = await loadShopCatalog({}, env, fetcher);
    expect(result.products[0]).toMatchObject({
      petTypes:['perro'], lifeStages:['adulto'], sizes:['pequeño'],
      compatibilityEvidence:{species:true,stage:true,size:true},
    });
  });
  it('mantiene el catálogo y bloquea recomendaciones cuando falla el RPC', async () => {
    const fetcher = async url => url.includes('/beneficios_productos?') ? response([row])
      : url.includes('/rpc/get_shop_compatibility') ? new Response('', {status:503}) : response([]);
    const result = await loadShopCatalog({}, env, fetcher);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].compatibilityEvidence).toEqual({species:false,stage:false,size:false});
    expect(result.warning).toContain('Compatibilidad no disponible');
  });
});
