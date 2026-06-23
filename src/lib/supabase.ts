import { createClient } from '@supabase/supabase-js';
import type {
  Pet,
  ClinicalTimelineEntry,
  PreventiveTask,
  ChatMessage,
  AppUser,
} from '../types';

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
    select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }), order: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
    insert: () => ({ select: async () => ({ data: null, error: null }) }),
    update: () => ({ eq: async () => ({ error: null }) }),
    delete: () => ({ eq: async () => ({ error: null }) }),
  }),
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

  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    avatarUrl: user.avatar_url,
    subscription: subscription
      ? {
          plan: subscription.plan,
          isActive: subscription.is_active,
          expiresAt: subscription.expires_at,
        }
      : { plan: 'free', isActive: false, expiresAt: null },
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
      },
    ])
    .select()
    .single();

  if (error) {
    console.error('Error creating preventive task:', error);
    return null;
  }

  return {
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
