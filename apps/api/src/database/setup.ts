import pg from 'pg';
import type { Env } from '../config/env.js';
import { CONTROL_MIGRATIONS_DIR, migrate } from './migrator.js';

const SAFE = /^[a-z][a-z0-9_]{1,62}$/;

/**
 * Creates the control-plane database (and its runtime role, if it differs from
 * the admin role) when missing, then applies control-plane migrations.
 */
export async function initControlPlane(env: Env): Promise<string[]> {
  const target = new URL(env.CONTROL_DATABASE_URL);
  const dbName = target.pathname.slice(1);
  const user = decodeURIComponent(target.username);
  const password = decodeURIComponent(target.password);
  if (!SAFE.test(dbName) || !SAFE.test(user)) throw new Error('Control database and user names must be lowercase identifiers');

  const admin = new pg.Client({ connectionString: env.PG_ADMIN_URL });
  await admin.connect();
  try {
    const adminUser = (await admin.query<{ u: string }>('SELECT current_user AS u')).rows[0].u;
    if (user !== adminUser) {
      const exists = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [user]);
      if (!exists.rowCount) await admin.query(`CREATE ROLE "${user}" LOGIN PASSWORD '${password.replace(/'/g, "''")}'`);
    }
    const db = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (!db.rowCount) await admin.query(`CREATE DATABASE "${dbName}" OWNER "${user}" ENCODING 'UTF8' TEMPLATE template0`);
    await admin.query(`REVOKE ALL ON DATABASE "${dbName}" FROM PUBLIC`);
    await admin.query(`GRANT CONNECT, TEMPORARY ON DATABASE "${dbName}" TO "${user}"`);
  } finally {
    await admin.end();
  }

  const client = new pg.Client({ connectionString: env.CONTROL_DATABASE_URL });
  await client.connect();
  try {
    return await migrate(client, CONTROL_MIGRATIONS_DIR);
  } finally {
    await client.end();
  }
}
