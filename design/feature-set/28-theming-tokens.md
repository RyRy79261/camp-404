# 28 — Design token system

**Files covered:**
- `packages/ui/src/styles/globals.css` — the SINGLE source of truth: the one Tailwind v4 `@theme` block holding all OKLCH colour tokens + `--radius`, plus base-layer resets and the one `cp-layer-in` keyframe.
- `apps/web/lib/og-image.tsx` — hand-maintained HEX MIRROR of three tokens (background/foreground/muted-foreground) + literal glitch-channel colours; shared `next/og` (Satori) renderer for share card + square app icons; exports `SHARE_SIZE` / `SHARE_CONTENT_TYPE` / `SHARE_ALT`.
- `apps/web/app/manifest.ts` — PWA web manifest; hand-maintained hex mirror of `--color-background` for `background_color` + `theme_color`.
- `apps/web/app/layout.tsx` — root metadata + `viewport.themeColor` (another hand-maintained hex mirror); imports `@camp404/ui/styles.css`.
- `apps/web/app/icon.svg` — static favicon; hand-maintained hex mirror of background/foreground + the two glitch-channel hexes.
- `apps/web/app/global-error.tsx` — out-of-shell error boundary with INLINE hex mirrors (background/foreground/primary) because app CSS vars are unavailable there.
- `apps/web/app/apple-icon.tsx`, `apps/web/app/opengraph-image.tsx`, `apps/web/app/twitter-image.tsx` — thin Next file-route wrappers around `og-image.tsx`.
- `apps/mobile/capacitor.config.ts` — splash-screen `backgroundColor` hex mirror (`#0d061e`).
- `packages/ui/components.json` — shadcn config that pins `css: src/styles/globals.css`, `style: new-york`, `baseColor: neutral`, `cssVariables: true`, `iconLibrary: lucide`.
- `packages/ui/src/lib/utils.ts` — `cn()` (clsx + tailwind-merge) used by every variant to merge token utility classes.

**Purpose:** Camp 404 has exactly ONE design-token source: a single Tailwind v4 `@theme` block in `packages/ui/src/styles/globals.css`, exported as `@camp404/ui/styles.css` and imported once in `apps/web/app/layout.tsx`. It defines 19 OKLCH colour tokens (dark-only — there is no light theme and no `.dark`-scoped override; the `dark` class set by next-themes is cosmetic) plus a single `--radius`. Because Open Graph imagery (Satori), the PWA manifest, the favicon SVG, the viewport `themeColor`, the global error boundary, and the mobile splash screen all render OUTSIDE the CSS-variable cascade, a small set of tokens is HAND-MIRRORED to literal hex in those files — this is the documented "sync point" and it is currently INCONSISTENT across files (three different hexes are used for the same foreground token). Disambiguation of entities is by ICON + LABEL only, never by colour.

## Features

### The single `@theme` token block (`packages/ui/src/styles/globals.css`)
- One `@theme { … }` block (line 9) — Tailwind v4's mechanism that both registers CSS custom properties AND generates the matching utility classes (`bg-primary`, `text-muted-foreground`, `border-input`, etc.). There is exactly one `@theme` and no second `:root`/`.dark` colour override anywhere in `packages/ui/src` (confirmed by grep).
- `@import "tailwindcss";` (line 1) + `@source "../components/**/*.{ts,tsx}";` (line 7) — the `@source` directive is load-bearing: Tailwind v4 only scans the consuming project by default, so without it the CVA variants baked into this package (e.g. `bg-primary`, `text-primary-foreground`) would not get their utilities generated when the web app builds.
- 19 colour tokens, all expressed in OKLCH, listed digit-exact in the Enums section below.
- One sizing token: `--radius: 0.625rem;` (line 39).
- `@layer base` (lines 42–56): `*` gets `border-[color:var(--color-border)]` (default border colour = the border token); `body` gets `bg-[color:var(--color-background)] text-[color:var(--color-foreground)]` + `font-feature-settings: "rlig" 1, "calt" 1;`; native date/time picker indicators get `filter: invert(0.85)` so they're visible on the dark field.
- One keyframe: `@keyframes cp-layer-in` (lines 59–68) — `opacity 0→1` + `transform scale(0.98)→scale(1)`; consumed only by `control-panel.tsx:138` as `animate-[cp-layer-in_200ms_ease-out]` for the quadrant-grid layer switch.

### The hex-mirror sync point (`og-image.tsx`, `manifest.ts`, `layout.tsx`, `icon.svg`, `global-error.tsx`, `capacitor.config.ts`)
- These surfaces render before/outside the CSS cascade (Satori build-time PNGs, the manifest JSON, the `<meta name="theme-color">`, a static SVG, the root-layout error boundary that supplies its own `<html>`, and the native splash). They therefore cannot read `var(--color-*)`; each repeats the token value as a literal hex/rgba.
- `og-image.tsx` constants (lines 13–17, each comment naming the token it mirrors):
  - `BACKGROUND = "#0d061e"` — mirrors `--color-background` / themeColor
  - `FOREGROUND = "#f7ecf3"` — mirrors `--color-foreground` (off-white pink)
  - `MUTED = "#b29ab0"` — mirrors `--color-muted-foreground`
  - `MAGENTA = "rgba(255, 0, 140, 0.92)"` — "primary glitch channel" (a LITERAL aberration colour, NOT a direct mirror of `--color-primary`)
  - `CYAN = "rgba(0, 220, 255, 0.92)"` — "accent glitch channel" (literal, NOT a direct mirror of `--color-accent`)
- `manifest.ts` (lines 12–13): `background_color: "#0d061e"` and `theme_color: "#0d061e"` — both mirror `--color-background`.
- `layout.tsx` (line 37): `viewport.themeColor = "#0d061e"` — mirrors `--color-background`.
- `icon.svg` (lines 3, 14–16): base `fill="#0d061e"`; three stacked `404` texts at `fill="#ff008c"` (magenta channel), `fill="#00dcff"` (cyan channel), `fill="#f7ecf3"` (foreground). Note: the SVG uses the SOLID hexes `#ff008c`/`#00dcff` while `og-image.tsx` uses the alpha-0.92 rgba forms of the same RGB — same colour intent, different opacity.
- `global-error.tsx` (lines 36, 37, 64): `background: "#0d061e"`, `color: "#f6eef7"`, button `background: "#ef1ec1"` with comment "Mirrors --color-primary oklch(0.65 0.27 340)".
- `capacitor.config.ts` (line 18): `SplashScreen.backgroundColor: "#0d061e"`.

### Token consumption surface
- Components reference tokens TWO ways: (a) Tailwind utility classes generated by `@theme` (`bg-primary`, `text-muted-foreground`, `border-input`, `bg-card`, `bg-popover`, `bg-accent`, `bg-secondary`, `bg-destructive`, `focus-visible:ring-ring`, etc.), and (b) raw `var(--color-*)` / `var(--radius)` inside arbitrary-value classes (e.g. `bg-[color:var(--color-border)]`, `rounded-[var(--radius)]`). Both forms appear; every defined token is consumed by at least one of them (verified — none orphaned).
- `--radius` is consumed in exactly one place outside globals.css: `control-grid.tsx:149` (`rounded-[var(--radius)]`). The shadcn primitives otherwise use literal Tailwind radius utilities.
- `cn()` (`utils.ts`) = `twMerge(clsx(inputs))` — every variant component composes its token utility classes through it.

## User actions & interactions
This is a non-interactive token/asset layer; it exposes no UI controls of its own. The only "interactions" are indirect / build-time:
- A maintainer EDITING any token in `globals.css` must MANUALLY re-sync the hex mirrors in `og-image.tsx`, `manifest.ts`, `layout.tsx`, `icon.svg`, `global-error.tsx`, and `capacitor.config.ts` — there is no automated derivation from OKLCH to the hex copies.
- Build-time generation: `opengraph-image.tsx` → `renderShareImage()` (1200×630 PNG), `twitter-image.tsx` → `renderShareImage()` (same artwork, `summary_large_image`), `apple-icon.tsx` → `renderSquareIcon(180)` (180×180 PNG). `manifest.ts` is auto-served by Next at `/manifest.webmanifest`; `icon.svg` is auto-linked as favicon.
- Runtime: next-themes (via `NeonAuthUIProvider`) sets `class="dark"` on `<html>`; `suppressHydrationWarning` on `<html>` silences the resulting hydration attribute mismatch. No theme TOGGLE is offered (dark-only).
- `global-error.tsx` "Try again" button calls `reset()` — that is the error-boundary action, not a token feature.

## States & presentations
The token layer itself has no data lifecycle, so most global-states rows do not apply. What DOES apply:
- **Populated (the only "happy" state):** tokens resolve from `@theme`; every screen reads `var(--color-*)` / generated utilities. Always dark.
- **Disabled / out-of-cascade fallback:** where CSS vars cannot resolve (Satori OG images, manifest JSON, `theme-color` meta, favicon SVG, mobile splash, the root `global-error.tsx` boundary), the hand-mirrored hexes stand in. `global-error.tsx` explicitly REPLACES the layout (root layout never rendered) and therefore cannot import the app CSS — hence its inline hex styling so the error page still "reads as us, not a browser default."
- **No light/dark variation:** dark-only; there is no `prefers-color-scheme`, no `.dark` override, no `forcedTheme`/`defaultTheme` config in `apps/web` (the dark class comes from the auth provider's bundled next-themes). Tokens are identical in every state.
- Gating / approval / onboarding states (invite-gated, onboarding-incomplete, pending-approval, rejected, captain-only-locked) are expressed by OTHER surfaces; the token layer only supplies the palette they paint with. NO offline/sync states, NO budget/over-target states.

## Enums, options & configurable values

### Colour tokens — digit-exact (`globals.css` lines 12–38)
| Token | OKLCH value | Role (from in-file comments) |
|---|---|---|
| `--color-background` | `oklch(0.15 0.05 295)` | midnight-violet base |
| `--color-foreground` | `oklch(0.97 0.02 330)` | off-white pink |
| `--color-primary` | `oklch(0.65 0.27 340)` | hot-magenta brand primary |
| `--color-primary-foreground` | `oklch(0.99 0.005 340)` | text on primary |
| `--color-muted` | `oklch(0.22 0.06 295)` | the auth-page surface |
| `--color-muted-foreground` | `oklch(0.7 0.05 325)` | muted text |
| `--color-card` | `oklch(0.26 0.08 295)` | one step lighter than muted (elevates above it; login-04 pattern) |
| `--color-card-foreground` | `oklch(0.97 0.02 330)` | text on card |
| `--color-popover` | `oklch(0.26 0.08 295)` | shares the card surface — same elevation, same colour |
| `--color-popover-foreground` | `oklch(0.97 0.02 330)` | text on popover |
| `--color-border` | `oklch(0.35 0.1 305)` | borders (also the `*` default border) |
| `--color-input` | `oklch(0.35 0.1 305)` | input border (same value as border) |
| `--color-accent` | `oklch(0.62 0.18 255)` | electric-blue second brand; highlights / focus haloes |
| `--color-accent-foreground` | `oklch(0.99 0.005 255)` | text on accent |
| `--color-secondary` | `oklch(0.42 0.18 320)` | deeper magenta-violet for non-primary buttons/pills (interactive but quieter than primary) |
| `--color-secondary-foreground` | `oklch(0.98 0.01 330)` | text on secondary |
| `--color-destructive` | `oklch(0.65 0.22 18)` | error/danger |
| `--color-destructive-foreground` | `oklch(0.98 0 0)` | text on destructive (pure neutral, chroma 0) |
| `--color-ring` | `oklch(0.65 0.27 340)` | focus ring (identical value to `--color-primary`) |

(19 colour tokens above — note `card`/`popover` and `card-foreground`/`popover-foreground` are deliberately identical pairs; `border`/`input` identical; `ring`/`primary` identical.)

### Sizing token
| Token | Value |
|---|---|
| `--radius` | `0.625rem` |

### Hex-mirror values (the literal copies maintained by hand)
| Hex | Mirrors | Used in |
|---|---|---|
| `#0d061e` | `--color-background` / themeColor | og-image (`BACKGROUND`), manifest `background_color` + `theme_color`, layout `themeColor`, icon.svg base, global-error `background`, capacitor splash `backgroundColor` |
| `#f7ecf3` | `--color-foreground` | og-image (`FOREGROUND`), icon.svg foreground glyph |
| `#f6eef7` | `--color-foreground` (DIFFERENT hex from above for the same token) | global-error `color` |
| `#b29ab0` | `--color-muted-foreground` | og-image (`MUTED`) |
| `#ef1ec1` | `--color-primary` `oklch(0.65 0.27 340)` | global-error button `background` |
| `rgba(255, 0, 140, 0.92)` | "primary glitch channel" | og-image (`MAGENTA`) |
| `#ff008c` | same RGB as MAGENTA, solid | icon.svg magenta glyph |
| `rgba(0, 220, 255, 0.92)` | "accent glitch channel" | og-image (`CYAN`) |
| `#00dcff` | same RGB as CYAN, solid | icon.svg cyan glyph |

### og-image / asset configurable values
- `SHARE_SIZE = { width: 1200, height: 630 }` (`as const`) — OG/Twitter card.
- `SHARE_CONTENT_TYPE = "image/png"`.
- `SHARE_ALT = "Camp 404 — a glitched 404 logo on a midnight-violet field. A calm command centre for a chaotic desert."`
- Apple icon size: `180` (px edge); `apple-icon.tsx` also exports `size = { width: 180, height: 180 }`, `contentType = "image/png"`.
- `Glitch404` params on share card: `fontSize={320} split={14} glow={80}`. On square icon: `fontSize = Math.round(size * 0.46)`, `split = Math.max(2, Math.round(size * 0.035))`, `glow` defaults `0`.
- Glyph styling: `fontWeight: 800`, `letterSpacing: -Math.round(fontSize * 0.05)`, `lineHeight: 1`. Glow shadow when set: `0 0 ${glow}px rgba(255,0,200,0.32)`.
- Share-card radial bloom: `radial-gradient(circle at 50% 46%, rgba(255,0,160,0.20), rgba(13,6,30,0) 58%)`.
- Share-card kicker text `letterSpacing: 18`, error line `letterSpacing: 8` with `textShadow: -2px 0 0 ${MAGENTA}, 2px 0 0 ${CYAN}`; tagline `fontSize: 32`, `letterSpacing: 2`.
- icon.svg: `viewBox="0 0 64 64"`, rect `rx="12"`, font-family `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`, `font-size="27"`, `font-weight="900"`, `letter-spacing="-1.5"`, glyph x-offsets `30.5 / 33.5 / 32`, all `y="42"`.

### manifest enum values (`manifest.ts`)
- `name: "Camp 404"`, `short_name: "Camp 404"`, `description: "A calm command centre for a chaotic desert."`, `start_url: "/"`, `display: "standalone"`.
- icons: `/icon.svg` (`sizes: "any"`, `type: "image/svg+xml"`, `purpose: "any"`) and `/apple-icon` (`sizes: "180x180"`, `type: "image/png"`, `purpose: "maskable"`).

### components.json (shadcn) config
- `style: "new-york"`, `rsc: true`, `tsx: true`, `tailwind.css: "src/styles/globals.css"`, `baseColor: "neutral"`, `cssVariables: true`, `prefix: ""`, `iconLibrary: "lucide"`. Aliases: components/ui → `@camp404/ui/components`, utils → `@camp404/ui/lib/utils`, hooks → `@camp404/ui/hooks`.

## Data model touched
None. The design-token system touches NO database table or persisted record — it is purely static CSS / build-time asset configuration. (Consistent with unit 29: no schema fields involved.) The only "interfaces" are TypeScript types on the asset routes: `MetadataRoute.Manifest` (manifest.ts), `Metadata` / `Viewport` (layout.tsx), `ImageResponse` (og-image.tsx), and `CapacitorConfig` (capacitor.config.ts).

## Validation, edge cases & business rules
- **Single source rule:** all colour/radius tokens live in exactly one `@theme` block; there is no per-entity hue table — entities are disambiguated by ICON + LABEL, never colour (e.g. `--color-primary` is the only "brand magenta"). Restyling MUST keep all 19 colour tokens + `--radius` named and resolvable, since utilities (`bg-*`, `text-*`, `border-*`, `ring-*`) and raw `var()` references depend on the exact token names.
- **Dark-only:** no light-theme tokens, no `.dark` override block, no `prefers-color-scheme`. The `dark` class on `<html>` is set by next-themes via the auth provider but has no CSS effect here (tokens live in `:root`-equivalent `@theme`). `suppressHydrationWarning` on `<html>` is required to absorb the class mismatch.
- **`@source` directive is mandatory:** removing it breaks every CVA variant utility baked into the UI package (Tailwind v4 won't scan the package otherwise).
- **HEX-MIRROR SYNC is manual and currently INCONSISTENT (ugly truth):**
  - The foreground token `--color-foreground oklch(0.97 0.02 330)` is mirrored as `#f7ecf3` in `og-image.tsx` + `icon.svg` BUT as `#f6eef7` in `global-error.tsx` — two different hexes for the same token.
  - `--color-primary oklch(0.65 0.27 340)` is mirrored as `#ef1ec1` in `global-error.tsx`, but the glitch "magenta channel" elsewhere is `#ff008c` / `rgba(255,0,140,0.92)` — a SEPARATE literal aberration colour, not the primary token. Anyone changing `--color-primary` must decide which (if any) hex mirrors to follow.
  - Editing any OKLCH token does NOT propagate to manifest/themeColor/icon/og/splash; those copies drift silently. This is the documented "sync point" and the place restyling is most likely to break.
- **Satori quirk:** `Glitch404` only sets `textShadow` when `glow` is truthy — comment: "Satori chokes on `textShadow: undefined`." Keep that guard.
- **Apple icon edge case:** iOS requires PNG and ignores transparency, so `renderSquareIcon` fills the midnight-violet background edge-to-edge.
- **icon.svg alpha mismatch:** the SVG uses solid `#ff008c`/`#00dcff` while `og-image.tsx` uses the 0.92-alpha rgba of the same RGB. Intentional (SVG renders crisply at 16px tab size) but means the two assets are not byte-identical in colour.
- `--color-border` == `--color-input` (`oklch(0.35 0.1 305)`) and `--color-ring` == `--color-primary` (`oklch(0.65 0.27 340)`) and `card` == `popover`; these equalities are by design — a restyle may diverge them but utilities must keep resolving.

## Sub-components / variants
- **`@theme` block** (`globals.css`) — token registry + utility generator. Not dead.
- **`@keyframes cp-layer-in`** (`globals.css`) — single animation, consumed by `control-panel.tsx:138` only. Not dead.
- **`renderShareImage()`** (`og-image.tsx`) — used by both `opengraph-image.tsx` and `twitter-image.tsx`.
- **`renderSquareIcon(size)`** (`og-image.tsx`) — used by `apple-icon.tsx` (size 180). The `size`-relative math (`* 0.46`, `* 0.035`, `Math.max(2, …)`) supports other edge lengths, but only 180 is wired today.
- **`Glitch404`** (`og-image.tsx`) — private helper shared by both renderers; the three stacked channel layers (magenta translated `-split`, cyan `+split`, foreground on top) reproduce the landing-page RGB-split chromatic aberration as one static frame.
- **`og-image.tsx` constants** `BACKGROUND`/`FOREGROUND`/`MUTED`/`MAGENTA`/`CYAN` — all referenced within the file; none orphaned.
- **Token tokens defined but referenced only via Tailwind utility classes (NOT via raw `var()`)** — `card-foreground`, `popover`, `popover-foreground`, `input`, `accent`, `accent-foreground`, `destructive-foreground`. Verified they ARE consumed (`bg-popover`, `border-input`, `bg-accent`, `text-card`, etc.), so NOT orphaned — flagging only because a raw-`var()` grep alone would falsely report them unused.
- **`cn()`** (`utils.ts`) — clsx + tailwind-merge merge helper; used by every variant component to compose token utilities. Not dead.
- **`global-error.tsx` inline styles** — a deliberate token DUPLICATE (not a variant); exists because the root error boundary renders without the layout/CSS.
