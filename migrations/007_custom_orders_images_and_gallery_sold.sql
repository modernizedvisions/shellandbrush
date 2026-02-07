ALTER TABLE custom_orders ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE custom_orders ADD COLUMN IF NOT EXISTS image_key TEXT;
ALTER TABLE custom_orders ADD COLUMN IF NOT EXISTS image_updated_at TEXT;

CREATE TABLE IF NOT EXISTS gallery_items (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  status TEXT NOT NULL,
  image_url TEXT,
  title TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sold_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gallery_items_source ON gallery_items(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_gallery_items_status ON gallery_items(status);
CREATE INDEX IF NOT EXISTS idx_gallery_items_created_at ON gallery_items(created_at);
