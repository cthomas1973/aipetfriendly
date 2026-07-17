import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  BadgeCheck,
  CalendarDays,
  Gift,
  MapPinned,
  MessageCircle,
  PawPrint,
  ShieldCheck,
} from 'lucide-react';
import { loadAdSenseScript } from './AdBanner';

interface LandingSectionProps {
  onEnterApp: () => void;
}

const FEATURES: Array<{ icon: typeof PawPrint; title: string; description: string }> = [
  {
    icon: MessageCircle,
    title: 'Consultorio IA',
    description: 'Resolvé dudas de salud de tu mascota al instante, con orientación y siempre recomendando la consulta veterinaria.',
  },
  {
    icon: CalendarDays,
    title: 'Agenda de cuidados',
    description: 'Vacunas, desparasitaciones y medicación con recordatorios por push, email y WhatsApp.',
  },
  {
    icon: PawPrint,
    title: 'Historial clínico',
    description: 'Toda la información de salud de tu mascota organizada y exportable en PDF.',
  },
  {
    icon: MapPinned,
    title: 'Veterinarias cercanas',
    description: 'Encontrá veterinarias cerca tuyo con un mapa interactivo.',
  },
  {
    icon: Gift,
    title: 'Beneficios y ofertas',
    description: 'Productos y descuentos pensados para el cuidado de tu mascota.',
  },
];

export function LandingSection({ onEnterApp }: LandingSectionProps) {
  useEffect(() => {
    // Carga el script de AdSense solo en web publica (no dentro del WebView
    // nativo de Android) para que el bot de revision de Google pueda
    // detectarlo, aunque el resto de la app este detras de autenticacion.
    if (!Capacitor.isNativePlatform()) {
      void loadAdSenseScript();
    }
  }, []);

  return (
    <section className="space-y-8 pb-6">
      <div className="rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 text-center text-white shadow-md md:p-10">
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
          <PawPrint size={28} />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold leading-tight md:text-4xl">
          Cuidá a tu mascota con inteligencia artificial
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-emerald-50 md:text-base">
          AiPetFriendly te ayuda a organizar la salud de tu mascota: consultas de IA, agenda de
          cuidados, historial clínico y veterinarias cercanas, todo en un solo lugar.
        </p>
        <button
          type="button"
          onClick={onEnterApp}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-emerald-700 shadow transition hover:bg-emerald-50 md:text-base"
        >
          Ingresar / Crear cuenta gratis
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-emerald-100">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <feature.icon size={20} />
            </span>
            <h2 className="mt-3 font-bold text-slate-900">{feature.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{feature.description}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Plan gratis y plan Premium</h2>
            <p className="mt-1 text-sm text-slate-600">
              Empezá gratis con 1 mascota y consultas de IA limitadas por día. Con Premium sumás
              mascotas ilimitadas, consultas sin límite, envío de historial por email y más.
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm text-emerald-700">
          <BadgeCheck size={16} />
          Sin tarjeta de crédito para empezar.
        </div>
      </div>

      <div className="text-center">
        <button
          type="button"
          onClick={onEnterApp}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-bold text-white shadow transition hover:bg-emerald-600"
        >
          Comenzar ahora
        </button>
      </div>
    </section>
  );
}
