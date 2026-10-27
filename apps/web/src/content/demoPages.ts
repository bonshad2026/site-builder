/**
 * Builds the Atelier Navar demo pages as section documents from the stage 1
 * demo content, so the builder can edit everything the public site shows.
 */
import { faqs } from './faqs';
import { projects } from './projects';
import { testimonials } from './testimonials';
import { siteConfig } from '../config/site';
import { en } from '../locales/en';
import { fa } from '../locales/fa';

type L = { en: string; fa: string };
const t = (pick: (m: typeof en) => string): L => ({ en: pick(en), fa: pick(fa as typeof en) });

let n = 0;
const section = (type: string, props: Record<string, unknown>) => ({ id: `s${++n}`, type, props });

export interface DemoPage {
  slug: string;
  title: L;
  isHome?: boolean;
  sections: ReturnType<typeof section>[];
}

/** `img(unsplashId)` returns the stored image URL for that demo photo. */
export function demoPages(img: (id: string) => string): DemoPage[] {
  n = 0;
  const cta = section('cta', { heading: t((m) => m.home.ctaTitle), text: t((m) => m.home.ctaText), cta: { label: t((m) => m.common.bookConsultation), href: '/contact' } });
  const projectItems = projects.map((p) => ({
    imageUrl: img(p.image),
    title: p.title,
    caption: p.summary,
    category: { en: en.projects.categories[p.category], fa: fa.projects.categories[p.category] },
    meta: `${p.year} · ${p.area}`,
  }));
  const testimonialItems = testimonials.map((x) => ({ quote: x.quote, name: x.name, role: { en: `${x.role.en}, ${x.project.en}`, fa: `${x.role.fa}، ${x.project.fa}` } }));
  const faqItems = faqs.map((f) => ({ question: f.question, answer: f.answer }));

  return [
    {
      slug: 'home',
      isHome: true,
      title: t((m) => m.nav.home),
      sections: [
        section('hero', {
          eyebrow: t((m) => m.home.heroEyebrow),
          heading: t((m) => m.home.heroTitle),
          text: t((m) => m.home.heroText),
          imageUrl: img('1618220179428-22790b461013'),
          primaryCta: { label: t((m) => m.common.bookConsultation), href: '/contact' },
          secondaryCta: { label: t((m) => m.common.viewProjects), href: '/projects' },
        }),
        section('stats', {
          eyebrow: t((m) => m.home.trustTitle),
          items: siteConfig.business.stats.map((s) => ({ value: s.value, label: s.label })),
          publications: ['Architectural Digest ME', 'Elle Decor', 'Memar', 'Dezeen', 'Wallpaper*'],
        }),
        section('services', { eyebrow: t((m) => m.home.servicesEyebrow), heading: t((m) => m.home.servicesTitle), limit: 4 }),
        section('gallery', { eyebrow: t((m) => m.home.projectsEyebrow), heading: t((m) => m.home.projectsTitle), items: projectItems.slice(0, 3) }),
        section('features', {
          eyebrow: t((m) => m.home.advantagesEyebrow),
          heading: t((m) => m.home.advantagesTitle),
          imageUrl: img('1615529182904-14819c35db37'),
          items: en.advantages.map((a, i) => ({ title: { en: a.title, fa: fa.advantages[i].title }, text: { en: a.text, fa: fa.advantages[i].text } })),
        }),
        section('products', { eyebrow: t((m) => m.home.productsEyebrow), heading: t((m) => m.home.productsTitle), filter: 'featured', limit: 4 }),
        section('testimonials', { eyebrow: t((m) => m.home.testimonialsEyebrow), items: testimonialItems }),
        section('faq', { eyebrow: t((m) => m.home.faqEyebrow), heading: t((m) => m.home.faqTitle), items: faqItems.slice(0, 4) }),
        cta,
      ],
    },
    {
      slug: 'about',
      title: t((m) => m.nav.about),
      sections: [
        section('page-header', { eyebrow: t((m) => m.about.eyebrow), heading: t((m) => m.about.title) }),
        section('image-text', {
          heading: t((m) => m.about.lead),
          body: { en: `${en.about.body1}\n\n${en.about.body2}`, fa: `${fa.about.body1}\n\n${fa.about.body2}` },
          imageUrl: img('1600210492486-724fe5c67fb0'),
        }),
        section('features', {
          heading: t((m) => m.about.valuesTitle),
          items: en.about.values.map((v, i) => ({ title: { en: v.title, fa: fa.about.values[i].title }, text: { en: v.text, fa: fa.about.values[i].text } })),
        }),
        section('stats', { items: siteConfig.business.stats.map((s) => ({ value: s.value, label: s.label })) }),
        section('gallery', {
          heading: t((m) => m.about.teamTitle),
          items: en.about.team.map((p, i) => ({
            imageUrl: img(['1600607687939-ce8a6c25118c', '1616486338812-3dadae4b4ace', '1615874959474-d609969a20ed'][i]),
            title: { en: p.name, fa: fa.about.team[i].name },
            caption: { en: p.role, fa: fa.about.team[i].role },
          })),
        }),
        cta,
      ],
    },
    {
      slug: 'projects',
      title: t((m) => m.nav.projects),
      sections: [
        section('page-header', { eyebrow: t((m) => m.projects.eyebrow), heading: t((m) => m.projects.title), intro: t((m) => m.projects.intro) }),
        section('gallery', { filterable: true, items: projectItems }),
        cta,
      ],
    },
    {
      slug: 'testimonials',
      title: t((m) => m.nav.testimonials),
      sections: [
        section('page-header', { eyebrow: t((m) => m.testimonials.eyebrow), heading: t((m) => m.testimonials.title), intro: t((m) => m.testimonials.intro) }),
        section('testimonials', { layout: 'grid', items: testimonialItems }),
        cta,
      ],
    },
    {
      slug: 'faq',
      title: t((m) => m.nav.faq),
      sections: [
        section('page-header', { eyebrow: t((m) => m.faq.eyebrow), heading: t((m) => m.faq.title), intro: t((m) => m.faq.intro) }),
        section('faq', { searchable: true, items: faqItems }),
      ],
    },
    {
      slug: 'contact',
      title: t((m) => m.nav.contact),
      sections: [section('contact-form', { eyebrow: t((m) => m.contact.eyebrow), heading: t((m) => m.contact.title), intro: t((m) => m.contact.intro) })],
    },
  ];
}

export const demoNav = [
  { href: '/services', label: t((m) => m.nav.services) },
  { href: '/projects', label: t((m) => m.nav.projects) },
  { href: '/products', label: t((m) => m.nav.products) },
  { href: '/about', label: t((m) => m.nav.about) },
  { href: '/testimonials', label: t((m) => m.nav.testimonials) },
  { href: '/faq', label: t((m) => m.nav.faq) },
];
