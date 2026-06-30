import { FormEvent, useEffect, useRef, useState } from 'react';
import { Send, Stethoscope } from 'lucide-react';
import { useChat } from '../hooks/useChat';
import { useAppState } from '../context/AppStateContext';

const SPECIES_EMOJI: Record<string, string> = { dog: '🐕', cat: '🐈', other: '🐾' };

const SUGGESTIONS = [
  '¿Que vacunas necesita mi mascota?',
  '¿Cuanto ejercicio diario necesita segun su edad?',
  '¿Como mejorar su alimentacion?',
  'Señales de alerta en salud',
];

export function ChatSection() {
  const { pets, selectedPetId, setSelectedPetId, subscription } = useAppState();
  const { messages, canUseAI, hasValidSelectedPet, quota, sendMessage } = useChat();

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isPremium = subscription?.isPremiumUser ?? false;
  const quotaLabel = quota.tier === 'guest'
    ? 'Visitante'
    : quota.tier === 'premium'
      ? 'Premium'
      : 'Free';

  const visible = messages.filter(m => m.role !== 'system');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (pets.length === 0) {
      return;
    }

    const selectedExists = Boolean(selectedPetId && pets.some((pet) => pet.id === selectedPetId));
    if (!selectedExists) {
      setSelectedPetId(pets[0].id);
    }
  }, [pets, selectedPetId, setSelectedPetId]);

  const doSend = async (text: string) => {
    const t = text.trim();
    if (!t || sending || !canUseAI || !selectedPetId) return;
    setInput('');
    setSending(true);
    try { await sendMessage(t, selectedPetId); } finally { setSending(false); }
  };

  const onSubmit = (e: FormEvent) => { e.preventDefault(); doSend(input); };

  return (
    <section className="flex flex-col gap-4 pb-2">
      {/* header */}
      <div className="rounded-3xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Stethoscope size={24} />
          </span>
          <div className="flex-1">
            <p className="font-extrabold text-slate-900">Consultorio IA</p>
            <p className="text-sm text-slate-500">Veterinario virtual</p>
          </div>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
            {quota.remaining}/{quota.limit} restantes ({quotaLabel})
          </span>
          {isPremium && (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Premium</span>
          )}
        </div>
      </div>

      {/* pet selector */}
      {pets.length > 0 && (
        <div className="rounded-3xl bg-white p-4 shadow-sm">
          <p className="mb-2 text-xs font-medium text-slate-400 uppercase tracking-wide">Consultando por</p>
          <div className="flex items-center gap-3">
            <span className="text-2xl">
              {SPECIES_EMOJI[pets.find(p => p.id === selectedPetId)?.species ?? 'other']}
            </span>
            <select
              value={selectedPetId ?? ''}
              onChange={e => setSelectedPetId(e.target.value)}
              className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200">
              {pets.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* chat area */}
      <div className="min-h-64 rounded-3xl bg-emerald-50/60 p-4">
        {visible.length === 0 ? (
          <div className="space-y-3">
            <p className="text-center text-sm text-slate-400">Preguntas frecuentes</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTIONS.map(s => (
                <button key={s} type="button" onClick={() => doSend(s)}
                  className="rounded-2xl bg-white px-3 py-2 text-sm text-slate-700 shadow-sm ring-1 ring-slate-100 transition hover:bg-emerald-50 hover:text-emerald-700">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map(m => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-white text-slate-700 shadow-sm'
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-400 shadow-sm">Escribiendo...</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* paywall message */}
      {hasValidSelectedPet && !canUseAI && (
        <div className="rounded-3xl bg-amber-50 px-4 py-4 text-center">
          <p className="font-semibold text-amber-800">Limite por mascota alcanzado</p>
          <p className="mt-1 text-sm text-amber-600">Selecciona otra mascota o ajusta el plan en Mi Cuenta.</p>
        </div>
      )}

      {!hasValidSelectedPet && pets.length > 0 && (
        <div className="rounded-3xl bg-sky-50 px-4 py-4 text-center">
          <p className="font-semibold text-sky-800">Selecciona una mascota para comenzar</p>
          <p className="mt-1 text-sm text-sky-700">Al recargar, se ajusta automaticamente si no habia seleccion activa.</p>
        </div>
      )}

      {/* input bar */}
      <form onSubmit={onSubmit} className="flex items-center gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={!canUseAI || sending || !hasValidSelectedPet}
          placeholder={
            !hasValidSelectedPet
              ? 'Agrega o selecciona una mascota para comenzar'
              : canUseAI
                ? 'Escribe tu consulta...'
                : 'Limite alcanzado'
          }
          className="flex-1 rounded-full bg-white px-5 py-3.5 text-sm ring-1 ring-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:opacity-50"
        />
        <button type="submit" disabled={!canUseAI || !input.trim() || sending || !hasValidSelectedPet}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow transition disabled:opacity-40">
          <Send size={18} />
        </button>
      </form>
    </section>
  );
}
