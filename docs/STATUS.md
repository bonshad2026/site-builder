# Status

Where the work stands, for whoever (person or agent) continues it. Newest first. Keep it short:
update it at the end of every session (see "End of every session" in [`AGENTS.md`](../AGENTS.md)).

## Now
- **Owner-requested commit checkpoint (2026-11-08)** — Product fixes committed as `7708730`
  on feature/local-matstack: account/tracking fixed-header clearance, customer session refresh
  on mount/focus with regression coverage, protected-form session loading, empty form heading
  suppression. Typecheck passed; latest web54 pass /4 baseline failures (58 total); interaction
  API15/15 passed. Studio-web rebuilt and spacing visually inspected on preview. Earlier
  uncommitted entries below are historical for the captured changes. Real signed-in request
  submission still awaits owner confirmation; no real request or SMS sent by the agent.
  Static request-training intro was updated in the studio DB; Git stores its operational record,
  not the tenant page data. Local installation remains unchanged. Owner requested branch push
  only; no merge. Next: confirm course request flow, then deploy local when ready.

- **Remove empty request heading band (2026-11-08, uncommitted)** — ContactFormSection now
  omits its heading band when localized heading/eyebrow/intro and labelled link buttons are
  absent. Firefighter request-training already has a separate page-header: measured extra
  empty band257px before, absent after; form section now starts at the main heading bottom
  (417.25px at inspected desktop width). Studio-web rebuilt; browser screenshot verified,
  typecheck and diff checks passed. No new tests for this low-impact rendering condition;
  previous web54/58 baseline unchanged. Docs HTML regenerated. Local installation unchanged.
  Screenshot: firefighter-form-spacing-fixed.png. Real signed-in request flow still awaits
  owner confirmation of the preceding session refresh fix; this change only removes spacing.

- **Customer session revalidation (2026-11-08, uncommitted)** — Owner reports dashboard on
  preview /account but login gate on training form. Reproduced a cached anonymous result that
  did not refresh on mount/focus after another tab signed in (regression failed before fix).
  useCustomer now revalidates on mount/focus even for fresh cached results; protected request
  forms wait for anonymous-session revalidation before showing login. Regression passes for
  cross-tab login and logout; typecheck clean, full web54 pass / same4 baseline failures (58).
  Studio-web rebuilt and preview loaded; test browser has no customer session, so owner must
  reload and verify with their actual session before claiming the reported flow fixed. No real
  request/SMS submitted and installed local site unchanged. Next: owner tests request-training;
  investigate further if still blocked, then validate submission before local deployment.

- **Training request investigation (2026-11-08, content change)** — The reported invitation to
  sign in was static request-training page-header intro, not an authentication error. Replaced
  only that intro via authenticated page API and published to studio preview; refused pending
  drafts and backed up the prior document in ignored var/. Installed site unchanged. Script
  completed the publish but its logout response parser failed on HTTP204; browser confirmed
  the published text. Course technical-rescue CTA retains type=training and item=courses/technical-rescue
  on the same preview host. Training is signed_in, no payment on submit. Existing interaction
  tests 15/15 passed on test DB. Browser available to agent currently shows no customer session;
  owner reports OTP login on preview. Awaiting whether /fa/account in owner's browser shows
  dashboard or login before diagnosing session loss. No real request or SMS sent; full customer
  submission has NOT been validated. Earlier account-spacing changes remain uncommitted.

- **Account tabs clear desktop header (2026-11-07, uncommitted)** — Account, tracking and case
  containers now use the inner-page heading clearance (pt-36 / sm:pt-44); existing mobile
  bottom-navigation spacing override retained. Reproduced firefighter at 1440x900: tabs top96
  overlapped fixed two-row header bottom116. After studio-web rebuild, tabs top176; both tabs
  clicked successfully without submitting forms. Mobile390: header bottom68, tabs top144.
  Typecheck and diff checks passed; docs HTML regenerated. CSS-only spacing change, no new tests;
  latest suite baseline remains API134/134 and web53/57 with four documented failures.
  Screenshot: firefighter-login-desktop-fixed.png in the chat visualization directory.
  Next: owner reviews preview; collect further fixes before updating the installed local site.
  Installed firefighter package remains unchanged; no merge, commit or push for this fix yet.

- **Owner-requested commit checkpoint (2026-11-07)** — Committed as `d6e3fa0`: firefighter studio
  import, member/review compatibility, isolated tunnel and operational documentation on
  feature/local-matstack; no merge or client update application. Fresh typecheck passed; full
  API 134/134 passed, web 53 passed / the same 4 documented failures (57 total, AbortSignal
  mismatch and product result-count expectation). Script syntax and diff checks passed; studio,
  firefighter preview and private admin returned HTTP 200. Previous rebuild/browser evidence
  remains in the handoff; no new runtime code edits or repeated visual QA in this checkpoint.
  Secrets, exports and generated tsbuildinfo excluded. Next: owner-directed firefighter edits.

- **Next-chat handoff written (2026-11-07, uncommitted)** — Read
  [handoffs/2026-11-07-local-sites.md](handoffs/2026-11-07-local-sites.md) for current branch,
  staged/unstaged task-owned changes, two active tunnels, isolated installs/studio copy, restart
  overrides, successful update artifact, tests and pending limitations. Runtime left running.

- **Firefighter public tunnel active (2026-11-07, uncommitted)** — Separate Matstack agent/key
  under deploy/matstack/firefighter/.env (ignored); domain tunnel_ikwlc5hk4ly.mattunnel.ir,
  origin loopback8735. Private owner panel moved to localhost:8737/admin; public /admin/private
  staff APIs blocked by dedicated Caddy config. Production/panel messaging, no dev OTP exposure.
  Four source pages + versions remapped from local to public origin. Original API image/data
  preserved; studio and cafe tunnel untouched. Public site/private panel 200, public admin404,
  cafe public200. Agent launched hidden; parent PID in ignored firefighter/logs/launcher.pid.
  Generic start.ps1 now accepts optional ConfigPath, retaining cafe defaults. Restart/install
  config scripts and operational docs added; new design update archive is still not applied.

- **Firefighter editable in studio + update built (2026-11-07, uncommitted)** — Imported independent
  design copy from installed original: 40 pages, 27 assets, 4 collections, 22 content items;
  zero customers/orders. New tenant created through provisionTenant, files remapped from original
  storage namespace (different from cell id), design schemas validated before/after copying.
  Studio pages: http://admin.localhost/admin/sites/firefighter/pages; preview:
  http://firefighter.preview.localhost/fa. Actual installed source stays on localhost:8735.
  CUA verified home opens with rendered design; temporary heading edit saved successfully then
  original text restored/saved, never published. Screenshot firefighter-studio-builder.png.
  Existing deploy service built firefighter-update-20261107-0943.tar.gz successfully in exports/;
  not applied to the installed site. Original delivery secrets retained privately in control-data.
  Both source and cafe returned 200 afterwards. No Liara code imported or deployment performed.
  Required compatibility reused original faa5f39 implementation + follow-ups and visitor themes:
  member profiles/files/reviews, list/rating blocks, item-reviews, table form choices, submenu20.
  Moved members migration to new 015 with old-schema-safe guards; did not edit applied migrations.
  Full API 133/133 before final idempotency adjustment; targeted members/old-delivery upgrade
  11/11 after it (134 tests now). Full web 53 pass/4 baseline failures (57); typecheck and studio
  builds clean. Import first attempt rolled back due pg_dump search_path; corrected public.*
  statements, then restored. Initial assumed storage id was wrong; derived actual namespace.
  Generic workflow documented in features/studio-import.md; helpers under tools/delivery/.
  No automatic sync between studio and installed content. Review client edits before applying
  a design update. Next: owner edits/publishes in builder and builds through /deploy/.

- **Firefighter local package installed (2026-11-07, operational change)** — Copied owner archive
  firefighter-20261104-0844.tar.gz into standard ignored exports/ and extracted beside cafe.
  Original image sb-api-runtime:20261104-0844, separate project site-firefighter and own volumes.
  Loopback site/admin on localhost:8735, unused HTTPS binding 8736; no tunnel. Development
  console messaging only. Site/admin/settings API returned 200; cafe still 200 and untouched.
  Installed client admin supports content editing; full structural builder needs isolated studio
  import, not yet attempted. Next requested investigation: editability through studio admin.
  Details: clients/firefighter/README.md. No product code changed or tests/rebuild needed.

- **Resumed on owner request (2026-11-07, operational change)** — Studio, installed cafe,
  Instagram worker and hidden Matstack launcher restarted from saved configuration. Cafe local,
  owner panel, studio admin/deploy and public tunnel /fa all returned HTTP 200. No test message
  or order sent; worker container running does not establish Instagram delivery readiness.
  NVIDIA Broadcast owns host 8080; control resumed using ignored var/studio-resume.compose.yml
  with ports !override to loopback 8081:8080. admin.localhost/deploy/ stays unchanged. On subsequent
  studio compose up include this override while 8080 is occupied. Test Postgres remains stopped.
  Earlier shutdown checkpoints below are historical. Product code remains at cd504bb;
  this restart note is not committed. Open phone/template items remain unchanged.

- **Committed handoff (2026-11-06)** — Product changes, local deployment sources and independent
  feature/operator docs committed as 5c06c83 (Add mobile storefront and managed order workflows)
  on feature/local-matstack. Owner requested commit and push of this branch only; no merge.
  Earlier uncommitted labels below describe historical checkpoints. Services remain stopped.
  Secrets, exports, backups, runtime files and generated tsbuildinfo were excluded.

- **Current handoff — intentionally stopped (2026-11-06)**
  Owner asked to shut down until tomorrow. Cafe, Instagram worker, studio, test Postgres and
  Matstack agent are stopped; containers/volumes/data preserved. Do not start on your own.
  Resume checklist: [cafe operations](clients/cafe-mohammad/operations.md).
  Branch feature/local-matstack; work is now committed (see handoff above); no merge requested.
  Installed package: exports/cafe-mohammad-20261106-0913; public domain remains configured,
  but is offline during shutdown. Owner panel when running: http://localhost:8727/admin.
  Latest APK: 0.4.0/version4; inset fix built, phone appearance awaits owner confirmation.
  Cafe has account/address checkout, durable Instagram order delivery and managed sender;
  staff have live Orders, inline stage/payment updates, quick view and rapid walk-in ordering.
  Latest design: bottom navigation, compact category rows, redesigned cart, reduced mobile top
  spacing, three square home icon cards. Add-to-cart feedback now reads actual cart quantity.
  User handles visual acceptance; do not repeat manual QA after focused checks without request.
  Last full API run: 123/123. Last full web run: 50 pass /4 pre-existing failures (54 total);
  three subsequently added focused tests pass (two navigation, one cart count); full 57 not rerun.
  Last typecheck clean; latest client/studio builds succeeded. No real SMS/order sent for UI fixes.
  SMS verifycode enabled in installed cafe; signup remains phone/password without mandatory SMS.
  Still open: add exact opt-out footer to provider verifycode template; confirm APK bottom-space
  fix on owner's phone; owner reviews latest designs. Liara remains untouched.

- **POS layout fit + SMS footer (2026-11-06, uncommitted)** —
  Owner clarified receipt should be a single horizontally scrolling strip, menu cards shrink to
  fit without vertical scrolling, larger bold +/- controls, and close after successful save.
  Added opt-in fullScreen to existing Modal and ResizeObserver-based grid. Browser verified all
  24 cards fit at 542x884, no menu vertical overflow, horizontal-only receipt with five items;
  labelled test order #1012 saved Confirmed and modal closed with toast. Screenshot walk-in-fit.png.
  Typecheck clean; web 50 pass / same four baseline failures (54). Studio/client web rebuilt.
  Owner then requested every SMS end with a new line "لغو ۱۱". Added idempotent footer formatting
  to console and Kavenegar text adapters and console OTP text, preserving numeric OTP codes.
  Three new mocked tests pass; full API 123/123; API images rebuilt/deployed. No real SMS sent.
  Kavenegar OTP template verifycode in studio account still needs its footer added in provider
  console: template APIs omit fallback policy while secondary line is set, so maintenance tool
  stopped without mutating that template rather than resetting its delivery policy. Installed
  cafe SMS configuration was subsequently enabled (see current handoff above). Do not claim the live OTP template footer is finished.
  Preserved owner's separate edit to apps/api/src/modules/platform/messaging.ts (test text).
  Preference: after relevant tests pass, stop repeated/manual validation; owner will test and report.
  Remaining: owner edits verifycode template final line in Kavenegar; optional resume assistance.
  Work uncommitted on feature/local-matstack; no push/merge requested.

- **Rapid walk-in ordering (2026-11-06, uncommitted)** —
  Owner requested a fast category/photo/+/- POS modal on Orders with receipt above and direct
  Confirmed creation. Owner chose catalog pricing and filled all 24 installed cafe prices.
  Reused categories, assets, price/discount helper, cartOps, Modal/Button, createOrder, stock/
  quantity/currency checks, invoices, manual payment and SSE. Added WalkInOrder.tsx and private
  POST /sites/:siteId/orders (orders:write, CSRF); request accepts no customer/price/status overrides.
  Staff orders are inserted Confirmed atomically, offline/Unpaid, customer.source=walk_in,
  actor audited, no customer account/shipping requirement and no Instagram job/public buyer token.
  Staff/request advisory lock and existing request_id column deduplicate concurrent saves.
  No new table, migration, parallel catalog/order model or invented prices.
  Category/search/photo cards and receipt +/- tested; draft survives close in same page and
  resets after saving. Modal stays open for next receipt. Uploaded images load on local panel
  origin to remove tunnel dependency; photos visually inspected after correcting that issue.
  API 120/120 (four new walk-in tests), web 50 pass / same four baseline failures (54 total);
  typecheck clean, studio + installed cafe rebuilt. Browser at localhost:8727 saved labelled
  test order #1006 (latte + chocolate cake, 300000 IRR), immediately Confirmed, no delivery job.
  admin.localhost also shows the new button. Existing owner orders were not changed.
  Guide: docs/guide/walk-in-orders.md; design/reuse details in docs/features/shop.md and developer
  guide. Screenshot: walk-in-receipt.png in thread visualization directory.
  Uncommitted on feature/local-matstack. Next: owner refreshes once and tries their normal
  walk-in workflow; no push/merge requested.

- **Live order inbox, inline stages/payment, quick preview (2026-11-06, uncommitted)** —
  After owner's traffic question, implemented push through SSE + existing TanStack Query caches,
  replacing the proposed two-second polling approach. Tenant migration 014 uses transactional
  PostgreSQL NOTIFY for orders/items/payments/Instagram outbox, with a shared per-tenant listener.
  Staff stream is authenticated, payload-free, heartbeat/reconnect enabled; hidden tabs disconnect.
  Existing order transition API/rules/stock handling are reused by inline table selectors.
  New audited manual payment status endpoint permits payments:manage staff to record offline
  receipt/refund only; gateway transactions remain under existing verification/recheck.
  Lazy portal quick view in the last column reuses order detail with preview=true (no mark-read),
  supports hover/focus/tap. No new socket dependency or parallel order model.
  Typecheck clean; API 116/116; web 50 pass / same 4 baseline failures (54 total).
  Five new real DB/HTTP API tests and two stream/cache lifecycle tests pass.
  Studio and installed cafe rebuilt. Browser checks at admin.localhost and localhost:8727 both
  show Live updates connected. Changed only labelled test order #1001 via a separate HTTP client:
  the open table changed Pending -> Confirmed without reload, proving push through Caddy.
  Inline manual payment Paid -> Unpaid tested/restored on #1001; preview contents inspected.
  #1002/#1003 (owner's orders) were not modified. No extra Instagram test message sent.
  Screenshot: orders-live-preview.png in the thread visualization directory.
  Guide: docs/guide/order-inbox.md; architecture: docs/features/shop.md and developer guide.
  Changes remain uncommitted on feature/local-matstack. Next: owner refreshes once for new JS,
  then checks arrival of their next order and hover preview.

- **Account checkout + managed Instagram sender (2026-11-06, uncommitted)** —
  Cafe now uses orderMode=instagram on studio and installed Matstack site. Existing products/cart
  feed real customer-linked quote orders and a tenant-transactional durable outbox. Phone/password
  signup without SMS is enabled for cafe only; verified signup remains the default elsewhere.
  Profiles store up to ten named addresses; staff can inspect them. Session identity/address
  ownership are checked server-side; unverified accounts cannot claim old guest cases by phone.
  Owner Shop settings manage encrypted sender credentials, connect/disconnect, status/errors,
  heartbeat and a verification-code prompt. New sender credentials imported from the owner's
  local file and connected successfully (no code requested). Dedicated restricted-role worker
  is running. Failed/ambiguous sends are held without automatic retry or a retry button.
  Migrations 012/013. Typecheck clean; full API 111/111; web 48 pass / same 4 baseline failures.
  Both studio and installed containers rebuilt. Browser test: signup, saved address, basket,
  Place order -> #1001, then owner order detail showed Instagram: Sent; DB has message id.
  The test explicitly says it is not a real order. Recipient confirmation of #1001 is pending.
  Public Matstack menu/settings returned 200; public admin remains 404. Owner panel is
  http://localhost:8727/admin (loopback only), Shop settings. Public checkout uses same-origin
  API; existing APK loads it without rebuilding. Guides: docs/guide/instagram-orders.md and
  docs/features/instagram-orders.md. Real challenge/2FA flow remains untested.
  Next: owner tests signup/address/order from their phone and confirms the integrated DM.

- **Instagram test DM accepted (2026-11-06, uncommitted)** —
  Owner authorized one test DM to _mehdi__hamze. send-test.py reused the replacement sender's
  saved session, validated it, resolved the approved recipient, and direct_send returned a
  message id (accepted_by_instagram). Text explicitly says it is a connection test, not a real
  order. No retry. Recipient inbox/read confirmation is pending. This proves one API send,
  not production reliability; account-based checkout/address book/outbox remain unimplemented.

- **Replacement Instagram credentials: login succeeded (2026-11-06, uncommitted)** —
  Owner changed sender credentials and authorized a login attempt with interactive code support.
  login-only.py returned login_succeeded, persisted a username-isolated private session and
  sent no message. No verification code was requested. Previous PleaseWaitFewMinutes results
  refer to the prior credentials. Direct sending with the replacement account is still untested.
  Script now supports hidden challenge/2FA code input; docs in deploy/instagram-relay/README.md.

- **Instagram login-only retry (2026-11-06, uncommitted)** —
  Owner authorized exactly one more login attempt. login-only.py returned PleaseWaitFewMinutes
  again; no message was sent and no further retry performed. The initial inline invocation
  failed Python parsing before any Instagram request; the file-based invocation made the
  actual login attempt. Relay viability remains unproven.

- **Instagram relay real-account probe (2026-11-06, uncommitted)** —
  Owner supplied sender credentials locally. One login attempt returned PleaseWaitFewMinutes;
  no session file was saved, so the subsequent direct-send call was not reached. No retry.
  Account restrictions must be reviewed in the official Instagram app before another attempt.
  Relay viability remains unproven. No secrets printed; cafe deployment unchanged.

- **Account-based orders / Instagram relay investigation (2026-11-06, uncommitted)** —
  Owner rejected share/copy/open and requested signed-in ordering, reusable customer addresses,
  owner-visible customer profiles, and a dedicated sender account automatically messaging the
  site's fixed recipient (test: _mehdi__hamze). Existing tenant accounts/customer panel verified;
  address book and account-only request checkout are missing. Current signup needs a verified
  code (cafe delivery providers not configured); normal server orders reject unpriced cafe items.
  Design: docs/features/instagram-orders.md. Added isolated deploy/instagram-relay one-message
  instagrapi 3.2.4 feasibility probe; local .env/session ignored. Docker build and network-disabled dry run passed; missing-credential send stopped as intended.
  Owner chose phone/password signup without SMS (not implemented). Actual login/send requires
  owner's locally configured sender credentials; no real message sent. Full integration is
  NOT implemented; current deployed cafe still uses the previous share mode.

- **Direct Instagram checkout (2026-11-06, uncommitted)** — Shop settings support a device
  chooser or Instagram copy-and-open, with an editable validated username. Cafe test target
  is _mehdi__hamze. Owner confirmed ig.me opens its conversation on their phone. Android
  0.3.0 (3) copies natively and targets Instagram first; customer still pastes and sends.
  Public APK /downloads/cafe-mohammad-0.3.0.apk was downloaded and hash-matched to the signed
  build. Typecheck clean; API 105/105; web 48 pass / 4 baseline failures (52 total), all 9 new
  sharing tests pass. Admin destination/username controls inspected in the browser. Phone
  test of the updated app's copy/open/paste/send is still pending. No Instagram account/API
  connection. On resume, the tunnel agent was stopped while the local site stayed healthy;
  restarted using the same ignored config. Cafe guide: docs/guide/share-orders.md.

- **Builder share-order mode (2026-11-06, uncommitted)** — Shop settings now expose orderMode
  (checkout/share), recipient hint and price visibility. Existing products/cart plus configured
  checkout fields create a local text message and device chooser, not server orders/payments.
  Cafe has 24 editable products, builder product sections and cart; test recipient @_mehdi__hamze.
  Android 0.3.0 (3) adds native share/copy-and-open for trusted cafe origin. Debug APK rebuilt/signed.
  Typecheck passes; API 105/105; web 48 pass / 4 pre-existing failures (52 total), new share tests
  all pass. User guide: docs/guide/share-orders.md. Browser basket/text checked; actual Android
  Instagram recipient flow still needs owner's phone test. Liara unchanged.

- **Cafe round site logo (2026-11-06, uncommitted)** — cafe-specific CSS in meta.headCode
  rounds header/footer logos; settings applied in both studio and installed Matstack site.
  Script: tools/cafe-mohammad/update-logo.mjs. Image assets and APK unchanged.

- **Cafe Matstack + Android (2026-11-06, uncommitted)** — independent package
  exports/cafe-mohammad-20261106-0913 runs as site-cafe-mohammad on loopback 8725;
  Matstack agent is running and https://tunnel_5clqhcidslu.mattunnel.ir/fa/menu works.
  Public settings API returned 200, browser menu/images checked. Private admin/API routes are
  blocked on the public origin. Email/SMS panel providers remain unconfigured.
  Android source mobile/cafe-mohammad: logo, animated splash, WebView of the same domain, retry
  screen. Gradle build succeeded via Myket mirror; exports/cafe-mohammad-debug.apk signature
  verified. No connected phone/emulator: install/splash/WebView runtime remain untested.
  Next: owner installs debug APK and checks splash/navigation; production signing later.

- **Mobile Home link (2026-11-06)** — `Fix duplicate Home link in mobile navigation`
  (this commit): add the default Home only when the configured menu has no root link.
  Typecheck passes; studio-web rebuilt; a 390px browser check shows exactly one Home.
  Web tests: 39 pass / 4 fail; the same four failures reproduce with the original component.
  Cafe content and deployment work remain separate, uncommitted changes.
- **Cafe menu / mobile navigation (2026-11-06, uncommitted)** — 24 illustrated proposed menu
  items (4 categories x 6), uploaded stock photos and category filters. MobileMenu now adds
  its default Home only when settings.nav has no root link, preventing duplicate Home.
  Typecheck passes. Web tests: 39 pass / 4 fail, with the same failures on the original MobileMenu; see cafe client notes.

- **Cafe Mohammad local draft (2026-11-06)** — on eature/local-matstack, created from
  develop. Built through existing studio APIs with 	ools/cafe-mohammad/build.mjs; seven
  published Persian pages at http://cafe-mohammad.preview.localhost/fa, source photos/logo from
  the cafe Instagram, warm orange/cream custom theme, contact and reservation forms. No prices
  invented, payments off. See [client notes](clients/cafe-mohammad/README.md). No app runtime
  source or Liara configuration changed. Work is not committed. Next: owner review, isolated
  local package, then Matstack. Current checks are recorded in the client notes.

- Developer guide (`feature/dev-docs`, merged into `develop` 2026-11-03): the Persian developer guide in
  `docs/dev/` — 35 pages in 7 chapters (start, architecture, layers, features, recipes, operations,
  rules), every claim checked against the code, Mermaid diagrams parsed with mermaid 11, links checked.
  `docs/dev/index.html` (built by `npm run docs:html`, `tools/dev-docs/build.mjs`) opens the whole
  guide with a double click; rebuild it after editing. Keep it current with every change
  (`docs/dev/07-rules/docs.md`).
- User guide (`feature/user-guide`, merged into `develop` 2026-11-03): Persian, one short video per task.
  Sample page `docs/guide/payment-gateways.md`; videos and screenshots are recorded by
  `tools/guide-videos` (scenes with `shots` make screenshots) into `docs/guide/media/`, which is kept
  out of Git. Next: agree the list of guide pages with the owner, then add a scene and a page for each.
- Branch `feature/payment-gateways` (pushed and merged into `develop` on 2026-11-02): several gateways per
  site with the buyer choosing at checkout, a studio gateway catalog, operator control of which
  gateways each site may use, a transactions page with "check again", and "test connection". Gateways
  are drivers in `apps/api/src/modules/payments/drivers.ts`; see [features/shop.md](features/shop.md).
  Checked in the studio browser (settings, checkout choice, transactions, catalog). Not done: the
  customer's order/request tracking page still pays with the site's first gateway (no choice there);
  new gateways (Saman/SEP, Mellat, PayPing…) and a no-code custom gateway are not written yet.
- Branch `feature/review-fixes` (the owner's review list, one item at a time) is merged into `develop`.
  Done so far: "Refresh photos" shows only for sites that still have placeholder photos; empty-site test
  covers modules, tables and photos; "Site texts" is operator-only (hidden for clients, ignored by the API);
  new sites store version-2 forms and the "Consultation form choices" card is gone; the Modules tab
  shows only the four working switches with names and explanations; the content bank became
  **site kits**: per site type, copies of table starters with editable sample items and photos, plus
  lists (products, services, reviews, FAQ); sample data takes table items from the kit and can add
  kit tables a site lacks. The general kit holds the 6 ready-made tables.
  The owner deleted the studio sites that still had version-1 forms (`empty`, `3000`, `demo-beauty`,
  `871051`, `atelier-navar`) on 2026-11-02, without a backup.
- Branch `develop` holds everything; all feature branches above and below are merged into it.
  New review items go on a new branch from `develop`.
- `main` is behind `develop` (`git rev-list --count main..develop`); it is updated only when the owner asks.
- Tests: web 43/43, API 104/104 (2026-11-02, on `feature/payment-gateways`). Typecheck is clean (the
  old `shop.test.ts` error was fixed with the gateway `verify` signatures).
- The studio on the owner's machine runs the latest `develop` (rebuilt 2026-11-02, 52 ready-made starters added).

## Next (in this order, unless the owner asks for something else)
1. Payment choice on the customer's order/request tracking page (today it pays with the first gateway).
2. Sample data for **services** (setup and ready-made starters only turn the module on; service pages
   preview empty). See [features/site-setup.md](features/site-setup.md) and
   [features/starters.md](features/starters.md).
3. Ask the owner whether to delete the merged branches (local and on GitHub):
   `feature/payment-gateways`, `feature/studio-and-client-delivery`, `feature/builder-buttons-requests`, `feature/collections`,
   `feature/interactions`, `feature/starters-menu`, `feature/starter-packs`, `docs/agent-guide`, `docs/agent-start`.
4. Ask the owner whether `develop` should be merged into `main`.

## Open questions for the owner
- None waiting.

## Log
- **2026-11-03** — `feature/dev-docs`: Persian developer guide `docs/dev/` (index `docs/dev/README.md`); linked from `AGENTS.md` and `docs/README.md`.
- **2026-11-02** — `feature/payment-gateways`: tenant migration `011_payment_gateways.sql` moves each
  site's single gateway into `payment_gateways` (one row per driver) and drops the old columns of
  `payment_settings`; studio catalog in `app_settings` (`payment_catalog`); tests in `payments.test.ts`.
- **2026-11-02** — `feature/review-fixes`: site kits replace the content bank's kinds (control
  migration `006_kit_tables.sql`, `kit_tables`; see [features/site-setup.md](features/site-setup.md)).
- **2026-11-02** — `feature/review-fixes`: the sites list reports `placeholderPhotos` per active site;
  "Refresh photos" is shown only when it is above 0 (test in `provisioning.test.ts`). "Site texts" is
  operator-only: hidden in the client panel and dropped from client saves (test in `content.test.ts`).
  Default request types are stored as version 2; "Consultation form choices" removed; the web test of
  the old no-API demo form was dropped (the field-based form has no offline demo mode).
- **2026-11-02** — Agent guide: `AGENTS.md` (read by every agent; `CLAUDE.md` imports it), feature
  docs in `docs/features/`, docs index, legacy docs marked, this status file, pointer files for other
  tools ("Start here" routine). Commits on `docs/agent-guide` and `docs/agent-start`, merged into `develop`.
- **2026-11-02** — Starter packs (`feature/starter-packs`, merged): self-contained starters (tables,
  item pages, forms, box designs, photos, sample items), check-and-apply on any site incl. empty ones,
  replace to update, groups, Starters menu per kind (pages / tables / headers / footers), live previews
  with sample data, header and footer starters, account menu layouts, 52 ready-made starters.
  Details: [features/starters.md](features/starters.md).
- Earlier: studio and client delivery, content tables, interactions, site setup, content bank — see
  `git log develop` and the feature docs.

## Matstack local configuration (2026-11-06)
- Tunnel key stored only in ignored deploy/matstack/.env. Downloaded official Windows AMD64 agent 2.0.1 into ignored deploy/matstack/bin;
  version/help verified. Configured public URL tunnel_5clqhcidslu.mattunnel.ir and local
  target 127.0.0.1:8725. start.ps1 reads local configuration and checks the TCP port.
  Historical initial setup: agent/install were not started yet at that stage. The cafe was later
  installed and served through this tunnel, and is now intentionally stopped (see current handoff).
  Liara unchanged. These configuration changes are not committed.

## Mobile bottom navigation (2026-11-06, uncommitted)
- Added header choice drawer/bottom and up to four editable localized icon links in builder.
  Default remains drawer. Bottom bar reuses account/cart, active route, badge and existing
  full menu through More; safe-area and page-bottom space included, desktop preserved.
- Typecheck clean; two focused navigation tests pass. Owner requested no repeated manual QA.
  Cafe configured with Home, Cafe menu, Cart, Account; studio and installed images rebuilt.
- Cafe SMS is enabled with verifycode; no SMS test sent, provider template footer still pending.

## Mobile navigation visual fixes (2026-11-06, uncommitted)
- Visually inspected installed cafe account, home, products, empty cart and More at mobile widths
  390 and 360. Found header obscured account tabs and duplicate account/cart tools still visible.
- In bottom mode only, mobile header is sticky in document flow with solid theme background;
  desktop header behavior remains fixed. Responsive visibility wraps cart/account instead of
  mixing conflicting display utilities on their flex links. Closing More restores its trigger focus.
- Typecheck and two focused navigation tests pass. Studio/client web rebuilt and deployed.
  Post-fix screenshots confirm account tabs unobscured, no duplicate header tools, readable bottom
  labels and active destination. No SMS or order was sent. Screenshot: mobile-nav-fixed.png.

## Android bottom space (2026-11-06, uncommitted)
- Owner clarified blank area is below bottom icons inside APK, not browser. Inspected Activity:
  root adds system padding but forwards original insets. Made inset ownership explicit and
  consumed after root padding; included IME on API30+. Built APK 0.4.0/version4 successfully.
- Published /downloads/cafe-mohammad-0.4.0.apk; local download HEAD returned 200.
  Visual result on phone is unverified and awaits owner. No site CSS workaround added.

## Cafe compact category rows (2026-11-06, uncommitted)
- Added shopPage.layout grid/category-rows (grid default), plus per-products-section layout
  grid/horizontal in shared schemas and builder controls. ProductRail reuses ProductCard and
  existing cart behavior; compact 160px mobile /192px desktop cards with landscape images.
- Built-in catalog groups filtered results under category headings in configured category order;
  search and URL filters/sort remain functional. Rows support touch scrolling, keyboard focus,
  scroll snapping and inherited RTL. No catalog/prices/stock/customer/order data changed.
- Enabled cafe category rows and updated existing published menu/products product sections through
  authenticated APIs in studio and installed package; stopped script if unpublished edits exist.
  Script: tools/cafe-mohammad/enable-category-rows.mjs. Studio/client images rebuilt/deployed.
- Typecheck clean; focused web tests 11/11 pass. Initial compile caught an accidental edit to
  FeaturesSection; restored it before successful typecheck/build. Visual validation deliberately
  left to owner as requested. No new APK needed; installed WebView loads the updated site.

## Cart redesign (2026-11-06, uncommitted)
- Reworked existing CartPage: compact heading, small image/name cards, independent remove button,
  large labelled +/- quantity controls with existing limits, per-line BigInt totals, summary card,
  clear checkout CTA and designed empty state. Existing cart state, line keys/variants, visibility
  of prices, checkout route and page slots remain in use; no new API or cafe-only cart fork.
- Typecheck passed; builder/cart operations and share-order suites 15/15 pass. Client web built
  and copied to installed cafe; studio web rebuilt. No new APK needed. Manual visual verification
  deliberately left to owner under their current preference; no orders/SMS generated.

## Shared mobile top spacing (2026-11-06, uncommitted)
- Owner reported top whitespace on most mobile pages. Bottom navigation uses an in-flow header
  but shared headings still reserved fixed-header clearance (144px) and contained hero margin
  was 112px. Added scoped main data-app-navigation and shared presentation markers.
- Below 1024px in bottom mode: built-in/builder page headings and account/tracking containers
  use 24px top padding; contained hero uses 16px margin. Desktop/drawer offsets unchanged.
- Typecheck clean; eight focused builder/navigation tests pass. Cafe web built/deployed and
  studio web rebuilt. Owner handles visual review; no APK update or data changes required.

## Home square cards (2026-11-06, uncommitted)
- Owner requested three square icon cards for uneven home texts. Identified the three Stats
  entries below hero: hours, Marvdasht and breakfast/coffee. Added optional Stats layout cards
  (plain remains default), per-item icon selection and builder controls; three equal square
  columns, compact centered type and theme-accent SVG clock/pin/coffee/star icons.
- Cafe configuration script tools/cafe-mohammad/enable-home-cards.mjs preserves texts and
  modifies only the existing three-item home Stats section, refusing unpublished home edits.
- Typecheck and six builder tests passed. Studio and cafe images rebuilt. Visual review left
  to owner under their preference. No new APK required.

## Menu quantity feedback fix (2026-11-06, uncommitted)
- Report: repeated Add clicks changed cart but card message stayed 1. Replaced literal count
  and local added flag with matching lineKey quantity from CartProvider (first colour, no variant,
  matching existing add behavior). Added cap-disabled button; remove/clear feedback stays synced.
- Typecheck clean; new CartProvider regression test passes for 1/2/3, cap and clear. Initial test
  fixture omitted isAvailable; corrected fixture and passed. No order/API behavior changed.
- Cafe/client and studio web rebuilt/deployed; manual visual review remains with owner.
  Web has three additional focused tests since last full 54-test run (two nav, one count).

## Temporary shutdown (2026-11-06)
Owner requested shutdown until tomorrow. Stopped cafe API/proxy/database, Instagram relay worker,
studio web/API/edge/control/database, test Postgres and project-local Matstack agent. Used stop,
not removal: containers, volumes, site data and files are preserved. Do not auto-restart or create
an automation; resume when owner asks. Current branch work remains uncommitted.

## Product feature documentation handoff (2026-11-06, uncommitted)
- Added independent features/mobile-storefront.md covering defaults, schema fields, builder
  controls, renderer/cart reuse, limitations and tests; guide/mobile-storefront.md explains UI steps.
- Generalized Instagram feature/operator docs and SMS footer/account documentation: no cafe
  domain/account/template choice is a product default. Per-install worker provisioning, remote OTP
  template requirements and failure semantics remain explicit. Added generic developer feature map
  for accounts/addresses, live Orders, inline edits, preview, walk-in POS and storefront options.
- Linked new references in docs/README, guide index, AGENTS and developer guide. Client configuration
  remains under docs/clients. Documentation only; rebuilt developer HTML, no services restarted.

### Export path alignment (2026-11-07)
The resumed control service inherited an old host export mount under Documents/ChatGPT. After
successful firefighter update build, copied its archive to repo exports/, aligned ignored
EXPORT_DIR to this checkout and recreated only control with the 8081 port override. Old outputs
were preserved at the previous location; no installed site or volume was moved. Package exists
at exports/firefighter-update-20261107-0943.tar.gz (73,457,191 bytes); tar listing verified.
