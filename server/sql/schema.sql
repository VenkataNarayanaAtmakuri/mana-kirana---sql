-- Fresh, standalone PostgreSQL schema for Mana Kirana. Apply only to a NEW database.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL DEFAULT '',
  phone text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  recovery_code_hash text,
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
  tint text NOT NULL DEFAULT 'new', note text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true, expires_on date,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS products_name_ci_unique ON products(lower(name)) WHERE active;
CREATE INDEX IF NOT EXISTS products_active_category_idx ON products(category_id) WHERE active;
CREATE INDEX IF NOT EXISTS products_expiry_idx ON products(expires_on) WHERE active AND expires_on IS NOT NULL;
CREATE TABLE IF NOT EXISTS product_images (
  product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  image_data bytea NOT NULL CHECK (octet_length(image_data) <= 2097152),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  code text NOT NULL UNIQUE,
  discount_percent numeric(5,2) NOT NULL CHECK(discount_percent >= 1 AND discount_percent <= 80),
  minimum_order numeric(12,2) NOT NULL CHECK(minimum_order > 200),
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS offers_code_upper_unique ON offers(upper(code));
CREATE TABLE IF NOT EXISTS store_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK(id=1),
  hours jsonb NOT NULL DEFAULT '{"mon":{"open":"08:00","close":"21:00","closed":false},"tue":{"open":"08:00","close":"21:00","closed":false},"wed":{"open":"08:00","close":"21:00","closed":false},"thu":{"open":"08:00","close":"21:00","closed":false},"fri":{"open":"08:00","close":"21:00","closed":false},"sat":{"open":"08:00","close":"21:00","closed":false},"sun":{"open":"08:00","close":"21:00","closed":false}}'::jsonb,
  status_override text NOT NULL DEFAULT 'auto' CHECK(status_override IN ('auto','open','closed')),
  closed_message text NOT NULL DEFAULT 'The shop is closed right now.',
  store_name text NOT NULL DEFAULT 'Venkata Kusuma Haranth General Stores',
  contact_phone text NOT NULL DEFAULT '+917032946299',
  contact_address text NOT NULL DEFAULT '',
  maps_url text NOT NULL DEFAULT 'https://maps.app.goo.gl/AaYVR9dbwqkwm7H29',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO store_settings(id) VALUES(1) ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  customer_id uuid NOT NULL REFERENCES profiles(id), customer_name text NOT NULL, customer_phone text NOT NULL,
  pickup_phone text, pickup_pin text NOT NULL CHECK (pickup_pin ~ '^[0-9]{4}$'),
  channel text NOT NULL CHECK(channel IN ('online','entrance')),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','preparing','ready','collected','rejected')),
  payment_method text NOT NULL CHECK(payment_method IN ('pickup','upi_demo')),
  subtotal numeric(12,2) NOT NULL DEFAULT 0, discount_amount numeric(12,2) NOT NULL DEFAULT 0, offer_code text,
  total numeric(12,2) NOT NULL CHECK(total >= 100), estimated_ready_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_customer_created_idx ON orders(customer_id,created_at DESC);
CREATE INDEX IF NOT EXISTS orders_queue_idx ON orders(estimated_ready_at) WHERE status IN ('pending','preparing');
CREATE INDEX IF NOT EXISTS orders_collected_updated_idx ON orders(updated_at) WHERE status='collected';
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL, item_name text NOT NULL, emoji text NOT NULL DEFAULT '🛍️',
  quantity numeric(12,3) NOT NULL CHECK(quantity > 0), unit text NOT NULL,
  price numeric(12,2) CHECK(price IS NULL OR price >= 0), line_total numeric(12,2) CHECK(line_total IS NULL OR line_total >= 0),
  custom_request boolean NOT NULL DEFAULT false, price_confirmed boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_product_idx ON order_items(product_id) WHERE product_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS customer_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE, body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz
);
CREATE INDEX IF NOT EXISTS customer_messages_user_created_idx ON customer_messages(customer_id,created_at DESC);
-- Security: all access is through the Express API. Do not expose this DB directly to browsers.
