import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Loader2, QrCode, RefreshCw } from 'lucide-react';
import { fetchAdminPetTagRequests, updateAdminPetTagRequest } from '../lib/supabase';
import type { AdminPetTagRequestRow, PetTagRequestStatus } from '../types';

const STL_SERVICE_URL = (import.meta.env.VITE_STL_SERVICE_URL as string | undefined) || 'http://localhost:8000';

const STATUS_LABEL: Record<PetTagRequestStatus, string> = {
  requested: 'Solicitado',
  pending_payment: 'Pendiente de pago',
  stl_generated: 'Generado STL',
  printed: 'Impreso',
  shipped: 'Enviado',
  linked: 'Linkeado',
  cancelled: 'Cancelado',
};

const STATUS_OPTIONS: PetTagRequestStatus[] = [
  'requested',
  'pending_payment',
  'stl_generated',
  'printed',
  'shipped',
  'linked',
  'cancelled',
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
}

function buildQrTargetUrl(publicCode: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.aipetfriendly.ar';
  return `${origin}/mascota/${publicCode}?src=chapita`;
}

export function AdminChapitasSection() {
  const [rows, setRows] = useState<AdminPetTagRequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<PetTagRequestStatus | 'todos'>('todos');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [qrPreviews, setQrPreviews] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAdminPetTagRequests();
      setRows(data);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo cargar el listado de chapitas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Generar previews de QR (client-side) para las filas visibles, sin persistir nada.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const qrcodeModule = await import('qrcode');
      const QRCode = (qrcodeModule as any).default ?? qrcodeModule;
      const pending = rows.filter((r) => !qrPreviews[r.id]);
      if (pending.length === 0) return;
      const entries = await Promise.all(
        pending.map(async (r) => {
          try {
            const dataUrl = await QRCode.toDataURL(buildQrTargetUrl(r.petPublicCode), { margin: 1, width: 160 });
            return [r.id, dataUrl] as const;
          } catch {
            return [r.id, ''] as const;
          }
        }),
      );
      if (!cancelled) {
        setQrPreviews((current) => ({ ...current, ...Object.fromEntries(entries) }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'todos' && row.status !== statusFilter) return false;
      if (!q) return true;
      return (
        row.petName.toLowerCase().includes(q) ||
        row.userEmail.toLowerCase().includes(q) ||
        (row.userFullName || '').toLowerCase().includes(q) ||
        (row.userWhatsappPhone || '').toLowerCase().includes(q) ||
        row.petPublicCode.toLowerCase().includes(q)
      );
    });
  }, [rows, query, statusFilter]);

  const onChangeStatus = async (row: AdminPetTagRequestRow, status: PetTagRequestStatus) => {
    try {
      setSavingId(row.id);
      setError(null);
      setMsg(null);
      await updateAdminPetTagRequest(row.id, status);
      setRows((current) => current.map((r) => (r.id === row.id ? { ...r, status } : r)));
      setMsg('Estado actualizado correctamente.');
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo actualizar el estado.');
    } finally {
      setSavingId(null);
    }
  };

  const generateAndDownload = async (row: AdminPetTagRequestRow, format: 'stl_single' | 'stl_multi' | '3mf') => {
    try {
      setGeneratingId(row.id);
      setError(null);
      setMsg(null);

      const genResponse = await fetch(`${STL_SERVICE_URL}/generate-tag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pet_id: row.petId,
          public_code: row.petPublicCode,
          pet_name: row.petName,
          format,
        }),
      });

      if (!genResponse.ok) {
        throw new Error(`El servicio de generacion respondio con error (${genResponse.status}).`);
      }

      const genData = await genResponse.json();
      const jobId: string = genData.job_id;
      const files: string[] = genData.files || [];

      for (const fileName of files) {
        const fileResponse = await fetch(`${STL_SERVICE_URL}/download/${jobId}/${fileName}`);
        if (!fileResponse.ok) continue;
        const blob = await fileResponse.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }

      if (row.status === 'pending_payment' || row.status === 'requested') {
        await updateAdminPetTagRequest(row.id, 'stl_generated');
        setRows((current) => current.map((r) => (r.id === row.id ? { ...r, status: 'stl_generated' } : r)));
      }

      setMsg(`Archivo(s) generado(s) y descargado(s) para ${row.petName}.`);
    } catch (ex) {
      setError(
        ex instanceof Error
          ? `${ex.message} (¿esta corriendo el servicio en ${STL_SERVICE_URL}?)`
          : 'No se pudo generar el archivo 3D.',
      );
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-bold text-slate-900">Solicitudes de chapitas</p>
          <p className="text-xs text-slate-500">Servicio de generacion 3D: {STL_SERVICE_URL}</p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-70"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {loading ? 'Cargando...' : 'Actualizar'}
        </button>
      </div>

      {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {msg && <p className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-600">{msg}</p>}

      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por mascota, email, telefono o codigo..."
          className="min-w-[220px] flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as PetTagRequestStatus | 'todos')}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm"
        >
          <option value="todos">Todos los estados</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Mascota</th>
              <th className="px-3 py-2">Contacto</th>
              <th className="px-3 py-2">QR</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Generar</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-400">No hay solicitudes de chapitas.</td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-3 whitespace-nowrap text-slate-500">{formatDate(row.createdAt)}</td>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-slate-800">{row.petName}</p>
                    <p className="text-xs text-slate-400">{row.petPublicCode}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-slate-700">{row.userFullName || row.userEmail}</p>
                    <p className="text-xs text-slate-400">{row.userEmail}</p>
                    {row.userWhatsappPhone && <p className="text-xs text-slate-400">{row.userWhatsappPhone}</p>}
                  </td>
                  <td className="px-3 py-3">
                    {qrPreviews[row.id] ? (
                      <img src={qrPreviews[row.id]} alt={`QR ${row.petName}`} className="h-14 w-14 rounded border border-slate-200" />
                    ) : (
                      <QrCode size={20} className="text-slate-300" />
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={row.status}
                      disabled={savingId === row.id}
                      onChange={(e) => onChangeStatus(row, e.target.value as PetTagRequestStatus)}
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        disabled={generatingId === row.id}
                        onClick={() => generateAndDownload(row, '3mf')}
                        className="flex items-center gap-1.5 rounded-full bg-purple-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                      >
                        {generatingId === row.id ? <Loader2 size={13} className="animate-spin" /> : <Box size={13} />}
                        .3mf
                      </button>
                      <button
                        type="button"
                        disabled={generatingId === row.id}
                        onClick={() => generateAndDownload(row, 'stl_multi')}
                        className="rounded-full border border-purple-300 px-3 py-1.5 text-xs font-semibold text-purple-600 disabled:opacity-60"
                      >
                        3x .stl
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
