-- Tenant database: everything that belongs to one client's website.

CREATE TABLE site_settings (
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  settings    jsonb NOT NULL,
  updated_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE assets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key    text NOT NULL UNIQUE,
  original_name  text NOT NULL,
  content_type   text NOT NULL,
  size_bytes     bigint NOT NULL CHECK (size_bytes > 0),
  visibility     text NOT NULL CHECK (visibility IN ('public', 'private')),
  kind           text NOT NULL CHECK (kind IN ('image', 'document')),
  alt            jsonb NOT NULL DEFAULT '{}',
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);

-- Pages keep a draft and a separately published copy; visitors only ever see `published`.
CREATE TABLE pages (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title              jsonb NOT NULL,
  is_home            boolean NOT NULL DEFAULT false,
  position           integer NOT NULL DEFAULT 0,
  seo                jsonb NOT NULL DEFAULT '{}',
  draft              jsonb NOT NULL,
  draft_updated_at   timestamptz NOT NULL DEFAULT now(),
  published          jsonb,
  published_title    jsonb,
  published_seo      jsonb,
  published_at       timestamptz,
  published_version  integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pages_single_home ON pages (is_home) WHERE is_home;

CREATE TABLE page_versions (
  id            bigserial PRIMARY KEY,
  page_id       uuid NOT NULL REFERENCES pages (id) ON DELETE CASCADE,
  version       integer NOT NULL,
  document      jsonb NOT NULL,
  title         jsonb NOT NULL,
  seo           jsonb NOT NULL,
  published_by  uuid,
  published_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, version)
);

CREATE TABLE services (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,
  title           jsonb NOT NULL,
  summary         jsonb NOT NULL,
  body            jsonb NOT NULL,
  image_asset_id  uuid REFERENCES assets (id) ON DELETE SET NULL,
  duration        jsonb NOT NULL,
  starting_from   jsonb NOT NULL,
  deliverables    jsonb NOT NULL DEFAULT '[]',
  process         jsonb NOT NULL DEFAULT '[]',
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  position        integer NOT NULL DEFAULT 0,
  seo             jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,
  name            jsonb NOT NULL,
  description     jsonb NOT NULL,
  category        text,
  price_minor     bigint CHECK (price_minor >= 0),
  currency        char(3) NOT NULL DEFAULT 'IRR',
  stock           integer CHECK (stock >= 0),
  is_available    boolean NOT NULL DEFAULT true,
  featured        boolean NOT NULL DEFAULT false,
  materials       jsonb NOT NULL,
  dimensions      text NOT NULL DEFAULT '',
  lead_time       jsonb NOT NULL,
  image_asset_id  uuid REFERENCES assets (id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  position        integer NOT NULL DEFAULT 0,
  seo             jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_listing_idx ON products (status, category, position);

CREATE TABLE leads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL CHECK (type IN ('contact', 'consultation', 'service_request')),
  name          text NOT NULL,
  email         text NOT NULL,
  phone         text NOT NULL DEFAULT '',
  project_type  text,
  budget        text,
  message       text NOT NULL,
  source_path   text,
  status        text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'closed')),
  notes         jsonb NOT NULL DEFAULT '[]',
  ip_hash       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leads_created_idx ON leads (created_at DESC);

CREATE SEQUENCE order_number_seq START 1001;

CREATE TABLE orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number          bigint NOT NULL UNIQUE DEFAULT nextval('order_number_seq'),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'fulfilled', 'cancelled')),
  -- 'paid' may only be set by a verified payment-gateway callback (not implemented yet).
  payment_status  text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'refunded')),
  customer        jsonb NOT NULL,
  note            text,
  currency        char(3) NOT NULL,
  subtotal_minor  bigint NOT NULL CHECK (subtotal_minor >= 0),
  total_minor     bigint NOT NULL CHECK (total_minor >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id        uuid REFERENCES products (id) ON DELETE SET NULL,
  product_slug      text NOT NULL,
  product_name      jsonb NOT NULL,
  unit_price_minor  bigint NOT NULL CHECK (unit_price_minor >= 0),
  quantity          integer NOT NULL CHECK (quantity BETWEEN 1 AND 50),
  line_total_minor  bigint NOT NULL,
  CHECK (line_total_minor = unit_price_minor * quantity)
);
CREATE INDEX order_items_order_idx ON order_items (order_id);

CREATE TABLE audit_events (
  id             bigserial PRIMARY KEY,
  actor_user_id  uuid,
  action         text NOT NULL,
  target         text,
  metadata       jsonb NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now()
);
