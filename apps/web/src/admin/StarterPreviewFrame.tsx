import { PRODUCT_SOURCE_FIELDS, withSettingDefaults, type PublicCollection, type PublicItem, type StarterPack } from '@site-builder/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ThemeEffect } from '../components/layout/SiteLayout';
import { Footer } from '../components/layout/Footer';
import { Header } from '../components/layout/Header';
import { CartProvider } from '../features/cart/cart';
import { CurrentItemContext, useCollectionItems, useCollections } from '../features/collections/data';
import { SiteIdContext, useSiteSettings } from '../features/public-site/data';
import { api, ApiError, setApiMock, type Envelope } from '../lib/api';
import { usePreferences, useSiteDirection } from '../lib/preferences';
import { SiteTexts } from '../lib/siteLook';
import { PageSections } from '../sections/SectionRenderer';
import { L } from '../features/account/customerApi';

/** What the Starters page sends to this frame (same origin only). */
export interface StarterPreviewMessage {
  type: 'sb:starter';
  /** The starter's id (a new one starts the preview afresh). */
  id: string;
  kind: 'page' | 'table' | 'header' | 'footer';
  pack: StarterPack;
  /** The site whose look (theme, logo, menu, texts) the preview borrows. */
  lookSite: string;
  /** The page of the pack shown (page starters). */
  page: string;
  signedIn: boolean;
}

/** The made-up site the preview shows; every request to it is answered from the pack. */
const SITE = 'starter-preview';
const ok = (data: unknown, meta?: Envelope<unknown>['meta']): Envelope<unknown> => ({ data, ...(meta ? { meta } : {}) });

/**
 * The studio's starter preview, inside an iframe of the Starters page so that viewport widths
 * are real: a starter's page (or header / footer) drawn by the site's own components, with the
 * look of a chosen site and the starter's own tables, sample items, products and photos.
 */
export default function StarterPreviewFrame() {
  const [msg, setMsg] = useState<StarterPreviewMessage | null>(null);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || (e.data as StarterPreviewMessage)?.type !== 'sb:starter') return;
      setMsg(e.data as StarterPreviewMessage);
    };
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: 'sb:ready' }, window.location.origin);
    return () => {
      window.removeEventListener('message', onMessage);
      setApiMock(null);
    };
  }, []);
  if (!msg) return <div className="min-h-screen bg-bg" />;
  return <Preview key={JSON.stringify([msg.id, msg.lookSite, msg.page, msg.signedIn])} msg={msg} />;
}

function Preview({ msg }: { msg: StarterPreviewMessage }) {
  // Its own cache, so nothing of the made-up site mixes with the studio's.
  const client = useMemo(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }), []);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    api
      .get<Record<string, unknown>>(`/public/sites/${msg.lookSite}/settings`)
      .catch(() => ({}))
      .then((look) => {
        if (!live) return;
        setApiMock(previewApi(msg, look));
        setReady(true);
      });
    return () => {
      live = false;
    };
  }, [msg]);
  if (!ready) return <div className="min-h-screen bg-bg" />;
  return (
    <QueryClientProvider client={client}>
      <SiteIdContext.Provider value={SITE}>
        <Chrome kind={msg.kind}>
          {msg.kind === 'page' ? (
            <PackPage pack={msg.pack} slug={msg.page} />
          ) : (
            <div className="mx-auto max-w-5xl px-6 py-24 text-center text-ink-soft">
              <p className="font-display text-3xl text-ink">{msg.kind === 'header' ? '↑' : '↓'}</p>
            </div>
          )}
        </Chrome>
      </SiteIdContext.Provider>
    </QueryClientProvider>
  );
}

/** Header, page and footer, with links that do not leave the preview. */
function Chrome({ kind, children }: { kind: StarterPreviewMessage['kind']; children: ReactNode }) {
  const { data: settings } = useSiteSettings();
  useSiteDirection(settings?.direction);
  const { locale, setLocale } = usePreferences();
  const locales = settings?.locales;
  useEffect(() => {
    if (locales?.length && !locales.includes(locale)) setLocale(locales[0]);
  }, [locales, locale, setLocale]);
  if (!settings) return <div className="min-h-screen bg-bg" />;
  return (
    <SiteTexts settings={settings}>
      <CartProvider siteId={SITE}>
        <ThemeEffect />
        <div
          className="flex min-h-dvh flex-col overflow-x-clip"
          onClickCapture={(e) => {
            if ((e.target as HTMLElement).closest('a, button[type="submit"]')) e.preventDefault();
          }}
        >
          {kind !== 'footer' && <Header />}
          <main className="flex-1">{children}</main>
          {kind !== 'header' && <Footer />}
        </div>
      </CartProvider>
    </SiteTexts>
  );
}

/** A page of the pack; a table's item page shows its first sample item. */
function PackPage({ pack, slug }: { pack: StarterPack; slug: string }) {
  const page = pack.pages.find((p) => p.slug === slug) ?? pack.pages[0];
  const { data: collections } = useCollections();
  const table = collections?.find((c) => c.detailPage === page?.slug);
  const { data } = useCollectionItems(table?.slug ?? '', { filters: [], choices: {}, q: '', sort: 'position', dir: 'asc', page: 1, pageSize: 1 }, !!table);
  const item = data?.data[0];
  if (!page) return null;
  return (
    <CurrentItemContext.Provider value={item && table ? { item, collection: table } : null}>
      <PageSections document={page.document as Parameters<typeof PageSections>[0]['document']} />
    </CurrentItemContext.Provider>
  );
}

/* ---------- the made-up site's API ---------- */

type Item = StarterPack['samples']['items'][string][number];

function previewApi(msg: StarterPreviewMessage, look: Record<string, unknown>) {
  const { pack } = msg;
  const photo = new Map(pack.photos.map((p) => [p.id, p.url]));
  const asImage = (id: unknown) => (typeof id === 'string' && photo.has(id) ? { id, url: photo.get(id)! } : null);
  const allItems = new Map<string, Item & { table: string }>();
  for (const [table, list] of Object.entries(pack.samples.items)) for (const it of list) allItems.set(it.ref, { ...it, table });

  const collections: PublicCollection[] = pack.tables.map((t) => ({
    id: t.slug,
    slug: t.slug,
    name: t.name,
    itemName: t.itemName,
    fields: t.fields,
    detailPage: t.detailPage,
    imageField: t.imageField,
    requestType: t.requestType,
    commerce: { enabled: t.commerce.enabled, currency: t.commerce.currency, maxPerOrder: t.commerce.maxPerOrder },
  }));
  const products = pack.samples.products.map((p, i) => {
    const image = asImage(p.imageAssetId);
    return {
      id: `p${i}`,
      slug: String(p.slug),
      name: p.name,
      description: p.description,
      category: p.category ?? null,
      priceMinor: p.priceMinor === null || p.priceMinor === undefined ? null : String(p.priceMinor),
      currency: String(p.currency ?? 'IRR'),
      stock: (p.stock as number | null) ?? null,
      isAvailable: p.isAvailable !== false,
      discountPercent: Number(p.discountPercent ?? 0),
      colors: p.colors ?? [],
      featured: !!p.featured,
      materials: p.materials ?? { en: '', fa: '' },
      dimensions: String(p.dimensions ?? ''),
      leadTime: p.leadTime ?? { en: '', fa: '' },
      imageAssetId: image?.id ?? null,
      imageUrl: image?.url ?? null,
      status: 'published',
      position: i,
    };
  });

  const toItem = (it: Item, table: string): PublicItem => {
    const def = pack.tables.find((t) => t.slug === table)!;
    const data: Record<string, unknown> = { ...it.data };
    for (const f of def.fields) {
      const v = it.data[f.key];
      if (f.type === 'image') data[f.key] = asImage(v);
      else if (f.type === 'gallery') data[f.key] = (Array.isArray(v) ? v : []).map(asImage).filter(Boolean);
      else if (f.type === 'reference') {
        const refs = (Array.isArray(v) ? v : [v]).flatMap((r) => {
          const x = typeof r === 'string' ? allItems.get(r) : undefined;
          if (!x) return [];
          const refDef = pack.tables.find((t) => t.slug === x.table);
          const img = refDef?.imageField ? asImage(x.data[refDef.imageField]) : null;
          return [{ id: x.ref, slug: x.slug, title: x.title, collection: x.table, imageUrl: img?.url ?? null }];
        });
        data[f.key] = f.multiple ? refs : (refs[0] ?? null);
      }
    }
    const main = def.imageField ? data[def.imageField] : null;
    const first = (Array.isArray(main) ? main[0] : main) as { url?: string } | null;
    const c = def.commerce;
    const num = (k: string) => (k && typeof it.data[k] === 'number' ? (it.data[k] as number) : null);
    const price = num(c.priceField);
    const tracks = c.enabled || !!c.capacityField || !!c.deadlineField;
    return {
      id: it.ref,
      collection: table,
      slug: it.slug,
      title: it.title,
      data,
      imageUrl: first?.url ?? null,
      ...(tracks
        ? {
            availability: {
              priceMinor: price,
              discountPercent: 0,
              finalPriceMinor: price,
              currency: c.currency,
              capacity: num(c.capacityField),
              remaining: num(c.capacityField),
              closed: false,
              reason: '',
              canBuy: c.enabled && price !== null,
            },
          }
        : {}),
    };
  };
  const productItems = (): PublicItem[] =>
    products.map((p) => ({
      id: p.id,
      collection: 'products',
      slug: p.slug,
      title: p.name as PublicItem['title'],
      data: { image: p.imageUrl ? { id: p.imageAssetId, url: p.imageUrl } : null, description: p.description, category: p.category, price: Number(p.priceMinor), discount: p.discountPercent, stock: p.stock, featured: p.featured },
      imageUrl: p.imageUrl,
      availability: { priceMinor: Number(p.priceMinor), discountPercent: p.discountPercent, finalPriceMinor: Math.floor((Number(p.priceMinor) * (100 - p.discountPercent)) / 100), currency: p.currency, capacity: p.stock, remaining: p.stock, closed: false, reason: '', canBuy: true },
    }));

  const lookObj = look as { cardDesigns?: unknown[]; requestTypes?: { slug: string }[]; modules?: Record<string, boolean>; accounts?: Record<string, unknown> };
  const settings = withSettingDefaults({
    ...look,
    modules: { ...(lookObj.modules ?? {}), products: true, services: true, orders: true, leads: true },
    accounts: { ...(lookObj.accounts ?? {}), enabled: true },
    cardDesigns: [...pack.cardDesigns, ...(lookObj.cardDesigns ?? [])].slice(0, 40),
    requestTypes: [...pack.forms, ...(lookObj.requestTypes ?? []).filter((r) => !pack.forms.some((f) => f.slug === r.slug))],
    productCategories: [...pack.samples.categories, ...(((look as { productCategories?: unknown[] }).productCategories as never[]) ?? [])],
    ...(pack.site.header ? { header: pack.site.header } : {}),
    ...(pack.site.footer ? { footer: pack.site.footer } : {}),
  } as never);

  const now = new Date().toISOString();
  const customer = { id: 'c1', name: 'سارا احمدی', phone: '09121234567', email: null, hasPassword: true };
  const cases = {
    requests: [
      { number: '1042', code: 'R1042', typeLabel: L('Consultation', 'مشاوره'), stageLabel: 'در حال بررسی', stageColor: 'amber', stageKind: 'open', amountDueMinor: '0', currency: 'IRR', createdAt: now, updatedAt: now, lastReplyAt: null },
      { number: '1031', code: 'R1031', typeLabel: L('Reservation', 'رزرو'), stageLabel: 'انجام شد', stageColor: 'green', stageKind: 'done', amountDueMinor: '0', currency: 'IRR', createdAt: now, updatedAt: now, lastReplyAt: null },
    ],
    orders: [
      { number: '2210', code: '2210', stageLabel: 'ارسال شد', status: 'shipped', totalMinor: '86000000', currency: 'IRR', paymentStatus: 'paid', createdAt: now },
      { number: '2198', code: '2198', stageLabel: 'تحویل شد', status: 'delivered', totalMinor: '42000000', currency: 'IRR', paymentStatus: 'paid', createdAt: now },
    ],
  };

  return (method: string, path: string): Envelope<unknown> | undefined => {
    const prefix = `/public/sites/${SITE}`;
    if (!path.startsWith(prefix)) return undefined;
    const url = new URL(path.slice(prefix.length) || '/', 'http://x');
    const parts = url.pathname.split('/').filter(Boolean);
    const q = url.searchParams;
    if (method !== 'GET') throw new ApiError(400, 'preview', 'This is a preview: nothing is sent.');
    switch (parts[0]) {
      case 'settings':
        return ok(settings);
      case 'pages':
        if (!parts[1]) return ok(pack.pages.map((p) => ({ slug: p.slug })));
        {
          const page = pack.pages.find((p) => p.slug === parts[1]);
          if (!page) throw new ApiError(404, 'not_found', 'Not found');
          return ok({ slug: page.slug, title: page.title, isHome: false, seo: {}, document: page.document });
        }
      case 'collections': {
        if (!parts[1]) return ok([...collections, { id: 'products', slug: 'products', name: L('Products', 'محصولات'), itemName: L('Product', 'محصول'), fields: PRODUCT_SOURCE_FIELDS, detailPage: '', imageField: 'image', requestType: '', commerce: { enabled: true, currency: 'IRR', maxPerOrder: 50 } }]);
        const source = parts[1];
        const list = source === 'products' ? productItems() : (pack.samples.items[source] ?? []).map((it) => toItem(it, source));
        if (parts[2] === 'items' && parts[3]) {
          const one = list.find((x) => x.slug === decodeURIComponent(parts[3]));
          if (!one) throw new ApiError(404, 'not_found', 'Not found');
          return ok(one);
        }
        if (parts[2] === 'items') {
          const search = (q.get('q') ?? '').toLowerCase();
          const found = search ? list.filter((x) => `${x.title.en} ${x.title.fa}`.toLowerCase().includes(search)) : list;
          const size = Number(q.get('pageSize') ?? 12);
          const page = Number(q.get('page') ?? 1);
          return ok(found.slice((page - 1) * size, page * size), { page, pageSize: size, total: found.length, totalPages: Math.max(1, Math.ceil(found.length / size)) });
        }
        if (parts[2] === 'range') {
          const field = q.get('field') ?? '';
          const values = list.map((x) => (source === 'products' ? (x.data as Record<string, unknown>)[field] : (pack.samples.items[source]?.find((i) => i.ref === x.id)?.data[field] as unknown))).filter((v): v is number => typeof v === 'number');
          return ok({ min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null });
        }
        return ok([]);
      }
      case 'products':
        if (parts[1]) {
          const p = products.find((x) => x.slug === parts[1]);
          if (!p) throw new ApiError(404, 'not_found', 'Not found');
          return ok(p);
        }
        return ok(products, { page: 1, pageSize: 100, total: products.length, totalPages: 1 });
      case 'services':
        if (parts[1]) throw new ApiError(404, 'not_found', 'Not found');
        return ok([]);
      case 'payment-methods':
        return ok({ online: true, cod: true, provider: 'sandbox', isTest: true });
      case 'customer':
        if (parts[1] === 'me') return ok(msg.signedIn ? customer : null);
        if (parts[1] === 'cases') return ok(cases);
        return ok(null);
      default:
        throw new ApiError(404, 'not_found', 'Not found');
    }
  };
}
