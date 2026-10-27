# Backend report (stages 4–7)

## Implemented
- **Express 5 + TypeScript API** with modules for auth, platform, members, site settings,
  pages, services and products, leads, orders, assets, public routes and audit. Validation
  uses Zod, errors are handled in one place, OpenAPI is generated from the routes, and
  helmet, CORS and rate limits are in place.
- **PostgreSQL**: one control-plane DB plus **one database and one login role per client**.
  Migrations are checksummed and transactional for both kinds of DB. The tenant pool manager
  is capped.
- **Provisioning**: idempotent and resumable. A site becomes `active` only after every step
  succeeds. Failures are recorded and can be retried. Owners are invited by email.
- **Auth**: email + password (argon2id, lockout), HttpOnly cookie sessions with server-side
  revocation, CSRF, email verification, password reset, SMS OTP sign-in and phone
  verification. Email and SMS go through swappable adapters.
- **Roles**: platform admin, site owner, and staff with fine-grained permissions, all checked
  on the server.
- **Content**: site settings, pages with draft/published copies, version history and restore,
  services and products with publish status, plus public read endpoints that return published
  content only.
- **Leads**: a public submission endpoint with a honeypot and rate limit, and an inbox with
  status and notes.
- **Orders**: priced on the server, stock reserved atomically, a status lifecycle, and stock
  returned on cancel. Always **unpaid**, because no gateway is connected.
- **Files**: S3 and local adapters, file type detected from bytes, size limit, public/private
  files with signed URLs, delete, and cleanup of unused files.
- **Web**: the contact form now posts to the API when `VITE_API_URL` is set.

## Verified (commands actually run)
| Check | Result |
|---|---|
| `npm run typecheck` (shared, api, web) | passes |
| `npm test -w apps/api` (real Postgres 16) | **53/53** pass: auth 16, tenant isolation 13, provisioning and migrations 6, content, orders and files 18 |
| `npm test -w apps/web` | **13/13** pass |
| `npm run build` | passes. The compiled API started and served `/health` and 52 OpenAPI paths. |
| Mutation check | Disabling the membership check made 3 isolation tests fail, then the code was restored. |
| End to end in the browser | A contact form submission was saved in `sb_t_atelier_navar` and read back by the owner through the API. |

## Simulated / not verified
- The **console** email and SMS adapters were used in development and tests. SMTP and
  Kavenegar adapters are written but **not tested against the real services**.
- **S3 adapter is not tested against a real service.** Docker Hub refused the MinIO image on
  this machine. The local disk adapter is tested.
- **Online payment** was added later (see final-report.md). As of this report, no API could mark an
  order as paid.

## Known limitations
- No admin UI yet. Everything is reachable through the API and OpenAPI only.
- Section `props` are validated by format and size only. Per-section schemas come with stage 2.
- Rate limits are in memory (per instance).
- `apps/api/scripts/seed-demo.ts` is not typechecked (it imports the web demo content) and is
  dev only.

## Next
Stage 2 (section library with typed schemas) → stage 3 (page builder and admin UI on this API).
