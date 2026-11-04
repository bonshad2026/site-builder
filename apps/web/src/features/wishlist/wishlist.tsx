import { useCallback, useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '../../components/ui/EmptyState';
import { Container, PageHeader, Section } from '../../components/ui/Layout';
import { usePageMeta } from '../../hooks/usePageMeta';
import { cn } from '../../lib/cn';
import { usePreferences } from '../../lib/preferences';
import type { ProductDto } from '../../types/api';
import { ProductCard } from '../public-site/components/Cards';
import { useProducts, useSiteId } from '../public-site/data';

/**
 * The visitor's wishlist: products saved on this device (per site), shown on /wishlist. No
 * account is needed; the list is kept in the browser.
 */

const key = (site: string) => `sb_wishlist_${site}`;
const listeners = new Set<() => void>();

function read(site: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key(site)) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

// Snapshots must be stable between renders for useSyncExternalStore.
const cache = new Map<string, { raw: string; list: string[] }>();
function snapshot(site: string): string[] {
  let raw = '[]';
  try {
    raw = localStorage.getItem(key(site)) ?? '[]';
  } catch {
    // Storage may be blocked; the list is then empty.
  }
  const hit = cache.get(site);
  if (hit && hit.raw === raw) return hit.list;
  const list = read(site);
  cache.set(site, { raw, list });
  return list;
}

export function useWishlist() {
  const site = useSiteId();
  const slugs = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      window.addEventListener('storage', cb);
      return () => {
        listeners.delete(cb);
        window.removeEventListener('storage', cb);
      };
    },
    () => snapshot(site),
    () => [],
  );
  const toggle = useCallback(
    (slug: string) => {
      const now = read(site);
      const next = now.includes(slug) ? now.filter((s) => s !== slug) : [...now, slug];
      try {
        localStorage.setItem(key(site), JSON.stringify(next));
      } catch {
        // Storage may be blocked.
      }
      listeners.forEach((l) => l());
    },
    [site],
  );
  return { slugs, has: (slug: string) => slugs.includes(slug), toggle };
}

export function WishlistButton({ product, className }: { product: Pick<ProductDto, 'slug'>; className?: string }) {
  const { m } = usePreferences();
  const { has, toggle } = useWishlist();
  const on = has(product.slug);
  return (
    <button
      type="button"
      onClick={() => toggle(product.slug)}
      aria-pressed={on}
      aria-label={on ? m.shop.removeFromWishlist : m.shop.addToWishlist}
      title={on ? m.shop.removeFromWishlist : m.shop.addToWishlist}
      className={cn('rounded-full border border-line p-2 text-ink transition hover:border-ink', className)}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
        <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
      </svg>
    </button>
  );
}

/** Header link to the wishlist, shown once something is in it. */
export function WishlistLink({ className }: { className?: string }) {
  const { m, formatNumber } = usePreferences();
  const { slugs } = useWishlist();
  if (!slugs.length) return null;
  return (
    <Link to="/wishlist" className={cn('inline-flex items-center gap-1 text-sm', className)} aria-label={m.shop.wishlist}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="currentColor">
        <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
      </svg>
      {formatNumber(slugs.length)}
    </Link>
  );
}

export function WishlistPage() {
  const { m } = usePreferences();
  const { slugs } = useWishlist();
  const { data: products = [], isLoading } = useProducts();
  usePageMeta(m.shop.wishlist, undefined, { noIndex: true });
  const list = slugs.map((s) => products.find((p) => p.slug === s)).filter((p): p is ProductDto => !!p);
  return (
    <>
      <PageHeader eyebrow={m.shop.wishlist} title={m.shop.wishlist} />
      <Section className="pt-10">
        <Container>
          {isLoading ? (
            <div role="status" aria-label="Loading" className="min-h-40" />
          ) : list.length ? (
            <div className="grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
              {list.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <EmptyState message={m.shop.wishlistEmpty} />
          )}
        </Container>
      </Section>
    </>
  );
}
