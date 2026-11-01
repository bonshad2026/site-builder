-- Sample data made when a site is set up (products, items, customers, orders, payments,
-- requests) is marked, so it can be removed in one go before the site is delivered.
ALTER TABLE products ADD COLUMN demo boolean NOT NULL DEFAULT false;
ALTER TABLE services ADD COLUMN demo boolean NOT NULL DEFAULT false;
ALTER TABLE collection_items ADD COLUMN demo boolean NOT NULL DEFAULT false;
ALTER TABLE customers ADD COLUMN demo boolean NOT NULL DEFAULT false;
ALTER TABLE leads ADD COLUMN demo boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN demo boolean NOT NULL DEFAULT false;
ALTER TABLE payments ADD COLUMN demo boolean NOT NULL DEFAULT false;
