# Image Upload Mac Diagnostics (Add-on)

## What We Now Capture (Debug Mode)
**Client (Upload Diagnostics panel)**
- Origin and host
- `isWwwHost` determination
- User agent + platform
- `isSecureContext`
- localStorage availability
- admin password presence + length (no value)
- `/api/admin/debug-auth` result fields:
  - `envHasAdminPassword`
  - `headerHasPassword`
  - `matches`
  - `envAdminPasswordLength`
  - `headerPasswordLength`
- Latest admin request snapshot (debug-only):
  - path, method, `adminHeaderAttached`, origin, host
- Upload attempt list (debug-only):
  - `requestId`
  - timestamp
  - file name/size/MIME
  - request path
  - `adminHeaderAttached`
  - response status + truncated response text
  - error name/message (truncated)
  - preflight probe status (OPTIONS)

**Server (upload handler)**
When `debug=1` or `DEBUG_UPLOADS=1`, all JSON responses include:
- `debug: true`
- `host`
- `origin`
- `refererHost`
- `method`
- `isOptions`
- `adminHeaderPresent`
- `contentType`
- `contentLength`
- `requestId`

## How To Reproduce + Capture Evidence (Mac)
1. Open the admin page with debug enabled: add `?debugUploads=1` to the admin URL.
2. Scroll to the bottom of the admin page and open **Upload Diagnostics (Debug)**.
3. Click **Copy Diagnostics** (captures environment + auth snapshot + upload attempts so far).
4. Perform the image upload that fails.
5. Copy diagnostics again after the failure.
6. In DevTools Network tab:
   - If an OPTIONS request appears, click it and record status + response body.
   - Click the POST upload request and record status + response body.

## Decision Tree (Code/Environment Only)
1. **Host differs (www vs non-www) AND `adminPasswordPresent=false`**
   - Likely origin storage partitioning: admin password stored on one origin only.
   - Confirm via diagnostics panel: host mismatch + password length 0.

2. **OPTIONS probe returns 401/403**
   - Auth-before-preflight problem on upload endpoint.
   - Confirm in upload attempt list: `preflight.status=401` and `adminHeaderAttached=true` on POST.

3. **POST returns 401 + `adminHeaderAttached=false`**
   - Admin header injection/storage read failed on Mac.
   - Confirm: diagnostics panel shows localStorage available but password length 0 OR localStorage unavailable.

4. **POST returns 401 + `adminHeaderAttached=true`**
   - Password mismatch (normalization/whitespace) rather than storage failure.
   - Confirm: `/api/admin/debug-auth` shows `headerHasPassword=true` but `matches=false`.

5. **POST returns 415/400 + file.type==""**
   - MIME detection brittleness on Mac.
   - Confirm: upload attempt shows empty `fileType` and server `contentType` still multipart.

6. **Thrown `AbortError`**
   - Request canceled by browser; correlate with navigation or state change.
   - Confirm: upload attempt shows `errorName=AbortError` and no server response.

## Suspected Root Causes Ranked (What Would Confirm Each)
1. **Admin header missing on Mac**
   - Confirmed by: `adminHeaderAttached=false` (panel + attempt), 401 response.

2. **Preflight blocked by auth**
   - Confirmed by: OPTIONS status 401/403 while POST shows `adminHeaderAttached=true`.

3. **MIME detection mismatch on Mac (empty `file.type`)**
   - Confirmed by: fileType empty in attempt + server 415/400.

4. **Password mismatch (normalization/whitespace)**
   - Confirmed by: debug-auth `matches=false` with header present.

5. **Request abort/cancel**
   - Confirmed by: `AbortError` in upload attempt with no server response.

## Notes
- Debug mode is enabled by `?debugUploads=1` or `VITE_DEBUG_UPLOADS=true`.
- No secrets are logged or stored; only booleans, lengths, and truncated server responses are captured.
