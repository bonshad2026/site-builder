import {useEffect,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {API_URL} from '../../lib/api';

/** Keep TanStack caches; the stream only tells them when to fetch again. */
export function useOrderLive(siteId:string){
  const qc=useQueryClient();
  const [connected,setConnected]=useState(false);
  useEffect(()=>{
    if(typeof EventSource==='undefined')return;
    let source:EventSource|null=null;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const refresh=()=>{clearTimeout(timer);timer=setTimeout(()=>{void qc.invalidateQueries({queryKey:['site',siteId,'orders']});},150);};
    const stop=()=>{source?.close();source=null;setConnected(false);};
    const start=()=>{
      if(document.hidden||source)return;
      source=new EventSource(API_URL+'/api/v1/sites/'+encodeURIComponent(siteId)+'/orders/live',{withCredentials:true});
      source.onopen=()=>setConnected(true);
      source.onerror=()=>setConnected(false);
      source.addEventListener('changed',refresh);
    };
    const visibility=()=>{if(document.hidden)stop();else start();};
    start();document.addEventListener('visibilitychange',visibility);
    return ()=>{stop();clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);};
  },[siteId,qc]);
  return connected;
}
