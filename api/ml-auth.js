// Callback de OAuth ML. Configurar en ML Developers como redirect_uri:
//   https://aipetfriendly.ar/api/ml-auth
// Despues de autorizar, esta pagina muestra el refresh_token para copiar a Vercel.
export default async function handler(req, res) {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('<h2>Falta el parametro code. Asegurate de llegar aqui desde ML.</h2>');
  }

  const appId     = process.env.ML_APP_ID     || '';
  const appSecret = process.env.ML_APP_SECRET  || '';
  const redirectUri = 'https://aipetfriendly.ar/api/ml-auth';

  try {
    const tr = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        client_id:     appId,
        client_secret: appSecret,
        code,
        redirect_uri:  redirectUri,
      }).toString(),
    });
    const data = await tr.json();

    if (!tr.ok) {
      return res.status(200).send(`<h2>Error obteniendo token</h2><pre>${JSON.stringify(data, null, 2)}</pre>`);
    }

    const refreshToken = data.refresh_token || '';
    const accessToken  = data.access_token  || '';

    return res.status(200).send(`
      <html><head><meta charset="utf-8"><title>ML Auth OK</title>
      <style>body{font-family:sans-serif;padding:2rem;max-width:800px}
      code{display:block;background:#f0f0f0;padding:1rem;margin:0.5rem 0;word-break:break-all;border-radius:6px}
      .box{border:2px solid #00a650;border-radius:8px;padding:1rem;margin-bottom:1rem}
      </style></head><body>
      <h1>? Autorizacion exitosa</h1>
      <div class="box">
        <p><strong>Paso 1:</strong> En Vercel &rarr; Settings &rarr; Environment Variables, agrega esta variable y hace redeploy:</p>
        <p><strong>Nombre:</strong> <code>ML_REFRESH_TOKEN</code></p>
        <p><strong>Valor:</strong> <code>${refreshToken}</code></p>
      </div>
      <p><em>El access_token actual (valido 6h): <code>${accessToken.slice(0,30)}...</code></em></p>
      <p><em>Una vez configurado ML_REFRESH_TOKEN en Vercel, la pestaña Beneficios va a traer productos reales con precios.</em></p>
      </body></html>
    `);
  } catch (e) {
    return res.status(200).send(`<h2>Error: ${e.message}</h2>`);
  }
}
