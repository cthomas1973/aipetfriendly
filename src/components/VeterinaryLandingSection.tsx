import { useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Globe2,
  Heart,
  HelpCircle,
  ListChecks,
  MapPin,
  Navigation,
  ShieldCheck,
  Star,
  Users,
} from 'lucide-react';
import { BlogTeaser } from './BlogTeaser';
import { PetGuidesTeaser } from './PetGuidesTeaser';
import { PublicFooter } from './PublicLegalPages';
import { PublicLandingNav, RelatedLinksSection } from './PublicLandingNav';
import { setPageMeta } from '../lib/pageMeta';

interface VeterinaryLandingSectionProps {
  onRegister: () => void;
}

const HOW_IT_WORKS_STEPS = [
  'Usás tu ubicación o escribís una dirección.',
  'AiPetFriendly busca veterinarias en esa zona.',
  'Los resultados aparecen en mapa y listado.',
  'Podés consultar la información disponible y abrir la ubicación en Google Maps.',
];

const OWN_PROFILE_FIELDS = [
  'Teléfono.',
  'WhatsApp.',
  'Horarios.',
  'Servicios.',
  'Redes sociales y otros datos del perfil.',
];

export function VeterinaryLandingSection({ onRegister }: VeterinaryLandingSectionProps) {
  useEffect(() => {
    setPageMeta(
      'Veterinarias cerca tuyo | AiPetFriendly',
      'Buscá veterinarias cerca tuyo utilizando tu ubicación o una dirección y consultá los resultados en mapa y listado con AiPetFriendly.',
      '/veterinarias',
    );
  }, []);

  return (
    <section className="space-y-8 pb-6">
      {/* HERO */}
      <div className="rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 text-center text-white shadow-md md:p-10">
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
          <MapPin size={28} />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold leading-tight md:text-4xl">
          Encontrá veterinarias cerca tuyo
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-emerald-50 md:text-base">
          Buscá veterinarias utilizando tu ubicación o escribiendo una dirección, barrio o
          localidad y consultá los resultados desde un mapa y un listado.
        </p>
        <div className="mt-6 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          <button
            type="button"
            onClick={onRegister}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-emerald-700 shadow transition hover:bg-emerald-50 md:text-base"
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

      {/* EL PROBLEMA */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <HelpCircle size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Encontrar una veterinaria cuando la necesitás</h2>
            <p className="mt-1 text-sm text-slate-600">
              Buscar una veterinaria cercana puede ser especialmente útil cuando estás en una zona
              que no conocés, cuando viajás con tu mascota o cuando necesitás buscar alternativas
              cercanas.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              AiPetFriendly te ayuda a ubicar opciones cerca de donde estés, en mapa y en listado.
            </p>
          </div>
        </div>
      </div>

      {/* COMO FUNCIONA */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <ListChecks size={20} />
          </span>
          <div className="w-full">
            <h2 className="font-bold text-slate-900">Cómo funciona</h2>
            <ol className="mt-3 space-y-2 text-sm text-slate-700">
              {HOW_IT_WORKS_STEPS.map((step, index) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {/* FUENTES DE INFORMACION */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Globe2 size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Fuentes de información</h2>
            <p className="mt-1 text-sm text-slate-600">
              Los resultados combinan información proveniente de OpenStreetMap, Google Places y la
              base propia de AiPetFriendly.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              La cobertura depende de las fuentes disponibles en cada zona, por lo que puede
              variar de un lugar a otro.
            </p>
          </div>
        </div>
      </div>

      {/* MAPA Y LISTADO */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <MapPin size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Mapa y listado</h2>
            <p className="mt-1 text-sm text-slate-600">
              Los resultados se muestran en un mapa interactivo y en tarjetas con listado, para que
              puedas elegir la forma que te resulte más cómoda de revisar.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Podés consultar la distancia aproximada hasta cada resultado.
            </p>
          </div>
        </div>
      </div>

      {/* BUSQUEDA POR UBICACION O DIRECCION */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Navigation size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Búsqueda por ubicación o dirección</h2>
            <p className="mt-1 text-sm text-slate-600">
              Podés usar la ubicación de tu dispositivo, o buscar escribiendo una dirección o un
              barrio/localidad.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              La ubicación se utiliza para esa búsqueda y para calcular distancias, sin quedar
              almacenada de forma permanente.
            </p>
          </div>
        </div>
      </div>

      {/* INFORMACION DE LAS VETERINARIAS */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <ListChecks size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Información de las veterinarias</h2>
            <p className="mt-1 text-sm text-slate-600">
              La información disponible depende del origen del resultado.
            </p>
            <p className="mt-2 text-sm text-slate-600">Para perfiles propios de AiPetFriendly puede existir:</p>
            <ul className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              {OWN_PROFILE_FIELDS.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-slate-600">
              Para resultados externos puede haber información más limitada.
            </p>
          </div>
        </div>
      </div>

      {/* GOOGLE MAPS */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Navigation size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Google Maps</h2>
            <p className="mt-1 text-sm text-slate-600">
              Desde los resultados podés abrir la ubicación en Google Maps.
            </p>
          </div>
        </div>
      </div>

      {/* FAVORITOS */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Heart size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Favoritos</h2>
            <p className="mt-1 text-sm text-slate-600">
              Los usuarios con cuenta pueden guardar una veterinaria como favorita, para tenerla
              siempre a mano.
            </p>
          </div>
        </div>
      </div>

      {/* COMUNIDAD */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Users size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Comunidad</h2>
            <p className="mt-1 text-sm text-slate-600">
              Los usuarios con cuenta pueden sugerir nuevas veterinarias y respaldar las
              sugerencias de otros miembros de la comunidad.
            </p>
          </div>
        </div>
      </div>

      {/* PERFIL DE VETERINARIA */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Perfil de veterinaria</h2>
            <p className="mt-1 text-sm text-slate-600">
              Una veterinaria puede reclamar su perfil y completar información: datos de contacto,
              horarios, servicios y redes.
            </p>
          </div>
        </div>
      </div>

      {/* FREE / PREMIUM */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Star size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Búsqueda disponible para todos los planes</h2>
            <p className="mt-1 text-sm text-slate-600">
              La búsqueda de veterinarias está disponible independientemente de tu plan.
            </p>
            <p className="mt-2 text-sm text-slate-600">Las veterinarias pueden optar por un perfil destacado.</p>
          </div>
        </div>
      </div>

      {/* LIMITACIONES */}
      <div className="rounded-3xl bg-amber-50 p-5 shadow-sm ring-1 ring-amber-200 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <AlertTriangle size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">La información puede variar</h2>
            <p className="mt-1 text-sm text-slate-700">
              Los resultados combinan diferentes fuentes de información y pueden cambiar o estar
              incompletos. Los horarios, teléfonos y otros datos pueden no estar disponibles o
              quedar desactualizados. Antes de dirigirte a un establecimiento, conviene confirmar
              la información directamente.
            </p>
          </div>
        </div>
      </div>

      {/* PRIVACIDAD Y UBICACION */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Privacidad y ubicación</h2>
            <p className="mt-1 text-sm text-slate-600">
              Cuando utilizás tu ubicación, AiPetFriendly la utiliza para ayudarte a encontrar
              resultados cercanos y calcular distancias.
            </p>
          </div>
        </div>
      </div>

      {/* CTA FINAL */}
      <div className="rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 text-center text-white shadow-md md:p-10">
        <h2 className="text-xl font-extrabold md:text-2xl">Encontrá veterinarias cerca de donde estés</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-emerald-50 md:text-base">
          También podés conocer las demás herramientas de AiPetFriendly para el cuidado de tu
          mascota.
        </p>
        <div className="mt-5 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          <button
            type="button"
            onClick={onRegister}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-emerald-700 shadow transition hover:bg-emerald-50 md:text-base"
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

      <RelatedLinksSection links={[{ href: '/pet-friendly', label: 'Lugares Pet Friendly' }]} />

      <BlogTeaser />
      <PetGuidesTeaser />

      <PublicFooter />
    </section>
  );
}
