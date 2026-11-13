import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../supabase/migrations/066_beneficios_products_admin_rls.sql', import.meta.url);
const migration = readFileSync(fileURLToPath(migrationUrl), 'utf8');
const adminFunctionsUrl = new URL('../supabase/migrations/005_admin_user_access.sql', import.meta.url);
const adminFunctionsMigration = readFileSync(fileURLToPath(adminFunctionsUrl), 'utf8');

describe('admin RLS migration contract', () => {
  it('replaces the premium-based historical write policy', () => {
    expect(migration).toMatch(/drop policy if exists "Admin write beneficios productos"/i);
    const productPolicies = migration.slice(migration.indexOf('drop policy if exists "Admin write beneficios productos"'));
    expect(productPolicies).not.toMatch(/access_mode/i);
  });

  it('defines insert, update and delete authorization from admin_users', () => {
    for (const command of ['insert', 'update', 'delete']) {
      expect(migration).toMatch(new RegExp(`as permissive for ${command} to authenticated`, 'i'));
      expect(migration).toMatch(new RegExp(`as restrictive for ${command} to public`, 'i'));
    }
    expect(migration.match(/from public\.admin_users/gi)).toHaveLength(10);
    expect(migration.match(/user_id = auth\.uid\(\)/gi)).toHaveLength(10);
  });

  it('requires admin membership for both old and new update rows', () => {
    const updatePolicy = migration.match(/create policy "Admin update beneficios productos"[\s\S]*?;/i)?.[0] ?? '';
    expect(updatePolicy).toMatch(/using\s*\([\s\S]*?from public\.admin_users[\s\S]*?\)/i);
    expect(updatePolicy).toMatch(/with check\s*\([\s\S]*?from public\.admin_users[\s\S]*?\)/i);
  });

  it('does not replace the public read policy', () => {
    expect(migration).not.toMatch(/drop policy[^;]*Public read beneficios productos/i);
    expect(migration).toMatch(/Admin read all beneficios productos[\s\S]*?for select to authenticated/i);
  });

  it('allows admins to read inactive products without expanding public reads', () => {
    expect(migration).toMatch(/Admin read all beneficios productos[\s\S]*?for select to authenticated[\s\S]*?from public\.admin_users/i);
    expect(migration).not.toMatch(/Admin read all beneficios productos[\s\S]*?access_mode/i);
    expect(migration).toMatch(/Public and admin guard read beneficios productos[\s\S]*?as restrictive for select to public[\s\S]*?active = true[\s\S]*?from public\.admin_users/i);
  });

  it('prevents client-side self-granting through admin_users', () => {
    for (const command of ['insert', 'update', 'delete']) {
      expect(migration).toMatch(new RegExp(`Block client ${command} admin users[\\s\\S]*?as restrictive for ${command} to public`, 'i'));
    }
    expect(migration).toMatch(/Block client insert admin users[\s\S]*?with check \(false\)/i);
    expect(migration).toMatch(/Block client update admin users[\s\S]*?using \(false\)\s+with check \(false\)/i);
    expect(migration).toMatch(/Block client delete admin users[\s\S]*?using \(false\)/i);
  });

  it('prevents users from self-promoting through profiles or subscriptions', () => {
    const userUpdateColumns = migration.match(/grant update \(([\s\S]*?)\) on table public\.users to authenticated/i)?.[1] ?? '';
    expect(migration).toMatch(/revoke update on table public\.users from public, anon, authenticated/i);
    expect(userUpdateColumns).toMatch(/news_opt_in_source/i);
    expect(userUpdateColumns).not.toMatch(/access_mode/i);
    expect(migration).toMatch(/Users can insert their own profile[\s\S]*?access_mode = 'free'/i);
    expect(migration).toMatch(/guard_user_access_mode[\s\S]*?new\.access_mode is distinct from old\.access_mode/i);

    expect(migration).toMatch(/Users can insert their own free subscription[\s\S]*?plan = 'free'[\s\S]*?coalesce\(is_active, false\) = false/i);
    expect(migration).toMatch(/Subscription update guard[\s\S]*?for update to public[\s\S]*?using \(false\)\s+with check \(false\)/i);
    expect(migration).toMatch(/Subscription delete guard[\s\S]*?for delete to public[\s\S]*?using \(false\)/i);
    expect(migration).toMatch(/guard_subscription_authorization[\s\S]*?new\.plan is distinct from old\.plan/i);
  });

  it('keeps the existing admin access RPCs SECURITY DEFINER and admin_users-gated', () => {
    for (const functionName of ['admin_list_user_access', 'admin_set_user_access']) {
      const functionDefinition = adminFunctionsMigration.match(
        new RegExp(`create or replace function public\\.${functionName}[\\s\\S]*?\\$\\$;`, 'i'),
      )?.[0] ?? '';
      expect(functionDefinition).toMatch(/security definer/i);
      expect(functionDefinition).toMatch(/set search_path = public/i);
      expect(functionDefinition).toMatch(/from public\.admin_users au where au\.user_id = auth\.uid\(\)/i);
    }
  });
});