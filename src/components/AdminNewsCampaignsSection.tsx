import { useCallback, useEffect, useState } from 'react';
import {
  CalendarClock,
  Image as ImageIcon,
  Link2,
  Loader2,
  Megaphone,
  Pencil,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useAppState } from '../context/AppStateContext';
import {
  cancelAdminNewsCampaign,
  createAdminNewsCampaign,
  deleteAdminNewsCampaign,
  fetchAdminNewsCampaigns,
  updateAdminNewsCampaign,
} from '../lib/supabase';
import type { NewsCampaign, NewsCampaignStatus } from '../types';

const STATUS_LABELS: Record<NewsCampaignStatus, string> = {
  scheduled: 'Programado',
  sending: 'Enviando...',
  sent: 'Enviado',
  failed: 'Con errores',
  cancelled: 'Cancelado',
};

const STATUS_STYLES: Record<NewsCampaignStatus, string> = {
  scheduled: 'bg-emerald-100 text-emerald-700',
  sending: 'bg-amber-100 text-amber-700',
  sent: 'bg-slate-200 text-slate-700',
  failed: 'bg-rose-100 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const EMPTY_FORM = {
  subject: '',
  bodyText: '',
  imageUrl: '',
  buttonText: '',
  buttonUrl: '',
  scheduledAt: '',
};

// Convierte un ISO (UTC) a formato "YYYY-MM-DDTHH:mm" para precargar un input
// datetime-local, respetando la hora local del navegador del admin.
function isoToLocalInputValue(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
}

export function AdminNewsCampaignsSection() {
  const { user } = useAppState();
  const [campaigns, setCampaigns] = useState<NewsCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const rows = await fetchAdminNewsCampaigns();
      setCampaigns(rows);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudieron cargar las campañas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const handleEdit = (campaign: NewsCampaign) => {
    setForm({
      subject: campaign.subject,
      bodyText: campaign.bodyText,
      imageUrl: campaign.imageUrl || '',
      buttonText: campaign.buttonText || '',
      buttonUrl: campaign.buttonUrl || '',
      scheduledAt: isoToLocalInputValue(campaign.scheduledAt),
    });
    setEditingId(campaign.id);
    setError(null);
    setMsg(null);
  };

  const handleCancel = async (id: string) => {
    if (!window.confirm('¿Cancelar el envío programado de esta campaña?')) return;
    try {
      await cancelAdminNewsCampaign(id);
      setMsg('Campaña cancelada.');
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo cancelar la campaña.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar esta campaña definitivamente?')) return;
    try {
      await deleteAdminNewsCampaign(id);
      setMsg('Campaña eliminada.');
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo eliminar la campaña.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMsg(null);

    if (!form.subject.trim()) { setError('El asunto es obligatorio.'); return; }
    if (!form.bodyText.trim()) { setError('El texto del mensaje es obligatorio.'); return; }
    if (!form.scheduledAt) { setError('Elegí fecha y hora de envío.'); return; }
    if ((form.buttonText.trim() && !form.buttonUrl.trim()) || (!form.buttonText.trim() && form.buttonUrl.trim())) {
      setError('Para mostrar un botón completá el texto y el link.');
      return;
    }

    const scheduledIso = new Date(form.scheduledAt).toISOString();

    setSaving(true);
    try {
      const payload = {
        subject: form.subject.trim(),
        bodyText: form.bodyText.trim(),
        imageUrl: form.imageUrl.trim() || null,
        buttonText: form.buttonText.trim() || null,
        buttonUrl: form.buttonUrl.trim() || null,
        scheduledAt: scheduledIso,
      };

      if (editingId) {
        await updateAdminNewsCampaign(editingId, payload);
        setMsg('Campaña actualizada correctamente.');
      } else {
        if (!user?.id) throw new Error('No se pudo identificar al usuario admin.');
        await createAdminNewsCampaign({ ...payload, createdBy: user.id });
        setMsg('Campaña programada correctamente.');
      }

      resetForm();
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo guardar la campaña.');
    } finally {
      setSaving(false);
    }
  };

  const showButtonPreview = Boolean(form.buttonText.trim() && form.buttonUrl.trim());

  return (
    <div className="space-y-5">
      <div>
        <p className="flex items-center gap-2 font-bold text-slate-900">
          <Megaphone size={16} /> Novedades por email
        </p>
        <p className="text-sm text-slate-500">
          Redactá un correo y programá cuándo enviarlo a todos los usuarios que aceptaron recibir novedades.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-slate-800">{editingId ? 'Editar campaña' : 'Nueva campaña'}</p>
          {editingId && (
            <button type="button" onClick={resetForm} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700">
              <X size={13} /> Cancelar edición
            </button>
          )}
        </div>

        <label className="block text-sm text-slate-700">
          Asunto
          <input
            value={form.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            placeholder="Ej: Ya podés agendar vacunas desde el celular"
            className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </label>

        <label className="block text-sm text-slate-700">
          Texto del mensaje
          <textarea
            value={form.bodyText}
            onChange={(e) => setForm((f) => ({ ...f, bodyText: e.target.value }))}
            rows={5}
            placeholder="Contales la novedad..."
            className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </label>

        <label className="block text-sm text-slate-700">
          <span className="inline-flex items-center gap-1"><ImageIcon size={13} /> URL de imagen (opcional)</span>
          <input
            value={form.imageUrl}
            onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
            placeholder="https://..."
            className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm text-slate-700">
            Texto del botón (opcional)
            <input
              value={form.buttonText}
              onChange={(e) => setForm((f) => ({ ...f, buttonText: e.target.value }))}
              placeholder="Ver novedad"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </label>
          <label className="block text-sm text-slate-700">
            <span className="inline-flex items-center gap-1"><Link2 size={13} /> Link del botón</span>
            <input
              value={form.buttonUrl}
              onChange={(e) => setForm((f) => ({ ...f, buttonUrl: e.target.value }))}
              placeholder="https://www.aipetfriendly.ar/..."
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </label>
        </div>

        <label className="block text-sm text-slate-700">
          <span className="inline-flex items-center gap-1"><CalendarClock size={13} /> Fecha y hora de envío</span>
          <input
            type="datetime-local"
            value={form.scheduledAt}
            onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
            className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </label>

        {/* Vista previa del email, con el mismo formato que reciben los usuarios */}
        {(form.subject || form.bodyText) && (
          <div className="overflow-hidden rounded-2xl border border-emerald-100">
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-4 text-white">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-100">AiPetFriendly</p>
              <p className="mt-1 text-lg font-extrabold">{form.subject || 'Asunto del correo'}</p>
            </div>
            <div className="space-y-3 bg-white p-4">
              {form.imageUrl && (
                <img src={form.imageUrl} alt="" className="w-full rounded-xl border border-slate-100 object-cover" style={{ maxHeight: 180 }} />
              )}
              <p className="whitespace-pre-wrap text-sm text-slate-700">{form.bodyText || 'Texto del mensaje...'}</p>
              {showButtonPreview && (
                <div className="pt-1 text-center">
                  <span className="inline-block rounded-full bg-emerald-500 px-5 py-2 text-sm font-bold text-white">
                    {form.buttonText}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
        {msg && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</p>}

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-70"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Programar envío'}
        </button>
      </form>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-700">Campañas</p>
        {loading && <p className="text-sm text-slate-500">Cargando...</p>}
        {!loading && campaigns.length === 0 && (
          <p className="text-sm text-slate-500">Todavía no creaste ninguna campaña.</p>
        )}
        {campaigns.map((campaign) => (
          <div key={campaign.id} className="rounded-2xl border border-slate-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">{campaign.subject}</p>
                <p className="text-xs text-slate-500">Programado: {formatDate(campaign.scheduledAt)}</p>
                {campaign.status === 'sent' && (
                  <p className="text-xs text-slate-500">Enviado a {campaign.usersNotified} usuarios{campaign.sentAt ? ` · ${formatDate(campaign.sentAt)}` : ''}</p>
                )}
                {campaign.errorMessage && (
                  <p className="text-xs text-rose-600">{campaign.errorMessage}</p>
                )}
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[campaign.status]}`}>
                {STATUS_LABELS[campaign.status]}
              </span>
            </div>

            {campaign.status === 'scheduled' && (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleEdit(campaign)}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                >
                  <Pencil size={12} /> Editar
                </button>
                <button
                  type="button"
                  onClick={() => handleCancel(campaign.id)}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-200"
                >
                  <X size={12} /> Cancelar
                </button>
              </div>
            )}

            {(campaign.status === 'cancelled' || campaign.status === 'failed' || campaign.status === 'sent') && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => handleDelete(campaign.id)}
                  className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100"
                >
                  <Trash2 size={12} /> Eliminar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
