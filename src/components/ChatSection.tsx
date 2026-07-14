import { FormEvent, useEffect, useRef, useState } from 'react';
import { ExternalLink, Send, Stethoscope } from 'lucide-react';
import { useChat } from '../hooks/useChat';
import { useAppState } from '../context/AppStateContext';
import { isNativeAndroidApp, showInterstitialForNonPremium } from '../lib/mobileAds';

const PRICE_FORMATTER = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

const SPECIES_EMOJI: Record<string, string> = { dog: '🐕', cat: '🐈', other: '🐾' };

const SUGGESTIONS = [
  '¿Que vacunas necesita mi mascota?',
  '¿Cuanto ejercicio diario necesita segun su edad?',
  '¿Como mejorar su alimentacion?',
  'Señales de alerta en salud',
];

export function ChatSection() {
  const { pets, selectedPetId, setSelectedPetId, subscription, setActiveTab } = useAppState();
  const { messages, historyMessages, canUseAI, hasValidSelectedPet, quota, sendMessage, suggestedProductByMessageId } = useChat();

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [view, setView] = useState<'new' | 'history'>('new');
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
    try {
      if (!isPremium && isNativeAndroidApp()) {
        void showInterstitialForNonPremium();
      }
      await sendMessage(t, selectedPetId);
    } finally {
      setSending(false);
    }
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
        <div className="mb-4 flex rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-100">
          <button
            type="button"
            onClick={() => setView('new')}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
              view === 'new'
                ? 'bg-emerald-500 text-white'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Nueva consulta
          </button>
          <button
            type="button"
            onClick={() => setView('history')}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
              view === 'history'
                ? 'bg-emerald-500 text-white'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Historial mascota
          </button>
        </div>

        {view === 'new' ? (
          visible.length === 0 ? (
            <div className="space-y-3">
              <p className="text-center text-sm text-slate-400">Chat limpio para nueva consulta</p>
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
                  <div className="max-w-[85%] space-y-2">
                    <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-white text-slate-700 shadow-sm'
                    }`}>
                      {m.content}
                    </div>
                    {m.role === 'assistant' && suggestedProductByMessageId[m.id] && (
                      <a
                        href={suggestedProductByMessageId[m.id].link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-3 shadow-sm ring-1 ring-emerald-100 transition hover:bg-emerald-100"
                      >
                        {suggestedProductByMessageId[m.id].thumbnail && (
                          <img
                            src={suggestedProductByMessageId[m.id].thumbnail ?? ''}
                            alt={suggestedProductByMessageId[m.id].title}
                            className="h-12 w-12 shrink-0 rounded-xl object-cover bg-white"
                            loading="lazy"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-600">Producto recomendado</p>
                          <p className="truncate text-sm font-semibold text-slate-800">{suggestedProductByMessageId[m.id].title}</p>
                          {suggestedProductByMessageId[m.id].price != null && (
                            <p className="text-xs font-bold text-slate-600">{PRICE_FORMATTER.format(suggestedProductByMessageId[m.id].price as number)}</p>
                          )}
                        </div>
                        <ExternalLink size={16} className="shrink-0 text-emerald-600" />
                      </a>
                    )}
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
          )
        ) : (
          historyMessages.length === 0 ? (
            <div className="rounded-2xl bg-white/80 p-5 text-center text-sm text-slate-500 shadow-sm">
              No hay historial guardado para esta mascota.
            </div>
          ) : (
            <div className="space-y-3">
              {historyMessages.map((m) => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-sky-500 text-white'
                      : 'bg-white text-slate-700 shadow-sm'
                  }`}>
                    <p>{m.content}</p>
                    <p className={`mt-1 text-[11px] ${m.role === 'user' ? 'text-sky-100' : 'text-slate-400'}`}>
                      {new Date(m.createdAt).toLocaleString('es-AR')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* paywall message */}
      {hasValidSelectedPet && !canUseAI && (
        <div className="rounded-3xl bg-amber-50 px-4 py-4 text-center">
          <p className="font-semibold text-amber-800">Limite por mascota alcanzado</p>
          <p className="mt-1 text-sm text-amber-600">Selecciona otra mascota o ajusta el plan en Mi Cuenta.</p>
          <button
            type="button"
            onClick={() => setActiveTab('subscription')}
            className="mt-3 rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold text-white"
          >
            Ver planes Premium
          </button>
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
          disabled={view !== 'new' || !canUseAI || sending || !hasValidSelectedPet}
          placeholder={
            !hasValidSelectedPet
              ? 'Agrega o selecciona una mascota para comenzar'
              : view !== 'new'
                ? 'Cambia a "Nueva consulta" para escribir'
                : canUseAI
                ? 'Escribe tu consulta...'
                : 'Limite alcanzado'
          }
          className="flex-1 rounded-full bg-white px-5 py-3.5 text-sm ring-1 ring-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:opacity-50"
        />
        <button type="submit" disabled={view !== 'new' || !canUseAI || !input.trim() || sending || !hasValidSelectedPet}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow transition disabled:opacity-40">
          <Send size={18} />
        </button>
      </form>
    </section>
  );
}
