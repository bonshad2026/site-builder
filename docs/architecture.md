# Architecture

```
apps/web      React + Vite. Public site (stage 1). Admin and page builder come later.
apps/api      Node.js + Express 5 + TypeScript REST API (/api/v1)
packages/shared   Zod schemas and constants shared by web and api
PostgreSQL    1 control-plane database + 1 database per client (tenant)
Object storage    S3-compatible (production) or local disk (development)
```

## Databases

**Control plane** (`sb_control`) runs the platform. It holds:
`users`, `sessions`, `auth_tokens` (email verify / password reset), `otp_codes`, `tenants`,
`tenant_domains`, `memberships` (owner/staff + permissions) and `audit_events`.

**Tenant databases** (`sb_t_<slug>`) hold one client's data:
`site_settings`, `pages` (draft and published) and `page_versions`, `services`, `products`,
`leads`, `orders` and `order_items`, `assets`, and `audit_events`.

Identity and authentication live only in the control plane. Business data lives only in the
tenant database.

### Isolation
- Each tenant has its **own Postgres login role**, and that role owns only its own database.
  `CONNECT` is revoked from `PUBLIC`, so tenant A's role cannot even connect to tenant B's
  database. A test covers this.
- Tenant DB passwords are random. They're stored AES-256-GCM-encrypted
  (`TENANT_SECRETS_KEY`) and are never returned by the API.
- Each request picks a tenant from the URL (`/sites/:siteId`). Access is granted only from the
  signed-in user's **membership row**, never from a header or body value. Non-members get
  `404`, so a site's existence can't be probed.
- Connection pools: one small pool per tenant (`TENANT_POOL_SIZE`), at most
  `TENANT_POOL_MAX_OPEN` open at once. The least recently used pool is closed first. No
  request creates an unbounded pool.

### Provisioning a client (`POST /api/v1/platform/tenants`, platform admin only)
1. Register the tenant (`provisioning`), with an encrypted random DB password.
2. Create or update the tenant's login role (no superuser, no createdb, no createrole).
3. Create the database owned by that role, and revoke public access.
4. Run tenant migrations **as the tenant role**.
5. Seed the default settings and an empty home page.
6. Link the owner (new owners get a set-password email), add the domain, and set `active`.
   This step is one control-plane transaction.

Every step is idempotent, and `provisioning_step` records progress. On failure the tenant is
marked `failed` with `last_error`, and `POST /platform/tenants/:id/retry` resumes safely.
Only this service uses `PG_ADMIN_URL`; request handlers never see it.

## Request pipeline
`helmet` → CORS (allow-list, credentials) → JSON body (1 MB) → cookie session → route.
Each route goes through an `ApiRouter` helper, which validates params, query and body with Zod
**and** registers the route in the OpenAPI document, so the docs can't drift from the
validation. Errors are centralized as `{ error: { code, message, details? } }`.

Middleware chain for site routes: `requireAuth` (session + CSRF) → `loadMemberTenant` →
`requireModule(x)` → `requirePermission(p)` / `requireOwner`.

## Roles
| | Platform admin | Owner | Staff |
|---|---|---|---|
| Create, suspend and assign owners for sites | ✓ | | |
| Any site's admin API | ✓ | own site | own site, granted permissions only |
| Manage staff | ✓ | ✓ | |
| Settings, pages, catalog, files, leads, orders | ✓ | ✓ | per permission: `site:write`, `pages:write`, `catalog:write`, `assets:write`, `leads:read/write`, `orders:read/write` |

## Content model
- **Pages** have `draft` and `published` (plus `published_title` and `published_seo`).
  Editors only change the draft. `publish` copies it and stores a `page_versions` row.
  Visitors' endpoints read **only** published columns.
- **Page document** (`packages/shared`): `{ schemaVersion: 1, sections: [{ id, type, props }] }`.
  Section types are validated by format and size. Per-type prop schemas arrive with the
  stage 2 section library. Raw HTML and scripts are never accepted as trusted content.
- **Modules** (`services`, `products`, `leads`, `orders`, …) are switched per site in
  `site_settings.modules`. Disabled modules return `403 module_disabled` on admin and public
  APIs alike.
- **Orders** are priced from the database only. Stock is reserved inside a transaction
  (`FOR UPDATE`), and cancelling returns it. `payment_status` stays `unpaid`. No endpoint can
  set `paid`. That belongs to a future, verified payment-gateway callback.

## Decisions (and why)
| Decision | Reason |
|---|---|
| Opaque session token in an HttpOnly cookie, stored as a hash | Instant revocation (logout, password reset, disabling a user). No tokens in `localStorage`. |
| Double-submit CSRF token bound to the session | Cookie auth needs CSRF protection. Applied only to authenticated routes, so public forms keep working. |
| Hand-written SQL migrations with checksums and an advisory lock | One simple runner for control and tenant DBs. Edited migrations are refused, and failures roll back and are never recorded. |
| `pg` with parameterized SQL, no ORM | Per-tenant connections are explicit. Column names come only from static maps (`common/sql.ts`). |
| argon2id (`@node-rs/argon2`) | Current recommended password hash, with prebuilt binaries for Windows and Linux. |
| Money as `bigint` minor units, returned as strings | No float rounding. IRR values exceed 2^31. |
| File type detected from bytes (`file-type`) | File extensions and declared MIME types are not trusted. |
