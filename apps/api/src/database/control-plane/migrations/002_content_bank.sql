-- Content bank: texts and photos per site type, sorted by kind of content, used to make sample
-- data for sites. Built-in types and kinds live in code; these tables hold the studio's own.

-- The kind of site (business type key, or 'general'), so sample data uses the right bank.
ALTER TABLE tenants ADD COLUMN business_type text NOT NULL DEFAULT '';

CREATE TABLE bank_types (
  key         text PRIMARY KEY,
  label       jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bank_kinds (
  key         text PRIMARY KEY,
  label       jsonb NOT NULL,
  fields      jsonb NOT NULL DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bank_photos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_key       text NOT NULL,
  -- Empty = a photo of the type for any kind (heroes, galleries, items without photos).
  kind           text NOT NULL DEFAULT '',
  storage_key    text NOT NULL UNIQUE,
  content_type   text NOT NULL,
  size_bytes     integer NOT NULL,
  original_name  text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bank_photos_type_idx ON bank_photos (type_key, kind);

CREATE TABLE bank_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_key    text NOT NULL,
  kind        text NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}',
  -- Bank photo ids, first = main photo.
  photos      jsonb NOT NULL DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bank_entries_type_idx ON bank_entries (type_key, kind, created_at);
