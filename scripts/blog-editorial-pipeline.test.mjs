import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { articleSlug, contentFingerprint, EditorialPolicyError, ensureGenerationAsset, generateVerifiedArticleWithOptions, isDuplicateArticle, isGenerationDue, renderInfographic, reviewVerifiedArticle, runEditorialGeneration, validateEditorialArticle, verifySource } from '../api/cron/_blog-editorial-pipeline.js';

const source = { id: 'cats-protection', url: 'https://www.cats.org.uk/example', title: 'Source', consulted_at: '2026-10-27', text_sha256: 'hash', text: 'Leave written daily care instructions for your trusted cat sitter. Keep the usual bowls and familiar toys accessible.' };
function articleFixture() {
  const points = ['Deja instrucciones escritas para quien cuide a tu gato.', 'Anota donde estan sus platos y el alimento habitual.', 'Presenta al cuidador antes de salir de vacaciones.', 'Acorda como compartir las novedades de cada visita.'];
  const content = `Organizar el cuidado evita olvidos y permite compartir la rutina.\n\n## Rutina\n${points.map((point, index) => `${point}${index < 2 ? ' ([Cats Protection](https://www.cats.org.uk/example))' : ''}`).join('\n\n')}\n\n## Contactos\n${'La organizacion permite dejar por escrito las costumbres y las tareas habituales del hogar. '.repeat(35)}\n\n## Encuentro previo\nUn encuentro ayuda a compartir las instrucciones.\n\n## Para cerrar\nUna organizacion clara ayuda a compartir las tareas cotidianas.`;
  const title = 'Como organizar el cuidado de tu gato durante tus vacaciones';
  return { title, content, slug: articleSlug(title), topic: 'cuidador-gato-vacaciones', category: 'organizacion', tags: ['gatos', 'cuidados'],
    cover_alt: 'Un gato en su casa junto a una cuidadora que lee las instrucciones.',
    meta_description: 'Organiza el cuidado de tu gato durante las vacaciones con instrucciones claras para su cuidador, contactos y una rutina que puedan compartir.',
    infographic_title: 'Cuidados compartidos durante las vacaciones', infographic_points: points,
    evidence: [{ claim: points[0], source_id: source.id, quote: 'Leave written daily care instructions for your trusted cat sitter.' },
      { claim: points[1], source_id: source.id, quote: 'Keep the usual bowls and familiar toys accessible.' }] };
}
function articleGenerationAdmin(history = [], retainedRuns = []) {
  return { from: (table) => table === 'blog_posts'
    ? { select: () => ({ order: () => ({ limit: async () => ({ data: history, error: null }) }) }) }
    : { select: () => ({ eq: () => ({ gte: () => ({ limit: async () => ({ data: retainedRuns, error: null }) }) }) }) } };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('intervalo y duplicados', () => {
  it('solo permite generar a partir de 36 horas reales desde el exito', () => {
    const now = Date.parse('2026-10-27T12:00:00Z');
    expect(isGenerationDue(null, now)).toBe(true);
    expect(isGenerationDue(new Date(now - 36 * 3600000 + 1).toISOString(), now)).toBe(false);
    expect(isGenerationDue(new Date(now - 36 * 3600000).toISOString(), now)).toBe(true);
  });
  it.each(['title', 'slug', 'content', 'topic'])('detecta duplicado por %s', (field) => {
    const article = articleFixture();
    const previous = { title: 'Otro titulo diferente', slug: 'otro-slug', content: 'Otro contenido', topic: 'otro-tema', [field]: article[field] };
    expect(isDuplicateArticle(article, [previous])).toBe(true);
  });
  it('normaliza mayusculas y espacios para fingerprint', () => {
    expect(contentFingerprint(' Un CONTENIDO. ')).toBe(contentFingerprint('un contenido'));
  });
});

describe('validacion editorial por criterio', () => {
  it('acepta un articulo completo con evidencia exacta y resumen propio', () => {
    expect(validateEditorialArticle(articleFixture(), [source]).ready).toBe(true);
  });
  it('rechaza fuente ausente o cita fabricada aunque otros criterios pasen', () => {
    expect(validateEditorialArticle(articleFixture(), []).ready).toBe(false);
    const article = articleFixture(); article.evidence[0].quote = 'Una afirmacion inventada que no aparece en ninguna fuente real.';
    expect(validateEditorialArticle(article, [source]).criteria.sources).toBe(false);
  });
  it('exige que cada afirmacion respaldada incluya el enlace de su fuente en el mismo parrafo', () => {
    const article = articleFixture();
    article.content = article.content.replace(' ([Cats Protection](https://www.cats.org.uk/example))', '');
    expect(validateEditorialArticle(article, [source]).criteria.sources).toBe(false);
  });
  it('retiene recomendaciones clinicas y falsa identidad veterinaria', () => {
    const article = articleFixture(); article.content += ' Como veterinaria recomiendo dosis de medicacion.';
    const result = validateEditorialArticle(article, [source]);
    expect(result.ready).toBe(false); expect(result.veterinaryReviewRequired).toBe(true);
  });
  it('rechaza una infografia que agrega informacion ausente del articulo', () => {
    const article = articleFixture(); article.infographic_points[0] = 'Una recomendacion nueva que no estaba en el articulo.';
    expect(validateEditorialArticle(article, [source]).criteria.infographic).toBe(false);
  });
  it('no acepta metadescripcion corta ni slug incompatible', () => {
    expect(validateEditorialArticle({ ...articleFixture(), meta_description: 'Corto', slug: 'distinto' }, [source]).criteria.seo).toBe(false);
  });
});

describe('fuentes verificadas', () => {
  it('rechaza HTTP fallido', async () => {
    await expect(verifySource({ url: 'https://www.cats.org.uk/example' }, async () => new Response('', { status: 404 }))).rejects.toThrow();
  });
  it('no consulta fuentes arbitrarias ni redes internas', async () => {
    const fetcher = vi.fn();
    await expect(verifySource({ url: 'http://127.0.0.1' }, fetcher)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('conserva evidencia y agrega enlace inline para cada parrafo factual, no solo dos', async () => {
    const sourceText = 'A trusted cat sitter reads the daily care instructions for cats. '.repeat(24);
    const verifiedSource = { ...source, organization: 'Cats Protection', text: sourceText, url: 'https://www.cats.org.uk/example' };
    const admin = articleGenerationAdmin();
    const requestJson = vi.fn(async () => ({
      title: 'Como organizar el cuidado cotidiano de un gato durante vacaciones',
      sections: [
        { heading: 'Elegí un cuidador', paragraphs: [{ text: 'Una persona confiable puede ayudar a cuidar el hogar.', source_quote_index: 0 }] },
        { heading: 'Prepará el hogar', paragraphs: [{ text: 'Dejá accesibles las instrucciones cotidianas.', source_quote_index: 1 }] },
        { heading: 'Acordá la rutina', paragraphs: [{ text: 'Compartí las tareas habituales antes de salir.', source_quote_index: 2 }] },
        { heading: 'Para cerrar', paragraphs: [{ text: 'Una organización clara ayuda a coordinar el cuidado de tu gato.' }] },
      ],
      meta_description: 'Organiza el cuidado cotidiano de tu gato durante vacaciones con una persona confiable, rutinas claras y recursos listos para quien lo acompañe.',
      editorial_brief: { reader_need: 'Organizar cuidado cotidiano', takeaway: 'Compartir rutinas', essential_sections: [{ key: 'rutina', terms: ['cotidiana'] }] },
      visual_plan: {}, category: 'organizacion', tags: ['gatos', 'vacaciones'], cover_alt: 'Un gato descansa en su casa durante unas vacaciones.',
    }));
    const result = await generateVerifiedArticleWithOptions(admin, requestJson, { catalog: [
      { id: 'routine', title: 'Organizar el cuidado cotidiano de un gato durante vacaciones', url: verifiedSource.url },
    ], sourceVerifier: async () => verifiedSource });
    expect(result.evidence).toHaveLength(3);
    expect(result.quality.criteria.sources).toBe(true);
    expect(result.quality.criteria.infographic).toBe(true);
    expect(result.visual_plan.sections).toHaveLength(3);
    expect(result.evidence.every((item) => result.content.includes(`([Cats Protection](${verifiedSource.url}))`))).toBe(true);
  });
  it('extrae contenido principal y guarda evidencia y fecha', async () => {
    const fetcher = vi.fn(async () => new Response(`<main><h1>Cuidados</h1><p>${'Contenido de fuente verificable. '.repeat(50)}</p></main>`));
    const result = await verifySource({ url: 'https://www.cats.org.uk/example' }, fetcher);
    expect(result.title).toBe('Cuidados'); expect(result.consulted_at).toBeTruthy(); expect(result.text_sha256).toHaveLength(64);
  });
  it('admite el contenedor site-body real de Cats Protection sin main ni article', async () => {
    const fetcher = vi.fn(async () => new Response(`<div class="site-body"><h1>Going on holiday</h1><p>${'Daily care instructions for a trusted cat sitter. '.repeat(30)}</p></div>`));
    expect((await verifySource({ url: 'https://www.cats.org.uk/example' }, fetcher)).text.length).toBeGreaterThan(800);
  });
});

describe('imagenes completas e idempotentes', () => {
  it('renderiza PNG vertical 4:5 de 1080x1350', async () => {
    const article = { ...articleFixture(), quality: { ready: true }, visual_plan: {
      kind: 'process', title: 'Organizá el cuidado de tu gato', closing: 'Una organizacion clara ayuda a compartir las tareas cotidianas.',
      sections: [
        { heading: 'Prepará', layout: 'timeline', items: [{ icon: 'record', label: 'Instrucciones', anchor: 'Deja instrucciones escritas para quien cuide a tu gato.' }] },
        { heading: 'Acordá', layout: 'conversation', items: [{ icon: 'message', label: 'Novedades', anchor: 'Acorda como compartir las novedades de cada visita.' }] },
        { heading: 'Organizá', layout: 'record', items: [{ icon: 'food', label: 'Alimento', anchor: 'Anota donde estan sus platos y el alimento habitual.' }] },
      ],
    } };
    const buffer = await renderInfographic(article);
    expect(await sharp(buffer).metadata()).toMatchObject({ format: 'png', width: 1080, height: 1350 });
  });
  it('rechaza imagen de articulo retenido', async () => {
    await expect(renderInfographic({ ...articleFixture(), quality: { ready: false } })).rejects.toThrow();
  });
  it('reutiliza un recurso existente sin generar ni subir de nuevo', async () => {
    const generate = vi.fn(); const upload = vi.fn();
    const admin = { storage: { from: () => ({ download: async () => ({ data: new Blob(['image']) }), upload, getPublicUrl: () => ({ data: { publicUrl: 'https://example.test/cover.png' } }) }) } };
    expect(await ensureGenerationAsset(admin, 'run', 'cover', generate)).toContain('cover.png');
    expect(generate).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled();
  });
});

describe('etapas persistidas y borrador', () => {
  it('rechaza un tema clinico antes de descargar fuentes o redactar', async () => {
    const admin = articleGenerationAdmin();
    const sourceVerifier = vi.fn(); const requestJson = vi.fn();
    await expect(generateVerifiedArticleWithOptions(admin, requestJson, { catalog: [
      { id: 'emergency', title: 'Que hacer si una mascota se atraganta', url: 'https://www.cats.org.uk/example' },
    ], sourceVerifier })).rejects.toMatchObject({ name: 'EditorialPolicyError', code: 'EDITORIAL_POLICY_REJECTED' });
    expect(sourceVerifier).not.toHaveBeenCalled(); expect(requestJson).not.toHaveBeenCalled();
  });
  it('salta un topico retenido recientemente y elige otro permitido sin repetirlo', async () => {
    const admin = articleGenerationAdmin([], [{ payload: { topic: 'blocked-topic' } }]);
    let selectedTopic;
    await expect(generateVerifiedArticleWithOptions(admin, vi.fn(), { catalog: [
      { id: 'blocked-topic', title: 'Organizar visitas del cuidador de un gato', url: 'https://www.cats.org.uk/first' },
      { id: 'fresh-topic', title: 'Organizar los espacios de descanso habituales de un gato', url: 'https://www.cats.org.uk/second' },
    ], sourceVerifier: async (topic) => { selectedTopic = topic; throw new Error('topic-selected'); } })).rejects.toThrow('topic-selected');
    expect(selectedTopic.id).toBe('fresh-topic');
  });
  it('no invoca al revisor semantico si el texto viola la politica aunque tenga descargo', async () => {
    const requestJson = vi.fn();
    const candidate = { title: 'Que hacer si una mascota se atraganta', content: 'Esta informacion no reemplaza la consulta veterinaria.',
      sources: [{ id: 'source', text: 'Una fuente consultada.' }], quality: { ready: true, failed: [] } };
    await reviewVerifiedArticle(candidate, requestJson);
    expect(requestJson).not.toHaveBeenCalled();
    expect(candidate.quality).toMatchObject({ ready: false, failed: ['editorial_policy'] });
  });
  it('guarda el texto validado antes de ejecutar la revision semantica en otra solicitud', async () => {
    const rpc = vi.fn(async (name) => name === 'claim_blog_generation' ? { data: { id: 'run', lease_token: 'token', stage: 'text', payload: {}, attempts: 1 }, error: null } : { data: true, error: null });
    const reviewText = vi.fn();
    expect(await runEditorialGeneration({ rpc }, { generateText: async () => ({ ...articleFixture(), quality: { ready: true } }), reviewText })).toMatchObject({ stage: 'text' });
    expect(reviewText).not.toHaveBeenCalled();
    expect(rpc.mock.calls[1][1].p_stage).toBe('text');
  });
  it('retiene el texto si falla la revision semantica aunque el QA estructural pase', async () => {
    const rpc = vi.fn(async (name) => name === 'claim_blog_generation' ? { data: { id: 'run', lease_token: 'token', stage: 'text', payload: { ...articleFixture(), quality: { ready: true } }, attempts: 1 }, error: null } : { data: true, error: null });
    const generateText = vi.fn();
    expect(await runEditorialGeneration({ rpc }, { generateText, reviewText: async (article) => ({ ...article, quality: { ready: false } }) })).toMatchObject({ stage: 'retained' });
    expect(generateText).not.toHaveBeenCalled();
  });
  it('revalida y retiene contenido clinico con descargo antes de revision o imagenes', async () => {
    const rpc = vi.fn(async (name) => name === 'claim_blog_generation' ? { data: { id: 'run', lease_token: 'token', stage: 'text', payload: {}, attempts: 1 }, error: null } : { data: true, error: null });
    const reviewText = vi.fn(); const generateCover = vi.fn(); const infographic = vi.fn();
    const result = await runEditorialGeneration({ rpc }, { reviewText, generateCover, infographic,
      generateText: async () => ({ title: 'Que hacer si una mascota se atraganta', content: 'Esta informacion no reemplaza la consulta veterinaria.', quality: { ready: true, failed: [] } }) });
    expect(result).toMatchObject({ stage: 'retained', policy: { status: 'excluded', code: 'urgent_care' } });
    expect(reviewText).not.toHaveBeenCalled(); expect(generateCover).not.toHaveBeenCalled(); expect(infographic).not.toHaveBeenCalled();
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_stage: 'retained', p_payload: { quality: { ready: false }, policy_rejection_reason: expect.any(String) } });
    expect(rpc.mock.calls.some(([name]) => name === 'finish_blog_generation')).toBe(false);
  });
  it('no hace trabajo si otro proceso tiene la reserva o aun no pasaron 36 horas', async () => {
    const admin = { rpc: vi.fn(async () => ({ data: null, error: null })) };
    const generateText = vi.fn();
    expect(await runEditorialGeneration(admin, { generateText })).toMatchObject({ skipped: true });
    expect(generateText).not.toHaveBeenCalled();
  });
  it('retiene un texto que falla los criterios sin crear un post', async () => {
    const rpc = vi.fn(async (name) => name === 'claim_blog_generation' ? { data: { id: 'run', lease_token: 'token', stage: 'text', attempts: 1 }, error: null } : { data: true, error: null });
    expect(await runEditorialGeneration({ rpc }, { generateText: async () => ({ quality: { ready: false } }) })).toMatchObject({ stage: 'retained' });
    expect(rpc.mock.calls[1][1].p_stage).toBe('retained');
    expect(rpc.mock.calls.some(([name]) => name === 'finish_blog_generation')).toBe(false);
  });
  it('guarda fallo de portada y permite reintento sin insertar borradores incompletos', async () => {
    const rpc = vi.fn(async (name) => name === 'claim_blog_generation' ? { data: { id: 'run', lease_token: 'token', stage: 'cover', payload: {}, attempts: 1 }, error: null } : { data: true, error: null });
    const admin = { rpc, storage: { from: () => ({ download: async () => ({ data: null, error: { message: 'not found' } }) }) } };
    await expect(runEditorialGeneration(admin, { generateCover: async () => { throw new Error('Proveedor HTTP 429'); } })).rejects.toThrow('429');
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_stage: 'cover', p_error: 'Proveedor HTTP 429' });
    expect(rpc.mock.calls.some(([name]) => name === 'finish_blog_generation')).toBe(false);
  });
  it('tras tres fallos retiene la corrida para revision visible', async () => {
    const rpc = vi.fn(async (name) => name === 'claim_blog_generation' ? { data: { id: 'run', lease_token: 'token', stage: 'cover', payload: {}, attempts: 3 }, error: null } : { data: true, error: null });
    const admin = { rpc, storage: { from: () => ({ download: async () => ({ data: null, error: { message: 'not found' } }) }) } };
    await expect(runEditorialGeneration(admin, { generateCover: async () => { throw new Error('Error'); } })).rejects.toThrow();
    expect(rpc.mock.calls[1][1].p_stage).toBe('retained');
  });
  it('solo finaliza con ambas imagenes y conserva status draft de la RPC', async () => {
    const payload = { ...articleFixture(), sources: [source], quality: { ready: true }, cover_url: 'https://example.test/cover.png', infographic_url: 'https://example.test/info.png' };
    const rpc = vi.fn(async (name) => name === 'claim_blog_generation' ? { data: { id: 'run', lease_token: 'token', stage: 'finalize', payload, attempts: 1 }, error: null } : { data: { id: 'post', slug: payload.slug, status: 'draft' }, error: null });
    const admin = { rpc, from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) };
    expect(await runEditorialGeneration(admin)).toMatchObject({ stage: 'complete', post: { status: 'draft' } });
  });
});