import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeContext } from '../src/context.js';
import { createAdmin, createTenant, createTestServer, signIn, type Client } from './helpers.js';

const { ctx } = createTestServer();
// A stand-in for GapGPT that records what it was asked.
let sent: { url: string; auth: string; body: { model: string; messages: { role: string; content: string }[] } } | null = null;
ctx.httpFetch = (async (url: string | URL, init?: RequestInit) => {
  sent = { url: String(url), auth: String((init?.headers as Record<string, string>).authorization), body: JSON.parse(String(init?.body)) };
  return new Response(JSON.stringify({ choices: [{ message: { content: 'Courses start every month.' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;
const app = createApp({ ...ctx, env: { ...ctx.env, GAPGPT_API_KEY: 'test-key' } });
const appWithoutKey = createApp(ctx);

let owner: Client, base: string, pub: string, settings: any;
beforeAll(async () => {
  const admin = await createAdmin(ctx);
  const tenant = await createTenant(ctx, admin.id);
  owner = await signIn(app, admin.email);
  base = `/api/v1/sites/${tenant.slug}`;
  pub = `/api/v1/public/sites/${tenant.slug}`;
  settings = (await owner.get(`${base}/settings`)).body.data;
});
afterAll(() => closeContext(ctx));

const ask = (target = app, content = 'When do courses start?') => request(target).post(`${pub}/assistant`).send({ locale: 'en', messages: [{ role: 'user', content }] });

describe('site assistant', () => {
  it('is off until the operator turns it on', async () => {
    expect((await ask()).status).toBe(404);
  });

  it('answers with the operator notes in the instructions, and keeps them out of the public settings', async () => {
    const assistant = { ...settings.assistant, enabled: true, name: { en: 'Ember', fa: 'اخگر' }, knowledge: 'Courses start on the first Saturday of each month.', model: 'gpt-4o-mini' };
    expect((await owner.put(`${base}/settings`, { ...settings, assistant })).status).toBe(200);
    const res = await ask();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.answer).toBe('Courses start every month.');
    expect(sent!.url).toBe('https://api.gapgpt.app/v1/chat/completions');
    expect(sent!.auth).toBe('Bearer test-key');
    expect(sent!.body.model).toBe('gpt-4o-mini');
    expect(sent!.body.messages[0].role).toBe('system');
    expect(sent!.body.messages[0].content).toContain('Ember');
    expect(sent!.body.messages[0].content).toContain('first Saturday');
    expect(sent!.body.messages.at(-1)).toEqual({ role: 'user', content: 'When do courses start?' });

    const pubSettings = (await request(app).get(`${pub}/settings`)).body.data;
    expect(pubSettings.assistant.enabled).toBe(true);
    expect(pubSettings.assistant.knowledge).toBeUndefined();
    expect(pubSettings.assistant.model).toBeUndefined();
  });

  it('says it is unavailable without a server key, and rejects bad conversations', async () => {
    expect((await ask(appWithoutKey)).status).toBe(503);
    expect((await request(app).post(`${pub}/assistant`).send({ messages: [{ role: 'assistant', content: 'hi' }] })).status).toBe(400);
    expect((await request(app).post(`${pub}/assistant`).send({ messages: [] })).status).toBe(400);
  });
});
