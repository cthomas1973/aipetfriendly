import { useEffect, useState } from 'react';
import { BookOpen, Newspaper, ShoppingBag } from 'lucide-react';
import { getPetGuideBySlug } from '../data/petGuides';
import { getActiveChapitaQrProduct } from '../data/ownProducts';
import { fetchBeneficioProductoById, fetchBlogPostBySlug } from '../lib/supabase';
import { fetchProductAffiliateLink, validateAffiliateLink } from '../lib/affiliateLink';
import type { BlogPost, PublicBeneficioProducto } from '../types';

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
  const [productResult, setProductResult] = useState<{
    productId: string;
    product: PublicBeneficioProducto | null;
    link: string | null;
  } | null>(null);
  const relatedProduct = productResult?.productId === relatedProductId ? productResult?.product : null;
  const productLink = relatedProduct ? validateAffiliateLink(productResult?.link) : null;

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
      setProductResult(null);
      return;
    }
    Promise.all([fetchBeneficioProductoById(relatedProductId), fetchProductAffiliateLink(relatedProductId)])
      .then(([product, link]) => {
        if (cancelled) return;
        setProductResult({ productId: relatedProductId, product, link });
      })
      .catch(() => {
        if (!cancelled) {
          setProductResult({ productId: relatedProductId, product: null, link: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [relatedProductId]);

  // Respaldo: la chapita QR solo se ofrece cuando no hay producto tematico
  // (sin relatedProductId, inactivo o con error) y una vez resuelta la consulta.
  const productResolved = !relatedProductId || productResult?.productId === relatedProductId;
  const fallbackProduct = productResolved && !relatedProduct ? getActiveChapitaQrProduct() : null;

  if (!relatedGuide && !relatedBlogPost && !relatedProduct && !fallbackProduct) {
    return null;
  }

  const productCardContent = relatedProduct && (
    <div className="flex items-center gap-3">
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
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold uppercase tracking-wide text-amber-700">
          Artículo sugerido en promoción
        </span>
        <span className="block font-bold text-slate-900">{relatedProduct.title}</span>
        {!productLink && (
          <span className="mt-1 block text-xs text-slate-600">Enlace de compra temporalmente no disponible</span>
        )}
      </span>
    </div>
  );

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

      {relatedProduct && productCardContent && (productLink ? (
        <a
          href={productLink}
          target="_blank"
          rel="sponsored nofollow noopener noreferrer"
          className="block rounded-2xl border border-amber-200 bg-amber-50 p-4 transition hover:bg-amber-100"
        >
          {productCardContent}
        </a>
      ) : (
        <article aria-disabled="true" className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          {productCardContent}
        </article>
      ))}

      {fallbackProduct && (
        <a
          href={fallbackProduct.purchaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-2xl border border-purple-200 bg-purple-50 p-4 transition hover:bg-purple-100"
        >
          <span className="flex items-center gap-3">
            <img
              src={fallbackProduct.imageUrl}
              alt=""
              loading="lazy"
              className="h-10 w-10 flex-shrink-0 rounded-full bg-white object-cover"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold uppercase tracking-wide text-purple-700">
                Recomendado por AiPetFriendly
              </span>
              <span className="block font-bold text-slate-900">{fallbackProduct.title}</span>
              <span className="mt-1 block text-xs text-slate-600">{fallbackProduct.shortDescription}</span>
            </span>
          </span>
        </a>
      )}
    </div>
  );
}
