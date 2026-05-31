# Verification — 22 avatar-media

**Verdict:** accurate  ·  checked 58 claims, verified 56.
This doc is highly reliable: the four core files (uploader, image preprocessor, POST upload route, GET proxy route) and every supporting file were confirmed line-for-line, including digit-exact constants, status codes, enum defaults, blob-API shapes, and the two-consumer wiring. The only defects are a file-attribution conflation in the questionnaire citations (medium, doesn't affect a rebuild's behaviour) and one slightly-loose "fallback" wording (low).

## Inaccuracies
| severity | doc claim | code reality | file:line |
|---|---|---|---|
| medium | The `profile.image` question definition — `id: "profile.image"`, `prompt: "Profile photo"`, `helper: "A clear photo of your face works best."`, page `profile_photo` / title "Add a profile photo" / subtitle — is cited as "(questionnaire.ts:62-77)" alongside the schema/validator, and "Supporting files read" lists only `packages/types/src/questionnaire.ts` for questionnaire. | Those strings actually live in **`apps/web/lib/questionnaire.ts:63-77`** (the live questionnaire config), a different file from `packages/types/src/questionnaire.ts`. The doc conflates two distinct files under one "questionnaire.ts" label and never names the lib file. The schema (`ImageQuestion`, 128-134) and validator (360-366, 430-433) are correctly in the types package. | apps/web/lib/questionnaire.ts:63-77 vs packages/types/src/questionnaire.ts:128-134 |
| low | "`presentMemberDetail` reads `responses["profile.image"]` as a **fallback** source for the member card image." | Within `presentMemberDetail`, `profileImageUrl` is derived **solely** from `responses["profile.image"]` (typeof string ? : null) — there is no primary users-column read in this function for which the response would be a fallback. The "fallback" framing only holds at the broader system level (users column canonical for header/profile). | apps/web/lib/member-detail.ts:116-119, 33, 172 |

## Omissions
| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | The rate limiter has an additional production-relevant mechanic not mentioned: a periodic bucket sweep (`SWEEP_EVERY = 200`) that evicts expired buckets to cap Map growth. Doc describes the token-bucket refill math correctly but omits the sweep. | apps/web/lib/rate-limit.ts:13-24, 45 |
| low | `ImageQuestion`'s own doc comment states the stored value is "the public URL of the uploaded image (a Vercel Blob URL in production)", which contradicts the unit doc's (correct) point that consumers persist the *proxy* URL, not the raw blob URL. Not a doc error — just a stale source comment the doc could have flagged. | packages/types/src/questionnaire.ts:125-127 |

## Spot-confirmed
- Uploader is `h-40 w-40 rounded-full`; circle button + secondary text button both `inputRef.current?.click()`; hidden `<input type="file" accept="image/*" className="sr-only">` calls `handleFile(e.currentTarget.files?.[0] ?? undefined)` — avatar-upload.tsx:83,77,125,138-143.
- `cropResizeToSquare(file)` → wraps Blob into `new File([blob], "avatar.webp", { type: blob.type })`, appends under key `"image"`, `fetch("/api/uploads/avatar", { method: "POST", body })` — avatar-upload.tsx:44-53.
- Object-URL preview `setPreview(URL.createObjectURL(blob))` immediately after crop; `useEffect` cleanup keyed on `preview` revokes prior URL — avatar-upload.tsx:32-37,46.
- Success path parses `{ url: string }` and calls `onChange(data.url)` — avatar-upload.tsx:60-61.
- Remove button: shown only `displaySrc && !uploading`, top-right `X`, clears error + preview, `onChange(null)` — avatar-upload.tsx:107-120.
- `displaySrc = preview ?? value`; `<img className="h-full w-full object-cover">`; placeholder `Camera` + "Add photo" — avatar-upload.tsx:70,88-99.
- Input value reset in `finally` (`inputRef.current.value = ""`) — avatar-upload.tsx:66.
- `className` prop overrides diameter — avatar-upload.tsx:13-14,85.
- `cropResizeToSquare(file, { size = 512, quality = 0.85 }): Promise<Blob>`; `edge = Math.min(bitmap.width, bitmap.height)`, `sx/sy = (dim - edge)/2`; `ctx.drawImage(bitmap, sx, sy, edge, edge, 0, 0, size, size)`; `canvas.toBlob(resolve, "image/webp", quality)`; `bitmap.close?.()` in finally — image.ts:17-42.
- `loadBitmap`: fast path `createImageBitmap`; `<img>` + object-URL fallback with `{ close }` shim; rejects "Could not load image" — image.ts:44-66.
- POST route `runtime = "nodejs"`; `getAuthenticatedUser()` null → 401 `{ error: "Unauthorized" }` — uploads/avatar/route.ts:12,25-28.
- Dual rate limit: `avatar-upload:${user.id}` limit **20**; `avatar-upload-ip:${getClientIp(...)}` limit **40**; both 429 with `Retry-After` header; per-user body carries `retryAfterSeconds` — uploads/avatar/route.ts:30-48.
- `req.formData()` catch → 400 `{ error: "Invalid form data" }`; not File → 400 "Missing `image` file"; `!type.startsWith("image/")` → 415 "File must be image/*"; `size > MAX_BYTES` → 413 "Image too large" — uploads/avatar/route.ts:50-66.
- `MAX_BYTES = 5 * 1024 * 1024` — uploads/avatar/route.ts:10.
- Test/unconfigured branch (`isE2ETestMode() || !token`) echoes `avatarProxyUrl("avatars/${user.id}/test-avatar.webp")` — uploads/avatar/route.ts:68-76.
- Real upload: `ext = file.type === "image/png" ? "png" : "webp"`; `put("avatars/${user.id}/avatar.${ext}", file, { access: "private", addRandomSuffix: true, contentType: file.type, token })`; returns `{ url: avatarProxyUrl(blob.pathname) }` — uploads/avatar/route.ts:78-88.
- `put` failure → `console.error("avatar-upload error", err)` + 502 "Upload failed" — uploads/avatar/route.ts:89-92.
- `avatarProxyUrl` → `/api/avatar?pathname=${encodeURIComponent(pathname)}` — uploads/avatar/route.ts:96-98.
- GET route `runtime = "nodejs"`; null user → 401 "Unauthorized"; `findCampUserByAuthId` + `!isApproved(campUser, user.primaryEmail)` → 401 (approval, not ownership) — avatar/route.ts:7,24-34.
- Missing `pathname` → 400 "Missing pathname"; not `avatars/`-prefixed → 404 "Not found" — avatar/route.ts:36-43.
- Test/unconfigured (`isE2ETestMode() || !token`) → 404 "Not found" — avatar/route.ts:45-49.
- `get(pathname, { access: "private", token })`; `!result || result.statusCode !== 200` → 404; streams with `Content-Type: result.blob.contentType`, `Cache-Control: private, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`; catch → `console.error("avatar-proxy error", err)` + 404 — avatar/route.ts:51-71.
- `@vercel/blob` is `^2.4.0`; `get` returns a discriminated union on `statusCode` (200 has `stream`+`blob.contentType`, 304 has `stream: null`); `access: 'private'` and `put` opts (`access`/`addRandomSuffix`/`contentType`) are real API — apps/web/package.json:30; node_modules/@vercel/blob dist/index.d.ts:162-219,333-469.
- `isApproved(user, email) = isGodEmail(email) || approvalStatus === "approved"` — users.ts:231-236.
- `setProfileImage(userId, url)` routes to real/test backend; real → `setUserProfileImage`; test backend (431-433) → `testStore.setProfileImage` (mutates `profileImageUrl` + `updatedAt`) — users.ts:310-317,371-373,431-433; test-store.ts:220-228.
- `CampUser.profileImageUrl: string | null`; `toCampUser` maps `row.profileImageUrl ?? null` — users.ts:39-47,475.
- DB setter `setUserProfileImage(userId, profileImageUrl)` sets `{ profileImageUrl, updatedAt }` — burner-profile.ts:102-111.
- `users.profile_image_url` = `text("profile_image_url")` nullable, on identity row — schema.ts:229.
- Account deletion `sanitisedUserPatch` sets `profileImageUrl: null` — account.ts:29.
- `ImageQuestion`: `kind: z.literal("image")`, `required: z.boolean().default(false)` — packages/types/src/questionnaire.ts:128-134.
- Validator: `isMissing = raw === undefined || null || ""` → required? error : `value: undefined`; image case `typeof raw !== "string"` → "Expected an image URL" (no URL-format check) — packages/types/src/questionnaire.ts:360-366,430-433.
- question.tsx image renderer at 232-240: `<AvatarUpload value={typeof value === "string" ? value : null} onChange={(url) => onChange(url)} />`.
- edit-form.tsx: `<AvatarUpload value={imageUrl} onChange={setImageUrl} />` + hidden `<input name="profileImageUrl" value={imageUrl ?? ""}>`; "Save changes" submit — edit-form.tsx:31-32,57.
- profile/actions.ts:45 `setProfileImage(campUser.id, image.length > 0 ? image : null)`.
- onboarding/questionnaire/actions.ts:70-73 mirrors `cleaned["profile.image"]` onto users column via `setProfileImage` on progress + final.
- AvatarUpload has exactly two consumers (question.tsx, edit-form.tsx); no orphaned variants — verified via grep.
- aria-labels: "Add a profile photo" / "Change profile photo" (state-dependent), "Remove profile photo"; all buttons `type="button"`; both buttons `disabled={uploading}` — avatar-upload.tsx:76,79-81,109,115,124,126.
- Rate-limit refill: token bucket, `refillPerMs = limit/windowMs`, default `windowMs = 60_000`, `retryAfterSeconds = ceil((1 - tokens)/refillPerMs/1000)` — rate-limit.ts:43-62.
- `isE2ETestMode()` = `process.env.E2E_TEST_MODE === "1"` — test-mode.ts:11-13.

## Low-confidence / could-not-verify
- The doc's `<!-- low-confidence -->` note (line 116) that a hand-crafted non-square non-WebP image under 5 MB is stored uncropped is correct in mechanics (server does not re-crop; `ext` only special-cases png), but actual runtime blob behaviour against a real Vercel Blob store cannot be exercised here — verified only against the package type defs, not a live store.
- The 304/null-stream conditional-request handling is reachable per the package type union, but whether `get()` ever issues a conditional request in this no-caching server context is upstream-package behaviour not exercisable in this repo.
