/**
 * A printable invoice for an order: opens in a new window and the print dialog opens with it
 * (print to paper or save as PDF). Used by the staff (order details) and the buyer (their order).
 */

type Loc = { en: string; fa: string };

export interface InvoiceOrder {
  number: string;
  createdAt?: string;
  currency: string;
  totalMinor: string;
  subtotalMinor?: string;
  shippingMinor?: string;
  discountMinor?: string;
  couponCode?: string | null;
  shippingMethod?: { label: Loc } | null;
  paymentStatus?: string;
  paymentMethod?: string;
  customer?: { name: string; phone?: string; email?: string; address?: string; province?: string; city?: string; postalCode?: string; answers?: { label: string; value: string }[] };
  items?: { productName: Loc; quantity: number; unitPriceMinor: string; lineTotalMinor: string; option?: string; variant?: string }[];
}

export interface InvoiceSite {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  logoUrl?: string;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function printInvoice(
  order: InvoiceOrder,
  site: InvoiceSite,
  p: { locale: 'fa' | 'en'; l: (v: Loc) => string; formatMoney: (minor: string, currency: string) => string; formatDate: (iso: string) => string },
) {
  const fa = p.locale === 'fa';
  const T = (en: string, f: string) => (fa ? f : en);
  const money = (v: string | undefined) => p.formatMoney(v ?? '0', order.currency);
  const c = order.customer ?? { name: '' };
  const rows = (order.items ?? [])
    .map(
      (it, i) => `<tr><td>${i + 1}</td><td>${esc(p.l(it.productName))}${[it.variant, it.option].filter(Boolean).length ? ` <small>(${esc([it.variant, it.option].filter(Boolean).join('، '))})</small>` : ''}</td>
      <td>${esc(it.quantity)}</td><td>${esc(money(it.unitPriceMinor))}</td><td>${esc(money(it.lineTotalMinor))}</td></tr>`,
    )
    .join('');
  const line = (label: string, value: string) => `<tr><th colspan="4">${esc(label)}</th><td>${esc(value)}</td></tr>`;
  const address = [c.province, c.city, c.address, c.postalCode ? `${T('Postal code', 'کد پستی')}: ${c.postalCode}` : ''].filter(Boolean).join('، ');
  const html = `<!doctype html><html lang="${p.locale}" dir="${fa ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(T('Invoice', 'فاکتور'))} ${esc(order.number)}</title>
<style>
  body{font-family:Vazirmatn,Tahoma,Arial,sans-serif;color:#222;margin:32px;font-size:13px}
  header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:2px solid #222;padding-bottom:12px}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:15px;margin:24px 0 8px}
  img{max-height:56px} .muted{color:#666} table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{border:1px solid #ccc;padding:6px 8px;text-align:start} thead th{background:#f3f3f3}
  tfoot th{text-align:end;font-weight:normal} tfoot tr:last-child th,tfoot tr:last-child td{font-weight:bold}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  @media print{body{margin:12mm}}
</style></head><body>
<header><div>${site.logoUrl ? `<img src="${esc(site.logoUrl)}" alt="">` : ''}<h1>${esc(site.name)}</h1>
<div class="muted">${esc([site.address, site.phone, site.email].filter(Boolean).join(' · '))}</div></div>
<div><h1>${esc(T('Invoice', 'فاکتور'))}</h1><div>${esc(T('Order', 'سفارش'))} #${esc(order.number)}</div>
${order.createdAt ? `<div class="muted">${esc(p.formatDate(order.createdAt))}</div>` : ''}</div></header>
<div class="grid"><div><h2>${esc(T('Buyer', 'خریدار'))}</h2><div>${esc(c.name)}</div><div class="muted" dir="ltr">${esc([c.phone, c.email].filter(Boolean).join(' · '))}</div>
${address ? `<div>${esc(address)}</div>` : ''}</div>
<div><h2>${esc(T('Payment', 'پرداخت'))}</h2><div>${esc(order.paymentMethod === 'cod' ? T('On delivery', 'پرداخت در محل') : T('Online', 'آنلاین'))}${order.paymentStatus ? ` · ${esc(order.paymentStatus)}` : ''}</div>
${order.shippingMethod ? `<div>${esc(T('Shipping', 'ارسال'))}: ${esc(p.l(order.shippingMethod.label))}</div>` : ''}</div></div>
${(c.answers ?? []).length ? `<h2>${esc(T('Details', 'جزئیات'))}</h2><div>${(c.answers ?? []).map((a) => `${esc(a.label)}: ${esc(a.value)}`).join('<br>')}</div>` : ''}
<h2>${esc(T('Items', 'اقلام'))}</h2>
<table><thead><tr><th>#</th><th>${esc(T('Item', 'کالا'))}</th><th>${esc(T('Qty', 'تعداد'))}</th><th>${esc(T('Unit price', 'قیمت واحد'))}</th><th>${esc(T('Total', 'جمع'))}</th></tr></thead>
<tbody>${rows}</tbody><tfoot>
${order.subtotalMinor ? line(T('Products', 'جمع کالاها'), money(order.subtotalMinor)) : ''}
${Number(order.discountMinor) ? line(`${T('Discount', 'تخفیف')}${order.couponCode ? ` (${order.couponCode})` : ''}`, `−${money(order.discountMinor)}`) : ''}
${order.shippingMethod ? line(T('Shipping', 'هزینه‌ی ارسال'), Number(order.shippingMinor) ? money(order.shippingMinor) : T('Free', 'رایگان')) : ''}
${line(T('Total', 'مبلغ کل'), money(order.totalMinor))}
</tfoot></table>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},300)})</script>
</body></html>`;
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
