export type PetSex = 'male' | 'female' | 'unknown';

export type OfferGrupo = 'alimentos' | 'accesorios' | 'higiene' | 'descanso';
export type PetType = 'perro' | 'gato' | 'otro';
export type PetLifeStage = 'cachorro' | 'adulto' | 'senior' | 'todas';
export type PetSizeCategory = 'pequeño' | 'mediano' | 'grande' | 'todos';

export interface BeneficioProducto {
  id: string;
  url_ml: string;
  mla_id: string;
  permalink: string;
  title: string;
  thumbnail: string | null;
  price: number | null;
  grupo: OfferGrupo;
  pet_types: PetType[];
  life_stages: PetLifeStage[];
  size_categories: PetSizeCategory[];
  free_shipping: boolean;
  fast_delivery: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type ClinicalEntryCategory =
  | 'medication'
  | 'deworming'
  | 'vaccine'
  | 'treatment'
  | 'clinical_note';

export type SubscriptionPlan = 'free' | 'premium';
export type UserAccessLevel = 'guest' | 'free' | 'premium';

export type AppTab = 'pets' | 'clinical' | 'agenda' | 'map' | 'offers' | 'subscription' | 'admin';

export type Species = 'dog' | 'cat' | 'other';

export type PreventiveCategory =
  | 'medication'
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
  dose?: string;
  frequency?: string;
  scheduleTimes?: string[];
  startDate?: string;
  endDate?: string;
  durationDays?: number;
  remindersEnabled?: boolean;
  appointmentReason?: string;
  appointmentTime?: string;
  appointmentLocation?: string;
  appointmentReference?: string;
  notificationLeadTime?: string;
  notificationChannels?: string[];
  notificationEmail?: string;
  notificationPhone?: string;
  createClinicalEntry?: boolean;
  foodBrand?: string;
  foodVariety?: string;
  foodBagWeightKg?: number;
  foodPurchaseDate?: string;
  foodPurchaseGroupId?: string;
  foodSharedPetIds?: string[];
  foodAppliesToPetsCount?: number;
  foodEstimatedDailyKgTotal?: number;
  foodEstimatedDailyKgPerPet?: number;
  foodEstimatedDurationDays?: number;
  foodPreviousPurchaseDate?: string;
  foodUseAsDefaultNext?: boolean;
  foodEntryType?: 'purchase' | 'reminder';
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
  petId?: string | null;
  createdAt: string;
}

export interface AiUsageSettings {
  guestLimitPerPet: number;
  freeLimitPerPet: number;
  premiumLimitPerPet: number;
}

export interface BillingPricingSettings {
  premiumMonthlyAutoArs: number;
  premiumMonthlyAutoUsd: number;
  premiumAnnualAutoArs: number;
  premiumAnnualAutoUsd: number;
  premiumMonthlyManualArs: number;
  premiumMonthlyManualUsd: number;
}

export interface PetAiUsageRow {
  petId: string;
  usageCount: number;
}

export interface AdminAiAuditEntry {
  createdAt: string;
  userEmail: string;
  petName: string;
  tier: UserAccessLevel;
  model?: string;
  estimatedTotalTokens: number;
  questionChars: number;
  answerChars: number;
}

export interface AdminAiDashboardMetrics {
  consultasHoy: number;
  consultas7d: number;
  tokens7d: number;
  percentLimitesAgotados: number;
  topMascotas: Array<{
    petName: string;
    count: number;
  }>;
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
  whatsappPhone?: string;
  whatsappOptIn?: boolean;
  whatsappOptInAt?: string | null;
  whatsappOptInSource?: string | null;
  subscription: UserSubscription;
  isGuest?: boolean;
  isAdmin?: boolean;
}

export interface AdminUserRow {
  id: string;
  email: string;
  fullName?: string;
  access: UserAccessLevel;
  subscriptionPlan: SubscriptionPlan;
  subscriptionActive: boolean;
  createdAt: string;
}

export interface SubscriptionState {
  isPremiumUser: boolean;
  isSubscribed: boolean;
  canAddPet: boolean;
  canUseAI: boolean;
  freePetLimit: number;
  freeAiDailyLimit: number;
}
