-- Fresh, standalone PostgreSQL schema for Mana Kirana. Apply only to a NEW database.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL DEFAULT '',
  phone text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','shopkeeper')),
  phone_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS categories_name_ci_unique ON categories(lower(name)) WHERE active;
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category_id uuid NOT NULL REFERENCES categories(id),
  name text NOT NULL, local text NOT NULL DEFAULT '', price numeric(12,2) NOT NULL CHECK(price > 0),
  unit text NOT NULL, step numeric(12,3) NOT NULL DEFAULT 1 CHECK(step > 0),
  stock numeric(12,3) NOT NULL DEFAULT 0 CHECK(stock >= 0), emoji text NOT NULL DEFAULT '🛍️',
  tint text NOT NULL DEFAULT 'new', note text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS products_name_ci_unique ON products(lower(name)) WHERE active;
CREATE INDEX IF NOT EXISTS products_active_category_idx ON products(category_id) WHERE active;
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  customer_id uuid NOT NULL REFERENCES profiles(id), customer_name text NOT NULL, customer_phone text NOT NULL,
  pickup_phone text,
  channel text NOT NULL CHECK(channel IN ('online','entrance')),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','preparing','ready','collected','rejected')),
  payment_method text NOT NULL CHECK(payment_method IN ('pickup','upi_demo')),
  total numeric(12,2) NOT NULL CHECK(total > 200), estimated_ready_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_customer_created_idx ON orders(customer_id,created_at DESC);
CREATE INDEX IF NOT EXISTS orders_queue_idx ON orders(estimated_ready_at) WHERE status IN ('pending','preparing');
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL, item_name text NOT NULL, emoji text NOT NULL DEFAULT '🛍️',
  quantity numeric(12,3) NOT NULL CHECK(quantity > 0), unit text NOT NULL,
  price numeric(12,2) CHECK(price IS NULL OR price >= 0), line_total numeric(12,2) CHECK(line_total IS NULL OR line_total >= 0),
  custom_request boolean NOT NULL DEFAULT false, price_confirmed boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);
CREATE TABLE IF NOT EXISTS customer_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE, body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz
);
CREATE INDEX IF NOT EXISTS customer_messages_user_created_idx ON customer_messages(customer_id,created_at DESC);
-- Security: all access is through the Express API. Do not expose this DB directly to browsers.
