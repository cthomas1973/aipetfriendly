// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OffersSection } from './SubscriptionComponents';

const mocks = vi.hoisted(() => ({ pets: [] }));
vi.mock('../context/AppStateContext', () => ({ useAppState: () => ({ pets: mocks.pets, selectedPetId:null }) }));
vi.mock('../hooks/useSupabaseSync', () => ({ signUpWithEmail: vi.fn() }));
vi.mock('../hooks/useChat', () => ({ useChat: () => ({sendMessage:vi.fn()}) }));
vi.mock('./AdBanner', () => ({ AdBanner: () => null }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));

const validLink = 'https://articulo.mercadolibre.com.ar/MLA-1234567890?matt_tool=test-affiliate-value';
const product = {
  id: 'product-a',externalId:null, title: 'Producto sintetico', price: null, thumbnail: null,
  originalPrice:null,currency:null,checkedAt:null,priceStatus:'unverified',category:'alimentos',
  source:'static',seller:null,brand:null,presentation:null,attributes:[],
  petTypes:[],lifeStages:[],sizes:[],needs:[],freeShipping:false,fastDelivery:false,
};

beforeEach(() => { mocks.pets=[]; });

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockCatalog(link: unknown, affiliateAvailable?: boolean) {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    if (!input.startsWith('/api/beneficios?')) throw new Error('Red no autorizada');
    return new Response(JSON.stringify({ affiliateAvailable, products: [{ ...product, link }] }), {
      headers: { 'content-type': 'application/json' },
    });
  }));
}

describe('OffersSection afiliacion', () => {
  it.each([
    ['configuracion ausente', validLink, undefined],
    ['configuracion deshabilitada', validLink, false],
    ['URL ausente', null, true],
    ['tracking ausente', 'https://articulo.mercadolibre.com.ar/MLA-1234567890', true],
    ['tracking duplicado', `${validLink}&matt_tool=other`, true],
    ['dominio externo', 'https://example.com/MLA-1234567890?matt_tool=test', true],
  ])('mantiene la ficha sin CTA para %s', async (_label, link, available) => {
    mockCatalog(link, available);
    const openWindow = vi.spyOn(window, 'open').mockImplementation(() => null);
    const initialLocation = window.location.href;
    const { container } = render(<OffersSection />);

    const title = await screen.findByText(product.title);
    expect(container.querySelector('a[rel~="sponsored"]')).toBeNull();
    expect(title.closest('article')?.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(title);
    expect(openWindow).not.toHaveBeenCalled();
    expect(window.location.href).toBe(initialLocation);
  });

  it('habilita el CTA solo con configuracion y URL validas', async () => {
    mockCatalog(validLink, true);
    render(<OffersSection />);

    const link = await screen.findByRole('link', { name: /Ver Producto sintetico en Mercado Libre/ });
    expect(link.getAttribute('href')).toBe(validLink);
    expect(link.getAttribute('rel')).toBe('sponsored nofollow noopener noreferrer');
  });

  it('no crea enlaces si falla la lectura del endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Lectura fallida')));
    const { container } = render(<OffersSection />);

    await screen.findByText(/No hay productos para este filtro/);
    expect(container.querySelector('a[rel~="sponsored"]')).toBeNull();
  });
});