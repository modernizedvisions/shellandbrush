# Image Upload Audit (Admin Product Create)

## Scope
This report covers the admin "Create new product" image upload path (file picker -> blob preview -> upload -> stored URL -> product payload), plus the admin auth header strategy and server upload handler. It reflects the current code as of 2026-02-03.

## Key Files & Functions
- `src/pages/AdminPage.tsx`
  - `ShopImage` / `ManagedImage` state shape (image slot fields).
  - `addImages(...)` (creates blob previews + queues uploads).
  - `uploadManagedImage(...)` (calls `adminUploadImage`, updates state).
  - `handleCreateProduct(...)` (blocks save until uploads finish; builds payload).
- `src/components/admin/AdminShopTab.tsx`
  - Product create UI file input + drag/drop handlers.
  - Calls `onAddProductImages(...)` to kick off upload flow.
- `src/lib/api.ts`
  - `adminUploadImage(...)` (builds FormData, calls upload endpoint).
- `src/lib/adminAuth.ts`
  - `adminFetch(...)` (adds `x-admin-password` header from localStorage).
- `src/lib/db/adminProducts.ts`
  - `createAdminProduct(...)` -> `/api/admin/products`.
- `functions/api/admin/images/upload.ts`
  - Upload endpoint (requires admin auth; validates multipart/form-data; stores in R2; returns public URL).
- `functions/api/_lib/adminAuth.ts`
  - `requireAdmin(...)` (checks `x-admin-password` vs env `ADMIN_PASSWORD`).
- `functions/api/admin/products.ts`
  - Create product endpoint; rejects blob/data URLs; resolves image IDs/URLs.
- `functions/api/admin/products/[id].ts`
  - Update product endpoint; similar image URL validation.
- `functions/api/admin/debug-auth.ts`
  - Auth diagnostics (header presence/lengths).

## Image Slot State (Client)
Defined in `src/pages/AdminPage.tsx` as `ShopImage` / `ManagedImage`:
- `id: string`
- `url: string` (starts as blob URL; later becomes public URL)
- `file?: File`
- `previewUrl?: string` (blob URL)
- `uploading?: boolean`
- `uploadError?: string`
- `errorMessage?: string` (debug-only)
- `imageId?: string`
- `isPrimary: boolean`
- `isNew?: boolean`
- `needsMigration?: boolean`
- `sortOrder?: number`

The "hasError/hasFile/hasUrl/uploading/urlPrefix" snapshot the tester mentioned is produced by the post-reconcile log in `addImages(...)` (`src/pages/AdminPage.tsx`), which computes these booleans from `uploadError`, `file`, and `url`.

## Client Upload Flow (Step-by-Step)
### 1) File Picker / Drag-Drop
- Component: `src/components/admin/AdminShopTab.tsx`.
- Create product input:
  - Hidden file input `productImageFileInputRef`.
  - `onChange` collects `FileList` and calls `onAddProductImages(files, slotIndex?)`.
  - Drag/drop on image slots also calls `onAddProductImages(...)`.

### 2) Blob Preview Creation
- Handler: `addImages(...)` in `src/pages/AdminPage.tsx`.
- For each selected file:
  - `previewUrl = URL.createObjectURL(file)`.
  - New `ManagedImage` entry is created with:
    - `url = previewUrl` (blob: URL)
    - `previewUrl = previewUrl`
    - `file = file`
    - `uploading = true`
  - Slots are capped at 4 and a primary image is set if none exists.

### 3) Upload Request
- Upload loop: `addImages(...)` -> `uploadManagedImage(...)`.
- `uploadManagedImage(...)` calls `adminUploadImage(file, { scope: 'products', entityType: 'product' })`.
- `adminUploadImage(...)` (in `src/lib/api.ts`):
  - Builds `FormData`:
    - `file`, plus optional `entityType`, `entityId`, `kind`, `isPrimary`, `sortOrder`.
  - Uses `adminFetch(...)` which injects `x-admin-password` header.
  - Sends POST to: `/api/admin/images/upload?rid=<uuid>&scope=products` (plus `debug=1` if debug enabled).
  - Adds header: `X-Upload-Request-Id` (for correlation).
  - **Content-Type**: **not** manually set. The browser sets multipart boundaries for `FormData`.

### 4) Server Upload Handling
- Endpoint: `functions/api/admin/images/upload.ts`.
- Auth: `requireAdmin(...)` checks `x-admin-password` vs `env.ADMIN_PASSWORD`.
- Validates:
  - `content-type` includes `multipart/form-data`.
  - File type in `image/jpeg`, `image/png`, `image/webp`.
  - Size <= 8 MB.
- Writes to R2 bucket and responds with:
  - `image.id` and `image.publicUrl`.
- If debug enabled (`?debug=1` or `DEBUG_UPLOADS=1`), error responses include:
  - `adminHeaderPresent`
  - `receivedContentType`
  - `method`
  - `path`

### 5) Client State Update
- `uploadManagedImage(...)` updates the slot:
  - `url = result.url` (public URL)
  - `imageId = result.id`
  - `file = undefined`
  - `previewUrl = undefined`
  - `uploading = false`
- Blob URL is released: `URL.revokeObjectURL(previewUrl)`.

### 6) Product Create Payload
- `handleCreateProduct(...)` in `src/pages/AdminPage.tsx`:
  - Blocks save if:
    - `uploadingCount > 0`, or
    - `missingUrlCount > 0` (blob preview present but no final URL), or
    - `failedCount > 0` (`uploadError` set).
  - Rejects blob/data URLs via `isBlockedImageUrl(...)`.
  - Builds payload with `imageUrl`, `imageUrls`, `primaryImageId`, `imageIds`.
- API call:
  - `createAdminProduct(...)` in `src/lib/db/adminProducts.ts` -> `POST /api/admin/products`.
  - Uses `adminFetch(...)` -> `x-admin-password` header.
- Server:
  - `functions/api/admin/products.ts` validates and rejects blob/data URLs with 413.

## Admin Auth Strategy (Headers & Storage)
- Client stores admin password in localStorage key `admin_password`.
- `adminFetch(...)` in `src/lib/adminAuth.ts` injects header:
  - `x-admin-password: <stored password>`
- `requireAdmin(...)` (server) compares header to `env.ADMIN_PASSWORD` and returns 401 on mismatch.
- Auth debug route:
  - `/api/admin/debug-auth` (GET) -> echoes header presence/lengths.

### Centralized Fetch Wrapper
- Yes: `adminFetch(...)` is the centralized admin wrapper.
- Upload requests use this wrapper via `adminUploadImage(...)`.
- Product create/update also use this wrapper.

## Endpoint Inventory (Admin + Upload)
- **Upload**: `POST /api/admin/images/upload`
  - Headers: `x-admin-password` (required), `X-Upload-Request-Id` (client debug)
  - Body: `multipart/form-data` (FormData)
  - Auth failure: 401 JSON from `requireAdmin` or debug-enhanced response when `debug=1`
- **Product create**: `POST /api/admin/products`
  - Headers: `x-admin-password`, `Content-Type: application/json`
  - Body: JSON includes `imageUrl`, `imageUrls`, `primaryImageId`, `imageIds`
  - Rejects blob/data URLs (413)
- **Product update**: `PUT /api/admin/products/:id`
  - Same header/validation pattern as create
- **Admin auth debug**: `GET /api/admin/debug-auth`
  - Returns header/env diagnostic info
- **Image delete**: `DELETE /api/admin/images/:id`
  - Admin header required

## CORS / Origin Notes (www vs non-www)
- Upload handler sets `Access-Control-Allow-Origin: *` and handles `OPTIONS`.
- BUT `requireAdmin(...)` runs even for `OPTIONS`.
  - If requests are cross-origin (e.g., www vs non-www), the browser preflight will NOT include `x-admin-password`, which can cause 401 on preflight and block the upload.
- The upload URL is relative (`/api/admin/images/upload`), so on normal same-origin admin usage there is no CORS preflight.
- Public image URL base is derived from `PUBLIC_IMAGES_BASE_URL` -> `PUBLIC_SITE_URL` -> request origin; no explicit www normalization.

## Failure Representation (Client)
- `uploadError` string is the primary "hasError" signal.
- If an upload finishes without a final URL and without `uploadError`, `addImages(...)` sets:
  - `uploadError = 'Upload did not complete. Please retry or remove.'`
- In debug mode, `errorMessage` includes status, admin header presence, file metadata, and response snippet.

## FormData Content-Type Check
- Current behavior (`src/lib/api.ts`): `FormData` is used and no manual `Content-Type` header is set.
- This is correct for multipart uploads. Manually setting `Content-Type` would break the boundary in Safari/WebKit.
- Therefore, a boundary issue is unlikely unless the code was altered elsewhere.

## Debug Instrumentation (New)
Client (`src/lib/debugUploads.ts`):
- Debug enabled if `?debugUploads=1` OR `VITE_DEBUG_UPLOADS=true`.
- Upload debug logging is gated behind this flag.
- When upload fails:
  - `errorMessage` is populated with status, `adminHeaderPresent`, file metadata, and response snippet.

Server (`functions/api/admin/images/upload.ts`):
- Debug enabled if `?debug=1` OR `DEBUG_UPLOADS=1`.
- Error responses include:
  - `adminHeaderPresent`, `receivedContentType`, `method`, `path`.
- Auth failures return clear JSON with these debug fields when enabled.

## Repro Checklist & What to Capture
1. Open admin with debug enabled: append `?debugUploads=1` to the admin URL.
2. Attempt to upload an image and save a product.
3. Capture:
   - Browser name + version (Safari/Chrome), macOS version.
   - Failing image file name, size, MIME type.
   - Network tab: request URL, status code, response body.
   - Console debug logs (no secrets).

### Quick Interpretation Guide
- 401/403: admin header missing/blocked or auth mismatch.
- 413: file too large OR blob/data URLs rejected by product endpoint.
- 0 / canceled: network interruption or navigation/race condition.
- 415/400: Content-Type mismatch or multipart parsing failure.

## Most Likely Causes (Based on Code)
1. Missing admin auth header on upload request
   - Upload uses `adminFetch(...)`, which reads `localStorage.admin_password`.
   - If Safari/Chrome on macOS blocks or clears localStorage or if cross-origin preflight is triggered (www vs non-www), `x-admin-password` may be missing.
   - Evidence: `src/lib/adminAuth.ts` (header injection), `functions/api/_lib/adminAuth.ts` (strict header check).

2. Multipart/form-data boundary issue (less likely here)
   - Boundary issues are common Safari failures if `Content-Type` is manually set.
   - Evidence: `src/lib/api.ts` does not set `Content-Type` for FormData, so this is currently unlikely.

3. Upload completion race / stale blob URL
   - The UI blocks save if `uploadingCount`, `missingUrlCount`, or `failedCount` are non-zero.
   - If uploads fail without properly setting `uploadError`, a blob URL can remain (`urlPrefix: blob:`) and `missingUrlCount` can block or confuse save behavior.
   - Evidence: `addImages(...)` reconcile logic in `src/pages/AdminPage.tsx` and blob/data URL guards in `handleCreateProduct(...)`.
