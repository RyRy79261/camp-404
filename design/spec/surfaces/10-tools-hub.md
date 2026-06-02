# Tools hub — functional brief

- **Route(s):** `/tools`
- **Canonical board(s):** `S13 Tools hub` (board #22, 430×560px, `design/.spec-extract/boards/22-s13-tools-hub.txt`)
- **Superseded / dropped:** none — single board, no iterations
- **Breakpoints:** mobile-first 430px (board canonical size); no desktop-specific layout defined on this surface; NavCards scale via `fill_container`

---

## Purpose

The Tools hub is the camp-member "uncategorised toolbox" — a flat navigation index reached from the bottom-right "Tools" quadrant tile on the home control panel (`/`). It renders a curated list of three tappable `NavCard`s (Invite a member, My forms, Family tree) that deep-link to child surfaces. The hub performs no data mutation and holds no per-tool logic. Its sole behaviour is (1) enforce the auth → invite → approval gate chain server-side, then (2) render the static card list.

This surface is the parent/index for S14 Invite tool (`/tools/invite`), S15 My forms (`/tools/forms`), and S16 Family tree (`/family-tree`). None of those surfaces' functionality lives here.

**This surface carries no rank gate.** It is the camp-member layer hub; every approved member (and every captain) can access it without a `CaptainLock` overlay. Captain-only tooling lives at the sibling `/captains/tools` hub (S19).

---

## Layout & modules

The surface is a single-column vertical scroll at `$background`, 430px wide at the canonical breakpoint. Two regions stack top to bottom inside the outer frame.

### DetailHeader

An instance of the `DetailHeader` reusable component (`fill_container` width, overriding its title slot with "Tools"). This is the same component used by S12 Notifications. The `DetailHeader` renders the app's standard surface header: back-navigation affordance (if applicable), surface label. Exact internal anatomy is defined in the `DetailHeader` component brief.

### Content region

Vertical stack, `fill_container` width, gap 16, padding [8, 16, 24, 16]. Contains two child blocks.

#### Intro block

Vertical stack, `fill_container` width, gap 6.

- `<h1>` "Tools" — Inter/26px/700/$foreground
- Subtitle — Inter/14px/normal/$muted-foreground, `fill_container` width:

  > "Uncategorised tooling for camp members. We'll move tools into dedicated sections as we group them."

  (Board copy; reference unit uses "quadrants" — board wins, see Divergences.)

#### NavCards list

Vertical stack, `fill_container` width, gap 12. Renders one `NavCard` per tool entry. All three cards are always present; none are conditionally hidden by rank or state.

**NavCard anatomy** (shared pattern — see Components):

| Slot | Spec |
|---|---|
| Outer | Horizontal row, `fill_container`, gap 14, padding 16, `$card` fill, `$border` stroke, `$radius` corners, center-aligned (`ai: center`) |
| `IconBadge` | 44×44, `$muted` fill, `$border` stroke, `$radius` corners, icon centered at 20×20, `$primary` icon colour |
| Text block | Vertical stack, `fill_container`, gap 4 — title (Inter/15px/700/$foreground) + description (Inter/13px/normal/$muted-foreground) |
| Trailing affordance | `ChevronRight` icon, 20×20, $muted-foreground |
| Hover | `transition-colors hover:bg-accent/30` |
| Focus | `focus:outline-none focus-visible:ring-2 focus-visible:ring-ring` on the wrapping `Link` with `rounded-xl` |

**Tool entries (canonical board order):**

| # | Icon | Title | Description | Destination |
|---|---|---|---|---|
| 1 | `Mail` ($primary) | Invite a member | "Mint a named invite link to bring someone onto Camp 404." | `/tools/invite` |
| 2 | `ClipboardList` ($primary) | My forms | "Revisit a questionnaire you've already completed, update your answers, and see what changed." | `/tools/forms` |
| 3 | `GitBranch` ($primary) | Family tree | "See who brought who onto camp." | `/family-tree` |

Note: entry 1 description is corrected from the board's stale "single-use code" copy to "named invite link" (see Divergences — surface-specific guidance and Decision carry-forward from the invite build-reconciliation in `decisions.md`).

---

## Components used

| Component | Role | Key props / variants |
|---|---|---|
| `DetailHeader` (canvas reusable, #02) | Surface header — back navigation + "Tools" label | `title` overridden to "Tools"; `fill_container` width |
| `NavCard` (new shared component — see below) | Tappable navigation card with icon chip, title, description, and trailing chevron | `href`, `icon`, `title`, `description` props; hover tint; focus ring on Link wrapper |
| `IconBadge` (canonical library atom) | 44×44 bordered rounded tinted container for the tool icon inside each `NavCard` | Same atom as the library's `IconBadge` (folds the canvas "IconChip"); PROMOTE to `@camp404/ui`, shared by S13 + S19 |
| `Link` (next/link) | Full-card tap target wrapping each `NavCard` | Typed `href` to tool destination; focus ring on Link |
| `Mail` (lucide) | Invite a member card icon | 20×20, $primary inside `IconBadge` |
| `ClipboardList` (lucide) | My forms card icon | 20×20, $primary inside `IconBadge` |
| `GitBranch` (lucide) | Family tree card icon | 20×20, $primary inside `IconBadge` |
| `ChevronRight` (lucide) | Trailing nav affordance on every `NavCard` | 20×20, $muted-foreground |

**`NavCard` — shared component call-out:**

The `NavCard` pattern appears on three surfaces:

- **S13 Tools hub** (this surface) — 3 member-layer tool entries
- **S14 Invite tool** — not a NavCard consumer, but uses similar card anatomy for its success/code display
- **S19 Captain tools** (`/captains/tools`) — 2 captain-layer tool entries (labelled `ToolCard` on that board)

Both S13 and S19 use the identical icon-chip + title + description + ChevronRight composition at the same dimensions (gap 14, padding 16–18, IconBadge 44×44). This should be extracted as a single shared `NavCard` (or `ToolCard`) component, accepting `href`, `icon`, `title`, `description`, and an optional `disabled` prop (for inert/locked rendering in the captain-tools non-captain state). The live code today implements these as separate inline compositions; the spec requires consolidation. Naming recommendation: `NavCard` (used across both member and captain hubs).

No `TopChrome`, `SectionHeader`, `GridTile`, `InputField`, `EmptyState`, or `CaptainLock` components are used on this surface.

---

## States

| State | Description |
|---|---|
| **Populated** | Only data state. Always exactly 3 NavCards. Static; no async data fetch inside the body. Gate helpers resolve server-side before first paint. |
| **Loading** | None on-surface. Server component; markup fully resolved before delivery. No skeletons or spinners. `dynamic = "force-dynamic"` ensures per-request render. |
| **Empty** | Structurally unreachable at runtime — the tool list is a non-empty compile-time constant. An empty `<ul>` would render only if the constant were manually emptied in source. No empty-state component is defined for this surface. |
| **Unauthenticated** | `getAuthenticatedUserOrRedirect()` → redirect to `/auth/sign-in`. Surface never renders. |
| **Invite-gated** | `hasCampAccess` false → redirect to `/signup/required`. Surface never renders. |
| **Pending approval** | `isApproved` false (approvalStatus `pending`) → redirect to `/pending-approval`. Surface never renders. |
| **Rejected** | `approvalStatus === "rejected"` also fails `isApproved` → redirect to `/pending-approval`. Not distinguished from pending on this surface; both route to the same gate. |
| **Preview-but-locked / rank-gated** | NOT APPLICABLE. This is a camp-member-layer surface. All approved members can access it. No `CaptainLock` overlay exists here. Captain tooling is separate at `/captains/tools`. |
| **Onboarding-incomplete** | NOT enforced on this surface. Only invite + approval gates are checked; a member with pending blocking required actions who navigates directly to `/tools` will reach the hub. The home gating spine handles onboarding funnel routing. |
| **Validation error / Submitting / Success** | Not applicable — no forms or mutations on this surface. |
| **Disabled** | No controls exist that can be disabled. All three NavCards are always active links for any user who passes the gate chain. |

---

## User actions

| Action | Result |
|---|---|
| Tap a NavCard | Client-side navigation (Next.js `Link`) to that tool's `href`. Entire card is the tap target. |
| Tap DetailHeader back affordance | Navigate back to `/` (the home control panel). |
| Keyboard tab to a NavCard | Focus ring renders on the `Link` wrapper (`focus-visible:ring-2 focus-visible:ring-ring`, `rounded-xl`). Card background does not tint on plain focus. |
| Keyboard Enter on a focused NavCard | Navigate to `tool.href`. |

There are no buttons, no forms, no inputs, no mutations, no voice/PTT, and no server actions on this surface. The only interaction type is link navigation.

---

## Data & enums

This surface performs reads only (no writes). All fields are resolved server-side before render.

| Field | Table / source | Use |
|---|---|---|
| `users.invite_code` | `invite_codes.code text` via `users.inviteCode` (schema.ts:260) | Read by `hasCampAccess(user, email)` — null → redirect to `/signup/required` |
| `users.approval_status` | `approvalStatusEnum = pgEnum("approval_status", ["pending","approved","rejected"])` (schema.ts:41–45) | Read by `isApproved(user, email)` — non-"approved" → redirect to `/pending-approval` |
| `users.auth_user_id` | `users.auth_user_id text` (schema.ts:221) | Used by `ensureCampUser` to resolve or create the camp-user row |
| `AuthenticatedUser.primaryEmail` | In-memory auth shape (Neon Auth / Better Auth) | Passed to `hasCampAccess`/`isApproved` for god-email bypass via `isGodEmail` |

**`users.rank` is NOT read by this surface.** There is no rank gate here (no CaptainLock, no rank-conditional render path).

**Nothing NEW.** No table, column, or enum is added or changed by this surface. The `captain_promotion_requests` table and `promotion_request_status` enum (Decision 4) are not touched here. The `invite_codes` table fields read by `hasCampAccess` already exist in schema.ts.

The tool card list is **not** persisted — it is a source-code constant with no backing table. Each entry: `{ href: string; title: string; description: string; icon: React.ReactNode }`.

---

## Validation & edge cases

- **Gate ordering is strict.** Auth → `ensureCampUser` → `hasCampAccess` → `isApproved`. First failing gate throws a redirect; subsequent gates never run.
- **God-email bypass.** `isGodEmail(email)` (case-insensitive CSV match against `GOD_EMAILS` env var) forces both `hasCampAccess` and `isApproved` true, regardless of `inviteCode` / `approvalStatus`. God accounts reach this surface unconditionally (assuming they are authenticated). No rank restriction applies here.
- **Synthetic non-persisted row.** A signed-in user with no camp row and no invite gets a synthetic `CampUser` with `inviteCode: null` → `hasCampAccess` false → redirect to `/signup/required` before the tool list renders.
- **Approval gate treats `pending` and `rejected` identically.** Both redirect to `/pending-approval`; this surface does not distinguish them.
- **Onboarding gate intentionally absent.** Unlike the home spine, `/tools` does not call `getPendingRequiredActions`/`nextGate`. Members with pending blocking required actions can reach this hub via direct navigation. This is an explicit product exception (noted in the reference contract).
- **`force-dynamic` required.** Gate chain calls `getAuthenticatedUserOrRedirect()` which reads the session cookie. Static prerender would strand the cookie read.
- **E2E test mode.** When `isE2ETestMode()`, the auth user comes from the `camp404_test_user` cookie and the user backend is the in-memory `testStore`. Gate behaviour is otherwise identical. E2E coverage: `tests/e2e/authenticated.spec.ts` — unauthenticated user → `/auth/sign-in`; pending-approval user → `/pending-approval`.
- **Restyle constraint.** Disambiguation is by icon + label only. No per-card colour tinting. All three cards must remain present and route to their exact `href`s.
- **No client-side validation, debouncing, rate limiting, or error boundaries** are defined — the surface has no inputs and triggers no network calls beyond the implicit server-side gate reads.
- **`tool.href` typing.** Should be constrained to known `AppRoutes` (typed routes). `/tools/invite`, `/tools/forms`, `/family-tree` must all be registered routes before shipping.

---

## Flows

```
[Entry: user taps "Tools" quadrant tile on / (control panel)]
  → /tools
      → getAuthenticatedUserOrRedirect()
          → null → redirect /auth/sign-in  (exit)
      → ensureCampUser(authUser)
      → hasCampAccess false → redirect /signup/required  (exit)
      → isApproved false → redirect /pending-approval  (exit)
      → render: DetailHeader + Intro + 3 × NavCard
          → tap "Invite a member"  → /tools/invite   (S14 Invite tool)
          → tap "My forms"         → /tools/forms    (S15 My forms)
          → tap "Family tree"      → /family-tree    (S16 Family tree)
          → tap DetailHeader back  → /               (home control panel)
```

---

## Divergences from feature-set reference

| Feature-set / board signal | Board + Decision | Resolution |
|---|---|---|
| Board (line 17) carries stale copy: "Mint a single-use code to bring someone onto Camp 404." for the Invite card description | `invite_codes` schema (schema.ts:312–342) shows `maxUses integer`, `note text`, `code text` (named slug) — the code is multi-use and named, not single-use. `decisions.md` carry-forward: "Fix the Tools-hub 'single-use' copy (stale) … to the slug format." | **Fix the copy.** Use: "Mint a named invite link to bring someone onto Camp 404." (or equivalent that removes "single-use" and signals slug-based, captain-configurable codes). Exact marketing copy TBD by product. |
| Reference contract (`10-tools-hub.md`) subtitle uses "dedicated quadrants" | Board (line 10) uses "dedicated sections" | **Board wins.** Use "sections". |
| Reference contract uses `max-w-2xl` layout container (page.tsx:61) | Board is 430px mobile-first with no explicit desktop max-width drawn | `max-w-2xl` is carried over from live code as a reasonable default; does not conflict with the 430px mobile-first board. Retain unless a desktop breakpoint board is drawn. Flag as a layout token to reconcile against the product-wide `max-w-lg` shell (noted as low-confidence in the reference contract). |
| Reference contract describes the NavCard as anonymous inline markup; board names it "ToolCard" at S13 and "ToolCard" at S19 | Both hubs use identical anatomy | Extract as shared `NavCard` component (see Components section). Neither surface's existing code exports a named component for this pattern. |
| Reference contract's `TOOLS` entry 3 links Family tree to `/family-tree` (not `/tools/family-tree`) | Board does not specify destination `href`s; reference contract is the data source here | Retain `/family-tree` as the canonical destination for Family tree. Flag: this is the only NavCard that navigates outside the `/tools/*` subtree — confirm routing is intentional. |

---

## Open questions / build reconciliations

1. **Invite card copy.** The board's "single-use code" description is confirmed stale (schema supports multi-use named slugs, and `decisions.md` calls this out explicitly). The replacement copy above is a placeholder. Product should supply final marketing copy that correctly conveys: named slug, configurable use-count, captain pre-approve option.

2. **`NavCard` vs `ToolCard` naming.** Both S13 and S19 boards use a structurally identical card pattern. The reference contract and live code implement them as separate inline compositions. Confirm the shared component name (`NavCard` recommended) and which package it lives in (`@camp404/ui` or inline per-page). The `disabled`/inert prop (for FUTURE "coming soon" tiles and disabled cards — note: the captain-tools *non-captain* state renders `CaptainLock` in place of the list, not disabled cards) should be spec'd at the same time.

3. **`IconBadge` as exportable component.** RESOLVED in `component-library.md`: the inline 44×44 chip is the canonical `IconBadge` atom (PROMOTE to `@camp404/ui`, shared by S13 + S19). No longer an open question.

4. **Family tree destination routing.** The Family tree NavCard navigates to `/family-tree` (outside `/tools/*`). Confirm this is intentional and that the route is registered before shipping. If the surface moves to `/tools/family-tree`, update the NavCard `href` and the S16 brief.

5. **Home quadrant hint copy.** The home control panel `bottomRight` quadrant tile carries the hint "Meals, expenses…" (reference contract, `app/page.tsx:124-129`) but the actual hub lists Invite/My forms/Family tree — no meals or expenses tool exists. The hub subtitle explicitly anticipates future tools. Update the quadrant hint to reflect current content (e.g. "Invite, forms, family tree") or leave it aspirational — requires product decision.

6. **Onboarding gate exception.** `/tools` intentionally skips the `required_actions`/`nextGate` check. A member with pending blocking required actions who navigates directly reaches the hub. Confirm this is an acceptable product exception (the home spine handles the gate funnel; tools are reachable as a bypass). Flag if a blocking-action guard should be added here.

7. **Focus-ring placement.** The reference contract places `focus-visible:ring-2 focus-visible:ring-ring` on the `Card` (inner element); S19 captain tools places it on the `Link` wrapper. Per the divergence note in the captain-tools brief: standardise on the `Link` wrapper + `rounded-xl` across both hubs when implementing the shared `NavCard` component.

8. **`DetailHeader` back-navigation target.** The board shows `DetailHeader` as the header (overridden title "Tools"). Confirm that `DetailHeader`'s back affordance resolves to `/` (home control panel) in this context — the component may derive the back target from the router or require an explicit prop.
