import { useEffect, useRef, useState } from 'react';
import {
  supabase,
  fetchUserProfile,
  fetchPets,
  fetchClinicalEntries,
  fetchPreventiveTasks,
  fetchChatMessages,
  createPet,
  createClinicalEntry,
  createPreventiveTask,
  createChatMessage,
  isSupabaseConfigured,
} from '../lib/supabase';
import { useAppState } from '../context/AppStateContext';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { ChatMessage, ClinicalTimelineEntry, Pet, PreventiveTask, PetFormData } from '../types';

interface GuestMigrationSnapshot {
  pets: Pet[];
  clinicalEntries: ClinicalTimelineEntry[];
  preventiveTasks: PreventiveTask[];
  chatMessages: ChatMessage[];
}

const GUEST_MIGRATION_KEY = 'aipetfriendly.guest-migration';
let guestMigrationInProgress = false;

interface PendingGuestMigration {
  email: string;
  newsOptIn?: boolean;
  userId?: string;
  snapshot: GuestMigrationSnapshot;
  petIds: Record<string, string>;
  completed: string[];
  inFlight?: string;
}

async function ensureUserBootstrap(userId: string, email: string | null) {
  const { error: userError } = await supabase.from('users').upsert(
    {
      id: userId,
      email: email ?? '',
      full_name: '',
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );

  if (userError) {
    throw userError;
  }

  const { error: subscriptionError } = await supabase.from('subscriptions').upsert(
    {
      user_id: userId,
      plan: 'free',
      is_active: false,
    },
    { onConflict: 'user_id', ignoreDuplicates: true },
  );

  if (subscriptionError) {
    throw subscriptionError;
  }
}

function storeGuestMigration(pending: PendingGuestMigration) {
  sessionStorage.setItem(GUEST_MIGRATION_KEY, JSON.stringify(pending));
}

function readGuestMigration(): PendingGuestMigration | null {
  const raw = sessionStorage.getItem(GUEST_MIGRATION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const pending = JSON.parse(raw) as PendingGuestMigration;
    if (!pending.email || !pending.snapshot || !pending.petIds || !Array.isArray(pending.completed)) {
      throw new Error('Hay datos de visitante pendientes sin identidad verificable. No se importaron.');
    }
    return pending;
  } catch {
    throw new Error('No se pudieron recuperar los datos pendientes del visitante. Se conservaron para revision.');
  }
}

async function migrateGuestSnapshot(userId: string, email: string | null) {
  const pending = readGuestMigration();
  if (!pending) return;
  if (pending.email !== email?.trim().toLowerCase() || (pending.userId && pending.userId !== userId)) {
    throw new Error('Hay datos de visitante pendientes de otra identidad. Se conservaron y no se importaron a esta cuenta.');
  }
  if (pending.inFlight) {
    throw new Error('La importacion anterior quedo sin confirmar. Tus datos temporales se conservaron; no se reintentara para evitar duplicados.');
  }
  const petIds = new Set(pending.snapshot.pets.map(pet => pet.id));
  const hasOrphanedRecords = pending.snapshot.clinicalEntries.some(entry => !petIds.has(entry.petId))
    || pending.snapshot.preventiveTasks.some(task => !petIds.has(task.petId) || task.foodSharedPetIds?.some(id => !petIds.has(id)))
    || pending.snapshot.chatMessages.some(message => !message.isError && message.role !== 'system' && message.petId && !petIds.has(message.petId));
  if (hasOrphanedRecords) {
    throw new Error('Hay registros pendientes sin una mascota identificable. Se conservaron todos los datos para revision; no se importaron parcialmente.');
  }
  pending.userId = userId;
  storeGuestMigration(pending);
  const { snapshot } = pending;
  const migrate = async (key: string, operation: () => Promise<unknown>) => {
    if (pending.completed.includes(key)) return;
    pending.inFlight = key;
    storeGuestMigration(pending);
    const saved = await operation();
    if (!saved) throw new Error('No se pudo confirmar la importacion. Los datos pendientes se conservaron para evitar perdida o duplicados.');
    pending.completed.push(key);
    delete pending.inFlight;
    storeGuestMigration(pending);
  };

  if (pending.newsOptIn) {
    await migrate('newsOptIn', async () => {
      const { error } = await supabase.from('users').update({
        news_opt_in: true,
        news_opt_in_at: new Date().toISOString(),
        news_opt_in_source: 'registro',
      }).eq('id', userId);
      if (error) throw new Error('No se pudo guardar el consentimiento. El registro sigue pendiente de revision.');
      return true;
    });
  }

  for (const pet of snapshot.pets) {
    await migrate(`pet:${pet.id}`, async () => {
      const migrated = await createPet(userId, pet as PetFormData);
      if (migrated) pending.petIds[pet.id] = migrated.id;
      return migrated;
    });
  }

  for (const entry of snapshot.clinicalEntries) {
    const nextPetId = pending.petIds[entry.petId];
    if (!nextPetId) {
      throw new Error('No se pudo identificar la mascota del historial pendiente. Se conservaron los datos para revision.');
    }

    await migrate(`clinical:${entry.id}`, () => createClinicalEntry(nextPetId, {
      category: entry.category,
      title: entry.title,
      description: entry.description,
      eventDate: entry.eventDate,
      metadata: entry.metadata,
    }));
  }

  for (const task of snapshot.preventiveTasks) {
    const nextPetId = pending.petIds[task.petId];
    if (!nextPetId) {
      throw new Error('No se pudo identificar la mascota de la agenda pendiente. Se conservaron los datos para revision.');
    }

    await migrate(`task:${task.id}`, () => createPreventiveTask(nextPetId, {
      ...task,
      foodSharedPetIds: task.foodSharedPetIds?.map(id => pending.petIds[id]).filter((id): id is string => Boolean(id)),
      title: task.title,
      category: task.category,
      dueDate: task.dueDate,
      completed: task.completed,
      notes: task.notes,
    }));
  }

  for (const message of snapshot.chatMessages) {
    if (message.isError || message.role === 'system') continue;
    const nextPetId = message.petId ? pending.petIds[message.petId] : null;
    if (message.petId && !nextPetId) throw new Error('No se pudo identificar la mascota de la conversacion pendiente. Se conservaron los datos para revision.');
    await migrate(`chat:${message.id}`, () => createChatMessage(userId, nextPetId ?? null, message.role, message.content));
  }
  sessionStorage.removeItem(GUEST_MIGRATION_KEY);
}

export function useSupabaseSync() {
  const {
    user,
    setPets,
    setClinicalEntries,
    setPreventiveTasks,
    setChatMessages,
    setAdminUsers,
    setSelectedPetId,
    setUser: contextSetUser,
  } = useAppState();

  const [syncError, setSyncError] = useState<string | null>(null);
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    let disposed = false;
    let revision = 0;
    let scheduled: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      contextSetUser(null);
      userRef.current = null;
      setPets([]);
      setSelectedPetId(null);
      setClinicalEntries([]);
      setPreventiveTasks([]);
      setChatMessages([]);
      setAdminUsers([]);
    };
    const load = async (authUser: { id: string; email?: string }, ticket: number) => {
      const isCurrent = () => !disposed && ticket === revision;
      if (!isCurrent()) return;
      if (userRef.current?.id !== authUser.id) clear();
      const previousIdentity = userRef.current?.id ?? null;
      const identityUnchanged = () => isCurrent() && (userRef.current?.id ?? null) === previousIdentity;
      setSyncError(null);
      try {
        await ensureUserBootstrap(authUser.id, authUser.email ?? null);
        if (!identityUnchanged()) return;
        if (!guestMigrationInProgress) {
          guestMigrationInProgress = true;
          try {
            await migrateGuestSnapshot(authUser.id, authUser.email ?? null);
          } catch (error) {
            if (identityUnchanged()) setSyncError(error instanceof Error ? error.message : 'No se pudo importar el progreso del visitante.');
          } finally {
            guestMigrationInProgress = false;
          }
        }
        if (!identityUnchanged()) return;
        const userProfile = await fetchUserProfile(authUser.id, true);
        if (!userProfile) throw new Error('No se pudo recuperar tu perfil. Tus datos guardados no se modificaron.');
        const pets = await fetchPets(authUser.id, true);
        const [clinicalByPet, preventiveByPet, chatMessages] = await Promise.all([
          Promise.all(pets.map((pet) => fetchClinicalEntries(pet.id, true))),
          Promise.all(pets.map((pet) => fetchPreventiveTasks(pet.id, true))),
          fetchChatMessages(authUser.id, true),
        ]);
        if (!identityUnchanged()) return;
        contextSetUser(userProfile);
        userRef.current = userProfile;
        setPets(pets);
        setClinicalEntries(clinicalByPet.flat());
        setPreventiveTasks(preventiveByPet.flat());
        setChatMessages(chatMessages);
      } catch (error) {
        if (identityUnchanged()) setSyncError(error instanceof Error ? error.message : 'No se pudieron recuperar tus datos. Recarga para reintentar.');
      }
    };
    const initialize = async () => {
      if (!isSupabaseConfigured) return;
      const ticket = ++revision;
      try {
        const { data: { user: authUser }, error } = await supabase.auth.getUser();
        if (disposed || ticket !== revision) return;
        if (error?.name === 'AuthSessionMissingError') return;
        if (error) throw error;
        if (authUser) await load(authUser, ticket);
      } catch {
        if (!disposed && ticket === revision) setSyncError('No se pudo comprobar la sesion. Recarga para reintentar.');
      }
    };
    void initialize();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (event !== 'SIGNED_OUT' && event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION' && event !== 'USER_UPDATED') return;
      const ticket = ++revision;
      clearTimeout(scheduled);
      if (event === 'SIGNED_OUT' || !session) {
        if (!userRef.current?.isGuest) clear();
        setSyncError(null);
      } else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') {
        scheduled = setTimeout(() => { void load(session.user, ticket); }, 0);
      }
    });
    const refresh = () => { void initialize(); };
    window.addEventListener('aipetfriendly:guest-migrated', refresh);
    return () => {
      disposed = true;
      revision += 1;
      clearTimeout(scheduled);
      window.removeEventListener('aipetfriendly:guest-migrated', refresh);
      subscription?.unsubscribe();
    };
  }, [contextSetUser, setAdminUsers, setChatMessages, setClinicalEntries, setPreventiveTasks, setPets, setSelectedPetId]);
  return { syncError };
}

export async function signUpWithEmail(
  email: string,
  password: string,
  guestSnapshot?: GuestMigrationSnapshot,
  newsOptIn?: boolean,
) {
  if (guestMigrationInProgress) throw new Error('Ya hay un registro en curso.');
  const normalizedEmail = email.trim().toLowerCase();
  const existing = readGuestMigration();
  if (existing && existing.email !== normalizedEmail) {
    throw new Error('Hay datos pendientes de otro registro. No se importaran a una cuenta diferente.');
  }
  if (existing?.inFlight) {
    throw new Error('La importacion anterior quedo sin confirmar. Se conserva el pendiente y se bloquea el reintento para evitar duplicados.');
  }
  if ((guestSnapshot || newsOptIn) && !existing) {
    storeGuestMigration({
      email: normalizedEmail,
      newsOptIn: Boolean(newsOptIn),
      snapshot: guestSnapshot ?? { pets: [], clinicalEntries: [], preventiveTasks: [], chatMessages: [] },
      petIds: {}, completed: [],
    });
  }
  guestMigrationInProgress = true;
  try {
    const { data, error } = await supabase.auth.signUp({ email: normalizedEmail, password });
    if (error) throw error;
    const pending = readGuestMigration();
    if (pending && data.user && !pending.userId) {
      pending.userId = data.user.id;
      storeGuestMigration(pending);
    }
    if (data.user && data.session) {
      await ensureUserBootstrap(data.user.id, data.user.email ?? null);
      await migrateGuestSnapshot(data.user.id, data.user.email ?? normalizedEmail);
    }
    return data;
  } finally {
    guestMigrationInProgress = false;
    window.dispatchEvent(new Event('aipetfriendly:guest-migrated'));
  }
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) {
    throw error;
  }
}

export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    throw error;
  }
}
