import { currencyDecimals, type Collection, type CollectionField } from '@site-builder/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import { LinkPicker } from '../links';
import { ImagePicker } from '../pages/FilesPage';
import { DatePickerButton } from '../../components/ui/Calendar';
import { Badge, Checkbox, ErrorNote, Field, useAdminCalendar, useErrorLanguage, LocalizedField, Modal, NumberField, PageTitle, Pagination, SelectField, Spinner, Table, Td, TextField, useErrorLine, useToast } from '../ui';
import { useAdminCollections, useAdminItems, type AdminItem } from './api';

type Lbl = { en: string; fa: string };
const L = (en: string, fa: string): Lbl => ({ en, fa });

interface Draft {
  id?: string;
  slug: string;
  title: Lbl;
  data: Record<string, unknown>;
  status: 'draft' | 'published';
  position: number;
}

/** A readable address from a title: lowercase words joined by hyphens (Persian letters kept). */
const slugify = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' && v ? [v] : []);

/** Items of another table as choices for a reference field. */
function ReferenceInput({ siteId, field, value, onChange }: { siteId: string; field: CollectionField; value: string[]; onChange: (v: string[]) => void }) {
  const { l } = usePreferences();
  const { data: tables = [] } = useAdminCollections(siteId);
  const target = tables.find((t) => t.slug === field.reference);
  const { data } = useAdminItems(siteId, target?.id ?? '');
  const items = data?.data ?? [];
  const label = l(field.label) || field.key;
  if (!field.multiple)
    return <SelectField label={label} value={value[0] ?? ''} onChange={(v) => onChange(v ? [v] : [])} options={[{ value: '', label: '—' }, ...items.map((i) => ({ value: i.id, label: l(i.title) || i.slug }))]} />;
  return (
    <fieldset className="flex flex-col gap-1 rounded-md border border-line p-3">
      <legend className="px-1 text-xs font-medium text-ink-soft">{label}</legend>
      {items.map((i) => (
        <Checkbox key={i.id} label={l(i.title) || i.slug} checked={value.includes(i.id)} onChange={(on) => onChange(on ? [...value, i.id] : value.filter((x) => x !== i.id))} />
      ))}
      {!items.length && <p className="text-xs text-ink-soft">—</p>}
    </fieldset>
  );
}

/** The input for one field, by its type. Images keep their asset id; `urls` shows their previews. */
function FieldInput({
  siteId,
  table,
  field,
  value,
  onChange,
  urls,
  onUrl,
}: {
  siteId: string;
  table: Collection;
  field: CollectionField;
  value: unknown;
  onChange: (v: unknown) => void;
  urls: Record<string, string>;
  onUrl: (id: string, url: string) => void;
}) {
  const { l, locale } = usePreferences();
  const cal = useAdminCalendar();
  const label = `${l(field.label) || field.key}${field.required ? ' *' : ''}`;
  switch (field.type) {
    case 'text':
    case 'textarea':
      return <LocalizedField label={label} value={(value as Lbl) ?? { en: '', fa: '' }} onChange={onChange} multiline={field.type === 'textarea'} rows={field.type === 'textarea' ? 4 : undefined} />;
    case 'number':
      return <NumberField label={label} value={typeof value === 'number' ? value : null} onChange={(v) => onChange(v)} />;
    case 'price': {
      const currency = table.commerce.currency;
      const d = currencyDecimals(currency);
      return <NumberField label={`${label} (${currency})`} value={typeof value === 'number' ? value / 10 ** d : null} min={0} onChange={(v) => onChange(v === null ? null : Math.round(v * 10 ** d))} />;
    }
    case 'date':
      return (
        <Field label={label}>
          {() => <DatePickerButton cal={cal} locale={locale} value={(value as string) ?? ''} onChange={(v) => onChange(v || null)} placeholder="—" />}
        </Field>
      );
    case 'datetime': {
      // A day in the site's calendar plus a time; stored as YYYY-MM-DDTHH:MM.
      const v = (value as string) ?? '';
      const day = v.slice(0, 10);
      const time = v.slice(11, 16) || '09:00';
      return (
        <Field label={label}>
          {(id) => (
            <span className="flex flex-wrap items-center gap-2">
              <DatePickerButton cal={cal} locale={locale} value={day} onChange={(d) => onChange(d ? `${d}T${time}` : null)} placeholder="—" />
              <input id={id} type="time" dir="ltr" value={day ? time : ''} disabled={!day} onChange={(e) => onChange(`${day}T${e.target.value || '00:00'}`)} className="rounded-md border border-line bg-bg px-3 py-2 text-sm" />
            </span>
          )}
        </Field>
      );
    }
    case 'boolean':
      return <Checkbox label={label} checked={!!value} onChange={onChange} />;
    case 'select':
      return <SelectField label={label} value={(value as string) ?? ''} onChange={(v) => onChange(v || null)} options={[{ value: '', label: '—' }, ...field.options.map((o) => ({ value: o.value, label: l(o.label) || o.value }))]} />;
    case 'multiselect': {
      const list = asList(value);
      return (
        <fieldset className="flex flex-col gap-1 rounded-md border border-line p-3">
          <legend className="px-1 text-xs font-medium text-ink-soft">{label}</legend>
          {field.options.map((o) => (
            <Checkbox key={o.value} label={l(o.label) || o.value} checked={list.includes(o.value)} onChange={(on) => onChange(on ? [...list, o.value] : list.filter((x) => x !== o.value))} />
          ))}
        </fieldset>
      );
    }
    case 'image': {
      const id = typeof value === 'string' ? value : '';
      return (
        <ImagePicker
          siteId={siteId}
          label={label}
          value={id ? (urls[id] ?? '') : ''}
          onChange={(url, asset) => {
            if (asset) onUrl(asset.id, url);
            onChange(asset?.id ?? null);
          }}
        />
      );
    }
    case 'gallery': {
      const ids = asList(value);
      return (
        <fieldset className="flex flex-col gap-3 rounded-md border border-line p-3">
          <legend className="px-1 text-xs font-medium text-ink-soft">{label}</legend>
          <div className="flex flex-wrap gap-2">
            {ids.map((id) => (
              <div key={id} className="relative size-20 overflow-hidden rounded bg-surface-2">
                {urls[id] && <img src={urls[id]} alt="" className="h-full w-full object-cover" />}
                <button type="button" aria-label="✕" onClick={() => onChange(ids.filter((x) => x !== id))} className="absolute end-1 top-1 rounded-full bg-bg/90 px-1.5 text-xs">
                  ✕
                </button>
              </div>
            ))}
          </div>
          <ImagePicker
            siteId={siteId}
            label="+"
            value=""
            onChange={(url, asset) => {
              if (!asset) return;
              onUrl(asset.id, url);
              onChange([...ids, asset.id]);
            }}
          />
        </fieldset>
      );
    }
    case 'link':
      return <LinkPicker siteId={siteId} label={label} value={(value as string) ?? ''} onChange={(v) => onChange(v || null)} />;
    case 'email':
    case 'phone':
      return <TextField label={label} dir="ltr" type={field.type === 'email' ? 'email' : 'tel'} value={(value as string) ?? ''} onChange={(v) => onChange(v || null)} />;
    case 'reference':
      return <ReferenceInput siteId={siteId} field={field} value={asList(value)} onChange={onChange} />;
  }
}

/** Image URLs of an item's saved images (from the list's preview values). */
function knownUrls(item: AdminItem | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of Object.values(item?.previewData ?? {})) {
    for (const x of Array.isArray(v) ? v : [v]) {
      const img = x as { id?: string; url?: string } | null;
      if (img && typeof img === 'object' && img.id && img.url) out[img.id] = img.url;
    }
  }
  return out;
}

function ItemEditor({ siteId, table, item, onClose }: { siteId: string; table: Collection; item: AdminItem | null; onClose: () => void }) {
  const { locale, l } = usePreferences();
  const t = (x: Lbl) => x[locale];
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() =>
    item ? { id: item.id, slug: item.slug, title: item.title, data: item.data, status: item.status, position: item.position } : { slug: '', title: { en: '', fa: '' }, data: {}, status: 'published', position: 0 },
  );
  const [urls, setUrls] = useState<Record<string, string>>(() => knownUrls(item ?? undefined));
  const [slugTouched, setSlugTouched] = useState(!!item);
  const errorLang = useErrorLanguage();
  const setValue = (key: string, v: unknown) => setDraft((d) => ({ ...d, data: { ...d.data, [key]: v } }));

  const save = useMutation({
    mutationFn: () => {
      const { id, ...body } = draft;
      const slug = body.slug || slugify(body.title.en || body.title.fa) || `item-${Date.now().toString(36)}`;
      return id ? api.put(`/sites/${siteId}/collections/${table.id}/items/${id}`, { ...body, slug }) : api.post(`/sites/${siteId}/collections/${table.id}/items`, { ...body, slug });
    },
    onSuccess: () => {
      toast(t(L('Saved', 'ذخیره شد')));
      qc.invalidateQueries({ queryKey: ['site', siteId, 'collections'] });
      qc.invalidateQueries({ queryKey: ['public'] });
      onClose();
    },
  });

  return (
    <Modal open onClose={onClose} title={`${draft.id ? t(L('Edit', 'ویرایش')) : t(L('New', 'جدید'))}: ${l(table.itemName) || l(table.name)}`} wide>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <LocalizedField
          label={`${t(L('Title', 'عنوان'))} *`}
          value={draft.title}
          onChange={(title) => setDraft((d) => ({ ...d, title, slug: slugTouched ? d.slug : slugify(title.en || title.fa) }))}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label={t(L('Address (slug)', 'آدرس (slug)'))}
            dir="ltr"
            value={draft.slug}
            onChange={(slug) => {
              setSlugTouched(true);
              setDraft((d) => ({ ...d, slug: slug.toLowerCase() }));
            }}
            hint={`/${table.slug}/${draft.slug || '…'}`}
          />
          <SelectField
            label={t(L('Status', 'وضعیت'))}
            value={draft.status}
            onChange={(status) => setDraft((d) => ({ ...d, status }))}
            options={[
              { value: 'draft', label: t(L('Draft', 'پیش‌نویس')) },
              { value: 'published', label: t(L('Published', 'منتشرشده')) },
            ]}
          />
          <NumberField label={t(L('Order', 'ترتیب'))} value={draft.position} min={0} onChange={(position) => setDraft((d) => ({ ...d, position: position ?? 0 }))} />
        </div>
        {table.fields.map((f) => (
          <FieldInput key={f.key} siteId={siteId} table={table} field={f} value={draft.data[f.key]} onChange={(v) => setValue(f.key, v)} urls={urls} onUrl={(id, url) => setUrls((u) => ({ ...u, [id]: url }))} />
        ))}
        <ErrorNote error={save.error} labels={Object.fromEntries(table.fields.map((f) => [`data.${f.key}`, f.label[errorLang] || l(f.label) || f.key]))} />
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            {t(L('Cancel', 'انصراف'))}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {t(L('Save', 'ذخیره'))}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Items of one table (the owner's content): list, add, edit, delete. */
export default function ItemsPage({ siteId }: { siteId: string }) {
  const { collectionId = '' } = useParams();
  const { locale, l, formatMoney, formatNumber } = usePreferences();
  const t = (x: Lbl) => x[locale];
  const qc = useQueryClient();
  const toast = useToast();
  const errorText = useErrorLine();
  const { data: tables, isLoading: loadingTables } = useAdminCollections(siteId);
  const table = tables?.find((x) => x.id === collectionId);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const list = useAdminItems(siteId, collectionId, q, page);
  const [editing, setEditing] = useState<AdminItem | 'new' | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/sites/${siteId}/collections/${collectionId}/items/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['site', siteId, 'collections'] });
      qc.invalidateQueries({ queryKey: ['public'] });
    },
    onError: (e) => toast(errorText(e), 'bad'),
  });

  if (loadingTables) return <Spinner />;
  if (!table) return <p className="text-ink-soft">{t(L('Table not found.', 'جدول پیدا نشد.'))}</p>;
  const books = table.commerce.enabled || !!table.commerce.capacityField;

  return (
    <>
      <PageTitle title={l(table.name) || table.slug} actions={<Button onClick={() => setEditing('new')}>{`${t(L('New', 'جدید'))} ${l(table.itemName)}`}</Button>} />
      <div className="mb-4 max-w-xs">
        <TextField
          label={t(L('Search', 'جستجو'))}
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
        />
      </div>
      {list.isLoading ? (
        <Spinner />
      ) : (
        <>
          <ErrorNote error={list.error} />
          <Table head={[t(L('Image', 'تصویر')), t(L('Title', 'عنوان')), ...(books ? [t(L('Price / seats', 'قیمت / ظرفیت'))] : []), t(L('Status', 'وضعیت')), '']}>
            {(list.data?.data ?? []).map((item) => (
              <tr key={item.id}>
                <Td>
                  <div className="size-12 overflow-hidden rounded bg-surface-2">{item.imageUrl && <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />}</div>
                </Td>
                <Td>
                  <span className="font-medium">{l(item.title) || item.slug}</span>
                  <div className="text-xs text-ink-soft" dir="ltr">
                    /{table.slug}/{item.slug}
                  </div>
                </Td>
                {books && (
                  <Td className="text-xs">
                    {item.availability?.finalPriceMinor !== null && item.availability?.finalPriceMinor !== undefined && formatMoney(item.availability.finalPriceMinor, item.availability.currency)}
                    {item.availability?.capacity !== null && item.availability?.capacity !== undefined && (
                      <div>
                        {formatNumber(item.availability.remaining ?? 0)} / {formatNumber(item.availability.capacity)}
                      </div>
                    )}
                    {item.availability?.reason === 'deadline' && <Badge tone="warn">{t(L('Closed', 'بسته'))}</Badge>}
                  </Td>
                )}
                <Td>
                  <Badge tone={item.status === 'published' ? 'good' : 'neutral'}>{item.status === 'published' ? t(L('Published', 'منتشرشده')) : t(L('Draft', 'پیش‌نویس'))}</Badge>
                </Td>
                <Td>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(item)}>
                      {t(L('Edit', 'ویرایش'))}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => window.confirm(t(L('Delete this item?', 'این آیتم حذف شود؟'))) && remove.mutate(item.id)}>
                      {t(L('Delete', 'حذف'))}
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} totalPages={Number(list.data?.meta?.totalPages ?? 1)} onChange={setPage} />
        </>
      )}
      {editing && <ItemEditor key={editing === 'new' ? 'new' : editing.id} siteId={siteId} table={table} item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
