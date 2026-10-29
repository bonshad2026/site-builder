# Site Builder — working notes

Read this first. It describes how the project is used today; `README.md` and `docs/` describe the
original single-stack setup (root `docker-compose.yml`), which is now legacy.

The owner writes in Persian; reply in Persian, keep code, commits and docs in English.

## How it is used
- **Studio** (`deploy/docker-compose.yml`, compose project `site-builder`): the one place where all
  client sites are built. http://admin.localhost (operator). Each site previews at
  `http://<slug>.preview.localhost`.
- **Deploy service** at http://admin.localhost/deploy/: per site, builds an **install package**
  (first delivery) or a **design-update package** into `exports/`. One job at a time; it asks for
  confirmation if a package already exists.
- **Client delivery**: an isolated stack on the client's server (`deploy/export/`): Postgres + built
  API image + Caddy serving the prerendered static site. Built JS only, no TypeScript source.
  Installers: `install.sh` / `install.ps1` / `install.cmd` (print the ports); updates:
  `update.*` (replace pages, page versions, assets and design settings; keep the client's
  name, tagline, logo, contact, categories, products, orders and leads).
- **Clients** sign in to their own server's `/admin`: they edit content only (text and images of
  existing pages, logo, contact, categories, catalog, orders, leads, payments). Structure changes
  are operator-only (`clientLocked` in the API when `CELL_SLUG` is set; `VITE_ADMIN_SCOPE=client`
  strips builder/platform code from the web bundle).

## Local development accounts (weak, local only)
- Studio operator: `admin` / `123456` (from `CONTROL_ADMIN_*` in `deploy/.env`; reset on every
  studio-api start by `deploy/studio/api-start.sh`).
- New packages: operator `admin` / `123456`, client `owner` / `123456`
  (`SITE_OPERATOR_*`, `SITE_OWNER_*` in `deploy/.env`). Use strong values for real deliveries.
- Reset any password: `docker exec sb-studio-api node dist/cli.js set-password --email <login> --password <pw> [--admin]`.

## Commands
```bash
docker compose -f deploy/docker-compose.yml up -d --build     # start / rebuild the studio
docker compose -f deploy/docker-compose.yml logs -f studio-api
deploy/backup/studio-backup.sh                                 # whole studio → backups/*.tar.gz
deploy/backup/studio-restore.sh <file> [--replace]             # Windows: studio-restore.ps1 -Backup <file> [-Replace]
deploy/photos/download-photos.ps1                              # template photos → var/demo-images
npm run typecheck && npm test                                  # 4 web tests fail on Node 24 (AbortSignal), pre-existing
```
Containers: `sb-edge` (nginx :80), `sb-studio-db`, `sb-studio-api`, `sb-studio-web`, `sb-control`.
Volumes: `site-builder_studio-pgdata`, `site-builder_studio-uploads`, `site-builder_control-data`.
Old `sb-platform_*` / `sb-cell-*` volumes are leftover backups; don't delete without asking.

## Code map
- `apps/api` Express 5 + pg. Control DB `sb_control` + one DB per site (tenant).
  Migrations: `src/database/control-plane/migrations`, `src/database/tenant/migrations` (latest `003_shop_options.sql`).
  Templates for new sites: `src/modules/platform/templates/` (`catalog.ts` 8 business types,
  `apply.ts`, `images.ts`). Cell mode: `src/cell-bootstrap.ts`, `src/modules/auth/sso.ts`.
- `apps/web` React + Vite + Tailwind. Admin in `src/admin` (`auth.tsx` has `OPERATOR_UI`,
  `ContentPages.tsx` is the client content editor). Public site in `src/features`, sections in `src/sections`.
- `packages/shared` zod schemas (`schemas.ts`, `sections.ts` incl. `contentOnlyChange`, `constants.ts`).
- `deploy/edge/nginx.conf` routing, `deploy/control/server.mjs` deploy service (no dependencies),
  `deploy/export/` package contents, `deploy/backup/`, `deploy/photos/`.

## Features added in this phase
Product discount %, colours, max per order, stock / sold out, categories; products section filters;
About page; request forms per page (consultation / reservation / demo / contact) with details;
cash on delivery (`allowCod`); header button and shop heading; 8 business templates with photos
and a "Refresh photos" button; client content editing.

## Environment gotchas
- The default npm registry in `package-lock.json` is a mirror that may be unreachable; set
  `NPM_REGISTRY=https://registry.npmjs.org/` in `deploy/.env` (Dockerfile rewrites lockfile URLs).
- Unsplash is unreachable from the CLI and Docker here; template photos come from
  `var/demo-images/<ref>.jpg` (mounted read-only into studio-api), else a gradient placeholder.
- Windows: PowerShell 5.1 treats docker stderr as errors (scripts use `ErrorActionPreference=Continue`);
  Git Bash `tar` needs `--force-local` for `C:` paths; use `MSYS_NO_PATHCONV=1` for `docker exec` paths.
- After copying data between databases run `deploy/export/fix-sequences.sql`, or publishes fail with 409.

## Never commit
`.env`, `deploy/.env`, `exports/`, `backups/`, `var/`, `var.rar` (client data and secrets).

## Git
- Work branch: `feature/studio-and-client-delivery` (pushed). Not merged to `main`; no PR yet — ask first.
- Push goes through the `bonshad2026` GitHub account (set per repo in the remote URL).
- Commit messages: imperative, short, no prefixes.
