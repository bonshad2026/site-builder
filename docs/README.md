# Docs index

Start with [`AGENTS.md`](../AGENTS.md) at the repository root: how the project works today, commands,
Git, conventions and gotchas.

## Current
| Doc | What |
|---|---|
| [STATUS.md](STATUS.md) | Where the work stands, what is open, what comes next (read at the start of every session) |
| [dev/](dev/README.md) | Developer guide in Persian: setup, architecture, layers, features, step-by-step recipes, operations, rules |
| [features/studio-and-delivery.md](features/studio-and-delivery.md) | Studio, deploy service, client packages, cell mode, backups |
| [features/site-setup.md](features/site-setup.md) | New sites, built-in pages, sample data, site kits |
| [features/collections.md](features/collections.md) | Content tables, lists, box designer, item pages |
| [features/interactions.md](features/interactions.md) | Request forms, workflows, customer accounts, tracking, inbox |
| [features/shop.md](features/shop.md) | Products, checkout, coupons, shipping, payments, reviews |
| [features/starters.md](features/starters.md) | Starter packs, groups, previews, ready-made starters |
| [HANDOFF.fa.md](HANDOFF.fa.md) | The owner's guide in Persian: setting up the studio on a new machine, daily tasks |
| `deploy/export/README.md` | Guide shipped inside each client package |
| `GET /api/v1/openapi.json` | The API, generated from the route schemas (always current) |

## Legacy (the first single-stack version)
Kept for history; they describe the root `docker-compose.yml` setup and early stages. Parts are still
true (tenant isolation, payments, security measures), but check the code before relying on them.

| Doc | Notes |
|---|---|
| [architecture.md](architecture.md) | Overall design (control DB + one DB per site) still holds |
| [api.md](api.md) | Conventions still hold; routes are incomplete — use `openapi.json` |
| [security.md](security.md) | Measures still in place; newer features (customers, files, cells) not covered |
| [operations.md](operations.md) | Root `docker-compose.yml` setup; the studio is now `deploy/docker-compose.yml` |
| [stage-1-report.md](stage-1-report.md), [backend-report.md](backend-report.md), [final-report.md](final-report.md) | Stage reports |
