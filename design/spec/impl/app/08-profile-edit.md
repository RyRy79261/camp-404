# 08-profile-edit — app integration plan

- **Route:** `/profile/edit` · routed page (App Router)
- **Surface spec:** `design/spec/surfaces/08-profile-edit.md`
- **Boards:** `19-s10-profile-edit` (430px shell), `20-s11-avatar-upload` (AvatarUpload state atlas)

---

## Current state — the existing route/files today

All files are confirmed present and working in production.

| File | Current role | Notes |
|---|---|---|
| `apps/web/app/profile/edit/page.tsx` | RSC page — gates, fetches `campUser`, renders header + two `<Card>` + sub-forms | 60 lines. Uses `getAuthenticatedUserOrRedirect`, `ensureCampUser`, `hasCampAccess`, `getBurnerProfile`, `isApproved` in the correct order. `export const dynamic = "force-dynamic"`. |
| `apps/web/app/profile/edit/edit-form.tsx` | `"use client"` island — wires `updateProfile` via `useActionState`; renders `AvatarUpload`, hidden URL input, display-name input, error banner, Cancel/Save footer | 62 lines. Imports `AvatarUpload` from `@/components/profile/avatar-upload` (app-local path). Error banner uses verbose `text-[color:var(--color-destructive)]` token form. |
| `apps/web/app/profile/edit/delete-account.tsx` | `"use client"` island — wires `deleteOwnAccount` via `useActionState`; renders confirm input, error banner, destructive submit | 45 lines. Same verbose token form. |
| `apps/web/app/profile/actions.ts` | `"use server"` actions file — exports `updateProfile` + `deleteOwnAccount` (and their result types); imports `setDisplayName`, `setProfileImage` from `lib/users`; imports `deleteAccount` from `lib/account` | 69 lines. MAX_NAME_LENGTH = 80 is correct. |
| `apps/web/components/profile/avatar-upload.tsx` | Shared client component used by both profile-edit and onboarding image question | 147 lines. Imports `cropResizeToSquare` from `@/lib/image`. Uses `bg-black/40` scrim and verbose `[color:var(--color-*)]` token spellings throughout. |
| `apps/web/app/api/uploads/avatar/route.ts` | Route handler — auth, rate-limit (20/user + 40/IP), 5 MB cap, Vercel Blob PUT, returns proxy URL `/api/avatar?pathname=…` | 98 lines. E2E stub returns deterministic proxy URL. |

### What the redesign changes

1. **Token spellings:** verbose `text-[color:var(--color-destructive)]` / `text-[color:var(--color-muted-foreground)]` in `page.tsx`, `edit-form.tsx`, `delete-account.tsx` → short-form (`text-destructive`, `text-muted-foreground`). Tracked as a foundations-pass codemod (design-tokens.md §4 reconciliations #22 et al.). Minor EXTEND on each file.

2. **`Card` variant prop:** `page.tsx:50` — danger card currently passes no `variant`; needs `variant="danger"` once `molecule-card.md` Step 2 lands. The `overflow-hidden` class on both cards is not in the spec; keep as a className override (harmless).

3. **`CardTitle` for "Danger zone" heading:** current `page.tsx:52` uses a raw `<h2>` with inline colour + `text-lg font-semibold` rather than `<CardTitle as="h2">`. Once Card Step 3 lands this should adopt `<CardTitle as="h2" className="text-destructive">` to normalise the typography to `--text-subtitle`.

4. **`AvatarUpload` PROMOTE:** `edit-form.tsx:9` import path changes from `@/components/profile/avatar-upload` → `@camp404/ui/components/avatar-upload`; the `preprocessImage={cropResizeToSquare}` prop is added (see `molecule-avatarupload.md` Step 6). This is the headline EXTEND on `edit-form.tsx`.

5. **Error banners → `Alert` component:** `edit-form.tsx:46-49` and `delete-account.tsx:32-38` use bare `<p role="alert">` with verbose token class; once `molecule-alert.md` lands, replace with `<Alert tone="destructive">` (see States below). EXTEND on both client files.

6. **`page.tsx` header typography:** `h1` uses `text-2xl font-semibold` (24px/600) and subtitle uses `text-sm text-[color:var(--color-muted-foreground)]`; spec calls for 22px/700 and 13px/normal respectively. Neither is a named Tailwind step — `text-[22px] font-bold` and `text-[13px]` via className, or wait for a `--text-*` alias codemod. EXTEND.

7. **No `not-found.tsx` or `error.tsx` needed** for this route: the page gates with redirects (never 404s); the global `apps/web/app/error.tsx` already handles runtime errors. Confirmed: no per-route boundary is required.

8. **No schema change:** profile-edit writes only `users.displayName`, `users.profileImageUrl`, `users.updatedAt` and calls `sanitiseAccount` (the full erasure transaction). All columns exist today. Confirmed in `db-impact.json` — no profile-edit DDL.

---

## File structure — target files in apps/web

| File | Verdict | Change |
|---|---|---|
| `apps/web/app/profile/edit/page.tsx` | **MODIFY** | Add `variant="danger"` to danger Card; replace raw `<h2>` with `<CardTitle as="h2">` (after Card Step 3); normalise `h1` + subtitle typography; replace verbose token spellings. |
| `apps/web/app/profile/edit/edit-form.tsx` | **MODIFY** | Swap `AvatarUpload` import to `@camp404/ui`; add `preprocessImage={cropResizeToSquare}` prop; replace bare `<p role="alert">` with `<Alert tone="destructive">`; normalise verbose token spellings. |
| `apps/web/app/profile/edit/delete-account.tsx` | **MODIFY** | Replace bare `<p role="alert">` with `<Alert tone="destructive">`; normalise verbose token spellings. |
| `apps/web/app/profile/actions.ts` | **REUSE** | No change. Logic, gating, constants, and redirect targets are all spec-correct today. |
| `apps/web/components/profile/avatar-upload.tsx` | **DELETE** | Deleted as part of `molecule-avatarupload.md` Step 6 (PROMOTE to `@camp404/ui`); both profile-edit and questionnaire consumers are migrated simultaneously. |
| `apps/web/app/api/uploads/avatar/route.ts` | **REUSE** (with separate EXTEND) | The route handler is spec-correct as-is; the orphan-blob cleanup extension (`deleteAvatarBlobs` call on re-upload) is a platform-domain concern tracked in `service-layer/09-platform-crosscutting.md` — not owned by this surface plan. |

No new files are created by the profile-edit surface redesign itself. The `ProfileEditForm` and `DeleteAccountForm` remain as page-local client islands (not promoted to `@camp404/ui`).

---

## Components composed

| Component | Plan | REUSE/EXTEND/NEW | Renders in | Notes |
|---|---|---|---|---|
| `Card` + `CardContent` | [`molecule-card.md`](../components/molecule-card.md) | **EXTEND** (add `variant="danger"`) | **Server** (page.tsx) | Two card instances; profile card default, danger card `variant="danger"`. |
| `CardTitle` | [`molecule-card.md`](../components/molecule-card.md) | **EXTEND** (add `as` + `size` props) | **Server** (page.tsx) | Danger zone heading `<CardTitle as="h2" className="text-destructive">`. Gated on Card Step 3. |
| `AvatarUpload` | [`molecule-avatarupload.md`](../components/molecule-avatarupload.md) | **PROMOTE** (`@/components/profile/avatar-upload` → `@camp404/ui`) | **Client** (edit-form.tsx) | Shared with onboarding; props `value`, `onChange`, `preprocessImage`. PROMOTE is the prerequisite. |
| `Input` | [`atom-input.md`](../components/atom-input.md) | **REUSE** | **Client** (edit-form.tsx, delete-account.tsx) | `displayName`: `maxLength={80}`, `required`, `disabled={isPending}`. `confirm`: `autoComplete="off"`, no constraints. |
| `Label` | [`atom-label.md`](../components/atom-label.md) | **REUSE** | **Client** (edit-form.tsx, delete-account.tsx) | Standard field labels. Typography normalisation tracked in atom-label.md. |
| `Button` (multiple variants) | [`atom-button.md`](../components/atom-button.md) | **REUSE** | **Client** (edit-form.tsx, delete-account.tsx) | `ghost asChild` Cancel link (disabled while pending); `default` Save submit; `destructive` Delete submit. |
| `Alert` | [`molecule-alert.md`](../components/molecule-alert.md) | **PROMOTE** (replaces bare `<p role="alert">`) | **Client** (edit-form.tsx, delete-account.tsx) | `tone="destructive"` for both error banners. Gated on Alert being promoted. |
| `ProfileEditForm` | Page-local (`edit-form.tsx`) | **EXTEND** (import path + Alert) | **Client** | `initialDisplayName: string`, `initialImageUrl: string \| null`. |
| `DeleteAccountForm` | Page-local (`delete-account.tsx`) | **EXTEND** (Alert) | **Client** | No props. |

No `CaptainLock` — profile-edit is rank-agnostic (confirmed: spec §Gating "N/A. Profile edit is rank-agnostic; no `CaptainLock` overlay on this surface").

---

## Services & data

### Server-side fetch (page.tsx RSC, executed before render)

| Call | From | Returns | Used for |
|---|---|---|---|
| `getAuthenticatedUserOrRedirect()` | `apps/web/lib/auth` | `AuthenticatedUser` (or redirects) | Session + `primaryEmail` |
| `ensureCampUser(authUser)` | `apps/web/lib/users` | `CampUser` (`id`, `displayName`, `profileImageUrl`, `inviteCode`, `rank`, `approvalStatus`) | All gating predicates + initial form values |
| `hasCampAccess(campUser, authUser.primaryEmail)` | `apps/web/lib/users` | `boolean` | G1 gate |
| `getBurnerProfile(campUser.id)` | `apps/web/lib/users` | `BurnerProfileSummary \| null` | G2b gate (`completedAt` check) |
| `isApproved(campUser, authUser.primaryEmail)` | `apps/web/lib/users` | `boolean` | G3 gate |

All five calls are sequential (each depends on the previous). The page uses `export const dynamic = "force-dynamic"` so data is always fresh.

### Props passed to client islands

`ProfileEditForm` receives `initialDisplayName: string` and `initialImageUrl: string | null` from the server component. `DeleteAccountForm` receives no props. No data is fetched client-side.

### Server actions (triggered client-side via `useActionState`)

| Action | File | Calls (lib/packages) | Success path | Error path |
|---|---|---|---|---|
| `updateProfile` | `apps/web/app/profile/actions.ts` | `getAuthenticatedUserOrRedirect()` → `ensureCampUser` → `hasCampAccess` (re-gate auth + invite only) → `setDisplayName(campUser.id, name)` → `setProfileImage(campUser.id, url \| null)` → `redirect("/profile")` | `redirect("/profile")` (never returns `{ ok: true }`) | `{ ok: false, error: string }` |
| `deleteOwnAccount` | `apps/web/app/profile/actions.ts` | `getAuthenticatedUserOrRedirect()` → `ensureCampUser` → `hasCampAccess` (re-gate auth + invite only) → confirm guard → `deleteAccount(campUser.id)` → `redirect("/auth/sign-out")` | `redirect("/auth/sign-out")` | `{ ok: false, error: string }` |

### @camp404/core helpers (after Phase 3 extraction)

Once `service-layer/01-identity-access-gating.md` Step 3 lands, `hasCampAccess` and `isApproved` in `apps/web/lib/users.ts` become thin shims calling `core.hasCampAccess(user, isGodEmail(email))` and `core.isApproved(user, isGodEmail(email))`. The call-sites in `page.tsx` and `actions.ts` are unchanged — no surface-level edit required for that extraction.

### Upload route (client-initiated)

`AvatarUpload` POSTs to `apps/web/app/api/uploads/avatar/route.ts` (hardcoded `/api/uploads/avatar`). After `molecule-avatarupload.md` Step 2 lands the endpoint is injected via an `uploadUrl` prop (default `"/api/uploads/avatar"`) — profile-edit passes no override so it continues to hit the same route. The route returns `{ url: string }` (same-origin proxy URL) which `onChange` carries to the hidden input.

### Data written

| Table | Action | Columns written |
|---|---|---|
| `users` | `updateProfile` (via `setDisplayName` + `setProfileImage` → `packages/db`) | `displayName`, `profileImageUrl`, `updatedAt` |
| `users` + 13 child tables | `deleteOwnAccount` (via `deleteAccount` → `sanitiseAccount` in `packages/db/src/account.ts`) | See spec §Data for the full anonymisation patch |

---

## Gating

This surface is **not rank-gated**. No `CaptainLock`. The gate chain is identical to the existing code and matches `flows.md §1.2`:

| Gate | Predicate | Treatment |
|---|---|---|
| **Unauthenticated** | No session | `getAuthenticatedUserOrRedirect()` → `redirect("/auth/sign-in")` |
| **Invite-gated** | `!hasCampAccess(campUser, email)` | `redirect("/signup/required")` |
| **Onboarding-incomplete** | `!profile?.completedAt` | `redirect("/onboarding/questionnaire")` |
| **Pending/rejected approval** | `!isApproved(campUser, email)` | `redirect("/pending-approval")` |
| **Captain-only locked** | — | N/A — profile edit is rank-agnostic |

**Action gating is narrower than page gating** (auth + invite only; no onboarding or approval re-check). This is existing live behaviour and is flagged as an open question — see §Open items #1.

---

## States

### Page / form states

| State | Trigger | Treatment |
|---|---|---|
| **Loading** | Page RSC render | `force-dynamic`; all data resolves server-side before HTML is sent. No client skeleton/spinner. |
| **Empty (no name, no photo)** | `campUser.displayName === null`, no `profileImageUrl` | `initialDisplayName` = `authUser.primaryEmail ?? ""`; AvatarUpload renders EMPTY (dashed circle, Camera icon, "Add photo"). |
| **Populated** | `campUser.displayName` and/or `campUser.profileImageUrl` set | Input pre-filled; AvatarUpload renders POPULATED (photo + remove button + "Change photo"). |
| **Submitting (edit)** | `isPending === true` | Display-name input `disabled`; Cancel link `disabled`; Save button label "Saving…"; AvatarUpload trigger buttons disabled while uploading (independent). |
| **Submitting (delete)** | `pending === true` | Delete button `disabled`, label "Deleting…". |
| **Validation error (edit)** | `updateProfile` returns `{ ok: false }` | `<Alert tone="destructive">` with `state.error` shown. Input stays enabled. |
| **Validation error (delete)** | `deleteOwnAccount` returns `{ ok: false }` | `<Alert tone="destructive">` with `state.error` shown in danger card. |
| **Success (edit)** | `updateProfile` succeeds | `redirect("/profile")` — no in-page banner. |
| **Success (delete)** | `deleteOwnAccount` succeeds | `redirect("/auth/sign-out")` — session ended. |

### AvatarUpload sub-states (all client-local within edit-form.tsx)

| AvatarUpload state | Treatment |
|---|---|
| **EMPTY** | Dashed `border-border` circle, `Camera` icon, "Add photo" caption; "Upload a photo" outline trigger. |
| **UPLOADING** | Filled circle with `bg-overlay` scrim and `Spinner`; "Uploading…" trigger disabled (`opacity-60`). |
| **POPULATED** | Photo displayed with `border-primary` solid ring; destructive 28×28 remove button top-right; "Change photo" trigger. |
| **ERROR** | Reverts to EMPTY appearance; `<Alert tone="destructive">` with server error or "Upload failed". |

These states are entirely client-local to `AvatarUpload`; `ProfileEditForm` observes only the `onChange(url | null)` callback and the presence/absence of `imageUrl` in its own state.

### Gating states (all server-side redirects; no in-page rendering)

Unauthenticated → `/auth/sign-in`; invite-gated → `/signup/required`; onboarding-incomplete → `/onboarding/questionnaire`; pending/rejected → `/pending-approval`.

---

## Build steps

Prerequisites and ordering follow the architecture phase plan (`architecture.md §Service-layer build order`). Steps within this surface are in dependency order; `‖` marks items that can land in parallel once their shared prerequisite is met.

### Step 0 — Prerequisites (not owned by this surface; must land first)

| Prerequisite | Owned by | Required for |
|---|---|---|
| `--overlay` token in `packages/ui/src/styles/globals.css` | `foundations-tokens.md` | AvatarUpload UPLOADING state scrim |
| `Spinner` atom at `packages/ui/src/components/spinner.tsx` | `atom-spinner.md` | AvatarUpload UPLOADING overlay |
| `Alert` molecule at `packages/ui/src/components/alert.tsx` | `molecule-alert.md` | Error banners in both client islands |
| `AvatarUpload` PROMOTE (Steps 1–5 in `molecule-avatarupload.md`) | `molecule-avatarupload.md` | Import path swap in `edit-form.tsx` |
| `Card` `variant` prop (Step 2 in `molecule-card.md`) | `molecule-card.md` | `variant="danger"` on danger card |

### Step 1 — Token codemod (independent; lands once foundations are in)

**Change:** In `page.tsx`, `edit-form.tsx`, and `delete-account.tsx`, replace every verbose `text-[color:var(--color-*)]` spelling with the short-form Tailwind semantic class (`text-destructive`, `text-muted-foreground`, etc.).

**Files touched:** `page.tsx:37,52`, `edit-form.tsx:47`, `delete-account.tsx:18,34`.

**Acceptance:** `grep -r "\[color:var" apps/web/app/profile/` returns no results. `pnpm build` (tsc) green. Visual output unchanged.

**E2E note:** no behaviour change; visual regression in Storybook sufficient. No Playwright test needed.

### Step 2 — Alert integration in client islands (requires Alert PROMOTE)

**Change:** Replace bare `<p role="alert" className="...">` with `<Alert tone="destructive">` in both `edit-form.tsx` and `delete-account.tsx`.

- `edit-form.tsx:46-49`: `{state && !state.ok && <Alert tone="destructive">{state.error}</Alert>}`
- `delete-account.tsx:32-38`: `{state && !state.ok ? <Alert tone="destructive">{state.error}</Alert> : null}`

**Files touched:** `edit-form.tsx`, `delete-account.tsx`.

**Acceptance:** Error state renders with the `Alert` component styling. `role="alert"` is provided by the `Alert` component (confirmed in `molecule-alert.md`). Vitest snapshot updated. E2E: trigger a validation error on each form (submit empty name; submit wrong confirm) and assert `[role="alert"]` is present.

### Step 3 — AvatarUpload import swap (requires AvatarUpload PROMOTE — molecule-avatarupload.md Step 6)

**Change:** In `edit-form.tsx`:
- Replace `import { AvatarUpload } from "@/components/profile/avatar-upload"` with `import { AvatarUpload } from "@camp404/ui/components/avatar-upload"`.
- Add `preprocessImage={cropResizeToSquare}` prop (import `cropResizeToSquare` from `@/lib/image`).

The `apps/web/components/profile/avatar-upload.tsx` source file is deleted as part of `molecule-avatarupload.md` Step 6 (migrating both consumers simultaneously — profile-edit and questionnaire question.tsx).

**Files touched:** `edit-form.tsx` (import + prop); `apps/web/components/profile/avatar-upload.tsx` (DELETE — managed by AvatarUpload plan).

**Acceptance:** `apps/web/components/profile/avatar-upload.tsx` no longer exists. `pnpm build` in `apps/web` clean. Profile-edit and onboarding image question both work identically. E2E: pick a file on `/profile/edit`, verify POPULATED state and that Save persists the URL.

**E2E_TEST_MODE seam:** `apps/web/app/api/uploads/avatar/route.ts` returns `{ url: avatarProxyUrl("avatars/${user.id}/test-avatar.webp") }` when `isE2ETestMode()` is true — no real Blob call. The `preprocessImage` pipeline still runs client-side (canvas crop/resize) but the server echoes a deterministic URL. Tests can assert that `onChange` is called with a `/api/avatar?pathname=…` URL.

### Step 4 — Card variant + CardTitle heading (requires Card EXTEND — molecule-card.md Steps 2–3)

**Change:** In `page.tsx`:
- Add `variant="danger"` to the second `<Card>` (currently `<Card className="mt-6 overflow-hidden">`).
- Replace raw `<h2 className="mb-3 text-lg font-semibold text-[color:var(--color-destructive)]">Danger zone</h2>` with `<CardTitle as="h2" className="mb-3 text-destructive">Danger zone</CardTitle>`. Typography normalises to `--text-subtitle` (16px/700) via the new `CardTitle` default.
- Also update `h1` typography: `text-2xl font-semibold` → `text-[22px] font-bold` (spec: 22px/700); subtitle `text-sm text-[color:var(--color-muted-foreground)]` → `text-[13px] text-muted-foreground`.

**Files touched:** `page.tsx`.

**Acceptance:** Danger card renders with `border-destructive` stroke. "Danger zone" heading is an `<h2>` with correct typography. `pnpm build` clean. Visual regression in Storybook (if a story for the page exists) or Playwright screenshot.

### Step 5 — Regression guard (can land after Step 3)

Add or extend a vitest unit covering `actions.ts` (or extend the existing `apps/web/lib/__tests__/` suite) for:
- `updateProfile`: empty name → `{ ok: false }`; name > 80 chars → `{ ok: false }`; valid submission → calls `setDisplayName` + `setProfileImage`; empty `profileImageUrl` → `setProfileImage` called with `null`.
- `deleteOwnAccount`: confirm !== "DELETE" → `{ ok: false, error: "Type DELETE to confirm." }`; correct confirm → calls `deleteAccount`.

These tests use the E2E test-mode backend (set `E2E_TEST_MODE=1` in the test environment so `testStore` is active and no DB is needed).

**Acceptance:** `pnpm test --filter apps/web` covers both server actions. E2E (Playwright): sign in as a test user, navigate `/profile/edit`, submit both forms (success + validation-error paths), assert redirect URLs.

---

## Open items

1. **Action gating asymmetry (onboarding / approval).** Both `updateProfile` and `deleteOwnAccount` re-gate on auth + invite but NOT on onboarding completion or approval status. A member whose approval became `pending`/`rejected` after opening the page can still POST either action. Spec (`surfaces/08-profile-edit.md §Edge cases`) flags this as intentional live-code behaviour and an open question. Account deletion may be intentionally permissive at any lifecycle stage (erasing data even before onboarding is complete is arguably desirable). Confirm whether `deleteOwnAccount` should also be exempted from onboarding/approval re-checks, and whether `updateProfile` requires a stricter re-gate. **Owner: product.**

2. **Orphaned avatar blobs.** `AvatarUpload` + the upload route write blobs on every file pick; Cancel discards the URL without deleting the blob. The `deleteAvatarBlobs` orphan-cleanup helper is planned in `service-layer/09-platform-crosscutting.md` (Target API: `apps/web/lib/avatar-blob.ts`, NEW) and wired into the upload route on re-upload. That work is NOT owned by this surface plan — profile-edit does not manage blob lifecycle, only the URL. Confirm whether a TTL / sweep job is also needed or whether re-upload cleanup is sufficient. **Owner: platform (plan 09).**

3. **DELETE confirmation — no trim.** A trailing space in the confirm input silently fails. The spec documents this as intentional (case-sensitive, no trim). Consider whether the error message should call out whitespace ("Type DELETE exactly, no spaces") to improve UX. Currently the error reads "Type DELETE to confirm." with no hint about whitespace. Low priority. **Owner: product.**

4. **`lostCatNumber` allocation and concurrent deletions.** `sanitiseAccount` in `packages/db/src/account.ts:61` uses `max(lost_cat_number) + 1` in a transaction to allocate monotonic numbers. Confirmed: `users.lost_cat_number` has no uniqueness index — concurrent deletions serialise at the DB level inside the transaction. The plan assumes this is correct behaviour; flag if a unique constraint on `lost_cat_number WHERE sanitised = true` would be safer. **Owner: data owner.**

5. **Avatar proxy URL staleness at page render.** `initialImageUrl` passed from the server is a same-origin proxy URL (`/api/avatar?pathname=…`). If the user previously removed their photo and saved, `campUser.profileImageUrl` is `null` and no URL is passed — correct. There is no case where a non-null `initialImageUrl` resolves to a 404 at render time in the profile-edit context (the user is past the approval gate, so the proxy authenticates). Confirm this remains true if the underlying blob is deleted by the orphan-cleanup sweep after the page has loaded but before AvatarUpload renders the `value` prop. **Owner: platform (plan 09).**

6. **`preprocessImage` prop and the 5 MB route cap copy.** `molecule-avatarupload.md` open item #3 notes the component-library spec says "10 MB" but the route enforces 5 MB (`MAX_BYTES = 5 * 1024 * 1024`). Profile-edit consumers must pass `preprocessImage={cropResizeToSquare}` (which outputs 512px WebP, well under 5 MB), so the discrepancy is academic in this context. Any helper text rendered by `AvatarUpload` ("5 MB · JPG or PNG") must match the route cap. Confirm the copy before writing it into the promoted component. **Owner: product + design.**
