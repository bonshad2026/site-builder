import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useSiteSettings } from '../features/public-site/data';
import { usePreferences } from '../lib/preferences';

function setMeta(attr: 'name' | 'property', key: string, content: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (content === null) return el?.remove();
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setLink(rel: string, href: string, hreflang?: string) {
  const selector = hreflang ? `link[rel="${rel}"][hreflang="${hreflang}"]` : `link[rel="${rel}"]:not([hreflang])`;
  let el = document.head.querySelector<HTMLLinkElement>(selector);
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    if (hreflang) el.hreflang = hreflang;
    document.head.appendChild(el);
  }
  el.href = href;
}

interface MetaOptions {
  image?: string | null;
  noIndex?: boolean;
  /** Structured data, only for facts that are actually on the page. */
  jsonLd?: Record<string, unknown>;
}

/**
 * Title, description, canonical, hreflang alternates, Open Graph, robots and
 * JSON-LD for the current page. Build-time prerendering writes the same tags
 * into static HTML for crawlers that do not run JavaScript (scripts/prerender.mjs).
 */
export function usePageMeta(title: string, description?: string, options: MetaOptions = {}) {
  const { l, locale } = usePreferences();
  const { data: settings } = useSiteSettings();
  const { pathname } = useLocation();
  const { image, noIndex, jsonLd } = options;
  const jsonLdText = jsonLd ? JSON.stringify(jsonLd) : '';

  useEffect(() => {
    if (!settings || !title) return;
    const fullTitle = settings.seo.titleTemplate.replace('%s', title);
    const desc = description ?? l(settings.seo.defaultDescription);
    const origin = window.location.origin;
    const path = pathname === '/' ? '' : pathname;
    const enUrl = `${origin}${path || '/'}`;
    const faUrl = `${origin}/fa${path}`;

    document.title = fullTitle;
    setMeta('name', 'description', desc);
    setMeta('name', 'robots', noIndex ? 'noindex, nofollow' : null);
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:locale', locale === 'fa' ? 'fa_IR' : 'en_US');
    setMeta('property', 'og:url', locale === 'fa' ? faUrl : enUrl);
    setMeta('property', 'og:image', image ?? null);
    setLink('canonical', locale === 'fa' ? faUrl : enUrl);
    setLink('alternate', enUrl, 'en');
    setLink('alternate', faUrl, 'fa');
    setLink('alternate', enUrl, 'x-default');

    const id = 'page-jsonld';
    document.getElementById(id)?.remove();
    if (jsonLdText) {
      const script = document.createElement('script');
      script.id = id;
      script.type = 'application/ld+json';
      script.textContent = jsonLdText;
      document.head.appendChild(script);
    }
  }, [settings, title, description, l, locale, pathname, image, noIndex, jsonLdText]);
}
