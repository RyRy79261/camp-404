# 17 — MCP connect / consent screen

**Files covered:**
- `apps/web/app/mcp/connect/page.tsx` — client-side **sign-in bridge** page (`/mcp/connect`); signs the user in via Google then forwards to the OAuth `authorize` API route.
- `apps/web/app/api/mcp/oauth/authorize/route.ts` — server route that **renders the actual consent HTML** (GET) and **processes approve/deny** (POST). This is the user-facing scope grant/deny surface.
- `apps/web/lib/mcp/consent.ts` — capability gate for surfacing ID-document fields (`canSeeIdDocuments`, `redactIdDocuments`) — defines the consent semantics behind the `aiDataConsent` flag.
- `apps/web/lib/mcp/scope.ts` — `McpScope` snapshot + pure `resolveMcpScope` + per-domain capability predicates; defines what the granted token can do per call.
- `apps/web/lib/mcp/oauth.ts` — OAuth primitives this surface invokes: scope allow-list (`DEFAULT_SCOPE`, `isAllowedScope`), redirect-URI allow-list, client lookup, auth-code issuance/lifetimes.
- `apps/web/lib/mcp/access.ts` — `mcpAccessError`: pure gate mirroring the app's invite/onboarding/approval gates, applied before a token may be granted.
- `apps/web/lib/mcp/origin.ts` — resolves the public origin used to build the `next` redirect / issuer.
- `apps/web/lib/auth-client.ts` — Neon/Better Auth client (`authClient.useSession`, `authClient.signIn.social`) used by the bridge page.
- `packages/db/src/mcp.ts` — `getMcpScopeRows` (scope read), `McpScopeRows`, `Team`; audit/token housekeeping helpers (catalogued in unit 29, referenced here only for the scope read).
- `packages/db/src/schema.ts` — MCP OAuth tables + enums + `users.aiDataConsent` field this surface reads/writes.
- Well-known metadata routes (`oauth-authorization-server`, `oauth-protected-resource`) — advertise the single `mcp:user` scope to discovery clients (read-only context for the consent surface).

**Purpose:** This unit is the human-facing leg of the MCP OAuth flow: the screen(s) where a Camp 404 member, while connecting an MCP client (typically Claude.ai/Claude desktop), (1) signs in if no session exists, and (2) **explicitly approves or denies** the client's request to access their camp data through the MCP connector. Two physical surfaces compose it: a styled client React page at `/mcp/connect` that exists only to establish a Better Auth session and bounce back to the authorize endpoint, and the server-rendered consent HTML emitted by `GET /api/mcp/oauth/authorize`, which names the requesting client, the signed-in identity, and the single coarse scope (`mcp:user`), and offers Deny / Approve buttons. Approval issues a short-lived PKCE auth code; denial redirects back with `error=access_denied`. The supporting `consent.ts` / `scope.ts` define the *meaning* of the granted access: the token's capabilities are resolved fresh on every tool call from live rank/team/driver/consent rows, and the per-subject `aiDataConsent` opt-in gates whether others' ID documents are visible. Before any token is granted, the same gating spine that protects the app (camp access → onboarding complete → captain approval) is re-checked.

## Features

### `/mcp/connect` sign-in bridge (page.tsx)
- Client component (`"use client"`), wrapped in `<Suspense fallback={<Shell>Loading…</Shell>}>` (page.tsx:19). Inner component reads `useSearchParams()`.
- Reads `next` from the query string and sanitizes it via `safeNext` (page.tsx:27, 93-98).
- Subscribes to session via `authClient.useSession()` (page.tsx:28).
- **Auto-forward effect** (page.tsx:31-36): once a session exists (`!isPending && session?.user`), performs `window.location.replace(next)` — a *hard* navigation (not `router.push`) because `next` points at an API route the App Router won't reach (page.tsx:33-34).
- **Google sign-in** (`onGoogle`, page.tsx:38-45): calls `authClient.signIn.social({ provider: "google", callbackURL: window.location.href })`. Per the documented Better Auth gotcha, sign-in returns the user to *this* page (not the explicit `callbackURL`), and the session effect then forwards to `next` (page.tsx:7-16). On error, sets `error` to `err.message ?? "Sign-in failed."`.
- Renders a copy block explaining the user will see what they're approving before the connection completes (page.tsx:57-61), the Google button (page.tsx:62-68), an inline error region, and a "New to Camp 404?" footnote linking to `/auth/sign-in` (page.tsx:74-80).

### `GET /api/mcp/oauth/authorize` — render consent screen (authorize/route.ts:64-112)
- Parses & validates query params via `AuthorizeQuery` zod schema (route.ts:21-29, 33-35). On failure: `errorPage(400, "invalid_request", <first issue message or fallback>)` (route.ts:67-73).
- Resolves the client and scope via `resolveClientOrError` (route.ts:37-58, 75-76). Errors (unknown client, bad redirect URI) become `errorPage`; an `invalid_scope` becomes a redirect-back error.
- If no authenticated session (`getAuthenticatedUser()` null): redirects to `/mcp/connect?next=<encoded /api/mcp/oauth/authorize?…>` (route.ts:78-84) — this is the hand-off to the bridge page above.
- If signed in but **no camp profile** (`findUserByAuthId` null): `errorPage(403, "no_camp_account", …)` instructing the user to enter their invite code in the app first (route.ts:86-93).
- Applies the app gating spine via `mcpAccessError` over `hasCampAccess` / `profileComplete` (`!!profile?.completedAt`) / `isApproved` (route.ts:98-104). Any denial → `errorPage(403, <error>, <description>)`.
- On success: renders `consentHtml` with `clientName`, `scope`, `displayName` (`campUser.displayName ?? authUser.primaryEmail ?? "You"`), and the original params (route.ts:106-111).

### `POST /api/mcp/oauth/authorize` — approve / deny (authorize/route.ts:118-187)
- Reads `multipart/form-data` (route.ts:119-122). On parse failure: `errorPage(400, "invalid_request", "Form body required.")`.
- Extracts `action` (`"approve"` | `"deny"`) and rebuilds the OAuth params from all other form fields (route.ts:124-130), re-validating them with `AuthorizeQuery`.
- **Deny path** (`action === "deny"`, route.ts:142-149): `htmlRedirect` back to `redirect_uri` with `error=access_denied` (+`state` if present). No auth code issued. *(Deny is processed BEFORE re-checking session/gates — a denial always succeeds.)*
- **Approve path** (route.ts:151-186): re-authenticates session (`errorPage(401, "unauthenticated", "Session expired. Try again.")` if gone), re-resolves camp user, re-runs `mcpAccessError`, then `issueAuthCode(...)` and `htmlRedirect` back to `redirect_uri` with `code` (+`state` if present).
- Redirects use `htmlRedirect` (meta-refresh + JS `window.location.replace`), NOT a 302, because CSP `form-action 'self'` silently drops cross-origin 302s from POST handlers (route.ts:259-277).

### ID-document consent gate (consent.ts)
- `canSeeIdDocuments(scope, subject)` (consent.ts:17-23): the rule deciding whether an MCP call may surface a subject's identification documents (passport, SA ID, EFT details, others' reimbursement bank details).
  - **Self always sees own data** regardless of consent: `if (scope.campUserId === subject.id) return true;` (consent.ts:21).
  - Otherwise both gates required: `return scope.isCaptain && subject.aiDataConsent;` (consent.ts:22).
- `redactIdDocuments(scope, row)` (consent.ts:33-45): strips `passportEncrypted`, `saIdEncrypted`, `eftDetailsEncrypted` from a row when `canSeeIdDocuments` is false; otherwise returns the row unchanged. Intended as a second line of defence (callers must not decrypt before this gate — consent.ts:30-31). **Test-only / orphaned:** `redactIdDocuments` has ZERO production callers — only `consent.test.ts` exercises it. The live path (`people.ts`) does its own conditional include keyed on `canSeeIdDocuments` rather than calling this helper, so the documented "defence-in-depth" layer is not actually wired in.
- Everything else (phone, email, emergency contacts, dietary, vehicle details) bypasses this gate and is freely visible at the appropriate tier (consent.ts:11-16).

### Scope snapshot & capability predicates (scope.ts)
- `resolveMcpScope(rows)` (scope.ts:36-52): pure derivation of `McpScope` from `McpScopeRows`; iterates `teamMemberships` to build `memberTeams` (all) and `leadTeams` (those with `isLead`); sets `isCaptain = rank === "captain"`, `isDriver = rows.driverIntent`, `aiDataConsent`.
- `getMcpScope(campUserId)` (scope.ts:58-62): reads rows (`getMcpScopeRows`) and resolves; returns `null` if the user row doesn't exist.
- Resolved **fresh on every tool invocation** — no caps cached on the access token, so a rank change / new team membership takes effect on the next call rather than next reconnect (scope.ts:9-13).
- Predicates: `canReadTeamOps(scope, team)` (captain → all; else member of team) (scope.ts:70-74); `canWriteTeam(scope, team)` (captain or lead of team) (scope.ts:77-80); `canApproveCrossTeam(scope)` (captain or any lead) (scope.ts:83-85); `canAdmin(scope)` (captain only) (scope.ts:88-90). **Test-only / orphaned:** these four predicates (scope.ts:70-90) have NO production caller — only `scope.test.ts` exercises them. The only `scope.ts` exports actually wired into the live surface are `getMcpScope` (via tool-utils.ts:53) and `canSeeIdDocuments` (via people.ts:133, in `consent.ts`); the per-domain capability predicates are an unwired forward-looking surface, not yet load-bearing.

### Scope allow-list / OAuth primitives invoked (oauth.ts)
- `DEFAULT_SCOPE = "mcp:user"` (oauth.ts:13); `ALLOWED_SCOPES = new Set([DEFAULT_SCOPE])` (oauth.ts:14). "Single coarse scope for now. Per-tool scopes can carve this later" (oauth.ts:12).
- `isAllowedScope(scope)` (oauth.ts:16-21): splits on whitespace, drops empties, requires *every* token to be in `ALLOWED_SCOPES`.
- `issueAuthCode(input)` (oauth.ts:129-144): inserts an `mcp_auth_codes` row with TTL `AUTH_CODE_TTL_SEC` (5 min) and the negotiated scope.
- `findClient(clientId)` (oauth.ts:99-107): looks up the DCR-registered client row.
- `isAllowedRedirectUri` (oauth.ts:27-42) — not called by the authorize route's render path (which checks `client.redirectUris.includes(...)` instead) but is the registration-time allow-list backing the URIs that the consent screen later validates against.

## User actions & interactions

On the **bridge page** (`/mcp/connect`):
- Tap **"Sign in with Google"** → social sign-in; on success auto-forwards to `next`.
- Tap **"Sign in first"** link → navigates to `/auth/sign-in`.
- No-action path: if already signed in, the page immediately forwards (`window.location.replace(next)`) with a "Continuing to {next}…" message.

On the **consent screen** (`GET /api/mcp/oauth/authorize` HTML):
- Read who you're signed in as (`Signed in as <displayName>`) and the requesting client name + scope.
- Tap **Approve** (`<button name="action" value="approve">`) → POST → auth code issued → redirect to client with `code`.
- Tap **Deny** (`<button name="action" value="deny">`) → POST → redirect to client with `error=access_denied`.
- The form (`method="POST" action="/api/mcp/oauth/authorize"`) carries all OAuth params as hidden inputs (route.ts:208-213, 243-249) so the POST handler reconstructs the request.

No other interactive controls exist on this surface. There is **no per-scope checkbox, no granular toggle, and no `aiDataConsent` toggle on this screen** — scope is the single coarse `mcp:user`, all-or-nothing. (The `aiDataConsent` opt-in is a stored user flag set elsewhere; no UI for it was found under `apps/web/app`. <!-- low-confidence: aiDataConsent toggle UI location — not present in app routes; likely a profile/settings surface outside this unit -->)

## States & presentations

Applicable global-states rows for this surface:

- **Loading** — bridge page: `<Suspense>` fallback "Loading…" (page.tsx:19); `isPending` session check → Shell "Checking session…" (page.tsx:47-49).
- **Populated (consent prompt)** — the rendered consent HTML naming client + identity + scope with Approve/Deny (route.ts:215-252).
- **Submitting/pending** — implicit during POST; the redirect intermediary HTML shows "Redirecting… Continue if not redirected." (route.ts:264-277).
- **Success (approve)** — redirect to `redirect_uri?code=<code>[&state=<state>]` (route.ts:181-186).
- **Success/terminal (deny)** — redirect to `redirect_uri?error=access_denied[&state=<state>]` (route.ts:142-149).
- **Validation-error** — `errorPage(400, "invalid_request", …)` for bad query/form params (route.ts:67-73, 131-137); `invalid_scope` redirect-back (route.ts:50-56).
- **Invite-gated** — `no_camp_access` denial (`errorPage 403`) when `hasCampAccess` is false: "Your account hasn't redeemed an invite code yet…" (access.ts:19-25). Also `no_camp_account` (403) when signed in but no camp profile exists (route.ts:86-93).
- **Onboarding-incomplete** — `onboarding_incomplete` denial (403): "Finish your burner profile in the app before connecting Claude." (access.ts:26-32). Gate: `!!profile?.completedAt`.
- **Pending-approval** — `pending_approval` denial (403): "A captain still needs to approve your account before you can connect Claude." (access.ts:33-39).
- **Rejected** — `isApproved` is false for `approval_status='rejected'` (it only returns true for `approved` or god email), so rejected users hit the same `pending_approval` denial branch (access.ts:33-39; users.ts:231-236). <!-- low-confidence: rejected users surface the "pending_approval" message specifically, not a distinct "rejected" message — the gate collapses both non-approved states into pending_approval -->
- **Unauthenticated bridge state** — bridge page renders the sign-in CTA (page.tsx:55-82). Server authorize GET with no session → redirect to the bridge.
- **Session-expired on approve** — `errorPage(401, "unauthenticated", "Session expired. Try again.")` (route.ts:152-153).
- **Disabled / Empty** — not applicable; this surface has no list/empty state and no disabled-control state beyond the gates above.

Note: god-email accounts bypass every gate (`hasCampAccess` and `isApproved` both short-circuit on `isGodEmail`), so they always reach the consent prompt (users.ts:219-236).

## Enums, options & configurable values

- **OAuth scope set (the entire scope vocabulary):** exactly one value `mcp:user` (`DEFAULT_SCOPE`, oauth.ts:13). Advertised as `scopes_supported: ["mcp:user"]` in both well-known metadata routes (oauth-authorization-server/route.ts:23; oauth-protected-resource/route.ts:19).
- **`AuthorizeQuery` params** (route.ts:21-29): `response_type` literal `"code"`; `client_id` (min 1); `redirect_uri` (URL); `code_challenge` (min 1); `code_challenge_method` enum `["S256"]` default `"S256"`; `scope` optional; `state` optional.
- **`action` form values:** `"approve"` | `"deny"` (route.ts:142, 246-247).
- **OAuth error codes emitted:** `invalid_request`, `unknown_client`, `invalid_redirect_uri`, `invalid_scope`, `no_camp_account`, `no_camp_access`, `onboarding_incomplete`, `pending_approval`, `unauthenticated`, `access_denied` (route.ts + access.ts).
- **Token / code lifetimes** (oauth.ts:8-10): `AUTH_CODE_TTL_SEC = 5*60` (5 min); `ACCESS_TOKEN_TTL_SEC = 24*60*60` (24 h); `REFRESH_TOKEN_TTL_SEC = 30*24*60*60` (30 days).
- **`rank` enum** (schema.ts:31): `["captain", "member"]`.
- **`approval_status` enum** (schema.ts:41-45): `["pending", "approved", "rejected"]`.
- **`team` enum (8 values)** (schema.ts:51-60): `kitchen`, `structures`, `power_and_lighting`, `sanitation_and_water`, `health_and_safety`, `art_and_activities`, `ministry_of_memes`, `ministry_of_vibes`.
- **`mcp_client_auth_method` enum** (schema.ts:1223-1227): `none`, `client_secret_basic`, `client_secret_post`.
- **`mcp_code_challenge_method` enum** (schema.ts:1229-1232): `S256`, `plain`. (Authorize route only accepts `S256`; `plain` exists in storage/PKCE-verify only.)
- **`mcp_audit_outcome` enum** (schema.ts:1234-1237): `success`, `error`.
- **Well-known discovery (read-only context):** `response_types_supported: ["code"]`; `grant_types_supported: ["authorization_code", "refresh_token"]`; `code_challenge_methods_supported: ["S256"]`; `token_endpoint_auth_methods_supported: ["none","client_secret_basic","client_secret_post"]`; `bearer_methods_supported: ["header"]` (oauth-authorization-server/route.ts:23-30; oauth-protected-resource/route.ts:19-22).
- **Redirect-URI allow-list** (oauth.ts:27-42): loopback (`localhost`, `127.0.0.1`, `[::1]`) over http/https, or `https:` to `claude.ai` / `*.claude.ai` / `anthropic.com` / `*.anthropic.com`.
- **`displayName` fallback chain** on the consent screen: `campUser.displayName ?? authUser.primaryEmail ?? "You"` (route.ts:109).
- **`safeNext` defaults**: returns `"/"` for empty, non-`/`-prefixed, or protocol-relative (`//`) values (page.tsx:93-98).

## Data model touched

(must agree with unit 29)

- **`users`** (schema.ts:220-303) — read for the consent gate and scope:
  - `id` (uuid PK), `authUserId` (`auth_user_id`, unique), `displayName` (`display_name`, nullable), `rank` (`rankEnum`, default `member`), `inviteCode` (`invite_code`, nullable — null = god account), `approvalStatus` (`approval_status`, default `approved`).
  - `aiDataConsent` (`ai_data_consent`, boolean, **default `false`**) — the per-subject opt-in read by `canSeeIdDocuments` / `redactIdDocuments` and carried on `McpScope.aiDataConsent` (schema.ts:298).
  - `aiDataConsentAt` (`ai_data_consent_at`, timestamp, nullable) — when consent was given (schema.ts:299). Not read by this surface's code, but is the consent's audit stamp.
  - Encrypted ID fields gated by consent: `passportEncrypted` (`passport_encrypted`), `saIdEncrypted` (`sa_id_encrypted`), `eftDetailsEncrypted` (`eft_details_encrypted`) (schema.ts:241-243).
- **`team_memberships`** — `team` (`teamEnum`), `isLead` (`is_lead`) read by `getMcpScopeRows` → `resolveMcpScope` (mcp.ts:47-53).
- **`driver_profiles`** — `intendsToDrive` (`intends_to_drive`) read for `McpScope.isDriver` (mcp.ts:55-59).
- **`burner_profiles`** — read via `getBurnerProfileByUserId`; only `completedAt` is consulted (`profileComplete = !!profile?.completedAt`) (route.ts:98-103).
- **`mcp_oauth_clients`** (schema.ts:1242-1254) — read via `findClient`: `clientId` (PK), `clientSecretHash` (nullable), `clientName` (NOT NULL — shown on consent screen), `redirectUris` (text[] NOT NULL — validated against the request's `redirect_uri`), `tokenEndpointAuthMethod`, `scope` (nullable), `createdAt`, `lastUsedAt`.
- **`mcp_auth_codes`** (schema.ts:1260-1284) — **written on Approve** via `issueAuthCode`: `code` (PK, plaintext, single-use), `clientId` (FK→clients, cascade), `userId` (FK→users, cascade), `redirectUri`, `codeChallenge`, `codeChallengeMethod` (`mcpCodeChallengeMethodEnum`), `scope` (NOT NULL), `expiresAt` (now + 5 min), `consumedAt` (nullable, flipped on token exchange in unit 29), `createdAt`. Indexes: `mcp_auth_codes_client_idx`, `mcp_auth_codes_expires_idx`.
- **`mcp_access_tokens`** (schema.ts:1289-1311) — not written by the consent screen itself (issued at the token endpoint, unit 29); referenced because the granted scope ultimately lands here.
- **`mcp_audit_log`** (schema.ts:1316-1341) — not written by the consent screen; one row per tool invocation (unit 29).
- `McpScopeRows` interface (mcp.ts:14-22): `user: { id, rank, aiDataConsent }`, `teamMemberships: Array<{ team, isLead }>`, `driverIntent: boolean`.
- `McpScope` interface (scope.ts:15-28): `campUserId`, `rank`, `leadTeams: Team[]`, `memberTeams: Team[]`, `isDriver`, `isCaptain`, `aiDataConsent`.

## Validation, edge cases & business rules

- **Open-redirect protection on the bridge** (`safeNext`, page.tsx:93-98): only accepts a value that starts with a single `/`; rejects empty, absolute, and protocol-relative (`//`) `next` values → falls back to `/`. Comment explicitly flags the protocol-relative attack (page.tsx:96).
- **Hard navigation required**: the bridge forwards via `window.location.replace`, not the App Router, because `next` is an API route (page.tsx:33-35).
- **Better Auth callback gotcha**: `signIn.social` returns to the current page (not the explicit `callbackURL`); the session effect handles the actual forward (page.tsx:7-16, 40-43).
- **Client/redirect validation** (route.ts:37-58): unknown `client_id` → 400 `unknown_client`; `redirect_uri` not in the client's registered `redirectUris` → 400 `invalid_redirect_uri`; both are rendered as `errorPage` (NOT redirected, since the redirect target itself is untrusted).
- **Scope validation**: unrecognised scope → `invalid_scope` *redirect-back* (route.ts:50-56) — done as a redirect (not error page) because the redirect target is already validated by that point.
- **PKCE mandatory**: `code_challenge` required (min 1); `code_challenge_method` constrained to `S256` at the authorize endpoint (route.ts:24-26), even though storage/verify also support `plain`.
- **Gate ordering (GET render)**: parse → resolve client/scope → require session (else bounce to bridge) → require camp profile → `mcpAccessError` (campAccess → profileComplete → approved). First failing gate wins (access.ts:18-41).
- **Gate ordering (POST)**: parse form → resolve client/scope → **if deny, redirect immediately** → require session → require camp profile → `mcpAccessError` → issue code. Denial bypasses session/gate re-checks (route.ts:142-179).
- **`mcpAccessError` precedence** (access.ts): `no_camp_access` > `onboarding_incomplete` > `pending_approval`; returns `null` (allowed) only when all three booleans hold.
- **God-email bypass**: `hasCampAccess` true if `isGodEmail(email)` OR `inviteCode` present; `isApproved` true if `isGodEmail(email)` OR `approvalStatus === "approved"` (users.ts:219-236).
- **Rejected collapses to pending message**: a `rejected` user fails `isApproved` and gets the `pending_approval` description, not a rejection-specific message (no distinct rejected branch in `mcpAccessError`).
- **ID-document consent rule** (consent.ts): self sees own ID docs always; otherwise requires BOTH `isCaptain` AND subject `aiDataConsent`. Default `aiDataConsent` is `false`, so by default a captain cannot see another member's ID docs via MCP. `redactIdDocuments` is *intended* as a defence-in-depth layer applied even if the caller forgot to gate (consent.ts:30-31), but is currently unwired (test-only — see "Sub-components / variants"); the live gate is `canSeeIdDocuments` used directly by `people.ts:133`.
- **Scope freshness**: capabilities are re-derived per tool call from live rows; no caching on the token (scope.ts:9-13).
- **HTML escaping**: every interpolated value in the consent HTML, the redirect HTML, and the error page is run through `escapeHtml` (route.ts:193-200); `htmlRedirect` additionally JSON-encodes the target for the inline `<script>` (route.ts:271).
- **CSP-driven redirect technique**: POST redirects use meta-refresh + JS, never a 302, because `form-action 'self'` would silently drop a cross-origin 302 (route.ts:259-263).
- **Issuer/origin correctness**: well-known issuer and the bridge `next` URL derive origin from request headers / `MCP_PUBLIC_URL`, never `VERCEL_URL`, to avoid pointing at the SSO-gated deploy URL (origin.ts; oauth-authorization-server/route.ts:11-14).
- **`state` passthrough**: `state` is forwarded on both the success (`code`) and deny (`access_denied`) redirects only when present (route.ts:142-148, 181-186).

## Sub-components / variants

- **`MCPConnectPage` / `MCPConnectInner` / `Shell`** (page.tsx) — the only React components; `Shell` is a shared layout wrapper (`max-w-md`, centered) used for loading, signed-in, and signed-out states.
- **`consentHtml`** (route.ts:202-257) — server-rendered consent page (inline `<style>`, dark hard-coded palette `#0a0a0a`/`#fafafa`/`#171717`/`#262626`; NOT the OKLCH brand tokens — this surface is rendered outside the React/Tailwind app shell). Approve/Deny buttons. <!-- ugly truth: the consent HTML uses hard-coded neutral hex colours, divergent from the app's single OKLCH brand palette, because it is a raw HTML response from an API route, not an in-app page. -->
- **`htmlRedirect`** (route.ts:264-277) — meta-refresh + JS redirect intermediary.
- **`errorPage`** (route.ts:298-314) — generic error HTML (title + description), used for all `errorPage(...)` denials.
- **`redirectError`** (route.ts:285-296) — redirect-back error variant (used only for `invalid_scope`).
- **`buildRedirectUrl`** (route.ts:279-283), **`escapeHtml`** (route.ts:193-200), **`parseParams`** / **`resolveClientOrError`** (route.ts:33-58) — internal helpers.
- **Server-only validators/predicates:** `AuthorizeQuery` (zod), `mcpAccessError` (access.ts), `isAllowedScope` / `isAllowedRedirectUri` (oauth.ts), `canSeeIdDocuments` / `redactIdDocuments` (consent.ts), `resolveMcpScope` / `getMcpScope` / `canReadTeamOps` / `canWriteTeam` / `canApproveCrossTeam` / `canAdmin` (scope.ts). Of these, only `getMcpScope` (via tool-utils.ts:53) and `canSeeIdDocuments` (via people.ts:133) are wired into the live tool surface; `redactIdDocuments` (consent.ts:33-45) and the four scope predicates (scope.ts:70-90) are test-only / orphaned (exercised only by `consent.test.ts` / `scope.test.ts`).
- **Dead/orphaned for THIS surface:** `isAllowedRedirectUri` (oauth.ts) is the registration-time guard and is **not invoked** by the authorize route (which validates against the stored `client.redirectUris` instead) — load-bearing for unit 29's `/register`, not the consent render. The `plain` PKCE method (`mcpCodeChallengeMethodEnum`) is accepted in storage/verify but **rejected at the authorize endpoint** (`code_challenge_method` enum is `["S256"]` only). `aiDataConsentAt` is written/maintained elsewhere; this surface only reads `aiDataConsent`. The four `scope.ts` capability predicates (`canReadTeamOps` / `canWriteTeam` / `canApproveCrossTeam` / `canAdmin`, scope.ts:70-90) and `redactIdDocuments` (consent.ts:33-45) have **no production caller** (each is exercised only by its co-located test — `scope.test.ts` / `consent.test.ts`); the live capability surface wired from these modules is just `getMcpScope` (tool-utils.ts:53) and `canSeeIdDocuments` (people.ts:133).
