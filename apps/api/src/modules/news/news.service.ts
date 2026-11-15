import type { AppContext } from '../../context.js';

/** One headline from another website; the title links back to it. */
export interface NewsItem {
  title: string;
  url: string;
  /** ISO date when the source gives one (feeds do, news-list pages usually do not). */
  date: string | null;
  source: { en: string; fa: string };
}

export interface NewsSource {
  name: { en: string; fa: string };
  feedUrl: string;
  linkPattern: string;
}

const CACHE_MS = 30 * 60_000;
const MAX_BYTES = 2_000_000;
const cache = new Map<string, { at: number; items: Omit<NewsItem, 'source'>[] }>();

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', zwnj: '‌' };
function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}
// CDATA is unwrapped before tags are dropped, or `<![CDATA[…]]>` would go with them.
const plain = (html: string) => decode(html.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))?.[1];

/** Items of an RSS or Atom document, newest first. */
export function parseFeed(xml: string): Omit<NewsItem, 'source'>[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  const items = blocks.map((b) => {
    const title = plain(tag(b, 'title') ?? '');
    const url = decode((tag(b, 'link') ?? b.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? '').trim());
    const raw = tag(b, 'pubDate') ?? tag(b, 'published') ?? tag(b, 'updated') ?? tag(b, 'dc:date');
    const time = raw ? Date.parse(plain(raw)) : NaN;
    return { title, url, date: Number.isNaN(time) ? null : new Date(time).toISOString() };
  });
  return items.filter((i) => i.title && /^https?:\/\//i.test(i.url)).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
}

/**
 * Article links of a news-list page, in page order: links on the same site whose address
 * contains `pattern` (or, without one, that look like articles: a deep path and a real title).
 */
export function parseLinks(html: string, base: string, pattern: string): Omit<NewsItem, 'source'>[] {
  const host = new URL(base).host;
  const seen = new Map<string, string>();
  for (const m of html.matchAll(/<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: URL;
    try {
      url = new URL(decode(m[1]), base);
    } catch {
      continue;
    }
    if (url.host !== host || !/^https?:$/.test(url.protocol)) continue;
    url.hash = '';
    const href = url.toString();
    let path = url.pathname;
    try {
      path = decodeURIComponent(path);
    } catch {
      // Keep the encoded path.
    }
    if (pattern ? !(href.includes(pattern) || path.includes(pattern)) : path.split('/').filter(Boolean).length < 2) continue;
    let title = plain(m[2]);
    // Image links have no text: the address's last part often is the headline.
    if (title.length < 8) title = (path.split('/').filter(Boolean).pop() ?? '').replace(/\.\w+$/, '').replace(/^\d+[-_]/, '').replace(/[-_]+/g, ' ').trim();
    if (title.length < (pattern ? 8 : 15)) continue;
    if ((seen.get(href)?.length ?? 0) < title.length) seen.set(href, title);
  }
  return [...seen].map(([url, title]) => ({ title, url, date: null }));
}

/** Refuses addresses on this machine or a private network (the server fetches them). */
function publicHost(url: URL): boolean {
  const h = url.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.')) return false;
  if (/^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h.startsWith('[')) return false;
  return true;
}

async function fetchSource(ctx: AppContext, s: NewsSource): Promise<Omit<NewsItem, 'source'>[]> {
  const key = `${s.feedUrl}|${s.linkPattern}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.items;
  let items: Omit<NewsItem, 'source'>[] = [];
  try {
    const url = new URL(s.feedUrl);
    if (!/^https?:$/.test(url.protocol) || !publicHost(url)) return [];
    const res = await (ctx.httpFetch ?? fetch)(url, { signal: AbortSignal.timeout(10_000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; SiteBuilderNews/1.0)', accept: 'application/rss+xml, application/atom+xml, text/html;q=0.9, */*;q=0.5' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = (await res.text()).slice(0, MAX_BYTES);
    const isFeed = /<(rss|feed|rdf:RDF)[\s>]/i.test(text.slice(0, 2000));
    items = isFeed ? parseFeed(text) : parseLinks(text, res.url || s.feedUrl, s.linkPattern);
  } catch (err) {
    ctx.log.warn(`news source ${s.feedUrl} unavailable (${(err as Error).message})`);
    // A failing source keeps showing its last headlines for a while.
    if (hit) return hit.items;
  }
  cache.set(key, { at: Date.now(), items });
  return items;
}

/** Headlines from every source, taken in turns so one busy source does not crowd out the rest. */
export async function loadNews(ctx: AppContext, sources: NewsSource[], count: number): Promise<NewsItem[]> {
  const lists = await Promise.all(sources.filter((s) => s.feedUrl).map(async (s) => (await fetchSource(ctx, s)).map((i) => ({ ...i, source: s.name }))));
  const out: NewsItem[] = [];
  for (let i = 0; out.length < count && lists.some((l) => i < l.length); i++) for (const l of lists) if (l[i] && out.length < count) out.push(l[i]);
  return out;
}
