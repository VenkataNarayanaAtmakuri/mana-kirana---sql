ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS store_name text NOT NULL DEFAULT 'Venkata Kusuma Haranth General Stores',
  ADD COLUMN IF NOT EXISTS contact_phone text NOT NULL DEFAULT '+917032946299',
  ADD COLUMN IF NOT EXISTS contact_address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS maps_url text NOT NULL DEFAULT 'https://maps.app.goo.gl/AaYVR9dbwqkwm7H29';
