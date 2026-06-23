import { useCallback } from 'react';
import { useAppState } from '../context/AppStateContext';
import type { ClinicalTimelineEntry, MedicationFormData } from '../types';

export function useMedications() {
  const { clinicalEntries, setClinicalEntries } = useAppState();

  const addMedication = useCallback(
    (data: MedicationFormData) => {
      const entry: ClinicalTimelineEntry = {
        id: crypto.randomUUID(),
        petId: data.petId,
        category: 'medication',
        title: data.medicationName,
        description: `${data.dose}${data.frequency ? ` | ${data.frequency}` : ''}`,
        eventDate: data.startDate,
        createdAt: new Date().toISOString(),
        metadata: {
          route: data.route ?? null,
          endDate: data.endDate ?? null,
          veterinarian: data.veterinarian ?? null,
          notes: data.notes ?? null,
        },
      };

      setClinicalEntries([entry, ...clinicalEntries]);
      return entry;
    },
    [clinicalEntries, setClinicalEntries],
  );

  const medicationEntries = clinicalEntries.filter((entry) => entry.category === 'medication');

  return {
    medicationEntries,
    addMedication,
  };
}
