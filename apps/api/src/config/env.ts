import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    /** Platform (control-plane) database used by the API at runtime. */
    CONTROL_DATABASE_URL: z.string().url(),
    /**
     * Superuser-level connection used ONLY by the provisioning service to create
     * tenant databases and roles. Never exposed to request handlers.
     */
    PG_ADMIN_URL: z.string().url(),
    /** Host/port the API uses to reach tenant databases (credentials are per tenant). */
    TENANT_DB_HOST: z.string().default('localhost'),
    TENANT_DB_PORT: z.coerce.number().int().default(5432),
    TENANT_DB_PREFIX: z.string().regex(/^[a-z][a-z0-9_]{1,20}$/).default('sb_t_'),
    TENANT_POOL_MAX_OPEN: z.coerce.number().int().min(1).default(50),
    TENANT_POOL_SIZE: z.coerce.number().int().min(1).default(5),
    /** 32-byte key (base64) encrypting tenant DB passwords at rest. */
    TENANT_SECRETS_KEY: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, 'Must be 32 bytes, base64-encoded'),

    PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
    WEB_APP_URL: z.string().url().default('http://localhost:5173'),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    COOKIE_SECURE: bool.optional(),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).default(24 * 7),
    ALLOW_PUBLIC_SIGNUP: bool.default('false'),

    EMAIL_PROVIDER: z.enum(['console', 'smtp']).default('console'),
    SMTP_URL: z.string().optional(),
    EMAIL_FROM: z.string().default('Site Builder <no-reply@localhost>'),

    SMS_PROVIDER: z.enum(['console', 'kavenegar']).default('console'),
    KAVENEGAR_API_KEY: z.string().optional(),
    KAVENEGAR_OTP_TEMPLATE: z.string().optional(),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('./var/uploads'),
    STORAGE_SIGNING_KEY: z.string().min(16).default('dev-only-signing-key-change-me'),
    S3_ENDPOINT: z.string().url().optional(),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: bool.default('true'),
    S3_PUBLIC_BASE_URL: z.string().url().optional(),
    UPLOAD_MAX_BYTES: z.coerce.number().int().default(10 * 1024 * 1024),
    /** Local test gateway (no real money). Defaults to on outside production; refused in production. */
    PAYMENT_SANDBOX_ENABLED: bool.optional(),

    /** Cell mode: this API serves exactly one client site, in its own isolated stack. */
    CELL_SLUG: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/).optional(),
    /** Shared only with the control panel; signs its one-time sign-in links. */
    CELL_SSO_SECRET: z.string().min(32).optional(),
    /** Express "trust proxy" setting (e.g. "uniquelocal" behind the edge proxy). */
    TRUST_PROXY: z.string().default('loopback'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    // Development stand-ins must never be mistaken for real delivery in production.
    if (env.EMAIL_PROVIDER === 'console') ctx.addIssue({ code: 'custom', path: ['EMAIL_PROVIDER'], message: 'console email is not allowed in production' });
    if (env.SMS_PROVIDER === 'console') ctx.addIssue({ code: 'custom', path: ['SMS_PROVIDER'], message: 'console SMS/OTP is not allowed in production' });
    if (env.PAYMENT_SANDBOX_ENABLED) ctx.addIssue({ code: 'custom', path: ['PAYMENT_SANDBOX_ENABLED'], message: 'the sandbox payment gateway is not allowed in production' });
    if (env.STORAGE_SIGNING_KEY.startsWith('dev-only')) ctx.addIssue({ code: 'custom', path: ['STORAGE_SIGNING_KEY'], message: 'set a real signing key' });
    if (env.EMAIL_PROVIDER === 'smtp' && !env.SMTP_URL) ctx.addIssue({ code: 'custom', path: ['SMTP_URL'], message: 'required for smtp' });
    if (env.SMS_PROVIDER === 'kavenegar' && !env.KAVENEGAR_API_KEY) ctx.addIssue({ code: 'custom', path: ['KAVENEGAR_API_KEY'], message: 'required for kavenegar' });
    if (env.STORAGE_DRIVER === 's3' && !(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY)) {
      ctx.addIssue({ code: 'custom', path: ['S3_BUCKET'], message: 'S3 bucket and credentials are required' });
    }
  });

export type Env = z.infer<typeof schema> & { cookieSecure: boolean; corsOrigins: string[]; paymentSandboxEnabled: boolean };

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Empty values in .env mean "not set".
  const parsed = schema.safeParse(Object.fromEntries(Object.entries(source).filter(([, v]) => v !== '')));
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${lines}`);
  }
  const env = parsed.data;
  return {
    ...env,
    cookieSecure: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
    corsOrigins: env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    paymentSandboxEnabled: env.PAYMENT_SANDBOX_ENABLED ?? env.NODE_ENV !== 'production',
  };
}
