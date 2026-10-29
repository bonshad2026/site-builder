import { CURRENCIES, currencyDecimals } from '@site-builder/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { api, apiRequest } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import type { ProductDto, ServiceDto } from '../../types/api';
import type { Localized } from '../../types/site';
import { useAdminSettings } from '../AdminRoot';
import { useT } from '../i18n';
import { Badge, Checkbox, ErrorNote, ListEditor, LocalizedField, Modal, NumberField, PageTitle, Pagination, SelectField, Spinner, Table, Td, TextField, useToast } from '../ui';
import { ImagePicker } from './FilesPage';
import { ProductExport } from './ProductExport';

type Kind = 'services' | 'products';
type Item = ServiceDto | ProductDto;
const empty: Localized = { en: '', fa: '' };

function blank(kind: Kind): Partial<ServiceDto> | Partial<ProductDto> {
  return kind === 'services'
    ? { slug: '', title: empty, summary: empty, body: empty, duration: empty, startingFrom: empty, deliverables: [], process: [], status: 'draft', position: 0, imageAssetId: null }
    : {
        slug: '',
        name: empty,
        description: empty,
        category: null,
        priceMinor: null,
        currency: 'IRR',
        stock: null,
        isAvailable: true,
        discountPercent: 0,
        colors: [],
        maxPerOrder: null,
        featured: false,
        materials: empty,
        dimensions: '',
        leadTime: empty,
        status: 'draft',
        position: 0,
        imageAssetId: null,
        gallery: [],
        attributes: [],
      };
}

/** Converts the editor state into the API payload (only writable fields). */
function payload(kind: Kind, item: Partial<Item>) {
  const common = { slug: item.slug, status: item.status, position: item.position ?? 0, imageAssetId: item.imageAssetId ?? null };
  if (kind === 'services') {
    const s = item as Partial<ServiceDto>;
    return { ...common, title: s.title, summary: s.summary, body: s.body, duration: s.duration, startingFrom: s.startingFrom, deliverables: s.deliverables, process: s.process };
  }
  const p = item as Partial<ProductDto>;
  return {
    ...common,
    name: p.name,
    description: p.description,
    category: p.category || null,
    priceMinor: p.priceMinor === null || p.priceMinor === undefined || p.priceMinor === '' ? null : Number(p.priceMinor),
    currency: p.currency ?? 'IRR',
    stock: p.stock ?? null,
    isAvailable: p.isAvailable,
    discountPercent: p.discountPercent ?? 0,
    colors: (p.colors ?? []).filter((c) => c.name.en.trim() && c.name.fa.trim()),
    maxPerOrder: p.maxPerOrder ?? null,
    featured: p.featured,
    materials: p.materials,
    dimensions: p.dimensions ?? '',
    leadTime: p.leadTime,
    images: (p.gallery ?? []).map((g) => g.id).filter(Boolean),
    attributes: (p.attributes ?? []).filter((a) => (a.name.en.trim() || a.name.fa.trim()) && (a.value.en.trim() || a.value.fa.trim())),
  };
}

function Editor({ siteId, kind, item, onClose }: { siteId: string; kind: Kind; item: Partial<Item> | null; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const { l } = usePreferences();
  const { data: settings } = useAdminSettings(siteId);
  const categories = settings?.productCategories ?? [];
  const [draft, setDraft] = useState<Partial<Item>>({});
  // New products use the shop's currency.
  useEffect(() => setDraft(item ? (item.id ? item : { ...item, currency: settings?.shop?.currency ?? 'IRR' }) : {}), [item, settings?.shop?.currency]);
  const set = <K extends string>(key: K, value: unknown) => setDraft((d) => ({ ...d, [key]: value }));
  const isNew = !item?.id;
  const s = draft as Partial<ServiceDto>;
  const p = draft as Partial<ProductDto>;
  const [imageUrl, setImageUrl] = useState('');
  useEffect(() => setImageUrl(item?.imageUrl ?? ''), [item]);

  const save = useMutation({
    mutationFn: () => (isNew ? api.post(`/sites/${siteId}/${kind}`, payload(kind, draft)) : api.patch(`/sites/${siteId}/${kind}/${item!.id}`, payload(kind, draft))),
    onSuccess: () => {
      toast(t.saved);
      qc.invalidateQueries({ queryKey: ['site', siteId, kind] });
      qc.invalidateQueries({ queryKey: ['public'] });
      onClose();
    },
  });

  return (
    <Modal open={!!item} onClose={onClose} title={isNew ? (kind === 'services' ? t.newService : t.newProduct) : t.edit} wide>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label={t.slug} dir="ltr" value={draft.slug ?? ''} onChange={(v) => set('slug', v.toLowerCase())} required />
          <SelectField
            label={t.status}
            value={(draft.status ?? 'draft') as 'draft' | 'published' | 'archived'}
            onChange={(v) => set('status', v)}
            options={[
              { value: 'draft', label: t.draft },
              { value: 'published', label: t.published },
              { value: 'archived', label: t.archived },
            ]}
          />
          <NumberField label={t.position} value={draft.position ?? 0} onChange={(v) => set('position', v ?? 0)} min={0} />
        </div>
        <ImagePicker
          siteId={siteId}
          label={t.image}
          value={imageUrl}
          onChange={(url, asset) => {
            setImageUrl(url);
            set('imageAssetId', asset?.id ?? null);
          }}
        />
        {kind === 'services' ? (
          <>
            <LocalizedField label={t.title} value={s.title} onChange={(v) => set('title', v)} />
            <LocalizedField label={t.summary} value={s.summary} onChange={(v) => set('summary', v)} multiline rows={2} />
            <LocalizedField label={t.body} value={s.body} onChange={(v) => set('body', v)} multiline rows={5} />
            <div className="grid gap-4 lg:grid-cols-2">
              <LocalizedField label={t.duration} value={s.duration} onChange={(v) => set('duration', v)} />
              <LocalizedField label={t.startingFrom} value={s.startingFrom} onChange={(v) => set('startingFrom', v)} />
            </div>
            <ListEditor label={t.deliverables} items={s.deliverables ?? []} onChange={(v) => set('deliverables', v)} create={() => ({ ...empty })} render={(d, update) => <LocalizedField label={t.title} value={d} onChange={update} />} />
            <ListEditor
              label={t.process}
              items={s.process ?? []}
              onChange={(v) => set('process', v)}
              create={() => ({ title: { ...empty }, text: { ...empty } })}
              render={(step, update) => (
                <>
                  <LocalizedField label={t.title} value={step.title} onChange={(title) => update({ ...step, title })} />
                  <LocalizedField label={t.body} value={step.text} onChange={(text) => update({ ...step, text })} />
                </>
              )}
            />
          </>
        ) : (
          <>
            <LocalizedField label={t.name} value={p.name} onChange={(v) => set('name', v)} />
            <LocalizedField label={t.body} value={p.description} onChange={(v) => set('description', v)} multiline rows={4} />
            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField
                label={t.category}
                value={p.category ?? ''}
                onChange={(v) => set('category', v || null)}
                options={[
                  { value: '', label: t.noCategory },
                  ...categories.map((c) => ({ value: c.slug, label: l(c.label) || c.slug })),
                  // A category the product still uses but the settings no longer list.
                  ...(p.category && !categories.some((c) => c.slug === p.category) ? [{ value: p.category, label: p.category }] : []),
                ]}
              />
              <NumberField
                label={`${t.price} (${p.currency ?? 'IRR'})`}
                value={p.priceMinor ? Number(p.priceMinor) / 10 ** currencyDecimals(p.currency ?? 'IRR') : null}
                onChange={(v) => set('priceMinor', v === null ? null : String(Math.round(v * 10 ** currencyDecimals(p.currency ?? 'IRR'))))}
                min={0}
              />
              <NumberField label={t.stock} value={p.stock ?? null} onChange={(v) => set('stock', v)} min={0} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField label={t.discountPercent} value={p.discountPercent ?? 0} onChange={(v) => set('discountPercent', Math.max(0, Math.min(90, v ?? 0)))} min={0} />
              <NumberField label={t.maxPerOrder} value={p.maxPerOrder ?? null} onChange={(v) => set('maxPerOrder', v === null ? null : Math.max(1, Math.min(999, v)))} min={1} />
              <SelectField label={t.currency} value={(p.currency ?? 'IRR') as (typeof CURRENCIES)[number]} onChange={(v) => set('currency', v)} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            </div>
            <ListEditor
              label={t.moreImages}
              items={p.gallery ?? []}
              onChange={(v) => set('gallery', v)}
              create={() => ({ id: '', url: '' })}
              max={12}
              render={(g, update) => <ImagePicker siteId={siteId} label={t.image} value={g.url} onChange={(url, asset) => update({ id: asset?.id ?? (url ? g.id : ''), url })} />}
            />
            <ListEditor
              label={t.attributes}
              items={p.attributes ?? []}
              onChange={(v) => set('attributes', v)}
              create={() => ({ name: { ...empty }, value: { ...empty } })}
              max={40}
              render={(a, update) => (
                <div className="grid gap-3 lg:grid-cols-2">
                  <LocalizedField label={t.attributeName} value={a.name} onChange={(name) => update({ ...a, name })} />
                  <LocalizedField label={t.attributeValue} value={a.value} onChange={(value) => update({ ...a, value })} />
                </div>
              )}
            />
            <ListEditor
              label={t.colors}
              items={p.colors ?? []}
              onChange={(v) => set('colors', v)}
              create={() => ({ name: { en: '', fa: '' }, hex: '#000000' })}
              max={12}
              render={(c, update) => (
                <div className="flex items-end gap-3">
                  <LocalizedField label={t.colorName} value={c.name} onChange={(name) => update({ ...c, name })} />
                  <input type="color" aria-label={t.colorName} value={c.hex} onChange={(e) => update({ ...c, hex: e.target.value })} className="mb-0.5 h-9 w-12 shrink-0 rounded border border-line" />
                </div>
              )}
            />
            <div className="flex flex-wrap gap-6">
              <Checkbox label={t.available} checked={p.isAvailable ?? true} onChange={(v) => set('isAvailable', v)} />
              <Checkbox label={t.featured} checked={p.featured ?? false} onChange={(v) => set('featured', v)} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <LocalizedField label={t.materials} value={p.materials} onChange={(v) => set('materials', v)} />
              <LocalizedField label={t.leadTime} value={p.leadTime} onChange={(v) => set('leadTime', v)} />
            </div>
            <TextField label={t.dimensions} dir="ltr" value={p.dimensions ?? ''} onChange={(v) => set('dimensions', v)} />
          </>
        )}
        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? t.saving : t.save}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function CatalogPages({ siteId, kind }: { siteId: string; kind: Kind }) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const { l, formatMoney } = usePreferences();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Partial<Item> | null>(null);
  const list = useQuery({
    queryKey: ['site', siteId, kind, page, q],
    queryFn: () => apiRequest<Item[]>(`/sites/${siteId}/${kind}?page=${page}&pageSize=20${q ? `&q=${encodeURIComponent(q)}` : ''}`),
    placeholderData: keepPreviousData,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/sites/${siteId}/${kind}/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['site', siteId, kind] }),
    onError: (e) => toast(e.message, 'bad'),
  });
  const title = kind === 'services' ? t.services : t.products;
  const tone = { published: 'good', draft: 'neutral', archived: 'warn' } as const;

  return (
    <>
      <PageTitle
        title={title}
        actions={
          <>
            {kind === 'products' && <ProductExport siteId={siteId} />}
            <Button onClick={() => setEditing(blank(kind))}>{kind === 'services' ? t.newService : t.newProduct}</Button>
          </>
        }
      />
      <div className="mb-4 max-w-xs">
        <TextField label={t.search} value={q} onChange={(v) => { setQ(v); setPage(1); }} />
      </div>
      {list.isLoading ? (
        <Spinner />
      ) : (
        <>
          <ErrorNote error={list.error} />
          <Table head={kind === 'services' ? [t.image, t.title, t.status, t.actions] : [t.image, t.name, t.price, t.stock, t.status, t.actions]}>
            {list.data?.data.map((item) => (
              <tr key={item.id}>
                <Td>
                  <div className="size-12 overflow-hidden rounded bg-surface-2">{item.imageUrl && <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />}</div>
                </Td>
                <Td>
                  <span className="font-medium">{l('title' in item ? item.title : item.name)}</span>
                  <div className="text-xs text-ink-soft" dir="ltr">
                    {item.slug}
                  </div>
                </Td>
                {'priceMinor' in item && (
                  <>
                    <Td className="text-xs">{formatMoney(item.priceMinor, item.currency)}</Td>
                    <Td className="text-xs">{item.stock ?? '∞'}</Td>
                  </>
                )}
                <Td>
                  <Badge tone={tone[item.status]}>{t[item.status]}</Badge> {'featured' in item && item.featured && <Badge tone="accent">{t.featured}</Badge>}
                </Td>
                <Td>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(item)}>
                      {t.edit}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => window.confirm(t.confirmDelete) && remove.mutate(item.id)}>
                      {t.delete}
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} totalPages={list.data?.meta?.totalPages ?? 1} onChange={setPage} />
        </>
      )}
      <Editor siteId={siteId} kind={kind} item={editing} onClose={() => setEditing(null)} />
    </>
  );
}
