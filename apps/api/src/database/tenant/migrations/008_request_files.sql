-- Files visitors attach to a request (a file question). Uploaded before the form is sent, then
-- attached to the request; uploads never attached are removed after a day.
CREATE TABLE request_files (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        uuid REFERENCES leads (id) ON DELETE CASCADE,
  request_type   text NOT NULL,
  field          text NOT NULL,
  storage_key    text NOT NULL UNIQUE,
  original_name  text NOT NULL,
  content_type   text NOT NULL,
  size_bytes     integer NOT NULL CHECK (size_bytes > 0),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX request_files_lead_idx ON request_files (lead_id);
CREATE INDEX request_files_orphans_idx ON request_files (created_at) WHERE lead_id IS NULL;
