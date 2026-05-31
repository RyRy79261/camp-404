# 08 — Profile edit + delete account

**Files covered:**
- `apps/web/app/profile/edit/page.tsx` — server component; full-page gating spine, fetches initial values, renders the two cards (Edit profile + Danger zone).
- `apps/web/app/profile/edit/edit-form.tsx` — `"use client"` form for display-name + photo; wires `AvatarUpload` and the hidden photo-URL input to the `updateProfile` server action via `useActionState`.
- `apps/web/app/profile/edit/delete-account.tsx` — `"use client"` Danger-zone form; typed-`DELETE` confirmation wired to `deleteOwnAccount` via `useActionState`.
- `apps/web/app/profile/actions.ts` — `"use server"` actions `updateProfile` + `deleteOwnAccount` (re-gates, validates, persists, redirects).
- `apps/web/components/profile/avatar-upload.tsx` — large circular avatar uploader; browser crop/resize → POST `/api/uploads/avatar` → emits stored proxy URL (shared with onboarding).
- `apps/web/lib/account.ts` — thin `deleteAccount(userId)` wrapper; no-op under E2E, else delegates to DB `sanitiseAccount`.
- `packages/db/src/account.ts` — `sanitiseAccount` / `sanitisedUserPatch` / `lostCatName`: anonymise-in-place "Lost Cat #N" erasure + personal-row purge.
- Supporting (read, not owned): `apps/web/lib/users.ts` (`ensureCampUser`, `hasCampAccess`, `isApproved`, `getBurnerProfile`, `setDisplayName`, `setProfileImage`, `CampUser`), `apps/web/lib/auth.ts` (`getAuthenticatedUserOrRedirect`), `packages/db/src/burner-profile.ts` (`setUserDisplayName`/`setUserProfileImage` writers), `packages/db/src/schema.ts` (`users` table), `apps/web/lib/test-store.ts` (in-memory setters), `apps/web/app/api/uploads/avatar/route.ts` (upload contract — owned by unit 22).

**Purpose:** The signed-in member's self-service identity surface. It lets a member edit how they appear around camp — their **display name** and **profile photo** — and provides a Danger-zone **account deletion** that does not hard-delete the row but anonymises it into a "Lost Cat #N" stub (POPIA/GDPR "right to be forgotten") while preserving referral lineage and every audit/FK reference. The page is fully gated: only an authenticated, invite-bearing, onboarding-complete, approved member can reach it.

## Features

### Page shell + gating (`app/profile/edit/page.tsx`)
- `export const dynamic = "force-dynamic"` — reads the Neon Auth session on every request (page.tsx:14).
- Server-side gate sequence, in order (page.tsx:17-28):
  1. `getAuthenticatedUserOrRedirect()` → unauthenticated redirects to `/auth/sign-in` (auth.ts:40-44).
  2. `ensureCampUser(authUser)` resolves/creates the camp row (god accounts auto-created approved; others get a synthetic non-persisted row with `id: ""`).
  3. `if (!hasCampAccess(campUser, authUser.primaryEmail)) redirect("/signup/required")` — invite-gated exit (page.tsx:19-21).
  4. `getBurnerProfile(campUser.id)`; `if (!profile?.completedAt) redirect("/onboarding/questionnaire")` — onboarding-incomplete exit (page.tsx:22-25).
  5. `if (!isApproved(campUser, authUser.primaryEmail)) redirect("/pending-approval")` — pending/rejected exit (page.tsx:26-28).
- Computes `initialDisplayName = campUser.displayName ?? authUser.primaryEmail ?? ""` (page.tsx:30-31) — falls back to email, then empty string.
- Layout: `<main>` with `max-w-md`, `min-h-[100dvh]`, `px-4 py-8` (page.tsx:34). Header "Edit profile" + subtext "Update your photo and how your name shows up around camp." (page.tsx:36-39).
- Two `Card`s: first holds `<ProfileEditForm initialDisplayName initialImageUrl={campUser.profileImageUrl} />` (page.tsx:43-46); second is the **Danger zone** card (`h2` in `--color-destructive`, label "Danger zone") holding `<DeleteAccountForm />` (page.tsx:50-57).

### Profile edit form (`app/profile/edit/edit-form.tsx`)
- Props: `initialDisplayName: string`, `initialImageUrl: string | null` (edit-form.tsx:12-15).
- Photo URL held in client state `imageUrl` initialised from `initialImageUrl` (edit-form.tsx:23). Rides to the server via a **hidden input** `name="profileImageUrl" value={imageUrl ?? ""}` (edit-form.tsx:32).
- `useActionState(updateProfile, null)` → `[state, formAction, isPending]` (edit-form.tsx:24-27).
- Renders `<AvatarUpload value={imageUrl} onChange={setImageUrl} />` (edit-form.tsx:31).
- Display-name field: `<Label htmlFor="displayName">Display name</Label>` + `<Input id/name="displayName" defaultValue={initialDisplayName} maxLength={80} required disabled={isPending} />` (edit-form.tsx:34-43).
- Error banner: `state && !state.ok` → `<p role="alert">` in `--color-destructive` showing `state.error` (edit-form.tsx:46-50).
- Footer: ghost **Cancel** button (`<Link href="/profile">`, disabled while pending) + submit **Save changes** button (label "Saving…" while pending) (edit-form.tsx:52-59).

### Avatar uploader (`components/profile/avatar-upload.tsx`)  — shared with onboarding; pipeline detail = unit 22
- Props: `value: string | null | undefined` (current URL), `onChange: (url: string | null) => void`, `className?` (avatar-upload.tsx:8-15).
- Tapping the circle (or the text button) opens the native file picker (`<input type="file" accept="image/*" class="sr-only">`) (avatar-upload.tsx:77, 138-144).
- `handleFile(file)` (avatar-upload.tsx:39-68): clears error → `setUploading(true)` → `cropResizeToSquare(file)` (browser centre-crop + WebP, see `lib/image.ts`: default 512px edge, quality 0.85) → sets local object-URL `preview` → POSTs `FormData{ image: File("avatar.webp", blob.type) }` to `/api/uploads/avatar` → on `!res.ok` throws `data.error ?? "Upload failed"` → on success `onChange(data.url)` → `finally` clears `uploading` and resets the input value.
- `displaySrc = preview ?? value` (avatar-upload.tsx:70): local preview wins over the authed proxy URL (the proxy `401`s for a not-yet-approved member mid-onboarding — see comment avatar-upload.tsx:28-30).
- Object-URL cleanup: `useEffect` revokes the previous `preview` on change/unmount (avatar-upload.tsx:32-37).
- Remove affordance: when `displaySrc && !uploading`, a destructive circular `X` button (top-right) clears error + preview and calls `onChange(null)` (avatar-upload.tsx:107-120).
- Inline error `<p role="alert">` in `--color-destructive` (avatar-upload.tsx:132-136).

### `updateProfile` action (`app/profile/actions.ts:24-48`)
- Re-runs the auth + invite gate server-side (does **not** re-check onboarding/approval): `getAuthenticatedUserOrRedirect` → `ensureCampUser` → `if (!hasCampAccess) redirect("/signup/required")` (actions.ts:28-32).
- Reads `displayName`: `name = typeof rawName === "string" ? rawName.trim() : ""` (actions.ts:34-35).
- Reads `profileImageUrl`: `image = typeof rawImage === "string" ? rawImage.trim() : ""` (actions.ts:41-42).
- Persists: `setDisplayName(campUser.id, name)` then `setProfileImage(campUser.id, image.length > 0 ? image : null)` — empty image string normalises to `null` (actions.ts:44-45).
- On success `redirect("/profile")` (actions.ts:47). Returns an error object only on validation failure (never returns `{ ok: true }`).

### `deleteOwnAccount` action (`app/profile/actions.ts:55-69`)
- Re-runs auth + invite gate: `getAuthenticatedUserOrRedirect` → `ensureCampUser` → `if (!hasCampAccess) redirect("/signup/required")` (actions.ts:59-63).
- Confirmation guard: `if (formData.get("confirm") !== "DELETE") return { ok: false, error: "Type DELETE to confirm." }` (actions.ts:64-66) — exact case-sensitive string match.
- Calls `deleteAccount(campUser.id)` then `redirect("/auth/sign-out")` to end the session (actions.ts:67-68).

### Delete-account form (`app/profile/edit/delete-account.tsx`)
- `useActionState(deleteOwnAccount, null)` → `[state, action, pending]` (delete-account.tsx:10-13).
- Explanatory copy (delete-account.tsx:17-22): "This permanently erases your personal data and removes you from camp rosters. Your account becomes an anonymous "Lost Cat" stub so the family tree stays intact — it can't be undone. Type **DELETE** to confirm."
- `<Label htmlFor="confirm">Confirmation</Label>` + `<Input id/name="confirm" placeholder="DELETE" autoComplete="off">` (delete-account.tsx:23-31). No `required`, no `maxLength`.
- Error banner: `state && !state.ok` → `<p role="alert">` in `--color-destructive` (delete-account.tsx:32-39).
- Submit: `variant="destructive"` button, label "Deleting…" while `pending`, else "Delete my account" (delete-account.tsx:40-42).

### `deleteAccount` wrapper (`lib/account.ts:10-13`)
- `if (isE2ETestMode()) return { lostCatNumber: 0 }` — **no-op under E2E test mode** (no DB; erasure isn't Playwright-exercised). Otherwise `return sanitiseAccount(userId)`.

### `sanitiseAccount` erasure (`packages/db/src/account.ts:55-130`)
- Runs in **one pooled transaction** (`createPooledDb()`, `pool.end()` in `finally`).
- Allocates `lostCatNumber = (max(users.lost_cat_number) ?? 0) + 1` across the whole `users` table (account.ts:59-64) — monotonic, never reused.
- Anonymises the user row in place via `sanitisedUserPatch` (does **not** hard-delete — comment account.ts:5-9: hard delete would break referral lineage + audit/authorship FKs).
- Deletes personal owned child rows explicitly (the kept `users` row means the FK CASCADE never fires — comment account.ts:72-73): `burnerProfiles`, `dietaryRequirements`, `driverProfiles`, `pushTokens`, `notificationDeliveries`, `questionnaireEdits`, `requiredActions`, `teamMemberships`, `carMembers` (both `driverUserId` OR `memberUserId`), `workshopRsvps`, `broadcastTargets`, `questionnaireActivationTargets` (account.ts:74-116).
- Scrubs reimbursement bank PII: `reimbursements.accountDetailsEncrypted = ""` for `submitterId === userId` (NOT-NULL column → empty string, not null; the reimbursement record is kept for accounting) (account.ts:118-123).
- Returns `{ lostCatNumber }`.

## User actions & interactions
- **Edit display name**: type into the `displayName` input (`maxLength={80}`, `required`); disabled while `isPending`.
- **Upload / change photo**: tap the avatar circle or the text button below it → pick a file → browser crops/resizes → uploads → preview swaps to the new image; text button label cycles "Upload a photo" → "Uploading…" → "Change photo".
- **Remove photo**: tap the destructive `X` overlay (only visible when a photo is shown and not uploading) → clears preview, calls `onChange(null)` → hidden input becomes `""` → on save persists `null`.
- **Save changes**: submit the edit form → `updateProfile` → on success redirect to `/profile`.
- **Cancel**: ghost button links to `/profile` (no save).
- **Delete account**: type `DELETE` into the `confirm` input → submit destructive button → `deleteOwnAccount` → on success redirect to `/auth/sign-out` (session ended).

## States & presentations
Applicable global-states rows for this surface:
- **Empty**: display-name input shows `initialDisplayName` (email fallback or `""`); avatar circle shows dashed border + `Camera` icon + "Add photo" when no photo (avatar-upload.tsx:94-99); `confirm` input empty with placeholder "DELETE".
- **Loading / populated**: page is a server component — values are populated at render (no skeleton). Avatar `uploading` state shows a `Loader2` spinner overlay (`bg-black/40`) (avatar-upload.tsx:100-104).
- **Validation-error**: edit form — empty name → "Display name can't be empty."; over-80 → "Display name must be 80 characters or fewer." (actions.ts:36-39). Delete form — wrong/absent confirm → "Type DELETE to confirm." (actions.ts:65). Avatar — upload failure shows server error or "Upload failed" (avatar-upload.tsx:58, 63). Each surfaced via `role="alert"`.
- **Submitting/pending**: edit form `isPending` → name input + both buttons disabled, submit label "Saving…". Delete form `pending` → destructive button disabled, label "Deleting…". Avatar `uploading` → both trigger buttons disabled (`disabled:opacity-60`), spinner overlay.
- **Success**: both actions redirect (no in-page success banner) — edit → `/profile`; delete → `/auth/sign-out`.
- **Disabled**: see Submitting; avatar trigger buttons carry `disabled:opacity-60`.
- **Invite-gated**: page and both actions `redirect("/signup/required")` when `!hasCampAccess` (page.tsx:19-21; actions.ts:30-32, 61-63).
- **Onboarding-incomplete**: page redirects to `/onboarding/questionnaire` when `!profile?.completedAt` (page.tsx:23-25). (Note: the server actions do NOT re-check this.)
- **Pending-approval**: page redirects to `/pending-approval` when `!isApproved` (page.tsx:26-28).
- **Rejected**: `approval_status='rejected'` is terminal — `isApproved` returns false (only `'approved'` or god passes), so the page redirects to `/pending-approval` (page.tsx:26-28; users.ts:231-236).
- **Captain-only-locked**: N/A — this is a self-service surface available to any approved member regardless of rank; nothing here is rank-gated.

## Enums, options & configurable values
- `MAX_NAME_LENGTH = 80` (actions.ts:16) — mirrored by the input `maxLength={80}` (edit-form.tsx:41).
- Confirmation literal: `"DELETE"` (actions.ts:64; placeholder delete-account.tsx:29) — exact match.
- `UpdateProfileResult = { ok: false; error: string }` (actions.ts:13) — note **only** the failure shape is typed; success path redirects.
- `DeleteAccountResult = { ok: false; error: string }` (actions.ts:14).
- `SanitiseResult = { lostCatNumber: number }` (account.ts:45-47); E2E no-op returns `{ lostCatNumber: 0 }` (account.ts:11).
- `lostCatName(n) → "Lost Cat #N"` (account.ts:11-13).
- Avatar upload contract (route, unit 22): `MAX_BYTES = 5 * 1024 * 1024` (5 MB); per-user rate `limit: 20`, per-IP rate `limit: 40`; status codes `401`/`429`/`400`/`415`/`413`/`502`; image-only (`file.type.startsWith("image/")`); returns proxy URL `/api/avatar?pathname=…`. E2E / missing `BLOB_READ_WRITE_TOKEN` echoes `/api/avatar?pathname=avatars/<userId>/test-avatar.webp` (route.ts:7-98).
- `cropResizeToSquare` defaults: `size = 512`, `quality = 0.85`, output `image/webp` (lib/image.ts).
- `RANK_LABEL` / rank enum not used on this surface (no rank UI here).

## Data model touched
`users` table (`packages/db/src/schema.ts:220-303`) — fields written/read by this unit:
- **Read**: `displayName` (`display_name` text), `profileImageUrl` (`profile_image_url` text), `inviteCode` (`invite_code` text — gate), `approvalStatus` (`approval_status` enum — gate), `id` (uuid), `authUserId` (`auth_user_id` text).
- **Edit writes** (`setUserDisplayName`/`setUserProfileImage`, burner-profile.ts:102-122): `displayName`, `profileImageUrl`, plus `updatedAt = new Date()`. Test-store equivalents set the same fields + `updatedAt` (test-store.ts:220-237).
- **Delete writes** (`sanitisedUserPatch`, account.ts:21-43) — the `users` row patch: `displayName = "Lost Cat #N"`, `authUserId = "deleted:<userId>"` (severs the Neon Auth link so a re-login becomes a fresh access-less user), `profileImageUrl = null`, `passportEncrypted = null`, `saIdEncrypted = null`, `eftDetailsEncrypted = null`, `emergencyContacts = null`, `telegramHandle = null`, `telegramUserId = null`, `termsVersion = null`, `termsConsentedAt = null`, `sanitised = true`, `sanitisedAt = now`, `lostCatNumber = <N>`, `updatedAt = now`. **Kept intentionally**: `id`, `inviteCode` (who invited them — lineage) (comment account.ts:18-20).

Other tables touched on delete (children deleted / scrubbed; see Features → `sanitiseAccount`):
- Deleted by `userId`: `burnerProfiles`, `dietaryRequirements`, `driverProfiles`, `pushTokens`, `notificationDeliveries`, `questionnaireEdits`, `requiredActions`, `teamMemberships`, `workshopRsvps`, `broadcastTargets`, `questionnaireActivationTargets`.
- `carMembers`: deleted where `driverUserId = userId` OR `memberUserId = userId`.
- `reimbursements`: `accountDetailsEncrypted` set to `""` where `submitterId = userId` (record retained for accounting).
- Untouched (lineage/audit): the `users` row itself (anonymised, not deleted), `approvalDecidedByUserId` references, the user's referral subtree (now resolves to "Lost Cat #N").

`CampUser` shape consumed (users.ts:39-47): `id`, `authUserId`, `displayName`, `profileImageUrl`, `inviteCode`, `rank` (`"captain" | "member"`), `approvalStatus` (`"pending" | "approved" | "rejected"`).

## Validation, edge cases & business rules
- **Display name**: trimmed; empty after trim → rejected ("Display name can't be empty."); `> 80` chars → rejected (server-authoritative even though the input caps at `maxLength={80}`) (actions.ts:36-39).
- **Profile image normalisation**: trimmed; empty string → stored as `null`, not `""` (actions.ts:45). The hidden input always submits a string (`imageUrl ?? ""`).
- **Photo persistence is two-phase**: the avatar uploader stores the blob and returns a proxy URL immediately on upload; the URL only persists to `users.profileImageUrl` when the edit form is **saved**. Removing a photo (`X`) or uploading a new one before saving is only client state until save. Navigating away (Cancel) discards unsaved photo/name changes.
- **Delete confirmation**: must be the exact case-sensitive string `"DELETE"` (no trim, so leading/trailing whitespace fails) (actions.ts:64).
- **Delete is irreversible & non-blocking re-login**: the row is anonymised, not removed; `authUserId` is rewritten to `deleted:<id>` so a subsequent Neon Auth login of the same identity creates a brand-new access-less user (must re-redeem an invite). `id` + `inviteCode` are preserved for referral lineage.
- **`lostCatNumber` allocation** is computed inside the transaction as `max + 1` — concurrent deletions are serialised by the transaction; numbers are monotonic and never reused.
- **NOT-NULL scrub**: `reimbursements.accountDetailsEncrypted` is set to `""` (empty string), not `null`, because the column is NOT NULL (account.ts:118-123).
- **E2E test mode**: `deleteAccount` is a no-op returning `{ lostCatNumber: 0 }` (no DB) — account erasure is not exercised by Playwright (account.ts:10-11). Display-name/photo edits route through the in-memory `testStore` (test-store.ts:220-237).
- **Action vs page gating asymmetry**: the page gates on auth + invite + onboarding + approval, but both server actions re-gate only on **auth + invite** (not onboarding/approval). A member who became `pending`/`rejected` after the page loaded could still POST `updateProfile`/`deleteOwnAccount`. <!-- low-confidence: appears intentional (actions don't re-fetch burner profile/approval) but no test asserts it; flagged as an explicit ugly truth. -->
- **Avatar proxy 401 mid-onboarding**: the uploader prefers the local object-URL `preview` over `value` because the authed `/api/avatar` proxy 401s for a not-yet-approved member during onboarding (avatar-upload.tsx:28-30).
- **Synthetic non-persisted user**: an authenticated user with no row + no invite gets `CampUser` with `id: ""` from `ensureCampUser`; `hasCampAccess` reads false so they're redirected before `id: ""` is ever used as a write target (users.ts:82-95).

## Sub-components / variants
- `ProfileEditForm` (edit-form.tsx) — client form, no variants.
- `DeleteAccountForm` (delete-account.tsx) — client form, no variants.
- `AvatarUpload` (avatar-upload.tsx) — **shared** with onboarding (same component); accepts a `className` diameter override (default `h-40 w-40`). Image pipeline detail (`lib/image.ts`, `/api/uploads/avatar`, `/api/avatar` proxy) is owned by **unit 22** — referenced here only for the contract. No dead/orphaned variants.
- Server actions `updateProfile` + `deleteOwnAccount` live in the shared `app/profile/actions.ts` (the `/profile` view also imports from here); both typed with failure-only result objects. No orphaned exports observed.
- `deleteAccount` (lib/account.ts) is the only caller of `sanitiseAccount`; `sanitisedUserPatch` + `lostCatName` are also imported by unit tests in `packages/db` (pure, no-DB by design).
