import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { researchShopItem } from '../api/_lib/shopResearch.mjs';

const admin = '72000000-0000-4000-8000-000000000001';
const other = '72000000-0000-4000-8000-000000000002';
const source = 'https://api.mercadolibre.com/highlights/MLA/category/MLA12345';
const detection = n => ({ mlaId: `MLA12345678${n}`, categoryId: 'MLA12345', categoryName: 'Categoria oficial', source, position: n });
const record = n => researchShopItem({
  id: `MLA12345678${n}`, title: 'Alimento perro adulto todas las razas', status: 'active',
  permalink: `https://articulo.mercadolibre.com.ar/MLA-12345678${n}`, category_id: 'MLA12345',
  attributes: [{ id: 'BRAND', name: 'Marca', value_name: 'Marca real' }], pictures: [],
}, { plain_text: 'Descripcion oficial' }, '2026-11-06T12:00:00Z');
describe('Radar transaccional en PostgreSQL aislado', () => {
  it('limita, deduplica, investiga una vez y publica solo por aprobacion administrativa', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role anon; create role authenticated; create role service_role bypassrls;
        create schema auth;
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
        create table public.admin_users(user_id uuid primary key);
        insert into public.admin_users values('${admin}');
        grant select on public.admin_users to anon,authenticated;
        create table public.beneficios_productos(
          id uuid primary key default gen_random_uuid(),url_ml text not null,mla_id text not null unique,permalink text not null,
          title text not null,thumbnail text,price numeric,grupo text not null,pet_types text[],life_stages text[],size_categories text[],
          free_shipping boolean not null default false,fast_delivery boolean not null default false,
          active boolean not null default true,source text not null default 'manual',created_at timestamptz default now(),updated_at timestamptz default now()
        );
        alter table public.beneficios_productos enable row level security;
        grant select on public.beneficios_productos to anon,authenticated;
        create policy public_read on public.beneficios_productos for select using(active);
      `);
      await db.exec(readFileSync(new URL('../supabase/migrations/071_shop_price_history.sql', import.meta.url), 'utf8'));
      await db.exec(readFileSync(new URL('../supabase/migrations/072_global_catalog_radar.sql', import.meta.url), 'utf8'));
      const rpc = async (name, args = []) => (await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as result`,args)).rows[0].result;
      expect(await rpc('claim_shop_radar_run')).toMatchObject({status:'disabled'});
      await db.exec('update public.shop_radar_settings set enabled=true,research_enabled=true');
      const run = await rpc('claim_shop_radar_run');
      expect(run.status).toBe('claimed');
      expect(await rpc('claim_shop_radar_run')).toMatchObject({status:'already_ran'});
      const first = await rpc('record_shop_radar_detection',[run.runId,JSON.stringify(detection(1))]);
      expect(first.status).toBe('created');
      expect(await rpc('record_shop_radar_detection',[run.runId,JSON.stringify(detection(1))])).toMatchObject({status:'already_known'});
      for(let n=2;n<=5;n++) expect(await rpc('record_shop_radar_detection',[run.runId,JSON.stringify(detection(n))])).toMatchObject({status:'created'});
      expect(await rpc('record_shop_radar_detection',[run.runId,JSON.stringify(detection(6))])).toMatchObject({status:'daily_limit'});
      expect((await db.query('select detected_count from public.shop_radar_runs')).rows[0].detected_count).toBe(5);
      expect((await db.query('select count(*)::int n from public.beneficios_productos')).rows[0].n).toBe(0);
      const leases = await rpc('claim_shop_radar_research',[5]);
      expect(leases).toHaveLength(5);
      expect(await rpc('claim_shop_radar_research',[5])).toEqual([]);
      const job=leases.find(p=>p.id===first.candidateId);
      const ready={status:'ready',mlaId:'MLA123456781',catalogProductId:'MLA99999999',listingActive:true,record:record(1)};
      await expect(rpc('finish_shop_radar_research',[job.id,other,JSON.stringify(ready)])).rejects.toThrow('Reserva invalida');
      await rpc('finish_shop_radar_research',[job.id,job.leaseId,JSON.stringify(ready)]);
      await rpc('finish_shop_radar_research',[job.id,job.leaseId,JSON.stringify(ready)]);
      expect((await db.query("select count(*)::int n from public.shop_radar_events where action='researched'")).rows[0].n).toBe(1);
      expect((await db.query('select count(*)::int n from public.beneficios_productos')).rows[0].n).toBe(0);
      await db.exec(`set role authenticated; select set_config('test.uid','${other}',false)`);
      await expect(rpc('admin_list_shop_radar')).rejects.toThrow('No autorizado');
      await expect(rpc('admin_review_shop_radar',[job.id,'approve','Verificado'])).rejects.toThrow('No autorizado');
      await db.exec(`select set_config('test.uid','${admin}',false)`);
      expect((await rpc('admin_list_shop_radar')).candidates).toHaveLength(5);
      const bad=structuredClone(ready.record);delete bad.provenance.petTypes;
      await expect(rpc('admin_review_shop_radar',[job.id,'revise','Revisar',JSON.stringify(bad)])).rejects.toThrow('fuentes');
      await rpc('admin_review_shop_radar',[job.id,'revise','Fuente confirmada',JSON.stringify(ready.record)]);
      const product=await rpc('admin_review_shop_radar',[job.id,'approve','Publicacion y fuentes revisadas']);
      expect(typeof product).toBe('string');
      await expect(rpc('admin_review_shop_radar',[job.id,'approve','Repetir'])).rejects.toThrow('ya resuelto');
      await db.exec('reset role');
      expect((await db.query('select count(*)::int n from public.beneficios_productos')).rows[0].n).toBe(1);
      const global=(await db.query('select * from public.beneficios_productos')).rows[0];
      expect(global.research_record).toEqual(ready.record);
      expect(global.price).toBeNull(); // El precio lo consulta otro proceso.
      expect(global.catalog_product_id).toBe('MLA99999999');
      await db.exec(`update public.beneficios_productos set price=200 where id='${product}'`);
      expect((await db.query('select research_record from public.beneficios_productos')).rows[0].research_record).toEqual(ready.record);
      await db.exec('update public.shop_price_settings set enabled=true');
      const priceJob=(await rpc('claim_shop_price_updates',[20]))[0];
      await rpc('finish_shop_price_update',[product,priceJob.leaseId,JSON.stringify({status:'ok',price:180,currency:'ARS'})]);
      expect((await db.query('select research_record from public.beneficios_productos')).rows[0].research_record).toEqual(ready.record);
      const priceHistory=await rpc('get_shop_price_history',[[product]]);
      expect(priceHistory[0].price).toBe(180);
      expect(await rpc('record_shop_radar_detection',[run.runId,JSON.stringify({mlaId:null,catalogProductId:'MLA99999999',categoryId:'MLA12345',source})])).toMatchObject({status:'already_known'});
      await db.exec(`set role anon`);
      expect((await db.query('select count(*)::int n from public.beneficios_productos')).rows[0].n).toBe(1);
      expect(await rpc('get_shop_price_history',[[product]])).toEqual(priceHistory);
      await expect(db.query('select * from public.shop_radar_candidates')).rejects.toThrow('permission denied');
      await expect(rpc('claim_shop_radar_run')).rejects.toThrow('permission denied');
      await db.exec('reset role');
      const remaining=leases.find(p=>p.id!==job.id);
      await rpc('finish_shop_radar_research',[remaining.id,remaining.leaseId,JSON.stringify({status:'error',error:'http_403'})]);
      await db.exec(`set role authenticated; select set_config('test.uid','${admin}',false)`);
      await rpc('admin_review_shop_radar',[remaining.id,'postpone','Revisar permiso oficial',null,new Date(Date.now()+86400000).toISOString()]);
      await rpc('admin_review_shop_radar',[remaining.id,'reject','Publicacion no accesible']);
      await db.exec('reset role');
      await rpc('finish_shop_radar_run',[run.runId,JSON.stringify(['Fuente limitada'])]);
      expect((await db.query('select count(*)::int n from public.shop_price_samples')).rows[0].n).toBe(1);
      await db.exec(`insert into public.beneficios_productos(url_ml,mla_id,permalink,title,grupo,pet_types,life_stages,size_categories)
        values('https://articulo.mercadolibre.com.ar/MLA-11111111','MLA11111111','https://articulo.mercadolibre.com.ar/MLA-11111111','Borrador manual','alimentos','{}','{}','{}')`);
      expect((await db.query("select active,approval_status from public.beneficios_productos where mla_id='MLA11111111'")).rows[0]).toEqual({active:false,approval_status:'pending'});
      await db.exec(`set role anon`);
      expect((await db.query('select count(*)::int n from public.beneficios_productos')).rows[0].n).toBe(1);
      await db.exec('reset role');
    } finally { await db.close(); }
  },60000);
});
