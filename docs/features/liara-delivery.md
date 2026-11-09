# Liara single-site delivery

See deploy/liara/README.md for the build-output context, runtime settings, disk/DB requirements
and startup behavior. This is an operator-assisted workflow; it does not replace the studio's
existing install/design-update builders or introduce a Liara button into the current dashboard.

The Liara Docker app exposes one HTTP port80 for site, authenticated /admin, /api and /files.
Liara terminates HTTPS; Caddy proxies to the compiled API on4000 in the same container. Both
client and API are build output only; the studio builder/platform UI is not included. Static
client uses same-origin API. PostgreSQL and uploads disk are external managed resources.

The launcher supports a new isolated control/tenant database and an explicit published-design
update of an existing tenant. It never uses a missing disk marker as permission to erase an
existing database. Initial import state is durable in control app_settings. SQL snapshots use
named column inserts because old deliveries may have different physical column order. Existing
cloud business records are authoritative during design updates; local test accounts/sessions
are not copied over an existing cloud site's accounts. Session/OTP-code tables are excluded
from full initial snapshots. Source encryption/signing identity is retained for encrypted data.

Tenant table data snapshots before new design revisions live on the private uploads disk and
must be retained/downloaded as part of operations; they do not replace provider-level backups.
The known migration010 CRLF/LF compatibility is strictly fingerprinted and documented in the
runtime README. Future unexplained migration checksum differences must still block startup.

Representative local tests used a separate PostgreSQL container and uploads volumes, with a
read-only app root: first import, retry after rollback, historical010 ledger, published design
update and exact preservation of existing customer rows. See docs/STATUS.md for the actual
remote release outcome, failed attempts and remaining limitations. No live SMS/order probes.