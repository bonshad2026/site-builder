-- Extra product photos and name / value details, and customer request types defined per site.

ALTER TABLE products
  ADD COLUMN image_asset_ids jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN attributes jsonb NOT NULL DEFAULT '[]';

-- A lead's type is now a request type slug from the site settings (consultation, demo, payment…).
ALTER TABLE leads DROP CONSTRAINT leads_type_check;
ALTER TABLE leads ADD CONSTRAINT leads_type_check CHECK (type ~ '^[a-z0-9][a-z0-9_-]{1,39}$');
CREATE INDEX leads_type_idx ON leads (type, created_at DESC);
