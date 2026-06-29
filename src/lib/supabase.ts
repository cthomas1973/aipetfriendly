import { createClient } from '@supabase/supabase-js';
import type {
  AiUsageSettings,
  AdminUserRow,
  Pet,
  PetAiUsageRow,
  ClinicalTimelineEntry,
  PreventiveTask,
  ChatMessage,
  AppUser,
  SubscriptionPlan,
  UserAccessLevel,
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
  usage?: {
    tier: 'guest' | 'free' | 'premium';
    limit: number;
    used: number;
    remaining: number;
  };
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

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
    isGuest: accessMode === 'guest',
    isAdmin: Boolean(adminRow?.user_id),
    subscription: resolvedSubscription,
  };
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
    createdAt: msg.created_at,
  }));
}

export async function createChatMessage(
  userId: string,
  role: string,
  content: string,
): Promise<ChatMessage | null> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert([
      {
        user_id: userId,
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
