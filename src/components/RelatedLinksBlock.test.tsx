// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RelatedLinksBlock } from './RelatedLinksBlock';

const mocks = vi.hoisted(() => ({
  guide: vi.fn(),
  blog: vi.fn(),
  product: vi.fn(),
  link: vi.fn(),
}));

vi.mock('../data/petGuides', () => ({ getPetGuideBySlug: mocks.guide }));
vi.mock('../lib/supabase', () => ({
  fetchBlogPostBySlug: mocks.blog,
  fetchBeneficioProductoById: mocks.product,
}));
vi.mock('../lib/affiliateLink', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/affiliateLink')>(),
  fetchProductAffiliateLink: mocks.link,
}));

const validLink = 'https://articulo.mercadolibre.com.ar/MLA-1234567890?matt_tool=test-affiliate-value';

beforeEach(() => {
  mocks.guide.mockReturnValue({ slug: 'guia-local', title: 'Guia local' });
  mocks.blog.mockResolvedValue({ slug: 'nota-local', title: 'Nota local' });
  mocks.product.mockResolvedValue({ id: 'product-a', title: 'Producto local', thumbnail: null });
  mocks.link.mockResolvedValue(validLink);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Red no autorizada en esta prueba')));
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('RelatedLinksBlock', () => {
  it.each([
    ['URL ausente', null],
    ['URL vacia', ''],
    ['dominio no autorizado', 'https://example.com/MLA-1234567890?matt_tool=test'],
    ['HTTP', 'http://articulo.mercadolibre.com.ar/MLA-1234567890?matt_tool=test'],
    ['tracking ausente', 'https://articulo.mercadolibre.com.ar/MLA-1234567890'],
    ['tracking duplicado', `${validLink}&MATT_TOOL=other`],
  ])('deshabilita el CTA con %s y conserva los enlaces editoriales', async (_label, link) => {
    mocks.link.mockResolvedValue(link);
    const openWindow = vi.spyOn(window, 'open').mockImplementation(() => null);
    const initialLocation = window.location.href;
    const { container } = render(
      <RelatedLinksBlock relatedGuideSlug="guia-local" relatedBlogSlug="nota-local" relatedProductId="product-a" />,
    );

    const title = await screen.findByText('Producto local');
    expect(await screen.findByRole('link', { name: /Nota local/ })).toHaveProperty('pathname', '/blog/nota-local');
    expect(screen.getByRole('link', { name: /Guia local/ })).toHaveProperty('pathname', '/guias/guia-local');
    expect(container.querySelector('a[target="_blank"]')).toBeNull();
    expect(screen.getByText('Enlace de compra temporalmente no disponible')).toBeTruthy();
    expect(title.closest('article')?.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(title);
    expect(openWindow).not.toHaveBeenCalled();
    expect(window.location.href).toBe(initialLocation);
  });

  it('habilita solo un enlace comercial validado', async () => {
    render(<RelatedLinksBlock relatedProductId="product-a" />);

    const link = await screen.findByRole('link', { name: /Producto local/ });
    expect(link.getAttribute('href')).toBe(validLink);
    expect(link.getAttribute('rel')).toBe('sponsored nofollow noopener noreferrer');
  });

  it.each(['inactivo', 'error de lectura'])('no muestra un CTA para un producto %s', async reason => {
    if (reason === 'inactivo') mocks.product.mockResolvedValue(null);
    else mocks.product.mockRejectedValue(new Error('Lectura fallida'));
    const { container } = render(
      <RelatedLinksBlock relatedBlogSlug="nota-local" relatedProductId="product-a" />,
    );

    await screen.findByRole('link', { name: /Nota local/ });
    await waitFor(() => expect(mocks.product).toHaveBeenCalled());
    expect(container.querySelector('a[target="_blank"]')).toBeNull();
    expect(screen.queryByText('Producto local')).toBeNull();
  });

  it('retira el CTA anterior mientras carga otro producto', async () => {
    const { container, rerender } = render(<RelatedLinksBlock relatedProductId="product-a" />);
    await screen.findByRole('link', { name: /Producto local/ });
    mocks.product.mockReturnValue(new Promise(() => {}));
    mocks.link.mockReturnValue(new Promise(() => {}));

    rerender(<RelatedLinksBlock relatedProductId="product-b" />);

    expect(container.querySelector('a')).toBeNull();
    expect(screen.queryByText('Producto local')).toBeNull();
  });
});