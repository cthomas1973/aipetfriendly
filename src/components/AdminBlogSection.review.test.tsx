// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ posts: vi.fn(), runs: vi.fn(), products: vi.fn(), save: vi.fn() }));
vi.mock('../lib/supabase', () => ({ fetchAdminBlogPosts: api.posts, fetchAdminBlogGenerationRuns: api.runs,
  fetchAllBeneficiosProductos: api.products, updateAdminBlogPost: api.save, deleteAdminBlogPost: vi.fn() }));
vi.mock('../data/petGuides', () => ({ getGuidesSortedByDate: () => [] }));
import { AdminBlogSection } from './AdminBlogSection';

afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('revision administrativa real', () => {
  it('muestra motivos y bloquea publicar cuando la revision o el grafico estan pendientes', async () => {
    api.products.mockResolvedValue([]); api.runs.mockResolvedValue([]);
    api.posts.mockResolvedValue([{ id: 'post', title: 'Articulo en revision', slug: 'articulo', content: 'Texto del borrador', status: 'draft', createdAt: '2026-10-27T18:00:00Z', estimatedReadingTime: 3,
      editorialMetadata: { editorial_version: 'editorial-v2', quality: { ready: false, failed: ['editorial_revision_requires_revalidation'], veterinaryReviewRequired: false, humanEditorialReviewRequired: true }, infographic_validation: { valid: false } } }]);
    render(<AdminBlogSection />);
    const button = await screen.findByRole('button', { name: 'Publicar' });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Publicación bloqueada: revisión editorial, gráfica o veterinaria pendiente.')).toBeTruthy();
    expect(screen.getByText('Motivos: editorial_revision_requires_revalidation')).toBeTruthy();
    expect(api.save).not.toHaveBeenCalled();
  });
});