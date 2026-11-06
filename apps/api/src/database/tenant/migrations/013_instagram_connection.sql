-- Private singleton for this tenant's dedicated sender.
CREATE TABLE instagram_connection (
  id integer PRIMARY KEY CHECK (id=1),
  username text NOT NULL DEFAULT '',
  password_enc text,
  session_enc text,
  code_enc text,
  action text NOT NULL DEFAULT 'none',
  status text NOT NULL DEFAULT 'disconnected',
  error_code text,
  version integer NOT NULL DEFAULT 1,
  heartbeat_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO instagram_connection(id) VALUES(1);
