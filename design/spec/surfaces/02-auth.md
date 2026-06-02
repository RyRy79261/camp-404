# Auth (sign-in / sign-up) — functional brief

- **Route(s):** `/auth/sign-in`, `/auth/sign-up`; bare `/auth` (verifier exchange landing); `/auth/<any-other-path>` (hosted fallback)
- **Canonical board(s):** `S02 Auth` (board #11, 430×-, `design/.spec-extract/boards/11-s02-auth.txt`)
- **Superseded / dropped:** nothing dropped; the board is a single iteration covering both bespoke forms and their states panel
- **Breakpoints:** mobile-first 430px (board canonical); shell chrome widens to `max-w-sm` (`w-full max-w-sm`) inside the outer column; outer column `p-6` → `md:p-10`; `<AuthView>` fallback uses `max-w-md`; no layout change between breakpoints beyond padding

---

## Purpose

The sole unauthenticated entry surface. Lets a visitor create an account (email/password or Google) or sign in (email/password or Google). Deliberately carries no invite-code field and enforces no membership gate — sign-up is open because Neon Auth / Google create an identity at OAuth time and cannot be blocked earlier. All post-auth gating (invite-only check, onboarding, pending-approval, captain rank) lives downstream on `/` (unit 23) and `/signup/required` (unit 03). This surface only authenticates.

Recovery, reset, sign-out, magic-link, callback, and all other auth side-trips are handed to the hosted `<AuthView>` fallback; no bespoke screen exists for them.

---

## Layout & modules

The surface is a narrow centred column rendered by `AuthShell`. Both bespoke forms (`SignInForm`, `SignUpForm`) are mounted inside `AuthShell` with `hideBack` — the Back button is suppressed for these two paths. The shell background is `$muted`; the inner card is `$card` with `$border` stroke and `$radius` rounding — one visual elevation step above the page surface, matching the login-04 pattern used throughout the app.

### AuthShell chrome

Outer: `flex min-h-svh flex-col items-center justify-center bg-[color:var(--color-muted)] p-6 md:p-10`.
Inner column: `w-full max-w-sm`.
Back button: `Button variant="ghost" size="sm"` with lucide `ArrowLeft` + label "Back"; `onClick={() => router.back()}`. Hidden on both sign-in and sign-up (`hideBack` prop).
Card: `<Card className="overflow-hidden p-0"><CardContent className="p-6 md:p-8">{children}</CardContent></Card>`.
Optional footer hint: `<p className="px-6 pt-4 text-center text-xs …">{footer}</p>` — not used on sign-in or sign-up (used downstream by the invite gate).

### Sign-in card (`/auth/sign-in`)

Vertical layout, `gap:14`, `pad:20` inside the card content.

| Region | Content |
|---|---|
| Header | "Welcome back" [Inter/18px/700/$card-foreground]; "Sign in to your Camp 404 account." [Inter/13px/normal/$muted-foreground] |
| Email field | `<InputField>` label "Email", placeholder `you@example.com`, `type="email"`, `autoComplete="email"`, `required` |
| Password field | `<InputField>` label "Password", placeholder `••••••••`, `type="password"`, `autoComplete="current-password"`, `required` |
| Forgot row | Right-aligned text "Forgot your password?" [Inter/13px/500/$accent]; navigates `/auth/forgot-password` |
| Submit | `<Button-Primary>` full-width; label "Sign in" / "Signing in…" while loading (opacity 0.6, disabled) |
| Divider | Two `$border` lines flanking "Or continue with" [Inter/11px/normal/$muted-foreground] |
| Google button | `<Button-Outline>` full-width; `GoogleMark` SVG (24×24) + "Continue with Google" [Inter/15px/600/$foreground]; "G" mark in [JetBrains Mono/15px/700/$accent] |

`SignInForm` is wrapped in `<Suspense fallback={null}>` because it reads `useSearchParams()`.

### Sign-up card (`/auth/sign-up`)

Vertical layout, `gap:14`, `pad:20` inside the card content.

| Region | Content |
|---|---|
| Header | "Create your account" [Inter/18px/700/$card-foreground]; "Set a password or continue with Google. We'll ask the rest in the questionnaire." [Inter/13px/normal/$muted-foreground] |
| Email field | `<InputField>` label "Email", placeholder `you@example.com`, `type="email"`, `autoComplete="email"`, `required` |
| Password field | `<InputField>` label "Password", placeholder `••••••••`, `type="password"`, `autoComplete="new-password"`, `required` |
| Confirm field | `<InputField>` label "Confirm password", placeholder `••••••••`, `type="password"`, `autoComplete="new-password"`, `required` |
| Submit | `<Button-Primary>` full-width; label "Create account" / "Creating account…" while loading (opacity 0.6, disabled) |
| Divider | Same "Or continue with" treatment as sign-in |
| Google button | Same `<Button-Outline>` + `GoogleMark` as sign-in |
| Footer | "Already have an account?" [Inter/13px/normal/$muted-foreground] + "Sign in" link [Inter/13px/500/$accent] → `/auth/sign-in` |

### Board section labels (`AUTH / SIGN IN`, `AUTH / SIGN UP`, `AUTH / STATES`)

These are Pencil design-canvas section labels [JetBrains Mono/9px/500/$muted-foreground] used as visual separators on the board. They do not render in the live UI.

### Hosted fallback (`/auth/<any-other-path>`)

Any `/auth/<path>` that is not `sign-in` or `sign-up` renders `<AuthView path={path} />` from `@neondatabase/auth/react/ui` inside a bare `<main>` (`mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-center justify-center px-6 py-12`). This covers: forgot-password, reset-password, callback, sign-out, magic-link, and provider/error subpaths. No `AuthShell` wraps this fallback.

### Bare `/auth` landing

Server component, `force-dynamic`. Receives the Neon Auth post-OAuth `?neon_auth_session_verifier=…` query string. The proxy middleware (`proxy.ts`) runs first, exchanges the verifier for a session cookie. Page logic: if `getAuthenticatedUser()` → `redirect("/")` (home, gating spine routes onward); otherwise → `redirect("/auth/sign-in")`. No visible UI is ever rendered at this route.

---

## Components used

| Name | Role | Key props / variants |
|---|---|---|
| `AuthShell` | Reusable card chrome wrapping both bespoke forms | `hideBack` (true on sign-in/sign-up), `footer` (unused here), `className` |
| `InputField` | Labelled text input primitive (board component) | `label`, `placeholder`, `type`, `autoComplete`, `required`, `disabled` |
| `Button-Primary` | Full-width CTA (submit) | `w:fill_container`; `op:0.6` + `disabled` while submitting; text override for loading label |
| `Button-Outline` | Google OAuth trigger | `w:fill_container`; contains `GoogleMark` + label |
| `GoogleMark` | Inline 24×24 Google "G" SVG | `fill="currentColor"`, `aria-hidden`; currently duplicated verbatim in `sign-in-form.tsx` and `sign-up-form.tsx` — not yet a shared component |
| `Card` / `CardContent` | Shell card surface | `overflow-hidden p-0` / `p-6 md:p-8` |
| `AuthView` | Hosted Neon Auth UI (fallback only) | `path` prop — used for any non-bespoke `/auth/<path>` |
| `NeonAuthUIProvider` | Root-level session/navigation wiring | `authClient`, `navigate`, `replace`, `onSessionChange`, `redirectTo`, `Link` — mounted once in root layout |

New components implied but not yet shared:
- `GoogleMark` — should be extracted to a single shared component; currently duplicated.

---

## States

### Global state matrix (both forms)

| State | Inputs | Submit button | Google button | Error slot |
|---|---|---|---|---|
| **Empty / initial** | Enabled, blank | Enabled, default label | Enabled | Hidden |
| **Populated** | Enabled, user values | Enabled, default label | Enabled | Hidden |
| **Submitting** | `disabled` | `disabled`, `op:0.6`, loading label | `disabled` | Hidden |
| **Validation error** | Re-enabled | Re-enabled | Re-enabled | Visible (`role="alert"`, `$destructive`) |
| **Server error** | Re-enabled | Re-enabled | Re-enabled | Visible (`role="alert"`, `$destructive`) |
| **Success** | n/a — page navigates away | n/a | n/a | n/a |

### Sign-in–specific states

| State | Trigger | Behaviour |
|---|---|---|
| **Session-pending** | `authClient.useSession()` `isPending = true` | Auto-forward effect suppressed until session resolves |
| **Already authenticated (non-default callbackURL)** | Session exists + `callbackURL !== "/"` | `window.location.replace(callbackURL)` — user never sees the form |
| **`<Suspense>` pending** | `useSearchParams()` not yet resolved | `SignInForm` renders `null` fallback briefly |

### Validation-error messages (rendered in `role="alert"` alert block)

Board states panel specifies fill `#f83e5a1f`, stroke `$destructive`, lucide `triangle-alert` icon, text [Inter/13px/500/$destructive]:

| Trigger | Message |
|---|---|
| Email field empty | "Email is required" |
| Password field empty | "Password is required" |
| Passwords do not match (sign-up only) | "Passwords do not match" |
| Server / network error | `result.error.message` or fallback (see Data & enums) |

### Gating states

This surface carries **none**. No invite gate, no rank check, no onboarding gate, no approval check. Sign-up is open by design; all gating lives downstream. The `CaptainLock` component does not appear here.

---

## User actions

| Action | Result |
|---|---|
| Enter `/auth/sign-in` URL | `AuthShell` + `SignInForm` rendered (Back suppressed) |
| Enter `/auth/sign-up` URL | `AuthShell` + `SignUpForm` rendered (Back suppressed) |
| Type email / password (sign-in) | Controlled inputs update; `error` cleared implicitly on next submit |
| Submit sign-in (email/password) | Local validation → if pass: `authClient.signIn.email({ email, password, callbackURL })` → on success `router.replace(callbackURL)` + `router.refresh()` |
| Click "Continue with Google" (sign-in) | `authClient.signIn.social({ provider: "google", callbackURL: "/auth" })` → OAuth round-trip → `/auth` proxy exchange → `redirect("/")` |
| Click "Forgot your password?" | Navigate to `/auth/forgot-password` → hosted `<AuthView path="forgot-password">` |
| Type email / password / confirm (sign-up) | Controlled inputs update |
| Submit sign-up (email/password) | Local validation (incl. password match) → `authClient.signUp.email({ email, password, name: email, callbackURL: "/" })` → on success `router.replace("/")` + `router.refresh()` |
| Click "Continue with Google" (sign-up) | `authClient.signIn.social({ provider: "google", callbackURL: "/auth" })` → same OAuth round-trip as sign-in |
| Click "Sign in" footer link (sign-up) | Navigate to `/auth/sign-in` |
| Any error returned | Error message rendered in `role="alert"` slot; `loading` reset to `false`; inputs + buttons re-enabled |

---

## Data & enums

This surface does not touch any Camp 404 Drizzle tables. It operates on the Neon / Better Auth session.

### AuthenticatedUser interface (read-back after auth, `lib/auth.ts`)

```
AuthenticatedUser {
  id: string           // session.user.id
  primaryEmail: string | null   // session.user.email ?? null
  displayName: string | null    // session.user.name ?? null
}
```

### API payloads

| Call | Payload |
|---|---|
| `authClient.signIn.email` | `{ email: string, password: string, callbackURL: string }` |
| `authClient.signUp.email` | `{ email: string, password: string, name: string (= email), callbackURL: "/" }` |
| `authClient.signIn.social` | `{ provider: "google", callbackURL: "/auth" }` |

**`name` set to email on sign-up:** Better Auth requires a non-null `name`; Camp 404 does not collect a display name at auth time. `name` defaults to the email string and is reconciled later from the burner profile created during onboarding. This is intentional.

### Fixed callbackURL targets

| Trigger | callbackURL |
|---|---|
| Email sign-in | `safeCallbackUrl(searchParams.get("callbackURL"))` — defaults to `"/"` |
| Email sign-up | `"/"` (hardcoded) |
| Google sign-in or sign-up | `"/auth"` (forces verifier exchange via proxy) |

### Error fallback strings

| Scenario | Fallback |
|---|---|
| Email sign-in failure | `"Sign in failed"` |
| Email sign-up failure | `"Sign up failed"` |
| Google sign-in failure | `"Google sign in failed"` |
| Google sign-up failure | `"Google sign up failed"` |

### Schema changes

**None.** Auth is fully managed by Neon / Better Auth. No Camp 404 Drizzle table is written or read on this surface.

---

## Validation & edge cases

- **Email/password sign-in:** `email.trim()` must be non-empty → "Email is required"; `password` must be truthy → "Password is required". No format or length enforcement beyond the browser's `type="email"` + `required` attribute. Server/Better Auth may impose its own minimum-length rule.
- **Email/password sign-up:** same presence checks, plus `password !== confirmPassword` → "Passwords do not match". Checked before any network call.
- **`safeCallbackUrl` open-redirect guard:** `null`/`undefined`/empty → `"/"`; not starting with `"/"` → `"/"`; starting with `"//"` → `"/"`; else passthrough verbatim.
- **OAuth must round-trip through `/auth`:** both Google handlers force `callbackURL: "/auth"` so the proxy middleware's verifier→cookie exchange fires before any session read. Bypassing this leaves the user with a verifier URL parameter but no session cookie.
- **Sign-up is open by design:** no invite-code field. The `/signup/required` gate (unit 03) enforces invite-only post-auth because Neon Auth / Google create an identity at sign-in time and cannot be intercepted earlier.
- **Auto-forward edge case (sign-in):** only forwards via `window.location.replace` when `callbackURL !== "/"` and a session exists. A default `"/"` callback routes normally through the gating spine.
- **Error precedence:** `result.error.message` preferred; fallback string used when absent; thrown `Error` instances use `err.message`; all others use the generic fallback.
- **`loading` lifecycle:** set `true` before the network call; reset to `false` only on error/catch branches. On success the component unmounts (page navigation), so `loading` is intentionally never reset to `false` in the success branch.
- **Dynamic rendering (`force-dynamic`):** both `/auth` and `/auth/[path]` pages must read the just-set session cookie; static prerender would cache a stale (unauthenticated) response. `/auth/[path]` also keeps `dynamicParams: true` (Next.js default) so unknown auth subpaths fall to `<AuthView>` rather than 404.
- **Build resilience:** `createNeonAuth` uses placeholder base URL + ≥32-char placeholder secret so `next build` succeeds without real env vars. Requests without real env vars fail at the Neon Auth API, not at build time.
- **E2E test bypass:** `isE2ETestMode()` (`E2E_TEST_MODE === "1"`) gates a `POST /api/test/login` route that sets a `camp404_test_user` cookie, bypassing all Neon Auth logic. `getAuthenticatedUser()` checks this cookie first in E2E mode. The route returns 404 in production (`E2E_TEST_MODE` is never set).

---

## Flows

### Sign-in (email/password)

Unauthenticated visitor → `LandingHero` CTA "Are you lost?" → `/auth/sign-in` → enters email + password → submit → local validation → `authClient.signIn.email` → success → `router.replace(callbackURL)` + `router.refresh()` → home gating spine.

Error branch: `result.error` or thrown error → error rendered in `role="alert"` → user corrects and resubmits.

### Sign-in (Google)

`/auth/sign-in` → "Continue with Google" → `authClient.signIn.social({ provider: "google", callbackURL: "/auth" })` → OAuth provider → returns to `/auth?neon_auth_session_verifier=…` → proxy middleware exchanges verifier → session cookie set → `/auth/page.tsx` `getAuthenticatedUser()` → `redirect("/")` → home gating spine.

### Sign-up (email/password)

`/auth/sign-up` → enters email + password + confirm → submit → local validation (incl. match) → `authClient.signUp.email` → success → `router.replace("/")` + `router.refresh()` → home gating spine → `/signup/required` (invite gate, unit 03).

### Sign-up (Google)

Same OAuth round-trip as Google sign-in. `/auth/page.tsx` forwards to `/` → home gating spine → `/signup/required`.

### Forgot password

`/auth/sign-in` → "Forgot your password?" → `/auth/forgot-password` → hosted `<AuthView path="forgot-password">` handles the full recovery flow.

### Entry point

Unauthenticated `/` → `LandingHero` renders CTA `<a href="/auth/sign-in">Are you lost?</a>`. This is the only live in-app entry into the sign-in flow; direct URL navigation to `/auth/sign-up` also works.

---

## Divergences from feature-set reference

| Reference claim | Board / live-code reality | Resolution |
|---|---|---|
| Reference (§ Sub-components) notes `GoogleMark` is **duplicated verbatim** in both form files | Board specifies no separate component — just an inline SVG with `"G"` in JetBrains Mono | Flag as a build-reconciliation: extract `GoogleMark` to a shared component before shipping to remove the duplication. Behaviour unchanged. |
| Reference describes `AuthShell`'s `footer` prop as live on sign-in/sign-up | Board shows no footer text under the sign-in or sign-up card | `footer` is not passed by either bespoke form. It is live on the downstream invite gate (`/signup/required`). Boards are correct for this surface; reference description is accurate about the prop's general availability. |
| Reference mentions no sign-in link on sign-in (entry is landing CTA only) | Board has no reciprocal sign-up link on the sign-in card; sign-up card has "Already have an account? Sign in" | Board and reference agree. The asymmetry is intentional. |
| Reference names `AuthView` path fallback `<main>` class as `max-w-md` | Board does not specify the fallback layout (it only boards the two bespoke forms) | Live code governs: `max-w-md` with full-height centering. No conflict. |

---

## Open questions / build reconciliations

1. **`GoogleMark` extraction** — The identical inline SVG is duplicated in `sign-in-form.tsx` and `sign-up-form.tsx`. Extract to a shared `<GoogleMark />` in `packages/ui/src/components/` or a local `apps/web/components/` file before ship. Low risk; no behaviour change.

2. **No sign-up link on sign-in** — The board deliberately omits a "Don't have an account? Sign up" link on the sign-in card. Confirm this is intentional (entry via landing CTA only) or add a reciprocal link in the brief for unit 01.

3. **`name = email` on sign-up** — Intentional shortcut; the burner profile reconciles `displayName` during onboarding. Confirm the questionnaire step that collects display name / preferred name covers this gap (see unit 04 OB steps).

4. **Minimum password length** — No client-side length rule is enforced. If Better Auth imposes a minimum, the server error message should be reflected in the validation-error section above. Confirm the Better Auth config and surface the rule client-side if present.

5. **`<Suspense fallback={null}>` on `SignInForm`** — The `null` fallback means there is a brief blank flash while `useSearchParams()` resolves. Acceptable for this low-traffic path; flag if perceived latency becomes an issue.

6. **Env var checklist for deployment** — `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` (≥32 chars). Build passes without them (placeholder values); runtime fails at the Neon Auth API. Confirm CI/CD injects these before any staging or production deploy.
