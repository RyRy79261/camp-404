# 16-captain-tools — app integration plan

- **Route:** `/captains/tools` · server-rendered page (RSC, no client components)
- **Surface brief:** `design/spec/surfaces/16-captain-tools.md`
- **Board:** `design/.spec-extract/boards/28-s19-captain-tools.txt`

---

## Current state — the existing route/files today

### `apps/web/app/captains/tools/page.tsx` (the only file for this route today)

A single async RSC. Confirmed content (all citations from the live file):

| Aspect | Current (live) | Gap vs spec |
|---|---|---|
| Gate chain | `getAuthenticatedUserOrRedirect` → `ensureCampUser` → `hasCampAccess` redirect → `isApproved` redirect → `rank !== "captain"` hard redirect to `/` (lines 41–53) | **Must change.** Decision #3 mandates preview-but-locked; the `redirect("/")` rank gate must be removed and replaced with a `CaptainLock` panel in place of the tool list |
| `TOOLS` array | One entry: Announcements/`Megaphone`, `href: "/captains/announcements"` (lines 30–38) | Missing the second planned entry (Roster & approvals / `Users` icon / `/captains/camp-management`); add when the roster surface ships |
| Subtitle copy | "Captain-only tooling for running the camp." (line 65) | Board canonical is "organising the camp." — **board wins** per surface brief §Divergences |
| GhostBack | `<Button asChild variant="ghost" size="sm">` with `<a href="/">` + `ChevronLeft h-4 w-4` (lines 57–60) | Inline divergent stub; must become `<GhostBack label="Captains" href="/" />` once the `GhostBack` molecule ships. Currently: icon `h-4 w-4` (16px) vs spec `h-5 w-5` (20px); padding wrong; label Inter 14px vs spec 15px/500 |
| Icon chip (`IconBadge`) | `<span className="flex h-10 w-10 items-center justify-center rounded-md border bg-muted/40">` (line 78) | Off-token: `bg-muted/40` must become `bg-muted border border-border`; size 40px must become `size-[46px]` (`IconBadge size="md"`) |
| `CardTitle` size | `text-base` (16px) (line 83) | Board spec is Inter/15px/700 — snap to the dense `CardTitle` 15px step |
| Focus ring | Correctly on `<Link>` wrapper with `rounded-xl` (lines 73–74) | Matches spec; no change needed |
| `force-dynamic` | Present (line 14) | Keep — session cookie read |
| No layout.tsx | No per-segment layout file | No change needed; root `apps/web/app/layout.tsx` covers the route |
| No actions.ts | No server actions | Correct — surface spec: no mutations, no forms |
| No client islands | No `"use client"` components | Correct — pure server render |

**No other files exist for this route today.** There is no `error.tsx`, `loading.tsx`, or `not-found.tsx` under `apps/web/app/captains/tools/`.

The route is referenced from:
- `apps/web/app/page.tsx` — the control panel's "Camp Tools" quadrant tile navigates here (confirmed by grep)
- `apps/web/app/captains/announcements/page.tsx` lines 36–39 — the `GhostBack` back-link points to `/captains/tools`

---

## File structure — target files after redesign

| File | Status | Change |
|---|---|---|
| `apps/web/app/captains/tools/page.tsx` | **MODIFY** | Remove `redirect("/")` rank gate; add `isCaptain` flag; conditionally render `<CaptainLock>` in place of `<ul>`; fix subtitle copy; swap inline chip for `<IconBadge>`; swap inline GhostBack for `<GhostBack>` (once molecule ships); fix `CardTitle` to 15px dense step |
| `apps/web/app/captains/tools/error.tsx` | **no change needed** | Surface has no forms/mutations; a root-level `error.tsx` covers unexpected crashes; no per-segment boundary required |
| `apps/web/app/captains/tools/loading.tsx` | **do not create** | Surface brief §States: "No skeletons or spinners." The page is a server component fully resolved before delivery |
| `apps/web/app/captains/tools/not-found.tsx` | **do not create** | No dynamic segments; 404 is not reachable through normal navigation |
| `apps/web/app/captains/tools/actions.ts` | **do not create** | No mutations; no server actions needed |
| `apps/web/app/captains/tools/layout.tsx` | **do not create** | No per-segment layout needed |

**Total files touched for this surface: 1** (`page.tsx` MODIFY only).

---

## Components composed

All rendering happens in the server component; there are no client islands.

| Component | Plan | Renders in | Current status in route |
|---|---|---|---|
| `GhostBack` | [`molecule-ghostback.md`](../components/molecule-ghostback.md) | Server (RSC) | Hand-rolled inline (`Button asChild variant="ghost"` + `<a href="/">` + `ChevronLeft h-4 w-4`) at lines 57–60 of current `page.tsx`. Replace once `GhostBack` PROMOTE lands in `@camp404/ui`. |
| `IconBadge` | [`atom-iconbadge.md`](../components/atom-iconbadge.md) | Server (RSC) | Hand-rolled inline `<span className="flex h-10 w-10 items-center justify-center rounded-md border bg-muted/40">` at line 78. Replace with `<IconBadge icon={tool.icon} size="md" shape="rounded" tone="muted" />` once `IconBadge` PROMOTE lands. |
| `CaptainLock` | [`molecule-captainlock.md`](../components/molecule-captainlock.md) | Server (RSC) | Not present today (replaced by hard redirect). NEW for this surface; renders in place of the `<ul>` when `!isCaptain`. Props: `scope="surface"` `body="This tooling is captain-only. Your rank doesn't have clearance for these tools."` |
| `Card` / `CardTitle` / `CardDescription` | — (existing `@camp404/ui/components/card`) | Server (RSC) | Present today (lines 4–9, 76, 83–85). REUSE; fix `CardTitle` size from `text-base` to `text-[15px] font-bold` (dense 15px step per board). |
| `Link` (next/link) | — | Server (RSC) | Present today (lines 1, 72–89). REUSE; focus ring already correctly on `<Link>` wrapper. |
| `ChevronRight` (lucide) | — | Server (RSC) | Present today (line 87). REUSE. |
| `Megaphone` (lucide) | — | Server (RSC) | Present today (line 3). REUSE. |
| `Users` (lucide) | — | Server (RSC) | Not yet in `TOOLS` array. **ADD** as icon for the second tool entry when the roster surface ships and `/captains/camp-management` is confirmed. |

**No `TopChrome`, `SectionHeader`, `DetailHeader`, `GridTile`, `InputField`, `EmptyState`, or `Spinner` components are used on this surface** (confirmed by surface brief §Components).

---

## Services & data

This surface performs reads only. No mutations, no server actions, no `/api` handlers.

### Server-side reads (performed before render)

| Call | Source module | When | Verdict |
|---|---|---|---|
| `getAuthenticatedUserOrRedirect()` | `apps/web/lib/auth.ts:127` | Always (auth gate) | **REUSE** — unchanged |
| `ensureCampUser(authUser)` | `apps/web/lib/users.ts:60` | After auth | **REUSE** — unchanged |
| `hasCampAccess(campUser, authUser.primaryEmail)` | `apps/web/lib/users.ts:219` (→ `core` after Phase 3 extraction) | After `ensureCampUser` | **REUSE** — the app wrapper call-site is stable; the pure body moves to `packages/core` but the call signature `(user, email)` is preserved via thin shim |
| `isApproved(campUser, authUser.primaryEmail)` | `apps/web/lib/users.ts:231` (→ `core` after Phase 3 extraction) | After `hasCampAccess` | **REUSE** — same shim pattern |
| `requireClearance(viewerRank, "captain")` | `packages/core` (NEW, plan 01) | After `isApproved` | **NEW** — replaces the inline `campUser.rank !== "captain"` check with the shared comparator. Returns `{ cleared: boolean }`. When `cleared === false`, pass no tool data and render `CaptainLock`. |

### What is NOT fetched for non-captains

When `!cleared`:
- The `TOOLS` array is a static in-file constant (not DB-backed) — it does not go to the DB regardless.
- Per the no-data grammar (`flows.md §3.3` invariant #2 and surface brief §"Locked variant"): even though `TOOLS` is static, the tool list is **not rendered** — only the `CaptainLock` panel is emitted. The server component branches on `isCaptain` before constructing the `<ul>`. No `href`, `title`, `description`, or `icon` data is emitted into the HTML for non-captains.

### Props passed to child components

All rendering is inlined in `page.tsx` (no separate child component file). No data is serialised to client components (there are none).

### `TOOLS` array — in-file constant, not DB-backed

```
TOOLS: ToolEntry[]  (type: { href: string; title: string; description: string; icon: LucideIcon })
```

Entries today (1 live, 1 planned):

| # | Title | Icon | Destination | Status |
|---|---|---|---|---|
| 1 | Announcements & notifications | `Megaphone` | `/captains/announcements` | Live |
| 2 | Roster & approvals | `Users` | `/captains/camp-management` | Planned — add when roster surface ships (open question OQ-1 below) |

New tools added by appending to `TOOLS` in code. No admin UI or DB backing is planned.

---

## Gating

### Gate chain (ordered; first failing gate wins)

1. **Auth gate** (`getAuthenticatedUserOrRedirect`) → unauthenticated → `redirect("/auth/sign-in")`. Hard redirect; surface never renders.
2. **Invite gate** (`hasCampAccess`) → no invite code → `redirect("/signup/required")`. Hard redirect; surface never renders.
3. **Approval gate** (`isApproved`) → not approved → `redirect("/pending-approval")`. Hard redirect; surface never renders.
4. **Rank gate** (`requireClearance(viewerRank, "captain")` from `packages/core`, plan 01) → **preview-but-locked** (Decision #3): the surface renders chrome (GhostBack + Intro) with a `CaptainLock` panel **in place of** the tool list. **No redirect.** No tool data, no card links emitted.

### God-email bypass

`isGodEmail(email)` (reads `GOD_EMAILS` env CSV in `apps/web/lib/access-control.ts`) forces gates 2 and 3 to pass regardless of `inviteCode`/`approvalStatus`. **Gate 4 still applies.** A god account with `rank === "member"` sees the preview-but-locked view; only a god account with `rank === "captain"` sees the full tool list. God accounts are auto-created with `rank: "member"` — see open question OQ-3.

### Preview-but-locked treatment detail

When `isCaptain === false`:

```
render:
  GhostBack (functional — navigates to /)
  <h1>Camp tools</h1>
  <p>Captain-only tooling for organising the camp.</p>
  <CaptainLock
    scope="surface"
    body="This tooling is captain-only. Your rank doesn't have clearance for these tools."
  />
  -- NO <ul>, NO <li>, NO <Link> tool cards, NO tool data --
```

The board annotation label "LOCKED — non-captain view" (Inter/11px/600/$muted-foreground) is a **Pencil design annotation only** and must NOT appear in the built surface.

---

## States

| State | Description | How produced |
|---|---|---|
| **Populated — captain** | `isCaptain === true`. GhostBack active. Intro rendered. `<ul>` with one (now) or two (when roster ships) `<li>` NavCard/ToolCard entries. Each card is a live `<Link>`. | `requireClearance` returns `cleared: true` |
| **Preview-but-locked — non-captain** | `isCaptain === false`. GhostBack active (navigates to `/`). Intro rendered. `<CaptainLock scope="surface" body="…">` replaces the `<ul>`. Zero tool data, zero `<Link>` elements, nothing tappable beyond GhostBack. | `requireClearance` returns `cleared: false` |
| **Loading** | None on-surface. Server component; markup fully resolved before HTTP response. No skeleton or spinner. | — |
| **Empty `TOOLS`** | If the static array is emptied: `<ul>` renders with no `<li>` (no crash, no `EmptyState`). This branch is dead today (`TOOLS` always has ≥1 entry) and will remain dead unless tool entries become runtime-configurable. | Structural edge case only |
| **Unauthenticated** | Auth gate → `redirect("/auth/sign-in")`. Surface never renders. | Gate 1 |
| **No invite** | Invite gate → `redirect("/signup/required")`. Surface never renders. | Gate 2 |
| **Not approved** | Approval gate → `redirect("/pending-approval")`. Surface never renders. | Gate 3 |
| **Submitting / Success / Error** | Not applicable — no forms or mutations on this surface. | — |
| **Disabled controls** | No explicitly disabled controls. In the locked state the tool list is absent (not dimmed-but-disabled). GhostBack is always active. | Locked = `CaptainLock` replaces the list entirely |

---

## Build steps

Prerequisites are listed in dependency order. Each step is independently CI-green (MEMORY: green-CI-is-done).

### Phase prerequisites (must land before this page can be built to spec)

| Prerequisite | Plan reference | Needed for |
|---|---|---|
| Foundations: `--radius`, `bg-muted`, `border-border`, `text-muted-foreground` token wiring | `foundations-tokens.md` Phase 0 | Correct `IconBadge` and `CaptainLock` token rendering |
| `@camp404/core` scaffold | `architecture.md` Phase 1 | `requireClearance` (access/clearance extraction) |
| `core` access/clearance extraction: `requireClearance`, `hasCampAccess`, `isApproved` (Phase 3a) | `service-layer/01-identity-access-gating.md` Steps 3–4 | Preview-but-locked pattern |
| `IconBadge` PROMOTE to `@camp404/ui` | `atom-iconbadge.md` Steps 1–2 | Correct icon chip rendering |
| `CaptainLock` PROMOTE to `@camp404/ui` | `molecule-captainlock.md` Steps 1–2 | Locked-state panel |
| `GhostBack` PROMOTE to `@camp404/ui` | `molecule-ghostback.md` Steps 1–2 | Spec-correct back navigation |

### Step 1 — Remove the hard redirect; add `isCaptain` branch (landing the D3 conversion)

**Touches:** `apps/web/app/captains/tools/page.tsx`

Remove lines 49–53 (`if (campUser.rank !== "captain") { redirect("/"); }`). Replace with:

```ts
const isCaptain = campUser.rank === "captain";
```

Conditionally replace the `<ul>` block with:

```tsx
{isCaptain ? (
  <ul className="space-y-3">
    {TOOLS.map((tool) => ( /* existing card markup */ ))}
  </ul>
) : (
  <CaptainLock
    scope="surface"
    body="This tooling is captain-only. Your rank doesn't have clearance for these tools."
  />
)}
```

Import `CaptainLock` from `@camp404/ui` (requires `CaptainLock` PROMOTE to have landed first — see prerequisites).

**Acceptance:**
- A signed-in member (`rank: "member"`) navigating to `/captains/tools` receives HTTP 200 with GhostBack + Intro + `CaptainLock` panel; zero `<a>` or `<Link>` tool-card elements in the response HTML.
- A signed-in captain (`rank: "captain"`) sees the tool list with live tappable `<Link>` elements.
- No `redirect("/")` remains in the file.
- E2E seam: use `E2E_TEST_MODE` with `testStore` users of both `rank: "member"` and `rank: "captain"` to assert the two render paths.

**CI gate:** lint + typecheck + `pnpm build --filter apps/web` green.

### Step 2 — Fix subtitle copy

**Touches:** `apps/web/app/captains/tools/page.tsx` line 65.

Change `"Captain-only tooling for running the camp."` → `"Captain-only tooling for organising the camp."` per board-canonical text (surface brief §Divergences, board source confirmed).

**Acceptance:** rendered subtitle reads "organising"; `pnpm build` green.

### Step 3 — Replace inline icon chip with `IconBadge`

**Touches:** `apps/web/app/captains/tools/page.tsx` line 78.

Swap:
```tsx
<span className="flex h-10 w-10 items-center justify-center rounded-md border bg-muted/40">
  {tool.icon}
</span>
```
for:
```tsx
<IconBadge icon={tool.icon} size="md" shape="rounded" tone="muted" />
```

`tool.icon` changes type from `React.ReactNode` to `LucideIcon` in `ToolEntry`. Update `TOOLS` entries accordingly (pass `Megaphone` as a component reference, not as `<Megaphone className="h-5 w-5" />`).

**Prerequisite:** `IconBadge` PROMOTE (`atom-iconbadge.md` Step 1–2) must have landed.

**Acceptance:** no `bg-muted/40`, no `h-10 w-10` inline classes in the tool chip slot; `IconBadge` renders at 46px with `bg-muted border border-border`; visual output matches board `28-s19-captain-tools.txt` IconChip anatomy.

### Step 4 — Replace inline GhostBack with `GhostBack` molecule

**Touches:** `apps/web/app/captains/tools/page.tsx` lines 57–60.

Remove:
```tsx
<Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5">
  <a href="/">
    <ChevronLeft className="h-4 w-4" /> Captains
  </a>
</Button>
```

Replace with:
```tsx
<GhostBack label="Captains" href="/" className="mb-4" />
```

Remove unused `ChevronLeft` and `Button` imports if no longer used elsewhere in the file.

**Prerequisite:** `GhostBack` PROMOTE (`molecule-ghostback.md` Steps 1–2) must have landed.

**Acceptance:** back navigation renders Inter 15px/500 `$muted-foreground` chevron + "Captains" label; `h-5 w-5` icon; tapping navigates to `/`; no `Button` ghost wrapper remains; no unused imports.

### Step 5 — Fix `CardTitle` size

**Touches:** `apps/web/app/captains/tools/page.tsx` line 83.

Change `<CardTitle className="text-base">` → `<CardTitle className="text-[15px] font-bold">` per the board's Inter/15px/700 dense list-row CardTitle spec (design-tokens.md §1.2; surface brief §ToolCard anatomy).

**Acceptance:** title renders at 15px/700; `text-base` (16px) class removed.

### Step 6 — Wire `requireClearance` from `@camp404/core` (Phase 4 alignment)

**Touches:** `apps/web/app/captains/tools/page.tsx`

After `@camp404/core` extraction (Phase 3a of architecture plan), replace the inline:

```ts
const isCaptain = campUser.rank === "captain";
```

with:

```ts
const viewerRank = deriveViewerRank({ rank: campUser.rank, isTeamLead: false });
// captain tools: team_lead does not clear captain; skip isTeamLead DB call (not needed here)
const { cleared: isCaptain } = requireClearance(viewerRank, "captain");
```

Note: this surface does not need the `isTeamLead` DB probe (team lead does not clear captain rank — `rankLevel("team_lead") < rankLevel("captain")`). A non-captain with team-lead derivation would still get `cleared: false`. The inline `campUser.rank === "captain"` boolean produces the same result for all current rank values — the `requireClearance` swap is a pattern normalisation, not a behaviour change.

**Prerequisite:** `packages/core` `requireClearance` + `deriveViewerRank` shipped (Phase 3a, plan 01 Step 4).

**Acceptance:** `requireClearance(viewerRank, "captain")` returns `{ cleared: true }` for captain, `{ cleared: false }` for member/team_lead. Behaviour identical to inline boolean check. `pnpm build` green; `pnpm test --filter apps/web` green (add a unit test asserting the page's data-branch returns zero tool data when `!cleared`).

### Step 7 — Add Roster & approvals `TOOLS` entry (when roster surface ships)

**Touches:** `apps/web/app/captains/tools/page.tsx` — append to `TOOLS`.

```ts
{
  href: "/captains/camp-management",
  icon: Users,
  title: "Roster & approvals",
  description: "Review pending members, approve or decline sign-ups, and manage who's on camp.",
},
```

**Prerequisite:** confirm `/captains/camp-management` route is built and registered; verify the `href` value against `AppRoutes` typed routes (open question OQ-1 below).

**Acceptance:** second card renders with `Users` icon, correct copy, live `<Link href="/captains/camp-management">`; non-captains still see `CaptainLock` (not the roster card).

---

## Open items

Cross-referenced to `design/spec/open-questions.md` where applicable.

| # | Item | Owner | Severity | Cross-ref |
|---|---|---|---|---|
| OQ-1 | **Roster card destination.** The board's second tool entry points to "Roster & approvals" → `/captains/camp-management`. Do not ship the second `TOOLS` entry until the destination route exists and its `AppRoutes` typed path is confirmed. The brief documents it as a planned entry, not a current one. | eng | med | Surface brief §OQ1; `open-questions.md` (no direct entry — this is surface-specific) |
| OQ-2 | **Annotation label must not ship.** Board `28-s19-captain-tools.txt` includes a "LOCKED — non-captain view" label (Inter/11px/600/$muted-foreground) as a Pencil design annotation inside the locked variant. This text must not appear in the built surface. The `CaptainLock` panel is the only user-facing locked treatment. | eng | med | Surface brief §OQ2; `molecule-captainlock.md` §"Locked variant" |
| OQ-3 | **God accounts and captain rank.** God accounts are auto-created with `rank: "member"` (`users.ts:75`). A new god sign-up sees the non-captain locked view. Confirm whether god rows should be minted with `rank: "captain"` or must be manually promoted before accessing captain surfaces. The rank gate applies to god accounts regardless of G1/G3 bypass. | product | low | Surface brief §OQ3; `service-layer/01-identity-access-gating.md` §Cross-domain |
| OQ-4 | **Onboarding gate absent by design.** This surface skips `required_actions` / `nextGate` — a captain with pending blocking required actions can navigate directly here. Confirm this is an acceptable product exception (captains are trusted; the home gating spine handles the onboarding funnel for members). | product | low | Surface brief §OQ4 |
| OQ-5 | **Static `TOOLS` array indefinitely.** No empty-state component exists if `TOOLS` is emptied. Confirm whether the array will remain code-side permanently or if tool entries will ever become runtime-configurable (if so, an `EmptyState` and a DB-backed read must be wired). | product, eng | low | Surface brief §OQ5 |
| OQ-6 | **Focus-ring placement standardisation.** The current page correctly places `focus-visible:ring-2 focus-visible:ring-ring` on the `<Link>` wrapper (`rounded-xl`). The member tools hub (`/tools/page.tsx`) places the ring on the `<Card>`. Once `NavCard` ships as a shared component (plan `molecule-navcard.md`), standardise ring placement across both hubs (recommendation: ring on `Link` with `rounded-xl` matches the captain hub and encapsulates the full interactive target). | eng | low | Surface brief §OQ6; `molecule-navcard.md` §Gaps |
