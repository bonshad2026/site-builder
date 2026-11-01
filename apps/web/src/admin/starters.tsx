import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { usePreferences } from '../lib/preferences';
import { ConfirmButton, SelectField, useErrorLine, useToast } from './ui';

/**
 * The studio's own starting points for new pages and tables (control DB, `/platform/starters`):
 * any page or table can be saved as one, and a new page or table on any site can start from one.
 */
export type StarterKind = 'page' | 'table';
export interface Starter<D = unknown> {
  id: string;
  kind: StarterKind;
  name: string;
  description: string;
  data: D;
}

const key = (kind: StarterKind) => ['starters', kind];

export function useStarters<D>(kind: StarterKind, enabled = true) {
  return useQuery({ queryKey: key(kind), queryFn: () => api.get<Starter<D>[]>(`/platform/starters?kind=${kind}`), enabled });
}

/** Asks for a name and saves `data` as a starter. */
export function useSaveStarter(kind: StarterKind) {
  const qc = useQueryClient();
  const toast = useToast();
  const errorText = useErrorLine();
  const { l } = usePreferences();
  return useMutation({
    mutationFn: async ({ name, data }: { name: string; data: () => Promise<unknown> | unknown }) => {
      const picked = window.prompt(l({ en: 'Name of the starter', fa: 'نام الگو' }), name)?.trim();
      if (!picked) return false;
      await api.post('/platform/starters', { kind, name: picked, data: await data() });
      return true;
    },
    onSuccess: (saved) => {
      if (!saved) return;
      qc.invalidateQueries({ queryKey: key(kind) });
      toast(l({ en: 'Saved to the starters', fa: 'در بانک الگوها ذخیره شد' }));
    },
    onError: (e) => toast(errorText(e), 'bad'),
  });
}

/** "Start from": empty or a saved starter, with a button to delete the chosen one. */
export function StarterPicker({ kind, value, onChange }: { kind: StarterKind; value: string; onChange: (id: string) => void }) {
  const { l } = usePreferences();
  const qc = useQueryClient();
  const list = useStarters(kind);
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/platform/starters/${id}`),
    onSuccess: () => {
      onChange('');
      qc.invalidateQueries({ queryKey: key(kind) });
    },
  });
  if (!list.data?.length) return null;
  return (
    <div className="flex items-end gap-2">
      <SelectField
        className="flex-1"
        label={l({ en: 'Start from', fa: 'شروع از' })}
        value={value}
        onChange={onChange}
        options={[{ value: '', label: l({ en: 'Empty', fa: 'خالی' }) }, ...list.data.map((s) => ({ value: s.id, label: s.name }))]}
      />
      {value && <ConfirmButton label={l({ en: 'Delete starter', fa: 'حذف الگو' })} confirmText={l({ en: 'Delete this starter?', fa: 'این الگو حذف شود؟' })} variant="ghost" onConfirm={() => remove.mutate(value)} />}
    </div>
  );
}
