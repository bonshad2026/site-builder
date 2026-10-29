import type { FormField } from '@site-builder/shared';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { FieldShell, Select, TextArea, TextInput } from '../../components/ui/Field';
import { usePreferences } from '../../lib/preferences';
import { normalizeDigits } from './leadSchema';
import { submitLead } from './submitLead';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^(\+?\d{1,3}[\s-]?)?\d[\d\s-]{7,14}$/;

type Values = Record<string, string | boolean>;

/**
 * A request form built from a request type's own fields (set in the settings). Name and email are
 * always asked, so the studio can reply; answers are sent with their labels as the visitor saw them.
 */
export function CustomRequestForm({ requestType, fields, requestLabel, submitLabel }: { requestType: string; fields: FormField[]; requestLabel?: string; submitLabel?: string }) {
  const { m, l } = usePreferences();
  const [values, setValues] = useState<Values>({ name: '', email: '', consent: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'sending' | 'error' | 'sent' | 'simulated'>('idle');
  const set = (key: string, v: string | boolean) => setValues((x) => ({ ...x, [key]: v }));
  const text = (key: string) => (typeof values[key] === 'string' ? (values[key] as string) : '');

  const validate = () => {
    const e = m.form.errors;
    const out: Record<string, string> = {};
    if (text('name').trim().length < 2) out.name = e.nameRequired;
    if (!EMAIL.test(text('email').trim())) out.email = e.emailInvalid;
    for (const f of fields) {
      const v = values[`f_${f.id}`];
      const empty = f.type === 'checkbox' ? !v : !String(v ?? '').trim();
      if (f.required && empty) out[`f_${f.id}`] = l(f.label) ? `${l(f.label)}: ${m.form.required}` : m.form.required;
      else if (!empty && f.type === 'email' && !EMAIL.test(String(v).trim())) out[`f_${f.id}`] = e.emailInvalid;
      else if (!empty && f.type === 'tel' && !PHONE.test(normalizeDigits(String(v).trim()))) out[`f_${f.id}`] = e.phoneInvalid;
    }
    if (!values.consent) out.consent = e.consentRequired;
    return out;
  };

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      document.getElementById(`req-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    setStatus('sending');
    const answers = fields
      .map((f) => {
        const v = values[`f_${f.id}`];
        const value = f.type === 'checkbox' ? (v ? '✓' : '') : String(v ?? '').trim();
        return { label: l(f.label) || f.id, value: f.type === 'tel' ? normalizeDigits(value) : value };
      })
      .filter((a) => a.value);
    const phone = fields.find((f) => f.type === 'tel');
    try {
      const result = await submitLead(
        {
          name: text('name').trim(),
          email: text('email').trim(),
          phone: phone ? normalizeDigits(String(values[`f_${phone.id}`] ?? '').trim()) : '',
          message: '',
          consent: true,
        } as Parameters<typeof submitLead>[0],
        'contact',
        requestType,
        answers,
      );
      setStatus(result.mode);
    } catch {
      setStatus('error');
    }
  };

  if (status === 'sent' || status === 'simulated') {
    return (
      <div role="status" className="reveal border border-line bg-surface p-8 sm:p-12">
        <h3 className="font-display text-3xl text-ink">{status === 'sent' ? m.form.sentTitle : m.form.successTitle}</h3>
        <p className="mt-4 max-w-lg leading-relaxed text-ink-soft">{status === 'sent' ? m.form.sentText : m.form.successText}</p>
        <Button
          variant="outline"
          className="mt-8"
          onClick={() => {
            setValues({ name: '', email: '', consent: false });
            setStatus('idle');
          }}
        >
          {m.form.another}
        </Button>
      </div>
    );
  }

  const err = (key: string) => errors[key];
  return (
    <form noValidate onSubmit={onSubmit} className="grid gap-8 sm:grid-cols-2" aria-busy={status === 'sending'}>
      {requestLabel && <p className="eyebrow sm:col-span-2">{requestLabel}</p>}
      <FieldShell id="req-name" label={m.form.name} error={err('name')}>
        <TextInput id="req-name" autoComplete="name" value={text('name')} onChange={(e) => set('name', e.target.value)} aria-invalid={!!err('name')} />
      </FieldShell>
      <FieldShell id="req-email" label={m.form.email} error={err('email')}>
        <TextInput id="req-email" type="email" dir="ltr" autoComplete="email" value={text('email')} onChange={(e) => set('email', e.target.value)} aria-invalid={!!err('email')} />
      </FieldShell>
      {fields.map((f) => {
        const key = `f_${f.id}`;
        const id = `req-${key}`;
        const wide = f.type === 'textarea' || f.type === 'radio' || f.type === 'checkbox';
        const hint = [l(f.help), f.required ? '' : m.form.optional].filter(Boolean).join(' · ') || undefined;
        if (f.type === 'checkbox') {
          return (
            <div key={f.id} className="sm:col-span-2">
              <label className="flex cursor-pointer items-start gap-3 text-sm text-ink">
                <input id={id} type="checkbox" className="mt-0.5 size-4 accent-(--accent)" checked={!!values[key]} onChange={(e) => set(key, e.target.checked)} aria-invalid={!!err(key)} />
                <span>
                  {l(f.label)}
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
        return (
          <div key={f.id} className={wide ? 'sm:col-span-2' : undefined}>
            <FieldShell id={id} label={l(f.label)} hint={hint} error={err(key)}>
              {f.type === 'textarea' ? (
                <TextArea id={id} rows={5} value={text(key)} onChange={(e) => set(key, e.target.value)} aria-invalid={!!err(key)} />
              ) : f.type === 'select' ? (
                <Select id={id} value={text(key)} onChange={(e) => set(key, e.target.value)} aria-invalid={!!err(key)}>
                  <option value="">—</option>
                  {f.options.map((o, i) => (
                    <option key={i} value={l(o)}>
                      {l(o)}
                    </option>
                  ))}
                </Select>
              ) : f.type === 'radio' ? (
                <div id={id} role="radiogroup" tabIndex={-1} className="flex flex-wrap gap-x-6 gap-y-3 pt-2">
                  {f.options.map((o, i) => (
                    <label key={i} className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                      <input type="radio" name={key} className="size-4 accent-(--accent)" checked={text(key) === l(o)} onChange={() => set(key, l(o))} />
                      {l(o)}
                    </label>
                  ))}
                </div>
              ) : (
                <TextInput
                  id={id}
                  type={f.type}
                  dir={['email', 'tel', 'number', 'date', 'time'].includes(f.type) ? 'ltr' : undefined}
                  inputMode={f.type === 'tel' ? 'tel' : f.type === 'number' ? 'numeric' : undefined}
                  value={text(key)}
                  onChange={(e) => set(key, e.target.value)}
                  aria-invalid={!!err(key)}
                />
              )}
            </FieldShell>
          </div>
        );
      })}
      <div className="sm:col-span-2">
        <label className="flex cursor-pointer items-start gap-3 text-sm text-ink-soft">
          <input id="req-consent" type="checkbox" className="mt-0.5 size-4 accent-(--accent)" checked={!!values.consent} onChange={(e) => set('consent', e.target.checked)} aria-invalid={!!err('consent')} />
          {m.form.consent}
        </label>
        {err('consent') && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {err('consent')}
          </p>
        )}
      </div>
      {status === 'error' && (
        <p role="alert" className="text-sm text-danger sm:col-span-2">
          {m.form.failed}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={status === 'sending'} className="w-full sm:w-auto">
          {status === 'sending' ? m.form.sending : submitLabel || m.form.submit}
        </Button>
      </div>
    </form>
  );
}
