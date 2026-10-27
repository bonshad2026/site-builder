import pg from 'pg';
import { decryptSecret } from '../../common/crypto.js';

export interface TenantConnectionInfo {
  id: string;
  dbName: string;
  dbUser: string;
  dbPasswordEnc: string;
}

interface Options {
  host: string;
  port: number;
  /** Maximum number of tenant pools kept open at once; least recently used are closed. */
  maxOpen: number;
  /** Connections per tenant pool. */
  poolSize: number;
  secretsKey: string;
}

/**
 * One small pool per tenant database, capped overall. Requests never create
 * unbounded pools: a tenant's pool is reused, and the least recently used pool
 * is closed when the cap is reached.
 */
export class TenantPools {
  private readonly pools = new Map<string, { pool: pg.Pool; lastUsed: number }>();

  constructor(private readonly opts: Options) {}

  get(tenant: TenantConnectionInfo): pg.Pool {
    const existing = this.pools.get(tenant.id);
    if (existing) {
      existing.lastUsed = Date.now();
      return existing.pool;
    }
    if (this.pools.size >= this.opts.maxOpen) this.evictLeastRecentlyUsed();

    const pool = new pg.Pool({
      host: this.opts.host,
      port: this.opts.port,
      database: tenant.dbName,
      user: tenant.dbUser,
      password: decryptSecret(tenant.dbPasswordEnc, this.opts.secretsKey),
      max: this.opts.poolSize,
      idleTimeoutMillis: 30_000,
      application_name: 'site-builder-api',
    });
    // An idle client error must not crash the process; the pool discards that client.
    pool.on('error', () => {});
    this.pools.set(tenant.id, { pool, lastUsed: Date.now() });
    return pool;
  }

  get size(): number {
    return this.pools.size;
  }

  async evict(tenantId: string): Promise<void> {
    const entry = this.pools.get(tenantId);
    if (!entry) return;
    this.pools.delete(tenantId);
    await entry.pool.end();
  }

  async closeAll(): Promise<void> {
    const entries = [...this.pools.values()];
    this.pools.clear();
    await Promise.all(entries.map((e) => e.pool.end()));
  }

  private evictLeastRecentlyUsed(): void {
    let oldest: [string, number] | null = null;
    for (const [id, { lastUsed }] of this.pools) {
      if (!oldest || lastUsed < oldest[1]) oldest = [id, lastUsed];
    }
    if (oldest) void this.evict(oldest[0]);
  }
}

/** Runs `fn` inside a transaction on a dedicated client. */
export async function withTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
