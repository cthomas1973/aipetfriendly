import { useEffect } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Clock,
  Download,
  FileText,
  Mail,
  PawPrint,
  Pill,
  ShieldCheck,
  Stethoscope,
  Syringe,
} from 'lucide-react';
import { BlogTeaser } from './BlogTeaser';
import { PetGuidesTeaser } from './PetGuidesTeaser';
import { PublicFooter } from './PublicLegalPages';
import { PublicLandingNav, RelatedLinksSection } from './PublicLandingNav';

interface ClinicalHistoryLandingSectionProps {
  onRegister: () => void;
}

// Mismo patron que HowItWorksSection.tsx/BlogSection.tsx/PetGuidesSection.tsx:
// cada pagina publica actualiza su propio title/description para que buscadores
// y el crawler de AdSense vean contenido distinto por URL.
function setPageMeta(title: string, description: string) {
  document.title = title;
  const metaDescription = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (metaDescription) {
    metaDescription.setAttribute('content', description);
  }
}

const CATEGORIES: Array<{
  icon: typeof PawPrint;
  title: string;
  description: string;
}> = [
  {
    icon: Syringe,
    title: 'Vacunas',
    description: 'Registro de las vacunas aplicadas a tu mascota, con su fecha correspondiente.',
  },
  {
    icon: Pill,
    title: 'Desparasitaciones',
    description: 'Registro de las desparasitaciones realizadas, internas y externas.',
  },
  {
    icon: ClipboardList,
    title: 'Medicación',
    description: 'Registro de la medicación indicada y de las dosis administradas.',
  },
  {
    icon: Stethoscope,
    title: 'Tratamientos',
    description: 'Registro de tratamientos realizados a lo largo del tiempo.',
  },
  {
    icon: FileText,
    title: 'Notas clínicas',
    description: 'Notas que vos mismo podés cargar para dejar constancia de algo relevante.',
  },
];

export function ClinicalHistoryLandingSection({ onRegister }: ClinicalHistoryLandingSectionProps) {
  useEffect(() => {
    setPageMeta(
      'AiPetFriendly | Historial clínico de tu mascota',
      'Conocé cómo funciona el historial clínico digital de AiPetFriendly: vacunas, desparasitaciones, medicación y notas clínicas organizadas en una línea de tiempo, exportable en PDF.',
    );
  }, []);

  return (
    <section className="space-y-8 pb-6">
      {/* HERO */}
      <div className="rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 text-center text-white shadow-md md:p-10">
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
          <ClipboardList size={28} />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold leading-tight md:text-4xl">
          El historial clínico de tu mascota, organizado en un solo lugar
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-emerald-50 md:text-base">
          Registrá y consultá vacunas, desparasitaciones, medicación, tratamientos y notas
          clínicas en una línea de tiempo organizada.
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

      <PublicLandingNav />

      {/* QUE ES EL HISTORIAL CLINICO DIGITAL */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <h2 className="font-bold text-slate-900">¿Qué es el historial clínico digital?</h2>
        <p className="mt-2 text-sm text-slate-600">
          AiPetFriendly te permite mantener organizada la información relacionada con la salud y
          los cuidados de cada mascota. Cada mascota registrada tiene su propio historial.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          El historial reúne eventos registrados en distintas partes de la aplicación y los
          presenta organizados cronológicamente, para que puedas consultarlos cuando los
          necesites.
        </p>
      </div>

      {/* QUE INFORMACION REUNE */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <h2 className="font-bold text-slate-900">¿Qué información reúne?</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((category) => (
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

      {/* COMO SE CONSTRUYE EL HISTORIAL */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <h2 className="font-bold text-slate-900">¿Cómo se construye el historial?</h2>
        <p className="mt-2 text-sm text-slate-600">
          El historial puede construirse de dos maneras:
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-900">Registro automático</h3>
            <p className="mt-2 text-sm text-slate-600">
              Determinadas acciones registradas en la Agenda y en la gestión de medicación pueden
              generar automáticamente una entrada en el historial, por ejemplo: vacunas,
              desparasitaciones, medicación y turnos.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-900">Registro manual</h3>
            <p className="mt-2 text-sm text-slate-600">
              También podés agregar una nota clínica indicando título, categoría, fecha y
              descripción. Las notas clínicas son cargadas por vos.
            </p>
          </div>
        </div>
      </div>

      {/* LINEA DE TIEMPO */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Clock size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Una línea de tiempo para consultar la información</h2>
            <p className="mt-1 text-sm text-slate-600">
              El historial se presenta como una línea de tiempo ordenada de eventos. Puede
              consultarse por mascota, verse de lo más reciente a lo más antiguo, y filtrarse por
              categoría.
            </p>
          </div>
        </div>
      </div>

      {/* LIBRETA SANITARIA */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Syringe size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Libreta Sanitaria</h2>
            <p className="mt-1 text-sm text-slate-600">
              Además del historial completo, existe una vista específica, la Libreta Sanitaria,
              que reúne únicamente las vacunas y desparasitaciones registradas.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Esta vista puede mostrar la última vacuna, la última desparasitación, y la próxima
              fecha cuando corresponde.
            </p>
          </div>
        </div>
      </div>

      {/* EXPORTACION EN PDF */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Download size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Llevá la información con vos</h2>
            <p className="mt-1 text-sm text-slate-600">
              AiPetFriendly permite generar documentos PDF relacionados con el historial clínico,
              la libreta sanitaria y el control de medicación. Estas funciones de exportación y
              envío son exclusivas del plan Premium.
            </p>
            <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
              <Mail size={16} className="shrink-0 text-emerald-600" />
              El PDF también puede enviarse por email.
            </p>
          </div>
        </div>
      </div>

      {/* POR QUE ES UTIL */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <h2 className="font-bold text-slate-900">¿Por qué es útil?</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          {[
            'Consultar rápidamente los antecedentes registrados de tu mascota',
            'Mantener organizada la información de salud y cuidados',
            'Revisar eventos anteriores cuando lo necesites',
            'Tener una visión cronológica de lo registrado',
            'Recordar fácilmente qué ocurrió y cuándo',
            'Disponer de un documento exportable cuando corresponde',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
              {item}
            </li>
          ))}
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
              Esta página pública no muestra datos reales. Al usar la plataforma, la información
              del historial corresponde a la mascota registrada por cada usuario.
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-700">
              El historial sirve para organizar y consultar información registrada sobre tu
              mascota. No reemplaza la evaluación, el diagnóstico ni las indicaciones de un
              profesional veterinario.
            </p>
          </div>
        </div>
      </div>

      {/* CTA FINAL */}
      <div className="rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 text-center text-white shadow-md md:p-10">
        <h2 className="text-xl font-extrabold md:text-2xl">
          Empezá a organizar la información de salud de tu mascota
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-emerald-50 md:text-base">
          Creá tu cuenta gratis y comenzá a registrar el historial clínico de tu mascota hoy mismo.
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

      <RelatedLinksSection
        links={[
          { href: '/recordatorios', label: 'Recordatorios' },
          { href: '/consultorio-ia', label: 'Asistente IA' },
        ]}
      />

      <BlogTeaser />
      <PetGuidesTeaser />

      <PublicFooter />
    </section>
  );
}
