import {
  BUILT_IN_ORDER_STATUSES,
  CURRENCIES,
  EN_FONTS,
  FA_FONTS,
  FOOTER_COLUMNS,
  IMAGE_RATIOS,
  SORT_OPTIONS,
  SYSTEM_PAGES,
  systemPageSections,
  THEME_COLOR_KEYS,
  type SiteSettings,
  type ThemeColorKey,
} from '@site-builder/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button';
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
import { uploadFile } from '../../lib/api';
import { ImagePicker } from './FilesPage';

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

export function DesignTab({ s, set, siteId }: TabProps) {
  const t = useT();
  const { locale } = usePreferences();
  const T = (en: string, fa: string) => (locale === 'fa' ? fa : en);
  const custom = s.design.customFont ?? { name: '', url: '' };
  const [uploading, setUploading] = useState(false);
  const uploadFont = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const asset = await uploadFile<{ url: string }>(`/sites/${siteId}/assets`, form);
      set('design', { ...s.design, customFont: { name: custom.name || file.name.replace(/\.[^.]+$/, ''), url: asset.url } });
    } finally {
      setUploading(false);
    }
  };
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
        <div className="mt-6 flex flex-col gap-3 border-t border-line pt-4">
          <p className="text-sm text-ink-soft">
            {T('"custom" uses a font file of your own (woff2, woff, ttf), e.g. a licensed Persian font.', '«custom» از فایل فونت خودتان (woff2، woff، ttf) استفاده می‌کند؛ مثلاً یک فونت فارسی دارای مجوز.')}
          </p>
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
            <TextField label={T('Custom font file', 'فایل فونت دلخواه')} dir="ltr" value={custom.url} onChange={(url) => set('design', { ...s.design, customFont: { ...custom, url } })} />
            <label className="cursor-pointer rounded-full border border-line px-4 py-2 text-sm hover:bg-surface-2">
              {uploading ? '…' : T('Upload', 'بارگذاری')}
              <input type="file" accept=".woff2,.woff,.ttf,.otf" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFont(e.target.files[0])} />
            </label>
          </div>
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
            { value: 'stacked', label: usePreferencesLocale() === 'fa' ? 'لوگو بالا، منو در ردیف پایین' : 'Logo above, menu on its own row' },
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
      <LinkPicker siteId={siteId} label={t.logoLink} value={h.logoHref ?? ''} onChange={(logoHref) => up({ logoHref })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Checkbox label={t.showMenu} checked={h.showMenu} onChange={(showMenu) => up({ showMenu })} />
        <Checkbox label={t.showCart} checked={h.showCart} onChange={(showCart) => up({ showCart })} />
        <Checkbox label={t.showLanguage} checked={h.showLanguage} onChange={(showLanguage) => up({ showLanguage })} />
        <Checkbox label={t.showTheme} checked={h.showTheme} onChange={(showTheme) => up({ showTheme })} />
        <Checkbox label={t.showButton} checked={h.showButton} onChange={(showButton) => up({ showButton })} />
        <Checkbox label={t.showSearchBox} checked={h.showSearch} onChange={(showSearch) => up({ showSearch })} />
        <Checkbox label={t.showAccountLink} checked={h.showAccount} onChange={(showAccount) => up({ showAccount })} />
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
  const columnOptions = Array.from({ length: FOOTER_COLUMNS }, (_, i) => ({ value: String(i + 1), label: t.footerColumnN.replace('{n}', String(i + 1)) }));
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Checkbox label={t.showLogo} checked={f.showLogo} onChange={(showLogo) => up({ showLogo })} />
        <Checkbox label={t.showBrand} checked={f.showBrand} onChange={(showBrand) => up({ showBrand })} />
        <Checkbox label={t.showTagline} checked={f.showTagline} onChange={(showTagline) => up({ showTagline })} />
        <Checkbox label={t.showSocial} checked={f.showSocial} onChange={(showSocial) => up({ showSocial })} />
        <Checkbox label={t.showFooterMenu} checked={f.showMenu} onChange={(showMenu) => up({ showMenu })} />
        <Checkbox label={t.showFooterSubmenu} checked={f.showSubmenu} onChange={(showSubmenu) => up({ showSubmenu })} />
        <Checkbox label={t.showContact} checked={f.showContact} onChange={(showContact) => up({ showContact })} />
      </div>
      <Card title={t.footerPlacement}>
        <p className="mb-3 text-xs text-ink-soft">{t.footerPlacementHelp}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ['brand', t.footerBrandBlock],
              ['social', t.footerSocialBlock],
              ['menu', t.footerMenuBlock],
              ['contact', t.footerContactBlock],
            ] as const
          ).map(([key, label]) => (
            <SelectField
              key={key}
              label={label}
              value={String(f.placement[key])}
              onChange={(v) => up({ placement: { ...f.placement, [key]: Number(v) } })}
              options={columnOptions}
            />
          ))}
        </div>
      </Card>
      <ListEditor
        label={t.footerColumns}
        items={f.columns}
        max={6}
        onChange={(columns) => up({ columns })}
        create={() => ({ title: { ...empty }, text: { ...empty }, links: [], column: 0 })}
        render={(c, update) => (
          <>
            <SelectField
              label={t.footerColumn}
              value={String(c.column ?? 0)}
              onChange={(v) => update({ ...c, column: Number(v) })}
              options={[...columnOptions, { value: '0', label: t.footerBottomRow }]}
              className="max-w-xs"
            />
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
      <Card title={t.copyright}>
        <div className="flex flex-col gap-3">
          <Checkbox label={t.showCopyright} checked={f.showCopyright} onChange={(showCopyright) => up({ showCopyright })} />
          {f.showCopyright && (
            <>
              <LocalizedField label={t.copyright} value={f.copyright} onChange={(copyright) => up({ copyright })} />
              <p className="text-xs text-ink-soft">{t.copyrightHelp}</p>
            </>
          )}
        </div>
      </Card>
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
  const qc = useQueryClient();
  const { data: pages = [] } = useQuery({
    queryKey: ['site', siteId, 'pages'],
    queryFn: () => api.get<{ id: string; slug: string; isHome: boolean; title?: Localized }[]>(`/sites/${siteId}/pages`),
  });
  // Makes the builder page that replaces a built-in one, published straight away.
  const create = useMutation({
    mutationFn: async (key: (typeof SYSTEM_PAGES)[number]['key']) => {
      const def = SYSTEM_PAGES.find((p) => p.key === key)!;
      const sections = systemPageSections(key).map((x, i) => ({ id: `s${i + 1}`, ...x }));
      const page = await api.post<{ id: string }>(`/sites/${siteId}/pages`, { slug: def.slug, title: def.label, document: { schemaVersion: 1, sections } });
      await api.post(`/sites/${siteId}/pages/${page.id}/publish`, {});
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['site', siteId, 'pages'] }),
  });
  const ownPage = (slug: string) => pages.find((p) => p.slug === slug);
  const replaced = (key: string) => !!ownPage(SYSTEM_PAGES.find((p) => p.key === key)!.slug);
  const sp = s.systemPages;
  const options = [{ value: '', label: t.noPage }, ...pages.map((p) => ({ value: p.slug, label: `${(p.title && l(p.title)) || p.slug} (/${p.slug})` }))];
  const pick = (label: string, value: string, onChange: (v: string) => void) => <SelectField label={label} value={value} onChange={onChange} options={options.some((o) => o.value === value) ? options : [...options, { value, label: value }]} />;
  type AroundKey = 'products' | 'productDetail' | 'services' | 'serviceDetail' | 'cart' | 'checkout' | 'checkoutResult';
  const around = (key: AroundKey, title: string, extra?: React.ReactNode) => replaced(key) ? null : (
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
      <Card title={t.spOwnTitle}>
        <p className="mb-4 text-sm text-ink-soft">{t.spOwnHint}</p>
        <ul className="flex flex-col divide-y divide-line">
          {SYSTEM_PAGES.map((p) => {
            const own = ownPage(p.slug);
            return (
              <li key={p.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="text-sm text-ink">
                  {l(p.label)} <span className="text-xs text-ink-soft" dir="ltr">{p.path}</span>
                </span>
                {own ? (
                  <Link to={`/admin/sites/${siteId}/pages/${own.id}/builder`} className="text-sm underline underline-offset-4">
                    {t.spOwnEdit}
                  </Link>
                ) : (
                  <Button size="sm" variant="outline" disabled={create.isPending} onClick={() => create.mutate(p.key)}>
                    {t.spOwnCreate}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {create.error ? <p className="mt-3 text-sm text-danger">{String((create.error as Error).message)}</p> : null}
      </Card>
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
      {!replaced('notFound') && <Card title={t.spNotFound}>{pick(t.notFoundPage, sp.notFound.page, (page) => set('systemPages', { ...sp, notFound: { page } }))}</Card>}
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
        create={() => ({ slug: `stage-${shop.orderStatuses.length + 1}`, label: { ...empty }, notify: false, message: { ...empty } })}
        render={(st, update) => (
          <>
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
            <Checkbox label={t.notifyBuyer} checked={!!st.notify} onChange={(notify) => update({ ...st, notify })} />
            {st.notify && (
              <>
                <LocalizedField label={t.notifyMessage} value={st.message} onChange={(message) => update({ ...st, message })} multiline rows={2} />
                <p className="-mt-2 text-xs text-ink-soft" dir="ltr">
                  {'{{site}} {{name}} {{number}} {{stage}} {{link}}'}
                </p>
              </>
            )}
          </>
        )}
      />
      <CheckoutSettingsEditor shop={shop} up={up} />
    </>
  );
}

/** What the checkout asks, the ways of sending with their cost, and the low-stock warning. */
function CheckoutSettingsEditor({ shop, up }: { shop: SiteSettings['shop']; up: (patch: Partial<SiteSettings['shop']>) => void }) {
  const t = useT();
  const x = t.sx;
  const c = shop.checkout;
  const setC = (patch: Partial<typeof c>) => up({ checkout: { ...c, ...patch } });
  const rule = [
    { value: 'off' as const, label: x.off },
    { value: 'optional' as const, label: x.optional },
    { value: 'required' as const, label: x.required },
  ];
  const toSlug = (v: string) => v.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return (
    <>
      <Card title={x.checkout}>
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField label={x.askEmail} value={c.email} onChange={(email) => setC({ email })} options={rule} />
            <SelectField label={x.askAddress} value={c.address} onChange={(address) => setC({ address })} options={rule} />
            <SelectField label={x.askPostal} value={c.postalCode} onChange={(postalCode) => setC({ postalCode })} options={rule} />
          </div>
          <div className="flex flex-wrap gap-6">
            <Checkbox label={x.askRegion} checked={c.region} onChange={(region) => setC({ region })} />
            <Checkbox label={x.askNote} checked={c.note} onChange={(note) => setC({ note })} />
          </div>
          <ListEditor
            label={x.extraFields}
            items={c.fields}
            onChange={(fields) => setC({ fields })}
            create={() => ({ id: '', label: { en: '', fa: '' }, type: 'text' as const, options: [], required: false })}
            max={10}
            render={(f, update) => (
              <div className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-[160px_1fr_160px]">
                  <TextField label={x.fieldId} dir="ltr" value={f.id} onChange={(id) => update({ ...f, id: toSlug(id) })} />
                  <LocalizedField label={x.fieldLabel} value={f.label} onChange={(label) => update({ ...f, label })} />
                  <SelectField
                    label={x.fieldType}
                    value={f.type}
                    onChange={(type) => update({ ...f, type })}
                    options={[
                      { value: 'text', label: x.typeText },
                      { value: 'textarea', label: x.typeTextarea },
                      { value: 'select', label: x.typeSelect },
                    ]}
                  />
                </div>
                {f.type === 'select' && (
                  <TextField
                    label={x.fieldOptions}
                    multiline
                    rows={3}
                    value={f.options.map((o) => (o.en && o.en !== o.fa ? `${o.fa}|${o.en}` : o.fa)).join('\n')}
                    onChange={(v) =>
                      update({
                        ...f,
                        options: v
                          .split('\n')
                          .map((line) => line.split('|').map((s) => s.trim()))
                          .filter(([fa]) => fa)
                          .map(([fa, en]) => ({ fa, en: en || fa })),
                      })
                    }
                  />
                )}
                <Checkbox label={x.fieldRequired} checked={f.required} onChange={(required) => update({ ...f, required })} />
              </div>
            )}
          />
        </div>
      </Card>
      <Card title={x.shipping}>
        <p className="mb-4 text-xs text-ink-soft">{x.shippingHint}</p>
        <ListEditor
          label={x.shipping}
          items={shop.shipping}
          onChange={(shipping) => up({ shipping })}
          create={() => ({ id: '', label: { en: '', fa: '' }, description: { en: '', fa: '' }, priceMinor: 0, freeAbove: null })}
          max={10}
          render={(m, update) => (
            <div className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
                <TextField label={x.methodId} dir="ltr" value={m.id} onChange={(id) => update({ ...m, id: toSlug(id) })} />
                <LocalizedField label={x.methodName} value={m.label} onChange={(label) => update({ ...m, label })} />
              </div>
              <LocalizedField label={x.methodDesc} value={m.description} onChange={(description) => update({ ...m, description })} />
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField label={x.methodPrice} min={0} value={m.priceMinor} onChange={(v) => update({ ...m, priceMinor: v ?? 0 })} />
                <NumberField label={x.methodFreeAbove} min={0} value={m.freeAbove} onChange={(freeAbove) => update({ ...m, freeAbove })} />
              </div>
            </div>
          )}
        />
      </Card>
      <Card title={x.lowStock}>
        <NumberField label={x.lowStock} min={0} value={shop.lowStock} onChange={(lowStock) => up({ lowStock })} className="max-w-xs" />
      </Card>
    </>
  );
}

/** The locale of the admin (for a few labels written in place). */
function usePreferencesLocale() {
  return usePreferences().locale;
}

/**
 * Browser icon, share image and page code (operator), and the announcement bar and popup (also
 * the client's: they are content).
 */
export function ExtrasTab({ s, set, siteId, operator }: TabProps & { operator: boolean }) {
  const { locale } = usePreferences();
  const T = (en: string, fa: string) => (locale === 'fa' ? fa : en);
  const meta = s.meta;
  const bar = s.announcement;
  const pop = s.popup;
  const upMeta = (patch: Partial<typeof meta>) => set('meta', { ...meta, ...patch });
  const upBar = (patch: Partial<typeof bar>) => set('announcement', { ...bar, ...patch });
  const upPop = (patch: Partial<typeof pop>) => set('popup', { ...pop, ...patch });
  return (
    <>
      {operator && (
        <Card title={T('Icon, share image and page code', 'آیکون، تصویر اشتراک‌گذاری و کد صفحه')}>
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <ImagePicker siteId={siteId} label={T('Browser icon (favicon)', 'آیکون مرورگر (favicon)')} value={meta.faviconUrl} onChange={(faviconUrl) => upMeta({ faviconUrl })} />
              <ImagePicker siteId={siteId} label={T('Default share image', 'تصویر پیش‌فرض اشتراک‌گذاری')} value={meta.shareImageUrl} onChange={(shareImageUrl) => upMeta({ shareImageUrl })} />
            </div>
            <TextField
              label={T('Code in <head> (meta tags, Google Analytics, Enamad / Samandehi verification)', 'کد داخل <head> (متاتگ، گوگل آنالیتیکس، تأیید اینماد و ساماندهی)')}
              dir="ltr"
              multiline
              rows={5}
              value={meta.headCode}
              onChange={(headCode) => upMeta({ headCode })}
            />
            <TextField
              label={T('Code at the end of <body> (chat widgets, badges)', 'کد انتهای <body> (ابزار چت آنلاین، نشان‌ها)')}
              dir="ltr"
              multiline
              rows={5}
              value={meta.bodyCode}
              onChange={(bodyCode) => upMeta({ bodyCode })}
            />
            <p className="text-xs text-ink-soft">
              {T('Runs on every page of the site. Only paste code from services you trust.', 'روی همه‌ی صفحه‌های سایت اجرا می‌شود. فقط کد سرویس‌های مطمئن را قرار دهید.')}
            </p>
          </div>
        </Card>
      )}
      <Card title={T('Announcement bar', 'نوار اعلان')}>
        <div className="flex flex-col gap-4">
          <Checkbox label={T('Show a bar above the header', 'نمایش نوار بالای سربرگ')} checked={bar.enabled} onChange={(enabled) => upBar({ enabled })} />
          <LocalizedField label={T('Text', 'متن')} value={bar.text} onChange={(text) => upBar({ text })} />
          <LinkPicker siteId={siteId} label={T('Link (optional)', 'پیوند (اختیاری)')} value={bar.href} onChange={(href) => upBar({ href })} />
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              {T('Background', 'پس‌زمینه')}
              <input type="color" value={bar.background || '#1f5e4d'} onChange={(e) => upBar({ background: e.target.value })} className="h-8 w-12 rounded border border-line" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              {T('Text colour', 'رنگ متن')}
              <input type="color" value={bar.textColor || '#ffffff'} onChange={(e) => upBar({ textColor: e.target.value })} className="h-8 w-12 rounded border border-line" />
            </label>
            <Checkbox label={T('Visitors can close it', 'بازدیدکننده بتواند ببندد')} checked={bar.dismissible} onChange={(dismissible) => upBar({ dismissible })} />
          </div>
        </div>
      </Card>
      <Card title={T('Popup', 'پنجره‌ی پاپ‌آپ')}>
        <div className="flex flex-col gap-4">
          <Checkbox label={T('Show a popup', 'نمایش پاپ‌آپ')} checked={pop.enabled} onChange={(enabled) => upPop({ enabled })} />
          <LocalizedField label={T('Title', 'عنوان')} value={pop.title} onChange={(title) => upPop({ title })} />
          <LocalizedField label={T('Text', 'متن')} value={pop.text} onChange={(text) => upPop({ text })} multiline rows={3} />
          <ImagePicker siteId={siteId} label={T('Image (optional)', 'تصویر (اختیاری)')} value={pop.imageUrl} onChange={(imageUrl) => upPop({ imageUrl })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <LocalizedField label={T('Button text', 'متن دکمه')} value={pop.buttonLabel} onChange={(buttonLabel) => upPop({ buttonLabel })} />
            <LinkPicker siteId={siteId} label={T('Button link', 'پیوند دکمه')} value={pop.buttonHref} onChange={(buttonHref) => upPop({ buttonHref })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField label={T('Open after (seconds)', 'باز شدن پس از (ثانیه)')} min={0} value={pop.delay} onChange={(v) => upPop({ delay: Math.min(120, v ?? 0) })} />
            <SelectField label={T('Pages', 'صفحه‌ها')} value={pop.pages} onChange={(pages) => upPop({ pages })} options={[{ value: 'home', label: T('Home page', 'صفحه‌ی اصلی') }, { value: 'all', label: T('Every page', 'همه‌ی صفحه‌ها') }]} />
            <div className="flex items-end pb-2">
              <Checkbox label={T('Once per visitor', 'یک بار برای هر بازدیدکننده')} checked={pop.once} onChange={(once) => upPop({ once })} />
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}
