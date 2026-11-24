import crypto from 'node:crypto';
import fs from 'node:fs';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyHumanDecisionPolicy, draftSelectedArticle, runEditorialGeneration, validateEditorialArticle, validationSnapshotOf } from '../api/cron/_blog-editorial-pipeline.js';
import { discoverFromIndex, hostReady, reserveBudget, rotationOrder, runSelectionPulse, speciesOfPost } from '../api/cron/_blog-candidates.js';
import { assessTopicSupport, verifySourceCandidate } from '../api/cron/_blog-source-verifier.js';
import { BUDGET_KINDS, SEARCH_LIMITS, classifyCandidateUrl, getSourceById, seedCandidates } from '../api/cron/_blog-sources.js';
import { buildVetReviewPrompt, interpretArticleVerdict, reviewArticleSemantically, vetReviewIsValid } from '../api/cron/_blog-vet-review.js';
import { infographicContentHash } from '../api/cron/_blog-infographic.js';
import { evaluateCandidateTopic } from '../api/cron/_editorial-policy.js';
import { HOLIDAY_BRIEF, HOLIDAY_CONTENT, HOLIDAY_VISUAL_PLAN } from './editorial/cat-holiday-revision.mjs';

const HOUR = 3600000;
const MINUTE = 60000;

// Simulador de las RPC de 061, 062 y 076. Su semantica esta comprobada contra Postgres real en la prueba de migracion.
function createDb({ posts = [], candidates = [] } = {}) {
  const db = { posts: [...posts], candidates: new Map(), attempts: [], runs: new Map(), active: null, lastSuccess: null, nextEligible: 0, discoveries: new Map(),
    assets: new Map(), calls: [], writes: [], runSeq: 0, tokenSeq: 0, candSeq: 0 };
  const key = (url) => url.toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '');
  const addCandidate = (item) => {
    const row = { id: `cand-${++db.candSeq}`, status: 'discovered', permanent: false, attempts: 0, last_attempt_at: null, next_retry_at: null, last_run_id: null, origin: 'seed', ...item };
    db.candidates.set(key(row.url), row);
    return row;
  };
  candidates.forEach(addCandidate);
  const trigger = (run) => {
    for (const row of db.candidates.values()) {
      if (row.last_run_id !== run.id || row.status !== 'selected') continue;
      if (run.stage === 'complete') Object.assign(row, { status: 'used', permanent: true });
      if (run.stage === 'retained') Object.assign(row, { status: 'rejected', permanent: false, next_retry_at: Date.now() + 720 * HOUR });
    }
  };
  const leased = (id, token) => {
    const run = db.runs.get(id);
    if (!run || !token || run.lease_token !== token || !run.lease_until || run.lease_until < Date.now() || db.active !== id) return null;
    return run;
  };
  const retain = (run) => {
    run.stage = 'retained'; db.active = null;
    db.nextEligible = Math.max((db.lastSuccess ?? 0) + 36 * HOUR, Date.now() + HOUR);
    trigger(run);
  };
  const save = (args) => {
    const run = leased(args.p_id, args.p_token);
    if (!run) return { data: null, error: { message: 'Reserva de generacion vencida' } };
    Object.assign(run, { stage: args.p_stage, payload: structuredClone(args.p_payload), error: args.p_error ?? null, lease_token: null, lease_until: null });
    if (args.p_error == null) run.attempts = 0;
    run.retry_at = args.p_error == null ? Date.now() : Date.now() + 5 * MINUTE;
    if (args.p_stage === 'retained') retain(run);
    return { data: true, error: null };
  };
  const handlers = {
    claim_blog_generation() {
      const now = Date.now();
      let run;
      if (db.active) {
        run = db.runs.get(db.active);
        if ((run.lease_until && run.lease_until > now) || run.retry_at > now) return { data: null, error: null };
        if (run.attempts >= 3) { run.lease_token = null; retain(run); return { data: null, error: null }; }
      } else {
        if (db.nextEligible > now) return { data: null, error: null };
        run = { id: `run-${++db.runSeq}`, stage: 'text', payload: {}, attempts: 0, retry_at: now, lease_token: null, lease_until: null, created_at: now, budget: {} };
        db.runs.set(run.id, run); db.active = run.id;
      }
      Object.assign(run, { lease_token: `token-${++db.tokenSeq}`, lease_until: now + 5 * MINUTE, attempts: run.attempts + 1 });
      return { data: structuredClone(run), error: null };
    },
    save_blog_generation_stage: save,
    reserve_blog_generation_budget(args) {
      const run = leased(args.p_id, args.p_token);
      if (!run) return { data: null, error: { message: 'Reserva de generacion vencida' } };
      const hard = { pulse: 8, verification: 12, candidate_semantic: 6, article_semantic: 2, draft: 2 }[args.p_kind];
      if (!hard) return { data: null, error: { message: 'Tipo de presupuesto invalido' } };
      const cap = Math.min(hard, Math.max(args.p_cap ?? hard, 0));
      run.budget ||= {};
      const used = run.budget[args.p_kind] || 0;
      if (used >= cap) return { data: { allowed: false, kind: args.p_kind, used, cap, budget: structuredClone(run.budget) }, error: null };
      run.budget[args.p_kind] = used + 1;
      return { data: { allowed: true, kind: args.p_kind, used: used + 1, cap, budget: structuredClone(run.budget) }, error: null };
    },
    retain_blog_generation_search_exhausted(args) {
      const result = save({ ...args, p_stage: 'retained' });
      if (!result.error) db.nextEligible = Math.max(db.nextEligible, Math.min(Date.parse(args.p_not_before), Date.now() + 6 * HOUR));
      return result;
    },
    list_blog_topic_candidates(args) {
      const now = Date.now();
      const rows = [...db.candidates.values()].filter((row) => !row.permanent && ['discovered', 'rejected'].includes(row.status) && (!row.next_retry_at || row.next_retry_at <= now)
        && (!args.p_species || args.p_species.includes(row.species)));
      return { data: structuredClone(rows.slice(0, args.p_limit)), error: null };
    },
    upsert_blog_topic_candidates(args) {
      let inserted = 0;
      for (const item of args.p_candidates) if (!db.candidates.has(key(item.url))) { addCandidate(item); inserted += 1; }
      return { data: inserted, error: null };
    },
    claim_blog_source_discovery(args) {
      if (db.discoveries.has(args.p_source_key)) return { data: false, error: null };
      db.discoveries.set(args.p_source_key, 'claimed');
      return { data: true, error: null };
    },
    record_blog_source_discovery(args) { db.discoveries.set(args.p_source_key, args.p_status); return { data: null, error: null }; },
    record_blog_generation_attempts(args) {
      const run = leased(args.p_id, args.p_token);
      if (!run) return { data: null, error: { message: 'Reserva de generacion vencida' } };
      for (const attempt of args.p_attempts) {
        db.attempts.push({ run_id: args.p_id, ...structuredClone(attempt) });
        const row = [...db.candidates.values()].find((item) => item.id === attempt.candidate_id);
        if (row && row.status !== 'used') {
          const cooldown = attempt.cooldown_hours;
          Object.assign(row, { attempts: row.attempts + 1, last_attempt_at: Date.now(), last_run_id: args.p_id, reason_code: attempt.reason_code, http_status: attempt.http_status,
            status: attempt.outcome === 'selected' ? 'selected' : attempt.outcome === 'semantic_unavailable' ? 'discovered' : 'rejected',
            permanent: !['selected', 'semantic_unavailable'].includes(attempt.outcome) && cooldown == null,
            next_retry_at: attempt.outcome === 'selected' || cooldown == null ? null : Date.now() + cooldown * HOUR });
        }
      }
      const mine = db.attempts.filter((item) => item.run_id === args.p_id);
      if (mine.filter((item) => item.verification_counted).length > 12) return { data: null, error: { message: 'Limite de verificaciones por corrida excedido' } };
      if (mine.filter((item) => item.outcome === 'content_rejected').length > 2) return { data: null, error: { message: 'Limite de redacciones por corrida excedido' } };
      Object.assign(run, { species: args.p_meta.species ?? run.species, topic_id: args.p_meta.topic_id ?? run.topic_id, selection: args.p_meta.selection ?? run.selection });
      return { data: args.p_attempts.length, error: null };
    },
    finish_blog_generation(args) {
      const run = leased(args.p_id, args.p_token);
      const payload = run?.payload;
      if (!run || run.stage !== 'finalize' || payload.quality?.ready !== true || !payload.cover_url || !payload.infographic_url || !(payload.sources?.length >= 1)) {
        return { data: null, error: { message: 'Borrador incompleto' } };
      }
      // Replica del trigger guard_blog_generated_post_vet_review: sin aprobacion para este texto exacto no se inserta el post.
      const md5 = (value) => crypto.createHash('md5').update(String(value ?? ''), 'utf8').digest('hex');
      const review = payload.vet_review;
      if (review?.approved !== true || !(review.confidence >= 0.8) || review.content_md5 !== md5(payload.content) || review.title_md5 !== md5(payload.title)
        || review.meta_md5 !== md5(payload.meta_description)) {
        return { data: null, error: { message: 'Borrador bloqueado: falta una revision semantica veterinaria aprobada para este texto' } };
      }
      const post = { id: `post-${db.posts.length + 1}`, title: payload.title, slug: payload.slug, content: payload.content, topic: payload.topic, status: 'draft', species: payload.species,
        quality: structuredClone(payload.quality),
        // Replica del guard 063: sin snapshot que coincida con el contenido el borrador nace invalidado y no puede publicarse.
        invalidated: payload.validation_snapshot?.content !== payload.content || payload.validation_snapshot?.title !== payload.title };
      db.posts.push(post);
      Object.assign(run, { stage: 'complete', lease_token: null, lease_until: null }); db.active = null; db.lastSuccess = Date.now(); db.nextEligible = Date.now() + 36 * HOUR;
      trigger(run);
      return { data: post, error: null };
    },
  };
  db.failOnce = new Set();
  db.rpc = async (name, args = {}) => {
    db.calls.push(name);
    if (db.failOnce.delete(name)) return { data: null, error: { message: 'fallo simulado de Supabase' } };
    if (!handlers[name]) throw new Error(`RPC no simulada: ${name}`);
    return handlers[name](args);
  };
  db.from = (table) => {
    if (table !== 'blog_posts') throw new Error(`Tabla no simulada: ${table}`);
    return {
      select: () => ({ order: () => ({ limit: async (limit) => ({ data: db.posts.slice().reverse().slice(0, limit).map(({ title, slug, content, topic }) => ({ title, slug, content, topic })), error: null }) }) }),
      insert: () => { db.writes.push('insert'); throw new Error('El pipeline no debe escribir en blog_posts'); },
      update: () => { db.writes.push('update'); throw new Error('El pipeline no debe modificar blog_posts'); },
      upsert: () => { db.writes.push('upsert'); throw new Error('El pipeline no debe escribir en blog_posts'); },
      delete: () => { db.writes.push('delete'); throw new Error('El pipeline no debe borrar blog_posts'); },
    };
  };
  db.storage = { from: () => ({
    download: async (path) => (db.assets.has(path) ? { data: new Blob([db.assets.get(path)]) } : { data: null, error: { message: 'not found' } }),
    upload: async (path, buffer) => { db.assets.set(path, buffer); return { error: null }; },
    getPublicUrl: (path) => ({ data: { publicUrl: `https://storage.example/${path}` } }),
  }) };
  db.addCandidate = addCandidate;
  db.startRun = async () => (await db.rpc('claim_blog_generation')).data;
  db.seedRun = (run) => {
    const row = { id: `run-${++db.runSeq}`, stage: 'text', payload: {}, attempts: 0, retry_at: Date.now(), lease_token: null, lease_until: null, created_at: Date.now(), budget: {}, ...run };
    db.runs.set(row.id, row); db.active = row.id;
    return row;
  };
  return db;
}

const GOOD_TEXT = 'Offer a quiet space where your companion can rest after play. Rotate the toys every few days to keep interest high. Keep sessions short and finish while the animal is still keen. '.repeat(8);
const page = (title, { headings = ['Getting started', 'Keep it fun'], text = GOOD_TEXT } = {}) => `<html><head><title>${title}</title></head><body><nav>menu</nav><main id="content"><h1>${title}</h1>${headings.map((heading) => `<h2>${heading}</h2>`).join('')}<p>${text}</p></main></body></html>`;
const html = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html' } });
const BASICS = 'https://www.dogstrust.org.uk/dog-advice/training/basics';
const dog = (path, title = 'Playtime ideas', source = 'dogs-trust') => ({ source_id: source, url: `https://${getSourceById(source).hosts[0]}${path}`, title, species: 'dog' });
const cat = (path, title = 'Playtime ideas', source = 'battersea') => ({ source_id: source, url: `https://${getSourceById(source).hosts[0]}${path}`, title, species: 'cat' });
const OK_VERDICT = { requires_veterinary_validation: false, everyday_non_clinical: true, confidence: 0.95, category: 'enriquecimiento', reasons: ['rutina cotidiana'] };
const OK_ARTICLE_VERDICT = { requires_veterinary_validation: false, contains_clinical_advice: false, everyday_non_clinical: true, confidence: 0.95, issues: [] };
// El primer parametro responde a la revision de CANDIDATOS y el segundo a la revision del ARTICULO completo.
const makeAi = (verdict = OK_VERDICT, articleVerdict = OK_ARTICLE_VERDICT) => vi.fn(async (prompt) => {
  const isArticle = String(prompt).includes('Evalua el articulo COMPLETO');
  if (!isArticle && !String(prompt).includes('revisor editorial prudente')) throw new Error('Prompt inesperado en la seleccion');
  const chosen = isArticle ? articleVerdict : verdict;
  return typeof chosen === 'function' ? chosen(prompt) : chosen;
});
const routes = (map) => vi.fn(async (url) => {
  const handler = map[url];
  if (!handler) return html('', 404);
  return typeof handler === 'function' ? handler(url) : handler;
});
const failWith = (status) => () => html('', status);
const png = () => sharp({ create: { width: 640, height: 640, channels: 3, background: '#2E7D32' } }).png().toBuffer();

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-18T12:00:00Z')); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('verificador de fuentes: errores tipados', () => {
  const candidate = { source_id: 'dogs-trust', url: BASICS };
  const code = async (fetcher, target = candidate) => verifySourceCandidate(target, { fetcher }).then(() => null, (error) => ({ code: error.code, httpStatus: error.httpStatus }));

  it.each([[403, 'http_403'], [404, 'http_404'], [500, 'http_5xx'], [429, 'http_429']])('HTTP %i se informa como %s', async (status, expected) => {
    expect(await code(routes({ [BASICS]: failWith(status) }))).toEqual({ code: expected, httpStatus: status });
  });
  it('timeout', async () => {
    expect((await code(async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); })).code).toBe('timeout');
  });
  it('error DNS y error de conexion se distinguen', async () => {
    expect((await code(async () => { throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } }); })).code).toBe('dns');
    expect((await code(async () => { throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } }); })).code).toBe('connection');
  });
  it('sigue una redireccion dentro del mismo dominio y de rutas permitidas', async () => {
    const target = 'https://www.dogstrust.org.uk/dog-advice/training/tips-tricks';
    const fetcher = routes({ [BASICS]: () => new Response(null, { status: 301, headers: { location: '/dog-advice/training/tips-tricks' } }), [target]: html(page('Tips and tricks')) });
    const result = await verifySourceCandidate(candidate, { fetcher });
    expect(result.url).toBe(target);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([, options]) => options.redirect === 'manual')).toBe(true);
  });
  it('no sigue una redireccion a un dominio no autorizado', async () => {
    const fetcher = routes({ [BASICS]: () => new Response(null, { status: 302, headers: { location: 'https://evil.example/steal' } }) });
    expect((await code(fetcher)).code).toBe('redirect_unauthorized');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('no sigue una redireccion del mismo dominio hacia una ruta clinica', async () => {
    const fetcher = routes({ [BASICS]: () => new Response(null, { status: 301, headers: { location: '/dog-advice/health/vaccinations' } }) });
    expect((await code(fetcher)).code).toBe('redirect_path_not_allowed');
  });
  it('descarta una pagina sin contenido principal suficiente', async () => {
    expect((await code(routes({ [BASICS]: html(page('Basics', { text: 'Muy poco texto.' })) }))).code).toBe('insufficient_content');
  });
  it('no consulta dominios ni rutas fuera del registro y no envia credenciales', async () => {
    const fetcher = routes({});
    expect((await code(fetcher, { source_id: 'dogs-trust', url: 'https://evil.example/x' })).code).toBe('domain_not_allowed');
    expect((await code(fetcher, { source_id: 'dogs-trust', url: 'http://www.dogstrust.org.uk/dog-advice/training/basics' })).code).toBe('domain_not_allowed');
    expect((await code(fetcher, { source_id: 'dogs-trust', url: 'https://www.dogstrust.org.uk/dog-advice/health/vaccines' })).code).toBe('path_not_allowed');
    expect(fetcher).not.toHaveBeenCalled();
    const ok = routes({ [BASICS]: html(page('Basics')) });
    await verifySourceCandidate(candidate, { fetcher: ok });
    expect(Object.keys(ok.mock.calls[0][1].headers).sort()).toEqual(['Accept', 'User-Agent']);
  });
  it('detecta una fuente que no respalda el tema', async () => {
    const verified = await verifySourceCandidate(candidate, { fetcher: routes({ [BASICS]: html(page('Basics')) }) });
    expect(assessTopicSupport('Basics quiet space', verified).supported).toBe(true);
    expect(assessTopicSupport('Litter tray cleaning schedule', verified).supported).toBe(false);
  });
  it('extrae el contenido con el selector propio de cada fuente (RSPCA usa #content)', async () => {
    const url = 'https://www.rspca.org.uk/adviceandwelfare/pets/rabbits/behaviour/enrichment';
    const body = `<html><body><div id="content"><h1>Keeping rabbits busy</h1><p>${GOOD_TEXT}</p></div></body></html>`;
    const result = await verifySourceCandidate({ source_id: 'rspca', url }, { fetcher: routes({ [url]: html(body) }) });
    expect(result.organization).toBe('RSPCA');
    expect(result.text.length).toBeGreaterThan(800);
  });
});

describe('registro de fuentes y rutas', () => {
  it('solo las cinco fuentes autorizadas, con rutas sin salud, dieta ni razas', () => {
    expect(['cats-protection', 'dogs-trust', 'battersea', 'rspca', 'aspca'].every((id) => getSourceById(id))).toBe(true);
    expect(getSourceById('bluecross')).toBeNull();
    const dogsTrust = getSourceById('dogs-trust');
    expect(classifyCandidateUrl(dogsTrust, BASICS)).toMatchObject({ ok: true, species: 'dog' });
    for (const path of ['/dog-advice/health/vaccinations', '/dog-advice/getting-dog/breeds/beagle', '/dog-advice/training/dog-nutrition-tips', '/dog-advice/training']) {
      expect(classifyCandidateUrl(dogsTrust, `https://www.dogstrust.org.uk${path}`).ok).toBe(false);
    }
    expect(classifyCandidateUrl(getSourceById('rspca'), 'https://www.rspca.org.uk/adviceandwelfare/pets/dogs/health/grooming').ok).toBe(false);
  });
  it('todos los candidatos iniciales cumplen la lista blanca y la compuerta veterinaria por titulo', () => {
    const seeds = seedCandidates();
    expect(seeds.length).toBeGreaterThan(10);
    for (const seed of seeds) {
      expect(classifyCandidateUrl(getSourceById(seed.source_id), seed.url).ok).toBe(true);
      expect(evaluateCandidateTopic({ title: seed.title, url: seed.url }).status).toBe('allowed');
    }
  });
});

describe('rotacion de especies', () => {
  it('alterna perros y gatos segun la ultima publicacion', () => {
    expect(rotationOrder(['cat'])[0]).toBe('dog');
    expect(rotationOrder(['dog'])[0]).toBe('cat');
    expect(rotationOrder(['cat', 'cat', 'dog'])[0]).toBe('dog');
    expect(rotationOrder([])[0]).toBe('dog');
  });
  it('otras especies solo tienen su turno una de cada cinco generaciones', () => {
    expect(rotationOrder(['dog', 'cat', 'dog', 'cat'])).toEqual(['rabbit', 'cat', 'dog']);
    expect(rotationOrder(['dog', 'cat', 'dog', 'rabbit'])).toEqual(['cat', 'dog', 'rabbit']);
    expect(rotationOrder(['dog', 'cat'])).toEqual(['cat', 'dog', 'rabbit']);
  });
  it('reconoce la especie de un articulo por su tema o su titulo', () => {
    expect(speciesOfPost({ topic: 'dog-dogs-trust-1', title: 'x' })).toBe('dog');
    expect(speciesOfPost({ topic: 'cuidador-gato-vacaciones', title: 'Cómo preparar el cuidado de tu gato durante las vacaciones' })).toBe('cat');
    expect(speciesOfPost({ topic: 'otro', title: 'Snacks para perros y gatos' })).toBeNull();
  });
  it('un pulso empieza por perros cuando el ultimo articulo fue de gatos', async () => {
    const db = createDb({ posts: [{ title: 'Algo de gatos', topic: 'cat-battersea-1', content: 'x' }], candidates: [cat('/pet-advice/cat-advice/diy-cat-toys', 'DIY cat toys'), dog('/dog-advice/training/basics', 'Basics')] });
    const fetcher = routes({ [BASICS]: html(page('Basics')) });
    const result = await runSelectionPulse(db, await db.startRun(), {}, { fetcher, requestJson: makeAi(), limits: { poolMin: 0 } });
    expect(result.status).toBe('selected');
    expect(result.selection.species).toBe('dog');
  });
  it('incorpora otra especie cuando le toca y hay una fuente valida', async () => {
    const rabbit = 'https://www.rspca.org.uk/adviceandwelfare/pets/rabbits/behaviour/enrichment';
    const db = createDb({ posts: ['cat', 'dog', 'cat', 'dog'].map((species, index) => ({ title: `t${index}`, topic: `${species}-x-${index}`, content: 'c' })),
      candidates: [dog('/dog-advice/training/basics', 'Basics'), { source_id: 'rspca', url: rabbit, title: 'Keeping rabbits busy', species: 'rabbit' }] });
    const fetcher = routes({ [BASICS]: html(page('Basics')), [rabbit]: html(`<div id="content"><h1>Keeping rabbits busy</h1><p>${GOOD_TEXT}</p></div>`) });
    const result = await runSelectionPulse(db, await db.startRun(), {}, { fetcher, requestJson: makeAi(), limits: { poolMin: 0 } });
    expect(result.selection).toMatchObject({ species: 'rabbit', source_id: 'rspca' });
  });
  it('si no toca, o no hay una fuente valida de otra especie, no se fuerza', async () => {
    const rabbit = 'https://www.rspca.org.uk/adviceandwelfare/pets/rabbits/behaviour/enrichment';
    const db = createDb({ posts: [{ title: 't', topic: 'cat-x-1', content: 'c' }],
      candidates: [dog('/dog-advice/training/basics', 'Basics'), { source_id: 'rspca', url: rabbit, title: 'Keeping rabbits busy', species: 'rabbit' }] });
    const fetcher = routes({ [BASICS]: html(page('Basics')), [rabbit]: html(page('Keeping rabbits busy')) });
    expect((await runSelectionPulse(db, await db.startRun(), {}, { fetcher, requestJson: makeAi(), limits: { poolMin: 0 } })).selection.species).toBe('dog');
  });
});

describe('seleccion con alternativas', () => {
  const urls = { basics: BASICS, toys: 'https://www.battersea.org.uk/pet-advice/dog-advice/diy-dog-toys', catToys: 'https://www.battersea.org.uk/pet-advice/cat-advice/diy-cat-toys' };

  it('tema y fuente validos: queda seleccionado y registrado con su verificacion', async () => {
    const db = createDb({ candidates: [dog('/dog-advice/training/basics', 'Basics')] });
    const run = await db.startRun();
    const result = await runSelectionPulse(db, run, {}, { fetcher: routes({ [BASICS]: html(page('Basics')) }), requestJson: makeAi(), limits: { poolMin: 0 } });
    expect(result).toMatchObject({ status: 'selected', selection: { species: 'dog', category: 'enriquecimiento', source_id: 'dogs-trust' } });
    expect(result.selection.source.text_sha256).toHaveLength(64);
    expect(db.attempts).toMatchObject([{ outcome: 'selected', verification_counted: true, species: 'dog' }]);
    expect(db.runs.get(run.id)).toMatchObject({ species: 'dog', topic_id: result.selection.topic_id });
  });

  it('el primer tema falla y el segundo es valido: no se detiene ante el primer error', async () => {
    const db = createDb({ candidates: [dog('/dog-advice/training/basics', 'Basics'), dog('/pet-advice/dog-advice/diy-dog-toys', 'DIY dog toys', 'battersea')] });
    const fetcher = routes({ [urls.basics]: failWith(403), [urls.toys]: html(page('DIY dog toys')) });
    const result = await runSelectionPulse(db, await db.startRun(), {}, { fetcher, requestJson: makeAi(), limits: { poolMin: 0 } });
    expect(result.status).toBe('selected');
    expect(result.selection.url).toBe(urls.toys);
    expect(db.attempts.map((item) => [item.outcome, item.reason_code, item.http_status])).toEqual([['source_failed', 'http_403', 403], ['selected', null, null]]);
    const failed = [...db.candidates.values()].find((row) => row.url === urls.basics);
    expect(failed).toMatchObject({ status: 'rejected', permanent: false });
    expect(failed.next_retry_at).toBe(Date.now() + 24 * HOUR);
  });

  it('una fuente alternativa de otro dominio reemplaza a la que fallo (404 con espera de 30 dias)', async () => {
    const db = createDb({ candidates: [dog('/dog-advice/training/basics', 'Basics'), dog('/pet-advice/dog-advice/diy-dog-toys', 'DIY dog toys', 'battersea')] });
    const fetcher = routes({ [urls.basics]: failWith(404), [urls.toys]: html(page('DIY dog toys')) });
    const result = await runSelectionPulse(db, await db.startRun(), {}, { fetcher, requestJson: makeAi(), limits: { poolMin: 0 } });
    expect(new URL(result.selection.url).hostname).toBe('www.battersea.org.uk');
    expect([...db.candidates.values()].find((row) => row.url === urls.basics).next_retry_at).toBe(Date.now() + 720 * HOUR);
  });

  it('si fallan todos los temas de una especie cambia de especie en el siguiente pulso', async () => {
    const dogs = [dog('/dog-advice/training/a1', 'Playtime a1'), dog('/pet-advice/dog-advice/b1', 'Playtime b1', 'battersea'), dog('/adviceandwelfare/pets/dogs/c1', 'Playtime c1', 'rspca')];
    const db = createDb({ candidates: [...dogs, cat('/pet-advice/cat-advice/diy-cat-toys', 'DIY cat toys')] });
    const map = { [urls.catToys]: html(page('DIY cat toys')) };
    dogs.forEach((item) => { map[item.url] = failWith(403); });
    const fetcher = routes(map);
    const run = await db.startRun();
    const first = await runSelectionPulse(db, run, {}, { fetcher, requestJson: makeAi(), limits: { poolMin: 0 } });
    expect(first.status).toBe('continue');
    expect(fetcher).toHaveBeenCalledTimes(3);
    const second = await runSelectionPulse(db, run, { search: first.search }, { fetcher, requestJson: makeAi(), limits: { poolMin: 0 } });
    expect(second).toMatchObject({ status: 'selected', selection: { species: 'cat' } });
  });

  it('descarta un tema duplicado o ya usado sin descargar la fuente', async () => {
    const db = createDb({ posts: [{ title: 'Basics', topic: 'otro', content: 'c' }], candidates: [dog('/dog-advice/training/basics', 'Basics'), { ...dog('/dog-advice/training/home', 'Used page'), status: 'used', permanent: true }] });
    const fetcher = routes({});
    const result = await runSelectionPulse(db, await db.startRun(), {}, { fetcher, requestJson: makeAi(), limits: { poolMin: 0 } });
    expect(result.status).toBe('exhausted');
    expect(fetcher).not.toHaveBeenCalled();
    expect(db.attempts).toMatchObject([{ outcome: 'policy_rejected', reason_code: 'duplicate_topic', verification_counted: false }]);
  });

  it('agotamiento de candidatos: informa que no hay oportunidad apta y no inventa contenido', async () => {
    const db = createDb({ candidates: [dog('/dog-advice/training/basics', 'Basics')] });
    const ai = makeAi();
    const result = await runSelectionPulse(db, await db.startRun(), {}, { fetcher: routes({ [urls.basics]: failWith(403) }), requestJson: ai, limits: { poolMin: 0 } });
    expect(result.status).toBe('exhausted');
    expect(result.reason).toMatch(/No se encontró una oportunidad editorial apta/);
    expect(result.reason).toContain('http_403: 1');
    expect(ai).not.toHaveBeenCalled();
  });

  it('descubre candidatos en un indice oficial solo una vez y solo con rutas permitidas', async () => {
    const index = { url: 'https://www.dogstrust.org.uk/dog-advice/training', species: 'dog' };
    const links = ['/dog-advice/training/basics', '/dog-advice/training/home', '/dog-advice/health/vaccines', '/dog-advice/getting-dog/breeds/beagle', 'https://evil.example/x'];
    const body = `<main><h1>Training</h1>${links.map((href) => `<a href="${href}">${href.split('/').pop()}</a>`).join('')}</main>`;
    const db = createDb();
    const fetcher = routes({ [index.url]: html(body) });
    const first = await discoverFromIndex(db, getSourceById('dogs-trust'), index, { fetcher });
    expect(first).toMatchObject({ claimed: true, found: 2 });
    expect([...db.candidates.values()].map((row) => new URL(row.url).pathname).sort()).toEqual(['/dog-advice/training/basics', '/dog-advice/training/home']);
    expect(await discoverFromIndex(db, getSourceById('dogs-trust'), index, { fetcher })).toMatchObject({ claimed: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('un indice que falla se registra y no rompe la busqueda', async () => {
    const index = { url: 'https://www.dogstrust.org.uk/dog-advice/training', species: 'dog' };
    const db = createDb();
    expect(await discoverFromIndex(db, getSourceById('dogs-trust'), index, { fetcher: routes({ [index.url]: failWith(403) }) })).toMatchObject({ claimed: true, found: 0, error: 'http_403' });
    expect([...db.discoveries.values()]).toEqual(['http_403']);
  });
});

describe('politica veterinaria como bloqueo efectivo', () => {
  it('descarta antes de descargar un tema clinico por titulo o por ruta', async () => {
    const db = createDb({ candidates: [dog('/dog-advice/training/puppy-vaccination-schedule', 'Vaccination schedule'), dog('/dog-advice/training/flea-treatment', 'Flea treatment')] });
    const fetcher = routes({});
    const result = await runSelectionPulse(db, await db.startRun(), {}, { fetcher, requestJson: makeAi(), limits: { poolMin: 0 } });
    expect(result.status).toBe('exhausted');
    expect(fetcher).not.toHaveBeenCalled();
    expect(db.attempts.every((item) => item.reason_code === 'vet_validation' || item.reason_code === 'path_not_allowed')).toBe(true);
    expect([...db.candidates.values()].every((row) => row.permanent)).toBe(true);
  });
  it('descarta una pagina con apartados clinicos aunque el titulo parezca inocuo', async () => {
    const db = createDb({ candidates: [dog('/dog-advice/training/basics', 'Basics')] });
    const fetcher = routes({ [BASICS]: html(page('Basics', { headings: ['Getting started', 'Symptoms to watch for'] })) });
    await runSelectionPulse(db, await db.startRun(), {}, { fetcher, requestJson: makeAi(), limits: { poolMin: 0 } });
    expect(db.attempts[0]).toMatchObject({ outcome: 'policy_rejected', reason_code: 'vet_validation', verification_counted: true });
  });
  it('descarta una pagina con alta densidad clinica en el texto', async () => {
    const clinical = 'Ask your vet about the diagnosis and the treatment plan for the disease. '.repeat(20);
    const db = createDb({ candidates: [dog('/dog-advice/training/basics', 'Basics')] });
    await runSelectionPulse(db, await db.startRun(), {}, { fetcher: routes({ [BASICS]: html(page('Basics', { text: GOOD_TEXT + clinical })) }), requestJson: makeAi(), limits: { poolMin: 0 } });
    expect(db.attempts[0].reason_code).toBe('vet_validation');
  });
  it('la revision semantica descarta lo que requiere validacion veterinaria y ante la duda tambien', async () => {
    for (const verdict of [{ ...OK_VERDICT, requires_veterinary_validation: true }, { ...OK_VERDICT, confidence: 0.5 }, { ...OK_VERDICT, category: 'salud' }, { requires_veterinary_validation: false }, {}]) {
      const db = createDb({ candidates: [dog('/dog-advice/training/basics', 'Basics')] });
      const result = await runSelectionPulse(db, await db.startRun(), {}, { fetcher: routes({ [BASICS]: html(page('Basics')) }), requestJson: makeAi(verdict), limits: { poolMin: 0 } });
      expect(result.status).toBe('exhausted');
      expect(db.attempts[0]).toMatchObject({ outcome: 'policy_rejected', reason_code: 'semantic_rejected' });
      expect([...db.candidates.values()][0].permanent).toBe(true);
    }
  });
  it('si el clasificador no responde no selecciona nada (falla cerrado) y el candidato se reintenta en 1 hora', async () => {
    const db = createDb({ candidates: [dog('/dog-advice/training/basics', 'Basics')] });
    const result = await runSelectionPulse(db, await db.startRun(), {}, { fetcher: routes({ [BASICS]: html(page('Basics')) }), requestJson: vi.fn(async () => { throw new Error('Proveedor HTTP 500'); }), limits: { poolMin: 0 } });
    expect(result.status).not.toBe('selected');
    const row = [...db.candidates.values()][0];
    expect(row).toMatchObject({ permanent: false, status: 'discovered' });
    expect(row.next_retry_at).toBe(Date.now() + HOUR);
  });
  it('un articulo que introduce contenido clinico durante la redaccion se bloquea y se busca otra alternativa', async () => {
    const db = createDb({ candidates: [dog('/dog-advice/training/basics', 'Basics')] });
    const selected = [...db.candidates.values()][0];
    const search = { started_at: new Date().toISOString(), pulses: 1, verifications: 1, semantic_checks: 1, drafts: 0, by_species: {}, by_domain: {}, discarded: [] };
    const selection = { candidate_id: selected.id, topic_id: 'dog-dogs-trust-1', title: 'Basics', candidate_title: 'Basics', url: BASICS, source_id: 'dogs-trust', species: 'dog', category: 'conducta',
      source: { id: 'dogs-trust', url: BASICS, title: 'Basics', organization: 'Dogs Trust', consulted_at: new Date().toISOString(), text: GOOD_TEXT, http_status: 200 } };
    db.seedRun({ payload: { phase: 'draft', search, selection } });
    selected.status = 'selected';
    selected.last_run_id = 'run-1';
    const clinicalDraft = async () => ({ title: 'Cómo organizar el juego con tu perro', content: `${HOLIDAY_CONTENT}\n\nAdministrá 5 mg de medicación cada ocho horas.`, topic: 'dog-dogs-trust-1', editorial_brief: HOLIDAY_BRIEF, quality: { ready: true, failed: [] } });
    const result = await runEditorialGeneration(db, { drafter: clinicalDraft, requestJson: makeAi() });
    expect(result).toMatchObject({ stage: 'text', phase: 'select', rejected: 'content_rejected' });
    expect(db.attempts.at(-1)).toMatchObject({ outcome: 'content_rejected', reason_code: 'content_rejected' });
    expect(selected).toMatchObject({ permanent: true, status: 'rejected' });
    expect(db.posts).toHaveLength(0);
    expect(db.runs.get('run-1').payload.phase).toBe('select');
    expect(db.calls).not.toContain('finish_blog_generation');
  });
  it('tras la segunda redaccion rechazada la corrida se retiene sin crear ningun post', async () => {
    const db = createDb({ candidates: [dog('/dog-advice/training/basics', 'Basics')] });
    const selected = [...db.candidates.values()][0];
    const search = { started_at: new Date().toISOString(), pulses: 3, verifications: 2, semantic_checks: 2, drafts: 1, by_species: {}, by_domain: {}, discarded: [] };
    const selection = { candidate_id: selected.id, topic_id: 'dog-dogs-trust-1', title: 'Basics', candidate_title: 'Basics', url: BASICS, source_id: 'dogs-trust', species: 'dog', category: 'conducta',
      source: { id: 'dogs-trust', url: BASICS, title: 'Basics', organization: 'Dogs Trust', consulted_at: new Date().toISOString(), text: GOOD_TEXT, http_status: 200 } };
    db.seedRun({ payload: { phase: 'draft', search, selection }, budget: { pulse: 3, verification: 2, candidate_semantic: 2, draft: 1 } });
    const result = await runEditorialGeneration(db, { requestJson: makeAi(), drafter: async () => ({ title: 'Qué hacer si una mascota se atraganta', content: 'Esta información no reemplaza la consulta veterinaria.', topic: 'dog-dogs-trust-1', quality: { ready: true, failed: [] } }) });
    expect(result).toMatchObject({ stage: 'retained' });
    expect(db.runs.get('run-1').stage).toBe('retained');
    expect(db.posts).toHaveLength(0);
  });
  it('una cita que no coincide con la fuente impide que el articulo supere el control de fuentes', () => {
    const source = { id: 'dogs-trust', url: BASICS, title: 'Basics', consulted_at: 'x', text_sha256: 'h', text: GOOD_TEXT };
    const article = { title: 'Como organizar el juego cotidiano con tu perro', content: HOLIDAY_CONTENT, evidence: [{ claim: 'Una afirmacion', source_id: 'dogs-trust', quote: 'Una cita inventada que no figura en ninguna fuente real consultada.' }] };
    expect(validateEditorialArticle(article, [source]).criteria.sources).toBe(false);
  });
});

describe('limites, persistencia y reanudacion', () => {
  it('el avance se persiste y el siguiente pulso no repite verificaciones ya hechas', async () => {
    const items = [dog('/dog-advice/training/a1', 'Playtime a1'), dog('/dog-advice/training/a2', 'Playtime a2'), dog('/adviceandwelfare/pets/dogs/c1', 'Playtime c1', 'rspca'),
      dog('/pet-care/dog-care/d1', 'Playtime d1', 'aspca'), dog('/pet-advice/dog-advice/b1', 'Playtime b1', 'battersea')];
    const db = createDb({ candidates: items });
    const map = {}; items.forEach((item) => { map[item.url] = item.url.endsWith('/b1') ? html(page('Playtime b1')) : failWith(403); });
    const fetcher = routes(map);
    const selector = (admin, run, payload, deps) => runSelectionPulse(admin, run, payload, { ...deps, limits: { poolMin: 0 } });
    const options = { fetcher, selector };
    const first = await runEditorialGeneration(db, { ...options, requestJson: makeAi() });
    expect(first).toMatchObject({ stage: 'text', phase: 'select' });
    expect(fetcher).toHaveBeenCalledTimes(3);
    const saved = db.runs.get('run-1');
    expect(saved.payload.search).toMatchObject({ pulses: 1, verifications: 3 });
    vi.setSystemTime(Date.now() + MINUTE);
    const second = await runEditorialGeneration(db, { ...options, requestJson: makeAi() });
    expect(second).toMatchObject({ stage: 'text', phase: 'draft' });
    const calls = fetcher.mock.calls.map(([url]) => url);
    expect(new Set(calls).size).toBe(calls.length);
    expect(calls).toHaveLength(5);
  });

  it('nunca supera 3 verificaciones por pulso, 12 por corrida ni 8 pulsos, y termina retenida', async () => {
    const hosts = [['dogs-trust', '/dog-advice/training/', 'dog'], ['battersea', '/pet-advice/dog-advice/', 'dog'], ['rspca', '/adviceandwelfare/pets/dogs/', 'dog'], ['aspca', '/pet-care/dog-care/', 'dog'],
      ['cats-protection', '/help-and-advice/cat-behaviour/', 'cat'], ['battersea', '/pet-advice/cat-advice/', 'cat'], ['rspca', '/adviceandwelfare/pets/cats/', 'cat'], ['aspca', '/pet-care/cat-care/', 'cat']];
    const candidates = hosts.flatMap(([source, prefix, species], hostIndex) => Array.from({ length: 5 }, (_, index) => ({ source_id: source, url: `https://${getSourceById(source).hosts[0]}${prefix}ideas-${hostIndex}-${index}`,
      title: `Playtime ideas ${hostIndex} ${index}`, species })));
    const db = createDb({ candidates });
    const fetcher = vi.fn(async () => html('', 403));
    const perPulse = [];
    let result;
    for (let pulse = 0; pulse < 14 && result?.stage !== 'retained'; pulse += 1) {
      const before = fetcher.mock.calls.length;
      result = await runEditorialGeneration(db, { fetcher, requestJson: makeAi(), selector: (admin, run, payload, deps) => runSelectionPulse(admin, run, payload, { ...deps, limits: { poolMin: 0 } }) });
      perPulse.push(fetcher.mock.calls.length - before);
      vi.setSystemTime(Date.now() + MINUTE);
    }
    expect(result.stage).toBe('retained');
    expect(Math.max(...perPulse)).toBeLessThanOrEqual(SEARCH_LIMITS.verificationsPerPulse);
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(SEARCH_LIMITS.verificationsPerRun);
    expect(db.attempts.filter((item) => item.verification_counted)).toHaveLength(fetcher.mock.calls.length);
    expect(perPulse.filter((count) => count > 0).length).toBeLessThanOrEqual(SEARCH_LIMITS.pulsesPerRun);
    expect(db.posts).toHaveLength(0);
  });

  it('con candidatos agotados retiene la corrida, no crea posts y respeta el intervalo de 36 horas', async () => {
    const db = createDb({ candidates: [dog('/dog-advice/training/basics', 'Basics')] });
    db.lastSuccess = Date.now() - 40 * HOUR;
    const result = await runEditorialGeneration(db, { fetcher: routes({ [BASICS]: failWith(403) }), requestJson: makeAi(), selector: (admin, run, payload, deps) => runSelectionPulse(admin, run, payload, { ...deps, limits: { poolMin: 0 } }) });
    expect(result).toMatchObject({ stage: 'retained', searchExhausted: true });
    expect(db.calls).toContain('retain_blog_generation_search_exhausted');
    expect(db.posts).toHaveLength(0);
    expect(db.nextEligible).toBeGreaterThan(Date.now() + 5 * HOUR);
    expect(db.nextEligible).toBeLessThanOrEqual(Date.now() + 6 * HOUR);
    const next = await runEditorialGeneration(db, { fetcher: routes({}), requestJson: makeAi() });
    expect(next).toMatchObject({ skipped: true });
  });

  it('dos ejecuciones concurrentes no generan trabajo duplicado: solo una obtiene la reserva', async () => {
    const db = createDb({ candidates: [dog('/dog-advice/training/basics', 'Basics')] });
    const fetcher = routes({ [BASICS]: html(page('Basics')) });
    const options = { fetcher, requestJson: makeAi(), selector: (admin, run, payload, deps) => runSelectionPulse(admin, run, payload, { ...deps, limits: { poolMin: 0 } }) };
    const results = await Promise.all([runEditorialGeneration(db, options), runEditorialGeneration(db, options)]);
    expect(results.filter((item) => item.skipped)).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(db.runs.size).toBe(1);
  });

  it('un trabajador con la reserva vencida no puede registrar intentos ni guardar el avance', async () => {
    const db = createDb({ candidates: [dog('/dog-advice/training/basics', 'Basics')] });
    const run = await db.startRun();
    vi.setSystemTime(Date.now() + 6 * MINUTE);
    await expect(runSelectionPulse(db, run, {}, { fetcher: routes({ [BASICS]: failWith(403) }), requestJson: makeAi(), limits: { poolMin: 0 } })).rejects.toThrow(/vencida/);
  });
});

describe('ciclo completo hasta el borrador', () => {
  const fullArticle = (selection) => ({ title: 'Cómo preparar el cuidado de tu perro durante las vacaciones', content: HOLIDAY_CONTENT, editorial_brief: HOLIDAY_BRIEF, visual_plan: structuredClone(HOLIDAY_VISUAL_PLAN),
    slug: 'como-preparar-el-cuidado-de-tu-perro-durante-las-vacaciones', topic: selection.topic_id, species: selection.species, category: 'organizacion',
    sources: [{ ...selection.source }], quality: { ready: true, failed: [] }, editorial_version: 'editorial-v2' });

  it('busca, redacta, revisa, genera portada e infografia y guarda solo un borrador', async () => {
    const db = createDb({ posts: [{ title: 'Algo de gatos', topic: 'cat-battersea-1', content: 'x' }], candidates: [dog('/dog-advice/training/basics', 'Basics')] });
    const generateCover = vi.fn(png);
    const reviewText = vi.fn(async (article) => article);
    const stages = [];
    let result;
    for (let step = 0; step < 12 && result?.stage !== 'complete'; step += 1) {
      result = await runEditorialGeneration(db, { fetcher: routes({ [BASICS]: html(page('Basics')) }), requestJson: makeAi(), generateCover, reviewText,
        drafter: async (admin, selection) => fullArticle(selection),
        selector: (admin, run, payload, deps) => runSelectionPulse(admin, run, payload, { ...deps, limits: { poolMin: 0 } }) });
      stages.push(`${result.stage}${result.phase ? `:${result.phase}` : ''}`);
      vi.setSystemTime(Date.now() + MINUTE);
    }
    expect(stages[0]).toBe('text:draft');
    expect(stages.at(-1)).toBe('complete');
    expect(stages).toEqual(expect.arrayContaining(['cover', 'infographic', 'finalize']));
    expect(generateCover).toHaveBeenCalledTimes(1);
    expect([...db.assets.keys()].some((path) => path.endsWith('/cover.png'))).toBe(true);
    expect([...db.assets.keys()].some((path) => /infographic-/.test(path))).toBe(true);
    expect(db.posts).toHaveLength(2);
    expect(db.posts.at(-1)).toMatchObject({ status: 'draft', species: 'dog', invalidated: false });
    expect([...db.candidates.values()][0]).toMatchObject({ status: 'used', permanent: true });
    expect(db.nextEligible - db.lastSuccess).toBe(36 * HOUR);
  });

  it('nunca publica ni escribe posts directamente: el unico camino es la RPC que crea un draft', async () => {
    const db = createDb({ candidates: [dog('/dog-advice/training/basics', 'Basics')] });
    for (let step = 0; step < 12; step += 1) {
      const result = await runEditorialGeneration(db, { fetcher: routes({ [BASICS]: html(page('Basics')) }), requestJson: makeAi(), generateCover: png, reviewText: async (article) => article,
        drafter: async (admin, selection) => fullArticle(selection), selector: (admin, run, payload, deps) => runSelectionPulse(admin, run, payload, { ...deps, limits: { poolMin: 0 } }) });
      vi.setSystemTime(Date.now() + MINUTE);
      if (result.stage === 'complete') break;
    }
    expect(db.writes).toEqual([]);
    expect(db.posts.every((post) => post.status === 'draft')).toBe(true);
    const sources = ['_blog-editorial-pipeline.js', '_blog-candidates.js', '_blog-source-verifier.js', '_blog-sources.js'].map((file) => fs.readFileSync(new URL(`../api/cron/${file}`, import.meta.url), 'utf8')).join('\n');
    expect(sources).not.toMatch(/['"]published['"]/);
    expect(sources).not.toMatch(/\.from\('blog_posts'\)\s*\.(?:insert|update|upsert|delete)/);
  });

  it('el borrador usa el selector real: draftSelectedArticle genera desde la fuente verificada y deja la especie', async () => {
    const source = { id: 'dogs-trust', url: BASICS, title: 'Basics', organization: 'Dogs Trust', consulted_at: new Date().toISOString(), text_sha256: 'h', http_status: 200, text: GOOD_TEXT };
    const requestJson = vi.fn(async () => ({ title: 'Cómo organizar el juego diario con tu perro en casa', meta_description: 'Organiza el juego cotidiano con tu perro mediante rutinas cortas, juguetes rotativos y momentos tranquilos para el descanso.',
      sections: [{ heading: '', paragraphs: [{ text: 'El juego diario ayuda a organizar la rutina.', source_quote_index: 0 }] }, { heading: 'Para cerrar', paragraphs: [{ text: 'Una rutina clara ayuda a todos.' }] }],
      category: 'juego', tags: ['perros', 'juego'], cover_alt: 'Un perro juega en el living con su tutor.', editorial_brief: { reader_need: 'Organizar el juego', takeaway: 'Rutinas cortas', essential_sections: [{ key: 'juego', terms: ['juego'] }] }, visual_plan: {} }));
    const db = createDb();
    const article = await draftSelectedArticle(db, { topic_id: 'dog-dogs-trust-abc', title: 'Basics', url: BASICS, species: 'dog', source }, requestJson);
    expect(article).toMatchObject({ topic: 'dog-dogs-trust-abc', species: 'dog', source_name: 'Dogs Trust' });
    expect(requestJson.mock.calls[0][0]).toContain('Especie: perros');
    expect(requestJson.mock.calls[0][0]).toContain('hechos de Dogs Trust');
    expect(requestJson.mock.calls[0][0]).not.toMatch(/Cats Protection/);
  });
  const runDraftCycle = async (db, quality) => {
    let result;
    for (let step = 0; step < 12 && result?.stage !== 'complete'; step += 1) {
      result = await runEditorialGeneration(db, { fetcher: routes({ [BASICS]: html(page('Basics')) }), requestJson: makeAi(), generateCover: png, reviewText: async (article) => article,
        drafter: async (admin, selection) => ({ ...fullArticle(selection), quality }),
        selector: (admin, run, payload, deps) => runSelectionPulse(admin, run, payload, { ...deps, limits: { poolMin: 0 } }) });
      vi.setSystemTime(Date.now() + MINUTE);
    }
    return result;
  };

  it('un borrador con fallos blandos de calidad (editorial, seo) llega como borrador con advertencias para el administrador', async () => {
    const db = createDb({ candidates: [dog('/dog-advice/training/basics', 'Basics')] });
    expect(await runDraftCycle(db, { ready: false, failed: ['editorial', 'seo'] })).toMatchObject({ stage: 'complete' });
    expect(db.posts).toHaveLength(1);
    expect(db.posts[0]).toMatchObject({ status: 'draft', quality: { ready: true, humanDecisionRequired: true, review_warnings: ['editorial', 'seo'] }, invalidated: false });
  });

  it.each([['infografia'], ['duplication'], ['brand'], ['editorial_policy'], ['safety']])('un fallo duro de calidad (%s) en la redaccion sigue descartando el borrador', async (name) => {
    const db = createDb({ candidates: [dog('/dog-advice/training/basics', 'Basics')] });
    await runDraftCycle(db, { ready: false, failed: ['editorial', name] });
    expect(db.posts).toHaveLength(0);
    expect(db.attempts.some((attempt) => attempt.reason_code === 'quality_failed' || attempt.reason_code === 'content_rejected')).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Revision semantica del articulo completo: bloquea ANTES de portada, infografia y borrador.
// Estas pruebas usan un clasificador simulado: demuestran como reacciona el pipeline ante cada respuesta, no la precision de un modelo real.
// ---------------------------------------------------------------------------------------------------------------------------------
function articleRun(db, { budget = {}, article = {} } = {}) {
  const candidate = db.addCandidate(dog('/dog-advice/training/basics', 'Basics'));
  candidate.status = 'selected';
  const source = { id: 'dogs-trust', url: BASICS, title: 'Basics', organization: 'Dogs Trust', consulted_at: new Date().toISOString(), text: GOOD_TEXT, text_sha256: 'h', http_status: 200 };
  const payload = { title: 'Cómo preparar el cuidado de tu perro durante las vacaciones', content: HOLIDAY_CONTENT, editorial_brief: HOLIDAY_BRIEF, visual_plan: structuredClone(HOLIDAY_VISUAL_PLAN),
    slug: 'como-preparar-el-cuidado-de-tu-perro-durante-las-vacaciones', topic: 'dog-dogs-trust-1', species: 'dog', category: 'organizacion', meta_description: 'Organizá el cuidado cotidiano de tu perro durante las vacaciones con rutinas claras y recursos compartidos.',
    sources: [source], quality: { ready: true, failed: [] }, editorial_version: 'editorial-v2', factual_review_done: true,
    search: { started_at: new Date().toISOString(), pulses: 1, verifications: 1, semantic_checks: 1, drafts: 1, by_species: {}, by_domain: {}, discarded: [] },
    selection_summary: { candidate_id: candidate.id, topic_id: 'dog-dogs-trust-1', title: 'Basics', candidate_title: 'Basics', url: BASICS, source_id: 'dogs-trust', species: 'dog', category: 'conducta' }, ...article };
  const run = db.seedRun({ stage: 'text', payload, budget: { pulse: 1, verification: 1, candidate_semantic: 1, draft: 1, ...budget } });
  candidate.last_run_id = run.id;
  return { run, candidate, payload };
}
const pipelineOptions = (extra = {}) => ({ requestJson: makeAi(), generateCover: vi.fn(png), reviewText: vi.fn(async (article) => article), ...extra });
const VERDICT_FAILS = {
  'requiere validacion veterinaria': { ...OK_ARTICLE_VERDICT, requires_veterinary_validation: true },
  'contiene consejo clinico': { ...OK_ARTICLE_VERDICT, contains_clinical_advice: true },
  'no es cuidado cotidiano': { ...OK_ARTICLE_VERDICT, everyday_non_clinical: false },
  'confianza insuficiente (0,79)': { ...OK_ARTICLE_VERDICT, confidence: 0.79 },
  'confianza como texto': { ...OK_ARTICLE_VERDICT, confidence: '0.95' },
  'confianza fuera de rango': { ...OK_ARTICLE_VERDICT, confidence: 1.2 },
  'observaciones pendientes': { ...OK_ARTICLE_VERDICT, issues: ['Recomienda un baño medicado sin respaldo.'] },
  'sin lista de observaciones': { requires_veterinary_validation: false, contains_clinical_advice: false, everyday_non_clinical: true, confidence: 0.95 },
  'booleanos como texto': { ...OK_ARTICLE_VERDICT, requires_veterinary_validation: 'false', contains_clinical_advice: 'false' },
  'respuesta vacia': {},
  'respuesta nula': null,
};

describe('revision semantica del articulo completo antes de crear el borrador', () => {
  it('aprueba solo con tipos estrictos, confianza >= 0,8 y sin observaciones, y la ata al texto exacto', async () => {
    expect(interpretArticleVerdict(OK_ARTICLE_VERDICT).approved).toBe(true);
    expect(interpretArticleVerdict({ ...OK_ARTICLE_VERDICT, confidence: 0.8 }).approved).toBe(true);
    for (const verdict of Object.values(VERDICT_FAILS)) expect(interpretArticleVerdict(verdict).approved).toBe(false);
    const article = articleRun(createDb()).payload;
    const review = await reviewArticleSemantically(article, async () => OK_ARTICLE_VERDICT);
    expect(vetReviewIsValid({ ...article, vet_review: review })).toBe(true);
    expect(vetReviewIsValid({ ...article, vet_review: { ...review, approved: false } })).toBe(false);
    for (const changed of [{ content: `${article.content} Una frase nueva.` }, { title: `${article.title} y mas` }, { meta_description: 'Otra descripcion distinta de la revisada.' },
      { visual_plan: { ...article.visual_plan, title: 'Otro titulo grafico' } }]) {
      expect(vetReviewIsValid({ ...article, ...changed, vet_review: review })).toBe(false);
    }
  });

  it('el prompt incluye el articulo completo y el plan grafico, y aclara que un descargo no alcanza', async () => {
    const article = articleRun(createDb()).payload;
    const prompt = buildVetReviewPrompt(article);
    expect(prompt).toContain(article.title);
    expect(prompt).toContain(article.visual_plan.sections[0].heading);
    expect(prompt).toContain('Evalua el articulo COMPLETO');
    expect(prompt).toMatch(/NO vuelve aceptable/);
    expect(prompt).toMatch(/Ante la duda, marca true/);
  });

  it('un articulo aprobado avanza a la portada y recien despues se genera', async () => {
    const db = createDb();
    const { run } = articleRun(db);
    const options = pipelineOptions();
    const first = await runEditorialGeneration(db, options);
    expect(first).toMatchObject({ stage: 'cover' });
    expect(options.generateCover).not.toHaveBeenCalled();
    expect(vetReviewIsValid(db.runs.get(run.id).payload)).toBe(true);
    expect(db.runs.get(run.id).budget.article_semantic).toBe(1);
    expect(options.requestJson).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + MINUTE);
    await runEditorialGeneration(db, options);
    expect(options.generateCover).toHaveBeenCalledTimes(1);
    expect(options.requestJson.mock.invocationCallOrder[0]).toBeLessThan(options.generateCover.mock.invocationCallOrder[0]);
  });

  it.each(Object.entries(VERDICT_FAILS))('descarta el articulo ante: %s (nunca llega a portada ni a borrador)', async (_name, verdict) => {
    const db = createDb();
    const { run, candidate } = articleRun(db);
    const options = pipelineOptions({ requestJson: makeAi(OK_VERDICT, verdict) });
    const result = await runEditorialGeneration(db, options);
    expect(result).toMatchObject({ stage: 'text', phase: 'select', rejected: 'article_semantic_rejected' });
    expect(options.generateCover).not.toHaveBeenCalled();
    expect(db.calls).not.toContain('finish_blog_generation');
    expect(db.posts).toHaveLength(0);
    expect(db.runs.get(run.id).payload.phase).toBe('select');
    expect(db.runs.get(run.id).payload.content).toBeUndefined();
    expect(db.attempts.at(-1)).toMatchObject({ outcome: 'content_rejected', reason_code: 'article_semantic_rejected', cooldown_hours: null });
    expect(candidate).toMatchObject({ status: 'rejected', permanent: true });
  });

  it('falla cerrado ante errores del proveedor: se descarta el articulo y el candidato reintenta en 24 h (no es permanente)', async () => {
    for (const requestJson of [vi.fn(async () => { throw new Error('Proveedor HTTP 500'); }), vi.fn(async () => { throw new SyntaxError('JSON invalido'); }),
      vi.fn(async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); })]) {
      const db = createDb();
      const { candidate } = articleRun(db);
      const options = pipelineOptions({ requestJson });
      const result = await runEditorialGeneration(db, options);
      expect(result).toMatchObject({ stage: 'text', phase: 'select', rejected: 'article_review_unavailable' });
      expect(options.generateCover).not.toHaveBeenCalled();
      expect(db.posts).toHaveLength(0);
      expect(candidate).toMatchObject({ status: 'rejected', permanent: false });
      expect(candidate.next_retry_at).toBe(Date.now() + 24 * HOUR);
    }
  });

  it('un consejo clinico sin palabras clave igual se bloquea: la revision por palabras clave solo no alcanza', async () => {
    const subtle = `${HOLIDAY_CONTENT}\n\nSi tu perro se rasca mucho y pierde pelo, probá con un baño de avena y avisame si mejora.`;
    const { evaluateEditorialContent } = await import('../api/cron/_editorial-policy.js');
    const { classifyEditorialSafety } = await import('../api/cron/_blog-editorial-pipeline.js');
    expect(evaluateEditorialContent({ title: 'Cómo preparar el cuidado de tu perro', topic: 'dog-x', content: subtle }).status).toBe('allowed');
    expect(classifyEditorialSafety(subtle).veterinaryReviewRequired).toBe(false);
    const db = createDb();
    articleRun(db, { article: { content: subtle } });
    const requestJson = makeAi(OK_VERDICT, (prompt) => (String(prompt).includes('pierde pelo')
      ? { ...OK_ARTICLE_VERDICT, requires_veterinary_validation: true, contains_clinical_advice: true, issues: ['Sugiere un tratamiento casero para un problema de piel.'] }
      : OK_ARTICLE_VERDICT));
    const options = pipelineOptions({ requestJson });
    expect(await runEditorialGeneration(db, options)).toMatchObject({ rejected: 'article_semantic_rejected' });
    expect(options.generateCover).not.toHaveBeenCalled();
    expect(db.posts).toHaveLength(0);
    expect(db.attempts.at(-1).detail).toContain('tratamiento casero');
  });

  it('un rechazo factual (blando) no descarta el borrador: pasa a revision humana con los motivos y la fuente no queda castigada', async () => {
    const db = createDb();
    const { run, candidate } = articleRun(db, { article: { factual_review_done: false } });
    const issues = ['La cita no respalda la afirmacion.'];
    const reviewText = vi.fn(async (article) => ({ ...article, quality: { ...article.quality, ready: false, failed: ['semantic_review'], semanticReview: { approved: false, issues } } }));
    const options = pipelineOptions({ reviewText });
    expect(await runEditorialGeneration(db, options)).toMatchObject({ stage: 'text' });
    const saved = db.runs.get(run.id).payload;
    expect(saved).toMatchObject({ factual_review_done: true, quality: { ready: true, humanDecisionRequired: true, review_warnings: ['semantic_review'], semanticReview: { issues } } });
    expect(candidate.status).toBe('selected');
    expect(db.attempts.filter((attempt) => attempt.outcome === 'content_rejected')).toHaveLength(0);
    let result;
    for (let step = 0; step < 8 && result?.stage !== 'complete'; step += 1) {
      result = await runEditorialGeneration(db, options);
      vi.setSystemTime(Date.now() + MINUTE);
    }
    expect(result).toMatchObject({ stage: 'complete' });
    expect(db.posts).toHaveLength(1);
    expect(db.posts[0]).toMatchObject({ status: 'draft', quality: { ready: true, humanDecisionRequired: true, review_warnings: ['semantic_review'] }, invalidated: false });
  });

  it.each([['politica editorial', ['editorial_policy']], ['duplicado', ['duplication']], ['seguridad', ['safety']]])(
    'un rechazo factual con fallo duro (%s) sigue descartando el borrador y la fuente queda 48 h en espera (no 30 dias)', async (_name, failed) => {
      const db = createDb();
      const { run, candidate } = articleRun(db, { article: { factual_review_done: false } });
      const options = pipelineOptions({ reviewText: vi.fn(async (article) => ({ ...article, quality: { ...article.quality, ready: false, failed, semanticReview: { approved: false, issues: ['x'] } } })) });
      const result = await runEditorialGeneration(db, options);
      expect(result).toMatchObject({ stage: 'text', phase: 'select', rejected: failed[0] === 'editorial_policy' ? 'content_rejected' : 'quality_failed' });
      expect(db.runs.get(run.id).payload.phase).toBe('select');
      expect(candidate).toMatchObject({ status: 'rejected' });
      expect(options.generateCover).not.toHaveBeenCalled();
      expect(db.posts).toHaveLength(0);
    });

  it('la revision veterinaria del articulo sigue bloqueando un borrador con advertencias blandas', async () => {
    const db = createDb();
    articleRun(db, { article: { quality: { ready: true, failed: ['editorial'], review_warnings: ['editorial'], humanDecisionRequired: true } } });
    const options = pipelineOptions({ requestJson: makeAi(OK_VERDICT, { ...OK_ARTICLE_VERDICT, requires_veterinary_validation: true }) });
    expect(await runEditorialGeneration(db, options)).toMatchObject({ rejected: 'article_semantic_rejected' });
    expect(options.generateCover).not.toHaveBeenCalled();
    expect(db.posts).toHaveLength(0);
  });



  it('si ya se agoto el presupuesto de revisiones del articulo no se llama al modelo y se descarta', async () => {
    const db = createDb();
    articleRun(db, { budget: { article_semantic: 2 } });
    const options = pipelineOptions();
    expect(await runEditorialGeneration(db, options)).toMatchObject({ rejected: 'article_review_unavailable' });
    expect(options.requestJson).not.toHaveBeenCalled();
    expect(db.posts).toHaveLength(0);
  });

  it('la corrida retenida conserva el texto rechazado y el motivo para revision humana, sin crear post', async () => {
    const db = createDb();
    const { run } = articleRun(db, { budget: { draft: 2 } });
    const options = pipelineOptions({ requestJson: makeAi(OK_VERDICT, { ...OK_ARTICLE_VERDICT, requires_veterinary_validation: true, issues: ['Dosis sugerida'] }) });
    const result = await runEditorialGeneration(db, options);
    expect(result).toMatchObject({ stage: 'retained' });
    const saved = db.runs.get(run.id);
    expect(saved.stage).toBe('retained');
    expect(saved.payload.quality).toMatchObject({ ready: false, failed: expect.arrayContaining(['veterinary_semantic_review']) });
    expect(saved.payload.policy_rejection_reason).toContain('Dosis sugerida');
    expect(db.posts).toHaveLength(0);
  });

  it('finalize sin una aprobacion vigente vuelve a la revision y no crea el borrador', async () => {
    const db = createDb();
    const { run, payload } = articleRun(db, { article: { cover_url: 'https://example.test/c.png', infographic_url: 'https://example.test/i.png' } });
    const saved = db.runs.get(run.id);
    saved.payload = { ...payload, infographic_validation: { valid: true, content_hash: infographicContentHash(payload) }, validation_snapshot: validationSnapshotOf(payload) };
    saved.stage = 'finalize';
    const options = pipelineOptions();
    const result = await runEditorialGeneration(db, options);
    expect(result).toMatchObject({ stage: 'text', phase: 'article_review' });
    expect(db.calls).not.toContain('finish_blog_generation');
    expect(db.posts).toHaveLength(0);
    expect(saved.payload.vet_review).toBeUndefined();
  });

  it.each([
    ['el texto', { content: `${HOLIDAY_CONTENT}\n\nUn parrafo nuevo sobre como dejar las llaves a una persona de confianza.` }],
    ['el titulo', { title: 'Cómo preparar el cuidado de tu perro durante las vacaciones con tu familia' }],
    ['la meta descripcion', { meta_description: 'Una meta descripcion distinta de la que se reviso semanticamente para este articulo.' }],
  ])('modificar %s despues de aprobarse invalida la aprobacion: vuelve a la revision y no se crea el borrador', async (_name, change) => {
    const db = createDb();
    const { run, payload } = articleRun(db, { article: { cover_url: 'https://example.test/c.png', infographic_url: 'https://example.test/i.png' } });
    const review = await reviewArticleSemantically(payload, async () => OK_ARTICLE_VERDICT);
    expect(vetReviewIsValid({ ...payload, vet_review: review })).toBe(true);
    const tampered = { ...payload, vet_review: review, ...change };
    expect(vetReviewIsValid(tampered)).toBe(false);
    // Incluso con la infografia revalidada para el texto nuevo, la aprobacion veterinaria ya no corresponde a este texto.
    db.runs.get(run.id).payload = { ...tampered, infographic_validation: { valid: true, content_hash: infographicContentHash(tampered) }, validation_snapshot: validationSnapshotOf(tampered) };
    db.runs.get(run.id).stage = 'finalize';
    const result = await runEditorialGeneration(db, pipelineOptions());
    expect(result).toMatchObject({ stage: 'text', phase: 'article_review' });
    expect(db.calls).not.toContain('finish_blog_generation');
    expect(db.posts).toHaveLength(0);
  });

  it('un texto clinico agregado despues de la aprobacion lo retiene la politica antes incluso de revisar la aprobacion', async () => {
    const db = createDb();
    const { run, payload } = articleRun(db, { article: { cover_url: 'https://example.test/c.png', infographic_url: 'https://example.test/i.png' } });
    const review = await reviewArticleSemantically(payload, async () => OK_ARTICLE_VERDICT);
    const tampered = { ...payload, vet_review: review, content: `${payload.content}\n\nAplicá 5 ml de una loción cada ocho horas.` };
    db.runs.get(run.id).payload = { ...tampered, infographic_validation: { valid: true, content_hash: infographicContentHash(tampered) }, validation_snapshot: validationSnapshotOf(tampered) };
    db.runs.get(run.id).stage = 'finalize';
    expect(await runEditorialGeneration(db, pipelineOptions())).toMatchObject({ stage: 'retained' });
    expect(db.calls).not.toContain('finish_blog_generation');
    expect(db.posts).toHaveLength(0);
  });

  it('la base tambien rechaza crear un borrador sin aprobacion (replica del trigger de Supabase)', async () => {
    const db = createDb();
    const { run, payload } = articleRun(db, { article: { cover_url: 'https://example.test/c.png', infographic_url: 'https://example.test/i.png' } });
    const claimed = await db.startRun();
    const saved = db.runs.get(run.id);
    saved.stage = 'finalize';
    const refused = await db.rpc('finish_blog_generation', { p_id: run.id, p_token: claimed.lease_token });
    expect(refused.error.message).toMatch(/revision semantica veterinaria aprobada/);
    expect(db.posts).toHaveLength(0);
    saved.payload = { ...payload, vet_review: await reviewArticleSemantically(payload, async () => OK_ARTICLE_VERDICT) };
    expect((await db.rpc('finish_blog_generation', { p_id: run.id, p_token: claimed.lease_token })).data).toMatchObject({ status: 'draft' });
  });
});

describe('applyHumanDecisionPolicy', () => {
  const source = { id: 's', url: BASICS, text_sha256: 'h', consulted_at: '2026-01-01T00:00:00Z' };
  it('solo habilita fallos blandos y deja constancia de los motivos', () => {
    const article = { sources: [source], quality: { ready: false, failed: ['editorial', 'sources', 'semantic_review'] } };
    expect(applyHumanDecisionPolicy(article)).toEqual({ eligible: true, hard: [], soft: ['editorial', 'sources', 'semantic_review'] });
    expect(article.quality).toMatchObject({ ready: true, humanDecisionRequired: true, review_warnings: ['editorial', 'sources', 'semantic_review'] });
  });
  it('un borrador sin fallos no queda marcado para decision humana', () => {
    const article = { sources: [source], quality: { ready: true, failed: [] } };
    expect(applyHumanDecisionPolicy(article)).toMatchObject({ eligible: true, soft: [] });
    expect(article.quality.humanDecisionRequired).toBe(false);
  });
  it.each([
    ['un criterio duro', { sources: [source], quality: { ready: false, failed: ['seo', 'duplication'] } }, 'duplication'],
    ['requiere validacion veterinaria', { sources: [source], quality: { ready: false, failed: [], veterinaryReviewRequired: true } }, 'veterinary_review'],
    ['sin fuente verificada', { sources: [], quality: { ready: false, failed: ['seo'] } }, 'source_missing'],
    ['no ready sin motivo conocido', { sources: [source], quality: { ready: false, failed: [] } }, 'quality_unknown'],
    ['sin calidad', { sources: [source] }, 'veterinary_review'],
  ])('rechaza: %s', (_name, article, hard) => {
    const result = applyHumanDecisionPolicy(article);
    expect(result.eligible).toBe(false);
    expect(result.hard).toContain(hard);
    expect(article.quality?.ready).not.toBe(true);
  });
});

describe('limites duros en Supabase: reinicios, errores, reintentos y reanudaciones', () => {
  const candidateSpecs = [['dogs-trust', '/dog-advice/training/p1', 'dog'], ['dogs-trust', '/dog-advice/training/p2', 'dog'], ['battersea', '/pet-advice/dog-advice/p3', 'dog'],
    ['battersea', '/pet-advice/dog-advice/p4', 'dog'], ['rspca', '/adviceandwelfare/pets/dogs/p5', 'dog'], ['rspca', '/adviceandwelfare/pets/dogs/p6', 'dog'],
    ['cats-protection', '/help-and-advice/cat-behaviour/p7', 'cat'], ['cats-protection', '/help-and-advice/cat-behaviour/p8', 'cat']];
  const eightCandidates = () => candidateSpecs.map(([source, path, species], index) => ({ source_id: source, url: `https://${getSourceById(source).hosts[0]}${path}`, title: `Idea${index + 1}`, species }));
  const pagesFor = (candidates) => routes(Object.fromEntries(candidates.map((item) => [item.url, html(page('Idea page'))])));
  const rejectingAi = () => makeAi({ ...OK_VERDICT, requires_veterinary_validation: true });
  const poolless = (admin, run, payload, deps) => runSelectionPulse(admin, run, payload, { ...deps, limits: { poolMin: 0 } });

  it('los topes de la base se reflejan en la aplicacion', () => {
    expect(BUDGET_KINDS).toEqual({ pulse: 'pulsesPerRun', verification: 'verificationsPerRun', candidate_semantic: 'semanticChecksPerRun', article_semantic: 'articleSemanticPerRun', draft: 'draftsPerRun' });
    expect(SEARCH_LIMITS).toMatchObject({ pulsesPerRun: 8, verificationsPerRun: 12, semanticChecksPerRun: 6, articleSemanticPerRun: 2, draftsPerRun: 2, verificationsPerPulse: 3 });
  });

  it('el presupuesto se agota en el maximo de la base aunque la aplicacion pida mas, y sobrevive a un reinicio de la corrida', async () => {
    const db = createDb();
    let run = await db.startRun();
    const greedy = { ...SEARCH_LIMITS, pulsesPerRun: 500, semanticChecksPerRun: 500 };
    for (let i = 1; i <= 8; i += 1) expect(await reserveBudget(db, run, 'pulse', greedy)).toMatchObject({ allowed: true, used: i, cap: 8 });
    expect(await reserveBudget(db, run, 'pulse', greedy)).toMatchObject({ allowed: false, used: 8, cap: 8 });
    for (let i = 1; i <= 6; i += 1) expect((await reserveBudget(db, run, 'candidate_semantic', greedy)).allowed).toBe(true);
    expect(await reserveBudget(db, run, 'candidate_semantic', greedy)).toMatchObject({ allowed: false, cap: 6 });
    // Reinicio: la reserva vence y otro trabajador retoma la corrida con un token nuevo.
    vi.setSystemTime(Date.now() + 6 * MINUTE);
    const resumed = await db.startRun();
    expect(resumed.id).toBe(run.id);
    expect(resumed.lease_token).not.toBe(run.lease_token);
    expect(await reserveBudget(db, resumed, 'pulse', greedy)).toMatchObject({ allowed: false, used: 8 });
    expect(await reserveBudget(db, resumed, 'candidate_semantic', greedy)).toMatchObject({ allowed: false, used: 6 });
    // El trabajador anterior ya no puede reservar nada.
    await expect(reserveBudget(db, run, 'draft')).rejects.toThrow(/vencida/);
    await expect(reserveBudget(db, resumed, 'otra-cosa')).rejects.toThrow(/invalido/);
    run = resumed;
    expect(db.runs.get(run.id).budget).toEqual({ pulse: 8, candidate_semantic: 6 });
  });

  it('con 8 pulsos ya consumidos en la base la busqueda termina aunque el payload este vacio o desactualizado', async () => {
    const db = createDb({ candidates: [dog('/dog-advice/training/basics', 'Basics')] });
    db.seedRun({ budget: { pulse: 8 } });
    const run = await db.startRun();
    const fetcher = routes({ [BASICS]: html(page('Basics')) });
    const ai = makeAi();
    const result = await runSelectionPulse(db, run, { search: { pulses: 0, verifications: 0, semantic_checks: 0 } }, { fetcher, requestJson: ai, limits: { poolMin: 0 } });
    expect(result.status).toBe('exhausted');
    expect(fetcher).not.toHaveBeenCalled();
    expect(ai).not.toHaveBeenCalled();
    expect(db.calls).not.toContain('list_blog_topic_candidates');
    expect(db.runs.get(run.id).budget.pulse).toBe(8);
  });

  it('con 12 verificaciones ya consumidas en la base no se descarga ninguna fuente mas', async () => {
    const db = createDb({ candidates: [dog('/dog-advice/training/basics', 'Basics')] });
    db.seedRun({ budget: { pulse: 1, verification: 12 } });
    const run = await db.startRun();
    const fetcher = routes({ [BASICS]: html(page('Basics')) });
    expect((await runSelectionPulse(db, run, {}, { fetcher, requestJson: makeAi(), limits: { poolMin: 0 } })).status).toBe('exhausted');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('maximo 6 revisiones semanticas por corrida: la septima fuente ni siquiera se descarga', async () => {
    const candidates = eightCandidates();
    const db = createDb({ candidates });
    const fetcher = pagesFor(candidates);
    const ai = rejectingAi();
    let result;
    for (let pulse = 0; pulse < 10 && result?.stage !== 'retained'; pulse += 1) {
      result = await runEditorialGeneration(db, { fetcher, requestJson: ai, selector: poolless });
      vi.setSystemTime(Date.now() + MINUTE);
    }
    expect(result).toMatchObject({ stage: 'retained', searchExhausted: true });
    expect(ai).toHaveBeenCalledTimes(6);
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(db.runs.get('run-1').budget).toMatchObject({ candidate_semantic: 6, verification: 6 });
    expect(db.runs.get('run-1').error).toMatch(/presupuesto de revisión semántica/);
    expect(db.attempts.filter((item) => item.verification_counted)).toHaveLength(6);
    expect(db.posts).toHaveLength(0);
  });

  it('un error en medio de un pulso (despues de llamar al modelo) no devuelve presupuesto: el total nunca pasa de 6', async () => {
    const candidates = eightCandidates();
    const db = createDb({ candidates });
    const fetcher = pagesFor(candidates);
    const ai = rejectingAi();
    db.failOnce.add('record_blog_generation_attempts');
    const options = { fetcher, requestJson: ai, selector: poolless };
    await expect(runEditorialGeneration(db, options)).rejects.toThrow(/registrar el intento/);
    // El payload guardado quedo desactualizado, pero la base ya cobro el pulso, la verificacion y la revision semantica.
    expect(db.runs.get('run-1').budget).toEqual({ pulse: 1, verification: 1, candidate_semantic: 1 });
    expect(db.runs.get('run-1').payload.search).toBeUndefined();
    let result;
    for (let pulse = 0; pulse < 14 && result?.stage !== 'retained'; pulse += 1) {
      vi.setSystemTime(Date.now() + 6 * MINUTE);
      result = await runEditorialGeneration(db, options);
    }
    const budget = db.runs.get('run-1').budget;
    expect(result.stage).toBe('retained');
    expect(budget.candidate_semantic).toBeLessThanOrEqual(6);
    expect(ai.mock.calls.length).toBe(budget.candidate_semantic);
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(budget.verification);
    expect(budget.verification).toBeLessThanOrEqual(12);
    expect(budget.pulse).toBeLessThanOrEqual(8);
  });

  it('las redacciones tambien se reservan antes de llamar al modelo: los reintentos por error no las multiplican', async () => {
    const db = createDb({ candidates: [dog('/dog-advice/training/basics', 'Basics')] });
    const selected = [...db.candidates.values()][0];
    const selection = { candidate_id: selected.id, topic_id: 'dog-dogs-trust-1', title: 'Basics', candidate_title: 'Basics', url: BASICS, source_id: 'dogs-trust', species: 'dog', category: 'conducta',
      source: { id: 'dogs-trust', url: BASICS, title: 'Basics', organization: 'Dogs Trust', consulted_at: new Date().toISOString(), text: GOOD_TEXT, http_status: 200 } };
    db.seedRun({ payload: { phase: 'draft', search: {}, selection }, budget: { pulse: 1, verification: 1, candidate_semantic: 1 } });
    const drafter = vi.fn(async () => { throw new Error('Proveedor HTTP 500'); });
    const outcomes = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      outcomes.push(await runEditorialGeneration(db, { drafter, requestJson: makeAi() }).catch((error) => ({ error: error.message })));
      vi.setSystemTime(Date.now() + 6 * MINUTE);
    }
    expect(drafter).toHaveBeenCalledTimes(2);
    expect(db.runs.get('run-1')).toMatchObject({ stage: 'retained', budget: { draft: 2 } });
    expect(outcomes.some((outcome) => outcome.searchExhausted)).toBe(true);
    expect(db.posts).toHaveLength(0);
  });

  it('una corrida nueva empieza con presupuesto propio y la anterior conserva el suyo', async () => {
    const db = createDb({ candidates: [dog('/dog-advice/training/basics', 'Basics')] });
    const first = await db.startRun();
    await reserveBudget(db, first, 'pulse');
    await db.rpc('save_blog_generation_stage', { p_id: first.id, p_token: first.lease_token, p_stage: 'retained', p_payload: {}, p_error: 'x' });
    vi.setSystemTime(Date.now() + 2 * HOUR);
    const second = await db.startRun();
    expect(second.id).not.toBe(first.id);
    expect(await reserveBudget(db, second, 'pulse')).toMatchObject({ allowed: true, used: 1 });
    expect(db.runs.get(first.id).budget).toEqual({ pulse: 1 });
  });
});

describe('espera por dominio compartida entre descubrimiento y verificacion', () => {
  const aspca = getSourceById('aspca');
  const dogIndex = { url: 'https://www.aspca.org/pet-care/dog-care', species: 'dog' };
  const catIndex = { url: 'https://www.aspca.org/pet-care/cat-care', species: 'cat' };

  it('un segundo indice del mismo dominio con espera de rastreo se pospone hasta cumplirla (sin consumir la reserva semanal)', async () => {
    const db = createDb();
    const fetchedHosts = new Map();
    const fetcher = routes({ [dogIndex.url]: html('<main><a href="/pet-care/dog-care/x1">Idea one</a></main>'), [catIndex.url]: html('<main></main>') });
    expect(await discoverFromIndex(db, aspca, dogIndex, { fetcher, fetchedHosts })).toMatchObject({ claimed: true, found: 1 });
    expect(await discoverFromIndex(db, aspca, catIndex, { fetcher, fetchedHosts })).toMatchObject({ claimed: false, deferred: true });
    expect(db.calls.filter((name) => name === 'claim_blog_source_discovery')).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 9999);
    expect((await discoverFromIndex(db, aspca, catIndex, { fetcher, fetchedHosts })).deferred).toBe(true);
    vi.setSystemTime(Date.now() + 2);
    expect(await discoverFromIndex(db, aspca, catIndex, { fetcher, fetchedHosts })).toMatchObject({ claimed: true });
  });

  it('los dominios sin espera de rastreo no se posponen y hostReady respeta cada fuente', () => {
    const hosts = new Map([['www.aspca.org', 1000], ['www.dogstrust.org.uk', 1000]]);
    expect(hostReady(hosts, aspca, 'www.aspca.org', 1000 + 9999)).toBe(false);
    expect(hostReady(hosts, aspca, 'www.aspca.org', 1000 + 10000)).toBe(true);
    expect(hostReady(hosts, getSourceById('dogs-trust'), 'www.dogstrust.org.uk', 1000)).toBe(true);
    expect(hostReady(new Map(), aspca, 'www.aspca.org', 0)).toBe(true);
  });

  it('en un mismo pulso, si el descubrimiento ya consulto ASPCA, ningun candidato de ASPCA se descarga hasta cumplir la espera', async () => {
    const db = createDb();
    seedCandidates().forEach((seed) => db.addCandidate({ ...seed, status: 'used', permanent: true }));
    ['dogs-trust:/dog-advice/training', 'dogs-trust:/dog-advice/life-with-your-dog', 'battersea:/pet-advice/dog-advice', 'rspca:/adviceandwelfare/pets/dogs'].forEach((key) => db.discoveries.set(key, 'ok'));
    const aspcaCandidate = db.addCandidate(dog('/pet-care/dog-care/d1', 'Idea one', 'aspca'));
    db.addCandidate(dog('/dog-advice/training/a1', 'Idea two'));
    const a1 = 'https://www.dogstrust.org.uk/dog-advice/training/a1';
    const fetcher = routes({ [dogIndex.url]: html('<main><a href="/pet-care/dog-care/d2">Idea three</a></main>'),
      [aspcaCandidate.url]: html(page('Idea one')), 'https://www.aspca.org/pet-care/dog-care/d2': html(page('Idea three')), [a1]: html(page('Idea two')) });
    const run = await db.startRun();
    const result = await runSelectionPulse(db, run, {}, { fetcher, requestJson: makeAi(), limits: { poolMin: 3 } });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([dogIndex.url, a1]);
    expect(result).toMatchObject({ status: 'selected', selection: { source_id: 'dogs-trust' } });
    expect(aspcaCandidate.status).toBe('discovered');
  });
});

describe('configuracion de pruebas', () => {
  it('Vitest se limita a 2 workers sin excluir ni filtrar ninguna prueba', () => {
    const config = fs.readFileSync(new URL('../vitest.config.ts', import.meta.url), 'utf8');
    expect(config).toMatch(/maxWorkers:\s*2/);
    expect(config).not.toMatch(/\b(?:exclude|include|testNamePattern|bail)\b\s*:/);
    expect(config).toMatch(/mergeConfig\(viteConfig/);
  });
});
