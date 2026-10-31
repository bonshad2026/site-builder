import { API_URL, ApiError } from '../../lib/api';
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
export async function submitLead(
  lead: Lead,
  formType: FormType = 'consultation',
  requestType?: string,
  answers?: { label: string; value: string }[],
): Promise<SubmitResult> {
  if (!API_URL) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    return { mode: 'simulated' };
  }
  const details = {
    ...(lead.date ? { date: lead.date } : {}),
    ...(lead.time ? { time: lead.time } : {}),
    ...(lead.people ? { people: lead.people } : {}),
    ...(lead.company ? { company: lead.company } : {}),
    ...(answers?.length ? { answers } : {}),
  };
  // A box's "request" button links here with ?item=<table>/<item>.
  const [collection, slug] = (new URLSearchParams(window.location.search).get('item') ?? '').split('/');
  const item = collection && slug ? { collection, slug } : undefined;
  const res = await fetch(`${API_URL}/api/v1/public/sites/${DEFAULT_SITE_ID}/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // The site's request type when the form has one; older forms derive it from their questions.
      type: requestType || leadType(formType, lead.projectType),
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      projectType: lead.projectType || undefined,
      budget: lead.budget,
      // The API needs a message; bookings without a note send a short summary instead.
      message:
        lead.message ||
        [lead.date, lead.time, lead.people, lead.company, ...(answers ?? []).map((a) => `${a.label}: ${a.value}`)].filter(Boolean).join(' · ').slice(0, 4000) ||
        requestType ||
        formType,
      details,
      sourcePath: window.location.pathname,
      item,
      consent: true,
    }),
  });
  if (!res.ok) {
    // Keep the server's reason (closed registration, rate limit…) so the form can explain it.
    const e = ((await res.json().catch(() => null)) as { error?: { code: string; message: string; details?: ApiError['details'] } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? 'internal_error', e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return { mode: 'sent' };
}
