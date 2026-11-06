import type pg from 'pg';
import {badRequest,notFound} from '../../common/errors.js';
import {withTransaction} from '../../database/tenant/pools.js';
import {auditTenant} from '../audit/audit.js';
import {addEvent} from '../interactions/requests.service.js';
import {ORDER_COLUMNS} from './orders.service.js';

/** Staff records receipt/refund for offline orders; gateway transactions are never rewritten. */
export async function recordManualPayment(db:pg.Pool,id:string,status:'unpaid'|'paid'|'refunded',actorUserId:string){
  return withTransaction(db,async tx=>{
    const result=await tx.query('SELECT '+ORDER_COLUMNS+' FROM orders WHERE id=$1 FOR UPDATE',[id]);
    const order=result.rows[0];
    if(!order)throw notFound('Order');
    if(order.paymentMethod!=='cod'||order.hasGatewayPayment)throw badRequest('Gateway payments must be verified through the payment gateway');
    if(!['unpaid','paid','refunded'].includes(order.paymentStatus))throw badRequest('This payment cannot be changed manually');
    if(order.paymentStatus===status)return order;
    if(status==='refunded'&&order.paymentStatus!=='paid')throw badRequest('Only a paid order can be marked refunded');
    const updated=await tx.query('UPDATE orders SET payment_status=$2,updated_at=now() WHERE id=$1 RETURNING '+ORDER_COLUMNS,[id,status]);
    await addEvent(tx,{orderId:id},{kind:'note',public:false,body:'Manual payment status: '+order.paymentStatus+' → '+status,data:{source:'manual',from:order.paymentStatus,to:status},actorUserId});
    await auditTenant(tx,{actorUserId,action:'order.manual_payment_changed',target:id,metadata:{from:order.paymentStatus,to:status}});
    return updated.rows[0];
  });
}
