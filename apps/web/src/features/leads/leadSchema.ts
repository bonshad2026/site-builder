import { z } from 'zod';

export const projectTypes = ['residential', 'hospitality', 'consultation', 'furniture'] as const;
export const budgets = ['small', 'medium', 'large', 'unsure'] as const;

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
}

export function createLeadSchema(e: LeadErrorMessages) {
  return z.object({
    name: z.string().trim().min(2, e.nameRequired).max(120, e.nameRequired),
    email: z.string().trim().email(e.emailInvalid),
    phone: z
      .string()
      .trim()
      .transform(normalizeDigits)
      .refine((v) => v === '' || PHONE.test(v), e.phoneInvalid),
    projectType: z.enum(projectTypes, { errorMap: () => ({ message: e.projectTypeRequired }) }),
    budget: z.enum(budgets),
    message: z.string().trim().min(20, e.messageShort).max(4000),
    consent: z.boolean().refine((v) => v, e.consentRequired),
  });
}

export type LeadInput = z.input<ReturnType<typeof createLeadSchema>>;
export type Lead = z.output<ReturnType<typeof createLeadSchema>>;
