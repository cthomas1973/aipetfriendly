// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ detail: vi.fn() }));
vi.mock('../lib/supabase', () => ({ fetchAdminBlogGenerationRunDetail: api.detail }));
import { BlogCandidatePoolSummary, BlogRunTrace } from './BlogGenerationTrace';
import type { BlogGenerationRun } from '../types';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const run = (overrides: Partial<BlogGenerationRun> = {}): BlogGenerationRun => ({ id: 'run-1', stage: 'retained', createdAt: '2026-11-18T10:00:00Z', species: 'dog',
  selection: { phase: 'select', pulses: 2, verifications: 4, alternatives_tried: 4, selected: null },
  payload: { search: { verifications: 4, pulses: 2, discarded: [
    { title: 'Dog health checks', url: 'https://www.rspca.org.uk/a', code: 'vet_validation' },
    { title: 'Cats and play', url: 'https://www.cats.org.uk/b', code: 'http_403' },
  ] } }, ...overrides });

describe('trazabilidad de la busqueda editorial', () => {
  it('muestra especie, alternativas probadas y el motivo legible de cada descarte', () => {
    render(<BlogRunTrace run={run()} />);
    expect(screen.getByText('Especie: Perros')).toBeTruthy();
    expect(screen.getByText(/Alternativas probadas: 4 · Descartados: 2 · Pulsos: 2/)).toBeTruthy();
    expect(screen.getByText('Requiere validación veterinaria')).toBeTruthy();
    expect(screen.getByText('La fuente rechazó el acceso (403)')).toBeTruthy();
  });

  it('muestra tema, fuente y categoria de la seleccion', () => {
    render(<BlogRunTrace run={run({ stage: 'text', selection: { phase: 'draft', alternatives_tried: 1, selected: { title: 'DIY dog toys', url: 'https://www.battersea.org.uk/pet-advice/dog-advice/diy-dog-toys', category: 'enriquecimiento', source_id: 'battersea', species: 'dog' } } })} />);
    expect(screen.getByText('Tema: DIY dog toys · enriquecimiento')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'https://www.battersea.org.uk/pet-advice/dog-advice/diy-dog-toys' })).toBeTruthy();
    expect(screen.getByText('Etapa de búsqueda: redacción')).toBeTruthy();
  });

  it('carga bajo demanda cada intento con su HTTP y el articulo generado', async () => {
    api.detail.mockResolvedValue({ postId: 'post-9', attempts: [
      { id: 1, at: '2026-11-18T10:01:00Z', sourceId: 'cats-protection', url: 'https://www.cats.org.uk/x', title: 'Cats and play', species: 'cat', outcome: 'source_failed', reasonCode: 'http_403', httpStatus: 403, verificationCounted: true },
      { id: 2, at: '2026-11-18T10:02:00Z', sourceId: 'dogs-trust', url: 'https://www.dogstrust.org.uk/y', title: 'Basics', species: 'dog', outcome: 'selected', verificationCounted: true },
    ] });
    render(<BlogRunTrace run={run()} />);
    expect(api.detail).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Ver intentos/ }));
    await waitFor(() => expect(api.detail).toHaveBeenCalledWith('run-1'));
    expect(await screen.findByText('Artículo generado: post-9')).toBeTruthy();
    expect(screen.getByText(/HTTP 403/)).toBeTruthy();
    expect(screen.getByText('Seleccionado')).toBeTruthy();
  });

  it('informa el error si no se puede leer el detalle', async () => {
    api.detail.mockRejectedValue(new Error('No autorizado'));
    render(<BlogRunTrace run={run()} />);
    fireEvent.click(screen.getByRole('button', { name: /Ver intentos/ }));
    expect(await screen.findByText('No autorizado')).toBeTruthy();
  });

  it('no muestra nada para una corrida antigua sin datos de busqueda', () => {
    const { container } = render(<BlogRunTrace run={run({ species: undefined, selection: undefined, payload: {} })} />);
    expect(container.textContent).toBe('');
  });

  it('resume el pool de candidatos por fuente', () => {
    render(<BlogCandidatePoolSummary rows={[{ sourceId: 'dogs-trust', species: 'dog', total: 5, eligible: 3, used: 1, discarded: 1 }]} />);
    expect(screen.getByText('dogs-trust · Perros: 3 aptos de 5 · 1 usados · 1 descartados')).toBeTruthy();
  });
});
