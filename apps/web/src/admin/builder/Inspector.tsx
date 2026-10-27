import { usePreferences } from '../../lib/preferences';
import type { Localized } from '../../types/site';
import { useT } from '../i18n';
import { Checkbox, ListEditor, LocalizedField, NumberField, SelectField, TextField } from '../ui';
import { ImagePicker } from '../pages/FilesPage';
import type { FieldDef } from './fields';

type Props = Record<string, unknown>;
const emptyLoc: Localized = { en: '', fa: '' };

/** Empty value for a new list item, derived from its field definitions. */
function blankItem(fields: FieldDef[]): Props {
  const item: Props = {};
  for (const f of fields) {
    if (f.kind === 'loc') item[f.key] = { ...emptyLoc };
    else if (f.kind === 'text' || f.kind === 'href' || f.kind === 'image') item[f.key] = '';
    else if (f.kind === 'bool') item[f.key] = false;
    else if (f.kind === 'number') item[f.key] = f.min;
    else if (f.kind === 'select') item[f.key] = f.options[0].value;
    else if (f.kind === 'cta') item[f.key] = { label: { ...emptyLoc }, href: '' };
    else item[f.key] = [];
  }
  return item;
}

/** Renders editors for a set of fields; used for sections and, recursively, for list items. */
export function FieldsEditor({ fields, value, onChange, siteId }: { fields: FieldDef[]; value: Props; onChange: (v: Props) => void; siteId: string }) {
  const { locale } = usePreferences();
  const t = useT();
  const set = (key: string, v: unknown) => onChange({ ...value, [key]: v });

  return (
    <div className="flex flex-col gap-4">
      {fields.map((f) => {
        const label = f.label[locale];
        const v = value[f.key];
        switch (f.kind) {
          case 'loc':
            return <LocalizedField key={f.key} label={label} value={v as Localized} onChange={(x) => set(f.key, x)} multiline={f.multiline} rows={f.multiline ? 4 : undefined} />;
          case 'text':
            return <TextField key={f.key} label={label} value={(v as string) ?? ''} onChange={(x) => set(f.key, x)} />;
          case 'href':
            return <TextField key={f.key} label={label} dir="ltr" value={(v as string) ?? ''} onChange={(x) => set(f.key, x)} hint="/contact · https://…" />;
          case 'image':
            return <ImagePicker key={f.key} siteId={siteId} label={label} value={(v as string) ?? ''} onChange={(url) => set(f.key, url)} />;
          case 'number':
            return <NumberField key={f.key} label={label} value={(v as number) ?? f.min} min={f.min} onChange={(x) => set(f.key, Math.max(f.min, Math.min(f.max, x ?? f.min)))} />;
          case 'bool':
            return <Checkbox key={f.key} label={label} checked={!!v} onChange={(x) => set(f.key, x)} />;
          case 'select':
            return <SelectField key={f.key} label={label} value={(v as string) ?? f.options[0].value} onChange={(x) => set(f.key, x)} options={f.options.map((o) => ({ value: o.value, label: o.label[locale] }))} />;
          case 'cta': {
            const cta = (v as { label: Localized; href: string }) ?? { label: emptyLoc, href: '' };
            return (
              <fieldset key={f.key} className="flex flex-col gap-2 rounded-md border border-line p-3">
                <legend className="px-1 text-xs font-medium text-ink-soft">{label}</legend>
                <LocalizedField label={t.label} value={cta.label} onChange={(x) => set(f.key, { ...cta, label: x })} />
                <TextField label={t.link} dir="ltr" value={cta.href} onChange={(x) => set(f.key, { ...cta, href: x })} hint="/contact · https://…" />
              </fieldset>
            );
          }
          case 'strings':
            return (
              <ListEditor
                key={f.key}
                label={label}
                items={(v as string[]) ?? []}
                onChange={(x) => set(f.key, x)}
                create={() => ''}
                render={(item, update) => <TextField label={label} value={item} onChange={update} />}
              />
            );
          case 'locList':
            return (
              <ListEditor
                key={f.key}
                label={label}
                items={(v as Localized[]) ?? []}
                onChange={(x) => set(f.key, x)}
                create={() => ({ ...emptyLoc })}
                render={(item, update) => <LocalizedField label={label} value={item} onChange={update} />}
              />
            );
          case 'list':
            return (
              <ListEditor
                key={f.key}
                label={label}
                items={(v as Props[]) ?? []}
                onChange={(x) => set(f.key, x)}
                create={() => blankItem(f.item)}
                render={(item, update) => <FieldsEditor fields={f.item} value={item} onChange={update} siteId={siteId} />}
              />
            );
        }
      })}
    </div>
  );
}
