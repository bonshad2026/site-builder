import { hash, verify } from '@node-rs/argon2';
import type { Request, Response } from 'express';
import { randomDigits, randomToken, sha256 } from '../../common/crypto.js';
import { AppError, badRequest, conflict, tooMany } from '../../common/errors.js';
import type { AppContext } from '../../context.js';
import { CSRF_COOKIE, SESSION_COOKIE, toSessionUser } from '../../middleware/auth.js';
import type { SessionUser } from '../../types.js';
import { auditPlatform } from '../audit/audit.js';

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const OTP_TTL_MINUTES = 5;
const OTP_MAX_PER_WINDOW = 3;
const OTP_WINDOW_MINUTES = 10;

// Verified against when the email is unknown, so response time does not reveal which accounts exist.
let dummyHash: Promise<string> | null = null;

const USER_COLUMNS = 'id, email, phone, display_name, is_platform_admin, email_verified_at, phone_verified_at';

export const hashPassword = (password: string) => hash(password, { algorithm: 2 });

async function verifyPassword(stored: string | null, password: string): Promise<boolean> {
  dummyHash ??= hashPassword(randomToken());
  try {
    return await verify(stored ?? (await dummyHash), password);
  } catch {
    return false;
  }
}

export async function createUser(
  ctx: AppContext,
  input: { email?: string | null; phone?: string | null; password?: string | null; displayName?: string; isPlatformAdmin?: boolean },
): Promise<SessionUser> {
  const passwordHash = input.password ? await hashPassword(input.password) : null;
  try {
    const { rows } = await ctx.control.query(
      `INSERT INTO users (email, phone, password_hash, display_name, is_platform_admin)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${USER_COLUMNS}`,
      [input.email ?? null, input.phone ?? null, passwordHash, input.displayName ?? '', input.isPlatformAdmin ?? false],
    );
    return toSessionUser(rows[0]);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw conflict('An account with this email or phone already exists');
    throw err;
  }
}

/* ---------- sessions ---------- */

export async function startSession(ctx: AppContext, userId: string, req: Request, res: Response): Promise<string> {
  const token = randomToken();
  const csrfToken = randomToken();
  const ttlMs = ctx.env.SESSION_TTL_HOURS * 3_600_000;
  await ctx.control.query(
    `INSERT INTO sessions (user_id, token_hash, csrf_hash, ip, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + make_interval(secs => $6))`,
    [userId, sha256(token), sha256(csrfToken), req.ip ?? null, req.get('user-agent')?.slice(0, 300) ?? null, ttlMs / 1000],
  );
  const common = { secure: ctx.env.cookieSecure, sameSite: 'lax' as const, path: '/', maxAge: ttlMs };
  res.cookie(SESSION_COOKIE, token, { ...common, httpOnly: true });
  // Readable by the web app so it can echo it in the X-CSRF-Token header.
  res.cookie(CSRF_COOKIE, csrfToken, { ...common, httpOnly: false });
  return csrfToken;
}

export async function rotateCsrf(ctx: AppContext, sessionId: string, res: Response): Promise<string> {
  const csrfToken = randomToken();
  await ctx.control.query('UPDATE sessions SET csrf_hash = $1 WHERE id = $2', [sha256(csrfToken), sessionId]);
  res.cookie(CSRF_COOKIE, csrfToken, { secure: ctx.env.cookieSecure, sameSite: 'lax', path: '/', httpOnly: false, maxAge: ctx.env.SESSION_TTL_HOURS * 3_600_000 });
  return csrfToken;
}

export async function endSession(ctx: AppContext, sessionId: string, res: Response) {
  await ctx.control.query('UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [sessionId]);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
}

export async function revokeAllSessions(ctx: AppContext, userId: string) {
  await ctx.control.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
}

/* ---------- password login ---------- */

export async function loginWithPassword(ctx: AppContext, email: string, password: string, ip?: string): Promise<SessionUser> {
  const { rows } = await ctx.control.query(
    `SELECT ${USER_COLUMNS}, password_hash, status, failed_login_count, locked_until FROM users WHERE email = $1`,
    [email],
  );
  const user = rows[0];
  const valid = await verifyPassword(user?.password_hash ?? null, password);

  if (user?.locked_until && user.locked_until > new Date()) {
    throw new AppError(429, 'account_locked', 'Too many failed attempts. Try again later or reset your password.');
  }
  if (!user || !valid || user.status !== 'active') {
    if (user) {
      await ctx.control.query(
        `UPDATE users SET failed_login_count = failed_login_count + 1,
           locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
         WHERE id = $1`,
        [user.id, MAX_FAILED_LOGINS, LOCKOUT_MINUTES],
      );
      await auditPlatform(ctx.control, { actorUserId: user.id, action: 'auth.login_failed', ip });
    }
    throw new AppError(401, 'invalid_credentials', 'Invalid email or password');
  }

  await ctx.control.query('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = $1', [user.id]);
  await auditPlatform(ctx.control, { actorUserId: user.id, action: 'auth.login', metadata: { method: 'password' }, ip });
  return toSessionUser(user);
}

/* ---------- email verification & password reset ---------- */

async function issueToken(ctx: AppContext, userId: string, purpose: 'email_verify' | 'password_reset', ttlMinutes: number) {
  const token = randomToken();
  // Only one live token per purpose: older ones stop working.
  await ctx.control.query('UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL', [userId, purpose]);
  await ctx.control.query(
    `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
    [userId, purpose, sha256(token), ttlMinutes],
  );
  return token;
}

async function consumeToken(ctx: AppContext, token: string, purpose: 'email_verify' | 'password_reset'): Promise<string> {
  const { rows } = await ctx.control.query<{ user_id: string }>(
    `UPDATE auth_tokens SET used_at = now()
      WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
      RETURNING user_id`,
    [sha256(token), purpose],
  );
  if (!rows[0]) throw badRequest('This link is invalid or has expired');
  return rows[0].user_id;
}

export async function sendEmailVerification(ctx: AppContext, user: SessionUser) {
  if (!user.email) throw badRequest('Account has no email address');
  if (user.emailVerified) return;
  const token = await issueToken(ctx, user.id, 'email_verify', 24 * 60);
  await ctx.email.send({
    to: user.email,
    subject: 'Confirm your email address',
    text: `Confirm your email address:\n${ctx.env.WEB_APP_URL}/verify-email?token=${token}\n\nThis link expires in 24 hours.`,
  });
}

export async function confirmEmail(ctx: AppContext, token: string) {
  const userId = await consumeToken(ctx, token, 'email_verify');
  await ctx.control.query('UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $1', [userId]);
}

export async function requestPasswordReset(ctx: AppContext, email: string) {
  const { rows } = await ctx.control.query<{ id: string }>(`SELECT id FROM users WHERE email = $1 AND status = 'active'`, [email]);
  if (!rows[0]) return; // Same response either way: no account enumeration.
  const token = await issueToken(ctx, rows[0].id, 'password_reset', 60);
  await ctx.email.send({
    to: email,
    subject: 'Reset your password',
    text: `Reset your password:\n${ctx.env.WEB_APP_URL}/reset-password?token=${token}\n\nThis link expires in 1 hour. If you did not ask for this, ignore this email.`,
  });
}

export async function resetPassword(ctx: AppContext, token: string, password: string) {
  const userId = await consumeToken(ctx, token, 'password_reset');
  await ctx.control.query(
    'UPDATE users SET password_hash = $2, failed_login_count = 0, locked_until = NULL, updated_at = now() WHERE id = $1',
    [userId, await hashPassword(password)],
  );
  await revokeAllSessions(ctx, userId);
  await auditPlatform(ctx.control, { actorUserId: userId, action: 'auth.password_reset' });
}

/* ---------- SMS one-time codes ---------- */

const otpHash = (phone: string, code: string) => sha256(`${phone}:${code}`);

export async function requestOtp(ctx: AppContext, phone: string, purpose: 'login' | 'verify_phone', userId?: string) {
  const { rows } = await ctx.control.query<{ recent: number; last: Date | null }>(
    `SELECT count(*)::int AS recent, max(created_at) AS last FROM otp_codes
      WHERE phone = $1 AND created_at > now() - make_interval(mins => $2)`,
    [phone, OTP_WINDOW_MINUTES],
  );
  const { recent, last } = rows[0];
  if (recent >= OTP_MAX_PER_WINDOW || (last && Date.now() - last.getTime() < 60_000)) throw tooMany('Please wait before requesting another code');

  if (purpose === 'login') {
    const exists = await ctx.control.query(`SELECT 1 FROM users WHERE phone = $1 AND status = 'active'`, [phone]);
    if (!exists.rowCount) return; // Do not reveal whether the number is registered.
  }

  const code = randomDigits(6);
  const { rows: inserted } = await ctx.control.query<{ id: string }>(
    `INSERT INTO otp_codes (phone, purpose, user_id, code_hash, expires_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(mins => $5)) RETURNING id`,
    [phone, purpose, userId ?? null, otpHash(phone, code), OTP_TTL_MINUTES],
  );
  try {
    await ctx.sms.sendOtp(phone, code);
  } catch (err) {
    await ctx.control.query('DELETE FROM otp_codes WHERE id = $1', [inserted[0].id]);
    ctx.log.error({ err }, 'sms delivery failed');
    throw new AppError(502, 'sms_failed', 'Could not send the code. Please try again.');
  }
}

/** Checks a code: short-lived, limited attempts, single use. Returns the code's user id (if bound). */
async function consumeOtp(ctx: AppContext, phone: string, purpose: 'login' | 'verify_phone', code: string, userId?: string) {
  const { rows } = await ctx.control.query<{ id: string; code_hash: string; attempts: number; max_attempts: number; user_id: string | null }>(
    `SELECT id, code_hash, attempts, max_attempts, user_id FROM otp_codes
      WHERE phone = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now()
        AND ($3::uuid IS NULL OR user_id = $3)
      ORDER BY created_at DESC LIMIT 1`,
    [phone, purpose, userId ?? null],
  );
  const otp = rows[0];
  if (!otp) throw badRequest('The code is invalid or has expired');
  if (otp.attempts >= otp.max_attempts) throw tooMany('Too many wrong codes. Request a new one.');

  await ctx.control.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [otp.id]);
  if (otp.code_hash !== otpHash(phone, code)) throw badRequest('The code is invalid or has expired');

  const consumed = await ctx.control.query('UPDATE otp_codes SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL', [otp.id]);
  if (!consumed.rowCount) throw badRequest('The code is invalid or has expired');
}

export async function loginWithOtp(ctx: AppContext, phone: string, code: string, ip?: string): Promise<SessionUser> {
  await consumeOtp(ctx, phone, 'login', code);
  const { rows } = await ctx.control.query(
    `UPDATE users SET phone_verified_at = COALESCE(phone_verified_at, now()) WHERE phone = $1 AND status = 'active' RETURNING ${USER_COLUMNS}`,
    [phone],
  );
  if (!rows[0]) throw badRequest('The code is invalid or has expired');
  await auditPlatform(ctx.control, { actorUserId: rows[0].id, action: 'auth.login', metadata: { method: 'otp' }, ip });
  return toSessionUser(rows[0]);
}

export async function confirmPhone(ctx: AppContext, userId: string, phone: string, code: string) {
  await consumeOtp(ctx, phone, 'verify_phone', code, userId);
  try {
    await ctx.control.query('UPDATE users SET phone = $2, phone_verified_at = now(), updated_at = now() WHERE id = $1', [userId, phone]);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw conflict('This phone number belongs to another account');
    throw err;
  }
}

export async function listMemberships(ctx: AppContext, userId: string) {
  const { rows } = await ctx.control.query(
    `SELECT t.slug AS "siteId", t.name, t.status, m.role, m.permissions
       FROM memberships m JOIN tenants t ON t.id = m.tenant_id
      WHERE m.user_id = $1 ORDER BY t.name`,
    [userId],
  );
  return rows;
}
