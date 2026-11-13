// Pruebas de la decision de acceso server-side usada por pet-ai-chat
// (supabase/functions/_shared/petAccessServer.mjs).
//
// IMPORTANTE: son pruebas unitarias de la logica de decision. NO sustituyen a
// las pruebas reales de RLS/PostgreSQL (supabase/tests/068) ni validan el
// despliegue de la Edge Function en Deno.
import { describe, expect, it } from 'vitest';
import {
  PET_ACCESS_DENIED_MESSAGES,
  buildAccessInput,
  detectActivePetSupport,
  resolvePetWriteAccess,
} from '../supabase/functions/_shared/petAccessServer.mjs';

const NOW = Date.UTC(2026, 4, 15, 12, 0, 0); // 2026-05-15T12:00:00Z
const FUTURE = '2026-05-22T12:00:00Z';
const PAST = '2026-05-08T12:00:00Z';

const USER = 'user-1';
const PET_A = 'pet-a';
const PET_B = 'pet-b';

// Fila post-067 (expone active_pet_id aunque sea null).
const profile067 = (overrides = {}) => ({
  id: USER,
  access_mode: 'free',
  full_name: 'Tutor',
  active_pet_id: null,
  active_pet_changed_at: null,
  ...overrides,
});

// Fila pre-067 (la columna active_pet_id NO existe).
const profilePre067 = (overrides = {}) => ({
  id: USER,
  access_mode: 'free',
  full_name: 'Tutor',
  ...overrides,
});

const subPremium = (overrides = {}) => ({
  plan: 'premium', is_active: true, expires_at: null, grace_until: null, cancel_requested_at: null, ...overrides,
});
const subFree = { plan: 'free', is_active: true, expires_at: null, grace_until: null, cancel_requested_at: null };

const base = (overrides = {}) => ({
  userId: USER,
  profileRow: profile067(),
  subscriptionRow: subFree,
  petId: PET_A,
  petOwnerId: USER,
  petCount: 2,
  ...overrides,
});

describe('resolvePetWriteAccess - acceso completo', () => {
  it('premium con varias mascotas: todas permitidas', () => {
    const d = resolvePetWriteAccess(base({
      profileRow: profile067({ access_mode: 'premium' }),
      subscriptionRow: subPremium(),
      petId: PET_B,
      petCount: 5,
    }), NOW);
    expect(d).toMatchObject({ allowed: true, reason: 'full_access', tier: 'premium', accessState: 'premium' });
  });

  it('gracia vigente: acceso completo temporal', () => {
    const d = resolvePetWriteAccess(base({
      profileRow: profile067({ access_mode: 'premium' }),
      subscriptionRow: subPremium({ is_active: false, expires_at: PAST, grace_until: FUTURE }),
    }), NOW);
    expect(d).toMatchObject({ allowed: true, reason: 'full_access', tier: 'premium', accessState: 'grace' });
  });

  it('gracia vencida: cae a free y aplica proteccion', () => {
    const d = resolvePetWriteAccess(base({
      profileRow: profile067({ access_mode: 'premium' }),
      subscriptionRow: subPremium({ is_active: false, expires_at: PAST, grace_until: PAST }),
      petId: PET_B,
    }), NOW);
    expect(d).toMatchObject({ allowed: false, reason: 'selection_required', tier: 'free' });
  });

  it('cancelacion pendiente con periodo vigente: acceso completo', () => {
    const d = resolvePetWriteAccess(base({
      profileRow: profile067({ access_mode: 'premium' }),
      subscriptionRow: subPremium({ expires_at: FUTURE, cancel_requested_at: PAST }),
    }), NOW);
    expect(d).toMatchObject({ allowed: true, reason: 'full_access', tier: 'premium', accessState: 'canceled_pending' });
  });

  it('cancelacion con periodo vencido: free (sin gracia)', () => {
    const d = resolvePetWriteAccess(base({
      profileRow: profile067({ access_mode: 'premium', active_pet_id: PET_A }),
      subscriptionRow: subPremium({ expires_at: PAST, cancel_requested_at: PAST, grace_until: FUTURE }),
      petId: PET_B,
    }), NOW);
    expect(d).toMatchObject({ allowed: false, reason: 'protected_pet', tier: 'free' });
  });

  it('el cliente no puede enviar un estado premium: solo cuentan las filas de la base', () => {
    // Un payload con "tier: premium" no existe en la firma; un access_mode
    // premium sin respaldo en subscriptions falla cerrado.
    const d = resolvePetWriteAccess(base({
      profileRow: profile067({ access_mode: 'premium' }),
      subscriptionRow: subFree, // la base dice free
      petId: PET_B,
    }), NOW);
    expect(d.allowed).toBe(false);
    expect(d.tier).toBe('free');
  });
});

describe('resolvePetWriteAccess - plan free post-067', () => {
  it('mascota activa: permitida', () => {
    const d = resolvePetWriteAccess(base({
      profileRow: profile067({ active_pet_id: PET_A }),
    }), NOW);
    expect(d).toMatchObject({ allowed: true, reason: 'active_pet', tier: 'free' });
  });

  it('mascota protegida: rechazada sin procesamiento', () => {
    const d = resolvePetWriteAccess(base({
      profileRow: profile067({ active_pet_id: PET_A }),
      petId: PET_B,
      petOwnerId: USER,
    }), NOW);
    expect(d).toMatchObject({ allowed: false, reason: 'protected_pet' });
  });

  it('unica mascota: fallback aprobado', () => {
    const d = resolvePetWriteAccess(base({ petCount: 1 }), NOW);
    expect(d).toMatchObject({ allowed: true, reason: 'single_pet', tier: 'free' });
  });

  it('varias mascotas sin seleccion: ninguna permitida', () => {
    const d = resolvePetWriteAccess(base({ petCount: 3 }), NOW);
    expect(d).toMatchObject({ allowed: false, reason: 'selection_required' });
  });

  it('un activePetId "falso" del cliente no participa: manda users.active_pet_id', () => {
    // El cliente dice que su activa es PET_B, pero la base dice PET_A.
    const d = resolvePetWriteAccess(base({
      profileRow: profile067({ active_pet_id: PET_A }),
      petId: PET_B,
      // Campos extra inventados por el cliente se ignoran por diseño:
      clientActivePetId: PET_B,
      tier: 'premium',
    }), NOW);
    expect(d).toMatchObject({ allowed: false, reason: 'protected_pet' });
  });
});

describe('resolvePetWriteAccess - compatibilidad pre-067', () => {
  it('free multi-mascota pre-067: sin proteccion (comportamiento previo)', () => {
    const d = resolvePetWriteAccess(base({
      profileRow: profilePre067(),
      petId: PET_B,
      petCount: 3,
    }), NOW);
    expect(d).toMatchObject({ allowed: true, reason: 'pre_067', tier: 'free' });
  });

  it('la ausencia de columnas 067 NUNCA otorga premium', () => {
    const d = resolvePetWriteAccess(base({
      profileRow: profilePre067(),
      subscriptionRow: { plan: 'premium', is_active: true, expires_at: PAST }, // premium vencido, sin columnas 067
    }), NOW);
    expect(d.tier).toBe('free');
    expect(d.accessState).toBe('free');
  });

  it('premium vigente pre-067 sigue siendo premium (columnas 067 ausentes en subscriptions)', () => {
    const d = resolvePetWriteAccess(base({
      profileRow: profilePre067({ access_mode: 'premium' }),
      subscriptionRow: { plan: 'premium', is_active: true, expires_at: null },
    }), NOW);
    expect(d).toMatchObject({ allowed: true, reason: 'full_access', tier: 'premium' });
  });
});

describe('resolvePetWriteAccess - identidad y falla cerrada', () => {
  it('mascota de otra persona: not_owner (aunque el cliente envie su propio userId)', () => {
    const d = resolvePetWriteAccess(base({ petOwnerId: 'otro-usuario' }), NOW);
    expect(d).toMatchObject({ allowed: false, reason: 'not_owner' });
  });

  it('sin usuario autenticado: denegado', () => {
    expect(resolvePetWriteAccess(base({ userId: null }), NOW).allowed).toBe(false);
    expect(resolvePetWriteAccess(base({ userId: '' }), NOW).reason).toBe('invalid_input');
  });

  it('datos de base faltantes (error de consulta): denegado, nunca acceso por defecto', () => {
    expect(resolvePetWriteAccess(base({ profileRow: null }), NOW).reason).toBe('invalid_input');
    expect(resolvePetWriteAccess(base({ petId: null }), NOW).reason).toBe('invalid_input');
    // post-067 sin conteo de mascotas valido => denegado (no se puede aplicar la regla)
    expect(resolvePetWriteAccess(base({ petCount: undefined }), NOW).reason).toBe('invalid_input');
    expect(resolvePetWriteAccess(base({ petCount: Number.NaN }), NOW).reason).toBe('invalid_input');
    expect(resolvePetWriteAccess(base({ petCount: 0 }), NOW).reason).toBe('invalid_input');
  });

  it('now invalido: denegado', () => {
    expect(resolvePetWriteAccess(base(), Number.NaN).allowed).toBe(false);
  });

  it('entrada nula: denegado', () => {
    expect(resolvePetWriteAccess(null, NOW).allowed).toBe(false);
  });
});

describe('resolvePetWriteAccess - modo visitante', () => {
  it('access_mode guest conserva el comportamiento historico (tier guest)', () => {
    const d = resolvePetWriteAccess(base({
      profileRow: profile067({ access_mode: 'guest' }),
      subscriptionRow: null,
      petCount: 4,
      petId: PET_B,
    }), NOW);
    expect(d).toMatchObject({ allowed: true, reason: 'guest_mode', tier: 'guest', accessState: 'guest' });
  });
});

describe('helpers', () => {
  it('detectActivePetSupport detecta la columna aunque sea null', () => {
    expect(detectActivePetSupport(profile067())).toBe(true);
    expect(detectActivePetSupport(profilePre067())).toBe(false);
    expect(detectActivePetSupport(null)).toBe(false);
  });

  it('buildAccessInput mapea tolerante a columnas ausentes', () => {
    expect(buildAccessInput(profilePre067(), { plan: 'premium', is_active: true, expires_at: null })).toEqual({
      accessMode: 'free',
      subscription: { plan: 'premium', isActive: true, expiresAt: null, graceUntil: null, cancelRequestedAt: null },
    });
    expect(buildAccessInput(null, null)).toEqual({ accessMode: null, subscription: null });
  });

  it('mensajes de denegacion definidos para cada razon visible', () => {
    expect(PET_ACCESS_DENIED_MESSAGES.not_owner).toBeTruthy();
    expect(PET_ACCESS_DENIED_MESSAGES.selection_required).toBeTruthy();
    expect(PET_ACCESS_DENIED_MESSAGES.protected_pet).toBeTruthy();
    expect(PET_ACCESS_DENIED_MESSAGES.invalid_input).toBeTruthy();
  });
});
