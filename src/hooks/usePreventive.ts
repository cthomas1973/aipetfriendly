import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAppState } from '../context/AppStateContext';
import {
  createClinicalEntry,
  createPreventiveTask,
  togglePreventiveTask,
  updatePreventiveTaskReminders,
  updatePreventiveTaskSchedule,
} from '../lib/supabase';
import type { ClinicalEntryCategory, ClinicalTimelineEntry, PreventiveFormData, PreventiveTask } from '../types';

function mapPreventiveToClinicalCategory(category: PreventiveFormData['category']): ClinicalEntryCategory {
  if (category === 'medication') return 'medication';
  if (category === 'vaccine') return 'vaccine';
  if (category === 'deworming') return 'deworming';
  if (category === 'appointment') return 'treatment';
  if (category === 'feeding') return 'clinical_note';
  return 'clinical_note';
}

function preventiveDescription(data: PreventiveFormData) {
  const detail: string[] = [];

  if (data.dose) {
    detail.push(`Dosis: ${data.dose}`);
  }
  if (data.frequency) {
    detail.push(`Frecuencia: ${data.frequency}`);
  }
  if (data.scheduleTimes && data.scheduleTimes.length > 0) {
    detail.push(`Horarios: ${data.scheduleTimes.join(', ')}`);
  }
  if (data.startDate) {
    detail.push(`Inicio: ${data.startDate}`);
  }
  if (data.endDate) {
    detail.push(`Fin: ${data.endDate}`);
  }
  if (typeof data.durationDays === 'number') {
    detail.push(`Duracion: ${data.durationDays} dias`);
  }
  if (data.foodEntryType === 'purchase') {
    detail.push('Tipo registro: Compra de alimento');
  }
  if (data.foodEntryType === 'reminder') {
    detail.push('Tipo registro: Aviso de compra');
  }
  if (data.notes) {
    detail.push(`Notas: ${data.notes}`);
  }
  if (typeof data.remindersEnabled === 'boolean') {
    detail.push(`Recordatorios: ${data.remindersEnabled ? 'Activos' : 'Inactivos'}`);
  }
  if (data.appointmentReason) {
    detail.push(`Motivo: ${data.appointmentReason}`);
  }
  if (data.appointmentTime) {
    detail.push(`Horario: ${data.appointmentTime}`);
  }
  if (data.appointmentLocation) {
    detail.push(`Lugar: ${data.appointmentLocation}`);
  }
  if (data.appointmentReference) {
    detail.push(`Referencia: ${data.appointmentReference}`);
  }
  if (data.notificationLeadTime) {
    detail.push(`Antelacion aviso: ${data.notificationLeadTime}`);
  }
  if (data.notificationChannels && data.notificationChannels.length > 0) {
    detail.push(`Medios aviso: ${data.notificationChannels.join(', ')}`);
  }
  if (data.notificationEmail) {
    detail.push(`Email notificacion: ${data.notificationEmail}`);
  }
  if (data.notificationPhone) {
    detail.push(`Celular notificacion: ${data.notificationPhone}`);
  }
  if (data.foodBrand) {
    detail.push(`Marca alimento: ${data.foodBrand}`);
  }
  if (data.foodVariety) {
    detail.push(`Variedad: ${data.foodVariety}`);
  }
  if (typeof data.foodBagWeightKg === 'number') {
    detail.push(`Bolsa: ${data.foodBagWeightKg} kg`);
  }
  if (typeof data.foodEstimatedDurationDays === 'number') {
    detail.push(`Duracion estimada: ${data.foodEstimatedDurationDays} dias`);
  }
  if (typeof data.foodEstimatedDailyKgPerPet === 'number') {
    detail.push(`Consumo aprox diario por mascota: ${data.foodEstimatedDailyKgPerPet.toFixed(3)} kg`);
  }

  if (detail.length > 0) {
    return detail.join(' | ');
  }

  if (data.category === 'medication') return 'Registro de medicacion preventiva.';
  if (data.category === 'vaccine') return 'Registro de vacuna preventiva.';
  if (data.category === 'deworming') return 'Registro de desparasitacion preventiva.';
  if (data.category === 'appointment') return 'Registro de turno preventivo.';
  if (data.category === 'feeding') return 'Registro de alimentacion preventiva.';
  return 'Registro preventivo.';
}

function shouldCreateClinicalEntry(data: PreventiveFormData) {
  if (data.createClinicalEntry === false) {
    return false;
  }
  return !(data.category === 'feeding' && data.foodEntryType === 'reminder');
}

function parseTaskDateTime(task: PreventiveTask): Date {
  const [year, month, day] = task.dueDate.split('-').map(Number);
  const fallback = new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);

  const fromAppointment = typeof task.appointmentTime === 'string' ? task.appointmentTime : '';
  const fromSchedule = Array.isArray(task.scheduleTimes) && task.scheduleTimes.length > 0
    ? task.scheduleTimes[0]
    : '';
  const taskTime = fromAppointment || fromSchedule;
  if (!/^\d{2}:\d{2}$/.test(taskTime)) {
    return fallback;
  }

  const [hours, minutes] = taskTime.split(':').map(Number);
  return new Date(year, month - 1, day, hours || 0, minutes || 0, 0, 0);
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toTimeString(date: Date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function usePreventive() {
  const {
    preventiveTasks,
    setPreventiveTasks,
    clinicalEntries,
    setClinicalEntries,
    user,
  } = useAppState();

  const preventiveTasksRef = useRef(preventiveTasks);
  const clinicalEntriesRef = useRef(clinicalEntries);

  useEffect(() => {
    preventiveTasksRef.current = preventiveTasks;
  }, [preventiveTasks]);

  useEffect(() => {
    clinicalEntriesRef.current = clinicalEntries;
  }, [clinicalEntries]);

  const addPreventiveTask = useCallback(
    async (data: PreventiveFormData) => {
      if (!user) {
        throw new Error('Debes iniciar sesion para registrar preventivos.');
      }

      if (user.isGuest) {
        const task: PreventiveTask = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          ...data,
        };
        const nextTasks = [task, ...preventiveTasksRef.current];
        preventiveTasksRef.current = nextTasks;
        setPreventiveTasks(nextTasks);

        if (shouldCreateClinicalEntry(data)) {
          const guestClinicalEntry: ClinicalTimelineEntry = {
            id: crypto.randomUUID(),
            petId: data.petId,
            category: mapPreventiveToClinicalCategory(data.category),
            title: data.title,
            description: preventiveDescription(data),
            eventDate: data.dueDate,
            createdAt: new Date().toISOString(),
            metadata: {
              source: 'preventive',
              preventiveCategory: data.category,
              dose: data.dose ?? null,
              frequency: data.frequency ?? null,
              scheduleTimes: data.scheduleTimes?.join(', ') ?? null,
              startDate: data.startDate ?? null,
              endDate: data.endDate ?? null,
              durationDays: data.durationDays ?? null,
              remindersEnabled: data.remindersEnabled ?? null,
              appointmentReason: data.appointmentReason ?? null,
              appointmentTime: data.appointmentTime ?? null,
              appointmentLocation: data.appointmentLocation ?? null,
              appointmentReference: data.appointmentReference ?? null,
              notificationLeadTime: data.notificationLeadTime ?? null,
              notificationChannels: data.notificationChannels?.join(', ') ?? null,
              notificationEmail: data.notificationEmail ?? null,
              notificationPhone: data.notificationPhone ?? null,
              foodBrand: data.foodBrand ?? null,
              foodVariety: data.foodVariety ?? null,
              foodBagWeightKg: data.foodBagWeightKg ?? null,
              foodPurchaseDate: data.foodPurchaseDate ?? null,
              foodPurchaseGroupId: data.foodPurchaseGroupId ?? null,
              foodSharedPetIds: data.foodSharedPetIds?.join(', ') ?? null,
              foodAppliesToPetsCount: data.foodAppliesToPetsCount ?? null,
              foodEstimatedDailyKgTotal: data.foodEstimatedDailyKgTotal ?? null,
              foodEstimatedDailyKgPerPet: data.foodEstimatedDailyKgPerPet ?? null,
              foodEstimatedDurationDays: data.foodEstimatedDurationDays ?? null,
              foodPreviousPurchaseDate: data.foodPreviousPurchaseDate ?? null,
              foodUseAsDefaultNext: data.foodUseAsDefaultNext ?? null,
              foodEntryType: data.foodEntryType ?? null,
            },
          };
          const nextClinicalEntries = [guestClinicalEntry, ...clinicalEntriesRef.current];
          clinicalEntriesRef.current = nextClinicalEntries;
          setClinicalEntries(nextClinicalEntries);
        }
        return task;
      }

      const saved = await createPreventiveTask(data.petId, {
        title: data.title,
        category: data.category,
        dueDate: data.dueDate,
        completed: data.completed,
        notes: data.notes,
        dose: data.dose,
        frequency: data.frequency,
        scheduleTimes: data.scheduleTimes,
        startDate: data.startDate,
        endDate: data.endDate,
        durationDays: data.durationDays,
        remindersEnabled: data.remindersEnabled,
        appointmentReason: data.appointmentReason,
        appointmentTime: data.appointmentTime,
        appointmentLocation: data.appointmentLocation,
        appointmentReference: data.appointmentReference,
        notificationLeadTime: data.notificationLeadTime,
        notificationChannels: data.notificationChannels,
        notificationEmail: data.notificationEmail,
        notificationPhone: data.notificationPhone,
        foodBrand: data.foodBrand,
        foodVariety: data.foodVariety,
        foodBagWeightKg: data.foodBagWeightKg,
        foodPurchaseDate: data.foodPurchaseDate,
        foodPurchaseGroupId: data.foodPurchaseGroupId,
        foodSharedPetIds: data.foodSharedPetIds,
        foodAppliesToPetsCount: data.foodAppliesToPetsCount,
        foodEstimatedDailyKgTotal: data.foodEstimatedDailyKgTotal,
        foodEstimatedDailyKgPerPet: data.foodEstimatedDailyKgPerPet,
        foodEstimatedDurationDays: data.foodEstimatedDurationDays,
        foodPreviousPurchaseDate: data.foodPreviousPurchaseDate,
        foodUseAsDefaultNext: data.foodUseAsDefaultNext,
        foodEntryType: data.foodEntryType,
      });

      if (!saved) {
        if (data.category === 'medication') {
          throw new Error('No se pudo guardar "Medicacion". Falta aplicar la migracion de base de datos para esta categoria.');
        }
        throw new Error('No se pudo guardar el preventivo en Supabase.');
      }

      if (shouldCreateClinicalEntry(data)) {
        const clinicalEntry = await createClinicalEntry(data.petId, {
          category: mapPreventiveToClinicalCategory(data.category),
          title: data.title,
          description: preventiveDescription(data),
          eventDate: data.dueDate,
          metadata: {
            source: 'preventive',
            preventiveCategory: data.category,
            dose: data.dose ?? null,
            frequency: data.frequency ?? null,
            scheduleTimes: data.scheduleTimes?.join(', ') ?? null,
            startDate: data.startDate ?? null,
            endDate: data.endDate ?? null,
            durationDays: data.durationDays ?? null,
            remindersEnabled: data.remindersEnabled ?? null,
            appointmentReason: data.appointmentReason ?? null,
            appointmentTime: data.appointmentTime ?? null,
            appointmentLocation: data.appointmentLocation ?? null,
            appointmentReference: data.appointmentReference ?? null,
            notificationLeadTime: data.notificationLeadTime ?? null,
            notificationChannels: data.notificationChannels?.join(', ') ?? null,
            notificationEmail: data.notificationEmail ?? null,
            notificationPhone: data.notificationPhone ?? null,
            foodBrand: data.foodBrand ?? null,
            foodVariety: data.foodVariety ?? null,
            foodBagWeightKg: data.foodBagWeightKg ?? null,
            foodPurchaseDate: data.foodPurchaseDate ?? null,
            foodPurchaseGroupId: data.foodPurchaseGroupId ?? null,
            foodSharedPetIds: data.foodSharedPetIds?.join(', ') ?? null,
            foodAppliesToPetsCount: data.foodAppliesToPetsCount ?? null,
            foodEstimatedDailyKgTotal: data.foodEstimatedDailyKgTotal ?? null,
            foodEstimatedDailyKgPerPet: data.foodEstimatedDailyKgPerPet ?? null,
            foodEstimatedDurationDays: data.foodEstimatedDurationDays ?? null,
            foodPreviousPurchaseDate: data.foodPreviousPurchaseDate ?? null,
            foodUseAsDefaultNext: data.foodUseAsDefaultNext ?? null,
            foodEntryType: data.foodEntryType ?? null,
          },
        });

        if (clinicalEntry) {
          const nextClinicalEntries = [clinicalEntry, ...clinicalEntriesRef.current];
          clinicalEntriesRef.current = nextClinicalEntries;
          setClinicalEntries(nextClinicalEntries);
        }
      }

      const nextTasks = [saved, ...preventiveTasksRef.current];
      preventiveTasksRef.current = nextTasks;
      setPreventiveTasks(nextTasks);
      return saved;
    },
    [setClinicalEntries, setPreventiveTasks, user],
  );

  const toggleTask = useCallback(
    async (taskId: string) => {
      const current = preventiveTasks.find((task) => task.id === taskId);
      if (!current) {
        return;
      }

      const nextCompleted = !current.completed;

      if (!user || user.isGuest) {
        setPreventiveTasks(
          preventiveTasks.map((task) =>
            task.id === taskId ? { ...task, completed: nextCompleted } : task,
          ),
        );
        return;
      }

      const updated = await togglePreventiveTask(taskId, nextCompleted);
      if (!updated) {
        throw new Error('No se pudo actualizar el preventivo en Supabase.');
      }

      const task: PreventiveTask = {
        ...current,
        completed: nextCompleted,
      };
      setPreventiveTasks(
        preventiveTasks.map((item) => (item.id === taskId ? task : item)),
      );
    },
    [preventiveTasks, setPreventiveTasks, user],
  );

  const postponeTask = useCallback(
    async (taskId: string, minutes: number) => {
      const current = preventiveTasks.find((task) => task.id === taskId);
      if (!current) {
        return;
      }

      const nextDateTime = parseTaskDateTime(current);
      nextDateTime.setMinutes(nextDateTime.getMinutes() + minutes);
      const nextDueDate = toDateString(nextDateTime);
      const nextTime = toTimeString(nextDateTime);

      if (!user || user.isGuest) {
        setPreventiveTasks(
          preventiveTasks.map((task) => (
            task.id === taskId
              ? { ...task, dueDate: nextDueDate, appointmentTime: nextTime, scheduleTimes: [nextTime] }
              : task
          )),
        );
        return;
      }

      const updated = await updatePreventiveTaskSchedule(taskId, nextDueDate, nextTime);
      if (!updated) {
        throw new Error('No se pudo posponer la alerta en Supabase.');
      }

      setPreventiveTasks(
        preventiveTasks.map((task) => (
          task.id === taskId
            ? { ...task, dueDate: nextDueDate, appointmentTime: nextTime, scheduleTimes: [nextTime] }
            : task
        )),
      );
    },
    [preventiveTasks, setPreventiveTasks, user],
  );

  const discardTaskReminder = useCallback(
    async (taskId: string) => {
      const current = preventiveTasks.find((task) => task.id === taskId);
      if (!current) {
        return;
      }

      if (!user || user.isGuest) {
        setPreventiveTasks(
          preventiveTasks.map((task) => (
            task.id === taskId ? { ...task, remindersEnabled: false } : task
          )),
        );
        return;
      }

      const updated = await updatePreventiveTaskReminders(taskId, false);
      if (!updated) {
        throw new Error('No se pudo descartar el recordatorio en Supabase.');
      }

      setPreventiveTasks(
        preventiveTasks.map((task) => (
          task.id === taskId ? { ...task, remindersEnabled: false } : task
        )),
      );
    },
    [preventiveTasks, setPreventiveTasks, user],
  );

  const pendingTasks = useMemo(
    () => preventiveTasks.filter((task) => !task.completed),
    [preventiveTasks],
  );

  return {
    preventiveTasks,
    pendingTasks,
    addPreventiveTask,
    toggleTask,
    postponeTask,
    discardTaskReminder,
  };
}
