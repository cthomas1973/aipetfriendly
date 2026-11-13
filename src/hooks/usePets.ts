import { useCallback } from 'react';
import { useAppState, useSessionGuard } from '../context/AppStateContext';
import { createPet, deletePet, fetchUserProfile, updatePetRecord, updateUserActivePet } from '../lib/supabase';
import {
  PET_ACCESS_MESSAGES,
  isRecoveryOnlyPetUpdate,
} from '../lib/petAccess';
import type { Pet, PetFormData } from '../types';

export function usePets() {
  const {
    pets,
    selectedPetId,
    subscription,
    user,
    setPets,
    setSelectedPetId,
    setUser,
  } = useAppState();
  const assertCurrentSession = useSessionGuard(user?.id);

  const addPet = useCallback(
    async (data: PetFormData) => {
      assertCurrentSession();
      if (user?.isGuest) {
        const now = new Date().toISOString();
        const nextPet: Pet = {
          id: crypto.randomUUID(),
          userId: user.id,
          name: data.name,
          breed: data.breed,
          species: data.species,
          sex: data.sex,
          birthDate: data.birthDate,
          ageYears: data.ageYears,
          ageMonths: data.ageMonths,
          weightKg: data.weightKg,
          photoUrl: data.photoUrl,
          notes: data.notes,
          createdAt: now,
          updatedAt: now,
        };

        const nextPets = [nextPet, ...pets];
        setPets(nextPets);
        if (!selectedPetId) {
          setSelectedPetId(nextPet.id);
        }
        return nextPet;
      }

      if (!user) {
        throw new Error('Debes iniciar sesion para registrar mascotas.');
      }
      if (!subscription.canAddPet) {
        throw new Error('Limite de mascotas alcanzado en plan gratis.');
      }

      const nextPet = await createPet(user.id, data);
      assertCurrentSession();
      if (!nextPet) {
        throw new Error('No se pudo guardar la mascota en Supabase.');
      }

      const nextPets = [nextPet, ...pets];
      setPets(nextPets);
      if (!selectedPetId) {
        setSelectedPetId(nextPet.id);
      }
      return nextPet;
    },
    [pets, selectedPetId, setPets, setSelectedPetId, subscription.canAddPet, user, assertCurrentSession],
  );

  const removePet = useCallback(
    async (petId: string) => {
      assertCurrentSession();
      if (user?.isGuest) {
        const nextPets = pets.filter((pet) => pet.id !== petId);
        setPets(nextPets);
        if (selectedPetId === petId) {
          setSelectedPetId(nextPets[0]?.id ?? null);
        }
        return;
      }

      const deleted = await deletePet(petId);
      assertCurrentSession();
      if (!deleted) {
        throw new Error('No se pudo eliminar la mascota en Supabase.');
      }

      const nextPets = pets.filter((pet) => pet.id !== petId);
      setPets(nextPets);
      if (selectedPetId === petId) {
        setSelectedPetId(nextPets[0]?.id ?? null);
      }
      // Si se elimino la mascota activa, el servidor (067) deja active_pet_id
      // en null y resetea el cooldown: reflejarlo localmente para permitir
      // elegir otra de inmediato.
      if (user && !user.isGuest && subscription.activePetId === petId) {
        setUser({ ...user, activePetId: null, activePetChangedAt: null });
      }
    },
    [pets, selectedPetId, setPets, setSelectedPetId, setUser, subscription.activePetId, user, assertCurrentSession],
  );

  const selectPet = useCallback(
    (petId: string) => {
      setSelectedPetId(petId);
    },
    [setSelectedPetId],
  );

  const updatePet = useCallback(
    async (petId: string, updates: Partial<Pet>) => {
      assertCurrentSession();
      if (user?.isGuest) {
        setPets(pets.map(p => p.id === petId ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p));
        return;
      }

      // Excepcion de recuperacion: una mascota protegida solo admite cambios
      // de foto y señas particulares (espejo de la 067; RLS lo impone en el
      // servidor cuando la migracion este aplicada).
      if (!subscription.isPetEditable(petId) && !isRecoveryOnlyPetUpdate(updates)) {
        throw new Error(PET_ACCESS_MESSAGES.protectedPetEdit);
      }

      const updated = await updatePetRecord(petId, updates);
      assertCurrentSession();
      if (!updated) {
        throw new Error('No se pudo actualizar la mascota en Supabase.');
      }

      setPets(pets.map((pet) => (pet.id === petId ? updated : pet)));
    },
    [pets, setPets, subscription, user?.isGuest, assertCurrentSession],
  );

  // Selecciona la mascota activa del plan Free (persistida en
  // users.active_pet_id). El trigger del servidor valida propiedad y cooldown;
  // tras persistir se refresca el perfil para tomar el active_pet_changed_at
  // real que escribio el trigger.
  const selectActivePet = useCallback(
    async (petId: string) => {
      assertCurrentSession();
      if (!user || user.isGuest) {
        throw new Error(PET_ACCESS_MESSAGES.needsAccount);
      }
      if (!subscription.activePetSupport) {
        throw new Error(PET_ACCESS_MESSAGES.selectionUnavailable);
      }
      if (!pets.some((pet) => pet.id === petId)) {
        throw new Error('La mascota seleccionada no existe.');
      }

      await updateUserActivePet(user.id, petId);
      assertCurrentSession();

      const refreshed = await fetchUserProfile(user.id);
      assertCurrentSession();
      if (refreshed) {
        setUser(refreshed);
      } else {
        // Respaldo si el refetch falla: reflejar la seleccion localmente.
        setUser({ ...user, activePetId: petId, activePetChangedAt: new Date().toISOString() });
      }
    },
    [pets, setUser, subscription.activePetSupport, user, assertCurrentSession],
  );

  return {
    pets,
    selectedPetId,
    canAddPet: user?.isGuest ? true : subscription.canAddPet,
    freePetLimit: subscription.freePetLimit,
    isPetEditable: subscription.isPetEditable,
    activePetId: subscription.activePetId,
    needsActivePetSelection: subscription.needsActivePetSelection,
    activePetCooldownUntil: subscription.activePetCooldownUntil,
    activePetSupport: subscription.activePetSupport,
    addPet,
    removePet,
    selectPet,
    updatePet,
    selectActivePet,
  };
}
