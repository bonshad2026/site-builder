import {
  cancelStage,
  checkAnswers,
  fillTemplate,
  labelledAnswers,
  leadInputSchema,
  nextStages,
  normalizeAnswers,
  normalizePhone,
  computeTotal,
  contactFromAnswers,
  fieldVisible,
  requestCode,
  requestTypeConfig,
  STANDARD_MESSAGES,
  stageChangeSchema,
  type RequestTypeConfig,
  type SiteSettings,
  type WorkflowStage,
} from '@site-builder/shared';
import type pg from 'pg';
import type { z } from 'zod';
import { randomToken, sha256 } from '../../common/crypto.js';
import { AppError, badRequest, notFound } from '../../common/errors.js';
import type { AppContext } from '../../context.js';
import { withTransaction } from '../../database/tenant/pools.js';
import type { TenantContext } from '../../types.js';
import { auditTenant } from '../audit/audit.js';
import { caseLink, loadSettings, siteBaseUrl } from './context.js';
import { attachUploads, checkUploads } from './files.js';
import { formatAmount, messageLocale, notifyCustomer, notifyStaff, siteName, type Delivery } from './notify.js';

type LeadInput = z.output<typeof leadInputSchema>;
type Db = pg.Pool | pg.PoolClient;

export const REQUEST_COLUMNS = `id, number::text AS number, type, name, email, phone, project_type AS "projectType", budget, message, source_path AS "sourcePath",
  status AS stage, stage_kind AS "stageKind", details, answers, item_ref AS item, customer_id AS "customerId", assignee_user_id AS "assigneeUserId", unread,
  amount_due_minor::text AS "amountDueMinor", amount_title AS "amountTitle", paid_minor::text AS "paidMinor", currency, payment_status AS "paymentStatus",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

export interface RequestRow {
  id: string;
  number: string;
  type: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  stage: string;
  stageKind: 'open' | 'done' | 'cancelled';
  details: { answers?: { label: string; value: string }[]; date?: string; time?: string; people?: number; company?: string };
  item: { collection: string; slug: string; title: Record<string, string> } | null;
  customerId: string | null;
  amountDueMinor: string;
  amountTitle: string;
  paidMinor: string;
  currency: string;
  paymentStatus: string;
  createdAt: string;
  public_token_hash?: string | null;
}

/** A request type of the site, or a 400 for one the settings do not know. */
export function typeOf(settings: SiteSettings, slug: string): RequestTypeConfig {
  const type = requestTypeConfig(settings, slug);
  if (!type) throw badRequest('Unknown request type');
  return type;
}

/** The stage's name for the staff (`customer`: as the customer sees it). */
export function stageLabel(stage: WorkflowStage | undefined, key: string, locale: 'en' | 'fa', customer = false) {
  if (!stage) return key;
  const pick = (v: { en: string; fa: string }) => v[locale] || v.en || v.fa;
  return (customer && pick(stage.customerLabel)) || pick(stage.label) || key;
}

export async function addEvent(
  db: Db,
  subject: { leadId?: string; orderId?: string },
  e: { kind: string; public?: boolean; body?: string; data?: Record<string, unknown>; actorUserId?: string | null; byCustomer?: boolean },
): Promise<number> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO case_events (lead_id, order_id, kind, public, body, data, actor_user_id, by_customer) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [subject.leadId ?? null, subject.orderId ?? null, e.kind, e.public ?? false, e.body ?? '', e.data ?? {}, e.actorUserId ?? null, e.byCustomer ?? false],
  );
  return Number(rows[0].id);
}

/** Records on an event how its message was delivered. */
export async function markDelivered(db: Db, eventId: number, delivery: Delivery) {
  if (delivery.sms === undefined && delivery.email === undefined) return;
  await db.query(`UPDATE case_events SET data = data || jsonb_build_object('delivery', $2::jsonb) WHERE id = $1`, [eventId, JSON.stringify(delivery)]);
}

export async function eventsOf(db: Db, subject: { leadId?: string; orderId?: string }, publicOnly: boolean) {
  const { rows } = await db.query(
    `SELECT e.id::text AS id, e.kind, e.public, e.body, e.data, e.by_customer AS "byCustomer", e.actor_user_id AS "actorUserId", e.created_at AS "createdAt"
       FROM case_events e
      WHERE ${subject.leadId ? 'e.lead_id' : 'e.order_id'} = $1 AND ($2::boolean = false OR e.public)
      ORDER BY e.id`,
    [subject.leadId ?? subject.orderId, publicOnly],
  );
  return rows as { id: string; kind: string; public: boolean; body: string; data: Record<string, unknown>; byCustomer: boolean; actorUserId: string | null; createdAt: string }[];
}

/* ---------- submitting ---------- */

/**
 * Stores a request from the site: checks the type's contact rules, its fields' answers and who
 * may send it, starts it in the first stage of its workflow and opens a payment when the form
 * asks for one. Returns the tracking code and a token that opens it without an account.
 */
export async function createRequest(
  ctx: AppContext,
  tenant: TenantContext,
  body: LeadInput,
  extra: { customer: { id: string; name: string; phone: string | null; email: string | null } | null; ipHash: string | null; itemRef: unknown },
) {
  const db = tenant.db;
  const settings = await loadSettings(db);
  const type = typeOf(settings, body.type);
  if (type.access === 'signed_in' && !extra.customer) throw new AppError(401, 'sign_in_required', 'Sign in to send this request');

  const customer = extra.customer;
  const fields = type.fields;
  // Name, phone, email and consent sent apart (older clients) or known from the account fill their questions.
  const answers = { ...body.answers };
  // The old fixed forms sent their questions apart; they fill the converted questions of the same id.
  const choiceLabel = (list: { value: string; label: { en: string; fa: string } }[], value?: string) => {
    const c = list.find((x) => x.value === value);
    return c ? c.label.fa || c.label.en : value;
  };
  const legacy: Record<string, string | undefined> = {
    message: body.message || undefined,
    'project-type': choiceLabel(settings.formOptions.projectTypes, body.projectType),
    budget: body.budget || undefined,
    date: body.details?.date,
    time: body.details?.time,
    people: body.details?.people ? String(body.details.people) : undefined,
    company: body.details?.company,
  };
  for (const f of fields) {
    if ((answers[f.id] === undefined || answers[f.id] === '') && legacy[f.id]) answers[f.id] = legacy[f.id]!;
  }
  for (const f of fields) {
    if (answers[f.id] !== undefined && answers[f.id] !== '') continue;
    const given = f.role === 'name' ? body.name || customer?.name : f.role === 'phone' ? body.phone || customer?.phone : f.role === 'email' ? body.email || customer?.email : undefined;
    if (given) answers[f.id] = given;
    else if (f.id === 'consent' && f.type === 'checkbox' && body.consent) answers[f.id] = true;
  }
  body = { ...body, answers: normalizeAnswers(fields, answers) };
  // Name, phone and email come from the questions marked for them; older clients send them apart.
  const fromAnswers = contactFromAnswers(fields, body.answers);
  const name = fromAnswers.name || body.name || customer?.name || '';
  const email = fromAnswers.email || body.email || (customer?.email ?? '');
  const phone = normalizePhone(fromAnswers.phone || body.phone || (customer?.phone ?? ''));
  const issues: { path: string; message: string; code: string; limit?: number | string }[] = [];
  for (const i of checkAnswers(fields, body.answers)) {
    issues.push({ path: `answers.${i.field}`, message: i.problem, code: i.problem === 'required' ? 'too_small' : i.problem, ...(i.limit !== undefined ? { limit: i.limit } : {}) });
  }
  const fileFields = fields.filter((f) => f.type === 'file' && fieldVisible(f, fields, body.answers)).map((f) => f.id);
  const uploads = await checkUploads(db, type.slug, body.answers, fileFields);
  for (const f of uploads.bad) issues.push({ path: `answers.${f}`, message: 'Upload the files again', code: 'file_missing' });
  if (issues.length) throw new AppError(400, 'validation_failed', 'Invalid request body', issues);

  const locale = body.locale ?? messageLocale(settings);
  const details = { ...body.details, answers: labelledAnswers(fields, body.answers, locale, uploads.names) };
  const message = body.message || details.answers.map((a) => `${a.label}: ${a.value}`).join(' · ').slice(0, 4000);
  const first = type.workflow.stages[0];
  const token = randomToken(24);
  // The total is always computed here from the answers; the browser's figure is only a preview.
  const total = type.payment.onSubmit ? computeTotal(fields, body.answers, type.payment.amountMinor) : 0;
  const pay = total > 0;

  const lead = await withTransaction(db, async (tx) => {
    const { rows } = await tx.query<RequestRow>(
      `INSERT INTO leads (type, name, email, phone, project_type, budget, message, source_path, ip_hash, details, item_ref, answers,
                          status, stage_kind, public_token_hash, customer_id, amount_due_minor, amount_title, currency, payment_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20) RETURNING ${REQUEST_COLUMNS}`,
      [
        body.type, name, email, phone, body.projectType ?? null, body.budget ?? null, message, body.sourcePath ?? null, extra.ipHash, details, extra.itemRef,
        body.answers, first.key, first.kind, sha256(token), customer?.id ?? null,
        total, pay ? type.payment.title[locale] || type.payment.title.en || type.payment.title.fa : '', type.payment.currency, pay ? 'due' : 'none',
      ],
    );
    await attachUploads(tx, rows[0].id, Object.keys(uploads.names));
    await addEvent(tx, { leadId: rows[0].id }, { kind: 'created', public: true, data: { stage: first.key }, byCustomer: true });
    if (pay) await addEvent(tx, { leadId: rows[0].id }, { kind: 'payment_requested', public: true, data: { amountMinor: String(total), currency: type.payment.currency } });
    return rows[0];
  });

  const code = requestCode(lead.number);
  const typeName = type.label[messageLocale(settings)] || type.slug;
  const base = await siteBaseUrl(ctx, tenant);
  await notifyStaff(ctx, tenant, settings, `${typeName} ${code}`, `${lead.name} — ${typeName} (${code})\n\n${message}\n\n${base}/admin/sites/${tenant.slug}/leads?open=${lead.id}`);
  if (first.notify) {
    const ml = messageLocale(settings);
    const link = await caseLink(ctx, tenant, 'request', lead.id, code, ml);
    const text = fillTemplate(first.message[ml] || STANDARD_MESSAGES.received[ml], { site: siteName(settings), number: code, name: lead.name, stage: stageLabel(first, first.key, ml, true), amount: '', link });
    await notifyCustomer(ctx, settings, { phone, email }, text, code);
  }
  return { lead, code, token, paymentDue: pay };
}

/* ---------- staff actions ---------- */

/**
 * A gateway payment started in the last few minutes and not finished: changing the amount or
 * cancelling now could race its verification. Older attempts were abandoned.
 */
async function paymentInProgress(tx: pg.PoolClient, leadId: string) {
  const { rows } = await tx.query(`SELECT 1 FROM payments WHERE lead_id = $1 AND status = 'initiated' AND created_at > now() - interval '20 minutes'`, [leadId]);
  return rows.length > 0;
}

async function lockRequest(tx: pg.PoolClient, id: string) {
  const { rows } = await tx.query<RequestRow>(`SELECT ${REQUEST_COLUMNS} FROM leads WHERE id = $1 FOR UPDATE`, [id]);
  if (!rows[0]) throw notFound('Request');
  return rows[0];
}

/**
 * Moves a request to another stage its workflow allows, optionally asking for a payment, writes
 * the timeline and tells the customer when the stage (or the staff) says so.
 */
export async function changeStage(ctx: AppContext, tenant: TenantContext, id: string, input: z.output<typeof stageChangeSchema>, actorUserId: string | null) {
  const settings = await loadSettings(tenant.db);
  const ml = messageLocale(settings);
  const result = await withTransaction(tenant.db, async (tx) => {
    const lead = await lockRequest(tx, id);
    const type = typeOf(settings, lead.type);
    const target = type.workflow.stages.find((s) => s.key === input.stage);
    if (!target) throw badRequest('Unknown stage');
    if (!nextStages(type.workflow, lead.stage).some((s) => s.key === target.key)) {
      throw badRequest(`Cannot move this request from "${stageLabel(type.workflow.stages.find((s) => s.key === lead.stage), lead.stage, 'en')}" to "${stageLabel(target, target.key, 'en')}"`);
    }
    if (target.askPayment && !input.payment && BigInt(lead.amountDueMinor) === 0n) throw badRequest('Enter the amount the customer should pay');

    await tx.query(`UPDATE leads SET status = $2, stage_kind = $3, updated_at = now() WHERE id = $1`, [id, target.key, target.kind]);
    if (target.kind === 'cancelled' && BigInt(lead.amountDueMinor) > 0n) {
      await tx.query(`UPDATE leads SET amount_due_minor = 0, payment_status = CASE WHEN paid_minor > 0 THEN payment_status ELSE 'none' END WHERE id = $1`, [id]);
    }
    const eventId = await addEvent(tx, { leadId: id }, {
      kind: 'stage',
      public: target.visible || !!input.message,
      body: input.message,
      data: { from: lead.stage, to: target.key },
      actorUserId,
    });
    let paymentEvent: number | null = null;
    if (input.payment) {
      await tx.query(`UPDATE leads SET amount_due_minor = $2, amount_title = $3, payment_status = 'due', updated_at = now() WHERE id = $1`, [id, input.payment.amountMinor, input.payment.title]);
      paymentEvent = await addEvent(tx, { leadId: id }, { kind: 'payment_requested', public: true, body: input.payment.title, data: { amountMinor: String(input.payment.amountMinor), currency: lead.currency }, actorUserId });
    }
    await auditTenant(tx, { actorUserId, action: 'request.stage_changed', target: id, metadata: { from: lead.stage, to: target.key } });
    return { lead, target, eventId, paymentEvent };
  });

  const { lead, target, eventId } = result;
  const notify = input.notify ?? target.notify;
  if (notify && (target.visible || input.message)) {
    const code = requestCode(lead.number);
    const link = await caseLink(ctx, tenant, 'request', lead.id, code, ml);
    const amount = input.payment ? formatAmount(input.payment.amountMinor, lead.currency, ml) : '';
    const template = target.message[ml] || (input.payment ? STANDARD_MESSAGES.payment[ml] : STANDARD_MESSAGES.stage[ml]);
    const values = { site: siteName(settings), number: code, name: lead.name, stage: stageLabel(target, target.key, ml, true), amount, link };
    const text = input.message ? `${input.message}\n${fillTemplate(template, values)}` : fillTemplate(template, values);
    await markDelivered(tenant.db, eventId, await notifyCustomer(ctx, settings, lead, text, code));
  }
  return getRequest(tenant.db, id);
}

/** A message to the customer (shown on their page and sent to them) or an internal note. */
export async function addStaffEvent(ctx: AppContext, tenant: TenantContext, id: string, input: { kind: 'note' | 'message'; text: string }, actorUserId: string) {
  const { rows } = await tenant.db.query<RequestRow>(`SELECT ${REQUEST_COLUMNS} FROM leads WHERE id = $1`, [id]);
  const lead = rows[0];
  if (!lead) throw notFound('Request');
  const eventId = await addEvent(tenant.db, { leadId: id }, { kind: input.kind, public: input.kind === 'message', body: input.text, actorUserId });
  await tenant.db.query('UPDATE leads SET updated_at = now() WHERE id = $1', [id]);
  if (input.kind === 'message') {
    const settings = await loadSettings(tenant.db);
    const ml = messageLocale(settings);
    const code = requestCode(lead.number);
    const link = await caseLink(ctx, tenant, 'request', id, code, ml);
    const text = fillTemplate(STANDARD_MESSAGES.reply[ml], { site: siteName(settings), number: code, text: input.text.slice(0, 300), link });
    await markDelivered(tenant.db, eventId, await notifyCustomer(ctx, settings, lead, text, code));
  }
  return getRequest(tenant.db, id);
}

/** Asks the customer to pay an amount (replacing an unpaid one); `amountMinor` 0 withdraws it. */
export async function requestPayment(ctx: AppContext, tenant: TenantContext, id: string, input: { amountMinor: number; title: string; notify: boolean }, actorUserId: string) {
  const settings = await loadSettings(tenant.db);
  const ml = messageLocale(settings);
  const { lead, eventId } = await withTransaction(tenant.db, async (tx) => {
    const lead = await lockRequest(tx, id);
    if (await paymentInProgress(tx, id)) throw badRequest('A payment is in progress; try again in a few minutes');
    if (input.amountMinor === 0) {
      await tx.query(`UPDATE leads SET amount_due_minor = 0, payment_status = CASE WHEN paid_minor > 0 THEN payment_status ELSE 'none' END, updated_at = now() WHERE id = $1`, [id]);
      await addEvent(tx, { leadId: id }, { kind: 'payment_requested', public: true, data: { amountMinor: '0', withdrawn: true }, actorUserId });
      return { lead, eventId: null };
    }
    if (lead.stageKind !== 'open') throw badRequest('This request is closed');
    await tx.query(`UPDATE leads SET amount_due_minor = $2, amount_title = $3, payment_status = 'due', updated_at = now() WHERE id = $1`, [id, input.amountMinor, input.title]);
    const eventId = await addEvent(tx, { leadId: id }, { kind: 'payment_requested', public: true, body: input.title, data: { amountMinor: String(input.amountMinor), currency: lead.currency }, actorUserId });
    return { lead, eventId };
  });
  if (eventId && input.notify) {
    const code = requestCode(lead.number);
    const link = await caseLink(ctx, tenant, 'request', id, code, ml);
    const text = fillTemplate(STANDARD_MESSAGES.payment[ml], { site: siteName(settings), number: code, name: lead.name, amount: formatAmount(input.amountMinor, lead.currency, ml), link });
    await markDelivered(tenant.db, eventId, await notifyCustomer(ctx, settings, lead, text, code));
  }
  return getRequest(tenant.db, id);
}

export async function getRequest(db: Db, id: string) {
  const { rows } = await db.query(`SELECT ${REQUEST_COLUMNS} FROM leads WHERE id = $1`, [id]);
  if (!rows[0]) throw notFound('Request');
  return rows[0] as RequestRow;
}

/* ---------- the customer's side ---------- */

/**
 * A request as its customer sees it: the stages they can see, public events only, what they may
 * do now (pay, cancel, reply). Internal notes and hidden stages never leave the server.
 */
export async function customerView(db: Db, settings: SiteSettings, lead: RequestRow, locale: 'en' | 'fa') {
  const type = requestTypeConfig(settings, lead.type);
  const workflow = type?.workflow;
  const current = workflow?.stages.find((s) => s.key === lead.stage);
  const events = await eventsOf(db, { leadId: lead.id }, true);
  const label = (key: string) => stageLabel(workflow?.stages.find((s) => s.key === key), key, locale, true);
  const visibleKey = (key: string) => workflow?.stages.find((s) => s.key === key)?.visible !== false;
  // The customer's progress: visible open/done stages in order, up to the first finished one.
  const path: { key: string; label: string; kind: string }[] = [];
  for (const s of workflow?.stages ?? []) {
    if (!s.visible || s.kind === 'cancelled') continue;
    path.push({ key: s.key, label: label(s.key), kind: s.kind });
    if (s.kind === 'done') break;
  }
  const reached = new Set(events.filter((e) => e.kind === 'stage' || e.kind === 'created').map((e) => String(e.data.to ?? e.data.stage ?? '')));
  return {
    kind: 'request' as const,
    id: lead.id,
    code: requestCode(lead.number),
    number: lead.number,
    type: { slug: lead.type, label: type?.label ?? { en: lead.type, fa: lead.type } },
    createdAt: lead.createdAt,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    answers: lead.details?.answers ?? [],
    details: { date: lead.details?.date, time: lead.details?.time, people: lead.details?.people },
    message: lead.details?.answers?.length ? '' : lead.message,
    item: lead.item,
    stage: { key: lead.stage, label: current && !current.visible ? label(lastVisible(events, visibleKey) ?? lead.stage) : label(lead.stage), kind: lead.stageKind, color: current?.color ?? 'gray' },
    path: path.map((p) => ({ ...p, reached: reached.has(p.key) || p.key === lead.stage })),
    payment: {
      status: lead.paymentStatus,
      dueMinor: lead.amountDueMinor,
      paidMinor: lead.paidMinor,
      currency: lead.currency,
      title: lead.amountTitle,
    },
    canCancel: lead.stageKind === 'open' && !!current?.customerCanCancel && !!workflow && !!cancelStage(workflow),
    canReply: !current || current.customerCanReply,
    // An earlier attempt left at the gateway is replaced by a new one.
    canPay: lead.stageKind === 'open' && BigInt(lead.amountDueMinor) > 0n,
    events: events
      .filter((e) => e.kind !== 'stage' || visibleKey(String(e.data.to)) || e.body)
      .map((e) => ({
        id: e.id,
        kind: e.kind,
        body: e.body,
        byCustomer: e.byCustomer,
        createdAt: e.createdAt,
        stage: e.kind === 'stage' || e.kind === 'created' ? label(String(e.data.to ?? e.data.stage ?? '')) : undefined,
        amountMinor: typeof e.data.amountMinor === 'string' ? e.data.amountMinor : undefined,
        currency: typeof e.data.currency === 'string' ? e.data.currency : undefined,
        withdrawn: e.data.withdrawn === true || undefined,
        ok: typeof e.data.ok === 'boolean' ? e.data.ok : undefined,
      })),
  };
}

function lastVisible(events: { kind: string; data: Record<string, unknown> }[], visible: (key: string) => boolean) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const key = String(e.data.to ?? e.data.stage ?? '');
    if ((e.kind === 'stage' || e.kind === 'created') && key && visible(key)) return key;
  }
  return null;
}

export async function findRequestByNumber(db: Db, number: string) {
  const { rows } = await db.query<RequestRow>(`SELECT ${REQUEST_COLUMNS}, public_token_hash FROM leads WHERE number = $1`, [number]);
  return rows[0] ?? null;
}

/** The customer's message on their request; the staff see it as new. */
export async function customerMessage(ctx: AppContext, tenant: TenantContext, lead: RequestRow, text: string, settings: SiteSettings) {
  const type = requestTypeConfig(settings, lead.type);
  const current = type?.workflow.stages.find((s) => s.key === lead.stage);
  if (current && !current.customerCanReply) throw badRequest('Messages are closed for this request');
  await addEvent(tenant.db, { leadId: lead.id }, { kind: 'customer_message', public: true, body: text, byCustomer: true });
  await tenant.db.query('UPDATE leads SET unread = true, updated_at = now() WHERE id = $1', [lead.id]);
  const base = await siteBaseUrl(ctx, tenant);
  await notifyStaff(ctx, tenant, settings, `${requestCode(lead.number)} — ${lead.name}`, `${text}\n\n${base}/admin/sites/${tenant.slug}/leads?open=${lead.id}`);
}

/** The customer cancels their request (only in stages that allow it). */
export async function customerCancel(ctx: AppContext, tenant: TenantContext, leadId: string, settings: SiteSettings) {
  await withTransaction(tenant.db, async (tx) => {
    const lead = await lockRequest(tx, leadId);
    const type = typeOf(settings, lead.type);
    const current = type.workflow.stages.find((s) => s.key === lead.stage);
    const target = cancelStage(type.workflow);
    if (lead.stageKind !== 'open' || !current?.customerCanCancel || !target) throw badRequest('This request can no longer be cancelled');
    if (await paymentInProgress(tx, leadId)) throw badRequest('A payment is in progress; try again in a few minutes');
    await tx.query(
      `UPDATE leads SET status = $2, stage_kind = 'cancelled', unread = true, amount_due_minor = 0,
              payment_status = CASE WHEN paid_minor > 0 THEN payment_status ELSE 'none' END, updated_at = now() WHERE id = $1`,
      [leadId, target.key],
    );
    await addEvent(tx, { leadId }, { kind: 'stage', public: true, data: { from: lead.stage, to: target.key, byCustomer: true }, byCustomer: true });
    await auditTenant(tx, { action: 'request.cancelled_by_customer', target: leadId });
  });
  const lead = await getRequest(tenant.db, leadId);
  await notifyStaff(ctx, tenant, settings, `${requestCode(lead.number)} cancelled`, `${lead.name} cancelled request ${requestCode(lead.number)}.`);
}
