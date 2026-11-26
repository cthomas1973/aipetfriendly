// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newGuideDraft, type GuideDraft } from '../lib/adminGuideDraft';

const mocks = vi.hoisted(() => ({ storage: vi.fn(), normalize: vi.fn(), admin: true }));
vi.mock('../context/AppStateContext', () => ({
  useAppState: () => ({ user: { id: 'admin-test', isAdmin: mocks.admin } }),
  useSessionGuard: () => () => {},
}));
vi.mock('../lib/adminGuideDraft', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/adminGuideDraft')>(),
  storedGuideDraft: mocks.storage,
  normalizeGuideImage: mocks.normalize,
}));
import { AdminGuidesSection } from './AdminGuidesSection';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); mocks.storage.mockReset(); mocks.normalize.mockReset(); mocks.admin = true; });
function setup() {
  let count = 0;
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL() { return `blob:test-${++count}`; }
    static revokeObjectURL = vi.fn();
  });
  return render(<AdminGuidesSection />);
}

describe('constructor administrativo de guías', () => {
  it('no expone el editor a visitantes', () => {
    mocks.admin = false;
    setup();
    expect(screen.queryByRole('button', { name: 'Exportar paquete para integrar' })).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('administrador');
  });
  it('convierte texto, ordena las secciones y exige nueva confirmación al editar', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Texto completo de la guía'), { target: { value: '## Primero\nTexto uno.\n\n## Segundo\nTexto dos.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Convertir texto en secciones' }));
    fireEvent.click(screen.getByRole('button', { name: 'Subir sección 2' }));
    expect((screen.getByLabelText('Encabezado 1') as HTMLInputElement).value).toBe('Segundo');
    const ready = screen.getByRole('checkbox', { name: /Confirmo que la revisión/ }) as HTMLInputElement;
    fireEvent.click(ready); expect(ready.checked).toBe(true);
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Una guía nueva' } });
    expect(ready.checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Vista móvil' }));
    expect(screen.getByTestId('guide-preview').className).toContain('360px');
  });
  it('guarda y recupera imágenes, slug personalizado y posición junto al texto', async () => {
    const saved: GuideDraft = {
      ...newGuideDraft([]), title: 'Guía guardada', slug: 'mi-slug-personalizado',
      cover: { blob: new Blob(['cover'], { type: 'image/jpeg' }), src: 'blob:old', alt: 'Portada' },
      sections: [{ id: 'section', heading: 'Paso', text: 'Texto guardado',
        image: { blob: new Blob(['image'], { type: 'image/jpeg' }), src: 'blob:old2', alt: 'Imagen del paso' }, imagePosition: 'before' }],
    };
    mocks.storage.mockResolvedValue(saved);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Recuperar borrador' }));
    await waitFor(() => expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('mi-slug-personalizado'));
    const preview = within(screen.getByTestId('guide-preview'));
    const image = preview.getByAltText('Imagen del paso');
    expect(image.getAttribute('src')).toBe('blob:test-2');
    expect(image.compareDocumentPosition(preview.getByText('Texto guardado')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    mocks.storage.mockResolvedValue(null);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await waitFor(() => expect(mocks.storage).toHaveBeenLastCalledWith('write', 'admin-test', expect.objectContaining({
      slug: 'mi-slug-personalizado', cover: expect.objectContaining({ blob: saved.cover?.blob }),
    })));
  });
  it('muestra fallos de almacenamiento y validación en vez de simular éxito', async () => {
    mocks.storage.mockRejectedValue(new Error('Disco lleno'));
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Disco lleno'));
    fireEvent.click(screen.getByRole('button', { name: 'Exportar paquete para integrar' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('título'));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
