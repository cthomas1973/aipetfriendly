import { FormEvent, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { usePreventive } from '../hooks/usePreventive';
import { useAppState } from '../context/AppStateContext';
import type { PreventiveCategory } from '../types';

const PREV_MAP: Record<PreventiveCategory, { label: string; emoji: string }> = {
  vaccine:     { label: 'Vacuna',          emoji: '💉' },
  deworming:   { label: 'Desparasitacion', emoji: '🪱' },
  appointment: { label: 'Turno',           emoji: '🏥' },
  feeding:     { label: 'Alimentacion',    emoji: '🍖' },
  other:       { label: 'Otro',            emoji: '📌' },
};

const inp = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200';

function fmtDate(d: Date) {
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}
function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function AgendaSection() {
  const { pets, selectedPetId } = useAppState();
  const { preventiveTasks, addPreventiveTask, toggleTask } = usePreventive();

  const [tab, setTab] = useState<'meds' | 'food'>('meds');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showForm, setShowForm] = useState(false);

  const [pTitle, setPTitle] = useState('');
  const [pCat,   setPCat]   = useState<PreventiveCategory>('vaccine');
  const [pDate,  setPDate]  = useState(() => toDateStr(new Date()));

  const dateStr = toDateStr(selectedDate);
  const isToday = dateStr === toDateStr(new Date());

  const dayTasks = preventiveTasks.filter(t => {
    if (selectedPetId && t.petId !== selectedPetId) return false;
    return t.dueDate === dateStr;
  });
  const done    = dayTasks.filter(t =>  t.completed);
  const pending = dayTasks.filter(t => !t.completed);
  const progress = dayTasks.length > 0 ? Math.round(done.length / dayTasks.length * 100) : 0;

  const navDay = (delta: number) => {
    setSelectedDate(d => {
      const n = new Date(d);
      n.setDate(n.getDate() + delta);
      return n;
    });
  };

  const doAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!pTitle.trim()) return;
    const petId = selectedPetId ?? pets[0]?.id ?? '';
    addPreventiveTask({ petId, title: pTitle, category: pCat, dueDate: pDate, completed: false });
    setPTitle(''); setPCat('vaccine');
    setShowForm(false);
  };

  const petName = (id: string) => pets.find(p => p.id === id)?.name ?? '';

  return (
    <section className="space-y-4 pb-2">
      <div className="pt-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Agenda y Comida</h2>
        <p className="mt-1 text-slate-500">Control diario de salud y alimentacion</p>
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

      {tab === 'meds' && (
        <>
          {/* date navigator */}
          <div className="flex items-center gap-3 rounded-3xl bg-white p-3 shadow-sm">
            <button type="button" onClick={() => navDay(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100">
              <ChevronLeft size={18} />
            </button>
            <div className="flex-1 text-center">
              <p className={`font-bold ${isToday ? 'text-emerald-600' : 'text-slate-800'}`}>
                {isToday ? 'Hoy' : fmtDate(selectedDate)}
              </p>
              {isToday && <p className="text-xs text-slate-400">{fmtDate(selectedDate)}</p>}
            </div>
            {pending.length > 0 && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">{pending.length} pendiente{pending.length !== 1 ? 's' : ''}</span>
            )}
            <button type="button" onClick={() => navDay(1)}
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100">
              <ChevronRight size={18} />
            </button>
          </div>

          {/* progress */}
          {dayTasks.length > 0 && (
            <div className="rounded-3xl bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-700">Progreso del dia</span>
                <span className="font-bold text-emerald-600">{progress}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* tasks */}
          <div className="space-y-2">
            {dayTasks.length === 0 ? (
              <div className="rounded-3xl bg-white px-5 py-10 text-center shadow-sm">
                <p className="text-3xl">📅</p>
                <p className="mt-2 font-semibold text-slate-700">Sin tareas para este dia</p>
                <p className="mt-1 text-sm text-slate-400">Agrega una nueva medicacion o preventivo</p>
              </div>
            ) : (
              <>
                {pending.map(t => (
                  <button key={t.id} type="button" onClick={() => toggleTask(t.id)}
                    className="flex w-full items-center gap-3 rounded-3xl bg-white p-4 shadow-sm transition active:scale-[0.98]">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-lg shrink-0">{PREV_MAP[t.category]?.emoji}</span>
                    <div className="flex-1 text-left">
                      <p className="font-semibold text-slate-900">{t.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">{petName(t.petId)}</span>
                        <span className="text-xs text-slate-400">{PREV_MAP[t.category]?.label}</span>
                      </div>
                    </div>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 text-lg">✓</span>
                  </button>
                ))}
                {done.map(t => (
                  <button key={t.id} type="button" onClick={() => toggleTask(t.id)}
                    className="flex w-full items-center gap-3 rounded-3xl bg-white p-4 opacity-50 shadow-sm">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-lg shrink-0">{PREV_MAP[t.category]?.emoji}</span>
                    <div className="flex-1 text-left">
                      <p className="font-semibold line-through text-slate-400">{t.title}</p>
                    </div>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-lg">✓</span>
                  </button>
                ))}
              </>
            )}
          </div>

          {/* add CTA */}
          <button type="button" onClick={() => setShowForm(true)}
            className="flex w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-emerald-300 bg-white/80 py-4 font-semibold text-emerald-600">
            <Plus size={18} /> Agregar medicacion
          </button>
        </>
      )}

      {tab === 'food' && (
        <div className="rounded-3xl bg-white px-5 py-12 text-center shadow-sm">
          <p className="text-5xl">🍖</p>
          <h3 className="mt-4 text-xl font-bold text-slate-800">Control de Comida</h3>
          <p className="mt-2 text-slate-500">Registra la alimentacion diaria de tus mascotas</p>
          <p className="mt-3 text-sm text-slate-400">Proximamente</p>
        </div>
      )}

      {/* form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 md:items-center">
          <form onSubmit={doAdd} className="w-full max-w-lg rounded-t-3xl bg-white p-5 md:rounded-3xl">
            <div className="mb-5 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-xl">💊</span>
                <div><p className="font-bold text-slate-900">Nueva Medicacion</p></div>
              </div>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Tipo</label>
                <select value={pCat} onChange={e => setPCat(e.target.value as PreventiveCategory)} className={inp}>
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
            </div>
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
