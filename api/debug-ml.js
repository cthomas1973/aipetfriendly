export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const appId = process.env.ML_APP_ID || '';
  const appSecret = process.env.ML_APP_SECRET || '';
  const result = { env: { has_ML_APP_ID: Boolean(appId), ML_APP_ID_prefix: appId.slice(0,6), has_ML_APP_SECRET: Boolean(appSecret) }, token: null, searches: [] };

  let accessToken = '';
  try {
    const tr = await fetch('https://api.mercadolibre.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: appId, client_secret: appSecret }).toString() });
    const td = await tr.json();
    accessToken = td.access_token || '';
    result.token = { status: tr.status, ok: tr.ok, scope: td.scope, token_type: td.token_type };
  } catch (e) { result.token = { error: String(e.message) }; }

  const ah = { Accept: 'application/json', ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}) };
  const nh = { Accept: 'application/json' };

  const tests = [
    ['CON token - solo q', ah, 'https://api.mercadolibre.com/sites/MLA/search?q=alimento+perro&limit=3'],
    ['CON token - cat sin sort', ah, 'https://api.mercadolibre.com/sites/MLA/search?category=MLA1071&q=alimento&limit=3'],
    ['CON token - sort=relevance', ah, 'https://api.mercadolibre.com/sites/MLA/search?category=MLA1071&q=alimento&sort=relevance&limit=3'],
    ['CON token - sort=sold_quantity_desc', ah, 'https://api.mercadolibre.com/sites/MLA/search?category=MLA1071&q=alimento&sort=sold_quantity_desc&limit=3'],
    ['SIN token - solo q', nh, 'https://api.mercadolibre.com/sites/MLA/search?q=alimento+perro&limit=3'],
  ];

  for (const [label, headers, url] of tests) {
    try {
      const r = await fetch(url, { headers });
      const d = await r.json();
      const f = Array.isArray(d.results) ? d.results[0] : null;
      result.searches.push({ label, status: r.status, count: Array.isArray(d.results) ? d.results.length : 0, error: d.error || null, first: f ? { id: f.id, price: f.price, title: String(f.title||'').slice(0,50), permalink: f.permalink } : null });
    } catch (e) { result.searches.push({ label, error: String(e.message) }); }
  }

  return res.status(200).json(result);
}
