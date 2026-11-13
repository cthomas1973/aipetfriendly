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
  try {
    return await response.json();
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
