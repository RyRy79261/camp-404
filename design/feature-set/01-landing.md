# 01 — Landing Hero (unauthenticated)

**Files covered:**
- `apps/web/app/landing-hero.tsx` — the entire unauthenticated landing surface: a glitch/terminal "404 — camp not found" hero with a single CTA. Self-contained; ships its own inline `<style>` block of bespoke glitch CSS. (`apps/web/app/landing-hero.tsx:1-231`)
- `apps/web/app/page.tsx` — the `/` route; its first branch returns `<LandingHero />` when there is no authenticated user. The authed branch (gating spine) belongs to units 06 / 24, not here. (`apps/web/app/page.tsx:29-34`)
- `apps/web/lib/auth.ts` — `getAuthenticatedUser()`, the session probe whose `null` result selects the landing hero. (`apps/web/lib/auth.ts:25-37`)
- `apps/web/lib/test-mode.ts` — `isE2ETestMode()` / `TEST_USER_COOKIE`; in E2E mode a test-user cookie can short-circuit the unauthenticated branch. (`apps/web/lib/test-mode.ts:9-13`)
- `apps/web/app/auth/[path]/page.tsx` — destination of the sole CTA link (`/auth/sign-in`); not part of this surface but the only exit from it. (`apps/web/app/auth/[path]/page.tsx:30-38`)
- `packages/ui/src/components/button.tsx` — the shared `Button` primitive used for the CTA (`asChild`, `size="lg"`). (`packages/ui/src/components/button.tsx:7-57`)
- `packages/ui/src/styles/globals.css` — source of the `var(--color-*)` tokens the hero references. (`packages/ui/src/styles/globals.css:12-39`)

**Purpose:** The Landing Hero is the only screen an unauthenticated visitor can see. It is a purely presentational, server-rendered marketing/entry splash that leans into the camp's "404 — camp not found" terminal/glitch identity. It renders a giant animated, RGB-split, tearing "404", a chromatic-aberration tagline, scanline/noise/scanbeam CRT overlays, and a blinking terminal cursor. It carries exactly one functional affordance: a single CTA button ("Are you lost?") that links to `/auth/sign-in`. It touches no database, no form, no server action — its only "logic" is the upstream auth check in `page.tsx` that decides whether to show it at all.

## Features

### `HomePage` unauth branch — gate that selects the hero (`apps/web/app/page.tsx`)
- The `/` route is forced dynamic: `export const dynamic = "force-dynamic"` (`page.tsx:27`) so the Neon Auth session cookie is read on every request (avoids the Next 16 `DYNAMIC_SERVER_USAGE` prerender trace — see comment `page.tsx:23-27`).
- `const user = await getAuthenticatedUser()` (`page.tsx:30`). If `!user`, `return <LandingHero />` (`page.tsx:32-34`). This is the entire scope of unit 01; every subsequent gate (invite-gated, onboarding-incomplete, pending/rejected, control-panel) only runs when `user` is truthy and belongs to units 06/24.
- `getAuthenticatedUser()` (`auth.ts:25-37`): in E2E test mode (`E2E_TEST_MODE === "1"`, `test-mode.ts:11-13`) it first tries the `camp404_test_user` cookie (`auth.ts:26-29`, `readTestUserCookie` `auth.ts:46-61`); otherwise it reads Neon Auth's session via `auth.getSession()` and returns `null` when `!session?.user` (`auth.ts:30-31`). A `null` return is exactly what produces the landing hero. There is no redirect on the unauth path — the hero is rendered in place at `/`.

### `LandingHero` — root layout & overlays (`apps/web/app/landing-hero.tsx`)
- Root `<main>` with `min-h-[100dvh] overflow-hidden`, background `bg-[color:var(--color-background)]` (`landing-hero.tsx:5`).
- Three full-bleed decorative overlay `<div>`s, all `aria-hidden`, `pointer-events-none`, `z-0` (`landing-hero.tsx:6-17`):
  1. `camp404-scanlines` — `inset-0`, repeating horizontal scanlines (`landing-hero.tsx:6-9`, CSS `:84-92`).
  2. `camp404-noise` — `inset-0`, `opacity-[0.06]`, radial-dot noise with `mix-blend-mode: overlay` (`landing-hero.tsx:10-13`, CSS `:94-101`).
  3. `camp404-scanbeam` — `inset-x-0 top-0 h-24`, a vertical sweeping beam animated 7s linear infinite (`landing-hero.tsx:14-17`, CSS `:103-117`).
- Content column: `relative z-10 mx-auto … w-full max-w-md … sm:max-w-xl`, `min-h-[100dvh]`, `flex-col items-center justify-between gap-10`, padding `px-6 pb-10 pt-14 sm:pt-20` (`landing-hero.tsx:19`). NOTE: this column uses `max-w-md`/`sm:max-w-xl`, not the product-global `max-w-lg`.

### `LandingHero` — header / tagline block (`landing-hero.tsx:20-27`)
- `<h1>` text `Camp 404`, tiny uppercase, `tracking-[0.5em]`, `text-[color:var(--color-muted-foreground)]`, `text-[10px]` (`landing-hero.tsx:21-23`). This is the page's accessible heading (asserted by E2E: `getByRole("heading", { name: "Camp 404" })`, `home.spec.ts:6`).
- `<p>` tagline text `Error 404 — Camp not found`, `camp404-chromatic` (chromatic-aberration text-shadow), `font-mono text-[11px] uppercase tracking-[0.3em] text-[color:var(--color-foreground)]` (`landing-hero.tsx:24-26`).

### `Glitch404` sub-component — the giant "404" (`landing-hero.tsx:49-73`)
- Wrapper `div` is `camp404-glitch-shake relative leading-none select-none`, `aria-hidden` (`landing-hero.tsx:51-54`). Entire glyph stack is aria-hidden (decorative; the real heading text is the `<h1>`/tagline above).
- Five stacked `<span>` layers, each rendering the literal text `404`:
  1. `camp404-glitch-base` — the visible base glyph, `color: var(--color-foreground)`, `position: relative` (`landing-hero.tsx:55`, CSS `:145-148`).
  2. `camp404-glitch-rgb camp404-glitch-rgb-magenta` — magenta RGB-split layer `rgba(255,0,140,0.85)`, `mix-blend-mode: screen` (`landing-hero.tsx:56-61`, CSS `:157-160`).
  3. `camp404-glitch-rgb camp404-glitch-rgb-cyan` — cyan RGB-split layer `rgba(0,220,255,0.85)`, `mix-blend-mode: screen` (`landing-hero.tsx:62-64`, CSS `:171-174`).
  4. `camp404-glitch-tear camp404-glitch-tear-a` — horizontal clip-path "tear" slice layer, foreground colour, `mix-blend-mode: screen`, 4.3s cycle (`landing-hero.tsx:65-67`, CSS `:188-197, :201-210`).
  5. `camp404-glitch-tear camp404-glitch-tear-b` — second tear layer, 5.1s cycle (`landing-hero.tsx:68-70`, CSS `:188-194, :198-200, :211-219`).
- Shared glyph sizing for base/rgb/tear: `font-family` monospace stack, `font-weight: 900`, `font-size: clamp(7rem, 30vw, 14rem)`, `letter-spacing: -0.05em`, `line-height: 0.9`, `text-align: center` (CSS `:133-143`).

### `LandingHero` — CTA + terminal cursor block (`landing-hero.tsx:31-41`)
- `Button` with `asChild size="lg" className="w-full"` wrapping `<a href="/auth/sign-in">Are you lost?</a>` (`landing-hero.tsx:32-34`). This is the ONE interactive element / only navigation off the surface.
- Below it, a decorative blinking cursor `<p>` (`aria-hidden`) with literal text `$ awaiting input_`, class `camp404-cursor`, `mt-4 font-mono text-[10px] uppercase tracking-[0.3em] text-[color:var(--color-muted-foreground)]` (`landing-hero.tsx:35-40`, blink CSS `:222-229`).
- Container `flex w-full max-w-xs flex-col items-center gap-2` (`landing-hero.tsx:31`).

### Inline `<style>` block — bespoke glitch CSS (`landing-hero.tsx:44, :77-230`)
All glitch/CRT styling lives inline in this file (confirmed: these `camp404-*` glitch classes are defined NOWHERE else in the repo — grep of globals.css + all web `.tsx`/`.css` returned only `landing-hero.tsx`). The comment (`landing-hero.tsx:75-76`) states this is intentional so "the rest of the design system stays clean." The block references the shared tokens `--color-foreground` (base + tear glyphs, CSS `:146, :192`) but hard-codes its own magenta/cyan RGBA values rather than `--color-primary`/`--color-accent`. Keyframe inventory: `camp404-scanbeam`, `camp404-shake`, `camp404-rgb-magenta`, `camp404-rgb-cyan`, `camp404-tear-a`, `camp404-tear-b`, `camp404-cursor-blink`.

## User actions & interactions

- **Tap/click "Are you lost?"** → navigates to `/auth/sign-in` via a plain anchor (`landing-hero.tsx:33`). E2E confirms the destination: clicking lands on URL matching `/\/auth\/sign-in$/` (`home.spec.ts:12-15`) and the link carries `href="/auth/sign-in"` (`home.spec.ts:8-9`). `/auth/sign-in` is served by the `[path]` catch-all, which renders `<AuthShell hideBack><SignInForm/></AuthShell>` (`auth/[path]/page.tsx:30-38`).
- **No other interactions.** No forms, inputs, toggles, voice/PTT, scroll-triggered behaviour, hover logic, or client state. All animation is pure CSS keyframes; the component is a server component (no `"use client"`).

## States & presentations

This surface is intentionally state-poor. Of the global-states rows:

- **Populated** — the only meaningful runtime state. Always the same static splash; there is no data to vary it.
- **Loading** — none on the surface itself. The upstream `/` route is `force-dynamic` and `await`s `getAuthenticatedUser()` server-side before deciding to render the hero; there is no client loading/skeleton state in the hero.
- **Empty / Validation-error / Submitting-pending / Success / Disabled** — not applicable: no data, no form, no submit. (The `Button` primitive supports `disabled:pointer-events-none disabled:opacity-50` via `buttonVariants`, `button.tsx:8`, but the CTA is never rendered disabled here.)
- **Invite-gated / Onboarding-incomplete / Pending-approval / Rejected / Captain-only-locked** — none apply *on this surface*. These gates live in the authed branch of `page.tsx` (`page.tsx:39-63`) and only run when a user IS authenticated; an unauthenticated visitor never reaches them — they see the hero instead. The hero is, in effect, the pre-auth state that precedes the entire gating spine.
- **Authenticated-bypass presentation** — if a session exists (`user` truthy), the hero is NOT shown; control passes to the gating spine (`page.tsx:35-101`), out of unit 01's scope. In E2E test mode the `camp404_test_user` cookie can make `user` truthy and thus suppress the hero (`auth.ts:26-29`).
- **Decorative / ambient animation presentation** — continuous CRT scanlines, dot-noise, sweeping scanbeam, shaking + RGB-split + tearing "404", chromatic tagline, and blinking `$ awaiting input_` cursor run perpetually regardless of state. No `prefers-reduced-motion` guard exists (the inline CSS has no reduced-motion media query). <!-- low-confidence: whether this is a deliberate omission or oversight — no comment addresses it -->

## Enums, options & configurable values

There are no runtime enums, options, or feature flags specific to this surface. The only configurable input is environment-level:

- `E2E_TEST_MODE` (`"1"` enables) — `isE2ETestMode()` (`test-mode.ts:11-13`); when set, the `camp404_test_user` cookie can satisfy the auth check and bypass the hero.
- `TEST_USER_COOKIE = "camp404_test_user"` (`test-mode.ts:9`) — cookie name read by `readTestUserCookie` (`auth.ts:47`).

Literal/hard-coded values that define the surface (digit-exact):
- Heading text: `Camp 404`. Tagline text: `Error 404 — Camp not found`. CTA label: `Are you lost?`. Cursor text: `$ awaiting input_`. Glyph text (×5 spans): `404`.
- CTA destination: `/auth/sign-in` (hard-coded anchor href, `landing-hero.tsx:33`).
- Button props used: `size="lg"` (→ `h-11 rounded-md px-8`, `button.tsx:25`), `asChild` (→ renders Radix `Slot`, `button.tsx:45`), default `variant` (`default` → `bg-primary text-primary-foreground hover:bg-primary/90`, `button.tsx:12`).
- Tokens referenced by the hero: `--color-background: oklch(0.15 0.05 295)` (`globals.css:12`); `--color-foreground: oklch(0.97 0.02 330)` (`globals.css:13`); `--color-muted-foreground: oklch(0.7 0.05 325)` (`globals.css:19`). Button defaults pull `--color-primary: oklch(0.65 0.27 340)` (`globals.css:14`) and `--color-primary-foreground` (`globals.css:15`).
- Hard-coded RGBA glitch colours (NOT tokenised): chromatic tagline shadows `rgba(255,0,128,0.8)` / `rgba(0,200,255,0.8)` (CSS `:80-81`); magenta layer `rgba(255,0,140,0.85)` (CSS `:158`); cyan layer `rgba(0,220,255,0.85)` (CSS `:172`); scanbeam gradient stops use `rgba(180,100,255,0.05)` / `rgba(255,0,200,0.1)` (CSS `:107-109`); scanlines `rgba(255,255,255,0.045)` (CSS `:89-90`); noise dots `rgba(255,255,255,0.6)` / `rgba(255,255,255,0.4)` (CSS `:96-97`).
- Animation durations/timing: shake `5s steps(1)` (CSS `:122`); scanbeam `7s linear` (CSS `:112`); RGB magenta/cyan `3.7s steps(1)` (CSS `:159, :173`); tear-a `4.3s steps(1)` (CSS `:196`); tear-b `5.1s steps(1)` (CSS `:199`); cursor blink `1.05s steps(1)` (CSS `:224`).
- Glyph sizing: `font-size: clamp(7rem, 30vw, 14rem)`, `font-weight: 900`, `letter-spacing: -0.05em`, `line-height: 0.9` (CSS `:139-142`).
- Layout widths: content column `max-w-md` → `sm:max-w-xl`; CTA block `max-w-xs`; padding `pt-14`/`sm:pt-20`, `pb-10`, `px-6`, `gap-10` (`landing-hero.tsx:19, :31`).

## Data model touched

**None.** The Landing Hero reads and writes zero tables. No Drizzle query, no `testStore`, no server action, no route handler is invoked on this surface. The only data read in the selecting `page.tsx` branch is the session object from `getAuthenticatedUser()` (`auth.ts:25-37`), whose shape is the in-memory `AuthenticatedUser` interface — `{ id: string; primaryEmail: string | null; displayName: string | null }` (`auth.ts:13-17`) — sourced from Neon Auth's `session.user` (`id`, `email`, `name`, `auth.ts:32-36`) or the `camp404_test_user` cookie JSON (`auth.ts:51-57`). No persisted entity is touched.

## Validation, edge cases & business rules

- **Auth-presence rule (the only branching logic):** render the hero iff `getAuthenticatedUser()` returns `null` (`page.tsx:32`). Authenticated users never see it.
- **E2E cookie precedence:** in `E2E_TEST_MODE`, a present/valid `camp404_test_user` cookie takes precedence over Neon Auth (`auth.ts:26-29`). `readTestUserCookie` parses `JSON.parse(decodeURIComponent(raw))`, rejects (`return null`) if `parsed.id` is not a non-empty string, and swallows parse errors via `catch { return null }` (`auth.ts:50-60`). A malformed/empty test cookie therefore falls through to Neon Auth and ultimately can still yield the hero.
- **Forced dynamic rendering:** `/` cannot be statically prerendered (`page.tsx:27`); the session cookie is read per-request. This is a build-correctness rule, not user-facing validation.
- **CTA robustness:** the CTA is a literal `<a href="/auth/sign-in">` rendered via `Button asChild`, so it works without JS (server-rendered anchor). There is no client-side guard, no disabled/loading state, and no error path — it cannot fail to render.
- **Accessibility rules:** every decorative element is `aria-hidden` — the three CRT overlays (`landing-hero.tsx:7, :11, :15`), the entire `Glitch404` stack (`landing-hero.tsx:53`), and the cursor line (`landing-hero.tsx:36`). The only screen-reader-exposed content is the `<h1>` "Camp 404", the tagline `<p>`, and the CTA link. Restyles MUST keep the "404" glyph stack and cursor decorative (aria-hidden) and keep an accessible heading + an accessible CTA link to `/auth/sign-in`.
- **Edge case — no `prefers-reduced-motion`:** all animations run unconditionally; there is no motion-reduction fallback. Preserve the CTA's usability regardless of motion.
- **Token discipline (ugly truth):** the hero references shared tokens only for `background`/`foreground`/`muted-foreground` and the Button's `primary`. All glitch hues (magenta, cyan, scanbeam violet) are hard-coded RGBA literals in the inline `<style>`, deliberately diverging from the single OKLCH `@theme`. A restyle should treat these as part of the "404 broken-display" art, not a per-entity hue table.

## Sub-components / variants

- **`LandingHero` (exported, `landing-hero.tsx:3-47`)** — the surface. Imported only by `page.tsx:20` and rendered only at `page.tsx:33`; no other consumers (grep-confirmed).
- **`Glitch404` (local, not exported, `landing-hero.tsx:49-73`)** — the five-layer glitched glyph; used once inside `LandingHero` (`landing-hero.tsx:29`).
- **`glitchStyles` (local const string, `landing-hero.tsx:77-230`)** — bespoke CSS injected via inline `<style>` (`landing-hero.tsx:44`). Self-contained; no external references in or out.
- **`Button` / `buttonVariants` (shared primitive, `button.tsx:43-57`)** — the hero uses `variant="default"` (implicit) + `size="lg"` + `asChild`. Full variant set available but unused here: variants `default | destructive | outline | secondary | ghost | link` (`button.tsx:11-21`); sizes `default | sm | lg | icon | icon-lg` (`button.tsx:22-28`). NOTE: this `Button` exposes a `link` variant and an `icon-lg` size beyond the shared-vocabulary list (which names variants default/outline/ghost/destructive/secondary and sizes default/sm/lg/icon) — those two extras are defined here but NOT used by the landing hero.
- **No dead/orphaned variants within this unit.** Every span layer, overlay, and keyframe in `glitchStyles` is wired to a rendered element. The auth `[path]` page is the CTA's target, not a variant of this surface.
- **Adjacent-but-excluded:** the authed branch of `page.tsx` (gating spine + `ControlPanel`/`HomeHeader`/`EnablePush`, `page.tsx:36-101`, `homeLayers` `:103-179`) belongs to units 06 (authed home) / 24 (app shell) and is out of scope for unit 01. The global `AcknowledgementGate`/`FeedbackGate` mounted in `layout.tsx:52-55` are live-session-gated and do not activate for an unauthenticated landing visitor.
