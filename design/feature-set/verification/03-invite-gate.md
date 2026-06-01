# Verification — 03 invite-gate

**Verdict:** accurate  ·  checked 61 claims, verified 59.
The doc is highly reliable: every code path, line citation, enum, schema field, literal string, and rate-limit constant I checked matched the real source verbatim. The only soft spots are (a) the production DB `findUsableInviteCode` being attributed to unspecified "other surfaces" when its sole real caller is the admin CLI, and (b) a self-flagged low-confidence note about `rejected → pending` re-redemption that is actually unreachable due to an earlier short-circuit. Neither breaks a rebuild.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | "`findUsableInviteCode` … this read-only validity check is for other surfaces" / "Used elsewhere" (implies web surfaces) | The production DB `findUsableInviteCode` (`@camp404/db/invite-codes`) has exactly one real caller: the founder-bootstrap admin CLI. No web route imports it (the `/api/tools/invite/check` and `/api/test/inspect` routes call the *test-store* method of the same name, not the DB one). "Other surfaces" is really "the admin CLI." | invite-codes.ts:26-50; consumer apps/admin-cli/src/index.ts:143 |
| low | Low-confidence note (line 132): "rejected→pending is reachable on re-redemption" because the guard only excludes already-`pending` | Unreachable in practice: a `rejected` user necessarily already has `inviteCode` set (rejection presupposes a prior redemption), so the earlier short-circuit `isGodEmail(...) || existing?.inviteCode` returns `{ ok: true }` before the existing-row approval block runs. The `existing.approvalStatus !== "pending"` guard is never reached for a rejected user. (Doc self-tags this low-confidence, so impact is contained.) | users.ts:122-124 vs 135-137 |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | `rateLimit` returns `retryAfterSeconds` in its result, but the action discards it and shows a static "wait a few minutes" message — doc describes the static message correctly but never notes the unused `retryAfterSeconds` field exists. Cosmetic. | rate-limit.ts:33-37, 53-59; actions.ts:30-34 |
| low | Test-store `consumeInviteCode` is *not* atomic (single-threaded JS read-then-increment) — fine because Node is single-threaded, but the doc's "atomic consume / race protection" framing is strictly only true of the SQL path; the test path mimics it only by virtue of the event loop. Doc does cite both paths but doesn't call out that the test path has no real concurrency guard. | test-store.ts:347-352 |

## Spot-confirmed
- `export const dynamic = "force-dynamic"` at page.tsx:8; `metadata = { title: "Invite required — Camp 404" }` at page.tsx:10-12. ✓
- Page flow: `getAuthenticatedUserOrRedirect()` (page.tsx:23) → `ensureCampUser(authUser)` (24) → `if (hasCampAccess(campUser, authUser.primaryEmail)) redirect("/")` (25-27) → else `<AuthShell hideBack footer="Camp 404 is invite-only.">` wrapping `<InviteGateForm email={authUser.primaryEmail} />` (29-33). ✓ All line numbers exact.
- `getAuthenticatedUserOrRedirect` redirects unauthenticated to `/auth/sign-in` at auth.ts:42 (doc said auth.ts:42). ✓
- Synthetic non-persisted row for non-god/no-invite user: `{ id: "", ... inviteCode: null, rank: "member", approvalStatus: "approved" }` at users.ts:86-94 (doc cited 84-95). ✓ Reports `approvalStatus: "approved"`, `rank: "member"`, empty id — quirk described accurately.
- Form `useActionState<SubmitInviteResult | null, FormData>(submitInviteCode, null)` → `[state, formAction, isPending]` at form:15-18. ✓
- Heading `"One more thing"` (form:23); body conditional on `email` (form:25-34) — "You're signed in as <email>. " then "Camp 404 is invite-only — drop your code below to come aboard." ✓
- Input `id="invite-code"` `name="code"` `autoComplete="off"` `spellCheck={false}` `autoCapitalize="off"` `autoCorrect="off"` `required` at form:40-48; `<Label htmlFor="invite-code">Invite code</Label>` at form:39. ✓
- Inline error `{state && !state.ok}` → `<p role="alert">` styled `var(--color-destructive)` showing `state.error` (form:51-55). ✓
- Submit `<Button type="submit" className="w-full" disabled={isPending}>` label `"Checking…"` / `"Enter camp"` (form:57-59). ✓
- Sign-out `variant="link"` `<Button asChild>` wrapping `<a href="/auth/sign-out">Sign out</a>` (form:61-67). ✓
- `SubmitInviteResult = { ok: false; error: string }` only (actions.ts:8); action signature `(_prev, formData) => Promise<SubmitInviteResult>`, returns only on failure, `redirect("/")` on success (actions.ts:17-43). ✓
- Re-auth at actions.ts:21; rate-limit `rateLimit(\`invite-redeem:${authUser.id}\`, { limit: 10, windowMs: 10 * 60_000 })` (actions.ts:25-28); exhaustion message "Too many attempts — wait a few minutes and try again." (actions.ts:32). ✓ Per-user comment at actions.ts:23-24.
- `formData.get("code")` coerced non-string→`""` (actions.ts:36-37); `redeemInviteForUser(authUser, code)`; `!result.ok` → `{ ok: false, error: result.error }`; success `redirect("/")` (actions.ts:39-42). ✓
- `redeemInviteForUser`: trim (users.ts:115), empty → "Please enter an invite code." (116); backend pick (118); short-circuit `isGodEmail || existing?.inviteCode` → `{ ok: true }` (122-124); `claimInviteCode(code)` null → "That invite code isn't valid." (126-127). ✓
- Existing-row path: `setUserInviteCode` (130); rank set iff `assignedRank && assignedRank !== existing.rank` (131-133); approval set iff `requiresApproval && approvalStatus !== "pending"` → `"pending"` (135-137); comment "only ever tightens access into the queue" at 134. ✓
- First-time path: `createUser({ ... rank: claimed.assignedRank ?? "member", approvalStatus: claimed.requiresApproval ? "pending" : "approved" })` then `seedBurnerProfileAction(created.id)` (users.ts:144-151). ✓
- `claimInviteCode`: trim, empty → null (access-control.ts:46-47); env branch `isEnvCode(trimmed)` → `{ code, assignedRank: null, requiresApproval: false }` (48-49); `isEnvCode` = `csv(process.env.INVITE_CODES).includes(code)` (59-61, case-sensitive exact match); DB branch `consumeDbCode` null→null else `{ code, assignedRank, requiresApproval }` (50-56). ✓
- `consumeDbCode` routes to `testStore.consumeInviteCode` under `isE2ETestMode()`, else `dbConsumeInviteCode` (access-control.ts:63-68). ✓
- `ClaimedInvite` = `{ code: string; assignedRank: AssignedRank | null; requiresApproval: boolean }` (access-control.ts:10-15). ✓
- `csv()` splits on `,`, trims, filters empty (access-control.ts:17-22); `isGodEmail` lowercases both sides, case-insensitive (28-32). ✓
- DB `findUsableInviteCode`: SELECT where code match, `revokedAt IS NULL`, (`expiresAt IS NULL` OR `expiresAt > now`), (`maxUses IS NULL` OR `maxUses > useCount`), limit 1, row or null (invite-codes.ts:26-50). ✓
- DB `consumeInviteCode`: atomic `UPDATE ... SET use_count = use_count + 1` guarded by the SAME usable predicate, `.returning()`, null on race-loss (invite-codes.ts:57-81). ✓
- `createInviteCode`: defaults note/maxUses/expiresAt/assignedRank/invitedEmail → null, requiresApproval → false, **lowercases invitedEmail** (`input.invitedEmail?.toLowerCase() ?? null`), throws "Failed to insert invite code" (invite-codes.ts:83-109). ✓
- `findInviteCodeByCode`: existence check ignoring revoked/expired/exhausted (invite-codes.ts:111-129); real callers are `/tools/invite/actions.ts` and `/api/tools/invite/check` (the minting/availability surface), not this gate. ✓
- `AssignedRank = "captain" | "member"` (invite-codes.ts:5). ✓
- `rankEnum = pgEnum("rank", ["captain", "member"])` (schema.ts:31); `approvalStatusEnum = pgEnum("approval_status", ["pending", "approved", "rejected"])` (schema.ts:41-45). ✓ Order and members exact.
- `invite_codes` table at schema.ts:312-342: `code` text PK (315); `created_by_user_id` uuid FK→users.id ON DELETE set null nullable (316-318); `note` text (319); `max_uses` integer (320); `use_count` integer NOT NULL default 0 (321); `expires_at` timestamp (322); `revoked_at` timestamp (323); `assigned_rank` rank enum nullable (327); `invited_email` text "Lowercased on insert" (329-331); `requires_approval` boolean NOT NULL default false (336); `created_at` NOT NULL defaultNow (337); index `invite_codes_created_by_idx` on created_by_user_id (340). ✓ All exact.
- `users.invite_code` text nullable at schema.ts:260 (doc cited 256-260 incl. comment); `approval_status` enum NOT NULL default "approved" at 267-269; `approval_decided_by_user_id` / `approval_decided_at` at 270-274. ✓
- `CampUser` interface fields `{ id, authUserId, displayName, profileImageUrl, inviteCode, rank, approvalStatus }` (users.ts:39-47); `toCampUser` at users.ts:462-480 with `approvalStatus: row.approvalStatus ?? "approved"` at 478. ✓
- `hasCampAccess(user, email) = isGodEmail(email) || !!user.inviteCode` (users.ts:219-224). ✓
- God bypass in `ensureCampUser`: auto-creates `approved`, `member`, `inviteCode: null` row + `seedBurnerProfileAction` on first sign-in (users.ts:70-79). ✓
- `seedBurnerProfileAction`: no-op under E2E (users.ts:193), else `ensureRequiredAction({ type: "questionnaire", actionKey: "burner_profile", version: QUESTIONNAIRE.version, title: "Complete your burner profile" })` (192-201). `QUESTIONNAIRE.version === "2026.05.29-v8"` (questionnaire.ts:60). ✓
- `AuthenticatedUser = { id, primaryEmail, displayName }` (auth.ts:13-17). ✓
- `isE2ETestMode()` = `process.env.E2E_TEST_MODE === "1"` (test-mode.ts:11-13). ✓
- testBackend `isTeamLead` always returns false (users.ts:448). ✓
- `rateLimit` default `windowMs ?? 60_000` (rate-limit.ts:44); `SWEEP_EVERY = 200` (rate-limit.ts:15); `refillPerMs = opts.limit / windowMs` (rate-limit.ts:46). ✓ The "swap to Upstash" comment at rate-limit.ts:1-4. ✓
- AuthShell props: `hideBack` suppresses Back button (auth-shell.tsx:35), `footer` rendered under card (51-55); Back button `variant="ghost" size="sm"` calling `router.back()` (37-41); built from `@camp404/ui` Card/CardContent/Button; `className` prop unused by the gate. ✓
- `testStore.seedInviteCode` is a test fixture, only caller `/api/test/seed-invite/route.ts` (test-only). ✓
- Test-store usable predicate: `revokedAt` truthy→null, `expiresAt && expiresAt <= new Date()`→null, `maxUses !== null && useCount >= maxUses`→null (test-store.ts:339-346). Doc's boundary-asymmetry note (SQL `> now` alive at `=== now`; test `<= now` dead at `=== now`) is correct. ✓
- Home gate (`app/page.tsx`): `!hasCampAccess` → `redirect("/signup/required")` at page.tsx:40-42; `nextGate` then `getBurnerProfile` → `/onboarding/questionnaire`; `!isApproved` → `redirect("/pending-approval")` at 61-63. `/pending-approval/page.tsx` exists. ✓
- `/auth/[path]/page.tsx` is the Neon Auth catch-all; sign-out falls through its default branch (catch-all comment at line 40). ✓ Out-of-scope claim correct.

## Low-confidence / could-not-verify
- The doc says the env branch "never consumes (env codes are unlimited bootstrap codes)" and that a code that is both an env code and a DB row resolves via env (no consume). The code confirms env-first ordering (access-control.ts:48-50), but whether a dual-existence code is an intended/real scenario is a design question, not verifiable from code.
- `seedBurnerProfileAction → ensureRequiredAction` real-DB behavior depends on `@camp404/db/activations` internals (not in the doc's Files-covered set); I confirmed the call site and E2E no-op but did not trace the activations DB layer.
- Whether the production DB `findUsableInviteCode` was *intended* to back a web surface (vs. only the admin CLI it currently serves) is a design-intent question; the doc's "for other surfaces" wording is defensible but imprecise.
- `auth.getSession()` / Neon Auth session shape (auth.ts:30-36) trusted as upstream-package behavior; not independently verified.
