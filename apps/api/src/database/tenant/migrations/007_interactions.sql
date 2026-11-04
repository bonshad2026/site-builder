-- Customer interactions: requests follow their type's workflow (stages from the site settings),
-- get a tracking code, a timeline of events and payment requests; visitors can have accounts.

/* ---------- customer accounts ---------- */

CREATE TABLE customers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The verified identifier (phone or email, per the site's account settings).
  phone           text UNIQUE,
  email           text UNIQUE,
  name            text NOT NULL,
  password_hash   text,
  verified_at     timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  failed_logins   integer NOT NULL DEFAULT 0,
  locked_until    timestamptz,
  last_login_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

CREATE TABLE customer_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  csrf_hash     text NOT NULL,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_sessions_customer_idx ON customer_sessions (customer_id);

-- One-time codes for sign-up, sign-in and password reset (only the hash is stored).
CREATE TABLE customer_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier   text NOT NULL,
  purpose      text NOT NULL CHECK (purpose IN ('signup', 'login', 'reset')),
  code_hash    text NOT NULL,
  attempts     integer NOT NULL DEFAULT 0,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_codes_lookup_idx ON customer_codes (identifier, purpose, created_at DESC);

/* ---------- requests ---------- */

CREATE SEQUENCE lead_number_seq START 1001;

ALTER TABLE leads
  ADD COLUMN number bigint,
  ADD COLUMN public_token_hash text,
  ADD COLUMN customer_id uuid REFERENCES customers (id) ON DELETE SET NULL,
  -- Kind of the current stage (open / done / cancelled), kept with the stage for counting seats.
  ADD COLUMN stage_kind text NOT NULL DEFAULT 'open' CHECK (stage_kind IN ('open', 'done', 'cancelled')),
  ADD COLUMN answers jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN assignee_user_id uuid,
  -- Something new from the customer the staff have not opened yet.
  ADD COLUMN unread boolean NOT NULL DEFAULT true,
  ADD COLUMN amount_due_minor bigint NOT NULL DEFAULT 0 CHECK (amount_due_minor >= 0),
  ADD COLUMN amount_title text NOT NULL DEFAULT '',
  ADD COLUMN paid_minor bigint NOT NULL DEFAULT 0 CHECK (paid_minor >= 0),
  ADD COLUMN currency char(3) NOT NULL DEFAULT 'IRR',
  ADD COLUMN payment_status text NOT NULL DEFAULT 'none'
    CHECK (payment_status IN ('none', 'due', 'pending', 'paid', 'test_paid', 'failed'));

ALTER SEQUENCE lead_number_seq OWNED BY leads.number;
UPDATE leads SET number = nextval('lead_number_seq') WHERE number IS NULL;
ALTER TABLE leads ALTER COLUMN number SET DEFAULT nextval('lead_number_seq'), ALTER COLUMN number SET NOT NULL;
ALTER TABLE leads ADD CONSTRAINT leads_number_key UNIQUE (number);

-- Stages come from the request type's workflow now; old statuses move to the standard stages.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
UPDATE leads SET status = CASE status WHEN 'contacted' THEN 'reviewing' WHEN 'qualified' THEN 'in_progress' WHEN 'closed' THEN 'done' ELSE status END;
UPDATE leads SET stage_kind = 'done' WHERE status = 'done';
UPDATE leads SET unread = false WHERE status <> 'new';
ALTER TABLE leads ADD CONSTRAINT leads_status_check CHECK (status ~ '^[a-z0-9][a-z0-9_-]{1,39}$');
-- Contact details depend on the request type: either may be empty.
ALTER TABLE leads ALTER COLUMN email SET DEFAULT '', ALTER COLUMN message SET DEFAULT '';

CREATE INDEX leads_customer_idx ON leads (customer_id, created_at DESC);
CREATE INDEX leads_status_idx ON leads (status, created_at DESC);

/* ---------- orders ---------- */

ALTER TABLE orders ADD COLUMN customer_id uuid REFERENCES customers (id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN unread boolean NOT NULL DEFAULT true;
UPDATE orders SET unread = false WHERE status <> 'pending';
CREATE INDEX orders_customer_idx ON orders (customer_id, created_at DESC);

/* ---------- payments for requests ---------- */

ALTER TABLE payments ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE payments ADD COLUMN lead_id uuid REFERENCES leads (id) ON DELETE RESTRICT;
ALTER TABLE payments ADD CONSTRAINT payments_one_subject CHECK ((order_id IS NULL) <> (lead_id IS NULL));
CREATE INDEX payments_lead_idx ON payments (lead_id);

/* ---------- timeline ---------- */

-- Everything that happened to a request or order: stage changes, messages both ways, internal
-- notes, payment requests and payments. `public` events are shown to the customer.
CREATE TABLE case_events (
  id             bigserial PRIMARY KEY,
  lead_id        uuid REFERENCES leads (id) ON DELETE CASCADE,
  order_id       uuid REFERENCES orders (id) ON DELETE CASCADE,
  kind           text NOT NULL,
  public         boolean NOT NULL DEFAULT false,
  body           text NOT NULL DEFAULT '',
  data           jsonb NOT NULL DEFAULT '{}',
  actor_user_id  uuid,
  -- Written by the customer (signed in or through their tracking link).
  by_customer    boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK ((lead_id IS NULL) <> (order_id IS NULL))
);
CREATE INDEX case_events_lead_idx ON case_events (lead_id, id);
CREATE INDEX case_events_order_idx ON case_events (order_id, id);

-- Requests and orders from before get their "created" event, so every timeline has a start.
INSERT INTO case_events (lead_id, kind, public, data, created_at)
  SELECT id, 'created', true, jsonb_build_object('stage', status), created_at FROM leads;
INSERT INTO case_events (order_id, kind, public, data, created_at)
  SELECT id, 'created', true, jsonb_build_object('stage', status), created_at FROM orders;
-- Earlier internal notes join the timeline.
INSERT INTO case_events (lead_id, kind, body, actor_user_id, created_at)
  SELECT l.id, 'note', coalesce(n->>'text', ''), (n->>'by')::uuid, coalesce((n->>'at')::timestamptz, l.updated_at)
    FROM leads l, jsonb_array_elements(l.notes) n
   WHERE coalesce(n->>'text', '') <> '';
