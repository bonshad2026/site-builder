import { normalizePhone, type SiteSettings } from '@site-builder/shared';
import type { AppContext } from '../../context.js';
import type { TenantContext } from '../../types.js';

export interface Recipient {
  name?: string;
  phone?: string | null;
  email?: string | null;
}

export interface Delivery {
  sms?: boolean;
  email?: boolean;
}

/** The language messages to the customer are written in: the site's default language. */
export const messageLocale = (settings: SiteSettings): 'en' | 'fa' => (settings.defaultLocale === 'fa' ? 'fa' : 'en');

/**
 * Sends a short text to the customer by SMS (when there is a phone) and email (when there is an
 * address). Never throws: a failed delivery is logged and reported back, the request goes on.
 */
export async function notifyCustomer(ctx: AppContext, settings: SiteSettings, to: Recipient, text: string, subject: string): Promise<Delivery> {
  const out: Delivery = {};
  const phone = to.phone ? normalizePhone(to.phone) : '';
  if (phone) {
    try {
      await ctx.sms.sendText(phone, text);
      out.sms = true;
    } catch (err) {
      ctx.log.warn({ err }, 'customer SMS failed');
      out.sms = false;
    }
  }
  if (to.email && to.email.includes('@')) {
    try {
      await ctx.email.send({ to: to.email, subject: `${siteName(settings)} — ${subject}`, text });
      out.email = true;
    } catch (err) {
      ctx.log.warn({ err }, 'customer email failed');
      out.email = false;
    }
  }
  return out;
}

/** Emails the staff (the addresses in the settings, else the site owners) about something new. */
export async function notifyStaff(ctx: AppContext, tenant: Pick<TenantContext, 'id'>, settings: SiteSettings, subject: string, text: string): Promise<void> {
  if (!settings.notifications.staff) return;
  try {
    let emails = settings.notifications.emails;
    if (!emails.length) {
      const { rows } = await ctx.control.query<{ email: string }>(
        `SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = $1 AND m.role = 'owner' AND u.email LIKE '%@%'`,
        [tenant.id],
      );
      emails = rows.map((r) => r.email);
    }
    for (const to of emails) await ctx.email.send({ to, subject: `${siteName(settings)} — ${subject}`, text });
  } catch (err) {
    ctx.log.warn({ err }, 'staff notification failed');
  }
}

/** An amount for messages: 1,500,000 IRR / ۱٬۵۰۰٬۰۰۰ ریال. */
export function formatAmount(minor: string | number | bigint, currency: string, locale: 'en' | 'fa'): string {
  const decimals = ['USD', 'EUR', 'GBP', 'AED', 'TRY'].includes(currency) ? 2 : 0;
  const n = Number(minor) / 10 ** decimals;
  const names: Record<string, { en: string; fa: string }> = { IRR: { en: 'IRR', fa: 'ریال' }, IRT: { en: 'Toman', fa: 'تومان' } };
  const unit = names[currency]?.[locale] ?? currency;
  return `${n.toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US')} ${unit}`;
}

/** The site's name in the language messages are written in. */
export function siteName(settings: SiteSettings): string {
  const name = settings.name as unknown as string | { en: string; fa: string };
  if (typeof name === 'string') return name;
  return name[messageLocale(settings)] || name.en || name.fa;
}
