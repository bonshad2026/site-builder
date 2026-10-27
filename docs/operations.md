# Setup, operations and deployment

## Local development

Requires Node.js 20+ and Docker (for PostgreSQL only; the web app runs without Docker).

```bash
npm install
cp .env.example .env          # then fill TENANT_SECRETS_KEY, STORAGE_SIGNING_KEY, CONTROL_DATABASE_URL password, DEV_* accounts
npm run db:up                 # PostgreSQL 16 on localhost:5433
npm run migrate               # creates sb_control + its role, migrates control plane and all tenants
npm run seed                  # dev only: admin, demo site "atelier-navar" with its own DB and catalog
npm run dev:api               # http://localhost:4000  (OpenAPI: /api/v1/openapi.json)
npm run dev                   # http://localhost:5173
```

The contact form posts to the API when `VITE_API_URL` is set in the root `.env`. Without it,
the form says clearly that nothing was sent.

## Commands
| Command | What it does |
|---|---|
| `npm test` | Web tests (Vitest + Testing Library), then API tests against a real Postgres. The API tests create and drop `sb_control_test` / `sb_test_*` databases. |
| `npm run typecheck` | `tsc` for shared, api and web |
| `npm run build` | Builds shared → `packages/shared/dist`, api → `apps/api/dist` (with SQL), web → `apps/web/dist` (static) |
| `npm run migrate` | Control plane, then every tenant. Exits non-zero if any tenant fails, and keeps going for the others. |
| `npm run cli -w apps/api -- create-admin --email E --password P` | Creates the first platform admin in production |
| `npm run cli -w apps/api -- provision --slug S --name N --owner EMAIL [--domain D]` | Creates a client site from the shell |

API tests use `TEST_PG_ADMIN_URL` (default: the docker compose Postgres on port 5433).

## Environment variables
See `.env.example`, which is commented line by line. The important ones:

| Variable | Notes |
|---|---|
| `CONTROL_DATABASE_URL` | Runtime connection to the control DB. `migrate` creates the role and DB if they're missing. |
| `PG_ADMIN_URL` | Used only by provisioning and `migrate`. In production use a role with `CREATEDB CREATEROLE`, **not** a superuser. |
| `TENANT_SECRETS_KEY` | 32 bytes, base64. Encrypts tenant DB passwords. **Back it up**: without it, tenant DBs can't be reached. |
| `CORS_ORIGINS` | Comma-separated web origins allowed to send cookies |
| `VITE_API_URL` | API origin for the web app. Without it the site shows bundled demo content and the admin is unavailable. |
| `VITE_SITE_ID` | Which client site this web build shows (default `atelier-navar`). Build once per client domain. |
| `SITE_URL` | Public origin used by the prerender script for canonical URLs and the sitemap (e.g. `https://ateliernavar.ir`) |
| `PAYMENT_SANDBOX_ENABLED` | Test gateway. Defaults to on outside production and is **refused in production**. |
| `EMAIL_PROVIDER` / `SMS_PROVIDER` | `console` is dev only and is refused when `NODE_ENV=production`. Use `smtp` and `kavenegar`. |
| `STORAGE_DRIVER` | `local` (dev) or `s3` (any S3-compatible service) |

## Object storage (S3-compatible)
Set `STORAGE_DRIVER=s3` with `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY` and optionally `S3_PUBLIC_BASE_URL` (CDN).

Keys are `public/tenants/<id>/…` or `private/tenants/<id>/…`. Grant anonymous read on the
`public/*` prefix only. Private objects are served through 10-minute signed URLs.

For local S3 testing, run `docker compose --profile s3 up -d` (MinIO on :9100). Docker Hub
blocked the MinIO image from this machine, so the S3 adapter has **not** been run against a
real service yet.

## Email and SMS
- SMTP: `EMAIL_PROVIDER=smtp`, `SMTP_URL=smtps://user:pass@host:465`, `EMAIL_FROM`.
- SMS OTP: `SMS_PROVIDER=kavenegar`, `KAVENEGAR_API_KEY`, `KAVENEGAR_OTP_TEMPLATE` (a verify
  template with one `%token`). The adapter is written to Kavenegar's `verify/lookup` API but
  has **not** been tested against the live service. To add another provider, implement
  `SmsSender` in `modules/auth/notifications.ts`.

## Online payment (Zarinpal)
1. In the admin, open **Payments**, choose **Zarinpal** and enter the 36-character merchant
   id. Tick "Use Zarinpal sandbox" while testing.
2. The gateway's return address is
   `${PUBLIC_API_URL}/api/v1/payments/callback/<site>/<paymentId>`, so the API must be
   reachable from the internet over HTTPS.
3. An order is marked **paid** only after the API verifies the payment with Zarinpal
   server-to-server. Sandbox-host payments are recorded as `test_paid`.
4. Refunds are not automated. Refund in the Zarinpal panel, then cancel the order in the
   admin.

## Using the admin and builder
- `/admin` → sign in. Platform admins see **Client sites / Users / Audit**. Owners and staff
  see their site.
- **Pages → Open builder**: add sections from the library, reorder by drag (or Space plus
  arrow keys), edit content on the right, and preview at desktop, tablet or mobile size in
  EN or FA. The draft saves automatically. **Publish** makes it live.
- The menu, theme, accent colour, languages, contact details and modules are under
  **Settings**.

## Production deployment
1. Provision PostgreSQL 14+ and an admin role with `CREATEDB CREATEROLE`.
2. Set `NODE_ENV=production`, real secrets, `COOKIE_SECURE=true` (default), and HTTPS-only
   origins in `CORS_ORIGINS`.
3. Run `npm ci && npm run build && npm run migrate`, then
   `npm run cli -w apps/api -- create-admin …`.
4. Run the API with `npm start -w apps/api` behind a reverse proxy (TLS). Health check:
   `GET /health`.
5. Build the web app with `VITE_API_URL`, `VITE_SITE_ID` and `SITE_URL` set, so that
   prerendering writes per-page HTML, `sitemap.xml` and `robots.txt`. Serve
   `apps/web/dist` from any static host. Prefer `<path>/index.html` when it exists and fall
   back to `/index.html` for other routes (SPA).
6. Rate limits use in-process memory. With more than one API instance, switch
   `express-rate-limit` to a shared store (e.g. Redis).

## Backup and restore
Back up **every** database plus `TENANT_SECRETS_KEY`:
```bash
pg_dump -Fc -d sb_control -f sb_control.dump
for db in $(psql -Atc "SELECT db_name FROM tenants" sb_control); do pg_dump -Fc -d "$db" -f "$db.dump"; done
```
Restore one tenant without touching the others:
```bash
createdb -O sb_t_<slug> sb_t_<slug>       # role already exists in the cluster
pg_restore -d sb_t_<slug> --no-owner --role=sb_t_<slug> sb_t_<slug>.dump
```
Back up object storage separately (bucket versioning or replication).

## Troubleshooting
| Symptom | Fix |
|---|---|
| `Invalid environment configuration` | The message lists every missing or invalid variable |
| `403 Missing or invalid CSRF token` | Send the `csrfToken` from login (or the `sb_csrf` cookie) as `X-CSRF-Token`. `POST /api/v1/auth/csrf` issues a new one. |
| Site returns 404 to its owner | The site is `failed`/`suspended`, or the user has no membership. Check `GET /api/v1/platform/tenants`. |
| Tenant `failed` | Read `lastError` and `provisioningStep`, fix the cause, then `POST /platform/tenants/:id/retry` |
| `Migration … was modified after it was applied` | Never edit applied migrations. Add a new numbered file instead. |
