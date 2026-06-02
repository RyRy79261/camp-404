# LandingHero — organism plan

- **mapsTo:** REUSE (keep as-is, minor restyle only — no PROMOTE, no NEW). The
  component-library entry is explicit: *"keep `apps/web/app/landing-hero.tsx`
  (server) + local `Glitch404`."*
- **Home:** **app-local — `apps/web`**, NOT `packages/ui`. It is a surface-scoped
  server organism with a self-contained inline `<style>` block of bespoke
  `camp404-*` glitch CSS that is *intentionally not tokenised*; promoting it to
  `@camp404/ui` would either contaminate the shared design-system tokens or strand
  the bespoke art. It stays where the only consumer lives.
- **Target file:** `apps/web/app/landing-hero.tsx` (existing; one file holds the
  exported `LandingHero` server component, the local un-exported `Glitch404`
  sub-component, and the `glitchStyles` string const).

---

## Current state — what exists today (the old design's component/route markup)

The component already exists and already matches the spec almost exactly. This is
a **REUSE with a small restyle**, not a rebuild.

- **`apps/web/app/landing-hero.tsx`** (full file, 230 lines) — confirmed read:
  - `LandingHero()` (exported, server component, no `"use client"`) — renders
    `<main className="relative min-h-[100dvh] overflow-hidden …">` with:
    - three `aria-hidden pointer-events-none absolute inset-0 z-0` decoration
      layers: `.camp404-scanlines`, `.camp404-noise` (opacity-[0.06]),
      `.camp404-scanbeam` (`h-24`);
    - a `z-10` content column (`flex-col items-center justify-between gap-10`,
      `max-w-md sm:max-w-xl`, `min-h-[100dvh]`) with: the `<h1>Camp 404</h1>`
      wordmark (10px / tracking-[0.5em] / `$muted-foreground`), the
      `.camp404-chromatic` tagline `<p>Error 404 — Camp not found</p>` (11px /
      tracking-[0.3em] / `$foreground`), the `<Glitch404 />` glyph, and the CTA
      block (`max-w-xs`) holding `<Button asChild size="lg" className="w-full">`
      wrapping `<a href="/auth/sign-in">Are you lost?</a>` plus the
      `.camp404-cursor` `aria-hidden` `$ awaiting input_` line;
    - the inline `<style>{glitchStyles}</style>` at the end of `<main>`.
  - `Glitch404()` (local, un-exported, `aria-hidden`) — the five `<span>404</span>`
    layers: `camp404-glitch-base`, `camp404-glitch-rgb-magenta`,
    `camp404-glitch-rgb-cyan`, `camp404-glitch-tear-a`, `camp404-glitch-tear-b`,
    wrapped in `.camp404-glitch-shake`.
  - `glitchStyles` (string const, lines 77–230) — all `camp404-*` CSS:
    `chromatic`, `scanlines`, `noise`, `scanbeam` (+ `@keyframes`), the five glyph
    layer classes with `font-family: ui-monospace, …, monospace; font-weight:900;
    font-size: clamp(7rem,30vw,14rem)`, the shake / rgb-magenta / rgb-cyan / tear-a
    / tear-b / cursor-blink keyframes. Hard-coded RGBA literals for magenta
    (`rgba(255,0,140,0.85)`), cyan (`rgba(0,220,255,0.85)`), scanbeam violet — all
    intentional art, referencing `var(--color-foreground)` only for the base/tear
    fills.

- **`apps/web/app/page.tsx`** (the host route, NOT part of this component) —
  `export const dynamic = "force-dynamic"` (line 27); `HomePage()` calls
  `getAuthenticatedUser()` (line 30) and `if (!user) return <LandingHero />;`
  (lines 32–34). LandingHero is selected as the G0 held screen and is the **only**
  consumer.

- **Leaf dependency:** `@camp404/ui/components/button` (imported line 1). Confirmed
  `packages/ui/src/components/button.tsx` exists and is the canonical primitive
  ([atom-button.md](atom-button.md)).

**Gaps vs spec.** None that change behaviour or structure. The two carried items
are documentation-grade, surfaced in [surfaces/01-landing.md](../../surfaces/01-landing.md)
§Open questions:
1. **No `prefers-reduced-motion` guard** — every keyframe animation runs
   unconditionally. Flagged as a known accessibility gap (the glitch *is* the
   brand); a reduced-motion variant is the one optional restyle below.
2. **Glyph uses the system monospace stack**, not the JetBrains Mono brand face
   the wordmark/tagline/cursor use (`font-mono`). Intentional-for-decorative-art,
   confirmed; carry as a doc note, do not "fix" silently.

The board↔code divergences (CASE of "CAMP 404", 150px proxy vs five-layer clamp,
static vs animated cursor) are all resolved in favour of the live code per
[surfaces/01-landing.md](../../surfaces/01-landing.md) §Divergences — **drop no
functionality**.

---

## Composition — leaves, core helpers, services, server/client split

### Leaf components it consumes

| Leaf | Plan | Role | Verdict |
|---|---|---|---|
| `Button` | [atom-button.md](atom-button.md) | Sole CTA — `variant="default"` (implicit), `size="lg"`, `asChild` → renders the `<a href="/auth/sign-in">`, `className="w-full"` | REUSE (`@camp404/ui/components/button`) |
| `Glitch404` | *(no leaf plan — local, un-exported, single-use)* | Five-layer `aria-hidden` animated `404` glyph; self-contained, no props | REUSE (lives inside this file) |
| `glitchStyles` | *(no leaf plan — string const)* | Inline `<style>` of all `camp404-*` CSS; injected via `<style>{glitchStyles}</style>` | REUSE (travels with the component) |

No other shared components are used — explicitly **not** `TopChrome`,
`SectionHeader`, `DetailHeader`, `GridTile`, `InputField`, `Card`, `EmptyState`,
`CaptainLock` (per [surfaces/01-landing.md](../../surfaces/01-landing.md)
§Components used). `Glitch404` and `glitchStyles` are deliberately **not** promoted
to `@camp404/ui` and get no separate leaf plan: they are private to this file. The
CRT/scanlines motif is *conceptually* shared with the S22 questionnaire scan
overlay (component-library note) but the two are independent implementations — no
extraction is planned, no shared module is created.

### `@camp404/core` helpers

**None.** LandingHero touches zero pure business logic. The only "logic" near it —
the `getAuthenticatedUser()` null-check that *decides whether to render it* — lives
in the **host** `page.tsx`, not in the component, and that decision is Next-coupled
session glue that stays in `apps/web/lib` (it is not extracted to `core`; see
[service-layer/01-identity-access-gating.md](../service-layer/01-identity-access-gating.md)
§"STAY in `apps/web/lib`"). LandingHero itself imports nothing from `core`.

### Services / server-actions it calls

**None.** No DB read, no DB write, no server action, no route handler, no fetch.
Per [surfaces/01-landing.md](../../surfaces/01-landing.md): *"Touches no database,
no form, no server action."* The single session check
(`getAuthenticatedUser()` from `apps/web/lib/auth.ts`) is performed by `page.tsx`
**before** LandingHero is selected — LandingHero never calls it and receives no
result from it. It is, per
[service-layer/01-identity-access-gating.md](../service-layer/01-identity-access-gating.md)
§Consumers, the **G0 held screen** ("NOT a redirect").

### Server vs `"use client"` split

**100% server component, zero client JS.** `LandingHero` and `Glitch404` are plain
server-rendered functions; there is no `"use client"` directive and none is added.
All motion is pure CSS keyframes from the injected `<style>`; the CTA is a
server-rendered `<a>` (via `Button asChild`) that navigates without hydration. This
preserves the spec invariant that the surface *"works without JavaScript / without
client-side hydration."* `Button` is a client-capable primitive but renders fine
server-side here because no interactive props (onClick, state) are passed —
`asChild` simply forwards to the anchor.

---

## API & data flow

- **Props:** **none.** `LandingHero()` takes no arguments; `Glitch404()` takes no
  arguments. (component-library: *"Props: (none)"*.)
- **Fetches:** nothing. **Receives:** nothing.
- **State flow:** none — the component is referentially identical on every render.
  All variability the surface ever expresses ("rendered" vs "not rendered") is
  owned by the host `page.tsx`'s auth branch, external to the component.
- **Forms / actions / validation:** **N/A** — no form, no inputs, no `<form>`, no
  server action, no Zod schema. The CTA is a plain anchor, not a submit.
- **Inline `<style>` contract:** `glitchStyles` MUST ship inline within the
  component output (not lifted to `globals.css` / `@camp404/ui/styles.css`) — this
  is the documented mechanism that keeps the global token palette uncontaminated by
  surface-specific glitch art. The block travels with the component.
- **Token discipline:** `background` / `foreground` / `muted-foreground` / `primary`
  (via Button) use the shared OKLCH `@theme` tokens; all glitch hues
  (magenta / cyan / scanbeam violet) are intentional hard-coded RGBA literals and
  are **not** to be tokenised (carry as a known maintenance caveat, not a bug).

---

## States

LandingHero is deliberately state-poor. There is exactly **one** rendered
presentation; every other "state" in the global matrix resolves to N/A because the
surface is unauthenticated and data-free.

| State | LandingHero behaviour |
|---|---|
| **Populated (the only state)** | Static splash, byte-identical every render. CSS keyframes animate continuously. No data, nothing varies. |
| **Loading** | None on-surface. The host `/` route is `force-dynamic`; `getAuthenticatedUser()` resolves server-side *before* the hero is selected. No skeleton, no spinner. |
| **Empty** | N/A — no data-driven content. |
| **Error** | N/A — nothing can fail to fetch. The CTA is a server-rendered `<a>` that cannot fail to render; route-level failures are caught by `app/error.tsx` (ErrorBoundary), outside this component. |
| **Validation error** | N/A — no form, no inputs. |
| **Submitting / pending** | N/A — the CTA is a plain anchor; there is no submission, so no `disabled`/spinner swap. |
| **Success** | N/A. |
| **Disabled** | N/A — the Button supports `disabled:opacity-50` but the CTA is never rendered disabled here. |
| **Invite-gated (G1)** | N/A — invite gate runs only post-auth. |
| **Onboarding-incomplete (G2)** | N/A — post-auth only. |
| **Pending / rejected approval (G3)** | N/A — post-auth only. |
| **Preview-but-locked (CaptainLock)** | **N/A — this is NOT a captain/rank surface.** No rank gating exists on an unauth screen; `CaptainLock` is never mounted. (The preview-but-locked contract applies to `/captains/*`, not here — see [service-layer/01-identity-access-gating.md](../service-layer/01-identity-access-gating.md).) |
| **Authenticated bypass (host decision)** | When `getAuthenticatedUser()` returns truthy, `page.tsx` does **not** render LandingHero — control passes to the authed gating spine (units 06/24). LandingHero is the pre-auth state preceding the entire gate hierarchy; there is **no redirect** — the hero is the G0 *held* screen rendered in-place at `/`. |
| **E2E test-mode bypass (host decision)** | With `E2E_TEST_MODE=1`, a valid `camp404_test_user` cookie makes `getAuthenticatedUser()` truthy → hero suppressed. A malformed/absent test cookie falls through to Neon Auth and can still yield the hero. (Host concern; LandingHero is agnostic.) |
| **Reduced-motion (optional restyle)** | Today: no guard, all animations run. Optional acceptance target below adds a `@media (prefers-reduced-motion: reduce)` block to `glitchStyles` that stills shake/tear/RGB-split while preserving the static glyph, wordmark, and a fully usable CTA. |

**Global-matrix note:** every gate state (G0–G3) and the captain-lock state live in
the *host route* / authed branch — none mount inside LandingHero. The component's
own state surface is a single static presentation.

---

## Build steps

> Plan-doc-only. Ordered, with prerequisites + acceptance + tests. This is a REUSE
> with at most a cosmetic restyle — the bulk of the work is *confirming* the
> existing component still satisfies the contract after the surrounding redesign.

### Prerequisites (must land first)

1. **`Button` atom restyle** ([atom-button.md](atom-button.md), Steps 1–4:
   `rounded-[var(--radius)]`, `font-semibold`). LandingHero inherits the CTA look
   from the shared Button; no LandingHero change is needed, but its visual
   acceptance shot should be taken *after* the Button radius/weight fix lands.
2. **No service/core dependency** — there is nothing from
   [service-layer/01-identity-access-gating.md](../service-layer/01-identity-access-gating.md)
   that must land before LandingHero. The G0 selection in `page.tsx` already works;
   the spine's `core` extraction (deriveViewerRank/requireClearance) affects the
   *authed* branch only and is independent of this component.

### Step 1 — Confirm REUSE: no structural change

**Change:** None to structure. Keep `LandingHero`, `Glitch404`, and `glitchStyles`
exactly as they are (the file already matches the canonical board + reference).
Re-assert the import is `@camp404/ui/components/button` after any package-path
churn from the architecture pass.
**Prerequisite:** Button atom (cosmetic only).
**Acceptance:** `apps/web/app/landing-hero.tsx` renders the wordmark `<h1>`,
tagline `<p>`, five-layer `Glitch404`, CTA `<a href="/auth/sign-in">Are you lost?</a>`,
and cursor line; all three CRT overlays + the whole glyph + the cursor remain
`aria-hidden pointer-events-none`. Visual diff vs board `S01` (board #10) shows no
regression.

### Step 2 — Accessibility invariant guard (test, no code change)

**Change:** None to component. Add a test that asserts the a11y contract.
**Acceptance:** Screen-reader-exposed content is **exactly** the `<h1>Camp 404`,
the tagline `<p>`, and the CTA link — nothing else. Every decoration
(`.camp404-scanlines/.noise/.scanbeam`), the entire `Glitch404` stack, and the
cursor line carry `aria-hidden`.

### Step 3 — (Optional) reduced-motion variant

**Change:** Append a `@media (prefers-reduced-motion: reduce)` block to
`glitchStyles` that sets `animation: none` on `.camp404-glitch-shake`,
`.camp404-glitch-rgb-*`, `.camp404-glitch-tear-*`, `.camp404-scanbeam`, and
`.camp404-cursor`, leaving the static base glyph, wordmark, tagline, and CTA fully
visible and usable. Hard-coded glitch hues stay as-is.
**Prerequisite:** Product/design sign-off on whether the glitch-as-brand overrides
the a11y guard ([surfaces/01-landing.md](../../surfaces/01-landing.md) Open
question #1). If declined, document the decision and skip — do not ship a partial
guard.
**Acceptance:** With `prefers-reduced-motion: reduce` emulated, no element
animates; the `404` glyph, wordmark, tagline, and a clickable CTA all render; the
CTA still navigates to `/auth/sign-in`.

### Step 4 — Host-selection regression guard (test, lives with page.tsx)

**Change:** None to LandingHero. Confirm/keep the host contract.
**Acceptance:** `page.tsx` renders `<LandingHero />` iff `getAuthenticatedUser()`
is `null`; a truthy user (incl. the E2E test cookie) suppresses it with **no
redirect**. `export const dynamic = "force-dynamic"` is present.

### Tests

| Test | Type | Asserts |
|---|---|---|
| `landing-hero.test.tsx` — renders structure | RTL (server render) | `<h1>` "Camp 404", tagline text, CTA `<a>` with `href="/auth/sign-in"` and label "Are you lost?", and a Glitch404 region present. |
| `landing-hero.test.tsx` — a11y invariant | RTL | The three decoration layers, the `Glitch404` wrapper + all five spans, and the cursor `<p>` all have `aria-hidden`; only `<h1>`, tagline, and CTA are in the accessibility tree. |
| `landing-hero.test.tsx` — no client JS / works as anchor | RTL | CTA is an `<a>` (anchor), not a `<button>`; no `onClick`/state; no `"use client"` in the file. |
| `landing-hero.test.tsx` — reduced-motion (if Step 3 ships) | RTL / jsdom CSS check | `glitchStyles` contains a `prefers-reduced-motion: reduce` rule disabling the shake/tear/rgb/scanbeam/cursor animations. |
| host: `page.tsx` auth branch | existing `auth.test.ts` companion / E2E | `null` user → LandingHero rendered (no redirect); truthy user / valid test cookie → not rendered. |
| visual | Playwright screenshot vs board S01 | wordmark, tagline, five-layer glitch, CTA, cursor all positioned per board; CRT overlays present. |

---

## Consumers

| Surface / route | Mounts |
|---|---|
| **S01 Landing** — `/` (unauth branch only) | `apps/web/app/page.tsx` renders `<LandingHero />` when `getAuthenticatedUser()` returns `null` (the G0 held screen). |

This is the **only** consumer. LandingHero is not exported from `@camp404/ui`, is
not imported anywhere else, and is never mounted on an authenticated route. Exit
from the surface is the single CTA → `/auth/sign-in` (S02 Auth).
