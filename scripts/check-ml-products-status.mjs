#!/usr/bin/env node
/**
 * check-ml-products-status.mjs
 * Cron diario: revisa cada producto activo en beneficios_productos contra la
 * API de Mercado Libre (endpoint /items/{id}) y desactiva los que ya no
 * existen o estan pausados/cerrados.
 *
 * Requiere GitHub Secrets:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   ML_REFRESH_TOKEN, ML_APP_ID, ML_APP_SECRET (opcional, se intenta con y sin token)
 *
 * Medida de seguridad: si la mayoria de las consultas a ML devuelven 403/bloqueo,
 * el script NO desactiva nada (para evitar apagar todo el catalogo por un bloqueo
 * temporal de IP) y termina con error para que se note en el historial de Actions.
 */

function normalizeItemId(mlaId) {
  // beneficios_productos.mla_id se guarda como "MLA-1234567890"; el endpoint
  // /items/{id} de ML requiere el formato sin guion: "MLA1234567890".
  return String(mlaId || '').replace(/^MLA-?/i, 'MLA');
}

async function getMlAccessToken() {
  const { ML_REFRESH_TOKEN, ML_APP_ID, ML_APP_SECRET } = process.env;
  if (!ML_REFRESH_TOKEN || !ML_APP_ID || !ML_APP_SECRET) return '';

  try {
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
    return res.ok ? String(data.access_token || '') : '';
  } catch {
    return '';
  }
}

async function fetchAllActiveProducts(supabaseUrl, supabaseKey) {
  const params = new URLSearchParams({
    select: 'id,mla_id,title',
    active: 'eq.true',
    order: 'updated_at.asc',
  });
  const res = await fetch(`${supabaseUrl}/rest/v1/beneficios_productos?${params.toString()}`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Error listando productos: ${res.status} ${await res.text()}`);
  return res.json();
}

async function deactivateProduct(supabaseUrl, supabaseKey, id) {
  const res = await fetch(`${supabaseUrl}/rest/v1/beneficios_productos?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ active: false, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Error desactivando ${id}: ${res.status} ${await res.text()}`);
}

// Resultado posible por item: 'active' | 'inactive' | 'blocked' (no se pudo verificar)
async function checkItemStatus(itemId, accessToken) {
  const headers = { Accept: 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) };
  try {
    const res = await fetch(`https://api.mercadolibre.com/items/${encodeURIComponent(itemId)}`, { headers });

    if (res.status === 404) return 'inactive'; // publicacion eliminada
    if (res.status === 403 || res.status === 401) return 'blocked'; // bloqueo de IP o auth
    if (!res.ok) return 'blocked'; // otros errores: no confiar, no desactivar

    const data = await res.json();
    const status = String(data.status || '').toLowerCase();
    // Estados de ML: active, paused, closed, under_review, inactive, payment_required
    return status === 'active' ? 'active' : 'inactive';
  } catch {
    return 'blocked';
  }
}

async function main() {
  console.log(`\n=== check-ml-products-status ${new Date().toISOString()} ===\n`);

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY');
  }
  const supabaseUrl = SUPABASE_URL.replace(/\/+$/, '');

  const accessToken = await getMlAccessToken();
  console.log(`[token] ${accessToken ? 'obtenido' : 'no disponible, se consulta sin auth'}`);

  const products = await fetchAllActiveProducts(supabaseUrl, SUPABASE_SERVICE_KEY);
  console.log(`[supabase] Productos activos a verificar: ${products.length}\n`);

  if (products.length === 0) {
    console.log('No hay productos activos para verificar.');
    return;
  }

  let blockedCount = 0;
  let inactiveCount = 0;
  let activeCount = 0;
  const toDeactivate = [];

  for (const product of products) {
    const itemId = normalizeItemId(product.mla_id);
    const status = await checkItemStatus(itemId, accessToken);

    if (status === 'blocked') {
      blockedCount++;
      console.log(`[?] ${itemId} — no se pudo verificar (bloqueo/error de red)`);
    } else if (status === 'inactive') {
      inactiveCount++;
      toDeactivate.push(product);
      console.log(`[X] ${itemId} — INACTIVO en ML: "${String(product.title || '').slice(0, 50)}"`);
    } else {
      activeCount++;
    }

    // Pausa breve entre requests para no saturar
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n=== RESUMEN: ${activeCount} activos, ${inactiveCount} inactivos, ${blockedCount} sin verificar ===`);

  // Medida de seguridad: si mas de la mitad de las consultas fueron bloqueadas,
  // no confiamos en los resultados y no desactivamos nada.
  const blockedRatio = blockedCount / products.length;
  if (blockedRatio > 0.5) {
    console.error(`\n[ALERTA] ${Math.round(blockedRatio * 100)}% de las consultas fueron bloqueadas por ML.`);
    console.error('[ALERTA] No se desactiva ningun producto para evitar falsos positivos masivos.');
    process.exit(1);
  }

  if (toDeactivate.length === 0) {
    console.log('\nTodos los productos verificados siguen activos. Nada que hacer.');
    return;
  }

  console.log(`\nDesactivando ${toDeactivate.length} productos...`);
  for (const product of toDeactivate) {
    try {
      await deactivateProduct(supabaseUrl, SUPABASE_SERVICE_KEY, product.id);
      console.log(`  ✓ Desactivado: ${product.mla_id}`);
    } catch (err) {
      console.error(`  ✗ Error desactivando ${product.mla_id}: ${err.message}`);
    }
  }

  console.log('\n=== Verificacion completada ===');
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
