# Site Builder — guide for agents and developers

Read this first, whichever tool you are (Claude Code reads it through `CLAUDE.md`; Codex, Cursor and
others read `AGENTS.md`). It describes how the project works **today**. Feature details are in
[`docs/features/`](docs/features/); [`docs/README.md`](docs/README.md) says which other docs are current.

The owner writes in Persian: **reply in Persian**; keep code, comments, commits and docs in English.

## Start here (every session, without being asked)
1. Read this file to the end.
2. Read [`docs/STATUS.md`](docs/STATUS.md): where the work stands, what is open, what comes next.
3. Run `git status` and `git branch --show-current`; work starts from `develop` (see Git below).
   If there are uncommitted changes you did not make, ask the owner before touching them.
4. For the area you are asked to change, read its doc in [`docs/features/`](docs/features/) before the code.
5. If the owner only says "continue" (ادامه بده), continue with the first item under "Next" in `docs/STATUS.md`,
   after saying in one line what you are about to do.

## End of every session (or after any finished task)
- Update [`docs/STATUS.md`](docs/STATUS.md): what you did (with the commit), what is unfinished, what is next.
- If you changed how something works, update this file (facts every task needs) or the feature doc (details).
- Agents' own memories (Claude's memory, chat history) are not seen by other agents or machines:
  anything the next agent needs must be written in these files and committed.

## What it is
A studio where an operator builds websites for business clients and delivers each one as its own
installable package.
- **Studio** (`deploy/docker-compose.yml`, compose project `site-builder`): every client site is built
  here. Admin at http://admin.localhost; each site previews at `http://<slug>.preview.localhost`.
- **Deploy service** (http://admin.localhost/deploy/, `deploy/control/server.mjs`): per site, an
  **install package** (first delivery) or a **design-update package** into `exports/`.
- **Client delivery** (`deploy/export/`): Postgres + built API image + Caddy serving the prerendered
  site on the client's server. Clients edit content only; structure is operator-only (`clientLocked`
  when `CELL_SLUG` is set; `VITE_ADMIN_SCOPE=client` strips builder code from the web bundle).
- The root `docker-compose.yml` and the old single-stack docs are **legacy**.

More: [studio and delivery](docs/features/studio-and-delivery.md).

## Local accounts (weak, local only)
- Studio operator: `admin` / `123456` (`CONTROL_ADMIN_*` in `deploy/.env`; reset on every studio-api start).
- New packages: operator `admin` / `123456`, client `owner` / `123456` (`SITE_OPERATOR_*`, `SITE_OWNER_*`).
- Sample customers on sites with sample data: phones `0912100xxxx`, password `12345678`.
- Reset a password: `docker exec sb-studio-api node dist/cli.js set-password --email <login> --password <pw> [--admin]`.

## Commands
```bash
docker compose -f deploy/docker-compose.yml up -d --build                          # start / rebuild the studio (needed after code changes)
docker compose -f deploy/docker-compose.yml up -d --build studio-api studio-web    # rebuild only the app containers
docker compose -f deploy/docker-compose.yml logs -f studio-api
docker start sb-test-pg                     # Postgres for API tests on :5433 (create: docker run -d --name sb-test-pg -p 127.0.0.1:5433:5432 -e POSTGRES_USER=sb_admin -e POSTGRES_PASSWORD=sb_admin_dev_password postgres:16-alpine)
npm run typecheck                           # shared, api, web
npm test                                    # web (vitest) then api (vitest, real Postgres)
npx vitest run test/starters.test.ts        # one API test file (from apps/api)
deploy/backup/studio-backup.sh              # whole studio → backups/*.tar.gz (restore: studio-restore.sh / .ps1)
deploy/photos/download-photos.ps1           # template photos → var/demo-images
```
Containers: `sb-edge` (nginx :80), `sb-studio-db`, `sb-studio-api`, `sb-studio-web`, `sb-control`.
Volumes: `site-builder_studio-pgdata`, `site-builder_studio-uploads`, `site-builder_control-data`.
Old `sb-platform_*` / `sb-cell-*` volumes are leftover backups: never delete without asking.
On start, studio-api runs `deploy/studio/api-start.sh`: migrations, operator password, ready-made starters.

## Before you say a change is done
1. `npm run typecheck` (a known error in `apps/api/test/shop.test.ts` about `amountMinor` predates this guide).
2. Tests: all web and API tests pass as of 2026-11-02 (web 43, API 98). A new failure is yours to explain.
3. Add or extend an API test in `apps/api/test/` for new API behaviour (they run against real Postgres).
4. Rebuild the studio containers and check the change in the browser at http://admin.localhost.
5. Update this file or the feature doc if you changed how something works (see "Keeping this guide").

## Git
- Default branch for work: **`develop`**. Make a feature branch from it (`feature/<topic>`), commit,
  push the branch, then merge into `develop` (`--no-ff`) and push `develop` — only when the owner asks.
- `main` is behind `develop` and is only updated when the owner asks. Never force-push.
- Older feature branches (`feature/studio-and-client-delivery`, `feature/collections`,
  `feature/interactions`, `feature/starters-menu`, `feature/starter-packs`…) are already in `develop`.
- Pushes go through the `bonshad2026` GitHub account (set in the remote URL).
- Commit messages: imperative, short, no prefixes.
- **Never commit** `.env`, `deploy/.env`, `exports/`, `backups/`, `var/`, `var.rar`, root `*.tar.gz` / `*.jpg`
  (client data and secrets; most are in `.gitignore`).

## Code map
- `packages/shared` — zod schemas and pure logic used by both sides: `schemas.ts` (site settings, pages,
  catalog), `sections.ts` (section library, `SYSTEM_PAGES`, `contentOnlyChange`), `siteOptions.ts`
  (header, footer, design, form fields), `collections.ts` (content tables, filters, box blocks, presets),
  `interactions.ts` + `forms.ts` (request forms, workflows, accounts), `setup.ts` (new-site setup),
  `bank.ts` (site kits / content bank), `starters.ts` (starter packs), `constants.ts`.
- `apps/api` — Express 5 + pg. Control DB `sb_control` plus **one database per site** (tenant).
  Migrations: `src/database/control-plane/migrations` (latest `006_kit_tables.sql`) and
  `src/database/tenant/migrations` (latest `010_shop_extras.sql`); numbered, never edit an applied one.
  Modules in `src/modules/<name>/` (`*.routes.ts` + `*.service.ts`). Routes use `ApiRouter`
  (`src/common/http.ts`) with zod `body` / `query` / `params`. Site routes are `/api/v1/sites/:siteId/…`
  where **`:siteId` is the site's slug**. CLI: `src/cli.ts`.
- `apps/web` — React + Vite + Tailwind + TanStack Query. Admin in `src/admin` (builder in `builder/`,
  platform pages in `pages/`), public site in `src/features`, sections in `src/sections`, API client
  `src/lib/api.ts`. Studio-only pages are lazy and dropped from client builds.
- `deploy/` — `edge/nginx.conf` routing, `control/` deploy service (no dependencies), `export/` package
  contents, `studio/` studio scripts, `backup/`, `photos/`.

## Conventions
- Validation lives in `packages/shared` (zod); the API parses every input, the web reuses the schemas.
- UI text is bilingual inline: `l({ en, fa })` / `L('English', 'فارسی')`; shared admin strings in `src/admin/i18n.ts`.
- Comments explain why or what something is for, in plain English; match the surrounding density.
- Sample/demo rows carry `demo = true` so they can be removed together and are left out of packages.
- Built-in features become editable as builder pages through fixed slugs (`SYSTEM_PAGES`).
- Errors: the API sends codes and limits; `apps/web/src/lib/errorText.ts` turns them into sentences.

## Environment gotchas
- npm registry: the lockfile points at a mirror that may be unreachable; set `NPM_REGISTRY=https://registry.npmjs.org/` in `deploy/.env`.
- Unsplash is unreachable from the CLI and Docker here; template photos come from `var/demo-images/<ref>.jpg`, else a gradient placeholder.
- Windows: PowerShell 5.1 treats docker stderr as errors (scripts use `ErrorActionPreference=Continue`);
  Git Bash `tar` needs `--force-local` for `C:` paths; use `MSYS_NO_PATHCONV=1` for `docker exec` paths.
- Long inline scripts in Git Bash heredocs can fail to parse here; write them to a file and run that.
- After copying data between databases run `deploy/export/fix-sequences.sql`, or publishes fail with 409.
- Postgres `jsonb` does not keep key order: compare JSON structurally, never as text.
- API tests reset their own control DB (`sb_control_test`) and create `sb_test_*` tenant databases on :5433.

## Feature docs
| Area | Doc |
|---|---|
| Current state, open items, next steps | [STATUS.md](docs/STATUS.md) |
| Studio, deploy service, client packages, backups | [studio-and-delivery.md](docs/features/studio-and-delivery.md) |
| New sites: setup, empty/default sites, built-in pages, sample data, site kits | [site-setup.md](docs/features/site-setup.md) |
| Content tables, box designer, filters, item pages | [collections.md](docs/features/collections.md) |
| Request forms, workflows, customer accounts, tracking, inbox | [interactions.md](docs/features/interactions.md) |
| Shop: products, variants, discounts, coupons, shipping, payments, reviews | [shop.md](docs/features/shop.md) |
| Starters: packs, groups, previews, ready-made starters, header/footer | [starters.md](docs/features/starters.md) |

## Keeping this guide
Any agent finishing a change that alters how something works updates this file (facts that every
task needs) or the matching feature doc (details), and always `docs/STATUS.md`. Keep this file short;
put details in the docs. Update the test counts here and in `docs/STATUS.md` when they change.
Other tools are pointed here by `CLAUDE.md` (Claude Code), `GEMINI.md` (Gemini CLI),
`.github/copilot-instructions.md` (GitHub Copilot) and `.cursor/rules/project-guide.mdc` (Cursor);
Codex and most others read `AGENTS.md` directly. Keep those pointer files as pointers only.
