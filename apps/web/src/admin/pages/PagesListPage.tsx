import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, ButtonLink } from '../../components/ui/Button';
import { api } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import type { Localized } from '../../types/site';
import { useT } from '../i18n';
import { Badge, ErrorNote, LocalizedField, Modal, PageTitle, Spinner, TextField, useToast } from '../ui';

export interface PageSummary {
  id: string;
  slug: string;
  title: Localized;
  isHome: boolean;
  position: number;
  isPublished: boolean;
  hasUnpublishedChanges: boolean;
  publishedAt: string | null;
  publishedVersion: number;
}

export const pagesKey = (siteId: string) => ['site', siteId, 'pages'];

export function usePages(siteId: string) {
  return useQuery({ queryKey: pagesKey(siteId), queryFn: () => api.get<PageSummary[]>(`/sites/${siteId}/pages`) });
}

const toSlug = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

function SortableRow({ page, siteId, onDelete, onHome }: { page: PageSummary; siteId: string; onDelete: () => void; onHome: () => void }) {
  const t = useT();
  const { l } = usePreferences();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`flex flex-wrap items-center gap-3 bg-surface px-4 py-3 ${isDragging ? 'relative z-10 shadow-lg' : ''}`}>
      <button type="button" {...attributes} {...listeners} aria-label={`${t.position}: ${l(page.title)}`} className="cursor-grab rounded px-1 text-ink-soft hover:bg-surface-2 active:cursor-grabbing">
        ⠿
      </button>
      <div className="min-w-0 flex-1">
        <Link to={`/admin/sites/${siteId}/pages/${page.id}/builder`} className="font-medium hover:underline">
          {l(page.title)}
        </Link>
        <span className="ms-2 text-xs text-ink-soft" dir="ltr">
          /{page.isHome ? '' : page.slug}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {page.isHome && <Badge tone="accent">{t.home}</Badge>}
        {page.isPublished ? <Badge tone="good">{t.published}</Badge> : <Badge>{t.notPublished}</Badge>}
        {page.isPublished && page.hasUnpublishedChanges && <Badge tone="warn">{t.hasChanges}</Badge>}
        <ButtonLink to={`/admin/sites/${siteId}/pages/${page.id}/builder`} size="sm">
          {t.openBuilder}
        </ButtonLink>
        {!page.isHome && (
          <Button size="sm" variant="ghost" onClick={onHome}>
            {t.setHome}
          </Button>
        )}
        {!page.isHome && (
          <Button size="sm" variant="ghost" onClick={onDelete}>
            {t.delete}
          </Button>
        )}
      </div>
    </li>
  );
}

export default function PagesListPage({ siteId }: { siteId: string }) {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading, error } = usePages(siteId);
  const [order, setOrder] = useState<PageSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState<Localized>({ en: '', fa: '' });
  const [slug, setSlug] = useState('');

  useEffect(() => setOrder(data ?? []), [data]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const refresh = () => qc.invalidateQueries({ queryKey: pagesKey(siteId) });
  const reorder = useMutation({ mutationFn: (ids: string[]) => api.put(`/sites/${siteId}/pages/order`, { ids }), onSuccess: refresh, onError: () => toast(t.error, 'bad') });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/sites/${siteId}/pages/${id}`), onSuccess: refresh, onError: (e) => toast(e.message, 'bad') });
  const setHome = useMutation({ mutationFn: (id: string) => api.patch(`/sites/${siteId}/pages/${id}`, { isHome: true }), onSuccess: refresh, onError: (e) => toast(e.message, 'bad') });
  const create = useMutation({
    mutationFn: () => api.post<{ id: string }>(`/sites/${siteId}/pages`, { slug, title, document: { schemaVersion: 1, sections: [] } }),
    onSuccess: (page) => {
      refresh();
      navigate(`/admin/sites/${siteId}/pages/${page.id}/builder`);
    },
  });

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const next = arrayMove(order, order.findIndex((p) => p.id === active.id), order.findIndex((p) => p.id === over.id));
    setOrder(next);
    reorder.mutate(next.map((p) => p.id));
  };

  return (
    <>
      <PageTitle title={t.pages} actions={<Button onClick={() => setCreating(true)}>{t.newPage}</Button>} />
      {isLoading ? (
        <Spinner />
      ) : (
        <>
          <ErrorNote error={error} />
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={order.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <ul className="divide-y divide-line border border-line">
                {order.map((p) => (
                  <SortableRow
                    key={p.id}
                    page={p}
                    siteId={siteId}
                    onHome={() => setHome.mutate(p.id)}
                    onDelete={() => window.confirm(t.confirmDelete) && remove.mutate(p.id)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title={t.newPage}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <LocalizedField
            label={t.title}
            value={title}
            onChange={(v) => {
              if (!slug || slug === toSlug(title.en)) setSlug(toSlug(v.en));
              setTitle(v);
            }}
          />
          <TextField label={t.slug} dir="ltr" value={slug} onChange={(v) => setSlug(toSlug(v))} hint="about-us" required />
          <ErrorNote error={create.error} />
          <div className="flex justify-end">
            <Button type="submit" disabled={create.isPending}>
              {t.create}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
