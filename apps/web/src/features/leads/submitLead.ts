import { siteConfig } from '../../config/site';
import type { Lead } from './leadSchema';

export type SubmitResult = { mode: 'sent' } | { mode: 'simulated' };

const API_URL = import.meta.env.VITE_API_URL as string | undefined;

const leadType = (projectType: Lead['projectType']) => (projectType === 'consultation' ? 'consultation' : projectType === 'furniture' ? 'service_request' : 'contact');

/**
 * Sends the enquiry to POST /api/v1/public/sites/:site/leads.
 * Without VITE_API_URL (e.g. a static demo with no backend) nothing is sent,
 * and the result says so, so the UI never claims a delivery that did not happen.
 */
export async function submitLead(lead: Lead): Promise<SubmitResult> {
  if (!API_URL) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    return { mode: 'simulated' };
  }
  const res = await fetch(`${API_URL}/api/v1/public/sites/${siteConfig.id}/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: leadType(lead.projectType),
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      projectType: lead.projectType,
      budget: lead.budget,
      message: lead.message,
      consent: lead.consent,
      sourcePath: window.location.pathname,
    }),
  });
  if (!res.ok) throw new Error(`Lead submission failed with ${res.status}`);
  return { mode: 'sent' };
}
