# Approval gate (pending / rejected) — functional brief

- **Route(s):** `/pending-approval`
- **Canonical board(s):** `S06 Approval gate` (board #15, 430×px, `design/.spec-extract/boards/15-s06-approval-gate.txt`)
- **Superseded / dropped:** none — single board, no iterations; no captain-side gate surface is defined here (captain decision UI lives on the roster / camp-management surface)
- **Breakpoints:** mobile-first 430px (board canonical width); `AuthShell` constrains to `max-w-sm` on wider viewports — centred card, no sidebar, no desktop-only layout changes

---

## Purpose

The terminal blocking screen a member sees after they have (a) authenticated, (b) redeemed an invite code whose `requires_approval = true`, and (c) completed burner-profile onboarding — but before a captain has acted on their application.

This surface is a hard dead-end. It carries zero app navigation. Exactly two non-trivial exits exist: a captain flips `approval_status` to `approved` (the gate auto-clears on the next page load) or to `rejected` (the same screen re-renders with terminal copy). The only user-initiated action is "Sign out".

The page re-validates every upstream gate on every request, so it can never be the wrong screen to show.

---

## Layout & modules

Single-column, vertically centred, server-rendered. The root module is `AuthShell` in `hideBack` mode — no back button, no footer. Inside the shell sits one card.

### Card (single module, two variant fills)

`vertical` stack, `gap:18`, `pad:28`, `align: center`, `fill: $card`, `stroke: $border`, `border-radius: $radius`.

Contents (top to bottom):

| Slot | Pending state | Rejected state |
|---|---|---|
| Icon badge | 64×64 circle `fill: #00dcff26`; `clock-3` lucide icon at `$accent` | 64×64 circle `fill: #f83e5a1f`; `shield-x` lucide icon at `$destructive` |
| Heading | "Application submitted" | "Application not approved" |
| Body copy | Personalised thanks (see States) | Terminal explanation |
| Sign-out CTA | `Button-Outline`, `w: fill_container`, label "Sign out" | same |

No other controls, decorations, or nav elements appear on this surface.

---

## Components used

| Name | Role | Key props / variants |
|---|---|---|
| `AuthShell` (`apps/web/components/auth-shell.tsx`) | Centred card chrome — `min-h-svh` container on `$muted` bg, `max-w-sm` card wrapper | `hideBack={true}`, no `footer` prop |
| `Button-Outline` (design component → `@camp404/ui/components/button`) | Sign-out escape link | `variant="outline"`, `asChild`, `className="w-full"`, wraps `<a href="/auth/sign-out">` |
| Lucide `Clock` (`clock-3` in Pencil) | Pending state icon | `h-7 w-7`, `aria-hidden`, colour `$accent` (board) / `text-amber-400` (live code — token divergence noted below) |
| Lucide `ShieldX` (`shield-x` in Pencil) | Rejected state icon | `h-7 w-7`, `aria-hidden`, colour `$destructive` |

No new reusable components are introduced by this surface.

---

## States

### Global state matrix — mapped to this surface

| State | Applies? | Treatment |
|---|---|---|
| **Loading** | Implicit only | Server-render awaits auth + DB; no skeleton/spinner — page arrives complete |
| **Empty** | No | No collection; fixed message per branch |
| **Populated: pending** | Yes — primary state | Clock icon (amber), "Application submitted", personalised copy |
| **Populated: rejected** | Yes — terminal state | ShieldX icon (destructive), "Application not approved", terminal copy |
| **Validation-error** | No | No form or input on this page |
| **Submitting** | No | No submit action; prior submission (questionnaire) was upstream |
| **Success** | Represented by absence | `isApproved` → `redirect("/")`. No on-screen banner; success = page is never shown again |
| **Disabled** | No | Single "Sign out" control is always active |
| **Invite-gated** | Actively handled | `!hasCampAccess` → `redirect("/signup/required")` before this screen renders |
| **Onboarding-incomplete** | Actively handled | `!profile?.completedAt` → `redirect("/onboarding/questionnaire")` |
| **Pending-approval** | Primary populated state | See pending branch below |
| **Rejected** | Terminal populated state | See rejected branch below; no further transition offered to the user |
| **Preview-but-locked (CaptainLock)** | Not applicable | This screen has no rank-gated sections; it is a pre-access gate entirely outside the authenticated app shell |

### Pending branch (primary)

Condition: `approvalStatus === "pending"` (and all upstream gates passed).

- Badge: 64×64 circle, `bg: #00dcff26`; icon `Clock` (`$accent` / `text-amber-400`), `aria-hidden`.
- Heading: `"Application submitted"` — `Inter / 18px / 700 / $card-foreground`.
- Body: `"Thanks[, {displayName}] — your profile is in. A captain needs to approve your access before you can use the rest of the app. We'll let you in as soon as they do; just check back here."` — `Inter / 13px / normal / $muted-foreground`. The name segment `, {displayName}` is included only when `campUser.displayName` is non-null; otherwise the greeting reads `"Thanks —"`.
- Sign-out button: `Button-Outline`, full width, label `"Sign out"`, `href="/auth/sign-out"`.

### Rejected branch (terminal)

Condition: `approvalStatus === "rejected"` (and all upstream gates passed).

- Badge: 64×64 circle, `bg: #f83e5a1f`; icon `ShieldX` (`$destructive`), `aria-hidden`.
- Heading: `"Application not approved"` — `Inter / 18px / 700 / $card-foreground`.
- Body: `"A captain has reviewed your application and it wasn't approved for camp access this time. If you think this is a mistake, reach out to whoever invited you."` — `Inter / 13px / normal / $muted-foreground`.
- Sign-out button: identical to pending branch.

No in-app appeal, re-apply, or retry affordance. The guidance is text-only.

---

## User actions

| Action | Result |
|---|---|
| Tap "Sign out" | Navigate to `/auth/sign-out` (Neon Auth hosted sign-out — `apps/web/app/auth/[path]/page.tsx` catch-all). Plain anchor, no client JS. |
| Reload / "check back here" | Full RSC server round-trip; if a captain has since approved, `isApproved` is true → `redirect("/")`. If captain rejected since last load, `rejected = true` → same screen re-renders with rejected copy. No client polling, no WebSocket, no auto-refresh. |

No other interactions exist on this surface.

---

## Data & enums

### Fields read (all from `packages/db/src/schema.ts`)

| Field | Table | Type | Notes |
|---|---|---|---|
| `approval_status` | `users` | `approvalStatusEnum` — `"pending" \| "approved" \| "rejected"` | THE field this surface branches on |
| `display_name` | `users` | `text` nullable | Interpolated into pending greeting |
| `invite_code` | `users` | `text` nullable | `hasCampAccess` check: null + non-god → redirect `/signup/required` |
| `auth_user_id` | `users` | `text` notNull unique | How `ensureCampUser` finds the row |
| `id` | `users` | `uuid` PK | Used as `campUser.id` for `getBurnerProfile` lookup |
| `completed_at` | `burner_profiles` | `timestamp` nullable | Falsy → redirect `/onboarding/questionnaire` |
| `approval_decided_by_user_id` | `users` | `uuid` nullable, self-FK | Audit stamp (set by captain action, not read by this surface) |
| `approval_decided_at` | `users` | `timestamp` nullable | Audit stamp (set by captain action, not read by this surface) |

### Enums

- **`approvalStatusEnum` (`approval_status`)** = `["pending", "approved", "rejected"]` (schema.ts:41–45). `notNull().default("approved")` — god and pre-gate accounts are approved by default; only a `requiresApproval` redeemer is created `pending`.
- **`rankEnum` (`rank`)** = `["captain", "member"]` (schema.ts:31). Not directly gated on by this surface — approval status keys the gate, not rank. A `captain`-ranked user can be `pending`/`rejected` and will be held here.

### Upstream switch (read-only reference)

- `invite_codes.requires_approval` — boolean, `notNull().default(false)` (schema.ts:336). The switch that put the user into `pending`. Not touched by this surface; set at redemption time.

### Captain decision (off-surface)

- `decideApprovalAction(userId, "approved" | "rejected")` in `apps/web/app/captains/camp-management/actions.ts` — the only non-sign-out exit. Captain-gated, cannot self-decide, stamps `approval_decided_by_user_id` + `approval_decided_at`. Lives on the camp-management surface (unit covering roster).

### Nothing is NEW

No schema changes, no new tables, no new enums. All fields are existing. The `captain_promotion_requests` table and `promotion_request_status` enum (Decision #4) are unrelated to this surface.

---

## Validation & edge cases

- **Gate re-validation order matters:** `hasCampAccess` → `isApproved` → `profile?.completedAt`. All three are re-evaluated on every server request. A user cannot reach the pending/rejected render unless all three are in the expected state.
- **Auto-clear on approval:** `isApproved` short-circuits to `redirect("/")` (page.tsx:36–38). No client-side refresh logic needed — a captain approving is reflected on the very next page load.
- **Rejected is terminal for the user:** no in-app re-apply button. The only way out of `rejected` is: a captain re-decides via `decideApprovalAction` (there is no guard preventing `rejected → approved`), or the user signs out.
- **Re-entry via a vetting code:** a `rejected` user who redeems a second `requiresApproval` code is moved back to `pending` (`redeemInviteForUser` sets `pending` when `status !== "pending"`, which includes `rejected`). This is a supported re-entry path — no special UI treatment needed on this surface.
- **Synthetic-row safety:** a signed-in user with no DB row gets a synthetic `CampUser` with `id: ""` and `inviteCode: null`. `hasCampAccess` returns false → redirect to `/signup/required` before the empty ID is ever used. No orphan write occurs.
- **God accounts never appear here:** always `isApproved` (short-circuit on `isGodEmail`) and `hasCampAccess` even with `inviteCode: null`.
- **Page metadata stale on rejected branch:** `metadata.title` is hardcoded `"Application pending — Camp 404"` regardless of branch. Not user-visible in-app; minor stale-truth to carry forward.
- **No polling/realtime:** the copy ("just check back here") makes manual reload the expected check mechanism. No countdown, no SSE, no WebSocket. Intentional product decision.
- **No offline/budget states:** not applicable per product contract.
- **E2E_TEST_MODE:** real DB not drivable; `POST /api/test/set-approval` forces `approvalStatus` via `testStore.setUserApprovalStatus`. The route 404s unless `isE2ETestMode()` — never user-reachable in production.

---

## Flows

```
[User authenticated + invite redeemed (requiresApproval) + onboarding complete]
  → load /pending-approval
    ├─ !hasCampAccess          → redirect /signup/required
    ├─ isApproved              → redirect /  (captain approved since last load)
    ├─ !profile?.completedAt   → redirect /onboarding/questionnaire
    └─ else (pending|rejected) → render card
         ├─ pending  → Clock badge + "Application submitted" + personalised copy
         └─ rejected → ShieldX badge + "Application not approved" + terminal copy

[Captain acts on camp-management surface]
  decideApprovalAction(userId, "approved"|"rejected")
    → stamps approval_status + audit fields
    → revalidatePath("/captains/camp-management")
    → user's next load of /pending-approval:
         approved  → isApproved = true → redirect /
         rejected  → rejected branch renders

[User taps "Sign out"]
  → <a href="/auth/sign-out"> → Neon Auth hosted sign-out
  → session cleared → redirected to / → unauthenticated → landing page
```

---

## Divergences from feature-set reference — and resolution

| # | Feature-set unit (05-pending-approval.md) | Board (S06) | Resolution |
|---|---|---|---|
| 1 | Icon badge sized `14×14` rounded-full with `7×7` icon (page.tsx measurements) | Badge `64×64`, icon implied ~28px (h-7 w-7 = 28px) | **Board wins.** The feature-set numbers are Tailwind rem classes misread as px; 64px circle with h-7 w-7 icon is correct. |
| 2 | Pending icon colour: `bg-amber-500/15 text-amber-400` (literal Tailwind, noted as the one amber escape) | Board: `fill: #00dcff26`, icon `$accent` (cyan) | **Flag as build divergence.** Board uses cyan accent; live code ships amber. Accept the board's intent (`$accent` = cyan family) as canonical; the amber pair in live code is a drift. Resolve to `$accent` / `$accent/15` when restyling — emit token fix in the token reconciliation pass. |
| 3 | `AuthShell` described with `Card > CardContent` interior | Board draws a plain card container (rect with $card fill and $border stroke) | Consistent — `AuthShell` renders a `Card` + `CardContent`; matches board intent. No action. |
| 4 | Feature-set names the Neon Auth sign-out path and `apps/web/app/auth/[path]/page.tsx` fallback | Board simply labels the button "Sign out" | Board is silent on the route; feature-set detail is correct. Carry forward the `/auth/sign-out` target as specified. |
| 5 | Feature-set documents the test seam (`POST /api/test/set-approval`) | Board has no awareness of test infrastructure | Board is a design artefact; test seam is an implementation detail. Carry forward from feature-set as a build-reconciliation note only. |

---

## Open questions / build reconciliations

- **Token drift — amber vs cyan on pending badge:** live code uses `bg-amber-500/15 text-amber-400`; board specifies `fill:#00dcff26` / `$accent` (cyan). The board is canonical. At restyle, replace the amber pair with `bg-accent/15 text-accent` (or equivalent semantic token). Confirm `$accent` resolves to the cyan family (`#00dcff` region) in the global token pass.
- **`metadata.title` always reads "Application pending"** regardless of rejected branch. Minor stale-truth in the existing implementation; not user-facing in-app. Fix or carry as known: change to a neutral `"Camp access — Camp 404"` or branch conditionally.
- **Re-entry via rejected + vetting code:** `redeemInviteForUser` moves `rejected → pending` (since `rejected !== "pending"`). No UI affordance exists for this path. Confirmed supported; no additional screen needed. Worth a comment in the captain-management spec (the captain may see a previously-rejected user re-appear in the queue).
- **Captain cannot appear here via rank alone:** a `captain`-ranked user with `approvalStatus: "pending"` is legitimately held on this page. The captain's tools surface (Decision #3: preview-but-locked) is irrelevant here — this gate precedes app entry entirely.
- **No realtime push on approval:** when a captain approves, the user sees nothing until they reload. Consider a future enhancement (push notification, SSE) — not in scope for this surface; leave as a forward note.
