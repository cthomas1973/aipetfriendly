// api/cron/generate-blog-post.js
//
// Vercel Cron Job (ver "crons" en vercel.json) que corre cada 2 dias y
// genera automaticamente un BORRADOR para el blog "Tips del dia":
//   1. Busca noticias recientes en SerpApi (Google News) sobre un subtema
//      que rota evitando los usados en los ultimos 10 posts (ver pickTopic),
//      para no gastar de mas la cuota mensual gratuita ni repetir siempre el
//      mismo eje (ej. alimentacion).
//   2. Le pide a la IA (mismo proveedor que el consultorio, ver AI_API_KEY /
//      AI_MODEL / AI_BASE_URL) que elija la mejor noticia y redacte un
//      articulo corto en tono "influencer veterinario", usando como ejemplo
//      una especie/raza (ver pickPetFocus) que tampoco se haya repetido en
//      los ultimos 10 posts.
//   3. Genera una imagen con DALL-E (mismo AI_API_KEY) protagonizada por esa
//      misma especie/raza, coherente con el tema del articulo, y la sube a
//      Supabase Storage (bucket "blog-images", publico).
//   4. Inserta el post en la tabla blog_posts (ver migraciones 041 y 050)
//      con status='draft': NO se publica solo. Un admin lo revisa/edita y lo
//      aprueba desde el panel Admin > Blog (ver migracion 042 y
//      AdminBlogSection.tsx) antes de que aparezca en /blog.
//   5. Crea el borrador de publicacion social (Admin > Publicaciones) con la
//      imagen ya brandeada. El video Ken Burns NO se genera aca (necesita
//      mucho tiempo y este cron ya gasta su presupuesto en SerpApi/IA texto/
//      IA imagen): lo genera un segundo cron, ver generate-blog-social-video.js.
//
// Seguridad: si existe la variable de entorno CRON_SECRET, se exige el header
// "Authorization: Bearer <CRON_SECRET>" (Vercel Cron lo envia automaticamente
// cuando esa variable esta configurada en el proyecto). Sin esa variable, el
// endpoint queda abierto solo a llamadas GET (pensado para probarlo a mano
// mientras se configura, pero se recomienda definir CRON_SECRET en produccion).

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// SerpApi + IA de texto + IA de imagen + upload pueden tardar mas de los 10s
// que da Vercel Hobby por defecto; 60s es el maximo permitido en ese plan.
export const config = { maxDuration: 60 };

// Dominio publico usado para el link al articulo y para descargar el logo
// que se estampa en la imagen de la publicacion social (ver
// createSocialDraftFromBlogPost). Mismo default que send-blog-post-notifications.
const SITE_URL = (process.env.APP_BASE_URL || 'https://www.aipetfriendly.ar').replace(/\/$/, '');
export { SITE_URL };


// Subtemas fijos entre los que rota la busqueda diaria (1 por dia). Antes
// eran solo 4 temas muy amplios (rotando por dia-del-anio), lo que hacia que
// el mismo eje (ej. alimentacion) apareciera muy seguido. Con esta lista mas
// granular + el chequeo de los ultimos 10 posts (ver pickTopic) alcanza para
// no repetir subtema dentro de esa ventana. Con 1 busqueda/dia esto usa como
// mucho ~31 llamadas/mes a SerpApi, muy por debajo de la cuota gratuita de
// 250/mes.
const TOPICS = [
  'alimentacion y nutricion para perros y gatos',
  'alimentacion mixta y snacks saludables para mascotas',
  'salud preventiva, vacunas y desparasitacion en mascotas',
  'chequeos veterinarios y deteccion temprana de enfermedades en mascotas',
  'comportamiento y adiestramiento de perros y gatos',
  'bienestar emocional y enriquecimiento ambiental para mascotas',
  'cuidados generales e higiene para mascotas',
  'primeros auxilios y emergencias con mascotas',
  'ejercicio, paseos y actividad fisica para perros y gatos',
  'cuidado de mascotas segun la edad (cachorros, adultos y mayores)',
  'convivencia entre mascotas y otros animales o ninos',
  'cuidado dental en perros y gatos',
];

// Especies/razas entre las que rota la mascota protagonista de la imagen (y,
// cuando encaje naturalmente, del ejemplo usado en el articulo), para que no
// se repita siempre el mismo animal (ver pickPetFocus).
const PET_FOCUS_OPTIONS = [
  'perro mestizo',
  'perro labrador retriever',
  'perro golden retriever',
  'perro caniche/poodle',
  'perro bulldog frances',
  'perro pastor aleman',
  'perro chihuahua',
  'perro border collie',
  'perro salchicha/dachshund',
  'gato mestizo domestico',
  'gato siames',
  'gato persa',
  'gato naranja/atigrado',
  'gato negro',
  'gato de bengala',
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

export { getEnvOrThrow };

export function getSupabaseAdminClient() {
  const supabaseUrl = getEnvOrThrow('SUPABASE_URL');
  // SUPABASE_SERVICE_KEY es el nombre usado en .env.local/otros scripts locales;
  // en Vercel la variable esta cargada como SUPABASE_SERVICE_ROLE_KEY.
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || getEnvOrThrow('SUPABASE_SERVICE_KEY');
  return createClient(supabaseUrl, serviceRoleKey);
}

export function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

export function isAuthorizedCronRequest(req) {
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

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Trae el valor de `column` de los ultimos `limit` posts (mas recientes
// primero), para poder excluirlos al elegir el subtema/mascota del post de
// hoy y asi evitar que se repitan dentro de esa ventana.
async function fetchRecentValues(admin, column, limit) {
  const { data, error } = await admin
    .from('blog_posts')
    .select(column)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    // No bloqueamos la generacion del post por esto: sin historial reciente
    // simplemente no se excluye nada.
    console.error(`No se pudo leer el historial de "${column}" para variedad:`, error);
    return [];
  }

  return (data || []).map((row) => row[column]).filter(Boolean);
}

// Elige el subtema de hoy evitando los usados en los ultimos 10 posts. Si
// todos los subtemas ya aparecieron en esa ventana (lista corta o racha
// larga sin cortes), se relaja la exclusion al post mas reciente nomas, para
// no bloquear la generacion.
async function pickTopic(admin) {
  const recentTopics = new Set(await fetchRecentValues(admin, 'topic', 10));
  let candidates = TOPICS.filter((topic) => !recentTopics.has(topic));

  if (candidates.length === 0) {
    const lastTopic = [...recentTopics][0] || null;
    candidates = TOPICS.filter((topic) => topic !== lastTopic);
  }
  if (candidates.length === 0) {
    candidates = TOPICS;
  }

  return pickRandom(candidates);
}

// Guias ya publicadas (ver public/guides-feed.json, generado en cada build
// por scripts/generate-sitemap.mjs a partir de src/data/petGuides.ts). Se
// trae por HTTP en vez de importar el .ts directamente porque esta funcion
// corre como JS plano en Vercel, sin paso de compilacion de TypeScript.
async function fetchPublishedGuides() {
  try {
    const response = await fetch(`${SITE_URL}/guides-feed.json`);
    if (!response.ok) {
      console.warn(`No se pudo traer guides-feed.json (status ${response.status}).`);
      return [];
    }
    const guides = await response.json();
    return Array.isArray(guides) ? guides : [];
  } catch (err) {
    console.warn('No se pudo traer guides-feed.json:', err.message ?? err);
    return [];
  }
}

// Elige una guia para enlazar desde el post de hoy (enlace interno real
// blog->guias, ver migracion 053), evitando las usadas en los ultimos 8
// posts para que no se repita siempre la misma. Devuelve null si no hay
// guias publicadas o si fallo la consulta (el post se genera igual, sin
// guia relacionada).
async function pickRelatedGuide(admin) {
  const guides = await fetchPublishedGuides();
  if (guides.length === 0) {
    return null;
  }

  const recentSlugs = new Set(await fetchRecentValues(admin, 'related_guide_slug', 8));
  const candidates = guides.filter((guide) => !recentSlugs.has(guide.slug));

  return pickRandom(candidates.length > 0 ? candidates : guides);
}

function getPetSpecies(focus) {
  return focus.startsWith('perro') ? 'perro' : 'gato';
}

// Elige la especie/raza protagonista de la imagen (y, si encaja, del ejemplo
// del articulo). Alterna la especie respecto del post inmediatamente
// anterior (perro <-> gato) para no encadenar varios seguidos de la misma
// (antes solo se excluia la raza exacta, lo que permitia varias razas de
// gato distintas seguidas) y, dentro de esa especie, evita las razas usadas
// en los ultimos 10 posts para tambien variar la raza.
async function pickPetFocus(admin) {
  const recentFocus = await fetchRecentValues(admin, 'pet_focus', 10);
  const lastSpecies = recentFocus.length > 0 ? getPetSpecies(recentFocus[0]) : null;
  const targetSpecies = lastSpecies === 'perro' ? 'gato' : lastSpecies === 'gato' ? 'perro' : null;

  const pool = targetSpecies
    ? PET_FOCUS_OPTIONS.filter((focus) => getPetSpecies(focus) === targetSpecies)
    : PET_FOCUS_OPTIONS;

  const recentFocusSet = new Set(recentFocus);
  let candidates = pool.filter((focus) => !recentFocusSet.has(focus));

  if (candidates.length === 0) {
    candidates = pool;
  }

  return pickRandom(candidates);
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

export async function callAiTextModel(prompt) {
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

async function generateArticleFromNews(topic, newsItems, petFocus, relatedGuide) {
  const newsBlock = newsItems
    .map((item, index) => `${index + 1}. Titulo: ${item.title}\n   Resumen: ${item.snippet}\n   Fuente: ${item.source}`)
    .join('\n');

  const relatedGuideInstruction = relatedGuide
    ? `Tenemos una guia propia relacionada llamada "${relatedGuide.title}". En el ultimo parrafo, despues de la sugerencia practica, sumá una recomendacion natural y breve invitando a leerla completa en AiPetFriendly (mencionando su titulo tal cual, sin inventar un link).`
    : '';

  const prompt = [
    'Sos una veterinaria influencer que escribe para el blog de AiPetFriendly, una app de cuidado de mascotas.',
    `Tema del dia: ${topic}.`,
    'A continuacion hay 10 noticias recientes sobre el tema. Elegi la que te parezca mas util o interesante para duenios de perros y gatos (no tiene que ser literalmente sobre la noticia, podes usarla como disparador de una sugerencia practica).',
    newsBlock,
    '',
    'Escribi un articulo original en espanol de entre 650 y 850 palabras, en primera persona, con tono calido, cercano y profesional (como una veterinaria que realmente quiere ayudar, no un articulo generico de blog). Tiene que aportar informacion realmente util y especifica, no relleno.',
    `Si encaja de forma natural con el tema, usa como ejemplo o protagonista de algun caso a un(a) ${petFocus} (sin forzarlo: si el tema no lo permite, mantene el articulo general para perros y gatos).`,
    'Estructura obligatoria dentro del campo "content" (parrafos separados por linea en blanco, sin markdown ni titulos con #):',
    '- Un parrafo de apertura enganchando con el tema.',
    '- Dos o tres parrafos de desarrollo con contexto e informacion util y concreta (podes basarte en la noticia elegida).',
    '- Tres parrafos cortos de sugerencias practicas y accionables, cada uno empezando exactamente con "Sugerencia 1:", "Sugerencia 2:" y "Sugerencia 3:" respectivamente, con una sugerencia distinta y especifica en cada uno (no repitas la misma idea con otras palabras). NUNCA uses la palabra "consejo"/"consejos", usa siempre "sugerencia"/"sugerencias".',
    '- Un parrafo final que empiece exactamente con "💡 Para cerrar:" con una reflexion breve que cierre el tema.',
    relatedGuideInstruction,
    'NO incluyas el titulo ni una linea de "Visto en" dentro de "content" (eso se muestra aparte).',
    `Evita por completo estas frases cliche: ${BANNED_CLICHES.join(', ')}.`,
    'Separa los parrafos de "content" con una linea en blanco.',
    '',
    'Respondé UNICAMENTE con un JSON valido (sin texto extra antes ni despues), con esta forma exacta:',
    '{"title": "...", "content": "...", "source_name": "...", "estimated_reading_time": 2}',
    'Donde "source_name" es el medio de la noticia que elegiste (una de las 10 de arriba) y "estimated_reading_time" es un numero entero de minutos de lectura.',
  ]
    .filter(Boolean)
    .join('\n');

  const rawResponse = await callAiTextModel(prompt);
  return parseArticleJson(rawResponse);
}

async function generateArticleImage(title, topic, petFocus) {
  const apiKey = getEnvOrThrow('AI_API_KEY');
  const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const imageModel = (process.env.AI_IMAGE_MODEL || 'dall-e-3').trim();
  console.log('generateArticleImage: baseUrl =', baseUrl, '| imageModel =', JSON.stringify(imageModel));

  const prompt = [
    'Fotografia editorial calida y realista para un blog de cuidado de mascotas.',
    `Tema del articulo: "${title}" (eje general: ${topic}).`,
    `Protagonista: un(a) ${petFocus}, en una situacion cotidiana coherente con el tema del articulo.`,
    'La imagen debe ilustrar claramente la escena del tema (por ejemplo, si el tema es alimentacion mostralo comiendo o con su plato; si es adiestramiento mostralo en una sesion de entrenamiento; si es salud/veterinaria mostralo en una revision), luz natural, composicion profesional, sin texto ni logos en la imagen.',
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

// Extrae un parrafo corto en texto plano del articulo para usar como "gancho"
// en la publicacion social (a falta de un campo de tip dedicado, se reusa el
// arranque del contenido en vez de sumar otra llamada a la IA solo para esto).
function buildSocialTipExcerpt(content) {
  const plain = String(content || '')
    .replace(/[#*_>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (plain.length <= 220) {
    return plain;
  }

  const cut = plain.slice(0, 220);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 100 ? lastSpace : 220)}...`;
}

// El archivo del logo (public/logo-aipetfriendly.png) tiene un fondo solido
// color crema (no un PNG con canal alpha real), asi que al estamparlo se veia
// como un sello rectangular invasivo. Esto le quita ese fondo con un
// chroma-key simple: toma el color de la esquina superior izquierda como
// "fondo" y vuelve transparente cualquier pixel lo bastante parecido a ese
// color, con un borde suave (feather) para que el contorno del icono no
// quede dentado. El resto del logo (verde/gris) queda intacto porque su
// distancia de color al crema es grande.
async function removeLogoBackground(logoBuffer) {
  const { data, info } = await sharp(logoBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const bg = [data[0], data[1], data[2]];
  const THRESHOLD = 45;
  const FEATHER = 25;

  for (let i = 0; i < data.length; i += channels) {
    const dr = data[i] - bg[0];
    const dg = data[i + 1] - bg[1];
    const db = data[i + 2] - bg[2];
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);

    if (distance <= THRESHOLD) {
      data[i + 3] = 0;
    } else if (distance <= THRESHOLD + FEATHER) {
      data[i + 3] = Math.round(data[i + 3] * ((distance - THRESHOLD) / FEATHER));
    }
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

// Fuente usada para el titulo estampado sobre la imagen. Se bundlea junto a
// esta funcion (ver api/cron/assets/) para no depender de fuentes del
// sistema operativo, que no existen en el runtime serverless de Vercel.
// Baloo 2 es una tipografia redondeada y descontracturada (menos formal que
// una geometrica clasica), acorde al tono amigable de la marca.
const TITLE_FONT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets', 'Baloo2-Bold.ttf');
const TITLE_FONT_FAMILY = 'Baloo 2';
export { TITLE_FONT_PATH, TITLE_FONT_FAMILY };

function escapePangoMarkup(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Renderiza el titulo como texto (blanco, negrita) con sharp+pango, probando
// tamanos de fuente de mayor a menor hasta que el bloque de texto entre en
// una altura razonable (para no terminar con un banner gigante en titulos
// muy largos). Devuelve el buffer RGBA crudo mas sus dimensiones.
async function renderTitleText(title, maxTextWidth, maxTextHeight) {
  const markup = `<span foreground="#ffffff" font_weight="bold">${escapePangoMarkup(title)}</span>`;
  const fontSizes = [
    Math.round(maxTextWidth * 0.056),
    Math.round(maxTextWidth * 0.048),
    Math.round(maxTextWidth * 0.041),
    Math.round(maxTextWidth * 0.035),
  ];

  let last = null;
  for (const fontSize of fontSizes) {
    const rendered = await sharp({
      text: {
        text: markup,
        font: `${TITLE_FONT_FAMILY} ${fontSize}`,
        fontfile: TITLE_FONT_PATH,
        width: maxTextWidth,
        rgba: true,
        align: 'left',
        wrap: 'word',
        spacing: Math.round(fontSize * 0.15),
      },
    })
      .raw()
      .toBuffer({ resolveWithObject: true });

    last = rendered;
    if (rendered.info.height <= maxTextHeight) {
      return rendered;
    }
  }
  return last;
}

// Construye el banner superior: en vez de un rectangulo solido, el fondo es
// un recorte con blur de la propia foto (efecto "vidrio esmerilado"), con un
// tinte semitransparente en los colores de marca (emerald-600 -> emerald-900)
// encima para que el texto blanco siga siendo legible sin importar los
// colores de la imagen, y una linea de acento en amarillo. El titulo del
// articulo se renderiza en blanco encima. Se ubica arriba de todo para no
// tapar el sujeto principal de la foto (que suele estar centrado o hacia
// abajo).
async function buildTitleBanner(title, baseWidth, baseHeight, sourceImageBuffer) {
  const paddingX = Math.round(baseWidth * 0.045);
  const paddingY = Math.round(baseWidth * 0.028);
  const maxTextWidth = baseWidth - paddingX * 2;
  const maxTextHeight = Math.round(baseWidth * 0.3);

  const { data, info } = await renderTitleText(title, maxTextWidth, maxTextHeight);
  const bannerHeight = info.height + paddingY * 2;
  const accentHeight = Math.max(4, Math.round(baseWidth * 0.005));
  const blurSigma = Math.max(12, Math.round(baseWidth * 0.03));

  const cropHeight = Math.min(bannerHeight, baseHeight);
  const blurredBackground = await sharp(sourceImageBuffer)
    .extract({ left: 0, top: 0, width: baseWidth, height: cropHeight })
    .blur(blurSigma)
    .resize({ width: baseWidth, height: bannerHeight, fit: 'fill' })
    .toBuffer();

  const tintSvg = `
    <svg width="${baseWidth}" height="${bannerHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="t" x1="0" y1="0" x2="${baseWidth}" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#059669" stop-opacity="0.6" />
          <stop offset="1" stop-color="#022c22" stop-opacity="0.68" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${baseWidth}" height="${bannerHeight}" fill="url(#t)" />
      <rect x="0" y="${bannerHeight - accentHeight}" width="${baseWidth}" height="${accentHeight}" fill="#fbbf24" />
    </svg>
  `;

  const textPng = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png()
    .toBuffer();

  return sharp(blurredBackground)
    .composite([
      { input: Buffer.from(tintSvg), left: 0, top: 0 },
      { input: textPng, left: paddingX, top: paddingY },
    ])
    .png()
    .toBuffer();
}

// Calcula las 2 capas de branding (banner de titulo + logo) que se estampan
// sobre la imagen del articulo, SIN aplicarlas todavia. Se separo de
// buildBrandedSocialImage para poder reusar el mismo calculo de tamanios/
// posiciones tanto en la imagen fija (compuesta ahi mismo) como en el video
// Ken Burns (ver generate-blog-social-video.js), donde el banner y el logo
// se overlayan FIJOS encima del video ya animado en vez de zoomearse junto
// con el fondo.
export async function buildBrandingLayers(articleImageBuffer, title) {
  const logoResponse = await fetch(`${SITE_URL}/logo-aipetfriendly.png`);
  if (!logoResponse.ok) {
    throw new Error(`No se pudo descargar el logo (status ${logoResponse.status}).`);
  }
  const logoBuffer = Buffer.from(await logoResponse.arrayBuffer());
  const transparentLogo = await removeLogoBackground(logoBuffer);

  const baseMeta = await sharp(articleImageBuffer).metadata();
  const baseWidth = baseMeta.width || 1024;
  const baseHeight = baseMeta.height || 1024;

  const logoWidth = Math.round(baseWidth * 0.22);
  const resizedLogo = await sharp(transparentLogo).resize({ width: logoWidth }).png().toBuffer();
  const logoMeta = await sharp(resizedLogo).metadata();
  const padding = Math.round(baseWidth * 0.03);

  const logoLayer = {
    buffer: resizedLogo,
    width: logoMeta.width || logoWidth,
    height: logoMeta.height || 0,
    left: padding,
    top: Math.max(baseHeight - (logoMeta.height || 0) - padding, 0),
  };

  let bannerLayer = null;
  if (title && title.trim()) {
    const bannerBuffer = await buildTitleBanner(title.trim(), baseWidth, baseHeight, articleImageBuffer);
    const bannerMeta = await sharp(bannerBuffer).metadata();
    bannerLayer = {
      buffer: bannerBuffer,
      width: bannerMeta.width || baseWidth,
      height: bannerMeta.height || 0,
      left: 0,
      top: 0,
    };
  }

  return { baseWidth, baseHeight, logoLayer, bannerLayer };
}

// Estampa el titulo del articulo arriba (banner con degrade + tipografia
// clara) y el logo de AiPetFriendly (con el fondo ya removido, ver
// removeLogoBackground) en la esquina inferior izquierda de la imagen del
// articulo, para que la publicacion se identifique como propia y comunique
// el titulo de un vistazo al compartirse en redes, sin tapar la foto.
async function buildBrandedSocialImage(articleImageBuffer, title) {
  const { logoLayer, bannerLayer } = await buildBrandingLayers(articleImageBuffer, title);

  const composites = [{ input: logoLayer.buffer, left: logoLayer.left, top: logoLayer.top }];
  if (bannerLayer) {
    composites.unshift({ input: bannerLayer.buffer, left: bannerLayer.left, top: bannerLayer.top });
  }

  return sharp(articleImageBuffer)
    .composite(composites)
    .png()
    .toBuffer();
}

export async function uploadSocialDraftMedia(admin, slug, buffer, { extension, contentType, prefix = 'blog' }) {
  const fileName = `${prefix}-${slug}-${Date.now()}.${extension}`;
  const bucket = 'social-posts-media';

  let { error: uploadError } = await admin.storage.from(bucket).upload(fileName, buffer, {
    contentType,
    upsert: false,
  });

  if (uploadError && /not found|bucket/i.test(uploadError.message || '')) {
    const { error: createBucketError } = await admin.storage.createBucket(bucket, { public: true });
    if (createBucketError && !/already exists/i.test(createBucketError.message || '')) {
      throw new Error(`No se pudo crear el bucket ${bucket}: ${createBucketError.message}`);
    }
    const retry = await admin.storage.from(bucket).upload(fileName, buffer, {
      contentType,
      upsert: false,
    });
    uploadError = retry.error;
  }

  if (uploadError) {
    throw new Error(`No se pudo subir la publicacion social: ${uploadError.message}`);
  }

  const { data: publicUrlData } = admin.storage.from(bucket).getPublicUrl(fileName);
  return publicUrlData?.publicUrl || null;
}

// Crea el borrador en social_posts (Admin > Publicaciones) con el titulo, la
// imagen (con el logo estampado, fondo removido) y el link al post. Queda en
// status='draft' esperando que un admin elija redes/horario y lo apruebe
// (ver admin_update_social_post, migracion 052). El video Ken Burns se
// genera despues, en un segundo cron con presupuesto de tiempo propio (ver
// api/cron/generate-blog-social-video.js), que actualiza este mismo registro
// cuando el video queda listo en vez de crear uno nuevo.
export async function createSocialDraftFromBlogPost(admin, { blogPost, articleImageBuffer }) {
  const { data: existing } = await admin
    .from('social_posts')
    .select('id')
    .eq('source', 'blog_auto')
    .eq('source_ref_id', blogPost.id)
    .maybeSingle();

  if (existing) {
    return;
  }

  const brandedImageBuffer = await buildBrandedSocialImage(articleImageBuffer, blogPost.title);
  const mediaUrl = await uploadSocialDraftMedia(admin, blogPost.slug, brandedImageBuffer, { extension: 'png', contentType: 'image/png' });

  if (!mediaUrl) {
    return;
  }

  const articleUrl = `${SITE_URL}/blog/${blogPost.slug}`;
  const tip = buildSocialTipExcerpt(blogPost.content);
  const caption = `📰 ${blogPost.title}\n\n${tip}\n\nLeé la nota completa 👉 ${articleUrl}\n\n🐾 AiPetFriendly`;

  const { error } = await admin.from('social_posts').insert({
    media_url: mediaUrl,
    media_type: 'image',
    caption,
    status: 'draft',
    source: 'blog_auto',
    source_ref_id: blogPost.id,
  });

  if (error) {
    throw new Error(`No se pudo crear el borrador de publicacion social: ${error.message}`);
  }
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

    const topic = await pickTopic(admin);
    const petFocus = await pickPetFocus(admin);
    const relatedGuide = await pickRelatedGuide(admin);
    const newsItems = await fetchNewsSnippets(topic);

    if (newsItems.length === 0) {
      throw new Error(`SerpApi no devolvio noticias para el tema "${topic}".`);
    }

    const article = await generateArticleFromNews(topic, newsItems, petFocus, relatedGuide);
    const baseSlug = slugify(article.title);
    const slug = await ensureUniqueSlug(admin, baseSlug);

    let imageUrl = null;
    let imageBuffer = null;
    try {
      imageBuffer = await generateArticleImage(article.title, topic, petFocus);
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
        topic,
        pet_focus: petFocus,
        related_guide_slug: relatedGuide?.slug || null,
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`No se pudo guardar el post: ${insertError.message}`);
    }

    if (imageBuffer) {
      try {
        await createSocialDraftFromBlogPost(admin, { blogPost: inserted, articleImageBuffer: imageBuffer });
      } catch (socialError) {
        // Igual que la imagen: el borrador de redes es un extra, no debe tirar
        // abajo la generacion del post del blog si falla.
        console.error('No se pudo crear el borrador de publicacion social (se continua igual):', socialError);
      }
    }

    return sendJson(res, 200, {
      created: true,
      topic,
      petFocus,
      post: { id: inserted.id, slug: inserted.slug, title: inserted.title, hasImage: Boolean(imageUrl), status: inserted.status },
    });
  } catch (error) {
    console.error('Error generando el post diario del blog:', error);
    return sendJson(res, 500, { error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
