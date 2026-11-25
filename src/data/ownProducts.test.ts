import { describe, expect, it } from 'vitest';
import { CHAPITA_QR_PRODUCT, getActiveChapitaQrProduct, isOwnProductDuplicate } from './ownProducts';

describe('ficha central de la chapita QR', () => {
  it('expone los datos del producto propio y su enlace oficial', () => {
    expect(CHAPITA_QR_PRODUCT).toMatchObject({
      id: 'chapita-qr-aipetfriendly',
      title: 'Chapita identificatoria QR AiPetFriendly',
      category: 'Identificación de mascotas',
      material: 'Acero inoxidable',
      active: true,
      featured: true,
    });
    expect(new URL(CHAPITA_QR_PRODUCT.purchaseUrl).hostname).toBe('articulo.mercadolibre.com.ar');
    expect(CHAPITA_QR_PRODUCT.purchaseUrl).toContain('MLA-4239242408');
    expect(CHAPITA_QR_PRODUCT.purchaseUrl).not.toContain('matt_tool');
    expect(getActiveChapitaQrProduct()).toBe(CHAPITA_QR_PRODUCT);
  });

  it('detecta duplicados importados por id, externalId, enlace o permalink', () => {
    expect(isOwnProductDuplicate({ id: 'chapita-qr-aipetfriendly' })).toBe(true);
    expect(isOwnProductDuplicate({ id: 'x', externalId: 'MLA4239242408' })).toBe(true);
    expect(isOwnProductDuplicate({ id: 'x', link: 'https://articulo.mercadolibre.com.ar/MLA-4239242408-chapa?matt_tool=a' })).toBe(true);
    expect(isOwnProductDuplicate({ id: 'x', research: { permalink: 'https://articulo.mercadolibre.com.ar/MLA-4239242408-x' } })).toBe(true);
  });

  it('no marca como duplicado a otros productos', () => {
    expect(isOwnProductDuplicate({ id: 'x', externalId: 'MLA42392424089' })).toBe(false);
    expect(isOwnProductDuplicate({ id: 'y', externalId: 'MLA1234567890', link: null })).toBe(false);
  });
});
