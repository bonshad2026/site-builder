import request from 'supertest';
import {afterAll,beforeAll,expect,it} from 'vitest';
import {createApp} from '../src/app.js';
import {closeContext} from '../src/context.js';
import {createAdmin,createTenant,createTestServer,signIn,type Client} from './helpers.js';
const {ctx}=createTestServer();
const app=createApp({...ctx,env:{...ctx.env,CELL_SLUG:'test-client'}});
let owner:Client,base:string,pub:string,otherPub:string,settings:any;
beforeAll(async()=>{
  const admin=await createAdmin(ctx);
  const tenant=await createTenant(ctx,admin.id),other=await createTenant(ctx,admin.id);
  owner=await signIn(app,tenant.ownerEmail);
  base='/api/v1/sites/'+tenant.slug;pub='/api/v1/public/sites/'+tenant.slug+'/verification-files/';
  otherPub='/api/v1/public/sites/'+other.slug+'/verification-files/';
  settings=(await owner.get(base+'/settings')).body.data;
});
afterAll(()=>closeContext(ctx));
it('lets a locked-site owner verify, change and disable a code without altering operator HTML',async()=>{
  expect((await request(app).get(pub+'10769625.txt')).status).toBe(404);
  const save=await owner.put(base+'/settings',{...settings,meta:{...settings.meta,enamadCode:'10769625',headCode:'<script>forbidden()</script>'}});
  expect(save.status,JSON.stringify(save.body)).toBe(200);
  expect(save.body.data.meta.enamadCode).toBe('10769625');
  expect(save.body.data.meta.headCode).toBe(settings.meta.headCode);
  const file=await request(app).get(pub+'10769625.txt');
  expect(file.status).toBe(200);expect(file.text).toBe('');expect(file.headers['content-type']).toContain('text/plain');expect(file.headers['cache-control']).toBe('no-store');
  expect((await request(app).get(otherPub+'10769625.txt')).status).toBe(404);
  await owner.put(base+'/settings',{...settings,meta:{...settings.meta,enamadCode:'7654321'}});
  expect((await request(app).get(pub+'10769625.txt')).status).toBe(404);
  expect((await request(app).get(pub+'7654321.txt')).status).toBe(200);
  await owner.put(base+'/settings',settings);
  expect((await request(app).get(pub+'7654321.txt')).status).toBe(404);
});
it('rejects arbitrary filenames and unauthenticated changes',async()=>{
  for(const code of ['../x','abc','<meta>','1'.repeat(31)]) expect((await owner.put(base+'/settings',{...settings,meta:{...settings.meta,enamadCode:code}})).status).toBe(400);
  expect((await request(app).get(pub+'robots.txt')).status).toBe(400);
  expect((await request(app).put(base+'/settings').send(settings)).status).toBe(401);
});
