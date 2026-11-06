import {useEffect,useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {api} from '../../lib/api';
import {Button} from '../../components/ui/Button';
import {Card,TextField,ErrorNote} from '../ui';
import {L,useL} from './common';
type Connection={username:string;hasPassword:boolean;status:string;errorCode:string|null;heartbeatAt:string|null};
export function InstagramConnection({siteId}:{siteId:string}){
  const t=useL(),qc=useQueryClient();
  const path='/sites/'+siteId+'/orders/instagram-connection';
  const key=['site',siteId,'instagram-connection'];
  const connection=useQuery({queryKey:key,queryFn:()=>api.get<Connection>(path),refetchInterval:3000});
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState('');
  useEffect(()=>{if(connection.data)setUsername(connection.data.username);},[connection.data?.username]);
  const save=useMutation({mutationFn:()=>api.put(path,{username,...(password?{password}:{})}),onSuccess:()=>{setPassword('');qc.invalidateQueries({queryKey:key});}});
  const action=useMutation({mutationFn:(action:'login'|'disconnect'|'code')=>api.post(path,{action,...(action==='code'?{code}:{})}),onSuccess:()=>{setCode('');qc.invalidateQueries({queryKey:key});}});
  const c=connection.data;
  const labels:Record<string,string>={disconnected:t(L('Disconnected','قطع اتصال')),login_pending:t(L('Waiting for worker','منتظر سرویس واسط')),connecting:t(L('Signing in','در حال ورود')),code_required:t(L('Verification code required','منتظر کد تأیید')),connected:t(L('Connected','متصل')),error:t(L('Connection error','خطای اتصال'))};
  return <Card title={t(L('Instagram sender account','حساب واسط اینستاگرام'))}><div className="flex flex-col gap-4">
    <p role="status">{t(L('Status','وضعیت'))}: {c?labels[c.status]||c.status:'…'}</p>
    {c?.heartbeatAt && Date.now()-Date.parse(c.heartbeatAt)>60000 && <p>{t(L('Relay worker is offline','سرویس واسط در دسترس نیست'))}</p>}
    {c?.errorCode&&<p className="text-danger" dir="ltr">{c.errorCode}</p>}
    <TextField label={t(L('Sender username','یوزرنیم حساب واسط'))} dir="ltr" value={username} onChange={setUsername}/>
    <TextField label={t(L('Password (leave blank to keep)','رمز عبور (خالی بماند تا قبلی حفظ شود)'))} type="password" dir="ltr" value={password} onChange={setPassword}/>
    <Button type="button" disabled={save.isPending} onClick={()=>save.mutate()}>{t(L('Save sender account','ذخیره حساب واسط'))}</Button>
    <div className="flex gap-3"><Button type="button" disabled={action.isPending||!c?.hasPassword||['connecting','code_required','login_pending'].includes(c?.status||'')} onClick={()=>action.mutate('login')}>{t(L('Connect / sign in','اتصال / ورود'))}</Button><Button type="button" variant="outline" onClick={()=>action.mutate('disconnect')}>{t(L('Disconnect','قطع اتصال'))}</Button></div>
    {c?.status==='code_required'&&<><TextField label={t(L('Instagram verification code','کد تأیید اینستاگرام'))} dir="ltr" value={code} onChange={setCode}/><Button type="button" disabled={action.isPending||!code} onClick={()=>action.mutate('code')}>{t(L('Submit code','ارسال کد تأیید'))}</Button></>}
    <p className="text-sm text-ink-soft">{t(L('Credentials are stored encrypted on the server. Login errors stop delivery until resolved.','اطلاعات ورود به‌صورت رمز‌شده در سرور ذخیره می‌شود. خطای ورود، ارسال را تا رفع مشکل متوقف می‌کند.'))}</p>
    <ErrorNote error={connection.error||save.error||action.error}/>
  </div></Card>;
}
