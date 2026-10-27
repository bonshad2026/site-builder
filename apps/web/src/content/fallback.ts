import { pageDocumentSchema, siteSettingsSchema, type SiteSettings } from '@site-builder/shared';
import { siteConfig } from '../config/site';
import { photo } from '../lib/images';
import type { ProductDto, PublishedPage, ServiceDto } from '../types/api';
import { demoNav, demoPages } from './demoPages';
import { products } from './products';
import { services } from './services';

/**
 * Bundled demo data in the same shape the API returns. Used when the site runs
 * without a backend (VITE_API_URL unset): a static demo, or tests.
 */
export const fallbackSettings: SiteSettings = siteSettingsSchema.parse({
  name: siteConfig.name,
  tagline: siteConfig.tagline,
  defaultLocale: siteConfig.defaultLocale,
  locales: siteConfig.locales,
  themeId: siteConfig.defaultTheme,
  logoAssetId: null,
  contact: siteConfig.contact,
  social: siteConfig.social,
  nav: demoNav,
  modules: { ...siteConfig.modules, orders: true },
  seo: { titleTemplate: siteConfig.seo.titleTemplate, defaultDescription: siteConfig.seo.defaultDescription },
  business: siteConfig.business,
});

export const fallbackServices: ServiceDto[] = services.map((s, i) => ({
  id: `demo-service-${i}`,
  slug: s.slug,
  title: s.title,
  summary: s.summary,
  body: s.body,
  imageAssetId: null,
  imageUrl: photo(s.image, 1600),
  duration: s.duration,
  startingFrom: s.startingFrom,
  deliverables: s.deliverables,
  process: s.process,
  status: 'published',
  position: i,
  seo: {},
}));

export const fallbackProducts: ProductDto[] = products.map((p, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  slug: p.slug,
  name: p.name,
  description: p.description,
  category: p.category,
  priceMinor: String(p.price * 1_000_000),
  currency: 'IRR',
  stock: 10,
  isAvailable: true,
  featured: !!p.featured,
  materials: p.materials,
  dimensions: p.dimensions,
  leadTime: p.leadTime,
  imageAssetId: null,
  imageUrl: photo(p.image, 1400),
  status: 'published',
  position: i,
  seo: {},
}));

export const fallbackPages: PublishedPage[] = demoPages((id) => photo(id, 1800)).map((p) => ({
  slug: p.slug,
  title: p.title,
  isHome: !!p.isHome,
  seo: {},
  document: pageDocumentSchema.parse({ schemaVersion: 1, sections: p.sections }),
}));
