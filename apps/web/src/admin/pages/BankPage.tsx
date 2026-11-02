import { currencyDecimals, type BankKind, type Collection, type CollectionField, type KitItem } from '@site-builder/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { cn } from '../../lib/cn';
import { api, uploadFile } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import { DatePickerButton } from '../../components/ui/Calendar';
import { useT } from '../i18n';
import { StarterSelect, useStarters } from '../starters';
import { Badge, Card, Checkbox, ConfirmButton, Empty, ErrorNote, Field, LocalizedField, Modal, NumberField, PageTitle, SelectField, Spinner, TextField, useAdminCalendar, useErrorLine, useToast } from '../ui';

type Loc = { en: string; fa: string };
interface BankType {
  key: string;
  label: Loc;
  builtIn: boolean;
  entries: number;
  photos: number;
}
interface Photo {
  id: string | null;
  url: string;
  name: string;
  builtIn: boolean;
}
type Value = Loc | number | string;
interface Entry {
  id: string | null;
  /** A built-in entry's reference, to remove it. */
  ref?: string;
  data: Record<string, Value>;
  photos: { id: string | null; url: string }[];
  builtIn: boolean;
}

const isLoc = (v: Value | undefined): v is Loc => !!v && typeof v === 'object';
const localized = (t: string) => t === 'text' || t === 'textarea';

/**
 * Site kits (the content bank): per site type, copies of table starters with their sample items,
 * plain lists (products, services, reviews, FAQ) and photos. Sample data for sites is made from
 * them (see the "Sample data" window on the sites list).
 */
export default function BankPage() {
  const t = useT();
  const b = t.bk;
  const { l } = usePreferences();
  const qc = useQueryClient();
  const toast = useToast();
  const errorText = useErrorLine();
  const types = useQuery({ queryKey: ['bank', 'types'], queryFn: () => api.get<BankType[]>('/platform/bank/types') });
  const kinds = useQuery({ queryKey: ['bank', 'kinds'], queryFn: () => api.get<BankKind[]>('/platform/bank/kinds') });
  const [type, setType] = useState('general');
  // 'tables', a list kind (product, service…), or '' = the type's photos for any content.
  const [tab, setTab] = useState('tables');
  const [newType, setNewType] = useState({ key: '', fa: '', en: '' });
  const counts = useQuery({ queryKey: ['bank', 'counts', type], queryFn: () => api.get<Record<string, { entries: number; photos: number }>>(`/platform/bank/counts?type=${type}`) });
  const tables = useQuery({ queryKey: ['bank', 'tables', type], queryFn: () => api.get<KitTableRow[]>(`/platform/bank/tables?type=${type}`) });

  const refresh = () => qc.invalidateQueries({ queryKey: ['bank'] });
  const addType = useMutation({
    mutationFn: () => api.post('/platform/bank/types', { key: newType.key, label: { en: newType.en, fa: newType.fa } }),
    onSuccess: () => {
      setType(newType.key);
      setNewType({ key: '', fa: '', en: '' });
      refresh();
    },
  });
  const removeType = useMutation({
    mutationFn: (key: string) => api.delete(`/platform/bank/types/${key}`),
    onSuccess: () => {
      setType('general');
      refresh();
    },
    onError: (e) => toast(errorText(e), 'bad'),
  });
  const restore = useMutation({
    mutationFn: (key: string) => api.delete(`/platform/bank/hidden?type=${key}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bank'] }),
    onError: (e) => toast(errorText(e), 'bad'),
  });

  const current = types.data?.find((x) => x.key === type);
  const currentKind = kinds.data?.find((k) => k.key === tab);
  if (types.isLoading || kinds.isLoading) return <Spinner />;
  const chip = (id: string, label: string, n: number | undefined) => (
    <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn('rounded-full border px-3 py-1.5 text-sm', tab === id ? 'border-ink bg-ink text-bg' : 'border-line text-ink hover:bg-surface-2')}>
      {label}
      {n !== undefined && <span className="ms-1.5 text-xs opacity-60">{n}</span>}
    </button>
  );
  return (
    <>
      <PageTitle title={b.title} subtitle={b.intro} />
      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <aside className="flex flex-col gap-4">
          <Card title={b.types}>
            <ul className="flex flex-col gap-1">
              {types.data?.map((x) => (
                <li key={x.key}>
                  <button
                    type="button"
                    onClick={() => setType(x.key)}
                    className={cn('flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-start text-sm', type === x.key ? 'bg-ink text-bg' : 'text-ink hover:bg-surface-2')}
                  >
                    <span>{l(x.label) || x.key}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <Card title={b.addType}>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                addType.mutate();
              }}
            >
              <TextField label={b.key} dir="ltr" value={newType.key} onChange={(key) => setNewType((v) => ({ ...v, key: key.toLowerCase() }))} required />
              <TextField label={b.labelFa} value={newType.fa} onChange={(fa) => setNewType((v) => ({ ...v, fa }))} required />
              <TextField label={b.labelEn} dir="ltr" value={newType.en} onChange={(en) => setNewType((v) => ({ ...v, en }))} />
              <ErrorNote error={addType.error} />
              <Button type="submit" size="sm" disabled={addType.isPending}>
                {b.add}
              </Button>
            </form>
          </Card>
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl text-ink">{current ? l(current.label) : type}</h2>
            <span className="flex flex-wrap gap-2">
              <ConfirmButton label={b.restoreBuiltIn} confirmText={b.restoreBuiltInConfirm} variant="ghost" onConfirm={() => restore.mutate(type)} />
              {current && !current.builtIn && <ConfirmButton label={b.deleteType} confirmText={b.deleteTypeConfirm} variant="ghost" onConfirm={() => removeType.mutate(type)} />}
            </span>
          </div>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label={b.kinds}>
            {chip('tables', b.tables, tables.data?.length)}
            {kinds.data?.map((k) => chip(k.key, l(k.label) || k.key, counts.data?.[k.key]?.entries))}
            {chip('', b.typePhotos, counts.data?.['']?.photos)}
          </div>
          {tab === 'tables' && <KitTablesPanel type={type} list={tables.data ?? []} />}
          {currentKind && <EntriesPanel type={type} kind={currentKind} />}
          {tab !== 'tables' && <PhotosPanel type={type} kind={tab} />}
        </div>
      </div>
    </>
  );
}

interface KitTableRow {
  id: string;
  name: string;
  slug: string;
  label: Loc;
  others: { slug: string; name: Loc }[];
  items: number;
  photos: number;
}

/** The kit's tables: copies of table starters, each with its own sample items and photos. */
function KitTablesPanel({ type, list }: { type: string; list: KitTableRow[] }) {
  const t = useT();
  const b = t.bk;
  const { l } = usePreferences();
  const qc = useQueryClient();
  const toast = useToast();
  const errorText = useErrorLine();
  const starters = useStarters('table');
  const [starter, setStarter] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () => api.post<KitTableRow>('/platform/bank/tables', { type, starter }),
    onSuccess: (row) => {
      setStarter('');
      qc.invalidateQueries({ queryKey: ['bank'] });
      setEditing(row.id);
    },
    onError: (e) => toast(errorText(e), 'bad'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/platform/bank/tables/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bank'] }),
    onError: (e) => toast(errorText(e), 'bad'),
  });
  return (
    <Card title={b.tables}>
      <p className="mb-4 text-xs text-ink-soft">{type === 'general' ? b.tablesHintGeneral : b.tablesHint}</p>
      <form
        className="mb-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (starter) add.mutate();
        }}
      >
        <StarterSelect label={b.addTable} value={starter} onChange={setStarter} list={starters.data ?? []} empty={b.chooseStarter} className="min-w-64 flex-1" />
        <Button type="submit" size="sm" disabled={!starter || add.isPending}>
          {b.add}
        </Button>
      </form>
      {list.length ? (
        <ul className="flex flex-col divide-y divide-line">
          {list.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="block font-medium text-ink">{l(row.label) || row.name}</span>
                <span className="block text-xs text-ink-soft" dir="auto">
                  /{row.slug} · {b.itemsCount}: {row.items} · {b.photos}: {row.photos}
                  {row.others.length > 0 && ` · ${b.withTables}: ${row.others.map((x) => l(x.name) || x.slug).join('، ')}`}
                </span>
              </span>
              <span className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(row.id)}>
                  {b.editItems}
                </Button>
                <ConfirmButton label={t.delete} confirmText={b.removeTableConfirm} variant="ghost" onConfirm={() => remove.mutate(row.id)} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty text={type === 'general' ? b.noTablesGeneral : b.noTables} />
      )}
      {editing && <KitTableEditor id={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

interface KitTableFull extends Omit<KitTableRow, 'photos' | 'items'> {
  tables: Collection[];
  items: Record<string, KitItem[]>;
  photos: { id: string; url: string }[];
}

const newRef = () => `k${Math.random().toString(36).slice(2, 10)}`;

/** A kit table's sample items: a list per table, the chosen item's fields below, saved together. */
function KitTableEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useT();
  const b = t.bk;
  const { l, formatNumber } = usePreferences();
  const qc = useQueryClient();
  const toast = useToast();
  const errorText = useErrorLine();
  const upload = useRef<HTMLInputElement>(null);
  const kit = useQuery({ queryKey: ['bank', 'table', id], queryFn: () => api.get<KitTableFull>(`/platform/bank/tables/${id}`) });
  const [items, setItems] = useState<Record<string, KitItem[]> | null>(null);
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);
  const [table, setTable] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  if (kit.data && items === null) {
    setItems(kit.data.items);
    setPhotos(kit.data.photos);
    setTable(kit.data.slug || (kit.data.tables[0]?.slug ?? ''));
  }
  const save = useMutation({
    mutationFn: () => api.put(`/platform/bank/tables/${id}/items`, { items }),
    onSuccess: () => {
      toast(t.saved);
      qc.invalidateQueries({ queryKey: ['bank'] });
      onClose();
    },
    onError: (e) => toast(errorText(e), 'bad'),
  });
  const addPhotos = useMutation({
    mutationFn: (files: FileList) => {
      const form = new FormData();
      for (const f of Array.from(files)) form.append('files', f);
      return uploadFile(`/platform/bank/tables/${id}/photos`, form) as Promise<{ id: string; url: string }[]>;
    },
    onSuccess: (added) => setPhotos((list) => [...list, ...added]),
    onError: (e) => toast(errorText(e), 'bad'),
  });
  const current = kit.data?.tables.find((x) => x.slug === table);
  const list = items?.[table] ?? [];
  const item = list.find((x) => x.ref === selected) ?? null;
  const setList = (next: KitItem[]) => setItems((all) => ({ ...(all ?? {}), [table]: next }));
  const update = (patch: Partial<KitItem>) => setList(list.map((x) => (x.ref === selected ? { ...x, ...patch } : x)));
  const shown = current?.fields.filter((f) => f.type === 'text' || f.type === 'textarea' || f.type === 'number' || f.type === 'price').slice(0, 2) ?? [];
  return (
    <Modal open onClose={onClose} title={kit.data ? `${b.editItems}: ${l(kit.data.label) || kit.data.name}` : b.editItems} wide>
      {!kit.data || !items ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-ink-soft">{b.itemsHint}</p>
          {kit.data.tables.length > 1 && (
            <div className="flex flex-wrap gap-2" role="tablist">
              {kit.data.tables.map((x) => (
                <button key={x.slug} type="button" role="tab" aria-selected={table === x.slug} onClick={() => { setTable(x.slug); setSelected(null); }} className={cn('rounded-full border px-3 py-1.5 text-sm', table === x.slug ? 'border-ink bg-ink text-bg' : 'border-line text-ink hover:bg-surface-2')}>
                  {l(x.name) || x.slug} <span className="text-xs opacity-60">{items[x.slug]?.length ?? 0}</span>
                </button>
              ))}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {list.map((x, i) => {
                  const image = current?.fields.find((f) => f.type === 'image');
                  const photo = image && typeof x.data[image.key] === 'string' ? photos.find((p) => p.id === x.data[image.key]) : undefined;
                  return (
                    <tr key={x.ref} className={cn('border-b border-line align-top', selected === x.ref && 'bg-surface-2')}>
                      <td className="px-2 py-2">{photo ? <img src={photo.url} alt="" className="size-10 rounded object-cover" /> : <span className="block size-10 rounded bg-surface-2" />}</td>
                      <td className="px-2 py-2 font-medium">{l(x.title) || `#${i + 1}`}</td>
                      {shown.map((f) => (
                        <td key={f.key} className="max-w-56 px-2 py-2 text-ink-soft">
                          <span className="line-clamp-2">{valueText(x.data[f.key], l, formatNumber)}</span>
                        </td>
                      ))}
                      <td className="flex justify-end gap-2 px-2 py-2 whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => setSelected(selected === x.ref ? null : x.ref)}>
                          {t.edit}
                        </Button>
                        <Button size="sm" variant="ghost" className="text-danger" onClick={() => { setList(list.filter((y) => y.ref !== x.ref)); if (selected === x.ref) setSelected(null); }}>
                          {t.delete}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!list.length && <Empty text={b.noItems} />}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={list.length >= 100}
              onClick={() => {
                const ref = newRef();
                setList([...list, { ref, slug: '', title: { en: '', fa: '' }, data: {}, status: 'published' }]);
                setSelected(ref);
              }}
            >
              + {b.addItem}
            </Button>
            <input ref={upload} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="hidden" onChange={(e) => e.target.files?.length && addPhotos.mutate(e.target.files)} />
            <Button size="sm" variant="ghost" disabled={addPhotos.isPending} onClick={() => upload.current?.click()}>
              {addPhotos.isPending ? b.uploading : b.upload}
            </Button>
          </div>
          {item && current && (
            <section className="flex flex-col gap-4 rounded-md border border-line p-4">
              <LocalizedField label={t.title} value={item.title} onChange={(title) => update({ title })} />
              {current.fields.map((f) => (
                <KitFieldInput
                  key={f.key}
                  field={f}
                  table={current}
                  value={item.data[f.key]}
                  photos={photos}
                  refs={kit.data!.tables.find((x) => x.slug === f.reference) ? items[f.reference] ?? [] : null}
                  onChange={(v) => {
                    const data = { ...item.data };
                    if (v === null || v === undefined || v === '') delete data[f.key];
                    else data[f.key] = v;
                    update({ data });
                  }}
                />
              ))}
            </section>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={onClose}>
              {t.cancel}
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {t.save}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

const valueText = (v: unknown, l: (x: Loc | undefined) => string, num: (n: number) => string) =>
  v === undefined || v === null ? '' : typeof v === 'number' ? num(v) : typeof v === 'object' && !Array.isArray(v) ? l(v as Loc) : String(v);
const asIds = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' && v ? [v] : []);

/** One field of a kit item, by type. Images pick from the kit table's photos; references from its other tables' items. */
function KitFieldInput({
  field,
  table,
  value,
  photos,
  refs,
  onChange,
}: {
  field: CollectionField;
  table: Collection;
  value: unknown;
  photos: { id: string; url: string }[];
  refs: KitItem[] | null;
  onChange: (v: unknown) => void;
}) {
  const b = useT().bk;
  const { l, locale } = usePreferences();
  const cal = useAdminCalendar();
  const label = l(field.label) || field.key;
  switch (field.type) {
    case 'text':
    case 'textarea':
      return <LocalizedField label={label} value={(value as Loc) ?? { en: '', fa: '' }} onChange={(v) => onChange(v.en || v.fa ? v : null)} multiline={field.type === 'textarea'} rows={field.type === 'textarea' ? 3 : undefined} />;
    case 'number':
      return <NumberField label={label} value={typeof value === 'number' ? value : null} onChange={onChange} />;
    case 'price': {
      const currency = table.commerce.currency;
      const d = currencyDecimals(currency);
      return <NumberField label={`${label} (${currency})`} min={0} value={typeof value === 'number' ? value / 10 ** d : null} onChange={(v) => onChange(v === null ? null : Math.round(v * 10 ** d))} />;
    }
    case 'date':
      return <Field label={label}>{() => <DatePickerButton cal={cal} locale={locale} value={(value as string) ?? ''} onChange={(v) => onChange(v || null)} placeholder="—" />}</Field>;
    case 'datetime':
      return <TextField label={label} type="datetime-local" dir="ltr" value={typeof value === 'string' ? value : ''} onChange={(v) => onChange(v || null)} />;
    case 'boolean':
      return <Checkbox label={label} checked={!!value} onChange={onChange} />;
    case 'select':
      return <SelectField label={label} value={(value as string) ?? ''} onChange={(v) => onChange(v || null)} options={[{ value: '', label: '—' }, ...field.options.map((o) => ({ value: o.value, label: l(o.label) || o.value }))]} />;
    case 'multiselect': {
      const list = asIds(value);
      return (
        <fieldset className="flex flex-col gap-1 rounded-md border border-line p-3">
          <legend className="px-1 text-xs font-medium text-ink-soft">{label}</legend>
          {field.options.map((o) => (
            <Checkbox key={o.value} label={l(o.label) || o.value} checked={list.includes(o.value)} onChange={(on) => onChange(on ? [...list, o.value] : list.filter((x) => x !== o.value))} />
          ))}
        </fieldset>
      );
    }
    case 'image':
    case 'gallery': {
      const many = field.type === 'gallery';
      const ids = asIds(value);
      return (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium text-ink-soft">{label}</legend>
          {photos.length ? (
            <ul className="grid grid-cols-5 gap-2 sm:grid-cols-8">
              {photos.map((p) => {
                const on = ids.includes(p.id);
                return (
                  <li key={p.id}>
                    <button type="button" aria-pressed={on} onClick={() => onChange(many ? (on ? ids.filter((x) => x !== p.id) : [...ids, p.id]) : on ? null : p.id)} className={cn('block w-full overflow-hidden rounded-md border-2', on ? 'border-accent' : 'border-transparent')}>
                      <img src={p.url} alt="" className="aspect-square w-full object-cover" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-ink-soft">{b.noKitPhotos}</p>
          )}
        </fieldset>
      );
    }
    case 'reference': {
      if (!refs) return <p className="text-xs text-ink-soft">{label}: {b.refOutside}</p>;
      const ids = asIds(value);
      if (!field.multiple)
        return <SelectField label={label} value={ids[0] ?? ''} onChange={(v) => onChange(v ? [v] : null)} options={[{ value: '', label: '—' }, ...refs.map((r) => ({ value: r.ref, label: l(r.title) || r.ref }))]} />;
      return (
        <fieldset className="flex flex-col gap-1 rounded-md border border-line p-3">
          <legend className="px-1 text-xs font-medium text-ink-soft">{label}</legend>
          {refs.map((r) => (
            <Checkbox key={r.ref} label={l(r.title) || r.ref} checked={ids.includes(r.ref)} onChange={(on) => onChange(on ? [...ids, r.ref] : ids.filter((x) => x !== r.ref))} />
          ))}
        </fieldset>
      );
    }
    default:
      return <TextField label={label} dir="ltr" value={typeof value === 'string' ? value : ''} onChange={(v) => onChange(v || null)} />;
  }
}

function PhotosPanel({ type, kind }: { type: string; kind: string }) {
  const b = useT().bk;
  const qc = useQueryClient();
  const toast = useToast();
  const errorText = useErrorLine();
  const input = useRef<HTMLInputElement>(null);
  const key = ['bank', 'photos', type, kind];
  const photos = useQuery({ queryKey: key, queryFn: () => api.get<Photo[]>(`/platform/bank/photos?type=${type}&kind=${kind}`) });
  const upload = useMutation({
    mutationFn: (files: FileList) => {
      const form = new FormData();
      form.append('type', type);
      form.append('kind', kind);
      for (const f of Array.from(files)) form.append('files', f);
      return uploadFile('/platform/bank/photos', form);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bank'] }),
    onError: (e) => toast(errorText(e), 'bad'),
  });
  const remove = useMutation({
    mutationFn: (p: Photo) => (p.builtIn ? api.post('/platform/bank/hidden', { type, kind: '', ref: p.name }) : api.delete(`/platform/bank/photos/${p.id}`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bank'] }),
  });
  return (
    <Card title={b.photos}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-soft">{b.photosHint}</p>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="hidden" onChange={(e) => e.target.files?.length && upload.mutate(e.target.files)} />
        <Button size="sm" variant="outline" disabled={upload.isPending} onClick={() => input.current?.click()}>
          {upload.isPending ? b.uploading : b.upload}
        </Button>
      </div>
      {photos.isLoading ? (
        <Spinner />
      ) : photos.data?.length ? (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
          {photos.data.map((p, i) => (
            <li key={p.id ?? `b${i}`} className="group relative overflow-hidden rounded-md border border-line">
              <img src={p.url} alt={p.name} className="aspect-square w-full object-cover" loading="lazy" />
              {p.builtIn && (
                <span className="absolute start-1 top-1">
                  <Badge>{b.builtIn}</Badge>
                </span>
              )}
              <button type="button" aria-label="×" onClick={() => window.confirm(b.deleteConfirm) && remove.mutate(p)} className="absolute end-1 top-1 rounded-full bg-bg/90 px-2 text-sm text-danger opacity-0 group-hover:opacity-100 focus:opacity-100">
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty text={`${b.noPhotos} ${type === 'general' ? b.noPhotosGeneral : b.noPhotosType}`} />
      )}
    </Card>
  );
}

/** A simple CSV reader (quotes, commas and newlines inside quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

function EntriesPanel({ type, kind }: { type: string; kind: BankKind }) {
  const t = useT();
  const b = t.bk;
  const { l, formatNumber } = usePreferences();
  const qc = useQueryClient();
  const toast = useToast();
  const errorText = useErrorLine();
  const csv = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<Entry | 'new' | null>(null);
  const entries = useQuery({ queryKey: ['bank', 'entries', type, kind.key], queryFn: () => api.get<Entry[]>(`/platform/bank/entries?type=${type}&kind=${kind.key}`) });
  const remove = useMutation({
    mutationFn: (e: Entry) => (e.builtIn ? api.post('/platform/bank/hidden', { type, kind: kind.key, ref: e.ref }) : api.delete(`/platform/bank/entries/${e.id}`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bank'] }),
  });
  const importCsv = useMutation({
    mutationFn: async (file: File) => {
      const [head, ...rows] = parseCsv(await file.text());
      const list = rows.map((r) => {
        const cell = (k: string) => (head.indexOf(k) >= 0 ? (r[head.indexOf(k)] ?? '').trim() : '');
        const data: Record<string, Value> = {};
        for (const f of kind.fields) {
          if (localized(f.type)) {
            const both = cell(f.key);
            const fa = cell(`${f.key}_fa`) || both;
            const en = cell(`${f.key}_en`) || both;
            if (fa || en) data[f.key] = { fa, en };
          } else {
            const v = cell(f.key);
            if (v) data[f.key] = f.type === 'date' ? v : Number(v.replace(/[,،]/g, ''));
          }
        }
        return { type, kind: kind.key, data, photos: [] };
      });
      return api.post<{ added: number }>('/platform/bank/entries', { entries: list.filter((e) => Object.keys(e.data).length) });
    },
    onSuccess: (r) => {
      toast(`${b.imported}: ${r.added}`);
      qc.invalidateQueries({ queryKey: ['bank'] });
    },
    onError: (e) => toast(errorText(e), 'bad'),
  });
  const shown = kind.fields.slice(0, 4);
  const cellText = (v: Value | undefined) => (v === undefined ? '' : isLoc(v) ? l(v) : typeof v === 'number' ? formatNumber(v) : String(v));
  const sample = kind.fields.map((f) => (localized(f.type) ? `${f.key}_fa,${f.key}_en` : f.key)).join(',');
  return (
    <Card title={b.entries}>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <input ref={csv} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && importCsv.mutate(e.target.files[0])} />
        <Button size="sm" variant="ghost" disabled={importCsv.isPending} onClick={() => csv.current?.click()}>
          {b.importCsv}
        </Button>
        <Button size="sm" onClick={() => setEditing('new')}>
          {b.addEntry}
        </Button>
      </div>
      <p className="mb-4 text-xs text-ink-soft">
        {b.csvHint}{' '}
        <code dir="ltr" className="break-all">
          {sample}
        </code>
      </p>
      {entries.isLoading ? (
        <Spinner />
      ) : entries.data?.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-start text-xs text-ink-soft">
                <th className="px-2 py-2 text-start font-medium" />
                {shown.map((f) => (
                  <th key={f.key} className="px-2 py-2 text-start font-medium">
                    {l(f.label) || f.key}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.data.map((e, i) => (
                <tr key={e.id ?? `b${i}`} className={cn('border-b border-line align-top', e.builtIn && 'text-ink-soft')}>
                  <td className="px-2 py-2">{e.photos[0] ? <img src={e.photos[0].url} alt="" className="size-10 rounded object-cover" loading="lazy" /> : <span className="block size-10 rounded bg-surface-2" />}</td>
                  {shown.map((f) => (
                    <td key={f.key} className="max-w-64 px-2 py-2">
                      <span className="line-clamp-2">{cellText(e.data[f.key])}</span>
                    </td>
                  ))}
                  <td className="px-2 py-2 text-end whitespace-nowrap">
                    <span className="flex items-center justify-end gap-2">
                      {e.builtIn ? (
                        <Badge>{b.builtIn}</Badge>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setEditing(e)}>
                          {t.edit}
                        </Button>
                      )}
                      <ConfirmButton label={t.delete} confirmText={b.deleteConfirm} variant="ghost" onConfirm={() => remove.mutate(e)} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty text={`${b.noEntries} ${type === 'general' ? b.noEntriesGeneral : b.noEntriesType}`} />
      )}
      <EntryModal type={type} kind={kind} entry={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}

function EntryModal({ type, kind, entry, onClose }: { type: string; kind: BankKind; entry: Entry | 'new' | null; onClose: () => void }) {
  const b = useT().bk;
  const t = useT();
  const qc = useQueryClient();
  const isNew = entry === 'new';
  const [data, setData] = useState<Record<string, Value>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [openedFor, setOpenedFor] = useState<Entry | 'new' | null>(null);
  // Fill the form each time it opens for another entry.
  if (entry !== openedFor) {
    setOpenedFor(entry);
    setData(entry && entry !== 'new' ? entry.data : {});
    setPhotos(entry && entry !== 'new' ? entry.photos.map((p) => p.id!).filter(Boolean) : []);
  }
  const choices = useQuery({ queryKey: ['bank', 'photos', type, kind.key], queryFn: () => api.get<Photo[]>(`/platform/bank/photos?type=${type}&kind=${kind.key}`), enabled: !!entry });
  const save = useMutation({
    mutationFn: () =>
      isNew ? api.post('/platform/bank/entries', { entries: [{ type, kind: kind.key, data, photos }] }) : api.put(`/platform/bank/entries/${(entry as Entry).id}`, { data, photos }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank'] });
      onClose();
    },
  });
  const set = (key: string, v: Value | undefined) =>
    setData((d) => {
      const next = { ...d };
      if (v === undefined || v === '') delete next[key];
      else next[key] = v;
      return next;
    });
  const { l } = usePreferences();
  return (
    <Modal open={!!entry} onClose={onClose} title={isNew ? b.addEntry : b.editEntry} wide>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {kind.fields.map((f) =>
          localized(f.type) ? (
            <LocalizedField key={f.key} label={l(f.label) || f.key} value={isLoc(data[f.key]) ? (data[f.key] as Loc) : undefined} onChange={(v) => set(f.key, v.en || v.fa ? v : undefined)} multiline={f.type === 'textarea'} rows={3} />
          ) : f.type === 'date' ? (
            <TextField key={f.key} label={l(f.label) || f.key} type="date" dir="ltr" value={typeof data[f.key] === 'string' ? (data[f.key] as string) : ''} onChange={(v) => set(f.key, v)} />
          ) : (
            <NumberField key={f.key} label={l(f.label) || f.key} min={0} value={typeof data[f.key] === 'number' ? (data[f.key] as number) : null} onChange={(v) => set(f.key, v ?? undefined)} />
          ),
        )}
        <fieldset>
          <legend className="mb-2 text-xs font-medium text-ink-soft">{b.entryPhotos}</legend>
          {choices.data?.some((p) => !p.builtIn) ? (
            <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {choices.data
                .filter((p) => !p.builtIn)
                .map((p) => {
                  const on = photos.includes(p.id!);
                  return (
                    <li key={p.id}>
                      <button type="button" aria-pressed={on} onClick={() => setPhotos((list) => (on ? list.filter((x) => x !== p.id) : [...list, p.id!]))} className={cn('relative block w-full overflow-hidden rounded-md border-2', on ? 'border-accent' : 'border-transparent')}>
                        <img src={p.url} alt={p.name} className="aspect-square w-full object-cover" />
                        {on && <span className="absolute end-1 top-1 rounded-full bg-accent px-1.5 text-xs text-accent-ink">{photos.indexOf(p.id!) + 1}</span>}
                      </button>
                    </li>
                  );
                })}
            </ul>
          ) : (
            <p className="text-xs text-ink-soft">{b.noPhotos}</p>
          )}
        </fieldset>
        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {t.save}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
