import { useEffect } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Package,
  Scale,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { BlogTeaser } from './BlogTeaser';
import { PetGuidesTeaser } from './PetGuidesTeaser';
import { PublicFooter } from './PublicLegalPages';
import { PublicLandingNav, RelatedLinksSection } from './PublicLandingNav';

interface FoodWeightLandingSectionProps {
  onRegister: () => void;
}

// Mismo patron que HowItWorksSection.tsx/ClinicalHistoryLandingSection.tsx/RemindersLandingSection.tsx:
// cada pagina publica actualiza su propio title/description para que buscadores
// y el crawler de AdSense vean contenido distinto por URL.
function setPageMeta(title: string, description: string) {
  document.title = title;
  const metaDescription = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (metaDescription) {
    metaDescription.setAttribute('content', description);
  }
}

const PURCHASE_FIELDS = [
  'Marca del alimento.',
  'Variedad.',
  'Peso de la bolsa.',
  'Fecha de compra.',
  'Mascotas asociadas a esa compra.',
];

const BENEFITS = [
  'Más orden en el registro de alimento.',
  'Mejor seguimiento del consumo.',
  'Historial de compras disponible cuando lo necesites.',
  'Evolución del peso a lo largo del tiempo.',
  'Referencias para organizar el alimento de tu mascota.',
  'Información centralizada por mascota.',
];

export function FoodWeightLandingSection({ onRegister }: FoodWeightLandingSectionProps) {
  useEffect(() => {
    setPageMeta(
      'Alimentación y peso de tu mascota | AiPetFriendly',
      'Registrá compras de alimento, estimá el consumo, seguí la evolución del peso y recibí orientación ante cambios significativos, todo desde AiPetFriendly.',
    );
  }, []);

  return (
    <section className="space-y-8 pb-6">
      {/* HERO */}
      <div className="rounded-3xl bg-gradient-to-br from-orange-500 to-orange-600 p-6 text-center text-white shadow-md md:p-10">
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
          <Scale size={28} />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold leading-tight md:text-4xl">
          Alimentación y peso, todo en un solo lugar
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-orange-50 md:text-base">
          Registrá la alimentación y el peso de tu mascota, seguí su evolución y tené una
          referencia más clara para organizar sus cuidados.
        </p>
        <div className="mt-6 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          <button
            type="button"
            onClick={onRegister}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-orange-700 shadow transition hover:bg-orange-50 md:text-base"
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

      <PublicLandingNav />

      {/* REGISTRA CADA COMPRA DE ALIMENTO */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-orange-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
            <Package size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Registrá cada compra de alimento</h2>
            <p className="mt-1 text-sm text-slate-600">
              Por cada compra podés indicar:
            </p>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {PURCHASE_FIELDS.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-orange-600" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-slate-600">
              Esto te permite mantener un historial organizado de las compras de alimento de tu
              mascota.
            </p>
          </div>
        </div>
      </div>

      {/* ESTIMACION DEL CONSUMO */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-orange-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
            <TrendingUp size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Estimación del consumo</h2>
            <p className="mt-1 text-sm text-slate-600">
              AiPetFriendly puede estimar el consumo diario utilizando los datos disponibles de
              la mascota (como peso, edad y especie) y del alimento registrado.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Son estimaciones orientativas y no sustituyen las indicaciones de un profesional
              veterinario.
            </p>
          </div>
        </div>
      </div>

      {/* ESTIMACION DE LA PROXIMA COMPRA */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-orange-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
            <CalendarClock size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Estimación de la próxima compra</h2>
            <p className="mt-1 text-sm text-slate-600">
              A partir del alimento registrado y del consumo estimado, el sistema puede calcular
              una fecha aproximada para la próxima compra, para que no te agarre de sorpresa.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Es una aproximación orientativa, no una fecha exacta garantizada.
            </p>
          </div>
        </div>
      </div>

      {/* SEGUIMIENTO DEL PESO */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-orange-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
            <Scale size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Seguimiento del peso</h2>
            <p className="mt-1 text-sm text-slate-600">
              Registrá diferentes mediciones de peso de tu mascota y consultá su evolución
              mediante un gráfico.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Podés observar cómo evoluciona el peso de tu mascota a lo largo del tiempo.
            </p>
          </div>
        </div>
      </div>

      {/* AVISO INTELIGENTE ANTE CAMBIOS DE PESO */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-orange-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
            <Sparkles size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Aviso inteligente ante cambios de peso</h2>
            <p className="mt-1 text-sm text-slate-600">
              AiPetFriendly puede detectar cambios significativos en el peso registrado. Cuando
              detecta un cambio significativo, AiPetFriendly puede generar una orientación para
              ayudarte a interpretar esa variación.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Esta orientación es informativa: no diagnostica, no determina enfermedades, no
              prescribe tratamientos y no reemplaza la evaluación de un veterinario.
            </p>
          </div>
        </div>
      </div>

      {/* INTEGRACION CON EL HISTORIAL CLINICO */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-orange-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
            <ClipboardList size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Integración con el historial clínico</h2>
            <p className="mt-1 text-sm text-slate-600">
              Las compras de alimento que registrás pueden quedar reflejadas dentro del
              historial de tu mascota, para que tengas todo en un mismo lugar.
            </p>
          </div>
        </div>
      </div>

      {/* BENEFICIOS */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-orange-100 md:p-6">
        <h2 className="font-bold text-slate-900">Beneficios</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {BENEFITS.map((item) => (
            <div key={item} className="flex items-start gap-2 rounded-2xl bg-orange-50/60 p-3 ring-1 ring-orange-100">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-orange-600" />
              <span className="text-sm text-slate-700">{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* USO RESPONSABLE */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-orange-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">
              Una herramienta para acompañarte, no para reemplazar al veterinario
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Las estimaciones y las funciones de IA de AiPetFriendly tienen carácter informativo
              y orientativo. No constituyen diagnóstico ni prescripción y no reemplazan la
              evaluación de un profesional veterinario.
            </p>
          </div>
        </div>
      </div>

      {/* LINK A COMO FUNCIONA */}
      <div className="rounded-3xl bg-white p-5 text-center shadow-sm ring-1 ring-orange-100 md:p-6">
        <p className="text-sm text-slate-600">¿Querés conocer AiPetFriendly en detalle?</p>
        <a
          href="/como-funciona"
          className="mt-4 inline-flex items-center justify-center gap-2 rounded-full border-2 border-orange-600 px-6 py-3 text-sm font-bold text-orange-700 shadow transition hover:bg-orange-50 md:text-base"
        >
          Conocé cómo funciona →
        </a>
      </div>

      {/* CTA FINAL */}
      <div className="rounded-3xl bg-gradient-to-br from-orange-500 to-orange-600 p-6 text-center text-white shadow-md md:p-10">
        <h2 className="text-xl font-extrabold md:text-2xl">
          Organizá la alimentación y el peso de tu mascota
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-orange-50 md:text-base">
          Creá tu cuenta gratis y empezá a registrar sus compras de alimento y su peso hoy mismo.
        </p>
        <div className="mt-5 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          <button
            type="button"
            onClick={onRegister}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-orange-700 shadow transition hover:bg-orange-50 md:text-base"
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

      <RelatedLinksSection links={[{ href: '/historial-clinico', label: 'Historial clínico' }]} />

      <BlogTeaser />
      <PetGuidesTeaser />

      <PublicFooter />
    </section>
  );
}
