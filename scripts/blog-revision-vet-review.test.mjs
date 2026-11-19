import crypto from 'node:crypto';
import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { saveExistingDraftRevision } from '../api/cron/_blog-editorial-pipeline.js';
import { infographicContentHash } from '../api/cron/_blog-infographic.js';
import { approveRevisionSemantically, reviewArticleSemantically, vetReviewIsValid, VetReviewRejectedError } from '../api/cron/_blog-vet-review.js';
import { HOLIDAY_BRIEF, HOLIDAY_CONTENT, HOLIDAY_VISUAL_PLAN } from './editorial/cat-holiday-revision.mjs';

const md5 = (value) => crypto.createHash('md5').update(String(value ?? ''), 'utf8').digest('hex');
const OK = { requires_veterinary_validation: false, contains_clinical_advice: false, everyday_non_clinical: true, confidence: 0.95, issues: [] };
const approve = vi.fn(async () => OK);
const original = { id: 'existing-id', status: 'draft', slug: 'existing-slug' };

const article = (extra = {}) => ({ title: 'Cómo preparar el cuidado de tu gato durante las vacaciones', slug: original.slug, content: HOLIDAY_CONTENT, editorial_version: 'editorial-v2',
  editorial_brief: HOLIDAY_BRIEF, visual_plan: structuredClone(HOLIDAY_VISUAL_PLAN), meta_description: 'Organizá el cuidado de tu gato durante las vacaciones con instrucciones claras.',
  cover_alt: 'Un gato descansa en su casa.', tags: ['gatos', 'vacaciones'], ...extra });
// La infografia se valida para el texto final, como hace el script de revision.
const withGraphic = (candidate) => ({ ...candidate, infographic_validation: { valid: true, content_hash: infographicContentHash(candidate) } });
const adminSpy = () => { const calls = []; return { calls, rpc: async (name, args) => { calls.push({ name, args }); return { data: original, error: null }; } }; };

describe('revalidacion veterinaria de un articulo editado', () => {
  it('revisa el texto NUEVO una sola vez y no hereda la aprobacion anterior', async () => {
    const previous = await reviewArticleSemantically(article(), async () => OK);
    const edited = article({ content: `${HOLIDAY_CONTENT}\n\nUn parrafo nuevo sobre como dejar las llaves.`, vet_review: previous });
    const requestJson = vi.fn(async () => OK);
    const approved = await approveRevisionSemantically(edited, requestJson);
    expect(requestJson).toHaveBeenCalledTimes(1);
    expect(requestJson.mock.calls[0][0]).toContain('Un parrafo nuevo sobre como dejar las llaves.');
    expect(approved.vet_review.content_md5).toBe(md5(edited.content));
    expect(approved.vet_review.content_md5).not.toBe(previous.content_md5);
    expect(approved.vet_review.meta_md5).toBe(md5(edited.meta_description));
    expect(vetReviewIsValid(approved)).toBe(true);
    expect(vetReviewIsValid({ ...edited, vet_review: previous })).toBe(false);
  });

  it('falla cerrado: el modelo rechaza, duda, responde mal o el proveedor falla', async () => {
    const edited = article();
    await expect(approveRevisionSemantically(edited, async () => ({ ...OK, requires_veterinary_validation: true, issues: ['Recomienda una dosis.'] }))).rejects.toBeInstanceOf(VetReviewRejectedError);
    await expect(approveRevisionSemantically(edited, async () => ({ ...OK, requires_veterinary_validation: true, issues: ['Recomienda una dosis.'] }))).rejects.toThrow(/Recomienda una dosis/);
    for (const verdict of [{ ...OK, confidence: 0.79 }, { ...OK, confidence: '0.95' }, { ...OK, issues: ['dudoso'] }, { ...OK, contains_clinical_advice: true }, {}, null]) {
      await expect(approveRevisionSemantically(edited, async () => verdict)).rejects.toBeInstanceOf(VetReviewRejectedError);
    }
    await expect(approveRevisionSemantically(edited, async () => { throw new Error('Proveedor HTTP 500'); })).rejects.toThrow('Proveedor HTTP 500');
    await expect(approveRevisionSemantically(edited, async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); })).rejects.toThrow();
  });

  it('cualquier cambio de texto, titulo o meta descripcion invalida la aprobacion; una aprobacion nueva no sirve para el texto viejo', async () => {
    const v1 = await approveRevisionSemantically(article(), async () => OK);
    expect(vetReviewIsValid(v1)).toBe(true);
    for (const change of [{ content: `${v1.content} Una frase mas.` }, { title: `${v1.title}!` }, { meta_description: `${v1.meta_description} Ahora con otra aclaracion.` }, { meta_description: '' }, { meta_description: undefined }]) {
      const edited = { ...v1, ...change };
      expect(vetReviewIsValid(edited)).toBe(false);
      const v2 = await approveRevisionSemantically(edited, async () => OK);
      expect(vetReviewIsValid(v2)).toBe(true);
      expect(vetReviewIsValid({ ...v1, ...change, vet_review: v1.vet_review })).toBe(false);
      expect(vetReviewIsValid({ ...v2, content: v1.content, title: v1.title, meta_description: v1.meta_description })).toBe(change.content === undefined && change.title === undefined && change.meta_description === v1.meta_description);
    }
  });
});

describe('saveExistingDraftRevision exige una aprobacion vigente del contenido nuevo', () => {
  it('con una aprobacion valida para el texto final guarda mediante la RPC existente', async () => {
    const admin = adminSpy();
    const approved = await approveRevisionSemantically(withGraphic(article()), async () => OK);
    expect(await saveExistingDraftRevision(admin, original, 'token', approved)).toEqual(original);
    expect(admin.calls).toHaveLength(1);
    expect(admin.calls[0]).toMatchObject({ name: 'save_blog_editorial_revision', args: { p_id: 'existing-id', p_expected_hash: 'token' } });
    expect(vetReviewIsValid(admin.calls[0].args.p_article)).toBe(true);
  });

  it('sin vet_review no guarda nada', async () => {
    const admin = adminSpy();
    await expect(saveExistingDraftRevision(admin, original, 'token', withGraphic(article()))).rejects.toThrow(/aprobacion semantica veterinaria vigente/);
    expect(admin.calls).toHaveLength(0);
  });

  it.each([
    ['el texto', { content: `${HOLIDAY_CONTENT}\n\nTexto agregado despues de la aprobacion.` }],
    ['el titulo', { title: 'Un titulo distinto del que se aprobo para el articulo' }],
    ['la meta descripcion', { meta_description: 'Otra meta descripcion distinta de la aprobada para este articulo.' }],
  ])('rechaza la aprobacion ANTIGUA cuando cambio %s', async (_name, change) => {
    const admin = adminSpy();
    const oldApproved = await approveRevisionSemantically(withGraphic(article()), async () => OK);
    const edited = withGraphic({ ...oldApproved, ...change });
    await expect(saveExistingDraftRevision(admin, original, 'token', edited)).rejects.toThrow(/aprobacion semantica veterinaria vigente/);
    expect(admin.calls).toHaveLength(0);
  });

  it('rechaza una aprobacion no aprobada, de baja confianza o con tipos incorrectos', async () => {
    const admin = adminSpy();
    const approved = await approveRevisionSemantically(withGraphic(article()), async () => OK);
    for (const patch of [{ approved: false }, { approved: 'true' }, { confidence: 0.79 }, { confidence: '0.95' }, { content_md5: md5('otro') }, { meta_md5: md5('otra') }, { surface_hash: 'x' }]) {
      await expect(saveExistingDraftRevision(admin, original, 'token', { ...approved, vet_review: { ...approved.vet_review, ...patch } })).rejects.toThrow(/aprobacion semantica veterinaria vigente/);
    }
    expect(admin.calls).toHaveLength(0);
  });

  it('un articulo aprobado, editado y re-aprobado: solo la aprobacion nueva permite guardar el texto nuevo', async () => {
    const admin = adminSpy();
    const first = await approveRevisionSemantically(withGraphic(article()), async () => OK);
    const edited = withGraphic({ ...first, meta_description: 'Meta descripcion corregida por el editor para esta revision.' });
    await expect(saveExistingDraftRevision(admin, original, 'token', edited)).rejects.toThrow();
    const second = await approveRevisionSemantically(edited, async () => OK);
    await saveExistingDraftRevision(admin, original, 'token', second);
    expect(admin.calls).toHaveLength(1);
    expect(admin.calls[0].args.p_article.vet_review.meta_md5).toBe(md5('Meta descripcion corregida por el editor para esta revision.'));
  });
});

describe('script de revision editorial y migracion 076 (comprobaciones estaticas)', () => {
  const script = fs.readFileSync(new URL('./revise-cat-holiday.mjs', import.meta.url), 'utf8');
  const migration = fs.readFileSync(new URL('../supabase/migrations/076_blog_candidate_pipeline.sql', import.meta.url), 'utf8');

  it('el script revisa semanticamente el texto nuevo antes de renderizar o guardar nada, y ante un error se detiene', () => {
    const review = script.indexOf('approveRevisionSemantically(article, requestEditorialJson)');
    expect(review).toBeGreaterThan(0);
    expect(review).toBeLessThan(script.indexOf('renderVisualInfographic(article)'));
    expect(review).toBeLessThan(script.indexOf('ensureGenerationAsset(admin'));
    expect(review).toBeLessThan(script.indexOf('saveExistingDraftRevision(admin'));
    expect(script).toMatch(/throw new Error\(`Revision retenida por la revision semantica veterinaria/);
    expect(script).toMatch(/vetReview:\s*\{\s*content: article\.vet_review\.content_md5/);
  });

  it('la migracion agrega el trigger de UPDATE, la huella historica y su rollback', () => {
    expect(migration).toMatch(/create trigger blog_generated_post_vet_review_publish_guard before update on public\.blog_posts/);
    expect(migration).toMatch(/create table public\.blog_vet_review_grandfathered/);
    expect(migration).toMatch(/-- drop trigger if exists blog_generated_post_vet_review_publish_guard on public\.blog_posts;/);
    expect(migration).toMatch(/-- drop function if exists public\.guard_blog_generated_post_vet_review_update\(\)/);
    expect(migration).toMatch(/-- drop table if exists public\.blog_vet_review_grandfathered/);
    expect(migration.match(/meta_md5/g).length).toBeGreaterThanOrEqual(4);
    expect(migration).toMatch(/revoke all on function[^;]*guard_blog_generated_post_vet_review_update\(\)/);
  });

  it('la migracion no redefine ninguna funcion ni trigger existente de 061-075', () => {
    expect(migration).not.toMatch(/create or replace function public\.(claim_blog_generation|finish_blog_generation|save_blog_generation_stage|guard_generated_blog_publication|save_blog_editorial_revision|blog_editorial_revision_token|admin_update_blog_post|retry_retained_blog_generation|admin_list_blog_generation_runs)/);
    expect(migration).not.toMatch(/drop (?:function|trigger) (?:if exists )?(?:generated_blog_publication_guard|public\.guard_generated_blog_publication)/);
    expect(migration).not.toMatch(/\b(?:update|delete from) public\.blog_posts\b/);
  });
});
