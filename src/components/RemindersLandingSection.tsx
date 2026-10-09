import { useEffect } from 'react';
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Mail,
  MessageCircle,
  PawPrint,
  Pill,
  Scale,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Syringe,
  TrendingUp,
  Users,
} from 'lucide-react';
import { BlogTeaser } from './BlogTeaser';
import { PetGuidesTeaser } from './PetGuidesTeaser';
import { PublicFooter } from './PublicLegalPages';
import { PublicLandingNav, RelatedLinksSection } from './PublicLandingNav';
import { setPageMeta } from '../lib/pageMeta';

interface RemindersLandingSectionProps {
  onRegister: () => void;
}

const CARE_CATEGORIES: Array<{
  icon: typeof PawPrint;
  title: string;
  description: string;
}> = [
  {
    icon: Syringe,
    title: 'Vacunas',
    description: 'Registrá cada vacuna aplicada y su fecha correspondiente.',
  },
  {
    icon: Pill,
    title: 'Desparasitaciones',
    description: 'Configurá el intervalo entre desparasitaciones, internas y externas.',
  },
  {
    icon: ClipboardList,
    title: 'Medicación',
    description: 'Organizá tratamientos con dosis, frecuencia, horarios y duración.',
  },
  {
    icon: Stethoscope,
    title: 'Turnos veterinarios',
    description: 'Registrá motivo, horario y lugar del turno, con su recordatorio.',
  },
  {
    icon: Sparkles,
    title: 'Otros cuidados',
    description: 'Cualquier otro cuidado que quieras registrar y recordar.',
  },
];

const HOW_IT_WORKS_STEPS = [
  'Registrá el cuidado.',
  'Configurá la fecha y, cuando corresponda, la frecuencia o intervalo.',
  'AiPetFriendly organiza las próximas fechas según la configuración.',
  'Recibí avisos por los canales disponibles.',
];

const BENEFITS = [
  'Menos olvidos.',
  'Cuidados organizados por mascota.',
  'Próximas fechas más fáciles de consultar.',
  'Información conectada con el historial clínico.',
  'Seguimiento de alimentación y peso.',
];

export function RemindersLandingSection({ onRegister }: RemindersLandingSectionProps) {
  useEffect(() => {
    setPageMeta(
      'AiPetFriendly | Recordatorios para el cuidado de tu mascota',
      'Organizá vacunas, desparasitaciones, medicación, turnos y otros cuidados de tu mascota con la agenda y los recordatorios de AiPetFriendly.',
      '/recordatorios',
    );
  }, []);

  return (
    <section className="space-y-8 pb-6">
      {/* HERO */}
      <div className="rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 text-center text-white shadow-md md:p-10">
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
          <CalendarClock size={28} />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold leading-tight md:text-4xl">
          Recordatorios para el cuidado de tu mascota
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-emerald-50 md:text-base">
          Organizá vacunas, desparasitaciones, medicación, turnos y otros cuidados de cada
          mascota desde una agenda centralizada.
        </p>
        <div className="mt-6 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          <button
            type="button"
            onClick={onRegister}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-emerald-700 shadow transition hover:bg-emerald-50 md:text-base"
          >
            Organizar los cuidados de mi mascota
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-white px-6 py-3 text-sm font-bold text-white shadow transition hover:bg-white/10 md:text-base"
          >
            <ChevronLeft size={16} /> Volver al inicio
          </a>
        </div>
      </div>

      <PublicLandingNav />

      {/* QUE PODES ORGANIZAR */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <h2 className="font-bold text-slate-900">¿Qué podés organizar?</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARE_CATEGORIES.map((category) => (
            <div key={category.title} className="rounded-2xl bg-emerald-50/60 p-4 ring-1 ring-emerald-100">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <category.icon size={18} />
              </span>
              <h3 className="mt-3 text-sm font-bold text-slate-900">{category.title}</h3>
              <p className="mt-1 text-xs text-slate-600">{category.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CONTROL DE ALIMENTO */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <TrendingUp size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Control de alimento</h2>
            <p className="mt-1 text-sm text-slate-600">
              Además de los cuidados de salud, la agenda tiene una sección específica para
              alimentación: registrá cada compra, consultá una estimación de consumo y recibí un
              aviso aproximado de próxima compra. También podés registrar el peso de tu mascota.
            </p>
          </div>
        </div>
      </div>

      {/* COMO FUNCIONA */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <h2 className="font-bold text-slate-900">¿Cómo funciona?</h2>
        <ol className="mt-4 space-y-3 text-sm text-slate-700">
          {HOW_IT_WORKS_STEPS.map((step, index) => (
            <li key={step} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      {/* AVISOS PARA NO OLVIDARTE */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Bell size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Avisos para no olvidarte</h2>
            <p className="mt-1 text-sm text-slate-600">
              Los recordatorios pueden llegarte por los canales disponibles:
            </p>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li className="flex items-start gap-2">
                <Mail size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                Email.
              </li>
              <li className="flex items-start gap-2">
                <MessageCircle size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                WhatsApp (sujeto a la configuración correspondiente).
              </li>
              <li className="flex items-start gap-2">
                <Bell size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                Avisos dentro de la aplicación cuando la tenés abierta.
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* DE LA AGENDA AL HISTORIAL CLINICO */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <h2 className="font-bold text-slate-900">De la agenda al historial clínico</h2>
        <p className="mt-2 text-sm text-slate-600">
          Al registrar determinados cuidados preventivos, AiPetFriendly puede generar la
          correspondiente entrada en el historial clínico de tu mascota, para que quede
          disponible en su línea de tiempo.
        </p>
      </div>

      {/* MEDICACION */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <h2 className="font-bold text-slate-900">Medicación</h2>
        <p className="mt-2 text-sm text-slate-600">
          Para los tratamientos, podés organizar la medicación indicando dosis, frecuencia,
          horarios y duración del tratamiento.
        </p>
      </div>

      {/* ALIMENTACION Y PESO */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Scale size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Alimentación y peso</h2>
            <p className="mt-1 text-sm text-slate-600">
              Registrá las compras de alimento, consultá una estimación de consumo y un cálculo
              aproximado de la próxima compra. También podés registrar el peso de tu mascota y
              recibir un aviso cuando se detecte un cambio significativo.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              La inteligencia artificial de AiPetFriendly interviene únicamente en el aviso
              relacionado con cambios de peso, no en el cálculo diario de alimento.
            </p>
          </div>
        </div>
      </div>

      {/* CUIDAR EN EQUIPO */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Users size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Cuidar en equipo</h2>
            <p className="mt-1 text-sm text-slate-600">
              Con el plan Premium, podés sumar cotutores que reciben los mismos avisos que vos
              como titular de la mascota.
            </p>
          </div>
        </div>
      </div>

      {/* BENEFICIOS */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <h2 className="font-bold text-slate-900">Beneficios</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          {BENEFITS.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* PREMIUM */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <h2 className="font-bold text-slate-900">Premium</h2>
        <p className="mt-2 text-sm text-slate-600">
          La agenda y los recordatorios forman parte de las herramientas de organización de
          AiPetFriendly. El plan Premium suma, entre otras funciones:
        </p>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          <li className="flex items-start gap-2">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
            Informe Clínico en PDF.
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
            Libreta Sanitaria en PDF.
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
            Control de Medicación en PDF.
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
            Cotutores.
          </li>
        </ul>
      </div>

      {/* PRIVACIDAD Y USO RESPONSABLE */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Privacidad y uso responsable</h2>
            <p className="mt-1 text-sm text-slate-600">
              Esta página pública no muestra información real de usuarios. Es solamente una
              explicación pública de la funcionalidad: los datos de cada mascota se gestionan
              dentro de la cuenta de cada usuario.
            </p>
          </div>
        </div>
      </div>

      {/* LINK A COMO FUNCIONA */}
      <div className="rounded-3xl bg-white p-5 text-center shadow-sm ring-1 ring-emerald-100 md:p-6">
        <p className="text-sm text-slate-600">¿Querés conocer AiPetFriendly en detalle?</p>
        <a
          href="/como-funciona"
          className="mt-4 inline-flex items-center justify-center gap-2 rounded-full border-2 border-emerald-600 px-6 py-3 text-sm font-bold text-emerald-700 shadow transition hover:bg-emerald-50 md:text-base"
        >
          Conocé cómo funciona →
        </a>
      </div>

      {/* CTA FINAL */}
      <div className="rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 text-center text-white shadow-md md:p-10">
        <h2 className="text-xl font-extrabold md:text-2xl">
          Organizá el cuidado de tu mascota
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-emerald-50 md:text-base">
          Creá tu cuenta gratis y empezá a registrar los cuidados de tu mascota hoy mismo.
        </p>
        <div className="mt-5">
          <button
            type="button"
            onClick={onRegister}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-emerald-700 shadow transition hover:bg-emerald-50 md:text-base"
          >
            Crear mi cuenta
          </button>
        </div>
      </div>

      <RelatedLinksSection links={[{ href: '/alimentacion-y-peso', label: 'Alimentación y peso' }]} />

      <BlogTeaser />
      <PetGuidesTeaser />

      <PublicFooter />
    </section>
  );
}
