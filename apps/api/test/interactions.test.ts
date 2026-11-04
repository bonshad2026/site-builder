import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeContext } from '../src/context.js';
import { createAdmin, createTenant, createTestServer, lead, signIn, type Client } from './helpers.js';

const { ctx, app, sms } = createTestServer();
let owner: Client;
let base: string;
let pub: string;

/** A request type with its own questions, a condition, a paid stage and the "quote" workflow. */
const quoteType = {
  slug: 'renovation',
  label: { en: 'Renovation', fa: 'بازسازی' },
  form: 'contact',
  contact: { email: 'optional', phone: 'required' },
  fields: [
    { id: 'rooms', type: 'select', label: { en: 'Rooms', fa: 'اتاق' }, required: true, options: [{ en: 'One', fa: 'یک' }, { en: 'Two', fa: 'دو' }] },
    { id: 'kitchen', type: 'checkbox', label: { en: 'Kitchen too', fa: 'آشپزخانه هم' } },
    { id: 'kitchen-size', type: 'number', label: { en: 'Kitchen m²', fa: 'متراژ آشپزخانه' }, required: true, showIf: { field: 'kitchen', value: '✓' } },
  ],
  workflow: {
    stages: [
      { key: 'new', label: { en: 'New', fa: 'جدید' }, next: ['quoted', 'cancelled'], customerCanCancel: true },
      { key: 'quoted', label: { en: 'Quoted', fa: 'پیش‌فاکتور' }, next: ['working', 'cancelled'], askPayment: true, notify: true },
      { key: 'working', label: { en: 'Working', fa: 'در حال انجام' }, next: ['done'] },
      { key: 'secret', label: { en: 'Internal', fa: 'داخلی' }, visible: false, next: ['done'] },
      { key: 'done', label: { en: 'Done', fa: 'انجام شد' }, kind: 'done', next: [] },
      { key: 'cancelled', label: { en: 'Cancelled', fa: 'لغو' }, kind: 'cancelled', next: [] },
    ],
    paidStage: 'working',
  },
};

beforeAll(async () => {
  const admin = await createAdmin(ctx);
  const site = await createTenant(ctx, admin.id, { modules: { leads: true } });
  owner = await signIn(app, site.ownerEmail);
  base = `/api/v1/sites/${site.slug}`;
  pub = `/api/v1/public/sites/${site.slug}`;
  const settings = (await owner.get(`${base}/settings`)).body.data;
  const saved = await owner.put(`${base}/settings`, {
    ...settings,
    requestTypes: [...settings.requestTypes, quoteType],
    accounts: { enabled: true, identifier: 'phone', passwords: true },
    notifications: { staff: false, emails: [] },
  });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  await owner.put(`${base}/payment-settings/gateways/sandbox`, { enabled: true });
});
afterAll(() => closeContext(ctx));

const send = (body: Record<string, unknown>) => request(app).post(`${pub}/leads`).send(lead({ type: 'renovation', message: '', ...body }));

describe('request forms', () => {
  it('keeps workflows and staff addresses out of the public settings', async () => {
    const res = await request(app).get(`${pub}/settings`);
    const type = res.body.data.requestTypes.find((t: { slug: string }) => t.slug === 'renovation');
    // Converted: name, phone, email and consent are fields around the three own questions.
    expect(type.fields.map((f: { id: string }) => f.id)).toEqual(['name', 'phone', 'email', 'rooms', 'kitchen', 'kitchen-size', 'consent']);
    expect(type.workflow).toBeUndefined();
    expect(res.body.data.notifications).toBeUndefined();
  });

  it('checks answers on the server, including conditional questions', async () => {
    const missing = await send({ answers: { kitchen: true } });
    expect(missing.status).toBe(400);
    const paths = missing.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['answers.rooms', 'answers.kitchen-size']));
    expect((await send({ answers: { rooms: 'Three' } })).status).toBe(400);
    expect((await send({ phone: '', answers: { rooms: 'دو' } })).status).toBe(400);
    // The hidden question is not required when its condition is not met.
    const ok = await send({ answers: { rooms: 'دو' } });
    expect(ok.status).toBe(201);
    expect(ok.body.data.code).toMatch(/^R\d+$/);
    expect(ok.body.data.token).toBeTruthy();
  });
});

describe('workflow, timeline and tracking', () => {
  let id: string;
  let number: string;
  let token: string;

  beforeAll(async () => {
    const res = await send({ answers: { rooms: 'One', kitchen: true, 'kitchen-size': '۱۲' } });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    ({ id, number, token } = res.body.data);
  });

  it('starts in the first stage and shows labelled answers to the staff', async () => {
    const res = await owner.get(`${base}/leads/${id}`);
    expect(res.body.data.stage).toBe('new');
    expect(res.body.data.next).toEqual(['quoted', 'cancelled']);
    expect(res.body.data.details.answers.map((a: { value: string }) => a.value)).toEqual(['Sara Ahmadi', '09123456789', 'sara@example.com', 'One', '✓', '12', '✓']);
    expect(res.body.data.events[0].kind).toBe('created');
  });

  it('only allows moves the workflow defines, and asks for an amount where it should', async () => {
    expect((await owner.post(`${base}/leads/${id}/stage`, { stage: 'done' })).status).toBe(400);
    expect((await owner.post(`${base}/leads/${id}/stage`, { stage: 'quoted' })).status).toBe(400);
    const moved = await owner.post(`${base}/leads/${id}/stage`, { stage: 'quoted', payment: { amountMinor: 5_000_000, title: 'Deposit' }, message: 'Here is your quote.' });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(moved.body.data.paymentStatus).toBe('due');
    // The stage notifies: the customer got an SMS with a link to the request.
    expect(sms.texts.at(-1)?.text).toMatch(new RegExp(`R${number}`));
    expect(sms.texts.at(-1)?.text).toMatch(/\/track\/R\d+\?t=s\./);
  });

  it('keeps internal notes away from the customer', async () => {
    await owner.post(`${base}/leads/${id}/events`, { kind: 'note', text: 'Customer seems in a hurry' });
    await owner.post(`${base}/leads/${id}/events`, { kind: 'message', text: 'We can start Monday' });
    const view = await request(app).get(`${pub}/requests/${number}?token=${token}`);
    expect(view.status).toBe(200);
    const bodies = view.body.data.events.map((e: { body: string }) => e.body);
    expect(bodies).toContain('We can start Monday');
    expect(bodies).not.toContain('Customer seems in a hurry');
    expect(view.body.data.canPay).toBe(true);
    expect((await request(app).get(`${pub}/requests/${number}?token=nope-nope-nope`)).status).toBe(404);
  });

  it('finds a request by code and phone, and lets the customer reply', async () => {
    expect((await request(app).post(`${pub}/track`).send({ code: `R${number}`, contact: '09000000000' })).status).toBe(404);
    const found = await request(app).post(`${pub}/track`).send({ code: `r-${number}`, contact: '+98 912 345 6789' });
    expect(found.status).toBe(200);
    const signed = found.body.data.token;
    expect((await request(app).post(`${pub}/requests/${number}/messages`).send({ token: signed, text: 'Monday is fine' })).status).toBe(201);
    const staff = await owner.get(`${base}/leads?unread=true`);
    expect(staff.body.data.some((r: { id: string }) => r.id === id)).toBe(true);
  });

  it('a sandbox payment settles the amount and moves to the "after payment" stage', async () => {
    const start = await request(app).post(`${pub}/requests/${number}/pay`).send({ token, locale: 'en' });
    expect(start.status, JSON.stringify(start.body)).toBe(200);
    const page = new URL(start.body.data.redirectUrl).pathname;
    const approve = await request(app).post(page).type('form').send({ decision: 'approved' });
    const callback = new URL(approve.headers.location, 'http://api.test');
    const back = await request(app).get(callback.pathname + callback.search);
    expect(back.headers.location).toMatch(/payment=success/);
    const res = await owner.get(`${base}/leads/${id}`);
    expect(res.body.data.paymentStatus).toBe('test_paid');
    expect(res.body.data.amountDueMinor).toBe('0');
    expect(res.body.data.paidMinor).toBe('5000000');
    expect(res.body.data.stage).toBe('working');
  });

  it('finishing the request shows it as done to the customer', async () => {
    await owner.post(`${base}/leads/${id}/stage`, { stage: 'done' });
    const view = await request(app).get(`${pub}/requests/${number}?token=${token}`);
    expect(view.body.data.stage.kind).toBe('done');
    expect(view.body.data.canReply).toBe(true);
  });
});

describe('customer accounts', () => {
  const phone = '09351112233';
  let agent: ReturnType<typeof request.agent>;
  let csrf: string;

  it('signs up with an SMS code and sees requests sent earlier with the same phone', async () => {
    const before = await send({ phone, answers: { rooms: 'One' } });
    expect(before.status).toBe(201);
    agent = request.agent(app);
    const code = await agent.post(`${pub}/customer/code`).send({ identifier: '۰۹۳۵ ۱۱۱ ۲۲۳۳', purpose: 'signup' });
    expect(code.status, JSON.stringify(code.body)).toBe(200);
    const sent = sms.outbox.at(-1)!;
    expect(sent.phone).toBe(phone);
    expect((await agent.post(`${pub}/customer/signup`).send({ identifier: phone, code: '000000', name: 'Mina' })).status).toBe(400);
    const signup = await agent.post(`${pub}/customer/signup`).send({ identifier: phone, code: sent.code, name: 'Mina', password: 'mina-secret-1' });
    expect(signup.status, JSON.stringify(signup.body)).toBe(201);
    csrf = /sb_cc_[^=]+=([^;]+)/.exec(String(signup.headers['set-cookie']))![1];
    const cases = await agent.get(`${pub}/customer/cases`);
    expect(cases.body.data.requests.map((r: { code: string }) => r.code)).toContain(before.body.data.code);
  });

  it('links new requests to the account and refuses writes without the CSRF header', async () => {
    const noCsrf = await agent.post(`${pub}/leads`).send(lead({ type: 'renovation', phone: '', answers: { rooms: 'Two' } }));
    // Without the header the session is not used, so the required phone is missing.
    expect(noCsrf.status).toBe(400);
    const withCsrf = await agent.post(`${pub}/leads`).set('X-Customer-CSRF', decodeURIComponent(csrf)).send(lead({ type: 'renovation', phone: '', answers: { rooms: 'Two' } }));
    expect(withCsrf.status, JSON.stringify(withCsrf.body)).toBe(201);
    // Their own request opens without a token.
    expect((await agent.get(`${pub}/requests/${withCsrf.body.data.number}`)).status).toBe(200);
    expect((await request(app).get(`${pub}/requests/${withCsrf.body.data.number}`)).status).toBe(404);
  });

  it('the customer can cancel where the stage allows it', async () => {
    const res = await agent.post(`${pub}/leads`).set('X-Customer-CSRF', decodeURIComponent(csrf)).send(lead({ type: 'renovation', phone: '', answers: { rooms: 'Two' } }));
    const n = res.body.data.number;
    expect((await agent.post(`${pub}/requests/${n}/cancel`).set('X-Customer-CSRF', decodeURIComponent(csrf)).send({})).status).toBe(200);
    expect((await agent.get(`${pub}/requests/${n}`)).body.data.stage.kind).toBe('cancelled');
    expect((await agent.post(`${pub}/requests/${n}/cancel`).set('X-Customer-CSRF', decodeURIComponent(csrf)).send({})).status).toBe(400);
  });

  it('signs in with password or code; the staff see the account and can block it', async () => {
    const fresh = request.agent(app);
    expect((await fresh.post(`${pub}/customer/login`).send({ identifier: phone, password: 'wrong-password' })).status).toBe(401);
    expect((await fresh.post(`${pub}/customer/login`).send({ identifier: phone, password: 'mina-secret-1' })).status).toBe(200);
    const list = await owner.get(`${base}/customers?q=Mina`);
    expect(list.body.data[0].requests).toBeGreaterThanOrEqual(3);
    await owner.patch(`${base}/customers/${list.body.data[0].id}`, { status: 'blocked' });
    expect((await fresh.get(`${pub}/customer/me`)).body.data).toBeNull();
  });
});

describe('fully editable forms', () => {
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBApbb2SIAAAAASUVORK5CYII=', 'base64');
  const payType = {
    slug: 'workshop',
    label: { en: 'Workshop', fa: 'کارگاه' },
    form: 'contact',
    formVersion: 2,
    payment: { onSubmit: true, amountMinor: 100_000, currency: 'IRR' },
    fields: [
      { id: 'who', type: 'text', role: 'name', label: { en: 'Name', fa: 'نام' }, required: true },
      { id: 'mobile', type: 'tel', role: 'phone', label: { en: 'Mobile', fa: 'موبایل' }, required: true },
      { id: 'step-2', type: 'step', label: { en: 'Details', fa: 'جزئیات' } },
      { id: 'level', type: 'radio', label: { en: 'Level', fa: 'سطح' }, required: true, options: [{ en: 'Basic', fa: 'مقدماتی', price: 1_000_000 }, { en: 'Pro', fa: 'پیشرفته', price: 3_000_000 }] },
      { id: 'seats', type: 'number', label: { en: 'Seats', fa: 'تعداد' }, required: true, min: 1, max: 5, price: 500_000 },
      { id: 'lunch', type: 'checkbox', label: { en: 'Lunch', fa: 'ناهار' }, price: 200_000 },
      { id: 'national-id', type: 'text', label: { en: 'National id', fa: 'کد ملی' }, pattern: 'nationalId' },
      { id: 'when', type: 'date', label: { en: 'Date', fa: 'تاریخ' }, min: 0 },
      { id: 'photo', type: 'file', label: { en: 'Photo', fa: 'عکس' }, files: { kinds: ['image'], maxMb: 1 }, max: 2 },
    ],
  };

  beforeAll(async () => {
    const settings = (await owner.get(`${base}/settings`)).body.data;
    const saved = await owner.put(`${base}/settings`, { ...settings, requestTypes: [...settings.requestTypes, payType] });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  });

  const submit = (answers: Record<string, unknown>) => request(app).post(`${pub}/leads`).send({ type: 'workshop', answers });

  it('turns the old fixed forms into editable fields with the same questions', async () => {
    const res = await request(app).get(`${pub}/settings`);
    const consultation = res.body.data.requestTypes.find((t: { slug: string }) => t.slug === 'consultation');
    expect(consultation.formVersion).toBe(2);
    expect(consultation.fields.map((f: { id: string }) => f.id)).toEqual(['name', 'phone', 'email', 'project-type', 'budget', 'message', 'consent']);
    expect(consultation.fields[0].role).toBe('name');
  });

  it('checks limits, patterns and dates on the server', async () => {
    const res = await submit({ who: 'Reza', mobile: '09121112233', level: 'Basic', seats: '9', 'national-id': '1234567890', when: '2000-01-01' });
    expect(res.status).toBe(400);
    const codes = Object.fromEntries(res.body.error.details.map((d: { path: string; code: string }) => [d.path, d.code]));
    expect(codes).toMatchObject({ 'answers.seats': 'max', 'answers.national-id': 'pattern', 'answers.when': 'min' });
  });

  it('accepts uploads only of the allowed kind, and attaches them to the request', async () => {
    const wrong = await request(app).post(`${pub}/uploads`).field('type', 'workshop').field('field', 'photo').attach('file', Buffer.from('%PDF-1.4\n%%EOF'), 'a.pdf');
    expect(wrong.status).toBe(415);
    const notFile = await request(app).post(`${pub}/uploads`).field('type', 'workshop').field('field', 'level').attach('file', PNG, 'a.png');
    expect(notFile.status).toBe(400);
    const up = await request(app).post(`${pub}/uploads`).field('type', 'workshop').field('field', 'photo').attach('file', PNG, 'site.png');
    expect(up.status, JSON.stringify(up.body)).toBe(201);

    // Price: base 100,000 + Pro 3,000,000 + 2 seats × 500,000 + lunch 200,000.
    const res = await submit({ who: 'Reza', mobile: '۰۹۱۲۱۱۱۲۲۳۳', level: 'پیشرفته', seats: '۲', lunch: true, 'national-id': '0013542419', photo: [up.body.data.id] });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.paymentDue).toBe(true);
    const staff = (await owner.get(`${base}/leads/${res.body.data.id}`)).body.data;
    expect(staff.name).toBe('Reza');
    expect(staff.phone).toBe('09121112233');
    expect(staff.amountDueMinor).toBe('4300000');
    expect(staff.files).toHaveLength(1);
    expect(staff.files[0].name).toBe('site.png');
    expect(staff.details.answers.find((a: { field: string }) => a.field === 'photo').value).toBe('site.png');
    // An upload is used once.
    expect((await submit({ who: 'Ali', mobile: '09121112234', level: 'Basic', seats: '1', photo: [up.body.data.id] })).status).toBe(400);
  });
});
