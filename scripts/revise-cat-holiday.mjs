import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';
import { EDITORIAL_VERSION, ensureGenerationAsset, reviewVerifiedArticle, saveExistingDraftRevision, validateEditorialArticle, verifyInternalLinks, verifySource } from '../api/cron/_blog-editorial-pipeline.js';
import { INFOGRAPHIC_VERSION, OFFICIAL_LOGO_SHA256, infographicContentHash, loadOfficialLogo, renderVisualInfographic } from '../api/cron/_blog-infographic.js';
import { HOLIDAY_BRIEF, HOLIDAY_CONTENT, HOLIDAY_TITLE, HOLIDAY_VISUAL_PLAN, POST_ID } from './editorial/cat-holiday-revision.mjs';

const env = loadEnv('production', process.cwd(), '');
for (const name of ['AI_API_KEY', 'AI_MODEL', 'AI_BASE_URL']) {
  if (!process.env[name] && env[name]) process.env[name] = env[name];
}
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const token = await admin.rpc('blog_editorial_revision_token', { p_id: POST_ID });
if (token.error || !token.data?.post) throw new Error('No se pudo leer una version de borrador para revision');
const original = token.data.post;
if (original.status !== 'draft') throw new Error('El articulo ya no es borrador: no se modifica');
const sources = [await verifySource({ sourceId: 'cats-protection-holidays', url: 'https://www.cats.org.uk/help-and-advice/caring-for-your-cat/home-and-environment/going-on-holiday' })];
sources[0].supports = 'Modalidades, cuidador, frecuencia orientativa, plan de respaldo, objetos seguros y preparacion del hogar.';
function quoteFrom(source, marker) {
  const start = source.text.toLowerCase().indexOf(marker.toLowerCase());
  if (start < 0) throw new Error('No se encontro el respaldo esperado en la fuente');
  const sentenceEnd = source.text.indexOf('.', start + 35);
  return source.text.slice(start, Math.min(start + 205, sentenceEnd < 0 ? start + 205 : sentenceEnd + 1));
}
const article = {
  title: HOLIDAY_TITLE, slug: original.slug, content: HOLIDAY_CONTENT, topic: original.topic,
  editorial_version: EDITORIAL_VERSION, editorial_brief: HOLIDAY_BRIEF, visual_plan: HOLIDAY_VISUAL_PLAN,
  meta_description: 'Organizá las vacaciones y el cuidado de tu gato: compará alternativas, prepará el hogar, dejá instrucciones y acordá el contacto con su cuidador.',
  category: 'Bienestar y organización', tags: ['gatos', 'vacaciones', 'cuidadores', 'organización'],
  cover_url: original.image_url, cover_alt: 'Gato descansando en el hogar durante la ausencia de su responsable.',
  source_name: 'Cats Protection', sources, generated_at: original.editorial_metadata?.generated_at || original.created_at,
  revised_at: new Date().toISOString(), humanEditorialReviewRequired: true,
  evidence: [
    { source_id: sources[0].id, claim: 'Cats Protection explica que muchos prefieren quedarse en casa y que una persona confiable los cuide en su espacio, mientras que otros pueden adaptarse a una residencia elegida con cuidado', quote: quoteFrom(sources[0], 'All cats differ') },
    { source_id: sources[0].id, claim: 'Cats Protection sugiere comprobar si está habilitada, cómo evita escapes, si mantiene a los gatos separados y si las instalaciones se pueden limpiar fácilmente', quote: quoteFrom(sources[0], 'When you visit the cattery') },
    { source_id: sources[0].id, claim: 'Cats Protection recomienda reunirse en el domicilio unos días antes para conocer a la persona e introducirla al gato;', quote: quoteFrom(sources[0], 'meet-up in your house') },
    { source_id: sources[0].id, claim: 'también sugiere acordar alguien de respaldo ante una cancelación', quote: quoteFrom(sources[0], 'If an unexpected cancellation happens') },
    { source_id: sources[0].id, claim: 'Cats Protection propone al menos dos visitas diarias como referencia y señala que gatos muy jóvenes, mayores o con ciertas condiciones pueden necesitar más frecuencia', quote: quoteFrom(sources[0], 'visit at least twice a day') },
      { source_id: sources[0].id, claim: 'Cats Protection recomienda retirar objetos potencialmente dañinos y dejar fuera de alcance los juguetes con hilos cuando el gato queda sin supervisión', quote: quoteFrom(sources[0], 'get rid of any possibly harmful things') },
  ],
  brand: { logo_sha256: OFFICIAL_LOGO_SHA256, renderer: INFOGRAPHIC_VERSION },
};
const history = await admin.from('blog_posts').select('id,title,slug,content,topic').neq('id', POST_ID).order('created_at', { ascending: false }).limit(200);
if (history.error) throw new Error(history.error.message);
article.link_validation = await verifyInternalLinks(article.content);
await loadOfficialLogo();
article.quality = validateEditorialArticle(article, article.sources, history.data || []);
article.quality.reviewScope = 'Controles estructurales y revision editorial de organizacion; no es aprobacion veterinaria ni garantia factual automatica';
await reviewVerifiedArticle(article);
if (!article.quality?.ready) {
  const quality = article.quality || {};
  throw new Error(`Revision retenida: ${Array.isArray(quality.failed) ? quality.failed.join(', ') : 'quality_missing'}; semantic=${quality.semanticReview?.approved === true ? 'approved' : 'rejected'}; issues=${Array.isArray(quality.semanticReview?.issues) ? quality.semanticReview.issues.join(' | ') : 'no informado'}`);
}
const cover = await fetch(original.image_url, { signal: AbortSignal.timeout(15000) });
if (!cover.ok) throw new Error('La portada existente no esta disponible');
const coverMetadata = await sharp(Buffer.from(await cover.arrayBuffer())).metadata();
if (coverMetadata.width < 512 || coverMetadata.height < 512) throw new Error('Portada existente invalida');
const buffer = await renderVisualInfographic(article);
const visualHash = infographicContentHash(article);
const preview = path.join(os.tmpdir(), `aipf-cat-holiday-${visualHash.slice(0, 12)}.png`);
await fs.writeFile(preview, buffer);
  article.infographic_alt = 'Infografía del cuidado del gato durante vacaciones: modalidades de cuidado, objetos del hogar, ficha para el cuidador, mensajes y herramientas de organización de AiPetFriendly.';
  article.infographic_caption = 'Planificá el cuidado según las preferencias y la rutina habitual de tu gato.';
article.infographic_validation = { valid: true, content_hash: visualHash, logo_sha256: OFFICIAL_LOGO_SHA256, renderer: INFOGRAPHIC_VERSION };
article.revision_key = crypto.createHash('sha256').update(JSON.stringify({ visualHash, meta: article.meta_description,
  cover: article.cover_url, category: article.category, tags: article.tags, sourceName: article.source_name,
  semanticReview: article.quality.semanticReview })).digest('hex');

if (process.argv.includes('--apply')) {
  article.infographic_url = await ensureGenerationAsset(admin, original.generation_run_id, `infographic-${visualHash.slice(0, 20)}`, async () => buffer);
  const updated = await saveExistingDraftRevision(admin, original, token.data.token, article);
  console.log(JSON.stringify({ saved: true, id: updated.id, status: updated.status, slug: updated.slug, coverPreserved: updated.image_url === original.image_url,
    infographic: updated.editorial_metadata.infographic_url, words: updated.content.split(/\s+/).length }));
}
console.log(JSON.stringify({ id: POST_ID, prepared: true, applied: process.argv.includes('--apply'), preview,
  wordCount: article.quality.wordCount, quality: article.quality, sourceReferences: sources.map(({ text, ...source }) => source), visualHash }));