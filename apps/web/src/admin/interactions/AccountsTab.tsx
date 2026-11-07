import type { SiteSettings } from '@site-builder/shared';
import { usePreferences } from '../../lib/preferences';
import { useAdminCollections } from '../collections/api';
import { Card, Checkbox, ListEditor, LocalizedField, SelectField, TextField } from '../ui';
import { L, useL } from './common';

/** Customer accounts on the site (operator) and who gets told about new requests (owner too). */
export function AccountsTab({ siteId, s, set, part }: { siteId: string; s: SiteSettings; set: <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => void; part: 'accounts' | 'notifications' }) {
  const t = useL();
  const { l } = usePreferences();
  const { data: tables = [] } = useAdminCollections(siteId);
  const a = s.accounts;
  const n = s.notifications;
  return (
    <>
      {part === 'accounts' && (
        <Card title={t(L('Customer accounts', 'حساب کاربری مشتریان'))}>
          <div className="flex flex-col gap-4">
            <Checkbox
              label={t(L('Visitors can sign up and sign in', 'بازدیدکنندگان بتوانند ثبت‌نام و ورود کنند'))}
              checked={a.enabled}
              onChange={(enabled) => set('accounts', { ...a, enabled })}
              hint={t(
                L(
                  'Adds “Sign in” to the header and a “My account” page with the customer’s requests and orders. Without an account, visitors still follow a request with its tracking code.',
                  '«ورود» به سربرگ و صفحه‌ی «حساب من» با درخواست‌ها و سفارش‌های مشتری اضافه می‌شود. بدون حساب هم بازدیدکننده با کد پیگیری درخواستش را دنبال می‌کند.',
                ),
              )}
            />
            {a.enabled && (
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label={t(L('Accounts are identified by', 'شناسه‌ی حساب'))}
                  value={a.identifier}
                  onChange={(identifier) => set('accounts', { ...a, identifier })}
                  options={[
                    { value: 'phone', label: t(L('Mobile number (code by SMS)', 'شماره موبایل (کد با پیامک)')) },
                    { value: 'email', label: t(L('Email (code by email)', 'ایمیل (کد با ایمیل)')) },
                  ]}
                />
                <Checkbox label={t(L('Verify signup with a code','تأیید ثبت‌نام با کد'))} checked={a.signupVerification} onChange={signupVerification=>set('accounts',{...a,signupVerification})} />
                <Checkbox label={t(L('Allow passwords', 'امکان رمز عبور'))} checked={a.passwords} onChange={(passwords) => set('accounts', { ...a, passwords })} hint={t(L('Signing in with a one-time code always works.', 'ورود با کد یک‌بارمصرف همیشه فعال است.'))} />
              </div>
            )}
            {a.enabled && (
              <ListEditor
                label={t(L('Kinds of account (optional)', 'انواع حساب (اختیاری)'))}
                items={a.kinds}
                max={6}
                onChange={(kinds) => set('accounts', { ...a, kinds })}
                create={() => ({ key: `kind${a.kinds.length + 1}`, label: { en: '', fa: '' }, hint: { en: '', fa: '' }, organization: false, profileTable: '' })}
                render={(k, update) => (
                  <div className="flex flex-col gap-3">
                    <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
                      <TextField label={t(L('Key', 'کلید'))} dir="ltr" value={k.key} onChange={(key) => update({ ...k, key: key.toLowerCase().replace(/[^a-z0-9_-]/g, '') })} hint={`/account?kind=${k.key}`} />
                      <LocalizedField label={t(L('Name (e.g. Organisation)', 'نام (مثلاً سازمان)'))} value={k.label} onChange={(label) => update({ ...k, label })} />
                    </div>
                    <LocalizedField label={t(L('Short explanation', 'توضیح کوتاه'))} value={k.hint} onChange={(hint) => update({ ...k, hint })} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Checkbox label={t(L('Ask for the organisation’s name', 'نام سازمان پرسیده شود'))} checked={k.organization} onChange={(organization) => update({ ...k, organization })} />
                      <SelectField
                        label={t(L('Keeps its own item in', 'آیتم اختصاصی در جدول'))}
                        value={k.profileTable}
                        onChange={(profileTable) => update({ ...k, profileTable })}
                        options={[{ value: '', label: '—' }, ...tables.filter((x) => x.selfService.enabled || x.slug === k.profileTable).map((x) => ({ value: x.slug, label: l(x.name) || x.slug }))]}
                        hint={t(L('Only tables with “Customers keep their own item” on.', 'فقط جدول‌هایی که «مشتری‌ها آیتم خودشان را دارند» در آن‌ها روشن است.'))}
                      />
                    </div>
                  </div>
                )}
              />
            )}
            {a.enabled && (
              <p className="text-xs text-ink-soft">
                {t(L('Sending SMS needs an SMS provider on the server (Kavenegar). On this development server codes appear on screen and in the API log.', 'ارسال پیامک به سرویس پیامک روی سرور (کاوه‌نگار) نیاز دارد. روی این سرور توسعه، کد روی صفحه و در لاگ API نمایش داده می‌شود.'))}
              </p>
            )}
          </div>
        </Card>
      )}
      {part === 'notifications' && (
      <Card title={t(L('Staff notifications', 'اطلاع‌رسانی به کارکنان'))}>
        <div className="flex flex-col gap-4">
          <Checkbox label={t(L('Email the staff about new requests, orders and customer messages', 'ارسال ایمیل به کارکنان برای درخواست، سفارش و پیام جدید مشتری'))} checked={n.staff} onChange={(staff) => set('notifications', { ...n, staff })} />
          {n.staff && (
            <TextField
              label={t(L('Send to (comma separated; empty = the site owners)', 'ارسال به (با کاما جدا کنید؛ خالی = مالکان سایت)'))}
              dir="ltr"
              value={n.emails.join(', ')}
              onChange={(v) =>
                set('notifications', {
                  ...n,
                  emails: v
                    .split(/[,،\s]+/)
                    .map((x) => x.trim().toLowerCase())
                    .filter(Boolean)
                    .slice(0, 5),
                })
              }
            />
          )}
        </div>
      </Card>
      )}
    </>
  );
}
