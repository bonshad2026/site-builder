import { zodResolver } from '@hookform/resolvers/zod';
import { IRAN_PROVINCES, shippingCost, type CheckoutSettings } from '@site-builder/shared';
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
import { api, apiAvailable } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import type { OrderItemDto, OrderStatus, PaymentStatus } from '../../types/api';
import { normalizeDigits } from '../leads/leadSchema';
import { usePaymentMethods, useSiteErrorLanguage, useSiteId, useSiteSettings } from '../public-site/data';
import { errorLine } from '../../lib/errorText';
import { lineKey, MAX_QUANTITY, useCart } from './cart';
import { PageSlot, useSystemPage } from '../../sections/PageSlot';
import { customerRequest, useCustomer } from '../account/customerApi';

export function CartPage() {
  const slots = useSystemPage('cart');
  const { m, l, formatMoney } = usePreferences();
  const cart = useCart();
  usePageMeta(m.shop.cart, undefined, { noIndex: true });
  const currency = cart.lines[0]?.currency ?? 'IRR';

  return (
    <>
      <PageSlot slug={slots.before} />
      <PageHeader eyebrow={m.shop.cart} title={m.shop.cartTitle} />
      <Section className="pt-10">
        <Container>
          {cart.lines.length === 0 ? (
            <EmptyState message={m.shop.empty} />
          ) : (
            <div className="grid gap-12 lg:grid-cols-12">
              <ul className="divide-y divide-line border-y border-line lg:col-span-8">
                {cart.lines.map((line) => (
                  <li key={lineKey(line)} className="flex gap-5 py-6">
                    <Image src={line.imageUrl} alt="" className="aspect-square w-24 shrink-0" />
                    <div className="flex flex-1 flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <div>
                        <Link to={line.href ?? `/products/${line.slug}`} className="font-display text-2xl text-ink hover:text-accent">
                          {l(line.name)}
                        </Link>
                        {line.variant && <p className="text-sm text-ink-soft">{m.shop.variant}: {line.variant}</p>}
                        {line.option && <p className="text-sm text-ink-soft">{m.shop.color}: {line.option}</p>}
                        <p className="text-sm text-ink-soft">{formatMoney(line.priceMinor, line.currency)}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-sm text-ink-soft">
                          <span className="sr-only">{m.shop.quantity}</span>
                          <Select value={line.quantity} onChange={(e) => cart.setQuantity(lineKey(line), Number(e.target.value))} className="w-20 py-2">
                            {Array.from({ length: Math.max(10, line.quantity) }, (_, i) => i + 1)
                              .filter((n) => n <= Math.min(MAX_QUANTITY, line.max ?? 50))
                              .map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                          </Select>
                        </label>
                        <button type="button" onClick={() => cart.setQuantity(lineKey(line), 0)} className="text-sm text-ink-soft underline underline-offset-4 hover:text-danger">
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
      <PageSlot slug={slots.after} />
    </>
  );
}

/** The checkout form for this shop: which questions it asks and which are required come from its settings. */
function checkoutFormSchema(c: CheckoutSettings) {
  const text = (rule: 'off' | 'optional' | 'required', max: number) => (rule === 'required' ? z.string().trim().min(1).max(max) : z.string().trim().max(max).optional());
  return z.object({
    name: z.string().trim().min(2).max(120),
    email: c.email === 'required' ? z.string().trim().email() : z.union([z.string().trim().email(), z.literal('')]).optional(),
    phone: z
      .string()
      .trim()
      .transform((v) => normalizeDigits(v).replace(/[\s-]/g, ''))
      .refine((v) => /^\+?[0-9]{8,15}$/.test(v)),
    province: c.region && c.address === 'required' ? z.string().trim().min(1) : z.string().trim().optional(),
    city: c.region && c.address === 'required' ? z.string().trim().min(1).max(80) : z.string().trim().max(80).optional(),
    address: text(c.address, 500),
    postalCode: z
      .string()
      .trim()
      .transform((v) => normalizeDigits(v).replace(/[\s-]/g, ''))
      .refine((v) => (c.postalCode === 'required' ? /^\d{10}$/.test(v) : v === '' || /^\d{10}$/.test(v)))
      .optional(),
    note: z.string().trim().max(1000).optional(),
    answers: z.object(Object.fromEntries(c.fields.map((f) => [f.id, f.required ? z.string().trim().min(1).max(2000) : z.string().trim().max(2000).optional()]))).optional(),
  });
}
type CheckoutData = z.output<ReturnType<typeof checkoutFormSchema>>;
type CheckoutInput = z.input<ReturnType<typeof checkoutFormSchema>>;

export function CheckoutPage() {
  const slots = useSystemPage('checkout');
  const { m, l, locale, formatMoney, format } = usePreferences();
  const site = useSiteId();
  const cart = useCart();
  const navigate = useNavigate();
  const { data: settings } = useSiteSettings();
  const { data: payment } = usePaymentMethods(apiAvailable());
  const [error, setError] = useState<string | null>(null);
  // The buyer picks a gateway (or payment on delivery); by default the site's first gateway, else on delivery.
  const gateways = payment?.gateways ?? (payment?.online && payment.provider ? [{ provider: payment.provider, label: { en: '', fa: '' }, description: { en: '', fa: '' }, isTest: payment.isTest }] : []);
  const [choice, setChoice] = useState<string | null>(null);
  const chosen = choice ?? (gateways[0]?.provider ?? (payment?.cod ? 'cod' : null));
  const payBy: 'online' | 'cod' = chosen === 'cod' ? 'cod' : 'online';
  const chosenGateway = gateways.find((g) => g.provider === chosen);
  const payOptions = [...gateways.map((g) => ({ value: g.provider, label: l(g.label) || m.shop.payOnline, note: l(g.description) })), ...(payment?.cod ? [{ value: 'cod', label: m.shop.payOnDelivery, note: '' }] : [])];
  const errorLang = useSiteErrorLanguage();
  usePageMeta(m.shop.checkout, undefined, { noIndex: true });

  const checkout = settings?.shop?.checkout ?? { email: 'optional', address: 'required', region: true, postalCode: 'optional', note: true, fields: [] };
  const methods = settings?.shop?.shipping ?? [];
  const [shippingId, setShippingId] = useState('');
  const shipping = methods.find((x) => x.id === shippingId) ?? methods[0];
  const currency = cart.lines[0]?.currency ?? 'IRR';
  const subtotal = Number(cart.subtotalMinor);

  // A discount code is checked as it is applied; the server checks it again with the order.
  const [codeText, setCodeText] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discountMinor: number } | null>(null);
  const [couponError, setCouponError] = useState('');
  const couponMessage = (err: unknown) => {
    const code = (err as { details?: { code?: string }[] })?.details?.[0]?.code;
    return code && code in m.shop ? (m.shop as unknown as Record<string, string>)[code] : errorLine(err, errorLang);
  };
  const applyCoupon = useMutation({
    mutationFn: () => api.get<{ code: string; discountMinor: number }>(`/public/sites/${site}/coupons/${encodeURIComponent(codeText.trim())}?subtotal=${subtotal}`),
    onSuccess: (c) => {
      setCoupon(c);
      setCouponError('');
    },
    onError: (err) => {
      setCoupon(null);
      setCouponError(couponMessage(err));
    },
  });
  const discount = coupon ? Math.min(subtotal, coupon.discountMinor) : 0;
  const shippingFee = shipping ? shippingCost(shipping, subtotal - discount) : 0;
  const total = subtotal - discount + shippingFee;

  // A signed-in customer's details fill the form, and the order shows in their account.
  const { customer } = useCustomer();
  const schema = useMemo(() => checkoutFormSchema(checkout), [checkout]);
  const { register, handleSubmit, formState } = useForm<CheckoutInput, unknown, CheckoutData>({
    resolver: zodResolver(schema),
    values: customer ? { name: customer.name, email: customer.email ?? '', phone: customer.phone ?? '', address: '', note: '' } : undefined,
    resetOptions: { keepDirtyValues: true },
  });
  const errors = formState.errors as Record<string, unknown> & { answers?: Record<string, unknown> };
  const errText = (name: string) => {
    if (!errors[name]) return undefined;
    if (name === 'phone') return m.form.errors.phoneInvalid;
    if (name === 'email') return m.form.errors.emailInvalid;
    if (name === 'name') return m.form.errors.nameRequired;
    if (name === 'postalCode') return m.shop.postalCodeInvalid;
    return m.shop.required;
  };
  const optional = (rule: 'off' | 'optional' | 'required') => (rule === 'optional' ? m.shop.optional : undefined);

  const submit = useMutation({
    mutationFn: async (data: CheckoutData) => {
      const order = await customerRequest<{ number: string; orderToken: string }>(site, '/orders', {
        method: 'POST',
        body: {
          customer: {
            name: data.name,
            email: data.email || '',
            phone: data.phone,
            address: data.address || undefined,
            province: data.province || undefined,
            city: data.city || undefined,
            postalCode: data.postalCode || undefined,
            answers: Object.fromEntries(Object.entries(data.answers ?? {}).filter(([, v]) => v)),
          },
          note: data.note || undefined,
          shippingMethod: shipping?.id ?? '',
          coupon: coupon?.code ?? '',
          items: cart.lines.map((line) =>
            line.kind === 'item' ? { itemId: line.productId, quantity: line.quantity } : { productId: line.productId, quantity: line.quantity, option: line.option ?? '', variant: line.variant ?? '' },
          ),
          paymentMethod: payBy,
        },
      });
      cart.clear();
      if (payBy === 'online' && payment?.online) {
        const pay = await api.post<{ redirectUrl: string }>(`/public/sites/${site}/orders/${order.number}/pay`, { token: order.orderToken, locale, gateway: chosenGateway?.provider });
        window.location.assign(pay.redirectUrl);
        return;
      }
      navigate(`/checkout/result?order=${order.number}&token=${encodeURIComponent(order.orderToken)}`);
    },
    onError: (err) => setError(format(m.shop.orderFailed, { reason: couponMessage(err) })),
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
      <PageSlot slug={slots.before} />
      <PageHeader eyebrow={m.shop.checkout} title={m.shop.checkoutTitle} />
      <Section className="pt-10">
        <Container className="grid gap-14 lg:grid-cols-12">
          <form noValidate onSubmit={handleSubmit((d) => submit.mutate(d))} className="grid gap-8 sm:grid-cols-2 lg:col-span-7">
            <FieldShell id="co-name" label={m.form.name} error={errText('name')}>
              <TextInput id="co-name" autoComplete="name" aria-invalid={!!errors.name} {...register('name')} />
            </FieldShell>
            <FieldShell id="co-phone" label={m.form.phone} error={errText('phone')}>
              <TextInput id="co-phone" type="tel" dir="ltr" autoComplete="tel" aria-invalid={!!errors.phone} {...register('phone')} />
            </FieldShell>
            {checkout.email !== 'off' && (
              <FieldShell id="co-email" label={m.form.email} hint={optional(checkout.email)} error={errText('email')}>
                <TextInput id="co-email" type="email" dir="ltr" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
              </FieldShell>
            )}
            {checkout.address !== 'off' && checkout.region && (
              <>
                <FieldShell id="co-province" label={m.shop.province} hint={optional(checkout.address)} error={errText('province')}>
                  <Select id="co-province" aria-invalid={!!errors.province} {...register('province')}>
                    <option value="" />
                    {IRAN_PROVINCES.map((p) => (
                      <option key={p.en} value={l(p)}>
                        {l(p)}
                      </option>
                    ))}
                  </Select>
                </FieldShell>
                <FieldShell id="co-city" label={m.shop.city} hint={optional(checkout.address)} error={errText('city')}>
                  <TextInput id="co-city" autoComplete="address-level2" aria-invalid={!!errors.city} {...register('city')} />
                </FieldShell>
              </>
            )}
            {checkout.address !== 'off' && (
              <div className="sm:col-span-2">
                <FieldShell id="co-address" label={m.shop.address} hint={optional(checkout.address)} error={errText('address')}>
                  <TextArea id="co-address" rows={3} autoComplete="street-address" aria-invalid={!!errors.address} {...register('address')} />
                </FieldShell>
              </div>
            )}
            {checkout.postalCode !== 'off' && (
              <FieldShell id="co-postal" label={m.shop.postalCode} hint={optional(checkout.postalCode)} error={errText('postalCode')}>
                <TextInput id="co-postal" dir="ltr" inputMode="numeric" autoComplete="postal-code" aria-invalid={!!errors.postalCode} {...register('postalCode')} />
              </FieldShell>
            )}
            {checkout.fields.map((f) => (
              <div key={f.id} className={f.type === 'textarea' ? 'sm:col-span-2' : undefined}>
                <FieldShell id={`co-${f.id}`} label={l(f.label)} hint={f.required ? undefined : m.shop.optional} error={errors.answers?.[f.id] ? m.shop.required : undefined}>
                  {f.type === 'textarea' ? (
                    <TextArea id={`co-${f.id}`} rows={3} {...register(`answers.${f.id}` as 'note')} />
                  ) : f.type === 'select' ? (
                    <Select id={`co-${f.id}`} {...register(`answers.${f.id}` as 'note')}>
                      <option value="" />
                      {f.options.map((o, i) => (
                        <option key={i} value={l(o)}>
                          {l(o)}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <TextInput id={`co-${f.id}`} {...register(`answers.${f.id}` as 'note')} />
                  )}
                </FieldShell>
              </div>
            ))}
            {checkout.note && (
              <div className="sm:col-span-2">
                <FieldShell id="co-note" label={m.shop.note} hint={m.shop.optional}>
                  <TextArea id="co-note" rows={3} {...register('note')} />
                </FieldShell>
              </div>
            )}
            {methods.length > 0 && (
              <fieldset className="sm:col-span-2">
                <legend className="mb-3 text-sm text-ink-soft">{m.shop.shippingMethod}</legend>
                <div className="flex flex-col gap-3">
                  {methods.map((x) => {
                    const fee = shippingCost(x, subtotal - discount);
                    return (
                      <label key={x.id} className="flex items-start gap-3 text-ink">
                        <input type="radio" name="shipping-method" value={x.id} checked={shipping?.id === x.id} onChange={() => setShippingId(x.id)} className="mt-1 accent-[var(--color-accent)]" />
                        <span>
                          {l(x.label)} — {fee ? formatMoney(String(fee), currency) : m.shop.free}
                          {(l(x.description) || x.freeAbove !== null) && (
                            <span className="block text-xs text-ink-soft">
                              {l(x.description)}
                              {x.freeAbove !== null && fee ? ` ${format(m.shop.freeAbove, { amount: formatMoney(String(x.freeAbove), currency) })}` : ''}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}
            {!apiAvailable() && <p className="text-sm text-danger sm:col-span-2">{m.shop.needsBackend}</p>}
            {payOptions.length > 1 && (
              <fieldset className="sm:col-span-2">
                <legend className="mb-3 text-sm text-ink-soft">{m.shop.paymentMethod}</legend>
                <div className="flex flex-wrap gap-x-6 gap-y-3">
                  {payOptions.map((o) => (
                    <label key={o.value} className="flex items-start gap-2 text-ink">
                      <input type="radio" name="payment-method" value={o.value} checked={chosen === o.value} onChange={() => setChoice(o.value)} className="mt-1 accent-[var(--color-accent)]" />
                      <span>
                        {o.label}
                        {o.note && <span className="block text-xs text-ink-soft">{o.note}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {payment && !payment.online && payment.cod && <p className="text-sm text-ink-soft sm:col-span-2">{m.shop.codOnly}</p>}
            {payment && !payment.online && !payment.cod && apiAvailable() && <p className="text-sm text-ink-soft sm:col-span-2">{m.shop.noOnlinePayment}</p>}
            {payBy === 'online' && chosenGateway?.isTest && <p className="border border-dashed border-accent px-4 py-3 text-sm text-ink sm:col-span-2">{m.shop.testGateway}</p>}
            {error && (
              <p role="alert" className="text-sm text-danger sm:col-span-2">
                {error}
              </p>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={!apiAvailable() || submit.isPending} className="w-full sm:w-auto">
                {submit.isPending ? m.shop.placing : payBy === 'online' && payment?.online ? m.shop.placeAndPay : m.shop.placeOrder}
              </Button>
            </div>
          </form>
          <aside className="h-fit border border-line bg-surface p-8 lg:col-span-4 lg:col-start-9">
            <ul className="space-y-4 text-sm">
              {cart.lines.map((line) => (
                <li key={lineKey(line)} className="flex justify-between gap-4">
                  <span className="text-ink">
                    {l(line.name)}
                    {[line.variant, line.option].filter(Boolean).length ? ` (${[line.variant, line.option].filter(Boolean).join('، ')})` : ''} × {line.quantity}
                  </span>
                  <span className="text-ink-soft">{formatMoney((BigInt(line.priceMinor) * BigInt(line.quantity)).toString(), line.currency)}</span>
                </li>
              ))}
            </ul>
            {settings?.modules.orders && (
              <div className="mt-6 border-t border-line pt-6">
                {coupon ? (
                  <p className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-ink">
                      {m.shop.couponLabel}: <span dir="ltr">{coupon.code}</span>
                    </span>
                    <button type="button" className="text-ink-soft underline" onClick={() => setCoupon(null)}>
                      {m.shop.couponRemove}
                    </button>
                  </p>
                ) : (
                  <form
                    className="flex items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (codeText.trim()) applyCoupon.mutate();
                    }}
                  >
                    <FieldShell id="co-coupon" label={m.shop.couponLabel} error={couponError || undefined}>
                      <TextInput id="co-coupon" dir="ltr" value={codeText} onChange={(e) => setCodeText(e.target.value)} />
                    </FieldShell>
                    <Button type="submit" variant="outline" size="sm" disabled={applyCoupon.isPending || !codeText.trim()}>
                      {m.shop.couponApply}
                    </Button>
                  </form>
                )}
              </div>
            )}
            <dl className="mt-6 space-y-2 border-t border-line pt-6 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">{m.shop.subtotal}</dt>
                <dd className="text-ink">{formatMoney(String(subtotal), currency)}</dd>
              </div>
              {discount > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-soft">{m.shop.discount}</dt>
                  <dd className="text-ink">−{formatMoney(String(discount), currency)}</dd>
                </div>
              )}
              {methods.length > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-soft">{m.shop.shipping}</dt>
                  <dd className="text-ink">{shippingFee ? formatMoney(String(shippingFee), currency) : m.shop.free}</dd>
                </div>
              )}
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pt-2">
                <dt className="text-ink-soft">{m.shop.total}</dt>
                <dd className="font-display text-2xl text-ink">{formatMoney(String(total), currency)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-ink-soft">{m.shop.priceNote}</p>
          </aside>
        </Container>
      </Section>
      <PageSlot slug={slots.after} />
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
  const slots = useSystemPage('checkoutResult');
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
      <PageSlot slug={slots.before} />
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
      <PageSlot slug={slots.after} />
    </>
  );
}
