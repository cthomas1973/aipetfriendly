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
const SITE_URL = 'https://aipetfriendly.ar';

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

const staticUrls = [
  { loc: `${SITE_URL}/`, changefreq: 'weekly', priority: '1.0' },
  { loc: `${SITE_URL}/guias`, changefreq: 'weekly', priority: '0.8' },
];

const guideUrls = guides.map((guide) => ({
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
console.log(`sitemap.xml generado con ${allUrls.length} URLs (${guides.length} guias).`);
