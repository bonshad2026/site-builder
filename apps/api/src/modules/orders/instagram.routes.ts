import {instagramConnectionSchema,instagramConnectionActionSchema} from '@site-builder/shared';
import type {ApiRouter} from '../../common/http.js';
import type {AppContext} from '../../context.js';
import {encryptSecret} from '../../common/crypto.js';
import {badRequest} from '../../common/errors.js';
import {requirePermission} from '../../middleware/tenant.js';
import {auditTenant} from '../audit/audit.js';

export function registerInstagramConnection(r:ApiRouter,ctx:AppContext) {
  const path='/instagram-connection';
  const permission=[requirePermission('orders:write')];
  r.route({method:'get',path,summary:'Private sender connection status (never credentials)',middleware:permission},async({req})=>{
    const result=await req.tenant!.db.query('SELECT username, password_enc IS NOT NULL AS "hasPassword", status, error_code AS "errorCode", heartbeat_at AS "heartbeatAt" FROM instagram_connection WHERE id=1');
    return {data:result.rows[0]};
  });
  r.route({method:'put',path,summary:'Save private encrypted sender credentials',body:instagramConnectionSchema,middleware:permission},async({req,body})=>{
    const db=req.tenant!.db;
    const username=body.username.replace(/^@/,'');
    const old=(await db.query('SELECT username,password_enc FROM instagram_connection WHERE id=1')).rows[0];
    if((old.username!==username||!old.password_enc)&&!body.password)throw badRequest('Enter the sender password');
    await db.query("UPDATE instagram_connection SET username=$1,password_enc=$2,session_enc=NULL,code_enc=NULL,action='none',status='disconnected',error_code=NULL,version=version+1,updated_at=now() WHERE id=1",
      [username,body.password?encryptSecret(body.password,ctx.env.TENANT_SECRETS_KEY):old.password_enc]);
    await auditTenant(db,{actorUserId:req.auth!.user.id,action:'instagram.credentials_updated',target:'instagram'});
    return {data:{saved:true}};
  });
  r.route({method:'post',path,summary:'Request login, submit verification code, or disconnect',body:instagramConnectionActionSchema,middleware:permission},async({req,body})=>{
    const db=req.tenant!.db;
    if(body.action==='code'){
      if(!body.code)throw badRequest('Enter the verification code');
      const updated=await db.query("UPDATE instagram_connection SET code_enc=$1,updated_at=now() WHERE id=1 AND status='code_required'",[encryptSecret(body.code,ctx.env.TENANT_SECRETS_KEY)]);
      if(!updated.rowCount)throw badRequest('No verification code is currently requested');
    }else if(body.action==='disconnect'){
      await db.query("UPDATE instagram_connection SET session_enc=NULL,code_enc=NULL,action='none',status='disconnected',version=version+1,updated_at=now() WHERE id=1");
    }else{
      const updated=await db.query("UPDATE instagram_connection SET action='login',status='login_pending',error_code=NULL,updated_at=now() WHERE id=1 AND password_enc IS NOT NULL AND status NOT IN ('connecting','code_required','login_pending')");
      if(!updated.rowCount)throw badRequest('Save credentials first or wait for the current login attempt');
    }
    await auditTenant(db,{actorUserId:req.auth!.user.id,action:'instagram.'+body.action,target:'instagram'});
    return {data:{accepted:true}};
  });
}
