import { describe, expect, it } from 'vitest';
import {
  ACTIVE_PET_COOLDOWN_DAYS,
  PET_ACCESS_MESSAGES,
  activePetCooldownUntil,
  assertPetWritable,
  canChangeActivePet,
  hasFullAccess,
  isPetEditable,
  isRecoveryOnlyPetUpdate,
  needsActivePetSelection,
  posterAccessError,
  recoveryOnlyPetUpdate,
  resolveUserAccessState,
  tagRequestAccessError,
} from './petAccess';
import type { AccessState, AppUser, Pet } from '../types';

const NOW = Date.UTC(2026, 4, 15, 12, 0, 0); // 2026-05-15T12:00:00Z
const FUTURE = '2026-05-22T12:00:00Z';
const PAST = '2026-05-08T12:00:00Z';

const baseUser = (overrides: Partial<AppUser> = {}): AppUser => ({
  id: 'user-1',
  email: 'user@example.test',
  subscription: { plan: 'free', isActive: true, expiresAt: null },
  ...overrides,
});

const basePet = (overrides: Partial<Pet> = {}): Pet => ({
  id: 'pet-1',
  userId: 'user-1',
  name: 'Luna',
  breed: 'Mestizo',
  species: 'dog',
  sex: 'female',
  ageYears: 3,
  ageMonths: 0,
  weightKg: 10,
  publicCode: 'ABC12345',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('resolveUserAccessState', () => {
  it('sin usuario o visitante => guest (comportamiento actual intacto)', () => {
    expect(resolveUserAccessState(null, NOW)).toBe('guest');
    expect(resolveUserAccessState(baseUser({ isGuest: true }), NOW)).toBe('guest');
    // guest gana incluso si trae datos premium residuales
    expect(resolveUserAccessState(baseUser({ isGuest: true, accessState: 'premium' }), NOW)).toBe('guest');
  });

  it('usa el accessState calculado por fetchUserProfile cuando esta presente', () => {
    for (const state of ['premium', 'grace', 'canceled_pending', 'free'] as AccessState[]) {
      expect(resolveUserAccessState(baseUser({ accessState: state }), NOW)).toBe(state);
    }
  });

  it('fallback: deriva de la suscripcion visible con la regla compartida', () => {
    expect(resolveUserAccessState(baseUser({ subscription: { plan: 'premium', isActive: true, expiresAt: null } }), NOW)).toBe('premium');
    expect(resolveUserAccessState(baseUser({ subscription: { plan: 'premium', isActive: true, expiresAt: FUTURE } }), NOW)).toBe('premium');
    // premium vencido detectado tambien en el fallback (deriva temporal)
    expect(resolveUserAccessState(baseUser({ subscription: { plan: 'premium', isActive: true, expiresAt: PAST } }), NOW)).toBe('free');
    expect(resolveUserAccessState(baseUser(), NOW)).toBe('free');
  });

  it('fallback: gracia vigente y vencida', () => {
    expect(resolveUserAccessState(baseUser({
      subscription: { plan: 'premium', isActive: false, expiresAt: PAST, graceUntil: FUTURE },
    }), NOW)).toBe('grace');
    expect(resolveUserAccessState(baseUser({
      subscription: { plan: 'premium', isActive: false, expiresAt: PAST, graceUntil: PAST },
    }), NOW)).toBe('free');
  });

  it('fallback: cancelacion con periodo pagado vigente y vencido', () => {
    expect(resolveUserAccessState(baseUser({
      subscription: { plan: 'premium', isActive: true, expiresAt: FUTURE, cancelRequestedAt: PAST },
    }), NOW)).toBe('canceled_pending');
    expect(resolveUserAccessState(baseUser({
      subscription: { plan: 'premium', isActive: true, expiresAt: PAST, cancelRequestedAt: PAST },
    }), NOW)).toBe('free');
  });
});

describe('hasFullAccess', () => {
  it('premium, grace y canceled_pending tienen acceso completo; free y guest no', () => {
    expect(hasFullAccess('premium')).toBe(true);
    expect(hasFullAccess('grace')).toBe(true);
    expect(hasFullAccess('canceled_pending')).toBe(true);
    expect(hasFullAccess('free')).toBe(false);
    expect(hasFullAccess('guest')).toBe(false);
  });
});

describe('isPetEditable (espejo de pet_is_writable de la 067)', () => {
  const base = { activePetSupport: true, activePetId: 'pet-1', petId: 'pet-1', petCount: 3 };

  it('acceso completo: todas las mascotas editables (recuperacion de Premium automatica)', () => {
    for (const accessState of ['premium', 'grace', 'canceled_pending'] as AccessState[]) {
      expect(isPetEditable({ ...base, accessState, petId: 'pet-2', activePetId: null })).toBe(true);
    }
  });

  it('guest conserva el comportamiento actual (todo editable, datos locales)', () => {
    expect(isPetEditable({ ...base, accessState: 'guest', petId: 'pet-9', activePetId: null })).toBe(true);
  });

  it('free pre-067 (sin soporte de columna): sin bloqueo', () => {
    expect(isPetEditable({ ...base, accessState: 'free', activePetSupport: false, petId: 'pet-9', activePetId: null })).toBe(true);
  });

  it('free con una unica mascota: editable sin seleccion explicita', () => {
    expect(isPetEditable({ ...base, accessState: 'free', petCount: 1, activePetId: null })).toBe(true);
  });

  it('free con varias mascotas y sin seleccion: ninguna editable', () => {
    expect(isPetEditable({ ...base, accessState: 'free', activePetId: null })).toBe(false);
    expect(isPetEditable({ ...base, accessState: 'free', activePetId: null, petId: 'pet-2' })).toBe(false);
  });

  it('free con mascota activa: solo la activa es editable', () => {
    expect(isPetEditable({ ...base, accessState: 'free' })).toBe(true);
    expect(isPetEditable({ ...base, accessState: 'free', petId: 'pet-2' })).toBe(false);
  });

  it('eliminada la activa (activePetId null): vuelve el estado sin seleccion', () => {
    expect(isPetEditable({ ...base, accessState: 'free', activePetId: null, petCount: 2 })).toBe(false);
    // y si quedo una sola, el fallback la habilita
    expect(isPetEditable({ ...base, accessState: 'free', activePetId: null, petCount: 1 })).toBe(true);
  });
});

describe('needsActivePetSelection', () => {
  it('solo free + soporte 067 + varias mascotas + sin seleccion', () => {
    const base = { accessState: 'free' as AccessState, activePetSupport: true, activePetId: null, petCount: 3 };
    expect(needsActivePetSelection(base)).toBe(true);
    expect(needsActivePetSelection({ ...base, activePetId: 'pet-1' })).toBe(false);
    expect(needsActivePetSelection({ ...base, petCount: 1 })).toBe(false);
    expect(needsActivePetSelection({ ...base, activePetSupport: false })).toBe(false);
    expect(needsActivePetSelection({ ...base, accessState: 'premium' })).toBe(false);
    expect(needsActivePetSelection({ ...base, accessState: 'grace' })).toBe(false);
    expect(needsActivePetSelection({ ...base, accessState: 'guest' })).toBe(false);
  });
});

describe('cooldown de mascota activa (30 dias, espejo del trigger de la 067)', () => {
  it('sin timestamp o invalido: sin cooldown', () => {
    expect(activePetCooldownUntil(null, NOW)).toBe(null);
    expect(activePetCooldownUntil(undefined, NOW)).toBe(null);
    expect(activePetCooldownUntil('no-es-fecha', NOW)).toBe(null);
  });

  it('cambio reciente: cooldown vigente con fecha de fin exacta', () => {
    const changedAt = new Date(NOW - 10 * 24 * 60 * 60 * 1000).toISOString();
    const until = activePetCooldownUntil(changedAt, NOW);
    expect(until).not.toBe(null);
    expect(Date.parse(until as string)).toBe(Date.parse(changedAt) + ACTIVE_PET_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  });

  it('cambio viejo (>30 dias): sin cooldown', () => {
    const changedAt = new Date(NOW - 31 * 24 * 60 * 60 * 1000).toISOString();
    expect(activePetCooldownUntil(changedAt, NOW)).toBe(null);
  });

  it('canChangeActivePet respeta estado, soporte y cooldown', () => {
    const recent = new Date(NOW - 1 * 24 * 60 * 60 * 1000).toISOString();
    expect(canChangeActivePet({ accessState: 'free', activePetSupport: true, activePetChangedAt: recent }, NOW)).toBe(false);
    expect(canChangeActivePet({ accessState: 'free', activePetSupport: true, activePetChangedAt: null }, NOW)).toBe(true);
    expect(canChangeActivePet({ accessState: 'free', activePetSupport: false, activePetChangedAt: null }, NOW)).toBe(false);
    // con acceso completo el selector no aplica restricciones
    expect(canChangeActivePet({ accessState: 'premium', activePetSupport: true, activePetChangedAt: recent }, NOW)).toBe(true);
  });
});

describe('excepcion de recuperacion (foto y señas)', () => {
  it('acepta solo photoUrl / distinguishingMarks', () => {
    expect(isRecoveryOnlyPetUpdate({ photoUrl: 'x' })).toBe(true);
    expect(isRecoveryOnlyPetUpdate({ distinguishingMarks: 'mancha' })).toBe(true);
    expect(isRecoveryOnlyPetUpdate({ photoUrl: 'x', distinguishingMarks: 'mancha' })).toBe(true);
  });

  it('rechaza cambios mezclados o vacios', () => {
    expect(isRecoveryOnlyPetUpdate({ photoUrl: 'x', name: 'colada' })).toBe(false);
    expect(isRecoveryOnlyPetUpdate({ name: 'colada' })).toBe(false);
    expect(isRecoveryOnlyPetUpdate({})).toBe(false);
    // los undefined se ignoran (payloads parciales de formularios)
    expect(isRecoveryOnlyPetUpdate({ photoUrl: 'x', name: undefined })).toBe(true);
  });

  it('recoveryOnlyPetUpdate filtra el payload a los campos permitidos', () => {
    expect(recoveryOnlyPetUpdate({ photoUrl: 'x', distinguishingMarks: 'm', name: 'colada' } as Partial<Pet>)).toEqual({
      photoUrl: 'x',
      distinguishingMarks: 'm',
    });
  });
});

describe('carteles de busqueda (PDF e imagen) para Free', () => {
  it('usuario free con mascota propia y codigo publico: permitido', () => {
    expect(posterAccessError(baseUser(), basePet())).toBe(null);
  });

  it('sin sesion: denegado', () => {
    expect(posterAccessError(null, basePet())).toBe(PET_ACCESS_MESSAGES.posterNeedsSession);
  });

  it('mascota ajena: denegado', () => {
    expect(posterAccessError(baseUser(), basePet({ userId: 'otro' }))).toBe(PET_ACCESS_MESSAGES.posterNotOwnPet);
  });

  it('sin codigo publico (p. ej. mascota de visitante local): denegado', () => {
    expect(posterAccessError(baseUser(), basePet({ publicCode: undefined }))).toBe(PET_ACCESS_MESSAGES.posterNeedsCode);
  });
});

describe('requestTag sigue siendo Premium', () => {
  it('free: denegado con mensaje de Premium', () => {
    expect(tagRequestAccessError(baseUser(), false)).toBe(PET_ACCESS_MESSAGES.tagNeedsPremium);
  });

  it('premium (incluye gracia y cancelacion pendiente via isPremiumUser): permitido', () => {
    expect(tagRequestAccessError(baseUser(), true)).toBe(null);
  });

  it('visitante o sin sesion: requiere cuenta', () => {
    expect(tagRequestAccessError(baseUser({ isGuest: true }), false)).toBe(PET_ACCESS_MESSAGES.tagNeedsSession);
    expect(tagRequestAccessError(null, false)).toBe(PET_ACCESS_MESSAGES.tagNeedsSession);
  });
});

describe('assertPetWritable (guarda de historia clinica, agenda, peso y chat)', () => {
  const protectedSub = { isPetEditable: (petId: string) => petId === 'activa' };

  it('bloquea escrituras sobre mascotas protegidas con mensaje empatico', () => {
    expect(() => assertPetWritable(protectedSub, 'protegida')).toThrowError(PET_ACCESS_MESSAGES.protectedPetWrite);
    expect(() => assertPetWritable(protectedSub, 'protegida', PET_ACCESS_MESSAGES.protectedPetChat))
      .toThrowError(PET_ACCESS_MESSAGES.protectedPetChat);
  });

  it('permite la mascota activa y los flujos sin mascota', () => {
    expect(() => assertPetWritable(protectedSub, 'activa')).not.toThrow();
    expect(() => assertPetWritable(protectedSub, null)).not.toThrow();
    expect(() => assertPetWritable(protectedSub, undefined)).not.toThrow();
  });
});
