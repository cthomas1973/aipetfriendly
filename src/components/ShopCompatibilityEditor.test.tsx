// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShopCompatibilityEditor } from './ShopCompatibilityEditor';
import type { BeneficioProducto } from '../types';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn() }));
vi.mock('../lib/supabase', () => ({ fetchAdminShopDimensions: mocks.fetch, saveAdminShopDimension: mocks.save }));
const product: BeneficioProducto = {
  id:'72000000-0000-4000-8000-000000000003', mla_id:'MLA-123456789', title:'Producto',
  url_ml:'url', permalink:'url', thumbnail:null, price:null, grupo:'alimentos',
  pet_types:[], life_stages:[], size_categories:[], free_shipping:false, fast_delivery:false,
  active:true, created_at:'', updated_at:'',
};
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('Edición administrativa de compatibilidad', () => {
  it('guarda deshabilitado y exige habilitación independiente', async () => {
    mocks.fetch.mockResolvedValue([]);
    mocks.save.mockResolvedValue(undefined);
    render(<ShopCompatibilityEditor product={product} />);
    fireEvent.click(screen.getByText('Revisar compatibilidad de MLA123456789'));
    await screen.findByText(/falta evidencia/);
    fireEvent.click(screen.getByLabelText('perro'));
    fireEvent.change(screen.getByLabelText('Estado'), { target:{ value:'confirmed' } });
    fireEvent.change(screen.getByLabelText('Fuente'), { target:{ value:'https://fabricante.example' } });
    fireEvent.change(screen.getByLabelText('Fecha'), { target:{ value:'2026-11-12' } });
    fireEvent.click(screen.getByLabelText('La evidencia corresponde exactamente a MLA123456789'));
    expect((screen.getByRole('button', { name:'Habilitar evidencia guardada' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name:'Guardar sin habilitar' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(product.id,'species','save',expect.objectContaining({
      enabled:false, sku:'MLA123456789', verification:'confirmed', values_text:['perro'],
    })));
    await screen.findByText(/Guardado deshabilitado/);
  });
});
