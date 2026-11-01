import type { CollectionInput } from '@site-builder/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import { useT } from '../i18n';
import { type Starter, type StarterKind, useStarters } from '../starters';
import { Badge, Card, ConfirmButton, Empty, ErrorNote, Modal, PageTitle, Spinner, TextField, useErrorLine, useToast } from '../ui';

/**
 * The studio's starters (Platform ← Starters): the pages and tables saved with "Save as starter",
 * to rename or delete them. They are used from "New page" and "New table" on any site.
 */
export default function StartersPage() {
  const t = useT();
  return (
    <>
      <PageTitle title={t.sr.title} subtitle={t.sr.intro} />
      <div className="flex flex-col gap-6">
        <StarterList kind="page" />
        <StarterList kind="table" />
      </div>
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
  const list = useStarters<unknown>(kind);
  const [editing, setEditing] = useState<Starter | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['starters', kind] });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/platform/starters/${id}`),
    onSuccess: refresh,
    onError: (e) => toast(errorText(e), 'bad'),
  });

  const summary = (x: Starter) => {
    if (kind === 'page') return s.sections.replace('{n}', String((x.data as { document?: { sections?: unknown[] } }).document?.sections?.length ?? 0));
    const table = x.data as CollectionInput;
    return [l(table.name), s.fields.replace('{n}', String(table.fields?.length ?? 0))].filter(Boolean).join(' · ');
  };

  return (
    <Card title={kind === 'page' ? s.pages : s.tables}>
      {list.isLoading ? (
        <Spinner />
      ) : list.error ? (
        <ErrorNote error={list.error} />
      ) : !list.data?.length ? (
        <Empty text={kind === 'page' ? s.noPages : s.noTables} />
      ) : (
        <ul className="divide-y divide-line">
          {list.data.map((x) => (
            <li key={x.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-ink">{x.name}</p>
                {x.description && <p className="text-sm text-ink-soft">{x.description}</p>}
                <div className="mt-1">
                  <Badge>{summary(x)}</Badge>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(x)}>
                  {s.edit}
                </Button>
                <ConfirmButton label={s.delete} confirmText={s.deleteConfirm} variant="ghost" disabled={remove.isPending} onConfirm={() => remove.mutate(x.id)} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <EditStarter starter={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </Card>
  );
}

function EditStarter({ starter, onClose, onSaved }: { starter: Starter; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const s = t.sr;
  const toast = useToast();
  const [name, setName] = useState(starter.name);
  const [description, setDescription] = useState(starter.description);
  const save = useMutation({
    mutationFn: () => api.patch(`/platform/starters/${starter.id}`, { name, description }),
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
