import { z } from 'zod';
import { decryptSecret, encryptSecret } from '../../common/crypto.js';
import { badRequest } from '../../common/errors.js';
import { ApiRouter } from '../../common/http.js';
import type { AppContext } from '../../context.js';
import { auditPlatform } from '../audit/audit.js';
import type { PanelMessaging } from '../auth/notifications.js';

/**
 * E-mail (SMTP) and SMS (Kavenegar) set in the admin panel instead of the server's environment.
 * Stored in the control database; the SMTP address and API key are encrypted, and the API never
 * returns them, only whether they are set.
 */

const KEY = 'messaging';

export async function loadMessaging(ctx: Pick<AppContext, 'control' | 'env'>): Promise<PanelMessaging | null> {
  const { rows } = await ctx.control.query<{ value: PanelMessaging }>('SELECT value FROM app_settings WHERE key = $1', [KEY]);
  const v = rows[0]?.value;
  if (!v) return null;
  const open = (s: string) => (s ? decryptSecret(s, ctx.env.TENANT_SECRETS_KEY) : '');
  return { email: { ...v.email, smtpUrl: open(v.email.smtpUrl) }, sms: { ...v.sms, apiKey: open(v.sms.apiKey) } };
}

const inputSchema = z.object({
  email: z.object({
    enabled: z.boolean(),
    /** Empty = keep the saved one. */
    smtpUrl: z.string().trim().max(500).default(''),
    from: z.string().trim().max(200).default(''),
  }),
  sms: z.object({
    enabled: z.boolean(),
    apiKey: z.string().trim().max(200).default(''),
    otpTemplate: z.string().trim().max(60).default(''),
    sender: z.string().trim().max(30).default(''),
  }),
});

export function messagingRoutes(ctx: AppContext, reset: () => void) {
  const r = new ApiRouter('/api/v1/platform', 'Platform', true);

  r.route({ method: 'get', path: '/messaging', summary: 'E-mail and SMS settings (secrets are never returned)' }, async () => {
    const v = await loadMessaging(ctx);
    return {
      data: {
        email: { enabled: !!v?.email.enabled, from: v?.email.from ?? '', hasSmtpUrl: !!v?.email.smtpUrl },
        sms: { enabled: !!v?.sms.enabled, otpTemplate: v?.sms.otpTemplate ?? '', sender: v?.sms.sender ?? '', hasApiKey: !!v?.sms.apiKey },
        server: { email: ctx.env.EMAIL_PROVIDER, sms: ctx.env.SMS_PROVIDER },
      },
    };
  });

  r.route({ method: 'put', path: '/messaging', summary: 'Save e-mail and SMS settings', body: inputSchema }, async ({ req, body }) => {
    const old = await loadMessaging(ctx);
    const smtpUrl = body.email.smtpUrl || old?.email.smtpUrl || '';
    const apiKey = body.sms.apiKey || old?.sms.apiKey || '';
    if (smtpUrl && !/^smtps?:\/\//i.test(smtpUrl)) throw badRequest('The SMTP address starts with smtp:// or smtps://');
    if (body.email.enabled && (!smtpUrl || !body.email.from)) throw badRequest('E-mail needs an SMTP address and a sender');
    if (body.sms.enabled && !apiKey) throw badRequest('SMS needs a Kavenegar API key');
    const seal = (s: string) => (s ? encryptSecret(s, ctx.env.TENANT_SECRETS_KEY) : '');
    const value: PanelMessaging = { email: { ...body.email, smtpUrl: seal(smtpUrl) }, sms: { ...body.sms, apiKey: seal(apiKey) } };
    await ctx.control.query(`INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [KEY, value]);
    reset();
    await auditPlatform(ctx.control, { actorUserId: req.auth!.user.id, action: 'messaging.updated', metadata: { email: body.email.enabled, sms: body.sms.enabled } });
  });

  r.route(
    { method: 'post', path: '/messaging/test', summary: 'Send a test e-mail and / or SMS', body: z.object({ email: z.string().trim().email().optional(), phone: z.string().trim().max(20).optional() }) },
    async ({ body }) => {
      const result: { email?: string; sms?: string } = {};
      if (body.email) {
        try {
          await ctx.email.send({ to: body.email, subject: 'Test / آزمایش', text: 'This is a test e-mail from your site.\nاین یک ایمیل آزمایشی از سایت شماست.' });
          result.email = 'ok';
        } catch (err) {
          result.email = (err as Error).message;
        }
      }
      if (body.phone) {
        try {
          await ctx.sms.sendText(body.phone, 'پیام آزمایشی \n لغو۱۱');
          result.sms = 'ok';
        } catch (err) {
          result.sms = (err as Error).message;
        }
      }
      return { data: result };
    },
  );

  return r.router;
}
