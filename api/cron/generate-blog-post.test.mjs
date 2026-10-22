// api/cron/generate-blog-post.test.mjs
//
// PASO 19.4 (validacion del generador automatico del blog): pruebas locales
// con fixtures/mocks, SIN llamadas reales a SerpApi/IA/Supabase. Cubre:
// - generateArticleFromNews: reintento por bajo conteo de palabras respetando
//   el presupuesto de tiempo (deadlineAt), y JSON invalido/incompleto.
// - sanitizeMetaDescriptionCandidate (shared/seoMeta.mjs): valida/invalida.
// - handler(): dedupe de "ya existe post hoy", error de fuente (SerpApi sin
//   noticias), error de persistencia (insert de Supabase), colision de slug,
//   y que el post SIEMPRE se guarda con status='draft'.
//
// Mock de Supabase: `@supabase/supabase-js` se mockea completo; `createClient`
// devuelve un fake "query builder" encadenable (from/select/order/limit/eq/
// gte/maybeSingle/single/insert) armado a medida en cada test via
// `makeFakeAdmin(responses)`. Mock de red: `global.fetch` se reemplaza por un
// dispatcher que responde segun la URL (guides-feed.json / SerpApi / IA de
// texto / IA de imagen), nunca golpea una API real.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sanitizeMetaDescriptionCandidate } from '../../shared/seoMeta.mjs';

let currentAdmin = null;

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => currentAdmin),
}));

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

// Fake "query builder" minimo que soporta la combinacion exacta de llamadas
// encadenadas usadas por generate-blog-post.js sobre la tabla blog_posts
// (select+order+limit, select+gte+limit+maybeSingle, select+eq+maybeSingle,
// insert+select+single). Se identifica cada caso por la combinacion de
// metodos invocados, no por mockear supabase-js entero.
function makeFakeAdmin({ alreadyToday = false, recentValues = {}, existingSlugs = new Set(), insertResult }) {
  return {
    from(table) {
      if (table !== 'blog_posts') {
        throw new Error(`Tabla inesperada en el mock: ${table}`);
      }
      const q = {
        _col: null,
        _isGte: false,
        _eqCol: null,
        _eqVal: null,
        select(col) {
          q._col = col;
          return q;
        },
        order() {
          return q;
        },
        limit() {
          return q;
        },
        gte() {
          q._isGte = true;
          return q;
        },
        eq(col, val) {
          q._eqCol = col;
          q._eqVal = val;
          return q;
        },
        insert(payload) {
          q._insertPayload = payload;
          return q;
        },
        maybeSingle: async () => {
          if (q._isGte) {
            return { data: alreadyToday ? { id: 'existing-today' } : null, error: null };
          }
          if (q._eqCol === 'slug') {
            return { data: existingSlugs.has(q._eqVal) ? { id: 'slug-taken' } : null, error: null };
          }
          return { data: null, error: null };
        },
        single: async () => {
          if (!insertResult) {
            throw new Error('Test no configuro insertResult pero el handler intento insertar.');
          }
          return insertResult;
        },
        then(resolve, reject) {
          const col = q._col;
          const values = recentValues[col] || [];
          Promise.resolve({ data: values.map((v) => ({ [col]: v })), error: null }).then(resolve, reject);
        },
      };
      return q;
    },
  };
}

function makeFetchMock({ guides = [], news = [{ title: 'Noticia', snippet: 'Resumen', source: { name: 'Fuente' }, link: 'https://x' }], aiResponses, imageFails = true } = {}) {
  let aiCall = 0;
  return vi.fn(async (url) => {
    const u = String(url);
    if (u.includes('guides-feed.json')) {
      return jsonResponse(200, guides);
    }
    if (u.includes('serpapi.com')) {
      return jsonResponse(200, { news_results: news });
    }
    if (u.includes('/chat/completions')) {
      const content = aiResponses[Math.min(aiCall, aiResponses.length - 1)];
      aiCall += 1;
      return jsonResponse(200, { choices: [{ message: { content } }] });
    }
    if (u.includes('/images/generations')) {
      if (imageFails) {
        return { ok: false, status: 500, text: async () => 'image generation disabled in test' };
      }
      return jsonResponse(200, { data: [{ b64_json: Buffer.from('fake-image').toString('base64') }] });
    }
    throw new Error(`URL no esperada en el mock de fetch: ${u}`);
  });
}

function aiArticleJson(overrides = {}) {
  return JSON.stringify({
    title: 'Un titulo de prueba para el articulo',
    content: 'Contenido de prueba. '.repeat(40), // ~120 palabras, por debajo del minimo a proposito en tests que lo necesiten
    source_name: 'Fuente de prueba',
    estimated_reading_time: 3,
    meta_description: '',
    ...overrides,
  });
}

function makeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function makeReq(authHeader = 'Bearer test-cron-secret') {
  return { method: 'POST', headers: { authorization: authHeader } };
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.CRON_SECRET = 'test-cron-secret';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
  process.env.SERPAPI_KEY = 'test-serpapi-key';
  process.env.AI_API_KEY = 'test-ai-key';
  currentAdmin = null;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sanitizeMetaDescriptionCandidate (shared/seoMeta.mjs)', () => {
  it('acepta un texto plano dentro del rango 120-160', () => {
    const valid = 'Descubri como cuidar la alimentacion de tu mascota con estos consejos practicos y recomendaciones utiles para el dia a dia de perros y gatos.';
    expect(valid.length).toBeGreaterThanOrEqual(120);
    expect(valid.length).toBeLessThanOrEqual(160);
    expect(sanitizeMetaDescriptionCandidate(valid)).toBe(valid);
  });

  it('rechaza contenido con HTML (devuelve null)', () => {
    const withHtml = `<script>alert(1)</script>${'a'.repeat(140)}`;
    expect(sanitizeMetaDescriptionCandidate(withHtml)).toBeNull();
  });

  it('rechaza texto demasiado corto', () => {
    expect(sanitizeMetaDescriptionCandidate('Muy corto.')).toBeNull();
  });

  it('rechaza texto demasiado largo (una sola palabra sin espacios para evitar el truncado automatico)', () => {
    // buildBlogDescription trunca en un espacio cuando el texto tiene
    // espacios (nunca queda "demasiado largo"); la unica forma real de
    // superar META_DESCRIPTION_MAX_LENGTH es una palabra unica sin ningun
    // espacio en todo el texto (ver PASO 19.3.9, caso ya validado a mano).
    expect(sanitizeMetaDescriptionCandidate('a'.repeat(300))).toBeNull();
  });

  it('rechaza valores no-string (undefined/null/number)', () => {
    expect(sanitizeMetaDescriptionCandidate(undefined)).toBeNull();
    expect(sanitizeMetaDescriptionCandidate(null)).toBeNull();
    expect(sanitizeMetaDescriptionCandidate(123)).toBeNull();
  });
});

describe('generateArticleFromNews (exportado directo, sin handler)', () => {
  it('reintenta una vez si el primer articulo queda corto y hay presupuesto de tiempo', async () => {
    const { generateArticleFromNews } = await import('./generate-blog-post.js');
    // parseArticleJson hace .trim() del content: los fixtures no deben
    // terminar en espacio para poder comparar con toBe() mas abajo.
    const shortContent = 'Palabra '.repeat(50).trim(); // 50 palabras, debajo del minimo (550)
    const longContent = 'Palabra '.repeat(700).trim(); // 700 palabras, supera el minimo
    const fetchMock = makeFetchMock({
      aiResponses: [aiArticleJson({ content: shortContent }), aiArticleJson({ content: longContent })],
    });
    vi.stubGlobal('fetch', fetchMock);

    const deadlineAt = Date.now() + 60000; // presupuesto de sobra
    const article = await generateArticleFromNews('tema', [{ title: 't', snippet: 's', source: 'f' }], 'perro mestizo', null, deadlineAt);

    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('/chat/completions'))).toHaveLength(2);
    expect(article.content).toBe(longContent);
  });

  it('NO reintenta si no queda presupuesto de tiempo suficiente (evita arriesgar el timeout del cron)', async () => {
    const { generateArticleFromNews } = await import('./generate-blog-post.js');
    const shortContent = 'Palabra '.repeat(50).trim();
    const fetchMock = makeFetchMock({ aiResponses: [aiArticleJson({ content: shortContent })] });
    vi.stubGlobal('fetch', fetchMock);

    const deadlineAt = Date.now() + 1000; // mucho menos que RETRY_TEXT_BUDGET_MS (15000)
    const article = await generateArticleFromNews('tema', [{ title: 't', snippet: 's', source: 'f' }], 'perro mestizo', null, deadlineAt);

    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('/chat/completions'))).toHaveLength(1);
    expect(article.content).toBe(shortContent);
  });

  it('propaga un error claro si la IA responde JSON invalido', async () => {
    const { generateArticleFromNews } = await import('./generate-blog-post.js');
    const fetchMock = makeFetchMock({ aiResponses: ['esto no es json'] });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateArticleFromNews('tema', [{ title: 't', snippet: 's', source: 'f' }], 'perro mestizo', null, Date.now() + 60000)
    ).rejects.toThrow(/JSON valido/);
  });

  it('propaga un error claro si falta title/content en el JSON de la IA', async () => {
    const { generateArticleFromNews } = await import('./generate-blog-post.js');
    const fetchMock = makeFetchMock({ aiResponses: [JSON.stringify({ content: 'solo contenido, sin titulo' })] });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateArticleFromNews('tema', [{ title: 't', snippet: 's', source: 'f' }], 'perro mestizo', null, Date.now() + 60000)
    ).rejects.toThrow(/title\/content/);
  });

  it('sanitiza meta_description invalida (HTML) a null sin romper la generacion', async () => {
    const { generateArticleFromNews } = await import('./generate-blog-post.js');
    const longContent = 'Palabra '.repeat(700);
    const fetchMock = makeFetchMock({
      aiResponses: [aiArticleJson({ content: longContent, meta_description: '<b>no valido</b>' })],
    });
    vi.stubGlobal('fetch', fetchMock);

    const article = await generateArticleFromNews('tema', [{ title: 't', snippet: 's', source: 'f' }], 'perro mestizo', null, Date.now() + 60000);
    expect(article.metaDescription).toBeNull();
  });
});

describe('handler() (integracion con Supabase/fetch mockeados)', () => {
  it('responde 503 si falta CRON_SECRET (nunca hay modo sin autenticacion)', async () => {
    delete process.env.CRON_SECRET;
    const { default: handler } = await import('./generate-blog-post.js');
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(503);
  });

  it('responde 401 si el token no coincide', async () => {
    const { default: handler } = await import('./generate-blog-post.js');
    const res = makeRes();
    await handler(makeReq('Bearer incorrecto'), res);
    expect(res.statusCode).toBe(401);
  });

  it('responde 200 {skipped:true} si ya existe un post generado hoy (no llama a SerpApi/IA)', async () => {
    currentAdmin = makeFakeAdmin({ alreadyToday: true });
    const fetchMock = makeFetchMock();
    vi.stubGlobal('fetch', fetchMock);
    const { default: handler } = await import('./generate-blog-post.js');

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.skipped).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('responde 500 si SerpApi no devuelve noticias para el tema', async () => {
    currentAdmin = makeFakeAdmin({ alreadyToday: false });
    vi.stubGlobal('fetch', makeFetchMock({ news: [] }));
    const { default: handler } = await import('./generate-blog-post.js');

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/SerpApi no devolvio noticias/);
  });

  it('responde 500 con el mensaje real si falla el insert en Supabase (persistencia)', async () => {
    currentAdmin = makeFakeAdmin({
      alreadyToday: false,
      insertResult: { data: null, error: { message: 'duplicate key value violates unique constraint' } },
    });
    vi.stubGlobal('fetch', makeFetchMock({ aiResponses: [aiArticleJson({ content: 'Palabra '.repeat(700) })] }));
    const { default: handler } = await import('./generate-blog-post.js');

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/No se pudo guardar el post/);
  });

  it('crea el post SIEMPRE con status=draft y respeta una meta_description valida', async () => {
    const validMeta = 'Descubri como cuidar la alimentacion de tu mascota con estos consejos practicos y recomendaciones utiles para el dia a dia de perros y gatos.';
    let insertedPayload = null;
    currentAdmin = makeFakeAdmin({ alreadyToday: false });
    // Se intercepta insert() para poder inspeccionar el payload exacto sin
    // reescribir todo el mock generico de arriba.
    const originalFrom = currentAdmin.from.bind(currentAdmin);
    currentAdmin.from = (table) => {
      const q = originalFrom(table);
      const originalInsert = q.insert.bind(q);
      q.insert = (payload) => {
        insertedPayload = payload;
        return originalInsert(payload);
      };
      q.single = async () => ({ data: { id: 'new-post-id', ...insertedPayload }, error: null });
      return q;
    };
    vi.stubGlobal(
      'fetch',
      makeFetchMock({ aiResponses: [aiArticleJson({ content: 'Palabra '.repeat(700), meta_description: validMeta })] })
    );
    const { default: handler } = await import('./generate-blog-post.js');

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(insertedPayload.status).toBe('draft');
    expect(insertedPayload.meta_description).toBe(validMeta);
  });

  it('evita colisiones de slug agregando un sufijo numerico', async () => {
    let insertedPayload = null;
    const baseSlug = 'un-titulo-de-prueba-para-el-articulo';
    currentAdmin = makeFakeAdmin({
      alreadyToday: false,
      existingSlugs: new Set([baseSlug]),
    });
    const originalFrom = currentAdmin.from.bind(currentAdmin);
    currentAdmin.from = (table) => {
      const q = originalFrom(table);
      const originalInsert = q.insert.bind(q);
      q.insert = (payload) => {
        insertedPayload = payload;
        return originalInsert(payload);
      };
      q.single = async () => ({ data: { id: 'new-post-id', ...insertedPayload }, error: null });
      return q;
    };
    vi.stubGlobal('fetch', makeFetchMock({ aiResponses: [aiArticleJson({ content: 'Palabra '.repeat(700) })] }));
    const { default: handler } = await import('./generate-blog-post.js');

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(insertedPayload.slug).toBe(`${baseSlug}-2`);
  });
});
