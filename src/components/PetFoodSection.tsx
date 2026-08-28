import { FormEvent, useState } from 'react';
import { ChevronLeft, ExternalLink, MapPinned, Plus, Sparkles } from 'lucide-react';
import { useAppState } from '../context/AppStateContext';
import { usePetFood } from '../hooks/usePetFood';
import { usePets } from '../hooks/usePets';
import type { Pet, PetWeightLog } from '../types';

const PRICE_FORMATTER = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(dateStr: string) {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatKg(valueKg: number) {
  return valueKg < 1 ? `${Math.round(valueKg * 1000)} g/dia` : `${valueKg.toFixed(2)} kg/dia`;
}

function ConsumptionBarChart({ real, theoretical }: { real: number | null; theoretical: number }) {
  const maxVal = Math.max(real ?? 0, theoretical, 0.001);
  const realPct = real != null ? Math.max(4, Math.round((real / maxVal) * 100)) : 0;
  const theoPct = Math.max(4, Math.round((theoretical / maxVal) * 100));

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600">
          <span>Consumo diario real</span>
          <span>{real != null ? formatKg(real) : 'Sin datos aun'}</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${real != null ? realPct : 0}%` }} />
        </div>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600">
          <span>Consumo diario teorico recomendado</span>
          <span>{formatKg(theoretical)}</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${theoPct}%` }} />
        </div>
      </div>
    </div>
  );
}

function WeightLineChart({ logs }: { logs: PetWeightLog[] }) {
  if (logs.length === 0) {
    return <p className="text-sm text-slate-400">Aun no hay registros de peso para graficar.</p>;
  }

  const width = 300;
  const height = 120;
  const paddingX = 8;
  const paddingY = 14;

  const weights = logs.map((log) => log.weightKg);
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);
  const range = maxWeight - minWeight || 1;

  const points = logs.map((log, index) => {
    const x = logs.length === 1
      ? width / 2
      : paddingX + (index / (logs.length - 1)) * (width - paddingX * 2);
    const y = height - paddingY - ((log.weightKg - minWeight) / range) * (height - paddingY * 2);
    return { x, y };
  });

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none">
        <polyline
          points={points.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#10b981"
          strokeWidth={2}
        />
        {points.map((p, index) => (
          <circle key={index} cx={p.x} cy={p.y} r={3} fill="#10b981" />
        ))}
      </svg>
      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
        <span>{formatDateLabel(logs[0].recordedAt)}</span>
        <span>{formatDateLabel(logs[logs.length - 1].recordedAt)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>Min: {minWeight} kg</span>
        <span>Max: {maxWeight} kg</span>
        <span className="font-semibold text-emerald-700">Actual: {weights[weights.length - 1]} kg</span>
      </div>
    </div>
  );
}

export function PetFoodSection({ pet, onBack }: { pet: Pet; onBack: () => void }) {
  const { updatePet } = usePets();
  const { setActiveTab } = useAppState();
  const {
    weightLogs,
    addWeightLog,
    lastPurchase,
    nextPurchaseReminder,
    estimatedNextPurchaseDate,
    realDailyKg,
    theoreticalDailyKg,
    scheduleNextPurchaseReminder,
    weightInsight,
    loadingWeightInsight,
    clearWeightInsight,
  } = usePetFood(pet);

  const [weightInput, setWeightInput] = useState('');
  const [dateInput, setDateInput] = useState(() => toDateStr(new Date()));
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);

  const onSubmitWeight = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatus(null);

    const weightKg = Number(weightInput);
    if (!(weightKg > 0)) {
      setError('Ingresa un peso valido en kg.');
      return;
    }

    try {
      await addWeightLog(weightKg, dateInput);
      await updatePet(pet.id, { weightKg });
      setWeightInput('');
      setStatus('Peso registrado correctamente.');
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo registrar el peso.');
    }
  };

  const onSchedule = async () => {
    if (!estimatedNextPurchaseDate || scheduling) {
      return;
    }

    setScheduling(true);
    setError(null);
    setStatus(null);

    try {
      await scheduleNextPurchaseReminder(estimatedNextPurchaseDate);
      setStatus('Recordatorio agendado en tu Agenda.');
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo agendar el recordatorio.');
    } finally {
      setScheduling(false);
    }
  };

  return (
    <section className="pb-2">
      <div className="-mx-4 bg-orange-500 px-4 pb-6 pt-3">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-white/80 hover:text-white"
        >
          <ChevronLeft size={18} /> Volver
        </button>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-2xl">🍖</span>
          <div className="text-white">
            <h2 className="text-xl font-extrabold">Comida</h2>
            <p className="text-sm text-white/80">{pet.name}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {status && <p className="rounded-2xl bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{status}</p>}
        {error && <p className="rounded-2xl bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</p>}

        <div className="rounded-3xl bg-white p-4 shadow-sm">
          <p className="mb-3 font-bold text-slate-900">Ultima compra</p>
          {lastPurchase ? (
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              <div>
                <p className="text-xs text-slate-400">Marca</p>
                <p className="font-medium text-slate-800">{lastPurchase.foodBrand || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Variedad</p>
                <p className="font-medium text-slate-800">{lastPurchase.foodVariety || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Peso de la bolsa</p>
                <p className="font-medium text-slate-800">{lastPurchase.foodBagWeightKg ? `${lastPurchase.foodBagWeightKg} kg` : '-'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Fecha de compra</p>
                <p className="font-medium text-slate-800">
                  {lastPurchase.foodPurchaseDate ? formatDateLabel(lastPurchase.foodPurchaseDate) : '-'}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              Aun no registraste una compra de alimento. Registra la primera desde la pestaña "Comida" de la Agenda.
            </p>
          )}
        </div>

        <div className="rounded-3xl bg-white p-4 shadow-sm">
          <p className="mb-3 font-bold text-slate-900">Proxima compra</p>
          {nextPurchaseReminder ? (
            <p className="text-sm text-slate-700">
              Programada para <span className="font-semibold text-emerald-700">{formatDateLabel(nextPurchaseReminder.dueDate)}</span>.
              Vas a recibir un aviso en tu Agenda.
            </p>
          ) : estimatedNextPurchaseDate ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-700">
                Segun el consumo estimado, se agotaria alrededor del{' '}
                <span className="font-semibold text-amber-700">{formatDateLabel(estimatedNextPurchaseDate)}</span>.
              </p>
              <button
                type="button"
                onClick={onSchedule}
                disabled={scheduling}
                className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
              >
                <Plus size={16} /> {scheduling ? 'Agendando...' : 'Agendar recordatorio'}
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Registra una compra de alimento para poder estimar la proxima.</p>
          )}
        </div>

        <div className="rounded-3xl bg-white p-4 shadow-sm">
          <p className="mb-1 font-bold text-slate-900">Consumo diario</p>
          <p className="mb-3 text-xs text-slate-400">
            El consumo teorico es una estimacion orientativa segun peso, edad y especie; no reemplaza la indicacion veterinaria.
          </p>
          <ConsumptionBarChart real={realDailyKg} theoretical={theoreticalDailyKg} />
        </div>

        <div className="rounded-3xl bg-white p-4 shadow-sm">
          <p className="mb-3 font-bold text-slate-900">Registro de peso</p>
          <form onSubmit={onSubmitWeight} className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[120px]">
              <label className="mb-1 block text-xs font-medium text-slate-600">Peso actual (kg)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={weightInput}
                onChange={(event) => setWeightInput(event.target.value)}
                placeholder={`${pet.weightKg}`}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="mb-1 block text-xs font-medium text-slate-600">Fecha</label>
              <input
                type="date"
                value={dateInput}
                onChange={(event) => setDateInput(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>
            <button
              type="submit"
              className="rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
            >
              Guardar
            </button>
          </form>

          <div className="mt-4">
            <WeightLineChart logs={weightLogs} />
          </div>
        </div>

        {(loadingWeightInsight || weightInsight) && (
          <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-indigo-100">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                  <Sparkles size={16} />
                </span>
                <p className="font-bold text-slate-900">Analisis de IA sobre el peso</p>
              </div>
              {weightInsight && (
                <button type="button" onClick={clearWeightInsight} className="text-xs font-medium text-slate-400 hover:text-slate-600">
                  Cerrar
                </button>
              )}
            </div>
            {loadingWeightInsight && !weightInsight && (
              <p className="text-sm text-slate-400">Analizando la evolucion de peso...</p>
            )}
            {weightInsight && (
              <>
                <p className="text-sm text-slate-700">{weightInsight.answer}</p>
                {weightInsight.suggestedProduct && (
                  <a
                    href={weightInsight.suggestedProduct.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 flex items-center gap-3 rounded-2xl bg-emerald-50 p-3 shadow-sm ring-1 ring-emerald-100 transition hover:bg-emerald-100"
                  >
                    {weightInsight.suggestedProduct.thumbnail && (
                      <img
                        src={weightInsight.suggestedProduct.thumbnail}
                        alt={weightInsight.suggestedProduct.title}
                        className="h-12 w-12 shrink-0 rounded-xl object-cover bg-white"
                        loading="lazy"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-600">Producto recomendado</p>
                      <p className="truncate text-sm font-semibold text-slate-800">{weightInsight.suggestedProduct.title}</p>
                      {weightInsight.suggestedProduct.price != null && (
                        <p className="text-xs font-bold text-slate-600">{PRICE_FORMATTER.format(weightInsight.suggestedProduct.price)}</p>
                      )}
                    </div>
                    <ExternalLink size={16} className="shrink-0 text-emerald-600" />
                  </a>
                )}
                {weightInsight.recommendVetVisit && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('map')}
                    className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-rose-50 p-3 text-left shadow-sm ring-1 ring-rose-100 transition hover:bg-rose-100"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                      <MapPinned size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-rose-600">Recomendacion</p>
                      <p className="text-sm font-semibold text-slate-800">Conviene que la vea un veterinario</p>
                      <p className="text-xs text-slate-500">Buscar veterinaria cercana en el mapa</p>
                    </div>
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
