export default async function handler(req, res) {
  const out = { timestamp: new Date().toISOString(), env: {}, token: {}, searches: [], beneficios_api: {} };

  // ENV
  const appId   = process.env.ML_APP_ID || '';
  const appSec  = process.env.ML_APP_SECRET || '';
  const refresh = process.env.ML_REFRESH_TOKEN || '';
  const tmpl    = process.env.ML_AFFILIATE_TEMPLATE || '';
  out.env = {
    ML_APP_ID: appId ? appId.slice(0,8)+'...' : 'NO CONFIGURADO',
    ML_APP_SECRET: appSec ? 'OK (oculto)' : 'NO CONFIGURADO',
    ML_REFRESH_TOKEN: refresh ? refresh.slice(0,12)+'...' : 'NO CONFIGURADO',
    ML_AFFILIATE_TEMPLATE: tmpl ? tmpl.slice(0,60)+'...' : 'NO CONFIGURADO',
    matt_tool: (()=>{ try { return new URL(tmpl).searchParams.get('matt_tool')||'no encontrado'; } catch { return tmpl.match(/matt_tool=([^&]+)/)?.[1]||'no encontrado'; }})(),
  };

  // TOKEN
  let access = '';
  if (refresh && appId && appSec) {
    try {
      const tr = await fetch('https://api.mercadolibre.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ grant_type: 'refresh_token', client_id: appId, client_secret: appSec, refresh_token: refresh }).toString(),
      });
      const td = await tr.json();
      access = td.access_token || '';
      out.token = { status: tr.status, ok: tr.ok, error: td.error||null, message: td.message||null, token_prefix: access.slice(0,20)||'(vacio)', expires_in: td.expires_in, scope_summary: (td.scope||'').includes('read') ? 'tiene READ' : 'SIN READ' };
    } catch(e) { out.token = { error: String(e.message) }; }
  } else {
    out.token = { skip: 'Faltan env vars para obtener token' };
  }

  // SEARCHES — probar distintas combinaciones
  const h = { Accept: 'application/json', ...(access ? { Authorization: 'Bearer '+access } : {}) };
  const nh = { Accept: 'application/json' };
  const tests = [
    ['1. CON token + cat + sold_qty_desc', h, 'https://api.mercadolibre.com/sites/MLA/search?category=MLA1071&q=alimento&sort=sold_quantity_desc&limit=3'],
    ['2. CON token + cat + sin sort', h, 'https://api.mercadolibre.com/sites/MLA/search?category=MLA1071&q=alimento&limit=3'],
    ['3. CON token + sin cat + sin sort', h, 'https://api.mercadolibre.com/sites/MLA/search?q=alimento+perro&limit=3'],
    ['4. SIN token + solo q', nh, 'https://api.mercadolibre.com/sites/MLA/search?q=alimento+perro&limit=3'],
    ['5. CON token + items_sold_desc', h, 'https://api.mercadolibre.com/sites/MLA/search?category=MLA1071&q=alimento&sort=items_sold_desc&limit=3'],
    ['6. CON token + site search (sin q)', h, 'https://api.mercadolibre.com/sites/MLA/search?category=MLA1071&limit=3'],
  ];
  for (const [label, headers, url] of tests) {
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      const f = Array.isArray(d.results) && d.results[0];
      out.searches.push({ label, status: r.status, count: Array.isArray(d.results)?d.results.length:0, error: d.error||null,
        first: f ? { id: f.id, price: f.price, has_permalink: Boolean(f.permalink), permalink_preview: (f.permalink||'').slice(0,60), title: String(f.title||'').slice(0,50) } : null });
    } catch(e) { out.searches.push({ label, network_error: String(e.message) }); }
  }

  // BENEFICIOS API — que devuelve actualmente
  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'aipetfriendly.ar';
    const br = await fetch(`https://${host}/api/beneficios?grupo=alimentos`, { signal: AbortSignal.timeout(10000) });
    const bd = await br.json();
    out.beneficios_api = { status: br.status, source: bd.source, products_count: Array.isArray(bd.products)?bd.products.length:0, mattTool: bd.mattTool,
      first_product: Array.isArray(bd.products)&&bd.products[0] ? { id: bd.products[0].id, title: bd.products[0].title?.slice(0,50), price: bd.products[0].price, link_preview: (bd.products[0].link||'').slice(0,70) } : null };
  } catch(e) { out.beneficios_api = { error: String(e.message) }; }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(out);
}
