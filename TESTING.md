# Testing

## Images + Admin Flows
1) Upload (products scope) and confirm publicUrl:
```
curl -s -X POST \
  -H "X-Admin-Password: $ADMIN_PASSWORD" \
  -F "file=@/path/to/image.jpg" \
  "https://shellandbrush.pages.dev/api/admin/images/upload?scope=products&rid=test-products"
```
Expect `image.publicUrl` to begin with `https://shellandbrush.pages.dev/images/`.

2) Open the returned publicUrl in a browser; it should return 200 and render.
```
curl -I "https://shellandbrush.pages.dev/images/shellandbrush/products/2026/01/<uuid>.png"
```

3) Create a product using the returned URL:
```
curl -s -X POST \
  -H "X-Admin-Password: $ADMIN_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Test Item",
    "description":"Smoke test",
    "priceCents":1200,
    "category":"decor",
    "imageUrl":"<PUBLIC_URL_FROM_UPLOAD>"
  }' \
  "https://shellandbrush.pages.dev/api/admin/products"
```

4) Upload hero image and save home config in admin, then refresh `/` to confirm it renders.

5) Upload gallery image, save gallery in admin, then refresh `/gallery` to confirm it renders.

## Debug endpoints
- `/api/_debug/images-base`
- `/api/_debug/env-lite`
- `/api/_debug/tables`
- `/api/_debug/home-config`

## PowerShell checklist
```
$pw="REAL8CHAR"
$base="https://shellandbrush.pages.dev/images"

curl.exe -s "https://shellandbrush.pages.dev/api/_debug/images-base"

curl.exe -i "https://shellandbrush.pages.dev/api/admin/images/upload?rid=debug&scope=products" -H "x-admin-password: $pw" -F "file=@$env:TEMP\sb_test.png;type=image/png"

wrangler d1 execute DB_NAME --remote --command "UPDATE images SET public_url='$base/'||storage_key WHERE storage_key IS NOT NULL AND storage_key!='' AND (public_url IS NULL OR public_url='' OR public_url NOT LIKE 'https://%');"
```
