import {
  CURRENCIES,
  currencyDecimals,
  DEFAULT_REQUEST_TYPES,
  DEFAULT_WORKFLOW,
  FIELD_PATTERNS,
  FILE_KINDS,
  FORM_FIELD_TYPES,
  formFieldSchema,
  nameField,
  phoneField,
  emailField,
  consentField,
  siteSettingsSchema,
  STAGE_COLORS,
  STAGE_KINDS,
  WORKFLOW_PRESETS,
  fillTemplate,
  STANDARD_MESSAGES,
  type FormField,
  type RequestType,
  type FormFieldType,
  type SiteSettings,
  type Workflow,
  type WorkflowStage,
} from '@site-builder/shared';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { cn } from '../../lib/cn';
import { PreferencesProvider, usePreferences } from '../../lib/preferences';
import { ProgressSteps } from '../../features/account/CaseView';
import { CustomRequestForm } from '../../features/leads/CustomRequestForm';
import { SiteIdContext } from '../../features/public-site/data';
import { Badge, Checkbox, IconButton, LocalizedField, Modal, SelectField, TextField } from '../ui';
import { L, STAGE_CHIP, STAGE_DOT, StageChip, useL, type Lbl } from './common';

type RequestTypeDraft = SiteSettings['requestTypes'][number];
const empty = { en: '', fa: '' };
const toSlug = (v: string) => v.toLowerCase().replace(/[^a-z0-9_-]/g, '');
const typeSchema = siteSettingsSchema.shape.requestTypes.removeDefault().element;

export const FIELD_LABELS: Record<FormFieldType, Lbl> = {
  text: L('Short text', 'متن کوتاه'),
  textarea: L('Long text', 'متن بلند'),
  email: L('Email', 'ایمیل'),
  tel: L('Phone', 'تلفن'),
  number: L('Number', 'عدد'),
  date: L('Date', 'تاریخ'),
  time: L('Time', 'ساعت'),
  select: L('Drop-down (one choice)', 'فهرست کشویی (یک انتخاب)'),
  radio: L('Options (one choice)', 'گزینه‌ها (یک انتخاب)'),
  checkboxes: L('Options (several choices)', 'گزینه‌ها (چند انتخاب)'),
  checkbox: L('Tick box', 'تیک تأیید'),
  file: L('File upload', 'بارگذاری فایل'),
  heading: L('Heading / text', 'عنوان / متن توضیحی'),
  step: L('New step (next page)', 'مرحله‌ی جدید (صفحه‌ی بعد)'),
};

const KIND_LABELS: Record<WorkflowStage['kind'], Lbl> = {
  open: L('In progress (open)', 'در جریان (باز)'),
  done: L('Finished', 'پایان موفق'),
  cancelled: L('Cancelled / declined', 'لغو / رد'),
};

const COLOR_LABELS: Record<(typeof STAGE_COLORS)[number], Lbl> = {
  gray: L('Gray', 'خاکستری'),
  blue: L('Blue', 'آبی'),
  amber: L('Amber', 'نارنجی'),
  violet: L('Violet', 'بنفش'),
  green: L('Green', 'سبز'),
  red: L('Red', 'قرمز'),
};

const PATTERN_LABELS: Record<(typeof FIELD_PATTERNS)[number], Lbl> = {
  '': L('No check', 'بدون بررسی'),
  digits: L('Digits only', 'فقط عدد'),
  nationalId: L('National id (کد ملی)', 'کد ملی'),
  postalCode: L('Postal code (10 digits)', 'کد پستی (۱۰ رقم)'),
  iban: L('IBAN (Sheba)', 'شماره شبا'),
  persian: L('Persian text', 'متن فارسی'),
  latin: L('English letters', 'حروف انگلیسی'),
};

const withChoices = (type: FormFieldType) => type === 'select' || type === 'radio' || type === 'checkboxes';
const isInput = (type: FormFieldType) => type !== 'heading' && type !== 'step';

/** A number box that may be empty (null = no limit). */
function LimitField({ label, value, onChange, hint }: { label: string; value: number | null; onChange: (v: number | null) => void; hint?: string }) {
  return (
    <TextField
      label={label}
      dir="ltr"
      hint={hint}
      value={value === null ? '' : String(value)}
      onChange={(v) => {
        const n = Number(v.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
        onChange(v.trim() === '' || !Number.isFinite(n) ? null : n);
      }}
    />
  );
}

/** A price typed in the currency's major unit, stored in its smallest unit. */
function PriceField({ label, value, onChange, currency, hint }: { label: string; value: number; onChange: (v: number) => void; currency: string; hint?: string }) {
  const decimals = currencyDecimals(currency);
  return (
    <TextField
      label={`${label} (${currency})`}
      dir="ltr"
      hint={hint}
      value={value ? String(value / 10 ** decimals) : ''}
      onChange={(v) => {
        const n = Number(v.replace(/[,٬\s]/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
        onChange(Number.isFinite(n) && n > 0 ? Math.round(n * 10 ** decimals) : 0);
      }}
    />
  );
}

/* ---------- form builder ---------- */

function FieldEditor({ field, fields, onChange, currency, priced }: { field: FormField; fields: FormField[]; onChange: (f: FormField) => void; currency: string; priced: boolean }) {
  const t = useL();
  const { l } = usePreferences();
  const parent = field.showIf ? fields.find((f) => f.id === field.showIf!.field) : undefined;
  const others = fields.filter((f) => f.id !== field.id && (withChoices(f.type) || f.type === 'checkbox'));
  const set = (patch: Partial<FormField>) => onChange({ ...field, ...patch });
  const limits: Partial<Record<FormFieldType, [Lbl, Lbl, Lbl?]>> = {
    text: [L('Fewest characters', 'حداقل کاراکتر'), L('Most characters', 'حداکثر کاراکتر')],
    textarea: [L('Fewest characters', 'حداقل کاراکتر'), L('Most characters', 'حداکثر کاراکتر')],
    number: [L('Smallest value', 'کمترین مقدار'), L('Largest value', 'بیشترین مقدار')],
    date: [L('Earliest (days from today)', 'زودترین (روز از امروز)'), L('Latest (days from today)', 'دیرترین (روز از امروز)'), L('0 = today, 1 = tomorrow, -30 = a month ago', '۰ = امروز، ۱ = فردا، ۳۰- = یک ماه قبل')],
    checkboxes: [L('Choose at least', 'حداقل انتخاب'), L('Choose at most', 'حداکثر انتخاب')],
    file: [L('Fewest files', 'حداقل فایل'), L('Most files (up to 10)', 'حداکثر فایل (تا ۱۰)')],
  };
  const lim = limits[field.type];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <SelectField label={t(L('Type', 'نوع'))} value={field.type} onChange={(type) => set({ type, role: type === 'text' || type === 'tel' || type === 'email' ? field.role : '' })} options={FORM_FIELD_TYPES.map((x) => ({ value: x, label: t(FIELD_LABELS[x]) }))} />
        <TextField label={t(L('Key (English)', 'کلید (انگلیسی)'))} dir="ltr" value={field.id} onChange={(id) => set({ id: toSlug(id) })} hint={t(L('Used in reports and conditions', 'برای گزارش‌ها و شرط‌ها'))} />
      </div>
      <LocalizedField
        label={field.type === 'step' ? t(L('Step title', 'عنوان مرحله')) : field.type === 'heading' ? t(L('Heading', 'عنوان')) : field.type === 'checkbox' ? t(L('Text next to the box', 'متن کنار تیک')) : t(L('Question', 'سؤال'))}
        value={field.label}
        onChange={(label) => set({ label })}
      />
      {field.type !== 'step' && (
        <LocalizedField label={field.type === 'heading' ? t(L('Text (paragraph)', 'متن (پاراگراف)')) : t(L('Help text (optional)', 'راهنما (اختیاری)'))} value={field.help} onChange={(help) => set({ help })} multiline={field.type === 'heading'} rows={3} />
      )}
      {field.type === 'step' && <p className="text-xs text-ink-soft">{t(L('Questions after this line show on a new page, with Next and Back buttons.', 'سؤال‌های بعد از این خط در صفحه‌ی جدید با دکمه‌های «بعدی» و «قبلی» نمایش داده می‌شوند.'))}</p>}

      {(field.type === 'text' || field.type === 'tel' || field.type === 'email') && (
        <SelectField
          label={t(L('Used for', 'کاربرد این پاسخ'))}
          value={field.role}
          onChange={(role) => set({ role })}
          options={[
            { value: '', label: t(L('An ordinary answer', 'پاسخ معمولی')) },
            ...(field.type === 'text' ? [{ value: 'name' as const, label: t(L('The customer’s name', 'نام مشتری')) }] : []),
            ...(field.type === 'tel' ? [{ value: 'phone' as const, label: t(L('Follow-up phone (SMS, tracking)', 'تلفن پیگیری (پیامک و پیگیری)')) }] : []),
            ...(field.type === 'email' ? [{ value: 'email' as const, label: t(L('Follow-up email', 'ایمیل پیگیری')) }] : []),
          ]}
        />
      )}

      {withChoices(field.type) && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium text-ink-soft">{t(L('Choices', 'گزینه‌ها'))}</legend>
          {field.options.map((o, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded-md border border-line p-2">
              <div className="min-w-0 flex-1">
                <LocalizedField label={`${t(L('Choice', 'گزینه'))} ${i + 1}`} value={o} onChange={(v) => set({ options: field.options.map((x, j) => (j === i ? { ...x, ...v } : x)) })} />
              </div>
              {priced && (
                <div className="w-40">
                  <PriceField label={t(L('Price', 'قیمت'))} currency={currency} value={o.price} onChange={(price) => set({ options: field.options.map((x, j) => (j === i ? { ...x, price } : x)) })} />
                </div>
              )}
              <IconButton label="↑" disabled={i === 0} onClick={() => set({ options: field.options.map((x, j, a) => (j === i - 1 ? a[i] : j === i ? a[i - 1] : x)) })}>
                ↑
              </IconButton>
              <IconButton label={t(L('Remove', 'حذف'))} onClick={() => set({ options: field.options.filter((_, j) => j !== i) })}>
                ✕
              </IconButton>
            </div>
          ))}
          <button type="button" onClick={() => set({ options: [...field.options, { en: '', fa: '', price: 0 }] })} className="self-start rounded-md border border-dashed border-line px-3 py-1 text-sm text-ink-soft hover:border-ink hover:text-ink">
            + {t(L('Add choice', 'افزودن گزینه'))}
          </button>
        </fieldset>
      )}

      {field.type === 'file' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-medium text-ink-soft">{t(L('Allowed files', 'فایل‌های مجاز'))}</legend>
            {FILE_KINDS.map((k) => (
              <Checkbox
                key={k}
                label={k === 'image' ? t(L('Images (JPG, PNG, WebP, GIF)', 'عکس (JPG، PNG، WebP، GIF)')) : 'PDF'}
                checked={field.files.kinds.includes(k)}
                onChange={(on) => {
                  const kinds = on ? [...field.files.kinds, k] : field.files.kinds.filter((x) => x !== k);
                  if (kinds.length) set({ files: { ...field.files, kinds } });
                }}
              />
            ))}
          </fieldset>
          <SelectField
            label={t(L('Largest file', 'حداکثر حجم هر فایل'))}
            value={String(field.files.maxMb)}
            onChange={(v) => set({ files: { ...field.files, maxMb: Number(v) } })}
            options={[1, 2, 5, 10].map((n) => ({ value: String(n), label: `${n} MB` }))}
          />
        </div>
      )}

      {isInput(field.type) && (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Checkbox label={t(L('Required', 'اجباری'))} checked={field.required} onChange={(required) => set({ required })} />
        </div>
      )}

      {(field.type === 'text' || field.type === 'textarea' || field.type === 'tel' || field.type === 'email' || field.type === 'number' || field.type === 'select') && (
        <LocalizedField label={field.type === 'select' ? t(L('Text before a choice is made', 'متن پیش از انتخاب')) : t(L('Placeholder (example inside the box)', 'متن راهنمای داخل کادر'))} value={field.placeholder} onChange={(placeholder) => set({ placeholder })} />
      )}

      {lim && (
        <div className="grid gap-3 sm:grid-cols-2">
          <LimitField label={t(lim[0])} value={field.min} onChange={(min) => set({ min })} hint={lim[2] ? t(lim[2]) : t(L('Empty = no limit', 'خالی = بدون محدودیت'))} />
          <LimitField label={t(lim[1])} value={field.max} onChange={(max) => set({ max })} />
        </div>
      )}

      {field.type === 'text' && (
        <SelectField label={t(L('Check the answer as', 'بررسی پاسخ به‌صورت'))} value={field.pattern} onChange={(pattern) => set({ pattern })} options={FIELD_PATTERNS.map((p) => ({ value: p, label: t(PATTERN_LABELS[p]) }))} />
      )}

      {priced && field.type === 'checkbox' && <PriceField label={t(L('Price when ticked', 'قیمت در صورت تیک'))} currency={currency} value={field.price} onChange={(price) => set({ price })} />}
      {priced && field.type === 'number' && (
        <PriceField
          label={t(L('Price per unit', 'قیمت هر واحد'))}
          currency={currency}
          value={field.price}
          onChange={(price) => set({ price })}
          hint={t(L('Total adds this × the number. Use 1 to let the customer type the amount to pay.', 'این مبلغ × عدد واردشده به جمع اضافه می‌شود. با ۱، مشتری خودش مبلغ پرداخت را وارد می‌کند.'))}
        />
      )}

      {field.type !== 'step' && (
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField
            label={t(L('Width', 'عرض'))}
            value={field.width}
            onChange={(width) => set({ width })}
            options={[
              { value: 'auto', label: t(L('Automatic', 'خودکار')) },
              { value: 'half', label: t(L('One column', 'یک ستون')) },
              { value: 'full', label: t(L('Whole row', 'تمام سطر')) },
            ]}
          />
          <SelectField
            label={t(L('Show only when…', 'فقط وقتی نمایش بده که…'))}
            value={field.showIf?.field ?? ''}
            onChange={(v) => set({ showIf: v ? { field: v, value: '' } : null })}
            options={[{ value: '', label: t(L('Always shown', 'همیشه نمایش داده شود')) }, ...others.map((f) => ({ value: f.id, label: l(f.label) || f.id }))]}
          />
          {field.showIf && parent && (
            <SelectField
              label={t(L('…its answer is', '…پاسخ آن این باشد'))}
              value={field.showIf.value}
              onChange={(value) => set({ showIf: { field: field.showIf!.field, value } })}
              options={[{ value: '', label: '—' }, ...(parent.type === 'checkbox' ? [{ value: '✓', label: t(L('Ticked', 'تیک خورده')) }] : parent.options.map((o) => ({ value: o.fa || o.en, label: l(o) || o.en })))]}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Ready-made questions for the "add" bar: a type, or a common question with its settings. */
const QUICK: { key: string; label: Lbl; make: () => Partial<FormField> & { type: FormFieldType } }[] = [
  { key: 'name', label: L('Customer name', 'نام مشتری'), make: () => ({ type: 'text', role: 'name', required: true, label: L('Full name', 'نام و نام خانوادگی') }) },
  { key: 'phone', label: L('Follow-up mobile', 'موبایل پیگیری'), make: () => ({ type: 'tel', role: 'phone', required: true, label: L('Mobile number', 'شماره موبایل') }) },
  { key: 'email', label: L('Follow-up email', 'ایمیل پیگیری'), make: () => ({ type: 'email', role: 'email', label: L('Email', 'ایمیل') }) },
  { key: 'consent', label: L('Consent box', 'تیک موافقت'), make: () => ({ type: 'checkbox', required: true, width: 'full', label: L('I agree to be contacted about this enquiry.', 'موافقم برای این درخواست با من تماس گرفته شود.') }) },
  { key: 'national', label: L('National id', 'کد ملی'), make: () => ({ type: 'text', pattern: 'nationalId', label: L('National id', 'کد ملی') }) },
  { key: 'amount', label: L('Amount the customer pays', 'مبلغی که مشتری وارد می‌کند'), make: () => ({ type: 'number', required: true, min: 1, price: 1, label: L('Amount', 'مبلغ') }) },
];

/** Builds a form: questions in order, each collapsible, with conditions, checks, prices and pages. */
export function FormBuilder({ value, onChange, currency, priced }: { value: FormField[]; onChange: (v: FormField[]) => void; currency: string; priced: boolean }) {
  const t = useL();
  const { l } = usePreferences();
  const [open, setOpen] = useState<number | null>(null);
  const add = (input: Partial<FormField> & { type: FormFieldType }, quickKey?: string) => {
    let id = quickKey && !value.some((f) => f.id === quickKey) ? quickKey : `${input.type}-${value.length + 1}`;
    while (value.some((f) => f.id === id)) id = `${id}x`;
    const field = formFieldSchema.parse({
      id,
      label: { en: '', fa: '' },
      options: withChoices(input.type) ? [{ en: 'Option 1', fa: 'گزینه ۱' }] : [],
      ...input,
    });
    onChange([...value, field]);
    setOpen(value.length);
  };
  const move = (i: number, d: number) => {
    const next = [...value];
    const [f] = next.splice(i, 1);
    next.splice(i + d, 0, f);
    onChange(next);
    setOpen(i + d);
  };
  const ids = value.map((f) => f.id);
  const hasFollowUp = value.some((f) => f.role === 'phone' || f.role === 'email');
  let page = 1;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-soft">
        {t(L('Every question of the form is here: add, remove and reorder anything. Mark which answers are the customer’s name, phone and email so the request can be followed up.', 'همه‌ی سؤال‌های فرم این‌جاست: هر چیزی را اضافه، حذف یا جابه‌جا کنید. مشخص کنید کدام پاسخ نام، تلفن و ایمیل مشتری است تا پیگیری ممکن شود.'))}
      </p>
      {!hasFollowUp && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs">
          {t(L('No follow-up phone or email: the customer can follow the request only with its link or their account, and gets no SMS.', 'تلفن یا ایمیل پیگیری ندارد: مشتری فقط با لینک یا حساب کاربری پیگیری می‌کند و پیامکی نمی‌گیرد.'))}
        </p>
      )}
      <ol className="flex flex-col gap-2">
        {value.map((f, i) => {
          const dup = ids.indexOf(f.id) !== i;
          if (f.type === 'step') page++;
          return (
            <li key={i} className={cn('rounded-lg border', f.type === 'step' ? 'border-dashed border-ink/40 bg-surface-2' : 'bg-bg', open === i ? 'border-ink/40' : f.type === 'step' ? '' : 'border-line')}>
              <div className="flex items-center gap-2 px-3 py-2">
                <button type="button" className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-start text-sm" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                  {f.type === 'step' ? (
                    <span className="font-medium">
                      ⤵ {t(L('Page', 'صفحه'))} {page}: {l(f.label) || '—'}
                    </span>
                  ) : (
                    <>
                      <span className="text-xs text-ink-soft">{i + 1}.</span>
                      <span className={cn('truncate', f.type === 'heading' && 'font-semibold')}>{l(f.label) || <em className="text-ink-soft">{t(L('(no text yet)', '(بدون متن)'))}</em>}</span>
                      <Badge>{t(FIELD_LABELS[f.type])}</Badge>
                      {f.role && <Badge tone="accent">{f.role === 'name' ? t(L('name', 'نام')) : f.role === 'phone' ? t(L('follow-up phone', 'تلفن پیگیری')) : t(L('follow-up email', 'ایمیل پیگیری'))}</Badge>}
                      {f.required && <span className="text-danger">*</span>}
                      {f.showIf && <span className="text-[11px] text-ink-soft">↳ {t(L('conditional', 'شرطی'))}</span>}
                      {(f.price > 0 || f.options.some((o) => o.price > 0)) && <span title="price">💳</span>}
                    </>
                  )}
                  {dup && <span className="text-[11px] text-danger">{t(L('duplicate key', 'کلید تکراری'))}</span>}
                </button>
                <IconButton label="↑" disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </IconButton>
                <IconButton label="↓" disabled={i === value.length - 1} onClick={() => move(i, 1)}>
                  ↓
                </IconButton>
                <IconButton label={t(L('Duplicate', 'تکثیر'))} disabled={value.length >= 30} onClick={() => add({ ...f, label: { ...f.label } })}>
                  ⧉
                </IconButton>
                <IconButton label={t(L('Remove', 'حذف'))} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                  ✕
                </IconButton>
              </div>
              {open === i && (
                <div className="border-t border-line p-3">
                  <FieldEditor field={f} fields={value} currency={currency} priced={priced} onChange={(nf) => onChange(value.map((x, j) => (j === i ? nf : x)))} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {value.length < 30 && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-line p-3">
          <div className="flex flex-wrap gap-2">
            <span className="self-center text-xs text-ink-soft">{t(L('Add a question:', 'افزودن سؤال:'))}</span>
            {(['text', 'textarea', 'number', 'date', 'time', 'select', 'radio', 'checkboxes', 'checkbox', 'tel', 'email', 'file', 'heading', 'step'] as const).map((type) => (
              <button key={type} type="button" onClick={() => add({ type })} className="rounded-full border border-line px-3 py-1 text-xs text-ink-soft hover:border-ink hover:text-ink">
                + {t(FIELD_LABELS[type])}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="self-center text-xs text-ink-soft">{t(L('Ready-made:', 'آماده:'))}</span>
            {QUICK.map((q) => (
              <button key={q.key} type="button" onClick={() => add(q.make(), q.key)} className="rounded-full border border-dashed border-line px-3 py-1 text-xs text-ink-soft hover:border-ink hover:text-ink">
                + {t(q.label)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- workflow ---------- */

function StageEditor({ stage, stages, onChange, operator, isFirst }: { stage: WorkflowStage; stages: WorkflowStage[]; onChange: (s: WorkflowStage) => void; operator: boolean; isFirst: boolean }) {
  const t = useL();
  const { l } = usePreferences();
  const others = stages.filter((s) => s.key !== stage.key);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <LocalizedField label={t(L('Name (for staff)', 'نام (برای کارکنان)'))} value={stage.label} onChange={(label) => onChange({ ...stage, label })} />
        <LocalizedField label={t(L('Name the customer sees (optional)', 'نامی که مشتری می‌بیند (اختیاری)'))} value={stage.customerLabel} onChange={(customerLabel) => onChange({ ...stage, customerLabel })} />
      </div>
      {operator && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField label={t(L('Key (English)', 'کلید (انگلیسی)'))} dir="ltr" value={stage.key} onChange={(key) => onChange({ ...stage, key: toSlug(key) })} />
            <SelectField label={t(L('Kind', 'نوع مرحله'))} value={stage.kind} onChange={(kind) => onChange({ ...stage, kind })} options={STAGE_KINDS.filter((k) => !isFirst || k === 'open').map((k) => ({ value: k, label: t(KIND_LABELS[k]) }))} />
            <SelectField label={t(L('Colour', 'رنگ'))} value={stage.color} onChange={(color) => onChange({ ...stage, color })} options={STAGE_COLORS.map((c) => ({ value: c, label: t(COLOR_LABELS[c]) }))} />
          </div>
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-ink-soft">{t(L('From here the request can move to', 'از این مرحله می‌تواند برود به'))}</legend>
            <div className="flex flex-wrap gap-2">
              {others.map((o) => {
                const on = stage.next.includes(o.key);
                return (
                  <button
                    key={o.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChange({ ...stage, next: on ? stage.next.filter((k) => k !== o.key) : [...stage.next, o.key] })}
                    className={cn('rounded-full border px-3 py-1 text-xs', on ? STAGE_CHIP[o.color] : 'border-dashed border-line text-ink-soft hover:text-ink')}
                  >
                    {on ? '✓ ' : '+ '}
                    {l(o.label) || o.key}
                  </button>
                );
              })}
            </div>
            {stage.kind === 'open' && !stage.next.length && <p className="mt-1 text-xs text-danger">{t(L('An open stage should lead somewhere.', 'مرحله‌ی باز باید به جایی برود.'))}</p>}
          </fieldset>
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <Checkbox label={t(L('Shown to the customer', 'برای مشتری نمایش داده شود'))} checked={stage.visible} onChange={(visible) => onChange({ ...stage, visible })} hint={t(L('Off = an internal step', 'خاموش = مرحله‌ی داخلی'))} />
            <Checkbox label={t(L('Customer can cancel here', 'مشتری در این مرحله می‌تواند لغو کند'))} checked={stage.customerCanCancel} onChange={(customerCanCancel) => onChange({ ...stage, customerCanCancel })} />
            <Checkbox label={t(L('Customer can send messages here', 'مشتری در این مرحله می‌تواند پیام بدهد'))} checked={stage.customerCanReply} onChange={(customerCanReply) => onChange({ ...stage, customerCanReply })} />
            <Checkbox label={t(L('Ask for a payment when moving here', 'هنگام ورود، درخواست پرداخت شود'))} checked={stage.askPayment} onChange={(askPayment) => onChange({ ...stage, askPayment })} hint={t(L('Staff enter the amount; the customer gets a payment link.', 'کارکنان مبلغ را وارد می‌کنند و مشتری لینک پرداخت می‌گیرد.'))} />
          </div>
          <Checkbox label={t(L('Notify the customer (SMS / email) when the request reaches this stage', 'اطلاع به مشتری (پیامک / ایمیل) هنگام رسیدن به این مرحله'))} checked={stage.notify} onChange={(notify) => onChange({ ...stage, notify })} />
        </>
      )}
      {(stage.notify || !operator) && (
        <div>
          <LocalizedField label={t(L('Message text (empty = standard text)', 'متن پیام (خالی = متن استاندارد)'))} value={stage.message} onChange={(message) => onChange({ ...stage, message })} multiline rows={2} />
          <p className="mt-1 text-xs text-ink-soft" dir="ltr">
            {'{{site}} {{name}} {{number}} {{stage}} {{amount}} {{link}}'}
          </p>
        </div>
      )}
    </div>
  );
}

/** The flow as a small diagram: each stage with the stages it leads to. */
function FlowPreview({ workflow }: { workflow: Workflow }) {
  const { l, dir } = usePreferences();
  const name = (key: string) => {
    const s = workflow.stages.find((x) => x.key === key);
    return (s && l(s.label)) || key;
  };
  return (
    <ol className="flex flex-col gap-1.5 rounded-lg bg-surface-2 p-3 text-xs">
      {workflow.stages.map((s, i) => (
        <li key={s.key + i} className="flex flex-wrap items-center gap-1.5">
          <StageChip label={l(s.label) || s.key} color={s.color} />
          {!s.visible && <span title="hidden">🔒</span>}
          {s.notify && <span title="notify">✉</span>}
          {s.askPayment && <span title="payment">💳</span>}
          {s.next.length > 0 && <span className="text-ink-soft">{dir === 'rtl' ? '←' : '→'}</span>}
          {s.next.map((n) => (
            <span key={n} className="rounded bg-bg px-1.5 py-0.5 text-ink-soft">
              {name(n)}
            </span>
          ))}
        </li>
      ))}
    </ol>
  );
}

export function WorkflowEditor({ value, onChange, operator }: { value: Workflow | null; onChange: (w: Workflow | null) => void; operator: boolean }) {
  const t = useL();
  const { l } = usePreferences();
  const [open, setOpen] = useState<number | null>(null);
  const w = value ?? DEFAULT_WORKFLOW;
  const setStages = (stages: WorkflowStage[]) => onChange({ ...w, stages });
  const updateStage = (i: number, s: WorkflowStage) => {
    const old = w.stages[i];
    // Renaming a key keeps the links to it.
    const stages = w.stages.map((x, j) => (j === i ? s : old.key !== s.key ? { ...x, next: x.next.map((n) => (n === old.key ? s.key : n)) } : x));
    onChange({ ...w, stages, paidStage: w.paidStage === old.key ? s.key : w.paidStage });
  };
  const move = (i: number, d: number) => {
    const stages = [...w.stages];
    const [s] = stages.splice(i, 1);
    stages.splice(i + d, 0, s);
    setStages(stages);
    setOpen(i + d);
  };
  const remove = (i: number) => {
    const key = w.stages[i].key;
    onChange({ ...w, stages: w.stages.filter((_, j) => j !== i).map((s) => ({ ...s, next: s.next.filter((n) => n !== key) })), paidStage: w.paidStage === key ? '' : w.paidStage });
    setOpen(null);
  };
  const add = () => {
    let key = `stage-${w.stages.length + 1}`;
    while (w.stages.some((s) => s.key === key)) key = `${key}x`;
    const stage: WorkflowStage = { key, label: { en: '', fa: '' }, customerLabel: { ...empty }, kind: 'open', color: 'gray', visible: true, next: [], notify: false, message: { ...empty }, customerCanCancel: false, customerCanReply: true, askPayment: false };
    setStages([...w.stages, stage]);
    setOpen(w.stages.length);
  };

  return (
    <div className="flex flex-col gap-4">
      {operator && (
        <div className="rounded-lg border border-line p-3">
          <p className="mb-2 text-xs font-medium text-ink-soft">{t(L('Start from a ready-made workflow', 'شروع از یک روال آماده'))}</p>
          <div className="flex flex-wrap gap-2">
            {WORKFLOW_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                title={l(p.hint)}
                onClick={() => (value === null || window.confirm(t(L('Replace the current stages?', 'مرحله‌های فعلی جایگزین شوند؟')))) && onChange(structuredClone(p.workflow))}
                className="rounded-md border border-line px-3 py-1.5 text-start text-sm hover:border-ink"
              >
                <span className="block">{l(p.label)}</span>
                <span className="block text-[11px] text-ink-soft">{l(p.hint)}</span>
              </button>
            ))}
          </div>
          {value === null && <p className="mt-2 text-xs text-ink-soft">{t(L('Now using the standard workflow. Edit any stage below to customise it.', 'اکنون از روال استاندارد استفاده می‌شود. با ویرایش هر مرحله، روال اختصاصی می‌شود.'))}</p>}
        </div>
      )}
      <FlowPreview workflow={w} />
      <ol className="flex flex-col gap-2">
        {w.stages.map((s, i) => (
          <li key={i} className={cn('rounded-lg border bg-bg', open === i ? 'border-ink/40' : 'border-line')}>
            <div className="flex items-center gap-2 px-3 py-2">
              <button type="button" className="flex flex-1 flex-wrap items-center gap-2 text-start text-sm" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                <span className={cn('size-2.5 rounded-full', STAGE_DOT[s.color])} />
                <span className="font-medium">{l(s.label) || s.key}</span>
                <span className="text-[11px] text-ink-soft">{t(KIND_LABELS[s.kind])}</span>
                {i === 0 && <Badge tone="accent">{t(L('Starts here', 'شروع'))}</Badge>}
                {w.paidStage === s.key && <Badge tone="good">{t(L('After payment', 'پس از پرداخت'))}</Badge>}
              </button>
              {operator && (
                <>
                  <IconButton label="↑" disabled={i === 0} onClick={() => move(i, -1)}>
                    ↑
                  </IconButton>
                  <IconButton label="↓" disabled={i === w.stages.length - 1} onClick={() => move(i, 1)}>
                    ↓
                  </IconButton>
                  <IconButton label={t(L('Remove', 'حذف'))} disabled={w.stages.length <= 2} onClick={() => remove(i)}>
                    ✕
                  </IconButton>
                </>
              )}
            </div>
            {open === i && (
              <div className="border-t border-line p-3">
                <StageEditor stage={s} stages={w.stages} isFirst={i === 0} operator={operator} onChange={(ns) => updateStage(i, ns)} />
              </div>
            )}
          </li>
        ))}
      </ol>
      {operator && (
        <div className="flex flex-wrap items-end gap-4">
          {w.stages.length < 15 && (
            <Button size="sm" variant="outline" onClick={add}>
              + {t(L('Add stage', 'افزودن مرحله'))}
            </Button>
          )}
          <SelectField
            label={t(L('After a successful payment, move to', 'پس از پرداخت موفق، انتقال به'))}
            value={w.paidStage}
            onChange={(paidStage) => onChange({ ...w, paidStage })}
            options={[{ value: '', label: t(L('Stay in the same stage', 'در همان مرحله بماند')) }, ...w.stages.map((s) => ({ value: s.key, label: l(s.label) || s.key }))]}
            className="w-64"
          />
          {value !== null && (
            <Button size="sm" variant="ghost" onClick={() => window.confirm(t(L('Go back to the standard workflow?', 'به روال استاندارد برگردد؟'))) && onChange(null)}>
              {t(L('Use the standard workflow', 'استفاده از روال استاندارد'))}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- one request type ---------- */

/** How the customer sees the workflow, stage by stage: the progress bar, the stage name and the message sent. */
function WorkflowCustomerPreview({ workflow, siteName }: { workflow: Workflow; siteName: string }) {
  const { locale, formatMoney } = usePreferences();
  const t = (x: Lbl) => x[locale];
  const [at, setAt] = useState(workflow.stages[0]?.key ?? '');
  const stage = workflow.stages.find((s) => s.key === at) ?? workflow.stages[0];
  if (!stage) return null;
  const name = (s: WorkflowStage) => s.customerLabel[locale] || s.label[locale] || s.label.en || s.label.fa || s.key;
  const path: WorkflowStage[] = [];
  for (const s of workflow.stages) {
    if (!s.visible || s.kind === 'cancelled') continue;
    path.push(s);
    if (s.kind === 'done') break;
  }
  const index = path.findIndex((s) => s.key === stage.key);
  const shown = stage.visible ? stage : ([...path].slice(0, Math.max(index, 0) + 1).pop() ?? path[0]);
  const message = stage.notify
    ? fillTemplate(stage.message[locale] || (stage.askPayment ? STANDARD_MESSAGES.payment[locale] : STANDARD_MESSAGES.stage[locale]), {
        site: siteName,
        name: t(L('Sara', 'سارا')),
        number: 'R1024',
        stage: name(stage),
        amount: formatMoney('5000000', 'IRR'),
        link: 'https://…/track/R1024',
      })
    : '';
  return (
    <div className="flex flex-col gap-5">
      <label className="flex flex-col gap-1 text-xs text-ink-soft">
        {t(L('Show the request at stage', 'نمایش درخواست در مرحله‌ی'))}
        <select value={stage.key} onChange={(e) => setAt(e.target.value)} className="rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink">
          {workflow.stages.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label[locale] || s.key}
              {!s.visible ? ` (${t(L('hidden', 'پنهان'))})` : ''}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-4 border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-display text-xl text-ink" dir="ltr">
            R1024
          </span>
          {shown && <StageChip label={name(shown)} color={stage.kind === 'cancelled' ? 'red' : shown.color} />}
        </div>
        {stage.kind === 'cancelled' ? (
          <p className="text-sm text-rose-700">{name(stage)}</p>
        ) : (
          <ProgressSteps steps={path.map((s, i) => ({ key: s.key, label: name(s), reached: index >= 0 ? i <= index : i === 0 }))} current={shown?.key ?? ''} />
        )}
        {!stage.visible && <p className="text-xs text-ink-soft">🔒 {t(L('This stage is internal; the customer still sees the previous one.', 'این مرحله داخلی است؛ مشتری همچنان مرحله‌ی قبلی را می‌بیند.'))}</p>}
        <ul className="flex flex-wrap gap-2 text-xs">
          {stage.askPayment && <li className="rounded-full border border-accent/40 px-3 py-1">💳 {t(L('Pay online button', 'دکمه‌ی پرداخت آنلاین'))}</li>}
          {stage.customerCanCancel && <li className="rounded-full border border-line px-3 py-1">{t(L('Cancel request button', 'دکمه‌ی لغو درخواست'))}</li>}
          <li className="rounded-full border border-line px-3 py-1">{stage.customerCanReply ? t(L('Can write messages', 'امکان نوشتن پیام')) : t(L('Messages closed', 'پیام بسته است'))}</li>
        </ul>
      </div>
      <div>
        <p className="mb-1 text-xs text-ink-soft">{t(L('SMS / email sent on arrival', 'پیامک / ایمیل هنگام ورود به این مرحله'))}</p>
        {message ? <p className="whitespace-pre-wrap rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-ink">{message}</p> : <p className="text-sm text-ink-soft">{t(L('Nothing is sent at this stage.', 'در این مرحله پیامی ارسال نمی‌شود.'))}</p>}
      </div>
    </div>
  );
}

/**
 * The request type as visitors see it, in either language and direction: the real form (answers
 * and conditions work, nothing is sent), or the customer's view of each workflow stage.
 */
function TypePreview({ siteId, draft, tab, siteName }: { siteId: string; draft: RequestTypeDraft; tab: string; siteName: Lbl }) {
  const t = useL();
  const { locale: adminLocale } = usePreferences();
  const [locale, setLocale] = useState<'fa' | 'en'>(adminLocale);
  const [width, setWidth] = useState<'desktop' | 'mobile'>('desktop');
  const { workflow: _w, ...publicType } = draft;
  const chip = (on: boolean) => cn('rounded-full border px-3 py-1 text-xs', on ? 'border-ink bg-ink text-bg' : 'border-line text-ink-soft hover:text-ink');
  return (
    <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-ink-soft">{tab === 'workflow' ? t(L('What the customer sees', 'آنچه مشتری می‌بیند')) : t(L('Preview of the form', 'پیش‌نمایش فرم'))}</p>
        <div className="flex flex-wrap gap-1">
          <button type="button" aria-pressed={locale === 'fa'} onClick={() => setLocale('fa')} className={chip(locale === 'fa')}>
            فارسی · راست‌چین
          </button>
          <button type="button" aria-pressed={locale === 'en'} onClick={() => setLocale('en')} className={chip(locale === 'en')}>
            English · LTR
          </button>
          <span className="mx-1 w-px bg-line" />
          <button type="button" aria-pressed={width === 'desktop'} onClick={() => setWidth('desktop')} className={chip(width === 'desktop')}>
            🖥
          </button>
          <button type="button" aria-pressed={width === 'mobile'} onClick={() => setWidth('mobile')} className={chip(width === 'mobile')}>
            📱
          </button>
        </div>
      </div>
      <div className="max-h-[70vh] overflow-y-auto rounded-md border border-dashed border-line bg-bg p-5">
        <SiteIdContext.Provider value={siteId}>
          <PreferencesProvider locale={locale} onLocaleChange={setLocale} scoped>
            <div dir={locale === 'fa' ? 'rtl' : 'ltr'} lang={locale} className={cn('mx-auto text-start', width === 'mobile' ? 'max-w-[380px]' : 'w-full')}>
              {tab === 'workflow' ? (
                <WorkflowCustomerPreview workflow={draft.workflow ?? DEFAULT_WORKFLOW} siteName={siteName[locale] || siteName.en || siteName.fa} />
              ) : (
                <>
                  <CustomRequestForm key={tab} preview requestType={draft.slug || 'preview'} type={publicType as RequestType} fields={draft.fields} />
                </>
              )}
            </div>
          </PreferencesProvider>
        </SiteIdContext.Provider>
      </div>
    </div>
  );
}

function TypeEditor({ siteId, siteName, draft, setDraft, operator, taken }: { siteId: string; siteName: Lbl; draft: RequestTypeDraft; setDraft: (d: RequestTypeDraft) => void; operator: boolean; taken: string[] }) {
  const t = useL();
  const { formatMoney } = usePreferences();
  const [tab, setTab] = useState<'details' | 'form' | 'look' | 'workflow' | 'payment'>('details');
  const tabs = (
    [
      ['details', L('Details', 'مشخصات')],
      ['form', L('Form questions', 'سؤال‌های فرم')],
      ['look', L('Look & texts', 'ظاهر و متن‌ها')],
      ['workflow', L('Workflow', 'روال پیگیری')],
      ['payment', L('Payment', 'پرداخت')],
    ] as const
  ).filter(([id]) => operator || id === 'details' || id === 'workflow' || id === 'look');
  const layout = draft.layout;
  const setLayout = (patch: Partial<RequestTypeDraft['layout']>) => setDraft({ ...draft, layout: { ...layout, ...patch } });
  const priced = draft.payment.onSubmit;
  const pricedQuestions = draft.fields.filter((f) => f.price > 0 || f.options.some((o) => o.price > 0)).length;
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-line">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn('-mb-px border-b-2 px-4 py-2 text-sm', tab === id ? 'border-ink text-ink' : 'border-transparent text-ink-soft hover:text-ink')}>
            {t(label)}
          </button>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {tab === 'details' && (
            <div className="flex flex-col gap-4">
              <LocalizedField label={t(L('Name of this form / request', 'نام این فرم / نوع درخواست'))} value={draft.label} onChange={(label) => setDraft({ ...draft, label })} />
              {operator && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    label={t(L('Key (English, in links)', 'کلید (انگلیسی، در لینک‌ها)'))}
                    dir="ltr"
                    value={draft.slug}
                    onChange={(slug) => setDraft({ ...draft, slug: toSlug(slug) })}
                    hint={`/contact?type=${draft.slug || '…'}`}
                    error={taken.includes(draft.slug) ? t(L('Another request type uses this key', 'نوع دیگری همین کلید را دارد')) : undefined}
                  />
                  <SelectField
                    label={t(L('Who can send it', 'چه کسی می‌تواند بفرستد'))}
                    value={draft.access}
                    onChange={(access) => setDraft({ ...draft, access })}
                    options={[
                      { value: 'anyone', label: t(L('Anyone', 'همه')) },
                      { value: 'signed_in', label: t(L('Only signed-in customers', 'فقط مشتریان واردشده')) },
                    ]}
                  />
                </div>
              )}
              <p className="text-xs text-ink-soft">
                {t(
                  L(
                    'Put the form on a page with the “Request form” section, or link any button to /contact?type=<key>. Questions, look, workflow and payment are in the other tabs.',
                    'فرم را با بخش «فرم درخواست» در یک صفحه بگذارید، یا هر دکمه‌ای را به ‎/contact?type=<کلید>‎ لینک کنید. سؤال‌ها، ظاهر، روال و پرداخت در تب‌های دیگر است.',
                  ),
                )}
              </p>
            </div>
          )}
          {tab === 'form' && <FormBuilder value={draft.fields} onChange={(fields) => setDraft({ ...draft, fields })} currency={draft.payment.currency} priced={priced} />}
          {tab === 'look' && (
            <div className="flex flex-col gap-4">
              {operator && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField
                    label={t(L('Columns on wide screens', 'تعداد ستون در صفحه‌ی عریض'))}
                    value={String(layout.columns)}
                    onChange={(v) => setLayout({ columns: Number(v) as 1 | 2 | 3 })}
                    options={[1, 2, 3].map((n) => ({ value: String(n), label: String(n) }))}
                  />
                  <div className="self-end pb-2">
                    <Checkbox label={t(L('Show the steps above a multi-step form', 'نمایش مراحل بالای فرم چندمرحله‌ای'))} checked={layout.showProgress} onChange={(showProgress) => setLayout({ showProgress })} />
                  </div>
                </div>
              )}
              <p className="text-xs text-ink-soft">{t(L('Empty texts use the site’s standard ones.', 'متن‌های خالی از متن‌های استاندارد سایت استفاده می‌کنند.'))}</p>
              <LocalizedField label={t(L('Send button', 'دکمه‌ی ارسال'))} value={layout.submitLabel} onChange={(submitLabel) => setLayout({ submitLabel })} />
              <div className="grid gap-3 sm:grid-cols-2">
                <LocalizedField label={t(L('“Next” button (multi-step)', 'دکمه‌ی «بعدی» (چندمرحله‌ای)'))} value={layout.nextLabel} onChange={(nextLabel) => setLayout({ nextLabel })} />
                <LocalizedField label={t(L('“Back” button', 'دکمه‌ی «قبلی»'))} value={layout.backLabel} onChange={(backLabel) => setLayout({ backLabel })} />
              </div>
              <LocalizedField label={t(L('Title after sending', 'عنوان پس از ارسال'))} value={layout.successTitle} onChange={(successTitle) => setLayout({ successTitle })} />
              <LocalizedField label={t(L('Text after sending', 'متن پس از ارسال'))} value={layout.successText} onChange={(successText) => setLayout({ successText })} multiline rows={3} />
            </div>
          )}
          {tab === 'workflow' && <WorkflowEditor value={draft.workflow} onChange={(workflow) => setDraft({ ...draft, workflow })} operator={operator} />}
          {tab === 'payment' && (
            <div className="flex flex-col gap-4">
              <Checkbox
                label={t(L('The customer pays right after sending the form', 'مشتری بلافاصله پس از ارسال فرم پرداخت کند'))}
                checked={draft.payment.onSubmit}
                onChange={(onSubmit) => setDraft({ ...draft, payment: { ...draft.payment, onSubmit } })}
                hint={t(L('A payment form: fees, registrations, deposits, invoices… Staff can also ask for a payment on any request later.', 'فرم پرداخت: هزینه، ثبت‌نام، بیعانه، فاکتور… کارکنان بعداً هم می‌توانند برای هر درخواستی درخواست پرداخت بفرستند.'))}
              />
              {draft.payment.onSubmit && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <PriceField label={t(L('Base amount', 'مبلغ پایه'))} currency={draft.payment.currency} value={draft.payment.amountMinor} onChange={(amountMinor) => setDraft({ ...draft, payment: { ...draft.payment, amountMinor } })} hint={t(L('Can be 0 when the answers set the price.', 'وقتی قیمت از پاسخ‌ها می‌آید می‌تواند ۰ باشد.'))} />
                    <SelectField label={t(L('Currency', 'واحد پول'))} value={draft.payment.currency} onChange={(currency) => setDraft({ ...draft, payment: { ...draft.payment, currency } })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
                  </div>
                  <LocalizedField label={t(L('What it is for (shown to the customer)', 'بابت (به مشتری نمایش داده می‌شود)'))} value={draft.payment.title} onChange={(title) => setDraft({ ...draft, payment: { ...draft.payment, title } })} />
                  <div className="rounded-md border border-line bg-surface p-3 text-sm">
                    <p className="font-medium">{t(L('Total = base amount + prices of the answers', 'جمع = مبلغ پایه + قیمت پاسخ‌ها'))}</p>
                    <ul className="mt-2 list-inside list-disc text-xs text-ink-soft">
                      <li>{t(L('Each choice of a drop-down / options question can have a price.', 'هر گزینه‌ی سؤال‌های فهرستی / گزینه‌ای می‌تواند قیمت داشته باشد.'))}</li>
                      <li>{t(L('A tick box can add a price when ticked.', 'تیک می‌تواند در صورت انتخاب، مبلغی اضافه کند.'))}</li>
                      <li>{t(L('A number question can add price × number (e.g. seats); with price 1 the customer types the amount.', 'سؤال عددی می‌تواند قیمت × عدد اضافه کند (مثلاً تعداد نفر)؛ با قیمت ۱ مشتری خودش مبلغ را وارد می‌کند.'))}</li>
                    </ul>
                    <p className="mt-2 text-xs">
                      {pricedQuestions
                        ? `${pricedQuestions} ${t(L('priced question(s). Set prices in the “Form questions” tab.', 'سؤال قیمت‌دار. قیمت‌ها در تب «سؤال‌های فرم» تنظیم می‌شوند.'))}`
                        : t(L('No priced questions yet: the total is the base amount.', 'هنوز سؤال قیمت‌داری نیست: جمع همان مبلغ پایه است.'))}
                    </p>
                    {!pricedQuestions && <p className="mt-1 text-xs">{t(L('Base amount:', 'مبلغ پایه:'))} {formatMoney(String(draft.payment.amountMinor), draft.payment.currency)}</p>}
                  </div>
                  <p className="text-xs text-ink-soft">{t(L('The total is computed again on the server. Online payment must be set up under Payments. Choose an “after payment” stage in the workflow to move paid requests on automatically.', 'جمع روی سرور دوباره محاسبه می‌شود. درگاه پرداخت باید در بخش «پرداخت» تنظیم شده باشد. در روال، مرحله‌ی «پس از پرداخت» را انتخاب کنید تا درخواست‌های پرداخت‌شده خودکار جلو بروند.'))}</p>
                </>
              )}
            </div>
          )}
        </div>
        <TypePreview siteId={siteId} siteName={siteName} draft={draft} tab={tab} />
      </div>
    </div>
  );
}

/* ---------- the list ---------- */

/** A new form: name, follow-up mobile and email, a message and consent, all editable; a valid unused key. */
const blankType = (taken: string[]): RequestTypeDraft => {
  let n = taken.length + 1;
  while (taken.includes(`request-${n}`)) n++;
  return typeSchema.parse({
    slug: `request-${n}`,
    label: { en: '', fa: '' },
    form: 'contact',
    formVersion: 2,
    fields: [nameField(), phoneField(true), emailField(false), { id: 'message', type: 'textarea', label: { en: 'Your message', fa: 'پیام شما' } }, consentField()],
  });
};

/**
 * The site's request types: what each form asks, the stages its requests go through and whether
 * it takes payment. Clients (non-operators) may rename types and stages and change message texts.
 */
export function RequestTypesEditor({
  siteId,
  siteName,
  value,
  onChange,
  operator,
}: {
  siteId: string;
  siteName: Lbl;
  value: SiteSettings['requestTypes'] | undefined;
  onChange: (v: SiteSettings['requestTypes']) => void;
  operator: boolean;
}) {
  const t = useL();
  const { l, formatMoney } = usePreferences();
  const list = (value ?? (DEFAULT_REQUEST_TYPES.map((x) => typeSchema.parse(x)) as SiteSettings['requestTypes'])).map((x) => typeSchema.parse(x));
  const [editing, setEditing] = useState<{ index: number; draft: RequestTypeDraft } | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  const save = () => {
    if (!editing) return;
    const parsed = typeSchema.safeParse(editing.draft);
    const taken = list.filter((_, i) => i !== editing.index).map((x) => x.slug);
    const issues = parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(' › ')}: ${i.message}`);
    if (taken.includes(editing.draft.slug)) issues.push(t(L('Another request type uses this key', 'نوع دیگری همین کلید را دارد')));
    const ids = editing.draft.fields.map((f) => f.id);
    if (new Set(ids).size !== ids.length) issues.push(t(L('Two questions have the same key', 'دو سؤال کلید یکسان دارند')));
    if (issues.length) return setProblems(issues);
    const next = editing.index < 0 ? [...list, parsed.data!] : list.map((x, i) => (i === editing.index ? parsed.data! : x));
    onChange(next);
    setEditing(null);
    setProblems([]);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-soft">
        {t(
          L(
            'Each request type is a form on the site with its own questions, a workflow (the stages a request goes through, who is told what) and optional payment. Requests show up in “Customer requests”, and customers follow them on the site.',
            'هر نوع درخواست یک فرم در سایت است با سؤال‌های خودش، یک روال پیگیری (مراحلی که درخواست طی می‌کند و اطلاع‌رسانی‌ها) و در صورت نیاز پرداخت. درخواست‌ها در «درخواست‌های مشتریان» دیده می‌شوند و مشتری از سایت پیگیری می‌کند.',
          ),
        )}
      </p>
      <ul className="flex flex-col gap-2">
        {list.map((r, i) => {
          const wf = r.workflow ?? DEFAULT_WORKFLOW;
          return (
            <li key={r.slug + i} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-bg px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {l(r.label) || r.slug} <span className="text-xs font-normal text-ink-soft" dir="ltr">({r.slug})</span>
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                  <Badge>{r.fields.length ? `${r.fields.filter((f) => f.type !== 'heading').length} ${t(L('questions', 'سؤال'))}` : t(L('Built-in questions', 'سؤال‌های آماده'))}</Badge>
                  <Badge>
                    {wf.stages.length} {t(L('stages', 'مرحله'))}
                    {r.workflow ? '' : ` · ${t(L('standard', 'استاندارد'))}`}
                  </Badge>
                  {r.payment.onSubmit && <Badge tone="accent">💳 {formatMoney(String(r.payment.amountMinor), r.payment.currency)}</Badge>}
                  {r.access === 'signed_in' && <Badge tone="warn">{t(L('Members only', 'فقط اعضا'))}</Badge>}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditing({ index: i, draft: structuredClone(r) })}>
                {t(L('Edit', 'ویرایش'))}
              </Button>
              {operator && (
                <IconButton label={t(L('Remove', 'حذف'))} onClick={() => window.confirm(t(L('Remove this request type? Existing requests stay in the inbox.', 'این نوع حذف شود؟ درخواست‌های قبلی در صندوق می‌مانند.'))) && onChange(list.filter((_, j) => j !== i))}>
                  ✕
                </IconButton>
              )}
            </li>
          );
        })}
      </ul>
      {operator && list.length < 30 && (
        <Button size="sm" variant="outline" className="self-start" onClick={() => setEditing({ index: -1, draft: blankType(list.map((x) => x.slug)) })}>
          + {t(L('New request type', 'نوع درخواست جدید'))}
        </Button>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? l(editing.draft.label) || t(L('New request type', 'نوع درخواست جدید')) : ''} wide="xl">
        {editing && (
          <div className="flex flex-col gap-4">
            <TypeEditor siteId={siteId} siteName={siteName} draft={editing.draft} setDraft={(draft) => setEditing({ ...editing, draft })} operator={operator} taken={list.filter((_, i) => i !== editing.index).map((x) => x.slug)} />
            {problems.length > 0 && (
              <ul role="alert" className="list-inside list-disc rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
                {problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            )}
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                {t(L('Cancel', 'انصراف'))}
              </Button>
              <Button onClick={save}>{t(L('Apply', 'اعمال'))}</Button>
            </div>
            <p className="text-end text-xs text-ink-soft">{t(L('Then press “Save” at the top of Settings.', 'سپس دکمه‌ی «ذخیره» بالای تنظیمات را بزنید.'))}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
