# Camp 404 — design tokens & typography spec

Single source of truth for the type scale, colour tokens, and radius scale. The
goal: **one consistent type scale and zero ad-hoc colours** anywhere in the app.

- **Source of truth:** the `.pen` design boards (extracted to
  `design/.spec-extract/boards/`) plus the surface briefs in
  `design/spec/surfaces/*.md`. Boards win; divergences are flagged and normalised
  here. `design/feature-set/` is reference-only (decision #1).
- **Type/colour reference board:** `S24 Primitive kit`
  (`design/.spec-extract/boards/33-s24-primitive-kit.txt`).
- **Live tokens:** `packages/ui/src/styles/globals.css` (OKLCH `@theme`).
- **Decisions applied:** #2 (JetBrains Mono = deliberate data-console + brand
  face; JetBrains Mono is the data-console face), #3 (`CaptainLock`
  preview-but-locked). Visual-direction memo `design/recommendations.md` P0-2
  (semantic status tokens), P1-5 (token-spelling), P1-6 (radius + type tokens).

Dark-only. There is no light theme (`design/brief.md`). The dead `dark:` status
variants (recommendations P2-8) fold into the semantic status tokens defined
below, then get stripped (code follow-up, out of scope for this spec).

> **Scope reality check.** The live count of off-token status colours is far
> higher than the memo's "~36": `apps/web` alone carries **600+** raw
> `emerald/amber/sky/rose-*` utilities (many with dead `dark:` twins). This spec
> is the target the codemod normalises them to.

---

## 1. Type scale

Two faces, deliberately split by role. **There is no third face.**

- **Inter** — the UI face. All prose, titles, labels, body, controls, captions,
  pills.
- **JetBrains Mono** — the **deliberate data-console + brand-accent face**
  (decision #2). It is the brand's "terminal" voice and is used **only** for:
  brand wordmark/glitch art, eyebrow caps labels, invite slugs, the family-tree
  "via `<code>`" / "root" lines, the roster terminal console (prompts, record
  counts, field-label captions), MCP scope strings, the inline Google "G" mark,
  and the error-boundary trace code. **Never used for prose.**

### 1.1 Roles (the canonical scale)

| Role | Token | Font | Size | Weight | Line / tracking | Where used |
|---|---|---|---|---|---|---|
| **Brand glyph (404)** | `--text-brand-glyph` | JetBrains Mono | `clamp(7rem, 30vw, 14rem)` | 900 | lh 0.9 · `-0.05em` | Landing `Glitch404` five-layer stacked art (`aria-hidden`). Board's `150px/800` is a static proxy; the live `clamp` multi-layer impl is canonical (01-landing). |
| **Wordmark / brand label** | `--text-brand-label` | JetBrains Mono | 10–11px | 500 | UPPERCASE · `0.3–0.5em` | Landing `<h1>` "Camp 404" (10/500/`0.5em`) + tagline "Error 404 — Camp not found" (11/500/`0.3em`); auth/onboarding footer "Camp 404 is invite-only." (11/normal). |
| **Eyebrow (mono caps)** | `--text-eyebrow` | JetBrains Mono | 11px | 700 | UPPERCASE · `2px` | Section eyebrows above titles: "UI PRIMITIVE KIT", "REQUIRED QUESTIONNAIRE", "CAMP ANNOUNCEMENT", "SECTION B — REQUIRED QUEUE". Colour `$accent`. |
| **Display** | `--text-display` | Inter | 32px | 700 | lh 1.1 | Primitive-kit "Display / 32 bold"; largest Inter heading. Reserve for hero/marketing-scale headings. |
| **Page title** | `--text-title` | Inter | 22–26px | 700 | lh 1.2 | `<h1>` per surface. **26px** = standard page title (Family tree, Camp tools, Questionnaire gate, AckTakeover). **24px** = wizard interstitial heading. **22px** = compact title (Notifications, questionnaire-gate overlay, complete screen). Roster mobile H1 = 25px → snap to 26. |
| **Section header** | `--text-section` | Inter | 20px | 700 | lh 1.3 | Sub-section headings inside a surface ("Finish these to unlock the app"). |
| **Card / subtitle title** | `--text-subtitle` | Inter | 15–18px | 700 | lh 1.3 | Card titles, identity rows, dialog titles. 18 = hero card header ("One more thing"); 16 = card/question prompt, identity rows; 15 = dense list-row `CardTitle`, `CaptainLock` title. Default to the **16px** step unless the board explicitly draws 15 or 18 (§1.2). |
| **Body** | `--text-body` | Inter | 14px | 400 | lh 1.45 | Default body / subtitle copy. The primitive-kit "Body / 14 regular". |
| **Body-emphasis** | `--text-body-strong` | Inter | 14px | 500–600 | lh 1.45 | Strong body / status-strip message / toggle labels / segmented labels / "Continue with Google". |
| **Label** | `--text-label` | Inter | 13px | 600–700 | lh 1.4 | Section labels ("Typography", "Colour tokens"), link text, segmented controls, helper headings, chip labels. `$muted-foreground` or `$accent` for links. |
| **Caption / muted** | `--text-caption` | Inter | 12px | 400–500 | lh 1.4 | Meta lines, count chips, attribution, reassurance lines, swatch labels, "Sent to N members". `$muted-foreground`. |
| **Micro / pill** | `--text-micro` | Inter | 10–11px | 600–700 | lh 1.2 | Badge/pill text ("Default", "Captain", "New"), "LOCKED"/"VIEW ONLY" annotations. 11 = standard pill; 10 = "New" pill. |
| **Mono data** | `--text-mono` | JetBrains Mono | 13–16px | 500–700 | lh 1.5 | Terminal/data rows: primitive-kit "Mono / 13 — terminal" (13/500), roster terminal console, MCP scope string `mcp:user` (13/600), invite slug box (14/500 / 16/500), Google "G" (15/700), error trace code chip. |
| **Mono caption** | `--text-mono-caption` | JetBrains Mono | 9–12px | 500–600 | lh 1.4 | Family-tree "via `<code>`" / "root" lines (12/normal), roster field-label captions (11/600), enable-push null-state comments (10/500), Pencil-canvas separators (9/500 — never rendered). |

### 1.2 Title/subtitle size normalisation

The boards drift across one-pixel steps. Lock the scale to these steps and snap
stray values:

- **Page title:** 26px/700. Snap roster mobile **25 → 26**. Keep **24** only for
  the wizard `IntroInterstitial` heading and **22** for system overlays /
  Notifications / completion screen (deliberate compact variant).
- **Subtitle/card title:** standardise on **16px/700**. Keep **18px** only for a
  hero card header (invite-gate "One more thing"), and **15px** only for dense
  list-row `CardTitle` (captain tools / roster rows / `CaptainLock`). Do not
  introduce 17px — snap questionnaire-runner `TitleRow` **17 → 16**.
- **Body:** 14px is the floor for readable prose; **15px** is allowed only for
  long-read copy (AckTakeover announcement body, questionnaire-gate subhead,
  wizard interstitial body) — deliberate long-form exceptions.

### 1.3 Font wiring (code follow-up — P1-6)

No typography tokens exist today and **no font is currently loaded** —
`apps/web/app/layout.tsx` wires no `next/font`, and `globals.css` defines no
`--font-*`. The "terminal" motif is inline-hardcoded. To make the look tunable
in one place:

1. Load both faces via `next/font/google` in `apps/web/app/layout.tsx`
   (`Inter` → `--font-inter`, `JetBrains_Mono` → `--font-jetbrains-mono`),
   applied to `<html>`/`<body>`.
2. In `packages/ui/src/styles/globals.css` `@theme`, add:
   ```css
   --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
   --font-mono: var(--font-jetbrains-mono), ui-monospace, SFMono-Regular,
                Menlo, Monaco, Consolas, monospace;
   ```
   so `font-sans` / `font-mono` Tailwind utilities resolve to the brand faces.
3. Optionally register the `--text-*` size steps above as Tailwind `@theme`
   `--text-*` tokens so sizes are named, not inline. The roles in §1.1 are the
   canonical set; do not add ad-hoc px sizes outside this scale.
4. **Glyph face:** the `Glitch404` art uses a hard-coded system-monospace stack.
   Switch it to `--font-mono` (JetBrains Mono) for brand consistency
   (recommended). Confirm against the deliberate-decorative open question
   (01-landing).

---

## 2. Colour tokens

### 2.1 The single dark palette (confirmed — keep as-is)

Sampled from the lantern-lit-tent reference: midnight-violet base, hot-magenta
primary, electric-blue accent. All values are OKLCH in
`packages/ui/src/styles/globals.css`. **Confirmed canonical — no change to the
existing token pairs.**

| Token | OKLCH | Role |
|---|---|---|
| `--color-background` | `oklch(0.15 0.05 295)` | App base (midnight violet) |
| `--color-foreground` | `oklch(0.97 0.02 330)` | Primary text |
| `--color-primary` | `oklch(0.65 0.27 340)` | Hot-magenta brand / primary action |
| `--color-primary-foreground` | `oklch(0.99 0.005 340)` | Text on primary |
| `--color-secondary` | `oklch(0.42 0.18 320)` | Quieter magenta-violet interactive (captain action, captain pill) |
| `--color-secondary-foreground` | `oklch(0.98 0.01 330)` | Text on secondary |
| `--color-muted` | `oklch(0.22 0.06 295)` | Auth/surface background, inputs, neutral pills |
| `--color-muted-foreground` | `oklch(0.7 0.05 325)` | Muted text, captions, meta |
| `--color-card` | `oklch(0.26 0.08 295)` | Elevated card surface |
| `--color-card-foreground` | `oklch(0.97 0.02 330)` | Text on card |
| `--color-popover` | `oklch(0.26 0.08 295)` | Popover (= card elevation) |
| `--color-popover-foreground` | `oklch(0.97 0.02 330)` | Text on popover |
| `--color-border` | `oklch(0.35 0.1 305)` | Borders / dividers |
| `--color-input` | `oklch(0.35 0.1 305)` | Input borders |
| `--color-accent` | `oklch(0.62 0.18 255)` | Electric-blue second brand colour: highlights, focus, **captain identity**, eyebrows, info |
| `--color-accent-foreground` | `oklch(0.99 0.005 255)` | Text on accent |
| `--color-destructive` | `oklch(0.65 0.22 18)` | Errors / reject / blocked |
| `--color-destructive-foreground` | `oklch(0.98 0 0)` | Text on destructive |
| `--color-ring` | `oklch(0.65 0.27 340)` | Focus ring (= primary) |
| `--radius` | `0.625rem` | (see §3) |

### 2.2 New semantic status tokens (P0-2 — ADD)

Today the **only** status token is `destructive`; success/warning/info are
hardcoded raw hex or Tailwind `emerald/amber/sky/rose`. Add three semantic
status tokens + their foregrounds, in OKLCH to match the palette, then codemod
the 600+ off-token usages.

| Token | OKLCH (target) | Sourced from / role |
|---|---|---|
| `--color-success` | `oklch(0.78 0.17 155)` | Green "ready / approved / saved / available". Replaces raw `#3fd07a` (roster APPROVED count + status bar, slug "available") and `emerald-*`. |
| `--color-success-foreground` | `oklch(0.18 0.03 155)` | Text/icon on success fills |
| `--color-warning` | `oklch(0.80 0.16 80)` | Amber "outstanding / pending / awaiting / incomplete". Replaces raw `#e0a800` (roster Outstanding chip) and `amber-*` (pending clock, INCOMPLETE intent). |
| `--color-warning-foreground` | `oklch(0.20 0.04 80)` | Text/icon on warning fills |
| `--color-info` | `= --color-accent` | Informational "heads up". Alias `info` to `accent` — the existing electric-blue already carries info alerts. Do **not** introduce a separate `sky`. |
| `--color-info-foreground` | `= --color-accent-foreground` | Text/icon on info fills |

Notes:
- **`info` = `accent`.** The primitive-kit "Heads up" alert and the
  questionnaire-complete check badge use `$accent` on a cyan tint; `info` is the
  neutral notice. `success` is reserved for genuinely affirmative/ready states
  (approved member, draft saved, slug available).
- **Affirmative-banner rule (resolves the announcements drift):** the
  announcements "Draft saved." / "Published." success banner is drawn ambiguously
  as `$accent`/emerald on a cyan tint. **Normalise all affirmative *write*
  confirmations to `success`** (green); reserve `accent`/`info` for neutral
  "heads up" notices. The questionnaire-complete check badge is the one
  deliberate exception — it stays on `accent`/`info` to avoid the
  destructive/warning palette per the brief.
- **Captain identity = `accent`**, NOT a new token (decision #6, confirmed in
  family-tree + announcements). Do not create a `captain` colour token.

### 2.3 Tint convention (replace ALL raw hex tints)

Boards express translucent fills as raw 8-digit hex (`#rrggbbaa`). Every one of
these must become a **token-at-alpha** using the modern CSS `/ <alpha>` syntax in
OKLCH (e.g. `oklch(from var(--color-primary) l c h / 0.18)`) or a Tailwind
opacity utility (`bg-primary/15`). **No raw hex tints in built code.**

Canonical alpha steps: **8% (subtle) · 12% · 15% (standard) · 18% · 25% (strong).**
Snap odd alphas to the nearest step:

| Board alpha (hex) | ≈ | Snap to |
|---|---|---|
| `08` | 3% | 8% (subtle) |
| `14` | 8% | 8% (subtle) |
| `1a` | 10% | 12% |
| `1f` | 12% | 12% |
| `22` | 13% | 12% |
| `24` | 14% | 15% |
| `26` | 15% | 15% (standard) |
| `2e` | 18% | 18% |
| `40` | 25% | 25% (strong) |
| `80` | 50% | scrim — keep as overlay token (§2.4) |

### 2.4 Overlay / scrim (full-opacity blacks)

Distinct from brand tints — these are dimming scrims, not coloured fills:

- `#1d133380` (avatar-upload empty circle), `#00000080` (uploading-loader
  overlay), `#00000080` (dialog scrims) → introduce **`--overlay`** = a
  background-derived 50% scrim (`oklch(from var(--color-background) l c h / 0.5)`)
  for modal/upload dimming. No raw black hex.

---

## 3. Radius scale

Only `--radius: 0.625rem` (10px) exists today, and only the control grid uses it;
everything else hardcodes `rounded-md/lg/xl`/`rounded-full` (live `packages/ui`:
12× `rounded-md`, 12× `rounded-full`, 3× `rounded-sm`, 1× `rounded-lg`, 1×
`rounded-xl`). Boards use raw numbers (`r:3/5/6/7/8/16/20/999`) + the `$radius`
token. Tokenize (P1-6):

| Token | Value | Maps board values | Where used |
|---|---|---|---|
| `--radius-sm` | `0.375rem` (6px) | `r:5`, `r:6`, `r:7` | Swatch chips, checkboxes, small segments, segmented inner cells. |
| `--radius` (md) | `0.625rem` (10px) | `r:8`, `$radius` | **Default.** Cards, inputs, buttons, alerts, dialogs, list rows, scope rows, the control grid. Board's literal `r:8` snaps here. |
| `--radius-lg` | `0.875rem` (14px) | `r:16`, `r:20` | Larger containers / avatar wraps where boards draw 16–20px. |
| `--radius-full` | `9999px` | `r:999` | Pills, toggles/switches, icon circles, avatars, "New"/status badges. |

Rules:
- Use `--radius` (md) as the default for every card/input/button/dialog — this is
  what `$radius` means on the boards.
- Use `--radius-full` for all pills, switches, and circular icon/avatar wraps.
- Snap stray board numbers: `r:5/6/7 → sm`, `r:8 → md`, `r:16/20 → lg`. `r:3`
  (progress-track bar) is bespoke geometry — keep inline (`r:3`), not a token.
- Replace all hardcoded `rounded-md/lg/xl` in `packages/ui` + apps with the
  radius utilities driven by these tokens.

---

## 4. Reconciliations (concrete normalise-to instructions)

Every drift, with the exact target. These are the actionable codemod targets.

### Colour

1. **Captain pill (family-tree):** live `bg-amber-500/15 text-amber-300` →
   **`$accent`** (text `accent`, fill `accent/15%`). Resolves the `$accent` vs
   amber drift.
2. **Match-highlight border (family-tree):** live `border-amber-400/60` →
   **`stroke:$accent`** (no amber on the tree).
3. **Captain-rank pill `#75188840` (primitive-kit "Captain", roster "Team
   Member" / captain chips):** → **`secondary/25%`** fill, text
   `secondary-foreground`. This is the captain/secondary identity (decision lists
   `#ff008c2e RankPill vs $secondary`).
4. **Magenta primary tint `#ff008c2e` / `#ff008c26` (RankPill / icon circles /
   announcements Acknowledge pill / voice ring / questionnaire-gate, mcp-connect,
   CaptainLock, captain-tools icon badges):** → **`primary/18%`** (`2e`) /
   **`primary/15%`** (`26`) fill, `text-primary`. Generic magenta icon badges +
   primary pills use `primary`; **captain-rank** pills use `secondary` (#3) — this
   resolves the naming clash.
5. **Magenta selected/checked tint `#ff008c14` (wizard RadioCard step 10,
   CheckboxChip checked, notifications unread row), `#ff008c1a` (unread row),
   `#ff008c22` (country combobox selected):** → **`primary/8%`** (`14`),
   **`primary/12%`** (`1a`), **`primary/12%`** (`22`), `stroke:$primary`.
6. **Single/multi-select chosen-row `#ff008c1a` (questionnaire runner):** →
   **`primary/12%`**, `stroke:$primary`.
7. **Accent tint `#00dcff26` (primitive-kit "Accent" badge, mcp scope icon wrap,
   notifications inbox, family-tree captain):** → **`accent/15%`** fill,
   `text-accent`.
8. **Heads-up / info alert `#00dcff1a` (stroke `$accent`):** → **`accent/12%`**
   (= info), `stroke:$accent`.
9. **Scan-overlay `#00dcff08` (invite-gate scanline):** → **`accent/8%`**.
10. **Success banner `#00dcff1f` (announcements "Draft saved."):** →
    **`success/12%`** fill, `text-success`, `check` icon (affirmative-write rule,
    §2.2). Not `accent`.
11. **Questionnaire-complete check badge `#00dcff24` / `#00dcff1f`:** →
    **`accent/15%`** (info) — deliberately keeps the affirmative end-state off the
    destructive/warning palette per the brief; stays `accent`/info, NOT success.
12. **Error pill / banner `#f83e5a1f` (`1f`) / `#f83e5a1a` (`1a`) / `#f83e5a2e`
    (`2e`, questionnaire page-level + save-failed banners):** → snap all to
    **`destructive/12%`** unless a board deliberately draws a stronger banner
    (then `destructive/18%` for `2e`), always `stroke:$destructive`.
13. **Roster APPROVED green `#3fd07a` + status-bar green + slug-available green:**
    → **`$success`**.
14. **Roster Outstanding chip amber `#e0a800`:** → **`$warning`** (+
    `triangle-alert`).
15. **Roster INCOMPLETE numeral drift:** mobile uses `$accent`, terminal uses
    `$primary`. The stat means "needs action" → **normalise both breakpoints to
    `$warning`**. Pick one and apply to mobile + terminal.
16. **Roster status bar (4px left rail):** `$accent` = onboarding/active,
    `#3fd07a` → **`$success`** = approved/ready, `$destructive` =
    rejected/blocked.
17. **Roster selected-row wash `#00dcff14` / alternating zebra `#ffffff07`:** →
    **`accent/8%`** (selected) and **`foreground/3%`** (zebra) — token-at-alpha,
    no raw hex.
18. **Per-member avatar tints (roster):** "mono initials on a per-member tint"
    must be generated from a fixed palette of **token-derived hues** (rotate
    through `primary`/`accent`/`secondary`/`success`/`warning` at ~20% alpha), not
    arbitrary hex. Define the avatar-tint set from tokens.
19. **Avatar-upload empty circle `#1d133380` + uploading overlay `#00000080` +
    dialog scrims `#00000080`:** → **`--overlay`** scrim token (§2.4).
20. **Google "G" badge `#4285F4` (mcp-connect) + auth Google mark:** brand-
    exception colour (Google's mandated blue). **Keep as a literal**, documented
    as a sanctioned third-party brand exception, not an app token.
21. **Strip the dead `dark:` status variants** (`dark:text-{emerald,sky,rose,
    amber}-*`, 600+ across `apps/web`) once intent is folded into
    `success`/`warning`/`info`/`destructive` (recommendations P2-8; code
    follow-up).

### Typography

22. **Token-spelling (P1-5):** standardise on the **short** Tailwind form
    (`text-foreground`, `bg-primary`) and codemod the ~93 verbose
    `text-[color:var(--color-foreground)]` uses. `@camp404/ui` already uses short
    form.
23. **Title size:** snap roster mobile H1 **25 → 26**; questionnaire-runner
    `TitleRow` **17 → 16** (§1.2). No 17px or 25px in the scale.
24. **Mono motif tokenized:** replace every inline JetBrains-Mono hardcode
    (wordmark, eyebrows, slugs, via-lines, roster terminal, scope strings, Google
    "G", trace codes) with `font-mono` → `--font-mono` (§1.3). One place to tune.
25. **Eyebrows are always JetBrains Mono / 11 / 700 / `$accent` / UPPERCASE /
    `2px` tracking** — unify "UI PRIMITIVE KIT", "REQUIRED QUESTIONNAIRE", "CAMP
    ANNOUNCEMENT", "SECTION B — REQUIRED QUEUE" onto this one role. The
    questionnaire-complete "SECTION B" eyebrow is drawn as **Inter** 11/700 —
    **normalise it to the mono eyebrow role** for consistency.
26. **Error trace code chip** ("ERR_RENDER · trace 8f3a2", surfacing
    `error.digest`) → **`--text-mono`** (JetBrains Mono), consistent with the
    data-console motif (decision #2).
27. **`Glitch404` glyph face** → `--font-mono` (JetBrains Mono), unless the
    system-mono fallback is a deliberate decorative choice (confirm, 01-landing).
    Recommendation: JetBrains Mono.

### Radius

28. Replace every hardcoded `rounded-md/lg/xl` in `packages/ui` + apps with the
    radius tokens (§3). Default container = `--radius` (md). All pills / circles =
    `--radius-full`. `$radius` on boards = `--radius`.

### Required-field marker

29. **Required-field marker `*`** (the Label asterisk on required questions) →
    **`$primary`** (per live code), overriding the boards' `$destructive` draw. The
    `*` is a prominence cue, not an error, so it takes the brand primary — never
    `destructive`. Resolves the flagged-but-unreconciled marker colour noted in
    `20-field-renderer.md` and `component-library.md`.

---

## 5. Open items to confirm

- **Glyph font** (system-mono vs JetBrains Mono) — 01-landing open question.
- **`success`/`warning` exact OKLCH values** — proposed in-palette (green ~155°,
  amber ~80°); tune for contrast against `--color-background` before locking.
- **Avatar tint palette** (roster) — confirm the token-derived hue set.
- **`--overlay` alpha** (50% proposed) — confirm against upload/dialog scrims.
