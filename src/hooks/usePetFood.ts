import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppState } from '../context/AppStateContext';
import { usePreventive } from './usePreventive';
import { createPetWeightLog, fetchPetWeightLogs, requestPetWeightInsight, type WeightInsightResponse } from '../lib/supabase';
import type { Pet, PetWeightLog } from '../types';

const GUEST_WEIGHT_LOGS_KEY = 'apf_guest_weight_logs_v1';

// Umbral a partir del cual un cambio de peso entre dos registros se considera
// lo suficientemente significativo como para disparar un analisis de IA (evita
// spam de avisos por variaciones normales/ruido de balanza).
const WEIGHT_CHANGE_ALERT_THRESHOLD_PCT = 10;
// No comparar contra un registro demasiado viejo (ej. de hace mas de ~6 meses):
// el cambio ya no es "reciente" y pierde sentido como aviso proactivo.
const WEIGHT_CHANGE_MAX_WINDOW_DAYS = 200;

function readGuestWeightLogs(): Record<string, PetWeightLog[]> {
  if (typeof window === 'undefined') return {};
  const raw = window.localStorage.getItem(GUEST_WEIGHT_LOGS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, PetWeightLog[]>;
  } catch {
    return {};
  }
}

function writeGuestWeightLogs(next: Record<string, PetWeightLog[]>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(GUEST_WEIGHT_LOGS_KEY, JSON.stringify(next));
}

function addDaysToDateStr(dateStr: string, days: number) {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return dateStr;
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetweenDateStrings(fromDateStr: string, toDateStr: string): number {
  const from = new Date(`${fromDateStr}T00:00:00`);
  const to = new Date(`${toDateStr}T00:00:00`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

// Estimacion teorica aproximada de consumo diario (kg) en base a peso, edad y especie:
// RER (kcal/dia) = 70 * peso_kg^0.75, ajustado por un factor de mantenimiento segun etapa
// de vida, y convertido a kg de alimento asumiendo ~3600 kcal/kg (densidad tipica de un
// balanceado seco). No reemplaza la indicacion de un veterinario.
function theoreticalDailyFoodKg(pet: Pet): number {
  const weight = Number(pet.weightKg) || 0;
  if (weight <= 0) return 0;

  const rerKcal = 70 * Math.pow(weight, 0.75);
  const ageMonthsTotal = (pet.ageYears || 0) * 12 + (pet.ageMonths || 0);

  let factor: number;
  if (ageMonthsTotal > 0 && ageMonthsTotal < 12) {
    factor = 2.5; // cachorro/gatito en crecimiento
  } else if (ageMonthsTotal >= 84) {
    factor = 1.2; // senior (7+ anios)
  } else {
    factor = pet.species === 'cat' ? 1.2 : 1.6; // adulto
  }

  const merKcal = rerKcal * factor;
  const kcalPerKgFood = 3600;
  return merKcal / kcalPerKgFood;
}

export function usePetFood(pet: Pet | null) {
  const { user } = useAppState();
  const { preventiveTasks, addPreventiveTask } = usePreventive();
  const [weightLogs, setWeightLogs] = useState<PetWeightLog[]>([]);
  const [loadingWeightLogs, setLoadingWeightLogs] = useState(false);
  const [weightInsight, setWeightInsight] = useState<WeightInsightResponse | null>(null);
  const [loadingWeightInsight, setLoadingWeightInsight] = useState(false);

  const loadWeightLogs = useCallback(async () => {
    if (!pet) {
      setWeightLogs([]);
      return;
    }

    if (user?.isGuest) {
      const stored = readGuestWeightLogs()[pet.id] || [];
      setWeightLogs([...stored].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)));
      return;
    }

    setLoadingWeightLogs(true);
    try {
      const logs = await fetchPetWeightLogs(pet.id);
      setWeightLogs(logs);
    } finally {
      setLoadingWeightLogs(false);
    }
  }, [pet, user?.isGuest]);

  useEffect(() => {
    void loadWeightLogs();
  }, [loadWeightLogs]);

  const addWeightLog = useCallback(
    async (weightKg: number, recordedAt: string) => {
      if (!pet) {
        throw new Error('Selecciona una mascota antes de registrar el peso.');
      }
      if (!(weightKg > 0)) {
        throw new Error('Ingresa un peso valido en kg.');
      }

      if (user?.isGuest) {
        const entry: PetWeightLog = {
          id: crypto.randomUUID(),
          petId: pet.id,
          weightKg,
          recordedAt,
          createdAt: new Date().toISOString(),
        };
        const stored = readGuestWeightLogs();
        const nextForPet = [...(stored[pet.id] || []), entry];
        stored[pet.id] = nextForPet;
        writeGuestWeightLogs(stored);
        setWeightLogs([...nextForPet].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)));
        return entry;
      }

      const saved = await createPetWeightLog(pet.id, weightKg, recordedAt);
      if (!saved) {
        throw new Error('No se pudo guardar el registro de peso.');
      }

      setWeightLogs((current) => [...current, saved].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)));

      // Aviso proactivo de IA: solo si hay un registro previo (no el primero) y el
      // cambio de peso es significativo dentro de una ventana reciente razonable.
      // No bloquea ni afecta el guardado del peso si falla (fire and forget).
      const previousLogs = weightLogs.filter((log) => log.recordedAt < recordedAt);
      const previousLog = previousLogs.length > 0
        ? [...previousLogs].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0]
        : null;

      if (previousLog && previousLog.weightKg > 0) {
        const daysBetween = daysBetweenDateStrings(previousLog.recordedAt, recordedAt);
        const pctChange = Math.abs((weightKg - previousLog.weightKg) / previousLog.weightKg) * 100;

        if (
          daysBetween > 0 &&
          daysBetween <= WEIGHT_CHANGE_MAX_WINDOW_DAYS &&
          pctChange >= WEIGHT_CHANGE_ALERT_THRESHOLD_PCT
        ) {
          setLoadingWeightInsight(true);
          requestPetWeightInsight({
            petId: pet.id,
            previousWeightKg: previousLog.weightKg,
            currentWeightKg: weightKg,
            daysBetween,
          })
            .then(setWeightInsight)
            .catch((ex) => {
              console.error('No se pudo generar el analisis de IA sobre el cambio de peso:', ex);
            })
            .finally(() => setLoadingWeightInsight(false));
        }
      }

      return saved;
    },
    [pet, user?.isGuest, weightLogs],
  );

  const feedingTasks = useMemo(
    () => (pet ? preventiveTasks.filter((task) => task.category === 'feeding' && task.petId === pet.id) : []),
    [pet, preventiveTasks],
  );

  const lastPurchase = useMemo(() => {
    const purchases = feedingTasks.filter((task) => !task.foodEntryType || task.foodEntryType === 'purchase');
    if (purchases.length === 0) return null;
    return [...purchases].sort((a, b) => {
      const dateA = a.foodPurchaseDate || a.dueDate;
      const dateB = b.foodPurchaseDate || b.dueDate;
      return dateB.localeCompare(dateA);
    })[0];
  }, [feedingTasks]);

  const nextPurchaseReminder = useMemo(() => {
    const reminders = feedingTasks.filter((task) => task.foodEntryType === 'reminder' && !task.completed);
    if (reminders.length === 0) return null;
    return [...reminders].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  }, [feedingTasks]);

  const estimatedNextPurchaseDate = useMemo(() => {
    if (nextPurchaseReminder) {
      return nextPurchaseReminder.dueDate;
    }
    if (lastPurchase?.foodPurchaseDate && lastPurchase.foodEstimatedDurationDays) {
      return addDaysToDateStr(lastPurchase.foodPurchaseDate, lastPurchase.foodEstimatedDurationDays);
    }
    return null;
  }, [lastPurchase, nextPurchaseReminder]);

  const realDailyKg = lastPurchase?.foodEstimatedDailyKgPerPet ?? null;
  const theoreticalDailyKg = pet ? theoreticalDailyFoodKg(pet) : 0;

  const scheduleNextPurchaseReminder = useCallback(
    async (dueDate: string) => {
      if (!pet) {
        throw new Error('Selecciona una mascota antes de agendar.');
      }
      if (nextPurchaseReminder) {
        return nextPurchaseReminder;
      }

      return addPreventiveTask({
        petId: pet.id,
        title: lastPurchase?.foodBrand ? `Aviso compra alimento: ${lastPurchase.foodBrand}` : 'Aviso compra de alimento',
        category: 'feeding',
        dueDate,
        completed: false,
        notes: 'Recordatorio agendado desde el informe de Comida.',
        remindersEnabled: true,
        notificationLeadTime: '24 horas antes',
        notificationChannels: ['Push'],
        foodBrand: lastPurchase?.foodBrand,
        foodVariety: lastPurchase?.foodVariety,
        foodBagWeightKg: lastPurchase?.foodBagWeightKg,
        foodPurchaseDate: lastPurchase?.foodPurchaseDate,
        foodPurchaseGroupId: lastPurchase?.foodPurchaseGroupId,
        foodEstimatedDailyKgPerPet: lastPurchase?.foodEstimatedDailyKgPerPet,
        foodEstimatedDurationDays: lastPurchase?.foodEstimatedDurationDays,
        foodEntryType: 'reminder',
      });
    },
    [addPreventiveTask, lastPurchase, nextPurchaseReminder, pet],
  );

  return {
    weightLogs,
    loadingWeightLogs,
    addWeightLog,
    lastPurchase,
    nextPurchaseReminder,
    estimatedNextPurchaseDate,
    realDailyKg,
    theoreticalDailyKg,
    scheduleNextPurchaseReminder,
    weightInsight,
    loadingWeightInsight,
    clearWeightInsight: () => setWeightInsight(null),
  };
}
