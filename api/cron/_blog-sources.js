// Registro controlado de fuentes editoriales. Una fuente nueva solo se incorpora con aprobacion explicita
// y tras verificar en solo lectura su robots.txt, rutas permitidas y extraccion de contenido.

export const SEARCH_LIMITS = Object.freeze({
  verificationsPerPulse: 3,
  verificationsPerRun: 12,
  pulsesPerRun: 8,
  draftsPerRun: 2,
  semanticChecksPerRun: 6,
  articleSemanticPerRun: 2,
  verificationsPerSpecies: 6,
  verificationsPerDomain: 2,
  evaluationsPerPulse: 15,
  pulseBudgetMs: 20000,
  runWindowMs: 6 * 60 * 60 * 1000,
  fetchTimeoutMs: 8000,
  semanticTimeoutMs: 15000,
  articleSemanticTimeoutMs: 30000,
  discoveryPerPulse: 1,
  discoveryMinDays: 7,
  discoveryMaxLinks: 30,
  poolMin: 3,
  poolFetch: 40,
  retryNotBeforeMs: 6 * 60 * 60 * 1000,
});

// Presupuestos por corrida que Supabase reserva ANTES de consumir el recurso (reserve_blog_generation_budget).
// La base impone sus propios maximos; estos valores nunca pueden superarlos.
export const BUDGET_KINDS = Object.freeze({
  pulse: 'pulsesPerRun',
  verification: 'verificationsPerRun',
  candidate_semantic: 'semanticChecksPerRun',
  article_semantic: 'articleSemanticPerRun',
  draft: 'draftsPerRun',
});

// Horas de espera antes de volver a probar un candidato. null significa descarte permanente.
export const COOLDOWN_HOURS = Object.freeze({
  http_403: 24, http_429: 24, http_5xx: 24, http_error: 24, timeout: 24, dns: 24, connection: 24,
  http_404: 720, redirect_unauthorized: 720, redirect_path_not_allowed: 720, too_large: 720, unsupported_content: 720,
  insufficient_content: 336, topic_not_supported: 720, quality_failed: 48, semantic_unavailable: 1, semantic_budget_exhausted: 6,
  article_review_unavailable: 24,
  domain_not_allowed: null, path_not_allowed: null, vet_validation: null, policy_rejected: null,
  semantic_rejected: null, duplicate_topic: null, content_rejected: null, article_semantic_rejected: null,
});
export function cooldownFor(code) {
  return Object.hasOwn(COOLDOWN_HOURS, code) ? COOLDOWN_HOURS[code] : 24;
}

// Una ruta bloqueada se descarta siempre: ante la duda no hay excepciones por URL.
const BLOCKED_SEGMENT = /^(?:health|medical|vets?|veterinar\w*|vaccin\w*|emergenc\w*|poison\w*|toxic\w*|neuter\w*|spay\w*|pregnan\w*|breeding|sexing|diseas\w*|illness\w*|injur\w*|first-aid|parasit\w*|flea\w*|worm\w*|diet|nutrition|dental|obes\w*|weight\w*|senior\w*|breeds?|search-.*|common-.*-diseases?|.*-nutrition-.*|.*-diseases?|information-.*|online-learning|lost-found-.*|kitten-?care|puppycare)$/i;

export const BLOG_SOURCES = Object.freeze([
  { id: 'cats-protection', organization: 'Cats Protection', weight: 5, hosts: ['www.cats.org.uk'], minChars: 800,
    selectors: ['main', 'article', '.site-body'],
    rules: [{ prefix: '/help-and-advice/caring-for-your-cat/', species: 'cat' }, { prefix: '/help-and-advice/getting-a-cat/', species: 'cat' },
      { prefix: '/help-and-advice/cat-behaviour/', species: 'cat' }],
    aliases: [{ from: '/help-and-advice/home-and-environment/', to: '/help-and-advice/caring-for-your-cat/home-and-environment/' }],
    indexes: [{ url: 'https://www.cats.org.uk/help-and-advice/caring-for-your-cat', species: 'cat' },
      { url: 'https://www.cats.org.uk/help-and-advice/cat-behaviour', species: 'cat' },
      { url: 'https://www.cats.org.uk/help-and-advice/getting-a-cat', species: 'cat' }] },
  { id: 'dogs-trust', organization: 'Dogs Trust', weight: 5, hosts: ['www.dogstrust.org.uk'], minChars: 800,
    selectors: ['main', 'article'],
    rules: [{ prefix: '/dog-advice/training/', species: 'dog' }, { prefix: '/dog-advice/life-with-your-dog/', species: 'dog' },
      { prefix: '/dog-advice/understanding-your-dog/', species: 'dog' }],
    indexes: [{ url: 'https://www.dogstrust.org.uk/dog-advice/training', species: 'dog' },
      { url: 'https://www.dogstrust.org.uk/dog-advice/life-with-your-dog', species: 'dog' }] },
  { id: 'battersea', organization: 'Battersea', weight: 4, hosts: ['www.battersea.org.uk'], minChars: 800,
    selectors: ['main', 'article', '.main-content'],
    rules: [{ prefix: '/pet-advice/dog-advice/', species: 'dog' }, { prefix: '/pet-advice/cat-advice/', species: 'cat' }],
    indexes: [{ url: 'https://www.battersea.org.uk/pet-advice/dog-advice', species: 'dog' },
      { url: 'https://www.battersea.org.uk/pet-advice/cat-advice', species: 'cat' }] },
  { id: 'rspca', organization: 'RSPCA', weight: 5, hosts: ['www.rspca.org.uk'], minChars: 800,
    selectors: ['#content', '[role=main]'],
    rules: [{ prefix: '/adviceandwelfare/pets/dogs/', species: 'dog' }, { prefix: '/adviceandwelfare/pets/cats/', species: 'cat' },
      { prefix: '/adviceandwelfare/pets/rabbits/', species: 'rabbit' }],
    indexes: [{ url: 'https://www.rspca.org.uk/adviceandwelfare/pets/dogs', species: 'dog' },
      { url: 'https://www.rspca.org.uk/adviceandwelfare/pets/cats', species: 'cat' },
      { url: 'https://www.rspca.org.uk/adviceandwelfare/pets/rabbits', species: 'rabbit' }] },
  { id: 'aspca', organization: 'ASPCA', weight: 4, hosts: ['www.aspca.org'], minChars: 800, crawlDelayMs: 10000,
    selectors: ['#content', '[role=main]'],
    rules: [{ prefix: '/pet-care/dog-care/', species: 'dog' }, { prefix: '/pet-care/cat-care/', species: 'cat' }],
    indexes: [{ url: 'https://www.aspca.org/pet-care/dog-care', species: 'dog' },
      { url: 'https://www.aspca.org/pet-care/cat-care', species: 'cat' }] },
]);

// Candidatos iniciales tomados de los indices oficiales de cada sitio. Igual que los descubiertos, deben pasar la verificacion.
export const SEED_PATHS = Object.freeze({
  'cats-protection': ['/help-and-advice/caring-for-your-cat/home-and-environment/travelling-with-your-cat',
    '/help-and-advice/cat-behaviour/cats-and-play', '/help-and-advice/getting-a-cat/choosing-a-cat'],
  'dogs-trust': ['/dog-advice/training/basics', '/dog-advice/training/home', '/dog-advice/training/outdoors', '/dog-advice/training/tips-tricks',
    '/dog-advice/life-with-your-dog/at-home'],
  battersea: ['/pet-advice/dog-advice/diy-dog-toys', '/pet-advice/dog-advice/winter-dog-care', '/pet-advice/cat-advice/diy-cat-toys',
    '/pet-advice/cat-advice/cat-body-language', '/pet-advice/cat-advice/my-cat-happy'],
  rspca: ['/adviceandwelfare/pets/dogs/company/children', '/adviceandwelfare/pets/rabbits/behaviour/enrichment'],
  aspca: ['/pet-care/dog-care/canine-diy-enrichment', '/pet-care/dog-care/dogs-and-babies',
    '/pet-care/cat-care/feline-diy-enrichment', '/pet-care/cat-care/cats-and-babies'],
});

export const getSourceById = (id) => BLOG_SOURCES.find((source) => source.id === id) || null;
export const getSourceForHost = (host) => BLOG_SOURCES.find((source) => source.hosts.includes(String(host).toLowerCase())) || null;

export function normalizeCandidateUrl(value) {
  const url = new URL(value);
  url.hash = ''; url.search = '';
  const source = getSourceForHost(url.hostname);
  for (const alias of source?.aliases || []) if (url.pathname.startsWith(alias.from)) url.pathname = alias.to + url.pathname.slice(alias.from.length);
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.href;
}

// Devuelve si una URL pertenece a la lista blanca de una fuente y a que especie corresponde.
export function classifyCandidateUrl(source, value) {
  let url;
  try { url = new URL(value); } catch { return { ok: false, code: 'domain_not_allowed' }; }
  if (!source || url.protocol !== 'https:' || !source.hosts.includes(url.hostname)) return { ok: false, code: 'domain_not_allowed' };
  const path = url.pathname.replace(/\/+$/, '');
  const rule = source.rules.find((item) => path.startsWith(item.prefix));
  if (!rule) return { ok: false, code: 'path_not_allowed' };
  if (path.split('/').filter(Boolean).some((segment) => BLOCKED_SEGMENT.test(segment))) return { ok: false, code: 'path_not_allowed' };
  return { ok: true, species: rule.species };
}

export const seedCandidates = () => Object.entries(SEED_PATHS).flatMap(([sourceId, paths]) => {
  const source = getSourceById(sourceId);
  return paths.map((path) => {
    const url = `https://${source.hosts[0]}${path}`;
    const classification = classifyCandidateUrl(source, url);
    return classification.ok ? { source_id: source.id, url, title: titleFromUrl(url), species: classification.species, origin: 'seed' } : null;
  }).filter(Boolean);
});

export function titleFromUrl(value) {
  const slug = new URL(value).pathname.split('/').filter(Boolean).at(-1) || '';
  const text = slug.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
