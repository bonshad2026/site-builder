import { BANK_FIELD_TYPES, type BankField, type BankFieldType, type BankKind } from '@site-builder/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { cn } from '../../lib/cn';
import { api, uploadFile } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import { useT } from '../i18n';
import { Badge, Card, ConfirmButton, Empty, ErrorNote, LocalizedField, Modal, NumberField, PageTitle, SelectField, Spinner, TextField, useErrorLine, useToast } from '../ui';

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
const localized = (t: BankFieldType) => t === 'text' || t === 'textarea';

/**
 * The studio's content bank: per site type, entries of each kind of content and photos. Sample
 * data for sites is made from it (see the "Sample data" window on the sites list).
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
  // '' = the type's photos for any kind.
  const [kind, setKind] = useState('product');
  const [newType, setNewType] = useState({ key: '', fa: '', en: '' });
  const [kindModal, setKindModal] = useState(false);

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
  const removeKind = useMutation({
    mutationFn: (key: string) => api.delete(`/platform/bank/kinds/${key}`),
    onSuccess: () => {
      setKind('product');
      refresh();
    },
    onError: (e) => toast(errorText(e), 'bad'),
  });

  const current = types.data?.find((x) => x.key === type);
  const currentKind = kinds.data?.find((k) => k.key === kind);
  if (types.isLoading || kinds.isLoading) return <Spinner />;
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
                    {x.entries + x.photos > 0 && <span className="text-xs opacity-70">{x.entries + x.photos}</span>}
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
            {kinds.data?.map((k) => (
              <button key={k.key} type="button" role="tab" aria-selected={kind === k.key} onClick={() => setKind(k.key)} className={cn('rounded-full border px-3 py-1.5 text-sm', kind === k.key ? 'border-ink bg-ink text-bg' : 'border-line text-ink hover:bg-surface-2')}>
                {l(k.label) || k.key}
              </button>
            ))}
            <button type="button" role="tab" aria-selected={kind === ''} onClick={() => setKind('')} className={cn('rounded-full border px-3 py-1.5 text-sm', kind === '' ? 'border-ink bg-ink text-bg' : 'border-line text-ink hover:bg-surface-2')}>
              {b.typePhotos}
            </button>
            <Button size="sm" variant="ghost" onClick={() => setKindModal(true)}>
              + {b.addKind}
            </Button>
          </div>
          {currentKind && !currentKind.builtIn && (
            <div className="flex justify-end">
              <ConfirmButton label={b.deleteKind} confirmText={b.deleteKindConfirm} variant="ghost" onConfirm={() => removeKind.mutate(kind)} />
            </div>
          )}
          <PhotosPanel type={type} kind={kind} />
          {currentKind && <EntriesPanel type={type} kind={currentKind} />}
        </div>
      </div>
      <KindModal open={kindModal} onClose={() => setKindModal(false)} onSaved={(key) => {
        setKind(key);
        refresh();
      }} />
    </>
  );
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
        <Empty text={b.noPhotos} />
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
        <Empty text={b.noEntries} />
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

function KindModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (key: string) => void }) {
  const t = useT();
  const b = t.bk;
  const [key, setKey] = useState('');
  const [label, setLabel] = useState({ en: '', fa: '' });
  const [fields, setFields] = useState<BankField[]>([{ key: 'title', type: 'text', label: { en: 'Title', fa: 'عنوان' } }]);
  const typeLabel: Record<BankFieldType, string> = { text: b.tText, textarea: b.tTextarea, number: b.tNumber, price: b.tPrice, date: b.tDate };
  const save = useMutation({
    mutationFn: () => api.post('/platform/bank/kinds', { key, label, fields: fields.filter((f) => f.key) }),
    onSuccess: () => {
      onSaved(key);
      setKey('');
      setLabel({ en: '', fa: '' });
      setFields([{ key: 'title', type: 'text', label: { en: 'Title', fa: 'عنوان' } }]);
      onClose();
    },
  });
  const up = (i: number, patch: Partial<BankField>) => setFields((list) => list.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <Modal open={open} onClose={onClose} title={b.addKind} wide>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <p className="text-xs text-ink-soft">{b.kindHint}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField label={b.key} dir="ltr" value={key} onChange={(v) => setKey(v.toLowerCase())} required />
          <TextField label={b.labelFa} value={label.fa} onChange={(fa) => setLabel((x) => ({ ...x, fa }))} required />
          <TextField label={b.labelEn} dir="ltr" value={label.en} onChange={(en) => setLabel((x) => ({ ...x, en }))} />
        </div>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-xs font-medium text-ink-soft">{b.fields}</legend>
          {fields.map((f, i) => (
            <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_8rem_auto]">
              <TextField label={b.fieldKey} dir="ltr" value={f.key} onChange={(v) => up(i, { key: v.toLowerCase() })} />
              <TextField label={b.labelFa} value={f.label.fa} onChange={(fa) => up(i, { label: { ...f.label, fa } })} />
              <TextField label={b.labelEn} dir="ltr" value={f.label.en} onChange={(en) => up(i, { label: { ...f.label, en } })} />
              <SelectField label={b.fieldType} value={f.type} onChange={(type) => up(i, { type })} options={BANK_FIELD_TYPES.map((x) => ({ value: x, label: typeLabel[x] }))} />
              <Button size="sm" variant="ghost" disabled={f.key === 'title'} onClick={() => setFields((list) => list.filter((_, j) => j !== i))}>
                ×
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" className="w-fit" onClick={() => setFields((list) => [...list, { key: '', type: 'text', label: { en: '', fa: '' } }])}>
            + {b.addField}
          </Button>
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
