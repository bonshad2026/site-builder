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
- **Payments** (`src/modules/payments/`): gateways Zarinpal, Zibal, IDPay and a `sandbox` test gateway
  (`gateways.ts`); test modes move no money. Gateway settings per site in Settings.
- **Reviews** (`product_reviews`): new ones wait for staff approval. **Newsletter** subscribers
  (`subscribers`, newsletter section). Wishlist in `src/features/wishlist/`.
- Products are also a source for "List from a table" (`source: 'products'`, `listProductsAsItems`).

Tenant migrations: `001_init.sql`, `002_payments.sql`, `003_shop_options.sql`,
`004_requests_and_product_details.sql`, `005_order_statuses.sql`, `010_shop_extras.sql`.
