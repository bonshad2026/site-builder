// Writes link-preview download pages (/downloads/app/ and /downloads/admin/) into the cafe's
// Liara package, so a shared link shows the app's icon and name. Re-run after changing an APK.
// Usage: node tools/cafe-mohammad/download-pages.mjs [packageSiteDir]
import fs from 'node:fs';
import path from 'node:path';

const site = process.argv[2] ?? 'exports/cafe-mohammad-liara-20261108/site';
const origin = 'https://cafemohammad.tibasoft.ir';
const apps = [
  { dir: 'app', title: 'اپلیکیشن کافه محمد', text: 'منوی کافه، سفارش آنلاین و پیگیری سفارش‌ها', apk: 'cafe-mohammad-1.0.1-release.apk', version: '1.0.1', icon: 'exports/cafe-mohammad-bazaar-assets/icon-512.png', color: '#e8762b' },
  { dir: 'admin', title: 'مدیریت کافه محمد', text: 'پنل مدیریت سفارش‌ها و اعلان سفارش جدید', apk: 'cafe-mohammad-admin-1.1.1-release.apk', version: '1.1.1', icon: 'exports/cafe-mohammad-admin-icon-512.png', color: '#2a1d14' },
];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

for (const a of apps) {
  if (!fs.existsSync(path.join(site, 'downloads', a.apk))) throw Error(`Missing ${a.apk} in ${site}/downloads`);
  const dir = path.join(site, 'downloads', a.dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(a.icon, path.join(dir, 'icon.png'));
  const url = `${origin}/downloads/${a.dir}/`;
  const html = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(a.title)}</title>
<meta name="description" content="${esc(a.text)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(a.title)}">
<meta property="og:description" content="${esc(a.text)} — نسخه ${a.version} برای اندروید">
<meta property="og:image" content="${url}icon.png">
<meta property="og:image:width" content="512">
<meta property="og:image:height" content="512">
<meta name="twitter:card" content="summary">
<link rel="icon" href="icon.png">
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#faf6f0;color:#2a1d14;font-family:Vazirmatn,Tahoma,sans-serif}
main{padding:32px 16px;text-align:center;max-width:360px}
img{width:128px;height:128px;border-radius:28px;box-shadow:0 6px 24px rgba(0,0,0,.15)}
h1{font-size:22px;margin:20px 0 8px}p{margin:0 0 24px;color:#6b5a4c}
a{display:inline-block;padding:14px 28px;border-radius:12px;background:${a.color};color:#fff;text-decoration:none;font-weight:bold}
small{display:block;margin-top:12px;color:#8a7a6c}
</style>
</head>
<body>
<main>
<img src="icon.png" alt="">
<h1>${esc(a.title)}</h1>
<p>${esc(a.text)}</p>
<a href="/downloads/${a.apk}" download>دانلود برای اندروید</a>
<small>نسخه ${a.version}</small>
</main>
</body>
</html>
`;
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  console.log(`${url} -> ${a.apk}`);
}
