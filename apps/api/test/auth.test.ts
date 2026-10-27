import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeContext } from '../src/context.js';
import { createUser } from '../src/modules/auth/auth.service.js';
import { PASSWORD, createTestServer, signIn, uid } from './helpers.js';

const { ctx, app, emails, sms } = createTestServer();
let email: string;

beforeAll(async () => {
  email = `user-${uid()}@test.local`;
  await createUser(ctx, { email, password: PASSWORD });
});
afterAll(() => closeContext(ctx));

const tokenFrom = (text: string) => /token=([\w-]+)/.exec(text)![1];

describe('password sign-in and sessions', () => {
  it('sets an HttpOnly, SameSite session cookie and returns a CSRF token', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const session = cookies.find((c) => c.startsWith('sb_session='))!;
    expect(session).toMatch(/HttpOnly/);
    expect(session).toMatch(/SameSite=Lax/);
    expect(res.body.data.csrfToken).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it('rejects a wrong password with a generic message', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'wrong-password-1' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password');
    const unknown = await request(app).post('/api/v1/auth/login').send({ email: 'nobody@test.local', password: 'wrong-password-1' });
    expect(unknown.body.error.message).toBe('Invalid email or password');
  });

  it('locks the account after repeated failures, even for the right password', async () => {
    const victim = `lock-${uid()}@test.local`;
    await createUser(ctx, { email: victim, password: PASSWORD });
    for (let i = 0; i < 5; i++) await request(app).post('/api/v1/auth/login').send({ email: victim, password: 'nope-nope-1' });
    const res = await request(app).post('/api/v1/auth/login').send({ email: victim, password: PASSWORD });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('account_locked');
  });

  it('requires the CSRF header for state-changing requests', async () => {
    const client = await signIn(app, email);
    const withoutHeader = await client.agent.post('/api/v1/auth/logout');
    expect(withoutHeader.status).toBe(403);
    const wrongHeader = await client.agent.post('/api/v1/auth/logout').set('X-CSRF-Token', 'forged');
    expect(wrongHeader.status).toBe(403);
    expect((await client.get('/api/v1/auth/me')).status).toBe(200);
  });

  it('logout revokes the session server-side', async () => {
    const client = await signIn(app, email);
    const cookie = (await client.get('/api/v1/auth/me')).request.cookies;
    expect((await client.post('/api/v1/auth/logout')).status).toBe(204);
    expect((await client.get('/api/v1/auth/me')).status).toBe(401);
    // Replaying the old cookie does not work either.
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('rejects expired sessions', async () => {
    const client = await signIn(app, email);
    await ctx.control.query(`UPDATE sessions SET expires_at = now() - interval '1 second' WHERE user_id = (SELECT id FROM users WHERE email = $1)`, [email]);
    expect((await client.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('does not allow public sign-up unless enabled', async () => {
    const res = await request(app).post('/api/v1/auth/signup').send({ email: `x-${uid()}@test.local`, password: 'longpassword1' });
    expect(res.status).toBe(403);
  });
});

describe('email verification and password reset', () => {
  it('verifies email with a single-use token', async () => {
    const client = await signIn(app, email);
    expect((await client.post('/api/v1/auth/email/verification')).status).toBe(202);
    const token = tokenFrom(emails.outbox.at(-1)!.text);
    expect((await request(app).post('/api/v1/auth/email/verify').send({ token })).status).toBe(200);
    expect((await request(app).post('/api/v1/auth/email/verify').send({ token })).status).toBe(400);
    expect((await client.get('/api/v1/auth/me')).body.data.user.emailVerified).toBe(true);
  });

  it('resets the password, signs out existing sessions, and the token works once', async () => {
    const target = `reset-${uid()}@test.local`;
    await createUser(ctx, { email: target, password: PASSWORD });
    const oldSession = await signIn(app, target);

    const forgot = await request(app).post('/api/v1/auth/password/forgot').send({ email: target });
    expect(forgot.status).toBe(202);
    const sameForUnknown = await request(app).post('/api/v1/auth/password/forgot').send({ email: 'ghost@test.local' });
    expect(sameForUnknown.status).toBe(202);

    const token = tokenFrom(emails.outbox.filter((m) => m.to === target).at(-1)!.text);
    expect((await request(app).post('/api/v1/auth/password/reset').send({ token, password: 'brand-new-pass-9' })).status).toBe(200);
    expect((await request(app).post('/api/v1/auth/password/reset').send({ token, password: 'another-pass-99' })).status).toBe(400);

    expect((await oldSession.get('/api/v1/auth/me')).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send({ email: target, password: PASSWORD })).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send({ email: target, password: 'brand-new-pass-9' })).status).toBe(200);
  });

  it('rejects weak passwords', async () => {
    const res = await request(app).post('/api/v1/auth/password/reset').send({ token: 'x'.repeat(30), password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
  });
});

describe('SMS one-time codes', () => {
  const newPhone = () => `+98912${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;

  it('signs in with a code; the code cannot be reused', async () => {
    const phone = newPhone();
    await createUser(ctx, { email: `otp-${uid()}@test.local`, phone });
    expect((await request(app).post('/api/v1/auth/otp/request').send({ phone })).status).toBe(202);
    const code = sms.outbox.filter((m) => m.phone === phone).at(-1)!.code;

    const login = await request(app).post('/api/v1/auth/otp/login').send({ phone, code });
    expect(login.status).toBe(200);
    expect(login.body.data.user.phoneVerified).toBe(true);
    expect((await request(app).post('/api/v1/auth/otp/login').send({ phone, code })).status).toBe(400);
  });

  it('does not reveal unregistered numbers and sends nothing to them', async () => {
    const phone = newPhone();
    const res = await request(app).post('/api/v1/auth/otp/request').send({ phone });
    expect(res.status).toBe(202);
    expect(sms.outbox.some((m) => m.phone === phone)).toBe(false);
  });

  it('expires codes', async () => {
    const phone = newPhone();
    await createUser(ctx, { email: `otp-${uid()}@test.local`, phone });
    await request(app).post('/api/v1/auth/otp/request').send({ phone });
    const code = sms.outbox.filter((m) => m.phone === phone).at(-1)!.code;
    await ctx.control.query(`UPDATE otp_codes SET expires_at = now() - interval '1 second' WHERE phone = $1`, [phone]);
    expect((await request(app).post('/api/v1/auth/otp/login').send({ phone, code })).status).toBe(400);
  });

  it('limits wrong attempts per code', async () => {
    const phone = newPhone();
    await createUser(ctx, { email: `otp-${uid()}@test.local`, phone });
    await request(app).post('/api/v1/auth/otp/request').send({ phone });
    const code = sms.outbox.filter((m) => m.phone === phone).at(-1)!.code;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await request(app).post('/api/v1/auth/otp/login').send({ phone, code: wrong });
    const res = await request(app).post('/api/v1/auth/otp/login').send({ phone, code });
    expect(res.status).toBe(429);
  });

  it('throttles repeated code requests', async () => {
    const phone = newPhone();
    await createUser(ctx, { email: `otp-${uid()}@test.local`, phone });
    expect((await request(app).post('/api/v1/auth/otp/request').send({ phone })).status).toBe(202);
    expect((await request(app).post('/api/v1/auth/otp/request').send({ phone })).status).toBe(429);
  });

  it('verifies a phone number for a signed-in user', async () => {
    const client = await signIn(app, email);
    const phone = newPhone();
    expect((await client.post('/api/v1/auth/phone/verification', { phone })).status).toBe(202);
    const code = sms.outbox.filter((m) => m.phone === phone).at(-1)!.code;
    expect((await client.post('/api/v1/auth/phone/verify', { phone, code })).status).toBe(200);
    const me = await client.get('/api/v1/auth/me');
    expect(me.body.data.user).toMatchObject({ phone, phoneVerified: true });
  });
});
