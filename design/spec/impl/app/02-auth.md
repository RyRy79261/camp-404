# 02-auth — app integration plan

- **Route(s):** `/auth/sign-in`, `/auth/sign-up`, `/auth/[path]` · routed page
- **Component plans:** [organism-signinform-signupform.md](../components/organism-signinform-signupform.md), [organism-authshell.md](../components/organism-authshell.md)
- **Service plan:** [01-identity-access-gating.md](../service-layer/01-identity-access-gating.md)
- **Surface brief:** [02-auth.md](../../surfaces/02-auth.md)

---

## Current state — the existing route/files today

Verified line-by-line against live files. All four files are working, shipped code.

### `apps/web/app/auth/page.tsx` (25 lines) — bare `/auth` verifier-exchange landing

`force-dynamic` server component. Calls `getAuthenticatedUser()` from `@/lib/auth`
and `redirect("/")` on a live session; else `redirect("/auth/sign-in")`. No UI.
This is the post-OAuth return target that Neon Auth's proxy middleware (`auth.middleware`)
targets before the page fires — the verifier→session-cookie exchange happens in middleware,
then this page reads the resulting cookie and routes forward. Correct today; redesign
makes no change to this file.

### `apps/web/app/auth/[path]/page.tsx` (48 lines) — bespoke forms + hosted fallback

`force-dynamic` server component. Dynamic catch-all for every `/auth/<path>`. Branches:
- `path === "sign-up"` → `<AuthShell hideBack><SignUpForm /></AuthShell>`
- `path === "sign-in"` → `<AuthShell hideBack><Suspense fallback={null}><SignInForm /></Suspense></AuthShell>`
- anything else → bare `<main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-center justify-center px-6 py-12"><AuthView path={path} /></main>`

`dynamicParams` is left at the Next.js default (`true`) so unknown Neon Auth subpaths
(error, provider-specific, etc.) fall to the `<AuthView>` branch instead of 404ing.
Correct today; the redesign changes only the import list (new leaf components) and
the inner markup of the two form components it delegates to.

### `apps/web/app/auth/sign-in-form.tsx` (188 lines)

`"use client"`. Imports `Button`, `Input`, `Label` from `@camp404/ui`; `authClient`
from `@/lib/auth-client`; `Link`, `useRouter`, `useSearchParams`, `useEffect`,
`useState`. Contains file-local `safeCallbackUrl` pure helper (lines 17–22) and
file-local `GoogleMark` SVG (lines 174–188). Hand-rolls `<div className="grid gap-2">
<Label/><Input/></div>` for each field, a verbose off-token inline divider (lines
150–158), and a bare `<p role="alert">` for errors (lines 140–142).

**Redesign delta:** recompose onto `InputField`, `OAuthButton`, `Divider`, `Alert`.
All auth logic (state machine, `authClient.*` payloads, `safeCallbackUrl`, auto-forward
`useEffect`) is preserved verbatim. Zero behaviour change.

### `apps/web/app/auth/sign-up-form.tsx` (192 lines)

`"use client"`. Same imports as sign-in minus `useSearchParams`/`useEffect`.
Contains a verbatim-duplicate `GoogleMark` (lines 177–191). Same hand-rolled field
and divider pattern. Three fields: email, password, confirm-password.

**Redesign delta:** same recompose as sign-in.

### `apps/web/components/auth-shell.tsx` (59 lines)

`"use client"` (needs `useRouter` for Back). Props: `children`, `className?`,
`footer?: ReactNode`, `hideBack?: boolean`. Outer wrapper uses verbose
`bg-[color:var(--color-muted)]` and `text-[color:var(--color-muted-foreground)]`
arbitrary-value escapes. Composes `Card`/`CardContent` from `@camp404/ui/components/card`
and `Button` from `@camp404/ui/components/button`.

**Redesign delta (EXTEND):** token-spelling codemod pass only — snap off-token
arbitrary-value classes to short Tailwind token forms (`bg-muted`,
`text-muted-foreground`); restyle footer `<p>` to the `--text-brand-label` step
(JetBrains Mono / 11px / 500). No props change, no layout change, no behaviour change.

### `apps/web/lib/auth-client.ts` (14 lines)

`"use client"`. Exports `authClient = createAuthClient()` (Neon Auth / Better Auth,
same-origin `/api/auth/*`). No change needed.

### `apps/web/lib/auth.ts` — `getAuthenticatedUser`

Server-only Next-coupled. Called by `auth/page.tsx` (bare landing). No change.

### `apps/web/app/api/auth/[...path]/route.ts`

Catch-all proxy that exposes `auth.handler()`. Routes all `/api/auth/*` traffic to
Better Auth (sign-in, sign-up, session, OAuth callbacks, verifier exchange). No change.

---

## File structure — target files in `apps/web`

| File | Action | Notes |
|---|---|---|
| `apps/web/app/auth/page.tsx` | **REUSE** (no change) | Bare `/auth` verifier-exchange landing. Already correct. |
| `apps/web/app/auth/[path]/page.tsx` | **MODIFY** | Update imports: add `InputField` from `@camp404/ui/components/input-field`, `OAuthButton` from `@camp404/ui/components/google-button`, `Divider` from `@camp404/ui/components/divider`, `Alert` from `@camp404/ui/components/alert`. The page's own branch logic is unchanged. |
| `apps/web/app/auth/sign-in-form.tsx` | **MODIFY** | Recompose fields → `InputField`, error `<p>` → `Alert`, divider block → `Divider`, Google block + local `GoogleMark` → `OAuthButton`. Delete local `GoogleMark` function. Token-spell residual inline classes. All logic (state machine, `safeCallbackUrl`, `authClient.*`, auto-forward effect) preserved verbatim. |
| `apps/web/app/auth/sign-up-form.tsx` | **MODIFY** | Same recompose. Delete local `GoogleMark` function. Token-spell residual inline classes. |
| `apps/web/components/auth-shell.tsx` | **MODIFY (EXTEND)** | Token-spelling pass only: `bg-[color:var(--color-muted)]` → `bg-muted`; `text-[color:var(--color-muted-foreground)]` → `text-muted-foreground`; footer `<p>` → `--text-brand-label` (JetBrains Mono / 11px / 500 + `text-muted-foreground`). Props and layout unchanged. |
| `apps/web/lib/auth-client.ts` | **REUSE** | No change. |
| `apps/web/lib/auth.ts` | **REUSE** | No change for this surface. (`getAuthenticatedUser` is the one function this surface calls server-side.) |
| `apps/web/lib/neon-auth.ts` | **REUSE** | No change. |
| `apps/web/app/api/auth/[...path]/route.ts` | **REUSE** | No change. |

No CREATE or DELETE file operations. No new `/api` route handlers needed. No
`error.tsx` or `not-found.tsx` needed (unknown auth subpaths fall to `<AuthView>`,
not a Next 404; server errors in the forms surface in the `Alert` slot client-side).

---

## Components composed — rendering location

| Component | Plan | Verdict | Renders | Role on this surface |
|---|---|---|---|---|
| `AuthShell` | [organism-authshell.md](../components/organism-authshell.md) | PROMOTE-keep-app-local (`apps/web/components/auth-shell.tsx`) | Server (instantiated in server component `[path]/page.tsx`; the shell itself is `"use client"` for `useRouter`) | Outer card chrome wrapping both bespoke forms. `hideBack` on both. No `footer` on sign-in or sign-up. |
| `SignInForm` | [organism-signinform-signupform.md](../components/organism-signinform-signupform.md) | REUSE / EXTEND app-local (`apps/web/app/auth/sign-in-form.tsx`) | Client (`"use client"`) | Complete sign-in state machine: email/password submit, Google OAuth, auto-forward effect. Wrapped in `<Suspense fallback={null}>` on the host (reads `useSearchParams`). |
| `SignUpForm` | [organism-signinform-signupform.md](../components/organism-signinform-signupform.md) | REUSE / EXTEND app-local (`apps/web/app/auth/sign-up-form.tsx`) | Client (`"use client"`) | Complete sign-up state machine: email/password/confirm submit, Google OAuth. Not wrapped in `<Suspense>` (no search-params dependency). |
| `InputField` | [molecule-inputfield.md](../components/molecule-inputfield.md) | PROMOTE → `@camp404/ui/components/input-field.tsx` | Client (presentation-only; client-safe) | Email + password fields in `SignInForm`; email + password + confirm-password in `SignUpForm`. Carries `label`, `id`, `type`, `autoComplete`, `required`, controlled `value`/`onChange`, `disabled={loading}`. |
| `OAuthButton` | [molecule-oauthbutton.md](../components/molecule-oauthbutton.md) | PROMOTE → `@camp404/ui/components/google-button.tsx` | Client (presentation-only; client-safe) | Google CTA in both forms. `onClick={handleGoogle}`, `disabled={loading}`. Replaces the local `<Button variant="outline">…<GoogleMark/></Button>` block in both files and eliminates the duplicated `GoogleMark` function. |
| `Divider` | [atom-divider.md](../components/atom-divider.md) | NEW → `@camp404/ui/components/divider.tsx` | Client (presentation-only; client-safe) | `<Divider label="Or continue with" />` in both forms. Replaces the hand-rolled `relative … border-t … span` block. |
| `Alert` | [molecule-alert.md](../components/molecule-alert.md) | PROMOTE → `@camp404/ui/components/alert.tsx` | Client (presentation-only; client-safe) | `{error && <Alert tone="destructive">{error}</Alert>}` in both forms. Replaces the inline `<p className="text-sm text-[color:var(--color-destructive)]" role="alert">`. |
| `Button` | [atom-button.md](../components/atom-button.md) | REUSE (`packages/ui/src/components/button.tsx`) | Client | Full-width primary submit in both forms (default variant; outline variant is now inside `OAuthButton`). |
| `Card` / `CardContent` | [molecule-card.md](../components/molecule-card.md) | REUSE | Client (inside `AuthShell`) | Shell card surface: `overflow-hidden p-0` / `p-6 md:p-8`. |
| `AuthView` | Neon Auth (`@neondatabase/auth/react/ui`) | REUSE (external) | Client (inside bare `<main>`) | Hosted fallback for any `/auth/<path>` that is not `sign-in` or `sign-up`. Not wrapped in `AuthShell`. |

> **"Forgot your password?" link** and the sign-up footer **"Already have an account? Sign in"** link are inline `next/link` elements in the form files — not extracted as separate library components (board draws them as per-surface copy).

---

## Services & data — calls, fetch location, props flow

This surface is **pre-spine**. It does not call any Camp 404 Drizzle service, does not
touch any `@camp404/db` table, and does not use any `@camp404/core` helpers (none
exist yet for this domain; `safeCallbackUrl` stays file-local in `sign-in-form.tsx`
per the organism plan's recommendation).

### Server-side (in `apps/web/app/auth/page.tsx` — bare `/auth` landing only)

| Call | Where | What | Why server |
|---|---|---|---|
| `getAuthenticatedUser()` | `apps/web/lib/auth.ts` | Reads the session cookie set by the proxy middleware verifier exchange | Reads `next/headers`; must run in a server component |

Result of `getAuthenticatedUser()` is used only to branch `redirect("/")` vs
`redirect("/auth/sign-in")`. It is NOT passed as props to any client component.

### Client-side (in `SignInForm` and `SignUpForm`)

| Call | Where | Payload | Trigger |
|---|---|---|---|
| `authClient.useSession()` | `apps/web/lib/auth-client.ts` | `{ data: session, isPending }` | Sign-in only; drives auto-forward `useEffect` |
| `authClient.signIn.email` | `apps/web/lib/auth-client.ts` | `{ email, password, callbackURL }` | Sign-in form submit |
| `authClient.signUp.email` | `apps/web/lib/auth-client.ts` | `{ email, password, name: email, callbackURL: "/" }` | Sign-up form submit (`name = email` intentional — Better Auth requires non-null; display name reconciled later from burner profile during onboarding) |
| `authClient.signIn.social` | `apps/web/lib/auth-client.ts` | `{ provider: "google", callbackURL: "/auth" }` | Google CTA in either form |

All client calls go to the local `/api/auth/*` Better Auth handler
(`apps/web/app/api/auth/[...path]/route.ts`). No Camp 404 server actions exist
on this surface. No `"use server"` functions are called from auth forms.

### Props flow

Both `SignInForm` and `SignUpForm` take no props. `callbackURL` is read from
`useSearchParams()` inside `SignInForm` (sign-up always targets `"/"`). The server
component (`[path]/page.tsx`) instantiates the forms as `AuthShell` children; it
passes no data down.

---

## Gating

**This surface carries no gating.** It is the sole unauthenticated entry point —
pre-spine by design.

- No invite-gate check
- No rank check
- No approval check
- No onboarding check
- `CaptainLock` does not appear here
- `requireClearance` / `ViewerRank` are not computed here

Sign-up is deliberately open: Neon Auth / Google create an identity at OAuth time
and cannot be blocked before `authClient.signIn.social` completes. All post-auth
gating (G1 invite, G2 onboarding, G3 approval, rank) lives downstream on `/`
(the spine at `app/page.tsx`) and the gate pages it redirects to
(`/signup/required`, `/onboarding/questionnaire`, `/pending-approval`).

The gating note in `service-layer/01-identity-access-gating.md` (line 27) confirms:
"Auth shells `/auth/*` → Pre-spine; carries none of the gating states."

---

## States

### Global state matrix (both forms)

| State | InputField(s) | Submit Button | OAuthButton | Alert slot |
|---|---|---|---|---|
| **Empty / initial** | enabled, blank | enabled, default label | enabled | absent |
| **Populated** | enabled, user values | enabled, default label | enabled | absent |
| **Submitting** | `disabled` (all) | `disabled`, loading label | `disabled` | absent |
| **Validation error** | re-enabled | re-enabled, default label | re-enabled | `<Alert tone="destructive" role="alert">` |
| **Server / network error** | re-enabled | re-enabled, default label | re-enabled | `<Alert tone="destructive" role="alert">` |
| **Success** | n/a — page navigates away | n/a | n/a | n/a |
| **Google-in-flight** | `disabled` | `disabled` | `disabled` | absent (until catch) |

All `disabled` state is driven by a single `loading` boolean — one source of truth.
`loading` is never reset to `false` on the success path (the component unmounts on
navigation — intentional, per surface brief §Validation).

### Sign-in–specific states

| State | Trigger | Behaviour |
|---|---|---|
| **Session-pending** | `authClient.useSession()` `isPending === true` | Auto-forward `useEffect` suppressed until session resolves |
| **Already authenticated (non-default callback)** | `session?.user` + `callbackURL !== "/"` | `window.location.replace(callbackURL)` — form never interactive |
| **`<Suspense>` pending** | `useSearchParams()` not yet resolved | `[path]/page.tsx:33` wraps `SignInForm` in `<Suspense fallback={null}>`; card chrome renders, form area briefly absent |

### Validation-error messages (rendered in the `Alert`)

| Trigger | Message |
|---|---|
| Email field empty (both forms) | "Email is required" |
| Password field empty (both forms) | "Password is required" |
| Passwords mismatch (sign-up only) | "Passwords do not match" |
| Email sign-in server failure | `result.error.message ?? "Sign in failed"` |
| Email sign-up server failure | `result.error.message ?? "Sign up failed"` |
| Google sign-in catch | `err.message ?? "Google sign in failed"` |
| Google sign-up catch | `err.message ?? "Google sign up failed"` |

### Gating states

None — see §Gating above.

### AuthShell chrome states (own, not form states)

| State | When |
|---|---|
| `hideBack` (active on both mounts) | Back button suppressed |
| No `footer` | Footer `<p>` absent |
| `<Suspense fallback={null}>` | Visible during `useSearchParams` resolution on sign-in path |

---

## Build steps

The surface redesign is a **recompose** (zero behaviour change). The leaf components
must land before the form files are updated.

### Prerequisites (hard gates — must land before touching the forms)

| Prerequisite | From | Why it gates |
|---|---|---|
| Phase 0 foundations (`foundations-tokens.md`) | `foundations-tokens.md` | `--color-success`/`-warning`, `--text-brand-label`, `bg-muted` / `text-muted-foreground` Tailwind aliases, `--radius`. Required by `Alert` (destructive tone), `InputField`, `AuthShell` token reconciliation, and `Divider`. |
| `molecule-card.md` Steps 1–2 (radius → `--radius`, drop `shadow-sm`) | `molecule-card.md` | AuthShell uses `<Card>`; the chrome picks up the token-correct surface only after the card fix. |
| `InputField` shipped + exported from `@camp404/ui` | `molecule-inputfield.md` | Replaces hand-rolled field blocks in both forms. |
| `OAuthButton` shipped + exported from `@camp404/ui` | `molecule-oauthbutton.md` | Replaces local `GoogleMark` + outline-button blocks. Eliminates the SVG duplication. |
| `Divider` shipped + exported from `@camp404/ui` | `atom-divider.md` | Replaces inline "Or continue with" rule in both forms. |
| `Alert` shipped + exported from `@camp404/ui` | `molecule-alert.md` | Replaces inline `<p role="alert">` in both forms. |

No service-layer or schema prerequisites exist for this surface. The one schema change
in the whole redesign (`captain_promotion_requests`, migration 0012) is in the roster
domain and is irrelevant here.

### Step 1 — `AuthShell` token reconciliation (EXTEND)

File: `apps/web/components/auth-shell.tsx`.

Replace the three verbose arbitrary-value escape hatch classes:
- Outer `<div>`: `bg-[color:var(--color-muted)]` → `bg-muted`
- Back button `<Button>`: `text-[color:var(--color-muted-foreground)]` → `text-muted-foreground`
- Footer `<p>`: `text-xs text-[color:var(--color-muted-foreground)]` → JetBrains Mono 11px / 500 font-step (`--text-brand-label`) + `text-muted-foreground`; keep `px-6 pt-4 text-center`.

Props, layout, and behaviour are untouched. All four mount sites (`auth/[path]/page.tsx`,
`signup/required/page.tsx`, `pending-approval/page.tsx`) compile without edits.

Acceptance: no `[color:var(--color-` escapes remain in `auth-shell.tsx`; `pnpm build` +
`pnpm lint` green; all four consumers render byte-identical layout. The invite-gate footer
("Camp 404 is invite-only.") now renders in JetBrains Mono 11px.

### Step 2 — Migrate sign-in fields → `InputField`

File: `apps/web/app/auth/sign-in-form.tsx`.

Replace the two `<div className="grid gap-2"><Label htmlFor="…"/><Input …/></div>` blocks
with `InputField`:

```
// email
<InputField
  id="signin-email"
  label="Email"
  type="email"
  placeholder="you@example.com"
  autoComplete="email"
  required
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  disabled={loading}
/>

// password — keep the "Forgot your password?" Link as a sibling element
// immediately after the InputField (board draws the link right-aligned in
// the label row; InputField owns the label text, the link stays adjacent)
<InputField
  id="signin-password"
  label="Password"
  type="password"
  autoComplete="current-password"
  required
  value={password}
  onChange={(e) => setPassword(e.target.value)}
  disabled={loading}
/>
<Link href="/auth/forgot-password" className="…">Forgot your password?</Link>
```

Remove `Label` and `Input` from the imports (no longer directly used).

Acceptance: `getByLabelText("Email")` and `getByLabelText("Password")` resolve;
"Forgot your password?" link navigates to `/auth/forgot-password`; no remaining
`grid gap-2` + bare `<Input>` block; `pnpm build` green.

### Step 3 — Migrate sign-up fields → `InputField`

File: `apps/web/app/auth/sign-up-form.tsx`.

Replace the three `<div className="grid gap-2">` field blocks with `InputField`:
email (`id="signup-email"`, `autoComplete="email"`), password
(`id="signup-password"`, `autoComplete="new-password"`), confirm-password
(`id="signup-confirm-password"`, `autoComplete="new-password"`, `required`).
All `value`/`onChange`/`disabled={loading}` props wired.

Remove `Label` and `Input` from the imports.

Acceptance: three `InputField`s render; confirm field is controlled; password-mismatch
validation fires correctly; no remaining `grid gap-2` + bare `<Input>` block.

### Step 4 — Replace error `<p>` → `Alert` (both forms)

Files: `apps/web/app/auth/sign-in-form.tsx`, `apps/web/app/auth/sign-up-form.tsx`.

Replace:
```
{error && (
  <p className="text-sm text-[color:var(--color-destructive)]" role="alert">
    {error}
  </p>
)}
```
with:
```
{error && <Alert tone="destructive">{error}</Alert>}
```

`Alert` carries `role="alert"` internally (per `molecule-alert.md`).

Acceptance: `getByRole("alert")` resolves to the `Alert` component body; message text
matches the validation-error table above; no remaining `text-[color:var(--color-destructive)]`
inline `<p>` in either form file.

### Step 5 — Replace inline divider → `Divider` (both forms)

Files: `apps/web/app/auth/sign-in-form.tsx`, `apps/web/app/auth/sign-up-form.tsx`.

Replace the `<div className="relative text-center text-sm"> … border-t … <span> …
Or continue with</span></div>` blocks in both files with:
```
<Divider label="Or continue with" />
```

Acceptance: the labelled divider renders with flanking rules; no remaining
`border-[color:var(--color-border)]` or `bg-[color:var(--color-card)]`
verbose-token classes in either form; visual parity confirmed.

### Step 6 — Replace Google block → `OAuthButton`; delete local `GoogleMark` (both forms)

Files: `apps/web/app/auth/sign-in-form.tsx`, `apps/web/app/auth/sign-up-form.tsx`.

Replace each:
```
<Button type="button" variant="outline" className="w-full" onClick={handleGoogle} disabled={loading}>
  <GoogleMark />
  Continue with Google
</Button>
```
with:
```
<OAuthButton onClick={handleGoogle} disabled={loading} />
```

Delete both file-local `GoogleMark()` functions (lines 174–188 in sign-in, 177–191
in sign-up). Remove `Button` from imports in both files (no longer directly consumed;
the submit button is now the only `Button` usage — if submit remains a bare `Button`,
keep the import; if the project adopts `InputField`'s internal submit, re-evaluate).

Acceptance: no `GoogleMark` function definition remains in either file;
`grep "function GoogleMark"` returns empty; `handleGoogle` fires on click;
`disabled={loading}` honoured; outline button + "G" glyph + "Continue with Google"
label visible. `mcp/connect/page.tsx` (the third `GoogleMark` duplicate, a plain
`<button>`) is out of scope for this surface — that is tracked by the MCP service plan.

### Step 7 — Token-spelling codemod on residual inline copy (both forms)

Files: `apps/web/app/auth/sign-in-form.tsx`, `apps/web/app/auth/sign-up-form.tsx`.

The header subhead `<p>` and the sign-up footer `<p>` will retain
`text-[color:var(--color-muted-foreground)]` after Steps 2–6 absorb most off-token
classes. Replace with `text-muted-foreground`.

Acceptance: `grep "text-\[color:var(--color-" apps/web/app/auth/sign-*-form.tsx`
returns empty; `pnpm build` + `pnpm lint` green.

### Step 8 — Update `[path]/page.tsx` imports

File: `apps/web/app/auth/[path]/page.tsx`.

Add imports for the four new leaf components:
```
import { InputField } from "@camp404/ui/components/input-field";      // consumed inside SignInForm/SignUpForm
import { OAuthButton } from "@camp404/ui/components/google-button";    // consumed inside SignInForm/SignUpForm
import { Divider } from "@camp404/ui/components/divider";              // consumed inside SignInForm/SignUpForm
import { Alert } from "@camp404/ui/components/alert";                  // consumed inside SignInForm/SignUpForm
```

Note: these imports are strictly for TypeScript resolution — the leaf components are
actually consumed inside the form components, not by the page server component directly.
The page itself only composes `AuthShell`, `SignInForm`, `SignUpForm`, and `AuthView`.
If the bundler resolves these transitively without explicit page imports, this step is
a no-op. Confirm at build time.

The page's branching logic (`path === "sign-up"` / `path === "sign-in"` / fallback)
is preserved unchanged.

### Step 9 — Preserve all auth-logic verbatim (regression guard)

This step is a diff review, not a code change. Before merging any of the above,
confirm that no auth-logic line has changed:
- `safeCallbackUrl` body (lines 17–22 in current `sign-in-form.tsx`) — unchanged
- Auto-forward `useEffect` dependency array and condition — unchanged
- `handleSubmit` validation order (email → password → network) — unchanged
- `authClient.signIn.email` payload shape (incl. `callbackURL`) — unchanged
- `authClient.signUp.email` payload shape (incl. `name: trimmedEmail`, `callbackURL: "/"`) — unchanged
- Google `callbackURL: "/auth"` — unchanged (forces the proxy verifier exchange)
- `router.replace(callbackURL)` + `router.refresh()` on success — unchanged
- `loading` never reset to `false` on success branch — unchanged
- `<Suspense fallback={null}>` on `SignInForm` in `[path]/page.tsx:33` — unchanged

Acceptance: diff is recompose-only; no change to any control-flow line; all five
`authClient.*` call-sites match the payloads documented in §Services & data.

### Acceptance criteria (surface-level)

- `/auth/sign-in` renders `AuthShell` + `SignInForm` with all fields, submit, Google CTA, and divider.
- `/auth/sign-up` renders `AuthShell` + `SignUpForm` with all fields (incl. confirm), submit, Google CTA, divider, and footer link.
- `/auth/forgot-password` (and any other non-bespoke path) renders the bare `<main>` + `<AuthView>` fallback (not wrapped in `AuthShell`).
- `/auth` bare landing: authenticated user → `redirect("/")`, unauthenticated → `redirect("/auth/sign-in")`. No visible UI.
- Validation errors render in `<Alert tone="destructive">` with correct messages.
- Submit and Google CTA are `disabled` while `loading === true`.
- Google sign-in/sign-up route `callbackURL: "/auth"` (proxy verifier exchange fires).
- `pnpm build` + `pnpm lint` green.
- No `[color:var(--color-` arbitrary-value escapes remain in the four modified files.

### E2E test notes

The E2E seam is `E2E_TEST_MODE === "1"` → `POST /api/test/login` sets a
`camp404_test_user` cookie; `getAuthenticatedUser()` checks this cookie first in E2E
mode. This bypasses all Neon Auth / Better Auth logic.

Existing suite `apps/web/tests/e2e/authenticated.spec.ts` and
`apps/web/tests/e2e/signup.spec.ts` use the test-mode login helper (`login()` from
`tests/e2e/_helpers`) to set the session cookie, then navigate to gated pages. These
specs never interact with the `/auth/sign-in` or `/auth/sign-up` forms — they are
non-regression guards for the gating spine, not for the auth forms. They must remain
green and are not affected by the recompose.

No E2E spec exists today that fills the auth forms via browser automation. This is
consistent with test-mode design: real Neon Auth / OAuth round-trips cannot run in
CI. The E2E gap for the forms is intentional — unit/RTL tests (below) cover form logic.

**New tests to write (unit, RTL, `apps/web`-side):**

Sign-in (`sign-in-form.test.tsx`):
- Empty email → "Email is required" `Alert` (`getByRole("alert")`); no network call.
- Empty password → "Password is required" `Alert`; no network call.
- Valid submit → `authClient.signIn.email` called with `{ email, password, callbackURL }`.
- `result.error` → `Alert` renders `result.error.message`; `loading` reset to `false`.
- `loading === true` during submit → all `InputField`s, `Button`, `OAuthButton` have `disabled` attribute.
- Auto-forward `useEffect`: `session.user` + `callbackURL !== "/"` → `window.location.replace` called.

Sign-up (`sign-up-form.test.tsx`):
- Password mismatch → "Passwords do not match" `Alert`; no network call.
- Valid submit → `authClient.signUp.email` called with `{ email, password, name: email, callbackURL: "/" }`.
- Footer "Sign in" link → `href="/auth/sign-in"`.

`safeCallbackUrl` (file-local or extracted):
- `null` → `/`; empty string → `/`; `"//evil"` → `/`; `"http://evil"` → `/`;
  `"/home?x=1"` → `/home?x=1` (passthrough).

AuthShell (`auth-shell.test.tsx` — app-local):
- `hideBack` → no Back button in DOM; `hideBack={false}` → Back button present with `ArrowLeft`.
- `footer` truthy → footer `<p>` rendered; absent → no footer node.
- `className` merges onto inner `max-w-sm` column.
- Back button click → `router.back()` called (mock `next/navigation`).
- Footer `<p>` carries the brand-label font class (post-Step 1).

---

## Open items — surface-specific (cross-ref open-questions.md)

| # | Item | Severity | Source |
|---|---|---|---|
| OQ-B17 | **`GoogleMark` extraction** — the identical SVG is duplicated in both form files (confirmed at `sign-in-form.tsx:174–188`, `sign-up-form.tsx:177–191`). Absorbed by `OAuthButton` (Step 6); the third duplicate at `apps/web/app/mcp/connect/page.tsx:62–69` (a raw `<button>`, no `Button` component) is NOT in scope here — tracked by the MCP service plan (08). | low | `02-auth.md §Open-questions #1`; `open-questions.md B17`; `molecule-oauthbutton.md §Current state` |
| OQ-02-2 | **No sign-up link on sign-in** — the board deliberately omits a "Don't have an account? Sign up" link on the sign-in card. The only live entry into sign-in is the landing CTA "Are you lost?" from `LandingHero`. Confirm with product this asymmetry is intentional before build. If a reciprocal link is added, it belongs to the sign-in brief amendment, not here. | low | `02-auth.md §Open-questions #2` |
| OQ-02-3 | **`name = email` on sign-up** — Better Auth requires a non-null `name`; the email is used as a placeholder. Onboarding questionnaire (surface 04 / OB step) must collect the preferred display name and reconcile `users.displayName`. Confirm the specific OB step covers this before ship. | med | `02-auth.md §Open-questions #3` |
| OQ-02-4 | **Minimum password length** — no client-side length enforcement. If Better Auth config (`apps/web/lib/neon-auth.ts`) imposes a minimum, surface it as an explicit validation message in the error matrix (and consider a hint on the `InputField`'s `helper` prop). Confirm the Better Auth config before build. | med | `02-auth.md §Open-questions #4` |
| OQ-02-5 | **`<Suspense fallback={null}>` blank flash** — brief flash while `useSearchParams()` resolves on sign-in. Acceptable for this low-traffic path; monitor user feedback. If perceived as jarring, replace `null` with a skeleton matching the `SignInForm` height. | low | `02-auth.md §Open-questions #5` |
| OQ-02-6 | **Env var checklist for deployment** — `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` (≥ 32 chars). Build passes without them (placeholder values in `neon-auth.ts`); runtime fails at the Neon Auth API. CI/CD must inject these before any staging or production deploy. | med | `02-auth.md §Open-questions #6` |
| OQ-B2 | **Status-token OKLCH values** — `Alert tone="destructive"` requires `--color-destructive` (already exists); the new `success`/`warning` tokens are not used on this surface. No blocker for this surface specifically, but the `Alert` plan requires Phase 0 to have landed the final OKLCH values before styling is locked. | low | `open-questions.md B2` |
