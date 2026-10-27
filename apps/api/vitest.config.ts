import { defineConfig } from 'vitest/config';

const admin = process.env.TEST_PG_ADMIN_URL ?? 'postgres://sb_admin:sb_admin_dev_password@localhost:5433/postgres';
const controlUrl = new URL(admin);
controlUrl.pathname = '/sb_control_test';

const testEnv: Record<string, string> = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  PG_ADMIN_URL: admin,
  CONTROL_DATABASE_URL: controlUrl.toString(),
  TENANT_DB_HOST: controlUrl.hostname,
  TENANT_DB_PORT: controlUrl.port || '5432',
  TENANT_DB_PREFIX: 'sb_test_',
  TENANT_SECRETS_KEY: Buffer.alloc(32, 7).toString('base64'),
  STORAGE_DRIVER: 'local',
  STORAGE_LOCAL_DIR: './var/test-uploads',
  STORAGE_SIGNING_KEY: 'test-signing-key-0123456789',
  PUBLIC_API_URL: 'http://api.test',
};

// Global setup runs in this process, so it needs the same variables.
Object.assign(process.env, testEnv);

export default defineConfig({
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'] } },
  test: {
    globalSetup: ['./test/global-setup.ts'],
    // Tests share one Postgres server, so files run one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: testEnv,
  },
});
