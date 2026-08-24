import { useEffect, useRef } from 'react';
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

async function ensureUserBootstrap(userId: string, email: string | null) {
  const { error: userError } = await supabase.from('users').upsert(
    {
      id: userId,
      email: email ?? '',
      full_name: '',
    },
    { onConflict: 'id' },
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
    { onConflict: 'user_id' },
  );

  if (subscriptionError) {
    throw subscriptionError;
  }
}

function storeGuestMigration(snapshot: GuestMigrationSnapshot) {
  sessionStorage.setItem(GUEST_MIGRATION_KEY, JSON.stringify(snapshot));
}

function readGuestMigration(): GuestMigrationSnapshot | null {
  const raw = sessionStorage.getItem(GUEST_MIGRATION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as GuestMigrationSnapshot;
  } catch {
    return null;
  }
}

async function migrateGuestSnapshot(userId: string, snapshot: GuestMigrationSnapshot) {
  const petIdMap = new Map<string, string>();

  for (const pet of snapshot.pets) {
    const migrated = await createPet(userId, pet as PetFormData);
    if (migrated) {
      petIdMap.set(pet.id, migrated.id);
    }
  }

  for (const entry of snapshot.clinicalEntries) {
    const nextPetId = petIdMap.get(entry.petId);
    if (!nextPetId) {
      continue;
    }

    await createClinicalEntry(nextPetId, {
      category: entry.category,
      title: entry.title,
      description: entry.description,
      eventDate: entry.eventDate,
      metadata: entry.metadata,
    });
  }

  for (const task of snapshot.preventiveTasks) {
    const nextPetId = petIdMap.get(task.petId);
    if (!nextPetId) {
      continue;
    }

    await createPreventiveTask(nextPetId, {
      title: task.title,
      category: task.category,
      dueDate: task.dueDate,
      completed: task.completed,
      notes: task.notes,
    });
  }

  for (const message of snapshot.chatMessages) {
    await createChatMessage(userId, message.petId ?? null, message.role, message.content);
  }
}

export function useSupabaseSync() {
  const {
    user,
    setPets,
    setClinicalEntries,
    setPreventiveTasks,
    setChatMessages,
    setAdminUsers,
    setUser: contextSetUser,
  } = useAppState();

  // Se usa dentro del listener de Supabase (que se suscribe una sola vez al
  // montar) para saber, en cada evento, si el usuario actual en pantalla es
  // un invitado (auto-guest). Sin esto, el evento inicial de
  // onAuthStateChange (sin sesion real) pisaba el usuario invitado con null
  // apenas cargaba la app, mostrando la landing en vez del modo visitante.
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    const initializeSupabase = async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

        // Si no hay variables, modo desarrollo local sin Supabase
        if (!supabaseUrl || !supabaseAnonKey) {
          console.warn('Modo desarrollo: Supabase no configurado. Usando estado local.');
          return;
        }

        // Obtener usuario autenticado actual
        const {
          data: { user: authUser },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !authUser) {
          return;
        }

        await ensureUserBootstrap(authUser.id, authUser.email ?? null);

        const storedGuestMigration = !guestMigrationInProgress ? readGuestMigration() : null;
        if (storedGuestMigration) {
          guestMigrationInProgress = true;
          await migrateGuestSnapshot(authUser.id, storedGuestMigration);
          sessionStorage.removeItem(GUEST_MIGRATION_KEY);
          guestMigrationInProgress = false;
        }

        // Cargar perfil de usuario
        const userProfile = await fetchUserProfile(authUser.id);
        if (userProfile) {
          contextSetUser(userProfile);

          // Cargar mascotas
          const pets = await fetchPets(authUser.id);
          setPets(pets);

          const [clinicalByPet, preventiveByPet, chatMessages] = await Promise.all([
            Promise.all(pets.map((pet) => fetchClinicalEntries(pet.id))),
            Promise.all(pets.map((pet) => fetchPreventiveTasks(pet.id))),
            fetchChatMessages(authUser.id),
          ]);

          setClinicalEntries(clinicalByPet.flat());
          setPreventiveTasks(preventiveByPet.flat());
          setChatMessages(chatMessages);
        }
      } catch (err) {
        console.error('Error initializing Supabase:', err);
      }
    };

    initializeSupabase();

    // Escuchar cambios de sesion
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      if (event === 'SIGNED_OUT' || !session) {
        // Si el usuario actual es un invitado (auto-guest o manual), no hay
        // sesion real que "cerrar": no lo pisamos con null.
        if (userRef.current?.isGuest) {
          return;
        }
        contextSetUser(null);
        setPets([]);
        setClinicalEntries([]);
        setPreventiveTasks([]);
        setChatMessages([]);
        setAdminUsers([]);
      } else if (event === 'SIGNED_IN' && session.user) {
        await ensureUserBootstrap(session.user.id, session.user.email ?? null);
        const storedGuestMigration = !guestMigrationInProgress ? readGuestMigration() : null;
        if (storedGuestMigration) {
          guestMigrationInProgress = true;
          await migrateGuestSnapshot(session.user.id, storedGuestMigration);
          sessionStorage.removeItem(GUEST_MIGRATION_KEY);
          guestMigrationInProgress = false;
        }
        const userProfile = await fetchUserProfile(session.user.id);
        if (userProfile) {
          contextSetUser(userProfile);
          const pets = await fetchPets(session.user.id);
          setPets(pets);

          const [clinicalByPet, preventiveByPet, chatMessages] = await Promise.all([
            Promise.all(pets.map((pet) => fetchClinicalEntries(pet.id))),
            Promise.all(pets.map((pet) => fetchPreventiveTasks(pet.id))),
            fetchChatMessages(session.user.id),
          ]);

          setClinicalEntries(clinicalByPet.flat());
          setPreventiveTasks(preventiveByPet.flat());
          setChatMessages(chatMessages);
        }
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [contextSetUser, setAdminUsers, setChatMessages, setClinicalEntries, setPreventiveTasks, setPets]);
}

export async function signUpWithEmail(
  email: string,
  password: string,
  guestSnapshot?: GuestMigrationSnapshot,
  newsOptIn?: boolean,
) {
  if (guestSnapshot) {
    guestMigrationInProgress = true;
    storeGuestMigration(guestSnapshot);
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  // Crear perfil de usuario y suscripcion inicial
  if (data.user) {
    await ensureUserBootstrap(data.user.id, data.user.email ?? null);

    // Consentimiento explicito para recibir novedades por email (opt-in, no se marca solo).
    if (newsOptIn) {
      const { error: newsOptInError } = await supabase
        .from('users')
        .update({
          news_opt_in: true,
          news_opt_in_at: new Date().toISOString(),
          news_opt_in_source: 'registro',
        })
        .eq('id', data.user.id);

      if (newsOptInError) {
        console.error('Error guardando consentimiento de novedades:', newsOptInError);
      }
    }

    if (guestSnapshot) {
      await migrateGuestSnapshot(data.user.id, guestSnapshot);
      sessionStorage.removeItem(GUEST_MIGRATION_KEY);
      guestMigrationInProgress = false;
    }
  }

  if (guestSnapshot && !data.user) {
    guestMigrationInProgress = false;
  }

  return data;
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
