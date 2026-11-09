import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const env = process.env;
const need = (key) => { if (!env[key]) throw new Error(`${key} is required`); return env[key]; };
const slug = need('CELL_SLUG');
if (!/^[a-z][a-z0-9-]{1,39}$/.test(slug)) throw new Error('Invalid site slug');
const origin = new URL(need('SITE_URL')).origin;
const oldOrigins = [env.OLD_SITE_URL, 'http://admin.localhost', `http://${slug}.preview.localhost`, 'http://sb-site-url.invalid'].filter(Boolean);
const db = { host: need('DB_HOST'), port: env.DB_PORT || '5432', user: need('DB_USER'), password: need('DB_PASSWORD'), name: env.DB_NAME || 'postgres' };
const connection = (user, password, database) => `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${db.host}:${db.port}/${database}`;
const id = slug.replaceAll('-', '_');
Object.assign(env, {
  PORT: '4000', TRUST_PROXY: 'loopback, uniquelocal',
  CONTROL_DATABASE_URL: connection(`sb_api_${id}`, need('SB_API_DB_PASSWORD'), `sb_control_${id}`),
  PG_ADMIN_URL: connection(db.user, db.password, db.name),
  TENANT_DB_HOST: db.host, TENANT_DB_PORT: db.port,
  STORAGE_DRIVER: 'local', STORAGE_LOCAL_DIR: '/data/uploads',
  PUBLIC_API_URL: origin, WEB_APP_URL: origin, CORS_ORIGINS: origin,
  EMAIL_PROVIDER: 'panel', SMS_PROVIDER: 'panel',
});
const run = (command, args) => execFileSync(command, args, { stdio: 'inherit', env });
const remap = (text) => oldOrigins.reduce((value, old) => value.replaceAll(old, origin), text);
const uploads = '/data/uploads';
const marker = join(uploads, '.site-data-loaded');
mkdirSync(uploads, { recursive: true });

// The only writable locations are the attached uploads disk and /tmp.
rmSync('/tmp/site', { recursive: true, force: true });
cpSync('/site', '/tmp/site', { recursive: true });
function fill(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) fill(path);
    else if (/\.(html|js|xml|txt)$/.test(name)) {
      const before = readFileSync(path, 'utf8');
      const after = remap(before);
      if (before !== after) writeFileSync(path, after);
    }
  }
}
fill('/tmp/site');
const pg = createRequire('/app/apps/api/package.json')('pg');
const hash = (value) => createHash('sha256').update(value).digest('hex');
// One historical delivery wrote 010 with CRLF. Accept only its verified exact equivalent.
const root = new pg.Client({ connectionString: env.PG_ADMIN_URL });
await root.connect();
try {
  const hasControl = await root.query('SELECT 1 FROM pg_database WHERE datname=$1',['sb_control_'+id]);
  if (hasControl.rowCount) {
    const control = new pg.Client({ connectionString: env.CONTROL_DATABASE_URL });
    await control.connect();
    try {
      const hasTenants = (await control.query("SELECT to_regclass('public.tenants') AS name")).rows[0].name;
      const tenant = hasTenants && (await control.query('SELECT db_name FROM tenants WHERE slug=$1',[slug])).rows[0];
      if (tenant) {
        const site = new pg.Client({connectionString:connection(db.user,db.password,tenant.db_name)});
        await site.connect();
        try {
          const old = (await site.query("SELECT checksum FROM schema_migrations WHERE name='010_shop_extras.sql'")).rows[0];
          const sql = readFileSync('/app/apps/api/dist/database/tenant/migrations/010_shop_extras.sql','utf8');
          const current = hash(sql), windows = hash(sql.replace(/\r?\n/g,'\r\n'));
          if (old?.checksum===windows && current==='b139accf6600cec7303576f2573b55ae059a8942dc91e4826857401f533bff11' && current!==windows) {
            await site.query("UPDATE schema_migrations SET checksum=$1 WHERE name='010_shop_extras.sql' AND checksum=$2",[current,windows]);
            console.log('Legacy 010 line-ending equivalence verified; checksum aligned');
          }
        } finally {await site.end();}
      }
    } finally {await control.end();}
  }
} finally {await root.end();}
run('node', ['dist/cli.js', 'migrate']);
// Record a pending first import before bootstrap creates its editable starter pages.
const initialControl = new pg.Client({ connectionString: env.CONTROL_DATABASE_URL });
await initialControl.connect();
try {
  const existing = await initialControl.query('SELECT 1 FROM tenants WHERE slug=$1', [slug]);
  if (!existing.rowCount) {
    const admin = new pg.Client({ connectionString: env.PG_ADMIN_URL });
    await admin.connect();
    try {
      const orphan = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', ['sb_t_'+id]);
      if (orphan.rowCount) throw new Error('Target tenant database already exists without this control record; refusing to overwrite');
    } finally { await admin.end(); }
    await initialControl.query("INSERT INTO app_settings(key,value) VALUES('delivery_initial_import',$1) ON CONFLICT(key) DO NOTHING", [{ state:'pending', slug }]);
  }
} finally { await initialControl.end(); }
run('node', ['dist/cell-bootstrap.js']);

if (!existsSync(marker)) {
  const control = new pg.Client({ connectionString: env.CONTROL_DATABASE_URL });
  await control.connect();
  try {
    const tenant = (await control.query('SELECT db_name FROM tenants WHERE slug=$1', [slug])).rows[0];
    if (!tenant) throw new Error('Site database not found');
    const site = new pg.Client({ connectionString: connection(db.user, db.password, tenant.db_name) });
    await site.connect();
    try {
      // An absent disk marker must never cause existing customer content to be replaced.
      const state = (await control.query("SELECT value FROM app_settings WHERE key='delivery_initial_import'")).rows[0]?.value;
      if (state?.state !== 'pending' || state.slug !== slug) {
        if (env.APPLY_DESIGN_UPDATE !== 'true') throw new Error('Existing database requires an explicit design update; refusing full import');
        console.log('Existing tenant data retained; full initial import skipped');
      } else {
      const sql = remap(readFileSync('/restore/site.sql', 'utf8').replace(/^\\(un)?restrict \S+\r?$/gm, ''));
      const tables = (await site.query("SELECT string_agg(format('public.%I',tablename),', ') AS names FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations'")).rows[0].names;
      await site.query('BEGIN');
      try {
        await site.query(`SET LOCAL session_replication_role=replica; TRUNCATE ${tables} CASCADE;`);
        await site.query(sql);
        await site.query(readFileSync('/restore/fix-sequences.sql','utf8'));
        await site.query('COMMIT');
      } catch (error) { await site.query('ROLLBACK'); throw error; }
      }
    } finally { await site.end(); }
    if (existsSync('/restore/messaging.json')) {
      const messaging = JSON.parse(readFileSync('/restore/messaging.json','utf8'));
      if (messaging) await control.query("INSERT INTO app_settings(key,value) VALUES('messaging',$1) ON CONFLICT(key) DO NOTHING",[messaging]);
    }
    run('tar', ['-xzf', '/restore/uploads.tar.gz', '-C', uploads]);
    await control.query("UPDATE app_settings SET value=$1,updated_at=now() WHERE key='delivery_initial_import'",[{state:'complete',slug}]);
    writeFileSync(marker, new Date().toISOString());
    console.log('Site files ready; existing business data retained when present');
  } finally { await control.end(); }
}
// A design revision is applied once; later restarts preserve client content edits.
if (env.APPLY_DESIGN_UPDATE==='true' && existsSync('/restore/design.sql')) {
  const sql = remap(readFileSync('/restore/design.sql','utf8').replace(/^\\(un)?restrict \S+\r?$/gm,''));
  const revision = hash(sql);
  const control = new pg.Client({connectionString:env.CONTROL_DATABASE_URL});
  await control.connect();
  try {
    const previous = (await control.query("SELECT value FROM app_settings WHERE key='delivery_design_revision'")).rows[0]?.value;
    if (previous?.revision!==revision) {
      const tenant = (await control.query('SELECT db_name FROM tenants WHERE slug=$1',[slug])).rows[0];
      const site = new pg.Client({connectionString:connection(db.user,db.password,tenant.db_name)});
      await site.connect();
      try {
        run('tar',['-xzf','/restore/uploads.tar.gz','-C',uploads]);
        const backupDir = join(uploads,'.deployment-backups');
        mkdirSync(backupDir,{recursive:true});
        const backupFile = join(backupDir,'before-'+revision+'.json');
        if (!existsSync(backupFile)) {
          const snapshot = {};
          const tables = (await site.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
          for (const {tablename} of tables) {
            const identifier = '"'+tablename.replaceAll('"','""')+'"';
            snapshot[tablename] = (await site.query('SELECT * FROM public.'+identifier)).rows;
          }
          writeFileSync(backupFile,JSON.stringify(snapshot),{mode:0o600});
          console.log('Private pre-update tenant data snapshot saved');
        }
        await site.query(sql);
      } finally {await site.end();}
      await control.query("INSERT INTO app_settings(key,value) VALUES('delivery_design_revision',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()",[{revision}]);
      console.log('Published design revision applied; business data retained');
    }
  } finally {await control.end();}
}
const children = [
  spawn('caddy', ['run','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'], {stdio:'inherit',env}),
  spawn('node', ['dist/server.js'], {stdio:'inherit',env}),
];
for (const child of children) child.on('exit', (code) => process.exit(code ?? 1));
for (const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>children.forEach((child)=>child.kill(signal)));