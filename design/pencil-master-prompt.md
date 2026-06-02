# Camp 404 — full-app design prompt (paste into Pencil)

This single prompt asks Pencil to design **every screen of the Camp 404 app** as one cohesive system. The information architecture, the per-screen functional contract, and the design tokens are **fixed** and must be honoured exactly; the visual craft — layout rhythm, motion, iconography, the expression of the brand — is **yours** to author. There are **23 surfaces** specified below; design each as its own frame, all sharing a single dark, mobile-first, on-brand language.

## How to use this prompt

- **Build the design system FIRST — before any screen.** Step 1 is the foundation, and every screen is designed *from* it: (a) wire the **Tailwind theme tokens** below (the single dark `@theme`); (b) establish the **typography** system — a neutral geometric **sans** for body + headings and a **monospace** (ui-monospace / JetBrains-class) for the terminal/command motif (landing hero, code-like labels, invite codes, cursors, timers), on a consistent type scale; (c) build the **shadcn/ui ("new-york" style) + Tailwind component primitives** of surface #24 (buttons, inputs, labels, checkboxes, selects, sliders, cards, dialogs, popovers, command palettes, comboboxes, avatars). Every screen that follows MUST be composed from these shared primitives and tokens — no bespoke one-off controls. Only once the design system exists do you design the screens, in the order given.
- Design each `###` surface below as its **own frame/screen** (or component sheet, for the primitive kit), in the order given.
- **Preserve every listed action, state, option, enum, and validation rule** for each surface — these are the load-bearing functional contract, not suggestions. Re-style freely; never drop a capability. If a surface lists five states, design five states; if it lists three error messages, show three; if a control has an exact label, use that label.
- This is **mobile-first, single-column (~430px), DARK only**. Do not invent phone chrome (no iOS status bar, no "9:41" clock, no battery/signal, no bezel, no OS tab bar).
- For each surface, feel free to offer **1–2 visual directions** that hit the same functional spec (e.g. one restrained/utilitarian, one more expressive with the camp's neon/terminal energy), so the camp can pick the strongest expression.

## Global rules (apply to EVERY screen)

- **Theme & form factor:** mobile-first, single column (~430px), **DARK only**. No invented phone chrome. The one exception is the home dashboard: its action-tile grid is **2 columns on mobile and expands to multiple columns on desktop** — every other surface stays single-column.
- **Identity:** Camp 404 is a desert-burn camp with a hacker/terminal soul. Base is a **midnight-violet** field; **magenta** is the primary action colour; **electric-blue/cyan** is the accent. The brand motif is **terminal + glitch**: CRT scanlines, RGB-split "chromatic aberration", a sweeping scanbeam, blinking monospace cursors, and the signature glitchy **"404 — camp not found"** identity. It should feel like a dusty neon command console at night — playful, a little broken-on-purpose, never corporate. Lean on the motif for the landing + accents, not every screen.
- **DROP-NO-FUNCTIONALITY contract — two halves:**
  - *You may freely change:* layout & spacing, colour application within the token set, type scale & pairing, icon choices, motion & transitions, the navigation metaphor, and input styling — **so long as the input *kind* survives** (a slider stays a slider, a toggle stays a segmented control, a combobox stays a searchable select).
  - *You must preserve:* **every feature, action, state, enum value, option, exact copy string, and validation rule** listed per surface. The UI must be able to represent exactly the options enumerated — no more, no less.
- **Redundant channels:** never let colour be the only carrier of meaning — keep icon + label alongside any status colour. Disambiguate entities by icon + label, never by inventing a per-entity hue.

## Design tokens (exact — never guess a hex)

Use only these tokens (the single dark `@theme`). Reference colours as `var(--color-*)` or the hex mirror — never invent a hex. OKLCH is authoritative; the hex mirror is for Pencil / OG / non-OKLCH contexts.

| Token | OKLCH | Role |
|---|---|---|
| `--color-background` | `oklch(0.15 0.05 295)` | midnight-violet page base |
| `--color-foreground` | `oklch(0.97 0.02 330)` | primary text |
| `--color-primary` | `oklch(0.65 0.27 340)` | hot magenta — dominant brand / CTAs |
| `--color-primary-foreground` | `oklch(0.99 0.005 340)` | text on primary |
| `--color-accent` | `oklch(0.62 0.18 255)` | electric-blue — highlights, focus haloes, 2nd brand |
| `--color-accent-foreground` | `oklch(0.99 0.005 255)` | text on accent |
| `--color-secondary` | `oklch(0.42 0.18 320)` | deeper magenta-violet — quieter interactive surfaces / pills |
| `--color-secondary-foreground` | `oklch(0.98 0.01 330)` | text on secondary |
| `--color-muted` | `oklch(0.22 0.06 295)` | auth-page / recessed surface |
| `--color-muted-foreground` | `oklch(0.7 0.05 325)` | secondary text, descriptions, lock reasons |
| `--color-card` | `oklch(0.26 0.08 295)` | card — one step lighter than muted (elevated) |
| `--color-card-foreground` | `oklch(0.97 0.02 330)` | text on card |
| `--color-popover` | `oklch(0.26 0.08 295)` | shares the card surface |
| `--color-popover-foreground` | `oklch(0.97 0.02 330)` | text on popover |
| `--color-border` | `oklch(0.35 0.1 305)` | borders (also `--color-input`) |
| `--color-input` | `oklch(0.35 0.1 305)` | input borders |
| `--color-destructive` | `oklch(0.65 0.22 18)` | errors / destructive |
| `--color-destructive-foreground` | `oklch(0.98 0 0)` | text on destructive |
| `--color-ring` | `oklch(0.65 0.27 340)` | focus ring (= primary) |

**Elevation:** `background` (0.15) → `muted` (0.22) → `card`/`popover` (0.26). Cards sit one step lighter than the page to read as elevated; borders are a brighter violet (0.35) so edges read on the dark base.

**Hex mirror (for Pencil / OG / non-OKLCH contexts):** Background `#0d061e` · Foreground `#f7ecf3` · Magenta `rgba(255,0,140,0.92)` · Cyan/accent `rgba(0,220,255,0.92)`.

**Glitch / CRT motif (decorative only, `aria-hidden`):** magenta `--color-primary` + cyan `--color-accent` are the RGB-split pair; scanlines/noise/scanbeam ride atop `--color-background` at low opacity. The landing hero's glitch CSS is the only bespoke colour outside the tokens and still derives from them.

**Radius:** `--radius: 0.625rem` (10px) — the canonical corner unit; pills use full radius.

**Type:** No `--font-*` tokens exist yet — UI falls back to a default **sans** stack, with a **monospace** treatment for the terminal/command motif (landing hero, code-like labels, invite codes, cursor lines, timers). Use a neutral geometric sans for body and a mono (ui-monospace / Berkeley/JetBrains-class) for terminal accents. Headings bold; helper/meta text in `--color-muted-foreground`.

## Global states every screen must handle

There are **NO offline/sync states** and **NO budget/over-target states** anywhere in this app (it is server-only). The gating spine is **ordered and exit-bearing** (auth → invite → onboarding → approval); no gate ever strands the user — every gated screen keeps a working **Sign out** escape.

| State | Means | Required grammar |
|---|---|---|
| Empty | No data yet for this surface | Calm muted placeholder + (where relevant) a next action; never a broken/blank panel |
| Loading | Server-rendered; data resolves before paint | No client spinner/skeleton unless a surface explicitly defines one (most don't) |
| Populated | Happy path with real data | Full surface per its spec |
| Validation-error | Client/server rejected input | Inline per-field message and/or a `role="alert"` destructive banner with the **exact** strings listed |
| Submitting / pending | A mutation is in flight | Disable inputs + buttons; swap to the listed pending label / in-button spinner; never double-submit |
| Success | Mutation succeeded | Usually a server **redirect** (no in-page banner) unless the surface defines a success view/notice |
| Disabled | Control not currently actionable | Dimmed, non-interactive; never hide the reason |
| Invite-gated | Signed-in user with no invite code on file | Redirect to `/signup/required` (the invite gate) |
| Onboarding-incomplete | No completed `burner_profile` | Redirect to `/onboarding/questionnaire` |
| Pending-approval | Redeemed an approval-required invite, awaiting a captain | Redirect to `/pending-approval` (Clock branch); exit only via approval or sign-out |
| Rejected | A captain rejected the application (terminal) | Redirect to `/pending-approval` (ShieldX branch); no app access |
| Captain-only-locked | Viewer rank below the surface's required rank | Always a **visible-but-locked** view — the surface still opens for any signed-in member, but a viewer below the required rank sees **no data**: a dimmed/blurred layout with a `Lock` glyph and a "Captain access only" note, never the real records. No captain surface hard-redirects a member away for rank (applies to home, control-panel, camp-management, captain tools hub, and announcements alike) |

## Screens & components to design

Design each of the following as its own frame. Real labels and copy are quoted; preserve every action, state, and option.


### 1. Landing (signed-out hero)
**Purpose:** The single signed-out splash that leans into the "404 — camp not found" terminal/glitch identity and routes a visitor toward sign-in.
**⚠️ THIS SCREEN ALREADY EXISTS and is live at https://www.camp-404.com — DUPLICATE it faithfully.** Match its layout, copy, colours, type sizing, and every glitch/CRT animation to the spec below — this is a reproduction, not a reinterpretation. (Landing is the one place the glitch CSS is bespoke and authoritative; preserve the exact values. The rest of the app still composes from the shared token/primitive system.)
**Layout & elements:** Full-bleed dark `--color-background` panel — `min-h-[100dvh]`, `overflow-hidden`. A single **centered** column (`max-w-md`, `sm:max-w-xl`, ~24px side padding, top padding 56→80px, bottom 40px) holds three vertically space-between groups (gap-10), top→bottom:
  1. **Eyebrow + tagline** (centered, gap-3): a tiny uppercase **"Camp 404"** wordmark — `~10px`, `letter-spacing 0.5em`, `--color-muted-foreground` (this is the accessible `<h1>`); beneath it the **"Error 404 — Camp not found"** tagline in **monospace**, `~11px`, uppercase, `letter-spacing 0.3em`, `--color-foreground`, with chromatic RGB-split aberration (see Glitch detail).
  2. **Giant glitched "404"** glyph stack — the centered hero element (see Glitch detail).
  3. **CTA group** (`max-w-xs`, centered): a full-width **primary** Button (size `lg`) labeled **"Are you lost?"** → `/auth/sign-in`; below it (mt-4) a blinking **monospace** cursor line **"$ awaiting input_"** — `~10px`, uppercase, `letter-spacing 0.3em`, `--color-muted-foreground`, `aria-hidden`.
Three ambient full-bleed layers sit behind everything (`absolute inset-0`, `pointer-events-none`, `aria-hidden`, `z-0`): **scanlines**, **dot-noise** (layer opacity ~0.06), and a sweeping **scanbeam** bar (pinned top, `h-24`). Foreground content is `z-10`.
**Glitch / CRT motion (EXACT — reproduce faithfully; all decorative layers `aria-hidden`):**
- **Chromatic tagline:** `text-shadow: -1.5px 0 rgba(255,0,128,0.8), 1.5px 0 rgba(0,200,255,0.8)` — magenta-left / cyan-right split. Static.
- **Scanlines:** repeating horizontal `linear-gradient` — transparent 0→2px, then `rgba(255,255,255,0.045)` 2→3px (fine ~3px CRT lines). Static.
- **Dot-noise:** two tiled `radial-gradient` dot fields (`3px` and `7px` grids, white ~0.4–0.6α), `mix-blend-mode: overlay`, layer opacity `~0.06`.
- **Scanbeam:** a vertical gradient bar (transparent → violet `rgba(180,100,255,0.05)` → magenta core `rgba(255,0,200,0.1)` → violet → transparent) sweeping top→bottom — `translateY(-100% → 2200%)`, **7s linear infinite**.
- **The "404" glyph:** monospace, `font-weight 900`, `font-size clamp(7rem, 30vw, 14rem)`, `letter-spacing -0.05em`, `line-height 0.9`, centered — rendered as **FIVE stacked copies** of "404":
   - **base** in `--color-foreground`;
   - **RGB-split magenta** copy `rgba(255,0,140,0.85)`, `mix-blend screen`, jittering LEFT (`translate` −2→−5px) on a **3.7s steps(1) infinite** cycle;
   - **RGB-split cyan** copy `rgba(0,220,255,0.85)`, `mix-blend screen`, jittering RIGHT (+2→+5px) on a **3.7s steps(1) infinite** cycle;
   - **two "tear" layers** (`--color-foreground`, `mix-blend screen`) that `clip-path: inset(...)` slice the glyph into horizontal bands and yank each band sideways (±5→12px) for a single frame, on independent **4.3s** and **5.1s** `steps(1)` cycles — this is the broken-display feel;
   - the whole stack also **shakes** ±1–2px on a **5s steps(1) infinite** cycle.
- **Cursor blink:** opacity toggles `1 ↔ 0.35` on a **1.05s steps(1) infinite** cycle.
- **No `prefers-reduced-motion` fallback** — every animation runs unconditionally; keep the CTA usable regardless.
**Every action (preserve all):**
- Tap/click "Are you lost?" → navigates to `/auth/sign-in` (plain server-rendered anchor; works without JS; never disabled here).
- No other interactions: no forms, inputs, toggles, hover/scroll logic, or client state.
**States to design:**
- Populated → the only runtime state; always the same static splash (no data varies it).
- Loading/empty/validation-error/submitting/success/disabled → not applicable (no data, no form, no submit).
- Authenticated-bypass → if a session exists the hero is NOT shown (control passes to the authed gating spine, out of scope).
- Gating states (invite-gated / onboarding-incomplete / pending-approval / rejected / captain-locked) → never appear here; the hero is the pre-auth state that precedes them.
- Ambient animation → CRT scanlines, noise, scanbeam, shaking/RGB-split/tearing "404", chromatic tagline, blinking cursor run perpetually.
**Options & exact values:** Heading "Camp 404"; tagline "Error 404 — Camp not found"; CTA label "Are you lost?"; cursor "$ awaiting input_"; glyph text "404"; CTA destination `/auth/sign-in`. No runtime enums/flags. (Env-only: `E2E_TEST_MODE`/`camp404_test_user` cookie can bypass the hero.)
**Validation & rules:**
- Render the hero iff the auth check returns null (authenticated users never see it).
- CTA cannot fail to render (server anchor, no JS guard, no error path).
- Decorative elements (overlays, "404" stack, cursor) must stay aria-hidden; keep an accessible heading + accessible CTA link to `/auth/sign-in`.
- No `prefers-reduced-motion` fallback exists; animations run unconditionally — keep CTA usable regardless of motion.
**Do-not-drop:** One accessible CTA link to `/auth/sign-in` plus accessible heading; faithful reproduction of the live camp-404.com glitch/CRT stack (chromatic tagline, scanlines, dot-noise, sweeping scanbeam, the 5-layer RGB-split/tear/shake "404", blinking cursor) — the "404 broken-display" art is identity, not a per-entity hue table. No dead/orphaned variants in this unit.


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


### 3. Invite gate
**Purpose:** A post-auth redemption screen where a signed-in user without an invite code on file enters one to become a camp member, gated before the questionnaire/approval flow.
**Layout & elements:** Mobile single column inside the centred `AuthShell` card (Back button hidden), footer "Camp 404 is invite-only." Top→bottom: heading "One more thing"; body copy — when signed in, "You're signed in as <email>. Camp 404 is invite-only — drop your code below to come aboard." (only the second sentence when no email); label "Invite code" above a single text input (`name="code"`; autocomplete/spellcheck/autocapitalize/autocorrect off; required); inline error region (`role="alert"`, destructive styling); full-width submit button "Enter camp"; a "Sign out" link.
**Every action (preserve all):**
- Type code → fills the required text field.
- Submit "Enter camp" → posts to redeem; on success redirects home; button disabled while pending (label flips to "Checking…").
- Failure → inline `role="alert"` error shows; user stays on the gate.
- "Sign out" link → GET /auth/sign-out; the gate's exit.
**States to design:**
- Empty — input blank on first render, no error.
- Populated — code typed in.
- Submitting — pending; button disabled, label "Checking…".
- Validation-error — error text shown: "Please enter an invite code." / "That invite code isn't valid." / "Too many attempts — wait a few minutes and try again."
- Success — redirect to home (no in-form success UI).
- Disabled — submit disabled while pending.
- Already-has-access / god email — page bounces to home; gate never renders.
- Pending/rejected — NOT shown here; downstream after redemption.
**Options & exact values:** Assigned rank: "captain" | "member" (null = default member). Approval status set here: "pending" or "approved" ("rejected" never set here). Rate limit: 10 attempts per 10 minutes per user. Env config: GOD_EMAILS (bypass gate), INVITE_CODES (unlimited bootstrap codes).
**Validation & rules:**
- Code trimmed; empty → "Please enter an invite code."
- Invalid/expired/revoked/exhausted/race-loser → "That invite code isn't valid."
- Over rate limit → "Too many attempts…"; required attribute blocks empty client submit.
- Env codes checked first (no rank/approval/consume); DB codes atomically consume one use; approval only tightens, never un-approves except into the pending queue.
- Re-entry/god email idempotent: returns ok without re-stamping; visiting gate persists no orphan row.
**Do-not-drop:** The single surface that validates and atomically consumes an invite code to stamp camp membership (inviteCode, optional rank, optional pending-approval) — must keep a working exit (Sign out). Dead within unit: `findUsableInviteCode`, `findInviteCodeByCode`, `createInviteCode`, `testStore.seedInviteCode` are not part of this redemption path.


### 4. Onboarding questionnaire wizard
**Purpose:** A mandatory page-at-a-time burner-profile questionnaire shown right after signup that gates entry to the app.
**Layout & elements:** Mobile single column, wider container (max-w-2xl). Header H1 "Build your burner profile"; subtitle "A few questions so the camp knows who's arriving in the dust. Takes about two minutes." Progress bar with literal text "Step N of 12". Page body: intro pages show centered full-screen heading + body; question pages show title, optional subtitle, then per-question fields. Optional page-level error banner (role="alert"). Footer: left = "Sign out" link (page 0) or "Back" button; right = submit button labelled "Next"/"Skip" or "Finish" on last page.
**Every action (preserve all):**
- Answer a question → updates response, clears that field's inline error.
- Next → validates current page locally; if valid, persists progress (saves to server) and advances; on server error stays and shows errors. Disabled while pending.
- Skip → same as Next; label flips to "Skip" for a lone unanswered optional question; advances.
- Back → goes to previous page, no save/validation. Disabled on page 0 (replaced by Sign out) or while pending.
- Sign out → page-0 escape-hatch link to /auth/sign-out.
- Finish → validates, runs full server validation, persists complete, redirects home. Disabled while pending.
**States to design:**
- Empty → first visit, all fields unanswered, page 0 = optional profile photo.
- Loading → server resolves before first paint; wizard mounts hydrated, no client spinner.
- Populated → returning incomplete user; saved responses pre-fill (progress persists every Next).
- Validation-error → inline per-field errors ("This question is required" etc.) + page banner for _form/_root.
- Submitting → isPending disables Back and submit during any save.
- Success → redirect to "/"; no client success UI; re-entry bounces home.
- Disabled → Back on page 0/pending; submit while pending.
- Invite-gated → no camp access redirects to /signup/required (page + action).
- Onboarding-incomplete → this surface IS the gate; completing satisfies the burner_profile required-action.
- Pending-approval / Rejected → not enforced here; handled downstream after redirect.
**Options & exact values:** 12 pages in order: profile_photo "Add a profile photo"; about_you "About you" (birthday date; phone short_text; country combobox placeholder "Pick your country…" search "Search countries…", "🇿🇦 South Africa" style; id.type toggle passport="Passport"/sa_id="South African ID"; id.number); bio "A bit about you"; burn_ideas "Your ideas for this year's burn"; team_interests_intro (intro "Indicate your interest in whichever teams you want."); team_interests (8 sliders min 0 max 5 step 1, minLabel "Not for me", maxLabel "Sign me up": kitchen, structures, power_and_lighting, sanitation_and_water, health_and_safety, art_and_activities, ministry_of_memes, ministry_of_vibes); cooking_competency scale create="Good cook — I can create recipes"/teach="Adequate — I can teach recipes"/follow="I can follow recipes"/burn="I might burn recipes"; hardware_competency scale design="I design and build rigs from scratch"/build="I can build to a plan"/assist="I can hold the torch and pass tools"/novice="I'd rather not be near the power tools"; leadership_logistics (team_lead.interests multi_select; logistics.driving yes="Yes"/no="No"/maybe="Maybe — still working it out"; logistics.onsite_before yes_full="Yes — the whole build week"/yes_partial="Some of build week"/no="No — I'll arrive on opening day"; logistics.onsite_after yes_full="Yes — through to MOOP sweep"/yes_partial="A day or two"/no="No — I'm out the morning after"); burn_history (history.camp404_years 2019/2022/2023/2024/2025/2026; history.afrikaburn_count 0="None — first one"/1_2="1–2"/3_5="3–5"/6_plus="6 or more"; history.other_burns); burn_intent scale definite="100% coming"/want="Definitely want to"/try="Will try"/unsure="Unsure"/unlikely="Not likely"/not_coming="Definitely not"; dietary (dietary.dislikes, dietary.allergies from DIETARY_INGREDIENTS: dairy="Dairy / lactose", gluten="Gluten / wheat", eggs="Eggs", soy="Soy", peanuts="Peanuts", tree_nuts="Tree nuts", shellfish="Shellfish", fish="Fish", sesame="Sesame", alliums="Onion / garlic", nightshades="Nightshades (tomato, pepper, aubergine)", spicy="Chilli / heat"; dietary.notes). Question kinds (10): slider, single_select, multi_select, short_text, long_text, date, scale, toggle, combobox, image. Version "2026.05.29-v8". Save-failed message: "We couldn't save your answers just now. Please try again — if it keeps happening, let a camp captain know."
**Validation & rules:**
- Required field missing (undefined/null/"") → "This question is required".
- ID number (when typed): passport /^[A-Z0-9]{6,12}$/i → "Letters and digits only — typically 6–12 characters."; sa_id must be 13 digits "Must be exactly 13 digits.", valid YYMMDD "First six digits aren't a valid YYMMDD date.", SA Luhn "Check digit doesn't match — double-check the number."; no type → "Pick the ID document type first".
- Final server validation: text length "Max {maxLength} characters"; slider "Must be between {min} and {max}"; select/toggle/combobox "Not a valid option"; multi_select required empty "Pick at least one option"; date "Use yyyy-mm-dd"/"Not a real date"; scale "Not a valid level"; image "Expected an image URL"; malformed payload "Malformed response payload".
- Non-final saves tolerate missing required answers; unknown response keys dropped.
**Do-not-drop:** A page-stepped, progress-persisting wizard that gates app entry, validates per-page locally + fully on Finish, and splits the ID number out for encryption. Note: SA-ID Luhn/passport format is client-only — the server treats id.number as plain short_text (maxLength 40) and is bypassable.


### 5. Questionnaire field kinds (every input type)
**Purpose:** Render any one questionnaire question with the correct input control for its `kind`, surface prompt/helper/required-marker/error, and emit a typed response value.
**Layout & elements:** Mobile single column. Top→bottom: `<Label>` with the question `prompt` plus a primary `" *"` marker when required; optional muted helper line; the per-kind control; an error line `role="alert"` when present. Placeholders: single_select `"Choose one…"`, combobox `"Select…"` / search `"Search…"` / `"Nothing found."`, long_text dictation button `"Dictate instead"`. Slider shows a 3-up row: minLabel (e.g. `"Not for me"`), live value, maxLabel (e.g. `"Sign me up"`). `fullScreen` variant for a lone `scale`/`long_text`/`image`.
**Every action (preserve all):**
- slider: drag/arrow → integer in `[min,max]` by `step`; untouched reads `min`.
- single_select/toggle/combobox: pick one; combobox filters by typing.
- multi_select: tap each checkbox to add/remove (zero+ allowed).
- short_text/long_text: type (capped at `maxLength`); long_text "Dictate instead" appends transcript joined with `\n`.
- date: native picker → `yyyy-mm-dd`.
- image: tap dropzone → file picker (`accept="image/*"`), crop-to-square upload; red X removes (value `null`).
- Editing clears that field's error; Next/Skip/Finish triggers validation.
**States to design:**
- Empty: each control unfilled (slider→min, scale→middle step highlighted-not-committed, image→"Add photo" dropzone).
- Populated: controls reflect value; selects show resolved labels; image shows photo + remove X.
- Validation-error: destructive line under field.
- Submitting/pending: wizard disables nav; image shows `"Uploading…"` spinner; dictation has requesting/recording/processing/error.
- Success: wizard advances / photo renders.
- Disabled: only AvatarUpload while uploading.
- Gating (invite/pending/rejected/locked): NOT in renderer — gate wizard mount; renderer is rank-agnostic.
**Options & exact values:** 10 kinds: `slider, single_select, multi_select, short_text, long_text, date, scale, toggle, combobox, image`. Defaults: slider `step=1` required=true; short_text maxLength `120`; long_text `1000` required=false; multi_select/image required=false. Catalogue `version "2026.05.29-v8"`. team sliders `min:0 max:5 step:1`. TEAMS(8): Kitchen, Structures, "Power & Lighting", "Sanitation & Water", "Health & Safety", "Art & Activities", "Ministry of Memes", "Ministry of Vibes". id.type toggle: Passport / "South African ID". history.afrikaburn_count: "None — first one", "1–2", "3–5", "6 or more". camp404_years: 2019,2022,2023,2024,2025,2026. EMPTY_DISPLAY `"—"`.
**Validation & rules:**
- Missing+required → `"This question is required"`; missing+optional dropped.
- slider `"Must be between {min} and {max}"`; selects `"Not a valid option"`; multi_select required-empty `"Pick at least one option"`; text `"Max {maxLength} characters"`; date regex `^\d{4}-\d{2}-\d{2}$` → `"Use yyyy-mm-dd"` then `"Not a real date"`; scale `"Not a valid level"`; image any string (no URL check).
- Cross-field id.number (client/wizard-only): passport `[A-Z0-9]{6,12}`; sa_id 13 digits + YYMMDD + SA Luhn. Server only length-checks it.
- Unknown response keys dropped; `id.number` split out and stored encrypted, not in `responses`.
**Do-not-drop:** Polymorphic per-`kind` renderer + matching per-kind validation for all 10 kinds, the typed response value union, and the encrypted-PII split-out of `id.number`. Only dead/vestigial bits: the unused `boolean` member of the response union and the reserved empty left gutter in ScaleField's mobile grid — both safe to drop.


### 6. Pending / rejected approval gate
**Purpose:** A terminal blocking screen that holds an authenticated, invited, onboarded member out of the app until a captain approves or rejects them.
**Layout & elements:** Centred single-column card (no Back button, no footer, no app navigation). Top→bottom: a circular status-icon badge (pending = Clock icon; rejected = ShieldX icon); a bold heading ("Application submitted" when pending, "Application not approved" when rejected); body copy below. Pending body: "Thanks{, displayName} — your profile is in. A captain needs to approve your access before you can use the rest of the app. We'll let you in as soon as they do; just check back here." (name appended only when a display name exists). Rejected body: "A captain has reviewed your application and it wasn't approved for camp access this time. If you think this is a mistake, reach out to whoever invited you." Full-width outline-style "Sign out" button at the bottom — the only interactive control. Page/browser-tab title: "Application pending — Camp 404".
**Every action (preserve all):**
- Tap "Sign out" → navigates to the hosted sign-out flow. Always enabled.
- Reload page ("just check back here") → re-runs all gates; if a captain approved → redirect to home; if rejected → re-renders with rejected copy. No polling/auto-refresh.
- No appeal/retry/resubmit affordance exists for a rejected user.
- Implicit on-load redirects (not user-initiated): no invite → /signup/required; already approved → / (home); onboarding incomplete → /onboarding/questionnaire; unauthenticated → /auth/sign-in.
**States to design:**
- Loading: server-rendered, arrives complete; no skeleton/spinner.
- Populated — Pending: Clock icon, "Application submitted", personalised thanks copy.
- Populated — Rejected: ShieldX icon, "Application not approved", terminal copy.
- Success: represented by absence (redirect to home; user never sees this page again).
- Invite-gated: missing invite → redirect to /signup/required (never lingers here).
- Onboarding-incomplete: profile not completed → redirect to /onboarding/questionnaire.
- Empty / validation-error / submitting / disabled: n/a (no list, no form, no toggleable controls).
**Options & exact values:** approvalStatus ∈ "pending" | "approved" | "rejected" (default "approved"; only this screen shows pending/rejected). Button label: "Sign out". Captain decisions accept only "approved" | "rejected". Rank ∈ "captain" | "member" (gate keys on approval, not rank). No timeouts, expiry, or polling interval.
**Validation & rules:**
- Re-validates the full upstream gate chain on every request, in order: auth → invite → already-approved → onboarding-complete → then branch pending vs rejected.
- Auto-clears: once approved, the next load redirects home (no client refresh needed); god accounts are always approved and never see this page.
- Rejected is terminal for the user: only a captain re-deciding or sign-out changes state.
**Do-not-drop:** A hard dead-end with zero app navigation expressing two distinct terminal states (pending vs rejected), exactly one escape (Sign out), and a captain-driven exit that auto-unlocks the app on next load. No dead/orphaned states; both branches are live.


### 7. Home — role dashboard
**Purpose:** The `/` route is Camp 404's role-based command centre — a single layered grid of action tiles (**2 columns on mobile, multiple columns on desktop**) answering "what do I need to do, who needs what from me?" after the auth/access/onboarding/approval gating spine passes.
**Layout & elements:** Full-bleed (`w-full`, `min-h-[100dvh]`, no `max-w-lg`); a responsive grid of action tiles (**2 columns on mobile, multiple columns on desktop**). Top→bottom: header bar (left brand title "Camp 404"; right slot = bell link to `/notifications` with unread badge + avatar link to `/profile` showing photo or initials, "?" fallback) → the action-tile grid with hairline grid-line gaps → bottom layer tab bar (nav "Switch rank view") with tabs "Me" / "Team Lead" / "Captain". Below the panel: best-effort "Enable notifications" button. Signed-out: `<LandingHero>` glitch "404" art, "Camp 404", "Error 404 — Camp not found", CTA "Are you lost?" → `/auth/sign-in`, "$ awaiting input_".
**Every action (preserve all):**
- Tap unlocked tile with href → plain `<a>` full-page nav to destination.
- Tap unlocked hrefless tile → inert (no handler passed).
- Tap locked tile → nothing (`aria-disabled`).
- Tap layer tab (locked or not) → switch visible layer (browse-only); replays 200ms entry animation.
- Tap bell → `/notifications`; tap avatar → `/profile`.
- Tap "Enable notifications" (push `default` only) → request browser permission, register FCM token (`platform: "web"`).
- Signed-out tap "Are you lost?" → `/auth/sign-in`.
**States to design:**
- Empty: unread `0`/falsy → no badge; no avatar image → initials.
- Loading: server-rendered, no client loading; push has internal "loading" rendering nothing.
- Populated: header + viewer's unlocked layer + locked higher layers + tabs.
- Validation-error / submitting / success: N/A (no forms); push grant silently registers token, button vanishes.
- Disabled/locked: higher-rank layers visible but locked — tiles `opacity-45` + `Lock` glyph, tabs "(locked, view only)" + `Lock`.
- Invite-gated → redirect `/signup/required`; onboarding-incomplete → `/onboarding/questionnaire`; pending OR rejected → `/pending-approval`; signed-out → inline `<LandingHero>`.
**Options & exact values:** Ranks `camp_member`/`team_lead`/`captain`; labels "Camp Member"/"Team Lead"/"Captain"; tab labels "Me"/"Team Lead"/"Captain"; 4 tiles per rank layer (grid order). Unread cap "99+". camp_member tiles: My Teams "Your crews" →`/members`; My Tasks "What's on you" →`/meals`; My Profile "You & your data" →`/onboarding/questionnaire`; Tools "Meals, expenses…" →`/tools`. team_lead: Team Roster "Members in your team"; Team Tasks "Assign & track work"; Lead Profile "Your team setup"; Team Tools "Planning, notices…" (no hrefs). captain: Camp Management "Roster & statuses" →`/captains/camp-management`; Camp Tasks "Camp-wide work board"; Finances "Dues & reimbursements"; Camp Tools "Announcements, admin…" →`/captains/tools`. Push states loading/unavailable/default/granted/denied. Defaults: title "Camp 404", initialLayer 0, viewerRank camp_member.
**Validation & rules:**
- Gate order load-bearing: auth → invite → required-actions → legacy-profile → approval.
- Layer interactive iff `rankLevel(viewerRank) >= rankLevel(layer.rank)`; higher layers browsable but locked.
- God accounts bypass invite + approval gates; rejected and pending both route to `/pending-approval`.
- Badge shows unless null/""/0 (unused on home).
**Do-not-drop:** The rank-layered responsive tile grid (2 columns on mobile → multiple on desktop) with browse-but-locked higher layers, plus the gating spine that bounces unqualified users. DEAD/ORPHAN flags: team_lead tiles + captain Camp Tasks/Finances hrefless no-ops; camp_member My Teams (`/members`) & My Tasks (`/meals`) are dead links (404); `ControlPanelHeader` orphan unused on this path.


### 8. Control Panel / tile-grid nav component
**Purpose:** Camp 404's home command-centre nav: a responsive grid of action tiles — **2 columns on mobile, multiple columns on desktop** — shown one rank layer at a time, with a bottom tab bar switching between camp member → team lead → captain layers.
**Layout & elements:** Full-viewport: header bar (top) with brand title "Camp 404" left + header slot right (notifications bell with unread badge → `/notifications`, avatar link → `/profile`); the action-tile grid (flex-1) — **2 columns on mobile, multiple columns on desktop** — with hairline gaps; bottom tab bar (aria-label "Switch rank view") with one tab per layer using short labels "Me" / "Team Lead" / "Captain".
**Every action (preserve all):**
- Tap a tab → switches visible layer (allowed even for locked layers; browse-only); fires onLayerChange.
- Tap an unlocked tile → navigates via its href and/or fires the tile-select callback. Locked tiles are inert (aria-disabled, no handler/href).
- Tap bell → notifications; tap avatar → own profile.
**States to design:**
- Populated: layer resolves; tiles show icon/label/optional hint/optional badge.
- Empty: no layer at index → renders nothing (no placeholder).
- Disabled / Captain-only-locked (headline): layer above viewer rank is visible-but-locked — tab shows Lock icon + "(locked, view only)"; tiles dimmed (opacity-45) with Lock glyph, non-interactive.
- Active-tab: bold/primary with underline pill. Layer-switch: 200ms fade+scale entrance.
- Press feedback: tiles and tabs respond to hover/press.
- Notification badge hidden when zero; shows count or "99+" above 99. Avatar shows photo or initials.
- No submitting/success/validation-error (pure nav; gating handled upstream by redirects before render).
**Options & exact values:** Ranks (low→high): "camp_member"|"team_lead"|"captain". Long labels "Camp Member"/"Team Lead"/"Captain"; tab labels "Me"/"Team Lead"/"Captain". 4 tiles per rank layer (grid order). Defaults: viewerRank "camp_member", initialLayer 0, title "Camp 404". Badge cap "99+". Live homeLayers (label/hint→href):
- camp_member: My Teams/"Your crews"→/members; My Tasks/"What's on you"→/meals; My Profile/"You & your data"→/onboarding/questionnaire; Tools/"Meals, expenses…"→/tools.
- team_lead: Team Roster/"Members in your team"; Team Tasks/"Assign & track work"; Lead Profile/"Your team setup"; Team Tools/"Planning, notices…" (no hrefs → inert).
- captain: Camp Management/"Roster & statuses"→/captains/camp-management; Camp Tasks/"Camp-wide work board"; Finances/"Dues & reimbursements"; Camp Tools/"Announcements, admin…"→/captains/tools.
**Validation & rules:**
- initialLayer clamped to [0, max(layers.length-1, 0)].
- Lock rule: tile interactive iff viewer rank >= layer rank; locked branch wins even if href present (non-navigable). Browsing locked layers always allowed; only tiles inert.
- Tile badge suppressed for null/undefined/""/0.
- Rank model decoupled from 2-rank DB enum; team_lead derived at call site, never stored.
- Accessibility: aria-pressed tabs, aria-disabled locked tiles, explicit aria-labels, aria-hidden decorative icons.
**Do-not-drop:** Rank-layered visible-but-locked gating (browse locked layers, inert locked tiles) across the responsive tile grid (2 columns on mobile → multiple on desktop). Note: the desktop ControlGrid and the v0 tile-grid nav are dead/orphaned (Storybook-only, not on any route).


### 9. Profile view
**Purpose:** A read-only "this is me" card for the fully-onboarded, approved camp member showing their avatar, display name, rank, and email, with three navigations out.
**Layout & elements:** Mobile single column, centered card. Top→bottom: large circular avatar (uploaded photo, else initials fallback, else "?"); `<h1>` display name; rank pill badge reading "Captain" or "Member"; email line (only when an email exists); primary "Edit profile" button (with Pencil icon); helper sentence "Want to update your burner questionnaire answers? Review them here." where "Review them here" is a link; a plain "Sign out" link (full navigation).
**Every action (preserve all):**
- Tap "Edit profile" → navigate to `/profile/edit`. Always enabled.
- Tap "Review them here" → navigate to `/onboarding/questionnaire`.
- Tap "Sign out" → hard navigation to `/auth/sign-out` (must be a real navigation, not client routing).
- No form fields, no state-mutating buttons, no async/optimistic UI — purely declarative server output.
**States to design:**
- Populated (default): avatar (photo or initials), name, rank badge, email, three navigations.
- Loading: avatar shows initials fallback until the proxied photo finishes loading; page itself is server-rendered (no spinner).
- Empty/nullable fields: no photo → initials (or "?") avatar; no display name → email (or "Burner") heading; no email → email line omitted entirely.
- Gating (page bounces, never renders these): no session → sign-in; no invite access → `/signup/required`; onboarding incomplete (no `completedAt`) → `/onboarding/questionnaire`; pending OR rejected approval → `/pending-approval`. Order: auth → invite → onboarding → approval; earliest failing gate wins.
- Validation-error / submitting / success / disabled / captain-only-locked: N/A.
**Options & exact values:** Rank badge text: "Captain" / "Member" (no "Team Lead"). Stored rank enum: `captain | member`. Approval enum: `pending | approved | rejected`. Display-name fallback chain: displayName → email → "Burner". Initials fallback: "?" when unusable. Literal copy: "Burner", "Captain", "Member", "Edit profile", "Want to update your burner questionnaire answers?", "Review them here", "Sign out".
**Validation & rules:**
- No inputs, so no field validation; all "validation" is the gate spine.
- God-account emails bypass both invite and approval gates.
- Team leads render as "Member" (no Team Lead derivation here).
- Photo visibility is approval-gated at the byte level (proxy 401s for unauthorized/unapproved, 404s in E2E/no-token) → silently falls back to initials.
**Do-not-drop:** A read-only identity card whose mere reachability proves the viewer cleared every gate (auth → invite → onboarding → approval); the avatar must degrade gracefully (photo → initials → "?") and the three exits (edit, questionnaire review, sign-out) must survive. No dead/orphaned/404 flags on this surface.


### 10. Profile edit + delete account
**Purpose:** A signed-in, approved member's self-service surface to edit their display name and profile photo, plus a Danger-zone account deletion that anonymises (not hard-deletes) the account into a "Lost Cat #N" stub.
**Layout & elements:** Mobile single column. Header "Edit profile" + subtext "Update your photo and how your name shows up around camp." Card 1 (Edit profile): large circular avatar uploader (no photo → dashed circle + camera icon + "Add photo"; text button cycles "Upload a photo" / "Uploading…" / "Change photo"; destructive "X" remove overlay when a photo shows); label "Display name" with text input; error banner (role="alert"); footer ghost "Cancel" + submit "Save changes". Card 2 (Danger zone): heading "Danger zone"; copy "This permanently erases your personal data and removes you from camp rosters. Your account becomes an anonymous "Lost Cat" stub so the family tree stays intact — it can't be undone. Type DELETE to confirm."; label "Confirmation" + input (placeholder "DELETE"); error banner; destructive submit "Delete my account".
**Every action (preserve all):**
- Edit display name → updates field; disabled while saving.
- Upload/change photo → file picker → browser crop/resize → upload → preview swaps in; triggers disabled + spinner while uploading.
- Remove photo (X, only when photo shown and not uploading) → clears preview; persists null on save.
- Save changes → updateProfile → on success redirect to /profile; disabled while saving.
- Cancel → link to /profile (discards unsaved photo/name changes).
- Delete account → requires exact "DELETE" → deleteOwnAccount → on success redirect to /auth/sign-out; disabled while deleting.
**States to design:**
- Empty: name shows display name or email fallback or ""; avatar empty placeholder; confirm empty.
- Populated: server-rendered values (no skeleton).
- Submitting: name + buttons disabled, "Saving…"; delete button "Deleting…"; avatar "Uploading…" with spinner overlay.
- Validation-error: inline role="alert" banners.
- Success: redirect only (no in-page banner).
- Gating (page-level redirects): unauthenticated → /auth/sign-in; no invite → /signup/required; onboarding incomplete → /onboarding/questionnaire; pending/rejected → /pending-approval.
**Options & exact values:** Display name maxLength 80 (MAX_NAME_LENGTH=80). Confirmation literal "DELETE" (case-sensitive, no trim). Avatar: max 5 MB, image-only, crop/resize 512px WebP quality 0.85. Anonymised name "Lost Cat #N". No rank UI.
**Validation & rules:**
- Display name trimmed; empty → "Display name can't be empty."; >80 → "Display name must be 80 characters or fewer."
- Empty photo string normalises to null; photo persists only on save (two-phase).
- Wrong/absent confirm → "Type DELETE to confirm."
- Avatar upload failure → server error or "Upload failed".
- Delete is irreversible: row anonymised, personal child rows purged, bank PII scrubbed; id + invite lineage kept; re-login becomes a fresh access-less user.
**Do-not-drop:** Self-service name/photo edit AND a confirm-gated, irreversible anonymising "Lost Cat #N" deletion that preserves referral lineage and audit FKs. Carry-over flag: action-vs-page gating asymmetry — server actions re-gate only on auth+invite (not onboarding/approval), so a since-pending/rejected member could still POST edits/delete.


### 11. Avatar upload control
**Purpose:** A circular profile-photo uploader that crops/resizes an image in-browser, uploads it, and hands a gated proxy URL back to the parent form.
**Layout & elements:** Mobile single column. Large circular tap-target; when empty shows a dashed circle with a Camera icon + "Add photo" placeholder; when populated shows the image. A small destructive remove button (X icon, top-right) appears over the image. Below the circle, a secondary text button reading "Upload a photo" / "Change photo" / "Uploading…" by state. A hidden native file input (`accept="image/*"`). An error line (`role="alert"`) below the control when upload/decode fails.
**Every action (preserve all):**
- Tap circle OR tap text button → opens OS file picker (disabled while uploading).
- Select image file → centre-crop to square, downscale to 512×512, encode WebP; show local object-URL preview immediately, then upload; on success call `onChange(url)` with the proxy URL.
- Tap remove (X) → clear error + preview, `onChange(null)`; shown only when an image is displayed and not uploading.
- Re-select the same file → still re-fires (input value reset after each attempt).
- All buttons are `type="button"` so they never submit the host form.
**States to design:**
- Empty: no image → dashed circle, Camera icon + "Add photo"; button "Upload a photo".
- Loading/Submitting: dark overlay + spinning loader over image; button "Uploading…"; circle disabled; remove hidden.
- Populated: image shown (cover); solid border when a stored value exists; button "Change photo"; remove visible.
- Validation-error: destructive alert text — server error message if present, else "Upload failed" or "Could not load image".
- Disabled: both buttons disabled while uploading.
- Success: no internal banner; URL propagates to parent.
- Pending/Rejected/onboarding (viewer side): gated proxy returns 401 so the `<img>` fails to load; mid-onboarding the uploader deliberately shows the local preview instead.
**Options & exact values:** Output size 512×512 (default); WebP quality 0.85; encode MIME `image/webp`; wrapped filename `avatar.webp`; accept filter `image/*`; server max 5 MB; rate limits 20/60s per-user, 40/60s per-IP; image question `required: false`; prompt "Profile photo", helper "A clear photo of your face works best.", page title "Add a profile photo", subtitle "Optional — helps the camp put a face to your name. You can skip and add it later from your profile."
**Validation & rules:**
- Client decode failure → "Could not load image" alert.
- Server re-validates: must be `image/*` (else 415), ≤ 5 MB (else 413), field key `image` and a real File (else 400/415).
- Centre-crop is forced square; no adjustable crop box.
- Persisted value is the same-origin proxy URL (`/api/avatar?pathname=…`), never the raw blob URL; empty string normalised to null.
- Image is never mandatory; missing passes.
**Do-not-drop:** Private-by-default capture-and-serve: in-browser square crop/resize/WebP, upload returns only a gated proxy URL viewable solely by approved members, and a working mid-onboarding local preview. Carry over the ⚠️ stale doc-comment flag claiming the stored value is a public Vercel Blob URL — it is actually the gated proxy URL.


### 12. Notifications inbox
**Purpose:** A read-only, member-facing list of every notification delivered to the signed-in camp member, newest-first, that marks the displayed snapshot read on open.
**Layout & elements:** Mobile single column (container `max-w-2xl`). Top→bottom: back-to-home ghost button — `ChevronLeft` icon + "Home" (links to `/`); `<h1>` "Notifications"; subtitle "Everything that's been sent your way."; then either the empty paragraph "No notifications yet." or a `<ul>` of static `<li>` rows. Each row: presentation icon (`Megaphone`/`MessageSquare`/`Bell`), title, optional "New" pill, date (`<time>`), body (whitespace-preserved plain text), and an optional "From {senderName}" line with an ack-status suffix.
**Every action (preserve all):**
- Open inbox (via header bell → `/notifications`): renders the list AND marks the whole snapshot read; no per-row "mark read" button.
- Tap "Home" ghost button → navigate to `/` (only navigational control).
- Read a row: view-only — NO delete, archive, mute, dismiss, mark-unread, expand/collapse, or deep-link/open controls.
- Implicit badge clear: bell badge drops on return home as snapshot rows become read.
- Opening NEVER acknowledges (no `acknowledgedAt` stamped here — that is unit 25's gate).
**States to design:**
- Empty: zero deliveries → "No notifications yet.", no bell badge.
- Loading: server-rendered, no spinner/skeleton.
- Populated: rows in two CSS variants — unread-on-arrival (`isNew`, emphasised border/bg + "New" pill) vs already-read (plain).
- Validation-error / submitting / disabled: N/A (no form, no actionable controls).
- Success: implicit — rendered list with badge cleared.
- Invite-gated: fails `hasCampAccess` → redirect `/signup/required`.
- Onboarding-incomplete / pending / rejected: NOT gated here (asymmetry vs home).
- Per-row ack-status: "· acknowledged", "· awaiting acknowledgement", or none.
**Options & exact values:** `broadcast_presentation` `["acknowledge", "popup", "feed"]` (default `"feed"`) — read by inbox; icons: `acknowledge`→Megaphone, `popup`→MessageSquare, `feed`(fallback)→Bell. Carried on the delivery row but NOT displayed by the inbox: `notification_channel` `["push", "in_app", "both"]` (default `"both"`); `broadcast_kind` `["announcement", "team_message", "lead_directive", "reminder", "system"]`; `broadcast_scope` `["everyone", "team", "team_leads", "drivers", "individual"]`; `push_delivery_status` `["queued", "sent", "failed", "skipped"]` (default `"queued"`). Ack suffixes: " · acknowledged", " · awaiting acknowledgement". Pill text "New". Badge cap: counts >99 render "99+". Date: `toLocaleDateString()` (date only). Bell aria-label: "Notifications ({n} unread)" or "Notifications".
**Validation & rules:**
- Read ≠ acknowledge: only `readAt` stamped on open.
- Snapshot consistency: marks exactly the displayed ids read; later arrivals stay unread.
- `markRead` idempotent, owner-scoped, only stamps still-unread rows; empty-list no-op.
- `isNew` is point-in-time (snapshot `readAt === null`); read on reload.
- NULL `senderName` (system/deleted sender) suppresses the whole attribution+ack line.
- Body is plain text, no markdown/HTML, no truncation.
- No pagination/limit — all deliveries rendered, list unbounded.
**Do-not-drop:** Snapshot-then-mark-read semantics with point-in-time "New" flagging and the read-vs-acknowledge distinction (inbox never acknowledges). No dead/orphaned/404 variants in this unit.


### 13. Tools hub
**Purpose:** A flat, link-only landing page at `/tools` that gates camp members through auth/invite/approval, then indexes uncategorised camp utilities as navigation cards.
**Layout & elements:** Single column, centered container. Top: heading "Tools"; subtext "Uncategorised tooling for camp members. We'll move tools into dedicated sections as we group them." Below: a vertical list of exactly 3 cards, each with a bordered icon chip, a title, a description, and a trailing `ChevronRight` affordance. Reached from the home control panel's bottom-right "Tools" tile (Wrench icon, hint "Meals, expenses…").
**Every action (preserve all):**
- Tap "Invite a member" card → navigate to `/tools/invite`.
- Tap "My forms" card → navigate to `/tools/forms`.
- Tap "Family tree" card → navigate to `/family-tree`.
- All three cards are always active links; focus ring renders on the card; hover tints card background toward accent. No buttons, forms, inputs, submit, mutations, or voice.
**States to design:**
- Populated: the only data state — always exactly 3 cards.
- Empty / loading / validation-error / submitting / success / disabled: N/A (compile-time card list, no fetch, no form, no controls).
- Invite-gated: no god email AND no invite code → redirect `/signup/required` (page never renders).
- Pending-approval / Rejected: `approvalStatus` not "approved" (and not god) → redirect `/pending-approval`; pending and rejected route identically.
- Unauthenticated: redirect `/auth/sign-in`.
- Onboarding gate intentionally absent here.
**Options & exact values:** 3 cards verbatim — (1) "Invite a member" / "Mint a single-use code to bring someone onto Camp 404." / Mail icon / `/tools/invite`; (2) "My forms" / "Revisit a questionnaire you've already completed, update your answers, and see what changed." / ClipboardList icon / `/tools/forms`; (3) "Family tree" / "See who brought who onto camp." / GitBranch icon / `/family-tree`. ApprovalStatus = "pending" | "approved" | "rejected".
**Validation & rules:**
- Gate order fixed and short-circuiting: auth → camp-user resolve → invite gate → approval gate; each failing gate redirects before render.
- God-account email bypasses both invite and approval gates.
- Disambiguation by ICON + LABEL only; no per-entity colour. All 3 cards must stay present and route to their exact hrefs.
**Do-not-drop:** The auth→invite→approval gate chain plus the 3 verbatim navigation cards to their exact hrefs. Carry-over flags: home tile hint "Meals, expenses…" does not match the actual list; `CardContent`/`CardFooter` are orphaned (unused) on this surface.


### 14. Invite tool (mint codes)
**Purpose:** Lets a signed-in, camp-active, approved member mint an invite code to bring a new person onto Camp 404; captains get extra pre-approve and multi-use knobs.
**Layout & elements:** Mobile single column. Ghost back-link "Tools" (→/tools). Title "Invite a member" with rank-branched description. Email field — label flips "Their email address" (required) vs "Lead recipient's email (optional)" (captain multi-use), placeholder "sara@example.com". Note Textarea (3 rows) "Why you're inviting them (optional)", placeholder "Kitchen lead from last burn; great with sourdough." Captain-only "Captain options" block: "Pre-approve whoever signs up" checkbox + "How many people can use this code" number input; members instead see muted "Anyone who signs up with this code will need a captain's approval before they can use the app." Mono code field (prefilled, generated) + Shuffle icon-button (aria "Generate a new silly code"). Live availability hint. Error alert banner. Full-width "Create invite" submit.
**Every action (preserve all):**
- Type/edit code → lowercases, triggers debounced (350ms) availability check.
- Shuffle → re-rolls a fresh code (adjective-noun-noun, e.g. "neon-toaster-mongoose").
- Enter email → required single-use, optional captain multi-use. Enter note → always optional.
- (Captain) pre-approve toggle → off=needs vetting, on=straight in. (Captain) max-uses 1–100 → >1 makes email optional + multi-use.
- Submit "Create invite" → server action; pending shows "Creating…" spinner. Disabled when pending OR availability checking/taken/invalid (NOT on idle/available).
- (Success) Copy → copies code, label flips "Copied" 1500ms. "Send another" → reloads fresh form.
**States to design:**
- Empty/initial: prefilled code, blank email/note, captain knobs default (pre-approve off, maxUses 1), availability idle (no hint).
- Loading: "Checking availability…" spinner (disables submit). Available: green check + "<code> is available."
- Validation-error client: invalid → X + "3–48 chars, lowercase letters / digits / hyphens."; taken → X + "<code> is already taken — pick another." (both disable submit).
- Validation-error server: role=alert banner — "Not signed in.", "Your account isn't camp-active yet.", "Max uses must be a whole number between 1 and 100.", "Enter a valid email address.", "Invite code must be 3–48 chars, lowercase letters/digits/hyphens.", "'<code>' is already taken.", "Couldn't save invite. Try a different code."
- Submitting: "Creating…", disabled. Success: card swaps to "Invite ready" — "Share this code [with <email>]." + uses line ("It's single-use — once they sign up with it, nobody else can." / "Up to <N> people can sign up with it.") + approval line ("They'll need a captain's approval before they get access." / "They're pre-approved — straight in after onboarding."), mono code box, Copy, "Send another".
- Captain-only-locked: knobs render only for captains; members see muted notice. Invite-gated: !hasCampAccess → /signup/required. Pending/Rejected: !isApproved → /pending-approval.
**Options & exact values:** maxUses members fixed 1; captains 1–100 (MAX_USES_LIMIT=100, min=1 max=100). Code: length 3–48, `/^[a-z0-9]+(-[a-z0-9]+)*$/`. Generator ~50 adjectives × ~50 nouns × ~50 nouns. Debounce 350ms. Check rate limit 30/60s per user. Generate-unused retries 8. Copy timeout 1500ms. assignedRank always null (captain-tier codes CLI-only). CODE_RULES_HINT "3–48 chars, lowercase letters / digits / hyphens (no spaces)."
**Validation & rules:**
- Client live-check is UX only; server action re-validates everything (the security boundary).
- Captain knobs re-enforced server-side; isCaptain recomputed from DB, member preApprove/maxUses ignored.
- Member invariants: requiresApproval always true, maxUses always 1, email always required. Captain: requiresApproval = !preApprove; email required only when maxUses === 1.
- Email trimmed+lowercased, validated when present. Code uniqueness checked at API + action + PK backstop; race → "Couldn't save invite. Try a different code."
- Generator can collide (Math.random, noun slots may repeat); retries 8× then timestamp-suffixes.
**Do-not-drop:** Rank-gated minting (members: single-use + required-email + vetting; captains: pre-approve + 1–100 multi-use), generated editable silly word-codes with live availability, and server-side re-validation as the real boundary. Carry over the client/server hint-string divergence and the check-endpoint test/prod existence mismatch (a dead code reads "available" in E2E but "taken" in prod).


### 15. My forms + form replay
**Purpose:** A surface to revisit questionnaires the member has already completed, re-open one pre-filled in the wizard, update answers, and see a running per-field change log.
**Layout & elements:** Mobile single column. List page (`/tools/forms`): back link "Tools" (ChevronLeft) → "/tools"; title "My forms"; subtitle "Questionnaires you've completed this year. Open one to review and update your answers — we'll keep a log of what you change."; one clickable card per completed form (ChevronRight) showing `form.title`, `form.description`, and "Last edited {date}". Detail page (`/tools/forms/[key]`): back link "My forms" → "/tools/forms"; title = form.title; subtitle "Step back through the form and update anything that's changed. Last edited {date}."; the questionnaire wizard pre-filled with saved answers; success banner (role="status", CheckCircle2) "Saved. Your answers — and the change log below — are up to date."; "Change log" section with intro "Every time you update this form we record what changed. We don't keep old versions — just this running history." and an ordered list of edit sessions (timestamp + per-field bold `label`, struck-through `from` → foreground `to`, arrow "→").
**Every action (preserve all):**
- Tap a form card → open `/tools/forms/{key}` replay.
- Wizard "Next"/"Back" → local navigation only (persistProgress=false; no per-page save); lone optional unanswered question shows "Skip".
- Final submit "Save changes" → validate → diff → save → record change-log row → success banner + log refreshes in place.
- Read change log: read-only, no edit/delete.
- Disable conditions: Back disabled on first page / while pending; submit disabled while pending.
**States to design:**
- Empty (list): no completed forms → "You haven't completed any forms yet."
- Empty (change log): no edits → "No edits yet. Changes you make here will show up in this list."
- Loading: server-rendered (force-dynamic), no spinner.
- Populated: form cards / pre-filled wizard + log entries.
- Validation-error: per-field errors on questions; `_root`/`_form` in wizard banner.
- Submitting/pending: Back/Submit disabled.
- Success: saved banner + refreshed log.
- Invite-gated → redirect "/signup/required"; onboarding-incomplete → "/onboarding/questionnaire"; pending/rejected (not approved) → "/pending-approval"; unknown key → notFound() (404); not-yet-completed → redirect "/tools/forms". No rank/captain lock.
**Options & exact values:** Registry key: "burner_profile" (title "Burner profile", description "The onboarding questionnaire — who you are in the dust, your teams, skills and logistics."). Questionnaire version "2026.05.29-v8". Error keys `_form`, `_root`. ID keys "id.number" (redacted from log), "id.type". ID types "passport" (default) | "sa_id" | null. Change-log limit 20 (most-recent-first). Empty value sentinel "—". Multi-select join ", ". Date format `en-ZA`, dateStyle medium / timeStyle short. submitLabel "Save changes".
**Validation & rules:**
- Only completed forms list/replay; uncompleted detail redirects to list.
- Required empty → "This question is required"; ID cross-field validated against id.type before advancing.
- Save: unknown form → "Unknown form."; not completed → "This form hasn't been completed yet."; malformed → "Malformed response payload".
- Diff: multi-selects as sets (reorder ≠ change); empty/null/""/[] equal; stale keys ignored; id.number filtered out of log.
- No-op replay re-saves but records no log row. Re-save re-satisfies onboarding gate and stamps current version.
**Do-not-drop:** Pre-filled replay of completed questionnaires plus an immutable, ID-redacted per-field change log (from → to). Carry forward: a replay bumps `completedAt`/`updatedAt` to re-submit time (comment claims idempotent but code overwrites — low-confidence intent); the `final===false` action branch is effectively dead in this flow.


### 16. Family tree referral graph
**Purpose:** A read-only, whole-camp visualisation of the referral graph — "who brought who onto Camp 404" — as a collapsible parent→child tree where each node's parent issued the invite code that node redeemed.
**Layout & elements:** Single column on a wider canvas (page width `max-w-3xl`, not the global mobile shell). Top→bottom: back link — ghost button "Tools" with a left-chevron (`href="/tools"`); `<h1>` "Family tree"; muted subtitle "Who brought who onto Camp 404. Roots are accounts that pre-date the invite system; every other branch is one invite-code redemption."; search input with left magnifying-glass icon, placeholder "Search by name or invite code…"; control row "Expand all" and "Collapse" (outline/sm); then the recursive tree of branch rows. Each row: a toggle (chevron-down open / chevron-right closed, or a small dot for leaves), then a node card with a generic user-icon avatar, display name ("(no name)" if null, truncated), an amber "Captain" pill (captains only), a primary "You" pill (viewer only), a muted "via `<code>`" line (monospaced, if invite code present), and a muted descendant-count pill (parents only). Rows indent 20px per depth with CSS guide lines.
**Every action (preserve all):**
- Tap "Tools" → navigate to `/tools`.
- Type in search → case-insensitive substring filter over `displayName` + `inviteCode`; shows only root subtrees containing a match, promotes/keeps ancestors visible, force-expands matched paths, applies match highlight.
- Clear search → restores full tree and the user's manual expansion state.
- Tap a node's chevron → expand/collapse that node's children; disabled (dot shown) when the node has no children.
- "Expand all" → expand every node.
- "Collapse" → collapse all to roots only (children hidden, roots still shown).
- No mutating actions: no invite/edit/delete, no node drill-in, no profile link.
**States to design:**
- Loading: server-rendered, no skeleton/spinner; list appears once query resolves.
- Empty (no accounts): card "No accounts yet."
- Empty (no matches): card "No matches." (non-empty query, zero results).
- Populated: recursive branch rows; roots expanded one level by default.
- Viewer-highlight: viewer's node gets a primary ring + "You" pill.
- Match-highlight: matched nodes get an amber border while a query is active.
- Disabled: leaf toggle buttons disabled (reduced opacity, dot marker).
- Invite-gated (no invite code, non-god): redirected to `/signup/required` before render.
- Pending: `approval_status = 'pending'` (non-god) redirected to `/pending-approval`.
- Rejected: `approval_status = 'rejected'` (non-god) also redirected to `/pending-approval`; no distinct screen.
- Not rank-locked: any approved invite-holding member (captain or member) sees the full tree.
**Options & exact values:** `rank`: "captain" | "member" (only "captain" shows a badge). `approval_status`: "pending" | "approved" | "rejected" (only "approved" or god reaches the page). Indentation step: 20px per depth. Default expansion: roots only, one level. Search haystack: `displayName` + " " + `inviteCode`, lowercased, substring match. Roster ordering: `displayName` ascending. Page width: `max-w-3xl`. No pagination — whole roster loaded at once.
**Validation & rules:**
- Access order: authenticated → has camp access (god email OR non-null invite code) → approved (god OR `approval_status='approved'`); failing any gate redirects out, page never partially renders.
- God accounts bypass invite + approval gates; typically appear as roots (NULL invite code → NULL inviter).
- Roots vs branches derived purely from inviter == null: no invite code, code with NULL `created_by_user_id`, or a code matching no row all become roots; an inviter not in the roster also yields a root (orphan-as-root, no error).
- Missing display name → "(no name)", still searchable by invite code.
- Descendant count = ALL generations below, not just direct children.
- Empty query → no highlights, no forced expansion, full tree.
- No write path → no validation errors, optimistic UI, or conflict handling. `force-dynamic` re-queries each visit.
- No explicit cycle guard — a data cycle in the inviter chain would loop infinitely (presumed domain-impossible).
**Do-not-drop:** The collapsible parent→child referral tree with name/invite-code search (ancestor promotion + auto-expand), expand/collapse-all, per-node total-descendant counts, and viewer/match/captain highlighting; read-only, no rank gate. Dead/orphaned flags to carry: server helpers `getInvitesIssuedBy` and `getRootCodes` are exported but have no callers (dead/future code); `profileImageUrl` exists on users but is not selected, so real avatars cannot render.


### 17. Captain camp management (roster + member detail)
**Purpose:** Captain-only command surface listing every real camp member with rank/status/facets, searchable and filterable, with a per-member detail modal to approve or reject pending applicants.
**Layout & elements:** Back button "Captains" (ChevronLeft) → H1 "Camp management" → paragraph "Everyone who has signed up, their rank and status, whether they've completed their required questionnaires, registered as a driver, and whether they're in South Africa." Wide table (max-w-5xl). Filter toggle "All ({count})" / "Awaiting approval" (+count badge), search Input (Search icon, placeholder "Search name, team, country…", aria-label "Search the roster"). 7-col table: Member (name + humanized teams), Rank (pill), Status (pill), Questionnaires (ShieldCheck), Driver (Car), In SA (Flag), Country (MapPin). Modal: title=name, description=approvalSummary/"Loading…", tabs "overview"/"profile", overview avatar (80×80) + DetailList, profile uppercase section titles, "ACTIONS" footer with Approve/Reject/Ping.
**Every action (preserve all):**
- Switch filter tab "All"⇄"Awaiting approval" → client filter.
- Search → filters by name/rank/country/team (case-insensitive).
- Click row → open modal, fetch detail (stale-fetch discarded).
- Switch modal tab Overview⇄Profile.
- "Approve" → decideApprovalAction(id,"approved"); optimistic + router.refresh.
- "Reject" → decideApprovalAction(id,"rejected"). Both shown only while approvalStatus="pending"; disabled while isPending (Approve shows Loader2).
- "Ping" → permanently disabled, title "Coming soon — nudge this member to check the app".
- Close modal → clears selection.
- Non-captain: no interactions.
**States to design:**
- Empty: "No members have signed up yet." / "No members match your search." / "Nobody is awaiting approval." / "No questionnaire answers on record yet." / "Nothing recorded."
- Loading: modal Loader2 spinner, "Loading…".
- Populated: rows + overview/profile sections.
- Validation/action-error: footer role="alert" destructive ("Unknown decision." / "You can't decide on your own account." / "Captain access only." / "Your account isn't camp-active yet." / "Not signed in."); detail error ("Member not found.").
- Submitting: Approve/Reject disabled, Approve spins.
- Success: decision → buttons disappear, table refreshed.
- Disabled: Ping always.
- Locked (non-captain): blurred aria-hidden table, 6×7 placeholder rows, overlay card Lock icon "Captain access only" / "Camp management data is visible to captains. Your rank doesn't have clearance for this view." Filter/search/modal suppressed; rows=[].
- Pending/rejected: subjects of approve/reject; unapproved captain bounced to /pending-approval.
**Options & exact values:** Status: ready→"Ready", onboarding→"Onboarding", awaiting_approval→"Awaiting approval", rejected→"Rejected", pending→"Action needed". Ranks: "Captain"/"Team Lead"/"Member" (modal: Captain/Member only). Filter: "all"/"awaiting". Tabs: overview/profile. Stored ranks ["captain","member"]; approvalStatus ["pending","approved","rejected"]; teams: kitchen, structures, power_and_lighting, sanitation_and_water, health_and_safety, art_and_activities, ministry_of_memes, ministry_of_vibes; membershipTier ["full","build_week_only"]; decision "approved"/"rejected". ID types "passport"/"sa_id". Country "ZA"→inSouthAfrica (ISO alpha-2). Date Intl "en-ZA" medium. YesNo sr-only: "Required questionnaires complete"/"Registered as a driver"/"In South Africa". Overview order: Country, Joined, Onboarding (Complete/Incomplete), Invite code (or "— (founder / god account)"), Invited by, Invite note.
**Validation & rules:**
- Status precedence: !onboardingComplete→onboarding; pending→awaiting_approval; rejected→rejected; pendingRequiredActions=0→ready; else→pending.
- Self-decision blocked; only "approved"/"rejected" accepted; decision stamps decider+timestamp.
- Approve unblocks app next load; reject is terminal.
- Captain gate enforced server-side (rows=[] for non-captains; every action re-checks).
- System & sanitised accounts excluded.
- Government ID decrypted only behind captain gate (AES-256-GCM), merged as short_text profile row; profile.image→avatar not row; empty/intro sections dropped.
- Display name fallback "Unnamed burner".
**Do-not-drop:** Server-enforced captain-only clearance (data never sent to non-captains) and the approve/reject decision flow with self-decision guard. Orphaned: "Ping" (disabled "Coming soon"); dead-but-fetched duesPaid/membershipTier/onboardingVersion/driverProfileComplete; unused isTeamLead; modal rankLabel omits "Team Lead".


### 18. Captain announcements composer
**Purpose:** A captain-only screen to compose, save, edit, delete, and publish camp-wide announcements, then track their delivery roll-ups.
**Layout & elements:** Single column. Back link "Camp tools" (ChevronLeft) → /captains/tools. H1 "Announcements & notifications"; lead "Compose a message, save it as a draft, then publish it to the whole camp. Everyone but you receives it. A full-screen announcement takes over each member's screen until they acknowledge it." Composer card titled "New announcement" (or "Edit draft" when editing, plus a "Cancel edit" X button): Title field (placeholder "Burn-night briefing"), Message textarea (6 rows, placeholder "What does everyone need to know?"), "How it lands" select (icon+label, with a hint line below), error banner, success notice, primary submit "Save draft"/"Update draft". "Drafts (n)" section (empty: "No drafts.") with cards: header (title + presentation pill), full body, Edit/Delete/"Publish to camp" buttons. "Published (n)" section (empty: "Nothing published yet.") with cards: header, body, footer "Sent to N member(s)", " · by you", acknowledge-only "X/Y acknowledged", timestamp.
**Every action (preserve all):**
- Type title (≤120) / message (≤5000); pick presentation → updates form + hint.
- Save/Update draft → notice "Draft saved."/"Draft updated.", reset, refresh; disabled if title or body blank, or pending.
- Cancel edit → reset to new-announcement mode.
- Edit draft → loads it into composer; Delete → "Draft deleted."; Publish → "Published to {n} member(s).".
- All mutations disable every input/button while pending; on error, show error banner, abort (no refresh).
**States to design:**
- Empty: drafts/published empty copy; composer always present.
- Loading: server-rendered, no skeleton.
- Populated: cards + section counts.
- Validation-error: blank title/body disables submit; Zod "Give it a title."/"Write the announcement." in error banner.
- Submitting: spinner on submit, all disabled.
- Success: emerald notice (suppressed if error set).
- Disabled: submit on blank/pending; row buttons on pending.
- Invite-gated → /signup/required; pending-approval/rejected → /pending-approval; non-captain → page still opens but shows **no data**: a dimmed/locked composer with empty "Drafts"/"Published" lists behind a `Lock` glyph + "Captain access only" notice; every mutation stays server-blocked ("Captain access only." etc.).
**Options & exact values:** Presentation: acknowledge (default; label "Full-screen — must acknowledge", pill "Acknowledge"), popup (label "Pop-up — dismissable", pill "Pop-up"), feed (label "Quiet — inbox only", pill "Inbox"). Title max 120; body max 5000; textarea rows 6. Scope always everyone; channel both; kind announcement.
**Validation & rules:**
- Title/body trimmed min 1, capped 120/5000.
- Drafts are author-private: edit/delete/publish only succeed on own unpublished announcement rows; else "Draft not found or already published."
- Publish fans one delivery per real member except author (system/sanitised excluded); zero recipients still succeeds at 0; idempotent (no double fan-out).
- No edit/recall/unpublish after publishing; acknowledged roll-up shown only for acknowledge.
**Do-not-drop:** Draft→edit→publish lifecycle with per-presentation delivery and the acknowledge-only roll-up; publishing is irreversible and author-private. Non-captains may open the page but see a locked, data-less view (never the real drafts/published rows), not a redirect. No dead/404 flags in this unit.


### 19. Captain tools hub
**Purpose:** A captain-clearance, read-only index page listing captain-only tooling as tappable cards, reached from the "Camp Tools" tile on the captain control panel.
**Layout & elements:** Mobile single column inside a `max-w-2xl` main container. Top→bottom: a ghost back button labelled "Captains" with a leading left-chevron (returns to `/`); an `<h1>` "Camp tools"; a subtitle "Captain-only tooling for organising the camp."; then a list of tool cards. Each card has a bordered icon square, a title, a description, and a trailing right-chevron. The one current card: icon `Megaphone`, title "Announcements & notifications", description "Compose a camp-wide announcement, save it as a draft, then publish it to everyone. Choose how hard it lands — a full-screen note members must acknowledge, a pop-up, or a quiet inbox entry."
**Every action (preserve all):**
- Tap a tool card → navigate to that tool's href; the whole card is the link. Today's only card → `/captains/announcements`.
- Tap "Captains" back button → navigate to `/` (home control panel).
- Keyboard focus on a card → visible focus ring. Hover on a card → subtle background change.
- No forms, inputs, or mutations on this page; it is purely a navigation index.
**States to design:**
- Populated → gated captain sees header + card list (today exactly one card).
- Empty → if the tool list were emptied, a bare list renders; no dedicated empty-state copy or placeholder exists (dead branch today).
- Loading / validation-error / submitting / success / disabled → none on this surface (server-rendered, no controls).
- Unauthenticated → redirect to `/auth/sign-in`. Invite-gated (no invite, non-god) → redirect to `/signup/required`. Pending or rejected approval (non-god) → redirect to `/pending-approval`. Non-captain rank → the page still opens but shows **no data**: the tool cards render dimmed/locked behind a `Lock` glyph + "Captain access only" notice, never navigable (NOT a redirect). Onboarding-incomplete is NOT enforced here.
**Options & exact values:** Rank enum: "captain" | "member" (gates on "captain"). ApprovalStatus enum: "pending" | "approved" | "rejected" (passes on "approved"). Redirect targets: `/auth/sign-in`, `/signup/required`, `/pending-approval` (a rank shortfall does NOT redirect — it renders a locked, data-less view). Metadata title: "Camp tools — Camp 404". Layout width: `max-w-2xl`. No sliders, ranges, or numeric thresholds.
**Validation & rules:**
- Strict ordered gate chain: auth → invite → approval → rank; the first three redirect on failure, while a rank shortfall instead renders the locked, data-less view.
- God-email bypass clears invite + approval gates but NOT the rank gate (a god row defaults to "member" and sees the locked, data-less view).
- Non-captains still reach the page but see a locked, data-less view (`Lock` glyph + "Captain access only") — no real tool list is ever exposed.
- Tool href must point to a real built route; today's only target `/captains/announcements` exists and back-links here.
**Do-not-drop:** The exhaustive captain-only gate chain (auth → invite → approval → captain-rank, with non-captains shown a locked, data-less view rather than redirected) plus the extensible tool-card list. Latent dead/orphaned branch to carry: an empty tool list renders a bare list with no empty-state placeholder.


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


### 21. Voice dictation pipeline
**Purpose:** Let a member dictate free-form prose into a long-text host field instead of typing, transcribing the clip server-side and appending (never replacing) the result.
**Layout & elements:** Host field (questionnaire long_text Textarea, or bug-report description) with an outline "Dictate instead" button (Mic icon). Opting in mounts the RecorderPanel below the field (mobile single column): header row with a status label (left) and a ghost "Close dictation" X button (right); a centred big circular record button (Mic → Square → Loader2 spinner); a live waveform between button and timer; an mm:ss elapsed timer (only while recording); an error line (role="alert").
**Every action (preserve all):**
- Tap "Dictate instead" → mount RecorderPanel.
- Tap record button (idle) → mic permission prompt → record. Disabled while busy (requesting/processing).
- Tap button (recording, red Square) → stop + upload + transcribe.
- Tap button (error) → reset to idle.
- Auto-stop after 2 min; panel stays open after success to record again; transcripts append.
- Tap X "Close dictation" → dismiss/collapse; disabled while recording or busy.
**States to design:**
- idle: "Tap to record", Mic, enabled. requesting: "Allow microphone…", spinner, disabled. recording: "Recording", Square, destructive, waveform animating, timer. processing: "Transcribing…", spinner, disabled. error: "Tap to retry" + error line. empty/silent clip → silent return to idle. populated: transcript appended, panel reusable. success: onTranscript fired (non-empty trimmed text). disabled: record while busy, X while recording/busy. Gating (invite/onboarding/pending/rejected/captain-lock) NOT in this UI — route enforces auth only (401).
**Options & exact values:** RecorderState: idle|requesting|recording|processing|error. MIME priority: audio/webm;codecs=opus, audio/webm, audio/mp4, audio/ogg;codecs=opus. maxDurationMs 120_000 (2 min); MAX_BYTES 10MB; fftSize 1024; rate limits user 30/min, IP 60/min; promptKey "questionnaire" only (else unbiased); model whisper-large-v3-turbo. Clamps: questionnaire 1000, bug-report 5000. Errors: "Microphone permission denied"/"No microphone found"/"Couldn't access microphone"/"Recording failed"; server 401/429/400/415/413/502 ("Voice not configured"/"Transcription failed").
**Validation & rules:**
- Auth required (401). File must be audio/* (415); size ≤10MB (413).
- promptKey allow-listed server-side; unknown keys fall back to unbiased.
- Empty/silent clip and empty transcript suppressed (no append).
- Transcript appended with "\n" joiner unless value ends in trailing whitespace, then clamped to field max.
- Cross-browser MIME selection mandatory (iOS Safari falls to audio/mp4).
**Do-not-drop:** The opt-in → record → live-feedback → transcribe → append-and-clamp loop, with reusable panel and friendly permission/error states. DictateButton is dead/orphaned (no consumers); Capacitor native path is a TODO. A redesign must not lose append-never-replace or the auth/rate-limit/file-validation server contract.


### 22. Global overlays (ack-gate, shake-to-report, error, enable-push)
**Purpose:** Three globally-mounted surfaces above the app shell: a full-screen announcement acknowledgement takeover, a shake-triggered bug/feature reporter that files a GitHub issue, and a route error boundary.
**Layout & elements:** Mobile single column. (1) Ack takeover (dialog, max-w-2xl): Megaphone + uppercase "Camp announcement", title, meta "From {senderName} · {createdAt}" (drop "From" prefix if null), body (preserves line breaks), and at scroll end "{n} more after this." then "Acknowledge". (2) Report dialog title "Report a bug"/"Request a feature"; kind group ("Report type") Bug/Feature; label "What went wrong?"/"What would you like to see?"; textarea (placeholder "What you did, what you expected, and what happened instead."/"Describe the capability or improvement you have in mind."); "Dictate instead" → RecorderPanel; "Improve with AI" checkbox + "Restructures your report into a clear title and steps before filing."; "Send report" + "Cancel". Success: CheckCircle2 "Report filed", "Issue #{number} was created on GitHub. Thanks!" or "Thanks — your report was sent.", "View issue #{number}"/"Open the tracker", "Done". (3) Error card: "Something went sideways.", "An unexpected error tripped us up. Try again — if it keeps happening, let a camp captain know.", "Try again" + "Back to camp".
**Every action (preserve all):**
- Scroll-to-end + Acknowledge → POSTs, removes current item, reveals next; spinner + disabled while acking.
- Shake device (only trigger) → opens reporter; only when signed in and not already open.
- First pointerdown post-sign-in → iOS motion-permission prompt (once).
- Toggle Bug/Feature → switches copy/labels.
- Type description → max 5000 chars.
- Dictate → appends transcript; panel stays open.
- Toggle "Improve with AI" → only shown when AI available; default on.
- Send report → files issue; "Sending…" spinner; cannot dismiss mid-send.
- Cancel → closes; disabled while sending.
- View issue / Done; Try again (re-render) / Back to camp (/).
**States to design:**
- Empty → ack queue empty renders nothing; description empty, submit disabled.
- Loading → no ack spinner (shows nothing until data); session pending = treated signed-out.
- Populated → queue[0] shown; full form.
- Validation-error → "Please describe the issue."; maxLength; submit disabled until non-empty.
- Submitting → ack spinner/disabled; "Sending…", Cancel disabled, no dismiss.
- Success → "Report filed" view; ack removed + refresh.
- Disabled → empty/pending submit; Cancel while pending.
- Invite-gated/pre-invite → feedback works ("unlinked" reporter); ack queue empty without camp access.
- AI-unavailable → checkbox hidden, useAi forced false.
- Config-error → inline error banner (missing token / bad repo).
- Error boundary → full-screen retry + home, focus on heading.
**Options & exact values:** Kind: "bug"|"feature" (default "bug"). Labels: ["bug","from-app"]/["enhancement","from-app"]. Severity: critical|high|medium|low. Presentation surfaced: "acknowledge" only. DESCRIPTION_MAX=5000; TITLE_MAX=100; ISSUE_BODY_MAX=60000; POLL_INTERVAL_MS=45000. Shake: threshold=8, requiredJolts=5, windowMs=800, cooldownMs=3000, SAMPLE_THROTTLE_MS=60. Rate limits: burst 3/60000ms, daily 20/86400000ms. Repo default "RyRy79261/camp-404". AI model "claude-haiku-4-5-20251001", max_tokens 1024, temp 0, timeout 30000; GitHub timeout 8000. Env: GITHUB_FEEDBACK_TOKEN, GITHUB_FEEDBACK_REPO, ANTHROPIC_API_KEY, E2E_TEST_MODE.
**Validation & rules:**
- Description required/trimmed/≤5000; blank/HTML-only/all-PII → "Please describe the issue." (no issue filed).
- deliveryId must be UUID (400); ack is owner+presentation-scoped.
- Mandatory ordered PII redaction (tokens, JWT, keys, URL params, emails, phones, IDs, cards → placeholders); AI input is sanitized text; AI output re-sanitized; markdown injection defused (fenced/mdInline/inlineCode).
- Auth gate: not signed in → "Please sign in to send feedback." Config gates: missing token / bad repo → captain messages.
- GitHub status messages: 401/403/404/410/other/timeout each map to a distinct error string; 201 validated, else "Your report was filed, but we couldn't read GitHub's reply."
- E2E mode bypasses AI+GitHub returning number 0.
**Do-not-drop:** Shake-only reporter that PII-redacts then files a GitHub issue (no DB write), the ack takeover forcing scroll-to-end acknowledgement with de-raced polling, and the error boundary's retry/home escape. No dead/orphaned variants; note MODELS.opus exists but is unused here.


### 23. Enable-push opt-in
**Purpose:** Lets an authenticated, camp-access member opt in to web push so queued notifications can be delivered to their device.
**Layout & elements:** Mobile single column on the authenticated home control panel. A single centered button labeled "Enable notifications" (secondary, small). No other chrome — no title, spinner, error toast, or disabled control. The button is the only visible element, and only when the browser permission is undecided.
**Every action (preserve all):**
- Tap "Enable notifications" → requests browser permission (must run inside the click/user gesture). Granted → register/refresh FCM token, POST `{ token, platform: "web" }`, surface vanishes (granted). Denied → vanishes, never re-prompts (browser controls only). Dismissed → button stays.
- (Automatic) On mount when already granted → silently refresh + re-register token, no UI.
- (Automatic) Foreground message while granted → show native notification (icon `/icon.svg`) only if payload valid AND permission still granted.
- (Automatic) Background message → service worker shows notification (title fallback "Camp 404", icon `/icon.svg`).
- No disable/opt-out toggle exists in this surface; revoke via browser only.
**States to design:**
- loading → detection in flight → renders nothing.
- unavailable → unsupported / unconfigured / error → renders nothing.
- default (empty/undecided) → the only state showing the button.
- granted (populated/success) → token registered → renders nothing.
- denied (disabled) → renders nothing, no re-prompt.
- Gating: invite-gated / onboarding-incomplete / pending / rejected never reach this surface (page gating redirects first; token route also enforces auth + camp access). Role: rank-agnostic, every member sees it.
**Options & exact values:** platform sent: "web" (enum web/ios/android; ios/android unused). Channels drained: push, both. Delivery status: queued/sent/failed/skipped. Button label "Enable notifications". Icon "/icon.svg". Title fallback "Camp 404". Cron "25 9 * * *".
**Validation & rules:**
- Button shows only when permission undecided; deny is permanent here.
- Token POST is best-effort: failures swallowed silently, no UI error.
- Foreground notification gated on valid payload + still-granted permission.
**Do-not-drop:** The self-effacing single-button opt-in that requests permission on a user gesture and registers the FCM token — never re-prompting after deny. Carry forward: DELETE token route is orphaned (no in-repo caller); `topics` and ios/android platform are plumbed but dead/unused on web.


### 24. Shared UI primitive kit
**Purpose:** The restyleable, presentational shadcn-style ("new-york") primitive layer every Camp 404 screen reuses — buttons, inputs, labels, checkboxes, selects, sliders, cards, dialogs, popovers, command palettes, comboboxes, and avatars — owning no data, server calls, routing, or gating.
**Layout & elements:** Mobile single column. Button; Input (native, with file-pick styling); Textarea (`min-h-[80px]`); Label (dims with disabled peer); Checkbox (lucide `Check`); Select family (trigger with `ChevronDown`, portalled content, item `Check`, scroll up/down `ChevronUp`/`ChevronDown`); Slider (1+ thumbs, horizontal); Card / CardHeader / CardTitle / CardDescription / CardContent / CardFooter; Dialog (centered, top-right `XIcon` + sr-only "Close", optional footer "Close" button, overlay); Popover (`w-72`); Command palette (leading `Search`, list, empty, group, item, shortcut, separator); Combobox (outline trigger with selected `label` or muted placeholder + `ChevronsUpDown`, search field, `Check` row); Avatar / AvatarImage / AvatarFallback (initials).
**Every action (preserve all):**
- Button click/keyboard activate → fires action; `disabled` blocks pointer events; `asChild` routes activation to wrapped element (e.g. link).
- Input/Textarea type/focus/blur/paste/file-pick → native; no debounce/masking.
- Label click → focuses associated control via `htmlFor`.
- Checkbox click/Space → toggles checked⇄unchecked (tristate `"indeterminate"` supported, no distinct visual).
- Select open (click/Enter/Space) → arrow-navigate, type-ahead, select (closes, shows `Check`), scroll buttons.
- Slider drag/arrow-step (caller `step`) → each thumb independently movable; `disabled` dims/blocks.
- Dialog open via trigger → close via X (if `showCloseButton`), footer "Close", Escape, or overlay click; focus trapped.
- Popover/Command/Combobox open → outside-click/Escape closes; Combobox type-filter then select fires `onChange(value)`, shows `label`, closes.
- Avatar image load failure → auto-swaps to fallback.
**States to design:**
- Empty → Combobox placeholder "Select…" / `emptyMessage` "Nothing found."; Command empty; Select/Input/Textarea placeholders; Avatar fallback initials.
- Loading → Avatar fallback while image loads; no spinner primitive exists.
- Populated → selected `label` + `Check`; inputs show value; cards/avatars render.
- Validation-error → NO built-in error variant; consumer adds error classes via `className`.
- Submitting → NO `loading`/`pending`/`isLoading` prop; caller passes `disabled` and swaps children.
- Success → none; consumer-expressed.
- Disabled → universal: opacity-50 + blocked pointer/cursor across all; Label dims via `peer-disabled`.
- Open/closed → Radix `data-[state=open|closed]` zoom/fade/slide; Combobox tracks own `open`.
- Gating (invite-gated / onboarding-incomplete / pending-approval / rejected / captain-only-locked) → OUT OF SCOPE; enforced upstream by routing/ControlPanel, not here.
**Options & exact values:** Button variants `default | destructive | outline | secondary | ghost | link` (default `default`); sizes `default | sm | lg | icon | icon-lg` (default `default`). Slider `min=0`, `max=100`, caller `step`, thumbs = value count else 2. Combobox defaults `placeholder="Select…"`, `searchPlaceholder="Search…"`, `emptyMessage="Nothing found."`; `ComboboxOption {value,label}`. Dialog `DialogContent.showCloseButton=true`, `DialogFooter.showCloseButton=false`. Popover `align="center"`, `sideOffset=4`, `w-72`. Select `position="popper"`, `max-h-96`, `min-w-[8rem]`. Icons: `Check`, `ChevronDown`/`ChevronUp`, `ChevronsUpDown`, `Search`, `XIcon`.
**Validation & rules:**
- No validation lives here; primitives constrain nothing — consumers own required/pattern/min/max/messaging.
- `cn()` merge: later Tailwind utility wins (`px-2`+`px-4`→`px-4`); falsy dropped; arrays/objects flattened — lets callers override classes.
- Slider: non-array value/defaultValue falls back to `[min,max]` → TWO thumbs; single-value REQUIRES a 1-element array.
- Combobox search matches visible `label`, persists `value`; muted placeholder when value unset/not in options.
- Avatar: consumer must supply fallback initials; no default glyph.
- Dialog: keep at least one exit (X, footer Close, Escape, or overlay) so "every gate has an exit".
- Colour from single OKLCH `@theme` `var(--color-*)` only; entities disambiguated by ICON + LABEL, never per-entity hue. No barrel index — import per path `@camp404/ui/components/<name>`.
**Do-not-drop:** A purely presentational, fully restyleable primitive set where any caller overrides classes via `cn()` and dropdowns track trigger width — losing this breaks every screen's reuse and theming. DEAD/ORPHANED: Button size `icon-lg` (`h-14 w-14`) defined but has no consumer; `CommandShortcut` also unused — preserve both.


## Closing instruction to Pencil

Design all surfaces as one cohesive system that shares a single primitive kit (buttons, inputs, cards, dialogs, badges, the control panel) and the tokens above — a screen should feel like part of the same app as its neighbours. Where a surface is marked **inert / dead / 404**, design the *intended* behavior (what it should do), not the current broken state. Deliver a **dark, mobile, on-brand** set in which **every listed capability is representable** — restyle freely, but drop no functionality.
