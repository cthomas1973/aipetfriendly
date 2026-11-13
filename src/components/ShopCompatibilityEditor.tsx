import { useState } from 'react';
import { fetchAdminShopDimensions, saveAdminShopDimension } from '../lib/supabase';
import type { BeneficioProducto, ShopDimension, ShopDimensionRecord } from '../types';

const choices: Record<ShopDimension, string[]> = {
  species: ['perro', 'gato', 'otro'],
  stage: ['cachorro', 'adulto', 'senior', 'todas'],
  size: ['pequeño', 'mediano', 'grande', 'todos'],
};
const labels: Record<ShopDimension, string> = { species: 'Especie', stage: 'Etapa', size: 'Tamaño' };

export function ShopCompatibilityEditor({ product }: { product: BeneficioProducto }) {
  const [records, setRecords] = useState<ShopDimensionRecord[]>([]);
  const [selected, setSelected] = useState<ShopDimension>('species');
  const [values, setValues] = useState<string[]>([]);
  const [source, setSource] = useState('');
  const [verifiedAt, setVerifiedAt] = useState('');
  const [verification, setVerification] = useState<ShopDimensionRecord['verification']>('unknown');
  const [skuConfirmed, setSkuConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sku = product.mla_id.toUpperCase().replace(/-/g, '');
  const current = records.find(r => r.dimension === selected);
  const unchanged = current && current.sku === sku && skuConfirmed && current.verification === verification
    && current.source === source && current.verified_at.slice(0, 10) === verifiedAt
    && current.values_text.length === values.length && current.values_text.every(v => values.includes(v));
  const open = async () => {
    setBusy(true); setError(null);
    try {
      const rows = await fetchAdminShopDimensions(product.id);
      setRecords(rows);
      const row = rows.find(r => r.dimension === selected);
      setValues(row?.values_text || []); setSource(row?.source || '');
      setVerifiedAt(row?.verified_at ? row.verified_at.slice(0, 10) : '');
      setVerification(row?.verification || 'unknown'); setSkuConfirmed(row?.sku === sku);
    }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron consultar dimensiones.'); }
    finally { setBusy(false); }
  };
  const selectDimension = (dimension: ShopDimension) => {
    const row = records.find(r => r.dimension === dimension);
    setSelected(dimension); setValues(row?.values_text || []); setSource(row?.source || '');
    setVerifiedAt(row?.verified_at ? row.verified_at.slice(0, 10) : '');
    setVerification(row?.verification || 'unknown');
    setSkuConfirmed(row?.sku === sku); setMessage(null);
  };
  const submit = async (action: 'save'|'enable'|'disable') => {
    setBusy(true); setError(null); setMessage(null);
    try {
      if (action === 'save' && (!values.length || !source.trim() || !verifiedAt || !skuConfirmed)) {
        throw new Error('Seleccioná valores, fuente, fecha y confirmá el SKU exacto.');
      }
      await saveAdminShopDimension(product.id, selected, action, action === 'save' ? {
        product_id: product.id, dimension: selected, values_text: values, verification,
        source: source.trim(), verified_at: new Date(`${verifiedAt}T12:00:00Z`).toISOString(), sku, enabled: false,
      } : undefined);
      setRecords(await fetchAdminShopDimensions(product.id));
      setMessage(action === 'save' ? 'Guardado deshabilitado. Habilitá por separado tras revisar.' : 'Decision registrada.');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
  };
  return <details onToggle={e => { if (e.currentTarget.open) void open(); }} className="mt-2 text-xs">
    <summary className="cursor-pointer">Revisar compatibilidad de {sku}</summary>
    <p>Solo se recomienda cuando las tres dimensiones están confirmadas para este SKU y habilitadas.</p>
    {(['species','stage','size'] as ShopDimension[]).map(d => {
      const row = records.find(r => r.dimension === d);
      return <button key={d} type="button" className="mr-2 underline" onClick={() => selectDimension(d)}>
        {labels[d]}: {!row ? 'sin datos' : row.enabled && row.verification === 'confirmed' && row.sku === sku ? 'habilitada' : 'bloqueada'}
      </button>;
    })}
    <p className="mt-2 font-semibold">{labels[selected]} {current?.enabled ? 'habilitada' : 'bloqueada'}:
      {!current ? ' falta evidencia' : current.verification !== 'confirmed' ? ` estado ${current.verification}` :
        current.sku !== sku ? ' SKU distinto' : current.enabled ? ' evidencia confirmada' : ' falta habilitación explícita'}</p>
    <div>{choices[selected].map(value => <label key={value} className="mr-2">
      <input type="checkbox" checked={values.includes(value)} onChange={e => setValues(old => e.target.checked ? [...old, value] : old.filter(v => v !== value))} /> {value}
    </label>)}</div>
    <label className="block">Estado <select value={verification} onChange={e => setVerification(e.target.value as ShopDimensionRecord['verification'])}>
      <option value="unknown">Desconocido</option><option value="partial">Parcial</option><option value="conflict">Conflicto</option><option value="confirmed">Confirmado</option>
    </select></label>
    <label className="block">Fuente <input className="border" value={source} onChange={e => setSource(e.target.value)} /></label>
    <label className="block">Fecha <input type="date" className="border" value={verifiedAt} onChange={e => setVerifiedAt(e.target.value)} /></label>
    <label className="block"><input type="checkbox" checked={skuConfirmed} onChange={e => setSkuConfirmed(e.target.checked)} /> La evidencia corresponde exactamente a {sku}</label>
    <div className="flex flex-wrap gap-2 mt-2">
      <button type="button" disabled={busy} onClick={() => void submit('save')} className="underline">Guardar sin habilitar</button>
      <button type="button" disabled={busy || !unchanged || current?.verification !== 'confirmed'} onClick={() => void submit('enable')} className="underline">Habilitar evidencia guardada</button>
      <button type="button" disabled={busy || !current?.enabled} onClick={() => void submit('disable')} className="underline">Deshabilitar</button>
    </div>
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    {message && <p role="status">{message}</p>}
  </details>;
}
