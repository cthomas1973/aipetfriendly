// api/content-status.js
//
// Intercepta (via vercel.json) las rutas de detalle /blog/:slug y /guias/:slug
// para devolver un HTTP 404 real cuando el contenido no existe, en lugar del
// 200 que siempre entrega el rewrite catch-all a index.html (la app es una SPA
// 100% client-side, sin SSR). Ademas (PASO 17), inyecta en el HTML el
// title/description/canonical/robots reales del articulo o la guia (si
// existe) o unos de "no encontrado" sin canonical (si no existe), en vez de
// servir siempre el mismo index.html sin cambios: antes de este paso, un
// articulo/guia inexistente quedaba con el <link rel="canonical"> apuntando a
// la Home, lo cual es exactamente lo que se busca evitar.
//
// Guias: se valida contra public/guides-feed.json (generado en cada build por
// scripts/generate-sitemap.mjs a partir de src/data/petGuides.ts). Es el mismo
// archivo que ya usa api/admin/generate-guide-reel.js para no tener que
// parsear el .ts desde una funcion serverless (ver ese archivo). Se trae por
// HTTP desde el propio deployment (mismo patron que generate-guide-reel.js),
// no por filesystem, para no depender de que el bundler de la funcion incluya
// un archivo generado recien en el build. El propio feed ya trae title+summary
// de cada guia, asi que no hace falta ninguna consulta adicional para armar
// los metadatos.
//
// LIMITACION CONOCIDA: guides-feed.json solo lista guias YA publicadas
// (respeta el escalonado de 7 dias de src/data/petGuides.ts) y no contempla el
// bypass de administrador que permite previsualizar una guia todavia no
// publicada (parametro isAdmin de getPetGuideBySlug): esta funcion no tiene
// forma de saber si el visitante es admin (no recibe su sesion). Un admin que
// entre por URL directa a una guia pendiente vera aqui un 404 HTTP, aunque el
// panel admin SI se la muestre del lado del cliente. Caso de uso raro (el
// admin previsualiza desde el panel, no por URL directa), documentado como
// limitacion aceptada de este paso.
//
// Articulos de blog: se valida con la misma RPC de Supabase que usa el
// cliente (get_blog_post_by_slug), tratando una fila sin id como "no existe"
// (mismo chequeo que fetchBlogPostBySlug en src/lib/supabase.ts). Usa las
// mismas env vars que ya usan otras funciones de api/ para esto (SUPABASE_URL
// + VITE_SUPABASE_ANON_KEY), no hace falta ninguna variable nueva ni la
// service role key: es de solo lectura con la key anonima, igual que en el
// cliente. La misma fila que devuelve la RPC ya trae title+content, que es lo
// que usa el cliente (BlogSection.tsx) para el title/description de la
// pagina: no hace falta ninguna consulta adicional.
//
// Si la validacion en si falla (red, Supabase caido, env vars faltantes), NO
// se trata como "no existe": se responde 503 con el HTML original sin tocar
// (no se sabe si el contenido existe o no, asi que no se inventan metadatos)
// para no ocultar/des-indexar contenido real por un error transitorio.

import { createClient } from '@supabase/supabase-js';
import { injectPageMeta, buildCanonicalUrl, resolveBlogDescription, SITE_DESCRIPTION_DEFAULT } from '../shared/seoMeta.mjs';

const CACHE_TTL_MS = 60_000;
let indexHtmlCache = { html: null, fetchedAt: 0 };
let guidesBySlugCache = { map: null, fetchedAt: 0 };

function getOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

async function getIndexHtml(origin) {
  const now = Date.now();
  if (indexHtmlCache.html && now - indexHtmlCache.fetchedAt < CACHE_TTL_MS) {
    return indexHtmlCache.html;
  }
  const response = await fetch(`${origin}/index.html`);
  if (!response.ok) {
    throw new Error(`No se pudo obtener index.html (status ${response.status}).`);
  }
  const html = await response.text();
  indexHtmlCache = { html, fetchedAt: now };
  return html;
}

async function getPublishedGuidesBySlug(origin) {
  const now = Date.now();
  if (guidesBySlugCache.map && now - guidesBySlugCache.fetchedAt < CACHE_TTL_MS) {
    return guidesBySlugCache.map;
  }
  const response = await fetch(`${origin}/guides-feed.json`);
  if (!response.ok) {
    throw new Error(`No se pudo obtener guides-feed.json (status ${response.status}).`);
  }
  const feed = await response.json();
  const map = new Map((Array.isArray(feed) ? feed : []).map((guide) => [guide.slug, guide]));
  guidesBySlugCache = { map, fetchedAt: now };
  return map;
}

// Devuelve la fila completa del post (title/content incluidos) o null si no
// existe un post publicado con ese slug.
async function fetchBlogPost(slug) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error('Faltan las variables de entorno SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
  }
  const supabase = createClient(supabaseUrl, anonKey);
  const { data, error } = await supabase.rpc('get_blog_post_by_slug', { p_slug: slug });
  if (error) {
    throw error;
  }
  if (!data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.id == null) return null;
  return row;
}

// Devuelve el objeto completo de la guia (title/summary incluidos) o null si
// no hay ninguna guia publicada con ese slug.
async function fetchGuide(origin, slug) {
  const map = await getPublishedGuidesBySlug(origin);
  return map.get(slug) || null;
}

function sendHtml(res, status, html) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(html);
}

export default async function handler(req, res) {
  const origin = getOrigin(req);
  const type = String(req.query.type || '');
  const slug = String(req.query.slug || '').trim();

  if (!slug || (type !== 'blog' && type !== 'guia')) {
    // No deberia pasar: vercel.json solo reescribe hacia aqui desde
    // /blog/:slug y /guias/:slug con type+slug explicitos en la query. Si
    // pasa igual, no se inventa un 404: se sirve el index tal cual, igual que
    // el catch-all generico.
    try {
      return sendHtml(res, 200, await getIndexHtml(origin));
    } catch {
      return res.status(500).send('Internal Server Error');
    }
  }

  try {
    const content = type === 'blog' ? await fetchBlogPost(slug) : await fetchGuide(origin, slug);
    const html = await getIndexHtml(origin);

    if (!content) {
      const notFoundHtml = injectPageMeta(html, {
        title: type === 'blog' ? 'Articulo no encontrado | AiPetFriendly' : 'Guía no encontrada | AiPetFriendly',
        description: SITE_DESCRIPTION_DEFAULT,
        canonicalUrl: null,
        robots: 'noindex, follow',
      });
      return sendHtml(res, 404, notFoundHtml);
    }

    const title = `${content.title} | AiPetFriendly`;
    const description =
      type === 'blog'
        ? resolveBlogDescription(content.meta_description, content.content, SITE_DESCRIPTION_DEFAULT)
        : String(content.summary || '');
    const canonicalUrl = buildCanonicalUrl(type === 'blog' ? `/blog/${slug}` : `/guias/${slug}`);
    const foundHtml = injectPageMeta(html, { title, description, canonicalUrl, robots: 'index, follow' });
    return sendHtml(res, 200, foundHtml);
  } catch (err) {
    console.error('content-status: error validando existencia de contenido', {
      type,
      slug,
      message: err instanceof Error ? err.message : String(err),
    });
    try {
      const html = await getIndexHtml(origin);
      return sendHtml(res, 503, html);
    } catch {
      return res.status(503).send('Service Unavailable');
    }
  }
}
