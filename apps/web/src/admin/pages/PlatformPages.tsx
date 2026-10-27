import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router';
import { Button } from '../../components/ui/Button';
import { api, apiRequest } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import { useT } from '../i18n';
import { Badge, Checkbox, ErrorNote, Modal, PageTitle, Pagination, Spinner, Table, Td, TextField, useToast } from '../ui';

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
}

const statusTone = { active: 'good', provisioning: 'warn', suspended: 'neutral', failed: 'bad' } as const;

function SitesPage() {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const { formatDate } = usePreferences();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
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
  const retry = useMutation({
    mutationFn: (tenant: Tenant) => api.post(`/platform/tenants/${tenant.id}/retry`, {}),
    onSettled: refresh,
    onError: () => toast(t.error, 'bad'),
  });

  return (
    <>
      <PageTitle title={t.sites} actions={<Button onClick={() => setCreating(true)}>{t.newSite}</Button>} />
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
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} totalPages={list.data?.meta?.totalPages ?? 1} onChange={setPage} />
        </>
      )}
      <CreateSiteModal open={creating} onClose={() => setCreating(false)} onCreated={refresh} />
      <OwnerModal tenant={owner} onClose={() => setOwner(null)} onSaved={refresh} />
    </>
  );
}

function CreateSiteModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const t = useT();
  const toast = useToast();
  const [form, setForm] = useState({ slug: '', name: '', ownerEmail: '', domain: '' });
  const create = useMutation({
    mutationFn: () => api.post<Tenant>('/platform/tenants', { ...form, domain: form.domain || undefined }),
    onSuccess: (tenant) => {
      toast(`${tenant.name}: ${tenant.status}`);
      setForm({ slug: '', name: '', ownerEmail: '', domain: '' });
      onCreated();
      onClose();
    },
    onError: () => onCreated(),
  });
  return (
    <Modal open={open} onClose={onClose} title={t.newSite}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <TextField label={t.name} value={form.name} onChange={(name) => setForm((f) => ({ ...f, name }))} required />
        <TextField label={t.siteId} dir="ltr" hint="lowercase-with-hyphens" value={form.slug} onChange={(slug) => setForm((f) => ({ ...f, slug: slug.toLowerCase() }))} required />
        <TextField label={t.ownerEmail} type="email" dir="ltr" value={form.ownerEmail} onChange={(ownerEmail) => setForm((f) => ({ ...f, ownerEmail }))} required />
        <TextField label={t.domain} dir="ltr" value={form.domain} onChange={(domain) => setForm((f) => ({ ...f, domain }))} />
        <p className="text-xs text-ink-soft">{t.provisionNote}</p>
        <ErrorNote error={create.error} />
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? t.provisioning : t.create}
          </Button>
        </div>
      </form>
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
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'disabled' }) => api.patch(`/platform/users/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform', 'users'] }),
    onError: (e) => toast(e.message, 'bad'),
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
                  <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: u.id, status: u.status === 'active' ? 'disabled' : 'active' })}>
                    {u.status === 'active' ? t.disable : t.enable}
                  </Button>
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
      <Route path="users" element={<UsersPage />} />
      <Route path="audit" element={<AuditPage />} />
      <Route path="*" element={<Navigate to="sites" replace />} />
    </Routes>
  );
}
