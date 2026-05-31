# Verification — 23 auth-session-gating

**Verdict:** accurate  ·  checked 78 claims, verified 76.
The doc is an exceptionally faithful map of the auth/gating spine: every file:line citation I checked resolved correctly, enum lists and table schemas are digit-exact, the gate ordering in `app/page.tsx` matches, and dead/transitional branches (legacy `completedAt` fallback, unmapped `ACTION_ROUTES` keys, `opt_in` TODO) are flagged exactly as source comments mark them. The only soft spots are two claims about upstream Neon Auth package internals (the ≥32-char secret throw) that can't be confirmed from this repo's code; no high- or medium-severity inaccuracies were found.

## Inaccuracies
| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | `redeemInviteForUser` FIRST-TIME branch cited as "users.ts:144-151" | Row creation spans 144-150 and the `return { ok: true }` is at 152; the cited range stops one line short of the return. Cosmetic line-range drift, all described behavior present. | apps/web/lib/users.ts:144-152 |
| low | test-store globalThis singleton cited "test-store.ts:97-126" | The explanatory comment is 97-105 and `globalState()` is 108-126; line 97 is the start of the comment, not the singleton itself. The behavior (state hung off `globalThis.__camp404TestStore__`, `GLOBAL_KEY` at :106) is accurate. | apps/web/lib/test-store.ts:106-126 |

## Omissions
| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | `seedBurnerProfileAction`/`satisfyBurnerProfileAction`/`getPendingRequiredActions` call `ensureRequiredAction`/`dbSatisfy.../dbGet...` which internally use `createHttpDb()` (HTTP driver) — `openActivation` is the only producer using `createPooledDb()` for its transaction. Doc covers `openActivation`'s pooled transaction but doesn't note the single-row helpers are non-transactional HTTP. Not gating-relevant; minor. | packages/db/src/activations.ts:146,172,206 vs :88 |
| low | `findCampUserByAuthId` has a second live consumer beyond the avatar proxy — `app/feedback/actions.ts:94`. Doc only names the avatar proxy ("e.g."), so not wrong, just incomplete. | apps/web/app/feedback/actions.ts:94 |

## Spot-confirmed
- `AuthenticatedUser = { id: string; primaryEmail: string | null; displayName: string | null }` — auth.ts:13-17 ✓
- `getAuthenticatedUser` E2E cookie-wins-first then `auth.getSession()`, maps `id/email??null/name??null` — auth.ts:25-37 ✓
- `getAuthenticatedUserOrRedirect` → `redirect("/auth/sign-in")` — auth.ts:40-44 ✓
- `readTestUserCookie`: `JSON.parse(decodeURIComponent(raw))`, requires non-empty string `id`, defaults email/name to null, parse-error→null — auth.ts:46-61 ✓
- `authClient = createAuthClient()` — auth-client.ts:14 ✓
- `createNeonAuth({ baseUrl, cookies: { secret, sameSite: "lax" }})`; `PLACEHOLDER_BASE_URL="https://build-placeholder.neon-auth.invalid"`; placeholder secret is the 50-char `"build-placeholder-secret-build-placeholder-secret"`; `sameSite: "lax"` with the claude.ai→/api/mcp/oauth/authorize→/mcp/connect rationale — neon-auth.ts:21-35 ✓
- `export const { GET, POST } = auth.handler();` + the "verifier exchange runs in proxy.ts, not here" note — api/auth/[...path]/route.ts:1-8 ✓
- `auth.middleware({ loginUrl: "/auth/sign-in" })`; `matcher: ["/auth", "/auth/:path*", "/mcp/:path*"]` — proxy.ts:10,18 ✓
- `CampUser` shape and `Rank`/`ApprovalStatus` type aliases — users.ts:32-33,39-47 ✓
- `ensureCampUser`: testBackend-if-E2E selection, return existing, god→real approved row `{displayName ?? primaryEmail, inviteCode:null, rank:"member", approvalStatus:"approved"}` + seed burner action, else synthetic `id:""` non-persisted row with `approvalStatus:"approved"` — users.ts:60-95 ✓
- `redeemInviteForUser`: trim→empty→"Please enter an invite code."; god-or-existing-inviteCode short-circuit `{ok:true}` without burning; claim-fail→"That invite code isn't valid."; existing row stamps code, conditionally re-ranks, tightens to `pending` only if not already pending; first-time creates `rank: assignedRank ?? "member"`, `approvalStatus: requiresApproval ? "pending" : "approved"` + seeds burner action — users.ts:111-153 ✓
- `findCampUserByAuthId` read-only lookup, live consumer = avatar proxy — users.ts:174-179; api/avatar/route.ts:31 ✓
- `toCampUser` defaults `profileImageUrl ?? null`, `approvalStatus ?? "approved"` — users.ts:462-480 ✓
- `hasCampAccess = isGodEmail(email) || !!user.inviteCode` — users.ts:219-224 ✓
- `isApproved = isGodEmail(email) || approvalStatus === "approved"` — users.ts:231-236 ✓
- `isTeamLead` delegates to backend; real→`dbIsTeamLead` (any membership with `is_lead=true`), test→always false — users.ts:244-247, 387-389, 448-450; roster.ts:204-217 ✓
- `isGodEmail` case-insensitive CSV membership of `GOD_EMAILS`, null/empty→false — access-control.ts:28-32 ✓
- `ClaimedInvite = { code, assignedRank: AssignedRank|null, requiresApproval }` — access-control.ts:10-15 ✓
- `claimInviteCode`: trim→empty→null; env code→`{code, assignedRank:null, requiresApproval:false}`; else `consumeDbCode`→null-on-fail, carries assignedRank+requiresApproval — access-control.ts:43-57 ✓
- `isEnvCode = csv(INVITE_CODES).includes(code)` — access-control.ts:59-61 ✓
- `consumeDbCode` → test `testStore.consumeInviteCode` else `dbConsumeInviteCode` — access-control.ts:63-68 ✓
- `consumeInviteCode` single atomic `UPDATE SET use_count = use_count + 1` guarded on `revokedAt IS NULL`, not-expired (`expires_at` null or `> now`), `max_uses` null or `> use_count`, `.returning()` — invite-codes.ts:57-81 ✓
- `ACTION_ROUTES = { burner_profile: "/onboarding/questionnaire" }`, dietary/driver comment — required-actions.ts:7-11 ✓
- `nextGate` skips non-blocking, returns first blocking action mapping to a built route, null otherwise — required-actions.ts:23-30 ✓
- `seedBurnerProfileAction` no-op under E2E, else `ensureRequiredAction({ userId, type:"questionnaire", actionKey:"burner_profile", title:"Complete your burner profile", version: QUESTIONNAIRE.version })` — users.ts:192-201 ✓
- `satisfyBurnerProfileAction` no-op under E2E, else `dbSatisfyRequiredAction(userId, "burner_profile", QUESTIONNAIRE.version)` — users.ts:204-209 ✓
- `getPendingRequiredActions` returns `[]` under E2E, else `dbGetPendingRequiredActions` — users.ts:212-217 ✓
- `openActivation`: `opt_in`→`{ok:false, error:"opt_in activations are not yet supported."}`; unknown scope→`Unsupported activation scope: <scope>.`; fan-out via `computeAudience`; `onConflictDoUpdate` re-points version/activation/title/blocking, resets `status:"pending"`, `completedAt:null` — activations.ts:36-131 ✓
- `PUSH_SCOPES = new Set(["everyone","team","team_leads","individual"])`; `drivers` broadcast-only comment — activations.ts:13-14 ✓
- `ensureRequiredAction` `onConflictDoNothing` on `(userId, actionKey)`, `version ?? null`, `blocking ?? true` — activations.ts:138-160 ✓
- `satisfyRequiredAction` only acts if row exists AND `status==="pending"`; version-aware skip via `meetsRequiredVersion`; else sets `status:"completed"`, `completedAt: new Date()` — activations.ts:167-200 ✓
- `getPendingRequiredActions` selects `status="pending"`, `blocking=true`, `orderBy(asc(createdAt))` — activations.ts:203-226 ✓
- Home spine order: `getAuthenticatedUser`→`<LandingHero/>` if null (no redirect); `ensureCampUser`+`hasCampAccess`→`/signup/required`; `nextGate(getPendingRequiredActions)`→gate; legacy `getBurnerProfile`+`!completedAt`→`/onboarding/questionnaire` (marked drop-once-confirmed); `!isApproved`→`/pending-approval`; viewerRank `captain` / `isTeamLead`→`team_lead` / `camp_member` — app/page.tsx:29-78 ✓
- Auth `[path]` routing: `sign-up`→`<SignUpForm/>`, `sign-in`→`<SignInForm/>` (Suspense), else `<AuthView path={path}/>` — auth/[path]/page.tsx:19-47 ✓
- `/auth` landing forwards authed→`/`, unauthed→`/auth/sign-in` — auth/page.tsx:20-24 ✓
- Invite gate form: `name="code"`, autoComplete/spellCheck/autoCapitalize/autoCorrect off, `required`; "Enter camp"→"Checking…" while `isPending`; `role="alert"` inline error; `/auth/sign-out` link — invite-gate-form.tsx:40-67 ✓
- `submitInviteCode`: rate-limit `invite-redeem:${id}` limit 10 / 10*60_000ms, claim, `redirect("/")` on success — signup/required/actions.ts:25-42 ✓
- Pending-approval page: self-guards (`!hasCampAccess`→/signup/required at :32-34, `isApproved`→/ at :36-38, `!completedAt`→/onboarding at :42-44); amber `Clock` + "Application submitted" + display-name greeting; destructive `ShieldX` + "Application not approved" terminal copy; `/auth/sign-out` at :87 — pending-approval/page.tsx:27-92 ✓
- `saveBurnerProfile`: re-checks `hasCampAccess`→/signup/required; `validateResponses` on final; splits/encrypts ID; `satisfyBurnerProfileAction` on final; `_form` retry error on throw; `redirect("/")` on final — onboarding/questionnaire/actions.ts:30-98 ✓
- E2E routes present & 404-gated: login (POST set / DELETE clear cookie `httpOnly:true`, `secure:NODE_ENV==="production"`, `sameSite:"lax"`, `path:"/"`, `maxAge:60*60`), reset, set-approval, set-rank, complete-onboarding (`version:"e2e-test"`, `responses:{}`, `markComplete:true`), seed-invite, inspect — all return `404 {error:"Not found"}` when not E2E — api/test/*/route.ts ✓
- `decideUserApproval({ userId, status:"approved"|"rejected", decidedByUserId })`; real `setUserApproval` stamps `approvalDecidedByUserId` + `approvalDecidedAt: new Date()` — users.ts:253-260; burner-profile.ts:69-84 ✓
- All enums digit-exact: `rankEnum=["captain","member"]` (schema.ts:31), `approvalStatusEnum=["pending","approved","rejected"]` (41-45), `requiredActionTypeEnum=["questionnaire","acknowledgement","payment","profile_update"]` (99-104), `requiredActionStatusEnum=["pending","completed","waived","expired"]` (106-111), `questionnaireScopeEnum=["everyone","team","team_leads","individual","opt_in"]` (114-120), `activationStatusEnum=["draft","open","closed"]` (122-126), `teamEnum` 8 members (51-60) ✓
- `QUESTIONNAIRE.version = "2026.05.29-v8"` — questionnaire.ts:60 ✓
- `meetsRequiredVersion`: regex `/^(.*)-v(\d+)$/`, integer compare on shared base else lexicographic — versions.ts:6,14-24 ✓
- `TEST_USER_COOKIE = "camp404_test_user"`; `isE2ETestMode()` = `E2E_TEST_MODE === "1"` — test-mode.ts:9,11-13 ✓
- `PGCRYPTO_KEY` ≥16 chars, AES-256-GCM (`ALGO="aes-256-gcm"`, `TAG_LEN=16`), throws if missing/short — crypto.ts:26,28,35-38 ✓
- Schema tables: `users` (220-303: authUserId NOT NULL UNIQUE, rank default "member", isSystem default false, inviteCode nullable, approvalStatus default "approved", approvalDecidedByUserId set-null FK, approvalDecidedAt, sanitised default false); `invite_codes` (312-342: code PK, maxUses nullable, useCount default 0, requiresApproval default false, invitedEmail lowercased on insert); `required_actions` (570-609: blocking default true, status default "pending", UNIQUE `(user_id, action_key)`, index `(user_id, status)`); `team_memberships` (446-462: PK `(userId, team)`, isLead default false); `questionnaire_activations` (472-502, blocking default true, status default "draft"); `questionnaire_activation_targets` PK `(activation_id, user_id)` (505-518); `burner_profiles` (352-364: completedAt, version, responses, updatedAt) ✓
- All gate pages + home + `/auth` declare `export const dynamic = "force-dynamic"` — verified across all 6 files ✓
- `findUsableInviteCode` & `findInviteCodeByCode` exist (invite-codes.ts:26,119) and are NOT used by the gating claim path (which uses `consumeInviteCode`) ✓

## Low-confidence / could-not-verify
- "secret MUST be ≥32 chars or `createNeonAuth` throws on import" (doc:43, 192) — this is upstream `@neondatabase/auth` package behavior; the repo only carries the assertion in a neon-auth.ts:18 comment and a 50-char placeholder. The repo code does not itself enforce or test the 32-char threshold, so I cannot confirm the exact number from this codebase.
- The proxy `auth.middleware` verifier→cookie exchange and `auth.handler()` API surface (sign-in/up/session/OAuth) are upstream Neon Auth/Better Auth internals; the doc's description of what they proxy is plausible and matches the in-repo comments, but the actual exchange logic lives in the package, not this repo.
- "Re-opening an activation re-points the row and resets it to pending" relies on `openActivation`'s `onConflictDoUpdate` actually firing on the `(user_id, action_key)` unique index at runtime — the SQL is correct in source but its production reachability depends on a captain-facing activation UI outside this unit's files (not exercised here).
