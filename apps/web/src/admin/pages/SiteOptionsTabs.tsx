import {
  BUILT_IN_ORDER_STATUSES,
  CURRENCIES,
  EN_FONTS,
  FA_FONTS,
  FORM_FIELD_TYPES,
  IMAGE_RATIOS,
  SORT_OPTIONS,
  THEME_COLOR_KEYS,
  type FormField,
  type FormType,
  type SiteSettings,
  type ThemeColorKey,
} from '@site-builder/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import { flattenMessages } from '../../lib/siteLook';
import { en as enMessages } from '../../locales/en';
import { fa as faMessages } from '../../locales/fa';
import type { Localized } from '../../types/site';
import { useT, type AdminStrings } from '../i18n';
import { ButtonsEditor, LinkPicker } from '../links';
import { Card, Checkbox, ListEditor, LocalizedField, NumberField, SelectField, TextField } from '../ui';

type Set = <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => void;
interface TabProps {
  s: SiteSettings;
  set: Set;
  siteId: string;
}
const empty: Localized = { en: '', fa: '' };
const toSlug = (v: string) => v.toLowerCase().replace(/[^a-z0-9_-]/g, '');

/* ---------- design ---------- */

const colorLabel = (t: AdminStrings): Record<ThemeColorKey, string> => ({
  bg: t.colorBg,
  surface: t.colorSurface,
  surface2: t.colorSurface2,
  ink: t.colorInk,
  inkSoft: t.colorInkSoft,
  line: t.colorLine,
  accent: t.colorAccent,
  accentInk: t.colorAccentInk,
  accentSoft: t.colorAccentSoft,
});

/** A new theme starts from the ivory colours. */
const IVORY: Record<ThemeColorKey, string> = {
  bg: '#f6f2ec',
  surface: '#fdfbf8',
  surface2: '#ece5db',
  ink: '#1d1b18',
  inkSoft: '#5a544c',
  line: '#ddd4c7',
  accent: '#8a6a43',
  accentInk: '#fdfbf8',
  accentSoft: '#e9dccb',
};

export function DesignTab({ s, set }: TabProps) {
  const t = useT();
  const fonts = s.design.fonts;
  const setFonts = (patch: Partial<typeof fonts>) => set('design', { ...s.design, fonts: { ...fonts, ...patch } });
  const labels = colorLabel(t);
  return (
    <>
      <Card title={t.fonts}>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label={t.fontEnDisplay} value={fonts.enDisplay} onChange={(enDisplay) => setFonts({ enDisplay })} options={EN_FONTS.map((f) => ({ value: f, label: f }))} />
          <SelectField label={t.fontEnBody} value={fonts.enBody} onChange={(enBody) => setFonts({ enBody })} options={EN_FONTS.map((f) => ({ value: f, label: f }))} />
          <SelectField label={t.fontFaDisplay} value={fonts.faDisplay} onChange={(faDisplay) => setFonts({ faDisplay })} options={FA_FONTS.map((f) => ({ value: f, label: f }))} />
          <SelectField label={t.fontFaBody} value={fonts.faBody} onChange={(faBody) => setFonts({ faBody })} options={FA_FONTS.map((f) => ({ value: f, label: f }))} />
        </div>
      </Card>
      <p className="text-sm text-ink-soft">{t.customThemesHint}</p>
      <ListEditor
        label={t.customThemes}
        items={s.design.themes}
        max={10}
        onChange={(themes) => set('design', { ...s.design, themes })}
        create={() => ({ id: `theme-${s.design.themes.length + 1}`, name: { ...empty }, colors: { ...IVORY } })}
        render={(theme, update) => (
          <>
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <TextField label={t.themeId} dir="ltr" value={theme.id} onChange={(id) => update({ ...theme, id: toSlug(id) })} />
              <LocalizedField label={t.themeName} value={theme.name} onChange={(name) => update({ ...theme, name })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {THEME_COLOR_KEYS.map((k) => (
                <label key={k} className="flex items-center gap-3 text-xs text-ink-soft">
                  <input
                    type="color"
                    value={theme.colors[k]}
                    onChange={(e) => update({ ...theme, colors: { ...theme.colors, [k]: e.target.value } })}
                    className="h-9 w-12 shrink-0 rounded border border-line"
                  />
                  {labels[k]}
                </label>
              ))}
            </div>
            <div className="flex items-center gap-3 rounded-md border border-line p-4" style={{ background: theme.colors.bg, color: theme.colors.ink }}>
              <span className="font-display text-lg">Aa</span>
              <span className="text-sm" style={{ color: theme.colors.inkSoft }}>
                {name(theme.name) || theme.id}
              </span>
              <span className="ms-auto rounded-full px-3 py-1 text-xs" style={{ background: theme.colors.accent, color: theme.colors.accentInk }}>
                {t.colorAccent}
              </span>
            </div>
          </>
        )}
      />
    </>
  );
}
const name = (v: Localized) => v.fa || v.en;

/* ---------- texts ---------- */

const ALL_TEXTS = (() => {
  const fa = new Map(flattenMessages(faMessages));
  return flattenMessages(enMessages).map(([key, en]) => ({ key, en, fa: fa.get(key) ?? '' }));
})();

export function TextsTab({ s, set }: TabProps) {
  const t = useT();
  const [q, setQ] = useState('');
  const [changedOnly, setChangedOnly] = useState(false);
  const [limit, setLimit] = useState(60);
  const texts = s.texts;
  const query = q.trim().toLowerCase();
  const rows = useMemo(
    () =>
      ALL_TEXTS.filter((r) => {
        const own = texts[r.key];
        if (changedOnly && !(own?.en || own?.fa)) return false;
        return !query || [r.key, r.en, r.fa, own?.en ?? '', own?.fa ?? ''].some((x) => x.toLowerCase().includes(query));
      }),
    [texts, query, changedOnly],
  );
  const update = (key: string, v: { en: string; fa: string }) => {
    const next = { ...texts };
    if (v.en || v.fa) next[key] = v;
    else delete next[key];
    set('texts', next);
  };
  return (
    <>
      <p className="text-sm text-ink-soft">{t.textsHint}</p>
      <div className="flex flex-wrap items-end gap-4">
        <TextField label={t.searchTexts} value={q} onChange={setQ} className="w-72" />
        <Checkbox label={t.changedOnly} checked={changedOnly} onChange={setChangedOnly} />
      </div>
      <div className="flex flex-col divide-y divide-line border border-line bg-surface">
        {rows.slice(0, limit).map((r) => {
          const own = texts[r.key] ?? { en: '', fa: '' };
          return (
            <div key={r.key} className="grid gap-2 p-3 sm:grid-cols-[200px_1fr_1fr]">
              <code className="self-center text-xs break-all text-ink-soft" dir="ltr">
                {r.key}
              </code>
              <input
                aria-label={`${r.key} (English)`}
                dir="ltr"
                value={own.en}
                placeholder={r.en}
                onChange={(e) => update(r.key, { ...own, en: e.target.value })}
                className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-ink-soft/50"
              />
              <input
                aria-label={`${r.key} (فارسی)`}
                dir="rtl"
                value={own.fa}
                placeholder={r.fa}
                onChange={(e) => update(r.key, { ...own, fa: e.target.value })}
                className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-ink-soft/50"
              />
            </div>
          );
        })}
      </div>
      {rows.length > limit && (
        <button type="button" onClick={() => setLimit((n) => n + 100)} className="self-start text-sm text-ink-soft underline">
          {t.showMore} ({rows.length - limit})
        </button>
      )}
    </>
  );
}

/* ---------- forms ---------- */

/** The built-in questions of a preset form, as fields the owner can then change freely. */
export function presetFields(form: FormType, options: SiteSettings['formOptions']): FormField[] {
  const f = (id: string, type: FormField['type'], label: Localized, required = false, choices: Localized[] = []): FormField => ({ id, type, label, help: { ...empty }, required, options: choices });
  const L = (pick: (m: typeof enMessages) => string): Localized => ({ en: pick(enMessages), fa: pick(faMessages as typeof enMessages) });
  const phone = f('phone', 'tel', L((m) => m.form.phone));
  if (form === 'consultation')
    return [phone, f('project-type', 'select', L((m) => m.form.projectType), true, options.projectTypes.map((c) => c.label)), f('budget', 'select', L((m) => m.form.budget), false, options.budgets.map((c) => c.label)), f('message', 'textarea', L((m) => m.form.message), true)];
  if (form === 'reservation')
    return [phone, f('date', 'date', L((m) => m.form.date), true), f('time', 'time', L((m) => m.form.time), true), f('people', 'number', L((m) => m.form.people), true), f('notes', 'textarea', L((m) => m.form.notes))];
  if (form === 'demo') return [phone, f('company', 'text', L((m) => m.form.company)), f('date', 'date', L((m) => m.form.date), true), f('notes', 'textarea', L((m) => m.form.notes))];
  return [phone, f('message', 'textarea', L((m) => m.form.messageGeneral), true)];
}

export function FormFieldsEditor({ value, onChange }: { value: FormField[]; onChange: (v: FormField[]) => void }) {
  const t = useT();
  return (
    <ListEditor
      label={t.formFields}
      items={value}
      max={30}
      onChange={onChange}
      create={() => ({ id: `field-${value.length + 1}`, type: 'text' as const, label: { ...empty }, help: { ...empty }, required: false, options: [] })}
      render={(f, update) => (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label={t.fieldId} dir="ltr" value={f.id} onChange={(id) => update({ ...f, id: toSlug(id) })} />
            <SelectField label={t.fieldType} value={f.type} onChange={(type) => update({ ...f, type })} options={FORM_FIELD_TYPES.map((x) => ({ value: x, label: x }))} />
          </div>
          <LocalizedField label={t.fieldLabel} value={f.label} onChange={(label) => update({ ...f, label })} />
          <LocalizedField label={t.fieldHelp} value={f.help} onChange={(help) => update({ ...f, help })} />
          <Checkbox label={t.fieldRequired} checked={f.required} onChange={(required) => update({ ...f, required })} />
          {(f.type === 'select' || f.type === 'radio') && (
            <ListEditor label={t.fieldOptions} items={f.options} max={30} onChange={(options) => update({ ...f, options })} create={() => ({ ...empty })} render={(o, up) => <LocalizedField label={t.fieldOptions} value={o} onChange={up} />} />
          )}
        </>
      )}
    />
  );
}

export function FormChoicesEditor({ s, set }: TabProps) {
  const t = useT();
  const opts = s.formOptions;
  const choices = (key: 'projectTypes' | 'budgets', label: string) => (
    <ListEditor
      label={label}
      items={opts[key]}
      max={30}
      onChange={(v) => set('formOptions', { ...opts, [key]: v })}
      create={() => ({ value: `option-${opts[key].length + 1}`, label: { ...empty } })}
      render={(c, update) => (
        <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
          <TextField label={t.choiceValue} dir="ltr" value={c.value} onChange={(value) => update({ ...c, value: toSlug(value) })} />
          <LocalizedField label={t.label} value={c.label} onChange={(l) => update({ ...c, label: l })} />
        </div>
      )}
    />
  );
  return (
    <Card title={t.formChoices}>
      <div className="flex flex-col gap-6">
        {choices('projectTypes', t.projectTypesLabel)}
        {choices('budgets', t.budgetsLabel)}
      </div>
    </Card>
  );
}

/* ---------- header & footer ---------- */

export function HeaderTab({ s, set, siteId }: TabProps) {
  const t = useT();
  const h = s.header;
  const up = (patch: Partial<typeof h>) => set('header', { ...h, ...patch });
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label={t.headerBrand}
          value={h.brand}
          onChange={(brand) => up({ brand })}
          options={[
            { value: 'auto', label: t.brandAuto },
            { value: 'logo', label: t.brandLogo },
            { value: 'name', label: t.brandName },
            { value: 'both', label: t.brandBoth },
          ]}
        />
        <SelectField
          label={t.headerLayout}
          value={h.layout}
          onChange={(layout) => up({ layout })}
          options={[
            { value: 'standard', label: t.layoutStandard },
            { value: 'centered', label: t.layoutCentered },
            { value: 'menu-start', label: t.layoutMenuStart },
          ]}
        />
        <SelectField
          label={t.headerSize}
          value={h.size}
          onChange={(size) => up({ size })}
          options={[
            { value: 'compact', label: t.sizeCompact },
            { value: 'normal', label: t.sizeNormal },
            { value: 'large', label: t.sizeLarge },
          ]}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Checkbox label={t.showMenu} checked={h.showMenu} onChange={(showMenu) => up({ showMenu })} />
        <Checkbox label={t.showCart} checked={h.showCart} onChange={(showCart) => up({ showCart })} />
        <Checkbox label={t.showLanguage} checked={h.showLanguage} onChange={(showLanguage) => up({ showLanguage })} />
        <Checkbox label={t.showTheme} checked={h.showTheme} onChange={(showTheme) => up({ showTheme })} />
        <Checkbox label={t.showButton} checked={h.showButton} onChange={(showButton) => up({ showButton })} />
        <Checkbox label={t.transparentOverHero} checked={h.transparentOverHero} onChange={(transparentOverHero) => up({ transparentOverHero })} />
      </div>
      <ButtonsEditor siteId={siteId} label={t.headerButtons} value={h.buttons} onChange={(buttons) => up({ buttons: buttons.slice(0, 4) })} />
    </>
  );
}

export function FooterTab({ s, set, siteId }: TabProps) {
  const t = useT();
  const f = s.footer;
  const up = (patch: Partial<typeof f>) => set('footer', { ...f, ...patch });
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Checkbox label={t.showLogo} checked={f.showLogo} onChange={(showLogo) => up({ showLogo })} />
        <Checkbox label={t.showBrand} checked={f.showBrand} onChange={(showBrand) => up({ showBrand })} />
        <Checkbox label={t.showTagline} checked={f.showTagline} onChange={(showTagline) => up({ showTagline })} />
        <Checkbox label={t.showSocial} checked={f.showSocial} onChange={(showSocial) => up({ showSocial })} />
        <Checkbox label={t.showFooterMenu} checked={f.showMenu} onChange={(showMenu) => up({ showMenu })} />
        <Checkbox label={t.showContact} checked={f.showContact} onChange={(showContact) => up({ showContact })} />
      </div>
      <ListEditor
        label={t.footerColumns}
        items={f.columns}
        max={6}
        onChange={(columns) => up({ columns })}
        create={() => ({ title: { ...empty }, text: { ...empty }, links: [] })}
        render={(c, update) => (
          <>
            <LocalizedField label={t.columnTitle} value={c.title} onChange={(title) => update({ ...c, title })} />
            <LocalizedField label={t.columnText} value={c.text} onChange={(text) => update({ ...c, text })} multiline rows={3} />
            <ListEditor
              label={t.columnLinks}
              items={c.links}
              max={12}
              onChange={(links) => update({ ...c, links })}
              create={() => ({ label: { ...empty }, href: '' })}
              render={(x, upd) => (
                <>
                  <LocalizedField label={t.label} value={x.label} onChange={(label) => upd({ ...x, label })} />
                  <LinkPicker siteId={siteId} label={t.link} value={x.href} onChange={(href) => upd({ ...x, href })} />
                </>
              )}
            />
          </>
        )}
      />
      <LocalizedField label={t.copyright} value={f.copyright} onChange={(copyright) => up({ copyright })} />
    </>
  );
}

/* ---------- shop page ---------- */

export function ShopPageTab({ s, set }: TabProps) {
  const t = useT();
  const { m } = usePreferences();
  const p = s.shopPage;
  const up = (patch: Partial<typeof p>) => set('shopPage', { ...p, ...patch });
  const card = p.card;
  const upCard = (patch: Partial<typeof card>) => up({ card: { ...card, ...patch } });
  const sortName = { featured: m.products.sortFeatured, 'price-asc': m.products.sortPriceAsc, 'price-desc': m.products.sortPriceDesc, newest: m.products.sortNewest, name: m.products.sortName };
  return (
    <>
      <SelectField label={t.columns} value={String(p.columns)} onChange={(v) => up({ columns: Number(v) })} options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))} className="max-w-xs" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Checkbox label={t.showCategoryFilter} checked={p.showCategoryFilter} onChange={(showCategoryFilter) => up({ showCategoryFilter })} />
        <Checkbox label={t.showSearch} checked={p.showSearch} onChange={(showSearch) => up({ showSearch })} />
        <Checkbox label={t.showSort} checked={p.showSort} onChange={(showSort) => up({ showSort })} />
        <Checkbox label={t.showCount} checked={p.showCount} onChange={(showCount) => up({ showCount })} />
      </div>
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-ink-soft">{t.sortOptionsLabel}</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {SORT_OPTIONS.map((o) => (
            <Checkbox
              key={o}
              label={sortName[o]}
              checked={p.sortOptions.includes(o)}
              onChange={(on) => {
                const next = on ? [...p.sortOptions, o] : p.sortOptions.filter((x) => x !== o);
                if (next.length) up({ sortOptions: next });
              }}
            />
          ))}
        </div>
      </fieldset>
      <Card title={t.cardOptions}>
        <div className="flex flex-col gap-4">
          <SelectField
            label={t.imageRatio}
            value={card.imageRatio}
            onChange={(imageRatio) => upCard({ imageRatio })}
            options={IMAGE_RATIOS.map((r) => ({ value: r, label: { portrait: t.ratioPortrait, square: t.ratioSquare, landscape: t.ratioLandscape, tall: t.ratioTall }[r] }))}
            className="max-w-xs"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Checkbox label={t.showImage} checked={card.showImage} onChange={(showImage) => upCard({ showImage })} />
            <Checkbox label={t.showCategory} checked={card.showCategory} onChange={(showCategory) => upCard({ showCategory })} />
            <Checkbox label={t.showPrice} checked={card.showPrice} onChange={(showPrice) => upCard({ showPrice })} />
            <Checkbox label={t.showDiscount} checked={card.showDiscount} onChange={(showDiscount) => upCard({ showDiscount })} />
            <Checkbox label={t.showColors} checked={card.showColors} onChange={(showColors) => upCard({ showColors })} />
            <Checkbox label={t.showStock} checked={card.showStock} onChange={(showStock) => upCard({ showStock })} />
            <Checkbox label={t.showAddToCart} checked={card.showAddToCart} onChange={(showAddToCart) => upCard({ showAddToCart })} />
          </div>
        </div>
      </Card>
    </>
  );
}

/* ---------- system pages ---------- */

export function SystemPagesTab({ s, set, siteId }: TabProps) {
  const t = useT();
  const { l } = usePreferences();
  const { data: pages = [] } = useQuery({
    queryKey: ['site', siteId, 'pages'],
    queryFn: () => api.get<{ slug: string; isHome: boolean; title?: Localized }[]>(`/sites/${siteId}/pages`),
  });
  const sp = s.systemPages;
  const options = [{ value: '', label: t.noPage }, ...pages.map((p) => ({ value: p.slug, label: `${(p.title && l(p.title)) || p.slug} (/${p.slug})` }))];
  const pick = (label: string, value: string, onChange: (v: string) => void) => <SelectField label={label} value={value} onChange={onChange} options={options.some((o) => o.value === value) ? options : [...options, { value, label: value }]} />;
  type AroundKey = 'products' | 'productDetail' | 'services' | 'serviceDetail' | 'cart' | 'checkout' | 'checkoutResult';
  const around = (key: AroundKey, title: string, extra?: React.ReactNode) => (
    <Card key={key} title={title}>
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {pick(t.pageAbove, sp[key].before, (before) => set('systemPages', { ...sp, [key]: { ...sp[key], before } }))}
          {pick(t.pageBelow, sp[key].after, (after) => set('systemPages', { ...sp, [key]: { ...sp[key], after } }))}
        </div>
        {extra}
      </div>
    </Card>
  );
  const pd = sp.productDetail;
  return (
    <>
      <p className="text-sm text-ink-soft">{t.systemPagesHint}</p>
      {around('products', t.spProducts)}
      {around(
        'productDetail',
        t.spProductDetail,
        <div className="grid items-end gap-4 sm:grid-cols-3">
          <SelectField
            label={t.imageSide}
            value={pd.imageSide}
            onChange={(imageSide) => set('systemPages', { ...sp, productDetail: { ...pd, imageSide } })}
            options={[
              { value: 'start', label: t.sideStart },
              { value: 'end', label: t.sideEnd },
            ]}
          />
          <Checkbox label={t.showDetails} checked={pd.showDetails} onChange={(showDetails) => set('systemPages', { ...sp, productDetail: { ...pd, showDetails } })} />
          <Checkbox label={t.showRelated} checked={pd.showRelated} onChange={(showRelated) => set('systemPages', { ...sp, productDetail: { ...pd, showRelated } })} />
        </div>,
      )}
      {around(
        'services',
        t.spServices,
        <SelectField
          label={t.servicesLayout}
          value={sp.services.layout}
          onChange={(layout) => set('systemPages', { ...sp, services: { ...sp.services, layout } })}
          options={[
            { value: 'rows', label: t.layoutRows },
            { value: 'cards', label: t.layoutCards },
          ]}
          className="max-w-xs"
        />,
      )}
      {around('serviceDetail', t.spServiceDetail)}
      {around('cart', t.spCart)}
      {around('checkout', t.spCheckout)}
      {around('checkoutResult', t.spCheckoutResult)}
      <Card title={t.spNotFound}>{pick(t.notFoundPage, sp.notFound.page, (page) => set('systemPages', { ...sp, notFound: { page } }))}</Card>
    </>
  );
}

/* ---------- shop rules ---------- */

export function ShopTab({ s, set }: TabProps) {
  const t = useT();
  const shop = s.shop;
  const up = (patch: Partial<typeof shop>) => set('shop', { ...shop, ...patch });
  const builtIn = (slug: string) => (BUILT_IN_ORDER_STATUSES as readonly string[]).includes(slug);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label={t.currency} value={shop.currency} onChange={(currency) => up({ currency })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        <NumberField label={t.maxPerProduct} value={shop.maxPerProduct} min={1} onChange={(v) => up({ maxPerProduct: Math.max(1, Math.min(999, v ?? 50)) })} />
        <NumberField label={t.maxItemsPerOrder} value={shop.maxItemsPerOrder} min={1} onChange={(v) => up({ maxItemsPerOrder: v === null ? null : Math.max(1, Math.min(9999, v)) })} />
      </div>
      <p className="-mt-2 text-xs text-ink-soft">{t.currencyHint}</p>
      <p className="text-sm text-ink-soft">{t.orderStatusesHint}</p>
      <ListEditor
        label={t.orderStatuses}
        items={shop.orderStatuses}
        max={20}
        // The built-in stages always stay in the list.
        onChange={(orderStatuses) => up({ orderStatuses: BUILT_IN_ORDER_STATUSES.every((b) => orderStatuses.some((x) => x.slug === b)) ? orderStatuses : shop.orderStatuses })}
        create={() => ({ slug: `stage-${shop.orderStatuses.length + 1}`, label: { ...empty } })}
        render={(st, update) => (
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            {builtIn(st.slug) ? (
              <p className="self-center text-xs text-ink-soft" dir="ltr">
                {st.slug} ({t.builtIn})
              </p>
            ) : (
              <TextField label={t.statusId} dir="ltr" value={st.slug} onChange={(slug) => update({ ...st, slug: toSlug(slug) })} />
            )}
            <LocalizedField label={t.label} value={st.label} onChange={(label) => update({ ...st, label })} />
          </div>
        )}
      />
    </>
  );
}
