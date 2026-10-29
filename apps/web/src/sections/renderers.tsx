import { DEFAULT_REQUEST_TYPES, type SectionButton, type SectionProps, type SectionType } from '@site-builder/shared';
import { useEffect, useMemo, useState, type ComponentType, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router';
import { Accordion } from '../components/ui/Accordion';
import { Arrow } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { FilterChips, SearchInput } from '../components/ui/Field';
import { Image } from '../components/ui/Image';
import { Container, Section, SectionHeading } from '../components/ui/Layout';
import { RichText, SmartLink } from '../components/ui/SmartLink';
import { AddToCartBySlug } from '../features/cart/AddToCart';
import { ContactForm } from '../features/leads/ContactForm';
import { CustomRequestForm } from '../features/leads/CustomRequestForm';
import { GalleryCard, ProductCard, ServiceCard } from '../features/public-site/components/Cards';
import { isSoldOut } from '../features/public-site/components/price';
import { useProducts, useServices, useSiteSettings } from '../features/public-site/data';
import { cn } from '../lib/cn';
import { usePreferences } from '../lib/preferences';

type Props<T extends SectionType> = { props: SectionProps<T> };

const btn = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-6 py-3 text-sm font-medium tracking-wide transition duration-300';

type Surface = 'light' | 'dark' | 'image';

const buttonStyles: Record<Surface, Record<SectionButton['style'], string>> = {
  light: {
    primary: 'bg-ink text-bg hover:bg-accent hover:text-accent-ink',
    secondary: 'border border-ink/40 text-ink hover:border-ink hover:bg-ink hover:text-bg',
    link: 'px-0 py-1 rounded-none text-ink underline-offset-8 decoration-accent hover:underline',
  },
  dark: {
    primary: 'bg-bg text-ink hover:bg-accent hover:text-accent-ink',
    secondary: 'border border-current/50 hover:bg-bg hover:text-ink',
    link: 'px-0 py-1 rounded-none underline-offset-8 hover:underline',
  },
  image: {
    primary: 'bg-white/95 text-neutral-900 hover:bg-white',
    secondary: 'border border-white/50 text-white hover:border-white hover:bg-white hover:text-neutral-900',
    link: 'px-0 py-1 rounded-none text-white underline-offset-8 hover:underline',
  },
};

/** A section's buttons and links, in order; ones without a label or a link are skipped. */
function Buttons({ buttons, surface = 'light', className }: { buttons: SectionButton[]; surface?: Surface; className?: string }) {
  const { l } = usePreferences();
  // Cart buttons need a product; links need a label and an address.
  const shown = buttons.filter((b) => (b.action === 'cart' ? b.product : l(b.label) && b.href));
  if (!shown.length) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-4', className)}>
      {shown.map((b, i) =>
        b.action === 'cart' ? (
          <AddToCartBySlug key={i} slug={b.product} label={l(b.label)} className={cn(btn, buttonStyles[surface][b.style])} />
        ) : (
          <SmartLink key={i} href={b.href} newTab={b.newTab} className={cn(btn, buttonStyles[surface][b.style])}>
            {l(b.label)} {b.style !== 'secondary' && <Arrow />}
          </SmartLink>
        ),
      )}
    </div>
  );
}

function PageHeaderSection({ props }: Props<'page-header'>) {
  const { l } = usePreferences();
  return (
    <div className="border-b border-line pt-36 pb-4 sm:pt-44">
      <Container>
        <div className="reveal">
          <SectionHeading as="h1" eyebrow={l(props.eyebrow)} title={l(props.heading)} intro={l(props.intro)} />
          <Buttons buttons={props.buttons} className="mb-8" />
        </div>
      </Container>
    </div>
  );
}

function HeroSection({ props }: Props<'hero'>) {
  const { l, m, formatNumber } = usePreferences();
  const slides = props.display === 'slider' ? props.slides : props.slides.slice(0, 1);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;
  const go = (delta: number) => setIndex((i) => (i + delta + count) % count);
  useEffect(() => {
    if (count < 2 || !props.autoplay || paused) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), props.autoplay * 1000);
    return () => clearInterval(timer);
  }, [count, props.autoplay, paused]);
  if (!count) return null;
  const current = Math.min(index, count - 1);
  const height = { small: 'min-h-[50svh]', medium: 'min-h-[70svh]', large: 'min-h-[85svh]', full: 'min-h-[100svh]', custom: '' }[props.height];
  const custom = props.height === 'custom';
  const heightStyle = custom ? { height: Math.max(200, props.customHeight) } : undefined;
  const contained = props.frame === 'contained';

  return (
    <section
      aria-roledescription={count > 1 ? 'carousel' : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn('relative grid overflow-hidden text-white', contained && 'mx-auto mt-28 w-[calc(100%-2.5rem)] max-w-7xl rounded-2xl sm:mt-32 sm:w-[calc(100%-4rem)]')}
    >
      {/* Every slide sits in the same grid cell, so the section is as tall as its tallest slide. */}
      {slides.map((slide, i) => (
        <div
          key={i}
          aria-hidden={i !== current}
          aria-roledescription={count > 1 ? 'slide' : undefined}
          inert={i !== current}
          style={heightStyle}
          className={cn('relative col-start-1 row-start-1 flex items-end transition-opacity duration-700', height, i === current ? 'opacity-100' : 'pointer-events-none opacity-0')}
        >
          <div className="absolute inset-0 bg-neutral-800">
            {slide.imageUrl && <Image src={slide.imageUrl} alt="" priority={i === 0} className="h-full w-full bg-neutral-800 [&_img]:animate-[heroZoom_18s_ease-out_both]" />}
          </div>
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, var(--hero-overlay) 50%, rgba(0,0,0,0.75) 100%)' }} />
          <div className="absolute inset-0 bg-linear-to-r from-black/55 via-black/20 to-transparent rtl:bg-linear-to-l" />
          <Container className={cn('relative', contained || custom ? 'pt-10' : 'pt-32', count > 1 ? 'pb-24 sm:pb-28' : custom ? 'pb-10' : 'pb-16 sm:pb-24')}>
            <div className="reveal max-w-3xl">
              {l(slide.eyebrow) && (
                <p className="eyebrow mb-6" style={{ color: 'rgba(255,255,255,0.8)' }}>
                  {l(slide.eyebrow)}
                </p>
              )}
              {i === 0 ? (
                <h1 className="font-display text-5xl leading-[1.02] sm:text-7xl lg:text-8xl">{l(slide.heading)}</h1>
              ) : (
                <h2 className="font-display text-5xl leading-[1.02] sm:text-7xl lg:text-8xl">{l(slide.heading)}</h2>
              )}
              {l(slide.text) && <p className="mt-8 max-w-xl text-base leading-relaxed text-white/85 sm:text-lg">{l(slide.text)}</p>}
              <Buttons buttons={slide.buttons} surface="image" className="mt-10" />
            </div>
          </Container>
        </div>
      ))}
      {count > 1 && (
        <Container className="absolute inset-x-0 bottom-6 flex items-center gap-4 sm:bottom-10">
          <button type="button" onClick={() => go(-1)} aria-label={m.common.previous} className="rounded-full border border-white/50 p-3 transition-colors hover:bg-white hover:text-neutral-900">
            <Arrow className="rotate-180" />
          </button>
          <div className="flex gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`${formatNumber(i + 1)} / ${formatNumber(count)}`}
                aria-current={i === current}
                onClick={() => setIndex(i)}
                className={cn('h-1.5 rounded-full transition-all', i === current ? 'w-8 bg-white' : 'w-3 bg-white/50 hover:bg-white/80')}
              />
            ))}
          </div>
          <button type="button" onClick={() => go(1)} aria-label={m.common.next} className="rounded-full border border-white/50 p-3 transition-colors hover:bg-white hover:text-neutral-900">
            <Arrow />
          </button>
        </Container>
      )}
    </section>
  );
}

function RichTextSection({ props }: Props<'rich-text'>) {
  const { l } = usePreferences();
  return (
    <Section>
      <Container className={props.width === 'narrow' ? 'max-w-3xl' : ''}>
        {l(props.heading) && <h2 className="mb-8 font-display text-4xl text-ink sm:text-5xl">{l(props.heading)}</h2>}
        <RichText text={l(props.body)} className="text-lg leading-relaxed text-ink-soft" />
        <Buttons buttons={props.buttons} className="mt-10" />
      </Container>
    </Section>
  );
}

function ImageTextSection({ props }: Props<'image-text'>) {
  const { l } = usePreferences();
  return (
    <Section>
      <Container className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <Image src={props.imageUrl} alt="" size={props.imageSize} className={cn('aspect-[4/3]', props.imageSide === 'end' && 'lg:order-2')} />
        <div>
          {l(props.eyebrow) && <p className="eyebrow mb-4">{l(props.eyebrow)}</p>}
          <h2 className="font-display text-3xl leading-snug text-ink sm:text-4xl">{l(props.heading)}</h2>
          <RichText text={l(props.body)} className="mt-6 text-lg leading-relaxed text-ink-soft" />
          <Buttons buttons={props.buttons} className="mt-8" />
        </div>
      </Container>
    </Section>
  );
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const TITLE_SIZE = { sm: 'text-base', md: 'text-lg', lg: 'text-xl sm:text-2xl', xl: 'text-2xl sm:text-3xl' };
const TEXT_SIZE = { sm: 'text-sm', md: 'text-base', lg: 'text-lg', xl: 'text-xl' };

function FeaturesSection({ props }: Props<'features'>) {
  const { l, formatNumber } = usePreferences();
  const marker = (i: number) => (props.marker === 'roman' ? ROMAN[i] : props.marker === 'number' ? formatNumber(i + 1) : props.marker === 'bullet' ? '•' : '');
  const inline = props.markerPosition === 'inline';
  const titleStyle: CSSProperties | undefined = props.titleColor ? { color: props.titleColor } : undefined;
  const textStyle: CSSProperties | undefined = props.textColor ? { color: props.textColor } : undefined;
  const list = (
    <ul className={cn('grid gap-10 sm:grid-cols-2', !props.imageUrl && 'lg:grid-cols-3')}>
      {props.items.map((a, i) => {
        const mark = marker(i) ? (
          <span className={cn('shrink-0 font-display text-accent', inline ? 'leading-none' : 'block text-xl')} aria-hidden="true">
            {marker(i)}
          </span>
        ) : null;
        return (
          <li key={i} className="border-t border-line pt-6">
            {!inline && mark}
            <h3 className={cn('flex items-baseline gap-3 font-medium text-ink', !inline && mark && 'mt-3', TITLE_SIZE[props.titleSize])} style={titleStyle}>
              {inline && mark}
              <span>{l(a.title)}</span>
            </h3>
            <p className={cn('mt-2 leading-relaxed text-ink-soft', TEXT_SIZE[props.textSize])} style={textStyle}>
              {l(a.text)}
            </p>
          </li>
        );
      })}
    </ul>
  );
  if (!props.imageUrl) {
    return (
      <Section className="bg-surface">
        <Container>
          <SectionHeading eyebrow={l(props.eyebrow)} title={l(props.heading)} />
          {list}
          <Buttons buttons={props.buttons} className="mt-12" />
        </Container>
      </Section>
    );
  }
  return (
    <Section>
      <Container className="grid gap-14 lg:grid-cols-2 lg:gap-20">
        <Image src={props.imageUrl} alt="" size={props.imageSize} className="aspect-[4/5] lg:aspect-auto lg:h-full" />
        <div className="flex flex-col justify-center">
          <SectionHeading eyebrow={l(props.eyebrow)} title={l(props.heading)} />
          {list}
          <Buttons buttons={props.buttons} className="mt-12" />
        </div>
      </Container>
    </Section>
  );
}

function StatsSection({ props }: Props<'stats'>) {
  const { l } = usePreferences();
  return (
    <section aria-label={l(props.eyebrow) || undefined} className="border-b border-line">
      <Container className="grid gap-12 py-16 lg:grid-cols-12 lg:items-center">
        <dl className={cn('grid grid-cols-2 gap-8 sm:grid-cols-4', props.publications.length ? 'lg:col-span-7' : 'lg:col-span-12')}>
          {props.items.map((s, i) => (
            <div key={i} className="flex flex-col-reverse gap-2">
              <dt className="text-sm leading-snug text-ink-soft">{l(s.label)}</dt>
              <dd className="font-display text-4xl text-ink sm:text-5xl" dir="ltr">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
        {props.publications.length > 0 && (
          <div className="lg:col-span-5">
            {l(props.eyebrow) && <p className="eyebrow mb-4">{l(props.eyebrow)}</p>}
            <ul className="flex flex-wrap gap-x-7 gap-y-3 font-display text-xl text-ink-soft" dir="ltr">
              {props.publications.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}
        <Buttons buttons={props.buttons} className="lg:col-span-12" />
      </Container>
    </section>
  );
}

function ServicesSection({ props }: Props<'services'>) {
  const { l, m } = usePreferences();
  const { data: services = [], isLoading } = useServices();
  const items = services.slice(0, props.limit);
  return (
    <Section>
      <Container>
        <SectionHeading
          eyebrow={l(props.eyebrow)}
          title={l(props.heading)}
          intro={l(props.intro)}
          action={
            <SmartLink href="/services" className={cn(btn, 'px-0 py-1 rounded-none text-ink underline-offset-8 decoration-accent hover:underline')}>
              {m.common.viewAll} <Arrow />
            </SmartLink>
          }
        />
        {isLoading ? (
          <LoadingGrid />
        ) : (
          <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {items.map((s, i) => (
              <ServiceCard key={s.id} service={s} index={i} />
            ))}
          </div>
        )}
        <Buttons buttons={props.buttons} className="mt-12" />
      </Container>
    </Section>
  );
}

function ProductsSection({ props }: Props<'products'>) {
  const { l, m } = usePreferences();
  const { data: products = [], isLoading } = useProducts();
  const items = products
    .filter((p) => (props.filter === 'featured' ? p.featured : true))
    .filter((p) => !props.category || p.category === props.category)
    .filter((p) => !props.hideOutOfStock || !isSoldOut(p))
    .slice(0, props.limit);
  const options = { showDiscount: props.showDiscount, showColors: props.showColors, showStock: props.showStock, showAddToCart: props.showAddToCart };
  return (
    <Section className="bg-surface">
      <Container>
        <SectionHeading
          eyebrow={l(props.eyebrow)}
          title={l(props.heading)}
          intro={l(props.intro)}
          action={
            <SmartLink href={props.category ? `/products?category=${props.category}` : '/products'} className={cn(btn, 'px-0 py-1 rounded-none text-ink underline-offset-8 decoration-accent hover:underline')}>
              {m.common.viewAll} <Arrow />
            </SmartLink>
          }
        />
        {isLoading ? (
          <LoadingGrid />
        ) : (
          <div className={cn('grid grid-cols-1 gap-x-6 gap-y-12', productColumns(props.columns))}>
            {items.map((p) => (
              <ProductCard key={p.id} product={p} options={options} />
            ))}
          </div>
        )}
        <Buttons buttons={props.buttons} className="mt-12" />
      </Container>
    </Section>
  );
}

function GallerySection({ props }: Props<'gallery'>) {
  const { l, m } = usePreferences();
  const categories = useMemo(() => [...new Set(props.items.map((i) => l(i.category)).filter(Boolean))], [props.items, l]);
  const [category, setCategory] = useState('all');
  const items = props.items.filter((i) => category === 'all' || l(i.category) === category);
  // Three items without filters: one large feature plus two stacked (the home showcase).
  const showcase = !props.filterable && props.items.length === 3;

  return (
    <Section className={cn(showcase && 'bg-surface', props.filterable && 'pt-10 sm:pt-12')}>
      <Container>
        {(l(props.heading) || l(props.eyebrow)) && <SectionHeading eyebrow={l(props.eyebrow)} title={l(props.heading)} />}
        {props.filterable && categories.length > 1 && (
          <div className="mb-14">
            <FilterChips label={l(props.heading) || m.projects.eyebrow} value={category} onChange={setCategory} options={[{ value: 'all', label: m.common.all }, ...categories.map((c) => ({ value: c, label: c }))]} />
          </div>
        )}
        {showcase ? (
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-7">
              <GalleryCard item={items[0]} size={props.imageSize} aspect="aspect-[7/5]" />
            </div>
            <div className="grid gap-12 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-1 lg:gap-8">
              {items.slice(1).map((it, i) => (
                <GalleryCard key={i} item={{ ...it, caption: { en: '', fa: '' } }} size={props.imageSize} aspect="aspect-[4/3]" />
              ))}
            </div>
          </div>
        ) : (
          <div className={cn('grid gap-x-8 gap-y-16', items.length > 2 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'md:grid-cols-2')}>
            {items.map((it, i) => (
              <GalleryCard key={i} item={it} size={props.imageSize} aspect={props.filterable ? 'aspect-[4/3]' : 'aspect-[4/5]'} />
            ))}
          </div>
        )}
        <Buttons buttons={props.buttons} className="mt-12" />
      </Container>
    </Section>
  );
}

function TestimonialsSection({ props }: Props<'testimonials'>) {
  const { l, m, formatNumber } = usePreferences();
  const [index, setIndex] = useState(0);
  if (!props.items.length) return null;

  if (props.layout === 'grid') {
    return (
      <Section className="pt-12 sm:pt-16">
        <Container>
          {l(props.heading) && <SectionHeading eyebrow={l(props.eyebrow)} title={l(props.heading)} />}
          <div className="grid gap-6 md:grid-cols-2">
            {props.items.map((t, i) => (
              <figure key={i} className="flex h-full flex-col justify-between border border-line bg-surface p-8 sm:p-10">
                <blockquote className="font-display text-2xl leading-snug text-ink">“{l(t.quote)}”</blockquote>
                <figcaption className="mt-10 text-sm">
                  <span className="block font-medium text-ink">{l(t.name)}</span>
                  <span className="text-ink-soft">{l(t.role)}</span>
                </figcaption>
              </figure>
            ))}
          </div>
          <Buttons buttons={props.buttons} className="mt-12" />
        </Container>
      </Section>
    );
  }

  const t = props.items[index % props.items.length];
  const go = (delta: number) => setIndex((i) => (i + delta + props.items.length) % props.items.length);
  return (
    <Section>
      <Container className="max-w-5xl text-center">
        {l(props.eyebrow) && <p className="eyebrow mb-10">{l(props.eyebrow)}</p>}
        <figure key={index} className="reveal" aria-live="polite">
          <blockquote className="font-display text-3xl leading-snug text-ink sm:text-5xl">“{l(t.quote)}”</blockquote>
          <figcaption className="mt-10 text-sm text-ink-soft">
            <span className="font-medium text-ink">{l(t.name)}</span> — {l(t.role)}
          </figcaption>
        </figure>
        {props.items.length > 1 && (
          <div className="mt-12 flex items-center justify-center gap-6">
            <button type="button" onClick={() => go(-1)} aria-label={m.common.previous} className="rounded-full border border-line p-3 transition-colors hover:border-ink">
              <Arrow className="rotate-180" />
            </button>
            <span className="text-sm text-ink-soft tabular-nums">
              {formatNumber((index % props.items.length) + 1)} / {formatNumber(props.items.length)}
            </span>
            <button type="button" onClick={() => go(1)} aria-label={m.common.next} className="rounded-full border border-line p-3 transition-colors hover:border-ink">
              <Arrow />
            </button>
          </div>
        )}
        <Buttons buttons={props.buttons} className="mt-12 justify-center" />
      </Container>
    </Section>
  );
}

function FaqSection({ props }: Props<'faq'>) {
  const { l, m } = usePreferences();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const items = props.items
    .map((f, i) => ({ id: `q${i}`, title: l(f.question), content: l(f.answer) }))
    .filter((f) => !q || `${f.title} ${f.content}`.toLowerCase().includes(q));

  return (
    <Section className={props.searchable ? 'pt-10 sm:pt-12' : ''}>
      <Container className="grid gap-12 lg:grid-cols-12">
        <div className="flex flex-col gap-8 lg:col-span-4">
          {(l(props.heading) || l(props.eyebrow)) && <SectionHeading eyebrow={l(props.eyebrow)} title={l(props.heading)} />}
          {props.searchable && <SearchInput label={m.common.search} value={query} onChange={setQuery} placeholder={m.faq.searchPlaceholder} />}
          <Buttons buttons={props.buttons} />
          {!props.searchable && (
            <SmartLink href="/faq" className={cn(btn, '-mt-6 self-start px-0 py-1 rounded-none text-ink underline-offset-8 decoration-accent hover:underline')}>
              {m.common.viewAll} <Arrow />
            </SmartLink>
          )}
        </div>
        <div className="lg:col-span-8">
          {items.length ? (
            <Accordion key={q} items={items} />
          ) : (
            <EmptyState message={m.common.noResults} actionLabel={m.common.clearFilters} onAction={() => setQuery('')} />
          )}
        </div>
      </Container>
    </Section>
  );
}

function PricingSection({ props }: Props<'pricing'>) {
  const { l } = usePreferences();
  return (
    <Section>
      <Container>
        <SectionHeading eyebrow={l(props.eyebrow)} title={l(props.heading)} align="center" />
        <div className={cn('grid gap-6', props.plans.length >= 3 ? 'lg:grid-cols-3' : 'md:grid-cols-2', props.plans.length === 4 && 'lg:grid-cols-4')}>
          {props.plans.map((plan, i) => (
            <div key={i} className={cn('flex flex-col border p-8', plan.highlighted ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink')}>
              <h3 className="font-display text-2xl">{l(plan.name)}</h3>
              <p className="mt-6 font-display text-5xl">{l(plan.price)}</p>
              {l(plan.period) && <p className="mt-1 text-sm opacity-70">{l(plan.period)}</p>}
              <ul className="mt-8 flex-1 space-y-3 text-sm">
                {plan.features.map((f, j) => (
                  <li key={j} className="flex gap-3">
                    <span aria-hidden="true" className="mt-2 h-px w-3 shrink-0 bg-current opacity-60" />
                    {l(f)}
                  </li>
                ))}
              </ul>
              <Buttons buttons={plan.buttons} surface={plan.highlighted ? 'dark' : 'light'} className="mt-8" />
            </div>
          ))}
        </div>
        <Buttons buttons={props.buttons} className="mt-12 justify-center" />
      </Container>
    </Section>
  );
}

function CtaSection({ props }: Props<'cta'>) {
  const { l } = usePreferences();
  return (
    <section className={cn('relative overflow-hidden', props.tone === 'accent' ? 'bg-accent text-accent-ink' : 'bg-ink text-bg')}>
      <Container className="flex flex-col items-start gap-10 py-24 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <h2 className="font-display text-4xl leading-tight sm:text-6xl">{l(props.heading)}</h2>
          {l(props.text) && <p className="mt-6 text-lg opacity-75">{l(props.text)}</p>}
        </div>
        <Buttons buttons={props.buttons} surface="dark" />
      </Container>
    </section>
  );
}

function ContactFormSection({ props }: Props<'contact-form'>) {
  const { l, m } = usePreferences();
  const { data: settings } = useSiteSettings();
  const contact = settings?.contact;
  // A link like /contact?type=demo picks the request type; else the section's own choice.
  const [params] = useSearchParams();
  const types = settings?.requestTypes ?? DEFAULT_REQUEST_TYPES;
  const requestType = types.find((t) => t.slug === params.get('type')) ?? types.find((t) => t.slug === props.requestType);
  return (
    <>
      <div className="border-b border-line pt-36 pb-4 sm:pt-44">
        <Container>
          <SectionHeading as="h1" eyebrow={l(props.eyebrow)} title={l(props.heading)} intro={l(props.intro)} />
          <Buttons buttons={props.buttons} className="mb-8" />
        </Container>
      </div>
      <Section className="pt-12 sm:pt-16">
        <Container className="grid gap-16 lg:grid-cols-12">
          <div className={props.showDetails ? 'lg:col-span-7' : 'lg:col-span-8'}>
            {requestType?.fields?.length ? (
              <CustomRequestForm
                key={requestType.slug}
                requestType={requestType.slug}
                fields={requestType.fields}
                requestLabel={params.get('type') ? l(requestType.label) : undefined}
                submitLabel={l(props.submitLabel)}
              />
            ) : (
            <ContactForm
              key={requestType?.slug ?? props.formType}
              formType={requestType?.form ?? props.formType}
              requestType={requestType?.slug}
              requestLabel={requestType && params.get('type') ? l(requestType.label) : undefined}
              submitLabel={l(props.submitLabel)}
            />
            )}
          </div>
          {props.showDetails && contact && (
            <aside className="space-y-10 lg:col-span-4 lg:col-start-9">
              {l(contact.address) && (
                <div>
                  <h2 className="eyebrow mb-3">{m.contact.visit}</h2>
                  <p className="text-lg text-ink">{l(contact.address)}</p>
                </div>
              )}
              <div>
                <h2 className="eyebrow mb-3">{m.contact.write}</h2>
                {contact.email && (
                  <p className="text-lg">
                    <a href={`mailto:${contact.email}`} className="text-ink underline-offset-4 hover:underline">
                      {contact.email}
                    </a>
                  </p>
                )}
                {contact.phone && (
                  <p className="text-lg">
                    <a href={`tel:${contact.phone.replace(/\s/g, '')}`} dir="ltr" className="text-ink underline-offset-4 hover:underline">
                      {contact.phone}
                    </a>
                  </p>
                )}
              </div>
              {l(contact.hours) && (
                <div>
                  <h2 className="eyebrow mb-3">{m.contact.hours}</h2>
                  <p className="text-lg text-ink">{l(contact.hours)}</p>
                </div>
              )}
            </aside>
          )}
        </Container>
      </Section>
    </>
  );
}

/** Grid classes for products per row on large screens (fewer on small screens). */
export function productColumns(n: number) {
  return (
    {
      1: 'sm:grid-cols-1',
      2: 'sm:grid-cols-2',
      3: 'sm:grid-cols-2 lg:grid-cols-3',
      4: 'sm:grid-cols-2 lg:grid-cols-4',
      5: 'sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5',
      6: 'sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6',
    } as Record<number, string>
  )[n] ?? 'sm:grid-cols-2 lg:grid-cols-4';
}

function LoadingGrid() {
  return (
    <div role="status" aria-label="Loading" className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="aspect-[4/5] animate-pulse bg-surface-2" />
      ))}
    </div>
  );
}

// Renderers have different prop types; props are validated by parseSectionProps before rendering, so the registry is untyped here.
type AnyRenderer = ComponentType<{ props: any }>;

export const sectionRenderers: Record<SectionType, AnyRenderer> = {
  'page-header': PageHeaderSection,
  hero: HeroSection,
  'rich-text': RichTextSection,
  'image-text': ImageTextSection,
  features: FeaturesSection,
  stats: StatsSection,
  services: ServicesSection,
  products: ProductsSection,
  gallery: GallerySection,
  testimonials: TestimonialsSection,
  faq: FaqSection,
  pricing: PricingSection,
  cta: CtaSection,
  'contact-form': ContactFormSection,
};
