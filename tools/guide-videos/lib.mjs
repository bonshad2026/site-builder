// What every guide video needs: a signed-in browser that records, captions, click markers and
// highlight boxes drawn over the page, and API calls to set the studio up and put it back.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const BASE = 'http://admin.localhost';
const size = { width: 1280, height: 720 };

/** Values from deploy/.env (operator login). */
function readEnv(root) {
  const lines = readFileSync(path.join(root, 'deploy/.env'), 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l));
  return Object.fromEntries(lines.map((l) => [l.slice(0, l.indexOf('=')),l.slice(l.indexOf('=') + 1)]));
}

/**
 * Opens Edge, signs in as the studio operator in a page that is not recorded (Node cannot
 * resolve *.localhost; the browser can) and returns a recording page plus helpers.
 */
export async function startRecording({ root, outDir, video = true, viewport = size }) {
  const env = readEnv(root);
  const browser = await chromium.launch({ channel: 'msedge' });

  const setup = await browser.newContext();
  const helper = await setup.newPage();
  await helper.goto(`${BASE}/api/v1/openapi.json`);
  /** Calls the studio API as the operator; returns the HTTP status. */
  const api = (method, url, body) =>
    helper.evaluate(
      async ({ method, url, body }) => {
        const csrf = decodeURIComponent(document.cookie.match(/(?:^|;\s*)sb_csrf=([^;]+)/)?.[1] ?? '');
        const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: body === undefined ? undefined : JSON.stringify(body) });
        return r.status;
      },
      { method, url, body },
    );
  const status = await api('POST', '/api/v1/auth/login', { email: env.CONTROL_ADMIN_EMAIL, password: env.CONTROL_ADMIN_PASSWORD });
  if (status !== 200) throw new Error(`Studio sign-in failed (${status}). Is the studio running at ${BASE}?`);

  const context = await browser.newContext({
    viewport,
    ...(video ? { recordVideo: { dir: outDir, size: viewport } } : {}),
    locale: 'fa-IR',
    storageState: await setup.storageState(),
  });
  const page = await context.newPage();
  const pause = (ms) => page.waitForTimeout(ms);

  async function overlay() {
    await page.evaluate(() => {
      if (document.getElementById('guide-caption')) return;
      const style = document.createElement('style');
      style.textContent = `
        #guide-caption{position:fixed;inset-inline:0;bottom:28px;margin:auto;width:fit-content;max-width:80%;z-index:99999;
          background:rgba(20,20,20,.88);color:#fff;font:600 22px/1.6 Vazirmatn,Tahoma,sans-serif;padding:12px 28px;border-radius:14px;
          direction:rtl;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.25);transition:opacity .3s}
        .guide-ring{position:fixed;z-index:99998;width:46px;height:46px;margin:-23px 0 0 -23px;border:4px solid #f59e0b;border-radius:50%;
          pointer-events:none;animation:guide-pulse .9s ease-out 2}
        @keyframes guide-pulse{0%{transform:scale(.4);opacity:1}100%{transform:scale(1.6);opacity:0}}
        .guide-box{position:fixed;z-index:99997;border:3px solid #f59e0b;border-radius:10px;pointer-events:none;box-shadow:0 0 0 9999px rgba(0,0,0,.18)}`;
      document.head.append(style);
      const cap = document.createElement('div');
      cap.id = 'guide-caption';
      cap.style.opacity = '0';
      document.body.append(cap);
    });
  }

  const guide = {
    page,
    api,
    pause,
    /** Opens an admin address and switches the panel to Persian. */
    async open(url) {
      await page.goto(url.startsWith('http') ? url : `${BASE}${url}`);
      await page.waitForLoadState('networkidle');
      const fa = page.getByRole('button', { name: /^(فا|FA|فارسی)$/i });
      if (await fa.count()) await fa.first().click();
      await page.waitForLoadState('networkidle');
    },
    /** Shows a caption at the bottom ('' hides it). */
    async caption(text) {
      await overlay();
      await page.evaluate((t) => {
        const c = document.getElementById('guide-caption');
        c.textContent = t;
        c.style.opacity = t ? '1' : '0';
      }, text);
    },
    /** Draws a box around an element (null removes it). */
    async highlight(locator) {
      await page.evaluate(() => document.querySelectorAll('.guide-box').forEach((b) => b.remove()));
      if (!locator) return;
      const b = await locator.boundingBox();
      await page.evaluate((b) => {
        const el = document.createElement('div');
        el.className = 'guide-box';
        Object.assign(el.style, { left: `${b.x - 6}px`, top: `${b.y - 6}px`, width: `${b.width + 12}px`, height: `${b.height + 12}px` });
        document.body.append(el);
      }, b);
    },
    /** Scrolls an element into view with some room above it. */
    async show(locator) {
      await locator.scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -90));
    },
    /** Shows a ring where the click lands, then clicks. */
    async click(locator) {
      await locator.scrollIntoViewIfNeeded();
      const b = await locator.boundingBox();
      await page.evaluate(({ x, y }) => {
        const r = document.createElement('div');
        r.className = 'guide-ring';
        Object.assign(r.style, { left: `${x}px`, top: `${y}px` });
        document.body.append(r);
        setTimeout(() => r.remove(), 1900);
      }, { x: b.x + b.width / 2, y: b.y + b.height / 2 });
      await pause(700);
      await locator.click();
    },
    /** Saves a screenshot of the window as <outDir>/<name>.png (captions and boxes included). */
    async shot(name) {
      await pause(300);
      await page.screenshot({ path: `${outDir}/${name}.png` });
    },
    /** Hides the caption and boxes. */
    async clear() {
      await guide.caption('');
      await guide.highlight(null);
    },
    /** Types like a person. */
    async type(locator, text) {
      await guide.click(locator);
      await locator.pressSequentially(text, { delay: 140 });
    },
  };

  /** Stops recording; returns the path of the video file. */
  async function finish() {
    await context.close();
    return { video: video ? await page.video().path() : null, close: () => browser.close() };
  }
  return { guide, finish };
}
