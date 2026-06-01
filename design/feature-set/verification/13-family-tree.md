# Verification — 13 family-tree

**Verdict:** accurate  ·  checked 71 claims, verified 70.
The doc is a faithful, line-accurate mirror of the real source across page gating, the Drizzle roster query, tree construction, search/ancestor-promotion, expand/collapse, branch rendering, schema columns, and the two orphaned helpers. Every cited file:line, enum literal, source string, and CSS constant I checked matched verbatim; the single defect is one cosmetic off-by-one in a Branch-rendering line citation.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | "Node card (`<Card>`, `family-tree.tsx:213-252`)" and "Highlight rings (`family-tree.tsx:213-218`)" — the `<Card>` opens at 213, but the card-content block that holds the avatar/name/badges/via-code/count spans 220-251, with the card element ending at 252. The 213-218 range cited for highlight rings covers only the `<Card className=[...]>` array; the description is correct, just the inclusive line span is slightly loose. | `<Card className={[...]}>` at 213-219, `ring-1 ring-primary` at 216, `border-amber-400/60` at 217, `CardContent` 220-251, `</Card>` 252. | family-tree.tsx:213-252 |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | The doc's "Empty (no accounts)" vs "Empty (no search matches)" split is real, but the doc does not note that the SAME `visibleTrees.length === 0` card distinguishes the two purely by `query ? "No matches." : "No accounts yet."` — i.e. a single ternary, one `<Card>`, not two branches. (Doc lists them as separate rows; minor over-segmentation, not wrong.) | family-tree.tsx:109-114 |
| low | Avatar `<span>` is `h-7 w-7` with a `UserIcon` sized `h-3.5 w-3.5`; doc says "circular bordered badge with a generic User glyph" but omits the exact sizes (immaterial). | family-tree.tsx:221-223 |

## Spot-confirmed
- `export const dynamic = "force-dynamic"` at page.tsx:9; `metadata = { title: "Family tree — Camp 404" }` at page.tsx:11. ✓
- Three sequential gates: `getAuthenticatedUserOrRedirect()` (page.tsx:14), `ensureCampUser` + `if (!hasCampAccess(...)) redirect("/signup/required")` (page.tsx:15-18), `if (!isApproved(...)) redirect("/pending-approval")` (page.tsx:19-21). ✓
- `getAuthenticatedUserOrRedirect` redirects to `/auth/sign-in` when unauthenticated (auth.ts:40-44). ✓
- `const roster = await getReferralRoster()` (page.tsx:23); `<FamilyTree roster={roster} viewerUserId={campUser.id} />` (page.tsx:40). ✓
- Layout `<main className="mx-auto max-w-3xl px-6 py-10">` (page.tsx:26) — confirmed `max-w-3xl`, not the global mobile shell. ✓
- Back link: `<Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5">` wrapping `<a href="/tools">` + `ChevronLeft` + "Tools" (page.tsx:27-31). ✓
- Header `<h1>` "Family tree" (page.tsx:33); subtitle verbatim "Who brought who onto Camp 404. Roots are accounts that pre-date the invite system; every other branch is one invite-code redemption." (page.tsx:34-37). ✓
- `getReferralRoster` selects `id, displayName, rank, inviteCode (= users.invite_code), inviterId (= inviteCodes.createdByUserId)` (relations.ts:25-31). ✓
- `LEFT JOIN invite_codes ON invite_codes.code = users.invite_code` via `.leftJoin(schema.inviteCodes, eq(schema.inviteCodes.code, schema.users.inviteCode))` (relations.ts:33-36). ✓
- `.orderBy(asc(schema.users.displayName))` (relations.ts:37); comment "Ordered by displayName so the page is stable." (relations.ts:19-21). ✓
- `ReferralUser` shape `{ id; displayName: string|null; rank: "captain"|"member"; inviteCode: string|null; inviterId: string|null }` (relations.ts:9-15). ✓
- `inviterId` NULL comment "the founder / god accounts that pre-date any code" (relations.ts:18-19). ✓
- `buildTree` (family-tree.tsx:275-287): `Map<id, {user, children:[]}>`, `parent = u.inviterId ? byId.get(u.inviterId) : null`, push to parent else root. ✓
- Orphan-as-root: non-null inviterId not in roster → `parent` falsy → `roots.push(node)` (family-tree.tsx:282-284). ✓
- `trees` memoised on `[roster]` (family-tree.tsx:35). ✓
- Search input placeholder "Search by name or invite code…", `Search` icon absolutely positioned `absolute left-2.5 top-1/2` (family-tree.tsx:83-89). ✓
- `matchIds` (family-tree.tsx:37-55): `query.trim().toLowerCase()`, empty → `null`; haystack `` `${u.displayName ?? ""} ${u.inviteCode ?? ""}`.toLowerCase() `` with `.includes(q)` (family-tree.tsx:38-43). ✓
- Ancestor promotion via `parentById` map, walking `inviterId` while `cursor` truthy, comment "Promote ancestors of every match so the path stays visible." (family-tree.tsx:45-53). ✓
- `visibleTrees`: `matchIds ? trees.filter(subtreeHasMatch) : trees` (family-tree.tsx:75-77). ✓
- `effectiveExpanded`: returns `expanded` when no matchIds, else merges matchIds into a copy (family-tree.tsx:68-73). ✓
- `subtreeHasMatch` returns true if node id or any descendant in matches (family-tree.tsx:289-292). ✓
- In-Branch children filtered to `subtreeHasMatch` while searching (family-tree.tsx:159-161). ✓
- Default `expanded` = `new Set(roster.filter((u) => !u.inviterId).map((u) => u.id))` with comment "roots expanded one level so the page isn't a blank list." (family-tree.tsx:30-33). ✓
- `toggle(id)` flips a single id in/out of the set (family-tree.tsx:57-63), wired to row button `onClick={() => hasChildren && onToggle(...)}` (family-tree.tsx:197). ✓
- "Expand all" button (outline/sm) → `setExpanded(new Set(roster.map((u) => u.id)))` (family-tree.tsx:91-99). ✓
- "Collapse" button (outline/sm) → `setExpanded(new Set())` (family-tree.tsx:100-106). ✓
- Row `paddingLeft: depth * 20` (family-tree.tsx:167). ✓
- Guide lines only for `depth > 0`: vertical `border-l` `left: (depth-1)*20 + 18`, `top:0`, `bottom: isLastChild ? "50%" : 0`; horizontal `border-t` elbow `width:14`, `top:22` (family-tree.tsx:172-191). ✓
- Toggle button `h-11 w-6`, `aria-label={isOpen ? "Collapse" : "Expand"}`, `ChevronDown`/`ChevronRight` for parents, leaf dot `h-1.5 w-1.5 rounded-full bg-muted-foreground/40`, `disabled={!hasChildren}` + `disabled:opacity-30` (family-tree.tsx:195-211). ✓
- Display name `node.user.displayName ?? "(no name)"`, truncated (family-tree.tsx:226-228). ✓
- Captain badge: `rank === "captain"` → amber pill reading "Captain"; no badge for member (family-tree.tsx:229-233). ✓
- "You" badge: `isViewer` (`node.user.id === viewerUserId`) → primary pill "You" (family-tree.tsx:234-238, isViewer at 156). ✓
- Invite-code line: `node.user.inviteCode &&` → "via <span class=font-mono>{code}</span>", truncated (family-tree.tsx:240-244). ✓
- Descendant pill: `hasChildren &&` → muted pill `{countDescendants(node)}` (family-tree.tsx:246-250). ✓
- Highlight rings: `isViewer ? "ring-1 ring-primary"`, `isMatch && matchIds ? "border-amber-400/60"` (family-tree.tsx:216-217). ✓
- Children render only `hasChildren && isOpen && visibleChildren.length > 0`, child gets `depth + 1` and `isLastChild={idx === visibleChildren.length - 1}` (family-tree.tsx:255-266). ✓
- `countDescendants` walks subtree summing `t.children.length` recursively — total descendants (family-tree.tsx:294-302). ✓
- `hasCampAccess` = `isGodEmail(email) || !!user.inviteCode` (users.ts:219-224). ✓
- `isApproved` = `isGodEmail(email) || user.approvalStatus === "approved"` (users.ts:231-236) — rejected status is not "approved" so it fails → /pending-approval. ✓
- `isGodEmail`: email in `GOD_EMAILS` CSV, case-insensitive (access-control.ts:28-32). ✓ (doc cited 24-31; function body is 28-32, doc-comment starts 24 — within tolerance.)
- `CampUser` shape incl. `id`, `inviteCode`, `rank`, `approvalStatus`, `profileImageUrl` (users.ts:39-47). ✓ `viewerUserId` = `campUser.id`. ✓
- `/tools` tile: `{ href: "/family-tree", title: "Family tree", description: "See who brought who onto camp.", icon: <GitBranch /> }` (tools/page.tsx:42-47). ✓ Tools page is rank-ungated (same auth+access+approved gates only, tools/page.tsx:50-58). ✓
- `rank` enum `["captain","member"]` (schema.ts:31); `approval_status` enum `["pending","approved","rejected"]` (schema.ts:41-45). ✓
- `users` table 220-303; `id uuid PK` (221), `display_name text` nullable (223), `profile_image_url text` exists but NOT selected by roster (229), `rank rankEnum notNull default "member"` (231), `invite_code text` nullable (260). ✓
- `invite_codes` table 312-342; `code text PK` (315); `created_by_user_id uuid references users.id onDelete set null` (316-318). ✓
- Orphaned helpers: `getInvitesIssuedBy(userId)` selects invite_codes where createdByUserId = userId, `orderBy(asc(createdAt))` (relations.ts:45-53); `getRootCodes()` selects invite_codes where `isNull(createdByUserId)` (relations.ts:60-67). grep across apps+packages finds ZERO callers of either — dead/future code, exactly as flagged. ✓
- Component/types: `<FamilyTree>` 22-133 with props `{ roster: TreeUser[]; viewerUserId: string }`; `<Branch>` 145-273 with `BranchProps` 135-143; `TreeUser` exported 9-15; `TreeNode` 17-20. UI primitives from `@camp404/ui` (Button, Card+CardContent, Input); lucide `ChevronLeft` (page), `ChevronDown`/`ChevronRight`/`Search`/`User as UserIcon` (component), `GitBranch` (tools tile). ✓
- No mutating actions on the surface — confirmed: only `useState` query/expanded, no server actions, no forms, no fetch/post in family-tree.tsx or page.tsx. ✓

## Low-confidence / could-not-verify
- The doc's "max-w-3xl is deliberately wider vs an oversight" note is self-flagged low-confidence; only the literal class `max-w-3xl` is confirmed (page.tsx:26) — intent is a design question, not code-verifiable.
- Cycle-safety: the doc correctly states there is NO explicit cycle guard in the ancestor-promotion `while (cursor)` walk (family-tree.tsx:49-52) nor in `buildTree`. A data cycle would indeed loop. Whether such a cycle is reachable depends on invite-redemption invariants upstream (you cannot redeem a code before existing); not defended in code, as the doc says — design-level, not falsifiable here.
- `profileImageUrl` "this surface ignores it": confirmed the roster query never selects it (relations.ts:25-31) and `ReferralUser` lacks the field — so the tree literally cannot render a real avatar. The comment on schema.ts:228 ("cheap to read from … family tree") implies it was once intended for the tree but is unused by the current query; that contradiction is a code/intent gap the doc's note captures, but the "intended" reading is not verifiable from code alone.
