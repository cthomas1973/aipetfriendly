import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, RefreshCw, ToggleLeft, ToggleRight, Trash2, X } from 'lucide-react';
import { deleteAdminDiscountCode, fetchAdminDiscountCodes, saveAdminDiscountCode } from '../lib/supabase';
import type { DiscountCode } from '../types';

const EMPTY_FORM = {
  code: '',
  percentOff: '',
  active: true,
  maxUses: '',
  expiresAt: '',
  notes: '',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
}

export function AdminDiscountCodesSection() {
  const [rows, setRows] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAdminDiscountCodes();
      setRows(data);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo cargar el listado de codigos de descuento.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreateForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setError(null);
    setMsg(null);
  };

  const openEditForm = (row: DiscountCode) => {
    setEditingId(row.id);
    setForm({
      code: row.code,
      percentOff: String(row.percentOff),
      active: row.active,
      maxUses: row.maxUses === null ? '' : String(row.maxUses),
      expiresAt: row.expiresAt ? row.expiresAt.slice(0, 10) : '',
      notes: row.notes || '',
    });
    setShowForm(true);
    setError(null);
    setMsg(null);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMsg(null);

    const trimmedCode = form.code.trim();
    if (!trimmedCode) {
      setError('El codigo no puede estar vacio.');
      return;
    }

    const percentOff = Number(form.percentOff);
    if (!Number.isFinite(percentOff) || percentOff <= 0 || percentOff > 100) {
      setError('El porcentaje debe ser un numero entre 1 y 100.');
      return;
    }

    const maxUses = form.maxUses.trim() ? Number(form.maxUses) : null;
    if (maxUses !== null && (!Number.isFinite(maxUses) || maxUses <= 0)) {
      setError('El maximo de usos debe ser un numero mayor a 0.');
      return;
    }

    setSaving(true);
    try {
      await saveAdminDiscountCode({
        id: editingId,
        code: trimmedCode,
        percentOff,
        active: form.active,
        maxUses,
        expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : null,
        notes: form.notes.trim() || null,
      });
      setMsg(editingId ? 'Codigo actualizado correctamente.' : 'Codigo creado correctamente.');
      closeForm();
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo guardar el codigo de descuento.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: DiscountCode) => {
    try {
      setError(null);
      setMsg(null);
      await saveAdminDiscountCode({
        id: row.id,
        code: row.code,
        percentOff: row.percentOff,
        active: !row.active,
        maxUses: row.maxUses,
        expiresAt: row.expiresAt,
        notes: row.notes,
      });
      setRows((current) => current.map((r) => (r.id === row.id ? { ...r, active: !r.active } : r)));
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo actualizar el estado del codigo.');
    }
  };

  const handleDelete = async (row: DiscountCode) => {
    if (!window.confirm(`¿Eliminar el codigo "${row.code}"? Esta accion no se puede deshacer.`)) {
      return;
    }
    try {
      setError(null);
      setMsg(null);
      await deleteAdminDiscountCode(row.id);
      setRows((current) => current.filter((r) => r.id !== row.id));
      setMsg('Codigo eliminado correctamente.');
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo eliminar el codigo.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-bold text-slate-900">Codigos de descuento</p>
          <p className="text-xs text-slate-500">Se aplican como % sobre el valor vigente de la suscripcion Premium.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-70"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {loading ? 'Cargando...' : 'Actualizar'}
          </button>
          <button
            type="button"
            onClick={openCreateForm}
            className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-sm font-bold text-white"
          >
            <Plus size={14} />
            Nuevo codigo
          </button>
        </div>
      </div>

      {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {msg && <p className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-600">{msg}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-slate-800">{editingId ? 'Editar codigo' : 'Nuevo codigo'}</p>
            <button type="button" onClick={closeForm} className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-500">
              Codigo
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="Ej: BIENVENIDA20"
                className="mt-1 w-full rounded-full border border-slate-200 px-4 py-2 text-sm font-normal text-slate-800"
              />
            </label>

            <label className="text-xs font-semibold text-slate-500">
              % de descuento
              <input
                type="number"
                min={1}
                max={100}
                step="0.01"
                value={form.percentOff}
                onChange={(e) => setForm((f) => ({ ...f, percentOff: e.target.value }))}
                placeholder="Ej: 20"
                className="mt-1 w-full rounded-full border border-slate-200 px-4 py-2 text-sm font-normal text-slate-800"
              />
            </label>

            <label className="text-xs font-semibold text-slate-500">
              Maximo de usos (opcional)
              <input
                type="number"
                min={1}
                value={form.maxUses}
                onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))}
                placeholder="Ilimitado"
                className="mt-1 w-full rounded-full border border-slate-200 px-4 py-2 text-sm font-normal text-slate-800"
              />
            </label>

            <label className="text-xs font-semibold text-slate-500">
              Vencimiento (opcional)
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                className="mt-1 w-full rounded-full border border-slate-200 px-4 py-2 text-sm font-normal text-slate-800"
              />
            </label>

            <label className="sm:col-span-2 text-xs font-semibold text-slate-500">
              Notas internas (opcional)
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Ej: campania Instagram noviembre"
                className="mt-1 w-full rounded-full border border-slate-200 px-4 py-2 text-sm font-normal text-slate-800"
              />
            </label>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              Activo
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-5 py-2 text-sm font-bold text-white disabled:opacity-70"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {editingId ? 'Guardar cambios' : 'Crear codigo'}
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Codigo</th>
              <th className="px-3 py-2">Descuento</th>
              <th className="px-3 py-2">Usos</th>
              <th className="px-3 py-2">Vence</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-400">No hay codigos de descuento creados.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-3">
                    <p className="font-semibold text-slate-800">{row.code}</p>
                    {row.notes && <p className="text-xs text-slate-400">{row.notes}</p>}
                  </td>
                  <td className="px-3 py-3 font-semibold text-emerald-600">{row.percentOff}%</td>
                  <td className="px-3 py-3 text-slate-600">
                    {row.usedCount}{row.maxUses !== null ? ` / ${row.maxUses}` : ''}
                  </td>
                  <td className="px-3 py-3 text-slate-500">{row.expiresAt ? formatDate(row.expiresAt) : 'Sin vencimiento'}</td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => toggleActive(row)}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
                        row.active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {row.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                      {row.active ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditForm(row)}
                        className="rounded-full border border-slate-200 p-2 text-slate-500 hover:text-slate-800"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(row)}
                        className="rounded-full border border-red-200 p-2 text-red-500 hover:text-red-700"
                      >
                        <Trash2 size={14} />
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
