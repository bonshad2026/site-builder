import { currencyDecimals } from '@site-builder/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en, type Messages } from '../locales/en';
import { fa } from '../locales/fa';
import type { Locale, Localized, ThemeId } from '../types/site';

const messages: Record<Locale, Messages> = { en, fa };
const THEME_KEY = 'site-builder:theme';
const CURRENCY_FA: Record<string, string> = { IRR: 'ریال', IRT: 'تومان', USD: 'دلار', EUR: 'یورو', GBP: 'پوند', AED: 'درهم', TRY: 'لیر', IQD: 'دینار', AFN: 'افغانی' };
const CURRENCY_EN: Record<string, string> = { IRT: 'Toman', USD: '$', EUR: '€', GBP: '£' };

/** The URL decides the language: /fa/... is Persian, everything else English. */
export function localeFromPath(pathname: string): Locale {
  return pathname === '/fa' || pathname.startsWith('/fa/') ? 'fa' : 'en';
}

export function stripLocale(pathname: string): string {
  return pathname.replace(/^\/fa(?=\/|$)/, '') || '/';
}

export const basenameFor = (locale: Locale) => (locale === 'fa' ? '/fa' : undefined);

interface PreferencesContextValue {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  /** Visitor's theme choice; null means "use the site's theme". */
  theme: ThemeId | null;
  m: Messages;
  /** Picks the current locale's value, falling back to the other language when empty. */
  l: (value: Localized | Partial<Localized> | undefined) => string;
  formatNumber: (value: number) => string;
  formatMoney: (minor: string | number | null, currency: string) => string;
  formatDate: (iso: string) => string;
  format: (template: string, vars: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: ThemeId | null) => void;
}

/** Exported so a site can give its own wording for built-in texts (see SiteTexts). */
export const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function storedTheme(): ThemeId | null {
  try {
    // Any theme id; one the site no longer has falls back to the site's theme (useEffectiveTheme).
    const v = localStorage.getItem(THEME_KEY);
    return v && /^[a-z0-9][a-z0-9_-]{1,39}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function PreferencesProvider({
  children,
  locale,
  onLocaleChange,
}: {
  children: ReactNode;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  const [theme, setThemeState] = useState<ThemeId | null>(storedTheme);
  const dir = locale === 'fa' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  const setTheme = useCallback((next: ThemeId | null) => {
    setThemeState(next);
    try {
      if (next) localStorage.setItem(THEME_KEY, next);
      else localStorage.removeItem(THEME_KEY);
    } catch {
      // Storage may be unavailable; the choice still applies for this visit.
    }
  }, []);

  const value = useMemo<PreferencesContextValue>(() => {
    const tag = locale === 'fa' ? 'fa-IR' : 'en-US';
    const plain = new Intl.NumberFormat(tag, { useGrouping: false });
    const grouped = new Intl.NumberFormat(tag);
    const date = new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeStyle: 'short' });
    return {
      locale,
      dir,
      theme,
      m: messages[locale],
      l: (v) => (v ? v[locale] || v[locale === 'fa' ? 'en' : 'fa'] || '' : ''),
      formatNumber: (n) => plain.format(n),
      formatMoney: (minor, currency) => {
        if (minor === null || minor === '') return '—';
        const decimals = currencyDecimals(currency);
        const value = Number(minor) / 10 ** decimals;
        const amount = decimals ? new Intl.NumberFormat(tag, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value) : grouped.format(value);
        if (locale === 'fa') return `${amount} ${CURRENCY_FA[currency] ?? currency}`;
        const sign = CURRENCY_EN[currency];
        return sign && sign.length === 1 ? `${sign}${amount}` : `${amount} ${sign ?? currency}`;
      },
      formatDate: (iso) => date.format(new Date(iso)),
      format: (template, vars) =>
        template.replace(/\{(\w+)\}/g, (_, key: string) => {
          const v = vars[key];
          return typeof v === 'number' ? plain.format(v) : String(v ?? '');
        }),
      setLocale: onLocaleChange,
      setTheme,
    };
  }, [locale, dir, theme, onLocaleChange, setTheme]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used inside PreferencesProvider');
  return ctx;
}
