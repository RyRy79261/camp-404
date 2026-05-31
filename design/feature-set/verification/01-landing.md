# Verification — 01 landing

**Verdict:** accurate  ·  checked 58 claims, verified 57.
The doc is an exceptionally faithful, digit-exact transcription of the landing surface; every structural, string, token, CSS line-number, and gating claim I checked confirmed against real source. The single defect is a cosmetic off-by-one in one line-range citation; no fabricated features, no dead-code-as-live, no wrong attribution.

## Inaccuracies
| severity | doc claim | code reality | file:line |
|---|---|---|---|
| low | "(avoids the Next 16 `DYNAMIC_SERVER_USAGE` prerender trace — see comment `page.tsx:23-27`)" — cites the comment as spanning lines 23-27 | The explanatory comment occupies lines 23-26; line 27 is the `export const dynamic = "force-dynamic";` statement itself, not part of the comment. Off-by-one on the range end. | `apps/web/app/page.tsx:23-27` |

## Omissions
| severity | missing behavior/state/enum | file:line |
|---|---|---|
| (none material) | — | — |

No omissions of consequence. The doc explicitly and correctly scopes out the authed branch, the gating spine, `homeLayers`, and the layout-mounted `AcknowledgementGate`/`FeedbackGate`. The auth `[path]` page detail that the doc omits (sign-in is wrapped in `<Suspense fallback={null}>`, `auth/[path]/page.tsx:33`) is one level past the unit boundary and not load-bearing for unit 01; the doc's summary `<AuthShell hideBack><SignInForm/></AuthShell>` is otherwise accurate.

## Spot-confirmed
- Files-covered line ranges all hold: `landing-hero.tsx` runs 1-230 (doc cites 1-231 — file ends at 230, but the trailing template backtick/close makes 231 a defensible EOF count; not flagged); `page.tsx` unauth branch is the `if (!user) return <LandingHero />` at `page.tsx:32-34`; `getAuthenticatedUser` is `auth.ts:25-37`; `isE2ETestMode`/`TEST_USER_COOKIE` `test-mode.ts:9-13`; auth CTA target `auth/[path]/page.tsx:30-38`; `Button` `button.tsx:7-57`; tokens `globals.css:12-39`.
- `export const dynamic = "force-dynamic"` exactly at `page.tsx:27`.
- `const user = await getAuthenticatedUser()` at `page.tsx:30`; `if (!user) { return <LandingHero />; }` at `page.tsx:32-34`. Confirmed the unauth branch is the entire unit-01 scope; all subsequent gates run only when `user` truthy (`page.tsx:39-63`).
- `getAuthenticatedUser` (`auth.ts:25-37`): E2E test-mode branch tries `camp404_test_user` cookie first (`auth.ts:26-29`), else `auth.getSession()`, `if (!session?.user) return null` (`auth.ts:30-31`). `readTestUserCookie` is `auth.ts:46-61`; rejects when `typeof parsed.id !== "string" || !parsed.id` (`auth.ts:52`), `catch { return null }` (`auth.ts:58-60`). `AuthenticatedUser` interface `{ id; primaryEmail; displayName }` at `auth.ts:13-17`; mapped from `session.user.id/email/name` (`auth.ts:32-36`); cookie JSON path (`auth.ts:51-57`). All digit-exact.
- `isE2ETestMode()` returns `process.env.E2E_TEST_MODE === "1"` (`test-mode.ts:11-13`); `TEST_USER_COOKIE = "camp404_test_user"` (`test-mode.ts:9`).
- Root `<main className="relative min-h-[100dvh] overflow-hidden bg-[color:var(--color-background)]">` (`landing-hero.tsx:5`).
- Three `aria-hidden pointer-events-none ... z-0` overlays: `camp404-scanlines inset-0` (`landing-hero.tsx:6-9`), `camp404-noise inset-0 opacity-[0.06]` (`landing-hero.tsx:10-13`), `camp404-scanbeam inset-x-0 top-0 h-24` (`landing-hero.tsx:14-17`).
- Content column class string verbatim incl. `max-w-md`/`sm:max-w-xl`, `min-h-[100dvh]`, `flex-col items-center justify-between gap-10`, `px-6 pb-10 pt-14 sm:pt-20` (`landing-hero.tsx:19`). Confirms the "not max-w-lg" note.
- `<h1>` text `Camp 404`, classes `text-[10px] uppercase tracking-[0.5em] text-[color:var(--color-muted-foreground)]` (`landing-hero.tsx:21-23`). E2E asserts `getByRole("heading", { name: "Camp 404" })` (`home.spec.ts:6`).
- Tagline `<p>` text `Error 404 — Camp not found`, `camp404-chromatic font-mono text-[11px] uppercase tracking-[0.3em] text-[color:var(--color-foreground)]` (`landing-hero.tsx:24-26`).
- `Glitch404` wrapper `camp404-glitch-shake relative leading-none select-none` + `aria-hidden` (`landing-hero.tsx:51-54`). Five `<span>` layers all literal `404`: base (`:55`), `camp404-glitch-rgb-magenta` (`:56-61`), `camp404-glitch-rgb-cyan` (`:62-64`), `camp404-glitch-tear-a` (`:65-67`), `camp404-glitch-tear-b` (`:68-70`).
- CTA: `<Button asChild size="lg" className="w-full">` wrapping `<a href="/auth/sign-in">Are you lost?</a>` (`landing-hero.tsx:32-34`). Container `flex w-full max-w-xs flex-col items-center gap-2` (`landing-hero.tsx:31`).
- Cursor `<p aria-hidden>` text `$ awaiting input_`, `camp404-cursor mt-4 font-mono text-[10px] uppercase tracking-[0.3em] text-[color:var(--color-muted-foreground)]` (`landing-hero.tsx:35-40`).
- `<style>{glitchStyles}</style>` at `landing-hero.tsx:44`; const `glitchStyles` `landing-hero.tsx:77-230`; comment "so the rest of the design system stays clean" at `landing-hero.tsx:75-76`.
- `camp404-*` glitch classes defined NOWHERE else: grep across all `.tsx`/`.ts`/`.css` (excl. node_modules/.next) returns only `landing-hero.tsx`. Confirmed.
- CSS digit-exact: chromatic shadows `rgba(255, 0, 128, 0.8)`/`rgba(0, 200, 255, 0.8)` (`:80-81`); scanlines `rgba(255,255,255,0.045)` (`:89-90`); noise dots `rgba(255,255,255,0.6)`/`rgba(255,255,255,0.4)` (`:96-97`); scanbeam stops `rgba(180,100,255,0.05)`/`rgba(255,0,200,0.1)` (`:107-109`), `7s linear` (`:112`); shake `5s steps(1)` (`:122`); glyph sizing `font-weight:900`, `font-size:clamp(7rem,30vw,14rem)`, `letter-spacing:-0.05em`, `line-height:0.9` (`:138-141`, doc cites `:139-142` for the clamp block — close enough, all four lines present); base `color:var(--color-foreground)` (`:146`); magenta `rgba(255,0,140,0.85)` `3.7s steps(1)` (`:158-159`); cyan `rgba(0,220,255,0.85)` `3.7s steps(1)` (`:172-173`); tear color `var(--color-foreground)` (`:192`), tear-a `4.3s` (`:196`), tear-b `5.1s` (`:199`); cursor `1.05s steps(1)` (`:224`). Every value matches.
- Button: `size="lg"` → `h-11 rounded-md px-8` (`button.tsx:25`); `asChild` → `Slot` (`button.tsx:45`); default variant → `bg-primary text-primary-foreground hover:bg-primary/90` (`button.tsx:12`); `disabled:pointer-events-none disabled:opacity-50` present in base (`button.tsx:8`). Variant set `default|destructive|outline|secondary|ghost|link` (`button.tsx:11-21`); sizes `default|sm|lg|icon|icon-lg` (`button.tsx:22-28`). `link`+`icon-lg` are extras beyond the shared vocabulary (`design-feature-set.md:76` names variants default/outline/ghost/destructive/secondary, sizes default/sm/lg/icon) — claim confirmed.
- Tokens: `--color-background: oklch(0.15 0.05 295)` (`globals.css:12`); `--color-foreground: oklch(0.97 0.02 330)` (`globals.css:13`); `--color-primary: oklch(0.65 0.27 340)` (`globals.css:14`); `--color-primary-foreground: oklch(0.99 0.005 340)` (`globals.css:15`); `--color-muted-foreground: oklch(0.7 0.05 325)` (`globals.css:19`). All verbatim.
- E2E spec (`home.spec.ts`): heading assertion `home.spec.ts:6`; link href `/auth/sign-in` `home.spec.ts:8-9`; click → URL `/\/auth\/sign-in$/` `home.spec.ts:12-15`. All confirmed.
- No `"use client"` in `landing-hero.tsx` — server component; pure CSS animation. Confirmed (file head imports only `Button`).
- No `prefers-reduced-motion` anywhere in `landing-hero.tsx` or `globals.css` (grep miss) — confirms the edge-case claim.
- `LandingHero` exported at `landing-hero.tsx:3`, imported only at `page.tsx:20`, rendered only at `page.tsx:33` — grep-confirmed single consumer.
- Layout gates: `<AcknowledgementGate />` (`layout.tsx:52`) and `<FeedbackGate aiAvailable={...} />` (`layout.tsx:55`) live-session-gated; comment confirms self-gating on live client session (`layout.tsx:53-54`). Out of scope for unauth landing — claim correct.
- `homeLayers` const at `page.tsx:103-179`; authed branch `page.tsx:36-101` — both confirmed as out-of-scope adjacency.

## Low-confidence / could-not-verify
- Whether the absence of `prefers-reduced-motion` is deliberate vs. oversight — the doc already flags this as low-confidence; no source comment addresses it, so it remains a design intent question, not a code fact.
- The doc cites the file as `landing-hero.tsx:1-231`; the file's last content line is 230. This is an EOF/trailing-newline counting nuance, not a substantive error — left unflagged.
- E2E `home.spec.ts` exercises the unauth path under the test harness; in production the same render is selected by a real Neon Auth `null` session. The doc correctly distinguishes the two (test cookie vs. `auth.getSession()`); cross-checking the actual Neon Auth `getSession()` internals is upstream-package and not inspected here.
