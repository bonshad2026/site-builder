import { z } from 'zod';

export const projectTypes = ['residential', 'hospitality', 'consultation', 'furniture'] as const;
export const budgets = ['small', 'medium', 'large', 'unsure'] as const;

/**
 * What a request form asks for (set per contact-form section):
 * contact (name, contact details, message), consultation (plus project type and budget),
 * reservation (plus date, time and party size) and demo (plus company and preferred date).
 */
export const formTypes = ['contact', 'consultation', 'reservation', 'demo'] as const;
export type FormType = (typeof formTypes)[number];

/** Iranian mobile (09xxxxxxxxx / +989xxxxxxxxx) or a generic international number. Persian digits allowed. */
const PHONE = /^(\+?\d{1,3}[\s-]?)?\d[\d\s-]{7,14}$/;

export function normalizeDigits(value: string): string {
  return value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

export interface LeadErrorMessages {
  nameRequired: string;
  emailInvalid: string;
  phoneInvalid: string;
  projectTypeRequired: string;
  messageShort: string;
  consentRequired: string;
  dateRequired: string;
  timeRequired: string;
  peopleInvalid: string;
}

export function createLeadSchema(e: LeadErrorMessages, formType: FormType = 'consultation') {
  const booking = formType === 'reservation' || formType === 'demo';
  return z.object({
    name: z.string().trim().min(2, e.nameRequired).max(120, e.nameRequired),
    email: z.string().trim().email(e.emailInvalid),
    phone: z
      .string()
      .trim()
      .transform(normalizeDigits)
      .refine((v) => v === '' || PHONE.test(v), e.phoneInvalid),
    // Choices come from the site settings (formOptions), so any value id is accepted here.
    projectType: formType === 'consultation' ? z.string().trim().min(1, e.projectTypeRequired).max(40) : z.string().max(40).optional(),
    budget: z.string().max(40).optional(),
    // Bookings carry their facts in the fields below; a note is optional.
    message: booking ? z.string().trim().max(4000) : z.string().trim().min(20, e.messageShort).max(4000),
    date: booking ? z.string().trim().min(1, e.dateRequired).max(40) : z.string().max(40).optional(),
    time: formType === 'reservation' ? z.string().trim().min(1, e.timeRequired).max(20) : z.string().max(20).optional(),
    people:
      formType === 'reservation'
        ? z.coerce.number({ invalid_type_error: e.peopleInvalid }).int(e.peopleInvalid).min(1, e.peopleInvalid).max(500, e.peopleInvalid)
        : z.coerce.number().optional(),
    company: z.string().trim().max(120).optional(),
    consent: z.boolean().refine((v) => v, e.consentRequired),
  });
}

export type LeadInput = z.input<ReturnType<typeof createLeadSchema>>;
export type Lead = z.output<ReturnType<typeof createLeadSchema>>;
