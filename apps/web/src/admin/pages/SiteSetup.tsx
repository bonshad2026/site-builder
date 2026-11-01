import {
  defaultSetup,
  MENU_PLACES,
  SETUP_FORMS,
  SETUP_PAGES,
  SETUP_TABLES,
  siteSetupSchema,
  WORKFLOW_PRESETS,
  type MenuPlace,
  type SiteSetup,
} from '@site-builder/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button';
import { cn } from '../../lib/cn';
import { api } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import { useT } from '../i18n';
import { Badge, Checkbox, ErrorNote, NumberField, PageTitle, SelectField, TextField, useToast } from '../ui';

interface TemplateInfo {
  key: string;
  label: { en: string; fa: string };
  orders: boolean;
  products: number;
}

/** One collapsible group of choices, with a short count of what is picked. */
function Section({ title, hint, badge, open, children }: { title: string; hint?: string; badge?: ReactNode; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 select-none">
        <span className="flex items-center gap-3">
          <span aria-hidden="true" className="text-ink-soft transition-transform group-open:rotate-90 rtl:-scale-x-100">
            ›
          </span>
          <span className="font-medium text-ink">{title}</span>
        </span>
        {badge}
      </summary>
      <div className="flex flex-col gap-4 border-t border-line px-5 py-5">
        {hint && <p className="text-xs text-ink-soft">{hint}</p>}
        {children}
      </div>
    </details>
  );
}

const grid = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3';

/**
 * Creating a client site: business type, pages and menus, forms, header and footer, shop,
 * filters, content tables, accounts and sample data, all on one page.
 */
export default function SiteSetupPage() {
  const t = useT();
  const s = t.su;
  const { locale } = usePreferences();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [basics, setBasics] = useState({ slug: '', name: '', ownerEmail: '', domain: '', template: 'default' });
  const [setup, setSetup] = useState<SiteSetup>(() => defaultSetup());
  const { data: templates = [] } = useQuery({ queryKey: ['platform', 'templates'], queryFn: () => api.get<TemplateInfo[]>('/platform/templates') });
  const l = (v: { en: string; fa: string }) => v[locale] || v.en || v.fa;
  const up = <K extends keyof SiteSetup>(key: K, patch: Partial<SiteSetup[K]>) => setSetup((x) => ({ ...x, [key]: { ...(x[key] as object), ...patch } }));

  // '' = an empty site (no setup at all), 'default' = the neutral starting site, else a business type.
  const empty = basics.template === '';
  const chooseTemplate = (key: string) => {
    setBasics((b) => ({ ...b, template: key }));
    if (key === '') return;
    const info = key === 'default' ? undefined : templates.find((x) => x.key === key);
    // A new business type brings its own pages, forms and shop; contact details and look stay.
    setSetup((x) => ({ ...defaultSetup(key === 'default' ? '' : key, info?.orders), contact: x.contact, languages: x.languages, calendar: x.calendar }));
  };

  const shop = 'shop' in setup.pages;
  const placeOptions = MENU_PLACES.map((p) => ({ value: p, label: { main: s.menuMain, more: s.menuMore, footer: s.menuFooter, none: s.menuNone }[p] }));
  const formChoice = (id: string) => setup.forms.find((f) => f.id === id);
  const setForm = (id: string, patch: Partial<SiteSetup['forms'][number]> | null) =>
    setSetup((x) => {
      const has = x.forms.some((f) => f.id === id);
      if (patch === null) return { ...x, forms: x.forms.filter((f) => f.id !== id), mainForm: x.mainForm === id ? x.forms.find((f) => f.id !== id)?.id ?? 'contact' : x.mainForm };
      const forms = has ? x.forms.map((f) => (f.id === id ? { ...f, ...patch } : f)) : [...x.forms, { id, menu: 'more' as MenuPlace, access: 'anyone' as const, notify: true, workflow: '', ...patch }];
      return { ...x, forms };
    });
  const setTable = (id: string, menu: MenuPlace | null) =>
    setSetup((x) => ({ ...x, tables: menu === null ? x.tables.filter((v) => v.id !== id) : x.tables.some((v) => v.id === id) ? x.tables.map((v) => (v.id === id ? { ...v, menu } : v)) : [...x.tables, { id, menu }] }));

  const summary = useMemo(() => {
    const pages = Object.keys(setup.pages).filter((p) => !SETUP_PAGES.find((x) => x.id === p)?.builtIn).length + 1 + setup.forms.length + setup.tables.length;
    const menu = [...Object.values(setup.pages), ...setup.forms.map((f) => f.menu), ...setup.tables.map((v) => v.menu)].filter((p) => p !== 'none').length;
    return { pages, menu };
  }, [setup]);

  const create = useMutation({
    mutationFn: () =>
      api.post<{ slug: string; name: string; status: string }>('/platform/tenants', {
        ...basics,
        domain: basics.domain || undefined,
        template: basics.template && basics.template !== 'default' ? basics.template : undefined,
        setup: empty ? undefined : siteSetupSchema.parse(setup),
      }),
    onSuccess: (tenant) => {
      toast(`${s.created}: ${tenant.name}`);
      qc.invalidateQueries({ queryKey: ['platform', 'tenants'] });
      navigate('/admin/platform/sites');
    },
  });

  const d = setup.demo;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <PageTitle title={s.title} subtitle={s.intro} />
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="flex flex-col gap-3">
          <Section title={s.basics} open>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label={t.name} value={basics.name} onChange={(name) => setBasics((b) => ({ ...b, name }))} required />
              <TextField label={t.siteId} dir="ltr" hint="lowercase-with-hyphens" value={basics.slug} onChange={(slug) => setBasics((b) => ({ ...b, slug: slug.toLowerCase() }))} required />
              <TextField label={t.ownerEmail} type="email" dir="ltr" value={basics.ownerEmail} onChange={(ownerEmail) => setBasics((b) => ({ ...b, ownerEmail }))} required />
              <TextField label={t.domain} dir="ltr" value={basics.domain} onChange={(domain) => setBasics((b) => ({ ...b, domain }))} />
              <SelectField
                label={t.businessType}
                value={basics.template}
                onChange={chooseTemplate}
                options={[{ value: '', label: t.emptySite }, { value: 'default', label: t.defaultSite }, ...templates.map((tp) => ({ value: tp.key, label: l(tp.label) }))]}
              />
            </div>
            <p className="text-xs text-ink-soft">{t.provisionNote}</p>
            {empty && <p className="text-sm text-ink">{t.emptySiteNote}</p>}
          </Section>

          {!empty && (
            <>

          <Section title={s.look}>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label={s.languages} value={setup.languages} onChange={(languages) => setSetup((x) => ({ ...x, languages }))} options={[{ value: 'both', label: s.both }, { value: 'fa', label: s.faOnly }, { value: 'en', label: s.enOnly }]} />
              <SelectField label={s.calendar} value={setup.calendar} onChange={(calendar) => setSetup((x) => ({ ...x, calendar }))} options={[{ value: 'auto', label: s.calAuto }, { value: 'jalali', label: s.jalali }, { value: 'gregorian', label: s.gregorian }]} />
              <SelectField label={s.theme} value={setup.theme} onChange={(theme) => setSetup((x) => ({ ...x, theme }))} options={[{ value: '', label: s.byType }, { value: 'ivory', label: 'Ivory' }, { value: 'noir', label: 'Noir' }, { value: 'sage', label: 'Sage' }]} />
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-ink-soft">{s.accent}</span>
                <span className="flex items-center gap-3">
                  <input type="color" value={setup.accent || '#8a6d4b'} onChange={(e) => setSetup((x) => ({ ...x, accent: e.target.value }))} className="h-9 w-14 cursor-pointer border border-line bg-transparent" />
                  {setup.accent ? (
                    <button type="button" className="text-xs underline" onClick={() => setSetup((x) => ({ ...x, accent: '' }))}>
                      {s.byType}
                    </button>
                  ) : (
                    <span className="text-xs text-ink-soft">{s.byType}</span>
                  )}
                </span>
              </label>
            </div>
          </Section>

          <Section title={s.contact}>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label={s.phone} dir="ltr" value={setup.contact.phone} onChange={(phone) => up('contact', { phone })} />
              <TextField label={s.email} type="email" dir="ltr" value={setup.contact.email} onChange={(email) => up('contact', { email })} />
              <TextField label={s.address} value={setup.contact.address} onChange={(address) => up('contact', { address })} />
              <TextField label={s.hours} value={setup.contact.hours} onChange={(hours) => up('contact', { hours })} />
              <TextField label={s.instagram} dir="ltr" value={setup.contact.instagram} onChange={(instagram) => up('contact', { instagram })} />
              <TextField label={s.telegram} dir="ltr" value={setup.contact.telegram} onChange={(telegram) => up('contact', { telegram })} />
              <TextField label={s.whatsapp} dir="ltr" value={setup.contact.whatsapp} onChange={(whatsapp) => up('contact', { whatsapp })} />
            </div>
          </Section>

          <Section title={s.pages} hint={s.pagesHint} badge={<Badge>{Object.keys(setup.pages).length}</Badge>}>
            <div className="flex flex-col divide-y divide-line">
              {SETUP_PAGES.map((p) => {
                const place = setup.pages[p.id];
                const disabled = (p.needs === 'shop' && !shop) || (p.needs === 'accounts' && !setup.accounts.enabled);
                return (
                  <div key={p.id} className={cn('flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between', disabled && 'opacity-60')}>
                    <Checkbox
                      label={l(p.label)}
                      hint={`${l(p.hint)} · ${p.href}${p.needs === 'shop' ? ` · ${s.needsShop}` : p.needs === 'accounts' ? ` · ${s.needsAccounts}` : ''}`}
                      checked={!!place}
                      onChange={(on) =>
                        setSetup((x) => {
                          const pages = { ...x.pages };
                          if (on) pages[p.id] = p.place;
                          else delete pages[p.id];
                          return { ...x, pages };
                        })
                      }
                    />
                    {place && <SelectField label="" className="sm:w-48" value={place} onChange={(v) => setSetup((x) => ({ ...x, pages: { ...x.pages, [p.id]: v } }))} options={placeOptions} />}
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title={s.forms} hint={s.formsHint} badge={<Badge>{setup.forms.length}</Badge>}>
            <SelectField label={s.mainForm} value={setup.mainForm} onChange={(mainForm) => setSetup((x) => ({ ...x, mainForm, forms: x.forms.some((f) => f.id === mainForm) ? x.forms : [...x.forms, { id: mainForm, menu: 'none', access: 'anyone', notify: true, workflow: '' }] }))} options={SETUP_FORMS.map((f) => ({ value: f.id, label: l(f.label) }))} />
            <div className="flex flex-col divide-y divide-line">
              {SETUP_FORMS.map((f) => {
                const c = formChoice(f.id);
                const isMain = setup.mainForm === f.id;
                return (
                  <div key={f.id} className="flex flex-col gap-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <Checkbox label={l(f.label)} hint={`${l(f.hint)} · /${isMain ? 'contact' : f.page}`} checked={!!c} onChange={(on) => setForm(f.id, on ? {} : null)} />
                      {isMain && <Badge tone="accent">{s.mainForm}</Badge>}
                    </div>
                    {c && (
                      <div className="grid gap-3 ps-7 sm:grid-cols-2 lg:grid-cols-4">
                        {!isMain && <SelectField label={s.menuMain} value={c.menu} onChange={(menu) => setForm(f.id, { menu })} options={placeOptions} />}
                        <SelectField label={s.workflow} value={c.workflow} onChange={(workflow) => setForm(f.id, { workflow })} options={[{ value: '', label: `${s.formDefault} (${l(WORKFLOW_PRESETS.find((w) => w.id === f.workflow)!.label)})` }, ...WORKFLOW_PRESETS.map((w) => ({ value: w.id, label: l(w.label) }))]} />
                        <SelectField label={s.access} value={c.access} onChange={(access) => setForm(f.id, { access })} options={[{ value: 'anyone', label: s.anyone }, { value: 'signed_in', label: s.signedIn }]} />
                        <div className="flex items-end pb-2">
                          <Checkbox label={s.notify} checked={c.notify} onChange={(notify) => setForm(f.id, { notify })} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title={s.header}>
            <div className={grid}>
              <Checkbox label={s.headerCta} checked={setup.header.cta} onChange={(cta) => up('header', { cta })} />
              <Checkbox label={s.headerPhone} checked={setup.header.phone} onChange={(phone) => up('header', { phone })} />
              <Checkbox label={s.headerWhatsapp} hint={setup.contact.whatsapp ? undefined : s.whatsapp} checked={setup.header.whatsapp} onChange={(whatsapp) => up('header', { whatsapp })} />
              <Checkbox label={s.headerSearch} checked={setup.header.search} onChange={(search) => up('header', { search })} />
              <Checkbox label={s.headerCart} checked={setup.header.cart} onChange={(cart) => up('header', { cart })} />
              <Checkbox label={s.headerAccount} checked={setup.header.account} onChange={(account) => up('header', { account })} />
              <Checkbox label={s.headerLanguage} checked={setup.header.language} onChange={(language) => up('header', { language })} />
              <Checkbox label={s.headerTheme} checked={setup.header.theme} onChange={(theme) => up('header', { theme })} />
            </div>
            <SelectField label={s.headerLayout} className="sm:w-64" value={setup.header.layout} onChange={(layout) => up('header', { layout })} options={[{ value: 'standard', label: s.layoutStandard }, { value: 'centered', label: s.layoutCentered }, { value: 'menu-start', label: s.layoutMenuStart }]} />
            <div className={grid}>
              <Checkbox label={s.footerMenu} checked={setup.footer.menu} onChange={(menu) => up('footer', { menu })} />
              <Checkbox label={s.footerContact} checked={setup.footer.contact} onChange={(contact) => up('footer', { contact })} />
              <Checkbox label={s.footerSocial} checked={setup.footer.social} onChange={(social) => up('footer', { social })} />
              <Checkbox label={s.footerAbout} checked={setup.footer.about} onChange={(about) => up('footer', { about })} />
            </div>
          </Section>

          {shop && (
            <Section title={s.shop}>
              <div className={grid}>
                <Checkbox label={s.orders} checked={setup.shop.orders} onChange={(orders) => up('shop', { orders })} />
                {setup.shop.orders && <Checkbox label={s.cod} checked={setup.shop.cod} onChange={(cod) => up('shop', { cod })} />}
                {setup.shop.orders && <Checkbox label={s.online} checked={setup.shop.online} onChange={(online) => up('shop', { online })} />}
                <Checkbox label={s.discounts} checked={setup.shop.discounts} onChange={(discounts) => up('shop', { discounts })} />
                <Checkbox label={s.colors} checked={setup.shop.colors} onChange={(colors) => up('shop', { colors })} />
                <Checkbox label={s.stock} checked={setup.shop.stock} onChange={(stock) => up('shop', { stock })} />
                {setup.shop.orders && <Checkbox label={s.addToCart} checked={setup.shop.addToCart} onChange={(addToCart) => up('shop', { addToCart })} />}
              </div>
              <SelectField label={s.columns} className="sm:w-48" value={String(setup.shop.columns)} onChange={(v) => up('shop', { columns: Number(v) })} options={['2', '3', '4', '5'].map((v) => ({ value: v, label: v }))} />
            </Section>
          )}

          <Section title={s.filters}>
            <div className={grid}>
              <Checkbox label={s.fSearch} checked={setup.filters.search} onChange={(search) => up('filters', { search })} />
              <Checkbox label={s.fCategory} checked={setup.filters.category} onChange={(category) => up('filters', { category })} />
              <Checkbox label={s.fSort} checked={setup.filters.sort} onChange={(sort) => up('filters', { sort })} />
              <Checkbox label={s.fPrice} checked={setup.filters.price} onChange={(price) => up('filters', { price })} />
              <Checkbox label={s.fAvailable} checked={setup.filters.available} onChange={(available) => up('filters', { available })} />
              <Checkbox label={s.fDiscount} checked={setup.filters.discount} onChange={(discount) => up('filters', { discount })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label={s.fLayout} value={setup.filters.layout} onChange={(layout) => up('filters', { layout })} options={[{ value: 'inline', label: s.fInline }, { value: 'stacked', label: s.fStacked }]} />
              <SelectField label={s.pagination} value={setup.filters.pagination} onChange={(pagination) => up('filters', { pagination })} options={[{ value: 'pages', label: s.pPages }, { value: 'more', label: s.pMore }, { value: 'none', label: s.pNone }]} />
            </div>
          </Section>

          <Section title={s.tables} hint={s.tablesHint} badge={<Badge>{setup.tables.length}</Badge>}>
            <div className="flex flex-col divide-y divide-line">
              {SETUP_TABLES.map((tb) => {
                const c = setup.tables.find((v) => v.id === tb.id);
                return (
                  <div key={tb.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <Checkbox label={l(tb.label)} hint={`/${tb.slug}`} checked={!!c} onChange={(on) => setTable(tb.id, on ? 'main' : null)} />
                    {c && <SelectField label="" className="sm:w-48" value={c.menu} onChange={(menu) => setTable(tb.id, menu)} options={placeOptions} />}
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title={s.accounts}>
            <Checkbox label={s.accountsOn} checked={setup.accounts.enabled} onChange={(enabled) => up('accounts', { enabled })} />
            {setup.accounts.enabled && (
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField label={s.identifier} value={setup.accounts.identifier} onChange={(identifier) => up('accounts', { identifier })} options={[{ value: 'phone', label: s.byPhone }, { value: 'email', label: s.byEmail }]} />
                <div className="flex items-end pb-2">
                  <Checkbox label={s.passwords} checked={setup.accounts.passwords} onChange={(passwords) => up('accounts', { passwords })} />
                </div>
              </div>
            )}
          </Section>

          <Section title={s.demo} hint={s.demoHint} open badge={d.enabled ? <Badge tone="warn">{s.demo}</Badge> : undefined}>
            <Checkbox label={s.demoOn} checked={d.enabled} onChange={(enabled) => up('demo', { enabled })} />
            {d.enabled && (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  {shop && <NumberField label={s.dProducts} min={0} value={d.products} onChange={(v) => up('demo', { products: v ?? 0 })} />}
                  {(setup.tables.length > 0 || 'blog' in setup.pages || 'team' in setup.pages) && <NumberField label={s.dItems} min={0} value={d.items} onChange={(v) => up('demo', { items: v ?? 0 })} />}
                  <NumberField label={s.dCustomers} min={0} value={d.customers} onChange={(v) => up('demo', { customers: v ?? 0 })} />
                  {shop && setup.shop.orders && <NumberField label={s.dOrders} min={0} value={d.orders} onChange={(v) => up('demo', { orders: v ?? 0 })} />}
                  <NumberField label={s.dRequests} min={0} value={d.requests} onChange={(v) => up('demo', { requests: v ?? 0 })} />
                  <NumberField label={s.dPayments} min={0} value={d.payments} onChange={(v) => up('demo', { payments: v ?? 0 })} />
                  <NumberField label={s.dTestimonials} min={0} value={d.testimonials} onChange={(v) => up('demo', { testimonials: Math.min(20, v ?? 0) })} />
                  <NumberField label={s.dFaq} min={0} value={d.faq} onChange={(v) => up('demo', { faq: Math.min(40, v ?? 0) })} />
                  <NumberField label={s.dMonths} min={1} value={d.months} onChange={(v) => up('demo', { months: Math.max(1, Math.min(36, v ?? 1)) })} />
                </div>
                <p className="text-xs text-ink-soft">{s.demoPassword}</p>
              </>
            )}
          </Section>
            </>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="flex flex-col gap-4 border border-line bg-surface p-5">
            <h2 className="font-medium text-ink">{s.summary}</h2>
            {empty ? (
              <p className="text-sm text-ink-soft">{t.emptySiteNote}</p>
            ) : (
            <ul className="flex flex-col gap-1.5 text-sm text-ink-soft">
              <li>
                {summary.pages} {s.sPages} · {summary.menu} {s.sMenu}
              </li>
              <li>
                {setup.forms.length} {s.sForms} · {setup.tables.length} {s.sTables}
              </li>
              <li>
                {s.mainForm}: {l(SETUP_FORMS.find((f) => f.id === setup.mainForm)?.label ?? { en: '', fa: '' })}
              </li>
              {shop && <li>{setup.shop.orders ? s.orders : s.shop}</li>}
              {setup.accounts.enabled && <li>{s.accounts}</li>}
              {d.enabled && (
                <li className="text-ink">
                  {s.demo}: {shop ? `${d.products} · ` : ''}
                  {d.customers} / {shop && setup.shop.orders ? `${d.orders} / ` : ''}
                  {d.requests} / {d.payments}
                </li>
              )}
            </ul>
            )}
            <ErrorNote error={create.error} />
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? s.creating : s.create}
            </Button>
            <Button variant="ghost" onClick={() => navigate('/admin/platform/sites')}>
              {t.cancel}
            </Button>
          </div>
        </aside>
      </div>
    </form>
  );
}
