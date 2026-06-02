### 2. Sign in / Sign up / Recovery
**Purpose:** The unauthenticated entry surface where a person creates an account or signs in (email/password or Google), with recovery and other side-trips handed off to Neon Auth's hosted UI.
**Layout & elements:** Mobile single column, centred card. Sign-in: heading "Welcome back", subtext "Sign in to your Camp 404 account.", Email input (placeholder "you@example.com"), Password input, "Forgot your password?" link, submit "Sign in", "Or continue with" divider, outline "Continue with Google" (Google "G" mark). Sign-up: heading "Create your account", subtext "Set a password or continue with Google. We'll ask the rest in the questionnaire.", Email, Password, Confirm password, submit "Create account", "Or continue with" divider, "Continue with Google", footer "Already have an account? Sign in". Optional shell "Back" button (suppressed here) and optional footer (e.g. "Camp 404 is invite-only."). Entry CTA from landing: "Are you lost?". Recovery/reset/sign-out/magic-link/callback render the hosted Neon Auth view.
**Every action (preserve all):**
- Sign in (email/password): validate, then authenticate; success replaces+refreshes to callback URL; error shows message.
- Sign in (Google) / Sign up (Google): launch OAuth, always return through `/auth` so the verifier→cookie exchange fires, then forward home.
- Sign up (email/password): validate incl. password match; success replaces+refreshes to `/`.
- "Forgot your password?" → `/auth/forgot-password` (hosted view).
- "Already have an account? Sign in" → `/auth/sign-in`. Back → router back (when shown).
- All inputs + submit + Google buttons disabled while loading.
**States to design:**
- Empty/initial: blank fields, no error. Populated: controlled values.
- Loading/submitting: fields+buttons disabled; submit text "Signing in…" / "Creating account…".
- Validation-error: alert text in destructive color, fields re-enabled.
- Server error: same alert slot (fallbacks "Sign in failed" / "Sign up failed" / "Google sign in failed" / "Google sign up failed").
- Success: navigates away (component unmounts). Disabled: whole form in-flight.
- Session-pending / already-authenticated (sign-in only): auto-forward to callback URL when a session exists and callback ≠ "/".
- Gating/role/locked/pending/rejected states: NOT shown here — this surface only authenticates.
**Options & exact values:** Social provider: "google" only. callbackURL: Google → "/auth"; email sign-up → "/"; email sign-in → sanitised `?callbackURL` (default "/"). Input attrs: email type="email" autoComplete="email" required; sign-in password autoComplete="current-password"; sign-up password+confirm autoComplete="new-password"; all required. Copy: Welcome back / Sign in to your Camp 404 account. / Signing in… / Sign in / Or continue with / Continue with Google / Forgot your password? / Create your account / Set a password or continue with Google. We'll ask the rest in the questionnaire. / Creating account… / Create account / Already have an account? / Sign in / Back / Are you lost?
**Validation & rules:**
- Email required ("Email is required"); password required ("Password is required"); sign-up password must equal confirm ("Passwords do not match"). No client length/strength rule.
- `safeCallbackUrl`: falsy → "/"; not starting with "/" → "/"; starting with "//" → "/"; else passthrough (open-redirect guard).
- OAuth must round-trip through `/auth` or no session cookie is set. Sign-up is open by design (no invite field; invite gate is post-auth at `/signup/required`). Name is sent as the email to satisfy Better Auth's required field. Error precedence: server message, else fallback, else generic.
**Do-not-drop:** Two auth methods (email/password + Google) for both sign-in and sign-up, the open-redirect-guarded callback, and the OAuth `/auth` round-trip that sets the session cookie. Recovery/reset/sign-out/magic-link/callback are the only paths that fall through to the hosted Neon Auth view (no bespoke screens — these are the orphaned/unbuilt subpaths).
