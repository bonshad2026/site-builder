-- Operator-delivered APKs are separate from the ordinary asset library and its signed links.
CREATE TABLE mobile_apps (
  slot text PRIMARY KEY CHECK (slot IN ('customer','management')),
  storage_key text NOT NULL,
  original_name text NOT NULL,
  version text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0),
  sha256 text NOT NULL,
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
