import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { sha256 } from '../common/crypto.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const CONTROL_MIGRATIONS_DIR = path.join(here, 'control-plane', 'migrations');
export const TENANT_MIGRATIONS_DIR = path.join(here, 'tenant', 'migrations');

export class MigrationError extends Error {
  constructor(
    message: string,
    public readonly migration: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
  }
}

interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

async function loadMigrations(dir: string): Promise<MigrationFile[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  return Promise.all(
    files.map(async (name) => {
      const sql = await readFile(path.join(dir, name), 'utf8');
      return { name, sql, checksum: sha256(sql) };
    }),
  );
}

/**
 * Applies pending .sql migrations in order, each in its own transaction.
 * - Serialised with an advisory lock so two processes never migrate the same DB at once.
 * - Refuses to continue if an applied migration's file was edited afterwards.
 * - A failing migration rolls back, is not recorded, and is re-thrown (never reported as success).
 */
export async function migrate(client: pg.ClientBase, dir: string): Promise<string[]> {
  const migrations = await loadMigrations(dir);
  await client.query('SELECT pg_advisory_lock(hashtext($1))', ['site_builder_migrations']);
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await client.query<{ name: string; checksum: string }>('SELECT name, checksum FROM schema_migrations');
    const applied = new Map(rows.map((r) => [r.name, r.checksum]));

    for (const [name, checksum] of applied) {
      const file = migrations.find((m) => m.name === name);
      if (file && file.checksum !== checksum) {
        throw new MigrationError(`Migration ${name} was modified after it was applied`, name);
      }
    }

    const done: string[] = [];
    for (const m of migrations) {
      if (applied.has(m.name)) continue;
      try {
        await client.query('BEGIN');
        await client.query(m.sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [m.name, m.checksum]);
        await client.query('COMMIT');
        done.push(m.name);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new MigrationError(`Migration ${m.name} failed: ${(err as Error).message}`, m.name, err);
      }
    }
    return done;
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['site_builder_migrations']);
  }
}

export async function latestMigration(dir: string): Promise<string | null> {
  const files = await loadMigrations(dir);
  return files.at(-1)?.name ?? null;
}
