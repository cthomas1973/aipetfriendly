import { createClient } from '@supabase/supabase-js';
import type {
  AdminAiAuditEntry,
  AdminAiDashboardMetrics,
  AiUsageSettings,
  AdminUserRow,
  BillingPricingSettings,
  Pet,
  PetAiUsageRow,
  ClinicalTimelineEntry,
  PreventiveTask,
  ChatMessage,
  AppUser,
  SubscriptionPlan,
  UserAccessLevel,
  VeterinaryClaimLanding,
  VeterinaryClaimPreview,
  VeterinaryIncubatorItem,
  VeterinaryProfile,
} from '../types';

interface PetAssistantRequest {
  petId: string;
  question: string;
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  guestContext?: {
    pet: {
      id: string;
      name: string;
      species: string;
      breed: string;
      sex: string;
      ageYears: number;
      ageMonths: number;
      weightKg: number;
      notes: string | null;
    };
    clinicalEntries: Array<{
      eventDate: string;
      category: string;
      title: string;
      description: string;
    }>;
    preventiveTasks: Array<{
      dueDate: string;
      category: string;
      title: string;
      completed: boolean;
      notes: string | null;
    }>;
  };
}

interface PetAssistantResponse {
  answer: string;
  model?: string;
  suggestedProduct?: {
    title: string;
    thumbnail: string | null;
    price: number | null;
    link: string;
  } | null;
  usage?: {
    tier: 'guest' | 'free' | 'premium';
    limit: number;
    used: number;
    remaining: number;
  };
}

type MercadoPagoPlanCode = 'monthly' | 'annual';

interface MercadoPagoInitPointResponse {
  initPoint: string;
  mode: 'recurring' | 'one_time';
  planCode: string;
}

interface CheckoutContext {
  countryCode?: string;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Cliente mock para desarrollo sin Supabase
const mockClient = {
  auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
    signUp: async () => ({ data: null, error: new Error('Mock mode: Supabase no configurado') }),
    signInWithPassword: async () => ({ data: null, error: new Error('Mock mode: Supabase no configurado') }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
  from: () => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: null, error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
      }),
      order: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
    }),
    insert: () => ({ select: async () => ({ data: null, error: null }) }),
    update: () => ({ eq: async () => ({ error: null }) }),
    delete: () => ({ eq: async () => ({ error: null }) }),
  }),
  rpc: async () => ({ data: [], error: null }),
  functions: {
    invoke: async () => ({
      data: null,
      error: new Error('Mock mode: Supabase Functions no configuradas'),
    }),
  },
};

// Usar cliente real si hay variables, sino mock
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : (mockClient as any);

export { isSupabaseConfigured };

export async function fetchUserProfile(userId: string): Promise<AppUser | null> {
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !user) {
    return null;
  }

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single();

  const { data: adminRow } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  const accessMode = (user.access_mode || 'free') as 'guest' | 'free' | 'premium';
  const defaultSubscription = subscription
    ? {
        plan: subscription.plan,
        isActive: subscription.is_active,
        expiresAt: subscription.expires_at,
      }
    : { plan: 'free' as const, isActive: false, expiresAt: null };

  const resolvedSubscription =
    accessMode === 'premium'
      ? { plan: 'premium' as const, isActive: true, expiresAt: defaultSubscription.expiresAt }
      : accessMode === 'guest'
        ? { plan: 'free' as const, isActive: false, expiresAt: defaultSubscription.expiresAt }
        : defaultSubscription;

  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    avatarUrl: user.avatar_url,
    whatsappPhone: user.whatsapp_phone || undefined,
    whatsappOptIn: Boolean(user.whatsapp_opt_in),
    whatsappOptInAt: user.whatsapp_opt_in_at || null,
    whatsappOptInSource: user.whatsapp_opt_in_source || null,
    isGuest: accessMode === 'guest',
    isAdmin: Boolean(adminRow?.user_id),
    subscription: resolvedSubscription,
  };
}

export async function updateUserNotificationProfile(args: {
  userId: string;
  whatsappPhone: string | null;
  whatsappOptIn: boolean;
  whatsappOptInSource: string | null;
}): Promise<void> {
  const payload = {
    whatsapp_phone: args.whatsappPhone,
    whatsapp_opt_in: args.whatsappOptIn,
    whatsapp_opt_in_at: args.whatsappOptIn ? new Date().toISOString() : null,
    whatsapp_opt_in_source: args.whatsappOptIn ? (args.whatsappOptInSource || 'mi_cuenta') : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('users')
    .update(payload)
    .eq('id', args.userId);

  if (error) {
    throw error;
  }
}

export async function fetchPets(userId: string): Promise<Pet[]> {
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching pets:', error);
    return [];
  }

  return (data || []).map((pet: any) => ({
    id: pet.id,
    userId: pet.user_id,
    name: pet.name,
    breed: pet.breed,
    species: pet.species,
    sex: pet.sex,
    birthDate: pet.birth_date || undefined,
    ageYears: pet.age_years,
    ageMonths: pet.age_months,
    weightKg: pet.weight_kg,
    photoUrl: pet.photo_url,
    notes: pet.notes,
    createdAt: pet.created_at,
    updatedAt: pet.updated_at,
  }));
}

export async function createPet(userId: string, petData: any): Promise<Pet | null> {
  const { data, error } = await supabase
    .from('pets')
    .insert([
      {
        user_id: userId,
        name: petData.name,
        breed: petData.breed,
        species: petData.species,
        sex: petData.sex,
        birth_date: petData.birthDate || null,
        age_years: petData.ageYears,
        age_months: petData.ageMonths,
        weight_kg: petData.weightKg,
        photo_url: petData.photoUrl,
        notes: petData.notes,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error('Error creating pet:', error);
    return null;
  }

  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    breed: data.breed,
    species: data.species,
    sex: data.sex,
    birthDate: data.birth_date || undefined,
    ageYears: data.age_years,
    ageMonths: data.age_months,
    weightKg: data.weight_kg,
    photoUrl: data.photo_url,
    notes: data.notes,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function updatePetRecord(petId: string, petData: any): Promise<Pet | null> {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if ('name' in petData) payload.name = petData.name;
  if ('breed' in petData) payload.breed = petData.breed;
  if ('species' in petData) payload.species = petData.species;
  if ('sex' in petData) payload.sex = petData.sex;
  if ('birthDate' in petData) payload.birth_date = petData.birthDate || null;
  if ('ageYears' in petData) payload.age_years = petData.ageYears;
  if ('ageMonths' in petData) payload.age_months = petData.ageMonths;
  if ('weightKg' in petData) payload.weight_kg = petData.weightKg;
  if ('photoUrl' in petData) payload.photo_url = petData.photoUrl || null;
  if ('notes' in petData) payload.notes = petData.notes;

  const { data, error } = await supabase
    .from('pets')
    .update(payload)
    .eq('id', petId)
    .select()
    .single();

  if (error) {
    console.error('Error updating pet:', error);
    return null;
  }

  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    breed: data.breed,
    species: data.species,
    sex: data.sex,
    birthDate: data.birth_date || undefined,
    ageYears: data.age_years,
    ageMonths: data.age_months,
    weightKg: data.weight_kg,
    photoUrl: data.photo_url,
    notes: data.notes,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function deletePet(petId: string): Promise<boolean> {
  const { error } = await supabase.from('pets').delete().eq('id', petId);
  return !error;
}

export async function fetchClinicalEntries(petId: string): Promise<ClinicalTimelineEntry[]> {
  const { data, error } = await supabase
    .from('clinical_entries')
    .select('*')
    .eq('pet_id', petId)
    .order('event_date', { ascending: false });

  if (error) {
    console.error('Error fetching clinical entries:', error);
    return [];
  }

  return (data || []).map((entry: any) => ({
    id: entry.id,
    petId: entry.pet_id,
    category: entry.category,
    title: entry.title,
    description: entry.description,
    eventDate: entry.event_date,
    createdAt: entry.created_at,
    metadata: entry.metadata || {},
  }));
}

export async function createClinicalEntry(
  petId: string,
  entryData: any,
): Promise<ClinicalTimelineEntry | null> {
  const { data, error } = await supabase
    .from('clinical_entries')
    .insert([
      {
        pet_id: petId,
        category: entryData.category,
        title: entryData.title,
        description: entryData.description,
        event_date: entryData.eventDate,
        metadata: entryData.metadata,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error('Error creating clinical entry:', error);
    return null;
  }

  return {
    id: data.id,
    petId: data.pet_id,
    category: data.category,
    title: data.title,
    description: data.description,
    eventDate: data.event_date,
    createdAt: data.created_at,
    metadata: data.metadata || {},
  };
}

export async function fetchPreventiveTasks(petId: string): Promise<PreventiveTask[]> {
  const { data, error } = await supabase
    .from('preventive_tasks')
    .select('*')
    .eq('pet_id', petId)
    .order('due_date', { ascending: true });

  if (error) {
    console.error('Error fetching preventive tasks:', error);
    return [];
  }

  return (data || []).map((task: any) => ({
    ...(task.metadata || {}),
    id: task.id,
    petId: task.pet_id,
    title: task.title,
    category: task.category,
    dueDate: task.due_date,
    completed: task.completed,
    notes: task.notes,
    createdAt: task.created_at,
  }));
}

export async function createPreventiveTask(
  petId: string,
  taskData: any,
): Promise<PreventiveTask | null> {
  const { data, error } = await supabase
    .from('preventive_tasks')
    .insert([
      {
        pet_id: petId,
        title: taskData.title,
        category: taskData.category,
        due_date: taskData.dueDate,
        completed: taskData.completed || false,
        notes: taskData.notes,
        metadata: {
          dose: taskData.dose ?? null,
          frequency: taskData.frequency ?? null,
          scheduleTimes: taskData.scheduleTimes ?? null,
          startDate: taskData.startDate ?? null,
          endDate: taskData.endDate ?? null,
          durationDays: taskData.durationDays ?? null,
          remindersEnabled: taskData.remindersEnabled ?? null,
          appointmentReason: taskData.appointmentReason ?? null,
          appointmentTime: taskData.appointmentTime ?? null,
          appointmentLocation: taskData.appointmentLocation ?? null,
          appointmentReference: taskData.appointmentReference ?? null,
          notificationLeadTime: taskData.notificationLeadTime ?? null,
          notificationChannels: taskData.notificationChannels ?? null,
          notificationEmail: taskData.notificationEmail ?? null,
          notificationPhone: taskData.notificationPhone ?? null,
          foodBrand: taskData.foodBrand ?? null,
          foodVariety: taskData.foodVariety ?? null,
          foodBagWeightKg: taskData.foodBagWeightKg ?? null,
          foodPurchaseDate: taskData.foodPurchaseDate ?? null,
          foodPurchaseGroupId: taskData.foodPurchaseGroupId ?? null,
          foodSharedPetIds: taskData.foodSharedPetIds ?? null,
          foodAppliesToPetsCount: taskData.foodAppliesToPetsCount ?? null,
          foodEstimatedDailyKgTotal: taskData.foodEstimatedDailyKgTotal ?? null,
          foodEstimatedDailyKgPerPet: taskData.foodEstimatedDailyKgPerPet ?? null,
          foodEstimatedDurationDays: taskData.foodEstimatedDurationDays ?? null,
          foodPreviousPurchaseDate: taskData.foodPreviousPurchaseDate ?? null,
          foodUseAsDefaultNext: taskData.foodUseAsDefaultNext ?? null,
          foodEntryType: taskData.foodEntryType ?? null,
        },
      },
    ])
    .select()
    .single();

  if (error) {
    console.error('Error creating preventive task:', error);
    return null;
  }

  return {
    ...(data.metadata || {}),
    id: data.id,
    petId: data.pet_id,
    title: data.title,
    category: data.category,
    dueDate: data.due_date,
    completed: data.completed,
    notes: data.notes,
    createdAt: data.created_at,
  };
}

export async function togglePreventiveTask(taskId: string, completed: boolean): Promise<boolean> {
  const { error } = await supabase
    .from('preventive_tasks')
    .update({ completed })
    .eq('id', taskId);
  return !error;
}

export async function deletePreventiveTask(taskId: string): Promise<boolean> {
  const { error } = await supabase
    .from('preventive_tasks')
    .delete()
    .eq('id', taskId);

  if (error) {
    console.error('Error deleting preventive task:', error);
    return false;
  }

  return true;
}

export async function updatePreventiveTaskSchedule(
  taskId: string,
  dueDate: string,
  time: string,
): Promise<boolean> {
  const { data: existing, error: readError } = await supabase
    .from('preventive_tasks')
    .select('metadata')
    .eq('id', taskId)
    .single();

  if (readError) {
    console.error('Error reading preventive task metadata:', readError);
    return false;
  }

  const metadata = {
    ...(existing?.metadata || {}),
    appointmentTime: time,
    scheduleTimes: [time],
  };

  const { error } = await supabase
    .from('preventive_tasks')
    .update({
      due_date: dueDate,
      metadata,
    })
    .eq('id', taskId);

  if (error) {
    console.error('Error updating preventive task schedule:', error);
    return false;
  }

  return true;
}

export async function updatePreventiveTaskReminders(
  taskId: string,
  remindersEnabled: boolean,
): Promise<boolean> {
  const { data: existing, error: readError } = await supabase
    .from('preventive_tasks')
    .select('metadata')
    .eq('id', taskId)
    .single();

  if (readError) {
    console.error('Error reading preventive task metadata:', readError);
    return false;
  }

  const metadata = {
    ...(existing?.metadata || {}),
    remindersEnabled,
  };

  const { error } = await supabase
    .from('preventive_tasks')
    .update({ metadata })
    .eq('id', taskId);

  if (error) {
    console.error('Error updating preventive task reminders:', error);
    return false;
  }

  return true;
}

function mapVeterinaryProfileRow(row: any): VeterinaryProfile {
  return {
    id: row.id,
    name: row.name,
    zoneLabel: row.zone_label,
    address: row.address,
    phoneWhatsapp: row.phone_whatsapp || undefined,
    latitude: typeof row.latitude === 'number' ? row.latitude : undefined,
    longitude: typeof row.longitude === 'number' ? row.longitude : undefined,
    status: row.status,
    suggestedByUserId: row.suggested_by_user_id || undefined,
    upvotesCount: Number(row.upvotes_count || 0),
    validationsGoal: Number(row.validations_goal || 5),
    claimedByOwnerId: row.claimed_by_owner_id || undefined,
    claimToken: row.claim_token || undefined,
    claimSourceRefUserId: row.claim_source_ref_user_id || undefined,
    isVerified: Boolean(row.is_verified),
    contactEmail: row.contact_email || undefined,
    consentGranted: Boolean(row.consent_granted),
    basicDataConfirmed: Boolean(row.basic_data_confirmed),
    subscriptionPlan: row.subscription_plan === 'premium' ? 'premium' : 'free',
    subscriptionBillingMode:
      row.subscription_billing_mode === 'monthly_auto' || row.subscription_billing_mode === 'annual'
        ? row.subscription_billing_mode
        : undefined,
    businessDays: row.business_days || undefined,
    businessHours: row.business_hours || undefined,
    services: row.services || undefined,
    websiteUrl: row.website_url || undefined,
    instagramUrl: row.instagram_url || undefined,
    facebookUrl: row.facebook_url || undefined,
    highlightPriority: Number(row.highlight_priority || 0),
    activatedAt: row.activated_at || undefined,
    lastValidationAt: row.last_validation_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVeterinaryClaimPreviewRow(row: any): VeterinaryClaimPreview {
  return {
    id: row.id,
    name: row.name,
    zoneLabel: row.zone_label,
    address: row.address,
    phoneWhatsapp: row.phone_whatsapp || undefined,
    status: row.status,
    upvotesCount: Number(row.upvotes_count || 0),
    validationsGoal: Number(row.validations_goal || 5),
    isClaimed: Boolean(row.is_claimed),
    suggestedClients: Number(row.suggested_clients || row.upvotes_count || 0),
  };
}

function mapVeterinaryClaimLandingRow(row: any): VeterinaryClaimLanding {
  return {
    ...mapVeterinaryClaimPreviewRow(row),
    contactEmail: row.contact_email || undefined,
    consentGranted: Boolean(row.consent_granted),
    basicDataConfirmed: Boolean(row.basic_data_confirmed),
    subscriptionPlan: row.subscription_plan === 'premium' ? 'premium' : 'free',
    subscriptionBillingMode:
      row.subscription_billing_mode === 'monthly_auto' || row.subscription_billing_mode === 'annual'
        ? row.subscription_billing_mode
        : undefined,
    businessDays: row.business_days || undefined,
    businessHours: row.business_hours || undefined,
    services: row.services || undefined,
    websiteUrl: row.website_url || undefined,
    instagramUrl: row.instagram_url || undefined,
    facebookUrl: row.facebook_url || undefined,
    veterinaryPremiumMonthlyArs: Number(row.veterinary_premium_monthly_ars || 0),
    veterinaryPremiumAnnualArs: Number(row.veterinary_premium_annual_ars || 0),
  };
}

export async function suggestVeterinary(input: {
  name: string;
  zoneLabel: string;
  address: string;
  phoneWhatsapp?: string;
  latitude?: number;
  longitude?: number;
  claimSourceRefUserId?: string;
}): Promise<VeterinaryProfile | null> {
  if (!isSupabaseConfigured) {
    return null;
  }

  const { data, error } = await supabase.rpc('create_veterinary_suggestion', {
    p_name: input.name,
    p_zone_label: input.zoneLabel,
    p_address: input.address,
    p_phone_whatsapp: input.phoneWhatsapp ?? null,
    p_latitude: input.latitude ?? null,
    p_longitude: input.longitude ?? null,
    p_claim_source_ref_user_id: input.claimSourceRefUserId ?? null,
  });

  if (error || !data) {
    console.error('Error creating veterinary suggestion:', error);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row ? mapVeterinaryProfileRow(row) : null;
}

export async function fetchVeterinaryIncubatorByZone(args: {
  zoneLabel: string;
  userId?: string;
  limit?: number;
}): Promise<VeterinaryIncubatorItem[]> {
  if (!isSupabaseConfigured) {
    return [];
  }

  const safeLimit = Math.max(1, Math.min(args.limit ?? 25, 50));
  const cleanedZone = args.zoneLabel.trim();
  const zoneFilter = cleanedZone.length > 0 ? `%${cleanedZone}%` : '%';

  const { data, error } = await supabase
    .from('veterinary_profiles')
    .select('id,name,zone_label,address,phone_whatsapp,latitude,longitude,status,suggested_by_user_id,upvotes_count,validations_goal,claimed_by_owner_id,claim_source_ref_user_id,is_verified,activated_at,last_validation_at,created_at,updated_at')
    .in('status', ['IN_INCUBATOR', 'CLAIMABLE_PROFILE'])
    .ilike('zone_label', zoneFilter)
    .order('upvotes_count', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) {
    console.error('Error fetching veterinary incubator:', error);
    return [];
  }

  const profiles: VeterinaryProfile[] = (data || []).map((row: any) => mapVeterinaryProfileRow(row));
  if (!args.userId || profiles.length === 0) {
    return profiles.map((profile) => ({ ...profile, userHasValidated: false }));
  }

  const profileIds = profiles.map((profile) => profile.id);
  const { data: votes, error: votesError } = await supabase
    .from('veterinary_validations')
    .select('veterinary_id')
    .eq('user_id', args.userId)
    .in('veterinary_id', profileIds);

  if (votesError) {
    console.error('Error fetching user veterinary validations:', votesError);
    return profiles.map((profile) => ({ ...profile, userHasValidated: false }));
  }

  const validatedIds = new Set((votes || []).map((row: any) => row.veterinary_id as string));
  return profiles.map((profile) => ({
    ...profile,
    userHasValidated: validatedIds.has(profile.id),
  }));
}

export async function fetchActiveVeterinaryProfilesByZone(args: {
  zoneLabel: string;
  limit?: number;
}): Promise<VeterinaryProfile[]> {
  if (!isSupabaseConfigured) {
    return [];
  }

  const safeLimit = Math.max(1, Math.min(args.limit ?? 50, 100));
  const cleanedZone = args.zoneLabel.trim();
  const zoneFilter = cleanedZone.length > 0 ? `%${cleanedZone}%` : '%';

  const { data, error } = await supabase
    .from('veterinary_profiles')
    .select('id,name,zone_label,address,phone_whatsapp,latitude,longitude,status,suggested_by_user_id,upvotes_count,validations_goal,claimed_by_owner_id,claim_source_ref_user_id,is_verified,activated_at,last_validation_at,created_at,updated_at,contact_email,consent_granted,basic_data_confirmed,subscription_plan,subscription_billing_mode,business_days,business_hours,services,website_url,instagram_url,facebook_url,highlight_priority')
    .in('status', ['ACTIVE_FREE', 'ACTIVE_PREMIUM'])
    .ilike('zone_label', zoneFilter)
    .order('highlight_priority', { ascending: false })
    .order('upvotes_count', { ascending: false })
    .limit(safeLimit);

  if (error) {
    console.error('Error fetching active veterinary profiles:', error);
    return [];
  }

  return (data || []).map((row: any) => mapVeterinaryProfileRow(row));
}

export async function validateVeterinary(veterinaryId: string): Promise<VeterinaryProfile | null> {
  if (!isSupabaseConfigured) {
    return null;
  }

  const { data, error } = await supabase.rpc('validate_veterinary', {
    p_veterinary_id: veterinaryId,
  });

  if (error || !data) {
    console.error('Error validating veterinary:', error);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row ? mapVeterinaryProfileRow(row) : null;
}

export async function getVeterinaryClaimPreview(claimToken: string): Promise<VeterinaryClaimPreview | null> {
  if (!isSupabaseConfigured) {
    return null;
  }

  const { data, error } = await supabase.rpc('get_veterinary_claim_preview', {
    p_claim_token: claimToken,
  });

  if (error || !data) {
    console.error('Error fetching veterinary claim preview:', error);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row ? mapVeterinaryClaimPreviewRow(row) : null;
}

export async function getVeterinaryClaimLanding(claimToken: string): Promise<VeterinaryClaimLanding | null> {
  if (!isSupabaseConfigured) {
    return null;
  }

  const { data, error } = await supabase.rpc('get_veterinary_claim_landing', {
    p_claim_token: claimToken,
  });

  if (error || !data) {
    console.error('Error fetching veterinary claim landing:', error);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row ? mapVeterinaryClaimLandingRow(row) : null;
}

export async function submitVeterinaryClaimDecision(args: {
  claimToken: string;
  action: 'correct' | 'reject' | 'subscribe';
  name?: string;
  zoneLabel?: string;
  address?: string;
  phoneWhatsapp?: string;
  contactEmail?: string;
  consentGranted?: boolean;
  basicDataConfirmed?: boolean;
  businessDays?: string;
  businessHours?: string;
  services?: string;
  websiteUrl?: string;
  instagramUrl?: string;
  facebookUrl?: string;
  subscriptionBillingMode?: 'monthly_auto' | 'annual';
  notifyIdentity?: boolean;
  suggestedOwnerAlias?: string;
  suggestedOwnerPets?: string;
}): Promise<VeterinaryProfile | null> {
  if (!isSupabaseConfigured) {
    return null;
  }

  const { data, error } = await supabase.rpc('submit_veterinary_claim_decision', {
    p_claim_token: args.claimToken,
    p_action: args.action,
    p_name: args.name ?? null,
    p_zone_label: args.zoneLabel ?? null,
    p_address: args.address ?? null,
    p_phone_whatsapp: args.phoneWhatsapp ?? null,
    p_contact_email: args.contactEmail ?? null,
    p_consent_granted: args.consentGranted ?? null,
    p_basic_data_confirmed: args.basicDataConfirmed ?? null,
    p_business_days: args.businessDays ?? null,
    p_business_hours: args.businessHours ?? null,
    p_services: args.services ?? null,
    p_website_url: args.websiteUrl ?? null,
    p_instagram_url: args.instagramUrl ?? null,
    p_facebook_url: args.facebookUrl ?? null,
    p_subscription_billing_mode: args.subscriptionBillingMode ?? null,
    p_notify_identity: args.notifyIdentity ?? false,
    p_suggested_owner_alias: args.suggestedOwnerAlias ?? null,
    p_suggested_owner_pets: args.suggestedOwnerPets ?? null,
  });

  if (error || !data) {
    console.error('Error submitting veterinary claim decision:', error);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row ? mapVeterinaryProfileRow(row) : null;
}

export async function triggerVeterinaryConsentWhatsApp(veterinaryId: string): Promise<{
  sent: boolean;
  reason?: string;
}> {
  if (!isSupabaseConfigured) {
    return { sent: false, reason: 'supabase_not_configured' };
  }

  const { data, error } = await supabase.functions.invoke('send-veterinary-consent-whatsapp', {
    body: { veterinaryId },
  });

  if (error) {
    console.error('Error triggering veterinary consent WhatsApp:', error);
    return { sent: false, reason: 'invoke_error' };
  }

  const payload = (data || {}) as { sent?: boolean; reason?: string };
  return {
    sent: Boolean(payload.sent),
    reason: payload.reason,
  };
}

export async function claimVeterinaryProfile(args: {
  claimToken: string;
  plan: 'free' | 'premium';
}): Promise<VeterinaryProfile | null> {
  if (!isSupabaseConfigured) {
    return null;
  }

  const { data, error } = await supabase.rpc('claim_veterinary_profile', {
    p_claim_token: args.claimToken,
    p_plan: args.plan,
  });

  if (error || !data) {
    console.error('Error claiming veterinary profile:', error);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row ? mapVeterinaryProfileRow(row) : null;
}

export async function fetchChatMessages(userId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching chat messages:', error);
    return [];
  }

  return (data || []).map((msg: any) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    petId: msg.pet_id || null,
    createdAt: msg.created_at,
  }));
}

export async function createChatMessage(
  userId: string,
  petId: string | null,
  role: string,
  content: string,
): Promise<ChatMessage | null> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert([
      {
        user_id: userId,
        pet_id: petId,
        role,
        content,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error('Error creating chat message:', error);
    return null;
  }

  return {
    id: data.id,
    role: data.role,
    content: data.content,
    petId: data.pet_id || null,
    createdAt: data.created_at,
  };
}

export async function askPetAssistant(payload: PetAssistantRequest): Promise<PetAssistantResponse> {
  const { data, error } = await supabase.functions.invoke('pet-ai-chat', {
    body: payload,
  });

  if (error) {
    throw new Error(error.message || 'No se pudo invocar la funcion de IA');
  }

  if (!data || typeof data.answer !== 'string') {
    throw new Error('Respuesta invalida de la funcion de IA');
  }

  return data as PetAssistantResponse;
}

export async function fetchAiUsageSettings(): Promise<AiUsageSettings> {
  const { data, error } = await supabase.rpc('get_ai_usage_settings');

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      guestLimitPerPet: 3,
      freeLimitPerPet: 10,
      premiumLimitPerPet: 100,
    };
  }

  return {
    guestLimitPerPet: Number(row.guest_limit_per_pet ?? 3),
    freeLimitPerPet: Number(row.free_limit_per_pet ?? 10),
    premiumLimitPerPet: Number(row.premium_limit_per_pet ?? 100),
  };
}

export async function fetchUserPetAiUsage(): Promise<PetAiUsageRow[]> {
  const { data, error } = await supabase.rpc('get_user_pet_ai_usage');

  if (error) {
    throw error;
  }

  return (data || []).map((row: any) => ({
    petId: row.pet_id,
    usageCount: Number(row.usage_count || 0),
  }));
}

export async function fetchAdminAiUsageSettings(): Promise<AiUsageSettings> {
  const { data, error } = await supabase.rpc('admin_get_ai_usage_settings');

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('No se encontro configuracion de limites IA');
  }

  return {
    guestLimitPerPet: Number(row.guest_limit_per_pet),
    freeLimitPerPet: Number(row.free_limit_per_pet),
    premiumLimitPerPet: Number(row.premium_limit_per_pet),
  };
}

export async function updateAdminAiUsageSettings(settings: AiUsageSettings): Promise<void> {
  const { error } = await supabase.rpc('admin_update_ai_usage_settings', {
    p_guest_limit: settings.guestLimitPerPet,
    p_free_limit: settings.freeLimitPerPet,
    p_premium_limit: settings.premiumLimitPerPet,
  });

  if (error) {
    throw error;
  }
}

const DEFAULT_BILLING_PRICING: BillingPricingSettings = {
  premiumMonthlyAutoArs: 9900,
  premiumMonthlyAutoUsd: 9.9,
  premiumAnnualAutoArs: 99900,
  premiumAnnualAutoUsd: 99.9,
  premiumMonthlyManualArs: 9900,
  premiumMonthlyManualUsd: 9.9,
  veterinaryPremiumMonthlyArs: 24900,
  veterinaryPremiumAnnualArs: 239000,
};

export async function fetchBillingPricingSettings(): Promise<BillingPricingSettings> {
  const { data, error } = await supabase.rpc('get_billing_pricing_settings');

  if (error) {
    console.error('No se pudo cargar pricing de planes:', error);
    return { ...DEFAULT_BILLING_PRICING };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { ...DEFAULT_BILLING_PRICING };
  }

  return {
    premiumMonthlyAutoArs: Number(row.premium_monthly_auto_ars ?? DEFAULT_BILLING_PRICING.premiumMonthlyAutoArs),
    premiumMonthlyAutoUsd: Number(row.premium_monthly_auto_usd ?? DEFAULT_BILLING_PRICING.premiumMonthlyAutoUsd),
    premiumAnnualAutoArs: Number(row.premium_annual_auto_ars ?? DEFAULT_BILLING_PRICING.premiumAnnualAutoArs),
    premiumAnnualAutoUsd: Number(row.premium_annual_auto_usd ?? DEFAULT_BILLING_PRICING.premiumAnnualAutoUsd),
    premiumMonthlyManualArs: Number(row.premium_monthly_manual_ars ?? DEFAULT_BILLING_PRICING.premiumMonthlyManualArs),
    premiumMonthlyManualUsd: Number(row.premium_monthly_manual_usd ?? DEFAULT_BILLING_PRICING.premiumMonthlyManualUsd),
    veterinaryPremiumMonthlyArs: Number(
      row.veterinary_premium_monthly_ars ?? DEFAULT_BILLING_PRICING.veterinaryPremiumMonthlyArs,
    ),
    veterinaryPremiumAnnualArs: Number(
      row.veterinary_premium_annual_ars ?? DEFAULT_BILLING_PRICING.veterinaryPremiumAnnualArs,
    ),
  };
}

export async function fetchAdminBillingPricingSettings(): Promise<BillingPricingSettings> {
  const { data, error } = await supabase.rpc('admin_get_billing_pricing_settings');

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('No se encontro configuracion de precios de planes.');
  }

  return {
    premiumMonthlyAutoArs: Number(row.premium_monthly_auto_ars),
    premiumMonthlyAutoUsd: Number(row.premium_monthly_auto_usd),
    premiumAnnualAutoArs: Number(row.premium_annual_auto_ars),
    premiumAnnualAutoUsd: Number(row.premium_annual_auto_usd),
    premiumMonthlyManualArs: Number(row.premium_monthly_manual_ars),
    premiumMonthlyManualUsd: Number(row.premium_monthly_manual_usd),
    veterinaryPremiumMonthlyArs: Number(
      row.veterinary_premium_monthly_ars ?? DEFAULT_BILLING_PRICING.veterinaryPremiumMonthlyArs,
    ),
    veterinaryPremiumAnnualArs: Number(
      row.veterinary_premium_annual_ars ?? DEFAULT_BILLING_PRICING.veterinaryPremiumAnnualArs,
    ),
  };
}

export async function updateAdminBillingPricingSettings(settings: BillingPricingSettings): Promise<void> {
  const { error } = await supabase.rpc('admin_update_billing_pricing_settings', {
    p_premium_monthly_auto_ars: settings.premiumMonthlyAutoArs,
    p_premium_monthly_auto_usd: settings.premiumMonthlyAutoUsd,
    p_premium_annual_auto_ars: settings.premiumAnnualAutoArs,
    p_premium_annual_auto_usd: settings.premiumAnnualAutoUsd,
    p_premium_monthly_manual_ars: settings.premiumMonthlyManualArs,
    p_premium_monthly_manual_usd: settings.premiumMonthlyManualUsd,
    p_veterinary_premium_monthly_ars: settings.veterinaryPremiumMonthlyArs,
    p_veterinary_premium_annual_ars: settings.veterinaryPremiumAnnualArs,
  });

  if (error) {
    throw error;
  }
}

export async function fetchAdminAiDashboardMetrics(): Promise<AdminAiDashboardMetrics> {
  const { data, error } = await supabase.rpc('admin_get_ai_dashboard_metrics');

  if (error) {
    throw error;
  }

  const metrics = data || {};
  return {
    consultasHoy: Number(metrics.consultasHoy || 0),
    consultas7d: Number(metrics.consultas7d || 0),
    tokens7d: Number(metrics.tokens7d || 0),
    percentLimitesAgotados: Number(metrics.percentLimitesAgotados || 0),
    topMascotas: Array.isArray(metrics.topMascotas)
      ? metrics.topMascotas.map((item: any) => ({
          petName: String(item.petName || 'Mascota'),
          count: Number(item.count || 0),
        }))
      : [],
  };
}

export async function fetchAdminAiQueryAudit(limit = 20): Promise<AdminAiAuditEntry[]> {
  const { data, error } = await supabase.rpc('admin_list_ai_query_audit', {
    p_limit: limit,
  });

  if (error) {
    throw error;
  }

  return (data || []).map((row: any) => ({
    createdAt: row.created_at,
    userEmail: row.user_email,
    petName: row.pet_name,
    tier: row.tier,
    model: row.model || undefined,
    estimatedTotalTokens: Number(row.estimated_total_tokens || 0),
    questionChars: Number(row.question_chars || 0),
    answerChars: Number(row.answer_chars || 0),
  }));
}

async function getAuthTokenOrThrow(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message || 'No se pudo validar la sesion actual.');
  }

  const token = session?.access_token;
  if (!token) {
    throw new Error('Debes iniciar sesion para continuar con la suscripcion.');
  }

  return token;
}

async function postMercadoPagoEndpoint<TResponse>(path: string, payload: Record<string, unknown>): Promise<TResponse> {
  const token = await getAuthTokenOrThrow();

  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body?.error === 'string' ? body.error : '';
    throw new Error(detail || 'No se pudo iniciar el checkout de Mercado Pago.');
  }

  return body as TResponse;
}

export async function createMercadoPagoRecurringSubscription(
  planCode: MercadoPagoPlanCode,
  context?: CheckoutContext,
): Promise<MercadoPagoInitPointResponse> {
  return postMercadoPagoEndpoint<MercadoPagoInitPointResponse>('/api/mercadopago/create-subscription', {
    planCode,
    countryCode: context?.countryCode,
  });
}

export async function createMercadoPagoOneTimeMonthlyPayment(context?: CheckoutContext): Promise<MercadoPagoInitPointResponse> {
  return postMercadoPagoEndpoint<MercadoPagoInitPointResponse>('/api/mercadopago/create-checkout', {
    planCode: 'monthly_manual',
    countryCode: context?.countryCode,
  });
}

export async function fetchAdminUsers(): Promise<AdminUserRow[]> {
  const { data, error } = await supabase.rpc('admin_list_user_access');

  if (error) {
    console.error('Error fetching admin users:', error);
    throw error;
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name || undefined,
    access: row.access as UserAccessLevel,
    subscriptionPlan: row.subscription_plan as SubscriptionPlan,
    subscriptionActive: Boolean(row.subscription_active),
    createdAt: row.created_at,
  }));
}

export async function updateAdminUserAccess(userId: string, access: UserAccessLevel): Promise<boolean> {
  const { error } = await supabase.rpc('admin_set_user_access', {
    p_user_id: userId,
    p_access: access,
  });

  if (error) {
    console.error('Error updating admin user access:', error);
    throw error;
  }

  return true;
}

// ── Beneficios Productos ──────────────────────────────────────────────────────

export async function fetchBeneficiosProductos(
  grupo?: string,
  petTypes?: string[],
  lifeStages?: string[],
  sizeCategories?: string[],
): Promise<import('../types').BeneficioProducto[]> {
  let query = supabase
    .from('beneficios_productos')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false });

  if (grupo) query = query.eq('grupo', grupo);
  if (petTypes && petTypes.length > 0) {
    query = query.overlaps('pet_types', petTypes);
  }
  if (lifeStages && lifeStages.length > 0) {
    query = query.overlaps('life_stages', lifeStages);
  }
  if (sizeCategories && sizeCategories.length > 0) {
    query = query.overlaps('size_categories', sizeCategories);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as import('../types').BeneficioProducto[];
}

export async function fetchAllBeneficiosProductos(): Promise<import('../types').BeneficioProducto[]> {
  const { data, error } = await supabase
    .from('beneficios_productos')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as import('../types').BeneficioProducto[];
}

export async function insertBeneficioProducto(
  producto: Omit<import('../types').BeneficioProducto, 'id' | 'created_at' | 'updated_at'>,
): Promise<import('../types').BeneficioProducto> {
  const { data, error } = await supabase
    .from('beneficios_productos')
    .insert(producto)
    .select()
    .single();
  if (error) throw error;
  return data as import('../types').BeneficioProducto;
}

export async function updateBeneficioProducto(
  id: string,
  updates: Partial<import('../types').BeneficioProducto>,
): Promise<void> {
  const { error } = await supabase
    .from('beneficios_productos')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteBeneficioProducto(id: string): Promise<void> {
  const { error } = await supabase.from('beneficios_productos').delete().eq('id', id);
  if (error) throw error;
}
