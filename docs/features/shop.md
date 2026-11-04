# Shop

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
