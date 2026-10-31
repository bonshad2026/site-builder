import { defaultCardDesign, type CardBlock, type CollectionFilter, type SectionProps } from '@site-builder/shared';
import { useContext, useMemo, useState } from 'react';
import { EmptyState } from '../components/ui/EmptyState';
import { SearchInput } from '../components/ui/Field';
import { Container, Section, SectionHeading } from '../components/ui/Layout';
import { CardView } from '../features/collections/CardView';
import { CardDesignsContext, useCollectionItem, useCollectionItems, useCollections, useCurrentItem } from '../features/collections/data';
import { useSiteSettings } from '../features/public-site/data';
import { VisitorFilterControl } from './VisitorFilters';
import { cn } from '../lib/cn';
import { usePreferences } from '../lib/preferences';

type Props<T extends 'collection-list' | 'collection-item'> = { props: SectionProps<T> };

const mobileCols = ['', 'grid-cols-1', 'grid-cols-2'];
const tabletCols = ['', 'sm:grid-cols-1', 'sm:grid-cols-2', 'sm:grid-cols-3', 'sm:grid-cols-4'];
const desktopCols = ['', 'lg:grid-cols-1', 'lg:grid-cols-2', 'lg:grid-cols-3', 'lg:grid-cols-4', 'lg:grid-cols-5', 'lg:grid-cols-6'];

/** The box design of a section: a saved one by id, its own, or the default box. */
export function useCardDesign(cardDesign: string, card: CardBlock | null): CardBlock {
  const { data: settings } = useSiteSettings();
  const given = useContext(CardDesignsContext);
  return useMemo(() => (given ?? settings?.cardDesigns)?.find((d) => d.id === cardDesign)?.design ?? card ?? defaultCardDesign(), [given, settings, cardDesign, card]);
}

export function CollectionListSection({ props }: Props<'collection-list'>) {
  const p = usePreferences();
  const { data: collections } = useCollections();
  const collection = collections?.find((c) => c.slug === props.source);
  const current = useCurrentItem();
  const design = useCardDesign(props.cardDesign, props.card);
  const [q, setQ] = useState('');
  // Each visitor filter's conditions, by its place in the list.
  const [visitor, setVisitor] = useState<Record<number, CollectionFilter[]>>({});
  const [page, setPage] = useState(1);
  // Bumped by "clear filters" so inputs that keep their own text start empty again.
  const [clearKey, setClearKey] = useState(0);
  // "Show more" grows the first page; page numbers move through pages of `limit` items.
  const more = props.pagination === 'more';
  const query = {
    filters: props.filters.filter((f) => f.field),
    choices: {},
    visitor: Object.values(visitor).flat(),
    q,
    sort: props.sort,
    dir: props.dir,
    page: more ? 1 : page,
    pageSize: Math.min(60, more ? props.limit * page : props.limit),
    current: current?.item.id,
  };
  const { data, isLoading } = useCollectionItems(props.source, query);
  const items = data?.data ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / props.limit));
  const reset = () => setPage(1);

  if (!props.source) return null;
  const hasControls = props.showSearch || props.visitorFilters.some((f) => f.field);
  return (
    <Section>
      <Container>
        {(p.l(props.heading) || p.l(props.eyebrow) || p.l(props.intro)) && <SectionHeading eyebrow={p.l(props.eyebrow)} title={p.l(props.heading)} intro={p.l(props.intro)} />}
        {hasControls && (
          <div className="mb-10 flex flex-col gap-5">
            {props.showSearch && (
              <SearchInput
                value={q}
                onChange={(v) => {
                  setQ(v);
                  reset();
                }}
                placeholder={p.m.collections.search}
                label={p.m.collections.search}
              />
            )}
            <div className={props.filtersLayout === 'stacked' ? 'flex flex-col items-start gap-5' : 'flex flex-wrap items-end gap-x-8 gap-y-5'}>
              {props.visitorFilters.map((f, i) =>
                f.field ? (
                  <VisitorFilterControl
                    key={`${i}-${f.field}-${f.display}-${clearKey}`}
                    source={props.source}
                    collection={collection}
                    filter={f}
                    value={visitor[i] ?? []}
                    onChange={(v) => {
                      setVisitor((c) => ({ ...c, [i]: v }));
                      reset();
                    }}
                  />
                ) : null,
              )}
            </div>
            {Object.values(visitor).some((v) => v.length) && (
              <button
                type="button"
                onClick={() => {
                  setVisitor({});
                  setClearKey((k) => k + 1);
                  reset();
                }}
                className="w-fit text-sm text-ink-soft underline underline-offset-4 hover:text-ink"
              >
                {p.m.collections.clear}
              </button>
            )}
          </div>
        )}
        {isLoading && !data ? (
          <div role="status" aria-label="Loading" className={cn('grid', mobileCols[props.columnsMobile], tabletCols[props.columnsTablet], desktopCols[props.columns])} style={{ gap: `${props.gap * 0.25}rem` }}>
            {Array.from({ length: Math.min(props.limit, props.columns) }, (_, i) => (
              <div key={i} className="aspect-[4/5] animate-pulse bg-surface-2" />
            ))}
          </div>
        ) : !items.length ? (
          <EmptyState message={p.l(props.emptyText) || p.m.collections.empty} />
        ) : (
          <div
            className={cn('grid', props.layout === 'list' ? 'grid-cols-1' : `${mobileCols[props.columnsMobile]} ${tabletCols[props.columnsTablet]} ${desktopCols[props.columns]}`)}
            style={{ gap: `${props.gap * 0.25}rem` }}
          >
            {items.map((item) => (
              <CardView key={item.id} block={design} item={item} collection={collection} />
            ))}
          </div>
        )}
        {more && items.length < total && (
          <div className="mt-12 flex justify-center">
            <button type="button" onClick={() => setPage((n) => n + 1)} className="rounded-full border border-ink/30 px-6 py-3 text-sm font-medium text-ink transition hover:bg-ink hover:text-bg">
              {p.m.collections.more}
            </button>
          </div>
        )}
        {props.pagination === 'pages' && pages > 1 && (
          <nav aria-label="Pagination" className="mt-12 flex flex-wrap items-center justify-center gap-2 text-sm">
            <button type="button" disabled={page <= 1} onClick={() => setPage((n) => n - 1)} className="rounded-full px-4 py-2 disabled:opacity-40">
              {p.m.collections.previous}
            </button>
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                aria-current={n === page ? 'page' : undefined}
                onClick={() => setPage(n)}
                className={cn('size-9 rounded-full', n === page ? 'bg-ink text-bg' : 'hover:bg-surface-2')}
              >
                {p.formatNumber(n)}
              </button>
            ))}
            <button type="button" disabled={page >= pages} onClick={() => setPage((n) => n + 1)} className="rounded-full px-4 py-2 disabled:opacity-40">
              {p.m.collections.next}
            </button>
          </nav>
        )}
      </Container>
    </Section>
  );
}

/** The current item (on a table's template page) or a chosen one, drawn with a box design. */
export function CollectionItemSection({ props }: Props<'collection-item'>) {
  const current = useCurrentItem();
  const { data: collections } = useCollections();
  const design = useCardDesign(props.cardDesign, props.card);
  const chosen = useCollectionItem(props.itemSlug ? props.source : '', props.itemSlug);
  const item = props.itemSlug ? chosen.data : current?.item;
  if (!item) return null;
  const collection = collections?.find((c) => c.slug === item.collection) ?? current?.collection;
  return (
    <Section>
      <Container>
        <CardView block={design} item={item} collection={collection} />
      </Container>
    </Section>
  );
}
