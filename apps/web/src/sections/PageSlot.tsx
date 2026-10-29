import type { SiteSettings } from '@site-builder/shared';
import { usePublishedPage, useSiteSettings } from '../features/public-site/data';
import { PageSections } from './SectionRenderer';

function PublishedSections({ slug }: { slug: string }) {
  const { data: page } = usePublishedPage(slug);
  return page ? <PageSections document={page.document} /> : null;
}

/** The sections of a published builder page (by slug), or nothing when there is none. */
export function PageSlot({ slug }: { slug?: string }) {
  return slug ? <PublishedSections slug={slug} /> : null;
}

type SystemPages = SiteSettings['systemPages'];

/** A built-in page's options from the settings (builder pages above and below it, layout choices). */
export function useSystemPage<K extends keyof SystemPages>(key: K): Partial<SystemPages[K]> {
  const { data: settings } = useSiteSettings();
  return settings?.systemPages?.[key] ?? {};
}
