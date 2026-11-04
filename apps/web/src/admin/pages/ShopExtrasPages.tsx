import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { api, apiRequest } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import { ExcelButton, excelDate, fetchAll, listTotal } from '../ExcelExport';
import { useT } from '../i18n';
import { Badge, Checkbox, ConfirmButton, Empty, ErrorNote, Modal, NumberField, PageTitle, Pagination, SelectField, Spinner, Table, Td, TextField, useErrorLine, useToast } from '../ui';

/* ---------- discount codes ---------- */

interface Coupon {
  id: string;
  code: string;
  kind: 'percent' | 'amount';
  value: number;
  minOrderMinor: string;
  maxUses: number | null;
  usedCount: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
}
type CouponForm = Omit<Coupon, 'id' | 'usedCount' | 'minOrderMinor'> & { minOrderMinor: number };

const blankCoupon: CouponForm = { code: '', kind: 'percent', value: 10, minOrderMinor: 0, maxUses: null, startsAt: null, endsAt: null, active: true };
/** A datetime-local value ↔ ISO time. */
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

export function CouponsPage({ siteId }: { siteId: string }) {
  const t = useT();
  const x = t.sx;
  const qc = useQueryClient();
  const toast = useToast();
  const errorText = useErrorLine();
  const { formatDate, formatMoney, formatNumber } = usePreferences();
  const list = useQuery({ queryKey: ['site', siteId, 'coupons'], queryFn: () => apiRequest<Coupon[]>(`/sites/${siteId}/shop/coupons`) });
  const [editing, setEditing] = useState<(CouponForm & { id?: string }) | null>(null);
  const save = useMutation({
    mutationFn: (c: CouponForm & { id?: string }) => {
      const { id, ...body } = c;
      return id ? api.put(`/sites/${siteId}/shop/coupons/${id}`, body) : api.post(`/sites/${siteId}/shop/coupons`, body);
    },
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['site', siteId, 'coupons'] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/sites/${siteId}/shop/coupons/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['site', siteId, 'coupons'] }),
    onError: (e) => toast(errorText(e), 'bad'),
  });
  const valueText = (c: Coupon) => (c.kind === 'percent' ? `${formatNumber(c.value)}٪` : formatMoney(String(c.value), 'IRR'));
  return (
    <>
      <PageTitle
        title={x.coupons}
        actions={
          <>
            <ExcelButton
              name={x.coupons}
              count={listTotal(list.data)}
              rows={async () => [
                [x.code, x.kind, x.value, x.minOrder, x.maxUses, x.used, x.starts, x.ends, x.active],
                ...(list.data?.data ?? []).map((c) => [c.code, c.kind, c.value, Number(c.minOrderMinor), c.maxUses ?? '', c.usedCount, excelDate(c.startsAt), excelDate(c.endsAt), c.active ? '✓' : '']),
              ]}
            />
            <Button onClick={() => setEditing({ ...blankCoupon })}>{x.newCoupon}</Button>
          </>
        }
      />
      {list.isLoading ? (
        <Spinner />
      ) : list.data?.data.length ? (
        <Table head={[x.code, x.value, x.minOrder, x.used, x.ends, x.active, t.actions]}>
          {list.data.data.map((c) => (
            <tr key={c.id}>
              <Td className="font-mono">{c.code}</Td>
              <Td>{valueText(c)}</Td>
              <Td>{Number(c.minOrderMinor) ? formatMoney(c.minOrderMinor, 'IRR') : '—'}</Td>
              <Td>
                {formatNumber(c.usedCount)}
                {c.maxUses !== null ? ` / ${formatNumber(c.maxUses)}` : ''}
              </Td>
              <Td className="text-xs">{c.endsAt ? formatDate(c.endsAt) : '—'}</Td>
              <Td>{c.active ? <Badge tone="good">{x.active}</Badge> : <Badge>—</Badge>}</Td>
              <Td>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing({ ...c, minOrderMinor: Number(c.minOrderMinor) })}>
                    {t.edit}
                  </Button>
                  <ConfirmButton label={t.delete} confirmText={`${t.delete}: ${c.code}?`} variant="ghost" onConfirm={() => remove.mutate(c.id)} />
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty />
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? editing.code : x.newCoupon}>
        {editing && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(editing);
            }}
          >
            <TextField label={x.code} dir="ltr" value={editing.code} onChange={(code) => setEditing({ ...editing, code: code.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} required />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label={x.kind} value={editing.kind} onChange={(kind) => setEditing({ ...editing, kind })} options={[{ value: 'percent', label: x.percent }, { value: 'amount', label: x.amount }]} />
              <NumberField label={x.value} min={1} value={editing.value} onChange={(v) => setEditing({ ...editing, value: v ?? 1 })} />
              <NumberField label={x.minOrder} min={0} value={editing.minOrderMinor} onChange={(v) => setEditing({ ...editing, minOrderMinor: v ?? 0 })} />
              <NumberField label={x.maxUses} min={1} value={editing.maxUses} onChange={(maxUses) => setEditing({ ...editing, maxUses })} />
              <TextField label={x.starts} type="datetime-local" dir="ltr" value={toLocal(editing.startsAt)} onChange={(v) => setEditing({ ...editing, startsAt: fromLocal(v) })} />
              <TextField label={x.ends} type="datetime-local" dir="ltr" value={toLocal(editing.endsAt)} onChange={(v) => setEditing({ ...editing, endsAt: fromLocal(v) })} />
            </div>
            <Checkbox label={x.active} checked={editing.active} onChange={(active) => setEditing({ ...editing, active })} />
            <ErrorNote error={save.error} />
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                {t.cancel}
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {t.save}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

/* ---------- reviews ---------- */

interface Review {
  id: string;
  name: string;
  rating: number;
  text: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  productSlug: string;
  productName: { en: string; fa: string };
}

export function ReviewsPage({ siteId }: { siteId: string }) {
  const t = useT();
  const x = t.sx;
  const qc = useQueryClient();
  const { l, formatDate } = usePreferences();
  const [status, setStatus] = useState<'' | Review['status']>('pending');
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ['site', siteId, 'reviews', status, page],
    queryFn: () => apiRequest<Review[]>(`/sites/${siteId}/shop/reviews?page=${page}&pageSize=20${status ? `&status=${status}` : ''}`),
    placeholderData: keepPreviousData,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['site', siteId, 'reviews'] });
  const setReview = useMutation({ mutationFn: ({ id, s }: { id: string; s: Review['status'] }) => api.patch(`/sites/${siteId}/shop/reviews/${id}`, { status: s }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/sites/${siteId}/shop/reviews/${id}`), onSuccess: refresh });
  const statusLabel = { pending: x.pending, approved: x.approved, rejected: x.rejected };
  return (
    <>
      <PageTitle
        title={x.reviews}
        actions={
          <ExcelButton
            name={x.reviews}
            count={listTotal(list.data)}
            rows={async () => {
              const all = await fetchAll<Review>(`/sites/${siteId}/shop/reviews${status ? `?status=${status}` : ''}`);
              return [[x.product, t.name, x.rating, x.reviews, t.status, t.created], ...all.map((r) => [l(r.productName), r.name, r.rating, r.text, statusLabel[r.status], excelDate(r.createdAt)])];
            }}
          />
        }
      />
      <div className="mb-4 max-w-xs">
        <SelectField
          label={t.status}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[{ value: '', label: '—' }, { value: 'pending', label: x.pending }, { value: 'approved', label: x.approved }, { value: 'rejected', label: x.rejected }]}
        />
      </div>
      {list.isLoading ? (
        <Spinner />
      ) : list.data?.data.length ? (
        <>
          <Table head={[x.product, t.name, x.rating, x.reviews, t.status, t.actions]}>
            {list.data.data.map((r) => (
              <tr key={r.id}>
                <Td>{l(r.productName)}</Td>
                <Td>
                  {r.name}
                  <div className="text-xs text-ink-soft">{formatDate(r.createdAt)}</div>
                </Td>
                <Td className="text-accent">{'★'.repeat(r.rating)}</Td>
                <Td className="max-w-md text-sm">{r.text}</Td>
                <Td>
                  <Badge tone={r.status === 'approved' ? 'good' : r.status === 'rejected' ? 'bad' : 'warn'}>{statusLabel[r.status]}</Badge>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    {r.status !== 'approved' && (
                      <Button size="sm" variant="outline" onClick={() => setReview.mutate({ id: r.id, s: 'approved' })}>
                        {x.approve}
                      </Button>
                    )}
                    {r.status !== 'rejected' && (
                      <Button size="sm" variant="ghost" onClick={() => setReview.mutate({ id: r.id, s: 'rejected' })}>
                        {x.reject}
                      </Button>
                    )}
                    <ConfirmButton label={t.delete} confirmText={`${t.delete}?`} variant="ghost" onConfirm={() => remove.mutate(r.id)} />
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} totalPages={(list.data.meta?.totalPages as number) ?? 1} onChange={setPage} />
        </>
      ) : (
        <Empty />
      )}
    </>
  );
}

/* ---------- newsletter ---------- */

interface Subscriber {
  id: string;
  contact: string;
  name: string;
  sourcePath: string | null;
  createdAt: string;
}

export function SubscribersPage({ siteId }: { siteId: string }) {
  const t = useT();
  const x = t.sx;
  const qc = useQueryClient();
  const { formatDate } = usePreferences();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const list = useQuery({
    queryKey: ['site', siteId, 'subscribers', page, q],
    queryFn: () => apiRequest<Subscriber[]>(`/sites/${siteId}/shop/subscribers?page=${page}&pageSize=50${q ? `&q=${encodeURIComponent(q)}` : ''}`),
    placeholderData: keepPreviousData,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/sites/${siteId}/shop/subscribers/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['site', siteId, 'subscribers'] }) });
  return (
    <>
      <PageTitle
        title={x.subscribers}
        actions={
          <ExcelButton
            name={x.subscribers}
            count={listTotal(list.data)}
            rows={async () => {
              const all = await fetchAll<Subscriber>(`/sites/${siteId}/shop/subscribers${q ? `?q=${encodeURIComponent(q)}` : ''}`);
              return [[x.contact, t.name, x.source, t.created], ...all.map((s) => [s.contact, s.name, s.sourcePath ?? '', excelDate(s.createdAt)])];
            }}
          />
        }
      />
      <div className="mb-4 max-w-xs">
        <TextField
          label={t.search}
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
        />
      </div>
      {list.isLoading ? (
        <Spinner />
      ) : list.data?.data.length ? (
        <>
          <Table head={[x.contact, t.name, x.source, t.created, t.actions]}>
            {list.data.data.map((s) => (
              <tr key={s.id}>
                <Td>
                  <span dir="ltr">{s.contact}</span>
                </Td>
                <Td>{s.name || '—'}</Td>
                <Td className="text-xs" >
                  <span dir="ltr">{s.sourcePath ?? ''}</span>
                </Td>
                <Td className="text-xs text-ink-soft">{formatDate(s.createdAt)}</Td>
                <Td>
                  <ConfirmButton label={t.delete} confirmText={`${t.delete}: ${s.contact}?`} variant="ghost" onConfirm={() => remove.mutate(s.id)} />
                </Td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} totalPages={(list.data.meta?.totalPages as number) ?? 1} onChange={setPage} />
        </>
      ) : (
        <Empty />
      )}
    </>
  );
}

export default function ShopExtrasPages({ siteId, view }: { siteId: string; view: 'coupons' | 'reviews' | 'subscribers' }) {
  if (view === 'coupons') return <CouponsPage siteId={siteId} />;
  if (view === 'reviews') return <ReviewsPage siteId={siteId} />;
  return <SubscribersPage siteId={siteId} />;
}
