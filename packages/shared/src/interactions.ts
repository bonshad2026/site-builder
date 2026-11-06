import { z } from 'zod';
import { CURRENCIES, type FormField } from './siteOptions.js';

/**
 * Customer interactions: what a request form asks, the stages a request goes through (its
 * workflow), payment, customer accounts and messages. A site defines them per request type in
 * its settings; the operator designs them, the site owner works the requests, the customer
 * follows their own requests on the site.
 */

const loc = (max = 400) => z.object({ en: z.string().max(max).default(''), fa: z.string().max(max).default('') }).default({ en: '', fa: '' });
export const stageKeySchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{1,39}$/, 'Use lowercase English letters, numbers and hyphens');

/* ---------- workflow ---------- */

/** open: still being worked on; done: finished well; cancelled: closed without result (frees seats). */
export const STAGE_KINDS = ['open', 'done', 'cancelled'] as const;
export type StageKind = (typeof STAGE_KINDS)[number];
export const STAGE_COLORS = ['gray', 'blue', 'amber', 'violet', 'green', 'red'] as const;

export const workflowStageSchema = z.object({
  key: stageKeySchema,
  /** The name the staff see. */
  label: loc(60),
  /** The name the customer sees on their timeline; empty = `label`. */
  customerLabel: loc(80),
  kind: z.enum(STAGE_KINDS).default('open'),
  color: z.enum(STAGE_COLORS).default('gray'),
  /** Shown on the customer's timeline (hidden stages are internal steps). */
  visible: z.boolean().default(true),
  /** Stages a request may move to from here. */
  next: z.array(stageKeySchema).max(20).default([]),
  /** Tell the customer (SMS / email) when the request reaches this stage. */
  notify: z.boolean().default(false),
  /** The text sent; {{number}}, {{name}}, {{stage}}, {{amount}} and {{link}} are filled in. Empty = a standard text. */
  message: loc(500),
  /** The customer may cancel the request while it is here. */
  customerCanCancel: z.boolean().default(false),
  /** The customer may send messages while the request is here. */
  customerCanReply: z.boolean().default(true),
  /** Moving here asks the staff for an amount, and the customer gets a payment link. */
  askPayment: z.boolean().default(false),
});
export type WorkflowStage = z.output<typeof workflowStageSchema>;

export const workflowSchema = z
  .object({
    /** In display order; a new request starts in the first one. */
    stages: z.array(workflowStageSchema).min(2).max(15),
    /** Where a request goes after a successful payment (empty = it stays). */
    paidStage: z.union([stageKeySchema, z.literal('')]).default(''),
  })
  .superRefine((w, ctx) => {
    const keys = new Set<string>();
    w.stages.forEach((s, i) => {
      if (keys.has(s.key)) ctx.addIssue({ code: 'custom', path: ['stages', i, 'key'], message: `Stage key "${s.key}" is used twice` });
      keys.add(s.key);
    });
    w.stages.forEach((s, i) =>
      s.next.forEach((n, j) => {
        if (!keys.has(n)) ctx.addIssue({ code: 'custom', path: ['stages', i, 'next', j], message: `Stage "${s.key}" leads to an unknown stage "${n}"` });
      }),
    );
    if (w.stages[0] && w.stages[0].kind !== 'open') ctx.addIssue({ code: 'custom', path: ['stages', 0, 'kind'], message: 'The first stage must be an open stage' });
    if (w.paidStage && !keys.has(w.paidStage)) ctx.addIssue({ code: 'custom', path: ['paidStage'], message: 'Choose one of the stages' });
    if (w.stages.some((s) => s.customerCanCancel) && !w.stages.some((s) => s.kind === 'cancelled')) {
      ctx.addIssue({ code: 'custom', path: ['stages'], message: 'Customers can cancel, so add a stage of kind "cancelled"' });
    }
  });
export type Workflow = z.output<typeof workflowSchema>;

type StageInput = z.input<typeof workflowStageSchema>;
const st = (key: string, en: string, fa: string, rest: Omit<StageInput, 'key' | 'label'> = {}): WorkflowStage =>
  workflowStageSchema.parse({ key, label: { en, fa }, ...rest });
const msg = (en: string, fa: string) => ({ en, fa });

/** Stages every request type gets unless it defines its own. */
export const DEFAULT_WORKFLOW: Workflow = {
  stages: [
    st('new', 'New', 'جدید', { customerLabel: msg('Received', 'ثبت شد'), color: 'blue', next: ['reviewing', 'cancelled'], customerCanCancel: true }),
    st('reviewing', 'Reviewing', 'در حال بررسی', { color: 'amber', next: ['awaiting_payment', 'in_progress', 'done', 'cancelled'], notify: true }),
    st('awaiting_payment', 'Awaiting payment', 'منتظر پرداخت', { color: 'violet', next: ['in_progress', 'cancelled'], notify: true, askPayment: true }),
    st('in_progress', 'In progress', 'در حال انجام', { color: 'amber', next: ['done', 'cancelled'], notify: true }),
    st('done', 'Done', 'انجام شد', { kind: 'done', color: 'green', next: [], notify: true, customerCanReply: false }),
    st('cancelled', 'Cancelled', 'لغو شد', { kind: 'cancelled', color: 'red', next: [], notify: true, customerCanReply: false }),
  ],
  paidStage: 'in_progress',
};

/** Ready-made workflows the operator can start from. */
export const WORKFLOW_PRESETS: { id: string; label: { en: string; fa: string }; hint: { en: string; fa: string }; workflow: Workflow }[] = [
  {
    id: 'standard',
    label: msg('Standard request', 'درخواست استاندارد'),
    hint: msg('Review, optional payment, work, done.', 'بررسی، پرداخت در صورت نیاز، انجام، پایان.'),
    workflow: DEFAULT_WORKFLOW,
  },
  {
    id: 'question',
    label: msg('Question / contact', 'سؤال / تماس'),
    hint: msg('A message that gets an answer and is closed.', 'پیامی که پاسخ داده و بسته می‌شود.'),
    workflow: {
      stages: [
        st('new', 'New', 'جدید', { customerLabel: msg('Received', 'دریافت شد'), color: 'blue', next: ['answered', 'closed'] }),
        st('answered', 'Answered', 'پاسخ داده شد', { color: 'green', next: ['closed', 'new'], notify: true }),
        st('closed', 'Closed', 'بسته شد', { kind: 'done', color: 'gray', next: [], customerCanReply: false }),
      ],
      paidStage: '',
    },
  },
  {
    id: 'booking',
    label: msg('Booking / reservation', 'رزرو / نوبت'),
    hint: msg('Confirm or decline a booking; the customer can cancel before the visit.', 'تأیید یا رد رزرو؛ مشتری تا قبل از مراجعه می‌تواند لغو کند.'),
    workflow: {
      stages: [
        st('new', 'Requested', 'درخواست شده', { customerLabel: msg('Waiting for confirmation', 'در انتظار تأیید'), color: 'blue', next: ['confirmed', 'declined'], customerCanCancel: true }),
        st('confirmed', 'Confirmed', 'تأیید شد', { color: 'green', next: ['attended', 'no_show', 'cancelled'], notify: true, customerCanCancel: true }),
        st('attended', 'Attended', 'انجام شد', { kind: 'done', color: 'green', next: [], customerCanReply: false }),
        st('no_show', 'Did not come', 'مراجعه نکرد', { kind: 'done', color: 'gray', visible: false, next: [], customerCanReply: false }),
        st('declined', 'Declined', 'رد شد', { kind: 'cancelled', color: 'red', next: [], notify: true, customerCanReply: false }),
        st('cancelled', 'Cancelled', 'لغو شد', { kind: 'cancelled', color: 'red', next: [], notify: true, customerCanReply: false }),
      ],
      paidStage: '',
    },
  },
  {
    id: 'quote',
    label: msg('Quote, pay, deliver', 'استعلام قیمت، پرداخت، تحویل'),
    hint: msg('Price the job, take payment, then do it.', 'قیمت‌گذاری، دریافت وجه و سپس انجام کار.'),
    workflow: {
      stages: [
        st('new', 'New', 'جدید', { customerLabel: msg('Received', 'ثبت شد'), color: 'blue', next: ['quoted', 'declined'], customerCanCancel: true }),
        st('quoted', 'Quote sent', 'پیش‌فاکتور ارسال شد', { color: 'violet', next: ['in_progress', 'declined', 'cancelled'], notify: true, askPayment: true, customerCanCancel: true }),
        st('in_progress', 'In progress', 'در حال انجام', { color: 'amber', next: ['delivered', 'cancelled'], notify: true }),
        st('delivered', 'Delivered', 'تحویل شد', { kind: 'done', color: 'green', next: [], notify: true }),
        st('declined', 'Declined', 'رد شد', { kind: 'cancelled', color: 'red', next: [], notify: true, customerCanReply: false }),
        st('cancelled', 'Cancelled', 'لغو شد', { kind: 'cancelled', color: 'red', next: [], notify: true, customerCanReply: false }),
      ],
      paidStage: 'in_progress',
    },
  },
  {
    id: 'paid',
    label: msg('Paid on submit', 'پرداخت هنگام ثبت'),
    hint: msg('The customer pays with the form, then it is done.', 'مشتری همراه فرم پرداخت می‌کند و سپس کار انجام می‌شود.'),
    workflow: {
      stages: [
        st('new', 'Awaiting payment', 'منتظر پرداخت', { color: 'violet', next: ['paid', 'cancelled'], customerCanCancel: true }),
        st('paid', 'Paid', 'پرداخت شد', { color: 'blue', next: ['done', 'cancelled'], notify: true }),
        st('done', 'Done', 'انجام شد', { kind: 'done', color: 'green', next: [], notify: true }),
        st('cancelled', 'Cancelled', 'لغو شد', { kind: 'cancelled', color: 'red', next: [], notify: true, customerCanReply: false }),
      ],
      paidStage: 'paid',
    },
  },
];

/** Stages a request may move to from `current` (any stage when `current` is no longer in the workflow). */
export function nextStages(workflow: Workflow, current: string): WorkflowStage[] {
  const here = workflow.stages.find((s) => s.key === current);
  if (!here) return workflow.stages.filter((s) => s.key !== current);
  return here.next.map((k) => workflow.stages.find((s) => s.key === k)!).filter(Boolean);
}

/** The stage a customer cancel moves to: the first stage of kind "cancelled". */
export const cancelStage = (workflow: Workflow) => workflow.stages.find((s) => s.kind === 'cancelled') ?? null;

/* ---------- request type: contact, payment, access ---------- */

export const requestContactSchema = z
  .object({
    email: z.enum(['required', 'optional', 'off']).default('required'),
    phone: z.enum(['required', 'optional', 'off']).default('optional'),
  })
  .default({})
  .refine((c) => c.email === 'required' || c.phone === 'required', 'Ask for at least an email or a phone number, so the request can be followed up');

export const requestPaymentSchema = z
  .object({
    /** The customer pays right after sending the form (when the total is above zero). */
    onSubmit: z.boolean().default(false),
    /** Base amount in the smallest unit of the currency (rials for IRR); the prices of answers are added to it. */
    amountMinor: z.number().int().min(0).max(1e13).default(0),
    currency: z.enum(CURRENCIES).default('IRR'),
    /** What the payment is for (shown to the customer). */
    title: loc(120),
  })
  .default({});

/** How a form looks and reads: columns, button and thank-you texts, step labels. Empty texts use the site's own. */
export const formLayoutSchema = z
  .object({
    columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
    submitLabel: loc(80),
    nextLabel: loc(60),
    backLabel: loc(60),
    successTitle: loc(200),
    successText: loc(1000),
    /** Show "step 2 of 3" and the step titles above a multi-step form. */
    showProgress: z.boolean().default(true),
  })
  .default({});

export type FormLayout = z.output<typeof formLayoutSchema>;

/** Who may send the form: anyone, or only visitors signed in to their account. */
export const REQUEST_ACCESS = ['anyone', 'signed_in'] as const;

/* ---------- answers ---------- */

export type AnswerValue = string | string[] | boolean;
export type Answers = Record<string, AnswerValue>;
export const answersSchema = z.record(z.string().max(40), z.union([z.string().max(4000), z.array(z.string().max(200)).max(30), z.boolean()])).default({});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^(\+?\d{1,3}[\s-]?)?\d[\d\s-]{7,14}$/;

const optionLabels = (f: FormField) => f.options.flatMap((o) => [o.en, o.fa].filter(Boolean));

/** Whether a field is shown, given the answers so far (a hidden field's condition hides it too). */
export function fieldVisible(field: FormField, fields: FormField[], answers: Answers, depth = 0): boolean {
  if (!field.showIf || depth > 5) return true;
  const parent = fields.find((f) => f.id === field.showIf!.field);
  if (!parent || !fieldVisible(parent, fields, answers, depth + 1)) return false;
  const v = answers[parent.id];
  const wanted = field.showIf.value;
  if (typeof v === 'boolean') return (v ? '✓' : '') === wanted;
  if (Array.isArray(v)) return v.includes(wanted) || v.some((x) => parent.options.some((o) => (o.en === x || o.fa === x) && (o.en === wanted || o.fa === wanted)));
  if (v === wanted) return true;
  // The visitor's language may differ from the language the condition was written in.
  return parent.options.some((o) => (o.en === v || o.fa === v) && (o.en === wanted || o.fa === wanted));
}

export interface AnswerIssue {
  field: string;
  problem: 'required' | 'email' | 'phone' | 'number' | 'option' | 'min' | 'max' | 'pattern' | 'date';
  /** The limit that was not met (min / max problems), or the pattern name. */
  limit?: number | string;
}

/** Fields that take an answer (not headings or step breaks). */
export const isQuestion = (f: FormField) => f.type !== 'heading' && f.type !== 'step';

/** Iranian national id (کد ملی): 10 digits with a check digit. */
function validNationalId(v: string) {
  if (!/^\d{10}$/.test(v) || /^(\d)\1{9}$/.test(v)) return false;
  const sum = [...v.slice(0, 9)].reduce((acc, d, i) => acc + Number(d) * (10 - i), 0) % 11;
  const check = Number(v[9]);
  return sum < 2 ? check === sum : check === 11 - sum;
}

const PATTERN_TESTS: Record<string, (v: string) => boolean> = {
  digits: (v) => /^\d+$/.test(v),
  nationalId: validNationalId,
  postalCode: (v) => /^\d{10}$/.test(v),
  iban: (v) => /^IR\d{24}$/i.test(v.replace(/\s/g, '')),
  persian: (v) => /^[؀-ۿ‌\s0-9۰-۹.,،()-]+$/.test(v),
  latin: (v) => /^[A-Za-z0-9\s.,'()-]+$/.test(v),
};

/** Today plus `days`, as yyyy-mm-dd (dates are compared as text). */
const dayFromToday = (days: number, today = new Date()) => {
  const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + days));
  return d.toISOString().slice(0, 10);
};

/** Files a file question accepts at most (its `max`, else 5). */
export const maxFiles = (f: FormField) => Math.max(1, Math.min(10, f.max ?? 5));

/** Checks answers against a form's fields; the same rules run in the browser and on the server. */
export function checkAnswers(fields: FormField[], answers: Answers, today = new Date()): AnswerIssue[] {
  const issues: AnswerIssue[] = [];
  for (const f of fields) {
    if (!isQuestion(f) || !fieldVisible(f, fields, answers)) continue;
    const v = answers[f.id];
    const empty = v === undefined || v === false || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
    if (empty) {
      if (f.required) issues.push({ field: f.id, problem: 'required' });
      continue;
    }
    const s = typeof v === 'string' ? v.trim() : '';
    const push = (problem: AnswerIssue['problem'], limit?: number | string) => issues.push({ field: f.id, problem, ...(limit !== undefined ? { limit } : {}) });
    if (f.type === 'email' && !EMAIL.test(s)) push('email');
    else if (f.type === 'tel' && !PHONE.test(s)) push('phone');
    else if (f.type === 'number') {
      if (!/^-?\d+(\.\d+)?$/.test(s)) push('number');
      else if (f.min !== null && Number(s) < f.min) push('min', f.min);
      else if (f.max !== null && Number(s) > f.max) push('max', f.max);
    } else if ((f.type === 'select' || f.type === 'radio') && !optionLabels(f).includes(s)) push('option');
    else if (f.type === 'checkboxes') {
      if (!Array.isArray(v) || v.some((x) => !optionLabels(f).includes(x))) push('option');
      else if (f.min !== null && v.length < f.min) push('min', f.min);
      else if (f.max !== null && v.length > f.max) push('max', f.max);
    } else if (f.type === 'file') {
      if (!Array.isArray(v)) push('option');
      else if (v.length > maxFiles(f)) push('max', maxFiles(f));
      else if (f.min !== null && v.length < f.min) push('min', f.min);
    } else if (f.type === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) push('date');
      else if (f.min !== null && s < dayFromToday(f.min, today)) push('min', dayFromToday(f.min, today));
      else if (f.max !== null && s > dayFromToday(f.max, today)) push('max', dayFromToday(f.max, today));
    } else if (f.type === 'text' || f.type === 'textarea') {
      if (f.min !== null && s.length < f.min) push('min', f.min);
      else if (f.max !== null && s.length > f.max) push('max', f.max);
      else if (f.pattern && PATTERN_TESTS[f.pattern] && !PATTERN_TESTS[f.pattern](s)) push('pattern', f.pattern);
    }
  }
  return issues;
}

const asciiDigits = (v: string) => v.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/** Answers trimmed, with Persian / Arabic digits as ASCII where digits matter; unknown keys dropped. */
export function normalizeAnswers(fields: FormField[], answers: Answers): Answers {
  const out: Answers = {};
  for (const f of fields) {
    const v = answers[f.id];
    if (v === undefined || !isQuestion(f)) continue;
    const digits = ['number', 'tel', 'date', 'time'].includes(f.type) || ['digits', 'nationalId', 'postalCode', 'iban'].includes(f.pattern);
    out[f.id] = typeof v === 'string' ? (digits ? asciiDigits(v.trim()) : v.trim()) : v;
  }
  return out;
}

/** Answers as the staff read them: label and value of each shown, answered field (`fileNames` for uploads). */
export function labelledAnswers(fields: FormField[], answers: Answers, locale: 'en' | 'fa', fileNames: Record<string, string> = {}) {
  return fields
    .filter((f) => isQuestion(f) && fieldVisible(f, fields, answers))
    .map((f) => {
      const v = answers[f.id];
      const value = typeof v === 'boolean' ? (v ? '✓' : '') : Array.isArray(v) ? (f.type === 'file' ? v.map((id) => fileNames[id] ?? id) : v).join('، ') : String(v ?? '').trim();
      return { field: f.id, label: f.label[locale] || f.label.en || f.label.fa || f.id, value };
    })
    .filter((a) => a.value);
}

/** The customer's name, phone and email from the fields marked for them. */
export function contactFromAnswers(fields: FormField[], answers: Answers): { name: string; phone: string; email: string } {
  const pick = (role: string) => {
    const f = fields.find((x) => x.role === role && fieldVisible(x, fields, answers));
    const v = f ? answers[f.id] : undefined;
    return typeof v === 'string' ? v.trim() : '';
  };
  return { name: pick('name'), phone: pick('phone'), email: pick('email').toLowerCase() };
}

/**
 * The amount to pay for these answers: the base amount plus the price of each chosen option and
 * ticked box, and price × number for priced number questions. Hidden questions add nothing.
 */
export function computeTotal(fields: FormField[], answers: Answers, baseMinor = 0): number {
  let total = baseMinor;
  const priceOf = (f: FormField, label: string) => f.options.find((o) => o.en === label || o.fa === label)?.price ?? 0;
  for (const f of fields) {
    if (!isQuestion(f) || !fieldVisible(f, fields, answers)) continue;
    const v = answers[f.id];
    if (f.type === 'checkbox' && v === true) total += f.price;
    else if (f.type === 'number' && f.price > 0 && typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim())) total += Math.round(Number(v) * f.price);
    else if ((f.type === 'select' || f.type === 'radio') && typeof v === 'string') total += priceOf(f, v);
    else if (f.type === 'checkboxes' && Array.isArray(v)) for (const x of v) total += priceOf(f, x);
  }
  return Math.max(0, Math.round(total));
}

/** Whether any answer can change the price (the form then shows a running total). */
export const hasPrices = (fields: FormField[]) => fields.some((f) => f.price > 0 || f.options.some((o) => o.price > 0));

/* ---------- accounts and notifications (site settings) ---------- */

export const accountsSchema = z
  .object({
    /** Visitors can sign up and sign in to see their requests and orders. */
    enabled: z.boolean().default(false),
    /** What an account is identified (and verified) by. */
    identifier: z.enum(['phone', 'email']).default('phone'),
    /** Accounts may set a password; signing in with a one-time code always works. */
    passwords: z.boolean().default(true),
    signupVerification: z.boolean().default(true),
  })
  .default({});
export type AccountsSettings = z.output<typeof accountsSchema>;

export const notificationsSchema = z
  .object({
    /** Email the staff about new requests, orders and customer messages. */
    staff: z.boolean().default(true),
    /** Addresses to email; empty = the site owners' account emails. */
    emails: z.array(z.string().trim().toLowerCase().email().max(254)).max(5).default([]),
  })
  .default({});

/* ---------- requests, events and timeline ---------- */

/** Prefix of a request's tracking code (R1001); orders use their plain number. */
export const REQUEST_CODE_PREFIX = 'R';
export const requestCode = (n: string | number) => `${REQUEST_CODE_PREFIX}${n}`;

/** A tracking code as typed by a visitor: "R1001", "r-1001", "#1001", "1001", Persian digits too. */
export function parseTrackingCode(raw: string): { kind: 'request' | 'order'; number: string } | null {
  const s = raw
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .trim()
    .toUpperCase()
    .replace(/[\s#-]/g, '');
  const m = s.match(/^([RO]?)(\d{1,12})$/);
  if (!m) return null;
  return { kind: m[1] === 'R' ? 'request' : 'order', number: m[2] };
}

export const EVENT_KINDS = ['created', 'stage', 'note', 'message', 'customer_message', 'payment_requested', 'payment', 'cancelled_by_customer', 'assigned'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const staffEventSchema = z.object({
  kind: z.enum(['note', 'message']),
  text: z.string().trim().min(1).max(4000),
});

export const stageChangeSchema = z.object({
  stage: stageKeySchema,
  /** Text for the customer with this change; empty = the stage's own message (when it notifies). */
  message: z.string().trim().max(1000).default(''),
  /** Send SMS / email (defaults to the stage's setting). */
  notify: z.boolean().optional(),
  /** Payment to ask for with this change (stages with "ask for payment"). */
  payment: z.object({ amountMinor: z.number().int().min(1).max(1e13), title: z.string().trim().max(120).default('') }).optional(),
});

export const paymentRequestSchema = z.object({
  amountMinor: z.number().int().min(1).max(1e13),
  title: z.string().trim().max(120).default(''),
  notify: z.boolean().default(true),
});

export const requestUpdateSchema = z.object({
  assigneeUserId: z.string().uuid().nullable().optional(),
  read: z.boolean().optional(),
});

export const customerMessageSchema = z.object({
  token: z.string().max(200).optional(),
  text: z.string().trim().min(1).max(2000),
});

/** Fills {{number}}, {{name}}, {{stage}}, {{amount}}, {{link}} and {{site}} in a message. */
export function fillTemplate(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (all, key: string) => (key in values ? values[key] : all));
}

/** Standard texts when a stage or order stage has no message of its own. */
export const STANDARD_MESSAGES = {
  stage: msg('{{site}}: your request {{number}} is now "{{stage}}". {{link}}', '{{site}}: وضعیت درخواست {{number}} شما «{{stage}}» شد. {{link}}'),
  orderStage: msg('{{site}}: your order {{number}} is now "{{stage}}". {{link}}', '{{site}}: وضعیت سفارش {{number}} شما «{{stage}}» شد. {{link}}'),
  payment: msg('{{site}}: please pay {{amount}} for request {{number}}. {{link}}', '{{site}}: لطفاً مبلغ {{amount}} را برای درخواست {{number}} پرداخت کنید. {{link}}'),
  reply: msg('{{site}}: new message about {{number}}: {{text}} {{link}}', '{{site}}: پیام جدید درباره‌ی {{number}}: {{text}} {{link}}'),
  received: msg('{{site}}: we received your request {{number}}. Track it here: {{link}}', '{{site}}: درخواست شما با کد {{number}} ثبت شد. پیگیری: {{link}}'),
};

/* ---------- customer accounts ---------- */

const identifierSchema = z.string().trim().min(5).max(254);
export const customerCodeSchema = z.object({ identifier: identifierSchema, purpose: z.enum(['signup', 'login', 'reset']) });
export const customerSignupSchema = z.object({
  identifier: identifierSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code').optional(),
  name: z.string().trim().min(2).max(120),
  password: z.string().min(8).max(200).optional(),
});
export const customerLoginSchema = z
  .object({ identifier: identifierSchema, password: z.string().max(200).optional(), code: z.string().trim().regex(/^\d{6}$/).optional() })
  .refine((v) => !!v.password !== !!v.code, 'Enter a password or a code');
export const customerResetSchema = z.object({ identifier: identifierSchema, code: z.string().trim().regex(/^\d{6}$/), password: z.string().min(8).max(200) });
export const instagramConnectionSchema = z.object({
  username: z.string().trim().regex(/^@?[A-Za-z0-9._]{1,30}$/),
  password: z.string().min(1).max(200).optional(),
});
export const instagramConnectionActionSchema = z.object({
  action: z.enum(['login','disconnect','code']),
  code: z.string().trim().regex(/^\d{6,8}$/).optional(),
});
export const customerAddressSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(60),
  address: z.string().trim().min(5).max(1000),
});
export const customerProfileSchema = z.object({
  addresses: z.array(customerAddressSchema).max(10).optional(),
  name: z.string().trim().min(2).max(120).optional(),
  /** The other way to reach the customer (email when the account is a phone, or the other way round). */
  email: z.union([z.string().trim().toLowerCase().email().max(254), z.literal('')]).optional(),
  phone: z.union([z.string().trim().regex(PHONE), z.literal('')]).optional(),
  password: z.string().min(8).max(200).optional(),
  currentPassword: z.string().max(200).optional(),
});

/** Persian / Arabic digits to ASCII, spaces and dashes removed: "۰۹۱۲ ۳۴۵ ۶۷۸۹" → "09123456789". */
export function normalizePhone(raw: string): string {
  return raw
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[\s()-]/g, '')
    .replace(/^\+98/, '0')
    .replace(/^0098/, '0');
}

/** Normalized email or phone, or null when it is neither. */
export function normalizeIdentifier(raw: string, kind: 'phone' | 'email'): string | null {
  if (kind === 'email') {
    const e = raw.trim().toLowerCase();
    return EMAIL.test(e) ? e : null;
  }
  const p = normalizePhone(raw);
  return /^\+?\d{8,15}$/.test(p) ? p : null;
}
