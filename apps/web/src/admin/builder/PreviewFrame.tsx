import { useEffect, useRef, useState } from 'react';
import { ThemeEffect } from '../../components/layout/SiteLayout';
import { CartProvider } from '../../features/cart/cart';
import type { SavedCard } from '@site-builder/shared';
import { CardDesignsContext, CurrentItemContext, useCollectionItems, useCollections } from '../../features/collections/data';
import { SiteIdContext, useSiteSettings } from '../../features/public-site/data';
import { SiteTexts } from '../../lib/siteLook';
import { cn } from '../../lib/cn';
import { SectionRenderer } from '../../sections/SectionRenderer';
import type { Section } from './state';

export interface PreviewMessage {
  type: 'sb:doc';
  siteId: string;
  /** Slug of the page being edited: a table's template page previews with one of its items. */
  pageSlug: string;
  /** Shared box designs as the builder has them (saved ones show before the site's cache refreshes). */
  cardDesigns: SavedCard[];
  sections: Section[];
  selectedId: string | null;
}

/**
 * Rendered inside the builder's iframe so that the preview uses real
 * viewport widths (mobile / tablet / desktop) and the site's own styles.
 * Talks to the builder with postMessage, same origin only.
 */
export default function PreviewFrame() {
  const [doc, setDoc] = useState<PreviewMessage | null>(null);
  const refs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || (e.data as PreviewMessage)?.type !== 'sb:doc') return;
      setDoc(e.data as PreviewMessage);
    };
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: 'sb:ready' }, window.location.origin);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (doc?.selectedId) refs.current.get(doc.selectedId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [doc?.selectedId]);

  if (!doc) return <div className="min-h-screen bg-bg" />;

  return (
    <SiteIdContext.Provider value={doc.siteId}>
      <PreviewTexts>
      <CartProvider siteId={`preview-${doc.siteId}`}>
      <CardDesignsContext.Provider value={doc.cardDesigns}>
      <SampleItem pageSlug={doc.pageSlug}>
      <ThemeEffect />
      <div className="min-h-screen bg-bg pb-24">
        {doc.sections.length === 0 && <p className="p-16 text-center text-ink-soft">+</p>}
        {doc.sections.map((s) => (
          <div
            key={s.id}
            ref={(el) => {
              if (el) refs.current.set(s.id, el);
              else refs.current.delete(s.id);
            }}
            data-section-id={s.id}
            onClickCapture={(e) => {
              // Clicking selects the section; links and buttons do not navigate inside the preview.
              const interactive = (e.target as HTMLElement).closest('a, button[type="submit"]');
              if (interactive) e.preventDefault();
              window.parent.postMessage({ type: 'sb:select', id: s.id }, window.location.origin);
            }}
            className={cn('relative cursor-pointer outline-offset-[-2px]', doc.selectedId === s.id ? 'outline-2 outline-accent' : 'hover:outline hover:outline-1 hover:outline-accent/50', s.hidden && 'opacity-40')}
          >
            <SectionRenderer section={s} editing />
          </div>
        ))}
      </div>
      </SampleItem>
      </CardDesignsContext.Provider>
      </CartProvider>
      </PreviewTexts>
    </SiteIdContext.Provider>
  );
}

/** On a table's template page, the first published item stands in for "the item of this page". */
function SampleItem({ pageSlug, children }: { pageSlug: string; children: React.ReactNode }) {
  const { data: collections } = useCollections();
  const collection = pageSlug ? collections?.find((c) => c.detailPage === pageSlug && c.slug !== 'products') : undefined;
  const { data } = useCollectionItems(collection?.slug ?? '', { filters: [], choices: {}, q: '', sort: 'position', dir: 'asc', page: 1, pageSize: 1 }, !!collection);
  const item = data?.data[0];
  return <CurrentItemContext.Provider value={item && collection ? { item, collection } : null}>{children}</CurrentItemContext.Provider>;
}

/** The site's own wording for built-in texts, as visitors see it. */
function PreviewTexts({ children }: { children: React.ReactNode }) {
  const { data: settings } = useSiteSettings();
  return <SiteTexts settings={settings}>{children}</SiteTexts>;
}
