# Camp 404 — full-app design prompt (paste into Pencil)

This single prompt asks Pencil to design **every screen of the Camp 404 app** as one cohesive system. The information architecture, the per-screen functional contract, and the design tokens are **fixed** and must be honoured exactly; the visual craft — layout rhythm, motion, iconography, the expression of the brand — is **yours** to author. There are **23 surfaces** specified below; design each as its own frame, all sharing a single dark, mobile-first, on-brand language.

## How to use this prompt

- Design each `###` surface below as its **own frame/screen** (or component sheet, for the primitive kit), in the order given.
- **Preserve every listed action, state, option, enum, and validation rule** for each surface — these are the load-bearing functional contract, not suggestions. Re-style freely; never drop a capability. If a surface lists five states, design five states; if it lists three error messages, show three; if a control has an exact label, use that label.
- This is **mobile-first, single-column (~430px), DARK only**. Do not invent phone chrome (no iOS status bar, no "9:41" clock, no battery/signal, no bezel, no OS tab bar).
- For each surface, feel free to offer **1–2 visual directions** that hit the same functional spec (e.g. one restrained/utilitarian, one more expressive with the camp's neon/terminal energy), so the camp can pick the strongest expression.

## Global rules (apply to EVERY screen)

- **Theme & form factor:** mobile-first, single column (~430px), **DARK only**. No invented phone chrome.
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
| Captain-only-locked | Viewer rank below the surface's required rank | Either a **visible-but-locked** dimmed view with a `Lock` glyph (home / control-panel / camp-management) **or** a hard redirect to `/` (captain tools hub & announcements) — follow each surface's note exactly |

## Screens & components to design

Design each of the following as its own frame. Real labels and copy are quoted; preserve every action, state, and option.
