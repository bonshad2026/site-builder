-- Content tables defined per site (courses, classes, news…) and their items. A table's fields
-- live in `fields` (JSON); an item's values live in `data`, keyed by field.

CREATE TABLE collections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name          jsonb NOT NULL,
  item_name     jsonb NOT NULL,
  fields        jsonb NOT NULL DEFAULT '[]',
  detail_page   text NOT NULL DEFAULT '',
  image_field   text NOT NULL DEFAULT '',
  commerce      jsonb NOT NULL DEFAULT '{}',
  request_type  text NOT NULL DEFAULT '',
  position      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE collection_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id  uuid NOT NULL REFERENCES collections (id) ON DELETE CASCADE,
  slug           text NOT NULL,
  title          jsonb NOT NULL,
  data           jsonb NOT NULL DEFAULT '{}',
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  position       integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (collection_id, slug)
);
CREATE INDEX collection_items_listing_idx ON collection_items (collection_id, status, position);
CREATE INDEX collection_items_data_idx ON collection_items USING gin (data jsonb_path_ops);

-- Orders can sell content-table items (a class seat…) next to products.
ALTER TABLE order_items ADD COLUMN collection_item_id uuid REFERENCES collection_items (id) ON DELETE SET NULL;
CREATE INDEX order_items_collection_item_idx ON order_items (collection_item_id) WHERE collection_item_id IS NOT NULL;

-- A request can be about one item; { collection, id, slug, title }.
ALTER TABLE leads ADD COLUMN item_ref jsonb;
CREATE INDEX leads_item_idx ON leads ((item_ref->>'id')) WHERE item_ref IS NOT NULL;
