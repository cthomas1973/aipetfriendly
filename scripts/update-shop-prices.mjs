import { pathToFileURL } from 'node:url';
import { fetchOfficialCatalogListingPrice, fetchOfficialItemPrice, getMercadoLibreToken, normalizeItemId, ShopProviderError, shopRpc } from '../api/_lib/mercadoLibre.mjs';

// Codigos esperados cuando Mercado Libre no expone la publicacion (politica
// de acceso o ficha /p/ sin publicacion): se registran por producto y el
// precio conserva NULL o la ultima consulta exitosa, pero no son un fallo
// operativo del proceso.
const EXPECTED_UNAVAILABLE = new Set(['http_403', 'catalog_product_requires_listing_id', 'listing_price_unavailable']);

export async function updateShopPrices({ env = process.env, fetcher = fetch } = {}) {
  // El flag del workflow y enabled en la DB deben activarse expresamente.
  if (env.SHOP_PRICE_TRACKING_ENABLED !== 'true') return { enabled: false, updated: 0, unavailable: 0, failed: 0 };
  const maxBatches = Number(env.SHOP_PRICE_MAX_BATCHES || 10);
  if (!Number.isInteger(maxBatches) || maxBatches < 1 || maxBatches > 50) throw new ShopProviderError('invalid_batch_configuration');
  let token = null;
  let updated = 0;
  let unavailable = 0;
  let failed = 0;
  let limited = false;
  const started = Date.now();
  for (let batch = 0; batch < maxBatches && Date.now() - started < 300000; batch += 1) {
    const jobs = await shopRpc('claim_shop_price_updates', { p_limit: 20 }, env, fetcher);
    if (!Array.isArray(jobs)) throw new ShopProviderError('invalid_job_response');
    if (!jobs.length) break;
    let tokenError = null;
    try {
      if (!token) token = await getMercadoLibreToken(env, fetcher);
    } catch (error) {
      if (!(error instanceof ShopProviderError)) throw error;
      tokenError = error.code;
      limited = true;
    }
    // Cuatro consultas simultaneas mantienen el lote dentro del lease de cinco minutos.
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        const id = normalizeItemId(job.externalId, job.permalink);
        let result;
        try {
          if (!id) throw new ShopProviderError('catalog_product_requires_listing_id');
          if (tokenError) throw new ShopProviderError(tokenError);
          if (limited) throw new ShopProviderError('provider_rate_limited');
          // ML deniega /items/{id} sobre publicaciones de terceros: cuando hay
          // catalogo se consulta el precio real de la publicacion exacta via
          // /products/{catalog}/items (permitido); sin catalogo se intenta
          // /items y un rechazo conserva el ultimo precio valido.
          result = job.catalogProductId
            ? await fetchOfficialCatalogListingPrice(job.catalogProductId, id, token, fetcher)
            : await fetchOfficialItemPrice(id, token, fetcher);
        } catch (error) {
          if (!(error instanceof ShopProviderError)) throw error;
          // 401/429 afectan al token o la cuota globales y frenan el lote;
          // un 403 es la politica por publicacion y no debe frenar al resto.
          if (error.code === 'http_429' || error.code === 'http_401') limited = true;
          result = { status: 'error', error: error.code };
        }
        await shopRpc('finish_shop_price_update', {
          p_product: job.productId, p_lease: job.leaseId, p_result: result,
        }, env, fetcher);
        if (result.status === 'ok') updated += 1;
        else if (EXPECTED_UNAVAILABLE.has(result.error)) unavailable += 1;
        else failed += 1;
      }
    }));
    if (limited) break;
  }
  if (unavailable) console.error(`Tienda: ${unavailable} publicaciones sin fuente de precio permitida por Mercado Libre; conservan NULL o la ultima consulta exitosa.`);
  if (failed) console.error(`Tienda: ${failed} precios sin actualizar; se conserva la ultima consulta exitosa.`);
  return { enabled: true, updated, unavailable, failed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  updateShopPrices().then(result => {
    console.log(JSON.stringify(result));
    if (result.failed) process.exitCode = 1;
  }).catch(error => {
    console.error('No se pudo actualizar la tienda:', error instanceof ShopProviderError ? error.code : 'internal_error');
    process.exitCode = 1;
  });
}
