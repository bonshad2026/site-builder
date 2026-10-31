import { newBlock, type CardBlock, type PublicCollection } from '@site-builder/shared';
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { Container, Section } from '../../components/ui/Layout';
import { usePageMeta } from '../../hooks/usePageMeta';
import { usePreferences } from '../../lib/preferences';
import { PageSections } from '../../sections/SectionRenderer';
import { isNotFound, usePublishedPage } from '../public-site/data';
import { NotFoundPage } from '../public-site/pages/NotFoundPage';
import { CardView } from './CardView';
import { CurrentItemContext, useCollection, useCollectionItem } from './data';

/** The page of a table without a template page: image beside the title, every field, price, seats and buttons. */
export function defaultDetailDesign(collection: PublicCollection): CardBlock {
  const shown = collection.fields.filter((f) => f.type !== 'image' && f.type !== 'gallery' && f.key !== collection.imageField);
  // The main image (the table's choice, else its first image field; the API resolves it the same way).
  const hasImage = !!collection.imageField || collection.fields.some((f) => f.type === 'image' || f.type === 'gallery');
  const c = collection.commerce;
  return newBlock('stack', {
    direction: 'row',
    wrap: true,
    gap: 10,
    children: [
      ...(hasImage ? [newBlock('image', { field: '', ratio: 'landscape', radius: 8, width: '1/2' })] : []),
      newBlock('stack', {
        direction: 'column',
        gap: 4,
        width: hasImage ? '1/3' : 'full',
        children: [
          newBlock('text', { field: 'title', textStyle: 'title', size: 'xl' }),
          ...shown.map((f) => newBlock('text', { field: f.key, showLabel: f.type !== 'textarea', textStyle: f.type === 'textarea' ? 'body' : 'subtitle' })),
          newBlock('price', { textStyle: 'subtitle', size: 'lg', weight: 'medium' }),
          newBlock('capacity', { textStyle: 'small' }),
          newBlock('stack', {
            direction: 'row',
            wrap: true,
            gap: 3,
            children: [
              ...(c.enabled ? [newBlock('button', { action: 'cart', variant: 'primary' })] : []),
              newBlock('button', { action: 'request', variant: c.enabled ? 'secondary' : 'primary' }),
            ],
          }),
        ],
      }),
    ],
  });
}

/**
 * `/:collection/:item`: an item of a content table, shown with the table's template page (any
 * builder page whose sections use `{{field}}` texts, the item section and related lists), or a
 * simple built-in layout when the table has none.
 */
export function CollectionItemPage() {
  const { collection: slug = '', item: itemSlug = '' } = useParams();
  const { l } = usePreferences();
  const { data: collection, isLoading: loadingTables } = useCollection(slug);
  const { data: item, error, isLoading } = useCollectionItem(collection ? slug : '', itemSlug);
  const template = usePublishedPage(collection?.detailPage ?? '', !!collection?.detailPage);
  const fallback = useMemo(() => (collection ? defaultDetailDesign(collection) : null), [collection]);
  const value = useMemo(() => (item && collection ? { item, collection } : null), [item, collection]);
  usePageMeta(item ? l(item.title) : '', undefined, {});

  if (loadingTables || (collection && isLoading) || (collection?.detailPage && template.isLoading)) return <div role="status" aria-label="Loading" className="min-h-screen" />;
  if (!collection || !item || isNotFound(error) || !value) return <NotFoundPage />;
  return (
    <CurrentItemContext.Provider value={value}>
      {template.data ? (
        <PageSections document={template.data.document} />
      ) : (
        <Section className="pt-32 sm:pt-40">
          <Container>
            <CardView block={fallback!} item={item} collection={collection} />
          </Container>
        </Section>
      )}
    </CurrentItemContext.Provider>
  );
}
