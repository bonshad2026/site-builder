#!/usr/bin/env node
/**
 * Builds docs/dev/index.html: the whole developer guide (docs/dev/**\/*.md) in one page that opens
 * with a double click, with a chapter menu, search, right-to-left Persian text and Mermaid diagrams.
 * The Markdown is converted here, so the text needs no network; only the diagrams load mermaid from
 * a CDN, and show as code when it cannot be reached. No npm dependencies.
 *   node tools/dev-docs/build.mjs        (or: npm run docs:html)
 * Run it after editing any page of the guide, and commit the result with the pages.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../docs/dev');
const out = path.join(root, 'index.html');

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : [];
  });
const rel = (p) => path.relative(root, p).split(path.sep).join('/');

/** Heading anchors as GitHub makes them (lowercase, punctuation dropped, spaces to hyphens). */
export const slugOf = (text) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A link as the page should follow it: guide pages stay inside this page, other files open from disk. */
function hrefFor(link, fromFile) {
  if (/^[a-z]+:/i.test(link)) return { href: link, external: true };
  const [file, anchor] = link.split('#');
  const target = file ? path.resolve(path.dirname(fromFile), file) : fromFile;
  const inside = !path.relative(root, target).startsWith('..');
  if (inside && target.endsWith('.md')) return { href: `#${rel(target)}${anchor ? `::${anchor}` : ''}` };
  return { href: path.relative(root, target).split(path.sep).join('/') + (anchor ? `#${anchor}` : '') };
}

/** Inline Markdown: `code`, **bold**, [links](…). Everything else is plain, escaped text. */
function inline(text, fromFile) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = escapeHtml(s);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, link) => {
    const { href, external } = hrefFor(link.replace(/&amp;/g, '&'), fromFile);
    return `<a href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
  });
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(codes[Number(i)])}</code>`);
}

/** Table cells, keeping a `|` inside code spans. */
function cells(row) {
  const parts = [];
  let cur = '';
  let inCode = false;
  for (const ch of row.trim().replace(/^\||\|$/g, '')) {
    if (ch === '`') inCode = !inCode;
    if (ch === '|' && !inCode) {
      parts.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  parts.push(cur.trim());
  return parts;
}

const indentOf = (line) => line.match(/^ */)[0].length;
const LIST_ITEM = /^( *)([-*]|\d+\.) +(.*)$/;

/** Block Markdown, as used in this guide: headings, paragraphs, lists, tables, quotes, code, Mermaid. */
function blocks(lines, fromFile, headings) {
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = line.match(/^```(\w*)/);
    if (fence) {
      const body = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) body.push(lines[i]);
      i++;
      const code = escapeHtml(body.join('\n'));
      html.push(fence[1] === 'mermaid' ? `<pre class="mermaid">${code}</pre>` : `<pre dir="ltr" class="code"><code>${code}</code></pre>`);
      continue;
    }
    const heading = line.match(/^(#{1,4}) +(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const id = slugOf(heading[2]);
      if (headings && level > 1) headings.push({ level, id, text: heading[2].replace(/`/g, '') });
      html.push(`<h${level} id="${escapeHtml(id)}">${inline(heading[2], fromFile)}</h${level}>`);
      i++;
      continue;
    }
    if (line.startsWith('>')) {
      const body = [];
      for (; i < lines.length && lines[i].startsWith('>'); i++) body.push(lines[i].replace(/^> ?/, ''));
      html.push(`<blockquote>${blocks(body, fromFile)}</blockquote>`);
      continue;
    }
    if (line.startsWith('|') && lines[i + 1]?.match(/^\|[\s:|-]+\|$/)) {
      const head = cells(line);
      const rows = [];
      for (i += 2; i < lines.length && lines[i].startsWith('|'); i++) rows.push(cells(lines[i]));
      html.push(
        `<div class="table"><table><thead><tr>${head.map((c) => `<th>${inline(c, fromFile)}</th>`).join('')}</tr></thead><tbody>` +
          rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, fromFile)}</td>`).join('')}</tr>`).join('') +
          '</tbody></table></div>',
      );
      continue;
    }
    const item = line.match(LIST_ITEM);
    if (item) {
      const base = item[1].length;
      const ordered = /\d/.test(item[2]);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(LIST_ITEM);
        if (!m || m[1].length !== base || /\d/.test(m[2]) !== ordered) break;
        // The item: its first line, then every following line indented past the marker (or blank).
        const body = [m[3]];
        for (i++; i < lines.length; i++) {
          const l = lines[i];
          if (l.trim() && indentOf(l) <= base) break;
          if (!l.trim() && (!lines[i + 1]?.trim() || indentOf(lines[i + 1]) <= base)) break;
          body.push(l.slice(Math.min(indentOf(l), base + m[2].length + 1)));
        }
        while (i < lines.length && !lines[i].trim() && lines[i + 1]?.match(LIST_ITEM)?.[1].length === base) i++;
        const inner = blocks(body, fromFile);
        items.push(`<li>${inner.replace(/^<p>([\s\S]*?)<\/p>/, '$1')}</li>`);
      }
      html.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    const para = [];
    for (; i < lines.length && lines[i].trim() && !/^(```|#{1,4} |>|\|)/.test(lines[i]) && !LIST_ITEM.test(lines[i]); i++) para.push(lines[i].trim());
    html.push(`<p>${inline(para.join(' '), fromFile)}</p>`);
  }
  return html.join('\n');
}

/** The chapter menu, in the order of the index page (README.md): its ### headings and their links. */
function menu(readme) {
  const chapters = [];
  for (const line of readFileSync(readme, 'utf8').split('\n')) {
    const h = line.match(/^### +(.*)$/);
    if (h) chapters.push({ title: h[1], pages: [] });
    const link = line.match(/^\| \[([^\]]+)\]\(([^)]+\.md)\)/);
    if (link && chapters.length) chapters.at(-1).pages.push({ title: link[1], path: rel(path.resolve(root, link[2])) });
  }
  return chapters;
}

const pages = walk(root)
  .sort()
  .map((file) => {
    const source = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const headings = [];
    const html = blocks(source.split('\n'), file, headings);
    const title = source.match(/^# +(.*)$/m)?.[1] ?? rel(file);
    const text = source.replace(/```[\s\S]*?```/g, ' ').replace(/[`*#|>[\]()-]/g, ' ').replace(/\s+/g, ' ');
    return { path: rel(file), title, html, text, headings };
  });

const data = JSON.stringify({ pages, chapters: menu(path.join(root, 'README.md')), built: new Date().toISOString().slice(0, 10) }).replace(/</g, '\\u003c');

const page = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>مستندات فنی Site Builder</title>
<!-- Generated by tools/dev-docs/build.mjs from docs/dev/**/*.md. Do not edit by hand. -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#fbfaf7;--panel:#f3f1ec;--ink:#22211f;--soft:#6b6862;--line:#dedad2;--accent:#1f6f5c;--code:#efece5;--mark:#fff1b8}
@media (prefers-color-scheme:dark){:root{--bg:#1b1b1a;--panel:#232321;--ink:#e9e6df;--soft:#a7a39b;--line:#3a3935;--accent:#6fcfb3;--code:#2b2a27;--mark:#5a4b10}}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.85 Vazirmatn,Tahoma,"Segoe UI",sans-serif}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.layout{display:flex;min-height:100vh}
nav{width:300px;flex:none;background:var(--panel);border-inline-end:1px solid var(--line);padding:16px;position:sticky;top:0;height:100vh;overflow:auto}
nav h1{font-size:17px;margin:0 0 12px}
nav input{width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);font:inherit;font-size:14px}
nav .chapter{margin:14px 0 4px;font-size:13px;color:var(--soft);font-weight:600}
nav a{display:block;padding:3px 8px;border-radius:6px;font-size:14px;color:var(--ink)}
nav a.active{background:var(--bg);color:var(--accent);font-weight:600}
nav .result small{display:block;color:var(--soft);font-size:12px}
nav .meta{margin-top:18px;font-size:12px;color:var(--soft)}
main{flex:1;min-width:0;overflow-wrap:anywhere;padding:28px 40px 80px;max-width:980px}
main h1{font-size:28px;margin:0 0 12px;border-bottom:1px solid var(--line);padding-bottom:8px}
main h2{font-size:21px;margin:34px 0 10px;border-bottom:1px solid var(--line);padding-bottom:4px}
main h3{font-size:17px;margin:24px 0 8px}
code{font-family:Consolas,"Cascadia Mono",monospace;font-size:.86em;background:var(--code);padding:1px 5px;border-radius:4px;direction:ltr;unicode-bidi:isolate}
pre.code{direction:ltr;text-align:left;background:var(--code);border:1px solid var(--line);border-radius:8px;padding:12px 14px;overflow:auto;font-size:13.5px;line-height:1.6}
pre.code code{background:none;padding:0;font-size:inherit}
pre.mermaid{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:12px;overflow:auto;direction:ltr;text-align:center}
pre.mermaid.raw{text-align:left;font-family:Consolas,monospace;font-size:13px}
blockquote{margin:0 0 16px;padding:4px 14px;border-inline-start:4px solid var(--line);color:var(--soft);font-size:14px}
blockquote p{margin:4px 0}
.table{overflow-x:auto;margin:12px 0}
table{border-collapse:collapse;width:100%;font-size:14.5px}
th,td{border:1px solid var(--line);padding:6px 10px;vertical-align:top;text-align:start}
th{background:var(--panel)}
li{margin:3px 0}
mark{background:var(--mark);color:inherit}
.toc{font-size:13px;margin:0 0 20px;padding:8px 14px;background:var(--panel);border-radius:8px}
.toc a{margin-inline-end:14px;white-space:nowrap}
.menu-btn{display:none}
@media (max-width:820px){
  nav{display:none;position:fixed;inset-block:0;inset-inline-start:0;z-index:5;width:85vw;padding-top:56px;box-shadow:0 0 24px rgba(0,0,0,.25)}
  nav.open{display:block}
  main{padding:56px 16px 60px}
  .menu-btn{display:block;position:fixed;top:10px;inset-inline-start:10px;z-index:6;padding:6px 12px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--ink);font:inherit}
}
@media print{nav,.menu-btn,.toc{display:none}main{max-width:none;padding:0}}
</style>
</head>
<body>
<button class="menu-btn" id="menuBtn">☰ فهرست</button>
<div class="layout">
<nav id="nav">
  <h1>مستندات فنی Site Builder</h1>
  <input id="q" type="search" placeholder="جست‌وجو در همهٔ صفحه‌ها…" autocomplete="off">
  <div id="links"></div>
  <div class="meta" id="meta"></div>
</nav>
<main id="page"></main>
</div>
<script>
const DATA = ${data};
const byPath = new Map(DATA.pages.map((p) => [p.path, p]));
const nav = document.getElementById('nav');
const links = document.getElementById('links');
const main = document.getElementById('page');
const q = document.getElementById('q');
document.getElementById('meta').textContent = 'ساخته‌شده در ' + DATA.built + ' از docs/dev';
document.getElementById('menuBtn').onclick = () => nav.classList.toggle('open');

function menuHtml() {
  const home = '<a href="#README.md" data-path="README.md">فهرست و ترتیب خواندن</a>';
  return home + DATA.chapters.map((c) => '<div class="chapter">' + c.title + '</div>' + c.pages.map((p) => '<a href="#' + p.path + '" data-path="' + p.path + '">' + p.title + '</a>').join('')).join('');
}

function search(term) {
  if (!term.trim()) { links.innerHTML = menuHtml(); markActive(); return; }
  const words = term.trim().toLowerCase().split(/\\s+/);
  const hits = DATA.pages.filter((p) => words.every((w) => (p.title + ' ' + p.text).toLowerCase().includes(w)));
  links.innerHTML = hits.length
    ? hits.map((p) => { const i = p.text.toLowerCase().indexOf(words[0]); const snip = p.text.slice(Math.max(0, i - 30), i + 60); return '<a class="result" href="#' + p.path + '" data-path="' + p.path + '">' + p.title + '<small>…' + snip.replace(/</g, '&lt;') + '…</small></a>'; }).join('')
    : '<p style="font-size:14px;color:var(--soft)">چیزی پیدا نشد.</p>';
  markActive();
}

function markActive() {
  const current = (location.hash.slice(1).split('::')[0]) || 'README.md';
  links.querySelectorAll('a').forEach((a) => a.classList.toggle('active', decodeURIComponent(a.dataset.path) === decodeURIComponent(current)));
}

function highlight(term) {
  if (!term.trim()) return;
  const words = term.trim().split(/\\s+/).filter((w) => w.length > 1);
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) if (!walker.currentNode.parentElement.closest('pre')) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const text = node.nodeValue;
    const lower = text.toLowerCase();
    const w = words.find((x) => lower.includes(x.toLowerCase()));
    if (!w) continue;
    const at = lower.indexOf(w.toLowerCase());
    const mark = document.createElement('mark');
    const rest = node.splitText(at);
    rest.splitText(w.length);
    mark.textContent = rest.nodeValue;
    rest.replaceWith(mark);
  }
  main.querySelector('mark')?.scrollIntoView({ block: 'center' });
}

async function show() {
  const [file, anchor] = decodeURIComponent(location.hash.slice(1)).split('::');
  const page = byPath.get(file || 'README.md') || byPath.get('README.md');
  const toc = page.headings.filter((h) => h.level === 2);
  main.innerHTML = page.html.replace(/<\\/h1>/, (m) => m + (toc.length > 2 ? '<div class="toc">' + toc.map((h) => '<a href="#' + page.path + '::' + h.id + '">' + h.text + '</a>').join(' ') + '</div>' : ''));
  document.title = page.title + ' — مستندات فنی';
  markActive();
  nav.classList.remove('open');
  await drawDiagrams();
  if (anchor) document.getElementById(anchor)?.scrollIntoView();
  else if (q.value.trim()) highlight(q.value);
  else window.scrollTo(0, 0);
}

let mermaidReady = null;
function loadMermaid() {
  mermaidReady ??= new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js';
    s.onload = () => { window.mermaid.initialize({ startOnLoad: false, theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default', fontFamily: 'Vazirmatn, Tahoma, sans-serif' }); resolve(window.mermaid); };
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return mermaidReady;
}
async function drawDiagrams() {
  const blocks = main.querySelectorAll('pre.mermaid');
  if (!blocks.length) return;
  const mermaid = await loadMermaid();
  if (!mermaid) { blocks.forEach((b) => { b.classList.add('raw'); b.title = 'برای دیدن نمودار، اینترنت لازم است'; }); return; }
  try { await mermaid.run({ nodes: blocks }); } catch { blocks.forEach((b) => b.classList.add('raw')); }
}

q.addEventListener('input', () => search(q.value));
q.addEventListener('keydown', (e) => { if (e.key === 'Enter') links.querySelector('a')?.click(); });
addEventListener('hashchange', show);
links.innerHTML = menuHtml();
show();
</script>
</body>
</html>
`;

writeFileSync(out, page);
console.log(`docs/dev/index.html: ${pages.length} pages`);
