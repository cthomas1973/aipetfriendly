import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildAffiliateSearchUrl,
  buildAffiliateUrl,
  isAllowedMercadoLibreAffiliateUrl,
  isAllowedMercadoLibrePermalink,
  resolveAffiliateTracking,
  validateAffiliateUrl,
} from '../supabase/functions/_shared/affiliateLink.mjs';
import { fetchProductAffiliateLink, validateAffiliateLink } from '../src/lib/affiliateLink.ts';

const testTrackingValue = 'test-affiliate-value';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('affiliate link validation', () => {
  it('accepts only HTTPS Mercado Libre Argentina destinations', () => {
    expect(isAllowedMercadoLibrePermalink('https://articulo.mercadolibre.com.ar/MLA-1234567890')).toBe(true);
    expect(isAllowedMercadoLibrePermalink('https://www.mercadolibre.com.ar/p/MLA123456')).toBe(true);
    expect(isAllowedMercadoLibrePermalink('https://www.mercadolibre.com.ar/redirect')).toBe(false);
    expect(isAllowedMercadoLibrePermalink('http://www.mercadolibre.com.ar/MLA-1234567890')).toBe(false);
    expect(isAllowedMercadoLibrePermalink('https://www.mercadolibre.com.ar:8443/MLA-1234567890')).toBe(false);
    expect(isAllowedMercadoLibrePermalink('https://mercadolibre.com.ar.example.com/MLA-1234567890')).toBe(false);
    expect(isAllowedMercadoLibrePermalink('https://example.com/MLA-1234567890')).toBe(false);
    expect(isAllowedMercadoLibrePermalink('/MLA-1234567890')).toBe(false);
  });

  it('allows generated search destinations only on the fixed listing host', () => {
    expect(isAllowedMercadoLibreAffiliateUrl(`https://listado.mercadolibre.com.ar/alimento-para-perro?matt_tool=${testTrackingValue}`)).toBe(true);
    expect(isAllowedMercadoLibreAffiliateUrl(`https://listado.mercadolibre.com.ar/redirect?matt_tool=${testTrackingValue}`)).toBe(true);
    expect(isAllowedMercadoLibreAffiliateUrl(`https://mercadolibre.com.ar.example.com/alimento?matt_tool=${testTrackingValue}`)).toBe(false);
  });

  it.each([
    ['missing tracking', 'https://www.mercadolibre.com.ar/MLA-1234567890'],
    ['empty tracking', 'https://www.mercadolibre.com.ar/MLA-1234567890?matt_tool='],
    ['whitespace tracking', 'https://www.mercadolibre.com.ar/MLA-1234567890?matt_tool=%20%20'],
    ['duplicate tracking', 'https://www.mercadolibre.com.ar/MLA-1234567890?matt_tool=first&matt_tool=second'],
    ['case-variant duplicate tracking', 'https://www.mercadolibre.com.ar/MLA-1234567890?matt_tool=first&MATT_TOOL=second'],
    ['HTTP URL', 'http://www.mercadolibre.com.ar/MLA-1234567890?matt_tool=tracking'],
    ['unapproved host', 'https://mercadolibre.com.ar.example.com/MLA-1234567890?matt_tool=tracking'],
    ['invalid MLA', 'https://www.mercadolibre.com.ar/MLA-12ABCD?matt_tool=tracking'],
    ['short MLA', 'https://www.mercadolibre.com.ar/MLA-12345?matt_tool=tracking'],
    ['leading URL whitespace', ' https://www.mercadolibre.com.ar/MLA-1234567890?matt_tool=tracking'],
  ])('rejects %s affiliate URLs', (_label, value) => {
    expect(validateAffiliateUrl(value)).toBeNull();
    expect(isAllowedMercadoLibreAffiliateUrl(value)).toBe(false);
  });

  it('accepts a single valid tracking parameter on product and search URLs', () => {
    expect(validateAffiliateUrl(`https://www.mercadolibre.com.ar/MLA-1234567890?matt_tool=${testTrackingValue}`))
      .toContain(`matt_tool=${testTrackingValue}`);
    expect(validateAffiliateUrl(`https://listado.mercadolibre.com.ar/alimento-para-perro?MATT_TOOL=${testTrackingValue}`))
      .toContain(`MATT_TOOL=${testTrackingValue}`);
  });

  it('requires a non-empty structurally safe tracking value', () => {
    expect(resolveAffiliateTracking({ id: testTrackingValue })).toEqual({ ok: true, value: testTrackingValue });
    expect(resolveAffiliateTracking({ id: '' })).toEqual({ ok: false, reason: 'unconfigured' });
    expect(resolveAffiliateTracking({ id: '   ' })).toEqual({ ok: false, reason: 'unconfigured' });
    expect(resolveAffiliateTracking({ id: 'test value' })).toEqual({ ok: false, reason: 'unconfigured' });
    expect(resolveAffiliateTracking({ id: `bad\nvalue` })).toEqual({ ok: false, reason: 'unconfigured' });
  });

  it('extracts one tracking value from a valid configured template', () => {
    expect(resolveAffiliateTracking({
      template: `https://www.mercadolibre.com.ar/MLA-1234567890?matt_tool=${testTrackingValue}`,
    })).toEqual({ ok: true, value: testTrackingValue });
  });

  it('rejects malformed or duplicate tracking configuration instead of trusting it', () => {
    expect(resolveAffiliateTracking({ template: 'not a URL', id: testTrackingValue }))
      .toEqual({ ok: false, reason: 'invalid_configuration' });
    expect(resolveAffiliateTracking({
      template: `https://www.mercadolibre.com.ar/?matt_tool=${testTrackingValue}&matt_tool=second`,
    })).toEqual({ ok: false, reason: 'invalid_configuration' });
    expect(resolveAffiliateTracking({
      template: 'https://www.mercadolibre.com.ar/?matt_tool=&MATT_TOOL=second',
    })).toEqual({ ok: false, reason: 'invalid_configuration' });
    expect(resolveAffiliateTracking({
      template: ` https://www.mercadolibre.com.ar/?matt_tool=${testTrackingValue}`,
    })).toEqual({ ok: false, reason: 'invalid_configuration' });
  });

  it('replaces duplicate permalink parameters with exactly one encoded tracking parameter', () => {
    const result = buildAffiliateUrl(
      'https://articulo.mercadolibre.com.ar/MLA-1234567890?foo=bar&matt_tool=old&MATT_TOOL=older#details',
      'value+segment',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const url = new URL(result.url);
    expect(url.searchParams.get('foo')).toBe('bar');
    expect(url.searchParams.getAll('matt_tool')).toEqual(['value+segment']);
    expect(url.hash).toBe('#details');
  });

  it('returns no URL for absent tracking or invalid permalinks', () => {
    expect(buildAffiliateUrl('https://www.mercadolibre.com.ar/MLA-1234567890', null))
      .toEqual({ ok: false, reason: 'invalid_tracking' });
    expect(buildAffiliateUrl('javascript:alert(1)', testTrackingValue))
      .toEqual({ ok: false, reason: 'invalid_permalink' });
    expect(buildAffiliateUrl('https://example.com/MLA-1234567890', testTrackingValue))
      .toEqual({ ok: false, reason: 'invalid_permalink' });
    expect(buildAffiliateUrl('https://articulo.mercadolibre.com.ar/redirect', testTrackingValue))
      .toEqual({ ok: false, reason: 'invalid_permalink' });
  });

  it('builds search links on the fixed official domain and fails closed', () => {
    const result = buildAffiliateSearchUrl('alimento para perro', testTrackingValue);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const url = new URL(result.url);
      expect(url.hostname).toBe('listado.mercadolibre.com.ar');
      expect(url.pathname).toContain('alimento-para-perro');
      expect(url.searchParams.getAll('matt_tool')).toEqual([testTrackingValue]);
    }
    expect(buildAffiliateSearchUrl('alimento para perro', '')).toEqual({ ok: false, reason: 'invalid_tracking' });
    expect(buildAffiliateSearchUrl('   ', testTrackingValue)).toEqual({ ok: false, reason: 'invalid_permalink' });
  });

  it('accepts a frontend link only when the server response is tracked and allowed', async () => {
    expect(validateAffiliateLink(`https://www.mercadolibre.com.ar/MLA-1234567890?matt_tool=${testTrackingValue}`))
      .toContain(`matt_tool=${testTrackingValue}`);
    expect(validateAffiliateLink('https://www.mercadolibre.com.ar/MLA-1234567890')).toBeNull();
    expect(validateAffiliateLink('https://evil.example/MLA-1234567890?matt_tool=x')).toBeNull();
    expect(validateAffiliateLink('https://www.mercadolibre.com.ar/MLA-1234567890?matt_tool=%20')).toBeNull();
    expect(validateAffiliateLink('https://www.mercadolibre.com.ar/MLA-1234567890?matt_tool=first&MATT_TOOL=second')).toBeNull();
    expect(validateAffiliateLink('http://www.mercadolibre.com.ar/MLA-1234567890?matt_tool=x')).toBeNull();
    expect(validateAffiliateLink('https://www.mercadolibre.com.ar/MLA-12ABCD?matt_tool=x')).toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      affiliateAvailable: true,
      link: `https://www.mercadolibre.com.ar/MLA-1234567890?matt_tool=${testTrackingValue}`,
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
    await expect(fetchProductAffiliateLink('test-product-id')).resolves.toContain(`matt_tool=${testTrackingValue}`);
  });

  it('fails closed in the frontend on endpoint errors or unsafe response bodies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('endpoint unavailable')));
    await expect(fetchProductAffiliateLink('test-product-id')).resolves.toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      affiliateAvailable: true,
      link: 'https://www.mercadolibre.com.ar/MLA-1234567890',
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
    await expect(fetchProductAffiliateLink('test-product-id')).resolves.toBeNull();

    for (const payload of [
      null,
      {},
      { affiliateAvailable: true },
      { affiliateAvailable: false, link: `https://www.mercadolibre.com.ar/MLA-1234567890?matt_tool=${testTrackingValue}` },
      { affiliateAvailable: true, link: '' },
      { affiliateAvailable: true, link: `https://www.mercadolibre.com.ar/MLA-1234567890?matt_tool=%20` },
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })));
      await expect(fetchProductAffiliateLink('test-product-id')).resolves.toBeNull();
    }
  });
});