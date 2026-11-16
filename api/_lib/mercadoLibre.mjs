export class ShopProviderError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ShopProviderError';
    this.code = code;
  }
}

export async function fetchShopJson(url, options = {}, fetcher = fetch) {
  let response;
  try {
    response = await fetcher(url, { ...options, signal: AbortSignal.timeout(12000) });
  } catch {
    throw new ShopProviderError('network_or_timeout');
  }
  if (!response.ok) throw new ShopProviderError(`http_${response.status}`);
  // Los RPC que devuelven void responden 204/cuerpo vacio: no es un error.
  if (response.status === 204) return null;
  let text;
  try {
    text = await response.text();
  } catch {
    throw new ShopProviderError('invalid_json');
  }
  if (!text || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new ShopProviderError('invalid_json');
  }
}

export async function shopRpc(name, body, env = process.env, fetcher = fetch) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (!env.SUPABASE_URL || !key) throw new ShopProviderError('shop_backend_unconfigured');
  return fetchShopJson(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, fetcher);
}

export async function getMercadoLibreToken(env = process.env, fetcher = fetch) {
  if (env.ML_ACCESS_TOKEN) return env.ML_ACCESS_TOKEN;
  if (!env.ML_APP_ID || !env.ML_APP_SECRET) throw new ShopProviderError('ml_oauth_unconfigured');
  const claim = await shopRpc('claim_shop_provider_token', { p_seed: env.ML_REFRESH_TOKEN || null }, env, fetcher);
  if (claim.status === 'ready' && typeof claim.accessToken === 'string') return claim.accessToken;
  if (claim.status !== 'refresh') throw new ShopProviderError('oauth_refresh_busy');
  let token;
  try {
    token = await fetchShopJson('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token', client_id: env.ML_APP_ID,
        client_secret: env.ML_APP_SECRET, refresh_token: claim.refreshToken,
      }).toString(),
    }, fetcher);
    if (!token.access_token || !token.refresh_token || !Number.isFinite(token.expires_in) || token.expires_in <= 60) {
      throw new ShopProviderError('invalid_oauth_response');
    }
  } catch (error) {
    await shopRpc('finish_shop_provider_token', { p_lease: claim.leaseId }, env, fetcher);
    throw error;
  }
  // Persiste la rotacion antes de usar el token; no se renueva con una clave vieja.
  await shopRpc('finish_shop_provider_token', {
    p_lease: claim.leaseId, p_access: token.access_token,
    p_refresh: token.refresh_token, p_expires: token.expires_in,
  }, env, fetcher);
  return token.access_token;
}

export function normalizeItemId(id, permalink) {
  if (typeof permalink !== 'string' || /\/p\/MLA/i.test(permalink)) return null;
  const normalized = String(id || '').replace('-', '').toUpperCase();
  return /^MLA\d{6,}$/.test(normalized) ? normalized : null;
}

// Fichas /p/: el identificador guardado es el del catalogo, no una publicacion.
export function normalizeCatalogPageId(id, permalink) {
  if (typeof permalink !== 'string' || !/\/p\/MLA/i.test(permalink)) return null;
  const normalized = String(id || '').replace('-', '').toUpperCase();
  return /^MLA\d{6,}$/.test(normalized) ? normalized : null;
}

export function normalizeOfficialPrice(item, sale) {
  if (!item || item.status !== 'active') throw new ShopProviderError('item_not_active');
  const amount = sale?.amount;
  const regular = sale?.regular_amount;
  if (!Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(sale.currency_id || '')) {
    throw new ShopProviderError('official_price_unavailable');
  }
  if (regular !== null && regular !== undefined && (!Number.isFinite(regular) || regular <= 0)) {
    throw new ShopProviderError('invalid_regular_price');
  }
  const promotional = regular > amount ? amount : null;
  return {
    status: 'ok', price: amount, regularPrice: regular || null,
    promotionalPrice: promotional, currency: sale.currency_id,
    metadata: {
      seller: Number.isSafeInteger(item.seller_id) ? `Vendedor ML ${item.seller_id}` : null,
      priceContext: 'channel_marketplace',
    },
  };
}

export async function fetchOfficialItemPrice(id, token, fetcher = fetch) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const item = await fetchShopJson(`https://api.mercadolibre.com/items/${id}`, { headers }, fetcher);
  // No depende de price/original_price de /items, campos en retirada.
  const sale = await fetchShopJson(`https://api.mercadolibre.com/items/${id}/sale_price?context=channel_marketplace`, { headers }, fetcher);
  return normalizeOfficialPrice(item, sale);
}

export function normalizeOfficialCatalogPrice(listing, priceContext = 'catalog_listing') {
  // Precio real de la publicacion exacta informado por el catalogo oficial;
  // si la publicacion no figura entre las del catalogo, no se inventa precio.
  if (!listing) throw new ShopProviderError('listing_price_unavailable');
  const amount = listing.price;
  const regular = listing.original_price;
  if (!Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(listing.currency_id || '')) {
    throw new ShopProviderError('official_price_unavailable');
  }
  if (regular !== null && regular !== undefined && (!Number.isFinite(regular) || regular <= 0)) {
    throw new ShopProviderError('invalid_regular_price');
  }
  return {
    status: 'ok', price: amount, regularPrice: regular || null,
    promotionalPrice: regular > amount ? amount : null, currency: listing.currency_id,
    metadata: {
      seller: Number.isSafeInteger(listing.seller_id) ? `Vendedor ML ${listing.seller_id}` : null,
      priceContext,
    },
  };
}

// Fuente permitida por ML para publicaciones de terceros: el precio por
// publicacion que expone la ficha oficial de catalogo (GET /items esta
// restringido por politica de ML; verificado 2026-11-16). Sin itemId se toma
// la publicacion ganadora, que es la que abre el enlace de una ficha /p/.
export async function fetchOfficialCatalogListingPrice(catalogId, itemId, token, fetcher = fetch) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const listings = await fetchShopJson(`https://api.mercadolibre.com/products/${catalogId}/items`, { headers }, fetcher);
  if (!Array.isArray(listings?.results)) throw new ShopProviderError('catalog_listings_unavailable');
  if (itemId) return normalizeOfficialCatalogPrice(listings.results.find(row => row.item_id === itemId));
  return normalizeOfficialCatalogPrice(listings.results[0], 'catalog_buy_box_winner');
}
