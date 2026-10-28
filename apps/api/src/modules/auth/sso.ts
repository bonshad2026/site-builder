import type { Request, Response } from 'express';
import { hmac, safeEqual } from '../../common/crypto.js';
import type { AppContext } from '../../context.js';
import { startSession } from './auth.service.js';

/** Seen token signatures; one-time use within their (short) lifetime. */
const used = new Map<string, number>();

/**
 * Cell mode: the control panel signs `{ email, exp }` with CELL_SSO_SECRET and sends the
 * operator's browser here. A valid, unexpired, unused link for a platform admin of this
 * cell starts a normal session and opens the admin.
 */
export async function ssoLogin(ctx: AppContext, req: Request, res: Response) {
  const secret = ctx.env.CELL_SSO_SECRET;
  const [payload, sig] = String(req.query.token ?? '').split('.');
  const now = Date.now();
  for (const [k, exp] of used) if (exp < now) used.delete(k);

  let email: string | undefined;
  if (secret && payload && sig && safeEqual(hmac(secret, payload), sig) && !used.has(sig)) {
    try {
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { email?: string; exp?: number };
      if (typeof claims.email === 'string' && typeof claims.exp === 'number' && claims.exp > now && claims.exp < now + 5 * 60_000) {
        email = claims.email;
        used.set(sig, claims.exp);
      }
    } catch {
      // malformed payload: falls through to 403
    }
  }
  if (!email) return res.status(403).json({ error: { code: 'forbidden', message: 'Sign-in link is invalid or has expired' } });

  const { rows } = await ctx.control.query<{ id: string }>(`SELECT id FROM users WHERE email = $1 AND is_platform_admin AND status = 'active'`, [email]);
  if (!rows[0]) return res.status(403).json({ error: { code: 'forbidden', message: 'No operator account in this site' } });
  await startSession(ctx, rows[0].id, req, res);
  res.redirect(303, `${ctx.env.WEB_APP_URL}/admin${ctx.env.CELL_SLUG ? `/sites/${ctx.env.CELL_SLUG}` : ''}`);
}
