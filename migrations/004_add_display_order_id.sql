-- Create order counters table for yearly sequencing
CREATE TABLE IF NOT EXISTS order_counters (
  year INTEGER PRIMARY KEY,
  counter INTEGER NOT NULL
);

-- Add display_order_id column to orders if it doesn't exist
ALTER TABLE orders ADD COLUMN display_order_id TEXT;

-- Ensure uniqueness of display order IDs
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_display_order_id ON orders(display_order_id);

-- Optional cleanup of test data
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM order_counters;
