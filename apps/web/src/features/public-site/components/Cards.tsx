import type { ImageSize, ProductCardSettings } from '@site-builder/shared';
import { SmartLink } from '../../../components/ui/SmartLink';
import { Link } from 'react-router';
import { AddToCartButton } from '../../cart/AddToCart';
import { Arrow } from '../../../components/ui/Button';
import { Image } from '../../../components/ui/Image';
import { usePreferences } from '../../../lib/preferences';
import type { ProductDto, ServiceDto } from '../../../types/api';
import type { Localized } from '../../../types/site';
import { useSiteSettings } from '../data';
import { finalPrice, isSoldOut } from './price';

/** Display name of a product category: the site's own list first, then the built-in names. */
export function useCategoryLabel() {
  const { l, m } = usePreferences();
  const { data: settings } = useSiteSettings();
  return (slug: string) => {
    const own = settings?.productCategories?.find((c) => c.slug === slug);
    return own ? l(own.label) : ((m.products.categories as Record<string, string>)[slug] ?? slug);
  };
}

/** What a product card shows; set per products section in the builder or for the shop page in the settings. */
export type ProductCardOptions = Partial<ProductCardSettings>;

const RATIO = { portrait: 'aspect-[4/5]', square: 'aspect-square', landscape: 'aspect-[4/3]', tall: 'aspect-[2/3]' } as const;

export function ServiceCard({ service, index }: { service: ServiceDto; index: number }) {
  const { l, formatNumber } = usePreferences();
  return (
    <Link to={`/services/${service.slug}`} className="group flex flex-col border-t border-line pt-6">
      <span className="text-sm text-accent tabular-nums">{formatNumber(index + 1).padStart(2, formatNumber(0))}</span>
      <h3 className="mt-6 font-display text-3xl text-ink transition-colors group-hover:text-accent">{l(service.title)}</h3>
      <p className="mt-4 flex-1 leading-relaxed text-ink-soft">{l(service.summary)}</p>
      <Arrow className="mt-8 size-5 text-ink transition-transform duration-300 group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
    </Link>
  );
}

export function ProductCard({ product, options = {} }: { product: ProductDto; options?: ProductCardOptions }) {
  const { l, m, formatMoney, format, formatNumber } = usePreferences();
  const categoryLabel = useCategoryLabel();
  const {
    showDiscount = true,
    showColors = true,
    showStock = false,
    showImage = true,
    showCategory = true,
    showPrice = true,
    showAddToCart = false,
    imageRatio = 'portrait',
  } = options;
  const discount = showDiscount ? (product.discountPercent ?? 0) : 0;
  const soldOut = isSoldOut(product);
  const colors = showColors ? (product.colors ?? []) : [];
  const card = (
    <Link to={`/products/${product.slug}`} className="group block">
      {showImage && (
        <div className="relative mb-5">
          <Image src={product.imageUrl} alt={l(product.name)} className={`${RATIO[imageRatio]} [&_img]:transition-transform [&_img]:duration-1000 group-hover:[&_img]:scale-[1.04] ${soldOut ? 'opacity-60' : ''}`} />
          <div className="absolute inset-x-3 top-3 flex justify-between gap-2 text-xs">
            {discount > 0 && !soldOut ? <span className="bg-accent px-2 py-1 text-accent-ink">{format(m.shop.discountBadge, { percent: formatNumber(discount) })}</span> : <span />}
            {soldOut && <span className="bg-ink px-2 py-1 text-bg">{m.shop.soldOut}</span>}
          </div>
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          {showCategory && product.category && <p className="text-xs tracking-wide text-ink-soft uppercase rtl:normal-case">{categoryLabel(product.category)}</p>}
          <h3 className="mt-1.5 font-display text-2xl text-ink">{l(product.name)}</h3>
          {colors.length > 0 && (
            <div className="mt-2 flex gap-1.5" aria-label={m.shop.color}>
              {colors.map((c) => (
                <span key={c.hex + l(c.name)} title={l(c.name)} className="size-3.5 rounded-full border border-line" style={{ backgroundColor: c.hex }} />
              ))}
            </div>
          )}
          {showStock && !soldOut && product.stock !== null && <p className="mt-2 text-xs text-ink-soft">{format(m.shop.inStock, { count: formatNumber(product.stock) })}</p>}
          {!showImage && soldOut && <p className="mt-2 text-xs text-ink-soft">{m.shop.soldOut}</p>}
        </div>
        {showPrice && (
          <p className="shrink-0 pt-5 text-end text-sm text-ink-soft tabular-nums">
            {discount > 0 && <span className="block text-xs line-through opacity-70">{formatMoney(product.priceMinor, product.currency)}</span>}
            {formatMoney(discount > 0 ? finalPrice(product) : product.priceMinor, product.currency)}
          </p>
        )}
      </div>
    </Link>
  );
  if (!showAddToCart) return card;
  return (
    <div className="flex flex-col gap-4">
      {card}
      <AddToCartButton product={product} className="self-start rounded-full bg-ink px-5 py-2 text-sm text-bg transition-colors hover:bg-accent hover:text-accent-ink" />
    </div>
  );
}

export interface GalleryItem {
  imageUrl: string;
  title: Localized;
  caption: Localized;
  category: Localized;
  meta: string;
}

export function GalleryCard({ item, aspect = 'aspect-[4/3]', size }: { item: GalleryItem & { href?: string }; aspect?: string; size?: ImageSize }) {
  const { l } = usePreferences();
  const sub = [l(item.category), item.meta].filter(Boolean).join(' · ');
  const title = <h3 className="mt-5 font-display text-2xl text-ink sm:text-3xl">{l(item.title)}</h3>;
  return (
    <article className="group">
      <div className="overflow-hidden">
        <Image src={item.imageUrl} alt={l(item.title)} size={size} className={`${aspect} [&_img]:transition-transform [&_img]:duration-1000 group-hover:[&_img]:scale-[1.03]`} />
      </div>
      {item.href ? (
        <SmartLink href={item.href} className="block hover:text-accent">
          {title}
        </SmartLink>
      ) : (
        title
      )}
      {sub && <p className="mt-1 text-sm text-ink-soft">{sub}</p>}
      {l(item.caption) && <p className="mt-3 max-w-md leading-relaxed text-ink-soft">{l(item.caption)}</p>}
    </article>
  );
}
