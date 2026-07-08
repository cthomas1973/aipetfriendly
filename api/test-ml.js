export default async function handler(req, res) {
  const appId = process.env.ML_APP_ID || '';
  const appSecret = process.env.ML_APP_SECRET || '';
  let token = '';
  let tokenStatus = 0;
  let tokenScope = '';
  try {
    const tr = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: appId, client_secret: appSecret }).toString(),
    });
    tokenStatus = tr.status;
    const td = await tr.json();
    token = td.access_token || '';
    tokenScope = td.scope || td.error || '';
  } catch (e) { tokenScope = String(e.message); }

  const headers = { Accept: 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) };
  let searchStatus = 0;
  let firstProduct = null;
  let searchError = '';
  try {
    const sr = await fetch('https://api.mercadolibre.com/sites/MLA/search?category=MLA1071&sort=sold_quantity_desc&limit=5', { headers });
    searchStatus = sr.status;
    const sd = await sr.json();
    searchError = sd.error || '';
    if (Array.isArray(sd.results) && sd.results.length > 0) {
      const p = sd.results[0];
      firstProduct = { id: p.id, title: p.title, price: p.price, permalink: p.permalink };
    }
  } catch (e) { searchError = String(e.message); }

  return res.status(200).json({ tokenStatus, tokenScope: tokenScope.slice(0, 200), searchStatus, searchError, firstProduct });
}
