# Importing an installed design into studio

A client package omits the structural builder. To edit its design and export later versions,
create an isolated studio tenant rather than attaching studio to the live client database.
This is currently an operator-assisted workflow, not a package-upload button in the admin.

## Preconditions and safe boundary
- Retain the original archive/installation and inspect its schema against the current shared
  settings/page schemas before provisioning. Reject unsupported blocks; do not silently strip them.
- Never restore a complete cluster dump into studio: it contains roles/control data for another
  server. Provision a new tenant with the existing provisioning service; refuse an existing slug.
- Work on the new database only. Copy design/catalog tables: site_settings, pages, page_versions,
  assets, products, services, collections, collection_items. Do not import customer sessions,
  customers, orders, payments, request history or provider credentials.
- Clear imported asset.customer_id and collection_item.owner_customer_id links in the isolated
  copy when customers were not imported. Retain source page/asset/item UUIDs so references work.
- Copy referenced storage files into the new tenant storage namespace; the namespace in an
  archive can differ from its cell tenant id. Derive it from assets.storage_key, never assume it.
- Remap the old namespace and origin in page/settings/item JSON and asset keys to the new
  namespace and preview origin. Validate all pages/settings after transfer and fix sequences.
- The data restore should be transactional with ON_ERROR_STOP. pg_dump resets search_path;
  use explicit public.* names for post-restore statements. Do not leave foreign keys disabled.

## Existing helpers
- tools/delivery/prepare-studio-import.mjs runs inside studio API, accepts a new slug, uses
  provisionTenant and the existing platform administrator as owner. It refuses existing tenants
  and writes non-secret identity metadata under /tmp/studio-import-target.json.
- tools/delivery/finalize-studio-import.mjs consumes /tmp/studio-import-map.json with slug,
  sourceId (storage namespace), targetId, sourceUrl, previewUrl. It remaps known content JSON,
  validates shared schemas and updates the registered name; it does not transfer files/dump data.
- These are operator helpers, not a fully automated arbitrary-archive importer. Keep staging
  dumps/manifests in ignored var/, and do not rerun bootstrap over customer edits.

## Future packaging identity
Copy the installed package's saved delivery secrets into the deploy service's existing
/data/sites/<slug>/deploy.env (private control-data volume, mode 600), without printing them.
This preserves signing/encryption/SSO identity across future design updates; never put this file
in Git. The studio tenant still has its own independently encrypted database credentials.
Build from the existing Preview & deploy screen, after publishing intended studio changes.
For an existing client use a design-update package; a full install targets a fresh installation.
Design updates can replace page text/images edited on the client; review them before applying.

## Compatibility across branches
Firefighter delivery carried 012_members_and_reviews.sql; another branch used 012 for Instagram.
Current members/reviews migration is 015_members_and_reviews.sql and tolerates the old members
schema already existing. Applied migrations 001–014 are not edited. The dedicated real-Postgres
regression test delivery-compatibility.test.ts verifies the old-name upgrade case.
Details of the deployed example belong in docs/clients/firefighter/README.md.
