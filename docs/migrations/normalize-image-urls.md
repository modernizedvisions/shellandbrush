# D1 URL Normalization (Optional)

These SQL snippets update legacy `shellandbrush.pages.dev` image URLs to the custom domain. Run manually in D1 if you want to rewrite stored rows. Runtime normalization already handles this at read time.

## Preview: Find legacy URLs

```sql
SELECT id, config_json
FROM site_config
WHERE config_json LIKE '%shellandbrush.pages.dev%';
```

```sql
SELECT id, image_url
FROM products
WHERE image_url LIKE '%shellandbrush.pages.dev%';
```

```sql
SELECT id, image_url
FROM gallery_images
WHERE image_url LIKE '%shellandbrush.pages.dev%';
```

```sql
SELECT id, hero_image_url, image_url
FROM categories
WHERE hero_image_url LIKE '%shellandbrush.pages.dev%' OR image_url LIKE '%shellandbrush.pages.dev%';
```

## Update site_config JSON (home)

```sql
UPDATE site_config
SET config_json = REPLACE(
  REPLACE(config_json, 'https://shellandbrush.pages.dev/images', 'https://shellandbrush.com/images'),
  'http://shellandbrush.pages.dev/images', 'https://shellandbrush.com/images'
)
WHERE id = 'home' AND config_json LIKE '%shellandbrush.pages.dev%';
```

## Update plain columns (only if present)

```sql
UPDATE products
SET image_url = REPLACE(
  REPLACE(image_url, 'https://shellandbrush.pages.dev/images', 'https://shellandbrush.com/images'),
  'http://shellandbrush.pages.dev/images', 'https://shellandbrush.com/images'
)
WHERE image_url LIKE '%shellandbrush.pages.dev%';
```

```sql
UPDATE gallery_images
SET image_url = REPLACE(
  REPLACE(image_url, 'https://shellandbrush.pages.dev/images', 'https://shellandbrush.com/images'),
  'http://shellandbrush.pages.dev/images', 'https://shellandbrush.com/images'
)
WHERE image_url LIKE '%shellandbrush.pages.dev%';
```

```sql
UPDATE categories
SET image_url = REPLACE(
  REPLACE(image_url, 'https://shellandbrush.pages.dev/images', 'https://shellandbrush.com/images'),
  'http://shellandbrush.pages.dev/images', 'https://shellandbrush.com/images'
)
WHERE image_url LIKE '%shellandbrush.pages.dev%';
```

```sql
UPDATE categories
SET hero_image_url = REPLACE(
  REPLACE(hero_image_url, 'https://shellandbrush.pages.dev/images', 'https://shellandbrush.com/images'),
  'http://shellandbrush.pages.dev/images', 'https://shellandbrush.com/images'
)
WHERE hero_image_url LIKE '%shellandbrush.pages.dev%';
```

## Verify no legacy URLs remain

```sql
SELECT 'products' AS table_name, COUNT(*) AS legacy_count
FROM products
WHERE image_url LIKE '%shellandbrush.pages.dev%'
UNION ALL
SELECT 'gallery_images', COUNT(*)
FROM gallery_images
WHERE image_url LIKE '%shellandbrush.pages.dev%'
UNION ALL
SELECT 'categories', COUNT(*)
FROM categories
WHERE image_url LIKE '%shellandbrush.pages.dev%'
   OR hero_image_url LIKE '%shellandbrush.pages.dev%'
UNION ALL
SELECT 'site_config', COUNT(*)
FROM site_config
WHERE config_json LIKE '%shellandbrush.pages.dev%';
```
