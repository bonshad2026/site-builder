import { emailSchema, passwordSchema, slugSchema } from '@site-builder/shared';
import { parseArgs } from 'node:util';
import { loadEnv } from './config/env.js';
import { closeContext, createContext } from './context.js';
import { initControlPlane } from './database/setup.js';
import { createUser } from './modules/auth/auth.service.js';
import { migrateAllTenants, provisionTenant } from './modules/platform/provisioning.js';

const USAGE = `Usage: npm run cli -- <command> [options]

  migrate                              create the control DB if needed, migrate it and every tenant DB
  create-admin --email E --password P  create a platform administrator
  provision --slug S --name N --owner EMAIL [--domain D]
                                       create a client site with its own database`;

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { values } = parseArgs({
    args: rest,
    options: { email: { type: 'string' }, password: { type: 'string' }, slug: { type: 'string' }, name: { type: 'string' }, owner: { type: 'string' }, domain: { type: 'string' } },
  });
  const env = loadEnv();

  if (command === 'migrate') {
    const applied = await initControlPlane(env);
    console.log(`control plane: ${applied.length ? applied.join(', ') : 'up to date'}`);
    const ctx = createContext(env);
    try {
      const results = await migrateAllTenants(ctx);
      for (const r of results) console.log(`tenant ${r.slug}: ${r.error ? `FAILED — ${r.error}` : r.applied.length ? r.applied.join(', ') : 'up to date'}`);
      if (results.some((r) => r.error)) process.exitCode = 1;
    } finally {
      await closeContext(ctx);
    }
    return;
  }

  const ctx = createContext(env);
  try {
    if (command === 'create-admin') {
      const user = await createUser(ctx, { email: emailSchema.parse(values.email), password: passwordSchema.parse(values.password), isPlatformAdmin: true, displayName: 'Administrator' });
      console.log(`created platform admin ${user.email} (${user.id})`);
    } else if (command === 'provision') {
      const admin = await ctx.control.query<{ id: string }>('SELECT id FROM users WHERE is_platform_admin ORDER BY created_at LIMIT 1');
      if (!admin.rows[0]) throw new Error('Create a platform admin first (create-admin)');
      const tenant = await provisionTenant(ctx, {
        slug: slugSchema.parse(values.slug),
        name: String(values.name ?? values.slug),
        ownerEmail: emailSchema.parse(values.owner),
        domain: values.domain,
        actorUserId: admin.rows[0].id,
      });
      console.log(`site ${tenant.slug} is ${tenant.status} (database ${tenant.db_name})`);
    } else {
      console.log(USAGE);
      process.exitCode = command ? 1 : 0;
    }
  } finally {
    await closeContext(ctx);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
