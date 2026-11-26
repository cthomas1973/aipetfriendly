// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { extractStaticGuides } from '../../scripts/_guide-feed.mjs';
import { PET_GUIDES } from '../data/petGuides';
import {
  draftToGuide, emptySection, guideTypeScript, newGuideDraft, nextGuideDate,
  normalizeGuideImage, parseGuideText, validateGuideDraft,
} from './adminGuideDraft';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function validDraft() {
  const draft = newGuideDraft([]);
  return {
    ...draft, title: "Cómo cuidar a O'Connor", summary: "Guía de O'Connor: ñ, á, é, í, ó y ú.",
    publishedAt: '2026-12-08',
    cover: { blob: new Blob(['cover'], { type: 'image/jpeg' }), src: 'blob:cover', alt: 'Portada con ñ' },
    sections: [{ ...emptySection(), heading: 'Primer paso', text: 'Primer párrafo.\n\nSegundo párrafo.',
      image: { blob: new Blob(['image'], { type: 'image/jpeg' }), src: 'blob:step', alt: 'Paso uno' }, imagePosition: 'before' }],
  };
}

describe('paquete estático de guías', () => {
  it('importa texto por encabezados y párrafos sin perder acentos', () => {
    const sections = parseGuideText('Intro.\r\n\r\n## Usá premios\r\nPrimer párrafo.\r\n\r\nSegundo párrafo.\r\n## Practicá\r\nTexto.');
    expect(sections.map((section) => section.heading)).toEqual(['Introducción', 'Usá premios', 'Practicá']);
    expect(sections[1].text).toBe('Primer párrafo.\n\nSegundo párrafo.');
    expect(parseGuideText('\uFEFF\n## Usá premios\nTexto.').map((section) => section.heading)).toEqual(['Usá premios']);
  });
  it('respeta siete días y excluye guías bloqueadas por revisión', () => {
    const now = Date.parse('2026-11-25T12:00:00Z');
    const guide = draftToGuide(validDraft());
    expect(nextGuideDate([{ ...guide, publishedAt: '2026-12-01', publicationStatus: undefined }], now)).toBe('2026-12-08');
    expect(nextGuideDate([{ ...guide, publishedAt: '2026-12-01', publicationStatus: 'pending_veterinary_review' }], now)).toBe('2026-11-26');
    expect(nextGuideDate([
      { ...guide, publicationStatus: undefined, publishedAt: '2026-11-25' },
      { ...guide, publicationStatus: undefined, publishedAt: '2026-11-26' },
      { ...guide, publicationStatus: undefined, publishedAt: '2026-11-27' },
    ], now)).toBe('2026-12-16');
  });
  it('genera un objeto TypeScript válido con el orden y ubicación de imágenes', () => {
    const draft = validDraft();
    draft.sections.unshift({ ...emptySection(), heading: 'Preparación', text: 'Texto previo.' });
    const guide = draftToGuide(draft);
    const code = guideTypeScript(guide);
    const result = ts.transpileModule(`const guide = ${code.trim().replace(/,$/, '')};`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true,
    });
    expect(result.diagnostics).toHaveLength(0);
    const recovered = new Function(`${result.outputText}; return guide;`)();
    expect(recovered).toEqual(guide);
    expect(guide.sections[1].image.src).toContain('/02-primer-paso.jpg');
    expect(guide.sections[1].imagePosition).toBe('before');
    expect(guide.publicationStatus).toBe('pending_veterinary_review');
    expect(draftToGuide({ ...draft, ready: true }).publicationStatus).toBeUndefined();
  });
  it('el feed entiende apóstrofes, portada, estado y fechas del objeto exportado', () => {
    const guide = draftToGuide(validDraft());
    expect(extractStaticGuides(`export const PET_GUIDES = [\n${guideTypeScript(guide)}];`)).toEqual([{
      slug: guide.slug, title: guide.title, category: guide.category,
      publishedAt: guide.publishedAt, summary: guide.summary,
      coverImageSrc: guide.coverImage.src, relatedProductId: null,
      publicationStatus: 'pending_veterinary_review',
    }]);
  });
  it('mantiene el feed de todas las guías existentes', () => {
    const source = readFileSync(path.join(process.cwd(), 'src', 'data', 'petGuides.ts'), 'utf8');
    const extracted = extractStaticGuides(source);
    expect(extracted).toHaveLength(PET_GUIDES.length);
    for (const guide of PET_GUIDES) {
      expect(extracted.find((item) => item.slug === guide.slug)).toMatchObject({
        title: guide.title, summary: guide.summary, publishedAt: guide.publishedAt,
        coverImageSrc: guide.coverImage?.src || null, publicationStatus: guide.publicationStatus || null,
      });
    }
  });
  it('bloquea fecha adelantada, slug duplicado, portada ausente y especies vacías', () => {
    const draft = { ...validDraft(), ready: true };
    const now = Date.parse('2026-11-25T12:00:00Z');
    expect(() => validateGuideDraft(draft, [], now)).not.toThrow();
    expect(() => validateGuideDraft({ ...draft, publishedAt: '2026-11-25' }, [], now)).toThrow('próxima fecha');
    expect(() => validateGuideDraft({ ...draft, publishedAt: '2026-02-31' }, [], now)).toThrow('fecha no es válida');
    expect(() => validateGuideDraft(draft, [draftToGuide(draft)], now)).toThrow('slug');
    expect(() => validateGuideDraft({ ...draft, cover: null }, [], now)).toThrow('portada');
    expect(() => validateGuideDraft({ ...draft, petTypes: [] }, [], now)).toThrow('especie');
    expect(() => validateGuideDraft({ ...draft, references: [{ label: 'Fuente', url: 'javascript:alert(1)' }] }, [], now)).toThrow('http/https');
  });
});

describe('normalización uniforme de imágenes', () => {
  it.each([[1000, 2000, 575, 0, 450, 900], [2400, 600, 0, 250, 1600, 400]])(
    'conserva la imagen completa de %ix%i en un JPG 1600x900',
    async (width, height, x, y, drawWidth, drawHeight) => {
      const bitmap = { width, height, close: vi.fn() };
      vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
      const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
      let canvas;
      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function(callback, type) {
        canvas = this; callback(new Blob(['jpeg'], { type }));
      });
      const blob = await normalizeGuideImage(new Blob(['png'], { type: 'image/png' }));
      expect(canvas.width).toBe(1600); expect(canvas.height).toBe(900);
      expect(context.drawImage).toHaveBeenCalledWith(bitmap, x, y, drawWidth, drawHeight);
      expect(blob.type).toBe('image/jpeg');
      expect(bitmap.close).toHaveBeenCalledOnce();
    });
  it('informa archivos inválidos y errores de conversión', async () => {
    await expect(normalizeGuideImage(new Blob(['svg'], { type: 'image/svg+xml' }))).rejects.toThrow('JPG');
    const bitmap = { width: 100, height: 100, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(normalizeGuideImage(new Blob(['png'], { type: 'image/png' }))).rejects.toThrow('preparar');
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});
