#!/usr/bin/env node
/**
 * sync-ml-products.mjs
 * Cron job diario: busca productos mas vendidos en Mercado Libre y los guarda en Supabase.
 * Corre via GitHub Actions (IPs de GitHub, que ML no bloquea como si hace con Vercel).
 *
 * Requiere las siguientes variables de entorno (GitHub Secrets):
 *   ML_REFRESH_TOKEN   — token de refresco OAuth ML
 *   ML_APP_ID          — client_id de la app ML
 *   ML_APP_SECRET      — client_secret de la app ML
 *   SUPABASE_URL       — https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY — service_role key (bypassa RLS para escribir)
 *   ML_AFFILIATE_TEMPLATE — template de afiliado (para extraer matt_tool)
 */

const ML_CATEGORY = 'MLA1071'; // Animales y Mascotas en Argentina

// Cada job define: grupo, pet_types y query de busqueda.
// El cron trae los 5 mas vendidos por job → ~50 productos por ejecucion diaria.
// Con upsert por mla_id los duplicados se actualizan (precio, thumbnail al dia).
const SEARCH_JOBS = [
  { grupo: 'alimentos',  pet_types: ['perro'],        q: 'alimento balanceado perro adulto', limit: 5 },
  { grupo: 'alimentos',  pet_types: ['perro'],        q: 'purina pro plan perro',            limit: 5 },
  { grupo: 'alimentos',  pet_types: ['gato'],         q: 'alimento balanceado gato adulto',  limit: 5 },
  { grupo: 'alimentos',  pet_types: ['gato'],         q: 'excellent adulto gato',            limit: 5 },
  { grupo: 'accesorios', pet_types: ['perro'],        q: 'correa pretal collar perro',       limit: 5 },
  { grupo: 'accesorios', pet_types: ['perro', 'gato'],q: 'transportadora bolso mascota',     limit: 5 },
  { grupo: 'higiene',    pet_types: ['perro'],        q: 'shampoo antipulgas perro',         limit: 5 },
  { grupo: 'higiene',    pet_types: ['gato'],         q: 'arena sanitaria gato',             limit: 5 },
  { grupo: 'descanso',   pet_types: ['perro'],        q: 'cama colchoneta perro',            limit: 5 },
  { grupo: 'descanso',   pet_types: ['gato'],         q: 'rascador arbol gato',              limit: 5 },
];

function getMattTool(template = '') {
  try { return new URL(template).searchParams.get('matt_tool') || ''; } catch {}
  return template.match(/[?&]matt_tool=([^&\s]+)/)?.[1] || '';
}

async function getMlAccessToken() {
  const { ML_REFRESH_TOKEN, ML_APP_ID, ML_APP_SECRET } = process.env;
  if (!ML_REFRESH_TOKEN || !ML_APP_ID || !ML_APP_SECRET) {
    throw new Error('Faltan env vars ML_REFRESH_TOKEN / ML_APP_ID / ML_APP_SECRET');
  }

  const res = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: ML_APP_ID,
      client_secret: ML_APP_SECRET,
      refresh_token: ML_REFRESH_TOKEN,
    }).toString(),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Error obteniendo token ML: ${JSON.stringify(data)}`);
  }
  console.log(`[token] OK — expires_in: ${data.expires_in}s, scope includes read: ${String(data.scope).includes('read')}`);
  return data.access_token;
}

async function searchMlProducts(q, accessToken, limit = 5) {
  const url = new URL('https://api.mercadolibre.com/sites/MLA/search');
  url.searchParams.set('category', ML_CATEGORY);
  url.searchParams.set('q', q);
  url.searchParams.set('sort', 'sold_quantity_desc');
  url.searchParams.set('limit', String(limit));

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text();
    console.warn(`[ML search] ${res.status} para "${q}": ${body.slice(0, 120)}`);
    return [];
  }

  const data = await res.json();
  return Array.isArray(data.results) ? data.results : [];
}

async function upsertToSupabase(products) {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Faltan env vars SUPABASE_URL / SUPABASE_SERVICE_KEY');
  }

  // Supabase REST API upsert (no necesita npm module)
  const res = await fetch(`${SUPABASE_URL}/rest/v1/beneficios_productos`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(products),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase upsert error ${res.status}: ${body.slice(0, 200)}`);
  }
}

async function main() {
  console.log(`\n=== sync-ml-products ${new Date().toISOString()} ===\n`);

  const accessToken = await getMlAccessToken();
  const mattTool = getMattTool(process.env.ML_AFFILIATE_TEMPLATE || '');
  console.log(`[config] matt_tool: ${mattTool || '(no configurado)'}\n`);

  let totalInserted = 0;

  for (const job of SEARCH_JOBS) {
    console.log(`[job] grupo=${job.grupo} pet_types=${job.pet_types.join(',')} q="${job.q}"`);

    try {
      const results = await searchMlProducts(job.q, accessToken, job.limit);
      console.log(`       → ${results.length} productos encontrados en ML`);

      if (results.length === 0) continue;

      const toUpsert = results
        .filter(p => p.id && p.permalink)
        .map(p => {
          const mlaId = String(p.id);
          const permalink = String(p.permalink);
          const shippingInfo = p.shipping || {};
          const logistic = String(shippingInfo.logistic_type || '').toLowerCase();
          return {
            mla_id:        mlaId,
            url_ml:        permalink,
            permalink,
            title:         String(p.title || ''),
            thumbnail:     String(p.thumbnail || '').replace('-I.jpg', '-O.jpg'),
            price:         Number(p.price) > 0 ? Number(p.price) : null,
            grupo:         job.grupo,
            pet_types:     job.pet_types,
            free_shipping: Boolean(shippingInfo.free_shipping),
            fast_delivery: ['fulfillment', 'cross_docking'].includes(logistic),
            active:        true,
            source:        'auto',
            updated_at:    new Date().toISOString(),
          };
        });

      if (toUpsert.length > 0) {
        await upsertToSupabase(toUpsert);
        console.log(`       → ${toUpsert.length} upserted en Supabase`);
        totalInserted += toUpsert.length;
      }

      // Pausa entre requests para no saturar la API
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      console.error(`       → ERROR: ${err.message}`);
    }
  }

  console.log(`\n=== Sync completado: ${totalInserted} productos guardados/actualizados ===`);
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
