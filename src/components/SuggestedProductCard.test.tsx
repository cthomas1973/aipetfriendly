// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SuggestedProduct } from '../hooks/useChat';
import { SuggestedProductCard } from './SuggestedProductCard';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const product = {
  title: 'Alimento para perro',
  thumbnail: null,
  price: null,
};

describe('SuggestedProductCard', () => {
  it.each([
    ['empty URL', ''],
    ['whitespace-only URL', '   '],
    ['URL with surrounding spaces', ' https://www.mercadolibre.com.ar/MLA-1234567890?matt_tool=test-affiliate-value '],
    ['URL with internal spaces', 'https://www.mercadolibre.com.ar/MLA-1234567890?matt_tool=test affiliate'],
    ['HTTP URL', 'http://www.mercadolibre.com.ar/MLA-1234567890?matt_tool=test-affiliate-value'],
    ['external domain', 'https://example.com/MLA-1234567890?matt_tool=test-affiliate-value'],
    ['empty tracking', 'https://www.mercadolibre.com.ar/MLA-1234567890?matt_tool='],
    ['missing tracking', 'https://www.mercadolibre.com.ar/MLA-1234567890'],
    ['encoded tracking spaces', 'https://www.mercadolibre.com.ar/MLA-1234567890?matt_tool=%20'],
    ['internal encoded tracking spaces', 'https://www.mercadolibre.com.ar/MLA-1234567890?matt_tool=test%20affiliate'],
    ['duplicate tracking', 'https://www.mercadolibre.com.ar/MLA-1234567890?matt_tool=test-affiliate-value&matt_tool=other'],
    ['mixed-case duplicate tracking', 'https://www.mercadolibre.com.ar/MLA-1234567890?matt_tool=test-affiliate-value&MATT_TOOL=other'],
    ['invalid MLA', 'https://www.mercadolibre.com.ar/MLA-invalid?matt_tool=test-affiliate-value'],
    ['missing permalink path', 'https://www.mercadolibre.com.ar/?matt_tool=test-affiliate-value'],
    ['null URL', null],
    ['unexpected undefined URL', undefined],
  ])('does not render an anchor or navigate for %s', (_description, link) => {
    const openWindow = vi.spyOn(window, 'open').mockImplementation(() => null);
    const initialLocation = window.location.href;
    const { container } = render(
      <SuggestedProductCard
        product={{ ...product, link: link as SuggestedProduct['link'] }}
        className="card"
      />,
    );

    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(screen.getByText('Enlace de compra temporalmente no disponible')).toBeTruthy();
    const title = screen.getByText(product.title);
    const card = container.firstElementChild!;
    expect(card.tagName).toBe('DIV');
    expect(card.getAttribute('aria-disabled')).toBe('true');
    expect(card.hasAttribute('href')).toBe(false);
    expect(card.hasAttribute('tabindex')).toBe(false);
    fireEvent.click(title);
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: 'Enter', code: 'Enter' });
    expect(openWindow).not.toHaveBeenCalled();
    expect(window.location.href).toBe(initialLocation);
    expect(container.querySelector('a')).toBeNull();
  });

  it('marks a validated commercial link as sponsored and safe to open', () => {
    render((
      <SuggestedProductCard
        product={{ ...product, link: 'https://www.mercadolibre.com.ar/MLA-1234567890?matt_tool=test-affiliate-value' }}
        className="card"
      />
    ));

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('https://www.mercadolibre.com.ar/MLA-1234567890?matt_tool=test-affiliate-value');
    expect(link.getAttribute('rel')).toBe('sponsored nofollow noopener noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('removes navigation when a valid link is replaced with an invalid one', () => {
    const { container, rerender } = render(
      <SuggestedProductCard
        product={{ ...product, link: 'https://www.mercadolibre.com.ar/MLA-1234567890?matt_tool=test-affiliate-value' }}
        className="card"
      />,
    );
    expect(screen.getByRole('link')).toBeTruthy();

    rerender(<SuggestedProductCard product={{ ...product, link: 'https://example.com' }} className="card" />);

    expect(container.querySelector('a')).toBeNull();
    expect(screen.getByText('Enlace de compra temporalmente no disponible')).toBeTruthy();
  });
});