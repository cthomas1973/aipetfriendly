// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fetchPost = vi.hoisted(() => vi.fn());
vi.mock('../context/AppStateContext', () => ({ useAppState: () => ({ user: null }) }));
vi.mock('../lib/supabase', () => ({ fetchBlogPostBySlug: fetchPost, fetchBlogPosts: vi.fn() }));
vi.mock('./AdBanner', () => ({ AdBanner: () => null }));
vi.mock('./RelatedLinksBlock', () => ({ RelatedLinksBlock: () => <nav aria-label="Artículos relacionados" /> }));
vi.mock('./PublicLegalPages', () => ({ PublicFooter: () => null }));
import { BlogSection } from './BlogSection';

afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('infografía final del artículo', () => {
  it('muestra la segunda imagen después de la conclusión y antes de relacionados', async () => {
    fetchPost.mockResolvedValue({ id: 'post', slug: 'articulo', title: 'Artículo de prueba', content: '## Para cerrar\n\nOrganizá las instrucciones para tu cuidador.',
      createdAt: '2026-10-27T12:00:00Z', estimatedReadingTime: 3, status: 'published', imageUrl: 'https://example.test/cover.png',
      editorialMetadata: { cover_alt: 'Portada del gato y su cuidador', infographic_url: 'https://example.test/info.png', infographic_alt: 'Resumen visual de las instrucciones',
        infographic_caption: 'Ideas principales del artículo', sources: [{ id: 'source', title: 'Fuente primaria', organization: 'Cats Protection', url: 'https://www.cats.org.uk/example', consulted_at: '2026-10-27T12:00:00Z' }] } });
    render(<BlogSection slug="articulo" />);
    const image = await screen.findByAltText('Resumen visual de las instrucciones');
    const conclusion = screen.getByText('Organizá las instrucciones para tu cuidador.');
    const related = screen.getByRole('navigation', { name: 'Artículos relacionados' });
    expect(conclusion.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(image.compareDocumentPosition(related) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByAltText('Portada del gato y su cuidador')).not.toBe(image);
    expect(image.getAttribute('width')).toBe('1080');
    expect(image.getAttribute('height')).toBe('1350');
    expect(screen.getByRole('link', { name: 'Fuente primaria' }).getAttribute('href')).toBe('https://www.cats.org.uk/example');
  });
});