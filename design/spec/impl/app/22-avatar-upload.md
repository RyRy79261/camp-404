# 22-avatar-upload — app integration plan

- **Route(s):** n/a — embedded (profile-edit + onboarding step 1) · MOUNTED/EMBEDDED (no own route)
- **Mounted in:**
  - `apps/web/app/profile/edit/edit-form.tsx` — consumed by `ProfileEditForm` which is rendered by the `ProfileEditPage` server component at `apps/web/app/profile/edit/page.tsx`
  - `apps/web/components/questionnaire/question.tsx` — consumed inside `FieldInput` (`kind: "image"` branch, line 234–239), which is composed by `QuestionField`, which is composed by `QuestionnaireWizard` (`apps/web/components/questionnaire/wizard.tsx`), which is mounted by the onboarding questionnaire page at `apps/web/app/onboarding/questionnaire/page.tsx`

---

## Current state — existing route/files today

### Component source

**`apps/web/components/profile/avatar-upload.tsx`** — 147 lines, `"use client"`. The component exists and is shared by both consuming surfaces today. It imports `cropResizeToSquare` directly from `@/lib/image` (an app-local import that will be severed on PROMOTE). Verbose `[color:var(--color-*)]` token spelling throughout (lines 83, 116, 127, 133). Uploading scrim uses `bg-black/40` (line 101) — not the spec `bg-overlay` token. Error state renders a bare `<p role="alert">` (line 133) with no retry button; users must click the circle to retry. No explicit "Try again" button. No `variant` or `preprocessImage` props. Hard-codes `fetch("/api/uploads/avatar", …)` internally.

### Consumer 1 — profile-edit

**`apps/web/app/profile/edit/page.tsx`** — server component; gates on `hasCampAccess` + `isApproved` + `completedAt`, redirecting to `/signup/required` / `/onboarding/questionnaire` / `/pending-approval` as needed. Passes `campUser.profileImageUrl` (nullable) as `initialImageUrl` down to `ProfileEditForm`.

**`apps/web/app/profile/edit/edit-form.tsx`** — `"use client"`, 62 lines. Imports `AvatarUpload` from `@/components/profile/avatar-upload` (line 9). Renders `<AvatarUpload value={imageUrl} onChange={setImageUrl} />` (line 31). The proxy URL is held in React state (`imageUrl`) and forwarded to the `updateProfile` server action via a hidden `<input type="hidden" name="profileImageUrl">` (line 32). A form-level error `<p role="alert">` appears when `state && !state.ok` (lines 46–50) — uses verbose `[color:var(--color-destructive)]` token.

**`apps/web/app/profile/actions.ts`** — `"use server"`, `updateProfile` action (lines 24–48). Reads `profileImageUrl` from `FormData`; calls `setDisplayName` + `setProfileImage(campUser.id, image || null)`; redirects to `/profile` on success. No change needed to the action itself in the redesign — it already handles empty-string normalisation (line 45: `image.length > 0 ? image : null`).

### Consumer 2 — onboarding questionnaire (OB Step 01 profile_photo)

**`apps/web/app/onboarding/questionnaire/page.tsx`** — server component; mounts `QuestionnaireWizard` with `QUESTIONNAIRE` catalogue and `saveBurnerProfile` server action. The `profile_photo` page is the first questionnaire page (`kind: "image"`, confirmed in `apps/web/lib/questionnaire.ts:71`). No per-page routing exists; the wizard manages page state in client.

**`apps/web/components/questionnaire/question.tsx`** — `"use client"`, imports `AvatarUpload` from `../profile/avatar-upload` (line 28). In `FieldInput`, the `image` case (lines 232–240) renders:
```tsx
<div className="flex flex-1 flex-col items-center justify-center py-4">
  <AvatarUpload value={typeof value === "string" ? value : null} onChange={(url) => onChange(url)} />
</div>
```
No `preprocessImage` prop is passed (will be required after PROMOTE).

**`apps/web/app/onboarding/questionnaire/actions.ts`** — `saveBurnerProfile` server action. Mirrors the proxy URL onto `users.profile_image_url` via `setProfileImage` on every progress save (lines 70–73). No change needed to this action.

### API routes

**`apps/web/app/api/uploads/avatar/route.ts`** — `POST`; auth + per-user `rateLimit({limit:20})` + per-IP `rateLimit({limit:40})`; `image` field validation (400/413/415); `@vercel/blob put(..., access:"private", addRandomSuffix:true)`; returns `{ url: avatarProxyUrl(blob.pathname) }`. E2E/no-token shortcut returns `{ url: "/api/avatar?pathname=avatars/{userId}/test-avatar.webp" }`. `runtime="nodejs"`.

**`apps/web/app/api/avatar/route.ts`** — `GET`; auth + `isApproved` gate; `pathname` must start with `avatars/`; `@vercel/blob get(pathname, {access:"private"})` streamed with `Cache-Control: private, max-age=31536000, immutable` + `X-Content-Type-Options: nosniff`. Returns 401/400/404 on failure. E2E/no-token returns 404. `runtime="nodejs"`.

### Helper

**`apps/web/lib/image.ts`** — `cropResizeToSquare(file, {size=512, quality=0.85}): Promise<Blob>` — centre-crop + WebP encode using `createImageBitmap` / `<img>` fallback. Browser-only (DOM canvas), no `next/*`. Targeted for extraction to `packages/core/media` per `design/spec/impl/service-layer/09-platform-crosscutting.md §Hybrid extraction item 3`.

### What the redesign changes

1. **PROMOTE** `AvatarUpload` from `apps/web/components/profile/avatar-upload.tsx` → `packages/ui/src/components/avatar-upload.tsx` (see `design/spec/impl/components/molecule-avatarupload.md`).
2. **Fix visual gaps** in the promoted component: `bg-overlay` replaces `bg-black/40`; short-form tokens replace verbose `[color:var(--color-*)]` spellings; bare `<p role="alert">` replaced by `<Alert tone="destructive">`; an explicit "Try again" `<button>` (outline) added to the error state.
3. **Decouple `cropResizeToSquare`** from the component via an injected `preprocessImage` prop (component plan build step 1); add explicit `uploadUrl` prop with default `"/api/uploads/avatar"` (step 2).
4. **Update both consumers** to import from `@camp404/ui` and pass `preprocessImage={cropResizeToSquare}`.
5. **DELETE** `apps/web/components/profile/avatar-upload.tsx` once both consumers compile.
6. **EXTEND** `POST /api/uploads/avatar` with an orphan-cleanup seam (`deleteAvatarBlobs` via NEW `apps/web/lib/avatar-blob.ts`) per service-layer plan 09 §EXTEND.

---

## File structure — target files in apps/web

| File | Status | Notes |
|---|---|---|
| `apps/web/components/profile/avatar-upload.tsx` | **DELETE** | Replaced by `packages/ui/src/components/avatar-upload.tsx` after both consumers are migrated |
| `apps/web/app/profile/edit/edit-form.tsx` | **MODIFY** | Swap import `@/components/profile/avatar-upload` → `@camp404/ui/components/avatar-upload`; add `preprocessImage={cropResizeToSquare}` prop; fix inline `<p role="alert">` → `<Alert tone="destructive">` from `@camp404/ui/alert` |
| `apps/web/app/profile/edit/page.tsx` | **REUSE** | No change; already passes `campUser.profileImageUrl` correctly |
| `apps/web/app/profile/actions.ts` | **REUSE** | `updateProfile` already normalises empty-string → null; no change |
| `apps/web/components/questionnaire/question.tsx` | **MODIFY** | Swap import; add `preprocessImage={cropResizeToSquare}` to the `image` kind render |
| `apps/web/app/onboarding/questionnaire/page.tsx` | **REUSE** | No change |
| `apps/web/app/onboarding/questionnaire/actions.ts` | **REUSE** | `saveBurnerProfile` already mirrors `profile.image` → `setProfileImage`; no change |
| `apps/web/app/api/uploads/avatar/route.ts` | **EXTEND** | Add orphan-cleanup call via `deleteAvatarBlobs` before new `put`; import `deleteAvatarBlobs` from `@/lib/avatar-blob` |
| `apps/web/app/api/avatar/route.ts` | **REUSE** | Already correct; no change |
| `apps/web/lib/avatar-blob.ts` | **NEW** | `deleteAvatarBlobs(userId: string): Promise<void>` — `@vercel/blob list({prefix: "avatars/{userId}/"})` + `del(urls)`; E2E/no-token no-op |
| `apps/web/lib/image.ts` | **EXTEND** (deferred) | `cropResizeToSquare` targeted for extraction to `packages/core/media`; stays app-local until Phase 3 of architecture plan lands; consumers import from `@/lib/image` until then |

No new Next.js route segments, layouts, `error.tsx`, or `not-found.tsx` are added — this is an embedded component with no own route.

---

## Components composed

| Component | Plan | Render context | Notes |
|---|---|---|---|
| `AvatarUpload` | [molecule-avatarupload.md](../components/molecule-avatarupload.md) | **Client** (always; `"use client"`, manages file picker + upload state) | The primary deliverable. Promoted to `@camp404/ui`. Composed inside `ProfileEditForm` (profile-edit) and `FieldInput` (questionnaire/onboarding). |
| `Alert` | [molecule-alert.md](../components/molecule-alert.md) | Client (inside `AvatarUpload` error state) | PROMOTE prerequisite. Replaces the bare `<p role="alert">` currently in `avatar-upload.tsx:133`. Must land before `AvatarUpload` PROMOTE. |
| `Spinner` | [atom-spinner.md](../components/atom-spinner.md) | Client (inside `AvatarUpload` uploading overlay) | PROMOTE prerequisite. Replaces the inlined `<Loader2 className="h-8 w-8 animate-spin text-white">` at `avatar-upload.tsx:102`. Must land before `AvatarUpload` PROMOTE. |
| `Button` | atom-button.md | Client | `Button-Outline` variant used for the primary action trigger ("Upload a photo" / "Change photo" / "Try again"). Already exists in `@camp404/ui`. |
| `Avatar` | atom-avatar.md | Server (profile-view/home) | Read-only display atom used by `ProfilePage` and `HomeHeader` — **not** composed inside `AvatarUpload` itself. AvatarUpload owns its own `<img>` for the interactive upload affordance + scrim overlay. |

---

## Services & data

### Server-side (fetched in page.tsx server components, passed as props)

| Data | Source | How passed |
|---|---|---|
| `campUser.profileImageUrl` (nullable proxy URL string) | `ensureCampUser(authUser)` in `apps/web/app/profile/edit/page.tsx` → `@camp404/db` `users.profile_image_url` | Passed as `initialImageUrl` prop to `ProfileEditForm`, which initialises `imageUrl` React state |
| `profile.responses["profile.image"]` (proxy URL string or undefined) | `getBurnerProfile(campUser.id)` in `apps/web/app/onboarding/questionnaire/page.tsx` → `@camp404/db` `burner_profiles.responses` JSONB | Merged into `initialResponses`, passed to `QuestionnaireWizard`, which initialises wizard state; AvatarUpload receives it as `value` via `QuestionField` → `FieldInput` |

### Client-side / API calls made by the component

| Call | Direction | Handler | Notes |
|---|---|---|---|
| `cropResizeToSquare(file)` | Client-only (canvas) | `apps/web/lib/image.ts` (injected via `preprocessImage` prop post-PROMOTE) | Runs before POST; produces 512×512 WebP blob |
| `fetch POST /api/uploads/avatar` | Client → server | `apps/web/app/api/uploads/avatar/route.ts` | `FormData { image: File }` → `{ url: "/api/avatar?pathname=…" }` |
| `<img src={displaySrc}>` (populated state) | Client → server (for proxy URLs) | `apps/web/app/api/avatar/route.ts` | Object-URL preview bypasses the proxy during upload; proxy URL used after page reload |

### Server actions (called by host surfaces, not by AvatarUpload itself)

| Action | File | What it does with the URL |
|---|---|---|
| `updateProfile` | `apps/web/app/profile/actions.ts` | Reads `profileImageUrl` from `FormData`; calls `setProfileImage(campUser.id, url \| null)` → `users.profile_image_url` |
| `saveBurnerProfile` | `apps/web/app/onboarding/questionnaire/actions.ts` | Upserts `burner_profiles.responses["profile.image"]`; mirrors via `setProfileImage` on every save |

### `@camp404/core` helpers

None — `AvatarUpload` is a presentation + async-upload molecule with no business logic or rank check. `cropResizeToSquare` is browser-pure DOM (not a business rule). No `@camp404/core` import in the component itself; after Phase 3 the `preprocessImage` injection decouples it cleanly.

---

## Gating

**No rank gating on this component.** `AvatarUpload` is rank-agnostic and carries no `CaptainLock`. It renders identically for `member` and `captain`.

- **Upload POST** (`/api/uploads/avatar`): gated on authentication only (`getAuthenticatedUser` + 401). A pending-approval member mid-onboarding can POST and receive a proxy URL — intentional, per `22-avatar-upload.md §No gating states on the component itself`.
- **Avatar GET proxy** (`/api/avatar`): gated on `isApproved`. A pending member's `<img>` will 401; the component avoids this during active upload by using the local object-URL preview as `displaySrc` instead. On page refresh before approval, the stored proxy URL 401s and the `<img>` renders as a broken image (see Open items #3).
- **Host pages**: `ProfileEditPage` (`/profile/edit`) and `QuestionnairePage` (`/onboarding/questionnaire`) have their own auth + access gates in their server components; `AvatarUpload` only ever mounts inside those already-gated pages.

No `CaptainLock` wrapper. No preview-but-locked treatment. Not applicable.

---

## States

### Component-internal states (managed in `AvatarUpload`)

| State | Trigger | Visual |
|---|---|---|
| **EMPTY** | Initial mount with `value=null/undefined`; after remove; after error | Dashed `border-border` circle, `bg-muted` fill, `Camera` icon + "Add photo" caption; "Upload a photo" `Button-Outline` trigger; no error alert; no remove button |
| **UPLOADING** | File selected → `cropResizeToSquare` starts | Local object-URL preview visible; `bg-overlay` scrim over full circle; `Spinner` centred; "Uploading…" button `opacity-60 disabled`; file input disabled |
| **POPULATED** | Upload POST returns `{ url }`; or `value` prop is a non-empty string | Photo displayed, `border-primary` solid; 28×28 `bg-destructive` remove button at top-right (absolute); "Change photo" `Button-Outline` trigger |
| **ERROR** | `cropResizeToSquare` rejects; POST non-2xx or network failure | Circle reverts to EMPTY appearance; `Alert tone="destructive"` between circle and trigger ("Upload failed" / server error message); "Upload a photo" (re-upload) `Button-Outline` trigger; no remove button |

### Host-driven states

| State | How surfaced |
|---|---|
| **Host form submitting** | Host `<form>` fieldset `disabled` during `isPending` (`ProfileEditForm`) — propagates natively to all buttons including those in `AvatarUpload` |
| **Initial value from server** | `value` prop hydrated from `campUser.profileImageUrl` (profile-edit) or `responses["profile.image"]` (onboarding); POPULATED state on mount if non-null |
| **Proxy 401 on refresh** | `<img>` renders as broken image in POPULATED state — no fallback today; see Open items #3 |

### Gating states (not applicable)

None — component is rank-agnostic; no gated/locked state variant.

---

## Build steps

Prerequisites and steps are ordered by dependency. Each step must be independently CI-green before the next begins (MEMORY: green-CI-is-done).

### Step 0 — Prerequisites (not this ticket; tracked elsewhere)

All must land before `AvatarUpload` PROMOTE begins:

1. **`--overlay` token** in `packages/ui/src/styles/globals.css` — `--overlay: oklch(from var(--color-background) l c h / 0.5)`. Tracked in `design/spec/impl/foundations-tokens.md`. Required for the uploading scrim. **Acceptance:** `bg-overlay` resolves to a visible 50% scrim in the browser.
2. **`Spinner` atom** at `packages/ui/src/components/spinner.tsx` (plan: [atom-spinner.md](../components/atom-spinner.md)). Required for the uploading overlay. **Acceptance:** importable from `@camp404/ui`.
3. **`Alert` molecule** at `packages/ui/src/components/alert.tsx` (plan: [molecule-alert.md](../components/molecule-alert.md)). Required for the error state. **Acceptance:** `<Alert tone="destructive">` importable from `@camp404/ui`.

### Step 1 — Extract `cropResizeToSquare` to an injected prop

In the **existing** `apps/web/components/profile/avatar-upload.tsx` (before PROMOTE), remove the direct `import { cropResizeToSquare } from "@/lib/image"` and add a `preprocessImage?: (file: File) => Promise<Blob | File>` prop (default: identity). Pass `preprocessImage={cropResizeToSquare}` at both call sites (`edit-form.tsx`, `question.tsx`).

This step makes the component free of `@/` app imports so the PROMOTE can proceed without breaking the `packages/ui` import boundary.

**Acceptance:** `apps/web/components/profile/avatar-upload.tsx` has zero `@/` imports; both consumers compile and upload flow works identically. CI green.

### Step 2 — Decouple the hardcoded upload endpoint

In the existing `avatar-upload.tsx`, add `uploadUrl?: string` prop with default `"/api/uploads/avatar"`. Replace the hardcoded string in `fetch(...)`.

**Acceptance:** No hardcoded `/api/uploads/avatar` string in component source; default prop preserves existing behaviour; CI green.

### Step 3 — Build `packages/ui/src/components/avatar-upload.tsx` (PROMOTE)

Implement the full promoted component at `packages/ui/src/components/avatar-upload.tsx` per `design/spec/impl/components/molecule-avatarupload.md §Build step 3`. Key requirements:

- Zero imports from `apps/web`, `@/`, or `next/*`.
- `bg-overlay` scrim (not `bg-black/40`); short-form tokens only (no `[color:var(--color-*)]`).
- `<Alert tone="destructive">` from `@camp404/ui/alert` for error state.
- Explicit "Try again" `<button>` (outline variant) in error state calling `inputRef.current?.click()`.
- `preprocessImage` and `uploadUrl` props as defined in Steps 1–2.
- `variant?: "circle" | "dropzone"` prop (circle default; dropzone rectangular for future S05 use).
- Helper text: single `<p className="text-xs text-muted-foreground">` — copy to be confirmed against server cap (5 MB, not 10 MB; see Open items #1).
- Object-URL preview via `useEffect` cleanup to revoke on unmount.
- `aria-label` on circle button ("Add a profile photo" / "Change profile photo"); "Remove profile photo" on remove button; error `Alert` uses `role="alert"`.

**Acceptance:** `packages/ui/src/components/avatar-upload.tsx` passes `pnpm tsc` in `packages/ui`; all four states render correctly in Storybook; `bg-overlay` scrim visible; no raw hex / `bg-black/40` / verbose token spellings; CI green.

### Step 4 — Storybook stories

Create `packages/ui/src/components/avatar-upload.stories.tsx` with stories: Empty, Populated, Uploading, Error, DropzoneVariant, CircleSmall, InteractivePlayground.

**Acceptance:** all stories render without error; Empty/Populated/Error are visually distinct; CI green.

### Step 5 — Vitest / RTL tests

Create `packages/ui/src/components/__tests__/avatar-upload.test.tsx`. Mock `fetch`, `URL.createObjectURL`, `URL.revokeObjectURL`. Cover: all four state transitions, remove button, "Try again" button, `preprocessImage` injection, object-URL revocation on unmount, accessible labels.

**Acceptance:** `pnpm test` in `packages/ui` passes all AvatarUpload tests; CI green.

### Step 6 — Update consumers in `apps/web`

Swap the import path and add `preprocessImage` prop in both consumers:

1. **`apps/web/app/profile/edit/edit-form.tsx`**
   - `import { AvatarUpload } from "@/components/profile/avatar-upload"` → `import { AvatarUpload } from "@camp404/ui/components/avatar-upload"`
   - Add `import { cropResizeToSquare } from "@/lib/image"` (if not already present)
   - Render: `<AvatarUpload value={imageUrl} onChange={setImageUrl} preprocessImage={cropResizeToSquare} />`
   - Replace inline `<p role="alert">` (lines 46–50) with `<Alert tone="destructive">` from `@camp404/ui/alert`

2. **`apps/web/components/questionnaire/question.tsx`** (the `image` kind branch, lines 232–240)
   - Same import path swap
   - Add `import { cropResizeToSquare } from "@/lib/image"`
   - Render: `<AvatarUpload value={...} onChange={...} preprocessImage={cropResizeToSquare} />`

**Acceptance:** both consumers compile; `pnpm build` in `apps/web` passes; profile-edit and onboarding image-question flows work identically to pre-PROMOTE behaviour; CI green.

### Step 7 — Delete the app-local source

Delete `apps/web/components/profile/avatar-upload.tsx`.

**Acceptance:** file is gone; no remaining imports of `@/components/profile/avatar-upload`; `pnpm build` passes; CI green.

### Step 8 — NEW `apps/web/lib/avatar-blob.ts` + orphan-cleanup in upload route (hardening)

Create `apps/web/lib/avatar-blob.ts`:

```ts
// deleteAvatarBlobs: list + delete all blobs under avatars/{userId}/
// Called before a new upload to prevent orphaned blobs accumulating.
// No-op in E2E/unconfigured mode.
export async function deleteAvatarBlobs(userId: string): Promise<void>
```

EXTEND `apps/web/app/api/uploads/avatar/route.ts`: call `await deleteAvatarBlobs(user.id)` before `put(...)` (after size/type validation, inside the real-blob branch).

**E2E_TEST_MODE seam:** `deleteAvatarBlobs` checks `isE2ETestMode() || !process.env.BLOB_READ_WRITE_TOKEN` and returns immediately — same guard as the upload and proxy routes.

**Acceptance:** `avatar-blob.ts` exists; upload route calls cleanup before `put`; E2E tests unaffected; CI green. Note: this step is hardening (existing behaviour gap), not a functional regression — it may land independently or be deferred to Phase 4 service work per architecture plan §Service-layer build order.

### Step 9 — `cropResizeToSquare` extraction to `@camp404/core` (deferred, Phase 3)

When `packages/core` is scaffolded (architecture plan Phase 1–3), `cropResizeToSquare` moves from `apps/web/lib/image.ts` → `packages/core/media`. Both consumers update their `preprocessImage` import from `@/lib/image` → `@camp404/core/media`. `apps/web/lib/image.ts` becomes a re-export shim or is deleted.

This step is gated on Phase 3 of the architecture plan and is tracked there, not here. Steps 1–8 above deliberately keep `cropResizeToSquare` in `apps/web/lib/image.ts` so they can ship independently.

**Acceptance (when this step lands):** `apps/web/lib/image.ts` has zero logic; both consumers import from `@camp404/core`; CI green.

---

## Open items

1. **Helper text copy: 5 MB vs 10 MB.** `design/spec/impl/components/molecule-avatarupload.md §Open items #3` notes that `component-library.md` says "10 MB" but `apps/web/app/api/uploads/avatar/route.ts:9` enforces `MAX_BYTES = 5 * 1024 * 1024`. The helper string must read "5 MB · JPG or PNG" unless the route cap is raised. The surface spec (`22-avatar-upload.md §Upload route constants`) says 5 MB. Confirm the route limit before writing the helper string; do not ship "10 MB" while the server rejects at 5 MB. **Owner: product.**

2. **`--overlay` alpha (50% vs 40%).** Current code uses `bg-black/40` (40%); the board draws `#00000080` (50%); `design-tokens.md §2.4` specifies `--overlay` at 50%. The component plan tracks this in `molecule-avatarupload.md §Open items #1`. Alpha is confirmed when `foundations-tokens.md` locks the token value. Do not hardcode the alpha in `AvatarUpload`. **Owner: design.**

3. **Proxy 401 on page-refresh before approval.** If a pending-approval member uploads a photo mid-onboarding, then refreshes the page, the wizard re-initialises `value` from `responses["profile.image"]` (the proxy URL). The `<img>` will GET `/api/avatar?pathname=…` and receive a 401. The component currently shows a broken image (no `onError` fallback). Resolution options: (a) add `onError={() => setError(null); setPreview(null); onChange(null)}` to the `<img>` to silently fall back to EMPTY; or (b) accept the broken-image and note it resolves once the member is approved. Confirm desired behaviour. **Owner: product.** (Surface spec documents this gap at `22-avatar-upload.md §Edge cases` — "no special handling required in the component".)

4. **`data-uploading` forwarded attribute / `onUploadingChange` callback.** `ProfileEditForm` uses `isPending` from `useActionState` to disable "Save changes" independently of the upload's in-flight state. There is no machine-readable signal from `AvatarUpload` that a POST is in flight — Save and Upload can race. A `data-uploading` attribute on the root element or an `onUploadingChange(boolean)` callback would let `ProfileEditForm` disable Save during an active upload. Confirm whether the race is acceptable or must be prevented. **Owner: product.** (Cross-referenced in `molecule-avatarupload.md §Open items #5`.)

5. **Remove button absolute offset.** `22-avatar-upload.md §Open items #3` notes that the board uses `{none}` (absolute) layout for the 28×28 remove button at top-right but does not specify pixel offsets. Confirm the exact `top-*`/`right-*` class (overlapping the circle edge vs inset) during component build and visual review. Not a blocking question — can be tuned in the PROMOTE step.

6. **Blob lifecycle: orphaned blobs on overwrite and account deletion.** `addRandomSuffix:true` means each upload creates a new pathname; the previous blob is never deleted. Account anonymisation sets `profileImageUrl: null` but does not delete the blob object. Build step 8 adds the orphan-cleanup seam for re-upload. Account deletion cleanup remains a gap (noted in `22-avatar-upload.md §Open questions #1` and `molecule-avatarupload.md §Open items`). Track for a future blob lifecycle job or connect `deleteAvatarBlobs` to the `deleteAccount` flow. **Owner: lead architect.**
