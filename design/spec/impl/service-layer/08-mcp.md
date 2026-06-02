# MCP connect / OAuth / consent — service-layer plan

> Scope: the human-facing OAuth 2.1 PKCE leg of the MCP integration — the `/mcp/connect`
> bridge, the `GET/POST /api/mcp/oauth/authorize` consent screen, and the supporting
> OAuth/scope/access/consent logic that backs it. The token endpoint, DCR `/register`,
> well-known metadata, the `[transport]` MCP server, and the tool surface (unit 29) are
> adjacent and cited as cross-domain context, but the redesign delta here is almost
> entirely **presentation** of the consent screen + the 403 gate branches. **No schema
> change** (the `mcp_*` tables and `users.aiDataConsent` all exist).

---

## Consumers — which surfaces/organisms depend on this domain

| Consumer | Surface / spec | Dependency |
|---|---|---|
| `/mcp/connect` bridge page | `surfaces/17-mcp-connect.md` §"1. `/mcp/connect`" | Renders the three sign-in-bridge states (Loading / auto-forward / Sign-in CTA). Client component; depends on Better Auth `authClient` + `safeNext`. |
| `GET /api/mcp/oauth/authorize` consent screen | `surfaces/17-mcp-connect.md` §"2. `GET …/authorize`" | Renders Identity Row + Consent Card + Scope Row, OR the 403 Gate Card / `errorPage` branches. The redesign delta lives almost entirely here. |
| `POST /api/mcp/oauth/authorize` approve/deny | `surfaces/17-mcp-connect.md` §"POST approve/deny" | Re-runs gate, issues auth code, `htmlRedirect`s. |
| `POST /api/mcp/oauth/token` (unit 29) | not redesigned | Consumes `consumeAuthCode` / `issueAccessToken` / `rotateRefreshToken` from the codes this surface mints. |
| `POST /api/mcp/oauth/register` (DCR, unit 29) | not redesigned | Consumes `registerClient` / `isAllowedRedirectUri`. |
| `GET /api/mcp/[transport]` MCP server + 7 tool files (unit 29) | not redesigned | Consume `verifyMcpToken`, `getMcpScope`/`resolveMcpScope`, `canSeeIdDocuments`, `runTool`, `appendMcpAuditLog`. |
| Well-known metadata routes | not redesigned | Consume `getPublicOrigin`; advertise `scopes_supported: ["mcp:user"]`. |
| **NEW** in-app AI-data-consent control | `surfaces/17-mcp-connect.md` Open Q #6; `_analysis` aiDataConsent discoverability | A discoverable in-app toggle for `users.aiDataConsent` — currently only reachable via the `set_my_ai_consent` MCP tool. See Redesign delta. |

No reusable canvas organisms (TopChrome, SectionHeader, Card, GridTile, EmptyState, CaptainLock) are used today on these two surfaces — the consent screen is raw server HTML, the bridge is a bespoke `<Shell>` (surface §"Components used").

---

## Current state — modules + key exports today

### `packages/db/src/mcp.ts` (data-access; `@camp404/db/mcp`)
- `mcp.ts:McpScopeRows` (interface) — thin Drizzle-row shape for scope derivation.
- `mcp.ts:getMcpScopeRows(campUserId) → Promise<McpScopeRows | null>` — single-trip read of user row + team memberships + driver intent.
- `mcp.ts:appendMcpAuditLog(input) → Promise<void>` — best-effort insert into `mcp_audit_log`; swallows errors by design.
- `mcp.ts:touchAccessToken(tokenHash) → Promise<void>` — best-effort `last_used_at` bump on token + client.
- `mcp.ts:findActiveAccessToken(tokenHash) → row | null` — non-revoked, non-expired token lookup.
- `mcp.ts:Team` (type alias over `schema.teamEnum`).

### `packages/db/src/schema.ts` (existing tables/enums — no change)
- `schema.ts:mcpOauthClients` (table), `schema.ts:mcpAuthCodes`, `schema.ts:mcpAccessTokens`, `schema.ts:mcpAuditLog`.
- `schema.ts:mcpClientAuthMethodEnum` (`none|client_secret_basic|client_secret_post`), `schema.ts:mcpCodeChallengeMethodEnum` (`S256|plain`), `schema.ts:mcpAuditOutcomeEnum` (`success|error`).
- `schema.ts:users.aiDataConsent` (boolean, default false) + `users.aiDataConsentAt` (timestamp) — line 298–299.

### `apps/web/lib/mcp/*` (orchestration + pure helpers)
- `oauth.ts` — `DEFAULT_SCOPE` (`"mcp:user"`), `isAllowedScope(scope) → boolean`, `isAllowedRedirectUri(uri) → boolean`, `RegisterClientInput`/`RegisteredClient` (types), `registerClient(input)`, `findClient(clientId)`, `verifyClientSecret(presented, storedHash)`, `IssueAuthCodeInput`, `issueAuthCode(input) → Promise<string>`, `ConsumedAuthCode`, `consumeAuthCode(input)`, `IssuedTokens`, `issueAccessToken(input)`, `rotateRefreshToken(input)`, plus the `AUTH_CODE_TTL_SEC` (300) / `ACCESS_TOKEN_TTL_SEC` (86400) / `REFRESH_TOKEN_TTL_SEC` (2592000) constants. Imports `@camp404/db` directly (`createHttpDb`/`createPooledDb`) — **mixes pure helpers (`isAllowedScope`, `isAllowedRedirectUri`) with DB-bound writes** in one file.
- `access.ts` — **pure.** `McpAccessState`/`McpAccessDenial` (types), `mcpAccessError(state) → McpAccessDenial | null`. The first-fail gate ladder: `no_camp_access → onboarding_incomplete → pending_approval`. No imports.
- `scope.ts` — `McpScope` (type), `resolveMcpScope(rows) → McpScope` (**pure**), `getMcpScope(campUserId)` (DB-bound; wraps `getMcpScopeRows`), and 4 capability predicates `canReadTeamOps`/`canWriteTeam`/`canApproveCrossTeam`/`canAdmin` (**pure, currently test-only — no production callers**). Imports `@camp404/db/mcp`.
- `consent.ts` — **pure.** `canSeeIdDocuments(scope, subject) → boolean`, `redactIdDocuments(scope, row) → R` (the latter is **unwired in production** — `people.ts` gates directly on `canSeeIdDocuments`). Imports only the `McpScope` type.
- `tokens.ts` — **pure crypto.** `sha256`, `generateOpaqueToken`, `constantTimeEqual`, `verifyPkce`. Imports `node:crypto` only.
- `auth.ts` — `verifyMcpToken(req, bearerToken) → AuthInfo | undefined` (DB-bound bearer verifier), `getCampUserIdFromAuth(authInfo) → string | null` (pure). Imports `@camp404/db/mcp` + MCP SDK types.
- `origin.ts` — `getPublicOrigin(req?) → string`. Reads `process.env` + request headers (server-only env access).
- `tool-utils.ts` — `runTool`, `ToolError`, `deny`, `notFound`, `textContent`, `errorContent`, `truncateList`, `MAX_LIST_ROWS`/`MAX_DATE_RANGE_DAYS`. Wraps every tool with scope+audit. (unit 29 territory.)
- `server.ts` — `registerCampMcpTools(server)`; `tools/*.ts` — 7 tool registrars incl. `tools/identity.ts:registerIdentityTools` which owns `get_my_ai_consent` / `set_my_ai_consent` (the only writers of `users.aiDataConsent`).

### `apps/web/app/mcp/connect/page.tsx`
- Default export `MCPConnectPage` (Suspense boundary) → `MCPConnectInner` (reads `useSearchParams`, `authClient.useSession`, fires `window.location.replace(next)`), `Shell` (`max-w-md` centered), `safeNext(raw)` (open-redirect guard — `/`-prefixed only, rejects `//`).

### `apps/web/app/api/mcp/oauth/authorize/route.ts` (the consent surface)
- `AuthorizeQuery` (Zod), `parseParams`, `resolveClientOrError(params)`, `GET(req)`, `POST(req)`, and the **inline HTML helpers** `escapeHtml`, `consentHtml(opts)`, `htmlRedirect(target)`, `buildRedirectUrl`, `redirectError`, `errorPage(status, error, description)`. Imports `findUserByAuthId`/`getBurnerProfileByUserId` (`@camp404/db/burner-profile`), `getAuthenticatedUser` (`@/lib/auth`), `hasCampAccess`/`isApproved` (`@/lib/users`), `mcpAccessError` (`@/lib/mcp/access`), `DEFAULT_SCOPE`/`findClient`/`isAllowedScope`/`issueAuthCode` (`@/lib/mcp/oauth`).

### `apps/web/lib/users.ts`
- `users.ts:hasCampAccess(user, email) → boolean` (god email OR has invite code), `users.ts:isApproved(user, email) → boolean` (god email OR `approvalStatus === "approved"`). Pure-ish (call `isGodEmail`, which reads env).

### Tests today (`apps/web/lib/mcp/__tests__/`)
- `access.test.ts` — exercises `mcpAccessError` ladder.
- `scope.test.ts` — `resolveMcpScope` + the 4 capability predicates.
- `consent.test.ts` — `canSeeIdDocuments` + `redactIdDocuments`.
- `tokens.test.ts` — crypto helpers + `verifyPkce`.
- **No test exists** for `authorize/route.ts` (`consentHtml`/`errorPage`/gate ordering at the route level), the `/mcp/connect` page, `oauth.ts` DB functions, or `auth.ts`.

---

## Redesign delta — NEW / EXTEND vs REUSE

**Almost everything is REUSE.** The OAuth state machine, PKCE, token lifetimes, scope vocabulary, gate ladder, audit log, and `aiDataConsent` storage are all built and correct. The delta is presentation + two product gaps the spec flags.

| Item | Class | Detail |
|---|---|---|
| OAuth flow (codes/tokens/PKCE/clients) — `oauth.ts`, `tokens.ts`, `auth.ts`, token/register routes | **REUSE** | No behavioural change. Surface §"NEW schema": "None." |
| Gate ladder `mcpAccessError` | **REUSE** | Ordering `no_camp_access → onboarding_incomplete → pending_approval` already matches surface §"Global gate matrix". |
| Scope vocabulary `mcp:user` (`DEFAULT_SCOPE`, `ALLOWED_SCOPES`, well-known) | **REUSE** | Surface §"Scope vocabulary": single coarse scope; no per-tool granularity at this stage. |
| Audit log (`appendMcpAuditLog`, `mcp_audit_log`) | **REUSE** | Written at tool invocation (unit 29), not by the consent screen. Surface §"Tables written" confirms only `mcp_auth_codes` is written here. |
| `/mcp/connect` bridge logic (session detect, `safeNext`, hard nav) | **REUSE** | Logic correct. Presentation gets the redesign treatment (see below). |
| **Consent screen HTML** (`consentHtml` in `authorize/route.ts`) | **EXTEND** | Surface §"Layout & modules.2" wants the Identity Row (avatar + "Signed in as …"), the Requesting Row, the styled Scope Row (icon wrap + mono `mcp:user` + "Read your basic profile"), and the Approve/Outline-Deny buttons. Current HTML is a plain `<h1>`/`<p>`/`.scope` block — needs the card layout. **Stays raw server HTML** (out-of-shell), so this is a string-template rewrite, not a React component. |
| **403 Gate Card** (pending-approval variant) | **EXTEND/NEW** | Surface §"403 Gate Card" wants a styled Lock-Wrap card for the `pending_approval` branch. Today `mcpAccessError` returns the message and the route renders it via the generic `errorPage(403, …)`. Need a distinct gate-card renderer for `pending_approval` (and decide the same for the other two 403 branches — Open Q #1). |
| **403 branch palette** (`no_camp_account`/`no_camp_access`/`onboarding_incomplete`) | **EXTEND** (decision-gated) | Surface §"Open questions #1" + Divergences: currently raw `errorPage` HTML with the neutral hex palette. Decide: keep raw error HTML, or style them to match. Recommend a single shared styled-error renderer reused across all 403/4xx branches. |
| **Consent-HTML token-palette divergence** | **EXTEND** (low priority) | Consent/error/redirect HTML hard-code neutral hex (`#0a0a0a`/`#fafafa`/`#171717`/`#262626`) — NOT the app's OKLCH brand tokens. `design-tokens.md` §1 expects `mcp:user` as mono-13/600, the scope-icon wrap as `accent/15%` (`#00dcff26` → `accent`), the Google "G" as `#4285F4`, and the magenta icon circle as `primary/18%` (`#ff008c2e`). Reconciliation: emit a small **inline `:root` CSS-variable block** with the resolved OKLCH values (the raw API HTML can't read the Tailwind `@theme`). Documented as a known aesthetic divergence; no behaviour change. |
| **`rejected` vs `pending` message collapse** | **EXTEND** (decision-gated) | Surface §"Open questions #2": both statuses surface "A captain still needs to approve…". Optionally add a distinct `rejected` branch to `mcpAccessError` ("Your access request was declined."). |
| **`aiDataConsent` discoverability** | **NEW** (cross-domain, decision-gated) | Surface §"Open questions #6": the flag is only set/read via the `set_my_ai_consent`/`get_my_ai_consent` MCP tools — a first-time user has no in-app way to opt in before connecting. Spec wants a discoverable in-app control. The **storage already exists**; this is a new app-layer surface (settings/profile toggle) + a reusable read/write helper. Owned cross-domain (profile/settings surface), called out here because the data + tool semantics live in this domain. |
| `redactIdDocuments` (unwired) | **DELETE or WIRE** (decision-gated) | Surface §"Open questions #3": no production caller. Either remove (test-only) or wire into `people.ts`. |
| 4 capability predicates `canReadTeamOps`/`canWriteTeam`/`canApproveCrossTeam`/`canAdmin` | **DELETE or KEEP** (decision-gated) | Surface §"Open questions #4": test-only/orphaned. Confirm future tool-surface plans (unit 29) before removing. |
| Footnote link `/auth/sign-in` | **EXTEND** (decision-gated) | Surface §"Open questions #7": confirm sign-in vs sign-up vs unified destination. |

---

## Schema & types

### Schema changes
**None.** Surface §"NEW schema": "None. All tables and enums are existing." The only schema change in the entire redesign is the captain-promotion table (roster domain, `db-impact.json`) — not this domain. No Drizzle migration steps.

### `packages/types` additions (optional consolidation)
Today the OAuth request/response shapes are Zod schemas defined **inline** in each route (`AuthorizeQuery` in `authorize/route.ts`, `RegisterRequest` in `register/route.ts`, `AuthCodeBody`/`RefreshBody` in `token/route.ts`), and the domain types (`McpScope`, `McpAccessState`, `McpScopeRows`, `IssuedTokens`, etc.) live next to their logic. `packages/types/src` has **no MCP file today** (only `announcement.ts` matched the grep).

- **OPTIONAL — NEW** `packages/types/src/mcp.ts`: lift `AuthorizeQuery` (and the literal `DEFAULT_SCOPE`/`ALLOWED_SCOPES`, the `code_challenge_method` enum) into a shared Zod module so the consent screen, the token route, and any test harness validate against one source. Low priority — the schemas are small, single-consumer, and route-local today. Only do this if a second consumer (e.g. a typed test harness) materialises. **Do not** force it: per the hybrid rule, leave request-shape Zod where it is unless sharing demands the move.
- `McpScopeRows`/`Team` already live in `packages/db/src/mcp.ts` (Drizzle-row-shaped, by deliberate design — comment lines 7–13). Keep there.

---

## Target API — function/module surface after this work

Legend: **REUSE** unchanged · **EXTEND** modified · **NEW** to build · **DELETE** remove.

### `packages/db` (schema + data-access) — all REUSE
- `getMcpScopeRows(campUserId) → Promise<McpScopeRows | null>` — **REUSE**.
- `appendMcpAuditLog(input) → Promise<void>` — **REUSE**.
- `touchAccessToken(tokenHash) → Promise<void>` — **REUSE**.
- `findActiveAccessToken(tokenHash) → row | null` — **REUSE**.
- `mcpOauthClients` / `mcpAuthCodes` / `mcpAccessTokens` / `mcpAuditLog` tables + the 3 enums — **REUSE**.

### `packages/types` — optional
- `packages/types/src/mcp.ts` exporting `AuthorizeQuery` + scope constants — **NEW (optional, deferred)**.

### `packages/core` [NEW package, pure, framework-agnostic]
Move the pure, no-`next`/no-DB logic here so it is unit-testable without jsdom or a route harness.
- `core/mcp/access.ts` → `mcpAccessError(state) → McpAccessDenial | null` + `McpAccessState`/`McpAccessDenial` — **EXTEND** (move from `apps/web/lib/mcp/access.ts`; optionally add a `rejected` branch — Open Q #2).
- `core/mcp/scope.ts` → `resolveMcpScope(rows) → McpScope` + `McpScope` type — **EXTEND** (move the pure resolver; `getMcpScope` stays app-side, see Hybrid). The 4 capability predicates → move with it **only if kept** (Open Q #4), else **DELETE**.
- `core/mcp/consent.ts` → `canSeeIdDocuments(scope, subject) → boolean` — **EXTEND** (move; pure). `redactIdDocuments` → **DELETE** unless wired (Open Q #3).
- `core/mcp/tokens.ts` → `sha256` / `generateOpaqueToken` / `constantTimeEqual` / `verifyPkce` — **EXTEND** (move; depends only on `node:crypto`, fine in a pure package targeting Node).
- `core/mcp/scopes.ts` → `DEFAULT_SCOPE` const + `isAllowedScope(scope) → boolean` + `isAllowedRedirectUri(uri) → boolean` — **EXTEND** (extract the **pure** parts of today's `oauth.ts`; the DB writers stay in app, see Hybrid).
- `core/mcp/consent-view.ts` → `buildConsentModel(input) → ConsentViewModel` and `buildGateModel(denial) → GateViewModel` — **NEW.** Pure functions that compute the displayName fallback chain (`displayName ?? primaryEmail ?? "You"`), the scope label/description, the requesting-client name, and which 403 variant to show — so the route's HTML template is a thin render over a tested model and the gate-branch selection is unit-tested without a route. (The HTML string assembly itself stays in the route — it touches `NextResponse`.)

### `apps/web/lib` [Next-coupled / server-only] — stays in app
- `lib/mcp/oauth.ts` (DB writers only after the pure extraction): `registerClient`, `findClient`, `verifyClientSecret`, `issueAuthCode`, `consumeAuthCode`, `issueAccessToken`, `rotateRefreshToken` + TTL constants — **EXTEND** (file shrinks; pure scope/redirect helpers leave for `packages/core`). Imports `@camp404/db`.
- `lib/mcp/scope.ts` → `getMcpScope(campUserId)` — **EXTEND** (thin wrapper kept here; re-exports `resolveMcpScope`/`McpScope` from `packages/core`). DB-bound.
- `lib/mcp/auth.ts` → `verifyMcpToken`, `getCampUserIdFromAuth` — **REUSE** (DB + SDK types; stays).
- `lib/mcp/origin.ts` → `getPublicOrigin` — **REUSE** (reads `process.env`/headers; server-only).
- `lib/mcp/tool-utils.ts`, `lib/mcp/server.ts`, `lib/mcp/tools/*` — **REUSE** (unit 29).
- **NEW** `lib/mcp/consent-html.ts` (or kept inline in the route): `consentHtml(model)`, `gateCardHtml(model)`, `errorPageHtml(status, error, description)`, `htmlRedirect(target)`, plus the shared inline-OKLCH `:root` block — **EXTEND/NEW.** Builds the redesigned Identity/Consent/Scope card markup + the styled 403 Gate Card from the pure view-models above. Returns `NextResponse`, so it stays in app.

### `apps/web/app` [routes] — stays in app
- `app/api/mcp/oauth/authorize/route.ts` — `GET`/`POST` — **EXTEND** (swaps `consentHtml`/`errorPage` internals for the redesigned renderers; gate-branch selection delegated to the pure `buildGateModel`).
- `app/mcp/connect/page.tsx` — `MCPConnectPage`/`MCPConnectInner`/`Shell`/`safeNext` — **EXTEND** (presentation per surface §1: Bridge Card, Google button styling, Error Region, footnote; logic unchanged).
- `app/api/mcp/oauth/token/route.ts`, `…/register/route.ts`, `…/well-known/*`, `…/[transport]/route.ts` — **REUSE**.
- **NEW (cross-domain)** in-app `aiDataConsent` toggle surface + a `get/setAiDataConsent` app helper reusing `users` data-access — owned by the profile/settings domain (Open Q #6).

---

## Hybrid extraction — what moves to packages vs stays in app

Per the LOCKED hybrid rule: extract framework-agnostic business logic + validation to packages; leave Next-coupled bits (server actions, auth/session, route handlers, `next/*` imports, `server-only`) in `apps/web`.

### MOVE to `packages/core` (pure — no `next/*`, no DB, no `process.env`, no `server-only`)
| Symbol | From | To | Why |
|---|---|---|---|
| `mcpAccessError`, `McpAccessState`, `McpAccessDenial` | `lib/mcp/access.ts` | `core/mcp/access.ts` | Pure function over booleans; zero imports today. Already unit-tested in isolation. |
| `resolveMcpScope`, `McpScope` | `lib/mcp/scope.ts` | `core/mcp/scope.ts` | Pure derivation; comment explicitly says it lives separately from the DB call so it's testable "without a real Postgres". |
| `canSeeIdDocuments` | `lib/mcp/consent.ts` | `core/mcp/consent.ts` | Pure predicate over `McpScope` + subject. |
| `sha256`, `generateOpaqueToken`, `constantTimeEqual`, `verifyPkce` | `lib/mcp/tokens.ts` | `core/mcp/tokens.ts` | Pure crypto, `node:crypto` only. |
| `DEFAULT_SCOPE`, `isAllowedScope`, `isAllowedRedirectUri` | `lib/mcp/oauth.ts` | `core/mcp/scopes.ts` | Pure string/URL validation; currently co-located with DB writers — split them out. |
| `getCampUserIdFromAuth` | `lib/mcp/auth.ts` | `core/mcp/auth.ts` (or keep) | Pure `AuthInfo.extra` reader. Borderline (depends on the MCP SDK `AuthInfo` type only) — move only if `packages/core` may take the SDK type dep; otherwise leave. |
| **NEW** `buildConsentModel`, `buildGateModel` | (new) | `core/mcp/consent-view.ts` | Pure view-model computation (displayName fallback, scope copy, 403 variant selection) so the redesigned consent screen is testable without a route harness. |

### STAY in `apps/web/lib` (Next-coupled / server-only / DB-bound)
| Symbol | File | Why it stays |
|---|---|---|
| `registerClient`, `findClient`, `verifyClientSecret`, `issueAuthCode`, `consumeAuthCode`, `issueAccessToken`, `rotateRefreshToken` + TTLs | `lib/mcp/oauth.ts` | All call `createHttpDb`/`createPooledDb` (DB I/O, transactions). `verifyClientSecret` is pure but is glue beside the DB writers — moving one symbol fragments the module; keep with its callers. |
| `getMcpScope` | `lib/mcp/scope.ts` | Calls `getMcpScopeRows` (DB). Thin wrapper; re-exports the pure `resolveMcpScope`. |
| `verifyMcpToken` | `lib/mcp/auth.ts` | DB lookup (`findActiveAccessToken`) + side-effecting `touchAccessToken`. |
| `getPublicOrigin` | `lib/mcp/origin.ts` | Reads `process.env` + request headers — environment/server concern. |
| `consentHtml`/`gateCardHtml`/`errorPageHtml`/`htmlRedirect`, `runTool`, tool registrars | `lib/mcp/*`, route | Return `NextResponse` / register on the MCP server / wrap with audit + `next` types. |
| `GET`/`POST` authorize, token, register, well-known, `[transport]` | `app/api/mcp/**` | Route handlers — import `next/server`, `getAuthenticatedUser` (session), `formData()`. |
| `MCPConnectPage` etc. | `app/mcp/connect/page.tsx` | `"use client"` + `next/navigation` + Better Auth client. |

**Net:** the move is small and surgical — five pure helper clusters plus the new view-model. The OAuth state machine and consent rendering stay app-side because they are DB- and `NextResponse`-bound. This matches the existing code's own seam (the in-file comments at `scope.ts:30-35` and `access.ts:1-6` already declare these functions "pure so the route owns the lookups").

---

## Build steps (ordered)

1. **Scaffold `packages/core` + move pure helpers.** Create `core/mcp/{access,scope,consent,tokens,scopes}.ts` and move the symbols listed under "MOVE" verbatim. Update imports in `lib/mcp/scope.ts` (re-export `resolveMcpScope`/`McpScope`), `lib/mcp/oauth.ts` (import `DEFAULT_SCOPE`/`isAllowedScope`/`isAllowedRedirectUri` from core), `tool-utils.ts`/`tools/*`/`people.ts` (import `canSeeIdDocuments`/`McpScope` from core), `authorize/route.ts` + `token/route.ts` + `register/route.ts` (import the moved helpers from core). Relocate the existing tests (`access.test.ts`, `scope.test.ts`, `consent.test.ts`, `tokens.test.ts`) to `packages/core` and fix `@camp404/db/mcp` type imports (`McpScopeRows`/`Team` still come from db). **Acceptance:** all four moved test files pass unchanged in their new home; `tsc` + `lint` green across `apps/web` and `packages/core`; no `next/*`, no `@camp404/db` import in `packages/core`. **Test:** existing vitest suites (re-run in new location).
2. **Decision pass (block before presentation work).** Resolve Open Qs #1 (style the 3 extra 403 branches or keep raw error HTML), #2 (`rejected` distinct message), #3 (`redactIdDocuments` delete vs wire), #4 (4 predicates delete vs keep), #6 (`aiDataConsent` in-app placement), #7 (footnote destination). **Acceptance:** each Open Q has a recorded yes/no; decisions appended to `_analysis/decisions.md`. **Test:** n/a (planning gate).
3. **Add pure view-models.** Build `core/mcp/consent-view.ts` (`buildConsentModel`, `buildGateModel`) — computes displayName fallback, scope label/description ("Read your basic profile"), requesting-client name, and 403 variant. **Acceptance:** new unit test covers displayName fallback chain (`displayName → primaryEmail → "You"`), scope copy, and every gate variant including the #2 `rejected` decision. **Test:** new `packages/core` vitest.
4. **Redesign the consent HTML.** Implement `consentHtml(model)` per surface §"Layout & modules.2": Consent Card (`$card`/`$border`/radius/pad 20/gap 16) with Identity Row (avatar circle `primary/18%` + user icon, "Signed in as {displayName}"), Requesting Row, Scope Row (`accent/15%` icon wrap + shield, mono `mcp:user` + "Read your basic profile"), Approve (primary) / Deny (outline) buttons inside the existing `<form method="POST">` with all OAuth params as hidden inputs. Add the inline `:root` OKLCH block (Open Q #5). Keep `escapeHtml` on every interpolation. **Acceptance:** rendered HTML contains the Identity/Requesting/Scope rows + both buttons + all 7 hidden OAuth inputs; XSS strings in `clientName`/`displayName` are escaped; no behavioural change to approve/deny POST. **Test:** route-level test (NEW — none exists today) asserting `GET` HTML structure + escaping; reuse the access/scope mocks.
5. **Styled 403 Gate Card + error branches.** Implement `gateCardHtml(model)` for `pending_approval` (Lock-Wrap circle + message per surface §"403 Gate Card") and, per the #1 decision, either route the other 403/401 branches through a shared `errorPageHtml` styled renderer or leave them raw. Wire `authorize/route.ts` `GET`/`POST` to call `buildGateModel(denied)` → `gateCardHtml`/`errorPageHtml`. **Acceptance:** `pending_approval` renders the Lock card; the other gate states render per decision; gate ordering still `no_camp_access → onboarding_incomplete → pending_approval`; god-email bypass intact (`hasCampAccess`/`isApproved` short-circuit). **Test:** route test driving each gate state via mocked `hasCampAccess`/`profileComplete`/`isApproved`.
6. **Redesign the `/mcp/connect` bridge.** Apply surface §1: Bridge Card (`$card`/`$border`/radius/pad 20/gap 16), Google Button (outlined, full-width, "G" badge `#4285F4`), Error Region (`destructive`, conditional), footnote with the #7-decided destination. Keep `safeNext`, the session effect, and `window.location.replace(next)` unchanged. **Acceptance:** three presentations (loading/auto-forward/CTA) render; Google button fires `authClient.signIn.social`; `safeNext` still rejects `//` and absolute URLs; error region appears on sign-in error. **Test:** component test for `safeNext` + render states (logic is already pure-ish; `safeNext` deserves a dedicated unit test it lacks today).
7. **(If #6 = yes) Add in-app `aiDataConsent` control.** Cross-domain: a settings/profile toggle reading/writing `users.aiDataConsent` + `aiDataConsentAt`, reusing the same write semantics as `tools/identity.ts:set_my_ai_consent` (set timestamp on enable, clear on disable). Add a thin app helper `getAiDataConsent`/`setAiDataConsent` so the tool and the UI share one writer. **Acceptance:** member can toggle consent in-app without Claude; flag round-trips; `aiDataConsentAt` set/cleared correctly. **Test:** data-access/unit test for the shared writer; coordinate placement with the profile/settings surface owner.
8. **(If #3/#4 = delete) Remove dead code.** Drop `redactIdDocuments` and/or the 4 capability predicates + their tests if the decision is "remove". **Acceptance:** no dangling exports; suites green. **Test:** delete-only; re-run vitest.

---

## Cross-domain dependencies

- **Auth/session (`apps/web/lib/auth`, `neon-auth`, Better Auth):** `getAuthenticatedUser()` (consent gate) and `authClient.signIn.social`/`useSession` (bridge). Owned by the auth domain — REUSE; this surface is a consumer.
- **Users / access-control (`apps/web/lib/users.ts`):** `hasCampAccess` / `isApproved` (+ `isGodEmail` god-email bypass). REUSE. Any change to god-email or approval semantics flows through here.
- **Burner profile (`@camp404/db/burner-profile`):** `findUserByAuthId` + `getBurnerProfileByUserId` (the `profileComplete = !!completedAt` gate). REUSE. Onboarding domain.
- **Roster / captain promotion (db-impact.json):** the only schema change in the redesign lives there, **not here** — but a member's `approvalStatus` (set by captains during roster review) is read by this surface's `isApproved` gate. Consume read-only.
- **Profile / settings surface (NEW, Open Q #6):** owns the new in-app `aiDataConsent` toggle. This domain provides the data semantics + tool parity; the surface placement is theirs.
- **MCP tool surface (unit 29 — `tools/*`, `tool-utils.ts`, token/register/well-known/`[transport]` routes):** downstream consumers of everything this surface mints (auth codes → tokens → `verifyMcpToken` → `getMcpScope` → `runTool`). Not redesigned, but they import the same `packages/core` helpers post-extraction, so the move in step 1 must keep their import paths green.
- **Design tokens (`design-tokens.md`):** the consent/bridge palette reconciliation depends on the OKLCH token values + the documented raw-hex → token mappings (`#ff008c2e → primary/18%`, `#00dcff26 → accent/15%`, `#4285F4` Google brand, `mcp:user` mono-13/600).

WROTE design/spec/impl/service-layer/08-mcp.md
