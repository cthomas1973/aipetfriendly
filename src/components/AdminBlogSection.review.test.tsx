// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ posts: vi.fn(), runs: vi.fn(), products: vi.fn(), save: vi.fn(), pool: vi.fn(async () => []) }));
vi.mock('../lib/supabase', () => ({ fetchAdminBlogPosts: api.posts, fetchAdminBlogGenerationRuns: api.runs, fetchAdminBlogCandidatePool: api.pool,
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

  it('bloquea Publicar y explica por que cuando una edicion invalido la aprobacion veterinaria (aunque el resto de los controles siga en verde)', async () => {
    api.products.mockResolvedValue([]); api.runs.mockResolvedValue([]);
    api.posts.mockResolvedValue([{ id: 'post', title: 'Meta editada', slug: 'meta-editada', content: 'Texto del borrador', status: 'draft', createdAt: '2026-10-27T18:00:00Z', estimatedReadingTime: 3,
      editorialMetadata: { editorial_version: 'editorial-v2', quality: { ready: true, failed: [], veterinaryReviewRequired: false, humanEditorialReviewRequired: true }, infographic_validation: { valid: true },
        vet_review: { approved: false, invalidated: true, invalidated_reason: 'texto_modificado' } } }]);
    render(<AdminBlogSection />);
    expect((await screen.findByRole('button', { name: 'Publicar' })).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/La aprobación veterinaria semántica quedó invalidada porque cambió el título, el texto o la meta descripción/)).toBeTruthy();
    expect(api.save).not.toHaveBeenCalled();
  });

  it('no bloquea de mas: un generado historico sin vet_review y un articulo manual se publican como siempre', async () => {
    api.products.mockResolvedValue([]); api.runs.mockResolvedValue([]);
    const generated = { id: 'historico', title: 'Historico', slug: 'historico', content: 'Texto', status: 'draft', createdAt: '2026-10-20T18:00:00Z', estimatedReadingTime: 3,
      editorialMetadata: { editorial_version: 'editorial-v2', quality: { ready: true, failed: [], veterinaryReviewRequired: false, humanEditorialReviewRequired: true }, infographic_validation: { valid: true } } };
    const manual = { id: 'manual', title: 'Manual', slug: 'manual', content: 'Texto', status: 'draft', createdAt: '2026-10-21T18:00:00Z', estimatedReadingTime: 2 };
    api.posts.mockResolvedValue([generated, manual]);
    render(<AdminBlogSection />);
    const buttons = await screen.findAllByRole('button', { name: 'Publicar' });
    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => !button.hasAttribute('disabled'))).toBe(true);
    expect(screen.queryByText(/quedó invalidada/)).toBeNull();
  });

  it('muestra los motivos de un borrador con advertencias blandas y publica solo si el administrador confirma', async () => {
    api.products.mockResolvedValue([]); api.runs.mockResolvedValue([]);
    const row = { id: 'warn', title: 'Con advertencias', slug: 'con-advertencias', content: 'Texto', status: 'draft', createdAt: '2026-10-27T18:00:00Z', estimatedReadingTime: 3,
      editorialMetadata: { editorial_version: 'editorial-v2', infographic_validation: { valid: true }, vet_review: { approved: true, confidence: 0.95 },
        quality: { ready: true, failed: ['semantic_review'], veterinaryReviewRequired: false, humanEditorialReviewRequired: true, humanDecisionRequired: true,
          review_warnings: ['semantic_review'], semanticReview: { approved: false, issues: ['La cita no respalda la afirmacion.'] } } } };
    api.posts.mockResolvedValue([row]);
    api.save.mockResolvedValue({ ...row, status: 'published' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<AdminBlogSection />);
    expect(await screen.findByText('Requiere tu decisión: no superó todos los controles automáticos')).toBeTruthy();
    expect(screen.getByText(/revisión factual automática/)).toBeTruthy();
    expect(screen.getByText('La cita no respalda la afirmacion.')).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Publicar' });
    expect(button.hasAttribute('disabled')).toBe(false);
    fireEvent.click(button);
    expect(api.save).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    expect(api.save.mock.calls[0][0].status).toBe('published');
    expect(confirm).toHaveBeenCalledTimes(2);
    confirm.mockRestore();
  });

  it('un borrador con advertencias sigue bloqueado si la aprobacion veterinaria fue invalidada', async () => {
    api.products.mockResolvedValue([]); api.runs.mockResolvedValue([]);
    api.posts.mockResolvedValue([{ id: 'warn2', title: 'Invalidado', slug: 'invalidado', content: 'Texto', status: 'draft', createdAt: '2026-10-27T18:00:00Z', estimatedReadingTime: 3,
      editorialMetadata: { editorial_version: 'editorial-v2', infographic_validation: { valid: true }, vet_review: { approved: false, invalidated: true },
        quality: { ready: true, failed: ['seo'], veterinaryReviewRequired: false, humanEditorialReviewRequired: true, humanDecisionRequired: true, review_warnings: ['seo'] } } }]);
    render(<AdminBlogSection />);
    expect((await screen.findByRole('button', { name: 'Publicar' })).hasAttribute('disabled')).toBe(true);
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