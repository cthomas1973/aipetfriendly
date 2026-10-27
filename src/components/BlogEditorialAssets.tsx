import type { BlogEditorialMetadata } from '../types';

export function BlogEditorialAssets({ metadata }: { metadata?: BlogEditorialMetadata }) {
  if (!metadata) return null;
  const sources = metadata.sources?.filter((source) => source.url.startsWith('https://')) || [];
  return (
    <div className="space-y-5">
      {metadata.infographic_url?.startsWith('https://') && (
        <figure className="mx-auto max-w-xl">
          <a href={metadata.infographic_url} target="_blank" rel="noopener noreferrer" aria-label="Abrir infografía completa">
            <img src={metadata.infographic_url} alt={metadata.infographic_alt || 'Resumen visual del artículo'}
              loading="lazy" width={1080} height={1350} className="h-auto w-full rounded-lg" />
          </a>
          <figcaption className="mt-2 text-sm text-slate-600">{metadata.infographic_caption}</figcaption>
        </figure>
      )}
      {sources.length > 0 && (
        <aside className="border-t border-slate-200 pt-4">
          <h2 className="font-bold text-slate-900">Fuentes consultadas</h2>
          <ul className="mt-2 space-y-2 text-sm text-slate-600">
            {sources.map((source) => (
              <li key={source.id}>
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline">{source.title}</a>
                <span> · {source.organization} · Consulta: {source.consulted_at.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}