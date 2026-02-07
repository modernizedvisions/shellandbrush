ALTER TABLE custom_orders ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE custom_orders ADD COLUMN archived_at TEXT;
