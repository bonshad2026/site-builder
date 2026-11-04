-- Starters get a group (one per starter, shown as a folder) and two more kinds: a site's header and footer.
ALTER TABLE starters ADD COLUMN IF NOT EXISTS group_name text NOT NULL DEFAULT '';
ALTER TABLE starters DROP CONSTRAINT IF EXISTS starters_kind_check;
ALTER TABLE starters ADD CONSTRAINT starters_kind_check CHECK (kind IN ('page', 'table', 'header', 'footer'));
-- Ready-made starters added by the studio (see modules/starters/samples.ts); null for the operator's own.
ALTER TABLE starters ADD COLUMN IF NOT EXISTS sample_key text UNIQUE;
DROP INDEX IF EXISTS starters_kind_idx;
CREATE INDEX IF NOT EXISTS starters_kind_idx ON starters (kind, group_name, name);
