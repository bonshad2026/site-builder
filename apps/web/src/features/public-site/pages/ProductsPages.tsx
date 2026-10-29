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
import { ProductCard, useCategoryLabel } from '../components/Cards';
import { finalPrice, isSoldOut } from '../components/price';
import { isNotFound, useProduct, useProducts, useSiteSettings } from '../data';
import { NotFoundPage } from './NotFoundPage';
import { PageSlot, useSystemPage } from '../../../sections/PageSlot';
import type { SortOption } from '@site-builder/shared';
import { useMaxQuantity } from '../../cart/AddToCart';
import { cn } from '../../../lib/cn';
import { productColumns } from '../../../sections/renderers';

type Sort = SortOption;

export function ProductsPage() {
  const slots = useSystemPage('products');
  const { m, l, format } = usePreferences();
  const { data: products = [], isLoading } = useProducts();
  const { data: settings } = useSiteSettings();
  // A site's own shop heading, else the built-in collection texts.
  const head = settings?.catalogPage
    ? { eyebrow: l(settings.catalogPage.eyebrow), title: l(settings.catalogPage.heading), intro: l(settings.catalogPage.intro) }
    : { eyebrow: m.products.eyebrow, title: m.products.title, intro: m.products.intro };
  usePageMeta(head.title, head.intro);

  // Filters live in the URL so a filtered view can be shared or bookmarked.
  const [params, setParams] = useSearchParams();
  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter((c): c is string => !!c))], [products]);
  const category = params.get('category') ?? 'all';
  const page = settings?.shopPage;
  const sortOptions: Sort[] = page?.sortOptions?.length ? page.sortOptions : ['featured', 'price-asc', 'price-desc'];
  const defaultSort = sortOptions[0];
  const sort = (sortOptions.includes(params.get('sort') as Sort) ? params.get('sort') : defaultSort) as Sort;
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
    if (sort === 'newest') return [...list].reverse();
    if (sort === 'name') return [...list].sort((a, b) => l(a.name).localeCompare(l(b.name)));
    return [...list].sort((a, b) => Number(b.featured) - Number(a.featured) || a.position - b.position);
  }, [products, category, query, sort, l]);

  const label = useCategoryLabel();

  return (
    <>
      <PageSlot slug={slots.before} />
      <PageHeader eyebrow={head.eyebrow} title={head.title} intro={head.intro} />
      <Section className="pt-10 sm:pt-12">
        <Container>
          {(page?.showCategoryFilter !== false || page?.showSearch !== false || (page?.showSort !== false && sortOptions.length > 1)) && (
          <div className="mb-12 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            {page?.showCategoryFilter !== false ? (
              <FilterChips
                label={m.products.eyebrow}
                value={category}
                onChange={(v) => update('category', v, 'all')}
                options={[{ value: 'all', label: m.common.all }, ...categories.map((c) => ({ value: c, label: label(c) }))]}
              />
            ) : (
              <span />
            )}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              {page?.showSearch !== false && <SearchInput label={m.common.search} value={query} onChange={(v) => update('q', v, '')} placeholder={m.products.searchPlaceholder} />}
              {page?.showSort !== false && sortOptions.length > 1 && (
                <label className="flex items-center gap-3 text-sm text-ink-soft">
                  <span className="shrink-0">{m.products.sort}</span>
                  <Select value={sort} onChange={(e) => update('sort', e.target.value, defaultSort)} className="py-2 sm:w-48">
                    {sortOptions.map((o) => (
                      <option key={o} value={o}>
                        {{ featured: m.products.sortFeatured, 'price-asc': m.products.sortPriceAsc, 'price-desc': m.products.sortPriceDesc, newest: m.products.sortNewest, name: m.products.sortName }[o]}
                      </option>
                    ))}
                  </Select>
                </label>
              )}
            </div>
          </div>
          )}

          {page?.showCount !== false && (
            <p className="mb-6 text-sm text-ink-soft" aria-live="polite">
              {isLoading ? '…' : format(m.common.results, { count: visible.length })}
            </p>
          )}

          {visible.length || isLoading ? (
            <div className={cn('grid grid-cols-1 gap-x-6 gap-y-14', !page || page.columns === 4 ? 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : productColumns(page.columns))}>
              {visible.map((p) => (
                <ProductCard key={p.id} product={p} options={page?.card} />
              ))}
            </div>
          ) : (
            <EmptyState message={m.common.noResults} actionLabel={m.common.clearFilters} onAction={() => setParams({}, { replace: true })} />
          )}
        </Container>
      </Section>
      <PageSlot slug={slots.after} />
    </>
  );
}

export function ProductDetailPage() {
  const slots = useSystemPage('productDetail');
  const { slug = '' } = useParams();
  const { m, l, formatMoney, format, formatNumber } = usePreferences();
  const categoryLabel = useCategoryLabel();
  const { data: product, error, isLoading } = useProduct(slug);
  const { data: products = [] } = useProducts();
  const { data: settings } = useSiteSettings();
  const cart = useCart();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [color, setColor] = useState('');
  const [photo, setPhoto] = useState(0);
  const maxQuantity = useMaxQuantity();

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
  const soldOut = isSoldOut(product);
  const canOrder = !!settings?.modules.orders && !soldOut && product.priceMinor !== null;
  const maxQty = maxQuantity(product);
  const discount = product.discountPercent ?? 0;
  const colors = product.colors ?? [];
  const chosen = color || (colors[0] ? l(colors[0].name) : '');
  const photos = [product.imageUrl, ...(product.gallery ?? []).map((g) => g.url)].filter((u): u is string => !!u);
  const shownPhoto = photos[Math.min(photo, photos.length - 1)] ?? product.imageUrl;

  return (
    <>
      <PageSlot slug={slots.before} />
      <div className="pt-28 sm:pt-36">
        <Container>
          <Link to="/products" className="inline-flex items-center gap-2 text-sm text-ink-soft hover:text-ink">
            <Arrow className="rotate-180" /> {m.common.backTo} {(settings?.catalogPage && l(settings.catalogPage.heading)) || m.nav.products}
          </Link>
          <div className="mt-8 grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className={cn('flex flex-col gap-3 lg:col-span-7', slots.imageSide === 'end' && 'lg:order-2')}>
              <Image key={shownPhoto} src={shownPhoto} alt={l(product.name)} priority className="aspect-[4/5]" />
              {photos.length > 1 && (
                <div className="grid grid-cols-5 gap-3 sm:grid-cols-6">
                  {photos.map((url, i) => (
                    <button
                      key={url + i}
                      type="button"
                      onClick={() => setPhoto(i)}
                      aria-label={`${l(product.name)} ${formatNumber(i + 1)}`}
                      aria-pressed={url === shownPhoto}
                      className={`aspect-square overflow-hidden border-2 transition ${url === shownPhoto ? 'border-ink' : 'border-transparent opacity-70 hover:opacity-100'}`}
                    >
                      <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="reveal flex flex-col lg:col-span-5 lg:pt-10">
              {product.category && <p className="eyebrow">{categoryLabel(product.category)}</p>}
              <h1 className="mt-4 font-display text-5xl leading-tight text-ink sm:text-6xl">{l(product.name)}</h1>
              <p className="mt-6 flex flex-wrap items-baseline gap-3 text-2xl text-ink">
                {formatMoney(discount ? finalPrice(product) : product.priceMinor, product.currency)}
                {discount > 0 && (
                  <>
                    <span className="text-base text-ink-soft line-through">{formatMoney(product.priceMinor, product.currency)}</span>
                    <span className="bg-accent px-2 py-0.5 text-sm text-accent-ink">{format(m.shop.discountBadge, { percent: formatNumber(discount) })}</span>
                  </>
                )}
                {soldOut && <span className="bg-ink px-2 py-0.5 text-sm text-bg">{m.shop.soldOut}</span>}
              </p>
              <p className="mt-8 text-lg leading-relaxed text-ink-soft">{l(product.description)}</p>
              {slots.showDetails !== false && (
              <dl className="mt-10 divide-y divide-line border-y border-line text-sm">
                {[
                  [m.common.materials, l(product.materials)],
                  [m.common.dimensions, product.dimensions],
                  [m.common.leadTime, l(product.leadTime)],
                  ...(product.attributes ?? []).map((a) => [l(a.name), l(a.value)]),
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
              )}

              {colors.length > 0 && (
                <fieldset className="mt-8">
                  <legend className="mb-3 text-sm text-ink-soft">
                    {m.shop.color}: <span className="text-ink">{chosen}</span>
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {colors.map((c) => (
                      <button
                        key={c.hex + l(c.name)}
                        type="button"
                        aria-pressed={chosen === l(c.name)}
                        title={l(c.name)}
                        onClick={() => setColor(l(c.name))}
                        className={`size-9 rounded-full border-2 ${chosen === l(c.name) ? 'border-ink' : 'border-line'}`}
                        style={{ backgroundColor: c.hex }}
                      >
                        <span className="sr-only">{l(c.name)}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
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
                      cart.add(
                        { productId: product.id, slug: product.slug, name: product.name, priceMinor: finalPrice(product)!, currency: product.currency, imageUrl: product.imageUrl, option: chosen, max: maxQty },
                        quantity,
                      );
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
      {slots.showRelated !== false && related.length > 0 && (
        <Section>
          <Container>
            <h2 className="mb-10 font-display text-3xl text-ink sm:text-4xl">{m.products.related}</h2>
            <div className="grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} options={settings?.shopPage?.card} />
              ))}
            </div>
          </Container>
        </Section>
      )}
      <PageSlot slug={slots.after} />
    </>
  );
}
