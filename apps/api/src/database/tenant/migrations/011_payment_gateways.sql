-- A site can offer several online gateways at once; the buyer picks one at checkout.
-- One row per gateway driver. The operator decides which gateways a site may use (`allowed`);
-- the site's staff set up and turn on the allowed ones. Private: never part of the public settings.
CREATE TABLE payment_gateways (
  provider     text PRIMARY KEY,
  allowed      boolean NOT NULL DEFAULT true,
  enabled      boolean NOT NULL DEFAULT false,
  sort         integer NOT NULL DEFAULT 0,
  -- Buyer-facing name and note ({en, fa}); empty means the gateway's own name.
  label        jsonb NOT NULL DEFAULT '{"en": "", "fa": ""}',
  description  jsonb NOT NULL DEFAULT '{"en": "", "fa": ""}',
  -- Merchant id, API key… as the gateway's driver names them.
  credentials  jsonb NOT NULL DEFAULT '{}',
  test_mode    boolean NOT NULL DEFAULT false,
  updated_by   uuid,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- The one gateway a site had so far becomes its first (enabled) gateway.
INSERT INTO payment_gateways (provider, enabled, credentials, test_mode)
SELECT provider, true,
       CASE WHEN merchant_id = '' THEN '{}'::jsonb
            WHEN provider = 'idpay' THEN jsonb_build_object('apiKey', merchant_id)
            ELSE jsonb_build_object('merchantId', merchant_id) END,
       use_sandbox_host
  FROM payment_settings WHERE id = 1 AND provider <> 'none';

ALTER TABLE payment_settings DROP COLUMN provider, DROP COLUMN merchant_id, DROP COLUMN use_sandbox_host;

-- Gateways are drivers in the API now; a payment names the one it started with.
ALTER TABLE payments DROP CONSTRAINT payments_provider_check;
CREATE INDEX payments_created_idx ON payments (created_at DESC);
