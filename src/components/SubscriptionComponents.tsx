import { FormEvent, useEffect, useState } from 'react';
import { Bell, Check, Crown, Lock, Tags, X } from 'lucide-react';
import { useAppState } from '../context/AppStateContext';
import { signUpWithEmail } from '../hooks/useSupabaseSync';
import { readNotificationProfile, writeNotificationProfile } from '../lib/notificationProfile';
import {
  buildE164Phone,
  COUNTRY_DIAL_OPTIONS,
  isValidE164Phone,
  sanitizePhoneLocalInput,
  splitPhoneByCountryCode,
} from '../lib/phoneUtils';

/* ── SubscriptionBanner ─────────────────────────────── */
export function SubscriptionBanner() {
  const { subscription } = useAppState();
  const isPremium = subscription?.isPremiumUser ?? false;

  if (isPremium) {
    return (
      <div className="rounded-2xl bg-emerald-50 px-4 py-3 flex items-center gap-3">
        <Crown size={18} className="text-emerald-500 shrink-0" />
        <p className="text-sm font-semibold text-emerald-800">Plan Premium activo</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-amber-50 px-4 py-3 flex items-center gap-3">
      <Crown size={18} className="text-amber-500 shrink-0" />
      <p className="text-sm font-semibold text-amber-800">Plan gratuito · Actualiza a Premium</p>
    </div>
  );
}

/* ── PaywallCard (Mi Cuenta) ────────────────────────── */
const FEATURES = [
  { label: 'Mascotas ilimitadas',   free: false },
  { label: 'Consultas IA ilimitadas', free: false },
  { label: 'Historial clinico completo', free: true },
  { label: 'Preventivos y agenda',  free: true },
  { label: 'Exportar PDF del historial', free: false },
  { label: 'Beneficios en tiendas', free: false },
];

export function PaywallCard() {
  const {
    subscription,
    user,
    setActiveTab,
    pets,
    clinicalEntries,
    preventiveTasks,
    chatMessages,
  } = useAppState();
  const isPremium = subscription?.isPremiumUser ?? false;
  const isGuest = user?.isGuest ?? false;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [accountTab, setAccountTab] = useState<'plan' | 'data'>('plan');
  const [defaultNotifEmail, setDefaultNotifEmail] = useState(user?.email ?? '');
  const [defaultNotifPhoneCountry, setDefaultNotifPhoneCountry] = useState('+54');
  const [defaultNotifPhoneLocal, setDefaultNotifPhoneLocal] = useState('');
  const [defaultChannels, setDefaultChannels] = useState<string[]>(['Push']);
  const [saveProfileMessage, setSaveProfileMessage] = useState<string | null>(null);

  useEffect(() => {
    const profile = readNotificationProfile(user);
    setDefaultNotifEmail(profile.defaultEmail);
    const parsedPhone = splitPhoneByCountryCode(profile.defaultPhone);
    setDefaultNotifPhoneCountry(parsedPhone.countryCode);
    setDefaultNotifPhoneLocal(parsedPhone.localNumber);
    setDefaultChannels(profile.channels.length > 0 ? profile.channels : ['Push']);
  }, [user]);

  const handleUpgrade = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim() || !password.trim()) {
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      await signUpWithEmail(email.trim().toLowerCase(), password, {
        pets,
        clinicalEntries,
        preventiveTasks,
        chatMessages,
      });

      setSuccess('Tu cuenta fue creada y la información que cargaste quedó guardada.');
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'No se pudo crear la cuenta.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (isGuest) {
    return (
      <section className="space-y-4 pb-2">
        <div className="pt-2">
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Bienvenido, Visitante</h2>
          <p className="mt-1 text-slate-500">Crea una cuenta para sincronizar tus datos y acceder a todas las funciones.</p>
        </div>

        <div className="rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-5 shadow-md">
          <div className="mb-4 flex items-center gap-3">
            <span className="text-4xl">🎉</span>
            <div className="text-white">
              <p className="text-xl font-extrabold">Suscríbete ahora</p>
              <p className="text-sm text-white/80">Guarda tu progreso y accede a todas las funciones</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-white/85">
            Si te suscribís ahora, se guardan los datos que cargaste para no perder la info. Después podés corregirlos si algo quedó mal.
          </p>
        </div>

        <form onSubmit={handleUpgrade} className="rounded-3xl bg-white p-5 shadow-sm space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              minLength={6}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Confirmar contraseña</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repite la contraseña"
              className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              minLength={6}
              required
            />
          </div>

          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
          {success && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-500 py-3.5 font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Crown size={18} className="text-yellow-300" />
            {loading ? 'Creando cuenta...' : 'Crear cuenta ahora'}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pets')}
            className="w-full rounded-full border-2 border-slate-200 py-3 font-semibold text-slate-700"
          >
            Seguir probando la app
          </button>
        </form>

        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="mb-4 font-bold text-slate-900">Con una cuenta accederás a:</p>
          <div className="space-y-2">
            {FEATURES.map(f => (
              <div key={f.label} className={`flex items-center gap-2 text-sm text-slate-700`}>
                <Check size={15} className="shrink-0 text-emerald-500" />
                <span>{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4 pb-2">
      <div className="pt-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Mi Cuenta</h2>
        <p className="mt-1 text-slate-500">Gestiona tu plan y preferencias</p>
      </div>

      <div className="grid grid-cols-2 overflow-hidden rounded-2xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setAccountTab('plan')}
          className={`rounded-xl py-2.5 text-sm font-semibold transition ${accountTab === 'plan' ? 'bg-emerald-500 text-white shadow' : 'text-slate-500'}`}
        >
          Plan
        </button>
        <button
          type="button"
          onClick={() => setAccountTab('data')}
          className={`rounded-xl py-2.5 text-sm font-semibold transition ${accountTab === 'data' ? 'bg-emerald-500 text-white shadow' : 'text-slate-500'}`}
        >
          Mis datos
        </button>
      </div>

      {accountTab === 'plan' ? (
        <>
          {/* plan card */}
          <div className="rounded-3xl bg-emerald-500 p-5 shadow-md">
            <div className="mb-4 flex items-center gap-3">
              <Crown size={28} className="text-yellow-300" />
              <div className="text-white">
                <p className="text-xl font-extrabold">{isPremium ? 'Plan Premium' : 'Plan Gratuito'}</p>
                <p className="text-sm text-white/70">{isPremium ? 'Todas las funciones activas' : 'Funciones basicas'}</p>
              </div>
            </div>
            <div className="space-y-2">
              {FEATURES.map(f => {
                const active = isPremium || f.free;
                return (
                  <div key={f.label} className={`flex items-center gap-2 text-sm ${active ? 'text-white' : 'text-white/40'}`}>
                    {active
                      ? <Check size={15} className="shrink-0" />
                      : <X size={15} className="shrink-0" />
                    }
                    <span>{f.label}</span>
                  </div>
                );
              })}
            </div>
            {!isPremium && (
              <button type="button"
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-white py-3.5 font-bold text-emerald-700">
                <Crown size={18} className="text-yellow-400" />
                Actualizar a Premium
              </button>
            )}
          </div>

          {/* notification preferences */}
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Bell size={18} className="text-emerald-500" />
              <p className="font-bold text-slate-900">Preferencias de notificacion</p>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Notificaciones Push',   sub: 'Alertas en el dispositivo' },
                { label: 'Notificaciones Email',  sub: 'Recordatorios por email' },
                { label: 'Notificaciones WhatsApp', sub: 'Mensajes por WhatsApp' },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                    <p className="text-xs text-slate-400">{item.sub}</p>
                  </div>
                  <div className="h-6 w-11 rounded-full bg-emerald-500" />
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-3xl bg-white p-5 shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-slate-900">Mis datos de notificacion</h3>
            <p className="mt-1 text-sm text-slate-500">Estos valores se usan por defecto al crear una tarea nueva.</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Email predeterminado</label>
            <input
              type="email"
              value={defaultNotifEmail}
              onChange={(e) => setDefaultNotifEmail(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              placeholder="destino@dominio.com"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Celular WhatsApp predeterminado</label>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={defaultNotifPhoneCountry}
                onChange={(e) => setDefaultNotifPhoneCountry(e.target.value)}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                {COUNTRY_DIAL_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>{option.label}</option>
                ))}
              </select>
              <input
                value={defaultNotifPhoneLocal}
                onChange={(e) => setDefaultNotifPhoneLocal(sanitizePhoneLocalInput(e.target.value))}
                className="col-span-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                placeholder="Numero sin 0 ni +"
                inputMode="numeric"
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">Se guarda para usarlo por defecto en nuevas tareas.</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-700">Canales predeterminados para nuevas tareas</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {['Push', 'Email', 'WhatsApp'].map((channel) => {
                const checked = defaultChannels.includes(channel);
                return (
                  <label key={channel} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
                    <span>{channel}</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setDefaultChannels((prev) => Array.from(new Set([...prev, channel])));
                        } else {
                          setDefaultChannels((prev) => prev.filter((item) => item !== channel));
                        }
                      }}
                      className="h-4 w-4"
                    />
                  </label>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              const normalizedPhone = buildE164Phone(defaultNotifPhoneCountry, defaultNotifPhoneLocal);
              if (normalizedPhone && !isValidE164Phone(normalizedPhone)) {
                setSaveProfileMessage('El celular de WhatsApp no es valido. Revisa prefijo y numero.');
                return;
              }

              writeNotificationProfile(user, {
                defaultEmail: defaultNotifEmail,
                defaultPhone: normalizedPhone,
                channels: defaultChannels.length > 0 ? defaultChannels : ['Push'],
              });
              setSaveProfileMessage('Mis datos guardados. Se usaran como predeterminados en nuevas tareas.');
            }}
            className="w-full rounded-full bg-emerald-500 py-3.5 font-bold text-white"
          >
            Guardar mis datos
          </button>

          {saveProfileMessage && (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{saveProfileMessage}</p>
          )}

          <p className="text-xs text-slate-500">
            Puedes editar email/celular al crear una tarea puntual. Ese cambio aplica solo para ese evento y no modifica tus predeterminados.
          </p>
        </div>
      )}
    </section>
  );
}

/* ── OffersSection (Tienda y Beneficios) ────────────── */
const HIGHLIGHTS = [
  { emoji: '🐾', name: 'PetShop Plus',     discount: '-20%', bg: 'bg-emerald-100' },
  { emoji: '🏥', name: 'VetCare Online',   discount: '-15%', bg: 'bg-blue-100'    },
  { emoji: '🍗', name: 'Nutricion Premium',discount: '-10%', bg: 'bg-amber-100'   },
  { emoji: '✂️', name: 'Grooming Pro',     discount: '-25%', bg: 'bg-purple-100'  },
];

const ALL_OFFERS = [
  { emoji: '🐾', name: 'PetShop Plus',      provider: 'Tienda online',   desc: 'Accesorios y juguetes para tu mascota', tag: 'Exclusivo Premium', discount: '-20%' },
  { emoji: '🏥', name: 'VetCare Online',    provider: 'Teleconsulta',    desc: 'Consultas veterinarias online 24/7',    tag: 'Premium',          discount: '-15%' },
  { emoji: '🍗', name: 'Nutricion Premium', provider: 'Balanceados',     desc: 'Alimentos premium para tu mascota',     tag: 'Premium',          discount: '-10%' },
  { emoji: '✂️', name: 'Grooming Pro',      provider: 'Peluqueria',      desc: 'Servicios de estetica canina y felina', tag: 'Premium',          discount: '-25%' },
  { emoji: '💊', name: 'Farmacia Veterinaria', provider: 'Medicamentos', desc: 'Medicamentos y suplementos para mascotas', tag: 'Premium',        discount: '-12%' },
];

export function OffersSection() {
  const { subscription } = useAppState();
  const isPremium = subscription?.isPremiumUser ?? false;

  return (
    <section className="space-y-4 pb-2">
      <div className="pt-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Tienda y Beneficios</h2>
        <p className="mt-1 text-slate-500">Descuentos exclusivos para tu mascota</p>
      </div>

      {/* active/locked banner */}
      {isPremium ? (
        <div className="rounded-3xl bg-emerald-500 p-4 text-white shadow-md">
          <div className="flex items-center gap-2 mb-1">
            <Tags size={18} className="text-yellow-300" />
            <p className="font-bold">Beneficios activos</p>
          </div>
          <p className="text-sm text-white/80">Accede a todos los descuentos exclusivos Premium.</p>
        </div>
      ) : (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white p-4 text-center shadow-sm">
          <Lock size={24} className="mx-auto mb-2 text-slate-300" />
          <p className="font-semibold text-slate-700">Beneficios bloqueados</p>
          <p className="mt-1 text-sm text-slate-400">Actualiza a Premium para acceder a todos los descuentos.</p>
        </div>
      )}

      {/* destacados */}
      <div>
        <p className="mb-3 font-bold text-slate-800">⭐ Destacados</p>
        <div className="grid grid-cols-2 gap-3">
          {HIGHLIGHTS.map(h => (
            <div key={h.name} className={`relative rounded-3xl ${h.bg} p-4 shadow-sm`}>
              {!isPremium && <Lock size={14} className="absolute right-3 top-3 text-slate-400" />}
              <p className="text-3xl">{h.emoji}</p>
              <p className="mt-2 font-bold text-slate-800 text-sm">{h.name}</p>
              <span className="mt-1 inline-block rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold text-emerald-700">{h.discount}</span>
            </div>
          ))}
        </div>
      </div>

      {/* all offers */}
      <div>
        <p className="mb-3 font-bold text-slate-800">Todas las ofertas</p>
        <div className="space-y-3">
          {ALL_OFFERS.map(o => (
            <div key={o.name} className="rounded-3xl bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-2xl">{o.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-slate-900">{o.name}</p>
                      <p className="text-xs text-slate-400">{o.provider}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">{o.discount}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{o.desc}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">{o.tag}</span>
                    <span className="text-xs font-semibold text-emerald-600">Ver detalles &gt;</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
