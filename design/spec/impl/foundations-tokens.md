# Impl plan — design-system foundations (tokens + typography)

Turns `design/spec/design-tokens.md` into a build plan. **Plan only — no code in
this PR.** This is the foundation layer: the `@theme` token set, the font wiring,
and the codemods that normalise the app onto them. Every other impl doc
(`components/`, `app/`, surfaces) depends on the tokens defined here, so this
ships first.

Source of truth: `design/spec/design-tokens.md` (§1–5) + `design/recommendations.md`
(P0-2 status tokens, P1-5 token-spelling, P1-6 radius/type, P2-8 dark-strip).
`design/feature-set/` is reference-only (decision #1).

---

## 0. Ground truth (verified against the live tree, 2026-06-02)

The spec's headline counts conflate **two different populations**: the raw-hex
tints baked into the `.pen` design boards (hundreds), and the off-token utilities
in the **live `apps/web` code** (a few dozen). The codemod operates on *code*, so
the live numbers below are what the plan is sized against. Where the board tints
matter (§2.3 tint convention) they are the spec the new components are built to —
not strings to find-and-replace in shipped files.

| What | Spec said | Verified live (code) | Where |
|---|---|---|---|
| `emerald/amber/sky/rose-*` utilities | "600+" / "~36" | **24 occurrences, 5 files** | see §3 group A |
| `dark:` status variants | "12" / "600+" | **0** (already absent) | grep clean — §4 |
| verbose `[color:var(--color-*)]` | "~93" | **115 in `apps/web`, 50 in `packages/ui`** | §3 group F |
| `--font-*` tokens | none | **none** — `font-mono` classes already used, resolve to Tailwind default mono fallback | §1, §2 |
| raw 8-digit hex tints in code | many | **board-only**; live code has a handful of 6-digit scrim/brand hex (`#0d061e`, `#1d1333`, etc.) | §3 group B |
| `rounded-*` hardcodes | 12+12+3+1+1 (`packages/ui`) | **`packages/ui`: 12 `rounded-md`, 12 `rounded-full`, 3 `rounded-sm`, 1 `rounded-lg`, 1 `rounded-xl`, 1 `rounded-[var(--radius)]`. `apps/web`: 14 md, 19 full, 10 lg, 2 sm, 1 xl** | §3 group H |

Environment (verified): Tailwind **v4.3** (`@import "tailwindcss"` + `@theme`),
Next **16.2**, pnpm workspace. `packages/ui/src/styles/globals.css` is exported as
`@camp404/ui/styles.css` and imported once in `apps/web/app/layout.tsx`. The web
app `@source`s the components dir so package CVA utilities get generated.

`suppressHydrationWarning` is **already** on `<html>` in `layout.tsx` (recs P2-8
hydration fix done) — not part of this plan.

Classification legend (per the locked plan): **REUSE** keep as-is · **EXTEND**
modify · **NEW** build · **DELETE** dead.

---

## 1. `globals.css` `@theme` changes (NEW + EXTEND)

File: `packages/ui/src/styles/globals.css`. The existing 19 colour pairs +
`--radius` are **REUSE — confirmed canonical, do not touch** (design-tokens §2.1).
Add the following.

### 1.1 Semantic status tokens (NEW — design-tokens §2.2, recs P0-2)

Add after `--color-destructive-foreground`, before `--color-ring`:

```css
  /* Status tokens (P0-2). OKLCH, tuned against --color-background
     (oklch(0.15 0.05 295)). success ≈ green 155°, warning ≈ amber 80°.
     `info` aliases accent — no separate sky. */
  --color-success: oklch(0.78 0.17 155);
  --color-success-foreground: oklch(0.18 0.03 155);
  --color-warning: oklch(0.8 0.16 80);
  --color-warning-foreground: oklch(0.2 0.04 80);
  --color-info: var(--color-accent);
  --color-info-foreground: var(--color-accent-foreground);
```

- `info`/`info-foreground` are **aliases** of `accent` (design-tokens §2.2 note).
  Keeping them as `var()` aliases (not duplicated literals) means `bg-info`,
  `text-info` etc. read as intent in markup while staying a single source. Tailwind
  v4 generates the utilities from the `--color-*` names regardless of the value
  being a literal or a `var()`.
- The success/warning OKLCH values are **open item #2** in design-tokens §5 —
  contrast-check against `--color-background` before locking (acceptance §7). Values
  above are the spec's proposal.

### 1.2 Overlay / scrim token (NEW — design-tokens §2.4)

```css
  /* Modal / upload dimming scrim — background-derived, not a coloured fill.
     Replaces raw #1d133380 / #00000080. */
  --overlay: oklch(from var(--color-background) l c h / 0.5);
```

- Named `--overlay` (not `--color-overlay`) deliberately: it is a *fill string*,
  not a palette colour, so it is **not** meant to mint `bg-overlay`/`text-overlay`
  Tailwind utilities. Consume it as `bg-[var(--overlay)]` at the scrim call-sites.
- Alpha 50% is **open item #4** (design-tokens §5) — confirm against the
  upload/dialog scrims before locking.
- Uses the `oklch(from … )` relative-colour syntax. Browser support is current
  (Tailwind v4 baseline already assumes it); if a target browser misses it, fall
  back to an explicit `oklch(0.15 0.05 295 / 0.5)`.

### 1.3 Radius scale (NEW — design-tokens §3, recs P1-6)

`--radius` exists (10px). Add the three siblings so the scale is named end-to-end:

```css
  --radius-sm: 0.375rem;  /* 6px  — chips, checkboxes, small/segmented cells (board r:5/6/7) */
  /* --radius (md) 0.625rem 10px is the existing default — cards/inputs/buttons (board r:8 / $radius) */
  --radius-lg: 0.875rem;  /* 14px — larger containers / avatar wraps (board r:16/20) */
  --radius-full: 9999px;  /* pills, switches, icon circles, avatars (board r:999) */
```

- Keep `--radius` as the canonical **md** step (do **not** rename it to
  `--radius-md`; `rounded-[var(--radius)]` already references it and Tailwind's
  `rounded-md` should map to it — see §3 group H for the utility-mapping decision).
- `r:3` (progress-track bar) stays **inline bespoke** — not tokenized
  (design-tokens §3 rules).

### 1.4 Font tokens (NEW — design-tokens §1.3, recs P1-6)

```css
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-jetbrains-mono), ui-monospace, SFMono-Regular,
               Menlo, Monaco, Consolas, monospace;
```

- `--font-inter` / `--font-jetbrains-mono` are produced by `next/font` in
  `layout.tsx` (§2). Until §2 lands, these CSS vars are undefined and the stacks
  fall through to the existing system fallbacks — so §1 and §2 can land in either
  order without a broken intermediate state, but ship them together.
- Tailwind v4 maps `--font-sans` → `font-sans` and `--font-mono` → `font-mono`
  utilities automatically. The ~8 existing `font-mono` call-sites (landing tagline,
  family-tree via-line, invite slug, recorder caption, etc.) **immediately** pick up
  JetBrains Mono with no per-site change — that is the whole point of the token.

### 1.5 Named `--text-*` size steps (NEW — design-tokens §1.1, §1.3 step 3)

Register the canonical scale so sizes are named, not inline `text-[10px]`. Tailwind
v4 reads `--text-*` as font-size utilities; the optional `--text-*--line-height` /
`--text-*--letter-spacing` companions set the paired metrics.

```css
  /* Type scale (design-tokens §1.1). Inter unless noted JetBrains Mono. */
  --text-brand-glyph: clamp(7rem, 30vw, 14rem);
  --text-brand-glyph--line-height: 0.9;
  --text-brand-glyph--letter-spacing: -0.05em;

  --text-display: 2rem;        /* 32 / 700 / lh 1.1 */
  --text-display--line-height: 1.1;
  --text-title: 1.625rem;      /* 26 / 700 / lh 1.2  — page title (snaps 25→26) */
  --text-title--line-height: 1.2;
  --text-title-wizard: 1.5rem; /* 24 — IntroInterstitial only */
  --text-title-compact: 1.375rem; /* 22 — overlays / Notifications / complete */
  --text-section: 1.25rem;     /* 20 / 700 / lh 1.3 */
  --text-section--line-height: 1.3;
  --text-subtitle: 1rem;       /* 16 / 700 / lh 1.3 — DEFAULT card/subtitle */
  --text-subtitle--line-height: 1.3;
  --text-subtitle-hero: 1.125rem;  /* 18 — hero card header only */
  --text-subtitle-dense: 0.9375rem;/* 15 — dense list rows / CaptainLock */
  --text-body: 0.875rem;       /* 14 / 400 / lh 1.45 — DEFAULT body */
  --text-body--line-height: 1.45;
  --text-body-long: 0.9375rem; /* 15 — long-read exceptions only */
  --text-label: 0.8125rem;     /* 13 / 600-700 / lh 1.4 */
  --text-label--line-height: 1.4;
  --text-caption: 0.75rem;     /* 12 / 400-500 / lh 1.4 */
  --text-caption--line-height: 1.4;
  --text-micro: 0.6875rem;     /* 11 / 600-700 / lh 1.2 — pills */
  --text-micro--line-height: 1.2;
  --text-micro-xs: 0.625rem;   /* 10 — "New" pill / annotations */

  /* Mono families (JetBrains Mono via font-mono). */
  --text-brand-label: 0.6875rem; /* 10-11 / 500 / uppercase / wide tracking */
  --text-eyebrow: 0.6875rem;     /* 11 / 700 / uppercase / 2px tracking / $accent */
  --text-eyebrow--letter-spacing: 0.125em; /* ≈2px @11px */
  --text-mono: 0.8125rem;        /* 13-16 / 500-700 / lh 1.5 — data rows */
  --text-mono--line-height: 1.5;
  --text-mono-caption: 0.75rem;  /* 9-12 / 500-600 / lh 1.4 */
  --text-mono-caption--line-height: 1.4;
```

- Weight, case, and tracking that vary *within* a role (e.g. eyebrow tracking,
  pill weight) stay as separate utilities (`font-bold`, `uppercase`,
  `tracking-[…]`) — the token fixes the **size + paired line-height** only. The
  size token is the contract; the §1.1 table's weight/case columns are applied per
  call-site or baked into the component (see `components/` impl docs).
- This is the **canonical set** — design-tokens §1.1 closes with "do not add ad-hoc
  px sizes outside this scale". Group G of the codemod (§3) snaps the two strays
  (17→16, 25→26) and migrates inline `text-[Npx]` onto these names.

### 1.6 Glyph face (EXTEND — design-tokens §1.3 step 4, §4 #27)

`landing-hero.tsx`'s `Glitch404` inline `<style>` hardcodes
`font-family: ui-monospace, SFMono-Regular, …` on `.camp404-glitch-*`. Switch to
`font-family: var(--font-mono)` so the brand glyph uses JetBrains Mono. This is
**open item #1** (design-tokens §5 / §4 #27): default to JetBrains Mono unless the
system-mono fallback is confirmed a deliberate decorative choice (01-landing open
question). Plan target = JetBrains Mono. `og-image.tsx` `Glitch404` is a separate
OG-render path — out of scope unless it must match (track in `app/` impl).

---

## 2. `next/font` wiring (NEW — design-tokens §1.3 steps 1, recs P1-6)

File: `apps/web/app/layout.tsx`. No font is loaded today. Add `next/font/google`
for both faces, expose them as CSS vars, and attach to `<html>`.

```tsx
import { Inter, JetBrains_Mono } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});
```

Then on the existing `<html>` (which already has `lang` + `suppressHydrationWarning`):

```tsx
<html
  lang="en"
  suppressHydrationWarning
  className={`${inter.variable} ${jetbrainsMono.variable}`}
>
  <body className="font-sans">
    …
```

- The `.variable` class only *defines* the CSS var; `body className="font-sans"`
  (which resolves to `--font-sans` → Inter from §1.4) makes Inter the default UI
  face app-wide. Today `body` gets no font-family, so this is the first time the UI
  face is actually set — verify it matches the intended look (acceptance §7).
- Subsets: `latin` only (no Cyrillic/Greek users). If the wordmark needs the full
  JetBrains weight range, the default `next/font` axis is fine — no `weight` pin
  needed (variable fonts).
- This replaces the implicit reliance on the OS default sans. The two
  system-mono fallbacks that remain hardcoded (`landing-hero` glyph §1.6,
  `global-error.tsx` inline sans) are intentional: `global-error` renders **outside**
  the React tree / before fonts load, so it must keep a literal system stack —
  **REUSE, leave it**.

Order with §1: ship §1.4 (token) + §2 (wiring) **together**. If §1.4 lands first,
`font-mono`/`font-sans` resolve to fallbacks (harmless); if §2 lands first, the
vars exist but nothing reads them until §1.4. No broken intermediate either way.

---

## 3. Codemod plan — the 29 §4 reconciliations

Grouped by mechanism, not by spec number, so each group is one mechanical pass.
Spec numbers (design-tokens §4 #1–#29) are cited per group. **Order: A→H**, because
the colour/tint groups depend on the §1 tokens existing, and the radius/spelling
passes are independent cleanups that ride along last.

> Note on scale: groups A/B touch the **5 known files** below. Groups C–E are
> **component-build rules** (the tints live on the boards, not in shipped code yet)
> — they are the spec the `components/` impl docs build to, captured here so the
> token→tint mapping has one home. Groups F/G/H are repo-wide mechanical cleanups.

The 5 status-colour files (groups A/B):
- `apps/web/app/captains/camp-management/camp-management-roster.tsx` (densest — 17 hits)
- `apps/web/app/family-tree/family-tree.tsx`
- `apps/web/app/captains/announcements/announcements-manager.tsx`
- `apps/web/app/pending-approval/page.tsx`
- `apps/web/app/tools/invite/invite-form.tsx`

### Group A — Tailwind status palette → semantic tokens (§4 #1, #13–#18) · 5 files, 24 utilities

Mechanical class swaps once §1.1 tokens exist:

| Live class | → | Spec |
|---|---|---|
| `emerald-400` / `emerald-500/15` / `emerald-600` / `emerald-600/90` | `text-success` / `bg-success/15` / `text-success` / `bg-success/90` | #13, #16 |
| `amber-300` / `amber-400` / `amber-500/15` | `text-warning` / `text-warning` / `bg-warning/15` | #14, #15 |
| `amber-400/60` (family-tree match border) | `border-accent/60` (**no amber on the tree** — §4 #2) | #2 |
| `amber-500/15` + `amber-300` (family-tree captain pill) | `bg-accent/15` + `text-accent` (**captain = accent**, §4 #1) | #1 |
| `sky-400` / `sky-500/15` / `sky-500/20` | `text-info` / `bg-info/15` / `bg-info/20` (= accent) | #16, roster |
| `rose-400` / `rose-500/15` | `text-destructive` / `bg-destructive/15` | #16 roster |

Watch-outs (do **not** blind-swap):
- family-tree's amber is two different intents — the **match-highlight border**
  (#2) and the **captain pill** (#1) **both** go to `accent`, but the rest of any
  amber elsewhere that means "pending" goes to `warning`. Read each site.
- Roster `INCOMPLETE` numeral (#15): mobile draws `accent`, terminal draws
  `primary`; **normalise both to `warning`** ("needs action"). This is a *colour
  change*, not a like-for-like swap — confirm against the roster surface brief.
- Roster status-rail (#16): map by meaning — onboarding/active=`accent`,
  approved/ready=`success`, rejected/blocked=`destructive`.

### Group B — raw scrim/overlay hex → tokens (§4 #19) · ~2 sites

`#1d133380` (avatar-upload empty circle), `#00000080` (uploading overlay, dialog
scrims) → `bg-[var(--overlay)]` (§1.2). Live code has only the brand `#0d061e`
(theme-color meta — keep) and a few `global-error` literals (keep, §2). The bulk of
8-digit scrim hex is **board-only**; the overlay rule applies when those surfaces
are (re)built — captured for the `components/` dialog + `app/` upload docs.

### Group C — magenta/secondary tints → `primary`/`secondary` at alpha (§4 #3–#6) — component-build rules

Resolves the **RankPill vs `$secondary` vs `primary`** clash. Build to:

| Board tint | Means | → token-at-alpha |
|---|---|---|
| `#75188840` / `#7518881f` | captain-rank pill (Captain/Team Member) | `bg-secondary/25` + `text-secondary-foreground` (#3) |
| `#ff008c2e` | generic magenta icon badge / primary pill / Acknowledge / voice ring | `bg-primary/18` + `text-primary` (#4) |
| `#ff008c26` | magenta icon circles | `bg-primary/15` + `text-primary` (#4) |
| `#ff008c14` | wizard RadioCard / CheckboxChip checked / unread row | `bg-primary/8` + `border-primary` (#5) |
| `#ff008c1a` | unread row / select chosen-row (questionnaire) | `bg-primary/12` + `border-primary` (#5, #6) |
| `#ff008c22` | country-combobox selected | `bg-primary/12` + `border-primary` (#5) |

Rule of thumb: **generic** magenta badges/pills = `primary`; **captain-rank** pills
= `secondary`. That is the whole RankPill resolution.

### Group D — accent/info tints → `accent` at alpha (§4 #7–#11) — component-build rules

| Board tint | Means | → |
|---|---|---|
| `#00dcff26` | Accent badge / mcp scope wrap / notifications inbox / family-tree captain | `bg-accent/15` + `text-accent` (#7) |
| `#00dcff1a` | Heads-up / info alert (stroke accent) | `bg-accent/12` + `border-accent` (= info) (#8) |
| `#00dcff08` | invite-gate scanline | `bg-accent/8` (#9) |
| `#00dcff1f` | announcements "Draft saved." success banner | **`bg-success/12` + `text-success` + check icon** — affirmative-write rule, NOT accent (#10, §2.2) |
| `#00dcff24` / `#00dcff1f` | questionnaire-complete check badge | `bg-accent/15` (info) — **deliberately stays accent**, not success (#11) |

The #10 vs #11 split is the one judgement call: write-confirmation banners go
`success`; the questionnaire end-state badge stays `accent`/info per the brief.

### Group E — destructive tints + roster wash/zebra + avatar tints (§4 #12, #17, #18) — component-build rules

- `#f83e5a1f`/`1a`/`14`/`22`/`24`/`26` (error pills/banners) → `bg-destructive/12`;
  `#f83e5a2e` (deliberately stronger save-failed banner) → `bg-destructive/18`;
  always `border-destructive`. (#12)
- `#00dcff14` selected-row wash → `bg-accent/8`; `#ffffff07`/`08` zebra →
  `bg-foreground/3`. Token-at-alpha, no raw hex. (#17)
- **Avatar tints** (#18): generate from a fixed token-derived set — rotate
  `primary`/`accent`/`secondary`/`success`/`warning` at ~20% alpha, mono initials on
  top. Define the rotation in the avatar component, not arbitrary hex. This is
  **open item #3** (design-tokens §5) — confirm the hue set. Spec the helper in the
  `components/` avatar doc.

### Group F — token-spelling: verbose → short form (§4 #22, recs P1-5) · 115 (apps/web) + 50 (packages/ui)

Codemod `*-[color:var(--color-NAME)]` → the short utility, repo-wide:

| Verbose | → short |
|---|---|
| `text-[color:var(--color-foreground)]` | `text-foreground` |
| `bg-[color:var(--color-background)]` | `bg-background` |
| `border-[color:var(--color-border)]` | `border-border` (or bare `border` where appropriate) |
| `ring-[color:var(--color-ring)]` | `ring-ring` / `ring-[…]` per site |

- Regex: `\b(text|bg|border|ring|fill|stroke|from|to|via)-\[color:var\(--color-([a-z-]+)\)\]`
  → `$1-$2`. Run it, then `pnpm build`/lint to catch any utility name Tailwind
  doesn't actually generate (rare — most map 1:1).
- `@camp404/ui` already favours short form; the 50 verbose hits there are stragglers
  — same codemod, same pass.
- `globals.css` `@layer base` itself uses the verbose `@apply
  bg-[color:var(--color-background)]` / `border-[color:var(--color-border)]` — leave
  those (or simplify to `bg-background`/`border-border`) as a tidy-up; not required.
- **Cheapest consistency win** (recs P1-5) — do it as one commit so review is a
  pure diff of equivalent classes.

### Group G — type-size strays + named sizes (§4 #23, #24, #25, #26; §1.5) · small

- Snap **roster mobile H1 25→26**, **questionnaire-runner `TitleRow` 17→16**
  (design-tokens §1.2 / §4 #23). No 17px or 25px survives.
- Inline `text-[10px]` (×10) / `text-[11px]` (×3) → named steps (`text-micro-xs` /
  `text-micro`/`text-brand-label`) per role.
- Mono motif (#24): the ~8 `font-mono` call-sites already resolve to JetBrains Mono
  once §1.4+§2 land — **no per-site change needed**, that is the token win. The only
  manual moves: ensure the **eyebrows** (#25) carry the full mono-eyebrow role
  (JetBrains Mono / 11 / 700 / uppercase / 2px / `text-accent`) — normalise the
  questionnaire-complete "SECTION B" eyebrow off Inter onto this role; and the
  **error trace chip** in `apps/web/app/page.tsx` (#26) → `font-mono` +
  `text-mono`.

### Group H — radius hardcodes → tokens (§4 #28, design-tokens §3) · `packages/ui` (29) + `apps/web` (46)

Two-part decision, then a mechanical pass:

1. **Map Tailwind's named radii to the scale via `@theme`** so existing
   `rounded-sm/md/lg/full` resolve to the token values without touching every
   call-site. Tailwind v4 reads `--radius-sm/md/lg/full`; set `--radius-md:
   var(--radius)` (alias to the existing 10px) so `rounded-md` == default. With that
   mapping, the bulk of `rounded-md`/`rounded-full`/`rounded-sm` are **already
   correct by meaning** and need no edit.
2. **Reclassify the strays** by intent, not by current class:
   - `rounded-lg` (1 in ui, 10 in apps) and `rounded-xl` (1+1): each is either a
     "larger container/avatar wrap" (→ keep `rounded-lg` = 14px token) or a default
     container drawn too round (→ `rounded-md`). Read each — boards only sanction
     `lg` for r:16/20 containers.
   - All pills / switches / circles must be `rounded-full` (audit they aren't
     `rounded-md`).
   - `rounded-[var(--radius)]` (control grid) → `rounded-md` for consistency (same
     value, named).
   - `r:3` progress track stays inline bespoke — not tokenized.

Net: most of the 75 `rounded-*` need **no diff** once the `@theme` mapping lands;
the manual work is the ~13 `rounded-lg`/`rounded-xl` intent calls.

---

## 4. Dead `dark:*` variant strip (§4 #21, recs P2-8) — VERIFY-then-DELETE

design-tokens §4 #21 / recs P2-8 instruct stripping `dark:text-{emerald,sky,rose,
amber}-*`. **Verified: the live tree has zero `dark:` status variants** (grep over
`apps/web` returns nothing) — they appear to already be gone. So this group is:

1. **Confirm** with a final grep at build time:
   `grep -rE "dark:(text|bg|border)-(emerald|amber|sky|rose|[0-9a-z-]+)" apps/web packages/ui --include="*.tsx"`
   — expect **no matches**.
2. If any survive, fold their intent into the §1.1 status tokens (group A) and
   delete the `dark:` twin. There is **no `@custom-variant dark`** in `globals.css`,
   so any `dark:` only fires via `prefers-color-scheme` in an already-dark UI —
   pure dead weight (recs P2-8 rationale).
3. Do **not** add a class-based dark variant (recs P2-8 "only if you ever want two
   themes" — not this redesign; app is dark-only per `brief.md`).

Classification: **DELETE** (likely already done — net-zero, but the acceptance gate
must assert it).

---

## 5. Build order

1. **§1.1–§1.4 tokens + §2 font wiring** — one commit (status/overlay/radius/font
   tokens in `globals.css` + `layout.tsx` `next/font`). Self-contained; nothing
   breaks if size steps (§1.5) lag. **This unblocks every downstream impl doc.**
2. **§1.5 named `--text-*` steps** — same or immediately-following commit; needed by
   group G and by `components/` type usage.
3. **§1.6 glyph face** — flip `Glitch404` to `var(--font-mono)` (gated on open
   item #1 confirmation).
4. **Group F (token-spelling)** — independent repo-wide codemod, lands anytime after
   step 1; do it early to clean the diff surface before component work.
5. **Group A + B** — the 5 status files onto the new tokens. Needs step 1.
6. **Group H (radius `@theme` mapping + stray reclass)** — needs step 1.
7. **Group G (type strays)** — needs step 2.
8. **Group C/D/E** — fold into the `components/` impl docs (these are build-to specs
   for not-yet-built surfaces, not edits to shipped files); land as those components
   are (re)built.
9. **§4 dark-strip verify** — final gate, expect no-op.

Steps 1–2 are the hard dependency for the whole redesign. Steps 4–7 are
parallelisable cleanups. Step 8 rides the component PRs.

---

## 6. Risks / watch-outs

- **`oklch(from …)` relative colour** (`--overlay`) — confirm the Tailwind v4 /
  target-browser baseline; fall back to explicit OKLCH if needed (§1.2).
- **`info` aliasing `accent`** — if a future design wants info ≠ accent, the alias
  becomes a literal; harmless now, flagged.
- **Group A is not pure find-replace** — INCOMPLETE numeral (#15), status-rail
  (#16), and the two family-tree ambers (#1/#2) are *intent* remaps. Each needs a
  human read against the surface brief.
- **`#10 vs #11`** (Draft-saved success vs complete-badge accent) — easy to over-
  normalise; the questionnaire-complete badge must stay `accent`.
- **Spec count vs reality** — do not chase "600+"; the live code is ~24 status
  utilities + 165 verbose-spelling + 75 radius. The board hex is the build-to spec
  for new components, not strings in shipped files.

---

## 7. Acceptance

**Visual (manual, dark-only):**
- App renders in Inter (UI) and JetBrains Mono (mono motif) — no system-default
  sans/mono anywhere except `global-error` (intentional) and `Glitch404` until §1.6.
- `success` (green) / `warning` (amber) / `info`(=accent) read correctly and pass
  legibility against `--color-background` (locks open item #2). Status surfaces
  (roster pills/rail, pending-approval clock, announcements banners, family-tree
  captain) match the surface briefs.
- Radius reads consistently: cards/inputs/buttons = md, pills/switches/circles =
  full, large wraps = lg. No stray over-round containers.
- Modal/upload scrims use `--overlay`, no raw black flashes.

**Lint / static (CI gates):**
- `pnpm build` (web + ui) green — catches any short-utility that Tailwind doesn't
  generate after group F.
- `grep -rE "(emerald|amber|sky|rose)-[0-9]" apps/web packages/ui --include="*.tsx"`
  → **0 matches** (group A complete).
- `grep -rE "dark:(text|bg|border)-" apps/web packages/ui --include="*.tsx"`
  → **0 matches** (§4 strip).
- `grep -rE "\[color:var\(--color-" apps/web packages/ui --include="*.tsx"`
  → **0 matches** (group F complete; allow `globals.css` `@apply` if not tidied).
- `grep -rE "#[0-9a-fA-F]{6,8}" apps/web packages/ui --include="*.tsx"` → only the
  **sanctioned exceptions**: Google brand `#4285F4` (§4 #20), `themeColor`
  `#0d061e` meta, and `global-error.tsx` literals. No brand/status/scrim tint hex.
- `grep -rE "text-\[[0-9]+(px|rem)\]" apps/web packages/ui --include="*.tsx"`
  → **0 matches** (group G migrated to named `--text-*` steps).
- No `rounded-xl`/stray `rounded-lg` outside sanctioned r:16/20 container sites
  (group H reclass complete); `r:3` progress track is the only inline radius.
