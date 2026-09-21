import { useEffect, useState } from 'react';
import { BookOpen, Newspaper, ShoppingBag } from 'lucide-react';
import { getPetGuideBySlug } from '../data/petGuides';
import { fetchBeneficioProductoById, fetchBlogPostBySlug } from '../lib/supabase';
import { buildProductAffiliateLink, getMattTool } from '../lib/affiliateLink';
import type { BeneficioProducto, BlogPost } from '../types';

interface RelatedLinksBlockProps {
  relatedGuideSlug?: string;
  relatedBlogSlug?: string;
  relatedProductId?: string;
  isAdmin?: boolean;
}

// Enlazado interno "relacionado" para el final de guias y posts del blog: hasta
// un link a otra guia, uno a un post del blog y uno a un producto de la tienda
// (beneficios_productos, con link de afiliado ML). Cada uno se oculta solo si
// el contenido referenciado no existe/no esta publicado/no esta activo, asi que
// alcanza con completar el slug/id correspondiente sin preocuparse por roturas.
export function RelatedLinksBlock({
  relatedGuideSlug,
  relatedBlogSlug,
  relatedProductId,
  isAdmin = false,
}: RelatedLinksBlockProps) {
  const relatedGuide = relatedGuideSlug ? getPetGuideBySlug(relatedGuideSlug, isAdmin) : undefined;

  const [relatedBlogPost, setRelatedBlogPost] = useState<BlogPost | null>(null);
  const [relatedProduct, setRelatedProduct] = useState<BeneficioProducto | null>(null);
  const [productLink, setProductLink] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!relatedBlogSlug) {
      setRelatedBlogPost(null);
      return;
    }
    fetchBlogPostBySlug(relatedBlogSlug)
      .then((post) => {
        if (!cancelled) setRelatedBlogPost(post);
      })
      .catch(() => {
        if (!cancelled) setRelatedBlogPost(null);
      });
    return () => {
      cancelled = true;
    };
  }, [relatedBlogSlug]);

  useEffect(() => {
    let cancelled = false;
    if (!relatedProductId) {
      setRelatedProduct(null);
      setProductLink('');
      return;
    }
    Promise.all([fetchBeneficioProductoById(relatedProductId), getMattTool()])
      .then(([product, mattTool]) => {
        if (cancelled) return;
        setRelatedProduct(product);
        setProductLink(product ? buildProductAffiliateLink(product.permalink, mattTool) : '');
      })
      .catch(() => {
        if (!cancelled) {
          setRelatedProduct(null);
          setProductLink('');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [relatedProductId]);

  if (!relatedGuide && !relatedBlogPost && !(relatedProduct && productLink)) {
    return null;
  }

  return (
    <div className="space-y-3">
      {relatedGuide && (
        <a
          href={`/guias/${relatedGuide.slug}`}
          className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 transition hover:bg-emerald-100"
        >
          <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
            <BookOpen size={18} />
          </span>
          <span>
            <span className="block text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Guía relacionada
            </span>
            <span className="block font-bold text-slate-900">{relatedGuide.title}</span>
          </span>
        </a>
      )}

      {relatedBlogPost && (
        <a
          href={`/blog/${relatedBlogPost.slug}`}
          className="flex items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 transition hover:bg-sky-100"
        >
          <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-sky-600 text-white">
            <Newspaper size={18} />
          </span>
          <span>
            <span className="block text-xs font-semibold uppercase tracking-wide text-sky-700">
              Nota relacionada
            </span>
            <span className="block font-bold text-slate-900">{relatedBlogPost.title}</span>
          </span>
        </a>
      )}

      {relatedProduct && productLink && (
        <a
          href={productLink}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 transition hover:bg-amber-100"
        >
          {relatedProduct.thumbnail ? (
            <img
              src={relatedProduct.thumbnail}
              alt={relatedProduct.title}
              className="h-10 w-10 flex-shrink-0 rounded-full bg-white object-contain"
            />
          ) : (
            <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-600 text-white">
              <ShoppingBag size={18} />
            </span>
          )}
          <span>
            <span className="block text-xs font-semibold uppercase tracking-wide text-amber-700">
              Artículo sugerido en promoción
            </span>
            <span className="block font-bold text-slate-900">{relatedProduct.title}</span>
          </span>
        </a>
      )}
    </div>
  );
}
