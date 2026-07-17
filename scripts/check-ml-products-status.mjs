#!/usr/bin/env node
/**
 * check-ml-products-status.mjs
 * Cron diario: revisa cada producto activo en beneficios_productos visitando
 * su URL real (permalink) en Mercado Libre y desactiva los que ya no existen
 * o estan pausados/cerrados.
 *
 * IMPORTANTE: no se usa el endpoint /items/{id} de la API porque los productos
 * cargados desde URLs tipo /p/MLAxxxx (ficha de catalogo con varios vendedores)
 * tienen un ID de catalogo, no un ID de publicacion/item real — consultarlos
 * contra /items/{id} da falsos positivos de "inactivo". En cambio, se visita
 * la URL real que ve el usuario y se buscan frases que ML muestra cuando una
 * publicacion ya no existe o fue pausada.
 *
 * Requiere GitHub Secrets: SUPABASE_URL, SUPABASE_SERVICE_KEY
 * Opcional (para el email de resumen): RESEND_API_KEY, EMAIL_FROM, ADMIN_NOTIFICATION_EMAIL
 * Si faltan las variables de email, el script sigue funcionando igual pero no envia el aviso.
 *
 * Medida de seguridad: si la mayoria de las consultas a ML devuelven bloqueo
 * (403/error de red/timeout), el script NO desactiva nada (para evitar apagar
 * todo el catalogo por un bloqueo temporal de IP) y termina con error para
 * que se note en el historial de Actions.
 */

const NOT_FOUND_PATTERNS = [
  /parece que esta p[aá]gina no existe/i,
  /no encontramos la p[aá]gina/i,
  /ya no se encuentra disponible/i,
  /esta publicaci[oó]n ha finalizado/i,
  /publicaci[oó]n pausada/i,
  /esta publicaci[oó]n fue pausada/i,
  /el producto que buscas no est[aá] disponible/i,
];

function escapeHtml(input) {
  return String(input ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function sendSummaryEmail({ total, activeCount, inactiveCount, blockedCount, inactiveProducts, aborted }) {
  const { RESEND_API_KEY, EMAIL_FROM, ADMIN_NOTIFICATION_EMAIL } = process.env;

  if (!RESEND_API_KEY || !ADMIN_NOTIFICATION_EMAIL) {
    console.log('\n[email] RESEND_API_KEY o ADMIN_NOTIFICATION_EMAIL no configurados, no se envia resumen por email.');
    return;
  }

  const emailFrom = EMAIL_FROM || 'AiPetFriendly <onboarding@resend.dev>';
  const subject = aborted
    ? `AiPetFriendly - Chequeo ML abortado (demasiados bloqueos)`
    : `AiPetFriendly - Chequeo ML: ${inactiveCount} inactivo(s) de ${total}`;

  const inactiveListHtml = inactiveProducts.length > 0
    ? `<ul>${inactiveProducts.map((p) => `<li><strong>${escapeHtml(p.mla_id)}</strong> - ${escapeHtml(String(p.title || '').slice(0, 80))}</li>`).join('')}</ul>`
    : '<p>Ninguno.</p>';

  const html = `
<!doctype html>
<html lang="es">
  <body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <h2>Resumen del chequeo de productos Mercado Libre</h2>
    ${aborted ? '<p style="color:#b45309;"><strong>Atencion:</strong> el chequeo se aborto sin desactivar productos porque hubo demasiados bloqueos de red/IP.</p>' : ''}
    <p><strong>Total de productos revisados:</strong> ${total}</p>
    <p><strong>Activos:</strong> ${activeCount}</p>
    <p><strong>Inactivos (desactivados):</strong> ${inactiveCount}</p>
    <p><strong>Sin verificar (bloqueados/error):</strong> ${blockedCount}</p>
    <h3>Productos marcados como inactivos</h3>
    ${inactiveListHtml}
    <p style="margin-top:20px;font-size:12px;color:#64748b;">Este email se envia automaticamente en cada ejecucion del workflow "Check ML Products Status".</p>
  </body>
</html>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [ADMIN_NOTIFICATION_EMAIL],
        subject,
        html,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(`[email] Error enviando resumen: ${JSON.stringify(payload)}`);
      return;
    }

    console.log(`[email] Resumen enviado a ${ADMIN_NOTIFICATION_EMAIL} (id: ${payload?.id || 'sin id'})`);
  } catch (err) {
    console.error(`[email] Error de red enviando resumen: ${err.message}`);
  }
}

async function fetchAllActiveProducts(supabaseUrl, supabaseKey) {
  const params = new URLSearchParams({
    select: 'id,mla_id,title,permalink',
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

// Resultado posible por producto: 'active' | 'inactive' | 'blocked' (no se pudo verificar)
async function checkPermalinkStatus(permalink) {
  if (!permalink) return 'blocked';

  try {
    const res = await fetch(permalink, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 404) return 'inactive';
    if (res.status === 403 || res.status === 429) return 'blocked';
    if (!res.ok) return 'blocked';

    const html = await res.text();
    const isNotFound = NOT_FOUND_PATTERNS.some(pattern => pattern.test(html));
    return isNotFound ? 'inactive' : 'active';
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

  const products = await fetchAllActiveProducts(supabaseUrl, SUPABASE_SERVICE_KEY);
  console.log(`[supabase] Productos activos a verificar: ${products.length}\n`);

  if (products.length === 0) {
    console.log('No hay productos activos para verificar.');
    await sendSummaryEmail({
      total: 0,
      activeCount: 0,
      inactiveCount: 0,
      blockedCount: 0,
      inactiveProducts: [],
      aborted: false,
    });
    return;
  }

  let blockedCount = 0;
  let inactiveCount = 0;
  let activeCount = 0;
  const toDeactivate = [];

  for (const product of products) {
    const status = await checkPermalinkStatus(product.permalink);

    if (status === 'blocked') {
      blockedCount++;
      console.log(`[?] ${product.mla_id} — no se pudo verificar (bloqueo/error de red/timeout)`);
    } else if (status === 'inactive') {
      inactiveCount++;
      toDeactivate.push(product);
      console.log(`[X] ${product.mla_id} — INACTIVO en ML: "${String(product.title || '').slice(0, 50)}"`);
    } else {
      activeCount++;
    }

    // Pausa breve entre requests para no saturar
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n=== RESUMEN: ${activeCount} activos, ${inactiveCount} inactivos, ${blockedCount} sin verificar ===`);

  // Medida de seguridad: si mas de la mitad de las consultas fueron bloqueadas,
  // no confiamos en los resultados y no desactivamos nada.
  const blockedRatio = blockedCount / products.length;
  if (blockedRatio > 0.5) {
    console.error(`\n[ALERTA] ${Math.round(blockedRatio * 100)}% de las consultas fueron bloqueadas por ML.`);
    console.error('[ALERTA] No se desactiva ningun producto para evitar falsos positivos masivos.');
    await sendSummaryEmail({
      total: products.length,
      activeCount,
      inactiveCount,
      blockedCount,
      inactiveProducts: toDeactivate,
      aborted: true,
    });
    process.exit(1);
  }

  if (toDeactivate.length === 0) {
    console.log('\nTodos los productos verificados siguen activos. Nada que hacer.');
    await sendSummaryEmail({
      total: products.length,
      activeCount,
      inactiveCount,
      blockedCount,
      inactiveProducts: toDeactivate,
      aborted: false,
    });
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

  await sendSummaryEmail({
    total: products.length,
    activeCount,
    inactiveCount,
    blockedCount,
    inactiveProducts: toDeactivate,
    aborted: false,
  });

  console.log('\n=== Verificacion completada ===');
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
