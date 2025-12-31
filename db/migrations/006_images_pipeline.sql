-- Images pipeline tables and columns for Chesapeake-style storage.

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  storage_provider TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  public_url TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER,
  original_filename TEXT,
  entity_type TEXT,
  entity_id TEXT,
  kind TEXT,
  is_primary INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  upload_request_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_images_entity ON images(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_images_upload_request ON images(upload_request_id);

-- Products: add image id references.
ALTER TABLE products ADD COLUMN IF NOT EXISTS primary_image_id TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_ids_json TEXT;

-- Categories: add image id references.
ALTER TABLE categories ADD COLUMN IF NOT EXISTS hero_image_id TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_id TEXT;

-- Gallery images: add image id reference.
ALTER TABLE gallery_images ADD COLUMN IF NOT EXISTS image_id TEXT;

-- Site-wide config storage (home hero, etc.).
CREATE TABLE IF NOT EXISTS site_config (
  id TEXT PRIMARY KEY,
  config_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
