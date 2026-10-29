import { THEME_COLOR_KEYS, type CustomTheme, type SiteSettings } from '@site-builder/shared';
import { useEffect, useMemo, type ReactNode } from 'react';
import type { Messages } from '../locales/en';
import { PreferencesContext, usePreferences } from './preferences';

/** Weights each selectable Google Font offers (asking for a missing weight fails the request). */
const FONT_WEIGHTS: Record<string, string> = {
  'Cormorant Garamond': '400;500;600;700',
  'Playfair Display': '400;500;600;700',
  Lora: '400;500;600;700',
  'Libre Baskerville': '400;700',
  Inter: '400;500;600;700',
  Roboto: '400;500;700',
  'Open Sans': '400;500;600;700',
  Lato: '400;700',
  Poppins: '400;500;600;700',
  Montserrat: '400;500;600;700',
  'DM Sans': '400;500;600;700',
  'Work Sans': '400;500;600;700',
  Vazirmatn: '300;400;500;600;700',
  'Noto Sans Arabic': '400;500;600;700',
  'Noto Naskh Arabic': '400;500;600;700',
  'Markazi Text': '400;500;600;700',
  Lalezar: '',
  Amiri: '400;700',
  Lateef: '400;700',
};
/** Already loaded by index.html. */
const PRELOADED = new Set(['Cormorant Garamond', 'Inter', 'Vazirmatn']);
const SERIF = new Set(['Cormorant Garamond', 'Playfair Display', 'Lora', 'Libre Baskerville', 'Noto Naskh Arabic', 'Markazi Text', 'Amiri', 'Lateef']);

const stack = (family: string) => `"${family}", ${SERIF.has(family) ? 'Georgia, serif' : 'system-ui, Tahoma, sans-serif'}`;
const cssVar: Record<(typeof THEME_COLOR_KEYS)[number], string> = {
  bg: '--bg',
  surface: '--surface',
  surface2: '--surface-2',
  ink: '--ink',
  inkSoft: '--ink-soft',
  line: '--line',
  accent: '--accent',
  accentInk: '--accent-ink',
  accentSoft: '--accent-soft',
};

/** Whether a colour is dark (for the hero overlay and the danger colour of a custom theme). */
const isDark = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 128;
};

export function themeCss(themes: CustomTheme[]): string {
  return themes
    .map((t) => {
      const vars = THEME_COLOR_KEYS.map((k) => `${cssVar[k]}:${t.colors[k]}`).join(';');
      const dark = isDark(t.colors.bg);
      return `[data-theme="${t.id}"]{${vars};--hero-overlay:${dark ? 'rgba(0,0,0,0.55)' : 'rgba(20,17,13,0.45)'};--danger:${dark ? '#f08a7e' : '#a3261b'}}`;
    })
    .join('\n');
}

function upsert(id: string, make: () => HTMLElement, apply: (el: HTMLElement) => void) {
  let el = document.getElementById(id);
  if (!el) {
    el = make();
    el.id = id;
    document.head.appendChild(el);
  }
  apply(el);
}

/**
 * Applies the site's own themes and fonts to the page: a style block with each custom theme's
 * colours, Google Fonts links for fonts the page does not load already, and the font variables.
 */
export function useSiteDesign(settings: SiteSettings | undefined) {
  const { locale } = usePreferences();
  const design = settings?.design;
  const themes = design?.themes ?? [];
  const fonts = design?.fonts;
  const css = useMemo(() => themeCss(themes), [themes]);

  useEffect(() => {
    upsert('site-themes', () => document.createElement('style'), (el) => (el.textContent = css));
  }, [css]);

  useEffect(() => {
    const root = document.documentElement;
    if (!fonts) return;
    const display = locale === 'fa' ? fonts.faDisplay : fonts.enDisplay;
    const body = locale === 'fa' ? fonts.faBody : fonts.enBody;
    const defaults = locale === 'fa' ? ['Vazirmatn', 'Vazirmatn'] : ['Cormorant Garamond', 'Inter'];
    // Untouched fonts keep the stylesheet's own values.
    if (display === defaults[0] && body === defaults[1]) {
      root.style.removeProperty('--font-display');
      root.style.removeProperty('--font-body');
    } else {
      root.style.setProperty('--font-display', stack(display));
      root.style.setProperty('--font-body', stack(body));
    }
    for (const family of new Set([display, body])) {
      if (PRELOADED.has(family)) continue;
      const weights = FONT_WEIGHTS[family] ?? '';
      const href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}${weights ? `:wght@${weights}` : ''}&display=swap`;
      const id = `font-${family.replace(/\W+/g, '-').toLowerCase()}`;
      upsert(
        id,
        () => Object.assign(document.createElement('link'), { rel: 'stylesheet' }),
        (el) => ((el as HTMLLinkElement).href = href),
      );
    }
  }, [fonts, locale]);
}

/* ---------- texts ---------- */

/** Every built-in text with its key ("common.viewAll"), for the texts editor. */
export function flattenMessages(m: unknown, prefix = ''): [string, string][] {
  if (typeof m === 'string') return [[prefix, m]];
  if (Array.isArray(m)) return m.flatMap((v, i) => flattenMessages(v, `${prefix}.${i}`));
  if (m && typeof m === 'object') return Object.entries(m).flatMap(([k, v]) => flattenMessages(v, prefix ? `${prefix}.${k}` : k));
  return [];
}

/** The built-in texts with the site's own wording put in where it has some for this language. */
export function applyTexts(m: Messages, texts: SiteSettings['texts'] | undefined, locale: 'en' | 'fa'): Messages {
  const entries = Object.entries(texts ?? {}).filter(([, v]) => v?.[locale]?.trim());
  if (!entries.length) return m;
  const out = structuredClone(m) as unknown as Record<string, unknown>;
  for (const [key, value] of entries) {
    const path = key.split('.');
    let node: Record<string, unknown> | undefined = out;
    for (const part of path.slice(0, -1)) node = node?.[part] as Record<string, unknown> | undefined;
    const last = path[path.length - 1];
    if (node && typeof node[last] === 'string') node[last] = value[locale];
  }
  return out as unknown as Messages;
}

/** Gives everything inside the site's own wording for built-in texts (buttons, labels, messages…). */
export function SiteTexts({ settings, children }: { settings: SiteSettings | undefined; children: ReactNode }) {
  const prefs = usePreferences();
  const m = useMemo(() => applyTexts(prefs.m, settings?.texts, prefs.locale), [prefs.m, settings?.texts, prefs.locale]);
  const value = useMemo(() => ({ ...prefs, m }), [prefs, m]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
