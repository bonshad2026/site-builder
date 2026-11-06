-- Tenant-local addresses, quote orders and durable Instagram delivery.
ALTER TABLE customers ALTER COLUMN verified_at DROP NOT NULL;
ALTER TABLE customers ADD COLUMN addresses jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE orders ADD COLUMN pricing_pending boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN request_id uuid;
CREATE UNIQUE INDEX orders_customer_request ON orders(customer_id, request_id) WHERE request_id IS NOT NULL;
CREATE TABLE instagram_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  recipient text NOT NULL,
  message text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','sent','failed','unknown')),
  error_code text,
  message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX instagram_outbox_pending ON instagram_outbox(created_at) WHERE state = 'pending';
