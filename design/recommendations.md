# Camp 404 — visual-direction recommendations

Grounded in two things: a 5-facet audit of `@camp404/ui` (the design system as it
stands) and the 24 clean reference screenshots now in `design/reference/`. This is
the "what to decide now that there are real users" memo — prioritized, with the
actual forks called out at the end.

## What's working — keep it

- **The identity is real and distinctive.** The midnight-violet base + hot-magenta
  primary + electric-blue accent reads cohesively across every screen, and the
  glitched "404 — CAMP NOT FOUND" terminal landing (`01-landing.png`) is a genuine
  signature. Don't dilute it.
- **The quadrant ControlPanel** (`07-home-member.png`, `16-home-captain.png`) is the
  app's best original idea — a 2×2 nav around a central magenta **TALK** push-to-talk,
  with rank tiers as tabs (locked for members, unlocked for captains). It's
  memorable and on-theme. Keep the concept.
- **Copy voice** is strong and consistent ("who's arriving in the dust", "Something
  went sideways", "Camp 404 is invite-only"). Leave it.
- **The elevated-card-row pattern** (`08-tools.png`, `19-captains-tools.png`) is clean
  and consistent — icon tile + title + description + chevron. This is the de-facto
  list primitive; formalize it (see P1).

## P0 — decide before the next design pass

1. **Fill or tighten the quadrant home's dead space.** On a tall phone the four
   quadrants hold only a label + hint and the rest is void; the TALK button floats in
   a large empty middle (`07-home-member.png`). It reads unfinished. Either give each
   quadrant live content (counts, a recent item, a mini-preview) or tighten the grid
   vertically and let the page breathe with intent. This is the first thing a real
   user sees post-login — highest visual leverage.
   *Where:* `packages/ui/src/components/control-panel.tsx`, `apps/web/app/page.tsx`.

2. **Introduce semantic status tokens** (`success` / `warning` / `info`) and stop
   using raw Tailwind `emerald/amber/sky/rose`. Today the only status token is
   `destructive`; everything else is hardcoded palette (the amber clock on
   `20-pending-approval.png`, and the whole roster's status/rank pills). ~36
   off-token usages across 5 files, none theme-able, several carrying dead `dark:`
   variants. Add the tokens in `globals.css`, then codemod.
   *Where:* `packages/ui/src/styles/globals.css` + the 5 consuming files.

3. **Rethink the captain roster for mobile.** `captains/camp-management` is a
   `max-w-5xl` desktop `<table>` (Member/Rank/Status/Questionnaires/Driver/In SA/
   Country) — in a mobile-first `max-w-lg` app. It's also the only screen that can't
   be captured in test mode (it's DB-backed, so it currently throws — see
   `17-error-boundary.png`). It's the densest, highest-stakes captain surface. Decide
   the mobile layout (stacked cards / expandable rows) before building more on it.
   *Where:* `apps/web/app/captains/camp-management/camp-management-roster.tsx`.

## P1 — consolidate the system

4. **Promote the thrice-reimplemented primitives into `@camp404/ui`:**
   `SegmentedControl`/`ToggleGroup` (hand-rolled in the questionnaire, the feedback
   dialog, and the roster filter), `Tabs` (roster), and `Badge` (status/rank pills).
   None exist in the package today, so each page reinvents them and they drift.

5. **Pick one token-spelling convention.** The app mixes verbose
   `text-[color:var(--color-foreground)]` (~93 uses) and short `text-foreground`
   (~102 uses) — sometimes in the same file. The package itself only uses the short
   form. Standardize on short and codemod the verbose form; it's the cheapest
   consistency win and removes a whole class of restyle friction.

6. **Tokenize radius + type.** Only `--radius` exists (and only `control-grid` uses
   it); everything else hardcodes `rounded-md/lg/xl`. There are zero typography
   tokens — the monospace "terminal" motif is inline-hardcoded. Define
   `--radius-{sm,md,lg}` and `--font-{sans,mono}` so the look is tunable in one place.

## P2 — cleanup / debt

7. **Delete `quadrant-nav.tsx`** — self-described "v0… validate in Figma", strictly
   superseded by `control-panel`. Dead weight.
8. **Resolve dark mode.** There's no `.dark`/ThemeProvider mechanism yet 12 `dark:`
   utilities sit in the code as dead variants; a dev-mode hydration mismatch on
   `<html className="dark">` shows up on every page (it's what tripped the Next
   dev-tools "1 Issue" pill during capture). Either commit to a single dark theme and
   strip the `dark:` variants, or wire a real theme mechanism.
9. **Stories + tests for the 5 composite components** with none (dialog, popover,
   combobox, command, avatar); fix `vitest.config` so `.tsx` render tests can run
   (it's currently `node` env + a `.ts`-only glob).

## Decisions for you

- **Home quadrant direction (P0-1):** content-filled quadrants vs. a tightened,
  deliberately-spare grid? This shapes `control-panel.tsx`'s API.
- **Roster on mobile (P0-3):** redesign as mobile cards now, or keep the desktop
  table and gate the captain surface to larger screens for now?
- **Scope of the first Pencil pass:** all 19 prompted screens, or just the P0 set
  (home, roster, the status-token-bearing screens) first?

## How to act on this with the staged tooling

Reference PNGs are in `design/reference/`; per-screen Pencil prompts are in
`design/prompts/` (anchored to those PNGs + the exact tokens in `design/brief.md`).
When the shared Pencil canvas is free, generate a screen with
`pnpm --filter @camp404/web design:cli -- --out design/pages/<screen>.pen --prompt "$(cat design/prompts/<screen>.md)" --export design/exports/<screen>.png`,
eyeball the export vs the reference, then `node scripts/pencil/merge-pens.mjs --out
design/app.pen design/pages/`. See `design/README.md`.
