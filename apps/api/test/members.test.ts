import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeContext } from '../src/context.js';
import { createAdmin, createTenant, createTestServer, lead, signIn, type Client } from './helpers.js';

/**
 * Account kinds, customers' own items (a trainer's profile with photo and files), table-based
 * form choices, assigning a request to an item and reviews after a finished request.
 */
const { ctx, app, sms } = createTestServer();
let owner: Client;
let base: string;
let pub: string;
let trainersId: string;
let courseId: string;

// The smallest valid PDF and PNG (type is found from the bytes).
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const trainingType = {
  slug: 'training',
  label: { en: 'Training request', fa: 'درخواست آموزش' },
  form: 'contact',
  formVersion: 2,
  contact: { email: 'optional', phone: 'required' },
  assignTable: 'trainers',
  fields: [
    { id: 'name', type: 'text', role: 'name', label: { en: 'Organisation', fa: 'سازمان' }, required: true },
    { id: 'phone', type: 'tel', role: 'phone', label: { en: 'Phone', fa: 'تلفن' }, required: true },
    { id: 'course', type: 'select', label: { en: 'Course', fa: 'دوره' }, required: true, optionsFrom: 'courses' },
    { id: 'date', type: 'date', label: { en: 'Date', fa: 'تاریخ' } },
  ],
  workflow: {
    stages: [
      { key: 'new', label: { en: 'New', fa: 'جدید' }, next: ['held'] },
      { key: 'held', label: { en: 'Held', fa: 'برگزار شد' }, kind: 'done', next: [] },
    ],
  },
};

/** Signs up a customer of a kind and returns an agent with its CSRF token. */
async function customer(phone: string, body: Record<string, unknown>) {
  const agent = request.agent(app);
  expect((await agent.post(`${pub}/customer/code`).send({ identifier: phone, purpose: 'signup' })).status).toBe(200);
  const code = sms.outbox.at(-1)!.code;
  const res = await agent.post(`${pub}/customer/signup`).send({ identifier: phone, code, name: 'Test Person', ...body });
  const csrf = res.status === 201 ? decodeURIComponent(/sb_cc_[^=]+=([^;]+)/.exec(String(res.headers['set-cookie']))![1]) : '';
  return { agent, csrf, res };
}

beforeAll(async () => {
  const admin = await createAdmin(ctx);
  const site = await createTenant(ctx, admin.id, { modules: { leads: true } });
  owner = await signIn(app, site.ownerEmail);
  base = `/api/v1/sites/${site.slug}`;
  pub = `/api/v1/public/sites/${site.slug}`;

  const courses = await owner.post(`${base}/collections`, { slug: 'courses', name: { en: 'Courses', fa: 'دوره‌ها' }, itemName: { en: 'Course', fa: 'دوره' }, fields: [] });
  expect(courses.status, JSON.stringify(courses.body)).toBe(201);
  const course = await owner.post(`${base}/collections/${courses.body.data.id}/items`, { slug: 'fire-1', title: { en: 'Firefighting 1', fa: 'اطفای حریق ۱' }, status: 'published' });
  courseId = course.body.data.id;
  await owner.post(`${base}/collections/${courses.body.data.id}/items`, { slug: 'draft', title: { en: 'Hidden', fa: 'پنهان' }, status: 'draft' });

  const trainers = await owner.post(`${base}/collections`, {
    slug: 'trainers',
    name: { en: 'Trainers', fa: 'مربی‌ها' },
    itemName: { en: 'Trainer', fa: 'مربی' },
    imageField: 'photo',
    fields: [
      { key: 'photo', type: 'image', label: { en: 'Photo', fa: 'عکس' } },
      { key: 'bio', type: 'textarea', label: { en: 'Bio', fa: 'بیوگرافی' } },
      { key: 'courses', type: 'reference', reference: 'courses', multiple: true, label: { en: 'Courses', fa: 'دوره‌ها' } },
      { key: 'files', type: 'files', label: { en: 'Files', fa: 'فایل‌ها' } },
      { key: 'verified', type: 'boolean', label: { en: 'Verified', fa: 'تأییدشده' } },
    ],
    selfService: { enabled: true, approval: true, fields: ['photo', 'bio', 'courses', 'files'] },
    reviews: { enabled: true, afterDoneRequest: true },
  });
  expect(trainers.status, JSON.stringify(trainers.body)).toBe(201);
  trainersId = trainers.body.data.id;

  const settings = (await owner.get(`${base}/settings`)).body.data;
  const saved = await owner.put(`${base}/settings`, {
    ...settings,
    requestTypes: [...settings.requestTypes, trainingType],
    accounts: {
      enabled: true,
      identifier: 'phone',
      passwords: true,
      kinds: [
        { key: 'person', label: { en: 'Person', fa: 'فرد' } },
        { key: 'org', label: { en: 'Organisation', fa: 'سازمان' }, organization: true },
        { key: 'trainer', label: { en: 'Trainer', fa: 'مربی' }, profileTable: 'trainers' },
      ],
    },
    notifications: { staff: false, emails: [] },
  });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
});
afterAll(() => closeContext(ctx));

describe('account kinds', () => {
  it('asks for a kind, and the organisation name where the kind needs it', async () => {
    expect((await customer('09120000001', {})).res.status).toBe(400);
    expect((await customer('09120000002', { kind: 'org' })).res.status).toBe(400);
    const ok = await customer('09120000003', { kind: 'org', organization: 'Refinery Co' });
    expect(ok.res.status, JSON.stringify(ok.res.body)).toBe(201);
    expect(ok.res.body.data).toMatchObject({ kind: 'org', organization: 'Refinery Co' });
  });
});

describe("a trainer's own page", () => {
  let trainer: Awaited<ReturnType<typeof customer>>;
  let itemId: string;

  beforeAll(async () => {
    trainer = await customer('09120000010', { kind: 'trainer' });
    expect(trainer.res.status).toBe(201);
  });

  it('only accounts of a kind with a table have one', async () => {
    const person = await customer('09120000011', { kind: 'person' });
    expect((await person.agent.get(`${pub}/customer/profile`)).body.data).toBeNull();
    expect((await person.agent.put(`${pub}/customer/profile`).set('X-Customer-CSRF', person.csrf).send({ title: { fa: 'x' } })).status).toBe(403);
  });

  it('uploads files, saves a draft for approval and keeps staff-only fields', async () => {
    const photo = await trainer.agent.post(`${pub}/customer/files`).set('X-Customer-CSRF', trainer.csrf).attach('file', PNG, 'me.png');
    expect(photo.status, JSON.stringify(photo.body)).toBe(201);
    const cv = await trainer.agent.post(`${pub}/customer/files`).set('X-Customer-CSRF', trainer.csrf).attach('file', PDF, 'cv.pdf');
    expect(cv.status).toBe(201);
    const saved = await trainer.agent
      .put(`${pub}/customer/profile`)
      .set('X-Customer-CSRF', trainer.csrf)
      .send({ title: { fa: 'مربی آزمایشی', en: '' }, data: { photo: photo.body.data.id, bio: { fa: 'سابقه', en: '' }, courses: [courseId], files: [{ id: cv.body.data.id, title: 'رزومه' }], verified: true } });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.data.item.status).toBe('draft');
    expect(saved.body.data.item.data.verified ?? null).toBeNull();
    expect(saved.body.data.item.preview.files[0]).toMatchObject({ title: 'رزومه', contentType: 'application/pdf' });
    itemId = saved.body.data.item.id;
    // Not on the site until the staff publish it; the staff see who keeps it.
    expect((await request(app).get(`${pub}/collections/trainers/items/${saved.body.data.item.slug}`)).status).toBe(404);
    const list = await owner.get(`${base}/collections/${trainersId}/items`);
    expect(list.body.data[0].owner.name).toBe('Test Person');
  });

  it('refuses files that are not the customer’s own uploads', async () => {
    const other = await customer('09120000012', { kind: 'trainer' });
    const theirs = await other.agent.post(`${pub}/customer/files`).set('X-Customer-CSRF', other.csrf).attach('file', PDF, 'x.pdf');
    const res = await trainer.agent.put(`${pub}/customer/profile`).set('X-Customer-CSRF', trainer.csrf).send({ title: { fa: 'مربی آزمایشی' }, data: { files: [{ id: theirs.body.data.id, title: 'x' }] } });
    expect(res.status).toBe(400);
  });

  it('after approval, edits show at once on the public page with file links', async () => {
    const item = (await owner.get(`${base}/collections/${trainersId}/items/${itemId}`)).body.data;
    expect((await owner.put(`${base}/collections/${trainersId}/items/${itemId}`, { ...item, status: 'published' })).status).toBe(200);
    const edit = await trainer.agent.put(`${pub}/customer/profile`).set('X-Customer-CSRF', trainer.csrf).send({ title: { fa: 'مربی آزمایشی' }, data: { bio: { fa: 'سابقه‌ی تازه', en: '' } } });
    expect(edit.body.data.item.status).toBe('published');
    const page = await request(app).get(`${pub}/collections/trainers/items/${item.slug}`);
    expect(page.body.data.data.bio.fa).toBe('سابقه‌ی تازه');
    expect(page.body.data.data.files[0].url).toBeTruthy();
    expect(page.body.data.rating).toEqual({ average: 0, count: 0 });
  });

  describe('requests and reviews', () => {
    let org: Awaited<ReturnType<typeof customer>>;
    let leadId: string;
    let slug: string;

    beforeAll(async () => {
      org = await customer('09120000020', { kind: 'org', organization: 'Airport' });
      slug = (await owner.get(`${base}/collections/${trainersId}/items/${itemId}`)).body.data.slug;
    });

    it('takes form choices from the table’s published items', async () => {
      const send = (course: string) => org.agent.post(`${pub}/leads`).set('X-Customer-CSRF', org.csrf).send(lead({ type: 'training', message: '', answers: { name: 'Airport', phone: '09120000020', course, date: '2027-01-10' } }));
      expect((await send('پنهان')).status).toBe(400);
      const ok = await send('اطفای حریق ۱');
      expect(ok.status, JSON.stringify(ok.body)).toBe(201);
      leadId = ok.body.data.id;
    });

    it('lets the staff assign only items of the type’s table', async () => {
      expect((await owner.patch(`${base}/leads/${leadId}`, { assignedItemId: courseId })).status).toBe(400);
      expect((await owner.patch(`${base}/leads/${leadId}`, { assignedItemId: itemId })).status).toBe(200);
    });

    it('allows a review only after the request is done, once', async () => {
      const review = () => org.agent.post(`${pub}/collections/trainers/items/${slug}/reviews`).set('X-Customer-CSRF', org.csrf).send({ rating: 4, body: 'Clear and practical' });
      expect((await review()).status).toBe(403);
      await owner.post(`${base}/leads/${leadId}/stage`, { stage: 'held' });
      const before = await org.agent.get(`${pub}/collections/trainers/items/${slug}/reviews`);
      expect(before.body.data.mine.canReview).toBe(true);
      const ok = await review();
      expect(ok.status, JSON.stringify(ok.body)).toBe(201);
      expect(ok.body.data.authorName).toBe('Test Person — Airport');
      expect((await review()).status).toBe(403);
      // Someone without a finished request cannot review.
      const stranger = await customer('09120000021', { kind: 'person' });
      expect((await stranger.agent.post(`${pub}/collections/trainers/items/${slug}/reviews`).set('X-Customer-CSRF', stranger.csrf).send({ rating: 1 })).status).toBe(403);
    });

    it('shows the average, and hidden reviews no longer count', async () => {
      const list = await request(app).get(`${pub}/collections/trainers/items/${slug}/reviews`);
      expect(list.body.data).toMatchObject({ average: 4, count: 1 });
      const staff = await owner.get(`${base}/collections/${trainersId}/reviews`);
      expect((await owner.patch(`${base}/collections/${trainersId}/reviews/${staff.body.data[0].id}`, { status: 'hidden' })).status).toBe(200);
      expect((await request(app).get(`${pub}/collections/trainers/items/${slug}`)).body.data.rating).toEqual({ average: 0, count: 0 });
    });

    it('the customer’s request view names the trainer and that it was reviewed', async () => {
      const number = (await owner.get(`${base}/leads/${leadId}`)).body.data.number;
      const view = await org.agent.get(`${pub}/requests/${number}`);
      expect(view.body.data.assigned).toMatchObject({ slug, reviews: true, reviewed: true, canReview: false });
    });
  });
});
