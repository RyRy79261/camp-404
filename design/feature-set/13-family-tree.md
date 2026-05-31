# 13 — Family tree referral graph

**Files covered:**
- `apps/web/app/family-tree/page.tsx` — server page; gates access (invite + approval), loads the roster, renders the page chrome (back-to-Tools link, title, subtitle), mounts the client `<FamilyTree>`.
- `apps/web/app/family-tree/family-tree.tsx` — `"use client"` component; builds the parent→child tree from the flat roster, renders the search box / expand-collapse controls / recursive `<Branch>` rows, and all client-side filtering & expansion state.
- `packages/db/src/relations.ts` — server-only Drizzle query layer; `getReferralRoster()` (the only one the page uses), plus the unused `getInvitesIssuedBy()` and `getRootCodes()` helpers. Defines `ReferralUser`.
- `packages/db/src/schema.ts` — source of the two tables read: `users` (referenced cols: `id`, `display_name`, `rank`, `invite_code`) and `invite_codes` (referenced col: `created_by_user_id`, joined via `code`).
- `apps/web/lib/users.ts` — gating helpers `ensureCampUser`, `hasCampAccess`, `isApproved` (and `CampUser` shape supplying `viewerUserId`).
- `apps/web/lib/auth.ts` — `getAuthenticatedUserOrRedirect` (auth gate, redirects to `/auth/sign-in`).
- `apps/web/lib/access-control.ts` — `isGodEmail` (god accounts bypass invite/approval gates).
- `apps/web/app/tools/page.tsx` — the entry tile that links here (`/tools` → "Family tree" / GitBranch / "See who brought who onto camp.").

**Purpose:** A read-only, whole-camp visualisation of the referral graph — "who brought who onto Camp 404". It renders every camp user as a node in a collapsible parent→child tree, where each node's parent is the user who issued the invite code that node redeemed. **Roots** are accounts with no inviter (god/founder accounts that pre-date the invite system, or whose redeemed code has a NULL `created_by_user_id`); **branches** are accounts whose redeemed invite code maps to an issuing user. The page supports name/invite-code search (with ancestor-path promotion), expand-all/collapse-all, per-node descendant counts, and highlights the viewer's own node and search matches. It is a pure visualisation — there are no mutating actions on this surface.

## Features

### Page chrome & access gating (`page.tsx`)
- `export const dynamic = "force-dynamic"` (`page.tsx:9`) — always server-rendered fresh, never statically cached.
- `export const metadata = { title: "Family tree — Camp 404" }` (`page.tsx:11`).
- **Three sequential gates** before render (`page.tsx:14-21`):
  1. `getAuthenticatedUserOrRedirect()` → if unauthenticated, redirect to `/auth/sign-in` (`auth.ts:40-44`).
  2. `ensureCampUser(authUser)` then `if (!hasCampAccess(campUser, authUser.primaryEmail)) redirect("/signup/required")` — invite-gated (`page.tsx:15-18`).
  3. `if (!isApproved(campUser, authUser.primaryEmail)) redirect("/pending-approval")` — pending/rejected accounts blocked (`page.tsx:19-21`).
- After gates pass: `const roster = await getReferralRoster()` (`page.tsx:23`), then render `<FamilyTree roster={roster} viewerUserId={campUser.id} />` (`page.tsx:40`).
- Layout container: `<main className="mx-auto max-w-3xl px-6 py-10">` (`page.tsx:26`). **NOTE:** this surface uses `max-w-3xl`, not the global `max-w-lg` mobile shell — a deliberately wider tree canvas. <!-- low-confidence: whether the wider width is intentional vs. an oversight; only the literal class is confirmed. -->
- **Back link:** ghost `<Button asChild variant="ghost" size="sm">` wrapping `<a href="/tools">` with a `ChevronLeft` icon and text "Tools" (`page.tsx:27-31`).
- **Header:** `<h1>` "Family tree"; `<p>` subtitle (muted): "Who brought who onto Camp 404. Roots are accounts that pre-date the invite system; every other branch is one invite-code redemption." (`page.tsx:32-38`).

### Roster query (`relations.ts` — `getReferralRoster`)
- Selects one row per user (`relations.ts:22-39`): `id`, `displayName`, `rank` from `users`; `inviteCode` = `users.invite_code`; `inviterId` = `inviteCodes.createdByUserId`.
- `LEFT JOIN invite_codes ON invite_codes.code = users.invite_code` (`relations.ts:33-36`) — left join so users with a NULL `invite_code` (god accounts) still appear, with `inviterId = NULL`.
- `ORDER BY users.displayName ASC` (`relations.ts:37`) — stable ordering; comment "Ordered by displayName so the page is stable."
- `inviterId` is NULL for "the founder / god accounts that pre-date any code" (`relations.ts:18-21`). It is also NULL if a user's redeemed code exists but has a NULL `created_by_user_id` (a root code), or — because of the left join — if the user's `invite_code` no longer matches any `invite_codes.code` row.
- Returns `ReferralUser[]` (`relations.ts:9-15`): `{ id: string; displayName: string | null; rank: "captain" | "member"; inviteCode: string | null; inviterId: string | null }`.

### Tree construction (`family-tree.tsx` — `buildTree`)
- `buildTree(roster)` (`family-tree.tsx:275-287`): builds `Map<id, TreeNode>` of `{ user, children: [] }`, then for each user looks up `byId.get(u.inviterId)`; if a parent node exists, push as its child, else treat as a root. Returns the array of root `TreeNode`s.
- **Orphan-as-root behaviour:** if `inviterId` is non-null but the referenced inviter is NOT in the roster (e.g. inviter excluded/missing), `parent` is `null` and the node becomes a root (`family-tree.tsx:282-284`). No error.
- Memoised on `roster` (`family-tree.tsx:35`).

### Search / filter (`family-tree.tsx`)
- Search input (`family-tree.tsx:84-89`): placeholder "Search by name or invite code…", magnifying-glass `Search` icon absolutely positioned left.
- `matchIds` (`family-tree.tsx:37-55`): trims + lowercases the query; if empty → `null` (no filtering). Otherwise builds a `Set` of user ids whose haystack `` `${displayName ?? ""} ${inviteCode ?? ""}` `` (lowercased) **includes** the query substring.
- **Ancestor promotion** (`family-tree.tsx:45-53`): for every direct match, walk up `inviterId` chain (`parentById` map) and add every ancestor to `matchIds`, "so the path stays visible".
- `visibleTrees` (`family-tree.tsx:75-77`): when searching, only roots whose subtree contains a match are shown (`subtreeHasMatch`). Otherwise all roots.
- `effectiveExpanded` (`family-tree.tsx:68-73`): when searching, force every matched-or-promoted id into the expanded set (merged with user's manual expansion) so a deep match isn't hidden inside a collapsed ancestor.
- `subtreeHasMatch(node, matches)` (`family-tree.tsx:289-292`): true if the node or any descendant id is in `matches`.
- Within an open `<Branch>`, children are also filtered to those whose subtree has a match while searching (`family-tree.tsx:159-161`).

### Expand / collapse state (`family-tree.tsx`)
- `expanded: Set<string>` of user ids (`family-tree.tsx:30-33`). **Default:** every root (`!u.inviterId`) is expanded one level so the page isn't a blank list.
- `toggle(id)` (`family-tree.tsx:57-63`): flips a single id in/out of the set. Wired to each row's chevron button.
- **"Expand all"** button (`family-tree.tsx:91-99`, outline/sm): `setExpanded(new Set(roster.map(u => u.id)))` — every node expanded.
- **"Collapse"** button (`family-tree.tsx:100-106`, outline/sm): `setExpanded(new Set())` — all collapsed (roots still rendered; their children hidden).
- A row only toggles when it `hasChildren` (`family-tree.tsx:197`).

### Branch row rendering (`family-tree.tsx` — `Branch`)
- Recursive. Each `<li>` indents by `paddingLeft: depth * 20` px (`family-tree.tsx:167`).
- **Tree guide lines** (pure CSS, no SVG; only for `depth > 0`, `family-tree.tsx:172-193`): a vertical `border-l` line (full height, or stopping at `bottom: "50%"` when `isLastChild`) plus a horizontal `border-t` elbow (`width: 14`, `top: 22`) joining the row's card. Positioned with `left: (depth - 1) * 20 + 18`.
- **Toggle button** (`family-tree.tsx:195-211`): `h-11 w-6`, `aria-label` "Collapse" when open / "Expand" when closed. Shows `ChevronDown` (open) or `ChevronRight` (closed) when the node has children; a small dot (`h-1.5 w-1.5 rounded-full bg-muted-foreground/40`) for leaf nodes. `disabled` when no children (`disabled:opacity-30`).
- **Node card** (`<Card>`, `family-tree.tsx:213-252`):
  - Avatar slot: a circular bordered badge with a generic `User` (lucide `UserIcon`) glyph — **NOT** the member's `profileImageUrl` (this surface ignores it). <!-- low-confidence: profileImageUrl exists on users but is not selected by getReferralRoster, so the family tree cannot show real avatars. -->
  - Display name: `node.user.displayName ?? "(no name)"` (`family-tree.tsx:226-228`), truncated.
  - **Captain badge:** if `rank === "captain"`, an amber pill reading "Captain" (`family-tree.tsx:229-233`). No badge for `member`.
  - **"You" badge:** if `node.user.id === viewerUserId`, a primary-coloured pill reading "You" (`family-tree.tsx:234-238`).
  - **Invite-code line:** if `inviteCode` present, a muted line "via `<code>`" (monospaced code), truncated (`family-tree.tsx:240-244`). Absent for users with NULL `invite_code`.
  - **Descendant-count pill:** if the node `hasChildren`, a muted pill showing `countDescendants(node)` (`family-tree.tsx:246-250`).
- **Highlight rings** (`family-tree.tsx:213-218`): viewer node gets `ring-1 ring-primary`; a search-match node gets `border-amber-400/60` (only while `matchIds` is active).
- Children render (`family-tree.tsx:255-270`) only when `hasChildren && isOpen && visibleChildren.length > 0`; each child passes `depth + 1` and `isLastChild={idx === visibleChildren.length - 1}`.

### Descendant count (`family-tree.tsx` — `countDescendants`)
- `countDescendants(node)` (`family-tree.tsx:294-302`): walks the subtree and sums `t.children.length` recursively — i.e. **total descendants** (all generations below), not just direct children.

## User actions & interactions
- **Navigate back to Tools** — tap the "Tools" ghost button (`href="/tools"`).
- **Type a search query** — filters the tree to subtrees containing matches by display name OR invite code (case-insensitive substring), auto-expanding matched paths and promoting/showing ancestors.
- **Clear the search** — emptying the field restores the full tree and the user's manual expansion state.
- **Toggle a single node** — tap a node's chevron (only enabled when it has children) to expand/collapse its children.
- **Expand all** — reveal every node.
- **Collapse** — collapse every node to roots only.
- There are **no** mutating actions on this surface: no invite, no edit, no delete, no node selection/drill-in, no link to a member's profile. Read-only.

## States & presentations
Global-state rows that apply:
- **Invite-gated** — non-god user with no `inviteCode` is redirected to `/signup/required` before the page renders (`page.tsx:15-18`; `hasCampAccess` `users.ts:219-224`).
- **Pending-approval** — `approval_status = 'pending'` (non-god) is redirected to `/pending-approval` (`page.tsx:19-21`; `isApproved` `users.ts:231-236`).
- **Rejected** — `approval_status = 'rejected'` (non-god) is **not** `'approved'`, so `isApproved` is false → also redirected to `/pending-approval` (terminal denial). The family-tree page itself draws no distinct rejected screen.
- **Loading** — server component; no client loading state. The list renders once the server query resolves. (No skeleton/spinner.)
- **Empty (no accounts)** — `visibleTrees.length === 0` with no query → a `<Card>` reading "No accounts yet." (`family-tree.tsx:109-114`).
- **Empty (no search matches)** — `visibleTrees.length === 0` with a non-empty query → same card reading "No matches." (`family-tree.tsx:112`).
- **Populated** — the recursive tree of `<Branch>` rows (`family-tree.tsx:116-130`).
- **Viewer-highlight state** — the viewer's own node carries `ring-1 ring-primary` + a "You" pill.
- **Match-highlight state** — matched nodes carry `border-amber-400/60` while a query is active.
- **Disabled state** — leaf-node toggle buttons are `disabled` (`disabled:opacity-30`); the dot replaces the chevron.
- **Captain-only-locked** — **N/A here.** This surface is NOT rank-gated: any approved, invite-holding camp member (captain or member) sees the full whole-camp tree. The `/tools` tile linking here is likewise ungated by rank (`tools/page.tsx:42-47`).
- **NOT present:** no validation-error, submitting/pending, success, onboarding-incomplete, offline/sync, or budget states — there are no forms or writes on this surface. (Onboarding-incomplete is handled upstream by the global gating spine, not in this page.)

## Enums, options & configurable values
- **`rank`** (`schema.ts:31`): `"captain" | "member"`. Only `"captain"` renders a badge; `"member"` renders none. The `TreeUser.rank` / `ReferralUser.rank` types mirror this literal union (`family-tree.tsx:12`, `relations.ts:12`).
- **`approval_status`** (`schema.ts:41-45`, gate input): `"pending" | "approved" | "rejected"`. Only `"approved"` (or god) reaches the page.
- **Indentation step:** `20` px per depth level (`family-tree.tsx:167, 178-189, 261`).
- **Guide-line geometry constants:** vertical line `left: (depth-1)*20 + 18`; horizontal elbow `width: 14`, `top: 22`; last-child vertical `bottom: "50%"` (`family-tree.tsx:178-191`).
- **Default expansion:** roots only, one level (`family-tree.tsx:30-33`).
- **Search haystack:** `` `${displayName ?? ""} ${inviteCode ?? ""}` `` lowercased; substring match (`family-tree.tsx:42-43`).
- **Roster ordering:** `displayName` ascending (`relations.ts:37`).
- **Page width:** `max-w-3xl` (`page.tsx:26`).
- No other configurable thresholds, no pagination limit (whole roster loaded at once).

## Data model touched
**Read-only.** Two tables, joined by `getReferralRoster` (`relations.ts:22-39`):

- **`users`** (`schema.ts:220-303`) — columns read:
  - `id` (`uuid`, PK) → `ReferralUser.id` / node identity / `viewerUserId` comparison.
  - `display_name` (`text`, nullable) → `ReferralUser.displayName` (rendered as `(no name)` when null).
  - `rank` (`rank` enum, NOT NULL, default `member`) → `ReferralUser.rank` (captain badge).
  - `invite_code` (`text`, nullable; `schema.ts:260`) → `ReferralUser.inviteCode` ("via …" line) AND the join key. NULL = god account.
  - (`profile_image_url` exists on the row but is **not** selected — see note above.)
- **`invite_codes`** (`schema.ts:312-342`) — columns read/used:
  - `code` (`text`, PK) → join target (`inviteCodes.code = users.invite_code`).
  - `created_by_user_id` (`uuid`, FK → `users.id`, `onDelete: set null`; `schema.ts:316-318`) → `ReferralUser.inviterId` (the parent edge). NULL for root/bootstrap codes.
- **Viewer identity:** `campUser.id` (the `CampUser` from `ensureCampUser`, `users.ts:39-47`) is passed as `viewerUserId`.

**Unused-but-defined queries** (in the same file, NOT called by this surface):
- `getInvitesIssuedBy(userId)` (`relations.ts:45-53`): all `invite_codes` rows where `created_by_user_id = userId`, ordered by `created_at` asc. <!-- low-confidence: grep finds no caller anywhere in apps/packages; appears orphaned/future. -->
- `getRootCodes()` (`relations.ts:60-67`): all `invite_codes` rows with NULL `created_by_user_id`. <!-- low-confidence: grep finds no caller anywhere in apps/packages; appears orphaned/future. -->

This agrees with unit 29's `users` / `invite_codes` definitions (single schema source `packages/db/src/schema.ts`).

## Validation, edge cases & business rules
- **Access rules (in order):** authenticated → has camp access (god email OR non-null `invite_code`) → approved (god OR `approval_status = 'approved'`). Failing any gate redirects out; the page never partially renders for a blocked user.
- **God accounts** (`isGodEmail`, `access-control.ts:24-31`): email in `GOD_EMAILS` (case-insensitive). They bypass both invite and approval gates regardless of stored `invite_code`/`approval_status`; in the tree they typically appear as **roots** (NULL `invite_code` → NULL `inviterId`).
- **Roots vs branches** is purely derived from `inviterId == null`: a user with no invite code, a user whose code's `created_by_user_id` is NULL, OR a user whose code matches no `invite_codes` row (left join miss) all become roots.
- **Self-referential / cycle safety:** the ancestor-promotion walk (`family-tree.tsx:47-53`) follows `inviterId` until it hits null. There is **no explicit cycle guard** — a data cycle (A invited B, B invited A, e.g. via manual edits) would cause an infinite loop here, and `buildTree` would never place such mutually-referencing nodes as roots (they'd both be each other's children). <!-- low-confidence: cycles are presumed impossible by domain (you can't redeem a code before existing), but no code defends against them. -->
- **Missing display name:** rendered "(no name)"; still searchable only by invite code.
- **Match without query:** when `query` is empty, `matchIds` is null → no highlight borders, no forced expansion, full tree shown.
- **Descendant count** counts ALL generations below a node, not just direct children (`countDescendants`).
- **Leaf nodes** cannot be toggled (button disabled, dot marker shown).
- **Whole roster is fetched and rendered every load** — no pagination, no lazy loading; scales to the camp's ~30-80 people by design.
- **Stale-data tolerance:** `force-dynamic` means each visit re-queries; no caching/invalidation concerns on this surface.
- **No write path** → no validation errors, no optimistic UI, no conflict handling.

## Sub-components / variants
- **`<FamilyTree>`** (`family-tree.tsx:22-133`) — the client container: search box, Expand-all/Collapse buttons, empty-state card, list of root `<Branch>`es. Props: `{ roster: TreeUser[]; viewerUserId: string }`.
- **`<Branch>`** (`family-tree.tsx:145-273`) — recursive row. Props `BranchProps` (`family-tree.tsx:135-143`): `{ node, depth, expanded, onToggle, matchIds, viewerUserId, isLastChild }`. Renders guide lines, toggle, the node card (avatar/name/captain badge/you badge/via-code/count pill), then its visible children.
- **Pure helpers (module-scope, not exported):** `buildTree` (roster→roots), `subtreeHasMatch` (match recursion), `countDescendants` (total-descendant count). All defined in `family-tree.tsx`.
- **Types:** `TreeUser` (exported, `family-tree.tsx:9-15`) — structurally identical to `relations.ts`'s `ReferralUser`, duplicated client-side. `TreeNode` (`family-tree.tsx:17-20`): `{ user: TreeUser; children: TreeNode[] }`.
- **Shared UI primitives used:** `@camp404/ui` `Button` (variants `ghost`, `outline`; sizes `sm`), `Card` + `CardContent`, `Input`. Lucide icons: `ChevronLeft` (page), `ChevronDown`/`ChevronRight`/`Search`/`User` (component), `GitBranch` (the `/tools` tile only).
- **Orphaned server helpers (flagged):** `getInvitesIssuedBy` and `getRootCodes` in `relations.ts` are exported but have no callers anywhere in the repo — dead/future code carried alongside the live `getReferralRoster`.
- **No dead UI variants** within the page itself; the only "variant" branching is leaf-vs-parent rendering and the highlight/badge conditionals described above.
