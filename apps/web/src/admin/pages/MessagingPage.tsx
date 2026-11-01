import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';
import { Badge, Card, Checkbox, ErrorNote, PageTitle, Spinner, TextField, useToast } from '../ui';

interface Messaging {
  email: { enabled: boolean; from: string; hasSmtpUrl: boolean };
  sms: { enabled: boolean; otpTemplate: string; sender: string; hasApiKey: boolean };
  server: { email: string; sms: string };
}

/**
 * E-mail (SMTP) and SMS (Kavenegar) for this server, set here instead of in its environment.
 * Saved secrets are never shown again; leave a secret empty to keep the saved one.
 */
export default function MessagingPage() {
  const { locale } = usePreferences();
  const T = (en: string, fa: string) => (locale === 'fa' ? fa : en);
  const qc = useQueryClient();
  const toast = useToast();
  const data = useQuery({ queryKey: ['platform', 'messaging'], queryFn: () => api.get<Messaging>('/platform/messaging') });
  const [form, setForm] = useState({ email: { enabled: false, smtpUrl: '', from: '' }, sms: { enabled: false, apiKey: '', otpTemplate: '', sender: '' } });
  const [test, setTest] = useState({ email: '', phone: '' });
  useEffect(() => {
    const d = data.data;
    if (d) setForm({ email: { enabled: d.email.enabled, smtpUrl: '', from: d.email.from }, sms: { enabled: d.sms.enabled, apiKey: '', otpTemplate: d.sms.otpTemplate, sender: d.sms.sender } });
  }, [data.data]);
  const save = useMutation({
    mutationFn: () => api.put('/platform/messaging', form),
    onSuccess: () => {
      toast(T('Saved', 'ذخیره شد'));
      qc.invalidateQueries({ queryKey: ['platform', 'messaging'] });
    },
  });
  const send = useMutation({
    mutationFn: () => api.post<{ email?: string; sms?: string }>('/platform/messaging/test', { email: test.email || undefined, phone: test.phone || undefined }),
    onSuccess: (r) => toast([r.email && `${T('E-mail', 'ایمیل')}: ${r.email}`, r.sms && `SMS: ${r.sms}`].filter(Boolean).join(' · '), r.email && r.email !== 'ok' ? 'bad' : r.sms && r.sms !== 'ok' ? 'bad' : 'good'),
  });
  if (data.isLoading) return <Spinner />;
  const d = data.data;
  const setE = (patch: Partial<typeof form.email>) => setForm((f) => ({ ...f, email: { ...f.email, ...patch } }));
  const setS = (patch: Partial<typeof form.sms>) => setForm((f) => ({ ...f, sms: { ...f.sms, ...patch } }));
  return (
    <>
      <PageTitle
        title={T('E-mail and SMS', 'ایمیل و پیامک')}
        subtitle={T('Used for sign-in codes, request and order messages and staff notices. Settings here win over the server environment.', 'برای کد ورود، پیام‌های درخواست و سفارش و اطلاع‌رسانی به کارکنان. تنظیمات این صفحه بر تنظیمات محیط سرور مقدم است.')}
      />
      <ErrorNote error={data.error} />
      {d && (
        <p className="mb-6 flex flex-wrap gap-2 text-sm text-ink-soft">
          {T('Server environment', 'تنظیم محیط سرور')}: <Badge>email: {d.server.email}</Badge> <Badge>sms: {d.server.sms}</Badge>
        </p>
      )}
      <form
        className="flex max-w-2xl flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Card title={T('E-mail (SMTP)', 'ایمیل (SMTP)')}>
          <div className="flex flex-col gap-4">
            <Checkbox label={T('Send e-mail with these settings', 'ارسال ایمیل با این تنظیمات')} checked={form.email.enabled} onChange={(enabled) => setE({ enabled })} />
            <TextField
              label={T('SMTP address', 'آدرس SMTP')}
              dir="ltr"
              value={form.email.smtpUrl}
              onChange={(smtpUrl) => setE({ smtpUrl })}
              hint={d?.email.hasSmtpUrl ? T('Saved; leave empty to keep it', 'ذخیره شده؛ برای نگه داشتن خالی بگذارید') : 'smtps://user:pass@mail.example.com:465'}
            />
            <TextField label={T('Sender', 'فرستنده')} dir="ltr" value={form.email.from} onChange={(from) => setE({ from })} hint="Shop <no-reply@example.ir>" />
          </div>
        </Card>
        <Card title={T('SMS (Kavenegar)', 'پیامک (کاوه‌نگار)')}>
          <div className="flex flex-col gap-4">
            <Checkbox label={T('Send SMS with these settings', 'ارسال پیامک با این تنظیمات')} checked={form.sms.enabled} onChange={(enabled) => setS({ enabled })} />
            <TextField label={T('API key', 'کلید API')} dir="ltr" value={form.sms.apiKey} onChange={(apiKey) => setS({ apiKey })} hint={d?.sms.hasApiKey ? T('Saved; leave empty to keep it', 'ذخیره شده؛ برای نگه داشتن خالی بگذارید') : undefined} />
            <TextField label={T('Verify template (sign-in codes)', 'قالب Verify (کد ورود)')} dir="ltr" value={form.sms.otpTemplate} onChange={(otpTemplate) => setS({ otpTemplate })} hint="verify" />
            <TextField label={T('Sender line (optional)', 'خط ارسال (اختیاری)')} dir="ltr" value={form.sms.sender} onChange={(sender) => setS({ sender })} />
          </div>
        </Card>
        <ErrorNote error={save.error} />
        <div>
          <Button type="submit" disabled={save.isPending}>
            {T('Save', 'ذخیره')}
          </Button>
        </div>
      </form>
      <Card title={T('Send a test', 'ارسال آزمایشی')} className="mt-8 max-w-2xl">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={T('E-mail to', 'ایمیل به')} type="email" dir="ltr" value={test.email} onChange={(email) => setTest((x) => ({ ...x, email }))} />
          <TextField label={T('SMS to', 'پیامک به')} dir="ltr" value={test.phone} onChange={(phone) => setTest((x) => ({ ...x, phone }))} />
        </div>
        <div className="mt-4">
          <Button variant="outline" disabled={send.isPending || (!test.email && !test.phone)} onClick={() => send.mutate()}>
            {T('Send test', 'ارسال آزمایشی')}
          </Button>
        </div>
      </Card>
    </>
  );
}
