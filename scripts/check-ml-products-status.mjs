#!/usr/bin/env node
/**
 * check-ml-products-status.mjs
 * Cron diario: revisa cada producto activo en beneficios_productos visitando
 * su URL real (permalink) en Mercado Libre y desactiva los que ya no existen
 * o estan pausados/cerrados. Tambien extrae el precio actual de la ficha
 * (JSON-LD/meta tags) y lo actualiza en Supabase si cambio, para que la app
 * (que lee beneficios_productos.price) muestre siempre el precio vigente.
 *
 * IMPORTANTE: no se usa el endpoint /items/{id} de la API porque los productos
 * cargados desde URLs tipo /p/MLAxxxx (ficha de catalogo con varios vendedores)
 * tienen un ID de catalogo, no un ID de publicacion/item real — consultarlos
 * contra /items/{id} da falsos positivos de "inactivo". En cambio, se visita
 * la URL real que ve el usuario y se buscan frases que ML muestra cuando una
 * publicacion ya no existe o fue pausada.
 *
 * IMPORTANTE (bloqueo anti-bot de ML): Mercado Libre bloquea el trafico de
 * IPs de datacenter/cloud (Vercel, GitHub Actions) tanto en su API oficial
 * como al visitar la ficha del producto (muestra un muro de login en vez del
 * HTML real). Por eso la extraccion de precio solo funciona de forma
 * confiable ejecutando este script MANUALMENTE desde una PC con conexion
 * residencial normal (no desde el cron de GitHub Actions).
 *
 * Requiere: SUPABASE_URL, SUPABASE_SERVICE_KEY
 * Opcional (para el email de resumen): RESEND_API_KEY, EMAIL_FROM, ADMIN_NOTIFICATION_EMAIL
 * Si faltan las variables de email, el script sigue funcionando igual pero no envia el aviso.
 *
 * Uso local (PC, no GitHub Actions): completa .env.local con las variables
 * de arriba (ver .env.local.example) y ejecuta:
 *   npm run check-ml-prices
 *
 * Medida de seguridad: si la mayoria de las consultas a ML devuelven bloqueo
 * (403/error de red/timeout), el script NO desactiva nada (para evitar apagar
 * todo el catalogo por un bloqueo temporal de IP) y termina con error para
 * que se note en el historial de Actions.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Carga variables desde .env.local solo si no vinieron ya del entorno
// (en GitHub Actions siempre vienen inyectadas via `env:` del workflow, asi
// que este loader es un no-op ahi; solo aplica para corridas manuales locales).
function loadLocalEnvFile() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.join(scriptDir, '..', '.env.local');

  let content;
  try {
    content = readFileSync(envPath, 'utf8');
  } catch {
    return;
  }

  // Se parsea todo el archivo primero (si una clave esta repetida, gana la
  // ultima aparicion, igual que el comportamiento habitual de un .env), y
  // recien despues se aplica a process.env sin pisar variables ya definidas
  // por el entorno real (por ejemplo, las inyectadas en GitHub Actions).
  const parsed = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      parsed[key] = value;
    }
  }

  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadLocalEnvFile();

const NOT_FOUND_PATTERNS = [
  /parece que esta p[aá]gina no existe/i,
  /no encontramos la p[aá]gina/i,
  /ya no se encuentra disponible/i,
  /esta publicaci[oó]n ha finalizado/i,
  /publicaci[oó]n pausada/i,
  /esta publicaci[oó]n fue pausada/i,
  /el producto que buscas no est[aá] disponible/i,
];

// Muro anti-bot / login que ML muestra en vez de la ficha real cuando detecta
// trafico automatizado. La pagina responde 200 OK pero no trae datos del
// producto (ni precio), asi que hay que distinguirla de un "activo real".
const BOT_WALL_PATTERNS = [
  /registrationType=negative_traffic/i,
  /para continuar,?\s*ingresa\s*a\s*tu\s*cuenta/i,
  /loginType=negative_traffic/i,
];

function escapeHtml(input) {
  return String(input ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function sendSummaryEmail({ total, activeCount, inactiveCount, blockedCount, priceUpdatedCount, wallCount, inactiveProducts, aborted }) {
  const { RESEND_API_KEY, EMAIL_FROM, ADMIN_NOTIFICATION_EMAIL } = process.env;

  if (!RESEND_API_KEY || !ADMIN_NOTIFICATION_EMAIL) {
    console.log('\n[email] RESEND_API_KEY o ADMIN_NOTIFICATION_EMAIL no configurados, no se envia resumen por email.');
    return;
  }

  const isPlaceholderFrom = !EMAIL_FROM || /tu-dominio\.com/i.test(EMAIL_FROM);
  if (isPlaceholderFrom && EMAIL_FROM) {
    console.log('[email] EMAIL_FROM parece un placeholder sin editar, se usa el remitente de prueba de Resend.');
  }
  const emailFrom = isPlaceholderFrom ? 'AiPetFriendly <onboarding@resend.dev>' : EMAIL_FROM;
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
    <p><strong>Precios actualizados:</strong> ${priceUpdatedCount ?? 0}</p>
    <p><strong>Con muro anti-bot de ML (no se pudo leer precio):</strong> ${wallCount ?? 0}</p>
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
    select: 'id,mla_id,title,permalink,price',
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

async function updateProductPrice(supabaseUrl, supabaseKey, id, price) {
  const res = await fetch(`${supabaseUrl}/rest/v1/beneficios_productos?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ price, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Error actualizando precio ${id}: ${res.status} ${await res.text()}`);
}

// Busca el precio actual del producto en el HTML de la ficha (JSON-LD o meta tags).
// Devuelve null si no lo encuentra o no se puede parsear con confianza.
function extractPriceFromHtml(html) {
  const ldJsonBlocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];

  for (const block of ldJsonBlocks) {
    const jsonText = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
    try {
      const parsed = JSON.parse(jsonText);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];

      for (const candidate of candidates) {
        const offers = candidate?.offers;
        const offerList = Array.isArray(offers) ? offers : offers ? [offers] : [];

        for (const offer of offerList) {
          const price = Number(offer?.price);
          if (Number.isFinite(price) && price > 0) {
            return price;
          }
        }
      }
    } catch {
      continue;
    }
  }

  const metaItemprop = html.match(/itemprop=["']price["']\s+content=["']([\d.,]+)["']/i);
  if (metaItemprop) {
    const parsed = Number(metaItemprop[1].replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  const metaProductPrice = html.match(/property=["']product:price:amount["']\s+content=["']([\d.,]+)["']/i);
  if (metaProductPrice) {
    const parsed = Number(metaProductPrice[1].replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

// Resultado posible por producto: 'active' | 'inactive' | 'blocked' (no se pudo verificar)
async function checkPermalinkStatus(permalink) {
  if (!permalink) return { status: 'blocked', price: null, wall: false };

  try {
    const res = await fetch(permalink, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 404) return { status: 'inactive', price: null, wall: false };
    if (res.status === 403 || res.status === 429) return { status: 'blocked', price: null, wall: false };
    if (!res.ok) return { status: 'blocked', price: null, wall: false };

    const html = await res.text();
    const isNotFound = NOT_FOUND_PATTERNS.some(pattern => pattern.test(html));
    if (isNotFound) {
      return { status: 'inactive', price: null, wall: false };
    }

    const isBotWall = BOT_WALL_PATTERNS.some(pattern => pattern.test(html));
    if (isBotWall) {
      // Se mantiene como 'active' (no desactivar por esto), pero se marca
      // wall:true para que el resumen explique por que no se leyo el precio.
      return { status: 'active', price: null, wall: true };
    }

    return { status: 'active', price: extractPriceFromHtml(html), wall: false };
  } catch {
    return { status: 'blocked', price: null, wall: false };
  }
}

// Fallback de precio via API oficial de ML (autenticada con OAuth). Solo se usa
// cuando el scraping de la ficha no pudo leer el precio (muro anti-bot). Es un
// mecanismo distinto al scraping: request autenticado con credenciales propias,
// no un intento de evadir deteccion anti-bot.
async function getMlAccessToken() {
  const { ML_REFRESH_TOKEN, ML_APP_ID, ML_APP_SECRET } = process.env;
  if (!ML_REFRESH_TOKEN || !ML_APP_ID || !ML_APP_SECRET) {
    return null;
  }

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
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
      console.error(`[ml-api] No se pudo obtener token: ${JSON.stringify(data)}`);
      return null;
    }

    return data.access_token;
  } catch (err) {
    console.error(`[ml-api] Error obteniendo token: ${err.message}`);
    return null;
  }
}

async function fetchMlItemPrice(mlaId, accessToken) {
  const itemId = String(mlaId || '').replace(/-/g, '');
  if (!itemId || !accessToken) return null;

  try {
    const res = await fetch(`https://api.mercadolibre.com/items/${encodeURIComponent(itemId)}?attributes=price`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      if (process.env.ML_API_DEBUG) {
        const body = await res.text().catch(() => '');
        console.error(`[ml-api-debug] ${itemId} -> ${res.status}: ${body.slice(0, 200)}`);
      }
      return null;
    }

    const data = await res.json().catch(() => ({}));
    const price = Number(data?.price);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
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

  const mlAccessToken = await getMlAccessToken();
  console.log(mlAccessToken
    ? '[ml-api] Token obtenido, se usara como respaldo de precio cuando el scraping falle.\n'
    : '[ml-api] Sin credenciales ML_REFRESH_TOKEN/ML_APP_ID/ML_APP_SECRET, no hay respaldo de API para precio.\n');

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
  let priceUpdatedCount = 0;
  let wallCount = 0;
  const toDeactivate = [];

  for (const product of products) {
    const { status, price, wall } = await checkPermalinkStatus(product.permalink);

    if (status === 'blocked') {
      blockedCount++;
      console.log(`[?] ${product.mla_id} — no se pudo verificar (bloqueo/error de red/timeout)`);
    } else if (status === 'inactive') {
      inactiveCount++;
      toDeactivate.push(product);
      console.log(`[X] ${product.mla_id} — INACTIVO en ML: "${String(product.title || '').slice(0, 50)}"`);
    } else {
      activeCount++;

      let resolvedPrice = price;
      let priceSource = 'html';

      if (resolvedPrice === null && mlAccessToken) {
        resolvedPrice = await fetchMlItemPrice(product.mla_id, mlAccessToken);
        priceSource = 'api';
      }

      if (resolvedPrice !== null && Number(product.price) !== resolvedPrice) {
        try {
          await updateProductPrice(supabaseUrl, SUPABASE_SERVICE_KEY, product.id, resolvedPrice);
          priceUpdatedCount++;
          console.log(`[$ ${priceSource}] ${product.mla_id} — precio actualizado: ${product.price ?? 'sin dato'} -> ${resolvedPrice}`);
        } catch (err) {
          console.error(`[$] ${product.mla_id} — error actualizando precio: ${err.message}`);
        }
      } else if (wall && resolvedPrice === null) {
        wallCount++;
        console.log(`[!] ${product.mla_id} — ML mostro el muro anti-bot/login y la API tampoco devolvio precio`);
      }
    }

    // Pausa breve entre requests para no saturar
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n=== RESUMEN: ${activeCount} activos, ${inactiveCount} inactivos, ${blockedCount} sin verificar, ${priceUpdatedCount} precios actualizados, ${wallCount} con muro anti-bot ===`);

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
      priceUpdatedCount,
      wallCount,
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
      priceUpdatedCount,
      wallCount,
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
    priceUpdatedCount,
    wallCount,
    inactiveProducts: toDeactivate,
    aborted: false,
  });

  console.log('\n=== Verificacion completada ===');
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
