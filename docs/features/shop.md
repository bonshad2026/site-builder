# Shop

Reusable product behavior is documented here; per-client configuration and acceptance results
are in docs/clients/. See [mobile-storefront.md](mobile-storefront.md) for navigation, catalog rows,
cart presentation and icon cards, and [instagram-orders.md](instagram-orders.md) for managed delivery.

- **Products** (`products` table, `src/modules/catalog/catalog.ts`): price in the currency's minor unit
  (rials for IRR), discount %, colours, variants (size / model…) with their own price and stock, max per
  order, stock / sold out, featured, categories (`settings.productCategories`, by slug), materials,
  dimensions, lead time, extra photos and attributes.
- **Services** (`services` table): list and detail pages, built in or as builder pages.
- **Cart and checkout** (`src/features/cart/`): checkout fields (`shop.checkout`, e.g. address required),
  shipping methods (`shop.shipping`, cost with "free above"), discount codes (`coupons`: percent or
  amount, minimum order, uses, dates), cash on delivery (`payment_settings.allow_cod`).
- **Order stages** (`shop.orderStatuses`) with per-stage notifications and the same timeline as requests
  (see [interactions.md](interactions.md)).
- **Payments** (`src/modules/payments/`): see "Payment gateways" below.
- **Reviews** (`product_reviews`): new ones wait for staff approval. **Newsletter** subscribers
  (`subscribers`, newsletter section). Wishlist in `src/features/wishlist/`.
- Products are also a source for "List from a table" (`source: 'products'`, `listProductsAsItems`).

## Payment gateways
- **Drivers** (`drivers.ts`): every gateway the system knows — Zarinpal, Zibal, IDPay and `sandbox`
  (local test page, refused in production). A driver lists its credential fields (the admin form is
  built from them), its kind of test mode (`toggle` / `auto` / `always`), how to build the gateway
  (`gateways.ts` classes) and how to read its answer on the return URL. **Adding a gateway** = its
  class plus one entry in `PAYMENT_DRIVERS`; the catalog, site settings and checkout pick it up.
  Gateway code is written from each provider's public API docs and tested with mocked HTTP only.
- **Studio catalog** (Platform → Payment gateways, `catalog.ts`, `app_settings` key
  `payment_catalog`): per gateway, whether sites may be given it, whether new sites are allowed it,
  and the default buyer-facing name and note. A gateway missing from the stored catalog uses the
  defaults (on, allowed). A client's server has no catalog: its site rows decide.
- **Per site** (`payment_gateways`, tenant migration `011_payment_gateways.sql`): one row per gateway
  with `allowed` (operator only: `PUT …/payment-settings/gateways/:provider/access`), `enabled`,
  `sort`, buyer-facing `label` / `description`, private `credentials` and `test_mode`. Missing rows are
  added with the catalog defaults when the panel opens the settings. Forbidding a gateway turns it
  off and hides it from the site's staff. Payment on delivery stays in `payment_settings.allow_cod`.
- **Checkout**: `GET /public/sites/:slug/payment-methods` lists the usable gateways in site order
  (allowed, on, available on this server, credentials valid); the buyer chooses one or on delivery,
  and `POST …/orders/:number/pay` (and `…/requests/:number/pay`) take an optional `gateway`; without
  it the first is used. Each payment keeps its `provider`, so it still verifies after the site turns
  that gateway off.
- **Transactions** (site menu → Transactions, `GET /sites/:siteId/payments`, `payments:manage`):
  every attempt with its order or request, filters (status, test or real, order / request number or
  reference). "Check again" (`POST …/payments/:id/recheck`) asks the gateway about a payment that
  never came back: paid → recorded; not paid and older than 30 minutes → failed.
- "Test connection" (`POST …/payment-settings/gateways/:provider/test`) sends a small payment
  request with the saved settings; the buyer step never happens, so no money moves.

Tenant migrations: `001_init.sql`, `002_payments.sql`, `003_shop_options.sql`,
`004_requests_and_product_details.sql`, `005_order_statuses.sql`, `010_shop_extras.sql`,
`011_payment_gateways.sql`.

## Native-share checkout

`shop.orderMode` is `checkout` (default, existing API orders/payments) or `share` (local basket
message and device chooser only). `shop.shareRecipient` is a recipient hint; it cannot force a
destination. `shop.showPrices` controls standard product cards/details, basket and share summary.
Configure these under Shop settings / Order submission (`SiteOptionsTabs.tsx`). Shared checkout
uses the existing checkout field schema, including custom fields. It does not create server
orders, make payments, or clear the basket after sharing/cancellation. Unknown-priced products
can enter a share basket; their internal cart subtotal uses zero only as a placeholder, so hide
prices for an unpriced menu. Normal checkout still refuses unknown-priced products.

`shareOrder.ts` formats selected quantities, options and contact details and uses Web Share.
Unsupported/rejected sharing provides a readonly message and copy button. An AbortError is
shown as cancellation, not success. The Android wrapper recognizes its user agent marker and
handles `sitebuilder-share://order?text=...` with ACTION_SEND/Intent.createChooser, only from the
trusted cafe HTTPS main frame. There is no Instagram account/API integration or automatic DM.

Operator steps: [share-orders guide](../guide/share-orders.md). API test in content.test.ts;
Web Share formatting/chooser/cancellation tests in share-order.test.ts.

`shop.shareTarget` selects `chooser` (default) or `instagram`; `shop.instagramUsername` validates
an optional @ plus 1–30 username characters. Instagram mode copies the message then opens
https://ig.me/m/<username>; it cannot prefill or send a DM. The Android v0.3 wrapper copies via
ClipboardManager and targets com.instagram.android with ACTION_VIEW, with a browser fallback.
The narrow custom URL only works from the trusted cafe HTTPS main frame; no JS interface or
Instagram API credentials are used. Older wrappers fall back to the copy-text UI. The owner
confirmed the target ig.me link opens the desired conversation on their phone; the updated
app's end-to-end paste/send flow still needs a phone test.

## Account-based Instagram orders
Shop orderMode=instagram reuses products/cart/order storage and adds a tenant-local durable outbox.
See [instagram-orders.md](instagram-orders.md) for sender management, credentials, addresses and failures.

## Live order inbox and inline controls (2026-11-06)
The existing TanStack Query caches are invalidated by authenticated SSE at GET orders/live,
not by periodic order-list polling. Tenant migration 014 emits payload-free PostgreSQL NOTIFY
on committed changes to orders/items/payments/delivery. One LISTEN connection per active tenant
is shared across SSE subscribers. Events contain no customer data. Normal API reads still enforce
permissions; streams reconnect after 60 seconds through authentication middleware. A 20-second
comment heartbeat prevents idle buffering. Hidden browser tabs close the stream; reconnect sends
an initial invalidation to reconcile missed changes. X-Accel-Buffering: no supports the studio proxy.
No WebSocket/Socket.IO dependency was introduced. The existing sidebar summary polling is separate.

Order stage selectors reuse PATCH orders/:id and the existing transition/stock/notification rules.
Manual payment schema and PATCH orders/:id/payment-status add audited offline receipt/refund flags
for payments:manage staff only. Gateway-backed or online orders are rejected; no transfer/refund
is executed, no price is invented and no gateway payment row is created. Existing gateway recheck
remains the source for online payment status. Quotes can have a manual receipt flag while their
amount remains unknown; invoice/payment restrictions stay in place.

The last column opens an accessible portal preview on hover/focus/tap. It reuses GET orders/:id
with preview=true to suppress the existing mark-read side effect; the full detail route keeps it.
Preview data is lazy and reused through TanStack Query; no duplicate product/order model.
Tests: order-inbox.test.ts (five real database/HTTP tests including SSE), order-live.test.tsx
(two cache/stream lifecycle tests). Latest suite counts are maintained in docs/STATUS.md.
Manual guide: ../guide/order-inbox.md.

## Rapid walk-in orders (2026-11-06)
Existing infrastructure reused: product categories/photos, prices/discounts, variants/options,
cartOps/lineKey/subtotal, Modal/Button controls, createOrder transaction/stock/limits, orders/items,
staff audit/timeline, invoice, manual payment and SSE invalidation. No parallel catalog, cart
storage, order model or migration was added.

New pieces: WalkInOrder.tsx modal on Orders with category chips, photo/name cards, search, plus/minus,
receipt above the menu, optional note and confirmed-order submission.
Unpriced items remain visible but cannot be added (catalog prices are required; manual price overrides are unsupported).
Public-upload images use their local /files/public path so the loopback panel does not need the
public tunnel to load its own photos. Catalog paging is reused through fetchAll; no 100-item cap.
Drafts stay in the mounted component when closed and reset after a successful save or page refresh.

POST /sites/:siteId/orders uses shared walkInOrderSchema and requires orders:write plus products/orders
modules and staff CSRF. It accepts requestId, catalog lines and optional note only; client prices,
status or customer identity cannot be injected. createOrder's trusted fourth parameter comes only
from the authenticated staff route. It bypasses public customer/shipping questions, uses priced
published/available products, writes Confirmed in the original insert, and records the actor/source.
customer.source=walk_in and customer.staffId distinguish receipts without changing the table model.
The existing request_id index and a staff/request advisory lock deduplicate concurrent retries.
The receipt is offline/Unpaid initially and has no public buyer token, account or Instagram job.
The existing stock, quantity limits, currency checks, discount rounding, cancellation restoration,
manual payment and invoice behaviour remain available. Server totals are authoritative on save.

Four new API tests in walk-in-orders.test.ts pass (concurrent idempotency, authoritative variant/
discount pricing, bypass of public checkout, role/CSRF/input guards, unpriced/unavailable stock,
cancellation restoration and independent next receipt). Full API: 120/120; web 50 pass / four
baseline failures (54 total). Owner catalog now has 24 priced products. Browser integrated test
saved labelled walk-in order #1006 (latte + chocolate cake, 300,000 IRR), immediately Confirmed;
local photos, category filtering, plus/minus and repeat receipt were inspected.
Guide: ../guide/walk-in-orders.md.

## Fit-to-window update (2026-11-06)
The POS modal now uses opt-in fullScreen on the existing Modal, an area-driven ResizeObserver
menu grid, a single horizontally scrolling receipt strip, larger bold full-width +/- controls,
and closes on successful save with a toast. No order API behaviour changed. Verified 24 visible
cards with no vertical menu overflow in a 542x884 viewport, including a five-line receipt; the
receipt overflow is horizontal only. A labelled test order #1012 confirmed and the modal closed.
User asked to stop repeated/manual validation after relevant tests; future work should follow that.

## Category rows (2026-11-06)
Shop page settings offer grid (default) or category-rows: ordered category headings with compact,
keyboard-focusable horizontal product rows. URL search/category/sort still apply. Catalog cards,
stock/variants/pricing and add-to-cart are reused. Mobile cards are 160px wide with landscape
images (roughly 103px high); desktop cards are 192px. No separate order model is introduced.
Products sections also offer grid/horizontal layout in the builder. Cafe enables category rows
and horizontal sections on its existing menu/products pages. Manual visual review is by owner.

## Cart presentation (2026-11-06)
Built-in cart now uses compact image/name cards, accessible large +/- controls (existing quantity
limits), per-line totals and separate removal. Summary and checkout follow the list on mobile,
with desktop sticky summary. Empty cart has a menu CTA. Prices still honor showPrices and all
cart/checkout APIs, line keys, variants and quantity rules are unchanged. App-style navigation
uses a compact heading; page slots and builder system-page embedding remain supported.

## Add-to-cart quantity feedback (2026-11-06)
AddToCartButton reads the matching product/first-colour/no-variant cart line quantity instead of
showing a hard-coded one after clicks. All duplicate cards stay in sync; clear/remove hides the
status. Add is disabled at the existing product/shop/stock cap. A real CartProvider regression
test covers repeated clicks (1/2/3), cap and clear; no order API changes.

## Mobile rapid order tiles (2026-11-09)
Below600px menu area width, each photo tile is a single native button: repeated taps add one
selected line, quantity badge reflects the receipt; decrement stays only in the horizontal
receipt above. White two-line name/price sits on a94% opaque dark label independent of image.
Category chips are one horizontal row and search/note compact. Area-driven grid allows narrower
mobile columns; minimum44px rows prevent unreadable collapse, with vertical scroll only if
content cannot fit. Variant/option selects remain independent sibling controls; such cards
reserve92px minimum. Desktop retains the existing +/- presentation. Fullscreen mobile dialogs
focus a button instead of an input to avoid opening the keyboard over the menu. No pricing,
stock, receipt persistence or order submission behaviour changed.
