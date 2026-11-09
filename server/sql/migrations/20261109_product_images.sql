CREATE TABLE IF NOT EXISTS product_images (
  product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  image_data bytea NOT NULL CHECK (octet_length(image_data) <= 2097152),
  updated_at timestamptz NOT NULL DEFAULT now()
);
