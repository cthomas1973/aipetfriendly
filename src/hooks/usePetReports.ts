import { useCallback, useMemo } from 'react';
import { useAppState } from '../context/AppStateContext';
import { buildTimelineReportPdf } from '../lib/reportPdf';
import type { ClinicalTimelineEntry, Pet } from '../types';

function sortByEventDateDesc(entries: ClinicalTimelineEntry[]) {
  return [...entries].sort(
    (a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime(),
  );
}

// Prefijos de los segmentos (separados por " | " en preventiveDescription) que
// corresponden a recordatorios/notificaciones y que no queremos mostrar en los
// cuadros de "ultimo registro" de la libreta sanitaria (solo interesa la nota clinica).
const REMINDER_NOISE_PREFIXES = [
  'recordatorios:',
  'antelacion aviso:',
  'medios aviso:',
  'email notificacion:',
  'celular notificacion:',
  'notificacion:',
];

function cleanNoteForSummary(description: string): string {
  const cleaned = description
    .split('|')
    .map((segment) => segment.trim())
    .filter((segment) => {
      const lower = segment.toLowerCase();
      return segment.length > 0 && !REMINDER_NOISE_PREFIXES.some((prefix) => lower.startsWith(prefix));
    })
    .join(' | ');
  return cleaned.length > 0 ? cleaned : 'Sin notas adicionales.';
}

export interface HealthSummaryCard {
  lastEntry: ClinicalTimelineEntry | null;
  cleanedNote: string;
  nextDate: string | null;
}

function buildHealthSummary(entries: ClinicalTimelineEntry[]): HealthSummaryCard {
  const now = Date.now();
  const past = entries.filter((entry) => new Date(entry.eventDate).getTime() <= now);
  const future = entries.filter((entry) => new Date(entry.eventDate).getTime() > now);

  const lastEntry = past.length > 0 ? sortByEventDateDesc(past)[0] : null;
  const nextEntry = future.length > 0
    ? [...future].sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime())[0]
    : null;

  return {
    lastEntry,
    cleanedNote: lastEntry ? cleanNoteForSummary(lastEntry.description) : '',
    nextDate: nextEntry ? nextEntry.eventDate : null,
  };
}

async function sendPdfByEmail(args: {
  email: string;
  pdf: { fileName: string; blob: Blob };
  petName: string;
  reportTitle: string;
}) {
  const arrayBuffer = await args.pdf.blob.arrayBuffer();
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
      email: args.email,
      fileName: args.pdf.fileName,
      pdfBytes: bytes,
      petName: args.petName,
      reportTitle: args.reportTitle,
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
}

export function usePetReports() {
  const { clinicalEntries, pets, selectedPetId, user, subscription } = useAppState();

  const selectedPet: Pet | null = useMemo(
    () => pets.find((pet) => pet.id === selectedPetId) ?? null,
    [pets, selectedPetId],
  );

  const healthBookletEntries = useMemo(() => {
    if (!selectedPetId) return [];
    return sortByEventDateDesc(
      clinicalEntries.filter(
        (entry) => entry.petId === selectedPetId && (entry.category === 'vaccine' || entry.category === 'deworming'),
      ),
    );
  }, [clinicalEntries, selectedPetId]);

  const medicationLogEntries = useMemo(() => {
    if (!selectedPetId) return [];
    return sortByEventDateDesc(
      clinicalEntries.filter((entry) => entry.petId === selectedPetId && entry.category === 'medication'),
    );
  }, [clinicalEntries, selectedPetId]);

  const lastVaccineSummary = useMemo(
    () => buildHealthSummary(healthBookletEntries.filter((entry) => entry.category === 'vaccine')),
    [healthBookletEntries],
  );

  const lastDewormingSummary = useMemo(
    () => buildHealthSummary(healthBookletEntries.filter((entry) => entry.category === 'deworming')),
    [healthBookletEntries],
  );

  const generateHealthBookletPdf = useCallback(
    async (logoUrl?: string) => {
      if (!selectedPet) {
        throw new Error('Selecciona una mascota antes de descargar el PDF.');
      }
      if (!subscription.isPremiumUser) {
        throw new Error('La descarga de PDF avanzada es exclusiva para Premium.');
      }

      return buildTimelineReportPdf({
        pet: selectedPet,
        ownerEmail: user?.email ?? '',
        entries: healthBookletEntries,
        reportHeaderTitle: 'AiPetFriendly - Libreta Sanitaria',
        sectionTitle: 'Vacunas y desparasitaciones',
        emptyMessage: 'No hay vacunas ni desparasitaciones registradas para esta mascota.',
        fileNamePrefix: 'libreta-sanitaria',
        logoUrl,
      });
    },
    [healthBookletEntries, selectedPet, subscription.isPremiumUser, user?.email],
  );

  const generateMedicationLogPdf = useCallback(
    async (logoUrl?: string) => {
      if (!selectedPet) {
        throw new Error('Selecciona una mascota antes de descargar el PDF.');
      }
      if (!subscription.isPremiumUser) {
        throw new Error('La descarga de PDF avanzada es exclusiva para Premium.');
      }

      return buildTimelineReportPdf({
        pet: selectedPet,
        ownerEmail: user?.email ?? '',
        entries: medicationLogEntries,
        reportHeaderTitle: 'AiPetFriendly - Control de Medicacion',
        sectionTitle: 'Medicacion suministrada',
        emptyMessage: 'No hay medicacion registrada para esta mascota.',
        fileNamePrefix: 'control-medicacion',
        logoUrl,
      });
    },
    [medicationLogEntries, selectedPet, subscription.isPremiumUser, user?.email],
  );

  const sendHealthBookletPdfByEmail = useCallback(
    async (email: string, logoUrl?: string) => {
      if (!subscription.isPremiumUser) {
        throw new Error('El envio de PDF por email es exclusivo para Premium.');
      }
      const pdf = await generateHealthBookletPdf(logoUrl);
      await sendPdfByEmail({ email, pdf, petName: selectedPet?.name ?? '', reportTitle: 'Libreta Sanitaria' });
    },
    [generateHealthBookletPdf, selectedPet?.name, subscription.isPremiumUser],
  );

  const sendMedicationLogPdfByEmail = useCallback(
    async (email: string, logoUrl?: string) => {
      if (!subscription.isPremiumUser) {
        throw new Error('El envio de PDF por email es exclusivo para Premium.');
      }
      const pdf = await generateMedicationLogPdf(logoUrl);
      await sendPdfByEmail({ email, pdf, petName: selectedPet?.name ?? '', reportTitle: 'Control de Medicacion' });
    },
    [generateMedicationLogPdf, selectedPet?.name, subscription.isPremiumUser],
  );

  return {
    selectedPet,
    healthBookletEntries,
    medicationLogEntries,
    lastVaccineSummary,
    lastDewormingSummary,
    generateHealthBookletPdf,
    generateMedicationLogPdf,
    sendHealthBookletPdfByEmail,
    sendMedicationLogPdfByEmail,
  };
}
