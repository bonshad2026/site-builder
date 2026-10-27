/**
 * Build-time SEO for static hosting. For every published page, service and
 * product (in English and Persian) this writes dist/<path>/index.html with the
 * right <title>, description, canonical, hreflang, Open Graph and lang/dir,
 * plus sitemap.xml and robots.txt. The page body is still rendered by React in
 * the browser; crawlers that do not run JavaScript get correct metadata.
 *
 * Needs the API (VITE_API_URL) at build time. Without it, the step is skipped
 * and the SPA works as before.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');

async function loadRootEnv() {
  try {
    const text = await readFile(path.resolve(here, '../../../.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  } catch {
    // No .env: rely on the real environment.
  }
}

await loadRootEnv();
const API = (process.env.VITE_API_URL ?? '').replace(/\/$/, '');
const SITE = process.env.VITE_SITE_ID || 'atelier-navar';
const ORIGIN = (process.env.SITE_URL || process.env.WEB_APP_URL || 'http://localhost:5173').replace(/\/$/, '');

if (!API) {
  console.log('[prerender] VITE_API_URL not set, skipping (SPA only).');
  process.exit(0);
}

const get = async (p) => {
  const res = await fetch(`${API}/api/v1/public/sites/${SITE}${p}`);
  if (!res.ok) throw new Error(`${p}: ${res.status}`);
  return res.headers.get('content-type')?.includes('json') ? (await res.json()).data : res.text();
};

let settings, pages, services, products;
try {
  settings = await get('/settings');
  pages = await get('/pages');
  services = settings.modules.services ? await get('/services') : [];
  products = settings.modules.products ? await get('/products?pageSize=100') : [];
} catch (err) {
  console.warn(`[prerender] API not reachable (${err.message}); skipping.`);
  process.exit(0);
}

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pick = (v, locale) => (v ? v[locale] || v[locale === 'fa' ? 'en' : 'fa'] || '' : '');
const template = await readFile(path.join(dist, 'index.html'), 'utf8');

const routes = [];
for (const p of pages) {
  if (p.seo?.noIndex) continue;
  routes.push({ path: p.isHome ? '' : `/${p.slug}`, title: (l) => pick(p.seo?.title, l) || (p.isHome ? pick(settings.tagline, l) || pick(p.title, l) : pick(p.title, l)), description: (l) => pick(p.seo?.description, l) });
}
if (settings.modules.services) {
  routes.push({ path: '/services', title: (l) => (l === 'fa' ? 'خدمات' : 'Services') });
  for (const s of services) routes.push({ path: `/services/${s.slug}`, title: (l) => pick(s.title, l), description: (l) => pick(s.summary, l), image: s.imageUrl });
}
if (settings.modules.products) {
  routes.push({ path: '/products', title: (l) => (l === 'fa' ? 'مجموعه' : 'Collection') });
  for (const p of products) routes.push({ path: `/products/${p.slug}`, title: (l) => pick(p.name, l), description: (l) => pick(p.description, l), image: p.imageUrl });
}

let count = 0;
for (const route of routes) {
  for (const locale of settings.locales) {
    const prefix = locale === 'fa' ? '/fa' : '';
    const urlPath = `${prefix}${route.path}` || '/';
    const title = settings.seo.titleTemplate.replace('%s', route.title(locale));
    const description = route.description?.(locale) || pick(settings.seo.defaultDescription, locale);
    const en = `${ORIGIN}${route.path || '/'}`;
    const fa = `${ORIGIN}/fa${route.path}`;
    const head = [
      `<title>${esc(title)}</title>`,
      `<meta name="description" content="${esc(description)}" />`,
      `<link rel="canonical" href="${esc(locale === 'fa' ? fa : en)}" />`,
      `<link rel="alternate" hreflang="en" href="${esc(en)}" />`,
      `<link rel="alternate" hreflang="fa" href="${esc(fa)}" />`,
      `<link rel="alternate" hreflang="x-default" href="${esc(en)}" />`,
      `<meta property="og:title" content="${esc(title)}" />`,
      `<meta property="og:description" content="${esc(description)}" />`,
      `<meta property="og:url" content="${esc(locale === 'fa' ? fa : en)}" />`,
      `<meta property="og:locale" content="${locale === 'fa' ? 'fa_IR' : 'en_US'}" />`,
      route.image ? `<meta property="og:image" content="${esc(route.image)}" />` : '',
    ]
      .filter(Boolean)
      .join('\n    ');
    const html = template
      .replace(/<html lang="[^"]*" dir="[^"]*">/, `<html lang="${locale}" dir="${locale === 'fa' ? 'rtl' : 'ltr'}">`)
      .replace(/<title>[\s\S]*?<\/title>/, '')
      .replace(/<meta name="description"[^>]*>/, '')
      .replace('</head>', `    ${head}\n  </head>`);
    const out = path.join(dist, ...urlPath.split('/').filter(Boolean), 'index.html');
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, html);
    count++;
  }
}

await writeFile(path.join(dist, 'sitemap.xml'), await get('/sitemap.xml'));
await writeFile(path.join(dist, 'robots.txt'), `User-agent: *\nDisallow: /admin\nDisallow: /checkout\nDisallow: /cart\nSitemap: ${ORIGIN}/sitemap.xml\n`);
console.log(`[prerender] wrote ${count} pages, sitemap.xml and robots.txt for ${SITE}`);
