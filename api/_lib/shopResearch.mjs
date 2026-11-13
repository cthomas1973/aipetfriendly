import { shopCategory } from '../../supabase/functions/_shared/shopCatalogPolicy.mjs';
import { fetchShopJson, ShopProviderError } from './mercadoLibre.mjs';

const text = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const id = value => typeof value === 'string' && /^MLA\d{6,}$/.test(value) ? value : null;

export function researchShopItem(item, description, now = new Date().toISOString()) {
  if (!id(item?.id) || item.status !== 'active') throw new ShopProviderError('listing_not_active');
  const source = `https://api.mercadolibre.com/items/${item.id}`;
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
  let mlaId = candidate.mlaId;
  if (!mlaId && candidate.catalogProductId) {
    const listings = await fetchShopJson(`https://api.mercadolibre.com/products/${candidate.catalogProductId}/items`, { headers }, fetcher);
    if (!Array.isArray(listings.results)) throw new ShopProviderError('catalog_listings_unavailable');
    mlaId = listings.results.map(p => id(p.item_id || p.id)).find(Boolean);
    if (!mlaId) throw new ShopProviderError('catalog_has_no_accessible_listing');
  }
  if (!id(mlaId)) throw new ShopProviderError('listing_id_unavailable');
  const item = await fetchShopJson(`https://api.mercadolibre.com/items/${mlaId}`, { headers }, fetcher);
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
