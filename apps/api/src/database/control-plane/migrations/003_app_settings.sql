-- Server-wide settings made in the admin panel (e-mail and SMS for now); secrets inside are encrypted.
CREATE TABLE app_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
