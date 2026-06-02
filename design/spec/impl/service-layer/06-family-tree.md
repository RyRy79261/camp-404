# Family tree (referral graph) — service-layer plan

> Domain: the camp's "who invited who" referral graph. Pure visualisation of
> `users.invite_code → invite_codes.created_by_user_id`. No writes, no schema
> change. This plan covers the data-access read, the **pure tree-building +
> ancestor-walk logic** (the hybrid-extraction candidate), and the Next-coupled
> page shell.

---

## Consumers — which surfaces/organisms depend on this domain

- **S16 Family tree** (`/family-tree`) — the only consuming surface
  (`design/spec/surfaces/13-family-tree.md`). Read-only whole-camp tree:
  search + highlight, ancestor-path promotion, expand/collapse, per-node
  recursive descendant counts, viewer-node highlight.
  - Server shell: `apps/web/app/family-tree/page.tsx` — gates + fetch.
  - Client organism: `apps/web/app/family-tree/family-tree.tsx`
    (`FamilyTree` container + recursive `Branch` + the three pure helpers
    `buildTree` / `subtreeHasMatch` / `countDescendants` + the ancestor
    promotion walk currently inlined in the `matchIds` `useMemo`).
- **`/tools` hub** links here via a rank-ungated tile (S13 Tools). The tile is
  navigation only; it does not depend on this domain's API.
- **No other surface** consumes `getReferralRoster`. The roster surface (S17)
  uses a *different* module (`packages/db/src/roster.ts`,
  `getCampManagementRoster` / `getCampMemberDetail`) — unrelated despite the
  name overlap. `getCampMemberDetail` independently joins `invite_codes` for
  the inviter *display name* (`roster.ts:161-175`), but does not build a graph.

### Currently-dead exports in this domain (no consumer)
`getInvitesIssuedBy` and `getRootCodes` (`relations.ts:45-67`) are exported but
**not wired into any surface** — confirmed by grep (only `relations.ts` itself
references them; the family-tree route imports only `getReferralRoster`). The
surface spec calls these "orphaned helpers" and "documented dead/future code"
(13-family-tree.md lines 5, 218). See Target API for the DELETE/keep call.

---

## Current state — modules + key exports today

### `packages/db` (data access)
- `packages/db/src/relations.ts`
  - `relations.ts:9` `interface ReferralUser { id; displayName; rank; inviteCode; inviterId }`.
  - `relations.ts:22` `getReferralRoster(): Promise<ReferralUser[]>` — one row
    per user via `users LEFT JOIN invite_codes ON invite_codes.code =
    users.invite_code`, ordered by `display_name ASC`. `inviterId =
    invite_codes.created_by_user_id`. **This is the entire data substrate for
    the surface.**
  - `relations.ts:45` `getInvitesIssuedBy(userId)` — DEAD (no consumer).
  - `relations.ts:60` `getRootCodes()` — DEAD (no consumer).
- `packages/db/src/roster.ts` (adjacent, not consumed by S16)
  - `roster.ts:48` `getCampManagementRoster()`, `roster.ts:141`
    `getCampMemberDetail()` — roster surface only; `getCampMemberDetail` reuses
    the same `invite_codes.created_by_user_id` join for an inviter name string
    (`roster.ts:175` aliased `inviter`), proving the edge is well-trodden.
- `packages/db` exports (`packages/db/package.json:14-15`): `"./relations"`,
  `"./roster"` both resolve to source `.ts`.
- Schema: `invite_codes` (`schema.ts:312`) with `code` PK (`schema.ts` free-text
  — *this is the "slug"*; db-impact.json confirms the code IS the human-readable
  slug, no separate `slug` column), `created_by_user_id` FK→`users.id`
  `onDelete: set null` (`schema.ts:316`), `note` (`schema.ts:319`).
  `users.invite_code` is the nullable redeemed code; NULL ⇒ root.

### `packages/types`
- **Nothing for this domain today.** No referral/tree type exists in
  `packages/types/src/*` (index re-exports roles, announcement, member,
  questionnaire, recipe, reimbursement, voice-intent only —
  `packages/types/src/index.ts`). `ReferralUser` lives in `packages/db`;
  `TreeUser` / `TreeNode` are redeclared client-side.

### `apps/web/lib`
- **No family-tree orchestration module exists.** Unlike most domains there is
  *no* `apps/web/lib/family-tree.ts`. All non-DB logic lives inside the client
  component:
  - `family-tree.tsx:9` `interface TreeUser` — hand-copied mirror of
    `ReferralUser` ("mirrors `ReferralUser`", per spec line 96).
  - `family-tree.tsx:17` `interface TreeNode { user; children }`.
  - `family-tree.tsx:275` `buildTree(roster): TreeNode[]` — **PURE**. Map by id,
    push each node onto its parent (`byId.get(u.inviterId)`), else root.
    **No cycle guard.**
  - `family-tree.tsx:289` `subtreeHasMatch(node, matches): boolean` — **PURE**,
    recursive.
  - `family-tree.tsx:294` `countDescendants(node): number` — **PURE**, recursive
    full-subtree count.
  - `family-tree.tsx:37-55` the `matchIds` `useMemo` — substring match over
    `displayName + inviteCode`, then an **ancestor-promotion walk**
    (`while (cursor) { matches.add(cursor); cursor = parentById.get(cursor) }`,
    lines 47-53). The match-building is **PURE**; only the `useMemo`/`query`
    state binding is React. **No `visited` guard — the MUST-FIX cycle bug.**
- `apps/web/lib/camp-roster.ts` — the *roster* view-model
  (`toRosterRow`/`rankLabel`); a precedent for "pure derivations live in lib and
  are unit-tested" (`apps/web/lib/__tests__/camp-roster.test.ts`). Not this
  domain, but the pattern to follow.

---

## Redesign delta — NEW / EXTEND / REUSE

Almost everything is **REUSE**. Per the surface spec the data layer is
unchanged; the deltas are (a) the reliability MUST-FIX and (b) small
presentation reconciliations that ride on top of unchanged logic.

| Item | Class | Note |
|---|---|---|
| `getReferralRoster` query/shape | **REUSE** | Exactly the data the surface needs. No new columns selected by default. |
| `buildTree` | **EXTEND** | Add `visited` Set guard (MUST-FIX) + extract to a pure package module. Logic otherwise unchanged. |
| ancestor-promotion walk | **EXTEND** | Add `visited` Set guard (MUST-FIX) + extract to a named pure function (today it is inlined in a `useMemo`). |
| `subtreeHasMatch`, `countDescendants` | **EXTEND** | Extract to the pure package module. Recursion is bounded by `buildTree` output, which after the guard is acyclic, so these are safe once the tree is acyclic — but extract them together for cohesion. |
| `matchIds` substring matcher | **EXTEND** | Extract the pure "compute match set from roster + query" out of the `useMemo`; keep `useMemo`/state in the component. |
| `TreeUser` type | **EXTEND→DELETE the dupe** | Stop hand-copying `ReferralUser`; source one shared type (see Schema & types). |
| Captain pill colour `amber` → `$accent` | **EXTEND** | Presentation only (`family-tree.tsx:230`). Decision #6. |
| Match border `border-amber-400/60` → `$accent` | **EXTEND** | Presentation only (`family-tree.tsx:217`). Decision #6. |
| Descendant pill bare int → "N descendant(s)" | **EXTEND** | Copy only (`family-tree.tsx:248`). Singular/plural. |
| Root via-line: render mono `"root"` for NULL invite code | **EXTEND** | Presentation only (`family-tree.tsx:240-244` currently renders nothing). |
| `getInvitesIssuedBy`, `getRootCodes` | **DELETE (recommend)** | Dead; no consumer; spec says "leave as documented dead/future code" — keep is acceptable, but flag for removal to reduce surface. See Target API. |
| Real avatars (`profile_image_url`) | **NEW (optional, deferred)** | Not required by the board; open question #2. Out of scope unless product confirms. |
| Schema | **none** | Confirmed by db-impact.json + spec. The one redesign schema change (captain_promotion_requests) belongs to roster, not here. |

---

## Schema & types

### Schema
**No change.** Confirmed three ways: surface spec ("NEW schema: none",
13-family-tree.md:167), db-impact.json (the only `invite_codes` note is "NO
schema change"), and the MEMORY/CLAUDE locked decision (only roster gets a
table). No Drizzle migration in this domain. The `code` PK already *is* the
human-readable slug used for via-labels — no `slug` column needed.

### `packages/types` additions (NEW — small, shared)
Today `TreeUser` is hand-copied from `ReferralUser` and `TreeNode` is
client-only. Introduce one shared, framework-agnostic source of truth so the
DB row type, the pure tree functions, and the component all agree.

Add `packages/types/src/referral.ts` (Zod + inferred TS, matching the
`member.ts` style — `z.object` + `z.infer`), re-exported from
`packages/types/src/index.ts`:

```ts
// packages/types/src/referral.ts
export const ReferralUser = z.object({
  id: z.string().uuid(),
  displayName: z.string().nullable(),
  rank: Rank,                       // reuse existing Rank from ./roles
  inviteCode: z.string().nullable(),
  inviterId: z.string().uuid().nullable(),
});
export type ReferralUser = z.infer<typeof ReferralUser>;

export interface TreeNode { user: ReferralUser; children: TreeNode[]; }
```

- `ReferralUser` becomes the single definition. `relations.ts:9` stops
  declaring its own `interface ReferralUser` and imports the type (the runtime
  query is unchanged; only the type annotation is sourced from `@camp404/types`).
- `TreeUser` (`family-tree.tsx:9`) is **deleted** — the component imports
  `ReferralUser`/`TreeNode` from the shared package.
- `TreeNode` is a plain interface (no Zod) — it is a derived structure, never
  parsed at a boundary.
- **Rationale for `@camp404/types` not `packages/core`:** these are *types*,
  and the package already exists and is the home for shared Zod/TS. The pure
  *functions* go to `packages/core` (below).

---

## Target API — the function/module surface after this work

Notation: `[REUSE]` exists & kept · `[EXTEND]` modified · `[NEW]` build ·
`[DELETE]` remove. Location tags: **db** = `packages/db` · **types** =
`packages/types` · **core** = `packages/core` (NEW, pure) · **app** =
`apps/web` (Next-coupled).

### Data access — `packages/db/src/relations.ts`
- `[REUSE] getReferralRoster(): Promise<ReferralUser[]>` — **db**. Unchanged
  query. Only edit: return type annotation imports `ReferralUser` from
  `@camp404/types` instead of the local interface.
- `[DELETE] getInvitesIssuedBy(userId)` — **db**. Dead. Remove (or, if the team
  prefers caution, annotate `@deprecated unused`). Recommend delete: the spec
  classifies it dead and it has zero consumers.
- `[DELETE] getRootCodes()` — **db**. Same.

### Shared types — `packages/types`
- `[NEW] ReferralUser` (Zod schema + type) — **types**, `referral.ts`.
- `[NEW] TreeNode` (interface) — **types**, `referral.ts`.

### Pure tree logic — `packages/core` (NEW package, framework-agnostic)
New package `@camp404/core`, module `packages/core/src/referral-tree.ts`. All
functions are pure (no React, no DB, no `next/*`), depend only on
`@camp404/types`, and are the home for the MUST-FIX guards.

- `[EXTEND→NEW location] buildTree(roster: ReferralUser[]): TreeNode[]` —
  **core**. Same map-and-attach logic as `family-tree.tsx:275`, **plus a
  `visited` Set** so a cyclic `inviterId` chain cannot create an infinite
  parent loop or duplicate attachment. Concretely: when attaching `node` under
  `parent`, if walking `parent`'s ancestor chain would reach `node` (or simpler:
  track ids already placed and refuse to re-parent), fall back to treating
  `node` as a root. Acceptance: a synthetic A→B→A roster produces a finite tree
  with no node appearing twice.
- `[EXTEND→NEW location] computeMatchIds(roster: ReferralUser[], query: string): Set<string> | null` —
  **core**. The pure extraction of the `matchIds` `useMemo` body
  (`family-tree.tsx:37-55`): empty/whitespace query → `null`; else substring
  match over `displayName + " " + inviteCode` (lower-cased), then promote
  ancestors via `parentById` **with a `visited` Set guarding the
  `while (cursor)` walk** (the headline MUST-FIX). Returns the match+promoted id
  set. Acceptance: a cyclic chain + a matching query terminates; a normal chain
  promotes every ancestor exactly once.
- `[EXTEND→NEW location] subtreeHasMatch(node: TreeNode, matches: Set<string>): boolean` —
  **core**. Unchanged logic (`family-tree.tsx:289`); safe because `buildTree`
  output is now acyclic.
- `[EXTEND→NEW location] countDescendants(node: TreeNode): number` — **core**.
  Unchanged logic (`family-tree.tsx:294`); recursive full-subtree count.
- `[NEW] descendantCountLabel(n: number): string` — **core**. `"1 descendant"`
  / `"N descendants"`. Pure copy helper backing the reconciled CountPill copy
  (decision: board wins). Keeps singular/plural out of the component.

### Page + organism — `apps/web/app/family-tree`
- `[REUSE] page.tsx` — **app**. Server component; gates
  (`getAuthenticatedUserOrRedirect` → `hasCampAccess` → `isApproved`) +
  `getReferralRoster()` + render. `force-dynamic`. Unchanged except the import
  for the type (now from `@camp404/types`). **Stays in app** (imports
  `next/navigation`, auth/session, data access).
- `[EXTEND] family-tree.tsx` `FamilyTree` (client) — **app**. Keeps all React
  state (`query`, `expanded`, `toggle`, `effectiveExpanded`, `visibleTrees`,
  the two `useMemo`s) but **delegates the pure work to `@camp404/core`**:
  `trees = useMemo(() => buildTree(roster), …)`,
  `matchIds = useMemo(() => computeMatchIds(roster, query), …)`. Stays in app:
  it is `"use client"`, owns interaction state, renders JSX.
- `[EXTEND] family-tree.tsx` `Branch` (client) — **app**. Presentation deltas
  only: `$accent` captain pill + match border, `descendantCountLabel(...)` in
  the CountPill, and a mono `"root"` line when `inviteCode == null`. Calls
  `countDescendants`/`subtreeHasMatch` from core.
- `[DELETE] family-tree.tsx` local `interface TreeUser`, `interface TreeNode`,
  and the four inlined pure functions — **app**. Replaced by imports from
  `@camp404/types` + `@camp404/core`.

---

## Hybrid extraction — what MOVES vs what STAYS

### MOVE to `packages/core` (pure, framework-agnostic) — NEW package
| From (today) | To | Why it's safe to move |
|---|---|---|
| `buildTree` (`family-tree.tsx:275`) | `@camp404/core` `referral-tree.ts` | No React/DB/`next` imports; takes data, returns data. Pure. |
| ancestor-promotion walk inside the `matchIds` `useMemo` (`family-tree.tsx:46-53`) → `computeMatchIds` | `@camp404/core` | The matching + ancestor walk is pure; only the `useMemo`(query) wrapper is React. Extract the body. |
| `subtreeHasMatch` (`:289`) | `@camp404/core` | Pure recursion over `TreeNode`. |
| `countDescendants` (`:294`) | `@camp404/core` | Pure recursion. |
| descendant-count copy (singular/plural) | `@camp404/core` `descendantCountLabel` | Pure string mapping; trivially testable. |

These are the cleanest possible extraction in the whole redesign: small, total
functions over plain data with **no current test coverage**, which is exactly
why they are the right place to *add* the cycle-guard regression tests as part
of the move.

### STAY in `apps/web` (Next-coupled)
| Stays | Why |
|---|---|
| `page.tsx` (whole file) | `next/navigation` redirect, `metadata`, `force-dynamic`, auth/session (`getAuthenticatedUserOrRedirect`, `ensureCampUser`), data access call. |
| `FamilyTree` / `Branch` components | `"use client"`, `useState`/`useMemo`, JSX, lucide, `@camp404/ui`. Presentation + interaction state. |
| The `useMemo`/`useState` bindings | React-specific glue around the now-pure core functions. |

### STAY in `packages/db`
| Stays | Why |
|---|---|
| `getReferralRoster` | Drizzle query + `createHttpDb()`. Data access is `packages/db`'s job per the hybrid decision (schema + data-access stay in db). |

**Net package shape:** `@camp404/core` is introduced by this domain (first
consumer; no sibling plan references it yet — verified). Keep its dependency
surface minimal: depend only on `@camp404/types`, `vitest` for tests, the same
TS/build setup as `@camp404/types`. If the team would rather not stand up a new
package now, the fallback is `packages/types/src/referral-tree.ts` (the brief
explicitly allows "into `packages/db/types` where it fits"); but a dedicated
`core` is cleaner because these are *logic*, not types, and other domains'
pure derivations will want the same home.

---

## Build steps (ordered)

1. **Scaffold `@camp404/core`** (or decide on the `packages/types` fallback).
   - Create `packages/core` with `package.json` (`"name": "@camp404/core"`,
     `"test": "vitest run"`), `tsconfig`, and the `vitest` devDep — mirror
     `packages/types/package.json`. Add the `./referral-tree` export.
   - *Acceptance:* `pnpm -F @camp404/core test` runs (empty pass) and the
     package resolves from `apps/web` and `packages/db`.

2. **Add shared types** — `packages/types/src/referral.ts` (`ReferralUser` Zod
   + type, `TreeNode` interface), re-export from `index.ts`.
   - *Acceptance:* `import { ReferralUser, TreeNode } from "@camp404/types"`
     compiles; `ReferralUser` shape is identical to the old `relations.ts`
     interface (same 5 fields, same nullability).

3. **Point `relations.ts` at the shared type** — replace the local
   `interface ReferralUser` with the imported one; `getReferralRoster` return
   type now `Promise<ReferralUser[]>` from `@camp404/types`. Query untouched.
   - *Acceptance:* `pnpm -F @camp404/db build`/typecheck passes; existing
     callers unaffected (only the family-tree page imports it).

4. **Move the four pure functions into `@camp404/core/referral-tree.ts`**,
   typed against `@camp404/types`. Add `descendantCountLabel`. **Do not yet add
   the guards** — move first, verify behaviour parity.
   - *Acceptance:* functions exported; a snapshot test on a known fixture
     reproduces today's tree exactly.

5. **MUST-FIX: add cycle guards** (the reliability fix — not optional).
   - `computeMatchIds`: add a `visited` Set to the `while (cursor)` ancestor
     walk; stop when a cursor repeats.
   - `buildTree`: refuse to attach a node that would close a cycle (track placed
     ids / detect ancestor membership); cyclic node falls back to root.
   - *Acceptance (regression tests, the core of the test approach):*
     - `computeMatchIds` on a roster with `A.inviterId=B`, `B.inviterId=A` and a
       query matching `A` **terminates** and returns a finite set.
     - `buildTree` on the same roster returns a finite forest, each user node
       present **at most once**, no infinite recursion in
       `countDescendants`/`subtreeHasMatch` over the result.
     - Acyclic regression: a 3-deep chain promotes all ancestors exactly once;
       `countDescendants(root)` counts every generation;
       `subtreeHasMatch` true only on subtrees containing a match.

6. **Rewire `family-tree.tsx`** — delete local types + the four functions;
   import from `@camp404/types` (`ReferralUser`, `TreeNode`) and `@camp404/core`
   (`buildTree`, `computeMatchIds`, `subtreeHasMatch`, `countDescendants`,
   `descendantCountLabel`). `FamilyTree`'s `useMemo`s call the core functions.
   - *Acceptance:* component typechecks; default render (roots expanded one
     level), expand-all, collapse, search-highlight, viewer ring all behave as
     before manual QA on `/family-tree`.

7. **Presentation reconciliations** (decision #6 + board-wins copy), all in
   `Branch`:
   - Captain pill `amber` → `$accent` token (`:230`).
   - Match border `border-amber-400/60` → `$accent` (`:217`).
   - CountPill → `descendantCountLabel(countDescendants(node))` (`:248`).
   - NULL `inviteCode` → render mono `"root"` line (`:240-244`).
   - *Acceptance:* visual check against board `25-s16-family-tree.txt`; captain
     pill and match border both use `$accent`; "1 descendant" vs "N descendants"
     renders correctly; root nodes show a `"root"` mono label.

8. **Delete dead db helpers** `getInvitesIssuedBy` / `getRootCodes`
   (`relations.ts:45-67`) — or, if the team wants to retain them, mark
   `@deprecated`. Recommend delete (zero consumers, spec-confirmed dead).
   - *Acceptance:* grep shows no references; build passes.

### Test approach / existing tests
- **Existing tests:** none for this domain. The only related suite is
  `apps/web/lib/__tests__/camp-roster.test.ts` (a *different* domain) — it is
  the **style precedent**: `vitest`, a fixture factory (`member(overrides)`),
  pure-function assertions. Mirror that exactly for core: a `referralUser(...)`
  fixture factory and a `chain([...])` helper to build rosters.
- **New tests live with the pure code** — `packages/core/src/__tests__/
  referral-tree.test.ts` (vitest). Cover: `buildTree` (roots from NULL inviter,
  orphan-as-root when inviter missing, **cycle → finite forest**),
  `computeMatchIds` (name match, code match, case-insensitive, ancestor
  promotion, empty query → null, **cycle → terminates**), `countDescendants`
  (recursive total), `subtreeHasMatch`, `descendantCountLabel` (1 vs N).
  The cycle cases are the acceptance gate for the MUST-FIX.
- The component stays UI-tested by manual QA against the board (no component
  test infra is set up for these route files today).

---

## Cross-domain dependencies

- **Invite codes domain** (`invite_codes` table; `packages/db/src/invite-codes.ts`):
  this graph is *defined by* `invite_codes.created_by_user_id` and
  `users.invite_code`. Read-only here — the family tree never writes codes — but
  it is downstream of however invites are minted/redeemed. The `code` PK doubles
  as the via-slug label; no coordination needed unless the invite redesign were
  to change the code format (it does not — db-impact: format-agnostic text PK).
- **Identity / users domain** (`users.id`, `display_name`, `rank`,
  `invite_code`, `approval_status`): supplies every node's identity, label,
  captain pill, and the gate inputs. `profile_image_url` exists but is
  deliberately unselected (avatars are the deferred NEW item, open question #2).
- **Access-control / auth** (`apps/web/lib/auth.ts`, `apps/web/lib/users.ts`:
  `getAuthenticatedUserOrRedirect`, `ensureCampUser`, `hasCampAccess`,
  `isApproved`): the page's gate spine. Reused as-is; `campUser.id` is the
  `viewerUserId` for the highlight. Not rank-gated (member + captain both see
  the full tree) — distinct from the roster surface.
- **Roster domain** (`packages/db/src/roster.ts`): adjacent and similarly named
  but independent. Shares only the underlying `invite_codes` join used by
  `getCampMemberDetail` for an inviter *name*; no shared code path. Worth noting
  so the two `*Roster` functions are not conflated during the build.
- **Shared types `@camp404/types`** and **NEW `@camp404/core`**: this domain is
  the first consumer of `core`; sibling domain plans that also extract pure
  logic should target the same package.
