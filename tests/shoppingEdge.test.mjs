import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { researchShopItem } from '../api/_lib/shopResearch.mjs';

const m=vi.hoisted(()=>({handler:null,from:vi.fn(),rpc:vi.fn(),auth:vi.fn(),fetch:vi.fn(),tier:'free',protected:false,invalid:false}));
vi.mock('https://deno.land/std@0.208.0/http/server.ts',()=>({serve:handler=>{m.handler=handler;}}));
vi.mock('https://esm.sh/@supabase/supabase-js@2.39.0',()=>({createClient:()=>({from:m.from,rpc:m.rpc,auth:{getUser:m.auth}})}));
import '../supabase/functions/pet-ai-chat/index.ts';
const owner='71000000-0000-4000-8000-000000000010';
const pet='71000000-0000-4000-8000-000000000011';
const product='71000000-0000-4000-8000-000000000012';
const request=(payload={})=>new Request('https://local.test',{method:'POST',headers:{Authorization:'Bearer synthetic-only','Content-Type':'application/json'},body:JSON.stringify({mode:'shopping',petId:pet,question:'Comparar productos',shoppingProductIds:[product],...payload})});
beforeEach(()=>{
  vi.clearAllMocks();m.tier='free';m.protected=false;m.invalid=false;
  vi.stubGlobal('Deno',{env:{get:key=>({SUPABASE_URL:'https://local.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic',AI_API_KEY:'synthetic'})[key]}});
  vi.stubGlobal('fetch',m.fetch);
  m.auth.mockImplementation(async()=>({data:{user:m.invalid?null:{id:owner}},error:m.invalid?new Error('invalid'):null}));
  m.fetch.mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:'Comparacion con datos verificados'}}],model:'synthetic',usage:{prompt_tokens:100,completion_tokens:10,total_tokens:110}})));
  m.rpc.mockResolvedValue({data:[{productId:product,price:80,currency:'ARS',lastSuccessAt:'2026-01-01T00:00:00Z',status:'ok'}],error:null});
  m.from.mockImplementation(table=>{
    const data=()=>{
      if(table==='ai_usage_settings')return {guest_limit_per_pet:3,free_limit_per_pet:10,premium_limit_per_pet:100};
      if(table==='users')return {id:owner,access_mode:m.tier,active_pet_id:m.protected?'other':pet};
      if(table==='subscriptions')return {plan:m.tier,is_active:m.tier==='premium',expires_at:null};
      if(table==='pets')return {id:pet,user_id:owner,name:'Golden',species:'dog',breed:'Golden Retriever',age_years:0,age_months:8,weight_kg:15};
      if(table==='ai_pet_usage')return {usage_count:0,period_key:'current'};
      if(table==='beneficios_productos')return [{id:product,title:'Producto real',grupo:'alimentos',pet_types:['perro'],life_stages:['cachorro'],size_categories:['grande'],
        approval_status:'approved',researched_at:'2026-11-06T12:00:00Z',research_record:researchShopItem({
          id:'MLA123456789',title:'Producto real para perro cachorro razas grandes',status:'active',
          permalink:'https://articulo.mercadolibre.com.ar/MLA-123456789',attributes:[{id:'BRAND',name:'Marca',value_name:'Marca publicada'}],pictures:[],
        },null,'2026-11-06T12:00:00Z')}];
      if(table==='shop_tracked_products')return [{product_id:product,metadata:{brand:'Marca publicada',seller:'Vendedor real'}}];
      return [];
    };
    const q={select:vi.fn(()=>q),eq:vi.fn(()=>q),limit:vi.fn(()=>q),in:vi.fn(()=>q),order:vi.fn(()=>q),
      single:async()=>({data:data(),error:null}),maybeSingle:async()=>({data:data(),error:null}),
      upsert:async()=>({error:null}),insert:async()=>({error:null}),
      then:(resolve,reject)=>Promise.resolve({data:data(),count:2,error:null}).then(resolve,reject)};
    return q;
  });
});
afterEach(()=>vi.unstubAllGlobals());
describe('Asesor de compras con infraestructura IA existente',()=>{
  it.each(['free','premium'])('usa catalogo confiable y limites existentes para %s',async tier=>{
    m.tier=tier;
    const response=await m.handler(request({plan:'premium',products:[{price:999999}]}));
    expect(response.status).toBe(200);
    expect((await response.json()).usage.tier).toBe(tier);
    const body=JSON.parse(m.fetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain('No diagnostiques');
    expect(body.messages[1].content).toContain('Producto real');
    expect(body.messages[1].content).toContain('Marca publicada');
    expect(body.messages[1].content).toContain('"lastKnownPrice":80');
    expect(body.messages[1].content).not.toContain('999999');
    expect(m.from.mock.calls.map(c=>c[0])).not.toContain('clinical_entries');
  });
  it('sesion invalida no consulta catalogo ni llama al proveedor',async()=>{
    m.invalid=true;expect((await m.handler(request())).status).toBe(401);
    expect(m.fetch).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
  });
  it('mascota protegida conserva restriccion Free y no llama IA',async()=>{
    m.protected=true;expect((await m.handler(request())).status).toBe(403);
    expect(m.fetch).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
  });
  it('productos invalidos rechazan antes del proveedor',async()=>{
    expect((await m.handler(request({shoppingProductIds:['invalid']}))).status).toBe(400);
    expect(m.fetch).not.toHaveBeenCalled();
  });
  it('historial no disponible produce error explicito sin precios inventados',async()=>{
    m.rpc.mockResolvedValue({data:null,error:new Error('missing migration')});
    expect((await m.handler(request())).status).toBe(500);expect(m.fetch).not.toHaveBeenCalled();
  });
  it('guest conserva contrato existente sin consultar catalogo privado ni sugerir precios',async()=>{
    const response=await m.handler(new Request('https://local.test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      mode:'shopping',petId:'guest-pet',guestContext:{pet:{id:'guest-pet',name:'Gato',species:'cat',ageYears:4,ageMonths:0}},question:'Orientacion general',shoppingProductIds:[product],
    })}));
    expect(response.status).toBe(200);
    expect((await response.json()).usage).toMatchObject({tier:'guest',limit:3,used:0});
    expect(m.auth).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
    expect(m.from.mock.calls.map(c=>c[0])).not.toContain('beneficios_productos');
  });
});
