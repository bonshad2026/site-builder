import pg from 'pg';
import type { Env } from './config/env.js';
import { createLogger, type Logger } from './common/logger.js';
import { TenantPools } from './database/tenant/pools.js';
import { createNotifiers, type EmailSender, type SmsSender } from './modules/auth/notifications.js';
import { createStorage, type StorageAdapter } from './storage/storage.js';

/** Process-wide dependencies, created once and passed to modules explicitly. */
export interface AppContext {
  env: Env;
  log: Logger;
  control: pg.Pool;
  tenantPools: TenantPools;
  email: EmailSender;
  sms: SmsSender;
  storage: StorageAdapter;
  /** Outgoing HTTP (payment gateways); replaceable in tests. */
  httpFetch: typeof fetch;
}

export function createContext(env: Env, overrides: Partial<AppContext> = {}): AppContext {
  const log = overrides.log ?? createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');
  const control = new pg.Pool({ connectionString: env.CONTROL_DATABASE_URL, max: 10, application_name: 'site-builder-api' });
  control.on('error', (err) => log.error({ err }, 'control-plane pool error'));
  const notifiers = createNotifiers(env, log);
  return {
    env,
    log,
    control,
    tenantPools: new TenantPools({
      host: env.TENANT_DB_HOST,
      port: env.TENANT_DB_PORT,
      maxOpen: env.TENANT_POOL_MAX_OPEN,
      poolSize: env.TENANT_POOL_SIZE,
      secretsKey: env.TENANT_SECRETS_KEY,
    }),
    email: notifiers.email,
    sms: notifiers.sms,
    storage: createStorage(env),
    httpFetch: fetch,
    ...overrides,
  };
}

export async function closeContext(ctx: AppContext): Promise<void> {
  await ctx.tenantPools.closeAll();
  await ctx.control.end();
}
