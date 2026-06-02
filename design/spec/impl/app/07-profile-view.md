# 07-profile-view — app integration plan

- **Route(s):** `/profile` · routed page (no nested routes on this surface)
- **Surface brief:** `design/spec/surfaces/07-profile-view.md`
- **Architecture authority:** `design/spec/impl/architecture.md`

---

## Current state — the existing route/files today

The route already exists and is fully functional. Paths confirmed by directory listing and source reads:

| File | Role today | What the redesign changes |
|---|---|---|
| `apps/web/app/profile/page.tsx` | Server Component, `force-dynamic`. Runs the gate spine (auth → invite → onboarding → approval), derives name/initials/rankLabel, renders the profile card inline. | Avatar size (128px → 96px); rank badge (inline `<span>` → `Badge` atom); token-spelling cleanup; RankPill `$secondary` fill → board-canonical `bg-[#ff008c2e]`/`bg-secondary`; questionnaire-link styling delta; `max-w-sm` centred container per board. No new files; a MODIFY. |
| `apps/web/app/profile/actions.ts` | `"use server"` — `updateProfile` + `deleteOwnAccount`. **Belongs to the profile-edit surface (08)**, not profile-view. | Not touched by this surface's build. |
| `apps/web/app/profile/edit/` (three files) | Profile editor — entirely surface 08. | Out of scope for this plan. |

**Gate spine today** (`page.tsx:24–36`) — matches `07-profile-view.md §Gate / access states` exactly:
1. `getAuthenticatedUserOrRedirect()` → session or redirect to `/auth/sign-in`
2. `ensureCampUser(authUser)` + `hasCampAccess(campUser, authUser.primaryEmail)` → redirect to `/signup/required`
3. `getBurnerProfile(campUser.id)` + `!profile?.completedAt` → redirect to `/onboarding/questionnaire`
4. `isApproved(campUser, authUser.primaryEmail)` → redirect to `/pending-approval`

All four checks are in place and in the correct order. No gate changes are needed.

**Identified divergences from the board (`18-s09-profile-view.txt`):**
- Avatar: `h-32 w-32 text-3xl` (128px) → board is `w:96 h:96` (96px). Flagged in `atom-avatar.md` §Build step 3 and surface brief §Divergences #2.
- `CardContent`: `p-8 gap-4` live vs board `pad:28 gap:14` (`p-7 gap-3.5`).
- RankPill fill: `bg-[color:var(--color-secondary)]` live vs board `#ff008c2e` (magenta tint). Flagged in surface brief §Divergences #1 and `atom-badge.md §Current state`. Resolution per `foundations-tokens.md §Group C #3`: captain-rank pill maps to `bg-secondary/25 text-secondary-foreground`; use `<Badge tone="secondary" variant="soft-tint">` once the Badge atom ships, or align the inline span to the resolved token in the interim.
- Questionnaire link: live uses `underline underline-offset-4` on the `<Link>`; board draws `$accent`-coloured text (not underlined). The `"Review them here"` node must be `text-accent` per the brief.
- Sign-out: uses `<a href="/auth/sign-out">` with `underline underline-offset-4 text-muted-foreground` — correct semantics (hard navigation). Token spelling `text-[color:var(--color-muted-foreground)]` is the verbose form; snap to `text-muted-foreground`.
- Container: live uses `max-w-xl`. Board is 430px with `max-w-sm` (384px) or equivalent `max-w-[430px]` centred single-column per brief §Layout.

No logic changes are required. This is a presentation-only MODIFY.

---

## File structure — target files in apps/web

| Path | Verdict | Notes |
|---|---|---|
| `apps/web/app/profile/page.tsx` | **MODIFY** | The only change target for this surface. Server Component only — no client island needed. All interactivity is navigation (`<Link>`, `<a>`). |
| `apps/web/app/profile/actions.ts` | **REUSE (untouched)** | Surface 08's server actions live here by co-location; this surface does not call them. |
| `apps/web/app/profile/edit/` | **REUSE (untouched)** | Surface 08 — out of scope. |

**No new files.** No client island (`"use client"` component), no `/api` route handler, no `error.tsx`, no `not-found.tsx` are required. The surface is purely read-only server-rendered with gate redirects — no errors can propagate to an error boundary on this page (gate failures redirect; a server crash falls through to the app-level `error.tsx`).

---

## Components composed — list and render location

All components render in the Server Component (`page.tsx`). There is no client island and no async island boundary. The surface spec explicitly confirms: "no client loading spinner", "server-rendered", "no async client actions".

| Component | Plan | mapsTo | Renders | Role |
|---|---|---|---|---|
| `Avatar` / `AvatarImage` / `AvatarFallback` | [`components/atom-avatar.md`](../components/atom-avatar.md) | REUSE + EXTEND (`packages/ui/src/components/avatar.tsx`) | Server | 96px circle. Photo when `profileImageUrl` truthy; always renders `AvatarFallback` with `initialsFrom()` output. Size fix: `h-24 w-24` (96px per board). |
| `Card` / `CardContent` | [`components/molecule-card.md`](../components/molecule-card.md) | REUSE (`packages/ui/src/components/card.tsx`) | Server | Profile card shell. `variant="default"` (no danger/selected/interactive). `CardContent` padding aligns to board: `p-7` (28px) + `gap-3.5` (14px), `flex-col items-center text-center`. |
| `Button` (`asChild`) | [`components/atom-button.md`](../components/atom-button.md) | REUSE (`packages/ui/src/components/button.tsx`) | Server | Edit-profile CTA. `variant="default"`, `size="default"`, `asChild`, wraps `<Link href="/profile/edit">`. `className="w-full gap-2"` + `Pencil` icon at `h-4 w-4`. |
| **RankPill** (inline `<span>`) | [`components/atom-badge.md`](../components/atom-badge.md) | **Interim: inline `<span>`; target: `<Badge tone="secondary" variant="soft-tint">`** | Server | Rank badge. Board fill `#ff008c2e` reconciles to `bg-secondary/25 text-secondary-foreground` per `foundations-tokens.md §Group C #3`. Until `Badge` atom ships: inline `<span className="rounded-full bg-secondary/25 px-3 py-0.5 text-xs font-semibold text-secondary-foreground">`. This replaces the live verbose-token form. Label: `campUser.rank === "captain" ? "Captain" : "Member"`. |

**Components explicitly NOT used on this surface** (confirmed by surface brief §Components used):
- `TopChrome` / `DetailHeader` / `SectionHeader` — board draws none; surface predates app chrome.
- `CaptainLock` — this surface is not captain-gated; every approved member sees it regardless of rank.
- Any form components — surface is read-only.

---

## Services & data — service-layer calls

This surface is **read-only**. No server actions are called from the page. No mutations originate here. All data is fetched server-side in `page.tsx` and used directly in the JSX render.

### Server-side fetches (in `page.tsx`)

| Symbol | Source module | What it returns | Used for |
|---|---|---|---|
| `getAuthenticatedUserOrRedirect()` | `apps/web/lib/auth.ts` | `AuthenticatedUser` (`primaryEmail`, `displayName`) or redirects | Auth gate G0; provides `primaryEmail` for display name fallback and email line |
| `ensureCampUser(authUser)` | `apps/web/lib/users.ts` | `CampUser` (`id`, `displayName`, `profileImageUrl`, `inviteCode`, `rank`, `approvalStatus`) | Invite gate G1 + profile data source |
| `hasCampAccess(campUser, authUser.primaryEmail)` | `apps/web/lib/users.ts` (thin shim over `@camp404/core` post-extraction) | `boolean` | Gate G1 — redirect to `/signup/required` if false |
| `getBurnerProfile(campUser.id)` | `apps/web/lib/users.ts` | `BurnerProfileSummary \| null` (`{ completedAt }`) | Gate G2b — redirect to `/onboarding/questionnaire` if `completedAt` is null |
| `isApproved(campUser, authUser.primaryEmail)` | `apps/web/lib/users.ts` (thin shim over `@camp404/core` post-extraction) | `boolean` | Gate G3 — redirect to `/pending-approval` if false |
| `initialsFrom(campUser.displayName ?? authUser.primaryEmail)` | `apps/web/lib/initials.ts` (target: `@camp404/core`) | `string` (never empty; `"?"` on bad input) | `AvatarFallback` initials |

### Data derivations (pure, in the Server Component body)

```ts
name      = campUser.displayName ?? authUser.primaryEmail ?? "Burner"
initials  = initialsFrom(campUser.displayName ?? authUser.primaryEmail)
rankLabel = campUser.rank === "captain" ? "Captain" : "Member"
```

No `rankLabel()` helper from `lib/camp-roster.ts` — surface brief §Divergences confirms the local ternary is the canonical pattern here (team-lead renders as "Member").

### Props passed client-ward

None. There is no client island. All data is consumed directly in the Server Component render.

### Service-layer plans relevant to this surface

- **Plan 01 — Identity, access-control & gating** (`service-layer/01-identity-access-gating.md`): `hasCampAccess`, `isApproved`, `ensureCampUser`, `getAuthenticatedUserOrRedirect`, `getBurnerProfile`. All consumed via their current `apps/web/lib` call-sites. After the Phase 3 extraction, these become thin shims calling `@camp404/core` — no call-site change in `page.tsx`.
- **Plan 09 — Platform / crosscutting** (`service-layer/09-platform-crosscutting.md`): `initialsFrom` extraction from `apps/web/lib/initials.ts` → `@camp404/core`. The import path in `page.tsx` updates from `@/lib/initials` to `@camp404/core` when that extraction ships; the behaviour is identical.

---

## Gating

**Gate level:** none of the preview-but-locked captain gates apply here. This is a per-member self-view available to every fully-onboarded, captain-approved member regardless of rank.

Per `design/spec/surfaces/07-profile-view.md §Captain-only lock — N/A`:
> This is a per-member self-view available to every approved member regardless of rank. The card never reveals captain-only data; `CaptainLock` is not used.

The gate spine is the standard auth/access/onboarding/approval sequence — all server-side redirects, not preview-but-locked. Gate precedence is fixed and short-circuits: auth → invite → onboarding-complete → approval (confirmed matching `service-layer/01` §Target API). No `requireClearance` call is needed on this surface.

---

## States

| State | Behaviour | Source |
|---|---|---|
| **Loading** | Server-rendered; no client spinner. `AvatarImage` shows `AvatarFallback` (initials) until photo bytes load — Radix `AvatarImage` handles image load state natively. In E2E test mode the avatar proxy returns 404 (no Blob configured), so `AvatarFallback` is always rendered. | Surface brief §States Loading; `atom-avatar.md §States` |
| **Populated (normal)** | Avatar (photo or initials), display name, RankPill, email line (if `primaryEmail` truthy), Edit button, questionnaire link, sign-out link. | Surface brief §States Populated |
| **Field-level nullability** | No `displayName` → `authUser.primaryEmail` as heading; no `primaryEmail` either → `"Burner"`. Email line omitted entirely when `primaryEmail` is null. No `profileImageUrl` → initials fallback (never blank). | Surface brief §Validation & edge cases |
| **Validation error** | N/A — no form inputs. | — |
| **Submitting / pending** | N/A — no mutations. | — |
| **Success** | N/A — no mutation, no success toast. | — |
| **Disabled** | N/A — no controls are disabled. | — |
| **Gate redirect states** | All gate failures redirect server-side before any render. Unauthenticated → `/auth/sign-in`. No invite → `/signup/required`. `completedAt` null → `/onboarding/questionnaire`. Not approved → `/pending-approval`. Rejected and pending share `/pending-approval` (destination surface differentiates them). | Surface brief §Gate / access states |
| **God-email bypass** | `isGodEmail(primaryEmail)` short-circuits G1 (`hasCampAccess`) and G3 (`isApproved`) regardless of `inviteCode`/`approvalStatus`. Synthetic non-persisted rows (no DB row) get `id: ""` and `inviteCode: null`; `hasCampAccess` returns false → redirect before `id: ""` is used. | Surface brief §Validation & edge cases |
| **E2E test mode** | All server functions route through the in-memory `testStore`. Avatar proxy returns 404 → initials fallback is the expected E2E render. | Surface brief §Validation & edge cases |

---

## Build steps

**Prerequisite gates (from the component and service plans):**

- **Phase 0 — Foundations tokens** (`foundations-tokens.md`): `--radius`, `bg-secondary/25` token-at-alpha form, and the token-spelling short-form codemod must be available for the token fixes below. Low risk — the visual output of existing code is unchanged if foundations land first.
- **Phase 3 — `@camp404/core` extraction** (`architecture.md §Phase 3`): `hasCampAccess`/`isApproved` thin-shim conversion and `initialsFrom` re-home. These are **not blockers** for this surface's own changes — `page.tsx` call-sites stay identical through both phases. The import path for `initialsFrom` updates when Phase 3 lands (separate change).
- **Phase 5 — Badge atom** (`components/atom-badge.md`): `<Badge tone="secondary" variant="soft-tint">` is the target form for the RankPill. Until Badge ships the interim inline `<span>` with the resolved token satisfies the board spec.

### Step 1 — Fix the Avatar size (prerequisite: Phase 0 foundations or standalone)

**Scope:** `apps/web/app/profile/page.tsx` — `Avatar` className only.

Change `h-32 w-32 text-3xl` → `h-24 w-24 text-2xl` (96px per `18-s09-profile-view.txt`).

This is a standalone two-word change with no dependencies. It can ship independently.

**Acceptance criteria:**
- Profile page renders a 96px avatar circle (board-canonical).
- No visual regression on the initials fallback (the text size `text-2xl` = 24px suits a 96px circle).
- `apps/web/app/profile/page.tsx` passes lint clean.

**E2E/test note:** `atom-avatar.md §Build step 3` documents this fix. A visual snapshot or E2E test (`E2E_TEST_MODE` login → `/profile`) should assert the avatar element has class `h-24` and lacks `h-32`.

---

### Step 2 — Token-spelling + container + layout alignment (prerequisite: Phase 0 foundations)

**Scope:** `apps/web/app/profile/page.tsx` — presentation only.

Changes:
1. Container: `max-w-xl` → `max-w-sm` (or `max-w-[430px]`) per board `w:430` + centred layout.
2. `CardContent`: `p-8 gap-4` → `p-7 gap-3.5` (board `pad:28 gap:14`).
3. Name heading: `text-2xl font-bold` is correct per brief (Inter 24px/700); keep.
4. Email line: verbose token `text-[color:var(--color-muted-foreground)]` → `text-muted-foreground`.
5. Sign-out link: verbose token `text-[color:var(--color-muted-foreground)]` → `text-muted-foreground`.
6. Questionnaire link text: remove `underline underline-offset-4` from `<Link>`; apply `text-accent` per brief (the tappable "Review them here" node is `$accent`-coloured, not underlined per board).

**Acceptance criteria:**
- Profile card matches board `18-s09-profile-view.txt`: 28px padding, 14px gap, centred children.
- No verbose `[color:var(--color-NAME)]` token spellings remain in `page.tsx`.
- "Review them here" renders in the accent colour, not underlined.
- `pnpm lint --filter apps/web` clean.

**E2E/test note:** render `page.tsx` in a Playwright E2E (E2E_TEST_MODE) and assert the card container has `max-w-sm`, the email/sign-out links have `text-muted-foreground`, and the questionnaire link has `text-accent`.

---

### Step 3 — RankPill token alignment (prerequisite: Phase 0 foundations; Badge atom optional)

**Scope:** `apps/web/app/profile/page.tsx` — `<span>` on line 55.

**Phase A (interim, ships before Badge atom):**
Replace:
```tsx
// BEFORE
<span className="rounded-full bg-[color:var(--color-secondary)] px-3 py-0.5 text-xs font-semibold text-[color:var(--color-secondary-foreground)]">
  {rankLabel}
</span>
```
With:
```tsx
// AFTER (interim — resolves the RankPill board vs live clash)
<span className="rounded-full bg-secondary/25 px-3 py-0.5 text-xs font-semibold text-secondary-foreground">
  {rankLabel}
</span>
```

Rationale: `foundations-tokens.md §Group C #3` resolves the `#ff008c2e` vs `$secondary` clash. The captain-rank pill (all ranks) resolves to `bg-secondary/25 text-secondary-foreground`. The board's raw hex `#ff008c2e` was the primary tint; reconciled per the token resolution rule, captain-rank pills use the secondary family. This is not the same as the board's raw hex — it is the token-reconciled canonical form.

**Phase B (target, ships with Badge atom — `atom-badge.md §Build step` landed):**
```tsx
<Badge tone="secondary" variant="soft-tint">
  {rankLabel}
</Badge>
```

**Acceptance criteria (Phase A):**
- No `bg-[color:var(--color-secondary)]` in `page.tsx`.
- RankPill renders the resolved token form (`bg-secondary/25 text-secondary-foreground`).
- Both "Captain" and "Member" labels render identically (local ternary unchanged).
- `pnpm lint --filter apps/web` clean.

**E2E/test note:** E2E login as `rank: "captain"` → assert RankPill text is "Captain"; as `rank: "member"` → "Member". No "Team Lead" text must appear on this surface.

---

### Step 4 — Migrate RankPill inline span → `<Badge>` atom (prerequisite: Step 3 Phase A + Badge atom shipped)

Once `atom-badge.md §Build steps` land (Badge atom in `packages/ui`), replace the interim `<span>` from Step 3 with:
```tsx
<Badge tone="secondary" variant="soft-tint">{rankLabel}</Badge>
```

Add the import: `import { Badge } from "@camp404/ui/components/badge"`.

**Acceptance criteria:**
- No inline `<span>` with badge styling for the rank label in `page.tsx`.
- Badge renders with the same visual (secondary/soft-tint).
- TypeScript clean.

---

### Step 5 — `initialsFrom` import path update (prerequisite: Phase 3 `@camp404/core` extraction)

When `apps/web/lib/initials.ts` is extracted to `@camp404/core` (architecture Phase 3, service-layer plan 09), update the import in `page.tsx`:

```ts
// BEFORE
import { initialsFrom } from "@/lib/initials";

// AFTER
import { initialsFrom } from "@camp404/core";
```

**Acceptance criteria:**
- `page.tsx` compiles with the updated import; `@/lib/initials` no longer imported.
- `initialsFrom` behaviour is identical (verified by existing tests moving with the extraction).

---

### Step 6 — `hasCampAccess`/`isApproved` thin-shim validation (prerequisite: Phase 3 `@camp404/core` extraction)

When `apps/web/lib/users.ts` converts `hasCampAccess`/`isApproved` to thin shims delegating to `@camp404/core` (service-layer plan 01 §Build step 3), **no change is required to `page.tsx`** — the call-site signatures `(campUser, authUser.primaryEmail)` are preserved by the shim contract. This step is a verification-only acceptance check:

**Acceptance criteria:**
- `page.tsx` call-sites compile unchanged: `hasCampAccess(campUser, authUser.primaryEmail)` and `isApproved(campUser, authUser.primaryEmail)`.
- Profile-view E2E tests remain green.

---

### Acceptance criteria — integrated (all steps complete)

1. `/profile` renders correctly for an approved member: avatar (96px), display name, RankPill ("Captain" or "Member"), email if present, Edit button, questionnaire link in accent, sign-out hard-nav link.
2. Gate spine redirects: unauthenticated → `/auth/sign-in`; no invite → `/signup/required`; `completedAt` null → `/onboarding/questionnaire`; not approved → `/pending-approval`.
3. In E2E test mode: `AvatarFallback` always rendered (no blob); initials derived from display-name or email; "?" when both null.
4. No verbose `[color:var(--color-NAME)]` token spellings in `page.tsx`.
5. No `h-32 w-32` (128px) avatar class.
6. `pnpm lint --filter apps/web` clean; CI green independently on each step.

**MEMORY (green-CI-is-done):** Steps 1–4 are ordered by dependency but each is independently CI-green. Ship them as separate commits rather than batching — Step 1 (avatar size) and Step 2 (token/layout) are each a small, self-contained change. Step 5 ships with the Phase 3 extraction change (not as a standalone post-green follow-up).

---

## Open items

Cross-reference `design/spec/open-questions.md`:

| # | Item | Severity | Notes |
|---|---|---|---|
| **B8** | **RankPill token** (`#ff008c2e` → named semantic token `$rank-captain-bg` or resolve to `bg-secondary/25`). The foundations token plan (`foundations-tokens.md §Group C #3`) resolves this as `bg-secondary/25`. Step 3 above implements that resolution. No blocking decision needed — the resolution is locked. | low | 07 OQ1 |
| **B29** | **Avatar size discrepancy** (board 96px vs live 128px). Resolved by Step 1 above. | low | 07 OQ2 |
| **D16** | **`completedAt` overwrite on questionnaire replay.** `upsertBurnerProfile` currently unconditionally sets `completed_at = now()` on replay (`db/burner-profile.ts`). If "Review them here" → `/onboarding/questionnaire` triggers a replay that writes a fresh `completedAt`, the original timestamp is lost. **Confirm the runner's replay/review mode does not call `upsertBurnerProfile` / does not reset `completedAt`.** The profile-view surface itself does not write; the risk is in the questionnaire runner (surface 24). | high | 07 OQ4; `db/burner-profile.ts` |
| **D42** | **Navigation chrome / shell membership.** Board draws no `TopChrome` or bottom nav on S09. The live app may supply a shell layout around `/profile`. Confirm whether `/profile` is inside a layout file that renders a bottom-nav tab — if so, the bottom-nav "Profile" tab is external to this surface spec and does not affect this plan. | low | 07 OQ3; open-questions.md E27 |
| **E26** | **Sign-out implementation pattern.** Currently `<a href="/auth/sign-out">` (full navigation, clears session via the route handler). Confirm this remains the intended pattern vs a server action / form POST at build time, particularly if CSRF considerations arise. The surface spec calls for this exact pattern; no change is required unless CSRF policy changes. | low | 07 OQ5; open-questions.md E26 |
