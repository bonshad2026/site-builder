import request from 'supertest';
import {afterAll,beforeAll,expect,it} from 'vitest';
import {createUser} from '../src/modules/auth/auth.service.js';
import {closeContext} from '../src/context.js';
import {createAdmin,createTenant,createTestServer,PASSWORD,signIn,type Client} from './helpers.js';
const {ctx,app}=createTestServer();let operator:Client,owner:Client,staff:Client,otherOwner:Client,base:string,otherBase:string,tenant:Awaited<ReturnType<typeof createTenant>>;
// A minimal ZIP directory fixture; endpoint checks APK layout, not cryptographic signing.
function apk(){const local=Buffer.from([0x50,0x4b,0x03,0x04]),entries=['AndroidManifest.xml','classes.dex'].map(name=>{const bytes=Buffer.from(name),h=Buffer.alloc(46);h.writeUInt32LE(0x02014b50);h.writeUInt16LE(bytes.length,28);return Buffer.concat([h,bytes]);}),central=Buffer.concat(entries),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(2,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(local.length,16);return Buffer.concat([local,central,end]);}
const bytes=apk();
beforeAll(async()=>{
  const admin=await createAdmin(ctx);operator=await signIn(app,admin.email!);tenant=await createTenant(ctx,admin.id);const other=await createTenant(ctx,admin.id);
  owner=await signIn(app,tenant.ownerEmail);otherOwner=await signIn(app,other.ownerEmail);
  const user=await createUser(ctx,{email:'staff-'+tenant.slug+'@test.local',password:PASSWORD});
  await ctx.control.query("INSERT INTO memberships(user_id,tenant_id,role,permissions) VALUES($1,$2,'staff',$3)",[user.id,tenant.id,['assets:write','site:write']]);staff=await signIn(app,user.email!);
  base='/api/v1/sites/'+tenant.slug+'/mobile-apps';otherBase='/api/v1/sites/'+other.slug+'/mobile-apps';
});
afterAll(()=>closeContext(ctx));
it('lets only the operator publish, and excludes APKs from ordinary assets and signed links',async()=>{
  expect((await owner.post(base+'/customer')).status).toBe(403);
  expect((await staff.get(base)).status).toBe(403);
  const rejected=await operator.agent.post(base+'/customer').set('X-CSRF-Token',operator.csrf).field('version','1').attach('file',Buffer.from('not apk'),'bad.apk');expect(rejected.status).toBe(400);
  const upload=await operator.agent.post(base+'/customer').set('X-CSRF-Token',operator.csrf).field('version','1.0.0').attach('file',bytes,'customer.apk');
  expect(upload.status,JSON.stringify(upload.body)).toBe(200);expect(upload.body.data).not.toHaveProperty('storageKey');
  const db=ctx.tenantPools.get({id:tenant.id,dbName:tenant.db_name,dbUser:tenant.db_user,dbPasswordEnc:tenant.db_password_enc!});const key=(await db.query('SELECT storage_key FROM mobile_apps')).rows[0].storage_key;
  expect(key.startsWith('private/')).toBe(true);expect((await request(app).get('/files/'+key)).status).toBe(403);
  expect((await owner.get('/api/v1/sites/'+tenant.slug+'/assets')).body.data).toHaveLength(0);
});
it('requires the actual site owner on every download, even with a copied URL',async()=>{
  expect((await request(app).get(base+'/customer/download')).status).toBe(401);
  expect((await staff.get(base+'/customer/download')).status).toBe(403);
  expect((await otherOwner.get(base+'/customer/download')).status).toBe(404);
  expect((await operator.get(base+'/customer/download')).status).toBe(403);
  expect((await otherOwner.get(otherBase+'/customer/download')).status).toBe(404);
  const file=await owner.get(base+'/customer/download').buffer(true).parse((res,done)=>{const chunks:Buffer[]=[];res.on('data',(chunk:Buffer)=>chunks.push(chunk));res.on('end',()=>done(null,Buffer.concat(chunks)));});expect(file.status).toBe(200);expect(file.body).toEqual(bytes);expect(file.headers['cache-control']).toBe('private, no-store');expect(file.headers['content-disposition']).toContain('attachment');
});
it('keeps both slots independently, replaces a release and withdraws access',async()=>{
  const upload=(slot:string,version:string)=>operator.agent.post(base+'/'+slot).set('X-CSRF-Token',operator.csrf).field('version',version).attach('file',bytes,slot+'.apk');
  expect((await upload('management','1.0.1')).status).toBe(200);expect((await upload('customer','1.0.2')).status).toBe(200);
  const list=await owner.get(base);expect(list.body.data).toHaveLength(2);expect(list.body.data.find((r:any)=>r.slot==='customer').version).toBe('1.0.2');
  expect((await operator.delete(base+'/customer')).status).toBe(204);expect((await owner.get(base+'/customer/download')).status).toBe(404);expect((await owner.get(base+'/management/download')).status).toBe(200);
});
