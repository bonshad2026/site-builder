# New sites, built-in pages, sample data and site kits

## Creating a site
"New client site" opens `/admin/platform/sites/new`: one page of collapsible sections (business type,
languages and look, contact, pages with a menu place — main / "More" / footer / none — forms from
`SETUP_FORMS` each with its own page, workflow, access and notifications, header buttons incl. call /
WhatsApp / search, footer, shop, filters, content tables, accounts, sample data counts).

`POST /platform/tenants` takes `setup` (`siteSetupSchema`, shared `setup.ts`). `applySetup`
(`apps/api/src/modules/platform/templates/apply.ts`) builds settings, menus, pages, request types,
tables, box designs (`box-products`, `box-<table>`) and then sample data. Eight business types live in
`templates/catalog.ts` (photos via `templates/images.ts`).

Template photos come from `var/demo-images/<ref>.jpg`, else the network, else a gradient placeholder
(stored as `unsplash-<ref>.png`). The sites list returns `placeholderPhotos` per active site and shows
"Refresh photos" only when it is above 0; that button swaps placeholders for files now in `var/demo-images`.

- **Empty site**: no setup, no pages, every module off except leads (built-in shop / service routes
  show "not found" while their module is off — `sections/BuiltInPage.tsx`).
- **Modules** (Settings → Modules, operator only, `MODULE_SWITCHES` in `SettingsPages.tsx`): products,
  orders, services and leads. A switch only opens that part (admin menus, built-in addresses, API); it
  adds no pages, tables or sample items (starters and demo data do that). `projects`, `testimonials`
  and `faq` are still in `MODULES` / stored settings but change nothing and are not shown.
- **Default site**: the neutral setup (`genericTemplate`).
- A site in one language always opens in it (`SiteLayout`).
- Deleting: `DELETE /platform/tenants/:id?confirm=<slug>` (`deleteTenant`: files, database, role,
  row; the UI asks for the slug). `DELETE /platform/users/:id` (not yourself, not a site owner).

## Site settings worth knowing
- Language and direction: error-message language, site and admin direction, admin language, calendar
  (Jalali / Gregorian, `apps/web/src/lib/calendar.ts`).
- Header (`settings.header`: layout, size, buttons, `showSearch`, `showAccount`, cart, theme and language
  switches), submenus in `nav`, footer columns and placement (`settings.footer`); both can come from
  header / footer starters ([starters.md](starters.md)).
- Themes: built-in ivory / noir / sage plus the site's own (`design.themes`). `design.visitorThemes`
  limits the header's theme buttons to the listed ids (empty = all; fewer than two hides the buttons);
  set in Site look → design ("Themes visitors can pick").
- Admin menu of a site (`src/admin/AdminRoot.tsx` `SiteNav`): Requests, Orders, Customers, Tables
  (products, categories, services, content tables), Pages, Site look, Settings (incl. payment gateway).

## Built-in pages as builder pages
`SYSTEM_PAGES` (shared `sections.ts`) gives each built-in page a fixed slug: `products`, `product`,
`services`, `service`, `cart`, `checkout`, `checkout-result`, `account`, `track`, `not-found`. When a
published page with that slug exists, the route shows it; its "Built-in content" section
(`system-page`) renders the built-in component inside it (the product / service of the address, or
the first one in the builder preview). "Make it editable" in Pages creates them; setup creates them
for new sites (the shop is `/products` as a "List from a table" page). Pages shows "Make the 404 page
editable" until the site has its `not-found` page.

The `system-page` section also has `accountMenu` (tabs / sidebar / cards / none), `accountOpen`
(requests / orders / profile) and `authStart` (login / signup) for the customer account, read through
`useSystemPageOptions()`; this makes separate sign-in, sign-up, "My orders" and profile pages possible.

## Sample data
Sample rows carry `demo = true` (products, services, collection_items, customers, leads, orders,
payments, product reviews). "Sample data" on the sites list counts, adds and removes them:
`GET|POST|DELETE /platform/tenants/:id/demo-data` (`demoRunSchema`: bank type, add / replace, counts per
table, customers, orders, payments, requests). Code: `modules/platform/setup/demo.ts` (`addDemoData`,
`clearDemoData`, `fieldValue`, `itemTitle`), word lists in `setup/pools.ts`.

## Site kits (content bank)
Platform ← Site kits (`/admin/platform/bank`, `BankPage.tsx`): per site type (general + the 8 templates
+ the studio's own types, `bank_types`) what sample data is made from:
- **Tables**: copies of table starters (control DB `kit_tables`, migration `006_kit_tables.sql`; `pack`
  is a starter pack with its tables, item pages, forms, box designs, sample items and photo copies of
  its own). Added with `POST /platform/bank/tables` (`addKitTable` copies the photos, so editing a kit
  never touches the starter); items edited in the page (`PUT /platform/bank/tables/:id/items`, photos
  `POST …/:id/photos`). The main table of a kit table is the one no other table of its pack points to
  (`kitMainTable`). The general kit is filled once with the ready-made table starters
  (`seedGeneralKit`, run by `cli add-sample-starters`; `app_settings.general_kit_seeded`).
- **Lists**: products, services, reviews, FAQ (`BUILT_IN_KINDS` in shared `bank.ts`, `bank_entries`);
  built-ins come from the templates (`builtInEntries`); general has reviews and FAQ only.
- **Photos** for any content (`bank_photos`, kind '').

Sample data (`setup/demo.ts`): a site table takes the items of the kit table with the same address
(the type's kit first, then general — `loadBank().table(slug)`), in order, numbered on later rounds;
values are used where they fit the site's field (`kitValueFits`), references are moved to the new
items by `ref`, and everything else is made up (`fieldValue`). The "Sample data" window can add kit
tables the site lacks first (`demoRunSchema.addTables` → `applyPack` without its samples).
Built-in entries and photos can be hidden per type (`bank_hidden`; "Bring back removed built-ins").
`tenants.business_type` remembers each site's type. Photos are copied into the site (`photoStore`).
The page shows counts per list (`GET /platform/bank/counts?type=`) and explains empty parts.
