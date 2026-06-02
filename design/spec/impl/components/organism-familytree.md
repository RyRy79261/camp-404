# FamilyTree — organism plan

- **mapsTo + home:** **NEW (per component-library)** — but on a working app it is
  **EXTEND** of the live `apps/web/app/family-tree/family-tree.tsx`. "NEW" in
  the component-library `mapsTo` (line 522) means "no shared-package equivalent;
  build it as the canonical app-local organism" — it is NOT a from-scratch
  rewrite. **Lives in `apps/web`** (keep app-local — owns interaction state,
  `"use client"`, route-bound). It is **not** promoted to `@camp404/ui` (its pure
  logic goes to `@camp404/core`; its shared pills/cards come from `@camp404/ui`).
- **Target file path:** `apps/web/app/family-tree/family-tree.tsx`
  (client organism: `FamilyTree` container + recursive `Branch` sub-component).
  Server shell stays at `apps/web/app/family-tree/page.tsx`.
- **TreeRow note:** the component-library keeps **TreeRow distinct** from
  RosterRow / NotificationRow / ReorderRow (merge map line 47; "share atoms
  Avatar/Badge/IconBadge but not a row shape"). TreeRow's anatomy (guide lines +
  recursion + toggle) is unique and is NOT extracted to a shared row component.

---

## Current state — what exists today (the old design's component/route markup)

The surface ships today and works. Two files implement it:

- **`apps/web/app/family-tree/page.tsx`** (43 lines, server component):
  - `export const dynamic = "force-dynamic"` (`page.tsx:9`) + `metadata.title`
    (`page.tsx:11`).
  - Gate spine: `getAuthenticatedUserOrRedirect()` → `ensureCampUser()` →
    `hasCampAccess(campUser, authUser.primaryEmail)` (redirect `/signup/required`)
    → `isApproved(...)` (redirect `/pending-approval`) (`page.tsx:14-21`).
  - Fetch: `getReferralRoster()` from `@camp404/db/relations` (`page.tsx:23`).
  - Renders `<main className="mx-auto max-w-3xl px-6 py-10">` with a ghost back
    `<Button asChild variant="ghost" size="sm">` → `/tools` (`page.tsx:27-31`),
    an `<h1>`/subtitle header block (`page.tsx:32-38`), then
    `<FamilyTree roster={roster} viewerUserId={campUser.id} />` (`page.tsx:40`).

- **`apps/web/app/family-tree/family-tree.tsx`** (302 lines, `"use client"`):
  - Local **`interface TreeUser`** (`:9-15`) — hand-copied mirror of
    `ReferralUser`; local **`interface TreeNode`** (`:17-20`).
  - `FamilyTree` container (`:22-133`): `query` state (`:29`), `expanded`
    `Set<string>` seeded to roots-expanded-one-level (`:30-33`),
    `trees = useMemo(buildTree(roster))` (`:35`), the `matchIds` `useMemo`
    (`:37-55`) doing substring match + **inlined ancestor-promotion walk**
    (`while (cursor)` at `:49-52`, **no `visited` guard**), `toggle` (`:57-63`),
    `effectiveExpanded` `useMemo` (`:68-73`), `visibleTrees` filter (`:75-77`),
    the Search `Input` + `Search` icon + Expand-all/Collapse `Button`s
    (`:81-107`), the empty-state `Card` (`:109-114`), and the root `<ul>` of
    `Branch`es (`:116-130`).
  - `Branch` recursive sub-component (`:135-273`): guide lines (pure CSS spans,
    `depth>0` only, `:172-193`), toggle `<button>` (chevron / dot, disabled on
    leaf, `:195-211`), node `<Card>` with inline viewer ring
    `ring-1 ring-primary` (`:216`) and inline match border `border-amber-400/60`
    (`:217`), generic `User` glyph avatar (`:221-223`), name + inline **Captain
    pill** `bg-amber-500/15 text-amber-300` (`:230`) + inline **You pill**
    `bg-primary/10 text-primary` (`:235`), the **via-code** line rendered only
    when `inviteCode` present (`:240-244`), the inline **descendant-count pill**
    rendering a **bare integer** `{countDescendants(node)}` (`:247-249`), and the
    recursive child `<ul>` (`:255-270`).
  - Four module-scope **pure functions**: `buildTree` (`:275-287`, **no cycle
    guard**), `subtreeHasMatch` (`:289-292`), `countDescendants` (`:294-302`).

Data substrate (today, unchanged): `getReferralRoster()` in
`packages/db/src/relations.ts:22` — `users LEFT JOIN invite_codes ON
invite_codes.code = users.invite_code` ordered by `display_name ASC`, returning
`ReferralUser[] = { id, displayName, rank, inviteCode, inviterId }`. The
adjacent dead exports `getInvitesIssuedBy` / `getRootCodes`
(`relations.ts:45/60`) are NOT consumed by this surface.

**No `apps/web/lib/family-tree.ts` exists** — all non-DB logic is inlined in the
client component (confirmed; service-layer plan 06 §"Current state").

---

## Composition — leaf components, core helpers, services; client/server split

### Leaf components it consumes (link plan files)

| Leaf | Plan | Role in FamilyTree | Class |
|---|---|---|---|
| `Button` (`@camp404/ui` button) | [`atom-button.md`](atom-button.md) | Back link (`variant="ghost" size="sm" asChild` — in `page.tsx`); Expand-all + Collapse (`variant="outline" size="sm"`) | REUSE |
| `Input` (`@camp404/ui` input) | [`atom-input.md`](atom-input.md) | Search field — **`search` variant** (host-wrapper `relative` div + absolutely-positioned `Search` lucide icon + `pl-8`); controlled | REUSE |
| `Card` + `CardContent` (`@camp404/ui` card) | [`molecule-card.md`](molecule-card.md) | Node card; empty-state box. Viewer node → **`variant="selected"`** (replaces inline `ring-1 ring-primary`); match node → `border-accent/60` className (reconciliation, not a Card variant) | REUSE/EXTEND |
| `Badge` (`@camp404/ui` badge — PROMOTE) | [`atom-badge.md`](atom-badge.md) | Captain pill → `<Badge tone="accent" variant="soft-tint">Captain</Badge>`; You pill → `<Badge tone="primary" variant="soft-tint">You</Badge>`; descendant-count → `<Badge tone="default">{label}</Badge>` (badge plan lines 305-307) | PROMOTE-consume |
| `Avatar` (`@camp404/ui` avatar) | [`atom-avatar.md`](atom-avatar.md) | Node avatar — **generic `user` lucide glyph in a muted circle** (this surface ignores `profile_image_url`; avatar plan + component-library line 104 confirm "family-tree uses generic `user` glyph"). May render as `AvatarFallback`-only or stay the bespoke glyph span — keep the glyph treatment as drawn | REUSE (glyph only) |
| `CodeDisplay` (`@camp404/ui` — PROMOTE) | [`molecule-codedisplay.md`](molecule-codedisplay.md) | The **via-code** mono line uses the **`readonly` variant** (display-only, no copy — CodeDisplay plan lines 94, 180: "MCP scope / family-tree via-line use"). Component-library mapsTo (line 522) names "via-code (mono/CodeDisplay)" | REUSE (readonly) |
| Lucide icons | — | `ChevronLeft` (page back); `Search` / `ChevronDown` / `ChevronRight` / `User` (component) | REUSE |

Per merge map (line 47) these atoms are **shared but the row is not** — TreeRow's
guide-line + toggle + recursion anatomy stays bespoke inside `Branch`.

### `@camp404/core` helpers it calls (NEW package — `referral-tree.ts`)

The four pure functions move OUT of the component into
`packages/core/src/referral-tree.ts`, typed against `@camp404/types`
(architecture.md §Hybrid extraction line 356; service-layer 06 §Target API):

- `buildTree(roster: ReferralUser[]): TreeNode[]` — **EXTEND→core** (+ cycle guard).
- `computeMatchIds(roster: ReferralUser[], query: string): Set<string> | null`
  — **EXTEND→core** (extracted from the `matchIds` `useMemo` body; carries the
  **MUST-FIX `visited`-Set cycle guard** on the ancestor walk).
- `subtreeHasMatch(node: TreeNode, matches: Set<string>): boolean` — **EXTEND→core**.
- `countDescendants(node: TreeNode): number` — **EXTEND→core**.
- `descendantCountLabel(n: number): string` — **NEW (core)** — `"1 descendant"` /
  `"N descendants"`; backs the reconciled CountPill copy.

`@camp404/core` depends ONLY on `@camp404/types`; never imports `next/*`, React,
or `@camp404/db` (architecture.md layering: `types ← core ← ui ← app`).

### Shared types (`@camp404/types/src/referral.ts` — NEW)

`ReferralUser` (Zod + `z.infer`, reuses existing `Rank` from `./roles`) + `TreeNode`
(plain interface). The local `TreeUser` (`family-tree.tsx:9`) and local `TreeNode`
(`:17`) are **DELETED**; `relations.ts` re-imports `ReferralUser` from
`@camp404/types` instead of declaring its own. (architecture.md §types line 53;
service-layer 06 §Schema & types.)

### Services / server-actions it calls

- **`getReferralRoster()`** — `@camp404/db/relations` (REUSE; query unchanged,
  only re-typed to return `ReferralUser` from `@camp404/types`). Called by the
  **server** `page.tsx`, not the client organism.
- **Gate spine** (server, `page.tsx`): `getAuthenticatedUserOrRedirect`,
  `ensureCampUser`, `hasCampAccess`, `isApproved` (`apps/web/lib/auth.ts` /
  `lib/users.ts`). The pure halves of `hasCampAccess`/`isApproved` migrate to
  `core` per plan 01, but the page keeps the thin app shims — no change to this
  surface's call shape.
- **No server actions, no mutations.** This surface is pure read-only
  visualisation — no `"use server"` action, no form, no write path.

### Server-component vs `"use client"` split

| Concern | Where | Why |
|---|---|---|
| Gates, `getReferralRoster()`, `force-dynamic`, `metadata`, page chrome (back link, header) | **`page.tsx` (server)** | `next/navigation`, auth/session, data access — Next-coupled (architecture.md §STAY in apps/web). |
| `FamilyTree` + `Branch` (search/expand state, JSX, lucide, `@camp404/ui`) | **`family-tree.tsx` (`"use client"`)** | Owns `useState`/`useMemo` interaction state; renders. |
| `buildTree` / `computeMatchIds` / `subtreeHasMatch` / `countDescendants` / `descendantCountLabel` | **`@camp404/core` (pure)** | No React/DB/`next`; testable standalone; home for the cycle guards. |

---

## API & data flow

### Props / inputs

```ts
// apps/web/app/family-tree/family-tree.tsx
export function FamilyTree({
  roster,        // ReferralUser[]  (from @camp404/types, via getReferralRoster())
  viewerUserId,  // string          (campUser.id — viewer highlight)
}: { roster: ReferralUser[]; viewerUserId: string }) { … }

interface BranchProps {
  node: TreeNode;          // @camp404/types
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  matchIds: Set<string> | null;
  viewerUserId: string;
  isLastChild: boolean;
}
```

### What it fetches vs receives

- **Receives** the full `roster` + `viewerUserId` as props (server-fetched). The
  client component **fetches nothing** — no client data calls, no SWR.
- Whole roster rendered every load (no pagination/lazy-load; sized for ~30–80
  people). `force-dynamic` re-queries each visit; no caching concerns.

### How state flows

- `query` (controlled `Input`) → `computeMatchIds(roster, query)` (`useMemo`):
  empty/whitespace → `null`; else match-set + promoted ancestors.
- `expanded` (`Set<string>`): seeded to roots-one-level
  (`roster.filter(u => !u.inviterId).map(u => u.id)`); `toggle(id)` flips an id;
  **Expand all** → `new Set(roster.map(u => u.id))`; **Collapse** → `new Set()`.
- `effectiveExpanded` = `expanded ∪ matchIds` when a query is active (forces
  matched paths open); else `expanded` (preserves manual state).
- `trees = useMemo(buildTree(roster))`; `visibleTrees` = `trees` filtered by
  `subtreeHasMatch` when `matchIds` is active, else all `trees`.
- `Branch` recurses: each open parent renders a `<ul>` of child `Branch`es at
  `depth+1` with `isLastChild` for the last-child guide-line elbow; visible
  children filtered by `subtreeHasMatch` under an active query.

### Forms: actions + validation

**None.** No forms, no actions, no validation — the search box is filter-only
(no dictation per decision #5; voice is field-level write only and there are no
write fields here).

---

## States — every state incl. global matrix + gating

### Global gating matrix (handled by `page.tsx` before render)

| State | Behaviour |
|---|---|
| **Unauthenticated** | `getAuthenticatedUserOrRedirect()` → redirect `/auth/sign-in`. Page never renders. |
| **Invite-gated** (non-god, NULL `invite_code`) | `!hasCampAccess` → redirect `/signup/required`. |
| **Pending approval** | `!isApproved` → redirect `/pending-approval`. |
| **Rejected** | not `'approved'` → `!isApproved` → redirect `/pending-approval` (terminal; no distinct screen). |
| **God account** | bypasses invite + approval gates; usually appears as a tree **root** (NULL `invite_code` → NULL `inviterId`). |
| **Onboarding-incomplete** | handled upstream by the global gating spine, not here. |
| **Captain-locked / preview-but-locked** | **N/A — NOT a rank surface.** This surface is **NOT rank-gated**: member and captain both see the full whole-camp tree. `CaptainLock` (decision #3) does **not** apply; the `/tools` tile linking here is rank-ungated. (Documented explicitly so the no-gate is a recorded decision, not an omission.) |

### On-surface render states

| State | Behaviour |
|---|---|
| **Loading** | **None** — server component; tree renders once `getReferralRoster()` resolves. No skeleton/spinner. (If ever converted to client-fetch, add a skeleton — flag.) |
| **Populated** | recursive `Branch` list of visible root trees; default expansion = roots only, one level. |
| **Empty — no accounts** | `visibleTrees.length === 0` AND empty query → `Card` "No accounts yet." |
| **Empty — no matches** | `visibleTrees.length === 0` AND non-empty query → `Card` "No matches." |
| **Viewer-highlight** | viewer's own node: Card `variant="selected"` (ring-primary) + `<Badge tone="primary" variant="soft-tint">You</Badge>`. |
| **Match-highlight** | while a query is active, matched/promoted nodes carry the `$accent` border (`border-accent/60`); matched paths force-expanded; non-match subtrees hidden. |
| **Collapsed** | roots rendered, children hidden (Collapse pressed, or any node manually collapsed). |
| **Leaf / disabled toggle** | leaf nodes (no children) show a dot marker; toggle `<button>` is `disabled` (`disabled:opacity-30`). |
| **Root node** | NULL `inviteCode` → render a mono `"root"` line (via `CodeDisplay readonly` or mono span) in place of the "via …" line (reconciliation — board wins). |
| **Captain node** | `rank === "captain"` → `<Badge tone="accent" variant="soft-tint">Captain</Badge>` ($accent, replacing amber). |
| **Disabled** | only the leaf toggle (above). No global disabled state — there are no writable controls. |
| **NOT present** | no validation-error, submitting/pending, success, action-failure, offline/sync, or budget states — **no forms or writes on this surface**. (Recorded so "submitting/success/disabled" omissions are explicit.) |

---

## Build steps — ordered, with prerequisites + acceptance + tests

> **Prerequisite phases (architecture.md build order):** Phase 0 (tokens/fonts —
> `$accent`, `--radius`, `--font-mono`), Phase 1 (`@camp404/core` scaffold +
> `packages/types/referral.ts`), Phase 5 (the PROMOTE leaves: `Badge`,
> `Card` variants, `Input` search variant, `CodeDisplay`). This organism is the
> first consumer of `@camp404/core` (plan 06).

1. **[prereq] Shared types** — `packages/types/src/referral.ts`: `ReferralUser`
   (Zod, reusing `Rank` from `./roles`) + `TreeNode` interface; re-export from
   `index.ts`. Re-type `getReferralRoster` (`relations.ts`) to import
   `ReferralUser`.
   - *Acceptance:* `import { ReferralUser, TreeNode } from "@camp404/types"`
     compiles; same 5 fields/nullability as the old `relations.ts` interface.

2. **[prereq] `@camp404/core` move (no guards yet)** — move `buildTree`,
   `computeMatchIds` (extracted from the `matchIds` `useMemo` body),
   `subtreeHasMatch`, `countDescendants` into
   `packages/core/src/referral-tree.ts`; add `descendantCountLabel`. Behaviour
   parity first.
   - *Acceptance:* snapshot test on a known roster fixture reproduces today's
     tree exactly; `descendantCountLabel(1)==="1 descendant"`,
     `descendantCountLabel(5)==="5 descendants"`.

3. **[prereq — MUST-FIX] Cycle guards** (reliability, not optional — surface
   spec Open question #1; service-layer 06 step 5):
   - `computeMatchIds`: add a `visited` Set to the `while (cursor)` ancestor
     walk; stop when a cursor repeats.
   - `buildTree`: refuse to attach a node that would close a cycle (track placed
     ids / detect ancestor membership); a cyclic node falls back to root.
   - *Acceptance (regression tests — the gate for the MUST-FIX):* a synthetic
     `A.inviterId=B, B.inviterId=A` roster + a query matching `A` **terminates**
     and returns a finite set; `buildTree` returns a finite forest with each
     user node present **at most once**; `countDescendants`/`subtreeHasMatch`
     over the result do not recurse infinitely.

4. **[prereq] PROMOTE leaves land** — `Badge` (`atom-badge.md`), `Card`
   `variant="selected"` (`molecule-card.md`), `Input` search variant
   (`atom-input.md`), `CodeDisplay` `readonly` (`molecule-codedisplay.md`).
   - *Acceptance:* each exports from `@camp404/ui` with the variants this
     organism needs; Storybook shows the family-tree anatomy.

5. **Rewire `family-tree.tsx`** — DELETE local `TreeUser` + `TreeNode` + the four
   inlined functions; import `ReferralUser`/`TreeNode` from `@camp404/types` and
   `buildTree`/`computeMatchIds`/`subtreeHasMatch`/`countDescendants`/
   `descendantCountLabel` from `@camp404/core`. `FamilyTree`'s `useMemo`s call
   the core functions.
   - *Acceptance:* component typechecks; default render (roots expanded one
     level), Expand-all, Collapse, search-highlight, viewer ring, leaf-dot all
     behave as before on `/family-tree` (manual QA against board
     `25-s16-family-tree.txt`).

6. **Presentation reconciliations** (decision #6 + board-wins copy), all in `Branch`:
   - Viewer node: Card `variant="selected"` (drop inline `ring-1 ring-primary`).
   - Match node: `border-accent/60` (drop `border-amber-400/60`).
   - Captain pill: `<Badge tone="accent" variant="soft-tint">Captain</Badge>`
     (drop `bg-amber-500/15 text-amber-300`).
   - You pill: `<Badge tone="primary" variant="soft-tint">You</Badge>`.
   - Descendant count: `<Badge tone="default">{descendantCountLabel(countDescendants(node))}</Badge>`
     (drop bare integer → "N descendant(s)").
   - Root via-line: NULL `inviteCode` → render a mono `"root"` line
     (`CodeDisplay readonly` or mono span); branches keep `via <code>`.
   - *Acceptance:* visual check vs board; captain pill + match border both
     `$accent`; "1 descendant" vs "N descendants" correct; root nodes show a
     `"root"` mono label.

7. **DELETE dead db helpers** — remove `getInvitesIssuedBy` / `getRootCodes`
   (`relations.ts:45-67`); recommend delete (zero consumers, spec-confirmed
   dead). (Or `@deprecated` if the team prefers caution.)
   - *Acceptance:* grep shows no references; build passes.

### Tests

- **Pure logic (new, with the code):** `packages/core/src/__tests__/
  referral-tree.test.ts` (vitest, mirroring `apps/web/lib/__tests__/
  camp-roster.test.ts` style — `referralUser(...)` fixture factory + a
  `chain([...])` helper). Cover: `buildTree` (roots from NULL inviter,
  orphan-as-root when inviter missing, **cycle → finite forest**),
  `computeMatchIds` (name match, code match, case-insensitive, ancestor
  promotion, empty query → `null`, **cycle → terminates**), `countDescendants`
  (recursive total — every generation), `subtreeHasMatch`,
  `descendantCountLabel` (1 vs N). **The cycle cases are the acceptance gate for
  the MUST-FIX.**
- **Component:** manual QA against board `25-s16-family-tree.txt` (no component
  test infra is set up for these route files today — service-layer 06 §Test
  approach). Verify: default expansion, Expand-all/Collapse, search filter +
  highlight + force-expand + "No matches" card, empty-roster "No accounts yet"
  card, viewer ring + You badge, captain badge, leaf dot/disabled toggle, root
  "root" label, guide-line geometry across depths and `isLastChild`.

---

## Consumers — which surfaces mount it

| Surface | Brief | How it mounts FamilyTree |
|---|---|---|
| **S16 Family tree** (`/family-tree`) | [`surfaces/13-family-tree.md`](../surfaces/13-family-tree.md) | The **only** consumer. `apps/web/app/family-tree/page.tsx` (server) gates + fetches `getReferralRoster()` and renders `<FamilyTree roster={roster} viewerUserId={campUser.id} />`. |
| `/tools` hub (S13) | [`surfaces/10-tools-hub.md`](../surfaces/10-tools-hub.md) | **Links** here via a rank-ungated tile — navigation only; does **not** mount the organism or depend on its API. |

No other surface consumes `getReferralRoster` or mounts `FamilyTree`. The roster
surface (S17) uses a *different* module (`packages/db/roster.ts`) despite the
name overlap — do not conflate.
