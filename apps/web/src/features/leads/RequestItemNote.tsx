import { useSearchParams } from 'react-router';
import { usePreferences } from '../../lib/preferences';
import { useCollectionItem } from '../collections/data';

/** `?item=classes/hydrant` on a request form: the content-table item the request is about. */
export function useRequestedItem() {
  const [params] = useSearchParams();
  const [collection = '', slug = ''] = (params.get('item') ?? '').split('/');
  return collection && slug ? { collection, slug } : null;
}

/** Shows which item a request form is for (the "request" button of a box links here). */
export function RequestItemNote() {
  const ref = useRequestedItem();
  const { l, m, format } = usePreferences();
  const { data: item } = useCollectionItem(ref?.collection ?? '', ref?.slug ?? '');
  if (!item) return null;
  return <p className="border-s-2 border-accent ps-4 text-sm text-ink sm:col-span-2">{format(m.collections.requestFor, { title: l(item.title) })}</p>;
}
