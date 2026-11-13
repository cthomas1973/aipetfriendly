import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import beneficiosHandler from '../api/beneficios.js';

const productId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const trackingValue = 'test-affiliate-value';

function createResponse() {
  return {
    headers: {},
    statusCode: 0,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function supabaseReadResponse(rows) {
  return new Response(JSON.stringify(rows), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://project-ref.supabase.co');
  vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon-key');
  vi.stubEnv('ML_REFRESH_TOKEN', '');
  vi.stubEnv('ML_APP_ID', '');
  vi.stubEnv('ML_APP_SECRET', '');
  vi.stubEnv('ML_AFFILIATE_TEMPLATE', '');
  vi.stubEnv('ML_AFFILIATE_ID', '');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('GET /api/beneficios affiliate responses', () => {
  it.each([
    ['permalink ausente', undefined],
    ['permalink null', null],
    ['permalink vacio', ''],
    ['dominio externo', 'https://example.com/MLA-1234567890'],
    ['MLA invalido', 'https://articulo.mercadolibre.com.ar/MLA-INVALID'],
  ])('no devuelve URL para %s', async (_label, permalink) => {
    vi.stubEnv('ML_AFFILIATE_ID', trackingValue);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(supabaseReadResponse([{ id: productId, permalink }])));
    const response = createResponse();

    await beneficiosHandler({ method: 'GET', query: { productId } }, response);

    expect(response.body.affiliateAvailable).toBe(false);
    expect(response.body.link).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    'https://www.mercadolibre.com.ar/?matt_tool=',
    'https://www.mercadolibre.com.ar/?matt_tool=test&MATT_TOOL=other',
  ])('rechaza configuracion de tracking invalida sin fallback', async template => {
    vi.stubEnv('ML_AFFILIATE_TEMPLATE', template);
    vi.stubEnv('ML_AFFILIATE_ID', trackingValue);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(supabaseReadResponse([{
      id: productId, permalink: 'https://articulo.mercadolibre.com.ar/MLA-1234567890',
    }])));
    const response = createResponse();

    await beneficiosHandler({ method: 'GET', query: { productId } }, response);

    expect(response.body.link).toBeNull();
    expect(response.body.affiliateAvailable).toBe(false);
  });

  it('no devuelve enlaces para productos inactivos excluidos por la consulta', async () => {
    vi.stubEnv('ML_AFFILIATE_ID', trackingValue);
    vi.stubGlobal('fetch', vi.fn(async input => {
      const url = new URL(input);
      expect(url.searchParams.get('active')).toBe('eq.true');
      return supabaseReadResponse([]);
    }));
    const response = createResponse();

    await beneficiosHandler({ method: 'GET', query: { productId } }, response);

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({ affiliateAvailable: false, link: null });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['individual', 'lote'])('falla cerrado ante JSON ilegible en consulta %s', async mode => {
    vi.stubEnv('ML_AFFILIATE_ID', trackingValue);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('invalid json')));
    const response = createResponse();

    await beneficiosHandler({ method: 'GET', query: mode === 'lote' ? { productIds: productId } : { productId } }, response);

    expect(response.body.affiliateAvailable).toBe(false);
    if (mode === 'lote') expect(response.body.links).toEqual([]);
    else expect(response.body.link).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('normaliza tracking previo duplicado sin devolver el permalink crudo', async () => {
    vi.stubEnv('ML_AFFILIATE_ID', trackingValue);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(supabaseReadResponse([{
      id: productId,
      permalink: 'https://articulo.mercadolibre.com.ar/MLA-1234567890?matt_tool=old&MATT_TOOL=other',
    }])));
    const response = createResponse();

    await beneficiosHandler({ method: 'GET', query: { productId } }, response);

    const tracking = [...new URL(response.body.link).searchParams.entries()]
      .filter(([key]) => key.toLowerCase() === 'matt_tool');
    expect(tracking).toEqual([['matt_tool', trackingValue]]);
  });

  it('returns a validated server-built link for an active product', async () => {
    vi.stubEnv('ML_AFFILIATE_ID', trackingValue);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(supabaseReadResponse([{
      id: productId,
      permalink: 'https://articulo.mercadolibre.com.ar/MLA-1234567890?campaign=summer',
    }])));
    const response = createResponse();

    await beneficiosHandler({ method: 'GET', query: { productId } }, response);

    expect(response.statusCode).toBe(200);
    expect(response.body.affiliateAvailable).toBe(true);
    const url = new URL(response.body.link);
    expect(url.searchParams.get('campaign')).toBe('summer');
    expect(url.searchParams.getAll('matt_tool')).toEqual([trackingValue]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].method).toBeUndefined();
  });

  it('uses the Vite anon key when the server-only anon key is not configured', async () => {
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-vite-anon-key');
    vi.stubEnv('ML_AFFILIATE_ID', trackingValue);
    vi.stubGlobal('fetch', vi.fn(async (_input, options) => {
      expect(options.headers.apikey).toBe('test-vite-anon-key');
      return supabaseReadResponse([{
        id: productId,
        permalink: 'https://articulo.mercadolibre.com.ar/MLA-1234567890',
      }]);
    }));
    const response = createResponse();

    await beneficiosHandler({ method: 'GET', query: { productId } }, response);

    expect(response.statusCode).toBe(200);
    expect(response.body.affiliateAvailable).toBe(true);
  });

  it('returns no URL if affiliate configuration is absent', async () => {
    vi.stubEnv('ML_AFFILIATE_ID', '');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(supabaseReadResponse([{
      id: productId,
      permalink: 'https://articulo.mercadolibre.com.ar/MLA-1234567890',
    }])));
    const response = createResponse();

    await beneficiosHandler({ method: 'GET', query: { productId } }, response);

    expect(response.body).toEqual({ productId, affiliateAvailable: false, link: null });
  });

  it('returns no URL if affiliate configuration has a disallowed domain', async () => {
    vi.stubEnv('ML_AFFILIATE_TEMPLATE', `https://evil.example/?matt_tool=${trackingValue}`);
    vi.stubEnv('ML_AFFILIATE_ID', '');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(supabaseReadResponse([{
      id: productId,
      permalink: 'https://articulo.mercadolibre.com.ar/MLA-1234567890',
    }])));
    const response = createResponse();

    await beneficiosHandler({ method: 'GET', query: { productId } }, response);

    expect(response.body.affiliateAvailable).toBe(false);
    expect(response.body.link).toBeNull();
  });

  it('returns no URL if the product permalink is not a valid HTTPS Mercado Libre URL', async () => {
    vi.stubEnv('ML_AFFILIATE_ID', trackingValue);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(supabaseReadResponse([{
      id: productId,
      permalink: 'http://mercadolibre.com.ar/MLA-1234567890',
    }])));
    const response = createResponse();

    await beneficiosHandler({ method: 'GET', query: { productId } }, response);

    expect(response.body.affiliateAvailable).toBe(false);
    expect(response.body.link).toBeNull();
  });

  it('returns no URL if Supabase read fails', async () => {
    vi.stubEnv('ML_AFFILIATE_ID', trackingValue);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('read failed')));
    const response = createResponse();

    await beneficiosHandler({ method: 'GET', query: { productId } }, response);

    expect(response.body).toEqual({ affiliateAvailable: false, link: null });
  });

  it('does not expose raw static catalog permalinks when tracking is absent', async () => {
    vi.stubEnv('ML_AFFILIATE_ID', '');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(supabaseReadResponse([])));
    const response = createResponse();

    await beneficiosHandler({ method: 'GET', query: { grupo: 'alimentos' } }, response);

    expect(response.body.source).toBe('static');
    expect(response.body.products.length).toBeGreaterThan(0);
    expect(response.body.products.every(product => product.link === null)).toBe(true);
    expect(response.body.affiliateAvailable).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed product ids without fetching data', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = createResponse();

    await beneficiosHandler({ method: 'GET', query: { productId: 'not-a-uuid' } }, response);

    expect(response.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns only server-built tracked links for active products in a batch', async () => {
    vi.stubEnv('ML_AFFILIATE_ID', trackingValue);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(supabaseReadResponse([{
      id: productId,
      permalink: 'https://articulo.mercadolibre.com.ar/MLA-1234567890',
    }])));
    const response = createResponse();

    await beneficiosHandler({ method: 'GET', query: { productIds: productId } }, response);

    expect(response.body.affiliateAvailable).toBe(true);
    expect(response.body.links).toHaveLength(1);
    const url = new URL(response.body.links[0].link);
    expect(url.searchParams.getAll('matt_tool')).toEqual([trackingValue]);
    expect(url.hostname).toBe('articulo.mercadolibre.com.ar');
  });
});