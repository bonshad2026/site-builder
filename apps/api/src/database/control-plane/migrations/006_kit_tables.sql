-- Site kits: each site type (bank type) holds copies of table starters with their own sample
-- items and photos; sample data for a site's tables comes from them.
CREATE TABLE IF NOT EXISTS kit_tables (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_key    text NOT NULL,
  -- The starter it was copied from (its name only; the starter may be changed or deleted later).
  name        text NOT NULL DEFAULT '',
  -- A starter pack (shared starters.ts) holding the table(s), item pages, forms, box designs,
  -- sample items and photo copies of its own.
  pack        jsonb NOT NULL,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kit_tables_type_idx ON kit_tables (type_key, position);

-- Kinds of content are now only the plain lists (products, services, reviews, FAQ); tables
-- come from kits. Studio-made kinds and entries of other kinds are no longer used.
DELETE FROM bank_entries WHERE kind NOT IN ('product', 'service', 'testimonial', 'faq');
DELETE FROM bank_hidden WHERE kind NOT IN ('', 'product', 'service', 'testimonial', 'faq');
DROP TABLE IF EXISTS bank_kinds;
