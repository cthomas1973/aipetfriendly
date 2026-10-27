import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { analyzeEditorialDepth, classifyEditorialSafety, runEditorialGeneration, saveExistingDraftRevision, verifyInternalLinks } from '../api/cron/_blog-editorial-pipeline.js';
import { INFOGRAPHIC_VERSION, OFFICIAL_LOGO_SHA256, infographicContentHash, loadOfficialLogo, renderVisualInfographic, validateVisualPlan } from '../api/cron/_blog-infographic.js';
import { HOLIDAY_BRIEF, HOLIDAY_CONTENT, HOLIDAY_VISUAL_PLAN } from './editorial/cat-holiday-revision.mjs';

const article = () => ({ title: 'Cómo preparar el cuidado de tu gato durante las vacaciones', content: HOLIDAY_CONTENT, editorial_brief: HOLIDAY_BRIEF, visual_plan: structuredClone(HOLIDAY_VISUAL_PLAN), quality: { ready: true } });
describe('cobertura y rigor editorial v2', () => {
  it('cubre los ocho apartados sin duplicar parrafos ni mezclar el tratamiento', () => {
    const result = analyzeEditorialDepth(article());
    expect(result.wordCount).toBeGreaterThan(1200);
    expect(result.wordCount).toBeLessThan(1800);
    expect(result.coverage).toHaveLength(8);
    expect(result.coverage.every((item) => item.covered)).toBe(true);
    expect(result.consistentVoseo).toBe(true);
    expect(result.repetition).toBe(0);
  });
  it('detecta texto insuficiente, repetido y tuteo en encabezados', () => {
    const result = analyzeEditorialDepth({ ...article(), content: '## Elige al cuidador\n\nUna idea.\n\nUna idea.' });
    expect(result.wordCount).toBeLessThan(result.minWords);
    expect(result.repetition).toBeGreaterThan(0);
    expect(result.consistentVoseo).toBe(false);
    expect(result.coverage.some((item) => !item.covered)).toBe(true);
  });
  it('no confunde Mantené y Prepará con formas de tuteo', () => {
    expect(analyzeEditorialDepth({ content: '## Mantené el contacto\n\n## Prepará su espacio' }).consistentVoseo).toBe(true);
  });
  it('permite planificar contactos e indicaciones vigentes sin aprobar tratamientos', () => {
    expect(classifyEditorialSafety(HOLIDAY_CONTENT)).toMatchObject({ dangerous: false, veterinaryReviewRequired: false, planningOnly: true });
    expect(classifyEditorialSafety('Aplicá compresiones abdominales ante un atragantamiento.').veterinaryReviewRequired).toBe(true);
    expect(classifyEditorialSafety('Administrá 5 mg/kg de un fármaco.').dangerous).toBe(true);
  });
  it('rechaza enlaces 404 y privados/noindex, sin hacer de un HTTP200 una prueba de indexacion', async () => {
    const response = await verifyInternalLinks('[A](/contacto) [B](/login) [C](/inexistente)', async (url) => new Response(url.endsWith('/login') ? '<meta name="robots" content="noindex, follow" />' : '<title>Pagina</title>', { status: url.endsWith('/inexistente') ? 404 : 200 }));
    expect(response.valid).toBe(false);
    expect(response.checked.map((item) => item.valid)).toEqual([true, false, false]);
  });
});

describe('infografia visual oficial', () => {
  it('actualiza el mismo ID como borrador mediante la RPC sin crear otro articulo', async () => {
    const original = { id: 'existing-id', status: 'draft', slug: 'existing-slug' };
    const candidate = { ...article(), slug: original.slug, infographic_validation: { valid: true, content_hash: infographicContentHash(article()) } };
    const calls = [];
    const admin = { rpc: async (name, args) => { calls.push({ name, args }); return { data: original, error: null }; } };
    expect(await saveExistingDraftRevision(admin, original, 'version-token', candidate)).toEqual(original);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ name: 'save_blog_editorial_revision', args: { p_id: 'existing-id', p_expected_hash: 'version-token' } });
  });
  it('no intenta guardar una revision publicada, duplicada o con infografia vieja', async () => {
    const calls = [];
    const admin = { rpc: async (...args) => { calls.push(args); } };
    await expect(saveExistingDraftRevision(admin, { id: 'id', status: 'published', slug: 'slug' }, 'token', { ...article(), slug: 'slug' })).rejects.toThrow();
    await expect(saveExistingDraftRevision(admin, { id: 'id', status: 'draft', slug: 'slug' }, 'token', { ...article(), slug: 'slug', infographic_validation: { valid: false } })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
  it('usa cinco bloques con alternativas, escena, ficha, comunicacion y relaciones', () => {
    expect(validateVisualPlan(article())).toMatchObject({ valid: true, renderer: INFOGRAPHIC_VERSION });
    expect(HOLIDAY_VISUAL_PLAN.sections.map((section) => section.layout)).toEqual(['comparison', 'scene', 'record', 'conversation', 'relationship']);
  });
  it('rechaza anclajes inventados, texto largo y composiciones uniformes', () => {
    const changed = article(); changed.visual_plan.sections[0].items[0].anchor = 'Una afirmacion inventada que no figura en el texto';
    changed.visual_plan.sections[1].items[0].label = 'Un parrafo larguisimo que no debe renderizarse como una etiqueta';
    changed.visual_plan.sections.forEach((section) => { section.layout = 'record'; });
    const result = validateVisualPlan(changed);
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(2);
  });
  it('cambia la huella al editar texto, fuentes o plan visual', () => {
    expect(infographicContentHash(article())).not.toBe(infographicContentHash({ ...article(), content: HOLIDAY_CONTENT + ' Cambio relevante.' }));
    expect(infographicContentHash(article())).not.toBe(infographicContentHash({ ...article(), sources: [{ url: 'https://www.cats.org.uk/new', text_sha256: 'new' }] }));
  });
  it('retiene la finalizacion si el texto cambio despues de generar el grafico', async () => {
    const original = { ...article(), editorial_version: 'editorial-v2' };
    const payload = { ...original, content: original.content + '\n\nCambio editorial.', quality: { ready: true, failed: [] }, infographic_validation: { valid: true, content_hash: infographicContentHash(original) } };
    const calls = [];
    const admin = { rpc: async (name, args) => { calls.push({ name, args }); return name === 'claim_blog_generation'
      ? { data: { id: 'run', lease_token: 'token', stage: 'finalize', payload, attempts: 1 }, error: null }
      : { data: true, error: null }; } };
    expect(await runEditorialGeneration(admin)).toMatchObject({ stage: 'retained' });
    expect(calls.some((call) => call.name === 'finish_blog_generation')).toBe(false);
    expect(calls[1].args.p_payload.quality.failed).toContain('infographic_changed_after_validation');
  });
  it('incluye el archivo oficial sin redibujarlo ni deformarlo', async () => {
    const logo = await loadOfficialLogo();
    expect(crypto.createHash('sha256').update(logo).digest('hex')).toBe(OFFICIAL_LOGO_SHA256);
    const image = await renderVisualInfographic(article());
    expect(await sharp(image).metadata()).toMatchObject({ width: 1080, height: 1350, format: 'png' });
    const expected = await sharp(logo).resize({ width: 190, height: 174, fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const actual = await sharp(image).extract({ left: 52, top: 1152, width: expected.info.width, height: expected.info.height }).ensureAlpha().raw().toBuffer();
    expect(actual.equals(expected.data)).toBe(true);
  });
  it('no sustituye el logo por un recurso inventado', async () => {
    await expect(renderVisualInfographic(article(), { logoLoader: async () => Buffer.from('fake-logo') })).rejects.toThrow('Logo no autorizado');
  });
});