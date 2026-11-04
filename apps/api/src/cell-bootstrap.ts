/**
 * Cell start-up: the operator account (signs in through the control panel), the client's
 * owner account and the one client site of this cell. Safe to re-run; existing data is kept.
 */
import { slugSchema } from '@site-builder/shared';
import { loadEnv } from './config/env.js';
import { closeContext, createContext } from './context.js';
import { createUser } from './modules/auth/auth.service.js';
import { provisionTenant } from './modules/platform/provisioning.js';

const env = loadEnv();
const required = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
};

const ctx = createContext(env);
try {
  const slug = slugSchema.parse(required('CELL_SLUG'));
  // Sign-in names: an email or a plain username (e.g. "owner"); passwords are the operator's choice.
  const operatorEmail = required('CELL_OPERATOR_EMAIL').trim().toLowerCase();
  const ownerEmail = required('CELL_OWNER_EMAIL').trim().toLowerCase();
  const userId = async (email: string) => (await ctx.control.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email])).rows[0]?.id;

  const operatorId =
    (await userId(operatorEmail)) ??
    (await createUser(ctx, { email: operatorEmail, password: required('CELL_OPERATOR_PASSWORD'), isPlatformAdmin: true, displayName: 'Operator' })).id;
  if (!(await userId(ownerEmail))) {
    await createUser(ctx, { email: ownerEmail, password: required('CELL_OWNER_PASSWORD'), displayName: 'Owner' });
  }

  const existing = await ctx.control.query<{ status: string }>('SELECT status FROM tenants WHERE slug = $1', [slug]);
  if (existing.rows[0]?.status === 'active') {
    console.log(`cell ${slug}: site already exists`);
  } else {
    const tenant = await provisionTenant(ctx, { slug, name: process.env.CELL_NAME || slug, ownerEmail, domain: process.env.CELL_DOMAIN || undefined, actorUserId: operatorId });
    console.log(`cell ${slug}: site ${tenant.status} (database ${tenant.db_name})`);
  }
} finally {
  await closeContext(ctx);
}
