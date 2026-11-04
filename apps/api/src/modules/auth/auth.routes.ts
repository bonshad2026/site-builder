import { emailSchema, passwordSchema, phoneSchema } from '@site-builder/shared';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { ApiRouter } from '../../common/http.js';
import { forbidden } from '../../common/errors.js';
import type { AppContext } from '../../context.js';
import { requireAuth, requireSession } from '../../middleware/auth.js';
import * as auth from './auth.service.js';

const tokenBody = z.object({ token: z.string().min(20).max(200) });
const otpCode = z.string().regex(/^\d{6}$/);

export function authRoutes(ctx: AppContext) {
  // Per-IP throttle on credential endpoints; per-account lockout and OTP limits live in the service.
  // In-memory store: use a shared store (e.g. Redis) when running several API instances.
  const limiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: ctx.env.NODE_ENV === 'test' ? 1000 : 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'rate_limited', message: 'Too many requests, try again later' } },
  });

  const r = new ApiRouter('/api/v1/auth', 'Auth', false);

  r.route({ method: 'get', path: '/me', summary: 'Current user and their sites', auth: true, middleware: [requireAuth] }, async ({ req }) => {
    const user = req.auth!.user;
    return { data: { user, sites: await auth.listMemberships(ctx, user.id) } };
  });

  r.route(
    {
      method: 'post',
      path: '/signup',
      summary: 'Create an account (only when ALLOW_PUBLIC_SIGNUP is on)',
      middleware: [limiter],
      status: 201,
      body: z.object({ email: emailSchema, password: passwordSchema, displayName: z.string().trim().max(80).default('') }),
    },
    async ({ req, res, body }) => {
      if (!ctx.env.ALLOW_PUBLIC_SIGNUP) throw forbidden('Accounts are created by an administrator');
      const user = await auth.createUser(ctx, body);
      await auth.sendEmailVerification(ctx, user);
      const csrfToken = await auth.startSession(ctx, user.id, req, res);
      return { data: { user, csrfToken } };
    },
  );

  r.route(
    {
      method: 'post',
      path: '/login',
      summary: 'Sign in with email (or username) and password',
      middleware: [limiter],
      // Accounts are found by their sign-in name: an email, or a plain username such as "admin".
      body: z.object({ email: z.string().trim().toLowerCase().min(1).max(254), password: z.string().min(1).max(200) }),
    },
    async ({ req, res, body }) => {
      const user = await auth.loginWithPassword(ctx, body.email, body.password, req.ip);
      const csrfToken = await auth.startSession(ctx, user.id, req, res);
      return { data: { user, csrfToken } };
    },
  );

  r.route({ method: 'post', path: '/logout', summary: 'Sign out and revoke this session', auth: true, middleware: [requireAuth] }, async ({ req, res }) => {
    await auth.endSession(ctx, req.auth!.sessionId, res);
  });

  r.route({ method: 'post', path: '/csrf', summary: 'Issue a fresh CSRF token for the current session', auth: true, middleware: [requireSession] }, async ({ req, res }) => {
    return { data: { csrfToken: await auth.rotateCsrf(ctx, req.auth!.sessionId, res) } };
  });

  r.route({ method: 'post', path: '/email/verification', summary: 'Send an email verification link', auth: true, middleware: [requireAuth, limiter], status: 202 }, async ({ req }) => {
    await auth.sendEmailVerification(ctx, req.auth!.user);
    return { data: { sent: true } };
  });

  r.route({ method: 'post', path: '/email/verify', summary: 'Confirm email with the emailed token', middleware: [limiter], body: tokenBody }, async ({ body }) => {
    await auth.confirmEmail(ctx, body.token);
    return { data: { verified: true } };
  });

  r.route(
    { method: 'post', path: '/password/forgot', summary: 'Email a password reset link (same response whether or not the account exists)', middleware: [limiter], status: 202, body: z.object({ email: emailSchema }) },
    async ({ body }) => {
      await auth.requestPasswordReset(ctx, body.email);
      return { data: { accepted: true } };
    },
  );

  r.route(
    { method: 'post', path: '/password/reset', summary: 'Set a new password; signs out every session', middleware: [limiter], body: tokenBody.extend({ password: passwordSchema }) },
    async ({ body }) => {
      await auth.resetPassword(ctx, body.token, body.password);
      return { data: { reset: true } };
    },
  );

  r.route(
    { method: 'post', path: '/otp/request', summary: 'Send a one-time sign-in code by SMS', middleware: [limiter], status: 202, body: z.object({ phone: phoneSchema }) },
    async ({ body }) => {
      await auth.requestOtp(ctx, body.phone, 'login');
      return { data: { accepted: true } };
    },
  );

  r.route(
    { method: 'post', path: '/otp/login', summary: 'Sign in with a one-time SMS code', middleware: [limiter], body: z.object({ phone: phoneSchema, code: otpCode }) },
    async ({ req, res, body }) => {
      const user = await auth.loginWithOtp(ctx, body.phone, body.code, req.ip);
      const csrfToken = await auth.startSession(ctx, user.id, req, res);
      return { data: { user, csrfToken } };
    },
  );

  r.route(
    { method: 'post', path: '/phone/verification', summary: 'Send a code to verify a phone number', auth: true, middleware: [requireAuth, limiter], status: 202, body: z.object({ phone: phoneSchema }) },
    async ({ req, body }) => {
      await auth.requestOtp(ctx, body.phone, 'verify_phone', req.auth!.user.id);
      return { data: { sent: true } };
    },
  );

  r.route(
    { method: 'post', path: '/phone/verify', summary: 'Confirm phone number with the SMS code', auth: true, middleware: [requireAuth, limiter], body: z.object({ phone: phoneSchema, code: otpCode }) },
    async ({ req, body }) => {
      await auth.confirmPhone(ctx, req.auth!.user.id, body.phone, body.code);
      return { data: { verified: true } };
    },
  );

  return r.router;
}
