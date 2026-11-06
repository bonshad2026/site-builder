import type pg from 'pg';
import type {Response} from 'express';

type Subscriber={changed:()=>void;close:()=>void};
type Hub={subscribers:Set<Subscriber>;client:pg.PoolClient;closed:boolean};
const hubs=new WeakMap<pg.Pool,Promise<Hub>>();

/** One LISTEN connection per active tenant, shared across its browser tabs. */
async function subscribe(pool:pg.Pool,subscriber:Subscriber){
  let promise=hubs.get(pool);
  if(!promise){
    promise=(async()=>{
      const client=await pool.connect();
      const hub:Hub={subscribers:new Set(),client,closed:false};
      const close=()=>{
        if(hub.closed)return;
        hub.closed=true;hubs.delete(pool);
        for(const s of [...hub.subscribers])s.close();
        client.release(true);
      };
      client.on('error',close);
      client.on('notification',event=>{
        if(event.channel==='sb_orders_changed')for(const s of [...hub.subscribers])s.changed();
      });
      try{await client.query('LISTEN sb_orders_changed');}catch(error){close();throw error;}
      return hub;
    })();
    hubs.set(pool,promise);
    promise.catch(()=>hubs.delete(pool));
  }
  const hub=await promise;
  if(hub.closed)throw new Error('Order listener closed');
  hub.subscribers.add(subscriber);
  return ()=>{
    hub.subscribers.delete(subscriber);
    if(!hub.subscribers.size&&!hub.closed){
      hub.closed=true;hubs.delete(pool);hub.client.release(true);
    }
  };
}

/** Sends only invalidations; normal authenticated requests fetch the current data. */
export async function streamOrders(db:pg.Pool,res:Response){
  const changed=()=>{if(!res.destroyed)res.write('event: changed\ndata: {}\n\n');};
  const unsubscribe=await subscribe(db,{changed,close:()=>res.end()});
  if(res.destroyed){unsubscribe();return;}
  res.set({'Content-Type':'text/event-stream','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no'});
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  changed(); // Reconcile changes missed before LISTEN or during a reconnect.
  const heartbeat=setInterval(()=>{if(!res.destroyed)res.write(': keepalive\n\n');},20_000);
  // Reconnect through authentication/tenant middleware periodically, including after revocation.
  const expiry=setTimeout(()=>res.end(),60_000);
  res.on('close',()=>{clearInterval(heartbeat);clearTimeout(expiry);unsubscribe();});
}
