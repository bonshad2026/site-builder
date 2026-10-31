import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { FieldShell, Select, TextArea, TextInput } from '../../components/ui/Field';
import { usePreferences } from '../../lib/preferences';
import { useProducts, useSiteErrorLanguage, useSiteSettings } from '../public-site/data';
import { budgets, createLeadSchema, projectTypes, type FormType, type Lead, type LeadInput } from './leadSchema';
import { submitLead, type SubmitResult } from './submitLead';
import { RequestItemNote } from './RequestItemNote';
import { errorLine } from '../../lib/errorText';

const serviceToProjectType: Record<string, LeadInput['projectType']> = {
  'residential-design': 'residential',
  'hospitality-design': 'hospitality',
  'design-consultation': 'consultation',
  'custom-furniture': 'furniture',
};

/**
 * A request form: contact, consultation, reservation or demo questions (set per section), sent
 * as one of the site's request types (`requestType`, e.g. demo or payment).
 * Links from service (?service=) and product (?product=) pages pre-fill it.
 */
export function ContactForm({
  formType = 'consultation',
  requestType,
  requestLabel,
  submitLabel,
}: {
  formType?: FormType;
  requestType?: string;
  /** Shown above the form when a link picked the request type. */
  requestLabel?: string;
  submitLabel?: string;
}) {
  const [params] = useSearchParams();
  const { data: products = [] } = useProducts();
  const { l } = usePreferences();
  const product = products.find((p) => p.slug === params.get('product'));
  const projectType = product ? 'furniture' : serviceToProjectType[params.get('service') ?? ''];
  const message = product ? `${l(product.name)} — ` : '';
  return (
    <ContactFormInner
      key={`${formType}-${requestType}-${projectType}-${message}`}
      formType={formType}
      requestType={requestType}
      requestLabel={requestLabel}
      submitLabel={submitLabel}
      defaultProjectType={projectType}
      defaultMessage={message}
    />
  );
}

function ContactFormInner({
  formType,
  requestType,
  requestLabel,
  submitLabel,
  defaultProjectType,
  defaultMessage,
}: {
  formType: FormType;
  requestType?: string;
  requestLabel?: string;
  submitLabel?: string;
  defaultProjectType?: LeadInput['projectType'];
  defaultMessage?: string;
}) {
  const { m, l } = usePreferences();
  const { data: settings } = useSiteSettings();
  // The site's own choices, else the built-in ones.
  const projectChoices = settings?.formOptions?.projectTypes ?? projectTypes.map((v) => ({ value: v, label: { en: m.form.projectTypes[v], fa: m.form.projectTypes[v] } }));
  const budgetChoices = settings?.formOptions?.budgets ?? budgets.map((v) => ({ value: v, label: { en: m.form.budgets[v], fa: m.form.budgets[v] } }));
  const schema = useMemo(() => createLeadSchema(m.form.errors, formType), [m, formType]);
  const [status, setStatus] = useState<'idle' | 'error' | SubmitResult['mode']>('idle');
  const [failure, setFailure] = useState('');
  const errorLang = useSiteErrorLanguage();

  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors, isSubmitting, submitCount },
  } = useForm<LeadInput, unknown, Lead>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      // '' renders the placeholder option; the schema rejects it on submit.
      projectType: defaultProjectType ?? ('' as LeadInput['projectType']),
      budget: budgetChoices.some((b) => b.value === 'unsure') ? 'unsure' : (budgetChoices[budgetChoices.length - 1]?.value ?? ''),
      message: defaultMessage ?? '',
      date: '',
      time: '',
      company: '',
      consent: false,
    },
  });

  const onSubmit = async (data: Lead) => {
    try {
      // Send the budget as its wording, so the inbox shows what the visitor picked.
      const budget = budgetChoices.find((b) => b.value === data.budget);
      const result = await submitLead({ ...data, budget: budget ? l(budget.label) : data.budget }, formType, requestType);
      setStatus(result.mode);
    } catch (err) {
      setFailure(errorLine(err, errorLang));
      setStatus('error');
    }
  };

  if (status === 'sent' || status === 'simulated') {
    const sent = status === 'sent';
    return (
      <div role="status" className="reveal border border-line bg-surface p-8 sm:p-12">
        {!sent && <p className="eyebrow mb-4">Demo</p>}
        <h3 className="font-display text-3xl text-ink">{sent ? m.form.sentTitle : m.form.successTitle}</h3>
        <p className="mt-4 max-w-lg leading-relaxed text-ink-soft">{sent ? m.form.sentText : m.form.successText}</p>
        <Button
          variant="outline"
          className="mt-8"
          onClick={() => {
            reset();
            setStatus('idle');
          }}
        >
          {m.form.another}
        </Button>
      </div>
    );
  }

  const hasErrors = Object.keys(errors).length > 0 && submitCount > 0;
  const describedBy = (name: keyof LeadInput) => (errors[name] ? `lead-${name}-error` : undefined);

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onSubmit, (errs) => {
        const first = Object.keys(errs)[0] as keyof LeadInput | undefined;
        if (first) setFocus(first);
      })}
      className="grid gap-8 sm:grid-cols-2"
      aria-busy={isSubmitting}
    >
      {requestLabel && <p className="eyebrow sm:col-span-2">{requestLabel}</p>}
      <RequestItemNote />
      {hasErrors && (
        <p role="alert" className="border-s-2 border-danger ps-4 text-sm text-danger sm:col-span-2">
          {m.form.errorSummary}
        </p>
      )}
      <FieldShell id="lead-name" label={m.form.name} error={errors.name?.message}>
        <TextInput id="lead-name" autoComplete="name" aria-invalid={!!errors.name} aria-describedby={describedBy('name')} {...register('name')} />
      </FieldShell>
      <FieldShell id="lead-email" label={m.form.email} error={errors.email?.message}>
        <TextInput id="lead-email" type="email" dir="ltr" autoComplete="email" aria-invalid={!!errors.email} aria-describedby={describedBy('email')} {...register('email')} />
      </FieldShell>
      <FieldShell id="lead-phone" label={m.form.phone} hint={m.form.phoneHint} error={errors.phone?.message}>
        <TextInput id="lead-phone" type="tel" dir="ltr" inputMode="tel" autoComplete="tel" aria-invalid={!!errors.phone} aria-describedby={describedBy('phone')} {...register('phone')} />
      </FieldShell>
      {formType === 'consultation' && (
      <>
      <FieldShell id="lead-projectType" label={m.form.projectType} error={errors.projectType?.message}>
        <Select id="lead-projectType" aria-invalid={!!errors.projectType} aria-describedby={describedBy('projectType')} {...register('projectType')}>
          <option value="">
            —
          </option>
          {projectChoices.map((t) => (
            <option key={t.value} value={t.value}>
              {l(t.label)}
            </option>
          ))}
        </Select>
      </FieldShell>
      <div className="sm:col-span-2">
        <FieldShell id="lead-budget" label={m.form.budget}>
          <Select id="lead-budget" {...register('budget')}>
            {budgetChoices.map((b) => (
              <option key={b.value} value={b.value}>
                {l(b.label)}
              </option>
            ))}
          </Select>
        </FieldShell>
      </div>
      </>
      )}
      {formType === 'demo' && (
        <FieldShell id="lead-company" label={m.form.company} hint={m.form.optional}>
          <TextInput id="lead-company" autoComplete="organization" {...register('company')} />
        </FieldShell>
      )}
      {(formType === 'reservation' || formType === 'demo') && (
        <FieldShell id="lead-date" label={m.form.date} error={errors.date?.message}>
          <TextInput id="lead-date" type="date" dir="ltr" aria-invalid={!!errors.date} aria-describedby={describedBy('date')} {...register('date')} />
        </FieldShell>
      )}
      {formType === 'reservation' && (
        <>
          <FieldShell id="lead-time" label={m.form.time} error={errors.time?.message}>
            <TextInput id="lead-time" type="time" dir="ltr" aria-invalid={!!errors.time} aria-describedby={describedBy('time')} {...register('time')} />
          </FieldShell>
          <FieldShell id="lead-people" label={m.form.people} error={errors.people?.message}>
            <TextInput id="lead-people" type="number" min={1} max={500} dir="ltr" inputMode="numeric" aria-invalid={!!errors.people} aria-describedby={describedBy('people')} {...register('people')} />
          </FieldShell>
        </>
      )}
      <div className="sm:col-span-2">
        <FieldShell
          id="lead-message"
          label={formType === 'contact' ? m.form.messageGeneral : formType === 'consultation' ? m.form.message : m.form.notes}
          hint={formType === 'reservation' || formType === 'demo' ? m.form.optional : undefined}
          error={errors.message?.message}
        >
          <TextArea id="lead-message" rows={5} aria-invalid={!!errors.message} aria-describedby={describedBy('message')} {...register('message')} />
        </FieldShell>
      </div>
      <div className="sm:col-span-2">
        <label className="flex cursor-pointer items-start gap-3 text-sm text-ink-soft">
          <input
            id="lead-consent"
            type="checkbox"
            className="mt-0.5 size-4 accent-(--accent)"
            aria-invalid={!!errors.consent}
            aria-describedby={describedBy('consent')}
            {...register('consent')}
          />
          {m.form.consent}
        </label>
        {errors.consent && (
          <p id="lead-consent-error" role="alert" className="mt-2 text-sm text-danger">
            {errors.consent.message}
          </p>
        )}
      </div>
      {status === 'error' && (
        <p role="alert" className="text-sm text-danger sm:col-span-2">
          {m.form.failed} {failure}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
          {isSubmitting && <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border border-current border-t-transparent" />}
          {isSubmitting ? m.form.sending : submitLabel || m.form.submitByType[formType]}
        </Button>
      </div>
    </form>
  );
}
