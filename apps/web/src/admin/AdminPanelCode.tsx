import {useEffect} from 'react';
import {useQuery} from '@tanstack/react-query';
import type {SiteSettings} from '@site-builder/shared';
import {api} from '../lib/api';
import type {Me} from './auth';
/** Notification SDKs must never initialize on public pages, sign-in or unrelated staff sessions. */
export function AdminPanelCode({me,siteId}:{me:Me;siteId?:string}){
  const member=me.sites.find(s=>s.siteId===siteId);
  const allowed=!!siteId&&(me.user.isPlatformAdmin||member?.role==='owner'||!!member?.permissions.includes('orders:read'));
  const {data}=useQuery({queryKey:['site',siteId,'settings'],queryFn:()=>api.get<SiteSettings>(`/sites/${siteId}/settings`),enabled:allowed});
  const html=allowed?data?.meta.adminHeadCode:'';
  useEffect(()=>{
    if(!html?.trim())return;
    const nodes=Array.from(document.createRange().createContextualFragment(html).childNodes);
    for(const node of nodes){if(node instanceof Element)node.setAttribute('data-sb-admin-head','');document.head.appendChild(node);}
    return()=>{for(const node of nodes)node.parentNode?.removeChild(node);};
  },[html]);
  return null;
}
