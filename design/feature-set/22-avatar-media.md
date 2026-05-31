# 22 — Avatar upload & image pipeline

**Files covered:**
- `apps/web/components/profile/avatar-upload.tsx` — client React component: the large circular avatar uploader (file picker → client crop/resize → POST upload → URL state).
- `apps/web/lib/image.ts` — client-side canvas image preprocessing: centre-crop to square + downscale + WebP encode. No external dependency.
- `apps/web/app/api/uploads/avatar/route.ts` — server POST route handler: auth + rate-limit + validation, stores normalised image in a private Vercel Blob, returns a same-origin proxy URL (stubbed under E2E / unconfigured Blob).
- `apps/web/app/api/avatar/route.ts` — server GET route handler: the gated proxy that streams a private avatar blob to approved members only.

**Supporting files read (cited inline):** `apps/web/lib/auth.ts` (auth), `apps/web/lib/rate-limit.ts` (token bucket), `apps/web/lib/test-mode.ts` (E2E flag), `apps/web/lib/users.ts` (`findCampUserByAuthId`, `isApproved`, `setProfileImage`), `apps/web/lib/test-store.ts` (in-memory backend), `packages/db/src/burner-profile.ts` (`setUserProfileImage`), `packages/db/src/schema.ts` (`profile_image_url` column), `packages/db/src/account.ts` (delete sanitises image to null), `packages/types/src/questionnaire.ts` (`ImageQuestion` schema + validator). Consumers: `apps/web/components/questionnaire/question.tsx` (image field kind, 04/20), `apps/web/app/profile/edit/edit-form.tsx` + `apps/web/app/profile/actions.ts` (08), `apps/web/app/onboarding/questionnaire/actions.ts` (mirrors photo onto users column).

**Purpose:**
This unit is the complete profile-photo capture-and-serve pipeline. The client uploader lets a member pick an image; the image is centre-cropped to a square, downscaled to 512×512, and re-encoded as WebP entirely in the browser (canvas) so the server only ever receives an already-normalised file. That file is POSTed to `/api/uploads/avatar`, which (after auth + dual rate limiting + content validation) stores it in a **private** Vercel Blob and returns a **same-origin proxy URL** (`/api/avatar?pathname=…`) — never the raw blob URL. The `/api/avatar` GET route streams that private blob back, but only to a signed-in, approved (vetted) camp member. The returned proxy URL is the value persisted by consumers (onboarding image question 04/20 and profile-edit 08) into `users.profile_image_url`. Under `E2E_TEST_MODE=1` or when no Blob token is configured, the network is skipped and a deterministic proxy URL is echoed so the rest of the flow works in test/local dev.

## Features

### Avatar uploader UI (avatar-upload.tsx)
- Large circular tap-target (`h-40 w-40`, `rounded-full`) that opens the OS file picker on click (`inputRef.current?.click()`) — both the circle and a secondary text button trigger it (avatar-upload.tsx:75-87, 123-130, 138-144).
- Hidden native `<input type="file" accept="image/*">` (`className="sr-only"`); change handler calls `handleFile(e.currentTarget.files?.[0] ?? undefined)` (avatar-upload.tsx:138-144).
- On file selection, runs `cropResizeToSquare(file)` (client crop/resize/encode), wraps the resulting Blob into a `File("avatar.webp", { type: blob.type })`, appends it to FormData under key **`image`**, and `fetch("/api/uploads/avatar", { method: "POST", body })` (avatar-upload.tsx:44-53).
- Local **object-URL preview**: immediately after crop, `setPreview(URL.createObjectURL(blob))` shows the just-cropped image rather than the authed proxy (which 401s for a not-yet-approved member mid-onboarding) (avatar-upload.tsx:28-31, 45-46). The previous object URL is revoked via a `useEffect` cleanup keyed on `preview`, and on unmount (avatar-upload.tsx:32-37).
- On success: parses `{ url: string }` and calls `onChange(data.url)` to hand the proxy URL to the parent (avatar-upload.tsx:60-61).
- **Remove** affordance: a small circular destructive button (top-right, `X` icon) shown only when an image is displayed and not uploading; clears error, clears preview, and calls `onChange(null)` (avatar-upload.tsx:107-120).
- Display source priority: `displaySrc = preview ?? value` — local preview wins over the stored URL (avatar-upload.tsx:70).
- `displaySrc` renders an `<img className="object-cover">`; absence renders a `Camera` icon + "Add photo" placeholder inside the dashed circle (avatar-upload.tsx:88-99).
- Resets the file input value (`inputRef.current.value = ""`) in `finally` so re-selecting the same file re-fires `onChange` (avatar-upload.tsx:66).
- Accepts a `className` prop to override the diameter token (avatar-upload.tsx:13-14, 85).

### Client image preprocessing (image.ts)
- `cropResizeToSquare(file, { size = 512, quality = 0.85 })` → `Promise<Blob>` (image.ts:17-42).
- Loads the file via `loadBitmap`, computes the centre-crop square: `edge = Math.min(width, height)`, `sx = (width - edge)/2`, `sy = (height - edge)/2` (image.ts:23-25).
- Draws onto an off-screen `<canvas>` sized `size×size` (default 512×512) using `ctx.drawImage(bitmap, sx, sy, edge, edge, 0, 0, size, size)` (image.ts:27-32).
- Encodes via `canvas.toBlob(resolve, "image/webp", quality)` (image.ts:34-36) — **always requests `image/webp`** at quality 0.85.
- `loadBitmap`: fast path `createImageBitmap(file)`; fallback for unsupported environments builds an `<img>` from an object URL and shims `{ close }` to revoke it; rejects with "Could not load image" on decode error (image.ts:44-66).
- Cleanup: `bitmap.close?.()` in `finally` (image.ts:39-41).

### Upload route — POST /api/uploads/avatar (route.ts)
- `runtime = "nodejs"` (route.ts:12).
- Requires an authenticated user via `getAuthenticatedUser()` → 401 `{ error: "Unauthorized" }` otherwise (route.ts:25-28).
- **Dual rate limiting** (route.ts:30-48):
  - per-user key `avatar-upload:${user.id}`, limit **20** / default 60s window → 429 with `retryAfterSeconds` body + `Retry-After` header.
  - per-IP key `avatar-upload-ip:${getClientIp(req.headers)}`, limit **40** → 429 with `Retry-After` header (defence in depth; comment notes user.id is cheap to mint).
- Parses `req.formData()`; malformed → 400 `{ error: "Invalid form data" }` (route.ts:50-55).
- Extracts the `image` field; validation chain (route.ts:57-66):
  - not a `File` → 400 `{ error: "Missing \`image\` file" }`
  - `!file.type.startsWith("image/")` → 415 `{ error: "File must be image/*" }`
  - `file.size > MAX_BYTES` (5 MB) → 413 `{ error: "Image too large" }`
- **Test / unconfigured-store branch**: if `isE2ETestMode()` OR `!process.env.BLOB_READ_WRITE_TOKEN`, skip the network and return `{ url: avatarProxyUrl(`avatars/${user.id}/test-avatar.webp`) }` (route.ts:68-76).
- **Real upload**: `ext = file.type === "image/png" ? "png" : "webp"`; `put(`avatars/${user.id}/avatar.${ext}`, file, { access: "private", addRandomSuffix: true, contentType: file.type, token })` (`@vercel/blob` ^2.4.0). Returns `{ url: avatarProxyUrl(blob.pathname) }` — never the raw blob URL (route.ts:78-88).
- On `put` failure: logs `console.error("avatar-upload error", err)` → 502 `{ error: "Upload failed" }` (route.ts:89-92).
- `avatarProxyUrl(pathname)` → `/api/avatar?pathname=${encodeURIComponent(pathname)}` (route.ts:96-98).

### Avatar proxy route — GET /api/avatar (route.ts)
- `runtime = "nodejs"` (route.ts:7).
- Auth + approval gate (route.ts:24-34):
  - `getAuthenticatedUser()` null → 401 `"Unauthorized"`.
  - Loads `findCampUserByAuthId(user.id)`; if no row OR `!isApproved(campUser, user.primaryEmail)` → 401 `"Unauthorized"`. Gate is **approval, not ownership** — any approved member can view any member's avatar (header, profile pages, family tree, captain roster) (route.ts:9-22 doc).
- Reads `pathname` query param: missing → 400 `"Missing pathname"`; not starting with `avatars/` → 404 `"Not found"` (prefix scoping prevents reading arbitrary blobs) (route.ts:36-43).
- Test / unconfigured branch: `isE2ETestMode()` OR `!token` → 404 `"Not found"` (nothing to serve) (route.ts:45-49).
- `get(pathname, { access: "private", token })`; if `!result || result.statusCode !== 200` → 404 `"Not found"` (handles missing blob and 304/null-stream conditional variants) (route.ts:52-57).
- Streams `result.stream` with headers (route.ts:58-67):
  - `Content-Type: result.blob.contentType`
  - `Cache-Control: private, max-age=31536000, immutable`
  - `X-Content-Type-Options: nosniff`
- On `get` failure: logs `console.error("avatar-proxy error", err)` → 404 `"Not found"` (route.ts:68-71).

## User actions & interactions
- **Tap circle** or **tap text button** → open file picker (avatar-upload.tsx:77, 125).
- **Select an image file** → crop/resize/encode → preview shown immediately → upload → on success the parent receives the proxy URL (avatar-upload.tsx:39-68).
- **Tap remove (X)** → clears error + preview, `onChange(null)` (clears the photo) (avatar-upload.tsx:107-120).
- **Re-select the same file** → still fires (input value reset in `finally`) (avatar-upload.tsx:66).
- Buttons are `type="button"` so they never submit the host form (avatar-upload.tsx:76, 109, 124).
- In **profile-edit (08)**: the chosen URL is held in form state and rides to the server via a hidden input `name="profileImageUrl"`; "Save changes" submits `updateProfile` (edit-form.tsx:31-32, 56-58). In **onboarding image question (04/20)**: `AvatarUpload` is rendered for the `image` field kind, `onChange((url) => onChange(url))` writes to questionnaire response `profile.image` (question.tsx:232-240).
- aria-labels: "Add a profile photo" / "Change profile photo" (state-dependent), "Remove profile photo" (avatar-upload.tsx:79-81, 115).

## States & presentations
Global-states rows that apply here:
- **Empty** — no `displaySrc`: dashed-border circle, `Camera` icon + "Add photo"; text button reads "Upload a photo" (avatar-upload.tsx:84, 94-99, 129).
- **Loading / Submitting** — `uploading=true`: circle disabled (`disabled:opacity-60`), dark overlay `bg-black/40` + spinning `Loader2` over the image; text button reads "Uploading…"; remove button hidden during upload (avatar-upload.tsx:26, 78, 100-104, 107, 129).
- **Populated** — `displaySrc` set: solid border (when `value` present), image shown `object-cover`, remove button visible, text button reads "Change photo" (avatar-upload.tsx:84, 88-93, 107-120, 129).
- **Validation-error / failure** — `error` state set from a thrown error message; rendered as `role="alert"` destructive text below the control. Message is server `data.error` if present, else "Upload failed" / "Could not load image" (decode) (avatar-upload.tsx:27, 54-63, 132-136).
- **Disabled** — both buttons `disabled={uploading}` (avatar-upload.tsx:78, 126).
- **Success** — handled by `onChange(url)` propagating to the parent; no internal success banner.
- **Invite-gated / Onboarding-incomplete / Pending-approval** — relevant to the **proxy** (GET): a logged-out, no-row, pending, or rejected viewer gets 401, so the `<img>` simply fails to load (route.ts:24-34). During onboarding (member not yet approved) the uploader deliberately shows the **local object-URL preview** instead of the proxy URL, because the proxy would 401 for that member (avatar-upload.tsx:28-31).
- **Rejected** — `isApproved` is false (status `rejected`), so the proxy 401s; image unviewable.
- Note: the upload **POST** route only requires authentication (`getAuthenticatedUser`), NOT approval — a pending member mid-onboarding can still upload (route.ts:25-28). The approval gate lives only on the GET proxy.

## Enums, options & configurable values
- `CropResizeOptions.size` default **512** (output edge length, px) (image.ts:7-8, 19).
- `CropResizeOptions.quality` default **0.85** (WebP quality 0–1) (image.ts:9-10, 19).
- Encode MIME: **`image/webp`** (always requested by the client encoder) (image.ts:35).
- Output filename wrapped by uploader: **`avatar.webp`** (avatar-upload.tsx:48).
- File picker accept filter: **`image/*`** (avatar-upload.tsx:141).
- `MAX_BYTES = 5 * 1024 * 1024` (5 MB hard cap, server) (route.ts:10).
- Per-user upload rate limit: **20** / 60s; per-IP: **40** / 60s (default `windowMs = 60_000`) (route.ts:30, 41; rate-limit.ts:29, 44).
- Blob `put` options: `access: "private"`, `addRandomSuffix: true`, `contentType: file.type` (route.ts:80-85).
- Server stored blob path: `avatars/${user.id}/avatar.${ext}` where `ext` ∈ {`png`, `webp`} — `png` only when `file.type === "image/png"`, else `webp` (route.ts:79-80).
- Test/unconfigured echoed path: `avatars/${user.id}/test-avatar.webp` (route.ts:74).
- Proxy URL shape: `/api/avatar?pathname=<encodeURIComponent(pathname)>` (route.ts:97).
- Proxy cache header: `private, max-age=31536000, immutable`; `X-Content-Type-Options: nosniff` (route.ts:64-65).
- Env vars: `BLOB_READ_WRITE_TOKEN` (Blob store token), `E2E_TEST_MODE=1` (test bypass) (route.ts:68; test-mode.ts:12).
- HTTP status codes returned — POST: 401, 429, 400, 415, 413, 502, 200; GET: 401, 400, 404, 200 (route.ts files).
- `ImageQuestion` (the `image` field kind) schema/validator: `kind: "image"`, `required` default **false** ("profile photos are never mandatory") (packages/types/src/questionnaire.ts:128-134). The `profile.image` question **definition strings** live in the live config (apps/web/lib/questionnaire.ts:63-77): `id: "profile.image"`, `prompt: "Profile photo"`, `helper: "A clear photo of your face works best."`, `required: false`, on page `profile_photo` / title "Add a profile photo" / subtitle "Optional — helps the camp put a face to your name. You can skip and add it later from your profile."

## Data model touched
- **`users.profile_image_url`** (`text("profile_image_url")`, nullable) — the canonical persisted value: the same-origin proxy URL string (`/api/avatar?pathname=…`), NOT the raw blob URL. Lives on the identity row (not in `burner_profiles.responses`) so it's cheap to read for header/profile/family-tree (schema.ts:224-229).
- ⚠️ **Stale source comment**: the `ImageQuestion` doc-comment claims "the stored value is the public URL of the uploaded image (a Vercel Blob URL in production)" (packages/types/src/questionnaire.ts:125-127). This is misleading — consumers persist the gated **proxy URL** (`/api/avatar?pathname=…`), never the raw Vercel Blob URL (route.ts:86-88, 96-98).
- DB setter: `setUserProfileImage(userId, profileImageUrl)` updates `users.profile_image_url` + `updatedAt` (burner-profile.ts:102-111). Exposed app-side as `setProfileImage(userId, url)` routed to real or test backend (users.ts:310-317, 371-373, 431-433).
- Test backend: `testStore.setProfileImage(userId, url)` mutates the in-memory user's `profileImageUrl` + `updatedAt` (test-store.ts:220-228); `CampUser.profileImageUrl` shape (users.ts:39-47, 462-480).
- **Questionnaire response** `profile.image` (key in `burner_profiles.responses` JSONB) — stores the proxy URL string when set via onboarding; `presentMemberDetail` reads `responses["profile.image"]` as a fallback source for the member card image (member-detail.ts:116-119). Note onboarding `actions.ts` mirrors `cleaned["profile.image"]` onto `users.profile_image_url` via `setProfileImage` on every progress + final save (onboarding/questionnaire/actions.ts:69-73).
- Blob object key path: `avatars/<userId>/avatar.<ext>` with a random suffix (Vercel Blob private store; not a DB table) (route.ts:80).
- **Account deletion**: `sanitisedUserPatch` sets `profileImageUrl: null` when anonymising a deleted account (account.ts:29). (The blob object itself is not explicitly deleted in this patch.)

## Validation, edge cases & business rules
- **Client decode failure** → `cropResizeToSquare` rejects ("Could not load image" or "Canvas 2D context unavailable" / "Failed to encode image"); surfaced as the `error` alert (image.ts:31, 37, 55; avatar-upload.tsx:62-63).
- **Centre-crop is forced square** regardless of aspect ratio; no user-adjustable crop box — the centre `min(w,h)` square is always taken (image.ts:23-32).
- **Server re-validates independently** of the client: type must be `image/*`, size ≤ 5 MB, field key must be `image` and an actual `File`. The 5 MB cap "just guards against someone POSTing a raw file directly" since the client already downscales (route.ts:7-9, 57-66).
- **Server does NOT re-crop/re-encode** — it stores whatever file it receives; the comment treats `png` specially only for the extension, otherwise assumes WebP. A direct POST of a non-WebP image is stored as-is with its own contentType (route.ts:79-85). <!-- low-confidence: server trusts client normalisation; a hand-crafted large non-square image under 5MB is stored uncropped -->
- **Private-by-default security model**: raw blob URLs are never handed to the client; only the gated `/api/avatar` proxy URL is persisted/rendered (route.ts:18-22 doc, 86-88).
- **Proxy prefix scoping**: `pathname` must start with `avatars/` or the proxy 404s — prevents using the proxy to read other (non-avatar) blobs in the store (avatar.../route.ts:40-43).
- **Proxy approval gate** is `isApproved` (god-email OR `approvalStatus === "approved"`), matching the app-wide "can use the app" gate — NOT ownership; pending/rejected/no-row → 401 (avatar.../route.ts:29-34; users.ts:231-236).
- **Mid-onboarding preview hack**: because a not-yet-approved member would 401 on the proxy, the uploader shows the local object-URL preview until the page refreshes (avatar-upload.tsx:28-31).
- **Empty/optional image in questionnaire**: validator treats `undefined | null | ""` as missing; since `image` is `required: false`, missing passes and stores `undefined` (omitted from responses) (questionnaire.ts:360-366). When present, the value must be a string (any string accepted — no URL-format check) else "Expected an image URL" (questionnaire.ts:430-433).
- **Persisted URL normalisation**: consumers store `image.length > 0 ? image : null` — empty string is normalised to `null` in both profile-edit and onboarding (profile/actions.ts:45; onboarding/.../actions.ts:72).
- **Idempotent overwrite**: `addRandomSuffix: true` means each upload produces a new immutable pathname; the `immutable` cache header is safe because the URL changes per upload (route.ts:62-63 doc, 82).
- **No client-side size/type pre-check** beyond `accept="image/*"`; the encoder will attempt any decodable image and the server enforces the hard limits.
- **Rate-limit refill** is token-bucket (continuous refill `limit/windowMs` per ms), `retryAfterSeconds = ceil((1 - tokens)/refillPerMs/1000)` (rate-limit.ts:43-62).

## Sub-components / variants
- **`AvatarUpload`** (avatar-upload.tsx) — the single client component. Props: `value: string | null | undefined`, `onChange: (url: string | null) => void`, `className?: string`. Used in exactly two places: the questionnaire `image` field renderer (question.tsx:232-240) and profile-edit (edit-form.tsx:31). No dead/orphaned variants.
- **`cropResizeToSquare` / `loadBitmap`** (image.ts) — preprocessing helpers; `loadBitmap` carries a non-`createImageBitmap` fallback branch (older/edge browsers) that is otherwise unexercised on the fast path.
- **POST handler** (`uploads/avatar/route.ts`) — validators inline (auth, dual rate-limit, formData parse, file type/size); `avatarProxyUrl` local helper.
- **GET handler** (`avatar/route.ts`) — validators inline (auth, approval, pathname presence, `avatars/` prefix scope, test/unconfigured short-circuit, `statusCode === 200` check).
- **Test/stub variant**: both routes short-circuit under `E2E_TEST_MODE=1` or absent `BLOB_READ_WRITE_TOKEN` — POST echoes a deterministic `test-avatar.webp` proxy URL; GET returns 404 (no store to read). This is a first-class behaviour path, not dead code (uploads/avatar/route.ts:68-76; avatar/route.ts:45-49).
