import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Arrow, Button, ButtonLink } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { FilterChips, SearchInput, Select } from '../../../components/ui/Field';
import { Image } from '../../../components/ui/Image';
import { Container, PageHeader, Section } from '../../../components/ui/Layout';
import { usePageMeta } from '../../../hooks/usePageMeta';
import { usePreferences } from '../../../lib/preferences';
import { useCart } from '../../cart/cart';
import { ProductCard } from '../components/Cards';
import { isNotFound, useProduct, useProducts, useSiteSettings } from '../data';
import { NotFoundPage } from './NotFoundPage';

type Sort = 'featured' | 'price-asc' | 'price-desc';

export function ProductsPage() {
  const { m, format } = usePreferences();
  const { data: products = [], isLoading } = useProducts();
  usePageMeta(m.products.title, m.products.intro);

  // Filters live in the URL so a filtered view can be shared or bookmarked.
  const [params, setParams] = useSearchParams();
  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter((c): c is string => !!c))], [products]);
  const category = params.get('category') ?? 'all';
  const sort = (['featured', 'price-asc', 'price-desc'].includes(params.get('sort') ?? '') ? params.get('sort') : 'featured') as Sort;
  const query = params.get('q') ?? '';

  const update = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === fallback) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = products.filter(
      (p) =>
        (category === 'all' || p.category === category) &&
        (!q || [p.name.en, p.name.fa, p.description.en, p.description.fa].some((s) => s.toLowerCase().includes(q))),
    );
    const price = (p: (typeof list)[number]) => Number(p.priceMinor ?? Infinity);
    if (sort === 'price-asc') return [...list].sort((a, b) => price(a) - price(b));
    if (sort === 'price-desc') return [...list].sort((a, b) => price(b) - price(a));
    return [...list].sort((a, b) => Number(b.featured) - Number(a.featured) || a.position - b.position);
  }, [products, category, query, sort]);

  const label = (c: string) => m.products.categories[c as keyof typeof m.products.categories] ?? c;

  return (
    <>
      <PageHeader eyebrow={m.products.eyebrow} title={m.products.title} intro={m.products.intro} />
      <Section className="pt-10 sm:pt-12">
        <Container>
          <div className="mb-12 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <FilterChips
              label={m.products.eyebrow}
              value={category}
              onChange={(v) => update('category', v, 'all')}
              options={[{ value: 'all', label: m.common.all }, ...categories.map((c) => ({ value: c, label: label(c) }))]}
            />
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <SearchInput label={m.common.search} value={query} onChange={(v) => update('q', v, '')} placeholder={m.products.searchPlaceholder} />
              <label className="flex items-center gap-3 text-sm text-ink-soft">
                <span className="shrink-0">{m.products.sort}</span>
                <Select value={sort} onChange={(e) => update('sort', e.target.value, 'featured')} className="py-2 sm:w-48">
                  <option value="featured">{m.products.sortFeatured}</option>
                  <option value="price-asc">{m.products.sortPriceAsc}</option>
                  <option value="price-desc">{m.products.sortPriceDesc}</option>
                </Select>
              </label>
            </div>
          </div>

          <p className="mb-6 text-sm text-ink-soft" aria-live="polite">
            {isLoading ? '…' : format(m.common.results, { count: visible.length })}
          </p>

          {visible.length || isLoading ? (
            <div className="grid grid-cols-1 gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <EmptyState message={m.common.noResults} actionLabel={m.common.clearFilters} onAction={() => setParams({}, { replace: true })} />
          )}
        </Container>
      </Section>
    </>
  );
}

export function ProductDetailPage() {
  const { slug = '' } = useParams();
  const { m, l, formatMoney, format } = usePreferences();
  const { data: product, error, isLoading } = useProduct(slug);
  const { data: products = [] } = useProducts();
  const { data: settings } = useSiteSettings();
  const cart = useCart();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  usePageMeta(product ? l(product.name) : '', product ? l(product.description) : undefined, {
    image: product?.imageUrl,
    jsonLd: product
      ? {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: l(product.name),
          description: l(product.description),
          ...(product.imageUrl ? { image: product.imageUrl } : {}),
          ...(product.priceMinor
            ? { offers: { '@type': 'Offer', price: product.priceMinor, priceCurrency: product.currency, availability: `https://schema.org/${product.isAvailable ? 'InStock' : 'OutOfStock'}` } }
            : {}),
        }
      : undefined,
  });

  if (isLoading) return <div role="status" aria-label="Loading" className="min-h-screen" />;
  if (isNotFound(error) || !product) return <NotFoundPage />;

  const related = products.filter((p) => p.category === product.category && p.slug !== product.slug).concat(products.filter((p) => p.category !== product.category)).slice(0, 4);
  const canOrder = !!settings?.modules.orders && product.isAvailable && product.priceMinor !== null && product.stock !== 0;
  const maxQty = Math.min(50, product.stock ?? 50);

  return (
    <>
      <div className="pt-28 sm:pt-36">
        <Container>
          <Link to="/products" className="inline-flex items-center gap-2 text-sm text-ink-soft hover:text-ink">
            <Arrow className="rotate-180" /> {m.common.backTo} {m.nav.products}
          </Link>
          <div className="mt-8 grid gap-12 lg:grid-cols-12 lg:gap-16">
            <Image src={product.imageUrl} alt={l(product.name)} priority className="aspect-[4/5] lg:col-span-7" />
            <div className="reveal flex flex-col lg:col-span-5 lg:pt-10">
              {product.category && <p className="eyebrow">{m.products.categories[product.category as keyof typeof m.products.categories] ?? product.category}</p>}
              <h1 className="mt-4 font-display text-5xl leading-tight text-ink sm:text-6xl">{l(product.name)}</h1>
              <p className="mt-6 text-2xl text-ink">{formatMoney(product.priceMinor, product.currency)}</p>
              <p className="mt-8 text-lg leading-relaxed text-ink-soft">{l(product.description)}</p>
              <dl className="mt-10 divide-y divide-line border-y border-line text-sm">
                {[
                  [m.common.materials, l(product.materials)],
                  [m.common.dimensions, product.dimensions],
                  [m.common.leadTime, l(product.leadTime)],
                ]
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-6 py-4">
                      <dt className="text-ink-soft">{k}</dt>
                      <dd className="text-end text-ink" dir={k === m.common.dimensions ? 'ltr' : undefined}>
                        {v}
                      </dd>
                    </div>
                  ))}
              </dl>

              {canOrder ? (
                <div className="mt-10 flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-3 text-sm text-ink-soft">
                    {m.shop.quantity}
                    <Select value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="w-20 py-2">
                      {Array.from({ length: Math.min(maxQty, 10) }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <Button
                    onClick={() => {
                      cart.add({ productId: product.id, slug: product.slug, name: product.name, priceMinor: product.priceMinor!, currency: product.currency, imageUrl: product.imageUrl }, quantity);
                      setAdded(true);
                    }}
                  >
                    {m.shop.addToCart}
                  </Button>
                  {added && (
                    <p role="status" className="w-full text-sm text-ink">
                      {format(m.shop.added, { count: quantity })}{' '}
                      <Link to="/cart" className="underline underline-offset-4">
                        {m.shop.viewCart}
                      </Link>
                    </p>
                  )}
                </div>
              ) : (
                <ButtonLink to={`/contact?product=${product.slug}`} className="mt-10 w-full sm:w-auto">
                  {m.common.enquire} <Arrow />
                </ButtonLink>
              )}
            </div>
          </div>
        </Container>
      </div>
      {related.length > 0 && (
        <Section>
          <Container>
            <h2 className="mb-10 font-display text-3xl text-ink sm:text-4xl">{m.products.related}</h2>
            <div className="grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </Container>
        </Section>
      )}
    </>
  );
}
