import request from 'supertest';
import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {closeContext} from '../src/context.js';
import {createAdmin,createTenant,createTestServer,signIn,product,type Client} from './helpers.js';
const {ctx,app}=createTestServer();
let owner:Client,base:string,pub:string,productId:string;
let tenant:Awaited<ReturnType<typeof createTenant>>;
const agent=request.agent(app);
const addressId=randomUUID();
let csrf='';
beforeAll(async()=>{
  tenant=await createTenant(ctx,(await createAdmin(ctx)).id,{modules:{products:true,orders:true}});
  owner=await signIn(app,tenant.ownerEmail);
  base='/api/v1/sites/'+tenant.slug;pub='/api/v1/public/sites/'+tenant.slug;
  const settings=(await owner.get(base+'/settings')).body.data;
  const saved=await owner.put(base+'/settings',{...settings,accounts:{enabled:true,passwords:true,signupVerification:false},
    shop:{...settings.shop,orderMode:'instagram',instagramUsername:'_mehdi__hamze',showPrices:false,
      checkout:{...settings.shop.checkout,address:'required',email:'off',postalCode:'off',region:false}}});
  expect(saved.status,JSON.stringify(saved.body)).toBe(200);
  const p=await owner.post(base+'/products',product('coffee',{priceMinor:null,stock:8}));
  expect(p.status).toBe(201);productId=p.body.data.id;
});
afterAll(()=>closeContext(ctx));
const body=(requestId=randomUUID())=>({requestId,customer:{name:'Forged Name',phone:'09120009999',address:addressId},items:[{productId,quantity:2}],paymentMethod:'cod'});
it('requires a password without verification and exposes no verified claim',async()=>{
  expect((await agent.post(pub+'/customer/signup').send({identifier:'09121110001',name:'Test Customer'})).status).toBe(400);
  const signup=await agent.post(pub+'/customer/signup').send({identifier:'09121110001',name:'Test Customer',password:'test-password-123'});
  expect(signup.status,JSON.stringify(signup.body)).toBe(201);
  expect(signup.body.data.verified).toBe(false);
  const cookies=signup.headers['set-cookie'] as unknown as string[];
  csrf=decodeURIComponent(cookies.find(c=>c.startsWith('sb_cc_'))!.split(';')[0].split('=')[1]);
  const profile=await agent.patch(pub+'/customer/me').set('X-Customer-CSRF',csrf).send({addresses:[{id:addressId,label:'Home',address:'Test address, building 5'}]});
  expect(profile.status).toBe(200);expect(profile.body.data.addresses).toHaveLength(1);
});
it('rejects guests, missing CSRF, and foreign address ids without enqueuing',async()=>{
  expect((await request(app).post(pub+'/orders').send(body())).status).toBe(400);
  expect((await agent.post(pub+'/orders').send(body())).status).toBe(400);
  const invalid=body();invalid.customer.address=randomUUID();
  expect((await agent.post(pub+'/orders').set('X-Customer-CSRF',csrf).send(invalid)).status).toBe(400);
});
it('saves one authenticated quote order and one delivery job atomically, ignoring forged identity',async()=>{
  const input=body();
  const order=await agent.post(pub+'/orders').set('X-Customer-CSRF',csrf).send(input);
  expect(order.status,JSON.stringify(order.body)).toBe(201);
  const again=await agent.post(pub+'/orders').set('X-Customer-CSRF',csrf).send(input);
  expect(again.status,JSON.stringify(again.body)).toBe(201);expect(again.body.data.number).toBe(order.body.data.number);
  const list=(await owner.get(base+'/orders')).body.data;
  expect(list).toHaveLength(1);expect(list[0].customer.name).toBe('Test Customer');
  expect(list[0].customer.phone).toBe('09121110001');expect(list[0].customer.address).toBe('Test address, building 5');
  expect(list[0].pricingPending).toBe(true);expect(list[0].instagramState).toBe('pending');
  const db=ctx.tenantPools.get({id:tenant.id,dbName:tenant.db_name,dbUser:tenant.db_user,dbPasswordEnc:tenant.db_password_enc!});
  const jobs=await db.query('SELECT recipient,message FROM instagram_outbox');
  expect(jobs.rows).toHaveLength(1);expect(jobs.rows[0].recipient).toBe('_mehdi__hamze');
  expect(jobs.rows[0].message).toContain('× 2');expect(jobs.rows[0].message).not.toContain('Forged');
  expect((await db.query('SELECT stock FROM products WHERE id=$1',[productId])).rows[0].stock).toBe(6);
  const customerList=(await owner.get(base+'/customers')).body.data;
  expect(customerList[0].addresses[0].id).toBe(addressId);
});
it('rolls back stock, order and delivery together for an oversized message',async()=>{
  const input={...body(),note:'x'.repeat(1500)};
  expect((await agent.post(pub+'/orders').set('X-Customer-CSRF',csrf).send(input)).status).toBe(400);
  expect((await owner.get(base+'/orders')).body.data).toHaveLength(1);
});
it('preserves verified signup by default',async()=>{
  const settings=(await owner.get(base+'/settings')).body.data;
  await owner.put(base+'/settings',{...settings,accounts:{enabled:true,passwords:true}});
  const signup=await request(app).post(pub+'/customer/signup').send({identifier:'09121110002',name:'Another Person',password:'test-password-123'});
  expect(signup.status).toBe(400);
});
it('keeps sender password encrypted and private, and supports owner connection commands',async()=>{
  const path=base+'/orders/instagram-connection';
  expect((await owner.put(path,{username:'relay_test',password:'not-a-real-instagram-password'})).status).toBe(200);
  const status=await owner.get(path);
  expect(status.body.data.username).toBe('relay_test');
  expect(status.body.data.hasPassword).toBe(true);
  expect(JSON.stringify(status.body)).not.toContain('not-a-real-instagram-password');
  const db=ctx.tenantPools.get({id:tenant.id,dbName:tenant.db_name,dbUser:tenant.db_user,dbPasswordEnc:tenant.db_password_enc!});
  const row=(await db.query('SELECT password_enc FROM instagram_connection')).rows[0];
  expect(row.password_enc).not.toContain('not-a-real-instagram-password');
  const publicSettings=await request(app).get(pub+'/settings');
  expect(JSON.stringify(publicSettings.body)).not.toContain('relay_test');
  expect((await owner.post(path,{action:'code',code:'123456'})).status).toBe(400);
  expect((await owner.post(path,{action:'login'})).status).toBe(200);
  expect((await owner.get(path)).body.data.status).toBe('login_pending');
  await owner.post(path,{action:'disconnect'});
  expect((await owner.get(path)).body.data.status).toBe('disconnected');
  expect((await request(app).get(path)).status).toBe(401);
});
