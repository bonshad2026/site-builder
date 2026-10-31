// Preview & deploy: http://admin.localhost/deploy/ (studio operators only).
// Sites are built in the shared studio. This service packages one site for a client's own
// server: an isolated, build-only install package, or a design update for an installed site.
// No npm dependencies.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

const env = process.env;
const REPO = env.REPO_DIR || '/repo';
const DATA = env.DATA_DIR || '/data';
const SITES = join(DATA, 'sites');
const EXPORTS = env.EXPORTS_DIR || '/exports';
const EXPORT_HOST_DIR = env.EXPORT_DIR || 'exports';
const STUDIO_API = env.STUDIO_API || 'http://studio-api:4000';
const STUDIO_DB = 'sb-studio-db';
const STUDIO_API_CONTAINER = 'sb-studio-api';
const STUDIO_URL = 'http://admin.localhost';
mkdirSync(SITES, { recursive: true });

/* ---------- helpers ---------- */

const hex = (n) => randomBytes(n).toString('hex');
const password = () => `Sb${hex(9)}7`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/** Runs a shell script; output goes to the job log. Resolves with the exit code. */
function sh(script, logFile) {
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', script], { env: { ...env, NPM_REGISTRY: env.NPM_REGISTRY ?? '' } });
    const take = (d) => logFile && appendFileSync(logFile, d);
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('close', resolve);
    child.on('error', (err) => {
      take(String(err));
      resolve(1);
    });
  });
}

/** Runs a shell script and returns its stdout (trimmed); stderr goes to the job log. */
function capture(script, logFile) {
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', script]);
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => logFile && appendFileSync(logFile, d));
    child.on('close', (code) => resolve(code === 0 ? out.trim() : null));
  });
}

/** Runs a shell script with stdout written to `outFile`. */
function shTo(script, outFile, logFile) {
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', script]);
    const out = createWriteStream(outFile);
    child.stdout.pipe(out);
    child.stderr.on('data', (d) => appendFileSync(logFile, d));
    child.on('close', (code) => out.end(() => resolve(code)));
  });
}

function readEnvFile(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
}
const writeEnvFile = (file, obj) => writeFileSync(file, Object.entries(obj).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });

const siteDir = (slug) => join(SITES, slug);
function meta(slug, patch) {
  mkdirSync(siteDir(slug), { recursive: true });
  const file = join(siteDir(slug), 'meta.json');
  const m = { ...(existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}), ...(patch ?? {}) };
  if (patch) writeFileSync(file, JSON.stringify(m, null, 2));
  return m;
}

/**
 * The site's own secrets on the client's server: created at its first package and reused by
 * later ones, so a design update matches the installed site. (Earlier per-site cells' secrets
 * are carried over, keeping the same owner password.)
 */
function deploySecrets(site, operatorEmail) {
  const file = join(siteDir(site.slug), 'deploy.env');
  const existing = readEnvFile(file);
  if (existing.TENANT_SECRETS_KEY) return existing;
  const old = readEnvFile(join(DATA, 'cells', site.slug, 'cell.env'));
  const s = {
    CELL_SLUG: site.slug,
    CELL_NAME: site.name,
    // Sign-in on the client's server (set in deploy/.env; change them before a real delivery).
    CELL_OPERATOR_EMAIL: env.SITE_OPERATOR_LOGIN || operatorEmail,
    CELL_OPERATOR_PASSWORD: env.SITE_OPERATOR_PASSWORD || old.CELL_OPERATOR_PASSWORD || password(),
    CELL_OWNER_EMAIL: env.SITE_OWNER_LOGIN || site.ownerEmail || old.CELL_OWNER_EMAIL || `owner@${site.slug}.example.com`,
    CELL_OWNER_PASSWORD: env.SITE_OWNER_PASSWORD || old.CELL_OWNER_PASSWORD || password(),
    CELL_SSO_SECRET: old.CELL_SSO_SECRET || hex(32),
    POSTGRES_PASSWORD: old.POSTGRES_PASSWORD || hex(16),
    SB_API_DB_PASSWORD: old.SB_API_DB_PASSWORD || hex(16),
    TENANT_SECRETS_KEY: old.TENANT_SECRETS_KEY || randomBytes(32).toString('base64'),
    STORAGE_SIGNING_KEY: old.STORAGE_SIGNING_KEY || hex(32),
  };
  mkdirSync(siteDir(site.slug), { recursive: true });
  writeEnvFile(file, s);
  return s;
}

/* ---------- packaging ---------- */

/** One packaging job at a time, across all sites (builds share images and the machine). */
let running = null;
const stampNow = () => new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');

async function job(site, kind, operatorEmail) {
  const { slug } = site;
  if (running) return;
  running = { slug, kind, name: site.name };
  const log = join(siteDir(slug), 'job.log');
  const stamp = stampNow();
  const name = kind === 'install' ? `${slug}-${stamp}` : `${slug}-update-${stamp}`;
  const work = join(EXPORTS, `.tmp-${name}`);
  const dir = join(work, name);
  const apiImage = `sb-api-runtime:${stamp}`;
  const webImage = `sb-web-static-${slug}:${stamp}`;
  const npmArg = `--build-arg NPM_REGISTRY=${q(env.NPM_REGISTRY ?? '')}`;
  mkdirSync(siteDir(slug), { recursive: true });
  writeFileSync(log, `== ${kind === 'install' ? 'install package' : 'design update'} ${new Date().toISOString()}\n`);
  meta(slug, { job: kind, jobStatus: 'running' });
  const step = async (label, fn) => {
    appendFileSync(log, `\n-- ${label}\n`);
    const code = await fn();
    if (code !== 0) throw new Error(`${label} failed (${code})`);
  };
  const cleanup = [];
  try {
    const secrets = deploySecrets(site, operatorEmail);
    mkdirSync(join(dir, 'data'), { recursive: true });
    mkdirSync(join(dir, 'images'), { recursive: true });
    mkdirSync(join(work, 'web/apps/web/scripts'), { recursive: true });

    // Build output only: compiled API image and the static site (no builder, no source).
    await step('build API', () => sh(`docker build --target api-runtime -t ${apiImage} ${npmArg} ${REPO}`, log));
    await step('build site', () => sh(`docker build --target web-static -t ${webImage} ${npmArg} --build-arg VITE_SITE_ID=${slug} ${REPO}`, log));
    await step('save API image', () => sh(`docker save ${apiImage} | gzip > ${dir}/images/api.tar.gz`, log));
    await step('copy site', () =>
      sh(`id=$(docker create ${webImage}) && docker cp $id:/app/apps/web/dist ${work}/web/apps/web/dist && docker rm $id >/dev/null && docker image rm ${webImage} >/dev/null`, log),
    );
    await step('prerender', () =>
      sh(
        `cp ${REPO}/apps/web/scripts/prerender.mjs ${work}/web/apps/web/scripts/ && cd ${work}/web/apps/web/scripts && ` +
          `VITE_API_URL=${STUDIO_API} VITE_SITE_ID=${slug} SITE_URL=http://sb-site-url.invalid node prerender.mjs && ` +
          `mv ${work}/web/apps/web/dist ${dir}/site && rm -rf ${work}/web`,
        log,
      ),
    );
    // The site's uploaded files (paths keep the studio's site id; the database refers to them by path).
    await step('files', () =>
      shTo(
        `docker exec ${STUDIO_API_CONTAINER} sh -c 'cd /data/uploads && set -- $(ls -d public/tenants/${site.id} private/tenants/${site.id} 2>/dev/null); ` +
          `if [ $# -gt 0 ]; then tar -czf - "$@"; else mkdir -p /tmp/empty && tar -czf - -C /tmp/empty .; fi'`,
        join(dir, 'data', kind === 'install' ? 'uploads.tar.gz' : 'files.tar.gz'),
        log,
      ),
    );

    if (kind === 'install') {
      // A fresh database server for this site alone: created by the delivery image itself
      // (new keys and accounts), then filled with the site's data from the studio.
      const net = `sb-export-${slug}`;
      const db = `sb-export-${slug}-db`;
      const tmpEnv = join(work, 'bootstrap.env');
      writeEnvFile(tmpEnv, {
        ...secrets,
        NODE_ENV: 'development',
        CONTROL_DATABASE_URL: `postgres://sb_api:${secrets.SB_API_DB_PASSWORD}@${db}:5432/sb_control`,
        PG_ADMIN_URL: `postgres://sb_admin:${secrets.POSTGRES_PASSWORD}@${db}:5432/postgres`,
        TENANT_DB_HOST: db,
        TENANT_DB_PORT: '5432',
        STORAGE_LOCAL_DIR: '/tmp/uploads',
      });
      cleanup.push(`docker rm -f ${db} >/dev/null 2>&1; docker network rm ${net} >/dev/null 2>&1`);
      await step('database server', () =>
        sh(
          `docker network create --internal ${net} >/dev/null && docker run -d --name ${db} --network ${net} -e POSTGRES_USER=sb_admin ` +
            `-e POSTGRES_PASSWORD=${secrets.POSTGRES_PASSWORD} -e POSTGRES_DB=postgres postgres:16-alpine >/dev/null && ` +
            `for i in $(seq 1 60); do docker exec ${db} pg_isready -h 127.0.0.1 -U sb_admin >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1`,
          log,
        ),
      );
      await step('accounts and site', () =>
        sh(`docker run --rm --network ${net} --env-file ${tmpEnv} ${apiImage} sh -c 'cd /app/apps/api && node dist/cli.js migrate && node dist/cell-bootstrap.js'`, log),
      );
      const targetDb = await capture(`docker exec ${db} psql -U sb_admin -d sb_control -tAc "SELECT db_name FROM tenants WHERE slug = '${slug}'"`, log);
      if (!targetDb) throw new Error('site database not found');
      await step('site data', () =>
        sh(
          `T=$(docker exec ${db} psql -U sb_admin -d ${targetDb} -tAc "SELECT string_agg(format('public.%I', tablename), ', ') FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'") && ` +
            `{ echo "SET session_replication_role = replica;"; echo "TRUNCATE $T CASCADE;"; ` +
            `docker exec ${STUDIO_DB} pg_dump -U sb_admin -d ${site.dbName} --data-only --exclude-table=schema_migrations; } ` +
            `| docker exec -i ${db} psql -U sb_admin -d ${targetDb} -v ON_ERROR_STOP=1 -q >/dev/null && ` +
            `docker exec -i ${db} psql -U sb_admin -d ${targetDb} -v ON_ERROR_STOP=1 -q < ${REPO}/deploy/export/fix-sequences.sql`,
          log,
        ),
      );
      await step('database export', () => shTo(`docker exec ${db} pg_dumpall -U sb_admin`, join(dir, 'data/db.sql'), log));
      await sh(cleanup.pop(), log);
      await step('server files', () =>
        sh(
          `cd ${REPO}/deploy/export && cp docker-compose.yml Caddyfile README.md install.sh install.ps1 install.cmd ${dir}/ && cp restore-db.sh ${dir}/data/ && chmod 755 ${dir}/install.sh ${dir}/data/restore-db.sh`,
          log,
        ),
      );
      const keep = ['CELL_SLUG', 'CELL_NAME', 'CELL_SSO_SECRET', 'CELL_OPERATOR_EMAIL', 'CELL_OPERATOR_PASSWORD', 'CELL_OWNER_EMAIL', 'CELL_OWNER_PASSWORD', 'POSTGRES_PASSWORD', 'SB_API_DB_PASSWORD', 'TENANT_SECRETS_KEY', 'STORAGE_SIGNING_KEY'];
      writeFileSync(
        join(dir, '.env'),
        [
          '# ---- Set by the installer (or edit by hand) ----',
          `DOMAIN=${slug}.example.com`,
          `SITE_URL=https://${slug}.example.com`,
          'NODE_ENV=production',
          'EMAIL_PROVIDER=smtp',
          'SMTP_URL=',
          `EMAIL_FROM=${site.name} <no-reply@${slug}.example.com>`,
          'SMS_PROVIDER=kavenegar',
          'KAVENEGAR_API_KEY=',
          'KAVENEGAR_OTP_TEMPLATE=',
          'HTTP_PORT=80',
          'HTTPS_PORT=443',
          '',
          '# ---- This site: keep as they are ----',
          `API_IMAGE=${apiImage}`,
          `OLD_SITE_URL=${STUDIO_URL}`,
          ...keep.map((k) => `${k}=${secrets[k] ?? ''}`),
          '',
        ].join('\n'),
        { mode: 0o600 },
      );
    } else {
      // Design only: pages, their versions, design settings and new files. The client's own data
      // (catalog, enquiries, orders, contact details, accounts) is left as it is.
      await step('design', () =>
        shTo(
          `D=${site.dbName}; echo "BEGIN;"; echo "SET session_replication_role = replica;"; echo "TRUNCATE public.page_versions, public.pages;"; ` +
            `docker exec ${STUDIO_DB} pg_dump -U sb_admin -d $D --data-only -t public.pages -t public.page_versions && ` +
            `docker exec ${STUDIO_DB} pg_dump -U sb_admin -d $D --data-only --inserts --on-conflict-do-nothing -t public.assets && ` +
            // Content tables are design: their definitions replace the client's. Items are the
            // client's content and stay; a table that is new to the client gets the studio's items.
            `echo "CREATE TEMP TABLE _known_collections AS SELECT id FROM public.collections;" && ` +
            `docker exec ${STUDIO_DB} psql -U sb_admin -d $D -tAc "SELECT format('INSERT INTO public.collections (id, slug, name, item_name, fields, detail_page, image_field, commerce, request_type, position) VALUES (%L, %L, %L, %L, %L, %L, %L, %L, %L, %s) ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, name = EXCLUDED.name, item_name = EXCLUDED.item_name, fields = EXCLUDED.fields, detail_page = EXCLUDED.detail_page, image_field = EXCLUDED.image_field, commerce = EXCLUDED.commerce, request_type = EXCLUDED.request_type, position = EXCLUDED.position, updated_at = now();', id, slug, name, item_name, fields, detail_page, image_field, commerce, request_type, position) FROM collections" && ` +
            `docker exec ${STUDIO_DB} psql -U sb_admin -d $D -tAc "SELECT format('DELETE FROM public.collections WHERE id <> ALL (%L::uuid[]);', coalesce(array_agg(id), '{}')) FROM collections" && ` +
            `docker exec ${STUDIO_DB} psql -U sb_admin -d $D -tAc "SELECT format('INSERT INTO public.collection_items (id, collection_id, slug, title, data, status, position) SELECT %L, %L, %L, %L, %L, %L, %s WHERE %L::uuid NOT IN (SELECT id FROM _known_collections) ON CONFLICT DO NOTHING;', id, collection_id, slug, title, data, status, position, collection_id) FROM collection_items" && ` +
            `docker exec ${STUDIO_DB} psql -U sb_admin -d $D -tAc "SELECT format('UPDATE public.site_settings SET settings = %1\\$L::jsonb || jsonb_strip_nulls(jsonb_build_object(''name'', settings->''name'', ''tagline'', settings->''tagline'', ''logoAssetId'', settings->''logoAssetId'', ''logoUrl'', settings->''logoUrl'', ''contact'', settings->''contact'', ''productCategories'', settings->''productCategories'')), updated_at = now() WHERE id = 1;', settings::text) FROM site_settings WHERE id = 1" && ` +
            `cat ${REPO}/deploy/export/fix-sequences.sql && echo "COMMIT;"`,
          join(dir, 'data/design.sql'),
          log,
        ),
      );
      await step('update files', () =>
        sh(`cd ${REPO}/deploy/export && cp update.sh update.ps1 update.cmd ${dir}/ && cp UPDATE.md ${dir}/README.md && chmod 755 ${dir}/update.sh`, log),
      );
      writeFileSync(join(dir, 'update.env'), [`CELL_SLUG=${slug}`, `API_IMAGE=${apiImage}`, `OLD_SITE_URL=${STUDIO_URL}`, ''].join('\n'));
    }

    await sh(`docker image rm ${apiImage} >/dev/null 2>&1`, log);
    await step('archive', () => sh(`tar -C ${work} -czf ${EXPORTS}/${name}.tar.gz ${name} && rm -rf ${work}`, log));
    appendFileSync(log, `\n== done: ${EXPORT_HOST_DIR}/${name}.tar.gz\n`);
    meta(slug, { jobStatus: 'done', [kind === 'install' ? 'lastInstall' : 'lastUpdate']: `${name}.tar.gz`, [kind === 'install' ? 'lastInstallAt' : 'lastUpdateAt']: new Date().toISOString() });
  } catch (err) {
    appendFileSync(log, `\n== FAILED: ${err.message}\n`);
    for (const c of cleanup) await sh(c, log);
    await sh(`rm -rf ${work}; docker image rm ${apiImage} ${webImage} >/dev/null 2>&1`, log);
    meta(slug, { jobStatus: 'failed' });
  } finally {
    running = null;
  }
}

/* ---------- studio access ---------- */

async function studio(req, path) {
  try {
    const res = await fetch(`${STUDIO_API}${path}`, { headers: { cookie: req.headers.cookie ?? '' } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function operator(req) {
  const me = await studio(req, '/api/v1/auth/me');
  return me?.data?.user?.isPlatformAdmin ? me.data.user : null;
}

async function sites(req) {
  return ((await studio(req, '/api/v1/platform/tenants?pageSize=100'))?.data ?? []).filter((s) => s.status === 'active');
}

/* ---------- page ---------- */

const STYLE = `
:root{--bg:#f6f4ef;--card:#fff;--ink:#1d1b18;--muted:#6b665e;--line:#e4dfd5;--accent:#1d1b18;--ok:#2f7d4f;--bad:#b3261e;--warn:#9a6700}
@media (prefers-color-scheme:dark){:root{--bg:#141311;--card:#1d1b18;--ink:#f1ede6;--muted:#a39d93;--line:#34312c;--accent:#f1ede6;--ok:#6fcf97;--bad:#f28b82;--warn:#f2c94c}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 Tahoma,system-ui,sans-serif}
main{max-width:1040px;margin:0 auto;padding:24px 16px}header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:20px}
h1{font-size:20px;margin:0}h2{font-size:16px;margin:0 0 12px}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;margin-bottom:16px;overflow-x:auto}
table{width:100%;border-collapse:collapse}th,td{text-align:start;padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:normal;font-size:13px}
a{color:inherit}.btn{display:inline-block;border:1px solid var(--line);background:transparent;color:var(--ink);border-radius:8px;padding:5px 10px;font:inherit;font-size:13px;cursor:pointer;text-decoration:none;margin:2px}
.btn.primary{background:var(--accent);color:var(--bg);border-color:var(--accent)}.ok{color:var(--ok)}.bad{color:var(--bad)}.warn{color:var(--warn)}
code,.mono{font-family:ui-monospace,Consolas,monospace;font-size:12.5px;direction:ltr;unicode-bidi:embed}.muted{color:var(--muted);font-size:13px}
pre{background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px;max-height:420px;overflow:auto;direction:ltr;font-size:12px;white-space:pre-wrap}form.inline{display:inline}`;

const page = (title, body, refresh = false) => `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${refresh ? '<meta http-equiv="refresh" content="5">' : ''}<title>${esc(title)}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;

function dashboard(list) {
  const rows = list.map((s) => {
    const m = meta(s.slug);
    const d = readEnvFile(join(siteDir(s.slug), 'deploy.env'));
    const state =
      m.jobStatus === 'running'
        ? `<span class="warn">در حال ساخت ${m.job === 'install' ? 'بسته‌ی نصب' : 'به‌روزرسانی'}…</span>`
        : m.jobStatus === 'failed'
          ? '<span class="bad">خطا در آخرین عملیات</span>'
          : '';
    const preview = `http://${s.slug}.preview.localhost`;
    return `<tr><td><strong>${esc(s.name)}</strong><br><code>${esc(s.slug)}</code><br>${state}</td>
<td><a class="btn primary" href="/admin/sites/${esc(s.slug)}/pages">ساخت و ویرایش</a> <a class="btn" href="${preview}" target="_blank">پیش‌نمایش</a><br><a class="mono muted" href="${preview}" target="_blank">${preview}</a></td>
<td><form class="inline" method="post" action="/deploy/sites/${esc(s.slug)}/install"><button class="btn"${running ? ' disabled' : ''}>بسته‌ی نصب کامل</button></form>
<form class="inline" method="post" action="/deploy/sites/${esc(s.slug)}/update"><button class="btn"${running ? ' disabled' : ''}>بسته‌ی به‌روزرسانی طراحی</button></form>
<a class="btn" href="/deploy/sites/${esc(s.slug)}/log">لاگ</a>
${m.lastInstall ? `<div class="muted">نصب: <code>${esc(EXPORT_HOST_DIR)}/${esc(m.lastInstall)}</code> ${when(m.lastInstallAt)}</div>` : ''}
${m.lastUpdate ? `<div class="muted">به‌روزرسانی: <code>${esc(EXPORT_HOST_DIR)}/${esc(m.lastUpdate)}</code> ${when(m.lastUpdateAt)}</div>` : ''}</td>
<td class="mono">${d.CELL_OWNER_EMAIL ? `${esc(d.CELL_OWNER_EMAIL)}<br>${esc(d.CELL_OWNER_PASSWORD)}` : '<span class="muted">با اولین بسته ساخته می‌شود</span>'}</td></tr>`;
  });
  return page(
    'پیش‌نمایش و استقرار',
    `<header><h1>پیش‌نمایش و استقرار</h1><a class="btn" href="/admin/platform/sites">بازگشت به پنل</a></header>
${running ? `<div class="card warn">در حال ساخت ${running.kind === 'install' ? 'بسته‌ی نصب' : 'بسته‌ی به‌روزرسانی'} برای «${esc(running.name)}»… تا پایان آن، ساخت بسته‌ی دیگری ممکن نیست.</div>` : ''}
<div class="card">${
      list.length
        ? `<table><thead><tr><th>سایت</th><th>ساخت و پیش‌نمایش</th><th>استقرار روی سرور مشتری</th><th>ورود مشتری روی سرور خودش</th></tr></thead><tbody>${rows.join('')}</tbody></table>`
        : '<p class="muted">هنوز سایتی ساخته نشده است. از «سایت مشتریان» در پنل یک سایت بسازید.</p>'
    }</div>
<div class="card muted"><p><strong>بسته‌ی نصب کامل:</strong> برای اولین نصب روی سرور مشتری. شامل سایت، داده‌ها و installer (لینوکس و ویندوز).</p>
<p><strong>بسته‌ی به‌روزرسانی طراحی:</strong> برای سایتی که قبلاً نصب شده. صفحه‌ها، طراحی و نسخه‌ی برنامه را عوض می‌کند؛ محصولات، سفارش‌ها، پیام‌ها، حساب‌ها، نام، لوگو، اطلاعات تماس و دسته‌بندی‌هایی که مشتری تنظیم کرده دست نمی‌خورند.</p>
<p class="warn"><strong>توجه:</strong> متن و عکس‌هایی که مشتری روی سرور خودش در صفحه‌ها عوض کرده، با به‌روزرسانی طراحی با نسخه‌ی استودیو جایگزین می‌شوند.</p>
<p>پیش‌نمایش، نسخه‌ی منتشرشده (Publish) هر سایت در استودیو را نشان می‌دهد؛ همان چیزی که در بسته قرار می‌گیرد.</p></div>`,
    !!running,
  );
}

const when = (iso) => (iso ? `<span class="muted">(${esc(new Date(iso).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' }))})</span>` : '');

/** Asks before building a package that would supersede an earlier one. */
function confirmPage(site, kind, previous, at) {
  const what = kind === 'install' ? 'بسته‌ی نصب کامل' : 'بسته‌ی به‌روزرسانی طراحی';
  return page(
    'تأیید ساخت دوباره',
    `<header><h1>${what}: ${esc(site.name)}</h1></header>
<div class="card"><p class="warn">برای این سایت قبلاً ${what} ساخته شده است:</p>
<p><code>${esc(EXPORT_HOST_DIR)}/${esc(previous)}</code> ${when(at)}</p>
<p>اگر از آن زمان در استودیو تغییری نداده‌اید، همان بسته کافی است. بسته‌ی قبلی پاک نمی‌شود.</p>
${kind === 'install' ? '<p class="warn">اگر این سایت قبلاً روی سرور مشتری نصب شده، برای اعمال تغییرات از «بسته‌ی به‌روزرسانی طراحی» استفاده کنید؛ نصب دوباره داده‌های مشتری را جایگزین می‌کند.</p>' : ''}
<form method="post" action="/deploy/sites/${esc(site.slug)}/${kind}"><input type="hidden" name="confirm" value="1">
<button class="btn primary">بله، بسته‌ی جدید بساز</button> <a class="btn" href="/deploy/">انصراف</a></form></div>`,
  );
}

async function formBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 4000) break;
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

/* ---------- server ---------- */

const send = (res, status, html, headers = {}) => {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'x-frame-options': 'DENY', 'cache-control': 'no-store', ...headers });
  res.end(html);
};
const redirect = (res, to) => send(res, 303, '', { location: to });

createServer(async (req, res) => {
  try {
    const path = new URL(req.url, STUDIO_URL).pathname;
    const user = await operator(req);
    if (!user) return redirect(res, `/admin/login?next=${encodeURIComponent('/deploy/')}`);
    const list = await sites(req);

    if (path === '/deploy/' && req.method === 'GET') return send(res, 200, dashboard(list));

    const m = /^\/deploy\/sites\/([a-z0-9-]+)\/(install|update|log)$/.exec(path);
    const site = m && list.find((s) => s.slug === m[1]);
    if (m && !site) return send(res, 404, page('یافت نشد', '<p>سایت یافت نشد.</p>'));
    if (m && m[2] === 'log' && req.method === 'GET') {
      const log = existsSync(join(siteDir(site.slug), 'job.log')) ? readFileSync(join(siteDir(site.slug), 'job.log'), 'utf8') : '';
      return send(
        res,
        200,
        page(`لاگ ${site.slug}`, `<header><h1>لاگ ${esc(site.name)}</h1><a class="btn" href="/deploy/">بازگشت</a></header><div class="card"><pre>${esc(log.slice(-20000))}</pre></div>`, meta(site.slug).jobStatus === 'running'),
      );
    }
    if (m && req.method === 'POST') {
      const f = await formBody(req);
      if (running) {
        return send(res, 409, page('در حال ساخت', `<div class="card warn">ساخت بسته برای «${esc(running.name)}» در جریان است. پس از پایان آن دوباره تلاش کنید.</div><a class="btn" href="/deploy/">بازگشت</a>`));
      }
      const mt = meta(site.slug);
      const previous = m[2] === 'install' ? mt.lastInstall : mt.lastUpdate;
      if (previous && f.confirm !== '1') return send(res, 200, confirmPage(site, m[2], previous, m[2] === 'install' ? mt.lastInstallAt : mt.lastUpdateAt));
      void job(site, m[2], user.email);
      return redirect(res, '/deploy/');
    }
    send(res, 404, page('یافت نشد', '<p>صفحه یافت نشد.</p>'));
  } catch (err) {
    console.error(err);
    send(res, 500, page('خطا', '<p class="bad">خطای داخلی.</p>'));
  }
}).listen(8080, () => {
  console.log('deploy service on :8080');
  // A restart interrupts any running packaging job.
  for (const slug of readdirSync(SITES)) if (meta(slug).jobStatus === 'running') meta(slug, { jobStatus: 'failed' });
});
