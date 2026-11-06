import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useQuery} from '@tanstack/react-query';
import {api} from '../../lib/api';
import {usePreferences} from '../../lib/preferences';
import type {OrderItemDto} from '../../types/api';
import {Button} from '../../components/ui/Button';
import {ErrorNote,Spinner} from '../ui';
import {L,useL} from './common';
type Preview={currency:string;customer:{name:string;phone:string;address?:string};note?:string;items:OrderItemDto[];pricingPending?:boolean;instagramState?:string};

/** Read-only preview: hover, keyboard focus and tap all work; no unread flag is changed. */
export function OrderQuickView({siteId,id,number,onOpen}:{siteId:string;id:string;number:string;onOpen:()=>void}){
  const t=useL(),{l,formatMoney}=usePreferences();
  const [position,setPosition]=useState<{left:number;top:number;width:number}|null>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const preview=useQuery({queryKey:['site',siteId,'orders','preview',id],queryFn:()=>api.get<Preview>('/sites/'+siteId+'/orders/'+id+'?preview=true'),enabled:!!position,staleTime:5000});
  const keep=()=>clearTimeout(timer.current);
  const hide=()=>{keep();timer.current=setTimeout(()=>setPosition(null),150);};
  const show=(element:HTMLElement)=>{
    keep();const rect=element.getBoundingClientRect(),width=Math.min(360,window.innerWidth-24);
    setPosition({left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12)),top:Math.max(12,Math.min(rect.bottom+8,window.innerHeight-360)),width});
  };
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  useEffect(()=>{
    if(!position)return;
    const close=()=>setPosition(null);
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};
    window.addEventListener('resize',close);window.addEventListener('scroll',close,true);window.addEventListener('keydown',key);
    return ()=>{window.removeEventListener('resize',close);window.removeEventListener('scroll',close,true);window.removeEventListener('keydown',key);};
  },[!!position]);
  const p=preview.data;
  return <span onClick={e=>e.stopPropagation()} onMouseEnter={e=>show(e.currentTarget)} onMouseLeave={hide}>
    <Button type="button" size="sm" variant="outline" aria-label={t(L('Quick view','مشاهده سریع'))+' #'+number} aria-expanded={!!position}
      onFocus={e=>show(e.currentTarget)} onBlur={hide} onClick={e=>show(e.currentTarget)}>{t(L('Quick view','مشاهده سریع'))}</Button>
    {position&&createPortal(<aside role="dialog" aria-label={t(L('Order preview','پیش‌نمایش سفارش'))+' #'+number}
      className="fixed z-[100] max-h-[calc(100vh-24px)] overflow-auto rounded-xl border border-line bg-surface p-4 text-sm text-ink shadow-xl"
      style={position} onMouseEnter={keep} onMouseLeave={hide} onFocusCapture={keep} onBlurCapture={hide} onClick={e=>e.stopPropagation()}>
      <h3 className="mb-3 font-medium">{t(L('Order','سفارش'))} #{number}</h3>
      {preview.isLoading?<Spinner/>:<><ErrorNote error={preview.error}/>{p&&<>
        <p>{p.customer.name} · <bdi>{p.customer.phone}</bdi></p>
        <ul className="my-3 divide-y divide-line">{p.items.map((item,i)=><li key={i} className="py-2">
          {l(item.productName)}{[item.option,(item as OrderItemDto & {variant?:string}).variant].filter(Boolean).length?' ('+[item.option,(item as OrderItemDto & {variant?:string}).variant].filter(Boolean).join('، ')+')':''} × {item.quantity}
          {!p.pricingPending&&<span className="ms-3 text-ink-soft">{formatMoney(item.lineTotalMinor,p.currency)}</span>}
        </li>)}</ul>
        {p.customer.address&&<p className="whitespace-pre-wrap">{p.customer.address}</p>}
        {p.note&&<p className="mt-2 whitespace-pre-wrap text-ink-soft">{p.note}</p>}
      </>}</>}
      <Button type="button" size="sm" className="mt-4" onClick={()=>{setPosition(null);onOpen();}}>{t(L('Open details','بازکردن جزئیات'))}</Button>
    </aside>,document.body)}
  </span>;
}
