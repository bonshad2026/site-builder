import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../components/ui/Button';
import { ApiError } from '../lib/api';
import { cn } from '../lib/cn';
import type { Localized } from '../types/site';
import { useT } from './i18n';

/* ---------- layout ---------- */

export function PageTitle({ title, actions, subtitle }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl text-ink sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

export function Card({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <section className={cn('border border-line bg-surface p-5 sm:p-6', className)}>
      {title && <h2 className="mb-4 text-sm font-medium tracking-wide text-ink-soft uppercase rtl:normal-case">{title}</h2>}
      {children}
    </section>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent' }) {
  const tones = {
    neutral: 'bg-surface-2 text-ink-soft',
    good: 'bg-emerald-100 text-emerald-900',
    warn: 'bg-amber-100 text-amber-900',
    bad: 'bg-red-100 text-red-900',
    accent: 'bg-accent-soft text-ink',
  };
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', tones[tone])}>{children}</span>;
}

export function Spinner({ label }: { label?: string }) {
  const t = useT();
  return (
    <div role="status" className="flex items-center gap-3 py-10 text-sm text-ink-soft">
      <span aria-hidden="true" className="size-4 animate-spin rounded-full border border-current border-t-transparent" />
      {label ?? t.loading}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  const t = useT();
  if (!error) return null;
  const message = error instanceof ApiError ? error.message : t.error;
  const details = error instanceof ApiError ? error.details : undefined;
  return (
    <div role="alert" className="border-s-2 border-danger bg-surface px-4 py-3 text-sm text-danger">
      {message}
      {details?.length ? (
        <ul className="mt-1 list-disc ps-5">
          {details.slice(0, 5).map((d, i) => (
            <li key={i}>
              {d.path && <code className="me-1">{d.path}</code>}
              {d.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function Empty({ text }: { text?: string }) {
  const t = useT();
  return <p className="border border-dashed border-line px-6 py-12 text-center text-sm text-ink-soft">{text ?? t.none}</p>;
}

/* ---------- form controls ---------- */

const inputCls =
  'w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-ink-soft/50 focus:border-accent focus:outline-none aria-[invalid=true]:border-danger disabled:opacity-60';

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-xs font-medium text-ink-soft">
        {label}
      </label>
      {children(id)}
      {hint && !error && <p className="text-xs text-ink-soft/80">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  type = 'text',
  hint,
  error,
  dir,
  multiline,
  rows = 3,
  placeholder,
  required,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
  error?: string;
  dir?: 'ltr' | 'rtl';
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id) =>
        multiline ? (
          <textarea id={id} dir={dir} rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, 'resize-y')} aria-invalid={!!error} />
        ) : (
          <input id={id} type={type} dir={dir} value={value} placeholder={placeholder} required={required} onChange={(e) => onChange(e.target.value)} className={inputCls} aria-invalid={!!error} />
        )
      }
    </Field>
  );
}

export function NumberField({ label, value, onChange, hint, min, className }: { label: string; value: number | null; onChange: (v: number | null) => void; hint?: string; min?: number; className?: string }) {
  return (
    <Field label={label} hint={hint} className={className}>
      {(id) => (
        <input
          id={id}
          type="number"
          dir="ltr"
          min={min}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className={inputCls}
        />
      )}
    </Field>
  );
}

export function SelectField<T extends string>({ label, value, onChange, options, className }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
  return (
    <Field label={label} className={className}>
      {(id) => (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} className={inputCls}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function Checkbox({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-(--accent)" />
      <span>
        {label}
        {hint && <span className="block text-xs text-ink-soft">{hint}</span>}
      </span>
    </label>
  );
}

/** Edits one bilingual value: English and Persian side by side (stacked on phones). */
export function LocalizedField({
  label,
  value,
  onChange,
  multiline,
  rows,
  error,
}: {
  label: string;
  value: Localized | undefined;
  onChange: (v: Localized) => void;
  multiline?: boolean;
  rows?: number;
  error?: string;
}) {
  const t = useT();
  const v = value ?? { en: '', fa: '' };
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-xs font-medium text-ink-soft">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <TextField label={t.english} value={v.en} onChange={(en) => onChange({ ...v, en })} multiline={multiline} rows={rows} dir="ltr" />
        <TextField label={t.persian} value={v.fa} onChange={(fa) => onChange({ ...v, fa })} multiline={multiline} rows={rows} dir="rtl" />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </fieldset>
  );
}

/** Reorderable list editor with add / remove / move up / move down (keyboard friendly). */
export function ListEditor<T>({
  label,
  items,
  onChange,
  create,
  render,
  max = 50,
}: {
  label: string;
  items: T[];
  onChange: (items: T[]) => void;
  create: () => T;
  render: (item: T, update: (item: T) => void, index: number) => ReactNode;
  max?: number;
}) {
  const t = useT();
  const move = (i: number, d: number) => {
    const next = [...items];
    const [item] = next.splice(i, 1);
    next.splice(i + d, 0, item);
    onChange(next);
  };
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-xs font-medium text-ink-soft">{label}</legend>
      {items.map((item, i) => (
        <div key={i} className="rounded-md border border-line bg-bg p-3">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs text-ink-soft">
            <span>#{i + 1}</span>
            <div className="flex gap-1">
              <IconButton label={t.moveUp} disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </IconButton>
              <IconButton label={t.moveDown} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                ↓
              </IconButton>
              <IconButton label={t.delete} onClick={() => onChange(items.filter((_, j) => j !== i))}>
                ✕
              </IconButton>
            </div>
          </div>
          <div className="flex flex-col gap-3">{render(item, (next) => onChange(items.map((x, j) => (j === i ? next : x))), i)}</div>
        </div>
      ))}
      {items.length < max && (
        <button type="button" onClick={() => onChange([...items, create()])} className="self-start rounded-md border border-dashed border-line px-3 py-1.5 text-sm text-ink-soft hover:border-ink hover:text-ink">
          + {t.add}
        </button>
      )}
    </fieldset>
  );
}

export function IconButton({ label, onClick, children, disabled, className }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn('inline-flex size-7 items-center justify-center rounded-md text-ink-soft hover:bg-surface-2 hover:text-ink disabled:opacity-30', className)}
    >
      {children}
    </button>
  );
}

/* ---------- dialogs & toasts ---------- */

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-10" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={cn('w-full bg-bg p-6 shadow-xl', wide ? 'max-w-4xl' : 'max-w-lg')}>
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="font-display text-2xl text-ink">{title}</h2>
          <IconButton label={t.close} onClick={onClose}>
            ✕
          </IconButton>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

interface Toast {
  id: number;
  text: string;
  tone: 'good' | 'bad';
}
const ToastContext = createContext<(text: string, tone?: 'good' | 'bad') => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: 'good' | 'bad' = 'good') => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { id, text, tone }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} role="status" className={cn('pointer-events-auto rounded-md px-4 py-2.5 text-sm shadow-lg', t.tone === 'good' ? 'bg-ink text-bg' : 'bg-danger text-white')}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function ConfirmButton({ label, confirmText, onConfirm, variant = 'outline', disabled }: { label: string; confirmText: string; onConfirm: () => void; variant?: 'outline' | 'ghost'; disabled?: boolean }) {
  return (
    <Button
      variant={variant}
      size="sm"
      disabled={disabled}
      onClick={() => {
        if (window.confirm(confirmText)) onConfirm();
      }}
    >
      {label}
    </Button>
  );
}

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  const t = useT();
  if (totalPages <= 1) return null;
  return (
    <div className="mt-6 flex items-center justify-end gap-3 text-sm">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        {t.previous}
      </Button>
      <span className="text-ink-soft">
        {page} / {totalPages}
      </span>
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        {t.next}
      </Button>
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto border border-line bg-surface">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-line text-start text-xs text-ink-soft">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-3 text-start font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export const Td = ({ children, className }: { children: ReactNode; className?: string }) => <td className={cn('px-4 py-3 align-middle text-ink', className)}>{children}</td>;
