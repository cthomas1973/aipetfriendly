import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Download, FileText, Loader2, QrCode, RefreshCw } from 'lucide-react';
import {
  adminCreatePetTagCodesBatch,
  fetchAdminPetTagCodeBatches,
  fetchAdminPetTagCodes,
  fetchAdminPetTagRequests,
  fetchPetTagCodeBatchCodes,
  markPetTagCodeBatchDownloaded,
  updateAdminPetTagRequest,
} from '../lib/supabase';
import type { AdminPetTagCodeBatchRow, AdminPetTagCodeRow, AdminPetTagRequestRow, PetTagCodeStatus, PetTagRequestStatus } from '../types';

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

// Los codigos de chapita pre-generados por lote usan el alias corto /t/ (en vez
// de /mascota) porque todavia no tienen mascota asociada; ver App.tsx (getTagCodeFromPath)
// y PetPublicProfileSection.tsx (panel de vinculacion cuando el codigo esta "huerfano").
function buildTagCodeUrl(code: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.aipetfriendly.ar';
  return `${origin}/t/${code}`;
}

async function buildTagCodesZipBlob(codes: string[]): Promise<Blob> {
  const [{ default: JSZip }, qrcodeModule] = await Promise.all([
    import('jszip'),
    import('qrcode'),
  ]);
  const QRCode = (qrcodeModule as any).default ?? qrcodeModule;
  const zip = new JSZip();

  for (const code of codes) {
    const dataUrl: string = await QRCode.toDataURL(buildTagCodeUrl(code), { margin: 2, width: 600 });
    const base64 = dataUrl.split(',')[1];
    zip.file(`${code}.png`, base64, { base64: true });
  }

  return zip.generateAsync({ type: 'blob' });
}

async function buildTagCodesPdfBlob(codes: string[]): Promise<Blob> {
  const [{ jsPDF }, qrcodeModule] = await Promise.all([
    import('jspdf'),
    import('qrcode'),
  ]);
  const QRCode = (qrcodeModule as any).default ?? qrcodeModule;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const cols = 4;
  const cellSize = (pageWidth - margin * 2) / cols;
  const qrSize = cellSize - 8;
  const rowHeight = cellSize;
  const rowsPerPage = Math.floor((pageHeight - margin * 2) / rowHeight);

  for (let i = 0; i < codes.length; i += 1) {
    const indexInPage = i % (cols * rowsPerPage);
    if (i > 0 && indexInPage === 0) {
      doc.addPage();
    }
    const col = indexInPage % cols;
    const row = Math.floor(indexInPage / cols);
    const x = margin + col * cellSize;
    const y = margin + row * rowHeight;

    const dataUrl: string = await QRCode.toDataURL(buildTagCodeUrl(codes[i]), { margin: 1, width: 300 });
    doc.addImage(dataUrl, 'PNG', x + (cellSize - qrSize) / 2, y, qrSize, qrSize);
    doc.setFontSize(9);
    doc.text(codes[i], x + cellSize / 2, y + qrSize + 5, { align: 'center' });
  }

  return doc.output('blob');
}

function triggerFileDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}


export function AdminChapitasSection() {
  const [subTab, setSubTab] = useState<'solicitudes' | 'lotes'>('solicitudes');

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-full bg-slate-100 p-1 text-sm font-semibold">
        <button
          type="button"
          onClick={() => setSubTab('solicitudes')}
          className={`flex-1 rounded-full py-2 transition ${subTab === 'solicitudes' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500'}`}
        >
          Solicitudes por mascota
        </button>
        <button
          type="button"
          onClick={() => setSubTab('lotes')}
          className={`flex-1 rounded-full py-2 transition ${subTab === 'lotes' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500'}`}
        >
          Lotes de QR
        </button>
      </div>
      {subTab === 'solicitudes' ? <PetTagRequestsPanel /> : <PetTagCodesPanel />}
    </div>
  );
}

function PetTagRequestsPanel() {
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

const TAG_STATUS_LABEL: Record<PetTagCodeStatus, string> = {
  orphan: 'Huerfano',
  linked: 'Vinculado',
};

function PetTagCodesPanel() {
  const [quantity, setQuantity] = useState(20);
  const [generating, setGenerating] = useState(false);
  const [lastBatch, setLastBatch] = useState<string[]>([]);
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);
  const [batchPreviews, setBatchPreviews] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState<{ batchId: string; format: 'zip' | 'pdf' } | null>(null);

  const [batches, setBatches] = useState<AdminPetTagCodeBatchRow[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);

  const [rows, setRows] = useState<AdminPetTagCodeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<PetTagCodeStatus | 'todos'>('todos');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAdminPetTagCodes(statusFilter === 'todos' ? undefined : statusFilter);
      setRows(data);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo cargar el listado de codigos.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const loadBatches = useCallback(async () => {
    try {
      setBatchesLoading(true);
      setError(null);
      const data = await fetchAdminPetTagCodeBatches();
      setBatches(data);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo cargar el historial de lotes.');
    } finally {
      setBatchesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  // Previews de QR (client-side) del ultimo lote generado, para poder verlos antes de descargar.
  useEffect(() => {
    if (lastBatch.length === 0) return;
    let cancelled = false;
    (async () => {
      const qrcodeModule = await import('qrcode');
      const QRCode = (qrcodeModule as any).default ?? qrcodeModule;
      const entries = await Promise.all(
        lastBatch.map(async (code) => {
          try {
            const dataUrl = await QRCode.toDataURL(buildTagCodeUrl(code), { margin: 1, width: 160 });
            return [code, dataUrl] as const;
          } catch {
            return [code, ''] as const;
          }
        }),
      );
      if (!cancelled) {
        setBatchPreviews(Object.fromEntries(entries));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lastBatch]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!q) return true;
      return (
        row.code.toLowerCase().includes(q)
        || (row.petName || '').toLowerCase().includes(q)
        || (row.userEmail || '').toLowerCase().includes(q)
      );
    });
  }, [rows, query]);

  const onGenerate = async () => {
    try {
      setGenerating(true);
      setError(null);
      setMsg(null);
      const { batchId, codes } = await adminCreatePetTagCodesBatch(quantity);
      setLastBatch(codes);
      setLastBatchId(batchId);
      setBatchPreviews({});
      setMsg(`Se generaron ${codes.length} codigos nuevos. Si no los descargas ahora, quedan disponibles en el historial de lotes.`);
      await Promise.all([load(), loadBatches()]);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo generar el lote de codigos.');
    } finally {
      setGenerating(false);
    }
  };

  const performDownload = async (batchId: string, codes: string[], format: 'zip' | 'pdf') => {
    const blob = format === 'zip' ? await buildTagCodesZipBlob(codes) : await buildTagCodesPdfBlob(codes);
    triggerFileDownload(blob, `chapitas-qr-${new Date().toISOString().slice(0, 10)}.${format}`);
    await markPetTagCodeBatchDownloaded(batchId, format);
    setBatches((current) => current.map((b) => (
      b.id === batchId
        ? { ...b, ...(format === 'zip' ? { downloadedZipAt: new Date().toISOString() } : { downloadedPdfAt: new Date().toISOString() }) }
        : b
    )));
  };

  const downloadLastBatch = async (format: 'zip' | 'pdf') => {
    if (!lastBatchId) return;
    try {
      setExporting({ batchId: lastBatchId, format });
      setError(null);
      await performDownload(lastBatchId, lastBatch, format);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : `No se pudo generar el archivo ${format === 'zip' ? 'ZIP' : 'PDF'}.`);
    } finally {
      setExporting(null);
    }
  };

  const downloadHistoryBatch = async (batch: AdminPetTagCodeBatchRow, format: 'zip' | 'pdf') => {
    try {
      setExporting({ batchId: batch.id, format });
      setError(null);
      const codes = await fetchPetTagCodeBatchCodes(batch.id);
      await performDownload(batch.id, codes, format);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : `No se pudo generar el archivo ${format === 'zip' ? 'ZIP' : 'PDF'}.`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-purple-100 bg-purple-50/60 p-4">
        <p className="font-bold text-slate-900">Generar lote nuevo</p>
        <p className="mt-1 text-xs text-slate-500">
          Crea codigos de chapita sin mascota asociada (quedan "huerfanos" hasta que alguien los escanea y los vincula).
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Cantidad (1-500)</label>
            <input
              type="number"
              min={1}
              max={500}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
              className="w-28 rounded-full border border-slate-200 px-4 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 rounded-full bg-purple-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {generating ? <Loader2 size={14} className="animate-spin" /> : <QrCode size={14} />}
            {generating ? 'Generando...' : 'Generar lote'}
          </button>
        </div>
      </div>

      {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {msg && <p className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-600">{msg}</p>}

      {lastBatch.length > 0 && (
        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-slate-800">Ultimo lote generado ({lastBatch.length} codigos)</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={exporting !== null}
                onClick={() => downloadLastBatch('zip')}
                className="flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
              >
                {exporting?.batchId === lastBatchId && exporting.format === 'zip' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                Descargar ZIP (PNG)
              </button>
              <button
                type="button"
                disabled={exporting !== null}
                onClick={() => downloadLastBatch('pdf')}
                className="flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
              >
                {exporting?.batchId === lastBatchId && exporting.format === 'pdf' ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                Descargar PDF
              </button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8">
            {lastBatch.map((code) => (
              <div key={code} className="text-center">
                {batchPreviews[code] ? (
                  <img src={batchPreviews[code]} alt={code} className="mx-auto h-16 w-16 rounded border border-slate-200" />
                ) : (
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded border border-slate-200">
                    <QrCode size={18} className="text-slate-300" />
                  </div>
                )}
                <p className="mt-1 text-[10px] font-semibold text-slate-500">{code}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-slate-900">Historial de lotes</p>
        <button
          type="button"
          onClick={loadBatches}
          disabled={batchesLoading}
          className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-70"
        >
          {batchesLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Actualizar
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Cantidad</th>
              <th className="px-3 py-2">Vinculados / Huerfanos</th>
              <th className="px-3 py-2">ZIP</th>
              <th className="px-3 py-2">PDF</th>
              <th className="px-3 py-2">Descargar</th>
            </tr>
          </thead>
          <tbody>
            {batches.length === 0 && !batchesLoading ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-400">Todavia no se genero ningun lote.</td>
              </tr>
            ) : (
              batches.map((batch) => (
                <tr key={batch.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-3 whitespace-nowrap text-slate-500">{formatDate(batch.createdAt)}</td>
                  <td className="px-3 py-3 font-semibold text-slate-800">{batch.quantity}</td>
                  <td className="px-3 py-3 text-slate-600">{batch.linkedCount} / {batch.orphanCount}</td>
                  <td className="px-3 py-3">
                    {batch.downloadedZipAt ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{formatDate(batch.downloadedZipAt)}</span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">Sin descargar</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {batch.downloadedPdfAt ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{formatDate(batch.downloadedPdfAt)}</span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">Sin descargar</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={exporting !== null}
                        onClick={() => downloadHistoryBatch(batch, 'zip')}
                        className="flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                      >
                        {exporting?.batchId === batch.id && exporting.format === 'zip' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                        ZIP
                      </button>
                      <button
                        type="button"
                        disabled={exporting !== null}
                        onClick={() => downloadHistoryBatch(batch, 'pdf')}
                        className="flex items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
                      >
                        {exporting?.batchId === batch.id && exporting.format === 'pdf' ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                        PDF
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-slate-900">Todos los codigos</p>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-70"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Actualizar
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por codigo, mascota o email..."
          className="min-w-[220px] flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as PetTagCodeStatus | 'todos')}
          className="rounded-full border border-slate-200 px-4 py-2 text-sm"
        >
          <option value="todos">Todos los estados</option>
          <option value="orphan">Huerfanos</option>
          <option value="linked">Vinculados</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Codigo</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Mascota vinculada</th>
              <th className="px-3 py-2">Tutor</th>
              <th className="px-3 py-2">Creado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-400">No hay codigos generados todavia.</td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-3 font-mono font-semibold text-slate-800">{row.code}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${row.status === 'linked' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {TAG_STATUS_LABEL[row.status]}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {row.petName ? (
                      <>
                        <p className="font-semibold text-slate-800">{row.petName}</p>
                        <p className="text-xs text-slate-400">{row.petPublicCode}</p>
                      </>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {row.userEmail ? (
                      <p className="text-slate-700">{row.userFullName || row.userEmail}</p>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-slate-500">{formatDate(row.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
