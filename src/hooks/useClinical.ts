import { useCallback, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { useAppState } from '../context/AppStateContext';
import { createClinicalEntry } from '../lib/supabase';
import type {
  ClinicalEntryCategory,
  ClinicalNoteFormData,
  ClinicalTimelineEntry,
  Pet,
} from '../types';

async function imageToDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string) ?? null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function sortTimeline(entries: ClinicalTimelineEntry[]) {
  return [...entries].sort(
    (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime(),
  );
}

export function useClinical() {
  const { clinicalEntries, pets, selectedPetId, setClinicalEntries, user, subscription } = useAppState();
  const [activeFilter, setActiveFilter] = useState<ClinicalEntryCategory | 'all'>('all');

  const selectedPet: Pet | null = useMemo(
    () => pets.find((pet) => pet.id === selectedPetId) ?? null,
    [pets, selectedPetId],
  );

  const timeline = useMemo(() => {
    if (!selectedPetId) {
      return [];
    }
    const byPet = clinicalEntries.filter((entry) => entry.petId === selectedPetId);
    const byFilter =
      activeFilter === 'all'
        ? byPet
        : byPet.filter((entry) => entry.category === activeFilter);
    return sortTimeline(byFilter);
  }, [activeFilter, clinicalEntries, selectedPetId]);

  const addClinicalNote = useCallback(
    async (data: ClinicalNoteFormData) => {
      if (!user) {
        throw new Error('Debes iniciar sesion para registrar notas clinicas.');
      }

      if (user.isGuest) {
        const entry: ClinicalTimelineEntry = {
          id: crypto.randomUUID(),
          petId: data.petId,
          category: data.category,
          title: data.title,
          description: data.content,
          eventDate: data.eventDate,
          createdAt: new Date().toISOString(),
        };
        setClinicalEntries([entry, ...clinicalEntries]);
        return entry;
      }

      const saved = await createClinicalEntry(data.petId, {
        category: data.category,
        title: data.title,
        description: data.content,
        eventDate: data.eventDate,
      });

      if (!saved) {
        throw new Error('No se pudo guardar la nota clinica en Supabase.');
      }

      setClinicalEntries([saved, ...clinicalEntries]);
      return saved;
    },
    [clinicalEntries, setClinicalEntries, user],
  );

  const generateClinicalPdf = useCallback(
    async (logoUrl?: string) => {
      if (!selectedPet) {
        throw new Error('Selecciona una mascota antes de descargar el PDF.');
      }
      if (!subscription.isPremiumUser) {
        throw new Error('La descarga de PDF avanzada es exclusiva para Premium.');
      }

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      let y = 20;

      const logoData = logoUrl ? await imageToDataUrl(logoUrl) : null;
      if (logoData) {
        doc.addImage(logoData, 'PNG', 14, 10, 20, 20);
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('AiPetFriendly - Informe Clinico', logoData ? 40 : 14, 20);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      y = 36;
      doc.text(`Mascota: ${selectedPet.name}`, 14, y);
      y += 6;
      doc.text(`Raza: ${selectedPet.breed} | Especie: ${selectedPet.species}`, 14, y);
      y += 6;
      doc.text(
        `Sexo: ${selectedPet.sex} | Edad: ${selectedPet.ageYears}a ${selectedPet.ageMonths}m | Peso: ${selectedPet.weightKg} kg`,
        14,
        y,
      );
      y += 6;
      doc.text(`Tutor: ${user?.email ?? 'N/D'}`, 14, y);
      y += 8;

      if (selectedPet.photoUrl) {
        const petPhoto = await imageToDataUrl(selectedPet.photoUrl);
        if (petPhoto) {
          doc.addImage(petPhoto, 'JPEG', pageWidth - 50, 12, 30, 30);
        }
      }

      doc.setFont('helvetica', 'bold');
      doc.text('Linea de tiempo clinica', 14, y);
      y += 8;

      const entries = sortTimeline(
        clinicalEntries.filter((entry) => entry.petId === selectedPet.id),
      );

      doc.setFont('helvetica', 'normal');
      for (const entry of entries) {
        const row = `${new Date(entry.eventDate).toLocaleDateString()} | ${entry.category.toUpperCase()} | ${entry.title}`;
        const wrapped = doc.splitTextToSize(`${row} - ${entry.description}`, pageWidth - 28);
        doc.text(wrapped, 14, y);
        y += wrapped.length * 6;

        if (y > 270) {
          doc.addPage();
          y = 20;
        }
      }

      const output = doc.output('blob');
      const fileName = `informe-clinico-${selectedPet.name.toLowerCase()}.pdf`;
      return { fileName, blob: output };
    },
    [clinicalEntries, selectedPet, subscription.isPremiumUser, user?.email],
  );

  const sendClinicalPdfByEmail = useCallback(
    async (email: string, logoUrl?: string) => {
      if (!subscription.isPremiumUser) {
        throw new Error('El envio de PDF por email es exclusivo para Premium.');
      }

      const pdf = await generateClinicalPdf(logoUrl);
      const arrayBuffer = await pdf.blob.arrayBuffer();
      const bytes = Array.from(new Uint8Array(arrayBuffer));

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

      if (!supabaseUrl || !anonKey) {
        throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en variables de entorno.');
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/send-clinical-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          email,
          fileName: pdf.fileName,
          pdfBytes: bytes,
        }),
      });

      if (!response.ok) {
        throw new Error('No se pudo enviar el PDF por email.');
      }
    },
    [generateClinicalPdf, subscription.isPremiumUser],
  );

  return {
    selectedPet,
    timeline,
    activeFilter,
    setActiveFilter,
    addClinicalNote,
    generateClinicalPdf,
    sendClinicalPdfByEmail,
  };
}
