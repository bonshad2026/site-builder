import type { SiteConfig } from '../types/site';

/**
 * Everything specific to one client site lives here. A new client gets a new
 * config object; components read from it instead of hard-coding brand details.
 * In stage 4 this object will come from the tenant's database via the API.
 */
export const siteConfig: SiteConfig = {
  id: 'atelier-navar',
  name: { en: 'Atelier Navar', fa: 'آتلیه ناوار' },
  tagline: {
    en: 'Interiors composed with restraint',
    fa: 'فضاهایی با آرامش و دقت',
  },
  defaultLocale: 'en',
  locales: ['en', 'fa'],
  defaultTheme: 'ivory',
  themes: ['ivory', 'noir', 'sage'],
  contact: {
    email: 'studio@ateliernavar.example',
    phone: '+98 21 2200 4410',
    address: {
      en: '14 Golestan Alley, Elahieh, Tehran',
      fa: 'تهران، الهیه، کوچه گلستان، پلاک ۱۴',
    },
    hours: {
      en: 'Sat – Wed, 10:00 – 18:00',
      fa: 'شنبه تا چهارشنبه، ۱۰ تا ۱۸',
    },
  },
  social: [
    { label: 'Instagram', href: 'https://instagram.com/' },
    { label: 'Pinterest', href: 'https://pinterest.com/' },
    { label: 'LinkedIn', href: 'https://linkedin.com/' },
  ],
  nav: [
    { to: '/services', labelKey: 'nav.services', module: 'services' },
    { to: '/projects', labelKey: 'nav.projects', module: 'projects' },
    { to: '/products', labelKey: 'nav.products', module: 'products' },
    { to: '/about', labelKey: 'nav.about' },
    { to: '/testimonials', labelKey: 'nav.testimonials', module: 'testimonials' },
    { to: '/faq', labelKey: 'nav.faq', module: 'faq' },
  ],
  modules: {
    services: true,
    products: true,
    projects: true,
    testimonials: true,
    faq: true,
    leads: true,
  },
  seo: {
    titleTemplate: '%s — Atelier Navar',
    defaultDescription: {
      en: 'Atelier Navar is a residential and hospitality interior design studio in Tehran.',
      fa: 'آتلیه ناوار، استودیوی طراحی داخلی مسکونی و تجاری در تهران.',
    },
    siteUrl: 'https://ateliernavar.example',
  },
  business: {
    founded: 2011,
    stats: [
      { value: '14', label: { en: 'Years in practice', fa: 'سال فعالیت' } },
      { value: '220+', label: { en: 'Completed interiors', fa: 'پروژه تکمیل‌شده' } },
      { value: '38', label: { en: 'Craft workshops we partner with', fa: 'کارگاه همکار' } },
      { value: '96%', label: { en: 'Clients who return or refer', fa: 'مشتری بازگشتی یا معرفی‌شده' } },
    ],
  },
};
