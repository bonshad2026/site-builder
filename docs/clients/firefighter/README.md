# Firefighter local installation

## Current access (2026-11-08)
Site and authenticated client admin now share https://tunnel_ikwlc5hk4ly.mattunnel.ir
(/fa and /admin), or localhost:8735. Port8737/private-only policy is retired by owner request.
Restart uses the primary compose only; old entries below describe historical checkpoints.
Course choice is prefilled from linked item; the course field group now comes first and consent
remains last, in studio and installed requestTypes. These settings remain editable in builder.

Installed 2026-11-07 from the owner-provided Downloads/firefighter-20261104-0844.tar.gz
(the supplied name omitted .gz). Original archive copied to ignored exports/ and extracted to
exports/firefighter-20261104-0844/. This is the existing packaged build, not a rebuild with newer code.

## Runtime
- Compose project: site-firefighter; API image: sb-api-runtime:20261104-0844.
- Site: http://localhost:8735/fa; content admin: http://localhost:8735/admin.
- HTTP binding: 127.0.0.1:8735; unused local HTTPS binding: 127.0.0.1:8736.
- Separate pgdata/uploads/caddy-data volumes and internal/public networks under site-firefighter.
- Local development mode; email/SMS console adapters. No actual delivery provider configured here.
- No tunnel/public exposure configured. Cafe ports, databases and tunnel were not changed.
- Site, admin HTML and public settings API returned HTTP 200; database healthy and API running.
  This check does not establish visual acceptance or authenticated content-edit usability.

Restart from repository root:
```powershell
docker compose --project-directory exports/firefighter-20261104-0844 -p site-firefighter up -d
```
Stop without removing data:
```powershell
docker compose --project-directory exports/firefighter-20261104-0844 -p site-firefighter stop
```

## Editing next
The install package has a client-scoped admin: content/catalog management and existing page text/
images. The full structural builder is omitted from client web builds. For full studio editing,
inspect/import an isolated copy into studio and register its tenant, assets and settings through
the project's supported provisioning flow. Do not point studio at this live database or overwrite
an existing studio site. No import was performed during the initial local-install task; the subsequent studio import is documented below.

Credentials remain in the ignored package .env. Do not commit or print the whole file. No package
contents, database SQL, uploads, image archives or secrets should be added to Git.
## Import back to studio (2026-11-07)
The design is now imported as an independent studio tenant firefighter: 40 pages, 27 assets,
products/services and content tables/items; no customer/order/payment/session data copied.
Actual source storage namespace was 8f8883c9-2ed0-46d9-841c-c2df7ca8f53b, not the cell tenant id.
It was remapped into the new studio tenant namespace and files copied there. Source remains unchanged.

- Design pages: http://admin.localhost/admin/sites/firefighter/pages
- Preview: http://firefighter.preview.localhost/fa
- Build output UI: http://admin.localhost/deploy/ (select firefighter row)
- Studio operator login: admin / 123456 (local only).

The source package used rating/list blocks, reviews, member profiles and a submenu over the old
limit. Reused existing implementation from faa5f39 plus source follow-ups; current studio now
supports these, visitor theme selection and 20 submenu children. No Liara deployment code merged.
Migration 015 avoids the existing Instagram 012 collision and permits the original installed
members schema. Source install on 8735 has not been upgraded or connected to studio DB.
Saved original delivery keys privately in control-data for future build identity; no secrets in Git.

Normal workflow: choose a page, edit, Save draft, inspect, Publish, then Preview & deploy >
Design update package. Apply the resulting update to the existing install only after reviewing
customer changes. Full install package is for a fresh server. Imports are not ongoing sync:
client edits after this copy must be reconciled before a later design update.

## Build proof
Existing deploy UI/service completed firefighter-update-20261107-0943.tar.gz in exports/.
It is a design update, not applied to the installed site. Home draft editing/saving was tested
in the studio UI and original heading restored. Preview/source/cafe returned 200.

The deploy service inherited an old EXPORT_DIR outside this checkout. Copied the successful
update archive into this repository's standard exports/ and changed only the ignored deploy/.env
EXPORT_DIR to E:/Projects/bonshad/site-builder/exports; recreated control with the existing port
8081 override. Old external output files were not removed. Future packages use the standard path.

## Public tunnel (2026-11-07)
The installed source now serves https://tunnel_ikwlc5hk4ly.mattunnel.ir via its own Matstack agent,
configuration and logs under deploy/matstack/firefighter/. Target is 127.0.0.1:8735. The owner panel
moved from 8735/admin to http://localhost:8737/admin (loopback only). Public /admin returns 404;
private staff/auth/platform APIs are blocked there. Studio editing remains separate and unchanged.
The installed original API image remains in place; no design update was applied. Runtime is now
production with panel SMS/email adapters; messaging requires provider configuration, and dev OTP
codes are not exposed. Four pages and their saved versions had localhost origin links remapped to
this public origin. Current restart command is the firefighter start-local-site.ps1, which includes
the private-panel override (the initial plain compose example above predates public exposure).
Verified public site and private admin return 200, public admin 404, cafe tunnel still 200.
Tunnel key is ignored and not committed. See deploy/matstack/firefighter/README.md.

## Local update applied (2026-11-08)
Applied firefighter-update-20261107-2055 from studio, API sb-api-runtime:20261107-2055.
The archive stamp uses UTC (2026-11-07); the local deployment date is 2026-11-08.
Full pre-update backup: backups/firefighter-before-update-20261108-002524/ (ignored).
Original site directories and the original API image were retained for recovery.

First startup refused 010_shop_extras.sql: the original image used CRLF, current image LF.
Verified exact hashes: original CRLF 711837ffb7d364118918e7445526a40ad4158d486c73422c81c8bd9ac82e8a6a;
current LF b139accf6600cec7303576f2573b55ae059a8942dc91e4826857401f533bff11.
The current SQL converted to CRLF exactly reproduces the stored original hash. No SQL content
changed or reran: only that tenant's recorded checksum was aligned, after successfully testing
all pending migrations on a temporary restored database. Original API was restored during diagnosis.
The probe database was dropped after successful use. Migrations 012 Instagram, 013, 014, 015 now
applied; original 012_members_and_reviews remains recorded. No migration file was edited.
For rollback to the old image, restore its original 010 checksum too (or restore the backup).

Design applied transactionally; preview and admin origins in design remapped to the public tunnel.
Business-data fingerprints (items/customers/leads/orders) matched before/after; 40 pages,22 items,
zero customers/leads/orders at deployment. Existing private-panel override and tunnel preserved.
Studio SMS configuration copied privately and re-encrypted with the installed server key; no key
printed and no actual SMS/request submitted. Source had no configured local panel SMS previously.

A real browser check exposed an auth loading/remount loop introduced by background revalidation.
Keep useCustomer.loading for initial loading only; mount/focus refresh still runs in background.
Focused regression extended/passed, client web rebuilt/prerendered62 pages and installed; the
update archive was refreshed with these final client assets. API image unchanged by this web-only fix.
Original archive before the web-only fix retained in the pre-update backup directory.
Do not claim actual SMS delivery or signed-in request submission was demonstrated.
Private-panel follow-up: its HTML returned200 but the shared web bundle used the public API
origin, where staff routes are blocked. Rebuilt with VITE_API_URL=same-origin, installed and
refreshed the update archive. Dockerfile client default corrected for future packages.

## Production on Liara (2026-11-08)
- Live site: https://fire.tibasoft.ir/fa; client admin: https://fire.tibasoft.ir/admin.
- App firefighter, network sites, PostgreSQL sb-demo-db, uploads disk0.5GB.
- Release6af06b840a7287f92f8515c5 READY, HTTPS certificate ACTIVE.
- Same origin/port for site/admin/API. Live site/API and actual operator session checked;
  browser home and login rendered. SMS settings present/verifycode; no real SMS or request probe.
- Existing cloud tenant already existed although the new app had not been deployed. It was
  upgraded, not replaced with local data. Existing trainer profiles/business records retained.
- Current code/design came from exports/firefighter-liara-20261108/ with the strict historical010
  line-ending bridge; source templates and operational details in deploy/liara/README.md.
- Private tenant data snapshot written before design update under uploads/.deployment-backups/.
  The provider backup CLI did not succeed; do not describe that as a full PG backup. JSON restore
  is an operator task and has not been demonstrated. App disk/DB must both be backed up.
- Runtime APPLY_DESIGN_UPDATE=true records a design fingerprint and will not reapply unchanged
  design on restart. New design delivery requires reconciling production client changes first.
- Original local/Matstack installation remains separate; production data is authoritative.
  Do not run the local full initial-data restore against these existing cloud databases.
- Secrets remain in ignored local files and Liara environment only. No Liara token in the package.