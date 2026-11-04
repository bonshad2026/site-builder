import { paymentCatalogEntrySchema, paymentCatalogSchema, type PaymentCatalogEntry } from '@site-builder/shared';
import { z } from 'zod';
import { notFound } from '../../common/errors.js';
import { ApiRouter } from '../../common/http.js';
import type { AppContext } from '../../context.js';
import { auditPlatform } from '../audit/audit.js';
import { PAYMENT_DRIVERS, driverFor, driverView } from './drivers.js';

/**
 * The studio's gateway catalog (`app_settings` key `payment_catalog`): which gateways sites may
 * be given, and the name, note and "allowed" a site starts with. A gateway missing from the
 * stored catalog uses the defaults, so a new driver shows up on its own. A client's server has
 * no catalog of its own: there every gateway counts as on and its site rows decide.
 */

const KEY = 'payment_catalog';

export async function loadCatalog(ctx: Pick<AppContext, 'control'>): Promise<Record<string, PaymentCatalogEntry>> {
  const { rows } = await ctx.control.query<{ value: unknown }>('SELECT value FROM app_settings WHERE key = $1', [KEY]);
  const stored = paymentCatalogSchema.safeParse(rows[0]?.value ?? {});
  const saved = stored.success ? stored.data : {};
  return Object.fromEntries(PAYMENT_DRIVERS.map((d) => [d.key, saved[d.key] ?? paymentCatalogEntrySchema.parse({})]));
}

export function paymentCatalogRoutes(ctx: AppContext) {
  const r = new ApiRouter('/api/v1/platform/payment-gateways', 'Platform', true);

  const view = async () => {
    const catalog = await loadCatalog(ctx);
    return PAYMENT_DRIVERS.map((d) => ({ ...driverView(d, ctx), ...catalog[d.key] }));
  };

  r.route({ method: 'get', path: '/', summary: 'The studio gateway catalog' }, async () => ({ data: await view() }));

  r.route(
    { method: 'put', path: '/:provider', summary: 'Change one gateway in the studio catalog', params: z.object({ provider: z.string().max(32) }), body: paymentCatalogEntrySchema },
    async ({ req, params, body }) => {
      if (!driverFor(params.provider)) throw notFound('Gateway');
      const catalog = { ...(await loadCatalog(ctx)), [params.provider]: body };
      await ctx.control.query(`INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [KEY, catalog]);
      await auditPlatform(ctx.control, { actorUserId: req.auth!.user.id, action: 'payments.catalog_updated', metadata: { provider: params.provider, enabled: body.enabled } });
      return { data: await view() };
    },
  );

  return r.router;
}
