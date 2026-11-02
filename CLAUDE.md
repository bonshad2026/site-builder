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
- Firefighter (`871051`) site customers: `09120000001` / `09120000002`, password `12345678` (sign in on its preview).
- Reset any password: `docker exec sb-studio-api node dist/cli.js set-password --email <login> --password <pw> [--admin]`.

## Commands
```bash
docker compose -f deploy/docker-compose.yml up -d --build     # start / rebuild the studio
docker compose -f deploy/docker-compose.yml logs -f studio-api
deploy/backup/studio-backup.sh                                 # whole studio → backups/*.tar.gz
deploy/backup/studio-restore.sh <file> [--replace]             # Windows: studio-restore.ps1 -Backup <file> [-Replace]
deploy/photos/download-photos.ps1                              # template photos → var/demo-images
npm run typecheck && npm test                                  # API tests need Postgres on :5433 (TEST_PG_ADMIN_URL; a throwaway `sb-test-pg` container works); known failures: admin sign-in + cart "option" (web), page publish 409 (api)
```
Containers: `sb-edge` (nginx :80), `sb-studio-db`, `sb-studio-api`, `sb-studio-web`, `sb-control`.
Volumes: `site-builder_studio-pgdata`, `site-builder_studio-uploads`, `site-builder_control-data`.
Old `sb-platform_*` / `sb-cell-*` volumes are leftover backups; don't delete without asking.

## Code map
- `apps/api` Express 5 + pg. Control DB `sb_control` + one DB per site (tenant).
  Migrations: `src/database/control-plane/migrations` (latest `004_starters.sql`), `src/database/tenant/migrations` (latest `009_demo_data.sql`).
  Templates for new sites: `src/modules/platform/templates/` (`catalog.ts` 8 business types,
  `apply.ts` = `applySetup`, `images.ts`); site setup: `src/modules/platform/setup/` (`demo.ts` sample data and
  `clearDemoData`, `pools.ts` word lists). Cell mode: `src/cell-bootstrap.ts`, `src/modules/auth/sso.ts`.
  Content tables: `src/modules/collections/` (admin + public routes, list filters, seats).
- `apps/web` React + Vite + Tailwind. Admin in `src/admin` (`auth.tsx` has `OPERATOR_UI`,
  `ContentPages.tsx` is the client content editor). Public site in `src/features`, sections in `src/sections`.
- `packages/shared` zod schemas (`setup.ts` new-site setup: page / form / table catalogues, `siteSetupSchema`, `defaultSetup`; `schemas.ts`, `sections.ts` incl. `contentOnlyChange`, `constants.ts`,
  `collections.ts` for tables, fields, filters and box blocks).
- Web content tables: `src/admin/collections/` (tables + items pages), `src/admin/builder/CardDesigner.tsx`
  (box designer), `src/features/collections/` (box renderer, item pages), `src/sections/collectionSections.tsx`.
- Interactions: `packages/shared/src/interactions.ts` (workflow, presets, answer checks, accounts),
  API `src/modules/interactions/` (requests service, public routes, access tokens, notify),
  `src/modules/customers/` (customer accounts, sessions, codes), `src/modules/leads/` (staff inbox);
  web `src/admin/interactions/` (form/workflow designer, timeline, customers), `src/admin/pages/InboxPages.tsx`,
  `src/features/account/` (sign-in, my account, `/track`, request page), `src/features/leads/CustomRequestForm.tsx`.
- `deploy/edge/nginx.conf` routing, `deploy/control/server.mjs` deploy service (no dependencies),
  `deploy/export/` package contents, `deploy/backup/`, `deploy/photos/`.

## Features added in this phase
Product discount %, colours, max per order, stock / sold out, categories; products section filters;
About page; request forms per page (consultation / reservation / demo / contact) with details;
cash on delivery (`allowCod`); header button and shop heading; 8 business templates with photos
and a "Refresh photos" button; client content editing; submenus, header/footer options.
Content tables (branch `feature/collections`): the operator defines tables and fields per site
(references between tables, presets), the owner adds items; the "List from a table" section has
fixed and visitor filters, grid/list and a free box designer (shared designs live in
`settings.cardDesigns`); an item's page is the table's template page (`{{field}}` texts, "Item
display" section); items can be sold with seats and a deadline (checked on the server) or requested
(`?item=<table>/<slug>` on the request form). Design updates replace table definitions and keep items.
Box designer: image size/fit/position, several images (grid, slider, row), row/column direction and
alignment. Visitor filters per field type (search, chips, checkboxes, slider, ranges, presets,
calendar inline or in a window, "available"), shown inline or stacked. Site settings: error-message
language, site and panel direction, panel language, calendar (Jalali/Gregorian; `src/lib/calendar.ts`).
Errors are translated for people in `src/lib/errorText.ts` (the API sends issue codes and limits).
Interactions (branch `feature/interactions`): each request type (in `settings.requestTypes`) is a fully
editable form (`formVersion` 2): every question is a field, including name / phone / email (`role`
marks the follow-up ones) and consent; 14 field types incl. file upload (private, `request_files`,
`POST /public/sites/:s/uploads`), heading and `step` (multi-page); limits (`min`/`max`), ready checks
(`pattern`: national id, postal code, IBAN…), placeholders, conditions, width; prices on choices, tick
boxes and numbers (price × number) added to `payment.amountMinor` (`computeTotal`, recomputed on the
server); `layout` (columns, button and thank-you texts, step progress); links prefill questions
(`?<key>=value`). Version-1 types and the old fixed forms are converted on read (`packages/shared/src/forms.ts`),
and old-style posts (name/email/message apart) still fill the converted questions. Plus access
(anyone / signed-in) and a workflow (stages with
kind open/done/cancelled, allowed next stages, shown to customer or internal, notify by SMS/email with
`{{…}}` texts, customer may cancel/reply, "ask for payment", "after payment" stage; 5 presets).
Requests (`leads` table) get a tracking code `R<number>`, a timeline (`case_events`: stage changes,
messages both ways, internal notes, payment requests, payments) and payments of their own (`payments.lead_id`).
Orders get the same timeline, messages and per-stage notifications (`shop.orderStatuses[].notify/message`).
Visitors: optional accounts (`settings.accounts`, phone or email + one-time code, optional password;
per-site cookies `sb_c_<slug>` / `sb_cc_<slug>`, CSRF header `X-Customer-CSRF`), `/account` with
their requests and orders, `/track` by code + phone/email, `/track/<code>?t=<signed token>` links in messages.
Staff: inbox with filters, stage buttons, payment requests, assignee, unread counts; Customers page.
Clients may rename request types / stages and edit message texts only. Workflows and staff addresses
are stripped from public settings. Design updates keep the client's `notifications`. In the studio
`SITE_PREVIEW_URL` makes message links and payment returns point at the site preview. Dev SMS/email
are logged by studio-api; the sign-up form shows the dev code on screen.

Site setup (branch `feature/interactions`): "New client site" opens `/admin/platform/sites/new`, one page of
collapsible sections (business type, languages and look, contact, pages with menu place main / "More" / footer /
none, forms from `SETUP_FORMS` each with its own page, workflow, access and notifications, header buttons incl.
call / WhatsApp / search, footer, shop, filters, content tables, accounts, sample data counts). `POST
/platform/tenants` takes `setup`; `applySetup` builds settings, menus, pages, request types, tables, box designs
(`box-products`, `box-<table>`) and then sample data. Sample rows carry `demo = true` (products, services,
collection_items, customers, leads, orders, payments); "Sample data" on the sites list counts and removes them
(`/platform/tenants/:id/demo-data`). Install packages drop them (`deploy/export/drop-demo.sql`) unless "همراه داده‌ی
نمونه" is ticked; design updates never send demo items. Sample customers: phones `0912100xxxx`, password `12345678`.
A site in one language redirects to it (`SiteLayout`); header options `showSearch`, `showAccount`.
Built-in pages as builder pages: `SYSTEM_PAGES` (shared `sections.ts`) gives each built-in page a fixed slug
(`products`, `product`, `services`, `service`, `cart`, `checkout`, `checkout-result`, `not-found`). When a published
page with that slug exists the route shows it (`sections/BuiltInPage.tsx`); its `system-page` section ("Built-in
content") renders the built-in component inside it (the product / service of the address, or the first one in
the builder preview). "Make it editable" in Pages ← Built-in pages creates them; setup creates them for new sites
(the shop is `/products` as a "List from a table" page). Admin menu groups: Requests, Orders, Customers, Tables
(products, categories, services, content tables), Pages, Site look, Settings (incl. payment gateway).
Creating a site: "Empty site" = no setup, no pages and every module off except leads (no shop, products,
categories, services; built-in shop/service routes show "not found" while their module is off — `BuiltInPage`); "Default site" = the neutral setup (`genericTemplate`).
Deleting: `DELETE /platform/tenants/:id?confirm=<slug>` (`deleteTenant`: files, database, role, row; the UI asks
for the id), `DELETE /platform/users/:id` (not yourself, not a site owner).
Content bank (Platform ← Content bank, `/admin/platform/bank`): texts and photos per site type for sample data.
Built-in types (general + the 8 templates) and kinds (`BUILT_IN_KINDS` in shared `bank.ts`: product, service,
article, portfolio, person, course, event, testimonial, faq) live in code (`modules/bank/bank.service.ts`
`builtInEntries`); the studio's own types, kinds, entries and photos are in the control DB (`002_content_bank.sql`,
photos under storage id `BANK_STORAGE_ID`). A table takes the kind with its key, else `kindForTable` by common
names; fields without a bank value are made up. `tenants.business_type` remembers each site's type. "Sample data"
on the sites list: `POST /platform/tenants/:id/demo-data` (`demoRunSchema`: type, add / replace, counts per table,
customers, orders, payments, requests); bank photos are copied into the site (`photoStore`).

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
- `feature/collections` (content tables) branches from it; pushed, not merged.
- `feature/interactions` (forms, workflows, accounts, tracking) branches from `feature/collections`.
- Push goes through the `bonshad2026` GitHub account (set per repo in the remote URL).
- Commit messages: imperative, short, no prefixes.

Bank deletes and starters: built-in bank entries and photos can be removed too (hidden per type in
`bank_hidden`, entry ref = hash of its texts; "Bring back removed built-ins" clears them). Starters
(`starters` table, `/platform/starters`, web `src/admin/starters.tsx`): any page ("Save as starter" in
Pages) or table (Tables) is saved to the studio; "New page" and "New table" on any site can start from one
(tables: `s:<id>` in "Start from"); Platform ← Starters (`/admin/platform/starters`, `pages/StartersPage.tsx`) lists them to rename or delete.
Starters are self-contained packs (shared `starters.ts`, `starterPackSchema` version 2; older `{document}` / table
data converted on read by `readStarterPack`): pages (role main / detail / linked), tables, forms, shared box designs,
sample items and products, modules, `needs` (what was left out) and photos copied into the studio's storage
(`BANK_STORAGE_ID` folder; deleted with the starter). API `modules/starters/pack.service.ts`: `POST
/sites/:s/starters/scan` (tables shown or pointed to and item pages go in automatically, linked pages only when ticked,
`skip` leaves things out), `POST /sites/:s/starters` (save, or `replace: <id>` to swap a starter's contents), `GET
…/:id/check` and `POST …/:id/apply` (per page / table / form: create with a slug, use the site's own, or skip; slugs
renamed everywhere; one transaction; main page as draft, other pages published; samples `demo = true`). Web dialogs in
`admin/starters.tsx` (`SaveStarterDialog`, `ApplyStarterDialog`).
Kinds: page, table, header, footer (`pack.site.header/footer`; saved and used from Settings ← Header / Footer,
`ChromeStarters`). Each starter has one `group` (control migration `005_starter_groups.sql`); Platform ← Starters ←
Pages / Tables / Headers / Footers (`/admin/platform/starters/:kind`) lists them by group with Preview / Edit / Delete.
Preview: pages, headers and footers render in an iframe at `/__starter-preview` (`admin/StarterPreviewFrame.tsx`) with
a chosen site's look; `setApiMock` in `lib/api.ts` answers the made-up site `starter-preview` from the pack (sample
items, products, photos, a signed-in customer); tables preview as fields + sample items. Ready-made starters
(`modules/starters/samples.ts`, ~50) are added by `node dist/cli.js add-sample-starters` in `api-start.sh`, each key
once (`app_settings.starter_samples`, `starters.sample_key`); they share photo copies, so deleting a starter keeps
photos another starter uses. The account's "Built-in content" section has `accountMenu` (tabs / sidebar / cards /
none), `accountOpen` and `authStart` (sign-in / sign-up pages, "My orders" pages).
The 404 page: Pages shows "Make the 404 page editable" until the site has its `not-found` page.
