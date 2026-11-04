-- Visitors' own items (a trainer keeps a profile in a table), kinds of account, the item that
-- handles a request (its trainer), and ratings with comments on items.

ALTER TABLE collections
  ADD COLUMN self_service jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN reviews jsonb NOT NULL DEFAULT '{}';

-- The customer who keeps this item (at most one item per table and customer).
ALTER TABLE collection_items ADD COLUMN owner_customer_id uuid REFERENCES customers (id) ON DELETE SET NULL;
CREATE UNIQUE INDEX collection_items_owner_idx ON collection_items (collection_id, owner_customer_id) WHERE owner_customer_id IS NOT NULL;

-- One of the site's account kinds (`settings.accounts.kinds`) and the organisation's name.
ALTER TABLE customers
  ADD COLUMN kind text NOT NULL DEFAULT '',
  ADD COLUMN organization text NOT NULL DEFAULT '';

-- Files a customer uploads for their own item (photo, CV…); they may only use their own.
ALTER TABLE assets ADD COLUMN customer_id uuid REFERENCES customers (id) ON DELETE SET NULL;

-- The item that handles the request (a trainer), picked by the staff.
ALTER TABLE leads ADD COLUMN assigned_item_id uuid REFERENCES collection_items (id) ON DELETE SET NULL;
CREATE INDEX leads_assigned_item_idx ON leads (assigned_item_id) WHERE assigned_item_id IS NOT NULL;

CREATE TABLE item_reviews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      uuid NOT NULL REFERENCES collection_items (id) ON DELETE CASCADE,
  customer_id  uuid REFERENCES customers (id) ON DELETE SET NULL,
  -- The finished request the review is about (one review per request).
  lead_id      uuid UNIQUE REFERENCES leads (id) ON DELETE SET NULL,
  author_name  text NOT NULL,
  rating       smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body         text NOT NULL DEFAULT '',
  -- Hidden reviews stay for the staff but are not shown or counted.
  status       text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  demo         boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX item_reviews_item_idx ON item_reviews (item_id, created_at DESC);
