import { rm } from 'node:fs/promises';
import pg from 'pg';
import { loadEnv } from '../src/config/env.js';
import { initControlPlane } from '../src/database/setup.js';

/** Drops every database and role left by earlier test runs (prefix sb_test_ / sb_control_test). */
async function dropTestDatabases(adminUrl: string) {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const dbs = await admin.query<{ datname: string }>(`SELECT datname FROM pg_database WHERE datname LIKE 'sb\_test\_%' OR datname = 'sb_control_test'`);
    for (const { datname } of dbs.rows) await admin.query(`DROP DATABASE "${datname}" WITH (FORCE)`);
    const roles = await admin.query<{ rolname: string }>(`SELECT rolname FROM pg_roles WHERE rolname LIKE 'sb\_test\_%'`);
    for (const { rolname } of roles.rows) await admin.query(`DROP ROLE "${rolname}"`);
  } finally {
    await admin.end();
  }
}

export async function setup() {
  const env = loadEnv();
  await dropTestDatabases(env.PG_ADMIN_URL);
  await initControlPlane(env);
}

export async function teardown() {
  const env = loadEnv();
  await dropTestDatabases(env.PG_ADMIN_URL);
  await rm(env.STORAGE_LOCAL_DIR, { recursive: true, force: true });
}
