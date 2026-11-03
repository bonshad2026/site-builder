import { normalizeIdentifier, type AccountsSettings } from '@site-builder/shared';
import type { Request, RequestHandler, Response } from 'express';
import type pg from 'pg';
import { randomDigits, randomToken, safeEqual, sha256 } from '../../common/crypto.js';
import { AppError, badRequest, conflict, forbidden, tooMany, unauthorized } from '../../common/errors.js';
import type { AppContext } from '../../context.js';
import type { CustomerSession } from '../../types.js';
import { hashPassword, verifyPassword } from '../auth/auth.service.js';
import { PHONE_SQL } from '../interactions/context.js';

const SESSION_DAYS = 30;
const CODE_TTL_MINUTES = 10;
const CODES_PER_WINDOW = 3;
const CODE_WINDOW_MINUTES = 10;
const CODE_MAX_ATTEMPTS = 5;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

/** Cookies are per site: several sites on one host (development) never share a customer session. */
export const customerCookie = (slug: string) => `sb_c_${slug}`;
export const customerCsrfCookie = (slug: string) => `sb_cc_${slug}`;
export const CUSTOMER_CSRF_HEADER = 'x-customer-csrf';

const COLUMNS = 'c.id, c.name, c.phone, c.email, c.password_hash IS NOT NULL AS has_password, c.kind, c.organization';

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  has_password: boolean;
  kind: string;
  organization: string;
}

export const publicCustomer = (c: { id: string; name: string; phone: string | null; email: string | null; hasPassword?: boolean; has_password?: boolean; kind?: string; organization?: string }) => ({
  id: c.id,
  name: c.name,
  phone: c.phone,
  email: c.email,
  hasPassword: c.hasPassword ?? c.has_password ?? false,
  kind: c.kind ?? '',
  organization: c.organization ?? '',
});

/** Loads the visitor's account session (if any) from this site's cookie. Never throws. */
export function loadCustomer(): RequestHandler {
  return async (req, _res, next) => {
    const tenant = req.tenant;
    const token = tenant ? (req.cookies?.[customerCookie(tenant.slug)] as string | undefined) : undefined;
    if (!tenant || !token) return next();
    const { rows } = await tenant.db.query<CustomerRow & { session_id: string; csrf_hash: string; last_seen_at: Date }>(
      `SELECT ${COLUMNS}, s.id AS session_id, s.csrf_hash, s.last_seen_at FROM customer_sessions s JOIN customers c ON c.id = s.customer_id
        WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND c.status = 'active'`,
      [sha256(token)],
    );
    const row = rows[0];
    if (row) {
      req.customer = { id: row.id, name: row.name, phone: row.phone, email: row.email, hasPassword: row.has_password, kind: row.kind, sessionId: row.session_id, csrfHash: row.csrf_hash };
      if (Date.now() - row.last_seen_at.getTime() > 5 * 60_000) await tenant.db.query('UPDATE customer_sessions SET last_seen_at = now() WHERE id = $1', [row.session_id]);
    }
    next();
  };
}

/** Double-submit check for the customer cookie: state-changing requests echo the CSRF cookie in a header. */
export function customerCsrfValid(req: Request): boolean {
  if (!req.customer) return false;
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  const header = req.get(CUSTOMER_CSRF_HEADER);
  return !!header && safeEqual(sha256(header), req.customer.csrfHash);
}

export const requireCustomer: RequestHandler = (req, _res, next) => {
  if (!req.customer) return next(unauthorized('Sign in to your account'));
  if (!customerCsrfValid(req)) return next(forbidden('Missing or invalid CSRF token'));
  next();
};

/** The signed-in customer, only when the request also passed the CSRF check (for optional sign-in on POSTs). */
export const verifiedCustomer = (req: Request): CustomerSession | null => (req.customer && customerCsrfValid(req) ? req.customer : null);

export function requireAccounts(settings: AccountsSettings) {
  if (!settings.enabled) throw new AppError(403, 'accounts_disabled', 'Accounts are not available on this site');
}

export function identifierOf(settings: AccountsSettings, raw: string): string {
  const id = normalizeIdentifier(raw, settings.identifier);
  if (!id) throw new AppError(400, 'validation_failed', 'Invalid request body', [{ path: 'identifier', message: 'invalid', code: 'invalid_string', validation: settings.identifier }]);
  return id;
}

const column = (settings: AccountsSettings) => (settings.identifier === 'phone' ? 'phone' : 'email');

async function findByIdentifier(db: pg.Pool, settings: AccountsSettings, identifier: string) {
  const { rows } = await db.query<CustomerRow & { password_hash: string | null; status: string; locked_until: Date | null }>(
    `SELECT ${COLUMNS}, c.password_hash, c.status, c.locked_until FROM customers c WHERE c.${column(settings)} = $1`,
    [identifier],
  );
  return rows[0] ?? null;
}

/* ---------- one-time codes ---------- */

/**
 * Sends a 6-digit code by SMS or email. At most a few per identifier in a window; only the hash
 * is stored. On development servers (console delivery) the code is returned so the operator can
 * test the flow in the studio.
 */
export async function sendCode(ctx: AppContext, db: pg.Pool, settings: AccountsSettings, siteName: string, rawIdentifier: string, purpose: 'signup' | 'login' | 'reset') {
  const identifier = identifierOf(settings, rawIdentifier);
  const existing = await findByIdentifier(db, settings, identifier);
  if (purpose === 'signup' && existing) throw conflict('An account with this phone or email already exists. Sign in instead.');
  if (purpose !== 'signup' && !existing) throw new AppError(404, 'account_not_found', 'No account was found with this phone or email');
  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM customer_codes WHERE identifier = $1 AND created_at > now() - make_interval(mins => $2)`,
    [identifier, CODE_WINDOW_MINUTES],
  );
  if (rows[0].n >= CODES_PER_WINDOW) throw tooMany('Too many codes requested. Try again in a few minutes.');
  const code = randomDigits(6);
  await db.query(`UPDATE customer_codes SET consumed_at = now() WHERE identifier = $1 AND purpose = $2 AND consumed_at IS NULL`, [identifier, purpose]);
  await db.query(
    `INSERT INTO customer_codes (identifier, purpose, code_hash, expires_at) VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
    [identifier, purpose, sha256(code), CODE_TTL_MINUTES],
  );
  let console = false;
  if (settings.identifier === 'phone') {
    await ctx.sms.sendOtp(identifier, code);
    console = ctx.sms.name === 'console';
  } else {
    await ctx.email.send({ to: identifier, subject: `${siteName} — ${code}`, text: `${siteName}\n\nYour code: ${code}\nکد شما: ${code}\n\n(${CODE_TTL_MINUTES} min)` });
    console = ctx.email.name === 'console';
  }
  return { sent: true, ...(console && ctx.env.NODE_ENV !== 'production' ? { devCode: code } : {}) };
}

async function consumeCode(db: pg.Pool, identifier: string, purpose: string, code: string) {
  const { rows } = await db.query<{ id: string; code_hash: string; attempts: number }>(
    `SELECT id, code_hash, attempts FROM customer_codes WHERE identifier = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1`,
    [identifier, purpose],
  );
  const row = rows[0];
  if (!row || row.attempts >= CODE_MAX_ATTEMPTS) throw new AppError(400, 'invalid_code', 'The code is wrong or has expired. Ask for a new one.');
  if (!safeEqual(row.code_hash, sha256(code))) {
    await db.query('UPDATE customer_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    throw new AppError(400, 'invalid_code', 'The code is wrong or has expired. Ask for a new one.');
  }
  await db.query('UPDATE customer_codes SET consumed_at = now() WHERE id = $1', [row.id]);
}

/* ---------- accounts ---------- */

export async function signup(db: pg.Pool, settings: AccountsSettings, input: { identifier: string; code: string; name: string; password?: string; kind?: string; organization?: string }) {
  const identifier = identifierOf(settings, input.identifier);
  if (input.password && !settings.passwords) throw badRequest('Passwords are not used on this site');
  // A site with kinds of account needs one of them; the organisation's name when that kind asks for it.
  const kind = settings.kinds.length ? settings.kinds.find((k) => k.key === input.kind) : undefined;
  if (settings.kinds.length && !kind) throw new AppError(400, 'validation_failed', 'Invalid request body', [{ path: 'kind', message: 'Choose a kind of account', code: 'too_small' }]);
  const organization = kind?.organization ? (input.organization ?? '').trim() : '';
  if (kind?.organization && organization.length < 2) throw new AppError(400, 'validation_failed', 'Invalid request body', [{ path: 'organization', message: 'Required', code: 'too_small' }]);
  await consumeCode(db, identifier, 'signup', input.code);
  const passwordHash = input.password ? await hashPassword(input.password) : null;
  try {
    const { rows } = await db.query<CustomerRow>(
      `INSERT INTO customers AS c (${column(settings)}, name, password_hash, kind, organization) VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
      [identifier, input.name, passwordHash, kind?.key ?? '', organization],
    );
    await linkCases(db, rows[0].id, settings, identifier);
    return rows[0];
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw conflict('An account with this phone or email already exists. Sign in instead.');
    throw err;
  }
}

export async function login(db: pg.Pool, settings: AccountsSettings, input: { identifier: string; password?: string; code?: string }) {
  const identifier = identifierOf(settings, input.identifier);
  const customer = await findByIdentifier(db, settings, identifier);
  if (input.code) {
    if (!customer) throw new AppError(400, 'invalid_code', 'The code is wrong or has expired. Ask for a new one.');
    await consumeCode(db, identifier, 'login', input.code);
  } else {
    if (!settings.passwords) throw badRequest('Sign in with a code');
    if (customer?.locked_until && customer.locked_until > new Date()) throw new AppError(429, 'account_locked', 'Too many failed attempts. Try again later or sign in with a code.');
    const ok = await verifyPassword(customer?.password_hash ?? null, input.password ?? '');
    if (!customer || !ok) {
      if (customer) {
        await db.query(
          `UPDATE customers SET failed_logins = failed_logins + 1,
             locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END WHERE id = $1`,
          [customer.id, MAX_FAILED_LOGINS, LOCKOUT_MINUTES],
        );
      }
      throw new AppError(401, 'invalid_credentials', 'Wrong phone/email or password');
    }
  }
  if (customer.status !== 'active') throw forbidden('This account is blocked. Contact the site.');
  await db.query('UPDATE customers SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [customer.id]);
  await linkCases(db, customer.id, settings, identifier);
  return customer;
}

export async function resetPassword(db: pg.Pool, settings: AccountsSettings, input: { identifier: string; code: string; password: string }) {
  const identifier = identifierOf(settings, input.identifier);
  const customer = await findByIdentifier(db, settings, identifier);
  if (!customer) throw new AppError(400, 'invalid_code', 'The code is wrong or has expired. Ask for a new one.');
  await consumeCode(db, identifier, 'reset', input.code);
  await db.query('UPDATE customers SET password_hash = $2, failed_logins = 0, locked_until = NULL, updated_at = now() WHERE id = $1', [customer.id, await hashPassword(input.password)]);
  await db.query('UPDATE customer_sessions SET revoked_at = now() WHERE customer_id = $1 AND revoked_at IS NULL', [customer.id]);
  return customer;
}

/**
 * Requests and orders sent before signing up, with the same (now verified) phone or email,
 * become the customer's.
 */
export async function linkCases(db: pg.Pool, customerId: string, settings: AccountsSettings, identifier: string) {
  if (settings.identifier === 'phone') {
    await db.query(`UPDATE leads SET customer_id = $1 WHERE customer_id IS NULL AND phone <> '' AND ${PHONE_SQL('phone')} = $2`, [customerId, identifier]);
    await db.query(`UPDATE orders SET customer_id = $1 WHERE customer_id IS NULL AND ${PHONE_SQL("coalesce(customer->>'phone', '')")} = $2`, [customerId, identifier]);
  } else {
    await db.query(`UPDATE leads SET customer_id = $1 WHERE customer_id IS NULL AND lower(email) = $2`, [customerId, identifier]);
    await db.query(`UPDATE orders SET customer_id = $1 WHERE customer_id IS NULL AND lower(customer->>'email') = $2`, [customerId, identifier]);
  }
}

/* ---------- sessions ---------- */

export async function startCustomerSession(ctx: AppContext, db: pg.Pool, slug: string, customerId: string, res: Response) {
  const token = randomToken();
  const csrf = randomToken();
  await db.query(
    `INSERT INTO customer_sessions (customer_id, token_hash, csrf_hash, expires_at) VALUES ($1, $2, $3, now() + make_interval(days => $4))`,
    [customerId, sha256(token), sha256(csrf), SESSION_DAYS],
  );
  const common = { secure: ctx.env.cookieSecure, sameSite: 'lax' as const, path: '/', maxAge: SESSION_DAYS * 86_400_000 };
  res.cookie(customerCookie(slug), token, { ...common, httpOnly: true });
  res.cookie(customerCsrfCookie(slug), csrf, { ...common, httpOnly: false });
}

export async function endCustomerSession(db: pg.Pool, slug: string, sessionId: string, res: Response) {
  await db.query('UPDATE customer_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [sessionId]);
  res.clearCookie(customerCookie(slug), { path: '/' });
  res.clearCookie(customerCsrfCookie(slug), { path: '/' });
}

export async function updateProfile(
  db: pg.Pool,
  settings: AccountsSettings,
  customer: CustomerSession,
  input: { name?: string; organization?: string; email?: string; phone?: string; password?: string; currentPassword?: string },
) {
  const sets: string[] = [];
  const values: unknown[] = [customer.id];
  const add = (col: string, v: unknown) => {
    values.push(v);
    sets.push(`${col} = $${values.length}`);
  };
  if (input.name) add('name', input.name);
  if (input.organization !== undefined) add('organization', input.organization);
  // The verified identifier cannot be changed here; the other contact detail can.
  if (input.email !== undefined && settings.identifier === 'phone') add('email', input.email ? normalizeIdentifier(input.email, 'email') : null);
  if (input.phone !== undefined && settings.identifier === 'email') add('phone', input.phone ? normalizeIdentifier(input.phone, 'phone') : null);
  if (input.password) {
    if (!settings.passwords) throw badRequest('Passwords are not used on this site');
    if (customer.hasPassword) {
      const { rows } = await db.query<{ password_hash: string }>('SELECT password_hash FROM customers WHERE id = $1', [customer.id]);
      if (!(await verifyPassword(rows[0]?.password_hash ?? null, input.currentPassword ?? ''))) throw new AppError(400, 'invalid_credentials', 'The current password is wrong');
    }
    add('password_hash', await hashPassword(input.password));
  }
  if (!sets.length) return;
  try {
    await db.query(`UPDATE customers SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, values);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw conflict('Another account uses this phone or email');
    throw err;
  }
}

export async function getCustomer(db: pg.Pool, id: string) {
  const { rows } = await db.query<CustomerRow>(`SELECT ${COLUMNS} FROM customers c WHERE c.id = $1`, [id]);
  return rows[0] ? publicCustomer(rows[0]) : null;
}
