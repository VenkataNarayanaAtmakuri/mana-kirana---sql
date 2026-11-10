-- Run this after the new API is deployed; new orders now explicitly set stock_deducted=false.
BEGIN;
ALTER TABLE orders ALTER COLUMN stock_deducted SET DEFAULT false;
COMMIT;
