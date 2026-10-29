import { Link, useParams } from 'react-router';
import { Arrow, ButtonLink } from '../../../components/ui/Button';
import { Image } from '../../../components/ui/Image';
import { Container, PageHeader, Section } from '../../../components/ui/Layout';
import { usePageMeta } from '../../../hooks/usePageMeta';
import { usePreferences } from '../../../lib/preferences';
import { isNotFound, useService, useServices } from '../data';
import { NotFoundPage } from './NotFoundPage';
import { PageSlot, useSystemPage } from '../../../sections/PageSlot';
import { ServiceCard } from '../components/Cards';

export function ServicesPage() {
  const slots = useSystemPage('services');
  const { m, l, formatNumber } = usePreferences();
  const { data: services = [], isLoading } = useServices();
  usePageMeta(m.services.eyebrow, m.services.intro);

  return (
    <>
      <PageSlot slug={slots.before} />
      <PageHeader eyebrow={m.services.eyebrow} title={m.services.title} intro={m.services.intro} />
      <Section className="pt-12 sm:pt-16">
        <Container className="flex flex-col gap-20 sm:gap-28">
          {isLoading && <div role="status" aria-label="Loading" className="aspect-[16/6] animate-pulse bg-surface-2" />}
          {slots.layout === 'cards' && (
            <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((s, i) => (
                <ServiceCard key={s.id} service={s} index={i} />
              ))}
            </div>
          )}
          {slots.layout !== 'cards' && services.map((s, i) => (
            <article key={s.id} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-20">
              <Link to={`/services/${s.slug}`} className={i % 2 ? 'lg:order-2' : ''} tabIndex={-1} aria-hidden="true">
                <Image src={s.imageUrl} alt="" className="aspect-[4/3]" />
              </Link>
              <div>
                <span className="font-display text-xl text-accent">{formatNumber(i + 1).padStart(2, formatNumber(0))}</span>
                <h2 className="mt-3 font-display text-4xl text-ink sm:text-5xl">{l(s.title)}</h2>
                <p className="mt-6 text-lg leading-relaxed text-ink-soft">{l(s.summary)}</p>
                <dl className="mt-8 grid grid-cols-2 gap-6 border-t border-line pt-6 text-sm">
                  <div>
                    <dt className="text-ink-soft">{m.common.duration}</dt>
                    <dd className="mt-1 text-ink">{l(s.duration)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-soft">{m.common.pricing}</dt>
                    <dd className="mt-1 text-ink">{l(s.startingFrom)}</dd>
                  </div>
                </dl>
                <ButtonLink to={`/services/${s.slug}`} variant="outline" className="mt-10">
                  {m.common.learnMore} <Arrow />
                </ButtonLink>
              </div>
            </article>
          ))}
        </Container>
      </Section>
      <PageSlot slug={slots.after} />
    </>
  );
}

export function ServiceDetailPage() {
  const slots = useSystemPage('serviceDetail');
  const { slug = '' } = useParams();
  const { m, l, formatNumber } = usePreferences();
  const { data: service, error, isLoading } = useService(slug);
  const { data: all = [] } = useServices();
  usePageMeta(service ? l(service.title) : '', service ? l(service.summary) : undefined, { image: service?.imageUrl });

  if (isLoading) return <div role="status" aria-label="Loading" className="min-h-screen" />;
  if (isNotFound(error) || !service) return <NotFoundPage />;
  const others = all.filter((s) => s.slug !== service.slug);

  return (
    <>
      <PageSlot slug={slots.before} />
      <div className="pt-32 sm:pt-40">
        <Container>
          <Link to="/services" className="inline-flex items-center gap-2 text-sm text-ink-soft hover:text-ink">
            <Arrow className="rotate-180" /> {m.common.backTo} {m.nav.services}
          </Link>
          <div className="reveal mt-10 grid gap-10 lg:grid-cols-12 lg:items-end">
            <h1 className="font-display text-5xl leading-[1.05] text-ink sm:text-7xl lg:col-span-7">{l(service.title)}</h1>
            <p className="text-lg leading-relaxed text-ink-soft lg:col-span-5">{l(service.summary)}</p>
          </div>
        </Container>
        <Container className="mt-14">
          <Image src={service.imageUrl} alt={l(service.title)} priority className="aspect-[16/9] sm:aspect-[21/9]" />
        </Container>
      </div>

      <Section>
        <Container className="grid gap-16 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="text-xl leading-relaxed text-ink sm:text-2xl">{l(service.body)}</p>
            {service.process.length > 0 && (
              <>
                <h2 className="mt-16 font-display text-3xl text-ink">{m.services.process}</h2>
                <ol className="mt-8 grid gap-8 sm:grid-cols-2">
                  {service.process.map((step, i) => (
                    <li key={i} className="border-t border-line pt-5">
                      <span className="text-sm text-accent">{formatNumber(i + 1).padStart(2, formatNumber(0))}</span>
                      <h3 className="mt-2 text-lg font-medium text-ink">{l(step.title)}</h3>
                      <p className="mt-1 text-ink-soft">{l(step.text)}</p>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
          <aside className="lg:col-span-4 lg:col-start-9">
            <div className="sticky top-28 border border-line bg-surface p-8">
              <h2 className="eyebrow">{m.services.deliverables}</h2>
              <ul className="mt-6 space-y-3">
                {service.deliverables.map((d, i) => (
                  <li key={i} className="flex gap-3 text-ink">
                    <span aria-hidden="true" className="mt-2.5 h-px w-3 shrink-0 bg-accent" />
                    {l(d)}
                  </li>
                ))}
              </ul>
              <dl className="mt-8 space-y-4 border-t border-line pt-6 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-soft">{m.common.duration}</dt>
                  <dd className="text-end text-ink">{l(service.duration)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-soft">{m.common.pricing}</dt>
                  <dd className="text-end text-ink">{l(service.startingFrom)}</dd>
                </div>
              </dl>
              <ButtonLink to={`/contact?service=${service.slug}`} className="mt-8 w-full">
                {m.common.bookConsultation}
              </ButtonLink>
            </div>
          </aside>
        </Container>
      </Section>

      {others.length > 0 && (
        <Section className="border-t border-line bg-surface">
          <Container>
            <h2 className="mb-10 font-display text-3xl text-ink">{m.services.otherServices}</h2>
            <ul className="divide-y divide-line border-y border-line">
              {others.map((s) => (
                <li key={s.id}>
                  <Link to={`/services/${s.slug}`} className="group flex items-center justify-between gap-6 py-6">
                    <span className="font-display text-2xl text-ink transition-colors group-hover:text-accent sm:text-3xl">{l(s.title)}</span>
                    <span className="hidden flex-1 text-ink-soft md:block">{l(s.summary)}</span>
                    <Arrow className="size-5 transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
                  </Link>
                </li>
              ))}
            </ul>
          </Container>
        </Section>
      )}
      <PageSlot slug={slots.after} />
    </>
  );
}
