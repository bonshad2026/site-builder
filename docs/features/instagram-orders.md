# Account-based orders and Instagram relay

Reusable per-site order mode: shop.orderMode=instagram saves account-linked catalog orders and
queues server-side delivery through a managed sender. checkout and share remain separate modes.
This document describes product behavior; client addresses, accounts and delivery evidence belong
in docs/clients/. Enabling the mode alone does not provision a worker for a new installation.

## Builder configuration
- Shop settings / Order submission: choose server Instagram delivery and set instagramUsername.
- Enable customer accounts. accounts.signupVerification defaults true; false requires a password
  and leaves verified_at NULL. Unverified signup/password login never claims historical cases
  by matching a phone/email. OTP signup/login retains its existing verified linking behaviour.
- Customer profile stores up to ten named addresses; first address is selected by default.
  Customer list/detail exposes addresses to authorized staff.
- Instagram checkout asks for a saved address and optional note; name and phone come from the
  signed-in session, rechecked on the server. Existing shipping/extra-question settings are for
  normal checkout; this mode is for catalog-product quote orders, not content-table items.
- The menu may keep unknown prices. pricing_pending orders display awaiting-price labels,
  cannot start payment or print an invoice; internal zero placeholders never mean free or paid.

## Server ordering
Existing orders/products/stock validation is reused. One tenant transaction writes order items,
stock updates, pricing_pending and instagram_outbox. The message is built from database product
names and the customer/address snapshot, not browser text. It includes number, quantities, options,
name, phone, address and note. Message cap is 1,000 characters; oversize rolls back the transaction.
A per-customer requestId/advisory lock prevents duplicate order/queue insertion on retry.
The basket clears only after the server acknowledges saving. Confirmation says queued, not delivered.

## Sender management
Owner panel / Shop / Instagram sender account supports username/password, save, login, disconnect,
status/error and verification-code entry. APIs live under /sites/:siteId/orders/instagram-connection
and require orders:write plus normal staff CSRF. Public settings never include credentials.
Password, saved session and temporary OTP use AES-256-GCM with TENANT_SECRETS_KEY.
Saving credentials resets the connection/session and increments version. Secrets are never returned.
Code entry is accepted only during code_required, encrypted transiently, then consumed/cleared.
Worker waits up to five minutes; some Instagram checkpoints still require the official app.

## Worker and failures
deploy/instagram-relay/worker.py reads only its tenant's outbox/connection through a restricted role.
It holds a PostgreSQL advisory lock to allow one worker per tenant. No public service port.
Pending -> sending -> sent. Pre-send lookup failure is failed; ambiguous send/crash is unknown.
Restrictions stop that connection until an owner reconnects; failed/unknown jobs are held for review
and are NOT retried automatically (no retry button yet). Successful API acceptance does not prove
inbox placement/read. The order remains in the panel regardless of delivery failure.
Worker heartbeat is exposed in private connection status. The example worker compose/setup is installation-specific;
another installed site needs its own network/role/env and worker, never a shared customer database.

Migrations: 012_instagram_orders.sql, 013_instagram_connection.sql.
API coverage: instagram-orders.test.ts. Latest suite results are recorded in docs/STATUS.md.
Actual challenge/2FA UI flow still needs a real account that requests a code.

Operator guide: ../guide/instagram-orders.md. Delivery setup: ../../deploy/instagram-relay/README.md.
