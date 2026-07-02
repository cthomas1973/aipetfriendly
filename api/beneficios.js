const GROUP_QUERIES = {
  alimentos: 'alimento mascotas',
  accesorios: 'correa collar pretal mascotas',
  higiene: 'shampoo pipeta mascotas',
  descanso: 'cucha rascador juguetes mascotas',
};

const GROUP_KEYS = new Set(Object.keys(GROUP_QUERIES));

const PLACEHOLDER_IMAGE = 'https://placehold.co/200x200/f1f5f9/475569?text=AiPetFriendly';

const FALLBACK_CATALOG = {
  alimentos: [
    { id: 'fb-a-1', title: 'Alimento balanceado perro adulto 20kg', price: 28990, original_price: 32990, free_shipping: true, fast_delivery: true, state: 'Buenos Aires', search: 'alimento balanceado perro adulto 20kg' },
    { id: 'fb-a-2', title: 'Alimento balanceado gato adulto 15kg', price: 31200, original_price: 0, free_shipping: true, fast_delivery: false, state: 'Cordoba', search: 'alimento balanceado gato adulto 15kg' },
    { id: 'fb-a-3', title: 'Snack premium para perro x 1kg', price: 8990, original_price: 10990, free_shipping: false, fast_delivery: true, state: 'Santa Fe', search: 'snack premium perro 1kg' },
    { id: 'fb-a-4', title: 'Comida humeda para gato pack x 24', price: 21990, original_price: 24990, free_shipping: true, fast_delivery: false, state: 'Mendoza', search: 'comida humeda gato pack 24' },
  ],
  accesorios: [
    { id: 'fb-b-1', title: 'Correa reforzada antitirones para perro', price: 15490, original_price: 18990, free_shipping: true, fast_delivery: true, state: 'Buenos Aires', search: 'correa antitirones perro' },
    { id: 'fb-b-2', title: 'Pretal acolchado ajustable', price: 12890, original_price: 0, free_shipping: false, fast_delivery: true, state: 'CABA', search: 'pretal acolchado ajustable perro' },
    { id: 'fb-b-3', title: 'Bolso transportador mascota mediana', price: 38990, original_price: 42990, free_shipping: true, fast_delivery: false, state: 'Cordoba', search: 'bolso transportador mascota mediana' },
    { id: 'fb-b-4', title: 'Bebedero portatil para paseo', price: 6990, original_price: 0, free_shipping: false, fast_delivery: true, state: 'Rosario', search: 'bebedero portatil perro paseo' },
  ],
  higiene: [
    { id: 'fb-c-1', title: 'Shampoo hipoalergenico para mascotas', price: 8990, original_price: 10990, free_shipping: true, fast_delivery: true, state: 'Buenos Aires', search: 'shampoo hipoalergenico mascotas' },
    { id: 'fb-c-2', title: 'Pipeta antipulgas perro mediano', price: 13990, original_price: 15990, free_shipping: false, fast_delivery: true, state: 'CABA', search: 'pipeta antipulgas perro mediano' },
    { id: 'fb-c-3', title: 'Arena sanitaria aglutinante 10kg', price: 11890, original_price: 0, free_shipping: true, fast_delivery: false, state: 'Cordoba', search: 'arena sanitaria aglutinante 10kg' },
    { id: 'fb-c-4', title: 'Kit cepillo + guante de limpieza', price: 7590, original_price: 0, free_shipping: false, fast_delivery: true, state: 'Santa Fe', search: 'kit cepillo guante mascotas' },
  ],
  descanso: [
    { id: 'fb-d-1', title: 'Cucha termica impermeable', price: 45990, original_price: 51990, free_shipping: true, fast_delivery: false, state: 'Buenos Aires', search: 'cucha termica impermeable perro' },
    { id: 'fb-d-2', title: 'Cama colchon viscoelastica mascota', price: 27990, original_price: 0, free_shipping: true, fast_delivery: true, state: 'CABA', search: 'cama colchon viscoelastica mascota' },
    { id: 'fb-d-3', title: 'Rascador para gato con cueva', price: 34990, original_price: 39990, free_shipping: false, fast_delivery: false, state: 'Cordoba', search: 'rascador gato con cueva' },
    { id: 'fb-d-4', title: 'Juguete interactivo inteligente', price: 12490, original_price: 14990, free_shipping: false, fast_delivery: true, state: 'Mendoza', search: 'juguete interactivo mascota' },
  ],
};

function toBool(value) {
  return value === 'true' || value === '1' || value === 'yes';
}

function firstQuery(value, fallback = '') {
  if (Array.isArray(value)) {
    return String(value[0] ?? fallback);
  }
  if (value === undefined || value === null) {
    return fallback;
  }
  return String(value);
}

function normalizeGroup(raw) {
  return GROUP_KEYS.has(raw) ? raw : 'alimentos';
}

function createAffiliateLink(affiliateId, redirectUrl) {
  return `https://click.mercadolibre.com/tracking/click?id=${encodeURIComponent(affiliateId)}&redirect=${encodeURIComponent(redirectUrl)}`;
}

function applyFiltersAndSort(items, shipping, delivery, sort) {
  let filtered = [...items];

  if (shipping) {
    filtered = filtered.filter((item) => item.free_shipping);
  }

  if (delivery) {
    filtered = filtered.filter((item) => item.fast_delivery);
  }

  if (sort === 'price_asc') {
    filtered.sort((a, b) => a.price - b.price);
  } else if (sort === 'price_desc') {
    filtered.sort((a, b) => b.price - a.price);
  }

  return filtered;
}

function fallbackProducts(group, affiliateId, shipping, delivery, sort) {
  const base = FALLBACK_CATALOG[group] || FALLBACK_CATALOG.alimentos;
  const mapped = base.map((product) => {
    const listingUrl = `https://listado.mercadolibre.com.ar/${encodeURIComponent(product.search).replace(/%20/g, '-')}`;
    const discount = product.original_price > 0
      ? Math.max(0, Math.round(((product.original_price - product.price) / product.original_price) * 100))
      : 0;

    return {
      id: product.id,
      title: product.title,
      price: product.price,
      original_price: product.original_price || null,
      discount,
      thumbnail: PLACEHOLDER_IMAGE,
      link: createAffiliateLink(affiliateId, listingUrl),
      free_shipping: product.free_shipping,
      fast_delivery: product.fast_delivery,
      state: product.state,
      seller_loc: null,
    };
  });

  return applyFiltersAndSort(mapped, shipping, delivery, sort);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const grupo = normalizeGroup(firstQuery(req.query.grupo, 'alimentos'));
    const sort = firstQuery(req.query.sort, '');
    const shipping = toBool(firstQuery(req.query.shipping, 'false'));
    const delivery = toBool(firstQuery(req.query.delivery, 'false'));
    const lat = firstQuery(req.query.lat, '');
    const region = firstQuery(req.query.region, '');

    const affiliateId = process.env.ML_AFFILIATE_ID || 'aipetfriendly';
    const mlAccessToken = process.env.ML_ACCESS_TOKEN || '';
    const query = GROUP_QUERIES[grupo] || 'alimento mascotas';

    const meliUrl = new URL('https://api.mercadolibre.com/sites/MLA/search');
    meliUrl.searchParams.set('q', query);
    meliUrl.searchParams.set('limit', '20');

    if (sort === 'price_asc' || sort === 'price_desc') {
      meliUrl.searchParams.set('sort', sort);
    }

    // Filtro por region si el frontend no tiene coordenadas activas.
    if (region && !lat) {
      meliUrl.searchParams.set('state', region);
    }

    const response = await fetch(meliUrl.toString(), {
      headers: {
        'User-Agent': 'AiPetFriendly/1.0 (+https://www.aipetfriendly.ar)',
        Accept: 'application/json',
        ...(mlAccessToken ? { Authorization: `Bearer ${mlAccessToken}` } : {}),
      },
    });

    if (!response.ok) {
      const text = await response.text();

      if (response.status === 401 || response.status === 403 || response.status >= 500) {
        const fallback = fallbackProducts(grupo, affiliateId, shipping, delivery, sort);
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
        res.setHeader('X-Products-Source', 'fallback');
        res.setHeader('X-ML-Status', String(response.status));
        return res.status(200).json({
          products: fallback,
          source: 'fallback',
          warning: 'Mercado Libre API temporalmente no disponible, se muestran sugerencias afiliadas.',
          details: text.slice(0, 200),
        });
      }

      return res.status(502).json({ error: 'Mercado Libre API error', details: text.slice(0, 200) });
    }

    const data = await response.json();
    const products = Array.isArray(data?.results) ? data.results : [];

    const mapped = products.map((product) => {
      const urlOriginal = product?.permalink || '';
      const linkAfiliado = createAffiliateLink(affiliateId, urlOriginal);

      const shippingInfo = product?.shipping || {};
      const logisticType = String(shippingInfo?.logistic_type || '').toLowerCase();
      const fastDelivery = logisticType === 'fulfillment' || logisticType === 'cross_docking';

      const originalPrice = Number(product?.original_price || 0);
      const price = Number(product?.price || 0);
      const discount = originalPrice > 0 && price > 0
        ? Math.max(0, Math.round(((originalPrice - price) / originalPrice) * 100))
        : 0;

      const thumbnail = String(product?.thumbnail || '');

      return {
        id: String(product?.id || ''),
        title: String(product?.title || 'Producto sin titulo'),
        price,
        original_price: originalPrice || null,
        discount,
        thumbnail: thumbnail.replace('-I.jpg', '-O.jpg'),
        link: linkAfiliado,
        free_shipping: Boolean(shippingInfo?.free_shipping),
        fast_delivery: fastDelivery,
        state: String(product?.address?.state_name || ''),
        seller_loc: product?.seller_address?.location || null,
      };
    });

      const filtered = applyFiltersAndSort(mapped, shipping, delivery, sort);

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.setHeader('X-Products-Source', 'api');
      return res.status(200).json({ products: filtered, source: 'api' });
  } catch (error) {
    return res.status(500).json({
      error: 'Error al conectar con Mercado Libre',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
