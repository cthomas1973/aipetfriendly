import { useEffect } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  Image as ImageIcon,
  ListChecks,
  MessageCircleHeart,
  ShieldCheck,
  Sparkles,
  Stethoscope,
} from 'lucide-react';
import { BlogTeaser } from './BlogTeaser';
import { PetGuidesTeaser } from './PetGuidesTeaser';
import { PublicFooter } from './PublicLegalPages';

interface AIAssistantLandingSectionProps {
  onRegister: () => void;
}

// Mismo patron que HowItWorksSection.tsx/ClinicalHistoryLandingSection.tsx/RemindersLandingSection.tsx/FoodWeightLandingSection.tsx:
// cada pagina publica actualiza su propio title/description para que buscadores
// y el crawler de AdSense vean contenido distinto por URL.
function setPageMeta(title: string, description: string) {
  document.title = title;
  const metaDescription = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (metaDescription) {
    metaDescription.setAttribute('content', description);
  }
}

const HOW_IT_WORKS_STEPS = [
  'Seleccionás tu mascota.',
  'Escribís tu consulta.',
  'AiPetFriendly utiliza el contexto disponible de esa mascota.',
  'Recibís una orientación generada por IA.',
];

const CONTEXT_FIELDS = [
  'Especie.',
  'Raza.',
  'Edad.',
  'Sexo.',
  'Peso.',
  'Notas del perfil.',
  'Historial clínico reciente.',
  'Agenda y cuidados recientes.',
  'Conversación reciente.',
];

const USE_CASES = [
  'Alimentación.',
  'Vacunas.',
  'Prevención.',
  'Comportamiento.',
  'Cuidados cotidianos.',
  'Dudas sobre síntomas o señales de alerta.',
];

const BENEFITS = [
  'Orientación contextualizada.',
  'Utiliza información de tu mascota.',
  'Consulta sobre cuidados cotidianos.',
  'Contexto del historial reciente.',
  'Integración con la agenda.',
  'Análisis visual en Premium.',
  'Posibilidad de recomendar una consulta veterinaria cuando corresponde.',
];

export function AIAssistantLandingSection({ onRegister }: AIAssistantLandingSectionProps) {
  useEffect(() => {
    setPageMeta(
      'Asistente IA para el cuidado de tu mascota | AiPetFriendly',
      'Consultá sobre el cuidado de tu mascota y recibí orientación mediante IA utilizando información de su perfil, historial reciente y cuidados registrados.',
    );
  }, []);

  return (
    <section className="space-y-8 pb-6">
      {/* HERO */}
      <div className="rounded-3xl bg-gradient-to-br from-violet-500 to-violet-600 p-6 text-center text-white shadow-md md:p-10">
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
          <Sparkles size={28} />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold leading-tight md:text-4xl">
          Asistente IA para el cuidado de tu mascota
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-violet-50 md:text-base">
          Consultá sobre el cuidado de tu mascota y recibí orientación teniendo en cuenta la
          información disponible sobre ella, su historial reciente y sus cuidados registrados.
        </p>
        <div className="mt-6 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          <button
            type="button"
            onClick={onRegister}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-violet-700 shadow transition hover:bg-violet-50 md:text-base"
          >
            Crear mi cuenta
          </button>
          <a
            href="/como-funciona"
            className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-white px-6 py-3 text-sm font-bold text-white shadow transition hover:bg-white/10 md:text-base"
          >
            Conocer AiPetFriendly
          </a>
        </div>
      </div>

      {/* COMO FUNCIONA */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-violet-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
            <MessageCircleHeart size={20} />
          </span>
          <div className="w-full">
            <h2 className="font-bold text-slate-900">Cómo funciona</h2>
            <ol className="mt-3 space-y-2 text-sm text-slate-700">
              {HOW_IT_WORKS_STEPS.map((step, index) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {/* QUE INFORMACION PUEDE UTILIZAR */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-violet-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
            <ListChecks size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Qué información puede utilizar</h2>
            <p className="mt-1 text-sm text-slate-600">
              Para orientarte mejor, el asistente puede tener en cuenta:
            </p>
            <ul className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              {CONTEXT_FIELDS.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-violet-600" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* EJEMPLOS DE USO */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-violet-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
            <Stethoscope size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Ejemplos de uso</h2>
            <p className="mt-1 text-sm text-slate-600">Podés consultar, por ejemplo, sobre:</p>
            <ul className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              {USE_CASES.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-violet-600" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-slate-600">
              Estas respuestas son orientativas: no constituyen un diagnóstico.
            </p>
          </div>
        </div>
      </div>

      {/* IMAGENES - PREMIUM */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-violet-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
            <ImageIcon size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Análisis visual con Premium</h2>
            <p className="mt-1 text-sm text-slate-600">
              Con Premium también podés adjuntar una imagen para obtener una orientación visual
              generada por IA.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              El análisis visual es orientativo y no reemplaza un examen físico realizado por un
              profesional veterinario.
            </p>
          </div>
        </div>
      </div>

      {/* ORIENTACION Y SEÑALES DE ALERTA */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-violet-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
            <Sparkles size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Orientación y señales de alerta</h2>
            <p className="mt-1 text-sm text-slate-600">
              El asistente puede recomendarte una consulta veterinaria presencial cuando
              identifica señales que requieren evaluación profesional.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Esta orientación es informativa y no diagnostica enfermedades.
            </p>
          </div>
        </div>
      </div>

      {/* LIMITES */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-violet-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
            <ListChecks size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Límites de uso</h2>
            <p className="mt-1 text-sm text-slate-600">
              El uso del asistente tiene límites de consultas, y el plan Premium ofrece un límite
              mayor que el plan gratuito.
            </p>
          </div>
        </div>
      </div>

      {/* BENEFICIOS */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-violet-100 md:p-6">
        <h2 className="font-bold text-slate-900">Beneficios</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {BENEFITS.map((item) => (
            <div key={item} className="flex items-start gap-2 rounded-2xl bg-violet-50/60 p-3 ring-1 ring-violet-100">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-violet-600" />
              <span className="text-sm text-slate-700">{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* USO RESPONSABLE */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-violet-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">
              Una herramienta de orientación, no un reemplazo del veterinario
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Las respuestas generadas por IA tienen carácter informativo y orientativo. No
              constituyen diagnóstico ni prescripción médica y no reemplazan la evaluación de un
              profesional veterinario.
            </p>
          </div>
        </div>
      </div>

      {/* PRIVACIDAD */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-violet-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Privacidad</h2>
            <p className="mt-1 text-sm text-slate-600">
              Las conversaciones de usuarios registrados se guardan en el historial de la
              mascota.
            </p>
          </div>
        </div>
      </div>

      {/* LINK A COMO FUNCIONA */}
      <div className="rounded-3xl bg-white p-5 text-center shadow-sm ring-1 ring-violet-100 md:p-6">
        <p className="text-sm text-slate-600">¿Querés conocer AiPetFriendly en detalle?</p>
        <a
          href="/como-funciona"
          className="mt-4 inline-flex items-center justify-center gap-2 rounded-full border-2 border-violet-600 px-6 py-3 text-sm font-bold text-violet-700 shadow transition hover:bg-violet-50 md:text-base"
        >
          Conocé cómo funciona →
        </a>
      </div>

      {/* CTA FINAL */}
      <div className="rounded-3xl bg-gradient-to-br from-violet-500 to-violet-600 p-6 text-center text-white shadow-md md:p-10">
        <h2 className="text-xl font-extrabold md:text-2xl">
          Sumá el asistente IA al cuidado de tu mascota
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-violet-50 md:text-base">
          Creá tu cuenta gratis: AiPetFriendly reúne esta función junto con el resto de las
          herramientas de cuidado de tu mascota.
        </p>
        <div className="mt-5 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          <button
            type="button"
            onClick={onRegister}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-violet-700 shadow transition hover:bg-violet-50 md:text-base"
          >
            Crear mi cuenta
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-white px-6 py-3 text-sm font-bold text-white shadow transition hover:bg-white/10 md:text-base"
          >
            <ChevronLeft size={16} /> Volver al inicio
          </a>
        </div>
      </div>

      <BlogTeaser />
      <PetGuidesTeaser />

      <PublicFooter />
    </section>
  );
}
