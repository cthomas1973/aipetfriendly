// Genera public/sitemap.xml a partir de las guias definidas en src/data/petGuides.ts.
// Se ejecuta automaticamente antes de cada build (ver "build" en package.json), asi que
// alcanza con agregar una guia nueva al array PET_GUIDES para que quede en el sitemap
// sin tener que tocar este archivo a mano.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const guidesFile = path.join(__dirname, '..', 'src', 'data', 'petGuides.ts');
const sitemapFile = path.join(__dirname, '..', 'public', 'sitemap.xml');
const SITE_URL = 'https://www.aipetfriendly.ar';

const source = readFileSync(guidesFile, 'utf8');

// Extrae cada objeto de guia buscando pares slug/publishedAt dentro del array PET_GUIDES.
const guideBlockRegex = /slug:\s*'([^']+)'[\s\S]*?publishedAt:\s*'([^']+)'/g;

const guides = [];
let match;
while ((match = guideBlockRegex.exec(source)) !== null) {
  const [, slug, publishedAt] = match;
  guides.push({ slug, publishedAt });
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

const staticUrls = [
  { loc: `${SITE_URL}/`, changefreq: 'weekly', priority: '1.0' },
  { loc: `${SITE_URL}/guias`, changefreq: 'weekly', priority: '0.8' },
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

const allUrls = [...staticUrls, ...guideUrls];

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${allUrls
  .map((url) => {
    const lastmod = url.lastmod ? `\n    <lastmod>${url.lastmod}</lastmod>` : '';
    return `  <url>\n    <loc>${url.loc}</loc>${lastmod}\n    <changefreq>${url.changefreq}</changefreq>\n    <priority>${url.priority}</priority>\n  </url>`;
  })
  .join('\n')}\n</urlset>\n`;

writeFileSync(sitemapFile, xml, 'utf8');
console.log(`sitemap.xml generado con ${allUrls.length} URLs (${publishedGuides.length} de ${guides.length} guias publicadas).`);
