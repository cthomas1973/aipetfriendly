import { useEffect, useMemo } from 'react';
import {
  Brain,
  ChevronLeft,
  HeartPulse,
  PawPrint,
  ShieldAlert,
  Target,
} from 'lucide-react';
import { AdBanner } from './AdBanner';
import {
  PET_GUIDE_CATEGORY_LABELS,
  PET_GUIDES,
  getPetGuideBySlug,
  type PetGuideCategory,
} from '../data/petGuides';

const CATEGORY_ICONS: Record<PetGuideCategory, typeof PawPrint> = {
  adiestramiento: Target,
  ansiedad: Brain,
  conducta: ShieldAlert,
  salud: HeartPulse,
};

const SITE_DESCRIPTION_DEFAULT =
  'AiPetFriendly: consultorio veterinario con IA, agenda de vacunas y desparasitaciones, historial clinico y mapa de veterinarias cercanas. Empeza gratis.';

function setPageMeta(title: string, description: string) {
  document.title = title;
  const metaDescription = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (metaDescription) {
    metaDescription.setAttribute('content', description);
  }
}

function GuidesList() {
  useEffect(() => {
    setPageMeta(
      'Guías y consejos para el cuidado de tu mascota | AiPetFriendly',
      'Guías gratuitas sobre adiestramiento, ansiedad, conducta y salud de perros y gatos, escritas para ayudarte en el día a día con tu mascota.',
    );
  }, []);

  return (
    <section className="space-y-6 pb-6">
      <div className="text-center">
        <a
          href="/"
          className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline"
        >
          <ChevronLeft size={16} /> Volver al inicio
        </a>
        <h1 className="text-2xl font-extrabold text-slate-900 md:text-3xl">
          Guías y consejos para tu mascota
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600 md:text-base">
          Recomendaciones prácticas sobre casos comunes de conducta, adiestramiento, ansiedad y
          salud, escritas para ayudarte en el día a día. Siempre complementan, no reemplazan, la
          consulta con tu veterinario.
        </p>
      </div>

      <AdBanner adSenseSlotId="3333333333" forcePublic />

      <div className="grid gap-4 md:grid-cols-2">
        {PET_GUIDES.map((guide) => {
          const Icon = CATEGORY_ICONS[guide.category];
          return (
            <a
              key={guide.slug}
              href={`/guias/${guide.slug}`}
              className="block rounded-2xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 transition hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <Icon size={18} />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                    {PET_GUIDE_CATEGORY_LABELS[guide.category]} · {guide.readingTime}
                  </p>
                  <h2 className="mt-1 font-bold text-slate-900">{guide.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">{guide.summary}</p>
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}

function GuideDetail({ slug }: { slug: string }) {
  const guide = useMemo(() => getPetGuideBySlug(slug), [slug]);

  useEffect(() => {
    if (guide) {
      setPageMeta(`${guide.title} | AiPetFriendly`, guide.summary);
    } else {
      setPageMeta('Guía no encontrada | AiPetFriendly', SITE_DESCRIPTION_DEFAULT);
    }
  }, [guide]);

  if (!guide) {
    return (
      <section className="space-y-4 pb-6 text-center">
        <p className="text-sm text-slate-600">No encontramos esta guía.</p>
        <a href="/guias" className="text-sm font-semibold text-emerald-700 hover:underline">
          Ver todas las guías
        </a>
      </section>
    );
  }

  const Icon = CATEGORY_ICONS[guide.category];

  return (
    <section className="space-y-6 pb-6">
      <a
        href="/guias"
        className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline"
      >
        <ChevronLeft size={16} /> Todas las guías
      </a>

      <header>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-600">
          <Icon size={16} />
          {PET_GUIDE_CATEGORY_LABELS[guide.category]} · {guide.readingTime} de lectura
        </div>
        <h1 className="mt-2 text-2xl font-extrabold text-slate-900 md:text-3xl">{guide.title}</h1>
        <p className="mt-2 text-sm text-slate-600 md:text-base">{guide.summary}</p>
      </header>

      <AdBanner adSenseSlotId="3333333333" forcePublic />

      <article className="space-y-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        {guide.sections.map((section) => (
          <div key={section.heading}>
            <h2 className="font-bold text-slate-900">{section.heading}</h2>
            {section.paragraphs.map((paragraph, index) => (
              <p key={index} className="mt-2 text-sm leading-relaxed text-slate-700 md:text-base">
                {paragraph}
              </p>
            ))}
          </div>
        ))}
      </article>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Esta guía es orientativa y no reemplaza una consulta veterinaria. Ante dudas puntuales
        sobre la salud de tu mascota, consultá con un profesional o usá el consultorio de IA de
        AiPetFriendly como primera orientación.
      </div>

      <AdBanner adSenseSlotId="4444444444" forcePublic />
    </section>
  );
}

export function PetGuidesSection({ slug }: { slug?: string }) {
  if (slug) {
    return <GuideDetail slug={slug} />;
  }
  return <GuidesList />;
}
