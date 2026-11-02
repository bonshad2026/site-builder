import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button';
import { api, apiRequest } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import { useT } from '../i18n';
import { Badge, Card, Checkbox, Empty, ErrorNote, PageTitle, Pagination, SelectField, Spinner, Table, Td, TextField, useErrorLine, useToast } from '../ui';

type Text = { en: string; fa: string };

/** One gateway of the site, as the API describes it (its driver plus the site's settings). */
export interface SiteGateway {
  key: string;
  name: Text;
  fields: { key: string; label: Text; hint?: Text }[];
  testMode: 'toggle' | 'auto' | 'always';
  available: boolean;
  allowed: boolean;
  enabled: boolean;
  label: Text;
  description: Text;
  credentials: Record<string, string>;
  /** The site's test switch (for `testMode: 'toggle'`). */
  testOn: boolean;
  ready: boolean;
}

interface PaymentSettingsView {
  allowCod: boolean;
  /** The signed-in user is the operator: may allow or forbid gateways. */
  canAllow: boolean;
  gateways: SiteGateway[];
}

function GatewayCard({ siteId, gateway, canAllow, first, last, onMove, onSaved }: { siteId: string; gateway: SiteGateway; canAllow: boolean; first: boolean; last: boolean; onMove: (by: -1 | 1) => void; onSaved: (v: PaymentSettingsView) => void }) {
  const t = useT();
  const p = t.pg;
  const toast = useToast();
  const { l } = usePreferences();
  const [form, setForm] = useState(gateway);
  useEffect(() => setForm(gateway), [gateway]);
  const base = `/sites/${siteId}/payment-settings/gateways/${gateway.key}`;
  const save = useMutation({
    mutationFn: () => api.put<PaymentSettingsView>(base, { enabled: form.enabled, label: form.label, description: form.description, credentials: form.credentials, testMode: form.testOn }),
    onSuccess: (v) => {
      onSaved(v);
      toast(t.saved);
    },
  });
  const access = useMutation({ mutationFn: (allowed: boolean) => api.put<PaymentSettingsView>(`${base}/access`, { allowed }), onSuccess: onSaved });
  const test = useMutation({ mutationFn: () => api.post<{ ok: boolean; message: string }>(`${base}/test`), onSuccess: (r) => toast(r.message, r.ok ? undefined : 'bad') });
  const text = (key: 'label' | 'description', lang: 'en' | 'fa', v: string) => setForm({ ...form, [key]: { ...form[key], [lang]: v } });

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-medium text-ink">{l(gateway.name)}</h2>
          {!gateway.allowed ? <Badge tone="bad">{p.notAllowed}</Badge> : gateway.ready ? <Badge tone="good">{p.on}</Badge> : gateway.enabled ? <Badge tone="warn">{p.notReady}</Badge> : <Badge>{p.off}</Badge>}
          {gateway.testMode === 'always' && <Badge tone="accent">{p.testBadge}</Badge>}
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" disabled={first} onClick={() => onMove(-1)} aria-label={p.moveUp}>
            ↑
          </Button>
          <Button size="sm" variant="ghost" disabled={last} onClick={() => onMove(1)} aria-label={p.moveDown}>
            ↓
          </Button>
        </div>
      </div>
      {canAllow && (
        <div className="mb-4 border-b border-line pb-4">
          <Checkbox label={p.allowed} hint={p.allowedHint} checked={gateway.allowed} onChange={(allowed) => access.mutate(allowed)} />
          <ErrorNote error={access.error} />
        </div>
      )}
      {gateway.allowed && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {!gateway.available && <p className="text-sm text-danger">{p.unavailable}</p>}
          <Checkbox label={p.enabled} checked={form.enabled} onChange={(enabled) => setForm({ ...form, enabled })} />
          {form.fields.map((f) => (
            <TextField key={f.key} label={l(f.label)} dir="ltr" value={form.credentials[f.key] ?? ''} hint={f.hint ? l(f.hint) : undefined} onChange={(v) => setForm({ ...form, credentials: { ...form.credentials, [f.key]: v } })} />
          ))}
          {form.testMode === 'toggle' && <Checkbox label={p.testMode} checked={form.testOn} onChange={(testOn) => setForm({ ...form, testOn })} />}
          {form.testMode === 'auto' && <p className="text-xs text-ink-soft">{p.testAuto}</p>}
          {form.testMode === 'always' && <p className="border border-dashed border-accent px-4 py-3 text-sm">{p.testAlways}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={`${p.label} (فارسی)`} value={form.label.fa} hint={p.labelHint} onChange={(v) => text('label', 'fa', v)} />
            <TextField label={`${p.label} (English)`} dir="ltr" value={form.label.en} hint={p.labelHint} onChange={(v) => text('label', 'en', v)} />
            <TextField label={`${p.description} (فارسی)`} value={form.description.fa} onChange={(v) => text('description', 'fa', v)} />
            <TextField label={`${p.description} (English)`} dir="ltr" value={form.description.en} onChange={(v) => text('description', 'en', v)} />
          </div>
          <ErrorNote error={save.error} />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={save.isPending}>
              {t.save}
            </Button>
            <Button variant="outline" disabled={test.isPending || !gateway.available} onClick={() => test.mutate()}>
              {p.test}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

export function GatewaysPage({ siteId }: { siteId: string }) {
  const t = useT();
  const p = t.pg;
  const qc = useQueryClient();
  const toast = useToast();
  const key = ['site', siteId, 'payment-settings'];
  const { data, isLoading, error } = useQuery({ queryKey: key, queryFn: () => api.get<PaymentSettingsView>(`/sites/${siteId}/payment-settings`) });
  const setView = (v: PaymentSettingsView) => qc.setQueryData(key, v);
  const [cod, setCod] = useState(false);
  useEffect(() => setCod(!!data?.allowCod), [data?.allowCod]);
  const saveCod = useMutation({
    mutationFn: () => api.put<PaymentSettingsView>(`/sites/${siteId}/payment-settings`, { allowCod: cod }),
    onSuccess: (v) => {
      setView(v);
      toast(t.saved);
    },
  });
  const order = useMutation({ mutationFn: (providers: string[]) => api.put<PaymentSettingsView>(`/sites/${siteId}/payment-settings/order`, { providers }), onSuccess: setView });
  if (isLoading || !data) return error ? <ErrorNote error={error} /> : <Spinner />;
  const view = data;
  const keys = view.gateways.map((g) => g.key);
  const move = (i: number, by: -1 | 1) => {
    const next = [...keys];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    order.mutate(next);
  };
  return (
    <>
      <PageTitle
        title={p.gateways}
        subtitle={`${p.gatewaysNote} ${t.paymentsNote}`}
        actions={
          <Link to={`/admin/sites/${siteId}/transactions`} className="text-sm text-accent underline">
            {p.transactions}
          </Link>
        }
      />
      <div className="flex max-w-3xl flex-col gap-5">
        {view.gateways.map((g, i) => (
          <GatewayCard key={g.key} siteId={siteId} gateway={g} canAllow={view.canAllow} first={i === 0} last={i === view.gateways.length - 1} onMove={(by) => move(i, by)} onSaved={setView} />
        ))}
        <Card title={p.cod}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveCod.mutate();
            }}
          >
            <Checkbox label={t.allowCod} checked={cod} onChange={setCod} />
            <ErrorNote error={saveCod.error} />
            <div>
              <Button type="submit" disabled={saveCod.isPending}>
                {t.save}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}

interface Payment {
  id: string;
  provider: string;
  providerName: Text;
  isTest: boolean;
  amountMinor: string;
  currency: string;
  status: 'initiated' | 'succeeded' | 'failed' | 'cancelled';
  refId: string | null;
  cardPan: string | null;
  failureReason: string | null;
  createdAt: string;
  orderId: string | null;
  orderNumber: string | null;
  leadId: string | null;
  requestNumber: string | null;
  customerName: string | null;
}

const statusTone = { initiated: 'warn', succeeded: 'good', failed: 'bad', cancelled: 'neutral' } as const;

export function TransactionsPage({ siteId }: { siteId: string }) {
  const t = useT();
  const p = t.pg;
  const qc = useQueryClient();
  const toast = useToast();
  const errorText = useErrorLine();
  const { l, formatDate, formatMoney } = usePreferences();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'' | Payment['status']>('');
  const [test, setTest] = useState<'' | 'true' | 'false'>('');
  const [q, setQ] = useState('');
  const params = new URLSearchParams({ page: String(page), pageSize: '30', ...(status && { status }), ...(test && { test }), ...(q.trim() && { q: q.trim() }) });
  const list = useQuery({
    queryKey: ['site', siteId, 'payments', params.toString()],
    queryFn: () => apiRequest<Payment[]>(`/sites/${siteId}/payments?${params}`),
    placeholderData: keepPreviousData,
  });
  const recheck = useMutation({
    mutationFn: (id: string) => api.post<{ status: Payment['status']; reason?: string }>(`/sites/${siteId}/payments/${id}/recheck`),
    onSuccess: (r) => {
      toast(r.status === 'initiated' ? p.stillOpen : p[r.status], r.status === 'succeeded' ? undefined : 'bad');
      qc.invalidateQueries({ queryKey: ['site', siteId, 'payments'] });
    },
    onError: (e) => toast(errorText(e), 'bad'),
  });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  return (
    <>
      <PageTitle
        title={p.transactions}
        subtitle={t.paymentsNote}
        actions={
          <Link to={`/admin/sites/${siteId}/payments`} className="text-sm text-accent underline">
            {p.gateways}
          </Link>
        }
      />
      <div className="mb-4 grid max-w-3xl gap-4 sm:grid-cols-3">
        <SelectField
          label={t.status}
          value={status}
          onChange={reset(setStatus)}
          options={[{ value: '', label: p.all }, ...(['succeeded', 'initiated', 'failed', 'cancelled'] as const).map((s) => ({ value: s, label: p[s] }))]}
        />
        <SelectField label={p.kind} value={test} onChange={reset(setTest)} options={[{ value: '', label: p.all }, { value: 'false', label: p.realOnly }, { value: 'true', label: p.testOnly }]} />
        <TextField label={t.search} hint={p.searchHint} value={q} onChange={reset(setQ)} />
      </div>
      {list.isLoading ? (
        <Spinner />
      ) : list.data?.data.length ? (
        <>
          <Table head={[t.created, p.subject, p.gateway, p.amount, t.status, p.ref, t.actions]}>
            {list.data.data.map((x) => (
              <tr key={x.id}>
                <Td className="text-xs text-ink-soft">{formatDate(x.createdAt)}</Td>
                <Td>
                  {x.orderId ? (
                    <Link className="text-accent underline" to={`/admin/sites/${siteId}/orders?open=${x.orderId}`}>
                      #{x.orderNumber}
                    </Link>
                  ) : x.leadId ? (
                    <Link className="text-accent underline" to={`/admin/sites/${siteId}/leads?open=${x.leadId}`}>
                      R{x.requestNumber}
                    </Link>
                  ) : (
                    '—'
                  )}
                  {x.customerName && <div className="text-xs text-ink-soft">{x.customerName}</div>}
                </Td>
                <Td>
                  {l(x.providerName)}
                  {x.isTest && (
                    <span className="ms-2">
                      <Badge tone="accent">{p.testBadge}</Badge>
                    </span>
                  )}
                </Td>
                <Td>{formatMoney(x.amountMinor, x.currency)}</Td>
                <Td>
                  <Badge tone={statusTone[x.status]}>{p[x.status]}</Badge>
                  {x.failureReason && x.status !== 'succeeded' && <div className="mt-1 max-w-xs text-xs text-ink-soft">{x.failureReason}</div>}
                </Td>
                <Td className="text-xs">
                  <span dir="ltr">{x.refId ?? '—'}</span>
                  {x.cardPan && (
                    <div className="text-ink-soft" dir="ltr">
                      {x.cardPan}
                    </div>
                  )}
                </Td>
                <Td>
                  {x.status === 'initiated' && (
                    <Button size="sm" variant="outline" title={p.recheckHint} disabled={recheck.isPending} onClick={() => recheck.mutate(x.id)}>
                      {p.recheck}
                    </Button>
                  )}
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

export default function PaymentsPages({ siteId, view }: { siteId: string; view: 'gateways' | 'transactions' }) {
  return view === 'gateways' ? <GatewaysPage siteId={siteId} /> : <TransactionsPage siteId={siteId} />;
}
