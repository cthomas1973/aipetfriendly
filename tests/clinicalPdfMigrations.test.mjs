import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');

describe('contratos estaticos de migraciones PDF (no ejecutan PostgreSQL)', () => {
  it('069 falla explicitamente por dependencias 066/067 antes de crear objetos', () => {
    const sql = migration('069_clinical_pdf_send_quota.sql');
    const preflight = sql.slice(0, sql.indexOf('create table public.clinical_pdf_sends'));
    for (const dependency of ['guard_user_access_mode', 'guard_subscription_authorization',
      'Subscription update guard', 'Subscription insert guard', 'Subscription delete guard',
      'has_column_privilege', 'relrowsecurity', 'user_premium_effective(uuid)', 'grace_until',
      'cancel_requested_at', 'active_pet_id']) {
      expect(preflight).toContain(dependency);
    }
    expect(preflight).toContain("raise exception '069 requiere 066");
    expect(preflight).toContain("raise exception '069 requiere 067");
  });

  it('070 mantiene la evidencia existente y no agrega liberacion por antiguedad', () => {
    const sql = migration('070_clinical_pdf_recovery_reconciliation.sql');
    expect(sql).toContain('provider_id = coalesce(provider_id, nullif(btrim(p_provider_id)');
    expect(sql).toContain("p_status = 'failed' and v_provider is not null");
    expect(sql).not.toMatch(/delete from|interval|cron|created_at\s*[<=>]/i);
    expect(sql).toContain('from public, anon, authenticated;');
    expect(sql).toContain('reconciled_at timestamptz not null default clock_timestamp()');
  });
});
