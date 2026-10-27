import { Arrow, ButtonLink } from '../../../components/ui/Button';
import { Container } from '../../../components/ui/Layout';
import { usePageMeta } from '../../../hooks/usePageMeta';
import { usePreferences } from '../../../lib/preferences';

export function NotFoundPage() {
  const { m, formatNumber } = usePreferences();
  usePageMeta(m.notFound.title);

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
