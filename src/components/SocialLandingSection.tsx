import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  FileText,
  MapPinned,
  MessageCircle,
} from 'lucide-react';
import { fetchBillingPricingSettings } from '../lib/supabase';
import type { BillingPricingSettings } from '../types';
import { PublicFooter } from './PublicLegalPages';

interface SocialLandingSectionProps {
  onSelectFree: () => void;
  onSelectPremium: () => void;
}

const DEFAULT_PRICING: BillingPricingSettings = {
  premiumMonthlyAutoArs: 9900,
  premiumMonthlyAutoUsd: 9.9,
  premiumAnnualAutoArs: 99900,
  premiumAnnualAutoUsd: 99.9,
  premiumMonthlyManualArs: 9900,
  premiumMonthlyManualUsd: 9.9,
  veterinaryPremiumMonthlyArs: 24900,
  veterinaryPremiumAnnualArs: 239000,
};

const FEATURE_CARDS: Array<{
  icon: typeof CalendarDays;
  title: string;
  description: string;
  image: string;
  alt: string;
}> = [
  {
    icon: FileText,
    title: 'Historial clínico',
    description: 'Toda la salud de tu mascota organizada, sin papeles perdidos, y exportable en PDF.',
    image: '/social/historial_clinico.jpg',
    alt: 'Historial clínico digital de la mascota en la app AiPetFriendly',
  },
  {
    icon: CalendarDays,
    title: 'Agenda y alimento',
    description: 'Vacunas, desparasitaciones y medicación con recordatorios. Avisos antes de que se termine el alimento.',
    image: '/social/alimento.jpg',
    alt: 'Agenda de cuidados y control de alimento en la app AiPetFriendly',
  },
  {
    icon: MessageCircle,
    title: 'Consultas IA y guías',
    description: 'Respuestas según el historial clínico de tu mascota, más guías semanales de cuidados.',
    image: '/social/entrenamiento_IA.jpg',
    alt: 'Consulta con el entrenador virtual de IA de AiPetFriendly',
  },
  {
    icon: MapPinned,
    title: 'Veterinarias y tienda',
    description: 'Encontrá veterinarias cerca tuyo y accedé a productos y ofertas verificadas.',
    image: '/social/veterinaria.jpg',
    alt: 'Mapa de veterinarias cercanas y productos verificados en AiPetFriendly',
  },
];

// Landing pensada para trafico de redes sociales: mismo contenido/valor que
// LandingSection, pero con foco en conversion (planes visibles arriba y llamados
// a la accion mas directos). Vive en la ruta publica /social.
export function SocialLandingSection({ onSelectFree, onSelectPremium }: SocialLandingSectionProps) {
  const [pricing, setPricing] = useState<BillingPricingSettings>(DEFAULT_PRICING);

  useEffect(() => {
    let cancelled = false;

    fetchBillingPricingSettings()
      .then((settings) => {
        if (!cancelled) {
          setPricing(settings);
        }
      })
      .catch(() => {
        // Se mantiene el pricing por defecto si falla la carga.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const arsFormatter = useMemo(
    () => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }),
    [],
  );

  const annualEquivalentMonthlyArs = pricing.premiumAnnualAutoArs / 12;
  const annualSavingArs = Math.max(0, pricing.premiumMonthlyAutoArs * 12 - pricing.premiumAnnualAutoArs);

  return (
    <section className="space-y-10 pb-6">
      {/* HERO */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-6 md:p-10">
        <div className="grid items-center gap-8 md:grid-cols-2">
          <div className="text-center md:text-left">
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-700">
              Suscripción digital inteligente
            </span>
            <h1 className="mt-4 text-3xl font-extrabold leading-tight text-slate-900 md:text-5xl">
              Cuidar a tu mascota ahora es simple, intuitivo y sin papeles perdidos.
            </h1>
            <p className="mt-4 text-sm text-slate-600 md:text-base">
              Gestión médica, recordatorios de alimento y consultas con IA adaptadas al historial de
              tu perro o gato.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row md:justify-start">
              <button
                type="button"
                onClick={onSelectFree}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow transition hover:bg-emerald-700 md:text-base"
              >
                Probar gratis con 1 mascota
              </button>
              <a
                href="#planes"
                className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-emerald-600 px-6 py-3 text-sm font-bold text-emerald-700 transition hover:bg-emerald-50 md:text-base"
              >
                Ver planes y precios
              </a>
            </div>
          </div>
          <img
            src="/social/encabezado.jpg"
            alt="Persona usando la app AiPetFriendly junto a su perro"
            className="w-full rounded-3xl object-cover shadow-lg"
          />
        </div>
      </div>

      {/* FUNCIONALIDADES CLAVE */}
      <div>
        <h2 className="mb-6 text-center text-xl font-bold text-slate-900 md:text-2xl">
          Todo lo que tu mascota necesita en un solo lugar
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {FEATURE_CARDS.map((feature) => (
            <div key={feature.title} className="overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-slate-100">
              <img src={feature.image} alt={feature.alt} className="h-40 w-full object-cover sm:h-48" />
              <div className="p-5">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <feature.icon size={18} />
                  </span>
                  <h3 className="font-bold text-slate-900">{feature.title}</h3>
                </div>
                <p className="mt-2 text-sm text-slate-600">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PLANES */}
      <div id="planes">
        <div className="mb-6 text-center">
          <h2 className="text-xl font-bold text-slate-900 md:text-2xl">Opciones de ingreso</h2>
          <p className="mt-1 text-sm text-slate-500">Planes claros, sin letra chica.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Plan gratis */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Plan Gratis</h3>
              <p className="mt-1 text-sm text-slate-500">Sin compromiso</p>
              <ul className="mt-5 space-y-2.5 text-sm text-slate-600">
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                  Registrá 1 mascota
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                  Agenda básica de vacunas y turnos
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                  Probalo el tiempo que quieras
                </li>
              </ul>
            </div>
            <button
              type="button"
              onClick={onSelectFree}
              className="mt-8 rounded-xl bg-slate-100 py-3 text-center font-semibold text-slate-800 transition hover:bg-slate-200"
            >
              Comenzar gratis
            </button>
          </div>

          {/* Plan premium */}
          <div className="relative flex flex-col justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
            {annualSavingArs > 0 && (
              <span className="absolute -top-3 right-6 rounded-full bg-amber-400 px-3 py-1 text-xs font-extrabold uppercase text-slate-950">
                Ahorrá {arsFormatter.format(annualSavingArs)} al año
              </span>
            )}
            <div>
              <h3 className="text-lg font-bold text-slate-900">Plan Premium</h3>
              <p className="mt-1 text-sm text-emerald-700">Acceso ilimitado</p>
              <ul className="mt-5 space-y-2.5 text-sm text-slate-700">
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                  Mascotas ilimitadas
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                  Consultas de IA ilimitadas
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                  Control de alimento con alertas automáticas
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                  Guías semanales exclusivas
                </li>
              </ul>
              <p className="mt-5 text-sm text-slate-600">
                Plan anual: equivalente a {arsFormatter.format(annualEquivalentMonthlyArs)}/mes
                {annualSavingArs > 0 && ` (ahorrás ${arsFormatter.format(annualSavingArs)} frente al mensual)`}.
              </p>
            </div>
            <button
              type="button"
              onClick={onSelectPremium}
              className="mt-8 rounded-xl bg-emerald-600 py-3 text-center font-bold text-white transition hover:bg-emerald-700"
            >
              Quiero Premium
            </button>
          </div>
        </div>
      </div>

      {/* CIERRE */}
      <div className="rounded-3xl bg-slate-900 p-6 text-center text-white md:p-10">
        <h3 className="text-xl font-bold md:text-2xl">¿Por qué empezar hoy?</h3>
        <p className="mx-auto mt-3 max-w-xl text-sm text-slate-300">
          Podés empezar 100% gratis con tu primera mascota para conocer la plataforma. Si más
          adelante decidís pasar a Premium, el plan anual ya incluye un descuento real frente al
          pago mensual.
        </p>
        <div className="mx-auto mt-7 flex max-w-sm flex-col gap-4">
          <div>
            <button
              type="button"
              onClick={onSelectFree}
              className="w-full rounded-full bg-amber-500 px-6 py-3.5 text-sm font-bold text-white shadow transition hover:bg-amber-600 md:text-base"
            >
              Probar gratis con 1 mascota
            </button>
            <p className="mt-2 text-xs text-slate-400">Sin tarjeta de crédito. Cancelás cuando quieras.</p>
          </div>
          <div>
            <button
              type="button"
              onClick={onSelectPremium}
              className="w-full rounded-full bg-emerald-500 px-6 py-3.5 text-sm font-bold text-white shadow transition hover:bg-emerald-600 md:text-base"
            >
              Quiero Premium
            </button>
            <p className="mt-2 text-xs text-slate-400">Plan anual con descuento real incluido.</p>
          </div>
        </div>
      </div>

      <PublicFooter />
    </section>
  );
}
