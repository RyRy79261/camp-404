# Profile view — functional brief

- **Route(s):** `/profile`
- **Canonical board(s):** `S09 Profile view` (board #18, 430×-, `design/.spec-extract/boards/18-s09-profile-view.txt`)
- **Superseded / dropped:** none — single board, no iterations
- **Breakpoints:** mobile-first 430px (canonical board size); no desktop variant drawn; content is a centred card that naturally scales via `max-w-sm` or equivalent container constraint

---

## Purpose

The "this is me" terminal view for the signed-in, fully-onboarded, captain-approved camp member. A purely read-only card surface — no form fields, no mutations. Proves the viewer has cleared every gate (auth → invite → burner-profile-complete → captain-approved). Exposes exactly three navigations: edit profile, review questionnaire answers, and sign out. The surface is server-rendered and always dynamic; it is never statically cached.

---

## Layout & modules

Single-column, vertically centred layout (`jc:center ai:center`) with 20px horizontal padding on the 430px canvas. Contains one **Profile Card** module — there are no other structural zones.

### Profile Card

A `$card`-fill container with `$border` stroke, `$radius` rounding, 28px padding, 14px gap between its vertically stacked children, all children centre-aligned.

Children in order:

1. **Avatar** — 96×96px circle (`r:999`), `$secondary` fill. Renders the member's uploaded photo when `profileImageUrl` is set; falls back to two-letter initials (`$secondary-foreground`, Inter 32px/700) derived by `initialsFrom()`. Never blank — `initialsFrom` returns `"?"` on unusable input.
2. **Display name** — Inter 24px/700, `$foreground`. Resolved as `displayName ?? primaryEmail ?? "Burner"`.
3. **RankPill** — inline pill (`r:999`, `pad:[4,12]`, `#ff008c2e` fill, `$primary` text, Inter 12px/600). Label is `"Captain"` or `"Member"`. "Team Lead" is NOT shown — a member who leads a team renders "Member" (see Divergences).
4. **Email line** — Inter 14px/normal, `$muted-foreground`. Rendered only when `primaryEmail` is truthy; omitted entirely when null.
5. **Edit profile button** — full-width primary CTA (`w:fill_container`, `pad:[13,22]`, `$primary` fill, `$primary-foreground` text, Inter 15px/600). Pencil icon (Lucide, `$primary-foreground`) left of label "Edit profile". Navigates to `/profile/edit`.
6. **Questionnaire prompt** — two text nodes (board models them as separate `T` nodes, live code renders inline): "Want to update your burner questionnaire answers?" (Inter 13px/normal, `$muted-foreground`) + "Review them here" (Inter 13px/normal, `$accent`). The second node is the tappable link; navigates to `/onboarding/questionnaire`.
7. **Sign out** — Inter 14px/500, `$muted-foreground`. Plain text-link styled; triggers a hard navigation to `/auth/sign-out` (NOT a client-side route transition — must not be a Next.js `<Link>`).

---

## Components used

| Name | Kind | Role | Key props / notes |
|---|---|---|---|
| `Avatar` / `AvatarImage` / `AvatarFallback` | existing — `packages/ui/src/components/avatar.tsx` | Circular photo container with initials fallback | Size override `h-24 w-24` (board 96px); `AvatarImage src={profileImageUrl}` rendered only when truthy; `AvatarFallback` always present |
| `Card` / `CardContent` | existing — `packages/ui/src/components/card.tsx` | Profile card container | `Card` adds `overflow-hidden`; `CardContent` overridden to `flex flex-col items-center gap-4 p-7 text-center` (board 28px pad, 14px gap) |
| `Button` (`asChild`) | existing — `packages/ui/src/components/button.tsx` | Edit-profile CTA link rendered as primary button | `variant="default"`, `size="default"`, wraps `<Link href="/profile/edit">`; className adds `w-full gap-2` + Pencil icon |
| **RankPill** | new — inline `<span>` | Rank badge | `rounded-full`, `bg-[#ff008c2e]`, `text-[var(--color-primary)]`; no shared Badge primitive exists; local inline span |

No shared `TopChrome`, `DetailHeader`, `SectionHeader`, or `CaptainLock` are used on this surface. The board lists no reusable component instances for S09, and the surface predates the app's navigation chrome (accessed post-login, no top bar drawn on this board).

---

## States

### Global state matrix

| State | Behaviour |
|---|---|
| **Loading** | Server-rendered; no client loading spinner. `AvatarImage` shows `AvatarFallback` (initials) until the proxied photo bytes load — Radix `AvatarImage` handles this natively. |
| **Populated (normal)** | Avatar (photo or initials), display name, rank badge, email (if present), Edit button, questionnaire link, sign-out link. |
| **Empty** | Not a list surface; no zero-row empty state. Field-level nullability handled: no photo → initials; no `displayName` → email; no email → "Burner" heading, email line omitted. |
| **Validation error** | N/A — no inputs on this surface. |
| **Submitting / pending** | N/A — no mutations originate here. |
| **Success** | N/A — no mutation, no success toast. |
| **Disabled** | N/A — no controls are disabled; the `Button` carries disabled styles but this surface never applies them. |

### Gate / access states

All gates execute server-side in fixed sequence before any UI renders. A failing gate redirects; the page itself never renders a gated state.

| Gate | Condition | Redirect |
|---|---|---|
| **Unauthenticated** | No session | `/auth/sign-in` |
| **Invite-gated** | `!hasCampAccess(campUser, primaryEmail)` — `inviteCode` is null and not a god email | `/signup/required` |
| **Onboarding-incomplete** | `burner_profiles.completed_at` is null | `/onboarding/questionnaire` |
| **Pending-approval** | `approvalStatus === "pending"` | `/pending-approval` |
| **Rejected** | `approvalStatus === "rejected"` | `/pending-approval` (same target; differentiated on that surface) |

Gate precedence is fixed and short-circuits: auth → invite → onboarding → approval. An earlier failing gate redirects before later checks run.

**Captain-only lock** — N/A. This is a per-member self-view available to every approved member regardless of rank. The card never reveals captain-only data; `CaptainLock` is not used.

---

## User actions

| Action | Result |
|---|---|
| Tap **"Edit profile"** | Navigate to `/profile/edit` (unit 08 — profile editor) |
| Tap **"Review them here"** | Navigate to `/onboarding/questionnaire` (questionnaire replay) |
| Tap **"Sign out"** | Hard navigation (full page load) to `/auth/sign-out` — clears session via the route handler |

No other interactivity. No async client actions, no optimistic UI, no form fields.

---

## Data & enums

Read-only. This surface writes nothing.

### `users` table (`schema.ts:220–303`) — via `CampUser`

| Field | Column | Type | Use |
|---|---|---|---|
| `id` | `id` | uuid PK | Passed to `getBurnerProfile` and avatar proxy gating |
| `authUserId` | `auth_user_id` | text, unique | Auth match key; not rendered |
| `displayName` | `display_name` | text, nullable | Heading + initials source |
| `profileImageUrl` | `profile_image_url` | text, nullable | `AvatarImage src`; gates whether image element renders |
| `inviteCode` | `invite_code` | text, nullable | Consumed by `hasCampAccess`; NULL = no invite access |
| `rank` | `rank` | `rankEnum` — `"captain" \| "member"` | Badge label via local ternary (NOT `rankLabel()`) |
| `approvalStatus` | `approval_status` | `approvalStatusEnum` — `"pending" \| "approved" \| "rejected"` | Consumed by `isApproved`; defaults to `"approved"` in `toCampUser` for legacy rows |

### `AuthenticatedUser` (from Neon Auth session)

| Field | Use |
|---|---|
| `primaryEmail` | Email line (omitted if null); display-name + initials fallback; god-account bypass checks |
| `displayName` | Display-name fallback chain |

### `burner_profiles` table (`schema.ts:352–364`) — via `BurnerProfileSummary`

| Field | Column | Type | Use |
|---|---|---|---|
| `completedAt` | `completed_at` | timestamp, nullable | Onboarding gate only; content of responses not consumed on this surface |

### Enums consumed

| Enum | Values | Notes |
|---|---|---|
| `rankEnum` | `"captain" \| "member"` | Local ternary → "Captain" / "Member". No "Team Lead" label on this surface. |
| `approvalStatusEnum` | `"pending" \| "approved" \| "rejected"` | Consumed by `isApproved`; only `"approved"` (or god email) passes. |

### NEW schema changes

None. This surface is read-only and touches no tables or enums that do not already exist.

---

## Validation & edge cases

- **No input validation** — there are no form fields. All "validation" is the gate spine.
- **God accounts bypass both invite and approval gates**: `isGodEmail(primaryEmail)` → `hasCampAccess` and `isApproved` both return true regardless of `inviteCode`/`approvalStatus`.
- **Synthetic non-persisted row edge case**: a signed-in user with no DB row and no invite gets a synthetic `CampUser` with `id: ""`, `inviteCode: null`, `approvalStatus: "approved"`. On this surface `hasCampAccess` returns false (no invite, not god) and the user is redirected to `/signup/required` before `id: ""` is ever used.
- **Gate precedence is fixed and short-circuits**: auth → invite → onboarding-complete → approval. A failing earlier gate redirects before later checks run. Example: a pending member who has not finished the questionnaire is sent to `/onboarding/questionnaire`, not `/pending-approval`.
- **Onboarding gate is `completedAt`, not `required_actions`**: a null `burner_profiles.completed_at` bounces the user even if a `required_actions` questionnaire row were satisfied.
- **Rejected and pending share one redirect target** (`/pending-approval`): this surface does not differentiate them; the destination surface surfaces the distinction.
- **Team leads render as "Member"**: the rank badge uses a local ternary on `campUser.rank` — only `"captain"` or `"member"` stored; `team_memberships.is_lead` is not read on this surface.
- **Email may be absent**: when `primaryEmail` is null the email line is omitted entirely; the name heading falls through to `"Burner"` if `displayName` is also null.
- **Initials never blank**: `initialsFrom` returns `"?"` rather than an empty string for null/empty/unusable input.
- **Avatar proxy approval gate**: even if `profileImageUrl` is set, the `/api/avatar` proxy 401s for unauthenticated/unapproved requests and 404s in E2E/no-token environments, so the `<img>` silently falls back to initials. On this surface the viewer is always approved (gate passed), so their own photo loads in production with a configured blob token.
- **Cache-Control on avatar bytes**: `private, max-age=31536000, immutable` (1 year). The pathname must start with `"avatars/"` or the proxy returns 404.
- **E2E test mode**: all server functions route through the in-memory `testStore`; avatar bytes always 404 (no blob), so initials fallback is the expected E2E rendering.

---

## Flows

```
Entry points
  App shell / bottom-nav "Profile" tab
  Any gate-spine redirect that resolves past approval

Gate spine (server, runs on every request)
  no session          → /auth/sign-in
  no invite / not god → /signup/required
  !completedAt        → /onboarding/questionnaire
  !isApproved         → /pending-approval
  ↓ all gates pass

Render profile card (normal populated state)

Exits
  "Edit profile"      → /profile/edit   (unit 08)
  "Review them here"  → /onboarding/questionnaire
  "Sign out"          → /auth/sign-out  (full navigation, session cleared)
```

---

## Divergences from feature-set reference — and resolution per the locked decisions

| Divergence | Board signal | Feature-set contract | Resolution |
|---|---|---|---|
| **RankPill fill colour** | Board uses raw hex `#ff008c2e` (semi-transparent magenta) | Contract notes `bg-[var(--color-secondary)]` as the live implementation | Board is canonical. Spec calls for `#ff008c2e` fill with `$primary` label text. A token reconciliation pass should define a named token (e.g. `$rank-captain-bg`) mapping to this value — flag in Tokens carried reconciliation. |
| **Avatar size** | Board: `w:96 h:96` (96px) | Live code: `h-32 w-32` (128px) | Board is canonical at 96px (`h-24 w-24` in Tailwind). Live code oversizes; align to board on build. |
| **No `TopChrome`** | Board draws no navigation chrome above the card | Feature-set does not address chrome | Board is canonical. The profile view renders with whatever app-level shell is present, but the board itself specifies no in-surface chrome. If the app shell supplies a bottom nav, it is external to this surface. |
| **Team Lead NOT labelled** | Board shows only "Captain" in the RankPill example | Contract explicitly flags: "a team lead shows as Member here" | Consistent. Spec codifies "Member" for all non-captain stored ranks. Locked. |
| **No `CaptainLock` on this surface** | Board has no `CaptainLock` instance; S09 lists no reusable components | Decision #3 specifies preview-but-locked for captain/higher surfaces | N/A — this is a self-view for every approved member, not a captain-gated surface. `CaptainLock` is correctly absent. |

---

## Open questions / build reconciliations

1. **RankPill token**: `#ff008c2e` is a raw hex tint on the board. The Tokens reconciliation (decisions.md carried items) should formalise this as a semantic token (e.g. `$rank-captain-bg`). No change to this surface's behaviour pending that pass.
2. **Avatar size discrepancy**: board = 96px, live code = 128px. Build should align to 96px per board. Low risk — purely visual.
3. **Navigation chrome**: the board draws no `TopChrome` or bottom nav; the live app may supply a shell. Confirm whether `/profile` sits inside the app shell layout or renders standalone (the Server Component structure in the contract suggests it could be standalone). If the shell supplies a bottom-nav "Profile" tab, that is external to this surface spec.
4. **`questionnaire.ts` v8 replay link**: "Review them here" navigates to `/onboarding/questionnaire`. Confirm that the questionnaire runner surface (unit 24) supports a replay/review mode for already-completed profiles without overwriting `completedAt` or resetting the gate.
5. **Sign-out implementation**: the contract uses a plain `<a href="/auth/sign-out">` (full navigation). Confirm this remains the intended pattern at build time vs. a server action / form POST, particularly if CSRF considerations arise.
