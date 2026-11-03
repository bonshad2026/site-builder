// Start-up of one client site on Liara: fills in the derived settings, restores the site's
// files and data on the first start, then runs Caddy (port 80) and the API (port 4000).
// Liara keeps only the disk mounted at /data/uploads; everything else is rebuilt each start.
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const env = process.env;
const need = (k) => {
  if (!env[k]) throw new Error(`${k} is not set (Liara app → Environment variables)`);
  return env[k];
};
const slug = need('CELL_SLUG');
const siteUrl = need('SITE_URL').replace(/\/$/, '');
const oldUrl = env.OLD_SITE_URL || 'http://admin.localhost';
const db = { host: need('DB_HOST'), port: env.DB_PORT || '5432', user: need('DB_USER'), password: need('DB_PASSWORD'), name: env.DB_NAME || 'postgres' };
const url = (user, pw, name) => `postgres://${encodeURIComponent(user)}:${encodeURIComponent(pw)}@${db.host}:${db.port}/${name}`;
// One Liara database server can hold several sites: each gets its own control database and role.
const id = slug.replace(/-/g, '_');

Object.assign(env, {
  PORT: '4000',
  TRUST_PROXY: env.TRUST_PROXY || 'loopback, uniquelocal',
  CONTROL_DATABASE_URL: url(`sb_api_${id}`, need('SB_API_DB_PASSWORD'), `sb_control_${id}`),
  PG_ADMIN_URL: url(db.user, db.password, db.name),
  TENANT_DB_HOST: db.host,
  TENANT_DB_PORT: db.port,
  STORAGE_DRIVER: 'local',
  STORAGE_LOCAL_DIR: '/data/uploads',
  PUBLIC_API_URL: siteUrl,
  WEB_APP_URL: siteUrl,
  CORS_ORIGINS: siteUrl,
  EMAIL_PROVIDER: env.EMAIL_PROVIDER || 'panel',
  SMS_PROVIDER: env.SMS_PROVIDER || 'panel',
});

const UPLOADS = '/data/uploads';
const LOADED = join(UPLOADS, '.site-data-loaded');
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', env });

// Uploaded files: unpacked once, onto the empty disk.
if (!readdirSync(UPLOADS).some((f) => f !== 'lost+found' && !f.startsWith('.'))) {
  console.log('restoring uploaded files');
  run('tar', ['-xzf', '/restore/uploads.tar.gz', '-C', UPLOADS]);
}

// The built site has placeholder addresses; serve a copy with the real one filled in.
rmSync('/srv/site', { recursive: true, force: true });
cpSync('/site', '/srv/site', { recursive: true });
const fill = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) fill(p);
    else if (/\.(js|html|xml|txt)$/.test(f)) {
      const text = readFileSync(p, 'utf8');
      const next = text.replaceAll('http://sb-site-url.invalid', siteUrl).replaceAll(oldUrl, siteUrl);
      if (next !== text) writeFileSync(p, next);
    }
  }
};
fill('/srv/site');

// Database: control database, accounts and the empty site (safe to re-run).
run('node', ['dist/cli.js', 'migrate']);
run('node', ['dist/cell-bootstrap.js']);

// The site's data from the studio, once. Needs the server's admin (superuser) role.
if (!existsSync(LOADED)) {
  const pg = createRequire('/app/apps/api/package.json')('pg');
  const admin = new pg.Client({ connectionString: env.PG_ADMIN_URL });
  await admin.connect();
  const su = (await admin.query('SELECT rolsuper FROM pg_roles WHERE rolname = current_user')).rows[0]?.rolsuper;
  const control = new pg.Client({ connectionString: env.CONTROL_DATABASE_URL });
  await control.connect();
  const dbName = (await control.query('SELECT db_name FROM tenants WHERE slug = $1', [slug])).rows[0]?.db_name;
  await control.end();
  await admin.end();
  if (!su) throw new Error(`${db.user} is not a superuser; the site's data cannot be loaded`);
  if (!dbName) throw new Error('site database not found');

  console.log('loading site data');
  const site = new pg.Client({ connectionString: url(db.user, db.password, dbName) });
  await site.connect();
  const tables = (await site.query(`SELECT string_agg(format('public.%I', tablename), ', ') AS t FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`)).rows[0].t;
  // pg_dump's \restrict lines are psql commands, not SQL.
  const data = readFileSync('/restore/site.sql', 'utf8').replace(/^\\(un)?restrict \S+$/gm, '').replaceAll(oldUrl, siteUrl);
  await site.query(`BEGIN; SET LOCAL session_replication_role = replica; TRUNCATE ${tables} CASCADE;\n${data}\nCOMMIT;`);
  await site.query(readFileSync('/restore/fix-sequences.sql', 'utf8'));
  await site.end();
  writeFileSync(LOADED, new Date().toISOString());
  console.log('site data loaded');
}

// Caddy and the API; if either stops, the container stops and Liara restarts it.
const children = [spawn('caddy', ['run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'], { stdio: 'inherit', env }), spawn('node', ['dist/server.js'], { stdio: 'inherit', env })];
for (const c of children) c.on('exit', (code) => process.exit(code ?? 1));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => children.forEach((c) => c.kill(sig)));
