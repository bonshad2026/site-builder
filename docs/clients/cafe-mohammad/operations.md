# Cafe operations — current handoff

Current access (2026-11-08): public /admin on the same Matstack domain is enabled by owner
request. Loopback site/admin share8725; the old8727 mapping and admin.compose override are
retired. Authentication and client scope are retained. Earlier private-only notes are historical.

Updated 2026-11-07. Studio, cafe, worker and Matstack were resumed on owner request. Local and
public HTTP checks passed. Test Postgres stays stopped. Prior shutdown preserved all data.
Host port 8080 is occupied by NVIDIA Broadcast; control currently maps loopback 8081 to container
8080 using ignored var/studio-resume.compose.yml. Use the override command below while occupied.

## Resume from repository root

Docker Desktop must be running. These commands reuse the existing installation and secrets;
do not rerun bootstrap/menu scripts or worker setup, which are not restart commands.

```powershell
# Optional studio, for operator design/content work.
docker compose -f deploy/docker-compose.yml -f var/studio-resume.compose.yml up -d

# Installed cafe, including the authenticated owner panel on the site port.
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/matstack/start-local-site.ps1

# Instagram relay is disabled by owner request; do not start the worker.

# Start only after cafe origin is available. This runs in the foreground.
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/matstack/start.ps1 -Check
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/matstack/start.ps1
```

The test database is only needed for API tests: `docker start sb-test-pg`.
Check actual Matstack processes before launching; the old ignored agent.pid may be stale.
Do not print local .env, worker .worker.env or encrypted messaging secrets.
No startup service or automatic next-day restart was configured.

## Addresses and installation

- Package: `exports/cafe-mohammad-20261106-0913/`; compose project `site-cafe-mohammad`.
- Local cafe: http://127.0.0.1:8725/fa; private panel: http://localhost:8725/admin.
- Public cafe: https://tunnel_5clqhcidslu.mattunnel.ir (available after the current restart).
- Owner login: `owner` / `123456` (local development account).
- Studio: http://admin.localhost/admin, operator `admin` / `123456` (local only).
- Latest debug APK: `/downloads/cafe-mohammad-0.4.0.apk` on cafe origin. It is already built;
  ordinary web design updates do not require rebuilding it. Phone inset fix awaits owner testing.
- Production Liara: https://cafemohammad.tibasoft.ir/fa; panel https://cafemohammad.tibasoft.ir/admin.
  App cafemohammad, network sites, uploads1GB, managed PG sb-demo-db with isolated cafe databases.
  Release6af0a5c7daeb4c8f04057fda verified live on2026-11-08; all24 published prices match local.
  Keep local and cloud installs separate; production business edits are authoritative after delivery.

## Current features and manual editing

- Header settings: drawer/bottom mobile navigation; up to four localized icon links plus More.
- Shop page settings: category rows; Products sections: compact horizontal layout.
- Existing built-in Cart page: compact cards, quantity controls and summary.
- Home Stats section: square icon cards; existing text preserved.
- Shared mobile offsets reduced for bottom navigation. Add button status reflects real cart count.
- Shop sender panel: credentials, connect/code entry/status. Durable order outbox feeds worker.
- Orders: authenticated live updates, inline stage/manual payment, quick preview and walk-in POS.
- Cafe catalog prices were filled by owner. Do not rerun early catalog generation scripts over them.

## Open items and evidence

- SMS is enabled with Kavenegar verifycode. Signup remains phone/password without mandatory OTP.
  Append a new final line `لغو ۱۱` in the provider template; code did not change the remote template
  because its fallback delivery policy could not be preserved from the API response.
- Latest web typecheck/build succeeded. Last full API: 123 passed. Last full web: 50 passed,
  4 pre-existing failures (54). Three subsequent focused tests passed; full 57-test suite not rerun.
- Owner performs visual acceptance of recent UI changes and APK 0.4.0 on their own phone.
- Branch `feature/local-matstack`; all recent work uncommitted. No push/merge requested.
- Routine shutdown uses `docker stop` and stopping the project Matstack process; never remove
  volumes or run bootstrap scripts as part of shutdown/restart.

## Instagram suspended (2026-11-08)

Owner cancelled the unofficial Instagram integration pending use of the official API.
The local relay worker is stopped; do not restart it during routine cafe startup.
Studio, installed local site and Liara delivery use normal checkout with no Instagram recipient.
Sender sessions are disconnected; historical orders/outbox rows remain for reference.
No new Instagram worker is deployed to Liara and no test message was sent.

## Store APK (2026-11-08)
Signed release exports/cafe-mohammad-1.0.0-release.apk targets the production domain.
Package ir.cafemohammad.app; versionCode5/versionName1.0.0; about643KiB.
Signature and manifest/alignment checked; no Android device attached for runtime inspection.
Keep private key/config under var/android-signing/cafe-mohammad and its ignored backup
backups/android-signing/cafe-mohammad-release-key-20261108.zip. Upload APK only to Bazaar.
Do not replace this key; future releases must increment versionCode. Debug installs cannot
be upgraded using the new production signature; uninstall debug before installing release.

## Live Enamad verification (2026-11-09)
Production release6af19a5ef031b4d7877f2a44 adds generic live ownership verification.
Owner/admin path: /admin/sites/cafe-mohammad/settings?tab=extras. Save the numeric code in
Domain ownership verification; no further deployment needed for code changes. Final saved
code10769625 serves empty /10769625.txt; owner UI change/clear/re-enable verified live.
No Enamad approval action was taken by the agent; owner must click Verify upload in Enamad.

## Separate management Android app (2026-11-09)
mobile/cafe-mohammad-admin opens the production /admin panel. Package ir.cafemohammad.admin
installs alongside the customer app, labelled مدیریت کافه محمد. Dark/amber ADMIN icon.
Signed APK exports/cafe-mohammad-admin-1.0.0-release.apk, versionCode1. Reuses existing cafe
release certificate; passwords are not embedded. Normal panel sign-in/permissions still apply.
Build and signature/manifest/alignment verified; installation and WebView UI await phone check.

Management APK1.0.1/code2 starts /fa/admin; production browser confirmed Persian login.
Use exports/cafe-mohammad-admin-1.0.1-release.apk to update the previous management APK.

## Temporary public APK links (owner request2026-11-09)
Owner superseded the owner-only download requirement for now. The private delivery panel/API
still exists, but these two exact static URLs are intentionally public in the cafe Liara
context Caddyfile: /downloads/cafe-mohammad-1.0.0-release.apk and
/downloads/cafe-mohammad-admin-1.0.1-release.apk. This is a cafe-specific temporary exception,
not the default for other client sites. Admin login remains required. Remove the two explicit
allowlist paths and static copies during a future deployment to withdraw public distribution;
private owner delivery remains available. Do not silently reintroduce owner-only requirements
while the owner requests public links. Both release objects also exist in private mobile_apps.

Public links LIVE in release6af1f633b772621c0b371dbf READY. Guest downloads200 with exact
local signed-file hashes checked; customer657830 bytes, management710330 bytes. Old0.4 APK404.
Admin login remains available and authenticated owner delivery API remains protected.

## Kavenegar Web Push setup (2026-11-09)
Owner supplied public appId4c03cb27-ab5e-45b8-a0db-e85c19611335 and requested setup.
Original worker downloaded directly from https://console.kavenegar.com/client/api/push-sdk-download
(HTTP200 text/javascript, attachment kvn-push-sw.js), bytes unchanged. Runtime root file
/kvn-push-sw.js imports https://cdn.kavenegar.com/sdk/sw.js. Script
https://cdn.kavenegar.com/sdk/page.js?appId=4c03cb27-ab5e-45b8-a0db-e85c19611335
was appended to existing meta.headCode (round-logo CSS and ownership code preserved) in
studio/production and captured by prerender into initial HTML. The provider connection check
is reserved for owner. No notification permission granted by agent; no Push sent; order-event
notification integration is NOT implemented by this SDK connection setup alone.

The unchanged worker is also stored at apps/web/public/kvn-push-sw.js so future web builds
retain the required root file. The head SDK/appId remains cafe-specific in site settings;
other sites do not load/activate the SDK merely because the static worker exists.

Final mobile POS + Web Push setup release6af1fd3bbcce2494ca60dc6c READY. Verified root
initial HTML SDK head tag and unchanged worker200/text/javascript. Cafe mobile24-item menu
fits390x844 and360x640 with filled receipt; repeated taps and receipt decrement verified without
saving an order. Provider connection check remains for owner; no Push delivery claimed.

## Admin-only push scope (2026-11-09, supersedes global SDK setup above)
Owner requested no push SDK on public pages or login. Kavenegar script removed from global
headCode in studio/cloud. Store it in private meta.adminHeadCode after the upgraded server
is active. AdminPanelCode runs only inside an authenticated, authorized order panel (owner,
operator, or orders:read staff). Worker kvn-push-sw.js remains at origin root, unchanged.
SDK subscription permission/real push were not exercised by agent; browser request probes
intercept the SDK instead. Existing provider subscriptions are not automatically revoked.
Provider connection checker may not see an authenticated SDK from the public homepage; do
not restore public execution solely for a checker without owner instruction.
