# Captain tools hub — functional brief

- **Route(s):** `/captains/tools`
- **Canonical board(s):** `S19 Captain tools` (board #28, 430×690px, `design/.spec-extract/boards/28-s19-captain-tools.txt`)
- **Superseded / dropped:** none — single board, no iterations
- **Breakpoints:** mobile-first 430px (board canonical size); no desktop-specific layout defined on this surface; the card list scales naturally via `fill_container` widths

---

## Purpose

A captain-clearance navigation index presented as a list of tappable tool cards. Non-captains can open this route (preview-but-locked, per Decision 3) — they see the page chrome and header, and **in place of** the tool list a `CaptainLock` panel with the override message "This tooling is captain-only. Your rank doesn't have clearance for these tools." No tool data is returned and no cards are rendered (not a dimmed/ghost list — that would leak data); all controls are inert for non-captains. Captains see live, tappable cards and navigate to each captain-only tool page. The surface holds no forms, no mutations, and no search — it is purely a navigation index.

---

## Layout & modules

The surface is a single-column vertical scroll at `$background`. Two child regions stack top to bottom.

### GhostBack (back navigation bar)

A ghost back-link row: `ChevronLeft` icon ($muted-foreground, 20×20) + label "Captains" (Inter/15px/500/$muted-foreground). Gap 4, padding [14, 12]. Tapping navigates back to `/` (the control panel). Visible in both captain and non-captain states.

### Content region

Vertical stack, `fill_container` width, gap 16, padding [4, 16, 24, 16]. Contains:

#### Intro block

Vertical stack, gap 6.

- `<h1>` "Camp tools" — Inter/26px/700/$foreground
- Subtitle "Captain-only tooling for organising the camp." — Inter/14px/normal/$muted-foreground, `fill_container` width, lineHeight 1.45

#### Tool card list (captain state only)

One `ToolCard` per tool entry. Current entries:

| # | Icon | Title | Description | Destination |
|---|---|---|---|---|
| 1 | `Megaphone` ($primary) | Announcements & notifications | "Compose a camp-wide announcement, save it as a draft, then publish it to everyone. Choose how hard it lands — a full-screen note members must acknowledge, a pop-up, or a quiet inbox entry." | `/captains/announcements` |
| 2 | `Users` ($primary) | Roster & approvals | "Review pending members, approve or decline sign-ups, and manage who's on camp." | `/captains/camp-management` |

The board's locked variant draws two dimmed cards **as a design-time annotation** (to show what's behind the lock); the built non-captain view does **not** render them — it shows the `CaptainLock` panel in their place (no data). The live code `TOOLS` array today contains only one entry (Announcements); the board's second card (Roster & approvals, `Users` icon) confirms the roster card is a planned entry to add when the roster surface is built. New tools are added by appending entries to the in-file `TOOLS` array.

**ToolCard anatomy:**

- Outer: horizontal row, `fill_container`, gap 14, padding 18, `$card` fill, `$border` stroke, `$radius` corner radius, center-aligned
- `IconBadge`: 44×44, `$muted` fill, `$border` stroke, `$radius` corners, icon centered at 20×20, `$primary` icon colour
- Text block: vertical stack, `fill_container`, gap 4 — `CardTitle` (Inter/15px/700/$foreground) + `CardDescription` (Inter/13px/normal/$muted-foreground, lineHeight 1.4)
- Trailing `ChevronRight` icon (20×20, $muted-foreground)
- Entire card is a tappable `Link` wrapping to `tool.href`
- Hover: `transition-colors hover:bg-accent/30`
- Focus: `focus:outline-none focus-visible:ring-2 focus-visible:ring-ring` on the `Link` wrapper, `rounded-xl`

#### Locked variant (non-captain state)

Rendered when the authenticated user's `rank !== "captain"`. Contains:

- A 1px `$border` horizontal divider
- Label "LOCKED — non-captain view" (Inter/11px/600/$muted-foreground, letter-spacing 1.2) — design annotation label; this text is not end-user-visible copy and should not be rendered in production. In the built surface the visual separator and lock overlay are sufficient.
- In place of the tool-card list, a `CaptainLock` panel — **preview-but-locked per LOCKED decision 3**: render the page chrome (GhostBack + Intro) only, **replace** the `<ul>` of ToolCards with a single `CaptainLock` panel, and emit **no tool data and no ghost/dimmed cards**. Message override: "This tooling is captain-only. Your rank doesn't have clearance for these tools." Identical to the roster (14) and announcements (15) locked treatment. A dimmed-but-populated render is non-conformant (a data leak; see `flows.md` §3.3 invariant #2) — even though `TOOLS` is a static source constant here, follow the no-data grammar so the taught pattern is correct.

The `CaptainLock` component renders a card with a 48×48 pill (`primary/18%` fill — board `#ff008c2e`, normalised per `design-tokens.md` §4) containing a `Lock` icon ($primary), title "Captain access only" (Inter/15px/700/$foreground), and the overridden reason text (Inter/12px/normal/$muted-foreground, centered, lineHeight 1.4).

---

## Components used

| Component | Role | Key props / variants |
|---|---|---|
| `CaptainLock` (canvas reusable, #09) | Rank gate panel rendered **in place of** the tool list for non-captains (not an overlay on a populated list) | `LockReason` overridden to "This tooling is captain-only. Your rank doesn't have clearance for these tools." |
| `Card` / `CardTitle` / `CardDescription` (`@camp404/ui`) | ToolCard container and text | `transition-colors hover:bg-accent/30`; no variant prop needed beyond default |
| `Button` (`@camp404/ui`) | GhostBack navigation link | `variant="ghost"`, `size="sm"`, `asChild` over `<a href="/">` |
| `ChevronLeft` (lucide) | GhostBack affordance icon | 20×20, $muted-foreground |
| `ChevronRight` (lucide) | ToolCard trailing nav indicator | 20×20, $muted-foreground |
| `Megaphone` (lucide) | Announcements tool icon | 20×20, $primary inside an `IconBadge` |
| `Users` (lucide) | Roster tool icon | 20×20, $primary inside an `IconBadge` |
| `Link` (next/link) | Full-card tap target wrapping each ToolCard | typed `href` to tool destination; focus ring on Link |

**New components introduced by this surface:**

- `IconBadge` — 44×44 bordered, rounded tinted container for tool icons. The canvas/brief "IconChip" is the **same atom** as the library's canonical `IconBadge` (`component-library.md` folds the `NavCard` IconChip into `IconBadge`); promote it to `@camp404/ui` rather than re-inlining. (Earlier drafts wrongly claimed no equivalent exists — it does: `IconBadge`.)

No `TopChrome`, `SectionHeader`, `DetailHeader`, `GridTile`, `InputField`, or `EmptyState` components are used here.

---

## States

| State | Description |
|---|---|
| **Populated — captain** | Happy path. All tool cards are rendered as live tappable `Link`s. GhostBack active. No lock overlay. |
| **Preview-but-locked — non-captain** | The surface renders chrome (GhostBack, Intro block, separator); the ToolCard list is **replaced by** a `CaptainLock` panel — no ghost/dimmed cards, no tool data, no tappable links emitted (decision 3 / `flows.md` §3.3 invariant #2). GhostBack remains functional. |
| **Loading** | None on-surface. This is a server component; markup is fully resolved before delivery. No skeletons or spinners. |
| **Empty** | Structurally possible if `TOOLS` were emptied. The `<ul>` renders with no `<li>`; there is no dedicated empty-state placeholder. Today `TOOLS` always has ≥1 entry, so the empty branch is dead. |
| **Invite-gated** | `hasCampAccess` false → redirect to `/signup/required` before render. Not visible. |
| **Pending approval** | `isApproved` false → redirect to `/pending-approval` before render. Not visible. |
| **Rejected** | `approvalStatus === "rejected"` fails `isApproved` → redirect to `/pending-approval`. Not visible. |
| **Unauthenticated** | `getAuthenticatedUserOrRedirect()` → redirect to `/auth/sign-in`. Not visible. |
| **Validation error / Submitting / Success** | Not applicable — no forms or mutations on this surface. |
| **Disabled** | No disabled controls on this page beyond the inert locked-variant cards. |
| **Onboarding-incomplete** | Not enforced here. Only invite + approval + rank are checked; a captain with pending required actions who navigates directly will still see the surface. |

---

## User actions

| Action | Actor rank | Result |
|---|---|---|
| Tap a tool card | captain | Navigate to `tool.href` (e.g. `/captains/announcements`). Entire card is the link target. |
| Tap GhostBack ("Captains") | any | Navigate to `/` (the control panel). |
| Look at the locked surface | non-captain | No tool cards are rendered — only the `CaptainLock` panel (no data, nothing tappable). |
| Keyboard tab to a tool card | captain | Focus ring on the `Link` wrapper (`focus-visible:ring-2 focus-visible:ring-ring`, `rounded-xl`). |

No writes, no server actions, no mutations occur on this surface.

---

## Data & enums

This surface performs reads only (no writes). All fields are read off `CampUser` (resolved server-side before render).

| Field | Table / enum | Use |
|---|---|---|
| `users.rank` | `rankEnum = pgEnum("rank", ["captain", "member"])` (schema.ts:31) | Determines captain vs. non-captain render path |
| `users.inviteCode` | `users.invite_code text` (schema.ts:260) | Read by `hasCampAccess`; null → redirect to `/signup/required` |
| `users.approvalStatus` | `approvalStatusEnum = pgEnum("approval_status", ["pending","approved","rejected"])` (schema.ts:41–45) | Read by `isApproved`; non-"approved" → redirect to `/pending-approval` |
| `users.authUserId` | `users.auth_user_id text` (schema.ts:221) | Used by `ensureCampUser` to look up the row |
| `AuthenticatedUser.primaryEmail` | in-memory auth shape | Passed to `hasCampAccess`/`isApproved` for god-email bypass via `isGodEmail` |

**Nothing NEW.** No table, column, or enum is added or changed by this surface. The `captain_promotion_requests` table and `promotion_request_status` enum (Decision 4) are not touched here.

`TOOLS` array (in-file, not DB-backed): each entry is `{ href: string, title: string, description: string, icon: React.ReactNode }`. New tools added by appending entries in code.

---

## Validation & edge cases

- **Gate ordering is strict.** Auth → invite (`hasCampAccess`) → approval (`isApproved`) → rank check. First failing gate wins; later gates never run.
- **God-email bypass.** `isGodEmail(email)` (case-insensitive match against `GOD_EMAILS` env CSV) forces `hasCampAccess` and `isApproved` both true, regardless of `inviteCode`/`approvalStatus`. **The rank gate still applies.** A god account whose row has `rank === "member"` sees the non-captain locked view, not a captain view. God accounts are auto-created with `rank: "member"`; a god user becomes a captain only when their rank is explicitly set.
- **Synthetic non-persisted row.** A signed-in user with no camp row and no invite gets a synthetic `CampUser` with `inviteCode: null` → `hasCampAccess` false → redirect to `/signup/required` before the rank check runs.
- **Non-captain sees surface, not redirect (Decision 3).** Unlike the current live code (which hard-redirects rank-non-captains to `/`), the spec requires preview-but-locked: the page renders its chrome (GhostBack + Intro) with a `CaptainLock` panel **in place of** the tool list — no tool data, no cards, and no navigation occurs.
- **Onboarding gate absent.** No `required_actions` / `nextGate` check here; only invite + approval + rank. A captain who navigated directly having incomplete required actions would reach this surface. The home gating spine handles the onboarding funnel; this page does not re-implement it.
- **`force-dynamic` required.** The gate chain calls `getAuthenticatedUserOrRedirect()` which reads the session cookie. Static prerender would strand the cookie read. `export const dynamic = "force-dynamic"` must remain.
- **`tool.href` typing.** Should be constrained to known `AppRoutes` (typed routes). The current single value `/captains/announcements` is a real built page. When adding the Roster & approvals entry, confirm `/captains/camp-management` is registered before shipping.
- **Empty TOOLS.** No empty-state component exists. If `TOOLS` is emptied, a bare unstyled list renders. This branch is dead today but should be guarded if the array becomes dynamic.
- **Locked-view annotation copy.** The board label "LOCKED — non-captain view" (Inter/11px/600/$muted-foreground) is a Pencil design annotation, not end-user copy. It must not appear in the built surface. The `CaptainLock` panel is the user-facing locked treatment.
- **No data, inert.** In the locked state the tool list is not rendered at all (no cards, no `tool.href` data emitted) — only the `CaptainLock` panel, which is presentational only (no dismiss action). This is the no-data preview-but-locked grammar, not a dimmed populated render.

---

## Flows

```
[Entry: user taps "Camp Tools" quadrant tile on / (control panel)]
  → /captains/tools
      → getAuthenticatedUserOrRedirect()
          → null → redirect /auth/sign-in (out of scope)
      → ensureCampUser(authUser)
      → hasCampAccess false → redirect /signup/required (out of scope)
      → isApproved false → redirect /pending-approval (out of scope)
      → rank === "captain"
          → render captain view: Intro + live ToolCard list
              → tap ToolCard → navigate to tool.href (e.g. /captains/announcements)
              → tap GhostBack → navigate to /
      → rank !== "captain"
          → render non-captain view: Intro + CaptainLock panel in place of tool list (no data, no cards)
              → tap GhostBack → navigate to / (only active control)
              → no tool cards rendered
```

---

## Divergences from feature-set reference

| Feature-set signal | Board + Decision | Resolution |
|---|---|---|
| Reference (16-captains-tools.md) specifies a hard `redirect("/")` for `rank !== "captain"` — no locked view rendered | Board S19 draws a locked variant (a dimmed-card design annotation) + `CaptainLock`; Decision 3 mandates preview-but-locked | **Board + Decision win.** Non-captains reach the route and see a `CaptainLock` panel **in place of** the tool list (no data, no cards), and are NOT redirected. The hard-bounce must be removed from the live `page.tsx`. |
| Reference describes exactly one `TOOLS` entry (Announcements only) | Board's locked variant shows two dimmed cards: Announcements (Megaphone) + Roster & approvals (Users icon) | The second card (Roster & approvals → `/captains/camp-management`) is a planned forthcoming entry. Add it to `TOOLS` when the roster surface ships. Spec documents it as the full intended list. |
| Reference uses subtitle copy "Captain-only tooling for running the camp." | Board JSON subtitle: "Captain-only tooling for organising the camp." | **Board wins.** Use "organising" (board-canonical). |
| Reference uses `max-w-2xl` layout container | Board is 430px mobile-first with no explicit desktop max-width specified on this surface | `max-w-2xl` is carried over from the live code as a reasonable default; it does not conflict with the board's 430px mobile-first intent. Retain unless a desktop breakpoint board is drawn. |
| Reference does not define a named icon-container component | Board draws a 44×44 bordered icon container (board name "IconChip") | Use the library's canonical **`IconBadge`** (`component-library.md` folds this atom in); PROMOTE to `@camp404/ui`, shared with the member tools hub (S13). |

---

## Open questions / build reconciliations

1. **Roster card destination.** The board shows "Roster & approvals" (Users icon) as the second tool card pointing to the roster/approvals surface. Confirm `href` once the roster surface brief is finalised (expected `/captains/camp-management`). Do not ship the card until the destination exists.

2. **Locked-view annotation label.** The board includes the label "LOCKED — non-captain view" (Inter/11px/600/$muted-foreground) as a Pencil annotation within the locked variant. Confirm this is design-only and must be stripped from the built surface. If a visible rank-locked label is desired for the UI (e.g. a small "CAPTAIN ONLY" badge above the divider), it needs a separate product decision.

3. **God accounts and rank.** God accounts are auto-created with `rank: "member"` (users.ts:75). A new god-email sign-up would see the non-captain locked view here rather than the captain live view. Is the expectation that god accounts are always manually promoted to captain before use, or should `ensureCampUser` mint god rows with `rank: "captain"`? Flag to confirm before shipping.

4. **Onboarding gate.** This surface intentionally skips the `required_actions` / `nextGate` check. A captain with blocking outstanding required actions who navigates directly will reach this page. Confirm this is an acceptable product exception (captains are trusted; the home spine handles onboarding routing for members).

5. **Empty TOOLS guard.** No empty-state component is rendered when `TOOLS` has zero entries. If tool entries ever become admin-configurable at runtime (vs. code-side array), an `EmptyState` should be wired. Confirm whether the `TOOLS` array will remain a code-side concern indefinitely.

6. **Focus-ring placement.** The live code places `focus-visible:ring-2 focus-visible:ring-ring` on the `Link` wrapper (`rounded-xl`). The member tools hub (`/tools`) places the ring on the `Card`. Standardise placement across both hubs (recommendation: ring on `Link` with `rounded-xl`, matching the captain hub, since it encapsulates the entire interactive target).
