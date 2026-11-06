# Cafe Mohammad — local first draft

- Branch: `feature/local-matstack` (from `develop`).
- Studio preview: http://cafe-mohammad.preview.localhost/fa
- Admin: http://admin.localhost/admin (select Cafe Mohammad).
- Source: https://www.instagram.com/cafe_mohammad_/ (viewed 2026-11-06).
- Palette: orange logo, warm cream, dark brown/black text. Theme id `mohammad`.
- Pages: home, menu, about, gallery, reservation, contact, FAQ.
- Six source images including the logo are stored in the site's asset library; local originals
  are in ignored `var/cafe-mohammad/`. Images are from the cafe profile, including reel covers.
- Address, two phone numbers, opening hours and city delivery are taken from the profile.
  Menu names are based on its captions; prices, exact recipes and availability are not asserted.
- Reservations await confirmation. Account checkout and server-side Instagram order delivery
  are installed; online payment is not enabled. SMS verifycode is configured; see current limits.
- This cafe has an isolated client install and Matstack tunnel, both intentionally stopped by
  the owner on 2026-11-06. Liara remains independent and unchanged.
- Current operating state, restart steps and open work: [operations.md](operations.md).
- Later sections record the implementation history; old share-based flows are superseded by
  integrated Instagram ordering. Latest APK is 0.4.0, not the older download examples below.

## Rebuild the content

Run from the repository root with the studio containers running:

```powershell
node tools/cafe-mohammad/build.mjs --inspect
node tools/cafe-mohammad/build.mjs
```

The script uses existing project APIs on `127.0.0.1:4000`, validates through their schemas,
creates a dedicated site, uploads images, saves settings and publishes builder pages.
It refuses to replace an existing site by default. `--update` explicitly replaces this cafe's
page designs/settings and uploads another copy of the six images; do not run it after manual
builder changes unless replacement is intended. `STUDIO_PASSWORD` overrides the local default.
`CAFE_ASSETS` overrides the source-image directory. No secrets are written into the script.
Site content lives in Docker database/upload volumes, not Git: use the studio backup/package tools
before migrating machines. The script alone does not include the ignored source photos.

## Follow-up

The isolated install/tunnel are complete. Next: resume only when requested, let owner review
current phone layouts/APK 0.4.0, and finish the verifycode provider template opt-out line.

## Verification (2026-11-06)

- Script syntax and inspection mode pass; project typecheck passes.
- Browser: inspected home, menu, corrected logo and reservation fields.
- Reservation submission, SMS/email delivery and mobile layout are not yet tested.
- No API/application behavior changed, so backend tests and container rebuild were not run.


## Illustrated menu (2026-11-06)

The menu now has 24 proposed items: six each in breakfast, coffee, cold drinks, and cakes/desserts.
A filterable gallery provides the categories. Photos are illustrative Unsplash stock, not photos
of dishes served by the cafe; the page explicitly labels the menu as proposed. No prices added.
Sources: photo IDs in the download scripts, originals in ignored var/cafe-mohammad/menu.
Update only the menu with node tools/cafe-mohammad/update-menu.mjs. The full build also uses menu.mjs.


Typecheck passes after the menu/navigation change. Web tests: 39 pass, 4 fail; the same four
failures reproduce with the original HEAD MobileMenu (product results, checkout, two admin access
tests), so they are pre-existing in this checkout/environment. API tests were not rerun because
no API code changed. Browser verified the category filter renders six dessert cards on mobile.


Studio web Docker image rebuilt and container restarted. On a 390px browser viewport, the opened
mobile menu contains exactly one Home link. Category filtering and dish images were inspected.


## Public local install and Android (2026-11-06)

Independent Docker package now runs on loopback 8725 behind the live Matstack tunnel.
Public site: https://tunnel_5clqhcidslu.mattunnel.ir/fa ; public menu and settings API verified.
See deploy/matstack/README.md for the package and restart commands, mobile/cafe-mohammad/README.md
for the Android project. Debug APK: exports/cafe-mohammad-debug.apk. Android install/runtime has
not been tested because no phone or emulator is connected. Liara remains unchanged.

## Round site logo (2026-11-06)

The cafe-specific meta.headCode contains style id cafe-round-logo, rounding only header/footer
logo images with CSS. Applied through the existing settings API to both studio and installed
site by tools/cafe-mohammad/update-logo.mjs (container --cell uses its operator environment).
The image asset and Android launcher/splash logo were not changed. No app rebuild is required.


## Cart + local order sharing (2026-11-06)

Cafe menu items are now real editable Products (24, four categories). Menu uses builder Products
sections with Add to cart; header cart enabled. Shop mode `share`, recipient hint
`Instagram: @_mehdi__hamze`, prices hidden. No Instagram connection, auto-DM, server order or
payment. Recipient is selected by the customer in their device chooser. This is a test recipient.

Operators can reproduce/edit everything in the UI: docs/guide/share-orders.md. Bootstrap script:
`node tools/cafe-mohammad/enable-orders.mjs` (cell: copy it and menu.mjs into the API container,
run with --cell). It updates this cafe's matching product slugs, menu and shop settings, so review
manual edits before rerunning. The earlier gallery-only menu script does not configure ordering.

Public package now uses sb-api-runtime:cafe-share and updated static site. Its previous static
files are preserved under site-before-share. Android version 0.2.0 (2) adds native Sharesheet;
use the new APK for tests. Public test download: /downloads/cafe-mohammad-0.2.0.apk.

Direct Instagram destination is now an editable Shop setting. Test username `_mehdi__hamze`;
web copies and opens its ig.me conversation, Android 0.3.0 copies and opens Instagram directly.
No API account integration, message prefilling or automatic delivery. Owner verified that the
conversation link opens correctly on their phone. Updated app flow still needs a phone test.

## Integrated Instagram ordering (2026-11-06)
Cafe checkout now requires a customer account and saved profile address, saves a real quote order,
then queues automatic server-side DM delivery. Browser test order #1001 reached sent with message id.
Owner sender settings/status/code entry: http://localhost:8727/admin -> Shop.
Phone/password signup without SMS is enabled; public admin remains blocked. Public menu returned 200.
See docs/guide/instagram-orders.md for manual operation and docs/features/instagram-orders.md for limits.

## SMS configuration (2026-11-06)
Installed cafe messaging uses the existing Kavenegar account and OTP template `verifycode`.
SMS is enabled; credentials are encrypted in its control database. No real test SMS was sent.
Signup still uses phone/password without SMS verification. The template itself still needs
the final opt-out line added in Kavenegar; see docs/STATUS.md.

## Mobile app-style navigation (2026-11-06)
Enabled bottom navigation in studio and installed cafe: Home, Cafe menu, Cart, Account, plus
More for the complete menu. Configure in studio Settings > Header > Mobile navigation;
choose drawer or bottom, then edit up to four link labels/destinations/icons and save.
Reproducible configuration: tools/cafe-mohammad/enable-mobile-navigation.mjs (--cell inside cell API).
Typecheck and two focused navigation tests passed; manual phone testing is left to the owner.

## Compact horizontal menu (2026-11-06)
Cafe shop page uses category headings and compact horizontal product rows. Existing menu/products
page product sections use horizontal layout too. In studio Settings > Shop page choose category
rows, or edit a Products section in the builder and choose Compact horizontal row. Grid remains
available. Reapply cafe settings with tools/cafe-mohammad/enable-category-rows.mjs (--cell in cell).
Typecheck/11 focused tests passed; visual acceptance is left to the owner. No APK update needed.
