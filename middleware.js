// middleware.js
//
// PASO 17 (SEO): Vercel Routing Middleware (feature disponible en todos los
// planes, incluido Hobby, y que NO cuenta contra el limite de 12 Serverless
// Functions: https://vercel.com/docs/routing-middleware) que intercepta las
// rutas publicas con metadatos ESTATICOS (fijos, conocidos de antemano, ver
// PUBLIC_PAGES_META en shared/seoMeta.mjs) y devuelve el index.html real con
// su propio <title>/<meta name="description">/<link rel="canonical">/
// <meta name="robots">, en vez del unico juego de valores de la Home que
// vercel.json sirve siempre via su rewrite catch-all final ("/(.*)" ->
// "/index.html"). Ver el comentario de cabecera de shared/seoMeta.mjs para
// el detalle completo del problema que esto resuelve.
//
// Las rutas dinamicas /blog/:slug y /guias/:slug NO se tocan aca a proposito
// (no estan en `matcher`): siguen resolviendose como siempre via el rewrite
// de vercel.json hacia api/content-status.js, que desde este mismo cambio
// tambien inyecta el title/description/canonical reales del articulo o la
// guia (reutilizando los datos que esa funcion ya trae para decidir
// 200/404). Asi se evita duplicar ahi la logica/consultas de existencia de
// contenido.
//
// IMPORTANTE para quien agregue una pagina publica nueva con metadatos
// fijos: agregar su ruta tanto en PUBLIC_PAGES_META (shared/seoMeta.mjs)
// como en el array `matcher` de aca abajo.

import { next } from '@vercel/functions';
import { PUBLIC_PAGES_META, buildCanonicalUrl, injectPageMeta } from './shared/seoMeta.mjs';

export const config = {
  matcher: [
    '/',
    '/como-funciona',
    '/historial-clinico',
    '/recordatorios',
    '/alimentacion-y-peso',
    '/consultorio-ia',
    '/identificacion-y-mascota-perdida',
    '/veterinarias',
    '/pet-friendly',
    '/guias',
    '/blog',
    '/privacidad',
    '/terminos',
    '/contacto',
    '/sobre-nosotros',
  ],
};

export default async function middleware(request) {
  const url = new URL(request.url);
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
  const meta = PUBLIC_PAGES_META[pathname];

  // No deberia pasar (el matcher ya restringe las rutas), pero si pasa no se
  // inventa nada: se deja pasar la request tal cual (comportamiento actual).
  if (!meta) {
    return next();
  }

  let html;
  try {
    const response = await fetch(new URL('/index.html', url));
    if (!response.ok) {
      return next();
    }
    html = await response.text();
  } catch {
    // Si por algun motivo no se pudo traer el index.html real, se deja
    // pasar la request (se sirve el comportamiento de siempre) en vez de
    // romper la pagina.
    return next();
  }

  const injected = injectPageMeta(html, {
    title: meta.title,
    description: meta.description,
    canonicalUrl: buildCanonicalUrl(pathname),
    robots: 'index, follow',
  });

  return new Response(injected, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}
