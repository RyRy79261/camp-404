# Verification — 10 tools-hub

**Verdict:** accurate  ·  checked 47 claims, verified 46.
The doc is a near-exact, digit-for-digit transcription of `app/tools/page.tsx` and its gate helpers; every route, line range, enum, source string, and E2E citation I checked confirmed against live code. The only soft spot is one self-flagged low-confidence styling note where the doc's framing ("product-wide `max-w-lg`") is actually contradicted by the broader codebase — but it is already marked low-confidence and is cosmetic.

## Inaccuracies
| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | "this surface uses `max-w-2xl`, not the product-wide `max-w-lg` shell" (already self-flagged low-confidence) | `max-w-2xl` is in fact the dominant content-shell width across the app (`notifications/page.tsx:40`, `captains/tools/page.tsx:56`, `tools/forms/page.tsx:44`, `onboarding/questionnaire/page.tsx:43`, `acknowledgement-gate.tsx:114`); `max-w-lg` appears only on the centered error/empty shells (`error.tsx:29`, `not-found.tsx:14`). So `/tools` is consistent with peers, not an outlier; the "product-wide max-w-lg" premise is inverted. | tools/page.tsx:61; error.tsx:29; not-found.tsx:14 |

## Omissions
| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | The doc says a god account on first sign-in "calls `seedBurnerProfileAction`" (line 71) without noting that `seedBurnerProfileAction` is a **no-op under E2E test mode** (`if (isE2ETestMode()) return;`). Immaterial to the hub (it is `ensureCampUser`'s own side effect, correctly attributed), but the unqualified "calls" overstates the real-DB-only behavior. | users.ts:192-193 |

## Spot-confirmed
- Route `/tools`, `async function ToolsPage`, default export — tools/page.tsx:50.
- `export const dynamic = "force-dynamic";` at tools/page.tsx:13 (doc cited page.tsx:13). Exact.
- `export const metadata = { title: "Tools — Camp 404" };` at tools/page.tsx:15 (doc cited page.tsx:15). Exact, including the em-dash.
- Gate chain order auth → ensureCampUser → invite → approval at tools/page.tsx:51-58: line 51 `getAuthenticatedUserOrRedirect()`, 52 `ensureCampUser(authUser)`, 53-55 `if (!hasCampAccess(...)) redirect("/signup/required")`, 56-58 `if (!isApproved(...)) redirect("/pending-approval")`. Verbatim.
- `getAuthenticatedUserOrRedirect()` returns `AuthenticatedUser` or `redirect("/auth/sign-in")` at auth.ts:40-44 (redirect at auth.ts:42). Exact.
- `AuthenticatedUser` interface `{ id: string; primaryEmail: string | null; displayName: string | null }` at auth.ts:13-17. Exact.
- E2E test-mode auth path: `isE2ETestMode()` then `readTestUserCookie()` reading `TEST_USER_COOKIE` at auth.ts:26-29; `TEST_USER_COOKIE = "camp404_test_user"` at test-mode.ts:9. Exact.
- `ensureCampUser` at users.ts:60-95; god auto-create+approve branch (createUser with `approvalStatus: "approved"`, `rank: "member"`) + `seedBurnerProfileAction(created.id)` at users.ts:70-80; synthetic non-persisted row `{ id: "", inviteCode: null, approvalStatus: "approved", rank: "member" }` at users.ts:86-94. All exact.
- `hasCampAccess(user, email)` = `isGodEmail(email) || !!user.inviteCode` at users.ts:219-224. Exact.
- `isApproved(user, email)` = `isGodEmail(email) || user.approvalStatus === "approved"` at users.ts:231-236. Exact.
- `isGodEmail` at access-control.ts:28-32; `if (!email) return false` at access-control.ts:29; CSV case-insensitive over `process.env.GOD_EMAILS` lowercased at access-control.ts:30-31. Exact.
- `INVITE_CODES` env codes feed `isEnvCode` (access-control.ts:59-61) and `claimInviteCode` (access-control.ts:43-57) → `hasCampAccess` via `inviteCode`. Confirmed.
- `Rank = "captain" | "member"` at users.ts:32; `ApprovalStatus = "pending" | "approved" | "rejected"` at users.ts:33. Exact.
- `CampUser` interface fields `id, authUserId, displayName, profileImageUrl, inviteCode, rank, approvalStatus` at users.ts:39-47. Exact.
- `toCampUser` maps `id, authUserId, displayName, profileImageUrl, inviteCode, rank, approvalStatus` at users.ts:462-480; `approvalStatus ?? "approved"` default at users.ts:478. Exact.
- `ToolEntry` interface `{ href; title; description; icon: React.ReactNode }` at tools/page.tsx:21-26. Exact.
- `TOOLS` constant at tools/page.tsx:28-48, exactly 3 entries, all source strings verbatim: invite `/tools/invite` "Invite a member" / "Mint a single-use code to bring someone onto Camp 404." (Mail); forms `/tools/forms` "My forms" / "Revisit a questionnaire you've already completed, update your answers, and see what changed." (ClipboardList); family-tree `/family-tree` "Family tree" / "See who brought who onto camp." (GitBranch). All exact.
- Icons `Mail`, `ClipboardList`, `GitBranch`, `ChevronRight` imported from lucide-react at tools/page.tsx:3; tool icons `h-5 w-5`, ChevronRight `h-5 w-5 text-muted-foreground` at tools/page.tsx:33,40,46,85. Exact.
- Header `<h1>` "Tools" (text-2xl font-semibold) + subtext "Uncategorised tooling for camp members. We'll move tools into dedicated quadrants as we group them." at tools/page.tsx:62-68. Exact.
- Card-index markup: `<ul className="space-y-3">` → `<li key={tool.href}>` → `<Link href className="block focus:outline-none">` → `<Card className="transition-colors hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring">` with icon chip `flex h-10 w-10 items-center justify-center rounded-md border bg-muted/40`, `CardTitle className="text-base"`, `CardDescription className="mt-0.5"`, trailing `ChevronRight`. tools/page.tsx:70-91. All exact.
- Layout container `<main className="mx-auto max-w-2xl px-6 py-10">` at tools/page.tsx:61. Exact.
- Card primitives: `CardTitle` default `text-2xl font-semibold leading-none tracking-tight` (card.tsx:38) overridden to `text-base`; `CardContent` (card.tsx:58-64) and `CardFooter` (card.tsx:66-76) exported (card.tsx:78) but **not imported** by tools/page.tsx (import list at tools/page.tsx:4-9 is Card/CardDescription/CardHeader/CardTitle only). Confirmed.
- Home quadrant tile: `camp_member` layer `bottomRight` `{ label: "Tools", hint: "Meals, expenses…", href: "/tools", icon: <Wrench className="h-5 w-5" /> }` at app/page.tsx:124-129. Exact (doc cited 124-129). The hint "Meals, expenses…" indeed does not match the 3-tool list — confirmed mismatch.
- Onboarding gate intentionally absent on `/tools`: grep confirms `nextGate`/`getPendingRequiredActions` appear NOWHERE in tools/page.tsx, but DO run on the home spine at app/page.tsx:47. Confirmed.
- E2E: pending member → `/tools` → `/pending-approval` at authenticated.spec.ts:91-92. Exact.
- E2E: unauthenticated → `/tools` → `/auth/sign-in` at authenticated.spec.ts:100-101. Exact.
- Routes exist: `/tools/invite` (apps/web/app/tools/invite/page.tsx), `/tools/forms` (apps/web/app/tools/forms/page.tsx), `/family-tree` (apps/web/app/family-tree/page.tsx — top-level, not under /tools), and the separate `/captains/tools` (apps/web/app/captains/tools/page.tsx). All confirmed present.
- "Reads, never writes" on the hub path: tools/page.tsx body performs only the four gate calls and renders a static constant; no mutation/action import. Confirmed.

## Low-confidence / could-not-verify
- The "rejected → `/pending-approval`" claim for `/tools` (doc line 51) is logically sound — `isApproved` returns false for `rejected` (users.ts:235) and the page redirects to `/pending-approval` (tools/page.tsx:56-58) — but the dedicated E2E test for rejected members (authenticated.spec.ts:114-135) navigates to `/` and asserts the "Application not approved" copy, not to `/tools`. So the rejected-at-`/tools` path is verified by the shared predicate, not by a direct rejected-at-/tools E2E assertion. No defect; just no route-specific test.
- The doc's framing of `max-w-lg` as the "product-wide mobile-first shell" is already self-flagged low-confidence; the broader codebase suggests `max-w-2xl` is the norm for content surfaces. This is a design/intent question (what the canonical shell width *should* be), not a code defect, and is outside the hub's own source.
- `seedBurnerProfileAction`'s real-DB behavior (`ensureRequiredAction` against `@camp404/db/activations`) is an upstream-package internal not opened here; verified only that it is a no-op under E2E mode (users.ts:192-193). Not hub-specific.
