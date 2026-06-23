import { useEffect } from 'react';
import { supabase, fetchUserProfile, fetchPets } from '../lib/supabase';
import { useAppState } from '../context/AppStateContext';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

export function useSupabaseSync() {
  const {
    setPets,
    setClinicalEntries,
    setPreventiveTasks,
    setChatMessages,
    setUser: contextSetUser,
  } = useAppState();

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

        // Cargar perfil de usuario
        const userProfile = await fetchUserProfile(authUser.id);
        if (userProfile) {
          contextSetUser(userProfile);

          // Cargar mascotas
          const pets = await fetchPets(authUser.id);
          setPets(pets);
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
        contextSetUser(null);
        setPets([]);
        setClinicalEntries([]);
        setPreventiveTasks([]);
        setChatMessages([]);
      } else if (event === 'SIGNED_IN' && session.user) {
        const userProfile = await fetchUserProfile(session.user.id);
        if (userProfile) {
          contextSetUser(userProfile);
          const pets = await fetchPets(session.user.id);
          setPets(pets);
        }
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [contextSetUser, setChatMessages, setClinicalEntries, setPreventiveTasks, setPets]);
}

export async function signUpWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  // Crear perfil de usuario
  if (data.user) {
    await supabase.from('users').insert([
      {
        id: data.user.id,
        email: data.user.email,
        full_name: '',
      },
    ]);

    // Crear suscripcion por defecto (free)
    await supabase.from('subscriptions').insert([
      {
        user_id: data.user.id,
        plan: 'free',
        is_active: false,
      },
    ]);
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
