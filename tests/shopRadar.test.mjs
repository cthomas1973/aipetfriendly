import { afterEach, describe, expect, it, vi } from 'vitest';
import { researchShopItem, investigateShopCandidate, rankingDetections } from '../api/_lib/shopResearch.mjs';
import { discoverShopRadar, researchShopRadar } from '../scripts/shop-radar.mjs';
import { isShopResearchRecord, publicShopResearch } from '../supabase/functions/_shared/shopResearchRecord.mjs';
const response=body=>new Response(JSON.stringify(body));
const env={SHOP_RADAR_ENABLED:'true',SHOP_RADAR_RESEARCH_ENABLED:'true',SUPABASE_URL:'https://local.test',SUPABASE_SERVICE_KEY:'synthetic',ML_ACCESS_TOKEN:'synthetic'};
const item={id:'MLA123456789',title:'Alimento perro cachorro razas grandes',status:'active',permalink:'https://articulo.mercadolibre.com.ar/MLA-123456789',category_id:'MLA12345',pictures:[{secure_url:'https://http2.mlstatic.com/image.jpg'}],attributes:[{id:'BRAND',name:'Marca',value_name:'Marca publicada'}]};
afterEach(()=>vi.restoreAllMocks());
describe('Radar oficial y atributos globales',()=>{
  it('registra fuente y fecha por campo y no convierte datos faltantes en universales',()=>{
    const research=researchShopItem(item,{plain_text:'Descripcion real'},'2026-11-06T12:00:00Z');
    expect(isShopResearchRecord(research)).toBe(true);
    expect(research).toMatchObject({petTypes:['perro'],lifeStages:['cachorro'],sizes:['grande'],brand:'Marca publicada'});
    expect(research.attributes[0]).toMatchObject({source:'https://api.mercadolibre.com/items/MLA123456789',researchedAt:'2026-11-06T12:00:00Z'});
    const unknown=researchShopItem({...item,title:'Accesorio sin especificaciones',attributes:[]},null);
    expect(unknown).toMatchObject({petTypes:[],lifeStages:[],sizes:[],brand:null});
    expect(unknown.limitations).toHaveLength(3);
    expect(publicShopResearch({research_record:unknown,researched_at:'2026-11-06T12:00:00Z',approval_status:'approved'}).compatibilityEvidence.species).toBe(false);
  });
  it('sin fecha, fuente o aprobacion no certifica compatibilidad global',()=>{
    const research=researchShopItem(item,null);
    expect(publicShopResearch({research_record:research,approval_status:'pending'}).compatibilityEvidence.species).toBe(false);
    delete research.provenance.petTypes;expect(isShopResearchRecord(research)).toBe(false);
  });
  it('restricciones explicitas no se convierten en recomendaciones por palabras coincidentes',()=>{
    const record=researchShopItem({...item,title:'Alimento perro adulto no apto para gatos ni cachorros'},null);
    expect(record).toMatchObject({petTypes:[],lifeStages:[],sizes:[]});
    expect(record.limitations.join(' ')).toContain('restricciones');
  });
  it('rankings conservan posiciones reales y no inventan popularidad ni tipos desconocidos',()=>{
    expect(rankingDetections({content:[{id:'MLA123456789',type:'ITEM',position:2},{id:'MLA123456780',type:'PRODUCT'},{id:'MLAU123456789',type:'USER_PRODUCT'}]}, {id:'MLA12345',name:'Oficial'}))
      .toMatchObject([{mlaId:'MLA123456789',position:2},{catalogProductId:'MLA123456780',position:null}]);
  });
  it('descubre hasta cinco entre subcategorias oficiales y no escribe productos aprobados',async()=>{
    const detections=[];
    const fetcher=vi.fn(async(url,options)=>{
      if(url.includes('claim_shop_radar_run'))return response({status:'claimed',runId:'run',cursor:0});
      if(url.includes('/categories/MLA1071'))return response({children_categories:Array.from({length:5},(_,i)=>({id:`MLA1234${i}`}))});
      if(url.includes('/categories/'))return response({name:'Oficial',children_categories:[]});
      if(url.includes('/highlights/'))return response({content:[{id:`MLA12345678${url.slice(-1)}`,type:'ITEM',position:1}]});
      if(url.includes('record_shop_radar_detection')){detections.push(JSON.parse(options.body).p_detection);return response({status:'created'});}
      return response(null);
    });
    expect(await discoverShopRadar({env,fetcher})).toMatchObject({detected:5,status:'finished'});
    expect(new Set(detections.map(d=>d.categoryId)).size).toBe(5);
    expect(fetcher.mock.calls.some(([url])=>/beneficios_productos|sale_price/.test(url))).toBe(false);
  });
  it('repetir ejecucion diaria o deshabilitar no consulta Mercado Libre',async()=>{
    const fetcher=vi.fn().mockResolvedValue(response({status:'already_ran'}));
    expect(await discoverShopRadar({env,fetcher})).toMatchObject({status:'already_ran'});
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockClear();await discoverShopRadar({env:{},fetcher});await researchShopRadar({env:{},fetcher});
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('ranking prohibido registra limitacion, sin candidatos ni busqueda alternativa inventada',async()=>{
    vi.spyOn(console,'error').mockImplementation(()=>{});
    const fetcher=vi.fn(async url=>{
      if(url.includes('claim_shop_radar_run'))return response({status:'claimed',runId:'run',cursor:0});
      if(url.includes('/categories/'))return response({name:'Oficial',children_categories:[]});
      if(url.includes('/highlights/'))return new Response('',{status:403});
      return response(null);
    });
    const result=await discoverShopRadar({env,fetcher});
    expect(result).toMatchObject({status:'limited',detected:0});
    expect(result.limitations[0]).toContain('http_403');
    expect(fetcher.mock.calls.some(([url])=>url.includes('record_shop_radar_detection'))).toBe(false);
  });
  it('resuelve catalogo a una publicacion comprobada sin mezclar IDs',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(response({results:[{item_id:item.id}]}))
      .mockResolvedValueOnce(response({...item,catalog_product_id:'MLA99999999'})).mockResolvedValueOnce(response({plain_text:'Real'}));
    expect(await investigateShopCandidate({catalogProductId:'MLA99999999'},'synthetic',fetcher)).toMatchObject({status:'ready',mlaId:item.id,catalogProductId:'MLA99999999'});
    expect(fetcher.mock.calls[0][0]).toContain('/products/MLA99999999/items');
    expect(fetcher.mock.calls.some(([url])=>url.includes('sale_price'))).toBe(false);
  });
  it('publicacion pausada no crea ficha lista ni modifica precios',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(response({...item,status:'paused'})).mockResolvedValueOnce(response({plain_text:'Real'}));
    await expect(investigateShopCandidate({mlaId:item.id},'synthetic',fetcher)).rejects.toThrow('listing_not_active');
  });
  it('investigacion tiene cola independiente, finaliza reserva y nunca aprueba',async()=>{
    const fetcher=vi.fn(async url=>{
      if(url.includes('claim_shop_radar_research'))return response([{id:'candidate',mlaId:item.id,leaseId:'lease'}]);
      if(url.includes('/description'))return response({plain_text:'Real'});
      if(url.includes('/items/'))return response(item);
      return response(null);
    });
    expect(await researchShopRadar({env,fetcher})).toMatchObject({researched:1,failed:0});
    expect(fetcher.mock.calls.some(([url])=>url.includes('claim_shop_radar_run')||url.includes('admin_review'))).toBe(false);
    const finish=fetcher.mock.calls.find(([url])=>url.includes('finish_shop_radar_research'));
    expect(JSON.parse(finish[1].body)).toMatchObject({p_lease:'lease',p_result:{status:'ready'}});
  });
});
