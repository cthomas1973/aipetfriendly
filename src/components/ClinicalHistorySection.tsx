import { FormEvent, useMemo, useState } from 'react';
import { ClipboardList, Download, Mail, PlusCircle, X } from 'lucide-react';
import { useClinical } from '../hooks/useClinical';
import type { ClinicalEntryCategory } from '../types';

const inputCls = 'mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200';
const labelCls = 'block text-sm font-medium text-slate-700';

const categoryMap: Array<{ key: ClinicalEntryCategory | 'all'; label: string; emoji: string }> = [
  { key: 'all', label: 'Todo', emoji: '🧾' },
  { key: 'medication', label: 'Medicamentos', emoji: '💊' },
  { key: 'deworming', label: 'Desparasitarios', emoji: '🪱' },
  { key: 'vaccine', label: 'Vacunas', emoji: '💉' },
  { key: 'treatment', label: 'Tratamientos', emoji: '🩺' },
  { key: 'clinical_note', label: 'Notas', emoji: '📝' },
];

export function ClinicalHistorySection() {
  const {
    selectedPet,
    timeline,
    activeFilter,
    setActiveFilter,
    addClinicalNote,
    generateClinicalPdf,
    sendClinicalPdfByEmail,
  } = useClinical();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<ClinicalEntryCategory>('clinical_note');
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [showNoteForm, setShowNoteForm] = useState(false);

  const canRender = useMemo(() => Boolean(selectedPet), [selectedPet]);

  const onAddNote = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPet) {
      return;
    }

    addClinicalNote({
      petId: selectedPet.id,
      title,
      content,
      category,
      eventDate,
    });

    setTitle('');
    setContent('');
    setCategory('clinical_note');
    setShowNoteForm(false);
    setStatus('Nota clinica agregada correctamente.');
  };

  const onDownload = async () => {
    try {
      const file = await generateClinicalPdf('/logo-aipetfriendly.png');
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.fileName;
      link.click();
      URL.revokeObjectURL(url);
      setStatus('PDF generado y descargado.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudo generar el PDF.');
    }
  };

  const onSendEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sendingEmail) {
      return;
    }

    setSendingEmail(true);
    setEmailOpen(false);
    setStatus('Enviando PDF por email...');

    try {
      await sendClinicalPdfByEmail(email, '/logo-aipetfriendly.png');
      setStatus('PDF enviado por email correctamente.');
      setEmail('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudo enviar el email.');
      setEmailOpen(true);
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <section className="space-y-5 pb-2">
      <div className="pt-1 text-center">
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
          <ClipboardList size={26} />
        </span>
        <h2 className="mt-3 text-2xl font-extrabold text-slate-900">Historial Clinico</h2>
        <p className="mt-1 text-sm text-slate-500">Linea de tiempo unificada de tu mascota.</p>
      </div>

      {!canRender && (
        <div className="rounded-3xl bg-white px-5 py-8 text-center shadow-sm">
          <p className="text-sm text-slate-400">Selecciona una mascota para ver su historial.</p>
        </div>
      )}

      {canRender && (
        <>
          {/* category filter */}
          <div className="flex flex-wrap gap-2">
            {categoryMap.map(item => (
              <button key={item.key} type="button" onClick={() => setActiveFilter(item.key)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  activeFilter === item.key
                    ? 'bg-emerald-500 text-white'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200'
                }`}>
                {item.emoji} {item.label}
              </button>
            ))}
          </div>

          {/* action buttons */}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onDownload}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition active:bg-emerald-600">
              <Download size={15} /> Descargar PDF
            </button>
            <button type="button" onClick={() => setEmailOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-700">
              <Mail size={15} /> Enviar Email
            </button>
          </div>

          {/* timeline */}
          <div className="rounded-3xl bg-white p-4 shadow-sm">
            {timeline.length === 0 && (
              <p className="py-4 text-center text-sm text-slate-400">Sin registros clinicos.</p>
            )}
            {timeline.map(entry => (
              <article key={entry.id} className="mb-3 last:mb-0">
                <div className="flex items-start gap-3">
                  <span className="mt-1 flex-shrink-0 text-base">
                    {categoryMap.find(c => c.key === entry.category)?.emoji ?? '📋'}
                  </span>
                  <div className="min-w-0 flex-1 rounded-2xl bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">{entry.category}</p>
                    <h3 className="font-semibold text-slate-800">{entry.title}</h3>
                    <p className="mt-0.5 text-sm text-slate-600">{entry.description}</p>
                    <p className="mt-1.5 text-xs text-slate-400">{new Date(entry.eventDate).toLocaleDateString()}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* add note */}
          {!showNoteForm ? (
            <button type="button" onClick={() => setShowNoteForm(true)}
              className="flex w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-emerald-300 bg-white/80 py-4 font-semibold text-emerald-600 transition hover:bg-white">
              <PlusCircle size={18} /> Agregar nota clinica
            </button>
          ) : (
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <h3 className="mb-4 font-bold text-slate-900">Nueva nota clinica</h3>
              <form onSubmit={onAddNote} className="space-y-4">
                <label className={labelCls}>
                  Titulo *
                  <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} required />
                </label>
                <label className={labelCls}>
                  Categoria
                  <select value={category} onChange={e => setCategory(e.target.value as ClinicalEntryCategory)} className={inputCls}>
                    <option value="clinical_note">Nota clinica</option>
                    <option value="treatment">Tratamiento</option>
                    <option value="vaccine">Vacuna</option>
                    <option value="deworming">Desparasitario</option>
                    <option value="medication">Medicamento</option>
                  </select>
                </label>
                <label className={labelCls}>
                  Fecha *
                  <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className={inputCls} required />
                </label>
                <label className={labelCls}>
                  Descripcion *
                  <textarea value={content} onChange={e => setContent(e.target.value)}
                    className={`${inputCls} min-h-24 resize-none`} required />
                </label>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowNoteForm(false)}
                    className="w-full rounded-full border-2 border-slate-200 bg-white py-3.5 font-semibold text-slate-600">Cancelar</button>
                  <button type="submit"
                    className="w-full rounded-full bg-emerald-500 py-3.5 font-bold text-white">Guardar</button>
                </div>
              </form>
            </div>
          )}
        </>
      )}

      {/* email modal */}
      {emailOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
          <form onSubmit={onSendEmail} className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Enviar informe por email</h3>
              <button type="button" onClick={() => setEmailOpen(false)} className="text-slate-400">
                <X size={20} />
              </button>
            </div>
            <label className={labelCls}>
              Email de destino
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="destino@email.com" className={inputCls} required />
            </label>
            <div className="mt-4 flex gap-3">
              <button type="button" onClick={() => setEmailOpen(false)}
                className="w-full rounded-full border-2 border-slate-200 py-3 font-semibold text-slate-600">Cancelar</button>
              <button type="submit"
                disabled={sendingEmail}
                className="w-full rounded-full bg-emerald-500 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-70">
                {sendingEmail ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {status && (
        <p className={`rounded-2xl px-4 py-2.5 text-sm ${status.includes('error') || status.includes('pudo') ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'}`}>
          {status}
        </p>
      )}
    </section>
  );
}
