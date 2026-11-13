import { pathToFileURL } from 'node:url';
import { fetchShopJson, getMercadoLibreToken, ShopProviderError, shopRpc } from '../api/_lib/mercadoLibre.mjs';
import { discoverShopCategories, investigateShopCandidate, rankingDetections } from '../api/_lib/shopResearch.mjs';

export async function discoverShopRadar({ env = process.env, fetcher = fetch } = {}) {
  if (env.SHOP_RADAR_ENABLED !== 'true') return { status: 'disabled', detected: 0 };
  const run = await shopRpc('claim_shop_radar_run', {}, env, fetcher);
  if (run.status !== 'claimed') return { status: run.status, detected: 0 };
  const limitations = [];
  let detected = 0;
  try {
    const token = await getMercadoLibreToken(env, fetcher);
    const tree = await discoverShopCategories(token, run.cursor, fetcher);
    if (tree.truncated) limitations.push('Recorrido oficial limitado a 100 categorias; algunas subcategorias no se consultaron.');
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    const groups = [];
    for (const category of tree.categories) {
      try {
        const ranking = await fetchShopJson(`https://api.mercadolibre.com/highlights/MLA/category/${category.id}`, { headers }, fetcher);
        groups.push(rankingDetections(ranking, category));
      } catch (error) {
        if (!(error instanceof ShopProviderError)) throw error;
        limitations.push(`${category.id}: ranking oficial no disponible (${error.code}); no se inventa popularidad.`);
        if (['http_401', 'http_403', 'http_429'].includes(error.code)) break;
      }
    }
    // Intercalado entre categorias; duplicados no reemplazan ni reinvestigan candidatos resueltos.
    for (let position = 0; position < 20 && detected < 5; position++) {
      for (const group of groups) {
        if (!group[position] || detected >= 5) continue;
        const result = await shopRpc('record_shop_radar_detection', { p_run: run.runId, p_detection: group[position] }, env, fetcher);
        if (['created', 'duplicate'].includes(result.status)) detected++;
        if (result.status === 'daily_limit') break;
      }
    }
  } catch (error) {
    if (!(error instanceof ShopProviderError)) throw error;
    limitations.push(error.code);
  } finally {
    await shopRpc('finish_shop_radar_run', { p_run: run.runId, p_limitations: limitations }, env, fetcher);
  }
  if (limitations.length) console.error('Radar: fuentes limitadas:', limitations.join('; '));
  return { status: limitations.length ? 'limited' : 'finished', detected, limitations };
}

export async function researchShopRadar({ env = process.env, fetcher = fetch } = {}) {
  if (env.SHOP_RADAR_RESEARCH_ENABLED !== 'true') return { status: 'disabled', researched: 0, failed: 0 };
  const candidates = await shopRpc('claim_shop_radar_research', { p_limit: 5 }, env, fetcher);
  if (!Array.isArray(candidates)) throw new ShopProviderError('invalid_research_jobs');
  if (!candidates.length) return { status: 'finished', researched: 0, failed: 0 };
  let token, tokenError;
  try { token = await getMercadoLibreToken(env, fetcher); } catch (error) {
    if (!(error instanceof ShopProviderError)) throw error;
    tokenError = error.code;
  }
  let researched = 0, failed = 0;
  for (const candidate of candidates) {
    let result;
    try {
      if (tokenError) throw new ShopProviderError(tokenError);
      result = await investigateShopCandidate(candidate, token, fetcher);
      researched++;
    } catch (error) {
      if (!(error instanceof ShopProviderError)) throw error;
      result = { status: 'error', error: error.code };
      failed++;
      if (['http_401', 'http_403', 'http_429'].includes(error.code)) tokenError = error.code;
    }
    await shopRpc('finish_shop_radar_research', { p_id: candidate.id, p_lease: candidate.leaseId, p_result: result }, env, fetcher);
  }
  if (failed) console.error(`Radar: ${failed} investigaciones pendientes; no se publico ningun candidato.`);
  return { status: failed ? 'limited' : 'finished', researched, failed };
}

export async function runShopRadar(options = {}) {
  const mode = options.mode || 'all';
  if (!['all', 'discover', 'research'].includes(mode)) throw new ShopProviderError('invalid_radar_mode');
  return {
    discovery: mode !== 'research' ? await discoverShopRadar(options) : null,
    research: mode !== 'discover' ? await researchShopRadar(options) : null,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runShopRadar({ mode: process.argv[2] || 'all' }).then(result => {
    console.log(JSON.stringify(result));
    if (result.discovery?.status === 'limited' || result.research?.failed) process.exitCode = 1;
  }).catch(error => {
    console.error('Radar no disponible:', error instanceof ShopProviderError ? error.code : 'internal_error');
    process.exitCode = 1;
  });
}
