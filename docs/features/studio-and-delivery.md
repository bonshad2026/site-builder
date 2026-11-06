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
