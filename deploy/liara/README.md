# Single-site Liara deployment

A client site runs as one Liara Docker app on port80: Caddy serves the client web and /admin,
and proxies /api and /files to the compiled API on4000 in the same container. Liara terminates
HTTPS. PostgreSQL runs as a separate Liara service in the same private network. Persistent
uploads mount at /data/uploads; the remaining runtime filesystem may be read-only (/tmp is writable).
The studio builder is not shipped. Client web uses same-origin API.

## Required resources
- Docker app and PostgreSQL16 on the same private network.
- A PostgreSQL admin role able to create roles/databases and set session_replication_role.
- App disk named uploads, mounted at /data/uploads.
- Domain attached to that app, with DNS verification and HTTPS active.

The current workflow is operator-assisted; the current deploy dashboard builds install/update
packages but does not expose the older branch's Liara deployment button.

## Build-output context
Prepare a fresh ignored exports/<site>-liara-<stamp>/ directory containing these four template
files (Dockerfile, Caddyfile, start.mjs, README.md), plus:
- app.tar.gz: tar of /app from the current compiled api-runtime image. This preserves workspace
  symlinks and production node_modules, which Liara's source uploader otherwise excludes.
- caddy: /usr/bin/caddy from the installed Caddy2 image/container; Dockerfile sets executable mode.
- site/: matching client web build with VITE_SITE_ID=<slug>, VITE_ADMIN_SCOPE=client,
  VITE_API_URL=same-origin. Prerender separately against the site/studio API and placeholder
  SITE_URL=http://sb-site-url.invalid; no source maps.
- data/site.sql: tenant pg_dump --data-only --column-inserts --rows-per-insert=200, excluding
  schema_migrations, customer_sessions and customer_codes. Explicit columns are essential:
  old deliveries can have a different physical column order even with the same logical schema.
- data/uploads.tar.gz: uploaded files from the same source snapshot.
- data/fix-sequences.sql: from deploy/export/.
- data/messaging.json: optional encrypted control app_settings.messaging value. It requires
  the source's unchanged TENANT_SECRETS_KEY and is never printed or committed.

Never put an .env, API token or plaintext credentials in the uploaded build context.

## Runtime settings
Store secrets in Liara environment variables through authenticated API/CLI, reading the saved
local configuration without printing it. Required keys:
NODE_ENV=production, CELL_SLUG, CELL_NAME, CELL_OPERATOR_EMAIL, CELL_OPERATOR_PASSWORD,
CELL_OWNER_EMAIL, CELL_OWNER_PASSWORD, CELL_SSO_SECRET, SB_API_DB_PASSWORD,
TENANT_SECRETS_KEY, STORAGE_SIGNING_KEY, SITE_URL=https://<domain>, OLD_SITE_URL=<source-origin>,
DB_HOST, DB_PORT, DB_USER, DB_PASSWORD (DB_NAME defaults postgres).
Keep the source encryption/signing identity when transferring its encrypted data/files.
No tenant password or database URL has to be embedded in the static client web.

The launcher derives sb_control_<slug> and sb_t_<slug>, private roles and API URLs. It migrates
and bootstraps the site, then imports data/files only when the uploads disk marker is absent
and control metadata records a pending first import. A tenant database existing without this
control record is refused. Import is transactional; first-import state supports retry after
rollback. A successful import writes .site-data-loaded on the attached disk. Subsequent starts
keep business data, files and the saved messaging settings; ordinary redeployment updates code
and web only, not existing database design/content. Reconcile design changes separately.

## Deploy
Use the official @liara/cli (tested9.6.3). From the prepared context:

```text
liara deploy --app <app> --platform docker --port 80 --disks uploads:/data/uploads --detach
```

Use saved CLI auth or pass its token through a private orchestration script; do not print it.
After the release becomes ready, check /fa, /admin and one authenticated admin session on the
real domain. Do not send test SMS/orders/requests unless specifically requested.

## Firefighter deployment record
The first target is app firefighter on network sites, PostgreSQL sb-demo-db, domain
fire.tibasoft.ir and uploads0.5GB. See docs/clients/firefighter/README.md and docs/STATUS.md
for the live outcome, package path and remaining limits.
## Upgrading an existing tenant
An existing cloud control/tenant database is authoritative even if the Liara app has not yet
had a successful release. It must not be treated as a blank install. Set APPLY_DESIGN_UPDATE=true
only for an intended published-design update and include data/design.sql (SQL inserts with named
columns, not psql COPY data). Full initial data import is skipped for an existing tenant.

The design script replaces pages/versions, upserts asset and collection definitions, adds items
only for new collections, and merges design settings while preserving client identity/contact,
categories and notifications. Existing customer/order/request/item rows are retained. Existing
collections are not deleted by this operator-assisted Liara update. Wrap design SQL in BEGIN/COMMIT.
The launcher stores a delivery_design_revision fingerprint in the control DB; unchanged revisions
are skipped on restarts so client edits are not continually overwritten. New assets merge into
the uploads disk. Before each new design revision, all tenant table rows are saved as a private
0600 JSON snapshot under /data/uploads/.deployment-backups/before-<revision>.json. This is data,
not a provider-level PostgreSQL backup, and is not served by the public website.

Historical migration010: the launcher accepts only the known exact CRLF variant of current
010_shop_extras.sql (LF sha256 b139accf6600cec7303576f2573b55ae059a8942dc91e4826857401f533bff11).
It verifies the current file converted to CRLF equals the stored checksum, then aligns the
ledger before migration. Any other mismatch still fails; no applied SQL file is changed/rerun.
Record this when rolling back to a legacy image, which may expect the old checksum.
## CLI upload fallback
During the firefighter deployment, CLI9.6.3 source upload failed twice after the initial upload
had succeeded. Do not loop the same failing command. Native Node FormData/Blob multipart with
an explicit file length succeeded against POST /v2/projects/<app>/sources (field file), returning
sourceID. POST /v2/projects/<app>/releases then accepted sourceID, type=docker, port=80,
build={cache:true,location:iran}, disks=[{name:uploads,mountTo:/data/uploads}] and a release message.
This is the same official API used by the CLI. Keep auth in memory, redact diagnostics and
poll GET /v1/projects/<app>/releases until the actual release is READY, then check the live origin.
Do not equate upload success or app ACTIVE with a healthy deployment.