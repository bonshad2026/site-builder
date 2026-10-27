import { Link } from 'react-router';
import { Arrow } from '../../../components/ui/Button';
import { Image } from '../../../components/ui/Image';
import { usePreferences } from '../../../lib/preferences';
import type { ProductDto, ServiceDto } from '../../../types/api';
import type { Localized } from '../../../types/site';

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

export function ProductCard({ product }: { product: ProductDto }) {
  const { l, m, formatMoney } = usePreferences();
  const category = product.category as keyof typeof m.products.categories | null;
  return (
    <Link to={`/products/${product.slug}`} className="group block">
      <Image src={product.imageUrl} alt={l(product.name)} className="aspect-[4/5] [&_img]:transition-transform [&_img]:duration-1000 group-hover:[&_img]:scale-[1.04]" />
      <div className="mt-5 flex items-start justify-between gap-4">
        <div>
          {category && <p className="text-xs tracking-wide text-ink-soft uppercase rtl:normal-case">{m.products.categories[category] ?? category}</p>}
          <h3 className="mt-1.5 font-display text-2xl text-ink">{l(product.name)}</h3>
        </div>
        <p className="shrink-0 pt-5 text-sm text-ink-soft tabular-nums">{formatMoney(product.priceMinor, product.currency)}</p>
      </div>
    </Link>
  );
}

export interface GalleryItem {
  imageUrl: string;
  title: Localized;
  caption: Localized;
  category: Localized;
  meta: string;
}

export function GalleryCard({ item, aspect = 'aspect-[4/3]' }: { item: GalleryItem; aspect?: string }) {
  const { l } = usePreferences();
  const sub = [l(item.category), item.meta].filter(Boolean).join(' · ');
  return (
    <article className="group">
      <div className="overflow-hidden">
        <Image src={item.imageUrl} alt={l(item.title)} className={`${aspect} [&_img]:transition-transform [&_img]:duration-1000 group-hover:[&_img]:scale-[1.03]`} />
      </div>
      <h3 className="mt-5 font-display text-2xl text-ink sm:text-3xl">{l(item.title)}</h3>
      {sub && <p className="mt-1 text-sm text-ink-soft">{sub}</p>}
      {l(item.caption) && <p className="mt-3 max-w-md leading-relaxed text-ink-soft">{l(item.caption)}</p>}
    </article>
  );
}
