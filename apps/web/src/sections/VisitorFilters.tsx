import { AVAILABLE_FILTER, currencyDecimals, type CollectionField, type CollectionFilter, type PublicCollection, type VisitorFilter } from '@site-builder/shared';
import { useEffect, useState } from 'react';
import { FilterChips } from '../components/ui/Field';
import { DatePickerButton, MonthCalendar } from '../components/ui/Calendar';
import { formatDay } from '../lib/calendar';
import { useCollectionItems, useFieldRange, useItemDays } from '../features/collections/data';
import { useSiteCalendar, useSiteSettings } from '../features/public-site/data';
import { usePreferences } from '../lib/preferences';

/**
 * One filter a visitor uses on a list: search, choices, a range, a slider, preset ranges, dates
 * or an "only…" switch. It turns the visitor's choice into list conditions (`value`) that the
 * server applies with the section's own filters.
 */

type Conditions = CollectionFilter[];
const cond = (field: string, op: CollectionFilter['op'], value: string): CollectionFilter => ({ field, op, value, valueFrom: 'static' });

/** Choices for a field: its options, the referenced items, yes/no, or the shop's categories. */
function useChoices(collection: PublicCollection | undefined, def: CollectionField | undefined) {
  const p = usePreferences();
  const { data: settings } = useSiteSettings();
  const refs = useCollectionItems(def?.reference ?? '', { filters: [], choices: {}, q: '', sort: 'title', dir: 'asc', page: 1, pageSize: 60 }, def?.type === 'reference');
  if (!def) return [];
  if (collection?.slug === 'products' && def.key === 'category') return (settings?.productCategories ?? []).map((c) => ({ value: c.slug, label: p.l(c.label) }));
  if (def.type === 'select' || def.type === 'multiselect') return def.options.map((o) => ({ value: o.value, label: p.l(o.label) || o.value }));
  if (def.type === 'boolean') return [{ value: 'true', label: p.m.collections.yes }, { value: 'false', label: p.m.collections.no }];
  if (def.type === 'reference') return (refs.data?.data ?? []).map((i) => ({ value: i.id, label: p.l(i.title) }));
  return [];
}

/** A value typed by the visitor, applied after a short pause (not on every key). */
function useDebounced<T>(value: T, onSettle: (v: T) => void, ms = 450) {
  useEffect(() => {
    const id = setTimeout(() => onSettle(value), ms);
    return () => clearTimeout(id);
    // onSettle changes on every render of the parent; the value is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
}

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

export function VisitorFilterControl({
  source,
  collection,
  filter,
  value,
  onChange,
}: {
  source: string;
  collection: PublicCollection | undefined;
  filter: VisitorFilter;
  value: Conditions;
  onChange: (v: Conditions) => void;
}) {
  const p = usePreferences();
  const key = filter.field;
  const def = collection?.fields.find((f) => f.key === key);
  const isDate = def?.type === 'date' || def?.type === 'datetime';
  const isPrice = def?.type === 'price';
  const decimals = currencyDecimals(collection?.commerce.currency ?? 'IRR');
  // Prices are stored in the smallest unit; visitors type and see the normal unit.
  const toShown = (n: number) => (isPrice ? n / 10 ** decimals : n);
  const toStored = (n: number) => (isPrice ? Math.round(n * 10 ** decimals) : n);
  const choices = useChoices(collection, def);
  const label = p.l(filter.label) || (key === AVAILABLE_FILTER ? p.m.collections.available : key === 'title' ? p.m.collections.search : p.l(def?.label) || key);
  const current = (op: CollectionFilter['op']) => value.find((c) => c.op === op)?.value ?? '';
  const cal = useSiteCalendar();
  const box = 'rounded-full border border-line bg-bg px-4 py-2 text-sm text-ink';

  switch (filter.display) {
    case 'search':
      return <SearchFilter label={label} initial={current('contains')} onSettle={(v) => onChange(v ? [cond(key, 'contains', v)] : [])} />;

    case 'toggle': {
      const on = !!value.length;
      return (
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked ? [cond(key, 'eq', 'true')] : [])} className="size-4 accent-current" />
          {label}
        </label>
      );
    }

    case 'select':
      if (!choices.length) return null;
      return (
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          {label}
          <select value={current('eq')} onChange={(e) => onChange(e.target.value ? [cond(key, 'eq', e.target.value)] : [])} className={box}>
            <option value="">{p.m.collections.all}</option>
            {choices.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      );

    case 'checkboxes': {
      if (!choices.length) return null;
      const picked: string[] = (() => {
        try {
          return JSON.parse(current('in') || '[]');
        } catch {
          return [];
        }
      })();
      const toggle = (v: string, on: boolean) => {
        const next = on ? [...picked, v] : picked.filter((x) => x !== v);
        onChange(next.length ? [cond(key, 'in', JSON.stringify(next))] : []);
      };
      return (
        <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <legend className="mb-2 text-ink-soft">{label}</legend>
          {choices.map((c) => (
            <label key={c.value} className="flex cursor-pointer items-center gap-2 text-ink">
              <input type="checkbox" checked={picked.includes(c.value)} onChange={(e) => toggle(c.value, e.target.checked)} className="size-4" />
              {c.label}
            </label>
          ))}
        </fieldset>
      );
    }

    case 'range':
      return (
        <RangeFilter
          label={label}
          type={isDate ? 'date' : 'number'}
          initial={{ min: current('gte'), max: current('lte') }}
          shown={(v) => (isDate || v === '' ? v : String(toShown(Number(v))))}
          stored={(v) => (isDate || v === '' ? v : String(toStored(Number(v))))}
          onSettle={(min, max) => onChange([...(min ? [cond(key, 'gte', min)] : []), ...(max ? [cond(key, 'lte', isDate && def?.type === 'datetime' ? `${max}T23:59` : max)] : [])])}
        />
      );

    case 'dateRange': {
      const end = (d: string) => (def?.type === 'datetime' ? `${d}T23:59` : d);
      const from = current('gte').slice(0, 10);
      const to = current('lte').slice(0, 10);
      const set = (a: string, b: string) => onChange([...(a ? [cond(key, 'gte', a)] : []), ...(b ? [cond(key, 'lte', end(b))] : [])]);
      return (
        <fieldset className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          <legend className="mb-2">{label}</legend>
          {p.m.collections.from}
          <DatePickerButton cal={cal} locale={p.locale} value={from} onChange={(v) => set(v, to)} placeholder="—" />
          {p.m.collections.to}
          <DatePickerButton cal={cal} locale={p.locale} value={to} onChange={(v) => set(from, v)} placeholder="—" />
        </fieldset>
      );
    }

    case 'calendar':
      return <CalendarFilter source={source} field={key} datetime={def?.type === 'datetime'} label={label} value={value} onChange={onChange} popup={filter.calendarMode === 'popup'} />;

    case 'slider':
      return <SliderFilter source={source} field={key} filter={filter} label={label} value={value} onChange={onChange} format={(n) => (isPrice ? p.formatMoney(n, collection?.commerce.currency ?? 'IRR') : new Intl.NumberFormat(p.locale === 'fa' ? 'fa-IR' : 'en-US').format(n))} />;

    case 'presets': {
      const active = filter.presets.findIndex((r) => String(r.min ?? '') === current('gte') && String(r.max ?? '') === current('lte'));
      return (
        <FilterChips
          label={label}
          value={active < 0 ? 'all' : String(active)}
          onChange={(v) => {
            const r = filter.presets[Number(v)];
            onChange(v === 'all' || !r ? [] : [...(r.min !== null ? [cond(key, 'gte', String(r.min))] : []), ...(r.max !== null ? [cond(key, 'lte', String(r.max))] : [])]);
          }}
          options={[{ value: 'all', label: p.m.collections.all }, ...filter.presets.map((r, i) => ({ value: String(i), label: p.l(r.label) || `${r.min ?? ''}–${r.max ?? ''}` }))]}
        />
      );
    }

    case 'datePresets': {
      const end = (d: string) => (def?.type === 'datetime' ? `${d}T23:59` : d);
      const now = new Date();
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
      const options: Record<string, Conditions> = {
        upcoming: [cond(key, 'future', 'x')],
        thisWeek: [cond(key, 'gte', today()), cond(key, 'lte', end(addDays(7)))],
        thisMonth: [cond(key, 'gte', today()), cond(key, 'lte', end(monthEnd))],
        next30: [cond(key, 'gte', today()), cond(key, 'lte', end(addDays(30)))],
        past: [cond(key, 'past', 'x')],
      };
      const active = Object.entries(options).find(([, c]) => JSON.stringify(c) === JSON.stringify(value))?.[0] ?? 'all';
      return (
        <FilterChips
          label={label}
          value={active}
          onChange={(v) => onChange(options[v] ?? [])}
          options={[{ value: 'all', label: p.m.collections.all }, ...(['upcoming', 'thisWeek', 'thisMonth', 'next30', 'past'] as const).map((k) => ({ value: k, label: p.m.collections[k] }))]}
        />
      );
    }

    case 'chips':
    default:
      if (!choices.length) return null;
      return <FilterChips label={label} value={current('eq') || 'all'} onChange={(v) => onChange(v === 'all' ? [] : [cond(key, 'eq', v)])} options={[{ value: 'all', label: p.m.collections.all }, ...choices]} />;
  }
}

/**
 * A month calendar: days with items are marked; one click picks a day, a second click a range
 * (clicking the chosen day again clears it).
 */
function CalendarFilter({
  source,
  field,
  datetime,
  label,
  value,
  onChange,
  popup,
}: {
  source: string;
  field: string;
  datetime: boolean;
  label: string;
  value: Conditions;
  onChange: (v: Conditions) => void;
  /** Shown in a window opened by a button, rather than always on the page. */
  popup: boolean;
}) {
  const p = usePreferences();
  const [open, setOpen] = useState(false);
  const cal = useSiteCalendar();
  const [view, setView] = useState({ first: '', last: '' });
  const days = useItemDays(source, field, view.first, view.last);
  const from = value.find((c) => c.op === 'gte')?.value.slice(0, 10) ?? '';
  const to = value.find((c) => c.op === 'lte')?.value.slice(0, 10) ?? '';
  // While only the start is picked, the range is that one day; the next click sets its end.
  const [picking, setPicking] = useState(false);
  const apply = (a: string, b: string) => onChange([cond(field, 'gte', a), cond(field, 'lte', datetime ? `${b}T23:59` : b)]);
  const calendar = (
    <MonthCalendar
      cal={cal}
      locale={p.locale}
      from={from || undefined}
      to={to || undefined}
      marked={new Set(days.data ?? [])}
      onMonth={(first, last) => setView({ first, last })}
      onPick={(iso) => {
        if (from && from === to && iso === from && !picking) {
          onChange([]);
          return;
        }
        if (picking && from) {
          const [a, b] = iso < from ? [iso, from] : [from, iso];
          apply(a, b);
          setPicking(false);
          if (popup) setOpen(false);
        } else {
          apply(iso, iso);
          setPicking(true);
        }
      }}
    />
  );
  if (!popup)
    return (
      <fieldset className="flex flex-col gap-2 text-sm text-ink-soft">
        <legend className="mb-1">{label}</legend>
        {calendar}
      </fieldset>
    );
  const chosen = from ? (from === to ? formatDay(from, p.locale, cal) : `${formatDay(from, p.locale, cal)} – ${formatDay(to, p.locale, cal)}`) : '';
  return (
    <div className="flex flex-col gap-1 text-sm text-ink-soft">
      <span>{label}</span>
      <span className="flex items-center gap-1">
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={`rounded-full border border-line bg-bg px-4 py-2 text-start ${chosen ? 'text-ink' : ''}`}>
          {chosen || p.m.collections.pickDate}
        </button>
        {chosen && (
          <button type="button" aria-label={p.m.collections.clear} onClick={() => onChange([])} className="px-1 text-xs hover:text-ink">
            ✕
          </button>
        )}
      </span>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
          <div className="flex flex-col gap-3 rounded-xl bg-bg p-4 shadow-xl">
            <div className="flex items-center justify-between gap-6 text-ink">
              <span className="font-medium">{label}</span>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-ink-soft hover:text-ink">
                {p.m.collections.done}
              </button>
            </div>
            {calendar}
            <p className="max-w-72 text-xs text-ink-soft">{p.m.collections.calendarHint}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function SearchFilter({ label, initial, onSettle }: { label: string; initial: string; onSettle: (v: string) => void }) {
  const [text, setText] = useState(initial);
  useDebounced(text.trim(), onSettle);
  return (
    <label className="flex flex-col gap-1 text-sm text-ink-soft sm:max-w-xs">
      {label}
      <input type="search" value={text} onChange={(e) => setText(e.target.value)} className="rounded-full border border-line bg-bg px-4 py-2 text-ink" />
    </label>
  );
}

function RangeFilter({
  label,
  type,
  initial,
  shown,
  stored,
  onSettle,
}: {
  label: string;
  type: 'number' | 'date';
  initial: { min: string; max: string };
  shown: (v: string) => string;
  stored: (v: string) => string;
  onSettle: (min: string, max: string) => void;
}) {
  const p = usePreferences();
  const [min, setMin] = useState(shown(initial.min));
  const [max, setMax] = useState(shown(initial.max));
  useDebounced(`${min}|${max}`, () => onSettle(stored(min), stored(max)));
  const input = 'w-36 rounded-full border border-line bg-bg px-4 py-2 text-ink';
  return (
    <fieldset className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
      <legend className="mb-2">{label}</legend>
      <label className="flex items-center gap-2">
        {p.m.collections.from}
        <input type={type} dir="ltr" inputMode={type === 'number' ? 'decimal' : undefined} value={min} onChange={(e) => setMin(e.target.value)} className={input} />
      </label>
      <label className="flex items-center gap-2">
        {p.m.collections.to}
        <input type={type} dir="ltr" inputMode={type === 'number' ? 'decimal' : undefined} value={max} onChange={(e) => setMax(e.target.value)} className={input} />
      </label>
    </fieldset>
  );
}

/** Two handles on one track: the lowest and highest value to show. */
function SliderFilter({
  source,
  field,
  filter,
  label,
  value,
  onChange,
  format,
}: {
  source: string;
  field: string;
  filter: VisitorFilter;
  label: string;
  value: Conditions;
  onChange: (v: Conditions) => void;
  /** Value as visitors read it (prices with their unit). */
  format: (n: number) => string;
}) {
  const range = useFieldRange(source, field, filter.min === null || filter.max === null);
  const lo = filter.min ?? (typeof range.data?.min === 'number' ? range.data.min : 0);
  const hi = filter.max ?? (typeof range.data?.max === 'number' ? range.data.max : 0);
  const step = filter.step ?? Math.max(1, Math.round((hi - lo) / 100));
  const fromValue = (op: 'gte' | 'lte', fallback: number) => {
    const v = Number(value.find((c) => c.op === op)?.value);
    return Number.isFinite(v) && value.some((c) => c.op === op) ? v : fallback;
  };
  const [a, setA] = useState(fromValue('gte', lo));
  const [b, setB] = useState(fromValue('lte', hi));
  // Bounds arrive after the first render: start at the full range.
  useEffect(() => {
    if (!value.length) {
      setA(lo);
      setB(hi);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lo, hi]);
  useDebounced(`${a}|${b}`, () => {
    if (hi <= lo) return;
    const low = Math.min(a, b);
    const high = Math.max(a, b);
    onChange(low <= lo && high >= hi ? [] : [cond(field, 'gte', String(low)), cond(field, 'lte', String(high))]);
  });
  if (hi <= lo) return null;
  const pct = (n: number) => ((n - lo) / (hi - lo)) * 100;
  const thumb =
    'pointer-events-none absolute inset-0 h-1.5 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-ink';
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  return (
    <fieldset className="flex w-full max-w-sm flex-col gap-3 text-sm text-ink-soft">
      <legend className="mb-1">{label}</legend>
      <div dir="ltr" className="relative h-1.5 rounded-full bg-line">
        <div className="absolute h-1.5 rounded-full bg-ink" style={{ left: `${pct(low)}%`, right: `${100 - pct(high)}%` }} />
        <input type="range" aria-label={`${label} min`} min={lo} max={hi} step={step} value={a} onChange={(e) => setA(Number(e.target.value))} className={thumb} />
        <input type="range" aria-label={`${label} max`} min={lo} max={hi} step={step} value={b} onChange={(e) => setB(Number(e.target.value))} className={thumb} />
      </div>
      <div className="flex justify-between text-ink">
        <span>{format(low)}</span>
        <span>{format(high)}</span>
      </div>
    </fieldset>
  );
}
