// Endpoint de diagnostico temporal — eliminar despues de resolver el problema.
// Acceder en: https://aipetfriendly.ar/api/debug-ml
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const result = {
    env: {
      has_ML_APP_ID: Boolean(process.env.ML_APP_ID),
      ML_APP_ID_preview: (process.env.ML_APP_ID || '').slice(0, 6) + '...',
      has_ML_APP_SECRET: Boolean(process.env.ML_APP_SECRET),
      has_ML_ACCESS_TOKEN: Boolean(process.env.ML_ACCESS_TOKEN),
      has_ML_AFFILIATE_TEMPLATE: Boolean(process.env.ML_AFFILIATE_TEMPLATE),
    },
    token_test: null,
    search_test: null,
  };

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
