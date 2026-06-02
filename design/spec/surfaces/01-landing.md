# Landing — functional brief

- **Route(s):** `/` (unauth branch only)
- **Canonical board(s):** `S01 Landing` (board #10, 430×980px, `design/.spec-extract/boards/10-s01-landing.txt`)
- **Superseded / dropped:** none — this is the only landing board; no iterations exist
- **Breakpoints:** mobile-first 430px (board canonical size); responsive widths `max-w-md` → `sm:max-w-xl` applied in live code; CTA block constrained to `max-w-xs`

---

## Purpose

The only screen an unauthenticated visitor can see. A purely presentational, server-rendered splash that expresses the camp's "404 — camp not found" terminal/glitch identity. Carries exactly one functional affordance: a CTA button that navigates to sign-in. Touches no database, no form, no server action.

---

## Layout & modules

The surface is a single non-scrolling full-viewport column (`min-h-[100dvh]`). Three decoration layers sit at `z-0`; the content column sits at `z-10` above them.

### Decoration overlays (aria-hidden, pointer-events-none, absolute inset-0)

| Layer | Class | Effect |
|---|---|---|
| Scanlines | `camp404-scanlines` | Repeating 3px horizontal scan-line gradient, full bleed |
| Noise | `camp404-noise` | Dual radial-dot noise at `opacity-[0.06]`, `mix-blend-mode: overlay` |
| Scanbeam | `camp404-scanbeam` | Vertical magenta-violet gradient band, animates top → bottom 7s linear infinite |

All three are purely decorative. They must remain `aria-hidden` and must not receive pointer events.

### Hero column (content, `z-10`)

The content column uses `flex-col items-center justify-between` with `gap-10`, distributing three vertical segments across the viewport height.

**Top: wordmark + tagline block**

- `<h1>`: text `Camp 404`, `JetBrains Mono / 10px / 500 / $muted-foreground`, uppercase, `tracking-[0.5em]`. This is the page's accessible heading.
- `<p>`: text `Error 404 — Camp not found`, `JetBrains Mono / 11px / 500 / $foreground`, uppercase, `tracking-[0.3em]`, chromatic-aberration text-shadow (`rgba(255,0,128,0.8)` left / `rgba(0,200,255,0.8)` right — class `camp404-chromatic`).

**Middle: Glitch404 glyph**

A five-layer stacked glyph, entirely `aria-hidden`. All layers share the same sizing: `font-family: monospace stack`, `font-weight: 900`, `font-size: clamp(7rem, 30vw, 14rem)`, `letter-spacing: -0.05em`, `line-height: 0.9`, `text-align: center`.

| Layer | Class | Colour | Blend | Animation |
|---|---|---|---|---|
| Base | `camp404-glitch-base` | `var(--color-foreground)` | — | parent shakes via `camp404-shake 5s steps(1)` |
| Magenta RGB | `camp404-glitch-rgb-magenta` | `rgba(255,0,140,0.85)` | `screen` | `camp404-rgb-magenta 3.7s steps(1)` |
| Cyan RGB | `camp404-glitch-rgb-cyan` | `rgba(0,220,255,0.85)` | `screen` | `camp404-rgb-cyan 3.7s steps(1)` |
| Tear A | `camp404-glitch-tear-a` | `var(--color-foreground)` | `screen` | `camp404-tear-a 4.3s steps(1)` (clip-path horizontal slices) |
| Tear B | `camp404-glitch-tear-b` | `var(--color-foreground)` | `screen` | `camp404-tear-b 5.1s steps(1)` (clip-path horizontal slices) |

The outer wrapper has `camp404-glitch-shake`; the four non-base layers are absolutely positioned `inset-0` over the base.

**Bottom: CTA + terminal cursor**

- `Button` (`variant="default"`, `size="lg"`, `asChild`, `w-full`) wrapping `<a href="/auth/sign-in">Are you lost?</a>`. This is the sole interactive element.
- `<p aria-hidden>`: text `$ awaiting input_`, class `camp404-cursor` (blinks at 1.05s steps — `opacity: 1` → `opacity: 0.35`), `JetBrains Mono / 10px / 500 / $muted-foreground`.

### Bespoke CSS block

All `camp404-*` classes are defined in a self-contained inline `<style>` injected by `LandingHero` (`landing-hero.tsx`). They are defined nowhere else in the codebase. This is intentional — keeps the global design-system tokens uncontaminated by surface-specific glitch art. The block must travel with the component.

---

## Components used

| Component | Role | Key props/variants used |
|---|---|---|
| `Button` (`packages/ui/src/components/button.tsx`) | Primary CTA | `variant="default"`, `size="lg"`, `asChild=true` → renders as `<a>` |
| `Glitch404` (local, not exported) | Five-layer animated glyph | no external props; self-contained |
| `glitchStyles` (local string const) | Inline `<style>` block of all `camp404-*` CSS | injected via `<style>{glitchStyles}</style>` |

No other shared components (`TopChrome`, `SectionHeader`, `DetailHeader`, `GridTile`, `InputField`, `Card`, `EmptyState`, `CaptainLock`) are used here.

**New components introduced by this surface:**

- `LandingHero` (exported server component, `apps/web/app/landing-hero.tsx`) — the entire surface.
- `Glitch404` (local, unexported sub-component within `landing-hero.tsx`).

---

## States

This surface is deliberately state-poor. It has one meaningful runtime presentation.

| State | Description |
|---|---|
| **Populated (only state)** | Static splash, always identical. Animations run continuously via CSS keyframes. No data is fetched; nothing varies. |
| **Loading** | None on-surface. The upstream `/` route is `force-dynamic`; `getAuthenticatedUser()` resolves server-side before the hero is selected. No client skeleton or spinner. |
| **Empty** | Not applicable — no data-driven content. |
| **Validation error** | Not applicable — no form, no inputs. |
| **Submitting / Pending** | Not applicable — the CTA is a plain anchor; there is no form submission. |
| **Success** | Not applicable. |
| **Disabled** | Not applicable. The Button primitive supports `disabled:opacity-50` but the CTA is never rendered disabled here. |
| **Invite-gated** | Does not apply on this surface. The invite gate runs only after authentication. |
| **Onboarding-incomplete** | Does not apply. Runs only in the authed branch. |
| **Pending / Rejected approval** | Does not apply. Runs only in the authed branch. |
| **Captain-locked (preview-but-locked)** | Does not apply. No rank gating on an unauth surface. |
| **Authenticated bypass** | When `getAuthenticatedUser()` returns a truthy user, the hero is NOT rendered. Control passes to the authed gating spine (units 06/24). The hero is, in effect, the pre-auth state preceding the entire gate hierarchy. |
| **E2E test-mode bypass** | In `E2E_TEST_MODE=1`, a valid `camp404_test_user` cookie makes `getAuthenticatedUser()` return a truthy user, suppressing the hero. A malformed/absent test cookie falls through to Neon Auth and can still yield the hero. |

---

## User actions

| Action | Result |
|---|---|
| Tap / click "Are you lost?" | Browser navigates to `/auth/sign-in` via a plain anchor (`href="/auth/sign-in"`). No JS required; works without client-side hydration. |
| (No other interactions.) | All animation is pure CSS. No inputs, toggles, scroll behaviour, hover logic, or client state. |

---

## Data & enums

**No data model is touched by this surface.**

The only "data" involved is the session check in the selecting `page.tsx`:

- `getAuthenticatedUser()` returns `AuthenticatedUser | null` — an in-memory interface `{ id: string; primaryEmail: string | null; displayName: string | null }` sourced from Neon Auth's session or the E2E test cookie. No table is read or written.
- Relevant env vars: `E2E_TEST_MODE` (string `"1"` to enable), `TEST_USER_COOKIE = "camp404_test_user"` (cookie name).

**No fields from `schema.ts`, no enums, no questionnaire items.**

Nothing is NEW schema — this surface adds zero tables, columns, or enums.

---

## Validation & edge cases

- **Auth-presence rule:** render the hero iff `getAuthenticatedUser()` returns `null`. Authenticated users never see it. There is no redirect — the hero is rendered in-place at `/`.
- **Forced dynamic rendering:** `/` carries `export const dynamic = "force-dynamic"` to prevent Next.js static prerender from stranding the session cookie read. This is a build-correctness rule, not user-visible.
- **CTA robustness:** the CTA is a server-rendered `<a>` via `Button asChild`; it has no loading/disabled/error state and cannot fail to render. Works without JavaScript.
- **Accessibility invariant:** every decorative element MUST remain `aria-hidden` — the three CRT overlays, the entire `Glitch404` stack, and the cursor line. Screen-reader-exposed content is only: the `<h1>` "Camp 404", the tagline `<p>`, and the CTA link. Any restyle MUST preserve these roles.
- **No `prefers-reduced-motion` guard:** all CSS keyframe animations run unconditionally. There is no motion-reduction fallback in the current implementation. The CTA remains usable regardless; the omission is a known gap (see Open questions).
- **Token discipline:** `background`, `foreground`, `muted-foreground`, and `primary` (via Button) use the shared OKLCH `@theme` tokens. All glitch hues — magenta, cyan, scanbeam violet — are hard-coded RGBA literals in the inline `<style>`. This is intentional art direction; they should not be tokenised into the global palette.
- **E2E cookie parsing:** `readTestUserCookie` does `JSON.parse(decodeURIComponent(raw))`, rejects if `parsed.id` is not a non-empty string, and swallows parse errors. A malformed test cookie yields `null` and falls through to Neon Auth, which may still yield the hero.

---

## Flows

```
[user navigates to /]
  → page.tsx: getAuthenticatedUser()
      → null → render LandingHero          (this surface)
      → truthy → gating spine (units 06/24) (out of scope)

[on LandingHero]
  → user taps "Are you lost?"
      → navigate to /auth/sign-in (S02 Auth surface)
```

No other exit from this surface exists.

---

## Divergences from feature-set reference

| Feature-set signal | Board / live code | Resolution |
|---|---|---|
| Reference (`01-landing.md`) describes `LandingHero` as the unauth gate and describes `page.tsx` gating spine | Board S01 shows only the hero layout — no mention of gating spine | No conflict: the gating spine (authed branch) belongs to units 06/24; this surface is scoped to the unauth branch only. No change needed. |
| Reference notes `apps/web/app/landing-hero.tsx` ships its own inline `<style>` block as intentional | Board outline lists no explicit CSS details | Live code is the ground truth; inline `<style>` is confirmed intentional per code comment. Retained as-is. |
| Board shows `T "CAMP 404" [JetBrains Mono/10px/500/$muted-foreground]` using the heading copy cased as "CAMP 404" | Live `<h1>` uses "Camp 404" (title case) with CSS `uppercase` | CSS `uppercase` renders identically to the board. No change. |
| Board shows `T "404" [JetBrains Mono/150px/800/$foreground]` — a single text element at 150px | Live code implements five stacked span layers with `clamp(7rem, 30vw, 14rem)` (max ~224px) and is `aria-hidden` | The board is a static Pencil approximation; the live multi-layer glitch implementation is richer and correct. The board's 150px is a design proxy, not a binding size. Retain live implementation. |
| Board shows `T "$ AWAITING INPUT_" [JetBrains Mono/10px/500/$muted-foreground]` with a static string | Live code renders the cursor text with a CSS blink animation | Animation is a deliberate enhancement; board is static. Retain animation. |
| Reference mentions `apps/web/lib/test-mode.ts` E2E bypass | Board has no mention of test mode | Functional behaviour only; not a visual divergence. Document in spec (done above). |

No features implied by either the board or the reference contract have been dropped.

---

## Open questions / build reconciliations

1. **`prefers-reduced-motion`:** No motion-reduction media query exists anywhere in `glitchStyles`. All keyframe animations run unconditionally. Is this a deliberate art decision (the glitch IS the brand) or an accessibility oversight? If the latter, a reduced-motion variant should hide the shake/tear/RGB-split animations while preserving the CTA and static glyph.

2. **JetBrains Mono vs system monospace in glyph layers:** The `<h1>`, tagline, and cursor all reference `font-mono` (Tailwind, which maps to `JetBrains Mono` if the font is loaded globally). The Glitch404 glyph uses the CSS `font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` stack (hard-coded in `glitchStyles`) rather than the JetBrains Mono brand face. Confirm whether the glyph should use JetBrains Mono or whether the system-monospace fallback stack is intentional for the oversized decorative art.

3. **CTA label copy lock:** "Are you lost?" is the confirmed board-canonical label. If marketing wants to vary this (seasonal, event-specific) there is currently no mechanism short of a code change. Flag to product if copy-changeability is needed.

4. **Glitch colour tokenisation:** Hard-coded `rgba` values for magenta/cyan/scanbeam violet diverge from the OKLCH `@theme`. If the palette ever shifts, these will not update automatically. Acceptable today as intentional art; document as a known maintenance caveat rather than a bug.
