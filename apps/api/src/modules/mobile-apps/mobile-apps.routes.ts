import {createHash,randomUUID} from 'node:crypto';
import multer from 'multer';
import {z} from 'zod';
import {mobileAppSlotSchema,mobileAppUploadSchema} from '@site-builder/shared';
import {ApiRouter} from '../../common/http.js';
import {badRequest,forbidden,notFound} from '../../common/errors.js';
import type {AppContext} from '../../context.js';
import {requireOwner} from '../../middleware/tenant.js';
import {requirePlatformAdmin} from '../../middleware/auth.js';
import {auditTenant} from '../audit/audit.js';

const params=z.object({slot:mobileAppSlotSchema});
const columns='slot,original_name AS "originalName",version,size_bytes AS "sizeBytes",sha256,updated_at AS "updatedAt"';
/** Check archive structure without extracting or executing uploaded files. Signing stays the operator's job. */
export function isApk(buffer:Buffer):boolean {
  const end=buffer.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
  if(end<0||end+22>buffer.length||buffer.readUInt32LE(0)!==0x04034b50)return false;
  let position=buffer.readUInt32LE(end+16);
  const count=buffer.readUInt16LE(end+10),names=new Set<string>();
  for(let i=0;i<count;i++){
    if(position+46>end||buffer.readUInt32LE(position)!==0x02014b50)return false;
    const length=buffer.readUInt16LE(position+28),extra=buffer.readUInt16LE(position+30),comment=buffer.readUInt16LE(position+32);
    if(position+46+length+extra+comment>end)return false;
    names.add(buffer.toString('utf8',position+46,position+46+length));
    position+=46+length+extra+comment;
  }
  return names.has('AndroidManifest.xml')&&names.has('classes.dex');
}
export function mobileAppsRoutes(ctx:AppContext){
  const r=new ApiRouter('/api/v1/sites/:siteId/mobile-apps','Mobile applications',true);
  r.router.use(requireOwner);
  r.route({method:'get',path:'/',summary:'List privately delivered mobile applications'},async({req,res})=>{
    res.set('Cache-Control','private, no-store');
    return {data:(await req.tenant!.db.query('SELECT '+columns+' FROM mobile_apps ORDER BY slot')).rows};
  });
  r.route({method:'get',path:'/:slot/download',summary:'Download an APK as the site owner',params},async({req,res,params})=>{
    if(req.tenant!.role!=='owner')throw forbidden('Only the site owner can download applications');
    const row=(await req.tenant!.db.query('SELECT storage_key,original_name,sha256 FROM mobile_apps WHERE slot=$1',[params.slot])).rows[0];
    if(!row)throw notFound('Application');
    const body=await ctx.storage.get(row.storage_key);
    res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Checksum-SHA256':row.sha256});
    res.attachment(row.original_name).type('application/vnd.android.package-archive').send(body);
  });
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:ctx.env.UPLOAD_MAX_BYTES,files:1}});
  r.route({method:'post',path:'/:slot',summary:'Publish an APK for the owner (operator only)',params,rawBody:true,middleware:[requirePlatformAdmin,upload.single('file')]},async({req,params})=>{
    const fields=mobileAppUploadSchema.safeParse(req.body),file=req.file;
    if(!fields.success)throw badRequest('Enter the application version');
    if(!file||!file.originalname.toLowerCase().endsWith('.apk')||!isApk(file.buffer))throw badRequest('Attach an Android APK file');
    const now=new Date(),key=`private/tenants/${req.tenant!.id}/${now.getUTCFullYear()}/${String(now.getUTCMonth()+1).padStart(2,'0')}/${randomUUID()}.apk`;
    const previous=(await req.tenant!.db.query('SELECT storage_key FROM mobile_apps WHERE slot=$1',[params.slot])).rows[0];
    await ctx.storage.put(key,file.buffer,'application/vnd.android.package-archive');
    let rows;
    try{
      ({rows}=await req.tenant!.db.query(`INSERT INTO mobile_apps(slot,storage_key,original_name,version,size_bytes,sha256,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(slot) DO UPDATE SET storage_key=excluded.storage_key,original_name=excluded.original_name,version=excluded.version,size_bytes=excluded.size_bytes,sha256=excluded.sha256,updated_by=excluded.updated_by,updated_at=now() RETURNING ${columns}`,
      [params.slot,key,file.originalname.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-180),fields.data.version,file.size,createHash('sha256').update(file.buffer).digest('hex'),req.auth!.user.id]));
    }catch(error){await ctx.storage.delete(key).catch(()=>{});throw error;}
    if(previous)await ctx.storage.delete(previous.storage_key).catch(()=>{});
    await auditTenant(req.tenant!.db,{actorUserId:req.auth!.user.id,action:'mobile_app.published',target:params.slot});
    return {data:rows[0]};
  });
  r.route({method:'delete',path:'/:slot',summary:'Withdraw an application (operator only)',params,middleware:[requirePlatformAdmin]},async({req,params})=>{
    const row=(await req.tenant!.db.query('DELETE FROM mobile_apps WHERE slot=$1 RETURNING storage_key',[params.slot])).rows[0];
    if(!row)throw notFound('Application');
    await ctx.storage.delete(row.storage_key).catch(()=>{});
    await auditTenant(req.tenant!.db,{actorUserId:req.auth!.user.id,action:'mobile_app.withdrawn',target:params.slot});
  });
  return r.router;
}

