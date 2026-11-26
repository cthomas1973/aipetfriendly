import type { ReactNode } from 'react';
import { Brain, HeartPulse, ShieldAlert, Target } from 'lucide-react';
import { PET_GUIDE_CATEGORY_LABELS, PET_GUIDE_TYPE_LABELS, type PetGuide } from '../data/petGuides';

export function PetGuideContent({ guide, mobile = false, badge, beforeArticle, afterReferences }: {
  guide: PetGuide;
  mobile?: boolean;
  badge?: ReactNode;
  beforeArticle?: ReactNode;
  afterReferences?: ReactNode;
}) {
  const Icon = { adiestramiento: Target, ansiedad: Brain, conducta: ShieldAlert, salud: HeartPulse }[guide.category];
  return (
    <>
      <header>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-600">
          <Icon size={16} />
          {PET_GUIDE_CATEGORY_LABELS[guide.category]} · {guide.readingTime} de lectura
          {badge}
          {guide.petTypes.map((petType) => (
            <span key={petType} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal text-slate-600">
              {PET_GUIDE_TYPE_LABELS[petType]}
            </span>
          ))}
        </div>
        <h1 className={`mt-2 font-extrabold text-slate-900 ${mobile ? 'text-2xl' : 'text-2xl md:text-3xl'}`}>{guide.title}</h1>
        <p className={`mt-2 text-slate-600 ${mobile ? 'text-sm' : 'text-sm md:text-base'}`}>{guide.summary}</p>
      </header>
      {guide.coverImage && (
        <img src={guide.coverImage.src} alt={guide.coverImage.alt} loading="lazy"
          className="max-h-[32rem] w-full rounded-2xl bg-slate-100 object-contain" />
      )}
      {beforeArticle}
      <article className={`space-y-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 ${mobile ? '' : 'md:p-6'}`}>
        {guide.sections.map((section, sectionIndex) => {
          const image = section.image && (
            <img src={section.image.src} alt={section.image.alt} loading="lazy"
              className="mt-3 max-h-[28rem] w-full rounded-xl bg-slate-100 object-contain" />
          );
          return (
            <div key={sectionIndex}>
              <h2 className="font-bold text-slate-900">{section.heading}</h2>
              {section.imagePosition === 'before' && image}
              {section.paragraphs.map((paragraph, index) => (
                <p key={index} className={`mt-2 leading-relaxed text-slate-700 ${mobile ? 'text-sm' : 'text-sm md:text-base'}`}>{paragraph}</p>
              ))}
              {section.imagePosition !== 'before' && image}
            </div>
          );
        })}
      </article>
      {guide.references && guide.references.length > 0 && (
        <aside className="space-y-2 border-t border-slate-200 pt-4" aria-label="Fuentes consultadas">
          <h2 className="text-sm font-bold text-slate-800">Fuentes consultadas</h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-slate-600">
            {guide.references.map((reference, index) => (
              <li key={index}>
                <a href={reference.url} target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline">{reference.label}</a>
              </li>
            ))}
          </ul>
        </aside>
      )}
      {afterReferences}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Esta guía es orientativa y no reemplaza una consulta veterinaria. Ante dudas puntuales
        sobre la salud de tu mascota, consultá con un profesional o usá el consultorio de IA de
        AiPetFriendly como primera orientación.
      </div>
    </>
  );
}
