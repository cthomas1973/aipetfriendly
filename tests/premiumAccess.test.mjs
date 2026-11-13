import { describe, expect, it } from 'vitest';
import {
  isPremiumEffective,
  isPremiumOrGraceEffective,
  parseSubscriptionExpiry,
  resolveAccessState,
} from '../supabase/functions/_shared/premiumAccess.mjs';

const NOW = Date.UTC(2026, 4, 15, 12, 0, 0); // 2026-05-15T12:00:00Z

const premium = (expiresAt, extra = {}) => ({
  accessMode: 'premium',
  subscription: { plan: 'premium', isActive: true, expiresAt, ...extra },
});

describe('parseSubscriptionExpiry', () => {
  it('null/undefined => sin vencimiento', () => {
    expect(parseSubscriptionExpiry(null)).toEqual({ kind: 'none' });
    expect(parseSubscriptionExpiry(undefined)).toEqual({ kind: 'none' });
  });

  it('acepta formatos ISO y Postgres con zona explicita', () => {
    expect(parseSubscriptionExpiry('2026-05-15T12:00:00Z')).toEqual({ kind: 'valid', epochMs: NOW });
    expect(parseSubscriptionExpiry('2026-05-15T12:00:00.000Z')).toEqual({ kind: 'valid', epochMs: NOW });
    expect(parseSubscriptionExpiry('2026-05-15 12:00:00+00')).toEqual({ kind: 'valid', epochMs: NOW });
    expect(parseSubscriptionExpiry('2026-05-15 12:00:00.123456+00:00')).toEqual({ kind: 'valid', epochMs: NOW + 123 });
    expect(parseSubscriptionExpiry('2026-05-15T09:00:00-03:00')).toEqual({ kind: 'valid', epochMs: NOW });
    expect(parseSubscriptionExpiry('2026-05-15T17:30:00+0530')).toEqual({ kind: 'valid', epochMs: NOW });
  });

  it('rechaza fechas invalidas, ambiguas o imposibles', () => {
    for (const value of [
      '',
      'no-es-fecha',
      '2026-05-15',
      '2026-05-15T12:00:00',
      '2026-02-30T12:00:00Z',
      '2026-13-01T00:00:00Z',
      '2026-05-15T24:00:00Z',
      '2026-05-15T12:00:00+25:00',
      12345,
      {},
    ]) {
      expect(parseSubscriptionExpiry(value)).toEqual({ kind: 'invalid' });
    }
  });
});

describe('isPremiumEffective', () => {
  it('Premium activo sin vencimiento (recurrente / alta admin)', () => {
    expect(isPremiumEffective(premium(null), NOW)).toBe(true);
    expect(isPremiumEffective(premium(undefined), NOW)).toBe(true);
  });

  it('Premium con vencimiento futuro', () => {
    expect(isPremiumEffective(premium('2026-06-14T12:00:00Z'), NOW)).toBe(true);
  });

  it('Premium vencido y limite exacto', () => {
    expect(isPremiumEffective(premium('2026-05-01T00:00:00Z'), NOW)).toBe(false);
    expect(isPremiumEffective(premium('2026-05-15T12:00:00Z'), NOW)).toBe(false);
    expect(isPremiumEffective(premium('2026-05-15T12:00:00.001Z'), NOW)).toBe(true);
  });

  it('cancelado o pausado (inactivo / free) no es Premium', () => {
    expect(isPremiumEffective(premium(null, { isActive: false }), NOW)).toBe(false);
    expect(isPremiumEffective({ accessMode: 'free', subscription: { plan: 'free', isActive: false, expiresAt: null } }, NOW)).toBe(false);
    expect(isPremiumEffective(premium(null, { plan: 'free' }), NOW)).toBe(false);
  });

  it('fecha invalida o sin zona horaria => falla cerrado', () => {
    expect(isPremiumEffective(premium('basura'), NOW)).toBe(false);
    expect(isPremiumEffective(premium('2027-01-01T00:00:00'), NOW)).toBe(false);
    expect(isPremiumEffective(premium('2027-02-30T00:00:00Z'), NOW)).toBe(false);
  });

  it('distintas zonas horarias del mismo instante dan el mismo resultado', () => {
    // 11:59:59Z (vencido) expresado en -03:00 y +09:00
    expect(isPremiumEffective(premium('2026-05-15T08:59:59-03:00'), NOW)).toBe(false);
    expect(isPremiumEffective(premium('2026-05-15T20:59:59+09:00'), NOW)).toBe(false);
    // 12:00:01Z (vigente) expresado en -03:00 y +09:00
    expect(isPremiumEffective(premium('2026-05-15T09:00:01-03:00'), NOW)).toBe(true);
    expect(isPremiumEffective(premium('2026-05-15T21:00:01+09:00'), NOW)).toBe(true);
  });

  it('access_mode premium no salva una suscripcion vencida', () => {
    expect(isPremiumEffective(premium('2026-01-01T00:00:00Z'), NOW)).toBe(false);
  });

  it('access_mode premium sin fila de suscripcion se respeta (alta admin sin vencimiento)', () => {
    expect(isPremiumEffective({ accessMode: 'premium', subscription: null }, NOW)).toBe(true);
  });

  it('guest, free o datos ausentes nunca son Premium', () => {
    expect(isPremiumEffective({ ...premium(null), accessMode: 'guest' }, NOW)).toBe(false);
    expect(isPremiumEffective({ ...premium(null), accessMode: 'free' }, NOW)).toBe(false);
    expect(isPremiumEffective({ subscription: null }, NOW)).toBe(false);
    expect(isPremiumEffective({}, NOW)).toBe(false);
    expect(isPremiumEffective(null, NOW)).toBe(false);
  });

  it('isActive debe ser estrictamente true', () => {
    expect(isPremiumEffective(premium(null, { isActive: 'true' }), NOW)).toBe(false);
    expect(isPremiumEffective(premium(null, { isActive: 1 }), NOW)).toBe(false);
  });

  it('sin accessMode (frontend ya resuelto) evalua solo la suscripcion', () => {
    expect(isPremiumEffective({ subscription: { plan: 'premium', isActive: true, expiresAt: null } }, NOW)).toBe(true);
    expect(isPremiumEffective({ subscription: { plan: 'premium', isActive: true, expiresAt: '2026-01-01T00:00:00Z' } }, NOW)).toBe(false);
  });

  it('usa Date.now() por defecto y rechaza un now invalido', () => {
    expect(isPremiumEffective(premium('2999-01-01T00:00:00Z'))).toBe(true);
    expect(isPremiumEffective(premium('2000-01-01T00:00:00Z'))).toBe(false);
    expect(isPremiumEffective(premium(null), Number.NaN)).toBe(false);
  });
});

// Helpers para estados Fase 7. PAST/FUTURE relativos a NOW (2026-05-15T12:00:00Z).
const FUTURE = '2026-05-22T12:00:00Z';
const PAST = '2026-05-08T12:00:00Z';

const withSub = (sub, accessMode = 'premium') => ({
  accessMode,
  subscription: sub,
});

describe('resolveAccessState', () => {
  it('premium vigente (recurrente sin vencimiento y con vencimiento futuro)', () => {
    expect(resolveAccessState(premium(null), NOW)).toBe('premium');
    expect(resolveAccessState(premium(FUTURE), NOW)).toBe('premium');
    // Alta admin sin fila de suscripcion.
    expect(resolveAccessState({ accessMode: 'premium', subscription: null }, NOW)).toBe('premium');
  });

  it('premium vencido sin gracia ni cancelacion => free', () => {
    expect(resolveAccessState(premium(PAST), NOW)).toBe('free');
  });

  it('gracia vigente: solo con graceUntil explicito y futuro', () => {
    const graced = withSub({ plan: 'premium', isActive: false, expiresAt: PAST, graceUntil: FUTURE });
    expect(resolveAccessState(graced, NOW)).toBe('grace');
    // Tambien si is_active sigue true pero expiro el periodo pagado.
    const gracedActive = withSub({ plan: 'premium', isActive: true, expiresAt: PAST, graceUntil: FUTURE });
    expect(resolveAccessState(gracedActive, NOW)).toBe('grace');
    // Sin accessMode (contexto frontend ya resuelto) tambien aplica.
    expect(resolveAccessState({ subscription: { plan: 'premium', isActive: false, expiresAt: PAST, graceUntil: FUTURE } }, NOW)).toBe('grace');
  });

  it('gracia vencida => free', () => {
    const expiredGrace = withSub({ plan: 'premium', isActive: false, expiresAt: PAST, graceUntil: PAST });
    expect(resolveAccessState(expiredGrace, NOW)).toBe('free');
  });

  it('la gracia no se infiere: sin graceUntil no hay gracia aunque el pago haya fallado', () => {
    const rejectedNoGrace = withSub({ plan: 'premium', isActive: false, expiresAt: PAST });
    expect(resolveAccessState(rejectedNoGrace, NOW)).toBe('free');
    expect(resolveAccessState(withSub({ plan: 'premium', isActive: false, expiresAt: PAST, graceUntil: null }), NOW)).toBe('free');
  });

  it('gracia requiere plan premium y accessMode no degradado', () => {
    // Fila ya degradada a free por facturacion: la gracia no la revive.
    expect(resolveAccessState(withSub({ plan: 'free', isActive: false, expiresAt: null, graceUntil: FUTURE }), NOW)).toBe('free');
    // access_mode ya en free: fail closed.
    expect(resolveAccessState(withSub({ plan: 'premium', isActive: false, expiresAt: PAST, graceUntil: FUTURE }, 'free'), NOW)).toBe('free');
  });

  it('cancelacion voluntaria con periodo pagado vigente => canceled_pending', () => {
    const canceled = withSub({ plan: 'premium', isActive: true, expiresAt: FUTURE, cancelRequestedAt: PAST });
    expect(resolveAccessState(canceled, NOW)).toBe('canceled_pending');
    // Sin expiresAt (facturacion incompleta) mantiene acceso como canceled_pending.
    const canceledNoExpiry = withSub({ plan: 'premium', isActive: true, expiresAt: null, cancelRequestedAt: PAST });
    expect(resolveAccessState(canceledNoExpiry, NOW)).toBe('canceled_pending');
  });

  it('cancelacion con periodo pagado vencido => free, sin gracia aunque graceUntil exista', () => {
    const canceledExpired = withSub({ plan: 'premium', isActive: true, expiresAt: PAST, cancelRequestedAt: PAST });
    expect(resolveAccessState(canceledExpired, NOW)).toBe('free');
    const canceledWithGrace = withSub({ plan: 'premium', isActive: false, expiresAt: PAST, cancelRequestedAt: PAST, graceUntil: FUTURE });
    expect(resolveAccessState(canceledWithGrace, NOW)).toBe('free');
  });

  it('cancelRequestedAt invalido se ignora (es metadato, no concede ni quita acceso)', () => {
    expect(resolveAccessState(withSub({ plan: 'premium', isActive: true, expiresAt: FUTURE, cancelRequestedAt: 'basura' }), NOW)).toBe('premium');
    expect(resolveAccessState(withSub({ plan: 'premium', isActive: false, expiresAt: PAST, cancelRequestedAt: 'basura', graceUntil: FUTURE }), NOW)).toBe('grace');
  });

  it('guest conserva comportamiento actual, incluso con datos premium o gracia', () => {
    expect(resolveAccessState({ accessMode: 'guest', subscription: null }, NOW)).toBe('guest');
    expect(resolveAccessState({ ...premium(FUTURE), accessMode: 'guest' }, NOW)).toBe('guest');
    expect(resolveAccessState(withSub({ plan: 'premium', isActive: false, expiresAt: PAST, graceUntil: FUTURE }, 'guest'), NOW)).toBe('guest');
  });

  it('fechas invalidas fallan cerrado', () => {
    expect(resolveAccessState(premium('2027-01-01T00:00:00'), NOW)).toBe('free');
    expect(resolveAccessState(withSub({ plan: 'premium', isActive: false, expiresAt: PAST, graceUntil: 'no-es-fecha' }), NOW)).toBe('free');
    expect(resolveAccessState(withSub({ plan: 'premium', isActive: false, expiresAt: PAST, graceUntil: '2026-06-01T00:00:00' }), NOW)).toBe('free');
    expect(resolveAccessState(withSub({ plan: 'premium', isActive: false, expiresAt: PAST, graceUntil: 12345 }), NOW)).toBe('free');
  });

  it('zonas horarias: el mismo instante de graceUntil da el mismo estado', () => {
    // 12:00:01Z (vigente) expresado en -03:00 y +09:00.
    expect(resolveAccessState(withSub({ plan: 'premium', isActive: false, expiresAt: PAST, graceUntil: '2026-05-15T09:00:01-03:00' }), NOW)).toBe('grace');
    expect(resolveAccessState(withSub({ plan: 'premium', isActive: false, expiresAt: PAST, graceUntil: '2026-05-15T21:00:01+09:00' }), NOW)).toBe('grace');
    // 11:59:59Z (vencido) expresado en -03:00.
    expect(resolveAccessState(withSub({ plan: 'premium', isActive: false, expiresAt: PAST, graceUntil: '2026-05-15T08:59:59-03:00' }), NOW)).toBe('free');
  });

  it('limites exactos de vencimiento (estricto: en el instante exacto ya no hay acceso)', () => {
    const AT_NOW = '2026-05-15T12:00:00Z';
    const JUST_AFTER = '2026-05-15T12:00:00.001Z';
    expect(resolveAccessState(premium(AT_NOW), NOW)).toBe('free');
    expect(resolveAccessState(premium(JUST_AFTER), NOW)).toBe('premium');
    expect(resolveAccessState(withSub({ plan: 'premium', isActive: false, expiresAt: PAST, graceUntil: AT_NOW }), NOW)).toBe('free');
    expect(resolveAccessState(withSub({ plan: 'premium', isActive: false, expiresAt: PAST, graceUntil: JUST_AFTER }), NOW)).toBe('grace');
    expect(resolveAccessState(withSub({ plan: 'premium', isActive: true, expiresAt: AT_NOW, cancelRequestedAt: PAST }), NOW)).toBe('free');
    expect(resolveAccessState(withSub({ plan: 'premium', isActive: true, expiresAt: JUST_AFTER, cancelRequestedAt: PAST }), NOW)).toBe('canceled_pending');
  });

  it('conflictos entre access_mode y subscriptions fallan cerrado', () => {
    // access_mode free con suscripcion premium activa => free.
    expect(resolveAccessState(withSub({ plan: 'premium', isActive: true, expiresAt: null }, 'free'), NOW)).toBe('free');
    // access_mode premium con plan free => free.
    expect(resolveAccessState(withSub({ plan: 'free', isActive: true, expiresAt: null }), NOW)).toBe('free');
    // access_mode premium con suscripcion inactiva => free.
    expect(resolveAccessState(withSub({ plan: 'premium', isActive: false, expiresAt: null }), NOW)).toBe('free');
  });

  it('entrada o now invalidos => free (nunca lanza)', () => {
    expect(resolveAccessState(null, NOW)).toBe('free');
    expect(resolveAccessState({}, NOW)).toBe('free');
    expect(resolveAccessState(premium(null), Number.NaN)).toBe('free');
    // guest se resuelve antes que la validacion de now (no depende del tiempo).
    expect(resolveAccessState({ accessMode: 'guest' }, Number.NaN)).toBe('guest');
  });

  it('usa Date.now() por defecto', () => {
    expect(resolveAccessState(premium('2999-01-01T00:00:00Z'))).toBe('premium');
    expect(resolveAccessState(premium('2000-01-01T00:00:00Z'))).toBe('free');
  });
});

describe('isPremiumOrGraceEffective', () => {
  it('true para premium, canceled_pending y grace; false para guest y free', () => {
    expect(isPremiumOrGraceEffective(premium(FUTURE), NOW)).toBe(true);
    expect(isPremiumOrGraceEffective(withSub({ plan: 'premium', isActive: true, expiresAt: FUTURE, cancelRequestedAt: PAST }), NOW)).toBe(true);
    expect(isPremiumOrGraceEffective(withSub({ plan: 'premium', isActive: false, expiresAt: PAST, graceUntil: FUTURE }), NOW)).toBe(true);
    expect(isPremiumOrGraceEffective({ accessMode: 'guest', subscription: null }, NOW)).toBe(false);
    expect(isPremiumOrGraceEffective(premium(PAST), NOW)).toBe(false);
    expect(isPremiumOrGraceEffective(null, NOW)).toBe(false);
  });

  it('coincide con isPremiumEffective cuando no hay gracia ni cancelacion', () => {
    for (const input of [premium(null), premium(FUTURE), premium(PAST), { accessMode: 'free', subscription: null }]) {
      expect(isPremiumOrGraceEffective(input, NOW)).toBe(isPremiumEffective(input, NOW));
    }
  });
});
