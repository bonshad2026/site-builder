import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SECTION_TYPES, isSectionType, type SectionType } from '@site-builder/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { api, ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { usePreferences } from '../../lib/preferences';
import type { Localized } from '../../types/site';
import { useT } from '../i18n';
import { pagesKey, usePages } from '../pages/PagesListPage';
import { Badge, Checkbox, ErrorNote, IconButton, LocalizedField, Modal, Spinner, TextField, useToast } from '../ui';
import { sectionMeta } from './fields';
import type { SectionAppearance } from '@site-builder/shared';
import { AppearanceEditor, FieldsEditor } from './Inspector';
import type { PreviewMessage } from './PreviewFrame';
import { builderReducer, initialBuilderState, type Section } from './state';

interface PageDetail {
  id: string;
  slug: string;
  title: Localized;
  isHome: boolean;
  isPublished: boolean;
  hasUnpublishedChanges: boolean;
  publishedVersion: number;
  seo: { title?: Localized; description?: Localized; noIndex?: boolean };
  document: { schemaVersion: 1; sections: Section[] };
}

type SaveState = 'saved' | 'unsaved' | 'saving' | 'error';
type Device = 'desktop' | 'tablet' | 'mobile';
const DEVICE_WIDTH: Record<Device, string> = { desktop: '100%', tablet: '768px', mobile: '375px' };

const B = {
  sections: { en: 'Sections', fa: 'سکشن‌ها' },
  library: { en: 'Add section', fa: 'افزودن سکشن' },
  dragHint: { en: 'Drag to reorder, or focus the handle and use Space + arrow keys.', fa: 'برای جابه‌جایی بکشید، یا دستگیره را انتخاب و با Space و کلیدهای جهت جابه‌جا کنید.' },
  libraryHint: { en: 'Click to add after the selected section, or drag into the list.', fa: 'برای افزودن پس از سکشن انتخاب‌شده کلیک کنید یا به فهرست بکشید.' },
  noSelection: { en: 'Select a section to edit its content.', fa: 'برای ویرایش، یک سکشن را انتخاب کنید.' },
  empty: { en: 'This page has no sections yet. Add one from the library.', fa: 'این صفحه هنوز سکشنی ندارد. از کتابخانه اضافه کنید.' },
  undo: { en: 'Undo', fa: 'واگرد' },
  redo: { en: 'Redo', fa: 'انجام دوباره' },
  duplicate: { en: 'Duplicate', fa: 'تکثیر' },
  hide: { en: 'Hide / show', fa: 'پنهان / نمایش' },
  pageSettings: { en: 'Page settings', fa: 'تنظیمات صفحه' },
  preview: { en: 'Preview language', fa: 'زبان پیش‌نمایش' },
  live: { en: 'View live', fa: 'مشاهده سایت' },
  saved: { en: 'All changes saved (draft)', fa: 'همه تغییرات ذخیره شد (پیش‌نویس)' },
  unsaved: { en: 'Unsaved changes', fa: 'تغییرات ذخیره‌نشده' },
  saving: { en: 'Saving…', fa: 'در حال ذخیره…' },
  saveError: { en: 'Not saved', fa: 'ذخیره نشد' },
  publishedOk: { en: 'Published. Visitors now see this version.', fa: 'منتشر شد. بازدیدکنندگان این نسخه را می‌بینند.' },
  dynamic: { en: 'Shows live data', fa: 'نمایش داده‌های زنده' },
  leave: { en: 'You have unsaved changes.', fa: 'تغییرات ذخیره‌نشده دارید.' },
};

function useB() {
  const { locale } = usePreferences();
  return (k: keyof typeof B) => B[k][locale];
}

function LayerItem({
  section,
  index,
  count,
  selected,
  onSelect,
  dispatch,
}: {
  section: Section;
  index: number;
  count: number;
  selected: boolean;
  onSelect: () => void;
  dispatch: React.Dispatch<Parameters<typeof builderReducer>[1]>;
}) {
  const t = useT();
  const b = useB();
  const { locale, l } = usePreferences();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const meta = isSectionType(section.type) ? sectionMeta[section.type] : null;
  const heading = l(section.props.heading as Localized | undefined);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group flex items-center gap-1 rounded-md border bg-bg px-1.5 py-1.5 text-sm', selected ? 'border-ink' : 'border-line', isDragging && 'relative z-10 opacity-60 shadow-lg', section.hidden && 'opacity-60')}
    >
      <button type="button" {...attributes} {...listeners} aria-label={`${b('sections')}: ${meta?.label[locale] ?? section.type}`} className="cursor-grab rounded px-1 text-ink-soft hover:bg-surface-2 active:cursor-grabbing">
        ⠿
      </button>
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-start" aria-pressed={selected}>
        <span className="block truncate font-medium text-ink">{meta?.label[locale] ?? section.type}</span>
        {heading && <span className="block truncate text-xs text-ink-soft">{heading}</span>}
      </button>
      <div className="flex shrink-0 opacity-70 group-hover:opacity-100">
        <IconButton label={t.moveUp} disabled={index === 0} onClick={() => dispatch({ type: 'moveBy', id: section.id, delta: -1 })}>
          ↑
        </IconButton>
        <IconButton label={t.moveDown} disabled={index === count - 1} onClick={() => dispatch({ type: 'moveBy', id: section.id, delta: 1 })}>
          ↓
        </IconButton>
        <IconButton label={b('hide')} onClick={() => dispatch({ type: 'toggleHidden', id: section.id })}>
          {section.hidden ? '◌' : '◉'}
        </IconButton>
        <IconButton label={b('duplicate')} onClick={() => dispatch({ type: 'duplicate', id: section.id })}>
          ⧉
        </IconButton>
        <IconButton label={t.delete} onClick={() => dispatch({ type: 'remove', id: section.id })}>
          ✕
        </IconButton>
      </div>
    </li>
  );
}

function LibraryItem({ type, onAdd }: { type: SectionType; onAdd: () => void }) {
  const { locale } = usePreferences();
  const b = useB();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `new:${type}` });
  const meta = sectionMeta[type];
  return (
    <li>
      <button
        ref={setNodeRef}
        type="button"
        {...listeners}
        {...attributes}
        onClick={onAdd}
        className={cn('w-full rounded-md border border-line bg-bg px-3 py-2 text-start text-sm hover:border-ink', isDragging && 'opacity-50')}
      >
        <span className="flex items-center justify-between gap-2 font-medium text-ink">
          {meta.label[locale]}
          {meta.dynamic && <Badge tone="accent">{b('dynamic')}</Badge>}
        </span>
        <span className="block text-xs text-ink-soft">{meta.description[locale]}</span>
      </button>
    </li>
  );
}

/**
 * Drop target for new sections from the library. Only active in the library tab:
 * otherwise it would compete with the sections themselves while reordering.
 */
function LayersDropZone({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'layers', disabled: !enabled });
  return (
    <div ref={setNodeRef} className={cn('min-h-24 rounded-md', isOver && 'bg-accent-soft/50')}>
      {children}
    </div>
  );
}

function PageSettingsModal({ siteId, page, open, onClose }: { siteId: string; page: PageDetail; open: boolean; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: page.title, slug: page.slug, seoTitle: page.seo.title ?? { en: '', fa: '' }, seoDescription: page.seo.description ?? { en: '', fa: '' }, noIndex: !!page.seo.noIndex });
  useEffect(() => setForm({ title: page.title, slug: page.slug, seoTitle: page.seo.title ?? { en: '', fa: '' }, seoDescription: page.seo.description ?? { en: '', fa: '' }, noIndex: !!page.seo.noIndex }), [page]);
  const save = useMutation({
    mutationFn: () =>
      api.patch(`/sites/${siteId}/pages/${page.id}`, { title: form.title, slug: page.isHome ? undefined : form.slug, seo: { title: form.seoTitle, description: form.seoDescription, noIndex: form.noIndex } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['site', siteId, 'page', page.id] });
      qc.invalidateQueries({ queryKey: pagesKey(siteId) });
      onClose();
    },
  });
  return (
    <Modal open={open} onClose={onClose} title={t.edit} wide>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <LocalizedField label={t.title} value={form.title} onChange={(title) => setForm((f) => ({ ...f, title }))} />
        {!page.isHome && <TextField label={t.slug} dir="ltr" value={form.slug} onChange={(slug) => setForm((f) => ({ ...f, slug: slug.toLowerCase() }))} />}
        <LocalizedField label={t.seoTitle} value={form.seoTitle} onChange={(seoTitle) => setForm((f) => ({ ...f, seoTitle }))} />
        <LocalizedField label={t.seoDescription} value={form.seoDescription} onChange={(seoDescription) => setForm((f) => ({ ...f, seoDescription }))} multiline />
        <Checkbox label={t.noIndex} checked={form.noIndex} onChange={(noIndex) => setForm((f) => ({ ...f, noIndex }))} />
        <ErrorNote error={save.error} />
        <div className="flex justify-end">
          <Button type="submit" disabled={save.isPending}>
            {t.save}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function BuilderPage() {
  const { siteId = '', pageId = '' } = useParams();
  const t = useT();
  const b = useB();
  const toast = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { locale, l, dir } = usePreferences();
  const [state, dispatch] = useReducer(builderReducer, initialBuilderState);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<unknown>(null);
  const [device, setDevice] = useState<Device>('desktop');
  const [previewLocale, setPreviewLocale] = useState(locale);
  const [panel, setPanel] = useState<'layers' | 'library'>('layers');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const savedRevision = useRef(0);
  const { data: pages = [] } = usePages(siteId);

  const page = useQuery({ queryKey: ['site', siteId, 'page', pageId], queryFn: () => api.get<PageDetail>(`/sites/${siteId}/pages/${pageId}`) });

  // Load the draft once per page (not on every refetch, which would discard unsaved edits).
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (page.data && loadedFor.current !== pageId) {
      loadedFor.current = pageId;
      savedRevision.current = 0;
      dispatch({ type: 'load', sections: page.data.document.sections });
      setSaveState('saved');
    }
  }, [page.data, pageId]);

  const save = useCallback(async () => {
    const revision = state.revision;
    setSaveState('saving');
    try {
      await api.patch(`/sites/${siteId}/pages/${pageId}`, { document: { schemaVersion: 1, sections: state.sections } });
      savedRevision.current = revision;
      setSaveError(null);
      setSaveState(revision === state.revision ? 'saved' : 'unsaved');
      qc.invalidateQueries({ queryKey: pagesKey(siteId) });
      return true;
    } catch (err) {
      setSaveError(err);
      setSaveState('error');
      return false;
    }
  }, [siteId, pageId, state.sections, state.revision, qc]);

  // Autosave the draft shortly after the last change.
  useEffect(() => {
    if (state.revision === savedRevision.current) return;
    setSaveState('unsaved');
    const timer = setTimeout(() => void save(), 1500);
    return () => clearTimeout(timer);
  }, [state.revision, save]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (saveState === 'saved') return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [saveState]);

  const publish = useMutation({
    mutationFn: async () => {
      if (state.revision !== savedRevision.current && !(await save())) throw new ApiError(400, 'save_failed', b('saveError'));
      return api.post(`/sites/${siteId}/pages/${pageId}/publish`);
    },
    onSuccess: () => {
      toast(b('publishedOk'));
      qc.invalidateQueries({ queryKey: ['site', siteId, 'page', pageId] });
      qc.invalidateQueries({ queryKey: pagesKey(siteId) });
      qc.invalidateQueries({ queryKey: ['public'] });
    },
    onError: (e) => toast(e.message, 'bad'),
  });

  // Keyboard shortcuts (outside text fields, where the browser's own undo applies).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable]')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Keep the preview iframe in sync.
  const postToPreview = useCallback(() => {
    const message: PreviewMessage = { type: 'sb:doc', siteId, sections: state.sections, selectedId: state.selectedId };
    iframe.current?.contentWindow?.postMessage(message, window.location.origin);
  }, [siteId, state.sections, state.selectedId]);
  useEffect(postToPreview, [postToPreview]);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'sb:ready') postToPreview();
      if (e.data?.type === 'sb:select') {
        dispatch({ type: 'select', id: e.data.id });
        setPanel('layers');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [postToPreview]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragStart = (e: DragStartEvent) => setDragging(String(e.active.id));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    const id = String(active.id);
    if (id.startsWith('new:')) {
      const type = id.slice(4);
      if (!over || !isSectionType(type)) return;
      const overIndex = state.sections.findIndex((s) => s.id === over.id);
      dispatch({ type: 'add', sectionType: type, index: overIndex >= 0 ? overIndex : state.sections.length });
      setPanel('layers');
      return;
    }
    if (!over || active.id === over.id) return;
    dispatch({ type: 'move', from: state.sections.findIndex((s) => s.id === active.id), to: state.sections.findIndex((s) => s.id === over.id) });
  };

  if (page.isLoading) return <Spinner />;
  if (page.error || !page.data) return <div className="p-8"><ErrorNote error={page.error} /></div>;

  const selected = state.sections.find((s) => s.id === state.selectedId) ?? null;
  const previewSrc = `${previewLocale === 'fa' ? '/fa' : ''}/__preview`;
  const statusText = { saved: b('saved'), unsaved: b('unsaved'), saving: b('saving'), error: b('saveError') }[saveState];
  const liveHref = `${locale === 'fa' ? '/fa' : ''}/${page.data.isHome ? '' : page.data.slug}`;

  return (
    <div className="flex h-dvh flex-col bg-surface-2 text-ink" dir={dir}>
      {/* Top bar */}
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-bg px-4 py-2.5">
        <Link to={`/admin/sites/${siteId}/pages`} className="text-sm text-ink-soft hover:text-ink">
          ← {t.pages}
        </Link>
        <select
          aria-label={t.pages}
          value={pageId}
          onChange={(e) => {
            if (saveState !== 'saved' && !window.confirm(b('leave'))) return;
            navigate(`/admin/sites/${siteId}/pages/${e.target.value}/builder`);
          }}
          className="max-w-48 rounded-md border border-line bg-bg px-2 py-1.5 text-sm"
        >
          {pages.map((p) => (
            <option key={p.id} value={p.id}>
              {l(p.title)}
            </option>
          ))}
        </select>
        <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)}>
          {b('pageSettings')}
        </Button>
        <div className="flex items-center gap-1">
          <IconButton label={b('undo')} disabled={!state.past.length} onClick={() => dispatch({ type: 'undo' })}>
            ↶
          </IconButton>
          <IconButton label={b('redo')} disabled={!state.future.length} onClick={() => dispatch({ type: 'redo' })}>
            ↷
          </IconButton>
        </div>
        <div role="group" aria-label="Device" className="flex rounded-md border border-line text-xs">
          {(['desktop', 'tablet', 'mobile'] as Device[]).map((d) => (
            <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)} className={cn('px-2.5 py-1.5', device === d ? 'bg-ink text-bg' : 'text-ink-soft')}>
              {d === 'desktop' ? '🖥' : d === 'tablet' ? '▭' : '📱'} <span className="sr-only sm:not-sr-only">{d}</span>
            </button>
          ))}
        </div>
        <div role="group" aria-label={b('preview')} className="flex rounded-md border border-line text-xs">
          {(['en', 'fa'] as const).map((code) => (
            <button key={code} type="button" aria-pressed={previewLocale === code} onClick={() => setPreviewLocale(code)} className={cn('px-2.5 py-1.5', previewLocale === code ? 'bg-ink text-bg' : 'text-ink-soft')}>
              {code === 'en' ? 'EN' : 'فا'}
            </button>
          ))}
        </div>
        <div className="ms-auto flex items-center gap-3">
          <span role="status" className={cn('text-xs', saveState === 'error' ? 'text-danger' : 'text-ink-soft')}>
            {statusText}
          </span>
          {page.data.isPublished ? <Badge tone="good">{t.published} v{page.data.publishedVersion}</Badge> : <Badge>{t.notPublished}</Badge>}
          <a href={liveHref} target="_blank" rel="noreferrer" className="text-xs text-ink-soft underline-offset-4 hover:underline">
            {b('live')}
          </a>
          <Button size="sm" variant="outline" onClick={() => void save()} disabled={saveState === 'saving' || saveState === 'saved'}>
            {t.save}
          </Button>
          <Button size="sm" onClick={() => publish.mutate()} disabled={publish.isPending}>
            {t.publish}
          </Button>
        </div>
      </header>
      {saveError ? (
        <div className="border-b border-line bg-bg px-4 py-2">
          <ErrorNote error={saveError} />
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {/* Left: layers + library */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <aside className="flex w-80 shrink-0 flex-col border-e border-line bg-bg">
            <div role="tablist" className="grid grid-cols-2 border-b border-line text-sm">
              {(['layers', 'library'] as const).map((p) => (
                <button key={p} role="tab" type="button" aria-selected={panel === p} onClick={() => setPanel(p)} className={cn('py-2.5', panel === p ? 'border-b-2 border-ink font-medium' : 'text-ink-soft')}>
                  {p === 'layers' ? `${b('sections')} (${state.sections.length})` : b('library')}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {panel === 'layers' ? (
                <>
                  <p className="mb-3 text-xs text-ink-soft">{b('dragHint')}</p>
                  <LayersDropZone enabled={false}>
                    {state.sections.length === 0 && <p className="rounded-md border border-dashed border-line p-4 text-sm text-ink-soft">{b('empty')}</p>}
                    <SortableContext items={state.sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                      <ul className="flex flex-col gap-1.5">
                        {state.sections.map((s, i) => (
                          <LayerItem key={s.id} section={s} index={i} count={state.sections.length} selected={s.id === state.selectedId} onSelect={() => dispatch({ type: 'select', id: s.id })} dispatch={dispatch} />
                        ))}
                      </ul>
                    </SortableContext>
                  </LayersDropZone>
                </>
              ) : (
                <>
                  <p className="mb-3 text-xs text-ink-soft">{b('libraryHint')}</p>
                  <ul className="flex flex-col gap-1.5">
                    {SECTION_TYPES.map((type) => (
                      <LibraryItem
                        key={type}
                        type={type}
                        onAdd={() => {
                          dispatch({ type: 'add', sectionType: type });
                          setPanel('layers');
                        }}
                      />
                    ))}
                  </ul>
                  {/* Dropping a library item here appends it to the page. */}
                  <div className="sticky bottom-0 mt-4 bg-bg pt-2">
                    <LayersDropZone enabled>
                      <p className="flex min-h-24 items-center justify-center rounded-md border border-dashed border-line p-3 text-center text-xs text-ink-soft">↓ {b('library')}</p>
                    </LayersDropZone>
                  </div>
                </>
              )}
            </div>
          </aside>
          <DragOverlay>
            {dragging?.startsWith('new:') ? <div className="rounded-md border border-ink bg-bg px-3 py-2 text-sm shadow-lg">{sectionMeta[dragging.slice(4) as SectionType]?.label[locale]}</div> : null}
          </DragOverlay>
        </DndContext>

        {/* Center: live preview */}
        <main className="flex min-w-0 flex-1 justify-center overflow-auto p-4">
          <div className="h-full bg-bg shadow-sm transition-[width] duration-300" style={{ width: DEVICE_WIDTH[device], maxWidth: '100%' }}>
            <iframe ref={iframe} key={previewSrc} src={previewSrc} title="Preview" className="h-full w-full border-0" onLoad={postToPreview} />
          </div>
        </main>

        {/* Right: section settings */}
        <aside className="w-96 shrink-0 overflow-y-auto border-s border-line bg-bg p-4" aria-label={t.settings}>
          {selected && isSectionType(selected.type) ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-xl">{sectionMeta[selected.type].label[locale]}</h2>
                {selected.hidden && <Badge>{b('hide')}</Badge>}
              </div>
              <FieldsEditor fields={sectionMeta[selected.type].fields} value={selected.props} onChange={(props) => dispatch({ type: 'update', id: selected.id, props })} siteId={siteId} />
              <div className="mt-6">
                <AppearanceEditor
                  value={selected.props.appearance as SectionAppearance | undefined}
                  onChange={(appearance) => dispatch({ type: 'update', id: selected.id, props: { ...selected.props, appearance } })}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-soft">{selected ? `Unknown section type “${selected.type}”` : b('noSelection')}</p>
          )}
        </aside>
      </div>
      <PageSettingsModal siteId={siteId} page={page.data} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
