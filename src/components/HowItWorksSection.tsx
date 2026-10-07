import { useEffect } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  FileText,
  MapPinned,
  MessageCircle,
  Palmtree,
  PawPrint,
  Pill,
  QrCode,
  Search,
  ShieldCheck,
  Smartphone,
  Utensils,
} from 'lucide-react';
import { BlogTeaser } from './BlogTeaser';
import { PetGuidesTeaser } from './PetGuidesTeaser';
import { PublicFooter } from './PublicLegalPages';

interface HowItWorksSectionProps {
  onRegister: () => void;
}

// Mismo patron que BlogSection.tsx/PetGuidesSection.tsx/PublicLegalPages.tsx:
// cada pagina publica actualiza su propio title/description para que buscadores
// y el crawler de AdSense vean contenido distinto por URL.
function setPageMeta(title: string, description: string) {
  document.title = title;
  const metaDescription = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (metaDescription) {
    metaDescription.setAttribute('content', description);
  }
}

const HOW_IT_WORKS_STEPS: Array<{
  icon: typeof PawPrint;
  title: string;
  description: string;
}> = [
  {
    icon: PawPrint,
    title: 'Registrá a tu mascota',
    description: 'Cargá sus datos básicos y comenzá a construir su perfil.',
  },
  {
    icon: FileText,
    title: 'Organizá sus cuidados',
    description: 'Registrá vacunas, desparasitación, medicación, alimentación, peso y otros cuidados.',
  },
  {
    icon: Search,
    title: 'Consultá y encontrá información',
    description: 'Accedé a su historial, recordatorios, veterinarias, lugares Pet Friendly y recursos.',
  },
  {
    icon: Smartphone,
    title: 'Tené todo disponible cuando lo necesitás',
    description: 'La información queda organizada para que puedas consultarla desde cualquier dispositivo.',
  },
];

const TOOLS: Array<{
  icon: typeof PawPrint;
  title: string;
  description: string;
}> = [
  {
    icon: PawPrint,
    title: 'Perfil de tu mascota',
    description: 'Cargá los datos básicos de tu mascota (nombre, especie, raza) para empezar a organizar su cuidado.',
  },
  {
    icon: CalendarDays,
    title: 'Agenda y recordatorios',
    description: 'Registrá vacunas, desparasitaciones, medicación y turnos, con recordatorios por push, email y WhatsApp.',
  },
  {
    icon: FileText,
    title: 'Historial clínico',
    description: 'Guardá el historial de salud de tu mascota en un solo lugar y exportalo en PDF cuando lo necesites.',
  },
  {
    icon: Utensils,
    title: 'Alimentación y peso',
    description: 'Llevá un registro del alimento y el peso de tu mascota a lo largo del tiempo.',
  },
  {
    icon: Pill,
    title: 'Medicación',
    description: 'Registrá las medicaciones indicadas y llevá un control de las dosis aplicadas.',
  },
  {
    icon: QrCode,
    title: 'Identificación y QR',
    description: 'Generá una identificación con código QR para tu mascota, para que puedan contactarte si se pierde.',
  },
  {
    icon: AlertTriangle,
    title: 'Mascota perdida',
    description: 'Quien encuentre a tu mascota puede escanear su QR y enviarte un mensaje de contacto.',
  },
  {
    icon: MessageCircle,
    title: 'Consultorio IA',
    description: 'Consultá dudas sobre el cuidado de tu mascota con un asistente que usa como contexto su información registrada.',
  },
  {
    icon: MapPinned,
    title: 'Veterinarias cercanas',
    description: 'Encontrá veterinarias cerca tuyo con un mapa interactivo.',
  },
  {
    icon: Palmtree,
    title: 'Lugares Pet Friendly',
    description: 'Descubrí lugares pet friendly para ir con tu mascota.',
  },
];

export function HowItWorksSection({ onRegister }: HowItWorksSectionProps) {
  useEffect(() => {
    setPageMeta(
      'AiPetFriendly | Cómo funciona',
      'Conocé cómo funciona AiPetFriendly y cómo podés organizar la salud, los cuidados, la alimentación, la identificación y la vida cotidiana de tu mascota desde un solo lugar.',
    );
  }, []);

  return (
    <section className="space-y-8 pb-6">
      {/* HERO */}
      <div className="rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 text-center text-white shadow-md md:p-10">
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
          <PawPrint size={28} />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold leading-tight md:text-4xl">
          Así funciona AiPetFriendly
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-emerald-50 md:text-base">
          Una forma simple de organizar el cuidado, la salud y la protección de tu mascota desde un
          solo lugar.
        </p>
        <div className="mt-6 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          <button
            type="button"
            onClick={onRegister}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-emerald-700 shadow transition hover:bg-emerald-50 md:text-base"
          >
            Crear cuenta gratis
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-white px-6 py-3 text-sm font-bold text-white shadow transition hover:bg-white/10 md:text-base"
          >
            <ChevronLeft size={16} /> Volver al inicio
          </a>
        </div>
      </div>

      {/* QUE ES AIPETFRIENDLY */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <h2 className="font-bold text-slate-900">¿Qué es AiPetFriendly?</h2>
        <p className="mt-2 text-sm text-slate-600">
          AiPetFriendly es una plataforma digital pensada para ayudarte a organizar el cuidado de tu
          mascota. No es solamente una herramienta de inteligencia artificial: reúne en un mismo
          lugar la información y las herramientas que normalmente quedan repartidas entre papeles,
          mensajes y distintas aplicaciones.
        </p>
        <ul className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
          {[
            'Información de la mascota',
            'Cuidados, vacunas y desparasitación',
            'Medicación',
            'Agenda',
            'Historial clínico',
            'Alimentación y peso',
            'Identificación',
            'Herramientas para mascotas perdidas',
            'Búsqueda de veterinarias',
            'Lugares Pet Friendly',
            'Asistencia mediante IA',
            'Recursos y contenidos',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* QUE PROBLEMA RESUELVE */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <h2 className="font-bold text-slate-900">¿Qué problema resuelve?</h2>
        <p className="mt-2 text-sm text-slate-600">
          Cuando la información de una mascota queda repartida entre papeles, mensajes y recuerdos,
          es fácil que aparezcan problemas concretos en el día a día:
        </p>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          {[
            'Información de la mascota repartida en distintos lugares',
            'Olvidos de vacunas o desparasitación',
            'Dificultad para recordar medicaciones',
            'Pérdida de información sobre consultas o tratamientos',
            'Dificultad para tener organizada la información cuando cambia el veterinario',
            'Necesidad de encontrar rápidamente servicios o lugares Pet Friendly',
            'Necesidad de contar con información y orientación general para el cuidado',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-slate-600">
          AiPetFriendly busca centralizar esa información y facilitar la organización cotidiana del
          cuidado de tu mascota.
        </p>
      </div>

      {/* COMO FUNCIONA */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <h2 className="font-bold text-slate-900">¿Cómo funciona?</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS_STEPS.map((step, index) => (
            <div key={step.title} className="rounded-2xl bg-emerald-50/60 p-4 ring-1 ring-emerald-100">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <step.icon size={18} />
              </span>
              <h3 className="mt-3 text-sm font-bold text-slate-900">
                {index + 1}. {step.title}
              </h3>
              <p className="mt-1 text-xs text-slate-600">{step.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* PRINCIPALES HERRAMIENTAS */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <h2 className="font-bold text-slate-900">Principales herramientas</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool) => (
            <div key={tool.title} className="rounded-2xl bg-emerald-50/60 p-4 ring-1 ring-emerald-100">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <tool.icon size={18} />
              </span>
              <h3 className="mt-3 text-sm font-bold text-slate-900">{tool.title}</h3>
              <p className="mt-1 text-xs text-slate-600">{tool.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CONSULTORIO IA */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <MessageCircle size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Orientación para el cuidado de tu mascota</h2>
            <p className="mt-1 text-sm text-slate-600">
              El asistente del Consultorio IA puede ayudarte a comprender información relacionada
              con el cuidado de tu mascota, utilizando el contexto disponible de su perfil.
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-700">
              La información proporcionada por el asistente es orientativa y no constituye un
              diagnóstico ni reemplaza la consulta con un veterinario.
            </p>
          </div>
        </div>
      </div>

      {/* GRATIS Y PREMIUM */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Plan gratis y plan Premium</h2>
            <p className="mt-1 text-sm text-slate-600">
              Empezá gratis con 1 mascota y consultas de IA limitadas por día. Con Premium sumás
              mascotas ilimitadas, consultas sin límite, exportación del historial en PDF y más.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-900">Plan Gratis</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {[
                '1 mascota',
                'Historial clínico completo',
                'Preventivos y agenda',
                'Consultas de IA limitadas por día',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <h3 className="text-sm font-bold text-slate-900">Plan Premium</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {[
                'Mascotas ilimitadas',
                'Consultas de IA ilimitadas',
                'Historial clínico completo',
                'Preventivos y agenda',
                'Exportar PDF del historial',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* CTA FINAL */}
      <div className="rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 text-center text-white shadow-md md:p-10">
        <h2 className="text-xl font-extrabold md:text-2xl">
          Empezá a organizar mejor el cuidado de tu mascota
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-emerald-50 md:text-base">
          Creá tu cuenta gratis y comenzá a registrar la información de tu mascota hoy mismo.
        </p>
        <div className="mt-5">
          <button
            type="button"
            onClick={onRegister}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-emerald-700 shadow transition hover:bg-emerald-50 md:text-base"
          >
            Crear cuenta gratis
          </button>
        </div>
      </div>

      <BlogTeaser />
      <PetGuidesTeaser />

      <PublicFooter />
    </section>
  );
}
