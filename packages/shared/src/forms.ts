import { formFieldSchema, type FormField } from './siteOptions.js';

/**
 * Every form is built from editable fields. Forms saved before that (version 1) asked for name,
 * phone and email and a consent box outside their fields, and types without own fields used one
 * of four fixed forms. `upgradeRequestType` turns them into the same questions as fields, so the
 * site looks and behaves as before and everything can be changed.
 */

type Lbl = { en: string; fa: string };
const L = (en: string, fa: string): Lbl => ({ en, fa });
const field = (input: Partial<FormField> & { id: string; type: FormField['type']; label: Lbl }): FormField => formFieldSchema.parse(input);

interface Choice {
  label: Lbl;
}

/** The questions of the old fixed forms (contact, consultation, reservation, demo), as fields. */
export function builtInFields(form: string, options: { projectTypes?: Choice[]; budgets?: Choice[] } = {}): FormField[] {
  const choices = (list: Choice[] | undefined) => (list ?? []).map((c) => ({ ...c.label, price: 0 }));
  if (form === 'consultation')
    return [
      field({ id: 'project-type', type: 'select', label: L('Project type', 'نوع پروژه'), required: true, options: choices(options.projectTypes) }),
      field({ id: 'budget', type: 'select', label: L('Approximate budget', 'بودجه تقریبی'), options: choices(options.budgets) }),
      field({ id: 'message', type: 'textarea', label: L('Tell us about your space', 'درباره فضای خود بنویسید'), required: true }),
    ];
  if (form === 'reservation')
    return [
      field({ id: 'date', type: 'date', label: L('Date', 'تاریخ'), required: true, min: 0 }),
      field({ id: 'time', type: 'time', label: L('Time', 'ساعت'), required: true }),
      field({ id: 'people', type: 'number', label: L('Number of guests', 'تعداد نفرات'), required: true, min: 1, max: 500 }),
      field({ id: 'notes', type: 'textarea', label: L('Notes', 'توضیحات') }),
    ];
  if (form === 'demo')
    return [
      field({ id: 'company', type: 'text', label: L('Company', 'نام شرکت') }),
      field({ id: 'date', type: 'date', label: L('Date', 'تاریخ'), required: true, min: 0 }),
      field({ id: 'notes', type: 'textarea', label: L('Notes', 'توضیحات') }),
    ];
  return [field({ id: 'message', type: 'textarea', label: L('Your message', 'پیام شما'), required: true })];
}

/** The fields every converted form starts and ends with. */
export const nameField = () => field({ id: 'name', type: 'text', role: 'name', label: L('Full name', 'نام و نام خانوادگی'), required: true, min: 2, max: 120 });
export const phoneField = (required = false) => field({ id: 'phone', type: 'tel', role: 'phone', label: L('Mobile number', 'شماره موبایل'), required });
export const emailField = (required = true) => field({ id: 'email', type: 'email', role: 'email', label: L('Email', 'ایمیل'), required });
export const consentField = () => field({ id: 'consent', type: 'checkbox', label: L('I agree to be contacted about this enquiry.', 'موافقم برای این درخواست با من تماس گرفته شود.'), required: true, width: 'full' });

interface UpgradableType {
  form: string;
  fields: FormField[];
  contact: { email: 'required' | 'optional' | 'off'; phone: 'required' | 'optional' | 'off' };
  formVersion: number;
}

/** A request type with all its questions as fields (see the module comment). Version 2 types are returned as they are. */
export function upgradeRequestType<T extends UpgradableType>(type: T, options: { projectTypes?: Choice[]; budgets?: Choice[] } = {}): T {
  if (type.formVersion >= 2) return type;
  const own = type.fields.length ? type.fields : builtInFields(type.form, options);
  const taken = new Set(own.map((f) => f.id));
  const unique = (f: FormField) => {
    let id = f.id;
    while (taken.has(id)) id = `${id}-2`;
    taken.add(id);
    return { ...f, id };
  };
  // Forms made with the earlier presets already had a phone question: it becomes the follow-up phone.
  const fields = own.map((f) => (f.type === 'tel' && f.id === 'phone' && !f.role ? { ...f, role: 'phone' as const } : f));
  const head: FormField[] = [unique(nameField())];
  if (type.contact.phone !== 'off' && !fields.some((f) => f.role === 'phone')) head.push(unique(phoneField(type.contact.phone === 'required')));
  if (type.contact.email !== 'off') head.push(unique(emailField(type.contact.email === 'required')));
  return { ...type, fields: [...head, ...fields, unique(consentField())], formVersion: 2 };
}

/** A multi-step form's pages: the fields between `step` breaks, each with its title (the break's label). */
export function formSteps(fields: FormField[]): { title: Lbl | null; fields: FormField[] }[] {
  const steps: { title: Lbl | null; fields: FormField[] }[] = [{ title: null, fields: [] }];
  for (const f of fields) {
    if (f.type === 'step') steps.push({ title: f.label, fields: [] });
    else steps[steps.length - 1].fields.push(f);
  }
  // A break at the very top only names the first page.
  if (steps.length > 1 && !steps[0].fields.length) steps.shift();
  return steps;
}
