-- Pending uploads table for product image pipeline.

CREATE TABLE IF NOT EXISTS pending_uploads (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  object_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime TEXT,
  size_bytes INTEGER NOT NULL,
  token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  uploaded_at TEXT,
  confirmed_at TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_pending_uploads_scope_status_created_at
  ON pending_uploads(scope, status, created_at);
