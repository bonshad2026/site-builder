import { Link } from 'react-router';
import { Button, ButtonLink } from '../../components/ui/Button';
import { usePreferences } from '../../lib/preferences';
import { L, useCustomer, useText } from '../account/customerApi';

/** After a request is sent: its tracking code, a link to follow it, and what happens next. */
export function SubmittedNotice({ code, token, onAnother, title, text }: { code?: string; token?: string; onAnother: () => void; title?: string; text?: string }) {
  const { m } = usePreferences();
  const t = useText();
  const { customer } = useCustomer();
  const link = code ? `/track/${code}${token && !customer ? `?t=${encodeURIComponent(token)}` : ''}` : null;
  return (
    <div role="status" className="reveal border border-line bg-surface p-8 sm:p-12">
      <h3 className="font-display text-3xl text-ink">{title || m.form.sentTitle}</h3>
      <p className="mt-4 max-w-lg whitespace-pre-wrap leading-relaxed text-ink-soft">{text || m.form.sentText}</p>
      {code && (
        <div className="mt-6 flex flex-wrap items-center gap-4 border-y border-line py-4">
          <span className="text-sm text-ink-soft">{t(L('Tracking code', 'کد پیگیری'))}</span>
          <span className="font-display text-2xl text-ink" dir="ltr">
            {code}
          </span>
        </div>
      )}
      {code && <p className="mt-3 text-sm text-ink-soft">{customer ? t(L('You can follow it in your account.', 'در حساب کاربری‌تان می‌توانید پیگیری کنید.')) : t(L('Keep this code; with it and your phone or email you can follow the request.', 'این کد را نگه دارید؛ با آن و تلفن یا ایمیل‌تان می‌توانید درخواست را پیگیری کنید.'))}</p>}
      <div className="mt-8 flex flex-wrap gap-3">
        {link && <ButtonLink to={link}>{t(L('Follow this request', 'پیگیری این درخواست'))}</ButtonLink>}
        <Button variant="outline" onClick={onAnother}>
          {m.form.another}
        </Button>
        {customer && (
          <Link to="/account" className="self-center text-sm underline-offset-4 hover:underline">
            {t(L('My account', 'حساب من'))}
          </Link>
        )}
      </div>
    </div>
  );
}
