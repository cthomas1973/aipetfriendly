import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { fetchBlogPosts } from '../lib/supabase';
import type { BlogPost } from '../types';

interface BlogTeaserProps {
  title?: string;
  count?: number;
  className?: string;
}

// Punto de entrada dinamico al blog "Tips del día" (ver BlogSection.tsx),
// usado en la home (PetsSection) y en la landing para visitantes sin sesion.
// A diferencia de PetGuidesTeaser (contenido estatico), acá los posts vienen
// de Supabase, asi que hay estado de carga y se oculta por completo si todavia
// no hay ningun post generado (por ejemplo, antes de la primera corrida del cron).
export function BlogTeaser({
  title = 'Tips del día',
  count = 3,
  className = '',
}: BlogTeaserProps) {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchBlogPosts(count, 0)
      .then((rows) => {
        if (!cancelled) {
          setPosts(rows);
        }
      })
      .catch((err) => {
        console.error('No se pudieron cargar los tips del blog:', err);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [count]);

  if (loading || posts.length === 0) {
    return null;
  }

  return (
    <div className={`rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 md:p-6 ${className}`}>
      <h2 className="font-bold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">
        Novedades cortas sobre el cuidado de tu mascota, actualizadas todos los días.
      </p>
      <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
        {posts.map((post) => (
          <a
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="block w-40 flex-shrink-0 overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-100 transition hover:shadow-md"
          >
            {post.imageUrl && (
              <img
                src={post.imageUrl}
                alt={post.title}
                loading="lazy"
                className="h-24 w-full bg-slate-100 object-cover"
              />
            )}
            <div className="p-2.5">
              <p className="line-clamp-2 text-xs font-semibold text-slate-900">{post.title}</p>
              <p className="mt-1 text-[10px] text-slate-500">{post.estimatedReadingTime} min de lectura</p>
            </div>
          </a>
        ))}
      </div>
      <a
        href="/blog"
        className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-emerald-700 hover:underline"
      >
        Ver todo el blog <ArrowRight size={14} />
      </a>
    </div>
  );
}
