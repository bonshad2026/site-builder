import { afterAll, expect, it } from 'vitest';
import { createAdmin, createTenant, createTestServer } from './helpers.js';
import { closeContext } from '../src/context.js';
import { migrate, TENANT_MIGRATIONS_DIR } from '../src/database/migrator.js';
const { ctx } = createTestServer();
afterAll(() => closeContext(ctx));
it('upgrades a delivery that already has the members schema under its old migration name', async () => {
 const admin=await createAdmin(ctx);const t=await createTenant(ctx,admin.id);
 const db=ctx.tenantPools.get({id:t.id,dbName:t.db_name,dbUser:t.db_user,dbPasswordEnc:t.db_password_enc!});
 await db.query("UPDATE schema_migrations SET name='012_members_and_reviews.sql' WHERE name='015_members_and_reviews.sql'");
 const client=await db.connect();
 try { expect(await migrate(client,TENANT_MIGRATIONS_DIR)).toEqual(['015_members_and_reviews.sql']); }
 finally { client.release(); }
 expect((await db.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='customers' AND column_name IN ('kind','organization','addresses')")).rows[0].n).toBe(3);
 expect((await db.query("SELECT to_regclass('item_reviews') AS name")).rows[0].name).toBe('item_reviews');
});
