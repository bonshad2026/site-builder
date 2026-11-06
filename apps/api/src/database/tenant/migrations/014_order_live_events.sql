-- Transactional, payload-free invalidations for each tenant's order inbox.
CREATE FUNCTION notify_order_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('sb_orders_changed','changed');
  RETURN NULL;
END;
$$;
CREATE TRIGGER orders_live AFTER INSERT OR UPDATE OR DELETE ON orders FOR EACH STATEMENT EXECUTE FUNCTION notify_order_changes();
CREATE TRIGGER order_items_live AFTER INSERT OR UPDATE OR DELETE ON order_items FOR EACH STATEMENT EXECUTE FUNCTION notify_order_changes();
CREATE TRIGGER order_delivery_live AFTER INSERT OR UPDATE OR DELETE ON instagram_outbox FOR EACH STATEMENT EXECUTE FUNCTION notify_order_changes();
CREATE TRIGGER order_payments_live AFTER INSERT OR UPDATE OR DELETE ON payments FOR EACH STATEMENT EXECUTE FUNCTION notify_order_changes();
