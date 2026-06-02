# Profile edit + delete account — functional brief

- **Route:** `/profile/edit`
- **Canonical boards:** `19-s10-profile-edit` (S10 Profile edit, 430px) · `20-s11-avatar-upload` (S11 Avatar upload, 430px)
- **Superseded / dropped:** nothing — both boards are additive and represent the same surface (S10 is the page shell; S11 is the AvatarUpload component state atlas). No prior iteration exists.
- **Breakpoints:** 430px mobile-first, single column. No desktop variant drawn; boards drive mobile layout exclusively.

---

## Purpose

The member's self-service identity surface. Any approved, onboarding-complete, invite-bearing member can update their **display name** and **profile photo**, and — via the Danger-zone card — permanently erase their personal data as a "Lost Cat #N" anonymised stub (POPIA/GDPR right to be forgotten). It is not rank-gated: every rank (captain and member) can reach and use all controls. The erasure does not hard-delete the `users` row; it anonymises in place to preserve referral lineage and all FK references.

---

## Layout & modules

The page is a `<main>` single-column scroll (`max-w-md`, `min-h-[100dvh]`) at 430px. Three stacked regions:

### 1. Header block

Vertical block (`gap:6`, `pad:[20,16,8,16]`).

- `h1` "Edit profile" — Inter 22px/700, `$foreground`.
- Subtitle "Update your photo and how your name shows up around camp." — Inter 13px/normal, `$muted-foreground`.

### 2. Card Profile — edit form

`<Card>` instance (`w:fill_container`, `gap:16`). Contains `ProfileEditForm` (client form):

- **AvatarUpload** sub-module (see Component table and AvatarUpload states below).
- **Display-name field**: `<Label>` "Display name" + `<Input name="displayName" maxLength={80} required>`. Disabled while form is pending.
- **Hidden URL input**: `<input type="hidden" name="profileImageUrl">` carries the URL emitted by AvatarUpload to the server action.
- **Error banner**: `<p role="alert">` in `$destructive` shown when action returns `{ ok: false }`. Hidden otherwise.
- **Footer row**: ghost **Cancel** `<Link href="/profile">` (disabled while pending) and primary **Save changes** submit button (label "Saving…" while pending).

### 3. Card Danger — delete-account form

`<Card>` instance (`w:fill_container`, `gap:12`, `stroke:$destructive`). Contains `DeleteAccountForm` (client form):

- **Explanatory copy** (Inter 13px/normal, `$muted-foreground`): describes that personal data is erased, the account becomes an anonymous "Lost Cat" stub, the family tree stays intact, and the action cannot be undone. Instructs the user to type DELETE to confirm.
- **Confirmation field**: `<Label>` "Confirmation" + `<Input name="confirm" placeholder="DELETE" autoComplete="off">`. No `maxLength`, no `required` attribute (server validates).
- **Error banner**: `<p role="alert">` in `$destructive` shown when action returns `{ ok: false }`.
- **Submit button**: `variant="destructive"`, label "Delete my account" (idle) / "Deleting…" (pending). Disabled while pending.

---

## Components used

| Name | Kind | Role | Key props / variants |
|---|---|---|---|
| `Card` | Reusable (canvas + `@camp404/ui`) | Container for each of the two forms; Danger card adds `stroke:$destructive` border | standard `rounded-xl border bg-card` from `card.tsx`; Danger variant overrides `border-destructive` |
| `Button` (variant `outline`) | Reusable (`@camp404/ui`) | AvatarUpload trigger buttons ("Upload a photo", "Uploading…", "Change photo") | `variant="outline"`; `disabled` + `opacity-60` while uploading |
| `Button` (variant `ghost`, `asChild`) | Reusable (`@camp404/ui`) | Cancel link in edit form footer | wraps `<Link href="/profile">`; `disabled` while form pending |
| `Button` (variant `default`) | Reusable (`@camp404/ui`) | Save-changes submit in edit form | `type="submit"`; label switches "Save changes" → "Saving…" via `isPending` |
| `Button` (variant `destructive`) | Reusable (`@camp404/ui`) | Delete-account submit in Danger form | `type="submit"`; label switches "Delete my account" → "Deleting…"; `disabled` while pending |
| `Input` | Reusable (`@camp404/ui`) | Display-name field and DELETE confirmation field | `displayName`: `maxLength={80}`, `required`, `disabled={isPending}`; `confirm`: no constraints, `autoComplete="off"` |
| `Label` | Reusable (`@camp404/ui`) | Field labels for both inputs | standard |
| `AvatarUpload` | New shared component (`components/profile/avatar-upload.tsx`) | Circular avatar picker; shared with onboarding; manages file pick → crop/resize → upload pipeline; emits proxy URL via `onChange` | `value: string \| null \| undefined`, `onChange: (url: string \| null) => void`, `className?` (diameter override; default `h-40 w-40`) |
| `ProfileEditForm` | New page-local client component (`app/profile/edit/edit-form.tsx`) | Client form shell wrapping AvatarUpload + display-name input + footer controls; wires `updateProfile` via `useActionState` | `initialDisplayName: string`, `initialImageUrl: string \| null` |
| `DeleteAccountForm` | New page-local client component (`app/profile/edit/delete-account.tsx`) | Client Danger-zone form; wires `deleteOwnAccount` via `useActionState` | no props |

No new `@camp404/ui` primitives are required beyond `Card`, `Button`, `Input`, and `Label` (all already in the package).

---

## States

### Global matrix

| State | Trigger | Treatment |
|---|---|---|
| **Empty** | No display name set (email fallback or `""`); no photo uploaded; confirm input blank | Display-name input shows email or `""` as `defaultValue`; avatar shows dashed 120×120 circle, `Camera` icon, "Add photo" text; confirm placeholder "DELETE" |
| **Loading** | Page render (RSC `force-dynamic`) | Server component — values are populated at render; no client skeleton or spinner. Page is not served until data resolves |
| **Populated** | `initialDisplayName` and/or `initialImageUrl` present | Display-name input pre-filled; avatar shows photo via proxy URL; text button label reads "Change photo" |
| **Validation-error (edit)** | `updateProfile` returns `{ ok: false }` | `<p role="alert">` beneath AvatarUpload / above footer with `state.error` text in `$destructive`; input stays enabled |
| **Validation-error (delete)** | `deleteOwnAccount` returns `{ ok: false }` | `<p role="alert">` in Danger card with `state.error` text in `$destructive` |
| **Submitting (edit)** | `isPending === true` (edit form) | Display-name input disabled; Cancel link disabled; submit label "Saving…"; AvatarUpload trigger buttons also disabled while uploading |
| **Submitting (delete)** | `pending === true` (delete form) | Delete button disabled, label "Deleting…" |
| **Success (edit)** | `updateProfile` succeeds → server `redirect("/profile")` | No in-page banner; navigation to `/profile` is the success signal |
| **Success (delete)** | `deleteOwnAccount` succeeds → server `redirect("/auth/sign-out")` | Session ends; user lands on sign-out / auth surface |
| **Disabled** | See Submitting above | Per-field and per-button; `disabled:opacity-50` via Button; `disabled:opacity-60` on AvatarUpload outline buttons |

### AvatarUpload state atlas (from S11 board)

The board explicitly draws four states labelled in JetBrains Mono 11px/normal `$muted-foreground` (state labels are development guides, not production-visible text):

| State | Avatar area | Trigger button | Notes |
|---|---|---|---|
| **EMPTY** | 120×120 dashed circle (`stroke:$border`), `Camera` icon + "Add photo" | `<Button-Outline>` "Upload a photo" | No photo yet; tapping circle or button opens native file picker |
| **UPLOADING** | 120×120 filled circle (`fill:$muted`) with `Loader` icon overlay (`fill:#00000080`) | `<Button-Outline>` "Uploading…" (`opacity:0.5`, disabled) | Crop/resize complete; POST in flight to `/api/uploads/avatar` |
| **POPULATED** | 120×120 circle (`stroke:$primary`) with photo; destructive 28×28 remove button (`r:14`, `fill:$destructive`, `X` icon `$destructive-foreground`) at top-right | `<Button-Outline>` "Change photo" | Proxy URL or local object-URL preview; remove button clears photo (`onChange(null)`) |
| **ERROR** | Same as EMPTY (dashed circle, Camera icon, "Add photo") | Upload error alert: "Upload failed" (Inter 13px/600 `$destructive`) + error detail "Could not load image" (Inter 13px/normal `$destructive`) | File picker re-available; retry is just picking again |

Advisory text below all states: "A clear photo of your face works best." — Inter 13px/normal, `$muted-foreground`.

### Gating states

| Gate | Trigger | Treatment |
|---|---|---|
| **Unauthenticated** | No active session | `getAuthenticatedUserOrRedirect()` → redirect `/auth/sign-in` |
| **Invite-gated** | `!hasCampAccess(campUser, email)` | Page and both server actions redirect `/signup/required` |
| **Onboarding-incomplete** | `!profile?.completedAt` | Page redirects `/onboarding/questionnaire`; actions do NOT re-check (see Edge cases) |
| **Pending-approval** | `!isApproved(campUser, email)` | Page redirects `/pending-approval`; actions do NOT re-check |
| **Rejected** | `approvalStatus === 'rejected'` (terminal) | `isApproved` returns false → page redirects `/pending-approval` |
| **Captain-only-locked** | — | N/A. Profile edit is rank-agnostic; no `CaptainLock` overlay on this surface |

---

## User actions

| Action | Result |
|---|---|
| Tap avatar circle or "Upload a photo" / "Change photo" button | Opens native `<input type="file" accept="image/*">`; picking a file triggers `handleFile` |
| Pick a valid image file | `cropResizeToSquare` (512px, 0.85, WebP) → object-URL preview → POST to `/api/uploads/avatar` → on success `onChange(proxyUrl)` → POPULATED state; hidden input value updated |
| Pick an invalid / too-large file | Upload fails → ERROR state; error text from server or "Upload failed"; avatar returns to EMPTY appearance |
| Tap remove (X) button on populated avatar | Clears preview + error; `onChange(null)`; hidden input value becomes `""`; avatar returns to EMPTY state |
| Edit display name | Typed directly into Input; no async until save |
| Tap Save changes | Submits edit form → `updateProfile` server action → trims + validates name → persists `displayName` + `profileImageUrl` → redirect `/profile` |
| Tap Cancel | `<Link href="/profile">` navigation; no save; unsaved name/photo changes discarded |
| Type DELETE and tap Delete my account | Submits delete form → `deleteOwnAccount` action → case-sensitive guard → `sanitiseAccount` → redirect `/auth/sign-out` |
| Submit delete with wrong/missing confirm | `deleteOwnAccount` returns `{ ok: false, error: "Type DELETE to confirm." }` → error banner shown; no erasure |

---

## Data & enums

### Tables touched

| Table | Access | Fields read | Fields written |
|---|---|---|---|
| `users` | Read (page load + gate) | `id`, `authUserId`, `displayName`, `profileImageUrl`, `inviteCode`, `approvalStatus`, `rank` | — |
| `users` | Write (edit) | — | `displayName`, `profileImageUrl`, `updatedAt` |
| `users` | Write (delete — anonymise in place) | — | `displayName` → "Lost Cat #N", `authUserId` → "deleted:\<id>", `profileImageUrl` → null, `passportEncrypted` → null, `saIdEncrypted` → null, `eftDetailsEncrypted` → null, `emergencyContacts` → null, `telegramHandle` → null, `telegramUserId` → null, `termsVersion` → null, `termsConsentedAt` → null, `sanitised` → true, `sanitisedAt`, `lostCatNumber`, `updatedAt` |
| `burnerProfiles` | Delete (on erasure) | — | row deleted where `userId` |
| `dietaryRequirements` | Delete (on erasure) | — | row deleted where `userId` |
| `driverProfiles` | Delete (on erasure) | — | row deleted where `userId` |
| `pushTokens` | Delete (on erasure) | — | rows deleted where `userId` |
| `notificationDeliveries` | Delete (on erasure) | — | rows deleted where `userId` |
| `questionnaireEdits` | Delete (on erasure) | — | rows deleted where `userId` |
| `requiredActions` | Delete (on erasure) | — | rows deleted where `userId` |
| `teamMemberships` | Delete (on erasure) | — | rows deleted where `userId` |
| `carMembers` | Delete (on erasure) | — | rows deleted where `driverUserId = userId` OR `memberUserId = userId` |
| `workshopRsvps` | Delete (on erasure) | — | rows deleted where `userId` |
| `broadcastTargets` | Delete (on erasure) | — | rows deleted where `userId` |
| `questionnaireActivationTargets` | Delete (on erasure) | — | rows deleted where `userId` |
| `reimbursements` | Scrub (on erasure) | — | `accountDetailsEncrypted` → `""` where `submitterId = userId` (record retained; column is NOT NULL) |

**Intentionally kept on erasure:** `users.id`, `users.inviteCode` (preserves referral lineage), `approvalDecidedByUserId` FK references elsewhere (→ `set null`).

### Fields from `schema.ts` used by edit writes

`users.displayName` (text, nullable), `users.profileImageUrl` (text, nullable), `users.updatedAt` (timestamp).

### Enums used

| Enum | Values | Usage |
|---|---|---|
| `rankEnum` | `captain \| member` | Read via `CampUser.rank`; not displayed on this surface; not gating |
| `approvalStatusEnum` | `pending \| approved \| rejected` | Page gate: only `approved` (or god) passes; `pending`/`rejected` redirect |

### New schema

None. This surface introduces no new tables, columns, or enums. The only schema addition in the redesign is `captain_promotion_requests` + `promotion_request_status` (Decision 4), unrelated to this surface.

### Constants

| Constant | Value | Source |
|---|---|---|
| `MAX_NAME_LENGTH` | `80` | `actions.ts:16`; mirrored by `Input maxLength={80}` |
| Confirmation literal | `"DELETE"` (exact, case-sensitive, no trim) | `actions.ts:64`; `Input placeholder="DELETE"` |
| Avatar crop size | 512px edge, quality 0.85, output `image/webp` | `lib/image.ts` (`cropResizeToSquare` defaults) |
| Avatar upload limit | 5 MB per file; 20 uploads per user per window; 40 per IP | `/api/uploads/avatar` route (unit 22) |
| `lostCatName(n)` | `"Lost Cat #N"` | `packages/db/src/account.ts` |

---

## Validation & edge cases

- **Display name — empty:** trimmed value of `""` → server rejects with "Display name can't be empty."; client `required` attribute provides inline hint pre-submit.
- **Display name — too long:** server rejects `> 80` chars with "Display name must be 80 characters or fewer." even if somehow bypassing the `maxLength={80}` input attribute; server is authoritative.
- **Profile image normalisation:** trimmed empty string from the hidden input → stored as `null`, never `""` (`actions.ts:45`).
- **Two-phase photo persistence:** the uploader stores the blob and returns a proxy URL immediately; the URL only reaches `users.profileImageUrl` when the edit form is saved. Tapping Cancel after uploading discards the new photo (blob already written to storage, but URL not persisted). This is a known product trade-off; no cleanup of orphaned blobs is in scope here.
- **Object-URL cleanup:** `useEffect` revokes the local object-URL preview on change or unmount — no memory leak.
- **Avatar proxy 401 mid-onboarding:** the uploader prefers local `preview` over `value` because `/api/avatar` 401s for not-yet-approved users; this surface is already past the approval gate, so the 401 only applies if the component is re-used in onboarding context.
- **DELETE confirmation — case-sensitive, no trim:** leading/trailing whitespace in the confirm input will cause the guard to fail. "delete", "Delete", "DELETE " all fail.
- **Erasure is irreversible:** `authUserId` is rewritten to `deleted:<id>`, severing the Neon Auth link. A subsequent login of the same identity creates a brand-new, access-less user who must re-redeem an invite.
- **`lostCatNumber` allocation:** computed inside the transaction as `max(lost_cat_number) + 1`; concurrent deletions serialise at the DB level; numbers are monotonic, never reused.
- **`reimbursements.accountDetailsEncrypted` NOT NULL:** scrubbed to `""` (empty string), not `null`, to satisfy the NOT NULL constraint; the reimbursement record itself is retained for accounting.
- **Action vs page gating asymmetry:** the page gates on auth + invite + onboarding + approval; both server actions re-gate only on auth + invite. A member whose approval became `pending`/`rejected` after page load can still POST `updateProfile` or `deleteOwnAccount`. This is the observable live-code behaviour; flagged as an open question below.
- **E2E test mode:** `deleteAccount` is a no-op returning `{ lostCatNumber: 0 }` (no DB). Display-name/photo edits route through the in-memory `testStore`.
- **Synthetic non-persisted user (`id: ""`):** `ensureCampUser` returns `id: ""` for an authenticated user with no row + no invite; `hasCampAccess` returns false and the page/actions redirect before `id: ""` is ever used as a write target.

---

## Flows

```
Entry
  └── navigate /profile/edit (e.g. from /profile "Edit profile" link)
        └── RSC render:
              1. getAuthenticatedUserOrRedirect()   → unauthenticated: redirect /auth/sign-in
              2. ensureCampUser(authUser)
              3. !hasCampAccess → redirect /signup/required
              4. getBurnerProfile; !completedAt → redirect /onboarding/questionnaire
              5. !isApproved → redirect /pending-approval
              6. Render: Header + Card Profile + Card Danger

Edit-photo flow (within Card Profile)
  ├── tap avatar circle or outline button
  │     └── native file picker opens
  │           ├── pick file → cropResizeToSquare → UPLOADING state
  │           │     ├── POST /api/uploads/avatar → success → POPULATED (proxy URL in hidden input)
  │           │     └── POST fails → ERROR state (retry available)
  │           └── cancel picker → no state change
  └── tap X on populated avatar → EMPTY state (hidden input cleared)

Save-changes flow
  └── submit ProfileEditForm
        └── updateProfile (server action)
              ├── re-gate: auth + invite (not onboarding/approval)
              ├── validate displayName (trim; empty / >80 → { ok:false, error })
              │     └── error → banner shown; form stays interactive
              ├── setDisplayName + setProfileImage → users table updated
              └── redirect /profile  ✓

Cancel flow
  └── tap Cancel link → navigate /profile (no mutation)

Delete-account flow
  └── type DELETE → submit DeleteAccountForm
        └── deleteOwnAccount (server action)
              ├── re-gate: auth + invite
              ├── confirm !== "DELETE" → { ok:false, error: "Type DELETE to confirm." }
              │     └── error banner shown; form stays interactive
              ├── deleteAccount(userId)
              │     ├── E2E: no-op { lostCatNumber: 0 }
              │     └── prod: sanitiseAccount in transaction
              │           ├── allocate lostCatNumber
              │           ├── anonymise users row in place
              │           └── delete/scrub child rows
              └── redirect /auth/sign-out  ✓ (session ended)
```

---

## Divergences from feature-set reference

| Feature-set signal | Board / Decision | Resolution |
|---|---|---|
| Reference documents two separate files `edit-form.tsx` and `delete-account.tsx` as separate named components | Boards (S10) show them as two `<Card>` instances on one page — no distinction at the board level | Board wins as page decomposition; the two-file split is an implementation detail the spec preserves. No functional divergence. |
| Reference documents a page `<main>` with `max-w-md min-h-[100dvh] px-4 py-8` container | Board is 430px (`w:fill_container`); no explicit outer padding tokens on S10 | Consistent; board shows fill-width behaviour at 430px, and the code's `max-w-md` is the correct shell. No change needed. |
| Reference notes the edit form error banner appears and "never returns `{ ok: true }`" | Board does not show success state inline — success is a redirect | Board wins: no in-page success banner; redirect is the success signal. Consistent with reference. |
| Reference documents `AvatarUpload` as shared with onboarding (same component) | Board S11 draws the avatar state atlas as a standalone board, not as an inset of S10 | S11 is the component state atlas for AvatarUpload; S10 consumes it. The sharing with onboarding is a build fact confirmed by the reference. No conflict. |
| Reference mentions "ghost Cancel button … disabled while pending" | Board does not call out the Cancel button explicitly (inside the Card) | Reference fills in the board gap. Ghost Cancel with disabled state is retained as specified in the reference — boards win on overall chrome; reference fills interaction details not drawn. |
| Reference states the Danger card has an `h2` "Danger zone" label in `--color-destructive` | Board (S10) shows `Card Danger` with `stroke:$destructive` but no explicit text label in the outline | Board outline is minimal; reference fills the gap. "Danger zone" heading is retained in the Danger card. Board's destructive stroke is the primary visual differentiator and is spec'd. |

---

## Open questions / build reconciliations

1. **Action gating asymmetry (onboarding / approval).** Both server actions re-gate only on auth + invite — not onboarding completion or approval status. A member who became pending/rejected after opening the page can still save edits or trigger erasure. Confirm whether this is intentionally permissive (account deletion in particular may be desirable at any lifecycle stage) or whether approval status should be re-checked in `deleteOwnAccount`.

2. **Orphaned avatar blobs.** Uploading a photo, then cancelling (or uploading a replacement) writes a blob to Vercel Blob storage that is never referenced. No cleanup mechanism is in scope for this unit. Confirm whether a TTL / orphan-sweep job is needed, or whether it is acceptable to leave orphaned blobs.

3. **DELETE confirmation UX — no trim.** A trailing space in the confirm input silently fails the guard with a generic error. Consider whether the server should trim the value or whether the error message should call out whitespace explicitly ("Type DELETE exactly, no spaces").

4. **"Lost Cat" user experience post-deletion.** After redirect to `/auth/sign-out`, a user who re-logs in with the same identity gets a fresh, access-less account. If they land on `/signup/required` they may be confused about why their data is gone. No in-app confirmation screen or email is specified for post-deletion. Confirm whether a confirmation email or interstitial is wanted.

5. **Avatar proxy URL lifetime.** The `initialImageUrl` passed from the server is the same-origin proxy URL (`/api/avatar?pathname=…`). If the blob is deleted (e.g. user removes photo and saves), the URL stored in `profileImageUrl` is cleared — consistent. Confirm there is no case where a stale proxy URL in `initialImageUrl` would resolve to a 404 at page-render time that should be handled in the edit form.

6. **`telegramUserId` unique constraint on sanitised rows.** `sanitisedUserPatch` sets `telegramUserId = null`. The column has a `uniqueIndex`. Multiple deletions should all resolve to `null` without conflict (Postgres allows multiple `null` values in a unique index). Confirm this is the intended behaviour and that the index definition permits it.
