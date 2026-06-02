# Avatar upload (shared component) — functional brief

- **Route(s):** n/a — shared component, not a route. Embedded in:
  - `/onboarding/questionnaire` at page `profile_photo` (OB Step 01, questionnaire question `profile.image`)
  - `/profile/edit` (profile-edit form, question 08 / `profileImageUrl` field)
- **Canonical board(s):**
  - `S11 Avatar upload` (board #20, 430×-, `design/.spec-extract/boards/20-s11-avatar-upload.txt`) — primary state machine
  - `OB Step 01 Profile photo` (board #39, 600×800, `design/.spec-extract/boards/39-ob-step-01-profile-photo.txt`) — onboarding embed context
  - `S10 Profile edit` (board #19, 430×-, `design/.spec-extract/boards/19-s10-profile-edit.txt`) — profile-edit embed context
- **Superseded / dropped:** none
- **Breakpoints:** mobile-first 430px (S11 canonical size); at 600px on OB Step 01 the component is centred within the wider OB shell — no layout changes to the component itself

---

## Purpose

`AvatarUpload` is a self-contained client component that lets a member pick and upload a profile photo directly from their device. It handles the full capture-to-persist loop in isolation: file picking, client-side centre-crop and WebP encode (512×512), upload POST, and state feedback. Its sole output is a proxy URL (`/api/avatar?pathname=…`) handed to the parent via `onChange`. The parent stores that URL (in form state for profile-edit, in questionnaire response for onboarding). The component is intentionally reused verbatim in both contexts; context-specific copy (prompt, skip affordances, navigation) lives in the host surface, not inside this component.

---

## Layout & modules

The component is a single vertical column (`gap: 14`, `align-items: center`) containing two zones:

### Avatar circle zone

A 120×120 circular hit target centred in the column. Clicking anywhere on the circle opens the native OS file picker. Visual treatment changes by state (see States). A hidden `<input type="file" accept="image/*">` behind it receives the file event.

### Action button zone

A `Button-Outline` beneath the circle whose label reflects the current state. It is a second, text-form trigger for the same file picker (empty / error states) or performs the remove action (not shown — see States matrix). All buttons carry `type="button"` so they never submit the host form.

### Helper text

A single line of muted body copy — `"A clear photo of your face works best."` — rendered below the action button in all states. (Board: last `T` node inside the outer `Content` frame; questionnaire.ts: `helper` field on `profile.image` question.)

### Error alert zone

Rendered only in the error state, between the avatar circle and the action button. Contains two lines of destructive-coloured text: a bold label (`"Upload failed"`) and a detail message (server-supplied `data.error` if present, else `"Upload failed"` / `"Could not load image"` for decode failure).

---

## Components used

| Name | Kind | Role | Key props / variants |
|---|---|---|---|
| `AvatarUpload` | **New shared component** | The complete upload widget described by this brief | `value: string \| null \| undefined`, `onChange: (url: string \| null) => void`, `className?: string` |
| `Button-Outline` | Reusable (existing) | Primary action trigger (upload / change photo); disabled + dimmed during upload | Label overrides: `"Upload a photo"` / `"Uploading…"` / `"Change photo"` |
| `cropResizeToSquare` | Internal utility (`image.ts`) | Client-side centre-crop → 512×512 → WebP blob | `size = 512`, `quality = 0.85` |
| Lucide `Camera` icon | Icon | Placeholder in empty / error circle | `$muted-foreground` fill |
| Lucide `Loader` icon | Icon | Spinner overlay during upload | `$foreground` fill |
| Lucide `X` icon | Icon | Remove button inside circle (populated state) | `$destructive-foreground` fill |

No `InputField`, `Card`, `CaptainLock`, or `TopChrome` is used by this component.

---

## States

Every state is shown as a distinct block on the S11 board. State labels in `JetBrains Mono / 11px / $muted-foreground` are dev/debug markers (not rendered in production).

### EMPTY

- Circle: 120×120, transparent fill, `$border` stroke, `Camera` icon + label `"Add photo"` centred inside.
- Action button: `Button-Outline` → `"Upload a photo"`. Tapping circle or button opens file picker.
- Error alert: hidden.
- Remove button: hidden.

### UPLOADING

- Circle: 120×120, `$muted` fill (the cropped image preview is visible beneath the overlay). A semi-transparent black overlay (`rgba(0,0,0,0.5)`) covers the full circle, with a `Loader` spinner centred on it.
- Action button: `Button-Outline` → `"Uploading…"`, `opacity: 0.5`, `disabled`.
- Error alert: hidden.
- Remove button: hidden (board: remove button is not shown during upload; live code confirms `disabled={uploading}` hides it).
- File input: disabled during upload.

### POPULATED

- Circle: 120×120 with `$primary` stroke. The uploaded/previewed image fills the circle (`object-cover`). A 28×28 circular `$destructive` button with a white `X` icon sits at the top-right of the circle (outside the circle edge, `position: absolute`). Tapping it clears the photo.
- Action button: `Button-Outline` → `"Change photo"`. Tapping opens file picker for replacement.
- Error alert: hidden.
- Display source priority: local object-URL preview wins over stored proxy URL (`displaySrc = preview ?? value`). During onboarding the stored proxy URL would 401 for a not-yet-approved member; the local preview avoids that.

### ERROR

- Circle: reverts to empty appearance — transparent fill, `$border` stroke, `Camera` icon + `"Add photo"`.
- Error alert: visible — `"Upload failed"` (bold, `$destructive`) + detail message (`$destructive`, normal weight).
- Action button: **`Button-Outline` → `"Upload a photo"`** (re-upload trigger, same as empty state). **Board omits this button on the error block; re-add it** — it is required so users can retry without reloading (see Divergences).
- Remove button: hidden (no image is displayed).

### DISABLED

Buttons carry `disabled={uploading}`. There is no separate full-disabled prop; the uploading state doubles as the in-progress disabled state. The host form may additionally wrap the component in a fieldset with `disabled` during server submission, which propagates natively.

### No gating states on the component itself

`AvatarUpload` is rank-agnostic; it has no `CaptainLock`. It renders identically for all authenticated users. Approval gating lives only on the avatar GET proxy route (server-enforced), not on the upload widget.

---

## User actions

| Action | Trigger | Result |
|---|---|---|
| Open file picker | Tap avatar circle OR `Button-Outline` (empty / error states) | Native OS image picker opens (`accept="image/*"`) |
| Select a file | File picker selection event | 1. `cropResizeToSquare(file)` runs client-side (centre-crop → 512×512 → WebP). 2. Local object-URL preview immediately shown (UPLOADING state). 3. `fetch POST /api/uploads/avatar` with FormData key `image`. 4. On success: `onChange(proxyUrl)` called; preview retained until navigation. 5. On failure: error state with message. |
| Re-select the same file | File picker re-fires (same file) | Input value is reset in `finally` so the `change` event re-fires; identical flow as first selection. |
| Tap remove (X) | `X` button in POPULATED circle | Clears error state, revokes and clears local preview, calls `onChange(null)`. Returns to EMPTY. |
| Tap "Change photo" | `Button-Outline` in POPULATED state | Opens file picker for replacement (same flow as initial selection; replaces preview + calls `onChange` with new URL). |

---

## Data & enums

| Field | Table / location | Type | Notes |
|---|---|---|---|
| `profile_image_url` | `users` | `text`, nullable | Canonical persisted value. Stores same-origin proxy URL `/api/avatar?pathname=…`, never the raw Vercel Blob URL. Existing column — **no schema change**. |
| `profile.image` (response key) | `burner_profiles.responses` (JSONB) | `string \| undefined` | Onboarding path only. The proxy URL string, written by `onboarding/questionnaire/actions.ts` and mirrored onto `users.profile_image_url` on every progress save. |
| Blob object path | Vercel Blob private store (not a DB table) | — | `avatars/<userId>/avatar.<ext>` with random suffix; `ext` ∈ `{webp, png}` (client always sends WebP; server also handles direct PNG POSTs). |

**No new schema additions** for this component. The `captain_promotion_requests` table (Decision 4) is unrelated.

### Upload route constants (informational)

| Constant | Value |
|---|---|
| Max upload size (server) | 5 MB |
| Per-user rate limit | 20 uploads / 60s |
| Per-IP rate limit | 40 uploads / 60s |
| Output dimensions (client) | 512 × 512 px |
| Output format (client) | WebP, quality 0.85 |
| Proxy cache header | `private, max-age=31536000, immutable` |

---

## Validation & edge cases

- **File picker filter only** — `accept="image/*"` is advisory; no client-side size or type pre-check before attempting encode. The server enforces: type must be `image/*` (415), size ≤ 5 MB (413), field key must be `image` as a `File` (400).
- **Client decode failure** — `cropResizeToSquare` rejects on undecodable input ("Could not load image") or canvas context unavailability ("Canvas 2D context unavailable" / "Failed to encode image"); surfaced in the error alert.
- **Centre-crop is forced** — no user-adjustable crop box. The centre `min(width, height)` square is always taken; aspect ratio is never preserved.
- **Server does not re-crop/re-encode** — the POST route stores the file as received, trusting client-side normalisation. Only content-type (`image/*`) and size (≤ 5 MB) are server-validated. A direct POST of a non-square, non-WebP file under 5 MB is stored uncropped with its own content-type. (Documented source gap from feature-set §Validation.)
- **Mid-onboarding proxy 401** — a not-yet-approved member mid-onboarding gets 401 on the GET proxy route (`isApproved` is false). The component deliberately shows the local object-URL preview instead; this breaks only on page refresh before approval. No special handling required in the component.
- **Approval gate on GET, not POST** — the upload POST route only requires authentication, not approval. A pending member mid-onboarding can still upload and receive the proxy URL.
- **Idempotent overwrite** — `addRandomSuffix: true` on every upload means each upload produces a new immutable pathname; old blob objects are orphaned (not explicitly cleaned up on overwrite or account deletion in current code — flag for future blob lifecycle work).
- **Account deletion** — `sanitisedUserPatch` sets `profileImageUrl: null` on anonymisation. The Vercel Blob object itself is not explicitly deleted (existing gap, not in scope for this component).
- **Empty string normalisation** — consumers store `image.length > 0 ? image : null`; empty string is treated as null in both profile-edit and onboarding actions.
- **Optional in questionnaire** — `profile.image` has `required: false`; undefined / null / empty string passes validation. When present, value must be a string (any string; no URL-format check).
- **Test / unconfigured mode** — under `E2E_TEST_MODE=1` or absent `BLOB_READ_WRITE_TOKEN`, POST echoes a deterministic `test-avatar.webp` proxy URL and skips blob storage; GET returns 404 (nothing to serve). First-class path, not dead code.
- **Re-select same file** — file input value reset in `finally` ensures `change` event fires again for the same file.

---

## Flows

### Onboarding (OB Step 01)

Entry: user navigates to `profile_photo` page of onboarding questionnaire.

1. Host page renders OB shell (header "Build your burner profile", Step 1 of 11 progress bar, page title "Add a profile photo", subtitle "Optional…").
2. `AvatarUpload` rendered inside `QuestionBlock`, centred. Initial value = existing `profile.image` response or null.
3. User taps circle → file picker → selects image → UPLOADING → on success: POPULATED; `onChange(proxyUrl)` writes proxy URL into questionnaire form state.
4. User can tap "Skip" (Button-Primary in footer) to skip without uploading — `required: false`, so skipping is always valid.
5. User can tap "Sign out" (Button-Outline in footer) to exit onboarding.
6. Progression: "Skip" or completion of this step advances to OB Step 02 (About you).

### Profile edit (`/profile/edit`)

Entry: authenticated member navigates to profile edit page.

1. Host page renders profile-edit form. `AvatarUpload` initialised with `value = user.profileImageUrl` (existing proxy URL or null).
2. User taps circle or "Upload a photo" → file picker → uploads → POPULATED; `onChange` stores proxy URL in form state (held in hidden input `name="profileImageUrl"`).
3. To remove: tap X → `onChange(null)` → EMPTY.
4. "Save changes" (host form submit) sends `profileImageUrl` (null or proxy URL) to `updateProfile` server action.
5. Exit: save success returns to `/profile` view; cancel returns without changes.

---

## Divergences from feature-set reference

| # | Divergence | Board signal | Feature-set signal | Resolution |
|---|---|---|---|---|
| 1 | **Error state missing re-upload button** | S11 ERROR block shows alert text but no Button-Outline below it | Feature-set §States: "text button reads 'Upload a photo'" (same as empty state) | **Re-add the Button-Outline `"Upload a photo"` to the error state.** Per surface-specific guidance: "Re-add the re-upload button to the error state (board omits it)." Necessary for retry without page reload. |
| 2 | **OB Step 01 shows only a bare `AvatarUpload` fragment, not the full S11 state machine** | OB Step 01 board renders a single EMPTY-like `AvatarUpload` block (no uploading/populated/error sub-frames shown) | Feature-set describes a unified component with all states | OB Step 01 is the embed context; S11 is the component state machine. The same `AvatarUpload` component is used in both. No divergence in behaviour. |
| 3 | **OB Step 01 uses `$accent` coloured link text `"Upload a photo"` rather than a Button-Outline** | OB Step 01: `T "Upload a photo" [Inter/14px/600/$accent]` — text element, not Button instance | S11: Button-Outline for all action triggers | S11 is the component canonical board. The OB Step 01 board is a sketch of the embed context; it likely shorthand-renders the button as a text link for compactness. Use Button-Outline in production, matching S11 and the component's own state machine. Flag as cosmetic shorthand on the OB board. |
| 4 | **Feature-set doc comment claims raw Vercel Blob URL is stored** | — | `ImageQuestion` doc-comment: "stored value is the public URL of the uploaded image (a Vercel Blob URL in production)" | Stale comment. Live code and schema confirm the stored value is always the gated proxy URL `/api/avatar?pathname=…`, never the raw blob URL. Treat proxy URL as canonical. |
| 5 | **Server does not re-crop or re-encode** | — | Feature-set §Features: implies normalised-file storage after client pre-processing | Server trusts client normalisation; no server-side decode/crop/re-encode. Documented gap. Not a UI divergence; surfaced as an edge case for future hardening consideration. |

---

## Open questions / build reconciliations

1. **Blob lifecycle on overwrite / deletion.** Each upload produces a new blob pathname (random suffix); the old blob is orphaned. Account deletion sets `profileImageUrl = null` but does not delete the blob object. A blob cleanup job or overwrite-without-suffix strategy should be considered before launch.
2. **OB Step 01 "Upload a photo" link style.** The OB board renders this as `$accent` text (`Inter/14px/600`). If the design decision is to match S11's Button-Outline exactly, fine. If a lighter text-link treatment is intentional for onboarding (reduced visual weight), it needs a deliberate decision. Current resolution: use Button-Outline per S11 canonical.
3. **Remove button position.** Board shows the 28×28 `$destructive` remove button positioned at the top-right of the 120×120 circle frame (`none` layout = absolute). Exact offset (overlapping the circle edge vs. inset) should be confirmed during component build — the board uses `{none}` layout which implies absolute positioning but does not specify pixel offsets.
4. **Proxy 401 during onboarding on page refresh.** If a not-yet-approved member uploads a photo, refreshes the page, and the questionnaire re-initialises with the stored proxy URL as `value`, the `<img>` will 401. Whether to show the broken image or fall back to empty-circle needs a decision. Current live code stores the proxy URL regardless; handling the 401 gracefully (e.g., `onError` fallback to empty) is a build-time call.
5. **`className` override for diameter.** The `className` prop allows overriding the circle size token (e.g., larger circle for a settings/profile page with more space). No non-120px embed is currently drawn. No action needed unless a future board introduces a variant size.
