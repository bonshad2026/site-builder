import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import { useT } from '../i18n';
import { byGroup, GroupField, StarterPreviewDialog, useStarters, type Starter, type StarterKind } from '../starters';
import { Badge, ConfirmButton, Empty, ErrorNote, Modal, PageTitle, Spinner, TextField, useErrorLine, useToast } from '../ui';

const PATHS: Record<string, StarterKind> = { pages: 'page', tables: 'table', headers: 'header', footers: 'footer' };

/**
 * The studio's starters (Platform ← Starters ← Pages / Tables / Headers / Footers): each kind in
 * its groups, to preview, rename, move to another group or delete. They are used from "New page"
 * and "New table" on any site, and from Settings ← Header / Footer.
 */
export default function StartersPage() {
  const t = useT();
  const { kind: path } = useParams();
  const kind = PATHS[path ?? ''];
  if (!kind) return <Navigate to="/admin/platform/starters/pages" replace />;
  const title = { page: t.sr.pages, table: t.sr.tables, header: t.sr.headers, footer: t.sr.footers }[kind];
  return (
    <>
      <PageTitle title={`${t.sr.title} · ${title}`} subtitle={t.sr.intro} />
      <p className="-mt-2 mb-4 text-sm text-ink-soft">{t.sr.updateHint}</p>
      <StarterList key={kind} kind={kind} />
    </>
  );
}

function StarterList({ kind }: { kind: StarterKind }) {
  const t = useT();
  const s = t.sr;
  const { l } = usePreferences();
  const qc = useQueryClient();
  const toast = useToast();
  const errorText = useErrorLine();
  const list = useStarters(kind);
  const [editing, setEditing] = useState<Starter | null>(null);
  const [preview, setPreview] = useState<Starter | null>(null);
  const [query, setQuery] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['starters'] });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/platform/starters/${id}`),
    onSuccess: refresh,
    onError: (e) => toast(errorText(e), 'bad'),
  });

  // What the pack holds: its pages and tables by name, then counts.
  const contents = (x: Starter) => [...x.data.pages.map((p) => (p.role === 'main' ? '' : `/${p.slug}`)).filter(Boolean), ...x.data.tables.map((tb) => l(tb.name) || tb.slug)].join('، ');
  const counts = (x: Starter) =>
    [
      kind === 'page' && s.sections.replace('{n}', String(x.summary.sections)),
      x.summary.pages > (kind === 'page' ? 1 : 0) && l({ en: `${x.summary.pages} ${x.summary.pages === 1 ? 'page' : 'pages'}`, fa: `${x.summary.pages} صفحه` }),
      x.summary.tables && l({ en: `${x.summary.tables} ${x.summary.tables === 1 ? 'table' : 'tables'}`, fa: `${x.summary.tables} جدول` }),
      kind === 'table' && x.data.tables[0] && s.fields.replace('{n}', String(x.data.tables[0].fields.length)),
      x.summary.items && l({ en: `${x.summary.items} ${x.summary.items === 1 ? 'sample item' : 'sample items'}`, fa: `${x.summary.items} آیتم نمونه` }),
      x.summary.forms && l({ en: `${x.summary.forms} ${x.summary.forms === 1 ? 'form' : 'forms'}`, fa: `${x.summary.forms} فرم` }),
      x.summary.photos && l({ en: `${x.summary.photos} ${x.summary.photos === 1 ? 'photo' : 'photos'}`, fa: `${x.summary.photos} عکس` }),
    ].filter(Boolean) as string[];

  if (list.isLoading) return <Spinner />;
  if (list.error) return <ErrorNote error={list.error} />;
  const q = query.trim().toLowerCase();
  const shown = (list.data ?? []).filter((x) => !q || `${x.name} ${x.description} ${x.group}`.toLowerCase().includes(q));
  const empty = { page: s.noPages, table: s.noTables, header: s.noHeaders, footer: s.noFooters }[kind];
  return (
    <div className="flex flex-col gap-4">
      {!!list.data?.length && <TextField label={s.search} value={query} onChange={setQuery} className="max-w-sm" />}
      {!shown.length && <Empty text={list.data?.length ? s.noMatch : empty} />}
      {byGroup(shown).map(([group, items]) => (
        <details key={group || '-'} open className="group rounded-lg border border-line bg-surface">
          <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-ink">
            <span>
              {group || s.noGroup} <span className="font-normal text-ink-soft">({items.length})</span>
            </span>
            <span aria-hidden="true" className="text-ink-soft transition-transform group-open:rotate-90 rtl:rotate-180 rtl:group-open:rotate-90">
              ›
            </span>
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {items.map((x) => (
              <li key={x.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {x.name} {x.sampleKey && <Badge tone="accent">{s.readyMade}</Badge>}
                  </p>
                  {x.description && <p className="text-sm text-ink-soft">{x.description}</p>}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {counts(x).map((c) => (
                      <Badge key={c}>{c}</Badge>
                    ))}
                    {x.summary.needs > 0 && <Badge tone="warn">{l({ en: `needs ${x.summary.needs} more from the site`, fa: `به ${x.summary.needs} مورد دیگر از سایت نیاز دارد` })}</Badge>}
                  </div>
                  {contents(x) && <p className="mt-1 text-xs text-ink-soft">{contents(x)}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" onClick={() => setPreview(x)}>
                    {s.preview}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(x)}>
                    {s.edit}
                  </Button>
                  <ConfirmButton label={s.delete} confirmText={s.deleteConfirm} variant="ghost" disabled={remove.isPending} onConfirm={() => remove.mutate(x.id)} />
                </div>
              </li>
            ))}
          </ul>
        </details>
      ))}
      {editing && <EditStarter starter={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      {preview && <StarterPreviewDialog starter={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function EditStarter({ starter, onClose, onSaved }: { starter: Starter; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const s = t.sr;
  const toast = useToast();
  const [name, setName] = useState(starter.name);
  const [description, setDescription] = useState(starter.description);
  const [group, setGroup] = useState(starter.group);
  const save = useMutation({
    mutationFn: () => api.patch(`/platform/starters/${starter.id}`, { name, description, group }),
    onSuccess: () => {
      onSaved();
      toast(s.saved);
      onClose();
    },
  });
  return (
    <Modal open onClose={onClose} title={s.edit}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <TextField label={s.name} value={name} onChange={setName} required />
        <GroupField kind={starter.kind} value={group} onChange={setGroup} />
        <TextField label={s.description} value={description} onChange={setDescription} multiline />
        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button type="submit" disabled={!name.trim() || save.isPending}>
            {t.save}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

