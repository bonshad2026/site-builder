-- Control plane: identities, sessions, tenants and memberships.
-- Tenant business data never lives here; it lives in each tenant's own database.

CREATE TABLE users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text UNIQUE CHECK (email = lower(email)),
  phone              text UNIQUE,
  password_hash      text,
  display_name       text NOT NULL DEFAULT '',
  email_verified_at  timestamptz,
  phone_verified_at  timestamptz,
  is_platform_admin  boolean NOT NULL DEFAULT false,
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE TABLE sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash      text NOT NULL UNIQUE,
  csrf_hash       text NOT NULL,
  ip              text,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  revoked_at      timestamptz
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- Single-use tokens for email verification and password reset (only hashes are stored).
CREATE TABLE auth_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN ('email_verify', 'password_reset')),
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_tokens_user_idx ON auth_tokens (user_id, purpose);

-- Short-lived SMS codes, limited attempts, single use.
CREATE TABLE otp_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         text NOT NULL,
  purpose       text NOT NULL CHECK (purpose IN ('login', 'verify_phone')),
  user_id       uuid REFERENCES users (id) ON DELETE CASCADE,
  code_hash     text NOT NULL,
  attempts      integer NOT NULL DEFAULT 0,
  max_attempts  integer NOT NULL DEFAULT 5,
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_codes_lookup_idx ON otp_codes (phone, purpose, created_at DESC);

CREATE TABLE tenants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name              text NOT NULL,
  status            text NOT NULL DEFAULT 'provisioning'
                      CHECK (status IN ('provisioning', 'active', 'suspended', 'failed')),
  db_name           text NOT NULL UNIQUE,
  db_user           text NOT NULL UNIQUE,
  -- AES-256-GCM encrypted with TENANT_SECRETS_KEY; never returned by the API.
  db_password_enc   text,
  provisioning_step text,
  last_error        text,
  schema_version    text,
  created_by        uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  activated_at      timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_domains (
  domain      text PRIMARY KEY CHECK (domain = lower(domain)),
  tenant_id   uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  is_primary  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tenant_domains_one_primary ON tenant_domains (tenant_id) WHERE is_primary;

CREATE TABLE memberships (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  role         text NOT NULL CHECK (role IN ('owner', 'staff')),
  permissions  text[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id)
);
CREATE INDEX memberships_tenant_idx ON memberships (tenant_id);

CREATE TABLE audit_events (
  id             bigserial PRIMARY KEY,
  actor_user_id  uuid,
  tenant_id      uuid,
  action         text NOT NULL,
  target         text,
  metadata       jsonb NOT NULL DEFAULT '{}',
  ip             text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_tenant_idx ON audit_events (tenant_id, created_at DESC);
