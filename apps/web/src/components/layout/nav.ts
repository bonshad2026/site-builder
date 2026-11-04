import { useSiteSettings } from '../../features/public-site/data';
import { usePreferences } from '../../lib/preferences';

export type NavItem = { to: string; label: string; children: { to: string; label: string }[] };

/** Main menu from the site settings (edited in the admin panel); `to` is empty for a heading-only item. */
export function useNavItems(): NavItem[] {
  const { data: settings } = useSiteSettings();
  const { l } = usePreferences();
  return (settings?.nav ?? []).map((item) => ({
    to: item.href,
    label: l(item.label),
    children: (item.children ?? []).map((c) => ({ to: c.href, label: l(c.label) })),
  }));
}
