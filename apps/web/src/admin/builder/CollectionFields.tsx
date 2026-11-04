import { AVAILABLE_FILTER, FILTER_OPS, type CollectionField, type CollectionFilter, type FilterOp, type VisitorFilter, type VisitorFilterDisplay } from '@site-builder/shared';
import { usePreferences } from '../../lib/preferences';
import { useAdminItems, useListSources } from '../collections/api';
import { DatePickerButton } from '../../components/ui/Calendar';
import { Field, ListEditor, LocalizedField, NumberField, SelectField, TextField, useAdminCalendar } from '../ui';

type Lbl = { en: string; fa: string };
const L = (en: string, fa: string): Lbl => ({ en, fa });

const OP_LABELS: Record<FilterOp, Lbl> = {
  eq: L('is', 'برابر است با'),
  neq: L('is not', 'برابر نیست با'),
  contains: L('contains', 'شامل'),
  gt: L('greater than', 'بیشتر از'),
  gte: L('at least', 'حداقل'),
  lt: L('less than', 'کمتر از'),
  lte: L('at most', 'حداکثر'),
  set: L('has a value', 'مقدار دارد'),
  notset: L('is empty', 'خالی است'),
  future: L('is today or later', 'امروز یا بعد از آن'),
  past: L('is before today', 'قبل از امروز'),
  in: L('is one of', 'یکی از این‌ها باشد'),
};

/** Operators that make sense for a field type. */
function opsFor(field: CollectionField | undefined, key: string): FilterOp[] {
  if (key === AVAILABLE_FILTER) return ['eq'];
  if (key === 'id') return ['eq', 'neq'];
  if (key === 'title') return ['eq', 'neq', 'contains'];
  switch (field?.type) {
    case 'number':
    case 'price':
      return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'set', 'notset'];
    case 'date':
    case 'datetime':
      return ['future', 'past', 'eq', 'gt', 'gte', 'lt', 'lte', 'set', 'notset'];
    case 'boolean':
      return ['eq', 'neq'];
    case 'select':
    case 'multiselect':
    case 'reference':
      return ['eq', 'neq', 'in', 'set', 'notset'];
    default:
      return FILTER_OPS.filter((o) => o !== 'future' && o !== 'past' && o !== 'gt' && o !== 'gte' && o !== 'lt' && o !== 'lte');
  }
}

export function SourceField({ siteId, label, value, onChange }: { siteId: string; label: string; value: string; onChange: (v: string) => void }) {
  const { l, locale } = usePreferences();
  const { data: sources } = useListSources(siteId);
  return (
    <SelectField
      label={label}
      value={value}
      onChange={onChange}
      options={[{ value: '', label: locale === 'fa' ? 'انتخاب جدول…' : 'Choose a table…' }, ...sources.map((s) => ({ value: s.slug, label: l(s.name) || s.slug }))]}
    />
  );
}

/** Items of a table as choices (reference filters, a chosen item). */
function ItemSelect({ siteId, collection, label, value, onChange, by = 'id', emptyLabel }: { siteId: string; collection: string; label: string; value: string; onChange: (v: string) => void; by?: 'id' | 'slug'; emptyLabel: string }) {
  const { l } = usePreferences();
  const { tables } = useListSources(siteId);
  const table = tables.find((t) => t.slug === collection);
  const { data } = useAdminItems(siteId, table?.id ?? '');
  const items = data?.data ?? [];
  return (
    <SelectField
      label={label}
      value={value}
      onChange={onChange}
      options={[{ value: '', label: emptyLabel }, ...items.map((i) => ({ value: by === 'id' ? i.id : i.slug, label: l(i.title) || i.slug })), ...(value && !items.some((i) => (by === 'id' ? i.id : i.slug) === value) ? [{ value, label: value }] : [])]}
    />
  );
}

export function FiltersField({ siteId, source, label, value, onChange }: { siteId: string; source: string; label: string; value: CollectionFilter[]; onChange: (v: CollectionFilter[]) => void }) {
  const { l, locale } = usePreferences();
  const cal = useAdminCalendar();
  const t = (x: Lbl) => x[locale];
  const { data: sources } = useListSources(siteId);
  const fields = sources.find((s) => s.slug === source)?.fields ?? [];
  if (!source) return null;
  const fieldChoices = [
    { value: 'title', label: t(L('Title', 'عنوان')) },
    { value: 'id', label: t(L('The item itself', 'خود آیتم')) },
    { value: AVAILABLE_FILTER, label: t(L('Available (open and not full)', 'در دسترس (مهلت دارد و ظرفیت پر نیست)')) },
    ...fields.filter((f) => f.type !== 'image' && f.type !== 'gallery').map((f) => ({ value: f.key, label: l(f.label) || f.key })),
  ];
  return (
    <div className="flex flex-col gap-2">
      <ListEditor
        label={label}
        items={value}
        max={10}
        onChange={onChange}
        create={(): CollectionFilter => ({ field: 'title', op: 'contains', value: '', valueFrom: 'static' })}
        render={(f, update) => {
          const field = fields.find((x) => x.key === f.field);
          const ops = opsFor(field, f.field);
          const needsValue = f.field !== AVAILABLE_FILTER && !['set', 'notset', 'future', 'past'].includes(f.op);
          return (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <SelectField
                  label={t(L('Field', 'فیلد'))}
                  value={f.field}
                  onChange={(key) => update({ ...f, field: key, op: opsFor(fields.find((x) => x.key === key), key)[0], value: key === AVAILABLE_FILTER ? 'true' : '' })}
                  options={fieldChoices}
                />
                <SelectField label={t(L('Condition', 'شرط'))} value={f.op} onChange={(op) => update({ ...f, op })} options={ops.map((o) => ({ value: o, label: t(OP_LABELS[o]) }))} />
              </div>
              {needsValue && (
                <>
                  <SelectField
                    label={t(L('Compare with', 'مقایسه با'))}
                    value={f.valueFrom}
                    onChange={(valueFrom) => update({ ...f, valueFrom })}
                    options={[
                      { value: 'static', label: t(L('A value', 'یک مقدار')) },
                      { value: 'current', label: t(L('The item of this page (template pages)', 'آیتم همین صفحه (صفحه‌ی قالب)')) },
                    ]}
                  />
                  {f.valueFrom === 'static' &&
                    (f.op === 'in' ? (
                      <TextField label={t(L('Values (comma separated)', 'مقدارها (با ویرگول جدا)'))} dir="ltr" value={f.value} onChange={(v) => update({ ...f, value: v })} hint={field?.type === 'reference' ? t(L('Item ids', 'شناسه‌ی آیتم‌ها')) : field?.options.map((o) => o.value).join(', ')} />
                    ) : field?.type === 'select' || field?.type === 'multiselect' ? (
                      <SelectField label={t(L('Value', 'مقدار'))} value={f.value} onChange={(v) => update({ ...f, value: v })} options={[{ value: '', label: '—' }, ...field.options.map((o) => ({ value: o.value, label: l(o.label) || o.value }))]} />
                    ) : field?.type === 'boolean' ? (
                      <SelectField
                        label={t(L('Value', 'مقدار'))}
                        value={f.value || 'true'}
                        onChange={(v) => update({ ...f, value: v })}
                        options={[
                          { value: 'true', label: t(L('Yes', 'بله')) },
                          { value: 'false', label: t(L('No', 'خیر')) },
                        ]}
                      />
                    ) : field?.type === 'reference' ? (
                      <ItemSelect siteId={siteId} collection={field.reference} label={t(L('Item', 'آیتم'))} value={f.value} onChange={(v) => update({ ...f, value: v })} emptyLabel="—" />
                    ) : f.field === 'id' ? (
                      <ItemSelect siteId={siteId} collection={source} label={t(L('Item', 'آیتم'))} value={f.value} onChange={(v) => update({ ...f, value: v })} emptyLabel="—" />
                    ) : field?.type === 'date' || field?.type === 'datetime' ? (
                      <Field label={t(L('Value', 'مقدار'))}>{() => <DatePickerButton cal={cal} locale={locale} value={f.value.slice(0, 10)} onChange={(v) => update({ ...f, value: v })} placeholder="—" />}</Field>
                    ) : (
                      <TextField
                        label={t(L('Value', 'مقدار'))}
                        value={f.value}
                        onChange={(v) => update({ ...f, value: v })}
                        dir={field?.type === 'number' || field?.type === 'price' ? 'ltr' : undefined}
                        hint={field?.type === 'price' ? t(L('In the smallest unit (e.g. rials)', 'به کوچک‌ترین واحد (مثلاً ریال)')) : undefined}
                      />
                    ))}
                </>
              )}
            </div>
          );
        }}
      />
      <p className="text-xs text-ink-soft">{t(L('All conditions must hold. “The item of this page” on a table’s template page shows related items, e.g. the classes of this course.', 'همه‌ی شرط‌ها باید برقرار باشند. «آیتم همین صفحه» در صفحه‌ی قالب یک جدول، آیتم‌های مرتبط را نشان می‌دهد؛ مثلاً کلاس‌های همین دوره.'))}</p>
    </div>
  );
}

export function SortField({ siteId, source, label, sort, dir, onChange }: { siteId: string; source: string; label: string; sort: string; dir: 'asc' | 'desc'; onChange: (v: { sort: string; dir: 'asc' | 'desc' }) => void }) {
  const { l, locale } = usePreferences();
  const t = (x: Lbl) => x[locale];
  const { data: sources } = useListSources(siteId);
  const fields = sources.find((s) => s.slug === source)?.fields ?? [];
  return (
    <div className="grid grid-cols-2 gap-2">
      <SelectField
        label={label}
        value={sort}
        onChange={(v) => onChange({ sort: v, dir })}
        options={[
          { value: 'position', label: t(L('Order in the admin', 'ترتیب در پنل')) },
          { value: 'newest', label: t(L('Newest first', 'جدیدترین')) },
          { value: 'title', label: t(L('Title', 'عنوان')) },
          ...fields.filter((f) => ['number', 'price', 'date', 'datetime', 'text', 'select'].includes(f.type)).map((f) => ({ value: f.key, label: l(f.label) || f.key })),
        ]}
      />
      <SelectField
        label={t(L('Direction', 'جهت'))}
        value={dir}
        onChange={(d) => onChange({ sort, dir: d })}
        options={[
          { value: 'asc', label: t(L('Ascending', 'صعودی')) },
          { value: 'desc', label: t(L('Descending', 'نزولی')) },
        ]}
      />
    </div>
  );
}

const DISPLAY_LABELS: Record<VisitorFilterDisplay, Lbl> = {
  chips: L('Buttons (one choice)', 'دکمه‌ها (یک انتخاب)'),
  select: L('Drop-down', 'منوی کشویی'),
  checkboxes: L('Checkboxes (several)', 'چندانتخابی (چک‌باکس)'),
  search: L('Search box', 'جستجو'),
  range: L('From – to', 'از … تا …'),
  slider: L('Slider (two handles)', 'اسلایدر (بازه)'),
  presets: L('Preset ranges', 'بازه‌های آماده'),
  calendar: L('Calendar (pick a day or a range)', 'تقویم (انتخاب روز یا بازه)'),
  dateRange: L('Date from – to', 'از تاریخ … تا تاریخ …'),
  datePresets: L('Date presets (upcoming, this month…)', 'بازه‌های آماده‌ی تاریخ (پیش رو، این ماه…)'),
  toggle: L('Switch: only…', 'سوئیچ: فقط…'),
};

/** Ways to show a filter that suit the field. */
function displaysFor(field: CollectionField | undefined, key: string): VisitorFilterDisplay[] {
  if (key === AVAILABLE_FILTER) return ['toggle'];
  if (key === 'title') return ['search'];
  switch (field?.type) {
    case 'select':
    case 'multiselect':
    case 'reference':
      return ['chips', 'select', 'checkboxes'];
    case 'boolean':
      return ['toggle', 'chips', 'select'];
    case 'number':
    case 'price':
      return ['slider', 'range', 'presets'];
    case 'date':
    case 'datetime':
      return ['calendar', 'datePresets', 'dateRange'];
    default:
      return ['search'];
  }
}

const blankVisitorFilter = (field: string, display: VisitorFilterDisplay): VisitorFilter => ({ field, display, label: { en: '', fa: '' }, presets: [], calendarMode: 'inline', min: null, max: null, step: null });

export function VisitorFiltersField({ siteId, source, label, value, onChange }: { siteId: string; source: string; label: string; value: VisitorFilter[]; onChange: (v: VisitorFilter[]) => void }) {
  const { l, locale } = usePreferences();
  const t = (x: Lbl) => x[locale];
  const { data: sources } = useListSources(siteId);
  const fields = (sources.find((s) => s.slug === source)?.fields ?? []).filter((f) => !['image', 'gallery', 'link'].includes(f.type));
  if (!source) return null;
  const fieldChoices = [
    { value: 'title', label: t(L('Title (search)', 'عنوان (جستجو)')) },
    { value: AVAILABLE_FILTER, label: t(L('Available (open and not full)', 'در دسترس (مهلت دارد و ظرفیت پر نیست)')) },
    ...fields.map((f) => ({ value: f.key, label: l(f.label) || f.key })),
  ];
  return (
    <div className="flex flex-col gap-2">
      <ListEditor
        label={label}
        items={value}
        max={10}
        onChange={onChange}
        create={(): VisitorFilter => blankVisitorFilter(fields[0]?.key ?? 'title', displaysFor(fields[0], fields[0]?.key ?? 'title')[0])}
        render={(f, update) => {
          const field = fields.find((x) => x.key === f.field);
          const displays = displaysFor(field, f.field);
          const isPrice = field?.type === 'price';
          return (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <SelectField
                  label={t(L('Field', 'فیلد'))}
                  value={f.field}
                  onChange={(key) => update({ ...blankVisitorFilter(key, displaysFor(fields.find((x) => x.key === key), key)[0]), label: f.label })}
                  options={fieldChoices}
                />
                <SelectField
                  label={t(L('Shown as', 'نحوه‌ی نمایش'))}
                  value={displays.includes(f.display) ? f.display : displays[0]}
                  onChange={(display) => update({ ...f, display })}
                  options={displays.map((d) => ({ value: d, label: t(DISPLAY_LABELS[d]) }))}
                />
              </div>
              <LocalizedField label={t(L('Label (empty = field name)', 'عنوان (خالی = نام فیلد)'))} value={f.label} onChange={(x) => update({ ...f, label: x })} />
              {f.display === 'calendar' && (
                <SelectField
                  label={t(L('Calendar is shown', 'نحوه‌ی نمایش تقویم'))}
                  value={f.calendarMode ?? 'inline'}
                  onChange={(calendarMode) => update({ ...f, calendarMode })}
                  options={[
                    { value: 'inline', label: t(L('Always on the page', 'همیشه روی صفحه')) },
                    { value: 'popup', label: t(L('Opens in a window when clicked', 'با کلیک در یک پنجره باز شود')) },
                  ]}
                />
              )}
              {f.display === 'slider' && (
                <div className="grid grid-cols-3 gap-2">
                  <NumberField label={t(L('Lowest', 'کمترین'))} value={f.min} onChange={(min) => update({ ...f, min })} hint={t(L('Empty = from the items', 'خالی = از روی آیتم‌ها'))} />
                  <NumberField label={t(L('Highest', 'بیشترین'))} value={f.max} onChange={(max) => update({ ...f, max })} />
                  <NumberField label={t(L('Step', 'گام'))} value={f.step} min={0} onChange={(step) => update({ ...f, step: step && step > 0 ? step : null })} />
                </div>
              )}
              {f.display === 'presets' && (
                <ListEditor
                  label={t(L('Ranges', 'بازه‌ها'))}
                  items={f.presets}
                  max={8}
                  onChange={(presets) => update({ ...f, presets })}
                  create={() => ({ label: { en: '', fa: '' }, min: null, max: null })}
                  render={(r, upd) => (
                    <div className="flex flex-col gap-2">
                      <LocalizedField label={t(L('Label (e.g. Under 2M)', 'عنوان (مثلاً زیر ۲ میلیون)'))} value={r.label} onChange={(x) => upd({ ...r, label: x })} />
                      <div className="grid grid-cols-2 gap-2">
                        <NumberField label={t(L('From (empty = no lower limit)', 'از (خالی = بدون حد پایین)'))} value={r.min} onChange={(min) => upd({ ...r, min })} />
                        <NumberField label={t(L('To (empty = no upper limit)', 'تا (خالی = بدون حد بالا)'))} value={r.max} onChange={(max) => upd({ ...r, max })} />
                      </div>
                    </div>
                  )}
                />
              )}
              {(f.display === 'slider' || f.display === 'presets') && isPrice && (
                <p className="text-xs text-ink-soft">{t(L('Prices here are in the smallest unit (e.g. rials).', 'قیمت‌ها اینجا به کوچک‌ترین واحد هستند (مثلاً ریال).'))}</p>
              )}
            </div>
          );
        }}
      />
      <p className="text-xs text-ink-soft">{t(L('Visitors can combine these filters; the list updates as they choose.', 'بازدیدکننده می‌تواند این فیلترها را با هم ترکیب کند؛ لیست همان لحظه به‌روز می‌شود.'))}</p>
    </div>
  );
}

export function ItemSlugField({ siteId, source, label, value, onChange }: { siteId: string; source: string; label: string; value: string; onChange: (v: string) => void }) {
  const { locale } = usePreferences();
  const empty = locale === 'fa' ? 'آیتم همین صفحه (صفحه‌ی قالب)' : 'The item of this page (template pages)';
  if (!source || source === 'products') return <TextField label={label} value={value} onChange={onChange} hint={empty} />;
  return <ItemSelect siteId={siteId} collection={source} label={label} value={value} onChange={onChange} by="slug" emptyLabel={empty} />;
}
