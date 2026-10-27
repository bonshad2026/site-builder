import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { api, apiRequest } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import type { OrderItemDto, OrderStatus, PaymentStatus } from '../../types/api';
import { useSiteInfo } from '../AdminRoot';
import { useT } from '../i18n';
import { Badge, ErrorNote, Modal, PageTitle, Pagination, SelectField, Spinner, Table, Td, TextField, useToast } from '../ui';

interface Lead {
  id: string;
  type: string;
  name: string;
  email: string;
  phone: string;
  projectType: string | null;
  budget: string | null;
  message: string;
  sourcePath: string | null;
  status: 'new' | 'contacted' | 'qualified' | 'closed';
  notes: { text: string; at: string }[];
  createdAt: string;
}

interface Order {
  id: string;
  number: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  customer: { name: string; email: string; phone: string; address?: string };
  note: string | null;
  currency: string;
  totalMinor: string;
  createdAt: string;
  items?: OrderItemDto[];
  payments?: { id: string; provider: string; isTest: boolean; status: string; refId: string | null; failureReason: string | null; createdAt: string }[];
}

const leadTone = { new: 'accent', contacted: 'neutral', qualified: 'good', closed: 'neutral' } as const;
export const paymentTone = (s: PaymentStatus) => (s === 'paid' ? 'good' : s === 'test_paid' ? 'warn' : s === 'failed' ? 'bad' : 'neutral');

function LeadDetail({ siteId, id, onClose }: { siteId: string; id: string | null; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const { formatDate } = usePreferences();
  const { data: info } = useSiteInfo(siteId);
  const canWrite = !!info?.permissions.includes('leads:write');
  const [note, setNote] = useState('');
  const lead = useQuery({ queryKey: ['site', siteId, 'leads', 'one', id], queryFn: () => api.get<Lead>(`/sites/${siteId}/leads/${id}`), enabled: !!id });
  const update = useMutation({
    mutationFn: (body: { status?: string; note?: string }) => api.patch<Lead>(`/sites/${siteId}/leads/${id}`, body),
    onSuccess: () => {
      setNote('');
      qc.invalidateQueries({ queryKey: ['site', siteId, 'leads'] });
    },
  });
  const l = lead.data;
  return (
    <Modal open={!!id} onClose={onClose} title={l?.name ?? t.loading} wide>
      {!l ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-5 text-sm">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-soft">{t.email}</dt>
              <dd dir="ltr">
                <a href={`mailto:${l.email}`} className="hover:underline">
                  {l.email}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-soft">{t.phone}</dt>
              <dd dir="ltr">{l.phone || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-soft">{t.type}</dt>
              <dd>
                {l.type}
                {l.projectType ? ` · ${l.projectType}` : ''}
                {l.budget ? ` · ${l.budget}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-soft">{t.created}</dt>
              <dd>
                {formatDate(l.createdAt)} {l.sourcePath && <span className="text-ink-soft">({l.sourcePath})</span>}
              </dd>
            </div>
          </dl>
          <div>
            <p className="mb-1 text-xs text-ink-soft">{t.message}</p>
            <p className="whitespace-pre-wrap border border-line bg-surface p-4">{l.message}</p>
          </div>
          {l.notes.length > 0 && (
            <div>
              <p className="mb-1 text-xs text-ink-soft">{t.notes}</p>
              <ul className="space-y-2">
                {l.notes.map((n, i) => (
                  <li key={i} className="border-s-2 border-accent ps-3">
                    {n.text} <span className="text-xs text-ink-soft">{formatDate(n.at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {canWrite && (
            <div className="grid gap-4 sm:grid-cols-[200px_1fr_auto] sm:items-end">
              <SelectField
                label={t.status}
                value={l.status}
                onChange={(status) => update.mutate({ status })}
                options={(['new', 'contacted', 'qualified', 'closed'] as const).map((s) => ({ value: s, label: s }))}
              />
              <TextField label={t.addNote} value={note} onChange={setNote} />
              <Button size="sm" disabled={!note.trim() || update.isPending} onClick={() => update.mutate({ note })}>
                {t.add}
              </Button>
            </div>
          )}
          <ErrorNote error={update.error} />
        </div>
      )}
    </Modal>
  );
}

function OrderDetail({ siteId, id, onClose }: { siteId: string; id: string | null; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const { l, formatMoney, formatDate } = usePreferences();
  const { data: info } = useSiteInfo(siteId);
  const canWrite = !!info?.permissions.includes('orders:write');
  const order = useQuery({ queryKey: ['site', siteId, 'orders', 'one', id], queryFn: () => api.get<Order>(`/sites/${siteId}/orders/${id}`), enabled: !!id });
  const setStatus = useMutation({
    mutationFn: (status: OrderStatus) => api.patch(`/sites/${siteId}/orders/${id}`, { status }),
    onSuccess: () => {
      toast(t.saved);
      qc.invalidateQueries({ queryKey: ['site', siteId, 'orders'] });
    },
  });
  const o = order.data;
  return (
    <Modal open={!!id} onClose={onClose} title={o ? `#${o.number}` : t.loading} wide>
      {!o ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-5 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge>{o.status}</Badge>
            <Badge tone={paymentTone(o.paymentStatus)}>{o.paymentStatus}</Badge>
            <span className="text-ink-soft">{formatDate(o.createdAt)}</span>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-soft">{t.customer}</dt>
              <dd>{o.customer.name}</dd>
              <dd dir="ltr" className="text-ink-soft">
                {o.customer.email} · {o.customer.phone}
              </dd>
            </div>
            {o.customer.address && (
              <div>
                <dt className="text-xs text-ink-soft">{t.address}</dt>
                <dd className="whitespace-pre-wrap">{o.customer.address}</dd>
              </div>
            )}
          </dl>
          {o.note && <p className="border border-line bg-surface p-3 whitespace-pre-wrap">{o.note}</p>}
          <Table head={[t.items, t.price, t.total]}>
            {o.items?.map((it, i) => (
              <tr key={i}>
                <Td>
                  {l(it.productName)} × {it.quantity}
                </Td>
                <Td className="text-xs">{formatMoney(it.unitPriceMinor, o.currency)}</Td>
                <Td className="text-xs">{formatMoney(it.lineTotalMinor, o.currency)}</Td>
              </tr>
            ))}
            <tr>
              <Td className="font-medium">{t.total}</Td>
              <Td>{''}</Td>
              <Td className="font-medium">{formatMoney(o.totalMinor, o.currency)}</Td>
            </tr>
          </Table>
          {o.payments && o.payments.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-ink-soft">{t.payment}</p>
              <ul className="space-y-1 text-xs">
                {o.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap gap-2">
                    <Badge tone={p.status === 'succeeded' ? (p.isTest ? 'warn' : 'good') : p.status === 'failed' ? 'bad' : 'neutral'}>{p.status}</Badge>
                    {p.provider}
                    {p.isTest && ` (${t.testPayment})`}
                    {p.refId && ` · ${t.ref}: ${p.refId}`}
                    {p.failureReason && <span className="text-danger">· {p.failureReason}</span>}
                    <span className="text-ink-soft">{formatDate(p.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {canWrite && (
            <div className="flex flex-wrap gap-3">
              {o.status === 'pending' && (
                <Button size="sm" onClick={() => setStatus.mutate('confirmed')}>
                  {t.confirm}
                </Button>
              )}
              {o.status === 'confirmed' && (
                <Button size="sm" onClick={() => setStatus.mutate('fulfilled')}>
                  {t.fulfil}
                </Button>
              )}
              {(o.status === 'pending' || o.status === 'confirmed') && (
                <Button size="sm" variant="outline" onClick={() => window.confirm(t.confirmDelete) && setStatus.mutate('cancelled')}>
                  {t.cancelOrder}
                </Button>
              )}
            </div>
          )}
          <ErrorNote error={setStatus.error} />
        </div>
      )}
    </Modal>
  );
}

export default function InboxPages({ siteId, kind }: { siteId: string; kind: 'leads' | 'orders' }) {
  const t = useT();
  const { formatDate, formatMoney } = usePreferences();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const open = params.get('open');
  const list = useQuery({
    queryKey: ['site', siteId, kind, page, status],
    queryFn: () => apiRequest<(Lead | Order)[]>(`/sites/${siteId}/${kind}?page=${page}&pageSize=20${status ? `&status=${status}` : ''}`),
    placeholderData: keepPreviousData,
  });
  const statuses = kind === 'leads' ? ['new', 'contacted', 'qualified', 'closed'] : ['pending', 'confirmed', 'fulfilled', 'cancelled'];
  const openItem = (id: string | null) => setParams(id ? { open: id } : {}, { replace: true });

  return (
    <>
      <PageTitle title={kind === 'leads' ? t.leads : t.orders} />
      <div className="mb-4 max-w-xs">
        <SelectField label={t.status} value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: '', label: '—' }, ...statuses.map((s) => ({ value: s, label: s }))]} />
      </div>
      {list.isLoading ? (
        <Spinner />
      ) : (
        <>
          <ErrorNote error={list.error} />
          {kind === 'leads' ? (
            <Table head={[t.name, t.type, t.status, t.created]}>
              {(list.data?.data as Lead[]).map((l) => (
                <tr key={l.id} className="cursor-pointer hover:bg-surface-2" onClick={() => openItem(l.id)}>
                  <Td>
                    <button type="button" className="font-medium hover:underline" onClick={() => openItem(l.id)}>
                      {l.name}
                    </button>
                    <div className="text-xs text-ink-soft" dir="ltr">
                      {l.email}
                    </div>
                  </Td>
                  <Td className="text-xs">{l.type}</Td>
                  <Td>
                    <Badge tone={leadTone[l.status]}>{l.status}</Badge>
                  </Td>
                  <Td className="text-xs text-ink-soft">{formatDate(l.createdAt)}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Table head={['#', t.customer, t.total, t.status, t.payment, t.created]}>
              {(list.data?.data as Order[]).map((o) => (
                <tr key={o.id} className="cursor-pointer hover:bg-surface-2" onClick={() => openItem(o.id)}>
                  <Td>
                    <button type="button" className="font-medium hover:underline" onClick={() => openItem(o.id)}>
                      #{o.number}
                    </button>
                  </Td>
                  <Td>{o.customer.name}</Td>
                  <Td className="text-xs">{formatMoney(o.totalMinor, o.currency)}</Td>
                  <Td>
                    <Badge>{o.status}</Badge>
                  </Td>
                  <Td>
                    <Badge tone={paymentTone(o.paymentStatus)}>{o.paymentStatus}</Badge>
                  </Td>
                  <Td className="text-xs text-ink-soft">{formatDate(o.createdAt)}</Td>
                </tr>
              ))}
            </Table>
          )}
          <Pagination page={page} totalPages={list.data?.meta?.totalPages ?? 1} onChange={setPage} />
        </>
      )}
      {kind === 'leads' ? <LeadDetail siteId={siteId} id={open} onClose={() => openItem(null)} /> : <OrderDetail siteId={siteId} id={open} onClose={() => openItem(null)} />}
    </>
  );
}
