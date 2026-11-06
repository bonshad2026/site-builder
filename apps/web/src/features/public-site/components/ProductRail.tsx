import type { ProductDto } from '../../../types/api';
import { ProductCard, type ProductCardOptions } from './Cards';

/** A keyboard-focusable, touch-scrollable row reusing catalog and cart behavior. */
export function ProductRail({ products, options, label }: { products: ProductDto[]; options?: ProductCardOptions; label: string }) {
  return <div role="region" aria-label={label} tabIndex={0} className="flex snap-x snap-proximity gap-3 overflow-x-auto overscroll-x-contain rounded-xl pb-3 outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent">
    {products.map(product => <div key={product.id} className="w-40 shrink-0 snap-start rounded-2xl border border-line bg-bg p-2.5 sm:w-48">
      <ProductCard product={product} compact options={{ ...options, showCategory: false }} />
    </div>)}
  </div>;
}
