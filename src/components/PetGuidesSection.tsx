import { useEffect, useMemo, useState } from 'react';
import {
  Brain,
  ChevronLeft,
  HeartPulse,
  PawPrint,
  ShieldAlert,
  Target,
} from 'lucide-react';
import { AdBanner } from './AdBanner';
import { useAppState } from '../context/AppStateContext';
import {
  PET_GUIDE_CATEGORY_LABELS,
  PET_GUIDE_TYPE_LABELS,
  filterGuides,
  getEffectiveReleaseDateIso,
  getEffectiveReleaseDateLabel,
  getGuidesSortedByDate,
  getPetGuideBySlug,
  isGuidePublished,
  isRecentlyPublished,
  type PetGuideCategory,
  type PetGuidePetType,
} from '../data/petGuides';
import { PublicFooter } from './PublicLegalPages';

const CATEGORY_ICONS: Record<PetGuideCategory, typeof PawPrint> = {
  adiestramiento: Target,
  ansiedad: Brain,
  conducta: ShieldAlert,
  salud: HeartPulse,
};

const CATEGORY_FILTERS: Array<{ value: PetGuideCategory | 'todas'; label: string }> = [
  { value: 'todas', label: 'Todas' },
  { value: 'adiestramiento', label: PET_GUIDE_CATEGORY_LABELS.adiestramiento },
  { value: 'ansiedad', label: PET_GUIDE_CATEGORY_LABELS.ansiedad },
  { value: 'conducta', label: PET_GUIDE_CATEGORY_LABELS.conducta },
  { value: 'salud', label: PET_GUIDE_CATEGORY_LABELS.salud },
];

const PET_TYPE_FILTERS: Array<{ value: PetGuidePetType | 'todas'; label: string }> = [
  { value: 'todas', label: 'Todas' },
  { value: 'perro', label: PET_GUIDE_TYPE_LABELS.perro },
  { value: 'gato', label: PET_GUIDE_TYPE_LABELS.gato },
];

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
  const { user } = useAppState();
  const isAdmin = Boolean(user?.isAdmin);
  const [category, setCategory] = useState<PetGuideCategory | 'todas'>('todas');
  const [petType, setPetType] = useState<PetGuidePetType | 'todas'>('todas');

  useEffect(() => {
    setPageMeta(
      'Guías y consejos para el cuidado de tu mascota | AiPetFriendly',
      'Guías gratuitas sobre adiestramiento, ansiedad, conducta y salud de perros y gatos, escritas para ayudarte en el día a día con tu mascota.',
    );
  }, []);

  const guides = useMemo(
    () => filterGuides(getGuidesSortedByDate(isAdmin), { category, petType }),
    [category, petType, isAdmin],
  );

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

      <AdBanner adSenseSlotId="5896439448" forcePublic />

      <div className="space-y-2">
        <div className="flex flex-wrap justify-center gap-1.5">
          {CATEGORY_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setCategory(filter.value)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                category === filter.value
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white text-slate-600 ring-1 ring-emerald-100 hover:bg-emerald-50'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          {PET_TYPE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setPetType(filter.value)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                petType === filter.value
                  ? 'bg-slate-800 text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {guides.length === 0 ? (
        <p className="text-center text-sm text-slate-500">
          No hay guías todavía para este filtro. Probá con otra combinación.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {guides.map((guide) => {
            const Icon = CATEGORY_ICONS[guide.category];
            return (
              <a
                key={guide.slug}
                href={`/guias/${guide.slug}`}
                className="block overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-emerald-100 transition hover:shadow-md"
              >
                {guide.coverImage && (
                  <img
                    src={guide.coverImage.src}
                    alt={guide.coverImage.alt}
                    loading="lazy"
                    className="h-36 w-full object-cover"
                  />
                )}
                <div className="flex items-start gap-3 p-5">
                  <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <Icon size={18} />
                  </span>
                  <div>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-600">
                      {PET_GUIDE_CATEGORY_LABELS[guide.category]} · {guide.readingTime}
                      {isRecentlyPublished(getEffectiveReleaseDateIso(guide.slug)) && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          Nuevo
                        </span>
                      )}
                      {isAdmin && !isGuidePublished(guide.slug) && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          En espera · se publica el {getEffectiveReleaseDateLabel(guide.slug)}
                        </span>
                      )}
                    </p>
                    <h2 className="mt-1 font-bold text-slate-900">{guide.title}</h2>
                    <p className="mt-1 text-sm text-slate-600">{guide.summary}</p>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}

      <PublicFooter />
    </section>
  );
}

function GuideDetail({ slug }: { slug: string }) {
  const { user } = useAppState();
  const isAdmin = Boolean(user?.isAdmin);
  const guide = useMemo(() => getPetGuideBySlug(slug, isAdmin), [slug, isAdmin]);

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
  const isPublished = isGuidePublished(guide.slug);

  return (
    <section className="space-y-6 pb-6">
      <a
        href="/guias"
        className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline"
      >
        <ChevronLeft size={16} /> Todas las guías
      </a>

      {isAdmin && !isPublished && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Vista previa de administrador: esta guía todavía está en espera y se publicará
          automáticamente para el resto de los usuarios el {getEffectiveReleaseDateLabel(guide.slug)}.
        </div>
      )}

      <header>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-600">
          <Icon size={16} />
          {PET_GUIDE_CATEGORY_LABELS[guide.category]} · {guide.readingTime} de lectura
          {isRecentlyPublished(getEffectiveReleaseDateIso(guide.slug)) && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              Nuevo
            </span>
          )}
          {guide.petTypes.map((petType) => (
            <span
              key={petType}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal text-slate-600"
            >
              {PET_GUIDE_TYPE_LABELS[petType]}
            </span>
          ))}
        </div>
        <h1 className="mt-2 text-2xl font-extrabold text-slate-900 md:text-3xl">{guide.title}</h1>
        <p className="mt-2 text-sm text-slate-600 md:text-base">{guide.summary}</p>
      </header>

      {guide.coverImage && (
        <img
          src={guide.coverImage.src}
          alt={guide.coverImage.alt}
          loading="lazy"
          className="max-h-80 w-full rounded-2xl object-cover"
        />
      )}

      <AdBanner adSenseSlotId="5896439448" forcePublic />

      <article className="space-y-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        {guide.sections.map((section) => (
          <div key={section.heading}>
            <h2 className="font-bold text-slate-900">{section.heading}</h2>
            {section.paragraphs.map((paragraph, index) => (
              <p key={index} className="mt-2 text-sm leading-relaxed text-slate-700 md:text-base">
                {paragraph}
              </p>
            ))}
            {section.image && (
              <img
                src={section.image.src}
                alt={section.image.alt}
                loading="lazy"
                className="mt-3 max-h-72 w-full rounded-xl object-cover"
              />
            )}
          </div>
        ))}
      </article>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Esta guía es orientativa y no reemplaza una consulta veterinaria. Ante dudas puntuales
        sobre la salud de tu mascota, consultá con un profesional o usá el consultorio de IA de
        AiPetFriendly como primera orientación.
      </div>

      <AdBanner adSenseSlotId="8331031096" forcePublic />

      <PublicFooter />
    </section>
  );
}

export function PetGuidesSection({ slug }: { slug?: string }) {
  if (slug) {
    return <GuideDetail slug={slug} />;
  }
  return <GuidesList />;
}
