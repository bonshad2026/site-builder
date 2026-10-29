import { DEFAULT_ORDER_STATUSES, DEFAULT_REQUEST_TYPES } from '@site-builder/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { api, apiRequest } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import type { OrderItemDto, OrderStatus, PaymentStatus } from '../../types/api';
import { useAdminSettings, useSiteInfo } from '../AdminRoot';
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
  /** Reservation / demo answers. */
  details?: { date?: string; time?: string; people?: number; company?: string; answers?: { label: string; value: string }[] };
  createdAt: string;
}

interface Order {
  id: string;
  number: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod?: 'online' | 'cod';
  customer: { name: string; email: string; phone: string; address?: string };
  note: string | null;
  currency: string;
  totalMinor: string;
  createdAt: string;
  items?: OrderItemDto[];
  payments?: { id: string; provider: string; isTest: boolean; status: string; refId: string | null; failureReason: string | null; createdAt: string }[];
}

const leadTone = { new: 'accent', contacted: 'neutral', qualified: 'good', closed: 'neutral' } as const;

/** The shop's order stages (settings) with their names, and where an order may move next (as the server allows). */
function useOrderStages(siteId: string) {
  const { l } = usePreferences();
  const { data: settings } = useAdminSettings(siteId);
  const stages = settings?.shop?.orderStatuses ?? DEFAULT_ORDER_STATUSES;
  const label = (slug: string) => {
    const s = stages.find((x) => x.slug === slug);
    return (s && l(s.label)) || slug;
  };
  const next = (current: string) =>
    current === 'fulfilled' || current === 'cancelled' ? [] : current === 'pending' ? ['confirmed', 'cancelled'] : stages.map((s) => s.slug).filter((s) => s !== current && s !== 'pending');
  return { stages, label, next };
}

/** The site's request types (settings), plus older built-in types that may still be in the inbox. */
function useRequestTypes(siteId: string) {
  const { l } = usePreferences();
  const { data: settings } = useAdminSettings(siteId);
  const types = settings?.requestTypes ?? DEFAULT_REQUEST_TYPES;
  const label = (slug: string) => {
    const known = types.find((x) => x.slug === slug) ?? DEFAULT_REQUEST_TYPES.find((x) => x.slug === slug);
    return (known && l(known.label)) || slug.replace(/_/g, ' ');
  };
  return { types, label };
}
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
  const { label: typeLabel } = useRequestTypes(siteId);
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
                {typeLabel(l.type)}
                {l.projectType ? ` · ${l.projectType}` : ''}
                {l.budget ? ` · ${l.budget}` : ''}
              </dd>
            </div>
            {l.details && [l.details.date, l.details.time, l.details.people, l.details.company].some(Boolean) && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-ink-soft">{t.requestDetails}</dt>
                <dd>
                  {[l.details.date, l.details.time, l.details.people ? `${l.details.people} ${t.people}` : '', l.details.company].filter(Boolean).join(' · ')}
                </dd>
              </div>
            )}
            {l.details?.answers?.map((a, i) => (
              <div key={i}>
                <dt className="text-xs text-ink-soft">{a.label}</dt>
                <dd className="whitespace-pre-wrap">{a.value}</dd>
              </div>
            ))}
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
  const { label: stageLabel, next } = useOrderStages(siteId);
  return (
    <Modal open={!!id} onClose={onClose} title={o ? `#${o.number}` : t.loading} wide>
      {!o ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-5 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge>{stageLabel(o.status)}</Badge>
            <Badge tone={paymentTone(o.paymentStatus)}>{o.paymentStatus}</Badge>
            {o.paymentMethod === 'cod' && <Badge tone="neutral">{t.cod}</Badge>}
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
                  {l(it.productName)}
                  {it.option ? ` (${it.option})` : ''} × {it.quantity}
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
          {canWrite && next(o.status).length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-ink-soft">{t.moveTo}</span>
              {next(o.status).map((st) => (
                <Button
                  key={st}
                  size="sm"
                  variant={st === 'cancelled' ? 'outline' : 'primary'}
                  disabled={setStatus.isPending}
                  onClick={() => (st !== 'cancelled' || window.confirm(t.confirmDelete)) && setStatus.mutate(st as OrderStatus)}
                >
                  {st === 'cancelled' ? t.cancelOrder : stageLabel(st)}
                </Button>
              ))}
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
  // Customer requests can also be narrowed to one request type (?type= keeps it in the URL).
  const type = kind === 'leads' ? (params.get('type') ?? '') : '';
  const { types, label: typeLabel } = useRequestTypes(siteId);
  const open = params.get('open');
  const list = useQuery({
    queryKey: ['site', siteId, kind, page, status, type],
    queryFn: () => apiRequest<(Lead | Order)[]>(`/sites/${siteId}/${kind}?page=${page}&pageSize=20${status ? `&status=${status}` : ''}${type ? `&type=${type}` : ''}`),
    placeholderData: keepPreviousData,
  });
  const { stages, label: stageLabel } = useOrderStages(siteId);
  const statuses = kind === 'leads' ? ['new', 'contacted', 'qualified', 'closed'] : stages.map((s) => s.slug);
  const openItem = (id: string | null) => setParams({ ...(type ? { type } : {}), ...(id ? { open: id } : {}) }, { replace: true });
  const setType = (v: string) => {
    setPage(1);
    setParams(v ? { type: v } : {}, { replace: true });
  };

  return (
    <>
      <PageTitle title={kind === 'leads' ? t.leads : t.orders} />
      {kind === 'leads' && (
        <div role="tablist" aria-label={t.type} className="mb-4 flex flex-wrap gap-2">
          {[{ slug: '', name: t.allTypes }, ...types.map((x) => ({ slug: x.slug, name: typeLabel(x.slug) }))].map((x) => (
            <button
              key={x.slug || 'all'}
              type="button"
              role="tab"
              aria-selected={type === x.slug}
              onClick={() => setType(x.slug)}
              className={`rounded-full border px-3 py-1 text-sm ${type === x.slug ? 'border-ink bg-ink text-bg' : 'border-line text-ink-soft hover:border-ink hover:text-ink'}`}
            >
              {x.name}
            </button>
          ))}
        </div>
      )}
      <div className="mb-4 max-w-xs">
        <SelectField label={t.status} value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: '', label: '—' }, ...statuses.map((s) => ({ value: s, label: kind === 'orders' ? stageLabel(s) : s }))]} />
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
                  <Td className="text-xs">{typeLabel(l.type)}</Td>
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
                    <Badge>{stageLabel(o.status)}</Badge>
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
