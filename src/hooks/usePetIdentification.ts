import { useCallback } from 'react';
import { useAppState } from '../context/AppStateContext';
import {
  createPetTagRequest,
  fetchLinkedPetTagCode,
  fetchPetSightingMessages,
  fetchPetTagRequest,
  linkPetTagCode,
  markSightingMessageRead,
  unlinkPetTagCode,
} from '../lib/supabase';
import { buildPetPosterPdf } from '../lib/petPosterPdf';
import { buildPetPosterImage } from '../lib/petPosterImage';
import { posterAccessError, tagRequestAccessError } from '../lib/petAccess';
import type { Pet, PetSightingSource } from '../types';

export function buildPetPublicUrl(pet: Pet, source: PetSightingSource): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.aipetfriendly.ar';
  const code = pet.publicCode ?? '';
  return `${origin}/mascota/${code}?src=${source}`;
}

export function usePetIdentification() {
  const { user, subscription } = useAppState();

  const getMessages = useCallback(async (petId: string) => {
    return fetchPetSightingMessages(petId);
  }, []);

  const markMessageRead = useCallback(async (messageId: string) => {
    const ok = await markSightingMessageRead(messageId);
    if (!ok) {
      throw new Error('No se pudo marcar el mensaje como leido.');
    }
  }, []);

  const getTagRequest = useCallback(async (petId: string) => {
    return fetchPetTagRequest(petId);
  }, []);

  const requestTag = useCallback(
    async (petId: string) => {
      // La chapita fisica sigue siendo un beneficio Premium (sin cambios).
      const accessError = tagRequestAccessError(user, subscription.isPremiumUser);
      if (accessError) {
        throw new Error(accessError);
      }
      const created = await createPetTagRequest(petId, user!.id);
      if (!created) {
        throw new Error('No se pudo registrar la solicitud de chapita.');
      }
      return created;
    },
    [subscription.isPremiumUser, user],
  );

  const generatePosterPdf = useCallback(
    async (
      pet: Pet,
      logoUrl?: string,
      posterInfo?: { lostDate?: string; lostPlace?: string; contactPhone?: string; distinguishingMarks?: string; extraMessage?: string },
    ) => {
      // El cartel de busqueda esta disponible para cualquier usuario con
      // sesion y mascota propia con codigo publico, incluso en plan Free y
      // sobre mascotas protegidas (decision de producto Fase 7.2.2). No es
      // una funcion Premium: se genera en frontend y no habilita escritura.
      const accessError = posterAccessError(user, pet);
      if (accessError) {
        throw new Error(accessError);
      }
      return buildPetPosterPdf({
        pet,
        publicUrl: buildPetPublicUrl(pet, 'cartel'),
        logoUrl,
        lostDate: posterInfo?.lostDate,
        lostPlace: posterInfo?.lostPlace,
        contactPhone: posterInfo?.contactPhone,
        distinguishingMarks: posterInfo?.distinguishingMarks,
        extraMessage: posterInfo?.extraMessage,
      });
    },
    [user],
  );

  const generatePosterImage = useCallback(
    async (
      pet: Pet,
      logoUrl?: string,
      posterInfo?: { lostDate?: string; lostPlace?: string; contactPhone?: string; distinguishingMarks?: string; extraMessage?: string },
    ) => {
      // Misma regla que el PDF: disponible tambien para Free (ver arriba).
      const accessError = posterAccessError(user, pet);
      if (accessError) {
        throw new Error(accessError);
      }
      return buildPetPosterImage({
        pet,
        publicUrl: buildPetPublicUrl(pet, 'cartel'),
        logoUrl,
        lostDate: posterInfo?.lostDate,
        lostPlace: posterInfo?.lostPlace,
        contactPhone: posterInfo?.contactPhone,
        distinguishingMarks: posterInfo?.distinguishingMarks,
        extraMessage: posterInfo?.extraMessage,
      });
    },
    [user],
  );

  const getLinkedTagCode = useCallback(async (petId: string) => {
    return fetchLinkedPetTagCode(petId);
  }, []);

  const linkTagCode = useCallback(
    async (petId: string, code: string) => {
      if (!user || user.isGuest) {
        throw new Error('Debes iniciar sesion para vincular una chapita.');
      }
      await linkPetTagCode(code, petId);
    },
    [user],
  );

  const unlinkTagCode = useCallback(async (petId: string) => {
    await unlinkPetTagCode(petId);
  }, []);

  return {
    getMessages,
    markMessageRead,
    getTagRequest,
    requestTag,
    generatePosterPdf,
    generatePosterImage,
    getLinkedTagCode,
    linkTagCode,
    unlinkTagCode,
  };
}
