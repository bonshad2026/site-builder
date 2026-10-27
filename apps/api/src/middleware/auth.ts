import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { safeEqual, sha256 } from '../common/crypto.js';
import { forbidden, unauthorized } from '../common/errors.js';
import type { AppContext } from '../context.js';
import type { SessionUser } from '../types.js';

export const SESSION_COOKIE = 'sb_session';
export const CSRF_COOKIE = 'sb_csrf';
export const CSRF_HEADER = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

interface SessionRow {
  session_id: string;
  csrf_hash: string;
  last_seen_at: Date;
  id: string;
  email: string | null;
  phone: string | null;
  display_name: string;
  is_platform_admin: boolean;
  email_verified_at: Date | null;
  phone_verified_at: Date | null;
}

export function toSessionUser(row: Omit<SessionRow, 'session_id' | 'csrf_hash' | 'last_seen_at'>): SessionUser {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    displayName: row.display_name,
    isPlatformAdmin: row.is_platform_admin,
    emailVerified: !!row.email_verified_at,
    phoneVerified: !!row.phone_verified_at,
  };
}

/** Loads the session (if any) from the HttpOnly cookie. Never throws for anonymous requests. */
export function loadSession(ctx: AppContext): RequestHandler {
  return async (req, _res, next) => {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (!token) return next();
    const { rows } = await ctx.control.query<SessionRow>(
      `SELECT s.id AS session_id, s.csrf_hash, s.last_seen_at,
              u.id, u.email, u.phone, u.display_name, u.is_platform_admin, u.email_verified_at, u.phone_verified_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status = 'active'`,
      [sha256(token)],
    );
    const row = rows[0];
    if (row) {
      req.auth = { user: toSessionUser(row), sessionId: row.session_id, csrfHash: row.csrf_hash };
      if (Date.now() - row.last_seen_at.getTime() > 5 * 60_000) {
        await ctx.control.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [row.session_id]);
      }
    }
    next();
  };
}

/**
 * Double-submit CSRF check for cookie-authenticated, state-changing requests.
 * The token is bound to the session (only its hash is stored server-side).
 * Applied only to authenticated routes, so anonymous public forms are unaffected.
 */
function csrfValid(req: Request): boolean {
  if (SAFE_METHODS.has(req.method)) return true;
  const header = req.get(CSRF_HEADER);
  return !!header && !!req.auth && safeEqual(sha256(header), req.auth.csrfHash);
}

/** Signed in, without the CSRF check (only for issuing a fresh CSRF token). */
export const requireSession: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthorized());
  next();
};

export const requireAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.auth) return next(unauthorized());
  if (!csrfValid(req)) return next(forbidden('Missing or invalid CSRF token'));
  next();
};

export const requirePlatformAdmin: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthorized());
  if (!csrfValid(req)) return next(forbidden('Missing or invalid CSRF token'));
  if (!req.auth.user.isPlatformAdmin) return next(forbidden());
  next();
};
