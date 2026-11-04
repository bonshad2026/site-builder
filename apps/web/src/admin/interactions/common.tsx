import type { STAGE_COLORS } from '@site-builder/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { cn } from '../../lib/cn';
import { api } from '../../lib/api';
import { usePreferences } from '../../lib/preferences';

export type Lbl = { en: string; fa: string };
export const L = (en: string, fa: string): Lbl => ({ en, fa });

/** Picks the admin's language from a pair of texts. */
export function useL() {
  const { locale } = usePreferences();
  return (x: Lbl) => x[locale];
}

export const STAGE_DOT: Record<(typeof STAGE_COLORS)[number], string> = {
  gray: 'bg-stone-400',
  blue: 'bg-sky-500',
  amber: 'bg-amber-500',
  violet: 'bg-violet-500',
  green: 'bg-emerald-500',
  red: 'bg-rose-500',
};

export const STAGE_CHIP: Record<(typeof STAGE_COLORS)[number], string> = {
  gray: 'border-stone-300 bg-stone-100 text-stone-700',
  blue: 'border-sky-200 bg-sky-50 text-sky-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  violet: 'border-violet-200 bg-violet-50 text-violet-800',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  red: 'border-rose-200 bg-rose-50 text-rose-800',
};

export function StageChip({ label, color = 'gray', className }: { label: string; color?: keyof typeof STAGE_CHIP; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium', STAGE_CHIP[color] ?? STAGE_CHIP.gray, className)}>
      <span className={cn('size-1.5 rounded-full', STAGE_DOT[color] ?? STAGE_DOT.gray)} />
      {label}
    </span>
  );
}

export interface CaseEvent {
  id: string;
  kind: string;
  public: boolean;
  body: string;
  data: Record<string, unknown>;
  byCustomer: boolean;
  actorUserId: string | null;
  createdAt: string;
}

/** Staff of the site by user id (for names on the timeline and assigning). */
export function useStaff(siteId: string) {
  return useQuery({ queryKey: ['site', siteId, 'staff'], queryFn: () => api.get<{ id: string; name: string }[]>(`/sites/${siteId}/leads/staff`), staleTime: 300_000 });
}

/**
 * Everything that happened to a request or order, oldest first: the customer's messages on one
 * side, the staff's on the other, internal notes marked as such, stage changes and payments in between.
 */
export function Timeline({ siteId, events, stageName, currency }: { siteId: string; events: CaseEvent[]; stageName: (key: string) => string; currency: string }) {
  const t = useL();
  const { formatDate, formatMoney } = usePreferences();
  const { data: staff = [] } = useStaff(siteId);
  const who = (id: string | null) => staff.find((s) => s.id === id)?.name ?? '';
  const delivery = (e: CaseEvent) => {
    const d = e.data.delivery as { sms?: boolean; email?: boolean } | undefined;
    if (!d) return null;
    const parts = [d.sms !== undefined && `${t(L('SMS', 'پیامک'))} ${d.sms ? '✓' : '✗'}`, d.email !== undefined && `${t(L('Email', 'ایمیل'))} ${d.email ? '✓' : '✗'}`].filter(Boolean);
    return <span className="text-[11px] text-ink-soft">{parts.join(' · ')}</span>;
  };
  const money = (e: CaseEvent) => formatMoney(String(e.data.amountMinor ?? '0'), String(e.data.currency ?? currency));

  return (
    <ol className="flex flex-col gap-3">
      {events.map((e) => {
        const time = <time className="text-[11px] text-ink-soft">{formatDate(e.createdAt)}</time>;
        if (e.kind === 'note' || e.kind === 'message' || e.kind === 'customer_message') {
          const mine = e.kind !== 'customer_message';
          return (
            <li key={e.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] rounded-lg border px-3 py-2 text-sm',
                  e.kind === 'note' ? 'border-amber-200 bg-amber-50' : e.kind === 'message' ? 'border-sky-200 bg-sky-50' : 'border-line bg-surface',
                )}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-medium text-ink-soft">
                  {e.kind === 'note' ? `🔒 ${t(L('Internal note', 'یادداشت داخلی'))}` : e.kind === 'message' ? t(L('Message to customer', 'پیام به مشتری')) : t(L('Customer', 'مشتری'))}
                  {who(e.actorUserId) && <span>· {who(e.actorUserId)}</span>}
                </div>
                <p className="whitespace-pre-wrap text-ink">{e.body}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {time}
                  {delivery(e)}
                </div>
              </div>
            </li>
          );
        }
        let text: React.ReactNode = e.kind;
        if (e.kind === 'created') text = <>{t(L('Received', 'ثبت شد'))} — {stageName(String(e.data.stage ?? ''))}</>;
        else if (e.kind === 'stage')
          text = (
            <>
              {e.data.byCustomer ? t(L('Cancelled by the customer', 'لغو توسط مشتری')) : e.data.afterPayment ? t(L('Moved after payment', 'انتقال خودکار پس از پرداخت')) : t(L('Stage changed', 'تغییر مرحله'))}:{' '}
              <span className="text-ink-soft">{stageName(String(e.data.from ?? ''))}</span> → <strong>{stageName(String(e.data.to ?? ''))}</strong>
            </>
          );
        else if (e.kind === 'payment_requested')
          text = e.data.withdrawn ? t(L('Payment request withdrawn', 'درخواست پرداخت لغو شد')) : <>💳 {t(L('Payment requested', 'درخواست پرداخت'))}: <strong>{money(e)}</strong> {e.body && `— ${e.body}`}</>;
        else if (e.kind === 'payment')
          text = e.data.ok ? (
            <span className="text-emerald-700">✓ {t(L('Paid', 'پرداخت موفق'))}: {money(e)} {e.data.refId ? `(${t(L('ref', 'کد پیگیری'))} ${String(e.data.refId)})` : ''} {e.data.test ? t(L('— test', '— آزمایشی')) : ''}</span>
          ) : (
            <span className="text-danger">✗ {t(L('Payment failed', 'پرداخت ناموفق'))}: {money(e)}</span>
          );
        else if (e.kind === 'assigned') text = <>{t(L('Assigned to', 'ارجاع به'))} {who(String(e.data.to ?? '')) || '—'}</>;
        else if (e.kind === 'assigned_item') {
          const title = e.data.title as { en?: string; fa?: string } | null;
          text = <>{t(L('Handled by', 'انجام‌دهنده'))}: {title ? title.fa || title.en : '—'}</>;
        }
        return (
          <li key={e.id} className="flex flex-col items-center gap-1 text-center text-xs text-ink">
            <span className="rounded-full bg-surface-2 px-3 py-1">
              {text}
              {who(e.actorUserId) && <span className="text-ink-soft"> · {who(e.actorUserId)}</span>}
            </span>
            {e.body && e.kind === 'stage' && <p className="max-w-[85%] whitespace-pre-wrap rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-start text-sm">{e.body}</p>}
            <span className="flex items-center gap-2">
              {time}
              {delivery(e)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Writes a message to the customer (sent by SMS / email too) or a note only the staff see. */
export function Composer({ onSend, pending, canMessage = true }: { onSend: (kind: 'message' | 'note', text: string) => Promise<unknown>; pending: boolean; canMessage?: boolean }) {
  const t = useL();
  const [kind, setKind] = useState<'message' | 'note'>(canMessage ? 'message' : 'note');
  const [text, setText] = useState('');
  return (
    <div className={cn('rounded-lg border p-3', kind === 'note' ? 'border-amber-200 bg-amber-50/50' : 'border-line bg-surface')}>
      <div role="tablist" className="mb-2 flex gap-1 text-xs">
        {canMessage && (
          <button type="button" role="tab" aria-selected={kind === 'message'} onClick={() => setKind('message')} className={cn('rounded-full px-3 py-1', kind === 'message' ? 'bg-ink text-bg' : 'text-ink-soft hover:text-ink')}>
            {t(L('Message to customer', 'پیام به مشتری'))}
          </button>
        )}
        <button type="button" role="tab" aria-selected={kind === 'note'} onClick={() => setKind('note')} className={cn('rounded-full px-3 py-1', kind === 'note' ? 'bg-ink text-bg' : 'text-ink-soft hover:text-ink')}>
          🔒 {t(L('Internal note', 'یادداشت داخلی'))}
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        aria-label={kind === 'note' ? t(L('Internal note', 'یادداشت داخلی')) : t(L('Message to customer', 'پیام به مشتری'))}
        placeholder={kind === 'note' ? t(L('Only staff see this.', 'فقط کارکنان می‌بینند.')) : t(L('Shown on the customer’s page and sent by SMS / email.', 'در صفحه‌ی مشتری نمایش داده و با پیامک / ایمیل ارسال می‌شود.'))}
        className="w-full resize-y rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
      />
      <div className="mt-2 flex justify-end">
        <Button
          size="sm"
          disabled={!text.trim() || pending}
          onClick={async () => {
            await onSend(kind, text.trim());
            setText('');
          }}
        >
          {kind === 'note' ? t(L('Add note', 'افزودن یادداشت')) : t(L('Send', 'ارسال'))}
        </Button>
      </div>
    </div>
  );
}
