export type SubscriptionExpiry =
  | { kind: 'none' }
  | { kind: 'valid'; epochMs: number }
  | { kind: 'invalid' };

export type PremiumAccessInput = {
  accessMode?: string | null;
  subscription?: {
    plan?: unknown;
    isActive?: unknown;
    expiresAt?: unknown;
    graceUntil?: unknown;
    cancelRequestedAt?: unknown;
  } | null;
};

export type AccessState = 'guest' | 'premium' | 'grace' | 'canceled_pending' | 'free';

export function parseSubscriptionExpiry(value: unknown): SubscriptionExpiry;
export function isPremiumEffective(input: PremiumAccessInput, nowMs?: number): boolean;
export function resolveAccessState(input: PremiumAccessInput, nowMs?: number): AccessState;
export function isPremiumOrGraceEffective(input: PremiumAccessInput, nowMs?: number): boolean;
