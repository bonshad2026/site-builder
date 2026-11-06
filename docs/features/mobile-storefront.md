# Mobile storefront and reusable presentation

These are per-site product capabilities, available independently of any client deployment.
Local domain, credentials, sample content and deployment state belong in docs/clients/, not here.

## Settings and defaults

| Capability | Configuration | Default / constraints |
|---|---|---|
| Mobile navigation | Settings > Header: header.mobileNavigation | drawer; optional bottom below 1024px |
| Bottom destinations | header.mobileLinks | max 4 localized label/href/icon entries, plus More |
| Catalog grouping | Settings > Shop page: shopPage.layout | grid; optional category-rows |
| Product section layout | Builder > Products: layout | grid; optional horizontal |
| Stats cards | Builder > Stats: layout and items[].icon | plain; optional cards |

Bottom links can use home, coffee, bag, user, heart, receipt, phone or grid icons. Empty mobileLinks
uses Home plus module-aware Products, Cart and Account defaults; explicit links are operator-selected
and do not enable missing modules. More opens the existing full menu including submenus/preferences.
Navigation preserves route-active state, RTL, cart count, keyboard access and bottom safe-area space.
On desktop the standard header remains. Mobile bottom mode uses a sticky in-flow opaque header,
hides duplicate cart/account tools and reduces shared heading/account/hero top offsets.
Changing header starters carries these settings; no tenant migration is needed.

## Catalog rows and compact cards

category-rows groups currently filtered catalog results under configured category headings, followed
by categories not listed in settings. Products without a category use the localized All label.
Search and URL category/sort filters continue to apply; empty groups are omitted.
ProductRail uses existing ProductCard/AddToCartButton: 160px cards on mobile, 192px from sm, landscape
images, horizontal touch scrolling, keyboard-focusable region, snap alignment and inherited RTL.
The per-section horizontal option presents its existing category/filter/limit selection in one row;
it does not automatically split a multi-category section. Use one Products section per category
for a manually composed menu, or category-rows on the catalog for automatic grouping.
Prices, stock, colors, variants, max quantity and product details retain their original logic.

## Cart and quantity feedback

CartPage remains the existing built-in/system page with before/after slots. Presentation includes
small image cards, independent removal, accessible +/- buttons, per-line totals, summary and empty
state. It honors showPrices and existing checkout mode; it adds no order API or payment behavior.
Line/subtotal arithmetic uses integer minor units (BigInt). Quantity controls reuse cartOps limits.
AddToCartButton displays the matching existing cart line quantity, not a local click counter.
Its default first-color/no-variant selection is unchanged; repeated cards stay synchronized and
remove/clear updates the message. At the existing cap Add is disabled. Customer data stays in the
same cart storage; there is no separate mobile basket.

## Square Stats cards

cards retains three equal columns and square surfaces, centered value/label and theme accent SVG
icons: clock, pin, coffee or star. It reuses existing Stats items; text remains editable. The schema
still permits up to eight items, which wrap to further rows; it does not enforce exactly three.
Plain layout remains unchanged for sites that do not select cards.

## Code and verification

- Shared validation: packages/shared/src/siteOptions.ts and sections.ts.
- Builder: admin/pages/SiteOptionsTabs.tsx; admin/builder/fields.ts.
- Rendering: components/layout/MobileBottomNav.tsx, Header.tsx, SiteLayout.tsx;
  features/public-site/components/ProductRail.tsx, Cards.tsx; sections/renderers.tsx.
- Spacing: scoped data-app-navigation rules in styles/index.css.
- Cart: features/cart/CartPages.tsx, AddToCart.tsx, cart.tsx.
- Regression coverage: mobile-bottom-nav.test.tsx, add-to-cart-count.test.tsx and cartOps tests
  in builder.test.ts. These do not establish device appearance; visual acceptance is separate.
- No new library or database migration. Existing sites default to prior navigation/list/stats layouts.

User instructions: [mobile storefront guide](../guide/mobile-storefront.md).
Android shell inset handling is an application integration detail in mobile/cafe-mohammad/README.md,
not a requirement for using these storefront options in a browser or another application shell.
