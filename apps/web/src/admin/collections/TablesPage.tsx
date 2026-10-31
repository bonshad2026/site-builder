import {
  BUILT_IN_FIELDS,
  COLLECTION_PRESETS,
  CURRENCIES,
  DEFAULT_REQUEST_TYPES,
  FIELD_TYPES,
  collectionInputSchema,
  type CollectionField,
  type CollectionInput,
  type FieldType,
} from '@site-builder/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import { useAdminSettings } from '../AdminRoot';
import { Badge, Checkbox, ErrorNote, ListEditor, LocalizedField, Modal, NumberField, PageTitle, SelectField, Spinner, Table, Td, TextField, useErrorLine, useToast } from '../ui';
import { useAdminCollections, type AdminCollection } from './api';

type Lbl = { en: string; fa: string };
const L = (en: string, fa: string): Lbl => ({ en, fa });
const empty = { en: '', fa: '' };

export const FIELD_TYPE_LABELS: Record<FieldType, Lbl> = {
  text: L('Short text', 'متن کوتاه'),
  textarea: L('Long text', 'متن بلند'),
  number: L('Number', 'عدد'),
  price: L('Price', 'قیمت'),
  date: L('Date', 'تاریخ'),
  datetime: L('Date and time', 'تاریخ و ساعت'),
  boolean: L('Yes / no', 'بله / خیر'),
  select: L('One choice', 'انتخاب تکی'),
  multiselect: L('Several choices', 'انتخاب چندتایی'),
  image: L('Image', 'تصویر'),
  gallery: L('Gallery', 'گالری'),
  link: L('Link', 'لینک'),
  email: L('Email', 'ایمیل'),
  phone: L('Phone', 'تلفن'),
  reference: L('Item of another table', 'آیتمی از جدول دیگر'),
};

const blankTable = (): CollectionInput => collectionInputSchema.parse({ slug: 'new-table', name: { en: '', fa: '' }, itemName: { en: '', fa: '' } });
const blankField = (): CollectionField => ({ key: '', label: { ...empty }, type: 'text', required: false, help: { ...empty }, options: [], reference: '', multiple: false });

function TableEditor({ siteId, table, onClose }: { siteId: string; table: (CollectionInput & { id?: string }) | null; onClose: () => void }) {
  const { locale, l } = usePreferences();
  const t = (x: Lbl) => x[locale];
  const qc = useQueryClient();
  const toast = useToast();
  const { data: tables = [] } = useAdminCollections(siteId);
  const { data: settings } = useAdminSettings(siteId);
  const { data: pages = [] } = useQuery({ queryKey: ['site', siteId, 'pages'], queryFn: () => api.get<{ slug: string; isHome: boolean; title: Lbl }[]>(`/sites/${siteId}/pages`) });
  const [draft, setDraft] = useState<CollectionInput & { id?: string }>(table ?? blankTable());
  const set = <K extends keyof CollectionInput>(key: K, value: CollectionInput[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setCommerce = (patch: Partial<CollectionInput['commerce']>) => setDraft((d) => ({ ...d, commerce: { ...d.commerce, ...patch } }));
  const isNew = !draft.id;
  /** Why a field's key cannot be saved (shown under the key), or undefined. */
  const keyError = (key: string, index: number) => {
    if (!key) return t(L('Required', 'لازم است'));
    if (!/^[a-z][a-z0-9_]*$/.test(key)) return t(L('English letters, numbers and _, starting with a letter', 'حروف انگلیسی، عدد و _ ؛ با حرف شروع شود'));
    if ((BUILT_IN_FIELDS as readonly string[]).includes(key)) return t(L('Every item already has a title and an address; use another key (e.g. subtitle)', 'هر آیتم خودش عنوان و آدرس دارد؛ کلید دیگری بگذارید (مثلاً subtitle)'));
    if (draft.fields.some((f, i) => i !== index && f.key === key)) return t(L('Another field uses this key', 'فیلد دیگری همین کلید را دارد'));
    return undefined;
  };
  const fieldChoices = (types: FieldType[]) => [{ value: '', label: '—' }, ...draft.fields.filter((f) => types.includes(f.type) && f.key).map((f) => ({ value: f.key, label: l(f.label) || f.key }))];

  const save = useMutation({
    mutationFn: () => {
      const { id, ...body } = draft;
      return isNew ? api.post(`/sites/${siteId}/collections`, body) : api.put(`/sites/${siteId}/collections/${id}`, body);
    },
    onSuccess: () => {
      toast(t(L('Saved', 'ذخیره شد')));
      qc.invalidateQueries({ queryKey: ['site', siteId, 'collections'] });
      qc.invalidateQueries({ queryKey: ['public'] });
      onClose();
    },
  });

  return (
    <Modal open onClose={onClose} title={isNew ? t(L('New table', 'جدول جدید')) : t(L('Edit table', 'ویرایش جدول'))} wide>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <LocalizedField label={t(L('Table name (e.g. Classes)', 'نام جدول (مثلاً کلاس‌ها)'))} value={draft.name} onChange={(name) => set('name', name)} />
          <LocalizedField label={t(L('One item (e.g. Class)', 'نام یک آیتم (مثلاً کلاس)'))} value={draft.itemName} onChange={(itemName) => set('itemName', itemName)} />
        </div>
        <p className="-mt-2 text-xs text-ink-soft">{t(L('Every item has a title and an address (slug) of its own; add only the other fields.', 'هر آیتم خودش عنوان و آدرس (slug) دارد؛ فقط فیلدهای دیگر را اضافه کنید.'))}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t(L('Address (slug)', 'آدرس (slug)'))}
            dir="ltr"
            value={draft.slug}
            onChange={(slug) => set('slug', slug.toLowerCase())}
            hint={isNew ? t(L('Item pages: /<slug>/<item>. Cannot be changed later.', 'صفحه‌ی آیتم‌ها: /<slug>/<item>. بعداً قابل تغییر نیست.')) : t(L('Cannot be changed.', 'قابل تغییر نیست.'))}
            disabled={!isNew}
          />
          <NumberField label={t(L('Order in the menu', 'ترتیب در منو'))} value={draft.position} min={0} onChange={(position) => set('position', position ?? 0)} />
        </div>

        <ListEditor
          label={t(L('Fields', 'فیلدها'))}
          items={draft.fields}
          max={40}
          onChange={(fields) => set('fields', fields)}
          create={blankField}
          render={(f, update, index) => (
            <div className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <TextField
                  label={t(L('Key', 'کلید'))}
                  dir="ltr"
                  value={f.key}
                  onChange={(key) => update({ ...f, key: key.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                  hint={`{{${f.key || 'key'}}}`}
                  error={keyError(f.key, index)}
                />
                <SelectField label={t(L('Type', 'نوع'))} value={f.type} onChange={(type) => update({ ...f, type })} options={FIELD_TYPES.map((x) => ({ value: x, label: t(FIELD_TYPE_LABELS[x]) }))} />
                <div className="pt-6">
                  <Checkbox label={t(L('Required', 'اجباری'))} checked={f.required} onChange={(required) => update({ ...f, required })} />
                </div>
              </div>
              <LocalizedField label={t(L('Name shown', 'نام نمایشی'))} value={f.label} onChange={(label) => update({ ...f, label })} />
              {(f.type === 'select' || f.type === 'multiselect') && (
                <ListEditor
                  label={t(L('Choices', 'گزینه‌ها'))}
                  items={f.options}
                  max={50}
                  onChange={(options) => update({ ...f, options })}
                  create={() => ({ value: '', label: { ...empty } })}
                  render={(o, upd) => (
                    <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
                      <TextField label={t(L('Value', 'مقدار'))} dir="ltr" value={o.value} onChange={(value) => upd({ ...o, value: value.toLowerCase() })} />
                      <LocalizedField label={t(L('Label', 'عنوان'))} value={o.label} onChange={(label) => upd({ ...o, label })} />
                    </div>
                  )}
                />
              )}
              {f.type === 'reference' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField
                    label={t(L('Table it points to', 'جدول مرجع'))}
                    value={f.reference}
                    onChange={(reference) => update({ ...f, reference })}
                    options={[{ value: '', label: '—' }, ...tables.filter((x) => x.slug !== draft.slug).map((x) => ({ value: x.slug, label: l(x.name) || x.slug })), ...(f.reference && !tables.some((x) => x.slug === f.reference) ? [{ value: f.reference, label: f.reference }] : [])]}
                  />
                  <div className="pt-6">
                    <Checkbox label={t(L('More than one item', 'چند آیتم'))} checked={f.multiple} onChange={(multiple) => update({ ...f, multiple })} />
                  </div>
                </div>
              )}
            </div>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label={t(L('Main image', 'تصویر اصلی'))} value={draft.imageField} onChange={(imageField) => set('imageField', imageField)} options={fieldChoices(['image', 'gallery'])} />
          <SelectField
            label={t(L('Template page of each item', 'صفحه‌ی قالب هر آیتم'))}
            value={draft.detailPage}
            onChange={(detailPage) => set('detailPage', detailPage)}
            options={[{ value: '', label: t(L('Built-in simple page', 'صفحه‌ی ساده‌ی پیش‌فرض')) }, ...pages.filter((p) => !p.isHome).map((p) => ({ value: p.slug, label: `${l(p.title) || p.slug} (/${p.slug})` }))]}
          />
          <SelectField
            label={t(L('Default request type', 'نوع درخواست پیش‌فرض'))}
            value={draft.requestType}
            onChange={(requestType) => set('requestType', requestType)}
            options={[{ value: '', label: '—' }, ...(settings?.requestTypes ?? DEFAULT_REQUEST_TYPES).map((x) => ({ value: x.slug, label: l(x.label) || x.slug }))]}
          />
        </div>
        <p className="-mt-2 text-xs text-ink-soft">
          {t(L('The template page is built in the page builder: {{key}} texts, the “Item display” section and related lists show the item of each page.', 'صفحه‌ی قالب در صفحه‌ساز ساخته می‌شود: متن‌های {{key}}، بخش «نمایش آیتم» و لیست‌های مرتبط، آیتم هر صفحه را نشان می‌دهند.'))}
        </p>

        <fieldset className="flex flex-col gap-3 rounded-md border border-line p-4">
          <legend className="px-1 text-sm font-medium">{t(L('Selling and booking', 'فروش و ثبت‌نام'))}</legend>
          <Checkbox label={t(L('Items can be added to the cart and paid for online', 'آیتم‌ها به سبد خرید اضافه و آنلاین پرداخت شوند'))} checked={draft.commerce.enabled} onChange={(enabled) => setCommerce({ enabled })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label={t(L('Price field', 'فیلد قیمت'))} value={draft.commerce.priceField} onChange={(priceField) => setCommerce({ priceField })} options={fieldChoices(['price', 'number'])} />
            <SelectField label={t(L('Discount % field', 'فیلد درصد تخفیف'))} value={draft.commerce.discountField} onChange={(discountField) => setCommerce({ discountField })} options={fieldChoices(['number'])} />
            <SelectField label={t(L('Seats field (capacity)', 'فیلد ظرفیت'))} value={draft.commerce.capacityField} onChange={(capacityField) => setCommerce({ capacityField })} options={fieldChoices(['number'])} />
            <SelectField label={t(L('Deadline field', 'فیلد مهلت ثبت‌نام'))} value={draft.commerce.deadlineField} onChange={(deadlineField) => setCommerce({ deadlineField })} options={fieldChoices(['date', 'datetime'])} />
            <SelectField label={t(L('Currency', 'واحد پول'))} value={draft.commerce.currency} onChange={(currency) => setCommerce({ currency })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            <NumberField label={t(L('Most seats in one order', 'حداکثر تعداد در هر سفارش'))} value={draft.commerce.maxPerOrder} min={1} onChange={(v) => setCommerce({ maxPerOrder: Math.max(1, Math.min(999, v ?? 1)) })} />
          </div>
          <Checkbox label={t(L('Requests also take a seat', 'درخواست‌ها هم ظرفیت را پر کنند'))} checked={draft.commerce.requestsTakeSeat} onChange={(requestsTakeSeat) => setCommerce({ requestsTakeSeat })} />
          <p className="text-xs text-ink-soft">{t(L('Seats are taken by orders that are not cancelled. When the seats run out or the deadline passes, the buttons are switched off.', 'ظرفیت با سفارش‌های لغونشده پر می‌شود. با پر شدن ظرفیت یا گذشتن مهلت، دکمه‌ها غیرفعال می‌شوند.'))}</p>
        </fieldset>

        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            {t(L('Cancel', 'انصراف'))}
          </Button>
          <Button type="submit" disabled={save.isPending || draft.fields.some((f, i) => !!keyError(f.key, i))}>
            {t(L('Save', 'ذخیره'))}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Operator page: the site's content tables, their fields and how they sell. */
export default function TablesPage({ siteId }: { siteId: string }) {
  const { locale, l } = usePreferences();
  const t = (x: Lbl) => x[locale];
  const qc = useQueryClient();
  const toast = useToast();
  const errorText = useErrorLine();
  const { data: tables, isLoading, error } = useAdminCollections(siteId);
  const [editing, setEditing] = useState<(CollectionInput & { id?: string }) | null>(null);
  const [preset, setPreset] = useState('');
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/sites/${siteId}/collections/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['site', siteId, 'collections'] });
      qc.invalidateQueries({ queryKey: ['public'] });
    },
    onError: (e) => toast(errorText(e), 'bad'),
  });
  const edit = (x: AdminCollection) => {
    const { itemCount: _n, ...rest } = x;
    setEditing(rest);
  };

  return (
    <>
      <PageTitle
        title={t(L('Content tables', 'جدول‌های محتوا'))}
        subtitle={t(L('Courses, classes, news… each site has its own. The owner adds the items.', 'دوره‌ها، کلاس‌ها، اخبار… هر سایت جدول‌های خودش را دارد. آیتم‌ها را صاحب سایت اضافه می‌کند.'))}
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <SelectField
              label={t(L('Start from', 'شروع از'))}
              value={preset}
              onChange={setPreset}
              options={[{ value: '', label: t(L('Empty table', 'جدول خالی')) }, ...COLLECTION_PRESETS.map((p) => ({ value: p.id, label: t(p.label) }))]}
            />
            <Button
              onClick={() => {
                const p = COLLECTION_PRESETS.find((x) => x.id === preset);
                setEditing(p ? collectionInputSchema.parse(p.collection) : blankTable());
              }}
            >
              {t(L('New table', 'جدول جدید'))}
            </Button>
          </div>
        }
      />
      {isLoading ? (
        <Spinner />
      ) : (
        <>
          <ErrorNote error={error} />
          <Table head={[t(L('Table', 'جدول')), t(L('Fields', 'فیلدها')), t(L('Items', 'آیتم‌ها')), t(L('Page', 'صفحه')), '']}>
            {(tables ?? []).map((x) => (
              <tr key={x.id}>
                <Td>
                  <span className="font-medium">{l(x.name) || x.slug}</span>
                  <div className="text-xs text-ink-soft" dir="ltr">
                    /{x.slug}
                  </div>
                </Td>
                <Td className="text-xs">{x.fields.length}</Td>
                <Td>
                  <Link to={`/admin/sites/${siteId}/items/${x.id}`} className="underline underline-offset-4">
                    {x.itemCount}
                  </Link>{' '}
                  {x.commerce.enabled && <Badge tone="accent">{t(L('Sells', 'فروش'))}</Badge>}
                </Td>
                <Td className="text-xs">
                  <span dir="ltr">{x.detailPage ? `/${x.detailPage}` : '—'}</span>
                </Td>
                <Td>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => edit(x)}>
                      {t(L('Edit', 'ویرایش'))}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.confirm(t(L('Delete this table and all its items?', 'این جدول و همه‌ی آیتم‌هایش حذف شوند؟'))) && remove.mutate(x.id)}
                    >
                      {t(L('Delete', 'حذف'))}
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
          {!tables?.length && <p className="mt-6 text-sm text-ink-soft">{t(L('No tables yet. Start from a ready-made one or an empty table.', 'هنوز جدولی نیست. از یک جدول آماده یا خالی شروع کنید.'))}</p>}
        </>
      )}
      {editing && <TableEditor key={editing.id ?? 'new'} siteId={siteId} table={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
