import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

describe('Historial de tienda en PostgreSQL local aislado', () => {
  it('ejecuta la migracion 071 y escenarios SQL reales sin conectar al remoto', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role anon; create role authenticated; create role service_role bypassrls;
        create table public.beneficios_productos(
          id uuid primary key,mla_id text,permalink text,title text,active boolean,grupo text
        );
      `);
      await db.exec(readFileSync(new URL('../supabase/migrations/071_shop_price_history.sql',import.meta.url),'utf8'));
      await db.exec(readFileSync(new URL('../supabase/tests/071_shop_price_history.test.sql',import.meta.url),'utf8'));
      expect((await db.query('select count(*)::integer as count from public.shop_price_samples')).rows[0].count).toBe(0);
    } finally {
      await db.close();
    }
  }, 60000);
});
