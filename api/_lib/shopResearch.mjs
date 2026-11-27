import { shopCategory } from '../../supabase/functions/_shared/shopCatalogPolicy.mjs';
import { fetchShopJson, ShopProviderError } from './mercadoLibre.mjs';

const text = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const id = value => typeof value === 'string' && /^MLA\d{6,}$/.test(value) ? value : null;

export function researchShopItem(item, description, now = new Date().toISOString(), source = `https://api.mercadolibre.com/items/${item?.id}`) {
  if (!id(item?.id) || item.status !== 'active') throw new ShopProviderError('listing_not_active');
  const attributes = Array.isArray(item.attributes) ? item.attributes.flatMap(a =>
    typeof a?.name === 'string' && typeof a.value_name === 'string' && a.value_name.trim()
      ? [{ id: a.id, name: a.name, value: a.value_name, source, researchedAt: now }] : []) : [];
  const find = key => attributes.find(a => a.id === key)?.value || null;
  const title = String(item.title || '');
  const compatibilityText = text([title, ...attributes.filter(a => /PET|ANIMAL|LIFE_STAGE|AGE|BREED_SIZE|DOG_SIZE/.test(a.id || '')).map(a => a.value)].join(' '));
  const petTypes = [];
  if (/\bperros?\b|\bcanin[oa]s?\b/.test(compatibilityText)) petTypes.push('perro');
  if (/\bgatos?\b|\bfelin[oa]s?\b|\bkitten\b/.test(compatibilityText)) petTypes.push('gato');
  const lifeStages = [];
  if (/\bcachorros?\b|\bpupp(?:y|ies)\b|\bkitten\b/.test(compatibilityText)) lifeStages.push('cachorro');
  if (/\badult[oa]s?\b/.test(compatibilityText)) lifeStages.push('adulto');
  if (/\bsenior\b/.test(compatibilityText)) lifeStages.push('senior');
  if (/todas las (?:edades|etapas)/.test(compatibilityText)) lifeStages.push('todas');
  const sizes = [];
  if (/razas? (?:pequenas?|small)|perros? pequenos?/.test(compatibilityText)) sizes.push('pequeño');
  if (/razas? medianas?|perros? medianos?/.test(compatibilityText)) sizes.push('mediano');
  if (/razas? grandes?|perros? grandes?/.test(compatibilityText)) sizes.push('grande');
  if (/todos los tamanos|todas las razas/.test(compatibilityText)) sizes.push('todos');
  const hasRestrictions = /no (?:apto|recomendad|para)|contraindic|excepto/.test(compatibilityText);
  if (hasRestrictions) { petTypes.length=0; lifeStages.length=0; sizes.length=0; }
  const categoryText = text(title);
  const group = /alimento|balanceado|comida|snack/.test(categoryText) ? 'alimentos'
    : /antipulgas|antiparasit|suplemento|medicamento/.test(categoryText) ? 'salud'
      : /shampoo|arena sanitaria|higiene|cepillo/.test(categoryText) ? 'higiene'
        : /cama|colchon|rascador|juguete|pelota|mordedor/.test(categoryText) ? 'descanso'
          : /gps|camara|comedero automatico/.test(categoryText) ? 'tecnologia' : 'accesorios';
  const images = Array.isArray(item.pictures) ? item.pictures.flatMap(p => {
    const url = p.secure_url || p.url;
    return typeof url === 'string' && /^https:\/\/[^/]*mlstatic\.com\//.test(url) ? [url] : [];
  }) : [];
  const record = {
    title, permalink: item.permalink, description: typeof description?.plain_text === 'string' ? description.plain_text : null,
    brand: find('BRAND'), images, category: shopCategory(title, group), categoryId: item.category_id,
    petTypes, lifeStages, sizes, attributes, provenance: {}, limitations: [],
  };
  for (const field of ['title', 'permalink', 'brand', 'images', 'category', 'petTypes', 'lifeStages', 'sizes']) {
    if (record[field] !== null && (!Array.isArray(record[field]) || record[field].length)) {
      record.provenance[field] = { source, researchedAt: now, method: ['category', 'petTypes', 'lifeStages', 'sizes'].includes(field) ? 'explicit_title_or_attribute' : 'official_attribute' };
    }
  }
  if (record.description !== null) record.provenance.description = { source: `${source}/description`, researchedAt: now };
  for (const [field, label] of [['petTypes', 'especie'], ['lifeStages', 'etapa'], ['sizes', 'tamaño']]) {
    if (!record[field].length) record.limitations.push(`No informado: ${label}; no se infiere compatibilidad universal.`);
  }
  if (hasRestrictions) record.limitations.push('Texto con restricciones: requiere revision administrativa; no se infiere compatibilidad.');
  return record;
}

export async function investigateShopCandidate(candidate, token, fetcher = fetch) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  // Mercado Libre deniega GET /items/{id} sobre publicaciones de terceros
  // (access_denied), pero permite las fichas oficiales de catalogo /products.
  // Los candidatos de catalogo se investigan solo con endpoints permitidos.
  if (!candidate.mlaId && candidate.catalogProductId) {
    const source = `https://api.mercadolibre.com/products/${candidate.catalogProductId}`;
    const denied = endpoint => ({ status: 'unsupported', error: `Mercado Libre denego (HTTP 403) la lectura de ${endpoint}; revisar o incorporar manualmente.` });
    let product;
    try {
      product = await fetchShopJson(source, { headers }, fetcher);
    } catch (error) {
      if (error instanceof ShopProviderError && error.code === 'http_403') return denied('/products/{id}');
      throw error;
    }
    if (product.id !== candidate.catalogProductId) throw new ShopProviderError('catalog_product_mismatch');
    if (typeof product.name !== 'string' || !product.name.trim()) throw new ShopProviderError('catalog_product_incomplete');
    let listing;
    try {
      const listings = await fetchShopJson(`${source}/items`, { headers }, fetcher);
      if (!Array.isArray(listings.results)) throw new ShopProviderError('catalog_listings_unavailable');
      listing = listings.results.find(p => id(p.item_id || p.id));
    } catch (error) {
      if (!(error instanceof ShopProviderError) || error.code !== 'http_403') throw error;
      // /products/{id}/items puede estar denegado; la ficha oficial informa la publicacion ganadora.
      const winner = id(product.buy_box_winner?.item_id);
      if (!winner) {
        const result = denied('/products/{id}/items');
        result.error += product.buy_box_winner ? ' La ficha trae buy_box_winner sin item_id valido.' : ' La ficha no informa publicacion ganadora (buy_box_winner ausente).';
        return result;
      }
      listing = { item_id: winner, category_id: product.buy_box_winner.category_id };
    }
    if (!listing) throw new ShopProviderError('catalog_has_no_accessible_listing');
    const mlaId = id(listing.item_id || listing.id);
    const record = researchShopItem({
      id: mlaId,
      status: product.status,
      title: product.name,
      // Permalink canonico derivado del item oficial informado por el catalogo;
      // la publicacion individual no es legible por politica de Mercado Libre.
      permalink: `https://articulo.mercadolibre.com.ar/MLA-${mlaId.slice(3)}`,
      category_id: listing.category_id || null,
      attributes: product.attributes,
      pictures: product.pictures,
    }, typeof product.short_description?.content === 'string' ? { plain_text: product.short_description.content } : null,
    new Date().toISOString(), source);
    record.limitations.push('Ficha construida desde el catalogo oficial (/products); la publicacion individual no es legible por politica de Mercado Libre.');
    return { status: 'ready', mlaId, catalogProductId: candidate.catalogProductId, listingActive: true, record };
  }
  const mlaId = candidate.mlaId;
  if (!id(mlaId)) throw new ShopProviderError('listing_id_unavailable');
  let item;
  try {
    item = await fetchShopJson(`https://api.mercadolibre.com/items/${mlaId}`, { headers }, fetcher);
  } catch (error) {
    if (error instanceof ShopProviderError && error.code === 'http_403') {
      // Resultado definitivo, no reintentable: requiere revision o alta manual.
      return { status: 'unsupported', error: 'Mercado Libre no permite leer publicaciones de terceros (access_denied); incorporar manualmente o rechazar.' };
    }
    throw error;
  }
  if (item.id !== mlaId || (candidate.catalogProductId && item.catalog_product_id !== candidate.catalogProductId)) throw new ShopProviderError('catalog_listing_mismatch');
  let description = null;
  const limitations = [];
  try {
    description = await fetchShopJson(`https://api.mercadolibre.com/items/${mlaId}/description`, { headers }, fetcher);
  } catch (error) {
    if (!(error instanceof ShopProviderError)) throw error;
    limitations.push(`Descripcion oficial no disponible: ${error.code}`);
  }
  const record = researchShopItem(item, description);
  record.limitations.push(...limitations);
  return { status: 'ready', mlaId, catalogProductId: id(item.catalog_product_id), listingActive: true, record };
}

export async function discoverShopCategories(token, cursor, fetcher = fetch) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const queue = ['MLA1071'];
  const leaves = [];
  const visited = new Set();
  const started = Date.now();
  // Solo el arbol oficial de mascotas; limites de recorrido explicitos, sin IDs inventados.
  while (queue.length && visited.size < 100 && Date.now() - started < 180000) {
    const categoryId = queue.shift();
    if (visited.has(categoryId)) continue;
    visited.add(categoryId);
    const row = await fetchShopJson(`https://api.mercadolibre.com/categories/${categoryId}`, { headers }, fetcher);
    if (!Array.isArray(row.children_categories)) throw new ShopProviderError('invalid_category_tree');
    if (!row.children_categories.length) leaves.push({ id: categoryId, name: row.name || 'No informado' });
    else queue.push(...row.children_categories.map(c => c.id).filter(c => /^MLA\d+$/.test(c)));
  }
  leaves.sort((a, b) => a.id.localeCompare(b.id));
  if (!leaves.length) throw new ShopProviderError('no_accessible_pet_subcategories');
  return { categories: Array.from({ length: Math.min(5, leaves.length) }, (_, i) => leaves[(cursor + i) % leaves.length]), truncated: queue.length > 0 };
}

export function rankingDetections(payload, category) {
  if (!Array.isArray(payload?.content)) throw new ShopProviderError('official_ranking_unavailable');
  return payload.content.flatMap(row => {
    const external = id(row.id);
    if (!external || !['ITEM', 'PRODUCT'].includes(row.type)) return [];
    return [{
      mlaId: row.type === 'ITEM' ? external : null, catalogProductId: row.type === 'PRODUCT' ? external : null,
      categoryId: category.id, categoryName: category.name,
      source: `https://api.mercadolibre.com/highlights/MLA/category/${category.id}`,
      position: Number.isInteger(row.position) && row.position > 0 ? row.position : null,
      sourceType: row.type,
    }];
  });
}
