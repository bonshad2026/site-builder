-- Product options (discount, colours, per-order limit), the colour chosen on each order line,
-- payment on delivery, and reservation / demo requests.

ALTER TABLE products
  ADD COLUMN discount_percent integer NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 90),
  ADD COLUMN colors jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN max_per_order integer CHECK (max_per_order BETWEEN 1 AND 50);

ALTER TABLE order_items ADD COLUMN option text NOT NULL DEFAULT '';

ALTER TABLE orders ADD COLUMN payment_method text NOT NULL DEFAULT 'online' CHECK (payment_method IN ('online', 'cod'));

ALTER TABLE payment_settings ADD COLUMN allow_cod boolean NOT NULL DEFAULT false;

ALTER TABLE leads DROP CONSTRAINT leads_type_check;
ALTER TABLE leads ADD CONSTRAINT leads_type_check CHECK (type IN ('contact', 'consultation', 'service_request', 'reservation', 'demo'));
-- Extra answers for some request types (e.g. date, time and party size for a reservation).
ALTER TABLE leads ADD COLUMN details jsonb NOT NULL DEFAULT '{}';
