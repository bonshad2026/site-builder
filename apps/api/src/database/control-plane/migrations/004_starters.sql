-- Built-in bank entries and photos the studio removed (they live in code, so they are hidden here).
-- ref: an entry's content hash or a built-in photo's ref.
CREATE TABLE IF NOT EXISTS bank_hidden (
  type_key    text NOT NULL,
  kind        text NOT NULL DEFAULT '',
  ref         text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (type_key, kind, ref)
);

-- The studio's own starting points for new pages and tables, usable on any site.
-- page: { document }, table: the table definition (name, fields, options) without its items.
CREATE TABLE IF NOT EXISTS starters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('page', 'table')),
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  data        jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS starters_kind_idx ON starters (kind, name);
