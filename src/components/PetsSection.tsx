import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera, CheckCircle2, ChevronLeft, ChevronRight,
  Circle, ClipboardList, Download, Heart, Mail,
  MapPin, MessageCircle, PawPrint, Pill, Plus, QrCode, Shield, Syringe, Tag, Trash2, Utensils, X,
} from 'lucide-react';
import jsQR from 'jsqr';
import { useClinical } from '../hooks/useClinical';
import { usePetIdentification } from '../hooks/usePetIdentification';
import { usePetReports } from '../hooks/usePetReports';
import type { HealthSummaryCard } from '../hooks/usePetReports';
import { usePets } from '../hooks/usePets';
import { usePreventive } from '../hooks/usePreventive';
import { useAppState } from '../context/AppStateContext';
import { PetFoodSection } from './PetFoodSection';
import { PetGuidesTeaser } from './PetGuidesTeaser';
import { readNotificationProfile, writeNotificationProfile } from '../lib/notificationProfile';
import {
  buildCountryOptionsForPicker,
  buildE164Phone,
  detectDefaultCountryDialCode,
  getPhoneInputHint,
  getPhoneLocalPlaceholder,
  isValidE164Phone,
  sanitizePhoneLocalInput,
  splitPhoneByCountryCode,
} from '../lib/phoneUtils';
import type { ClinicalEntryCategory, PetFormData, PetSex, PetSightingMessage, PetTagRequest, PetTagRequestStatus, PreventiveCategory, PreventiveTask, Species } from '../types';

const MAX_DIM = 1280;
const QUALITY = 0.82;

// Id de la mascota que hay que abrir automaticamente en la vista de
// Identificacion (mensajes recibidos). Lo deja App.tsx en localStorage cuando
// el usuario entra desde el link "Ver mensajes en AiPetFriendly" del email de
// mascota encontrada (?pet_messages=<codigo publico>).
const OPEN_PET_IDENTIFICATION_KEY = 'apf_open_pet_identificacion';

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => (typeof r.result === 'string' ? res(r.result) : rej(new Error('Error al leer imagen')));
    r.onerror = () => rej(new Error('No se pudo leer la imagen'));
    r.readAsDataURL(file);
  });
}

function compressImage(dataUrl: string): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width  = Math.round(img.width  * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      if (!ctx) return rej(new Error('No se pudo procesar la imagen'));
      ctx.drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', QUALITY));
    };
    img.onerror = () => rej(new Error('Imagen no valida'));
    img.src = dataUrl;
  });
}

function calcAge(birthDate: string) {
  const [y, m, d] = birthDate.split('-').map(Number);
  if (!y || !m || !d) return null;
  const birth = new Date(y, m - 1, d);
  const now   = new Date();
  if (isNaN(birth.getTime()) || birth > now) return null;
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months--;
  months = Math.max(0, months);
  return { ageYears: Math.floor(months / 12), ageMonths: months % 12 };
}

type View = 'list' | 'wizard' | 'detail' | 'edit' | 'historial' | 'preventivos' | 'comida' | 'libreta-sanitaria' | 'control-medicacion' | 'identificacion';

const INIT: PetFormData = {
  name: '', breed: '', species: 'dog', sex: 'unknown',
  birthDate: '', ageYears: 0, ageMonths: 0, weightKg: 1, distinguishingMarks: '',
};

const SP_EMOJI: Record<Species, string> = { dog: '🐕', cat: '🐈', other: '🐾' };
const SEX_LBL:  Record<PetSex, string>  = { male: 'Macho', female: 'Hembra', unknown: 'No especificado' };

const CAT_MAP: Record<ClinicalEntryCategory, { label: string; emoji: string; bg: string; text: string }> = {
  medication:    { label: 'Medicamento',    emoji: '💊', bg: 'bg-blue-100',    text: 'text-blue-700'    },
  deworming:     { label: 'Desparasitario', emoji: '🪱', bg: 'bg-amber-100',   text: 'text-amber-700'   },
  vaccine:       { label: 'Vacuna',         emoji: '💉', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  treatment:     { label: 'Tratamiento',    emoji: '🩺', bg: 'bg-purple-100',  text: 'text-purple-700'  },
  clinical_note: { label: 'Nota',           emoji: '📝', bg: 'bg-slate-100',   text: 'text-slate-600'   },
};

const PREV_MAP: Record<PreventiveCategory, { label: string; emoji: string }> = {
  medication:  { label: 'Medicacion',      emoji: '💊' },
  vaccine:     { label: 'Vacuna',          emoji: '💉' },
  deworming:   { label: 'Desparasitacion', emoji: '🪱' },
  appointment: { label: 'Turno',           emoji: '🏥' },
  feeding:     { label: 'Alimentacion',    emoji: '🍖' },
  other:       { label: 'Otro',            emoji: '📌' },
};

const FREQUENCY_OPTIONS = [
  'Cada 12 horas',
  'Cada 8 horas',
  'Cada 24 horas',
  'Semanal',
  'Segun indicacion',
] as const;

const DEFAULT_MEDICATION_FREQUENCY = 'Cada 24 horas';

const RECORD_MODE_OPTIONS = [
  { value: 'tratamiento', label: 'Tratamiento' },
  { value: 'ocasional', label: 'Ocasional' },
  { value: 'periodico', label: 'Periodico' },
] as const;

type PreventiveRecordMode = typeof RECORD_MODE_OPTIONS[number]['value'];

const PERIODIC_FREQUENCY_OPTIONS = [
  { value: 'mensual', label: 'Mensual' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
] as const;

type PeriodicFrequency = typeof PERIODIC_FREQUENCY_OPTIONS[number]['value'];

const PERIODIC_FREQUENCY_MONTHS: Record<PeriodicFrequency, number> = {
  mensual: 1,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

const APPOINTMENT_LEAD_OPTIONS = [
  '15 minutos antes',
  '30 minutos antes',
  '1 hora antes',
  '2 horas antes',
  '24 horas antes',
] as const;

const NOTIFICATION_CHANNEL_OPTIONS = ['Email', 'Push', 'WhatsApp'] as const;

function addMonthsToDateString(dateStr: string, months: number) {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) {
    return '';
  }

  const date = new Date(year, month - 1, day);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function addDaysToDateString(dateStr: string, days: number) {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) {
    return dateStr;
  }
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function listDatesInRange(startDate: string, endDate: string) {
  const dates: string[] = [];
  let current = startDate;
  while (current <= endDate) {
    dates.push(current);
    current = addDaysToDateString(current, 1);
  }
  return dates;
}

function listDatesByFrequency(startDate: string, endDate: string, frequency: string) {
  if (frequency === 'Semanal') {
    const dates: string[] = [];
    let current = startDate;
    while (current <= endDate) {
      dates.push(current);
      current = addDaysToDateString(current, 7);
    }
    return dates;
  }

  return listDatesInRange(startDate, endDate);
}

function toMinutes(time: string) {
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function minutesToTime(totalMinutes: number) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const h = String(Math.floor(normalized / 60)).padStart(2, '0');
  const m = String(normalized % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function buildFrequencyTimes(baseTime: string, frequency: string): string[] {
  const baseMinutes = toMinutes(baseTime);
  if (baseMinutes == null) return ['08:00'];

  if (frequency === 'Cada 12 horas') {
    return [minutesToTime(baseMinutes), minutesToTime(baseMinutes + 12 * 60)];
  }

  if (frequency === 'Cada 8 horas') {
    return [
      minutesToTime(baseMinutes),
      minutesToTime(baseMinutes + 8 * 60),
      minutesToTime(baseMinutes + 16 * 60),
    ];
  }

  return [minutesToTime(baseMinutes)];
}

function formatPreventiveDateTime(task: { dueDate: string; appointmentTime?: string; scheduleTimes?: string[] }) {
  const time = task.appointmentTime || (Array.isArray(task.scheduleTimes) ? task.scheduleTimes[0] : '');
  const dateLabel = new Date(`${task.dueDate}T12:00:00`).toLocaleDateString('es-AR');
  if (time && /^\d{2}:\d{2}$/.test(time)) {
    return `${dateLabel} · ${time}`;
  }
  return dateLabel;
}

function getDoseTime(task: PreventiveTask): string {
  if (task.appointmentTime && /^\d{2}:\d{2}$/.test(task.appointmentTime)) {
    return task.appointmentTime;
  }
  if (Array.isArray(task.scheduleTimes) && task.scheduleTimes[0] && /^\d{2}:\d{2}$/.test(task.scheduleTimes[0])) {
    return task.scheduleTimes[0];
  }
  return '';
}

interface MedicationDose {
  id: string;
  dueDate: string;
  time: string;
  completed: boolean;
  completedAt?: string;
}

interface MedicationTreatmentGroup {
  key: string;
  title: string;
  dose?: string;
  frequency?: string;
  startDate?: string;
  endDate?: string;
  durationDays?: number;
  notes?: string;
  doses: MedicationDose[];
}

function buildMedicationTreatmentGroups(tasks: PreventiveTask[]): MedicationTreatmentGroup[] {
  const medicationTasks = tasks.filter((task) => task.category === 'medication');
  const groupsByKey = new Map<string, PreventiveTask[]>();

  for (const task of medicationTasks) {
    // Los registros nuevos comparten treatmentGroupId. Para registros previos a este
    // cambio (sin treatmentGroupId), agrupamos por una huella de los datos comunes
    // del tratamiento para no mostrar una tarjeta por cada dosis.
    const key = task.treatmentGroupId
      || [
        task.title.trim().toLowerCase(),
        task.dose?.trim().toLowerCase() ?? '',
        task.frequency?.trim().toLowerCase() ?? '',
        task.startDate ?? '',
        task.endDate ?? '',
        task.durationDays ?? '',
        task.notes?.trim().toLowerCase() ?? '',
      ].join('|');
    const bucket = groupsByKey.get(key);
    if (bucket) {
      bucket.push(task);
    } else {
      groupsByKey.set(key, [task]);
    }
  }

  const groups: MedicationTreatmentGroup[] = [];
  for (const [key, groupTasks] of groupsByKey) {
    const sortedDoses = [...groupTasks].sort((a, b) => {
      const aTime = `${a.dueDate}T${getDoseTime(a) || '00:00'}`;
      const bTime = `${b.dueDate}T${getDoseTime(b) || '00:00'}`;
      return aTime.localeCompare(bTime);
    });
    const representative = sortedDoses[0];

    groups.push({
      key,
      title: representative.title,
      dose: representative.dose,
      frequency: representative.frequency,
      startDate: representative.startDate,
      endDate: representative.endDate,
      durationDays: representative.durationDays,
      notes: representative.notes,
      doses: sortedDoses.map((task) => ({
        id: task.id,
        dueDate: task.dueDate,
        time: getDoseTime(task),
        completed: task.completed,
        completedAt: task.completedAt,
      })),
    });
  }

  return groups.sort((a, b) => {
    const aKeyDate = a.startDate || a.doses[0]?.dueDate || '';
    const bKeyDate = b.startDate || b.doses[0]?.dueDate || '';
    return bKeyDate.localeCompare(aKeyDate);
  });
}

const inp = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200';

function formatFriendlyDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function HealthSummaryPanel({
  label, icon, accent, summary,
}: {
  label: string;
  icon: ReactNode;
  accent: 'sky' | 'amber';
  summary: HealthSummaryCard;
}) {
  const accentCls = accent === 'sky'
    ? { header: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700', ring: 'ring-sky-100' }
    : { header: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700', ring: 'ring-amber-100' };

  return (
    <div className={`overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ${accentCls.ring}`}>
      <div className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white ${accentCls.header}`}>
        {icon} {label}
      </div>
      <div className="space-y-2 p-4">
        {!summary.lastEntry ? (
          <p className="text-sm text-slate-400">Sin registros todavia.</p>
        ) : (
          <>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Fecha</p>
              <p className="text-sm font-semibold text-slate-800">{formatFriendlyDate(summary.lastEntry.eventDate)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tipo</p>
              <p className="text-sm font-semibold text-slate-800">{summary.lastEntry.title}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Nota</p>
              <p className="text-sm text-slate-600">{summary.cleanedNote}</p>
            </div>
          </>
        )}
        <div className={`rounded-2xl px-3 py-2 text-xs font-semibold ${accentCls.chip}`}>
          Proxima fecha (estimada): {summary.nextDate ? formatFriendlyDate(summary.nextDate) : 'Por determinar'}
        </div>
      </div>
    </div>
  );
}

export function PetsSection() {
  const { pets, selectedPetId, canAddPet, freePetLimit, addPet, selectPet, removePet, updatePet } = usePets();
  const { setActiveTab, user } = useAppState();
  const { timeline, addClinicalNote, generateClinicalPdf, sendClinicalPdfByEmail } = useClinical();
  const {
    healthBookletEntries,
    lastVaccineSummary,
    lastDewormingSummary,
    generateHealthBookletPdf,
    generateMedicationLogPdf,
    sendHealthBookletPdfByEmail,
    sendMedicationLogPdfByEmail,
  } = usePetReports();
  const { preventiveTasks, addPreventiveTask, toggleTask, postponeTask } = usePreventive();
  const { getMessages, markMessageRead, getTagRequest, generatePosterPdf, getLinkedTagCode, linkTagCode, unlinkTagCode } = usePetIdentification();

  const [view, setView]   = useState<View>('list');
  const [step, setStep]   = useState(1);
  const [form, setForm]   = useState<PetFormData>(INIT);
  const [imgBusy, setImgBusy] = useState(false);
  const [err,  setErr]    = useState<string | null>(null);
  const [msg,  setMsg]    = useState<string | null>(null);

  const [noteModal, setNoteModal] = useState(false);
  const [prevModal, setPrevModal] = useState(false);
  const [mailModal, setMailModal] = useState(false);
  const [libretaMailModal, setLibretaMailModal] = useState(false);
  const [medicacionMailModal, setMedicacionMailModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const [sightingMessages, setSightingMessages] = useState<PetSightingMessage[]>([]);
  const [tagRequest, setTagRequest] = useState<PetTagRequest | null>(null);
  const [idLoading, setIdLoading] = useState(false);
  const [posterBusy, setPosterBusy] = useState(false);
  const [linkedTagCode, setLinkedTagCode] = useState<string | null>(null);
  const [tagCodeInput, setTagCodeInput] = useState('');
  const [tagLinkBusy, setTagLinkBusy] = useState(false);
  const [tagScannerOpen, setTagScannerOpen] = useState(false);
  const [tagScannerErr, setTagScannerErr] = useState<string | null>(null);
  const tagScannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const tagScannerStreamRef = useRef<MediaStream | null>(null);
  const tagScannerFrameRef = useRef<number | null>(null);
  const [posterModal, setPosterModal] = useState(false);
  const [posterLostDate, setPosterLostDate] = useState('');
  const [posterLostPlace, setPosterLostPlace] = useState('');
  const [posterContactPhone, setPosterContactPhone] = useState('');
  const [posterDistinguishingMarks, setPosterDistinguishingMarks] = useState('');
  const [posterExtraMessage, setPosterExtraMessage] = useState('');

  const [nTitle, setNTitle] = useState('');
  const [nDesc,  setNDesc]  = useState('');
  const [nCat,   setNCat]   = useState<ClinicalEntryCategory>('clinical_note');
  const [nDate,  setNDate]  = useState(() => new Date().toISOString().slice(0, 10));
  const [nVet,   setNVet]   = useState('');
  const [pTitle, setPTitle] = useState('');
  const [pCat,   setPCat]   = useState<PreventiveCategory>('vaccine');
  const [pDate,  setPDate]  = useState(() => new Date().toISOString().slice(0, 10));
  const [pDose, setPDose] = useState('');
  const [pFrequency, setPFrequency] = useState<string>(DEFAULT_MEDICATION_FREQUENCY);
  const [pScheduleTimes, setPScheduleTimes] = useState<string[]>(['08:00']);
  const [pDurationDays, setPDurationDays] = useState('');
  const [pNotes, setPNotes] = useState('');
  const [pRemindersEnabled, setPRemindersEnabled] = useState(true);
  const [pAppointmentReason, setPAppointmentReason] = useState('');
  const [pAppointmentTime, setPAppointmentTime] = useState('09:00');
  const [pAppointmentLocation, setPAppointmentLocation] = useState('');
  const [pAppointmentReference, setPAppointmentReference] = useState('');
  const [pAppointmentNotifyEnabled, setPAppointmentNotifyEnabled] = useState(true);
  const [pAppointmentLeadTime, setPAppointmentLeadTime] = useState<string>(APPOINTMENT_LEAD_OPTIONS[2]);
  const [pAppointmentChannels, setPAppointmentChannels] = useState<string[]>(['Email']);
  const [pAppointmentPhoneCountry, setPAppointmentPhoneCountry] = useState(detectDefaultCountryDialCode());
  const [pAppointmentPhoneLocal, setPAppointmentPhoneLocal] = useState('');
  const [pDewormingIntervalMonths, setPDewormingIntervalMonths] = useState<number>(3);
  const [pNextDewormingDate, setPNextDewormingDate] = useState('');
  const [pAutoScheduleNextDeworming, setPAutoScheduleNextDeworming] = useState(true);
  const [pDewormingRemindersEnabled, setPDewormingRemindersEnabled] = useState(true);
  const [pRecordMode, setPRecordMode] = useState<PreventiveRecordMode>('tratamiento');
  const [pPeriodicFrequency, setPPeriodicFrequency] = useState<PeriodicFrequency>('anual');
  const [pNextPeriodicDate, setPNextPeriodicDate] = useState('');
  const [pPeriodicRemindersEnabled, setPPeriodicRemindersEnabled] = useState(true);
  const [mailTo, setMailTo] = useState('');

  const photoRef       = useRef<HTMLInputElement>(null);
  const detailPhotoRef = useRef<HTMLInputElement>(null);
  const detectedDialCode = useRef(detectDefaultCountryDialCode()).current;
  const dialOptions = buildCountryOptionsForPicker(detectedDialCode);

  const pet = pets.find(p => p.id === selectedPetId) ?? null;

  // Si venimos del link del email "Ver mensajes en AiPetFriendly" (App.tsx ya
  // selecciono esta mascota), abrimos directo la vista de Identificacion para
  // mostrar los mensajes recibidos sin pasos extra.
  useEffect(() => {
    if (!pet) return;
    const targetPetId = window.localStorage.getItem(OPEN_PET_IDENTIFICATION_KEY);
    if (targetPetId !== pet.id) return;
    window.localStorage.removeItem(OPEN_PET_IDENTIFICATION_KEY);
    setErr(null);
    setView('identificacion');
  }, [pet]);

  useEffect(() => {
    const profile = readNotificationProfile(user);
    const parsedPhone = profile.defaultPhone
      ? splitPhoneByCountryCode(profile.defaultPhone)
      : { countryCode: detectedDialCode, localNumber: '' };

    setPAppointmentPhoneCountry(parsedPhone.countryCode);
    setPAppointmentPhoneLocal(parsedPhone.localNumber);
  }, [detectedDialCode, user]);

  const onPhoto = async (e: ChangeEvent<HTMLInputElement>, petId?: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setErr('No es una imagen valida.'); return; }
    try {
      setImgBusy(true);
      const compressed = await compressImage(await readAsDataUrl(file));
      if (petId) await updatePet(petId, { photoUrl: compressed });
      else       setForm(p => ({ ...p, photoUrl: compressed }));
      setErr(null);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Error al procesar imagen.');
    } finally {
      setImgBusy(false);
      e.target.value = '';
    }
  };

  const onBirth = (v: string) => {
    const age = calcAge(v);
    if (!v)   { setForm(p => ({ ...p, birthDate: '', ageYears: 0, ageMonths: 0 })); setErr(null); return; }
    if (!age) { setForm(p => ({ ...p, birthDate: v, ageYears: 0, ageMonths: 0 })); setErr('Fecha no valida.'); return; }
    setForm(p => ({ ...p, birthDate: v, ...age }));
    setErr(null);
  };

  const okStep = () => {
    if (step === 1 && !form.name.trim())  { setErr('El nombre es requerido.'); return false; }
    if (step === 1 && !form.breed.trim()) { setErr('La raza es requerida.');   return false; }
    if (step === 2 && !form.birthDate)    { setErr('La fecha es requerida.');   return false; }
    setErr(null); return true;
  };

  const doNext = () => { if (okStep()) setStep(s => s + 1); };
  const doBack = () => { setErr(null); setStep(s => s - 1); };

  const doSave = async () => {
    if (!okStep()) return;
    try {
      const saved = await addPet(form);
      selectPet(saved.id);
      setForm(INIT); setStep(1); setErr(null);
      setView('detail');
    } catch (ex) { setErr(ex instanceof Error ? ex.message : 'No se pudo guardar.'); }
  };

  const doAddNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!pet) return;
    try {
      await addClinicalNote({ petId: pet.id, title: nTitle, content: nDesc, category: nCat, eventDate: nDate });
      setNTitle(''); setNDesc(''); setNCat('clinical_note'); setNVet('');
      setNoteModal(false); setMsg('Nota agregada.');
      setErr(null);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'No se pudo guardar la nota clinica.');
    }
  };

  const doAddPrev = async (e: FormEvent) => {
    e.preventDefault();
    if (!pet) return;

    const requireDetail = pCat === 'medication' || pCat === 'vaccine';
    const requireAppointmentDetail = pCat === 'appointment';
    const cleanedTimes = pScheduleTimes.map((t) => t.trim()).filter(Boolean);
    const cleanedAppointmentChannels = pAppointmentChannels.map((c) => c.trim()).filter(Boolean);
    const normalizedAppointmentPhone = buildE164Phone(pAppointmentPhoneCountry, pAppointmentPhoneLocal);
    const usesWhatsapp = cleanedAppointmentChannels.includes('WhatsApp');
    const isDeworming = pCat === 'deworming';
    const isTratamiento = requireDetail && pRecordMode === 'tratamiento';
    const isPeriodic = requireDetail && pRecordMode === 'periodico';
    const treatmentGroupId = crypto.randomUUID();

    if (requireDetail && !pDose.trim()) {
      setErr('La dosis es obligatoria para medicacion y vacuna.');
      return;
    }
    if (isTratamiento && (!pDurationDays || Number(pDurationDays) <= 0)) {
      setErr('Debes indicar la duracion (dias).');
      return;
    }
    if (isTratamiento && cleanedTimes.length === 0) {
      setErr('Debes indicar al menos un horario.');
      return;
    }
    if (isPeriodic && !pNextPeriodicDate) {
      setErr('No se pudo calcular la proxima fecha. Revisa la fecha y la frecuencia.');
      return;
    }
    if (requireAppointmentDetail && !pAppointmentReason.trim()) {
      setErr('El motivo es obligatorio para un turno.');
      return;
    }
    if (requireAppointmentDetail && !pAppointmentTime.trim()) {
      setErr('El horario es obligatorio para un turno.');
      return;
    }
    if (requireAppointmentDetail && !pAppointmentLocation.trim()) {
      setErr('El lugar es obligatorio para un turno.');
      return;
    }
    if (requireAppointmentDetail && !pAppointmentReference.trim()) {
      setErr('La referencia es obligatoria para un turno.');
      return;
    }
    if (requireAppointmentDetail && pAppointmentNotifyEnabled && cleanedAppointmentChannels.length === 0) {
      setErr('Selecciona al menos un medio de notificacion.');
      return;
    }
    if (requireAppointmentDetail && pAppointmentNotifyEnabled && usesWhatsapp && !normalizedAppointmentPhone) {
      setErr('Para WhatsApp debes indicar un celular.');
      return;
    }
    if (requireAppointmentDetail && pAppointmentNotifyEnabled && usesWhatsapp && !isValidE164Phone(normalizedAppointmentPhone)) {
      setErr('El celular de WhatsApp no es valido. Usa formato internacional, por ejemplo: +5491122334455.');
      return;
    }
    if (isDeworming && pAutoScheduleNextDeworming && !pNextDewormingDate) {
      setErr('Debes elegir la fecha del proximo desparasitario.');
      return;
    }

    try {
      let followUpScheduleFailed = false;

      if (requireAppointmentDetail && pAppointmentNotifyEnabled && usesWhatsapp && isValidE164Phone(normalizedAppointmentPhone)) {
        const currentProfile = readNotificationProfile(user);
        writeNotificationProfile(user, {
          defaultEmail: currentProfile.defaultEmail,
          defaultPhone: normalizedAppointmentPhone,
          channels: currentProfile.channels,
        });
      }

      const notificationProfile = readNotificationProfile(user);
      const normalizedDefaultChannels = notificationProfile.channels.length > 0 ? notificationProfile.channels : ['Push'];
      const normalizedDefaultPhone = notificationProfile.defaultPhone || undefined;
      const normalizedDefaultEmail = notificationProfile.defaultEmail || undefined;

      if (isTratamiento && cleanedTimes.length > 0) {
        const durationDays = Math.max(1, Number(pDurationDays || 1));
        const endDate = addDaysToDateString(pDate, durationDays - 1);
        const planDates = listDatesByFrequency(pDate, endDate, pFrequency);
        const frequencyTimes = buildFrequencyTimes(cleanedTimes[0], pFrequency);
        let createdAlerts = 0;

        for (const day of planDates) {
          for (const time of frequencyTimes) {
            createdAlerts += 1;
            await addPreventiveTask({
              petId: pet.id,
              title: pTitle,
              category: pCat,
              dueDate: day,
              completed: false,
              dose: pDose.trim(),
              frequency: pFrequency,
              scheduleTimes: [time],
              appointmentTime: time,
              startDate: pDate,
              endDate: endDate,
              durationDays,
              notes: pNotes || undefined,
              remindersEnabled: pRemindersEnabled,
              notificationChannels: pRemindersEnabled ? normalizedDefaultChannels : undefined,
              notificationPhone: pRemindersEnabled ? normalizedDefaultPhone : undefined,
              notificationEmail: pRemindersEnabled ? normalizedDefaultEmail : undefined,
              createClinicalEntry: createdAlerts === 1,
              treatmentGroupId,
            });
          }
        }
      } else {
        await addPreventiveTask({
          petId: pet.id,
          title: pTitle,
          category: pCat,
          dueDate: pDate,
          completed: false,
          dose: requireDetail ? pDose.trim() : undefined,
          frequency: isTratamiento ? pFrequency : undefined,
          scheduleTimes: isTratamiento ? cleanedTimes : undefined,
          startDate: pDate,
          endDate: isTratamiento ? addDaysToDateString(pDate, Math.max(1, Number(pDurationDays || 1)) - 1) : undefined,
          durationDays: isTratamiento && pDurationDays ? Number(pDurationDays) : undefined,
          notes: pNotes || undefined,
          remindersEnabled: isTratamiento ? pRemindersEnabled : (requireAppointmentDetail ? pAppointmentNotifyEnabled : undefined),
          appointmentReason: requireAppointmentDetail ? pAppointmentReason.trim() : undefined,
          appointmentTime: requireAppointmentDetail ? pAppointmentTime.trim() : undefined,
          appointmentLocation: requireAppointmentDetail ? pAppointmentLocation.trim() : undefined,
          appointmentReference: requireAppointmentDetail ? pAppointmentReference.trim() : undefined,
          notificationLeadTime: requireAppointmentDetail && pAppointmentNotifyEnabled ? pAppointmentLeadTime : undefined,
          notificationChannels: requireAppointmentDetail && pAppointmentNotifyEnabled ? cleanedAppointmentChannels : undefined,
          notificationPhone: requireAppointmentDetail && pAppointmentNotifyEnabled && usesWhatsapp ? normalizedAppointmentPhone : undefined,
          treatmentGroupId,
        });
      }

      if (isDeworming && pAutoScheduleNextDeworming && pNextDewormingDate) {
        try {
          await addPreventiveTask({
            petId: pet.id,
            title: `Proximo ${pTitle.trim() || 'desparasitario'}`,
            category: 'deworming',
            dueDate: pNextDewormingDate,
            completed: false,
            notes: `Sugerido cada ${pDewormingIntervalMonths} meses desde ${pDate}.`,
            remindersEnabled: pDewormingRemindersEnabled,
            notificationLeadTime: pDewormingRemindersEnabled ? '24 horas antes' : undefined,
            notificationChannels: pDewormingRemindersEnabled ? ['Push'] : undefined,
          });
        } catch {
          followUpScheduleFailed = true;
        }
      }

      if (isPeriodic && pNextPeriodicDate) {
        try {
          await addPreventiveTask({
            petId: pet.id,
            title: `Proxima dosis: ${pTitle.trim() || 'aplicacion'}`,
            category: pCat,
            dueDate: pNextPeriodicDate,
            completed: false,
            notes: `Aplicacion periodica (${pPeriodicFrequency}) sugerida desde ${pDate}.`,
            remindersEnabled: pPeriodicRemindersEnabled,
            notificationLeadTime: pPeriodicRemindersEnabled ? '24 horas antes' : undefined,
            notificationChannels: pPeriodicRemindersEnabled ? ['Push'] : undefined,
          });
        } catch {
          followUpScheduleFailed = true;
        }
      }

      setPTitle('');
      setPCat('vaccine');
      setPDose('');
      setPFrequency(DEFAULT_MEDICATION_FREQUENCY);
      setPScheduleTimes(['08:00']);
      setPDurationDays('');
      setPNotes('');
      setPRemindersEnabled(true);
      setPAppointmentReason('');
      setPAppointmentTime('09:00');
      setPAppointmentLocation('');
      setPAppointmentReference('');
      setPAppointmentNotifyEnabled(true);
      setPAppointmentLeadTime(APPOINTMENT_LEAD_OPTIONS[2]);
      setPAppointmentChannels(['Email']);
      const profile = readNotificationProfile(user);
      const parsedPhone = profile.defaultPhone
        ? splitPhoneByCountryCode(profile.defaultPhone)
        : { countryCode: detectedDialCode, localNumber: '' };
      setPAppointmentPhoneCountry(parsedPhone.countryCode);
      setPAppointmentPhoneLocal(parsedPhone.localNumber);
      setPDewormingIntervalMonths(3);
      setPNextDewormingDate('');
      setPAutoScheduleNextDeworming(true);
      setPDewormingRemindersEnabled(true);
      setPRecordMode('tratamiento');
      setPPeriodicFrequency('anual');
      setPNextPeriodicDate('');
      setPPeriodicRemindersEnabled(true);
      setPrevModal(false);
      if (followUpScheduleFailed) {
        setMsg('Cuidado guardado, pero no se pudo programar el siguiente recordatorio.');
      } else if (isDeworming && pAutoScheduleNextDeworming) {
        setMsg('Desparasitario guardado y proximo tratamiento programado.');
      } else if (isPeriodic) {
        setMsg('Aplicacion guardada y proxima dosis calculada.');
      } else {
        setMsg('Preventivo agregado.');
      }
      setErr(null);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'No se pudo guardar el preventivo.');
    }
  };

  const isDetailedPreventive = pCat === 'medication' || pCat === 'vaccine';
  const isAppointmentPreventive = pCat === 'appointment';
  const isDewormingPreventive = pCat === 'deworming';
  const computedMedicationEndDate = useMemo(() => {
    if (!isDetailedPreventive) return '';
    const duration = Number(pDurationDays || 0);
    if (!duration || duration <= 0 || !pDate) return '';
    return addDaysToDateString(pDate, duration - 1);
  }, [isDetailedPreventive, pDate, pDurationDays]);

  const updateScheduleTime = (index: number, value: string) => {
    setPScheduleTimes((prev) => prev.map((time, i) => (i === index ? value : time)));
  };
  const addScheduleTime = () => {
    setPScheduleTimes((prev) => [...prev, '20:00']);
  };
  const removeScheduleTime = (index: number) => {
    setPScheduleTimes((prev) => prev.filter((_, i) => i !== index));
  };
  const toggleAppointmentChannel = (channel: string) => {
    setPAppointmentChannels((prev) => (
      prev.includes(channel)
        ? prev.filter((item) => item !== channel)
        : [...prev, channel]
    ));
  };
  const appointmentUsesWhatsapp = pAppointmentChannels.includes('WhatsApp');
  const normalizedAppointmentPhone = buildE164Phone(pAppointmentPhoneCountry, pAppointmentPhoneLocal);
  const isAppointmentPhoneValid = isValidE164Phone(normalizedAppointmentPhone);

  useEffect(() => {
    if (!isDewormingPreventive) {
      return;
    }
    const suggested = addMonthsToDateString(pDate, pDewormingIntervalMonths);
    setPNextDewormingDate(suggested);
  }, [isDewormingPreventive, pDate, pDewormingIntervalMonths]);

  useEffect(() => {
    if (!(isDetailedPreventive && pRecordMode === 'periodico')) {
      return;
    }
    const suggested = addMonthsToDateString(pDate, PERIODIC_FREQUENCY_MONTHS[pPeriodicFrequency]);
    setPNextPeriodicDate(suggested);
  }, [isDetailedPreventive, pRecordMode, pDate, pPeriodicFrequency]);

  const doTogglePreventive = async (taskId: string) => {
    try {
      await toggleTask(taskId);
      setErr(null);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'No se pudo actualizar el preventivo.');
    }
  };

  const doPostponePreventive = async (taskId: string) => {
    const raw = window.prompt('Posponer alerta (minutos):', '30');
    if (!raw) {
      return;
    }
    const minutes = Number(raw);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setErr('Ingresa una cantidad valida de minutos para posponer.');
      return;
    }

    try {
      await postponeTask(taskId, Math.round(minutes));
      setErr(null);
      setMsg(`Alerta pospuesta ${Math.round(minutes)} minutos.`);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'No se pudo posponer la alerta.');
    }
  };

  const doPdf = async () => {
    try {
      const f = await generateClinicalPdf('/logo-aipetfriendly.png');
      const url = URL.createObjectURL(f.blob);
      const a = document.createElement('a');
      a.href = url; a.download = f.fileName; a.click();
      URL.revokeObjectURL(url);
    } catch (ex) { setMsg(ex instanceof Error ? ex.message : 'No se pudo generar PDF.'); }
  };

  const doMail = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await sendClinicalPdfByEmail(mailTo, '/logo-aipetfriendly.png');
      setMailModal(false); setMailTo(''); setMsg('Email enviado.');
    } catch (ex) { setMsg(ex instanceof Error ? ex.message : 'No se pudo enviar.'); }
  };

  const doLibretaPdf = async () => {
    try {
      const f = await generateHealthBookletPdf('/logo-aipetfriendly.png');
      const url = URL.createObjectURL(f.blob);
      const a = document.createElement('a');
      a.href = url; a.download = f.fileName; a.click();
      URL.revokeObjectURL(url);
    } catch (ex) { setMsg(ex instanceof Error ? ex.message : 'No se pudo generar PDF.'); }
  };

  const doLibretaMail = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await sendHealthBookletPdfByEmail(mailTo, '/logo-aipetfriendly.png');
      setLibretaMailModal(false); setMailTo(''); setMsg('Email enviado.');
    } catch (ex) { setMsg(ex instanceof Error ? ex.message : 'No se pudo enviar.'); }
  };

  const doMedicacionPdf = async () => {
    try {
      const f = await generateMedicationLogPdf('/logo-aipetfriendly.png');
      const url = URL.createObjectURL(f.blob);
      const a = document.createElement('a');
      a.href = url; a.download = f.fileName; a.click();
      URL.revokeObjectURL(url);
    } catch (ex) { setMsg(ex instanceof Error ? ex.message : 'No se pudo generar PDF.'); }
  };

  const doMedicacionMail = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await sendMedicationLogPdfByEmail(mailTo, '/logo-aipetfriendly.png');
      setMedicacionMailModal(false); setMailTo(''); setMsg('Email enviado.');
    } catch (ex) { setMsg(ex instanceof Error ? ex.message : 'No se pudo enviar.'); }
  };

  useEffect(() => {
    if (view !== 'identificacion' || !pet) return;
    let cancelled = false;
    setIdLoading(true);
    Promise.all([getMessages(pet.id), getTagRequest(pet.id), getLinkedTagCode(pet.id)])
      .then(([messages, tag, linkedCode]) => {
        if (cancelled) return;
        setSightingMessages(messages);
        setTagRequest(tag);
        setLinkedTagCode(linkedCode);
      })
      .catch((ex) => { if (!cancelled) setErr(ex instanceof Error ? ex.message : 'No se pudieron cargar los mensajes.'); })
      .finally(() => { if (!cancelled) setIdLoading(false); });
    return () => { cancelled = true; };
  }, [view, pet, getMessages, getTagRequest, getLinkedTagCode]);

  const doGeneratePoster = async () => {
    if (!pet) return;
    setPosterBusy(true);
    try {
      const f = await generatePosterPdf(pet, '/logo-aipetfriendly.png', {
        lostDate: posterLostDate || undefined,
        lostPlace: posterLostPlace || undefined,
        contactPhone: posterContactPhone.trim() || undefined,
        distinguishingMarks: posterDistinguishingMarks.trim() || undefined,
        extraMessage: posterExtraMessage.trim() || undefined,
      });
      const url = URL.createObjectURL(f.blob);
      const a = document.createElement('a');
      a.href = url; a.download = f.fileName; a.click();
      URL.revokeObjectURL(url);
      setErr(null);
      setPosterModal(false);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'No se pudo generar el cartel.');
    } finally {
      setPosterBusy(false);
    }
  };

  const doMarkMessageRead = async (messageId: string) => {
    try {
      await markMessageRead(messageId);
      setSightingMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, readAt: new Date().toISOString() } : m)));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'No se pudo actualizar el mensaje.');
    }
  };

  const doLinkTagCode = async (codeOverride?: string) => {
    const code = (codeOverride ?? tagCodeInput).trim();
    if (!pet || !code) return;
    setTagLinkBusy(true);
    setErr(null);
    try {
      await linkTagCode(pet.id, code);
      setLinkedTagCode(code.toUpperCase());
      setTagCodeInput('');
      setMsg('Chapita vinculada correctamente.');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'No se pudo vincular la chapita.');
    } finally {
      setTagLinkBusy(false);
    }
  };

  const doUnlinkTagCode = async () => {
    if (!pet) return;
    setTagLinkBusy(true);
    setErr(null);
    try {
      await unlinkTagCode(pet.id);
      setLinkedTagCode(null);
      setMsg('Chapita desvinculada.');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'No se pudo desvincular la chapita.');
    } finally {
      setTagLinkBusy(false);
    }
  };

  // Los QR de chapita codifican una URL tipo /t/{codigo} o /chapita/{codigo}; tambien aceptamos el codigo suelto.
  const extractTagCodeFromScan = (raw: string): string | null => {
    const text = raw.trim();
    if (!text) return null;
    let path = text;
    try {
      path = new URL(text).pathname;
    } catch {
      // no es una URL absoluta, se usa el texto tal cual
    }
    const match = path.match(/\/(?:t|chapita)\/([A-Za-z0-9]+)\/?$/);
    if (match) return match[1].toUpperCase();
    if (/^[A-Za-z0-9]{4,16}$/.test(text)) return text.toUpperCase();
    return null;
  };

  const stopTagScanner = () => {
    if (tagScannerFrameRef.current !== null) {
      cancelAnimationFrame(tagScannerFrameRef.current);
      tagScannerFrameRef.current = null;
    }
    if (tagScannerStreamRef.current) {
      tagScannerStreamRef.current.getTracks().forEach((t) => t.stop());
      tagScannerStreamRef.current = null;
    }
    setTagScannerOpen(false);
  };

  const startTagScanner = async () => {
    setTagScannerErr(null);
    setTagScannerOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      tagScannerStreamRef.current = stream;
      const video = tagScannerVideoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const tick = () => {
        if (!video || video.readyState !== video.HAVE_ENOUGH_DATA || !ctx) {
          tagScannerFrameRef.current = requestAnimationFrame(tick);
          return;
        }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(frame.data, frame.width, frame.height);
        if (result?.data) {
          const code = extractTagCodeFromScan(result.data);
          if (code) {
            stopTagScanner();
            void doLinkTagCode(code);
            return;
          }
        }
        tagScannerFrameRef.current = requestAnimationFrame(tick);
      };
      tagScannerFrameRef.current = requestAnimationFrame(tick);
    } catch {
      setTagScannerErr('No se pudo acceder a la camara. Verifica los permisos.');
    }
  };

  useEffect(() => () => stopTagScanner(), []);

  /* ─── LIST ─────────────────────────────────────────── */
  if (view === 'list') return (
    <section className="space-y-5 pb-2">
      <div className="pt-2 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Mis Mascotas</h2>
        <p className="mt-1 text-slate-500">
          {pets.length} registradas
          {user?.subscription?.plan === 'premium' && user?.subscription?.isActive ? '' : ` (max ${freePetLimit})`}
        </p>
      </div>

      {user?.isGuest && (
        <div className="rounded-2xl bg-amber-50 border-2 border-amber-200 p-4">
          <p className="mb-3 text-sm font-semibold text-amber-900">⚠️ Modo visitante - Los datos no se guardarán</p>
          <button 
            type="button"
            onClick={() => setActiveTab('subscription')}
            className="w-full rounded-full bg-amber-500 py-2.5 font-bold text-white hover:bg-amber-600 transition"
          >
            Crear cuenta para guardar datos
          </button>
        </div>
      )}

      {canAddPet && (
        <button type="button" onClick={() => { setStep(1); setForm(INIT); setView('wizard'); }}
          className="w-full rounded-3xl border-2 border-dashed border-emerald-300 bg-white/80 py-6 text-center shadow-sm transition hover:bg-white">
          <span className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Plus size={28} />
          </span>
          <span className="block text-lg font-semibold text-slate-700">Agregar nueva mascota</span>
        </button>
      )}

      {!canAddPet && !user?.isGuest && (
        <div className="rounded-2xl bg-rose-50 border-2 border-rose-200 p-4">
          <p className="text-sm font-semibold text-rose-900">Has alcanzado el límite de mascotas ({freePetLimit})</p>
        </div>
      )}

      {user?.isGuest && pets.length === 0 && (
        <div className="rounded-3xl bg-white/60 px-6 py-14 text-center shadow-sm">
          <span className="mx-auto mb-5 inline-flex h-28 w-28 items-center justify-center rounded-full bg-emerald-100 text-emerald-400">
            <Heart size={52} />
          </span>
          <h3 className="text-2xl font-extrabold text-slate-900">Prueba agregando mascotas</h3>
          <p className="mt-2 text-slate-500">Crea una cuenta para guardar tus datos</p>
        </div>
      )}

      {!user?.isGuest && pets.length === 0 ? (
        <div className="rounded-3xl bg-white/60 px-6 py-14 text-center shadow-sm">
          <span className="mx-auto mb-5 inline-flex h-28 w-28 items-center justify-center rounded-full bg-emerald-100 text-emerald-400">
            <Heart size={52} />
          </span>
          <h3 className="text-2xl font-extrabold text-slate-900">No tienes mascotas registradas</h3>
          <p className="mt-2 text-slate-500">Comienza agregando tu primera mascota</p>
          <button type="button" onClick={() => { setStep(1); setForm(INIT); setView('wizard'); }}
            className="mt-6 rounded-2xl bg-emerald-500 px-8 py-3.5 font-bold text-white">
            Agregar mascota
          </button>
        </div>
      ) : (
        pets.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {pets.map(p => (
            <button key={p.id} type="button" onClick={() => { selectPet(p.id); setView('detail'); }}
              className="flex items-center gap-4 rounded-3xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-100 transition active:scale-[0.98]">
              {p.photoUrl
                ? <img src={p.photoUrl} alt={p.name} className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
                : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-3xl">{SP_EMOJI[p.species]}</span>
              }
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-900">{p.name}</p>
                <p className="text-sm text-slate-500">{p.breed}</p>
                <p className="text-xs text-slate-400">{p.ageYears}a {p.ageMonths}m · {p.weightKg} kg</p>
              </div>
              <ChevronRight size={18} className="shrink-0 text-slate-300" />
            </button>
          ))}
        </div>
        )
      )}

      <PetGuidesTeaser className="mt-2" />
    </section>
  );

  /* ─── WIZARD ────────────────────────────────────────── */
  if (view === 'wizard') return (
    <section className="space-y-5 pb-2">
      <div className="pt-2 text-center">
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
          <PawPrint size={26} />
        </span>
        <h2 className="mt-3 text-2xl font-extrabold text-slate-900">Registra tu mascota</h2>
        <p className="mt-1 text-sm text-slate-500">Paso {step} de 3</p>
        <div className="mt-3 flex justify-center gap-2">
          {[1,2,3].map(i => (
            <div key={i} className={`h-1.5 w-10 rounded-full transition-colors ${i <= step ? 'bg-emerald-500' : 'bg-slate-200'}`} />
          ))}
        </div>
      </div>

      <div className="rounded-3xl bg-white p-5 shadow-sm">
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-2">
              <button type="button" onClick={() => photoRef.current?.click()}
                className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-emerald-300 bg-emerald-50 transition hover:bg-emerald-100">
                {form.photoUrl
                  ? <img src={form.photoUrl} alt="preview" className="h-full w-full object-cover" />
                  : <Camera size={28} className="text-emerald-400" />
                }
              </button>
              <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={e => onPhoto(e)} />
              <p className="text-xs text-slate-400">{imgBusy ? 'Procesando...' : 'Toca para agregar una foto'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Nombre *</label>
              <input value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))}
                placeholder="¿Como se llama?" className={`mt-1.5 ${inp}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Especie *</label>
              <select value={form.species} onChange={e => setForm(p => ({...p, species: e.target.value as Species}))}
                className={`mt-1.5 ${inp}`}>
                <option value="dog">🐕 Perro</option>
                <option value="cat">🐈 Gato</option>
                <option value="other">🐾 Otra</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Raza *</label>
              <input value={form.breed} onChange={e => setForm(p => ({...p, breed: e.target.value}))}
                placeholder="Ej: Golden Retriever, Persa..." className={`mt-1.5 ${inp}`} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Fecha de nacimiento *</label>
              <input type="date" max={new Date().toISOString().split('T')[0]}
                value={form.birthDate} onChange={e => onBirth(e.target.value)}
                className={`mt-1.5 ${inp}`} />
              {form.birthDate && !err && (
                <p className="mt-1.5 text-xs text-emerald-600">Edad: {form.ageYears} años y {form.ageMonths} meses</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Peso (kg) *</label>
              <input type="number" min={0.1} step={0.1} value={form.weightKg}
                onChange={e => setForm(p => ({...p, weightKg: Number(e.target.value)}))}
                placeholder="Ej: 12.5" className={`mt-1.5 ${inp}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Sexo</label>
              <select value={form.sex} onChange={e => setForm(p => ({...p, sex: e.target.value as PetSex}))}
                className={`mt-1.5 ${inp}`}>
                <option value="female">Hembra</option>
                <option value="male">Macho</option>
                <option value="unknown">No especificado</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Señas particulares (opcional)</label>
              <textarea value={form.distinguishingMarks ?? ''} onChange={e => setForm(p => ({...p, distinguishingMarks: e.target.value}))}
                placeholder="Ej: lunar en la lengua, mancha en la oreja, tímido..." rows={2}
                className={`mt-1.5 ${inp}`} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="font-bold text-slate-800">Confirmar datos</h3>
            <div className="flex items-center gap-4 rounded-2xl bg-emerald-50 p-4">
              {form.photoUrl
                ? <img src={form.photoUrl} className="h-16 w-16 rounded-xl object-cover" alt="pet" />
                : <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-white text-3xl">{SP_EMOJI[form.species]}</span>
              }
              <div>
                <p className="text-xl font-bold text-slate-900">{form.name}</p>
                <p className="text-sm text-slate-600">{form.breed}</p>
                <p className="text-xs text-slate-500">{form.ageYears}a {form.ageMonths}m · {form.weightKg} kg · {SEX_LBL[form.sex]}</p>
              </div>
            </div>
            <p className="text-center text-sm text-slate-400">¿Los datos son correctos?</p>
          </div>
        )}

        {err && <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</p>}

        <div className="mt-6 flex gap-3">
          {step > 1
            ? <button type="button" onClick={doBack} className="w-full rounded-full border-2 border-slate-200 py-3.5 font-semibold text-slate-600">Anterior</button>
            : <button type="button" onClick={() => { setView('list'); setForm(INIT); setStep(1); setErr(null); }}
                className="w-full rounded-full border-2 border-slate-200 py-3.5 font-semibold text-slate-600">Cancelar</button>
          }
          {step < 3
            ? <button type="button" onClick={doNext} className="w-full rounded-full bg-emerald-500 py-3.5 font-bold text-white">Siguiente</button>
            : <button type="button" onClick={doSave}  className="w-full rounded-full bg-emerald-500 py-3.5 font-bold text-white">Guardar mascota</button>
          }
        </div>
      </div>
    </section>
  );

  /* ─── EDIT ──────────────────────────────────────────── */
  if (view === 'edit' && pet) return (
    <section className="space-y-5 pb-2">
      <div className="pt-2 text-center">
        <h2 className="text-2xl font-extrabold text-slate-900">Editar {pet.name}</h2>
        <p className="mt-1 text-sm text-slate-500">Actualiza los datos de tu mascota</p>
      </div>

      <div className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="space-y-4">
          {/* photo */}
          <div className="flex flex-col items-center gap-2">
            <button type="button" onClick={() => photoRef.current?.click()}
              className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-emerald-300 bg-emerald-50 transition hover:bg-emerald-100">
              {form.photoUrl
                ? <img src={form.photoUrl} alt="preview" className="h-full w-full object-cover" />
                : <Camera size={28} className="text-emerald-400" />
              }
            </button>
            <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={e => onPhoto(e)} />
            <p className="text-xs text-slate-400">{imgBusy ? 'Procesando...' : 'Toca para cambiar foto'}</p>
          </div>

          {/* nombre */}
          <div>
            <label className="block text-sm font-medium text-slate-700">Nombre *</label>
            <input value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))}
              placeholder="¿Como se llama?" className={`mt-1.5 ${inp}`} />
          </div>

          {/* especie */}
          <div>
            <label className="block text-sm font-medium text-slate-700">Especie *</label>
            <select value={form.species} onChange={e => setForm(p => ({...p, species: e.target.value as Species}))}
              className={`mt-1.5 ${inp}`}>
              <option value="dog">🐕 Perro</option>
              <option value="cat">🐈 Gato</option>
              <option value="other">🐾 Otra</option>
            </select>
          </div>

          {/* raza */}
          <div>
            <label className="block text-sm font-medium text-slate-700">Raza *</label>
            <input value={form.breed} onChange={e => setForm(p => ({...p, breed: e.target.value}))}
              placeholder="Ej: Golden Retriever, Persa..." className={`mt-1.5 ${inp}`} />
          </div>

          {/* fecha de nacimiento */}
          <div>
            <label className="block text-sm font-medium text-slate-700">Fecha de nacimiento *</label>
            <input type="date" max={new Date().toISOString().split('T')[0]}
              value={form.birthDate} onChange={e => onBirth(e.target.value)}
              className={`mt-1.5 ${inp}`} />
            {form.birthDate && !err && (
              <p className="mt-1.5 text-xs text-emerald-600">Edad: {form.ageYears} años y {form.ageMonths} meses</p>
            )}
          </div>

          {/* peso */}
          <div>
            <label className="block text-sm font-medium text-slate-700">Peso (kg) *</label>
            <input type="number" min={0.1} step={0.1} value={form.weightKg}
              onChange={e => setForm(p => ({...p, weightKg: Number(e.target.value)}))}
              placeholder="Ej: 12.5" className={`mt-1.5 ${inp}`} />
          </div>

          {/* sexo */}
          <div>
            <label className="block text-sm font-medium text-slate-700">Sexo</label>
            <select value={form.sex} onChange={e => setForm(p => ({...p, sex: e.target.value as PetSex}))}
              className={`mt-1.5 ${inp}`}>
              <option value="female">Hembra</option>
              <option value="male">Macho</option>
              <option value="unknown">No especificado</option>
            </select>
          </div>

          {/* señas particulares */}
          <div>
            <label className="block text-sm font-medium text-slate-700">Señas particulares (opcional)</label>
            <textarea value={form.distinguishingMarks ?? ''} onChange={e => setForm(p => ({...p, distinguishingMarks: e.target.value}))}
              placeholder="Ej: lunar en la lengua, mancha en la oreja, tímido..." rows={2}
              className={`mt-1.5 ${inp}`} />
          </div>
        </div>

        {err && <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</p>}

        {/* botones de guardar/cancelar */}
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={() => { setView('detail'); setErr(null); }}
            className="w-full rounded-full border-2 border-slate-200 py-3.5 font-semibold text-slate-600">Cancelar</button>
          <button type="button" onClick={async () => {
            if (!form.name.trim()) { setErr('El nombre es requerido.'); return; }
            if (!form.breed.trim()) { setErr('La raza es requerida.'); return; }
            if (!form.birthDate) { setErr('La fecha es requerida.'); return; }
            try {
              await updatePet(pet.id, form);
              setErr(null);
              setView('detail');
              setMsg('Mascota actualizada correctamente.');
            } catch (ex) {
              setErr(ex instanceof Error ? ex.message : 'No se pudo actualizar la mascota.');
            }
          }}
            className="w-full rounded-full bg-emerald-500 py-3.5 font-bold text-white">Guardar cambios</button>
        </div>

        {/* botón eliminar */}
        <button type="button" onClick={() => setDeleteConfirm(true)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-3xl border border-rose-200 bg-white py-3 text-sm font-semibold text-rose-500 shadow-sm">
          <Trash2 size={15} /> Eliminar mascota
        </button>
      </div>

      {msg && <p className="rounded-2xl bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{msg}</p>}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6">
            <div className="mb-4 flex items-center justify-center rounded-2xl bg-rose-50 py-6">
              <Trash2 size={48} className="text-rose-400" />
            </div>
            <h3 className="text-center text-xl font-bold text-slate-900">Eliminar {pet.name}?</h3>
            <p className="mt-2 text-center text-sm text-slate-500">Esta accion no se puede deshacer. Se liberara un cupo para agregar otra mascota.</p>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setDeleteConfirm(false)}
                className="w-full rounded-full border-2 border-slate-200 py-3 font-semibold text-slate-600">Cancelar</button>
              <button type="button" onClick={async () => {
                try {
                  await removePet(pet.id);
                  setDeleteConfirm(false);
                  setView('list');
                } catch (ex) {
                  setErr(ex instanceof Error ? ex.message : 'No se pudo eliminar la mascota.');
                  setDeleteConfirm(false);
                }
              }}
                className="w-full rounded-full bg-rose-500 py-3 font-bold text-white">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );

  /* ─── DETAIL ────────────────────────────────────────── */
  if (view === 'detail' && pet) return (
    <section className="pb-2">
      <div className="-mx-4 bg-emerald-500 px-4 pb-6 pt-3">
        <div className="mb-4 flex items-center justify-between">
          <button type="button" onClick={() => setView('list')}
            className="inline-flex items-center gap-1 text-sm font-medium text-white/80 hover:text-white">
            <ChevronLeft size={18} /> Volver
          </button>
          <button type="button" onClick={() => detailPhotoRef.current?.click()}
            className="rounded-full bg-white/20 p-2 text-white">
            <Camera size={18} />
          </button>
          <input ref={detailPhotoRef} type="file" accept="image/*" className="hidden" onChange={e => onPhoto(e, pet.id)} />
        </div>
        <div className="flex items-center gap-4">
          {pet.photoUrl
            ? <img src={pet.photoUrl} alt={pet.name} className="h-20 w-20 rounded-2xl border-2 border-white/40 object-cover" />
            : <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/20 text-5xl">{SP_EMOJI[pet.species]}</span>
          }
          <div className="text-white">
            <h2 className="text-2xl font-extrabold">{pet.name}</h2>
            <p className="text-white/80">{pet.breed}</p>
            <p className="text-sm text-white/70">{pet.ageYears}a {pet.ageMonths}m</p>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="rounded-3xl bg-white p-4 shadow-sm">
          <p className="mb-3 font-bold text-slate-900">Informacion</p>
          <div className="grid grid-cols-2 gap-y-3 text-sm">
            <div>
              <p className="text-xs text-slate-400">Fecha de nacimiento</p>
              <p className="font-medium text-slate-800">
                {pet.birthDate ? new Date(pet.birthDate + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Peso</p>
              <p className="font-medium text-slate-800">{pet.weightKg} kg</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Sexo</p>
              <p className="font-medium text-slate-800">{SEX_LBL[pet.sex]}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Especie</p>
              <p className="font-medium text-slate-800">{pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : 'Otra'}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <button type="button" onClick={() => setView('preventivos')}
            className="flex flex-col items-center gap-2 rounded-3xl bg-white p-4 shadow-sm transition hover:bg-emerald-50">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Shield size={22} /></span>
            <span className="font-semibold text-slate-800">Cuidados</span>
            <span className="text-xs text-slate-500">Vacunas y mas</span>
          </button>
          <button type="button" onClick={() => setView('comida')}
            className="flex flex-col items-center gap-2 rounded-3xl bg-white p-4 shadow-sm transition hover:bg-emerald-50">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Utensils size={22} /></span>
            <span className="font-semibold text-slate-800">Comida</span>
            <span className="text-xs text-slate-500">Consumo y peso</span>
          </button>
          <button type="button" onClick={() => setView('historial')}
            className="flex flex-col items-center gap-2 rounded-3xl bg-white p-4 shadow-sm transition hover:bg-emerald-50">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><ClipboardList size={22} /></span>
            <span className="font-semibold text-slate-800">Historial</span>
            <span className="text-xs text-slate-500">Ver todo + PDF</span>
          </button>
          <button type="button" onClick={() => setView('libreta-sanitaria')}
            className="flex flex-col items-center gap-2 rounded-3xl bg-white p-4 shadow-sm transition hover:bg-emerald-50">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-sky-600"><Syringe size={22} /></span>
            <span className="font-semibold text-slate-800">Libreta sanitaria</span>
            <span className="text-xs text-slate-500">Vacunas y desparasit.</span>
          </button>
          <button type="button" onClick={() => setView('control-medicacion')}
            className="flex flex-col items-center gap-2 rounded-3xl bg-white p-4 shadow-sm transition hover:bg-emerald-50">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 text-purple-600"><Pill size={22} /></span>
            <span className="font-semibold text-slate-800">Medicacion</span>
            <span className="text-xs text-slate-500">Dosis suministradas</span>
          </button>
          <button type="button" onClick={() => { setErr(null); setView('identificacion'); }}
            className="flex flex-col items-center gap-2 rounded-3xl bg-white p-4 shadow-sm transition hover:bg-emerald-50">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600"><QrCode size={22} /></span>
            <span className="font-semibold text-slate-800">Identificacion</span>
            <span className="text-xs text-slate-500">Cartel, QR y mensajes</span>
          </button>
        </div>

        <button type="button" onClick={() => { setErr(null); setNoteModal(true); }}
          className="w-full rounded-3xl bg-white py-4 text-center font-semibold text-emerald-600 shadow-sm">
          + Agregar nota clinica
        </button>
        <button type="button" onClick={() => setActiveTab('clinical')}
          className="w-full rounded-3xl bg-emerald-500 py-4 text-center font-bold text-white shadow-sm">
          Consultar con veterinario IA
        </button>
        <button type="button" onClick={() => { setErr(null); setPrevModal(true); }}
          className="w-full rounded-3xl border-2 border-emerald-300 bg-white py-4 text-center font-semibold text-emerald-700 shadow-sm">
          + Agregar medicacion
        </button>
        <button type="button" onClick={() => { const editForm: PetFormData = { name: pet.name, breed: pet.breed, species: pet.species, sex: pet.sex, birthDate: pet.birthDate ?? '', ageYears: pet.ageYears, ageMonths: pet.ageMonths, weightKg: pet.weightKg, photoUrl: pet.photoUrl ?? '', distinguishingMarks: pet.distinguishingMarks ?? '' }; setForm(editForm); setView('edit'); }}
          className="w-full rounded-3xl border-2 border-amber-300 bg-white py-3 text-center font-semibold text-amber-700 shadow-sm">
          ✏️ Editar mascota
        </button>
        <button type="button" onClick={() => setDeleteConfirm(true)}
          className="flex w-full items-center justify-center gap-2 rounded-3xl border border-rose-200 bg-white py-3 text-sm font-semibold text-rose-500 shadow-sm">
          <Trash2 size={15} /> Eliminar mascota
        </button>

        {msg && <p className="rounded-2xl bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{msg}</p>}
      </div>

      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 md:items-center">
          <form onSubmit={doAddNote} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 md:rounded-3xl">
            <div className="mb-5 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-yellow-100 text-xl">📝</span>
                <div><p className="font-bold text-slate-900">Nueva Nota Clinica</p><p className="text-xs text-slate-500">Para {pet.name}</p></div>
              </div>
              <button type="button" onClick={() => setNoteModal(false)} className="text-slate-400"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Categoria</label>
                <select value={nCat} onChange={e => setNCat(e.target.value as ClinicalEntryCategory)} className={inp}>
                  <option value="clinical_note">📝 Nota</option>
                  <option value="vaccine">💉 Vacuna</option>
                  <option value="medication">💊 Medicamento</option>
                  <option value="deworming">🪱 Desparasitario</option>
                  <option value="treatment">🩺 Tratamiento</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Titulo *</label>
                <input value={nTitle} onChange={e => setNTitle(e.target.value)}
                  placeholder="Ej: Consulta general, Vacunacion, Analisis..." className={inp} required />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Descripcion *</label>
                <textarea value={nDesc} onChange={e => setNDesc(e.target.value)}
                  placeholder="Detalles de la consulta, diagnostico, tratamiento..."
                  className={`${inp} min-h-24 resize-none`} required />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Fecha *</label>
                <input type="date" value={nDate} onChange={e => setNDate(e.target.value)} className={inp} required />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Veterinario</label>
                <input value={nVet} onChange={e => setNVet(e.target.value)} placeholder="Dr./Dra. Nombre" className={inp} />
              </div>
            </div>
            {err && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</p>}
            <button type="submit" className="mt-5 w-full rounded-full bg-emerald-500 py-3.5 font-bold text-white">Guardar</button>
          </form>
        </div>
      )}

      {prevModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 md:items-center">
          <form onSubmit={doAddPrev} className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-4 md:rounded-3xl">
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-xl">🛡️</span>
                <div><p className="font-bold text-slate-900">Nuevo Cuidado</p><p className="text-xs text-slate-500">Para {pet.name}</p></div>
              </div>
              <button type="button" onClick={() => setPrevModal(false)} className="text-slate-400"><X size={20} /></button>
            </div>
            <div className="space-y-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Tipo</label>
                <select value={pCat} onChange={e => {
                  const next = e.target.value as PreventiveCategory;
                  setPCat(next);
                  if (next !== 'medication' && next !== 'vaccine') setPRecordMode('tratamiento');
                }} className={inp}>
                  <option value="medication">💊 Medicacion</option>
                  <option value="vaccine">💉 Vacuna</option>
                  <option value="deworming">🪱 Desparasitacion</option>
                  <option value="appointment">🏥 Turno</option>
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
              {isDewormingPreventive && (
                <>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-sm font-semibold text-emerald-800">Sugerencia de proximo tratamiento</p>
                    <p className="mt-1 text-xs text-emerald-700">Elige cada cuántos meses repetir y te calculamos la fecha.</p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Repetir dentro de</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[1, 3, 6].map((months) => (
                        <button
                          key={months}
                          type="button"
                          onClick={() => setPDewormingIntervalMonths(months)}
                          className={`rounded-xl border px-3 py-2 text-sm font-semibold ${pDewormingIntervalMonths === months ? 'border-emerald-400 bg-emerald-100 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}
                        >
                          {months} mes{months !== 1 ? 'es' : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Fecha proxima sugerida</label>
                    <input type="date" value={pNextDewormingDate} onChange={e => setPNextDewormingDate(e.target.value)} className={inp} />
                  </div>
                  <label className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                    <span className="text-sm font-medium text-emerald-800">Programar proximo desparasitario</span>
                    <input
                      type="checkbox"
                      checked={pAutoScheduleNextDeworming}
                      onChange={(e) => setPAutoScheduleNextDeworming(e.target.checked)}
                      className="h-4 w-4"
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                    <span className="text-sm font-medium text-emerald-800">Activar recordatorio del proximo</span>
                    <input
                      type="checkbox"
                      checked={pDewormingRemindersEnabled}
                      onChange={(e) => setPDewormingRemindersEnabled(e.target.checked)}
                      className="h-4 w-4"
                    />
                  </label>
                </>
              )}
              {isDetailedPreventive && (
                <>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Dosis *</label>
                    <input value={pDose} onChange={e => setPDose(e.target.value)} placeholder="Ej: 1 comprimido, 2 ml" className={inp} required={isDetailedPreventive} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Tipo de registro</label>
                    <div className="grid grid-cols-3 gap-2">
                      {RECORD_MODE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setPRecordMode(option.value)}
                          className={`rounded-xl border px-2 py-2 text-xs font-semibold ${pRecordMode === option.value ? 'border-emerald-400 bg-emerald-100 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {pRecordMode === 'tratamiento' && 'Tratamiento con horarios y duracion definida.'}
                      {pRecordMode === 'ocasional' && 'Se aplica una unica vez, sin recordatorios.'}
                      {pRecordMode === 'periodico' && 'Se repite cada cierto tiempo. Calculamos la proxima fecha para la libreta sanitaria.'}
                    </p>
                  </div>
                  {pRecordMode === 'tratamiento' && (
                    <>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">Frecuencia</label>
                        <select value={pFrequency} onChange={e => setPFrequency(e.target.value)} className={inp}>
                          {FREQUENCY_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div className="mb-1.5 flex items-center justify-between">
                          <label className="block text-sm font-medium text-slate-700">Horarios</label>
                          <button type="button" onClick={addScheduleTime} className="text-xs font-semibold text-emerald-600">+ Agregar horario</button>
                        </div>
                        <div className="space-y-2">
                          {pScheduleTimes.map((time, index) => (
                            <div key={`${index}-${time}`} className="flex items-center gap-2">
                              <input
                                type="time"
                                value={time}
                                onChange={(e) => updateScheduleTime(index, e.target.value)}
                                className={inp}
                                required
                              />
                              {pScheduleTimes.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeScheduleTime(index)}
                                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"
                                >
                                  Quitar
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-sm font-medium text-slate-700">Duracion (dias)</label>
                          <input type="number" min={1} value={pDurationDays} onChange={e => setPDurationDays(e.target.value)} className={inp} placeholder="Ej: 7" required={pCat === 'medication'} />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium text-slate-700">Fin del tratamiento (calculado)</label>
                          <input type="date" value={computedMedicationEndDate} className={`${inp} bg-slate-50 text-slate-500`} readOnly />
                        </div>
                      </div>
                    </>
                  )}
                  {pRecordMode === 'periodico' && (
                    <>
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                        <p className="text-sm font-semibold text-emerald-800">Aplicacion periodica</p>
                        <p className="mt-1 text-xs text-emerald-700">Elegi cada cuanto se repite y calculamos la proxima fecha (se vera en la libreta sanitaria).</p>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">Frecuencia</label>
                        <div className="grid grid-cols-4 gap-2">
                          {PERIODIC_FREQUENCY_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setPPeriodicFrequency(option.value)}
                              className={`rounded-xl border px-2 py-2 text-xs font-semibold ${pPeriodicFrequency === option.value ? 'border-emerald-400 bg-emerald-100 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">Proxima fecha estimada</label>
                        <input type="date" value={pNextPeriodicDate} className={`${inp} bg-slate-50 text-slate-500`} readOnly />
                      </div>
                      <label className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                        <span className="text-sm font-medium text-emerald-800">Activar recordatorio de la proxima dosis</span>
                        <input
                          type="checkbox"
                          checked={pPeriodicRemindersEnabled}
                          onChange={(e) => setPPeriodicRemindersEnabled(e.target.checked)}
                          className="h-4 w-4"
                        />
                      </label>
                    </>
                  )}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Notas para el historial</label>
                    <textarea
                      value={pNotes}
                      onChange={e => setPNotes(e.target.value)}
                      placeholder="Indicaciones del veterinario, observaciones, reacciones, etc."
                      className={`${inp} min-h-20 resize-none`}
                    />
                  </div>
                  {pRecordMode === 'tratamiento' && (
                    <label className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <span className="text-sm font-medium text-emerald-800">Activar recordatorios</span>
                      <input
                        type="checkbox"
                        checked={pRemindersEnabled}
                        onChange={(e) => setPRemindersEnabled(e.target.checked)}
                        className="h-4 w-4"
                      />
                    </label>
                  )}
                </>
              )}
              {isAppointmentPreventive && (
                <>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Motivo del turno *</label>
                    <input
                      value={pAppointmentReason}
                      onChange={e => setPAppointmentReason(e.target.value)}
                      placeholder="Ej: Control anual, consulta por piel, refuerzo"
                      className={inp}
                      required={isAppointmentPreventive}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">Fecha *</label>
                      <input type="date" value={pDate} onChange={e => setPDate(e.target.value)} className={inp} required />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">Horario *</label>
                      <input
                        type="time"
                        value={pAppointmentTime}
                        onChange={e => setPAppointmentTime(e.target.value)}
                        className={inp}
                        required={isAppointmentPreventive}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Lugar *</label>
                    <input
                      value={pAppointmentLocation}
                      onChange={e => setPAppointmentLocation(e.target.value)}
                      placeholder="Ej: Vet San Martin, consultorio 2"
                      className={inp}
                      required={isAppointmentPreventive}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Referencia *</label>
                    <input
                      value={pAppointmentReference}
                      onChange={e => setPAppointmentReference(e.target.value)}
                      placeholder="Ej: Frente a la plaza, llevar estudios previos"
                      className={inp}
                      required={isAppointmentPreventive}
                    />
                  </div>
                  <label className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                    <span className="text-sm font-medium text-emerald-800">Activar notificacion</span>
                    <input
                      type="checkbox"
                      checked={pAppointmentNotifyEnabled}
                      onChange={(e) => setPAppointmentNotifyEnabled(e.target.checked)}
                      className="h-4 w-4"
                    />
                  </label>
                  {pAppointmentNotifyEnabled && (
                    <>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">Antelacion del aviso</label>
                        <select value={pAppointmentLeadTime} onChange={e => setPAppointmentLeadTime(e.target.value)} className={inp}>
                          {APPOINTMENT_LEAD_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">Medios de notificacion</label>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          {NOTIFICATION_CHANNEL_OPTIONS.map((channel) => (
                            <label key={channel} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                              <input
                                type="checkbox"
                                checked={pAppointmentChannels.includes(channel)}
                                onChange={() => toggleAppointmentChannel(channel)}
                                className="h-4 w-4"
                              />
                              <span className="text-sm text-slate-700">{channel}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      {appointmentUsesWhatsapp && (
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-slate-700">Celular para WhatsApp *</label>
                          <div className="grid grid-cols-3 gap-2">
                            <select
                              value={pAppointmentPhoneCountry}
                              onChange={e => setPAppointmentPhoneCountry(e.target.value)}
                              className={`${inp} col-span-1`}
                            >
                              {dialOptions.map((option) => (
                                <option key={option.code} value={option.code}>{option.label}</option>
                              ))}
                            </select>
                            <input
                              value={pAppointmentPhoneLocal}
                              onChange={e => setPAppointmentPhoneLocal(sanitizePhoneLocalInput(e.target.value))}
                              placeholder={getPhoneLocalPlaceholder(pAppointmentPhoneCountry)}
                              className={`${inp} col-span-2`}
                              required={appointmentUsesWhatsapp}
                              inputMode="numeric"
                            />
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{getPhoneInputHint(pAppointmentPhoneCountry)}</p>
                          {pAppointmentPhoneLocal.trim() && (
                            <p className={`mt-1 text-xs ${isAppointmentPhoneValid ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {isAppointmentPhoneValid ? 'Contacto valido para notificaciones.' : 'Numero invalido. Usa codigo de pais, por ejemplo +5491122334455.'}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
            {err && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</p>}
            <button type="submit" className="mt-3 w-full rounded-full bg-emerald-500 py-3 font-bold text-white">Guardar</button>
          </form>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6">
            <div className="mb-4 flex items-center justify-center rounded-2xl bg-rose-50 py-6">
              <Trash2 size={48} className="text-rose-400" />
            </div>
            <h3 className="text-center text-xl font-bold text-slate-900">Eliminar {pet.name}?</h3>
            <p className="mt-2 text-center text-sm text-slate-500">Esta accion no se puede deshacer. Se liberara un cupo para agregar otra mascota.</p>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setDeleteConfirm(false)}
                className="w-full rounded-full border-2 border-slate-200 py-3 font-semibold text-slate-600">Cancelar</button>
              <button type="button" onClick={async () => {
                try {
                  await removePet(pet.id);
                  setDeleteConfirm(false);
                  setView('list');
                } catch (ex) {
                  setMsg(ex instanceof Error ? ex.message : 'No se pudo eliminar la mascota.');
                  setDeleteConfirm(false);
                }
              }}
                className="w-full rounded-full bg-rose-500 py-3 font-bold text-white">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );

  /* ─── COMIDA ─────────────────────────────────────────── */
  if (view === 'comida' && pet) {
    return <PetFoodSection pet={pet} onBack={() => setView('detail')} />;
  }

  /* ─── HISTORIAL ─────────────────────────────────────── */
  if (view === 'historial') return (
    <section className="pb-2">
      <div className="-mx-4 bg-amber-400 px-4 pb-6 pt-3">
        <button type="button" onClick={() => setView('detail')}
          className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-white/80 hover:text-white">
          <ChevronLeft size={18} /> Volver
        </button>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-2xl">📋</span>
          <div className="text-white">
            <h2 className="text-xl font-extrabold">Historial Clinico</h2>
            <p className="text-sm text-white/80">{pet?.name}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <p className="text-sm text-slate-500">{timeline.length} registro{timeline.length !== 1 ? 's' : ''}</p>

        <div className="flex gap-3">
          <button type="button" onClick={doPdf}
            className="flex flex-1 items-center justify-center gap-2 rounded-full border-2 border-emerald-400 py-3 font-semibold text-emerald-700">
            <Download size={16} /> Descargar PDF
          </button>
          <button type="button" onClick={() => setMailModal(true)}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-emerald-500 py-3 font-bold text-white">
            <Mail size={16} /> Enviar
          </button>
        </div>
        {msg && <p className="rounded-2xl bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{msg}</p>}

        {timeline.length === 0 ? (
          <div className="rounded-3xl bg-white px-5 py-10 text-center shadow-sm">
            <p className="text-slate-400">Sin registros clinicos aun.</p>
          </div>
        ) : timeline.map(e => {
          const c = CAT_MAP[e.category];
          return (
            <article key={e.id} className="rounded-3xl bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-xl">{c.emoji}</span>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.bg} ${c.text}`}>{c.label}</span>
                    <span className="text-xs text-slate-400">
                      {new Date(e.eventDate).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <h3 className="mt-1 font-bold text-slate-900">{e.title}</h3>
                  <p className="mt-0.5 text-sm text-slate-600">{e.description}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {mailModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
          <form onSubmit={doMail} className="w-full max-w-sm rounded-3xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Enviar informe por email</h3>
              <button type="button" onClick={() => setMailModal(false)} className="text-slate-400"><X size={20} /></button>
            </div>
            <input type="email" value={mailTo} onChange={e => setMailTo(e.target.value)}
              placeholder="destino@email.com" className={inp} required />
            <div className="mt-4 flex gap-3">
              <button type="button" onClick={() => setMailModal(false)}
                className="w-full rounded-full border-2 border-slate-200 py-3 font-semibold text-slate-600">Cancelar</button>
              <button type="submit" className="w-full rounded-full bg-emerald-500 py-3 font-bold text-white">Enviar</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );

  /* ─── LIBRETA SANITARIA ───────────────────────────────── */
  if (view === 'libreta-sanitaria') return (
    <section className="pb-2">
      <div className="-mx-4 bg-sky-400 px-4 pb-6 pt-3">
        <button type="button" onClick={() => setView('detail')}
          className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-white/80 hover:text-white">
          <ChevronLeft size={18} /> Volver
        </button>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-white"><Syringe size={24} /></span>
          <div className="text-white">
            <h2 className="text-xl font-extrabold">Libreta Sanitaria</h2>
            <p className="text-sm text-white/80">{pet?.name}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <HealthSummaryPanel label="Ultima vacuna" icon={<Syringe size={16} />} accent="sky" summary={lastVaccineSummary} />
          <HealthSummaryPanel label="Ultima desparasitacion" icon={<Pill size={16} />} accent="amber" summary={lastDewormingSummary} />
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={doLibretaPdf}
            className="flex flex-1 items-center justify-center gap-2 rounded-full border-2 border-sky-400 py-3 font-semibold text-sky-700">
            <Download size={16} /> Descargar PDF
          </button>
          <button type="button" onClick={() => setLibretaMailModal(true)}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-sky-500 py-3 font-bold text-white">
            <Mail size={16} /> Enviar
          </button>
        </div>
        {msg && <p className="rounded-2xl bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{msg}</p>}

        <p className="pt-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          Historial sanitario completo ({healthBookletEntries.length} registro{healthBookletEntries.length !== 1 ? 's' : ''}, reciente a antigua)
        </p>

        {healthBookletEntries.length === 0 ? (
          <div className="rounded-3xl bg-white px-5 py-10 text-center shadow-sm">
            <p className="text-slate-400">Sin vacunas ni desparasitaciones registradas aun.</p>
          </div>
        ) : healthBookletEntries.map(e => {
          const c = CAT_MAP[e.category];
          return (
            <article key={e.id} className="rounded-3xl bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-xl">{c.emoji}</span>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.bg} ${c.text}`}>{c.label}</span>
                    <span className="text-xs text-slate-400">{formatFriendlyDate(e.eventDate)}</span>
                  </div>
                  <h3 className="mt-1 font-bold text-slate-900">{e.title}</h3>
                  <p className="mt-0.5 text-sm text-slate-600">{e.description}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {libretaMailModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
          <form onSubmit={doLibretaMail} className="w-full max-w-sm rounded-3xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Enviar libreta por email</h3>
              <button type="button" onClick={() => setLibretaMailModal(false)} className="text-slate-400"><X size={20} /></button>
            </div>
            <input type="email" value={mailTo} onChange={e => setMailTo(e.target.value)}
              placeholder="destino@email.com" className={inp} required />
            <div className="mt-4 flex gap-3">
              <button type="button" onClick={() => setLibretaMailModal(false)}
                className="w-full rounded-full border-2 border-slate-200 py-3 font-semibold text-slate-600">Cancelar</button>
              <button type="submit" className="w-full rounded-full bg-sky-500 py-3 font-bold text-white">Enviar</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );

  /* ─── CONTROL DE MEDICACION ───────────────────────────── */
  if (view === 'control-medicacion') {
    const medicationTreatmentGroups = buildMedicationTreatmentGroups(
      preventiveTasks.filter((t) => t.petId === pet?.id),
    );

    return (
    <section className="pb-2">
      <div className="-mx-4 bg-purple-400 px-4 pb-6 pt-3">
        <button type="button" onClick={() => setView('detail')}
          className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-white/80 hover:text-white">
          <ChevronLeft size={18} /> Volver
        </button>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-white"><Pill size={24} /></span>
          <div className="text-white">
            <h2 className="text-xl font-extrabold">Control de Medicacion</h2>
            <p className="text-sm text-white/80">{pet?.name}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <p className="text-sm text-slate-500">
          {medicationTreatmentGroups.length} registro{medicationTreatmentGroups.length !== 1 ? 's' : ''}
        </p>

        <div className="flex gap-3">
          <button type="button" onClick={doMedicacionPdf}
            className="flex flex-1 items-center justify-center gap-2 rounded-full border-2 border-purple-400 py-3 font-semibold text-purple-700">
            <Download size={16} /> Descargar PDF
          </button>
          <button type="button" onClick={() => setMedicacionMailModal(true)}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-purple-500 py-3 font-bold text-white">
            <Mail size={16} /> Enviar
          </button>
        </div>
        {msg && <p className="rounded-2xl bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{msg}</p>}

        {medicationTreatmentGroups.length === 0 ? (
          <div className="rounded-3xl bg-white px-5 py-10 text-center shadow-sm">
            <p className="text-slate-400">Sin medicacion registrada aun.</p>
          </div>
        ) : medicationTreatmentGroups.map(group => {
          const headerDetail = [
            group.dose && `Dosis: ${group.dose}`,
            group.frequency && `Frecuencia: ${group.frequency}`,
            typeof group.durationDays === 'number' && `Duracion: ${group.durationDays} dia${group.durationDays !== 1 ? 's' : ''}`,
          ].filter(Boolean).join(' | ');
          const rangeLabel = group.startDate
            ? `${new Date(`${group.startDate}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}${
                group.endDate && group.endDate !== group.startDate
                  ? ` - ${new Date(`${group.endDate}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : ''
              }`
            : '';

          return (
            <article key={group.key} className="rounded-3xl bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-xl">{CAT_MAP.medication.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${CAT_MAP.medication.bg} ${CAT_MAP.medication.text}`}>
                      {CAT_MAP.medication.label}
                    </span>
                    {rangeLabel && <span className="text-xs text-slate-400">{rangeLabel}</span>}
                  </div>
                  <h3 className="mt-1 font-bold text-slate-900">{group.title}</h3>
                  {headerDetail && <p className="mt-0.5 text-sm text-slate-600">{headerDetail}</p>}
                  {group.notes && <p className="mt-0.5 text-xs text-slate-500">Notas: {group.notes}</p>}

                  {group.doses.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Dosis a suministrar ({group.doses.filter((d) => d.completed).length}/{group.doses.length} realizadas)
                      </p>
                      <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {group.doses.map((dose) => (
                          <div key={dose.id}
                            className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs ${
                              dose.completed ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-600'
                            }`}>
                            <span>
                              {new Date(`${dose.dueDate}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                              {dose.time ? ` · ${dose.time}` : ''}
                            </span>
                            {dose.completed ? (
                              <span className="whitespace-nowrap font-semibold">
                                ✓ {dose.completedAt
                                  ? new Date(dose.completedAt).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                                  : 'Realizado'}
                              </span>
                            ) : (
                              <span className="whitespace-nowrap font-semibold text-amber-600">Pendiente</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {medicacionMailModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
          <form onSubmit={doMedicacionMail} className="w-full max-w-sm rounded-3xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Enviar control por email</h3>
              <button type="button" onClick={() => setMedicacionMailModal(false)} className="text-slate-400"><X size={20} /></button>
            </div>
            <input type="email" value={mailTo} onChange={e => setMailTo(e.target.value)}
              placeholder="destino@email.com" className={inp} required />
            <div className="mt-4 flex gap-3">
              <button type="button" onClick={() => setMedicacionMailModal(false)}
                className="w-full rounded-full border-2 border-slate-200 py-3 font-semibold text-slate-600">Cancelar</button>
              <button type="submit" className="w-full rounded-full bg-purple-500 py-3 font-bold text-white">Enviar</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
  }

  /* ─── IDENTIFICACION (cartel / chapita / mensajes) ────── */
  if (view === 'identificacion' && pet) {
    const tagStatusLabel: Record<PetTagRequestStatus, string> = {
      requested: 'Solicitada',
      pending_payment: 'Pendiente de pago',
      stl_generated: 'En fabricacion',
      printed: 'Impresa',
      shipped: 'Enviada',
      linked: 'Entregada y vinculada',
      cancelled: 'Cancelada',
    };
    return (
    <section className="space-y-5 pb-2">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setView('detail')} className="text-slate-500"><ChevronLeft size={24} /></button>
        <h2 className="text-xl font-extrabold">Identificacion</h2>
      </div>

      {err && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-600">{err}</p>}
      {msg && <p className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-600">{msg}</p>}

      <div className="rounded-3xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-slate-800">
          <QrCode size={20} className="text-amber-600" />
          <h3 className="font-bold">Cartel con QR</h3>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Descarga un cartel en PDF con la foto de {pet.name}, sus datos y un codigo QR que lleva a su perfil publico.
          Quien lo encuentre podra enviarte un mensaje sin ver tus datos de contacto.
        </p>
        <button type="button" onClick={() => {
          setErr(null);
          setPosterLostDate('');
          setPosterLostPlace('');
          setPosterContactPhone(user?.whatsappPhone ?? '');
          setPosterDistinguishingMarks(pet.distinguishingMarks ?? '');
          setPosterExtraMessage('');
          setPosterModal(true);
        }}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-amber-500 py-3 font-bold text-white disabled:opacity-60">
          <Download size={18} /> Descargar cartel PDF
        </button>
      </div>

      <div className="rounded-3xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-slate-800">
          <Tag size={20} className="text-purple-600" />
          <h3 className="font-bold">Chapita para el collar</h3>
        </div>
        {tagRequest && (
          <p className="mt-2 text-sm text-slate-600">
            Estado de tu solicitud: <span className="font-semibold">{tagStatusLabel[tagRequest.status]}</span>
          </p>
        )}

        <div className="mt-4 border-t border-slate-100 pt-4">
          {linkedTagCode ? (
            <>
              <p className="text-sm text-slate-600">
                Chapita vinculada: <span className="font-mono font-bold text-slate-900">{linkedTagCode}</span>
              </p>
              <button type="button" onClick={doUnlinkTagCode} disabled={tagLinkBusy}
                className="mt-2 w-full rounded-full border-2 border-purple-200 py-2.5 text-sm font-semibold text-purple-600 disabled:opacity-60">
                {tagLinkBusy ? 'Desvinculando…' : 'Desvincular chapita'}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-500">
                ¿Ya tenes una chapita fisica con su propio codigo? Escanea su QR o escribi el codigo para vincularla a {pet.name}.
              </p>
              <button type="button" onClick={startTagScanner} disabled={tagLinkBusy}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border-2 border-purple-200 py-2.5 text-sm font-semibold text-purple-600 disabled:opacity-60">
                <QrCode size={16} /> Escanear QR
              </button>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={tagCodeInput}
                  onChange={(e) => setTagCodeInput(e.target.value.toUpperCase())}
                  placeholder="Ej: A1B2C3D4"
                  className="min-w-0 flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm font-mono uppercase"
                />
                <button type="button" onClick={() => doLinkTagCode()} disabled={tagLinkBusy || !tagCodeInput.trim()}
                  className="shrink-0 rounded-full bg-purple-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                  {tagLinkBusy ? '...' : 'Vincular'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {tagScannerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">Escanear QR de la chapita</h3>
              <button type="button" onClick={stopTagScanner} className="rounded-full p-1 text-slate-500">
                <X size={20} />
              </button>
            </div>
            {tagScannerErr ? (
              <p className="text-sm text-red-600">{tagScannerErr}</p>
            ) : (
              <video ref={tagScannerVideoRef} muted playsInline className="w-full rounded-2xl bg-black" />
            )}
            <p className="mt-3 text-center text-xs text-slate-500">Apunta la camara al codigo QR de la chapita</p>
          </div>
        </div>
      )}

      <div className="rounded-3xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-slate-800">
          <MessageCircle size={20} className="text-emerald-600" />
          <h3 className="font-bold">Mensajes recibidos</h3>
        </div>
        {idLoading && <p className="mt-2 text-sm text-slate-400">Cargando…</p>}
        {!idLoading && sightingMessages.length === 0 && (
          <p className="mt-2 text-sm text-slate-500">Todavia no recibiste mensajes.</p>
        )}
        <div className="mt-3 space-y-3">
          {sightingMessages.map((m) => (
            <div key={m.id} className={`rounded-2xl border p-3 ${m.readAt ? 'border-slate-100 bg-slate-50' : 'border-emerald-200 bg-emerald-50'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${m.source === 'chapita' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>
                  {m.source === 'chapita' ? 'Chapita' : 'Cartel'}
                </span>
                <span className="text-xs text-slate-400">{new Date(m.createdAt).toLocaleString()}</span>
              </div>
              {m.message && <p className="mt-2 text-sm text-slate-700">{m.message}</p>}
              {m.contactInfo && <p className="mt-1 text-xs text-slate-500">Contacto: {m.contactInfo}</p>}
              {m.latitude != null && m.longitude != null && (
                <a
                  href={`https://www.google.com/maps?q=${m.latitude},${m.longitude}`}
                  target="_blank" rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"
                >
                  <MapPin size={14} /> Ver ubicacion en el mapa
                </a>
              )}
              {!m.readAt && (
                <button type="button" onClick={() => doMarkMessageRead(m.id)}
                  className="mt-2 block text-xs font-semibold text-slate-500 underline">
                  Marcar como leido
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {posterModal && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-900/40 p-4">
          <div className="my-6 w-full max-w-sm rounded-3xl bg-white p-6">
            <h3 className="text-lg font-bold text-slate-900">Datos del cartel</h3>
            <p className="mt-1 text-sm text-slate-500">
              Contanos cuando y donde se perdio {pet.name} para incluirlo en el cartel (opcional).
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">Fecha de extravio</label>
                <input type="date" max={new Date().toISOString().split('T')[0]}
                  value={posterLostDate} onChange={e => setPosterLostDate(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-slate-800" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Lugar de extravio</label>
                <input value={posterLostPlace} onChange={e => setPosterLostPlace(e.target.value)}
                  placeholder="Ej: Plaza San Martin, Av. Siempreviva 123..."
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-slate-800" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Telefono de contacto</label>
                <input value={posterContactPhone} onChange={e => setPosterContactPhone(e.target.value)}
                  placeholder="Ej: +54 9 11 5555-5555"
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-slate-800" />
                <p className="mt-1 text-xs text-slate-400">
                  Si lo dejas o lo completas, va a aparecer en el cartel para que te llamen o escriban por WhatsApp. Borralo si preferis que no se muestre.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Señas particulares</label>
                <textarea value={posterDistinguishingMarks} onChange={e => setPosterDistinguishingMarks(e.target.value)}
                  rows={2}
                  placeholder="Ej: mancha blanca en el pecho, collar rojo, cojea de una pata..."
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-slate-800" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Mensaje o dato adicional (opcional)</label>
                <textarea value={posterExtraMessage} onChange={e => setPosterExtraMessage(e.target.value)}
                  rows={2}
                  placeholder="Ej: es muy miedoso, no lo persigas, ofrecele comida..."
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-slate-800" />
              </div>
            </div>
            {err && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</p>}
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setPosterModal(false)}
                className="w-full rounded-full border-2 border-slate-200 py-3 font-semibold text-slate-600">Cancelar</button>
              <button type="button" onClick={doGeneratePoster} disabled={posterBusy}
                className="w-full rounded-full bg-amber-500 py-3 font-bold text-white disabled:opacity-60">
                {posterBusy ? 'Generando…' : 'Generar PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
    );
  }

  /* ─── PREVENTIVOS ───────────────────────────────────── */
  if (view === 'preventivos') {
    const petTasks = preventiveTasks.filter(t => t.petId === pet?.id);
    const pending  = petTasks.filter(t => !t.completed);
    const done     = petTasks.filter(t =>  t.completed);
    return (
      <section className="pb-2">
        <div className="-mx-4 bg-emerald-500 px-4 pb-6 pt-3">
          <button type="button" onClick={() => setView('detail')}
            className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-white/80 hover:text-white">
            <ChevronLeft size={18} /> Volver
          </button>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-2xl">🛡️</span>
              <div className="text-white">
                <h2 className="text-xl font-extrabold">Cuidados</h2>
                <p className="text-sm text-white/80">{pet?.name}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setErr(null); setPrevModal(true); }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-bold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
            >
              <Plus size={15} /> Agregar
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {petTasks.length === 0 && (
            <div className="rounded-3xl bg-white px-5 py-10 text-center shadow-sm">
              <p className="text-slate-400">Sin preventivos registrados aun.</p>
            </div>
          )}
          {pending.map(t => (
            <div key={t.id}
              className="rounded-3xl bg-white p-4 shadow-sm">
              <div className="flex w-full items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-lg">{PREV_MAP[t.category]?.emoji}</span>
              <div className="flex-1 text-left">
                <p className="font-semibold text-slate-900">{t.title}</p>
                <p className="text-xs text-slate-500">{PREV_MAP[t.category]?.label} · {formatPreventiveDateTime(t)}</p>
              </div>
              <Circle size={22} className="shrink-0 text-slate-300" />
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => doTogglePreventive(t.id)}
                  className="w-full rounded-full bg-emerald-500 py-2 text-xs font-bold text-white"
                >
                  Se suministro ahora
                </button>
                <button
                  type="button"
                  onClick={() => doPostponePreventive(t.id)}
                  className="w-full rounded-full border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-700"
                >
                  Posponer
                </button>
              </div>
            </div>
          ))}
          {done.map(t => (
            <button key={t.id} type="button" onClick={() => doTogglePreventive(t.id)}
              className="flex w-full items-center gap-3 rounded-3xl bg-white p-4 opacity-50 shadow-sm">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-lg">{PREV_MAP[t.category]?.emoji}</span>
              <div className="flex-1 text-left">
                <p className="font-semibold line-through text-slate-400">{t.title}</p>
              </div>
              <CheckCircle2 size={22} className="shrink-0 text-emerald-500" />
            </button>
          ))}
        </div>

        {prevModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 md:items-center">
            <form onSubmit={doAddPrev} className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-4 md:rounded-3xl">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-xl">🛡️</span>
                  <div><p className="font-bold text-slate-900">Nuevo Cuidado</p><p className="text-xs text-slate-500">Para {pet?.name}</p></div>
                </div>
                <button type="button" onClick={() => setPrevModal(false)} className="text-slate-400"><X size={20} /></button>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Tipo</label>
                  <select value={pCat} onChange={e => {
                    const next = e.target.value as PreventiveCategory;
                    setPCat(next);
                    if (next !== 'medication' && next !== 'vaccine') setPRecordMode('tratamiento');
                  }} className={inp}>
                    <option value="medication">💊 Medicacion</option>
                    <option value="vaccine">💉 Vacuna</option>
                    <option value="deworming">🪱 Desparasitacion</option>
                    <option value="appointment">🏥 Turno</option>
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
                {isDewormingPreventive && (
                  <>
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                      <p className="text-sm font-semibold text-emerald-800">Sugerencia de proximo tratamiento</p>
                      <p className="mt-1 text-xs text-emerald-700">Elige cada cuántos meses repetir y te calculamos la fecha.</p>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">Repetir dentro de</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[1, 3, 6].map((months) => (
                          <button
                            key={months}
                            type="button"
                            onClick={() => setPDewormingIntervalMonths(months)}
                            className={`rounded-xl border px-3 py-2 text-sm font-semibold ${pDewormingIntervalMonths === months ? 'border-emerald-400 bg-emerald-100 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}
                          >
                            {months} mes{months !== 1 ? 'es' : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">Fecha proxima sugerida</label>
                      <input type="date" value={pNextDewormingDate} onChange={e => setPNextDewormingDate(e.target.value)} className={inp} />
                    </div>
                    <label className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <span className="text-sm font-medium text-emerald-800">Programar proximo desparasitario</span>
                      <input
                        type="checkbox"
                        checked={pAutoScheduleNextDeworming}
                        onChange={(e) => setPAutoScheduleNextDeworming(e.target.checked)}
                        className="h-4 w-4"
                      />
                    </label>
                    <label className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <span className="text-sm font-medium text-emerald-800">Activar recordatorio del proximo</span>
                      <input
                        type="checkbox"
                        checked={pDewormingRemindersEnabled}
                        onChange={(e) => setPDewormingRemindersEnabled(e.target.checked)}
                        className="h-4 w-4"
                      />
                    </label>
                  </>
                )}
                {isDetailedPreventive && (
                  <>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">Dosis *</label>
                      <input value={pDose} onChange={e => setPDose(e.target.value)} placeholder="Ej: 1 comprimido, 2 ml" className={inp} required={isDetailedPreventive} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">Tipo de registro</label>
                      <div className="grid grid-cols-3 gap-2">
                        {RECORD_MODE_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setPRecordMode(option.value)}
                            className={`rounded-xl border px-2 py-2 text-xs font-semibold ${pRecordMode === option.value ? 'border-emerald-400 bg-emerald-100 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {pRecordMode === 'tratamiento' && 'Tratamiento con horarios y duracion definida.'}
                        {pRecordMode === 'ocasional' && 'Se aplica una unica vez, sin recordatorios.'}
                        {pRecordMode === 'periodico' && 'Se repite cada cierto tiempo. Calculamos la proxima fecha para la libreta sanitaria.'}
                      </p>
                    </div>
                    {pRecordMode === 'tratamiento' && (
                      <>
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-slate-700">Frecuencia</label>
                          <select value={pFrequency} onChange={e => setPFrequency(e.target.value)} className={inp}>
                            {FREQUENCY_OPTIONS.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <div className="mb-1.5 flex items-center justify-between">
                            <label className="block text-sm font-medium text-slate-700">Horarios</label>
                            <button type="button" onClick={addScheduleTime} className="text-xs font-semibold text-emerald-600">+ Agregar horario</button>
                          </div>
                          <div className="space-y-2">
                            {pScheduleTimes.map((time, index) => (
                              <div key={`${index}-${time}`} className="flex items-center gap-2">
                                <input
                                  type="time"
                                  value={time}
                                  onChange={(e) => updateScheduleTime(index, e.target.value)}
                                  className={inp}
                                  required
                                />
                                {pScheduleTimes.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeScheduleTime(index)}
                                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"
                                  >
                                    Quitar
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Duracion (dias)</label>
                            <input type="number" min={1} value={pDurationDays} onChange={e => setPDurationDays(e.target.value)} className={inp} placeholder="Ej: 7" required={pCat === 'medication'} />
                          </div>
                          <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Fin del tratamiento (calculado)</label>
                            <input type="date" value={computedMedicationEndDate} className={`${inp} bg-slate-50 text-slate-500`} readOnly />
                          </div>
                        </div>
                      </>
                    )}
                    {pRecordMode === 'periodico' && (
                      <>
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                          <p className="text-sm font-semibold text-emerald-800">Aplicacion periodica</p>
                          <p className="mt-1 text-xs text-emerald-700">Elegi cada cuanto se repite y calculamos la proxima fecha (se vera en la libreta sanitaria).</p>
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-slate-700">Frecuencia</label>
                          <div className="grid grid-cols-4 gap-2">
                            {PERIODIC_FREQUENCY_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => setPPeriodicFrequency(option.value)}
                                className={`rounded-xl border px-2 py-2 text-xs font-semibold ${pPeriodicFrequency === option.value ? 'border-emerald-400 bg-emerald-100 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-slate-700">Proxima fecha estimada</label>
                          <input type="date" value={pNextPeriodicDate} className={`${inp} bg-slate-50 text-slate-500`} readOnly />
                        </div>
                        <label className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                          <span className="text-sm font-medium text-emerald-800">Activar recordatorio de la proxima dosis</span>
                          <input
                            type="checkbox"
                            checked={pPeriodicRemindersEnabled}
                            onChange={(e) => setPPeriodicRemindersEnabled(e.target.checked)}
                            className="h-4 w-4"
                          />
                        </label>
                      </>
                    )}
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">Notas para el historial</label>
                      <textarea
                        value={pNotes}
                        onChange={e => setPNotes(e.target.value)}
                        placeholder="Indicaciones del veterinario, observaciones, reacciones, etc."
                        className={`${inp} min-h-20 resize-none`}
                      />
                    </div>
                    {pRecordMode === 'tratamiento' && (
                      <label className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                        <span className="text-sm font-medium text-emerald-800">Activar recordatorios</span>
                        <input
                          type="checkbox"
                          checked={pRemindersEnabled}
                          onChange={(e) => setPRemindersEnabled(e.target.checked)}
                          className="h-4 w-4"
                        />
                      </label>
                    )}
                  </>
                )}
                {isAppointmentPreventive && (
                  <>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">Motivo del turno *</label>
                      <input
                        value={pAppointmentReason}
                        onChange={e => setPAppointmentReason(e.target.value)}
                        placeholder="Ej: Control anual, consulta por piel, refuerzo"
                        className={inp}
                        required={isAppointmentPreventive}
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">Fecha *</label>
                        <input type="date" value={pDate} onChange={e => setPDate(e.target.value)} className={inp} required />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">Horario *</label>
                        <input
                          type="time"
                          value={pAppointmentTime}
                          onChange={e => setPAppointmentTime(e.target.value)}
                          className={inp}
                          required={isAppointmentPreventive}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">Lugar *</label>
                      <input
                        value={pAppointmentLocation}
                        onChange={e => setPAppointmentLocation(e.target.value)}
                        placeholder="Ej: Vet San Martin, consultorio 2"
                        className={inp}
                        required={isAppointmentPreventive}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">Referencia *</label>
                      <input
                        value={pAppointmentReference}
                        onChange={e => setPAppointmentReference(e.target.value)}
                        placeholder="Ej: Frente a la plaza, llevar estudios previos"
                        className={inp}
                        required={isAppointmentPreventive}
                      />
                    </div>
                    <label className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <span className="text-sm font-medium text-emerald-800">Activar notificacion</span>
                      <input
                        type="checkbox"
                        checked={pAppointmentNotifyEnabled}
                        onChange={(e) => setPAppointmentNotifyEnabled(e.target.checked)}
                        className="h-4 w-4"
                      />
                    </label>
                    {pAppointmentNotifyEnabled && (
                      <>
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-slate-700">Antelacion del aviso</label>
                          <select value={pAppointmentLeadTime} onChange={e => setPAppointmentLeadTime(e.target.value)} className={inp}>
                            {APPOINTMENT_LEAD_OPTIONS.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-slate-700">Medios de notificacion</label>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            {NOTIFICATION_CHANNEL_OPTIONS.map((channel) => (
                              <label key={channel} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={pAppointmentChannels.includes(channel)}
                                  onChange={() => toggleAppointmentChannel(channel)}
                                  className="h-4 w-4"
                                />
                                <span className="text-sm text-slate-700">{channel}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        {appointmentUsesWhatsapp && (
                          <div>
                            <label className="mb-1.5 block text-sm font-medium text-slate-700">Celular para WhatsApp *</label>
                            <div className="grid grid-cols-3 gap-2">
                              <select
                                value={pAppointmentPhoneCountry}
                                onChange={e => setPAppointmentPhoneCountry(e.target.value)}
                                className={`${inp} col-span-1`}
                              >
                                {dialOptions.map((option) => (
                                  <option key={option.code} value={option.code}>{option.label}</option>
                                ))}
                              </select>
                              <input
                                value={pAppointmentPhoneLocal}
                                onChange={e => setPAppointmentPhoneLocal(sanitizePhoneLocalInput(e.target.value))}
                                placeholder={getPhoneLocalPlaceholder(pAppointmentPhoneCountry)}
                                className={`${inp} col-span-2`}
                                required={appointmentUsesWhatsapp}
                                inputMode="numeric"
                              />
                            </div>
                            <p className="mt-1 text-xs text-slate-500">{getPhoneInputHint(pAppointmentPhoneCountry)}</p>
                            {pAppointmentPhoneLocal.trim() && (
                              <p className={`mt-1 text-xs ${isAppointmentPhoneValid ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {isAppointmentPhoneValid ? 'Contacto valido para notificaciones.' : 'Numero invalido. Usa codigo de pais, por ejemplo +5491122334455.'}
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
              {err && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</p>}
              <button type="submit" className="mt-3 w-full rounded-full bg-emerald-500 py-3 font-bold text-white">Guardar</button>
            </form>
          </div>
        )}
      </section>
    );
  }

  return null;
}
