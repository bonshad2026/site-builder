# New sites, built-in pages, sample data and the content bank

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

## Content bank
Platform ← Content bank (`/admin/platform/bank`): texts and photos per site type for sample data.
Built-in types (general + the 8 templates) and kinds (`BUILT_IN_KINDS` in shared `bank.ts`: product,
service, article, portfolio, person, course, event, testimonial, faq) live in code
(`modules/bank/bank.service.ts` `builtInEntries`); the studio's own types, kinds, entries and photos are
in the control DB (`002_content_bank.sql`; photos under storage id `BANK_STORAGE_ID`). Built-in entries
and photos can be hidden per type (`bank_hidden`, entry ref = hash of its texts; "Bring back removed
built-ins" clears them). A table takes the kind with its key, else `kindForTable` by common names;
fields without a bank value are made up. `tenants.business_type` remembers each site's type. Bank
photos are copied into the site (`photoStore`).
The page shows entry counts per kind (`GET /platform/bank/counts?type=`, built-ins included), opens
on the first kind with entries, lists entries above photos, and explains where sample data looks
when a kind is empty (General has no products or services: those come from the site's own type).
