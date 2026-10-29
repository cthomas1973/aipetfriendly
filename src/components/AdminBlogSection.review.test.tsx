// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ posts: vi.fn(), runs: vi.fn(), products: vi.fn(), save: vi.fn() }));
vi.mock('../lib/supabase', () => ({ fetchAdminBlogPosts: api.posts, fetchAdminBlogGenerationRuns: api.runs,
  fetchAllBeneficiosProductos: api.products, updateAdminBlogPost: api.save, deleteAdminBlogPost: vi.fn() }));
vi.mock('../data/petGuides', () => ({ getGuidesSortedByDate: () => [] }));
import { AdminBlogSection } from './AdminBlogSection';

afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('revision administrativa real', () => {
  it('muestra el motivo comprensible cuando se retiene un tema clinico antes de redactar', async () => {
    api.products.mockResolvedValue([]);
    api.posts.mockResolvedValue([]);
    api.runs.mockResolvedValue([{ id: 'run', stage: 'retained', createdAt: '2026-10-28T10:00:00Z',
      error: 'El tema trata una urgencia o un procedimiento de primeros auxilios.',
      payload: { policy_rejection_reason: 'El tema trata una urgencia o un procedimiento de primeros auxilios.',
        editorial_policy: { status: 'excluded', code: 'urgent_care', clinicalClaims: ['urgent_care'] },
        quality: { ready: false, failed: ['editorial_policy'] } } }]);
    render(<AdminBlogSection />);
    expect(await screen.findByText('Tema retenido: El tema trata una urgencia o un procedimiento de primeros auxilios.')).toBeTruthy();
    expect(api.save).not.toHaveBeenCalled();
  });

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

  it('devuelve a draft un artículo generado publicado cuando se edita', async () => {
    api.products.mockResolvedValue([]); api.runs.mockResolvedValue([]);
    const row = { id: 'post', title: 'Artículo generado', slug: 'articulo-generado', content: 'Texto inicial', status: 'published', createdAt: '2026-10-27T18:00:00Z', estimatedReadingTime: 3,
      editorialMetadata: { editorial_version: 'editorial-v2', quality: { ready: true, failed: [], veterinaryReviewRequired: false }, infographic_validation: { valid: true } } };
    api.posts.mockResolvedValue([row]);
    api.save.mockResolvedValue({ ...row, content: 'Texto editado', status: 'draft', editorialMetadata: { ...row.editorialMetadata, quality: { ready: false, failed: ['editorial_revision_requires_revalidation'] }, infographic_validation: { valid: false } } });
    render(<AdminBlogSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByDisplayValue('Texto inicial'), { target: { value: 'Texto editado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(api.save).toHaveBeenCalled());
    expect(api.save.mock.calls[0][0].status).toBe('draft');
  });
});