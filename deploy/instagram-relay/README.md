# Instagram relay

Current cafe deployment uses the installed order worker described below. It is intentionally
stopped with the cafe as of 2026-11-06; see docs/clients/cafe-mohammad/operations.md to resume.

## Historical feasibility probe

The following probe commands are experiments, not the installed order worker.
Do not run send-test when simply restarting the cafe.

Copy .env.example to .env and enter the dedicated sender username/password locally.
Do not paste credentials in chat. Recipient defaults to the approved test account.

From the repository root:
- Build: docker compose -f deploy/instagram-relay/compose.yml build
- Offline dependency/config check: docker compose -f deploy/instagram-relay/compose.yml run --rm probe
- Send ONE labelled test: docker compose -f deploy/instagram-relay/compose.yml run --rm probe --send-test

The default invocation never contacts Instagram. The send command prompts for 2FA or a
challenge code if needed. Account restrictions may require the official app. There is no
retry loop. After an ambiguous timeout, inspect the recipient inbox before repeating.
An accepted API response does not prove inbox placement or that anyone read the message.

Session credentials persist under ignored var/instagram-relay/session.json; keep this private.
The probe is single-tenant. Production must isolate credentials/sessions per site and use a
durable delivery outbox. Save the order first, independently of Instagram availability.

Docs:
https://subzeroid.github.io/instagrapi/latest/usage-guide/direct/
https://subzeroid.github.io/instagrapi/latest/usage-guide/best-practices/

## Interactive login only

To test login without sending any message:
docker compose -f deploy/instagram-relay/compose.yml run --rm -v "E:/Projects/bonshad/site-builder/deploy/instagram-relay/login-only.py:/app/login-only.py:ro" --entrypoint python probe /app/login-only.py

This prompts for an Instagram challenge code if the client requests one. TwoFactorRequired
prompts for a hidden code and continues login once. Other errors stop without retry.
Sessions for this command are separated by a hash of the configured username, so changing
the sender does not reuse another sender's session. The original send-test probe remains
separate and is not run by this command.

## Installed order worker (current cafe deployment)

The original probe commands above are historical experiments. Production delivery uses worker.py
and the tenant's encrypted instagram_connection row. Credentials are now managed in the owner's
Shop settings, not read from the probe .env. Saving credentials does not itself attempt login:
the owner clicks Connect / sign in, then enters a code in the panel if requested.

One-time cafe setup after API migrations:
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/instagram-relay/setup-worker.ps1
docker compose -f deploy/instagram-relay/worker.compose.yml up -d --build

The generated .worker.env is ignored and contains a restricted database role plus the encryption key.
Its role has SELECT/UPDATE only on instagram_outbox and instagram_connection, not customer/order tables.
Keep it private. Another client requires a separate role, database, network and worker configuration.
No relay HTTP port is exposed. Restarting a worker holds interrupted sends for review as unknown.
Failed/unknown jobs are never automatically retried; no owner retry button is provided yet.
Restart is intentionally disabled on unexpected process failure. Check worker heartbeat in the panel;
after addressing an operational failure, run the compose up command again.

Connection: disconnected -> login_pending -> connecting -> code_required / connected / error.
The worker waits five minutes for a code. Actual challenge handling is account-dependent.
The cafe sender connected successfully and integrated test order #1001 was accepted by Instagram.
