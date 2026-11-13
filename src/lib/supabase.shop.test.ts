import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAdminShopRadar, fetchShopCatalog, fetchShopPriceHistory, markShopProductViewed, reviewAdminShopRadar } from './supabase';
import type { ShopProduct } from '../types';

const mocks = vi.hoisted(() => ({ native: false, rpc: vi.fn(), from: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => mocks.native } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
const id = '71000000-0000-4000-8000-000000000001';
const link = 'https://articulo.mercadolibre.com.ar/MLA-1234567890?matt_tool=synthetic';
const product = (): ShopProduct => ({
  id, title: 'Alimento perro adulto', externalId: null, thumbnail: null, category: 'alimentos',
  price: null, originalPrice: null, currency: null, checkedAt: null, priceStatus: 'unverified',
  source: 'supabase', seller: null, brand: null, presentation: null, attributes: [],
  petTypes: ['perro'], lifeStages: ['adulto'], sizes: ['todos'], needs: ['alimentos'],
  freeShipping: false, fastDelivery: false, link,
});
beforeEach(() => { vi.clearAllMocks(); mocks.native = false; });
afterEach(() => { vi.unstubAllGlobals(); });
describe('Transporte publico de tienda', () => {
  it('catalogo publico no requiere ni transmite identidad o plan', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ products: [product()], affiliateAvailable: true })));
    vi.stubGlobal('fetch', fetcher);
    expect((await fetchShopCatalog()).products[0].link).toContain('matt_tool=synthetic');
    expect(fetcher.mock.calls[0]).toEqual(['/api/beneficios?shop=true', { signal: undefined }]);
  });
  it('afiliacion deshabilitada neutraliza un enlace aunque venga en el payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ products: [product()], affiliateAvailable: false }))));
    expect((await fetchShopCatalog()).products[0].link).toBeNull();
  });
  it('datos incompletos no se presentan como producto verificado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ products: [{ id }], affiliateAvailable: true }))));
    await expect(fetchShopCatalog()).rejects.toThrow('incompletos o invalidos');
  });
  it('catalogo nativo usa campos publicos sin secretos ni enlaces inventados', async () => {
    mocks.native = true;
    const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn().mockResolvedValue({
      data: [{ id, title: 'Collar antipulgas', thumbnail: null, grupo: 'salud', price: 100, pet_types: ['perro'], life_stages: ['todas'], size_categories: ['todos'], free_shipping: false, fast_delivery: false }],
      error: null,
    }) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
    mocks.from.mockReturnValue(query);
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect((await fetchShopCatalog()).products[0]).toMatchObject({ category: 'salud', link: null, checkedAt: null, currency: null, priceStatus: 'unverified' });
    expect(query.select.mock.calls[0][0]).not.toMatch(/permalink|mla_id|\*/);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([{ ids: [] }, { ids: Array(31).fill(id) }, { ids: ['-'.repeat(36)] }])('seleccion invalida no consulta RPC: $ids', async ({ ids }) => {
    await expect(fetchShopPriceHistory(ids)).rejects.toThrow('Selecciona publicaciones');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('historial mal formado y migracion pendiente son errores explicitos', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error('missing') });
    await expect(fetchShopPriceHistory([id])).rejects.toThrow('migracion 071');
    mocks.rpc.mockResolvedValueOnce({ data: [{ productId: id }], error: null });
    await expect(fetchShopPriceHistory([id])).rejects.toThrow('incompleto o invalido');
  });
  it('vistas invalidas no escriben ni priorizan productos', async () => {
    await expect(markShopProductViewed('invalid')).rejects.toThrow('publicacion valida');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('productos pendientes no se muestran en el catalogo publico',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({products:[{...product(),approvalStatus:'pending'}]}))));
    await expect(fetchShopCatalog()).rejects.toThrow('sin aprobar');
  });
  it('validaciones administrativas locales no invocan RPC y rechazos remotos son explicitos',async()=>{
    await expect(fetchAdminShopRadar(-1)).rejects.toThrow('Pagina Radar invalida');
    await expect(reviewAdminShopRadar('invalid','approve','Verificado')).rejects.toThrow('Candidato Radar invalido');
    await expect(reviewAdminShopRadar(id,'approve','')).rejects.toThrow('motivo');
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({data:null,error:new Error('No autorizado')});
    await expect(fetchAdminShopRadar()).rejects.toThrow('No autorizado');
  });
});
