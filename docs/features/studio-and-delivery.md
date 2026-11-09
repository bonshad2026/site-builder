# Studio and client delivery

## Studio
- `deploy/docker-compose.yml` (compose project `site-builder`): `sb-edge` (nginx, port 80, routing in
  `deploy/edge/nginx.conf`), `sb-studio-db` (Postgres), `sb-studio-api`, `sb-studio-web`, `sb-control`
  (deploy service).
- http://admin.localhost is the operator's admin; `http://<slug>.preview.localhost` shows each site
  (the web build reads the slug from the host name; `apps/web/src/features/public-site/data.ts`).
- `deploy/studio/api-start.sh` runs on every studio-api start: control and tenant migrations
  (`node dist/cli.js migrate`), the operator password from `deploy/.env`, then
  `add-sample-starters` (ready-made starters not added before).
- `SITE_PREVIEW_URL` makes links in messages and payment returns point at the site preview.
- Dev SMS and email are only logged by studio-api; the customer sign-up form shows the dev code.

## Deploy service
http://admin.localhost/deploy/ (`deploy/control/server.mjs`, no npm dependencies). Per site it builds:
- an **install package** (first delivery), or
- a **design-update package** (replaces pages, page versions, assets and design settings; keeps the
  client's name, tagline, logo, contact, categories, products, orders, leads, notifications and table items).

One job at a time; it asks before overwriting a package in `exports/`. Install packages drop sample
data (`deploy/export/drop-demo.sql`) unless "همراه داده‌ی نمونه" is ticked; design updates never send
sample items.

## Client package (`deploy/export/`)
Postgres + the built API image + Caddy serving the prerendered static site. Built JS only, no
TypeScript source. `install.sh` / `install.ps1` / `install.cmd` print the address and ports;
`update.*` applies a design update; `backup.*` / `restore*.sh` for the client's own backups.
See `deploy/export/README.md` (shipped inside each package).

On the client's server the API runs in cell mode (`CELL_SLUG` set, `src/cell-bootstrap.ts`,
`deploy/cell/api-start.sh`): the client signs in at `/admin` and edits **content only** (text and
images of existing pages, logo, contact, categories, catalog, orders, leads, payments). The API
refuses structure changes for non-operators (`clientLocked`, `contentOnlyChange` in shared
`sections.ts`; in site settings only the fields listed in `site.routes.ts` are taken from a client, so
"Site texts" (`settings.texts`) is operator-only and hidden in the client panel); the web bundle is built with `VITE_ADMIN_SCOPE=client`, which leaves out the
builder and platform pages. Operators reach a client's admin with SSO (`src/modules/auth/sso.ts`).

## Backups
- `deploy/backup/studio-backup.sh` → `backups/*.tar.gz` (databases, uploads, control data).
- `deploy/backup/studio-restore.sh <file> [--replace]` (Windows: `studio-restore.ps1 -Backup <file> [-Replace]`).
- After copying data between databases run `deploy/export/fix-sequences.sql`.

## Local Matstack preparation

deploy/matstack/ holds a dedicated Windows agent setup, an ignored .env and bin folder,
and start.ps1. It targets a separate local cafe install on 127.0.0.1:8725; it does not
change Liara or publish the studio preview. See deploy/matstack/README.md. The isolated
install and public tunnel were verified on 2026-11-06 (cafe site and public API: HTTP 200).

## Bringing a delivered site back for design work
See [studio-import.md](studio-import.md): isolated tenant provisioning, design-only data/files,
namespace remapping, compatibility validation and preservation of delivery secrets. Current
workflow is operator-assisted; the client admin remains content-only.

For older Windows deliveries, compare actual migration SQL bytes when checksum verification
blocks startup. The firefighter delivery's 010 used CRLF while current SQL uses LF; exact
line-ending equivalence was proven before aligning its recorded checksum and clone-testing
the pending migrations. Never ignore a checksum mismatch without proving the difference.

Client web builds default VITE_API_URL to same-origin: the public origin uses its public API,
while a separate loopback-only admin origin calls its own private proxy. Do not compile the
public tunnel URL as the shared bundle's API origin; its private routes are intentionally blocked.
Prerendering still receives the studio API URL separately at build time.


## One origin for the site and client admin
The website and authenticated client admin share the same origin and proxy port: /fa (or /)
and /admin. Client builds use VITE_API_URL=same-origin. This also applies to the cafe and
firefighter Matstack setups: both /admin and authenticated API routes pass through the public
site origin; there is no separate panel port. Owner explicitly approved this on 2026-11-08.
API authentication, roles and clientLocked behavior are retained. The client package still
excludes studio builder/platform UI. Standard delivery Caddy already serves both routes.
CORS_ORIGINS may override the package's SITE_URL default; local Matstack scripts include the
configured public URL and their same-port localhost/127.0.0.1 URLs. Host ports8727/8737 and
admin.compose.yml overrides are retired. Matstack forwards only8725(cafe) or8735(firefighter).


## Liara hosting
Operator-assisted single-site deployment to Liara is documented in [liara-delivery.md](liara-delivery.md)
and deploy/liara/README.md. It preserves the same client site/admin origin and uses a separate
managed PostgreSQL service and persistent uploads disk. Existing cloud data is not a fresh install.

## Live domain ownership verification

All sites can store meta.enamadCode (empty or1–30 ASCII digits; empty by default).
Admin /sites/:slug/settings?tab=extras exposes Domain ownership verification to owners as
well as operators. Saving uses existing site:write/CSRF checks. Client-locked settings permit
only this numeric meta field; arbitrary head/body code remains operator-only.

The public /api/v1/public/sites/:slug/verification-files/:filename endpoint returns an empty
text/plain200 only for the configured CODE.txt, otherwise404 (invalid filenames400).
Cache-Control:no-store applies to successes and missing codes. Tenant lookup remains scoped
to the URL's site and existing active-tenant middleware. No uploaded content or filesystem paths.

Current export/Liara/Matstack Caddy templates route root numeric .txt paths to this endpoint
before SPA/static fallback; studio nginx maps the preview hostname to its own tenant. Other
root text files such as robots.txt are unaffected. Updating/deleting a code is live and needs
no publish, prerender, rebuild or restart. Older deliveries need a one-time code/proxy update;
editing the setting alone cannot upgrade their routing. Static ownership files are superseded
by the live route, so clearing the code returns404 even if an old file is still on disk.

This verifies domain ownership only, not the other Enamad application requirements. Tests:
apps/api/test/domain-verification.test.ts (locked owner permission, tenant isolation,
uncached empty response, immediate replacement/deletion, numeric validation and authentication).

## Owner-only mobile application delivery

Each tenant has two mobile_apps slots: customer and management (migration016). Operator users
can publish/replace/withdraw APKs from /admin/sites/:slug/mobile-apps; owners see the two
download cards, versions, sizes and SHA256. Staff cannot list or download, even with ordinary
asset/site permissions. Download requires the actual owner role on every request; platform
operators manage delivery but do not use the owner download endpoint. Other tenants get404.

POST /api/v1/sites/:slug/mobile-apps/:slot uses multipart file+version, platform-admin auth/CSRF
and existing UPLOAD_MAX_BYTES limit. Shared schemas constrain slot/version. The server checks
ZIP/APK directory layout without extraction/execution; signing/package/version correctness
remains the operator build/signature-check responsibility. Files use private storage keys and
are not ordinary assets: no public or signed file URLs are returned. GET :slot/download
reads bytes only after owner authentication and sends attachment/private,no-store/SHA256.
Metadata and objects persist in tenant DB/uploads respectively, so new delivery needs no build.
DELETE :slot withdraws owner access; failed object cleanup leaves no downloadable metadata.

Current Caddy delivery templates reject root/static .apk URLs, including legacy downloads.
The authenticated API URL ends in /download and remains usable. Existing installations need
one code/web/proxy upgrade. Client API context stays tenant-scoped; package design updates
do not truncate mobile_apps. Tests: apps/api/test/mobile-apps.test.ts (publishing rights,
actual owner checks, staff/guest/cross-site rejection, private object access, independent slots,
replacement, withdrawal and byte-for-byte download).

Cafe temporarily exposes two explicitly allowlisted signed APKs publicly at owner request
(2026-11-09). That ignored client-context exception is documented in client operations; the
product default and authenticated mobile-apps download endpoints remain owner-only.

For sites with no English locale, prerender also injects the configured head code into the
root SPA fallback. This keeps verification/SDK tags in initial root/admin HTML, rather than
only /fa pages or later browser effects. The common Kavenegar worker file is present in
public outputs; it is inert unless an operator configures the SDK/appId in that site head.

## Authenticated panel SDK code
meta.adminHeadCode is operator-editable alongside public head/body code, but is never emitted
in prerendered/public HTML or public settings JSON. Locked owners cannot replace it.
AdminPanelCode mounts only inside the authenticated AdminLayout and fetches private site
settings only for the operator, owner or staff with orders:read membership on that site.
Injected nodes are removed on layout unmount; the public SiteExtras slot stays separate.
This gates SDK initialization/subscription UI, not a replacement for server-side push audience
authorization. Removing a public SDK does not automatically revoke previously created provider
subscriptions; order-to-push integration and recipient binding remain separate work.
