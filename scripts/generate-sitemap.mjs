// Genera public/sitemap.xml a partir de las guias definidas en src/data/petGuides.ts.
// Se ejecuta automaticamente antes de cada build (ver "build" en package.json), asi que
// alcanza con agregar una guia nueva al array PET_GUIDES para que quede en el sitemap
// sin tener que tocar este archivo a mano.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const guidesFile = path.join(__dirname, '..', 'src', 'data', 'petGuides.ts');
const sitemapFile = path.join(__dirname, '..', 'public', 'sitemap.xml');
const guidesFeedFile = path.join(__dirname, '..', 'public', 'guides-feed.json');
const SITE_URL = 'https://www.aipetfriendly.ar';

// Trae los slugs de los posts del blog ya publicados (status='published') para
// incluirlos en el sitemap. Usa la key anonima (misma que el front) via la RPC
// publica list_blog_posts, asi que no requiere ningun secreto. Si las variables
// de entorno no estan disponibles (por ejemplo en un build local sin .env) o la
// consulta falla, se degrada sin romper el build: el sitemap sale sin el blog,
// igual que antes de este cambio.
async function fetchPublishedBlogPosts() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY no configuradas: el sitemap se genera sin el blog.');
    return [];
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const posts = [];
  const pageSize = 50;
  let offset = 0;

  try {
    // list_blog_posts limita cada pagina a 50 filas (ver migracion 041/042), asi
    // que paginamos hasta que una pagina vuelva incompleta.
    for (let page = 0; page < 20; page += 1) {
      const { data, error } = await supabase.rpc('list_blog_posts', { p_limit: pageSize, p_offset: offset });
      if (error) throw error;
      if (!data || data.length === 0) break;
      posts.push(...data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }
  } catch (err) {
    console.warn('No se pudieron obtener los posts del blog para el sitemap:', err.message ?? err);
    return [];
  }

  return posts;
}

const source = readFileSync(guidesFile, 'utf8');

// Extrae cada objeto de guia buscando slug/title/category/publishedAt/summary
// (+ coverImage.src si existe) dentro del array PET_GUIDES (los campos siempre
// aparecen en ese orden en cada guia). Se usa regex (no import directo) porque
// este script corre con Node sobre un .ts.
const guideBlockRegex =
  /slug:\s*'([^']+)'[\s\S]*?title:\s*'([^']+)'[\s\S]*?category:\s*'([^']+)'[\s\S]*?publishedAt:\s*'([^']+)'[\s\S]*?summary:\s*\n?\s*'([^']+)'(?:(?:(?!slug:)[\s\S])*?coverImage:\s*\{\s*src:\s*'([^']+)')?/g;

const guides = [];
let match;
while ((match = guideBlockRegex.exec(source)) !== null) {
  const [, slug, title, category, publishedAt, summary, coverImageSrc] = match;
  guides.push({ slug, title, category, publishedAt, summary, coverImageSrc: coverImageSrc || null });
}

if (guides.length === 0) {
  console.error('No se encontraron guias en petGuides.ts, no se genero el sitemap.');
  process.exit(1);
}

// Validaciones basicas para que un error al cargar una guia nueva se note en el build
// automatico (Vercel) en vez de generar un sitemap.xml roto o incompleto en silencio.
const seenSlugs = new Set();
for (const guide of guides) {
  if (seenSlugs.has(guide.slug)) {
    console.error(`Slug duplicado en petGuides.ts: "${guide.slug}". Cada guia debe tener un slug unico.`);
    process.exit(1);
  }
  seenSlugs.add(guide.slug);

  if (Number.isNaN(new Date(guide.publishedAt).getTime())) {
    console.error(`Fecha invalida en la guia "${guide.slug}": publishedAt="${guide.publishedAt}" (usar formato YYYY-MM-DD).`);
    process.exit(1);
  }
}

guides.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

// Calcula la fecha efectiva de publicacion de cada guia (misma logica que
// EFFECTIVE_RELEASE_TIMES en src/data/petGuides.ts):
// Fase 1: las guias cuya propia fecha ya llego (<= ahora) se consideran publicadas tal
// cual figuran, sin importar el orden entre ellas (no se retrasan retroactivamente
// guias que ya estaban visibles, por ejemplo dos cargadas el mismo dia).
// Fase 2: las guias con fecha futura ("en espera") se liberan en orden, respetando un
// minimo de 7 dias desde la ultima liberacion. Las que siguen en espera no se agregan
// al sitemap, para no indexarlas antes de que sean visibles al publico.
const GUIDE_RELEASE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const now = Date.now();

const alreadyDue = guides.filter((guide) => new Date(guide.publishedAt).getTime() <= now);
const pending = guides
  .filter((guide) => new Date(guide.publishedAt).getTime() > now)
  .sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());

const effectiveReleaseTimes = new Map();
for (const guide of alreadyDue) {
  effectiveReleaseTimes.set(guide.slug, new Date(guide.publishedAt).getTime());
}

let lastReleaseTime = alreadyDue.length > 0
  ? Math.max(...alreadyDue.map((guide) => new Date(guide.publishedAt).getTime()))
  : null;
for (const guide of pending) {
  const ownTime = new Date(guide.publishedAt).getTime();
  const minAllowedTime = lastReleaseTime === null ? ownTime : lastReleaseTime + GUIDE_RELEASE_INTERVAL_MS;
  const effectiveTime = Math.max(ownTime, minAllowedTime);
  effectiveReleaseTimes.set(guide.slug, effectiveTime);
  lastReleaseTime = effectiveTime;
}

const publishedGuides = guides.filter((guide) => effectiveReleaseTimes.get(guide.slug) <= now);
const blogPosts = await fetchPublishedBlogPosts();

const staticUrls = [
  { loc: `${SITE_URL}/`, changefreq: 'weekly', priority: '1.0' },
  { loc: `${SITE_URL}/guias`, changefreq: 'weekly', priority: '0.8' },
  { loc: `${SITE_URL}/blog`, changefreq: 'daily', priority: '0.8' },
  { loc: `${SITE_URL}/sobre-nosotros`, changefreq: 'monthly', priority: '0.5' },
  { loc: `${SITE_URL}/privacidad`, changefreq: 'monthly', priority: '0.6' },
  { loc: `${SITE_URL}/terminos`, changefreq: 'monthly', priority: '0.6' },
  { loc: `${SITE_URL}/contacto`, changefreq: 'monthly', priority: '0.6' },
];

const guideUrls = publishedGuides.map((guide) => ({
  loc: `${SITE_URL}/guias/${guide.slug}`,
  changefreq: 'monthly',
  priority: '0.7',
  lastmod: guide.publishedAt,
}));

const blogUrls = blogPosts.map((post) => ({
  loc: `${SITE_URL}/blog/${post.slug}`,
  changefreq: 'monthly',
  priority: '0.6',
  lastmod: post.created_at ? String(post.created_at).slice(0, 10) : undefined,
}));

const allUrls = [...staticUrls, ...guideUrls, ...blogUrls];

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${allUrls
  .map((url) => {
    const lastmod = url.lastmod ? `\n    <lastmod>${url.lastmod}</lastmod>` : '';
    return `  <url>\n    <loc>${url.loc}</loc>${lastmod}\n    <changefreq>${url.changefreq}</changefreq>\n    <priority>${url.priority}</priority>\n  </url>`;
  })
  .join('\n')}\n</urlset>\n`;

writeFileSync(sitemapFile, xml, 'utf8');
console.log(
  `sitemap.xml generado con ${allUrls.length} URLs (${publishedGuides.length} de ${guides.length} guias publicadas, ${blogUrls.length} posts de blog).`,
);

// Genera public/guides-feed.json: listado de guias ya publicadas (con su fecha
// efectiva de publicacion) para que la funcion edge "send-guide-notifications"
// pueda detectar guias nuevas y avisar por email a quienes dieron consentimiento
// (sin tener que duplicar la logica de liberacion de 7 dias en Deno), y para que
// api/admin/generate-guide-reel.js pueda armar el reel social de una guia sin
// tener que parsear el .ts (ver coverImageSrc, usado como imagen base del video).
const guidesFeed = publishedGuides.map((guide) => ({
  slug: guide.slug,
  title: guide.title,
  category: guide.category,
  summary: guide.summary,
  coverImageSrc: guide.coverImageSrc,
  effectiveReleaseDate: new Date(effectiveReleaseTimes.get(guide.slug)).toISOString().slice(0, 10),
}));

writeFileSync(guidesFeedFile, JSON.stringify(guidesFeed, null, 2), 'utf8');
console.log(`guides-feed.json generado con ${guidesFeed.length} guias publicadas.`);
