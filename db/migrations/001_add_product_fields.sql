-- Adds extended product fields for admin management, inventory, and future Stripe wiring.
-- Columns are added defensively; rerunning may error if columns already exist.
ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity_available INTEGER DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_one_off INTEGER DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_sold INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stripe_product_id TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_urls_json TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS collection TEXT;
