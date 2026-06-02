# MCPConsent — organism plan

- **mapsTo + home:** **REUSE/EXTEND** (presentation redesign of a working, shipped
  flow — no functionality dropped). **Lives app-local in `apps/web`** per
  `component-library.md` ("keep app-local (`Shell`/`MCPConnectInner`) + raw server
  HTML"). This organism is NOT promoted to `@camp404/ui`: half of it is a `"use
  client"` React page and the other half is **raw server-rendered HTML emitted by an
  API route** (outside the Next/React/Tailwind shell), so it cannot live in a
  presentation-only package. The reusable presentation work it inherits lands in
  `@camp404/ui` leaves (Button, IconBadge, CodeDisplay, Card, OAuthButton, Alert);
  the pure model/gate logic lands in `@camp404/core`.
- **Target file(s):**
  - **Bridge (React, client):** `apps/web/app/mcp/connect/page.tsx`
    (`MCPConnectPage` / `MCPConnectInner` / `Shell` / `safeNext`).
  - **Consent + gate + redirect + error (raw HTML, server):**
    `apps/web/app/api/mcp/oauth/authorize/route.ts` (`GET` / `POST` + the HTML
    builders), with the redesigned builders optionally lifted to a sibling
    `apps/web/lib/mcp/consent-html.ts` (still app-resident — returns `NextResponse`).
  - **Pure view-models (NEW):** `packages/core/src/mcp/consent-view.ts`
    (`buildConsentModel` / `buildGateModel`).

> **MCPConsent is not one component but a two-screen flow that spans the React shell
> AND a raw-HTML API route.** The board (`S20 MCP connect`, board #29) draws two
> states: the Bridge Card (sign-in CTA) and the Consent Card (approved user). The
> redesign is **almost entirely presentation** — the OAuth 2.1 PKCE state machine,
> gate ladder, scope vocabulary, token lifetimes, and audit log are all built and
> correct (REUSE). Surface §"NEW schema": "None."

---

## Current state — what exists today

The flow is **shipped and working.** Two files implement it.

### Bridge page — `apps/web/app/mcp/connect/page.tsx` (verified, `"use client"`)
- `MCPConnectPage` (default export) — a `<Suspense fallback={<Shell>Loading…</Shell>}>`
  boundary wrapping `MCPConnectInner`.
- `MCPConnectInner` — reads `next` via `useSearchParams().get("next")` → `safeNext`,
  reads `authClient.useSession()` (`{ data: session, isPending }`), holds an `error`
  string in `useState`. A `useEffect` performs `window.location.replace(next)` once
  `!isPending && session?.user`. `onGoogle` calls
  `authClient.signIn.social({ provider: "google", callbackURL: window.location.href })`
  and sets `error` on failure.
- Three render branches: `isPending` → `<Shell>Checking session…</Shell>`;
  `session?.user` → `<Shell>Continuing to {next}…</Shell>`; otherwise the CTA branch:
  an `<h1>`, a `<p>`, a **raw `<button>`** with a verbose off-token class string
  (`mt-4 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-4 py-2 text-sm font-medium`,
  no `Button` atom, no Google mark), a conditional `<p role="alert" className="text-xs text-destructive">`,
  and a footnote `<a href="/auth/sign-in">`.
- `Shell` — `<main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center gap-4 px-6 py-12">`.
- `safeNext(raw)` — open-redirect guard: returns `/` unless `raw` starts with a single
  `/` (rejects empty, absolute, and `//` protocol-relative). **Has no dedicated test.**

### Consent route — `apps/web/app/api/mcp/oauth/authorize/route.ts` (verified, server)
- `AuthorizeQuery` (Zod, inline): `response_type` literal `"code"`, `client_id`,
  `redirect_uri` (URL), `code_challenge`, `code_challenge_method` enum `["S256"]`
  default `"S256"`, optional `scope`, optional `state`. `parseParams` over
  `URLSearchParams`.
- `resolveClientOrError(params)` — `findClient` → `unknown_client` errorPage;
  `redirect_uri` not in `client.redirectUris` → `invalid_redirect_uri` errorPage;
  scope (default `DEFAULT_SCOPE`) not `isAllowedScope` → `redirectError` (`invalid_scope`).
- `GET(req)` — parse → resolve client → `getAuthenticatedUser()`; no auth →
  `NextResponse.redirect` to `/mcp/connect?next=<encoded authorize URL>`;
  `findUserByAuthId` null → `no_camp_account` errorPage; runs `mcpAccessError({ hasCampAccess, profileComplete: !!profile?.completedAt, isApproved })` → on denial
  `errorPage(403, denied.error, denied.description)`; else `consentHtml(...)`.
- `POST(req)` — reads `formData`; rebuilds `URLSearchParams` minus `action`; reparses;
  resolves client; `action === "deny"` → `htmlRedirect` to
  `redirect_uri?error=access_denied[&state]` (no session/gate re-check); else
  re-checks `getAuthenticatedUser` (`401 unauthenticated` if gone), `findUserByAuthId`
  (`403 no_camp_account`), re-runs `mcpAccessError`, then `issueAuthCode(...)` →
  `htmlRedirect` to `redirect_uri?code=<code>[&state]`.
- **Inline HTML builders (the redesign surface):**
  - `escapeHtml(s)` — `& < > " '` escaping; run on every interpolation.
  - `consentHtml(opts)` — emits a `<!doctype html>` page: hard-coded neutral hex
    palette (`#0a0a0a` bg / `#fafafa` fg / `#171717` card / `#262626` border /
    `#a3a3a3` muted), a plain `<h1>` + two `<p>` + a `.scope` div (`<strong>Scope:</strong> mcp:user`)
    + a `<form method="POST">` with all OAuth params as hidden inputs + Deny/Approve
    `<button>`s. **This is the plain block the board replaces with the Identity /
    Requesting / Scope card.**
  - `htmlRedirect(target)` — meta-refresh + `window.location.replace` (CSP
    `form-action 'self'` drops cross-origin 302s — surface gotcha).
  - `buildRedirectUrl`, `redirectError`, `errorPage(status, error, description)` —
    `errorPage` is a minimal `<h1>`/`<p>` neutral page used for ALL 4xx/403/401
    branches (no styled gate card today).

### Backing `apps/web/lib/mcp/*` (verified)
- `access.ts` — **pure.** `mcpAccessError(state)` first-fail ladder
  `no_camp_access → onboarding_incomplete → pending_approval`. Tested
  (`__tests__/access.test.ts`). No `rejected` branch (both `pending`+`rejected` collapse).
- `oauth.ts` — `DEFAULT_SCOPE` (`"mcp:user"`), `isAllowedScope`, `findClient`,
  `issueAuthCode` (+ DB writers, TTLs). Mixes pure helpers with DB I/O.
- `scope.ts` / `consent.ts` / `tokens.ts` / `auth.ts` / `origin.ts` — scope
  derivation, `canSeeIdDocuments`, token crypto, bearer verify, origin — all REUSE
  (unit-29 / tool-surface territory, not redrawn here).
- `lib/users.ts` — `hasCampAccess(user, email)` / `isApproved(user, email)`
  (god-email short-circuit). REUSE.

**No test exists** for `authorize/route.ts` (consent HTML / gate ordering at route
level) or for the bridge page / `safeNext`.

---

## Composition — leaves, core helpers, services, server/client split

This organism has a hard **server/client + React/raw-HTML split**. Each half composes
differently.

### Bridge half — React, `"use client"` (`page.tsx`)
| Consumed | Plan | Role |
|---|---|---|
| `OAuthButton` | `components/molecule-oauthbutton.md` | Replaces the raw `<button>` — `<OAuthButton onClick={onGoogle} label="Sign in with Google" />` (outline Button + `GoogleMark`). The plan names `MCPConnectInner` as a direct consumer. |
| `Button` | `components/atom-button.md` | Composed *inside* `OAuthButton` (outline variant); also any future footnote-as-link if rendered via `Button variant="link"`. |
| `Card` + `CardContent` | `components/molecule-card.md` | The **Bridge Card** (`variant="default"`, `$card`/`$border`/`--radius`/pad 20/gap 16) wrapping the explanatory copy + Google button + footnote. Card lists `MCPConsent` as a consumer (403 gate Card row). |
| `Alert` | `components/molecule-alert.md` | The conditional **Error Region** — `tone="destructive"` (replaces today's `<p className="text-xs text-destructive">`; the OAuthButton plan notes the error `<p>` is the host's Alert, not part of the button). |
| `Spinner` (optional) | `components/atom-spinner.md` | Loading / "Checking session…" / auto-forward states may show a Spinner inside `Shell` (board has no explicit skeleton — Open Q #1). |

**Bridge core helpers:** `safeNext` is a **pure open-redirect guard** — it has no React
or `next/*` dependency. Per architecture §"Hybrid extraction", it MAY move to
`@camp404/core` (`core/mcp/safe-next.ts` or alongside the consent view-models) so it is
unit-testable; the surface flags it lacks a test today. Decision-light — keep call-site
stable either way.

**Bridge services / Next-coupled (stay in app):** `authClient.useSession` +
`authClient.signIn.social` (Better Auth client, auth domain — REUSE), `useSearchParams`
(`next/navigation`), `window.location.replace` (hard nav — REUSE, required because
`next` is an API route).

### Consent half — raw server HTML (`route.ts`)
The consent screen is **NOT a React component tree** — it is a string-template HTML
response. It therefore **cannot mount the React leaves**; instead it re-renders their
*structure and tokens* as inline-styled HTML. The leaf plans confirm this explicitly:
- IconBadge plan absorbs the MCP "Scope Icon Wrap" (`size="sm" shape="rounded" tone="accent" icon={Shield}`)
  and the "user avatar circle" (`size="sm" shape="circle" tone="primary" icon={User}`)
  — but as **markup the consent HTML reproduces**, not a mounted `<IconBadge>`.
- CodeDisplay plan: the MCP scope-string consumer is **explicitly out-of-scope for the
  React `CodeDisplay`** — "the raw HTML consent renders scope as a styled `<span>`, not
  a React component" — adopt the same mono token (`--text-mono`, JetBrains Mono 13/600)
  in the HTML.
- Button plan lists `MCPConsent` among Button consumers, but the Approve/Deny controls
  in the consent HTML are raw `<button name="action" value="approve|deny">` inside the
  `<form>` (so the POST carries `action`); they reproduce Button-Primary / Button-Outline
  *styling* in inline CSS.

**Consent core helpers (NEW, `packages/core/src/mcp/consent-view.ts` — pure):**
- `buildConsentModel(input) → ConsentViewModel` — computes the displayName fallback
  chain (`campUser.displayName ?? authUser.primaryEmail ?? "You"`), the requesting-client
  name (`client.clientName` or "Claude"), the scope label (`mcp:user`) + description
  ("Read your basic profile"). The route's HTML template becomes a thin render over this
  tested model.
- `buildGateModel(denial) → GateViewModel` — maps an `mcpAccessError` denial to the gate
  presentation: which 403 variant (`pending_approval` → styled Lock card;
  `no_camp_access`/`onboarding_incomplete`/`no_camp_account` → styled-or-raw error per
  decision), and the message string.
- REUSE from `@camp404/core` post-extraction: `mcpAccessError`, `DEFAULT_SCOPE`,
  `isAllowedScope` (moved from `lib/mcp/access.ts` / `lib/mcp/oauth.ts` per service-layer
  plan §"Hybrid extraction").

**Consent services / Next-coupled (stay in app):**
- `getAuthenticatedUser()` (`@/lib/auth`, session — REUSE).
- `findUserByAuthId` + `getBurnerProfileByUserId` (`@camp404/db/burner-profile` — REUSE).
- `hasCampAccess` / `isApproved` (`@/lib/users` — REUSE, god-email bypass).
- `findClient` (`@/lib/mcp/oauth`, DB lookup against `mcp_oauth_clients` — REUSE).
- `issueAuthCode` (`@/lib/mcp/oauth`, writes `mcp_auth_codes`, TTL 5 min — REUSE; the
  **only table written by this surface**).
- The HTML builders `consentHtml` / `gateCardHtml` / `errorPageHtml` / `htmlRedirect`
  (return `NextResponse` → app-resident, EXTEND).

**Server-component vs "use client" split:** the bridge is `"use client"` (session hooks +
`window` nav). The consent/approve/deny path is **not a component at all** — it is a route
handler (`GET`/`POST`) emitting HTML. There is no React server component in this organism.

---

## API & data flow

### Bridge (`/mcp/connect`)
- **Inputs (query):** `next` (string, sanitised by `safeNext` → `/`-prefixed only).
- **Reads (client):** Better Auth session via `authClient.useSession()`.
- **Receives vs fetches:** the bridge receives nothing server-side; it reads the live
  session client-side and reflects state.
- **State flow:** `isPending` → "Checking session…"; `session?.user` → effect fires
  `window.location.replace(next)` (auto-forward); no session → CTA. `error` is local
  state set by a failed `signIn.social`.
- **Action:** `onGoogle` → `authClient.signIn.social({ provider:"google", callbackURL: window.location.href })`. Better Auth returns to *this* page (gotcha); the session
  effect performs the actual forward — do not rely on `callbackURL`.

### Consent (`GET /api/mcp/oauth/authorize`)
- **Inputs (query → `AuthorizeQuery`):** `response_type` (`"code"`), `client_id`,
  `redirect_uri`, `code_challenge`, `code_challenge_method` (`"S256"` only at this
  endpoint), optional `scope` (defaults `mcp:user`, validated vs `ALLOWED_SCOPES`),
  optional `state` (passed through).
- **Fetches (server):** client row (`findClient`), session (`getAuthenticatedUser`),
  camp user (`findUserByAuthId`), burner profile (`getBurnerProfileByUserId`).
- **Computes:** `buildConsentModel` (displayName fallback, client name, scope copy) /
  `buildGateModel` (gate variant) over `mcpAccessError`.
- **Output:** styled Consent Card HTML, or a styled 403 Gate Card / errorPage / redirect.

### Approve/Deny (`POST /api/mcp/oauth/authorize`) — form action + validation
- **Form:** a `<form method="POST" action="/api/mcp/oauth/authorize">` whose hidden
  inputs carry **all 7 OAuth params** (`response_type`, `client_id`, `redirect_uri`,
  `code_challenge`, `code_challenge_method`, `scope`, `state`); the two submit buttons
  carry `name="action" value="approve|deny"`.
- **Validation:** re-`parseParams` the rebuilt `URLSearchParams` (minus `action`);
  re-`resolveClientOrError`.
- **Deny:** no session/gate re-check — `htmlRedirect` to `redirect_uri?error=access_denied[&state]`.
- **Approve:** re-check session (`401 unauthenticated` if expired), camp user, re-run
  `mcpAccessError` (gate fail → `403`), then `issueAuthCode` → `htmlRedirect` to
  `redirect_uri?code=<code>[&state]`.
- **Escaping:** `escapeHtml` on every interpolation; `htmlRedirect` JSON-encodes the
  target for the inline `<script>` (open-redirect & XSS defence).

---

## States — full matrix + gating

### Bridge page (`/mcp/connect`)
| State | Trigger | Presentation |
|---|---|---|
| **loading** | `Suspense` fallback / `isPending` | `Shell` "Loading…" / "Checking session…" (optional Spinner — Open Q #1) |
| **signed-in-forward** | `session?.user && !isPending` | `Shell` "Continuing to {next}…"; `window.location.replace(next)` |
| **sign-in-CTA** | no session | Bridge **Card**: copy + `OAuthButton` ("Sign in with Google") + footnote |
| **sign-in-error** | `signIn.social` returns error | Bridge Card + **Alert** `tone="destructive"` (replaces inline `<p>`) |
| **disabled/submitting** | while `signIn.social` is in flight | `OAuthButton disabled` (consumer-owned; prevents double-fire) |

### Consent screen (`GET …/authorize`) — incl. global gate matrix
Gate ordering (first-fail wins), god-email bypasses 1 & 3 unconditionally:
| State | Gate / trigger | Presentation |
|---|---|---|
| **validation-error** | bad/missing `AuthorizeQuery` params | `errorPage(400, "invalid_request", …)` |
| **unknown-client** | `client_id` not in `mcp_oauth_clients` | `errorPage(400, "unknown_client", …)` (NOT a redirect — target untrusted) |
| **bad-redirect-uri** | `redirect_uri` ∉ `client.redirectUris` | `errorPage(400, "invalid_redirect_uri", …)` (NOT a redirect) |
| **invalid-scope** | scope ∉ `ALLOWED_SCOPES` | redirect-back `?error=invalid_scope` (URI now validated) |
| **no-session** | no Better Auth session | redirect to `/mcp/connect?next=<encoded authorize URL>` |
| **no-camp-account** | signed in, no `users` row | `errorPage(403, "no_camp_account", …)` (styled or raw — Open Q #1) |
| **no-camp-access** *(gate 1)* | `!hasCampAccess` | `errorPage(403, "no_camp_access", …)` (styled or raw — Open Q #1) |
| **onboarding-incomplete** *(gate 2)* | `!profileComplete` (`!profile?.completedAt`) | `errorPage(403, "onboarding_incomplete", …)` (styled or raw — Open Q #1) |
| **pending/rejected approval** *(gate 3)* | `!isApproved` (both `pending` AND `rejected` collapse) | **403 Gate Card** — Lock-Wrap (`IconBadge` markup `tone="muted" icon={Lock}`) + "A captain still needs to approve your account before you can connect Claude." |
| **consent-prompt** | all gates pass | **Consent Card** — Identity Row + Requesting Row + Scope Row + Approve/Deny |

### Consent Card anatomy (the drawn happy path)
- **Identity Row:** avatar circle (`IconBadge` markup `tone="primary" shape="circle" size="sm" icon={User}`, `#ff008c2e → primary/18%`) + "Signed in as {displayName}" (Inter 16/700).
- **Requesting Row:** "Requesting access" label (Inter 13/muted) + client name (Inter 14/600).
- **Scope Row:** `$muted` pill — scope icon wrap (`IconBadge` markup `tone="accent" shape="rounded" size="sm" icon={Shield}`, `#00dcff26 → accent/15%`) + `mcp:user` (**JetBrains Mono 13/600**, CodeDisplay-readonly token treatment) + "Read your basic profile" (Inter 12/muted).
- **Footer Buttons:** Deny (outline) + Approve (primary), full-width, inside the `<form>`.

### POST approve/deny
| State | Trigger | Outcome |
|---|---|---|
| **deny** | `action=deny` | `htmlRedirect` → `redirect_uri?error=access_denied[&state]`; no re-check |
| **session-expired-on-approve** | session gone GET→POST | `errorPage(401, "unauthenticated", "Session expired. Try again.")` |
| **gate-fail-on-approve** | `mcpAccessError` returns denial | `errorPage(403, <code>, <desc>)` |
| **approve-success** | all checks pass | `issueAuthCode` → `htmlRedirect` → `redirect_uri?code=<code>[&state]` |
| **redirect-intermediary** | after any `htmlRedirect` | meta-refresh + JS: "Redirecting… Continue if not redirected." |

### Preview-but-locked note (captain/rank surface relevance)
This surface is **rank-aware only via the approval gate**, not via the CaptainLock
preview-but-locked grammar. There is **no preview-but-locked rendering here** — an
un-approved member is *blocked* from issuing a token (the 403 Gate Card / errorPage is a
hard stop, by security necessity: a token must not be minted for a gated user). This is
the one place where withholding access is correct rather than "render structure, no
data." Do not convert the 403 gate to a CaptainLock preview — it is a token-issuance
guard, not an in-app navigation gate. (The `pending`/`rejected` collapse is a known
divergence — Open Q #2.)

---

## Build steps — ordered, with prerequisites + acceptance + tests

> **Prerequisites (must land first):** Phase 0 foundations (status tokens
> `success`/`warning`/`info`, `--radius`, `--text-*` + `--font-*` incl. `--font-mono`)
> — gates IconBadge/Alert/CodeDisplay token treatment. Phase 1 `@camp404/core` scaffold.
> Phase 3 MCP pure-helper extraction (`mcpAccessError`/`DEFAULT_SCOPE`/`isAllowedScope`
> → `core/mcp/*`). Leaf plans that must land: `atom-button.md`, `atom-iconbadge.md`,
> `molecule-card.md`, `molecule-alert.md`, `molecule-oauthbutton.md`,
> `molecule-codedisplay.md` (token treatments only — the consent HTML reproduces, not
> mounts, IconBadge/CodeDisplay). Bridge half needs the *built* React leaves; consent
> half needs only their token/markup contract.

1. **Decision pass (blocks presentation work).** Resolve the MCP Open Qs
   (architecture §"Open decisions" #6; surface §"Open questions"): #1 style-vs-raw the 3
   extra 403/401 branches; #2 distinct `rejected` message; #3 `redactIdDocuments`
   delete-vs-wire; #4 the 4 capability predicates; #6 `aiDataConsent` in-app placement;
   #7 footnote destination (sign-in vs sign-up vs unified). **Owner:** product + lead
   architect. **Acceptance:** each Q has a recorded yes/no in `_analysis/decisions.md`.
   **Test:** n/a (planning gate).

2. **Add pure view-models — `packages/core/src/mcp/consent-view.ts`.** `buildConsentModel`
   (displayName fallback, client name, scope label `mcp:user` + "Read your basic
   profile") and `buildGateModel` (403 variant selection + message; honour the #2
   `rejected` decision). **Prereq:** Phase 3 MCP extraction (so `mcpAccessError`/scope
   consts live in `core`). **Acceptance:** view-models are pure (no `next`/db/React);
   the route's HTML becomes a thin render over them. **Test (NEW):** unit test covering
   the displayName chain (`displayName → primaryEmail → "You"`), scope copy, every gate
   variant incl. `rejected`.

3. **Extract & test `safeNext`.** Move `safeNext` to `@camp404/core` (or keep app-local
   if the decision is to defer) and add the dedicated unit test it lacks. **Acceptance:**
   `safeNext` rejects empty / absolute / `//` and passes `/`-prefixed values; call-site
   in `page.tsx` unchanged. **Test (NEW):** `safeNext` unit test (empty, `/x`, `//evil`,
   `https://evil`, `/`).

4. **Redesign the consent HTML — `consentHtml(model)`.** Implement the Consent Card per
   surface §"Layout & modules.2": Identity Row (avatar circle `primary/18%` + user icon
   + "Signed in as {displayName}"), Requesting Row, Scope Row (`accent/15%` icon wrap +
   shield + mono `mcp:user` 13/600 + "Read your basic profile"), Approve (primary) /
   Deny (outline) buttons inside the existing `<form method="POST">` with all 7 hidden
   OAuth inputs. Add an inline `:root` OKLCH variable block resolving the brand tokens
   (raw API HTML can't read the Tailwind `@theme` — Open Q #5; reproduce IconBadge /
   CodeDisplay tokens as inline CSS). Keep `escapeHtml` on every interpolation.
   **Prereq:** step 2 + leaf token contracts. **Acceptance:** rendered HTML contains the
   Identity/Requesting/Scope rows + both buttons + all 7 hidden inputs; XSS strings in
   `clientName`/`displayName` are escaped; approve/deny POST behaviour byte-for-byte
   unchanged. **Test (NEW — none exists):** route-level test asserting `GET` HTML
   structure + escaping (mock `findClient`/access/scope).

5. **Styled 403 Gate Card + error branches — `gateCardHtml(model)` / `errorPageHtml`.**
   `pending_approval` → Lock-Wrap card (`IconBadge` markup `tone="muted" icon={Lock}` +
   message) per surface §"403 Gate Card". Per the #1 decision, route the other 403/401
   branches through a shared styled `errorPageHtml` or leave them raw. Wire `GET`/`POST`
   to call `buildGateModel(denied)` → `gateCardHtml`/`errorPageHtml`. **Prereq:** steps
   2 & 4. **Acceptance:** `pending_approval` renders the Lock card; other branches render
   per decision; gate ordering still `no_camp_access → onboarding_incomplete →
   pending_approval`; god-email bypass intact. **Test:** route test driving each gate
   state via mocked `hasCampAccess`/`profileComplete`/`isApproved`; assert deny path
   re-check-free.

6. **Redesign the bridge — `apps/web/app/mcp/connect/page.tsx`.** Apply surface §1:
   Bridge `Card` (`$card`/`$border`/`--radius`/pad 20/gap 16) with explanatory copy;
   replace the raw `<button>` with `<OAuthButton onClick={onGoogle} label="Sign in with
   Google" />`; replace the inline error `<p>` with `<Alert tone="destructive">`;
   footnote uses the #7-decided destination; optional Spinner in loading/forward states.
   **Keep** `safeNext`, the session effect, and `window.location.replace(next)`
   unchanged. **Prereq:** built `OAuthButton`/`Card`/`Alert`/`Button` React leaves +
   step 3. **Acceptance:** all three presentations render; Google button fires
   `signIn.social` and is `disabled` while pending; error region appears on failure;
   `safeNext` still rejects `//`/absolute. **Test:** component test for render states +
   the `safeNext` unit test from step 3.

7. **(If Open Q #6 = yes) In-app `aiDataConsent` control — cross-domain.** A
   settings/profile toggle reading/writing `users.aiDataConsent` + `aiDataConsentAt`,
   reusing the `tools/identity.ts:set_my_ai_consent` write semantics (set timestamp on
   enable, clear on disable) via a shared `get/setAiDataConsent` app helper. **Owned by
   the profile/settings surface**, called out here because the data + tool semantics live
   in this domain; storage already exists (no schema change). **Acceptance:** member can
   toggle consent in-app without Claude; flag round-trips; `aiDataConsentAt` set/cleared.
   **Test:** data-access/unit test for the shared writer.

8. **(If Open Q #2 = yes) Distinct `rejected` message.** Add a `rejected` branch to
   `mcpAccessError` in `core` ("Your access request was declined.") and thread it through
   `buildGateModel`. **Acceptance:** rejected users see the distinct message; pending
   unchanged. **Test:** extend the step-2 / `access` unit tests.

---

## Consumers — which surfaces mount it

| Surface | Spec | Mount |
|---|---|---|
| **MCP connect bridge** | `surfaces/17-mcp-connect.md` §1 | `apps/web/app/mcp/connect/page.tsx` — the `MCPConnectPage`/`MCPConnectInner`/`Shell` React tree (sign-in bridge: loading / auto-forward / CTA / error). |
| **MCP consent / approve / deny** | `surfaces/17-mcp-connect.md` §2 + §"POST" | `apps/web/app/api/mcp/oauth/authorize/route.ts` — the `GET` consent HTML + 403 Gate Card / errorPage, and the `POST` approve/deny redirects (raw server HTML, outside the React shell). |

No other surface mounts MCPConsent. It is the **single human-facing leg of the MCP OAuth
2.1 PKCE flow**; downstream the token endpoint, `/register`, well-known metadata, and the
`[transport]` MCP server + tool surface (unit 29) consume what it mints (auth codes →
tokens) but are not redesigned and do not mount this organism. The only reusable
presentation it shares outward is the `IconBadge` / `CodeDisplay` / `Button` / `Card` /
`Alert` / `OAuthButton` leaves (mounted directly in the bridge; reproduced as inline-CSS
markup in the consent HTML).
