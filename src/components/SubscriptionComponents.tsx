import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Check, Crown, ExternalLink, LocateFixed, Lock, Tags, Truck, X } from 'lucide-react';
import { useAppState } from '../context/AppStateContext';
import { signUpWithEmail } from '../hooks/useSupabaseSync';
import { readNotificationProfile, writeNotificationProfile } from '../lib/notificationProfile';
import { updateUserNotificationProfile } from '../lib/supabase';
import {
  createMercadoPagoOneTimeMonthlyPayment,
  createMercadoPagoRecurringSubscription,
} from '../lib/supabase';
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
  const [defaultNotifPhoneCountry, setDefaultNotifPhoneCountry] = useState(detectDefaultCountryDialCode());
  const [defaultNotifPhoneLocal, setDefaultNotifPhoneLocal] = useState('');
  const [defaultChannels, setDefaultChannels] = useState<string[]>(['Push']);
  const [whatsAppConsent, setWhatsAppConsent] = useState(false);
  const [saveProfileMessage, setSaveProfileMessage] = useState<string | null>(null);
  const [checkoutLoadingMode, setCheckoutLoadingMode] = useState<'monthly' | 'annual' | 'monthly_manual' | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const detectedDialCode = useMemo(() => detectDefaultCountryDialCode(), []);
  const dialOptions = useMemo(() => buildCountryOptionsForPicker(detectedDialCode), [detectedDialCode]);

  useEffect(() => {
    const profile = readNotificationProfile(user);
    setDefaultNotifEmail(profile.defaultEmail);
    const parsedPhone = profile.defaultPhone
      ? splitPhoneByCountryCode(profile.defaultPhone)
      : { countryCode: detectDefaultCountryDialCode(), localNumber: '' };
    setDefaultNotifPhoneCountry(parsedPhone.countryCode);
    setDefaultNotifPhoneLocal(parsedPhone.localNumber);
    setDefaultChannels(profile.channels.length > 0 ? profile.channels : ['Push']);
    setWhatsAppConsent(Boolean(user?.whatsappOptIn));
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

  const startRecurringCheckout = async (planCode: 'monthly' | 'annual') => {
    try {
      setCheckoutError(null);
      setCheckoutLoadingMode(planCode);
      const checkout = await createMercadoPagoRecurringSubscription(planCode);
      window.location.href = checkout.initPoint;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo iniciar la suscripcion automatica.';
      setCheckoutError(message);
      setCheckoutLoadingMode(null);
    }
  };

  const startOneTimeMonthlyCheckout = async () => {
    try {
      setCheckoutError(null);
      setCheckoutLoadingMode('monthly_manual');
      const checkout = await createMercadoPagoOneTimeMonthlyPayment();
      window.location.href = checkout.initPoint;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo iniciar el pago mensual.';
      setCheckoutError(message);
      setCheckoutLoadingMode(null);
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
              <div className="mt-5 space-y-2">
                <button
                  type="button"
                  disabled={checkoutLoadingMode !== null}
                  onClick={() => {
                    void startRecurringCheckout('monthly');
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-3.5 font-bold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <Crown size={18} className="text-yellow-400" />
                  {checkoutLoadingMode === 'monthly' ? 'Redirigiendo...' : 'Premium mensual (debito automatico)'}
                </button>

                <button
                  type="button"
                  disabled={checkoutLoadingMode !== null}
                  onClick={() => {
                    void startRecurringCheckout('annual');
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-white/80 py-3.5 font-bold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {checkoutLoadingMode === 'annual' ? 'Redirigiendo...' : 'Premium anual (debito automatico)'}
                </button>

                <button
                  type="button"
                  disabled={checkoutLoadingMode !== null}
                  onClick={() => {
                    void startOneTimeMonthlyCheckout();
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-white/80 py-3.5 font-semibold text-white/95 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {checkoutLoadingMode === 'monthly_manual' ? 'Redirigiendo...' : 'Pago mensual manual (debito o credito)'}
                </button>

                <p className="px-2 text-xs text-white/85">
                  El plan automatico renueva cada periodo. El pago mensual manual requiere renovacion cada mes.
                </p>

                {checkoutError && (
                  <p className="rounded-xl bg-rose-100 px-3 py-2 text-sm font-medium text-rose-700">{checkoutError}</p>
                )}
              </div>
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
                {dialOptions.map((option) => (
                  <option key={option.code} value={option.code}>{option.label}</option>
                ))}
              </select>
              <input
                value={defaultNotifPhoneLocal}
                onChange={(e) => setDefaultNotifPhoneLocal(sanitizePhoneLocalInput(e.target.value))}
                className="col-span-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                placeholder={getPhoneLocalPlaceholder(defaultNotifPhoneCountry)}
                inputMode="numeric"
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">{getPhoneInputHint(defaultNotifPhoneCountry)}</p>
            <p className="mt-1 text-xs text-slate-500">Se guarda para usarlo por defecto en nuevas tareas.</p>
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3">
            <input
              type="checkbox"
              checked={whatsAppConsent}
              onChange={(e) => setWhatsAppConsent(e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span className="text-sm text-emerald-900">
              Acepto recibir recordatorios y avisos de AiPetFriendly por WhatsApp en el numero informado.
            </span>
          </label>

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
            onClick={async () => {
              const normalizedPhone = buildE164Phone(defaultNotifPhoneCountry, defaultNotifPhoneLocal);
              if (normalizedPhone && !isValidE164Phone(normalizedPhone)) {
                setSaveProfileMessage('El celular de WhatsApp no es valido. Revisa prefijo y numero.');
                return;
              }

              if (whatsAppConsent && !normalizedPhone) {
                setSaveProfileMessage('Para activar WhatsApp debes informar un numero valido.');
                return;
              }

              try {
                writeNotificationProfile(user, {
                  defaultEmail: defaultNotifEmail,
                  defaultPhone: normalizedPhone,
                  channels: defaultChannels.length > 0 ? defaultChannels : ['Push'],
                });

                if (user && !user.isGuest) {
                  await updateUserNotificationProfile({
                    userId: user.id,
                    whatsappPhone: normalizedPhone || null,
                    whatsappOptIn: whatsAppConsent,
                    whatsappOptInSource: 'mi_cuenta',
                  });
                }

                setSaveProfileMessage('Mis datos guardados. Se usaran como predeterminados en nuevas tareas.');
              } catch (error) {
                setSaveProfileMessage(error instanceof Error ? error.message : 'No se pudieron guardar los datos de WhatsApp.');
              }
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
type OfferGroup = 'alimentos' | 'accesorios' | 'higiene' | 'descanso';
type OfferSort = 'relevance' | 'price_asc' | 'price_desc';

interface AffiliateProduct {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  discount: number;
  thumbnail: string;
  link: string;
  free_shipping: boolean;
  fast_delivery: boolean;
  state: string;
}

const OFFER_GROUPS: Array<{ id: OfferGroup; label: string; emoji: string }> = [
  { id: 'alimentos', label: 'Alimentos', emoji: '🍗' },
  { id: 'accesorios', label: 'Accesorios y Paseo', emoji: '🦮' },
  { id: 'higiene', label: 'Estetica e Higiene', emoji: '🧴' },
  { id: 'descanso', label: 'Descanso y Juguetes', emoji: '🧸' },
];

const PRICE_FORMATTER = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

export function OffersSection() {
  const { subscription } = useAppState();
  const isPremium = subscription?.isPremiumUser ?? false;
  const [group, setGroup] = useState<OfferGroup>('alimentos');
  const [sort, setSort] = useState<OfferSort>('relevance');
  const [freeShipping, setFreeShipping] = useState(false);
  const [fastDelivery, setFastDelivery] = useState(false);
  const [products, setProducts] = useState<AffiliateProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [errorProducts, setErrorProducts] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    setErrorProducts(null);

    try {
      const params = new URLSearchParams();
      params.set('grupo', group);
      if (sort !== 'relevance') {
        params.set('sort', sort);
      }
      if (freeShipping) {
        params.set('shipping', 'true');
      }
      if (fastDelivery) {
        params.set('delivery', 'true');
      }
      if (location) {
        params.set('lat', String(location.lat));
        params.set('lon', String(location.lon));
      }

      const response = await fetch(`/api/beneficios?${params.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'No se pudieron cargar los productos de Mercado Libre.');
      }

      const data = await response.json();
      setProducts(Array.isArray(data?.products) ? data.products : []);
    } catch (error) {
      setProducts([]);
      setErrorProducts(error instanceof Error ? error.message : 'No se pudieron cargar productos en este momento.');
    } finally {
      setLoadingProducts(false);
    }
  }, [fastDelivery, freeShipping, group, location, sort]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setErrorProducts('Tu navegador no soporta geolocalizacion para filtrar por zona.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      () => {
        setErrorProducts('No se pudo acceder a tu ubicacion. Puedes seguir usando filtros sin GPS.');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    );
  };

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

      <div className="rounded-3xl bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-slate-800">Grupo de productos</p>
          <button
            type="button"
            onClick={requestLocation}
            className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
          >
            <LocateFixed size={13} />
            {location ? 'GPS activo' : 'Usar GPS'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {OFFER_GROUPS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setGroup(item.id)}
              className={`rounded-2xl px-3 py-2 text-left text-sm font-semibold ${
                group === item.id
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              <span className="mr-2">{item.emoji}</span>
              {item.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as OfferSort)}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="relevance">Relevancia</option>
            <option value="price_asc">Menor precio</option>
            <option value="price_desc">Mayor precio</option>
          </select>

          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            <input type="checkbox" checked={freeShipping} onChange={(e) => setFreeShipping(e.target.checked)} className="h-4 w-4" />
            Envio gratis
          </label>

          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            <input type="checkbox" checked={fastDelivery} onChange={(e) => setFastDelivery(e.target.checked)} className="h-4 w-4" />
            <Truck size={15} />
            Envio rapido
          </label>
        </div>
      </div>

      <div>
        <p className="mb-3 font-bold text-slate-800">Productos recomendados</p>
        {errorProducts && (
          <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorProducts}</p>
        )}

        {loadingProducts ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-3xl bg-slate-100" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-3xl bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">No hay productos para este filtro por ahora. Prueba con otro grupo o desactiva filtros.</p>
          </div>
        ) : (
        <div className="space-y-3">
          {products.map((item) => (
            <a
              key={item.id}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-3xl bg-white p-4 shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              aria-label={`Ver ${item.title} en Mercado Libre`}
            >
              <div className="flex items-start gap-3">
                <div className="shrink-0">
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="h-16 w-16 rounded-2xl object-cover bg-slate-100"
                    loading="lazy"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-slate-900 line-clamp-2 hover:text-emerald-600">
                        {item.title}
                      </p>
                      <p className="text-xs text-slate-400">{item.state || 'Mercado Libre Argentina'}</p>
                    </div>
                    {item.discount > 0 && (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">-{item.discount}%</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-extrabold text-slate-900">{PRICE_FORMATTER.format(item.price)}</span>
                    {item.original_price ? (
                      <span className="text-xs text-slate-400 line-through">{PRICE_FORMATTER.format(item.original_price)}</span>
                    ) : null}
                    {item.free_shipping ? (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">Envio gratis</span>
                    ) : null}
                    {item.fast_delivery ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Rapido</span>
                    ) : null}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Afiliado AiPetFriendly</span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                      Ver producto
                      <ExternalLink size={13} />
                    </span>
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>
        )}
      </div>
    </section>
  );
}
