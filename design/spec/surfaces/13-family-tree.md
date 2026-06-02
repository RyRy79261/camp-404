# Family tree (referral graph) — functional brief

- **Route(s):** `/family-tree`
- **Canonical board(s):** `S16 Family tree` (board #25, 720×1000px, `design/.spec-extract/boards/25-s16-family-tree.txt`)
- **Superseded / dropped:** none — single board, no iterations. (Live `getReferralRoster` carries two orphaned helpers `getInvitesIssuedBy` / `getRootCodes` — neither is wired into this surface; see Open questions.)
- **Breakpoints:** wide tree canvas, NOT the 430px mobile shell. Board shell = 720px; live code = `max-w-3xl` (768px). This is a deliberate exception to the global `max-w-lg` mobile-first shell — the recursive indented tree needs horizontal room. Mobile (≤430px) still renders the same tree, scrolling horizontally / wrapping within the narrower viewport; indentation step (20px/level) and guide-line geometry are unchanged across breakpoints.

---

## Purpose

A read-only, whole-camp visualisation of the referral graph — "who brought who onto Camp 404". Every camp account is a node in a recursive, collapsible parent→child tree; a node's parent is the user who issued the invite code that node redeemed (`invite_codes.created_by_user_id` for the redeemed `users.invite_code`). **Roots** are accounts with no inviter — god/founder accounts that pre-date the invite system (NULL `invite_code`), accounts whose redeemed code has a NULL `created_by_user_id`, or accounts whose code no longer matches any `invite_codes` row (left-join miss). **Branches** are accounts whose redeemed code maps to an issuing user.

The surface supports name/invite-code search with match-highlighting and ancestor-path promotion, expand-all / collapse-all, per-node total-descendant counts, and highlights the viewer's own node. It is **pure visualisation** — there are NO mutating actions: no invite, edit, delete, node drill-in, or profile link.

**Rank note:** this surface is **NOT rank-gated**. Any approved, invite-holding camp member (captain or member) sees the full whole-camp tree. The preview-but-locked `CaptainLock` treatment (decision #3) does **not** apply here, and the `/tools` tile that links here is ungated by rank. The only gates are the global access spine (auth → invite → approval).

---

## Layout & modules (decomposition)

Top-level structure (board `S16 Family tree`): a vertical column — `GhostBack` link, then `Content` (`gap:18`, `pad:[4,20,28,20]`) holding `Intro`, `Search`, `Controls`, `Tree`, and (board-documented variant/empty-state appendices) `MatchVariant` + `EmptyStates`.

### 1. GhostBack / page chrome (`page.tsx`)
- Ghost back link: `chevron-left` + "Tools" (`Inter/15px/500/$muted-foreground`), `href="/tools"`. Live: `<Button asChild variant="ghost" size="sm">`.
- **Intro block:** `<h1>` "Family tree" (`Inter/26px/700/$foreground`; live renders `text-2xl font-semibold`), subtitle (`Inter/14px/$muted-foreground`): "Who brought who onto Camp 404. Roots are accounts that pre-date the invite system; every other branch is one invite-code redemption."
- Page is `export const dynamic = "force-dynamic"` — server-rendered fresh every visit, never statically cached. `metadata.title = "Family tree — Camp 404"`.
- Layout container `<main className="mx-auto max-w-3xl px-6 py-10">`.

### 2. Search box (`<FamilyTree>` client)
- Full-width row, `h:46`, `r:$radius`, `fill:$muted`, `stroke:$border`. Leading `search` lucide icon (`$muted-foreground`), absolutely positioned left.
- Placeholder: "Search by name or invite code…". Live: `<Input className="pl-8">` with absolutely positioned `Search` icon.
- Controlled input (`query` state); empty query → no filtering/highlighting.

### 3. Controls row (Expand all / Collapse)
- Two `Button-Outline` instances, `pad:[9,16]` (live: `variant="outline" size="sm"`): "Expand all" and "Collapse".
- **Expand all** → `setExpanded(new Set(roster.map(u => u.id)))` (every node open).
- **Collapse** → `setExpanded(new Set())` (all collapsed; roots still render, children hidden).
- Board lays Controls as a separate row below Search; live code groups Search + both buttons in one `flex gap-2` row. Either composition is acceptable; preserve all three affordances.

### 4. Tree region (`<FamilyTree>` → recursive `<Branch>`)
The ordered list of root branches. Each row decomposes into: `Guides` (tree connector lines), `Toggle` (chevron/dot), and `Card` (the node). Children render recursively beneath an open parent.

#### 4a. Branch row container
- `<li className="relative">`; inner row `flex items-stretch` with `paddingLeft: depth * 20`px.
- Recursive: an open parent renders a `<ul>` of child `<Branch>`es at `depth + 1`, each told `isLastChild={idx === lastIndex}`.

#### 4b. Tree guide lines (`Guides`)
- Pure CSS, no SVG. Rendered only for `depth > 0`.
- **Vertical line:** `border-l border-border`, `left: (depth-1)*20 + 18`, `top: 0`; `bottom: 0` normally, or `bottom: "50%"` when `isLastChild` (so the line stops at the elbow of the last child).
- **Horizontal elbow:** `border-t border-border`, `left: (depth-1)*20 + 18`, `width: 14`, `top: 22`.
- Board models the same with nested `seg` frames (`w:20 h:44`, 1px `$border` line) — one `seg` per ancestor depth level (the board shows depth 1 → one seg, depth 2 → two segs, depth 3 → three segs). Both express identical connector geometry; live CSS is the implementation of record.

#### 4c. Toggle button (`Toggle`)
- `h-11 w-6` (44px tall hit-target), centered. `aria-label` = "Collapse" when open / "Expand" when closed.
- **Has children, open:** `chevron-down`. **Has children, closed:** `chevron-right`. **Leaf (no children):** a small dot (`h-1.5 w-1.5 rounded-full bg-muted-foreground/40`); button `disabled` (`disabled:opacity-30`).
- Click only toggles when `hasChildren`.

#### 4d. Node card (`Card`)
- `<Card>` (flex row, `gap:10 pad:[8,12]`, `r:$radius`, `fill:$card`, `stroke:$border`).
- **Avatar slot:** circular bordered badge (`w-7 h-7 rounded-full border bg-muted/40`) with a generic lucide `user` glyph (`$muted-foreground`). **This surface ignores `users.profile_image_url`** — `getReferralRoster` does not select it, so no real avatars (see Open questions).
- **NameRow:** display name (`Inter/14px/600/$foreground`), truncated, falling back to "(no name)" when `display_name` is NULL. Followed inline by optional pills:
  - **CaptainPill** — if `rank === "captain"`: pill `pad:[3,8] r:999`, fill `#00dcff26` (cyan tint = `$accent` @ ~15%), text "Captain" (`Inter/11px/600/$accent`). No pill for `member`.
  - **YouPill** — if `node.user.id === viewerUserId`: pill `pad:[3,8] r:999 fill:$primary`, text "You" (`Inter/11px/600/$primary-foreground`).
- **Via-code line:** if `inviteCode` present, muted line "via `<code>`" with the code in mono (`JetBrains Mono/12px/$muted-foreground`), truncated. Absent for NULL `invite_code` (god/root accounts → board shows roots like "Marlo Vex" with `T "root"` instead of a via line; live code renders no line at all when `inviteCode` is NULL).
- **CountPill (descendant count):** if the node `hasChildren`, a muted pill (`pad:[3,9] r:999 fill:$muted`) showing `countDescendants(node)`. Board copy: "5 descendants" / "2 descendants" / "1 descendant"; live renders only the bare integer. Reconcile copy (see Divergences).

#### 4e. Highlight rings (node card states)
- **Viewer node:** `ring-1 ring-primary` (board: `stroke:$primary` on Theo Mars' card + YouPill).
- **Search-match node:** when `matchIds` is active, matched nodes get a highlight border. Board: `stroke:$accent` (the `MatchVariant` row shows Sara Quinn's card with `stroke:$accent`). Live: `border-amber-400/60`. Reconcile onto `$accent` (see Divergences).

### 5. MatchVariant (board appendix — documentation only)
- A labelled example ("search match-highlight") showing a single matched leaf row with `stroke:$accent`. Not a separate surface region — it documents the match-highlight presentation of 4e for the design canvas. Implemented inline as the per-node match border.

### 6. EmptyStates (board appendix → live empty `<Card>`)
- A divider + two labelled boxes documenting the two empty presentations:
  - **empty — no accounts:** box (`pad:[24,16] fill:$muted`) reading "No accounts yet."
  - **empty — no matches:** box reading "No matches."
- Live: a single `<Card><CardContent className="py-10 text-center text-sm text-muted-foreground">` rendering "No matches." when a query is active else "No accounts yet.", shown when `visibleTrees.length === 0`.

---

## Components used (reusable + new)

| Component | Role | Key props / variants |
|---|---|---|
| `Button` (`@camp404/ui` button) | Back link + Expand-all/Collapse controls | `variant="ghost" size="sm"` (back, `asChild`→`<a>`); `variant="outline" size="sm"` (= board `Button-Outline`) ×2 |
| `Card` + `CardContent` (`@camp404/ui` card) | Node card; empty-state box | default; node card extended with `ring-1 ring-primary` (viewer) / match border (`$accent`) |
| `Input` (`@camp404/ui` input) | Search field | controlled; `className="pl-8"` to clear the leading icon |
| Lucide icons | `ChevronLeft` (page), `Search` / `ChevronDown` / `ChevronRight` / `User` (component) | inline sizing |
| **`FamilyTree`** (new, client; `apps/web/app/family-tree/family-tree.tsx`) | Client container: search, controls, empty state, root branch list, all filter/expansion state | props `{ roster: TreeUser[]; viewerUserId: string }` |
| **`Branch`** (new, recursive sub-component, same file) | One tree row: guides + toggle + node card + recursive children | props `{ node, depth, expanded, onToggle, matchIds, viewerUserId, isLastChild }` |

**Pure helpers (module-scope, not components):** `buildTree(roster)` (roster→root `TreeNode[]`), `subtreeHasMatch(node, matches)`, `countDescendants(node)`.

**Types:** `TreeUser` (exported, mirrors `ReferralUser` from `relations.ts`); `TreeNode = { user: TreeUser; children: TreeNode[] }`.

**Not used:** `TopChrome`, `SectionHeader`, `DetailHeader`, `GridTile`, `InputField`, `EmptyState`, `CaptainLock` — none apply (no rank gate, no shared chrome). The two amber/cyan pills (CaptainPill, YouPill) and the descendant CountPill are bespoke inline spans, not shared primitives. **CaptainPill / YouPill / CountPill** are candidate new shared pills if a Pill primitive is later extracted (see roster spec), but on this surface they are inline.

---

## States

Global gating matrix (handled by the access spine in `page.tsx`, before render):

| State | Behaviour on this surface |
|---|---|
| **Unauthenticated** | `getAuthenticatedUserOrRedirect()` → redirect `/auth/sign-in`. Page never renders. |
| **Invite-gated** (non-god, NULL `invite_code`) | `!hasCampAccess` → redirect `/signup/required`. |
| **Pending approval** (non-god, `approval_status='pending'`) | `!isApproved` → redirect `/pending-approval`. |
| **Rejected** (non-god, `approval_status='rejected'`) | Not `'approved'` → `!isApproved` → redirect `/pending-approval` (terminal denial). No distinct rejected screen here. |
| **God account** (`isGodEmail`) | Bypasses invite + approval gates regardless of stored `invite_code` / `approval_status`; in the tree usually appears as a **root** (NULL `invite_code` → NULL `inviterId`). |
| **Onboarding-incomplete** | Handled upstream by the global gating spine, not on this page. |
| **Captain-locked / preview-but-locked** | **N/A.** This surface is NOT rank-gated; member and captain both see the full tree. (Documented explicitly because decision #3 applies to captain surfaces — this is not one.) |

On-surface render states:

| State | Behaviour |
|---|---|
| **Loading** | None. Server component; the tree renders once `getReferralRoster()` resolves. No skeleton/spinner. (If converted to client-fetch later, add a skeleton — flag.) |
| **Populated** | Recursive `<Branch>` list of visible root trees. Default expansion = roots only, one level (every `!u.inviterId` id pre-seeded into `expanded`). |
| **Empty — no accounts** | `visibleTrees.length === 0` AND empty query → card "No accounts yet." |
| **Empty — no matches** | `visibleTrees.length === 0` AND non-empty query → card "No matches." |
| **Viewer-highlight** | Viewer's own node: `ring-1 ring-primary` + "You" pill. |
| **Match-highlight** | While a query is active, matched/promoted nodes carry the `$accent` border; matched paths are force-expanded. |
| **Leaf / disabled toggle** | Leaf nodes show a dot instead of a chevron; the toggle button is `disabled` (`disabled:opacity-30`). |
| **Collapsed** | Roots rendered, children hidden (Collapse pressed, or any node manually collapsed). |
| **NOT present** | No validation-error, submitting/pending, success, offline/sync, or budget states — there are no forms or writes on this surface. |

---

## User actions

| Action | Result |
|---|---|
| Tap "Tools" (back) | Navigate to `/tools` (S13 Tools hub). |
| Type a search query | Filter tree to subtrees containing matches by display name OR invite code (case-insensitive substring); auto-expand matched paths; promote/show every ancestor of a match; apply `$accent` highlight border to matched nodes. Only roots whose subtree contains a match remain visible; within open branches, children are filtered to those whose subtree contains a match. |
| Clear search (empty the field) | Restore full tree and the user's manual expansion state; remove highlights and forced expansion. |
| Tap a node's chevron (parent only) | Toggle that node's children open/closed (`toggle(id)` flips id in `expanded`). Leaf toggles are inert (disabled). |
| Tap "Expand all" | Every node expanded. |
| Tap "Collapse" | Every node collapsed to roots only. |
| (None other) | No invite, edit, delete, node selection/drill-in, or profile link. Read-only. |

---

## Data & enums (mapped to `schema.ts`)

**Read-only. Two tables, joined by `getReferralRoster()` (`packages/db/src/relations.ts`):**

`getReferralRoster` selects one row per user via
`users LEFT JOIN invite_codes ON invite_codes.code = users.invite_code`, ordered by `users.display_name ASC`. Returns `ReferralUser[] = { id, displayName, rank, inviteCode, inviterId }`.

- **`users`** (`schema.ts:220`):
  - `id` (`uuid`, PK) → node identity + `viewerUserId` comparison.
  - `display_name` (`text`, nullable) → name, "(no name)" fallback.
  - `rank` (`rank` enum) → CaptainPill (only `captain` renders a badge).
  - `invite_code` (`text`, nullable) → "via …" line AND the join key. NULL = god/root account.
  - `profile_image_url` (`text`, nullable) — **exists but NOT selected** → tree always shows the generic user glyph (see Open questions).
  - `approval_status` (`approval_status` enum) — gate input only; only `approved` (or god) reaches the page.
- **`invite_codes`** (`schema.ts:312`):
  - `code` (`text`, PK) → join target.
  - `created_by_user_id` (`uuid`, FK→`users.id`, `onDelete: set null`) → `inviterId`, the parent edge. NULL for root/bootstrap codes.
- **Viewer identity:** `campUser.id` from `ensureCampUser` → `viewerUserId`.

**Enums touched:** `rank` (`"captain" | "member"`), `approval_status` (`"pending" | "approved" | "rejected"` — gate only).

**NEW schema:** **none.** This surface adds zero tables, columns, or enums. (The single redesign schema change — `captain_promotion_requests` / `promotion_request_status`, decision #4 — belongs to the roster surface, not here.)

---

## Validation & edge cases

- **Access order:** authenticated → has camp access (god email OR non-null `invite_code`) → approved (god OR `approval_status='approved'`). Failing any gate redirects out; the page never partially renders for a blocked user.
- **Roots vs branches** is derived purely from `inviterId == null`: NULL invite code, code with NULL `created_by_user_id`, OR a code matching no `invite_codes` row (left-join miss) all become roots.
- **Orphan-as-root:** if `inviterId` is non-null but the referenced inviter is NOT in the roster (excluded/missing user), `buildTree` finds no parent and the node becomes a root — no error.
- **Missing display name:** rendered "(no name)"; still searchable by invite code.
- **Empty query:** `matchIds` is `null` → no highlight, no forced expansion, full tree shown.
- **Descendant count** counts ALL generations below a node (recursive), not just direct children.
- **Leaf nodes** cannot be toggled (button disabled, dot marker).
- **Whole roster fetched + rendered every load** — no pagination, no lazy load; sized for the camp's ~30–80 people by design. `force-dynamic` re-queries each visit; no caching/invalidation concerns.
- **No write path** → no validation errors, optimistic UI, or conflict handling.
- **Cycle safety (KNOWN SOURCE BUG):** the `matchIds` ancestor-promotion walk follows `inviterId` via `while (cursor)` with **no visited-set guard**. A cyclic `inviterId` chain (A→B→A, e.g. via manual DB edits) makes the loop never terminate → infinite loop / hung client render on any search query. Cycles are presumed domain-impossible (you can't redeem a code before existing), but nothing defends against them. **Build reconciliation:** add a `visited` Set to the promotion walk (and guard `buildTree`) when this surface is rebuilt. Flagged, not silently inherited.

---

## Flows

```
[user on /tools] → tap "Family tree" tile → /family-tree
  page.tsx gates: auth? → invite? → approved?
    fail any → redirect (/auth/sign-in | /signup/required | /pending-approval)
    pass → getReferralRoster() → render <FamilyTree roster viewerUserId>

[on /family-tree]
  default: roots expanded one level; viewer node ring+You pill
  → type query        → filter + highlight ($accent) + force-expand matched paths
       no matches      → "No matches." card
  → clear query        → restore full tree + manual expansion
  → tap chevron        → toggle that node's children
  → Expand all / Collapse → bulk expand / collapse-to-roots
  → tap "Tools"        → exit to /tools
```

No mutating exits — the only navigation out is the back link to `/tools`.

---

## Divergences from feature-set reference — and resolution

| Signal (board vs live vs reference) | Resolution (per locked decisions) |
|---|---|
| **Captain badge colour:** board CaptainPill uses `$accent` (text `$accent`, fill `#00dcff26` cyan tint). Live code uses hard-coded `bg-amber-500/15 text-amber-300`. | **Board wins → use `$accent`.** Decision #6 ("reconcile drifts to semantic tokens — `$accent` vs amber (tree/announcements)"). Replace the amber captain pill with the `$accent` token. |
| **Match-highlight border:** board `MatchVariant` shows `stroke:$accent`. Live code uses `border-amber-400/60`. | **Board wins → `$accent`.** Same token reconciliation (decision #6). Both captain pill and match border unify on `$accent`. |
| **Descendant-count copy:** board CountPill reads "5 descendants" / "1 descendant" (with singular/plural). Live renders only the bare integer. | **Board wins → render "N descendant(s)"** with correct singular/plural. Trivial copy fix; board is canonical. |
| **Root via-line:** board roots show `T "root"` in mono where branches show "via `<slug>`". Live renders NO line at all when `invite_code` is NULL. | **Board wins → render a "root" mono label** for NULL-invite-code roots, mirroring the "via …" treatment. Clarifies why a node has no inviter. Low-risk add. |
| **Page width:** board shell 720px; live `max-w-3xl` (768px). Reference flags low-confidence on whether the wide width is intentional. | **Intentional.** A recursive indented tree needs horizontal room; the wider canvas is a deliberate exception to the 430px mobile shell. Keep `max-w-3xl`. |
| **Avatars:** reference notes `profile_image_url` exists but is unselected → generic glyph only. | **Keep generic glyph as drawn** (board avatar is a `user` lucide glyph in a muted circle). Optionally select `profile_image_url` to show real photos — flagged as enhancement, not required by the board. |
| **Reference describes orphaned `getInvitesIssuedBy` / `getRootCodes` helpers.** | Not used by this surface; leave as documented dead/future code. Not part of this brief's contract. |
| **Voice / dictation:** decision #5 — field-level dictation only. | N/A — no input fields write data here; the search box is filter-only, no dictation. |

No functionality implied by either the board or the reference contract has been dropped.

---

## Open questions / build reconciliations

1. **Cycle guard (source bug):** add a `visited` Set to the `matchIds` ancestor-promotion walk (and harden `buildTree`) to prevent an infinite loop on a cyclic `inviterId` chain. Currently undefended; presumed domain-impossible. Confirm we fix on rebuild.
2. **Real avatars:** should the tree show members' `profile_image_url` (cheap to add — the column lives on the identity row for exactly this) instead of the generic glyph? Board draws a glyph; reference flags the omission. Product/design call.
3. **Descendant-count semantics:** the pill counts ALL descendants (every generation), not direct children. Board copy "N descendants" is ambiguous between the two — confirm "total subtree" is the intended meaning (it is, in live code).
4. **Token: captain colour identity.** `$accent` (electric blue, `oklch(0.62 0.18 255)`) is the chosen captain/match colour per decision #6, replacing amber. Confirm `$accent` is the right semantic for "captain" everywhere (announcements also use it) vs. introducing a dedicated status token. The board's CaptainPill fill `#00dcff26` is a raw cyan tint and should be expressed as `$accent / ~15%` rather than a hard hex.
5. **PII surface:** the family tree shows display names whole-camp to any approved member. This is lower-sensitivity than the roster's plaintext email (decision-list PII note), but confirm whole-camp visibility of the referral graph is acceptable to the data owner.
6. **Mobile composition:** board Controls is a row below Search; live groups Search + buttons in one row. At ≤430px the three controls may need to stack. Confirm preferred mobile composition (does not change behaviour).
