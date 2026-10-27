import { afterEach, describe, expect, it, vi } from 'vitest';

const mockRpc = vi.hoisted(() => vi.fn());
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: mockRpc }),
}));

import { fetchAdminBlogPosts, fetchBlogPostBySlug, fetchBlogPosts, updateAdminBlogPost } from './supabase';

const postRow = {
  id: 'post-test-1',
  title: 'Cuidado preventivo',
  slug: 'cuidado-preventivo',
  content: 'Contenido revisado',
  image_url: null,
  source_name: 'Fuente editorial',
  estimated_reading_time: 3,
  created_at: '2026-10-23T10:00:00.000Z',
  status: 'published',
  related_guide_slug: 'guia-vacunas',
  related_blog_slug: null,
  related_product_id: null,
  meta_description: 'Descripcion revisada',
};

afterEach(() => {
  mockRpc.mockReset();
});

describe('retencion publica por revision veterinaria', () => {
  const heldRow = { ...postRow, slug: 'primeros-auxilios-para-perros-y-gatos-que-hacer-si-se-atragantan' };

  it('omite el post retenido del listado publico sin ocultar otros posts', async () => {
    mockRpc.mockResolvedValue({ data: [heldRow, postRow], error: null });
    expect(await fetchBlogPosts()).toEqual([expect.objectContaining({ slug: postRow.slug })]);
  });

  it('no consulta la RPC para el detalle retenido', async () => {
    expect(await fetchBlogPostBySlug(heldRow.slug)).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('conserva el post disponible para revision desde el listado admin', async () => {
    mockRpc.mockResolvedValue({ data: [heldRow], error: null });
    expect(await fetchAdminBlogPosts()).toEqual([expect.objectContaining({ slug: heldRow.slug })]);
  });
});

describe('updateAdminBlogPost', () => {
  it('envia la firma frontend actual de nueve argumentos y mapea una fila', async () => {
    mockRpc.mockResolvedValue({
      data: postRow,
      error: null,
    });

    const result = await updateAdminBlogPost({
      id: postRow.id,
      title: postRow.title,
      content: postRow.content,
      status: 'published',
      relatedGuideSlug: postRow.related_guide_slug,
      relatedBlogSlug: null,
      relatedProductId: null,
      metaDescription: postRow.meta_description,
    });

    expect(mockRpc).toHaveBeenCalledExactlyOnceWith('admin_update_blog_post', {
      p_id: postRow.id,
      p_title: postRow.title,
      p_content: postRow.content,
      p_status: 'published',
      p_related_guide_slug: 'guia-vacunas',
      p_related_blog_slug: null,
      p_related_product_id: null,
      p_meta_description: postRow.meta_description,
      p_update_meta_description: true,
    });
    expect(result).toMatchObject({
      id: postRow.id,
      sourceName: postRow.source_name,
      estimatedReadingTime: postRow.estimated_reading_time,
      relatedGuideSlug: postRow.related_guide_slug,
      status: 'published',
    });
  });

  it('serializa relaciones vacias como null y propaga errores de la RPC', async () => {
    const rpcError = new Error('No autorizado');
    mockRpc.mockResolvedValue({
      data: null,
      error: rpcError,
    });

    await expect(updateAdminBlogPost({
      id: postRow.id,
      title: postRow.title,
      content: postRow.content,
      status: 'published',
      relatedGuideSlug: '',
      relatedBlogSlug: '',
      relatedProductId: '',
      metaDescription: '',
    })).rejects.toBe(rpcError);

    expect(mockRpc).toHaveBeenCalledExactlyOnceWith('admin_update_blog_post', expect.objectContaining({
      p_related_guide_slug: null,
      p_related_blog_slug: null,
      p_related_product_id: null,
      p_meta_description: null,
      p_update_meta_description: true,
    }));
  });
});