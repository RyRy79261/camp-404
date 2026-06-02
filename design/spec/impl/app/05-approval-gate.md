# 05-approval-gate — app integration plan

- **Route(s):** `/pending-approval` — routed page
- **Spec:** `design/spec/surfaces/05-approval-gate.md`
- **Board:** S06 Approval gate (board #15, `design/.spec-extract/boards/15-s06-approval-gate.txt`)
- **Auth tier:** pre-access gate; sits outside the authenticated app shell; no `CaptainLock`

---

## Current state — the existing route/files today

All confirmed by direct file inspection.

| File | Role today | Status |
|---|---|---|
| `apps/web/app/pending-approval/page.tsx` | Server component (RSC, `force-dynamic`). Chains `getAuthenticatedUserOrRedirect` → `ensureCampUser` → 3 redirect guards → pending/rejected branch render inside `<AuthShell hideBack>`. | **EXISTS — EXTEND** |
| `apps/web/components/auth-shell.tsx` | `"use client"` chrome wrapper. Used by 4 surfaces including this one (`pending-approval/page.tsx:49`). | **EXISTS — REUSE (with token fixes from `organism-authshell.md`)** |
| `apps/web/app/api/test/set-approval/route.ts` | E2E test seam: `POST /api/test/set-approval` forces `approvalStatus` via `testStore.setUserApprovalStatus`. 404s unless `isE2ETestMode()`. | **EXISTS — REUSE** |

No other files under `apps/web/app/pending-approval/` exist today (confirmed `find` output: single `page.tsx`). No server actions, no client islands, no separate layout, no error/not-found boundaries — and the redesign introduces none.

### What the current page does (verified line-by-line, `page.tsx:1-92`)

1. `getAuthenticatedUserOrRedirect()` — redirects unauthenticated users.
2. `ensureCampUser(authUser)` — resolves or creates the `CampUser` row.
3. `hasCampAccess(campUser, authUser.primaryEmail)` falsy → `redirect("/signup/required")` (`:32-34`).
4. `isApproved(campUser, authUser.primaryEmail)` truthy → `redirect("/")` (`:36-38`).
5. `getBurnerProfile(campUser.id)` + `!profile?.completedAt` → `redirect("/onboarding/questionnaire")` (`:41-44`).
6. Branches on `campUser.approvalStatus === "rejected"` (`:46`).
7. Renders `<AuthShell hideBack>` wrapping a `div.flex-col` containing:
   - A conditional `div` (`:53-63`) — `h-14 w-14 rounded-full` with `bg-destructive/10 text-destructive` (rejected) or `bg-amber-500/15 text-amber-400` (pending). Contains `<ShieldX>` or `<Clock>` with `aria-hidden`.
   - Conditional `div.flex-col.gap-2` (`:65-84`) — `<h1>` heading + `<p>` body copy, personalised name only in pending branch.
   - `<Button asChild variant="outline" className="w-full"><a href="/auth/sign-out">Sign out</a></Button>` (`:86-88`).

### What the redesign changes

The surface is already functionally correct — every gate, branch, copy string, and sign-out link matches the spec exactly. The redesign delta is **presentational/token-only**:

1. **Icon badge**: replace the inline `div` (`:53-63`) with `<IconBadge>` from `@camp404/ui` (PROMOTE, `atom-iconbadge.md`). Fixes the amber token drift (pending icon: `bg-amber-500/15 text-amber-400` → `tone="warning"` once `--color-warning` lands, or `tone="accent"` as a temporary placeholder — see Open items). Rejected icon: `bg-destructive/10` → `tone="destructive"`. Size: `size="lg"` (60 px, snaps the board's 64 px circle). Shape: `shape="circle"`.
2. **Typography/token cleanup**: `text-2xl font-bold` (`:67,75`) → `text-lg font-bold` (spec: `Inter / 18px / 700`). `text-[color:var(--color-muted-foreground)]` arbitrary-value escape (`:68,78`) → `text-muted-foreground`. `text-balance text-sm` body copy aligns with `--text-body` (`Inter / 13px / normal`) — confirm once type-scale tokens land.
3. **`metadata.title`** is hardcoded `"Application pending — Camp 404"` regardless of branch (`:16-18`). The redesign makes this a static server component export and cannot branch on runtime state at the module level in Next App Router. Carry the known stale-truth or neutralise to `"Camp access — Camp 404"` — see Open items.
4. The gate order, redirect logic, and service calls are **unchanged**. No new server actions, no new API routes, no new client islands.

---

## File structure — target files in apps/web

| File | vs today | Action |
|---|---|---|
| `apps/web/app/pending-approval/page.tsx` | Exists | **MODIFY** — swap inline icon-badge div for `<IconBadge>`; fix typography tokens; optionally neutralise `metadata.title` |
| `apps/web/components/auth-shell.tsx` | Exists, shared | **REUSE** — token-only fixes tracked in `organism-authshell.md` Step 1; no change required specifically for this surface |
| `apps/web/app/api/test/set-approval/route.ts` | Exists | **REUSE** — no changes; the E2E seam is already correct |

No files to CREATE or DELETE. No new `layout.tsx`, `error.tsx`, `not-found.tsx`, `loading.tsx`, or `"use client"` islands are introduced by this surface. The page remains a pure RSC.

---

## Components composed

All are `apps/web` server-side (RSC passes children through the `"use client"` boundary to `AuthShell`):

| Component | Plan | Where rendered | Current vs redesign |
|---|---|---|---|
| `AuthShell` (app-local `"use client"`) | [`organism-authshell.md`](../components/organism-authshell.md) | Wraps the entire page body; `hideBack` prop suppresses Back button, no `footer` prop. | REUSE; token fixes from authshell plan are shared infra, not surface-specific. |
| `IconBadge` (`@camp404/ui`) | [`atom-iconbadge.md`](../components/atom-iconbadge.md) | Inside the `AuthShell` children; inline server JSX. **NEW** — replaces the hand-rolled conditional `div` at `page.tsx:53-63`. | CREATE then replace: `<IconBadge size="lg" shape="circle" tone={rejected ? "destructive" : "warning"} icon={rejected ? ShieldX : Clock} />` |
| `Button` (`@camp404/ui/components/button`) | [`atom-button.md`](../components/atom-button.md) | Sign-out CTA at `page.tsx:86-88`; `variant="outline"`, `asChild`, `className="w-full"`, wraps `<a href="/auth/sign-out">`. | REUSE; button receives token/radius fixes from `atom-button.md` Steps 1-3 as shared infra. |
| Lucide `Clock` / `ShieldX` | N/A (leaf icon, no plan) | Passed as `icon` prop to `IconBadge`; `aria-hidden` is handled inside `IconBadge`. | REUSE icons; `aria-hidden` moves from explicit JSX prop to `IconBadge` internals. |

**No organisms or molecules beyond `AuthShell`.** This surface has no forms, no data tables, no filtering, no navigation. The card body is static server JSX. `CaptainLock` is explicitly not applicable (see Gating below).

---

## Services & data

All I/O happens server-side in the page component. No props are passed down to client islands (there are none).

| Symbol | Source | How used | Server vs client |
|---|---|---|---|
| `getAuthenticatedUserOrRedirect()` | `apps/web/lib/auth.ts:127` | Resolves the Neon Auth session; redirects unauthenticated users to `/auth/sign-in`. | Server — `next/headers`, `next/navigation`. Stays. |
| `ensureCampUser(authUser)` | `apps/web/lib/users.ts:60` | Resolves or synthetic-creates the `CampUser` row for the auth user. | Server — DB + test-backend split. Stays. |
| `hasCampAccess(campUser, authUser.primaryEmail)` | `apps/web/lib/users.ts:219` (thin shim after Phase 3 extraction) | G1 gate — `false` → `redirect("/signup/required")`. Pure logic; after Phase 3 extraction the shim calls `core.hasCampAccess(campUser, isGodEmail(email))`. | Server. |
| `isApproved(campUser, authUser.primaryEmail)` | `apps/web/lib/users.ts:231` (thin shim after Phase 3) | G3 gate — `true` → `redirect("/")`. Pure logic; same extraction path as `hasCampAccess`. | Server. |
| `getBurnerProfile(campUser.id)` | `apps/web/lib/users.ts:162` | G2b burner-profile legacy fallback — `!completedAt` → `redirect("/onboarding/questionnaire")`. Fetches from `packages/db/src/burner-profile.ts` (`getBurnerProfileByUserId`). | Server — DB read + test-backend split. |
| `campUser.approvalStatus` | `CampUser.approvalStatus` field (from `users.ts:39`, `packages/db/src/schema.ts:267`) | Branches on `"rejected"` vs `"pending"` to select the icon/heading/copy variant. | Server — field already on the resolved `CampUser`; no extra DB fetch. |
| `campUser.displayName` | `CampUser.displayName` field (nullable) | Personalised greeting in pending branch: `, {displayName}` only when non-null. | Server — same `CampUser` object. |

**Nothing is fetched client-side.** There are no `useEffect`, `fetch`, or SWR calls. The page arrives complete from the server.

**No server actions on this surface.** The only action is sign-out, which is a plain `<a href="/auth/sign-out">` — a native navigation to the Neon Auth hosted sign-out endpoint (`apps/web/app/auth/[path]/page.tsx`), with no form submission, no `"use server"` function, and no client JS.

### Phase 3 shim note

After `service-layer/01-identity-access-gating.md` Phase 3 lands, `hasCampAccess` and `isApproved` in `apps/web/lib/users.ts` become thin wrappers over `core.hasCampAccess` / `core.isApproved`. The call-sites in `pending-approval/page.tsx` are unchanged (`(campUser, authUser.primaryEmail)` signature is preserved by the wrapper contract). This surface does not drive or block that extraction.

---

## Gating

**Gate level: G3 approval-status gate.** This surface IS the G3 holding screen, not a consumer of rank-based gating.

Gate re-validation order on every request (confirmed `page.tsx:28-44`):

```text
getAuthenticatedUserOrRedirect()  →  unauthenticated → redirect /auth/sign-in
hasCampAccess(campUser, email)    →  false           → redirect /signup/required   (G1)
isApproved(campUser, email)       →  true            → redirect /                  (G3 cleared)
!profile?.completedAt             →  true            → redirect /onboarding/questionnaire  (G2b)
else → render pending or rejected branch
```

**`CaptainLock` is NOT applicable here.** Confirmed in `surfaces/05-approval-gate.md §States`: "Not applicable — This screen has no rank-gated sections; it is a pre-access gate entirely outside the authenticated app shell." This surface sits before any rank concept is relevant — a `captain`-ranked user with `approvalStatus: "pending"` is legitimately held here. The preview-but-locked mechanism (`requireClearance` + `CaptainLock`) applies only to rank-gated sections inside the authenticated app, not to pre-access gates.

**No `requireClearance` call.** No `ViewerRank` derivation. No `CaptainLock` organism. No `ControlPanel`.

---

## States

| State | Treatment |
|---|---|
| **Loading** | Implicit only. `force-dynamic` RSC awaits all DB reads server-side; page arrives complete — no skeleton or spinner rendered. |
| **Pending (primary)** | `campUser.approvalStatus === "pending"`: `IconBadge tone="warning" icon={Clock}` + heading "Application submitted" + personalised body copy (name interpolation when `displayName` non-null). |
| **Rejected (terminal)** | `campUser.approvalStatus === "rejected"`: `IconBadge tone="destructive" icon={ShieldX}` + heading "Application not approved" + fixed terminal body copy. |
| **Auto-cleared on approval** | `isApproved` true → `redirect("/")` before render. No on-screen success state; success = page is never shown. |
| **Unauthenticated** | `getAuthenticatedUserOrRedirect()` redirects before this component runs. |
| **No invite / god bypass** | `hasCampAccess` false → `redirect("/signup/required")`. God accounts always bypass via `isGodEmail` short-circuit. |
| **Onboarding incomplete** | `!profile?.completedAt` → `redirect("/onboarding/questionnaire")`. |
| **Synthetic-row safety** | `id: ""` + `inviteCode: null` → `hasCampAccess` false → redirect before empty ID is used. |
| **Empty** | N/A — no collection or list on this surface. |
| **Submitting / validation error** | N/A — no form. |
| **Disabled** | N/A — sign-out link is always active; no disableable control. |
| **Preview-but-locked (CaptainLock)** | Not applicable — see Gating. |
| **`metadata.title` stale on rejected branch** | `metadata` is a static Next export; it cannot branch on runtime `approvalStatus`. The title reads "Application pending — Camp 404" in both branches. This is a known stale-truth; see Open items for the two resolution options. |

---

## Build steps

### Prerequisites (must land before this surface's MODIFY step)

| Prerequisite | Plan | Why required |
|---|---|---|
| **Phase 0 — Foundations: status tokens** | `foundations-tokens.md §1.1` | `--color-warning` + `--color-warning-foreground` must exist in `globals.css @theme` before `IconBadge tone="warning"` ships. If this surface is built before the token PR, use `tone="accent"` as a temporary placeholder and add a `TODO(warning-token)` comment. |
| **`atom-iconbadge.md` Steps 1-4** | `atom-iconbadge.md` (PROMOTE) | `IconBadge` component must exist in `packages/ui` and be exported before `pending-approval/page.tsx` can import it. `atom-iconbadge.md §Build steps Step 7` names this surface as its absorb target. |
| **`atom-button.md` Steps 1-3** | `atom-button.md` (REUSE) | Radius/weight/outline-colour fixes land on the shared primitive; `pending-approval` inherits them automatically — no surface-specific work, but the acceptance check for this surface references a corrected Button. |
| **`organism-authshell.md` Step 1** | `organism-authshell.md` (PROMOTE/REUSE) | Token-cleanup pass (`bg-muted`, `text-muted-foreground`) in the shared chrome. This surface inherits it; no surface-specific change. |
| **Phase 3 `hasCampAccess`/`isApproved` extraction** | `service-layer/01-identity-access-gating.md` Step 3 | The thin-shim extraction keeps the call-site signature identical; this surface compiles without edits. Not blocking (current direct call still works), but the extraction should land before this surface's MODIFY so the final file already uses the shim. |

### Step 1 — MODIFY `apps/web/app/pending-approval/page.tsx`

**What changes:**

1. Import `IconBadge` from `@camp404/ui/components/icon-badge` (once `atom-iconbadge.md` Steps 1-2 land). Remove the inline conditional-`div` (`:53-63`).

2. Replace the inline icon-badge div with:
   ```tsx
   <IconBadge
     size="lg"
     shape="circle"
     tone={rejected ? "destructive" : "warning"}
     icon={rejected ? ShieldX : Clock}
   />
   ```
   Note: if `--color-warning` has not landed yet, use `tone="accent"` for the pending state with a `// TODO(warning-token): switch to "warning" once foundations token PR lands` comment.

3. Fix heading typography: `text-2xl font-bold` → `text-lg font-bold` (spec: `Inter / 18px / 700`; `text-lg` = 18px, `font-bold` = 700).

4. Fix body copy token escape: `text-[color:var(--color-muted-foreground)]` → `text-muted-foreground` (both branches, `:68` and `:78`).

5. (Optional) Neutralise `metadata.title`: change `"Application pending — Camp 404"` to `"Camp access — Camp 404"` — see Open items for the design/product decision.

6. Remove now-redundant direct Lucide icon size props from the JSX body (icon sizing moves inside `IconBadge`). Keep the `Clock` and `ShieldX` imports — they are passed as `icon` props to `IconBadge`.

**Acceptance criteria:**
- `pnpm build --filter apps/web` green.
- `pnpm lint --filter apps/web` clean (no `bg-amber-500/15`, no `text-amber-400`, no `bg-destructive/10`, no `[color:var(...)]` in this file).
- Visual: pending state shows a 60 px cyan/warning circle with Clock icon; rejected state shows a 60 px destructive circle with ShieldX icon. Both match the board-canonical shapes (S06, board #15).
- Gate chain unchanged: sign in as a user with `approvalStatus: "pending"` + completed profile → lands on this page; sign in as `approvalStatus: "approved"` → redirects to `/`.

### Step 2 — E2E test seam verification

**What to verify:**

Confirm `apps/web/app/api/test/set-approval/route.ts` remains correct and reachable under `E2E_TEST_MODE`. No code change required.

E2E test scenario (for the test suite that drives this surface):

1. Authenticate a test user with `approvalStatus: "pending"` (via `POST /api/test/set-approval`).
2. Load `/pending-approval` → assert HTTP 200; assert pending heading "Application submitted" in DOM; assert Clock icon present; assert no ShieldX.
3. `POST /api/test/set-approval` with `status: "rejected"` for the same user.
4. Reload `/pending-approval` → assert rejected heading "Application not approved" in DOM; assert ShieldX present; assert no Clock.
5. `POST /api/test/set-approval` with `status: "approved"`.
6. Load `/pending-approval` → assert redirect to `/` (HTTP 307/308 or final URL is `/`).
7. Sign out via link → assert navigation to `/auth/sign-out`.

**`E2E_TEST_MODE` seam:** `testStore.setUserApprovalStatus(user.id, status)` — confirmed wired in `route.ts:41`. The user row must exist (created on first authenticated page load via `ensureCampUser`). The test must authenticate the user first.

**Acceptance criteria:**
- Scenarios 1-7 pass in the E2E suite.
- `POST /api/test/set-approval` returns 404 when `isE2ETestMode()` is false (production guard confirmed at `route.ts:19-21`).

### Step 3 — Typography regression check (deferred to foundations pass)

Once `foundations-tokens.md` Phase 0 lands (type-scale tokens `--text-body`, `--text-body-strong`, `--text-heading-sm`), verify that the body copy `text-sm` and heading `text-lg font-bold` align with the token-correct classes. If the foundations plan introduces utility aliases, update `pending-approval/page.tsx` in that PR rather than as a separate step — both changes are cosmetic and can travel together.

**Acceptance criteria (deferred):** no arbitrary-value font/size classes remain in `pending-approval/page.tsx`; heading renders at 18px/700; body at 13px/400.

---

## Open items

1. **Token drift — amber vs cyan on pending badge (OQ from `surfaces/05-approval-gate.md §Open questions`).**
   Live code: `bg-amber-500/15 text-amber-400`. Board S06: `fill: #00dcff26 / $accent` (cyan). The board is canonical. `atom-iconbadge.md §Tokens` maps `#00dcff26` to `accent/15%` and notes that the amber live code becomes `warning` once `--color-warning` lands (`foundations-tokens.md` reconciliation #15). Resolution path:
   - **If `--color-warning` token lands before this surface's Step 1:** use `tone="warning"` directly — `bg-warning/15 text-warning`.
   - **If this surface's Step 1 lands before foundations P0-2:** use `tone="accent"` as placeholder, add `// TODO(warning-token)` comment, update in foundations PR.
   **Decision owner: design** (confirm whether pending-approval reads as amber/warning or cyan/accent — the board and live code disagree; `atom-iconbadge.md` resolves to `warning` via the amber normalisation in reconciliation #15).

2. **`metadata.title` stale on rejected branch (`surfaces/05-approval-gate.md §Edge cases`).** `export const metadata = { title: "Application pending — Camp 404" }` is a static module-level export; Next App Router does not support dynamic `metadata` exports from async server components in this form without `generateMetadata`. Options:
   - **Option A** (minimal): change to a neutral `"Camp access — Camp 404"` — avoids the stale-truth without branching. One-line change, no API surface impact.
   - **Option B** (spec-correct): convert to `export async function generateMetadata()` that reads the session and returns branch-specific titles (`"Application pending — Camp 404"` vs `"Application not approved — Camp 404"`). Requires an extra auth call on metadata resolution; adds complexity for a non-user-visible field.
   - **Recommendation:** Option A. The title is only visible in browser tab text and `<title>` tag, not in the UI. Option B is over-engineering for a non-user-facing field.
   **Decision owner: product** (confirm acceptable title text).

3. **Board canonical size: 64 px; `IconBadge lg` = 60 px.** The spec (`surfaces/05-approval-gate.md §Divergences #1`) confirms the board's 64 px is canonical; `atom-iconbadge.md` normalises all 56/60/64 px circles to `size="lg"` (60 px) with the note "the difference is imperceptible on mobile." This is a pre-resolved divergence — `size="lg"` is correct; no further action.

4. **Re-entry via rejected + vetting code.** `redeemInviteForUser` moves `rejected → pending` when `status !== "pending"` (confirmed `users.ts:111`). A previously-rejected user who redeems a second `requiresApproval` code re-appears in the pending queue. This surface needs no special UI treatment — on their next load of `/pending-approval`, `approvalStatus` will be `"pending"` and the pending branch renders. No code change required here; a comment in the captain-management plan (the captain may see a previously-rejected user re-appear) is the appropriate forward note.

5. **No realtime push on approval.** When a captain approves, the member sees nothing until they reload. The copy "just check back here" is the designed check mechanism. This is a confirmed product decision (no SSE, no WebSocket, no polling) per `surfaces/05-approval-gate.md §User actions`. Forward note only: a future push notification on approval would use the platform push service (`service-layer/04-broadcasts-notifications-push.md`) and would not change this surface's markup.
