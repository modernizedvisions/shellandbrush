-- Image variants for upload-time WebP sizes.
ALTER TABLE images ADD COLUMN IF NOT EXISTS variant TEXT;
ALTER TABLE images ADD COLUMN IF NOT EXISTS source_image_id TEXT;

CREATE INDEX IF NOT EXISTS idx_images_source_variant ON images(source_image_id, variant);
