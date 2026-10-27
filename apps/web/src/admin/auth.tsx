import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Button } from '../components/ui/Button';
import { api, apiAvailable, ApiError } from '../lib/api';
import { cn } from '../lib/cn';
import { useT } from './i18n';
import { ErrorNote, TextField } from './ui';

export interface MeUser {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  isPlatformAdmin: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
}
export interface MySite {
  siteId: string;
  name: string;
  status: string;
  role: 'owner' | 'staff';
  permissions: string[];
}
export interface Me {
  user: MeUser;
  sites: MySite[];
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.get<Me>('/auth/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    enabled: apiAvailable(),
    staleTime: 60_000,
    retry: false,
  });
}

export function useLogout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSettled: () => {
      qc.clear();
      navigate('/admin/login');
    },
  });
}

/** Admin pages require a session; otherwise go to sign-in and come back afterwards. */
export function RequireAuth({ children }: { children: (me: Me) => ReactNode }) {
  const t = useT();
  const { data: me, isLoading, error } = useMe();
  const location = useLocation();
  if (!apiAvailable()) return <AuthFrame title={t.brand}>{t.noApi}</AuthFrame>;
  if (isLoading) return <div role="status" aria-label={t.loading} className="min-h-screen bg-bg" />;
  if (error) return <AuthFrame title={t.brand}><ErrorNote error={error} /></AuthFrame>;
  if (!me) return <Navigate to={`/admin/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children(me)}</>;
}

export function AuthFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4 py-16">
      <div className="w-full max-w-md border border-line bg-surface p-8 shadow-sm sm:p-10">
        <p className="eyebrow mb-3">Site Builder</p>
        <h1 className="mb-8 font-display text-3xl text-ink">{title}</h1>
        {children}
      </div>
    </div>
  );
}

const safeNext = (next: string | null) => (next && next.startsWith('/admin') && !next.startsWith('//') ? next : '/admin');

export function LoginPage() {
  const t = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<'password' | 'otp'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);

  const done = async () => {
    await qc.invalidateQueries({ queryKey: ['me'] });
    navigate(safeNext(params.get('next')), { replace: true });
  };
  const login = useMutation({ mutationFn: () => api.post('/auth/login', { email, password }), onSuccess: done });
  const requestCode = useMutation({ mutationFn: () => api.post('/auth/otp/request', { phone }), onSuccess: () => setCodeSent(true) });
  const otpLogin = useMutation({ mutationFn: () => api.post('/auth/otp/login', { phone, code }), onSuccess: done });

  if (!apiAvailable()) return <AuthFrame title={t.signIn}>{t.noApi}</AuthFrame>;

  return (
    <AuthFrame title={t.signIn}>
      <div role="tablist" className="mb-6 grid grid-cols-2 rounded-md border border-line p-1 text-sm">
        {(['password', 'otp'] as const).map((m) => (
          <button key={m} role="tab" type="button" aria-selected={mode === m} onClick={() => setMode(m)} className={cn('rounded py-2', mode === m ? 'bg-ink text-bg' : 'text-ink-soft')}>
            {m === 'password' ? t.withPassword : t.withCode}
          </button>
        ))}
      </div>
      {mode === 'password' ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate();
          }}
        >
          <TextField label={t.email} type="email" dir="ltr" value={email} onChange={setEmail} required />
          <TextField label={t.password} type="password" dir="ltr" value={password} onChange={setPassword} required />
          <ErrorNote error={login.error} />
          <Button type="submit" disabled={login.isPending}>
            {t.signIn}
          </Button>
          <Link to="/admin/forgot" className="text-center text-sm text-ink-soft underline-offset-4 hover:underline">
            {t.forgot}
          </Link>
        </form>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (codeSent) otpLogin.mutate();
            else requestCode.mutate();
          }}
        >
          <TextField label={t.phone} type="tel" dir="ltr" value={phone} onChange={setPhone} required placeholder="+989121234567" />
          {codeSent && (
            <>
              <p className="text-sm text-ink-soft">{t.codeSent}</p>
              <TextField label={t.code} dir="ltr" value={code} onChange={setCode} required />
            </>
          )}
          <ErrorNote error={requestCode.error ?? otpLogin.error} />
          <Button type="submit" disabled={requestCode.isPending || otpLogin.isPending}>
            {codeSent ? t.signIn : t.sendCode}
          </Button>
        </form>
      )}
    </AuthFrame>
  );
}

export function ForgotPasswordPage() {
  const t = useT();
  const [email, setEmail] = useState('');
  const send = useMutation({ mutationFn: () => api.post('/auth/password/forgot', { email }) });
  return (
    <AuthFrame title={t.forgotTitle}>
      {send.isSuccess ? (
        <p role="status" className="text-ink">
          {t.forgotSent}
        </p>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate();
          }}
        >
          <TextField label={t.email} type="email" dir="ltr" value={email} onChange={setEmail} required />
          <ErrorNote error={send.error} />
          <Button type="submit" disabled={send.isPending}>
            {t.sendLink}
          </Button>
        </form>
      )}
      <Link to="/admin/login" className="mt-6 block text-center text-sm text-ink-soft hover:underline">
        {t.backToSignIn}
      </Link>
    </AuthFrame>
  );
}

export function ResetPasswordPage() {
  const t = useT();
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const reset = useMutation({ mutationFn: () => api.post('/auth/password/reset', { token: params.get('token') ?? '', password }) });
  return (
    <AuthFrame title={t.setPassword}>
      {reset.isSuccess ? (
        <p role="status" className="text-ink">
          {t.passwordSet}
        </p>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            reset.mutate();
          }}
        >
          <TextField label={t.newPassword} type="password" dir="ltr" value={password} onChange={setPassword} hint={t.passwordRule} required />
          <ErrorNote error={reset.error} />
          <Button type="submit" disabled={reset.isPending}>
            {t.setPassword}
          </Button>
        </form>
      )}
      <Link to="/admin/login" className="mt-6 block text-center text-sm text-ink-soft hover:underline">
        {t.backToSignIn}
      </Link>
    </AuthFrame>
  );
}

export function VerifyEmailPage() {
  const t = useT();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const verify = useQuery({ queryKey: ['verify-email', token], queryFn: () => api.post('/auth/email/verify', { token }), retry: false, enabled: !!token });
  return (
    <AuthFrame title={t.verifyEmail}>
      {verify.isLoading ? <p>{t.loading}</p> : verify.isSuccess ? <p role="status">{t.emailVerified}</p> : <p role="alert" className="text-danger">{t.linkInvalid}</p>}
      <Link to="/admin" className="mt-6 block text-center text-sm text-ink-soft hover:underline">
        {t.backToSignIn}
      </Link>
    </AuthFrame>
  );
}
