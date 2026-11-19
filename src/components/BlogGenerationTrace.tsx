import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchAdminBlogGenerationRunDetail } from '../lib/supabase';
import type { BlogCandidatePoolRow, BlogGenerationRun, BlogGenerationRunDetail } from '../types';

const SPECIES_LABELS: Record<string, string> = { dog: 'Perros', cat: 'Gatos', rabbit: 'Conejos', other: 'Otras especies' };
const OUTCOME_LABELS: Record<string, string> = {
  selected: 'Seleccionado', source_failed: 'Fuente no verificable', policy_rejected: 'Descartado por política',
  content_rejected: 'Borrador rechazado', semantic_unavailable: 'Revisión semántica no disponible',
};
const REASON_LABELS: Record<string, string> = {
  http_403: 'La fuente rechazó el acceso (403)', http_404: 'La página no existe (404)', http_429: 'La fuente limitó las solicitudes (429)',
  http_5xx: 'Error del servidor de la fuente', http_error: 'Respuesta HTTP inesperada', timeout: 'Tiempo de espera agotado', dns: 'No se pudo resolver el dominio',
  connection: 'Error de conexión', redirect_unauthorized: 'Redirige a un dominio no autorizado', redirect_path_not_allowed: 'Redirige a una ruta no permitida',
  insufficient_content: 'Sin contenido principal suficiente', too_large: 'Página demasiado grande', unsupported_content: 'No es una página HTML',
  domain_not_allowed: 'Dominio fuera del registro', path_not_allowed: 'Ruta fuera de la lista permitida', topic_not_supported: 'La fuente no respalda el tema',
  vet_validation: 'Requiere validación veterinaria', semantic_rejected: 'Descartado por la revisión semántica', duplicate_topic: 'Tema ya cubierto',
  content_rejected: 'El borrador incluyó contenido clínico', quality_failed: 'El borrador no superó los controles', semantic_unavailable: 'Clasificador no disponible',
};

export const reasonLabel = (code?: string) => (code && REASON_LABELS[code]) || code || '';

export function BlogRunTrace({ run }: { run: BlogGenerationRun }) {
  const [detail, setDetail] = useState<BlogGenerationRunDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selection = run.selection;
  const search = run.payload.search;
  if (!selection && !search && !run.species) return null;

  const selected = selection?.selected;
  const discarded = search?.discarded?.length ?? 0;
  const loadAttempts = async () => {
    try {
      setLoading(true);
      setError(null);
      setDetail(await fetchAdminBlogGenerationRunDetail(run.id));
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo cargar el detalle de la búsqueda.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600" data-testid="blog-run-trace">
      <p className="font-semibold text-slate-700">Búsqueda editorial</p>
      <ul className="mt-1 space-y-0.5">
        {run.species && <li>Especie: {SPECIES_LABELS[run.species] || run.species}</li>}
        {selected?.title && <li>Tema: {selected.title}{selected.category ? ` · ${selected.category}` : ''}</li>}
        {selected?.url && <li className="break-all">Fuente: <a className="text-emerald-700 underline" href={selected.url} target="_blank" rel="noreferrer">{selected.url}</a></li>}
        <li>Etapa de búsqueda: {selection?.phase === 'draft' ? 'redacción' : 'selección'}</li>
        <li>Alternativas probadas: {selection?.alternatives_tried ?? search?.verifications ?? 0} · Descartados: {discarded} · Pulsos: {selection?.pulses ?? search?.pulses ?? 0}</li>
      </ul>
      {search?.discarded && search.discarded.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {search.discarded.map((item, index) => (
            <li key={`${item.url}-${index}`} className="break-all">• {item.title || item.url} — <span className="font-semibold text-amber-800">{reasonLabel(item.code)}</span></li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => void loadAttempts()} disabled={loading}
        className="mt-2 inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 font-semibold text-slate-700 disabled:opacity-60">
        {loading && <Loader2 size={12} className="animate-spin" />} Ver intentos
      </button>
      {error && <p className="mt-2 text-red-700">{error}</p>}
      {detail && (
        <div className="mt-2 space-y-1">
          {detail.postId && <p className="font-semibold text-emerald-800">Artículo generado: {detail.postId}</p>}
          {detail.attempts.length === 0 && <p>Sin intentos registrados.</p>}
          {detail.attempts.map((attempt) => (
            <p key={attempt.id} className="break-all rounded-lg bg-white p-2">
              <span className="font-semibold">{OUTCOME_LABELS[attempt.outcome] || attempt.outcome}</span>
              {attempt.reasonCode && <> · {reasonLabel(attempt.reasonCode)}</>}
              {attempt.httpStatus ? <> · HTTP {attempt.httpStatus}</> : null}
              <br />{attempt.species ? `${SPECIES_LABELS[attempt.species] || attempt.species} · ` : ''}{attempt.sourceId} · {attempt.title || attempt.url}
              <br /><span className="text-slate-400">{attempt.url}</span>
              {attempt.detail && <><br /><span>{attempt.detail}</span></>}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function BlogCandidatePoolSummary({ rows }: { rows: BlogCandidatePoolRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600" data-testid="blog-candidate-pool">
      <p className="font-semibold text-slate-700">Candidatos disponibles por fuente</p>
      <ul className="mt-1 space-y-0.5">
        {rows.map((row) => (
          <li key={`${row.sourceId}-${row.species}`}>{row.sourceId} · {SPECIES_LABELS[row.species] || row.species}: {row.eligible} aptos de {row.total} · {row.used} usados · {row.discarded} descartados</li>
        ))}
      </ul>
    </div>
  );
}
