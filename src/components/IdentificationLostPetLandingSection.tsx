import { useEffect } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  Eye,
  FileText,
  HelpCircle,
  ListChecks,
  MapPin,
  QrCode,
  ShieldCheck,
  Sparkles,
  Tag,
} from 'lucide-react';
import { BlogTeaser } from './BlogTeaser';
import { PetGuidesTeaser } from './PetGuidesTeaser';
import { PublicFooter } from './PublicLegalPages';

interface IdentificationLostPetLandingSectionProps {
  onRegister: () => void;
}

// Mismo patron que HowItWorksSection.tsx/ClinicalHistoryLandingSection.tsx/RemindersLandingSection.tsx/
// FoodWeightLandingSection.tsx/AIAssistantLandingSection.tsx: cada pagina publica actualiza su propio
// title/description para que buscadores y el crawler de AdSense vean contenido distinto por URL.
function setPageMeta(title: string, description: string) {
  document.title = title;
  const metaDescription = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (metaDescription) {
    metaDescription.setAttribute('content', description);
  }
}

const HOW_IT_WORKS_STEPS = [
  'Identificás a tu mascota.',
  'El QR permite acceder a su perfil público.',
  'Quien la encuentra puede enviar un aviso.',
  'Vos recibís el mensaje y, si compartió ubicación, podés consultar dónde fue encontrada.',
];

const PUBLIC_FIELDS = ['Nombre.', 'Especie.', 'Raza.', 'Foto.'];

const PRIVATE_FIELDS = [
  'Teléfono.',
  'Email.',
  'Dirección.',
  'Historial clínico.',
  'Vacunas.',
  'Medicación.',
];

const FREE_FEATURES = [
  'Perfil público de identificación.',
  'Recibir mensajes de quien encuentra a tu mascota.',
  'Vincular y desvincular una chapita con código QR.',
  'Recibir la ubicación del hallazgo, si fue compartida.',
  'Mecanismo de contacto sin exponer tu teléfono ni tu email.',
];

const PREMIUM_FEATURES = [
  'Todo lo incluido en el plan gratuito.',
  'Generación del cartel de búsqueda en PDF.',
  'Generación y compartición del cartel de búsqueda como imagen.',
];

export function IdentificationLostPetLandingSection({ onRegister }: IdentificationLostPetLandingSectionProps) {
  useEffect(() => {
    setPageMeta(
      'Identificación QR y mascota perdida | AiPetFriendly',
      'Identificá a tu mascota con un QR y facilitá que puedan avisarte si la encuentran, sin exponer públicamente tu teléfono ni email.',
    );
  }, []);

  return (
    <section className="space-y-8 pb-6">
      {/* HERO */}
      <div className="rounded-3xl bg-gradient-to-br from-amber-500 to-amber-600 p-6 text-center text-white shadow-md md:p-10">
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
          <QrCode size={28} />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold leading-tight md:text-4xl">
          Identificá a tu mascota y facilitá que puedan avisarte si se pierde
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-amber-50 md:text-base">
          Con un QR asociado a tu mascota, quien la encuentre puede acceder a un perfil público y
          enviarte un aviso sin conocer tu teléfono ni tu email.
        </p>
        <div className="mt-6 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          <button
            type="button"
            onClick={onRegister}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-amber-700 shadow transition hover:bg-amber-50 md:text-base"
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

      {/* EL PROBLEMA */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-amber-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <HelpCircle size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">¿Qué pasa si alguien encuentra a tu mascota?</h2>
            <p className="mt-1 text-sm text-slate-600">
              Muchas veces, quien encuentra una mascota no tiene forma de saber cómo contactar a
              su responsable.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              AiPetFriendly permite facilitar ese contacto mediante un perfil público asociado a un
              código de identificación.
            </p>
          </div>
        </div>
      </div>

      {/* COMO FUNCIONA */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-amber-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <ListChecks size={20} />
          </span>
          <div className="w-full">
            <h2 className="font-bold text-slate-900">Cómo funciona</h2>
            <ol className="mt-3 space-y-2 text-sm text-slate-700">
              {HOW_IT_WORKS_STEPS.map((step, index) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-600 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-sm text-slate-600">
              No se necesita una cuenta para enviar el aviso.
            </p>
          </div>
        </div>
      </div>

      {/* QUE VE QUIEN ENCUENTRA A LA MASCOTA */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-amber-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <Eye size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Qué ve quien encuentra a tu mascota</h2>
            <p className="mt-1 text-sm text-slate-600">El perfil público puede mostrar:</p>
            <ul className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              {PUBLIC_FIELDS.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-amber-600" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-slate-600">
              No mostramos públicamente el teléfono, email, dirección, historial clínico ni
              medicamentos de tu mascota.
            </p>
          </div>
        </div>
      </div>

      {/* CONTACTO SIN EXPONER TUS DATOS */}
      <div className="rounded-3xl bg-amber-50 p-5 shadow-sm ring-1 ring-amber-200 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">
              Podés recibir un aviso sin publicar tus datos de contacto
            </h2>
            <p className="mt-1 text-sm text-slate-700">
              La persona que encuentra a tu mascota puede dejar un mensaje y un dato de contacto.
              El sistema envía el aviso al responsable sin mostrarle al finder el teléfono o email
              del dueño.
            </p>
          </div>
        </div>
      </div>

      {/* UBICACION DEL HALLAZGO */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-amber-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <MapPin size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Ubicación del hallazgo</h2>
            <p className="mt-1 text-sm text-slate-600">
              Quien encuentra a tu mascota puede compartir su ubicación desde el navegador, si
              decide autorizarla.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              La ubicación es opcional y solo queda disponible para el responsable de la mascota.
            </p>
          </div>
        </div>
      </div>

      {/* CARTEL DE BUSQUEDA */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-amber-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <FileText size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Generá un cartel de búsqueda con QR</h2>
            <p className="mt-1 text-sm text-slate-600">Con Premium podés generar un cartel en:</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li className="flex items-start gap-2">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-amber-600" />
                PDF, en un formato pensado para imprimir.
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-amber-600" />
                Imagen, en un formato que puede compartirse.
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-amber-600" />
                Con el QR de identificación asociado a tu mascota.
              </li>
            </ul>
            <p className="mt-3 text-sm text-slate-600">
              El cartel puede incluir, si el responsable decide completarlos: fecha de extravío,
              lugar, señas particulares, un mensaje adicional y un teléfono de contacto.
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-700">
              El teléfono que aparece en el cartel es opcional y lo decide el responsable.
            </p>
          </div>
        </div>
      </div>

      {/* IDENTIFICACION PERMANENTE */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-amber-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <QrCode size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Identificación permanente</h2>
            <p className="mt-1 text-sm text-slate-600">
              El QR no sirve únicamente para un cartel de búsqueda. El perfil de identificación
              puede utilizarse como mecanismo permanente para facilitar el contacto si alguien
              encuentra a tu mascota, en cualquier momento.
            </p>
          </div>
        </div>
      </div>

      {/* CHAPITA CON QR */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-amber-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <Tag size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Chapita con QR</h2>
            <p className="mt-1 text-sm text-slate-600">
              El sistema también contempla la identificación mediante una chapita con código QR,
              vinculada al perfil de tu mascota.
            </p>
          </div>
        </div>
      </div>

      {/* FREE / PREMIUM */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-amber-100 md:p-6">
        <h2 className="font-bold text-slate-900">Free y Premium</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
            <h3 className="font-semibold text-slate-800">Plan gratuito</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {FREE_FEATURES.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-amber-600" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
            <h3 className="font-semibold text-slate-800">Premium</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {PREMIUM_FEATURES.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-amber-600" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* PRIVACIDAD */}
      <div className="rounded-3xl bg-amber-50 p-5 shadow-sm ring-1 ring-amber-200 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <ShieldCheck size={20} />
          </span>
          <div className="w-full">
            <h2 className="font-bold text-slate-900">¿Qué información queda pública?</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm font-semibold text-slate-800">Pública</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {PUBLIC_FIELDS.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">No pública</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {PRIVATE_FIELDS.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SEGURIDAD */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-amber-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Seguridad</h2>
            <p className="mt-1 text-sm text-slate-600">
              El contacto se realiza mediante un mecanismo intermedio para evitar exponer
              directamente los datos del responsable.
            </p>
          </div>
        </div>
      </div>

      {/* EJEMPLO DE USO */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-amber-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <Sparkles size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Alguien encuentra a tu mascota</h2>
            <p className="mt-1 text-sm text-slate-600">
              Encuentra a tu mascota y escanea el QR → ve su perfil básico → deja un mensaje →
              puede compartir su ubicación → vos recibís el aviso.
            </p>
          </div>
        </div>
      </div>

      {/* USO RESPONSABLE */}
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-amber-100 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-900">Uso responsable</h2>
            <p className="mt-1 text-sm text-slate-600">
              El sistema facilita el contacto, pero no garantiza que una mascota perdida sea
              encontrada. Su objetivo es aumentar las posibilidades de comunicación entre quien
              encuentra una mascota y su responsable.
            </p>
          </div>
        </div>
      </div>

      {/* CTA FINAL */}
      <div className="rounded-3xl bg-gradient-to-br from-amber-500 to-amber-600 p-6 text-center text-white shadow-md md:p-10">
        <h2 className="text-xl font-extrabold md:text-2xl">Identificá a tu mascota hoy</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-amber-50 md:text-base">
          Creá tu cuenta gratis: AiPetFriendly reúne esta función junto con el resto de las
          herramientas de cuidado de tu mascota.
        </p>
        <div className="mt-5 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          <button
            type="button"
            onClick={onRegister}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-amber-700 shadow transition hover:bg-amber-50 md:text-base"
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
