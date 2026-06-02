# 17-mcp-connect — app integration plan

- **Route(s):** `/mcp/connect` (sign-in bridge · `"use client"` routed page) ·
  `GET /api/mcp/oauth/authorize` (consent render · raw-HTML route handler) ·
  `POST /api/mcp/oauth/authorize` (approve/deny · raw-HTML route handler)
- **Surface brief:** [design/spec/surfaces/17-mcp-connect.md](../../surfaces/17-mcp-connect.md)
- **Component plans consumed:**
  - [organism-mcpconsent.md](../components/organism-mcpconsent.md) (the spanning organism)
  - [molecule-oauthbutton.md](../components/molecule-oauthbutton.md)
  - [molecule-card.md](../components/molecule-card.md)
  - [molecule-alert.md](../components/molecule-alert.md)
  - [atom-button.md](../components/atom-button.md)
  - [atom-iconbadge.md](../components/atom-iconbadge.md) (reproduced as markup in consent HTML, not mounted)
  - [molecule-codedisplay.md](../components/molecule-codedisplay.md) (token treatment only — explicitly out-of-scope for the React component on the consent HTML)
  - [atom-spinner.md](../components/atom-spinner.md) (optional, bridge loading/forward)
- **Service-layer plan:** [08-mcp.md](../service-layer/08-mcp.md)
- **Architecture ref:** [architecture.md](../architecture.md) §Layering, §Hybrid extraction, §`@camp404/core`

> **This is a REDESIGN of a shipped, working flow.** The OAuth 2.1 PKCE state
> machine, gate ladder, scope vocabulary, token lifetimes, PKCE crypto, and audit
> log are all built and correct. Surface §"NEW schema": **"None."** The delta is
> **almost entirely presentation** — the consent screen HTML (raw, out-of-shell) and
> the bridge page (`"use client"`) — plus a small pure-logic extraction into
> `@camp404/core`. There is **no preview-but-locked / CaptainLock treatment here**:
> the approval gate is a hard token-issuance stop, by security necessity (see §Gating).

---

## Current state — the existing route/files today

The flow is **shipped and working**, implemented across exactly two route files plus
their backing `apps/web/lib/mcp/*` and `apps/web/lib/{auth,users}` modules. All paths
below are verified against the live tree.

### Files today

| File | Role | Disposition |
|---|---|---|
| `apps/web/app/mcp/connect/page.tsx` | `"use client"` bridge: `MCPConnectPage` (Suspense boundary, default export, line 17), `MCPConnectInner` (lines 25–83), `Shell` (lines 85–91), `safeNext` (lines 93–98) | **MODIFY** (presentation) |
| `apps/web/app/api/mcp/oauth/authorize/route.ts` | Server route handler: `AuthorizeQuery` (Zod, lines 21–29), `parseParams` (33–35), `resolveClientOrError` (37–58), `GET` (64–112), `POST` (118–187), and the inline HTML builders `escapeHtml`/`consentHtml`/`htmlRedirect`/`buildRedirectUrl`/`redirectError`/`errorPage` (193–314) | **MODIFY** (consent HTML + gate card) |
| `apps/web/lib/mcp/access.ts` | **pure** `mcpAccessError(state)` first-fail ladder `no_camp_access → onboarding_incomplete → pending_approval`; no `rejected` branch (both collapse). Tested. | **MODIFY** (move to `@camp404/core`) |
| `apps/web/lib/mcp/oauth.ts` | `DEFAULT_SCOPE` (`"mcp:user"`, line 13), `isAllowedScope` (16), `isAllowedRedirectUri` (27), `findClient` (99), `issueAuthCode` (129) + TTL consts (8–10) + DB writers. Mixes pure helpers w/ DB I/O. | **MODIFY** (extract pure parts to `core`; DB writers stay) |
| `apps/web/lib/users.ts` | `hasCampAccess(user, email)` (line 219: `isGodEmail(email) || !!user.inviteCode`), `isApproved(user, email)` (231: `isGodEmail(email) || approvalStatus === "approved"`) | **REUSE** (god-email bypass; bodies extracted to `core` by plan 01 with thin shims — not this surface's edit) |
| `apps/web/lib/auth.ts` | `getAuthenticatedUser(): Promise<AuthenticatedUser \| null>` (line 35); `AuthenticatedUser.primaryEmail` (15); E2E seam via `isE2ETestMode()` + `TEST_USER_COOKIE` (line 6, 36) | **REUSE** |
| `apps/web/lib/auth-client.ts` | `authClient` (`createAuthClient()`, line 14) — `useSession` / `signIn.social` | **REUSE** |
| `apps/web/lib/mcp/{scope,consent,tokens,auth,origin}.ts` | scope derivation, `canSeeIdDocuments`, token crypto, bearer verify, origin — unit-29 / tool-surface territory | **REUSE** (not redrawn by this surface; pure parts move to `core` via plan 08 step 1) |

### Bridge page detail (`page.tsx`, verified)
- `MCPConnectInner` reads `next = safeNext(useSearchParams().get("next"))`,
  `{ data: session, isPending } = authClient.useSession()`, an `error` string in
  `useState`. A `useEffect` (lines 31–36) calls `window.location.replace(next)` once
  `!isPending && session?.user` — a **hard nav** (not `router.push`) because `next`
  points at an API route the App Router cannot reach.
- `onGoogle` (38–45) calls
  `authClient.signIn.social({ provider: "google", callbackURL: window.location.href })`
  and sets `error` on failure. (Note the Better-Auth gotcha: sign-in returns to *this*
  page, not the explicit `callbackURL`; the session effect does the actual forward.)
- Three render branches: `isPending` → `<Shell>Checking session…</Shell>` (47–49);
  `session?.user` → `<Shell>Continuing to {next}…</Shell>` (51–53); else the CTA branch
  (55–82): `<h1>Connect Claude to Camp 404</h1>`, a `<p>` explainer, a **raw `<button>`**
  with an off-token class string (lines 62–68 — no `Button` atom, no `GoogleMark`), a
  conditional `<p role="alert" className="text-xs text-destructive">` (69–73), and a
  footnote `<a href="/auth/sign-in">Sign in first</a>` (74–80). **Note:** current
  footnote copy reads "New to Camp 404? Sign in first — you'll enter your invite code
  once you're in." (slightly different from the brief's "Sign in" link text; reconcile
  under Open Q #7).
- `Shell` = `<main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center gap-4 px-6 py-12">`.
- `safeNext(raw)` open-redirect guard: returns `/` unless `raw` starts with a single
  `/` (rejects empty / absolute / `//` protocol-relative). **Has no dedicated test.**

### Consent route detail (`route.ts`, verified)
- `GET`: `parseParams` → `resolveClientOrError` (unknown client / bad redirect URI →
  `errorPage`; bad scope → `redirectError`) → `getAuthenticatedUser()` (none →
  `NextResponse.redirect` to `/mcp/connect?next=<encoded authorize URL>`, lines 79–84)
  → `findUserByAuthId` (null → `errorPage(403, "no_camp_account", …)`) →
  `getBurnerProfileByUserId` + `mcpAccessError({ hasCampAccess, profileComplete: !!profile?.completedAt, isApproved })`
  (denial → `errorPage(403, denied.error, denied.description)`) → `consentHtml(...)`.
- `POST`: reads `formData`, rebuilds `URLSearchParams` minus `action`, re-`parseParams`,
  re-`resolveClientOrError`. `action === "deny"` → `htmlRedirect` to
  `redirect_uri?error=access_denied[&state]` (**no session/gate re-check**). Else
  re-check session (`401 unauthenticated` if gone), `findUserByAuthId` (`403
  no_camp_account`), re-run `mcpAccessError`, then `issueAuthCode(...)` → `htmlRedirect`
  to `redirect_uri?code=<code>[&state]`.
- The inline `consentHtml` (202–257) is today a plain `<h1>`/`<p>`/`.scope` block with a
  hard-coded neutral hex palette (`#0a0a0a`/`#fafafa`/`#171717`/`#262626`/`#a3a3a3`).
  `errorPage` (298–314) is the minimal neutral page used for **all** 4xx/403/401 branches
  — no styled gate card exists today. `htmlRedirect` (264–277) is meta-refresh + JS (CSP
  `form-action 'self'` drops cross-origin 302s — surface gotcha). Every interpolation
  runs through `escapeHtml`; `htmlRedirect` JSON-encodes the target for the inline
  `<script>`.

### Tests today
- `apps/web/lib/mcp/__tests__/{access,scope,consent,tokens}.test.ts` exist (pure
  helpers). **No test** exists for `authorize/route.ts` (consent HTML / gate ordering at
  the route level), the bridge page, or `safeNext`.
- No `error.tsx`, `not-found.tsx`, or `loading.tsx` exists under
  `apps/web/app/mcp/connect/` or `apps/web/app/api/mcp/oauth/authorize/`.

### What the redesign changes
1. **Consent HTML** → Identity Row + Requesting Row + styled Scope Row + Approve
   (primary) / Deny (outline) card (surface §"Layout & modules.2"). Stays raw server
   HTML (out of the Next/React/Tailwind shell), so this is a string-template rewrite, not
   a React component.
2. **403 Gate Card** → styled Lock-Wrap card for the `pending_approval` branch (surface
   §"403 Gate Card"); the other 403/401 branches styled-or-raw per Open Q #1 (D47).
3. **Bridge page** → Bridge `Card` + `OAuthButton` (replaces raw `<button>`) + `Alert`
   error region (replaces inline `<p>`) + footnote per Open Q #7. Logic unchanged.
4. **Pure extraction** → `mcpAccessError` / `DEFAULT_SCOPE` / `isAllowedScope` move to
   `@camp404/core`; NEW `buildConsentModel` / `buildGateModel` view-models; optional
   `safeNext` move. The route + page keep stable call-sites (thin renders/shims).

---

## File structure — target files in `apps/web`

| File | Status vs today | Notes |
|---|---|---|
| `apps/web/app/mcp/connect/page.tsx` | **MODIFY** | `"use client"`. CTA branch reworked: Bridge `Card` + `OAuthButton` + `Alert`; footnote per Open Q #7. **Keep** `safeNext`, the session `useEffect`, `window.location.replace(next)`, `useSearchParams`, `authClient` usage unchanged. Default export `MCPConnectPage` stays the Suspense boundary. |
| `apps/web/app/api/mcp/oauth/authorize/route.ts` | **MODIFY** | `GET`/`POST` keep their control flow; swap `consentHtml`/`errorPage` internals for the redesigned renderers; delegate gate-variant selection to the pure `buildGateModel`; consent-model fields (displayName chain, client name, scope copy) come from `buildConsentModel`. |
| `apps/web/lib/mcp/consent-html.ts` | **CREATE (optional)** | Lift the HTML builders (`consentHtml(model)`, `gateCardHtml(model)`, `errorPageHtml(status,error,description)`, `htmlRedirect(target)`, the shared inline-`:root` OKLCH block) out of the route into an app-resident sibling that returns `NextResponse`. Keeps the route thin. May stay inline in the route if preferred — equivalent. |
| `packages/core/src/mcp/consent-view.ts` | **CREATE** | NEW pure view-models `buildConsentModel` / `buildGateModel` (see §Services & data). |
| `packages/core/src/mcp/{access,scopes}.ts` | **CREATE** (move) | `mcpAccessError` + `DEFAULT_SCOPE`/`isAllowedScope` moved from `apps/web/lib/mcp/*` (plan 08 step 1; lands in Phase 3). |
| `apps/web/lib/mcp/access.ts` | **DELETE-or-shim** | Symbol moves to `core/mcp/access.ts`; route imports from `core`. (Other `lib/mcp/*` modules — `scope`/`consent`/`tokens`/`oauth`/`auth`/`origin` — EXTEND/REUSE per plan 08, not detailed here.) |
| `apps/web/app/mcp/connect/error.tsx` | **NONE (no CREATE)** | No route-level error boundary exists today and the brief does not request one. The bridge handles its own error state inline (Alert). Do not add. |
| `apps/web/app/mcp/connect/loading.tsx` | **NONE (no CREATE)** | Loading is handled by the in-component `Suspense` fallback (`<Shell>Loading…</Shell>`) and `isPending` branch — no `loading.tsx` needed. |
| consent-route error/not-found | **N/A** | The authorize route is a handler, not a page — it emits its own HTML for every branch (`errorPage`/`gateCardHtml`); no Next error/not-found boundaries apply. |

No files are **DELETED** at the route level. The presentation organism is **not**
promoted to `@camp404/ui` (organism plan §1: half is a `"use client"` page, half is raw
server HTML — cannot live in a presentation-only package). Only the reusable *leaves*
(Button, OAuthButton, Card, Alert, IconBadge, CodeDisplay) and the pure model/gate logic
are extracted.

---

## Components composed

| Component | Plan | Render context | Where / role |
|---|---|---|---|
| `OAuthButton` (Google) | [molecule-oauthbutton.md](../components/molecule-oauthbutton.md) | **Client** (bridge) | Replaces the raw `<button>` (page.tsx 62–68): `<OAuthButton onClick={onGoogle} label="Sign in with Google" />` (outline `Button` + `GoogleMark`, `#4285F4` "G"). The OAuthButton plan names `MCPConnectInner` as a direct consumer; it owns the `disabled` while-pending state. |
| `Button` | [atom-button.md](../components/atom-button.md) | **Client** (bridge, inside OAuthButton); **markup** (consent HTML) | Composed inside `OAuthButton` (outline). In the consent HTML the Approve/Deny controls are raw `<button name="action" value="approve\|deny">` inside the `<form>` that **reproduce** Button-Primary / Button-Outline styling in inline CSS — not mounted React. |
| `Card` + `CardContent` | [molecule-card.md](../components/molecule-card.md) | **Client** (bridge) | The **Bridge Card** (`variant="default"`, `$card`/`$border`/`--radius`/pad 20/gap 16) wrapping the explainer + Google button + footnote. The consent card + 403 Gate Card are **reproduced** as inline-CSS HTML, not mounted. |
| `Alert` | [molecule-alert.md](../components/molecule-alert.md) | **Client** (bridge) | The conditional **Error Region** — `tone="destructive"` (replaces page.tsx 69–73's inline `<p>`). The OAuthButton plan notes the error `<p>` is the host's Alert, not part of the button. |
| `Spinner` (optional) | [atom-spinner.md](../components/atom-spinner.md) | **Client** (bridge) | Optional inside `Shell` for loading / "Checking session…" / auto-forward states (board has no explicit skeleton — Open Q #1/D47). |
| `IconBadge` | [atom-iconbadge.md](../components/atom-iconbadge.md) | **Markup only** (consent HTML) | The consent HTML *reproduces* IconBadge structure/tokens inline: Identity avatar circle (`tone="primary" shape="circle" size="sm" icon={User}`, `#ff008c2e → primary/18%`); Scope icon wrap (`tone="accent" shape="rounded" size="sm" icon={Shield}`, `#00dcff26 → accent/15%`); 403 Lock-Wrap (`tone="muted" icon={Lock}`). **Not mounted** — the raw HTML cannot host React. |
| `CodeDisplay` | [molecule-codedisplay.md](../components/molecule-codedisplay.md) | **Token treatment only** (consent HTML) | The CodeDisplay plan explicitly excludes the React component here: the consent HTML renders `mcp:user` as a styled `<span>` adopting the mono token (`--text-mono`, JetBrains Mono 13/600), not a mounted `<CodeDisplay>`. |

**Server-component vs client split:** The bridge is `"use client"` (session hooks +
`window` nav). The consent/approve/deny path is **not a React component at all** — it is
a route handler (`GET`/`POST`) emitting raw HTML strings. There is **no React server
component** anywhere in this surface, and no canvas organism (TopChrome / SectionHeader /
DetailHeader / GridTile / EmptyState / CaptainLock) is used (surface §"Components used").

---

## Services & data

### Bridge half (`/mcp/connect`, client)
| Service / API | Source | Role |
|---|---|---|
| `authClient.useSession()` | `apps/web/lib/auth-client.ts` (Better Auth) | Reads `{ data: session, isPending }` client-side. REUSE. |
| `authClient.signIn.social({ provider:"google", callbackURL })` | `apps/web/lib/auth-client.ts` | `onGoogle` action. REUSE. (Gotcha: returns to current page; session effect forwards.) |
| `useSearchParams()` | `next/navigation` | Reads `next`. |
| `window.location.replace(next)` | browser | Hard nav forward (required — `next` is an API route). |
| `safeNext(raw)` | `page.tsx` today (pure) → **optionally** `@camp404/core` (`core/mcp/safe-next.ts`) | Open-redirect guard. Pure; MAY move to `core` to gain a unit test (lacks one today). Decision-light — keep call-site stable. |

The bridge **fetches nothing server-side** — no props, no DB read. It reflects the live
client session.

### Consent half (`GET`/`POST /api/mcp/oauth/authorize`, server) — fetched server-side
| Function | Source | Class | Role |
|---|---|---|---|
| `getAuthenticatedUser()` | `apps/web/lib/auth.ts:35` | REUSE | Session check (consent gate); `null` → redirect to bridge. |
| `findUserByAuthId(authUser.id)` | `@camp404/db/burner-profile` | REUSE | Camp `users` row; `null` → `no_camp_account`. |
| `getBurnerProfileByUserId(campUser.id)` | `@camp404/db/burner-profile` | REUSE | `profileComplete = !!profile?.completedAt`. |
| `hasCampAccess(campUser, authUser.primaryEmail)` | `@/lib/users:219` | REUSE | Gate 1 (god-email bypass). |
| `isApproved(campUser, authUser.primaryEmail)` | `@/lib/users:231` | REUSE | Gate 3 (god-email bypass). |
| `findClient(client_id)` | `@/lib/mcp/oauth:99` | REUSE | Client lookup (`mcp_oauth_clients`); validates `redirect_uri ∈ client.redirectUris`. |
| `issueAuthCode(input)` | `@/lib/mcp/oauth:129` | REUSE | **The only table written by this surface** — `mcp_auth_codes`, TTL 5 min. |
| `mcpAccessError(state)` | `@/lib/mcp/access` → **`@camp404/core` `core/mcp/access.ts`** | MOVE | First-fail gate ladder. |
| `DEFAULT_SCOPE` / `isAllowedScope(scope)` | `@/lib/mcp/oauth` → **`@camp404/core` `core/mcp/scopes.ts`** | MOVE | Scope default + validation (pure parts split from DB writers). |
| `buildConsentModel(input) → ConsentViewModel` | **`@camp404/core` `core/mcp/consent-view.ts`** | **NEW** | Pure: displayName fallback `campUser.displayName ?? authUser.primaryEmail ?? "You"`, requesting-client name (`client.clientName` else "Claude"), scope label `mcp:user` + "Read your basic profile". The route's HTML becomes a thin render over this. |
| `buildGateModel(denial) → GateViewModel` | **`@camp404/core` `core/mcp/consent-view.ts`** | **NEW** | Pure: maps an `mcpAccessError` denial to which 403 variant (`pending_approval` → styled Lock card; `no_camp_account`/`no_camp_access`/`onboarding_incomplete` → styled-or-raw per Open Q #1) + the message. |
| `consentHtml` / `gateCardHtml` / `errorPageHtml` / `htmlRedirect` | route (or NEW `apps/web/lib/mcp/consent-html.ts`) | EXTEND/NEW | Return `NextResponse` → stay app-resident. Render the pure models into the redesigned card markup + inline `:root` OKLCH block. |

**Server vs props:** Everything on the consent half is fetched **server-side** in the
route handler — nothing is passed as props (it is not a React tree). The bridge half
passes **no props** and fetches nothing server-side (client session only).

**Tables:** reads `users`, `mcp_oauth_clients`, `burner_profiles` (per surface §"Data &
enums"); **writes only `mcp_auth_codes`** on approve. No schema change (surface §"NEW
schema": None).

---

## Gating

**Gate level: rank-aware via the approval gate ONLY — NOT a preview-but-locked /
CaptainLock surface.**

This surface re-runs the same gating spine that protects the app (camp access →
onboarding complete → captain approval), but **as a hard token-issuance stop**, not as a
preview. The gate order (first-fail wins), god-email bypassing 1 & 3 unconditionally:

1. `no_camp_access` — `!hasCampAccess` (no invite code, not god email)
2. `onboarding_incomplete` — `!profileComplete` (`!profile?.completedAt`)
3. `pending_approval` — `!isApproved` (covers both `pending` AND `rejected` —
   both collapse to the same message today; Open Q #2 / D48)

**Preview-but-locked does NOT apply here.** Per organism plan §"Preview-but-locked
note": an un-approved member is *blocked* from issuing a token — the 403 Gate Card /
`errorPage` is a hard stop, by security necessity (a token must not be minted for a gated
user). This is the one place where withholding access is correct rather than "render
structure, no data." **Do not** convert the 403 gate to a `CaptainLock` preview; it is a
token-issuance guard, not an in-app navigation gate. The `CaptainLock` preview-but-locked
grammar (architecture §`@camp404/core`, decisions.md §3) is reserved for `/captains/*`
in-app surfaces, none of which this is.

**403 Gate Card (the one board-drawn gate state, `pending_approval`):** `$muted` /
`$border` / r:$radius / pad:16 / gap:14 / `ai:center`; Lock-Wrap circle (`w:40 h:40 r:20
fill:$card`) with lock icon (`$muted-foreground`) — reproduced as IconBadge markup
`tone="muted" icon={Lock}`; text "A captain still needs to approve your account before
you can connect Claude." (Inter 13/normal). The other 403/401 branches render via the
generic `errorPage` today; styled-or-raw is Open Q #1 (D47).

The bridge page itself (`/mcp/connect`) is **pre-gate** — it only proves a live session.
It performs no rank check.

---

## States

### Bridge page (`/mcp/connect`)
| State | Trigger | Presentation |
|---|---|---|
| **loading** | `Suspense` fallback / `isPending` | `Shell` "Loading…" / "Checking session…" (optional `Spinner` — Open Q #1) |
| **signed-in-forward** | `session?.user && !isPending` | `Shell` "Continuing to {next}…"; `window.location.replace(next)` |
| **sign-in-CTA** | no session | Bridge `Card`: explainer copy + `OAuthButton` ("Sign in with Google") + footnote |
| **sign-in-error** | `signIn.social` returns error | Bridge Card + `Alert` `tone="destructive"` (replaces inline `<p>`) |
| **submitting / disabled** | while `signIn.social` is in flight | `OAuthButton disabled` (consumer-owned; prevents double-fire) |

### Consent screen (`GET …/authorize`) — incl. global gate matrix
| State | Gate / trigger | Presentation |
|---|---|---|
| **validation-error** | bad/missing `AuthorizeQuery` params | `errorPage(400, "invalid_request", …)` |
| **unknown-client** | `client_id` ∉ `mcp_oauth_clients` | `errorPage(400, "unknown_client", …)` (NOT a redirect — target untrusted) |
| **bad-redirect-uri** | `redirect_uri` ∉ `client.redirectUris` | `errorPage(400, "invalid_redirect_uri", …)` (NOT a redirect) |
| **invalid-scope** | scope ∉ `ALLOWED_SCOPES` | redirect-back `?error=invalid_scope` (URI now validated) |
| **no-session** | no Better Auth session | redirect to `/mcp/connect?next=<encoded authorize URL>` |
| **no-camp-account** | signed in, no `users` row | `errorPage(403, "no_camp_account", …)` (styled or raw — Open Q #1) |
| **no-camp-access** *(gate 1)* | `!hasCampAccess` | `errorPage(403, "no_camp_access", …)` (styled or raw — Open Q #1) |
| **onboarding-incomplete** *(gate 2)* | `!profileComplete` | `errorPage(403, "onboarding_incomplete", …)` (styled or raw — Open Q #1) |
| **pending/rejected approval** *(gate 3)* | `!isApproved` (both collapse) | **403 Gate Card** — Lock-Wrap + "A captain still needs to approve your account…" |
| **consent-prompt (success)** | all gates pass | **Consent Card** — Identity Row + Requesting Row + Scope Row + Approve/Deny |

### Consent Card anatomy (drawn happy path)
- **Identity Row:** avatar circle (IconBadge markup `tone="primary" shape="circle"
  size="sm" icon={User}`, `primary/18%`) + "Signed in as {displayName}" (Inter 16/700).
- **Requesting Row:** "Requesting access" (Inter 13/muted) + client name (Inter 14/600).
- **Scope Row:** `$muted` pill — scope icon wrap (IconBadge markup `tone="accent"
  shape="rounded" size="sm" icon={Shield}`, `accent/15%`) + `mcp:user` (JetBrains Mono
  13/600) + "Read your basic profile" (Inter 12/muted).
- **Footer Buttons:** Deny (outline) + Approve (primary), full-width, inside the
  `<form method="POST">` carrying all 7 OAuth params as hidden inputs.

### POST approve/deny
| State | Trigger | Outcome |
|---|---|---|
| **deny** | `action=deny` | `htmlRedirect` → `redirect_uri?error=access_denied[&state]`; **no re-check** |
| **session-expired-on-approve** | session gone GET→POST | `errorPage(401, "unauthenticated", "Session expired. Try again.")` |
| **gate-fail-on-approve** | `mcpAccessError` returns denial | `errorPage(403, <code>, <desc>)` |
| **approve-success** | all checks pass | `issueAuthCode` → `htmlRedirect` → `redirect_uri?code=<code>[&state]` |
| **redirect-intermediary** | after any `htmlRedirect` | meta-refresh + JS: "Redirecting… Continue if not redirected." |

---

## Build steps

> **Prerequisites (must land first):**
> - **Phase 0 foundations** (status tokens `success`/`warning`/`info`, `--overlay`,
>   `--radius`, `--text-*` + `--font-*` incl. `--font-mono`) — gate IconBadge / Alert /
>   CodeDisplay / Card token treatment.
> - **Phase 1** `@camp404/core` scaffold.
> - **Phase 3** MCP pure-helper extraction (`mcpAccessError` / `DEFAULT_SCOPE` /
>   `isAllowedScope` → `core/mcp/*`; plan 08 step 1) — keep unit-29 tool-route imports
>   green; move existing tests with the code.
> - **Phase 5** built React leaves for the bridge: `OAuthButton`, `Card`, `Alert`,
>   `Button`, (optional `Spinner`). The consent half needs only their **token/markup
>   contract** (it reproduces, not mounts, IconBadge / CodeDisplay).
> - **MEMORY: green-CI-is-done** — each step below is an independently green-CI change;
>   do not strand post-green follow-ups. The pure extraction (step 1) lands as its own
>   change.

1. **Pure extraction (plan 08 step 1; Phase 3).** Move `mcpAccessError` →
   `core/mcp/access.ts`; `DEFAULT_SCOPE`/`isAllowedScope` → `core/mcp/scopes.ts`. Repoint
   the route's imports (lines 9–15) to `@camp404/core`. Relocate the existing
   `access.test.ts` (+ scope/consent/tokens) to `packages/core`. **Prereq:** Phase 1
   core scaffold. **Acceptance:** moved tests pass unchanged in new home; `tsc`+`lint`
   green across `apps/web` + `packages/core`; no `next/*` / `@camp404/db` import in
   `core`; unit-29 routes still import green. **Test:** existing vitest re-run.

2. **Decision pass (blocks presentation work).** Resolve the MCP Open Qs from
   open-questions.md: **D47** (style-vs-raw the 3 extra 403 + 401 branches), **D48**
   (distinct `rejected` message), **D49** (footnote destination), **C4** (`aiDataConsent`
   in-app placement), **C3** (`redactIdDocuments` delete-vs-wire), **E22** (4 capability
   predicates), **E23** (consent HTML OKLCH palette). **Owner:** product + lead architect
   (+ design for E23). **Acceptance:** each Q recorded yes/no in
   `_analysis/decisions.md`. **Test:** n/a (planning gate).

3. **Add pure view-models — `packages/core/src/mcp/consent-view.ts`.**
   `buildConsentModel` (displayName fallback chain, client name "Claude" default, scope
   label `mcp:user` + "Read your basic profile") and `buildGateModel` (403 variant +
   message; honour the D48 `rejected` decision). **Prereq:** step 1. **Acceptance:**
   view-models pure (no `next`/db/React); the route HTML becomes a thin render over them.
   **Test (NEW):** unit test covering displayName chain (`displayName → primaryEmail →
   "You"`), scope copy, and every gate variant incl. `rejected`.

4. **(Optional) extract & test `safeNext`.** Move to `@camp404/core` (or keep app-local
   if deferred) and add the dedicated unit test it lacks. **Acceptance:** rejects empty /
   `//evil` / `https://evil`, passes `/x` and `/`; call-site in `page.tsx` unchanged.
   **Test (NEW):** `safeNext` unit test.

5. **Redesign the consent HTML — `consentHtml(model)`.** Implement the Consent Card per
   surface §"Layout & modules.2": Identity Row (avatar circle `primary/18%` + user icon +
   "Signed in as {displayName}"), Requesting Row, Scope Row (`accent/15%` icon wrap +
   shield + mono `mcp:user` 13/600 + "Read your basic profile"), Approve (primary) / Deny
   (outline) inside the existing `<form method="POST">` with all 7 hidden OAuth inputs.
   Add an inline `:root` OKLCH variable block (E23 — raw API HTML can't read the Tailwind
   `@theme`). Keep `escapeHtml` on every interpolation; `htmlRedirect` JSON-encode
   unchanged. **Prereq:** step 3 + leaf token contracts. **Acceptance:** rendered HTML
   contains Identity/Requesting/Scope rows + both buttons + all 7 hidden inputs; XSS
   strings in `clientName`/`displayName` escaped; approve/deny POST behaviour
   byte-identical. **Test (NEW — none exists):** route-level test asserting `GET` HTML
   structure + escaping (mock `findClient`/access/scope).

6. **Styled 403 Gate Card + error branches.** `gateCardHtml(model)` for
   `pending_approval` (Lock-Wrap card per surface §"403 Gate Card"); per the D47 decision
   route the other 403/401 branches through a shared styled `errorPageHtml` or leave raw.
   Wire `GET`/`POST` to call `buildGateModel(denied)` → `gateCardHtml`/`errorPageHtml`.
   **Prereq:** steps 3 & 5. **Acceptance:** `pending_approval` renders the Lock card;
   other branches per decision; gate ordering still `no_camp_access → onboarding_incomplete
   → pending_approval`; god-email bypass intact; deny path still re-check-free. **Test:**
   route test driving each gate state via mocked `hasCampAccess`/`profileComplete`/`isApproved`.

7. **Redesign the bridge — `apps/web/app/mcp/connect/page.tsx`.** CTA branch: Bridge
   `Card` (`$card`/`$border`/`--radius`/pad 20/gap 16) with explainer copy; replace the
   raw `<button>` (62–68) with `<OAuthButton onClick={onGoogle} label="Sign in with
   Google" />`; replace the inline error `<p>` (69–73) with `<Alert tone="destructive">`;
   footnote uses the D49-decided destination; optional `Spinner` in loading/forward
   states. **Keep** `safeNext`, the session effect, `window.location.replace(next)`, and
   the `callbackURL: window.location.href` arg unchanged. **Prereq:** built
   `OAuthButton`/`Card`/`Alert`/`Button` leaves + step 4. **Acceptance:** all three
   presentations render; Google button fires `authClient.signIn.social` and is `disabled`
   while pending; error region appears on failure; `safeNext` still rejects `//`/absolute.
   **Test:** component test for render states + the step-4 `safeNext` unit test.

8. **(If D48 = yes) Distinct `rejected` message.** Add a `rejected` branch to
   `mcpAccessError` in `core` ("Your access request was declined.") and thread through
   `buildGateModel`. **Acceptance:** rejected users see the distinct message; pending
   unchanged. **Test:** extend the step-3 / `access` unit tests.

9. **(If C4 = yes) In-app `aiDataConsent` control — cross-domain, NOT this surface.** A
   settings/profile toggle reading/writing `users.aiDataConsent` + `aiDataConsentAt`,
   reusing `tools/identity.ts:set_my_ai_consent` write semantics via a shared
   `get/setAiDataConsent` app helper. **Owned by the profile/settings surface**; called
   out here because the data + tool semantics live in this domain (storage already exists,
   no schema change). **Acceptance:** member can toggle in-app without Claude; flag
   round-trips; `aiDataConsentAt` set/cleared. **Test:** data-access/unit test for the
   shared writer.

### E2E / test notes
- **E2E_TEST_MODE seam:** the consent gate's `getAuthenticatedUser()`
  (`apps/web/lib/auth.ts:35`) branches on `isE2ETestMode()` (reads
  `E2E_TEST_MODE === "1"`) and a `TEST_USER_COOKIE` (`camp404_test_user`). An E2E run can
  drive the **consent screen** with a synthetic authed user (skipping Google) and force
  each gate state by minting a test user with the relevant `inviteCode` / `approvalStatus`
  / `completedAt`. The **bridge** uses `authClient.useSession()` client-side, which the
  E2E synthetic cookie also satisfies (signed-in-forward branch).
- **No route test exists today** for `authorize/route.ts` — steps 5–6 introduce the first
  ones (mock `findClient`/`hasCampAccess`/`profileComplete`/`isApproved`/`mcpAccessError`).
- **Deny re-check-free invariant** must be asserted in the POST route test (deny does not
  call `getAuthenticatedUser` again).

---

## Open items

Cross-referenced from [open-questions.md](../../open-questions.md) and surface §"Open
questions / build reconciliations". None are blocking for the OAuth flow itself (it is
correct and shipped); all gate **presentation** decisions.

1. **D47 / Surface OQ#1 — Missing branch designs.** Style the 3 extra 403 branches
   (`no_camp_account`, `no_camp_access`, `onboarding_incomplete`), the 401
   session-expired, and the loading/checking-session bridge state as styled in-app pages,
   or keep them as raw `errorPage` HTML (consistent with current code)? Only
   `pending_approval` is board-styled. **Owner:** product + design. **Blocks steps 6–7.**
2. **D48 / Surface OQ#2 — Rejected vs pending collapse.** Both statuses surface "A
   captain still needs to approve…". Add a distinct `rejected` branch ("Your access
   request was declined.")? **Owner:** product. (Step 8 gated on this.)
3. **D49 / Surface OQ#7 — Footnote destination.** Today links to `/auth/sign-in` with
   copy "Sign in first — you'll enter your invite code once you're in". Someone who never
   had an account should land on a sign-up path. Confirm sign-in vs sign-up vs unified.
   **Owner:** product. (Step 7.)
4. **E23 / Surface OQ#5 — Consent HTML token palette.** Raw HTML uses hard-coded hex
   (`#0a0a0a`/`#fafafa`/`#171717`/`#262626`). Emit an inline `:root` OKLCH block resolving
   the brand tokens (`primary/18%`, `accent/15%`, `#4285F4` Google, mono `mcp:user`
   13/600), or accept the hex divergence for this out-of-shell surface? **Owner:** design +
   eng. (Step 5.)
5. **C4 / Surface OQ#6 — `aiDataConsent` discoverability.** The flag is only set/read via
   the `set_my_ai_consent`/`get_my_ai_consent` MCP tools — first-time users have no in-app
   way to opt in before connecting. Confirm a discoverable in-app control (cross-domain,
   profile/settings surface). **Owner:** product + eng. (Step 9.)
6. **C3 / Surface OQ#3 — `redactIdDocuments` wiring.** Unwired in production (`people.ts`
   gates directly on `canSeeIdDocuments`). Delete (test-only) or wire. **Owner:** eng.
   (Not this surface's UI; tool-surface / unit-29 hardening.)
7. **E22 / Surface OQ#4 — Four orphaned scope predicates.** `canReadTeamOps`,
   `canWriteTeam`, `canApproveCrossTeam`, `canAdmin` have no production callers. Keep for a
   future tool surface or remove? **Owner:** eng. (Not this surface's UI.)
8. **E12 / metadata.title** — out of this surface's authorize route (roster approval gate
   page), noted only because it shares the "pending/rejected" copy concern with D48.
