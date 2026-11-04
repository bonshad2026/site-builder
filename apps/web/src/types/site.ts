export type Locale = 'en' | 'fa';

/** A string available in every supported locale. */
export type Localized = Record<Locale, string>;

/** A built-in theme (ivory, noir, sage) or the id of one of the site's own themes. */
export type ThemeId = string;

export type ModuleId = 'services' | 'products' | 'projects' | 'testimonials' | 'faq' | 'leads';

export interface NavItem {
  to: string;
  labelKey: string;
  module?: ModuleId;
}

export interface SiteConfig {
  id: string;
  name: Localized;
  tagline: Localized;
  defaultLocale: Locale;
  locales: Locale[];
  defaultTheme: ThemeId;
  themes: ThemeId[];
  contact: {
    email: string;
    phone: string;
    address: Localized;
    hours: Localized;
  };
  social: { label: string; href: string }[];
  nav: NavItem[];
  modules: Record<ModuleId, boolean>;
  seo: {
    titleTemplate: string;
    defaultDescription: Localized;
    siteUrl: string;
  };
  business: {
    founded: number;
    stats: { value: string; label: Localized }[];
  };
}

export interface Service {
  slug: string;
  title: Localized;
  summary: Localized;
  body: Localized;
  image: string;
  duration: Localized;
  startingFrom: Localized;
  deliverables: Localized[];
  process: { title: Localized; text: Localized }[];
}

export type ProductCategory = 'seating' | 'lighting' | 'tables' | 'decor';

export interface Product {
  slug: string;
  name: Localized;
  category: ProductCategory;
  price: number;
  description: Localized;
  materials: Localized;
  dimensions: string;
  image: string;
  leadTime: Localized;
  featured?: boolean;
}

export type ProjectCategory = 'residential' | 'hospitality' | 'workspace';

export interface Project {
  slug: string;
  title: Localized;
  location: Localized;
  year: number;
  category: ProjectCategory;
  area: string;
  image: string;
  summary: Localized;
}

export interface Testimonial {
  id: string;
  quote: Localized;
  name: Localized;
  role: Localized;
  project: Localized;
}

export type FaqCategory = 'process' | 'pricing' | 'products';

export interface Faq {
  id: string;
  category: FaqCategory;
  question: Localized;
  answer: Localized;
}
