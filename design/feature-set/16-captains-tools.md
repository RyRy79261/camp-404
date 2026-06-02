# 16 — Captain tools hub

**Files covered:**
- `apps/web/app/captains/tools/page.tsx` — the captain-only "Camp tools" index page (server component). Lists captain-clearance tooling as link cards; currently a single entry (Announcements & notifications).
- `apps/web/lib/auth.ts` — `getAuthenticatedUserOrRedirect()` auth gate this page calls first.
- `apps/web/lib/users.ts` — `ensureCampUser()`, `hasCampAccess()`, `isApproved()` gate helpers; `CampUser` shape + `Rank`/`ApprovalStatus` types.
- `apps/web/lib/access-control.ts` — `isGodEmail()` used inside `hasCampAccess`/`isApproved` (god-account bypass).
- `packages/db/src/schema.ts` — `rankEnum` (schema.ts:31), `approvalStatusEnum` (schema.ts:41); the stored fields the gates read.
- `apps/web/app/page.tsx` — the captain control panel's "Camp Tools" quadrant tile (page.tsx:172-177) is the entry point that links here.
- `apps/web/app/captains/announcements/page.tsx` — the sole linked destination; back-links to `/captains/tools`. (Documented as the link target only; its own behaviour belongs to its own unit.)

**Purpose:** The captain tools hub is the captain-clearance index page rendered behind the "Camp Tools" quadrant tile on the captain control layer. It is an exhaustively-gated, read-only list of captain-only tooling presented as tappable cards. It mirrors the member tools hub (unit 10) but with a hard rank gate: any signed-in user who is not a `captain` is redirected to `/` (home) rather than shown a locked view, because — unlike the data-locked camp-management roster — there is nothing useful to show a non-captain here. At present the list holds exactly one tool: "Announcements & notifications" → `/captains/announcements`. New captain tools are added by appending entries to the in-file `TOOLS` array.

## Features

### Captain tools index page (`apps/web/app/captains/tools/page.tsx`)
- **Force-dynamic server component.** `export const dynamic = "force-dynamic"` (page.tsx:14) — never statically cached; gates re-evaluate on every request.
- **Page metadata.** `export const metadata = { title: "Camp tools — Camp 404" }` (page.tsx:16).
- **Four-stage gate chain (in order)** run before any render (page.tsx:41-53):
  1. `getAuthenticatedUserOrRedirect()` — auth gate; redirects to `/auth/sign-in` if unauthenticated (auth.ts:40-44).
  2. `ensureCampUser(authUser)` — resolves the camp-user row (or a synthetic non-persisted row) (users.ts:60-95).
  3. `hasCampAccess(campUser, authUser.primaryEmail)` false → `redirect("/signup/required")` (page.tsx:43-45) — invite gate.
  4. `isApproved(campUser, authUser.primaryEmail)` false → `redirect("/pending-approval")` (page.tsx:46-48) — captain-vetting gate.
  5. `campUser.rank !== "captain"` → `redirect("/")` (page.tsx:51-53) — captain-clearance gate (bounce home, NOT a locked view).
- **Tool list rendering.** Maps the in-file `TOOLS` array (page.tsx:30-38) into an unordered list of cards (page.tsx:69-93). Each card is a full-card `next/link` to `tool.href` wrapping a `Card` with: a 10×10 bordered icon square (`tool.icon`), `CardTitle` (`tool.title`, `text-base`), `CardDescription` (`tool.description`), and a trailing `ChevronRight` (page.tsx:72-90).
- **Back navigation.** A ghost `Button` (`size="sm"`) rendered `asChild` over `<a href="/">` labelled "Captains" with a leading `ChevronLeft` (page.tsx:57-61). Returns to home (the control panel).
- **Header.** `<h1>` "Camp tools"; subtitle "Captain-only tooling for running the camp." (page.tsx:62-67).
- **Layout container.** `<main className="mx-auto max-w-2xl px-6 py-10">` (page.tsx:56) — note `max-w-2xl`, wider than the global `max-w-lg` north-star; matches the member tools hub's `max-w-2xl`.

### Single current tool entry (`TOOLS` array, page.tsx:30-38)
Exactly one entry today:
- `href: "/captains/announcements"`
- `title: "Announcements & notifications"`
- `description: "Compose a camp-wide announcement, save it as a draft, then publish it to everyone. Choose how hard it lands — a full-screen note members must acknowledge, a pop-up, or a quiet inbox entry."`
- `icon: <Megaphone className="h-5 w-5" />` (lucide `Megaphone`).

### Entry point (`apps/web/app/page.tsx:172-177`)
- Reached from the captain control-panel quadrant tile `bottomRight` on the `rank: "captain"` layer: `label: "Camp Tools"`, `hint: "Announcements, ops…"`, `href: "/captains/tools"`, `icon: <Wrench className="h-5 w-5" />` (page.tsx:172-177). The Wrench icon is the shared tools entity icon; this page itself uses no Wrench in its own header.

## User actions & interactions
- **Tap a tool card** → navigate to that tool's `href`. Today the only card navigates to `/captains/announcements`. The entire card is a clickable `Link` (page.tsx:72-75).
- **Tap "Captains" back button** → navigate to `/` (home control panel) (page.tsx:57-61).
- **Keyboard focus** — the tool `Link` has `focus:outline-none focus-visible:ring-2 focus-visible:ring-ring` and rounded corners (`rounded-xl`) on the link wrapper (page.tsx:74). (Note: focus ring is on the `Link`; the member hub puts the ring on the `Card` instead — a cosmetic divergence, see Sub-components.)
- **Hover** — each `Card` has `transition-colors hover:bg-accent/30` (page.tsx:76).
- No forms, no inputs, no mutations occur on this page — it is purely a navigation index. All write/state actions live in the linked tool pages.

## States & presentations
Applicable global-states rows for this surface (no offline/sync rows, no budget rows):

- **Populated** — the only happy-path render: the gated captain sees the header + the `TOOLS` card list. With the current single-entry array there is exactly one card.
- **Empty** — structurally possible if `TOOLS` were emptied (the `<ul>` would render with no `<li>`); there is **no dedicated empty-state copy or placeholder**. Today `TOOLS` always has ≥1 entry, so the empty branch is effectively dead. `<!-- low-confidence: no empty-state component exists; an empty TOOLS array renders a bare <ul>. -->`
- **Loading** — none on-page; this is a server component that renders fully-resolved markup after its `await`ed gates. No skeletons/spinners.
- **Validation-error / Submitting / Success** — N/A on this surface (no forms or mutations). These states belong to the linked tool pages.
- **Disabled** — no disabled controls on this page.
- **Invite-gated** — `hasCampAccess` false → `redirect("/signup/required")` (page.tsx:43-45). Triggered when the user is not a god email AND has no `inviteCode` on their (possibly synthetic) row (users.ts:219-224).
- **Onboarding-incomplete** — **NOT enforced on this page.** Unlike the gating spine in `app/page.tsx`, this page does NOT call `getPendingRequiredActions`/`nextGate`; it only checks invite + approval + rank. A captain with pending blocking required actions would still see this page if they reach the URL directly. `<!-- low-confidence: onboarding gate is intentionally omitted here; only the home gating spine routes to /onboarding/questionnaire. -->`
- **Pending-approval** — `isApproved` false → `redirect("/pending-approval")` (page.tsx:46-48). True when not a god email AND `approvalStatus !== "approved"` (i.e. `pending` or `rejected`) (users.ts:231-236).
- **Rejected** — folded into the pending-approval redirect above: `approvalStatus === "rejected"` also fails `isApproved`, so a rejected user is sent to `/pending-approval` (the terminal denied state is surfaced there, not here).
- **Captain-only-locked** — **does NOT apply as a visible-but-locked layer here.** This page expresses captain-clearance as a hard bounce: `rank !== "captain"` → `redirect("/")` (page.tsx:49-53). There is no opacity-45/lock-icon treatment on this surface; the locked-layer treatment lives only on the home control-panel quadrant grid. Comment in source confirms: "Unlike the data-locked camp-management view, there is nothing useful to show a non-captain here, so bounce them home." (page.tsx:49-50).

## Enums, options & configurable values
- **`Rank`** (users.ts:32) = `"captain" | "member"`; stored via `rankEnum = pgEnum("rank", ["captain", "member"])` (schema.ts:31). This page gates on the literal `"captain"` (page.tsx:51). team-lead is DERIVED, never a stored rank.
- **`ApprovalStatus`** (users.ts:33) = `"pending" | "approved" | "rejected"`; stored via `approvalStatusEnum = pgEnum("approval_status", ["pending", "approved", "rejected"])` (schema.ts:41-45). `isApproved` compares against the literal `"approved"` (users.ts:235).
- **`TOOLS` array** (page.tsx:30-38) — the configurable list of tool cards. Each `ToolEntry` (page.tsx:23-28): `href: string`, `title: string`, `description: string`, `icon: React.ReactNode`. Adding a tool = appending an entry.
- **Redirect targets (literals):** `/auth/sign-in` (auth gate, auth.ts:42), `/signup/required` (invite gate, page.tsx:44), `/pending-approval` (approval gate, page.tsx:47), `/` (non-captain bounce, page.tsx:52).
- **Metadata title:** `"Camp tools — Camp 404"` (page.tsx:16).
- **Layout width:** `max-w-2xl` (page.tsx:56).
- No sliders, scales, ranges, or numeric thresholds on this surface.

## Data model touched
This page performs **reads only** (no writes). Fields read off `CampUser` (users.ts:39-47), which both the real Drizzle `users` row and the in-memory test store produce:
- `CampUser.rank` (`Rank`) — gated against `"captain"` (page.tsx:51). Maps to `users.rank` / `rankEnum` (schema.ts:31, schema.ts:231 `rank: rankEnum("rank").notNull().default("member")`).
- `CampUser.inviteCode` (`string | null`) — read by `hasCampAccess` (users.ts:220-223). Maps to `users.inviteCode`.
- `CampUser.approvalStatus` (`ApprovalStatus`) — read by `isApproved` (users.ts:231-235). Maps to `users.approvalStatus` / `approvalStatusEnum` (schema.ts:41, schema.ts:267 `approvalStatus: approvalStatusEnum("approval_status")`).
- `CampUser.authUserId` — used by `ensureCampUser` to look up the row (users.ts:65).
- `CampUser.id`, `CampUser.displayName`, `CampUser.profileImageUrl` — present on the shape but NOT used by this page.
- `AuthenticatedUser.primaryEmail` (`string | null`) — passed to `hasCampAccess`/`isApproved` for the god-email bypass via `isGodEmail` (access-control.ts:28-32, reads `process.env.GOD_EMAILS`).
- `AuthenticatedUser.id`, `AuthenticatedUser.displayName` — used by `ensureCampUser` to resolve/synthesize the row.

No table is mutated by this surface. (`ensureCampUser` MAY create a god-account row + seed a burner-profile required action on first sign-in (users.ts:70-80), but for any non-god user reaching this page that path is irrelevant — a captain already has a persisted row.)

## Validation, edge cases & business rules
- **Strict gate ordering matters.** Auth → invite (`hasCampAccess`) → approval (`isApproved`) → rank (`=== "captain"`). The first failing gate wins its redirect; later gates never run (page.tsx:41-53).
- **God-email bypass.** `isGodEmail(email)` (case-insensitive match against `GOD_EMAILS` CSV, access-control.ts:28-32) makes `hasCampAccess` AND `isApproved` both return `true` regardless of `inviteCode`/`approvalStatus` (users.ts:223, users.ts:235). **However, the rank gate still applies** — a god email whose row has `rank === "member"` would be bounced home from this page. (`ensureCampUser` creates god rows with `rank: "member"` (users.ts:75), so a god account is NOT automatically a captain; god rights are conceptually about access bypass, not the `captain` rank.) `<!-- low-confidence: god accounts get rank "member" on auto-create (users.ts:75), so a brand-new god email would be redirected to "/" here unless their rank was later set to captain. -->`
- **Synthetic non-persisted row.** A signed-in user with no row and no invite gets a synthetic `CampUser` with `id: ""`, `inviteCode: null`, `rank: "member"`, `approvalStatus: "approved"` (users.ts:86-94). On this page `hasCampAccess` reads `inviteCode: null` → false → bounce to `/signup/required` before the rank gate ever runs.
- **Onboarding gate intentionally absent here** — see States. Only invite + approval + rank are enforced; no `required_actions` check. A captain who hasn't completed onboarding could land here via direct URL.
- **No locked view for non-captains** — explicit product decision (page.tsx:49-50): bounce to `/` rather than render a captain-only-locked layer.
- **Test mode.** Under `E2E_TEST_MODE` the auth/user resolution routes through the in-memory test store/cookie (auth.ts:26-29, users.ts:64); gate semantics are identical. `isTeamLead` is always `false` in test mode (users.ts:448) but team-lead is irrelevant to this captain-clearance page.
- **Static-render guard.** `dynamic = "force-dynamic"` ensures the gates aren't cached across users (page.tsx:14).
- **`tool.href` typing.** `href` is typed `string`, but `next/link`'s typed-routes (`.next/types`) constrain it to known `AppRoutes`; the only current value `/captains/announcements` is a real built page (confirmed: `apps/web/app/captains/announcements/page.tsx` exists and back-links to `/captains/tools`).

## Sub-components / variants
- **Shared UI primitives (`@camp404/ui`):** `Card`, `CardDescription`, `CardHeader`, `CardTitle` (card component); `Button` (used `variant="ghost" size="sm" asChild` for the back link). Lucide icons: `ChevronLeft`, `ChevronRight`, `Megaphone` (page.tsx:3).
- **No bespoke sub-components** are defined on this page beyond the inline `ToolEntry` interface (page.tsx:23-28) and the `TOOLS` constant.
- **Mirror relationship / divergences vs the member tools hub (`apps/web/app/tools/page.tsx`, unit 10):**
  - Member hub has NO rank gate and NO non-captain bounce; it ends after the approval gate (tools/page.tsx:50-58). Captain hub adds the `rank !== "captain"` → `/` bounce (page.tsx:51-53).
  - Member hub has no back button; captain hub adds the "Captains" back-to-`/` button (page.tsx:57-61).
  - Focus-ring placement differs: captain hub puts `focus-visible:ring-2 focus-visible:ring-ring` (and `rounded-xl`) on the `Link`; member hub puts it on the `Card` (`focus-visible:ring-2`) and `focus:outline-none` on the `Link`. Functionally equivalent (both give a visible focus ring), styling differs.
  - Member hub `TOOLS`: Invite a member (`/tools/invite`, `Mail`), My forms (`/tools/forms`, `ClipboardList`), Family tree (`/family-tree`, `GitBranch`). Captain hub `TOOLS`: only Announcements & notifications.
  - Header copy: member "Tools" / "Uncategorised tooling for camp members…"; captain "Camp tools" / "Captain-only tooling for running the camp."
- **No dead/orphaned variants** within this file. The only latent dead branch is the empty-`TOOLS` render path (no card, no placeholder), which never triggers today.
