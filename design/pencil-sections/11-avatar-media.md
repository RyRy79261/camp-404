### 11. Avatar upload control
**Purpose:** A circular profile-photo uploader that crops/resizes an image in-browser, uploads it, and hands a gated proxy URL back to the parent form.
**Layout & elements:** Mobile single column. Large circular tap-target; when empty shows a dashed circle with a Camera icon + "Add photo" placeholder; when populated shows the image. A small destructive remove button (X icon, top-right) appears over the image. Below the circle, a secondary text button reading "Upload a photo" / "Change photo" / "Uploading…" by state. A hidden native file input (`accept="image/*"`). An error line (`role="alert"`) below the control when upload/decode fails.
**Every action (preserve all):**
- Tap circle OR tap text button → opens OS file picker (disabled while uploading).
- Select image file → centre-crop to square, downscale to 512×512, encode WebP; show local object-URL preview immediately, then upload; on success call `onChange(url)` with the proxy URL.
- Tap remove (X) → clear error + preview, `onChange(null)`; shown only when an image is displayed and not uploading.
- Re-select the same file → still re-fires (input value reset after each attempt).
- All buttons are `type="button"` so they never submit the host form.
**States to design:**
- Empty: no image → dashed circle, Camera icon + "Add photo"; button "Upload a photo".
- Loading/Submitting: dark overlay + spinning loader over image; button "Uploading…"; circle disabled; remove hidden.
- Populated: image shown (cover); solid border when a stored value exists; button "Change photo"; remove visible.
- Validation-error: destructive alert text — server error message if present, else "Upload failed" or "Could not load image".
- Disabled: both buttons disabled while uploading.
- Success: no internal banner; URL propagates to parent.
- Pending/Rejected/onboarding (viewer side): gated proxy returns 401 so the `<img>` fails to load; mid-onboarding the uploader deliberately shows the local preview instead.
**Options & exact values:** Output size 512×512 (default); WebP quality 0.85; encode MIME `image/webp`; wrapped filename `avatar.webp`; accept filter `image/*`; server max 5 MB; rate limits 20/60s per-user, 40/60s per-IP; image question `required: false`; prompt "Profile photo", helper "A clear photo of your face works best.", page title "Add a profile photo", subtitle "Optional — helps the camp put a face to your name. You can skip and add it later from your profile."
**Validation & rules:**
- Client decode failure → "Could not load image" alert.
- Server re-validates: must be `image/*` (else 415), ≤ 5 MB (else 413), field key `image` and a real File (else 400/415).
- Centre-crop is forced square; no adjustable crop box.
- Persisted value is the same-origin proxy URL (`/api/avatar?pathname=…`), never the raw blob URL; empty string normalised to null.
- Image is never mandatory; missing passes.
**Do-not-drop:** Private-by-default capture-and-serve: in-browser square crop/resize/WebP, upload returns only a gated proxy URL viewable solely by approved members, and a working mid-onboarding local preview. Carry over the ⚠️ stale doc-comment flag claiming the stored value is a public Vercel Blob URL — it is actually the gated proxy URL.
