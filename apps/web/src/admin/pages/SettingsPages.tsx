import { MODULES, PERMISSIONS, type ModuleId, type Permission, type SiteSettings } from '@site-builder/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useAdminSettings } from '../AdminRoot';
import { useIsOperator, useMe } from '../auth';
import { useT } from '../i18n';
import { Badge, Card, Checkbox, ErrorNote, ListEditor, LocalizedField, Modal, PageTitle, SelectField, Spinner, Table, Td, TextField, useToast } from '../ui';
import { ImagePicker } from './FilesPage';

const empty = { en: '', fa: '' };

function SettingsView({ siteId }: { siteId: string }) {
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
  const [tab, setTab] = useState<'brand' | 'contact' | 'categories' | 'menu' | 'modules' | 'seo'>('brand');
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
      ['contact', t.contact],
      ['categories', t.productCategories],
      ['menu', t.menu],
      ['modules', t.modules],
      ['seo', t.seo],
    ] as const
  ).filter(([id]) => operator || id === 'brand' || id === 'contact' || id === 'categories');

  return (
    <>
      <PageTitle
        title={t.settings}
        actions={
          <Button onClick={() => save.mutate(s)} disabled={save.isPending}>
            {save.isPending ? t.saving : t.save}
          </Button>
        }
      />
      <div role="tablist" className="mb-6 flex flex-wrap gap-1 border-b border-line">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)} className={cn('-mb-px border-b-2 px-4 py-2 text-sm', tab === id ? 'border-ink text-ink' : 'border-transparent text-ink-soft hover:text-ink')}>
            {label}
          </button>
        ))}
      </div>
      <ErrorNote error={save.error} />
      <div className="mt-4 flex max-w-3xl flex-col gap-6">
        {tab === 'brand' && (
          <>
            <LocalizedField label={t.siteName} value={s.name} onChange={(v) => set('name', v)} />
            <LocalizedField label={t.tagline} value={s.tagline} onChange={(v) => set('tagline', v)} />
            <ImagePicker siteId={siteId} label={t.logo} value={s.logoUrl ?? ''} onChange={(url, asset) => setS({ ...s, logoUrl: url, logoAssetId: url ? (asset?.id ?? s.logoAssetId) : null })} />
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
            <ListEditor
              label={t.social}
              items={s.social}
              max={12}
              onChange={(v) => set('social', v)}
              create={() => ({ label: '', href: 'https://' })}
              render={(item, update) => (
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField label={t.label} value={item.label} onChange={(label) => update({ ...item, label })} />
                  <TextField label={t.url} dir="ltr" value={item.href} onChange={(href) => update({ ...item, href })} />
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
            create={() => ({ href: linkOptions[0]?.value ?? '/', label: { ...empty } })}
            render={(item, update) => (
              <>
                <SelectField label={t.link} value={item.href} onChange={(href) => update({ ...item, href })} options={linkOptions.some((o) => o.value === item.href) ? linkOptions : [...linkOptions, { value: item.href, label: item.href }]} />
                <LocalizedField label={t.label} value={item.label} onChange={(label) => update({ ...item, label })} />
              </>
            )}
          />
        )}
        {tab === 'menu' && (
          <Card title={t.headerButton}>
            <div className="flex flex-col gap-4">
              <LocalizedField label={t.label} value={s.headerCta?.label ?? { ...empty }} onChange={(label) => set('headerCta', { href: s.headerCta?.href ?? '/contact', label })} />
              <SelectField
                label={t.link}
                value={s.headerCta?.href ?? '/contact'}
                onChange={(href) => set('headerCta', { label: s.headerCta?.label ?? { ...empty }, href })}
                options={[{ value: '/contact', label: '/contact' }, ...linkOptions.filter((o) => o.value !== '/contact')]}
              />
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
        {tab === 'modules' && (
          <Card>
            <p className="mb-4 text-sm text-ink-soft">{t.modulesHint}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {MODULES.map((m: ModuleId) => (
                <Checkbox key={m} label={m} checked={!!s.modules[m]} onChange={(on) => set('modules', { ...s.modules, [m]: on })} />
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

interface PaymentSettings {
  provider: 'none' | 'zarinpal' | 'sandbox';
  merchantId: string;
  useSandboxHost: boolean;
  allowCod: boolean;
  sandboxAvailable: boolean;
}

function PaymentsView({ siteId }: { siteId: string }) {
  const t = useT();
  const toast = useToast();
  const { data, isLoading, error } = useQuery({ queryKey: ['site', siteId, 'payment-settings'], queryFn: () => api.get<PaymentSettings>(`/sites/${siteId}/payment-settings`) });
  const [form, setForm] = useState<PaymentSettings | null>(null);
  useEffect(() => setForm(data ?? null), [data]);
  const save = useMutation({
    mutationFn: () => api.put<PaymentSettings>(`/sites/${siteId}/payment-settings`, { provider: form!.provider, merchantId: form!.merchantId, useSandboxHost: form!.useSandboxHost, allowCod: form!.allowCod }),
    onSuccess: (r) => {
      setForm(r);
      toast(t.saved);
    },
  });
  if (isLoading || !form) return error ? <ErrorNote error={error} /> : <Spinner />;
  return (
    <>
      <PageTitle title={t.payments} subtitle={t.paymentsNote} />
      <form
        className="flex max-w-xl flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <SelectField
          label={t.provider}
          value={form.provider}
          onChange={(provider) => setForm({ ...form, provider })}
          options={[
            { value: 'none', label: t.providerNone },
            { value: 'zarinpal', label: t.providerZarinpal },
            ...(form.sandboxAvailable || form.provider === 'sandbox' ? [{ value: 'sandbox' as const, label: t.providerSandbox }] : []),
          ]}
        />
        {form.provider === 'zarinpal' && (
          <>
            <TextField label={t.merchantId} dir="ltr" value={form.merchantId} onChange={(merchantId) => setForm({ ...form, merchantId })} hint="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            <Checkbox label={t.useSandboxHost} checked={form.useSandboxHost} onChange={(useSandboxHost) => setForm({ ...form, useSandboxHost })} />
          </>
        )}
        {form.provider === 'sandbox' && <p className="border border-dashed border-accent px-4 py-3 text-sm">{t.providerSandbox}</p>}
        <Checkbox label={t.allowCod} checked={!!form.allowCod} onChange={(allowCod) => setForm({ ...form, allowCod })} />
        {!form.sandboxAvailable && <p className="text-xs text-ink-soft">{t.sandboxUnavailable}</p>}
        <ErrorNote error={save.error} />
        <div>
          <Button type="submit" disabled={save.isPending}>
            {t.save}
          </Button>
        </div>
      </form>
    </>
  );
}

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

export default function SettingsPages({ siteId, view }: { siteId: string; view: 'settings' | 'payments' | 'members' | 'account' }) {
  if (view === 'account') return <AccountView />;
  if (view === 'payments') return <PaymentsView siteId={siteId} />;
  if (view === 'members') return <MembersView siteId={siteId} />;
  return <SettingsView siteId={siteId} />;
}
