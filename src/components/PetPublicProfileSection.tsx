import { FormEvent, useEffect, useState } from 'react';
import { MapPin, PawPrint, Send } from 'lucide-react';
import { PublicFooter } from './PublicLegalPages';
import type { PetPublicProfile, PetSightingSource } from '../types';

const SPECIES_LABEL: Record<string, string> = {
  dog: 'Perro',
  cat: 'Gato',
  other: 'Otra especie',
};

async function fetchPetPublicProfile(code: string): Promise<PetPublicProfile> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!supabaseUrl || !anonKey) {
    throw new Error('Configuracion incompleta.');
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/pet-public-contact?code=${encodeURIComponent(code)}`, {
    headers: { Authorization: `Bearer ${anonKey}` },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'No encontramos esa mascota.');
  }
  return payload as PetPublicProfile;
}

async function sendSightingMessage(args: {
  code: string;
  source: PetSightingSource;
  message: string;
  contactInfo: string;
  latitude?: number;
  longitude?: number;
}): Promise<void> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!supabaseUrl || !anonKey) {
    throw new Error('Configuracion incompleta.');
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/pet-public-contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}` },
    body: JSON.stringify(args),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'No se pudo enviar el mensaje.');
  }
}

export function PetPublicProfileSection({ code }: { code: string }) {
  const [profile, setProfile] = useState<PetPublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [message, setMessage] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [shareLocation, setShareLocation] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const source: PetSightingSource = params?.get('src') === 'chapita' ? 'chapita' : 'cartel';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchPetPublicProfile(code)
      .then((data) => { if (!cancelled) setProfile(data); })
      .catch((ex) => { if (!cancelled) setLoadError(ex instanceof Error ? ex.message : 'No encontramos esa mascota.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [code]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim() && !contactInfo.trim()) {
      setSendError('Escribe un mensaje o algun dato de contacto.');
      return;
    }

    setSending(true);
    setSendError(null);

    try {
      let latitude: number | undefined;
      let longitude: number | undefined;

      if (shareLocation && typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
          });
          latitude = position.coords.latitude;
          longitude = position.coords.longitude;
        } catch {
          // El usuario nego el permiso o fallo el GPS: seguimos sin ubicacion.
        }
      }

      await sendSightingMessage({
        code,
        source,
        message: message.trim(),
        contactInfo: contactInfo.trim(),
        latitude,
        longitude,
      });
      setSent(true);
      setMessage('');
      setContactInfo('');
    } catch (ex) {
      setSendError(ex instanceof Error ? ex.message : 'No se pudo enviar el mensaje.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <section className="space-y-6 pb-6">
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-emerald-100">
          <p className="text-slate-500">Buscando mascota...</p>
        </div>
      </section>
    );
  }

  if (loadError || !profile) {
    return (
      <section className="space-y-6 pb-6">
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-rose-100">
          <h1 className="text-xl font-bold text-slate-900">Mascota no encontrada</h1>
          <p className="mt-2 text-sm text-slate-600">{loadError ?? 'Revisa el codigo del cartel o la chapita.'}</p>
        </div>
        <PublicFooter />
      </section>
    );
  }

  return (
    <section className="space-y-6 pb-6">
      <header className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-emerald-100">
        <div className="bg-emerald-500 px-5 py-4 text-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100">
            {source === 'chapita' ? 'Escaneado desde la chapita' : 'Escaneado desde el cartel'}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold">¡Ayudemos a {profile.name} a volver a casa!</h1>
        </div>
        <div className="flex items-center gap-4 p-5">
          {profile.photoUrl
            ? <img src={profile.photoUrl} alt={profile.name} className="h-20 w-20 rounded-2xl object-cover" />
            : <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-400"><PawPrint size={32} /></span>
          }
          <div>
            <p className="text-lg font-bold text-slate-900">{profile.name}</p>
            <p className="text-sm text-slate-500">{SPECIES_LABEL[profile.species] ?? profile.species} · {profile.breed}</p>
          </div>
        </div>
      </header>

      <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-emerald-100">
        {sent ? (
          <div className="rounded-2xl bg-emerald-50 p-5 text-center">
            <p className="font-bold text-emerald-800">¡Gracias! Le avisamos a la familia de {profile.name}.</p>
            <p className="mt-1 text-sm text-emerald-700">Si podes, quedate cerca o llevala a un lugar seguro.</p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <h2 className="font-bold text-slate-900">¿La encontraste? Dejale un mensaje a su familia</h2>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Mensaje</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ej: La encontre cerca de la plaza, esta bien."
                className="min-h-24 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Tu contacto (opcional)</label>
              <input
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
                placeholder="Telefono o email para que te puedan contactar"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5">
              <input type="checkbox" checked={shareLocation} onChange={(e) => setShareLocation(e.target.checked)} className="h-4 w-4" />
              <span className="flex items-center gap-1.5 text-sm text-slate-700"><MapPin size={14} /> Compartir mi ubicacion actual</span>
            </label>
            {sendError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{sendError}</p>}
            <button
              type="submit"
              disabled={sending}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-500 py-3.5 font-bold text-white disabled:opacity-60"
            >
              <Send size={16} /> {sending ? 'Enviando...' : 'Enviar mensaje'}
            </button>
          </form>
        )}
      </article>

      <PublicFooter />
    </section>
  );
}
