import type { Express } from 'express';
import request from 'supertest';
import { expect } from 'vitest';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/common/logger.js';
import { loadEnv } from '../src/config/env.js';
import { createContext, type AppContext } from '../src/context.js';
import { createUser, hashPassword } from '../src/modules/auth/auth.service.js';
import type { ConsoleEmailSender, ConsoleSmsSender } from '../src/modules/auth/notifications.js';
import { provisionTenant } from '../src/modules/platform/provisioning.js';

export const PASSWORD = 'correct-horse-42';

/** Unique per test file run, so slugs and emails never collide. */
export const uid = () => Math.random().toString(36).slice(2, 8);

export function createTestServer() {
  const env = loadEnv();
  const ctx = createContext(env, { log: createLogger('silent', false) });
  const app = createApp(ctx);
  return {
    ctx,
    app,
    emails: ctx.email as ConsoleEmailSender,
    sms: ctx.sms as ConsoleSmsSender,
  };
}

/** A cookie-keeping client that sends the CSRF header on every request. */
export interface Client {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
  get(url: string): request.Test;
  post(url: string, body?: object): request.Test;
  put(url: string, body?: object): request.Test;
  patch(url: string, body?: object): request.Test;
  delete(url: string): request.Test;
}

export async function signIn(app: Express, email: string, password = PASSWORD): Promise<Client> {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ email, password });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const csrf: string = res.body.data.csrfToken;
  return {
    agent,
    csrf,
    get: (url) => agent.get(url),
    post: (url, body) => agent.post(url).set('X-CSRF-Token', csrf).send(body ?? {}),
    put: (url, body) => agent.put(url).set('X-CSRF-Token', csrf).send(body ?? {}),
    patch: (url, body) => agent.patch(url).set('X-CSRF-Token', csrf).send(body ?? {}),
    delete: (url) => agent.delete(url).set('X-CSRF-Token', csrf),
  };
}

export async function createAdmin(ctx: AppContext) {
  return createUser(ctx, { email: `admin-${uid()}@test.local`, password: PASSWORD, isPlatformAdmin: true });
}

/** Provisions a real tenant database and gives its owner a known password. */
export async function createTenant(ctx: AppContext, adminId: string, opts: { modules?: Record<string, boolean> } = {}) {
  const slug = `site-${uid()}`;
  const ownerEmail = `owner-${slug}@test.local`;
  const tenant = await provisionTenant(ctx, { slug, name: `Site ${slug}`, ownerEmail, actorUserId: adminId });
  await ctx.control.query('UPDATE users SET password_hash = $2 WHERE email = $1', [ownerEmail, await hashPassword(PASSWORD)]);
  if (opts.modules) {
    const db = ctx.tenantPools.get({ id: tenant.id, dbName: tenant.db_name, dbUser: tenant.db_user, dbPasswordEnc: tenant.db_password_enc! });
    await db.query(`UPDATE site_settings SET settings = jsonb_set(settings, '{modules}', settings->'modules' || $1::jsonb)`, [JSON.stringify(opts.modules)]);
  }
  return { ...tenant, ownerEmail };
}

export const product = (slug: string, extra: Record<string, unknown> = {}) => ({
  slug,
  name: { en: `Product ${slug}`, fa: `محصول ${slug}` },
  description: { en: 'A fine piece', fa: 'قطعه‌ای خوب' },
  priceMinor: 1_000_000,
  stock: 5,
  status: 'published',
  ...extra,
});

export const lead = (extra: Record<string, unknown> = {}) => ({
  name: 'Sara Ahmadi',
  email: 'sara@example.com',
  phone: '۰۹۱۲۳۴۵۶۷۸۹',
  message: 'We would like help with a two-bedroom apartment.',
  consent: true,
  ...extra,
});
