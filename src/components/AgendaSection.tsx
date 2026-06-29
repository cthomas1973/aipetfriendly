import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { usePreventive } from '../hooks/usePreventive';
import { useAppState } from '../context/AppStateContext';
import { readNotificationProfile } from '../lib/notificationProfile';
import type { PreventiveCategory } from '../types';

const PREV_MAP: Record<PreventiveCategory, { label: string; emoji: string }> = {
  medication:  { label: 'Medicacion',      emoji: '💊' },
  vaccine:     { label: 'Vacuna',          emoji: '💉' },
  deworming:   { label: 'Desparasitacion', emoji: '🪱' },
  appointment: { label: 'Turno',           emoji: '🏥' },
  feeding:     { label: 'Alimentacion',    emoji: '🍖' },
  other:       { label: 'Otro',            emoji: '📌' },
};

const inp = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200';
const FOOD_DEFAULTS_KEY = 'apf_food_defaults_v1';
const FOOD_BRANDS = [
  'Royal Canin',
  'Purina Pro Plan',
  'Hills Science Diet',
  'Eukanuba',
  'Pedigree',
  'Whiskas',
  'Cat Chow',
  'Dog Chow',
  'Otro',
] as const;

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDaysToDateStr(dateStr: string, days: number) {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return '';
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function diffDays(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.round(ms / 86400000));
}

function readFoodDefaults() {
  if (typeof window === 'undefined') return {} as Record<string, { brand?: string; variety?: string; bagWeightKg?: number }>;
  const raw = window.localStorage.getItem(FOOD_DEFAULTS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, { brand?: string; variety?: string; bagWeightKg?: number }>;
  } catch {
    return {};
  }
}

function writeFoodDefaults(next: Record<string, { brand?: string; variety?: string; bagWeightKg?: number }>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FOOD_DEFAULTS_KEY, JSON.stringify(next));
}

function getTaskTime(task: { appointmentTime?: string; scheduleTimes?: string[] | string }) {
  if (task.appointmentTime && /^\d{2}:\d{2}$/.test(task.appointmentTime)) {
    return task.appointmentTime;
  }

  if (Array.isArray(task.scheduleTimes) && task.scheduleTimes.length > 0) {
    const first = [...task.scheduleTimes].sort()[0];
    if (/^\d{2}:\d{2}$/.test(first)) {
      return first;
    }
  }

  if (typeof task.scheduleTimes === 'string') {
    const first = task.scheduleTimes.split(',').map((item) => item.trim()).find((item) => /^\d{2}:\d{2}$/.test(item));
    if (first) {
      return first;
    }
  }

  return undefined;
}

function getTaskDateTime(task: { dueDate: string; appointmentTime?: string; scheduleTimes?: string[] | string }) {
  const [year, month, day] = task.dueDate.split('-').map(Number);
  const fallback = new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
  if (!year || !month || !day) {
    return fallback;
  }

  const taskTime = getTaskTime(task);
  if (!taskTime) {
    return fallback;
  }

  const [hours, minutes] = taskTime.split(':').map(Number);
  return new Date(year, month - 1, day, hours || 0, minutes || 0, 0, 0);
}

function formatDateTimeLabel(task: { dueDate: string; appointmentTime?: string; scheduleTimes?: string[] | string }) {
  const date = getTaskDateTime(task);
  return date.toLocaleString('es-AR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AgendaSection() {
  const { pets, selectedPetId, user } = useAppState();
  const { preventiveTasks, addPreventiveTask, toggleTask } = usePreventive();

  const [tab, setTab] = useState<'meds' | 'food'>('meds');
  const [petFilter, setPetFilter] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);

  const [pTitle, setPTitle] = useState('');
  const [pCat,   setPCat]   = useState<PreventiveCategory>('vaccine');
  const [pDate,  setPDate]  = useState(() => toDateStr(new Date()));
  const [pPetId, setPPetId] = useState('');
  const [pRemindersEnabled, setPRemindersEnabled] = useState(true);
  const [pNotificationChannels, setPNotificationChannels] = useState<string[]>(['Push']);
  const [pNotificationEmail, setPNotificationEmail] = useState('');
  const [pNotificationPhone, setPNotificationPhone] = useState('');
  const [foodBrand, setFoodBrand] = useState<string>(FOOD_BRANDS[0]);
  const [foodCustomBrand, setFoodCustomBrand] = useState('');
  const [foodVariety, setFoodVariety] = useState('');
  const [foodBagWeightKg, setFoodBagWeightKg] = useState('');
  const [foodSelectedPetIds, setFoodSelectedPetIds] = useState<string[]>([]);
  const [foodUseAsDefaultNext, setFoodUseAsDefaultNext] = useState(true);
  const [foodScheduleReminder, setFoodScheduleReminder] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!showForm || tab === 'food') {
      return;
    }

    const fallbackPetId = petFilter !== 'all'
      ? petFilter
      : (selectedPetId ?? pets[0]?.id ?? '');

    if (fallbackPetId && fallbackPetId !== pPetId) {
      setPPetId(fallbackPetId);
    }
  }, [petFilter, pPetId, pets, selectedPetId, showForm, tab]);

  useEffect(() => {
    setPCat((current) => {
      if (tab === 'food') {
        return 'feeding';
      }
      return current === 'feeding' ? 'medication' : current;
    });
  }, [tab]);

  useEffect(() => {
    if (!showForm || tab === 'food') {
      return;
    }

    const profile = readNotificationProfile(user);
    setPNotificationChannels(profile.channels.length > 0 ? profile.channels : ['Push']);
    setPNotificationEmail(profile.defaultEmail);
    setPNotificationPhone(profile.defaultPhone);
  }, [showForm, tab, user]);

  useEffect(() => {
    if (tab !== 'food') {
      return;
    }

    if (foodSelectedPetIds.length === 0 && pets.length > 0) {
      setFoodSelectedPetIds(selectedPetId ? [selectedPetId] : [pets[0].id]);
    }
  }, [foodSelectedPetIds.length, pets, selectedPetId, tab]);

  useEffect(() => {
    if (tab !== 'food') {
      return;
    }

    const firstPetId = foodSelectedPetIds[0];
    if (!firstPetId) {
      return;
    }

    const defaults = readFoodDefaults();
    const current = defaults[firstPetId];
    if (!current) {
      return;
    }

    if (current.brand) {
      if ((FOOD_BRANDS as readonly string[]).includes(current.brand)) {
        setFoodBrand(current.brand);
        setFoodCustomBrand('');
      } else {
        setFoodBrand('Otro');
        setFoodCustomBrand(current.brand);
      }
    }
    if (current.variety) {
      setFoodVariety(current.variety);
    }
    if (typeof current.bagWeightKg === 'number' && current.bagWeightKg > 0) {
      setFoodBagWeightKg(String(current.bagWeightKg));
    }
  }, [foodSelectedPetIds, tab]);

  const selectedFoodPets = useMemo(
    () => pets.filter((pet) => foodSelectedPetIds.includes(pet.id)),
    [foodSelectedPetIds, pets],
  );

  const selectedFoodPetCount = selectedFoodPets.length;
  const totalFoodPetsWeightKg = selectedFoodPets.reduce((acc, pet) => acc + (Number(pet.weightKg) || 0), 0);

  const latestFoodPurchaseDate = useMemo(() => {
    if (selectedFoodPetCount === 0) return null;
    const today = pDate;
    let latest: string | null = null;

    for (const task of preventiveTasks) {
      if (task.category !== 'feeding') continue;
      if (!foodSelectedPetIds.includes(task.petId)) continue;
      if (task.foodEntryType && task.foodEntryType !== 'purchase') continue;

      const purchaseDate = task.foodPurchaseDate || task.dueDate;
      if (!purchaseDate || purchaseDate >= today) continue;
      if (!latest || purchaseDate > latest) {
        latest = purchaseDate;
      }
    }

    return latest;
  }, [selectedFoodPetCount, foodSelectedPetIds, pDate, preventiveTasks]);

  const bagWeightNumber = Number(foodBagWeightKg || 0);
  const daysFromPreviousPurchase = latestFoodPurchaseDate ? diffDays(latestFoodPurchaseDate, pDate) : null;

  const estimatedDailyTotalKg = useMemo(() => {
    if (bagWeightNumber <= 0 || selectedFoodPetCount === 0) {
      return 0;
    }

    if (!daysFromPreviousPurchase) {
      return totalFoodPetsWeightKg * 0.05;
    }

    return bagWeightNumber / daysFromPreviousPurchase;
  }, [bagWeightNumber, daysFromPreviousPurchase, selectedFoodPetCount, totalFoodPetsWeightKg]);

  const estimatedDailyByPet = useMemo(
    () => selectedFoodPets.map((pet) => {
      const petWeight = Number(pet.weightKg) || 0;
      const ratio = totalFoodPetsWeightKg > 0
        ? petWeight / totalFoodPetsWeightKg
        : (selectedFoodPetCount > 0 ? 1 / selectedFoodPetCount : 0);

      return {
        petId: pet.id,
        name: pet.name,
        ratio,
        dailyKg: estimatedDailyTotalKg * ratio,
      };
    }),
    [estimatedDailyTotalKg, selectedFoodPetCount, selectedFoodPets, totalFoodPetsWeightKg],
  );
  const estimatedDurationDays = estimatedDailyTotalKg > 0 ? Math.max(1, Math.round(bagWeightNumber / estimatedDailyTotalKg)) : 0;
  const nextPurchaseReminderDate = estimatedDurationDays > 0 ? addDaysToDateStr(pDate, estimatedDurationDays) : '';

  const agendaTasks = useMemo(() => {
    const byTab = preventiveTasks.filter((task) => {
      if (tab === 'food') {
        return task.category === 'feeding';
      }
      return task.category !== 'feeding';
    });

    const byPet = byTab.filter((task) => (petFilter === 'all' ? true : task.petId === petFilter));

    return byPet.sort((a, b) => getTaskDateTime(a).getTime() - getTaskDateTime(b).getTime());
  }, [petFilter, preventiveTasks, tab]);

  const done = agendaTasks.filter((task) => task.completed);
  const pending = agendaTasks.filter((task) => !task.completed);
  const progress = agendaTasks.length > 0 ? Math.round((done.length / agendaTasks.length) * 100) : 0;

  const doAdd = async (e: FormEvent) => {
    e.preventDefault();

    const isFoodForm = tab === 'food';
    if (!isFoodForm && !pTitle.trim()) return;

    const petId = pPetId || selectedPetId || pets[0]?.id || '';
    if (!isFoodForm && !petId) {
      setError('Debes tener al menos una mascota para agendar tareas.');
      return;
    }

    const resolvedFoodBrand = foodBrand === 'Otro' ? foodCustomBrand.trim() : foodBrand;
    const normalizedChannels = pNotificationChannels.length > 0 ? pNotificationChannels : ['Push'];
    const wantsEmail = normalizedChannels.includes('Email');
    const wantsWhatsApp = normalizedChannels.includes('WhatsApp');

    if (!isFoodForm && pRemindersEnabled && wantsEmail && !pNotificationEmail.trim()) {
      setError('Debes indicar un email para el canal Email.');
      return;
    }

    if (!isFoodForm && pRemindersEnabled && wantsWhatsApp && !pNotificationPhone.trim()) {
      setError('Debes indicar un celular para el canal WhatsApp.');
      return;
    }

    if (isFoodForm) {
      if (!resolvedFoodBrand.trim()) {
        setError('Debes indicar la marca del alimento.');
        return;
      }
      if (bagWeightNumber <= 0) {
        setError('Debes indicar el peso de la bolsa en kg.');
        return;
      }
      if (selectedFoodPetCount === 0) {
        setError('Debes seleccionar al menos una mascota para esta compra.');
        return;
      }
      if (!estimatedDurationDays || !nextPurchaseReminderDate) {
        setError('No se pudo calcular la duracion estimada de la bolsa.');
        return;
      }
    }

    try {
      if (!isFoodForm) {
        await addPreventiveTask({
          petId,
          title: pTitle,
          category: pCat,
          dueDate: pDate,
          completed: false,
          remindersEnabled: pRemindersEnabled,
          notificationChannels: normalizedChannels,
          notificationEmail: pNotificationEmail.trim() || undefined,
          notificationPhone: pNotificationPhone.trim() || undefined,
          notificationLeadTime: 'en fecha',
        });
      } else {
        const purchaseGroupId = crypto.randomUUID();
        const purchaseTitle = `Compra alimento: ${resolvedFoodBrand}${foodVariety.trim() ? ` - ${foodVariety.trim()}` : ''}`;

        for (const targetPet of selectedFoodPets) {
          const targetPetWeight = Number(targetPet.weightKg) || 0;
          const targetRatio = totalFoodPetsWeightKg > 0
            ? targetPetWeight / totalFoodPetsWeightKg
            : (selectedFoodPetCount > 0 ? 1 / selectedFoodPetCount : 0);
          const targetDailyKg = Number((estimatedDailyTotalKg * targetRatio).toFixed(4));

          await addPreventiveTask({
            petId: targetPet.id,
            title: purchaseTitle,
            category: 'feeding',
            dueDate: pDate,
            completed: true,
            notes: `Compra registrada para ${selectedFoodPetCount} mascota(s).`,
            remindersEnabled: false,
            foodBrand: resolvedFoodBrand,
            foodVariety: foodVariety.trim() || undefined,
            foodBagWeightKg: bagWeightNumber,
            foodPurchaseDate: pDate,
            foodPurchaseGroupId: purchaseGroupId,
            foodSharedPetIds: foodSelectedPetIds,
            foodAppliesToPetsCount: selectedFoodPetCount,
            foodEstimatedDailyKgTotal: Number(estimatedDailyTotalKg.toFixed(4)),
            foodEstimatedDailyKgPerPet: targetDailyKg,
            foodEstimatedDurationDays: estimatedDurationDays,
            foodPreviousPurchaseDate: latestFoodPurchaseDate || undefined,
            foodUseAsDefaultNext: foodUseAsDefaultNext,
            foodEntryType: 'purchase',
          });

          if (foodScheduleReminder) {
            await addPreventiveTask({
              petId: targetPet.id,
              title: `Aviso compra alimento: ${resolvedFoodBrand}`,
              category: 'feeding',
              dueDate: nextPurchaseReminderDate,
              completed: false,
              notes: `Recordatorio automatico segun consumo estimado (${estimatedDurationDays} dias).`,
              remindersEnabled: true,
              notificationLeadTime: '24 horas antes',
              notificationChannels: ['Push'],
              foodBrand: resolvedFoodBrand,
              foodVariety: foodVariety.trim() || undefined,
              foodBagWeightKg: bagWeightNumber,
              foodPurchaseDate: pDate,
              foodPurchaseGroupId: purchaseGroupId,
              foodSharedPetIds: foodSelectedPetIds,
              foodAppliesToPetsCount: selectedFoodPetCount,
              foodEstimatedDailyKgTotal: Number(estimatedDailyTotalKg.toFixed(4)),
              foodEstimatedDailyKgPerPet: targetDailyKg,
              foodEstimatedDurationDays: estimatedDurationDays,
              foodPreviousPurchaseDate: latestFoodPurchaseDate || undefined,
              foodUseAsDefaultNext: foodUseAsDefaultNext,
              foodEntryType: 'reminder',
            });
          }
        }

        if (foodUseAsDefaultNext) {
          const currentDefaults = readFoodDefaults();
          for (const targetPetId of foodSelectedPetIds) {
            currentDefaults[targetPetId] = {
              brand: resolvedFoodBrand,
              variety: foodVariety.trim() || undefined,
              bagWeightKg: bagWeightNumber,
            };
          }
          writeFoodDefaults(currentDefaults);
        }
      }

      setPTitle('');
      setPCat('vaccine');
      const profile = readNotificationProfile(user);
      setPRemindersEnabled(true);
      setPNotificationChannels(profile.channels.length > 0 ? profile.channels : ['Push']);
      setPNotificationEmail(profile.defaultEmail);
      setPNotificationPhone(profile.defaultPhone);
      setFoodBrand(FOOD_BRANDS[0]);
      setFoodCustomBrand('');
      setFoodVariety('');
      setFoodBagWeightKg('');
      setFoodUseAsDefaultNext(true);
      setFoodScheduleReminder(true);
      setShowForm(false);
      setError(null);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : `No se pudo guardar ${isFoodForm ? 'la compra de alimento' : 'el preventivo'}.`);
    }
  };

  const onToggleTask = async (taskId: string) => {
    try {
      await toggleTask(taskId);
      setError(null);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo actualizar el preventivo.');
    }
  };

  const petName = (id: string) => pets.find(p => p.id === id)?.name ?? '';

  return (
    <section className="space-y-4 pb-2">
      <div className="pt-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Agenda y Comida</h2>
        <p className="mt-1 text-slate-500">Agenda completa por fecha y horario</p>
        {error && <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
      </div>

      {/* tab switcher */}
      <div className="grid grid-cols-2 overflow-hidden rounded-2xl bg-slate-100 p-1">
        <button type="button" onClick={() => setTab('meds')}
          className={`rounded-xl py-2.5 text-sm font-semibold transition ${tab === 'meds' ? 'bg-emerald-500 text-white shadow' : 'text-slate-500'}`}>
          💊 Medicacion
        </button>
        <button type="button" onClick={() => setTab('food')}
          className={`rounded-xl py-2.5 text-sm font-semibold transition ${tab === 'food' ? 'bg-emerald-500 text-white shadow' : 'text-slate-500'}`}>
          🍖 Comida
        </button>
      </div>

      <div className="rounded-3xl bg-white p-4 shadow-sm">
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Filtrar por mascota</label>
        <select
          value={petFilter}
          onChange={(e) => setPetFilter(e.target.value)}
          className={inp}
        >
          <option value="all">Todas las mascotas</option>
          {pets.map((pet) => (
            <option key={pet.id} value={pet.id}>{pet.name}</option>
          ))}
        </select>
      </div>

      {agendaTasks.length > 0 && (
        <div className="rounded-3xl bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-700">Progreso del listado</span>
            <span className="font-bold text-emerald-600">{progress}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>{agendaTasks.length} tarea{agendaTasks.length !== 1 ? 's' : ''}</span>
            <span>{pending.length} pendiente{pending.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {agendaTasks.length === 0 ? (
          <div className="rounded-3xl bg-white px-5 py-10 text-center shadow-sm">
            <p className="text-3xl">📅</p>
            <p className="mt-2 font-semibold text-slate-700">Sin tareas para este filtro</p>
            <p className="mt-1 text-sm text-slate-400">Agrega una nueva tarea para comenzar</p>
          </div>
        ) : (
          <>
            {pending.map((task) => (
              <button key={task.id} type="button" onClick={() => onToggleTask(task.id)}
                className="flex w-full items-center gap-3 rounded-3xl bg-white p-4 shadow-sm transition active:scale-[0.98]">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-lg shrink-0">{PREV_MAP[task.category]?.emoji}</span>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-slate-900">{task.title}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">{petName(task.petId)}</span>
                    <span className="text-xs text-slate-400">{PREV_MAP[task.category]?.label}</span>
                    <span className="text-xs font-semibold text-emerald-700">{formatDateTimeLabel(task)}</span>
                  </div>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 text-lg">✓</span>
              </button>
            ))}
            {done.map((task) => (
              <button key={task.id} type="button" onClick={() => onToggleTask(task.id)}
                className="flex w-full items-center gap-3 rounded-3xl bg-white p-4 opacity-50 shadow-sm">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-lg shrink-0">{PREV_MAP[task.category]?.emoji}</span>
                <div className="flex-1 text-left">
                  <p className="font-semibold line-through text-slate-400">{task.title}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{petName(task.petId)}</span>
                    <span className="text-xs text-slate-400">{PREV_MAP[task.category]?.label}</span>
                    <span className="text-xs text-slate-400">{formatDateTimeLabel(task)}</span>
                  </div>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-lg">✓</span>
              </button>
            ))}
          </>
        )}
      </div>

      <button type="button" onClick={() => setShowForm(true)}
        className="flex w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-emerald-300 bg-white/80 py-4 font-semibold text-emerald-600">
        <Plus size={18} /> {tab === 'food' ? 'Agregar comida' : 'Agregar tarea'}
      </button>

      {/* form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 md:items-center">
          <form onSubmit={doAdd} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 md:rounded-3xl">
            <div className="mb-5 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-xl">{tab === 'food' ? '🍽️' : '💊'}</span>
                <div><p className="font-bold text-slate-900">{tab === 'food' ? 'Nueva compra' : 'Nueva Medicacion'}</p></div>
              </div>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400"><X size={20} /></button>
            </div>
            {tab !== 'food' ? (
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Mascota</label>
                  <select
                    value={pPetId}
                    onChange={e => setPPetId(e.target.value)}
                    className={inp}
                    required
                    disabled={petFilter !== 'all'}
                  >
                    {petFilter === 'all' && <option value="">Selecciona una mascota</option>}
                    {pets.map((pet) => (
                      <option key={pet.id} value={pet.id}>{pet.name}</option>
                    ))}
                  </select>
                  {petFilter !== 'all' && (
                    <p className="mt-1 text-xs text-slate-400">Se usara la mascota filtrada en Agenda.</p>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Tipo</label>
                  <select value={pCat} onChange={e => setPCat(e.target.value as PreventiveCategory)} className={inp}>
                    <option value="medication">💊 Medicacion</option>
                    <option value="vaccine">💉 Vacuna</option>
                    <option value="deworming">🪱 Desparasitacion</option>
                    <option value="appointment">🏥 Turno</option>
                    <option value="feeding">🍖 Alimentacion</option>
                    <option value="other">📌 Otro</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Nombre *</label>
                  <input value={pTitle} onChange={e => setPTitle(e.target.value)}
                    placeholder="Ej: Rabia, Moquillo, Desparasitante..." className={inp} required />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Fecha *</label>
                  <input type="date" value={pDate} onChange={e => setPDate(e.target.value)} className={inp} required />
                </div>
                <label className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <span className="text-sm font-medium text-emerald-800">Activar recordatorios</span>
                  <input
                    type="checkbox"
                    checked={pRemindersEnabled}
                    onChange={(e) => setPRemindersEnabled(e.target.checked)}
                    className="h-4 w-4"
                  />
                </label>
                {pRemindersEnabled && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-medium text-slate-700">Canales de aviso</p>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {['Push', 'Email', 'WhatsApp'].map((channel) => {
                        const checked = pNotificationChannels.includes(channel);
                        return (
                          <label key={channel} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
                            <span>{channel}</span>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setPNotificationChannels((prev) => Array.from(new Set([...prev, channel])));
                                } else {
                                  setPNotificationChannels((prev) => prev.filter((item) => item !== channel));
                                }
                              }}
                              className="h-4 w-4"
                            />
                          </label>
                        );
                      })}
                    </div>
                    {pNotificationChannels.includes('Email') && (
                      <div className="mt-3">
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">Email para notificacion</label>
                        <input
                          type="email"
                          value={pNotificationEmail}
                          onChange={(e) => setPNotificationEmail(e.target.value)}
                          className={inp}
                          placeholder="Ej: contacto@dominio.com"
                        />
                      </div>
                    )}
                    {pNotificationChannels.includes('WhatsApp') && (
                      <div className="mt-3">
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">Celular WhatsApp (con codigo pais)</label>
                        <input
                          value={pNotificationPhone}
                          onChange={(e) => setPNotificationPhone(e.target.value)}
                          className={inp}
                          placeholder="Ej: +5491122334455"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Marca</label>
                  <div className="grid grid-cols-2 gap-2">
                    {FOOD_BRANDS.map((brand) => (
                      <button
                        key={brand}
                        type="button"
                        onClick={() => setFoodBrand(brand)}
                        className={`rounded-xl border px-3 py-2 text-sm text-left ${foodBrand === brand ? 'border-emerald-400 bg-emerald-100 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
                      >
                        {brand}
                      </button>
                    ))}
                  </div>
                </div>
                {foodBrand === 'Otro' && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Otra marca</label>
                    <input value={foodCustomBrand} onChange={(e) => setFoodCustomBrand(e.target.value)} className={inp} placeholder="Nombre de la marca" required />
                  </div>
                )}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Variedad (opcional)</label>
                  <input value={foodVariety} onChange={(e) => setFoodVariety(e.target.value)} className={inp} placeholder="Ej: Adulto, Sensitive..." />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Peso bolsa (kg) *</label>
                    <input type="number" min={0.1} step={0.1} value={foodBagWeightKg} onChange={(e) => setFoodBagWeightKg(e.target.value)} className={inp} placeholder="Ej: 15" required />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Fecha de compra *</label>
                    <input type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} className={inp} required />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Aplicar a mascotas</label>
                  <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    {pets.map((pet) => {
                      const checked = foodSelectedPetIds.includes(pet.id);
                      return (
                        <label key={pet.id} className="flex items-center justify-between gap-3">
                          <span className="text-sm text-slate-700">{pet.name} ({pet.weightKg} kg)</span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFoodSelectedPetIds((prev) => [...prev, pet.id]);
                              } else {
                                setFoodSelectedPetIds((prev) => prev.filter((id) => id !== pet.id));
                              }
                            }}
                            className="h-4 w-4"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  <p><strong>Mascotas incluidas:</strong> {selectedFoodPetCount}</p>
                  <p><strong>Compra anterior:</strong> {latestFoodPurchaseDate ? latestFoodPurchaseDate : 'Primera compra (estimado 5% del peso total por dia)'}</p>
                  <p><strong>Consumo aprox diario total:</strong> {estimatedDailyTotalKg > 0 ? `${estimatedDailyTotalKg.toFixed(3)} kg/dia` : '-'}</p>
                  <p><strong>Consumo aprox diario por mascota:</strong></p>
                  {estimatedDailyByPet.length > 0 ? (
                    <ul className="mt-1 space-y-1">
                      {estimatedDailyByPet.map((item) => (
                        <li key={item.petId} className="text-xs">
                          {item.name}: {item.dailyKg.toFixed(3)} kg/dia ({Math.round(item.ratio * 100)}%)
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>-</p>
                  )}
                  <p><strong>Duracion estimada:</strong> {estimatedDurationDays > 0 ? `${estimatedDurationDays} dias` : '-'}</p>
                  <p><strong>Aviso proxima compra:</strong> {nextPurchaseReminderDate || '-'}</p>
                </div>
                <label className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <span className="text-sm font-medium text-emerald-800">Guardar como default para proxima compra</span>
                  <input type="checkbox" checked={foodUseAsDefaultNext} onChange={(e) => setFoodUseAsDefaultNext(e.target.checked)} className="h-4 w-4" />
                </label>
                <label className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <span className="text-sm font-medium text-emerald-800">Agendar aviso de proxima compra</span>
                  <input type="checkbox" checked={foodScheduleReminder} onChange={(e) => setFoodScheduleReminder(e.target.checked)} className="h-4 w-4" />
                </label>
              </div>
            )}
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setShowForm(false)}
                className="w-full rounded-full border-2 border-slate-200 py-3.5 font-semibold text-slate-600">Cancelar</button>
              <button type="submit" className="w-full rounded-full bg-emerald-500 py-3.5 font-bold text-white">Guardar</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
