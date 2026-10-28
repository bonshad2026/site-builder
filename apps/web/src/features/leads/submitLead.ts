import { API_URL } from '../../lib/api';
import { DEFAULT_SITE_ID } from '../public-site/data';
import type { FormType, Lead } from './leadSchema';

export type SubmitResult = { mode: 'sent' } | { mode: 'simulated' };

const leadType = (formType: FormType, projectType: Lead['projectType']) =>
  formType === 'reservation' || formType === 'demo'
    ? formType
    : projectType === 'consultation'
      ? 'consultation'
      : projectType === 'furniture'
        ? 'service_request'
        : 'contact';

/**
 * Sends the request to POST /api/v1/public/sites/:site/leads.
 * Without VITE_API_URL (e.g. a static demo with no backend) nothing is sent,
 * and the result says so, so the UI never claims a delivery that did not happen.
 */
export async function submitLead(lead: Lead, formType: FormType = 'consultation'): Promise<SubmitResult> {
  if (!API_URL) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    return { mode: 'simulated' };
  }
  const details = {
    ...(lead.date ? { date: lead.date } : {}),
    ...(lead.time ? { time: lead.time } : {}),
    ...(lead.people ? { people: lead.people } : {}),
    ...(lead.company ? { company: lead.company } : {}),
  };
  const res = await fetch(`${API_URL}/api/v1/public/sites/${DEFAULT_SITE_ID}/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: leadType(formType, lead.projectType),
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      projectType: lead.projectType || undefined,
      budget: lead.budget,
      // The API needs a message; bookings without a note send a short summary instead.
      message: lead.message || [lead.date, lead.time, lead.people, lead.company].filter(Boolean).join(' · ') || formType,
      details,
      sourcePath: window.location.pathname,
      consent: true,
    }),
  });
  if (!res.ok) throw new Error(`Lead submission failed with ${res.status}`);
  return { mode: 'sent' };
}
