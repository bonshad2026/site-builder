import { withSettingDefaults, type SiteSettings } from '@site-builder/shared';
import type pg from 'pg';
import { hmac, safeEqual, sha256 } from '../../common/crypto.js';
import type { AppContext } from '../../context.js';

/** The site's settings with every option group filled in. */
export async function loadSettings(db: pg.Pool | pg.PoolClient): Promise<SiteSettings> {
  const { rows } = await db.query('SELECT settings FROM site_settings WHERE id = 1');
  return withSettingDefaults(rows[0]?.settings ?? {}) as SiteSettings;
}

/**
 * Canonical origin of a site: its primary domain in production; in the studio its preview
 * address (SITE_PREVIEW_URL, e.g. http://{slug}.preview.localhost); else the web app URL.
 */
export async function siteBaseUrl(ctx: AppContext, tenant: { id: string; slug: string }): Promise<string> {
  if (ctx.env.NODE_ENV === 'production') {
    const { rows } = await ctx.control.query<{ domain: string }>('SELECT domain FROM tenant_domains WHERE tenant_id = $1 AND is_primary', [tenant.id]);
    if (rows[0]) return `https://${rows[0].domain}`;
  }
  if (ctx.env.SITE_PREVIEW_URL && !ctx.env.CELL_SLUG) return ctx.env.SITE_PREVIEW_URL.replace('{slug}', tenant.slug).replace(/\/$/, '');
  return ctx.env.WEB_APP_URL.replace(/\/$/, '');
}

/* ---------- access to one request or order without an account ---------- */

export type CaseKind = 'request' | 'order';
const ACCESS_DAYS = 60;

/**
 * A signed link token for one request or order ("s.<expiry>.<signature>"). Tracking by code and
 * contact details, and links in messages, hand these out; nothing is stored for them.
 */
export function issueAccess(ctx: AppContext, tenantId: string, kind: CaseKind, id: string, days = ACCESS_DAYS): string {
  const exp = Math.floor(Date.now() / 1000) + days * 86_400;
  return `s.${exp}.${hmac(ctx.env.TENANT_SECRETS_KEY, `case:${tenantId}:${kind}:${id}:${exp}`)}`;
}

/** Whether `token` opens this request / order: its own submission token, or a signed one. */
export function accessValid(ctx: AppContext, tenantId: string, kind: CaseKind, row: { id: string; public_token_hash: string | null }, token: string | undefined): boolean {
  if (!token) return false;
  if (token.startsWith('s.')) {
    const [, expRaw, sig] = token.split('.');
    const exp = Number(expRaw);
    if (!Number.isInteger(exp) || exp * 1000 < Date.now() || !sig) return false;
    return safeEqual(sig, hmac(ctx.env.TENANT_SECRETS_KEY, `case:${tenantId}:${kind}:${row.id}:${exp}`));
  }
  return !!row.public_token_hash && safeEqual(row.public_token_hash, sha256(token));
}

/** Link to a request's or order's page on the site, opening it without signing in. */
export async function caseLink(ctx: AppContext, tenant: { id: string; slug: string }, kind: CaseKind, id: string, code: string, locale: 'en' | 'fa') {
  const base = await siteBaseUrl(ctx, tenant);
  return `${base}${locale === 'fa' ? '/fa' : ''}/track/${code}?t=${encodeURIComponent(issueAccess(ctx, tenant.id, kind, id))}`;
}

/** Same rule as phone numbers typed in forms: Persian digits, +98 and separators. */
export const PHONE_SQL = (col: string) => `regexp_replace(regexp_replace(translate(${col}, '۰۱۲۳۴۵۶۷۸۹', '0123456789'), '[^0-9+]', '', 'g'), '^(\\+98|0098)', '0')`;
