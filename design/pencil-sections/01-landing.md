### 1. Landing (signed-out hero)
**Purpose:** The single signed-out splash that leans into the "404 — camp not found" terminal/glitch identity and routes a visitor toward sign-in.
**Layout & elements:** Mobile single column (centered, narrower than the product default), top→bottom: heading "Camp 404"; tagline "Error 404 — Camp not found"; a giant decorative glitched "404" glyph stack; a full-width CTA button labeled "Are you lost?"; a blinking decorative cursor line "$ awaiting input_". Ambient full-bleed CRT overlays (scanlines, dot-noise, sweeping scanbeam) sit behind everything.
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
**Do-not-drop:** One accessible CTA link to `/auth/sign-in` plus accessible heading; the "404 broken-display" art is identity, not a per-entity hue table. No dead/orphaned variants in this unit.
