import { useSiteSettings } from '../../features/public-site/data';
import { usePreferences } from '../../lib/preferences';

/** Main menu from the site settings (edited in the admin panel). */
export function useNavItems() {
  const { data: settings } = useSiteSettings();
  const { l } = usePreferences();
  return (settings?.nav ?? []).map((item) => ({ to: item.href, label: l(item.label) }));
}
