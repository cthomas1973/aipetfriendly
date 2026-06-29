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

function categoryLabel(category: ClinicalEntryCategory): string {
  const labels: Record<ClinicalEntryCategory, string> = {
    medication: 'Medicamento',
    deworming: 'Desparasitario',
    vaccine: 'Vacuna',
    treatment: 'Tratamiento',
    clinical_note: 'Nota clinica',
  };
  return labels[category] ?? category;
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

      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 14;
      const footerY = pageHeight - 8;
      let y = 12;

      const logoData = logoUrl ? await imageToDataUrl(logoUrl) : null;
      const petPhoto = selectedPet.photoUrl ? await imageToDataUrl(selectedPet.photoUrl) : null;

      const drawHeader = () => {
        doc.setFillColor(16, 185, 129);
        doc.roundedRect(marginX, 10, pageWidth - marginX * 2, 18, 2, 2, 'F');

        if (logoData) {
          const logoFormat = logoData.startsWith('data:image/png') ? 'PNG' : 'JPEG';
          doc.addImage(logoData, logoFormat, marginX + 2, 12.5, 12, 12);
        }

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('AiPetFriendly - Informe Clinico', logoData ? marginX + 17 : marginX + 3, 18);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(new Date().toLocaleDateString(), pageWidth - marginX - 2, 18, { align: 'right' });
        doc.setTextColor(15, 23, 42);
      };

      const drawTimelineTitle = () => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(30, 41, 59);
        doc.text('Linea de tiempo clinica', marginX, y);
        doc.setDrawColor(203, 213, 225);
        doc.line(marginX, y + 1.5, pageWidth - marginX, y + 1.5);
        y += 8;
      };

      drawHeader();
      y = 36;

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(marginX, y, pageWidth - marginX * 2, 36, 3, 3, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(`Mascota: ${selectedPet.name}`, marginX + 4, y + 8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Raza: ${selectedPet.breed} | Especie: ${selectedPet.species}`, marginX + 4, y + 14);
      doc.text(
        `Sexo: ${selectedPet.sex} | Edad: ${selectedPet.ageYears}a ${selectedPet.ageMonths}m | Peso: ${selectedPet.weightKg} kg`,
        marginX + 4,
        y + 20,
      );

      const tutorLine = doc.splitTextToSize(`Tutor: ${user?.email ?? 'N/D'}`, pageWidth - marginX * 2 - 40);
      doc.text(tutorLine, marginX + 4, y + 26);

      if (petPhoto) {
        const petFormat = petPhoto.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.setDrawColor(148, 163, 184);
        doc.roundedRect(pageWidth - marginX - 28, y + 4, 24, 24, 2, 2);
        doc.addImage(petPhoto, petFormat, pageWidth - marginX - 27, y + 5, 22, 22);
      }

      y += 44;
      drawTimelineTitle();

      const entries = sortTimeline(
        clinicalEntries.filter((entry) => entry.petId === selectedPet.id),
      );

      if (entries.length === 0) {
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(marginX, y, pageWidth - marginX * 2, 18, 2, 2, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text('No hay registros clinicos para esta mascota.', marginX + 4, y + 11);
      }

      for (const entry of entries) {
        const dateLabel = new Date(entry.eventDate).toLocaleDateString();
        const chip = categoryLabel(entry.category);
        const description = doc.splitTextToSize(entry.description, pageWidth - marginX * 2 - 8);
        const cardHeight = 20 + description.length * 4.8;

        if (y + cardHeight > footerY - 8) {
          doc.addPage();
          drawHeader();
          y = 36;
          drawTimelineTitle();
        }

        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(marginX, y, pageWidth - marginX * 2, cardHeight, 2, 2, 'FD');

        doc.setFillColor(236, 253, 245);
        doc.setDrawColor(110, 231, 183);
        doc.roundedRect(marginX + 4, y + 4, 33, 6, 1.5, 1.5, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(6, 95, 70);
        doc.text(chip, marginX + 6, y + 8.2);

        doc.setTextColor(71, 85, 105);
        doc.setFontSize(8.5);
        doc.text(dateLabel, pageWidth - marginX - 4, y + 8.2, { align: 'right' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(15, 23, 42);
        doc.text(entry.title, marginX + 4, y + 14);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(51, 65, 85);
        doc.text(description, marginX + 4, y + 19);

        y += cardHeight + 5;
      }

      const totalPages = doc.getNumberOfPages();
      for (let page = 1; page <= totalPages; page += 1) {
        doc.setPage(page);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Pagina ${page} de ${totalPages}`, pageWidth - marginX, footerY, { align: 'right' });
      }

      const output = doc.output('blob');
      const safePetName = selectedPet.name.toLowerCase().replace(/\s+/g, '-');
      const fileName = `informe-clinico-${safePetName}.pdf`;
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
          petName: selectedPet?.name ?? '',
        }),
      });

      if (!response.ok) {
        let detail = '';
        try {
          const payload = await response.json();
          detail = typeof payload?.error === 'string' ? payload.error : '';
        } catch {
          detail = '';
        }
        throw new Error(detail || 'No se pudo enviar el PDF por email.');
      }
    },
    [generateClinicalPdf, selectedPet?.name, subscription.isPremiumUser],
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
