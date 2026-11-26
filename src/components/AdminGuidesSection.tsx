import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Monitor, Plus, Save, Smartphone, Trash2 } from 'lucide-react';
import { PET_GUIDES, PET_GUIDE_CATEGORY_LABELS, type PetGuideCategory, type PetGuidePetType } from '../data/petGuides';
import { useAppState, useSessionGuard } from '../context/AppStateContext';
import {
  draftToGuide, emptySection, guideSlug, guideTypeScript, newGuideDraft, nextGuideDate,
  normalizeGuideImage, parseGuideText, sectionImageName, storedGuideDraft, validateGuideDraft,
  type GuideDraft, type GuideDraftImage, type GuideDraftSection,
} from '../lib/adminGuideDraft';
import { PetGuideContent } from './PetGuideContent';

const inputClass = 'mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal';
const buttonClass = 'rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40';

export function AdminGuidesSection() {
  const { user } = useAppState();
  const assertSession = useSessionGuard(user?.id);
  const [draft, setDraft] = useState<GuideDraft>(() => newGuideDraft(PET_GUIDES));
  const [mobile, setMobile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [importText, setImportText] = useState('');
  const urls = useRef(new Set<string>());
  const guide = useMemo(() => draftToGuide(draft, true), [draft]);
  const storageKey = user?.id;
  const minimumDate = nextGuideDate(PET_GUIDES);

  useEffect(() => {
    const allocated = urls.current;
    return () => { allocated.forEach((url) => URL.revokeObjectURL(url)); allocated.clear(); };
  }, []);

  const edit = (change: Partial<GuideDraft>) => {
    setDraft((current) => ({ ...current, ...change, ready: false }));
    setMessage('');
  };
  const editSection = (id: string, change: Partial<GuideDraftSection>) => {
    setDraft((current) => ({
      ...current, ready: false, sections: current.sections.map((section) => section.id === id ? { ...section, ...change } : section),
    }));
    setMessage('');
  };
  const previewImage = useCallback((blob: Blob, alt: string): GuideDraftImage => {
    const src = URL.createObjectURL(blob);
    urls.current.add(src);
    return { blob, alt, src };
  }, []);

  const loadImage = useCallback(async (file: File | undefined, sectionId?: string) => {
    if (!file) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const blob = await normalizeGuideImage(file);
      assertSession();
      const image = previewImage(blob, '');
      setDraft((current) => ({
        ...current, ready: false,
        ...(sectionId ? { sections: current.sections.map((section) => section.id === sectionId ? { ...section, image } : section) } : { cover: image }),
      }));
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo cargar la imagen.');
    } finally { setBusy(false); }
  }, [assertSession, previewImage]);

  const moveSection = (index: number, offset: number) => {
    const sections = [...draft.sections];
    const target = index + offset;
    if (target < 0 || target >= sections.length) return;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    edit({ sections });
  };
  const moveImage = (sourceId: string, targetId: string) => {
    const source = draft.sections.find((section) => section.id === sourceId);
    const target = draft.sections.find((section) => section.id === targetId);
    if (!source || !target) return;
    edit({ sections: draft.sections.map((section) => section.id === sourceId ? { ...section, image: target.image }
      : section.id === targetId ? { ...section, image: source.image } : section) });
  };

  const store = useCallback(async (action: 'read' | 'write') => {
    if (!storageKey) { setError('Necesitás una sesión administrativa para guardar borradores.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      if (action === 'read' && !window.confirm('Recuperar el borrador guardado reemplazará lo que estás editando. ¿Continuar?')) return;
      const stored = await storedGuideDraft(action, storageKey, draft);
      assertSession();
      if (action === 'read') {
        if (!stored) throw new Error('No hay ningún borrador guardado en este navegador.');
        setDraft({
          ...stored,
          cover: stored.cover ? previewImage(stored.cover.blob, stored.cover.alt) : null,
          sections: stored.sections.map((section) => ({
            ...section, image: section.image ? previewImage(section.image.blob, section.image.alt) : null,
          })),
        });
      }
      setMessage(action === 'write' ? 'Borrador guardado con sus imágenes en este navegador.' : 'Borrador recuperado con sus imágenes.');
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo acceder al borrador.');
    } finally { setBusy(false); }
  }, [assertSession, draft, previewImage, storageKey]);

  const exportGuide = useCallback(async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const publishedGuide = validateGuideDraft(draft, PET_GUIDES);
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const folder = `public/guides/${publishedGuide.slug}`;
      if (draft.cover) zip.file(`${folder}/portada.jpg`, await draft.cover.blob.arrayBuffer());
      for (const [index, section] of draft.sections.entries()) {
        if (section.image) zip.file(`${folder}/${sectionImageName(section, index)}`, await section.image.blob.arrayBuffer());
      }
      zip.file('guia-petguides.ts.txt', guideTypeScript(publishedGuide));
      zip.file('INTEGRACION.txt', [
        'Este paquete NO publica directamente en la web.',
        '1. Copiar public/guides/ al repositorio.',
        '2. Insertar el objeto de guia-petguides.ts.txt en PET_GUIDES de src/data/petGuides.ts.',
        `3. Estado: ${draft.ready ? `habilitada para la cola, fecha base ${draft.publishedAt}` : 'pendiente de revisión veterinaria; no se publicará'}.`,
        '4. Confirmar que las guías habilitadas tienen fechas separadas por al menos 7 días antes de integrar paquetes adicionales.',
        '5. Ejecutar npm run build; genera sitemap.xml y guides-feed.json.',
        '6. Revisar la guía y las imágenes; luego integrar y desplegar con autorización.',
        'Una guía programada necesita actualizar el build/feed cuando llegue su fecha para SEO, notificaciones y reels.',
        'Todas las imágenes son JPG 1600 x 900, sin recortes ni deformaciones.',
      ].join('\n'));
      const blob = await zip.generateAsync({ type: 'blob' });
      assertSession();
      const url = URL.createObjectURL(blob);
      urls.current.add(url);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${publishedGuide.slug}-guia.zip`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setMessage('Paquete exportado. Falta integrarlo al repositorio y desplegarlo; no se publicó desde este panel.');
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo exportar la guía.');
    } finally { setBusy(false); }
  }, [assertSession, draft]);

  const addImportedText = () => {
    if (!importText.trim()) { setError('Pegá o cargá un texto antes de importarlo.'); return; }
    if (draft.sections.some((section) => section.text || section.heading || section.image)
      && !window.confirm('Importar el texto reemplazará las secciones y sus imágenes. ¿Continuar?')) return;
    edit({ sections: parseGuideText(importText) });
    setImportText(''); setError('');
  };

  if (!user?.isAdmin) return <p role="alert">Este constructor requiere una sesión de administrador.</p>;

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-lg font-bold text-slate-900">Constructor de guías</h2>
        <p className="mt-1 text-sm text-slate-600">
          Prepará una guía con el formato público actual. Este panel exporta un paquete para el repositorio:
          no publica ni modifica guías existentes.
        </p>
      </header>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass} disabled={busy} onClick={() => void store('write')}><Save className="mr-1 inline" size={16} />Guardar borrador</button>
        <button type="button" className={buttonClass} disabled={busy} onClick={() => void store('read')}>Recuperar borrador</button>
      </div>
      <p className="text-xs text-slate-500">El borrador incluye imágenes. Se guarda solo en este navegador y cuenta, no se sincroniza con otros dispositivos.</p>
      <fieldset disabled={busy} className="grid min-w-0 gap-5 xl:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <label className="block text-sm font-semibold">Título<input className={inputClass} value={draft.title} onChange={(e) => edit({ title: e.target.value })} /></label>
          <label className="block text-sm font-semibold">Slug<input className={inputClass} value={draft.slug || guideSlug(draft.title)} onChange={(e) => edit({ slug: guideSlug(e.target.value) })} /></label>
          <label className="block text-sm font-semibold">Categoría
            <select className={inputClass} value={draft.category} onChange={(e) => edit({ category: e.target.value as PetGuideCategory })}>
              {Object.entries(PET_GUIDE_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className="flex gap-4">
            {(['perro', 'gato'] as PetGuidePetType[]).map((type) => (
              <label key={type} className="text-sm"><input type="checkbox" checked={draft.petTypes.includes(type)}
                onChange={(e) => edit({ petTypes: e.target.checked ? [...draft.petTypes, type] : draft.petTypes.filter((item) => item !== type) })} /> {type === 'perro' ? 'Perros' : 'Gatos'}</label>
            ))}
          </div>
          <label className="block text-sm font-semibold">Resumen<textarea className={inputClass} rows={3} value={draft.summary} onChange={(e) => edit({ summary: e.target.value })} /></label>
          <label className="block text-sm font-semibold">Tiempo de lectura<input className={inputClass} value={draft.readingTime} onChange={(e) => edit({ readingTime: e.target.value })} /></label>
          <label className="block text-sm font-semibold">Portada
            <input aria-label="Cargar portada" className={inputClass} type="file" accept="image/jpeg,image/png,image/webp"
              onChange={(e) => { void loadImage(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <p className="text-xs text-slate-500">JPG, PNG o WebP, hasta 10 MB. Marco uniforme 16:9 (1600×900), sin recortar textos o logos.</p>
          {draft.cover && <label className="block text-sm font-semibold">Texto alternativo de portada
            <input className={inputClass} value={draft.cover.alt} onChange={(e) => edit({ cover: draft.cover && { ...draft.cover, alt: e.target.value } })} />
          </label>}
          <details className="rounded-xl border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-semibold">Importar texto completo</summary>
            <p className="mt-2 text-xs">Usá encabezados «## Título» y separá los párrafos con una línea vacía.</p>
            <label className="block text-sm">Archivo de texto (.txt)<input className={inputClass} type="file" accept=".txt,text/plain"
              onChange={async (e) => {
                const file = e.target.files?.[0]; e.target.value = '';
                if (!file) return;
                try {
                  if (file.size > 1024 * 1024) throw new Error('El archivo de texto debe pesar como máximo 1 MB.');
                  setImportText(await file.text()); setError('');
                } catch (ex) { setError(ex instanceof Error ? ex.message : 'No se pudo leer el archivo de texto.'); }
              }} /></label>
            <textarea aria-label="Texto completo de la guía" className={inputClass} rows={5} value={importText} onChange={(e) => setImportText(e.target.value)} />
            <button type="button" className={buttonClass} onClick={addImportedText}>Convertir texto en secciones</button>
          </details>
          <div className="flex items-center justify-between">
            <h3 className="font-bold">Secciones e imágenes</h3>
            <button type="button" className={buttonClass} onClick={() => edit({ sections: [...draft.sections, emptySection()] })}><Plus className="mr-1 inline" size={14} />Agregar sección</button>
          </div>
          {draft.sections.map((section, index) => (
            <div key={section.id} className="space-y-2 rounded-2xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold">Sección {index + 1}</span>
                <button type="button" aria-label={`Subir sección ${index + 1}`} disabled={!index} className={buttonClass} onClick={() => moveSection(index, -1)}><ArrowUp size={16} /></button>
                <button type="button" aria-label={`Bajar sección ${index + 1}`} disabled={index === draft.sections.length - 1} className={buttonClass} onClick={() => moveSection(index, 1)}><ArrowDown size={16} /></button>
                <button type="button" aria-label={`Eliminar sección ${index + 1}`} className={buttonClass} disabled={draft.sections.length === 1}
                  onClick={() => {
                    if (window.confirm('¿Eliminar esta sección y su imagen?')) edit({ sections: draft.sections.filter((item) => item.id !== section.id) });
                  }}><Trash2 size={16} /></button>
              </div>
              <label className="block text-sm">Encabezado {index + 1}<input className={inputClass} value={section.heading} onChange={(e) => editSection(section.id, { heading: e.target.value })} /></label>
              <label className="block text-sm">Texto de sección {index + 1}<textarea className={inputClass} rows={5} value={section.text} onChange={(e) => editSection(section.id, { text: e.target.value })} /></label>
              <p className="text-xs text-slate-500">Separá párrafos con una línea vacía. Al reordenar una sección, su imagen se mueve con el texto.</p>
              <label className="block text-sm">Imagen de sección {index + 1}<input className={inputClass} type="file" accept="image/jpeg,image/png,image/webp"
                onChange={(e) => { void loadImage(e.target.files?.[0], section.id); e.target.value = ''; }} /></label>
              {section.image && <>
                <img src={section.image.src} alt={section.image.alt} className="max-h-32 w-full rounded-xl object-contain" />
                <label className="block text-sm">Texto alternativo {index + 1}<input className={inputClass} value={section.image.alt} onChange={(e) => editSection(section.id, { image: section.image && { ...section.image, alt: e.target.value } })} /></label>
                <label className="block text-sm">Ubicación de imagen {index + 1}<select className={inputClass} value={section.imagePosition}
                  onChange={(e) => editSection(section.id, { imagePosition: e.target.value === 'before' ? 'before' : 'after' })}>
                  <option value="before">Debajo del encabezado, antes del texto</option><option value="after">Después del texto de la sección</option>
                </select></label>
                <label className="block text-sm">Mover o intercambiar imagen {index + 1}<select className={inputClass} value="" onChange={(e) => moveImage(section.id, e.target.value)}>
                  <option value="">Elegir sección de destino</option>
                  {draft.sections.filter((item) => item.id !== section.id).map((item) => <option key={item.id} value={item.id}>{item.heading || 'Sin encabezado'}</option>)}
                </select></label>
                <button type="button" className={buttonClass} onClick={() => editSection(section.id, { image: null })}>Quitar imagen</button>
              </>}
            </div>
          ))}
          <h3 className="font-bold">Fuentes consultadas</h3>
          {draft.references.map((reference, index) => <div key={index} className="rounded-xl border p-3">
            <label className="block text-sm">Título de fuente {index + 1}<input className={inputClass} value={reference.label} onChange={(e) => edit({ references: draft.references.map((item, i) => i === index ? { ...item, label: e.target.value } : item) })} /></label>
            <label className="block text-sm">URL de fuente {index + 1}<input className={inputClass} type="url" value={reference.url} onChange={(e) => edit({ references: draft.references.map((item, i) => i === index ? { ...item, url: e.target.value } : item) })} /></label>
            <button type="button" className={buttonClass} onClick={() => edit({ references: draft.references.filter((_, i) => i !== index) })}>Quitar fuente</button>
          </div>)}
          <button type="button" className={buttonClass} onClick={() => edit({ references: [...draft.references, { label: '', url: '' }] })}>Agregar fuente</button>
          <label className="block text-sm font-semibold">Fecha base de publicación<input className={inputClass} type="date" min={minimumDate} value={draft.publishedAt} onChange={(e) => edit({ publishedAt: e.target.value })} /></label>
          <p className="text-xs text-slate-500">Próxima fecha disponible según el repositorio: {minimumDate}. Confirmá las fechas al integrar varios paquetes para conservar 7 días entre guías.</p>
          <label className="block rounded-xl bg-amber-50 p-3 text-sm">
            <input type="checkbox" checked={draft.ready} onChange={(e) => setDraft((current) => ({ ...current, ready: e.target.checked }))} /> Confirmo que la revisión editorial y veterinaria está completada y habilito la guía para la cola semanal.
          </label>
          <p className="text-xs text-slate-500">Sin habilitar, se exporta pendiente de revisión y no se publica. Editar cualquier contenido o imagen vuelve a requerir confirmación.</p>
        </div>
        <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold">Vista previa</h3>
            <div className="flex gap-2">
              <button type="button" aria-label="Vista escritorio" aria-pressed={!mobile} className={buttonClass} onClick={() => setMobile(false)}><Monitor size={16} /></button>
              <button type="button" aria-label="Vista móvil" aria-pressed={mobile} className={buttonClass} onClick={() => setMobile(true)}><Smartphone size={16} /></button>
            </div>
          </div>
          <div data-testid="guide-preview" className={`mx-auto space-y-6 rounded-2xl bg-emerald-50 p-4 ${mobile ? 'max-w-[360px]' : 'w-full'}`}>
            <PetGuideContent guide={guide} mobile={mobile} />
          </div>
        </div>
      </fieldset>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      <button type="button" disabled={busy} onClick={() => void exportGuide()} className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">
        <Download size={17} /> {busy ? 'Procesando…' : 'Exportar paquete para integrar'}
      </button>
    </div>
  );
}
