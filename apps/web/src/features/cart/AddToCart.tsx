import { useState } from 'react';
import { Link } from 'react-router';
import { cn } from '../../lib/cn';
import { usePreferences } from '../../lib/preferences';
import type { ProductDto } from '../../types/api';
import { finalPrice, isSoldOut } from '../public-site/components/price';
import { useProducts, useSiteSettings } from '../public-site/data';
import { useCartOptional } from './cart';

/** Most units of one product a buyer may order: the product's, the shop's and the stock's limits. */
export function useMaxQuantity() {
  const { data: settings } = useSiteSettings();
  const shopMax = settings?.shop?.maxPerProduct ?? 50;
  return (product: ProductDto) => Math.min(shopMax, product.stock ?? shopMax, product.maxPerOrder ?? shopMax);
}

/**
 * Adds one unit of a product (its first colour, if it has colours) to the cart, then offers a
 * link to the cart. Shows nothing when the shop does not take orders or the product cannot be bought.
 */
export function AddToCartButton({ product, label, className }: { product: ProductDto; label?: string; className?: string }) {
  const { m, format, formatNumber, l } = usePreferences();
  const { data: settings } = useSiteSettings();
  const cart = useCartOptional();
  const maxQty = useMaxQuantity();
  const [added, setAdded] = useState(false);
  if (!cart || !settings?.modules.orders || isSoldOut(product) || product.priceMinor === null) return null;
  const colors = product.colors ?? [];
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => {
          cart.add({
            productId: product.id,
            slug: product.slug,
            name: product.name,
            priceMinor: finalPrice(product)!,
            currency: product.currency,
            imageUrl: product.imageUrl,
            option: colors[0] ? l(colors[0].name) : '',
            max: maxQty(product),
          });
          setAdded(true);
        }}
        className={className}
      >
        {label || m.shop.addToCart}
      </button>
      {added && (
        <span role="status" className="text-sm">
          {format(m.shop.added, { count: formatNumber(1) })}{' '}
          <Link to="/cart" className="underline underline-offset-4">
            {m.shop.viewCart}
          </Link>
        </span>
      )}
    </span>
  );
}

/** An add-to-cart button for a product picked by slug in the builder. */
export function AddToCartBySlug({ slug, label, className }: { slug: string; label?: string; className?: string }) {
  const { data: products = [] } = useProducts();
  const product = products.find((p) => p.slug === slug);
  return product ? <AddToCartButton product={product} label={label} className={cn(className)} /> : null;
}
