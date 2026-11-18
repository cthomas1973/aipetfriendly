import { useCallback, useEffect, useState } from 'react';
import { useAppState, useSessionGuard } from '../context/AppStateContext';
import { fetchAdminShopRadar, reviewAdminShopRadar } from '../lib/supabase';
import { isShopResearchRecord } from '../../supabase/functions/_shared/shopResearchRecord.mjs';
import type { ShopRadarCandidate, ShopRadarDashboard, ShopResearchRecord } from '../types';

const button = 'rounded-xl bg-emerald-100 px-3 py-2 text-sm font-semibold disabled:opacity-50';
const field = 'w-full rounded-xl border border-slate-200 p-2 text-sm';
const date = (value: string | null) => value ? new Date(value).toLocaleString('es-AR') : 'No informado';

export function AdminShopRadarSection() {
  const { user } = useAppState();
  const guard = useSessionGuard(user?.id);
  const [dashboard, setDashboard] = useState<ShopRadarDashboard>({ candidates: [], runs: [] });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<ShopRadarCandidate | null>(null);
  const [reason, setReason] = useState('');
  const [until, setUntil] = useState('');
  const [record, setRecord] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const [offset, setOffset] = useState(0);
  const load = useCallback(async () => {
    guard();
    if (!user?.isAdmin) { setError('Acceso exclusivo de administracion.'); return; }
    setBusy(true); setError(null);
    try { const data = await fetchAdminShopRadar(offset); guard(); setDashboard(data); }
    catch (e) { guard(); setError(e instanceof Error ? e.message : 'No se pudo cargar el Radar.'); }
    finally { guard(); setBusy(false); }
  }, [guard, offset, user?.isAdmin]);
  useEffect(() => {
    setDashboard({ candidates: [], runs: [] }); setSelected(null); setReason(''); setRecord(''); setMessage(null);
    void load();
  }, [load]);
  const choose = (candidate: ShopRadarCandidate) => {
    setSelected(candidate); setReason(''); setUntil(''); setError(null); setMessage(null);
    setRecord(JSON.stringify(candidate.research_record, null, 2));
  };
  // Descarte rapido desde el listado: no borra la fila (el Radar la volveria a
  // detectar), la marca como rechazada con motivo y rastro; queda oculta salvo
  // que se active "Mostrar resueltos".
  const discard = useCallback(async (candidate: ShopRadarCandidate) => {
    const label = candidate.research_record && 'title' in candidate.research_record && candidate.research_record.title
      ? candidate.research_record.title
      : candidate.mla_id || candidate.catalog_product_id || 'este candidato';
    if (!window.confirm(`¿Descartar "${label}"? Dejará de aparecer en el listado y el Radar no volverá a proponerlo.`)) return;
    guard(); setError(null); setMessage(null);
    try {
      setBusy(true);
      await reviewAdminShopRadar(candidate.id, 'reject', 'Descartado desde el listado del Radar: no interesa para la tienda.');
      guard();
      if (selected?.id === candidate.id) { setSelected(null); setRecord(''); setReason(''); }
      setMessage('Candidato descartado. Podés verlo con "Mostrar resueltos".');
      await load();
    } catch (e) { guard(); setError(e instanceof Error ? e.message : 'No se pudo descartar el candidato.'); }
    finally { guard(); setBusy(false); }
  }, [guard, load, selected?.id]);
  const decide = useCallback(async (action: 'approve'|'publish'|'reject'|'postpone'|'revise'|'retry') => {
    if (!selected) return;
    guard(); setError(null); setMessage(null);
    let research: ShopResearchRecord | undefined;
    try {
      if (action==='revise') {
        const parsed: unknown = JSON.parse(record);
        if (!isShopResearchRecord(parsed)) throw new Error('Ficha invalida: cada atributo conocido necesita fuente y fecha.');
        research = parsed;
      }
      if (action==='postpone' && (!until || !Number.isFinite(Date.parse(until)) || Date.parse(until)<=Date.now())) {
        throw new Error('Selecciona una fecha futura para posponer.');
      }
      setBusy(true);
      await reviewAdminShopRadar(selected.id, action, reason, research, action==='postpone' ? new Date(until).toISOString() : undefined);
      guard(); setSelected(null); setRecord(''); setReason('');
      setMessage('Decision registrada con trazabilidad.');
      await load();
    } catch (e) { guard(); setError(e instanceof Error ? e.message : 'No se pudo guardar la decision.'); }
    finally { guard(); setBusy(false); }
  }, [guard, load, reason, record, selected, until]);
  if (!user?.isAdmin) return <p role="alert">Acceso exclusivo de administracion.</p>;
  const resolved = selected && (selected.review_status === 'rejected' || Boolean(selected.duplicate_product_id));
  const research = selected && isShopResearchRecord(selected.research_record) ? selected.research_record : null;
  return <section className="space-y-4" aria-label="Radar de productos">
    <h3 className="text-xl font-bold">Radar de productos globales</h3>
    <p className="text-sm">La aprobacion de investigacion no publica. Publicar requiere otra decision administrativa.</p>
    <button className={button} disabled={busy} onClick={() => void load()}>Actualizar Radar</button>
    <label className="ml-3 text-sm"><input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} /> Mostrar resueltos</label>
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!!dashboard.runs.length && <details><summary>Ultimas ejecuciones y limitaciones oficiales</summary>
      {dashboard.runs.map(run => <p key={run.id}>{run.run_day}: {run.detected_count}/5 candidatos · {run.finished_at ? 'Finalizada' : 'En curso o interrumpida'} · {run.limitations.join('; ') || 'Sin limitaciones registradas'}</p>)}
    </details>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead><tr><th>Deteccion</th><th>Producto/publicacion</th><th>Categoria</th><th>Posicion oficial</th><th>Investigacion</th><th>Duplicacion</th><th>Decision</th><th>Accion</th></tr></thead>
      <tbody>{dashboard.candidates.filter(c => showResolved || (c.review_status !== 'rejected' && !c.duplicate_product_id)).map(c => <tr key={c.id}>
        <td className="p-2">{date(c.detected_at)}</td><td>{'title' in c.research_record ? c.research_record.title : c.mla_id || c.catalog_product_id}<br />{c.mla_id || 'Publicacion no resuelta'} · {c.catalog_product_id || 'Sin catalogo ML'}</td>
        <td>{c.category_name} ({c.category_id})</td><td>{c.ranking_position ?? 'No informado'}</td><td>{c.research_status}</td>
        <td>{c.duplicate_product_id ? 'Ya incorporado / duplicado global' : 'Sin duplicado global registrado'}</td>
        <td>{c.review_status}<br />{c.decision_reason}</td>
        <td><div className="flex flex-wrap gap-1">
          <button className={button} onClick={() => choose(c)}>Revisar {c.mla_id || c.catalog_product_id}</button>
          {['pending','postponed'].includes(c.review_status) && !c.duplicate_product_id && (
            <button className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50" disabled={busy}
              aria-label={`Descartar ${c.mla_id || c.catalog_product_id}`} onClick={() => void discard(c)}>Descartar</button>
          )}
        </div></td>
      </tr>)}</tbody>
    </table></div>
    <div className="flex gap-2">
      <button className={button} disabled={busy || !offset} onClick={()=>setOffset(value=>Math.max(0,value-100))}>Pagina anterior</button>
      <button className={button} disabled={busy || offset+100>=(dashboard.total ?? dashboard.candidates.length)} onClick={()=>setOffset(value=>value+100)}>Pagina siguiente</button>
    </div>
    {!dashboard.candidates.length && !busy && <p>Sin detecciones. Radar deshabilitado o pendiente de activar 072 y fuentes oficiales.</p>}
    {selected && <section className="space-y-3 rounded-2xl border p-3" aria-label="Revision del candidato">
      <h4 className="font-bold">{research?.title || selected.mla_id || selected.catalog_product_id}</h4>
      <p>Fuente de deteccion: {selected.detection_source} · {date(selected.detected_at)}</p>
      <p>Publicacion activa durante investigacion: {selected.listing_active ? 'Si' : 'No comprobada'} · {date(selected.researched_at)}</p>
      {selected.research_error && <p className="text-amber-800">{selected.research_error}</p>}
      {research && <>
        <p>{research.description || 'Descripcion no informada'}</p>
        <p>Marca: {research.brand || 'No informada'} · Especie: {research.petTypes.join(', ') || 'No informada'} · Etapa: {research.lifeStages.join(', ') || 'No informada'} · Tamaño: {research.sizes.join(', ') || 'No informado'}</p>
        {Object.entries(research.provenance).map(([name, source]) => <p key={name} className="text-xs">{name}: {source.source} · {date(source.researchedAt)}</p>)}
        {research.attributes.map((a,i) => <p key={i} className="text-xs">{a.name}: {a.value} · {a.source} · {date(a.researchedAt)}</p>)}
        {research.limitations.map(text => <p key={text} className="text-amber-800">{text}</p>)}
      </>}
      <label className="block">Ficha investigada (JSON con fuentes)<textarea className={`${field} h-56 font-mono`} value={record} readOnly={Boolean(resolved)} onChange={e => setRecord(e.target.value)} /></label>
      <label className="block">Motivo de la decision<input className={field} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <label className="block">Posponer hasta<input className={field} type="datetime-local" value={until} onChange={e => setUntil(e.target.value)} /></label>
      {selected.review_status === 'approved' && !selected.duplicate_product_id && <button className={button} disabled={busy} onClick={() => void decide('publish')}>Publicar expresamente</button>}
      {!resolved && selected.review_status !== 'approved' && <div className="flex flex-wrap gap-2">
        <button className={button} disabled={busy || selected.research_status!=='ready' || !selected.listing_active || Boolean(selected.duplicate_product_id)} onClick={() => void decide('approve')}>Aprobar investigacion</button>
        <button className={button} disabled={busy} onClick={() => void decide('reject')}>Rechazar</button>
        <button className={button} disabled={busy} onClick={() => void decide('postpone')}>Posponer</button>
        <button className={button} disabled={busy || selected.research_status!=='ready'} onClick={() => void decide('revise')}>Guardar revision de atributos</button>
        {['error','unsupported'].includes(selected.research_status) && <button className={button} disabled={busy} onClick={() => void decide('retry')}>Solicitar nueva investigacion</button>}
      </div>}
      <details><summary>Trazabilidad de decisiones e investigacion</summary>
        {selected.events.map(event => <div key={event.id} className="my-2 text-xs"><p>{date(event.event_at)} · {event.action} · {event.reason || 'Sin motivo adicional'}</p>
          <pre className="overflow-x-auto">{JSON.stringify(event.snapshot,null,2)}</pre></div>)}
      </details>
    </section>}
  </section>;
}
