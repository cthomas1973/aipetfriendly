// beneficios.js
// Si ML_REFRESH_TOKEN esta configurado en Vercel, usa el flujo OAuth
// authorization_code para obtener access_token y consultar productos reales.
// Sin refresh_token, sirve el catalogo curado con links de listado ML.

import {
  buildAffiliateSearchUrl,
  buildAffiliateUrl,
  resolveAffiliateTracking,
} from '../supabase/functions/_shared/affiliateLink.mjs';
import { loadShopCatalog } from './_lib/shopCatalog.mjs';
import { getMercadoLibreToken, ShopProviderError } from './_lib/mercadoLibre.mjs';
import { publicShopResearch } from '../supabase/functions/_shared/shopResearchRecord.mjs';

const GROUP_KEYS = new Set(['alimentos', 'accesorios', 'higiene', 'descanso', 'salud', 'tecnologia']);

// Catalogo curado: 10 productos por grupo con search terms alineados al titulo.
// Link final = listado.mercadolibre.com.ar/<search>?matt_tool=<ID>
const CATALOG = {
  alimentos: [
    { id: 's-a-01', title: 'Alimento Excellent Adulto Perro 21kg', search: 'excellent-adulto-perro-21kg', free_shipping: true,  fast_delivery: true,  state: 'Buenos Aires', thumbnail: 'https://images.unsplash.com/photo-1583511655826-05700442b31b?auto=format&fit=crop&w=400&q=80' },
    { id: 's-a-02', title: 'Alimento Excellent Adulto Gato 15kg', search: 'excellent-adulto-gato-15kg', free_shipping: true,  fast_delivery: false, state: 'Buenos Aires', thumbnail: 'https://images.unsplash.com/photo-1511044568932-338cba0ad803?auto=format&fit=crop&w=400&q=80' },
    { id: 's-a-03', title: 'Purina Pro Plan Adulto Perro 15kg', search: 'purina-pro-plan-adulto-perro-15kg', free_shipping: true,  fast_delivery: true,  state: 'CABA', thumbnail: 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?auto=format&fit=crop&w=400&q=80' },
    { id: 's-a-04', title: 'Royal Canin Medium Adulto Perro 15kg', search: 'royal-canin-medium-adulto-perro-15kg', free_shipping: true,  fast_delivery: false, state: 'Cordoba', thumbnail: 'https://images.unsplash.com/photo-1601758174114-e711c0cbaa69?auto=format&fit=crop&w=400&q=80' },
    { id: 's-a-05', title: 'Cat Chow Adultos Pescado y Pollo 15kg', search: 'cat-chow-adultos-pescado-pollo-15kg', free_shipping: false, fast_delivery: true,  state: 'Santa Fe', thumbnail: 'https://images.unsplash.com/photo-1592194996308-7b43878e84a6?auto=format&fit=crop&w=400&q=80' },
    { id: 's-a-06', title: 'Snack Purina Beggin Strips Perro 170g', search: 'beggin-strips-perro-170g', free_shipping: false, fast_delivery: true,  state: 'Buenos Aires', thumbnail: 'https://images.unsplash.com/photo-1601758174114-e711c0cbaa69?auto=format&fit=crop&w=400&q=80' },
    { id: 's-a-07', title: 'Acana Adulto Perro 17kg', search: 'acana-adulto-perro-17kg', free_shipping: true,  fast_delivery: false, state: 'CABA', thumbnail: 'https://images.unsplash.com/photo-1583511655826-05700442b31b?auto=format&fit=crop&w=400&q=80' },
    { id: 's-a-08', title: 'Eukanuba Adulto Raza Mediana Perro 15kg', search: 'eukanuba-adulto-raza-mediana-perro-15kg', free_shipping: true,  fast_delivery: true,  state: 'Mendoza', thumbnail: 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?auto=format&fit=crop&w=400&q=80' },
    { id: 's-a-09', title: 'Purina Gatarina Adulto Gato 10kg', search: 'gatarina-adulto-gato-10kg', free_shipping: true,  fast_delivery: false, state: 'Cordoba', thumbnail: 'https://images.unsplash.com/photo-1511044568932-338cba0ad803?auto=format&fit=crop&w=400&q=80' },
    { id: 's-a-10', title: 'Iams Adulto Perro Raza Mediana 15kg', search: 'iams-adulto-perro-raza-mediana-15kg', free_shipping: false, fast_delivery: true,  state: 'Rosario', thumbnail: 'https://images.unsplash.com/photo-1583511655826-05700442b31b?auto=format&fit=crop&w=400&q=80' },
  ],
  accesorios: [
    { id: 's-b-01', title: 'Correa Retractil Perro Grande 5m', search: 'correa-retractil-perro-grande-5m', free_shipping: true,  fast_delivery: true,  state: 'Buenos Aires', thumbnail: 'https://images.unsplash.com/photo-1529429617124-aee7112e5f2f?auto=format&fit=crop&w=400&q=80' },
    { id: 's-b-02', title: 'Arnes Antitirones Ajustable Perro', search: 'arnes-antitirones-ajustable-perro', free_shipping: true,  fast_delivery: true,  state: 'CABA', thumbnail: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=400&q=80' },
    { id: 's-b-03', title: 'Collar Ajustable con Nombre Perro', search: 'collar-ajustable-con-nombre-perro', free_shipping: true,  fast_delivery: false, state: 'Cordoba', thumbnail: 'https://images.unsplash.com/photo-1605460375648-278bcbd579a6?auto=format&fit=crop&w=400&q=80' },
    { id: 's-b-04', title: 'Transportadora Bolso Mascota Mediana', search: 'transportadora-bolso-mascota-mediana', free_shipping: false, fast_delivery: true,  state: 'Santa Fe', thumbnail: 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=400&q=80' },
    { id: 's-b-05', title: 'Bebedero Automatico Mascota 2L', search: 'bebedero-automatico-mascota-2l', free_shipping: true,  fast_delivery: false, state: 'Mendoza', thumbnail: 'https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=400&q=80' },
    { id: 's-b-06', title: 'Ropa Impermeable Perro Talle M', search: 'ropa-impermeable-perro-talle-m', free_shipping: false, fast_delivery: true,  state: 'Buenos Aires', thumbnail: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=400&q=80' },
    { id: 's-b-07', title: 'Plato Comedero Acero Inox Perro', search: 'comedero-acero-inox-perro', free_shipping: true,  fast_delivery: true,  state: 'CABA', thumbnail: 'https://images.unsplash.com/photo-1605460375648-278bcbd579a6?auto=format&fit=crop&w=400&q=80' },
    { id: 's-b-08', title: 'GPS Rastreador para Collar Mascota', search: 'gps-rastreador-collar-mascota', free_shipping: true,  fast_delivery: false, state: 'Rosario', thumbnail: 'https://images.unsplash.com/photo-1529429617124-aee7112e5f2f?auto=format&fit=crop&w=400&q=80' },
    { id: 's-b-09', title: 'Cama Portatil para Perro Plegable', search: 'cama-portatil-perro-plegable', free_shipping: false, fast_delivery: false, state: 'Cordoba', thumbnail: 'https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=400&q=80' },
    { id: 's-b-10', title: 'Guia de Adiestramiento Clicker Perro', search: 'clicker-adiestramiento-perro', free_shipping: true,  fast_delivery: true,  state: 'Buenos Aires', thumbnail: 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=400&q=80' },
  ],
  higiene: [
    { id: 's-c-01', title: 'Shampoo Hipoalergenico Perro y Gato 500ml', search: 'shampoo-hipoalergenico-perro-gato-500ml', free_shipping: true,  fast_delivery: true,  state: 'Buenos Aires', thumbnail: 'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=400&q=80' },
    { id: 's-c-02', title: 'Pipeta Antipulgas Perro Mediano x3', search: 'pipeta-antipulgas-perro-mediano-x3', free_shipping: true,  fast_delivery: true,  state: 'CABA', thumbnail: 'https://images.unsplash.com/photo-1581888227599-779811939961?auto=format&fit=crop&w=400&q=80' },
    { id: 's-c-03', title: 'Arena Sanitaria Aglutinante Gato 10kg', search: 'arena-sanitaria-aglutinante-gato-10kg', free_shipping: true,  fast_delivery: false, state: 'Cordoba', thumbnail: 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?auto=format&fit=crop&w=400&q=80' },
    { id: 's-c-04', title: 'Cortaunas Profesional Perro y Gato', search: 'cortaunas-profesional-perro-gato', free_shipping: false, fast_delivery: true,  state: 'Santa Fe', thumbnail: 'https://images.unsplash.com/photo-1548767797-d8c844163c4c?auto=format&fit=crop&w=400&q=80' },
    { id: 's-c-05', title: 'Toallitas Humedas Higienicas Mascota x100', search: 'toallitas-humedas-higienicas-mascota-x100', free_shipping: true,  fast_delivery: true,  state: 'Buenos Aires', thumbnail: 'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=400&q=80' },
    { id: 's-c-06', title: 'Cepillo Deslanador para Perro y Gato', search: 'cepillo-deslanador-perro-gato', free_shipping: false, fast_delivery: false, state: 'Mendoza', thumbnail: 'https://images.unsplash.com/photo-1548767797-d8c844163c4c?auto=format&fit=crop&w=400&q=80' },
    { id: 's-c-07', title: 'Collar Antiparasitario Seresto Perro', search: 'collar-antiparasitario-seresto-perro', free_shipping: true,  fast_delivery: true,  state: 'CABA', thumbnail: 'https://images.unsplash.com/photo-1605460375648-278bcbd579a6?auto=format&fit=crop&w=400&q=80' },
    { id: 's-c-08', title: 'Arena Silica Gel para Gato 1.8kg', search: 'arena-silica-gel-gato-1.8kg', free_shipping: true,  fast_delivery: false, state: 'Cordoba', thumbnail: 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?auto=format&fit=crop&w=400&q=80' },
    { id: 's-c-09', title: 'Antiparasitario Frontline Spot On Gato', search: 'frontline-spot-on-gato', free_shipping: false, fast_delivery: true,  state: 'Rosario', thumbnail: 'https://images.unsplash.com/photo-1581888227599-779811939961?auto=format&fit=crop&w=400&q=80' },
    { id: 's-c-10', title: 'Desodorante Eliminador Olor Orina Mascotas', search: 'eliminador-olor-orina-mascotas', free_shipping: true,  fast_delivery: true,  state: 'Buenos Aires', thumbnail: 'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=400&q=80' },
  ],
  descanso: [
    { id: 's-d-01', title: 'Cama Ortopedica Lavable Perro Grande', search: 'cama-ortopedica-lavable-perro-grande', free_shipping: true,  fast_delivery: true,  state: 'CABA', thumbnail: 'https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?auto=format&fit=crop&w=400&q=80' },
    { id: 's-d-02', title: 'Rascador para Gato con Cueva 160cm', search: 'rascador-gato-cueva-160cm', free_shipping: false, fast_delivery: false, state: 'Cordoba', thumbnail: 'https://images.unsplash.com/photo-1545249390-6bdfa286032f?auto=format&fit=crop&w=400&q=80' },
    { id: 's-d-03', title: 'Juguete Interactivo Dispensador Perro', search: 'juguete-interactivo-dispensador-perro', free_shipping: false, fast_delivery: true,  state: 'Buenos Aires', thumbnail: 'https://images.unsplash.com/photo-1560743173-567a3b5658b1?auto=format&fit=crop&w=400&q=80' },
    { id: 's-d-04', title: 'Cucha Termica Impermeable Perro Mediano', search: 'cucha-termica-impermeable-perro-mediano', free_shipping: true,  fast_delivery: false, state: 'Mendoza', thumbnail: 'https://images.unsplash.com/photo-1450778869180-41d0601e046e?auto=format&fit=crop&w=400&q=80' },
    { id: 's-d-05', title: 'Pelota Kong Extreme Perro Grande', search: 'pelota-kong-extreme-perro-grande', free_shipping: true,  fast_delivery: true,  state: 'Santa Fe', thumbnail: 'https://images.unsplash.com/photo-1560743173-567a3b5658b1?auto=format&fit=crop&w=400&q=80' },
    { id: 's-d-06', title: 'Hamaca Colgante Gato para Ventana', search: 'hamaca-colgante-gato-ventana', free_shipping: false, fast_delivery: false, state: 'Rosario', thumbnail: 'https://images.unsplash.com/photo-1545249390-6bdfa286032f?auto=format&fit=crop&w=400&q=80' },
    { id: 's-d-07', title: 'Cuerda Juguete Resistente Perro', search: 'cuerda-juguete-resistente-perro', free_shipping: true,  fast_delivery: true,  state: 'CABA', thumbnail: 'https://images.unsplash.com/photo-1560743173-567a3b5658b1?auto=format&fit=crop&w=400&q=80' },
    { id: 's-d-08', title: 'Plataforma Rascador Gato Carton Corrugado', search: 'rascador-gato-carton-corrugado', free_shipping: false, fast_delivery: true,  state: 'Buenos Aires', thumbnail: 'https://images.unsplash.com/photo-1545249390-6bdfa286032f?auto=format&fit=crop&w=400&q=80' },
    { id: 's-d-09', title: 'Manta Polar Termica Mascota', search: 'manta-polar-termica-mascota', free_shipping: true,  fast_delivery: false, state: 'Cordoba', thumbnail: 'https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?auto=format&fit=crop&w=400&q=80' },
    { id: 's-d-10', title: 'Juguete Laser Automatico para Gato', search: 'juguete-laser-automatico-gato', free_shipping: false, fast_delivery: true,  state: 'CABA', thumbnail: 'https://images.unsplash.com/photo-1545249390-6bdfa286032f?auto=format&fit=crop&w=400&q=80' },
  ],
};

function toBool(value) {
  return value === 'true' || value === '1' || value === 'yes';
}

function firstQuery(value, fallback = '') {
  if (Array.isArray(value)) return String(value[0] ?? fallback);
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function normalizeGroup(raw) {
  return GROUP_KEYS.has(raw) ? raw : 'alimentos';
}

function getSupabaseAnonKey() {
  return process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
}

function getAffiliateTracking() {
  return resolveAffiliateTracking({
    template: process.env.ML_AFFILIATE_TEMPLATE,
    id: process.env.ML_AFFILIATE_ID,
  });
}

function buildTrackedPermalink(permalink, tracking) {
  if (!tracking.ok) return null;
  const result = buildAffiliateUrl(permalink, tracking.value);
  return result.ok ? result.url : null;
}

function buildTrackedSearch(search, tracking) {
  if (!tracking.ok) return null;
  const result = buildAffiliateSearchUrl(search, tracking.value);
  return result.ok ? result.url : null;
}

// ── Token via refresh_token ───────────────────────────────────────────────────
async function getFreshAccessToken() {
  try {
    return await getMercadoLibreToken();
  } catch (error) {
    console.error('Consulta ML no disponible:', error instanceof ShopProviderError ? error.code : 'internal_error');
    return '';
  }
}

// ── ML API search ─────────────────────────────────────────────────────────────
const GROUP_QUERIES = {
  alimentos: 'alimento perro gato',
  accesorios: 'correa pretal collar perro',
  higiene: 'shampoo antipulgas mascotas',
  descanso: 'juguete cama rascador mascota',
  salud: 'pipeta antiparasitario mascota',
  tecnologia: 'rastreador gps mascota comedero automatico',
};

const GROUP_FALLBACK = {
  salud: 'higiene',
  tecnologia: 'accesorios',
};

async function fetchMlProducts(grupo, sortParam, accessToken) {
  const u = new URL('https://api.mercadolibre.com/sites/MLA/search');
  u.searchParams.set('category', 'MLA1071');
  u.searchParams.set('q', GROUP_QUERIES[grupo] || 'mascotas');
  u.searchParams.set('limit', '10');
  if (sortParam) u.searchParams.set('sort', sortParam);

  const headers = { Accept: 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) };
  const res = await fetch(u.toString(), { headers });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data.results) && data.results.length > 0 ? data.results : null;
}

function mapMlProduct(p, tracking) {
  const permalink = String(p.permalink || '');
  const link = buildTrackedPermalink(permalink, tracking);
  const shipping = p.shipping || {};
  const logistic = String(shipping.logistic_type || '').toLowerCase();
  const price = Number(p.price || 0) || null;
  const origPrice = Number(p.original_price || 0);
  return {
    id:             String(p.id),
    title:          String(p.title || ''),
    price,
    original_price: origPrice || null,
    discount:       origPrice > 0 && price ? Math.max(0, Math.round(((origPrice - price) / origPrice) * 100)) : 0,
    thumbnail:      String(p.thumbnail || '').replace('-I.jpg', '-O.jpg'),
    link,
    free_shipping:  Boolean(shipping.free_shipping),
    fast_delivery:  ['fulfillment', 'cross_docking'].includes(logistic),
    state:          String(p.address?.state_name || ''),
  };
}

function applyFiltersAndSort(items, shipping, delivery, sort) {
  let filtered = shipping ? items.filter(i => i.free_shipping) : [...items];
  if (delivery) filtered = filtered.filter(i => i.fast_delivery);
  if (sort === 'price_asc') filtered.sort((a, b) => (a.price || 0) - (b.price || 0));
  else if (sort === 'price_desc') filtered.sort((a, b) => (b.price || 0) - (a.price || 0));
  return filtered;
}

// ── Supabase REST API (lectura de productos guardados por el cron) ─────────────
const PET_TYPES = new Set(['perro', 'gato', 'otro']);
const LIFE_STAGES = new Set(['cachorro', 'adulto', 'senior', 'todas']);
const SIZE_CATEGORIES = new Set(['pequeño', 'mediano', 'grande', 'todos']);

function parseListQuery(value, allowedValues) {
  const raw = firstQuery(value, '');
  return [...new Set(raw.split(',').map(item => item.trim()).filter(item => allowedValues.has(item)))];
}

async function fetchFromSupabase(grupo, shipping, delivery, sort, petTypes, lifeStages, sizeCategories) {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey = getSupabaseAnonKey();
  if (!supabaseUrl || !supabaseKey) return null;

  // Columnas necesarias, ordenadas por updated_at desc (mas recientes primero)
  const params = new URLSearchParams({
    select: 'id,mla_id,title,price,thumbnail,permalink,grupo,pet_types,life_stages,size_categories,free_shipping,fast_delivery',
    grupo:  `eq.${grupo}`,
    active: 'eq.true',
    approval_status: 'eq.approved',
    order:  'updated_at.desc',
    limit:  '30',
  });
  const res = await fetch(`${supabaseUrl}/rest/v1/beneficios_productos?${params.toString()}`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) return null;
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('Catalogo invalido');
  const filteredByCompatibility = petTypes.length || lifeStages.length || sizeCategories.length;
  if (!rows.length) return filteredByCompatibility ? { products: [] } : null;
  let candidates = rows;
  if (filteredByCompatibility) {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_shop_compatibility`, {
      method:'POST',
      headers: { apikey:supabaseKey, Authorization:'Bearer ' + supabaseKey, 'Content-Type':'application/json' },
      body: JSON.stringify({ p_products:rows.map(p=>p.id) }),
    });
    if (!response.ok) throw new Error('Compatibilidad no disponible');
    const data = await response.json();
    if (!Array.isArray(data) || !data.every(row => typeof row?.product_id === 'string'
      && publicShopResearch({ compatibility_dimensions:row.dimensions }).verifiedDimensions)) throw new Error('Compatibilidad invalida');
    const dimensions = new Map(data.map(row => [row.product_id, row.dimensions]));
    candidates = rows.filter(p => {
      const d = publicShopResearch({ compatibility_dimensions:dimensions.get(p.id) }).verifiedDimensions;
      return d && p.grupo !== 'salud'
        && (!petTypes.length || petTypes.some(v => d.species.includes(v)))
        && (!lifeStages.length || d.stage.includes('todas') || lifeStages.some(v => d.stage.includes(v)))
        && (!sizeCategories.length || d.size.includes('todos') || sizeCategories.some(v => d.size.includes(v)));
    });
  }

  const tracking = getAffiliateTracking();
  const mapped = candidates.map(p => ({
    id:             p.mla_id,
    title:          String(p.title || ''),
    price:          p.price ?? null,
    original_price: null,
    discount:       0,
    thumbnail:      String(p.thumbnail || ''),
    link:           buildTrackedPermalink(p.permalink, tracking),
    free_shipping:  Boolean(p.free_shipping),
    fast_delivery:  Boolean(p.fast_delivery),
    state:          '',
  }));

  return { products: applyFiltersAndSort(mapped, shipping, delivery, sort).slice(0, 10) };
}

async function fetchActiveProductById(productId) {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey = getSupabaseAnonKey();
  if (!supabaseUrl || !supabaseKey) return null;

  const params = new URLSearchParams({
    select: 'id,title,thumbnail,permalink',
    id: `eq.${productId}`,
    active: 'eq.true',
    approval_status: 'eq.approved',
    limit: '1',
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/beneficios_productos?${params.toString()}`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function fetchAffiliateLinksByProductIds(productIds, tracking) {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey = getSupabaseAnonKey();
  if (!supabaseUrl || !supabaseKey) return null;

  const params = new URLSearchParams({
    select: 'id,permalink',
    id: `in.(${productIds.join(',')})`,
    active: 'eq.true',
    approval_status: 'eq.approved',
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/beneficios_productos?${params.toString()}`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) return null;

  const rows = await response.json();
  if (!Array.isArray(rows)) return null;
  return rows.map(product => ({
    productId: product.id,
    link: buildTrackedPermalink(product.permalink, tracking),
  }));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'no-store');
  if (firstQuery(req.query.shop, '') === 'true') {
    try {
      const catalog = await loadShopCatalog(CATALOG);
      return res.status(200).json({ ...catalog, affiliateAvailable: catalog.products.some(p => p.link) });
    } catch {
      console.error('No se pudo preparar el catalogo de tienda.');
      return res.status(503).json({ error: 'No se pudo cargar la tienda.' });
    }
  }

  const grupo    = normalizeGroup(firstQuery(req.query.grupo, 'alimentos'));
  const sort     = firstQuery(req.query.sort, '');
  const shipping = toBool(firstQuery(req.query.shipping, 'false'));
  const delivery = toBool(firstQuery(req.query.delivery,  'false'));
  const tracking = getAffiliateTracking();

  const productId = firstQuery(req.query.productId, '');
  if (productId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)) {
      return res.status(400).json({ error: 'Invalid product id' });
    }
    try {
      const product = await fetchActiveProductById(productId);
      if (!product) return res.status(404).json({ affiliateAvailable: false, link: null });
      const link = buildTrackedPermalink(product.permalink, tracking);
      return res.status(200).json({
        productId: product.id,
        affiliateAvailable: Boolean(link),
        link,
      });
    } catch {
      return res.status(200).json({ affiliateAvailable: false, link: null });
    }
  }

  const productIdsRaw = firstQuery(req.query.productIds, '');
  if (productIdsRaw) {
    const productIds = [...new Set(productIdsRaw.split(',').map(id => id.trim()))];
    if (
      productIds.length === 0
      || productIds.length > 30
      || productIds.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    ) {
      return res.status(400).json({ error: 'Invalid product ids' });
    }
    try {
      const links = await fetchAffiliateLinksByProductIds(productIds, tracking);
      if (!links) return res.status(200).json({ affiliateAvailable: false, links: [] });
      return res.status(200).json({
        affiliateAvailable: links.some(item => Boolean(item.link)),
        links,
      });
    } catch {
      return res.status(200).json({ affiliateAvailable: false, links: [] });
    }
  }

  const petTypes = parseListQuery(req.query.petTypes, PET_TYPES);
  const lifeStages = parseListQuery(req.query.lifeStages, LIFE_STAGES);
  const sizeCategories = parseListQuery(req.query.sizeCategories, SIZE_CATEGORIES);
  const compatibilityFilter = Boolean(petTypes.length || lifeStages.length || sizeCategories.length);
  if ((req.query.petTypes != null && !petTypes.length) || (req.query.lifeStages != null && !lifeStages.length)
    || (req.query.sizeCategories != null && !sizeCategories.length)) {
    return res.status(400).json({ error:'Filtro de compatibilidad invalido.' });
  }

  // ── 1. Supabase (productos reales llenados por el cron diario) ─────────────
  try {
    const supaResult = await fetchFromSupabase(
      grupo,
      shipping,
      delivery,
      sort,
      petTypes,
      lifeStages,
      sizeCategories,
    );
    if (supaResult && (supaResult.products.length > 0 || compatibilityFilter)) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        ...supaResult,
        affiliateAvailable: supaResult.products.some(product => Boolean(product.link)),
        source: 'supabase',
      });
    }
  } catch {
    if (compatibilityFilter) {
      console.error('Beneficios: no se pudo verificar compatibilidad.');
      return res.status(503).json({ error:'No se pudo verificar compatibilidad.' });
    }
    console.error('Beneficios: catalogo remoto no disponible.');
  }
  if (compatibilityFilter) {
    return res.status(503).json({ error:'No se pudo verificar compatibilidad.' });
  }

  // ── 2. Intentar ML API con refresh_token (si Supabase vacio) ─────────────
  const accessToken = await getFreshAccessToken();
  if (accessToken) {
    try {
      const primarySort = (sort === 'price_asc' || sort === 'price_desc') ? sort : 'sold_quantity_desc';
      let results = await fetchMlProducts(grupo, primarySort, accessToken);
      if (!results) results = await fetchMlProducts(grupo, null, accessToken);

      if (results) {
        const products = results
          .map(p => mapMlProduct(p, tracking))
          .filter(p => !shipping || p.free_shipping)
          .filter(p => !delivery  || p.fast_delivery)
          .slice(0, 10);

        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({
          products,
          affiliateAvailable: products.some(product => Boolean(product.link)),
          source: 'api',
        });
      }
    } catch {
      // cae al catalogo estatico
    }
  }

  // ── 3. Catalogo estatico (ultimo recurso) ─────────────────────────────────
  const base = CATALOG[grupo] || CATALOG[GROUP_FALLBACK[grupo]] || CATALOG.alimentos;
  const products = base.map(p => ({
    id:             p.id,
    title:          p.title,
    price:          null,
    original_price: null,
    discount:       0,
    thumbnail:      p.thumbnail,
    link:           buildTrackedSearch(p.search, tracking),
    free_shipping:  p.free_shipping,
    fast_delivery:  p.fast_delivery,
    state:          p.state,
  }));

  const filtered = applyFiltersAndSort(products, shipping, delivery, sort).slice(0, 10);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    products: filtered,
    affiliateAvailable: filtered.some(product => Boolean(product.link)),
    source: 'static',
  });
}
