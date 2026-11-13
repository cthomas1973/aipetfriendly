import { ExternalLink } from 'lucide-react';
import type { SuggestedProduct } from '../hooks/useChat';
import { validateAffiliateLink } from '../lib/affiliateLink';

interface SuggestedProductCardProps {
  product: SuggestedProduct;
  className: string;
}

const PRICE_FORMATTER = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

export function SuggestedProductCard({ product, className }: SuggestedProductCardProps) {
  const affiliateLink = validateAffiliateLink(product.link);
  const content = (
    <>
      {product.thumbnail && (
        <img
          src={product.thumbnail}
          alt={product.title}
          className="h-12 w-12 shrink-0 rounded-xl object-cover bg-white"
          loading="lazy"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-600">Producto sugerido</p>
        <p className="truncate text-sm font-semibold text-slate-800">{product.title}</p>
        {product.price != null && (
          <p className="text-xs font-bold text-slate-600">{PRICE_FORMATTER.format(product.price)}</p>
        )}
        {!affiliateLink && (
          <p className="mt-1 text-xs text-slate-600">Enlace de compra temporalmente no disponible</p>
        )}
      </div>
      {affiliateLink && <ExternalLink size={16} className="shrink-0 text-emerald-600" />}
    </>
  );

  return affiliateLink ? (
    <a
      href={affiliateLink}
      target="_blank"
      rel="sponsored nofollow noopener noreferrer"
      className={className}
    >
      {content}
    </a>
  ) : (
    <div aria-disabled="true" className={className}>
      {content}
    </div>
  );
}