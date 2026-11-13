import { buildAffiliateSearchUrl, buildAffiliateUrl, resolveAffiliateTracking } from '../../supabase/functions/_shared/affiliateLink.mjs';
import { fetchShopJson } from './mercadoLibre.mjs';
import { shopCategory } from '../../supabase/functions/_shared/shopCatalogPolicy.mjs';
import { publicShopResearch } from '../../supabase/functions/_shared/shopResearchRecord.mjs';
export { shopCategory } from '../../supabase/functions/_shared/shopCatalogPolicy.mjs';

const normalized = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const values = (items, allowed) => Array.isArray(items) ? items.filter(v => allowed.includes(v)) : [];

export function mapShopProduct(row, tracked, tracking, source = 'supabase') {
  const global = publicShopResearch(row);
  const research = global.research;
  const title = String(row.title || '');
  const text = normalized(title);
  const petTypes = values(row.pet_types, ['perro','gato','otro']);
  const stages = values(row.life_stages, ['cachorro','adulto','senior','todas']);
  const sizes = values(row.size_categories, ['pequeño','mediano','grande','todos']);
  // Si no hay etiquetas, solo se usa informacion explicita del titulo.
  if (!petTypes.length) {
    if (/\bperro|canin|cachorro/.test(text)) petTypes.push('perro');
    if (/\bgato|felin/.test(text)) petTypes.push('gato');
  }
  if (!stages.length) {
    if (/cachorro|puppy|kitten/.test(text)) stages.push('cachorro');
    else if (/senior/.test(text)) stages.push('senior');
    else if (/adulto/.test(text)) stages.push('adulto');
  }
  if (!sizes.length) {
    if (/razas? grandes?|perro grande/.test(text)) sizes.push('grande');
    else if (/razas? pequenas?|perro pequeno/.test(text)) sizes.push('pequeño');
    else if (/mediano|mediana/.test(text)) sizes.push('mediano');
  }
  let link = null;
  if (tracking.ok) {
    const result = row.search ? buildAffiliateSearchUrl(row.search, tracking.value) : buildAffiliateUrl(row.permalink, tracking.value);
    if (result.ok) link = result.url;
  }
  const metadata = tracked?.metadata || {};
  return {
    ...global,
    id: row.id, externalId: row.mla_id || null, title, thumbnail: row.thumbnail || null,
    category: research?.category || shopCategory(title,row.grupo), price: tracked?.price ?? row.price ?? null,
    originalPrice: tracked?.regular_price ?? null, currency: tracked?.currency ?? null,
    checkedAt: tracked?.last_success_at ?? null,
    priceStatus: tracked?.query_status === 'ok' ? 'ok' : tracked?.query_status === 'error' ? 'error' : 'unverified',
    source, seller: metadata.seller || null, brand: research?.brand || metadata.brand || null,
    presentation: research?.attributes.find(a => ['NET_WEIGHT','SIZE'].includes(a.id))?.value || metadata.presentation || null,
    attributes: research?.attributes || metadata.attributes || [],
    petTypes: global.verifiedDimensions?.species || research?.petTypes || petTypes,
    lifeStages: global.verifiedDimensions?.stage || research?.lifeStages || stages,
    sizes: global.verifiedDimensions?.size || research?.sizes || sizes, needs: [research?.category || shopCategory(title,row.grupo)],
    freeShipping: source !== 'static' && Boolean(row.free_shipping),
    fastDelivery: source !== 'static' && Boolean(row.fast_delivery), link,
  };
}

export async function loadShopCatalog(staticCatalog, env = process.env, fetcher = fetch) {
  const tracking = resolveAffiliateTracking({ id: env.ML_AFFILIATE_ID, template: env.ML_AFFILIATE_TEMPLATE });
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  let warning = null;
  if (env.SUPABASE_URL && key) {
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    try {
      const rows = [];
      let complete = false;
      for (let page=0;page<100;page++) {
        const batch = await fetchShopJson(`${env.SUPABASE_URL}/rest/v1/beneficios_productos?select=id,mla_id,title,thumbnail,price,permalink,grupo,pet_types,life_stages,size_categories,free_shipping,fast_delivery,catalog_product_id,research_record,researched_at,approval_status&active=eq.true&approval_status=eq.approved&order=id.asc&limit=200&offset=${page*200}`, { headers }, fetcher);
        if (!Array.isArray(batch)) throw new Error('catalog_invalid');
        rows.push(...batch);
        if (batch.length<200) { complete=true; break; }
      }
      if (!complete) throw new Error('catalog_pagination_limit');
      if (rows.length) {
        let compatibility = [];
        try {
          for (let offset=0;offset<rows.length;offset+=200) {
            const batch = await fetchShopJson(`${env.SUPABASE_URL}/rest/v1/rpc/get_shop_compatibility`, {
              method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({ p_products: rows.slice(offset,offset+200).map(p=>p.id) }),
            }, fetcher);
            if (!Array.isArray(batch) || !batch.every(row => typeof row?.product_id === 'string'
              && publicShopResearch({ compatibility_dimensions:row.dimensions }).verifiedDimensions)) throw new Error('compatibility_invalid');
            compatibility.push(...batch);
          }
        } catch {
          console.error('Tienda: no se pudo verificar compatibilidad; recomendaciones deshabilitadas.');
          warning = 'Compatibilidad no disponible; no se muestran recomendaciones personalizadas.';
          compatibility = [];
        }
        const dimensions = new Map(compatibility.map(row => [row.product_id, row.dimensions]));
        let tracked = [];
        try {
          for (let offset=0;offset<rows.length;offset+=200) {
            const batch = await fetchShopJson(`${env.SUPABASE_URL}/rest/v1/shop_tracked_products?select=product_id,price,regular_price,currency,last_success_at,query_status,metadata&product_id=in.(${rows.slice(offset,offset+200).map(p=>p.id).join(',')})`, { headers }, fetcher);
            if (!Array.isArray(batch)) throw new Error('history_invalid');
            tracked.push(...batch);
          }
        } catch {
          console.error('Tienda: historial de precios no disponible; se muestran precios sin verificar.');
          warning = [warning, 'Historial pendiente de activacion o temporalmente no disponible; no se verificaron precios.'].filter(Boolean).join(' ');
          tracked = [];
        }
        const byId = new Map(tracked.map(p=>[p.product_id,p]));
        return { products: rows.map(p=>mapShopProduct({...p,compatibility_dimensions:dimensions.get(p.id)},byId.get(p.id),tracking)), warning };
      }
    } catch {
      console.error('Tienda: catalogo remoto no disponible; se ofrece catalogo general sin precios verificados.');
      warning = 'Catalogo remoto no disponible. Se muestran busquedas generales, no publicaciones ni precios verificados.';
    }
  } else warning = 'Catalogo remoto no configurado. Se muestran busquedas generales sin precios verificados.';
  return {
    products: Object.entries(staticCatalog).flatMap(([grupo,rows])=>rows.map(p=>mapShopProduct({...p,grupo},null,tracking,'static'))),
    warning: warning || 'Sin publicaciones incorporadas: catalogo general sin precios verificados.',
  };
}
