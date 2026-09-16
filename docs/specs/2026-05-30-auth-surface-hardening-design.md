# Sub-project B — Auth-surface hardening (design + plan)

**Date:** 2026-05-30
**Status:** Proposed
**Program:** Camp 404 audit remediation, sub-project **B** (independent of A). Security remediation of four audit findings — no product decisions, so design + plan are combined.

## Problems (from the audit)

1. **MCP `authorize` issues a full token to vetting-pending / onboarding-incomplete members.** Both GET and POST in `app/api/mcp/oauth/authorize/route.ts` only check that a camp row *exists* (`findUserByAuthId`), skipping the app's own `hasCampAccess` + burner-profile-complete + `isApproved` gates. A pending member gets a 24h access + 30d refresh token.
2. **`notifications/pending` + `acknowledge` 500 on a real DB.** They call `ensureCampUser` (which returns a synthetic row with `id: ""` for users without a camp row) and then query with that empty id — invalid-uuid → 500.
3. **Cron auth fails open and is not constant-time.** All four `/api/cron/*` routes use `auth !== \`Bearer ${process.env.CRON_SECRET}\``. If `CRON_SECRET` is unset, the literal `Bearer undefined` is accepted; the compare is also non-constant-time.
4. **No rate limiting on the invite/auth boundary.** Invite redemption (`submitInviteCode`), the `invite/check` enumeration oracle, and the unauthenticated MCP `register` / `token` endpoints are all unthrottled.

## Fixes

### B1 — MCP authorize full gate
Extract a pure helper `mcpAccessError(user, email, profileComplete) → { error, description } | null` (in `lib/mcp/access.ts`). In both GET and POST, after loading `campUser`, also load burner-profile completeness and call the helper; on a non-null result render the existing `errorPage(403, …)`. Reuses `hasCampAccess` / `isApproved` from `lib/users` and `getBurnerProfileByUserId` from `@camp404/db/burner-profile`. Unit-test the pure helper.

### B2 — Notifications route gating
In `notifications/pending`: after `ensureCampUser`, if `!hasCampAccess(campUser, user.primaryEmail)` return `{ pending: [] }` (consistent with the existing "unauthenticated → empty" contract). In `acknowledge`: if `!hasCampAccess(...)` return `{ ok: false }`. Never query with an empty id.

### B3 — Cron auth helper
New `lib/cron-auth.ts`:
- pure `isAuthorizedCron(authHeader: string | null, secret: string | undefined): boolean` — returns `false` if `secret` is unset/empty (fail closed), else a `crypto.timingSafeEqual` compare of the `Bearer <secret>` string (length-guarded).
- `assertCron(req): NextResponse | null` — `null` when authorized, else a `401`.
Apply `assertCron` in all four cron routes (`recipes/analyse`, `manuals/generate`, `notifications/reminders`, `telegram/dispatch`). Unit-test `isAuthorizedCron` (unset secret → false; wrong → false; right → true).

### B4 — Rate limiting
Use the existing `rateLimit` + `getClientIp` (precedent: avatar + voice routes):
- `submitInviteCode` (server action): limit per camp-user id, e.g. 10 / 10 min; on exceed return `{ ok: false, error: "Too many attempts. Wait a minute and try again." }`.
- `invite/check` route: limit per user id (e.g. 30 / min) → `429`.
- MCP `register` + `token` routes: limit per client IP (e.g. 20 / min) → `429` with `Retry-After`.

**Deferred (noted, not done here):** rate-limiting the Neon Auth sign-in/up handler lives inside the vendor `/api/auth/*` handler and would need proxy/middleware interception — out of scope for B. Replacing operator-set guessable `INVITE_CODES` bootstrap values is an env/ops action; documented in `.env.example`, mitigated in-code by B4's redemption throttle. The in-memory limiter remains best-effort per instance (documented in `rate-limit.ts`).

## Files

| File | Action |
|---|---|
| `apps/web/lib/mcp/access.ts` | Create — `mcpAccessError` pure helper |
| `apps/web/lib/cron-auth.ts` | Create — `isAuthorizedCron` + `assertCron` |
| `apps/web/app/api/mcp/oauth/authorize/route.ts` | Gate GET + POST |
| `apps/web/app/api/notifications/pending/route.ts` | hasCampAccess guard |
| `apps/web/app/api/notifications/acknowledge/route.ts` | hasCampAccess guard |
| `apps/web/app/api/cron/{recipes/analyse,manuals/generate,notifications/reminders,telegram/dispatch}/route.ts` | Use `assertCron` |
| `apps/web/app/signup/required/actions.ts` | Throttle `submitInviteCode` |
| `apps/web/app/api/tools/invite/check/route.ts` | Throttle |
| `apps/web/app/api/mcp/oauth/{register,token}/route.ts` | Throttle by IP |
| `apps/web/lib/__tests__/cron-auth.test.ts`, `mcp-access.test.ts` | Create — unit tests |

## Task order (TDD, frequent commits)

1. `cron-auth.ts` + test → wire all 4 cron routes.
2. `mcp/access.ts` + test → gate authorize GET + POST.
3. notifications pending + acknowledge guards.
4. rate-limit invite redemption + invite/check + MCP register/token.
5. `.env.example` note on high-entropy bootstrap codes.
6. Full gate green → PR.

## Verification
`pnpm turbo run lint typecheck test build` green. Unit tests cover the two new pure helpers.
