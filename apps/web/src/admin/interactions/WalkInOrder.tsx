import {useEffect,useRef,useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Button} from '../../components/ui/Button';
import {TextInput,Select} from '../../components/ui/Field';
import {api} from '../../lib/api';
import {usePreferences} from '../../lib/preferences';
import type {ProductDto} from '../../types/api';
import {cartOps,lineKey,type CartLine} from '../../features/cart/cart';
import {finalPrice} from '../../features/public-site/components/price';
import {useAdminSettings} from '../AdminRoot';
import {fetchAll} from '../ExcelExport';
import {Modal,ErrorNote,Spinner,useToast} from '../ui';
import {L,useL} from './common';

type Choice={option:string;variant:string};
/** Public uploads are available on the panel origin too, including loopback-only installs. */
function menuImage(url:string){
  const asset=new URL(url,window.location.href);
  return asset.pathname.startsWith('/files/public/')?asset.pathname+asset.search:url;
}
export function WalkInOrder({siteId,open,onClose}:{siteId:string;open:boolean;onClose:()=>void}){
  const t=useL(),{l,formatMoney}=usePreferences(),qc=useQueryClient(),toast=useToast();
  const gridRef=useRef<HTMLDivElement>(null);
  const [space,setSpace]=useState({width:800,height:500});
  useEffect(()=>{if(!open||!gridRef.current)return;const observer=new ResizeObserver(([entry])=>setSpace({width:entry.contentRect.width,height:entry.contentRect.height}));observer.observe(gridRef.current);return()=>observer.disconnect();},[open]);
  const {data:settings}=useAdminSettings(siteId);
  const products=useQuery({queryKey:['site',siteId,'products','walk-in'],queryFn:()=>fetchAll<ProductDto>('/sites/'+siteId+'/products?status=published'),enabled:open,staleTime:0});
  const [category,setCategory]=useState(''),[search,setSearch]=useState('');
  const [choices,setChoices]=useState<Record<string,Choice>>({});
  const [lines,setLines]=useState<CartLine[]>([]);
  const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const [note,setNote]=useState('');
  const choiceFor=(p:ProductDto):Choice=>choices[p.id]||{option:p.colors?.[0]?l(p.colors[0].name):'',variant:p.variants?.[0]?l(p.variants[0].name):''};
  const selectedVariant=(p:ProductDto,c:Choice)=>p.variants?.find(v=>Object.values(v.name).includes(c.variant));
  const limitFor=(p:ProductDto)=>Math.min(settings?.shop.maxPerProduct??50,p.maxPerOrder??50);
  const priceFor=(p:ProductDto,c:Choice)=>p.priceMinor===null?null:finalPrice({...p,priceMinor:String(selectedVariant(p,c)?.priceMinor??p.priceMinor)});
  const canAdd=(p:ProductDto,c:Choice)=>{
    if(!p.isAvailable||p.priceMinor===null||(!p.variants?.length&&p.stock===0))return false;
    if(lines.length&&lines[0].currency!==p.currency)return false;
    if(settings?.shop.maxItemsPerOrder&&lines.reduce((n,a)=>n+a.quantity,0)>=settings.shop.maxItemsPerOrder)return false;
    const own=lines.filter(a=>a.productId===p.id);
    if(own.reduce((n,a)=>n+a.quantity,0)>=limitFor(p))return false;
    const variant=selectedVariant(p,c);
    if(variant?.stock!=null)return own.filter(a=>a.variant===c.variant).reduce((n,a)=>n+a.quantity,0)<variant.stock;
    const shared=own.filter(a=>selectedVariant(p,{option:a.option||'',variant:a.variant||''})?.stock==null).reduce((n,a)=>n+a.quantity,0);
    return p.stock===null||shared<p.stock;
  };
  const add=(p:ProductDto,c:Choice)=>{
    if(!canAdd(p,c))return;
    const price=priceFor(p,c);if(price===null)return;
    setLines(previous=>cartOps.add(previous,{productId:p.id,slug:p.slug,name:p.name,priceMinor:price,currency:p.currency,imageUrl:p.imageUrl,option:c.option,variant:c.variant,max:limitFor(p)}));
  };
  const minus=(key:string)=>setLines(previous=>cartOps.setQuantity(previous,key,(previous.find(a=>lineKey(a)===key)?.quantity??0)-1));
  const submit=useMutation({
    mutationFn:()=>api.post<{number:string;status:string;totalMinor:string;currency:string}>('/sites/'+siteId+'/orders',{
      requestId,items:lines.map(a=>({productId:a.productId,quantity:a.quantity,option:a.option||'',variant:a.variant||''})),...(note?{note}:{})
    }),
    onSuccess:order=>{
      setLines([]);setNote('');setRequestId(crypto.randomUUID());
      toast(t(L('Confirmed order saved','سفارش تأییدشده ثبت شد'))+' #'+order.number);
      onClose();
      void qc.invalidateQueries({queryKey:['site',siteId,'orders']});
      void qc.invalidateQueries({queryKey:['site',siteId,'products']});
    },
  });
  const all=products.data??[];
  const knownCategories=settings?.productCategories??[];
  const categoryKeys=[...new Set([...knownCategories.map(c=>c.slug),...all.map(p=>p.category||'')])].filter(Boolean);
  const categoryLabel=(key:string)=>{const found=knownCategories.find(c=>c.slug===key);return found?l(found.label):key;};
  const visible=all.filter(p=>(!category||p.category===category)&&(!search||l(p.name).toLocaleLowerCase().includes(search.toLocaleLowerCase())));
  // Use the available area, rather than a fixed column count, to keep the menu in one view.
  const count=Math.max(1,visible.length);
  let columns=1,best=-1;
  for(let c=1;c<=Math.min(count,Math.max(1,Math.floor(space.width/100)));c++){
    const rows=Math.ceil(count/c),w=(space.width-(c-1)*6)/c,h=(space.height-(rows-1)*6)/rows;
    const score=Math.min(w/150,h/170);
    if(score>best){best=score;columns=c;}
  }
  const rows=Math.ceil(count/columns),cellHeight=(space.height-(rows-1)*6)/rows;
  const controlHeight=Math.max(22,Math.min(44,cellHeight*.28));
  const fontSize=Math.max(10,Math.min(14,cellHeight*.12));
  const quantityClass="w-full min-w-0 rounded-md! px-0! py-0! text-2xl! font-black! leading-none";
  return <Modal fullScreen open={open} onClose={()=>{if(!submit.isPending)onClose();}} title={t(L('Rapid walk-in order','ثبت سریع سفارش حضوری'))} wide="xl">
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <section aria-label={t(L('Receipt','رسید سفارش'))} className="shrink-0 rounded-xl border border-line bg-surface p-2">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <strong>{t(L('Receipt total','جمع رسید'))}: {formatMoney(cartOps.subtotal(lines).toString(),lines[0]?.currency||settings?.shop.currency||'IRR')}</strong>
          <Button type="button" disabled={!lines.length||submit.isPending} onClick={()=>submit.mutate()}>{submit.isPending?t(L('Saving…','در حال ثبت…')):t(L('Confirm order','ثبت سفارش'))}</Button>
        </div>
        <div className="overflow-x-auto overflow-y-hidden pb-1" aria-label={t(L('Receipt items','اقلام رسید'))}>
          {!lines.length?<p className="text-sm text-ink-soft">{t(L('Choose a category and add items.','دسته‌بندی را انتخاب و آیتم‌ها را اضافه کنید.'))}</p>:
          <ul className="flex w-max min-w-full flex-nowrap gap-2">{lines.map(a=>{
            const p=all.find(p=>p.id===a.productId),c={option:a.option||'',variant:a.variant||''};
            return <li key={lineKey(a)} className="flex shrink-0 items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm">
              <span className="max-w-48 whitespace-nowrap">{l(a.name)}{[a.option,a.variant].filter(Boolean).length?' ('+[a.option,a.variant].filter(Boolean).join('، ')+')':''} · {formatMoney((BigInt(a.priceMinor)*BigInt(a.quantity)).toString(),a.currency)}</span>
              <span className="flex items-center gap-2"><Button className="h-10 min-w-12 px-2! text-2xl! font-black!" type="button" size="sm" variant="outline" aria-label={t(L('Remove one','کم کردن'))+' '+l(a.name)} disabled={submit.isPending} onClick={()=>minus(lineKey(a))}>−</Button><bdi className="min-w-4 text-center font-bold">{a.quantity}</bdi><Button className="h-10 min-w-12 px-2! text-2xl! font-black!" type="button" size="sm" variant="outline" aria-label={t(L('Add one','افزودن'))+' '+l(a.name)} disabled={submit.isPending||!p||!canAdd(p,c)} onClick={()=>p&&add(p,c)}>+</Button></span>
            </li>;
          })}</ul>}
        </div>
        <ErrorNote error={submit.error}/>
      </section>
      <div className="flex shrink-0 flex-wrap gap-2" aria-label={t(L('Product categories','دسته‌بندی محصولات'))}>
        <Button type="button" size="sm" variant={category?'outline':'primary'} onClick={()=>setCategory('')}>{t(L('All','همه'))}</Button>
        {categoryKeys.map(key=><Button key={key} type="button" size="sm" variant={category===key?'primary':'outline'} onClick={()=>setCategory(key)}>{categoryLabel(key)}</Button>)}
      </div>
      <div className="flex shrink-0 gap-3"><TextInput aria-label={t(L('Search menu','جست‌وجوی منو'))} placeholder={t(L('Search menu…','جست‌وجوی منو…'))} value={search} onChange={e=>setSearch(e.target.value)}/><TextInput aria-label={t(L('Order note (optional)','توضیح سفارش (اختیاری)'))} placeholder={t(L('Table / note (optional)','میز / توضیح (اختیاری)'))} maxLength={1000} value={note} onChange={e=>setNote(e.target.value)} disabled={submit.isPending}/></div>
      <div ref={gridRef} className="relative min-h-0 flex-1 overflow-hidden">
        {products.isLoading?<Spinner/>:<><ErrorNote error={products.error}/>
          {all.some(p=>p.priceMinor===null)&&<p className="absolute inset-x-0 top-0 z-10 bg-bg text-xs text-ink-soft">{t(L('Unpriced products must be priced in Products before adding.','آیتم‌های بدون قیمت را ابتدا در بخش محصولات قیمت‌گذاری کنید.'))}</p>}
          <div className="grid h-full gap-1.5" style={{gridTemplateColumns:`repeat(${columns}, minmax(0, 1fr))`,gridTemplateRows:`repeat(${rows}, minmax(0, 1fr))`}}>{visible.map(p=>{
            const c=choiceFor(p),key=lineKey({productId:p.id,...c}),count=lines.find(a=>lineKey(a)===key)?.quantity||0,price=priceFor(p,c);
            return <article key={p.id} className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface">
              {p.imageUrl?<img src={menuImage(p.imageUrl)} alt="" loading="lazy" className="min-h-0 w-full flex-1 object-cover"/>:<div className="flex min-h-0 flex-1 items-center justify-center bg-bg text-xl">☕</div>}
              <div className="shrink-0 space-y-0.5 p-1"><h3 className="truncate font-semibold" title={l(p.name)} style={{fontSize}}>{l(p.name)}</h3>
                <p className="truncate text-ink-soft" style={{fontSize:Math.max(9,fontSize-1)}}>{price===null?t(L('Price not set','قیمت تعیین نشده')):formatMoney(price,p.currency)}</p>
                {!!p.variants?.length&&<Select aria-label={t(L('Variant','مدل'))+' '+l(p.name)} value={c.variant} onChange={e=>setChoices({...choices,[p.id]:{...c,variant:e.target.value}})}>{p.variants.map((v,i)=><option key={i} value={l(v.name)}>{l(v.name)}</option>)}</Select>}
                {!!p.colors?.length&&<Select aria-label={t(L('Option','گزینه'))+' '+l(p.name)} value={c.option} onChange={e=>setChoices({...choices,[p.id]:{...c,option:e.target.value}})}>{p.colors.map((v,i)=><option key={i} value={l(v.name)}>{l(v.name)}</option>)}</Select>}
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1"><Button className={quantityClass} style={{height:controlHeight}} type="button" size="sm" variant="outline" disabled={!count||submit.isPending} aria-label={t(L('Remove one','کم کردن'))+' '+l(p.name)} onClick={()=>minus(key)}>−</Button><bdi className="min-w-4 text-center text-sm font-bold">{count}</bdi><Button className={quantityClass} style={{height:controlHeight}} type="button" size="sm" disabled={submit.isPending||!canAdd(p,c)} aria-label={t(L('Add one','افزودن'))+' '+l(p.name)} onClick={()=>add(p,c)}>+</Button></div>
              </div>
            </article>;
          })}</div>
          {!visible.length&&<p>{t(L('No items found','آیتمی پیدا نشد'))}</p>}
      </>}
      </div>
    </div>
  </Modal>;
}
