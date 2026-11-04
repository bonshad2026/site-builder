-- Shops can add their own order stages (e.g. packing, shipped) next to the built-in ones.
ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status ~ '^[a-z0-9][a-z0-9_-]{1,39}$');
