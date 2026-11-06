import type { CartLine } from './cart';

export function sharedOrderText(input: {
  shop: string;
  recipient: string;
  lines: CartLine[];
  name: (value: CartLine['name']) => string;
  customer: Record<string, string | undefined>;
  showPrices: boolean;
  money: (amount: string, currency: string) => string;
  labels: { order: string; customer: string; recipient: string };
}) {
  return [
    `${input.labels.order} — ${input.shop}`,
    input.recipient ? `${input.labels.recipient}: ${input.recipient}` : '',
    ...input.lines.map((line) => `${line.quantity} × ${input.name(line.name)}${[line.variant, line.option].filter(Boolean).length ? ` (${[line.variant, line.option].filter(Boolean).join(', ')})` : ''}${input.showPrices ? ` — ${input.money((BigInt(line.priceMinor) * BigInt(line.quantity)).toString(), line.currency)}` : ''}`),
    '',
    input.labels.customer,
    ...Object.entries(input.customer).filter(([, v]) => v?.trim()).map(([k, v]) => `${k}: ${v!.trim()}`),
  ].filter(Boolean).join('\n');
}

/** Opens the device chooser; resolving is not a delivery receipt. The basket stays intact. */
export async function shareOrder(text: string, target?: { kind: 'chooser' | 'instagram'; username: string }): Promise<'opened' | 'instagram-opened' | 'cancelled' | 'unavailable'> {
  if (target?.kind === 'instagram') {
    const username = target.username.replace(/^@/, '');
    if (!/^[A-Za-z0-9._]{1,30}$/.test(username)) return 'unavailable';
    if (navigator.userAgent.includes('SiteBuilderAndroid/')) {
      if (!navigator.userAgent.includes('SiteBuilderAndroid/2') || text.length > 16000) return 'unavailable';
      window.location.assign('sitebuilder-share://instagram-order?username=' + encodeURIComponent(username) + '&text=' + encodeURIComponent(text));
    } else {
      try { await navigator.clipboard.writeText(text); } catch { return 'unavailable'; }
      window.location.assign('https://ig.me/m/' + encodeURIComponent(username));
    }
    return 'instagram-opened';
  }
  if (navigator.userAgent.includes('SiteBuilderAndroid/')) {
    if (text.length > 16000) return 'unavailable';
    window.location.assign(`sitebuilder-share://order?text=${encodeURIComponent(text)}`);
    return 'opened';
  }
  if (!navigator.share) return 'unavailable';
  try {
    await navigator.share({ title: 'Order', text });
    return 'opened';
  } catch (err) {
    if ((err as DOMException).name === 'AbortError') return 'cancelled';
    return 'unavailable';
  }
}
