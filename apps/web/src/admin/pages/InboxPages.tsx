import { currencyDecimals, DEFAULT_ORDER_STATUSES, DEFAULT_REQUEST_TYPES, requestCode, requestTypeConfig, type Workflow, type WorkflowStage } from '@site-builder/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { cn } from '../../lib/cn';
import { api, apiRequest } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import type { OrderItemDto, OrderStatus, PaymentStatus } from '../../types/api';
import { useAdminSettings, useSiteInfo } from '../AdminRoot';
import { Composer, L, StageChip, Timeline, useL, useStaff, type CaseEvent } from '../interactions/common';
import { useT } from '../i18n';
import { Badge, Checkbox, ErrorNote, Modal, PageTitle, Pagination, SelectField, Spinner, Table, Td, TextField, useToast } from '../ui';
import { ExcelButton, excelDate, fetchAll, listTotal } from '../ExcelExport';
import { WalkInOrder } from '../interactions/WalkInOrder';
import { OrderQuickView } from '../interactions/OrderQuickView';
import { useOrderLive } from '../interactions/useOrderLive';
import { printInvoice } from '../../lib/invoice';

interface Lead {
  id: string;
  number: string;
  type: string;
  name: string;
  email: string;
  phone: string;
  projectType: string | null;
  budget: string | null;
  message: string;
  sourcePath: string | null;
  stage: string;
  stageKind: 'open' | 'done' | 'cancelled';
  unread: boolean;
  customerId: string | null;
  assigneeUserId: string | null;
  amountDueMinor: string;
  amountTitle: string;
  paidMinor: string;
  currency: string;
  paymentStatus: 'none' | 'due' | 'pending' | 'paid' | 'test_paid' | 'failed';
  details?: { date?: string; time?: string; people?: number; company?: string; answers?: { label: string; value: string }[] };
  item?: { collection: string; slug: string; title: { en: string; fa: string } } | null;
  createdAt: string;
  updatedAt: string;
}

interface LeadFull extends Lead {
  workflow: Workflow | null;
  next: string[];
  events: CaseEvent[];
  payments: { id: string; provider: string; isTest: boolean; amountMinor: string; status: string; refId: string | null; failureReason: string | null; createdAt: string }[];
  customer: { id: string; name: string; phone: string | null; email: string | null } | null;
  files: { id: string; field: string; name: string; contentType: string; sizeBytes: number; url: string }[];
}

interface Order {
  id: string;
  number: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod?: 'online' | 'cod';
  customer: { name: string; email: string; phone: string; address?: string; province?: string; city?: string; postalCode?: string; answers?: { label: string; value: string }[] };
  customerId: string | null;
  unread: boolean;
  note: string | null;
  currency: string;
  pricingPending?: boolean;
  instagramState?: string | null;
  hasGatewayPayment?: boolean;
  totalMinor: string;
  subtotalMinor?: string;
  shippingMinor?: string;
  shippingMethod?: { id: string; label: { en: string; fa: string } } | null;
  discountMinor?: string;
  couponCode?: string | null;
  createdAt: string;
  items?: OrderItemDto[];
  payments?: { id: string; provider: string; isTest: boolean; status: string; refId: string | null; failureReason: string | null; createdAt: string }[];
  events?: CaseEvent[];
}

interface Summary {
  unread: number;
  open: number;
  paymentDue: number;
  total: number;
  byType: { type: string; total: number; open: number; unread: number }[];
}

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

/** The site's request types (settings) with their workflows, plus older built-in types that may still be in the inbox. */
function useRequestTypes(siteId: string) {
  const { l } = usePreferences();
  const { data: settings } = useAdminSettings(siteId);
  const types = settings?.requestTypes ?? DEFAULT_REQUEST_TYPES;
  const config = (slug: string) => requestTypeConfig(settings, slug);
  const label = (slug: string) => {
    const known = types.find((x) => x.slug === slug) ?? DEFAULT_REQUEST_TYPES.find((x) => x.slug === slug);
    return (known && l(known.label)) || slug.replace(/_/g, ' ');
  };
  const stage = (type: string, key: string): WorkflowStage | undefined => config(type)?.workflow.stages.find((s) => s.key === key);
  const stageLabel = (type: string, key: string) => {
    const s = stage(type, key);
    return (s && l(s.label)) || key;
  };
  return { types, label, config, stage, stageLabel };
}

export const paymentTone = (s: PaymentStatus) => (s === 'paid' ? 'good' : s === 'test_paid' ? 'warn' : s === 'failed' ? 'bad' : 'neutral');

const PAYMENT_LABEL: Record<Lead['paymentStatus'], { en: string; fa: string }> = {
  none: L('No payment', 'بدون پرداخت'),
  due: L('Awaiting payment', 'منتظر پرداخت'),
  pending: L('Paying…', 'در حال پرداخت…'),
  paid: L('Paid', 'پرداخت شده'),
  test_paid: L('Test paid', 'پرداخت آزمایشی'),
  failed: L('Payment failed', 'پرداخت ناموفق'),
};

/** Major-unit amount typed by staff ↔ minor units stored (rials have no decimals). */
const toMinor = (v: string, currency: string) => {
  const n = Number(v.replace(/[,٬\s]/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10 ** currencyDecimals(currency)) : 0;
};

/* ---------- one request ---------- */

function StageMove({ siteId, lead, target, onDone }: { siteId: string; lead: LeadFull; target: WorkflowStage; onDone: () => void }) {
  const t = useL();
  const tt = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const { l } = usePreferences();
  const [message, setMessage] = useState('');
  const [notify, setNotify] = useState(target.notify);
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const needsAmount = target.askPayment && BigInt(lead.amountDueMinor) === 0n;
  const move = useMutation({
    mutationFn: () =>
      api.post(`/sites/${siteId}/leads/${lead.id}/stage`, {
        stage: target.key,
        message,
        notify,
        ...(target.askPayment && toMinor(amount, lead.currency) > 0 ? { payment: { amountMinor: toMinor(amount, lead.currency), title } } : {}),
      }),
    onSuccess: () => {
      toast(tt.saved);
      qc.invalidateQueries({ queryKey: ['site', siteId, 'leads'] });
      onDone();
    },
  });
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-ink/20 bg-surface p-4">
      <p className="text-sm">
        {t(L('Move to', 'انتقال به'))} <StageChip label={l(target.label) || target.key} color={target.color} />
      </p>
      {target.askPayment && (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={`${t(L('Amount to pay', 'مبلغ قابل پرداخت'))} (${lead.currency})`} dir="ltr" value={amount} onChange={setAmount} hint={needsAmount ? t(L('Required at this stage', 'در این مرحله لازم است')) : t(L('Leave empty to keep the current amount', 'خالی = همان مبلغ فعلی'))} />
          <TextField label={t(L('For (shown to the customer)', 'بابت (به مشتری نمایش داده می‌شود)'))} value={title} onChange={setTitle} />
        </div>
      )}
      <TextField label={t(L('Message to the customer (optional)', 'پیام به مشتری (اختیاری)'))} value={message} onChange={setMessage} multiline rows={2} hint={target.visible ? undefined : t(L('This stage is hidden from the customer; it is shown only if you write a message.', 'این مرحله برای مشتری پنهان است؛ فقط در صورت نوشتن پیام نمایش داده می‌شود.'))} />
      <Checkbox label={t(L('Send SMS / email to the customer', 'ارسال پیامک / ایمیل به مشتری'))} checked={notify} onChange={setNotify} hint={target.notify ? t(L('This stage notifies by default.', 'این مرحله به‌طور پیش‌فرض اطلاع می‌دهد.')) : undefined} />
      <ErrorNote error={move.error} />
      <div className="flex gap-2">
        <Button size="sm" variant={target.kind === 'cancelled' ? 'outline' : 'primary'} disabled={move.isPending || (needsAmount && !toMinor(amount, lead.currency))} onClick={() => move.mutate()}>
          {t(L('Confirm', 'تأیید'))}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          {tt.cancel}
        </Button>
      </div>
    </div>
  );
}

function PaymentBox({ siteId, lead, canWrite }: { siteId: string; lead: LeadFull; canWrite: boolean }) {
  const t = useL();
  const tt = useT();
  const qc = useQueryClient();
  const { formatMoney, formatDate } = usePreferences();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const ask = useMutation({
    mutationFn: (amountMinor: number) => api.post(`/sites/${siteId}/leads/${lead.id}/payment-request`, { amountMinor, title, notify: true }),
    onSuccess: () => {
      setOpen(false);
      setAmount('');
      setTitle('');
      qc.invalidateQueries({ queryKey: ['site', siteId, 'leads'] });
    },
  });
  const due = BigInt(lead.amountDueMinor) > 0n;
  return (
    <section className="rounded-lg border border-line p-4">
      <h3 className="mb-2 text-xs font-medium text-ink-soft">{t(L('Payment', 'پرداخت'))}</h3>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={lead.paymentStatus === 'paid' ? 'good' : lead.paymentStatus === 'due' ? 'accent' : lead.paymentStatus === 'failed' ? 'bad' : lead.paymentStatus === 'test_paid' ? 'warn' : 'neutral'}>{t(PAYMENT_LABEL[lead.paymentStatus])}</Badge>
        {due && (
          <span>
            {t(L('Due', 'قابل پرداخت'))}: <strong>{formatMoney(lead.amountDueMinor, lead.currency)}</strong> {lead.amountTitle && `— ${lead.amountTitle}`}
          </span>
        )}
        {BigInt(lead.paidMinor) > 0n && (
          <span className="text-emerald-700">
            {t(L('Paid so far', 'پرداخت‌شده'))}: {formatMoney(lead.paidMinor, lead.currency)}
          </span>
        )}
      </div>
      {lead.payments.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-ink-soft">
          {lead.payments.map((p) => (
            <li key={p.id}>
              {formatDate(p.createdAt)} · {formatMoney(p.amountMinor, lead.currency)} · {p.status}
              {p.isTest && ` (${tt.testPayment})`}
              {p.refId && ` · ${tt.ref}: ${p.refId}`}
            </li>
          ))}
        </ul>
      )}
      {canWrite && lead.stageKind === 'open' && (
        <div className="mt-3">
          {!open ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
                {due ? t(L('Change amount', 'تغییر مبلغ')) : t(L('Ask for payment', 'درخواست پرداخت'))}
              </Button>
              {due && (
                <Button size="sm" variant="ghost" disabled={ask.isPending} onClick={() => ask.mutate(0)}>
                  {t(L('Withdraw', 'لغو درخواست پرداخت'))}
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <TextField label={`${t(L('Amount', 'مبلغ'))} (${lead.currency})`} dir="ltr" value={amount} onChange={setAmount} />
              <TextField label={t(L('For', 'بابت'))} value={title} onChange={setTitle} />
              <Button size="sm" disabled={!toMinor(amount, lead.currency) || ask.isPending} onClick={() => ask.mutate(toMinor(amount, lead.currency))}>
                {t(L('Send payment link', 'ارسال لینک پرداخت'))}
              </Button>
            </div>
          )}
          <ErrorNote error={ask.error} />
        </div>
      )}
    </section>
  );
}

function LeadDetail({ siteId, id, onClose }: { siteId: string; id: string | null; onClose: () => void }) {
  const t = useL();
  const tt = useT();
  const qc = useQueryClient();
  const { formatDate, l, dir } = usePreferences();
  const { data: info } = useSiteInfo(siteId);
  const canWrite = !!info?.permissions.includes('leads:write');
  const { data: staff = [] } = useStaff(siteId);
  const [moving, setMoving] = useState<string | null>(null);
  useEffect(() => setMoving(null), [id]);
  const lead = useQuery({ queryKey: ['site', siteId, 'leads', 'one', id], queryFn: () => api.get<LeadFull>(`/sites/${siteId}/leads/${id}`), enabled: !!id });
  // Opening marks it read on the server; refresh the list's dots and counts.
  useEffect(() => {
    if (lead.data) qc.invalidateQueries({ queryKey: ['site', siteId, 'leads', 'summary'] });
  }, [lead.data?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = useMutation({
    mutationFn: (b: { kind: 'message' | 'note'; text: string }) => api.post(`/sites/${siteId}/leads/${id}/events`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['site', siteId, 'leads'] }),
  });
  const assign = useMutation({
    mutationFn: (assigneeUserId: string | null) => api.patch(`/sites/${siteId}/leads/${id}`, { assigneeUserId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['site', siteId, 'leads'] }),
  });
  const { label: typeLabel } = useRequestTypes(siteId);
  const d = lead.data;
  const wf = d?.workflow;
  const stageOf = (key: string) => wf?.stages.find((s) => s.key === key);
  const stageName = (key: string) => (stageOf(key) && l(stageOf(key)!.label)) || key;
  const current = d ? stageOf(d.stage) : undefined;

  return (
    <Modal open={!!id} onClose={onClose} title={d ? `R${d.number} · ${d.name}` : tt.loading} wide="xl">
      {!d ? (
        lead.error ? <ErrorNote error={lead.error} /> : <Spinner />
      ) : (
        <div className="grid gap-6 text-sm lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <StageChip label={stageName(d.stage)} color={current?.color ?? 'gray'} />
              <span className="text-ink-soft">{typeLabel(d.type)}</span>
              <span className="text-xs text-ink-soft">{formatDate(d.createdAt)}</span>
            </div>
            {/* The workflow at a glance: where the request is, and where it can go. */}
            {wf && (
              <ol className="flex flex-wrap items-center gap-1 text-[11px]">
                {wf.stages
                  .filter((s) => s.kind !== 'cancelled')
                  .map((s, i, arr) => (
                    <li key={s.key} className="flex items-center gap-1">
                      <span className={cn('rounded-full px-2 py-0.5', s.key === d.stage ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-soft')}>{l(s.label) || s.key}</span>
                      {i < arr.length - 1 && <span className="text-ink-soft">{dir === 'rtl' ? '‹' : '›'}</span>}
                    </li>
                  ))}
              </ol>
            )}
            {canWrite && d.next.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-medium text-ink-soft">{t(L('Next step', 'مرحله‌ی بعد'))}</h3>
                {moving && stageOf(moving) ? (
                  <StageMove siteId={siteId} lead={d} target={stageOf(moving)!} onDone={() => setMoving(null)} />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {d.next.map((key) => {
                      const s = stageOf(key);
                      return (
                        <Button key={key} size="sm" variant={s?.kind === 'cancelled' ? 'outline' : 'primary'} onClick={() => setMoving(key)}>
                          {s?.kind === 'cancelled' ? '✕ ' : dir === 'rtl' ? '← ' : '→ '}
                          {stageName(key)}
                          {s?.askPayment ? ' 💳' : ''}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-ink-soft">{tt.phone}</dt>
                <dd dir="ltr" className="text-start">
                  {d.phone ? <a href={`tel:${d.phone}`} className="hover:underline">{d.phone}</a> : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-soft">{tt.email}</dt>
                <dd dir="ltr" className="text-start">
                  {d.email ? <a href={`mailto:${d.email}`} className="hover:underline">{d.email}</a> : '—'}
                </dd>
              </div>
              {d.customer && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-ink-soft">{t(L('Customer account', 'حساب مشتری'))}</dt>
                  <dd>
                    {d.customer.name} <span className="text-ink-soft" dir="ltr">({d.customer.phone ?? d.customer.email})</span>
                  </dd>
                </div>
              )}
              {d.item && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-ink-soft">{tt.requestItem}</dt>
                  <dd>
                    {l(d.item.title)} <span className="text-ink-soft" dir="ltr">({d.item.collection}/{d.item.slug})</span>
                  </dd>
                </div>
              )}
              {d.details && [d.details.date, d.details.time, d.details.people, d.details.company].some(Boolean) && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-ink-soft">{tt.requestDetails}</dt>
                  <dd>{[d.details.date, d.details.time, d.details.people ? `${d.details.people} ${tt.people}` : '', d.details.company].filter(Boolean).join(' · ')}</dd>
                </div>
              )}
              {d.details?.answers?.map((a, i) => (
                <div key={i} className={a.value.length > 60 ? 'sm:col-span-2' : undefined}>
                  <dt className="text-xs text-ink-soft">{a.label}</dt>
                  <dd className="whitespace-pre-wrap">{a.value}</dd>
                </div>
              ))}
              {(d.projectType || d.budget) && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-ink-soft">{tt.type}</dt>
                  <dd>{[d.projectType, d.budget].filter(Boolean).join(' · ')}</dd>
                </div>
              )}
            </dl>
            {d.message && !d.details?.answers?.length && <p className="whitespace-pre-wrap rounded-lg border border-line bg-surface p-3">{d.message}</p>}
            {d.files.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-medium text-ink-soft">{t(L('Attached files', 'فایل‌های پیوست'))}</h3>
                <ul className="flex flex-wrap gap-3">
                  {d.files.map((f) => (
                    <li key={f.id}>
                      <a href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md border border-line p-2 text-xs hover:border-ink">
                        {f.contentType.startsWith('image/') ? <img src={f.url} alt="" className="size-12 rounded object-cover" /> : <span className="text-lg">📄</span>}
                        <span className="max-w-40 truncate">{f.name}</span>
                        <span className="text-ink-soft">{Math.ceil(f.sizeBytes / 1024)} KB</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <PaymentBox siteId={siteId} lead={d} canWrite={canWrite} />
            {canWrite && (
              <SelectField
                label={t(L('Assigned to', 'مسئول پیگیری'))}
                value={d.assigneeUserId ?? ''}
                onChange={(v) => assign.mutate(v || null)}
                options={[{ value: '', label: '—' }, ...staff.map((s) => ({ value: s.id, label: s.name }))]}
                className="max-w-xs"
              />
            )}
            {d.sourcePath && <p className="text-xs text-ink-soft" dir="ltr">{d.sourcePath}</p>}
          </div>
          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-medium text-ink-soft">{t(L('Timeline', 'روند پیگیری'))}</h3>
            <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-line bg-bg p-3">
              <Timeline siteId={siteId} events={d.events} stageName={stageName} currency={d.currency} />
            </div>
            {canWrite && <Composer pending={send.isPending} onSend={(kind, text) => send.mutateAsync({ kind, text })} />}
            <ErrorNote error={send.error ?? assign.error} />
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ---------- one order ---------- */

function OrderDetail({ siteId, id, onClose }: { siteId: string; id: string | null; onClose: () => void }) {
  const t2 = useT();
  const tt = useT();
  const t = useL();
  const qc = useQueryClient();
  const toast = useToast();
  const { l, dir, locale, formatMoney, formatDate } = usePreferences();
  const { data: siteSettings } = useAdminSettings(siteId);
  const { data: info } = useSiteInfo(siteId);
  const canWrite = !!info?.permissions.includes('orders:write');
  const [moving, setMoving] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [notify, setNotify] = useState(false);
  const { stages, label: stageLabel, next } = useOrderStages(siteId);
  useEffect(() => setMoving(null), [id]);
  const order = useQuery({ queryKey: ['site', siteId, 'orders', 'one', id], queryFn: () => api.get<Order>(`/sites/${siteId}/orders/${id}`), enabled: !!id });
  const setStatus = useMutation({
    mutationFn: (status: string) => api.patch(`/sites/${siteId}/orders/${id}`, { status, message, notify }),
    onSuccess: () => {
      toast(tt.saved);
      setMoving(null);
      setMessage('');
      qc.invalidateQueries({ queryKey: ['site', siteId, 'orders'] });
    },
  });
  const send = useMutation({
    mutationFn: (b: { kind: 'message' | 'note'; text: string }) => api.post(`/sites/${siteId}/orders/${id}/events`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['site', siteId, 'orders', 'one', id] }),
  });
  const o = order.data;
  const startMove = (st: string) => {
    setMoving(st);
    setNotify(!!stages.find((s) => s.slug === st)?.notify);
  };
  return (
    <Modal open={!!id} onClose={onClose} title={o ? `#${o.number} · ${o.customer.name}` : tt.loading} wide="xl">
      {!o ? (
        <Spinner />
      ) : (
        <div className="grid gap-6 text-sm lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap gap-2">
              <Badge>{stageLabel(o.status)}</Badge>
              {o.pricingPending ? <Badge>{t(L('Price awaiting confirmation','قیمت در انتظار تأیید'))}</Badge> : <Badge tone={paymentTone(o.paymentStatus)}>{o.paymentStatus}</Badge>}
              {o.instagramState && <Badge>{t(L('Instagram','اینستاگرام'))}: {({pending:t(L('Queued','در صف')),sending:t(L('Sending','در حال ارسال')),sent:t(L('Sent','ارسال شد')),failed:t(L('Failed','ناموفق')),unknown:t(L('Needs review','نیازمند بررسی'))} as Record<string,string>)[o.instagramState] || o.instagramState}</Badge>}
              {!o.pricingPending && o.paymentMethod === 'cod' && <Badge tone="neutral">{tt.cod}</Badge>}
              <span className="text-ink-soft">{formatDate(o.createdAt)}</span>
            </div>
            {canWrite && next(o.status).length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-medium text-ink-soft">{t(L('Next step', 'مرحله‌ی بعد'))}</h3>
                {moving ? (
                  <div className="flex flex-col gap-3 rounded-lg border border-ink/20 bg-surface p-4">
                    <p>
                      {t(L('Move to', 'انتقال به'))} <strong>{moving === 'cancelled' ? tt.cancelOrder : stageLabel(moving)}</strong>
                    </p>
                    <TextField label={t(L('Message to the buyer (optional)', 'پیام به خریدار (اختیاری)'))} value={message} onChange={setMessage} multiline rows={2} />
                    <Checkbox label={t(L('Send SMS / email to the buyer', 'ارسال پیامک / ایمیل به خریدار'))} checked={notify || !!message} onChange={setNotify} />
                    <ErrorNote error={setStatus.error} />
                    <div className="flex gap-2">
                      <Button size="sm" variant={moving === 'cancelled' ? 'outline' : 'primary'} disabled={setStatus.isPending} onClick={() => setStatus.mutate(moving)}>
                        {t(L('Confirm', 'تأیید'))}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setMoving(null)}>
                        {tt.cancel}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {next(o.status).map((st) => (
                      <Button key={st} size="sm" variant={st === 'cancelled' ? 'outline' : 'primary'} onClick={() => startMove(st)}>
                        {st === 'cancelled' ? `✕ ${tt.cancelOrder}` : `${dir === 'rtl' ? '←' : '→'} ${stageLabel(st)}`}
                      </Button>
                    ))}
                  </div>
                )}
              </section>
            )}
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-ink-soft">{tt.customer}</dt>
                <dd>{o.customer.name}</dd>
                <dd dir="ltr" className="text-start text-ink-soft">
                  {[o.customer.phone, o.customer.email].filter(Boolean).join(' · ')}
                </dd>
                {o.customerId && <dd className="text-xs text-ink-soft">{t(L('Has an account', 'دارای حساب کاربری'))}</dd>}
              </div>
              {(o.customer.address || o.customer.province || o.customer.city) && (
                <div>
                  <dt className="text-xs text-ink-soft">{tt.address}</dt>
                  {(o.customer.province || o.customer.city) && <dd>{[o.customer.province, o.customer.city].filter(Boolean).join('، ')}</dd>}
                  {o.customer.address && <dd className="whitespace-pre-wrap">{o.customer.address}</dd>}
                  {o.customer.postalCode && (
                    <dd className="text-ink-soft">
                      {t2.sx.postal}: <span dir="ltr">{o.customer.postalCode}</span>
                    </dd>
                  )}
                </div>
              )}
              {o.shippingMethod && (
                <div>
                  <dt className="text-xs text-ink-soft">{t2.sx.shippingLine}</dt>
                  <dd>{l(o.shippingMethod.label)}</dd>
                </div>
              )}
              {(o.customer.answers ?? []).map((a) => (
                <div key={a.label}>
                  <dt className="text-xs text-ink-soft">{a.label}</dt>
                  <dd className="whitespace-pre-wrap">{a.value}</dd>
                </div>
              ))}
            </dl>
            <div>
              <Button
                disabled={o.pricingPending}
                size="sm"
                variant="outline"
                onClick={() =>
                  printInvoice(
                    { ...o, items: o.items?.map((it) => ({ ...it, variant: (it as { variant?: string }).variant })) },
                    { name: l(siteSettings?.name) || siteId, phone: siteSettings?.contact.phone, email: siteSettings?.contact.email, address: l(siteSettings?.contact.address), logoUrl: siteSettings?.logoUrl || undefined },
                    { locale, l, formatMoney, formatDate },
                  )
                }
              >
                {t2.sx.printInvoice}
              </Button>
            </div>
            {o.note && <p className="whitespace-pre-wrap border border-line bg-surface p-3">{o.note}</p>}
            <Table head={[tt.items, tt.price, tt.total]}>
              {o.items?.map((it, i) => (
                <tr key={i}>
                  <Td>
                    {l(it.productName)}
                    {[(it as { variant?: string }).variant, it.option].filter(Boolean).length ? ` (${[(it as { variant?: string }).variant, it.option].filter(Boolean).join('، ')})` : ''} × {it.quantity}
                  </Td>
                  <Td className="text-xs">{o.pricingPending ? t(L('Awaiting price','در انتظار قیمت')) : formatMoney(it.unitPriceMinor, o.currency)}</Td>
                  <Td className="text-xs">{o.pricingPending ? t(L('Awaiting price','در انتظار قیمت')) : formatMoney(it.lineTotalMinor, o.currency)}</Td>
                </tr>
              ))}
              {Number(o.discountMinor) > 0 && (
                <tr>
                  <Td>
                    {t2.sx.discountLine}
                    {o.couponCode ? ` (${o.couponCode})` : ''}
                  </Td>
                  <Td>{''}</Td>
                  <Td className="text-xs">−{formatMoney(o.discountMinor!, o.currency)}</Td>
                </tr>
              )}
              {o.shippingMethod && (
                <tr>
                  <Td>{t2.sx.shippingLine}</Td>
                  <Td>{''}</Td>
                  <Td className="text-xs">{formatMoney(o.shippingMinor ?? '0', o.currency)}</Td>
                </tr>
              )}
              <tr>
                <Td className="font-medium">{tt.total}</Td>
                <Td>{''}</Td>
                <Td className="font-medium">{o.pricingPending ? t(L('Awaiting price','در انتظار قیمت')) : formatMoney(o.totalMinor, o.currency)}</Td>
              </tr>
            </Table>
            {o.payments && o.payments.length > 0 && (
              <ul className="space-y-1 text-xs">
                {o.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap gap-2">
                    <Badge tone={p.status === 'succeeded' ? (p.isTest ? 'warn' : 'good') : p.status === 'failed' ? 'bad' : 'neutral'}>{p.status}</Badge>
                    {p.provider}
                    {p.isTest && ` (${tt.testPayment})`}
                    {p.refId && ` · ${tt.ref}: ${p.refId}`}
                    {p.failureReason && <span className="text-danger">· {p.failureReason}</span>}
                    <span className="text-ink-soft">{formatDate(p.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-medium text-ink-soft">{t(L('Timeline', 'روند پیگیری'))}</h3>
            <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-line bg-bg p-3">
              <Timeline siteId={siteId} events={o.events ?? []} stageName={stageLabel} currency={o.currency} />
            </div>
            {canWrite && <Composer pending={send.isPending} onSend={(kind, text) => send.mutateAsync({ kind, text })} />}
            <ErrorNote error={send.error} />
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ---------- lists ---------- */

function RequestsInbox({ siteId }: { siteId: string }) {
  const tt = useT();
  const t = useL();
  const { formatDate, formatMoney, l } = usePreferences();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const type = params.get('type') ?? '';
  const state = params.get('state') ?? 'open';
  const stage = params.get('stage') ?? '';
  const flag = params.get('flag') ?? '';
  const open = params.get('open');
  const { types, label: typeLabel, config, stage: stageOf, stageLabel } = useRequestTypes(siteId);
  const summary = useQuery({ queryKey: ['site', siteId, 'leads', 'summary'], queryFn: () => api.get<Summary>(`/sites/${siteId}/leads/summary`) });
  const query = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (type) query.set('type', type);
  if (state !== 'all') query.set('state', state);
  if (stage) query.set('stage', stage);
  if (flag === 'unread') query.set('unread', 'true');
  if (flag === 'due') query.set('payment', 'due');
  if (search) query.set('q', search);
  const list = useQuery({
    queryKey: ['site', siteId, 'leads', query.toString()],
    queryFn: () => apiRequest<Lead[]>(`/sites/${siteId}/leads?${query}`),
    placeholderData: keepPreviousData,
  });
  const setParam = (patch: Record<string, string>) => {
    setPage(1);
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    next.delete('open');
    setParams(next, { replace: true });
  };
  const openItem = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('open', id);
    else next.delete('open');
    setParams(next, { replace: true });
  };
  const s = summary.data;
  const countOf = (slug: string) => s?.byType.find((x) => x.type === slug);
  const typeStages = type ? (config(type)?.workflow.stages ?? []) : [];
  const chip = (active: boolean) => cn('rounded-full border px-3 py-1 text-sm', active ? 'border-ink bg-ink text-bg' : 'border-line text-ink-soft hover:border-ink hover:text-ink');

  return (
    <>
      <PageTitle
        title={tt.leads}
        subtitle={s ? `${t(L('Open', 'باز'))}: ${s.open} · ${t(L('New', 'جدید'))}: ${s.unread} · ${t(L('Awaiting payment', 'منتظر پرداخت'))}: ${s.paymentDue}` : undefined}
        actions={
          <ExcelButton
            name={tt.leads}
            count={listTotal(list.data)}
            rows={async () => {
              // The requests the current filters show, all pages.
              const filters = new URLSearchParams(query);
              filters.delete('page');
              filters.delete('pageSize');
              const list = await fetchAll<Lead>(`/sites/${siteId}/leads?${filters}`);
              const money = (v: string) => (Number(v) ? Number(v) : '');
              return [
                ['کد / Code', 'نوع / Type', 'مرحله / Stage', 'نام / Name', 'موبایل / Phone', 'ایمیل / Email', 'مبلغ / Amount', 'پرداخت‌شده / Paid', 'وضعیت پرداخت / Payment', 'تاریخ / Date', 'آخرین تغییر / Updated', 'پیام / Message'],
                ...list.map((x) => [requestCode(x.number), typeLabel(x.type), stageLabel(x.type, x.stage), x.name, x.phone, x.email, money(x.amountDueMinor), money(x.paidMinor), x.paymentStatus, excelDate(x.createdAt), excelDate(x.updatedAt), x.message]),
              ];
            }}
          />
        }
      />
      <div role="tablist" aria-label={tt.type} className="mb-3 flex flex-wrap gap-2">
        {[{ slug: '', name: tt.allTypes }, ...types.map((x) => ({ slug: x.slug, name: typeLabel(x.slug) }))].map((x) => {
          const c = x.slug ? countOf(x.slug) : null;
          return (
            <button key={x.slug || 'all'} type="button" role="tab" aria-selected={type === x.slug} onClick={() => setParam({ type: x.slug, stage: '' })} className={chip(type === x.slug)}>
              {x.name}
              {c && c.unread > 0 && <span className="ms-1.5 rounded-full bg-accent px-1.5 text-[11px] text-accent-ink">{c.unread}</span>}
            </button>
          );
        })}
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div role="tablist" className="flex gap-1 rounded-full border border-line p-0.5 text-sm">
          {(
            [
              ['open', L('Open', 'باز')],
              ['done', L('Done', 'انجام‌شده')],
              ['cancelled', L('Cancelled', 'لغوشده')],
              ['all', L('All', 'همه')],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={state === k} onClick={() => setParam({ state: k === 'open' ? '' : k })} className={cn('rounded-full px-3 py-1', state === k ? 'bg-ink text-bg' : 'text-ink-soft hover:text-ink')}>
              {t(label)}
            </button>
          ))}
        </div>
        {type && typeStages.length > 0 && (
          <SelectField
            label={t(L('Stage', 'مرحله'))}
            value={stage}
            onChange={(v) => setParam({ stage: v, state: v ? 'all' : '' })}
            options={[{ value: '', label: '—' }, ...typeStages.map((x) => ({ value: x.key, label: l(x.label) || x.key }))]}
            className="w-48"
          />
        )}
        <SelectField
          label={t(L('Show', 'نمایش'))}
          value={flag}
          onChange={(v) => setParam({ flag: v })}
          options={[
            { value: '', label: t(L('Everything', 'همه')) },
            { value: 'unread', label: t(L('New / unread', 'جدید / خوانده‌نشده')) },
            { value: 'due', label: t(L('Awaiting payment', 'منتظر پرداخت')) },
          ]}
          className="w-48"
        />
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSearch(q.trim());
          }}
        >
          <TextField label={t(L('Search (code, name, phone…)', 'جستجو (کد، نام، تلفن…)'))} value={q} onChange={setQ} className="w-60" />
          <Button size="sm" variant="outline" type="submit">
            {t(L('Search', 'جستجو'))}
          </Button>
        </form>
      </div>
      {list.isLoading ? (
        <Spinner />
      ) : (
        <>
          <ErrorNote error={list.error} />
          <Table head={[t(L('Code', 'کد')), tt.name, tt.type, t(L('Stage', 'مرحله')), t(L('Payment', 'پرداخت')), t(L('Last activity', 'آخرین فعالیت'))]}>
            {(list.data?.data ?? []).map((r) => {
              const st = stageOf(r.type, r.stage);
              return (
                <tr key={r.id} className={cn('cursor-pointer hover:bg-surface-2', r.unread && 'font-medium')} onClick={() => openItem(r.id)}>
                  <Td className="whitespace-nowrap">
                    {r.unread && <span className="me-1.5 inline-block size-2 rounded-full bg-accent" aria-label={t(L('New', 'جدید'))} />}
                    <button type="button" className="hover:underline" dir="ltr" onClick={() => openItem(r.id)}>
                      R{r.number}
                    </button>
                  </Td>
                  <Td>
                    {r.name}
                    <div className="text-xs font-normal text-ink-soft" dir="ltr">
                      {r.phone || r.email}
                    </div>
                  </Td>
                  <Td className="text-xs">{typeLabel(r.type)}</Td>
                  <Td>
                    <StageChip label={stageLabel(r.type, r.stage)} color={st?.color ?? 'gray'} />
                  </Td>
                  <Td className="text-xs">
                    {r.paymentStatus === 'none' ? '—' : r.paymentStatus === 'due' ? `${t(PAYMENT_LABEL.due)}: ${formatMoney(r.amountDueMinor, r.currency)}` : t(PAYMENT_LABEL[r.paymentStatus])}
                  </Td>
                  <Td className="text-xs text-ink-soft">{formatDate(r.updatedAt)}</Td>
                </tr>
              );
            })}
          </Table>
          {list.data?.data.length === 0 && <p className="py-8 text-center text-sm text-ink-soft">{t(L('No requests here.', 'درخواستی در این بخش نیست.'))}</p>}
          <Pagination page={page} totalPages={list.data?.meta?.totalPages ?? 1} onChange={setPage} />
        </>
      )}
      <LeadDetail siteId={siteId} id={open} onClose={() => openItem(null)} />
    </>
  );
}

function OrdersInbox({ siteId }: { siteId: string }) {
  const [walkIn,setWalkIn]=useState(false);
  const {data:walkInSettings}=useAdminSettings(siteId);
  const connected=useOrderLive(siteId);
  const qc=useQueryClient();
  const {data:info}=useSiteInfo(siteId);
  const update=useMutation({
    mutationFn:({id,status,paymentStatus}:{id:string;status?:string;paymentStatus?:string})=>status
      ? api.patch('/sites/'+siteId+'/orders/'+id,{status})
      : api.patch('/sites/'+siteId+'/orders/'+id+'/payment-status',{paymentStatus}),
    onSuccess:()=>qc.invalidateQueries({queryKey:['site',siteId,'orders']}),
  });
  const tt = useT();
  const t = useL();
  const { formatDate, formatMoney } = usePreferences();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const open = params.get('open');
  const list = useQuery({
    queryKey: ['site', siteId, 'orders', page, status],
    queryFn: () => apiRequest<Order[]>(`/sites/${siteId}/orders?page=${page}&pageSize=20${status ? `&status=${status}` : ''}`),
    placeholderData: keepPreviousData,
  });
  const { stages, label: stageLabel, next } = useOrderStages(siteId);
  const openItem = (id: string | null) => setParams(id ? { open: id } : {}, { replace: true });
  return (
    <>
      <PageTitle
        title={tt.orders}
        actions={<>
          {info?.permissions.includes('orders:write')&&walkInSettings?.modules.products&&<Button type="button" onClick={()=>setWalkIn(true)}>{t(L('Rapid walk-in order','ثبت سریع سفارش حضوری'))}</Button>}
          <ExcelButton
            name={tt.orders}
            count={listTotal(list.data)}
            rows={async () => {
              const list = await fetchAll<Order>(`/sites/${siteId}/orders${status ? `?status=${status}` : ''}`);
              return [
                ['شماره / Number', 'تاریخ / Date', 'وضعیت / Status', 'پرداخت / Payment', 'روش / Method', 'مبلغ / Total', 'ارز / Currency', 'نام / Name', 'موبایل / Phone', 'ایمیل / Email', 'نشانی / Address', 'توضیح / Note'],
                ...list.map((o) => [Number(o.number), excelDate(o.createdAt), stageLabel(o.status), o.paymentStatus, o.paymentMethod ?? '', o.pricingPending ? t(L('Awaiting price','در انتظار قیمت')) : Number(o.totalMinor), o.currency, o.customer.name, o.customer.phone, o.customer.email, o.customer.address ?? '', o.note ?? '']),
              ];
            }}
          />
        </>}
      />
      <div className="mb-4 max-w-xs">
        <SelectField
          label={tt.status}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[{ value: '', label: '—' }, ...stages.map((s) => ({ value: s.slug, label: stageLabel(s.slug) }))]}
        />
      </div>
      {list.isLoading ? (
        <Spinner />
      ) : (
        <>
          <ErrorNote error={list.error} />
          <p role="status" className="mb-3 text-xs text-ink-soft">{connected ? t(L('Live updates connected','به‌روزرسانی زنده متصل است')) : t(L('Connecting live updates…','در حال اتصال به به‌روزرسانی زنده…'))}</p>
          <ErrorNote error={update.error}/>
          <Table head={['#', tt.customer, tt.total, tt.status, tt.payment, tt.created, t(L('Preview','پیش‌نمایش'))]}>
            {(list.data?.data ?? []).map((o) => (
              <tr key={o.id} className={cn('cursor-pointer hover:bg-surface-2', o.unread && 'font-medium')} onClick={() => openItem(o.id)}>
                <Td>
                  {o.unread && <span className="me-1.5 inline-block size-2 rounded-full bg-accent" aria-label={t(L('New', 'جدید'))} />}
                  <button type="button" className="hover:underline" onClick={() => openItem(o.id)}>
                    #{o.number}
                  </button>
                </Td>
                <Td>{o.customer.name}</Td>
                <Td className="text-xs">{o.pricingPending ? t(L('Awaiting price','در انتظار قیمت')) : formatMoney(o.totalMinor, o.currency)}</Td>
                <Td>
                  {info?.permissions.includes('orders:write') ? <div onClick={e=>e.stopPropagation()}>
                    <select aria-label={t(L('Order status','وضعیت سفارش'))+' #'+o.number} className="rounded border border-line bg-bg px-2 py-1 text-sm" value={o.status}
                      disabled={update.isPending||next(o.status).length===0}
                      onChange={e=>update.mutate({id:o.id,status:e.target.value})}>
                      {[o.status,...next(o.status)].map(value=><option key={value} value={value}>{stageLabel(value)}</option>)}
                    </select>
                  </div>:<Badge>{stageLabel(o.status)}</Badge>}
                </Td>
                <Td>
                  {info?.permissions.includes('payments:manage')&&o.paymentMethod==='cod'&&!o.hasGatewayPayment&&['unpaid','paid','refunded'].includes(o.paymentStatus)
                    ? <div onClick={e=>e.stopPropagation()}><select aria-label={t(L('Manual payment status','وضعیت پرداخت دستی'))+' #'+o.number}
                        title={t(L('Records offline payment status only; does not transfer money','فقط وضعیت پرداخت دستی را ثبت می‌کند؛ انتقال وجه انجام نمی‌شود'))}
                        className="rounded border border-line bg-bg px-2 py-1 text-sm" value={o.paymentStatus} disabled={update.isPending}
                        onChange={e=>update.mutate({id:o.id,paymentStatus:e.target.value})}>
                        {['unpaid','paid',...(o.paymentStatus!=='unpaid'?['refunded']:[])].map(value=><option key={value} value={value}>{t(value==='paid'?L('Paid','پرداخت‌شده'):value==='refunded'?L('Refunded','مستردشده'):L('Unpaid','پرداخت‌نشده'))}</option>)}
                      </select></div>
                    :<Badge tone={paymentTone(o.paymentStatus)}>{o.paymentStatus}</Badge>}
                </Td>
                <Td className="text-xs text-ink-soft">{formatDate(o.createdAt)}</Td>
                <Td><OrderQuickView siteId={siteId} id={o.id} number={o.number} onOpen={()=>openItem(o.id)}/></Td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} totalPages={list.data?.meta?.totalPages ?? 1} onChange={setPage} />
        </>
      )}
      <OrderDetail siteId={siteId} id={open} onClose={() => openItem(null)} />
      <WalkInOrder siteId={siteId} open={walkIn} onClose={()=>setWalkIn(false)} />
    </>
  );
}

export default function InboxPages({ siteId, kind }: { siteId: string; kind: 'leads' | 'orders' }) {
  return kind === 'leads' ? <RequestsInbox siteId={siteId} /> : <OrdersInbox siteId={siteId} />;
}
