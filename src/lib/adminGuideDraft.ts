import { PET_GUIDE_CATEGORY_LABELS, type PetGuide, type PetGuideSection } from '../data/petGuides';

export interface GuideDraftImage {
  blob: Blob;
  src: string;
  alt: string;
}
export interface GuideDraftSection {
  id: string;
  heading: string;
  text: string;
  image: GuideDraftImage | null;
  imagePosition: 'before' | 'after';
}
export interface GuideDraft {
  title: string;
  slug: string;
  category: PetGuide['category'];
  petTypes: PetGuide['petTypes'];
  publishedAt: string;
  summary: string;
  readingTime: string;
  cover: GuideDraftImage | null;
  sections: GuideDraftSection[];
  references: NonNullable<PetGuide['references']>;
  ready: boolean;
}

export function guideSlug(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
}

export function nextGuideDate(guides: PetGuide[], now = Date.now()) {
  const week = 7 * 86400000;
  const cleared = guides.filter((guide) => !guide.publicationStatus);
  let latest = Math.max(0, ...cleared.filter((guide) => Date.parse(guide.publishedAt) <= now)
    .map((guide) => Date.parse(guide.publishedAt)));
  for (const guide of cleared.filter((item) => Date.parse(item.publishedAt) > now)
    .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt))) {
    latest = Math.max(Date.parse(guide.publishedAt), latest ? latest + week : 0);
  }
  return new Date(Math.max(now + 86400000, latest + week)).toISOString().slice(0, 10);
}

export const emptySection = (): GuideDraftSection => ({
  id: crypto.randomUUID(), heading: '', text: '', image: null, imagePosition: 'after',
});

export function newGuideDraft(guides: PetGuide[]): GuideDraft {
  return {
    title: '', slug: '', category: 'adiestramiento', petTypes: ['perro'],
    publishedAt: nextGuideDate(guides), summary: '', readingTime: '5 min',
    cover: null, sections: [emptySection()], references: [], ready: false,
  };
}

export function parseGuideText(text: string): GuideDraftSection[] {
  const sections: GuideDraftSection[] = [];
  for (const line of text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')) {
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) sections.push({ ...emptySection(), heading: heading[1].replace(/^[#\s]+/, '').trim() });
    else {
      if (!sections.length && !line.trim()) continue;
      if (!sections.length) sections.push({ ...emptySection(), heading: 'Introducción' });
      sections[sections.length - 1].text += `${line}\n`;
    }
  }
  return sections.filter((section) => section.heading || section.text.trim())
    .map((section) => ({ ...section, text: section.text.trim() }));
}

export function sectionImageName(section: GuideDraftSection, index: number) {
  return `${String(index + 1).padStart(2, '0')}-${guideSlug(section.heading) || 'seccion'}.jpg`;
}

export function draftToGuide(draft: GuideDraft, preview = false): PetGuide {
  const slug = draft.slug || guideSlug(draft.title);
  const sections: PetGuideSection[] = draft.sections.map((section, index) => ({
    heading: section.heading,
    paragraphs: section.text.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean),
    ...(section.image ? {
      image: { src: preview ? section.image.src : `/guides/${slug}/${sectionImageName(section, index)}`, alt: section.image.alt },
      imagePosition: section.imagePosition,
    } : {}),
  }));
  return {
    slug, title: draft.title.trim(), category: draft.category, petTypes: draft.petTypes,
    publishedAt: draft.publishedAt,
    ...(!draft.ready ? { publicationStatus: 'pending_veterinary_review' as const } : {}),
    summary: draft.summary.trim(), readingTime: draft.readingTime.trim(),
    ...(draft.cover ? { coverImage: { src: preview ? draft.cover.src : `/guides/${slug}/portada.jpg`, alt: draft.cover.alt } } : {}),
    sections, references: draft.references,
  };
}

export function validateGuideDraft(draft: GuideDraft, guides: PetGuide[], now = Date.now()) {
  const guide = draftToGuide(draft);
  if (!guide.title || !guide.summary || !guide.readingTime) throw new Error('Completá título, resumen y tiempo de lectura.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(guide.slug)) throw new Error('El slug debe contener letras sin acentos, números y guiones.');
  if (guides.some((existing) => existing.slug === guide.slug)) throw new Error('Ese slug ya pertenece a una guía existente.');
  if (!draft.petTypes.length) throw new Error('Seleccioná al menos una especie.');
  if (!draft.cover || !draft.cover.alt.trim()) throw new Error('Cargá una portada y su texto alternativo.');
  if (!draft.sections.length || guide.sections.some((section) => !section.heading.trim() || !section.paragraphs.length)) {
    throw new Error('Cada sección necesita un encabezado y texto.');
  }
  if (draft.sections.some((section) => section.image && !section.image.alt.trim())) throw new Error('Completá el texto alternativo de cada imagen.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.publishedAt) || !Number.isFinite(Date.parse(draft.publishedAt))
    || new Date(draft.publishedAt).toISOString().slice(0, 10) !== draft.publishedAt) throw new Error('La fecha no es válida.');
  if (draft.ready && draft.publishedAt < nextGuideDate(guides, now)) throw new Error(`La próxima fecha disponible es ${nextGuideDate(guides, now)}.`);
  for (const reference of draft.references) {
    if (!reference.label.trim() || !/^https?:\/\/[^\s]+$/i.test(reference.url)) throw new Error('Cada fuente necesita un título y una URL http/https.');
  }
  return guide;
}

export function guideTypeScript(guide: PetGuide): string {
  const literal = (value: unknown, depth: number): string => {
    if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n')}'`;
    if (Array.isArray(value)) {
      if (value.every((item) => typeof item === 'string')) return `[${value.map((item) => literal(item, depth)).join(', ')}]`;
      return `[\n${value.map((item) => `${'  '.repeat(depth + 1)}${literal(item, depth + 1)},`).join('\n')}\n${'  '.repeat(depth)}]`;
    }
    if (value !== null && typeof value === 'object') {
      return `{\n${Object.entries(value).map(([key, item]) => `${'  '.repeat(depth + 1)}${key}: ${literal(item, depth + 1)},`).join('\n')}\n${'  '.repeat(depth)}}`;
    }
    throw new Error('Tipo no admitido al exportar la guía.');
  };
  return `  ${literal(guide, 1)},\n`;
}

export async function normalizeGuideImage(file: Blob): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Solo se admiten imágenes JPG, PNG o WebP.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Cada imagen debe pesar como máximo 10 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 900;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo preparar la imagen.');
    const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.fillStyle = '#f8fafc';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('No se pudo convertir la imagen.')), 'image/jpeg', 0.92));
  } finally {
    bitmap.close();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function isImage(value: unknown): value is GuideDraftImage | null {
  return value === null || (isRecord(value) && value.blob instanceof Blob && typeof value.alt === 'string' && typeof value.src === 'string');
}
function isDraft(value: unknown): value is GuideDraft {
  return isRecord(value) && ['title', 'slug', 'publishedAt', 'summary', 'readingTime'].every((key) => typeof value[key] === 'string')
    && typeof value.category === 'string' && Object.prototype.hasOwnProperty.call(PET_GUIDE_CATEGORY_LABELS, value.category)
    && Array.isArray(value.petTypes) && value.petTypes.every((type) => type === 'perro' || type === 'gato')
    && typeof value.ready === 'boolean' && isImage(value.cover) && Array.isArray(value.sections)
    && value.sections.every((section) => isRecord(section) && typeof section.id === 'string' && typeof section.heading === 'string'
      && typeof section.text === 'string' && isImage(section.image) && ['before', 'after'].includes(String(section.imagePosition)))
    && Array.isArray(value.references) && value.references.every((ref) => isRecord(ref) && typeof ref.label === 'string' && typeof ref.url === 'string');
}

export async function storedGuideDraft(action: 'read' | 'write', key: string, draft?: GuideDraft): Promise<GuideDraft | null> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('aipetfriendly-guide-editor', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('No se pudo abrir el almacenamiento local de borradores.'));
    request.onblocked = () => reject(new Error('Cerrá las otras pestañas para abrir el almacenamiento de borradores.'));
  });
  try {
    return await new Promise<GuideDraft | null>((resolve, reject) => {
      const transaction = db.transaction('drafts', action === 'write' ? 'readwrite' : 'readonly');
      const store = transaction.objectStore('drafts');
      const request = action === 'write' ? store.put(draft, key) : store.get(key);
      transaction.oncomplete = () => {
        const result: unknown = request.result;
        if (action === 'write' || result === undefined) resolve(null);
        else if (isDraft(result)) resolve(result);
        else reject(new Error('El borrador guardado no tiene un formato válido.'));
      };
      transaction.onerror = () => reject(new Error('No se pudo guardar o recuperar el borrador. Revisá el espacio disponible del navegador.'));
      transaction.onabort = () => reject(new Error('Se interrumpió el acceso al borrador.'));
    });
  } finally {
    db.close();
  }
}
