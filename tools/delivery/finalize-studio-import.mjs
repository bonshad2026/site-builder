import fs from 'node:fs';
import { createContext, closeContext } from '/app/apps/api/dist/context.js';
import { loadEnv } from '/app/apps/api/dist/config/env.js';
import { siteSettingsSchema,pageDocumentSchema } from '/app/packages/shared/dist/index.js';
const config=JSON.parse(fs.readFileSync('/tmp/studio-import-map.json','utf8'));
const ctx=createContext(loadEnv());
try{
 const t=(await ctx.control.query('SELECT * FROM tenants WHERE slug=$1',[config.slug])).rows[0];
 if(!t||t.id!==config.targetId)throw Error('Target identity mismatch');
 const db=ctx.tenantPools.get({id:t.id,dbName:t.db_name,dbUser:t.db_user,dbPasswordEnc:t.db_password_enc});
 const swaps=[[config.sourceId,config.targetId],[config.sourceUrl,config.previewUrl]];
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  for(const [from,to] of swaps){
   if(!from||!to)throw Error('Missing remap');
   for(const [table,fields] of [['site_settings',['settings']],['pages',['draft','published','seo']],['page_versions',['document','seo']],['collection_items',['data']],['collections',['fields','filters']]]){
    for(const field of fields){const exists=await client.query('SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name=$3',['public',table,field]);if(!exists.rowCount)continue;
     await client.query(`UPDATE ${table} SET ${field}=replace(${field}::text,$1,$2)::jsonb WHERE ${field}::text LIKE '%'||$1||'%'`,[from,to]);
    }
   }
   await client.query('UPDATE assets SET storage_key=replace(storage_key,$1,$2)',[from,to]);
  }
  const st=(await client.query('SELECT settings FROM site_settings WHERE id=1')).rows[0];siteSettingsSchema.parse(st.settings);
  const pages=(await client.query('SELECT slug,draft,published FROM pages')).rows;for(const p of pages){pageDocumentSchema.parse(p.draft);if(p.published)pageDocumentSchema.parse(p.published);}
  await ctx.control.query('UPDATE tenants SET name=$2 WHERE id=$1',[t.id,st.settings.name.fa||st.settings.name.en||t.slug]);
  await client.query('COMMIT');console.log(JSON.stringify({slug:t.slug,validatedPages:pages.length,assets:(await db.query('SELECT count(*)::int AS n FROM assets')).rows[0].n}));
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}finally{await closeContext(ctx);}
