import { useCallback } from 'react';
import { useAppState } from '../context/AppStateContext';
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
    (data: PetFormData) => {
      if (!user) {
        throw new Error('Debes iniciar sesion para registrar mascotas.');
      }
      if (!subscription.canAddPet) {
        throw new Error('Limite de mascotas alcanzado en plan gratis.');
      }

      const now = new Date().toISOString();
      const nextPet: Pet = {
        id: crypto.randomUUID(),
        userId: user.id,
        createdAt: now,
        updatedAt: now,
        ...data,
      };

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
    (petId: string) => {
      const nextPets = pets.filter((pet) => pet.id !== petId);
      setPets(nextPets);
      if (selectedPetId === petId) {
        setSelectedPetId(nextPets[0]?.id ?? null);
      }
    },
    [pets, selectedPetId, setPets, setSelectedPetId],
  );

  const selectPet = useCallback(
    (petId: string) => {
      setSelectedPetId(petId);
    },
    [setSelectedPetId],
  );

  const updatePet = useCallback(
    (petId: string, updates: Partial<Pet>) => {
      setPets(pets.map(p => p.id === petId ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p));
    },
    [pets, setPets],
  );

  return {
    pets,
    selectedPetId,
    canAddPet: subscription.canAddPet,
    freePetLimit: subscription.freePetLimit,
    addPet,
    removePet,
    selectPet,
    updatePet,
  };
}
