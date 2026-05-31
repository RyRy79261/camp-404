### 20. MCP connect / consent screen
**Purpose:** The human-facing leg of the MCP OAuth flow where a Camp 404 member signs in (if needed) and explicitly approves or denies an MCP client's request to access their camp data.
**Layout & elements:** Mobile single column. Two surfaces. (A) Bridge page `/mcp/connect`: copy block explaining the user will see what they're approving before the connection completes, a "Sign in with Google" button, an inline error region, and a "New to Camp 404?" footnote linking to `/auth/sign-in`. (B) Server-rendered consent HTML: "Signed in as <displayName>", the requesting client name, the single scope `mcp:user`, and "Deny" / "Approve" buttons in a form carrying all OAuth params as hidden inputs.
**Every action (preserve all):**
- Tap "Sign in with Google" → social sign-in; on success auto-forwards to sanitized `next` via hard navigation.
- Tap "Sign in first" link → navigate to `/auth/sign-in`.
- Already signed in → immediate forward with "Continuing to {next}…".
- Tap "Approve" (action=approve) → POST → auth code issued → redirect to client with `code` (+`state`). Disabled if session expired / gates fail.
- Tap "Deny" (action=deny) → POST → redirect to client with `error=access_denied` (+`state`); always succeeds, bypasses session/gate re-checks.
**States to design:**
- Loading: "Loading…" then "Checking session…".
- Unauthenticated: bridge sign-in CTA (GET with no session bounces here).
- Populated: consent prompt naming client + identity + scope.
- Submitting: "Redirecting… Continue if not redirected."
- Success (approve): redirect with `code`. Terminal (deny): redirect with `error=access_denied`.
- Validation-error: `invalid_request` 400; `invalid_scope` redirect-back.
- Invite-gated: `no_camp_access` / `no_camp_account` 403. Onboarding-incomplete: 403 "Finish your burner profile in the app before connecting Claude." Pending-approval / Rejected (collapses here): 403 "A captain still needs to approve your account before you can connect Claude." Session-expired on approve: 401 "Session expired. Try again."
**Options & exact values:** Scope: `mcp:user` (only value). `action`: `approve` | `deny`. Error codes: `invalid_request`, `unknown_client`, `invalid_redirect_uri`, `invalid_scope`, `no_camp_account`, `no_camp_access`, `onboarding_incomplete`, `pending_approval`, `unauthenticated`, `access_denied`. PKCE method: `S256` only. Lifetimes: auth code 5 min, access token 24 h, refresh 30 days. `displayName` fallback: displayName ?? primaryEmail ?? "You".
**Validation & rules:**
- `safeNext`: only `/`-prefixed values accepted; empty/absolute/protocol-relative (`//`) → `/`.
- Unknown `client_id` → 400 `unknown_client`; unregistered `redirect_uri` → 400 `invalid_redirect_uri` (rendered, not redirected).
- Gate order: parse → client/scope → session → camp profile → access (no_camp_access > onboarding_incomplete > pending_approval).
- God-email bypasses all gates. PKCE mandatory. POST redirects use meta-refresh+JS (not 302) due to CSP `form-action 'self'`; all values HTML-escaped.
**Do-not-drop:** All-or-nothing single coarse scope with explicit Approve/Deny gating the full app spine (access → onboarding → approval); no per-scope or `aiDataConsent` toggle exists here. Orphaned/test-only: `redactIdDocuments` and the four scope predicates have no production caller; `isAllowedRedirectUri` and PKCE `plain` are unused on this surface.
