import { useEffect, useState } from 'react';
import { ChevronLeft, Clock, Newspaper } from 'lucide-react';
import { AdBanner } from './AdBanner';
import { PublicFooter } from './PublicLegalPages';
import { fetchBlogPostBySlug, fetchBlogPosts } from '../lib/supabase';
import type { BlogPost } from '../types';

const SITE_DESCRIPTION_DEFAULT =
  'AiPetFriendly: consultorio veterinario con IA, agenda de vacunas y desparasitaciones, historial clinico y mapa de veterinarias cercanas. Empeza gratis.';

function setPageMeta(title: string, description: string) {
  document.title = title;
  const metaDescription = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (metaDescription) {
    metaDescription.setAttribute('content', description);
  }
}

// El contenido del post viene como texto plano generado por IA (parrafos
// separados por linea en blanco, ver api/cron/generate-blog-post.js). Lo
// separamos en parrafos para poder darle el mismo espaciado que las guias,
// sin depender de que el modelo devuelva HTML/markdown.
function renderContentParagraphs(content: string) {
  return content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph, index) => (
      <p key={index} className="mt-3 text-sm leading-relaxed text-slate-700 md:text-base first:mt-0">
        {paragraph}
      </p>
    ));
}

function BackToHomeCta() {
  return (
    <a
      href="/"
      className="fixed bottom-24 right-4 z-20 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg transition hover:bg-emerald-700 md:bottom-6"
    >
      <ChevronLeft size={14} /> Volver al inicio
    </a>
  );
}

function BlogList() {
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPageMeta(
      'Blog: tips diarios para el cuidado de tu mascota | AiPetFriendly',
      'Novedades y consejos prácticos sobre salud, alimentación y bienestar de perros y gatos, actualizados todos los días.',
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchBlogPosts(30, 0)
      .then((rows) => {
        if (!cancelled) setPosts(rows);
      })
      .catch((err) => {
        console.error('No se pudo cargar el blog:', err);
        if (!cancelled) setError('No pudimos cargar los posts del blog. Probá de nuevo en un rato.');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const [latest, ...rest] = posts ?? [];

  return (
    <section className="space-y-6 pb-6">
      <div className="text-center">
        <a
          href="/"
          className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline"
        >
          <ChevronLeft size={16} /> Volver al inicio
        </a>
        <h1 className="text-2xl font-extrabold text-slate-900 md:text-3xl">Tips del día</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600 md:text-base">
          Novedades cortas y consejos prácticos sobre el cuidado de perros y gatos, escritos por
          nuestra IA a partir de fuentes reales y actualizados todos los días.
        </p>
      </div>

      <AdBanner adSenseSlotId="5896439448" forcePublic />

      {error && <p className="text-center text-sm text-red-600">{error}</p>}

      {posts === null && !error && (
        <p className="text-center text-sm text-slate-500">Cargando novedades...</p>
      )}

      {posts !== null && posts.length === 0 && !error && (
        <p className="text-center text-sm text-slate-500">
          Todavía no hay posts publicados. Volvé mañana para ver las primeras novedades.
        </p>
      )}

      {latest && (
        <a
          href={`/blog/${latest.slug}`}
          className="block overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-emerald-100 transition hover:shadow-md"
        >
          {latest.imageUrl && (
            <img
              src={latest.imageUrl}
              alt={latest.title}
              loading="lazy"
              className="h-48 w-full bg-slate-100 object-contain md:h-56"
            />
          )}
          <div className="p-5">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-600">
              <Newspaper size={14} /> Última novedad · {latest.estimatedReadingTime} min de lectura
            </p>
            <h2 className="mt-2 text-xl font-bold text-slate-900">{latest.title}</h2>
          </div>
        </a>
      )}

      {rest.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {rest.map((post) => (
            <a
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="block overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-emerald-100 transition hover:shadow-md"
            >
              {post.imageUrl && (
                <img
                  src={post.imageUrl}
                  alt={post.title}
                  loading="lazy"
                  className="h-36 w-full bg-slate-100 object-contain"
                />
              )}
              <div className="p-4">
                <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <Clock size={12} /> {post.estimatedReadingTime} min
                </p>
                <h3 className="mt-1 font-bold text-slate-900">{post.title}</h3>
              </div>
            </a>
          ))}
        </div>
      )}

      <PublicFooter />
    </section>
  );
}

function BlogDetail({ slug }: { slug: string }) {
  const [post, setPost] = useState<BlogPost | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    fetchBlogPostBySlug(slug)
      .then((row) => {
        if (!cancelled) setPost(row);
      })
      .catch((err) => {
        console.error('No se pudo cargar el post:', err);
        if (!cancelled) setPost(null);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (post) {
      setPageMeta(`${post.title} | AiPetFriendly`, post.content.slice(0, 150));
    } else if (post === null) {
      setPageMeta('Post no encontrado | AiPetFriendly', SITE_DESCRIPTION_DEFAULT);
    }
  }, [post]);

  if (post === undefined) {
    return (
      <section className="space-y-4 pb-6 text-center">
        <p className="text-sm text-slate-500">Cargando...</p>
      </section>
    );
  }

  if (post === null) {
    return (
      <section className="space-y-4 pb-6 text-center">
        <p className="text-sm text-slate-600">No encontramos este post.</p>
        <a href="/blog" className="text-sm font-semibold text-emerald-700 hover:underline">
          Ver todo el blog
        </a>
      </section>
    );
  }

  return (
    <section className="space-y-6 pb-6">
      <a
        href="/blog"
        className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline"
      >
        <ChevronLeft size={16} /> Todo el blog
      </a>

      <header>
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-600">
          <Clock size={14} /> {post.estimatedReadingTime} min de lectura
        </p>
        <h1 className="mt-2 text-2xl font-extrabold text-slate-900 md:text-3xl">{post.title}</h1>
      </header>

      {post.imageUrl && (
        <img
          src={post.imageUrl}
          alt={post.title}
          loading="lazy"
          className="mx-auto max-h-80 w-auto max-w-full rounded-2xl bg-slate-100 object-contain"
        />
      )}

      <AdBanner adSenseSlotId="5896439448" forcePublic />

      <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6">
        {renderContentParagraphs(post.content)}
      </article>

      {post.sourceName && (
        <p className="text-center text-xs font-semibold text-slate-400">Visto en: {post.sourceName}</p>
      )}

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Este contenido es informativo y no reemplaza una consulta veterinaria. Ante dudas puntuales
        sobre la salud de tu mascota, consultá con un profesional o usá el consultorio de IA de
        AiPetFriendly como primera orientación.
      </div>

      <AdBanner adSenseSlotId="8331031096" forcePublic />

      <PublicFooter />
      <BackToHomeCta />
    </section>
  );
}

export function BlogSection({ slug }: { slug?: string }) {
  if (slug) {
    return <BlogDetail slug={slug} />;
  }
  return <BlogList />;
}
