# Status

Where the work stands, for whoever (person or agent) continues it. Newest first. Keep it short:
update it at the end of every session (see "End of every session" in [`AGENTS.md`](../AGENTS.md)).

## Now
- Developer guide (`feature/dev-docs`, merged into `develop` 2026-11-03): the Persian developer guide in
  `docs/dev/` — 35 pages in 7 chapters (start, architecture, layers, features, recipes, operations,
  rules), every claim checked against the code, Mermaid diagrams parsed with mermaid 11, links checked.
  `docs/dev/index.html` (built by `npm run docs:html`, `tools/dev-docs/build.mjs`) opens the whole
  guide with a double click; rebuild it after editing. Keep it current with every change
  (`docs/dev/07-rules/docs.md`).
- User guide (`feature/user-guide`, merged into `develop` 2026-11-03): Persian, one short video per task.
  Sample page `docs/guide/payment-gateways.md`; videos and screenshots are recorded by
  `tools/guide-videos` (scenes with `shots` make screenshots) into `docs/guide/media/`, which is kept
  out of Git. Next: agree the list of guide pages with the owner, then add a scene and a page for each.
- Branch `feature/payment-gateways` (pushed and merged into `develop` on 2026-11-02): several gateways per
  site with the buyer choosing at checkout, a studio gateway catalog, operator control of which
  gateways each site may use, a transactions page with "check again", and "test connection". Gateways
  are drivers in `apps/api/src/modules/payments/drivers.ts`; see [features/shop.md](features/shop.md).
  Checked in the studio browser (settings, checkout choice, transactions, catalog). Not done: the
  customer's order/request tracking page still pays with the site's first gateway (no choice there);
  new gateways (Saman/SEP, Mellat, PayPing…) and a no-code custom gateway are not written yet.
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
- Tests: web 43/43, API 104/104 (2026-11-02, on `feature/payment-gateways`). Typecheck is clean (the
  old `shop.test.ts` error was fixed with the gateway `verify` signatures).
- The studio on the owner's machine runs the latest `develop` (rebuilt 2026-11-02, 52 ready-made starters added).

## Next (in this order, unless the owner asks for something else)
1. Payment choice on the customer's order/request tracking page (today it pays with the first gateway).
2. Sample data for **services** (setup and ready-made starters only turn the module on; service pages
   preview empty). See [features/site-setup.md](features/site-setup.md) and
   [features/starters.md](features/starters.md).
3. Ask the owner whether to delete the merged branches (local and on GitHub):
   `feature/payment-gateways`, `feature/studio-and-client-delivery`, `feature/builder-buttons-requests`, `feature/collections`,
   `feature/interactions`, `feature/starters-menu`, `feature/starter-packs`, `docs/agent-guide`, `docs/agent-start`.
4. Ask the owner whether `develop` should be merged into `main`.

## Open questions for the owner
- None waiting.

## Log
- **2026-11-03** — `feature/dev-docs`: Persian developer guide `docs/dev/` (index `docs/dev/README.md`); linked from `AGENTS.md` and `docs/README.md`.
- **2026-11-02** — `feature/payment-gateways`: tenant migration `011_payment_gateways.sql` moves each
  site's single gateway into `payment_gateways` (one row per driver) and drops the old columns of
  `payment_settings`; studio catalog in `app_settings` (`payment_catalog`); tests in `payments.test.ts`.
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
