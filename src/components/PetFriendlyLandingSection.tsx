import { useEffect } from 'react';
import {
  AlertTriangle,
  BedDouble,
  CheckCircle2,
  ChevronLeft,
  Coffee,
  Globe2,
  HelpCircle,
  ListChecks,
  MapPin,
  Navigation,
  ShieldCheck,
  ShoppingBag,
  Star,
  Trees,
  Users,
  Utensils,
  Waves,
} from 'lucide-react';
import { BlogTeaser } from './BlogTeaser';
import { PetGuidesTeaser } from './PetGuidesTeaser';
import { PublicFooter } from './PublicLegalPages';
import { PublicLandingNav, RelatedLinksSection } from './PublicLandingNav';

interface PetFriendlyLandingSectionProps {
  onRegister: () => void;
}

// Mismo patron que HowItWorksSection.tsx/ClinicalHistoryLandingSection.tsx/RemindersLandingSection.tsx/
// FoodWeightLandingSection.tsx/AIAssistantLandingSection.tsx/IdentificationLostPetLandingSection.tsx/
// VeterinaryLandingSection.tsx: cada pagina publica actualiza su propio title/description para que
// buscadores y el crawler de AdSense vean contenido distinto por URL.
function setPageMeta(title: string, description: string) {
  document.title = title;
  const metaDescription = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (metaDescription) {
    metaDescription.setAttribute('content', description);
  }
}

const HOW_IT_WORKS_STEPS = [
  'Usás tu ubicación o escribís una dirección.',
  'Elegís una categoría (restaurantes, bares, hoteles, parques, tiendas, playas u otros).',
  'AiPetFriendly busca lugares marcados como aptos para mascotas en esa zona.',
  'Los resultados aparecen en mapa y listado, con la información disponible.',
];

const CATEGORIES = [
  { label: 'Restaurantes', icon: Utensils },
  { label: 'Bares y cafés', icon: Coffee },
  { label: 'Hoteles y alojamientos', icon: BedDouble },
  { label: 'Playas', icon: Waves },
  { label: 'Tiendas', icon: ShoppingBag },
  { label: 'Plazas y parques', icon: Trees },
  { label: 'Otros lugares', icon: MapPin },
];

const OWN_PROFILE_FIELDS = [
  'Foto del lugar.',
  'Política sobre mascotas, si el lugar la informó.',
  'Teléfono, WhatsApp, email o sitio web.',
  'Redes sociales.',
  'Calificación promedio y reseñas.',
];

export function PetFriendlyLandingSection({ onRegister }: PetFriendlyLandingSectionProps) {
  useEffect(() => {
    setPageMeta(
      'Lugares Pet Friendly cerca tuyo | AiPetFriendly',
      'Buscá restaurantes, bares, hoteles y otros lugares pet friendly cerca tuyo utilizando tu ubicación o una dirección, y consultá los resultados en mapa y listado con AiPetFriendly.',
    );
  }, []);

  return (
    <section className="space-y-8 pb-6">
      {/* HERO */}
      <div className="rounded-3xl bg-gradient-to-br from-sky-500 to-sky-600 p-6 text-center text-white shadow-md md:p-10">
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
          <MapPin size={28} />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold leading-tight md:text-4xl">
          Encontrá lugares pet friendly cerca tuyo
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-sky-50 md:text-base">
          Buscá restaurantes, bares, hoteles, parques y otros lugares que aceptan mascotas,
          usando tu ubicación o una dirección, y consultá los resultados en mapa y listado.
        </p>
        <div className="mt-6 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          <button
            type="button"
            onClick={onRegister}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-sky-700 shadow transition hover:bg-sky-50 md:text-base"
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
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-sky-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
            <HelpCircle size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Encontrar un lugar que acepte a tu mascota</h2>
            <p className="mt-1 text-sm text-slate-600">
              Salir con tu mascota (a comer, viajar o pasear) suele implicar la duda de si un
              lugar la va a aceptar.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              AiPetFriendly te ayuda a encontrar opciones cerca de donde estés, combinando
              distintas fuentes de información.
            </p>
          </div>
        </div>
      </div>

      {/* COMO FUNCIONA */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-sky-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
            <ListChecks size={20} />
          </span>
          <div className="w-full">
            <h2 className="font-bold text-slate-900">Cómo funciona</h2>
            <ol className="mt-3 space-y-2 text-sm text-slate-700">
              {HOW_IT_WORKS_STEPS.map((step, index) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-xs font-bold text-white">
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
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-sky-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
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
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-sky-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
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
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-sky-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
            <Navigation size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Búsqueda por ubicación o dirección</h2>
            <p className="mt-1 text-sm text-slate-600">
              Podés usar la ubicación de tu dispositivo, o buscar escribiendo una dirección.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              La ubicación se utiliza para esa búsqueda y para calcular distancias, sin quedar
              almacenada de forma permanente.
            </p>
          </div>
        </div>
      </div>

      {/* CATEGORIAS */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-sky-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
            <ListChecks size={20} />
          </span>
          <div className="w-full">
            <h2 className="font-bold text-slate-900">Categorías de lugares</h2>
            <p className="mt-1 text-sm text-slate-600">
              Podés filtrar los resultados por categoría para encontrar más rápido el tipo de
              lugar que buscás.
            </p>
            <ul className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              {CATEGORIES.map(({ label, icon: Icon }) => (
                <li key={label} className="flex items-center gap-2">
                  <Icon size={16} className="shrink-0 text-sky-600" />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* INFORMACION DISPONIBLE SEGUN LA FUENTE */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-sky-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
            <ListChecks size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Información disponible</h2>
            <p className="mt-1 text-sm text-slate-600">
              La información disponible depende del origen del resultado.
            </p>
            <p className="mt-2 text-sm text-slate-600">Para perfiles propios de AiPetFriendly puede existir:</p>
            <ul className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              {OWN_PROFILE_FIELDS.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-sky-600" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-slate-600">
              Para resultados externos (OpenStreetMap o Google Places) puede haber información más
              limitada, como nombre, dirección y distancia.
            </p>
          </div>
        </div>
      </div>

      {/* RESEÑAS Y COMENTARIOS */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-sky-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
            <Star size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Reseñas y comentarios</h2>
            <p className="mt-1 text-sm text-slate-600">
              Los lugares con perfil propio en AiPetFriendly pueden tener calificación y
              comentarios de otros usuarios.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Para dejar una reseña necesitás iniciar sesión con una cuenta; no está disponible en
              modo invitado.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Los resultados que provienen únicamente de OpenStreetMap o Google Places todavía no
              tienen reseñas dentro de AiPetFriendly.
            </p>
          </div>
        </div>
      </div>

      {/* COMUNIDAD */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-sky-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
            <Users size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Comunidad</h2>
            <p className="mt-1 text-sm text-slate-600">
              Los usuarios con cuenta pueden sugerir nuevos lugares y respaldar las sugerencias de
              otros miembros de la comunidad.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Cuando una sugerencia reúne suficientes respaldos, queda disponible para que el
              negocio reclame su perfil.
            </p>
          </div>
        </div>
      </div>

      {/* RECLAMO DE PERFIL COMERCIAL */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-sky-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Reclamo de perfil comercial</h2>
            <p className="mt-1 text-sm text-slate-600">
              Un negocio puede reclamar su perfil y completar información: política sobre
              mascotas, datos de contacto, redes y foto del lugar.
            </p>
          </div>
        </div>
      </div>

      {/* FREE / PREMIUM */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-sky-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
            <Star size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Búsqueda disponible para todos los planes</h2>
            <p className="mt-1 text-sm text-slate-600">
              La búsqueda de lugares pet friendly está disponible independientemente de tu plan.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Los negocios pueden optar por un plan Premium propio para aparecer destacados arriba
              del listado. Este Premium corresponde al negocio y es independiente del plan Premium
              de tu cuenta de usuario.
            </p>
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
              incompletos. Los horarios, teléfonos, políticas sobre mascotas y otros datos pueden
              no estar disponibles o quedar desactualizados. Antes de dirigirte a un lugar,
              conviene confirmar la información directamente.
            </p>
          </div>
        </div>
      </div>

      {/* PRIVACIDAD Y UBICACION */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-sky-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
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
      <div className="rounded-3xl bg-gradient-to-br from-sky-500 to-sky-600 p-6 text-center text-white shadow-md md:p-10">
        <h2 className="text-xl font-extrabold md:text-2xl">Encontrá lugares pet friendly cerca de donde estés</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-sky-50 md:text-base">
          También podés conocer las demás herramientas de AiPetFriendly para el cuidado de tu
          mascota.
        </p>
        <div className="mt-5 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          <button
            type="button"
            onClick={onRegister}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-sky-700 shadow transition hover:bg-sky-50 md:text-base"
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

      <RelatedLinksSection links={[{ href: '/veterinarias', label: 'Veterinarias cerca tuyo' }]} />

      <BlogTeaser />
      <PetGuidesTeaser />

      <PublicFooter />
    </section>
  );
}
