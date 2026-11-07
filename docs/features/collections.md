# Content tables ("collections")

The operator defines tables and fields per site (courses, classes, news…); the owner adds the items.

- Schemas: shared `collections.ts` (`collectionInputSchema`, 15 field types incl. image, gallery and
  `reference` to another table by slug, `COLLECTION_PRESETS`, filters, visitor filters, box blocks).
- API: `apps/api/src/modules/collections/` — admin routes (`/sites/:s/collections`, items), public
  routes (`/public/sites/:s/collections/:table/items`, `range`, `days`, one item), list filters and
  sorting in SQL (`collections.service.ts`), seats and deadlines.
- Tenant migration `006_collections.sql` (`collections`, `collection_items`).
- Web: `src/admin/collections/` (Tables page, items page), `src/admin/builder/CardDesigner.tsx` (box
  designer), `src/features/collections/` (box renderer `CardView.tsx`, item pages, data hooks),
  `src/sections/collectionSections.tsx`.

## Lists and boxes
The "List from a table" section (`collection-list`) reads a table (or `products`) with fixed filters
and visitor filters, grid or list, columns per device, pagination and search. Visitor filters per field
type: search, chips, select, checkboxes, slider, range, presets, calendar (inline or in a window), date
range / presets, "available" toggle; shown inline or stacked. Boxes come from the box designer: image
size/fit/position, several images (grid, slider, row), row/column direction and alignment, buttons
(view, cart, request, link, call). Shared designs live in `settings.cardDesigns`; a list can also have
its own `card`.

## Item pages
An item's page is the table's template page (`detailPage` slug): `{{field}}` texts and the "Item
display" section (`collection-item`) show the item at `/<table>/<item-slug>`; related lists can filter
by the current item (`valueFrom: 'current'`).

## Selling and requests
Items can be sold with seats (`capacityField`) and a deadline (`deadlineField`), checked on the server,
or requested through a form (`?item=<table>/<slug>` on the request form; `requestType` on the table).
Design updates replace table definitions and keep the client's items.

## Member profiles, files and reviews
Account kinds may point at a self-service table: customers maintain their own item (for example
a trainer profile), upload owned image/PDF files and submit it as draft for staff approval.
Staff can assign a request to an item; tables can require a completed request before a customer
rates/comments. Hidden reviews do not contribute to public average/count. Card designer supports
list and rating blocks; item-reviews is available as a page section. Request form choices can
come from content tables. Code: members.routes.ts, MemberProfile.tsx, ItemReviewsSection.tsx.
Existing cafe address/unverified-signup behavior is retained alongside account kinds.
Tenant migration: 015_members_and_reviews.sql, compatible with original delivery migration 012.
Coverage: members.test.ts (10 real API/database tests), delivery-compatibility.test.ts.
