import {
  checkAnswers,
  computeTotal,
  fieldVisible,
  formSteps,
  hasPrices,
  isQuestion,
  maxFiles,
  type AnswerIssue,
  type AnswerValue,
  type Answers,
  type FormField,
  type RequestType,
} from '@site-builder/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { FieldShell, Select, TextArea, TextInput } from '../../components/ui/Field';
import { ApiError, API_URL } from '../../lib/api';
import { cn } from '../../lib/cn';
import { errorLine } from '../../lib/errorText';
import { usePreferences } from '../../lib/preferences';
import { customerRequest, L, useCustomer, useText } from '../account/customerApi';
import { DatePickerButton } from '../../components/ui/Calendar';
import { DEFAULT_SITE_ID, useSiteCalendar, useSiteErrorLanguage, useSiteId } from '../public-site/data';
import { normalizeDigits } from './leadSchema';
import { RequestItemNote } from './RequestItemNote';
import { SubmittedNotice } from './SubmittedNotice';

const wideTypes = new Set(['textarea', 'radio', 'checkbox', 'checkboxes', 'heading', 'file']);
const ACCEPT: Record<string, string> = { image: 'image/jpeg,image/png,image/webp,image/gif', pdf: 'application/pdf' };

interface Upload {
  id: string;
  name: string;
}

/** Uploads chosen files one by one for a file question; the answer is the list of upload ids. */
function FileQuestion({ field, id, requestType, value, names, onChange, preview, invalid }: {
  field: FormField;
  id: string;
  requestType: string;
  value: string[];
  names: Record<string, string>;
  onChange: (ids: string[], added?: Upload) => void;
  preview: boolean;
  invalid: boolean;
}) {
  const t = useText();
  const site = useSiteId();
  const errLang = useSiteErrorLanguage();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const limit = maxFiles(field);
  const pick = async (files: FileList | null) => {
    setError('');
    let ids = value;
    for (const file of [...(files ?? [])].slice(0, limit - value.length)) {
      if (file.size > field.files.maxMb * 1024 * 1024) {
        setError(t(L(`Each file can be at most ${field.files.maxMb} MB.`, `حجم هر فایل حداکثر ${field.files.maxMb} مگابایت است.`)));
        continue;
      }
      if (preview || !API_URL) {
        const fake = { id: `preview-${Math.random().toString(36).slice(2)}`, name: file.name };
        ids = [...ids, fake.id];
        onChange(ids, fake);
        continue;
      }
      setBusy(true);
      try {
        const form = new FormData();
        form.append('type', requestType);
        form.append('field', field.id);
        form.append('file', file);
        const res = await fetch(`${API_URL}/api/v1/public/sites/${site}/uploads`, { method: 'POST', body: form, credentials: 'include' });
        const json = (await res.json().catch(() => null)) as { data?: Upload; error?: { code: string; message: string; details?: ApiError['details'] } } | null;
        if (!res.ok || !json?.data) throw new ApiError(res.status, json?.error?.code ?? 'upload_failed', json?.error?.message ?? 'Upload failed', json?.error?.details);
        ids = [...ids, json.data.id];
        onChange(ids, { id: json.data.id, name: json.data.name });
      } catch (err) {
        setError(err instanceof ApiError && err.code === 'unsupported_file' ? t(L('This kind of file is not accepted here.', 'این نوع فایل اینجا پذیرفته نمی‌شود.')) : errorLine(err, errLang));
      } finally {
        setBusy(false);
      }
    }
    if (input.current) input.current.value = '';
  };
  return (
    <div className="flex flex-col gap-2 pt-2">
      {value.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {value.map((fid) => (
            <li key={fid} className="flex items-center justify-between gap-3 border-b border-line py-1">
              <span className="truncate">📎 {names[fid] ?? fid}</span>
              <button type="button" className="text-xs text-ink-soft hover:text-danger" onClick={() => onChange(value.filter((x) => x !== fid))}>
                {t(L('Remove', 'حذف'))}
              </button>
            </li>
          ))}
        </ul>
      )}
      {value.length < limit && (
        <label className={cn('inline-flex w-fit cursor-pointer flex-wrap items-center gap-2 border border-dashed px-4 py-2 text-sm', invalid ? 'border-danger' : 'border-line hover:border-ink')}>
          <input ref={input} id={id} type="file" className="sr-only" multiple={limit - value.length > 1} accept={field.files.kinds.map((k) => ACCEPT[k]).join(',')} onChange={(e) => pick(e.target.files)} disabled={busy} />
          {busy ? t(L('Uploading…', 'در حال بارگذاری…')) : t(L('Choose file', 'انتخاب فایل'))}
          <span className="text-xs text-ink-soft">
            ({field.files.kinds.map((k) => (k === 'image' ? t(L('image', 'عکس')) : 'PDF')).join('، ')} · {field.files.maxMb}MB · {value.length}/{limit})
          </span>
        </label>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

type FormProps = Parameters<typeof RequestForm>[0];

/**
 * Questions whose choices come from a content table (`optionsFrom`) get the titles of its
 * published items, as the server does when it checks the answers. The form waits for them so a
 * link can prefill such a question too.
 */
export function CustomRequestForm(props: FormProps) {
  const site = useSiteId();
  const [params] = useSearchParams();
  const { l } = usePreferences();
  const [collection, itemSlug] = (params.get('item') ?? '').split('/');
  const tables = [...new Set(props.fields.filter((f) => f.optionsFrom).map((f) => f.optionsFrom))];
  const options = useQuery({
    queryKey: ['public', site, 'form-options', tables],
    queryFn: async () => {
      const out: Record<string, { slug: string; title: { en: string; fa: string } }[]> = {};
      for (const slug of tables) {
        const items = await customerRequest<{ slug: string; title: { en: string; fa: string } }[]>(site, `/collections/${slug}/items?pageSize=60`).catch(() => []);
        out[slug] = items.slice(0, 50);
      }
      return out;
    },
    enabled: tables.length > 0,
    staleTime: 60_000,
  });
  const fields = useMemo(
    () => (tables.length && options.data ? props.fields.map((f) => (f.optionsFrom ? { ...f, options: (options.data[f.optionsFrom] ?? []).map((x) => ({ ...x.title, price: 0 })) } : f)) : props.fields),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.fields, options.data],
  );
  if (tables.length && options.isLoading) return <div role="status" aria-label="Loading" className="min-h-40" />;
  // Request links carry a stable item slug; choices submit the localized table title.
  const selected = options.data?.[collection]?.find((item) => item.slug === itemSlug);
  const prefilledAnswers: Answers = {};
  if (selected) {
    for (const field of fields) {
      if (field.optionsFrom === collection && (field.type === 'select' || field.type === 'radio')) {
        prefilledAnswers[field.id] = l(selected.title);
      }
    }
  }
  return <RequestForm {...props} key={params.get('item') ?? ''} fields={fields} prefilledAnswers={prefilledAnswers} />;
}

/**
 * A request form built entirely from the request type's fields: questions with conditions,
 * limits and ready-made checks, file uploads, pages (step breaks), prices with a running total,
 * and the type's own layout and texts. The server checks everything again. On success the visitor
 * gets a tracking code, or goes straight to the payment gateway.
 */
function RequestForm({
  requestType,
  type,
  fields,
  requestLabel,
  submitLabel,
  prefilledAnswers = {},
  preview = false,
}: {
  requestType: string;
  type?: RequestType;
  fields: FormField[];
  requestLabel?: string;
  submitLabel?: string;
  prefilledAnswers?: Answers;
  /** Admin preview: answers, conditions, steps and checks work, but nothing is sent. */
  preview?: boolean;
}) {
  const { m, l, locale, formatMoney } = usePreferences();
  const t = useText();
  const cal = useSiteCalendar();
  const location = useLocation();
  const errorLang = useSiteErrorLanguage();
  const { customer, enabled: accountsOn, loading: customerLoading } = useCustomer();
  const layout = type?.layout;
  const payment = type?.payment;
  const steps = useMemo(() => formSteps(fields), [fields]);
  const [step, setStep] = useState(0);
  // A link can prefill any question by its key: /contact?type=visit&rooms=2&lunch=1.
  const [answers, setAnswers] = useState<Answers>(() => {
    const params = new URLSearchParams(location.search);
    const out: Answers = { ...prefilledAnswers };
    for (const f of fields) {
      const v = params.get(f.id);
      if (v === null || !isQuestion(f) || f.type === 'file') continue;
      if (f.type === 'checkbox') out[f.id] = v === '1' || v === 'true';
      else if (f.type === 'checkboxes') out[f.id] = v.split(',').filter((x) => f.options.some((o) => o.en === x || o.fa === x));
      else if (f.type === 'select' || f.type === 'radio') {
        const o = f.options.find((x) => x.en === v || x.fa === v);
        if (o) out[f.id] = (locale === 'fa' ? o.fa : o.en) || o.en || o.fa;
      } else out[f.id] = v;
    }
    return out;
  });
  const [names, setNames] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'sending' | 'error' | 'sent' | 'paying'>('idle');
  const [failure, setFailure] = useState('');
  const [result, setResult] = useState<{ code?: string; token?: string }>({});
  const [previewChecked, setPreviewChecked] = useState(false);
  const top = useRef<HTMLFormElement>(null);
  const current = Math.min(step, steps.length - 1);

  // A signed-in customer's name, phone and email fill the questions marked for them.
  useEffect(() => {
    if (!customer) return;
    setAnswers((a) => {
      const next = { ...a };
      for (const f of fields) {
        const v = f.role === 'name' ? customer.name : f.role === 'phone' ? customer.phone : f.role === 'email' ? customer.email : null;
        if (v && next[f.id] === undefined) next[f.id] = v;
      }
      return next;
    });
  }, [customer, fields]);

  if (type?.access === 'signed_in' && customerLoading && !preview) {
    return <p role="status" className="text-sm text-ink-soft">{t(L('Checking your account…', 'در حال بررسی حساب شما…'))}</p>;
  }

  if (type?.access === 'signed_in' && !customer && !preview) {
    return (
      <div className="border border-line bg-surface p-8 sm:p-12">
        <h3 className="font-display text-2xl text-ink">{t(L('Sign in to send this request', 'برای ارسال این درخواست وارد شوید'))}</h3>
        <p className="mt-3 text-ink-soft">{t(L('This form is for members. Sign in or create an account; it takes a minute.', 'این فرم مخصوص اعضاست. وارد شوید یا حساب بسازید؛ یک دقیقه طول می‌کشد.'))}</p>
        {accountsOn && (
          <Link to={`/account?next=${encodeURIComponent(location.pathname + location.search)}`} className="mt-6 inline-block underline underline-offset-4">
            {t(L('Sign in / sign up', 'ورود / ثبت‌نام'))}
          </Link>
        )}
      </div>
    );
  }

  const set = (id: string, v: AnswerValue) => setAnswers((a) => ({ ...a, [id]: v }));
  const text = (id: string) => (typeof answers[id] === 'string' ? (answers[id] as string) : '');
  const columns = layout?.columns ?? 2;
  const gridCols = columns === 1 ? '' : columns === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2';
  const fullSpan = columns === 1 ? '' : columns === 3 ? 'sm:col-span-2 lg:col-span-3' : 'sm:col-span-2';
  const showTotal = !!payment?.onSubmit;
  const currency = payment?.currency ?? 'IRR';

  /** Answers with digits as ASCII where they matter (the server does the same). */
  const normalized = (): Answers => {
    const out: Answers = {};
    for (const f of fields) {
      const v = answers[f.id];
      if (!isQuestion(f) || v === undefined) continue;
      out[f.id] = typeof v === 'string' && (['tel', 'number', 'date', 'time'].includes(f.type) || ['digits', 'nationalId', 'postalCode', 'iban'].includes(f.pattern)) ? normalizeDigits(v.trim()) : v;
    }
    return out;
  };
  const total = showTotal ? computeTotal(fields, normalized(), payment?.amountMinor ?? 0) : 0;

  const message = (issue: AnswerIssue, f: FormField | undefined) => {
    const e = m.form.errors;
    const label = f ? l(f.label) : '';
    const limit = issue.limit;
    const counted = f?.type === 'checkboxes' || f?.type === 'file';
    switch (issue.problem) {
      case 'required':
        return label ? `${label}: ${m.form.required}` : m.form.required;
      case 'email':
        return e.emailInvalid;
      case 'phone':
        return e.phoneInvalid;
      case 'min':
        return f?.type === 'number'
          ? t(L(`At least ${limit}.`, `حداقل ${limit}.`))
          : f?.type === 'date'
            ? t(L(`Choose ${limit} or later.`, `تاریخ ${limit} یا بعد از آن را انتخاب کنید.`))
            : counted
              ? t(L(`Choose at least ${limit}.`, `حداقل ${limit} مورد.`))
              : t(L(`At least ${limit} characters.`, `حداقل ${limit} کاراکتر.`));
      case 'max':
        return f?.type === 'number'
          ? t(L(`At most ${limit}.`, `حداکثر ${limit}.`))
          : f?.type === 'date'
            ? t(L(`Choose ${limit} or earlier.`, `تاریخ ${limit} یا قبل از آن را انتخاب کنید.`))
            : counted
              ? t(L(`At most ${limit}.`, `حداکثر ${limit} مورد.`))
              : t(L(`At most ${limit} characters.`, `حداکثر ${limit} کاراکتر.`));
      case 'pattern': {
        const texts: Record<string, string> = {
          digits: t(L('Digits only.', 'فقط عدد وارد کنید.')),
          nationalId: t(L('This national id is not valid.', 'کد ملی معتبر نیست.')),
          postalCode: t(L('A postal code has 10 digits.', 'کد پستی ۱۰ رقم است.')),
          iban: t(L('Enter the IBAN as IR followed by 24 digits.', 'شماره شبا را به‌صورت IR و ۲۴ رقم وارد کنید.')),
          persian: t(L('Write it in Persian.', 'به فارسی بنویسید.')),
          latin: t(L('Write it in English letters.', 'با حروف انگلیسی بنویسید.')),
        };
        return texts[String(limit)] ?? t(L('Check this answer.', 'این پاسخ را بررسی کنید.'));
      }
      case 'number':
        return t(L('Enter a number.', 'یک عدد وارد کنید.'));
      case 'date':
        return t(L('Choose a date.', 'یک تاریخ انتخاب کنید.'));
      default:
        return t(L('Check this answer.', 'این پاسخ را بررسی کنید.'));
    }
  };

  /** Problems with the answers on pages `from`..`to`. */
  const problems = (from: number, to: number) => {
    const ids = new Set(steps.slice(from, to + 1).flatMap((s) => s.fields.map((f) => f.id)));
    const out: Record<string, string> = {};
    for (const issue of checkAnswers(fields, normalized())) {
      if (ids.has(issue.field)) out[`f_${issue.field}`] = message(issue, fields.find((f) => f.id === issue.field));
    }
    return out;
  };
  const focusFirst = (found: Record<string, string>) => setTimeout(() => document.getElementById(`req-${Object.keys(found)[0]}`)?.focus(), 0);

  const next = () => {
    const found = problems(current, current);
    setErrors(found);
    if (Object.keys(found).length) return focusFirst(found);
    setStep(current + 1);
    top.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (current < steps.length - 1) return next();
    const found = problems(0, steps.length - 1);
    setErrors(found);
    setPreviewChecked(false);
    if (Object.keys(found).length) {
      // Back to the first page with a problem.
      const firstBad = steps.findIndex((s) => s.fields.some((f) => found[`f_${f.id}`]));
      if (firstBad >= 0) setStep(firstBad);
      return focusFirst(found);
    }
    if (preview) {
      setPreviewChecked(true);
      return;
    }
    if (!API_URL) {
      setStatus('sent');
      return;
    }
    setStatus('sending');
    const all = normalized();
    const sent: Answers = {};
    for (const f of fields) if (isQuestion(f) && fieldVisible(f, fields, all) && all[f.id] !== undefined) sent[f.id] = all[f.id];
    const [collection, slug] = (new URLSearchParams(window.location.search).get('item') ?? '').split('/');
    try {
      const r = await customerRequest<{ code: string; token: string; number: string; paymentDue: boolean }>(DEFAULT_SITE_ID, '/leads', {
        method: 'POST',
        body: { type: requestType, answers: sent, sourcePath: window.location.pathname, item: collection && slug ? { collection, slug } : undefined, locale },
      });
      setResult({ code: r.code, token: r.token });
      if (r.paymentDue) {
        setStatus('paying');
        try {
          const pay = await customerRequest<{ redirectUrl: string }>(DEFAULT_SITE_ID, `/requests/${r.number}/pay`, { method: 'POST', body: { token: r.token, locale } });
          window.location.assign(pay.redirectUrl);
          return;
        } catch (err) {
          // The request is saved; the visitor can pay later from its page.
          setFailure(errorLine(err, errorLang));
        }
      }
      setStatus('sent');
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        const byField: Record<string, string> = {};
        for (const d of err.details) {
          const key = d.path.startsWith('answers.') ? d.path.slice(8) : d.path;
          byField[`f_${key}`] =
            d.code === 'file_missing'
              ? t(L('Upload the files again.', 'فایل‌ها را دوباره بارگذاری کنید.'))
              : message({ field: key, problem: (d.code === 'too_small' ? 'required' : d.code) as AnswerIssue['problem'], limit: d.limit as number | string | undefined }, fields.find((x) => x.id === key));
        }
        setErrors(byField);
        const firstBad = steps.findIndex((s) => s.fields.some((f) => byField[`f_${f.id}`]));
        if (firstBad >= 0) setStep(firstBad);
      }
      setFailure(errorLine(err, errorLang));
      setStatus('error');
    }
  };

  if (status === 'sent' || status === 'paying') {
    return (
      <>
        {failure && <p className="mb-4 text-sm text-danger">{failure}</p>}
        <SubmittedNotice
          code={result.code}
          token={result.token}
          title={l(layout?.successTitle)}
          text={l(layout?.successText)}
          onAnother={() => {
            setAnswers({});
            setNames({});
            setStep(0);
            setFailure('');
            setStatus('idle');
          }}
        />
      </>
    );
  }

  const err = (key: string) => errors[key];
  const priceTag = (price: number) => (price > 0 && showTotal ? ` (+${formatMoney(String(price), currency)})` : '');

  const renderField = (f: FormField) => {
    if (!fieldVisible(f, fields, answers)) return null;
    const key = `f_${f.id}`;
    const id = `req-${key}`;
    const wide = f.width === 'full' || (f.width === 'auto' && wideTypes.has(f.type));
    const hint = [l(f.help), f.required ? '' : m.form.optional].filter(Boolean).join(' · ') || undefined;
    if (f.type === 'heading') {
      return (
        <div key={f.id} className={cn('pt-4', fullSpan)}>
          {l(f.label) && <h3 className="font-display text-xl text-ink">{l(f.label)}</h3>}
          {l(f.help) && <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{l(f.help)}</p>}
        </div>
      );
    }
    if (f.type === 'checkbox') {
      return (
        <div key={f.id} className={cn(wide && fullSpan)}>
          <label className="flex cursor-pointer items-start gap-3 text-sm text-ink">
            <input id={id} type="checkbox" className="mt-0.5 size-4 accent-(--accent)" checked={!!answers[f.id]} onChange={(e) => set(f.id, e.target.checked)} aria-invalid={!!err(key)} />
            <span>
              {l(f.label)}
              {priceTag(f.price) && <span className="text-ink-soft">{priceTag(f.price)}</span>}
              {l(f.help) && <span className="block text-xs text-ink-soft">{l(f.help)}</span>}
            </span>
          </label>
          {err(key) && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {err(key)}
            </p>
          )}
        </div>
      );
    }
    const chosen = Array.isArray(answers[f.id]) ? (answers[f.id] as string[]) : [];
    const placeholder = l(f.placeholder) || undefined;
    const ltr = ['email', 'tel', 'number', 'date', 'time'].includes(f.type) || ['digits', 'nationalId', 'postalCode', 'iban', 'latin'].includes(f.pattern);
    return (
      <div key={f.id} className={cn(wide && fullSpan)}>
        <FieldShell id={id} label={l(f.label)} hint={hint} error={err(key)}>
          {f.type === 'textarea' ? (
            <TextArea id={id} rows={5} placeholder={placeholder} maxLength={f.max ?? undefined} value={text(f.id)} onChange={(e) => set(f.id, e.target.value)} aria-invalid={!!err(key)} />
          ) : f.type === 'select' ? (
            <Select id={id} value={text(f.id)} onChange={(e) => set(f.id, e.target.value)} aria-invalid={!!err(key)}>
              <option value="">{placeholder ?? '—'}</option>
              {f.options.map((o, i) => (
                <option key={i} value={l(o)}>
                  {l(o)}
                  {priceTag(o.price)}
                </option>
              ))}
            </Select>
          ) : f.type === 'radio' || f.type === 'checkboxes' ? (
            <div id={id} role={f.type === 'radio' ? 'radiogroup' : 'group'} tabIndex={-1} className="flex flex-wrap gap-x-6 gap-y-3 pt-2">
              {f.options.map((o, i) => (
                <label key={i} className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                  {f.type === 'radio' ? (
                    <input type="radio" name={key} className="size-4 accent-(--accent)" checked={text(f.id) === l(o)} onChange={() => set(f.id, l(o))} />
                  ) : (
                    <input type="checkbox" className="size-4 accent-(--accent)" checked={chosen.includes(l(o))} onChange={(e) => set(f.id, e.target.checked ? [...chosen, l(o)] : chosen.filter((x) => x !== l(o)))} />
                  )}
                  {l(o)}
                  {priceTag(o.price) && <span className="text-ink-soft">{priceTag(o.price)}</span>}
                </label>
              ))}
            </div>
          ) : f.type === 'file' ? (
            <FileQuestion
              field={f}
              id={id}
              requestType={requestType}
              value={chosen}
              names={names}
              preview={preview}
              invalid={!!err(key)}
              onChange={(ids, added) => {
                if (added) setNames((n) => ({ ...n, [added.id]: added.name }));
                set(f.id, ids);
              }}
            />
          ) : f.type === 'date' ? (
            // Dates are picked in the site's calendar (Jalali on Persian sites) and kept as ISO days.
            <div className="pt-2">
              <DatePickerButton cal={cal} locale={locale} value={text(f.id)} onChange={(v) => set(f.id, v)} placeholder={placeholder || t(L('Choose a date', 'انتخاب تاریخ'))} className={cn(err(key) && 'border-danger')} />
            </div>
          ) : (
            <TextInput
              id={id}
              type={f.type === 'number' ? 'text' : f.type}
              dir={ltr ? 'ltr' : undefined}
              inputMode={f.type === 'tel' ? 'tel' : f.type === 'number' || ['digits', 'nationalId', 'postalCode'].includes(f.pattern) ? 'numeric' : undefined}
              autoComplete={f.role === 'name' ? 'name' : f.role === 'phone' ? 'tel' : f.role === 'email' ? 'email' : undefined}
              placeholder={placeholder}
              maxLength={f.type === 'text' && f.max !== null ? f.max : undefined}
              value={text(f.id)}
              onChange={(e) => set(f.id, e.target.value)}
              aria-invalid={!!err(key)}
            />
          )}
        </FieldShell>
        {f.type === 'number' && f.price > 0 && showTotal && (
          <p className="mt-1 text-xs text-ink-soft">
            {t(L('Each:', 'هر واحد:'))} {formatMoney(String(f.price), currency)}
          </p>
        )}
      </div>
    );
  };

  const page = steps[current];
  const last = current === steps.length - 1;
  return (
    <form ref={top} noValidate onSubmit={onSubmit} className={cn('grid gap-8', gridCols)} aria-busy={status === 'sending'}>
      {preview && type?.access === 'signed_in' && (
        <p className={cn('border-s-2 border-accent ps-4 text-sm text-ink-soft', fullSpan)}>{t(L('Only signed-in customers see this form; others are asked to sign in.', 'این فرم فقط برای مشتریان واردشده نمایش داده می‌شود؛ بقیه به ورود دعوت می‌شوند.'))}</p>
      )}
      {requestLabel && <p className={cn('eyebrow', fullSpan)}>{requestLabel}</p>}
      {!preview && current === 0 && <RequestItemNote />}
      {steps.length > 1 && layout?.showProgress !== false && (
        <ol className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line pb-4 text-sm', fullSpan)} aria-label={t(L('Steps', 'مراحل'))}>
          {steps.map((s, i) => (
            <li key={i} className={cn('flex items-center gap-2', i === current ? 'font-semibold text-ink' : i < current ? 'text-ink' : 'text-ink-soft/60')} aria-current={i === current ? 'step' : undefined}>
              <span className={cn('flex size-6 items-center justify-center rounded-full border text-xs', i <= current ? 'border-ink bg-ink text-bg' : 'border-line')}>{i < current ? '✓' : i + 1}</span>
              {(s.title && l(s.title)) || `${t(L('Step', 'مرحله'))} ${i + 1}`}
            </li>
          ))}
        </ol>
      )}
      {page.fields.map(renderField)}
      {showTotal && (last || hasPrices(fields)) && (
        <div className={cn('flex flex-wrap items-center justify-between gap-3 border-y border-line py-4', fullSpan)}>
          <span className="text-sm text-ink-soft">
            {t(L('Total to pay', 'مبلغ قابل پرداخت'))}
            {l(payment?.title) ? ` — ${l(payment?.title)}` : ''}
          </span>
          <span className="font-display text-2xl text-ink">{formatMoney(String(total), currency)}</span>
        </div>
      )}
      {previewChecked && (
        <p role="status" className={cn('text-sm text-emerald-700', fullSpan)}>
          ✓ {t(L('The answers are valid. This is a preview, nothing was sent.', 'پاسخ‌ها معتبرند. این پیش‌نمایش است و چیزی ارسال نشد.'))}
        </p>
      )}
      {status === 'error' && (
        <p role="alert" className={cn('text-sm text-danger', fullSpan)}>
          {m.form.failed} {failure}
        </p>
      )}
      <div className={cn('flex flex-wrap gap-3', fullSpan)}>
        {current > 0 && (
          <Button type="button" variant="outline" onClick={() => setStep(current - 1)}>
            {l(layout?.backLabel) || t(L('Back', 'قبلی'))}
          </Button>
        )}
        <Button type="submit" disabled={status === 'sending'} className="w-full sm:w-auto">
          {!last
            ? l(layout?.nextLabel) || t(L('Next', 'بعدی'))
            : status === 'sending'
              ? m.form.sending
              : l(layout?.submitLabel) || (showTotal && total > 0 ? t(L('Send and pay', 'ارسال و پرداخت')) : submitLabel || m.form.submit)}
        </Button>
      </div>
    </form>
  );
}
