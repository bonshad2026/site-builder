import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router, type RequestHandler } from 'express';
import { forbidden } from './common/errors.js';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { registry } from './common/http.js';
import type { AppContext } from './context.js';
import { loadSession, requireAuth, requirePlatformAdmin } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { loadMemberTenant, loadPublicTenant } from './middleware/tenant.js';
import { assetsRoutes } from './modules/assets/assets.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { ssoLogin } from './modules/auth/sso.js';
import { productsRoutes, servicesRoutes } from './modules/catalog/catalog.js';
import { collectionsRoutes } from './modules/collections/collections.routes.js';
import { leadsRoutes } from './modules/leads/leads.routes.js';
import { membersRoutes } from './modules/members/members.routes.js';
import { ordersRoutes } from './modules/orders/orders.routes.js';
import { pagesRoutes } from './modules/pages/pages.routes.js';
import { platformRoutes } from './modules/platform/platform.routes.js';
import { publicRoutes, resolveRoutes } from './modules/public/public.routes.js';
import { siteRoutes } from './modules/site/site.routes.js';
import { filesRoutes } from './storage/files.routes.js';
import { paymentReturnRoutes, paymentSettingsRoutes } from './modules/payments/payments.routes.js';
import { overviewRoutes } from './modules/site/overview.routes.js';
import './types.js';

export function createApp(ctx: AppContext) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', ctx.env.TRUST_PROXY);

  if (ctx.env.NODE_ENV !== 'test') app.use(pinoHttp({ logger: ctx.log, autoLogging: { ignore: (req) => req.url === '/health' } }));
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  // Credentials (cookies) are only accepted from the configured web origins.
  app.use(cors({ origin: ctx.env.corsOrigins, credentials: true, allowedHeaders: ['Content-Type', 'X-CSRF-Token'] }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(loadSession(ctx));

  app.get('/health', async (_req, res) => {
    await ctx.control.query('SELECT 1');
    res.json({ status: 'ok', storage: ctx.storage.driver, email: ctx.email.name, sms: ctx.sms.name });
  });
  app.use(filesRoutes(ctx));

  app.get('/api/v1/auth/sso', (req, res, next) => ssoLogin(ctx, req, res).catch(next));
  app.use('/api/v1/auth', authRoutes(ctx));
  app.use('/api/v1/platform', requirePlatformAdmin, platformRoutes(ctx));

  // Everything under a site: membership (or platform admin) is checked first, from the session.
  const site = Router({ mergeParams: true });
  site.use(requireAuth, loadMemberTenant(ctx));
  // Cell mode: the client manages its data; building the site (pages, design) is the operator's.
  const clientLocked = !!ctx.env.CELL_SLUG;
  const operatorOnly: RequestHandler = (req, _res, next) =>
    next(clientLocked && !req.auth!.user.isPlatformAdmin ? forbidden('Only the site operator can change the site structure') : undefined);
  site.use('/', siteRoutes(clientLocked));
  site.use('/pages', pagesRoutes(clientLocked));
  site.use('/services', servicesRoutes(ctx.storage));
  site.use('/products', productsRoutes(ctx.storage));
  site.use('/collections', collectionsRoutes(ctx.storage, operatorOnly));
  site.use('/payment-settings', paymentSettingsRoutes(ctx));
  site.use('/overview', operatorOnly, overviewRoutes());
  site.use('/leads', leadsRoutes());
  site.use('/orders', ordersRoutes());
  site.use('/assets', assetsRoutes(ctx));
  site.use('/members', membersRoutes(ctx));
  app.use('/api/v1/sites/:siteId', site);

  app.use('/api/v1/payments', express.urlencoded({ extended: false, limit: '10kb' }), paymentReturnRoutes(ctx));
  app.use('/api/v1/public', resolveRoutes(ctx));
  app.use('/api/v1/public/sites/:siteSlug', loadPublicTenant(ctx), publicRoutes(ctx));

  const openapi = new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: { title: 'Site Builder API', version: '1.0.0', description: 'Responses are `{ data, meta? }`; errors are `{ error: { code, message, details? } }`.' },
    servers: [{ url: ctx.env.PUBLIC_API_URL }],
  });
  app.get('/api/v1/openapi.json', (_req, res) => res.json(openapi));

  app.use(notFoundHandler);
  app.use(errorHandler(ctx.log));
  return app;
}
