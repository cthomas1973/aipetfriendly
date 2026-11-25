// Productos propios de AiPetFriendly. Son independientes del catalogo
// automatico de Mercado Libre (beneficios_productos) y no usan enlaces de
// afiliado: el enlace de compra es la publicacion oficial del producto.
export interface OwnProduct {
  id: string;
  title: string;
  category: string;
  material: string;
  shortDescription: string;
  description: string;
  imageUrl: string;
  purchaseUrl: string;
  // Identificador numerico de la publicacion, para detectar duplicados importados.
  marketplaceItemId: string;
  active: boolean;
  featured: boolean;
}

export const CHAPITA_QR_PRODUCT: OwnProduct = {
  id: 'chapita-qr-aipetfriendly',
  title: 'Chapita identificatoria QR AiPetFriendly',
  category: 'Identificación de mascotas',
  material: 'Acero inoxidable',
  shortDescription: 'Identificá a tu mascota y facilitá su regreso a casa.',
  description:
    'Chapita de acero inoxidable con código QR: quien encuentre a tu mascota accede a su perfil público y puede enviarte un mensaje sin ver tus datos personales.',
  imageUrl: '/landing/home/qr.webp',
  purchaseUrl:
    'https://articulo.mercadolibre.com.ar/MLA-4239242408-chapa-de-identificacion-qr-aipetfriendly-soporte-celular-plateado-_JM',
  marketplaceItemId: '4239242408',
  active: true,
  featured: true,
};

export const OWN_PRODUCTS: readonly OwnProduct[] = [CHAPITA_QR_PRODUCT];

export function getActiveChapitaQrProduct(): OwnProduct | null {
  return CHAPITA_QR_PRODUCT.active ? CHAPITA_QR_PRODUCT : null;
}

interface CatalogProductLike {
  id?: string | null;
  externalId?: string | null;
  link?: string | null;
  catalogProductId?: string | null;
  research?: { permalink?: string | null } | null;
}

// Detecta si un producto del catalogo automatico es la propia chapita, para no duplicarla.
export function isOwnProductDuplicate(product: CatalogProductLike, own: OwnProduct = CHAPITA_QR_PRODUCT): boolean {
  if (product.id === own.id || product.catalogProductId === own.id) return true;
  const itemId = own.marketplaceItemId;
  const pattern = new RegExp(`MLA-?${itemId}(?!\\d)`, 'i');
  return [product.externalId, product.link, product.research?.permalink]
    .some(value => typeof value === 'string' && pattern.test(value));
}
