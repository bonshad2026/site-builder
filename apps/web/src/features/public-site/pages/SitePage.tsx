import { useParams } from 'react-router';
import { usePageMeta } from '../../../hooks/usePageMeta';
import { usePreferences } from '../../../lib/preferences';
import { PageSections } from '../../../sections/SectionRenderer';
import { isNotFound, usePublishedPage, useSiteSettings } from '../data';
import { NotFoundPage } from './NotFoundPage';

/** Any page built in the page builder: `/` is the home page, `/:slug` the rest. Only published content is shown. */
export function SitePage({ home = false }: { home?: boolean }) {
  const { slug = 'home' } = useParams();
  const pageSlug = home ? 'home' : slug;
  const { l } = usePreferences();
  const { data: page, error, isLoading } = usePublishedPage(pageSlug);
  const { data: settings } = useSiteSettings();

  const faq = page?.document.sections.find((s) => s.type === 'faq' && !s.hidden);
  usePageMeta(page ? l(page.seo.title) || (page.isHome ? l(settings?.tagline) || l(page.title) : l(page.title)) : '', page ? l(page.seo.description) || undefined : undefined, {
    noIndex: page?.seo.noIndex,
    jsonLd: page?.isHome
      ? { '@context': 'https://schema.org', '@type': 'LocalBusiness', name: l(settings?.name), email: settings?.contact.email, telephone: settings?.contact.phone, address: l(settings?.contact.address) }
      : faq
        ? {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: (faq.props.items as { question: Record<string, string>; answer: Record<string, string> }[]).map((f) => ({
              '@type': 'Question',
              name: l(f.question as { en: string; fa: string }),
              acceptedAnswer: { '@type': 'Answer', text: l(f.answer as { en: string; fa: string }) },
            })),
          }
        : undefined,
  });

  if (isLoading) return <div role="status" aria-label="Loading" className="min-h-screen" />;
  if (isNotFound(error) || !page) return <NotFoundPage />;
  return <PageSections document={page.document} />;
}
