import { PERMISSIONS, SOCIAL_ICONS, type ModuleId, type Permission, type SiteSettings } from '@site-builder/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import { SOCIAL_ICON_NAMES, SocialIcon, guessSocialIcon } from '../../components/ui/SocialIcon';
import { usePreferences } from '../../lib/preferences';
import { useAdminSettings } from '../AdminRoot';
import { useIsOperator, useMe } from '../auth';
import { useT } from '../i18n';
import { ChromeStarters } from '../starters';
import { Badge, Card, Checkbox, ErrorNote, ListEditor, LocalizedField, Modal, PageTitle, SelectField, Spinner, Table, Td, TextField, useToast } from '../ui';
import { LinkPicker } from '../links';
import { ImagePicker } from './FilesPage';
import { DesignTab, FooterTab, HeaderTab, ShopPageTab, ShopTab, ExtrasTab, SystemPagesTab, TextsTab } from './SiteOptionsTabs';
import { AccountsTab } from '../interactions/AccountsTab';
import { RequestTypesEditor } from '../interactions/RequestTypesEditor';
import { ExcelButton } from '../ExcelExport';

const empty = { en: '', fa: '' };

function SettingsView({ siteId }: { siteId: string }) {
  const { locale } = usePreferences();
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  // Clients edit their contact details only; brand, menu, modules and SEO are the operator's.
  const operator = useIsOperator();
  const { data, isLoading, error } = useAdminSettings(siteId);
  const { data: pages = [] } = useQuery({
    queryKey: ['site', siteId, 'pages'],
    queryFn: () => api.get<{ slug: string; isHome: boolean }[]>(`/sites/${siteId}/pages`),
    enabled: operator,
  });
  const [s, setS] = useState<SiteSettings | null>(null);
  type Tab = 'brand' | 'design' | 'contact' | 'categories' | 'requests' | 'accounts' | 'notifications' | 'texts' | 'menu' | 'header' | 'footer' | 'shopPage' | 'systemPages' | 'shop' | 'modules' | 'seo' | 'extras';
  // Each section has its own menu entry: ?tab= says which one this page shows.
  const [params] = useSearchParams();
  const requested = (params.get('tab') as Tab | null) ?? 'brand';
  useEffect(() => setS(data ?? null), [data]);

  const save = useMutation({
    mutationFn: (body: SiteSettings) => api.put<SiteSettings>(`/sites/${siteId}/settings`, body),
    onSuccess: (saved) => {
      toast(t.saved);
      qc.setQueryData(['site', siteId, 'settings'], saved);
      qc.invalidateQueries({ queryKey: ['public'] });
    },
  });

  if (isLoading || !s) return error ? <ErrorNote error={error} /> : <Spinner />;
  const set = <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => setS({ ...s, [key]: value });
  const linkOptions = [
    { value: '/services', label: '/services' },
    { value: '/products', label: '/products' },
    ...pages.filter((p) => !p.isHome).map((p) => ({ value: `/${p.slug}`, label: `/${p.slug}` })),
  ];
  const tabs = (
    [
      ['brand', t.brandTab],
      ['design', t.designTab],
      ['contact', t.contact],
      ['categories', t.productCategories],
      ['requests', t.requestTypes],
      ['accounts', locale === 'fa' ? 'ثبت‌نام و ورود مشتری' : 'Customer sign-up & sign-in'],
      ['notifications', locale === 'fa' ? 'اطلاع‌رسانی به کارکنان' : 'Staff notifications'],
      ['texts', t.textsTab],
      ['menu', t.menu],
      ['header', t.headerTab],
      ['footer', t.footerTab],
      ['shopPage', t.shopPageTab],
      ['systemPages', t.systemPagesTab],
      ['shop', t.shopTab],
      ['modules', t.modules],
      ['seo', t.seo],
      ['extras', locale === 'fa' ? 'کد صفحه، آیکون، اعلان و پاپ‌آپ' : 'Page code, icon, bar & popup'],
    ] as const
  )
    // Clients edit their own content and shop rules; the design is the operator's.
    .filter(([id]) => operator || ['brand', 'contact', 'categories', 'requests', 'notifications', 'footer', 'shop', 'extras'].includes(id))
    .filter(([id]) => (id === 'shopPage' || id === 'shop' ? !!s.modules.products : true));
  const tabProps = { s, set, siteId };
  // A section this person may not edit (or an unknown one) falls back to the general settings.
  const tab: Tab = tabs.some(([id]) => id === requested) ? requested : 'brand';
  const title = tabs.find(([id]) => id === tab)?.[1] ?? t.settings;

  return (
    <>
      <PageTitle
        title={title}
        actions={
          <Button onClick={() => save.mutate(s)} disabled={save.isPending}>
            {save.isPending ? t.saving : t.save}
          </Button>
        }
      />
      <ErrorNote error={save.error} />
      <div className="mt-4 flex max-w-3xl flex-col gap-6">
        {tab === 'brand' && (
          <>
            <LocalizedField label={t.siteName} value={s.name} onChange={(v) => set('name', v)} />
            <LocalizedField label={t.tagline} value={s.tagline} onChange={(v) => set('tagline', v)} />
            <ImagePicker siteId={siteId} label={t.logo} value={s.logoUrl ?? ''} onChange={(url, asset) => setS({ ...s, logoUrl: url, logoAssetId: url ? (asset?.id ?? s.logoAssetId) : null })} />
            {operator && (
              <SelectField
                label={t.headerBrand}
                value={s.header.brand}
                onChange={(brand) => set('header', { ...s.header, brand })}
                options={[
                  { value: 'auto', label: t.brandAuto },
                  { value: 'logo', label: t.brandLogo },
                  { value: 'name', label: t.brandName },
                  { value: 'both', label: t.brandBoth },
                ]}
                className="max-w-sm"
              />
            )}
            {operator && (
            <>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label={t.theme}
                value={s.themeId}
                onChange={(v) => set('themeId', v)}
                options={[
                  { value: 'ivory', label: 'Ivory' },
                  { value: 'noir', label: 'Noir' },
                  { value: 'sage', label: 'Sage' },
                  ...(s.design?.themes ?? []).map((x) => ({ value: x.id, label: x.name.fa || x.name.en || x.id })),
                ]}
              />
              <div className="flex items-end gap-3">
                <TextField label={t.accent} dir="ltr" value={s.accentColor ?? ''} onChange={(v) => set('accentColor', v || null)} hint="#8a6a43" className="flex-1" />
                <input type="color" aria-label={t.accent} value={s.accentColor ?? '#8a6a43'} onChange={(e) => set('accentColor', e.target.value)} className="mb-0.5 h-9 w-12 rounded border border-line" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <fieldset>
                <legend className="mb-2 text-xs font-medium text-ink-soft">{t.languages}</legend>
                <div className="flex gap-6">
                  {(['en', 'fa'] as const).map((code) => (
                    <Checkbox
                      key={code}
                      label={code === 'en' ? t.english : t.persian}
                      checked={s.locales.includes(code)}
                      onChange={(on) => {
                        const next = on ? [...new Set([...s.locales, code])] : s.locales.filter((x) => x !== code);
                        if (next.length) setS({ ...s, locales: next, defaultLocale: next.includes(s.defaultLocale) ? s.defaultLocale : next[0] });
                      }}
                    />
                  ))}
                </div>
              </fieldset>
              <SelectField label={t.defaultLanguage} value={s.defaultLocale} onChange={(v) => set('defaultLocale', v)} options={s.locales.map((c) => ({ value: c, label: c === 'en' ? t.english : t.persian }))} />
              <SelectField
                label={t.errorLanguage}
                value={s.errorLanguage ?? 'auto'}
                onChange={(v) => set('errorLanguage', v)}
                options={[
                  { value: 'auto', label: t.errorLanguageAuto },
                  { value: 'fa', label: t.persian },
                  { value: 'en', label: t.english },
                ]}
              />
              <SelectField
                label={t.siteDirection}
                value={s.direction ?? 'auto'}
                onChange={(v) => set('direction', v)}
                options={[
                  { value: 'auto', label: t.directionAuto },
                  { value: 'rtl', label: t.directionRtl },
                  { value: 'ltr', label: t.directionLtr },
                ]}
              />
              <SelectField
                label={t.adminDirection}
                value={s.adminDirection ?? 'auto'}
                onChange={(v) => set('adminDirection', v)}
                options={[
                  { value: 'auto', label: t.adminDirectionAuto },
                  { value: 'rtl', label: t.directionRtl },
                  { value: 'ltr', label: t.directionLtr },
                ]}
              />
              <SelectField
                label={t.calendarSetting}
                value={s.calendar ?? 'auto'}
                onChange={(v) => set('calendar', v)}
                options={[
                  { value: 'auto', label: t.calendarAuto },
                  { value: 'jalali', label: t.calendarJalali },
                  { value: 'gregorian', label: t.calendarGregorian },
                ]}
              />
              <SelectField
                label={t.adminLanguage}
                value={s.adminLanguage ?? 'auto'}
                onChange={(v) => set('adminLanguage', v)}
                options={[
                  { value: 'auto', label: t.adminLanguageAuto },
                  { value: 'fa', label: t.persian },
                  { value: 'en', label: t.english },
                ]}
              />
            </div>
            </>
            )}
          </>
        )}
        {tab === 'contact' && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label={t.email} type="email" dir="ltr" value={s.contact.email} onChange={(email) => set('contact', { ...s.contact, email })} />
              <TextField label={t.phone} dir="ltr" value={s.contact.phone} onChange={(phone) => set('contact', { ...s.contact, phone })} />
            </div>
            <LocalizedField label={t.address} value={s.contact.address} onChange={(address) => set('contact', { ...s.contact, address })} />
            <LocalizedField label={t.hours} value={s.contact.hours} onChange={(hours) => set('contact', { ...s.contact, hours })} />
            <SelectField
              label={t.socialDisplay}
              value={s.socialDisplay ?? 'label'}
              onChange={(socialDisplay) => set('socialDisplay', socialDisplay)}
              options={[
                { value: 'label', label: t.socialShowLabel },
                { value: 'icon', label: t.socialShowIcon },
                { value: 'both', label: t.socialShowBoth },
              ]}
              className="max-w-xs"
            />
            <ListEditor
              label={t.social}
              items={s.social}
              max={12}
              onChange={(v) => set('social', v)}
              create={() => ({ label: '', href: 'https://', icon: 'website' as const })}
              render={(item, update) => (
                <div className="grid items-end gap-3 sm:grid-cols-[auto_180px_1fr_1fr]">
                  <span className="mb-2 text-ink-soft">
                    <SocialIcon name={item.icon ?? 'website'} />
                  </span>
                  <SelectField
                    label={t.socialIcon}
                    value={item.icon ?? 'website'}
                    onChange={(icon) => update({ ...item, icon })}
                    options={SOCIAL_ICONS.map((i) => ({ value: i, label: SOCIAL_ICON_NAMES[i] }))}
                  />
                  <TextField
                    label={t.url}
                    dir="ltr"
                    value={item.href}
                    // Picks the matching icon while the icon is still the generic one.
                    onChange={(href) => update({ ...item, href, icon: !item.icon || item.icon === 'website' ? (guessSocialIcon(href) ?? 'website') : item.icon })}
                  />
                  <TextField label={t.label} value={item.label} onChange={(label) => update({ ...item, label })} />
                </div>
              )}
            />
          </>
        )}
        {tab === 'menu' && (
          <ListEditor
            label={t.menu}
            items={s.nav}
            max={20}
            onChange={(v) => set('nav', v)}
            create={() => ({ href: linkOptions[0]?.value ?? '/', label: { ...empty }, children: [] })}
            render={(item, update) => {
              const children = item.children ?? [];
              return (
                <>
                  {children.length > 0 && (
                    <Checkbox label={t.noLink} checked={item.href === ''} onChange={(none) => update({ ...item, href: none ? '' : (linkOptions[0]?.value ?? '/') })} />
                  )}
                  {item.href !== '' || children.length === 0 ? (
                    <LinkPicker siteId={siteId} label={t.link} value={item.href} onChange={(href) => update({ ...item, href })} />
                  ) : null}
                  <LocalizedField label={t.label} value={item.label} onChange={(label) => update({ ...item, label })} />
                  <div className="mt-2 border-s-2 border-line ps-4">
                    <p className="mb-2 text-xs text-ink-soft">{t.subMenuHelp}</p>
                    <ListEditor
                      label={t.subMenu}
                      items={children}
                      max={12}
                      // Without a submenu the item needs its own link again.
                      onChange={(next) => update({ ...item, children: next, href: next.length === 0 && item.href === '' ? (linkOptions[0]?.value ?? '/') : item.href })}
                      create={() => ({ href: '/', label: { ...empty } })}
                      render={(child, updateChild) => (
                        <>
                          <LinkPicker siteId={siteId} label={t.link} value={child.href} onChange={(href) => updateChild({ ...child, href })} />
                          <LocalizedField label={t.label} value={child.label} onChange={(label) => updateChild({ ...child, label })} />
                        </>
                      )}
                    />
                  </div>
                </>
              );
            }}
          />
        )}
        {tab === 'menu' && (
          <Card title={t.headerButton}>
            <div className="flex flex-col gap-4">
              <Checkbox label={t.showHeaderButton} checked={s.header?.showButton !== false} onChange={(showButton) => set('header', { ...s.header, showButton })} />
              {s.header?.showButton !== false && (
                <>
                  <LocalizedField label={t.label} value={s.headerCta?.label ?? { ...empty }} onChange={(label) => set('headerCta', { href: s.headerCta?.href ?? '/contact', label })} />
                  <LinkPicker siteId={siteId} label={t.link} value={s.headerCta?.href ?? '/contact'} onChange={(href) => set('headerCta', { label: s.headerCta?.label ?? { ...empty }, href })} />
                </>
              )}
            </div>
          </Card>
        )}
        {tab === 'menu' && (
          <Card title={t.shopHeading}>
            <div className="flex flex-col gap-4">
              {(['eyebrow', 'heading', 'intro'] as const).map((k) => (
                <LocalizedField
                  key={k}
                  label={k === 'eyebrow' ? t.eyebrowLabel : k === 'heading' ? t.title : t.intro}
                  value={s.catalogPage?.[k] ?? { ...empty }}
                  onChange={(v) => set('catalogPage', { eyebrow: { ...empty }, heading: { ...empty }, intro: { ...empty }, ...s.catalogPage, [k]: v })}
                />
              ))}
            </div>
          </Card>
        )}
        {tab === 'categories' && (
          <div className="mb-4 flex justify-end">
            <ExcelButton
              name={t.productCategories}
              count={(s.productCategories ?? []).length}
              size="sm"
              rows={async () => [['slug', 'نام / Name (fa)', 'Name (en)'], ...(s.productCategories ?? []).map((c) => [c.slug, c.label.fa, c.label.en])]}
            />
          </div>
        )}
        {tab === 'categories' && (
          <ListEditor
            label={t.productCategories}
            items={s.productCategories ?? []}
            onChange={(productCategories) => set('productCategories', productCategories)}
            create={() => ({ slug: '', label: { en: '', fa: '' } })}
            max={40}
            render={(c, update) => (
              <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                <TextField label={t.categorySlug} dir="ltr" value={c.slug} onChange={(slug) => update({ ...c, slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '') })} hint="cakes, drinks…" />
                <LocalizedField label={t.categoryName} value={c.label} onChange={(label) => update({ ...c, label })} />
              </div>
            )}
          />
        )}
        {tab === 'requests' && (
          <RequestTypesEditor siteId={siteId} siteName={s.name} value={s.requestTypes} onChange={(requestTypes) => set('requestTypes', requestTypes)} operator={operator} />
        )}
        {tab === 'accounts' && <AccountsTab s={s} set={set} part="accounts" />}
        {tab === 'notifications' && <AccountsTab s={s} set={set} part="notifications" />}
        {tab === 'design' && <DesignTab {...tabProps} />}
        {tab === 'texts' && <TextsTab {...tabProps} />}
        {tab === 'header' && operator && <ChromeStarters siteId={siteId} kind="header" />}
        {tab === 'header' && <HeaderTab {...tabProps} />}
        {tab === 'footer' && operator && <ChromeStarters siteId={siteId} kind="footer" />}
        {tab === 'footer' && <FooterTab {...tabProps} />}
        {tab === 'shopPage' && <ShopPageTab {...tabProps} />}
        {tab === 'systemPages' && <SystemPagesTab {...tabProps} />}
        {tab === 'extras' && <ExtrasTab {...tabProps} operator={operator} />}
        {tab === 'shop' && <ShopTab {...tabProps} />}
        {tab === 'modules' && (
          <Card>
            <p className="mb-4 text-sm text-ink-soft">{t.modulesHint}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {MODULE_SWITCHES.map((m) => (
                <Checkbox
                  key={m.id}
                  label={locale === 'fa' ? m.fa : m.en}
                  hint={locale === 'fa' ? m.faHint : m.enHint}
                  checked={!!s.modules[m.id]}
                  onChange={(on) => set('modules', { ...s.modules, [m.id]: on })}
                />
              ))}
            </div>
          </Card>
        )}
        {tab === 'seo' && (
          <>
            <TextField label={t.titleTemplate} value={s.seo.titleTemplate} onChange={(titleTemplate) => set('seo', { ...s.seo, titleTemplate })} />
            <LocalizedField label={t.defaultDescription} value={s.seo.defaultDescription} onChange={(defaultDescription) => set('seo', { ...s.seo, defaultDescription })} multiline />
          </>
        )}
      </div>
    </>
  );
}

/**
 * The built-in parts a site can switch on. A switch only opens the part (admin menus, built-in
 * addresses, API); it adds no pages, tables or sample items. `projects`, `testimonials` and `faq`
 * are still stored but no longer change anything (those are builder pages and tables now).
 */
const MODULE_SWITCHES: { id: ModuleId; en: string; fa: string; enHint: string; faHint: string }[] = [
  {
    id: 'products',
    en: 'Products & catalog',
    fa: 'محصولات و کاتالوگ',
    enHint: 'Products, categories and reviews in the admin; the shop list and product pages on the site.',
    faHint: 'محصولات، دسته‌بندی‌ها و نظرات در پنل؛ فهرست فروشگاه و صفحه‌ی هر محصول در سایت.',
  },
  {
    id: 'orders',
    en: 'Cart & online orders',
    fa: 'سبد خرید و سفارش آنلاین',
    enHint: 'Visitors can buy and pay online: cart, checkout and the Orders menu. Needs Products.',
    faHint: 'بازدیدکننده می‌تواند آنلاین بخرد و پرداخت کند: سبد خرید، تسویه و منوی سفارش‌ها. به «محصولات» نیاز دارد.',
  },
  {
    id: 'services',
    en: 'Services',
    fa: 'خدمات',
    enHint: 'A list of services with prices in the admin; the services list and service pages on the site.',
    faHint: 'فهرست خدمات با قیمت در پنل؛ فهرست خدمات و صفحه‌ی هر خدمت در سایت.',
  },
  {
    id: 'leads',
    en: 'Forms & customer requests',
    fa: 'فرم‌ها و درخواست‌های مشتری',
    enHint: 'Forms on the site send requests (consultation, booking…) to Customer requests.',
    faHint: 'فرم‌های سایت درخواست‌ها (مشاوره، رزرو…) را به «درخواست‌های مشتریان» می‌فرستند.',
  },
];

interface Member {
  userId: string;
  email: string;
  displayName: string;
  role: 'owner' | 'staff';
  permissions: Permission[];
}

function PermissionsEditor({ value, onChange }: { value: Permission[]; onChange: (v: Permission[]) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {PERMISSIONS.map((p) => (
        <Checkbox key={p} label={p} checked={value.includes(p)} onChange={(on) => onChange(on ? [...value, p] : value.filter((x) => x !== p))} />
      ))}
    </div>
  );
}

function MembersView({ siteId }: { siteId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const key = ['site', siteId, 'members'];
  const { data, isLoading, error } = useQuery({ queryKey: key, queryFn: () => api.get<Member[]>(`/sites/${siteId}/members`) });
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [perms, setPerms] = useState<Permission[]>(['leads:read']);
  const [editing, setEditing] = useState<Member | null>(null);

  const add = useMutation({
    mutationFn: () => api.post(`/sites/${siteId}/members`, { email, permissions: perms }),
    onSuccess: () => {
      setAdding(false);
      setEmail('');
      qc.invalidateQueries({ queryKey: key });
    },
  });
  const update = useMutation({
    mutationFn: (m: Member) => api.patch(`/sites/${siteId}/members/${m.userId}`, { permissions: m.permissions }),
    onSuccess: () => {
      setEditing(null);
      toast(t.saved);
      qc.invalidateQueries({ queryKey: key });
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/sites/${siteId}/members/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: key }) });

  return (
    <>
      <PageTitle title={t.members} actions={<Button onClick={() => setAdding(true)}>{t.addMember}</Button>} />
      {isLoading ? (
        <Spinner />
      ) : (
        <>
          <ErrorNote error={error} />
          <Table head={[t.email, t.status, t.permissions, t.actions]}>
            {data?.map((m) => (
              <tr key={m.userId}>
                <Td>
                  <span dir="ltr">{m.email}</span>
                </Td>
                <Td>
                  <Badge tone={m.role === 'owner' ? 'accent' : 'neutral'}>{m.role === 'owner' ? t.owner : t.staff}</Badge>
                </Td>
                <Td className="text-xs text-ink-soft">{m.role === 'owner' ? '*' : m.permissions.join(', ') || '—'}</Td>
                <Td>
                  {m.role === 'staff' && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditing(m)}>
                        {t.edit}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => window.confirm(t.confirmDelete) && remove.mutate(m.userId)}>
                        {t.delete}
                      </Button>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title={t.addMember}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <TextField label={t.email} type="email" dir="ltr" value={email} onChange={setEmail} required />
          <PermissionsEditor value={perms} onChange={setPerms} />
          <ErrorNote error={add.error} />
          <div className="flex justify-end">
            <Button type="submit" disabled={add.isPending}>
              {t.add}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.email ?? ''}>
        {editing && (
          <div className="flex flex-col gap-4">
            <PermissionsEditor value={editing.permissions} onChange={(permissions) => setEditing({ ...editing, permissions })} />
            <ErrorNote error={update.error} />
            <div className="flex justify-end">
              <Button onClick={() => update.mutate(editing)} disabled={update.isPending}>
                {t.save}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function AccountView() {
  const t = useT();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const sendEmail = useMutation({ mutationFn: () => api.post('/auth/email/verification') });
  const sendCode = useMutation({ mutationFn: () => api.post('/auth/phone/verification', { phone }), onSuccess: () => setCodeSent(true) });
  const verify = useMutation({
    mutationFn: () => api.post('/auth/phone/verify', { phone, code }),
    onSuccess: () => {
      setCodeSent(false);
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
  if (!me) return <Spinner />;
  const u = me.user;
  return (
    <>
      <PageTitle title={t.account} />
      <div className="grid max-w-3xl gap-6">
        <Card title={t.email}>
          <p dir="ltr" className="text-ink">
            {u.email ?? '—'}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <Badge tone={u.emailVerified ? 'good' : 'warn'}>{u.emailVerified ? t.verified : t.notVerified}</Badge>
            {u.email && !u.emailVerified && (
              <Button size="sm" variant="outline" onClick={() => sendEmail.mutate()} disabled={sendEmail.isPending || sendEmail.isSuccess}>
                {t.verifyEmail}
              </Button>
            )}
          </div>
          {sendEmail.isSuccess && <p className="mt-2 text-sm text-ink-soft">{t.verificationSent}</p>}
          <ErrorNote error={sendEmail.error} />
        </Card>
        <Card title={t.phone}>
          <p dir="ltr" className="text-ink">
            {u.phone ?? '—'} <Badge tone={u.phoneVerified ? 'good' : 'warn'}>{u.phoneVerified ? t.verified : t.notVerified}</Badge>
          </p>
          <form
            className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (codeSent) verify.mutate();
              else sendCode.mutate();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label={t.phone} dir="ltr" value={phone} onChange={setPhone} placeholder="+989121234567" />
              {codeSent && <TextField label={t.code} dir="ltr" value={code} onChange={setCode} />}
            </div>
            <Button type="submit" size="sm" disabled={!phone || sendCode.isPending || verify.isPending}>
              {codeSent ? t.verifyPhone : t.sendCode}
            </Button>
          </form>
          <ErrorNote error={sendCode.error ?? verify.error} />
        </Card>
      </div>
    </>
  );
}

export default function SettingsPages({ siteId, view }: { siteId: string; view: 'settings' | 'members' | 'account' }) {
  if (view === 'account') return <AccountView />;
  if (view === 'members') return <MembersView siteId={siteId} />;
  return <SettingsView siteId={siteId} />;
}
