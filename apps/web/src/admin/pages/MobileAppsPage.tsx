import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import {Button} from '../../components/ui/Button';
import {API_URL,api,uploadFile} from '../../lib/api';
import {usePreferences} from '../../lib/preferences';
import {useSiteInfo} from '../AdminRoot';
import {Card,ErrorNote,PageTitle,Spinner,TextField} from '../ui';
type Slot='customer'|'management';
interface Release {slot:Slot;version:string;originalName:string;sizeBytes:number;sha256:string;updatedAt:string}
function AppCard({siteId,slot,release,operator}:{siteId:string;slot:Slot;release?:Release;operator:boolean}){
  const {locale}=usePreferences(),fa=locale==='fa';
  const [version,setVersion]=useState(''),[progress,setProgress]=useState<number|null>(null),[error,setError]=useState<unknown>(null);
  const qc=useQueryClient(),base='/sites/'+siteId+'/mobile-apps';
  async function upload(file:File){
    setError(null);setProgress(0);
    try{const form=new FormData();form.append('version',version);form.append('file',file);await uploadFile(base+'/'+slot,form,setProgress);await qc.invalidateQueries({queryKey:['site',siteId,'mobile-apps']});}
    catch(e){setError(e);}finally{setProgress(null);}
  }
  return <Card title={slot==='customer'?(fa?'اپلیکیشن اصلی':'Customer application'):(fa?'اپلیکیشن مدیریت':'Management application')}>
    <ErrorNote error={error}/>
    {release?<div className="space-y-3"><p>{fa?'نسخه':'Version'}: <span dir="ltr">{release.version}</span></p><p dir="ltr" className="text-sm text-ink-soft">{release.originalName} · {(release.sizeBytes/1024/1024).toFixed(2)} MB</p><p className="break-all text-xs text-ink-soft" dir="ltr">SHA-256: {release.sha256}</p>
      {!operator&&<a className="inline-flex rounded-xl bg-ink px-5 py-3 text-white" href={`${API_URL}/api/v1${base}/${slot}/download`}>{fa?'دانلود APK':'Download APK'}</a>}
      {operator&&<Button variant="outline" onClick={async()=>{try{await api.delete(base+'/'+slot);await qc.invalidateQueries({queryKey:['site',siteId,'mobile-apps']});}catch(e){setError(e);}}}>{fa?'حذف نسخه از دسترس':'Withdraw release'}</Button>}
    </div>:<p className="text-sm text-ink-soft">{fa?'هنوز نسخه‌ای برای دریافت قرار نگرفته است.':'No application has been delivered yet.'}</p>}
    {operator&&<div className="mt-5 space-y-3 border-t border-line pt-4"><TextField label={fa?'نسخهٔ برنامه':'Application version'} value={version} onChange={setVersion} dir="ltr"/>
      <label className="block text-sm">{fa?'بارگذاری APK برای مالک':'Upload APK for the owner'}<input type="file" accept=".apk,application/vnd.android.package-archive" className="mt-2 block w-full" disabled={!version.trim()||progress!==null} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);e.target.value='';}}/></label>
      {progress!==null&&<p>{progress}%</p>}
    </div>}
  </Card>;
}
export default function MobileAppsPage({siteId}:{siteId:string}){
  const {locale}=usePreferences(),fa=locale==='fa';const {data:info,isPending:infoPending}=useSiteInfo(siteId);
  const allowed=info?.role==='owner'||info?.role==='platform_admin';
  const {data,error,isPending}=useQuery({queryKey:['site',siteId,'mobile-apps'],queryFn:()=>api.get<Release[]>('/sites/'+siteId+'/mobile-apps'),enabled:allowed});
  if(infoPending)return <Spinner/>;
  if(!allowed)return <p>{fa?'این بخش فقط برای مالک سایت در دسترس است.':'This section is available only to the site owner.'}</p>;
  return <><PageTitle title={fa?'اپلیکیشن‌های موبایل':'Mobile applications'}/><p className="mb-6 text-sm text-ink-soft">{fa?'دریافت برنامه‌ها فقط با حساب مالک همین سایت امکان‌پذیر است. برای نصب، فایل APK را روی گوشی اندرویدی باز کنید.':'Applications can be downloaded only by the owner of this site. Open the APK on an Android device to install.'}</p><ErrorNote error={error}/>{isPending?<Spinner/>:<div className="grid gap-5 lg:grid-cols-2">{(['customer','management'] as const).map(slot=><AppCard key={slot} siteId={siteId} slot={slot} release={data?.find(r=>r.slot===slot)} operator={info?.role==='platform_admin'}/>)}</div>}</>;
}
