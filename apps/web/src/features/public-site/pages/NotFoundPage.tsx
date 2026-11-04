import { Arrow, ButtonLink } from '../../../components/ui/Button';
import { Container } from '../../../components/ui/Layout';
import { usePageMeta } from '../../../hooks/usePageMeta';
import { usePreferences } from '../../../lib/preferences';
import { BuiltInPage } from '../../../sections/BuiltInPage';
import { PageSlot, useSystemPage } from '../../../sections/PageSlot';

/** "Page not found": the site's own builder page at /not-found when it has one, else the built-in text. */
export function NotFoundPage() {
  return (
    <BuiltInPage page="notFound">
      <BuiltInNotFound />
    </BuiltInPage>
  );
}

function BuiltInNotFound() {
  const { m, formatNumber } = usePreferences();
  usePageMeta(m.notFound.title, undefined, { noIndex: true });
  const own = useSystemPage('notFound').page;
  if (own) return <PageSlot slug={own} />;

  return (
    <Container className="flex min-h-[80vh] flex-col items-start justify-center pt-32 pb-20">
      <p className="font-display text-[8rem] leading-none text-accent/40 sm:text-[12rem]" aria-hidden="true">
        {formatNumber(404)}
      </p>
      <h1 className="mt-4 font-display text-4xl text-ink sm:text-6xl">{m.notFound.title}</h1>
      <p className="mt-6 max-w-md text-lg text-ink-soft">{m.notFound.text}</p>
      <ButtonLink to="/" className="mt-10">
        {m.notFound.home} <Arrow />
      </ButtonLink>
    </Container>
  );
}
