import { useEffect, useRef, useState } from 'react';
import { addMonths, dayNumber, formatDay, fromIso, monthGrid, monthTitle, weekdayNames, type CalendarSystem } from '../../lib/calendar';
import { cn } from '../../lib/cn';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * A month view in the Jalali or Gregorian calendar. Days are ISO dates; `from`/`to` mark the
 * chosen day or range and `marked` the days that have something on them.
 */
export function MonthCalendar({
  cal,
  locale,
  from,
  to,
  marked,
  onPick,
  onMonth,
  className,
}: {
  cal: CalendarSystem;
  locale: 'fa' | 'en';
  from?: string;
  to?: string;
  marked?: Set<string>;
  onPick: (iso: string) => void;
  /** The first and last day of the month on view (to load its marks). */
  onMonth?: (first: string, last: string) => void;
  className?: string;
}) {
  const start = fromIso(from || todayIso(), cal)!;
  const [month, setMonth] = useState({ y: start.y, m: start.m });
  const grid = monthGrid(month.y, month.m, cal);
  const days = grid.flat().filter((d): d is string => !!d);
  useEffect(() => {
    onMonth?.(days[0], days[days.length - 1]);
    // Only when the month changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month.y, month.m, cal]);
  const today = todayIso();
  const low = from && to && to < from ? to : from;
  const high = from && to && to < from ? from : to;
  const rtl = locale === 'fa';
  const go = (n: number) => setMonth((x) => addMonths(x.y, x.m, n));

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className={cn('w-72 select-none rounded-lg border border-line bg-bg p-3 text-sm text-ink', className)}>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label={rtl ? 'ماه قبل' : 'Previous month'} onClick={() => go(-1)} className="size-8 rounded-full hover:bg-surface-2">
          {rtl ? '›' : '‹'}
        </button>
        <span className="font-medium">{monthTitle(month.y, month.m, locale, cal)}</span>
        <button type="button" aria-label={rtl ? 'ماه بعد' : 'Next month'} onClick={() => go(1)} className="size-8 rounded-full hover:bg-surface-2">
          {rtl ? '‹' : '›'}
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-ink-soft">
        {weekdayNames(locale, cal).map((w, i) => (
          <span key={i} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {grid.flat().map((iso, i) => {
          if (!iso) return <span key={i} />;
          const chosen = iso === low || iso === high;
          const inside = !!low && !!high && iso > low && iso < high;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onPick(iso)}
              aria-pressed={chosen}
              aria-label={formatDay(iso, locale, cal)}
              className={cn(
                'relative mx-auto flex size-8 items-center justify-center rounded-full',
                chosen ? 'bg-ink text-bg' : inside ? 'bg-accent-soft' : 'hover:bg-surface-2',
                iso === today && !chosen && 'ring-1 ring-ink/40',
              )}
            >
              {dayNumber(iso, locale, cal)}
              {marked?.has(iso) && <span className={cn('absolute bottom-0.5 size-1 rounded-full', chosen ? 'bg-bg' : 'bg-accent')} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A button showing a date; it opens a month view to pick another. */
export function DatePickerButton({
  cal,
  locale,
  value,
  onChange,
  placeholder,
  className,
}: {
  cal: CalendarSystem;
  locale: 'fa' | 'en';
  value: string;
  onChange: (iso: string) => void;
  placeholder: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <span ref={box} className="relative inline-flex items-center gap-1">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={cn('min-w-32 rounded-full border border-line bg-bg px-4 py-2 text-start text-sm', !value && 'text-ink-soft', className)}>
        {value ? formatDay(value, locale, cal) : placeholder}
      </button>
      {value && (
        <button type="button" aria-label={locale === 'fa' ? 'پاک کردن' : 'Clear'} onClick={() => onChange('')} className="px-1 text-xs text-ink-soft hover:text-ink">
          ✕
        </button>
      )}
      {open && (
        <span className="absolute start-0 top-full z-40 mt-1 shadow-lg">
          <MonthCalendar
            cal={cal}
            locale={locale}
            from={value || undefined}
            onPick={(iso) => {
              onChange(iso);
              setOpen(false);
            }}
          />
        </span>
      )}
    </span>
  );
}
