-- Online payments. An order becomes `paid` only after the gateway confirms it
-- server-side; sandbox payments are recorded as `test_paid`.

ALTER TABLE orders DROP CONSTRAINT orders_payment_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'test_paid', 'failed', 'refunded'));

-- Lets the buyer look up their own order (only the hash is stored).
ALTER TABLE orders ADD COLUMN public_token_hash text;

-- Private: never part of the public site settings.
CREATE TABLE payment_settings (
  id                smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  provider          text NOT NULL DEFAULT 'none' CHECK (provider IN ('none', 'zarinpal', 'sandbox')),
  merchant_id       text NOT NULL DEFAULT '',
  use_sandbox_host  boolean NOT NULL DEFAULT false,
  updated_by        uuid,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
INSERT INTO payment_settings (id) VALUES (1);

CREATE TABLE payments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  provider          text NOT NULL CHECK (provider IN ('zarinpal', 'sandbox')),
  is_test           boolean NOT NULL,
  amount_minor      bigint NOT NULL CHECK (amount_minor > 0),
  currency          char(3) NOT NULL,
  status            text NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'succeeded', 'failed', 'cancelled')),
  authority         text UNIQUE,
  ref_id            text,
  card_pan          text,
  failure_reason    text,
  return_url        text NOT NULL,
  sandbox_decision  text CHECK (sandbox_decision IN ('approved', 'declined')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  verified_at       timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_order_idx ON payments (order_id);
-- At most one successful payment per order.
CREATE UNIQUE INDEX payments_one_success ON payments (order_id) WHERE status = 'succeeded';
