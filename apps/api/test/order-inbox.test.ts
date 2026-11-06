import request from 'supertest';
import {beforeAll,afterAll,it,expect} from 'vitest';
import type {Server} from 'node:http';
import {closeContext} from '../src/context.js';
import {createAdmin,createTenant,createTestServer,signIn,product,PASSWORD,type Client} from './helpers.js';
const {ctx,app}=createTestServer();
let owner:Client,base:string,pub:string,id:string,productId:string;
let tenant:Awaited<ReturnType<typeof createTenant>>;
let server:Server,origin:string,cookie:string;
beforeAll(async()=>{
  tenant=await createTenant(ctx,(await createAdmin(ctx)).id,{modules:{orders:true,products:true}});
  owner=await signIn(app,tenant.ownerEmail);
  base='/api/v1/sites/'+tenant.slug;pub='/api/v1/public/sites/'+tenant.slug;
  const s=(await owner.get(base+'/settings')).body.data;
  await owner.put(base+'/settings',{...s,notifications:{staff:false,emails:[]}});
  expect((await owner.put(base+'/payment-settings',{allowCod:true})).status).toBe(200);
  productId=(await owner.post(base+'/products',product('inbox-item',{stock:30}))).body.data.id;
  const placed=await request(app).post(pub+'/orders').send({customer:{name:'Inbox Test',phone:'09121112222'},items:[{productId,quantity:2}],paymentMethod:'cod'});
  expect(placed.status).toBe(201);
  id=(await owner.get(base+'/orders')).body.data[0].id;
  const login=await request(app).post('/api/v1/auth/login').send({email:tenant.ownerEmail,password:PASSWORD});
  cookie=(login.headers['set-cookie'] as unknown as string[]).map(c=>c.split(';')[0]).join('; ');
  server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  origin='http://127.0.0.1:'+ (server.address() as {port:number}).port;
});
afterAll(async()=>{
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  await closeContext(ctx);
});
it('previews contents without marking unread, while full details keep their existing read behaviour',async()=>{
  const preview=await owner.get(base+'/orders/'+id+'?preview=true');
  expect(preview.status).toBe(200);expect(preview.body.data.unread).toBe(true);
  expect(preview.body.data.items[0].quantity).toBe(2);
  expect((await owner.get(base+'/orders')).body.data[0].unread).toBe(true);
  expect((await owner.get(base+'/orders/'+id)).body.data.unread).toBe(false);
});
it('records and audits offline payment corrections without gateway records or stock changes',async()=>{
  const path=base+'/orders/'+id+'/payment-status';
  expect((await owner.patch(path,{paymentStatus:'refunded'})).status).toBe(400);
  expect((await owner.patch(path,{paymentStatus:'paid'})).body.data.paymentStatus).toBe('paid');
  expect((await owner.patch(path,{paymentStatus:'paid'})).body.data.paymentStatus).toBe('paid');
  expect((await owner.patch(path,{paymentStatus:'refunded'})).body.data.paymentStatus).toBe('refunded');
  const details=(await owner.get(base+'/orders/'+id)).body.data;
  expect(details.payments).toHaveLength(0);
  expect(details.events.filter((e:{data:{source?:string}})=>e.data.source==='manual')).toHaveLength(2);
  expect((await owner.patch(path,{paymentStatus:'test_paid'})).status).toBe(400);
  expect((await request(app).patch(path).send({paymentStatus:'paid'})).status).toBe(401);
  expect((await owner.agent.patch(path).send({paymentStatus:'paid'})).status).toBe(403);
});
it('keeps online payment status under the existing gateway verification flow',async()=>{
  const placed=await request(app).post(pub+'/orders').send({customer:{name:'Online Test',phone:'09121112222'},items:[{productId,quantity:1}],paymentMethod:'online'});
  const order=(await owner.get(base+'/orders')).body.data.find((o:{number:string})=>o.number===placed.body.data.number);
  expect((await owner.patch(base+'/orders/'+order.id+'/payment-status',{paymentStatus:'paid'})).status).toBe(400);
});
it('preserves existing order transition and stock restoration rules for inline changes',async()=>{
  expect((await owner.patch(base+'/orders/'+id,{status:'fulfilled'})).status).toBe(400);
  expect((await owner.patch(base+'/orders/'+id,{status:'confirmed'})).status).toBe(200);
  expect((await owner.patch(base+'/orders/'+id,{status:'cancelled'})).status).toBe(200);
  expect((await owner.patch(base+'/orders/'+id,{status:'confirmed'})).status).toBe(400);
});
it('streams a committed order change with no customer payload and rejects unauthorized subscribers',async()=>{
  expect((await request(app).get(base+'/orders/live')).status).toBe(401);
  const controller=new AbortController();
  const response=await fetch(origin+base+'/orders/live',{headers:{Cookie:cookie},signal:controller.signal});
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  const reader=response.body!.getReader();
  const nextEvent=async()=>{
    let text='';
    while(!text.includes('event: changed')){
      const read=await reader.read();if(read.done)throw Error('Stream closed');
      text+=new TextDecoder().decode(read.value);
    }
    return text;
  };
  try{
    await nextEvent();
    const event=nextEvent();
    const created=await request(app).post(pub+'/orders').send({customer:{name:'Live Secret Name',phone:'09121112222'},items:[{productId,quantity:1}],paymentMethod:'cod'});
    expect(created.status).toBe(201);
    const text=await Promise.race([event,new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('No committed change streamed')),4000))]);
    expect(text).toContain('data: {}');
    expect(text).not.toContain('Live Secret');expect(text).not.toContain('09121112222');
  }finally{controller.abort();await reader.cancel().catch(()=>{});}
});
