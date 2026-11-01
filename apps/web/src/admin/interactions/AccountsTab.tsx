import type { SiteSettings } from '@site-builder/shared';
import { Card, Checkbox, SelectField, TextField } from '../ui';
import { L, useL } from './common';

/** Customer accounts on the site (operator) and who gets told about new requests (owner too). */
export function AccountsTab({ s, set, part }: { s: SiteSettings; set: <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => void; part: 'accounts' | 'notifications' }) {
  const t = useL();
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
                <Checkbox label={t(L('Allow passwords', 'امکان رمز عبور'))} checked={a.passwords} onChange={(passwords) => set('accounts', { ...a, passwords })} hint={t(L('Signing in with a one-time code always works.', 'ورود با کد یک‌بارمصرف همیشه فعال است.'))} />
              </div>
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
