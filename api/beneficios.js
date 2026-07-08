const ML_PETS_CATEGORY = 'MLA1071';

const GROUP_QUERIES = {
  alimentos: 'alimento',
  accesorios: 'paseo correa pretal collar',
  higiene: 'shampoo higienico piedras bano',
  descanso: 'juguete rascador cama colchoneta',
};

const GROUP_KEYS = new Set(Object.keys(GROUP_QUERIES));
const BENEFITS_DEBUG = String(process.env.BENEFITS_DEBUG || '').toLowerCase() === 'true';

const PLACEHOLDER_IMAGE = 'https://placehold.co/300x300/f1f5f9/475569?text=AiPetFriendly';

const FALLBACK_CATALOG = {
  alimentos: [
    { id: 'fb-a-1', title: 'Alimento balanceado perro adulto 20kg', free_shipping: true, fast_delivery: true, state: 'Buenos Aires', search: 'alimento balanceado perro adulto 20kg', thumbnail: 'https://images.unsplash.com/photo-1583511655826-05700442b31b?auto=format&fit=crop&w=400&q=80' },
    { id: 'fb-a-2', title: 'Alimento balanceado gato adulto 15kg', free_shipping: true, fast_delivery: false, state: 'Cordoba', search: 'alimento balanceado gato adulto 15kg', thumbnail: 'https://images.unsplash.com/photo-1511044568932-338cba0ad803?auto=format&fit=crop&w=400&q=80' },
    { id: 'fb-a-3', title: 'Snack premium para perro x 1kg', free_shipping: false, fast_delivery: true, state: 'Santa Fe', search: 'snack premium perro 1kg', thumbnail: 'https://images.unsplash.com/photo-1601758174114-e711c0cbaa69?auto=format&fit=crop&w=400&q=80' },
    { id: 'fb-a-4', title: 'Comida humeda para gato pack x 24', free_shipping: true, fast_delivery: false, state: 'Mendoza', search: 'comida humeda gato pack x24', thumbnail: 'https://images.unsplash.com/photo-1592194996308-7b43878e84a6?auto=format&fit=crop&w=400&q=80' },
  ],
  accesorios: [
    { id: 'fb-b-1', title: 'Correa reforzada antitirones para perro', free_shipping: true, fast_delivery: true, state: 'Buenos Aires', search: 'correa antitirones perro', thumbnail: 'https://images.unsplash.com/photo-1529429617124-aee7112e5f2f?auto=format&fit=crop&w=400&q=80' },
    { id: 'fb-b-2', title: 'Pretal acolchado ajustable para perro', free_shipping: false, fast_delivery: true, state: 'CABA', search: 'pretal acolchado ajustable perro', thumbnail: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=400&q=80' },
    { id: 'fb-b-3', title: 'Bolso transportador mascota mediana', free_shipping: true, fast_delivery: false, state: 'Cordoba', search: 'bolso transportador mascota mediana', thumbnail: 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=400&q=80' },
    { id: 'fb-b-4', title: 'Bebedero portatil para mascotas en paseo', free_shipping: false, fast_delivery: true, state: 'Rosario', search: 'bebedero portatil perro paseo', thumbnail: 'https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=400&q=80' },
  ],
  higiene: [
    { id: 'fb-c-1', title: 'Shampoo hipoalergenico para mascotas', free_shipping: true, fast_delivery: true, state: 'Buenos Aires', search: 'shampoo hipoalergenico mascotas', thumbnail: 'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=400&q=80' },
    { id: 'fb-c-2', title: 'Pipeta antipulgas perro mediano', free_shipping: false, fast_delivery: true, state: 'CABA', search: 'pipeta antipulgas perro mediano', thumbnail: 'https://images.unsplash.com/photo-1581888227599-779811939961?auto=format&fit=crop&w=400&q=80' },
    { id: 'fb-c-3', title: 'Arena sanitaria aglutinante 10kg', free_shipping: true, fast_delivery: false, state: 'Cordoba', search: 'arena sanitaria aglutinante 10kg', thumbnail: 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?auto=format&fit=crop&w=400&q=80' },
    { id: 'fb-c-4', title: 'Kit cepillo y guante de limpieza mascotas', free_shipping: false, fast_delivery: true, state: 'Santa Fe', search: 'kit cepillo guante mascotas', thumbnail: 'https://images.unsplash.com/photo-1548767797-d8c844163c4c?auto=format&fit=crop&w=400&q=80' },
  ],
  descanso: [
    { id: 'fb-d-1', title: 'Cucha termica impermeable para perro', free_shipping: true, fast_delivery: false, state: 'Buenos Aires', search: 'cucha termica impermeable perro', thumbnail: 'https://images.unsplash.com/photo-1450778869180-41d0601e046e?auto=format&fit=crop&w=400&q=80' },
    { id: 'fb-d-2', title: 'Cama ortopedica lavable para mascotas', free_shipping: true, fast_delivery: true, state: 'CABA', search: 'cama ortopedica lavable mascotas', thumbnail: 'https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?auto=format&fit=crop&w=400&q=80' },
    { id: 'fb-d-3', title: 'Rascador para gato con cueva', free_shipping: false, fast_delivery: false, state: 'Cordoba', search: 'rascador gato con cueva', thumbnail: 'https://images.unsplash.com/photo-1545249390-6bdfa286032f?auto=format&fit=crop&w=400&q=80' },
    { id: 'fb-d-4', title: 'Juguete interactivo para mascotas', free_shipping: false, fast_delivery: true, state: 'Mendoza', search: 'juguete interactivo mascota', thumbnail: 'https://images.unsplash.com/photo-1560743173-567a3b5658b1?auto=format&fit=crop&w=400&q=80' },
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

function buildCanonicalItemUrl(itemId) {
  const raw = String(itemId || '').trim().toUpperCase();
  const match = raw.match(/^MLA-?(\d+)$/);
  if (!match) {
    return '';
  }
  return `https://articulo.mercadolibre.com.ar/MLA-${match[1]}`;
}

function extractMlaId(value) {
  const raw = String(value || '').toUpperCase();
  const match = raw.match(/MLA-?(\d{6,})/);
  if (!match) {
    return '';
  }

  return `MLA-${match[1]}`;
}

function slugifyTitle(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function buildForcedArticleUrl(itemId, title) {
  const normalizedItemId = extractMlaId(itemId);
  const canonical = buildCanonicalItemUrl(normalizedItemId);
  if (!canonical) {
    return '';
  }

  const slug = slugifyTitle(title);
  if (!slug) {
    return canonical;
  }

  return `${canonical}-${slug}-_JM`;
}

function sanitizeMercadoLibreProductUrl(urlOriginal, fallbackItemId, fallbackTitle) {
  const fromUrl = extractMlaId(urlOriginal);
  const fromFallback = extractMlaId(fallbackItemId);
  const resolvedItemId = fromUrl || fromFallback;

  if (!resolvedItemId) {
    return '';
  }

  return buildForcedArticleUrl(resolvedItemId, fallbackTitle || 'producto');
}

function isSpecificProductUrl(url) {
  const value = String(url || '').trim();
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname;

    if (!host.includes('mercadolibre.com.ar')) {
      return false;
    }

    return /MLA-?\d{7,}/i.test(path) || /\/p\/MLA\d{7,}/i.test(path);
  } catch {
    return /mercadolibre\.com\.ar\/.+MLA-?\d{7,}/i.test(value);
  }
}

function pickSpecificProductUrl(...candidates) {
  for (const candidate of candidates) {
    if (isSpecificProductUrl(candidate)) {
      return String(candidate);
    }
  }

  return '';
}

// Extrae el valor de matt_tool de ML_AFFILIATE_TEMPLATE o ML_AFFILIATE_ID.
// El link correcto de afiliado es simplemente: permalink?matt_tool=ID
function getMattToolId() {
  const template = process.env.ML_AFFILIATE_TEMPLATE || '';
  if (template) {
    // Intentar extraerlo de la URL del template (ej: ...&matt_tool=46442169&...)
    try {
      const url = new URL(template);
      const v = url.searchParams.get('matt_tool');
      if (v) return v;
    } catch {
      const m = template.match(/[?&]matt_tool=([^&\s]+)/);
      if (m) return m[1];
    }
  }
  return process.env.ML_AFFILIATE_ID || '';
}

// Agrega ?matt_tool=ID directamente al permalink del producto.
// Formato correcto para afiliados ML: https://articulo.mercadolibre.com.ar/MLA-xxx?matt_tool=ID
function createAffiliateLink(productUrl) {
  if (!productUrl) return productUrl;
  const mattToolId = getMattToolId();
  if (!mattToolId) return productUrl;
  try {
    const url = new URL(productUrl);
    url.searchParams.set('matt_tool', mattToolId);
    return url.toString();
  } catch {
    const sep = productUrl.includes('?') ? '&' : '?';
    return `${productUrl}${sep}matt_tool=${encodeURIComponent(mattToolId)}`;
  }
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

const ML_DEFAULT_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'AiPetFriendly/1.0 (+https://www.aipetfriendly.ar)',
};

async function mlFetch(url, mlAccessToken, extraHeaders = {}) {
  const headersWithToken = {
    ...ML_DEFAULT_HEADERS,
    ...extraHeaders,
    ...(mlAccessToken ? { Authorization: `Bearer ${mlAccessToken}` } : {}),
  };

  const firstResponse = await fetch(url, { headers: headersWithToken });
  if ((firstResponse.status === 401 || firstResponse.status === 403) && mlAccessToken) {
    const headersWithoutToken = {
      ...ML_DEFAULT_HEADERS,
      ...extraHeaders,
    };
    return fetch(url, { headers: headersWithoutToken });
  }

  return firstResponse;
}

// ── Token auto-refresh ────────────────────────────────────────────────────────
// ML API requiere OAuth. Si el usuario configura ML_APP_ID + ML_APP_SECRET en
// Vercel, este modulo obtiene y cachea el token automaticamente.
// El token dura 6h; se renueva antes de que expire en cada cold-start.
let _cachedToken = { token: '', expiresAt: 0 };

async function getFreshMlToken() {
  const appId = process.env.ML_APP_ID || '';
  const appSecret = process.env.ML_APP_SECRET || '';
  const staticToken = process.env.ML_ACCESS_TOKEN || '';

  // Si hay un token estatico configurado y sin credenciales de app, usarlo.
  if (staticToken && !appId) return staticToken;

  // Si no hay credenciales de app, devolver vacio (llamadas sin auth).
  if (!appId || !appSecret) return staticToken;

  // Reusar token cacheado si aun es valido (con 60s de margen).
  if (_cachedToken.token && Date.now() < _cachedToken.expiresAt - 60_000) {
    return _cachedToken.token;
  }

  try {
    const res = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: appId,
        client_secret: appSecret,
      }).toString(),
    });

    if (!res.ok) return staticToken;

    const data = await res.json();
    _cachedToken = {
      token: String(data.access_token || ''),
      expiresAt: Date.now() + Number(data.expires_in || 21600) * 1000,
    };
    return _cachedToken.token;
  } catch {
    return staticToken;
  }
}

async function resolvePermalinkFromApi(search, mlAccessToken) {
  try {
    const url = new URL('https://api.mercadolibre.com/sites/MLA/search');
    url.searchParams.set('category', ML_PETS_CATEGORY);
    url.searchParams.set('q', search);
    url.searchParams.set('limit', '1');
    url.searchParams.set('sort', 'sold_quantity_desc');

    const response = await mlFetch(url.toString(), mlAccessToken);

    if (!response.ok) {
      return resolvePermalinkFromDuckDuckGo(search);
    }

    const data = await response.json();
    const first = Array.isArray(data?.results) ? data.results[0] : null;
    const permalink = String(first?.permalink || '');
    if (permalink) {
      return permalink;
    }

    const itemId = String(first?.id || '').trim();
    if (!itemId) {
      return '';
    }

    const permalinkById = await resolvePermalinkByItemId(itemId, mlAccessToken);
    if (permalinkById) {
      return permalinkById;
    }

    return buildCanonicalItemUrl(itemId);
  } catch {
    return resolvePermalinkFromDuckDuckGo(search);
  }
}

async function resolvePermalinkFromDuckDuckGo(search) {
  const candidateQueries = [
    `site:articulo.mercadolibre.com.ar ${search}`,
    `${search} articulo mercadolibre`,
    `${search} mercadolibre MLA`,
  ];

  for (const query of candidateQueries) {
    try {
      const url = new URL('https://duckduckgo.com/html/');
      url.searchParams.set('q', query);

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AiPetFriendlyBot/1.0; +https://www.aipetfriendly.ar)',
          Accept: 'text/html',
        },
      });

      if (!response.ok) {
        continue;
      }

      const html = await response.text();
      const uddgMatches = Array.from(html.matchAll(/uddg=([^&"']+)/gi));
      for (const match of uddgMatches) {
        const decoded = decodeURIComponent(match[1]);
        if (isSpecificProductUrl(decoded)) {
          return decoded;
        }
      }

      const directMatch = html.match(/https:\/\/articulo\.mercadolibre\.com\.ar\/MLA-\d+[^"'\s]*/i);
      if (directMatch?.[0] && isSpecificProductUrl(directMatch[0])) {
        return directMatch[0];
      }
    } catch {
      // continue with next query
    }
  }

  return resolvePermalinkFromHtmlSearch(search);
}

async function resolvePermalinkFromHtmlSearch(search) {
  try {
    const searchUrl = buildMeliSearchUrl(search);
    const response = await fetch(searchUrl, { headers: ML_DEFAULT_HEADERS });

    if (!response.ok) {
      return '';
    }

    const html = await response.text();
    const directMatch = html.match(/https:\/\/articulo\.mercadolibre\.com\.ar\/MLA-\d+[^"'\s]*/i);
    if (directMatch && directMatch[0]) {
      return directMatch[0];
    }

    const hrefPathMatch = html.match(/href=["'](\/MLA-\d+[^"']*)["']/i);
    if (hrefPathMatch && hrefPathMatch[1]) {
      const path = hrefPathMatch[1].startsWith('/') ? hrefPathMatch[1] : `/${hrefPathMatch[1]}`;
      return `https://articulo.mercadolibre.com.ar${path}`;
    }

    const dataIdMatch = html.match(/(?:data-item-id|"id")\s*[:=]\s*["'](MLA-?\d{7,})["']/i);
    if (dataIdMatch && dataIdMatch[1]) {
      return buildCanonicalItemUrl(dataIdMatch[1]);
    }

    const idMatch = html.match(/MLA-?\d{7,}/i);
    if (idMatch && idMatch[0]) {
      return buildCanonicalItemUrl(idMatch[0]);
    }

    return '';
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

async function resolveProductDataFromApi(search, mlAccessToken) {
  try {
    const url = new URL('https://api.mercadolibre.com/sites/MLA/search');
    url.searchParams.set('category', ML_PETS_CATEGORY);
    url.searchParams.set('q', search);
    url.searchParams.set('limit', '1');
    url.searchParams.set('sort', 'sold_quantity_desc');

    const response = await mlFetch(url.toString(), mlAccessToken);
    if (!response.ok) return { permalink: '', price: null, thumbnail: '', state: '' };

    const data = await response.json();
    const first = Array.isArray(data?.results) ? data.results[0] : null;
    if (!first) return { permalink: '', price: null, thumbnail: '', state: '' };

    const permalink = String(first?.permalink || '');
    const price = Number(first?.price) > 0 ? Number(first.price) : null;
    const thumbnail = String(first?.thumbnail || '').replace('-I.jpg', '-O.jpg');
    const state = String(first?.address?.state_name || '');
    return { permalink, price, thumbnail, state };
  } catch {
    return { permalink: '', price: null, thumbnail: '', state: '' };
  }
}

async function fallbackProducts(group, shipping, delivery, sort, mlAccessToken) {
  const base = FALLBACK_CATALOG[group] || FALLBACK_CATALOG.alimentos;

  // Resolve real permalink AND price for each fallback item via ML API search.
  const resolvedData = await Promise.all(
    base.map((product) => resolveProductDataFromApi(product.search, mlAccessToken)),
  );

  const mapped = base.map((product, index) => {
    const { permalink, price: resolvedPrice, thumbnail: resolvedThumb, state: resolvedState } = resolvedData[index];

    let destinationUrl = '';

    // Si la API devolvio un permalink valido de articulo, lo usamos.
    if (permalink && isSpecificProductUrl(permalink)) {
      destinationUrl = permalink;
    } else {
      // Intentar construir URL de articulo con el ID del catalogo (requiere ID MLA real).
      destinationUrl = buildForcedArticleUrl(product.id, product.title);
    }

    // Si aun no hay URL de producto especifica, usar URL de busqueda como ultimo recurso.
    // Es mejor mostrar el producto aunque llegue al listado que no mostrar nada.
    if (!destinationUrl) {
      destinationUrl = buildMeliSearchUrl(product.search);
    }

    const linkSource = isSpecificProductUrl(destinationUrl)
      ? (permalink && isSpecificProductUrl(permalink) ? 'resolved_permalink' : 'forced_article_fallback')
      : 'search_fallback';
    const price = resolvedPrice ?? product.price ?? null;
    const affiliateLink = createAffiliateLink(destinationUrl);
    const discount = (price && product.original_price > 0)
      ? Math.max(0, Math.round(((product.original_price - price) / product.original_price) * 100))
      : 0;

    const payload = {
      id: product.id,
      title: product.title,
      price,
      original_price: product.original_price || null,
      discount,
      thumbnail: resolvedThumb || product.thumbnail || PLACEHOLDER_IMAGE,
      link: affiliateLink,
      free_shipping: product.free_shipping,
      fast_delivery: product.fast_delivery,
      state: resolvedState || product.state,
    };

    if (BENEFITS_DEBUG) {
      payload.link_source = linkSource;
      payload.destination_url = destinationUrl;
      payload.affiliate_url = affiliateLink;
    }

    return payload;
  });

  return applyFiltersAndSort(mapped.filter(Boolean), shipping, delivery, sort);
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

    const mlAccessToken = await getFreshMlToken();
    const query = GROUP_QUERIES[grupo] || 'alimento mascotas';

    // Construir y ejecutar la query a ML API con reintentos de sort.
    // sort=sold_quantity_desc es el parametro documentado para mas vendidos.
    // Si el usuario eligio precio, se usa ese sort; sino intentamos sold_quantity_desc
    // y si falla (ej. parametro invalido) reintentamos sin sort para garantizar resultados.
    const buildMeliUrl = (sortParam) => {
      const u = new URL('https://api.mercadolibre.com/sites/MLA/search');
      u.searchParams.set('category', ML_PETS_CATEGORY);
      u.searchParams.set('q', query);
      u.searchParams.set('limit', '10');
      if (sortParam) u.searchParams.set('sort', sortParam);
      if (region && !lat) u.searchParams.set('state', region);
      return u.toString();
    };

    const primarySort = (sort === 'price_asc' || sort === 'price_desc') ? sort : 'sold_quantity_desc';
    let response = await mlFetch(buildMeliUrl(primarySort), mlAccessToken);

    // Si el sort da error (400/422), reintentamos sin sort
    if (!response.ok && response.status >= 400 && response.status < 500) {
      response = await mlFetch(buildMeliUrl(null), mlAccessToken);
    }

    if (!response.ok) {
      const text = await response.text();
      const fallback = await fallbackProducts(grupo, shipping, delivery, sort, mlAccessToken);
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
      res.setHeader('X-Products-Source', 'fallback');
      res.setHeader('X-ML-Status', String(response.status));
      return res.status(200).json({
        products: fallback,
        source: 'fallback',
        mattTool: getMattToolId(),
        warning: 'Mercado Libre API temporalmente no disponible, se muestran sugerencias afiliadas.',
        details: text.slice(0, 200),
      });
    }

    const data = await response.json();
    const products = Array.isArray(data?.results) ? data.results : [];

    if (products.length === 0) {
      const fallback = await fallbackProducts(grupo, shipping, delivery, sort, mlAccessToken);
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
      res.setHeader('X-Products-Source', 'fallback-empty');
      return res.status(200).json({
        products: fallback,
        source: 'fallback',
        mattTool: getMattToolId(),
        warning: 'Mercado Libre devolvio 0 resultados; se muestran sugerencias afiliadas.',
      });
    }

    const mappedRaw = products.map((product) => {
      // El permalink que devuelve ML apunta exactamente al producto individual.
      const permalink = String(product?.permalink || '').trim();
      const itemId = String(product?.id || '').trim();
      const destinationUrl = permalink || buildCanonicalItemUrl(itemId);

      if (!destinationUrl) return null;

      const linkAfiliado = createAffiliateLink(destinationUrl);

      const shippingInfo = product?.shipping || {};
      const logisticType = String(shippingInfo?.logistic_type || '').toLowerCase();
      const fastDelivery = logisticType === 'fulfillment' || logisticType === 'cross_docking';

      const originalPrice = Number(product?.original_price || 0);
      const price = Number(product?.price || 0) || null;
      const discount = originalPrice > 0 && price > 0
        ? Math.max(0, Math.round(((originalPrice - price) / originalPrice) * 100))
        : 0;

      const payload = {
        id: itemId,
        title: String(product?.title || 'Producto sin titulo'),
        price,
        original_price: originalPrice || null,
        discount,
        thumbnail: String(product?.thumbnail || '').replace('-I.jpg', '-O.jpg') || PLACEHOLDER_IMAGE,
        link: linkAfiliado,
        free_shipping: Boolean(shippingInfo?.free_shipping),
        fast_delivery: fastDelivery,
        state: String(product?.address?.state_name || ''),
      };

      if (BENEFITS_DEBUG) {
        payload.link_source = 'api_permalink';
        payload.destination_url = destinationUrl;
        payload.affiliate_url = linkAfiliado;
      }

      return payload;
    });

    const mapped = mappedRaw.filter(Boolean).slice(0, 10);

    const filtered = applyFiltersAndSort(mapped, shipping, delivery, sort);

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.setHeader('X-Products-Source', 'api');
    return res.status(200).json({ products: filtered, source: 'api', mattTool: getMattToolId(), debug: BENEFITS_DEBUG });
  } catch (error) {
    return res.status(500).json({
      error: 'Error al conectar con Mercado Libre',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
