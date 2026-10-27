# API

The full machine-readable spec is served at **`GET /api/v1/openapi.json`** (OpenAPI 3,
generated from the same Zod schemas that validate the requests).

## Conventions
- Base path: `/api/v1`. JSON in, JSON out.
- Success: `{ "data": …, "meta"?: { page, pageSize, total, totalPages } }`.
  `204` means there is no body.
- Error: `{ "error": { "code", "message", "details"? } }`.
  The codes are `validation_failed` (400, with `details[].path`), `unauthorized` (401),
  `forbidden` / `module_disabled` (403), `not_found` (404), `conflict` (409), `upload_rejected`
  / `payload_too_large` (413), `unsupported_file` (415), `rate_limited` / `account_locked`
  (429), `provisioning_failed` / `internal_error` (500), and `sms_failed` (502).
- Pagination: `?page=1&pageSize=20` (max 100).
- IDs are UUIDs. Timestamps are ISO-8601 UTC. Money is a string of minor units (`"145000000"`).
- Auth: an HttpOnly `sb_session` cookie. Every state-changing authenticated request needs
  `X-CSRF-Token`.

## Endpoints
| Group | Routes |
|---|---|
| Auth `/auth` | `GET /me` · `POST /login` · `POST /logout` · `POST /csrf` · `POST /signup` (if enabled) · `POST /email/verification` · `POST /email/verify` · `POST /password/forgot` · `POST /password/reset` · `POST /otp/request` · `POST /otp/login` · `POST /phone/verification` · `POST /phone/verify` |
| Platform `/platform` (admin) | `GET/POST /tenants` · `GET/PATCH /tenants/:id` · `POST /tenants/:id/retry` · `PUT /tenants/:id/owner` · `GET/POST /users` · `PATCH /users/:id` · `GET /audit` |
| Site `/sites/:siteId` (members) | `GET /` · `GET/PUT /settings` |
| Pages | `GET/POST /pages` · `PUT /pages/order` · `GET/PATCH/DELETE /pages/:id` · `POST /pages/:id/publish` · `POST /pages/:id/unpublish` · `GET /pages/:id/versions` · `POST /pages/:id/versions/:v/restore` |
| Catalog | `GET/POST /services`, `GET/PATCH/DELETE /services/:id` · the same for `/products` |
| Leads | `GET /leads` · `GET/PATCH /leads/:id` |
| Orders | `GET /orders` · `GET/PATCH /orders/:id` (`pending → confirmed → fulfilled`, `→ cancelled`) |
| Files | `GET/POST /assets` (multipart `file`, `visibility`, `altEn`, `altFa`) · `GET/DELETE /assets/:id` · `POST /assets/cleanup?dryRun=` |
| Members (owner) | `GET/POST /members` · `PATCH/DELETE /members/:userId` |
| Dashboard | `GET /overview` |
| Payment settings (`payments:manage`) | `GET/PUT /payment-settings` (`provider`: `none`, `zarinpal` or `sandbox`; `merchantId`; `useSandboxHost`) |
| Public `/public` | `GET /resolve?domain=` · `/sites/:siteSlug/` `settings`, `pages`, `pages/:slug`, `services[/:slug]`, `products[/:slug]` (filter `category`, `q`, `featured`, `sort`), `POST leads`, `POST orders` (returns `orderToken`), `GET orders/:number?token=`, `POST orders/:number/pay`, `GET payment-methods`, `GET sitemap.xml`, `GET robots.txt` |
| Payment return `/payments` | `GET /callback/:site/:paymentId` (the gateway sends the buyer here; verified server-to-server) · `GET/POST /sandbox/:site/:authority` (test gateway page, development only) |

## Page documents
`{ schemaVersion: 1, sections: [{ id, type, props, hidden? }] }`. `type` must be one of the
14 section types, and `props` are validated against that type's schema in
`packages/shared/src/sections.ts`. Links must be `/path`, `https://`, `mailto:` or `tel:`.

## Payment flow
1. `POST /public/sites/:site/orders` with `{ customer, items: [{ productId, quantity }] }`. The
   server prices the order and returns `number` and `orderToken`.
2. `POST …/orders/:number/pay` with `{ token, locale }` returns `{ redirectUrl, isTest }`.
   Send the buyer to `redirectUrl`.
3. The gateway returns to `/api/v1/payments/callback/...`. The API **verifies with the
   gateway**, then redirects to `/checkout/result?order=…&token=…&payment=success|failed|cancelled`.
4. `payment_status` becomes `paid` only after a successful verification with a real gateway.
   Sandbox payments become `test_paid`.
