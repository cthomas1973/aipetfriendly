// api/cron/generate-blog-post.js
//
// Vercel Cron Job (ver "crons" en vercel.json) que corre cada 2 dias y
// genera automaticamente un BORRADOR para el blog "Tips del dia":
//   1. Busca noticias recientes en SerpApi (Google News) sobre un tema que
//      rota entre 4 fijos, para no gastar de mas la cuota mensual gratuita.
//   2. Le pide a la IA (mismo proveedor que el consultorio, ver AI_API_KEY /
//      AI_MODEL / AI_BASE_URL) que elija la mejor noticia y redacte un
//      articulo corto en tono "influencer veterinario".
//   3. Genera una imagen con DALL-E (mismo AI_API_KEY) y la sube a Supabase
//      Storage (bucket "blog-images", publico).
//   4. Inserta el post en la tabla blog_posts (ver migracion 041) con
//      status='draft': NO se publica solo. Un admin lo revisa/edita y lo
//      aprueba desde el panel Admin > Blog (ver migracion 042 y
//      AdminBlogSection.tsx) antes de que aparezca en /blog.
//
// Seguridad: si existe la variable de entorno CRON_SECRET, se exige el header
// "Authorization: Bearer <CRON_SECRET>" (Vercel Cron lo envia automaticamente
// cuando esa variable esta configurada en el proyecto). Sin esa variable, el
// endpoint queda abierto solo a llamadas GET (pensado para probarlo a mano
// mientras se configura, pero se recomienda definir CRON_SECRET en produccion).

import { createClient } from '@supabase/supabase-js';

// SerpApi + IA de texto + IA de imagen + upload pueden tardar mas de los 10s
// que da Vercel Hobby por defecto; 60s es el maximo permitido en ese plan.
export const config = { maxDuration: 60 };

// Temas fijos entre los que rota la busqueda diaria (1 por dia, sin repetir
// el mismo tema 2 dias seguidos gracias al modulo por dia-del-anio). Con 1
// busqueda/dia esto usa como mucho ~31 llamadas/mes a SerpApi, muy por debajo
// de la cuota gratuita de 250/mes.
const TOPICS = [
  'alimentacion y nutricion para perros y gatos',
  'salud preventiva, vacunas y desparasitacion en mascotas',
  'comportamiento, adiestramiento y bienestar emocional de perros y gatos',
  'cuidados generales, higiene y primeros auxilios para mascotas',
];

// Frases cliche de IA que le pedimos explicitamente a el modelo que evite,
// para que el texto suene mas a una persona real y menos a un articulo
// generico generado en masa.
const BANNED_CLICHES = [
  'en el mundo de las mascotas',
  'en la actualidad',
  'sin duda alguna',
  'no cabe duda',
  'cabe destacar',
  'es importante mencionar que',
  'en conclusion',
  'a lo largo de los anios',
  'como duenio responsable',
];

function getEnvOrThrow(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function getSupabaseAdminClient() {
  const supabaseUrl = getEnvOrThrow('SUPABASE_URL');
  const serviceRoleKey = getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(supabaseUrl, serviceRoleKey);
}

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

function isAuthorizedCronRequest(req) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) {
    // Sin CRON_SECRET configurado no podemos validar el origen: se permite
    // igual (util mientras se prueba a mano) pero se loguea la advertencia.
    console.warn('CRON_SECRET no configurado: el endpoint de cron queda sin autenticacion.');
    return true;
  }

  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  return authHeader === `Bearer ${secret}`;
}

function pickTodayTopic() {
  const startOfYear = Date.UTC(new Date().getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((Date.now() - startOfYear) / (24 * 60 * 60 * 1000));
  return TOPICS[dayOfYear % TOPICS.length];
}

function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function ensureUniqueSlug(admin, baseSlug) {
  let candidate = baseSlug || 'post';
  let suffix = 2;
  // El volumen de posts es bajo (1/dia), asi que un loop simple alcanza.
  for (;;) {
    const { data, error } = await admin
      .from('blog_posts')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle();

    if (error) {
      throw new Error(`No se pudo validar unicidad de slug: ${error.message}`);
    }
    if (!data) {
      return candidate;
    }
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

async function fetchNewsSnippets(topic) {
  const apiKey = getEnvOrThrow('SERPAPI_KEY');
  const params = new URLSearchParams({
    engine: 'google_news',
    q: topic,
    hl: 'es',
    gl: 'ar',
    api_key: apiKey,
  });

  const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`SerpApi respondio con status ${response.status}`);
  }

  const data = await response.json();
  const results = Array.isArray(data.news_results) ? data.news_results : [];

  return results.slice(0, 10).map((item) => ({
    title: item.title || '',
    snippet: item.snippet || '',
    source: item.source?.name || item.source || 'Fuente no identificada',
    link: item.link || '',
  }));
}

async function callAiTextModel(prompt) {
  const apiKey = getEnvOrThrow('AI_API_KEY');
  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Fallo la llamada al modelo de texto (status ${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

function parseArticleJson(rawText) {
  const start = rawText.indexOf('{');
  const end = rawText.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('La IA no devolvio un JSON valido para el articulo.');
  }

  const parsed = JSON.parse(rawText.slice(start, end + 1));
  if (!parsed.title || !parsed.content) {
    throw new Error('El JSON del articulo no tiene title/content.');
  }

  return {
    title: String(parsed.title).trim(),
    content: String(parsed.content).trim(),
    sourceName: parsed.source_name ? String(parsed.source_name).trim() : null,
    estimatedReadingTime: Number.isFinite(Number(parsed.estimated_reading_time))
      ? Math.max(1, Math.round(Number(parsed.estimated_reading_time)))
      : Math.max(1, Math.round(String(parsed.content).split(/\s+/).length / 200)),
  };
}

async function generateArticleFromNews(topic, newsItems) {
  const newsBlock = newsItems
    .map((item, index) => `${index + 1}. Titulo: ${item.title}\n   Resumen: ${item.snippet}\n   Fuente: ${item.source}`)
    .join('\n');

  const prompt = [
    'Sos una veterinaria influencer que escribe para el blog de AiPetFriendly, una app de cuidado de mascotas.',
    `Tema del dia: ${topic}.`,
    'A continuacion hay 10 noticias recientes sobre el tema. Elegi la que te parezca mas util o interesante para duenios de perros y gatos (no tiene que ser literalmente sobre la noticia, podes usarla como disparador de un consejo practico).',
    newsBlock,
    '',
    'Escribi un articulo original en espanol de entre 300 y 400 palabras, en primera persona, con tono calido, cercano y profesional (como una veterinaria que realmente quiere ayudar, no un articulo generico de blog).',
    'Estructura obligatoria dentro del campo "content":',
    '- Un parrafo de apertura enganchando con el tema.',
    '- Uno o dos parrafos de desarrollo con informacion util y concreta.',
    '- Un parrafo final que empiece exactamente con "💡 Consejo practico:" seguido de un consejo accionable.',
    'NO incluyas el titulo ni una linea de "Visto en" dentro de "content" (eso se muestra aparte).',
    `Evita por completo estas frases cliche: ${BANNED_CLICHES.join(', ')}.`,
    'Separa los parrafos de "content" con una linea en blanco.',
    '',
    'Respondé UNICAMENTE con un JSON valido (sin texto extra antes ni despues), con esta forma exacta:',
    '{"title": "...", "content": "...", "source_name": "...", "estimated_reading_time": 2}',
    'Donde "source_name" es el medio de la noticia que elegiste (una de las 10 de arriba) y "estimated_reading_time" es un numero entero de minutos de lectura.',
  ].join('\n');

  const rawResponse = await callAiTextModel(prompt);
  return parseArticleJson(rawResponse);
}

async function generateArticleImage(title) {
  const apiKey = getEnvOrThrow('AI_API_KEY');
  const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const imageModel = (process.env.AI_IMAGE_MODEL || 'dall-e-3').trim();
  console.log('generateArticleImage: baseUrl =', baseUrl, '| imageModel =', JSON.stringify(imageModel));

  const prompt = [
    'Fotografia editorial calida y realista para un blog de cuidado de mascotas.',
    `Tema: "${title}".`,
    'Mostra un perro o gato en una situacion cotidiana relacionada al tema, luz natural, composicion profesional, sin texto ni logos en la imagen.',
  ].join(' ');

  // La API de imagenes de OpenAI ya no acepta "response_format" (rechaza el
  // parametro con "Unknown parameter" para cualquier modelo); simplemente no
  // lo mandamos y aceptamos que la respuesta venga en b64_json o en una url.
  const body = {
    model: imageModel,
    prompt,
    n: 1,
    size: '1024x1024',
  };

  const response = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Fallo la generacion de imagen (status ${response.status}, body enviado: ${JSON.stringify(body)}): ${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  const b64 = data.data?.[0]?.b64_json;
  if (b64) {
    return Buffer.from(b64, 'base64');
  }

  const imageUrl = data.data?.[0]?.url;
  if (!imageUrl) {
    throw new Error('La respuesta de generacion de imagen no trajo b64_json ni url.');
  }

  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`No se pudo descargar la imagen generada desde la url (status ${imageResponse.status}).`);
  }
  return Buffer.from(await imageResponse.arrayBuffer());
}

async function uploadImageToStorage(admin, slug, imageBuffer) {
  const fileName = `${slug}-${Date.now()}.png`;

  let { error: uploadError } = await admin.storage.from('blog-images').upload(fileName, imageBuffer, {
    contentType: 'image/png',
    upsert: false,
  });

  if (uploadError && /not found|bucket/i.test(uploadError.message || '')) {
    const { error: createBucketError } = await admin.storage.createBucket('blog-images', { public: true });
    if (createBucketError && !/already exists/i.test(createBucketError.message || '')) {
      throw new Error(`No se pudo crear el bucket blog-images: ${createBucketError.message}`);
    }
    const retry = await admin.storage.from('blog-images').upload(fileName, imageBuffer, {
      contentType: 'image/png',
      upsert: false,
    });
    uploadError = retry.error;
  }

  if (uploadError) {
    throw new Error(`No se pudo subir la imagen del post: ${uploadError.message}`);
  }

  const { data: publicUrlData } = admin.storage.from('blog-images').getPublicUrl(fileName);
  return publicUrlData?.publicUrl || null;
}

async function alreadyHasPostToday(admin) {
  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);

  const { data, error } = await admin
    .from('blog_posts')
    .select('id')
    .gte('created_at', startOfDayUtc.toISOString())
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo verificar si ya existe un post de hoy: ${error.message}`);
  }

  return Boolean(data);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  if (!isAuthorizedCronRequest(req)) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }

  try {
    const admin = getSupabaseAdminClient();

    if (await alreadyHasPostToday(admin)) {
      return sendJson(res, 200, { skipped: true, reason: 'Ya existe un post generado hoy.' });
    }

    const topic = pickTodayTopic();
    const newsItems = await fetchNewsSnippets(topic);

    if (newsItems.length === 0) {
      throw new Error(`SerpApi no devolvio noticias para el tema "${topic}".`);
    }

    const article = await generateArticleFromNews(topic, newsItems);
    const baseSlug = slugify(article.title);
    const slug = await ensureUniqueSlug(admin, baseSlug);

    let imageUrl = null;
    try {
      const imageBuffer = await generateArticleImage(article.title);
      imageUrl = await uploadImageToStorage(admin, slug, imageBuffer);
    } catch (imageError) {
      // La imagen es un extra: si falla (por ejemplo, la cuenta de IA no
      // tiene acceso a generacion de imagenes), el post se publica igual sin
      // imagen en vez de perder el articulo del dia entero.
      console.error('No se pudo generar/subir la imagen del post (se continua sin imagen):', imageError);
    }

    const { data: inserted, error: insertError } = await admin
      .from('blog_posts')
      .insert({
        title: article.title,
        slug,
        content: article.content,
        image_url: imageUrl,
        source_name: article.sourceName,
        estimated_reading_time: article.estimatedReadingTime,
        status: 'draft',
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`No se pudo guardar el post: ${insertError.message}`);
    }

    return sendJson(res, 200, {
      created: true,
      topic,
      post: { id: inserted.id, slug: inserted.slug, title: inserted.title, hasImage: Boolean(imageUrl), status: inserted.status },
    });
  } catch (error) {
    console.error('Error generando el post diario del blog:', error);
    return sendJson(res, 500, { error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
