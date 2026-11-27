// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildAnalyticsPage, normalizeAnalyticsPath, PAGE_VIEW_EVENT, trackPageView } from './analytics';

const origin = 'https://www.aipetfriendly.ar';

describe('buildAnalyticsPage', () => {
  it('normaliza la barra final y conserva rutas publicas y slugs', () => {
    expect(normalizeAnalyticsPath('/blog/')).toBe('/blog');
    const page = buildAnalyticsPage({ pathname: '/guias/llamado-confiable-en-perros/', origin, title: 'Guia' });
    expect(page).toEqual({
      path: '/guias/llamado-confiable-en-perros',
      location: `${origin}/guias/llamado-confiable-en-perros`,
      title: 'Guia',
    });
  });

  it('incluye la seccion solo en la Home y nunca query ni hash', () => {
    expect(buildAnalyticsPage({ pathname: '/', tab: 'agenda', origin, title: 'x' }).path).toBe('/?tab=agenda');
    expect(buildAnalyticsPage({ pathname: '/', tab: null, origin, title: 'x' }).location).toBe(`${origin}/`);
    expect(buildAnalyticsPage({ pathname: '/reset-password', tab: 'pets', origin, title: 'x' }).path).toBe('/reset-password');
  });

  it('enmascara codigos publicos de mascota y chapita', () => {
    for (const path of ['/mascota/ABCD1234', '/m/ABCD1234', '/chapita/ABCD1234', '/t/ABCD1234']) {
      const page = buildAnalyticsPage({ pathname: path, origin, title: 'Firulais' });
      expect(page.path).toMatch(/^\/(mascota|m|chapita|t)\/:codigo$/);
      expect(page.location).not.toContain('ABCD1234');
      expect(page.title).not.toContain('Firulais');
    }
  });

  it('nunca incluye parametros privados (vet_claim, place_claim, ref, email, tokens)', () => {
    // La app solo le pasa a buildAnalyticsPage el pathname y la pestaña validada;
    // los enlaces de reclamo /?tab=map&vet_claim=...&ref=... quedan como /?tab=map.
    const claim = buildAnalyticsPage({ pathname: '/', tab: 'map', origin, title: 'x' });
    expect(claim.path).toBe('/?tab=map');
    for (const page of [claim, buildAnalyticsPage({ pathname: '/login', origin, title: 'x' })]) {
      expect(`${page.path}${page.location}`).not.toMatch(/vet_claim|place_claim|ref=|email|token|@|#/);
    }
  });
});

describe('index.html (una sola integracion de medicion)', () => {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

  it('carga GTM una sola vez (script + noscript) y sin gtag.js ni ID de GA4 en el codigo', () => {
    expect(html.match(/GTM-NKKZ8ZF5/g)).toHaveLength(2);
    expect(html.match(/googletagmanager\.com\/gtm\.js/g)).toHaveLength(1);
    expect(html.match(/googletagmanager\.com\/ns\.html/g)).toHaveLength(1);
    expect(html).not.toMatch(/gtag\/js|gtag\(|G-WNZLHW2NJB/);
  });

  it('el script de GTM va antes que el resto de los scripts del head', () => {
    expect(html.indexOf('gtm.js')).toBeGreaterThan(-1);
    expect(html.indexOf('gtm.js')).toBeLessThan(html.indexOf('adsbygoogle.js'));
  });
});

describe('trackPageView', () => {
  afterEach(() => {
    delete (window as unknown as { dataLayer?: unknown }).dataLayer;
  });

  it('publica un unico evento en dataLayer con los parametros de pagina', () => {
    trackPageView({ path: '/blog', location: `${origin}/blog`, title: 'Blog' });
    expect((window as unknown as { dataLayer: unknown[] }).dataLayer).toEqual([
      { event: PAGE_VIEW_EVENT, page_path: '/blog', page_location: `${origin}/blog`, page_title: 'Blog' },
    ]);
  });
});
