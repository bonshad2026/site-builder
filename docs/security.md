# Security notes

## In place (and tested)
- **Tenant isolation** at two layers. In Postgres, each tenant has its own role and database,
  with `CONNECT` revoked from `PUBLIC`. In the API, membership checks come from the session,
  and tenant ids sent by the browser are ignored. See `apps/api/test/tenancy.test.ts`.
- **Passwords**: argon2id, at least 10 characters with letters and numbers. Unknown emails
  still spend a hash check, so timing doesn't reveal which accounts exist. After 5 failures
  the account locks for 15 minutes, and there is a per-IP limit on top.
- **Sessions**: a random 256-bit token in an `HttpOnly`, `SameSite=Lax` cookie, `Secure` in
  production. Only its SHA-256 is stored. Sessions are revoked on logout, password reset and
  account disable. No tokens are kept in `localStorage`.
- **CSRF**: the session-bound token goes in the `X-CSRF-Token` header for authenticated
  mutations.
- **OTP**: 6 digits, valid 5 minutes, 5 attempts, single use, at most 3 sends per 10 minutes
  per number. Unregistered numbers get the same response and no SMS. The console provider is
  refused in production.
- **Email tokens**: single-use, hashed, 24 h for email verification and 1 h for password
  reset. Issuing a new token invalidates older ones.
- **Input**: every route is validated with Zod. SQL is parameterized. Identifiers in DDL use a
  strict allow-list.
- **Uploads**: the type is detected from the file's bytes, with a size limit and server-made
  keys. Private files are reachable only through signed, expiring URLs.
- **Headers**: `helmet`, a CORS allow-list with credentials, and `nosniff` on files.
- **Secrets**: tenant DB passwords are encrypted at rest and never returned. `.env` is
  git-ignored, and `.env.example` holds no secrets.
- **Audit log**: sign-ins, failures, provisioning, owner and staff changes, and content and
  order changes.
- **Payments**:
  - Prices come only from the database.
  - `paid` is set only after server-to-server verification with the gateway, using the
    amount stored on the server.
  - Callbacks are idempotent, the payment row is locked during processing, and a unique
    index allows one successful payment per order.
  - A forged `Status=OK` without verification is rejected (tested).
  - Sandbox payments are `test_paid`. The merchant id lives in a private table.
  - Buyers see orders only with a secret order token (stored hashed). The same 404 is
    returned for "no such order" and "wrong token".
  - The gateway return URL is built by the server, never taken from the browser, so there is
    no open redirect.
- **Page content**: section props are validated per type. `javascript:` and `data:` links are
  rejected, HTML is never rendered from content, and one broken section cannot take down a
  page.
- **Builder preview**: `postMessage` is used only with the same origin.

## Not yet done (known gaps)
- No gateway-driven refunds.
- Rate limiting uses in-memory storage, which is per instance (see operations.md).
- No 2FA for platform admins yet.
- Kavenegar and SMTP adapters have not been exercised against the live services.
- There is no virus scanning of uploads.
- Passing the unit and integration tests is **not** a security audit. Get a review or pen test
  before handling real customer data.
