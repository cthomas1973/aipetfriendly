export type PetSex = 'male' | 'female' | 'unknown';

export type ClinicalEntryCategory =
  | 'medication'
  | 'deworming'
  | 'vaccine'
  | 'treatment'
  | 'clinical_note';

export type SubscriptionPlan = 'free' | 'premium';

export type AppTab = 'pets' | 'clinical' | 'agenda' | 'offers' | 'subscription';

export type Species = 'dog' | 'cat' | 'other';

export type PreventiveCategory =
  | 'vaccine'
  | 'deworming'
  | 'appointment'
  | 'feeding'
  | 'other';

export interface Pet {
  id: string;
  userId: string;
  name: string;
  breed: string;
  species: Species;
  sex: PetSex;
  birthDate?: string;
  ageYears: number;
  ageMonths: number;
  weightKg: number;
  photoUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PetFormData {
  name: string;
  breed: string;
  species: Species;
  sex: PetSex;
  birthDate: string;
  ageYears: number;
  ageMonths: number;
  weightKg: number;
  photoUrl?: string;
  notes?: string;
}

export interface MedicationFormData {
  petId: string;
  medicationName: string;
  dose: string;
  route?: string;
  startDate: string;
  endDate?: string;
  frequency?: string;
  veterinarian?: string;
  notes?: string;
}

export interface PreventiveFormData {
  petId: string;
  title: string;
  category: PreventiveCategory;
  dueDate: string;
  completed: boolean;
  notes?: string;
}

export interface PreventiveTask extends PreventiveFormData {
  id: string;
  createdAt: string;
}

export interface ClinicalNoteFormData {
  petId: string;
  title: string;
  content: string;
  category: ClinicalEntryCategory;
  eventDate: string;
}

export interface ClinicalTimelineEntry {
  id: string;
  petId: string;
  category: ClinicalEntryCategory;
  title: string;
  description: string;
  eventDate: string;
  createdAt: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface ChatMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface DailyAiUsage {
  date: string;
  count: number;
}

export interface UserSubscription {
  plan: SubscriptionPlan;
  isActive: boolean;
  expiresAt?: string | null;
}

export interface AppUser {
  id: string;
  email: string;
  fullName?: string;
  avatarUrl?: string;
  wantsNewsletter?: boolean;
  subscription: UserSubscription;
}

export interface SubscriptionState {
  isPremiumUser: boolean;
  isSubscribed: boolean;
  canAddPet: boolean;
  canUseAI: boolean;
  freePetLimit: number;
  freeAiDailyLimit: number;
}
