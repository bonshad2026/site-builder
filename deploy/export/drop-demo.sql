-- Removes the sample data made when the site was set up (rows marked `demo`), for install
-- packages built without it. Same steps as clearDemoData in the API.
BEGIN;
DELETE FROM payments WHERE demo OR order_id IN (SELECT id FROM orders WHERE demo) OR lead_id IN (SELECT id FROM leads WHERE demo);
DELETE FROM item_reviews WHERE demo;
DELETE FROM orders WHERE demo;
DELETE FROM leads WHERE demo;
DELETE FROM customers WHERE demo;
DELETE FROM collection_items WHERE demo;
DELETE FROM products WHERE demo AND id NOT IN (SELECT product_id FROM order_items WHERE product_id IS NOT NULL);
DELETE FROM services WHERE demo;
COMMIT;
