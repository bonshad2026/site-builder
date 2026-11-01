import { SYSTEM_PAGES, type SectionProps, type SystemPageKey } from '@site-builder/shared';
import { createContext, useContext, type ComponentType, type ReactNode } from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import { usePreferences } from '../lib/preferences';
import { usePublishedPage, usePublishedPageList, useSiteSettings } from '../features/public-site/data';
import { PageSections } from './SectionRenderer';

/**
 * Built-in pages (shop list, product page, services, cart, checkout, payment result, "page not
 * found") can be replaced by a builder page at a fixed address (see SYSTEM_PAGES). The built-in
 * content then sits in that page as a "Built-in content" section, between any other sections.
 */

/** True inside a builder page that replaces a built-in one: the built-in content shows itself only. */
export const EmbeddedContext = createContext(false);
export const useEmbedded = () => useContext(EmbeddedContext);

/** The page components, registered by the routes (so sections and pages do not import each other). */
const components: Partial<Record<SystemPageKey, ComponentType>> = {};
export function registerSystemPages(list: Partial<Record<SystemPageKey, ComponentType>>) {
  Object.assign(components, list);
}

const slugOf = (key: SystemPageKey) => SYSTEM_PAGES.find((p) => p.key === key)!.slug;

/** Built-in pages that belong to a module: a site without it (e.g. an empty site) shows "not found" there. */
const MODULE_OF: Partial<Record<SystemPageKey, 'products' | 'services'>> = {
  products: 'products',
  productDetail: 'products',
  cart: 'products',
  checkout: 'products',
  checkoutResult: 'products',
  services: 'services',
  serviceDetail: 'services',
};

/** Shows the site's own builder page for a built-in page when it has one, else the built-in page. */
export function BuiltInPage({ page, children }: { page: SystemPageKey; children: ReactNode }) {
  const embedded = useEmbedded();
  const slug = slugOf(page);
  const list = usePublishedPageList(!embedded);
  const own = !embedded && !!list.data?.some((p) => p.slug === slug);
  const doc = usePublishedPage(slug, own);
  const settings = useSiteSettings().data;
  if (embedded) return <>{children}</>;
  if (list.isLoading || (own && doc.isLoading)) return <div role="status" aria-label="Loading" className="min-h-screen" />;
  if (own && doc.data) return <OwnPage document={doc.data.document} title={doc.data.title} />;
  const module = MODULE_OF[page];
  const NotFound = components.notFound;
  if (module && settings && !settings.modules[module] && NotFound) return <NotFound />;
  return <>{children}</>;
}

function OwnPage({ document, title }: { document: Parameters<typeof PageSections>[0]['document']; title: { en: string; fa: string } }) {
  const { l } = usePreferences();
  // The built-in content sets its own title (the product's name…); otherwise the page's title.
  const hasBuiltIn = document.sections.some((s) => s.type === 'system-page' && !s.hidden);
  usePageMeta(hasBuiltIn ? '' : l(title));
  return (
    <EmbeddedContext.Provider value={true}>
      <PageSections document={document} />
    </EmbeddedContext.Provider>
  );
}

/** "Built-in content" section: the cart, the current product, the checkout… inside a builder page. */
export function SystemPageSection({ props }: { props: SectionProps<'system-page'> }) {
  const Page = components[props.page];
  if (!Page) return null;
  return (
    <EmbeddedContext.Provider value={true}>
      <Page />
    </EmbeddedContext.Provider>
  );
}
