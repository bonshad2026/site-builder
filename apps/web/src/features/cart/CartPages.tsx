import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Arrow, Button, ButtonLink } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { FieldShell, Select, TextArea, TextInput } from '../../components/ui/Field';
import { Image } from '../../components/ui/Image';
import { Container, PageHeader, Section } from '../../components/ui/Layout';
import { usePageMeta } from '../../hooks/usePageMeta';
import { api, apiAvailable, ApiError } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import type { OrderItemDto, OrderStatus, PaymentStatus } from '../../types/api';
import { normalizeDigits } from '../leads/leadSchema';
import { usePaymentMethods, useSiteId } from '../public-site/data';
import { MAX_QUANTITY, useCart } from './cart';

export function CartPage() {
  const { m, l, formatMoney } = usePreferences();
  const cart = useCart();
  usePageMeta(m.shop.cart, undefined, { noIndex: true });
  const currency = cart.lines[0]?.currency ?? 'IRR';

  return (
    <>
      <PageHeader eyebrow={m.shop.cart} title={m.shop.cartTitle} />
      <Section className="pt-10">
        <Container>
          {cart.lines.length === 0 ? (
            <EmptyState message={m.shop.empty} />
          ) : (
            <div className="grid gap-12 lg:grid-cols-12">
              <ul className="divide-y divide-line border-y border-line lg:col-span-8">
                {cart.lines.map((line) => (
                  <li key={line.productId} className="flex gap-5 py-6">
                    <Image src={line.imageUrl} alt="" className="aspect-square w-24 shrink-0" />
                    <div className="flex flex-1 flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <div>
                        <Link to={`/products/${line.slug}`} className="font-display text-2xl text-ink hover:text-accent">
                          {l(line.name)}
                        </Link>
                        <p className="text-sm text-ink-soft">{formatMoney(line.priceMinor, line.currency)}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-sm text-ink-soft">
                          <span className="sr-only">{m.shop.quantity}</span>
                          <Select value={line.quantity} onChange={(e) => cart.setQuantity(line.productId, Number(e.target.value))} className="w-20 py-2">
                            {Array.from({ length: Math.max(10, line.quantity) }, (_, i) => i + 1)
                              .filter((n) => n <= MAX_QUANTITY)
                              .map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                          </Select>
                        </label>
                        <button type="button" onClick={() => cart.setQuantity(line.productId, 0)} className="text-sm text-ink-soft underline underline-offset-4 hover:text-danger">
                          {m.shop.remove}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <aside className="h-fit border border-line bg-surface p-8 lg:col-span-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-ink-soft">{m.shop.subtotal}</span>
                  <span className="font-display text-3xl text-ink">{formatMoney(cart.subtotalMinor, currency)}</span>
                </div>
                <p className="mt-3 text-xs text-ink-soft">{m.shop.priceNote}</p>
                <ButtonLink to="/checkout" className="mt-8 w-full">
                  {m.shop.checkout} <Arrow />
                </ButtonLink>
              </aside>
            </div>
          )}
          <div className="mt-10">
            <ButtonLink to="/products" variant="ghost">
              {m.shop.backToShop}
            </ButtonLink>
          </div>
        </Container>
      </Section>
    </>
  );
}

const checkoutSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  phone: z
    .string()
    .trim()
    .transform((v) => normalizeDigits(v).replace(/[\s-]/g, ''))
    .refine((v) => /^\+?[0-9]{8,15}$/.test(v)),
  address: z.string().trim().max(500).optional(),
  note: z.string().trim().max(1000).optional(),
});
type CheckoutInput = z.input<typeof checkoutSchema>;
type CheckoutData = z.output<typeof checkoutSchema>;

export function CheckoutPage() {
  const { m, l, locale, formatMoney, format } = usePreferences();
  const site = useSiteId();
  const cart = useCart();
  const navigate = useNavigate();
  const { data: payment } = usePaymentMethods(apiAvailable());
  const [error, setError] = useState<string | null>(null);
  usePageMeta(m.shop.checkout, undefined, { noIndex: true });

  const { register, handleSubmit, formState } = useForm<CheckoutInput, unknown, CheckoutData>({ resolver: zodResolver(checkoutSchema) });
  const errText = (name: keyof CheckoutInput) => (formState.errors[name] ? m.form.errors[name === 'phone' ? 'phoneInvalid' : name === 'email' ? 'emailInvalid' : 'nameRequired'] : undefined);

  const submit = useMutation({
    mutationFn: async (data: CheckoutData) => {
      const order = await api.post<{ number: string; orderToken: string }>(`/public/sites/${site}/orders`, {
        customer: { name: data.name, email: data.email, phone: data.phone, address: data.address || undefined },
        note: data.note || undefined,
        items: cart.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
      });
      cart.clear();
      if (payment?.online) {
        const pay = await api.post<{ redirectUrl: string }>(`/public/sites/${site}/orders/${order.number}/pay`, { token: order.orderToken, locale });
        window.location.assign(pay.redirectUrl);
        return;
      }
      navigate(`/checkout/result?order=${order.number}&token=${encodeURIComponent(order.orderToken)}`);
    },
    onError: (err) => setError(format(m.shop.orderFailed, { reason: err instanceof ApiError ? err.message : String(err) })),
  });

  if (!cart.lines.length && !submit.isPending) {
    return (
      <>
        <PageHeader eyebrow={m.shop.checkout} title={m.shop.checkoutTitle} />
        <Section className="pt-10">
          <Container>
            <EmptyState message={m.shop.empty} />
          </Container>
        </Section>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow={m.shop.checkout} title={m.shop.checkoutTitle} />
      <Section className="pt-10">
        <Container className="grid gap-14 lg:grid-cols-12">
          <form noValidate onSubmit={handleSubmit((d) => submit.mutate(d))} className="grid gap-8 sm:grid-cols-2 lg:col-span-7">
            <FieldShell id="co-name" label={m.form.name} error={errText('name')}>
              <TextInput id="co-name" autoComplete="name" aria-invalid={!!formState.errors.name} {...register('name')} />
            </FieldShell>
            <FieldShell id="co-email" label={m.form.email} error={errText('email')}>
              <TextInput id="co-email" type="email" dir="ltr" autoComplete="email" aria-invalid={!!formState.errors.email} {...register('email')} />
            </FieldShell>
            <FieldShell id="co-phone" label={m.form.phone} error={errText('phone')}>
              <TextInput id="co-phone" type="tel" dir="ltr" autoComplete="tel" aria-invalid={!!formState.errors.phone} {...register('phone')} />
            </FieldShell>
            <div className="sm:col-span-2">
              <FieldShell id="co-address" label={m.shop.address} hint={m.shop.optional}>
                <TextArea id="co-address" rows={3} autoComplete="street-address" {...register('address')} />
              </FieldShell>
            </div>
            <div className="sm:col-span-2">
              <FieldShell id="co-note" label={m.shop.note} hint={m.shop.optional}>
                <TextArea id="co-note" rows={3} {...register('note')} />
              </FieldShell>
            </div>
            {!apiAvailable() && <p className="text-sm text-danger sm:col-span-2">{m.shop.needsBackend}</p>}
            {payment && !payment.online && apiAvailable() && <p className="text-sm text-ink-soft sm:col-span-2">{m.shop.noOnlinePayment}</p>}
            {payment?.isTest && <p className="border border-dashed border-accent px-4 py-3 text-sm text-ink sm:col-span-2">{m.shop.testGateway}</p>}
            {error && (
              <p role="alert" className="text-sm text-danger sm:col-span-2">
                {error}
              </p>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={!apiAvailable() || submit.isPending} className="w-full sm:w-auto">
                {submit.isPending ? m.shop.placing : payment?.online ? m.shop.placeAndPay : m.shop.placeOrder}
              </Button>
            </div>
          </form>
          <aside className="h-fit border border-line bg-surface p-8 lg:col-span-4 lg:col-start-9">
            <ul className="space-y-4 text-sm">
              {cart.lines.map((line) => (
                <li key={line.productId} className="flex justify-between gap-4">
                  <span className="text-ink">
                    {l(line.name)} × {line.quantity}
                  </span>
                  <span className="text-ink-soft">{formatMoney((BigInt(line.priceMinor) * BigInt(line.quantity)).toString(), line.currency)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line pt-6">
              <span className="text-ink-soft">{m.shop.subtotal}</span>
              <span className="font-display text-2xl text-ink">{formatMoney(cart.subtotalMinor, cart.lines[0]?.currency ?? 'IRR')}</span>
            </div>
            <p className="mt-3 text-xs text-ink-soft">{m.shop.priceNote}</p>
          </aside>
        </Container>
      </Section>
    </>
  );
}

interface BuyerOrder {
  number: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  currency: string;
  totalMinor: string;
  items: OrderItemDto[];
}

export function CheckoutResultPage() {
  const { m, l, locale, formatMoney, format } = usePreferences();
  const site = useSiteId();
  const [params] = useSearchParams();
  const number = params.get('order') ?? '';
  const token = params.get('token') ?? '';
  const { data: payment } = usePaymentMethods(apiAvailable());
  usePageMeta(format(m.shop.resultTitle, { number }), undefined, { noIndex: true });

  const order = useQuery({
    queryKey: ['public', site, 'order', number, token],
    queryFn: () => api.get<BuyerOrder>(`/public/sites/${site}/orders/${number}?token=${encodeURIComponent(token)}`),
    enabled: apiAvailable() && !!number && !!token,
    retry: false,
  });
  const pay = useMutation({
    mutationFn: () => api.post<{ redirectUrl: string }>(`/public/sites/${site}/orders/${number}/pay`, { token, locale }),
    onSuccess: (r) => window.location.assign(r.redirectUrl),
  });

  const statusText = useMemo(() => (order.data ? m.shop.status[order.data.paymentStatus === 'unpaid' && payment?.online ? 'unpaid' : order.data.paymentStatus] : ''), [order.data, payment, m]);
  const canPay = order.data && payment?.online && ['unpaid', 'failed'].includes(order.data.paymentStatus) && order.data.status !== 'cancelled';

  return (
    <>
      <PageHeader eyebrow={m.shop.checkout} title={format(m.shop.resultTitle, { number })} />
      <Section className="pt-10">
        <Container className="max-w-3xl">
          {order.isLoading && <div role="status" aria-label="Loading" className="h-40 animate-pulse bg-surface-2" />}
          {order.isError && <EmptyState message={m.shop.orderNotFound} />}
          {order.data && (
            <div className="space-y-8">
              <p
                role="status"
                className={`border px-6 py-5 text-lg ${order.data.paymentStatus === 'paid' ? 'border-ink text-ink' : order.data.paymentStatus === 'failed' ? 'border-danger text-danger' : 'border-line text-ink'}`}
              >
                {statusText}
              </p>
              <ul className="divide-y divide-line border-y border-line text-sm">
                {order.data.items.map((it, i) => (
                  <li key={i} className="flex justify-between gap-4 py-4">
                    <span className="text-ink">
                      {l(it.productName)} × {it.quantity}
                    </span>
                    <span className="text-ink-soft">{formatMoney(it.lineTotalMinor, order.data!.currency)}</span>
                  </li>
                ))}
                <li className="flex justify-between gap-4 py-4 text-base">
                  <span className="text-ink-soft">{m.shop.total}</span>
                  <span className="font-display text-2xl text-ink">{formatMoney(order.data.totalMinor, order.data.currency)}</span>
                </li>
              </ul>
              <div className="flex flex-wrap gap-4">
                {canPay && (
                  <Button onClick={() => pay.mutate()} disabled={pay.isPending}>
                    {m.shop.payNow}
                  </Button>
                )}
                <ButtonLink to="/products" variant="outline">
                  {m.shop.backToShop}
                </ButtonLink>
              </div>
            </div>
          )}
        </Container>
      </Section>
    </>
  );
}
