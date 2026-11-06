import { usePageMeta } from '../../hooks/usePageMeta';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button';
import { FieldShell, TextArea, TextInput, Select } from '../../components/ui/Field';
import { Container, PageHeader, Section } from '../../components/ui/Layout';
import { usePreferences } from '../../lib/preferences';
import { useSiteSettings } from '../public-site/data';
import { useCart } from './cart';
import { checkoutFormSchema, type CheckoutData, type CheckoutInput } from './CartPages';
import { sharedOrderText, shareOrder } from './shareOrder';

export function ShareCheckoutPage() {
  const { data: settings } = useSiteSettings();
  const cart = useCart();
  const { locale, l, formatMoney } = usePreferences();
  const T = (en: string, fa: string) => locale === 'fa' ? fa : en;
  usePageMeta(T('Place order','ثبت سفارش'), undefined, { noIndex: true });
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState('');
  const checkout = settings!.shop.checkout;
  const instagram = settings?.shop.shareTarget === 'instagram';
  const recipient = instagram ? '@' + settings!.shop.instagramUsername.replace(/^@/, '') : settings?.shop.shareRecipient;
  const { register, handleSubmit, formState } = useForm<CheckoutInput, unknown, CheckoutData>({ resolver: zodResolver(checkoutFormSchema(checkout)) });
  const field = (id: keyof CheckoutInput, label: string, type = 'text') => <FieldShell key={id} id={`share-${id}`} label={label} error={formState.errors[id] ? T('Check this field', 'این قسمت را بررسی کنید') : undefined}><TextInput id={`share-${id}`} type={type} {...register(id)} /></FieldShell>;
  return <><PageHeader title={T('Place order', 'ثبت سفارش')} eyebrow={l(settings?.name)} /><Section className="pt-10"><Container className="max-w-3xl">
    {!cart.lines.length ? <p>{T('Your basket is empty.', 'سبد خرید شما خالی است.')}</p> : <>
      <ul className="mb-8 divide-y divide-line border-y border-line">{cart.lines.map((line, i) => <li key={i} className="flex justify-between gap-4 py-4"><span>{l(line.name)} × {line.quantity}</span>{settings?.shop.showPrices && <span>{formatMoney((BigInt(line.priceMinor) * BigInt(line.quantity)).toString(), line.currency)}</span>}</li>)}</ul>
      {recipient && <p className="mb-3">{T('Recipient to select', 'گیرنده‌ای که انتخاب می‌کنید')}: <bdi>{recipient}</bdi></p>}
      <p className="mb-8 text-sm text-ink-soft">{instagram ? T('Place order copies the message and opens the recipient chat. Paste and send it in Instagram; the cafe must confirm receipt.', '«ثبت سفارش» متن را کپی و گفت‌وگوی گیرنده را باز می‌کند. در اینستاگرام جای‌گذاری و ارسال کنید؛ دریافت باید توسط کافه تأیید شود.') : T('After tapping Place order, select an app and recipient, then send the message there. The cafe must confirm the order.', 'پس از زدن «ثبت سفارش»، برنامه و گیرنده را انتخاب کنید و پیام را آنجا بفرستید. سفارش پس از تأیید کافه قطعی می‌شود.')}</p>
      <form noValidate className="grid gap-6 sm:grid-cols-2" onSubmit={handleSubmit(async data => {
        if (settings?.shop.maxItemsPerOrder && cart.count > settings.shop.maxItemsPerOrder) { setStatus(T('Reduce the basket quantity to the shop limit: ', 'تعداد اقلام سبد را به سقف مجاز کاهش دهید: ') + settings.shop.maxItemsPerOrder); return; }
        const customer: Record<string, string | undefined> = { [T('Name', 'نام')]: data.name, [T('Phone', 'موبایل')]: data.phone };
        if(checkout.email !== 'off') customer[T('Email', 'ایمیل')] = data.email;
        if(checkout.address !== 'off') { customer[T('Address', 'نشانی')] = [data.province, data.city, data.address].filter(Boolean).join('، '); }
        if(checkout.postalCode !== 'off') customer[T('Postal code', 'کد پستی')] = data.postalCode;
        if(checkout.note) customer[T('Notes', 'توضیحات')] = data.note;
        for(const f of checkout.fields) customer[l(f.label)] = data.answers?.[f.id];
        const text = sharedOrderText({shop:l(settings?.name),recipient:recipient ?? '',lines:cart.lines,name:l,customer,showPrices:settings?.shop.showPrices ?? true,money:formatMoney,labels:{order:T('Order request','درخواست سفارش'),customer:T('Customer details','مشخصات سفارش‌دهنده'),recipient:T('Recipient','گیرنده')}});
        setPreview(text); const result=await shareOrder(text, {kind:settings?.shop.shareTarget ?? 'chooser',username:settings?.shop.instagramUsername ?? ''});
        setStatus(result==='instagram-opened' ? T('Order text copied. Paste it into the Instagram conversation and send.', 'متن سفارش کپی شد؛ در گفت‌وگوی اینستاگرام جای‌گذاری و ارسال کنید.') : result==='opened' ? T('Complete sending in the selected app; your basket is kept.', 'ارسال را در برنامهٔ انتخاب‌شده تکمیل کنید؛ سبد شما حفظ شده است.') : result==='cancelled' ? T('Sending cancelled; your basket is kept.', 'ارسال لغو شد؛ سبد شما حفظ شده است.') : T('Sharing is unavailable here. Copy the order text and send it to the recipient.', 'ارسال مستقیم در این مرورگر فعال نیست. متن سفارش را کپی و برای گیرنده بفرستید.'));
      })}>
        {field('name',T('Full name','نام و نام خانوادگی'))}{field('phone',T('Mobile number','شماره موبایل'),'tel')}
        {checkout.email!=='off' && field('email',T('Email','ایمیل'),'email')}
        {checkout.address!=='off' && <>{checkout.region && <>{field('province',T('Province','استان'))}{field('city',T('City','شهر'))}</>}{field('address',T('Address','نشانی'))}</>}
        {checkout.postalCode!=='off' && field('postalCode',T('Postal code','کد پستی'))}
        {checkout.fields.map(f=><FieldShell key={f.id} id={`share-extra-${f.id}`} label={l(f.label)} error={formState.errors.answers?.[f.id] ? T('Required','الزامی') : undefined}>{f.type==='select' ? <Select id={`share-extra-${f.id}`} {...register(`answers.${f.id}`)}><option value="" />{f.options.map((o,i)=><option key={i} value={l(o)}>{l(o)}</option>)}</Select> : f.type==='textarea' ? <TextArea id={`share-extra-${f.id}`} {...register(`answers.${f.id}`)} /> : <TextInput id={`share-extra-${f.id}`} {...register(`answers.${f.id}`)} />}</FieldShell>)}
        {checkout.note && <FieldShell id="share-note" label={T('Notes','توضیحات')}><TextArea id="share-note" {...register('note')} /></FieldShell>}
        <div className="sm:col-span-2"><Button type="submit" disabled={formState.isSubmitting}>{T('Place order','ثبت سفارش')}</Button></div>
      </form>
      {status && <p role="status" className="mt-6">{status}</p>}
      {preview && <div className="mt-6"><FieldShell id="share-preview" label={T('Order text','متن سفارش')}><TextArea id="share-preview" readOnly value={preview} rows={10} /></FieldShell>{instagram && settings?.shop.instagramUsername && <a className="mt-3 inline-block underline" href={'https://ig.me/m/' + encodeURIComponent(settings.shop.instagramUsername.replace(/^@/,''))} target="_blank" rel="noreferrer noopener">{T('Open recipient chat','بازکردن گفت‌وگوی گیرنده')}</a>}<Button className="mt-3" variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(preview);setStatus(T('Copied. Paste into the recipient chat.','کپی شد؛ در گفت‌وگوی گیرنده جای‌گذاری کنید.'));}catch{setStatus(T('Select and copy the order text above.','متن سفارش بالا را انتخاب و کپی کنید.'));}}}>{T('Copy order text','کپی متن سفارش')}</Button></div>}
    </>}
    <Link to="/cart" className="mt-8 inline-block underline">{T('Edit basket','ویرایش سبد خرید')}</Link>
  </Container></Section></>;
}
