-- Shop extras: shipping and discount codes on orders, product variants (size, model…) with their
-- own price and stock, product reviews and newsletter subscribers.

ALTER TABLE orders
  ADD COLUMN shipping_minor bigint NOT NULL DEFAULT 0 CHECK (shipping_minor >= 0),
  ADD COLUMN shipping_method jsonb,
  ADD COLUMN discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  ADD COLUMN coupon_code text;

ALTER TABLE products ADD COLUMN variants jsonb NOT NULL DEFAULT '[]';
ALTER TABLE order_items ADD COLUMN variant text NOT NULL DEFAULT '';

CREATE TABLE coupons (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL UNIQUE,
  kind             text NOT NULL CHECK (kind IN ('percent', 'amount')),
  value            bigint NOT NULL CHECK (value > 0),
  min_order_minor  bigint NOT NULL DEFAULT 0,
  max_uses         integer,
  used_count       integer NOT NULL DEFAULT 0,
  starts_at        timestamptz,
  ends_at          timestamptz,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE product_reviews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  customer_id  uuid REFERENCES customers (id) ON DELETE SET NULL,
  name         text NOT NULL,
  rating       smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text         text NOT NULL DEFAULT '',
  -- New reviews wait for the staff; only approved ones are public.
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  ip_hash      text,
  demo         boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_reviews_product_idx ON product_reviews (product_id, status, created_at DESC);

CREATE TABLE subscribers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact     text NOT NULL UNIQUE,
  name        text NOT NULL DEFAULT '',
  source_path text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- More payment gateways.
ALTER TABLE payment_settings DROP CONSTRAINT payment_settings_provider_check;
ALTER TABLE payment_settings ADD CONSTRAINT payment_settings_provider_check CHECK (provider IN ('none', 'zarinpal', 'zibal', 'idpay', 'sandbox'));
ALTER TABLE payments DROP CONSTRAINT payments_provider_check;
ALTER TABLE payments ADD CONSTRAINT payments_provider_check CHECK (provider IN ('zarinpal', 'zibal', 'idpay', 'sandbox'));
