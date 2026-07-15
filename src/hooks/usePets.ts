import { useCallback } from 'react';
import { useAppState } from '../context/AppStateContext';
import { createPet, deletePet, updatePetRecord } from '../lib/supabase';
import type { Pet, PetFormData } from '../types';

export function usePets() {
  const {
    pets,
    selectedPetId,
    subscription,
    user,
    setPets,
    setSelectedPetId,
  } = useAppState();

  const addPet = useCallback(
    async (data: PetFormData) => {
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
    [pets, selectedPetId, setPets, setSelectedPetId, subscription.canAddPet, user],
  );

  const removePet = useCallback(
    async (petId: string) => {
      if (user?.isGuest) {
        const nextPets = pets.filter((pet) => pet.id !== petId);
        setPets(nextPets);
        if (selectedPetId === petId) {
          setSelectedPetId(nextPets[0]?.id ?? null);
        }
        return;
      }

      const deleted = await deletePet(petId);
      if (!deleted) {
        throw new Error('No se pudo eliminar la mascota en Supabase.');
      }

      const nextPets = pets.filter((pet) => pet.id !== petId);
      setPets(nextPets);
      if (selectedPetId === petId) {
        setSelectedPetId(nextPets[0]?.id ?? null);
      }
    },
    [pets, selectedPetId, setPets, setSelectedPetId, user?.isGuest],
  );

  const selectPet = useCallback(
    (petId: string) => {
      setSelectedPetId(petId);
    },
    [setSelectedPetId],
  );

  const updatePet = useCallback(
    async (petId: string, updates: Partial<Pet>) => {
      if (user?.isGuest) {
        setPets(pets.map(p => p.id === petId ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p));
        return;
      }

      const updated = await updatePetRecord(petId, updates);
      if (!updated) {
        throw new Error('No se pudo actualizar la mascota en Supabase.');
      }

      setPets(pets.map((pet) => (pet.id === petId ? updated : pet)));
    },
    [pets, setPets, user?.isGuest],
  );

  return {
    pets,
    selectedPetId,
    canAddPet: user?.isGuest ? true : subscription.canAddPet,
    freePetLimit: subscription.freePetLimit,
    addPet,
    removePet,
    selectPet,
    updatePet,
  };
}
