import { useSiteSettings } from '../../features/public-site/data';
import { cn } from '../../lib/cn';
import { usePreferences } from '../../lib/preferences';
import type { Locale, ThemeId } from '../../types/site';

const THEMES: ThemeId[] = ['ivory', 'noir', 'sage'];
const swatches: Record<ThemeId, [string, string]> = {
  ivory: ['#f6f2ec', '#8a6a43'],
  noir: ['#121110', '#c9a46c'],
  sage: ['#eef0ea', '#4f6446'],
};

/** The theme actually shown: the visitor's choice, else the site's theme. */
export function useEffectiveTheme(): ThemeId {
  const { theme } = usePreferences();
  const { data: settings } = useSiteSettings();
  return theme ?? settings?.themeId ?? 'ivory';
}

export function LanguageSwitch({ className }: { className?: string }) {
  const { locale, setLocale, m } = usePreferences();
  const { data: settings } = useSiteSettings();
  const enabled = Array.isArray(settings?.locales) && settings.locales.length ? settings.locales : null;
  const locales: Locale[] = enabled ? (['en', 'fa'] as Locale[]).filter((l) => enabled.includes(l)) : ['en', 'fa'];
  if (locales.length < 2) return null;
  return (
    <div role="group" aria-label={m.prefs.language} className={cn('flex items-center text-xs font-medium tracking-wider', className)}>
      {locales.map((code, i) => (
        <span key={code} className="flex items-center">
          {i > 0 && (
            <span aria-hidden="true" className="mx-1.5 opacity-40">
              /
            </span>
          )}
          <button
            type="button"
            lang={code}
            aria-pressed={locale === code}
            onClick={() => setLocale(code)}
            className={cn('px-1 py-1 transition-opacity', locale === code ? 'opacity-100' : 'opacity-55 hover:opacity-100')}
          >
            {code === 'en' ? 'EN' : 'فا'}
          </button>
        </span>
      ))}
    </div>
  );
}

export function ThemeSwitch({ className }: { className?: string }) {
  const { setTheme, m } = usePreferences();
  const current = useEffectiveTheme();
  return (
    <div role="radiogroup" aria-label={m.prefs.theme} className={cn('flex items-center gap-1.5', className)}>
      {THEMES.map((id) => {
        const [bg, accent] = swatches[id];
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={current === id}
            aria-label={m.prefs.themes[id]}
            title={m.prefs.themes[id]}
            onClick={() => setTheme(id)}
            className={cn(
              'size-5 rounded-full border transition-transform hover:scale-110',
              current === id ? 'border-current ring-1 ring-current ring-offset-2 ring-offset-transparent' : 'border-current/30',
            )}
            style={{ background: `linear-gradient(135deg, ${bg} 50%, ${accent} 50%)` }}
          />
        );
      })}
    </div>
  );
}
