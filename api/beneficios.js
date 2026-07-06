const GROUP_QUERIES = {
  alimentos: 'alimento mascotas',
  accesorios: 'correa collar pretal mascotas',
  higiene: 'shampoo pipeta mascotas',
  descanso: 'cucha rascador juguetes mascotas',
};

const GROUP_KEYS = new Set(Object.keys(GROUP_QUERIES));

const PLACEHOLDER_IMAGE = 'https://placehold.co/300x300/f1f5f9/475569?text=AiPetFriendly';

const FALLBACK_CATALOG = {
  alimentos: [
    { id: 'fb-a-1', title: 'Alimento balanceado perro adulto 20kg', price: 28990, original_price: 32990, free_shipping: true, fast_delivery: true, state: 'Buenos Aires', search: 'alimento balanceado perro adulto 20kg', thumbnail: 'https://images.unsplash.com/photo-1583511655826-05700442b31b?auto=format&fit=crop&w=400&q=80' },
    { id: 'fb-a-2', title: 'Alimento balanceado gato adulto 15kg', price: 31200, original_price: 0, free_shipping: true, fast_delivery: false, state: 'Cordoba', search: 'alimento balanceado gato adulto 15kg', thumbnail: 'https://images.unsplash.com/photo-1511044568932-338cba0ad803?auto=format&fit=crop&w=400&q=80' },
    { id: 'fb-a-3', title: 'Snack premium para perro x 1kg', price: 8990, original_price: 10990, free_shipping: false, fast_delivery: true, state: 'Santa Fe', search: 'snack premium perro 1kg', thumbnail: 'https://images.unsplash.com/photo-1601758174114-e711c0cbaa69?auto=format&fit=crop&w=400&q=80' },
    { id: 'fb-a-4', title: 'Comida humeda para gato pack x 24', price: 21990, original_price: 24990, free_shipping: true, fast_delivery: false, state: 'Mendoza', search: 'comida humeda gato pack 24', thumbnail: 'https://images.unsplash.com/photo-1592194996308-7b43878e84a6?auto=format&fit=crop&w=400&q=80' },
  ],
  accesorios: [
    { id: 'fb-b-1', title: 'Correa reforzada antitirones para perro', price: 15490, original_price: 18990, free_shipping: true, fast_delivery: true, state: 'Buenos Aires', search: 'correa antitirones perro', thumbnail: 'https://images.unsplash.com/photo-1529429617124-aee7112e5f2f?auto=format&fit=crop&w=400&q=80' },
    { id: 'fb-b-2', title: 'Pretal acolchado ajustable', price: 12890, original_price: 0, free_shipping: false, fast_delivery: true, state: 'CABA', search: 'pretal acolchado ajustable perro', thumbnail: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=400&q=80' },
    { id: 'fb-b-3', title: 'Bolso transportador mascota mediana', price: 38990, original_price: 42990, free_shipping: true, fast_delivery: false, state: 'Cordoba', search: 'bolso transportador mascota mediana', thumbnail: 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=400&q=80' },
    { id: 'fb-b-4', title: 'Bebedero portatil para paseo', price: 6990, original_price: 0, free_shipping: false, fast_delivery: true, state: 'Rosario', search: 'bebedero portatil perro paseo', thumbnail: 'https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=400&q=80' },
  ],
  higiene: [
    { id: 'fb-c-1', title: 'Shampoo hipoalergenico para mascotas', price: 8990, original_price: 10990, free_shipping: true, fast_delivery: true, state: 'Buenos Aires', search: 'shampoo hipoalergenico mascotas', thumbnail: 'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=400&q=80' },
    { id: 'fb-c-2', title: 'Pipeta antipulgas perro mediano', price: 13990, original_price: 15990, free_shipping: false, fast_delivery: true, state: 'CABA', search: 'pipeta antipulgas perro mediano', thumbnail: 'https://images.unsplash.com/photo-1581888227599-779811939961?auto=format&fit=crop&w=400&q=80' },
    { id: 'fb-c-3', title: 'Arena sanitaria aglutinante 10kg', price: 11890, original_price: 0, free_shipping: true, fast_delivery: false, state: 'Cordoba', search: 'arena sanitaria aglutinante 10kg', thumbnail: 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?auto=format&fit=crop&w=400&q=80' },
    { id: 'fb-c-4', title: 'Kit cepillo + guante de limpieza', price: 7590, original_price: 0, free_shipping: false, fast_delivery: true, state: 'Santa Fe', search: 'kit cepillo guante mascotas', thumbnail: 'https://images.unsplash.com/photo-1548767797-d8c844163c4c?auto=format&fit=crop&w=400&q=80' },
  ],
  descanso: [
    { id: 'fb-d-1', title: 'Cucha termica impermeable', price: 45990, original_price: 51990, free_shipping: true, fast_delivery: false, state: 'Buenos Aires', search: 'cucha termica impermeable perro', thumbnail: 'https://images.unsplash.com/photo-1450778869180-41d0601e046e?auto=format&fit=crop&w=400&q=80' },
    { id: 'fb-d-2', title: 'Cama colchon viscoelastica mascota', price: 27990, original_price: 0, free_shipping: true, fast_delivery: true, state: 'CABA', search: 'cama colchon viscoelastica mascota', thumbnail: 'https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?auto=format&fit=crop&w=400&q=80' },
    { id: 'fb-d-3', title: 'Rascador para gato con cueva', price: 34990, original_price: 39990, free_shipping: false, fast_delivery: false, state: 'Cordoba', search: 'rascador gato con cueva', thumbnail: 'https://images.unsplash.com/photo-1545249390-6bdfa286032f?auto=format&fit=crop&w=400&q=80' },
    { id: 'fb-d-4', title: 'Juguete interactivo inteligente', price: 12490, original_price: 14990, free_shipping: false, fast_delivery: true, state: 'Mendoza', search: 'juguete interactivo mascota', thumbnail: 'https://images.unsplash.com/photo-1560743173-567a3b5658b1?auto=format&fit=crop&w=400&q=80' },
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

function buildMeliSearchUrl(search) {
  const normalized = String(search || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');

  return `https://listado.mercadolibre.com.ar/${encodeURIComponent(normalized)}`;
}

function createAffiliateLink(affiliateId, redirectUrl) {
  const template = process.env.ML_AFFILIATE_TEMPLATE || '';

  const appendSafeTrackingParams = (baseUrl, sourceTemplate) => {
    try {
      const templateUrl = new URL(sourceTemplate);
      const destination = new URL(baseUrl);
      const allowedParams = new Set(['matt_tool']);

      // `matt_word` can force Mercado Libre to open a generic search instead of
      // the exact item permalink, so we explicitly remove it from destination links.
      destination.searchParams.delete('matt_word');

      for (const [key, value] of templateUrl.searchParams.entries()) {
        if (!value || !allowedParams.has(key)) {
          continue;
        }
        if (!destination.searchParams.has(key)) {
          destination.searchParams.set(key, value);
        }
      }

      return destination.toString();
    } catch {
      return baseUrl;
    }
  };

  if (template.includes('{url}')) {
    const candidate = template
      .replaceAll('{id}', encodeURIComponent(affiliateId))
      .replaceAll('{url}', encodeURIComponent(redirectUrl));

    // Prevent known broken domain from producing dead outbound links.
    if (candidate.includes('click.mercadolibre.com/') || candidate.includes('/social/')) {
      return appendSafeTrackingParams(redirectUrl, template);
    }

    return candidate;
  }

  // Some ML affiliate links are profile/social URLs without {url}. In that case,
  // copy their tracking query params into the real product URL.
  if (template.startsWith('http://') || template.startsWith('https://')) {
    return appendSafeTrackingParams(redirectUrl, template);
  }

  return redirectUrl;
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

async function mlFetch(url, mlAccessToken, extraHeaders = {}) {
  const headersWithToken = {
    Accept: 'application/json',
    ...extraHeaders,
    ...(mlAccessToken ? { Authorization: `Bearer ${mlAccessToken}` } : {}),
  };

  const firstResponse = await fetch(url, { headers: headersWithToken });
  if ((firstResponse.status === 401 || firstResponse.status === 403) && mlAccessToken) {
    const headersWithoutToken = {
      Accept: 'application/json',
      ...extraHeaders,
    };
    return fetch(url, { headers: headersWithoutToken });
  }

  return firstResponse;
}

async function resolvePermalinkFromApi(search, mlAccessToken) {
  try {
    const url = new URL('https://api.mercadolibre.com/sites/MLA/search');
    url.searchParams.set('q', search);
    url.searchParams.set('limit', '1');

    const response = await mlFetch(url.toString(), mlAccessToken);

    if (!response.ok) {
      return '';
    }

    const data = await response.json();
    const first = Array.isArray(data?.results) ? data.results[0] : null;
    return String(first?.permalink || '');
  } catch {
    return '';
  }
}

async function resolvePermalinkByItemId(itemId, mlAccessToken) {
  const normalizedId = String(itemId || '').trim();
  if (!normalizedId) {
    return '';
  }

  try {
    const response = await mlFetch(`https://api.mercadolibre.com/items/${encodeURIComponent(normalizedId)}`, mlAccessToken);

    if (!response.ok) {
      return '';
    }

    const data = await response.json();
    return String(data?.permalink || '');
  } catch {
    return '';
  }
}

async function fallbackProducts(group, affiliateId, shipping, delivery, sort, mlAccessToken) {
  const base = FALLBACK_CATALOG[group] || FALLBACK_CATALOG.alimentos;

  const resolvedPermalinks = await Promise.all(
    base.map((product) => resolvePermalinkFromApi(product.search, mlAccessToken)),
  );

  const mapped = base.map((product, index) => {
    const listingUrl = buildMeliSearchUrl(product.search);
    const directUrl = resolvedPermalinks[index] || listingUrl;
    const discount = product.original_price > 0
      ? Math.max(0, Math.round(((product.original_price - product.price) / product.original_price) * 100))
      : 0;

    return {
      id: product.id,
      title: product.title,
      price: product.price,
      original_price: product.original_price || null,
      discount,
      thumbnail: product.thumbnail || PLACEHOLDER_IMAGE,
      link: createAffiliateLink(affiliateId, directUrl),
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

    const response = await mlFetch(meliUrl.toString(), mlAccessToken, {
      'User-Agent': 'AiPetFriendly/1.0 (+https://www.aipetfriendly.ar)',
    });

    if (!response.ok) {
      const text = await response.text();

      if (response.status === 401 || response.status === 403 || response.status >= 500) {
        const fallback = await fallbackProducts(grupo, affiliateId, shipping, delivery, sort, mlAccessToken);
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

    const mapped = await Promise.all(products.map(async (product) => {
      const itemId = String(product?.id || '').trim();
      const urlOriginal = product?.permalink || '';
      const permalinkById = !urlOriginal && itemId
        ? await resolvePermalinkByItemId(itemId, mlAccessToken)
        : '';
      const fallbackSearchUrl = buildMeliSearchUrl(product?.title || query);
      const destinationUrl = urlOriginal || permalinkById || fallbackSearchUrl;
      const linkAfiliado = createAffiliateLink(affiliateId, destinationUrl);

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
        id: itemId,
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
    }));

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
