import { useCallback, useMemo } from 'react';
import { useAppState, useSessionGuard } from '../context/AppStateContext';
import { buildTimelineReportPdf } from '../lib/reportPdf';
import { clinicalDownloadAccessError } from '../lib/clinicalPdfPolicy.mjs';
import { useClinicalPdfEmail } from './useClinicalPdfEmail';
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

export function usePetReports() {
  const { clinicalEntries, pets, selectedPetId, user } = useAppState();
  const { sendReport, isSendingPdf } = useClinicalPdfEmail();
  const assertCurrentSession = useSessionGuard(user?.id);

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
      assertCurrentSession();
      if (!selectedPet) {
        throw new Error('Selecciona una mascota antes de descargar el PDF.');
      }
      const accessError = clinicalDownloadAccessError(user);
      if (accessError) throw new Error(accessError);

      const pdf = await buildTimelineReportPdf({
        pet: selectedPet,
        ownerEmail: user?.email ?? '',
        entries: healthBookletEntries,
        reportHeaderTitle: 'AiPetFriendly - Libreta Sanitaria',
        sectionTitle: 'Vacunas y desparasitaciones',
        emptyMessage: 'No hay vacunas ni desparasitaciones registradas para esta mascota.',
        fileNamePrefix: 'libreta-sanitaria',
        logoUrl,
      });
      assertCurrentSession();
      return pdf;
    },
    [healthBookletEntries, selectedPet, user, assertCurrentSession],
  );

  const generateMedicationLogPdf = useCallback(
    async (logoUrl?: string) => {
      assertCurrentSession();
      if (!selectedPet) {
        throw new Error('Selecciona una mascota antes de descargar el PDF.');
      }
      const accessError = clinicalDownloadAccessError(user);
      if (accessError) throw new Error(accessError);

      const pdf = await buildTimelineReportPdf({
        pet: selectedPet,
        ownerEmail: user?.email ?? '',
        entries: medicationLogEntries,
        reportHeaderTitle: 'AiPetFriendly - Control de Medicacion',
        sectionTitle: 'Medicacion suministrada',
        emptyMessage: 'No hay medicacion registrada para esta mascota.',
        fileNamePrefix: 'control-medicacion',
        logoUrl,
      });
      assertCurrentSession();
      return pdf;
    },
    [medicationLogEntries, selectedPet, user, assertCurrentSession],
  );

  const sendHealthBookletPdfByEmail = useCallback(
    async (email: string, logoUrl?: string) => {
      if (!selectedPet) throw new Error('Selecciona una mascota para enviar el informe.');
      await sendReport(email, `booklet:${selectedPet.id}`, selectedPet.name,
        'Libreta Sanitaria', () => generateHealthBookletPdf(logoUrl), selectedPet.id);
    },
    [generateHealthBookletPdf, selectedPet, sendReport],
  );

  const sendMedicationLogPdfByEmail = useCallback(
    async (email: string, logoUrl?: string) => {
      if (!selectedPet) throw new Error('Selecciona una mascota para enviar el informe.');
      await sendReport(email, `medication:${selectedPet.id}`, selectedPet.name,
        'Control de Medicacion', () => generateMedicationLogPdf(logoUrl), selectedPet.id);
    },
    [generateMedicationLogPdf, selectedPet, sendReport],
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
    isSendingPdf,
  };
}
