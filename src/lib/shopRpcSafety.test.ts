import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const admin = '72000000-0000-4000-8000-000000000001';
const other = '72000000-0000-4000-8000-000000000002';
const product = '72000000-0000-4000-8000-000000000003';
const candidate = '72000000-0000-4000-8000-000000000004';
const duplicate = '72000000-0000-4000-8000-000000000005';
const migration = readFileSync(new URL('../../supabase/migrations/073_shop_compatibility_radar.sql', import.meta.url), 'utf8');
const fix = readFileSync(new URL('../../supabase/migrations/074_fix_radar_publish_identity.sql', import.meta.url), 'utf8');

describe('RPC de compatibilidad y Radar en PostgreSQL efímero', () => {
  it('exige evidencia habilitada, separa publicación y conserva datos en importaciones repetidas', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role anon; create role authenticated; create role service_role;
        create schema auth;
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
        create table public.admin_users(user_id uuid primary key);
        insert into public.admin_users values('${admin}');
        create table public.beneficios_productos(
          id uuid primary key default gen_random_uuid(), mla_id text not null unique, url_ml text not null, permalink text not null,
          title text not null, thumbnail text, price numeric, grupo text not null, pet_types text[], life_stages text[],
          size_categories text[], free_shipping boolean default false, fast_delivery boolean default false,
          active boolean default true, source text, catalog_product_id text, research_record jsonb,
          researched_at timestamptz, approval_status text
        );
        create table public.shop_radar_candidates(
          id uuid primary key, mla_id text, catalog_product_id text, duplicate_product_id uuid,
          listing_active boolean, research_status text, research_record jsonb, researched_at timestamptz,
          review_status text, reviewed_by uuid, reviewed_at timestamptz, lease_until timestamptz,
          lease_id uuid, research_error text, postponed_until timestamptz, decision_reason text
        );
        create table public.shop_radar_events(candidate_id uuid, actor_id uuid, action text, reason text, snapshot jsonb);
        create function public.validate_shop_research(p jsonb) returns boolean language sql as $$ select p->>'title' is not null $$;
        create function public.admin_review_shop_radar(uuid,text,text,jsonb,timestamptz) returns uuid language sql as $$ select null::uuid $$;
        grant execute on function public.admin_review_shop_radar(uuid,text,text,jsonb,timestamptz) to authenticated;
        insert into public.beneficios_productos(id,mla_id,url_ml,permalink,title,grupo,pet_types,life_stages,size_categories,active,approval_status)
          values('${product}','MLA-123456789','url','url','Producto','alimentos',array['perro'],array['adulto'],array['pequeño'],true,'approved');
      `);
      const table = migration.match(/create table public\.shop_compatibility_dimensions[\s\S]*?\n\);/)?.[0];
      if (!table) throw new Error('No se encontró la definición de dimensiones.');
      await db.exec(table);
      for (const name of ['invalidate_shop_dimensions','admin_shop_dimension','admin_get_shop_dimensions','get_shop_compatibility','admin_review_shop_radar_safe']) {
        const definition = migration.match(new RegExp(`create function public\\.${name}\\([\\s\\S]*?\\$\\$;`))?.[0];
        if (!definition) throw new Error(`No se encontró ${name}.`);
        await db.exec(definition);
      }
      const replacement = fix.match(/create or replace function public\.admin_review_shop_radar_safe\([\s\S]*?\$\$;/)?.[0];
      if (!replacement) throw new Error('No se encontró el reemplazo 074 de admin_review_shop_radar_safe.');
      await db.exec(replacement);
      await db.exec(`
        alter table public.shop_compatibility_dimensions enable row level security;
        create trigger shop_dimensions_invalidate after update on public.beneficios_productos
          for each row execute function public.invalidate_shop_dimensions();
      `);
      for (const statement of migration.match(/(?:revoke|grant) [\s\S]*?;/g) || []) await db.exec(statement);
      await db.exec(`set role authenticated; select set_config('test.uid','${other}',false)`);
      const rpc = (name: string, args: unknown[]) => db.query(`select * from public.${name}(${args.map((_, i) => `$${i+1}`).join(',')})`, args);
      const dimension = (key: string, action: string, value: string[] | null = null) =>
        rpc('admin_shop_dimension', [product,key,action,value,'confirmed','https://fabricante.example/ficha','2026-11-12T12:00:00Z','MLA123456789']);
      await expect(dimension('species','enable')).rejects.toThrow('No autorizado');
      await expect(db.query('select * from public.shop_compatibility_dimensions')).rejects.toThrow('permission denied');
      await expect(rpc('admin_review_shop_radar_safe',[candidate,'publish','Publicar',null,null])).rejects.toThrow('No autorizado');
      await db.exec(`reset role; set role anon; select set_config('test.uid','${admin}',false)`);
      await expect(rpc('admin_review_shop_radar_safe',[candidate,'publish','Sin permisos anon',null,null])).rejects.toThrow('permission denied');
      await expect(rpc('admin_review_shop_radar',[candidate,'approve','RPC legado anon',null,null])).rejects.toThrow('permission denied');
      await db.exec(`reset role; set role authenticated; select set_config('test.uid','${other}',false)`);
      await expect(rpc('admin_review_shop_radar',[candidate,'approve','RPC legado autenticado',null,null])).rejects.toThrow('permission denied');
      expect((await rpc('get_shop_compatibility',[[product]])).rows).toHaveLength(0);
      await db.exec(`select set_config('test.uid','${admin}',false)`);
      for (const status of ['unknown','partial','conflict']) {
        await rpc('admin_shop_dimension',[product,'species','save',['perro'],status,'https://fabricante.example','2026-11-12T12:00:00Z','MLA123456789']);
        await expect(dimension('species','enable')).rejects.toThrow('Requiere valor confirmado');
      }
      await rpc('admin_shop_dimension',[product,'species','save',['perro'],'confirmed','https://fabricante.example','2026-11-12T12:00:00Z','MLA999999999']);
      await expect(dimension('species','enable')).rejects.toThrow('SKU exacto');
      for (const [key,value] of [['species','perro'],['stage','adulto'],['size','pequeño']]) await dimension(key,'save',[value]);
      expect((await rpc('get_shop_compatibility',[[product]])).rows).toHaveLength(0);
      await dimension('species','enable'); await dimension('stage','enable');
      expect((await rpc('get_shop_compatibility',[[product]])).rows).toHaveLength(0);
      await dimension('size','enable');
      expect((await rpc('get_shop_compatibility',[[product]])).rows).toHaveLength(1);
      await dimension('species','import',null);
      await dimension('species','import',['perro']);
      await dimension('species','import',['perro']);
      expect((await rpc('get_shop_compatibility',[[product]])).rows).toHaveLength(1);
      expect((await rpc('admin_get_shop_dimensions',[product])).rows).toHaveLength(3);
      await db.exec('reset role');
      expect((await db.query<{ pet_types: string[] }>('select pet_types from public.beneficios_productos')).rows[0].pet_types).toEqual(['perro']);
      await db.exec(`update public.beneficios_productos set title='Título corregido' where id='${product}'`);
      await db.exec(`set role authenticated; select set_config('test.uid','${admin}',false)`);
      expect((await rpc('get_shop_compatibility',[[product]])).rows).toHaveLength(0);
      await dimension('species','save',['gato']);
      expect((await rpc('get_shop_compatibility',[[product]])).rows).toHaveLength(0);
      await db.exec('reset role');
      const record = JSON.stringify({title:'Producto nuevo',permalink:'https://articulo.mercadolibre.com.ar/MLA-987654321',category:'alimentos',images:[],petTypes:[],lifeStages:[],sizes:[]});
      await db.query(`insert into public.shop_radar_candidates(id,mla_id,listing_active,research_status,research_record,researched_at,review_status)
        values($1,'MLA987654321',true,'ready',$2,now(),'pending')`,[candidate,record]);
      await db.exec(`set role authenticated; select set_config('test.uid','${admin}',false)`);
      await expect(rpc('admin_review_shop_radar_safe',[candidate,'publish','Sin aprobación',null,null])).rejects.toThrow('requiere identidad');
      await rpc('admin_review_shop_radar_safe',[candidate,'approve','Investigación revisada',null,null]);
      await db.exec('reset role');
      expect((await db.query<{ n: number }>('select count(*)::int as n from public.beneficios_productos')).rows[0].n).toBe(1);
      await db.exec(`set role authenticated; select set_config('test.uid','${other}',false)`);
      await expect(rpc('admin_review_shop_radar_safe',[candidate,'publish','Sin permisos',null,null])).rejects.toThrow('No autorizado');
      await db.exec('reset role');
      await db.exec(`set role authenticated; select set_config('test.uid','${admin}',false)`);
      for (const [field, value] of [
        ['mla_id', null],
        ['mla_id', 'MLA123'],
        ['researched_at', null],
        ['listing_active', null],
        ['research_record', JSON.stringify({title:null,permalink:'https://articulo.mercadolibre.com.ar/MLA-987654321',category:'alimentos'})],
        ['research_record', JSON.stringify({title:' ',permalink:'https://articulo.mercadolibre.com.ar/MLA-987654321',category:'alimentos'})],
        ['research_record', JSON.stringify({title:'Producto',permalink:null,category:'alimentos'})],
        ['research_record', JSON.stringify({title:'Producto',permalink:'https://articulo.mercadolibre.com.ar/MLA-999999999',category:'alimentos'})],
        ['research_record', JSON.stringify({title:'Producto',permalink:'https://articulo.mercadolibre.com.ar/MLA-987654321',category:null})],
        ['research_record', JSON.stringify({title:'Producto',permalink:'https://articulo.mercadolibre.com.ar/MLA-987654321',category:'invalida'})],
        ['research_record', JSON.stringify({title:'Producto',permalink:'https://www.mercadolibre.com.ar/MLA-987654321',category:'alimentos'})],
        ['research_record', null],
      ] as const) {
        await db.exec('reset role');
        const before = await db.query<{ value: unknown }>(`select ${field} as value from public.shop_radar_candidates where id=$1`, [candidate]);
        await db.query(`update public.shop_radar_candidates set ${field}=$1 where id=$2`, [value,candidate]);
        await db.exec(`set role authenticated; select set_config('test.uid','${admin}',false)`);
        await expect(rpc('admin_review_shop_radar_safe',[candidate,'publish','Datos incompletos',null,null])).rejects.toThrow('requiere identidad');
        await db.exec('reset role');
        await db.query(`update public.shop_radar_candidates set ${field}=$1 where id=$2`, [before.rows[0].value,candidate]);
        await db.exec(`set role authenticated; select set_config('test.uid','${admin}',false)`);
      }
      await rpc('admin_review_shop_radar_safe',[candidate,'publish','Publicación revisada',null,null]);
      await expect(rpc('admin_review_shop_radar_safe',[candidate,'publish','Repetir',null,null])).rejects.toThrow();
      await expect(rpc('admin_review_shop_radar',[candidate,'approve','Intento anterior',null,null])).rejects.toThrow('permission denied');
      await db.exec('reset role');
      expect((await db.query<{ n: number }>('select count(*)::int as n from public.beneficios_productos')).rows[0].n).toBe(2);
      expect((await db.query<{ price: number | null }>(`select price from public.beneficios_productos where mla_id='MLA987654321'`)).rows[0].price).toBeNull();
      await db.query(`insert into public.shop_radar_candidates(id,mla_id,listing_active,research_status,research_record,researched_at,review_status,reviewed_by,reviewed_at)
        values($1,'MLA987654321',true,'ready',$2,now(),'approved',$3,now())`,[duplicate,record,admin]);
      await db.exec(`set role authenticated; select set_config('test.uid','${admin}',false)`);
      await expect(rpc('admin_review_shop_radar_safe',[duplicate,'publish','Duplicado',null,null])).rejects.toThrow('ya incorporado');
      await db.exec('reset role');
      expect((await db.query<{ n: number }>('select count(*)::int as n from public.beneficios_productos')).rows[0].n).toBe(2);
      // Candidato de catalogo: catalog_product_id y mla_id son espacios de ID
      // distintos en ML; la identidad se verifica por procedencia de la ficha.
      const catalogOk = '72000000-0000-4000-8000-000000000006';
      const catalogForeign = '72000000-0000-4000-8000-000000000007';
      const catalogRecord = (source: string) => JSON.stringify({title:'Producto de catalogo',permalink:'https://articulo.mercadolibre.com.ar/MLA-976543210',category:'juguetes',images:[],petTypes:[],lifeStages:[],sizes:[],provenance:{title:{source,researchedAt:'2026-11-16T12:00:00Z'}}});
      await db.query(`insert into public.shop_radar_candidates(id,mla_id,catalog_product_id,listing_active,research_status,research_record,researched_at,review_status)
        values($1,'MLA976543210','MLA55555555',true,'ready',$2,now(),'pending')`,[catalogOk,catalogRecord('https://api.mercadolibre.com/products/MLA55555555')]);
      await db.query(`insert into public.shop_radar_candidates(id,mla_id,catalog_product_id,listing_active,research_status,research_record,researched_at,review_status)
        values($1,'MLA976543211','MLA55555556',true,'ready',$2,now(),'pending')`,[catalogForeign,catalogRecord('https://ficha-ajena.example/producto')]);
      await db.exec(`set role authenticated; select set_config('test.uid','${admin}',false)`);
      await rpc('admin_review_shop_radar_safe',[catalogOk,'approve','Catalogo revisado',null,null]);
      await rpc('admin_review_shop_radar_safe',[catalogOk,'publish','Publicar catalogo verificado',null,null]);
      await rpc('admin_review_shop_radar_safe',[catalogForeign,'approve','Catalogo con fuente ajena',null,null]);
      await expect(rpc('admin_review_shop_radar_safe',[catalogForeign,'publish','Fuente no oficial',null,null])).rejects.toThrow('requiere identidad');
      await db.exec('reset role');
      expect((await db.query<{ n: number }>(`select count(*)::int as n from public.beneficios_productos where catalog_product_id='MLA55555555'`)).rows[0].n).toBe(1);
      expect((await db.query<{ n: number }>('select count(*)::int as n from public.beneficios_productos')).rows[0].n).toBe(3);
    } finally { await db.close(); }
  }, 60000);
});
