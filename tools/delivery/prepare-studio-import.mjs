import fs from 'node:fs';
import { createContext, closeContext } from '/app/apps/api/dist/context.js';
import { loadEnv } from '/app/apps/api/dist/config/env.js';
import { provisionTenant } from '/app/apps/api/dist/modules/platform/provisioning.js';
const ctx=createContext(loadEnv());
try {
 const slug=process.argv[2];if(!/^[a-z][a-z0-9-]{1,39}$/.test(slug))throw Error('Invalid slug');
 if((await ctx.control.query('SELECT 1 FROM tenants WHERE slug=$1',[slug])).rowCount)throw Error('Existing studio tenant; will not overwrite');
 const operator=(await ctx.control.query('SELECT id,email FROM users WHERE is_platform_admin ORDER BY created_at LIMIT 1')).rows[0];
 const tenant=await provisionTenant(ctx,{slug,name:slug,ownerEmail:operator.email,actorUserId:operator.id});
 fs.writeFileSync('/tmp/studio-import-target.json',JSON.stringify({id:tenant.id,slug:tenant.slug,dbName:tenant.db_name,dbUser:tenant.db_user}));
 console.log('Created isolated studio tenant '+slug);
}finally{await closeContext(ctx);}
