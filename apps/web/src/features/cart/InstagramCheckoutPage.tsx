import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button';
import { FieldShell, Select, TextArea } from '../../components/ui/Field';
import { Container, PageHeader, Section } from '../../components/ui/Layout';
import { errorLine } from '../../lib/errorText';
import { usePreferences } from '../../lib/preferences';
import { useSiteId } from '../public-site/data';
import { customerRequest, useCustomer } from '../account/customerApi';
import { useCart } from './cart';

export function InstagramCheckoutPage() {
  const cart = useCart();
  const site = useSiteId();
  const {customer, loading} = useCustomer();
  const {locale, l} = usePreferences();
  const T = (en:string,fa:string) => locale === 'fa' ? fa : en;
  const [address,setAddress] = useState('');
  const [note,setNote] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState<unknown>(null);
  const [number,setNumber] = useState('');
  const [requestId] = useState(()=>{
    const key='instagram-order:'+site;
    const previous=sessionStorage.getItem(key);
    const value=previous || crypto.randomUUID();
    sessionStorage.setItem(key,value);
    return value;
  });
  const selected=address || customer?.addresses?.[0]?.id || '';
  return <><PageHeader title={T('Place order','ثبت سفارش')} /><Section><Container className="max-w-2xl">
    {loading ? <p>{T('Loading…','در حال بارگذاری…')}</p> : !customer ? <div className="space-y-5"><p>{T('Sign in or create an account to place your order.','برای ثبت سفارش وارد حساب شوید یا ثبت‌نام کنید؛ سبد خرید شما حفظ می‌شود.')}</p><Link className="underline" to="/account?next=/checkout">{T('Sign in / create account','ورود / ثبت‌نام')}</Link></div> :
    number ? <div role="status" className="space-y-5"><h2 className="text-2xl">{T('Order saved','سفارش ثبت شد')} #{number}</h2><p>{T('Your order is queued for the cafe. Final confirmation and price are provided by the cafe.','سفارش برای ارسال به کافه در صف قرار گرفت. قیمت و تأیید نهایی با کافه است.')}</p><Link className="underline" to={'/track/'+number}>{T('Track order','پیگیری سفارش')}</Link></div> :
    !cart.lines.length ? <p>{T('Your basket is empty','سبد خرید خالی است')}</p> :
    <form className="space-y-6" onSubmit={async e=>{
      e.preventDefault();if(busy)return;setBusy(true);setError(null);
      try {
        const result=await customerRequest<{number:string}>(site,'/orders',{method:'POST',body:{
          requestId,
          items:cart.lines.map(line=>({productId:line.productId,quantity:line.quantity,option:line.option||'',variant:line.variant||''})),
          customer:{name:customer.name,phone:customer.phone||'',email:customer.email||'',address:selected},
          note,paymentMethod:'cod'
        }});
        setNumber(result.number);cart.clear();sessionStorage.removeItem('instagram-order:'+site);
      } catch(err){setError(err);}finally{setBusy(false);}
    }}>
      <ul className="divide-y divide-line">{cart.lines.map((line,i)=><li key={i} className="py-3">{l(line.name)} × {line.quantity}</li>)}</ul>
      <p>{customer.name} · <bdi>{customer.phone}</bdi></p>
      {customer.addresses?.length ? <FieldShell id="order-address" label={T('Delivery address','آدرس تحویل')}><Select id="order-address" value={selected} onChange={e=>setAddress(e.target.value)}>{customer.addresses.map(a=><option key={a.id} value={a.id}>{a.label} — {a.address}</option>)}</Select></FieldShell> : <p>{T('Save an address in your profile first.','ابتدا یک آدرس در پروفایل خود ذخیره کنید.')}</p>}
      <Link className="inline-block underline" to="/account?part=profile">{T('Manage addresses','مدیریت آدرس‌های من')}</Link>
      <FieldShell id="order-note" label={T('Notes (optional)','توضیحات (اختیاری)')}><TextArea id="order-note" maxLength={300} value={note} onChange={e=>setNote(e.target.value)} /></FieldShell>
      {error != null && <p role="alert" className="text-danger">{errorLine(error,locale)}</p>}
      <Button type="submit" disabled={busy||!selected}>{busy?T('Saving…','در حال ثبت…'):T('Place order','ثبت سفارش')}</Button>
    </form>}
  </Container></Section></>;
}
