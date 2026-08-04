import { ArrowRight } from 'lucide-react';
import { getRecentGuides, isRecentlyPublished } from '../data/petGuides';

interface PetGuidesTeaserProps {
  title?: string;
  count?: number;
  className?: string;
}

export function PetGuidesTeaser({
  title = 'Guías y consejos gratuitos',
  count = 5,
  className = '',
}: PetGuidesTeaserProps) {
  const guides = getRecentGuides(count);

  if (guides.length === 0) {
    return null;
  }

  return (
    <div className={`rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6 ${className}`}>
      <h2 className="font-bold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">
        Recomendaciones sobre adiestramiento, ansiedad y conducta, con novedades cada semana.
      </p>
      <ul className="mt-3 space-y-2">
        {guides.map((guide) => (
          <li key={guide.slug}>
            <a
              href={`/guias/${guide.slug}`}
              className="flex items-start gap-2 text-sm font-semibold text-emerald-700 hover:underline"
            >
              <span>{guide.title}</span>
              {isRecentlyPublished(guide.publishedAt) && (
                <span className="mt-0.5 flex-shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                  Nuevo
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
      <a
        href="/guias"
        className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-emerald-700 hover:underline"
      >
        Ver todas las guías <ArrowRight size={14} />
      </a>
    </div>
  );
}
