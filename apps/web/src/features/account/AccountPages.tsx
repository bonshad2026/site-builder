import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { FieldShell, TextInput } from '../../components/ui/Field';
import { Container } from '../../components/ui/Layout';
import { cn } from '../../lib/cn';
import { errorLine } from '../../lib/errorText';
import { usePreferences } from '../../lib/preferences';
import { useSiteErrorLanguage } from '../public-site/data';
import { CaseView } from './CaseView';
import { L, useCustomer, useCustomerApi, useRefreshCustomer, useText, type Customer } from './customerApi';

type Mode = 'login' | 'signup' | 'reset';

/** Sign in, sign up or reset a password: one form, with a one-time code sent by SMS or email. */
function AuthPanel({ next }: { next?: string }) {
  const t = useText();
  const api = useCustomerApi();
  const refresh = useRefreshCustomer();
  const navigate = useNavigate();
  const errLang = useSiteErrorLanguage();
  const { accounts } = useCustomer();
  const byPhone = accounts?.identifier !== 'email';
  const passwords = accounts?.passwords !== false;
  const [mode, setMode] = useState<Mode>('login');
  const [withCode, setWithCode] = useState(!passwords);
  const [identifier, setIdentifier] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  const sendCode = useMutation({
    mutationFn: () => api.post<{ sent: boolean; devCode?: string }>('/customer/code', { identifier, purpose: mode }),
    onSuccess: (r) => {
      setCodeSent(true);
      setDevCode(r.devCode ?? null);
    },
  });
  const submit = useMutation({
    mutationFn: () =>
      mode === 'signup'
        ? api.post<Customer>('/customer/signup', { identifier, code, name, ...(password ? { password } : {}) })
        : mode === 'reset'
          ? api.post<Customer>('/customer/reset', { identifier, code, password })
          : api.post<Customer>('/customer/login', withCode ? { identifier, code } : { identifier, password }),
    onSuccess: async () => {
      await refresh();
      if (next) navigate(next);
    },
  });
  const switchMode = (m: Mode) => {
    setMode(m);
    setCodeSent(false);
    setCode('');
    setDevCode(null);
    sendCode.reset();
    submit.reset();
  };
  const needsCode = mode !== 'login' || withCode;
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (needsCode && !codeSent) sendCode.mutate();
    else submit.mutate();
  };
  const idLabel = byPhone ? t(L('Mobile number', 'شماره موبایل')) : t(L('Email', 'ایمیل'));

  return (
    <div className="mx-auto w-full max-w-md">
      <div role="tablist" className="mb-8 flex gap-6 border-b border-line">
        {(
          [
            ['login', L('Sign in', 'ورود')],
            ['signup', L('Create account', 'ثبت‌نام')],
          ] as const
        ).map(([m, label]) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => switchMode(m)} className={cn('-mb-px border-b-2 pb-3 text-sm', mode === m ? 'border-ink text-ink' : 'border-transparent text-ink-soft hover:text-ink')}>
            {t(label)}
          </button>
        ))}
      </div>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
        {mode === 'reset' && <p className="text-sm text-ink-soft">{t(L('We will send you a code to set a new password.', 'یک کد برای تعیین رمز جدید برایتان ارسال می‌کنیم.'))}</p>}
        <FieldShell id="acc-id" label={idLabel}>
          <TextInput
            id="acc-id"
            type={byPhone ? 'tel' : 'email'}
            dir="ltr"
            inputMode={byPhone ? 'tel' : 'email'}
            autoComplete={byPhone ? 'tel' : 'email'}
            value={identifier}
            onChange={(e) => {
              setIdentifier(e.target.value);
              setCodeSent(false);
            }}
            placeholder={byPhone ? '09xxxxxxxxx' : 'name@example.com'}
          />
        </FieldShell>
        {mode === 'signup' && (
          <FieldShell id="acc-name" label={t(L('Your name', 'نام شما'))}>
            <TextInput id="acc-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </FieldShell>
        )}
        {mode === 'login' && !withCode && (
          <FieldShell id="acc-pass" label={t(L('Password', 'رمز عبور'))}>
            <TextInput id="acc-pass" type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </FieldShell>
        )}
        {needsCode && codeSent && (
          <>
            <p role="status" className="text-sm text-ink-soft">
              {byPhone ? t(L('A 6-digit code was sent by SMS.', 'کد ۶ رقمی با پیامک ارسال شد.')) : t(L('A 6-digit code was sent to your email.', 'کد ۶ رقمی به ایمیل شما ارسال شد.'))}
              {devCode && (
                <span className="ms-2 rounded bg-amber-100 px-2 py-0.5 text-amber-900" dir="ltr">
                  dev: {devCode}
                </span>
              )}
            </p>
            <FieldShell id="acc-code" label={t(L('Code', 'کد'))}>
              <TextInput id="acc-code" dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\D/g, ''))} />
            </FieldShell>
            {(mode === 'reset' || (mode === 'signup' && passwords)) && (
              <FieldShell id="acc-newpass" label={mode === 'reset' ? t(L('New password', 'رمز جدید')) : t(L('Password (optional)', 'رمز عبور (اختیاری)'))} hint={t(L('8+ characters', 'حداقل ۸ کاراکتر'))}>
                <TextInput id="acc-newpass" type="password" dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </FieldShell>
            )}
          </>
        )}
        {(sendCode.error || submit.error) && (
          <p role="alert" className="text-sm text-danger">
            {errorLine(submit.error ?? sendCode.error, errLang)}
          </p>
        )}
        <Button type="submit" disabled={sendCode.isPending || submit.isPending || !identifier.trim() || (mode === 'signup' && codeSent && name.trim().length < 2)}>
          {needsCode && !codeSent
            ? t(L('Send code', 'ارسال کد'))
            : mode === 'signup'
              ? t(L('Create account', 'ساخت حساب'))
              : mode === 'reset'
                ? t(L('Set password and sign in', 'ثبت رمز و ورود'))
                : t(L('Sign in', 'ورود'))}
        </Button>
        <div className="flex flex-wrap justify-between gap-3 text-sm">
          {mode === 'login' && passwords && (
            <button type="button" className="underline-offset-4 hover:underline" onClick={() => { setWithCode(!withCode); setCodeSent(false); }}>
              {withCode ? t(L('Sign in with password', 'ورود با رمز عبور')) : t(L('Sign in with a one-time code', 'ورود با کد یک‌بارمصرف'))}
            </button>
          )}
          {mode === 'login' && passwords && (
            <button type="button" className="text-ink-soft underline-offset-4 hover:underline" onClick={() => switchMode('reset')}>
              {t(L('Forgot password?', 'رمز را فراموش کرده‌اید؟'))}
            </button>
          )}
          {mode === 'reset' && (
            <button type="button" className="underline-offset-4 hover:underline" onClick={() => switchMode('login')}>
              {t(L('Back to sign in', 'بازگشت به ورود'))}
            </button>
          )}
          {needsCode && codeSent && (
            <button type="button" className="text-ink-soft underline-offset-4 hover:underline" disabled={sendCode.isPending} onClick={() => sendCode.mutate()}>
              {t(L('Send the code again', 'ارسال دوباره‌ی کد'))}
            </button>
          )}
        </div>
      </form>
      <p className="mt-10 border-t border-line pt-6 text-sm text-ink-soft">
        {t(L('Sent a request without an account? ', 'بدون حساب درخواست داده‌اید؟ '))}
        <Link to="/track" className="text-ink underline-offset-4 hover:underline">
          {t(L('Track it with its code', 'با کد پیگیری دنبالش کنید'))}
        </Link>
      </p>
    </div>
  );
}

interface CasesList {
  requests: { number: string; code: string; typeLabel: { en: string; fa: string }; stageLabel: string; stageColor: string; stageKind: string; amountDueMinor: string; currency: string; createdAt: string; updatedAt: string; lastReplyAt: string | null }[];
  orders: { number: string; code: string; stageLabel: string; status: string; totalMinor: string; currency: string; paymentStatus: string; createdAt: string }[];
}

function Profile({ customer }: { customer: Customer }) {
  const t = useText();
  const api = useCustomerApi();
  const refresh = useRefreshCustomer();
  const errLang = useSiteErrorLanguage();
  const { accounts } = useCustomer();
  const [name, setName] = useState(customer.name);
  const [other, setOther] = useState((accounts?.identifier === 'email' ? customer.phone : customer.email) ?? '');
  const [password, setPassword] = useState('');
  const [current, setCurrent] = useState('');
  const save = useMutation({
    mutationFn: () =>
      api.patch('/customer/me', {
        name,
        ...(accounts?.identifier === 'email' ? { phone: other } : { email: other }),
        ...(password ? { password, currentPassword: current } : {}),
      }),
    onSuccess: () => {
      setPassword('');
      setCurrent('');
      refresh();
    },
  });
  return (
    <form
      className="grid gap-6 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <FieldShell id="p-name" label={t(L('Name', 'نام'))}>
        <TextInput id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
      </FieldShell>
      <FieldShell id="p-other" label={accounts?.identifier === 'email' ? t(L('Mobile number', 'شماره موبایل')) : t(L('Email (optional)', 'ایمیل (اختیاری)'))}>
        <TextInput id="p-other" dir="ltr" value={other} onChange={(e) => setOther(e.target.value)} />
      </FieldShell>
      {accounts?.passwords !== false && (
        <>
          <FieldShell id="p-pass" label={customer.hasPassword ? t(L('New password', 'رمز جدید')) : t(L('Set a password', 'تعیین رمز عبور'))} hint={t(L('optional', 'اختیاری'))}>
            <TextInput id="p-pass" type="password" dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </FieldShell>
          {customer.hasPassword && password && (
            <FieldShell id="p-cur" label={t(L('Current password', 'رمز فعلی'))}>
              <TextInput id="p-cur" type="password" dir="ltr" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </FieldShell>
          )}
        </>
      )}
      <div className="flex items-center gap-4 sm:col-span-2">
        <Button type="submit" size="sm" disabled={save.isPending}>
          {t(L('Save', 'ذخیره'))}
        </Button>
        {save.isSuccess && <span className="text-sm text-emerald-700">✓</span>}
        {save.error && <span className="text-sm text-danger">{errorLine(save.error, errLang)}</span>}
      </div>
    </form>
  );
}

function Dashboard({ customer }: { customer: Customer }) {
  const t = useText();
  const api = useCustomerApi();
  const refresh = useRefreshCustomer();
  const { locale, l, formatMoney, formatDate } = usePreferences();
  const [tab, setTab] = useState<'cases' | 'profile'>('cases');
  const cases = useQuery({ queryKey: ['public', api.site, 'customer', 'cases', locale], queryFn: () => api.get<CasesList>(`/customer/cases?locale=${locale}`) });
  const logout = useMutation({ mutationFn: () => api.post('/customer/logout'), onSuccess: refresh });
  const dot: Record<string, string> = { gray: 'bg-stone-400', blue: 'bg-sky-500', amber: 'bg-amber-500', violet: 'bg-violet-500', green: 'bg-emerald-500', red: 'bg-rose-500' };
  const data = cases.data;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{t(L('My account', 'حساب من'))}</p>
          <h1 className="mt-2 font-display text-4xl text-ink">{customer.name}</h1>
          <p className="mt-1 text-sm text-ink-soft" dir="ltr">
            {customer.phone ?? customer.email}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
          {t(L('Sign out', 'خروج'))}
        </Button>
      </div>
      <div role="tablist" className="flex gap-6 border-b border-line">
        {(
          [
            ['cases', L('Requests and orders', 'درخواست‌ها و سفارش‌ها')],
            ['profile', L('Profile', 'مشخصات')],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('-mb-px border-b-2 pb-3 text-sm', tab === k ? 'border-ink text-ink' : 'border-transparent text-ink-soft hover:text-ink')}>
            {t(label)}
          </button>
        ))}
      </div>
      {tab === 'profile' ? (
        <Profile customer={customer} />
      ) : cases.isLoading ? (
        <p className="text-ink-soft">{t(L('Loading…', 'در حال بارگذاری…'))}</p>
      ) : (
        <div className="flex flex-col gap-10">
          <section>
            <h2 className="mb-4 text-sm font-medium text-ink-soft">{t(L('Requests', 'درخواست‌ها'))}</h2>
            {data?.requests.length ? (
              <ul className="divide-y divide-line border-y border-line">
                {data.requests.map((r) => (
                  <li key={r.number}>
                    <Link to={`/track/${r.code}`} className="flex flex-wrap items-center gap-x-6 gap-y-1 py-4 hover:bg-surface">
                      <span className="w-20 font-medium" dir="ltr">
                        {r.code}
                      </span>
                      <span className="min-w-32 flex-1">{l(r.typeLabel)}</span>
                      <span className="inline-flex items-center gap-2 text-sm">
                        <span className={cn('size-2 rounded-full', dot[r.stageColor] ?? dot.gray)} />
                        {r.stageLabel}
                      </span>
                      {BigInt(r.amountDueMinor) > 0n && r.stageKind === 'open' && <span className="text-sm text-accent">💳 {formatMoney(r.amountDueMinor, r.currency)}</span>}
                      <span className="text-xs text-ink-soft">{formatDate(r.updatedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-soft">{t(L('No requests yet.', 'هنوز درخواستی ثبت نکرده‌اید.'))}</p>
            )}
          </section>
          {!!data?.orders.length && (
            <section>
              <h2 className="mb-4 text-sm font-medium text-ink-soft">{t(L('Orders', 'سفارش‌ها'))}</h2>
              <ul className="divide-y divide-line border-y border-line">
                {data.orders.map((o) => (
                  <li key={o.number}>
                    <Link to={`/track/${o.number}`} className="flex flex-wrap items-center gap-x-6 gap-y-1 py-4 hover:bg-surface">
                      <span className="w-20 font-medium" dir="ltr">
                        {o.code}
                      </span>
                      <span className="flex-1 text-sm">{o.stageLabel}</span>
                      <span className="text-sm">{formatMoney(o.totalMinor, o.currency)}</span>
                      <span className="text-xs text-ink-soft">{formatDate(o.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/** /account: sign in or sign up, then the customer's requests, orders and profile. */
export function AccountPage() {
  const t = useText();
  const [params] = useSearchParams();
  const { enabled, customer, loading, accounts } = useCustomer();
  // Settings still loading: wait before deciding the site has no accounts.
  if (!accounts) return <Container className="py-16">{null}</Container>;
  if (!enabled && !loading) return <Navigate to="/track" replace />;
  return (
    <Container className="py-16 sm:py-24">
      {loading ? <p className="text-ink-soft">{t(L('Loading…', 'در حال بارگذاری…'))}</p> : customer ? <Dashboard customer={customer} /> : <AuthPanel next={params.get('next') ?? undefined} />}
    </Container>
  );
}

/** /track: find a request or order by its code and the phone or email it was sent with. */
export function TrackPage() {
  const t = useText();
  const api = useCustomerApi();
  const navigate = useNavigate();
  const errLang = useSiteErrorLanguage();
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get('code') ?? '');
  const [contact, setContact] = useState('');
  const { enabled } = useCustomer();
  const find = useMutation({
    mutationFn: () => api.post<{ kind: string; code: string; token: string }>('/track', { code, contact }),
    onSuccess: (r) => navigate(`/track/${r.code}?t=${encodeURIComponent(r.token)}`),
  });
  return (
    <Container className="py-16 sm:py-24">
      <div className="mx-auto max-w-md">
        <p className="eyebrow">{t(L('Tracking', 'پیگیری'))}</p>
        <h1 className="mt-3 font-display text-4xl text-ink">{t(L('Track your request or order', 'پیگیری درخواست یا سفارش'))}</h1>
        <p className="mt-4 text-ink-soft">{t(L('Enter the tracking code you received and the phone number or email you used.', 'کد پیگیری دریافتی و شماره تلفن یا ایمیلی را که وارد کرده بودید بنویسید.'))}</p>
        <form
          noValidate
          className="mt-10 flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            find.mutate();
          }}
        >
          <FieldShell id="tr-code" label={t(L('Tracking code', 'کد پیگیری'))}>
            <TextInput id="tr-code" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} placeholder="R1001" />
          </FieldShell>
          <FieldShell id="tr-contact" label={t(L('Phone or email', 'تلفن یا ایمیل'))}>
            <TextInput id="tr-contact" dir="ltr" value={contact} onChange={(e) => setContact(e.target.value)} />
          </FieldShell>
          {find.error && (
            <p role="alert" className="text-sm text-danger">
              {(find.error as { status?: number }).status === 404 ? t(L('Nothing matches this code and contact.', 'موردی با این کد و مشخصات پیدا نشد.')) : errorLine(find.error, errLang)}
            </p>
          )}
          <Button type="submit" disabled={!code.trim() || !contact.trim() || find.isPending}>
            {t(L('Track', 'پیگیری'))}
          </Button>
        </form>
        {enabled && (
          <p className="mt-10 border-t border-line pt-6 text-sm text-ink-soft">
            {t(L('Have an account? ', 'حساب کاربری دارید؟ '))}
            <Link to="/account" className="text-ink underline-offset-4 hover:underline">
              {t(L('See all your requests', 'همه‌ی درخواست‌هایتان را ببینید'))}
            </Link>
          </p>
        )}
      </div>
    </Container>
  );
}

/** /track/:code — one request (R1001) or order (1001), with its link token (?t=) or the customer's session. */
export function CasePage() {
  const { code = '' } = useParams();
  const { dir } = usePreferences();
  const [params] = useSearchParams();
  const { customer } = useCustomer();
  const t = useText();
  return (
    <Container className="py-16 sm:py-24">
      <CaseView code={code} token={params.get('t') ?? params.get('token') ?? undefined} paymentResult={params.get('payment')} />
      <p className="mt-12 text-sm">
        <Link to={customer ? '/account' : '/track'} className="text-ink-soft underline-offset-4 hover:underline">
          {dir === 'rtl' ? '→' : '←'} {customer ? t(L('My account', 'حساب من')) : t(L('Track another', 'پیگیری مورد دیگر'))}
        </Link>
      </p>
    </Container>
  );
}
