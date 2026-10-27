import type pg from 'pg';

interface AuditEntry {
  actorUserId?: string | null;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
}

/** Platform-wide events (sign-ins, tenant lifecycle). */
export async function auditPlatform(db: pg.Pool | pg.PoolClient, entry: AuditEntry & { tenantId?: string | null; ip?: string }) {
  await db.query(
    'INSERT INTO audit_events (actor_user_id, tenant_id, action, target, metadata, ip) VALUES ($1, $2, $3, $4, $5, $6)',
    [entry.actorUserId ?? null, entry.tenantId ?? null, entry.action, entry.target ?? null, entry.metadata ?? {}, entry.ip ?? null],
  );
}

/** Events inside one tenant's database (content and order changes). */
export async function auditTenant(db: pg.Pool | pg.PoolClient, entry: AuditEntry) {
  await db.query('INSERT INTO audit_events (actor_user_id, action, target, metadata) VALUES ($1, $2, $3, $4)', [
    entry.actorUserId ?? null,
    entry.action,
    entry.target ?? null,
    entry.metadata ?? {},
  ]);
}
