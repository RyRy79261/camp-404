# 01-landing — app integration plan

- **Route(s):** `/` (unauth branch only) · server-rendered page
- **Surface brief:** [design/spec/surfaces/01-landing.md](../../surfaces/01-landing.md)
- **Component plans consumed:**
  - [organism-landinghero.md](../components/organism-landinghero.md)
  - [atom-button.md](../components/atom-button.md)
- **Service-layer plan:** [01-identity-access-gating.md](../service-layer/01-identity-access-gating.md)
- **Architecture ref:** [architecture.md](../architecture.md) §Layering

---

## Current state

The route already exists and already implements the unauth branch of the landing surface. No structural rebuild is required — this is a **REUSE** integration.

### Files today

| File | Role | Disposition |
|---|---|---|
| `apps/web/app/page.tsx` | Route entry: `export const dynamic = "force-dynamic"` (line 27); calls `getAuthenticatedUser()` (line 30); returns `<LandingHero />` when `user === null` (lines 32–34); implements the full G0→G3 authed gating spine (lines 39–98) | **MODIFY** (small) — gating-spine wiring; see §Build steps |
| `apps/web/app/landing-hero.tsx` | `LandingHero` server component (230 lines); contains local `Glitch404` sub-component and `glitchStyles` inline `<style>` string; no `"use client"` | **MODIFY** (minor restyle) — Button cosmetic changes propagate from atom-button step |
| `apps/web/app/error.tsx` | Route-level error boundary (catches RSC + server-action errors at `/`); already in place | **REUSE** (no change) |
| `apps/web/app/not-found.tsx` | Next.js `not-found` handler at `/`; already in place | **REUSE** (no change) |
| `apps/web/app/layout.tsx` | Root layout wrapping all routes including `/` | **REUSE** (no change scoped to this surface) |

No `/api` route handler, no server action, no separate `"use client"` island, and no `loading.tsx` are involved in this surface. The route has no form, no mutation path, and no suspense boundary.

### What the redesign changes

The redesign introduces **no structural changes** to this surface. The changes that touch it are cosmetic downstream effects from other work:

1. `Button` atom restyle (radius `rounded-md` → `rounded-[var(--radius)]`, weight `font-medium` → `font-semibold`) — propagates to the CTA automatically; no edit to `landing-hero.tsx` is needed.
2. Foundations token pass — `globals.css` `@theme` updates land in `page.tsx`'s inherited token context; `LandingHero` picks them up because `background`, `foreground`, and `muted-foreground` are referenced via `var(--color-*)` already.
3. The gating-spine EXTEND in `page.tsx` (identity-access-gating plan steps 4–6: `requireClearance`, `deriveViewerRank` rewire) touches the **authed branch** of `page.tsx` only; the unauth branch (`if (!user) return <LandingHero />;`) is unchanged.

---

## File structure

### Target files in `apps/web`

| File | Status vs today | Notes |
|---|---|---|
| `apps/web/app/page.tsx` | **MODIFY** (authed branch only) | Unauth guard line 32–34 stays untouched. Authed branch (lines 39–98) is updated by identity-access-gating plan. `dynamic = "force-dynamic"` stays. |
| `apps/web/app/landing-hero.tsx` | **MODIFY** (cosmetic — no logic change) | Button `size="lg"` CTA inherits new radius + semibold from atom-button restyle. `glitchStyles` string: optionally add `@media (prefers-reduced-motion: reduce)` block (Step 3, pending sign-off). No other edit. |
| `apps/web/app/error.tsx` | **REUSE** | Already handles RSC errors at `/`; no change. |
| `apps/web/app/not-found.tsx` | **REUSE** | Already handles 404 at `/`; no change. |
| `apps/web/app/layout.tsx` | **REUSE** | Foundations token pass modifies `globals.css` (not this file directly). |

No files are **CREATED** or **DELETED** for this surface. The `LandingHero` component stays app-local — it is **not** promoted to `@camp404/ui` (organism plan decision: self-contained glitch art + inline `<style>` must not contaminate the shared design-system token space).

---

## Components composed

| Component | Plan | Render context | Notes |
|---|---|---|---|
| `LandingHero` | [organism-landinghero.md](../components/organism-landinghero.md) | Server (no `"use client"`) | Exported from `apps/web/app/landing-hero.tsx`; rendered by `page.tsx` when `getAuthenticatedUser()` returns `null` |
| `Glitch404` | *(no separate plan — local, unexported)* | Server (lives inside `landing-hero.tsx`) | Five-layer `aria-hidden` animated glyph; no props |
| `Button` (`variant="default"`, `size="lg"`, `asChild`) | [atom-button.md](../components/atom-button.md) | Server (renders as `<a>` via `asChild`) | Sole interactive element; plain anchor `href="/auth/sign-in"` |

No other shared components are composed here. Explicitly absent: `TopChrome`, `SectionHeader`, `DetailHeader`, `GridTile`, `InputField`, `Card`, `EmptyState`, `CaptainLock` (surface brief §Components used). The three CRT decoration divs (`.camp404-scanlines`, `.camp404-noise`, `.camp404-scanbeam`) and the cursor line (`.camp404-cursor`) are pure CSS classes from the inline `<style>` block — not components.

---

## Services & data

### Service-layer functions called

| Function | Source | Call site | When called |
|---|---|---|---|
| `getAuthenticatedUser()` | `apps/web/lib/auth.ts:35` | `apps/web/app/page.tsx:30` | **Every request** to `/`; server-side before any branch |

That is the only service-layer function called on this surface. `LandingHero` itself calls nothing — it is purely presentational.

### Data flow

```text
GET /
  → page.tsx (server component, force-dynamic)
      → getAuthenticatedUser()   [apps/web/lib/auth.ts]
          → isE2ETestMode()      [apps/web/lib/test-mode.ts] — reads E2E_TEST_MODE env
          → readTestUserCookie() [auth.ts] — if E2E; cookie name = "camp404_test_user"
          → auth.getSession()    [apps/web/lib/neon-auth.ts] — Neon Auth / Better Auth
          → fallback: readSessionWithoutCookieWrite() if cookie-write error
          → returns: AuthenticatedUser | null
      ──→ null
              → render <LandingHero />    ← THIS SURFACE
      ──→ truthy (authed)
              → authed gating spine (units 06/24, out of scope)
```

**Server-side only.** No props are passed to `LandingHero`; it receives and fetches nothing. No data is fetched server-side for `LandingHero`'s own content — it is byte-identical every render.

### No DB reads

The surface reads zero tables. `getAuthenticatedUser()` reads Neon Auth's session cookie — a session token, not a DB query at the application level. All glitch art and copy are static.

### E2E test-mode seam

`getAuthenticatedUser()` branches on `isE2ETestMode()` (reads `process.env.E2E_TEST_MODE === "1"`). With a valid `camp404_test_user` cookie the function returns a synthetic `AuthenticatedUser` — truthy, so `LandingHero` is suppressed. A malformed or absent test cookie falls through to Neon Auth and can still yield `null`, rendering `LandingHero`. The seam is entirely in `apps/web/lib/auth.ts`; `LandingHero` is agnostic.

---

## Gating

**Gate level: G0 — pre-auth held screen. No rank gating. No `CaptainLock`.**

This is the only surface that renders **before** the gating spine runs. The identity-access-gating service plan ([service-layer/01](../service-layer/01-identity-access-gating.md) §Consumers) classifies it explicitly as "G0 held screen (NOT a redirect)". The hero is rendered in-place at `/` — there is no redirect to a dedicated unauth URL.

The preview-but-locked / `CaptainLock` contract (decisions.md §3, architecture.md §`@camp404/core`) applies only to rank-gated captain surfaces (`/captains/*`). It **does not apply here**. An unauth visitor has no rank; the rank-clearance comparator (`requireClearance` / `rankLevel`) is never consulted for this surface.

Gate progression at `/`:
- `user === null` → **render `LandingHero`** (this surface, stays here)
- `user !== null` → gating spine runs: G1 invite-gate, G2 onboarding, G2b legacy fallback, G3 approval → redirect chain (all out of scope for this surface)

---

## States

| State | Behaviour on this surface |
|---|---|
| **Populated (only state)** | Static splash, byte-identical every render. All CSS keyframes animate continuously. |
| **Loading** | None on-surface. `getAuthenticatedUser()` resolves server-side before `LandingHero` is selected. No client skeleton, no `Suspense`, no spinner. |
| **Empty** | N/A — no data-driven content. |
| **Error** | N/A within `LandingHero` — nothing can fail to fetch. Route-level failures (e.g. Neon Auth down) surface through `apps/web/app/error.tsx` (the RSC error boundary), outside this component. |
| **Validation error** | N/A — no form, no inputs. |
| **Submitting / pending** | N/A — the CTA is a plain `<a>`; no submission, no `disabled`/spinner swap. |
| **Success** | N/A. |
| **Disabled** | N/A — `Button` supports `disabled:opacity-50` but the CTA is never rendered disabled. |
| **Invite-gated (G1)** | N/A — invite gate runs only post-auth, in `page.tsx`'s authed branch. |
| **Onboarding-incomplete (G2/G2b)** | N/A — post-auth only. |
| **Pending / rejected approval (G3)** | N/A — post-auth only. |
| **Preview-but-locked (CaptainLock)** | **N/A** — no rank gating on an unauth surface. `CaptainLock` is never mounted here. |
| **Authenticated bypass** | When `getAuthenticatedUser()` returns truthy, `page.tsx` does not render `LandingHero`. Control passes to the authed spine. There is no redirect at G0 — the hero is simply not emitted. |
| **E2E test-mode (valid cookie)** | Truthy synthetic user → `LandingHero` suppressed. Valid E2E sessions enter the authed spine the same as real sessions. |
| **E2E test-mode (malformed/absent cookie)** | `null` from test cookie parse → falls through to Neon Auth → may still yield `null` → `LandingHero` renders normally. |
| **Reduced-motion (optional)** | Today: no guard; all keyframe animations run unconditionally. Optional Step 3 below adds `@media (prefers-reduced-motion: reduce)` to `glitchStyles`, stilling shake/tear/rgb/scanbeam/cursor while leaving the static glyph, wordmark, tagline, and CTA usable. |

---

## Build steps

All steps are **plan-doc-only** (no code in this pass). Ordered with prerequisites and acceptance criteria.

### Prerequisites (must land before this surface's acceptance shot)

1. **Foundations token pass** — `globals.css` `@theme` must have the final `--color-background`, `--color-foreground`, `--color-muted-foreground`, `--color-primary` token values. `LandingHero` references these via `var(--color-*)` inline and via `Button`'s `bg-primary` utility. Token values affect the visual acceptance screenshot.

2. **`Button` atom restyle** ([atom-button.md](../components/atom-button.md) Steps 1–2: `rounded-[var(--radius)]`, `font-semibold`) must land before the CTA visual-acceptance shot. No change to `landing-hero.tsx` is required; the CTA inherits from the shared primitive.

3. **`@camp404/core` scaffold** (identity-access-gating plan Step 1) — does not block `LandingHero` itself, but the gating-spine rewire in `page.tsx` (Step 4 of this plan, below) depends on `deriveViewerRank` from `core`. The unauth branch is unaffected by this dependency.

### Step 1 — Confirm REUSE: assert existing implementation matches spec

**Change:** None. Confirm `apps/web/app/landing-hero.tsx` already satisfies the canonical S01 board (board #10, `design/.spec-extract/boards/10-s01-landing.txt`).

Checklist — verified against the live file:
- `<h1>Camp 404</h1>` with `text-[10px] uppercase tracking-[0.5em] text-[color:var(--color-muted-foreground)]` ✓ (line 21–23)
- Tagline `<p>Error 404 — Camp not found</p>` with `.camp404-chromatic font-mono text-[11px] uppercase tracking-[0.3em]` ✓ (line 24–26)
- `<Glitch404 />` — five-layer `aria-hidden` glyph with `camp404-glitch-shake` wrapper ✓ (lines 49–73)
- CTA: `<Button asChild size="lg" className="w-full"><a href="/auth/sign-in">Are you lost?</a></Button>` with `max-w-xs` constraint ✓ (lines 31–36)
- Cursor `<p aria-hidden>$ awaiting input_</p>` with `.camp404-cursor` ✓ (lines 36–39)
- Inline `<style>{glitchStyles}</style>` injected inside `<main>` ✓ (line 44)
- Three `aria-hidden pointer-events-none absolute inset-0 z-0` CRT overlays ✓ (lines 7–16)
- `export const dynamic = "force-dynamic"` in `page.tsx` ✓ (line 27)

**Prerequisite:** None for this step.
**Acceptance:** Visual diff vs board S01 shows no regression. Lint and typecheck pass. No `"use client"` in `landing-hero.tsx`.

### Step 2 — Accessibility invariant guard (test addition, no code change)

**Change:** Add/extend test file `apps/web/app/__tests__/landing-hero.test.tsx` (or create it). These are plan-level acceptance tests; they do not change the component.

Tests to add:

| Test | Asserts |
|---|---|
| Renders structure | `<h1>` "Camp 404", tagline text "Error 404 — Camp not found", `<a href="/auth/sign-in">Are you lost?</a>` present |
| A11y invariant | The three CRT overlays (`.camp404-scanlines/noise/scanbeam`), the `Glitch404` wrapper + all five spans, and the cursor `<p>` all carry `aria-hidden`; only `<h1>`, tagline, and CTA link are in the accessibility tree |
| CTA is an anchor | CTA root element is `<a>`, not `<button>`; no `onClick`; no `"use client"` directive in file |

**Prerequisite:** Step 1 confirmed.
**Acceptance:** All three tests pass.

### Step 3 — (Optional) reduced-motion variant

**Gated on product/design sign-off** (surface brief Open question #1; see §Open items below).

**Change (if approved):** Append a `@media (prefers-reduced-motion: reduce)` block to the `glitchStyles` string in `apps/web/app/landing-hero.tsx`. The block sets `animation: none` on `.camp404-glitch-shake`, `.camp404-glitch-rgb-magenta`, `.camp404-glitch-rgb-cyan`, `.camp404-glitch-tear-a`, `.camp404-glitch-tear-b`, `.camp404-scanbeam`, and `.camp404-cursor`. The static base glyph, wordmark, tagline, and CTA remain fully visible and usable.

**If declined:** Document the decision in this plan and skip. Do not ship a partial guard.

**Prerequisite:** Product/design confirmation.
**Acceptance:** With `prefers-reduced-motion: reduce` emulated, no element animates; the `404` glyph, wordmark, tagline, and CTA all render; the CTA navigates to `/auth/sign-in`.

### Step 4 — Host-selection regression guard (test addition, lives with `page.tsx`)

**Change:** Add/extend test coverage for the `page.tsx` auth branch. No component code change.

Tests to add:

| Test | Asserts |
|---|---|
| Null user → renders `LandingHero`, no redirect | `getAuthenticatedUser()` returns `null` → `<LandingHero />` is returned; `redirect` is not called |
| Truthy user (real) → no `LandingHero` | `getAuthenticatedUser()` returns a valid user → `LandingHero` not rendered (gating spine takes over) |
| Truthy user (E2E test cookie) → no `LandingHero` | Valid `camp404_test_user` cookie → `getAuthenticatedUser()` returns a synthetic truthy user → `LandingHero` not rendered |
| `dynamic = "force-dynamic"` exported | Module-level export is present (prevents static prerender stranding the cookie read) |

**Prerequisite:** Steps 1–2 confirmed.
**Acceptance:** All four tests pass. The seam test uses `E2E_TEST_MODE=1` + a valid test-cookie fixture (from `apps/web/lib/test-mode.ts`).

### Step 5 — Visual acceptance screenshot

**Change:** Capture a Playwright screenshot of `/` rendered with `getAuthenticatedUser()` mocked to return `null` (or in `E2E_TEST_MODE` with a malformed test cookie). Compare against board S01 (board #10, `design/.spec-extract/boards/10-s01-landing.txt`).

**Prerequisite:** Foundations tokens and Button atom restyle landed (Steps 1–2 of prerequisites above). Steps 1–2 of this plan green.
**Acceptance:** Wordmark, tagline, five-layer `404` glitch glyph, CTA button, terminal cursor, and three CRT overlays all present and positioned per board. CTA label reads "Are you lost?". No console errors.

---

## Open items

Cross-referenced from [design/spec/surfaces/01-landing.md](../../surfaces/01-landing.md) §Open questions and [organism-landinghero.md](../components/organism-landinghero.md) §Build steps.

1. **`prefers-reduced-motion` guard (Step 3 gate).** All keyframe animations run unconditionally today. Is this intentional art direction ("the glitch IS the brand") or an accessibility oversight? If the latter, add the `@media (prefers-reduced-motion: reduce)` block to `glitchStyles`. Product/design sign-off required before Step 3 ships. **Do not silently skip or partially implement.**

2. **Glyph font family.** `Glitch404` uses `font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` (hard-coded in `glitchStyles`). The wordmark `<h1>`, tagline, and cursor use `font-mono` (Tailwind → JetBrains Mono if loaded). Confirm whether the oversized decorative glyph should match the brand face or whether the system-monospace fallback is intentional for the art. **Document the decision; do not silently fix.**

3. **CTA copy lock.** "Are you lost?" is board-canonical. If marketing wants seasonal or event-specific copy, there is no current mechanism short of a code change. Flag to product if copy-changeability is required before the redesign ships.

4. **Glitch colour tokenisation.** Hard-coded RGBA literals for magenta/cyan/scanbeam violet in `glitchStyles` diverge from the OKLCH `@theme`. They will not update automatically if the palette shifts. This is accepted intentional art direction — document as a maintenance caveat, not a bug.
