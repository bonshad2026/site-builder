# Site Builder

A platform for building, customizing and delivering bespoke websites to business clients.
It includes a drag-and-drop page builder, an admin panel and online payment. Each client gets
their own PostgreSQL database.

| Stage | Status |
|---|---|
| 1. Visual demo | ✅ [report](docs/stage-1-report.md) |
| 2. Design system, themes, section library | ✅ [report](docs/final-report.md) |
| 3. Drag-and-drop page builder | ✅ |
| 4–6. API, control and tenant databases, auth and roles, provisioning, storage | ✅ [report](docs/backend-report.md) |
| 7. Products, services, leads, orders, **payments (Zarinpal + test gateway)** | ✅ |
| 8. Persian/English (`/fa`), SEO, sitemap, prerendering | ✅ |
| 9–10. Tests, security review, docs, deployment | ✅ (see the known limitations in each report) |

Demo client: **Atelier Navar**, a made-up interior design studio. It's sample content only.

## Quick start
```bash
npm install
cp .env.example .env     # fill in the secrets (see docs/operations.md)
npm run db:up            # PostgreSQL in Docker (localhost:5433)
npm run migrate
npm run seed             # dev: admin + demo site (own database, pages, catalog, images, test gateway)
npm run dev:api          # http://localhost:4000
npm run dev              # http://localhost:5173   ·   admin: /admin
npm test                 # web + API (API tests need the Postgres container)
```

## Layout
```
apps/web          React + Vite + Tailwind
  src/sections      section renderers (the library)
  src/admin         admin panel, page builder (builder/), platform pages
  src/features      public pages, cart & checkout, contact form
  scripts/          build-time SEO prerender
apps/api          Express 5 + TypeScript REST API
  src/modules       auth, platform, members, site, pages, catalog, leads, orders, payments, assets, public
  src/database      migration runner, control-plane + tenant migrations, pools
  test/             integration tests on real Postgres (tenant isolation, payments, …)
packages/shared   Zod schemas: site settings, page documents, section library, payments
docs/             architecture, api, operations, security, reports
```

## Docs
[Architecture](docs/architecture.md) · [API](docs/api.md) · [Operations](docs/operations.md) · [Security](docs/security.md) · [Latest report](docs/final-report.md)
