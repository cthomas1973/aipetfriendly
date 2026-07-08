export default async function handler(req, res) {
  const appId   = process.env.ML_APP_ID || '';
  const appSec  = process.env.ML_APP_SECRET || '';
  const refresh = process.env.ML_REFRESH_TOKEN || '';
  const r = { has_refresh: Boolean(refresh), refresh_prefix: refresh.slice(0,12), token: null, search: null };

  if (!refresh) return res.status(200).json(r);

  try {
    const tr = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: appId, client_secret: appSec, refresh_token: refresh }).toString(),
    });
    const td = await tr.json();
    r.token = { status: tr.status, ok: tr.ok, error: td.error, scope: (td.scope||'').slice(0,100) };
    const access = td.access_token || '';

    if (access) {
      const sr = await fetch('https://api.mercadolibre.com/sites/MLA/search?category=MLA1071&q=alimento+perro&limit=3', {
        headers: { Accept: 'application/json', Authorization: 'Bearer ' + access },
      });
      const sd = await sr.json();
      r.search = { status: sr.status, count: (sd.results||[]).length, error: sd.error,
        first: sd.results?.[0] ? { id: sd.results[0].id, price: sd.results[0].price, has_permalink: Boolean(sd.results[0].permalink), title: String(sd.results[0].title||'').slice(0,50) } : null };
    }
  } catch(e) { r.token = { error: String(e.message) }; }

  return res.status(200).json(r);
}
