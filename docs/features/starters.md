# Starters

The studio's own starting points, usable on any site (even an empty one): pages, tables, headers and
footers. Stored in the control DB (`starters`: `kind`, `name`, `description`, `group_name`,
`sample_key`, `data`; migrations `004_starters.sql`, `005_starter_groups.sql`).

## Packs
`data` is a self-contained pack (shared `starters.ts`, `starterPackSchema` version 2; older `{document}`
/ table data is converted on read by `readStarterPack`):
- `pages` (role `main` / `detail` = a table's item page / `linked`), `tables`, `forms` (request types),
  `cardDesigns` (shared box designs), `site.header` / `site.footer` (header and footer starters),
- `samples` (items per table with references by `ref`, products, categories), `modules` it needs,
- `needs`: pages / tables / forms it uses but does not hold,
- `photos`: copies in the studio's storage (`BANK_STORAGE_ID` folder); item fields and products hold
  the photo `id`, texts hold its address. Deleting a starter deletes its photos unless another starter
  still uses them (ready-made starters share theirs).

## Saving (`apps/api/src/modules/starters/pack.service.ts`)
- `POST /sites/:s/starters/scan` — what a starter from this selection would hold: tables shown or
  pointed to and tables' item pages go in automatically; linked pages only when ticked; `skip` leaves
  things out.
- `POST /sites/:s/starters` — save (`kind`, `name`, `group`, selection, `samples`), or `replace: <id>`
  to swap an existing starter's contents (the way to update a starter).
- Header / footer starters are saved from the site's saved settings.

## Using
- `GET /sites/:s/starters/:id/check` — for each page / table / form: held or only needed, exists /
  missing / differs (missing fields), with a suggested choice.
- `POST /sites/:s/starters/:id/apply` — per item: `create` (with a slug), `use` (the site's own), or
  `skip`; slugs are renamed everywhere (links, list sources, references, item pages, forms); missing
  fields can be added to an existing table; modules turned on; one transaction. The main page is a
  draft, the other pages are published; samples are `demo = true`.
- Platform routes (`/platform/starters`): list (by kind and group), rename / move to a group (`PATCH`),
  delete.

## Admin (web)
- Platform ← Starters ← Pages / Tables / Headers / Footers (`/admin/platform/starters/:kind`,
  `src/admin/pages/StartersPage.tsx`): grouped, searchable, with Preview / Edit / Delete.
- Dialogs in `src/admin/starters.tsx`: `SaveStarterDialog`, `ApplyStarterDialog`, `StarterPreviewDialog`,
  `StarterPicker` (New page), `StarterSelect` (grouped drop-down, also in Tables), `ChromeStarters`
  (Settings ← Header / Footer: choose, preview, use, save).

## Preview
Pages, headers and footers render in an iframe at `/__starter-preview`
(`src/admin/StarterPreviewFrame.tsx`) with the look of a chosen site and real widths. `setApiMock`
(`src/lib/api.ts`, also used by `customerRequest`) answers the made-up site `starter-preview` from the
pack: settings, pages, tables and sample items (images and references resolved), products, a signed-in
customer with sample requests and orders; posts are refused. Tables preview as fields + sample items.

## Ready-made starters
`apps/api/src/modules/starters/samples.ts` (`SAMPLES`, about 50): 404, contact, about, shop, product
page, services, courses (with an item page), classes, events, blog, request forms (consultation, demo,
reservation, booking with a time field), cart and checkout, sign-in / sign-up, account layouts and "My
…" pages, track, six ready tables, four headers and three footers, in groups. `node dist/cli.js
add-sample-starters` (run by `deploy/studio/api-start.sh`) adds those whose key is not yet in
`app_settings.starter_samples`, so a deleted one never comes back; to add a new sample, give it a new
key. Pages should be used at the slug named in their description (e.g. `not-found`, `products`,
`account`) to replace a built-in page. Test: `apps/api/test/starters.test.ts` builds every sample on an
empty site.
