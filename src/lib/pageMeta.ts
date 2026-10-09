const SITE_ORIGIN = 'https://www.aipetfriendly.ar';

// Normaliza una ruta de la SPA a la URL absoluta canonica bajo el dominio
// https://www.aipetfriendly.ar, sin query string ni fragmento (#).
function buildCanonicalUrl(path: string): string {
  const cleanPath = path.split('?')[0].split('#')[0];
  const trimmed = cleanPath.replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed ? `${SITE_ORIGIN}/${trimmed}` : `${SITE_ORIGIN}/`;
}

function upsertCanonicalLink(href: string) {
  let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

function removeCanonicalLink() {
  document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.remove();
}

function upsertMetaRobots(content: string) {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (meta) {
    meta.setAttribute('content', content);
  }
}

// Actualiza title, meta description, canonical y robots (index, follow) de la
// pagina publica activa. canonicalPath debe ser la ruta propia de esa pagina
// (ej. '/blog/mi-post'), nunca la de otra pagina: se sobreescribe en cada
// render para que no quede un canonical/robots viejo al navegar entre rutas
// sin recarga completa (incluyendo al volver desde una ruta inexistente).
export function setPageMeta(title: string, description: string, canonicalPath: string) {
  document.title = title;
  const metaDescription = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (metaDescription) {
    metaDescription.setAttribute('content', description);
  }
  upsertCanonicalLink(buildCanonicalUrl(canonicalPath));
  upsertMetaRobots('index, follow');
}

// Variante para contenido que NO existe (ej. slug de blog/guia inexistente):
// marca la pagina como noindex y quita el canonical en vez de apuntarlo a la
// home o a otro contenido valido, para no sugerir que son equivalentes.
export function setNotFoundPageMeta(title: string, description: string) {
  document.title = title;
  const metaDescription = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (metaDescription) {
    metaDescription.setAttribute('content', description);
  }
  removeCanonicalLink();
  upsertMetaRobots('noindex, follow');
}
