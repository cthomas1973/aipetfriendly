import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Facebook, Film, Instagram, Loader2, Music2, Pencil, Plus, RefreshCw, Sparkles, Trash2, Wand2, X, XCircle, Youtube } from 'lucide-react';
import {
  cancelAdminSocialPost,
  createAdminSocialPost,
  deleteAdminSocialPost,
  fetchAdminSocialPosts,
  generateGuideSocialReel,
  generateSocialPostVideo,
  regenerateBlogPostImage,
  updateAdminSocialPost,
  uploadAdminSocialMedia,
} from '../lib/supabase';
import type { SocialPost, SocialPostPlatform, SocialPostTargetStatus } from '../types';

// Etapa 1: Facebook, Instagram y YouTube se publican de verdad via el cron
// publish-social-posts (Edge Function + GitHub Actions cada 15min) cuando
// scheduled_at vence. TikTok todavia no esta soportado (queda como 'failed'
// con mensaje explicito) - se suma en una etapa posterior.

const PLATFORM_OPTIONS: { value: SocialPostPlatform; label: string; icon: typeof Facebook; supported: boolean }[] = [
  { value: 'facebook', label: 'Facebook', icon: Facebook, supported: true },
  { value: 'instagram', label: 'Instagram', icon: Instagram, supported: true },
  { value: 'youtube', label: 'YouTube', icon: Youtube, supported: true },
  { value: 'tiktok', label: 'TikTok', icon: Music2, supported: false },
];

const TARGET_STATUS_LABEL: Record<SocialPostTargetStatus, string> = {
  pending: 'Pendiente',
  processing: 'Publicando...',
  published: 'Publicado',
  failed: 'Error',
  skipped: 'Omitido',
};

const TARGET_STATUS_CLASS: Record<SocialPostTargetStatus, string> = {
  pending: 'bg-slate-100 text-slate-500',
  processing: 'bg-amber-50 text-amber-600',
  published: 'bg-emerald-50 text-emerald-600',
  failed: 'bg-red-50 text-red-600',
  skipped: 'bg-slate-100 text-slate-400',
};

const POST_STATUS_LABEL: Record<SocialPost['status'], string> = {
  draft: 'Borrador (pendiente de revision)',
  scheduled: 'Programado',
  processing: 'Publicando',
  done: 'Finalizado',
  cancelled: 'Cancelado',
};

const POST_STATUS_CLASS: Record<SocialPost['status'], string> = {
  draft: 'bg-purple-50 text-purple-600',
  scheduled: 'bg-sky-50 text-sky-600',
  processing: 'bg-amber-50 text-amber-600',
  done: 'bg-emerald-50 text-emerald-600',
  cancelled: 'bg-slate-100 text-slate-400',
};

const EMPTY_FORM = {
  caption: '',
  scheduledAt: '',
  platforms: [] as SocialPostPlatform[],
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
}

// El cron generate-blog-social-video corre ~30min despues de creado el
// borrador para reemplazar la imagen fija por un video con voz y subtitulos.
// Le damos un margen extra por si tarda en generarse; pasada esta ventana
// asumimos que ya no va a llegar el upgrade y dejamos de avisar.
const VIDEO_UPGRADE_WINDOW_MS = 45 * 60 * 1000;

function isPendingVideoUpgrade(row: SocialPost): boolean {
  if (row.source !== 'blog_auto' || row.mediaType !== 'image' || row.status !== 'draft') return false;
  return Date.now() - new Date(row.createdAt).getTime() < VIDEO_UPGRADE_WINDOW_MS;
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AdminPublicacionesSection() {
  const [rows, setRows] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<string | null>(null);
  const [editingSourceRefId, setEditingSourceRefId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewIsVideo, setPreviewIsVideo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [guideOptions, setGuideOptions] = useState<{ slug: string; title: string }[]>([]);
  const [selectedGuideSlug, setSelectedGuideSlug] = useState('');
  const [generatingGuideReel, setGeneratingGuideReel] = useState(false);
  const [regenSpecies, setRegenSpecies] = useState<'perro' | 'gato' | ''>('');
  const [regenInstructions, setRegenInstructions] = useState('');
  const [regeneratingImage, setRegeneratingImage] = useState(false);
  const [imageRegenerated, setImageRegenerated] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAdminSocialPosts();
      setRows(data);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo cargar el listado de publicaciones.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetch('/guides-feed.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { slug: string; title: string }[]) => {
        setGuideOptions(Array.isArray(data) ? data : []);
      })
      .catch(() => setGuideOptions([]));
  }, []);

  const handleGenerateGuideReel = async () => {
    if (!selectedGuideSlug) {
      setError('Elegi una guia primero.');
      return;
    }
    setError(null);
    setMsg(null);
    setGeneratingGuideReel(true);
    try {
      const { hasAudio } = await generateGuideSocialReel(selectedGuideSlug);
      setMsg(
        hasAudio
          ? 'Reel de la guia generado con voz en off y subtitulos. Quedo como borrador para revisar.'
          : 'Reel de la guia generado (video mudo, fallo el audio/subtitulos). Quedo como borrador para revisar.',
      );
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo generar el reel de la guia.');
    } finally {
      setGeneratingGuideReel(false);
    }
  };

  const togglePlatform = (platform: SocialPostPlatform) => {
    setForm((f) => ({
      ...f,
      platforms: f.platforms.includes(platform)
        ? f.platforms.filter((p) => p !== platform)
        : [...f.platforms, platform],
    }));
  };

  const resetRegenState = () => {
    setRegenSpecies('');
    setRegenInstructions('');
    setRegeneratingImage(false);
    setImageRegenerated(false);
    setGeneratingVideo(false);
    setVideoReady(false);
  };

  const openCreateForm = () => {
    setEditingId(null);
    setEditingSource(null);
    setEditingSourceRefId(null);
    setForm(EMPTY_FORM);
    setFile(null);
    setPreviewUrl(null);
    setPreviewIsVideo(false);
    resetRegenState();
    setShowForm(true);
    setError(null);
    setMsg(null);
  };

  const openEditForm = (row: SocialPost) => {
    if (isPendingVideoUpgrade(row)) {
      const proceed = window.confirm(
        'Este borrador todavia puede recibir el video automatico con voz y subtitulos en los proximos minutos. ¿Programar igual con la imagen fija?'
      );
      if (!proceed) return;
    }
    setEditingId(row.id);
    setEditingSource(row.source);
    setEditingSourceRefId(row.sourceRefId);
    setForm({
      caption: row.caption || '',
      scheduledAt: row.scheduledAt ? toDatetimeLocalValue(row.scheduledAt) : '',
      platforms: row.targets.map((t) => t.platform),
    });
    setFile(null);
    setPreviewUrl(row.mediaUrl);
    setPreviewIsVideo(row.mediaType === 'video');
    resetRegenState();
    setShowForm(true);
    setError(null);
    setMsg(null);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setEditingSource(null);
    setEditingSourceRefId(null);
    setForm(EMPTY_FORM);
    setFile(null);
    setPreviewUrl(null);
    setPreviewIsVideo(false);
    resetRegenState();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    setFile(selected);
    setPreviewUrl(selected ? URL.createObjectURL(selected) : null);
    setPreviewIsVideo(Boolean(selected?.type.startsWith('video/')));
  };

  const handleRegenerateImage = async () => {
    if (!editingSourceRefId) {
      setError('Este borrador no esta vinculado a un post del blog: no se puede regenerar la imagen.');
      return;
    }
    if (!regenSpecies) {
      setError('Elegi la especie (perro o gato) para la nueva imagen.');
      return;
    }
    setError(null);
    setMsg(null);
    setRegeneratingImage(true);
    try {
      const { imageUrl, socialPostId } = await regenerateBlogPostImage({
        postId: editingSourceRefId,
        species: regenSpecies,
        extraInstructions: regenInstructions,
      });
      if (socialPostId) {
        setEditingId(socialPostId);
      }
      setPreviewUrl(imageUrl);
      setPreviewIsVideo(false);
      setImageRegenerated(true);
      setVideoReady(false);
      setMsg('Imagen regenerada. Ahora genera el video antes de programar la publicacion.');
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo regenerar la imagen.');
    } finally {
      setRegeneratingImage(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!editingId) return;
    setError(null);
    setMsg(null);
    setGeneratingVideo(true);
    try {
      const result = await generateSocialPostVideo(editingId);
      if (result.upgraded && result.mediaUrl) {
        setPreviewUrl(result.mediaUrl);
        setPreviewIsVideo(true);
        setVideoReady(true);
        setMsg(
          result.hasAudio
            ? 'Video generado con voz y subtitulos. Ya podes programar la publicacion.'
            : 'Video generado (mudo, fallo el audio/subtitulos). Ya podes programar la publicacion.',
        );
        await load();
      } else {
        setError(result.reason || 'No se pudo generar el video (el borrador ya no estaba disponible).');
      }
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo generar el video.');
    } finally {
      setGeneratingVideo(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMsg(null);

    if (imageRegenerated && !videoReady) {
      setError('Genera el video antes de programar la publicacion (regeneraste la imagen pero todavia no hay video).');
      return;
    }

    if (!editingId && !file) {
      setError('Elegi una imagen o video para publicar.');
      return;
    }

    if (!form.scheduledAt) {
      setError('Elegi la fecha y hora de publicacion.');
      return;
    }

    if (form.platforms.length === 0) {
      setError('Elegi al menos una red social.');
      return;
    }

    const scheduledAtIso = new Date(form.scheduledAt).toISOString();

    setSaving(true);
    try {
      if (editingId) {
        await updateAdminSocialPost({
          id: editingId,
          caption: form.caption.trim() || null,
          scheduledAt: scheduledAtIso,
          platforms: form.platforms,
        });
        setMsg('Publicacion actualizada correctamente.');
      } else {
        const { mediaUrl, mediaType } = await uploadAdminSocialMedia({ file: file as File });
        await createAdminSocialPost({
          mediaUrl,
          mediaType,
          caption: form.caption.trim() || null,
          scheduledAt: scheduledAtIso,
          platforms: form.platforms,
        });
        setMsg('Publicacion programada correctamente.');
      }
      closeForm();
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo guardar la publicacion.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (row: SocialPost) => {
    if (!window.confirm('¿Cancelar esta publicacion programada?')) {
      return;
    }
    try {
      setError(null);
      setMsg(null);
      await cancelAdminSocialPost(row.id);
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo cancelar la publicacion.');
    }
  };

  const handleDelete = async (row: SocialPost) => {
    if (!window.confirm('¿Eliminar esta publicacion? Esta accion no se puede deshacer.')) {
      return;
    }
    try {
      setError(null);
      setMsg(null);
      await deleteAdminSocialPost(row.id);
      setRows((current) => current.filter((r) => r.id !== row.id));
      setMsg('Publicacion eliminada correctamente.');
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo eliminar la publicacion.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-bold text-slate-900">Publicaciones en redes sociales</p>
          <p className="text-xs text-slate-500">
            Facebook, Instagram y YouTube se publican solos al llegar la fecha programada. TikTok todavia no esta soportado.
          </p>
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
            Nueva publicacion
          </button>
        </div>
      </div>

      {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {msg && <p className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-600">{msg}</p>}

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 p-4">
        <Sparkles size={16} className="shrink-0 text-emerald-500" />
        <p className="mr-2 text-sm font-semibold text-slate-700">Generar reel para una guia:</p>
        <select
          value={selectedGuideSlug}
          onChange={(e) => setSelectedGuideSlug(e.target.value)}
          className="min-w-[220px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
        >
          <option value="">Elegi una guia...</option>
          {guideOptions.map((g) => (
            <option key={g.slug} value={g.slug}>
              {g.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleGenerateGuideReel}
          disabled={generatingGuideReel || !selectedGuideSlug}
          className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {generatingGuideReel ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {generatingGuideReel ? 'Generando...' : 'Generar reel'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-slate-800">{editingId ? 'Editar publicacion' : 'Nueva publicacion'}</p>
            <button type="button" onClick={closeForm} className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {!editingId && (
              <label className="sm:col-span-2 text-xs font-semibold text-slate-500">
                Imagen o video
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm"
                  onChange={handleFileChange}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
                />
              </label>
            )}

            {previewUrl && (
              <div className="sm:col-span-2">
                {previewIsVideo ? (
                  <video src={previewUrl} controls className="max-h-48 rounded-xl border border-slate-200" />
                ) : (
                  <img src={previewUrl} alt="Vista previa" className="max-h-48 rounded-xl border border-slate-200 object-contain" />
                )}
              </div>
            )}

            {editingId && editingSource === 'blog_auto' && (
              <div className="sm:col-span-2 space-y-2 rounded-xl border border-dashed border-slate-300 p-3">
                <p className="text-xs font-semibold text-slate-500">Regenerar imagen con IA (opcional)</p>
                <div className="flex flex-wrap gap-2">
                  {(['perro', 'gato'] as const).map((sp) => (
                    <button
                      key={sp}
                      type="button"
                      onClick={() => setRegenSpecies(sp)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        regenSpecies === sp ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500'
                      }`}
                    >
                      {sp === 'perro' ? 'Perro' : 'Gato'}
                    </button>
                  ))}
                </div>
                <textarea
                  value={regenInstructions}
                  onChange={(e) => setRegenInstructions(e.target.value)}
                  rows={2}
                  placeholder="Indicaciones extra para la nueva imagen (opcional). Ej: que se lo vea jugando en un parque"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRegenerateImage}
                    disabled={regeneratingImage || !regenSpecies}
                    className="flex items-center gap-1.5 rounded-full bg-slate-800 px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
                  >
                    {regeneratingImage ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                    {regeneratingImage ? 'Regenerando...' : 'Regenerar imagen'}
                  </button>
                  {imageRegenerated && (
                    <button
                      type="button"
                      onClick={handleGenerateVideo}
                      disabled={generatingVideo || videoReady}
                      className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
                    >
                      {generatingVideo ? <Loader2 size={14} className="animate-spin" /> : <Film size={14} />}
                      {generatingVideo ? 'Generando video...' : videoReady ? 'Video listo' : 'Generar video'}
                    </button>
                  )}
                </div>
                {imageRegenerated && !videoReady && (
                  <p className="flex items-start gap-1.5 text-xs font-semibold text-amber-600">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    Genera el video antes de programar la publicacion: si no, va a quedar como imagen fija y YouTube va a fallar.
                  </p>
                )}
              </div>
            )}

            <label className="sm:col-span-2 text-xs font-semibold text-slate-500">
              Texto / caption (opcional)
              <textarea
                value={form.caption}
                onChange={(e) => setForm((f) => ({ ...f, caption: e.target.value }))}
                rows={3}
                placeholder="Ej: Consejos para el cuidado dental de tu mascota 🐾"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800"
              />
            </label>

            <label className="text-xs font-semibold text-slate-500">
              Fecha y hora de publicacion
              <input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                className="mt-1 w-full rounded-full border border-slate-200 px-4 py-2 text-sm font-normal text-slate-800"
              />
            </label>

            <div className="text-xs font-semibold text-slate-500">
              Redes sociales
              <div className="mt-1 flex flex-wrap gap-2">
                {PLATFORM_OPTIONS.map(({ value, label, icon: Icon, supported }) => {
                  const active = form.platforms.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => togglePlatform(value)}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                        active ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500'
                      }`}
                    >
                      <Icon size={14} /> {label}
                      {!supported && <span className="text-[10px] font-normal text-slate-400">(pronto)</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving || (imageRegenerated && !videoReady)}
            className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-5 py-2 text-sm font-bold text-white disabled:opacity-70"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {editingId ? 'Guardar cambios' : 'Programar publicacion'}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {rows.length === 0 && !loading && (
          <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
            Todavia no hay publicaciones programadas.
          </p>
        )}

        {rows.map((row) => (
          <div key={row.id} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                {row.mediaType === 'video' ? (
                  <video src={row.mediaUrl} className="h-16 w-16 rounded-xl border border-slate-200 object-cover" />
                ) : (
                  <img src={row.mediaUrl} alt="" className="h-16 w-16 rounded-xl border border-slate-200 object-cover" />
                )}
                <div>
                  <p className="text-sm text-slate-700 line-clamp-2">{row.caption || <span className="text-slate-400">Sin texto</span>}</p>
                  <p className="text-xs text-slate-400">
                    {row.scheduledAt ? `Programado para ${formatDate(row.scheduledAt)}` : 'Sin fecha de publicacion todavia'}
                    {row.source === 'blog_auto' && ' · Generado automaticamente desde el blog'}
                  </p>
                </div>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${POST_STATUS_CLASS[row.status]}`}>
                {POST_STATUS_LABEL[row.status]}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {row.targets.map((target) => {
                const option = PLATFORM_OPTIONS.find((p) => p.value === target.platform);
                const Icon = option?.icon;
                return (
                  <span
                    key={target.platform}
                    title={target.error || undefined}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${TARGET_STATUS_CLASS[target.status]}`}
                  >
                    {Icon && <Icon size={12} />}
                    {option?.label || target.platform} · {TARGET_STATUS_LABEL[target.status]}
                  </span>
                );
              })}
            </div>

            {isPendingVideoUpgrade(row) && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-700">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>
                  Todavia puede llegar la version en video con voz y subtitulos (se genera automaticamente hasta ~45 min despues de creado el borrador).
                  Espera un rato antes de programarlo para no quedarte con la imagen fija.
                </span>
              </div>
            )}

            {(row.status === 'scheduled' || row.status === 'draft') && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEditForm(row)}
                  className="flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  <Pencil size={14} /> {row.status === 'draft' ? 'Revisar y programar' : 'Editar'}
                </button>
                {row.status === 'scheduled' && (
                  <button
                    type="button"
                    onClick={() => handleCancel(row)}
                    className="flex items-center gap-1.5 rounded-full border border-amber-200 px-4 py-2 text-xs font-semibold text-amber-600"
                  >
                    <XCircle size={14} /> Cancelar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(row)}
                  className="flex items-center gap-1.5 rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-600"
                >
                  <Trash2 size={14} /> {row.status === 'draft' ? 'Descartar' : 'Eliminar'}
                </button>
              </div>
            )}

            {row.status !== 'scheduled' && row.status !== 'draft' && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => handleDelete(row)}
                  className="flex items-center gap-1.5 rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-600"
                >
                  <Trash2 size={14} /> Eliminar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
