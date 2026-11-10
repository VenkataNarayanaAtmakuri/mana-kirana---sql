-- Shared PostgreSQL-backed request limits and the express-pg-simple session table.
-- Safe to apply to an existing database. Existing tables and session rows are preserved.
BEGIN;

CREATE TABLE IF NOT EXISTS user_sessions (
  sid varchar NOT NULL PRIMARY KEY,
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS user_sessions_expire_idx ON user_sessions(expire);

CREATE TABLE IF NOT EXISTS api_rate_limits (
  rate_key text PRIMARY KEY,
  hits integer NOT NULL CHECK (hits >= 0),
  reset_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS api_rate_limits_reset_at_idx ON api_rate_limits(reset_at);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_deducted boolean;
UPDATE orders
SET stock_deducted = (status IN ('pending','preparing','ready','collected'))
WHERE stock_deducted IS NULL;
ALTER TABLE orders ALTER COLUMN stock_deducted SET DEFAULT false;
ALTER TABLE orders ALTER COLUMN stock_deducted SET NOT NULL;

COMMIT;
