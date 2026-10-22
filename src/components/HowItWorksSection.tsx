import { useEffect, useState } from 'react';
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
import { PublicLandingNav } from './PublicLandingNav';
import { setPageMeta } from '../lib/pageMeta';

interface HowItWorksSectionProps {
  onRegister: () => void;
}

interface ToolAnchorItem {
  icon: typeof PawPrint;
  title: string;
  tooltip: string;
  targetId: string;
}

interface ToolHotspot {
  title: string;
  targetId: string;
  tooltip: string;
  left: string;
  top: string;
  width: string;
  height: string;
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
  id: string;
  icon: typeof PawPrint;
  title: string;
  description: string;
}> = [
  {
    id: 'tool-profile',
    icon: PawPrint,
    title: 'Perfil de tu mascota',
    description: 'Cargá los datos básicos de tu mascota (nombre, especie, raza) para empezar a organizar su cuidado.',
  },
  {
    id: 'tool-reminders',
    icon: CalendarDays,
    title: 'Agenda y recordatorios',
    description: 'Registrá vacunas, desparasitaciones, medicación y turnos, con recordatorios por push, email y WhatsApp.',
  },
  {
    id: 'tool-clinical-history',
    icon: FileText,
    title: 'Historial clínico',
    description: 'Guardá el historial de salud de tu mascota en un solo lugar y exportalo en PDF cuando lo necesites.',
  },
  {
    id: 'tool-food-weight',
    icon: Utensils,
    title: 'Alimentación y peso',
    description: 'Llevá un registro del alimento y el peso de tu mascota a lo largo del tiempo.',
  },
  {
    id: 'tool-medication',
    icon: Pill,
    title: 'Medicación',
    description: 'Registrá las medicaciones indicadas y llevá un control de las dosis aplicadas.',
  },
  {
    id: 'tool-identification-qr',
    icon: QrCode,
    title: 'Identificación y QR',
    description: 'Generá una identificación con código QR para tu mascota, para que puedan contactarte si se pierde.',
  },
  {
    id: 'tool-lost-pet',
    icon: AlertTriangle,
    title: 'Mascota perdida',
    description: 'Quien encuentre a tu mascota puede escanear su QR y enviarte un mensaje de contacto.',
  },
  {
    id: 'tool-ai-clinic',
    icon: MessageCircle,
    title: 'Consultorio IA',
    description: 'Consultá dudas sobre el cuidado de tu mascota con un asistente que usa como contexto su información registrada.',
  },
  {
    id: 'tool-nearby-vets',
    icon: MapPinned,
    title: 'Veterinarias cercanas',
    description: 'Encontrá veterinarias cerca tuyo con un mapa interactivo.',
  },
  {
    id: 'tool-pet-friendly-places',
    icon: Palmtree,
    title: 'Lugares Pet Friendly',
    description: 'Descubrí lugares pet friendly para ir con tu mascota.',
  },
];

const TOOL_MAP_ITEMS: ToolAnchorItem[] = [
  {
    icon: PawPrint,
    title: 'Perfil de tu mascota',
    tooltip: 'Datos esenciales para centralizar toda su información.',
    targetId: 'tool-profile',
  },
  {
    icon: CalendarDays,
    title: 'Agenda y recordatorios',
    tooltip: 'Turnos, vacunas y alertas para no olvidar cuidados clave.',
    targetId: 'tool-reminders',
  },
  {
    icon: FileText,
    title: 'Historial clínico',
    tooltip: 'Registro de consultas y evolución de salud en un solo lugar.',
    targetId: 'tool-clinical-history',
  },
  {
    icon: Utensils,
    title: 'Alimentación y peso',
    tooltip: 'Seguimiento del bienestar diario y cambios importantes.',
    targetId: 'tool-food-weight',
  },
  {
    icon: Pill,
    title: 'Medicación',
    tooltip: 'Control de tratamientos y dosis aplicadas.',
    targetId: 'tool-medication',
  },
  {
    icon: MessageCircle,
    title: 'Consultorio IA',
    tooltip: 'Orientación general basada en el contexto de tu mascota.',
    targetId: 'section-ai-guidance',
  },
  {
    icon: QrCode,
    title: 'Identificación QR y mascota perdida',
    tooltip: 'QR de contacto para facilitar el reencuentro si se extravía.',
    targetId: 'tool-identification-qr',
  },
  {
    icon: MapPinned,
    title: 'Veterinarias cercanas',
    tooltip: 'Búsqueda rápida en mapa cuando más lo necesitás.',
    targetId: 'tool-nearby-vets',
  },
  {
    icon: Palmtree,
    title: 'Lugares Pet Friendly',
    tooltip: 'Espacios para compartir salidas con tu mascota.',
    targetId: 'tool-pet-friendly-places',
  },
  {
    icon: Search,
    title: 'Blog y guías',
    tooltip: 'Consejos prácticos y recursos nuevos cada semana.',
    targetId: 'section-blog-guides',
  },
];

const TOOL_MAP_IMAGE_SRC = '/Todas las herramientas para tu mascota.png';

const TOOL_MAP_HOTSPOTS_DESKTOP: ToolHotspot[] = [
  {
    title: 'Agenda y recordatorios',
    targetId: 'tool-reminders',
    tooltip: 'Vacunas, turnos y desparasitación con alertas.',
    left: '2.6%',
    top: '7.2%',
    width: '30%',
    height: '20.8%',
  },
  {
    title: 'Perfil de tu mascota',
    targetId: 'tool-profile',
    tooltip: 'Datos de perfil en una ficha clara y rápida.',
    left: '37%',
    top: '3%',
    width: '25.2%',
    height: '20.3%',
  },
  {
    title: 'Blog y guías',
    targetId: 'section-blog-guides',
    tooltip: 'Consejos y contenidos prácticos para el día a día.',
    left: '70.3%',
    top: '7.2%',
    width: '27.2%',
    height: '20.8%',
  },
  {
    title: 'Historial clínico',
    targetId: 'tool-clinical-history',
    tooltip: 'Consultas, diagnósticos y tratamientos centralizados.',
    left: '2.1%',
    top: '31%',
    width: '31.2%',
    height: '29.4%',
  },
  {
    title: 'Lugares Pet Friendly',
    targetId: 'tool-pet-friendly-places',
    tooltip: 'Encontrá espacios para salir junto a tu mascota.',
    left: '69.6%',
    top: '32.5%',
    width: '29.6%',
    height: '24.6%',
  },
  {
    title: 'Alimentación y peso',
    targetId: 'tool-food-weight',
    tooltip: 'Seguimiento visual de evolución y hábitos.',
    left: '2.6%',
    top: '62%',
    width: '34.9%',
    height: '24.7%',
  },
  {
    title: 'Consultorio IA',
    targetId: 'section-ai-guidance',
    tooltip: 'Orientación preventiva basada en tu contexto.',
    left: '27.1%',
    top: '72.1%',
    width: '25.2%',
    height: '23.3%',
  },
  {
    title: 'Identificación QR y mascota perdida',
    targetId: 'tool-identification-qr',
    tooltip: 'Facilitá contacto y recuperación si se pierde.',
    left: '52.9%',
    top: '72.3%',
    width: '28.1%',
    height: '23.3%',
  },
  {
    title: 'Veterinarias cercanas',
    targetId: 'tool-nearby-vets',
    tooltip: 'Ubicá clínicas cercanas en mapa interactivo.',
    left: '71.9%',
    top: '58.8%',
    width: '27.4%',
    height: '26.5%',
  },
];

const TOOL_MAP_HOTSPOTS_MOBILE: ToolHotspot[] = [
  {
    title: 'Agenda y recordatorios',
    targetId: 'tool-reminders',
    tooltip: 'Vacunas, turnos y desparasitación con alertas.',
    left: '1.8%',
    top: '6.4%',
    width: '32.2%',
    height: '22.1%',
  },
  {
    title: 'Perfil de tu mascota',
    targetId: 'tool-profile',
    tooltip: 'Datos de perfil en una ficha clara y rápida.',
    left: '36.1%',
    top: '2.2%',
    width: '26.9%',
    height: '21.4%',
  },
  {
    title: 'Blog y guías',
    targetId: 'section-blog-guides',
    tooltip: 'Consejos y contenidos prácticos para el día a día.',
    left: '69.4%',
    top: '6.4%',
    width: '29%',
    height: '22.1%',
  },
  {
    title: 'Historial clínico',
    targetId: 'tool-clinical-history',
    tooltip: 'Consultas, diagnósticos y tratamientos centralizados.',
    left: '1.3%',
    top: '30.4%',
    width: '33%',
    height: '30.7%',
  },
  {
    title: 'Lugares Pet Friendly',
    targetId: 'tool-pet-friendly-places',
    tooltip: 'Encontrá espacios para salir junto a tu mascota.',
    left: '68.9%',
    top: '31.9%',
    width: '30.9%',
    height: '25.9%',
  },
  {
    title: 'Alimentación y peso',
    targetId: 'tool-food-weight',
    tooltip: 'Seguimiento visual de evolución y hábitos.',
    left: '1.7%',
    top: '61.7%',
    width: '36.2%',
    height: '25.8%',
  },
  {
    title: 'Consultorio IA',
    targetId: 'section-ai-guidance',
    tooltip: 'Orientación preventiva basada en tu contexto.',
    left: '26.3%',
    top: '71.5%',
    width: '26.6%',
    height: '24.8%',
  },
  {
    title: 'Identificación QR y mascota perdida',
    targetId: 'tool-identification-qr',
    tooltip: 'Facilitá contacto y recuperación si se pierde.',
    left: '52.1%',
    top: '71.7%',
    width: '30%',
    height: '24.8%',
  },
  {
    title: 'Veterinarias cercanas',
    targetId: 'tool-nearby-vets',
    tooltip: 'Ubicá clínicas cercanas en mapa interactivo.',
    left: '71.1%',
    top: '58.1%',
    width: '28.8%',
    height: '27.8%',
  },
];

export function HowItWorksSection({ onRegister }: HowItWorksSectionProps) {
  const [useMobileHotspots, setUseMobileHotspots] = useState(false);

  useEffect(() => {
    setPageMeta(
      'AiPetFriendly | Cómo funciona',
      'Conocé cómo funciona AiPetFriendly y cómo podés organizar la salud, los cuidados, la alimentación, la identificación y la vida cotidiana de tu mascota desde un solo lugar.',
      '/como-funciona',
    );
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 640px)');

    const syncHotspotsMode = (event?: MediaQueryListEvent) => {
      setUseMobileHotspots(event ? event.matches : mediaQuery.matches);
    };

    syncHotspotsMode();
    mediaQuery.addEventListener('change', syncHotspotsMode);

    return () => mediaQuery.removeEventListener('change', syncHotspotsMode);
  }, []);

  const activeHotspots = useMobileHotspots ? TOOL_MAP_HOTSPOTS_MOBILE : TOOL_MAP_HOTSPOTS_DESKTOP;

  const handleAnchorClick = (event: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    const section = document.getElementById(targetId);
    if (!section) {
      return;
    }

    event.preventDefault();

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    section.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
    window.history.replaceState(null, '', `#${targetId}`);
  };

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

      {/* MAPA DE HERRAMIENTAS */}
      <div className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm md:p-6">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-1 text-xs font-extrabold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-100">
            <PawPrint size={14} /> Todas las herramientas
          </span>
          <h2 className="text-xl font-extrabold text-slate-900 md:text-2xl">
            Todo el cuidado de tu mascota, en un solo lugar
          </h2>
          <p className="mx-auto mt-2 max-w-3xl text-sm text-slate-600 md:text-base">
            Explorá las herramientas de AiPetFriendly y descubrí cómo pueden ayudarte a organizar
            su cuidado, su salud y su bienestar.
          </p>
        </div>

        <div className="mt-5 rounded-3xl bg-gradient-to-br from-emerald-50 via-white to-emerald-50 p-3 ring-1 ring-emerald-100 md:p-4">
          <div className="relative overflow-hidden rounded-2xl bg-white ring-1 ring-emerald-100">
            <img
              src={TOOL_MAP_IMAGE_SRC}
              alt="Mapa visual de herramientas de AiPetFriendly"
              className="h-auto w-full"
              loading="lazy"
            />

            {activeHotspots.map((hotspot) => (
              <a
                key={hotspot.title}
                href={`#${hotspot.targetId}`}
                onClick={(event) => handleAnchorClick(event, hotspot.targetId)}
                aria-label={`${hotspot.title}. ${hotspot.tooltip}`}
                title={hotspot.tooltip}
                className="absolute rounded-xl border-2 border-transparent transition hover:border-emerald-400/70 hover:bg-emerald-300/10 focus-visible:border-emerald-500 focus-visible:bg-emerald-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                style={{
                  left: hotspot.left,
                  top: hotspot.top,
                  width: hotspot.width,
                  height: hotspot.height,
                }}
              >
                <span className="sr-only">{hotspot.title}</span>
              </a>
            ))}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:hidden">
            {TOOL_MAP_ITEMS.map((item) => (
              <a
                key={item.title}
                href={`#${item.targetId}`}
                onClick={(event) => handleAnchorClick(event, item.targetId)}
                className="group relative rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                aria-label={`${item.title}. ${item.tooltip}`}
              >
                <span className="text-emerald-700">{item.title}</span>
                <span className="ml-2 text-[11px] font-medium text-slate-500">Ver explicación</span>
              </a>
            ))}
          </div>

          <div className="mt-4 flex justify-center">
            <a
              href="#section-tools"
              onClick={(event) => handleAnchorClick(event, 'section-tools')}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            >
              Conocé cada herramienta en detalle
            </a>
          </div>
        </div>
      </div>

      <PublicLandingNav />

      {/* QUE ES AIPETFRIENDLY */}
      <div id="section-what-is" className="scroll-mt-28 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
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
      <div id="section-problem" className="scroll-mt-28 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
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
      <div id="section-how-it-works" className="scroll-mt-28 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
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
      <div id="section-tools" className="scroll-mt-28 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <h2 className="font-bold text-slate-900">Principales herramientas</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool) => (
            <div id={tool.id} key={tool.title} className="scroll-mt-28 rounded-2xl bg-emerald-50/60 p-4 ring-1 ring-emerald-100">
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
      <div id="section-ai-guidance" className="scroll-mt-28 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
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
      <div id="section-plans" className="scroll-mt-28 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Plan gratis y plan Premium</h2>
            <p className="mt-1 text-sm text-slate-600">
              Empezá gratis con 1 mascota y hasta 10 consultas de IA por mes por mascota. Con Premium sumás
              mascotas ilimitadas, hasta 100 consultas de IA por mes por mascota, exportación del historial en PDF y más.
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
                'Hasta 10 consultas de IA por mes por mascota',
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
                'Hasta 100 consultas de IA por mes por mascota',
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
      <div id="section-final-cta" className="scroll-mt-28 rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 text-center text-white shadow-md md:p-10">
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

      <div id="section-blog-guides" className="scroll-mt-28 space-y-8">
        <BlogTeaser />
        <PetGuidesTeaser />
      </div>

      <PublicFooter />
    </section>
  );
}
