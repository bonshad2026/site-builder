import request from 'supertest';
import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {closeContext} from '../src/context.js';
import {createAdmin,createTenant,createTestServer,signIn,product,type Client} from './helpers.js';
const {ctx,app}=createTestServer();
let owner:Client,base:string,productId:string;
let tenant:Awaited<ReturnType<typeof createTenant>>;
beforeAll(async()=>{
  tenant=await createTenant(ctx,(await createAdmin(ctx)).id,{modules:{orders:true,products:true}});
  owner=await signIn(app,tenant.ownerEmail);base='/api/v1/sites/'+tenant.slug;
  const settings=(await owner.get(base+'/settings')).body.data;
  expect((await owner.put(base+'/settings',{...settings,accounts:{enabled:true},shop:{...settings.shop,orderMode:'instagram',instagramUsername:'receiver',shipping:[{id:'post',label:{en:'Post',fa:'پست'},priceMinor:9000}],checkout:{...settings.shop.checkout,address:'required',email:'required',fields:[{id:'floor',type:'text',required:true,label:{en:'Floor',fa:'طبقه'}}]}}})).status).toBe(200);
  productId=(await owner.post(base+'/products',product('walk-coffee',{priceMinor:100000,stock:10,discountPercent:10,colors:[{name:{en:'Cream',fa:'کرم'},hex:'#ffffff'}],variants:[{name:{en:'Large',fa:'بزرگ'},priceMinor:200000,stock:3}]}))).body.data.id;
});
afterAll(()=>closeContext(ctx));
const input=(quantity=2)=>({requestId:randomUUID(),items:[{productId,quantity,option:'Cream',variant:'Large'}],note:'Table 5'});
it('reuses pricing/stock to atomically save one confirmed offline order, without customer checkout or delivery jobs',async()=>{
  const body=input();
  const [one,two]=await Promise.all([owner.post(base+'/orders',body),owner.post(base+'/orders',body)]);
  expect(one.status,JSON.stringify(one.body)).toBe(201);expect(two.status).toBe(201);
  expect(one.body.data.number).toBe(two.body.data.number);
  expect(one.body.data).toMatchObject({status:'confirmed',paymentStatus:'unpaid',paymentMethod:'cod',pricingPending:false,totalMinor:'360000',shippingMinor:'0',customerId:null});
  expect(one.body.data.customer).toMatchObject({source:'walk_in',phone:''});
  expect(one.body.data.orderToken).toBeUndefined();
  const db=ctx.tenantPools.get({id:tenant.id,dbName:tenant.db_name,dbUser:tenant.db_user,dbPasswordEnc:tenant.db_password_enc!});
  expect((await db.query('SELECT count(*)::int AS n FROM orders')).rows[0].n).toBe(1);
  expect((await db.query('SELECT count(*)::int AS n FROM instagram_outbox')).rows[0].n).toBe(0);
  expect((await db.query('SELECT variants FROM products WHERE id=$1',[productId])).rows[0].variants[0].stock).toBe(1);
  const event=(await db.query('SELECT by_customer,actor_user_id,data FROM case_events WHERE order_id=$1',[one.body.data.id])).rows[0];
  expect(event.by_customer).toBe(false);expect(event.actor_user_id).toBeTruthy();expect(event.data.stage).toBe('confirmed');
});
it('refuses forged totals/status and unauthenticated/non-CSRF calls',async()=>{
  expect((await owner.post(base+'/orders',{...input(),totalMinor:1})).status).toBe(400);
  expect((await owner.post(base+'/orders',{...input(),status:'paid'})).status).toBe(400);
  expect((await request(app).post(base+'/orders').send(input())).status).toBe(401);
  expect((await owner.agent.post(base+'/orders').send(input())).status).toBe(403);
});
it('rejects unknown prices, invalid options and stock shortages without adding orders',async()=>{
  const unpriced=(await owner.post(base+'/products',product('walk-unpriced',{priceMinor:null}))).body.data.id;
  expect((await owner.post(base+'/orders',{requestId:randomUUID(),items:[{productId:unpriced,quantity:1}]})).status).toBe(400);
  expect((await owner.post(base+'/orders',input(2))).status).toBe(409);
  const wrong=input(1);wrong.items[0].variant='Unknown';
  expect((await owner.post(base+'/orders',wrong)).status).toBe(400);
  expect((await owner.get(base+'/orders')).body.data).toHaveLength(1);
});
it('supports existing cancellation/stock restoration and creates the next receipt independently',async()=>{
  const order=(await owner.get(base+'/orders')).body.data[0];
  expect((await owner.patch(base+'/orders/'+order.id,{status:'cancelled'})).status).toBe(200);
  const next=await owner.post(base+'/orders',input(1));
  expect(next.status).toBe(201);expect(next.body.data.status).toBe('confirmed');
  expect(next.body.data.number).not.toBe(order.number);
  expect(next.body.data.totalMinor).toBe('180000');
});
