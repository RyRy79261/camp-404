# 02 — Auth shells — sign-in / sign-up / recovery

**Files covered:**
- `apps/web/app/auth/page.tsx` — bare `/auth` landing; post-OAuth verifier exchange lands here, forwards authed users home, others to `/auth/sign-in`.
- `apps/web/app/auth/[path]/page.tsx` — dynamic router for every `/auth/<path>`; dispatches `sign-up` / `sign-in` to bespoke forms and all other paths to Neon Auth's hosted `<AuthView>`.
- `apps/web/app/auth/sign-in-form.tsx` — bespoke email/password + Google sign-in form (`SignInForm`).
- `apps/web/app/auth/sign-up-form.tsx` — bespoke email/password + Google sign-up form (`SignUpForm`).
- `apps/web/components/auth-shell.tsx` — centred card chrome (`AuthShell`) wrapping the bespoke forms; optional Back button + footer.
- `apps/web/app/providers.tsx` — client `Providers` mounting `NeonAuthUIProvider` (drives `<AuthView>` navigation, theming, session-change refresh).
- Supporting (followed imports): `apps/web/lib/auth-client.ts` (`authClient`), `apps/web/lib/auth.ts` (`getAuthenticatedUser` / `getAuthenticatedUserOrRedirect`), `apps/web/lib/neon-auth.ts` (server `auth` instance), `apps/web/proxy.ts` (verifier→cookie middleware), `apps/web/app/api/auth/[...path]/route.ts` (Better Auth API handler), `apps/web/lib/test-mode.ts` + `apps/web/app/api/test/login/route.ts` (E2E bypass), `apps/web/app/landing-hero.tsx` (unauth entry CTA into the flow).

**Purpose:** The auth shells are the unauthenticated entry surface of Camp 404. They let a person create an account (email/password or Google) or sign in (email/password or Google), and they hand off password-recovery / reset / callback / sign-out / magic-link side-trips to Neon Auth's hosted UI. Sign-up is deliberately **open** — there is no invite-code field here; invite-only enforcement happens *after* auth at the `/signup/required` gate (unit 03), because Neon Auth (Google especially) creates an identity at sign-in time and cannot be blocked earlier. After a successful credential or social handshake the user is forwarded to `/` (home), which runs the gating spine (unit 23) to route them onward to `/signup/required`, `/onboarding/questionnaire`, or `/pending-approval` as required.

## Features

### Bare `/auth` landing (`app/auth/page.tsx`)
- Server component, `export const dynamic = "force-dynamic"` (`page.tsx:6`) — must read the session cookie set moments earlier by the proxy verifier exchange, so it cannot be statically prerendered.
- This is the path Neon Auth's social (Google) callback returns to with `?neon_auth_session_verifier=…` (`page.tsx:9-14`). The proxy middleware (`proxy.ts`) runs on `/auth` *before* this page, exchanges the verifier for a real session cookie, and only then renders this component. Without a page at `/auth`, Next would 404 the post-OAuth landing (`page.tsx:13-14`).
- Calls `getAuthenticatedUser()` (`page.tsx:21`):
  - If a user exists → `redirect("/")` (home, which routes onward) (`page.tsx:22`).
  - Otherwise → `redirect("/auth/sign-in")` (`page.tsx:23`).

### Dynamic auth path router (`app/auth/[path]/page.tsx`)
- Server component, `export const dynamic = "force-dynamic"`; `dynamicParams` left at default `true` so any auth subpath Neon Auth redirects to (error states, provider-specific paths) renders via the `<AuthView>` fallback rather than 404ing (`[path]/page.tsx:7-10`).
- Awaits `params` (`{ path: string }`, a Promise — Next 16 async params) (`[path]/page.tsx:12-17`).
- **`path === "sign-up"`** → renders `<AuthShell hideBack><SignUpForm /></AuthShell>` (`[path]/page.tsx:19-28`). Comment: sign-up is open; invite check happens post-auth at `/signup/required` (`[path]/page.tsx:20-22`).
- **`path === "sign-in"`** → renders `<AuthShell hideBack><Suspense fallback={null}><SignInForm /></Suspense></AuthShell>` (`[path]/page.tsx:30-38`). `SignInForm` is wrapped in `<Suspense>` because it reads `useSearchParams()`.
- **Any other `path`** (forgot-password, reset-password, callback, sign-out, magic-link, provider/error paths) → fallback to Neon Auth hosted UI: `<main …><AuthView path={path} /></main>` (`[path]/page.tsx:43-47`). Comment: "side trips we haven't (yet) built bespoke screens for" (`[path]/page.tsx:40-42`). Fallback `<main>` classes: `mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-center justify-center px-6 py-12`.
- `<AuthView>` imported from `@neondatabase/auth/react/ui` (`[path]/page.tsx:2`).

### Sign-in form (`app/auth/sign-in-form.tsx`)
- `"use client"` component `SignInForm`. Mirrors the intake-tracker `login-04` block; deliberately **no invite-code field** (`sign-in-form.tsx:11-15`).
- Reads `callbackURL` from `useSearchParams().get("callbackURL")`, sanitised via `safeCallbackUrl()` (`sign-in-form.tsx:26-27`).
- Subscribes to `authClient.useSession()` for `session` + `sessionPending` (`sign-in-form.tsx:28`).
- **Auto-forward effect** (`sign-in-form.tsx:38-43`): once session is no longer pending, if `session?.user` exists AND `callbackURL !== "/"`, calls `window.location.replace(callbackURL)`. Handles the social return-trip landing back here with an active session + a non-default `callbackURL` (without it the user would see the form despite being authenticated).
- **Email/password submit** (`handleSubmit`, `sign-in-form.tsx:45-77`): trims email; local validation (see Validation §); on pass calls `authClient.signIn.email({ email: trimmedEmail, password, callbackURL })`; on `result.error` sets the message (fallback `"Sign in failed"`) and clears loading; on success `router.replace(callbackURL)` then `router.refresh()`; `catch` shows `err.message` or `"Sign in failed"`.
- **Google sign-in** (`handleGoogle`, `sign-in-form.tsx:79-94`): clears error, sets loading, calls `authClient.signIn.social({ provider: "google", callbackURL: "/auth" })`. The return trip is always routed through `/auth` so the proxy verifier exchange fires before the session is read; `/auth/page.tsx` then forwards home (`sign-in-form.tsx:83-89`). `catch` → `"Google sign in failed"`.
- Fields: Email (`type="email"`, `autoComplete="email"`, placeholder `you@example.com`, `required`), Password (`type="password"`, `autoComplete="current-password"`, `required`). Both `disabled` while `loading`.
- "Forgot your password?" link → `/auth/forgot-password` (`sign-in-form.tsx:122-127`).
- Heading "Welcome back"; subtext "Sign in to your Camp 404 account." (`sign-in-form.tsx:99-102`).
- Submit button label: `"Signing in…"` while loading else `"Sign in"` (`sign-in-form.tsx:147`).
- "Or continue with" divider; outline button "Continue with Google" with inline `GoogleMark` SVG (`sign-in-form.tsx:150-169`, `174-188`).

### Sign-up form (`app/auth/sign-up-form.tsx`)
- `"use client"` component `SignUpForm`. Mirrors intake-tracker `login-04` block (`sign-up-form.tsx:11-17`).
- **No name field is asked.** Name is sent silently as the email to satisfy Better Auth's required `name` field; Camp 404's `displayName` is reconciled later from the burner profile if needed (`sign-up-form.tsx:13-17`, `49`).
- Local state: `email`, `password`, `confirmPassword`, `error`, `loading` (`sign-up-form.tsx:19-24`). No `useSession`/auto-forward effect (unlike sign-in) and no `callbackURL` query reading.
- **Email/password submit** (`handleSubmit`, `sign-up-form.tsx:26-63`): trims email; local validation incl. password-match (see Validation §); calls `authClient.signUp.email({ email: trimmedEmail, password, name: trimmedEmail, callbackURL: "/" })`; on `result.error` sets message (fallback `"Sign up failed"`); on success `router.replace("/")` then `router.refresh()`; `catch` → `"Sign up failed"`.
- **Google sign-up** (`handleGoogle`, `sign-up-form.tsx:65-81`): identical to sign-in's — `authClient.signIn.social({ provider: "google", callbackURL: "/auth" })`; comment notes `/auth` lands the verifier exchange, then home routes onward to the questionnaire (`sign-up-form.tsx:69-76`). `catch` → `"Google sign up failed"`.
- Fields: Email (`type="email"`, `autoComplete="email"`, placeholder `you@example.com`, `required`); Password (`type="password"`, `autoComplete="new-password"`, `required`); Confirm password (`type="password"`, `autoComplete="new-password"`, `required`). All `disabled` while `loading`.
- Heading "Create your account"; subtext "Set a password or continue with Google. We'll ask the rest in the questionnaire." (`sign-up-form.tsx:86-90`).
- Submit button label: `"Creating account…"` while loading else `"Create account"` (`sign-up-form.tsx:140`).
- "Or continue with" divider + outline "Continue with Google" + `GoogleMark` (`sign-up-form.tsx:143-162`).
- Footer: "Already have an account? Sign in" linking `/auth/sign-in` (`sign-up-form.tsx:164-172`).

### Auth shell chrome (`components/auth-shell.tsx`)
- `"use client"` `AuthShell({ children, className?, footer?, hideBack? })` (`auth-shell.tsx:10-29`). The login-04 shadcn block mirrored from intake-tracker; used by every credential/invite/handshake screen (`auth-shell.tsx:19-23`).
- Outer wrapper: `flex min-h-svh flex-col items-center justify-center bg-[color:var(--color-muted)] p-6 md:p-10` (`auth-shell.tsx:33`).
- Inner column: `w-full max-w-sm` merged with optional `className` via `cn()` (`auth-shell.tsx:34`).
- **Back button** rendered only when `!hideBack`: `Button variant="ghost" size="sm"` with `ArrowLeft` lucide icon + "Back" label; `onClick={() => router.back()}` (`auth-shell.tsx:35-47`). The bespoke sign-in/sign-up screens pass `hideBack` so it is suppressed for them.
- Card: `<Card className="overflow-hidden p-0"><CardContent className="p-6 md:p-8">{children}</CardContent></Card>` (`auth-shell.tsx:48-50`).
- Optional **footer** hint under the card: `<p className="px-6 pt-4 text-center text-xs …">{footer}</p>` (`auth-shell.tsx:51-55`). Passed live by the downstream invite gate: `footer="Camp 404 is invite-only."` (`signup/required/page.tsx:30`).

### Auth UI provider (`app/providers.tsx`)
- `"use client"` `Providers({ children })` mounting `<NeonAuthUIProvider>` from `@neondatabase/auth/react/ui` (`providers.tsx:3,10-24`).
- Props passed: `authClient={authClient}`, `navigate={router.push}`, `replace={router.replace}`, `onSessionChange={() => router.refresh()}`, `redirectTo="/"`, `Link={Link}` (Next `Link`) (`providers.tsx:14-21`).
- This provider powers the hosted `<AuthView>` fallback (navigation, redirect target, session-change refresh). It is mounted in the **root layout** wrapping all children alongside `<AcknowledgementGate />` and `<FeedbackGate aiAvailable={!!process.env.ANTHROPIC_API_KEY} />` (`app/layout.tsx:50-56`). `next-themes` (via this provider) sets `class="dark"` on `<html>` on the client; `suppressHydrationWarning` on `<html>` silences the mismatch (`app/layout.tsx:45-48`).

### Verifier→cookie proxy middleware (`proxy.ts`)
- `export default auth.middleware({ loginUrl: "/auth/sign-in" })` (`proxy.ts:10`). Runs Neon Auth's verifier-to-cookie exchange. **Only place** the exchange runs — without it social sign-in returns with a `session_verifier` in the URL but no session cookie ever gets set (`proxy.ts:3-5`).
- `config.matcher = ["/auth", "/auth/:path*", "/mcp/:path*"]` (`proxy.ts:12-18`). `/auth/*` covers the sign-in/sign-up round-trip; `/mcp/*` is the post-signin landing for the MCP OAuth flow (out of scope here). Protected routes do their own session check in their server components via `getAuthenticatedUser()` (`proxy.ts:6-9`).

### Better Auth API handler (`app/api/auth/[...path]/route.ts`)
- `export const { GET, POST } = auth.handler();` (`route.ts:8`) — catch-all proxying Better Auth's API surface: sign-in, sign-up, session, OAuth callbacks, etc. (`route.ts:3-7`). The bespoke forms' `authClient.signIn.email` / `signUp.email` / `signIn.social` calls hit `/api/auth/*` here.

### Server auth instance (`lib/neon-auth.ts`)
- `auth = createNeonAuth({ baseUrl, cookies: { secret, sameSite: "lax" } })` (`neon-auth.ts:25-35`). Cookie `sameSite: "lax"` (not strict) so cross-site top-level navigations carry the session cookie through the OAuth round-trip (`neon-auth.ts:29-33`).

### E2E test-mode auth bypass (`lib/test-mode.ts`, `app/api/test/login/route.ts`)
- `isE2ETestMode()` returns `process.env.E2E_TEST_MODE === "1"` (`test-mode.ts:11-13`). `TEST_USER_COOKIE = "camp404_test_user"` (`test-mode.ts:9`).
- `getAuthenticatedUser()` (`lib/auth.ts:25-37`): in E2E mode, reads `camp404_test_user` cookie (precedence, Neon Auth bypassed entirely); otherwise falls through to `auth.getSession()`. So in tests the bespoke forms are not exercised — auth is set directly via the cookie.
- `POST /api/test/login` (`api/test/login/route.ts:17-37`): gated on `isE2ETestMode()` (else 404); sets the `camp404_test_user` cookie (`httpOnly`, `secure` only in production, `sameSite: "lax"`, `path: "/"`, `maxAge: 60*60`). `DELETE` clears it. Production never sets `E2E_TEST_MODE`, so this route is never registered there (`test-mode.ts:3-7`).

## User actions & interactions
- **Enter the flow:** unauthenticated home renders `LandingHero` with a single CTA `<a href="/auth/sign-in">Are you lost?</a>` (`landing-hero.tsx:32-34`; contract pinned by `tests/e2e/home.spec.ts`).
- **Sign in (email/password):** type email + password, submit form / click "Sign in".
- **Sign in (Google):** click "Continue with Google" → OAuth → returns via `/auth`.
- **Sign up (email/password):** type email + password + confirm password, submit / click "Create account".
- **Sign up (Google):** click "Continue with Google" (same OAuth flow as sign-in).
- **Navigate sign-up ↔ sign-in:** "Already have an account? Sign in" link on sign-up (`/auth/sign-in`); no reciprocal link on sign-in (entry is only via landing CTA or direct URL).
- **Forgot password:** "Forgot your password?" link on sign-in → `/auth/forgot-password` → hosted `<AuthView path="forgot-password">`.
- **Recovery / reset / sign-out / magic-link / callback:** handled entirely by hosted `<AuthView>` for any `/auth/<path>` not equal to `sign-in`/`sign-up`.
- **Back:** `AuthShell` Back button (`router.back()`) — suppressed on sign-in/sign-up (`hideBack`); available on any shell mounted without `hideBack`.
- All inputs and both submit/Google buttons become **disabled while `loading`** during a submit attempt.

## States & presentations
Global-states rows that materialise on this surface:
- **Empty / initial:** fresh form, all fields blank, `error = null`, `loading = false`. Default render.
- **Loading / submitting:** `loading = true` — inputs + both buttons disabled; submit button text swaps to `"Signing in…"` / `"Creating account…"`.
- **Populated:** fields hold user-entered values (controlled inputs).
- **Validation-error:** `error` string set by local checks (empty email/password, mismatched passwords) → rendered in a `role="alert"` paragraph styled `text-[color:var(--color-destructive)]`; `loading` stays `false`, fields re-enabled.
- **Server error:** `result.error.message` (or fallback strings) or thrown-error message rendered in the same `role="alert"` slot; `loading` reset to `false`.
- **Success:** sign-in → `router.replace(callbackURL)` + `router.refresh()`; sign-up → `router.replace("/")` + `router.refresh()`; Google → browser navigates to OAuth and back through `/auth`.
- **Disabled:** the whole form (inputs + buttons) during in-flight submit.
- **Session-pending (sign-in only):** `useSession()` `isPending` short-circuits the auto-forward effect until the session resolves.
- **Already-authenticated re-render (sign-in only):** auto-forward effect `window.location.replace(callbackURL)` when a session exists with a non-default `callbackURL`.
- **`<Suspense fallback={null}>`** wraps `SignInForm` while `useSearchParams()` resolves (`[path]/page.tsx:33`).

Gating rows (invite-gated, onboarding-incomplete, pending-approval, rejected, captain-only-locked) are **NOT** expressed on this surface — sign-up is open and all post-auth gating lives downstream at `/`, `/signup/required`, `/onboarding/questionnaire`, `/pending-approval` (units 03 / 23). This surface only authenticates; it never inspects rank, invite, approval, or onboarding status.

## Enums, options & configurable values
- **Social provider:** `"google"` only (`signIn.social({ provider: "google" })`) — both forms (`sign-in-form.tsx:87`, `sign-up-form.tsx:73`).
- **Bespoke `[path]` branches:** `"sign-up"`, `"sign-in"`; everything else → hosted `<AuthView>` (`[path]/page.tsx:19,30,43`).
- **Fixed `callbackURL` targets:** Google sign-in/sign-up → `"/auth"`; email sign-up → `"/"`; email sign-in → the sanitised `?callbackURL` query (default `"/"`).
- **Hardcoded copy / labels:** Welcome back / Sign in to your Camp 404 account. / Signing in… / Sign in / Or continue with / Continue with Google / Forgot your password? / Create your account / Set a password or continue with Google. We'll ask the rest in the questionnaire. / Creating account… / Create account / Already have an account? / Sign in / Back / Are you lost? ($ awaiting input_) / Error 404 — Camp not found.
- **Input attributes:** email `type="email"` placeholder `you@example.com` autoComplete `email`; sign-in password autoComplete `current-password`; sign-up password + confirm autoComplete `new-password`; all `required`.
- **Local validation messages:** `"Email is required"`, `"Password is required"`, `"Passwords do not match"` (sign-up only).
- **Server-error fallback messages:** `"Sign in failed"`, `"Sign up failed"`, `"Google sign in failed"`, `"Google sign up failed"`.
- **`NeonAuthUIProvider` config:** `redirectTo="/"` (`providers.tsx:18`).
- **Proxy matcher:** `["/auth", "/auth/:path*", "/mcp/:path*"]`; `loginUrl: "/auth/sign-in"` (`proxy.ts:10,18`).
- **Cookie config:** server session `sameSite: "lax"` (`neon-auth.ts:33`); `TEST_USER_COOKIE="camp404_test_user"` with `maxAge: 60*60` (1 hour) (`api/test/login/route.ts:34`).
- **Env vars referenced:** `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` (≥32 chars), `E2E_TEST_MODE` (`==="1"`), `NODE_ENV`, `ANTHROPIC_API_KEY` (feedback gate, layout). Build placeholders: `PLACEHOLDER_BASE_URL="https://build-placeholder.neon-auth.invalid"`, `PLACEHOLDER_COOKIE_SECRET="build-placeholder-secret-build-placeholder-secret"` (50 chars) (`neon-auth.ts:21-23`).
- **`safeCallbackUrl` rules** (enumerated below in Validation): falsy → `/`; not starting with `/` → `/`; starting with `//` → `/`; else passthrough.

## Data model touched
This surface does **not** touch any Camp 404 Drizzle tables directly. It operates on the **Neon/Better Auth session/user**, read back into the app's `AuthenticatedUser` interface (`lib/auth.ts:13-17`):
- `AuthenticatedUser { id: string; primaryEmail: string | null; displayName: string | null }`.
- Mapped from `session.user`: `id ← session.user.id`, `primaryEmail ← session.user.email ?? null`, `displayName ← session.user.name ?? null` (`lib/auth.ts:30-36`).
- **Better Auth user fields written by the forms:** `email`, `password`, and `name` — where **`name` is set to the email string** on sign-up (`sign-up-form.tsx:49`). No first-class Camp 404 `name`/`displayName` is collected here; it is reconciled later from the burner profile.
- **`signIn.email` payload:** `{ email, password, callbackURL }`. **`signUp.email` payload:** `{ email, password, name, callbackURL }`. **`signIn.social` payload:** `{ provider, callbackURL }`.
- **E2E test user cookie** `camp404_test_user`: URL-encoded JSON `{ id, primaryEmail, displayName }` (`api/test/login/route.ts:22-35`); parsed shape requires non-empty string `id` (`lib/auth.ts:51-57`).
- Downstream camp tables (`camp_users`, `invite_codes`, `burner_profiles`, `required_actions`, etc.) are only touched by the gating spine on `/` (unit 23) and are out of scope here.

## Validation, edge cases & business rules
- **Sign-in local validation** (before any network call, `sign-in-form.tsx:49-57`): `email.trim()` must be non-empty (`"Email is required"`); `password` must be truthy (`"Password is required"`). No format/length checks beyond the browser's `type="email"` + `required`.
- **Sign-up local validation** (`sign-up-form.tsx:30-42`): same email + password presence checks, **plus** `password !== confirmPassword → "Passwords do not match"`. No minimum-length / strength rule is enforced client-side (server/Better Auth may impose its own).
- **`safeCallbackUrl(raw)` open-redirect guard** (`sign-in-form.tsx:17-22`): returns `"/"` if `raw` is null/undefined/empty; returns `"/"` if `raw` does not start with `"/"`; returns `"/"` if it starts with `"//"` (protocol-relative); otherwise returns `raw` verbatim. Prevents redirecting to off-site URLs after sign-in.
- **OAuth must round-trip through `/auth`:** both Google handlers force `callbackURL: "/auth"` so the proxy verifier→cookie exchange (`proxy.ts`) fires before any session read; landing directly on `/` would leave the user with a verifier but no session cookie (`sign-in-form.tsx:83-89`, `sign-up-form.tsx:69-76`, `proxy.ts:3-5`).
- **Sign-up is open by design:** no invite-code field; the comment explicitly states the invite gate is post-auth at `/signup/required` because Neon Auth/Google create an identity at sign-in time (`[path]/page.tsx:20-22`, `sign-in-form.tsx:11-15`).
- **`name` defaults to email** to satisfy Better Auth's required field — an intentional shortcut, reconciled later from the burner profile (`sign-up-form.tsx:13-17,49`).
- **Sign-in auto-forward edge case:** only forwards when `callbackURL !== "/"`; a default `"/"` callback is left to the normal submit `router.replace` so a returning social user with no explicit target still gets routed by home's gating spine (`sign-in-form.tsx:38-43`).
- **Error precedence:** `result.error.message` is preferred; fallback string used when message is absent; thrown errors use `err.message` when an `Error`, else the generic fallback.
- **`loading` lifecycle:** set `true` before the network call; reset to `false` only on the error/catch branches — on success the page navigates away (replace+refresh) so `loading` is intentionally never reset (component unmounts).
- **Dynamic rendering forced** on both `/auth` pages (`force-dynamic`) because they read the just-set session cookie; `[path]` keeps `dynamicParams` true so unknown auth subpaths fall to `<AuthView>` instead of 404 (`page.tsx:6`, `[path]/page.tsx:7-10`).
- **Build resilience:** `createNeonAuth` uses placeholder base URL + ≥32-char placeholder secret so `next build` succeeds without env vars; any real request without env vars fails loudly at the Neon Auth API (`neon-auth.ts:18-35`).
- **E2E bypass safety:** the whole test-mode login/bypass is gated on `E2E_TEST_MODE==="1"`, which production never sets, so `/api/test/login` returns 404 and the bespoke forms / Neon Auth path are used in prod (`test-mode.ts:3-13`, `api/test/login/route.ts:18-20`).

## Sub-components / variants
- **`SignInForm`** (`app/auth/sign-in-form.tsx`) — bespoke email/password + Google sign-in; the only form reading `?callbackURL` and `useSession()` (for the auto-forward effect).
- **`SignUpForm`** (`app/auth/sign-up-form.tsx`) — bespoke email/password + Google sign-up; adds Confirm-password field; sends `name = email`.
- **`GoogleMark`** — inline 24×24 single-`<path>` Google "G" SVG, `fill="currentColor"`, `aria-hidden`; **duplicated verbatim** in both `sign-in-form.tsx:174-188` and `sign-up-form.tsx:177-191` (two identical copies, not shared).
- **`AuthShell`** (`components/auth-shell.tsx`) — reusable card chrome. The `footer` prop **is live**: the downstream invite gate passes `footer="Camp 404 is invite-only."` (`signup/required/page.tsx:30`), which renders the centred hint under the card. `hideBack` is passed `true` by every current caller — the bespoke sign-in/sign-up branches (`[path]/page.tsx:19,30`) plus the downstream `pending-approval` and `signup/required` gate screens — so the Back button never renders in the live flow today. `AuthShell` is the shared chrome "used by every page that asks for credentials, an invite code, or a similar handshake".
- **`<AuthView path={path}>`** (from `@neondatabase/auth/react/ui`) — hosted Neon Auth UI catch-all rendering forgot-password, reset-password, callback, sign-out, magic-link, and any error/provider subpath; no bespoke screen exists for these.
- **`Providers` / `NeonAuthUIProvider`** (`app/providers.tsx`) — wires the hosted `<AuthView>` to Next routing + session refresh; mounted once in the root layout, not per-auth-page.
- **`LandingHero`** (`app/landing-hero.tsx`) — not part of the shells proper but the sole live entry point into `/auth/sign-in` for unauthenticated visitors (CTA "Are you lost?"); pure-presentational glitch hero, no auth logic.
- **Server-only handlers/validators feeding this surface:** `auth.handler()` (`app/api/auth/[...path]/route.ts`) for the Better Auth API; `auth.middleware()` (`proxy.ts`) for the verifier exchange; `getAuthenticatedUser` (`lib/auth.ts:25-37`) — the only auth reader `/auth/page.tsx` imports and calls (`auth/page.tsx:2,21`); its sibling `getAuthenticatedUserOrRedirect` (`lib/auth.ts:40-44`) is used not by `/auth/*` but by the downstream **protected** pages (e.g. `signup/required/page.tsx:23`), redirecting unauthenticated callers to `/auth/sign-in`; `createNeonAuth` config (`lib/neon-auth.ts`); E2E `POST/DELETE /api/test/login` (`app/api/test/login/route.ts`).
