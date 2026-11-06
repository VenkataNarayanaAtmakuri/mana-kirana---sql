-- Six shop features: pickup PINs, offers, expiry dates, store hours, restock data, and CSV exports.
ALTER TABLE products ADD COLUMN IF NOT EXISTS expires_on date;
CREATE INDEX IF NOT EXISTS products_expiry_idx ON products(expires_on) WHERE active AND expires_on IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_collected_updated_idx ON orders(updated_at) WHERE status='collected';
CREATE INDEX IF NOT EXISTS order_items_product_idx ON order_items(product_id) WHERE product_id IS NOT NULL;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_pin text;
UPDATE orders
SET pickup_pin = lpad(floor(random() * 10000)::int::text, 4, '0')
WHERE pickup_pin IS NULL;
ALTER TABLE orders ALTER COLUMN pickup_pin SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='orders_pickup_pin_format_check') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_pickup_pin_format_check CHECK (pickup_pin ~ '^[0-9]{4}$');
  END IF;
END $$;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal numeric(12,2);
UPDATE orders SET subtotal=total WHERE subtotal IS NULL;
ALTER TABLE orders ALTER COLUMN subtotal SET DEFAULT 0;
ALTER TABLE orders ALTER COLUMN subtotal SET NOT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS offer_code text;

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
  CHECK(ends_at IS NULL OR ends_at > starts_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS offers_code_upper_unique ON offers(upper(code));

CREATE TABLE IF NOT EXISTS store_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK(id=1),
  hours jsonb NOT NULL DEFAULT '{"mon":{"open":"08:00","close":"21:00","closed":false},"tue":{"open":"08:00","close":"21:00","closed":false},"wed":{"open":"08:00","close":"21:00","closed":false},"thu":{"open":"08:00","close":"21:00","closed":false},"fri":{"open":"08:00","close":"21:00","closed":false},"sat":{"open":"08:00","close":"21:00","closed":false},"sun":{"open":"08:00","close":"21:00","closed":false}}'::jsonb,
  status_override text NOT NULL DEFAULT 'auto' CHECK(status_override IN ('auto','open','closed')),
  closed_message text NOT NULL DEFAULT 'The shop is closed right now.',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO store_settings(id) VALUES(1) ON CONFLICT(id) DO NOTHING;
