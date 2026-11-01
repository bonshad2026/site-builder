import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button';
import { api, apiRequest } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import { useAdminSettings, useSiteInfo } from '../AdminRoot';
import { Badge, ErrorNote, Modal, PageTitle, Pagination, Spinner, Table, Td, TextField } from '../ui';
import { L, useL } from './common';
import { ExcelButton, excelDate, fetchAll, listTotal } from '../ExcelExport';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: 'active' | 'blocked';
  createdAt: string;
  lastLoginAt: string | null;
  requests: number;
  orders: number;
}

function CustomerDetail({ siteId, customer, onClose }: { siteId: string; customer: Customer | null; onClose: () => void }) {
  const t = useL();
  const qc = useQueryClient();
  const { formatDate } = usePreferences();
  const { data: info } = useSiteInfo(siteId);
  const id = customer?.id;
  const requests = useQuery({
    queryKey: ['site', siteId, 'leads', 'customer', id],
    queryFn: () => api.get<{ id: string; number: string; type: string; stage: string; createdAt: string }[]>(`/sites/${siteId}/leads?customerId=${id}&pageSize=100`),
    enabled: !!id,
  });
  const orders = useQuery({
    queryKey: ['site', siteId, 'orders', 'customer', id],
    queryFn: () => api.get<{ id: string; number: string; status: string; createdAt: string }[]>(`/sites/${siteId}/orders?customerId=${id}&pageSize=100`),
    enabled: !!id && !!info?.permissions.includes('orders:read'),
  });
  const block = useMutation({
    mutationFn: (status: 'active' | 'blocked') => api.patch(`/sites/${siteId}/customers/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['site', siteId, 'customers'] });
      onClose();
    },
  });
  return (
    <Modal open={!!customer} onClose={onClose} title={customer?.name ?? ''} wide>
      {customer && (
        <div className="flex flex-col gap-5 text-sm">
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-ink-soft">{t(L('Phone', 'تلفن'))}</dt>
              <dd dir="ltr" className="text-start">{customer.phone ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-soft">{t(L('Email', 'ایمیل'))}</dt>
              <dd dir="ltr" className="text-start">{customer.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-soft">{t(L('Joined', 'تاریخ عضویت'))}</dt>
              <dd>{formatDate(customer.createdAt)}</dd>
            </div>
          </dl>
          <section>
            <h3 className="mb-2 text-xs font-medium text-ink-soft">{t(L('Requests', 'درخواست‌ها'))}</h3>
            {requests.isLoading ? (
              <Spinner />
            ) : requests.data?.length ? (
              <ul className="flex flex-col gap-1">
                {requests.data.map((r) => (
                  <li key={r.id}>
                    <Link to={`/admin/sites/${siteId}/leads?state=all&open=${r.id}`} className="hover:underline">
                      R{r.number} · {r.type} · {r.stage}
                    </Link>{' '}
                    <span className="text-xs text-ink-soft">{formatDate(r.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-soft">—</p>
            )}
          </section>
          {orders.data && (
            <section>
              <h3 className="mb-2 text-xs font-medium text-ink-soft">{t(L('Orders', 'سفارش‌ها'))}</h3>
              {orders.data.length ? (
                <ul className="flex flex-col gap-1">
                  {orders.data.map((o) => (
                    <li key={o.id}>
                      <Link to={`/admin/sites/${siteId}/orders?open=${o.id}`} className="hover:underline">
                        #{o.number} · {o.status}
                      </Link>{' '}
                      <span className="text-xs text-ink-soft">{formatDate(o.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink-soft">—</p>
              )}
            </section>
          )}
          {info?.permissions.includes('leads:write') && (
            <div>
              <Button size="sm" variant="outline" disabled={block.isPending} onClick={() => block.mutate(customer.status === 'active' ? 'blocked' : 'active')}>
                {customer.status === 'active' ? t(L('Block this account', 'مسدود کردن حساب')) : t(L('Unblock', 'رفع مسدودی'))}
              </Button>
              <ErrorNote error={block.error} />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Visitors who signed up on the site, with their requests and orders. */
export default function CustomersPage({ siteId }: { siteId: string }) {
  const t = useL();
  const { formatDate } = usePreferences();
  const { data: settings } = useAdminSettings(siteId);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Customer | null>(null);
  const list = useQuery({
    queryKey: ['site', siteId, 'customers', page, search],
    queryFn: () => apiRequest<Customer[]>(`/sites/${siteId}/customers?page=${page}&pageSize=20${search ? `&q=${encodeURIComponent(search)}` : ''}`),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageTitle
        title={t(L('Customers', 'مشتریان'))}
        subtitle={t(L('Visitors who created an account on the site.', 'بازدیدکنندگانی که در سایت حساب کاربری ساخته‌اند.'))}
        actions={
          <ExcelButton
            name={t(L('Customers', 'مشتریان'))}
            count={listTotal(list.data)}
            rows={async () => {
              const list = await fetchAll<Customer>(`/sites/${siteId}/customers${search ? `?q=${encodeURIComponent(search)}` : ''}`);
              return [
                ['نام / Name', 'موبایل / Phone', 'ایمیل / Email', 'وضعیت / Status', 'درخواست‌ها / Requests', 'سفارش‌ها / Orders', 'عضویت / Joined', 'آخرین ورود / Last sign-in'],
                ...list.map((c) => [c.name, c.phone ?? '', c.email ?? '', c.status, c.requests, c.orders, excelDate(c.createdAt), excelDate(c.lastLoginAt)]),
              ];
            }}
          />
        }
      />
      {settings && !settings.accounts?.enabled && (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
          {t(L('Sign-up is off for this site. Turn it on in Settings → Customer accounts.', 'ثبت‌نام برای این سایت خاموش است. از «تنظیمات ← حساب مشتریان» روشنش کنید.'))}
        </p>
      )}
      <form
        className="mb-4 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(q.trim());
        }}
      >
        <TextField label={t(L('Search name, phone or email', 'جستجوی نام، تلفن یا ایمیل'))} value={q} onChange={setQ} className="w-72" />
        <Button size="sm" variant="outline" type="submit">
          {t(L('Search', 'جستجو'))}
        </Button>
      </form>
      {list.isLoading ? (
        <Spinner />
      ) : (
        <>
          <ErrorNote error={list.error} />
          <Table head={[t(L('Name', 'نام')), t(L('Phone / email', 'تلفن / ایمیل')), t(L('Requests', 'درخواست‌ها')), t(L('Orders', 'سفارش‌ها')), t(L('Joined', 'عضویت'))]}>
            {(list.data?.data ?? []).map((c) => (
              <tr key={c.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setOpen(c)}>
                <Td>
                  {c.name} {c.status === 'blocked' && <Badge tone="bad">{t(L('Blocked', 'مسدود'))}</Badge>}
                </Td>
                <Td className="text-xs" >
                  <span dir="ltr">{c.phone ?? c.email}</span>
                </Td>
                <Td>{c.requests}</Td>
                <Td>{c.orders}</Td>
                <Td className="text-xs text-ink-soft">{formatDate(c.createdAt)}</Td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} totalPages={list.data?.meta?.totalPages ?? 1} onChange={setPage} />
        </>
      )}
      <CustomerDetail siteId={siteId} customer={open} onClose={() => setOpen(null)} />
    </>
  );
}
