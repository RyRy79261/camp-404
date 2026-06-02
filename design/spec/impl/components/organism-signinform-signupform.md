# SignInForm / SignUpForm — organism plan

- **mapsTo:** **REUSE / EXTEND (keep app-local)** — component-library.md §SignInForm / SignUpForm
  explicitly says *"keep app-local (`sign-in-form.tsx` / `sign-up-form.tsx`); compose InputField +
  Button + Divider + OAuthButton + Alert."* These two forms stay in `apps/web` (they import
  `authClient` from `@/lib/auth-client`, `next/navigation`, and `next/link` — Next-coupled, so by the
  architecture cut line they **cannot** move to `@camp404/ui`). The redesign delta is purely
  *recomposition* onto the promoted leaf components — **no behaviour change**.
- **Home / target file paths (unchanged from today):**
  - `apps/web/app/auth/sign-in-form.tsx` (`"use client"`)
  - `apps/web/app/auth/sign-up-form.tsx` (`"use client"`)
  - Mounted by `apps/web/app/auth/[path]/page.tsx` inside `apps/web/components/auth-shell.tsx`
    (the `AuthShell` organism — PROMOTE-but-keep-app-local, its own entry; not re-planned here).
- **Note on "organism" tier vs. file location:** unlike most organisms which are board-driven
  presentational shells, these two are *behavioural* client components (form state machine + Better
  Auth client calls). They are organisms because they compose multiple molecules and own a multi-state
  flow, but they live next to their route, not in the shared package.

---

## Current state — what exists today

Both files are working, shipped `"use client"` components. Verified line-by-line.

### `apps/web/app/auth/sign-in-form.tsx` (188 lines)

- `"use client"`; imports `Link` (`next/link`), `useRouter`/`useSearchParams` (`next/navigation`),
  `useEffect`/`useState`/`FormEvent` (react), and the three **atoms** `Button`, `Input`, `Label` from
  `@camp404/ui/components/*`, plus `authClient` from `@/lib/auth-client`.
- `safeCallbackUrl(raw)` (lines 17–22) — pure open-redirect guard: `null`/empty → `/`; not starting
  `/` → `/`; starting `//` → `/`; else passthrough. **This is the only pure helper in the file.**
- `SignInForm()` (lines 24–172):
  - reads `callbackURL = safeCallbackUrl(searchParams.get("callbackURL"))` (line 27);
  - `authClient.useSession()` → `{ data: session, isPending: sessionPending }` (line 28);
  - local state `email`/`password`/`error`/`loading` (lines 29–32);
  - **auto-forward `useEffect`** (lines 38–43): when `!sessionPending && session?.user && callbackURL !== "/"`
    → `window.location.replace(callbackURL)`;
  - `handleSubmit` (lines 45–77): `preventDefault` → clear error → `email.trim()` presence
    ("Email is required") → `password` presence ("Password is required") → `setLoading(true)` →
    `authClient.signIn.email({ email, password, callbackURL })` → on `result.error`
    set `result.error.message ?? "Sign in failed"` + `setLoading(false)`; else
    `router.replace(callbackURL)` + `router.refresh()`; `catch` → `err.message ?? "Sign in failed"`;
  - `handleGoogle` (lines 79–94): clear error → `setLoading(true)` →
    `authClient.signIn.social({ provider: "google", callbackURL: "/auth" })`; `catch` →
    "Google sign in failed".
  - **Markup (lines 96–171):** `<form className="flex flex-col gap-6">` containing — a centred header
    (`<h1 class="text-2xl font-bold">Welcome back</h1>` + muted subhead with verbose
    `text-[color:var(--color-muted-foreground)]`); a hand-rolled email field
    (`<div className="grid gap-2"><Label htmlFor="signin-email"/><Input …/></div>`); a password field
    that nests a "Forgot your password?" `<Link>` inline in the label row; an inline error
    `<p className="text-sm text-[color:var(--color-destructive)]" role="alert">`; submit
    `<Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>`;
    a hand-rolled labelled divider (`<div className="relative …"><div … border-t …/><span …>Or continue with</span></div>`);
    and a Google `<Button variant="outline" className="w-full">` containing a file-local `<GoogleMark/>`
    + "Continue with Google".
  - `GoogleMark()` (lines 174–188): the single-path `viewBox="0 0 24 24"` "G" SVG, `h-4 w-4 shrink-0`,
    `fill="currentColor"`, `aria-hidden`.

### `apps/web/app/auth/sign-up-form.tsx` (192 lines)

- Same imports **minus `useSearchParams`/`useEffect`** (sign-up never reads search params or
  auto-forwards).
- `SignUpForm()` (lines 18–175): state `email`/`password`/`confirmPassword`/`error`/`loading`;
  - `handleSubmit` (lines 26–63): presence checks + `password !== confirmPassword` →
    "Passwords do not match" → `authClient.signUp.email({ email, password, name: trimmedEmail, callbackURL: "/" })`
    → `router.replace("/")` + `router.refresh()`; error/catch fallback "Sign up failed";
  - `handleGoogle` (lines 65–81): identical to sign-in except fallback "Google sign up failed";
  - **Markup (lines 83–174):** same `<form className="flex flex-col gap-6">` shell; header
    "Create your account" + subhead "Set a password or continue with Google. We'll ask the rest in
    the questionnaire."; three hand-rolled fields (email / password / **confirm password**); inline
    error `<p>`; submit `{loading ? "Creating account…" : "Create account"}`; the same hand-rolled
    divider + Google outline button; and a footer
    `<p>Already have an account? <Link href="/auth/sign-in">Sign in</Link></p>`.
  - `GoogleMark()` (lines 177–191): **verbatim duplicate** of the sign-in SVG (the duplication the
    component-library + surface-02 §Open-questions #1 + OAuthButton plan all call out).

### Host route + shell (context, not re-planned here)

- `apps/web/app/auth/[path]/page.tsx` (`force-dynamic`): `path==="sign-up"` →
  `<AuthShell hideBack><SignUpForm/></AuthShell>`; `path==="sign-in"` →
  `<AuthShell hideBack><Suspense fallback={null}><SignInForm/></Suspense></AuthShell>`; anything else →
  bare `<main … max-w-md>` + `<AuthView path={path}/>` (hosted Neon Auth fallback).
- `apps/web/app/auth/page.tsx` (`force-dynamic`): bare `/auth` verifier-exchange landing —
  `getAuthenticatedUser()` → `redirect("/")` else `redirect("/auth/sign-in")`. No UI.
- `apps/web/components/auth-shell.tsx`: centred `min-h-svh bg-[color:var(--color-muted)] p-6 md:p-10`
  shell, `w-full max-w-sm`, optional Back (`hideBack` suppresses), `Card`/`CardContent p-6 md:p-8`,
  optional `footer`.
- `apps/web/lib/auth-client.ts`: `authClient = createAuthClient()` (Neon Auth / Better Auth,
  same-origin `/api/auth/*`).

**Gaps vs spec (what the redesign fixes — all presentational, zero behaviour change):**

1. Forms hand-roll `Label`+`Input`+error `<p>` instead of composing **`InputField`** (per molecule-inputfield.md §Absorbs; sign-in/sign-up are listed migration targets #1 and #2).
2. `GoogleMark` is **duplicated verbatim** across both files → must become the shared **`OAuthButton`** + exported `GoogleMark` (molecule-oauthbutton.md §Absorbs).
3. The "Or continue with" rule is a hand-rolled inline `relative … border-t … span` block in both files → must become the **`Divider`** atom `label="Or continue with"` (atom-divider.md §Current-state, the two listed inlines).
4. The inline error `<p className="text-sm text-[color:var(--color-destructive)]" role="alert">` → must become the **`Alert`** molecule `tone="destructive"` (molecule-alert.md §Absorbs; both files listed).
5. Verbose off-token classes (`text-[color:var(--color-muted-foreground)]`, `text-[color:var(--color-destructive)]`, `border-[color:var(--color-border)]`, `bg-[color:var(--color-card)]`) → P1-5 token-spelling codemod short forms; most are absorbed by the leaf components, the header subhead is the one residual to convert in-place.

---

## Composition — leaf components, core helpers, services

### Leaf components consumed (after recompose)

| Leaf | Plan | Verdict | Role in these forms |
|---|---|---|---|
| `InputField` | [molecule-inputfield.md](./molecule-inputfield.md) | PROMOTE (→ `@camp404/ui`) | Email / Password (sign-in); Email / Password / Confirm-password (sign-up). Carries `label`, `id`, `type`, `autoComplete`, `required`, `disabled`, controlled `value`/`onChange`. (Sign-in's "Forgot your password?" link stays a sibling in the password field's label row — see API note.) |
| `OAuthButton` (+ exported `GoogleMark`) | [molecule-oauthbutton.md](./molecule-oauthbutton.md) | PROMOTE (→ `@camp404/ui`) | The Google CTA. `<OAuthButton onClick={handleGoogle} disabled={loading} />` (default label "Continue with Google"). Replaces the local `<Button variant="outline">…<GoogleMark/></Button>` block + the duplicated `GoogleMark` function in both files. |
| `Divider` | [atom-divider.md](./atom-divider.md) | NEW (→ `@camp404/ui`) | `<Divider label="Or continue with" />` (labelled variant). Replaces the hand-rolled `relative … border-t … span` block in both files. |
| `Alert` | [molecule-alert.md](./molecule-alert.md) | PROMOTE (→ `@camp404/ui`) | `{error && <Alert tone="destructive">{error}</Alert>}` (body-only, no title — `role="alert"`). Replaces the inline error `<p>`. |
| `Button` | [atom-button.md](./atom-button.md) | REUSE | The full-width primary submit only (default variant). `<Button type="submit" className="w-full" disabled={loading}>`. (The outline Google button is now inside `OAuthButton`.) |
| `AuthShell` | component-library §AuthShell (PROMOTE-keep-app-local, `apps/web/components/auth-shell.tsx`) | REUSE | Host shell — not composed *inside* these forms; the forms are its `children`. Listed for completeness. |

> **Headers, the "Forgot password" `Link`, and the sign-up footer `Link`** are not separate library
> components — they remain inline `<h1>`/`<p>`/`next/link` in the form files (board draws them as
> bespoke per-surface copy; surface-02 §Layout). Only their verbose token classes are codemod-fixed.

### `@camp404/core` helpers

- **`safeCallbackUrl`** (currently inline in `sign-in-form.tsx:17-22`): a pure open-redirect guard.
  Architecture/service-layer-01 do **not** list it in the extraction table, so the default is
  **REUSE in place** (stays a file-local pure function). *Optional consistency move:* it could land in
  `@camp404/core` as `safeCallbackUrl` (pure, no Next, trivially unit-testable) alongside the other
  pure access helpers — flag as a low-value optional extraction, **not** a prerequisite. **Recommend
  keep in-file this pass** (single consumer; moving it is churn for marginal gain — same logic as the
  architecture "stay pure-but-in-app" call for view-models).
- **No clearance/rank core helpers** — this surface carries no gating (service-layer-01 line 27:
  "Pre-spine; carries **none** of the gating states"). No `requireClearance`, `rankLevel`,
  `deriveViewerRank`, `CaptainLock`.

### Services / server-actions / auth client calls

These forms call the **Neon Auth (Better Auth) client directly** — there are no `"use server"`
actions and no Camp 404 Drizzle tables touched (surface-02 §Data: *"does not touch any Camp 404
Drizzle tables… operates on the Neon / Better Auth session"*). The service-layer identity domain
(01) only *reads back* the resulting session downstream on `/`; it is **not** invoked here.

| Call | Where | Payload |
|---|---|---|
| `authClient.signIn.email` | sign-in submit | `{ email, password, callbackURL }` (`callbackURL` from `safeCallbackUrl`, default `/`) |
| `authClient.signUp.email` | sign-up submit | `{ email, password, name: email, callbackURL: "/" }` (`name = email` is intentional — Better Auth requires non-null; displayName reconciled later from the burner profile, per surface-02 §Data) |
| `authClient.signIn.social` | both Google handlers | `{ provider: "google", callbackURL: "/auth" }` (forces the proxy verifier→cookie exchange) |
| `authClient.useSession` | sign-in only | reads `{ data: session, isPending }` for the auto-forward effect |
| `getAuthenticatedUser()` | `apps/web/app/auth/page.tsx` (host, not the form) | bare-`/auth` landing redirect decision |

### Server-component vs `"use client"` split

- **`"use client"` (the forms):** both `SignInForm` and `SignUpForm` — they own `useState`,
  `useEffect`, `useRouter`, `useSearchParams`, browser-only `authClient.*` and `window.location`.
  Unchanged.
- **Server component (the host):** `apps/web/app/auth/[path]/page.tsx` and `apps/web/app/auth/page.tsx`
  are `force-dynamic` server components. `SignInForm` is wrapped in `<Suspense fallback={null}>`
  because it reads `useSearchParams()` (surface-02 §Layout). `SignUpForm` is **not** wrapped
  (no search-params dependency).
- **Leaf components** (`InputField`, `OAuthButton`, `Divider`, `Alert`) are presentation-only and
  client-safe; they introduce no server/client boundary of their own.

---

## API & data flow

### Inputs / props

- **`SignInForm`** — takes **no props**. It self-sources `callbackURL` from `useSearchParams()`.
  Internal controlled state: `email`, `password`, `error: string | null`, `loading: boolean`, plus the
  read-only `session`/`sessionPending` from `authClient.useSession()`.
- **`SignUpForm`** — takes **no props**. Internal controlled state: `email`, `password`,
  `confirmPassword`, `error: string | null`, `loading: boolean`. The confirm field is the only
  structural difference from sign-in.

### What it fetches vs receives

- **Fetches (client-side, at submit / on Google click):** the Better Auth session via
  `authClient.signIn.email` / `signUp.email` / `signIn.social`; live session state via
  `authClient.useSession()` (sign-in).
- **Receives:** nothing from a server component — both forms are self-contained client components
  rendered as `AuthShell` children. `callbackURL` is read from the URL, not passed down.

### State flow

1. Controlled inputs update local `email`/`password`(/`confirmPassword`) on each keystroke.
2. Submit → `e.preventDefault()` → `setError(null)` → local validation → `setLoading(true)` → auth call.
3. Success → `router.replace(target)` + `router.refresh()` → component unmounts (navigation). **`loading`
   is deliberately never reset to `false` on success** (the page navigates away — surface-02 §Validation).
4. Error → `setError(message)` + `setLoading(false)` → re-enable inputs/buttons → `Alert` mounts.
5. Sign-in only: the auto-forward `useEffect` fires on resolved session when `callbackURL !== "/"`,
   `window.location.replace(callbackURL)` — user never sees the form.

### Actions + validation

| Form | Local validation (pre-network) | Action |
|---|---|---|
| Sign-in | `email.trim()` non-empty → "Email is required"; `password` truthy → "Password is required" | `authClient.signIn.email` then `router.replace(callbackURL)` |
| Sign-up | same presence checks **+** `password !== confirmPassword` → "Passwords do not match" | `authClient.signUp.email` then `router.replace("/")` |
| Google (both) | none | `authClient.signIn.social({ provider:"google", callbackURL:"/auth" })` |

- No format/length rule client-side beyond native `type="email"` + `required` (validation now carried
  by the `InputField`'s underlying `Input`). Better Auth may enforce a server minimum-length →
  surfaced via the server-error `Alert` (surface-02 §Open-questions #4).
- Error precedence (unchanged): `result.error.message` → per-call fallback string → thrown
  `err.message` → generic fallback.

---

## States — full matrix incl. gating

### Global state matrix (both forms)

| State | InputFields | Submit Button | OAuthButton | Alert slot |
|---|---|---|---|---|
| **Empty / initial** | enabled, blank | enabled, default label ("Sign in" / "Create account") | enabled | absent |
| **Populated** | enabled, user values | enabled, default label | enabled | absent |
| **Submitting** | `disabled` (all fields) | `disabled`, loading label ("Signing in…" / "Creating account…") | `disabled` | absent |
| **Validation error** | re-enabled | re-enabled, default label | re-enabled | `<Alert tone="destructive">` (`role="alert"`) |
| **Server error** | re-enabled | re-enabled, default label | re-enabled | `<Alert tone="destructive">` (`role="alert"`) |
| **Success** | n/a — page navigates away | n/a | n/a | n/a (`loading` stays `true`) |
| **Disabled (during Google)** | `disabled` | `disabled` | `disabled` | absent (until error) |

> All four interactive children read the **same `loading` flag** for their `disabled` state — a single
> source of truth. `InputField` forwards `disabled`; `OAuthButton` takes `disabled`; the submit
> `Button` takes `disabled`.

### Sign-in–specific states (no sign-up analogue)

| State | Trigger | Behaviour |
|---|---|---|
| **Session-pending** | `authClient.useSession()` `isPending === true` | Auto-forward effect suppressed until session resolves. |
| **Already authenticated (non-default callback)** | `session?.user` exists + `callbackURL !== "/"` | `window.location.replace(callbackURL)` — form never interactive. |
| **`<Suspense>` pending** | `useSearchParams()` not yet resolved | Host renders `null` fallback briefly (surface-02 §States). |

### Validation-error messages (rendered in the destructive `Alert`)

| Trigger | Message |
|---|---|
| Email empty | "Email is required" |
| Password empty | "Password is required" |
| Passwords mismatch (sign-up only) | "Passwords do not match" |
| Email sign-in failure | `result.error.message` ?? "Sign in failed" |
| Email sign-up failure | `result.error.message` ?? "Sign up failed" |
| Google sign-in failure | `err.message` ?? "Google sign in failed" |
| Google sign-up failure | `err.message` ?? "Google sign up failed" |

### Gating / preview-but-locked

**None — by design.** This is the sole *unauthenticated* surface; it is *pre-spine* and carries no
invite gate, rank check, onboarding gate, or approval check (surface-02 §States "Gating states: This
surface carries **none**"; service-layer-01 line 27). **`CaptainLock` does not appear here**, and no
`requireClearance`/`ViewerRank` decision is computed. All gating lives downstream on `/`,
`/signup/required` (unit 03), `/pending-approval` (unit 05), and `/captains/*`.

---

## Build steps — ordered, with prerequisites + acceptance + tests

> Plan-doc only. This organism is a **recompose**, not a rebuild — so its build *follows* the leaf
> plans. It rides Phase 0 (foundations tokens) + Phase 5 (NEW reusables) in `architecture.md`.

### Prerequisites (leaves/services that must land first)

| Prerequisite | From | Why it gates |
|---|---|---|
| Phase 0 — status tokens (`--color-success`/`-warning`), radius, `--text-*` | `foundations-tokens.md` | `Alert` (destructive tone), `InputField`, `Divider` resolve their tokens. Hard gate. |
| `InputField` shipped + exported | `molecule-inputfield.md` | Replaces the hand-rolled field divs. |
| `OAuthButton` + `GoogleMark` shipped + exported | `molecule-oauthbutton.md` | Replaces the duplicated local Google block. |
| `Divider` shipped + exported | `atom-divider.md` | Replaces the inline "Or continue with" rule. |
| `Alert` shipped + exported (needs Phase-0 tokens) | `molecule-alert.md` | Replaces the inline error `<p>`. |
| `Button`, `AuthShell`, `auth-client` | already exist | REUSE unchanged. |
| **No service/migration prerequisite** | — | Surface touches no Camp 404 tables; the one migration (`0012`) and all `core` extractions are irrelevant here. |

### Steps

1. **Migrate sign-in fields → `InputField`** (`sign-in-form.tsx`). Replace the two
   `<div className="grid gap-2"><Label/><Input/></div>` blocks. Email: `id="signin-email" type="email"
   autoComplete="email" required`. Password: `id="signin-password" type="password"
   autoComplete="current-password" required` — keep the "Forgot your password?" `Link` as a sibling in
   the field's label row (InputField owns the `label` text; the link stays adjacent — render the link
   beside/below the `InputField`, do not lose it). Wire `value`/`onChange`/`disabled={loading}`.
   - *Acceptance:* both fields render via `InputField`; `getByLabelText("Email"|"Password")` resolves;
     "Forgot your password?" link still navigates to `/auth/forgot-password`; no remaining
     `grid gap-2` + bare `<Input>` pattern.

2. **Migrate sign-up fields → `InputField`** (`sign-up-form.tsx`). Three fields: Email
   (`new-password`? no — `autoComplete="email"`), Password (`autoComplete="new-password"`), Confirm
   (`id="signup-confirm-password" type="password" autoComplete="new-password" required`).
   - *Acceptance:* three `InputField`s; confirm field present and controlled; mismatch validation
     unchanged.

3. **Replace error `<p>` → `Alert`** (both files). `{error && <Alert tone="destructive">{error}</Alert>}`.
   - *Acceptance:* `getByRole("alert")` returns the `Alert` body; message text matches the table above;
     no remaining `text-[color:var(--color-destructive)]` field/error `<p>`.

4. **Replace inline divider → `Divider`** (both files). `<Divider label="Or continue with" />`.
   - *Acceptance:* the labelled divider renders; no remaining `relative … border-t … span` block; no
     `border-[color:var(--color-border)]`/`bg-[color:var(--color-card)]` verbose classes in the divider.

5. **Replace Google block → `OAuthButton`; delete local `GoogleMark`** (both files).
   `<OAuthButton onClick={handleGoogle} disabled={loading} />` (default label "Continue with Google").
   Remove both file-local `GoogleMark` functions.
   - *Acceptance:* no `GoogleMark` function remains in either file; Google CTA fires `handleGoogle`;
     `disabled={loading}` honoured; visual parity (outline button + "G" glyph + label).

6. **Token-spelling codemod (P1-5) on residual inline copy** (both files). Convert the header subhead
   `text-[color:var(--color-muted-foreground)]` and the sign-up footer's muted classes to short token
   forms; keep `<h1>`/subhead/footer as inline copy.
   - *Acceptance:* `grep "text-\[color:var(--color-" apps/web/app/auth/sign-*-form.tsx` returns zero.

7. **Preserve behaviour verbatim.** Do **not** touch `safeCallbackUrl`, the auto-forward `useEffect`,
   the validation order, the `authClient.*` payloads (`name: email`, `callbackURL` targets), the
   success `router.replace`+`refresh` (and the no-reset-`loading`-on-success rule), or the
   `<Suspense fallback={null}>` wrapper on the host.
   - *Acceptance:* diff is recompose-only; no change to any control-flow line.

### Tests

- **Existing to protect:** `apps/web/tests/e2e/authenticated.spec.ts` (E2E session bypass via
  `E2E_TEST_MODE` → `/api/test/login`) must stay green — these forms are bypassed in that path, so it
  is a non-regression guard for the route, not the forms.
- **NEW unit (RTL, app-side) — sign-in:** empty-email → "Email is required" `Alert`; empty-password →
  "Password is required"; submit calls `authClient.signIn.email` with `{email,password,callbackURL}`;
  `result.error` surfaces `result.error.message`; loading disables all four children; auto-forward
  effect calls `window.location.replace` when `session.user` + `callbackURL!=="/"`.
- **NEW unit (RTL, app-side) — sign-up:** mismatch → "Passwords do not match" (no network call);
  submit calls `authClient.signUp.email` with `name === email` + `callbackURL:"/"`; footer "Sign in"
  link points to `/auth/sign-in`.
- **NEW unit — `safeCallbackUrl`** (wherever it lands): `null`/empty→`/`, `//x`→`/`, `http://x`→`/`,
  `/home?x=1`→passthrough. (Closes the current no-direct-test gap; trivially pure.)
- **Leaf coverage** (`InputField`, `OAuthButton`, `Divider`, `Alert`) lives in the leaf plans'
  `@camp404/ui` suites — not duplicated here.

---

## Consumers — which surfaces mount it

| Surface | Route | Mount |
|---|---|---|
| **Auth — sign-in** ([surfaces/02-auth.md](../../surfaces/02-auth.md)) | `/auth/sign-in` | `apps/web/app/auth/[path]/page.tsx` → `<AuthShell hideBack><Suspense fallback={null}><SignInForm/></Suspense></AuthShell>` |
| **Auth — sign-up** ([surfaces/02-auth.md](../../surfaces/02-auth.md)) | `/auth/sign-up` | `apps/web/app/auth/[path]/page.tsx` → `<AuthShell hideBack><SignUpForm/></AuthShell>` |

Entry point: unauthenticated `/` → `LandingHero` CTA "Are you lost?" → `/auth/sign-in`
([surfaces/01-landing.md](../../surfaces/01-landing.md)). Sign-up reached via the sign-up card's
footer link or direct URL. No other surface mounts either form.
