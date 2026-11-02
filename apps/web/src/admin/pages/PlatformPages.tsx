import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button';
import { api, apiRequest } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import { useT } from '../i18n';
import { Badge, Checkbox, ConfirmButton, ErrorNote, Modal, NumberField, PageTitle, Pagination, SelectField, Spinner, Table, Td, TextField, useErrorLine, useToast } from '../ui';

const SiteSetupPage = lazy(() => import('./SiteSetup'));
const BankPage = lazy(() => import('./BankPage'));
const StartersPage = lazy(() => import('./StartersPage'));
const MessagingPage = lazy(() => import('./MessagingPage'));

interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: 'provisioning' | 'active' | 'suspended' | 'failed';
  dbName: string;
  provisioningStep: string | null;
  lastError: string | null;
  primaryDomain: string | null;
  ownerEmail: string | null;
  createdAt: string;
  /** Template photos still stored as gradient placeholders (null when unknown). */
  placeholderPhotos: number | null;
}

const statusTone = { active: 'good', provisioning: 'warn', suspended: 'neutral', failed: 'bad' } as const;

function SitesPage() {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const { formatDate } = usePreferences();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const [demo, setDemo] = useState<Tenant | null>(null);
  const [removing, setRemoving] = useState<Tenant | null>(null);
  const [owner, setOwner] = useState<Tenant | null>(null);

  const list = useQuery({
    queryKey: ['platform', 'tenants', page, q],
    queryFn: () => apiRequest<Tenant[]>(`/platform/tenants?page=${page}&pageSize=20${q ? `&q=${encodeURIComponent(q)}` : ''}`),
    placeholderData: keepPreviousData,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['platform', 'tenants'] });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'suspended' }) => api.patch(`/platform/tenants/${id}`, { status }),
    onSuccess: () => {
      toast(t.saved);
      refresh();
    },
    onError: () => toast(t.error, 'bad'),
  });
  // Template photos that were placeholders (no internet) are swapped for files now in var/demo-images.
  // Offered only for sites that still have placeholders; the button goes once none are left.
  const photos = useMutation({
    mutationFn: (tenant: Tenant) => api.post<{ replaced: number; missing: string[] }>(`/platform/tenants/${tenant.id}/refresh-photos`, {}),
    onSuccess: (r) => toast(`${t.photosReplaced}: ${r.replaced}${r.missing.length ? ` · ${t.photosMissing}: ${r.missing.length}` : ''}`, r.missing.length ? 'bad' : 'good'),
    onError: () => toast(t.error, 'bad'),
    onSettled: refresh,
  });
  const retry = useMutation({
    mutationFn: (tenant: Tenant) => api.post(`/platform/tenants/${tenant.id}/retry`, {}),
    onSettled: refresh,
    onError: () => toast(t.error, 'bad'),
  });

  return (
    <>
      <PageTitle title={t.sites} actions={<Button onClick={() => navigate('/admin/platform/sites/new')}>{t.newSite}</Button>} />
      <div className="mb-4 max-w-xs">
        <TextField label={t.search} value={q} onChange={(v) => { setQ(v); setPage(1); }} />
      </div>
      {list.isLoading ? (
        <Spinner />
      ) : (
        <>
          <ErrorNote error={list.error} />
          <Table head={[t.name, t.status, t.ownerEmail, t.database, t.created, t.actions]}>
            {list.data?.data.map((s) => (
              <tr key={s.id}>
                <Td>
                  <Link to={`/admin/sites/${s.slug}`} className="font-medium hover:underline">
                    {s.name}
                  </Link>
                  <div className="text-xs text-ink-soft" dir="ltr">
                    {s.slug}
                    {s.primaryDomain ? ` · ${s.primaryDomain}` : ''}
                  </div>
                </Td>
                <Td>
                  <Badge tone={statusTone[s.status]}>{s.status}</Badge>
                  {s.lastError && (
                    <div className="mt-1 max-w-56 truncate text-xs text-danger" title={s.lastError}>
                      {s.provisioningStep}: {s.lastError}
                    </div>
                  )}
                </Td>
                <Td className="text-xs">{s.ownerEmail ?? '—'}</Td>
                <Td className="font-mono text-xs">{s.dbName}</Td>
                <Td className="text-xs text-ink-soft">{formatDate(s.createdAt)}</Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    {s.status === 'active' && (
                      <Button size="sm" variant="outline" onClick={() => update.mutate({ id: s.id, status: 'suspended' })}>
                        {t.suspend}
                      </Button>
                    )}
                    {s.status === 'suspended' && (
                      <Button size="sm" variant="outline" onClick={() => update.mutate({ id: s.id, status: 'active' })}>
                        {t.activate}
                      </Button>
                    )}
                    {(s.status === 'failed' || s.status === 'provisioning') && (
                      <Button size="sm" variant="outline" disabled={retry.isPending} onClick={() => retry.mutate(s)}>
                        {t.retry}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setOwner(s)}>
                      {t.changeOwner}
                    </Button>
                    {s.status === 'active' && !!s.placeholderPhotos && (
                      <Button size="sm" variant="ghost" disabled={photos.isPending} onClick={() => photos.mutate(s)}>
                        {t.refreshPhotos}
                      </Button>
                    )}
                    {s.status === 'active' && (
                      <Button size="sm" variant="ghost" onClick={() => setDemo(s)}>
                        {t.su.demoData}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-danger" onClick={() => setRemoving(s)}>
                      {t.deleteSite}
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} totalPages={list.data?.meta?.totalPages ?? 1} onChange={setPage} />
        </>
      )}
      <DemoModal tenant={demo} onClose={() => setDemo(null)} />
      <DeleteSiteModal tenant={removing} onClose={() => setRemoving(null)} onDeleted={refresh} />
      <OwnerModal tenant={owner} onClose={() => setOwner(null)} onSaved={refresh} />
    </>
  );
}

/** Deleting a site for good, after its id is typed again. */
function DeleteSiteModal({ tenant, onClose, onDeleted }: { tenant: Tenant | null; onClose: () => void; onDeleted: () => void }) {
  const t = useT();
  const toast = useToast();
  const [typed, setTyped] = useState('');
  const remove = useMutation({
    mutationFn: () => api.delete(`/platform/tenants/${tenant!.id}?confirm=${encodeURIComponent(typed)}`),
    onSuccess: () => {
      toast(t.siteDeleted);
      setTyped('');
      onDeleted();
      onClose();
    },
  });
  const close = () => {
    setTyped('');
    remove.reset();
    onClose();
  };
  return (
    <Modal open={!!tenant} onClose={close} title={`${t.deleteSiteTitle}: ${tenant?.name ?? ''}`}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          remove.mutate();
        }}
      >
        <p className="text-sm text-ink">{t.deleteSiteText}</p>
        <code className="w-fit rounded bg-surface-2 px-2 py-1 text-sm" dir="ltr">
          {tenant?.slug}
        </code>
        <TextField label={t.siteId} dir="ltr" value={typed} onChange={setTyped} />
        <ErrorNote error={remove.error} />
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={close}>
            {t.cancel}
          </Button>
          <Button type="submit" disabled={remove.isPending || typed !== tenant?.slug}>
            {t.deleteForever}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

interface DemoInfo {
  demo: Record<'products' | 'services' | 'items' | 'customers' | 'orders' | 'payments' | 'requests', number>;
  all: Record<'products' | 'services' | 'customers' | 'orders' | 'requests', number>;
  modules: Record<string, boolean>;
  tables: { slug: string; name: { en: string; fa: string }; items: number }[];
  type: string;
}

/**
 * Sample data of a site: how much there is, making more from a site kit (per table, with
 * customers, orders, payments and requests), and removing it before delivery. Kit tables the
 * site does not have can be added on the way.
 */
function DemoModal({ tenant, onClose }: { tenant: Tenant | null; onClose: () => void }) {
  const t = useT();
  const b = t.bk;
  const { l } = usePreferences();
  const toast = useToast();
  const errorText = useErrorLine();
  const info = useQuery({ queryKey: ['platform', 'demo', tenant?.id], queryFn: () => api.get<DemoInfo>(`/platform/tenants/${tenant!.id}/demo-data`), enabled: !!tenant });
  const types = useQuery({ queryKey: ['bank', 'types'], queryFn: () => api.get<{ key: string; label: { en: string; fa: string } }[]>('/platform/bank/types'), enabled: !!tenant });
  const [run, setRun] = useState<{ type: string; mode: 'add' | 'replace'; counts: Record<string, number>; add: string[] }>({ type: '', mode: 'add', counts: {}, add: [] });
  const kit = run.type || info.data?.type || 'general';
  // The kit's tables, then the general kit's, that the site does not have yet (one per address).
  const kitTables = useQuery({
    queryKey: ['bank', 'tables', 'missing', kit],
    queryFn: async () => {
      const lists = await Promise.all([...new Set([kit, 'general'])].map((k) => api.get<{ id: string; slug: string; label: { en: string; fa: string }; items: number }[]>(`/platform/bank/tables?type=${k}`)));
      return lists.flat().filter((x, i, all) => all.findIndex((y) => y.slug === x.slug) === i);
    },
    enabled: !!tenant && !!info.data,
  });
  const missing = (kitTables.data ?? []).filter((x) => !info.data?.tables.some((t) => t.slug === x.slug));
  const n = (key: string, fallback: number) => run.counts[key] ?? fallback;
  const setN = (key: string, v: number | null) => setRun((r) => ({ ...r, counts: { ...r.counts, [key]: Math.max(0, v ?? 0) } }));
  const generate = useMutation({
    mutationFn: () => {
      const d = info.data!;
      const adding = missing.filter((x) => run.add.includes(x.id));
      const tables = Object.fromEntries([...d.tables, ...adding].map((x) => [x.slug, n(`table:${x.slug}`, 6)]));
      return api.post<Record<string, number>>(`/platform/tenants/${tenant!.id}/demo-data`, {
        type: run.type || d.type,
        mode: run.mode,
        addTables: adding.map((x) => x.id),
        products: d.modules.products ? n('products', 10) : 0,
        services: d.modules.services ? n('services', 4) : 0,
        tables,
        customers: n('customers', 15),
        orders: d.modules.orders ? n('orders', 20) : 0,
        payments: n('payments', 10),
        requests: d.modules.leads ? n('requests', 15) : 0,
        months: Math.max(1, n('months', 6)),
      });
    },
    onSuccess: (r) => {
      toast(`${b.generated}: ${Object.entries(r).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
      setRun((x) => ({ ...x, add: [] }));
      info.refetch();
    },
    onError: (e) => toast(errorText(e), 'bad'),
  });
  const clear = useMutation({
    mutationFn: () => api.delete(`/platform/tenants/${tenant!.id}/demo-data`),
    onSuccess: () => {
      toast(t.su.demoCleared);
      info.refetch();
    },
    onError: (e) => toast(errorText(e), 'bad'),
  });
  const close = () => {
    setRun({ type: '', mode: 'add', counts: {}, add: [] });
    onClose();
  };
  const d = info.data;
  const total = d ? Object.values(d.demo).reduce((a, x) => a + x, 0) : 0;
  const row = (key: string, label: string, now: number | undefined, fallback: number) => (
    <NumberField key={key} label={`${label}${now !== undefined ? ` (${b.now}: ${now})` : ''}`} min={0} value={n(key, fallback)} onChange={(v) => setN(key, v)} />
  );
  return (
    <Modal open={!!tenant} onClose={close} title={`${t.su.demoData}: ${tenant?.name ?? ''}`} wide>
      {info.isLoading || !d ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-5">
          <ErrorNote error={info.error} />
          <section className="flex flex-col gap-3">
            <p className="text-sm text-ink-soft">{total ? t.su.demoCounts : t.su.noDemo}</p>
            {total > 0 && (
              <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                {Object.entries(d.demo).map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-3 border-b border-line py-1">
                    <span className="text-ink-soft">{k}</span>
                    <span className="font-mono">{v}</span>
                  </li>
                ))}
              </ul>
            )}
            {total > 0 && (
              <div className="flex justify-end">
                <ConfirmButton label={t.su.clearDemo} confirmText={t.su.clearDemoConfirm} onConfirm={() => clear.mutate()} disabled={clear.isPending} />
              </div>
            )}
          </section>
          <form
            className="flex flex-col gap-4 border-t border-line pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              generate.mutate();
            }}
          >
            <h3 className="font-medium text-ink">{b.genTitle}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label={b.genType} value={run.type || d.type} onChange={(type) => setRun((r) => ({ ...r, type, add: [] }))} options={(types.data ?? []).map((x) => ({ value: x.key, label: l(x.label) || x.key }))} />
              <SelectField label={b.genMode} value={run.mode} onChange={(mode) => setRun((r) => ({ ...r, mode }))} options={[{ value: 'add', label: b.modeAdd }, { value: 'replace', label: b.modeReplace }]} />
            </div>
            {missing.length > 0 && (
              <fieldset className="flex flex-col gap-2 rounded-md border border-line p-3">
                <legend className="px-1 text-xs font-medium text-ink-soft">{b.addKitTables}</legend>
                {missing.map((x) => (
                  <Checkbox
                    key={x.id}
                    label={`${l(x.label) || x.slug} (/${x.slug}, ${x.items} ${b.itemsCount})`}
                    checked={run.add.includes(x.id)}
                    onChange={(on) => setRun((r) => ({ ...r, add: on ? [...r.add, x.id] : r.add.filter((y) => y !== x.id) }))}
                  />
                ))}
                <p className="text-xs text-ink-soft">{b.addKitTablesHint}</p>
              </fieldset>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              {d.modules.products && row('products', t.products, d.all.products, 10)}
              {d.modules.services && row('services', b.services, d.all.services, 4)}
              {d.tables.map((x) => row(`table:${x.slug}`, l(x.name) || x.slug, x.items, 6))}
              {missing.filter((x) => run.add.includes(x.id)).map((x) => row(`table:${x.slug}`, `${l(x.label) || x.slug} (${b.newTable})`, undefined, 6))}
              {row('customers', b.customers, d.all.customers, 15)}
              {d.modules.orders && row('orders', t.orders, d.all.orders, 20)}
              {d.modules.leads && row('requests', t.su.dRequests, d.all.requests, 15)}
              {row('payments', t.su.dPayments, undefined, 10)}
              {row('months', b.months, undefined, 6)}
            </div>
            <p className="text-xs text-ink-soft">{t.su.demoPassword}</p>
            <div className="flex justify-end">
              <Button type="submit" disabled={generate.isPending}>
                {generate.isPending ? b.generating : b.generate}
              </Button>
            </div>
          </form>
          <p className="text-xs text-ink-soft">{t.su.demoHint}</p>
        </div>
      )}
    </Modal>
  );
}

function OwnerModal({ tenant, onClose, onSaved }: { tenant: Tenant | null; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const [email, setEmail] = useState('');
  const save = useMutation({
    mutationFn: () => api.put(`/platform/tenants/${tenant!.id}/owner`, { email }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  return (
    <Modal open={!!tenant} onClose={onClose} title={`${t.changeOwner}: ${tenant?.name ?? ''}`}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <TextField label={t.ownerEmail} type="email" dir="ltr" value={email} onChange={setEmail} required />
        <ErrorNote error={save.error} />
        <div className="flex justify-end">
          <Button type="submit" disabled={save.isPending}>
            {t.save}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

interface UserRow {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  isPlatformAdmin: boolean;
  status: 'active' | 'disabled';
  emailVerified: boolean;
  createdAt: string;
}

function UsersPage() {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const errorText = useErrorLine();
  const { formatDate } = usePreferences();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: '', displayName: '', isPlatformAdmin: false });
  const list = useQuery({ queryKey: ['platform', 'users', page], queryFn: () => apiRequest<UserRow[]>(`/platform/users?page=${page}`), placeholderData: keepPreviousData });
  const create = useMutation({
    mutationFn: () => api.post('/platform/users', form),
    onSuccess: () => {
      setOpen(false);
      setForm({ email: '', displayName: '', isPlatformAdmin: false });
      qc.invalidateQueries({ queryKey: ['platform', 'users'] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/platform/users/${id}`),
    onSuccess: () => {
      toast(t.userDeleted);
      qc.invalidateQueries({ queryKey: ['platform', 'users'] });
    },
    onError: (e) => toast(errorText(e), 'bad'),
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'disabled' }) => api.patch(`/platform/users/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform', 'users'] }),
    onError: (e) => toast(errorText(e), 'bad'),
  });

  return (
    <>
      <PageTitle title={t.users} actions={<Button onClick={() => setOpen(true)}>{t.newUser}</Button>} />
      {list.isLoading ? (
        <Spinner />
      ) : (
        <>
          <Table head={[t.email, t.name, t.status, t.created, t.actions]}>
            {list.data?.data.map((u) => (
              <tr key={u.id}>
                <Td>
                  <span dir="ltr">{u.email ?? u.phone}</span> {u.isPlatformAdmin && <Badge tone="accent">{t.platformAdmin}</Badge>}
                </Td>
                <Td>{u.displayName || '—'}</Td>
                <Td>
                  <Badge tone={u.status === 'active' ? 'good' : 'bad'}>{u.status}</Badge> {!u.emailVerified && <Badge>{t.notVerified}</Badge>}
                </Td>
                <Td className="text-xs text-ink-soft">{formatDate(u.createdAt)}</Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: u.id, status: u.status === 'active' ? 'disabled' : 'active' })}>
                      {u.status === 'active' ? t.disable : t.enable}
                    </Button>
                    <ConfirmButton label={t.deleteUser} confirmText={t.deleteUserConfirm} variant="ghost" onConfirm={() => remove.mutate(u.id)} disabled={remove.isPending} />
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} totalPages={list.data?.meta?.totalPages ?? 1} onChange={setPage} />
        </>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={t.newUser}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <TextField label={t.email} type="email" dir="ltr" value={form.email} onChange={(email) => setForm((f) => ({ ...f, email }))} required />
          <TextField label={t.name} value={form.displayName} onChange={(displayName) => setForm((f) => ({ ...f, displayName }))} />
          <Checkbox label={t.platformAdmin} checked={form.isPlatformAdmin} onChange={(isPlatformAdmin) => setForm((f) => ({ ...f, isPlatformAdmin }))} />
          <ErrorNote error={create.error} />
          <div className="flex justify-end">
            <Button type="submit" disabled={create.isPending}>
              {t.create}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function AuditPage() {
  const t = useT();
  const { formatDate } = usePreferences();
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ['platform', 'audit', page],
    queryFn: () => api.get<{ id: number; action: string; target: string | null; tenantId: string | null; createdAt: string; metadata: unknown }[]>(`/platform/audit?page=${page}&pageSize=50`),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageTitle title={t.audit} />
      {list.isLoading ? (
        <Spinner />
      ) : (
        <>
          <Table head={[t.when, t.action, t.target]}>
            {list.data?.map((e) => (
              <tr key={e.id}>
                <Td className="text-xs whitespace-nowrap text-ink-soft">{formatDate(e.createdAt)}</Td>
                <Td className="font-mono text-xs">{e.action}</Td>
                <Td className="max-w-md truncate text-xs" >
                  <span dir="ltr">{e.target ?? ''}</span>
                </Td>
              </tr>
            ))}
          </Table>
          <div className="mt-4 flex justify-end gap-3">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              {t.previous}
            </Button>
            <Button size="sm" variant="outline" disabled={(list.data?.length ?? 0) < 50} onClick={() => setPage((p) => p + 1)}>
              {t.next}
            </Button>
          </div>
        </>
      )}
    </>
  );
}

export default function PlatformPages() {
  return (
    <Routes>
      <Route path="sites" element={<SitesPage />} />
      <Route
        path="sites/new"
        element={
          <Suspense fallback={<Spinner />}>
            <SiteSetupPage />
          </Suspense>
        }
      />
      <Route path="users" element={<UsersPage />} />
      <Route path="audit" element={<AuditPage />} />
      <Route
        path="messaging"
        element={
          <Suspense fallback={<Spinner />}>
            <MessagingPage />
          </Suspense>
        }
      />
      <Route
        path="bank"
        element={
          <Suspense fallback={<Spinner />}>
            <BankPage />
          </Suspense>
        }
      />
      <Route
        path="starters/:kind?"
        element={
          <Suspense fallback={<Spinner />}>
            <StartersPage />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="sites" replace />} />
    </Routes>
  );
}
