# MCP connect / consent — functional brief

- **Route(s):** `/mcp/connect` (bridge page) · `GET /api/mcp/oauth/authorize` (consent render) · `POST /api/mcp/oauth/authorize` (approve/deny)
- **Canonical board(s):** `S20 MCP connect` (board #29, 430×675px, `design/.spec-extract/boards/29-s20-mcp-connect.txt`)
- **Superseded / dropped:** none — single board; no iterations
- **Breakpoints:** mobile-first 430px (board canonical); `max-w-md` centered for the bridge page; the authorize-route consent HTML is server-rendered raw HTML outside the React/Tailwind shell — dark-mode palette applied inline

---

## Purpose

Two-screen human-facing leg of the MCP OAuth 2.1 PKCE flow. A Camp 404 member connecting an MCP client (Claude.ai, Claude desktop) must (1) prove they have a live session — the bridge page at `/mcp/connect` handles this by triggering a Google social sign-in then hard-navigating back to the authorize endpoint — and (2) explicitly approve or deny the client's scope request. The consent screen names the requesting client and the signed-in identity, presents the single coarse `mcp:user` scope, and provides Approve / Deny. Approval issues a short-lived PKCE auth code; denial redirects back with `error=access_denied`. Before any token is granted, the same gating spine that protects the main app (camp access → onboarding complete → captain approval) is re-run.

---

## Layout & modules

### 1. `/mcp/connect` — sign-in bridge page

Full-viewport column, `max-w-md` centered. Client component wrapped in `<Suspense>` (fallback: Shell "Loading…"). Inner component reads `next` from the query string, sanitised via `safeNext` (accepts only `/`-prefixed relative values; falls back to `/`).

Three possible presentations, mutually exclusive:

| Presentation | Trigger | Content |
|---|---|---|
| Loading / checking | `isPending` on `useSession()` | Shell: "Checking session…" |
| Signed-in auto-forward | Session exists + `!isPending` | Shell: "Continuing to {next}…" then `window.location.replace(next)` |
| Sign-in CTA | No session | Bridge Card + footnote (see below) |

**Bridge Card** (`$card`, `$border`, r:$radius, pad:20, gap:16):
- Explanatory copy: "You'll see exactly what you're approving before anything connects." (`Inter/14px/normal/$card-foreground`)
- **Google Button** (outlined, full-width, `pad:[13,22]`, `jc:center`): "G" badge (Inter/15px/700/#4285F4) + "Sign in with Google" (Inter/15px/600/$foreground). On tap → `authClient.signIn.social({ provider:"google", callbackURL: window.location.href })`.
- **Error Region** (conditional, `fill:#f83e5a1f`, `$destructive`): triangle-alert icon + error message text. Shown when Google sign-in returns an error.
- **Footnote** (`gap:5`, `ai:center`): "New to Camp 404?" (`Inter/13px/$muted-foreground`) + "Sign in" link to `/auth/sign-in` (`Inter/13px/600/$accent`).

### 2. `GET /api/mcp/oauth/authorize` — consent screen

Server-rendered raw HTML (not in the Next.js app shell). Dark palette applied inline (`#0a0a0a` background, `#fafafa` foreground, `#171717` card, `#262626` muted). Two cards shown after a successful session + gate check.

**Identity Row** (inside Consent Card): avatar circle (`w:32, h:32, fill:#ff008c2e`, r:16) containing a `user` icon (`$primary`) + "Signed in as {displayName}" (`Inter/16px/700/$card-foreground`). displayName fallback chain: `campUser.displayName ?? authUser.primaryEmail ?? "You"`.

**Consent Card** (`$card`, `$border`, r:$radius, pad:20, gap:16):
- Identity Row (above)
- Requesting Row: "Requesting access" label (`Inter/13px/$muted-foreground`) + "Claude" value (or registered `clientName`) (`Inter/14px/600/$card-foreground`)
- **Scope Row** (`$muted`, pad:12, r:$radius, `ai:center`, `gap:12`): Scope Icon Wrap (`w:34, h:34, r:8, fill:#00dcff26`) containing shield icon (`$accent`); Scope Text: `mcp:user` (`JetBrains Mono/13px/600/$card-foreground`) + "Read your basic profile" (`Inter/12px/normal/$muted-foreground`)
- **Footer Buttons** (`gap:12`): Deny (Button-Outline, full-width) + Approve (Button-Primary, full-width). Both are `<button name="action" value="deny|approve">` inside a `<form method="POST" action="/api/mcp/oauth/authorize">`. All OAuth params (client_id, redirect_uri, code_challenge, code_challenge_method, scope, state, response_type) carried as hidden inputs.

**403 Gate Card** (shown instead of Consent Card when a gate fails): `$muted`, `$border`, r:$radius, pad:16, gap:14, `ai:center`. Lock Wrap circle (`w:40, h:40, r:20, fill:$card`) containing lock icon (`$muted-foreground`). Text: "A captain still needs to approve your account before you can connect Claude." (`Inter/13px/normal/$card-foreground`). NOTE: The board renders only the pending-approval variant of the gate; other gate states (no_camp_account, onboarding_incomplete) are rendered as `errorPage` HTML (not this card design) — see Open questions.

---

## Components used

| Component | Role | Key props / variants |
|---|---|---|
| `Button-Primary` | Approve action | full-width, `value="approve"` inside form |
| `Button-Outline` | Deny action | full-width, `value="deny"` inside form |
| `Shell` (new, bridge-only) | Layout wrapper for loading / forwarding / CTA states | `max-w-md`, centered; contains bridge card or status text |
| `MCPConnectInner` (new, bridge-only) | Inner client component reading `useSearchParams` | wrapped in `Suspense` by `MCPConnectPage` |
| `MCPConnectPage` (new, bridge-only) | Page entry point | provides `<Suspense>` boundary |

No reusable canvas components (TopChrome, SectionHeader, DetailHeader, GridTile, Card, EmptyState, CaptainLock) are used on this surface. The consent HTML is raw server HTML, not a React component tree.

---

## States

### Bridge page (`/mcp/connect`)

| State | Trigger | Presentation |
|---|---|---|
| **Loading** | `Suspense` fallback or `isPending` session check | Shell: "Loading…" / "Checking session…" |
| **Signed-in (auto-forward)** | `session?.user` present and `!isPending` | Shell: "Continuing to {next}…"; hard-navigates to `next` via `window.location.replace` |
| **Sign-in CTA** | No session | Bridge Card: Google button + footnote |
| **Sign-in error** | Google OAuth returns error | Bridge Card + Error Region (destructive inline message) |

### Consent screen (`GET /api/mcp/oauth/authorize`)

| State | Gate check | Presentation |
|---|---|---|
| **Validation error** | Bad / missing `AuthorizeQuery` params | `errorPage(400, "invalid_request", …)` |
| **Unknown client** | `client_id` not in `mcp_oauth_clients` | `errorPage(400, "unknown_client", …)` |
| **Bad redirect URI** | `redirect_uri` not in `client.redirectUris` | `errorPage(400, "invalid_redirect_uri", …)` |
| **Invalid scope** | Scope token not in `ALLOWED_SCOPES` | Redirect-back: `error=invalid_scope` |
| **No session** | No Better Auth session | Redirect to `/mcp/connect?next=<encoded authorize URL>` |
| **No camp account** | Signed in but no `users` row | `errorPage(403, "no_camp_account", …)` |
| **No camp access** | `hasCampAccess` false (no invite code, not god email) | `errorPage(403, "no_camp_access", …)` |
| **Onboarding incomplete** | `!profile?.completedAt` | `errorPage(403, "onboarding_incomplete", …)` |
| **Pending / rejected** | `approvalStatus !== "approved"` (both `pending` and `rejected` collapse here) | 403 Gate Card: "A captain still needs to approve your account…" |
| **Consent prompt** | All gates pass | Consent Card: identity + scope + Approve/Deny |

### POST approve/deny

| State | Trigger | Outcome |
|---|---|---|
| **Deny** | `action=deny` | `htmlRedirect` to `redirect_uri?error=access_denied[&state=…]` — no session/gate re-check |
| **Session expired on approve** | Session gone between GET and POST | `errorPage(401, "unauthenticated", "Session expired. Try again.")` |
| **Gate fail on approve** | `mcpAccessError` returns error | `errorPage(403, <error_code>, <description>)` |
| **Approve success** | All checks pass | `issueAuthCode(…)` → `htmlRedirect` to `redirect_uri?code=<code>[&state=…]` |
| **Redirect intermediary** | After any `htmlRedirect` | Meta-refresh + JS: "Redirecting… Continue if not redirected." |

### Global gate matrix (applied at consent render + approve)

Gate ordering (first-fail wins):
1. `no_camp_access` — `hasCampAccess` false
2. `onboarding_incomplete` — `!profileComplete`
3. `pending_approval` — `!isApproved` (covers both `pending` and `rejected` approval status)

God-email accounts bypass 1 and 3 unconditionally.

---

## User actions

| Action | Condition | Result |
|---|---|---|
| Tap "Sign in with Google" | No session, bridge page | Triggers `authClient.signIn.social`; returns to same page; session effect fires `window.location.replace(next)` |
| Tap "Sign in" footnote link | No session, bridge page | Navigate to `/auth/sign-in` |
| Auto-forward | Session exists on bridge page load | `window.location.replace(next)` (hard navigation to the authorize API route) |
| Tap "Deny" | Consent prompt visible | POST with `action=deny`; `htmlRedirect` to client with `error=access_denied` |
| Tap "Approve" | Consent prompt visible | POST with `action=approve`; re-checks session + gates; issues auth code; `htmlRedirect` to client with `code` |

No other interactive controls exist. There is no per-scope checkbox, no granular toggle, and no `aiDataConsent` toggle on this surface.

---

## Data & enums

### Tables read

| Table | Fields consulted | Purpose |
|---|---|---|
| `users` | `id`, `authUserId`, `displayName`, `rank`, `inviteCode`, `approvalStatus`, `aiDataConsent`, `aiDataConsentAt` | Identity display, gate checks, scope snapshot |
| `mcp_oauth_clients` | `clientId`, `clientName`, `redirectUris`, `tokenEndpointAuthMethod`, `scope` | Client lookup + validation |
| `burner_profiles` | `completedAt` | Onboarding-complete gate (`profileComplete = !!completedAt`) |
| `team_memberships` | `team`, `isLead` | Scope derivation (not used on the consent screen HTML itself; used per tool call) |
| `driver_profiles` | `intendsToDrive` | Scope derivation (same caveat) |

### Tables written

| Table | Fields written | Trigger |
|---|---|---|
| `mcp_auth_codes` | `code` (PK), `clientId`, `userId`, `redirectUri`, `codeChallenge`, `codeChallengeMethod`, `scope`, `expiresAt`, `createdAt` | Approve action; TTL = 5 min |

### Enums

| Enum | Values | Where used |
|---|---|---|
| `rankEnum` | `captain` \| `member` | Gate: `isCaptain` |
| `approvalStatusEnum` | `pending` \| `approved` \| `rejected` | Gate: `isApproved` |
| `mcpCodeChallengeMethodEnum` | `S256` \| `plain` | Stored on auth code; authorize endpoint only accepts `S256` |
| `mcpClientAuthMethodEnum` | `none` \| `client_secret_basic` \| `client_secret_post` | Client lookup |
| `mcpAuditOutcomeEnum` | `success` \| `error` | Written by token-exchange / tool invocation (unit 29), not by this surface |

### OAuth parameters (`AuthorizeQuery`)

| Param | Type | Notes |
|---|---|---|
| `response_type` | literal `"code"` | Required |
| `client_id` | string (min 1) | Required |
| `redirect_uri` | URL | Required; validated against `client.redirectUris` |
| `code_challenge` | string (min 1) | PKCE mandatory |
| `code_challenge_method` | `"S256"` | Only S256 accepted at authorize endpoint |
| `scope` | string | Optional; defaults to `mcp:user`; validated against `ALLOWED_SCOPES` |
| `state` | string | Optional; passed through on both success and deny redirects |

### Scope vocabulary

Single scope: `mcp:user` (`DEFAULT_SCOPE`). Advertised in well-known metadata. No per-tool granularity at this stage ("single coarse scope for now — per-tool scopes can carve this later").

### Token lifetimes

| Token | TTL |
|---|---|
| Auth code | 5 min |
| Access token | 24 h |
| Refresh token | 30 days |

### NEW schema

None. All tables and enums are existing. No schema changes introduced by this surface.

---

## Validation & edge cases

- **Open-redirect protection (`safeNext`):** only values prefixed with a single `/` are accepted; empty, absolute, and protocol-relative (`//`) values fall back to `/`. Explicit protocol-relative attack mitigated.
- **Hard navigation on bridge:** `window.location.replace` (not `router.push`) is required because `next` points to an API route the App Router cannot reach.
- **Better Auth callback gotcha:** `signIn.social` returns the browser to the current page (not the explicit `callbackURL`); the session subscription effect performs the actual forward.
- **Unknown client / bad redirect URI render as error pages (not redirects):** the redirect target itself is not yet trusted, so these are `errorPage` HTML responses, never redirects.
- **Invalid scope is a redirect-back error:** by this point the redirect URI is validated, so `invalid_scope` is safely emitted as `?error=invalid_scope`.
- **Deny bypasses session/gate re-checks on POST:** denial always succeeds regardless of session state — a user who has been approved-revoked between GET and POST can still deny.
- **PKCE S256 only at authorize endpoint:** `code_challenge_method` enum in storage supports `plain`; the authorize route constrains to `["S256"]`.
- **`rejected` collapses to `pending_approval` message:** `mcpAccessError` has no distinct `rejected` branch; both `pending` and `rejected` `approvalStatus` fail `isApproved` and surface "A captain still needs to approve your account before you can connect Claude."
- **CSP-driven redirect technique:** POST responses use meta-refresh + JS redirect, not HTTP 302, because `form-action 'self'` silently drops cross-origin 302s from POST handlers.
- **HTML escaping:** all interpolated values in consent HTML, redirect HTML, and error pages are run through `escapeHtml`; `htmlRedirect` JSON-encodes the target for inline `<script>`.
- **`state` passthrough:** forwarded on both `code` (approve) and `access_denied` (deny) redirects only when present.
- **ID-document consent (`aiDataConsent`):** not controlled by this surface. Self always sees own ID documents via MCP. A captain can see another member's encrypted ID documents only when `isCaptain && subject.aiDataConsent`. Default is `false`. The `aiDataConsent` flag is read/written by MCP identity tools (`get_my_ai_consent` / `set_my_ai_consent`) on the tool surface (unit 29), not here.
- **Scope freshness:** `McpScope` is re-derived per tool invocation from live rows — rank changes and team membership changes take effect immediately without reconnect.
- **`redactIdDocuments` is unwired in production:** the function exists in `consent.ts` as an intended defence-in-depth layer but has no production caller; `people.ts` gates directly on `canSeeIdDocuments`. The four `scope.ts` capability predicates (`canReadTeamOps`, `canWriteTeam`, `canApproveCrossTeam`, `canAdmin`) are also test-only at the time of writing.
- **Issuer/origin correctness:** well-known issuer and the bridge `next` URL derive origin from request headers / `MCP_PUBLIC_URL`, not `VERCEL_URL`, to avoid the SSO-gated deploy URL.
- **God-email bypass:** `hasCampAccess` and `isApproved` both short-circuit to `true` for god emails; god accounts always reach the consent prompt.
- **Consent HTML outside app shell:** raw API-route HTML; uses hard-coded neutral hex colours (`#0a0a0a`/`#fafafa`/`#171717`/`#262626`) rather than the app's OKLCH brand token palette.

---

## Flows

### Primary (new connection, signed out)

1. MCP client initiates OAuth 2.1 PKCE → `GET /api/mcp/oauth/authorize?response_type=code&client_id=…&redirect_uri=…&code_challenge=…&scope=mcp:user&state=…`
2. No session → redirect to `/mcp/connect?next=<encoded authorize URL>`
3. User taps "Sign in with Google" → social sign-in → returns to bridge → session effect → `window.location.replace(next)`
4. `GET /api/mcp/oauth/authorize` re-runs with live session → gates pass → consent HTML rendered
5. User taps Approve → `POST /api/mcp/oauth/authorize` → auth code issued → `htmlRedirect` to `redirect_uri?code=<code>[&state=…]`
6. MCP client exchanges code at token endpoint (unit 29)

### Deny path

Steps 1–4 as above → user taps Deny → `POST` → `htmlRedirect` to `redirect_uri?error=access_denied[&state=…]` → flow terminates.

### Already signed in (reconnection)

1. `GET /api/mcp/oauth/authorize` → session exists → gates pass → consent HTML directly (bridge skipped)

### Bridge page already open with live session

1. Navigate to `/mcp/connect?next=…` with existing session → `isPending` resolves false → `window.location.replace(next)` fires without user interaction

---

## Divergences from feature-set reference

| Feature-set reference signal | Board / decision resolution |
|---|---|
| Reference unit discusses `consent.ts` `redactIdDocuments` as a "second line of defence" | Board does not surface this; reference itself notes it is unwired in production (test-only). Spec documents as-is; no UI action required. |
| Reference unit discusses four `scope.ts` capability predicates (`canReadTeamOps`, `canWriteTeam`, `canApproveCrossTeam`, `canAdmin`) | All four are test-only / orphaned in the live codebase. Spec notes the fact; no consent-screen UI impact. |
| Reference unit mentions `isAllowedRedirectUri` (oauth.ts) as part of this surface | It is the registration-time guard for unit 29 (`/register`), not invoked by the authorize route which validates against stored `client.redirectUris`. Scoped out. |
| Reference unit lists `mcp_access_tokens` and `mcp_audit_log` in data model | Neither is written by the consent screen — they are written at token exchange / tool invocation (unit 29). Spec lists as reference-only context. |
| Consent HTML uses hard-coded hex palette | Board tokens (`$card`, `$border`, etc.) imply the OKLCH brand palette, but the raw HTML server response cannot use CSS custom properties from the Tailwind theme. Document as known divergence. Build reconciliation: consider a minimal inline CSS variable block or accept the hard-coded palette for this out-of-shell surface. |
| Board 403 Gate Card shows only the pending-approval message | Reference unit describes separate `errorPage` responses for `no_camp_account`, `no_camp_access`, and `onboarding_incomplete`. These are not drawn on the board. Spec carries all three as `errorPage` HTML (consistent with the reference), and marks the 403 Gate Card design as specific to `pending_approval`. |

---

## Open questions / build reconciliations

1. **Missing branch designs:** The board draws only two states: Bridge Card (sign-in CTA) and Consent Card (approved user). The following states are not designed:
   - Onboarding-incomplete gate (`errorPage 403 onboarding_incomplete`) — should this be a styled in-app page or remain raw error HTML?
   - No-camp-account gate (`errorPage 403 no_camp_account`) — same question.
   - No-camp-access gate (`errorPage 403 no_camp_access`) — same question.
   - Loading / checking-session state on the bridge — board has no explicit skeleton/spinner.
   - Session-expired-on-approve error (`errorPage 401`) — raw HTML; no in-app design.
   - Auth-code expired before exchange — handled at token endpoint (unit 29) but no UX recovery path drawn.
   - Decide: keep these as raw `errorPage` HTML (consistent with current code) or design them as styled in-app pages (requires React server components for each error branch). Recommend flagging to product owner.

2. **Rejected vs pending message collapse:** Both `pending` and `rejected` approval statuses surface "A captain still needs to approve your account before you can connect Claude." A rejected user receives no distinct terminal message. Decide whether to add a `rejected` branch to `mcpAccessError` with a clearer message ("Your access request was declined.").

3. **`redactIdDocuments` wiring:** The function in `consent.ts` is documented as a defence-in-depth layer but has no production caller. Either remove (test only) or wire it into the live `people.ts` path. Decision needed before hardening.

4. **Four orphaned scope predicates:** `canReadTeamOps`, `canWriteTeam`, `canApproveCrossTeam`, `canAdmin` in `scope.ts` have no production callers. Confirm whether these are planned for a future tool surface or should be removed.

5. **Consent HTML token palette:** The raw HTML uses hard-coded hex colours. If the design system's OKLCH tokens should apply here, the build needs an inline CSS variable block or a lightweight static stylesheet. Low priority but a known aesthetic divergence.

6. **`aiDataConsent` toggle placement:** The flag is read/written by MCP identity tools, not by this consent screen. Confirm there is a discoverable in-app path for members to set/unset `aiDataConsent` — if only reachable via Claude itself, first-time users have no way to opt in before they connect.

7. **Footnote link destination:** The board shows "Sign in" linking to `/auth/sign-in`. If this surface is reached by someone who has never had an account, they should land on a sign-up path, not a sign-in path. Confirm the correct destination (sign-in vs sign-up, or a unified auth page).
