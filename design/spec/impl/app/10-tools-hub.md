# 10-tools-hub — app integration plan

- **Route(s):** `/tools` · routed page
- **Surface spec:** `design/spec/surfaces/10-tools-hub.md`
- **Board:** `design/.spec-extract/boards/22-s13-tools-hub.txt` (board #22, 430×560 px)
- **No rank gate.** Every approved camp member reaches this surface. No `CaptainLock`.

---

## Current state — the existing route/files today

### Route file

`apps/web/app/tools/page.tsx` — **EXISTS**. Server component, 94 lines.

| Aspect | Live today | Spec requires | Delta |
|---|---|---|---|
| Gate chain | `getAuthenticatedUserOrRedirect` → `ensureCampUser` → `hasCampAccess` → `isApproved` (correct order) | Same, unchanged | **REUSE** |
| `dynamic` | `export const dynamic = "force-dynamic"` | Required | **REUSE** |
| `DetailHeader` | Absent — uses a plain `<header>` with `<h1>` + `<p>` (lines 62–68); no back affordance | `<DetailHeader title="Tools" backHref="/" />` as a separate row above the header block | **EXTEND** |
| Header block | `<h1 className="text-2xl font-semibold">Tools</h1>` + subtitle `p` (lines 63–67) | `<h1>` Inter/26px/700, subtitle Inter/14px/$muted-foreground | **EXTEND** (token class change; copy change for subtitle — "quadrants" → "sections") |
| Subtitle copy | "…dedicated quadrants as we group them." | "…dedicated sections as we group them." | **EXTEND** (board wins per surface spec §Divergences) |
| Invite card description | "Mint a single-use code to bring someone onto Camp 404." | "Mint a named invite link to bring someone onto Camp 404." | **EXTEND** (stale copy fix per `decisions.md` carry-forward + `10-tools-hub.md §Divergences`) |
| NavCard — wrapping | `<Link href={tool.href} className="block focus:outline-none">` wrapping `<Card>` | `NavCard` from `@camp404/ui`, wrapping `<Link asChild>` — focus ring on Link wrapper | **EXTEND** (replace inline composition with shared `NavCard`) |
| NavCard — icon chip | `<span className="flex h-10 w-10 items-center justify-center rounded-md border bg-muted/40">` | `<IconBadge size="md" shape="rounded" tone="muted" />` — 44–46 px, `bg-muted border-border` (no `/40` alpha) | **EXTEND** (IconBadge replaces inline span; size 40 px → md 46 px) |
| NavCard — focus ring | `focus-visible:ring-2 focus-visible:ring-ring` on `<Card>`, not on `<Link>` | Ring must be on `<Link>` wrapper with `rounded-[--radius]` (surface spec §Components; `molecule-navcard.md` gap table; `open-questions.md` E35) | **EXTEND** |
| NavCard — hover | `hover:bg-accent/30` on `<Card>` ✓ | Same | **REUSE** |
| `TOOLS` constant | `interface ToolEntry { href, title, description, icon: React.ReactNode }` — 3 entries; icons stored as JSX elements | Icon prop becomes `LucideIcon` component reference (not pre-rendered JSX) — passed to `NavCard icon` prop | **EXTEND** |
| Layout container | `mx-auto max-w-2xl px-6 py-10` | Board: 430 px mobile-first, no explicit desktop max-width. `max-w-2xl` carried from live code (see surface spec §Divergences — low-confidence, retain pending desktop breakpoint). | **REUSE (tentative)** |
| Content region layout | `<ul className="space-y-3">` + `<li>` per card | Vertical stack, gap 12 (spec says `gap 12`) — `space-y-3` is 12 px; `<ul>/<li>` vs bare `<div>` is implementation choice | **REUSE / minor adjust** |
| Padding wrapper | `px-6 py-10` on `<main>` | Content region: padding `[8, 16, 24, 16]` (top 8, right 16, bottom 24, left 16) | **EXTEND** (tighten to spec padding tokens) |

### Sibling routes (NOT modified by this surface's plan)

- `apps/web/app/tools/invite/page.tsx` — S14; separate plan
- `apps/web/app/tools/forms/page.tsx` — S15; separate plan (`NavCard` inline also replaced there per `molecule-navcard.md` step 7, but that is the S15 plan's remit)
- `apps/web/app/tools/forms/[key]/page.tsx` — S15 child; separate plan

### Layout / error / not-found files

No `layout.tsx`, `error.tsx`, or `not-found.tsx` exist under `apps/web/app/tools/`. None are required by this surface (gate-chain redirects handle auth/access errors; no data-fetch errors can occur since the tool list is a compile-time constant).

### Lib modules called

- `apps/web/lib/auth.ts` — `getAuthenticatedUserOrRedirect` (unchanged)
- `apps/web/lib/users.ts` — `ensureCampUser`, `hasCampAccess`, `isApproved` (app-layer wrappers; post-Phase 3 these call `@camp404/core` internally but call-sites in this file are unchanged)

---

## File structure — target files in apps/web

| File | Status | Action |
|---|---|---|
| `apps/web/app/tools/page.tsx` | EXISTS | **MODIFY** — the only file changed by this plan |
| `apps/web/app/tools/invite/*` | EXISTS | No change (S14 plan) |
| `apps/web/app/tools/forms/*` | EXISTS | No change (S15 plan) |
| `apps/web/app/tools/layout.tsx` | ABSENT | **DO NOT CREATE** — no route-group layout needed |
| `apps/web/app/tools/error.tsx` | ABSENT | **DO NOT CREATE** — no async data to fail; gate errors are redirects |
| `apps/web/app/tools/not-found.tsx` | ABSENT | **DO NOT CREATE** — no dynamic segments; a wrong URL hits Next.js root not-found |

No new server actions, no `/api` route handlers, no `"use client"` islands, and no layout files are needed for this surface. The page is a pure server component rendering a static list behind a gate chain.

---

## Components composed

All rendering is server-side (RSC). No `"use client"` islands on this surface.

| Component | Plan | Render context | Props on this surface |
|---|---|---|---|
| `DetailHeader` | [`molecule-detailheader.md`](../components/molecule-detailheader.md) | Server (RSC) | `title="Tools"` `backHref="/"` |
| `NavCard` | [`molecule-navcard.md`](../components/molecule-navcard.md) | Server (RSC) | `icon={Mail\|ClipboardList\|GitBranch}` `title` `description` `href`; no `meta`, no `disabled` |
| `IconBadge` | [`atom-iconbadge.md`](../components/atom-iconbadge.md) | Server (RSC, composed inside NavCard) | `size="md"` `shape="rounded"` `tone="muted"` — applied by `NavCard` internally; not called directly from this page |

Lucide icons (`Mail`, `ClipboardList`, `GitBranch`, `ChevronRight`) are passed as component references through `NavCard`'s `icon` prop and rendered inside `NavCard`/`IconBadge` — they are not imported directly into `page.tsx` after the refactor (the `ChevronRight` import is removed from the page; `NavCard` owns it internally).

**No `CaptainLock`, no `TopChrome`, no `SectionHeader`, no `GridTile`, no `EmptyState`** on this surface. The surface spec explicitly excludes all of these (`10-tools-hub.md §Components`).

---

## Services & data

This surface performs **no data fetches beyond the gate chain**. The tool list is a compile-time constant.

| Call | Service / lib module | When called | What it returns | Used for |
|---|---|---|---|---|
| `getAuthenticatedUserOrRedirect()` | `apps/web/lib/auth.ts:127` | Server-side, before render | `AuthenticatedUser` or redirects to `/auth/sign-in` | G0 gate |
| `ensureCampUser(authUser)` | `apps/web/lib/users.ts:60` | Server-side, after auth | `CampUser` (real or synthetic god-row) | Resolves the camp row |
| `hasCampAccess(campUser, authUser.primaryEmail)` | `apps/web/lib/users.ts:219` (post-Phase 3: thin shim over `@camp404/core`) | Server-side, after `ensureCampUser` | `boolean` | G1 gate → redirect `/signup/required` |
| `isApproved(campUser, authUser.primaryEmail)` | `apps/web/lib/users.ts:231` (post-Phase 3: thin shim) | Server-side, after `hasCampAccess` | `boolean` | G3 gate → redirect `/pending-approval` |

**Nothing server-side is passed as props**. The gate chain runs, then the static `TOOLS` constant is rendered directly. No props cross the server→client boundary because there are no client components.

**`users.rank` is NOT read** on this surface. There is no rank gate and no `requireClearance` call. The `ViewerRank`/`deriveViewerRank` helpers from `@camp404/core` are not used here.

**`getPendingRequiredActions` / `nextGate` are NOT called** on this surface (the onboarding gate exception — see `10-tools-hub.md §Validation & edge cases`; cross-referenced `open-questions.md` D7).

### E2E test mode seam

`getAuthenticatedUserOrRedirect` routes through `isE2ETestMode()` internally (`lib/test-mode.ts:11`). When `E2E_TEST_MODE=1`, the auth user comes from the `camp404_test_user` cookie and the user backend is the in-memory `testStore`. The gate logic is otherwise identical. **No seam code is needed in `page.tsx` itself** — the existing auth/user libs handle the branch.

Existing E2E coverage in `apps/web/tests/e2e/authenticated.spec.ts`:
- Line 91–93: pending-approval user navigating to `/tools` is redirected to `/pending-approval` ✓
- Line 100–101: unauthenticated visit to `/tools` redirects to `/auth/sign-in` ✓

---

## Gating

| Gate | Mechanism | Effect |
|---|---|---|
| **Auth (G0)** | `getAuthenticatedUserOrRedirect()` — server-side cookie read | Null auth → redirect `/auth/sign-in` |
| **Invite access (G1)** | `hasCampAccess(campUser, email)` | No invite code → redirect `/signup/required` |
| **Approval (G3)** | `isApproved(campUser, email)` | `pending` or `rejected` → redirect `/pending-approval` |
| **Rank gate** | **NONE** | This is a camp-member-layer surface; no `CaptainLock`, no `requireClearance`, no rank check |
| **Onboarding gate** | **INTENTIONALLY ABSENT** | `getPendingRequiredActions`/`nextGate` not called; product exception confirmed in surface spec |

Gate ordering is strict and unchanged from the live code: auth → ensureCampUser → hasCampAccess → isApproved. First failing gate redirects; subsequent gates never run.

**God-email bypass**: `isGodEmail(email)` forces `hasCampAccess` and `isApproved` to `true` regardless of `inviteCode`/`approvalStatus`. God accounts reach this surface unconditionally (once authenticated). No rank restriction applies.

---

## States

| State | How it manifests on this surface |
|---|---|
| **Populated (only data state)** | Always exactly 3 `NavCard`s. Static constant — no async, no skeletons. Server component delivers fully-resolved markup. |
| **Unauthenticated** | `getAuthenticatedUserOrRedirect()` → redirect `/auth/sign-in`. Surface never renders. |
| **Invite-gated** | `hasCampAccess` false → redirect `/signup/required`. Surface never renders. |
| **Pending approval** | `isApproved` false → redirect `/pending-approval`. Both `pending` and `rejected` statuses take this path; the surface does not distinguish them. |
| **Loading** | None on-surface. RSC; fully resolved before delivery. `force-dynamic` ensures per-request render, not a stale static. |
| **Empty** | Structurally unreachable — the tool list is a non-empty compile-time constant. No `EmptyState` component is used. |
| **Preview-but-locked / rank-gated** | NOT APPLICABLE — camp-member surface; all approved members access it. |
| **Error** | No async data fetches; no error boundary needed on this surface. Gate errors are redirects, not thrown exceptions. |
| **Submitting / validation error / success** | NOT APPLICABLE — no forms, no mutations, no server actions. |
| **Disabled** | NOT APPLICABLE — no controls exist that can be disabled; all three NavCards are always active links. |

---

## Build steps

Prerequisites must land before this surface can be finalised. Steps within the surface are listed in dependency order.

### Prerequisite A — Foundations tokens (Phase 0)

`design/spec/impl/foundations-tokens.md` must land first. The `NavCard`/`IconBadge`/`DetailHeader` components use `bg-muted`, `border-border`, `text-foreground`, `text-muted-foreground`, `ring-ring`, `rounded-[--radius]`, `bg-accent/30` — all confirmed-existing tokens. The `muted` tone on `IconBadge` does **not** depend on the new `success`/`warning` status tokens, so this surface is not blocked on those.

### Prerequisite B — `IconBadge` atom ships (`atom-iconbadge.md`)

`packages/ui/src/components/icon-badge.tsx` must be exported from `@camp404/ui` before `NavCard` can compose it.
- Acceptance: `import { IconBadge } from "@camp404/ui"` resolves; `pnpm --filter @camp404/ui test` green.

### Prerequisite C — `NavCard` molecule ships (`molecule-navcard.md`)

`packages/ui/src/components/nav-card.tsx` must be exported from `@camp404/ui` (Steps 1–2 of the NavCard plan).
- Acceptance: `import { NavCard } from "@camp404/ui"` resolves in `apps/web`.
- The `asChild`/`Slot` pattern is used; `next/link` is NOT imported inside the package.

### Prerequisite D — `DetailHeader` molecule ships (`molecule-detailheader.md`)

`packages/ui/src/components/detail-header.tsx` must be exported (Steps 1–2 of the DetailHeader plan).
- Acceptance: `import { DetailHeader } from "@camp404/ui"` resolves; `backHref` prop renders a `<Link>`.

---

### Step 1 — Update `TOOLS` constant in `apps/web/app/tools/page.tsx`

Scope: the `TOOLS` array and the `ToolEntry` interface.

Changes:
- Change `icon: React.ReactNode` → `icon: LucideIcon` in `ToolEntry` (aligned with `NavCardProps.icon`).
- Change `icon: <Mail className="h-5 w-5" />` → `icon: Mail` (component reference, not JSX element). Same for `ClipboardList` and `GitBranch`.
- Fix invite card description: "Mint a single-use code to bring someone onto Camp 404." → "Mint a named invite link to bring someone onto Camp 404." (stale copy fix per `decisions.md` carry-forward and `10-tools-hub.md §Divergences`).
- Update import: remove `React` from icon type context if no longer needed as `React.ReactNode`; add `LucideIcon` type import from `lucide-react` (or infer from the icon values — no explicit type annotation needed if the `ToolEntry` interface is updated to `icon: React.ComponentType<...>`; align with `NavCardProps`).

Acceptance:
- `TOOLS` array compiles against the updated `ToolEntry` interface.
- No JSX pre-render of icons in the constant.
- `pnpm build --filter apps/web` passes with no type errors on this file.

---

### Step 2 — Replace inline card markup with `<DetailHeader>` + `<NavCard>`

Scope: the JSX return of `ToolsPage`, the import block, and the outer layout.

Changes:

**Imports:**
- ADD: `import { DetailHeader, NavCard } from "@camp404/ui";`
- REMOVE: `import { Card, CardDescription, CardHeader, CardTitle } from "@camp404/ui/components/card";` (no longer used on this page; `NavCard` owns card internals)
- REMOVE: `ChevronRight` from lucide imports (owned by `NavCard` internally)
- RETAIN: `Mail`, `ClipboardList`, `GitBranch` from lucide (passed as `icon` props)
- RETAIN: `Link` from `next/link` (used to wrap `NavCard` with `asChild` for prefetching)

**Layout structure (target JSX):**

```tsx
<main className="mx-auto max-w-2xl">
  <DetailHeader title="Tools" backHref="/" />
  <div className="flex flex-col gap-4 px-4 pt-2 pb-6">
    {/* Intro block */}
    <div className="flex flex-col gap-1.5">
      <h1 className="text-[26px] font-bold text-foreground">Tools</h1>
      <p className="text-sm text-muted-foreground">
        Uncategorised tooling for camp members. We'll move tools into
        dedicated sections as we group them.
      </p>
    </div>
    {/* NavCards list */}
    <ul className="flex flex-col gap-3">
      {TOOLS.map((tool) => (
        <li key={tool.href}>
          <Link asChild href={tool.href}>
            <NavCard
              icon={tool.icon}
              title={tool.title}
              description={tool.description}
              href={tool.href}
            />
          </Link>
        </li>
      ))}
    </ul>
  </div>
</main>
```

Layout notes:
- `max-w-2xl` retained from live code (see surface spec §Divergences — low-confidence flag; retain pending desktop breakpoint board). Flag in a comment if product/design confirm `max-w-lg` is the product-wide default.
- Padding on the content region: `px-4 pt-2 pb-6` maps to spec `[8, 16, 24, 16]` (top 8 px, sides 16 px, bottom 24 px). `DetailHeader` has its own horizontal padding (`px-3`).
- Intro block gap: `gap-1.5` = 6 px (spec: `gap 6`).
- NavCards list gap: `gap-3` = 12 px (spec: `gap 12`).
- `<h1>` text size: `text-[26px]` (spec: Inter/26px/700). `font-bold` = 700. `text-foreground`.
- `<p>` text size: `text-sm` = 14 px. `text-muted-foreground`. `fill_container` width via block flow.

Acceptance:
- `/tools` renders `DetailHeader` with back pill and "Tools" label at top.
- Back affordance navigates to `/`.
- Exactly 3 `NavCard`s rendered — Mail/Invite, ClipboardList/My forms, GitBranch/Family tree.
- Focus ring is on the `<Link>` wrapper (via `NavCard`'s `asChild` pattern), NOT on the `<Card>` inner element (closes `open-questions.md` E35).
- Hover tint `bg-accent/30` works on each card.
- Icon chips are 44–46 px (`IconBadge size="md" shape="rounded" tone="muted"`), no `bg-muted/40` alpha modifier in rendered classes.
- No raw `border bg-muted/40 rounded-md` class strings in JSX.
- No `Card`, `CardHeader`, `CardTitle`, `CardDescription`, or `ChevronRight` imports remain on this page.
- Subtitle reads "sections" (not "quadrants").
- Invite card description reads "named invite link" (not "single-use code").
- `pnpm build --filter apps/web` passes.
- `pnpm lint --filter apps/web` passes; no `text-[color:var(--color-*)]` verbose token spellings introduced.

---

### Step 3 — E2E regression check

Existing specs in `apps/web/tests/e2e/authenticated.spec.ts` already cover:
- `page.goto("/tools")` on a pending-approval user → assert redirect to `/pending-approval` (line 91–93).
- `page.goto("/tools")` unauthenticated → assert redirect to `/auth/sign-in` (line 100–101).

These pass on the unmodified gate chain (the gate chain itself is REUSE — no changes). Confirm they remain green after the markup change.

**New E2E case to add (or note as a follow-on):** approved user navigating to `/tools` sees all three NavCards with correct titles ("Invite a member", "My forms", "Family tree") and `href`s. This is a low-risk canary for the static list not being accidentally emptied or re-ordered. Add to `authenticated.spec.ts` in the same describe block:

```tsx
test("approved member sees all three tool nav-cards", async ({ page, request }) => {
  await login(page, { email: "god@example.com" });
  await completeOnboarding(request, "god-auth");
  await page.goto("/tools");
  await expect(page.getByRole("link", { name: /Invite a member/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /My forms/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Family tree/ })).toBeVisible();
});
```

Acceptance: all three existing gate-chain specs pass unchanged; the new canary spec passes.

---

### Step ordering summary and CI contract

| Step | Prerequisite | CI unit | Note |
|---|---|---|---|
| Prereq A (tokens) | — | `pnpm --filter @camp404/ui test` | Must land before B/C/D |
| Prereq B (IconBadge) | Prereq A | `pnpm --filter @camp404/ui test` | |
| Prereq C (NavCard) | Prereq B | `pnpm --filter @camp404/ui test` | |
| Prereq D (DetailHeader) | Prereq A | `pnpm --filter @camp404/ui test` | Can land parallel to C |
| Step 1 (TOOLS constant) | Prereqs C+D in progress (types can be updated before component ships) | `pnpm build --filter apps/web` typecheck | Can land ahead of component ship if `NavCardProps` interface is locked |
| Step 2 (JSX swap) | Prereqs C+D shipped | `pnpm build --filter apps/web` + `pnpm lint` | The main delivery step |
| Step 3 (E2E) | Step 2 | `pnpm e2e` (Playwright) | Gate-chain specs already passing; new canary added here |

**MEMORY contract (green-CI-is-done):** each step above must be independently CI-green before the next merges. Do not strand Step 2 behind a partially-landed Prereq C or D. Step 1 (the constant update + copy fix) can land as its own green commit the moment `NavCardProps` is known, even before the component ships — it carries no visual regression risk and it closes the stale-copy issue (the old `CardTitle`/`CardDescription` inline markup still renders during the interim).

---

## Open items

Cross-references to `design/spec/open-questions.md` IDs; surface-specific detail given here.

| OQ ref | Topic | Impact on this surface | Blocking? |
|---|---|---|---|
| **B5** | `NavCard` vs `ToolCard` naming + `disabled` prop | Shared component name must be locked before Step 2. Recommendation `NavCard` accepted in `molecule-navcard.md`; `disabled` prop spec'd there for future use — not used by this surface. | **Blocking for Step 2** (must know which package export to import) |
| **D7** (10 OQ6) | Onboarding-gate bypass on `/tools` | `/tools` intentionally skips `getPendingRequiredActions`/`nextGate`. A member with pending blocking required actions who navigates directly reaches the hub. Confirmed as a product exception in the surface spec. Raise with product if a guard is ever needed; no code change for this pass. | Not blocking |
| **D43** (10 OQ8) | `DetailHeader` back-target | `backHref="/"` is passed explicitly as a prop (the `DetailHeader` plan uses a `backHref` prop, not router derivation). This is the safe default — no ambiguity about the back destination being `/`. Confirmed by both consumer boards drawing the back pill → home. | Not blocking (resolved by explicit prop) |
| **D44** (10 OQ4) | Family tree NavCard route `/family-tree` outside `/tools/*` | The Family tree card navigates to `/family-tree`, not `/tools/family-tree`. This is the only NavCard that leaves the `/tools/*` subtree. Retain until S16 route is confirmed. If S16 moves to `/tools/family-tree`, update `TOOLS[2].href` and the S16 brief. | Not blocking |
| **E35** (10 OQ7) | Focus-ring placement | Ring must be on `<Link>` wrapper, not `<Card>`. The shared `NavCard` component implements this correctly per `molecule-navcard.md`. This closes the gap in the current `tools/page.tsx` (ring currently on `<Card>`, confirmed at line 74). No special handling needed in the page — `NavCard`'s `asChild` pattern places the ring on the `<a>` element. | Resolved by NavCard component; not blocking for page |
| **10 OQ1** | Invite card copy — final marketing wording | "Mint a named invite link to bring someone onto Camp 404." is the placeholder. Product should supply final wording that removes "single-use" and signals slug-based, configurable codes. Updating is a one-line change to `TOOLS[0].description`. | Not blocking for code ship |
| **10 OQ5** (home hint copy) | Home quadrant tile hint copy "Meals, expenses…" mismatches tools hub content | Out of scope for this surface plan — update is to `apps/web/app/page.tsx` (the home control panel). Flag for the home surface plan (06-home). | Not blocking here |
