import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button';
import { cn } from '../../lib/cn';
import { errorLine } from '../../lib/errorText';
import { usePreferences } from '../../lib/preferences';
import { useSiteErrorLanguage, useSiteSettings } from '../public-site/data';
import { L, useCustomerApi, useText } from './customerApi';
import { printInvoice, type InvoiceOrder } from '../../lib/invoice';

interface PublicEvent {
  id: string;
  kind: string;
  body: string;
  byCustomer: boolean;
  createdAt: string;
  stage?: string;
  amountMinor?: string;
  currency?: string;
  withdrawn?: boolean;
  ok?: boolean;
}

interface CaseData {
  kind: 'request' | 'order';
  code: string;
  number: string;
  stage: { key: string; label: string; kind: 'open' | 'done' | 'cancelled'; color?: string };
  path: { key: string; label: string; kind: string; reached: boolean }[];
  events: PublicEvent[];
  createdAt?: string;
  onlinePayment: boolean;
  // request
  type?: { slug: string; label: { en: string; fa: string } };
  name?: string;
  answers?: { label: string; value: string }[];
  message?: string;
  item?: { title: { en: string; fa: string } } | null;
  /** The item that handles the request (its trainer), and whether the customer may rate it now. */
  assigned?: { collection: string; slug: string; title: { en: string; fa: string }; reviews: boolean; reviewed: boolean; canReview: boolean } | null;
  payment?: { status: string; dueMinor: string; paidMinor: string; currency: string; title: string };
  canCancel?: boolean;
  canReply?: boolean;
  canPay?: boolean;
  files?: { id: string; name: string; url: string; contentType: string }[];
  // order
  pricingPending?: boolean;
  paymentStatus?: string;
  paymentMethod?: string;
  currency?: string;
  totalMinor?: string;
  subtotalMinor?: string;
  shippingMinor?: string;
  shippingMethod?: { label: { en: string; fa: string } } | null;
  discountMinor?: string;
  couponCode?: string | null;
  customer?: InvoiceOrder['customer'];
  items?: { productName: { en: string; fa: string }; quantity: number; option: string; variant?: string; unitPriceMinor?: string; lineTotalMinor: string }[];
}

/** After a finished request: rate and comment on the item that handled it (its trainer). */
function RateAssigned({ code, number, assigned }: { code: string; number: string; assigned: NonNullable<CaseData['assigned']> }) {
  const t = useText();
  const { l } = usePreferences();
  const api = useCustomerApi();
  const qc = useQueryClient();
  const errLang = useSiteErrorLanguage();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const send = useMutation({
    mutationFn: async () => {
      // The review is tied to this request: find its id among the ones the server allows.
      const r = await api.get<{ mine: { leads: { id: string; code: string }[] } }>(`/collections/${assigned.collection}/items/${assigned.slug}/reviews?limit=1`);
      const lead = r.mine.leads.find((x) => x.code === code) ?? r.mine.leads[0];
      return api.post(`/collections/${assigned.collection}/items/${assigned.slug}/reviews`, { rating, body, ...(lead ? { leadId: lead.id } : {}) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['public', api.site] }),
  });
  if (send.isSuccess) return <p className="text-sm text-emerald-800">✓ {t(L('Thank you for your review.', 'از ثبت نظر شما سپاسگزاریم.'))}</p>;
  return (
    <form
      className="flex flex-col gap-4 rounded-xl border border-accent/40 bg-surface p-5"
      data-request={number}
      onSubmit={(e) => {
        e.preventDefault();
        if (rating) send.mutate();
      }}
    >
      <p className="font-medium text-ink">
        {t(L('How was it? Rate ', 'تجربه‌ی شما چطور بود؟ به '))}
        {l(assigned.title)}
        {t(L('', ' امتیاز دهید'))}
      </p>
      <div role="radiogroup" aria-label={t(L('Your rating', 'امتیاز شما'))} dir="ltr" className="flex gap-1 text-3xl">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n}`} onClick={() => setRating(n)} className={cn('leading-none', n <= rating ? 'text-amber-500' : 'text-ink/20 hover:text-amber-300')}>
            ★
          </button>
        ))}
      </div>
      <textarea rows={3} maxLength={1500} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t(L('Your comment (optional)', 'نظر شما (اختیاری)'))} className="rounded-md border border-line bg-bg p-3 text-sm" />
      {send.error && <p className="text-sm text-danger">{errorLine(send.error, errLang)}</p>}
      <Button type="submit" size="sm" className="w-fit" disabled={!rating || send.isPending}>
        {t(L('Send review', 'ثبت نظر'))}
      </Button>
    </form>
  );
}

/** The stages a customer can see, in order: done ones ticked, the current one bold. */
export function ProgressSteps({ steps, current }: { steps: { key: string; label: string; reached: boolean }[]; current: string }) {
  const t = useText();
  if (steps.length < 2) return null;
  return (
    <ol className="flex flex-wrap items-center gap-y-3" aria-label={t(L('Progress', 'مراحل'))}>
      {steps.map((p, i) => {
        const now = p.key === current;
        return (
          <li key={p.key} className="flex items-center">
            <span className={cn('flex items-center gap-2 text-sm', p.reached ? 'text-ink' : 'text-ink-soft/60', now && 'font-semibold')} aria-current={now ? 'step' : undefined}>
              <span className={cn('flex size-6 items-center justify-center rounded-full border text-xs', p.reached ? 'border-ink bg-ink text-bg' : 'border-line')}>{p.reached && !now ? '✓' : i + 1}</span>
              {p.label}
            </span>
            {i < steps.length - 1 && <span className={cn('mx-3 h-px w-8 sm:w-12', steps[i + 1].reached ? 'bg-ink' : 'bg-line')} />}
          </li>
        );
      })}
    </ol>
  );
}

const DOT: Record<string, string> = { gray: 'bg-stone-400', blue: 'bg-sky-500', amber: 'bg-amber-500', violet: 'bg-violet-500', green: 'bg-emerald-500', red: 'bg-rose-500' };

/**
 * One request or order as its customer sees it: where it is in its workflow, the timeline of
 * public events and messages, and what they can do now (pay, reply, cancel). Opened from the
 * customer's account, or by anyone holding its link (`token`).
 */
export function CaseView({ code, token, paymentResult }: { code: string; token?: string; paymentResult?: string | null }) {
  const t = useText();
  const api = useCustomerApi();
  const qc = useQueryClient();
  const { locale, dir, l, formatMoney, formatDate } = usePreferences();
  const errLang = useSiteErrorLanguage();
  const { data: siteSettings } = useSiteSettings();
  const [reply, setReply] = useState('');
  const isRequest = /^r/i.test(code);
  const number = code.replace(/\D/g, '');
  const tokenQs = token ? `&token=${encodeURIComponent(token)}` : '';
  const key = ['public', api.site, 'case', code, token];
  const view = useQuery({
    queryKey: key,
    queryFn: () => api.get<CaseData>(isRequest ? `/requests/${number}?locale=${locale}${tokenQs}` : `/orders/${number}/view?locale=${locale}${tokenQs}`),
    retry: false,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const send = useMutation({
    mutationFn: () => api.post(isRequest ? `/requests/${number}/messages` : `/orders/${number}/messages`, { text: reply.trim(), ...(token ? { token } : {}) }),
    onSuccess: () => {
      setReply('');
      refresh();
    },
  });
  const cancel = useMutation({ mutationFn: () => api.post(`/requests/${number}/cancel`, token ? { token } : {}), onSuccess: refresh });
  const pay = useMutation({
    mutationFn: () => api.post<{ redirectUrl: string }>(isRequest ? `/requests/${number}/pay` : `/orders/${number}/pay`, { locale, ...(token ? { token } : {}) }),
    onSuccess: (r) => window.location.assign(r.redirectUrl),
  });

  if (view.isLoading) return <p className="py-16 text-center text-ink-soft">{t(L('Loading…', 'در حال بارگذاری…'))}</p>;
  if (view.error || !view.data)
    return (
      <div className="border border-line bg-surface p-8 text-center">
        <p className="text-ink">{t(L('This request could not be found, or the link has expired.', 'این درخواست پیدا نشد یا لینک منقضی شده است.'))}</p>
        <Link to="/track" className="mt-4 inline-block underline">
          {t(L('Track with your code', 'پیگیری با کد'))}
        </Link>
      </div>
    );

  const c = view.data;
  const due = c.kind === 'request' && c.payment && BigInt(c.payment.dueMinor) > 0n;
  const orderUnpaid = c.kind === 'order' && c.paymentMethod !== 'cod' && ['unpaid', 'failed'].includes(c.paymentStatus ?? '') && c.stage.kind === 'open';
  const canReply = c.kind === 'request' ? c.canReply : c.stage.kind === 'open';
  const err = (e: unknown) => (e ? <p role="alert" className="text-sm text-danger">{errorLine(e, errLang)}</p> : null);

  return (
    <div className="flex flex-col gap-8">
      {paymentResult && (
        <p role="status" className={cn('border p-4 text-sm', paymentResult === 'success' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-danger/40 bg-danger/5 text-danger')}>
          {paymentResult === 'success' ? t(L('Payment received. Thank you!', 'پرداخت با موفقیت انجام شد. سپاس!')) : t(L('The payment was not completed. You can try again.', 'پرداخت انجام نشد. می‌توانید دوباره تلاش کنید.'))}
        </p>
      )}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="eyebrow">{c.kind === 'request' ? (c.type ? l(c.type.label) : t(L('Request', 'درخواست'))) : t(L('Order', 'سفارش'))}</p>
          <h1 className="mt-2 font-display text-3xl text-ink" dir="ltr">
            {c.code}
          </h1>
          {c.createdAt && <p className="mt-1 text-sm text-ink-soft">{formatDate(c.createdAt)}</p>}
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm',
            c.stage.kind === 'done' ? 'border-emerald-300 text-emerald-800' : c.stage.kind === 'cancelled' ? 'border-rose-300 text-rose-800' : 'border-line text-ink',
          )}
        >
          <span className={cn('size-2 rounded-full', DOT[c.stage.color ?? ''] ?? (c.stage.kind === 'done' ? DOT.green : c.stage.kind === 'cancelled' ? DOT.red : DOT.blue))} />
          {c.stage.label}
        </span>
      </header>

      {/* Progress through the stages the customer can see. */}
      {c.stage.kind !== 'cancelled' && <ProgressSteps steps={c.path} current={c.stage.key} />}

      {(due || orderUnpaid) && c.onlinePayment && (
        <section className="flex flex-wrap items-center justify-between gap-4 border border-accent/40 bg-surface p-5">
          <div>
            <p className="text-sm text-ink-soft">{t(L('Amount to pay', 'مبلغ قابل پرداخت'))}</p>
            <p className="font-display text-2xl text-ink">{c.pricingPending ? t(L('Awaiting price','در انتظار قیمت')) : due ? formatMoney(c.payment!.dueMinor, c.payment!.currency) : formatMoney(c.totalMinor ?? '0', c.currency ?? 'IRR')}</p>
            {due && c.payment!.title && <p className="text-sm text-ink-soft">{c.payment!.title}</p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <Button onClick={() => pay.mutate()} disabled={pay.isPending || (c.kind === 'request' && !c.canPay)}>
              {pay.isPending ? t(L('Connecting to the gateway…', 'در حال اتصال به درگاه…')) : t(L('Pay online', 'پرداخت آنلاین'))}
            </Button>
            {err(pay.error)}
          </div>
        </section>
      )}
      {c.kind === 'request' && c.payment && BigInt(c.payment.paidMinor) > 0n && (
        <p className="text-sm text-emerald-800">
          ✓ {t(L('Paid', 'پرداخت‌شده'))}: {formatMoney(c.payment.paidMinor, c.payment.currency)}
        </p>
      )}

      {c.kind === 'request' && c.assigned?.canReview && <RateAssigned code={c.code} number={c.number} assigned={c.assigned} />}
      {c.kind === 'request' && c.assigned?.reviewed && <p className="text-sm text-emerald-800">✓ {t(L('Thank you for your review.', 'از ثبت نظر شما سپاسگزاریم.'))}</p>}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-ink-soft">{c.kind === 'request' ? t(L('Your request', 'درخواست شما')) : t(L('Items', 'اقلام'))}</h2>
          {c.kind === 'request' ? (
            <dl className="flex flex-col gap-3 text-sm">
              {c.item && (
                <div>
                  <dt className="text-xs text-ink-soft">{t(L('About', 'درباره‌ی'))}</dt>
                  <dd>{l(c.item.title)}</dd>
                </div>
              )}
              {c.assigned && (
                <div>
                  <dt className="text-xs text-ink-soft">{t(L('Handled by', 'انجام‌دهنده'))}</dt>
                  <dd>
                    <Link to={`/${c.assigned.collection}/${c.assigned.slug}`} className="underline-offset-4 hover:underline">
                      {l(c.assigned.title)}
                    </Link>
                  </dd>
                </div>
              )}
              {c.answers?.map((a, i) => (
                <div key={i}>
                  <dt className="text-xs text-ink-soft">{a.label}</dt>
                  <dd className="whitespace-pre-wrap text-ink">{a.value}</dd>
                </div>
              ))}
              {c.message && <dd className="whitespace-pre-wrap text-ink">{c.message}</dd>}
              {!!c.files?.length && (
                <div>
                  <dt className="text-xs text-ink-soft">{t(L('Your files', 'فایل‌های شما'))}</dt>
                  {c.files.map((f) => (
                    <dd key={f.id}>
                      <a href={f.url} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                        📎 {f.name}
                      </a>
                    </dd>
                  ))}
                </div>
              )}
            </dl>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {c.items?.map((it, i) => (
                <li key={i} className="flex justify-between gap-4 border-b border-line pb-2">
                  <span>
                    {l(it.productName)}
                    {[it.variant, it.option].filter(Boolean).length ? ` (${[it.variant, it.option].filter(Boolean).join('، ')})` : ''} × {it.quantity}
                  </span>
                  <span>{c.pricingPending ? t(L('Awaiting price','در انتظار قیمت')) : formatMoney(it.lineTotalMinor, c.currency ?? 'IRR')}</span>
                </li>
              ))}
              {Number(c.discountMinor) > 0 && (
                <li className="flex justify-between">
                  <span>{t(L('Discount', 'تخفیف'))}</span>
                  <span>−{formatMoney(c.discountMinor!, c.currency ?? 'IRR')}</span>
                </li>
              )}
              {c.shippingMethod && (
                <li className="flex justify-between">
                  <span>
                    {t(L('Shipping', 'ارسال'))} ({l(c.shippingMethod.label)})
                  </span>
                  <span>{formatMoney(c.shippingMinor ?? '0', c.currency ?? 'IRR')}</span>
                </li>
              )}
              <li className="flex justify-between font-medium">
                <span>{t(L('Total', 'جمع'))}</span>
                <span>{c.pricingPending ? t(L('Awaiting price','در انتظار قیمت')) : formatMoney(c.totalMinor ?? '0', c.currency ?? 'IRR')}</span>
              </li>
              <li>
                <Button disabled={c.pricingPending}
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    printInvoice(
                      { ...c, number: c.number ?? code.replace(/\D/g, ''), currency: c.currency ?? 'IRR', totalMinor: c.totalMinor ?? '0', items: (c.items ?? []).map((it) => ({ ...it, unitPriceMinor: it.unitPriceMinor ?? it.lineTotalMinor })) },
                      { name: l(siteSettings?.name), phone: siteSettings?.contact.phone, email: siteSettings?.contact.email, address: l(siteSettings?.contact.address), logoUrl: siteSettings?.logoUrl || undefined },
                      { locale, l, formatMoney, formatDate },
                    )
                  }
                >
                  {t(L('Print invoice', 'چاپ فاکتور'))}
                </Button>
              </li>
            </ul>
          )}
          {c.kind === 'request' && c.canCancel && (
            <div>
              <Button variant="outline" size="sm" disabled={cancel.isPending} onClick={() => window.confirm(t(L('Cancel this request?', 'این درخواست لغو شود؟'))) && cancel.mutate()}>
                {t(L('Cancel request', 'لغو درخواست'))}
              </Button>
              {err(cancel.error)}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-ink-soft">{t(L('Updates and messages', 'روند و پیام‌ها'))}</h2>
          <ol className="flex flex-col gap-3">
            {c.events.map((e) => {
              const time = <time className="text-[11px] text-ink-soft">{formatDate(e.createdAt)}</time>;
              if (e.kind === 'message' || e.kind === 'customer_message' || (e.kind === 'stage' && e.body)) {
                const mine = e.kind === 'customer_message';
                return (
                  <li key={e.id} className={cn('flex', mine ? 'justify-start' : 'justify-end')}>
                    <div className={cn('max-w-[85%] border px-4 py-3 text-sm', mine ? 'border-line bg-surface' : 'border-accent/30 bg-accent/5')}>
                      {e.kind === 'stage' && <p className="mb-1 text-xs font-medium text-ink-soft">{dir === 'rtl' ? '←' : '→'} {e.stage}</p>}
                      <p className="whitespace-pre-wrap text-ink">{e.body}</p>
                      {time}
                    </div>
                  </li>
                );
              }
              let text = '';
              if (e.kind === 'created') text = t(L('Request received', 'درخواست ثبت شد'));
              else if (e.kind === 'stage') text = `${t(L('Now', 'وضعیت'))}: ${e.stage}`;
              else if (e.kind === 'payment_requested') text = e.withdrawn ? t(L('Payment request withdrawn', 'درخواست پرداخت لغو شد')) : `${t(L('Payment requested', 'درخواست پرداخت'))}: ${formatMoney(e.amountMinor ?? '0', e.currency ?? 'IRR')}${e.body ? ` — ${e.body}` : ''}`;
              else if (e.kind === 'payment') text = e.ok ? `✓ ${t(L('Paid', 'پرداخت شد'))}: ${formatMoney(e.amountMinor ?? '0', e.currency ?? 'IRR')}` : `✗ ${t(L('Payment not completed', 'پرداخت ناموفق'))}`;
              else return null;
              return (
                <li key={e.id} className="flex flex-col items-center gap-1 text-center text-xs">
                  <span className="rounded-full bg-surface px-3 py-1 text-ink">{text}</span>
                  {time}
                </li>
              );
            })}
          </ol>
          {canReply && (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (reply.trim()) send.mutate();
              }}
            >
              <label htmlFor="case-reply" className="text-xs text-ink-soft">
                {t(L('Write a message', 'نوشتن پیام'))}
              </label>
              <textarea id="case-reply" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} className="w-full resize-y border border-line bg-transparent p-3 text-sm text-ink focus:border-accent focus:outline-none" />
              <div>
                <Button type="submit" size="sm" disabled={!reply.trim() || send.isPending}>
                  {t(L('Send', 'ارسال'))}
                </Button>
              </div>
              {err(send.error)}
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
