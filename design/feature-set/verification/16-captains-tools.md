# Verification — 16 captains-tools

**Verdict:** accurate  ·  checked 48 claims, verified 46.
The doc is a high-fidelity description of a small, self-contained server component; every gate, line citation, enum, string, and the member-hub mirror comparison check out digit-for-digit against source. The only soft spots are two design-convention assertions (the `max-w-lg` "north-star") and the labelling of the empty-`TOOLS` path as "dead", both of which are correctly self-flagged as low-confidence in the doc itself.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | "note `max-w-2xl`, wider than the global `max-w-lg` north-star" (page.tsx:56) | `max-w-2xl` is actually the more common container width under `app/` (7 occurrences vs 3 for `max-w-lg`); there is no enforced `max-w-lg` global convention in code. The factual half — captain hub uses `max-w-2xl` and matches the member hub — is correct. The "north-star" framing is a design assertion, not code-backed. | captains/tools/page.tsx:56; tools/page.tsx:61 |
| low | Gate chain described as "Four-stage gate chain" in the heading but then enumerated as five numbered items (auth, ensureCampUser, hasCampAccess, isApproved, rank). | Source has 4 *gating* checks (auth-redirect, hasCampAccess, isApproved, rank) plus the non-gating `ensureCampUser` resolution step. The "Four-stage" label vs the 5-item list is an internal inconsistency in the doc; the underlying code is described correctly. | captains/tools/page.tsx:41-53 |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | The `ToolEntry.icon` field is typed `React.ReactNode`, and `tool.icon` is rendered inside a `h-10 w-10` bordered square while the icon glyph itself is `h-5 w-5` — the doc says "10×10 bordered icon square (`tool.icon`)" and separately "`<Megaphone className=\"h-5 w-5\" />`", which is correct but does not explicitly call out that the 10×10 is the wrapper `<span>` and the 5×5 is the glyph. Minor; no defect. | captains/tools/page.tsx:78-79, 36 |

## Spot-confirmed
- `export const dynamic = "force-dynamic"` — captains/tools/page.tsx:14. ✓
- `export const metadata = { title: "Camp tools — Camp 404" }` — captains/tools/page.tsx:16. ✓
- Gate chain in order: `getAuthenticatedUserOrRedirect()` (41) → `ensureCampUser(authUser)` (42) → `!hasCampAccess` → `redirect("/signup/required")` (43-45) → `!isApproved` → `redirect("/pending-approval")` (46-48) → `campUser.rank !== "captain"` → `redirect("/")` (51-53). ✓
- `getAuthenticatedUserOrRedirect()` redirects to `/auth/sign-in` when unauthenticated — auth.ts:40-44, redirect at auth.ts:42. ✓
- Source comment "Unlike the data-locked camp-management view, there is nothing useful to show a non-captain here, so bounce them home." — captains/tools/page.tsx:49-50. ✓ (doc quotes verbatim)
- `TOOLS` array is exactly one entry — captains/tools/page.tsx:30-38: `href: "/captains/announcements"`, `title: "Announcements & notifications"`, description verbatim match, `icon: <Megaphone className="h-5 w-5" />`. ✓
- Card render: full-card `next/link` to `tool.href` (72-75) wrapping `Card` (76); `h-10 w-10` bordered icon square (78-79); `CardTitle` `text-base` (82); `CardDescription` (83-85); trailing `ChevronRight` (87). ✓
- Back button: ghost `Button` `size="sm"` `asChild` over `<a href="/">` labelled "Captains" with leading `ChevronLeft` — captains/tools/page.tsx:57-61. ✓
- Header `<h1>` "Camp tools" + subtitle "Captain-only tooling for running the camp." — captains/tools/page.tsx:62-67. ✓
- Layout container `<main className="mx-auto max-w-2xl px-6 py-10">` — captains/tools/page.tsx:56. ✓
- Link focus styling `block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring` — captains/tools/page.tsx:74. ✓
- Card hover `transition-colors hover:bg-accent/30` — captains/tools/page.tsx:76. ✓
- Entry-point tile: `rank: "captain"` layer, `bottomRight`: `label: "Camp Tools"`, `hint: "Announcements, ops…"`, `href: "/captains/tools"`, `icon: <Wrench className="h-5 w-5" />` — app/page.tsx:172-177; `Wrench` imported at app/page.tsx:2. ✓
- This page's own header uses no Wrench (imports only `ChevronLeft, ChevronRight, Megaphone`) — captains/tools/page.tsx:3. ✓
- `Rank` type = `"captain" | "member"` — users.ts:32; gated on literal `"captain"` at page.tsx:51. ✓
- `rankEnum = pgEnum("rank", ["captain", "member"])` — schema.ts:31. ✓
- `ApprovalStatus` = `"pending" | "approved" | "rejected"` — users.ts:33; `approvalStatusEnum = pgEnum("approval_status", ["pending","approved","rejected"])` — schema.ts:41-45. ✓
- `isApproved` compares against literal `"approved"` — users.ts:235. ✓
- `hasCampAccess(user, email)` returns `isGodEmail(email) || !!user.inviteCode` — users.ts:219-224 (body 223). ✓
- `isGodEmail` case-insensitive CSV match against `process.env.GOD_EMAILS` — access-control.ts:28-32. ✓
- `ensureCampUser` resolves real row or synthetic non-persisted row — users.ts:60-95; synthetic row `id: ""`, `inviteCode: null`, `rank: "member"`, `approvalStatus: "approved"` — users.ts:86-94. ✓
- God auto-created row uses `rank: "member"` — users.ts:75; seeds burner-profile action on first sign-in — users.ts:70-80 (`seedBurnerProfileAction` at 78). ✓
- `users.rank` column: `rank: rankEnum("rank").notNull().default("member")` — schema.ts:231. ✓
- `users.approvalStatus` column: `approvalStatusEnum("approval_status").notNull().default("approved")` — schema.ts:267-269. ✓
- `users.inviteCode` is `text("invite_code")` (nullable) — schema.ts:260. ✓
- Onboarding gate genuinely absent: captains/tools/page.tsx contains no `getPendingRequiredActions`/`nextGate` call; the home gating spine does (`nextGate(await getPendingRequiredActions(campUser.id))`) — app/page.tsx:16, 47. ✓
- Test mode: auth routes through `camp404_test_user` cookie under E2E (auth.ts:26-29); user resolution selects `testBackend` under `isE2ETestMode()` (users.ts:64); `isTeamLead` always `false` in test backend — users.ts:448. ✓
- `typedRoutes: true` enabled — next.config.ts:8 (supports the typed-`href` claim). ✓
- Linked destination `apps/web/app/captains/announcements/page.tsx` exists and back-links via `<a href="/captains/tools">` labelled "Camp tools" — announcements/page.tsx:37. ✓
- Member-hub mirror (tools/page.tsx): no rank gate, ends after approval gate (50-58); no back button (no `Button`/`ChevronLeft` import); focus ring on `Card` (74) with `focus:outline-none` on `Link` (73); TOOLS = Invite a member (`/tools/invite`, `Mail`), My forms (`/tools/forms`, `ClipboardList`), Family tree (`/family-tree`, `GitBranch`) (28-48); header "Tools" / "Uncategorised tooling for camp members. …" (63-67). ✓ All divergence claims correct.

## Low-confidence / could-not-verify
- "global `max-w-lg` north-star" — this is a design-system convention claim; code shows no enforced global width and `max-w-2xl` is in fact more prevalent under `app/`. Flagged as Inaccuracy (low) above. The doc itself does not source this to code.
- Empty-`TOOLS` "dead branch" (page.tsx:69-93) — correctly self-flagged low-confidence in the doc. Structurally an empty array renders a bare `<ul>` with no `<li>` and no placeholder; this is accurate, but "dead" is a product/runtime assertion (depends on TOOLS never being emptied) rather than a code guarantee.
- Onboarding-gate omission framed as "intentional" — the doc self-flags this. Code confirms the gate is *absent*; whether the omission is deliberate vs an oversight is a design question not answerable from source (no comment in captains/tools/page.tsx explains the omission).
- God-account-with-member-rank bounce (users.ts:75 → rank gate at page.tsx:51) — the doc's logical deduction is correct given the code, and is self-flagged low-confidence; whether a real god account is ever later promoted to `captain` depends on runtime DB state not visible in source.
