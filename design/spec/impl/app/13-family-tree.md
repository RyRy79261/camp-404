# 13-family-tree — app integration plan

- Route(s): `/family-tree` · routed page (App Router; `apps/web/app/family-tree/`)

> Functional brief: [`surfaces/13-family-tree.md`](../../surfaces/13-family-tree.md).
> Organism plan: [`components/organism-familytree.md`](../components/organism-familytree.md).
> Service plan: [`service-layer/06-family-tree.md`](../service-layer/06-family-tree.md).
> Architecture (layering/gating): [`architecture.md`](../architecture.md).
>
> **Classification headline:** the surface already ships and works
> (`apps/web/app/family-tree/page.tsx` + `family-tree.tsx`). This plan is an
> **EXTEND** of two existing files plus pure-logic extraction to the NEW
> `@camp404/core` — **no new route, no schema, no server action, no API
> handler.** This surface is **NOT rank-gated** (member + captain both see the
> whole-camp tree); the preview-but-locked `CaptainLock` treatment (decision #3)
> does **not** apply here.

---

## Current state — the existing route/files today

Two files implement the live surface. Both were confirmed read end-to-end; they
match the organism/service plans exactly.

- **`apps/web/app/family-tree/page.tsx`** (43 lines, server component):
  - `export const dynamic = "force-dynamic"` (`:9`); `metadata.title = "Family
    tree — Camp 404"` (`:11`).
  - Gate spine (`:13-21`): `getAuthenticatedUserOrRedirect()` (`@/lib/auth`) →
    `ensureCampUser(authUser)` (`@/lib/users`) →
    `if (!hasCampAccess(campUser, authUser.primaryEmail)) redirect("/signup/required")`
    → `if (!isApproved(campUser, authUser.primaryEmail)) redirect("/pending-approval")`.
  - Fetch: `const roster = await getReferralRoster()` from `@camp404/db/relations`
    (`:4`, `:23`).
  - Chrome: `<main className="mx-auto max-w-3xl px-6 py-10">` (`:26`), a ghost
    back `<Button asChild variant="ghost" size="sm">` wrapping `<a href="/tools">`
    with a `ChevronLeft` icon (`:27-31`), an `<h1>` "Family tree" +
    `<p className="text-sm text-muted-foreground">` subtitle (`:32-38`), then
    `<FamilyTree roster={roster} viewerUserId={campUser.id} />` (`:40`).

- **`apps/web/app/family-tree/family-tree.tsx`** (302 lines, `"use client"`):
  - Local `interface TreeUser` (`:9-15`) — a hand-copied mirror of `ReferralUser`;
    local `interface TreeNode { user; children }` (`:17-20`).
  - `FamilyTree` container (`:22-133`): `query` state (`:29`); `expanded`
    `Set<string>` seeded to roots-expanded-one-level
    (`new Set(roster.filter(u => !u.inviterId).map(u => u.id))`, `:30-33`);
    `trees = useMemo(buildTree(roster))` (`:35`); the `matchIds` `useMemo`
    (`:37-55`) doing substring match over `displayName + " " + inviteCode` then an
    **inlined ancestor-promotion walk** (`while (cursor)` at `:49-52` — **no
    `visited` guard**, the MUST-FIX cycle bug); `toggle` (`:57-63`);
    `effectiveExpanded = expanded ∪ matchIds` (`:68-73`); `visibleTrees` filter
    (`:75-77`); the Search `Input` + leading `Search` icon + Expand-all/Collapse
    `Button`s in one `flex gap-2` row (`:81-107`); the empty-state `Card`
    (`:109-114`); the root `<ul>` of `Branch`es (`:116-130`).
  - `Branch` recursive sub-component (`:135-273`): pure-CSS guide lines
    (`depth>0` only, `:172-193`), the toggle `<button>` (chevron / leaf dot,
    `disabled` on leaf, `:195-211`), the node `<Card>` with inline viewer ring
    `ring-1 ring-primary` (`:216`) and inline match border `border-amber-400/60`
    (`:217`), the generic `User` glyph avatar in a muted circle (`:221-223`),
    name + inline **Captain pill** `bg-amber-500/15 text-amber-300` (`:230`) +
    inline **You pill** `bg-primary/10 text-primary` (`:235`), the **via-code**
    line rendered **only when `inviteCode` present** (`:240-244`), the inline
    **descendant-count pill** rendering a **bare integer** `{countDescendants(node)}`
    (`:247-249`), and the recursive child `<ul>` (`:255-270`).
  - Four module-scope **pure functions**: `buildTree` (`:275-287`, **no cycle
    guard**), `subtreeHasMatch` (`:289-292`), `countDescendants` (`:294-302`).

- **Data substrate:** `getReferralRoster()` (`packages/db/src/relations.ts:22`)
  — `users LEFT JOIN invite_codes ON invite_codes.code = users.invite_code`,
  ordered by `display_name ASC`, returns
  `ReferralUser[] = { id, displayName, rank, inviteCode, inviterId }` (local
  interface, `relations.ts:9-15`). Adjacent dead exports `getInvitesIssuedBy`
  (`:45`) / `getRootCodes` (`:60`) are **NOT consumed** by this surface (grep-
  confirmed; only `relations.ts` references them).

- **What does NOT exist today** (confirmed by `ls apps/web/app/family-tree/`):
  no `apps/web/lib/family-tree.ts`, no `error.tsx`, no `not-found.tsx`, no
  `loading.tsx`, no `layout.tsx`, no `/api/**` route handler, no server action.
  All non-DB logic is inlined in the client component.

### What the redesign changes (summary — detail in §File structure / §Build steps)

1. **Extract** the four inlined pure functions + the `matchIds` body to
   `@camp404/core` (`referral-tree.ts`), carrying the **MUST-FIX cycle guards**.
2. **Replace** the hand-copied `TreeUser` / local `TreeNode` with shared types
   from `@camp404/types` (`referral.ts`).
3. **Presentation reconciliations** (decision #6 + board-wins copy): amber →
   `$accent` (captain pill + match border), bare integer → "N descendant(s)",
   add a mono `"root"` line for NULL-invite-code roots.
4. **DELETE** the two dead db helpers (`getInvitesIssuedBy` / `getRootCodes`).
5. Page chrome, gate spine, fetch, `force-dynamic`, and the `max-w-3xl` width all
   stay **REUSE** (unchanged behaviour).

No route move, no schema, no new files in `apps/web` beyond the extraction.

---

## File structure — target files in apps/web (CREATE / MODIFY / DELETE)

| File | Disposition | What |
|---|---|---|
| `apps/web/app/family-tree/page.tsx` | **MODIFY (light)** | Server component, unchanged behaviour. Only edit: the `ReferralUser` type now flows from `@camp404/types` via the re-typed `getReferralRoster` (no import change needed in the page — it just passes `roster` through). Gate spine, `force-dynamic`, chrome, `max-w-3xl` all kept. |
| `apps/web/app/family-tree/family-tree.tsx` | **MODIFY (heavy — EXTEND)** | DELETE local `TreeUser` + `TreeNode` + the four inlined functions; import `ReferralUser`/`TreeNode` from `@camp404/types` and `buildTree`/`computeMatchIds`/`subtreeHasMatch`/`countDescendants`/`descendantCountLabel` from `@camp404/core`. Apply the presentation reconciliations in `Branch`. Stays `"use client"`. |
| `apps/web/app/family-tree/error.tsx` | **NONE (do not add)** | No client error boundary on this surface — read-only, no write path that can throw mid-interaction. A thrown server error in `page.tsx` (e.g. DB unreachable) is caught by the nearest ancestor boundary / Next default; do not introduce a route-local one unless a global error-boundary pattern lands (organism-errorboundary.md is a separate, app-wide concern — out of scope here). |
| `apps/web/app/family-tree/not-found.tsx` | **NONE** | No dynamic segment / no `notFound()` path — the route is static `/family-tree`. |
| `apps/web/app/family-tree/loading.tsx` | **NONE** | Server component renders once `getReferralRoster()` resolves; no streaming skeleton in scope (brief §States: "Loading — None"). Flag only if ever converted to client-fetch. |
| `apps/web/app/family-tree/layout.tsx` | **NONE** | Inherits the app/root layout; the `max-w-3xl` wide exception is applied on `<main>` inside `page.tsx`, not a nested layout. |
| `/api/**` route handler | **NONE** | No client data fetch, no mutation, no webhook. The client component fetches nothing. |
| server action (`"use server"`) | **NONE** | Pure read-only visualisation — no form, no write (brief §User actions; organism plan §Forms: "None"). |

**Out-of-app (prerequisite) files this surface depends on — not in `apps/web`,
but gating its rewire** (full detail in the service-layer/organism plans):

| File | Disposition | Owner plan |
|---|---|---|
| `packages/types/src/referral.ts` | **CREATE** (`ReferralUser` Zod + `TreeNode` interface, reusing `Rank` from `./roles`); re-export from `index.ts` | service 06 / architecture §types |
| `packages/core/src/referral-tree.ts` | **CREATE** (`buildTree` + cycle guard, `computeMatchIds` + cycle guard, `subtreeHasMatch`, `countDescendants`, `descendantCountLabel`) | service 06 |
| `packages/core/src/__tests__/referral-tree.test.ts` | **CREATE** (vitest; the cycle-guard regression suite is the acceptance gate for the MUST-FIX) | service 06 |
| `packages/db/src/relations.ts` | **MODIFY** (re-type `getReferralRoster` to import `ReferralUser` from `@camp404/types`; **DELETE** `getInvitesIssuedBy` + `getRootCodes`, `:45-67`) | service 06 / architecture §db |

---

## Components composed

| Component | Plan | Renders where | Class |
|---|---|---|---|
| `Button` (`@camp404/ui` button) | [`atom-button.md`](../components/atom-button.md) | **Server** (`page.tsx`): back link `variant="ghost" size="sm" asChild` → `<a href="/tools">`. **Client** (`family-tree.tsx`): Expand-all + Collapse `variant="outline" size="sm"`. | REUSE |
| `Input` (`@camp404/ui` input) | [`atom-input.md`](../components/atom-input.md) | **Client**: search field — host-wrapper `relative` div + absolutely-positioned `Search` lucide icon + `className="pl-8"`; controlled (`value={query}`). The "search variant" is the wrapper composition, not a new Input prop. | REUSE |
| `Card` + `CardContent` (`@camp404/ui` card) | [`molecule-card.md`](../components/molecule-card.md) | **Client**: node card (per `Branch`) + the single empty-state box. Viewer node → `variant="selected"` (replaces inline `ring-1 ring-primary`); match node → `border-accent/60` className. | REUSE/EXTEND |
| `Badge` (`@camp404/ui` badge — PROMOTE) | [`atom-badge.md`](../components/atom-badge.md) | **Client** (per `Branch`): Captain pill → `<Badge tone="accent" variant="soft-tint">Captain</Badge>` (amber→accent, badge plan `:20`); You pill → `<Badge tone="primary" variant="soft-tint">You</Badge>` (`:21`); descendant count → `<Badge tone="default" variant="soft-tint">{label}</Badge>` (`:22`). | PROMOTE-consume |
| `Avatar` (`@camp404/ui` avatar) | [`atom-avatar.md`](../components/atom-avatar.md) | **Client**: node avatar — **generic `user` lucide glyph in a muted circle**; this surface deliberately ignores `profile_image_url` (not selected by `getReferralRoster`). Keep the glyph treatment as drawn; real-avatar select is deferred (OQ #2 / E16). | REUSE (glyph only) |
| `CodeDisplay` (`@camp404/ui` — PROMOTE) | [`molecule-codedisplay.md`](../components/molecule-codedisplay.md) | **Client**: the **via-code** mono line uses the **`readonly` variant** (display-only, no copy — codedisplay plan `:94`). NULL `inviteCode` roots render a mono `"root"` line in the same slot (board-wins reconciliation). May stay a bespoke mono `<span>` if the readonly variant is overkill — keep parity with the board's mono treatment. | REUSE (readonly) |
| Lucide icons | — | **Server**: `ChevronLeft` (back). **Client**: `Search`, `ChevronDown`, `ChevronRight`, `User`. | REUSE |
| **`FamilyTree`** (client organism) | [`organism-familytree.md`](../components/organism-familytree.md) | **Client** — `apps/web/app/family-tree/family-tree.tsx`. Owns search/expand state, empty state, root branch list. EXTEND of the live file (NOT promoted to `@camp404/ui` — route-bound, owns interaction state). | EXTEND (app-local) |
| **`Branch`** (recursive sub-component) | [`organism-familytree.md`](../components/organism-familytree.md) | **Client** — same file. One tree row: guide lines + toggle + node card + recursive children. TreeRow anatomy stays bespoke (merge-map: shares atoms, not a row shape). | EXTEND (app-local) |

**Not used** (recorded so omissions are explicit): `TopChrome`, `SectionHeader`,
`DetailHeader`, `GridTile`, `InputField`, `EmptyState`, `CaptainLock`,
`DictatePill` — no shared chrome, no rank gate, no dictation, no write fields.

---

## Services & data

**All data is fetched server-side in `page.tsx` and passed as props. The client
component fetches nothing** (no SWR, no client data call).

### Server-side (in `page.tsx`)

- **Gate spine** (REUSE, `apps/web/lib/auth.ts` / `apps/web/lib/users.ts`):
  - `getAuthenticatedUserOrRedirect()` — redirects `/auth/sign-in` if
    unauthenticated (`auth.ts:127`).
  - `ensureCampUser(authUser)` — resolves the camp `users` row (`users.ts:60`).
  - `hasCampAccess(campUser, authUser.primaryEmail)` — `false` →
    `redirect("/signup/required")`.
  - `isApproved(campUser, authUser.primaryEmail)` — `false` →
    `redirect("/pending-approval")`.
  - Per plan 01 the pure halves of `hasCampAccess`/`isApproved` migrate to
    `@camp404/core` (app keeps thin shims passing `isGodEmail(email)`); **this
    surface's call shape is unchanged** — it imports the same names from
    `@/lib/users`.
- **Data read** (REUSE): `getReferralRoster()` (`@camp404/db/relations`,
  `relations.ts:22`). Whole roster, one query, every load (`force-dynamic`); no
  pagination, no caching (sized for ~30–80 people). Only edit: its return type is
  re-sourced from `@camp404/types` (`ReferralUser`). No new columns selected
  (`profile_image_url` stays unselected).
- **Viewer identity:** `campUser.id` → passed as `viewerUserId` for the
  highlight.

### `@camp404/core` helpers (NEW package — `referral-tree.ts`; called client-side)

Pure functions the client component delegates to (depend ONLY on
`@camp404/types`; never import `next/*`, React, or `@camp404/db`):

- `buildTree(roster: ReferralUser[]): TreeNode[]` — EXTEND→core, **+ cycle guard**
  (refuse to attach a node that would close a cycle → falls back to root).
- `computeMatchIds(roster: ReferralUser[], query: string): Set<string> | null` —
  EXTEND→core; extracted from the `matchIds` `useMemo` body; carries the
  **MUST-FIX `visited`-Set guard** on the ancestor-promotion `while` walk.
- `subtreeHasMatch(node: TreeNode, matches: Set<string>): boolean` — EXTEND→core.
- `countDescendants(node: TreeNode): number` — EXTEND→core.
- `descendantCountLabel(n: number): string` — NEW (core): `"1 descendant"` /
  `"N descendants"`; backs the reconciled CountPill copy.

### Shared types (`@camp404/types/src/referral.ts` — NEW)

`ReferralUser` (Zod + `z.infer`, reusing `Rank` from `./roles`) + `TreeNode`
(plain interface). The local `TreeUser` (`family-tree.tsx:9`) and local
`TreeNode` (`:17`) are **DELETED**; `relations.ts` re-imports `ReferralUser`.

### Server vs client split

| Concern | Where | Why |
|---|---|---|
| Gates, `getReferralRoster()`, `force-dynamic`, `metadata`, page chrome (back link, header) | **`page.tsx` (server)** | `next/navigation`, auth/session, data access — Next-coupled. |
| `FamilyTree` + `Branch` (search/expand state, JSX, lucide, `@camp404/ui`) | **`family-tree.tsx` (`"use client"`)** | Owns `useState`/`useMemo` + renders. |
| `buildTree` / `computeMatchIds` / `subtreeHasMatch` / `countDescendants` / `descendantCountLabel` | **`@camp404/core` (pure)** | No React/DB/`next`; standalone-testable; home for the cycle guards. |

---

## Gating

- **Gate level:** global access spine only — **auth → invite (camp access) →
  approval**. Enforced server-side in `page.tsx` *before* render; a blocked user
  never sees a partial page.
- **NOT rank-gated.** Member and captain both see the full whole-camp tree.
  - **`CaptainLock` / preview-but-locked (decision #3) does NOT apply here.** No
    `requireClearance`, no inert shell, no withheld data, no `CaptainLock`
    organism. Recorded explicitly so the no-gate is a decision, not an omission
    (brief §States; organism plan §Global gating matrix).
  - The `/tools` tile that links here is **rank-ungated** (S13 Tools hub links,
    does not mount this organism).
- **God accounts** (`isGodEmail`) bypass the invite + approval gates and usually
  appear in the tree as a **root** (NULL `invite_code` → NULL `inviterId`).

| Gate state | Behaviour |
|---|---|
| Unauthenticated | `getAuthenticatedUserOrRedirect()` → `/auth/sign-in`. |
| Invite-gated (non-god, NULL `invite_code`) | `!hasCampAccess` → `/signup/required`. |
| Pending approval | `!isApproved` → `/pending-approval`. |
| Rejected | not `'approved'` → `!isApproved` → `/pending-approval` (terminal; no distinct screen). |
| God account | bypasses both gates; renders as a root node. |
| Captain-locked / preview-but-locked | **N/A** (not a rank surface). |

---

## States

### Global gating states
Handled by `page.tsx` redirects (above) — page never partially renders for a
blocked user.

### On-surface render states (client)

| State | Behaviour |
|---|---|
| **Loading** | **None** — server component; tree renders once `getReferralRoster()` resolves. No skeleton/spinner (flag if ever converted to client-fetch). |
| **Populated** | Recursive `Branch` list of visible root trees; default expansion = roots only, one level. |
| **Empty — no accounts** | `visibleTrees.length === 0` AND empty query → `Card` "No accounts yet." |
| **Empty — no matches** | `visibleTrees.length === 0` AND non-empty query → `Card` "No matches." |
| **Viewer-highlight** | Viewer's own node: Card `variant="selected"` (ring-primary) + `<Badge tone="primary" variant="soft-tint">You</Badge>`. |
| **Match-highlight** | While a query is active, matched/promoted nodes carry `border-accent/60`; matched paths force-expanded (`effectiveExpanded = expanded ∪ matchIds`); non-match subtrees hidden. |
| **Collapsed** | Roots rendered, children hidden (Collapse pressed, or any node manually collapsed). |
| **Leaf / disabled toggle** | Leaf node → dot marker (`h-1.5 w-1.5 rounded-full bg-muted-foreground/40`); toggle `<button>` is `disabled` (`disabled:opacity-30`); click is inert. |
| **Captain node** | `rank === "captain"` → `<Badge tone="accent" variant="soft-tint">Captain</Badge>` ($accent, replacing amber). |
| **Root node** | NULL `inviteCode` → mono `"root"` line in the via-slot (board-wins reconciliation). Branches keep `via <code>`. |
| **Disabled** | Only the leaf toggle. No global disabled state (no writable controls). |
| **NOT present** | No validation-error, submitting/pending, success, action-failure, offline/sync, or budget states — **no forms or writes on this surface**. |

---

## Build steps — ordered, with prerequisites + acceptance

> **Prerequisite phases (architecture build order):** Phase 0 (tokens/fonts —
> `$accent`, `--radius`, `--font-mono`); Phase 1 (scaffold `@camp404/core` +
> `packages/types/referral.ts`); Phase 2b (`relations.ts` re-type + DELETE dead
> helpers); Phase 3b (the family-tree core extraction with cycle guards); Phase 5
> (the PROMOTE leaves: `Badge`, `Card variant="selected"`, `Input` search
> wrapper, `CodeDisplay readonly`). This organism is the **first consumer of
> `@camp404/core`**. The app-layer rewire (steps below) is the *last* link.

The pure-logic / types / db prerequisite steps are owned by
[`service-layer/06-family-tree.md`](../service-layer/06-family-tree.md)
(steps 1-5/8) and the components plans. The **app-layer steps** are:

1. **[prereq — landed by other plans] `@camp404/core`, `@camp404/types/referral`,
   re-typed `relations.ts`, the PROMOTE leaves, and the cycle-guard regression
   tests all green.** Gate: `import { ReferralUser, TreeNode } from "@camp404/types"`
   and the five `@camp404/core` functions resolve from `apps/web`; the cycle test
   (`A.inviterId=B, B.inviterId=A` + matching query) terminates.

2. **[app] Re-type `page.tsx`** — no behaviour change. `roster` now typed as
   `ReferralUser[]` from `@camp404/types` (via the re-typed `getReferralRoster`).
   Gate spine, `force-dynamic`, chrome, `max-w-3xl` untouched.
   - *Acceptance:* `apps/web` typechecks; `/family-tree` still gates + renders;
     blocked users still redirect to the three targets.

3. **[app] Rewire `family-tree.tsx`** — DELETE local `interface TreeUser`,
   `interface TreeNode`, and the four inlined functions (`buildTree`,
   `subtreeHasMatch`, `countDescendants`, the `matchIds` walk). Import
   `ReferralUser`/`TreeNode` from `@camp404/types`; import `buildTree`,
   `computeMatchIds`, `subtreeHasMatch`, `countDescendants`,
   `descendantCountLabel` from `@camp404/core`. `FamilyTree`'s `useMemo`s call
   the core functions (`trees = useMemo(() => buildTree(roster), [roster])`;
   `matchIds = useMemo(() => computeMatchIds(roster, query), [roster, query])`).
   - *Prereq:* step 1. *Acceptance:* component typechecks; default render (roots
     expanded one level), Expand-all, Collapse, search filter + highlight +
     force-expand + "No matches" card, empty-roster "No accounts yet." card,
     viewer ring, leaf dot/disabled toggle all behave as before. Manual QA against
     board `25-s16-family-tree.txt`.

4. **[app] Presentation reconciliations in `Branch`** (decision #6 + board-wins
   copy):
   - Viewer node → Card `variant="selected"` (drop inline `ring-1 ring-primary`,
     `:216`).
   - Match node → `border-accent/60` (drop `border-amber-400/60`, `:217`).
   - Captain pill → `<Badge tone="accent" variant="soft-tint">Captain</Badge>`
     (drop `bg-amber-500/15 text-amber-300`, `:230`).
   - You pill → `<Badge tone="primary" variant="soft-tint">You</Badge>` (`:235`).
   - Descendant count → `<Badge tone="default" variant="soft-tint">{descendantCountLabel(countDescendants(node))}</Badge>`
     (drop bare integer, `:247-249`).
   - Root via-line → NULL `inviteCode` renders a mono `"root"` line
     (`CodeDisplay readonly` or mono `<span>`); branches keep `via <code>`
     (`:240-244`).
   - *Prereq:* step 3 + PROMOTE leaves. *Acceptance:* visual check vs board;
     captain pill + match border both `$accent`; "1 descendant" vs "N descendants"
     correct; root nodes show a `"root"` mono label.

5. **[db — landed by plan 06] DELETE `getInvitesIssuedBy` / `getRootCodes`**
   (`relations.ts:45-67`). Zero consumers (grep-confirmed).
   - *Acceptance:* grep shows no references; `apps/web` + `packages/db` build pass.

### Tests / e2e notes

- **Pure logic (lands with the core code, owned by plan 06):**
  `packages/core/src/__tests__/referral-tree.test.ts` (vitest; mirror the
  `apps/web/lib/__tests__/camp-roster.test.ts` style — `referralUser(...)`
  fixture + `chain([...])` helper). The **cycle cases are the acceptance gate for
  the MUST-FIX** (E15 / OQ #1): `buildTree` returns a finite forest with each
  node once; `computeMatchIds` terminates on a cyclic chain.
- **Component:** manual QA against board `25-s16-family-tree.txt` — no component
  test infra is set up for these route files today (service plan 06 §Test
  approach). Verify: default expansion, Expand-all/Collapse, search filter +
  highlight + force-expand + "No matches" card, empty-roster card, viewer
  ring + You badge, captain badge, leaf dot/disabled toggle, root "root" label,
  guide-line geometry across depths and `isLastChild`.
- **E2E_TEST_MODE seam:** the gate spine is the only test-mode-sensitive part.
  Under `E2E_TEST_MODE=1`, `getAuthenticatedUserOrRedirect` reads the test-user
  cookie (`auth.ts` `readTestUserCookie`, `:133`) and `ensureCampUser`
  (`users.ts:58-60`) uses the test-store backend instead of the DB — so an e2e
  walking `/family-tree` controls gating + `viewerUserId` via the cookie. The
  **tree data path is NOT seamed**: `getReferralRoster()` always hits the DB
  (`createHttpDb()`), so an e2e that asserts on tree *content* needs DB fixtures
  (the test-store has no referral-roster equivalent). E2E scope: assert the page
  gates correctly and renders the search/controls/empty-state chrome; assert tree
  topology only against a seeded DB. **MEMORY (green-CI):** land the core
  extraction + cycle tests, the `relations` re-type/delete, and the app rewire as
  independently green-CI changes — do not strand a post-green presentation
  follow-up.

---

## Open items — surface-specific decisions

Cross-referenced to [`open-questions.md`](../../open-questions.md):

- **E15 / OQ #1 (eng, high) — Cycle guard (source bug).** Add a `visited` Set to
  the `computeMatchIds` ancestor walk + harden `buildTree`. **Must fix before
  shipping — not optional** (CodeRabbit elevated). The app rewire (step 3) must
  not land before the guarded core (step 1).
- **E16 / OQ #2 (design, product, low) — Real avatars.** Show
  `profile_image_url` instead of the generic glyph? Board draws a glyph; deferred.
  If approved, `getReferralRoster` must select the column and `Avatar` switches
  from glyph-only to image-with-fallback.
- **A14 / OQ #3 (product, low) — Descendant-count semantics.** Pill counts ALL
  descendants (total subtree), not direct children; confirm "total subtree" is
  intended (it is, in live code). `descendantCountLabel` copy depends on this.
- **OQ #4 (token, design) — Captain colour identity.** `$accent` is the chosen
  captain/match colour (decision #6, replacing amber). Confirm `$accent` is right
  for "captain" everywhere (announcements also use it) vs. a dedicated status
  token. The board's `#00dcff26` should be `$accent / ~15%`, not a raw hex.
- **C2 / OQ #5 (product / data owner, med) — PII surface.** Family tree shows
  display names whole-camp to any approved member. Lower-sensitivity than the
  roster's plaintext email, but confirm whole-camp visibility of the referral
  graph is acceptable.
- **B28 / OQ #6 (design, low) — Mobile composition.** Board puts Controls in a
  row below Search; live groups Search + buttons in one `flex gap-2` row. At
  ≤430px the three controls may need to stack. Either composition is acceptable;
  preserve all three affordances. Behaviour-neutral.
- **D44 (eng, low) — Route location.** Confirm `/family-tree` (outside `/tools/*`)
  is intentional and registered. If it moves to `/tools/family-tree`, update the
  S13 NavCard href + this brief. Current plan assumes `/family-tree` stays.
- **B22 (design, med) — Width.** Family-tree is the **documented wide-shell
  exception** (`max-w-3xl`) — keep it; the recursive indented tree needs the
  horizontal room.
