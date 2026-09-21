import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Pencil, RefreshCw, Trash2, Undo2, X } from 'lucide-react';
import { deleteAdminBlogPost, fetchAdminBlogPosts, fetchAllBeneficiosProductos, updateAdminBlogPost } from '../lib/supabase';
import { getGuidesSortedByDate } from '../data/petGuides';
import type { BeneficioProducto, BlogPost } from '../types';

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
}

export function AdminBlogSection() {
  const [rows, setRows] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editRelatedGuideSlug, setEditRelatedGuideSlug] = useState('');
  const [editRelatedBlogSlug, setEditRelatedBlogSlug] = useState('');
  const [editRelatedProductId, setEditRelatedProductId] = useState('');
  const [products, setProducts] = useState<BeneficioProducto[]>([]);
  const guides = getGuidesSortedByDate(true);

  useEffect(() => {
    fetchAllBeneficiosProductos()
      .then((data) => setProducts(data.filter((p) => p.active)))
      .catch(() => setProducts([]));
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAdminBlogPosts();
      setRows(data);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo cargar el listado de posts del blog.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = (row: BlogPost) => {
    setEditingId(row.id);
    setEditTitle(row.title);
    setEditContent(row.content);
    setEditRelatedGuideSlug(row.relatedGuideSlug || '');
    setEditRelatedBlogSlug(row.relatedBlogSlug || '');
    setEditRelatedProductId(row.relatedProductId || '');
    setError(null);
    setMsg(null);
  };

  const closeEdit = () => {
    setEditingId(null);
    setEditTitle('');
    setEditContent('');
    setEditRelatedGuideSlug('');
    setEditRelatedBlogSlug('');
    setEditRelatedProductId('');
  };

  const persistChange = async (row: BlogPost, status: 'draft' | 'published', useEditedText: boolean) => {
    try {
      setSaving(true);
      setError(null);
      setMsg(null);
      const updated = await updateAdminBlogPost({
        id: row.id,
        title: useEditedText ? editTitle : row.title,
        content: useEditedText ? editContent : row.content,
        status,
        relatedGuideSlug: useEditedText ? editRelatedGuideSlug : row.relatedGuideSlug,
        relatedBlogSlug: useEditedText ? editRelatedBlogSlug : row.relatedBlogSlug,
        relatedProductId: useEditedText ? editRelatedProductId : row.relatedProductId,
      });
      setRows((current) => current.map((r) => (r.id === row.id ? updated : r)));
      setMsg(status === 'published' ? 'Post publicado correctamente.' : 'Post pasado a borrador.');
      closeEdit();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo guardar el post.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: BlogPost) => {
    if (!window.confirm(`¿Descartar el borrador "${row.title}"? Esta accion no se puede deshacer.`)) {
      return;
    }
    try {
      setError(null);
      setMsg(null);
      await deleteAdminBlogPost(row.id);
      setRows((current) => current.filter((r) => r.id !== row.id));
      setMsg('Post descartado correctamente.');
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo descartar el post.');
    }
  };

  const drafts = rows.filter((row) => row.status === 'draft');
  const published = rows.filter((row) => row.status === 'published');

  const renderRow = (row: BlogPost) => {
    const isEditing = editingId === row.id;

    return (
      <div key={row.id} className="rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-bold text-slate-900">{row.title}</p>
            <p className="text-xs text-slate-400">{formatDate(row.createdAt)} · {row.sourceName || 'Sin fuente'} · {row.estimatedReadingTime} min de lectura</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${
            row.status === 'published' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
          }`}>
            {row.status === 'published' ? 'Publicado' : 'Borrador'}
          </span>
        </div>

        {isEditing ? (
          <div className="mt-3 space-y-2">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800"
            />
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={8}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
            />
            <div className="grid gap-2 md:grid-cols-3">
              <label className="text-xs font-semibold text-slate-500">
                Guía relacionada
                <select
                  value={editRelatedGuideSlug}
                  onChange={(e) => setEditRelatedGuideSlug(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-2 py-2 text-xs text-slate-700"
                >
                  <option value="">— Sin guía —</option>
                  {guides.map((g) => (
                    <option key={g.slug} value={g.slug}>
                      {g.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-500">
                Post relacionado
                <select
                  value={editRelatedBlogSlug}
                  onChange={(e) => setEditRelatedBlogSlug(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-2 py-2 text-xs text-slate-700"
                >
                  <option value="">— Sin post —</option>
                  {rows
                    .filter((p) => p.status === 'published' && p.id !== row.id)
                    .map((p) => (
                      <option key={p.id} value={p.slug}>
                        {p.title}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-500">
                Producto sugerido (tienda)
                <select
                  value={editRelatedProductId}
                  onChange={(e) => setEditRelatedProductId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-2 py-2 text-xs text-slate-700"
                >
                  <option value="">— Sin producto —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => persistChange(row, row.status, true)}
                className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-70"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                Guardar cambios
              </button>
              <button
                type="button"
                onClick={closeEdit}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500"
              >
                <X size={14} /> Cancelar
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-2 whitespace-pre-line text-sm text-slate-600 line-clamp-4">{row.content}</p>
        )}

        {!isEditing && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openEdit(row)}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
            >
              <Pencil size={14} /> Editar
            </button>
            {row.status === 'draft' ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => persistChange(row, 'published', false)}
                className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-70"
              >
                <CheckCircle2 size={14} /> Publicar
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => persistChange(row, 'draft', false)}
                className="flex items-center gap-1.5 rounded-full border border-amber-200 px-4 py-2 text-xs font-bold text-amber-600 disabled:opacity-70"
              >
                <Undo2 size={14} /> Volver a borrador
              </button>
            )}
            {row.status === 'draft' && (
              <button
                type="button"
                onClick={() => handleDelete(row)}
                className="flex items-center gap-1.5 rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-500"
              >
                <Trash2 size={14} /> Descartar
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-bold text-slate-900">Blog "Tips del día"</p>
          <p className="text-xs text-slate-500">El cron genera borradores automaticamente; revisalos/editalos antes de publicar.</p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-70"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {loading ? 'Cargando...' : 'Actualizar'}
        </button>
      </div>

      {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {msg && <p className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-600">{msg}</p>}

      <div>
        <p className="mb-2 text-sm font-bold text-slate-700">Pendientes de revision ({drafts.length})</p>
        {drafts.length === 0 && !loading ? (
          <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
            No hay borradores pendientes.
          </p>
        ) : (
          <div className="space-y-3">{drafts.map(renderRow)}</div>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-bold text-slate-700">Publicados ({published.length})</p>
        {published.length === 0 && !loading ? (
          <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
            Todavia no hay posts publicados.
          </p>
        ) : (
          <div className="space-y-3">{published.map(renderRow)}</div>
        )}
      </div>
    </div>
  );
}
