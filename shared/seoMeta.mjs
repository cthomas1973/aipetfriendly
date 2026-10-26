// shared/seoMeta.mjs
//
// PASO 17 (SEO): utilidades de metadatos compartidas entre:
// - middleware.js (raiz del proyecto): inyecta metadatos para las paginas
//   publicas ESTATICAS (title/description fijos, conocidos de antemano).
// - api/content-status.js: inyecta metadatos para /blog/:slug y /guias/:slug
//   (title/description DINAMICOS, dependen del contenido real).
//
// Motivo: la app es una SPA 100% client-side (Vite + React, sin SSR).
// vercel.json sirve el MISMO index.html (con el title/description/canonical
// de la Home) para cualquier ruta publica via el rewrite catch-all final
// ("/(.*)" -> "/index.html"). src/lib/pageMeta.ts corrige esos tags recien
// del lado del cliente (useEffect), lo cual no alcanza para crawlers que no
// ejecutan JS o lo hacen con presupuesto limitado: la respuesta HTML inicial
// siempre quedaba con los metadatos de la Home.
//
// IMPORTANTE: los valores de PUBLIC_PAGES_META deben coincidir con el
// setPageMeta(...) del componente cliente indicado en cada comentario (mismo
// patron ya usado por ese archivo). Si se cambia el titulo/descripcion de una
// pagina publica ahi, hay que actualizar tambien la entrada de aca. Se
// duplican los strings (en vez de importarlos desde src/) para no mezclar el
// bundler de Vite/TS del cliente con el de las Vercel Functions/Middleware.

export const SITE_ORIGIN = 'https://www.aipetfriendly.ar';

const DESCRIPTION_MAX_LENGTH = 155;

// Limpia contenido de blog (texto plano con el markdown minimo que soporta
// renderContentParagraphs en BlogSection.tsx: subtitulos "## " y enlaces
// "[texto](url)") para usarlo como meta description/og:description. Nunca
// interpreta el contenido como HTML: solo manipulacion de texto plano.
// Usado tanto por api/content-status.js (HTML inicial, para crawlers) como
// por BlogSection.tsx (post-hidratacion), para que ambos calculen el mismo
// resultado a partir del mismo content.
export function buildBlogDescription(content, fallback) {
  const raw = typeof content === 'string' ? content : '';
  const withoutLinks = raw.replace(/\[([^[\]]*)\]\([^)\s]*\)/g, '$1');
  const withoutHeadings = withoutLinks.replace(/^#{1,6}[ \t]+/gm, '');
  const withoutMarkers = withoutHeadings.replace(/[[\]()*_`>]+/g, '');
  const collapsed = withoutMarkers.replace(/\s+/g, ' ').trim();

  if (!collapsed) {
    return fallback;
  }
  if (collapsed.length <= DESCRIPTION_MAX_LENGTH) {
    return collapsed;
  }
  const sliced = collapsed.slice(0, DESCRIPTION_MAX_LENGTH);
  const lastSpace = sliced.lastIndexOf(' ');
  if (lastSpace > 0) {
    return `${sliced.slice(0, lastSpace).trim()}…`;
  }
  // No hay espacio antes del limite (la primera palabra ya lo supera): se
  // busca el proximo espacio mas alla del limite para no mutilarla.
  const nextSpace = collapsed.indexOf(' ', DESCRIPTION_MAX_LENGTH);
  if (nextSpace > 0) {
    return `${collapsed.slice(0, nextSpace).trim()}…`;
  }
  // Ni siquiera hay un espacio en todo el contenido: se conserva la palabra
  // completa en vez de truncarla a mitad.
  return collapsed;
}

// Prioridad unica de description para un post de blog (PASO 19.3.8/19.3.9):
// una meta_description manual/custom de hasta 160 caracteres gana, tal cual;
// si es demasiado larga o no existe, se cae al extracto automatico del
// contenido. Recibe valores ya extraidos para servir igual en server y cliente.
export function resolveBlogDescription(metaDescription, content, fallback) {
  const custom = typeof metaDescription === 'string' ? metaDescription.trim() : '';
  if (custom && custom.length <= META_DESCRIPTION_MAX_LENGTH) {
    return custom;
  }
  return buildBlogDescription(content, fallback);
}

export const META_DESCRIPTION_MIN_LENGTH = 120;
export const META_DESCRIPTION_MAX_LENGTH = 160;

// Detecta HTML explicito ANTES de limpiar: buildBlogDescription no elimina
// "<"/el contenido de un tag (solo quita "[ ] ( ) * _ ` >"), asi que un
// "<script>" u otro tag no quedaria neutralizado solo con esa limpieza.
const HTML_TAG_PATTERN = /<[a-z][\s\S]*>/i;

// Valida/limpia una meta_description propuesta por la IA (cron de
// generacion, api/cron/generate-blog-post.js). A diferencia de
// resolveBlogDescription (que confia en lo que ya quedo guardado), esta
// funcion es el filtro estricto del camino AUTOMATICO: si el candidato no es
// string, trae HTML, o el resultado limpio queda fuera de
// [META_DESCRIPTION_MIN_LENGTH, META_DESCRIPTION_MAX_LENGTH], se devuelve
// null (nunca se inventa una descripcion alternativa; el post se guarda
// igual con meta_description = null y usa el fallback automatico).
// NO se aplica al camino manual del admin (AdminBlogSection.tsx): un humano
// revisando el texto puede guardar una descripcion corregida aunque quede
// fuera de este rango.
export function sanitizeMetaDescriptionCandidate(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  if (HTML_TAG_PATTERN.test(raw)) {
    return null;
  }
  const cleaned = buildBlogDescription(raw, '');
  if (!cleaned) {
    return null;
  }
  if (cleaned.length < META_DESCRIPTION_MIN_LENGTH || cleaned.length > META_DESCRIPTION_MAX_LENGTH) {
    return null;
  }
  return cleaned;
}

export const PUBLIC_PAGES_META = {
  '/': {
    title: 'AiPetFriendly - Cuidado inteligente para tu mascota',
    description:
      'AiPetFriendly: consultorio veterinario con IA, agenda de vacunas y desparasitaciones, historial clinico y mapa de veterinarias cercanas. Empeza gratis.',
  }, // src/components/LandingSection.tsx
  '/como-funciona': {
    title: 'AiPetFriendly | Cómo funciona',
    description:
      'Conocé cómo funciona AiPetFriendly y cómo podés organizar la salud, los cuidados, la alimentación, la identificación y la vida cotidiana de tu mascota desde un solo lugar.',
  }, // src/components/HowItWorksSection.tsx
  '/historial-clinico': {
    title: 'AiPetFriendly | Historial clínico de tu mascota',
    description:
      'Conocé cómo funciona el historial clínico digital de AiPetFriendly: vacunas, desparasitaciones, medicación y notas clínicas organizadas en una línea de tiempo, exportable en PDF.',
  }, // src/components/ClinicalHistoryLandingSection.tsx
  '/recordatorios': {
    title: 'AiPetFriendly | Recordatorios para el cuidado de tu mascota',
    description:
      'Organizá vacunas, desparasitaciones, medicación, turnos y otros cuidados de tu mascota con la agenda y los recordatorios de AiPetFriendly.',
  }, // src/components/RemindersLandingSection.tsx
  '/alimentacion-y-peso': {
    title: 'Alimentación y peso de tu mascota | AiPetFriendly',
    description:
      'Registrá compras de alimento, estimá el consumo, seguí la evolución del peso y recibí orientación ante cambios significativos, todo desde AiPetFriendly.',
  }, // src/components/FoodWeightLandingSection.tsx
  '/consultorio-ia': {
    title: 'Asistente IA para el cuidado de tu mascota | AiPetFriendly',
    description:
      'Consultá sobre el cuidado de tu mascota y recibí orientación mediante IA utilizando información de su perfil, historial reciente y cuidados registrados.',
  }, // src/components/AIAssistantLandingSection.tsx
  '/identificacion-y-mascota-perdida': {
    title: 'Identificación QR y mascota perdida | AiPetFriendly',
    description:
      'Identificá a tu mascota con un QR y facilitá que puedan avisarte si la encuentran, sin exponer públicamente tu teléfono ni email.',
  }, // src/components/IdentificationLostPetLandingSection.tsx
  '/veterinarias': {
    title: 'Veterinarias cerca tuyo | AiPetFriendly',
    description:
      'Buscá veterinarias cerca tuyo utilizando tu ubicación o una dirección y consultá los resultados en mapa y listado con AiPetFriendly.',
  }, // src/components/VeterinaryLandingSection.tsx
  '/pet-friendly': {
    title: 'Lugares Pet Friendly cerca tuyo | AiPetFriendly',
    description:
      'Buscá restaurantes, bares, hoteles y otros lugares pet friendly cerca tuyo utilizando tu ubicación o una dirección, y consultá los resultados en mapa y listado con AiPetFriendly.',
  }, // src/components/PetFriendlyLandingSection.tsx
  '/guias': {
    title: 'Guías y consejos para el cuidado de tu mascota | AiPetFriendly',
    description:
      'Guías gratuitas sobre adiestramiento, ansiedad, conducta y salud de perros y gatos, escritas para ayudarte en el día a día con tu mascota.',
  }, // src/components/PetGuidesSection.tsx (listado)
  '/blog': {
    title: 'Blog: tips diarios para el cuidado de tu mascota | AiPetFriendly',
    description:
      'Novedades y consejos prácticos sobre salud, alimentación y bienestar de perros y gatos, actualizados todos los días.',
  }, // src/components/BlogSection.tsx (listado)
  '/privacidad': {
    title: 'Politica de privacidad | AiPetFriendly',
    description: 'Como AiPetFriendly recolecta, usa y protege los datos personales de sus usuarios y de sus mascotas.',
  }, // src/components/PublicLegalPages.tsx (PrivacyPage)
  '/terminos': {
    title: 'Terminos y aviso legal | AiPetFriendly',
    description:
      'Condiciones de uso de AiPetFriendly: alcance del servicio, suscripcion Premium, responsabilidad y datos del titular del sitio.',
  }, // src/components/PublicLegalPages.tsx (TermsPage)
  '/contacto': {
    title: 'Contacto | AiPetFriendly',
    description: 'Como contactar al equipo de AiPetFriendly por consultas, sugerencias o temas comerciales.',
  }, // src/components/PublicLegalPages.tsx (ContactPage)
  '/sobre-nosotros': {
    title: 'Sobre nosotros | AiPetFriendly',
    description:
      'Quienes hacemos AiPetFriendly: una app para el cuidado de perros y gatos con consultorio de IA, agenda de cuidados, historial clinico y guias.',
  }, // src/components/PublicLegalPages.tsx (AboutPage)
};

// Mismo texto que SITE_DESCRIPTION_DEFAULT en BlogSection.tsx/PetGuidesSection.tsx,
// usado como description de las paginas de blog/guia "no encontrado".
export const SITE_DESCRIPTION_DEFAULT =
  'AiPetFriendly: consultorio veterinario con IA, agenda de vacunas y desparasitaciones, historial clinico y mapa de veterinarias cercanas. Empeza gratis.';

// Mismo formato que buildCanonicalUrl() en src/lib/pageMeta.ts.
export function buildCanonicalUrl(pathname) {
  const trimmed = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed ? `${SITE_ORIGIN}/${trimmed}` : `${SITE_ORIGIN}/`;
}

// Escapa valores antes de insertarlos en atributos/texto HTML. Necesario
// porque el title/description de un articulo de blog vienen de contenido
// generado por IA y guardado en la base (potencialmente con comillas o
// caracteres "<"/">"); sin escapar, un valor malicioso podria romper el
// atributo y ejecutar HTML/script arbitrario (XSS almacenado) en esta
// pagina publica de alto trafico.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function replaceTag(html, regex, replacement) {
  return regex.test(html) ? html.replace(regex, replacement) : html;
}

// Reemplaza title/description/canonical/robots (+ sus equivalentes og:/
// twitter:) en el index.html original, sin tocar nada mas del documento
// (scripts, manifest, icons, verificacion de AdSense, PWA, etc. quedan
// identicos). canonicalUrl === null => se quitan por completo el
// <link rel="canonical"> Y el <meta property="og:url"> (paginas "no
// encontrado": no deben declarar ninguna URL canonica real, ni siquiera la
// de la Home). og:title/og:description/twitter:title/twitter:description SI
// se reemplazan siempre (tambien en el caso "no encontrado"), porque vienen
// del title/description pasados por el caller (p.ej. "Articulo no
// encontrado | AiPetFriendly"), nunca de los de la Home.
export function injectPageMeta(html, { title, description, canonicalUrl, robots }) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(buildBlogDescription(description, ''));
  const safeRobots = escapeHtml(robots);

  let result = html;
  result = replaceTag(result, /<title>[^<]*<\/title>/, `<title>${safeTitle}</title>`);
  result = replaceTag(
    result,
    /<meta[^>]*\bname="description"[^>]*\/?>/,
    `<meta name="description" content="${safeDescription}" />`,
  );
  result = replaceTag(
    result,
    /<meta[^>]*\bname="robots"[^>]*\/?>/,
    `<meta name="robots" content="${safeRobots}" />`,
  );
  result = replaceTag(
    result,
    /<meta[^>]*\bproperty="og:title"[^>]*\/?>/,
    `<meta property="og:title" content="${safeTitle}" />`,
  );
  result = replaceTag(
    result,
    /<meta[^>]*\bproperty="og:description"[^>]*\/?>/,
    `<meta property="og:description" content="${safeDescription}" />`,
  );
  result = replaceTag(
    result,
    /<meta[^>]*\bname="twitter:title"[^>]*\/?>/,
    `<meta name="twitter:title" content="${safeTitle}" />`,
  );
  result = replaceTag(
    result,
    /<meta[^>]*\bname="twitter:description"[^>]*\/?>/,
    `<meta name="twitter:description" content="${safeDescription}" />`,
  );

  if (canonicalUrl) {
    const safeCanonical = escapeHtml(canonicalUrl);
    if (/<link[^>]*\brel="canonical"[^>]*\/?>/.test(result)) {
      result = replaceTag(
        result,
        /<link[^>]*\brel="canonical"[^>]*\/?>/,
        `<link rel="canonical" href="${safeCanonical}" />`,
      );
    } else {
      result = result.replace('</head>', `    <link rel="canonical" href="${safeCanonical}" />\n  </head>`);
    }
    result = replaceTag(
      result,
      /<meta[^>]*\bproperty="og:url"[^>]*\/?>/,
      `<meta property="og:url" content="${safeCanonical}" />`,
    );
  } else {
    // Pagina "no encontrada": ni el canonical ni el og:url deben quedar
    // apuntando a la Home (ni a ninguna otra URL real), asi que se quitan
    // ambos tags en vez de reemplazarlos.
    result = result.replace(/[ \t]*<link[^>]*\brel="canonical"[^>]*\/?>\n?/, '');
    result = result.replace(/[ \t]*<meta[^>]*\bproperty="og:url"[^>]*\/?>\n?/, '');
  }

  return result;
}
