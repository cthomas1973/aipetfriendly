import type { AccessState, PremiumAccessInput } from './premiumAccess.d.mts';

export type PetAccessTier = 'guest' | 'premium' | 'free';

export type PetAccessReason =
  | 'guest_mode'
  | 'full_access'
  | 'pre_067'
  | 'single_pet'
  | 'active_pet'
  | 'not_owner'
  | 'selection_required'
  | 'protected_pet'
  | 'invalid_input';

export interface PetAccessDecision {
  allowed: boolean;
  tier: PetAccessTier;
  accessState: AccessState;
  reason: PetAccessReason;
}

export interface PetWriteAccessInput {
  userId: unknown;
  profileRow: Record<string, unknown> | null | undefined;
  subscriptionRow: Record<string, unknown> | null | undefined;
  petId: unknown;
  petOwnerId: unknown;
  petCount: unknown;
}

export function buildAccessInput(
  profileRow: Record<string, unknown> | null | undefined,
  subscriptionRow: Record<string, unknown> | null | undefined,
): PremiumAccessInput;
export function detectActivePetSupport(profileRow: Record<string, unknown> | null | undefined): boolean;
export function resolvePetWriteAccess(input: PetWriteAccessInput, nowMs?: number): PetAccessDecision;
export const PET_ACCESS_DENIED_MESSAGES: {
  not_owner: string;
  selection_required: string;
  protected_pet: string;
  invalid_input: string;
};
