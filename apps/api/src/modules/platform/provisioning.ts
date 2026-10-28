import { siteSettingsSchema, type SiteSettings } from '@site-builder/shared';
import pg from 'pg';
import { encryptSecret, decryptSecret, randomToken } from '../../common/crypto.js';
import { AppError } from '../../common/errors.js';
import type { AppContext } from '../../context.js';
import { latestMigration, migrate, TENANT_MIGRATIONS_DIR } from '../../database/migrator.js';
import { auditPlatform } from '../audit/audit.js';
import { createUser, requestPasswordReset } from '../auth/auth.service.js';

const IDENTIFIER = /^[a-z][a-z0-9_]{1,62}$/;

/** Postgres identifiers cannot be bound as parameters; only allow a strict charset and quote them. */
function ident(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`Unsafe identifier: ${name}`);
  return `"${name}"`;
}

const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;

export function tenantDbName(prefix: string, slug: string) {
  return `${prefix}${slug.replace(/-/g, '_')}`;
}

export function defaultSiteSettings(name: string): SiteSettings {
  return siteSettingsSchema.parse({
    name: { en: name, fa: name },
    tagline: { en: '', fa: '' },
    defaultLocale: 'fa',
    locales: ['fa', 'en'],
    themeId: 'ivory',
    logoAssetId: null,
    contact: { email: '', phone: '', address: { en: '', fa: '' }, hours: { en: '', fa: '' } },
    social: [],
    nav: [],
    modules: { services: true, products: true, projects: true, testimonials: true, faq: true, leads: true, orders: false },
    seo: { titleTemplate: `%s — ${name}`, defaultDescription: { en: '', fa: '' } },
    business: { founded: null, stats: [] },
  });
}

interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  status: string;
  db_name: string;
  db_user: string;
  db_password_enc: string | null;
}

export interface ProvisionInput {
  slug: string;
  name: string;
  ownerEmail: string;
  domain?: string;
  actorUserId: string;
}

async function setStep(ctx: AppContext, tenantId: string, step: string) {
  await ctx.control.query('UPDATE tenants SET provisioning_step = $2, updated_at = now() WHERE id = $1', [tenantId, step]);
}

/**
 * Creates (or safely resumes) a tenant. Every step is idempotent, so a failed
 * run can be retried; the tenant only becomes `active` after all required
 * steps have succeeded. Uses the admin connection, which is never available
 * to ordinary request handlers.
 */
export async function provisionTenant(ctx: AppContext, input: ProvisionInput): Promise<TenantRecord> {
  const dbName = tenantDbName(ctx.env.TENANT_DB_PREFIX, input.slug);

  // 1. Register (or reuse a failed/in-progress registration of) the tenant.
  const existing = await ctx.control.query<TenantRecord>('SELECT * FROM tenants WHERE slug = $1', [input.slug]);
  let tenant = existing.rows[0];
  if (tenant && tenant.status === 'active') throw new AppError(409, 'conflict', 'A site with this id already exists');
  if (!tenant) {
    const password = randomToken(24);
    const { rows } = await ctx.control.query<TenantRecord>(
      `INSERT INTO tenants (slug, name, db_name, db_user, db_password_enc, status, provisioning_step, created_by)
       VALUES ($1, $2, $3, $3, $4, 'provisioning', 'registered', $5) RETURNING *`,
      [input.slug, input.name, dbName, encryptSecret(password, ctx.env.TENANT_SECRETS_KEY), input.actorUserId],
    );
    tenant = rows[0];
  } else {
    await ctx.control.query(`UPDATE tenants SET status = 'provisioning', last_error = NULL, updated_at = now() WHERE id = $1`, [tenant.id]);
  }
  await auditPlatform(ctx.control, { actorUserId: input.actorUserId, tenantId: tenant.id, action: 'tenant.provision_started', target: input.slug });

  const password = decryptSecret(tenant.db_password_enc!, ctx.env.TENANT_SECRETS_KEY);
  const admin = new pg.Client({ connectionString: ctx.env.PG_ADMIN_URL, application_name: 'site-builder-provisioner' });

  try {
    await admin.connect();

    // 2. A login role that owns only this tenant's database.
    await setStep(ctx, tenant.id, 'role');
    const role = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [tenant.db_user]);
    const roleSql = role.rowCount ? 'ALTER ROLE' : 'CREATE ROLE';
    await admin.query(`${roleSql} ${ident(tenant.db_user)} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${literal(password)}`);

    // 3. The database itself; other roles (including other tenants) cannot connect.
    await setStep(ctx, tenant.id, 'database');
    const db = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [tenant.db_name]);
    if (!db.rowCount) await admin.query(`CREATE DATABASE ${ident(tenant.db_name)} OWNER ${ident(tenant.db_user)} ENCODING 'UTF8' TEMPLATE template0`);
    await admin.query(`REVOKE ALL ON DATABASE ${ident(tenant.db_name)} FROM PUBLIC`);
    await admin.query(`GRANT CONNECT, TEMPORARY ON DATABASE ${ident(tenant.db_name)} TO ${ident(tenant.db_user)}`);
    await admin.end();

    // 4–5. Migrations and initial content, connected as the tenant's own role.
    const tenantClient = new pg.Client({ host: ctx.env.TENANT_DB_HOST, port: ctx.env.TENANT_DB_PORT, database: tenant.db_name, user: tenant.db_user, password });
    await tenantClient.connect();
    try {
      await setStep(ctx, tenant.id, 'migrate');
      await migrate(tenantClient, TENANT_MIGRATIONS_DIR);
      await setStep(ctx, tenant.id, 'seed');
      await tenantClient.query('INSERT INTO site_settings (id, settings) VALUES (1, $1) ON CONFLICT (id) DO NOTHING', [defaultSiteSettings(input.name)]);
      await tenantClient.query(
        `INSERT INTO pages (slug, title, is_home, draft) VALUES ('home', $1, true, $2) ON CONFLICT (slug) DO NOTHING`,
        [{ en: 'Home', fa: 'خانه' }, { schemaVersion: 1, sections: [] }],
      );
      // An About page to start from (draft until the operator fills and publishes it).
      await tenantClient.query(`INSERT INTO pages (slug, title, is_home, position, draft) VALUES ('about', $1, false, 1, $2) ON CONFLICT (slug) DO NOTHING`, [
        { en: 'About us', fa: 'درباره ما' },
        {
          schemaVersion: 1,
          sections: [
            { id: 's1', type: 'page-header', props: { eyebrow: { en: input.name, fa: input.name }, heading: { en: 'About us', fa: 'درباره ما' }, intro: { en: '', fa: '' } } },
            { id: 's2', type: 'image-text', props: { heading: { en: 'Our story', fa: 'داستان ما' }, body: { en: 'Tell visitors who you are and what you do.', fa: 'به بازدیدکنندگان بگویید چه کسی هستید و چه کاری انجام می‌دهید.' } } },
          ],
        },
      ]);
    } finally {
      await tenantClient.end();
    }

    // 6–8. Owner, domain and activation, atomically in the control plane.
    await setStep(ctx, tenant.id, 'owner');
    let ownerId = (await ctx.control.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [input.ownerEmail])).rows[0]?.id;
    let invited = false;
    if (!ownerId) {
      ownerId = (await createUser(ctx, { email: input.ownerEmail })).id;
      invited = true;
    }

    const client = await ctx.control.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO memberships (user_id, tenant_id, role) VALUES ($1, $2, 'owner')
         ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = 'owner'`,
        [ownerId, tenant.id],
      );
      if (input.domain) {
        await client.query(`INSERT INTO tenant_domains (domain, tenant_id, is_primary) VALUES ($1, $2, true) ON CONFLICT (domain) DO NOTHING`, [
          input.domain.toLowerCase(),
          tenant.id,
        ]);
      }
      const { rows } = await client.query<TenantRecord>(
        `UPDATE tenants SET status = 'active', provisioning_step = 'done', last_error = NULL,
                schema_version = $2, activated_at = COALESCE(activated_at, now()), updated_at = now()
          WHERE id = $1 RETURNING *`,
        [tenant.id, await latestMigration(TENANT_MIGRATIONS_DIR)],
      );
      await auditPlatform(client, { actorUserId: input.actorUserId, tenantId: tenant.id, action: 'tenant.provisioned', target: input.slug, metadata: { ownerEmail: input.ownerEmail } });
      await client.query('COMMIT');
      tenant = rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // A new owner sets their password through the reset flow (acts as the invitation).
    if (invited) await requestPasswordReset(ctx, input.ownerEmail);
    return tenant;
  } catch (err) {
    await admin.end().catch(() => {});
    const message = (err as Error).message;
    await ctx.control.query(`UPDATE tenants SET status = 'failed', last_error = $2, updated_at = now() WHERE id = $1`, [tenant.id, message.slice(0, 1000)]);
    await auditPlatform(ctx.control, { actorUserId: input.actorUserId, tenantId: tenant.id, action: 'tenant.provision_failed', metadata: { error: message } });
    ctx.log.error({ err, tenant: tenant.slug }, 'tenant provisioning failed');
    throw new AppError(500, 'provisioning_failed', 'Site provisioning failed. It can be retried safely.', { step: 'see tenant.provisioningStep' });
  }
}

/** Runs pending tenant migrations on every tenant database. One failure does not stop the rest. */
export async function migrateAllTenants(ctx: AppContext) {
  const { rows } = await ctx.control.query<TenantRecord>(`SELECT * FROM tenants WHERE status IN ('active', 'suspended') ORDER BY created_at`);
  const results: { slug: string; applied: string[]; error?: string }[] = [];
  for (const t of rows) {
    const client = new pg.Client({
      host: ctx.env.TENANT_DB_HOST,
      port: ctx.env.TENANT_DB_PORT,
      database: t.db_name,
      user: t.db_user,
      password: decryptSecret(t.db_password_enc!, ctx.env.TENANT_SECRETS_KEY),
    });
    try {
      await client.connect();
      const applied = await migrate(client, TENANT_MIGRATIONS_DIR);
      await ctx.control.query('UPDATE tenants SET schema_version = $2, updated_at = now() WHERE id = $1', [t.id, await latestMigration(TENANT_MIGRATIONS_DIR)]);
      results.push({ slug: t.slug, applied });
    } catch (err) {
      const error = (err as Error).message;
      await ctx.control.query('UPDATE tenants SET last_error = $2, updated_at = now() WHERE id = $1', [t.id, `migration: ${error}`.slice(0, 1000)]);
      results.push({ slug: t.slug, applied: [], error });
    } finally {
      await client.end().catch(() => {});
    }
  }
  return results;
}
