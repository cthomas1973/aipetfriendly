import { useCallback, useEffect, useState } from 'react';
import { Inbox, Loader2, Mail, MailOpen, Paperclip, Send } from 'lucide-react';
import {
  fetchAdminInboundEmails,
  fetchAdminInboundEmailReplies,
  markAdminInboundEmailRead,
  sendAdminInboundEmailReply,
} from '../lib/supabase';
import type { InboundEmailRow, InboundEmailReply } from '../types';

// Los correos entrantes pueden traer solo HTML (sin version texto plano).
// Para evitar riesgos de XSS nunca los renderizamos con dangerouslySetInnerHTML:
// los "limpiamos" a texto plano (React escapa el resultado automaticamente).
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
}

export function AdminInboxSection() {
  const [emails, setEmails] = useState<InboundEmailRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replies, setReplies] = useState<InboundEmailReply[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const rows = await fetchAdminInboundEmails();
      setEmails(rows);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo cargar la bandeja de entrada.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = emails.find((email) => email.id === selectedId) || null;

  const openEmail = useCallback(async (email: InboundEmailRow) => {
    setSelectedId(email.id);
    setReplyText('');
    setMsg(null);
    try {
      const rows = await fetchAdminInboundEmailReplies(email.id);
      setReplies(rows);
    } catch {
      setReplies([]);
    }
    if (!email.isRead) {
      try {
        await markAdminInboundEmailRead(email.id);
        setEmails((current) => current.map((item) => (item.id === email.id ? { ...item, isRead: true } : item)));
      } catch {
        // No bloquea la lectura si falla marcar como leido.
      }
    }
  }, []);

  const sendReply = useCallback(async () => {
    if (!selected || !replyText.trim()) return;
    try {
      setSending(true);
      setError(null);
      setMsg(null);
      await sendAdminInboundEmailReply(selected.id, replyText.trim());
      setReplyText('');
      setMsg('Respuesta enviada correctamente.');
      const rows = await fetchAdminInboundEmailReplies(selected.id);
      setReplies(rows);
      const repliedAt = new Date().toISOString();
      setEmails((current) => current.map((item) => (item.id === selected.id ? { ...item, repliedAt } : item)));
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo enviar la respuesta.');
    } finally {
      setSending(false);
    }
  }, [selected, replyText]);

  const unreadCount = emails.filter((email) => !email.isRead).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-bold text-slate-900">
            <Inbox size={16} /> notificacion@aipetfriendly.ar
          </p>
          <p className="text-sm text-slate-500">{unreadCount > 0 ? `${unreadCount} sin leer` : 'Todo leido'}</p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-70"
        >
          {loading ? 'Cargando...' : 'Actualizar'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <div className="max-h-[520px] overflow-y-auto rounded-2xl border border-slate-200">
          {emails.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No hay correos recibidos todavia.</p>
          ) : (
            emails.map((email) => (
              <button
                key={email.id}
                type="button"
                onClick={() => openEmail(email)}
                className={`block w-full border-b border-slate-100 px-4 py-3 text-left text-sm transition ${
                  selectedId === email.id ? 'bg-emerald-50' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  {email.isRead ? (
                    <MailOpen size={14} className="shrink-0 text-slate-400" />
                  ) : (
                    <Mail size={14} className="shrink-0 text-emerald-600" />
                  )}
                  <span className={`truncate ${email.isRead ? 'font-normal text-slate-600' : 'font-bold text-slate-900'}`}>
                    {email.fromAddress}
                  </span>
                  {email.hasAttachments && <Paperclip size={13} className="shrink-0 text-amber-500" />}
                </div>
                <p className={`mt-1 truncate ${email.isRead ? 'text-slate-500' : 'font-semibold text-slate-800'}`}>
                  {email.subject || '(sin asunto)'}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">{formatDate(email.receivedAt)}</p>
              </button>
            ))
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          {!selected ? (
            <p className="text-sm text-slate-500">Selecciona un correo para verlo.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="font-bold text-slate-900">{selected.subject || '(sin asunto)'}</p>
                <p className="text-sm text-slate-500">De: {selected.fromAddress}</p>
                <p className="text-xs text-slate-400">{formatDate(selected.receivedAt)}</p>
              </div>

              {selected.hasAttachments && (
                <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
                  <Paperclip size={16} className="mt-0.5 shrink-0" />
                  <span>
                    Este correo tenia {selected.attachmentCount} adjunto{selected.attachmentCount === 1 ? '' : 's'}. No se
                    guardan en el panel: se reenviaron a tu correo personal para que los veas ahi.
                  </span>
                </div>
              )}

              <div className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                {selected.textBody?.trim() || (selected.htmlBody ? stripHtml(selected.htmlBody) : '(sin contenido)')}
              </div>

              {replies.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase text-slate-400">Respuestas enviadas</p>
                  {replies.map((reply) => (
                    <div key={reply.id} className="rounded-xl bg-emerald-50 p-3 text-sm text-slate-700">
                      <p className="whitespace-pre-wrap">{reply.body}</p>
                      <p className="mt-1 text-xs text-slate-400">{formatDate(reply.createdAt)}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={4}
                  placeholder="Escribi tu respuesta..."
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
                {msg && <p className="text-sm text-emerald-600">{msg}</p>}
                <button
                  type="button"
                  onClick={sendReply}
                  disabled={sending || !replyText.trim()}
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-70"
                >
                  {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  {sending ? 'Enviando...' : 'Responder'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
