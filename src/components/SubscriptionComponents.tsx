import { Bell, Check, Crown, Lock, Tags, X } from 'lucide-react';
import { useAppState } from '../context/AppStateContext';

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
  const { subscription } = useAppState();
  const isPremium = subscription?.isPremiumUser ?? false;

  return (
    <section className="space-y-4 pb-2">
      <div className="pt-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Mi Cuenta</h2>
        <p className="mt-1 text-slate-500">Gestiona tu plan y preferencias</p>
      </div>

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
