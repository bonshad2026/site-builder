import { describe, expect, it } from 'vitest';
import { parseFeed, parseLinks } from '../src/modules/news/news.service.js';

describe('news sources', () => {
  it('reads RSS items newest first, with CDATA and entities', () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item><title><![CDATA[Older &amp; calm]]></title><link>https://a.example/1</link><pubDate>Mon, 03 Nov 2026 10:00:00 GMT</pubDate></item>
      <item><title>Newer</title><link>https://a.example/2</link><pubDate>Tue, 04 Nov 2026 10:00:00 GMT</pubDate></item>
      <item><title>No link</title></item>
    </channel></rss>`;
    const items = parseFeed(xml);
    expect(items.map((i) => i.title)).toEqual(['Newer', 'Older & calm']);
    expect(items[0].url).toBe('https://a.example/2');
    expect(items[0].date).toBe('2026-11-04T10:00:00.000Z');
  });

  it('reads Atom entries', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom one</title><link href="https://b.example/x"/><updated>2026-11-01T00:00:00Z</updated></entry></feed>`;
    expect(parseFeed(xml)).toEqual([{ title: 'Atom one', url: 'https://b.example/x', date: '2026-11-01T00:00:00.000Z' }]);
  });

  it('keeps same-site links that match the pattern, with titles from text or the address', () => {
    const html = `
      <a href="/fa/news/11591361-مهار-حریق-در-مجتمع-مسکونی.html"><img src="x.jpg"></a>
      <a href="/fa/news/11591361-مهار-حریق-در-مجتمع-مسکونی.html">مهار حریق در مجتمع مسکونی</a>
      <a href="/fa/about">درباره ما و تاریخچه‌ی سازمان</a>
      <a href="https://other.example/fa/news/1-x.html">Another site's news headline</a>`;
    const items = parseLinks(html, 'https://125.mashhad.ir/', '/fa/news/');
    expect(items).toEqual([{ title: 'مهار حریق در مجتمع مسکونی', url: 'https://125.mashhad.ir/fa/news/11591361-%D9%85%D9%87%D8%A7%D8%B1-%D8%AD%D8%B1%DB%8C%D9%82-%D8%AF%D8%B1-%D9%85%D8%AC%D8%AA%D9%85%D8%B9-%D9%85%D8%B3%DA%A9%D9%88%D9%86%DB%8C.html', date: null }]);
  });
});
