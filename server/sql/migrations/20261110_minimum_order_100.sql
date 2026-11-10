-- Allow orders with a total of ₹100 or more.
BEGIN;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_total_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_total_check CHECK (total >= 100);

COMMIT;
