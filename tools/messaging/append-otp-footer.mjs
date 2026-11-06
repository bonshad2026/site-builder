import fs from 'node:fs';
import {createContext,closeContext} from '/app/apps/api/dist/context.js';
import {loadEnv} from '/app/apps/api/dist/config/env.js';
import {loadMessaging} from '/app/apps/api/dist/modules/platform/messaging.js';
import {withSmsFooter,SMS_OPT_OUT_FOOTER} from '/app/apps/api/dist/modules/auth/notifications.js';
const ctx=createContext(loadEnv());
const normalize=value=>Object.fromEntries(Object.entries(value).map(([key,value])=>[key.toLowerCase(),value]));
try{
 const config=await loadMessaging(ctx);
 if(!config?.sms.enabled||!config.sms.apiKey)throw Error('SMS_NOT_CONFIGURED');
 const call=async(method,params)=>{
  const url=new URL('https://api.kavenegar.com/v1/'+encodeURIComponent(config.sms.apiKey)+'/verify/'+method+'.json');
  for(const [key,value] of Object.entries(params??{}))if(value!==undefined&&value!==null)url.searchParams.set(key,String(value));
  const res=await fetch(url,{method:'POST',signal:AbortSignal.timeout(15000)});
  const data=await res.json();
  if(!res.ok||data.return?.status!==200)throw Error('PROVIDER_STATUS_'+(data.return?.status??res.status));
  return data;
 };
 const data=await call('templatelist');
 const templates=Array.isArray(data.entries)?data.entries:[];
 const found=templates.map(normalize).find(item=>item.name===config.sms.otpTemplate);
 if(!found)throw Error('OTP_TEMPLATE_NOT_FOUND');
 let template=normalize((await call('gettemplate',{id:found.id})).entries);
 if(Array.isArray(template))throw Error('UNEXPECTED_TEMPLATE_RESPONSE');
 const original=template.smsmessage??template.textmessage;
 if(typeof original!=='string'||!original.includes('%token'))throw Error('UNEXPECTED_TEMPLATE_TEXT');
 if(original.trimEnd().endsWith('\n'+SMS_OPT_OUT_FOOTER)){
  console.log(JSON.stringify({status:'already_configured',approval:template.approvalstatus}));
 }else{
  // Do not guess a provider fallback policy that is not included in its response.
  if(template.secondarylinenumber&&!('fallbackmethod' in template))throw Error('FALLBACK_POLICY_REQUIRES_MANUAL_TEMPLATE_EDIT');
  const priority=String(template.sendpriority??template.sendmethod??'').toLowerCase();
  const sendMethod=priority==='sms'||priority==='1'?1:priority==='call'||priority==='2'?2:null;
  if(!sendMethod)throw Error('UNKNOWN_TEMPLATE_SEND_METHOD');
  const params={templateId:template.id??found.id,sourceType:template.sourcetype??0,
    sendMethod,fallBackMethod:template.fallbackmethod??3,
    name:template.name,textMessage:withSmsFooter(original),
    voiceMessage:template.callmessage??template.voicemessage,
    primaryLineNumber:template.primarylinenumber,secondaryLineNumber:template.secondarylinenumber,
    switchTTL:template.switchttl,sourceUrl:template.sourceurl,sourceName:template.sourcename};
  fs.writeFileSync('/tmp/otp-template-before-footer.json',JSON.stringify({templateId:found.id,...template}),{mode:0o600});
  const result=await call('updatetemplate',params);
  const updated=normalize(Array.isArray(result.entries)?result.entries[0]:result.entries??{});
  console.log(JSON.stringify({status:'updated',footerInResponse:String(updated.textmessage??updated.smsmessage??'').trimEnd().endsWith('\n'+SMS_OPT_OUT_FOOTER),approval:updated.approvalstatus??'not_returned'}));
 }
}catch(error){console.log(JSON.stringify({status:'stopped',reason:/^[A-Z0-9_]+$/.test(error.message)?error.message:error.name}));process.exitCode=1;}
finally{await closeContext(ctx);}
