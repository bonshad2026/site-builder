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
  if (a.dir === 'app') fs.copyFileSync('tools/cafe-mohammad/apple-touch-icon.png', path.join(site, 'apple-touch-icon.png'));
  const url = `${origin}/downloads/${a.dir}/`;
  const ios = a.dir === 'app' ? `
<button type="button" id="ios-install" class="ios-button">نصب روی آیفون</button>
<dialog id="ios-guide" aria-labelledby="ios-title">
  <button type="button" id="ios-close" class="close" aria-label="بستن راهنما">×</button>
  <h2 id="ios-title">کافه محمد روی آیفون</h2>
  <p class="intro">سایت را در Safari باز کنید و به صفحهٔ اصلی گوشی اضافه کنید.</p>
  <ol class="steps">
    <li><span class="step-icon" aria-hidden="true">۱</span><div><strong>سایت را در Safari باز کنید</strong><a class="site-link" href="${origin}/fa" target="_blank" rel="noopener">بازکردن سایت کافه</a><p>مراحل بعد را روی صفحهٔ سایت انجام دهید، نه این صفحهٔ دانلود.</p></div></li>
    <li><span class="step-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 8H5v13h14V8h-3M12 15V2m-4 4 4-4 4 4"/></svg></span><div><strong>دکمهٔ اشتراک‌گذاری را بزنید</strong><p>در Safari، منوی <bdi>Share</bdi> با نشان مربع و فلش رو به بالا را باز کنید.</p></div></li>
    <li><span class="step-icon" aria-hidden="true">＋</span><div><strong>افزودن به صفحهٔ اصلی</strong><p><bdi>Add to Home Screen</bdi> را انتخاب کنید. اگر <bdi>Open as Web App</bdi> نمایش داده شد، روشنش کنید؛ سپس <bdi>Add</bdi> را بزنید.</p></div></li>
  </ol>
  <aside class="browser-note">داخل تلگرام یا اینستاگرام هستید؟ از منوی ⋯ گزینهٔ <bdi>Open in Safari</bdi> را بزنید. اگر نبود، نشانی زیر را کپی کنید و در Safari باز کنید.</aside>
  <div class="copy-row"><input id="ios-url" aria-label="نشانی سایت کافه" readonly dir="ltr" value="${origin}/fa"><button id="ios-copy" type="button">کپی لینک</button></div>
  <p id="ios-copy-status" role="status"></p>
</dialog>
<script>
(function(){
  var button=document.getElementById('ios-install'),dialog=document.getElementById('ios-guide');
  function close(){if(dialog.close)dialog.close();else dialog.removeAttribute('open');button.focus();}
  button.addEventListener('click',function(){if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');});
  document.getElementById('ios-close').addEventListener('click',close);
  dialog.addEventListener('click',function(event){if(event.target===dialog){var r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
  document.getElementById('ios-copy').addEventListener('click',async function(){var input=document.getElementById('ios-url'),status=document.getElementById('ios-copy-status');try{await navigator.clipboard.writeText(input.value);status.textContent='لینک کپی شد؛ آن را در Safari باز کنید.';}catch(error){input.focus();input.select();status.textContent='نشانی را انتخاب و کپی کنید؛ سپس در Safari باز کنید.';}});
})();
</script>` : '';
  const iosStyles = a.dir === 'app' ? `
button,input{font:inherit}button{cursor:pointer}.ios-button{display:block;margin:12px auto 0;padding:14px 28px;border:1px solid #2a1d14;border-radius:12px;background:transparent;color:#2a1d14;font-weight:bold}
dialog{box-sizing:border-box;width:calc(100% - 24px);max-width:460px;max-height:88vh;max-height:88dvh;overflow:auto;border:0;border-radius:20px;padding:24px 20px;background:#faf6f0;color:#2a1d14;text-align:right;box-shadow:0 20px 70px #0005}dialog::backdrop{background:#21150fc9}.close{float:left;border:0;background:transparent;font-size:30px;line-height:1;color:#6b5a4c}h2{font-size:21px;margin:0 0 10px}.intro{font-size:14px;line-height:1.9;margin-bottom:18px}.steps{list-style:none;margin:0;padding:0;display:grid;gap:16px}.steps li{display:flex;align-items:flex-start;gap:12px}.step-icon{display:flex;flex-shrink:0;align-items:center;justify-content:center;width:38px;height:38px;border-radius:12px;background:#f6e3cc;color:#a44c15;font-size:24px}.steps strong{display:block;font-size:15px;margin-bottom:5px}.steps p{font-size:13px;line-height:1.9;margin:4px 0 0}.site-link{display:inline-block;padding:9px 12px;margin:4px 0;font-size:13px;background:#e8762b;color:white}.browser-note{margin-top:20px;padding:12px;border-radius:12px;background:#eee6db;font-size:13px;line-height:1.9}.copy-row{display:flex;gap:6px;margin-top:12px}.copy-row input{min-width:0;flex:1;border:1px solid #d8c6b1;border-radius:9px;padding:8px;font-size:11px;background:white}.copy-row button{border:0;border-radius:9px;padding:8px;background:#2a1d14;color:white;font-size:12px}#ios-copy-status{font-size:12px;margin:8px 0 0;line-height:1.8}main>p{line-height:1.8}
` : '';
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
${a.dir === 'app' ? '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=cafe-20261110">' : ''}
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#faf6f0;color:#2a1d14;font-family:Vazirmatn,Tahoma,sans-serif}
main{padding:32px 16px;text-align:center;max-width:360px}
img{width:128px;height:128px;border-radius:28px;box-shadow:0 6px 24px rgba(0,0,0,.15)}
h1{font-size:22px;margin:20px 0 8px}p{margin:0 0 24px;color:#6b5a4c}
a{display:inline-block;padding:14px 28px;border-radius:12px;background:${a.color};color:#fff;text-decoration:none;font-weight:bold}
small{display:block;margin-top:12px;color:#8a7a6c}
${iosStyles}
</style>
</head>
<body>
<main>
<img src="icon.png" alt="">
<h1>${esc(a.title)}</h1>
<p>${esc(a.text)}</p>
<a href="/downloads/${a.apk}" download>دانلود برای اندروید</a>
<small>نسخه ${a.version} اندروید</small>
${ios}
</main>
</body>
</html>
`;
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  console.log(`${url} -> ${a.apk}`);
}
