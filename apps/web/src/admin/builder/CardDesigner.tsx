import {
  BLOCK_ACTIONS,
  BLOCK_TYPES,
  BLOCK_WIDTHS,
  DEFAULT_REQUEST_TYPES,
  defaultCardDesign,
  newBlock,
  TEXT_STYLES,
  type BlockType,
  type CardBlock,
  type CollectionField,
  type PublicCollection,
  type PublicItem,
  type SiteSettings,
} from '@site-builder/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { CardView } from '../../features/collections/CardView';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { usePreferences } from '../../lib/preferences';
import { useAdminSettings } from '../AdminRoot';
import { usePreviewItems, useListSources } from '../collections/api';
import { LinkPicker } from '../links';
import { Checkbox, IconButton, LocalizedField, Modal, NumberField, SelectField, TextField, useToast } from '../ui';

type Lbl = { en: string; fa: string };
const L = (en: string, fa: string): Lbl => ({ en, fa });

const TYPE_LABELS: Record<BlockType, Lbl> = {
  stack: L('Row / column', 'ردیف / ستون'),
  image: L('Image', 'تصویر'),
  text: L('Text or field', 'متن یا فیلد'),
  badge: L('Badge', 'برچسب'),
  price: L('Price', 'قیمت'),
  capacity: L('Seats / status', 'ظرفیت / وضعیت'),
  button: L('Button', 'دکمه'),
  divider: L('Divider', 'جداکننده'),
  spacer: L('Space', 'فاصله'),
};
const ACTION_LABELS: Record<(typeof BLOCK_ACTIONS)[number], Lbl> = {
  view: L('Open the item page', 'باز کردن صفحه‌ی آیتم'),
  cart: L('Add to cart', 'افزودن به سبد خرید'),
  request: L('Request form', 'فرم درخواست'),
  link: L('Link', 'لینک'),
  call: L('Call', 'تماس تلفنی'),
};

/* ---------- tree helpers ---------- */

const mapTree = (b: CardBlock, fn: (b: CardBlock) => CardBlock): CardBlock => fn({ ...b, children: b.children.map((c) => mapTree(c, fn)) });
const findBlock = (b: CardBlock, id: string): CardBlock | null => (b.id === id ? b : b.children.reduce<CardBlock | null>((hit, c) => hit ?? findBlock(c, id), null));
const findParent = (b: CardBlock, id: string): CardBlock | null => (b.children.some((c) => c.id === id) ? b : b.children.reduce<CardBlock | null>((hit, c) => hit ?? findParent(c, id), null));
const freshIds = (b: CardBlock): CardBlock => mapTree(b, (x) => ({ ...x, id: Math.random().toString(36).slice(2, 10) }));

function updateBlock(root: CardBlock, id: string, patch: Partial<CardBlock>) {
  return mapTree(root, (b) => (b.id === id ? { ...b, ...patch } : b));
}
function removeBlock(root: CardBlock, id: string): CardBlock {
  return mapTree(root, (b) => ({ ...b, children: b.children.filter((c) => c.id !== id) }));
}
function moveBlock(root: CardBlock, id: string, d: -1 | 1): CardBlock {
  return mapTree(root, (b) => {
    const i = b.children.findIndex((c) => c.id === id);
    if (i < 0 || i + d < 0 || i + d >= b.children.length) return b;
    const next = [...b.children];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    return { ...b, children: next };
  });
}
/** Adds a block inside the selected row/column, or after the selected block. */
function insertBlock(root: CardBlock, selectedId: string, block: CardBlock): CardBlock {
  const sel = findBlock(root, selectedId) ?? root;
  if (sel.type === 'stack') return mapTree(root, (b) => (b.id === sel.id ? { ...b, children: [...b.children, block] } : b));
  return mapTree(root, (b) => {
    const i = b.children.findIndex((c) => c.id === sel.id);
    if (i < 0) return b;
    const next = [...b.children];
    next.splice(i + 1, 0, block);
    return { ...b, children: next };
  });
}
function duplicateBlock(root: CardBlock, id: string): CardBlock {
  return mapTree(root, (b) => {
    const i = b.children.findIndex((c) => c.id === id);
    if (i < 0) return b;
    const next = [...b.children];
    next.splice(i + 1, 0, freshIds(b.children[i]));
    return { ...b, children: next };
  });
}

/* ---------- the section's box: shared design or its own ---------- */

/**
 * Inspector control for a list's box: pick a shared design, or design this list's own box in
 * the designer. Saving as shared stores the design in the site settings for other lists.
 */
export function CardDesignField({
  siteId,
  source,
  cardDesign,
  card,
  onChange,
}: {
  siteId: string;
  source: string;
  cardDesign: string;
  card: CardBlock | null;
  onChange: (v: { cardDesign: string; card: CardBlock | null }) => void;
}) {
  const { locale } = usePreferences();
  const { data: settings } = useAdminSettings(siteId);
  const [open, setOpen] = useState(false);
  const saved = settings?.cardDesigns ?? [];
  const shared = saved.find((d) => d.id === cardDesign);
  const t = (x: Lbl) => x[locale];
  return (
    <fieldset className="flex flex-col gap-3 rounded-md border border-line p-3">
      <legend className="px-1 text-xs font-medium text-ink-soft">{t(L('Box design', 'طراحی باکس'))}</legend>
      <SelectField
        label={t(L('Design', 'طرح'))}
        value={cardDesign}
        onChange={(id) => onChange({ cardDesign: id, card })}
        options={[{ value: '', label: t(L('This list’s own box', 'باکس اختصاصی همین لیست')) }, ...saved.map((d) => ({ value: d.id, label: `${t(L('Shared', 'مشترک'))}: ${d.name || d.id}` }))]}
      />
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={!source}>
        {t(L('Open the box designer', 'باز کردن طراح باکس'))}
      </Button>
      {!source && <p className="text-xs text-ink-soft">{t(L('Choose a table first.', 'اول جدول را انتخاب کنید.'))}</p>}
      {open && (
        <CardDesignerModal
          siteId={siteId}
          source={source}
          initial={shared?.design ?? card ?? defaultCardDesign()}
          sharedId={shared?.id ?? ''}
          sharedName={shared?.name ?? ''}
          onClose={() => setOpen(false)}
          onApply={(design, sharedId) => {
            onChange(sharedId ? { cardDesign: sharedId, card } : { cardDesign: '', card: design });
            setOpen(false);
          }}
        />
      )}
    </fieldset>
  );
}

function CardDesignerModal({
  siteId,
  source,
  initial,
  sharedId,
  sharedName,
  onClose,
  onApply,
}: {
  siteId: string;
  source: string;
  initial: CardBlock;
  sharedId: string;
  sharedName: string;
  onClose: () => void;
  onApply: (design: CardBlock, sharedId: string) => void;
}) {
  const { locale, l } = usePreferences();
  const t = (x: Lbl) => x[locale];
  const toast = useToast();
  const qc = useQueryClient();
  const { data: settings } = useAdminSettings(siteId);
  const { data: sources } = useListSources(siteId);
  const src = sources.find((s) => s.slug === source);
  const fields = useMemo(() => src?.fields ?? [], [src]);
  const { data: samples = [] } = usePreviewItems(siteId, source);
  const [design, setDesign] = useState<CardBlock>(initial);
  const [selected, setSelected] = useState(initial.id);
  const [sample, setSample] = useState(0);
  const [previewWidth, setPreviewWidth] = useState<'card' | 'wide'>('card');
  const [name, setName] = useState(sharedName);
  const block = findBlock(design, selected) ?? design;
  const item: PublicItem | undefined = samples[sample];
  const drafts = samples.filter((s) => s.status === 'draft').length;
  const collection: PublicCollection | undefined = src
    ? { id: src.slug, slug: src.slug, name: src.name, itemName: src.name, fields, detailPage: '', imageField: '', requestType: src.requestType ?? '', commerce: { enabled: true, currency: 'IRR', maxPerOrder: 10 } }
    : undefined;

  const saveShared = useMutation({
    mutationFn: async () => {
      if (!settings) throw new Error('Settings not loaded');
      const id = sharedId || `${source}-${Math.random().toString(36).slice(2, 7)}`;
      const list = settings.cardDesigns ?? [];
      const entry = { id, name: name || id, source, design };
      const next: SiteSettings = { ...settings, cardDesigns: list.some((d) => d.id === id) ? list.map((d) => (d.id === id ? entry : d)) : [...list, entry] };
      const saved = await api.put<SiteSettings>(`/sites/${siteId}/settings`, next);
      qc.setQueryData(['site', siteId, 'settings'], saved);
      qc.invalidateQueries({ queryKey: ['public'] });
      return id;
    },
    onSuccess: (id) => {
      toast(t(L('Shared design saved', 'طرح مشترک ذخیره شد')));
      onApply(design, id);
    },
  });

  const set = (patch: Partial<CardBlock>) => setDesign((d) => updateBlock(d, block.id, patch));

  return (
    <Modal open onClose={onClose} title={t(L('Box designer', 'طراح باکس'))} wide="xl">
      <div className="grid gap-5 lg:grid-cols-[240px_1fr_300px]">
        {/* Blocks */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-ink-soft">{t(L('Blocks', 'بلوک‌ها'))}</p>
          <BlockTree root={design} selected={block.id} onSelect={setSelected} locale={locale} />
          <div className="flex flex-wrap gap-1">
            <IconButton label={t(L('Move up', 'بالا'))} disabled={block.id === design.id} onClick={() => setDesign((d) => moveBlock(d, block.id, -1))}>
              ↑
            </IconButton>
            <IconButton label={t(L('Move down', 'پایین'))} disabled={block.id === design.id} onClick={() => setDesign((d) => moveBlock(d, block.id, 1))}>
              ↓
            </IconButton>
            <IconButton label={t(L('Duplicate', 'تکثیر'))} disabled={block.id === design.id} onClick={() => setDesign((d) => duplicateBlock(d, block.id))}>
              ⧉
            </IconButton>
            <IconButton
              label={t(L('Delete', 'حذف'))}
              disabled={block.id === design.id}
              onClick={() => {
                const parent = findParent(design, block.id);
                setDesign((d) => removeBlock(d, block.id));
                setSelected(parent?.id ?? design.id);
              }}
            >
              ✕
            </IconButton>
          </div>
          <SelectField
            label={t(L('Add a block', 'افزودن بلوک'))}
            value={'' as string}
            onChange={(type) => {
              if (!type) return;
              const b = newBlock(type as BlockType, type === 'button' ? { label: L('View', 'مشاهده') } : type === 'text' ? { field: 'title' } : type === 'stack' ? { direction: 'row', gap: 2 } : {});
              setDesign((d) => insertBlock(d, block.id, b));
              setSelected(b.id);
            }}
            options={[{ value: '', label: '+' }, ...BLOCK_TYPES.map((x) => ({ value: x, label: t(TYPE_LABELS[x]) }))]}
          />
          <p className="text-xs text-ink-soft">{t(L('New blocks go inside the selected row/column, or after the selected block.', 'بلوک جدید داخل ردیف/ستون انتخاب‌شده یا بعد از بلوک انتخاب‌شده اضافه می‌شود.'))}</p>
        </div>

        {/* Preview */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <SelectField
              label={t(L('Preview item', 'آیتم پیش‌نمایش'))}
              value={String(sample)}
              onChange={(v) => setSample(Number(v))}
              options={
                samples.length
                  ? samples.map((s, i) => ({ value: String(i), label: `${l(s.title) || s.slug}${s.status === 'draft' ? ` (${t(L('draft', 'پیش‌نویس'))})` : ''}` }))
                  : [{ value: '0', label: t(L('No items yet', 'هنوز آیتمی نیست')) }]
              }
            />
            <SelectField
              label={t(L('Width', 'عرض'))}
              value={previewWidth}
              onChange={setPreviewWidth}
              options={[
                { value: 'card', label: t(L('One box', 'یک باکس')) },
                { value: 'wide', label: t(L('Full width', 'تمام‌عرض')) },
              ]}
            />
          </div>
          <div className="rounded-md border border-dashed border-line bg-surface p-6">
            <div className={cn('mx-auto', previewWidth === 'card' ? 'max-w-[340px]' : 'w-full')}>
              {item ? (
                <CardView block={design} item={item} collection={collection} inert selected={block.id} onSelect={setSelected} />
              ) : (
                <p className="py-10 text-center text-sm text-ink-soft">{t(L('Add an item to this table to see a preview.', 'برای دیدن پیش‌نمایش یک آیتم به این جدول اضافه کنید.'))}</p>
              )}
            </div>
          </div>
          <p className="text-xs text-ink-soft">{t(L('Click a block in the preview to select it.', 'برای انتخاب، روی بلوک در پیش‌نمایش کلیک کنید.'))}</p>
          {drafts > 0 && (
            <p className="border-s-2 border-accent ps-3 text-xs text-ink">
              {t(L('Draft items are shown here for designing, but the site shows only published items.', 'آیتم‌های پیش‌نویس فقط اینجا برای طراحی دیده می‌شوند؛ سایت فقط آیتم‌های منتشرشده را نشان می‌دهد.'))}
            </p>
          )}
        </div>

        {/* Settings of the selected block */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-ink-soft">{t(TYPE_LABELS[block.type])}</p>
          <BlockSettings siteId={siteId} block={block} fields={fields} set={set} isRoot={block.id === design.id} />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-line pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <TextField label={t(L('Shared design name', 'نام طرح مشترک'))} value={name} onChange={setName} />
          <Button variant="outline" size="sm" onClick={() => saveShared.mutate()} disabled={saveShared.isPending}>
            {sharedId ? t(L('Save the shared design', 'ذخیره‌ی طرح مشترک')) : t(L('Save as shared design', 'ذخیره به‌عنوان طرح مشترک'))}
          </Button>
        </div>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onClose}>
            {t(L('Cancel', 'انصراف'))}
          </Button>
          <Button onClick={() => onApply(design, '')}>{t(L('Use for this list', 'استفاده برای همین لیست'))}</Button>
        </div>
      </div>
      {sharedId && <p className="mt-2 text-xs text-ink-soft">{t(L('Saving the shared design changes every list that uses it.', 'ذخیره‌ی طرح مشترک همه‌ی لیست‌هایی را که از آن استفاده می‌کنند تغییر می‌دهد.'))}</p>}
    </Modal>
  );
}

function BlockTree({ root, selected, onSelect, locale, depth = 0 }: { root: CardBlock; selected: string; onSelect: (id: string) => void; locale: 'en' | 'fa'; depth?: number }) {
  const label = root.type === 'stack' ? (root.direction === 'row' ? L('Row', 'ردیف') : L('Column', 'ستون')) : TYPE_LABELS[root.type];
  const detail = root.type === 'text' || root.type === 'badge' ? (root.source === 'field' ? root.field : root.text[locale] || root.text.en) : root.type === 'button' ? root.label[locale] || root.action : root.type === 'image' ? root.field : '';
  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(root.id)}
        className={cn('flex w-full items-center gap-2 truncate rounded px-2 py-1 text-start text-sm', selected === root.id ? 'bg-ink text-bg' : 'hover:bg-surface-2')}
        style={{ paddingInlineStart: `${depth * 14 + 8}px` }}
      >
        <span>{label[locale]}</span>
        {detail && <span className="truncate text-xs opacity-60">{detail}</span>}
      </button>
      {root.children.map((c) => (
        <BlockTree key={c.id} root={c} selected={selected} onSelect={onSelect} locale={locale} depth={depth + 1} />
      ))}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-end gap-2">
      <TextField label={label} dir="ltr" value={value} onChange={(x) => onChange(x.trim())} className="flex-1" />
      <input type="color" aria-label={label} value={value || '#000000'} onChange={(e) => onChange(e.target.value)} className="mb-0.5 h-9 w-10 shrink-0 rounded border border-line" />
      {value && (
        <button type="button" onClick={() => onChange('')} className="mb-2 text-xs text-ink-soft">
          ✕
        </button>
      )}
    </div>
  );
}

function BlockSettings({ siteId, block, fields, set, isRoot }: { siteId: string; block: CardBlock; fields: CollectionField[]; set: (p: Partial<CardBlock>) => void; isRoot: boolean }) {
  const { locale, l } = usePreferences();
  const t = (x: Lbl) => x[locale];
  const { data: settings } = useAdminSettings(siteId);
  const fieldOptions = (types?: CollectionField['type'][]) => [
    ...(types ? [] : [{ value: 'title', label: t(L('Title', 'عنوان')) }]),
    ...fields.filter((f) => !types || types.includes(f.type)).map((f) => ({ value: f.key, label: `${l(f.label) || f.key} (${f.key})` })),
  ];
  const num = (label: Lbl, key: 'gap' | 'padding' | 'radius' | 'lines' | 'height' | 'imgWidth' | 'imgHeight' | 'count', max: number) => (
    <NumberField label={t(label)} value={block[key]} min={0} onChange={(v) => set({ [key]: Math.max(0, Math.min(max, v ?? 0)) })} />
  );
  const alignOptions = [
    { value: 'start' as const, label: t(L('Like its row / column', 'مثل ردیف / ستون خودش')) },
    { value: 'right' as const, label: t(L('Right', 'راست‌چین')) },
    { value: 'left' as const, label: t(L('Left', 'چپ‌چین')) },
    { value: 'center' as const, label: t(L('Center', 'وسط‌چین')) },
  ];
  const textLook = (
    <>
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label={t(L('Style', 'سبک'))}
          value={block.textStyle}
          onChange={(textStyle) => set({ textStyle })}
          options={TEXT_STYLES.map((s) => ({ value: s, label: t({ title: L('Title', 'تیتر'), subtitle: L('Subtitle', 'زیرتیتر'), body: L('Body', 'متن'), small: L('Small', 'کوچک'), eyebrow: L('Eyebrow', 'برچسب بالا') }[s]) }))}
        />
        <SelectField
          label={t(L('Size', 'اندازه'))}
          value={block.size}
          onChange={(size) => set({ size })}
          options={(['sm', 'md', 'lg', 'xl'] as const).map((s) => ({ value: s, label: s.toUpperCase() }))}
        />
        <SelectField
          label={t(L('Weight', 'ضخامت'))}
          value={block.weight}
          onChange={(weight) => set({ weight })}
          options={[
            { value: 'normal', label: t(L('Normal', 'معمولی')) },
            { value: 'medium', label: t(L('Medium', 'متوسط')) },
            { value: 'bold', label: t(L('Bold', 'ضخیم')) },
          ]}
        />
        <SelectField label={t(L('Align', 'چینش'))} value={block.textAlign} onChange={(textAlign) => set({ textAlign })} options={alignOptions} />
      </div>
      <ColorField label={t(L('Text colour', 'رنگ متن'))} value={block.color} onChange={(color) => set({ color })} />
    </>
  );

  return (
    <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pe-1">
      {!isRoot && (
        <SelectField
          label={t(L('Width in its row', 'عرض در ردیف'))}
          value={block.width}
          onChange={(width) => set({ width })}
          options={BLOCK_WIDTHS.map((w) => ({ value: w, label: w === 'auto' ? t(L('Automatic', 'خودکار')) : w === 'full' ? t(L('Full', 'کامل')) : w }))}
        />
      )}

      {block.type === 'stack' && (
        <>
          <SelectField
            label={t(L('Direction', 'جهت'))}
            value={block.direction}
            onChange={(direction) => set({ direction })}
            options={[
              { value: 'column', label: t(L('Column (top to bottom)', 'ستون (بالا به پایین)')) },
              { value: 'row', label: t(L('Row (side by side)', 'ردیف (کنار هم)')) },
            ]}
          />
          <div className="grid grid-cols-2 gap-2">
            {num(L('Gap', 'فاصله'), 'gap', 12)}
            {num(L('Padding', 'حاشیه داخلی'), 'padding', 12)}
            {num(L('Corner radius (px)', 'گردی گوشه (px)'), 'radius', 48)}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SelectField
              label={t(L('Align items', 'چینش آیتم‌ها'))}
              value={block.align}
              onChange={(align) => set({ align })}
              options={[
                { value: 'stretch', label: t(L('Stretch', 'کشیده')) },
                { value: 'start', label: t(L('Start', 'ابتدا')) },
                { value: 'center', label: t(L('Center', 'وسط')) },
                { value: 'end', label: t(L('End', 'انتها')) },
              ]}
            />
            <SelectField
              label={t(L('Spread', 'پخش'))}
              value={block.justify}
              onChange={(justify) => set({ justify })}
              options={[
                { value: 'start', label: t(L('Start', 'ابتدا')) },
                { value: 'center', label: t(L('Center', 'وسط')) },
                { value: 'end', label: t(L('End', 'انتها')) },
                { value: 'between', label: t(L('Space between', 'فاصله‌ی مساوی')) },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SelectField
              label={t(L('Writing direction', 'جهت نوشتن'))}
              value={block.dir}
              onChange={(dir) => set({ dir })}
              options={[
                { value: 'auto', label: t(L('Site language', 'زبان سایت')) },
                { value: 'rtl', label: t(L('Right to left', 'راست به چپ')) },
                { value: 'ltr', label: t(L('Left to right', 'چپ به راست')) },
              ]}
            />
            <SelectField
              label={t(L('Text alignment inside', 'چینش متن‌های داخل'))}
              value={block.textAlign}
              onChange={(textAlign) => set({ textAlign })}
              options={[{ value: 'start', label: t(L(isRoot ? 'Site default' : 'Like the outer block', isRoot ? 'پیش‌فرض سایت' : 'مثل بلوک بیرونی')) }, ...alignOptions.slice(1)]}
            />
          </div>
          <p className="text-xs text-ink-soft">
            {t(L('Texts set to “like its row / column” follow this alignment, so the whole box can be aligned here at once.', 'متن‌هایی که چینش آن‌ها «مثل ردیف / ستون خودش» است از این چینش پیروی می‌کنند؛ پس کل باکس را می‌شود همین‌جا یک‌جا راست‌چین یا چپ‌چین کرد.'))}
          </p>
          <ColorField label={t(L('Background', 'پس‌زمینه'))} value={block.background} onChange={(background) => set({ background })} />
          <Checkbox label={t(L('Border', 'کادر'))} checked={block.border} onChange={(border) => set({ border })} />
          <Checkbox label={t(L('Shadow', 'سایه'))} checked={block.shadow} onChange={(shadow) => set({ shadow })} />
          <Checkbox label={t(L('Wrap to the next line', 'رفتن به خط بعد'))} checked={block.wrap} onChange={(wrap) => set({ wrap })} />
          <Checkbox label={t(L('Whole block opens the item page', 'کل بلوک صفحه‌ی آیتم را باز کند'))} checked={block.linkToItem} onChange={(linkToItem) => set({ linkToItem })} />
        </>
      )}

      {block.type === 'image' && (
        <>
          <SelectField
            label={t(L('Image from', 'تصویر از'))}
            value={block.field}
            onChange={(field) => set({ field })}
            options={[{ value: '', label: t(L('Main image', 'تصویر اصلی')) }, { value: '*', label: t(L('All image fields', 'همه‌ی فیلدهای تصویر')) }, ...fieldOptions(['image', 'gallery', 'reference'])]}
          />
          <fieldset className="flex flex-col gap-2 rounded-md border border-line p-2">
            <legend className="px-1 text-xs text-ink-soft">{t(L('When there are several images', 'وقتی چند تصویر هست'))}</legend>
            <SelectField
              label={t(L('Show', 'نمایش'))}
              value={block.images}
              onChange={(images) => set({ images })}
              options={[
                { value: 'first', label: t(L('Only the first', 'فقط اولی')) },
                { value: 'all', label: t(L('All of them', 'همه')) },
                { value: 'pick', label: t(L('Chosen ones', 'انتخابی')) },
              ]}
            />
            {block.images === 'pick' && (
              <TextField
                label={t(L('Image numbers', 'شماره‌ی تصویرها'))}
                dir="ltr"
                value={block.pick}
                onChange={(pick) => set({ pick })}
                hint={t(L('In order, separated by commas, e.g. 1,3,4', 'به ترتیب و با ویرگول جدا، مثلاً 1,3,4'))}
              />
            )}
            {block.images !== 'first' && (
              <>
                {num(L('At most (0 = no limit)', 'حداکثر تعداد (۰ = بدون محدودیت)'), 'count', 30)}
                <SelectField
                  label={t(L('Layout', 'چیدمان'))}
                  value={block.display}
                  onChange={(display) => set({ display })}
                  options={[
                    { value: 'grid', label: t(L('Grid', 'شبکه‌ای')) },
                    { value: 'slider', label: t(L('Slider (one at a time)', 'اسلایدر (یکی‌یکی)')) },
                    { value: 'row', label: t(L('Row (scrolls sideways)', 'ردیفی (اسکرول افقی)')) },
                    { value: 'stack', label: t(L('Below each other', 'زیر هم')) },
                  ]}
                />
                {block.display === 'grid' && (
                  <NumberField label={t(L('Images per row', 'تعداد در هر ردیف'))} value={block.columns} min={1} onChange={(v) => set({ columns: Math.max(1, Math.min(6, v ?? 1)) })} />
                )}
                {block.display !== 'slider' && num(L('Gap', 'فاصله'), 'gap', 12)}
              </>
            )}
          </fieldset>
          <div className="grid grid-cols-2 gap-2">
            {num(L('Width px (0 = automatic)', 'عرض px (۰ = خودکار)'), 'imgWidth', 2000)}
            {num(L('Height px (0 = from shape)', 'ارتفاع px (۰ = طبق نسبت)'), 'imgHeight', 2000)}
          </div>
          <SelectField
            label={t(L('Shape', 'نسبت'))}
            value={block.ratio}
            onChange={(ratio) => set({ ratio })}
            options={[
              { value: 'landscape', label: '4:3' },
              { value: 'wide', label: '16:9' },
              { value: 'square', label: '1:1' },
              { value: 'portrait', label: '3:4' },
              { value: 'auto', label: t(L('Original shape', 'نسبت اصلی تصویر')) },
            ]}
          />
          <SelectField
            label={t(L('How it fills the frame', 'نحوه‌ی پر کردن قاب'))}
            value={block.fit}
            onChange={(fit) => set({ fit })}
            options={[
              { value: 'cover', label: t(L('Fill the frame (edges cropped)', 'پر کردن قاب (لبه‌ها برش می‌خورد)')) },
              { value: 'contain', label: t(L('Whole image (may leave space)', 'کل تصویر (ممکن است جای خالی بماند)')) },
              { value: 'fill', label: t(L('Stretch to the frame', 'کشیده تا اندازه‌ی قاب')) },
            ]}
          />
          {block.fit === 'cover' && (
            <SelectField
              label={t(L('Part kept in view', 'بخشی که دیده شود'))}
              value={block.position}
              onChange={(position) => set({ position })}
              options={[
                { value: 'center', label: t(L('Center', 'وسط')) },
                { value: 'top', label: t(L('Top', 'بالا')) },
                { value: 'bottom', label: t(L('Bottom', 'پایین')) },
                { value: 'right', label: t(L('Right', 'راست')) },
                { value: 'left', label: t(L('Left', 'چپ')) },
              ]}
            />
          )}
          {num(L('Corner radius (px)', 'گردی گوشه (px)'), 'radius', 48)}
        </>
      )}

      {(block.type === 'text' || block.type === 'badge') && (
        <>
          <SelectField
            label={t(L('Content', 'محتوا'))}
            value={block.source}
            onChange={(source) => set({ source })}
            options={[
              { value: 'field', label: t(L('A field of the item', 'یک فیلد آیتم')) },
              { value: 'static', label: t(L('Fixed text', 'متن ثابت')) },
            ]}
          />
          {block.source === 'field' ? (
            <>
              <SelectField label={t(L('Field', 'فیلد'))} value={block.field} onChange={(field) => set({ field })} options={fieldOptions()} />
              <Checkbox label={t(L('Show the field name before the value', 'نمایش نام فیلد قبل از مقدار'))} checked={block.showLabel} onChange={(showLabel) => set({ showLabel })} />
              {block.showLabel && <LocalizedField label={t(L('Name shown (empty = field name)', 'نام نمایشی (خالی = نام فیلد)'))} value={block.label} onChange={(label) => set({ label })} />}
            </>
          ) : (
            <>
              <LocalizedField label={t(L('Text', 'متن'))} value={block.text} onChange={(text) => set({ text })} multiline rows={3} />
              <p className="text-xs text-ink-soft">{t(L('Use {{key}} to insert a field, e.g. {{title}}.', 'برای درج فیلد از {{key}} استفاده کنید، مثلاً {{title}}.'))}</p>
            </>
          )}
          {block.type === 'text' && num(L('Cut after lines (0 = never)', 'برش بعد از چند خط (۰ = هرگز)'), 'lines', 10)}
          {block.type === 'badge' && <ColorField label={t(L('Background', 'پس‌زمینه'))} value={block.background} onChange={(background) => set({ background })} />}
          {textLook}
        </>
      )}

      {(block.type === 'price' || block.type === 'capacity') && textLook}

      {block.type === 'button' && (
        <>
          <SelectField label={t(L('What it does', 'عملکرد'))} value={block.action} onChange={(action) => set({ action })} options={BLOCK_ACTIONS.map((a) => ({ value: a, label: t(ACTION_LABELS[a]) }))} />
          <LocalizedField label={t(L('Label (empty = default)', 'متن دکمه (خالی = پیش‌فرض)'))} value={block.label} onChange={(label) => set({ label })} />
          {block.action === 'request' && (
            <>
              <SelectField
                label={t(L('Request type', 'نوع درخواست'))}
                value={block.requestType}
                onChange={(requestType) => set({ requestType })}
                options={[{ value: '', label: t(L('The table’s default', 'پیش‌فرض جدول')) }, ...(settings?.requestTypes ?? DEFAULT_REQUEST_TYPES).map((x) => ({ value: x.slug, label: l(x.label) || x.slug }))]}
              />
              <LinkPicker siteId={siteId} label={t(L('Page with the request form (empty = /contact)', 'صفحه‌ی فرم درخواست (خالی = /contact)'))} value={block.href} onChange={(href) => set({ href })} />
            </>
          )}
          {(block.action === 'link' || block.action === 'call') && (
            <>
              <SelectField
                label={t(L('Address from', 'آدرس از'))}
                value={block.source}
                onChange={(source) => set({ source })}
                options={[
                  { value: 'static', label: t(L('A fixed link', 'لینک ثابت')) },
                  { value: 'field', label: t(L('A field of the item', 'یک فیلد آیتم')) },
                ]}
              />
              {block.source === 'field' ? (
                <SelectField label={t(L('Field', 'فیلد'))} value={block.field} onChange={(field) => set({ field })} options={fieldOptions(['link', 'email', 'phone'])} />
              ) : block.action === 'call' ? (
                <TextField label={t(L('Phone number', 'شماره تلفن'))} dir="ltr" value={block.href} onChange={(href) => set({ href })} />
              ) : (
                <LinkPicker siteId={siteId} label={t(L('Link', 'لینک'))} value={block.href} onChange={(href) => set({ href })} />
              )}
              <Checkbox label={t(L('Open in a new tab', 'باز شدن در تب جدید'))} checked={block.newTab} onChange={(newTab) => set({ newTab })} />
            </>
          )}
          <SelectField
            label={t(L('Look', 'ظاهر'))}
            value={block.variant}
            onChange={(variant) => set({ variant })}
            options={[
              { value: 'primary', label: t(L('Filled', 'توپر')) },
              { value: 'secondary', label: t(L('Outline', 'خطی')) },
              { value: 'link', label: t(L('Text link', 'لینک متنی')) },
            ]}
          />
        </>
      )}

      {block.type === 'spacer' && num(L('Height (px)', 'ارتفاع (px)'), 'height', 200)}
    </div>
  );
}
