# 10 — Tools hub

**Files covered:**
- `apps/web/app/tools/page.tsx` — the Tools hub itself: a server component that auth/invite/approval-gates, then renders a static card index of 3 sub-tool links.
- `apps/web/lib/auth.ts` — `getAuthenticatedUserOrRedirect()`: resolves the auth session (Neon Auth or E2E test cookie) or bounces to `/auth/sign-in`.
- `apps/web/lib/users.ts` — `ensureCampUser()`, `hasCampAccess()`, `isApproved()`: resolve/synthesise the camp-user row and evaluate the invite + approval gates the page enforces.
- `apps/web/lib/access-control.ts` — `isGodEmail()`: the god-account bypass both gate predicates honour.
- `packages/ui/src/components/card.tsx` — `Card` / `CardHeader` / `CardTitle` / `CardDescription` primitives the index cards are built from.
- `apps/web/app/page.tsx` (lines 124-129, entry quadrant only) — the home control-panel "Tools" tile (`Wrench`, hint "Meals, expenses…", `href: "/tools"`) that links into this hub.

**Purpose:** The Tools hub (`/tools`) is the camp-member "uncategorised toolbox" — a flat, link-only landing page reached from the bottom-right "Tools" quadrant of the home control panel. It is a curated index of camp utilities that do not yet live under a more specific quadrant. It performs no data mutation and holds no per-tool logic; its sole behaviour is (1) enforce the auth → invite → approval gate chain, then (2) render a hardcoded list of three navigation cards (Invite a member, My forms, Family tree) that deep-link to other units. It is the parent/index for units 11 (invite), 12 (my-forms) and 13 (family-tree), but contains none of their functionality.

## Features

### Tools hub page (`app/tools/page.tsx`)
- **Route:** `/tools`. Server component (`async function ToolsPage`), default export.
- **`export const dynamic = "force-dynamic";`** (page.tsx:13) — disables static caching so the gate checks run per request against live session/user state.
- **`export const metadata = { title: "Tools — Camp 404" };`** (page.tsx:15) — sets the document/tab title.
- **Three-stage gate chain** run before any render (page.tsx:51-58), in order:
  1. `getAuthenticatedUserOrRedirect()` → returns `AuthenticatedUser` or `redirect("/auth/sign-in")` (auth.ts:40-44).
  2. `ensureCampUser(authUser)` → resolves a `CampUser` row (real DB or in-memory test store; god accounts auto-created+approved; otherwise a synthetic non-persisted row) (users.ts:60-95).
  3. `if (!hasCampAccess(campUser, authUser.primaryEmail)) redirect("/signup/required");` (page.tsx:53-55) — invite gate.
  4. `if (!isApproved(campUser, authUser.primaryEmail)) redirect("/pending-approval");` (page.tsx:56-58) — captain-vetting gate.
- **Header** (page.tsx:62-68): `<h1>` "Tools"; subtext paragraph "Uncategorised tooling for camp members. We'll move tools into dedicated quadrants as we group them."
- **Card index** (page.tsx:70-91): renders `TOOLS.map(...)` as a vertical `<ul>` of `<li>`-wrapped `<Link>` cards. Each card shows: a bordered icon chip (`h-10 w-10`), the tool `title`, the tool `description`, and a trailing `ChevronRight` affordance.
- **Layout container:** `<main className="mx-auto max-w-2xl px-6 py-10">` (page.tsx:61). Note: this surface uses `max-w-2xl`, not the product-wide `max-w-lg`. <!-- low-confidence: max-w-2xl here vs the documented mobile-first max-w-lg shell — recorded verbatim from page.tsx:61, not reconciled against the global layout. -->

### Entry point — home "Tools" quadrant (`app/page.tsx:124-129`)
- The hub is reached from the `camp_member` layer's `bottomRight` quadrant tile: `label: "Tools"`, `hint: "Meals, expenses…"`, `href: "/tools"`, `icon: <Wrench className="h-5 w-5" />`.
- Note: the quadrant hint advertises "Meals, expenses…" but the actual hub list contains Invite/My forms/Family tree — no meals or expenses tool is present in `TOOLS`. The page subtitle similarly anticipates future tools ("We'll move tools into dedicated quadrants").

## User actions & interactions
- **Tap a tool card** → client-side navigation (Next.js `<Link>`) to that tool's `href`. Three targets:
  - "Invite a member" → `/tools/invite` (unit 11).
  - "My forms" → `/tools/forms` (unit 12).
  - "Family tree" → `/family-tree` (unit 13).
- **Keyboard focus:** each `<Link>` has `className="block focus:outline-none"` and the inner `Card` carries `focus-visible:ring-2 focus-visible:ring-ring` — focus ring renders on the card, not the link outline.
- **Hover:** `Card` has `transition-colors hover:bg-accent/30` — card background tints toward accent on hover.
- There are **no buttons, no forms, no inputs, no mutations, no submit, and no voice/PTT** on this surface. The only interaction is link navigation.

## States & presentations
The hub list is built from a **compile-time constant** (`TOOLS`), so several of the standard global-states rows are structurally not reachable here:
- **Populated:** the only data state. Always exactly 3 cards (Invite, My forms, Family tree). Never empty in practice.
- **Empty:** not reachable — `TOOLS` is a non-empty hardcoded array; there is no query that could return zero rows. (`{TOOLS.map(...)}` would render an empty `<ul>` only if the constant were emptied in code.) <!-- INCOMPLETE? Empty-state has no runtime path; documented as N/A. -->
- **Loading:** no async data fetch inside the body — the page awaits only the gate helpers (`getAuthenticatedUserOrRedirect`, `ensureCampUser`), which resolve before first paint. `dynamic = "force-dynamic"` means it renders fresh per request; no skeleton/spinner exists.
- **Validation-error / Submitting / Success:** N/A — no form, no mutation on this surface.
- **Disabled:** N/A — no controls can be disabled; all three cards are always active links.
- **Invite-gated:** if `hasCampAccess(campUser, primaryEmail)` is false (no god email AND no `inviteCode`), the page never renders — `redirect("/signup/required")` (page.tsx:53-55).
- **Onboarding-incomplete:** NOT enforced on this surface. `/tools` does not call `getPendingRequiredActions` / `nextGate`; the onboarding gate is handled upstream by the home gating spine (`app/page.tsx`), not here. A user with a pending blocking required action who navigates directly to `/tools` is gated only by invite + approval, not onboarding.
- **Pending-approval:** if `isApproved(...)` is false (`approvalStatus !== "approved"` and not a god email), `redirect("/pending-approval")` (page.tsx:56-58). E2E coverage: `tests/e2e/authenticated.spec.ts:91-92` asserts a pending member hitting `/tools` lands on `/pending-approval`.
- **Rejected:** terminal case of the approval gate — `approvalStatus === "rejected"` also fails `isApproved`, so it likewise redirects to `/pending-approval` (page.tsx:56-58). The hub does not distinguish rejected from pending; both route to the same gate.
- **Unauthenticated:** `redirect("/auth/sign-in")` (auth.ts:42). E2E coverage: `tests/e2e/authenticated.spec.ts:100-101`.
- **Captain-only-locked:** N/A — `/tools` is the camp-member layer surface; it has no rank-above-viewer lock. (Captain tooling lives at the separate `/captains/tools` route, not this hub.)

## Enums, options & configurable values
- **`TOOLS: ToolEntry[]`** (page.tsx:28-48) — the entire content model. Each entry: `{ href: string; title: string; description: string; icon: React.ReactNode }` (interface `ToolEntry`, page.tsx:21-26). Verbatim entries:
  1. `href: "/tools/invite"`, `title: "Invite a member"`, `description: "Mint a single-use code to bring someone onto Camp 404."`, `icon: <Mail className="h-5 w-5" />`.
  2. `href: "/tools/forms"`, `title: "My forms"`, `description: "Revisit a questionnaire you've already completed, update your answers, and see what changed."`, `icon: <ClipboardList className="h-5 w-5" />`.
  3. `href: "/family-tree"`, `title: "Family tree"`, `description: "See who brought who onto camp."`, `icon: <GitBranch className="h-5 w-5" />`.
- **Icons used:** `Mail`, `ClipboardList`, `GitBranch` (per-card, lucide), plus `ChevronRight` (trailing affordance, every card). All sized `h-5 w-5` for tool icons; `ChevronRight` is `h-5 w-5 text-muted-foreground`.
- **Gate predicate enums it consumes** (not owned here):
  - `Rank = "captain" | "member"` (users.ts:32).
  - `ApprovalStatus = "pending" | "approved" | "rejected"` (users.ts:33). Only `"approved"` (or a god email) passes `isApproved`.
- **Env-driven config affecting the gates** (read indirectly): `GOD_EMAILS` (CSV, case-insensitive — `isGodEmail`, access-control.ts:28-32) bypasses both invite and approval gates; `INVITE_CODES` (CSV bootstrap codes) and DB invite codes feed `hasCampAccess` via `inviteCode`.

## Data model touched
The hub **reads, never writes.** Fields it depends on, via `CampUser` (interface, users.ts:39-47):
- `CampUser.inviteCode: string | null` — read by `hasCampAccess(user, email)` (users.ts:219-224): returns `isGodEmail(email) || !!user.inviteCode`.
- `CampUser.approvalStatus: ApprovalStatus` — read by `isApproved(user, email)` (users.ts:231-236): returns `isGodEmail(email) || user.approvalStatus === "approved"`.
- `AuthenticatedUser` (auth.ts:13-17): `id: string`, `primaryEmail: string | null`, `displayName: string | null`. `id` resolves the row; `primaryEmail` feeds `isGodEmail`.
- `ensureCampUser` may have a side effect for *other* users but on this path is read-only for an existing row; for a god account on first sign-in it auto-creates an approved `member` row and calls `seedBurnerProfileAction` (users.ts:70-80) — this is `ensureCampUser`'s own behaviour, not hub-specific logic.
- Underlying persisted columns (via `@camp404/db/burner-profile` `toCampUser`, users.ts:462-480): `id`, `authUserId`, `displayName`, `profileImageUrl`, `inviteCode`, `rank`, `approvalStatus`. The hub uses only `inviteCode` and `approvalStatus` of these. The `TOOLS` list is **not** persisted — it is source-code constant data with no table.

## Validation, edge cases & business rules
- **Gate order is fixed and short-circuiting** (page.tsx:51-58): auth → camp-user resolve → invite gate → approval gate. Each failing gate `redirect`s (throws) before the next runs and before any markup renders.
- **God-account bypass:** an email in `GOD_EMAILS` passes both `hasCampAccess` and `isApproved` regardless of `inviteCode`/`approvalStatus` (users.ts:223, 235). `isGodEmail(null)` is false (access-control.ts:29).
- **Synthetic non-persisted row:** an authed user with no DB row and no invite gets a synthetic `CampUser` with `id: ""`, `inviteCode: null`, `approvalStatus: "approved"` (users.ts:86-94). `hasCampAccess` reads `inviteCode: null` → false → bounces to `/signup/required`. The `approvalStatus: "approved"` on the synthetic row never matters because the invite gate fires first.
- **Approval gate treats `pending` and `rejected` identically** — both redirect to `/pending-approval` (no separate rejected screen at this surface).
- **Onboarding gate is intentionally absent here** — unlike the home spine, `/tools` does not block on `getPendingRequiredActions`/`nextGate`. Only invite + approval are enforced.
- **E2E test mode:** when `isE2ETestMode()`, the auth user comes from the `camp404_test_user` cookie (auth.ts:26-29, `TEST_USER_COOKIE`) and the user backend is the in-memory `testStore` (users.ts:64). Behaviour of the gates is otherwise identical.
- **No client-side validation, no debouncing, no rate limiting, no error boundaries** are defined on this surface — it has no inputs and triggers no network calls beyond the implicit gate reads.
- **Restyle constraint:** disambiguation is by ICON + LABEL only (Mail/ClipboardList/GitBranch + titles); cards carry no per-entity colour and must not introduce one. All three cards must remain present and route to their exact `href`s; the trailing `ChevronRight` is the only navigational affordance.

## Sub-components / variants
- **`ToolEntry`** (page.tsx:21-26) — the data interface for a card row. Not exported; local to the page.
- **`TOOLS`** (page.tsx:28-48) — the constant list. The single source of card content; restyle freely but preserve all three entries verbatim.
- **`Card` family** (`packages/ui/src/components/card.tsx`): the hub uses `Card`, `CardHeader`, `CardTitle`, `CardDescription` only. **`CardContent` and `CardFooter` are exported by the primitive but unused on this surface** (orphaned w.r.t. the Tools hub; they are general primitives, not dead globally). Note `CardTitle`'s primitive default is `text-2xl` but the hub overrides it to `text-base` (page.tsx:80); `CardDescription` adds `mt-0.5`.
- **Card icon chip** (page.tsx:76-78): `<span className="flex h-10 w-10 items-center justify-center rounded-md border bg-muted/40">{tool.icon}</span>` — inline composition, no named component.
- **Server-only helpers consumed (not owned here), for completeness:**
  - `getAuthenticatedUserOrRedirect` (auth.ts:40-44) — auth gate.
  - `ensureCampUser` (users.ts:60-95) — row resolver/creator.
  - `hasCampAccess` (users.ts:219-224) — invite-gate predicate.
  - `isApproved` (users.ts:231-236) — approval-gate predicate.
  - `isGodEmail` (access-control.ts:28-32) — bypass predicate consumed by both gate predicates.
- **No dead branches inside the hub itself**; the only stale/aspirational content is the forward-looking copy ("We'll move tools into dedicated quadrants…") and the home quadrant hint "Meals, expenses…" which does not match the current 3-tool list.
