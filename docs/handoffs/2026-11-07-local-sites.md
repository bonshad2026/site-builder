# Next-chat handoff — 2026-11-07

Read AGENTS.md, then this file and docs/STATUS.md. This is the latest operational handoff;
older shutdown and initial-install entries in STATUS are historical.

## Owner preferences and scope
- Reply in Persian; code/comments/commit messages in English. Follow current repository rules.
- After relevant technical checks pass, owner usually does visual acceptance. Do not repeat broad
  visual QA unless requested. Report what was tested versus what remains unverified.
- Use existing builder/catalog/cart/order APIs and editable settings; add reusable product features
  when missing, not hard-coded client-only alternatives. User must be able to edit later in panel.
- Do not change Liara, merge branches, push, send test SMS/DM or create test orders unless requested.
- Keep cafe and firefighter isolated. Do not overwrite client edits with bootstrap scripts.

## Git / work in progress
- Checkout: E:/Projects/bonshad/site-builder, branch feature/local-matstack.
- HEAD cd504bb; product commit 5c06c83. Both were pushed on 2026-11-06.
- All subsequent 2026-11-07 import/compatibility/tunnel/docs changes are UNCOMMITTED.
  Some are staged and some unstaged because existing feature patches were applied three-way.
  These changes belong to this task, including resolved account/address/member compatibility.
  No unresolved merge conflicts remained at last check. Do not reset them or treat as strangers' edits.
- No commit/push requested for today's changes. Do not switch to develop and lose this checkout.

## Currently running
Studio: sb-edge, sb-studio-db, sb-studio-api, sb-studio-web, sb-control.
Cafe: site-cafe-mohammad-db-1/api-1/proxy-1; instagram-relay-worker-1.
Firefighter: site-firefighter-db-1/api-1/proxy-1. sb-test-pg is running for tests.
Two separate Matstack agents are running hidden. Other unrelated events-v2 containers also exist:
do not stop all Docker containers or kill all Matstack processes for a single-site request.

| Purpose | Address |
|---|---|
| Studio operator | http://admin.localhost/admin — admin / 123456, local development only |
| Build packages | http://admin.localhost/deploy/ |
| Cafe public | https://tunnel_5clqhcidslu.mattunnel.ir/fa |
| Cafe local owner | http://localhost:8727/admin — owner / 123456, local only |
| Firefighter public | https://tunnel_ikwlc5hk4ly.mattunnel.ir/fa |
| Firefighter local owner | http://localhost:8737/admin; use installed package's saved credentials |
| Firefighter studio pages | http://admin.localhost/admin/sites/firefighter/pages |
| Firefighter preview | http://firefighter.preview.localhost/fa |

Cafe public origin is loopback8725; firefighter origin is loopback8735. Public /admin and private
staff/auth/platform API routes return 404; customer public APIs remain enabled. Owner panels are
on separate loopback mappings. Firefighter admin no longer lives at localhost:8735/admin.

## Runtime files and restarts
Secrets live only in ignored files/control volumes: never print full .env, tokens, passwords or keys.
- Cafe: deploy/matstack/.env; package exports/cafe-mohammad-20261106-0913/.
- Firefighter: deploy/matstack/firefighter/.env; package exports/firefighter-20261104-0844/.
- Worker: deploy/instagram-relay/.worker.env and tenant encrypted connection row.
- Build identity: private sb-control /data/sites/firefighter/deploy.env copied from original package;
  preserves encryption/signing/SSO identity. It is not the studio tenant database credential.
- Tunnel agents share verified executable deploy/matstack/bin/, but have separate config/logs.
  Firefighter logs/launcher.pid records PowerShell parent, not necessarily child agent id. PIDs change;
  inspect parent/child identity rather than trusting stale files or killing every agent.

Studio host 8080 is owned by NVIDIA Broadcast. Use ignored var/studio-resume.compose.yml override:
```powershell
docker compose -f deploy/docker-compose.yml -f var/studio-resume.compose.yml up -d
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/matstack/start-local-site.ps1
docker compose -f deploy/instagram-relay/worker.compose.yml up -d
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/matstack/firefighter/start-local-site.ps1
```
Start a tunnel ONLY if its agent is not already running:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/matstack/start.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/matstack/firefighter/start.ps1
```
These tunnel commands run foreground; current sessions were launched hidden. Generic start.ps1
now accepts optional ConfigPath; cafe default remains unchanged. Never run worker setup or menu
bootstrap as a restart operation. No auto-start service configured.

Control maps loopback8081 ->8080; admin.localhost/deploy/ unchanged. Its old EXPORT_DIR pointed
outside checkout under Documents/ChatGPT. Corrected ignored deploy/.env EXPORT_DIR to
E:/Projects/bonshad/site-builder/exports and recreated control; old external files retained.

## Firefighter: what was done today
1. Located owner archive C:/Users/Mehdi/Downloads/firefighter-20261104-0844.tar.gz (.gz omitted
   in original prompt), copied/extracted to standard ignored exports/.
2. Started original package separately as site-firefighter with image sb-api-runtime:20261104-0844.
3. Owner requested full builder editing and future packages. Imported independent studio design
   copy: 40 pages, 27 assets, 4 collections, 22 items, zero customers/orders. Catalog/services and
   page versions included. No business sessions/payment/provider data imported.
4. Source has capabilities absent from this branch. Reused implementation from existing faa5f39
   plus code follow-ups through 5cc88dd, submenu limit20 and visitor-theme selection from f038f2f.
   No Liara changes imported. Features: member account kinds/organisation, self-service profiles,
   owned files, table form choices, request assignment/reviews, list/rating blocks, item-reviews.
   Resolved overlap retaining cafe addresses, unverified signup and mobile/account behavior.
5. Added migration 015_members_and_reviews.sql instead of conflicting original012. Uses existence
   guards for older delivered packages already carrying 012_members_and_reviews.sql. Did not edit
   applied migrations. Real database old-name upgrade test passed.
6. Imported only design/content tables into freshly provisioned tenant, remapped asset namespace,
   validated current schemas and fixed sequences. Original source metadata id is
   63bb8bbf-7ae9-4e37-8268-40c1f5f8d842, but actual source storage namespace is
   8f8883c9-2ed0-46d9-841c-c2df7ca8f53b. Derive new target id from studio tenants, never assume
   cell id equals archive storage directory. Helpers under tools/delivery/ and generic workflow
   docs/features/studio-import.md. First restore rolled back due empty pg_dump search_path;
   public.* post-restore statements fixed it. Source was not modified by the studio import.
7. Opened actual studio builder; home rendered, temporary heading edit saved, original restored
   and saved. Never published the temporary test. Screenshot firefighter-studio-builder.png in
   thread visualization directory. All 40 drafts/published documents passed current validation.
8. Existing deploy service successfully built exports/firefighter-update-20261107-0943.tar.gz
   (73,457,191 bytes). Archive listing verified. NOT APPLIED to source installation. Full builder
   remains studio-only; localhost8737 is client-scoped content admin, not full builder.
9. Owner then provided dedicated Matstack tunnel. Key stored privately; public domain above.
   Added deploy/matstack/firefighter/ scripts/Caddy/compose override. Source runtime changed to
   production with panel messaging adapters (not console); real OTP requires provider config.
   Four pages plus versions remapped from localhost8735 to public origin. Original API image
   remains; new design-update package still not applied. Cafe and studio settings unchanged.

Normal design workflow: Studio pages -> edit -> Save draft -> Publish -> Preview & deploy ->
Design update package. Apply to existing installation only after reconciling any client edits;
there is no ongoing sync between studio copy and installed source. Full install package is for
fresh installation, not overwriting an existing client's data.

## Cafe retained state
Account/address checkout -> transactionally saved quote order + Instagram outbox, encrypted sender
management and worker. Live Orders via authenticated SSE/PG NOTIFY, inline stage/manual payment,
hover/focus/tap quick view; rapid walk-in orders create Confirmed/Unpaid and close modal on success.
Mobile bottom navigation, category horizontal rails, compact cart, corrected top spacing and three
home square icon cards. Cart added feedback now shows actual matching cart-line count.
Cafe catalog prices were filled manually by owner; do not regenerate catalog over them.
See docs/features/mobile-storefront.md, shop.md, instagram-orders.md and cafe operations doc.

## Evidence and remaining limits
- Latest typecheck clean; studio API/web/control rebuilt successfully. Existing cafe/source HTTP200.
- Full API 133/133 passed before final idempotent015 adjustment; targeted members + compatibility
  tests 11/11 after it. API now134 total; full134 not rerun.
- Full web53 pass /4 baseline failures (57). Existing failures include AbortSignal/jsdom-router
  mismatch and product result-count expectation. Do not claim full suite green.
- Firefighter public /fa200, private8737/admin200, public/admin404; cafe public/fa200.
- No live test SMS/DM or new order sent today. Worker process running is not proof of delivery.
- Cafe SMS verifycode enabled; signup still phone/password without mandatory OTP. Exact final
  opt-out line لغو ۱۱ still needs provider remote OTP-template edit. Plain SMS footer already central.
- Cafe APK0.4.0 inset fix built; phone appearance and recent layout acceptance remain with owner.
- Firefighter production SMS/email provider setup has not been demonstrated. Dev OTP is hidden.
- Current update artifact has not been applied or runtime-tested on a disposable clone; migration
  compatibility is tested. Do not call actual client update installation validated.
- Next work is owner-directed. Do not automatically apply package, change design or run stale
  generic STATUS Next items instead of the owner's ongoing firefighter task.

## Useful docs
- docs/STATUS.md: current operational record and history.
- docs/clients/firefighter/README.md; deploy/matstack/firefighter/README.md.
- docs/features/studio-import.md; studio-and-delivery.md; collections.md.
- docs/clients/cafe-mohammad/operations.md; deploy/matstack/README.md.
- docs/dev/index.html regenerated after developer guide changes.
