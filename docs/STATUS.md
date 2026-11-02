# Status

Where the work stands, for whoever (person or agent) continues it. Newest first. Keep it short:
update it at the end of every session (see "End of every session" in [`AGENTS.md`](../AGENTS.md)).

## Now
- Branch `feature/review-fixes` (the owner's review list, one item at a time) is merged into `develop`.
  Done so far: "Refresh photos" shows only for sites that still have placeholder photos; empty-site test
  covers modules, tables and photos; "Site texts" is operator-only (hidden for clients, ignored by the API);
  new sites store version-2 forms and the "Consultation form choices" card is gone; the Modules tab
  shows only the four working switches with names and explanations; the content bank became
  **site kits**: per site type, copies of table starters with editable sample items and photos, plus
  lists (products, services, reviews, FAQ); sample data takes table items from the kit and can add
  kit tables a site lacks. The general kit holds the 6 ready-made tables.
  The owner deleted the studio sites that still had version-1 forms (`empty`, `3000`, `demo-beauty`,
  `871051`, `atelier-navar`) on 2026-11-02, without a backup.
- Branch `develop` holds everything; all feature branches above and below are merged into it.
  New review items go on a new branch from `develop`.
- `main` is behind `develop` (`git rev-list --count main..develop`); it is updated only when the owner asks.
- Tests: web 43/43, API 98/98 (2026-11-02). Known typecheck error in `apps/api/test/shop.test.ts`
  (`amountMinor` on a type with only `authority`) — older than this file, not yet fixed.
- The studio on the owner's machine runs the latest `develop` (rebuilt 2026-11-02, 52 ready-made starters added).

## Next (in this order, unless the owner asks for something else)
1. Fix the typecheck error in `apps/api/test/shop.test.ts` so `npm run typecheck` is clean.
2. Sample data for **services** (setup and ready-made starters only turn the module on; service pages
   preview empty). See [features/site-setup.md](features/site-setup.md) and
   [features/starters.md](features/starters.md).
3. Ask the owner whether to delete the merged branches (local and on GitHub):
   `feature/studio-and-client-delivery`, `feature/builder-buttons-requests`, `feature/collections`,
   `feature/interactions`, `feature/starters-menu`, `feature/starter-packs`, `docs/agent-guide`, `docs/agent-start`.
4. Ask the owner whether `develop` should be merged into `main`.

## Open questions for the owner
- None waiting.

## Log
- **2026-11-02** — `feature/review-fixes`: site kits replace the content bank's kinds (control
  migration `006_kit_tables.sql`, `kit_tables`; see [features/site-setup.md](features/site-setup.md)).
- **2026-11-02** — `feature/review-fixes`: the sites list reports `placeholderPhotos` per active site;
  "Refresh photos" is shown only when it is above 0 (test in `provisioning.test.ts`). "Site texts" is
  operator-only: hidden in the client panel and dropped from client saves (test in `content.test.ts`).
  Default request types are stored as version 2; "Consultation form choices" removed; the web test of
  the old no-API demo form was dropped (the field-based form has no offline demo mode).
- **2026-11-02** — Agent guide: `AGENTS.md` (read by every agent; `CLAUDE.md` imports it), feature
  docs in `docs/features/`, docs index, legacy docs marked, this status file, pointer files for other
  tools ("Start here" routine). Commits on `docs/agent-guide` and `docs/agent-start`, merged into `develop`.
- **2026-11-02** — Starter packs (`feature/starter-packs`, merged): self-contained starters (tables,
  item pages, forms, box designs, photos, sample items), check-and-apply on any site incl. empty ones,
  replace to update, groups, Starters menu per kind (pages / tables / headers / footers), live previews
  with sample data, header and footer starters, account menu layouts, 52 ready-made starters.
  Details: [features/starters.md](features/starters.md).
- Earlier: studio and client delivery, content tables, interactions, site setup, content bank — see
  `git log develop` and the feature docs.
