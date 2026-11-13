import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchOfficialItemPrice, fetchShopJson, getMercadoLibreToken, normalizeItemId, normalizeOfficialPrice, ShopProviderError } from '../api/_lib/mercadoLibre.mjs';
import { loadShopCatalog, mapShopProduct, shopCategory } from '../api/_lib/shopCatalog.mjs';
import { updateShopPrices } from '../scripts/update-shop-prices.mjs';
import { buildShoppingPrompt } from '../supabase/functions/_shared/shoppingPrompt.mjs';

const response=body=>new Response(JSON.stringify(body));
const env={SUPABASE_URL:'https://local.test',SUPABASE_SERVICE_KEY:'synthetic-only',ML_APP_ID:'synthetic',ML_APP_SECRET:'synthetic',ML_REFRESH_TOKEN:'synthetic'};
const item={status:'active',seller_id:12,attributes:[{id:'BRAND',name:'Marca',value_name:'Marca real'}]};
afterEach(()=>vi.restoreAllMocks());
describe('Precios y catalogo oficiales',()=>{
  it('separa precio promocional y regular sin depender de /items price',()=>{
    expect(normalizeOfficialPrice(item,{amount:80,regular_amount:100,currency_id:'ARS'})).toMatchObject({price:80,promotionalPrice:80,regularPrice:100,currency:'ARS'});
  });
  it.each([null,{amount:0,currency_id:'ARS'},{amount:100,currency_id:null}])('rechaza precio ausente o invalido %j',sale=>{
    expect(()=>normalizeOfficialPrice(item,sale)).toThrow(ShopProviderError);
  });
  it('no confunde fichas /p/ con publicaciones',()=>{
    expect(normalizeItemId('MLA1234567890','https://www.mercadolibre.com.ar/p/MLA1234567890')).toBeNull();
    expect(normalizeItemId('MLA-1234567890','https://articulo.mercadolibre.com.ar/MLA-1234567890')).toBe('MLA1234567890');
  });
  it('acepta respuestas vacias de RPC void (204) sin marcar invalid_json',async()=>{
    expect(await fetchShopJson('https://local.test/rpc',{},vi.fn().mockResolvedValue(new Response(null,{status:204})))).toBeNull();
    expect(await fetchShopJson('https://local.test/rpc',{},vi.fn().mockResolvedValue(new Response('',{status:200})))).toBeNull();
    await expect(fetchShopJson('https://local.test/rpc',{},vi.fn().mockResolvedValue(new Response('<html></html>',{status:200})))).rejects.toThrow('invalid_json');
  });
  it('consulta endpoint oficial de precio con contexto de marketplace, no scraping',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(response(item)).mockResolvedValueOnce(response({amount:100,regular_amount:null,currency_id:'ARS'}));
    await fetchOfficialItemPrice('MLA1234567890','synthetic',fetcher);
    expect(fetcher.mock.calls[1][0]).toBe('https://api.mercadolibre.com/items/MLA1234567890/sale_price?context=channel_marketplace');
  });
  it('conserva refresh rotado antes de devolver access token',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(response({status:'refresh',leaseId:'lease',refreshToken:'old'}))
      .mockResolvedValueOnce(response({access_token:'new-access',refresh_token:'new-refresh',expires_in:3600}))
      .mockResolvedValueOnce(response(null));
    expect(await getMercadoLibreToken(env,fetcher)).toBe('new-access');
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({p_refresh:'new-refresh'});
  });
  it('renovador ocupado no dispara otra renovacion OAuth',async()=>{
    const fetcher=vi.fn().mockResolvedValue(response({status:'busy'}));
    await expect(getMercadoLibreToken(env,fetcher)).rejects.toThrow('oauth_refresh_busy');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('catalogo estatico sin tracking conserva fichas sin precio ni vendedores inventados',async()=>{
    const catalog=await loadShopCatalog({alimentos:[{id:'s',title:'Alimento Perro Cachorro',search:'alimento'}]}, {}, vi.fn());
    expect(catalog.products[0]).toMatchObject({price:null,seller:null,link:null,petTypes:['perro'],lifeStages:['cachorro']});
    expect(catalog.warning).toContain('sin precios verificados');
  });
  it('tracking configurado genera enlaces solo en dominios permitidos',()=>{
    expect(mapShopProduct({id:'s',title:'Perro',grupo:'alimentos',search:'alimento'},null,{ok:true,value:'test'}).link).toContain('matt_tool=test');
    expect(mapShopProduct({id:'s',title:'Perro',grupo:'alimentos',permalink:'https://evil.test'},null,{ok:true,value:'test'}).link).toBeNull();
  });
  it('productos sanitarios no se recategorizan como accesorios recomendables',()=>{
    expect(shopCategory('Collar antipulgas','salud')).toBe('salud');
  });
  it('historial temporalmente inaccesible no fecha un precio manual como nuevo',async()=>{
    vi.spyOn(console,'error').mockImplementation(()=>{});
    const fetcher=vi.fn().mockResolvedValueOnce(response([{id:'id',title:'Real',price:123,grupo:'alimentos'}])).mockResolvedValueOnce(new Response('',{status:503}));
    const result=await loadShopCatalog({},env,fetcher);
    expect(result.products[0]).toMatchObject({price:123,checkedAt:null,priceStatus:'unverified'});
    expect(result.warning).toContain('Historial');
  });
  it('catalogo global pagina productos y reutiliza fichas investigadas en lugar de metadatos de precios',async()=>{
    const row={id:'p',title:'Real',grupo:'alimentos'};
    const fetcher=vi.fn(async url=>{
      if(url.includes('beneficios_productos'))return response(url.includes('offset=0')?Array.from({length:200},(_,i)=>({...row,id:`p${i}`})):[{...row,id:'last'}]);
      return response([]);
    });
    const result=await loadShopCatalog({},env,fetcher);
    expect(result.products).toHaveLength(201);
    expect(fetcher.mock.calls.filter(([url])=>url.includes('beneficios_productos'))).toHaveLength(2);
    expect(fetcher.mock.calls[0][0]).toContain('approval_status=eq.approved');
  });
  it('worker apagado no consulta ni escribe',async()=>{
    const fetcher=vi.fn();expect(await updateShopPrices({env:{},fetcher})).toMatchObject({enabled:false});
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('sin trabajos no renueva OAuth aunque el workflow este habilitado',async()=>{
    const fetcher=vi.fn().mockResolvedValue(response([]));
    expect(await updateShopPrices({env:{...env,SHOP_PRICE_TRACKING_ENABLED:'true'},fetcher})).toMatchObject({updated:0,failed:0});
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toContain('claim_shop_price_updates');
  });
  it('drena mas de un lote con concurrencia acotada y sin renovar un token por producto',async()=>{
    let batches=0,active=0,maximum=0;
    const job={productId:'p',leaseId:'lease',externalId:'MLA1234567890',permalink:'https://articulo.mercadolibre.com.ar/MLA-1234567890'};
    const fetcher=vi.fn(async url=>{
      if(url.includes('claim_shop_price_updates'))return response(++batches<=2?Array.from({length:20},(_,i)=>({...job,productId:`p${batches}-${i}`})):[]);
      if(url.includes('/items/')){
        maximum=Math.max(maximum,++active);
        await new Promise(resolve=>setTimeout(resolve,1));active--;
        return response(url.includes('/sale_price')?{amount:100,currency_id:'ARS'}:item);
      }
      return response(null);
    });
    expect(await updateShopPrices({env:{...env,SHOP_PRICE_TRACKING_ENABLED:'true',ML_ACCESS_TOKEN:'synthetic'},fetcher})).toMatchObject({updated:40,failed:0});
    expect(batches).toBe(3);expect(maximum).toBeLessThanOrEqual(4);
    expect(fetcher.mock.calls.filter(([url])=>url.includes('finish_shop_price_update'))).toHaveLength(40);
  });
  it('un token no disponible finaliza leases como error sin consultar publicaciones',async()=>{
    vi.spyOn(console,'error').mockImplementation(()=>{});
    const fetcher=vi.fn(async url=>{
      if(url.includes('claim_shop_price_updates'))return response([{productId:'p',leaseId:'lease',externalId:'MLA1234567890',permalink:'https://articulo.mercadolibre.com.ar/MLA-1234567890'}]);
      if(url.includes('claim_shop_provider_token'))return response({status:'busy'});
      return response(null);
    });
    expect(await updateShopPrices({env:{...env,SHOP_PRICE_TRACKING_ENABLED:'true'},fetcher})).toMatchObject({failed:1});
    expect(fetcher.mock.calls.some(([url])=>url.includes('/items/'))).toBe(false);
    const finish=fetcher.mock.calls.find(([url])=>url.includes('finish_shop_price_update'));
    expect(JSON.parse(finish[1].body).p_result).toEqual({status:'error',error:'oauth_refresh_busy'});
  });
  it('error externo registra error, no precio falso; lease se conserva en RPC',async()=>{
    vi.spyOn(console,'error').mockImplementation(()=>{});
    const fetcher=vi.fn(async url=>{
      if(url.includes('claim_shop_price_updates'))return response([{productId:'p',leaseId:'lease',externalId:'MLA1234567890',permalink:'https://articulo.mercadolibre.com.ar/MLA-1234567890'}]);
      if(url.includes('/items/'))return new Response('',{status:403});
      return response(null);
    });
    const result=await updateShopPrices({env:{...env,SHOP_PRICE_TRACKING_ENABLED:'true',ML_ACCESS_TOKEN:'synthetic',SHOP_PRICE_MAX_BATCHES:'1'},fetcher});
    expect(result).toMatchObject({updated:0,failed:1});
    const finish=fetcher.mock.calls.find(([url])=>url.includes('finish_shop_price_update'));
    expect(JSON.parse(finish[1].body)).toMatchObject({p_lease:'lease',p_result:{status:'error',error:'http_403'}});
  });
  it('prompt contextual no prescribe ni inventa datos y usa JSON verificado',()=>{
    const prompt=buildShoppingPrompt({species:'dog',breed:'Golden',age_years:0,age_months:8,weight_kg:15},[{title:'Real',lastKnownPrice:null}],'Comparar');
    expect(prompt).toContain('No inventes precios');
    expect(prompt).toContain('no dosifiques');
    expect(prompt).toContain('"lastKnownPrice":null');
  });
});
