import { DEFAULT_REQUEST_TYPES, SPACINGS, type CardBlock, type CollectionFilter, type ImageSize, type VisitorFilter, type SectionAppearance, type SectionButton } from '@site-builder/shared';
import { usePreferences } from '../../lib/preferences';
import type { Localized } from '../../types/site';
import { useAdminSettings } from '../AdminRoot';
import { useT } from '../i18n';
import { ButtonsEditor, LinkPicker } from '../links';
import { Checkbox, ListEditor, LocalizedField, NumberField, SelectField, TextField } from '../ui';
import { ImagePicker } from '../pages/FilesPage';
import { CardDesignField } from './CardDesigner';
import { FiltersField, ItemSlugField, SortField, SourceField, VisitorFiltersField } from './CollectionFields';
import type { FieldDef } from './fields';

type Props = Record<string, unknown>;
const emptyLoc: Localized = { en: '', fa: '' };

/** Empty value for a new list item, derived from its field definitions. */
function blankItem(fields: FieldDef[]): Props {
  const item: Props = {};
  for (const f of fields) {
    if (f.kind === 'loc') item[f.key] = { ...emptyLoc };
    else if (f.kind === 'text' || f.kind === 'href' || f.kind === 'image' || f.kind === 'color' || f.kind === 'category' || f.kind === 'requestType') item[f.key] = '';
    else if (f.kind === 'bool') item[f.key] = false;
    else if (f.kind === 'number') item[f.key] = f.min;
    else if (f.kind === 'select') item[f.key] = f.options[0].value;
    else if (f.kind === 'cta') item[f.key] = { label: { ...emptyLoc }, href: '' };
    else if (f.kind === 'imageSize') item[f.key] = { width: null, height: null, fit: 'cover', radius: 0 };
    else item[f.key] = [];
  }
  return item;
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const t = useT();
  return (
    <div className="flex items-end gap-3">
      <TextField label={label} dir="ltr" value={value} onChange={(x) => onChange(x.trim())} hint={`#1f5e4d · ${t.emptyDefault}`} className="flex-1" />
      <input type="color" aria-label={label} value={value || '#000000'} onChange={(e) => onChange(e.target.value)} className="mb-6 h-9 w-12 shrink-0 rounded border border-line" />
      {value && (
        <button type="button" aria-label={t.delete} onClick={() => onChange('')} className="mb-8 text-xs text-ink-soft hover:text-ink">
          ✕
        </button>
      )}
    </div>
  );
}

/** Width, height, fit and corners of an image; empty sizes keep the layout's own. */
function ImageSizeEditor({ label, value, onChange }: { label: string; value: ImageSize | undefined; onChange: (v: ImageSize) => void }) {
  const t = useT();
  const v: ImageSize = value ?? { width: null, height: null, fit: 'cover', radius: 0 };
  const num = (x: number | null, max: number) => (x === null ? null : Math.max(0, Math.min(max, Math.round(x))));
  return (
    <fieldset className="flex flex-col gap-3 rounded-md border border-line p-3">
      <legend className="px-1 text-xs font-medium text-ink-soft">{label}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField label={t.imageWidth} value={v.width} min={0} hint={t.emptyDefault} onChange={(width) => onChange({ ...v, width: num(width, 4000) || null })} />
        <NumberField label={t.imageHeight} value={v.height} min={0} hint={t.emptyDefault} onChange={(height) => onChange({ ...v, height: num(height, 4000) || null })} />
        <SelectField
          label={t.imageFit}
          value={v.fit}
          onChange={(fit) => onChange({ ...v, fit })}
          options={[
            { value: 'cover', label: t.fitCover },
            { value: 'contain', label: t.fitContain },
            { value: 'fill', label: t.fitFill },
          ]}
        />
        <NumberField label={t.imageRadius} value={v.radius} min={0} onChange={(radius) => onChange({ ...v, radius: num(radius, 200) ?? 0 })} />
      </div>
    </fieldset>
  );
}

const blankAppearance: SectionAppearance = { paddingTop: 'default', paddingBottom: 'default', background: '', textColor: '', width: 'default', showOn: 'all' };

/** The look every section shares: spacing, colours, content width and which devices show it. */
export function AppearanceEditor({ value, onChange }: { value: SectionAppearance | undefined; onChange: (v: SectionAppearance) => void }) {
  const t = useT();
  const v = { ...blankAppearance, ...value };
  const changed = JSON.stringify(v) !== JSON.stringify(blankAppearance);
  const space = SPACINGS.map((x) => ({ value: x, label: { default: t.spaceDefault, none: t.spaceNone, sm: t.spaceSm, md: t.spaceMd, lg: t.spaceLg, xl: t.spaceXl }[x] }));
  return (
    <details open={changed} className="rounded-md border border-line p-3">
      <summary className="cursor-pointer text-sm font-medium text-ink">{t.appearance}</summary>
      <div className="mt-4 flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label={t.spaceAbove} value={v.paddingTop} onChange={(paddingTop) => onChange({ ...v, paddingTop })} options={space} />
          <SelectField label={t.spaceBelow} value={v.paddingBottom} onChange={(paddingBottom) => onChange({ ...v, paddingBottom })} options={space} />
        </div>
        <ColorInput label={t.sectionBackground} value={v.background} onChange={(background) => onChange({ ...v, background })} />
        <ColorInput label={t.sectionText} value={v.textColor} onChange={(textColor) => onChange({ ...v, textColor })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label={t.sectionWidth}
            value={v.width}
            onChange={(width) => onChange({ ...v, width })}
            options={[
              { value: 'default', label: t.widthDefault },
              { value: 'narrow', label: t.widthNarrow },
              { value: 'wide', label: t.widthWide },
              { value: 'full', label: t.widthFull },
            ]}
          />
          <SelectField
            label={t.showOn}
            value={v.showOn}
            onChange={(showOn) => onChange({ ...v, showOn })}
            options={[
              { value: 'all', label: t.showAll },
              { value: 'desktop', label: t.showDesktop },
              { value: 'mobile', label: t.showMobile },
            ]}
          />
        </div>
      </div>
    </details>
  );
}

/** Kinds a client may edit on their own site: text and images, never links, layout or list length. */
const CONTENT_KINDS = new Set<FieldDef['kind']>(['loc', 'text', 'image', 'cta', 'strings', 'locList', 'list', 'buttons']);

/**
 * Renders editors for a set of fields; used for sections and, recursively, for list items.
 * `contentOnly`: only text and images, with lists edited in place (no adding, removing or moving).
 */
export function FieldsEditor({ fields, value, onChange, siteId, contentOnly = false }: { fields: FieldDef[]; value: Props; onChange: (v: Props) => void; siteId: string; contentOnly?: boolean }) {
  const { locale } = usePreferences();
  const t = useT();
  const { l } = usePreferences();
  const { data: settings } = useAdminSettings(siteId);
  const set = (key: string, v: unknown) => onChange({ ...value, [key]: v });

  return (
    <div className="flex flex-col gap-4">
      {fields.filter((f) => !contentOnly || CONTENT_KINDS.has(f.kind)).map((f) => {
        const label = f.label[locale];
        if (contentOnly && (f.kind === 'strings' || f.kind === 'locList' || f.kind === 'list')) {
          const items = (value[f.key] as unknown[]) ?? [];
          if (!items.length) return null;
          const update = (i: number, x: unknown) => set(f.key, items.map((it, j) => (j === i ? x : it)));
          return (
            <fieldset key={f.key} className="flex flex-col gap-3">
              <legend className="mb-1 text-xs font-medium text-ink-soft">{label}</legend>
              {items.map((item, i) => (
                <div key={i} className="rounded-md border border-line bg-bg p-3">
                  {f.kind === 'strings' ? (
                    <TextField label={`${label} #${i + 1}`} value={item as string} onChange={(x) => update(i, x)} />
                  ) : f.kind === 'locList' ? (
                    <LocalizedField label={`${label} #${i + 1}`} value={item as Localized} onChange={(x) => update(i, x)} />
                  ) : (
                    <FieldsEditor fields={f.item} value={item as Props} onChange={(x) => update(i, x)} siteId={siteId} contentOnly />
                  )}
                </div>
              ))}
            </fieldset>
          );
        }
        const v = value[f.key];
        switch (f.kind) {
          case 'loc':
            return <LocalizedField key={f.key} label={label} value={v as Localized} onChange={(x) => set(f.key, x)} multiline={f.multiline} rows={f.multiline ? 4 : undefined} />;
          case 'text':
            return <TextField key={f.key} label={label} value={(v as string) ?? ''} onChange={(x) => set(f.key, x)} />;
          case 'href':
            return <LinkPicker key={f.key} siteId={siteId} label={label} value={(v as string) ?? ''} onChange={(x) => set(f.key, x)} />;
          case 'buttons':
            return <ButtonsEditor key={f.key} siteId={siteId} label={label} value={(v as SectionButton[]) ?? []} onChange={(x) => set(f.key, x)} contentOnly={contentOnly} />;
          case 'imageSize':
            return <ImageSizeEditor key={f.key} label={label} value={v as ImageSize | undefined} onChange={(x) => set(f.key, x)} />;
          case 'color': {
            const color = (v as string) ?? '';
            return (
              <div key={f.key} className="flex items-end gap-3">
                <TextField label={label} dir="ltr" value={color} onChange={(x) => set(f.key, x.trim())} hint="#1f5e4d · empty = theme" className="flex-1" />
                <input type="color" aria-label={label} value={color || '#000000'} onChange={(e) => set(f.key, e.target.value)} className="mb-0.5 h-9 w-12 shrink-0 rounded border border-line" />
                {color && (
                  <button type="button" onClick={() => set(f.key, '')} className="mb-2 text-xs text-ink-soft hover:text-ink">
                    ✕
                  </button>
                )}
              </div>
            );
          }
          case 'category': {
            const current = (v as string) ?? '';
            const cats = settings?.productCategories ?? [];
            return (
              <SelectField
                key={f.key}
                label={label}
                value={current}
                onChange={(x) => set(f.key, x)}
                options={[
                  { value: '', label: t.allCategories },
                  ...cats.map((c) => ({ value: c.slug, label: l(c.label) || c.slug })),
                  ...(current && !cats.some((c) => c.slug === current) ? [{ value: current, label: current }] : []),
                ]}
              />
            );
          }
          case 'requestType': {
            const current = (v as string) ?? '';
            const types = settings?.requestTypes ?? DEFAULT_REQUEST_TYPES;
            const fallback = (value.formType as string) ?? 'consultation';
            return (
              <SelectField
                key={f.key}
                label={label}
                value={current || (types.some((x) => x.slug === fallback) ? fallback : '')}
                onChange={(x) => set(f.key, x)}
                options={[
                  ...(types.some((x) => x.slug === fallback) ? [] : [{ value: '', label: fallback }]),
                  ...types.map((x) => ({ value: x.slug, label: l(x.label) || x.slug })),
                  ...(current && !types.some((x) => x.slug === current) ? [{ value: current, label: current }] : []),
                ]}
              />
            );
          }
          case 'image':
            return <ImagePicker key={f.key} siteId={siteId} label={label} value={(v as string) ?? ''} onChange={(url) => set(f.key, url)} />;
          case 'source':
            return (
              <SourceField
                key={f.key}
                siteId={siteId}
                label={label}
                value={(v as string) ?? ''}
                // Filters and fields belong to the old table.
                onChange={(x) => onChange({ ...value, [f.key]: x, filters: [], visitorFilters: [], itemSlug: '', sort: 'position' })}
              />
            );
          case 'filters':
            return <FiltersField key={f.key} siteId={siteId} source={(value.source as string) ?? ''} label={label} value={(v as CollectionFilter[]) ?? []} onChange={(x) => set(f.key, x)} />;
          case 'sortField':
            return (
              <SortField
                key={f.key}
                siteId={siteId}
                source={(value.source as string) ?? ''}
                label={label}
                sort={(v as string) ?? 'position'}
                dir={(value.dir as 'asc' | 'desc') ?? 'asc'}
                onChange={(x) => onChange({ ...value, sort: x.sort, dir: x.dir })}
              />
            );
          case 'visitorFilters':
            return (
              <VisitorFiltersField
                key={f.key}
                siteId={siteId}
                source={(value.source as string) ?? ''}
                label={label}
                value={(v as VisitorFilter[]) ?? []}
                onChange={(x) => set(f.key, x)}
              />
            );
          case 'card':
            return (
              <CardDesignField
                key={f.key}
                siteId={siteId}
                source={(value.source as string) ?? ''}
                cardDesign={(value.cardDesign as string) ?? ''}
                card={(value.card as CardBlock | null) ?? null}
                onChange={(x) => onChange({ ...value, ...x })}
              />
            );
          case 'itemSlug':
            return <ItemSlugField key={f.key} siteId={siteId} source={(value.source as string) ?? ''} label={label} value={(v as string) ?? ''} onChange={(x) => set(f.key, x)} />;
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
                {!contentOnly && <LinkPicker siteId={siteId} label={t.link} value={cta.href} onChange={(x) => set(f.key, { ...cta, href: x })} />}
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
