import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { articleSlug, contentFingerprint, ensureGenerationAsset, isDuplicateArticle, isGenerationDue, renderInfographic, runEditorialGeneration, validateEditorialArticle, verifySource } from './_blog-editorial-pipeline.js';

const source = { id: 'cats-protection', url: 'https://www.cats.org.uk/example', title: 'Source', consulted_at: '2026-10-27', text_sha256: 'hash', text: 'Leave written daily care instructions for your trusted cat sitter. Keep the usual bowls and familiar toys accessible.' };
function articleFixture() {
  const points = ['Deja instrucciones escritas para quien cuide a tu gato.', 'Anota donde estan sus platos y el alimento habitual.', 'Presenta al cuidador antes de salir de vacaciones.', 'Acorda como compartir las novedades de cada visita.'];
  const content = `Organizar el cuidado evita olvidos y permite compartir la rutina.\n\n## Rutina\n${points.join('\n\n')}\n\n## Contactos\n${'La organizacion permite dejar por escrito las costumbres y las tareas habituales del hogar. '.repeat(35)}\n\n## Encuentro previo\nUn encuentro ayuda a compartir las instrucciones.\n\n## Para cerrar\nEsta informacion no reemplaza la consulta veterinaria.`;
  const title = 'Como organizar el cuidado de tu gato durante tus vacaciones';
  return { title, content, slug: articleSlug(title), topic: 'cuidador-gato-vacaciones', category: 'organizacion', tags: ['gatos', 'cuidados'],
    cover_alt: 'Un gato en su casa junto a una cuidadora que lee las instrucciones.',
    meta_description: 'Organiza el cuidado de tu gato durante las vacaciones con instrucciones claras para su cuidador, contactos y una rutina que puedan compartir.',
    infographic_title: 'Cuidados compartidos durante las vacaciones', infographic_points: points,
    evidence: [{ claim: points[0], source_id: source.id, quote: 'Leave written daily care instructions for your trusted cat sitter.' },
      { claim: points[1], source_id: source.id, quote: 'Keep the usual bowls and familiar toys accessible.' }] };
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
    const article = { ...articleFixture(), quality: { ready: true } };
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