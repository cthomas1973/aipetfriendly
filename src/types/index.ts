export type PetSex = 'male' | 'female' | 'unknown';

export type OfferGrupo = 'alimentos' | 'accesorios' | 'higiene' | 'descanso' | 'salud' | 'tecnologia';
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

export type VeterinaryStatus = 'IN_INCUBATOR' | 'CLAIMABLE_PROFILE' | 'ACTIVE_FREE' | 'ACTIVE_PREMIUM' | 'REJECTED';

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
  distinguishingMarks?: string;
  publicCode?: string;
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
  distinguishingMarks?: string;
}

export type PetSightingSource = 'cartel' | 'chapita';

export interface PetSightingMessage {
  id: string;
  petId: string;
  source: PetSightingSource;
  message?: string;
  contactInfo?: string;
  latitude?: number;
  longitude?: number;
  readAt?: string;
  createdAt: string;
}

export type PetTagRequestStatus =
  | 'requested'
  | 'pending_payment'
  | 'stl_generated'
  | 'printed'
  | 'shipped'
  | 'linked'
  | 'cancelled';

export interface PetTagRequest {
  id: string;
  petId: string;
  userId: string;
  status: PetTagRequestStatus;
  shippingAddress?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPetTagRequestRow {
  id: string;
  petId: string;
  petName: string;
  petPublicCode: string;
  userId: string;
  userEmail: string;
  userFullName?: string;
  userWhatsappPhone?: string;
  status: PetTagRequestStatus;
  shippingAddress?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PetPublicProfile {
  name: string;
  species: Species;
  breed: string;
  photoUrl?: string;
}

export interface PetWeightLog {
  id: string;
  petId: string;
  weightKg: number;
  recordedAt: string;
  createdAt: string;
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
  treatmentGroupId?: string;
  completedAt?: string;
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

export interface VeterinaryProfile {
  id: string;
  name: string;
  zoneLabel: string;
  address: string;
  phoneWhatsapp?: string;
  phoneSecondary?: string;
  latitude?: number;
  longitude?: number;
  status: VeterinaryStatus;
  suggestedByUserId?: string;
  upvotesCount: number;
  validationsGoal: number;
  claimedByOwnerId?: string;
  claimToken?: string;
  claimSourceRefUserId?: string;
  isVerified: boolean;
  contactEmail?: string;
  consentGranted: boolean;
  basicDataConfirmed: boolean;
  subscriptionPlan: 'free' | 'premium';
  subscriptionBillingMode?: 'monthly_auto' | 'annual';
  businessDays?: string;
  businessHours?: string;
  services?: string;
  websiteUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  highlightPriority: number;
  activatedAt?: string;
  lastValidationAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VeterinaryIncubatorItem extends VeterinaryProfile {
  userHasValidated: boolean;
}

export interface VeterinaryClaimPreview {
  id: string;
  name: string;
  zoneLabel: string;
  address: string;
  phoneWhatsapp?: string;
  status: VeterinaryStatus;
  upvotesCount: number;
  validationsGoal: number;
  isClaimed: boolean;
  suggestedClients: number;
}

export interface VeterinaryClaimLanding extends VeterinaryClaimPreview {
  phoneSecondary?: string;
  contactEmail?: string;
  consentGranted: boolean;
  basicDataConfirmed: boolean;
  subscriptionPlan: 'free' | 'premium';
  subscriptionBillingMode?: 'monthly_auto' | 'annual';
  businessDays?: string;
  businessHours?: string;
  services?: string;
  websiteUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  veterinaryPremiumMonthlyArs: number;
  veterinaryPremiumAnnualArs: number;
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
  /** Imagen adjunta por el usuario (foto para que la IA la analice). Data URL en memoria/sesion, o URL publica una vez persistida en Storage. */
  imageUrl?: string | null;
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
  veterinaryPremiumMonthlyArs: number;
  veterinaryPremiumAnnualArs: number;
}

export interface DiscountCode {
  id: string;
  code: string;
  percentOff: number;
  active: boolean;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DiscountCodeValidation {
  code: string;
  percentOff: number;
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
  whatsappPhone?: string;
  whatsappOptIn?: boolean;
  whatsappOptInAt?: string | null;
  whatsappOptInSource?: string | null;
  newsOptIn?: boolean;
  newsOptInAt?: string | null;
  newsOptInSource?: string | null;
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

export interface InboundEmailRow {
  id: string;
  messageId?: string;
  fromAddress: string;
  toAddresses: string[];
  subject?: string;
  htmlBody?: string;
  textBody?: string;
  receivedAt: string;
  isRead: boolean;
  repliedAt?: string;
  hasAttachments: boolean;
  attachmentCount: number;
}

export interface InboundEmailReply {
  id: string;
  body: string;
  createdAt: string;
}

export type NewsCampaignStatus = 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';

export interface NewsCampaign {
  id: string;
  subject: string;
  bodyText: string;
  imageUrl: string | null;
  buttonText: string | null;
  buttonUrl: string | null;
  scheduledAt: string;
  status: NewsCampaignStatus;
  createdAt: string;
  sentAt: string | null;
  usersNotified: number;
  errorMessage: string | null;
}

export interface SubscriptionState {
  isPremiumUser: boolean;
  isSubscribed: boolean;
  canAddPet: boolean;
  canUseAI: boolean;
  freePetLimit: number;
  freeAiDailyLimit: number;
}
