import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/beneficios.js';

const row = { id:'72000000-0000-4000-8000-000000000003', mla_id:'MLA123456789',
  title:'Producto', grupo:'alimentos', pet_types:['perro'], price:null };
const makeResponse = () => ({
  statusCode:0, body:null, setHeader:vi.fn(),
  status(code) { this.statusCode=code; return this; },
  json(body) { this.body=body; return this; },
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('Filtros heredados de beneficios', () => {
  it('solo devuelve productos con las tres dimensiones verificadas', async () => {
    vi.stubEnv('SUPABASE_URL','https://test.invalid');
    vi.stubEnv('SUPABASE_ANON_KEY','test');
    vi.stubEnv('ML_AFFILIATE_ID','');
    vi.stubEnv('ML_AFFILIATE_TEMPLATE','');
    vi.stubGlobal('fetch', vi.fn(async url => new Response(JSON.stringify(
      String(url).includes('/rpc/') ? [] : [row],
    ), {status:200})));
    const res = makeResponse();
    await handler({method:'GET',query:{petTypes:'perro'}},res);
    expect(res.statusCode).toBe(200);
    expect(res.body.products).toEqual([]);
  });
  it('filtra con valores verificados en lugar de las etiquetas heredadas', async () => {
    vi.stubEnv('SUPABASE_URL','https://test.invalid');
    vi.stubEnv('SUPABASE_ANON_KEY','test');
    vi.stubEnv('ML_AFFILIATE_ID','');
    vi.stubEnv('ML_AFFILIATE_TEMPLATE','');
    vi.stubGlobal('fetch', vi.fn(async url => new Response(JSON.stringify(
      String(url).includes('/rpc/') ? [{product_id:row.id,dimensions:{species:['gato'],stage:['adulto'],size:['todos']}}] : [row],
    ), {status:200})));
    const res = makeResponse();
    await handler({method:'GET',query:{petTypes:'gato'}},res);
    expect(res.statusCode).toBe(200);
    expect(res.body.products.map(p => p.id)).toEqual([row.mla_id]);
  });
  it('no usa el catálogo estático como alternativa si falla la verificación', async () => {
    vi.stubEnv('SUPABASE_URL','https://test.invalid');
    vi.stubEnv('SUPABASE_ANON_KEY','test');
    vi.stubEnv('ML_AFFILIATE_ID','');
    vi.stubEnv('ML_AFFILIATE_TEMPLATE','');
    vi.stubGlobal('fetch', vi.fn(async url => String(url).includes('/rpc/')
      ? new Response('',{status:503}) : new Response(JSON.stringify([row]),{status:200})));
    const res = makeResponse();
    await handler({method:'GET',query:{petTypes:'perro'}},res);
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toContain('compatibilidad');
  });
});
