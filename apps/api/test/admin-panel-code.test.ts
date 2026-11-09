import request from 'supertest';import {afterAll,beforeAll,expect,it} from 'vitest';
import {createApp} from '../src/app.js';import {closeContext} from '../src/context.js';
import {createAdmin,createTenant,createTestServer,signIn,type Client} from './helpers.js';
const {ctx}=createTestServer(),app=createApp({...ctx,env:{...ctx.env,CELL_SLUG:'client'}});
let operator:Client,owner:Client,base:string,pub:string;
beforeAll(async()=>{const admin=await createAdmin(ctx),tenant=await createTenant(ctx,admin.id);operator=await signIn(app,admin.email!);owner=await signIn(app,tenant.ownerEmail);base='/api/v1/sites/'+tenant.slug+'/settings';pub='/api/v1/public/sites/'+tenant.slug+'/settings';});
afterAll(()=>closeContext(ctx));
it('keeps operator panel code private and preserves it across owner edits',async()=>{
 const settings=(await operator.get(base)).body.data;
 const saved=await operator.put(base,{...settings,meta:{...settings.meta,adminHeadCode:'<script src="https://example.test/panel.js"></script>'}});expect(saved.status).toBe(200);
 expect((await request(app).get(pub)).body.data.meta).not.toHaveProperty('adminHeadCode');
 const edited=await owner.put(base,{...saved.body.data,meta:{...saved.body.data.meta,adminHeadCode:'<script>changed()</script>',enamadCode:'12345'}});
 expect(edited.status).toBe(200);expect(edited.body.data.meta.adminHeadCode).toBe(saved.body.data.meta.adminHeadCode);expect(edited.body.data.meta.enamadCode).toBe('12345');
});
