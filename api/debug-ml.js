// Endpoint de diagnostico temporal — eliminar despues de resolver el problema.
// Acceder en: https://aipetfriendly.ar/api/debug-ml
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const appId = process.env.ML_APP_ID || '';
  const appSecret = process.env.ML_APP_SECRET || '';

  const result = {
    env: {
      has_ML_APP_ID: Boolean(appId),
      ML_APP_ID_preview: appId.slice(0, 6) + '...',
      has_ML_APP_SECRET: Boolean(appSecret),
    },
    token: null,
    searches: [],
  };

  // 1. Obtener token
  let accessToken = '';
  try {
    const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: appId,
        client_secret: appSecret,
      }).toString(),
    });
    const tokenData = await tokenRes.json();
    accessToken = tokenData.access_token || '';
    result.token = {
      status: tokenRes.status,
      ok: tokenRes.ok,
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
      scope: tokenData.scope,
    };
  } catch (e) {
    result.token = { error: String(e.message) };
  }

  // 2. Probar multiples variantes de busqueda
  const headers = {
    Accept: 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };

  const tests = [
    { label: 'solo q, sin sort, sin cat', url: 'https://api.mercadolibre.com/sites/MLA/search?q=alimento+perro&limit=3' },
    { label: 'categoria sin sort', url: 'https://api.mercadolibre.com/sites/MLA/search?category=MLA1071&q=alimento&limit=3' },
    { label: 'sort relevance', url: 'https://api.mercadolibre.com/sites/MLA/search?category=MLA1071&q=alimento&sort=relevance&limit=3' },
    { label: 'sold_quantity_desc', url: 'https://api.mercadolibre.com/sites/MLA/search?category=MLA1071&q=alimento&sort=sold_quantity_desc&limit=3' },
    { label: 'items_sold_desc', url: 'https://api.mercadolibre.com/sites/MLA/search?category=MLA1071&q=alimento&sort=items_sold_desc&limit=3' },
    { label: 'SIN auth - solo q', url: 'SIN_AUTH|https://api.mercadolibre.com/sites/MLA/search?q=alimento+perro&limit=3' },
  ];

  for (const test of tests) {
    try {
      const isNoAuth = test.url.startsWith('SIN_AUTH|');
      const url = isNoAuth ? test.url.replace('SIN_AUTH|', '') : test.url;
      const h = isNoAuth ? { Accept: 'application/json' } : headers;
      const r = await fetch(url, { headers: h });
      const d = await r.json();
      const firstResult = Array.isArray(d.results) ? d.results[0] : null;
      result.searches.push({
        label: test.label,
        status: r.status,
        count: Array.isArray(d.results) ? d.results.length : 0,
        error: d.error || null,
        first: firstResult ? { id: firstResult.id, price: firstResult.price, title: firstResult.title?.slice(0, 50), permalink: firstResult.permalink } : null,
      });
    } catch (e) {
      result.searches.push({ label: test.label, error: String(e.message) });
    }
  }

  return res.status(200).json(result);
}


  // 1. Intentar obtener token
  const appId = process.env.ML_APP_ID || '';
  const appSecret = process.env.ML_APP_SECRET || '';

  if (appId && appSecret) {
    try {
      const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: appId,
          client_secret: appSecret,
        }).toString(),
      });
      const tokenBody = await tokenRes.text();
      result.token_test = {
        status: tokenRes.status,
        ok: tokenRes.ok,
        body_preview: tokenBody.slice(0, 300),
      };

      // 2. Si obtuvimos token, probar búsqueda
      if (tokenRes.ok) {
        const tokenData = JSON.parse(tokenBody);
        const accessToken = tokenData.access_token || '';
        const searchRes = await fetch(
          'https://api.mercadolibre.com/sites/MLA/search?category=MLA1071&q=alimento+perro&sort=sold_quantity_desc&limit=3',
          { headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` } },
        );
        const searchBody = await searchRes.text();
        const searchData = JSON.parse(searchBody);
        result.search_test = {
          status: searchRes.status,
          ok: searchRes.ok,
          results_count: Array.isArray(searchData?.results) ? searchData.results.length : 0,
          first_product: searchData?.results?.[0]
            ? {
                id: searchData.results[0].id,
                title: searchData.results[0].title?.slice(0, 60),
                price: searchData.results[0].price,
                permalink: searchData.results[0].permalink,
              }
            : null,
          error: searchData?.error || null,
          message: searchData?.message || null,
        };
      }
    } catch (e) {
      result.token_test = { error: String(e.message) };
    }
  } else {
    // Probar sin token
    try {
      const searchRes = await fetch(
        'https://api.mercadolibre.com/sites/MLA/search?category=MLA1071&q=alimento+perro&limit=3',
        { headers: { Accept: 'application/json' } },
      );
      const searchBody = await searchRes.text();
      result.search_test = {
        status: searchRes.status,
        note: 'sin token (ML_APP_ID no configurado)',
        body_preview: searchBody.slice(0, 200),
      };
    } catch (e) {
      result.search_test = { error: String(e.message) };
    }
  }

  return res.status(200).json(result);
}
