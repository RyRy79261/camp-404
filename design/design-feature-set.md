<!-- AUTO-ASSEMBLED from design/feature-set/*.md. Regenerate by re-running scripts/assemble-feature-set.mjs. Do not hand-edit. -->

# Camp 404 — Totalistic Design Feature-Set Brief

**Assembled:** 2026-06-01  ·  **Status:** generated build artifact (do not hand-edit)

**How to read:** treat every feature / action / state / enum / value below as a requirement to PRESERVE in any redesign — restyle freely, but DROP NO FUNCTIONALITY. Edit the per-unit sources in design/feature-set/, then re-run scripts/assemble-feature-set.mjs. See design/feature-set-verification-report.md for the adversarial accuracy audit.

---

# 00 — Overview / Cross-Cutting Frame

**Status:** Functional contract (source-grounded, digit-exact). This is the cross-cutting frame for the totalistic Camp 404 feature-set brief — a *what-must-exist* spec, never a visual one. Restyle freely; drop no functionality.
**Audience:** Anyone rebuilding, restyling, or re-platforming a Camp 404 surface (designer, design-to-code agent, engineer). Read this first, then the one or two unit docs for the surface you are touching.
**Companion:** `docs/design/camp-404-design-system-port-briefing.md` (the Pencil capture + generation pipeline — *how it looks*) and `docs/design-system.md` (the `@camp404/ui` token + component reference). This overview and the 30 unit docs are the *functional* half; the briefing is the *visual* half. When they disagree: the unit doc wins on what must exist, the companion brief wins on tone, you win on how it looks. <!-- low-confidence: docs/design/camp-404-design-system-port-briefing.md is named as companion by docs/feature-set-analysis-playbook.md:4 but does not exist at that path in the repo; docs/design-system.md does exist and is the live token/component reference. -->
**Read-order:** §1 (what it is + north-star) → §2 (entities + identity) → §3 (shared primitives) → §4 (global-states matrix) → §5 (information architecture) → §6 (unit index) → §7 (the DROP-NO-FUNCTIONALITY contract).

---

## 1 — What Camp 404 is, and its job

Camp 404 is a **mobile-first, dark-only, invite-only internal app for one Afrikaburn theme camp** of roughly 30–80 people. It is the camp's single operational command centre: it onboards new members behind an invite gate, captures their long-lived "burner profile", routes captain announcements and reminders, organises people into working teams, tracks reimbursements / inventory / tasks / meals, and lets a captain vet, broadcast to, and manage the roster — all from a phone in a desert with patchy signal.

It is built **server-only**: Neon Postgres + Drizzle for data (`packages/db/src/schema.ts`), Neon Auth (Better Auth) for identity/sessions (`apps/web/lib/neon-auth.ts`, surfaced through `apps/web/lib/auth.ts:25`), with an in-memory `globalThis` test store (`apps/web/lib/test-store.ts`) backing `E2E_TEST_MODE`. Rendering is Next.js App Router server components that read the session cookie on every request (`apps/web/app/page.tsx:27` `dynamic = "force-dynamic"`). There is **no client-side data layer, no IndexedDB, no offline sync** — the source of truth is always the server.

Two assigned **ranks** exist and only two: `captain` and `member` (`packages/db/src/schema.ts:31`). Every other "role" is **derived at read time, never stored**: *team-lead* from `team_memberships.is_lead` on any team (`schema.ts:455`, derived via `isTeamLead` `apps/web/lib/users.ts:244`), and *driver* from `driver_profiles.intends_to_drive` (`schema.ts:397`). A `captain` carries god rights in-app.

### Design north-star

> **Camp 404 is a calm command centre for a chaotic desert: every screen must let a tired, sunburnt, one-handed phone user answer "what do I need to do, and who needs what from me?" in seconds, complete that action in a tap or two or by holding the mic and talking, and never strand them behind a gate with nowhere to go.**

The principles that flow from it:
- **The gate always has an exit.** Every blocking state (invite-gated, onboarding-incomplete, pending-approval, rejected) names exactly where the user goes next or how they escape — `nextGate` deliberately skips any pending action with no built route so a user can never be stranded behind a gate that has nowhere to send them (`apps/web/lib/required-actions.ts:23-30`); onboarding step 1 offers a "Sign out" escape (`apps/web/components/questionnaire/wizard.tsx:239-244`).
- **Rank is clearance, not a wall.** Layers above the viewer's rank stay *visible but locked*, so a member can see what a captain's tools look like without their contents (`packages/ui/src/components/control-panel.tsx:118`, `:333`).
- **Voice is a first-class input, not a gimmick.** Any long-form field can be dictated; the mic is the centre of the home control panel (`control-panel.tsx:194`, `recorder-panel.tsx`).
- **Server is truth; the UI is a thin, honest mirror.** No optimistic local cache to reconcile; what renders is what the DB says.

**Explicit anti-scope (do NOT build):**
- **No offline-first / sync model.** No offline indicator, no sync/queued/conflict/stale states, no local mutation log. (See §4 — all sync rows are dropped.)
- **No budgets / goals / over-target accumulators.** `team_budgets` exists as a plain assigned-vs-perceived note (`schema.ts:723`), not a goal the UI tracks toward; there are **no over-target / over-limit states**.
- **No per-entity colour theming.** One global brand palette only (§2). Do not invent a hue-per-team or hue-per-entity table.
- **No public/marketing surface beyond the unauthenticated landing hero.** This is an internal tool; the only un-gated screen is the 404-themed landing and the auth shells.
- **No engagement/gamification loops, streaks, or notifications-for-the-sake-of-it.** Notifications are operational (announcements, reminders, directives), governed by a presentation contract (§3).
- **No finance system.** Reimbursements are a *log*; payment happens offline (`schema.ts:669-717`).

---

## 2 — First-class entities + identity

Camp 404 is **single-palette and dark-only**. The single source-of-truth token file is **`packages/ui/src/styles/globals.css`** — one OKLCH `@theme` block (also mirrored, with role glosses, in `docs/design-system.md`). There is **NO per-entity hue table** and you must not manufacture one: hot-magenta `--color-primary` is the dominant brand colour and electric-blue `--color-accent` the supporting accent; every entity is disambiguated by **icon + label**, never by colour.

The brand palette (verbatim from `globals.css:9-39`): `--color-background oklch(0.15 0.05 295)` (midnight-violet) · `--color-foreground oklch(0.97 0.02 330)` · `--color-primary oklch(0.65 0.27 340)` (hot magenta) · `--color-secondary oklch(0.42 0.18 320)` · `--color-accent oklch(0.62 0.18 255)` (electric blue) · `--color-muted oklch(0.22 0.06 295)` · `--color-card oklch(0.26 0.08 295)` · `--color-border`/`--color-input oklch(0.35 0.1 305)` · `--color-destructive oklch(0.65 0.22 18)` · `--color-ring oklch(0.65 0.27 340)` · `--radius 0.625rem`. The only bespoke colour outside the tokens is the landing hero's glitch CSS (chromatic magenta/cyan RGB-split — `apps/web/app/landing-hero.tsx:77+`), which references the tokens for its base.

The organizational entities each get an `{icon, label}` identity (icons are `lucide-react`, observed in source):

| Entity | Icon (lucide) | Label | Backed by |
|---|---|---|---|
| **User / rank** | `UserRound` / `User` | "Camp Member" · "Team Lead" · "Captain" (`RANK_LABEL`, `control-panel.tsx:18`) | `users` (`rank`, `approval_status`) |
| **Invite code** | `Mail` / `Shuffle` (mint) | "Invite code" | `invite_codes` |
| **Questionnaire / form** | `ClipboardList` | "My forms" / "burner profile" | `burner_profiles`, `questionnaire_activations`, `required_actions` |
| **Broadcast / notification** | `Bell` (feed), `Megaphone` (announcement/acknowledge), `MessageSquare` (team message) | "Notifications" / "Camp announcement" | `broadcasts`, `notification_deliveries` |
| **Team** | `Users` | per-team label ("Kitchen", "Structures", …) | `team` enum, `team_memberships` |
| **Referral (family tree)** | `GitBranch` | "Family tree" | `invite_codes.created_by_user_id` graph |
| **Tools** | `Wrench` | "Tools" | route hub |
| **Tasks** | `ListChecks` | "My Tasks" / "Team Tasks" / "Camp Tasks" | `tasks` |
| **Push-to-talk / voice** | `Mic` | "TALK" | voice pipeline |

Rank carries a clearance ordering (`camp_member` < `team_lead` < `captain`, `RANK_ORDER` `control-panel.tsx:16`) but **rank identity must never encode a value/status** — approval status (`pending`/`approved`/`rejected`) is a *separate* axis (`schema.ts:41`), surfaced by its own gate screens, not by recolouring the rank.

---

## 3 — Shared component patterns

The `@camp404/ui` package (shadcn/ui-style: Radix primitives + Tailwind v4 CVA variants + OKLCH tokens) supplies the primitives every unit re-skins but must keep. Class-merge is `cn()` (`packages/ui/src/lib/utils.ts`); all colour is `var(--color-*)`, never hex.

- **`@camp404/ui` primitives** (`packages/ui/src/components/`) — `avatar` (initials fallback over `--color-secondary`), `button` (CVA variants `default`/`outline`/`ghost`/`destructive`/`secondary`, sizes `default`/`sm`/`lg`/`icon`, `asChild` via Radix `Slot`), `card`, `checkbox`, `combobox`, `command`, `dialog`, `input`, `label`, `popover`, `select`, `slider`, `textarea`. **Non-negotiable:** these are the input *kinds* — a redesign re-skins them but must not change a slider into a dropdown, a toggle into a free-text field, etc. **Used by:** every screen.
- **Control Panel + Control Grid + Quadrant Nav** (`control-panel.tsx`, `control-grid.tsx`, `quadrant-nav.tsx`) — the bespoke home navigation. A 2×2 quadrant grid of tiles per **rank layer** (member → team-lead → captain), a circular **push-to-talk centre** (~22% panel width, `control-panel.tsx:205`), and a bottom **layer tab bar** that cycles rank views. **Non-negotiable:** layers above the viewer's rank render **visible but locked** (opacity-45, lock icon, non-interactive — `control-panel.tsx:331-338`). `control-grid.tsx` is a *prepared, not-yet-wired* desktop counterpart that would show all layers at once as dotted/inactive sections above the viewer's rank (`control-grid.tsx:50`); it is **Storybook-only / dead** — its sole importer is `control-grid.stories.tsx:13` and it has **zero app consumers**, so treat it as prepared-only, parity with the `quadrant-nav.tsx` v0 caveat below. Tiles take `{label, hint, href, icon, badge}`; the badge is a numeric pill that hides on falsy/0. **Used by:** Home (06) — via `control-panel.tsx` only — and the rank model echoes through captain surfaces (14–16). **Caveat:** `ControlPanelRank` is UI-local (`camp_member`|`team_lead`|`captain`) and reconciled in `app/page.tsx:73` against the stored `rank` + derived team-lead; both `control-grid.tsx` (Storybook-only) and `quadrant-nav.tsx` are flagged v0/prepared-only in `docs/design-system.md`.
- **Questionnaire wizard + field machine** (`apps/web/components/questionnaire/wizard.tsx`, `question.tsx`) — a page-at-a-time step machine with a top progress bar ("Step N of M", `wizard.tsx:263`), per-page **local validation before advance** (required + cross-field id-number-vs-id-type, `wizard.tsx:79-101`), optional per-page persistence (`persistProgress`), and a `_form`/`_root` error-banner contract for non-field failures (`wizard.tsx:21-24`). A lone optional unanswered question shows **"Skip"** instead of "Next" (`wizard.tsx:160-172`). **Non-negotiable field kinds** (the renderer's `switch`, `question.tsx:100-241`): `slider`, `single_select`, `multi_select`, `short_text`, `long_text`, `date`, `scale` (vertical full-height on mobile, horizontal on md+), `toggle` (segmented control), `combobox` (searchable, e.g. countries), `image` (avatar upload). **Used by:** Onboarding (04), My forms / replay (12), every future activated questionnaire (20).
- **Voice dictation pipeline** (`apps/web/components/voice/` — `use-voice-recorder.ts`, `recorder-panel.tsx`, `waveform.tsx`, `dictate-button.tsx`; server `apps/web/app/api/voice/transcribe/route.ts`, prompts `apps/web/lib/voice-prompts.ts`). **Non-negotiable:** a bordered panel with a big circular record button, live waveform, mm:ss timer, and states `requesting`→`recording`→`processing`→`error`; each completed transcript **appends** to the host field (so typing + dictation mix), keyed by a server-known `promptKey`. **Used by:** any `long_text` question (12/20), the bug/feedback dialog (25), and the home centre TALK button as the entry metaphor (06/21).
- **Global feedback layer** (mounted once in `app/layout.tsx:52-55`): the **`AcknowledgementGate`** (full-screen takeover for `presentation = 'acknowledge'` deliveries — scroll the whole message, Acknowledge sits at the *end* of the scroll, polls every 45 s + on focus, `acknowledgement-gate.tsx`) and the **`FeedbackGate`** (shake-to-report → bug/feature dialog, gated on a live client session, files a GitHub issue, optional "Improve with AI", `feedback-gate.tsx` + `components/feedback/report-bug-dialog.tsx`). **Non-negotiable:** these are app-wide, render nothing for logged-out visitors, and never write the report to the camp DB. **Used by:** every authenticated screen (25), notifications (09/27), error boundaries (`app/error.tsx`, `global-error.tsx`, `not-found.tsx`).

---

## 4 — Global states matrix

Every screen must express the **always-needed** rows plus the Camp-404 **gating** rows. There are **no sync rows** (server-only) and **no budget/over-target rows** (no goals).

| State | What it means | Required grammar |
|---|---|---|
| **Empty** | No rows for this surface yet (empty inbox, no forms, no roster) | Calm empty copy + the primary next action; never a dead blank. |
| **Loading** | Server component / fetch in flight | Shape-matched skeletons or a quiet spinner (`Loader2` animate-spin), not a jarring flash. |
| **Populated** | Data present | The normal content render. |
| **Validation-error** | A field or cross-field rule failed pre-submit | Inline message under the field (`role="alert"`, `question.tsx:78`) + required-marker `*`; banner (`_form`/`_root`) for page-level failures. |
| **Submitting / pending** | A mutation/server action is in flight | Disable the submit control, spinner in-button (`isPending`, `wizard.tsx:255`); inputs stay readable. |
| **Success** | Mutation succeeded | Confirmation (toast / inline check / server redirect); ack-gate advances to next item. |
| **Disabled** | A control is not currently actionable | Greyed + non-interactive; explain *why* where non-obvious. |
| **Invite-gated** | Signed in but no invite code redeemed (and not a god email) | Bounce to `/signup/required` invite gate (`app/page.tsx:40`, `hasCampAccess` `users.ts:219`); "invite-only — drop your code below". |
| **Onboarding-incomplete** | A pending blocking `required_action` with a built route (today: `burner_profile`) | Redirect to that gate's bespoke page (`nextGate` → `/onboarding/questionnaire`, `required-actions.ts:7`, `app/page.tsx:47`); wizard offers a sign-out escape on step 1. |
| **Pending-approval** | Redeemed a vetting-required code; `approval_status = 'pending'` | Held behind `/pending-approval` after onboarding (`app/page.tsx:61`, `isApproved` `users.ts:231`); `Clock` icon, "awaiting a captain". |
| **Rejected** | Captain denied; `approval_status = 'rejected'` (terminal) | Terminal denied screen (`ShieldX`); no path back into the app. |
| **Captain-only-locked** | Viewer's rank is below a surface/layer's required rank | Render the surface **visible but locked** — dimmed, lock icon, non-interactive (`control-panel.tsx:333`; the same pattern is prepared in the Storybook-only/dead `control-grid.tsx:151`, no app consumers); "View only". |

---

## 5 — Information architecture

Route → Screen → Units, in nav order (routes from `apps/web/app/**`):

| Route | Screen | Units |
|---|---|---|
| `/` (unauth) | Landing hero (glitch 404) | 01 |
| `/auth`, `/auth/[path]` | Auth shells (sign-in / sign-up / recovery) | 02 |
| `/signup/required` | Invite gate & code redemption | 03 |
| `/onboarding/questionnaire` | Onboarding questionnaire wizard | 04, 20, 21, 22 |
| `/pending-approval` | Pending / rejected approval gate | 05 |
| `/` (authed) | Home — role-based control panel | 06, 19 |
| `/profile` | Profile view | 07 |
| `/profile/edit` | Profile edit + delete account | 08, 22 |
| `/notifications` | Notifications inbox | 09, 27 |
| `/tools` | Tools hub | 10 |
| `/tools/invite` | Invite tool (mint codes) | 11 |
| `/tools/forms`, `/tools/forms/[key]` | My forms + form replay | 12, 20 |
| `/family-tree` | Family tree referral graph | 13 |
| `/captains/camp-management` | Captain roster & member detail | 14 |
| `/captains/announcements` | Captain broadcast composer | 15, 27 |
| `/captains/tools` | Captain tools hub | 16 |
| `/mcp/connect` | MCP connect / consent | 17 |

**Cross-cutting / screenless units.** Several units back no single route: the `@camp404/ui` catalog (18) and the Control Panel/Grid/Quadrant nav primitives (19); the questionnaire field renderer (20) and voice pipeline (21) shared across forms; the avatar/image pipeline (22, via `/api/avatar`, `/api/uploads/avatar`); the auth/session/access-control gating chain (23, `lib/auth.ts` → `users.ts` → `access-control.ts` → `required-actions.ts`); the app shell + global chrome (24, `layout.tsx`, `providers.tsx`, headers, error boundaries, manifest/icons); the global dialogs & feedback layer (25); the push opt-in + delivery and the broadcast→delivery→inbox engine (26, 27, via `/api/push/*`, `/api/notifications/*`, the dispatch/push/reminders crons); the canonical data model & enums (28 tokens, 29 schema); and the E2E test-mode seam (30, `/api/test/*` + `lib/test-store.ts`).

---

## 6 — Index of the 30 unit docs

01 — Landing Hero (unauthenticated)
02 — Auth shells — sign-in / sign-up / recovery
03 — Invite gate & code redemption
04 — Onboarding questionnaire wizard (step machine)
05 — Pending / rejected approval gate
06 — Home — role-based control panel
07 — Profile view
08 — Profile edit + delete account
09 — Notifications inbox
10 — Tools hub
11 — Invite tool (mint codes)
12 — My forms + form replay
13 — Family tree referral graph
14 — Captain camp management — roster & member detail
15 — Captain announcements / broadcast composer
16 — Captain tools hub
17 — MCP connect / consent screen
18 — @camp404/ui component catalog
19 — Control Panel / Control Grid / Quadrant Nav
20 — Questionnaire field renderer — all question kinds
21 — Voice dictation pipeline
22 — Avatar upload & image pipeline
23 — Auth, session & access-control gating chain
24 — App shell, layout & global chrome
25 — Global dialogs & feedback (ack-gate, shake-to-report, error)
26 — Push notifications opt-in & delivery
27 — Broadcast → delivery → inbox engine
28 — Design token system
29 — Canonical data model & enums
30 — E2E test-mode seam (/api/test/*)

---

## 7 — The "DROP NO FUNCTIONALITY" contract

A redesign reimagines how Camp 404 looks; it must not remove what Camp 404 does.

**You may freely change:** layout & grid, colour & theming within the single palette, visual hierarchy, typography, iconography, motion/animation, the navigation metaphor (the quadrant control panel is one expression of rank-layered nav, not the only one), and the *style* of inputs — as long as the input **kind** survives (a `slider` may be re-skinned but not turned into a number field; a `toggle` segmented control may be restyled but not turned into a dropdown; the push-to-talk centre may move but voice input must remain reachable).

**You must preserve — drop NO functionality:**
1. **Every feature** in each unit's Features section.
2. **Every action** in each unit's User-actions section.
3. **Every state** in each unit's States section *and* the §4 global matrix — design each one, not just the happy path. In particular: empty, loading, validation-error, submitting, success, disabled, and all five gating states (invite-gated, onboarding-incomplete, pending-approval, rejected, captain-only-locked).
4. **Every enum / option / value** in each unit's Enums section — the UI must represent exactly the values in `packages/db/src/schema.ts` and the questionnaire catalogue (`apps/web/lib/questionnaire.ts`): no more, no less. (Ranks `captain`|`member`; approval `pending`|`approved`|`rejected`; the 8 `team` values; broadcast `presentation` `acknowledge`|`popup`|`feed`; the 10 question kinds; etc.)
5. **Every validation rule and edge case** in each unit's Validation section (required fields, id-number-vs-id-type cross-validation, invite-code atomic claim / race-loser, append-not-overwrite dictation, 45 s ack-gate poll with stale-response superseding).
6. **The single dark palette + redundant-channel rule** — colour is never the sole carrier of meaning; keep icon + label; do not introduce a per-entity hue table; do not recolour rank to encode approval status.

**Camp 404 structural invariants (must hold across any redesign):**
- **Rank model is exactly `captain` | `member`, with team-lead and driver DERIVED at read time, never stored** (`schema.ts:31`, `:455`, `:397`; `isTeamLead` `users.ts:244`).
- **The gating spine is ordered and exit-bearing:** authenticated? → invite-gated (`hasCampAccess`) → onboarding-incomplete (`nextGate` over pending blocking `required_actions`) → pending/rejected approval (`isApproved`) → app. Each gate either lets the user through, sends them to a built route, or offers an escape; `nextGate` never routes to a gate with no page (`app/page.tsx:29-63`, `required-actions.ts:23-30`).
- **Single global dark palette** from one `@theme` in `globals.css`; restyle within it.
- **Server-only:** no client data layer, no offline/sync states, no optimistic local cache; the E2E test seam (`/api/test/*` + in-memory `testStore`) is the only non-DB backend, and it is test-only.

*Conflict-resolution rule:* the unit doc wins on **what must exist**, the companion briefing wins on **tone**, and you win on **how it looks**.

---

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

---

# 02 — Auth shells — sign-in / sign-up / recovery

**Files covered:**
- `apps/web/app/auth/page.tsx` — bare `/auth` landing; post-OAuth verifier exchange lands here, forwards authed users home, others to `/auth/sign-in`.
- `apps/web/app/auth/[path]/page.tsx` — dynamic router for every `/auth/<path>`; dispatches `sign-up` / `sign-in` to bespoke forms and all other paths to Neon Auth's hosted `<AuthView>`.
- `apps/web/app/auth/sign-in-form.tsx` — bespoke email/password + Google sign-in form (`SignInForm`).
- `apps/web/app/auth/sign-up-form.tsx` — bespoke email/password + Google sign-up form (`SignUpForm`).
- `apps/web/components/auth-shell.tsx` — centred card chrome (`AuthShell`) wrapping the bespoke forms; optional Back button + footer.
- `apps/web/app/providers.tsx` — client `Providers` mounting `NeonAuthUIProvider` (drives `<AuthView>` navigation, theming, session-change refresh).
- Supporting (followed imports): `apps/web/lib/auth-client.ts` (`authClient`), `apps/web/lib/auth.ts` (`getAuthenticatedUser` / `getAuthenticatedUserOrRedirect`), `apps/web/lib/neon-auth.ts` (server `auth` instance), `apps/web/proxy.ts` (verifier→cookie middleware), `apps/web/app/api/auth/[...path]/route.ts` (Better Auth API handler), `apps/web/lib/test-mode.ts` + `apps/web/app/api/test/login/route.ts` (E2E bypass), `apps/web/app/landing-hero.tsx` (unauth entry CTA into the flow).

**Purpose:** The auth shells are the unauthenticated entry surface of Camp 404. They let a person create an account (email/password or Google) or sign in (email/password or Google), and they hand off password-recovery / reset / callback / sign-out / magic-link side-trips to Neon Auth's hosted UI. Sign-up is deliberately **open** — there is no invite-code field here; invite-only enforcement happens *after* auth at the `/signup/required` gate (unit 03), because Neon Auth (Google especially) creates an identity at sign-in time and cannot be blocked earlier. After a successful credential or social handshake the user is forwarded to `/` (home), which runs the gating spine (unit 23) to route them onward to `/signup/required`, `/onboarding/questionnaire`, or `/pending-approval` as required.

## Features

### Bare `/auth` landing (`app/auth/page.tsx`)
- Server component, `export const dynamic = "force-dynamic"` (`page.tsx:6`) — must read the session cookie set moments earlier by the proxy verifier exchange, so it cannot be statically prerendered.
- This is the path Neon Auth's social (Google) callback returns to with `?neon_auth_session_verifier=…` (`page.tsx:9-14`). The proxy middleware (`proxy.ts`) runs on `/auth` *before* this page, exchanges the verifier for a real session cookie, and only then renders this component. Without a page at `/auth`, Next would 404 the post-OAuth landing (`page.tsx:13-14`).
- Calls `getAuthenticatedUser()` (`page.tsx:21`):
  - If a user exists → `redirect("/")` (home, which routes onward) (`page.tsx:22`).
  - Otherwise → `redirect("/auth/sign-in")` (`page.tsx:23`).

### Dynamic auth path router (`app/auth/[path]/page.tsx`)
- Server component, `export const dynamic = "force-dynamic"`; `dynamicParams` left at default `true` so any auth subpath Neon Auth redirects to (error states, provider-specific paths) renders via the `<AuthView>` fallback rather than 404ing (`[path]/page.tsx:7-10`).
- Awaits `params` (`{ path: string }`, a Promise — Next 16 async params) (`[path]/page.tsx:12-17`).
- **`path === "sign-up"`** → renders `<AuthShell hideBack><SignUpForm /></AuthShell>` (`[path]/page.tsx:19-28`). Comment: sign-up is open; invite check happens post-auth at `/signup/required` (`[path]/page.tsx:20-22`).
- **`path === "sign-in"`** → renders `<AuthShell hideBack><Suspense fallback={null}><SignInForm /></Suspense></AuthShell>` (`[path]/page.tsx:30-38`). `SignInForm` is wrapped in `<Suspense>` because it reads `useSearchParams()`.
- **Any other `path`** (forgot-password, reset-password, callback, sign-out, magic-link, provider/error paths) → fallback to Neon Auth hosted UI: `<main …><AuthView path={path} /></main>` (`[path]/page.tsx:43-47`). Comment: "side trips we haven't (yet) built bespoke screens for" (`[path]/page.tsx:40-42`). Fallback `<main>` classes: `mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-center justify-center px-6 py-12`.
- `<AuthView>` imported from `@neondatabase/auth/react/ui` (`[path]/page.tsx:2`).

### Sign-in form (`app/auth/sign-in-form.tsx`)
- `"use client"` component `SignInForm`. Mirrors the intake-tracker `login-04` block; deliberately **no invite-code field** (`sign-in-form.tsx:11-15`).
- Reads `callbackURL` from `useSearchParams().get("callbackURL")`, sanitised via `safeCallbackUrl()` (`sign-in-form.tsx:26-27`).
- Subscribes to `authClient.useSession()` for `session` + `sessionPending` (`sign-in-form.tsx:28`).
- **Auto-forward effect** (`sign-in-form.tsx:38-43`): once session is no longer pending, if `session?.user` exists AND `callbackURL !== "/"`, calls `window.location.replace(callbackURL)`. Handles the social return-trip landing back here with an active session + a non-default `callbackURL` (without it the user would see the form despite being authenticated).
- **Email/password submit** (`handleSubmit`, `sign-in-form.tsx:45-77`): trims email; local validation (see Validation §); on pass calls `authClient.signIn.email({ email: trimmedEmail, password, callbackURL })`; on `result.error` sets the message (fallback `"Sign in failed"`) and clears loading; on success `router.replace(callbackURL)` then `router.refresh()`; `catch` shows `err.message` or `"Sign in failed"`.
- **Google sign-in** (`handleGoogle`, `sign-in-form.tsx:79-94`): clears error, sets loading, calls `authClient.signIn.social({ provider: "google", callbackURL: "/auth" })`. The return trip is always routed through `/auth` so the proxy verifier exchange fires before the session is read; `/auth/page.tsx` then forwards home (`sign-in-form.tsx:83-89`). `catch` → `"Google sign in failed"`.
- Fields: Email (`type="email"`, `autoComplete="email"`, placeholder `you@example.com`, `required`), Password (`type="password"`, `autoComplete="current-password"`, `required`). Both `disabled` while `loading`.
- "Forgot your password?" link → `/auth/forgot-password` (`sign-in-form.tsx:122-127`).
- Heading "Welcome back"; subtext "Sign in to your Camp 404 account." (`sign-in-form.tsx:99-102`).
- Submit button label: `"Signing in…"` while loading else `"Sign in"` (`sign-in-form.tsx:147`).
- "Or continue with" divider; outline button "Continue with Google" with inline `GoogleMark` SVG (`sign-in-form.tsx:150-169`, `174-188`).

### Sign-up form (`app/auth/sign-up-form.tsx`)
- `"use client"` component `SignUpForm`. Mirrors intake-tracker `login-04` block (`sign-up-form.tsx:11-17`).
- **No name field is asked.** Name is sent silently as the email to satisfy Better Auth's required `name` field; Camp 404's `displayName` is reconciled later from the burner profile if needed (`sign-up-form.tsx:13-17`, `49`).
- Local state: `email`, `password`, `confirmPassword`, `error`, `loading` (`sign-up-form.tsx:19-24`). No `useSession`/auto-forward effect (unlike sign-in) and no `callbackURL` query reading.
- **Email/password submit** (`handleSubmit`, `sign-up-form.tsx:26-63`): trims email; local validation incl. password-match (see Validation §); calls `authClient.signUp.email({ email: trimmedEmail, password, name: trimmedEmail, callbackURL: "/" })`; on `result.error` sets message (fallback `"Sign up failed"`); on success `router.replace("/")` then `router.refresh()`; `catch` → `"Sign up failed"`.
- **Google sign-up** (`handleGoogle`, `sign-up-form.tsx:65-81`): identical to sign-in's — `authClient.signIn.social({ provider: "google", callbackURL: "/auth" })`; comment notes `/auth` lands the verifier exchange, then home routes onward to the questionnaire (`sign-up-form.tsx:69-76`). `catch` → `"Google sign up failed"`.
- Fields: Email (`type="email"`, `autoComplete="email"`, placeholder `you@example.com`, `required`); Password (`type="password"`, `autoComplete="new-password"`, `required`); Confirm password (`type="password"`, `autoComplete="new-password"`, `required`). All `disabled` while `loading`.
- Heading "Create your account"; subtext "Set a password or continue with Google. We'll ask the rest in the questionnaire." (`sign-up-form.tsx:86-90`).
- Submit button label: `"Creating account…"` while loading else `"Create account"` (`sign-up-form.tsx:140`).
- "Or continue with" divider + outline "Continue with Google" + `GoogleMark` (`sign-up-form.tsx:143-162`).
- Footer: "Already have an account? Sign in" linking `/auth/sign-in` (`sign-up-form.tsx:164-172`).

### Auth shell chrome (`components/auth-shell.tsx`)
- `"use client"` `AuthShell({ children, className?, footer?, hideBack? })` (`auth-shell.tsx:10-29`). The login-04 shadcn block mirrored from intake-tracker; used by every credential/invite/handshake screen (`auth-shell.tsx:19-23`).
- Outer wrapper: `flex min-h-svh flex-col items-center justify-center bg-[color:var(--color-muted)] p-6 md:p-10` (`auth-shell.tsx:33`).
- Inner column: `w-full max-w-sm` merged with optional `className` via `cn()` (`auth-shell.tsx:34`).
- **Back button** rendered only when `!hideBack`: `Button variant="ghost" size="sm"` with `ArrowLeft` lucide icon + "Back" label; `onClick={() => router.back()}` (`auth-shell.tsx:35-47`). The bespoke sign-in/sign-up screens pass `hideBack` so it is suppressed for them.
- Card: `<Card className="overflow-hidden p-0"><CardContent className="p-6 md:p-8">{children}</CardContent></Card>` (`auth-shell.tsx:48-50`).
- Optional **footer** hint under the card: `<p className="px-6 pt-4 text-center text-xs …">{footer}</p>` (`auth-shell.tsx:51-55`). Passed live by the downstream invite gate: `footer="Camp 404 is invite-only."` (`signup/required/page.tsx:30`).

### Auth UI provider (`app/providers.tsx`)
- `"use client"` `Providers({ children })` mounting `<NeonAuthUIProvider>` from `@neondatabase/auth/react/ui` (`providers.tsx:3,10-24`).
- Props passed: `authClient={authClient}`, `navigate={router.push}`, `replace={router.replace}`, `onSessionChange={() => router.refresh()}`, `redirectTo="/"`, `Link={Link}` (Next `Link`) (`providers.tsx:14-21`).
- This provider powers the hosted `<AuthView>` fallback (navigation, redirect target, session-change refresh). It is mounted in the **root layout** wrapping all children alongside `<AcknowledgementGate />` and `<FeedbackGate aiAvailable={!!process.env.ANTHROPIC_API_KEY} />` (`app/layout.tsx:50-56`). `next-themes` (via this provider) sets `class="dark"` on `<html>` on the client; `suppressHydrationWarning` on `<html>` silences the mismatch (`app/layout.tsx:45-48`).

### Verifier→cookie proxy middleware (`proxy.ts`)
- `export default auth.middleware({ loginUrl: "/auth/sign-in" })` (`proxy.ts:10`). Runs Neon Auth's verifier-to-cookie exchange. **Only place** the exchange runs — without it social sign-in returns with a `session_verifier` in the URL but no session cookie ever gets set (`proxy.ts:3-5`).
- `config.matcher = ["/auth", "/auth/:path*", "/mcp/:path*"]` (`proxy.ts:12-18`). `/auth/*` covers the sign-in/sign-up round-trip; `/mcp/*` is the post-signin landing for the MCP OAuth flow (out of scope here). Protected routes do their own session check in their server components via `getAuthenticatedUser()` (`proxy.ts:6-9`).

### Better Auth API handler (`app/api/auth/[...path]/route.ts`)
- `export const { GET, POST } = auth.handler();` (`route.ts:8`) — catch-all proxying Better Auth's API surface: sign-in, sign-up, session, OAuth callbacks, etc. (`route.ts:3-7`). The bespoke forms' `authClient.signIn.email` / `signUp.email` / `signIn.social` calls hit `/api/auth/*` here.

### Server auth instance (`lib/neon-auth.ts`)
- `auth = createNeonAuth({ baseUrl, cookies: { secret, sameSite: "lax" } })` (`neon-auth.ts:25-35`). Cookie `sameSite: "lax"` (not strict) so cross-site top-level navigations carry the session cookie through the OAuth round-trip (`neon-auth.ts:29-33`).

### E2E test-mode auth bypass (`lib/test-mode.ts`, `app/api/test/login/route.ts`)
- `isE2ETestMode()` returns `process.env.E2E_TEST_MODE === "1"` (`test-mode.ts:11-13`). `TEST_USER_COOKIE = "camp404_test_user"` (`test-mode.ts:9`).
- `getAuthenticatedUser()` (`lib/auth.ts:25-37`): in E2E mode, reads `camp404_test_user` cookie (precedence, Neon Auth bypassed entirely); otherwise falls through to `auth.getSession()`. So in tests the bespoke forms are not exercised — auth is set directly via the cookie.
- `POST /api/test/login` (`api/test/login/route.ts:17-37`): gated on `isE2ETestMode()` (else 404); sets the `camp404_test_user` cookie (`httpOnly`, `secure` only in production, `sameSite: "lax"`, `path: "/"`, `maxAge: 60*60`). `DELETE` clears it. Production never sets `E2E_TEST_MODE`, so this route is never registered there (`test-mode.ts:3-7`).

## User actions & interactions
- **Enter the flow:** unauthenticated home renders `LandingHero` with a single CTA `<a href="/auth/sign-in">Are you lost?</a>` (`landing-hero.tsx:32-34`; contract pinned by `tests/e2e/home.spec.ts`).
- **Sign in (email/password):** type email + password, submit form / click "Sign in".
- **Sign in (Google):** click "Continue with Google" → OAuth → returns via `/auth`.
- **Sign up (email/password):** type email + password + confirm password, submit / click "Create account".
- **Sign up (Google):** click "Continue with Google" (same OAuth flow as sign-in).
- **Navigate sign-up ↔ sign-in:** "Already have an account? Sign in" link on sign-up (`/auth/sign-in`); no reciprocal link on sign-in (entry is only via landing CTA or direct URL).
- **Forgot password:** "Forgot your password?" link on sign-in → `/auth/forgot-password` → hosted `<AuthView path="forgot-password">`.
- **Recovery / reset / sign-out / magic-link / callback:** handled entirely by hosted `<AuthView>` for any `/auth/<path>` not equal to `sign-in`/`sign-up`.
- **Back:** `AuthShell` Back button (`router.back()`) — suppressed on sign-in/sign-up (`hideBack`); available on any shell mounted without `hideBack`.
- All inputs and both submit/Google buttons become **disabled while `loading`** during a submit attempt.

## States & presentations
Global-states rows that materialise on this surface:
- **Empty / initial:** fresh form, all fields blank, `error = null`, `loading = false`. Default render.
- **Loading / submitting:** `loading = true` — inputs + both buttons disabled; submit button text swaps to `"Signing in…"` / `"Creating account…"`.
- **Populated:** fields hold user-entered values (controlled inputs).
- **Validation-error:** `error` string set by local checks (empty email/password, mismatched passwords) → rendered in a `role="alert"` paragraph styled `text-[color:var(--color-destructive)]`; `loading` stays `false`, fields re-enabled.
- **Server error:** `result.error.message` (or fallback strings) or thrown-error message rendered in the same `role="alert"` slot; `loading` reset to `false`.
- **Success:** sign-in → `router.replace(callbackURL)` + `router.refresh()`; sign-up → `router.replace("/")` + `router.refresh()`; Google → browser navigates to OAuth and back through `/auth`.
- **Disabled:** the whole form (inputs + buttons) during in-flight submit.
- **Session-pending (sign-in only):** `useSession()` `isPending` short-circuits the auto-forward effect until the session resolves.
- **Already-authenticated re-render (sign-in only):** auto-forward effect `window.location.replace(callbackURL)` when a session exists with a non-default `callbackURL`.
- **`<Suspense fallback={null}>`** wraps `SignInForm` while `useSearchParams()` resolves (`[path]/page.tsx:33`).

Gating rows (invite-gated, onboarding-incomplete, pending-approval, rejected, captain-only-locked) are **NOT** expressed on this surface — sign-up is open and all post-auth gating lives downstream at `/`, `/signup/required`, `/onboarding/questionnaire`, `/pending-approval` (units 03 / 23). This surface only authenticates; it never inspects rank, invite, approval, or onboarding status.

## Enums, options & configurable values
- **Social provider:** `"google"` only (`signIn.social({ provider: "google" })`) — both forms (`sign-in-form.tsx:87`, `sign-up-form.tsx:73`).
- **Bespoke `[path]` branches:** `"sign-up"`, `"sign-in"`; everything else → hosted `<AuthView>` (`[path]/page.tsx:19,30,43`).
- **Fixed `callbackURL` targets:** Google sign-in/sign-up → `"/auth"`; email sign-up → `"/"`; email sign-in → the sanitised `?callbackURL` query (default `"/"`).
- **Hardcoded copy / labels:** Welcome back / Sign in to your Camp 404 account. / Signing in… / Sign in / Or continue with / Continue with Google / Forgot your password? / Create your account / Set a password or continue with Google. We'll ask the rest in the questionnaire. / Creating account… / Create account / Already have an account? / Sign in / Back / Are you lost? ($ awaiting input_) / Error 404 — Camp not found.
- **Input attributes:** email `type="email"` placeholder `you@example.com` autoComplete `email`; sign-in password autoComplete `current-password`; sign-up password + confirm autoComplete `new-password`; all `required`.
- **Local validation messages:** `"Email is required"`, `"Password is required"`, `"Passwords do not match"` (sign-up only).
- **Server-error fallback messages:** `"Sign in failed"`, `"Sign up failed"`, `"Google sign in failed"`, `"Google sign up failed"`.
- **`NeonAuthUIProvider` config:** `redirectTo="/"` (`providers.tsx:18`).
- **Proxy matcher:** `["/auth", "/auth/:path*", "/mcp/:path*"]`; `loginUrl: "/auth/sign-in"` (`proxy.ts:10,18`).
- **Cookie config:** server session `sameSite: "lax"` (`neon-auth.ts:33`); `TEST_USER_COOKIE="camp404_test_user"` with `maxAge: 60*60` (1 hour) (`api/test/login/route.ts:34`).
- **Env vars referenced:** `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` (≥32 chars), `E2E_TEST_MODE` (`==="1"`), `NODE_ENV`, `ANTHROPIC_API_KEY` (feedback gate, layout). Build placeholders: `PLACEHOLDER_BASE_URL="https://build-placeholder.neon-auth.invalid"`, `PLACEHOLDER_COOKIE_SECRET="build-placeholder-secret-build-placeholder-secret"` (50 chars) (`neon-auth.ts:21-23`).
- **`safeCallbackUrl` rules** (enumerated below in Validation): falsy → `/`; not starting with `/` → `/`; starting with `//` → `/`; else passthrough.

## Data model touched
This surface does **not** touch any Camp 404 Drizzle tables directly. It operates on the **Neon/Better Auth session/user**, read back into the app's `AuthenticatedUser` interface (`lib/auth.ts:13-17`):
- `AuthenticatedUser { id: string; primaryEmail: string | null; displayName: string | null }`.
- Mapped from `session.user`: `id ← session.user.id`, `primaryEmail ← session.user.email ?? null`, `displayName ← session.user.name ?? null` (`lib/auth.ts:30-36`).
- **Better Auth user fields written by the forms:** `email`, `password`, and `name` — where **`name` is set to the email string** on sign-up (`sign-up-form.tsx:49`). No first-class Camp 404 `name`/`displayName` is collected here; it is reconciled later from the burner profile.
- **`signIn.email` payload:** `{ email, password, callbackURL }`. **`signUp.email` payload:** `{ email, password, name, callbackURL }`. **`signIn.social` payload:** `{ provider, callbackURL }`.
- **E2E test user cookie** `camp404_test_user`: URL-encoded JSON `{ id, primaryEmail, displayName }` (`api/test/login/route.ts:22-35`); parsed shape requires non-empty string `id` (`lib/auth.ts:51-57`).
- Downstream camp tables (`camp_users`, `invite_codes`, `burner_profiles`, `required_actions`, etc.) are only touched by the gating spine on `/` (unit 23) and are out of scope here.

## Validation, edge cases & business rules
- **Sign-in local validation** (before any network call, `sign-in-form.tsx:49-57`): `email.trim()` must be non-empty (`"Email is required"`); `password` must be truthy (`"Password is required"`). No format/length checks beyond the browser's `type="email"` + `required`.
- **Sign-up local validation** (`sign-up-form.tsx:30-42`): same email + password presence checks, **plus** `password !== confirmPassword → "Passwords do not match"`. No minimum-length / strength rule is enforced client-side (server/Better Auth may impose its own).
- **`safeCallbackUrl(raw)` open-redirect guard** (`sign-in-form.tsx:17-22`): returns `"/"` if `raw` is null/undefined/empty; returns `"/"` if `raw` does not start with `"/"`; returns `"/"` if it starts with `"//"` (protocol-relative); otherwise returns `raw` verbatim. Prevents redirecting to off-site URLs after sign-in.
- **OAuth must round-trip through `/auth`:** both Google handlers force `callbackURL: "/auth"` so the proxy verifier→cookie exchange (`proxy.ts`) fires before any session read; landing directly on `/` would leave the user with a verifier but no session cookie (`sign-in-form.tsx:83-89`, `sign-up-form.tsx:69-76`, `proxy.ts:3-5`).
- **Sign-up is open by design:** no invite-code field; the comment explicitly states the invite gate is post-auth at `/signup/required` because Neon Auth/Google create an identity at sign-in time (`[path]/page.tsx:20-22`, `sign-in-form.tsx:11-15`).
- **`name` defaults to email** to satisfy Better Auth's required field — an intentional shortcut, reconciled later from the burner profile (`sign-up-form.tsx:13-17,49`).
- **Sign-in auto-forward edge case:** only forwards when `callbackURL !== "/"`; a default `"/"` callback is left to the normal submit `router.replace` so a returning social user with no explicit target still gets routed by home's gating spine (`sign-in-form.tsx:38-43`).
- **Error precedence:** `result.error.message` is preferred; fallback string used when message is absent; thrown errors use `err.message` when an `Error`, else the generic fallback.
- **`loading` lifecycle:** set `true` before the network call; reset to `false` only on the error/catch branches — on success the page navigates away (replace+refresh) so `loading` is intentionally never reset (component unmounts).
- **Dynamic rendering forced** on both `/auth` pages (`force-dynamic`) because they read the just-set session cookie; `[path]` keeps `dynamicParams` true so unknown auth subpaths fall to `<AuthView>` instead of 404 (`page.tsx:6`, `[path]/page.tsx:7-10`).
- **Build resilience:** `createNeonAuth` uses placeholder base URL + ≥32-char placeholder secret so `next build` succeeds without env vars; any real request without env vars fails loudly at the Neon Auth API (`neon-auth.ts:18-35`).
- **E2E bypass safety:** the whole test-mode login/bypass is gated on `E2E_TEST_MODE==="1"`, which production never sets, so `/api/test/login` returns 404 and the bespoke forms / Neon Auth path are used in prod (`test-mode.ts:3-13`, `api/test/login/route.ts:18-20`).

## Sub-components / variants
- **`SignInForm`** (`app/auth/sign-in-form.tsx`) — bespoke email/password + Google sign-in; the only form reading `?callbackURL` and `useSession()` (for the auto-forward effect).
- **`SignUpForm`** (`app/auth/sign-up-form.tsx`) — bespoke email/password + Google sign-up; adds Confirm-password field; sends `name = email`.
- **`GoogleMark`** — inline 24×24 single-`<path>` Google "G" SVG, `fill="currentColor"`, `aria-hidden`; **duplicated verbatim** in both `sign-in-form.tsx:174-188` and `sign-up-form.tsx:177-191` (two identical copies, not shared).
- **`AuthShell`** (`components/auth-shell.tsx`) — reusable card chrome. The `footer` prop **is live**: the downstream invite gate passes `footer="Camp 404 is invite-only."` (`signup/required/page.tsx:30`), which renders the centred hint under the card. `hideBack` is passed `true` by every current caller — the bespoke sign-in/sign-up branches (`[path]/page.tsx:19,30`) plus the downstream `pending-approval` and `signup/required` gate screens — so the Back button never renders in the live flow today. `AuthShell` is the shared chrome "used by every page that asks for credentials, an invite code, or a similar handshake".
- **`<AuthView path={path}>`** (from `@neondatabase/auth/react/ui`) — hosted Neon Auth UI catch-all rendering forgot-password, reset-password, callback, sign-out, magic-link, and any error/provider subpath; no bespoke screen exists for these.
- **`Providers` / `NeonAuthUIProvider`** (`app/providers.tsx`) — wires the hosted `<AuthView>` to Next routing + session refresh; mounted once in the root layout, not per-auth-page.
- **`LandingHero`** (`app/landing-hero.tsx`) — not part of the shells proper but the sole live entry point into `/auth/sign-in` for unauthenticated visitors (CTA "Are you lost?"); pure-presentational glitch hero, no auth logic.
- **Server-only handlers/validators feeding this surface:** `auth.handler()` (`app/api/auth/[...path]/route.ts`) for the Better Auth API; `auth.middleware()` (`proxy.ts`) for the verifier exchange; `getAuthenticatedUser` (`lib/auth.ts:25-37`) — the only auth reader `/auth/page.tsx` imports and calls (`auth/page.tsx:2,21`); its sibling `getAuthenticatedUserOrRedirect` (`lib/auth.ts:40-44`) is used not by `/auth/*` but by the downstream **protected** pages (e.g. `signup/required/page.tsx:23`), redirecting unauthenticated callers to `/auth/sign-in`; `createNeonAuth` config (`lib/neon-auth.ts`); E2E `POST/DELETE /api/test/login` (`app/api/test/login/route.ts`).

---

# 03 — Invite gate & code redemption

**Files covered:**
- `apps/web/app/signup/required/page.tsx` — the post-auth invite-gate page (RSC); resolves the camp user, forwards anyone who already has access, otherwise renders the code-entry form.
- `apps/web/app/signup/required/invite-gate-form.tsx` — `"use client"` form (`InviteGateForm`) that takes an invite code, posts to the server action, and renders inline error / pending / sign-out affordances.
- `apps/web/app/signup/required/actions.ts` — `submitInviteCode` server action: per-user rate-limit, then `redeemInviteForUser`, then `redirect("/")` on success.
- `packages/db/src/invite-codes.ts` — DB layer for the `invite_codes` table: `findUsableInviteCode`, `consumeInviteCode` (atomic use-count increment), `createInviteCode`, `findInviteCodeByCode`; the `InviteCodeRow` interface and `AssignedRank` type.
- `apps/web/lib/access-control.ts` — `claimInviteCode` (env-code vs DB-code branch), `isGodEmail`, env-CSV parsing; bridges to the test store under E2E_TEST_MODE.
- (followed) `apps/web/lib/users.ts` — `ensureCampUser`, `redeemInviteForUser`, `hasCampAccess`, `isApproved`; the real/test backends and `toCampUser` mapping.
- (followed) `apps/web/lib/auth.ts` — `getAuthenticatedUserOrRedirect`, `AuthenticatedUser` shape.
- (followed) `apps/web/lib/rate-limit.ts` — in-memory token-bucket `rateLimit`.
- (followed) `apps/web/lib/test-mode.ts`, `apps/web/lib/test-store.ts` — E2E in-memory backend (invite codes + users).
- (followed) `apps/web/components/auth-shell.tsx` — `AuthShell` chrome wrapper the page renders into.
- (followed) `packages/db/src/schema.ts` — `inviteCodes`, `users`, `rankEnum`, `approvalStatusEnum`.
- (followed) `packages/db/src/burner-profile.ts` — `createCampUser`, `setUserInviteCode`, `setUserRank`, `setUserApprovalStatus`, `findUserByAuthId`.

**Purpose:** The post-auth invite gate. Neon Auth (Better Auth) cannot be stopped from minting an identity when someone signs in (Google especially), so the invite check happens *after* authentication rather than before sign-up. A signed-in user with no invite code on file lands on `/signup/required`, enters a code, and cannot progress to the questionnaire/approval gates until a valid code is claimed and stamped onto their camp row. The screen is the single redemption surface that turns "authenticated stranger" into "camp member": it validates the code (env bootstrap codes vs DB codes), atomically consumes a DB code's use-count, optionally stamps an `assignedRank`, and optionally drops the redeemer into the captain approval queue (`requiresApproval`). God-email accounts and anyone who already redeemed a code are short-circuited straight home.

## Features

### Invite-gate page (`signup/required/page.tsx`)
- `export const dynamic = "force-dynamic"` — reads the Neon Auth session via cookies, cannot be statically prerendered (page.tsx:8).
- `export const metadata = { title: "Invite required — Camp 404" }` (page.tsx:10-12).
- Flow (page.tsx:22-34): `getAuthenticatedUserOrRedirect()` → if unauthenticated, redirect to `/auth/sign-in` (auth.ts:42). Then `ensureCampUser(authUser)` resolves/creates the camp row (or a synthetic one). Then `hasCampAccess(campUser, authUser.primaryEmail)` — if **true**, `redirect("/")` (already past the gate; bounce home). Otherwise render `<AuthShell hideBack footer="Camp 404 is invite-only.">` wrapping `<InviteGateForm email={authUser.primaryEmail} />`.
- The page itself NEVER writes a row for a code-less user — `ensureCampUser` returns a synthetic non-persisted row for a non-god, no-invite user (users.ts:84-95), so visiting the gate leaves no orphan "signed in, no invite" record.

### Invite-code form (`invite-gate-form.tsx`)
- Wires `useActionState<SubmitInviteResult | null, FormData>(submitInviteCode, null)` → exposes `[state, formAction, isPending]` (form:15-18).
- Renders heading "One more thing"; body copy that, when `email` is non-null, reads `You're signed in as <email>.` (with a literal trailing space) followed by `Camp 404 is invite-only — drop your code below to come aboard.` When `email` is null, only the second sentence renders (form:22-36).
- Single text `<Input>` for the code: `id="invite-code"`, `name="code"`, `autoComplete="off"`, `spellCheck={false}`, `autoCapitalize="off"`, `autoCorrect="off"`, `required` (form:38-49), with a `<Label htmlFor="invite-code">Invite code</Label>`.
- Inline error: when `state && !state.ok`, renders `<p role="alert">` styled `var(--color-destructive)` showing `state.error` (form:51-55).
- Submit `<Button type="submit" className="w-full" disabled={isPending}>` — label `"Checking…"` while pending, `"Enter camp"` otherwise (form:57-59).
- Sign-out escape: a `variant="link"` `<Button asChild>` wrapping `<a href="/auth/sign-out">Sign out</a>` (form:61-67) — satisfies the "every gate has an exit" rule.

### `submitInviteCode` server action (`actions.ts`)
- `"use server"`. Signature `(_prev: SubmitInviteResult | null, formData: FormData) => Promise<SubmitInviteResult>` — note: only ever *returns* on failure; on success it `redirect`s (so the resolved type is effectively never, but is typed `SubmitInviteResult`) (actions.ts:17-43).
- `getAuthenticatedUserOrRedirect()` re-asserts auth server-side (actions.ts:21).
- **Rate limit** (actions.ts:25-34): ``rateLimit(`invite-redeem:${authUser.id}`, { limit: 10, windowMs: 10 * 60_000 })``. On exhaustion returns `{ ok: false, error: "Too many attempts — wait a few minutes and try again." }`. Per-user (not per-IP) because sign-up is open and an IP limit alone is evadable.
- Reads `formData.get("code")`; coerces non-string to `""` (actions.ts:36-37).
- Calls `redeemInviteForUser(authUser, code)`; on `!result.ok` returns `{ ok: false, error: result.error }`; on success `redirect("/")` (actions.ts:39-42). The home gate (`app/page.tsx`) then routes onward to questionnaire / pending-approval.

### `redeemInviteForUser` (`lib/users.ts`)
- Trims `rawCode`; empty → `{ ok: false, error: "Please enter an invite code." }` (users.ts:115-116).
- Picks backend by `isE2ETestMode()` (`testBackend` vs `realBackend`) (users.ts:118).
- Short-circuit (users.ts:122-124): if `isGodEmail(authUser.primaryEmail)` OR `existing?.inviteCode` is truthy → returns `{ ok: true }` **without** burning another use or re-stamping.
- `claimInviteCode(code)` → `null` becomes `{ ok: false, error: "That invite code isn't valid." }` (users.ts:126-127).
- **Existing row path** (users.ts:129-139): `setUserInviteCode(existing.id, claimed.code)`; if `claimed.assignedRank && claimed.assignedRank !== existing.rank` → `setUserRank`; if `claimed.requiresApproval && existing.approvalStatus !== "pending"` → `setUserApprovalStatus(existing.id, "pending")` ("only ever tightens access into the queue"). Returns `{ ok: true }`.
- **First-time path** (users.ts:144-152): `createUser({ authUserId, displayName: authUser.displayName ?? authUser.primaryEmail, inviteCode: claimed.code, rank: claimed.assignedRank ?? "member", approvalStatus: claimed.requiresApproval ? "pending" : "approved" })`, then `seedBurnerProfileAction(created.id)`, then `{ ok: true }`.

### `claimInviteCode` (`lib/access-control.ts`)
- Trims; empty → `null` (access-control.ts:46-47).
- **Env-code branch**: `isEnvCode(trimmed)` (membership in CSV `process.env.INVITE_CODES`) → returns `{ code: trimmed, assignedRank: null, requiresApproval: false }`. Pure validity check; never assigns a rank, never requires approval, never consumes (env codes are unlimited bootstrap codes) (access-control.ts:48-49, 59-61).
- **DB-code branch**: `consumeDbCode(trimmed)` (which routes to `testStore.consumeInviteCode` under E2E mode, else `dbConsumeInviteCode`); `null` → `null`. Otherwise returns `{ code: trimmed, assignedRank: consumed.assignedRank, requiresApproval: consumed.requiresApproval }` (access-control.ts:50-56, 63-68).
- `ClaimedInvite` interface: `{ code: string; assignedRank: AssignedRank | null; requiresApproval: boolean }` (access-control.ts:10-15).

### DB invite-code layer (`packages/db/src/invite-codes.ts`)
- `findUsableInviteCode(code)` — SELECT where `code` matches AND `revokedAt IS NULL` AND (`expiresAt IS NULL` OR `expiresAt > now`) AND (`maxUses IS NULL` OR `maxUses > useCount`); returns the row or `null` (invite-codes.ts:26-50). **Not called by the redemption path** — redemption uses `consumeInviteCode`; this read-only validity check is for other surfaces.
- `consumeInviteCode(code)` — atomic `UPDATE ... SET use_count = use_count + 1` guarded by the *same* usable predicate (revoked/expiry/max-uses) in the WHERE clause, `.returning()` the updated row, or `null` if the code became unusable in between (race-loser) (invite-codes.ts:57-81). This is the single redemption mutation.
- `createInviteCode(input)` — INSERT; defaults `note/maxUses/expiresAt/assignedRank/invitedEmail` to `null`, `requiresApproval` to `false`; **lowercases `invitedEmail`** on insert (`input.invitedEmail?.toLowerCase() ?? null`); throws `"Failed to insert invite code"` if no row returned (invite-codes.ts:83-109). (Minting is unit 11; this is the function that backs it.)
- `findInviteCodeByCode(code)` — existence check regardless of revoked/expired/exhausted state; for the "is this code name taken?" availability hint on `/tools/invite` (invite-codes.ts:111-129). Not used by this gate.

## User actions & interactions
- **Type an invite code** into the single `name="code"` text input (autocomplete/spellcheck/autocapitalize/autocorrect all off; `required`).
- **Submit** ("Enter camp") → posts the form to `submitInviteCode`. Button disabled while `isPending`; label flips to "Checking…".
- **Read inline error** (`role="alert"`) on any failure; the user stays on the gate (`useActionState` preserves the page).
- **Sign out** via the "Sign out" link → `GET /auth/sign-out` (the Neon Auth catch-all route; out of scope for this unit). This is the gate's exit.
- (Server-implicit) Re-auth check on submit; per-user rate-limit reservation; atomic DB use-count consume; row create/update; redirect home.

## States & presentations
Applying the global-states rows that are in scope for this surface:
- **Empty** — code input blank on first render; no prior `state` (`null`). No "empty list" concept here (single field).
- **Loading** — no async fetch in the form; the page is server-rendered. (`useActionState` has no separate loading state beyond submitting.)
- **Populated** — user has typed a code into the input.
- **Validation-error** — `state.ok === false` renders the inline `role="alert"` error. Specific messages: `"Please enter an invite code."` (empty after trim, from `redeemInviteForUser`), `"That invite code isn't valid."` (invalid/expired/revoked/exhausted/race-loser, from `claimInviteCode` → null), `"Too many attempts — wait a few minutes and try again."` (rate-limited). The HTML `required` attribute also blocks an empty submit client-side.
- **Submitting/pending** — `isPending` true → submit button disabled, label "Checking…".
- **Success** — server `redirect("/")`; no in-form success UI (the redirect *is* the success state). Home then re-runs the gating spine.
- **Disabled** — submit button is the only disabled element, gated on `isPending`.
- **Invite-gated** — this *is* the invite-gated destination. `hasCampAccess(campUser, email)` false on `app/page.tsx` (page.tsx:40-42) → `redirect("/signup/required")`. This page only renders for users WITHOUT access; if they already have access, the page itself bounces them to `/` (page.tsx:25-27).
- **Onboarding-incomplete / Pending-approval / Rejected** — NOT expressed on this screen; they are downstream gates reached after a successful redemption sends the user home. A `requiresApproval` redemption seeds the `pending` status that *later* routes to `/pending-approval` (app/page.tsx:61-62), but the gate screen never shows it.
- **Captain-only-locked** — N/A; the gate is open to any authenticated user without a code.

## Enums, options & configurable values
- `AssignedRank = "captain" | "member"` (invite-codes.ts:5) — the rank an invite code may stamp.
- `rankEnum = pgEnum("rank", ["captain", "member"])` (schema.ts:31). `assigned_rank` column is nullable; `NULL` = redeemer keeps default `member` (schema.ts:324-327).
- `approvalStatusEnum = pgEnum("approval_status", ["pending", "approved", "rejected"])` (schema.ts:41-45). Redemption can set `pending` (requires-approval) or `approved` (pre-approved); `rejected` is a downstream captain decision, never set here.
- Rate-limit config (actions.ts:26-27): `limit: 10`, `windowMs: 10 * 60_000` (= 600000 ms = 10 minutes), key `invite-redeem:<authUser.id>`. `rateLimit` default `windowMs` (unused here) = `60_000` (rate-limit.ts:44).
- `rateLimit` internals: `SWEEP_EVERY = 200` (bucket-sweep cadence), token-bucket refill `limit / windowMs` per ms (rate-limit.ts:15, 46).
- **Env config** (CSV, trimmed, empty-filtered via `csv()` — access-control.ts:17-22):
  - `GOD_EMAILS` — case-insensitive list; matching emails bypass the invite gate entirely (access-control.ts:28-32).
  - `INVITE_CODES` — bootstrap env codes; exact-match (case-sensitive) membership = valid, unlimited, no rank, no approval (access-control.ts:59-61).
- `E2E_TEST_MODE === "1"` toggles the in-memory `testStore` backend (test-mode.ts:11-13).
- Literal UI strings: heading `"One more thing"`; button `"Enter camp"` / `"Checking…"`; label `"Invite code"`; footer `"Camp 404 is invite-only."`; sign-out `"Sign out"`; body copy as above.

## Data model touched
**`invite_codes` table** (`packages/db/src/schema.ts:312-342`), exposed via `InviteCodeRow` (invite-codes.ts:7-19) / `TestInviteCode` (test-store.ts:45-57):
- `code` — `text` PRIMARY KEY (codes are forever-unique by PK).
- `createdByUserId` — `uuid` `created_by_user_id`, FK → `users.id` `ON DELETE set null`, nullable (CLI/env minting leaves null).
- `note` — `text`, nullable.
- `maxUses` — `integer` `max_uses`, nullable (NULL = unlimited).
- `useCount` — `integer` `use_count` NOT NULL default `0`.
- `expiresAt` — `timestamp` `expires_at`, nullable (NULL = never expires).
- `revokedAt` — `timestamp` `revoked_at`, nullable (non-null = revoked).
- `assignedRank` — `rank` enum `assigned_rank`, nullable (NULL = default `member`).
- `invitedEmail` — `text` `invited_email`, nullable, lowercased on insert.
- `requiresApproval` — `boolean` `requires_approval` NOT NULL default `false`.
- `createdAt` — `timestamp` `created_at` NOT NULL default now.
- Index `invite_codes_created_by_idx` on `created_by_user_id`.

**`users` table** (read/written via `redeemInviteForUser`; `packages/db/src/schema.ts`):
- `inviteCode` — `text` `invite_code`, nullable (schema.ts:256-260). NULL = god account. Written by `setUserInviteCode` / set on `createCampUser`. This is the durable "past the invite gate" evidence read by `hasCampAccess`.
- `rank` — `rank` enum, default `member` (schema.ts:31; set via `createCampUser`/`setUserRank` when `assignedRank` present).
- `approvalStatus` — `approval_status` enum NOT NULL default `approved` (schema.ts:267-269). Set to `pending` on a requires-approval redemption (via `createCampUser` or `setUserApprovalStatus`).
- `authUserId` — `auth_user_id`, the Neon/Better Auth user id key for `findUserByAuthId`.
- `displayName` — `display_name`; seeded from `authUser.displayName ?? authUser.primaryEmail` on first create.
- `approvalDecidedByUserId` / `approvalDecidedAt` — stamped only by captain decisions (`setUserApproval`), NOT by self-service redemption (`setUserApprovalStatus` leaves them untouched).
- (Not touched here but on the same row: `profileImageUrl`, `emergencyContacts`, terms/POPIA fields, telegram fields, `aiDataConsent*`, ID-document columns.)

**`CampUser` interface** (users.ts:39-47), produced by `toCampUser` (users.ts:462-480): `{ id, authUserId, displayName, profileImageUrl, inviteCode, rank, approvalStatus }`; `approvalStatus` defaults to `"approved"` when the source row's value is null/missing (users.ts:478).

**`burner_profiles`** — indirectly: a first-time redemption calls `seedBurnerProfileAction(created.id)`, which (real DB only) `ensureRequiredAction({ type: "questionnaire", actionKey: "burner_profile", version: QUESTIONNAIRE.version, ... })`. No-op under E2E mode (users.ts:192-201).

**`AuthenticatedUser`** (auth.ts:13-17): `{ id, primaryEmail, displayName }` — only `id` and `primaryEmail` are load-bearing here (id for rate-limit/lookup; primaryEmail for `isGodEmail`).

## Validation, edge cases & business rules
- **Auth precondition**: both page and action call `getAuthenticatedUserOrRedirect()` → unauthenticated users are sent to `/auth/sign-in`, never reach redemption.
- **Idempotent re-entry**: a user who already has `inviteCode` set, or a god email, returns `{ ok: true }` immediately — never burns a second use, never re-stamps rank/approval (users.ts:122-124). The page also redirects such users to `/` before the form renders (page.tsx:25-27).
- **God bypass**: `GOD_EMAILS` match → `ensureCampUser` auto-creates an `approved`, `member`-rank, `inviteCode: null` row + seeds burner profile on first sign-in (users.ts:63-80); they never see the gate (`hasCampAccess` returns true via `isGodEmail`, users.ts:219-224).
- **Trimming**: code is trimmed in both `redeemInviteForUser` (users.ts:115) and `claimInviteCode` (access-control.ts:46); empty-after-trim is rejected with distinct messages depending on which layer catches it.
- **Env vs DB precedence**: `isEnvCode` is checked FIRST; an env-code match never touches the DB and never consumes (access-control.ts:48-50). A code that is both an env code and a DB row would resolve via the env branch (no rank/approval, no consume).
- **Atomic consume / race protection**: `consumeInviteCode` increments `use_count` inside one guarded UPDATE; two concurrent redeemers competing for the last use → at most one gets a returned row, the loser gets `null` → `"That invite code isn't valid."` (invite-codes.ts:57-81; comment access-control.ts:36-41).
- **Usability predicate** (must satisfy ALL): not revoked (`revoked_at IS NULL`), not expired (`expires_at IS NULL` OR `> now`), uses remaining (`max_uses IS NULL` OR `max_uses > use_count`) — identical in `findUsableInviteCode`, `consumeInviteCode`, and the test store (invite-codes.ts:34-46, 65-77; test-store.ts:339-352). Note expiry comparison: SQL uses `> now`; test store uses `expiresAt <= new Date()` as the dead check (i.e. `expiresAt === now` is dead in test, alive in SQL — boundary asymmetry).
- **Approval only tightens**: a requires-approval code applied to an existing non-pending user sets `pending`; it never moves an already-`approved` user back unless the guard `existing.approvalStatus !== "pending"` passes — and crucially it will overwrite `approved`→`pending` (it only skips if already `pending`). It does NOT un-reject (`rejected` → `pending` would occur since `!== "pending"`). <!-- low-confidence: whether overwriting a 'rejected' redeemer back to 'pending' via a new requires-approval code is intended; the guard only excludes already-'pending', so rejected→pending is reachable on re-redemption. -->
- **Rank stamping**: only applied when `assignedRank` is present AND differs from the user's current rank (existing-row path); first-time path uses `assignedRank ?? "member"`.
- **Rate limit** is per-`authUser.id`, in-memory/per-process (no Redis), 10 attempts / 10 minutes; the comment notes it should swap to Upstash if the app fans out across regions (rate-limit.ts:1-4).
- **No orphan rows**: merely visiting the gate (no successful redemption) never persists a user row — `ensureCampUser` hands back a synthetic `{ id: "", ... }` row for non-god, no-invite users (users.ts:84-95).
- **Synthetic-row quirk**: the synthetic row reports `approvalStatus: "approved"` and `rank: "member"` with empty `id` — never used because callers check `hasCampAccess` and redirect first.
- **E2E mode**: `consumeDbCode`, `findUserByAuthId`, `createUser`, etc. route to `testStore`; `seedBurnerProfileAction` and the required-actions helpers are no-ops; `isTeamLead` always false (users.ts:447-450). Env codes (`INVITE_CODES`) still work in test mode (env branch is backend-agnostic).

## Sub-components / variants
- **`AuthShell`** (`components/auth-shell.tsx`) — shared centred auth card chrome. Props used here: `hideBack` (suppresses the Back button — the gate is a flow's first screen) and `footer="Camp 404 is invite-only."`. Built from `@camp404/ui` `Card`/`CardContent`/`Button`; back button is `variant="ghost" size="sm"` calling `router.back()`. (`className` prop unused here.)
- **`InviteGateForm`** — the only consumer of `submitInviteCode`; client component.
- **`SubmitInviteResult`** type = `{ ok: false; error: string }` only (actions.ts:8) — there is no `{ ok: true }` member because success always `redirect`s. The form's `useActionState` initial value is `null`.
- **Server-only handlers/validators in scope:**
  - `submitInviteCode` (action) — rate-limit + redeem + redirect.
  - `redeemInviteForUser` / `RedeemInviteResult` (`{ ok: true } | { ok: false; error }`) — orchestration + row create/update.
  - `claimInviteCode` / `ClaimedInvite` — env-vs-DB resolution.
  - `isGodEmail` — god-email CSV check.
  - `consumeInviteCode` (DB) and `testStore.consumeInviteCode` (E2E) — the atomic consume.
  - `hasCampAccess(user, email)` = `isGodEmail(email) || !!user.inviteCode` (users.ts:219-224) — the predicate this gate exists to satisfy.
- **Dead / orphaned within this unit:**
  - `findUsableInviteCode` (invite-codes.ts:26-50) — read-only usability check; **not** called by the redemption path (redemption uses `consumeInviteCode`). Used elsewhere.
  - `findInviteCodeByCode` (invite-codes.ts:111-129) — existence/availability hint for the minting UI (`/tools/invite`, unit 11); not used by this gate.
  - `createInviteCode` (invite-codes.ts:83-109) — minting (unit 11), not redemption.
  - `testStore.seedInviteCode` (test-store.ts:313-338) — test fixture helper for E2E specs; not part of the runtime gate.
- **Adjacent (explicitly out of scope):** the `/auth/sign-out` link resolves to the Neon Auth `[path]` catch-all (`apps/web/app/auth/[path]/page.tsx`), not handled here. The downstream gating spine (`app/page.tsx:29-63`) and `nextGate`/required-actions routing are unit 23.

---

# 04 — Onboarding questionnaire wizard (step machine)

**Files covered:**
- `apps/web/app/onboarding/questionnaire/page.tsx` — server component: auth + invite gate, redirect-if-complete, pre-fills responses (merges decrypted ID number), renders the wizard.
- `apps/web/app/onboarding/questionnaire/actions.ts` — `saveBurnerProfile` server action: validates (on final), splits/encrypts ID number, upserts the profile, mirrors photo, satisfies the gating required-action, redirects home.
- `apps/web/components/questionnaire/wizard.tsx` — `QuestionnaireWizard` client step machine: page nav, progress, per-page local validation, error banner, Skip/Next/Finish, sign-out escape, `ProgressBar`.
- `packages/types/src/questionnaire.ts` — Zod schemas for `Questionnaire`/`QuestionnairePage`/`Question` (10 kinds), `validateResponses` (final-submit validator), `validateOne`, `flattenQuestions`, `displayResponseValue`, `diffResponses` (last two used by unit 12, not here).
- `apps/web/lib/questionnaire.ts` — the live `QUESTIONNAIRE` constant: `version` + the 12 pages and their questions/options.
- `apps/web/lib/id-validation.ts` — `validateIdNumber`: cross-field SA-ID/passport format check used in local validation.
- `packages/db/src/id-documents.ts` — pure `splitIdNumber` / `mergeIdNumber` / `idColumnsFor` mapping for moving the ID number in/out of `responses`.
- `apps/web/lib/users.ts` — backend dispatch (`upsertBurnerProfile`, `setIdDocuments`, `setProfileImage`, `getBurnerProfile`, `getIdDocuments`, `satisfyBurnerProfileAction`, `hasCampAccess`, `ensureCampUser`); real Drizzle backend vs in-memory E2E test backend.
- `packages/db/src/burner-profile.ts` — `upsertBurnerProfile` (UPSERT on `user_id`), `getBurnerProfileByUserId`, encrypted ID-column read/write.
- `packages/db/src/schema.ts` — `burner_profiles` table + `users.passport_encrypted` / `sa_id_encrypted` / `profile_image_url` columns.
- `packages/db/src/activations.ts` — `satisfyRequiredAction` (version-gated completion of the `burner_profile` blocking action).

**Purpose:** The mandatory burner-profile questionnaire shown right after signup, gating entry to the app (the `burner_profile` blocking required-action). It is a page-at-a-time wizard: a single client component (`QuestionnaireWizard`) drives a catalogue-defined sequence of pages (intro interstitials + question pages), validating each page locally before advancing, persisting progress on every Next (in onboarding mode), and on final submit running full server-side validation, splitting the government ID number into encrypted `users` columns, mirroring the profile photo, marking the profile complete, satisfying the gate, and redirecting home. The same `QuestionnaireWizard` is reused by the replay/edit flow (unit 12) with different props; this unit documents the onboarding configuration.

## Features

### Server page — gate, pre-fill, redirect-if-done (`page.tsx`)
- `export const dynamic = "force-dynamic"` — reads the Neon Auth session on every request (`page.tsx:16`).
- Auth gate: `getAuthenticatedUserOrRedirect()` redirects to `/auth/sign-in` if no session (`page.tsx:19`, `auth.ts:40-42`).
- Camp-user resolution: `ensureCampUser(authUser)` (creates/loads the camp_user row, redeems invite cookie) (`page.tsx:20`).
- Invite gate: `if (!hasCampAccess(campUser, authUser.primaryEmail)) redirect("/signup/required")` (`page.tsx:21-23`). `hasCampAccess = isGodEmail(email) || !!user.inviteCode` (`users.ts:219-224`).
- Completion gate: `const profile = await getBurnerProfile(campUser.id); if (profile?.completedAt) redirect("/")` — a completed profile cannot re-enter onboarding; it bounces home (`page.tsx:24-28`).
- Pre-fill assembly: loads `getIdDocuments(campUser.id)` (decrypted owner ID), defaults to `{ idType: null, idNumber: null }` when no row; then `mergeIdNumber(profile.responses ?? {}, id)` rehydrates `id.number` (and `id.type`) into the response map, because the ID number lives encrypted on `users`, NOT in `responses` (`page.tsx:30-40`).
- Renders header copy: H1 "Build your burner profile"; subtitle "A few questions so the camp knows who's arriving in the dust. Takes about two minutes." (`page.tsx:45-49`).
- Mounts `<QuestionnaireWizard questionnaire={QUESTIONNAIRE} initialResponses={initialResponses} action={saveBurnerProfile} firstStepSignOut />` (`page.tsx:51-56`). Note: onboarding does NOT pass `persistProgress`, `onComplete`, or `submitLabel` — so `persistProgress` defaults `true`, `submitLabel` defaults `"Finish"`, `firstStepSignOut` is `true`.
- Layout wrapper: `<main className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col px-4 py-8">` (note `max-w-2xl`, wider than the global `max-w-lg`) (`page.tsx:43`).

### Save action — validate, split-encrypt, upsert, satisfy gate (`actions.ts`)
- `"use server"`; signature `saveBurnerProfile(rawResponses: unknown, final: boolean): Promise<SaveResult>` where `SaveResult = { ok: true } | { ok: false; errors: Record<string, string> }` (`actions.ts:1,17-29`).
- Re-runs the SAME auth + invite gate as the page on every call (defence in depth): `getAuthenticatedUserOrRedirect` → `ensureCampUser` → `hasCampAccess` else `redirect("/signup/required")` (`actions.ts:30-34`).
- Final-only full validation: `if (final) { const result = validateResponses(QUESTIONNAIRE, rawResponses); if (!result.ok) return { ok: false, errors: result.errors } }`. Non-final saves tolerate missing required answers (user still working through pages) (`actions.ts:36-41`).
- Coerces non-object payloads to `{}` (`actions.ts:43-46`).
- Splits the ID number: `const { cleaned, idType, idNumber } = splitIdNumber(responses)` — removes `id.number` from the JSONB; `id.type` stays in `cleaned` (`actions.ts:48-52`).
- Upsert: `upsertBurnerProfile({ userId, version: QUESTIONNAIRE.version, responses: cleaned, markComplete: final })` (`actions.ts:54-59`).
- ID encryption write: `if (idNumber) await setIdDocuments(campUser.id, { idType, idNumber })` — runs on progress AND final saves (any time an ID number is present). Real backend AES-256-GCM-encrypts via `PGCRYPTO_KEY`; throwing here (missing/short key) is caught (`actions.ts:61-65`).
- Profile-photo mirror: reads `cleaned["profile.image"]`; if it's a string, `setProfileImage(campUser.id, image.length > 0 ? image : null)` — mirrors the URL onto `users.profile_image_url` so header/profile reads need not parse JSON. Runs on progress + final saves (`actions.ts:67-73`).
- Final-only gate satisfaction: `if (final) await satisfyBurnerProfileAction(campUser.id)` — completes the `burner_profile` blocking required-action (no-op under E2E test mode; the legacy `completedAt` fallback gate covers it) (`actions.ts:75-80`, `users.ts:204-209`).
- Error handling: all persistence wrapped in try/catch; on throw logs `"saveBurnerProfile persistence failed"` server-side and returns `{ ok: false, errors: { _form: "We couldn't save your answers just now. Please try again — if it keeps happening, let a camp captain know." } }` (`actions.ts:81-93`).
- Final redirect lives OUTSIDE the try/catch: `if (final) redirect("/")` (the redirect throws a control-flow signal that must escape the catch), then `return { ok: true }` for the non-final path (`actions.ts:95-98`).

### Wizard step machine (`wizard.tsx`)
- Local state: `pageIndex` (number, init 0), `responses` (init = `initialResponses`), `errors` (`Record<string,string>`, init `{}`), `isPending` via `useTransition` (`wizard.tsx:58-62`).
- Derived: `page = questionnaire.pages[pageIndex]`; `isLast = pageIndex === pages.length - 1`; `if (!page) return null` (out-of-range guard) (`wizard.tsx:64-67`).
- `setResponse(id, value)`: merges value into `responses` AND clears that field's error if present (`wizard.tsx:69-77`).
- Progress: `<ProgressBar current={pageIndex + 1} total={pages.length} />` — percentage bar (`Math.round((current/total)*100)`) plus literal text `Step {current} of {total}` (`wizard.tsx:187, 263-277`).
- Page rendering: intro pages render a centered full-screen `heading` + `body` section; question pages render `title`, optional `subtitle`, then map each question through `<QuestionField>` (unit 20) passing `value`, `onChange`, `error`, `fullScreen` (`wizard.tsx:198-236`).
- Error banner: `formError = errors["_form"] ?? errors["_root"]`; rendered as `<p role="alert">` with destructive styling when set (`wizard.tsx:176, 189-196`).
- Footer controls: left slot = "Sign out" link (page 0 + `firstStepSignOut`) OR a "Back" button (disabled on page 0 or while pending); right slot = submit button labelled `submitLabel` when `isLast` else `nextLabel` (`Skip`/`Next`), disabled while `isPending` (`wizard.tsx:238-258`).
- Form submit: `onSubmit` preventDefaults and routes to `handleSubmit()` if `isLast` else `handleNext()` (so Enter advances) (`wizard.tsx:179-184`).

## User actions & interactions
- **Answer a question** → `QuestionField.onChange` → `setResponse(id, value)`; clears that field's inline error immediately (`wizard.tsx:69-77, 224-233`).
- **Next** (`handleNext`): runs `validatePageLocally(page)`; if invalid, stops and shows inline errors. If valid and `persistProgress === false`, advances locally only. If valid and `persistProgress === true` (onboarding), calls `action(responses, false)` inside a transition: on `{ ok: false }` sets `errors` to the returned map and stays; on `{ ok: true }` advances to `Math.min(i + 1, lastIndex)`; on a thrown action sets `errors._form = SAVE_FAILED` (`wizard.tsx:103-124`).
- **Skip** — same control as Next; label flips to "Skip" when the page is a lone optional question with no current answer (still calls `handleNext`, so an unanswered optional saves progress and advances) (`wizard.tsx:160-172`).
- **Back** (`handleBack`): `setPageIndex(Math.max(0, i - 1))`. No save, no validation. Disabled on page 0 (replaced by Sign out when `firstStepSignOut`) or while pending (`wizard.tsx:126-128, 246-254`).
- **Sign out** — only on page 0 when `firstStepSignOut` (onboarding): plain `<a href="/auth/sign-out">` escape hatch for someone signed in with the wrong account before creating anything (`wizard.tsx:239-244`).
- **Finish / final submit** (`handleSubmit`): runs `validatePageLocally`; on pass calls `action(responses, true)` in a transition. `{ ok: false }` → set errors, stay. `{ ok: true }` → `onComplete?.()` (onboarding omits `onComplete`; its action redirects server-side so code after `await` never runs). Thrown → `errors._form = SAVE_FAILED` (`wizard.tsx:130-147`).
- **Dictate (mic)** — long-text/idea fields expose a mic per the field renderer (unit 20); transcript appends to the host field. Out of scope here (referenced in catalogue helper copy: "Tap the mic to dictate.").

## States & presentations
Global-states rows that apply to this surface:
- **Empty** — first visit with no saved profile: `initialResponses = {}` (after merge); every field renders unanswered, page 0 = the optional profile-photo page.
- **Loading** — server component awaits session/user/profile/ID before first paint (`page.tsx:19-40`); no client loading spinner — the wizard mounts already hydrated with `initialResponses`.
- **Populated** — returning incomplete user: `profile.responses` pre-fills fields; decrypted `id.number`/`id.type` merged back in (`page.tsx:33-40`). Onboarding persists progress on every Next so a partially filled signup survives reload.
- **Validation-error** — per-field inline errors from `validatePageLocally` (`errors[q.id]`, passed to `QuestionField`); page-level banner for `_form`/`_root`. Final submit can return server-side per-field errors keyed by question id (`actions.ts:39-40`, `wizard.tsx:135-137`).
- **Submitting/pending** — `isPending` (from `useTransition`) disables Back and the submit button during any save action; covers Next-progress saves and final submit (`wizard.tsx:250, 255`).
- **Success** — onboarding: server action `redirect("/")` after `markComplete` + gate satisfaction (no client success UI); the completion gate then bounces any re-entry home (`actions.ts:97`, `page.tsx:26-28`). Replay flow uses `onComplete` for in-place confirmation (unit 12).
- **Disabled** — Back disabled on page 0 and while pending; submit disabled while pending (`wizard.tsx:250, 255`).
- **Invite-gated** — `hasCampAccess` false → `redirect("/signup/required")`, enforced in BOTH page and action (`page.tsx:21-23`, `actions.ts:32-34`).
- **Onboarding-incomplete** — this surface IS the onboarding gate. Completing it satisfies the `burner_profile` blocking required-action via `satisfyBurnerProfileAction` (`actions.ts:79`). The global gating spine routes incomplete users here.
- **Pending-approval / Rejected** — not enforced inside this unit; the post-completion redirect to `/` re-enters the gating spine (app/page.tsx) which then routes pending→`/pending-approval`, rejected→terminal. <!-- low-confidence: this surface does not itself check approval_status; downstream gating is unit 29/gating-spine territory. -->
- **Captain-only-locked** — N/A: onboarding is per-user (the signed-in member); no rank-gated content here.

There are NO offline/sync states and NO budget/over-target states.

## Enums, options & configurable values

### Questionnaire identity
- `QUESTIONNAIRE.version = "2026.05.29-v8"` (`questionnaire.ts:60`). Stored on `burner_profiles.version`; passed to `satisfyRequiredAction` as the completed version (version-gated, see Validation).

### Question kinds (10, discriminated union on `kind`)
`slider`, `single_select`, `multi_select`, `short_text`, `long_text`, `date`, `scale`, `toggle`, `combobox`, `image` (`questionnaire.ts:137-148`).

Per-kind schema defaults (Zod):
- `slider`: `step` default `1` (positive); `required` default `true`; requires `min`, `max` (numbers).
- `single_select`: `options` min 2; `required` default `true`.
- `multi_select`: `options` min 2; `required` default `false`.
- `short_text`: `maxLength` default `120` (int positive); `required` default `true`.
- `long_text`: `maxLength` default `1000` (int positive); `required` default `false`.
- `date`: `required` default `true`; ISO `yyyy-mm-dd` backed by `<input type="date">`.
- `scale`: `steps` min 2; `required` default `true`.
- `toggle`: `options` min 2; `required` default `true`.
- `combobox`: `options` min 2; optional `placeholder` / `searchPlaceholder`; `required` default `true`.
- `image`: `required` default `false`; stored value = public URL (Vercel Blob in prod).

### Page kinds (2)
- `questions` — `id`, `title`, optional `subtitle`, `questions` (min 1).
- `intro` — `id`, `heading`, `body`. No questions, no validation (`questionnaire.ts:153-177`).

### Response value union
`number | string | string[] | boolean | null`; responses are `Record<string, QuestionnaireResponseValue>` (`questionnaire.ts:187-202`).

### The live 12 pages (in order) — `apps/web/lib/questionnaire.ts`
1. `profile_photo` (questions) — "Add a profile photo". Q: `profile.image` (image, optional).
2. `about_you` (questions) — "About you". Qs:
   - `birthday` (date, required)
   - `phone` (short_text, maxLength 40, required)
   - `country` (combobox, required; options = `COUNTRY_OPTIONS`, see below; placeholder "Pick your country…", searchPlaceholder "Search countries…")
   - `id.type` (toggle, required; options `passport`="Passport", `sa_id`="South African ID")
   - `id.number` (short_text, maxLength 40, required)
3. `bio` (questions) — "A bit about you". Q: `bio.statement` (long_text, maxLength 2000, required).
4. `burn_ideas` (questions) — "Your ideas for this year's burn". Q: `ideas.this_year` (long_text, maxLength 2000, optional).
5. `team_interests_intro` (intro) — heading "Indicate your interest in whichever teams you want." + body.
6. `team_interests` (questions) — one slider per team (8): `team_interest.<team>` (slider, min 0, max 5, step 1, minLabel "Not for me", maxLabel "Sign me up", optional). Team values: `kitchen`, `structures`, `power_and_lighting`, `sanitation_and_water`, `health_and_safety`, `art_and_activities`, `ministry_of_memes`, `ministry_of_vibes` (`questionnaire.ts:30-39, 179-189`).
7. `cooking_competency` (questions) — Q `competency.cooking` (scale, required). Steps (value→label): `create`="Good cook — I can create recipes", `teach`="Adequate — I can teach recipes", `follow`="I can follow recipes", `burn`="I might burn recipes".
8. `hardware_competency` (questions) — Q `competency.hardware` (scale, required). Steps: `design`="I design and build rigs from scratch", `build`="I can build to a plan", `assist`="I can hold the torch and pass tools", `novice`="I'd rather not be near the power tools".
9. `leadership_logistics` (questions) — Qs:
   - `team_lead.interests` (multi_select, optional; options = the 8 TEAMS)
   - `logistics.driving` (single_select, required): `yes`="Yes", `no`="No", `maybe`="Maybe — still working it out"
   - `logistics.onsite_before` (single_select, required): `yes_full`="Yes — the whole build week", `yes_partial`="Some of build week", `no`="No — I'll arrive on opening day"
   - `logistics.onsite_after` (single_select, required): `yes_full`="Yes — through to MOOP sweep", `yes_partial`="A day or two", `no`="No — I'm out the morning after"
10. `burn_history` (questions) — Qs:
    - `history.camp404_years` (multi_select, optional): `2019`,`2022`,`2023`,`2024`,`2025`,`2026` (label = same year)
    - `history.afrikaburn_count` (single_select, required): `0`="None — first one", `1_2`="1–2", `3_5`="3–5", `6_plus`="6 or more"
    - `history.other_burns` (long_text, maxLength 1000, optional)
11. `burn_intent` (questions) — Q `intent.this_year` (scale, required). Steps: `definite`="100% coming", `want`="Definitely want to", `try`="Will try", `unsure`="Unsure", `unlikely`="Not likely", `not_coming`="Definitely not".
12. `dietary` (questions) — Qs:
    - `dietary.dislikes` (multi_select, optional; options = DIETARY_INGREDIENTS)
    - `dietary.allergies` (multi_select, optional; options = DIETARY_INGREDIENTS)
    - `dietary.notes` (long_text, maxLength 1000, optional)

So the wizard renders **12 pages** total ("Step N of 12") — `ProgressBar total={questionnaire.pages.length}` renders "Step N of 12" (`questionnaire.ts:62-386`; `wizard.tsx:187, 274`). <!-- 11 kind:"questions" pages + 1 kind:"intro" page (`team_interests_intro`, page 5) = 12 top-level pages. The stale "13-page" claim originates from a source comment at `complete-onboarding/route.ts:6-8`. -->

### DIETARY_INGREDIENTS (value→label) — used by both dislike + allergy multi-selects (`questionnaire.ts:44-57`)
`dairy`="Dairy / lactose", `gluten`="Gluten / wheat", `eggs`="Eggs", `soy`="Soy", `peanuts`="Peanuts", `tree_nuts`="Tree nuts", `shellfish`="Shellfish", `fish`="Fish", `sesame`="Sesame", `alliums`="Onion / garlic", `nightshades`="Nightshades (tomato, pepper, aubergine)", `spicy`="Chilli / heat".

### COUNTRY_OPTIONS (`questionnaire.ts:6-9` + `apps/web/lib/countries.ts`)
Built from `COUNTRIES` (ISO alpha-2 `value`, country `label`), each label prefixed with the flag emoji via `countryFlag(value)`, e.g. "🇿🇦 South Africa". Stored value = the ISO alpha-2 code. 198 entries in the countries list. <!-- a raw `grep -c "value:"` returns 199; the 199th match is the `Country` interface's `value:` field declaration, not a country row, so the real count is 198. -->

### ID document toggle values
`passport`, `sa_id` (`questionnaire.ts:114-117`). `id.type` stays in `responses`; `id.number` is the encrypted-out field.

### Wizard tunables / literals
- `submitLabel` default `"Finish"`; `nextLabel` = `"Skip"` (lone unanswered optional) else `"Next"` (`wizard.tsx:55, 172`).
- `persistProgress` default `true`; `firstStepSignOut` default `false` (onboarding sets `true`).
- Reserved error keys: `FORM_ERROR_KEY = "_form"`, `ROOT_ERROR_KEY = "_root"` (`wizard.tsx:21-22`).
- `SAVE_FAILED` message (client) = "We couldn't save your answers just now. Please try again — if it keeps happening, let a camp captain know." — same string the action returns for `_form` (`wizard.tsx:23-24`, `actions.ts:89-91`).
- `isFullScreen` triggered by: page kind `intro`, OR a single-question page whose sole question kind is `scale` | `long_text` | `image` (`wizard.tsx:149-155`).

## Data model touched
Must agree with unit 29.

### `burner_profiles` (`schema.ts:352-364`)
- `user_id` (uuid, PK, FK→`users.id` ON DELETE CASCADE) — one profile per user.
- `version` (text, NOT NULL) — set to `QUESTIONNAIRE.version` on every upsert.
- `responses` (jsonb `Record<string, unknown>`, NOT NULL, default `{}`) — the flat question-id→value map MINUS `id.number` (which is split out and encrypted). `id.type`, `birthday`, and `profile.image` all stay here.
- `started_at` (timestamp, NOT NULL, default now).
- `completed_at` (timestamp, nullable) — set to `now` only when `markComplete` true; on conflict, preserved (`sql\`completed_at\``) when not completing (`burner-profile.ts:148, 156-158`).
- `updated_at` (timestamp, NOT NULL, default now) — bumped to `now` on every conflict update.

### `users` columns this unit writes/reads (`schema.ts:229, 241-242`)
- `profile_image_url` (text, nullable) — mirrored from `responses["profile.image"]` via `setProfileImage` (string→url, empty string→null).
- `passport_encrypted` (text, nullable) — ciphertext of `id.number` when `id.type === "passport"`.
- `sa_id_encrypted` (text, nullable) — ciphertext of `id.number` when `id.type === "sa_id"`.
- `idColumnsFor(idType, value)` sets the matching column and NULLs the other, so switching document type MOVES the value rather than orphaning ciphertext; default/unknown type → treated as passport (`id-documents.ts:43-50`).

### `required_actions` (touched via `satisfyBurnerProfileAction`)
- Action keyed `actionKey = "burner_profile"`, `type = "questionnaire"`, `title = "Complete your burner profile"`, `version = QUESTIONNAIRE.version` (seeded by `seedBurnerProfileAction`, `users.ts:192-200`). On final submit, `satisfyRequiredAction(userId, "burner_profile", QUESTIONNAIRE.version)` flips a pending row to `status="completed"` with `completedAt=now` (`activations.ts:167-200`).

### `BurnerProfileSummary` interface (read shape, `users.ts:155-160`)
`{ responses: Record<string, unknown>; completedAt: Date | null; updatedAt: Date | null; version: string | null }`.

### `SplitId` interface (`id-documents.ts:10-17`)
`{ cleaned: Record<string, unknown>; idType: string | null; idNumber: string | null }`.

## Validation, edge cases & business rules

### Local (client) per-page validation — `validatePageLocally` (`wizard.tsx:79-101`)
- Intro pages always pass (`p.kind === "intro" → true`).
- For each question: value is "missing" if `undefined | null | ""` (empty string). Missing + `required` → inline error `"This question is required"`.
- Cross-field ID check: when `q.id === "id.number"` and value is a non-empty string, calls `validateIdNumber(responses["id.type"], v)`; on failure sets that question's error to the returned message. Note: only runs when an ID number is typed; an empty `id.number` falls through to the generic required check.
- Multi-select / arrays: NOT treated as missing here (arrays aren't `=== ""`); a `required` multi-select with `[]` would pass local validation but be caught by the server `validateOne` ("Pick at least one option").
- Returns true only when the error map is empty; populates `errors` with whatever it found.

### ID number format — `validateIdNumber(type, raw)` (`id-validation.ts`)
- Trims; empty → `"Document number is required"`.
- `type === "passport"` → `/^[A-Z0-9]{6,12}$/i`; fail → "Letters and digits only — typically 6–12 characters."
- `type === "sa_id"` → must match `/^\d{13}$/` ("Must be exactly 13 digits."), THEN a valid `YYMMDD` date prefix (month 1–12, day 1–31; "First six digits aren't a valid YYMMDD date."), THEN the SA Home Affairs Luhn-variant check digit ("Check digit doesn't match — double-check the number.").
  - SA Luhn variant: 1-based positions 1–12 (drop position 13 = check digit). Odd positions (i%2===0 0-based) summed directly; even positions concatenated into one number, multiplied by 2, the digits of that product summed; `computed = (10 - (total % 10)) % 10`; compare to digit 13 (`id-validation.ts:82-102`).
- Any other `type` (null/empty) → "Pick the ID document type first" (forces choosing `id.type` first).

### Server full validation — `validateResponses(QUESTIONNAIRE, raw)` (final submit only) (`questionnaire.ts:324-436`)
- Payload not parseable as `Record<string, ResponseValue>` → single `_root: "Malformed response payload"` (renders in the banner).
- Iterates catalogue pages (skips intro), validates each question via `validateOne`; collects per-question errors keyed by question id. Unknown response keys are DROPPED (stale keys from older versions ignored); only catalogue questions persisted.
- `validateOne` rules per kind:
  - Missing (`undefined|null|""`): required → `"This question is required"`; optional → accepted as `undefined` (not stored).
  - `slider`: must be number, not NaN, within `[min,max]` else `"Must be between {min} and {max}"`.
  - `single_select`/`toggle`/`combobox`: string and a known option value else `"Not a valid option"`.
  - `multi_select`: array of strings; filtered to allowed option values; `required && filtered.length === 0 → "Pick at least one option"`. Unknown members silently dropped.
  - `short_text`/`long_text`: string, `length <= maxLength` else `"Max {maxLength} characters"`.
  - `date`: strict `^\d{4}-\d{2}-\d{2}$` ("Use yyyy-mm-dd") and `Date.parse` not NaN ("Not a real date").
  - `scale`: string matching a known step value else `"Not a valid level"`.
  - `image`: string (any) accepted as URL; non-string → `"Expected an image URL"`. No URL-shape check, no `id.number`/ID Luhn check server-side (the SA-ID Luhn lives only in client `validateIdNumber`).
- NOTE: the server validator does NOT re-run `validateIdNumber`; SA-ID Luhn / passport-format enforcement is client-only. A crafted payload could bypass it. <!-- ugly truth: id.number is validated only locally; server treats it as plain short_text (maxLength 40). -->

### Persistence rules
- Onboarding persists progress on every Next (`persistProgress` true): a partially filled signup survives reload (`wizard.tsx` docstring 33-35).
- Non-final saves tolerate missing required answers (`actions.ts:36-37`).
- ID encryption write happens whenever `idNumber` is truthy (progress or final), so the encrypted column updates incrementally as soon as the user types a valid number and advances (`actions.ts:65`).
- Profile-photo mirror runs on every save (progress + final), keeping `users.profile_image_url` in sync (`actions.ts:67-73`).
- Final submit: `markComplete=true` stamps `completed_at`; once set, any conflict update preserves it (the field can't be un-completed via subsequent upserts) (`burner-profile.ts:156-158`).
- Gate version-matching: `satisfyRequiredAction` only flips the gate if the action is still `pending` and the completed version `meetsRequiredVersion(row.version, completedVersion)`; completion against an OLDER catalogue version leaves the gate open (`activations.ts:187-194`). Under E2E test mode this is a no-op and the legacy `completedAt` fallback gate covers it (`users.ts:204-208`).

### Edge cases
- Re-entry after completion: `page.tsx` redirects to `/` if `profile.completedAt` is set — you can't reopen onboarding once done (replay/edit is a different route/flow, unit 12).
- Out-of-range `pageIndex`: `if (!page) return null` renders nothing rather than crashing.
- Thrown save action (DB outage, missing/short `PGCRYPTO_KEY`, encryption failure): server returns typed `_form` error OR throws → client catch sets `_form = SAVE_FAILED`; user stays on the page and can retry — never silently stuck.
- Wrong-account escape: page-0 "Sign out" link (onboarding only) for someone who signed in with the wrong account before creating anything.
- ID type switch: `idColumnsFor` nulls the previously-used encrypted column so switching passport↔sa_id moves the ciphertext, never orphans it.
- `mergeIdNumber` only re-injects `id.number` when an ID number exists; otherwise returns responses unchanged (no phantom keys).

## Sub-components / variants
- **`QuestionnaireWizard`** (default export, `wizard.tsx`) — the shared step machine. Configured two ways:
  - *Onboarding* (this unit): `persistProgress=true` (default), `firstStepSignOut=true`, `submitLabel="Finish"` (default), no `onComplete` (server-side redirect handles success).
  - *Replay/edit* (unit 12): `persistProgress=false` (advance locally, persist only on final so the diff compares stored vs final), `firstStepSignOut=false`, custom `submitLabel`, uses `onComplete` for in-place confirmation + change-log refresh. The change-log machinery (`diffResponses`, `displayResponseValue`, `flattenQuestions`, `QuestionnaireFieldChange`) lives in `questionnaire.ts` but is used by unit 12, NOT here.
- **`ProgressBar`** (private fn, `wizard.tsx:263-278`) — bar + "Step N of M" text.
- **`QuestionField`** (`./question`, unit 20) — the per-kind field renderer; out of scope here.
- **Server-only handlers/validators/schemas this unit owns:**
  - `saveBurnerProfile` (server action) — the single write path.
  - `validateResponses` / `validateOne` (final-submit validator, `packages/types`).
  - `validateIdNumber` + helpers (`hasValidDatePrefix`, `hasValidLuhnCheck`) — client-side cross-field ID validation.
  - `splitIdNumber` / `mergeIdNumber` / `idColumnsFor` (pure PII-mapping, `packages/db`).
  - Backend dispatch `upsertBurnerProfile` / `setIdDocuments` / `setProfileImage` / `getBurnerProfile` / `getIdDocuments` / `satisfyBurnerProfileAction` (`users.ts`) — each routes to real Drizzle backend or in-memory E2E `testStore`.
- **Dead/orphaned flags:** none observed in the wizard itself. Notable ugly truths: (1) the SA-ID Luhn/passport check is client-only — the server validator treats `id.number` as a plain `short_text` (maxLength 40), so it is bypassable; (2) intro pages declared as a Zod kind but the live catalogue uses only one (`team_interests_intro`); (3) `displayResponseValue`/`diffResponses` exported from the same module but unused by this unit.

---

# 05 — Pending / rejected approval gate

**Files covered:**
- `apps/web/app/pending-approval/page.tsx` — the blocking server page itself: resolves the camp user, re-checks every upstream gate, branches pending-vs-rejected copy, renders the icon/heading/body + the single "Sign out" escape.
- `apps/web/lib/users.ts` — server-only data layer the page reads through: `ensureCampUser`, `getBurnerProfile`, `hasCampAccess`, `isApproved`, `decideUserApproval` (the captain's exit), `CampUser` shape, real/test backend split.
- `apps/web/components/auth-shell.tsx` — the centred card chrome the page renders inside (`hideBack` mode).
- `apps/web/lib/auth.ts` — `getAuthenticatedUserOrRedirect` (the page's first line; bounces to `/auth/sign-in` when unauthenticated) + `AuthenticatedUser` shape.
- `apps/web/lib/access-control.ts` — `isGodEmail` (god accounts never reach this gate) and the `claimInviteCode` / `requiresApproval` source that drops a redeemer into `pending`.
- `apps/web/app/page.tsx` — the gating spine that routes a non-approved user TO `/pending-approval` (the entry side; full chain is unit 23).
- `apps/web/app/captains/camp-management/actions.ts` — `decideApprovalAction`: the captain's approve/reject that is the only non-sign-out exit.
- `packages/db/src/schema.ts` — `users` table + `approvalStatusEnum`, `inviteCodes.requiresApproval`, audit columns.
- `packages/db/src/burner-profile.ts` — real-DB `setUserApproval` / `setUserApprovalStatus` (audit-stamp vs queue-drop) + `getBurnerProfileByUserId`.
- `apps/web/lib/test-store.ts` — in-memory `setUserApproval` / `setUserApprovalStatus` / `createUser` that back E2E_TEST_MODE.
- `apps/web/app/api/test/set-approval/route.ts` — E2E-only seam to force a user's `approvalStatus` (drives the rejected/approved branches in tests).
- `apps/web/app/auth/[path]/page.tsx` — where the "Sign out" link (`/auth/sign-out`) lands (Neon Auth hosted UI fallback).

**Purpose:** `/pending-approval` is the terminal blocking screen a member sees after they have (a) authenticated, (b) redeemed an invite code whose `requiresApproval` is true, and (c) completed their burner-profile onboarding — but before a captain has vetted them. It is a hard dead-end: it renders ZERO app navigation. There are exactly two ways out — a captain flips `approval_status` to `approved` (the app unlocks on the next page load) or to `rejected` (the screen swaps to a terminal "not approved" message), or the user signs out. The page expresses two distinct terminal states (pending vs rejected) and re-validates every upstream gate on each request so it can never be the wrong screen to show.

## Features

### `/pending-approval` page (apps/web/app/pending-approval/page.tsx)

- **Server component, force-dynamic.** `export const dynamic = "force-dynamic"` (page.tsx:14) — reads the Neon Auth session on every request; never statically prerendered.
- **Page metadata.** `metadata.title = "Application pending — Camp 404"` (page.tsx:16-18). Note: the title is always "pending" even on the rejected branch.
- **Auth gate (entry).** `getAuthenticatedUserOrRedirect()` (page.tsx:28) — unauthenticated visitors are bounced to `/auth/sign-in` before any of this screen renders (auth.ts:40-44).
- **Camp-user resolution.** `ensureCampUser(authUser)` (page.tsx:29) — returns the persisted Drizzle/test row, or a synthetic non-persisted row (`id: ""`, `inviteCode: null`, `approvalStatus: "approved"`) for a signed-in user who has never redeemed a code (users.ts:86-94).
- **Re-validation of every upstream gate** (so this page is never shown out of order):
  1. **No invite → /signup/required** (page.tsx:32-34): `if (!hasCampAccess(campUser, authUser.primaryEmail)) redirect("/signup/required")`. `hasCampAccess` is true iff god email or a non-null `inviteCode` (users.ts:219-224).
  2. **Already approved → / (home)** (page.tsx:36-38): `if (isApproved(campUser, authUser.primaryEmail)) redirect("/")`. `isApproved` is true iff god email or `approvalStatus === "approved"` (users.ts:231-236). This is what makes the gate auto-clear on the next load once a captain approves.
  3. **Onboarding not finished → /onboarding/questionnaire** (page.tsx:41-44): loads `getBurnerProfile(campUser.id)`; if `profile?.completedAt` is falsy, redirect to the questionnaire. Rationale comment: "a captain reviews a completed profile" (page.tsx:39-40).
- **Pending-vs-rejected branch.** `const rejected = campUser.approvalStatus === "rejected"` (page.tsx:46). Everything that survives the three redirects is therefore either `pending` or `rejected` (a `member`/`captain` with an invite, completed onboarding, and not-approved status).
- **Rendered inside `AuthShell` with `hideBack`** (page.tsx:49) — no Back button (this is a flow dead-end), centred card, no footer.
- **Status icon badge** (page.tsx:51-63): a 14×14 rounded-full circle holding a 7×7 lucide icon.
  - Rejected: `ShieldX` icon, classes `bg-destructive/10 text-destructive`.
  - Pending: `Clock` icon, classes `bg-amber-500/15 text-amber-400`. (This amber pair is the one place the surface uses a literal Tailwind colour rather than a `--color-*` token — see "ugly truths".)
  - Both icons carry `aria-hidden`.
- **Heading + body copy** (page.tsx:65-84):
  - **Rejected:** heading `Application not approved`; body `A captain has reviewed your application and it wasn't approved for camp access this time. If you think this is a mistake, reach out to whoever invited you.`
  - **Pending:** heading `Application submitted`; body `Thanks{displayName ? ", {displayName}" : ""} — your profile is in. A captain needs to approve your access before you can use the rest of the app. We'll let you in as soon as they do; just check back here.` The name interpolation is `campUser.displayName ? \`, ${campUser.displayName}\` : ""` (page.tsx:78) — greeting personalises only when a display name exists.
  - Body text styled `text-balance text-sm text-[color:var(--color-muted-foreground)]`; heading `text-2xl font-bold`.
- **Sign-out escape** (page.tsx:86-88): an `outline`-variant `Button asChild w-full` wrapping `<a href="/auth/sign-out">Sign out</a>`. This is the ONLY interactive control on the page. `/auth/sign-out` is handled by the Neon Auth hosted-UI catch-all (`apps/web/app/auth/[path]/page.tsx:43-47` — `<AuthView path={path} />`), not a bespoke screen.

### Entry into the gate (apps/web/app/page.tsx)

- The home page is the canonical router that SENDS a user here. After the auth/invite/required-actions gates, `if (!isApproved(campUser, user.primaryEmail)) redirect("/pending-approval")` (page.tsx:61-63). Other protected pages do the same (e.g. `captains/camp-management/page.tsx:26`, `captains/tools/page.tsx:47`, `captains/announcements/page.tsx:26` all `redirect("/pending-approval")`), so a pending user is held on EVERY protected route, not just home (asserted in e2e: tests/e2e/authenticated.spec.ts:90-92). Full gating-chain ordering is unit 23.

### How a user lands in `pending` (apps/web/lib/users.ts + access-control.ts)

- A redeemed invite code carries `requiresApproval` (boolean). Env-var bootstrap codes are always `requiresApproval: false` (access-control.ts:48-49). DB codes carry the column value (schema.ts:336; comment: codes minted by non-captains are ALWAYS true).
- `redeemInviteForUser` (users.ts:111-153):
  - First-time redeemer: row created with `approvalStatus: claimed.requiresApproval ? "pending" : "approved"` (users.ts:149).
  - Existing row: `if (claimed.requiresApproval && existing.approvalStatus !== "pending") setUserApprovalStatus(existing.id, "pending")` (users.ts:135-137) — a vetting code "only ever tightens access into the queue" (it never down-grades an already-`rejected` or up-grades back to `approved`).
  - God accounts / users who already hold a code short-circuit `{ ok: true }` without spending a use (users.ts:122-124).

### The only non-sign-out exit: captain decision (apps/web/app/captains/camp-management/actions.ts → users.ts:decideUserApproval)

- `decideApprovalAction(userId, decision)` (actions.ts:75-96): captain-gated (`requireCaptain` requires signed-in + camp-active + `rank === "captain"`, actions.ts:30-43); validates `decision` is `"approved" | "rejected"` (actions.ts:82-84); blocks self-decision `if (userId === gate.captainId)` (actions.ts:85-87); then `decideUserApproval({ userId, status, decidedByUserId: captainId })` and `revalidatePath("/captains/camp-management")`.
- `decideUserApproval` (users.ts:253-260) → backend `setUserApproval`. Real DB (`burner-profile.ts:69-84`) stamps `approvalStatus`, `approvalDecidedByUserId`, `approvalDecidedAt`, `updatedAt`. Approving → next page load passes `isApproved` and the gate redirects to `/`. Rejecting → the same screen re-renders with `rejected` copy.
- E2E seam: `POST /api/test/set-approval` (api/test/set-approval/route.ts) forces `approvalStatus` via `testStore.setUserApprovalStatus` (no decider stamped) — used because the real captain UI reads the live DB and isn't drivable under E2E_TEST_MODE (route.ts:5-9).

## User actions & interactions

- **Sign out** — the single control: tap "Sign out" → navigates to `/auth/sign-out` (Neon Auth hosted sign-out flow). No client JS on this page; it is a plain anchor.
- **Passive re-check (no user action)** — the user "checks back" by reloading the page (copy: "just check back here"). There is NO polling, no realtime, no auto-refresh on this screen. The state transition happens entirely server-side on the next request once a captain has decided. (Contrast the global AcknowledgementGate which polls 45s — that is a different surface and does not apply here.)
- **No retry / appeal / resubmit affordance.** Rejected users get text-only guidance ("reach out to whoever invited you") — there is no in-app button to appeal or re-apply.
- **Implicit redirects on load** (not user-initiated): to `/auth/sign-in`, `/signup/required`, `/onboarding/questionnaire`, or `/` depending on which upstream gate is unsatisfied/cleared (see Features → re-validation).

## States & presentations

Global-states rows, mapped to THIS surface:

- **Empty** — n/a. There is no list/collection here; the screen has a single fixed message per branch.
- **Loading** — implicit RSC await of `getAuthenticatedUserOrRedirect` → `ensureCampUser` → `getBurnerProfile`. No skeleton/spinner is rendered; the page is server-rendered and arrives complete. No client loading state.
- **Populated** — the two terminal content states:
  - **Pending** (`approvalStatus === "pending"`): Clock icon (amber), "Application submitted", personalised thanks copy.
  - **Rejected** (`approvalStatus === "rejected"`): ShieldX icon (destructive), "Application not approved", terminal copy.
- **Validation-error** — n/a on the page (no form/input). Validation lives in the captain action (`decideApprovalAction` returns `{ ok:false, error }` for unknown decision / self-decision) and the test route (400 for bad body) — neither renders on this screen.
- **Submitting/pending** — the camp-level "pending" IS this whole screen (it represents `approvalStatus === "pending"`). No submit button exists here; the prior submission (the questionnaire) already happened upstream.
- **Success** — represented by ABSENCE: once `isApproved` is true the page redirects to `/` (page.tsx:36-38). There is no on-screen success banner; success = you never see this page again.
- **Disabled** — n/a (no toggleable/disabled controls; the lone Sign-out link is always active).
- **Invite-gated** — actively handled: `!hasCampAccess` → redirect `/signup/required` (page.tsx:32-34). A user with no invite never lingers here.
- **Onboarding-incomplete** — actively handled: `!profile?.completedAt` → redirect `/onboarding/questionnaire` (page.tsx:41-44). The gate refuses to show until the profile a captain reviews is complete.
- **Pending-approval** — the primary populated state (see above).
- **Rejected** — the terminal populated state (see above); no further transition is offered to the user (only a captain re-deciding, or sign-out).
- **Captain-only-locked** — n/a as a render here; but note the captain who would decide reaches camp-management via a separate surface, and a not-yet-approved captain-ranked user would themselves be bounced here (the gate keys on `approvalStatus`, not rank).

## Enums, options & configurable values

- **`approvalStatusEnum` (`approval_status`)** = `["pending", "approved", "rejected"]` (schema.ts:41-45). `notNull().default("approved")` (schema.ts:267-269) — so god accounts and every pre-gate account are `approved` by default; only a `requiresApproval` redeemer is created `pending`.
- **TS mirror of approval status** — `type ApprovalStatus = "pending" | "approved" | "rejected"` (users.ts:33); test mirror `TestApprovalStatus` identical (test-store.ts:10).
- **Captain decision domain** — `decideUserApproval` / `decideApprovalAction` accept only `"approved" | "rejected"` (users.ts:255-257, actions.ts:77) — a captain can never set `pending` (that is a signup-time state only).
- **`rankEnum` (`rank`)** = `["captain", "member"]` (schema.ts:31). Relevant because the gate keys on approval, not rank — a `member` or `captain` can both be `pending`/`rejected`. team-lead/driver are derived, not stored.
- **`inviteCodes.requiresApproval`** — boolean, `notNull().default(false)` (schema.ts:336); the upstream switch that decides whether a redeemer lands `pending`.
- **`isGodEmail`** — driven by `process.env.GOD_EMAILS` (CSV, lowercased, case-insensitive match — access-control.ts:28-32). God emails are always `isApproved` regardless of stored status, so they can never see this page.
- **Test seam approval values** — `POST /api/test/set-approval` body `status` ∈ `"pending" | "approved" | "rejected"` (route.ts:15, validated route.ts:24-27).
- **No tunable thresholds/timeouts on this surface** — no polling interval, no expiry, no auto-reject timer. The gate is purely state-driven.
- **Literal copy strings** (load-bearing for restyle — preserve meaning, not styling): page title `"Application pending — Camp 404"`; headings `"Application submitted"` / `"Application not approved"`; body strings as quoted in Features; button label `"Sign out"`.

## Data model touched

`users` table (packages/db/src/schema.ts:220-303) — fields this surface reads/depends on (must agree with unit 29):

- `id` uuid PK — used as `campUser.id` for `getBurnerProfile` and as the target of a captain decision.
- `authUserId` text notNull unique (`auth_user_id`) — join to Neon Auth identity; how `ensureCampUser` finds the row.
- `displayName` text nullable (`display_name`) — interpolated into the pending greeting.
- `inviteCode` text nullable (`invite_code`) — read by `hasCampAccess`; null (and non-god) → bounce to `/signup/required`.
- `rank` rankEnum notNull default `member` — not gated on here, but present on `CampUser`.
- **`approvalStatus`** approvalStatusEnum (`approval_status`) notNull default `approved` — THE field this surface exists for.
- **`approvalDecidedByUserId`** uuid nullable (`approval_decided_by_user_id`), self-FK to `users.id` onDelete `set null` — stamped by a captain's decision (audit).
- **`approvalDecidedAt`** timestamp nullable (`approval_decided_at`) — stamped by a captain's decision (audit).
- `updatedAt` timestamp — bumped on every approval write.

`burner_profiles` table (schema.ts:352-364) — read-only here:
- `userId` uuid PK (`user_id`) FK→users onDelete cascade.
- `completedAt` timestamp nullable (`completed_at`) — the ONLY field the page logic consults (`!profile?.completedAt` → redirect to questionnaire).
- (`getBurnerProfile` summary also returns `responses`, `updatedAt`, `version`, but this surface uses only `completedAt`.)

`invite_codes` table (schema.ts:312-342) — indirect (set upstream at redemption, not touched on this page):
- `requiresApproval` boolean notNull default false (`requires_approval`) — the switch that put the user into `pending`.
- `assignedRank` rankEnum nullable.

**Interfaces produced/consumed:**
- `CampUser { id, authUserId, displayName: string|null, profileImageUrl: string|null, inviteCode: string|null, rank: "captain"|"member", approvalStatus: "pending"|"approved"|"rejected" }` (users.ts:39-47). `toCampUser` defaults a null/absent `approvalStatus` to `"approved"` (users.ts:478).
- `AuthenticatedUser { id, primaryEmail: string|null, displayName: string|null }` (auth.ts:13-17).
- `BurnerProfileSummary { responses, completedAt: Date|null, updatedAt: Date|null, version: string|null }` (users.ts:155-160).
- Test row `TestUser` carries `approvalDecidedByUserId`/`approvalDecidedAt` too (test-store.ts:20-21), kept parallel to the real schema.

## Validation, edge cases & business rules

- **Re-entrancy / wrong-screen guard:** the page re-runs the entire upstream gate chain on each request (auth → invite → onboarding → approval), so it can never be shown to someone who belongs on a different gate. Order matters: invite-gate before approved-check before onboarding-check (page.tsx:32-44).
- **Auto-clear on approval:** because `isApproved` short-circuits to `/` (page.tsx:36-38), no client refresh logic is needed — a captain approving simply makes the next load redirect home. Likewise a god email always `isApproved` and is redirected away.
- **Synthetic-row safety:** a signed-in user with no row/no invite gets a synthetic `CampUser` with `id: ""` and `inviteCode: null` (users.ts:86-94); `hasCampAccess` reads false → they redirect to `/signup/required` before the empty id is ever used (users.ts:84-85). No orphan row is written.
- **God accounts never reach this screen:** they are auto-created `approved` with `inviteCode: null` (users.ts:70-80) and `isApproved`/`hasCampAccess` both short-circuit on god email.
- **Vetting only tightens:** `redeemInviteForUser` moves an existing user to `pending` only when `requiresApproval && status !== "pending"` (users.ts:135-137); it never overrides `rejected`→`pending` re-opening except via this exact path (a `rejected` user IS `!== "pending"`, so re-redeeming a vetting code WOULD set them back to `pending` — note this as a re-entry path).
- **Captain decision business rules:** captain-only (`rank === "captain"`, actions.ts:39-41); cannot decide own account (actions.ts:85-87); decision must be exactly `approved`/`rejected` (actions.ts:82-84); decision is audit-stamped (decider + timestamp) only on the real backend's `setUserApproval` (burner-profile.ts:69-84); the queue-drop `setUserApprovalStatus` (signup path / test seam) does NOT stamp a decider (burner-profile.ts:54-63).
- **Rejected is terminal for the user:** no in-app re-apply; the only state change is a captain re-deciding (e.g. `rejected → approved` via the same `decideApprovalAction`, which is permitted — there is no guard against deciding on an already-rejected user) or sign-out.
- **No offline/sync/budget states** apply (per product contract).
- **E2E_TEST_MODE divergence:** under `E2E_TEST_MODE=1` all reads/writes route through the in-memory `testStore` (users.ts:64, 165, etc.); `seedBurnerProfileAction`/`satisfyBurnerProfileAction`/`getPendingRequiredActions` are no-ops/empty (users.ts:192-217), so the page's `completedAt` legacy check is what actually gates onboarding completeness in tests. The real captain UI is not drivable in test mode (set-approval seam exists for this reason).
- **Edge: pending heading even when rejected metadata** — `metadata.title` is hardcoded `"Application pending"` and does not change on the rejected branch (page.tsx:17). Minor stale-truth.

## Sub-components / variants

- **`AuthShell` (apps/web/components/auth-shell.tsx)** — `"use client"` card chrome. Props `{ children, className?, footer?, hideBack? }`. The page uses `hideBack` (no Back button — page.tsx:49) and no `footer`. Renders a `min-h-svh` centred container on `bg-[color:var(--color-muted)]`, a `max-w-sm` wrapper, a `Card` with `CardContent`. When `!hideBack` it renders a ghost-variant Back button that calls `router.back()` — NOT used by this page.
- **`Button` (`@camp404/ui/components/button`)** — used as `variant="outline"`, `asChild`, `className="w-full"` wrapping the sign-out anchor. (Variants available: default/outline/ghost/destructive/secondary; sizes default/sm/lg/icon — only outline is used here.)
- **lucide icons** — `Clock` (pending) and `ShieldX` (rejected) from page.tsx:2; sized `h-7 w-7`, `aria-hidden`. These are the only icons on the surface (no entity icon set; this is an auth/lifecycle screen, not an entity surface).
- **Server-only data backends (users.ts)** — `realBackend` (Drizzle via `@camp404/db/burner-profile`) and `testBackend` (in-memory `testStore`), selected by `isE2ETestMode()`. Both implement the `UserBackend` interface (users.ts:264-298). The approval-relevant methods: `findUserByAuthId`, `createUser`, `setUserApprovalStatus`, `setUserApproval`, `getBurnerProfile`.
- **Captain decision action (apps/web/app/captains/camp-management/actions.ts)** — `decideApprovalAction` (server action, the exit) and its gate `requireCaptain`. Returns `ApprovalDecisionResult = { ok:true } | { ok:false; error:string }`. Lives on the captain surface (unit covering camp-management) but is the load-bearing counterpart to this gate.
- **Test-only route handler (apps/web/app/api/test/set-approval/route.ts)** — `runtime = "nodejs"`; 404s unless `isE2ETestMode()`; validates `{ authUserId, status }`; forces status via `testStore.setUserApprovalStatus`. Not user-facing; an E2E seam.
- **`/auth/[path]/page.tsx` sign-out fallback** — `/auth/sign-out` renders Neon Auth's `<AuthView path="sign-out" />` (no bespoke screen). The page's "Sign out" link depends on this fallback existing.
- **No dead/orphaned variants found** on this surface — both branches (pending/rejected) are live and tested (e2e: "Application submitted" tests/e2e/authenticated.spec.ts:88; "Application not approved" :134).

---

# 06 — Home — role-based control panel

**Files covered:**
- `apps/web/app/page.tsx` — the `/` route (server component); runs the full gating spine, derives viewer rank, builds the three rank layers, renders `<ControlPanel>` + `<EnablePush>`.
- `apps/web/app/home-header.tsx` — right-hand header slot: notifications bell (with unread badge → `/notifications`) and avatar (photo/initials → `/profile`).
- `packages/ui/src/components/control-panel.tsx` — the reusable `ControlPanel` and its sub-components (`ControlPanelHeaderBar`, `CentreButton`, `LayerTabBar`, `QuadrantTile`, plus orphan `ControlPanelHeader`); rank model, types, helpers.
- `apps/web/app/landing-hero.tsx` — signed-out fallback (glitch "404" hero) returned by `page.tsx` when there is no authenticated user.
- `apps/web/components/push/enable-push.tsx` — web-push opt-in, mounted under the control panel on the authenticated home only.
- `apps/web/lib/users.ts` — `ensureCampUser`, `hasCampAccess`, `isApproved`, `isTeamLead`, `getBurnerProfile`, `getPendingRequiredActions`, real-vs-test backends.
- `apps/web/lib/required-actions.ts` — `nextGate` + `ACTION_ROUTES` registry (action_key → built gate route).
- `apps/web/lib/notifications.ts` — `countUnread` facade (real DB / test store split).
- `apps/web/lib/auth.ts` — `getAuthenticatedUser` (Neon Auth session, or test-user cookie under E2E_TEST_MODE).
- `apps/web/lib/initials.ts` — `initialsFrom` for the avatar fallback.
- Supporting (read for exact values, not re-rendered here): `packages/db/src/roster.ts` (`isTeamLead`), `packages/db/src/activations.ts` (`getPendingRequiredActions`, `PendingRequiredAction`), `packages/db/src/broadcasts.ts` (`countUnread`), `packages/db/src/schema.ts` (enums/columns).

**Purpose:** The home route (`/`) is Camp 404's role-based command centre — the answer to "what do I need to do, who needs what from me?" It first runs the full auth/access/onboarding/approval gating spine (`page.tsx:29-63`), bouncing any user who hasn't earned the app to the appropriate gate, then renders a single layered 2×2 quadrant navigation panel. The viewer's stored rank (+ derived team-lead) decides which of three layers (`camp_member` / `team_lead` / `captain`) are unlocked; layers above the viewer's clearance stay browsable but visually locked. A circular push-to-talk "TALK" button sits dead-centre, and the header carries a brand title, an unread-notifications bell, and the member's avatar. A best-effort web-push opt-in is mounted beneath it.

## Features

### `/` route gating + render (`apps/web/app/page.tsx`)
- `export const dynamic = "force-dynamic"` (`page.tsx:27`) — reads the Neon Auth session cookie every request; cannot be statically prerendered.
- **Gating spine, in order** (`page.tsx:29-63`):
  1. `getAuthenticatedUser()` → if `null`, returns `<LandingHero />` (signed-out branch; no redirect — renders inline) (`page.tsx:30-34`).
  2. `ensureCampUser(user)` then **invite gate**: `if (!hasCampAccess(campUser, user.primaryEmail)) redirect("/signup/required")` (`page.tsx:39-42`). God accounts (`GOD_EMAILS`) bypass; everyone else must hold a redeemed `inviteCode`.
  3. **Generic required_actions gate**: `const gate = nextGate(await getPendingRequiredActions(campUser.id)); if (gate) redirect(gate)` (`page.tsx:47-48`). Routes to the first pending **blocking** action that maps to a built page (today only `burner_profile` → `/onboarding/questionnaire`).
  4. **Belt-and-braces legacy fallback** (one release): `const profile = await getBurnerProfile(campUser.id); if (!profile?.completedAt) redirect("/onboarding/questionnaire")` (`page.tsx:53-56`). Explicitly marked to be dropped once `required_actions` seeding is confirmed in prod.
  5. **Captain-approval gate**: `if (!isApproved(campUser, user.primaryEmail)) redirect("/pending-approval")` (`page.tsx:61-63`).
- **Viewer-rank derivation** (`page.tsx:73-78`): `campUser.rank === "captain"` → `"captain"`; else `await isTeamLead(campUser.id)` → `"team_lead"`; else `"camp_member"`. (Maps stored rank `captain | member` + derived team-lead onto UI-local `ControlPanelRank`.)
- **Parallelised reads**: `countUnread(campUser.id)` is kicked off as `unreadPromise` (`page.tsx:68`) alongside the `isTeamLead` probe rather than serially; awaited at `page.tsx:80`.
- **Avatar initials**: `initialsFrom(campUser.displayName ?? user.primaryEmail)` (`page.tsx:65`).
- Renders `<ControlPanel layers={homeLayers} viewerRank={viewerRank} header={<HomeHeader …/>} centre={{ label: "TALK" }} />` then `<EnablePush />` (`page.tsx:82-99`).

### Control panel shell (`control-panel.tsx` → `ControlPanel`)
- Root container: `flex h-[100dvh] w-full flex-col` on `--color-background` (`control-panel.tsx:127-132`). NOTE: full-bleed `w-full`, no `max-w-lg` wrapper here or in `layout.tsx` (which renders `{children}` directly in `<body>`); the product-wide `max-w-lg` constraint is not applied to this surface. `<!-- low-confidence: whether a max-width wrapper is expected here vs the panel intentionally going edge-to-edge; layout.tsx applies none -->`
- Structure top→bottom: header bar → quadrant grid + centre button → layer tab bar.
- Active-layer state: `const [active, setActive] = React.useState(() => clamp(initialLayer, 0, layers.length-1))` (`control-panel.tsx:111-113`); `initialLayer` defaults to `0`.
- `const layer = layers[active]; if (!layer) return null` (`control-panel.tsx:115-116`) — renders nothing if active index is out of range.
- `const unlocked = rankLevel(viewerRank) >= rankLevel(layer.rank)` (`control-panel.tsx:118`) — drives whether the four tiles of the active layer are interactive.
- Layer switch: `selectLayer(index)` sets active + fires `onLayerChange?.(index, next)` (`control-panel.tsx:120-124`).
- Quadrant grid: `grid grid-cols-2 grid-rows-2 gap-px` on `--color-border` (1px hairline gap = grid lines), keyed by `active` to re-trigger entry animation `animate-[cp-layer-in_200ms_ease-out]` (`control-panel.tsx:136-139`).

### Header bar (`ControlPanelHeaderBar`)
- Fixed `h-14`, bottom border `--color-border`, padded `px-4` (`control-panel.tsx:187`).
- Left: brand `title` (`text-base font-semibold tracking-tight`), default `"Camp 404"` (`control-panel.tsx:104, 188`).
- Right: the `header` slot node (here `<HomeHeader>`), in a `flex items-center gap-2` container (`control-panel.tsx:189`).

### Home header content (`home-header.tsx` → `HomeHeader`)
- **Bell link** → `/notifications` (`home-header.tsx:26-44`): `Bell` icon (`h-5 w-5`); `aria-label` is `Notifications (${notifications} unread)` when there are unread, else `"Notifications"`.
- **Unread badge**: rendered only when `notifications` is truthy. Displays the count, or `"99+"` when `notifications > 99` (`home-header.tsx:41`). Pinned top-right of the bell, `--color-primary` fill / `--color-primary-foreground` text.
- **Avatar link** → `/profile` (`home-header.tsx:45-54`), `aria-label="Your profile"`. `Avatar` `h-8 w-8`: shows `<AvatarImage src={imageUrl}>` when `imageUrl` set, otherwise `<AvatarFallback>{initials}</AvatarFallback>` (`text-xs`).

### Centre push-to-talk button (`CentreButton`)
- Rendered only when `centre` prop is supplied (`control-panel.tsx:166`); home always passes `{ label: "TALK" }`.
- Absolutely centred circle, `w-[22%] min-w-[5rem] max-w-[7rem]`, `aspect-square`, `--color-primary` fill, `ring-4` of `--color-background` (`control-panel.tsx:205`).
- Icon defaults to `<Mic className="h-5 w-5">`; label defaults to `"TALK"` (`control-panel.tsx:195-196`).
- Press handlers: `onPointerDown → centre.onPress`; `onPointerUp`, `onPointerLeave`, `onPointerCancel → centre.onRelease` (`control-panel.tsx:201-204`). NOTE: home passes neither `onPress` nor `onRelease`, so on the home surface the TALK button is a no-op (no voice wiring yet).
- `aria-label`: `centre.ariaLabel ?? label`.

### Layer tab bar (`LayerTabBar`)
- `<nav aria-label="Switch rank view">`, `h-14`, top border `--color-border` (`control-panel.tsx:227-229`).
- One button per layer, labelled with the short `RANK_TAB_LABEL` (`Me` / `Team Lead` / `Captain`) (`control-panel.tsx:253`).
- Locked tab (`rankLevel(viewerRank) < rankLevel(layer.rank)`) shows a `Lock` icon (`h-3 w-3`) and `aria-label` `"${RANK_LABEL[rank]} view (locked, view only)"`; unlocked label is `"${RANK_LABEL[rank]} view"` (`control-panel.tsx:233, 240-244, 254`).
- Active tab: `aria-pressed`, `--color-primary` text + an underline indicator pill (`control-panel.tsx:239, 247-261`).
- Clicking any tab (locked or not) calls `onSelect(index)` → switches the visible layer; locking only affects tile interactivity, never whether you can browse the layer.

### Quadrant tile (`QuadrantTile`)
- Body: icon row (`quadrant.icon` + `Lock` icon `h-3.5 w-3.5` when `locked`), `label` (`text-base font-semibold`), optional `hint` (`text-xs` muted) (`control-panel.tsx:296-311`).
- **Corner alignment** by `corner` via `CORNER_ALIGN` (`control-panel.tsx:269-274`): `tl` items-start/justify-start/left, `tr` items-end/justify-start/right, `bl` items-start/justify-end/left, `br` items-end/justify-end/right. (Tiles hug their outer corner; titles sit in the corner nearest the screen edge.)
- **Badge**: rendered only when `quadrant.badge != null && badge !== "" && badge !== 0` (`control-panel.tsx:313-314`); pinned to top edge per `BADGE_CORNER` (`tl`/`bl` → `top-3 left-3`; `tr`/`br` → `top-3 right-3`) so it never collides with bottom-row corner-aligned text (`control-panel.tsx:278-283`). Fill `--color-primary`. NOTE: home layers set no `badge` on any quadrant — feature exists but is unused on this surface.
- **Render mode** (`control-panel.tsx:331-362`):
  - `locked` → `<div aria-disabled="true" class="opacity-45">` (non-interactive, no link/onClick).
  - else `quadrant.href` set → `<a href>` with `onClick={onSelect}` (plain anchor, not Next `<Link>`).
  - else → `<button onClick={onSelect}>` (fires `onQuadrantSelect`).
  - NOTE on home: all `camp_member` tiles + captain `Camp Management`/`Camp Tools` have `href`; the rest (all `team_lead` tiles, captain `Camp Tasks`/`Finances`) have **no `href` and no `onQuadrantSelect` handler is passed by `page.tsx`** → unlocked-but-hrefless tiles render as buttons whose click does nothing. (See Validation/edge-cases.)

### Web push opt-in (`enable-push.tsx` → `EnablePush`)
- Mounted only on the authenticated home (`page.tsx:98`) so it never prompts signed-out visitors.
- State machine `"loading" | "unavailable" | "default" | "granted" | "denied"` (`enable-push.tsx:16`).
- On mount: detects FCM support (`getMessagingIfSupported`), `Notification`, `serviceWorker`; if unsupported → `"unavailable"`; reads `Notification.permission` → `granted` (auto-registers token) / `denied` / `default` (`enable-push.tsx:48-73`).
- Renders **nothing** unless `state === "default"` (`enable-push.tsx:100`); then shows a `secondary`/`sm` "Enable notifications" `Button` that calls `Notification.requestPermission()` on click (user gesture, required by Safari) and registers the FCM token on grant (`enable-push.tsx:102-124`).
- `registerToken()` registers `/firebase-messaging-sw.js`, gets an FCM token with `VAPID_KEY`, POSTs `{ token, platform: "web" }` to `/api/push/tokens` (`enable-push.tsx:25-42`).
- Foreground-message listener (only while `granted`): validates payload with zod `FcmNotification = { title: string.min(1), body?: string }` and shows a `Notification` with `icon: "/icon.svg"` (`enable-push.tsx:20-23, 78-98`). Single subscription, cleaned up on unmount.

### Signed-out hero (`landing-hero.tsx` → `LandingHero`)
- Returned when there's no session (`page.tsx:33`). Full-screen glitch "404" art (scanlines/noise/scanbeam, RGB-split + tear-clip animations), brand line `"Camp 404"` and `"Error 404 — Camp not found"`.
- Single CTA: `Button` `size="lg"` "Are you lost?" → `<a href="/auth/sign-in">` (`landing-hero.tsx:32-34`). Terminal cursor flourish `"$ awaiting input_"`.
- All bespoke glitch CSS is inline in `glitchStyles` (`landing-hero.tsx:77-230`); references `--color-foreground`/`accent`/`primary`.

## User actions & interactions
- **Tap a quadrant tile** (unlocked + href): navigate via plain `<a>` to that destination. Home destinations (`page.tsx:103-179`):
  - camp_member: `My Teams` → `/members`; `My Tasks` → `/meals`; `My Profile` → `/onboarding/questionnaire`; `Tools` → `/tools`. **NOTE:** `My Teams` (`/members`, `page.tsx:107-111`) and `My Tasks` (`/meals`, `page.tsx:112-117`) are presented as working nav but are dead links — there is no `app/members/page.tsx`, no `app/meals/page.tsx`, and no `middleware.ts` rewrite, so both 404 on click. Same inert caveat as the hrefless team_lead/captain tiles (different mechanism: 404 vs no-op). Only `My Profile` (`/onboarding/questionnaire`) and `Tools` (`/tools`) actually resolve.
  - team_lead: all four tiles have **no href** (Team Roster / Team Tasks / Lead Profile / Team Tools).
  - captain: `Camp Management` → `/captains/camp-management`; `Camp Tools` → `/captains/tools`; `Camp Tasks` and `Finances` have **no href**.
- **Tap a quadrant tile** (unlocked, no href): fires `onQuadrantSelect(quadrant, corner, layer)` — but home passes no handler, so it's inert.
- **Tap a locked tile**: nothing (rendered as `aria-disabled` div).
- **Tap a layer tab** (`Me` / `Team Lead` / `Captain`): switch the visible layer, even when locked (browse-only).
- **Press/hold the centre TALK button**: would fire `onPress`/`onRelease`; home wires neither → inert on this surface.
- **Tap the bell** → `/notifications`. **Tap the avatar** → `/profile`.
- **Tap "Enable notifications"** (push `default` state only): request browser permission, register FCM token.
- **Signed-out: tap "Are you lost?"** → `/auth/sign-in`.

## States & presentations
Global-states rows that apply to this surface:
- **Empty** — unread badge: when `countUnread` returns `0` (or falsy), no badge renders (`home-header.tsx:36`). Avatar with no `imageUrl` falls back to initials (or `"?"` from `initialsFrom`). No quadrant badges anywhere on home.
- **Loading** — server-rendered; the page awaits all reads before returning, so there is no client loading state for the panel itself. Push opt-in has an internal `"loading"` state that renders nothing.
- **Populated** — normal authenticated render: header (title + bell[+badge] + avatar), the viewer's unlocked layer + locked higher layers, centre TALK, tab bar.
- **Validation-error** — N/A on this surface (no forms submitted from home). EnablePush handles permission failure by flipping state (`denied`/`unavailable`), not a validation banner.
- **Submitting/pending** — N/A for the panel. (Push permission request is the only async user action; no submit UI.)
- **Success** — N/A (no submit). Push grant → token registered silently, button disappears.
- **Disabled** — locked quadrant tiles render `aria-disabled="true"` at `opacity-45` with a `Lock` glyph. Unlocked-but-hrefless tiles are technically enabled buttons that do nothing (see edge cases). The camp_member `My Teams` (`/members`) and `My Tasks` (`/meals`) tiles look enabled and navigate, but their targets 404 (no page/route exists) — also dead, just via a different mechanism (see edge cases).
- **Invite-gated** — `!hasCampAccess` → `redirect("/signup/required")` (`page.tsx:40-42`).
- **Onboarding-incomplete** — `nextGate(pending blocking required_actions)` → `/onboarding/questionnaire` (and legacy `!profile.completedAt` fallback) (`page.tsx:47-56`).
- **Pending-approval** — `!isApproved` with `approvalStatus === "pending"` → `redirect("/pending-approval")` (`page.tsx:61-63`).
- **Rejected** — terminal: `approvalStatus === "rejected"` also fails `isApproved` → `redirect("/pending-approval")`. NOTE: `page.tsx` routes both `pending` and `rejected` to `/pending-approval`; the rejected-specific copy lives on that route, not here.
- **Captain-only-locked (rank below surface)** — higher-rank layers render **visible but locked**: tiles `opacity-45` + `Lock` icon, tabs labelled "(locked, view only)" + `Lock` glyph. Whether a layer is locked = `rankLevel(viewerRank) < rankLevel(layer.rank)`.
- **Signed-out** — `<LandingHero />` (not a redirect; rendered inline).
- **Layer-entry animation** — each layer switch replays `cp-layer-in_200ms_ease-out`.

## Enums, options & configurable values
- **`ControlPanelRank`** (UI-local, `control-panel.tsx:13`): `"camp_member" | "team_lead" | "captain"`.
- **`RANK_ORDER`** (`control-panel.tsx:16`): `["camp_member", "team_lead", "captain"]` — index doubles as clearance level via `rankLevel()`.
- **`RANK_LABEL`** (`control-panel.tsx:18-22`): `camp_member: "Camp Member"`, `team_lead: "Team Lead"`, `captain: "Captain"`.
- **`RANK_TAB_LABEL`** (`control-panel.tsx:25-29`): `camp_member: "Me"`, `team_lead: "Team Lead"`, `captain: "Captain"`.
- **`ControlPanelCorner`** (`control-panel.tsx:35`): `"tl" | "tr" | "bl" | "br"`.
- **Centre defaults**: `label = "TALK"` (`control-panel.tsx:195`); `icon = <Mic/>` (`control-panel.tsx:196`); `title` default `"Camp 404"` (`control-panel.tsx:104`); `initialLayer` default `0` (`control-panel.tsx:74, 103`); `viewerRank` default `"camp_member"` (`control-panel.tsx:72, 102`).
- **Badge truthiness**: shown unless `null`/`""`/`0` (`control-panel.tsx:314`).
- **Unread badge cap**: shows `"99+"` for counts `> 99` (`home-header.tsx:41`).
- **Push state enum** (`enable-push.tsx:16`): `"loading" | "unavailable" | "default" | "granted" | "denied"`; push payload posts `platform: "web"`.
- **Home layer config** (`page.tsx:103-179`) — verbatim labels/hints/icons:
  - camp_member: TL `My Teams` "Your crews" `Users` → `/members`; TR `My Tasks` "What's on you" `ListChecks` → `/meals`; BL `My Profile` "You & your data" `UserRound` → `/onboarding/questionnaire`; BR `Tools` "Meals, expenses…" `Wrench` → `/tools`.
  - team_lead: TL `Team Roster` "Members in your team" `Users`; TR `Team Tasks` "Assign & track work" `ListChecks`; BL `Lead Profile` "Your team setup" `UserRound`; BR `Team Tools` "Shifts, notices…" `Wrench`. (no hrefs)
  - captain: TL `Camp Management` "Roster & statuses" `Users` → `/captains/camp-management`; TR `Camp Tasks` "Camp-wide work board" `ListChecks`; BL `Finances` "Dues & reimbursements" `UserRound`; BR `Camp Tools` "Announcements, ops…" `Wrench` → `/captains/tools`. (TR/BL no hrefs)
- **Stored rank enum** `rank` (`schema.ts:31`): `["captain", "member"]`.
- **`approval_status` enum** (`schema.ts:41-45`): `["pending", "approved", "rejected"]`.
- **`required_action_type` enum** (`schema.ts:99-104`): `["questionnaire", "acknowledgement", "payment", "profile_update"]`.
- **`required_action_status` enum** (`schema.ts:106-111`): `["pending", "completed", "waived", "expired"]`.
- **`ACTION_ROUTES` registry** (`required-actions.ts:7-11`): `{ burner_profile: "/onboarding/questionnaire" }` (only key with a built page; `dietary_requirements`/`driver_profile` commented as future).
- **Brand tokens referenced** (`globals.css`): `--color-primary: oklch(0.65 0.27 340)`; `--color-accent: oklch(0.62 0.18 255)`; `--color-background: oklch(0.15 0.05 295)`; `--color-primary-foreground: oklch(0.99 0.005 340)`; `--radius: 0.625rem`.

## Data model touched
(Field names exact; must agree with unit 29.)
- **`users`** (`schema.ts`) — read via `ensureCampUser`/`findUserByAuthId` → `CampUser` (`lib/users.ts:39-47`): `id`, `authUserId` (`auth_user_id`), `displayName` (`display_name`), `profileImageUrl` (`profile_image_url`), `inviteCode` (`invite_code`), `rank` (`rank`, default `"member"`), `approvalStatus` (`approval_status`, default per schema). The home page uses: `campUser.rank`, `campUser.approvalStatus` (via `isApproved`), `campUser.inviteCode` (via `hasCampAccess`), `campUser.displayName`, `campUser.profileImageUrl`, `campUser.id`. Auth fields `user.id`, `user.primaryEmail`, `user.displayName` come from `AuthenticatedUser` (`lib/auth.ts:13-17`).
- **`burner_profiles`** — read via `getBurnerProfile` → `BurnerProfileSummary { responses, completedAt, updatedAt, version }` (`lib/users.ts:155-167`). Home uses only `completedAt` (legacy fallback gate, `page.tsx:54`).
- **`required_actions`** — read via `getPendingRequiredActions` → `PendingRequiredAction { actionKey, type, title, version, blocking, dueAt, createdAt }` (`activations.ts:16-24, 203-226`); query filters `status = 'pending'` AND `blocking = true`, ordered `createdAt` ASC (`activations.ts:218-225`). `nextGate` reads `actionKey` + `blocking`.
- **`team_memberships`** — `isTeamLead(userId)` existence check: `team_memberships.user_id = userId AND is_lead = true` (`roster.ts:204-217`). Drives the derived `team_lead` rank. (`is_lead` is the only source of team-lead — never stored on `users`.)
- **`notification_deliveries`** — `countUnread(userId)` = `count(*)` where `user_id = userId AND read_at IS NULL` (`broadcasts.ts:496-508`). Feeds the bell badge.
- **`invite_codes`** (indirect) — `hasCampAccess`/`redeemInviteForUser` path; not read on a populated home render beyond the `inviteCode` already on the user row.
- **Test-mode backend**: under `E2E_TEST_MODE`, all of the above route through `testStore` (`lib/users.ts:410-460`, `lib/notifications.ts:84-115`); `getPendingRequiredActions` returns `[]` (`lib/users.ts:215`), and `isTeamLead` always returns `false` (the in-memory store models no team memberships) (`lib/users.ts:448`).

## Validation, edge cases & business rules
- **Gate ordering is load-bearing** (`page.tsx:29-63`): auth → invite → required-actions → legacy-profile → approval. Reordering changes which gate a partially-onboarded user hits first.
- **God accounts** (`GOD_EMAILS`, case-insensitive CSV env, `access-control.ts:28-30`) bypass both the invite gate (`hasCampAccess`) and the approval gate (`isApproved`) — they're auto-created as `rank: "member"`, `approvalStatus: "approved"` on first sign-in (`lib/users.ts:70-80`).
- **Synthetic non-persisted user**: a signed-in user with no row and no invite gets a throwaway `CampUser` with `id: ""`, `inviteCode: null` so `hasCampAccess` is false and they're bounced to `/signup/required` without writing an orphan row (`lib/users.ts:84-95`). The empty `id` is never used because the redirect fires first.
- **`nextGate` never strands a user**: it skips any pending action whose `actionKey` has no mapped route (`required-actions.ts:23-29`) — a blocking action with no built page does not gate. Non-blocking actions are skipped too.
- **Legacy `completedAt` fallback is intentional dead-weight** (one release), to be removed once `required_actions` seeding is confirmed in prod (`page.tsx:50-56`).
- **Rejected vs pending both → `/pending-approval`**: `isApproved` is false for any non-`approved` status; the route disambiguates.
- **Rank/clearance rule**: a layer is interactive iff `rankLevel(viewerRank) >= rankLevel(layer.rank)`; higher layers stay browsable but locked. Captains see all three layers unlocked; a team-lead sees member+team-lead unlocked, captain locked; a plain member sees only the member layer unlocked.
- **Hrefless unlocked tiles are inert** (UGLY TRUTH): all four `team_lead` tiles and captain `Camp Tasks`/`Finances` have no `href`, and `page.tsx` passes **no `onQuadrantSelect`** handler. For an unlocked viewer these render as enabled `<button>`s whose `onClick` does nothing — features stubbed pending destination pages.
- **camp_member `My Teams`/`My Tasks` hrefs are dead links** (UGLY TRUTH): the camp_member layer wires `My Teams → /members` (`page.tsx:107-111`) and `My Tasks → /meals` (`page.tsx:112-117`) as plain `<a href>` tiles, so they look like working nav — but there is no `app/members/page.tsx`, no `app/meals/page.tsx`, and no `middleware.ts` rewrite to redirect them, so both routes 404 on click. Same net result as the hrefless team_lead/captain tiles (a tap that goes nowhere) via a different mechanism: 404 navigation vs no-op button. Only `My Profile → /onboarding/questionnaire` and `Tools → /tools` actually resolve on this layer. Consistent with unit 00's IA route table (`00-overview.md` §5), which lists only built routes and therefore carries **no** `/members` or `/meals` row — the two docs agree these destinations have no page.
- **TALK button is inert on home** (UGLY TRUTH): `centre={{ label: "TALK" }}` only — no `onPress`/`onRelease`, so the centre button is non-functional on this surface (voice pipeline not wired in).
- **Quadrant nav uses a plain `<a>`, not Next `<Link>`** (`control-panel.tsx:342`) — full document navigation, not client-side routing. (The header uses `<Link>`; the panel does not.)
- **`ControlPanel` returns `null`** if `layers[active]` is undefined (`control-panel.tsx:115-116`); `active` is clamped to `[0, layers.length-1]` on init but `initialLayer` out of range is clamped, not errored.
- **Unread badge hidden on 0/falsy**; capped display at `"99+"`.
- **Avatar `initialsFrom`** splits on whitespace/`@`/`.`, takes first 2 parts' first letters uppercased, returns `"?"` when nothing usable (`initials.ts:6-17`).
- **EnablePush is best-effort**: renders nothing when push is unsupported/denied/granted; only the `default` (undecided) state shows the button; permission must be requested on a user gesture (Safari). FCM payload validated with zod before constructing a `Notification`.
- **No `max-w-lg` constraint applied** to the control panel on this surface (`w-full` / `h-[100dvh]`, `layout.tsx` adds no wrapper).
- **Global feedback layer** is mounted app-wide in `layout.tsx` (`AcknowledgementGate`, `FeedbackGate aiAvailable={!!ANTHROPIC_API_KEY}`) — present over the home surface but owned by the global feedback unit, not this one.

## Sub-components / variants
- **`ControlPanel`** (exported) — the surface used by home. Active component.
- **`ControlPanelHeaderBar`** — internal; brand title + header slot.
- **`CentreButton`** — internal; push-to-talk circle (rendered only when `centre` supplied).
- **`LayerTabBar`** — internal; rank tab switcher with locked-tab affordances.
- **`QuadrantTile`** — internal; three render modes (locked div / `<a href>` / `<button>`); badge + corner-alignment logic.
- **`HomeHeader`** (`home-header.tsx`, exported) — the concrete header slot passed by home (bell + avatar). Active.
- **`EnablePush`** (`enable-push.tsx`, exported) — web-push opt-in. Active.
- **`LandingHero`** (`landing-hero.tsx`, exported) — signed-out fallback. Active.
- **`ControlPanelHeader`** (`control-panel.tsx:376-401`, exported) — ORPHAN on this surface: a generic default header (Sign-in/userName button + Settings gear, `onAuth`/`onSettings`). NOT used by `page.tsx` (home passes `<HomeHeader>` instead). Kept as the component's default-header offering; `Settings`/`UserRound` lucide imports exist only for it. Flag as dead on the home path. `<!-- low-confidence: whether ControlPanelHeader is used by any other route; not referenced from page.tsx -->`
- **Helpers/types exported** from `control-panel.tsx`: `ControlPanelRank`, `RANK_LABEL`, `rankLevel`, `ControlPanelCorner`, `ControlPanelQuadrant`, `ControlPanelLayer`, `ControlPanelCentre`, `ControlPanelProps`, `ControlPanelHeaderProps`. (`RANK_ORDER`, `RANK_TAB_LABEL`, `clamp`, `CORNER_ALIGN`, `BADGE_CORNER` are module-private.)

---

# 07 — Profile view

**Files covered:**
- `apps/web/app/profile/page.tsx` — the read-only profile card route (Server Component, `force-dynamic`); the surface this brief covers in full.
- `apps/web/lib/auth.ts` — `getAuthenticatedUserOrRedirect()` + `AuthenticatedUser` shape (Neon Auth session or E2E test cookie); supplies `id`, `primaryEmail`, `displayName`.
- `apps/web/lib/users.ts` — `ensureCampUser`, `getBurnerProfile`, `hasCampAccess`, `isApproved`, the `CampUser`/`BurnerProfileSummary` shapes and the real/test backends behind them.
- `apps/web/lib/access-control.ts` — `isGodEmail()` (god-account bypass for both gates).
- `apps/web/lib/initials.ts` — `initialsFrom()` avatar-fallback derivation.
- `packages/ui/src/components/avatar.tsx` — `Avatar`/`AvatarImage`/`AvatarFallback` primitives the card renders.
- `packages/ui/src/components/card.tsx` — `Card`/`CardContent` wrapper.
- `packages/ui/src/components/button.tsx` — `Button` (`asChild`) used for the "Edit profile" link.
- `apps/web/app/api/avatar/route.ts` — same-origin private-blob proxy that actually serves the photo bytes referenced by `campUser.profileImageUrl`.
- `packages/db/src/schema.ts` — `users` + `burner_profiles` tables (field-level source of truth).
- `packages/db/src/burner-profile.ts` — `getBurnerProfileByUserId()` query feeding `getBurnerProfile`.

**Purpose:** A read-only "this is me" card for the signed-in camp member: large circular avatar (uploaded photo or initials fallback), display name, a rank badge (Captain / Member), and the account email. It is the terminal, fully-onboarded view — reaching it proves the viewer has cleared every gate (authenticated → invite-redeemed → burner profile completed → captain-approved). It offers three navigations only: edit profile (unit 08), review questionnaire answers, and sign out. It performs NO writes; editing, avatar upload, and questionnaire replay all live on other surfaces.

## Features

### Profile route (`apps/web/app/profile/page.tsx`)
- **Server Component, always dynamic.** `export const dynamic = "force-dynamic"` (`page.tsx:21`) — the Neon Auth session is read on every request; never statically cached.
- **Full gate spine re-run on every load** before any UI renders (`page.tsx:24-36`). In order:
  1. `getAuthenticatedUserOrRedirect()` → `redirect("/auth/sign-in")` if no session (`auth.ts:40-44`).
  2. `ensureCampUser(authUser)` resolves/synthesises the camp row (`users.ts:60-95`).
  3. `if (!hasCampAccess(campUser, authUser.primaryEmail)) redirect("/signup/required")` — invite gate (`page.tsx:26-28`).
  4. `getBurnerProfile(campUser.id)` then `if (!profile?.completedAt) redirect("/onboarding/questionnaire")` — onboarding gate (`page.tsx:29-33`).
  5. `if (!isApproved(campUser, authUser.primaryEmail)) redirect("/pending-approval")` — captain-approval gate (`page.tsx:34-36`).
- **Display-name resolution** (`page.tsx:38`): `campUser.displayName ?? authUser.primaryEmail ?? "Burner"` — falls back to email, then the literal string `"Burner"`.
- **Avatar initials** (`page.tsx:39`): `initialsFrom(campUser.displayName ?? authUser.primaryEmail)` — passes name-or-email (NOT the `"Burner"` literal) to the helper.
- **Rank label** (`page.tsx:40`): `campUser.rank === "captain" ? "Captain" : "Member"`. Note: this is a LOCAL ternary, NOT the shared `rankLabel()` helper in `lib/camp-roster.ts`; this surface has no "Team Lead" derivation — a team lead shows as **"Member"** here.
- **Avatar render** (`page.tsx:46-51`): `Avatar` sized `h-32 w-32 text-3xl`; renders `<AvatarImage src={campUser.profileImageUrl} alt={name}>` ONLY when `campUser.profileImageUrl` is truthy, with `<AvatarFallback>{initials}</AvatarFallback>` always present underneath.
- **Identity block** (`page.tsx:53-63`): `<h1>` name; a pill badge with the rank label; and the email line rendered ONLY when `authUser.primaryEmail` is truthy.
- **Edit profile button** (`page.tsx:65-70`): `Button asChild` wrapping `<Link href="/profile/edit">` with a `Pencil` icon (`h-4 w-4`, `aria-hidden`) + text "Edit profile". → unit 08.
- **Questionnaire review link** (`page.tsx:74-83`): helper sentence "Want to update your burner questionnaire answers? Review them here." → `<Link href="/onboarding/questionnaire">`.
- **Sign-out link** (`page.tsx:84-91`): a plain `<a href="/auth/sign-out">` (full navigation, NOT a client `Link`) labelled "Sign out". This is the universal gate-exit on this surface.

### Avatar bytes proxy (`apps/web/app/api/avatar/route.ts`)
The profile photo `src` is a same-origin URL of the form `/api/avatar?pathname=…` (persisted by the uploader; see schema comment `schema.ts:224-229`). This route, not the profile page, fetches the private Vercel Blob and streams it. Load-bearing for whether the photo appears:
- `runtime = "nodejs"` (`route.ts:7`).
- 401 if not signed in (`route.ts:25-28`); 401 if no camp row or `!isApproved(campUser, user.primaryEmail)` (`route.ts:31-34`) — so a pending/rejected viewer's `<img>` simply fails to load.
- 400 if `pathname` query param missing (`route.ts:36-39`); 404 if `pathname` does not start with `"avatars/"` (`route.ts:40-43`).
- 404 when `isE2ETestMode()` or no `BLOB_READ_WRITE_TOKEN` (`route.ts:45-49`) — in E2E/local there are no avatar bytes, so the fallback initials always show.
- On success streams the blob with `Content-Type` from the blob, `Cache-Control: private, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff` (`route.ts:58-67`); any error or non-200/`null` result → 404 (`route.ts:55-71`).

## User actions & interactions
- **Tap "Edit profile"** → navigate to `/profile/edit` (unit 08).
- **Tap "Review them here"** → navigate to `/onboarding/questionnaire` (questionnaire replay).
- **Tap "Sign out"** → hard navigation to `/auth/sign-out`.
- No other interactivity. There are NO form fields, NO buttons that mutate state, NO async client actions, NO optimistic UI. The page is purely declarative output of server-resolved data.

## States & presentations
Applicable global-states rows for this surface:

- **Empty** — Not a list/collection surface, so no zero-rows empty state. The closest analogues are nullable single fields: no uploaded photo → initials (or `"?"`) fallback avatar; no `displayName` → email (or `"Burner"`) as the heading; no `primaryEmail` → the email line is omitted entirely (`page.tsx:58-62`).
- **Loading** — Server-rendered; no client loading spinner on the page itself. The avatar image has a built-in loading window: Radix `AvatarImage` shows the `AvatarFallback` (initials) until the proxied photo finishes loading (`avatar.tsx:7-11`).
- **Populated** — The normal state: avatar (photo or initials), name, rank badge, email, and the three navigations.
- **Validation-error** — N/A. No inputs on this surface; validation lives in unit 08.
- **Submitting/pending** — N/A. No mutations originate here.
- **Success** — N/A. No mutation, so no success toast/confirmation.
- **Disabled** — N/A. No disabled controls; the underlying `Button` does carry `disabled:pointer-events-none disabled:opacity-50` (`button.tsx:8`) but this surface never disables it.
- **Invite-gated** — `!hasCampAccess` → `redirect("/signup/required")` (`page.tsx:26-28`). `hasCampAccess` is true for a god email or any non-null `inviteCode` (`users.ts:219-224`). The page itself never renders an invite-gated state — it bounces.
- **Onboarding-incomplete** — `!profile?.completedAt` → `redirect("/onboarding/questionnaire")` (`page.tsx:31-33`). Gate is the burner profile's `completedAt` timestamp, NOT a `required_actions` row, on this surface. (Note: the comment at `users.ts:187-191` flags `completedAt` as the "legacy" fallback that still gates here.)
- **Pending-approval** — `!isApproved` with `approvalStatus === "pending"` → `redirect("/pending-approval")` (`page.tsx:34-36`).
- **Rejected** — Same redirect branch: `approvalStatus === "rejected"` is also not `"approved"`, so `isApproved` is false and the user is bounced to `/pending-approval` (the terminal rejected state is surfaced on that page, not here).
- **Captain-only-locked** — N/A. This is a per-member self view available to every approved member; there is no rank-gated lock and the card never reveals captain-only data.

Ordering note: the gates run in the fixed sequence auth → invite → onboarding → approval (`page.tsx:24-36`); an earlier failing gate wins, e.g. a pending user who hasn't finished the questionnaire is sent to `/onboarding/questionnaire` before `/pending-approval`.

## Enums, options & configurable values
- **Rank** (`schema.ts:31`, `rankEnum`): `"captain" | "member"` — the only two STORED ranks. Rendered as the badge text "Captain" / "Member" (`page.tsx:40`). "Team Lead" (derived from `team_memberships.is_lead`) is NOT distinguished on this surface.
- **Approval status** (`schema.ts:41-45`, `approvalStatusEnum`): `"pending" | "approved" | "rejected"`. Consumed by `isApproved` (only `"approved"` passes; god emails always pass) (`users.ts:231-236`).
- **`initialsFrom` behaviour** (`initials.ts:6-17`): splits the source on `/[\s@.]+/`, drops empties, takes the first letter of the first two parts uppercased; returns the literal `"?"` for null/empty/unusable input.
- **Display-name fallback chain** (`page.tsx:38`): `displayName` → `primaryEmail` → `"Burner"`.
- **Avatar sizing**: `h-32 w-32 text-3xl` on this page (`page.tsx:46`); base `Avatar` default is `h-10 w-10` (`avatar.tsx:19`).
- **Button defaults** (`button.tsx:30-33`): `variant: "default"` (`bg-primary text-primary-foreground`), `size: "default"` (`h-10 px-4 py-2`). The Edit button overrides className with `mt-2 gap-2` only. Available variants: `default | destructive | outline | secondary | ghost | link`; sizes: `default | sm | lg | icon | icon-lg`.
- **Cache-Control on avatar bytes** (`route.ts:64`): `private, max-age=31536000, immutable` (31536000s = 1 year).
- **Avatar pathname prefix gate** (`route.ts:41`): must start with `"avatars/"`.
- **God-account bypass** (`access-control.ts:28-32`): email is in `GOD_EMAILS` (CSV env, case-insensitive) → bypasses both invite and approval gates.
- Hard-coded literal copy on this surface: `"Burner"`, `"Captain"`, `"Member"`, `"Edit profile"`, `"Want to update your burner questionnaire answers?"`, `"Review them here"`, `"Sign out"`.

## Data model touched
Read-only consumption — this surface writes nothing.

- **`users` table** (`schema.ts:220-303`) via `CampUser` (`users.ts:39-47`), populated by `toCampUser` (`users.ts:462-480`). Fields actually read on this surface:
  - `id` (uuid PK) — passed to `getBurnerProfile` and (via proxy) avatar gating.
  - `authUserId` (`auth_user_id`, text, unique) — match key; not rendered.
  - `displayName` (`display_name`, text, nullable) — heading + initials source.
  - `profileImageUrl` (`profile_image_url`, text, nullable) — same-origin `/api/avatar?pathname=…` proxy URL; gates whether `AvatarImage` renders (`page.tsx:47-49`).
  - `inviteCode` (`invite_code`, text, nullable) — consumed by `hasCampAccess` (NULL ⇒ god-only access).
  - `rank` (`rank` enum, default `"member"`) — badge label.
  - `approvalStatus` (`approval_status` enum, default `"approved"`) — consumed by `isApproved`; defaults to `"approved"` in `toCampUser` when the row's value is null (`users.ts:478`).
- **`AuthenticatedUser`** (`auth.ts:13-17`): `id`, `primaryEmail` (email line + fallbacks + god/`isApproved` checks), `displayName` (display-name/initials fallback chain).
- **`burner_profiles` table** (`schema.ts:352-364`) via `BurnerProfileSummary` (`users.ts:155-160`), from `getBurnerProfileByUserId` `SELECT *` (`burner-profile.ts:124-132`). Only `completedAt` (`completed_at`, timestamp nullable) is consumed by this surface as the onboarding gate (`page.tsx:31`). The summary also carries `responses`, `updatedAt`, `version` — fetched but unused here.
- **Avatar bytes proxy** (`route.ts`): reads the camp row again via `findCampUserByAuthId` and gates on `isApproved`; reads the Vercel Blob keyed by the `pathname` query param. Reads only; no DB write.

No data on this surface comes from `team_memberships`, `driver_profiles`, `dietary_requirements`, `required_actions`, or any other table.

## Validation, edge cases & business rules
- **No client/server input validation** — there are no inputs. All "validation" is the gate spine.
- **God accounts bypass both gates**: `isGodEmail` true ⇒ `hasCampAccess` and `isApproved` both true regardless of `inviteCode`/`approvalStatus` (`users.ts:223,235`).
- **Synthetic non-persisted row edge case**: a signed-in user with no DB row and no invite gets a synthetic `CampUser` with `id: ""`, `inviteCode: null`, `approvalStatus: "approved"` (`users.ts:86-94`). On this surface `hasCampAccess` reads false (no invite, not god) and the user is bounced to `/signup/required` before `id: ""` is ever used to query the profile.
- **Gate precedence is fixed and short-circuits**: auth → invite → onboarding-complete → approval (`page.tsx:24-36`). A failing earlier gate redirects before later checks run.
- **Onboarding gate is `completedAt`, not `required_actions`**: even if a `required_actions` questionnaire row were satisfied, a null `burner_profiles.completed_at` still bounces to `/onboarding/questionnaire` (`page.tsx:31`).
- **Rejected and pending share one redirect target** (`/pending-approval`); this surface does not differentiate them.
- **Team leads are not labelled** — the local ternary only knows `captain`/`member`, so a `member` who leads a team renders the "Member" badge.
- **Email may be absent**: when `primaryEmail` is null the email line is omitted (`page.tsx:58`) and the name heading falls through to `"Burner"` if `displayName` is also null.
- **Initials never blank**: `initialsFrom` returns `"?"` rather than an empty string for unusable input (`initials.ts:12`).
- **Photo visibility is approval-gated at the byte level**: even if `profileImageUrl` is set, the `/api/avatar` proxy 401s for unauthenticated/unapproved requests and 404s in E2E/no-token environments, so the `<img>` silently falls back to initials (`route.ts:24-49`). On this page the viewer is always approved (they passed the gate), so their own photo loads in production with a configured blob token.
- **E2E test mode**: `getBurnerProfile`/`ensureCampUser`/`isApproved` route through the in-memory `testStore`; avatar bytes always 404 (no blob), so initials fallback is the expected E2E rendering.

## Sub-components / variants
- **`Avatar` / `AvatarImage` / `AvatarFallback`** (`avatar.tsx`) — Radix-backed, `"use client"`. `AvatarImage` is `aspect-square object-cover`; `AvatarFallback` is centred with `bg-[var(--color-secondary)]` + `text-[var(--color-secondary-foreground)]`, `font-semibold`. Shared with the home header and the profile editor.
- **`Card` / `CardContent`** (`card.tsx`) — `Card` is `rounded-xl border bg-card text-card-foreground shadow-sm`; the page adds `overflow-hidden`. `CardContent` base is `p-6 pt-0`; the page overrides with `flex flex-col items-center gap-4 p-8 text-center`. (`CardHeader`/`CardTitle`/`CardDescription`/`CardFooter` exist in the module but are unused here.)
- **`Button`** (`button.tsx`) — used `asChild` to render the `<Link>` as the primary (`default`/`default`) button. The `icon-lg` size and `link`/`destructive`/`outline`/`ghost`/`secondary` variants are defined but unused on this surface.
- **Rank badge** — an inline `<span>` pill (`rounded-full bg-[var(--color-secondary)] … text-[var(--color-secondary-foreground)]`, `page.tsx:55`), NOT a shared `Badge` component (the repo has no dedicated badge primitive in this path).
- **Sign-out** is a raw `<a>` (full navigation), deliberately not Next `Link`, so it actually hits the `/auth/sign-out` route handler rather than client-routing.
- No dead/orphaned variants are introduced by this surface itself; the unused Card sub-parts and Button variants noted above are shared-primitive surface area, not this page's own code.

---

# 08 — Profile edit + delete account

**Files covered:**
- `apps/web/app/profile/edit/page.tsx` — server component; full-page gating spine, fetches initial values, renders the two cards (Edit profile + Danger zone).
- `apps/web/app/profile/edit/edit-form.tsx` — `"use client"` form for display-name + photo; wires `AvatarUpload` and the hidden photo-URL input to the `updateProfile` server action via `useActionState`.
- `apps/web/app/profile/edit/delete-account.tsx` — `"use client"` Danger-zone form; typed-`DELETE` confirmation wired to `deleteOwnAccount` via `useActionState`.
- `apps/web/app/profile/actions.ts` — `"use server"` actions `updateProfile` + `deleteOwnAccount` (re-gates, validates, persists, redirects).
- `apps/web/components/profile/avatar-upload.tsx` — large circular avatar uploader; browser crop/resize → POST `/api/uploads/avatar` → emits stored proxy URL (shared with onboarding).
- `apps/web/lib/account.ts` — thin `deleteAccount(userId)` wrapper; no-op under E2E, else delegates to DB `sanitiseAccount`.
- `packages/db/src/account.ts` — `sanitiseAccount` / `sanitisedUserPatch` / `lostCatName`: anonymise-in-place "Lost Cat #N" erasure + personal-row purge.
- Supporting (read, not owned): `apps/web/lib/users.ts` (`ensureCampUser`, `hasCampAccess`, `isApproved`, `getBurnerProfile`, `setDisplayName`, `setProfileImage`, `CampUser`), `apps/web/lib/auth.ts` (`getAuthenticatedUserOrRedirect`), `packages/db/src/burner-profile.ts` (`setUserDisplayName`/`setUserProfileImage` writers), `packages/db/src/schema.ts` (`users` table), `apps/web/lib/test-store.ts` (in-memory setters), `apps/web/app/api/uploads/avatar/route.ts` (upload contract — owned by unit 22).

**Purpose:** The signed-in member's self-service identity surface. It lets a member edit how they appear around camp — their **display name** and **profile photo** — and provides a Danger-zone **account deletion** that does not hard-delete the row but anonymises it into a "Lost Cat #N" stub (POPIA/GDPR "right to be forgotten") while preserving referral lineage and every audit/FK reference. The page is fully gated: only an authenticated, invite-bearing, onboarding-complete, approved member can reach it.

## Features

### Page shell + gating (`app/profile/edit/page.tsx`)
- `export const dynamic = "force-dynamic"` — reads the Neon Auth session on every request (page.tsx:14).
- Server-side gate sequence, in order (page.tsx:17-28):
  1. `getAuthenticatedUserOrRedirect()` → unauthenticated redirects to `/auth/sign-in` (auth.ts:40-44).
  2. `ensureCampUser(authUser)` resolves/creates the camp row (god accounts auto-created approved; others get a synthetic non-persisted row with `id: ""`).
  3. `if (!hasCampAccess(campUser, authUser.primaryEmail)) redirect("/signup/required")` — invite-gated exit (page.tsx:19-21).
  4. `getBurnerProfile(campUser.id)`; `if (!profile?.completedAt) redirect("/onboarding/questionnaire")` — onboarding-incomplete exit (page.tsx:22-25).
  5. `if (!isApproved(campUser, authUser.primaryEmail)) redirect("/pending-approval")` — pending/rejected exit (page.tsx:26-28).
- Computes `initialDisplayName = campUser.displayName ?? authUser.primaryEmail ?? ""` (page.tsx:30-31) — falls back to email, then empty string.
- Layout: `<main>` with `max-w-md`, `min-h-[100dvh]`, `px-4 py-8` (page.tsx:34). Header "Edit profile" + subtext "Update your photo and how your name shows up around camp." (page.tsx:36-39).
- Two `Card`s: first holds `<ProfileEditForm initialDisplayName initialImageUrl={campUser.profileImageUrl} />` (page.tsx:43-46); second is the **Danger zone** card (`h2` in `--color-destructive`, label "Danger zone") holding `<DeleteAccountForm />` (page.tsx:50-57).

### Profile edit form (`app/profile/edit/edit-form.tsx`)
- Props: `initialDisplayName: string`, `initialImageUrl: string | null` (edit-form.tsx:12-15).
- Photo URL held in client state `imageUrl` initialised from `initialImageUrl` (edit-form.tsx:23). Rides to the server via a **hidden input** `name="profileImageUrl" value={imageUrl ?? ""}` (edit-form.tsx:32).
- `useActionState(updateProfile, null)` → `[state, formAction, isPending]` (edit-form.tsx:24-27).
- Renders `<AvatarUpload value={imageUrl} onChange={setImageUrl} />` (edit-form.tsx:31).
- Display-name field: `<Label htmlFor="displayName">Display name</Label>` + `<Input id/name="displayName" defaultValue={initialDisplayName} maxLength={80} required disabled={isPending} />` (edit-form.tsx:34-43).
- Error banner: `state && !state.ok` → `<p role="alert">` in `--color-destructive` showing `state.error` (edit-form.tsx:46-50).
- Footer: ghost **Cancel** button (`<Link href="/profile">`, disabled while pending) + submit **Save changes** button (label "Saving…" while pending) (edit-form.tsx:52-59).

### Avatar uploader (`components/profile/avatar-upload.tsx`)  — shared with onboarding; pipeline detail = unit 22
- Props: `value: string | null | undefined` (current URL), `onChange: (url: string | null) => void`, `className?` (avatar-upload.tsx:8-15).
- Tapping the circle (or the text button) opens the native file picker (`<input type="file" accept="image/*" class="sr-only">`) (avatar-upload.tsx:77, 138-144).
- `handleFile(file)` (avatar-upload.tsx:39-68): clears error → `setUploading(true)` → `cropResizeToSquare(file)` (browser centre-crop + WebP, see `lib/image.ts`: default 512px edge, quality 0.85) → sets local object-URL `preview` → POSTs `FormData{ image: File("avatar.webp", blob.type) }` to `/api/uploads/avatar` → on `!res.ok` throws `data.error ?? "Upload failed"` → on success `onChange(data.url)` → `finally` clears `uploading` and resets the input value.
- `displaySrc = preview ?? value` (avatar-upload.tsx:70): local preview wins over the authed proxy URL (the proxy `401`s for a not-yet-approved member mid-onboarding — see comment avatar-upload.tsx:28-30).
- Object-URL cleanup: `useEffect` revokes the previous `preview` on change/unmount (avatar-upload.tsx:32-37).
- Remove affordance: when `displaySrc && !uploading`, a destructive circular `X` button (top-right) clears error + preview and calls `onChange(null)` (avatar-upload.tsx:107-120).
- Inline error `<p role="alert">` in `--color-destructive` (avatar-upload.tsx:132-136).

### `updateProfile` action (`app/profile/actions.ts:24-48`)
- Re-runs the auth + invite gate server-side (does **not** re-check onboarding/approval): `getAuthenticatedUserOrRedirect` → `ensureCampUser` → `if (!hasCampAccess) redirect("/signup/required")` (actions.ts:28-32).
- Reads `displayName`: `name = typeof rawName === "string" ? rawName.trim() : ""` (actions.ts:34-35).
- Reads `profileImageUrl`: `image = typeof rawImage === "string" ? rawImage.trim() : ""` (actions.ts:41-42).
- Persists: `setDisplayName(campUser.id, name)` then `setProfileImage(campUser.id, image.length > 0 ? image : null)` — empty image string normalises to `null` (actions.ts:44-45).
- On success `redirect("/profile")` (actions.ts:47). Returns an error object only on validation failure (never returns `{ ok: true }`).

### `deleteOwnAccount` action (`app/profile/actions.ts:55-69`)
- Re-runs auth + invite gate: `getAuthenticatedUserOrRedirect` → `ensureCampUser` → `if (!hasCampAccess) redirect("/signup/required")` (actions.ts:59-63).
- Confirmation guard: `if (formData.get("confirm") !== "DELETE") return { ok: false, error: "Type DELETE to confirm." }` (actions.ts:64-66) — exact case-sensitive string match.
- Calls `deleteAccount(campUser.id)` then `redirect("/auth/sign-out")` to end the session (actions.ts:67-68).

### Delete-account form (`app/profile/edit/delete-account.tsx`)
- `useActionState(deleteOwnAccount, null)` → `[state, action, pending]` (delete-account.tsx:10-13).
- Explanatory copy (delete-account.tsx:17-22): "This permanently erases your personal data and removes you from camp rosters. Your account becomes an anonymous "Lost Cat" stub so the family tree stays intact — it can't be undone. Type **DELETE** to confirm."
- `<Label htmlFor="confirm">Confirmation</Label>` + `<Input id/name="confirm" placeholder="DELETE" autoComplete="off">` (delete-account.tsx:23-31). No `required`, no `maxLength`.
- Error banner: `state && !state.ok` → `<p role="alert">` in `--color-destructive` (delete-account.tsx:32-39).
- Submit: `variant="destructive"` button, label "Deleting…" while `pending`, else "Delete my account" (delete-account.tsx:40-42).

### `deleteAccount` wrapper (`lib/account.ts:10-13`)
- `if (isE2ETestMode()) return { lostCatNumber: 0 }` — **no-op under E2E test mode** (no DB; erasure isn't Playwright-exercised). Otherwise `return sanitiseAccount(userId)`.

### `sanitiseAccount` erasure (`packages/db/src/account.ts:55-130`)
- Runs in **one pooled transaction** (`createPooledDb()`, `pool.end()` in `finally`).
- Allocates `lostCatNumber = (max(users.lost_cat_number) ?? 0) + 1` across the whole `users` table (account.ts:59-64) — monotonic, never reused.
- Anonymises the user row in place via `sanitisedUserPatch` (does **not** hard-delete — comment account.ts:5-9: hard delete would break referral lineage + audit/authorship FKs).
- Deletes personal owned child rows explicitly (the kept `users` row means the FK CASCADE never fires — comment account.ts:72-73): `burnerProfiles`, `dietaryRequirements`, `driverProfiles`, `pushTokens`, `notificationDeliveries`, `questionnaireEdits`, `requiredActions`, `teamMemberships`, `carMembers` (both `driverUserId` OR `memberUserId`), `workshopRsvps`, `broadcastTargets`, `questionnaireActivationTargets` (account.ts:74-116).
- Scrubs reimbursement bank PII: `reimbursements.accountDetailsEncrypted = ""` for `submitterId === userId` (NOT-NULL column → empty string, not null; the reimbursement record is kept for accounting) (account.ts:118-123).
- Returns `{ lostCatNumber }`.

## User actions & interactions
- **Edit display name**: type into the `displayName` input (`maxLength={80}`, `required`); disabled while `isPending`.
- **Upload / change photo**: tap the avatar circle or the text button below it → pick a file → browser crops/resizes → uploads → preview swaps to the new image; text button label cycles "Upload a photo" → "Uploading…" → "Change photo".
- **Remove photo**: tap the destructive `X` overlay (only visible when a photo is shown and not uploading) → clears preview, calls `onChange(null)` → hidden input becomes `""` → on save persists `null`.
- **Save changes**: submit the edit form → `updateProfile` → on success redirect to `/profile`.
- **Cancel**: ghost button links to `/profile` (no save).
- **Delete account**: type `DELETE` into the `confirm` input → submit destructive button → `deleteOwnAccount` → on success redirect to `/auth/sign-out` (session ended).

## States & presentations
Applicable global-states rows for this surface:
- **Empty**: display-name input shows `initialDisplayName` (email fallback or `""`); avatar circle shows dashed border + `Camera` icon + "Add photo" when no photo (avatar-upload.tsx:94-99); `confirm` input empty with placeholder "DELETE".
- **Loading / populated**: page is a server component — values are populated at render (no skeleton). Avatar `uploading` state shows a `Loader2` spinner overlay (`bg-black/40`) (avatar-upload.tsx:100-104).
- **Validation-error**: edit form — empty name → "Display name can't be empty."; over-80 → "Display name must be 80 characters or fewer." (actions.ts:36-39). Delete form — wrong/absent confirm → "Type DELETE to confirm." (actions.ts:65). Avatar — upload failure shows server error or "Upload failed" (avatar-upload.tsx:58, 63). Each surfaced via `role="alert"`.
- **Submitting/pending**: edit form `isPending` → name input + both buttons disabled, submit label "Saving…". Delete form `pending` → destructive button disabled, label "Deleting…". Avatar `uploading` → both trigger buttons disabled (`disabled:opacity-60`), spinner overlay.
- **Success**: both actions redirect (no in-page success banner) — edit → `/profile`; delete → `/auth/sign-out`.
- **Disabled**: see Submitting; avatar trigger buttons carry `disabled:opacity-60`.
- **Invite-gated**: page and both actions `redirect("/signup/required")` when `!hasCampAccess` (page.tsx:19-21; actions.ts:30-32, 61-63).
- **Onboarding-incomplete**: page redirects to `/onboarding/questionnaire` when `!profile?.completedAt` (page.tsx:23-25). (Note: the server actions do NOT re-check this.)
- **Pending-approval**: page redirects to `/pending-approval` when `!isApproved` (page.tsx:26-28).
- **Rejected**: `approval_status='rejected'` is terminal — `isApproved` returns false (only `'approved'` or god passes), so the page redirects to `/pending-approval` (page.tsx:26-28; users.ts:231-236).
- **Captain-only-locked**: N/A — this is a self-service surface available to any approved member regardless of rank; nothing here is rank-gated.

## Enums, options & configurable values
- `MAX_NAME_LENGTH = 80` (actions.ts:16) — mirrored by the input `maxLength={80}` (edit-form.tsx:41).
- Confirmation literal: `"DELETE"` (actions.ts:64; placeholder delete-account.tsx:29) — exact match.
- `UpdateProfileResult = { ok: false; error: string }` (actions.ts:13) — note **only** the failure shape is typed; success path redirects.
- `DeleteAccountResult = { ok: false; error: string }` (actions.ts:14).
- `SanitiseResult = { lostCatNumber: number }` (account.ts:45-47); E2E no-op returns `{ lostCatNumber: 0 }` (account.ts:11).
- `lostCatName(n) → "Lost Cat #N"` (account.ts:11-13).
- Avatar upload contract (route, unit 22): `MAX_BYTES = 5 * 1024 * 1024` (5 MB); per-user rate `limit: 20`, per-IP rate `limit: 40`; status codes `401`/`429`/`400`/`415`/`413`/`502`; image-only (`file.type.startsWith("image/")`); returns proxy URL `/api/avatar?pathname=…`. E2E / missing `BLOB_READ_WRITE_TOKEN` echoes `/api/avatar?pathname=avatars/<userId>/test-avatar.webp` (route.ts:7-98).
- `cropResizeToSquare` defaults: `size = 512`, `quality = 0.85`, output `image/webp` (lib/image.ts).
- `RANK_LABEL` / rank enum not used on this surface (no rank UI here).

## Data model touched
`users` table (`packages/db/src/schema.ts:220-303`) — fields written/read by this unit:
- **Read**: `displayName` (`display_name` text), `profileImageUrl` (`profile_image_url` text), `inviteCode` (`invite_code` text — gate), `approvalStatus` (`approval_status` enum — gate), `id` (uuid), `authUserId` (`auth_user_id` text).
- **Edit writes** (`setUserDisplayName`/`setUserProfileImage`, burner-profile.ts:102-122): `displayName`, `profileImageUrl`, plus `updatedAt = new Date()`. Test-store equivalents set the same fields + `updatedAt` (test-store.ts:220-237).
- **Delete writes** (`sanitisedUserPatch`, account.ts:21-43) — the `users` row patch: `displayName = "Lost Cat #N"`, `authUserId = "deleted:<userId>"` (severs the Neon Auth link so a re-login becomes a fresh access-less user), `profileImageUrl = null`, `passportEncrypted = null`, `saIdEncrypted = null`, `eftDetailsEncrypted = null`, `emergencyContacts = null`, `telegramHandle = null`, `telegramUserId = null`, `termsVersion = null`, `termsConsentedAt = null`, `sanitised = true`, `sanitisedAt = now`, `lostCatNumber = <N>`, `updatedAt = now`. **Kept intentionally**: `id`, `inviteCode` (who invited them — lineage) (comment account.ts:18-20).

Other tables touched on delete (children deleted / scrubbed; see Features → `sanitiseAccount`):
- Deleted by `userId`: `burnerProfiles`, `dietaryRequirements`, `driverProfiles`, `pushTokens`, `notificationDeliveries`, `questionnaireEdits`, `requiredActions`, `teamMemberships`, `workshopRsvps`, `broadcastTargets`, `questionnaireActivationTargets`.
- `carMembers`: deleted where `driverUserId = userId` OR `memberUserId = userId`.
- `reimbursements`: `accountDetailsEncrypted` set to `""` where `submitterId = userId` (record retained for accounting).
- Untouched (lineage/audit): the `users` row itself (anonymised, not deleted), `approvalDecidedByUserId` references, the user's referral subtree (now resolves to "Lost Cat #N").

`CampUser` shape consumed (users.ts:39-47): `id`, `authUserId`, `displayName`, `profileImageUrl`, `inviteCode`, `rank` (`"captain" | "member"`), `approvalStatus` (`"pending" | "approved" | "rejected"`).

## Validation, edge cases & business rules
- **Display name**: trimmed; empty after trim → rejected ("Display name can't be empty."); `> 80` chars → rejected (server-authoritative even though the input caps at `maxLength={80}`) (actions.ts:36-39).
- **Profile image normalisation**: trimmed; empty string → stored as `null`, not `""` (actions.ts:45). The hidden input always submits a string (`imageUrl ?? ""`).
- **Photo persistence is two-phase**: the avatar uploader stores the blob and returns a proxy URL immediately on upload; the URL only persists to `users.profileImageUrl` when the edit form is **saved**. Removing a photo (`X`) or uploading a new one before saving is only client state until save. Navigating away (Cancel) discards unsaved photo/name changes.
- **Delete confirmation**: must be the exact case-sensitive string `"DELETE"` (no trim, so leading/trailing whitespace fails) (actions.ts:64).
- **Delete is irreversible & non-blocking re-login**: the row is anonymised, not removed; `authUserId` is rewritten to `deleted:<id>` so a subsequent Neon Auth login of the same identity creates a brand-new access-less user (must re-redeem an invite). `id` + `inviteCode` are preserved for referral lineage.
- **`lostCatNumber` allocation** is computed inside the transaction as `max + 1` — concurrent deletions are serialised by the transaction; numbers are monotonic and never reused.
- **NOT-NULL scrub**: `reimbursements.accountDetailsEncrypted` is set to `""` (empty string), not `null`, because the column is NOT NULL (account.ts:118-123).
- **E2E test mode**: `deleteAccount` is a no-op returning `{ lostCatNumber: 0 }` (no DB) — account erasure is not exercised by Playwright (account.ts:10-11). Display-name/photo edits route through the in-memory `testStore` (test-store.ts:220-237).
- **Action vs page gating asymmetry**: the page gates on auth + invite + onboarding + approval, but both server actions re-gate only on **auth + invite** (not onboarding/approval). A member who became `pending`/`rejected` after the page loaded could still POST `updateProfile`/`deleteOwnAccount`. <!-- low-confidence: appears intentional (actions don't re-fetch burner profile/approval) but no test asserts it; flagged as an explicit ugly truth. -->
- **Avatar proxy 401 mid-onboarding**: the uploader prefers the local object-URL `preview` over `value` because the authed `/api/avatar` proxy 401s for a not-yet-approved member during onboarding (avatar-upload.tsx:28-30).
- **Synthetic non-persisted user**: an authenticated user with no row + no invite gets `CampUser` with `id: ""` from `ensureCampUser`; `hasCampAccess` reads false so they're redirected before `id: ""` is ever used as a write target (users.ts:82-95).

## Sub-components / variants
- `ProfileEditForm` (edit-form.tsx) — client form, no variants.
- `DeleteAccountForm` (delete-account.tsx) — client form, no variants.
- `AvatarUpload` (avatar-upload.tsx) — **shared** with onboarding (same component); accepts a `className` diameter override (default `h-40 w-40`). Image pipeline detail (`lib/image.ts`, `/api/uploads/avatar`, `/api/avatar` proxy) is owned by **unit 22** — referenced here only for the contract. No dead/orphaned variants.
- Server actions `updateProfile` + `deleteOwnAccount` live in the shared `app/profile/actions.ts` (the `/profile` view also imports from here); both typed with failure-only result objects. No orphaned exports observed.
- `deleteAccount` (lib/account.ts) is the only caller of `sanitiseAccount`; `sanitisedUserPatch` + `lostCatName` are also imported by unit tests in `packages/db` (pure, no-DB by design).

---

# 09 — Notifications inbox

**Files covered:**
- `apps/web/app/notifications/page.tsx` — the member-facing inbox screen (RSC, `force-dynamic`); auth + invite gate, snapshot-then-mark-read, renders the delivery list newest-first with per-row presentation icons.
- `apps/web/lib/notifications.ts` — server-only facade that routes inbox reads/writes (`listInbox`, `markRead`, `countUnread`) plus the ack/announcement APIs through either the Neon-backed `@camp404/db/broadcasts` or the in-memory `testStore` under `E2E_TEST_MODE`.
- `packages/db/src/broadcasts.ts` — the real data layer: `listInbox`, `markRead`, `countUnread` queries + `InboxItem` interface (recipient-side reads against `notification_deliveries`).
- `apps/web/lib/test-store.ts` — in-memory `listInbox`/`markRead`/`countUnread` for `E2E_TEST_MODE`.
- `apps/web/app/home-header.tsx` — the header bell + unread badge that links to `/notifications` (entry point into this surface).
- `apps/web/app/page.tsx` — home page; computes `countUnread(campUser.id)` and feeds the badge count into `HomeHeader` (`page.tsx:68`, `:91`).
- `packages/db/src/schema.ts` — `notification_deliveries` table, `broadcasts` table, and the `broadcast_presentation` enum the inbox reads.
- `apps/web/lib/users.ts` — `hasCampAccess` (`:219`) invite gate used by the page.

**Purpose:** The notifications inbox is the member-facing list of every notification delivered to the signed-in camp member, shown newest-first behind the header bell. It is a read-only review surface: opening it snapshots the current deliveries, displays each with a presentation-derived icon, sender attribution, body, and date, flags rows that were still unread on arrival as "New", and then marks exactly that snapshot as **read** (clearing the unread badge). Reading here is deliberately distinct from **acknowledging** — the full-screen acknowledgement takeover (unit 25) is the only place a `presentation = 'acknowledge'` delivery's `acknowledgedAt` gets stamped; this inbox only stamps `readAt`. The delivery/fan-out engine that creates the rows is unit 27.

## Features

### Notifications page (`apps/web/app/notifications/page.tsx`)
- **RSC, force-dynamic** (`page.tsx:8`): `export const dynamic = "force-dynamic"` so the inbox is never statically cached and always reflects current deliveries.
- **Page metadata** (`page.tsx:10`): `metadata = { title: "Notifications — Camp 404" }`.
- **Auth + invite gate** (`page.tsx:25-29`): `getAuthenticatedUserOrRedirect()` (redirects unauthenticated users via auth lib), then `ensureCampUser(authUser)`, then `if (!hasCampAccess(campUser, authUser.primaryEmail)) redirect("/signup/required")`. NOTE — this surface does **not** re-run the onboarding/approval/rejected gates from the home spine (`app/page.tsx:44-63`); only auth + invite-access are enforced here.
- **Snapshot-then-mark-read** (`page.tsx:31-37`): `const items = await listInbox(campUser.id)` snapshots the inbox (with each row's pre-read `readAt`), then `await markRead(campUser.id, items.map((i) => i.id))` clears the unread flag for exactly those snapshotted ids. A delivery that arrives *after* the snapshot stays unread (it is neither shown nor marked) — by design (`page.tsx:31-32`, `broadcasts.ts:510-516`).
- **Back-to-home link** (`page.tsx:41-45`): ghost `Button` (`size="sm"`) wrapping `<a href="/">` with a `ChevronLeft` icon and label "Home".
- **Header block** (`page.tsx:46-51`): `<h1>` "Notifications"; subtitle paragraph "Everything that's been sent your way."
- **Empty state** (`page.tsx:53-54`): when `items.length === 0`, renders a single muted paragraph "No notifications yet."
- **Delivery list** (`page.tsx:56-103`): `<ul>` of `<li>` rows, one per `InboxItem`, in the order returned by `listInbox` (newest-first — see below). Each row shows: presentation icon, title, optional "New" pill, date (`createdAt`), body (whitespace-preserving), and an optional "From {senderName}" attribution line with acknowledgement status suffix.
- **Per-row presentation icon** (`page.tsx:18-22`, `:72`): `presentationIcon(item.presentation)` → `Megaphone` for `"acknowledge"`, `MessageSquare` for `"popup"`, else (`"feed"`) `Bell`. All rendered `h-4 w-4`, `aria-hidden`, inside a `text-muted-foreground` span.
- **"New" flagging** (`page.tsx:58`, `:64-66`, `:77-81`): `const isNew = item.readAt === null` (i.e. it was unread at snapshot time). New rows get an emphasised border/background (`border-[color:var(--color-primary)]/40 bg-accent/20`) and a pill reading "New" (`bg primary` / `text primary-foreground`, `text-[10px]`).
- **Date display** (`page.tsx:83-85`): `<time>` showing `new Date(item.createdAt).toLocaleDateString()` (date only, locale-formatted, no time component).
- **Body display** (`page.tsx:87-89`): `whitespace-pre-wrap` muted paragraph rendering `item.body` verbatim (newlines preserved). No markdown rendering.
- **Sender + acknowledgement attribution** (`page.tsx:90-99`): only rendered when `item.senderName` is truthy. Shows "From {senderName}" plus a suffix: `" · acknowledged"` if `item.acknowledgedAt` is set; else `" · awaiting acknowledgement"` if `item.presentation === "acknowledge"`; else empty string. So a `feed`/`popup` delivery shows just "From {senderName}" with no status; an `acknowledge` delivery shows its ack state. System deliveries with no `senderName` show no attribution line at all.

### Header bell entry point (`apps/web/app/home-header.tsx`)
- **Bell link** (`home-header.tsx:26-44`): `next/link` to `/notifications`, `Bell` icon (`h-5 w-5`). `aria-label` is `"Notifications (${notifications} unread)"` when `notifications` is truthy, else `"Notifications"`.
- **Unread badge** (`home-header.tsx:36-43`): rendered only when `notifications` is truthy. Pill with `bg primary` / `text primary-foreground`, `text-[10px]`, positioned top-right of the bell; displays `notifications > 99 ? "99+" : notifications`. The prop is documented "Falsy hides the badge." (`home-header.tsx:13`).
- **Badge source** (`page.tsx:68`, `:80`, `:91`): the home page computes `countUnread(campUser.id)` and passes it as `notifications`. `countUnread` counts deliveries with `readAt IS NULL` (`broadcasts.ts:496-508`).

### Facade routing (`apps/web/lib/notifications.ts`)
- **Real-vs-test backend split** (`notifications.ts:71-119`): `backend()` returns `testBackend` when `isE2ETestMode()` else `realBackend`. App code (pages, actions, route handlers) imports the wrapper functions from this module, never `@camp404/db/broadcasts` directly (`notifications.ts:24-28`).
- **Inbox-relevant exports**: `countUnread(userId)` (`:121-123`), `listInbox(userId)` (`:125-127`), `markRead(userId, ids)` (`:129-131`). (Also re-exports `getPendingAcknowledgements`, `acknowledgeDelivery` for unit 25, and the captain announcement CRUD/publish for unit 27 — out of scope here.)

### Inbox queries (`packages/db/src/broadcasts.ts`)
- **`listInbox(userId)`** (`broadcasts.ts:472-493`): selects from `notification_deliveries` filtered to `userId`, `LEFT JOIN broadcasts` then `LEFT JOIN users` on the broadcast's `senderId`, ordered `desc(createdAt)` (newest first). Returns the delivery's own `id`, `title`, `body`, `presentation`, `readAt`, `acknowledgedAt`, `createdAt`, plus `senderName = users.displayName` (NULL if no broadcast / no sender / system delivery). Uses the stateless HTTP driver.
- **`markRead(userId, ids)`** (`broadcasts.ts:516-529`): no-op when `ids.length === 0`. Otherwise updates `notification_deliveries.readAt = new Date()` where `userId` matches AND `id IN ids` AND `readAt IS NULL` (only stamps rows still unread — never re-stamps an already-read row, and never touches another user's rows). Returns `void`.
- **`countUnread(userId)`** (`broadcasts.ts:496-508`): `count(*)::int` of the user's deliveries with `readAt IS NULL`; returns `0` when no row. Drives the header bell badge.

### Test-mode inbox (`apps/web/lib/test-store.ts`)
- **`listInbox(userId)`** (`test-store.ts:514-542`): filters `deliveries` by `userId`, sorts `b.createdAt - a.createdAt` (newest first), maps to `{ id, title, body, presentation, senderName, readAt, acknowledgedAt, createdAt }`. `senderName` resolved from the parent broadcast's sender's `displayName` (NULL if no sender / system).
- **`countUnread(userId)`** (`test-store.ts:543-546`): `deliveries.filter(d => d.userId === userId && d.readAt === null).length`.
- **`markRead(userId, ids)`** (`test-store.ts:547-556`): no-op on empty `ids`; otherwise sets `d.readAt = now` for each delivery whose `userId` matches, `readAt === null`, and whose `id` is in the id set. Mirrors the real query's "only-if-still-unread, owner-scoped" semantics.

## User actions & interactions
- **Open the inbox**: tap the header bell (`HomeHeader` → `/notifications`). The act of opening is itself the read action — there is no per-row "mark read" button. On render the page marks the entire snapshot read.
- **Navigate back home**: tap the "Home" ghost button (`<a href="/">`) — the only navigational control on the page.
- **Read a notification**: visually scan each row (icon + title + body + date + sender). There are NO interactive per-row controls — no delete, archive, mute, dismiss, mark-unread, expand/collapse, or deep-link/open action on a row. Rows are static `<li>`s.
- **Implicit badge clear**: returning to home after opening the inbox shows a cleared (or reduced) bell badge, because the snapshot's rows are now `readAt`-stamped and `countUnread` drops.
- **NOT here — acknowledging**: opening the inbox never stamps `acknowledgedAt`; an `acknowledge` delivery still shows "· awaiting acknowledgement" until the user clears it via the separate full-screen `AcknowledgementGate` (unit 25). `acknowledgeDelivery` is exported by the facade but not invoked by this page.

## States & presentations
Global-states rows that apply to this surface:
- **Empty** (`page.tsx:53-54`): `items.length === 0` → "No notifications yet." muted paragraph. The header bell shows no badge (`countUnread` = 0).
- **Loading**: server-rendered (`force-dynamic`); no explicit client loading/skeleton state — the page awaits `listInbox` + `markRead` before responding. No client-side spinner.
- **Populated** (`page.tsx:56-103`): the `<ul>` of delivery rows. Two visual sub-variants per row: **unread-on-arrival** (`isNew` → emphasised border/bg + "New" pill) and **already-read** (plain border).
- **Validation-error**: N/A — this is a read-only list; no form, no input, no submit, hence no validation-error surface.
- **Submitting/pending**: the one write (`markRead`) is a fire-then-render side effect awaited server-side before the HTML is returned; there is no in-page submitting/pending indicator.
- **Success**: implicit — the rendered list with the badge cleared is the success state; no toast/confirmation.
- **Disabled**: N/A — no actionable controls to disable (other than the always-enabled Home/back link).
- **Invite-gated** (`page.tsx:27-29`): `!hasCampAccess(campUser, primaryEmail)` → `redirect("/signup/required")`. God emails (`isGodEmail`) or any user with a redeemed `inviteCode` pass (`users.ts:219-224`).
- **Onboarding-incomplete / Pending-approval / Rejected**: NOT enforced on this page (unlike the home spine). A user who is onboarding-incomplete, pending, or rejected but who is past the invite gate would still see their inbox — the page only checks auth + camp access. `<!-- low-confidence: this is an observed asymmetry vs app/page.tsx:44-63; the inbox intentionally only gates on auth+invite, so these gating rows do not block this surface even though they block home. -->`
- **Captain-only-locked**: N/A — the inbox is member-facing; every camp member (any rank) sees their own deliveries. There is no rank gate and no captain-only content on this surface.
- **Per-row "New" presentation** (`page.tsx:77-81`): the "New" pill + emphasised styling appears for any row that was `readAt === null` at snapshot time, regardless of presentation variant.
- **Acknowledgement-status presentation** (`page.tsx:93-97`): three states surfaced inline on the attribution line — acknowledged (`acknowledgedAt` set → "· acknowledged"), awaiting (presentation `acknowledge` + not acknowledged → "· awaiting acknowledgement"), or none (feed/popup → no suffix).

## Enums, options & configurable values
- **`broadcast_presentation`** (`schema.ts:166-170`): `["acknowledge", "popup", "feed"]`. This is the enum the inbox reads via `item.presentation`; default at the column level is `"feed"` (`schema.ts:783-785`, `:846-848`). Icon mapping (`page.tsx:18-22`): `acknowledge`→`Megaphone`, `popup`→`MessageSquare`, `feed`/fallback→`Bell`.
- **`notification_channel`** (`schema.ts:144-148`): `["push", "in_app", "both"]`, column default `"both"` on `broadcasts` / required on deliveries. Carried on the delivery row but NOT read or displayed by the inbox UI.
- **`broadcast_kind`** (`schema.ts:128-134`): `["announcement", "team_message", "lead_directive", "reminder", "system"]` — on `broadcasts`, not surfaced in the inbox row (the inbox shows the delivery copy, not the broadcast kind).
- **`broadcast_scope`** (`schema.ts:136-142`): `["everyone", "team", "team_leads", "drivers", "individual"]` — broadcast-side audience selector; not read by the inbox.
- **`push_delivery_status`** (`schema.ts:150-155`): `["queued", "sent", "failed", "skipped"]` — on the delivery row (`pushStatus`, default `"queued"`); not surfaced in the inbox.
- **Badge cap** (`home-header.tsx:41`): unread counts above 99 render as the literal string `"99+"`.
- **Date format** (`page.tsx:84`): `toLocaleDateString()` — locale-dependent date-only string; no configurable format.
- **Layout width** (`page.tsx:40`): `max-w-2xl` container (note: wider than the global mobile `max-w-lg`; this page uses `max-w-2xl px-6 py-10`). `<!-- low-confidence: this max-w-2xl deviates from the product-wide max-w-lg shell; captured as-is, not a guess. -->`

## Data model touched
Read/written by this surface (must agree with unit 29):

- **`notification_deliveries`** (`schema.ts:830-887`) — the per-user inbox row; the inbox's primary table:
  - `id` uuid PK (`defaultRandom`) — shown as the row key and the id passed to `markRead`.
  - `broadcastId` uuid → `broadcasts.id` `onDelete: cascade`, **nullable** (system deliveries have NULL).
  - `userId` uuid → `users.id` `onDelete: cascade`, NOT NULL — the recipient; the inbox filters on this.
  - `title` text NOT NULL — self-contained copy from the broadcast; shown as the row heading.
  - `body` text NOT NULL — self-contained copy; shown as the row body.
  - `channel` `notification_channel` NOT NULL — copied at fan-out; not displayed.
  - `presentation` `broadcast_presentation` NOT NULL default `"feed"` — drives the row icon and ack-status suffix.
  - `pushStatus` `push_delivery_status` NOT NULL default `"queued"` — not read by the inbox.
  - `refType` text (nullable), `refId` uuid (nullable) — deep-link target; not read/used by the inbox UI.
  - `readAt` timestamp (nullable) — NULL ⇒ unread; `markRead` stamps it; `isNew` reads it; `countUnread` filters on `IS NULL`.
  - `acknowledgedAt` timestamp (nullable) — stamped only by the acknowledge gate (unit 25), read by the inbox for the attribution suffix.
  - `deliveredAt` timestamp (nullable) — push-delivery bookkeeping; not read by the inbox.
  - `createdAt` timestamp NOT NULL `defaultNow()` — the sort key (`desc`) and the displayed date.
  - Indexes: `notification_deliveries_user_read_idx (userId, readAt)`; `notification_deliveries_user_ack_idx (userId, acknowledgedAt)`; `notification_deliveries_broadcast_idx (broadcastId)`; partial unique `notification_deliveries_broadcast_user_uniq (broadcastId, userId) WHERE broadcastId IS NOT NULL`.
- **`broadcasts`** (`schema.ts:763-807`) — LEFT JOINed to resolve `senderId`; the inbox reads only the join path to the sender. Fields touched via join: `id` (= `broadcastId`), `senderId` uuid → `users.id` `onDelete: set null` (nullable). (Other broadcast fields — `kind`, `scope`, `team`, `title`, `body`, `channel`, `presentation`, `refType`, `refId`, `publishedAt`, `dispatchedAt`, `sendAt`, `createdAt` — belong to the compose/fan-out engine, unit 27, not this surface.)
- **`users`** (`schema.ts` ~`:223`, `:234`, `:279`) — LEFT JOINed to provide `displayName` (→ `senderName`). The inbox itself only reads `displayName`. The page's gate also reads `users.inviteCode` (via `hasCampAccess`), `users.id`, `users.profileImageUrl`/`displayName` (home page side). `users.isSystem` / `users.sanitised` are read by the fan-out audience resolver (unit 27), not by the inbox read path.
- **`InboxItem` interface** (`broadcasts.ts:460-469`): `{ id: string; title: string; body: string; presentation: AnnouncementPresentation; senderName: string | null; readAt: Date | null; acknowledgedAt: Date | null; createdAt: Date }`. (Note: it carries no `channel`, `refType`, `refId`, `pushStatus`, or `broadcastId` — the inbox UI cannot deep-link.)
- **Test-store mirrors** (`test-store.ts:64-84`): `TestBroadcast { id, senderId, title, body, presentation, publishedAt, createdAt }` and `TestDelivery { id, broadcastId, userId, title, body, presentation, readAt, acknowledgedAt, createdAt }` — `TestPresentation = "acknowledge" | "popup" | "feed"` (`test-store.ts:59`). The test store omits `channel`, `pushStatus`, `refType`, `refId`, `deliveredAt`.

## Validation, edge cases & business rules
- **Read ≠ acknowledge**: opening the inbox stamps `readAt` only, never `acknowledgedAt` (`page.tsx:14-16`, `:33-37`). Acknowledgement is exclusively the full-screen gate's job (`broadcasts.ts:437-458`, unit 25).
- **Snapshot consistency** (`page.tsx:31-37`, `broadcasts.ts:510-516`): `markRead` is passed exactly the ids from the just-rendered `listInbox` snapshot, so a delivery arriving between snapshot and write is neither displayed nor marked read — it correctly stays unread for next time.
- **`markRead` is idempotent & owner-scoped** (`broadcasts.ts:516-529`, `test-store.ts:547-556`): only rows with matching `userId`, id in the list, and `readAt IS NULL` are stamped. An already-read row is never re-stamped (its original read timestamp is preserved); a user cannot mark another user's deliveries read.
- **Empty-list no-op** (`broadcasts.ts:517`, `test-store.ts:548`): `markRead` with `ids.length === 0` returns immediately — an empty inbox issues no UPDATE.
- **`isNew` is point-in-time** (`page.tsx:58`): computed from the *snapshot's* `readAt` (which is null for rows that were unread at load), so the "New" pill reflects unread-on-this-open even though those rows are simultaneously being marked read. On reload the same rows show as read (no pill).
- **Sender fallbacks** (`broadcasts.ts:480`, `:490`, `page.tsx:90`): `senderName` is `users.displayName` via two LEFT JOINs, so it is NULL when the delivery has no `broadcastId` (system notification), the broadcast's `senderId` is NULL (sender deleted → `set null`), or `displayName` is unset. A NULL `senderName` suppresses the entire attribution/ack-status line — meaning an `acknowledge` delivery from a deleted/system sender shows NO "awaiting acknowledgement" hint.
- **Ack-status suffix precedence** (`page.tsx:93-97`): `acknowledgedAt` set wins ("· acknowledged") over presentation; only an unacknowledged `acknowledge` delivery shows "· awaiting acknowledgement"; `feed`/`popup` never show a suffix.
- **Body is plain text** (`page.tsx:87-89`): rendered with `whitespace-pre-wrap`; newlines preserved, no markdown/HTML interpretation, no truncation/clamp.
- **Date-only display** (`page.tsx:84`): `toLocaleDateString()` drops the time; two notifications on the same day are indistinguishable by the visible timestamp (ordering still uses full `createdAt desc`).
- **No pagination / limit** (`broadcasts.ts:472-493`, `test-store.ts:514-542`): `listInbox` returns ALL of the user's deliveries with no LIMIT/offset; the page renders every row. For a long-lived account this list is unbounded. (And every render re-marks the entire snapshot, including already-read rows — harmlessly, since the UPDATE is `readAt IS NULL`-guarded.)
- **Gate asymmetry** (`page.tsx:24-29`): only `getAuthenticatedUserOrRedirect` + invite-access (`hasCampAccess`) gate this page; the onboarding/pending/rejected gates that protect home are NOT applied here.
- **`hasCampAccess` rule** (`users.ts:219-224`): passes if `isGodEmail(email)` OR the user has a non-null `inviteCode`; otherwise the page redirects to `/signup/required`.

## Sub-components / variants
- **`presentationIcon(p)`** (`page.tsx:18-22`): pure mapping helper, `InboxItem["presentation"] → JSX icon`. Three live branches: `acknowledge`→`Megaphone`, `popup`→`MessageSquare`, fallback (`feed`)→`Bell`. No dead branch (the fallback covers `feed`).
- **`HomeHeader`** (`home-header.tsx:23-57`): shared header content (bell + badge + avatar). The bell+badge half is the inbox's entry point; the avatar half links to `/profile` (unrelated). Badge hidden on falsy/zero count; capped at "99+".
- **Row variants** (`page.tsx:60-100`): two CSS-only variants of the same `<li>` — `isNew` (emphasised border `border-primary/40` + `bg-accent/20` + "New" pill) vs read (plain `border`). Not separate components.
- **Backend variants** (`notifications.ts:71-119`): `realBackend` (Neon/Drizzle via `@camp404/db/broadcasts`) vs `testBackend` (in-memory `testStore`), selected per-call by `backend()` on `isE2ETestMode()`. Same `NotificationsBackend` interface (`notifications.ts:38-69`); the inbox-relevant methods are `countUnread`, `listInbox`, `markRead`.
- **No orphaned/dead inbox variants found.** The facade also exports announcement-CRUD/publish and ack-gate methods, but those belong to units 27 (delivery engine / captain compose) and 25 (ack gate) respectively and are not invoked by this inbox surface.

---

# 10 — Tools hub

**Files covered:**
- `apps/web/app/tools/page.tsx` — the Tools hub itself: a server component that auth/invite/approval-gates, then renders a static card index of 3 sub-tool links.
- `apps/web/lib/auth.ts` — `getAuthenticatedUserOrRedirect()`: resolves the auth session (Neon Auth or E2E test cookie) or bounces to `/auth/sign-in`.
- `apps/web/lib/users.ts` — `ensureCampUser()`, `hasCampAccess()`, `isApproved()`: resolve/synthesise the camp-user row and evaluate the invite + approval gates the page enforces.
- `apps/web/lib/access-control.ts` — `isGodEmail()`: the god-account bypass both gate predicates honour.
- `packages/ui/src/components/card.tsx` — `Card` / `CardHeader` / `CardTitle` / `CardDescription` primitives the index cards are built from.
- `apps/web/app/page.tsx` (lines 124-129, entry quadrant only) — the home control-panel "Tools" tile (`Wrench`, hint "Meals, expenses…", `href: "/tools"`) that links into this hub.

**Purpose:** The Tools hub (`/tools`) is the camp-member "uncategorised toolbox" — a flat, link-only landing page reached from the bottom-right "Tools" quadrant of the home control panel. It is a curated index of camp utilities that do not yet live under a more specific quadrant. It performs no data mutation and holds no per-tool logic; its sole behaviour is (1) enforce the auth → invite → approval gate chain, then (2) render a hardcoded list of three navigation cards (Invite a member, My forms, Family tree) that deep-link to other units. It is the parent/index for units 11 (invite), 12 (my-forms) and 13 (family-tree), but contains none of their functionality.

## Features

### Tools hub page (`app/tools/page.tsx`)
- **Route:** `/tools`. Server component (`async function ToolsPage`), default export.
- **`export const dynamic = "force-dynamic";`** (page.tsx:13) — disables static caching so the gate checks run per request against live session/user state.
- **`export const metadata = { title: "Tools — Camp 404" };`** (page.tsx:15) — sets the document/tab title.
- **Three-stage gate chain** run before any render (page.tsx:51-58), in order:
  1. `getAuthenticatedUserOrRedirect()` → returns `AuthenticatedUser` or `redirect("/auth/sign-in")` (auth.ts:40-44).
  2. `ensureCampUser(authUser)` → resolves a `CampUser` row (real DB or in-memory test store; god accounts auto-created+approved; otherwise a synthetic non-persisted row) (users.ts:60-95).
  3. `if (!hasCampAccess(campUser, authUser.primaryEmail)) redirect("/signup/required");` (page.tsx:53-55) — invite gate.
  4. `if (!isApproved(campUser, authUser.primaryEmail)) redirect("/pending-approval");` (page.tsx:56-58) — captain-vetting gate.
- **Header** (page.tsx:62-68): `<h1>` "Tools"; subtext paragraph "Uncategorised tooling for camp members. We'll move tools into dedicated quadrants as we group them."
- **Card index** (page.tsx:70-91): renders `TOOLS.map(...)` as a vertical `<ul>` of `<li>`-wrapped `<Link>` cards. Each card shows: a bordered icon chip (`h-10 w-10`), the tool `title`, the tool `description`, and a trailing `ChevronRight` affordance.
- **Layout container:** `<main className="mx-auto max-w-2xl px-6 py-10">` (page.tsx:61). Note: this surface uses `max-w-2xl`, not the product-wide `max-w-lg`. <!-- low-confidence: max-w-2xl here vs the documented mobile-first max-w-lg shell — recorded verbatim from page.tsx:61, not reconciled against the global layout. -->

### Entry point — home "Tools" quadrant (`app/page.tsx:124-129`)
- The hub is reached from the `camp_member` layer's `bottomRight` quadrant tile: `label: "Tools"`, `hint: "Meals, expenses…"`, `href: "/tools"`, `icon: <Wrench className="h-5 w-5" />`.
- Note: the quadrant hint advertises "Meals, expenses…" but the actual hub list contains Invite/My forms/Family tree — no meals or expenses tool is present in `TOOLS`. The page subtitle similarly anticipates future tools ("We'll move tools into dedicated quadrants").

## User actions & interactions
- **Tap a tool card** → client-side navigation (Next.js `<Link>`) to that tool's `href`. Three targets:
  - "Invite a member" → `/tools/invite` (unit 11).
  - "My forms" → `/tools/forms` (unit 12).
  - "Family tree" → `/family-tree` (unit 13).
- **Keyboard focus:** each `<Link>` has `className="block focus:outline-none"` and the inner `Card` carries `focus-visible:ring-2 focus-visible:ring-ring` — focus ring renders on the card, not the link outline.
- **Hover:** `Card` has `transition-colors hover:bg-accent/30` — card background tints toward accent on hover.
- There are **no buttons, no forms, no inputs, no mutations, no submit, and no voice/PTT** on this surface. The only interaction is link navigation.

## States & presentations
The hub list is built from a **compile-time constant** (`TOOLS`), so several of the standard global-states rows are structurally not reachable here:
- **Populated:** the only data state. Always exactly 3 cards (Invite, My forms, Family tree). Never empty in practice.
- **Empty:** not reachable — `TOOLS` is a non-empty hardcoded array; there is no query that could return zero rows. (`{TOOLS.map(...)}` would render an empty `<ul>` only if the constant were emptied in code.) <!-- INCOMPLETE? Empty-state has no runtime path; documented as N/A. -->
- **Loading:** no async data fetch inside the body — the page awaits only the gate helpers (`getAuthenticatedUserOrRedirect`, `ensureCampUser`), which resolve before first paint. `dynamic = "force-dynamic"` means it renders fresh per request; no skeleton/spinner exists.
- **Validation-error / Submitting / Success:** N/A — no form, no mutation on this surface.
- **Disabled:** N/A — no controls can be disabled; all three cards are always active links.
- **Invite-gated:** if `hasCampAccess(campUser, primaryEmail)` is false (no god email AND no `inviteCode`), the page never renders — `redirect("/signup/required")` (page.tsx:53-55).
- **Onboarding-incomplete:** NOT enforced on this surface. `/tools` does not call `getPendingRequiredActions` / `nextGate`; the onboarding gate is handled upstream by the home gating spine (`app/page.tsx`), not here. A user with a pending blocking required action who navigates directly to `/tools` is gated only by invite + approval, not onboarding.
- **Pending-approval:** if `isApproved(...)` is false (`approvalStatus !== "approved"` and not a god email), `redirect("/pending-approval")` (page.tsx:56-58). E2E coverage: `tests/e2e/authenticated.spec.ts:91-92` asserts a pending member hitting `/tools` lands on `/pending-approval`.
- **Rejected:** terminal case of the approval gate — `approvalStatus === "rejected"` also fails `isApproved`, so it likewise redirects to `/pending-approval` (page.tsx:56-58). The hub does not distinguish rejected from pending; both route to the same gate.
- **Unauthenticated:** `redirect("/auth/sign-in")` (auth.ts:42). E2E coverage: `tests/e2e/authenticated.spec.ts:100-101`.
- **Captain-only-locked:** N/A — `/tools` is the camp-member layer surface; it has no rank-above-viewer lock. (Captain tooling lives at the separate `/captains/tools` route, not this hub.)

## Enums, options & configurable values
- **`TOOLS: ToolEntry[]`** (page.tsx:28-48) — the entire content model. Each entry: `{ href: string; title: string; description: string; icon: React.ReactNode }` (interface `ToolEntry`, page.tsx:21-26). Verbatim entries:
  1. `href: "/tools/invite"`, `title: "Invite a member"`, `description: "Mint a single-use code to bring someone onto Camp 404."`, `icon: <Mail className="h-5 w-5" />`.
  2. `href: "/tools/forms"`, `title: "My forms"`, `description: "Revisit a questionnaire you've already completed, update your answers, and see what changed."`, `icon: <ClipboardList className="h-5 w-5" />`.
  3. `href: "/family-tree"`, `title: "Family tree"`, `description: "See who brought who onto camp."`, `icon: <GitBranch className="h-5 w-5" />`.
- **Icons used:** `Mail`, `ClipboardList`, `GitBranch` (per-card, lucide), plus `ChevronRight` (trailing affordance, every card). All sized `h-5 w-5` for tool icons; `ChevronRight` is `h-5 w-5 text-muted-foreground`.
- **Gate predicate enums it consumes** (not owned here):
  - `Rank = "captain" | "member"` (users.ts:32).
  - `ApprovalStatus = "pending" | "approved" | "rejected"` (users.ts:33). Only `"approved"` (or a god email) passes `isApproved`.
- **Env-driven config affecting the gates** (read indirectly): `GOD_EMAILS` (CSV, case-insensitive — `isGodEmail`, access-control.ts:28-32) bypasses both invite and approval gates; `INVITE_CODES` (CSV bootstrap codes) and DB invite codes feed `hasCampAccess` via `inviteCode`.

## Data model touched
The hub **reads, never writes.** Fields it depends on, via `CampUser` (interface, users.ts:39-47):
- `CampUser.inviteCode: string | null` — read by `hasCampAccess(user, email)` (users.ts:219-224): returns `isGodEmail(email) || !!user.inviteCode`.
- `CampUser.approvalStatus: ApprovalStatus` — read by `isApproved(user, email)` (users.ts:231-236): returns `isGodEmail(email) || user.approvalStatus === "approved"`.
- `AuthenticatedUser` (auth.ts:13-17): `id: string`, `primaryEmail: string | null`, `displayName: string | null`. `id` resolves the row; `primaryEmail` feeds `isGodEmail`.
- `ensureCampUser` may have a side effect for *other* users but on this path is read-only for an existing row; for a god account on first sign-in it auto-creates an approved `member` row and calls `seedBurnerProfileAction` (users.ts:70-80) — this is `ensureCampUser`'s own behaviour, not hub-specific logic.
- Underlying persisted columns (via `@camp404/db/burner-profile` `toCampUser`, users.ts:462-480): `id`, `authUserId`, `displayName`, `profileImageUrl`, `inviteCode`, `rank`, `approvalStatus`. The hub uses only `inviteCode` and `approvalStatus` of these. The `TOOLS` list is **not** persisted — it is source-code constant data with no table.

## Validation, edge cases & business rules
- **Gate order is fixed and short-circuiting** (page.tsx:51-58): auth → camp-user resolve → invite gate → approval gate. Each failing gate `redirect`s (throws) before the next runs and before any markup renders.
- **God-account bypass:** an email in `GOD_EMAILS` passes both `hasCampAccess` and `isApproved` regardless of `inviteCode`/`approvalStatus` (users.ts:223, 235). `isGodEmail(null)` is false (access-control.ts:29).
- **Synthetic non-persisted row:** an authed user with no DB row and no invite gets a synthetic `CampUser` with `id: ""`, `inviteCode: null`, `approvalStatus: "approved"` (users.ts:86-94). `hasCampAccess` reads `inviteCode: null` → false → bounces to `/signup/required`. The `approvalStatus: "approved"` on the synthetic row never matters because the invite gate fires first.
- **Approval gate treats `pending` and `rejected` identically** — both redirect to `/pending-approval` (no separate rejected screen at this surface).
- **Onboarding gate is intentionally absent here** — unlike the home spine, `/tools` does not block on `getPendingRequiredActions`/`nextGate`. Only invite + approval are enforced.
- **E2E test mode:** when `isE2ETestMode()`, the auth user comes from the `camp404_test_user` cookie (auth.ts:26-29, `TEST_USER_COOKIE`) and the user backend is the in-memory `testStore` (users.ts:64). Behaviour of the gates is otherwise identical.
- **No client-side validation, no debouncing, no rate limiting, no error boundaries** are defined on this surface — it has no inputs and triggers no network calls beyond the implicit gate reads.
- **Restyle constraint:** disambiguation is by ICON + LABEL only (Mail/ClipboardList/GitBranch + titles); cards carry no per-entity colour and must not introduce one. All three cards must remain present and route to their exact `href`s; the trailing `ChevronRight` is the only navigational affordance.

## Sub-components / variants
- **`ToolEntry`** (page.tsx:21-26) — the data interface for a card row. Not exported; local to the page.
- **`TOOLS`** (page.tsx:28-48) — the constant list. The single source of card content; restyle freely but preserve all three entries verbatim.
- **`Card` family** (`packages/ui/src/components/card.tsx`): the hub uses `Card`, `CardHeader`, `CardTitle`, `CardDescription` only. **`CardContent` and `CardFooter` are exported by the primitive but unused on this surface** (orphaned w.r.t. the Tools hub; they are general primitives, not dead globally). Note `CardTitle`'s primitive default is `text-2xl` but the hub overrides it to `text-base` (page.tsx:80); `CardDescription` adds `mt-0.5`.
- **Card icon chip** (page.tsx:76-78): `<span className="flex h-10 w-10 items-center justify-center rounded-md border bg-muted/40">{tool.icon}</span>` — inline composition, no named component.
- **Server-only helpers consumed (not owned here), for completeness:**
  - `getAuthenticatedUserOrRedirect` (auth.ts:40-44) — auth gate.
  - `ensureCampUser` (users.ts:60-95) — row resolver/creator.
  - `hasCampAccess` (users.ts:219-224) — invite-gate predicate.
  - `isApproved` (users.ts:231-236) — approval-gate predicate.
  - `isGodEmail` (access-control.ts:28-32) — bypass predicate consumed by both gate predicates.
- **No dead branches inside the hub itself**; the only stale/aspirational content is the forward-looking copy ("We'll move tools into dedicated quadrants…") and the home quadrant hint "Meals, expenses…" which does not match the current 3-tool list.

---

# 11 — Invite tool (mint codes)

**Files covered:**
- `apps/web/app/tools/invite/page.tsx` — server page; auth + invite-gate + approval-gate, renders back-link and `<InviteForm isCaptain={…} />`.
- `apps/web/app/tools/invite/invite-form.tsx` — client form; code field, captain-only knobs, live availability check, submit, success panel.
- `apps/web/app/tools/invite/actions.ts` — `createInviteAction` server action; the security boundary that validates + inserts the invite code.
- `apps/web/lib/invite-words.ts` — readable word-bank code generator + syntactic validator + rules-hint string.
- `apps/web/app/api/tools/invite/check/route.ts` — `GET` availability oracle (auth-gated, rate-limited) backing the live "is this taken?" hint.
- `packages/db/src/invite-codes.ts` — `createInviteCode` / `findInviteCodeByCode` / `findUsableInviteCode` / `consumeInviteCode` data access + `InviteCodeRow` interface.
- `packages/db/src/schema.ts:312-342` — `invite_codes` table definition (the data model touched).
- `apps/web/lib/rate-limit.ts` — in-memory token bucket used to throttle the check endpoint.
- `apps/web/lib/users.ts` — `ensureCampUser`, `hasCampAccess`, `isApproved` gating used by the page and action (read for gate semantics only; redemption itself is unit 03).
- `apps/web/lib/test-store.ts:45-57, 313-352` — `TestInviteCode` shape + `seedInviteCode`/`findUsableInviteCode`/`consumeInviteCode` (E2E test backend; relevant to the check route).
- `apps/web/app/tools/page.tsx:28-34` — Tools hub entry that links here (`/tools/invite`, "Invite a member", `Mail` icon).

**Purpose:** Lets any signed-in, camp-active, approved member mint an invite code from inside the app to bring one (or, for captains, several) new people onto Camp 404. A member's codes are always single-use, tied to one required email, and force the redeemer into the captain vetting queue. A captain gets two extra knobs: **pre-approve** (wave the redeemer straight in, skipping vetting) and **max-uses** (1-100, hand one code to several people). Codes are generated as memorable "silly" word combos ("neon-toaster-mongoose"), are editable, are checked for availability GitHub-style as you type, and are recorded against the minter's account so the family tree can attribute who brought whom. Captain-tier (rank-promoting) codes can NOT be minted here — only from the CLI; this surface always inserts `assignedRank = NULL`.

## Features

### Page shell + gating (`page.tsx`)
- `export const dynamic = "force-dynamic"` (`page.tsx:8`); `metadata.title = "Invite — Camp 404"` (`page.tsx:10`).
- Resolves the auth user via `getAuthenticatedUserOrRedirect()` then `ensureCampUser(authUser)` (`page.tsx:13-14`).
- **Invite gate:** if `!hasCampAccess(campUser, authUser.primaryEmail)` → `redirect("/signup/required")` (`page.tsx:15-17`). `hasCampAccess` = god email OR a non-null `inviteCode` (`users.ts:219-224`).
- **Approval gate:** if `!isApproved(campUser, authUser.primaryEmail)` → `redirect("/pending-approval")` (`page.tsx:18-20`). `isApproved` = god email OR `approvalStatus === "approved"` (`users.ts:231-236`). (No explicit `rejected` branch here; rejected users are non-approved so they hit `/pending-approval` too.)
- Layout: `<main className="mx-auto max-w-xl px-6 py-10">` (note: `max-w-xl`, wider than the global `max-w-lg`). Ghost back-button "Tools" with `ChevronLeft` linking `/tools` (`page.tsx:23-28`).
- Passes `isCaptain={campUser.rank === "captain"}` into the form (`page.tsx:29`) — the sole rank input the client sees.

### Invite form (`invite-form.tsx`)
- Header: title **"Invite a member"**; description text branches on `isCaptain` (`invite-form.tsx:107-112`):
  - Captain: "Mint an invite code for Camp 404. As a captain you can pre-approve the people who sign up, or leave them for a captain to vet. Codes are recorded against your account for the family tree."
  - Member: "Mint a single-use code that lets one person sign up for Camp 404. A captain will review and approve them before they get access. Codes are recorded against your account so the family tree picks up who you brought on."
- **Email field** (`name="email"`, `type="email"`, `autoComplete="off"`, placeholder `sara@example.com`). Label and `required` flip on `multiUse` (`invite-form.tsx:39, 116-128`):
  - `multiUse` = `isCaptain && Number(maxUses) > 1`.
  - Multi-use: label "Lead recipient's email (optional)", `required={false}`.
  - Otherwise: label "Their email address", `required`.
- **Note field** (`name="note"`, `<Textarea rows={3}>`): label "Why you're inviting them (optional)", placeholder "Kitchen lead from last burn; great with sourdough." (`invite-form.tsx:130-138`).
- **Captain options block** rendered only when `isCaptain` (`invite-form.tsx:140-152`); otherwise a muted notice: "Anyone who signs up with this code will need a captain's approval before they can use the app." (`invite-form.tsx:148-151`).
- **Invite code field** (`name="code"`, `font-mono`, `spellCheck=false`, `autoComplete="off"`): controlled by `code` state, seeded once via `generateInviteCode()` (`invite-form.tsx:31`). `onChange` lowercases input (`invite-form.tsx:161`). Adjacent **Shuffle** outline icon-button (aria-label "Generate a new silly code") re-rolls a fresh code (`invite-form.tsx:166-174`).
- **Live availability hint** under the code field (`<AvailabilityHint>`), driven by the debounced check (see below).
- **Error banner**: when `result && !result.ok`, a `role="alert"` destructive box shows `result.error` (`invite-form.tsx:179-186`).
- **Submit button** ("Create invite"): full-width; when `isPending` shows spinner + "Creating…" (`invite-form.tsx:188-205`). Disabled when `isPending || availability.state === "checking" | "taken" | "invalid"` (`invite-form.tsx:190-195`). (Notably NOT disabled in `idle` or `available` states.)
- Form submission goes through `useActionState(createInviteAction, null)` (`invite-form.tsx:41-44`).
- On `result.ok` the whole card is replaced by `<SuccessPanel>` (`invite-form.tsx:93-102`).

### Live availability check (`invite-form.tsx` effect + `check/route.ts`)
- `useEffect` on `[code]` (`invite-form.tsx:48-91`):
  - Empty code → `availability = { state: "idle" }`.
  - `!isSyntacticallyValidCode(code)` → `{ state: "invalid", hint: "3–48 chars, lowercase letters / digits / hyphens." }` (client-side hint string, note the trailing-period differs from the server `CODE_RULES_HINT`).
  - Else set `{ state: "checking" }`, debounce **350 ms**, then `fetch(/api/tools/invite/check?code=<encoded>)` with an `AbortController` (cleanup aborts + clears the timer).
  - Response `{ available, reason?, hint? }` maps: `available:true`→`available`; `reason==="taken"`→`taken`; `reason==="invalid"`→`{invalid, hint: body.hint ?? "Invalid code."}`; anything else→`idle`. `AbortError` is swallowed; other errors → `idle` (`invite-form.tsx:73-85`).
- `GET /api/tools/invite/check` (`check/route.ts`): `runtime = "nodejs"`.
  - **Auth-gated:** no user → `401 {error:"unauthorized"}` (`check/route.ts:18-22`).
  - **Rate-limited:** key `invite-check:<user.id>`, `limit: 30` per `windowMs: 60_000`; over limit → `429 {error:"rate_limited"}` with `retry-after` header (`check/route.ts:24-37`).
  - Reads `code` query param, `.trim().toLowerCase()`. Empty → `{available:false, reason:"empty", hint: CODE_RULES_HINT}` (`check/route.ts:42-48`). Invalid syntax → `{available:false, reason:"invalid", hint: CODE_RULES_HINT}` (`check/route.ts:49-55`).
  - Existence: in E2E mode uses `testStore.findUsableInviteCode(raw)`; otherwise `findInviteCodeByCode(raw)` (`check/route.ts:57-59`). Existing → `{available:false, reason:"taken"}`; else `{available:true}`.
  - `<!-- low-confidence: test/prod existence mismatch is real, not a guess. In prod findInviteCodeByCode matches ANY row (revoked/expired/exhausted included, per its docstring lines 111-118). In E2E mode testStore.findUsableInviteCode excludes revoked/expired/exhausted rows — so a dead code reads "available" in tests but "taken" in prod. Flagging as an ugly truth. -->

### Code generator (`invite-words.ts`)
- `generateInviteCode()` returns ``${pick(ADJECTIVES)}-${pick(NOUNS)}-${pick(NOUNS)}`` — one adjective + two nouns, hyphen-joined, e.g. `neon-toaster-mongoose` (`invite-words.ts:45-47`). `pick` is `Math.random()`-based uniform choice. Note: the two noun picks are independent, so duplicate nouns (e.g. `neon-yak-yak`) are possible.
- Namespace is ~50 adjectives × ~50 nouns × ~50 nouns; docstring (`invite-words.ts:7-11`) warns collision-by-luck is plausible and the caller MUST re-check the DB.
- `isSyntacticallyValidCode(raw)` (`invite-words.ts:57-60`): length 3-48 inclusive AND matches `CODE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/` (lowercase letters/digits, single hyphens between segments, no spaces, no leading/trailing hyphen).
- `CODE_RULES_HINT = "3–48 chars, lowercase letters / digits / hyphens (no spaces)."` (`invite-words.ts:62-63`) — used by the API route (the client effect hardcodes a slightly different string).

### Mint action (`createInviteAction`, `actions.ts`)
The server-side security boundary. Re-validates everything regardless of what the form sent (`actions.ts:30-46` docstring). Steps:
1. **Auth:** `getAuthenticatedUser()`; null → `{ok:false, error:"Not signed in."}` (`actions.ts:52-53`).
2. **Camp access:** `ensureCampUser` + `hasCampAccess`; fail → `{ok:false, error:"Your account isn't camp-active yet."}` (`actions.ts:55-58`).
3. Recompute `isCaptain = campUser.rank === "captain"` server-side (`actions.ts:59`) — the client `isCaptain` prop is never trusted.
4. Read `email`, `note`, `code` from `FormData` (string-guarded, default `""`) (`actions.ts:61-72`).
5. **Captain knobs re-enforced server-side** (`actions.ts:74-93`):
   - `preApprove = isCaptain && formData.get("preApprove") === "on"`; `requiresApproval = !preApprove`. A non-captain can never set `preApprove`, so their codes always `requiresApproval = true`.
   - `maxUses` defaults `1`. Only a captain may raise it: parse `maxUses`, must be an integer in `[1, MAX_USES_LIMIT]` (=100) else `{ok:false, error:"Max uses must be a whole number between 1 and 100."}`. A non-captain's `maxUses` form value is ignored entirely.
6. **Email rules** (`actions.ts:96-105`): `email = emailRaw.trim().toLowerCase()`; `emailRequired = maxUses === 1`. If `email` present and fails `EMAIL_PATTERN` → `{ok:false, error:"Enter a valid email address."}`. If `emailRequired && !email` → same error. (Multi-use captain code may omit email.)
7. `note = noteRaw.trim() || null`.
8. **Code resolution** (`actions.ts:108-125`): `code = codeRaw.trim().toLowerCase()`. If supplied: `isSyntacticallyValidCode` else `{ok:false, error:"Invite code must be 3–48 chars, lowercase letters/digits/hyphens."}`; then `findInviteCodeByCode(code)` — if found → `{ok:false, error:"'<code>' is already taken."}`. If blank: `code = await generateUnusedCode()`.
9. **Insert** via `createInviteCode({ code, createdByUserId: campUser.id, note, maxUses, assignedRank: null, invitedEmail: email || null, requiresApproval })` (`actions.ts:127-136`). `assignedRank` is **always `null`** (captain-tier codes are CLI-only, `actions.ts:33-36`).
10. Insert wrapped in try/catch: any DB error (incl. unique-PK race) → `{ok:false, error:"Couldn't save invite. Try a different code."}` (`actions.ts:137-141`).
11. Success → `{ok:true, code, invitedEmail: email, maxUses, requiresApproval}` (`actions.ts:143`).
- `generateUnusedCode()` (`actions.ts:146-155`): up to **8** attempts of `generateInviteCode()` + `findInviteCodeByCode` DB check, returning the first unused candidate; after 8 collisions falls back to ``${generateInviteCode()}-${Date.now().toString(36)}``.
- Note: this action does NOT branch on E2E_TEST_MODE — it always calls the real-DB `findInviteCodeByCode`/`createInviteCode` (unlike the check route, which has a test-store branch).

### Success panel (`SuccessPanel`, `invite-form.tsx:317-368`)
- Title "Invite ready". Description: `"Share this code with <email>. "` if `email` else `"Share this code. "`, then:
  - `usesLine`: `maxUses === 1` → "It's single-use — once they sign up with it, nobody else can." else "Up to `<maxUses>` people can sign up with it." (`invite-form.tsx:329-332`).
  - `approvalLine`: `requiresApproval` → " They'll need a captain's approval before they get access." else " They're pre-approved — straight in after onboarding." (`invite-form.tsx:333-335`).
- Code shown in a `font-mono text-lg` box with a **Copy** button → `navigator.clipboard.writeText(code)`, flips label to "Copied" for 1500 ms (`invite-form.tsx:347-361`).
- **"Send another"** outline link to `/tools/invite` (full reload resets the form) (`invite-form.tsx:362-364`).

## User actions & interactions
- **Type / edit the code** — input lowercases on change; triggers the debounced availability check.
- **Shuffle** — re-roll a fresh generated code (button, `Shuffle` icon).
- **Enter recipient email** — required for single-use, optional ("lead recipient") for captain multi-use.
- **Enter a note** ("Why you're inviting them") — always optional.
- **(Captain) toggle "Pre-approve whoever signs up"** — checkbox `name="preApprove"`; controls vetting.
- **(Captain) set "How many people can use this code"** — number input `name="maxUses"`, `min={1} max={100}`, `w-28`.
- **Submit "Create invite"** — runs the server action; button disabled while checking/taken/invalid/pending.
- **Copy** (success) — copies code to clipboard, transient "Copied" feedback.
- **Send another** (success) — navigates back to a fresh form.
- **Back to Tools** — ghost `ChevronLeft` link to `/tools`.

## States & presentations
Global-state rows that apply to this surface:
- **Empty / initial:** form pre-filled with a generated code; email/note blank; captain knobs default (pre-approve off, maxUses "1"). Availability starts `idle` (no hint shown for an empty code).
- **Loading:** availability `checking` → "Checking availability…" with spinner; this state disables submit.
- **Populated / available:** `available` → green (`text-emerald-400`) Check + "`<code>` is available."
- **Validation-error (client):** `invalid` → destructive X + hint "3–48 chars, lowercase letters / digits / hyphens." (disables submit). `taken` → destructive X + "`<code>` is already taken — pick another." (disables submit).
- **Validation-error (server):** action returns `{ok:false, error}` → `role="alert"` destructive banner inside the form; the form re-renders preserving client state (the code stays in the controlled input). Server error strings: "Not signed in.", "Your account isn't camp-active yet.", "Max uses must be a whole number between 1 and 100.", "Enter a valid email address.", "Invite code must be 3–48 chars, lowercase letters/digits/hyphens.", "'<code>' is already taken.", "Couldn't save invite. Try a different code."
- **Submitting/pending:** `isPending` → submit shows spinner + "Creating…" and is disabled.
- **Success:** card swaps to `SuccessPanel` with code, copy, share/approval/uses copy, and "Send another".
- **Disabled:** submit disabled during checking/taken/invalid/pending.
- **Invite-gated:** `!hasCampAccess` → `redirect("/signup/required")` (page) / `{ok:false,"Your account isn't camp-active yet."}` (action).
- **Pending-approval / Rejected:** `!isApproved` → `redirect("/pending-approval")` (covers both `pending` and `rejected`, since neither is `approved`).
- **Onboarding-incomplete:** NOT enforced on this page — there is no `nextGate`/required-actions check here; only invite + approval gates run.
- **Captain-only-locked:** expressed in-form, not as a separate screen — captain knobs (`CaptainOptions`) render only for captains; members see the muted "needs a captain's approval" notice instead. The whole tool is reachable by both ranks.
- **Rate-limited (check API only):** 429 with `retry-after`; client treats a non-OK/thrown fetch as `idle` (no explicit "rate limited" UI; the hint just disappears).

Not applicable: offline/sync states, budget/over-target states (none in product).

## Enums, options & configurable values
- **`assignedRank`** (`AssignedRank` = `"captain" | "member"`, nullable): this surface ALWAYS inserts `null`. Captain-tier codes are CLI-only (`actions.ts:33-36, 133`). DB enum source `rankEnum = pgEnum("rank", ["captain","member"])` (`schema.ts:31`).
- **`requiresApproval`** (boolean, default false in schema): member → always `true`; captain → `!preApprove`.
- **`maxUses`** (integer, nullable in schema; this surface always sends `1`-`100`): member fixed `1`; captain `[1, 100]` integer.
- **`MAX_USES_LIMIT = 100`** (`actions.ts:28`); form input `min={1} max={100}` (`invite-form.tsx:300-301`).
- **Availability states** (client union, `invite-form.tsx:23-28`): `idle | checking | available | taken | invalid (with hint)`.
- **Check API `reason` values:** `empty | invalid | taken` (plus implicit "available" via `available:true`).
- **Debounce:** 350 ms (`invite-form.tsx:62, 86`).
- **Check rate limit:** 30 requests / 60_000 ms per user id (`check/route.ts:25-27`).
- **`generateUnusedCode` retries:** 8 (`actions.ts:147`).
- **Copy "Copied" timeout:** 1500 ms (`invite-form.tsx:356`).
- **Code syntax:** length 3-48; `/^[a-z0-9]+(-[a-z0-9]+)*$/` (`invite-words.ts:55, 58`).
- **Email pattern:** `EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/` (`actions.ts:24`).
- **Word banks:** `ADJECTIVES` (50 entries incl. a duplicate "merry") and `NOUNS` (50 entries) (`invite-words.ts:13-34`). Generator emits adjective-noun-noun.
- **`CODE_RULES_HINT`** = "3–48 chars, lowercase letters / digits / hyphens (no spaces)." (`invite-words.ts:62`).

## Data model touched
`invite_codes` table (`schema.ts:312-342`); the `createInviteAction` insert touches the following columns (must agree with unit 29):
- `code` text **PRIMARY KEY** — the invite code itself (lowercased before insert).
- `created_by_user_id` uuid → `users.id` `ON DELETE SET NULL`; set to `campUser.id` (the minter). Indexed: `invite_codes_created_by_idx`.
- `note` text — optional reason; trimmed to null if empty.
- `max_uses` integer (nullable) — `1` for members, `1`-`100` for captains. (This surface never inserts NULL; NULL would mean "unlimited" per `findUsableInviteCode`.)
- `use_count` integer NOT NULL default `0` — not set on mint; incremented at redemption (unit 03).
- `expires_at` timestamp (nullable) — NOT set by this surface (always null here).
- `revoked_at` timestamp (nullable) — NOT set here.
- `assigned_rank` `rank` enum (nullable) — ALWAYS `null` from this surface.
- `invited_email` text (nullable) — lowercased recipient email or null; `createInviteCode` re-lowercases via `input.invitedEmail?.toLowerCase()` (`invite-codes.ts:103`).
- `requires_approval` boolean NOT NULL default `false` — computed per rank/knob above.
- `created_at` timestamp NOT NULL `defaultNow()`.

`InviteCodeRow` interface mirrors these (`invite-codes.ts:7-19`) with camelCase + `createdAt: Date`. The E2E `TestInviteCode` (`test-store.ts:45-57`) has the identical shape.

Reads only (gating, not mutated here): `users` row via `ensureCampUser`/`findCampUserByAuthId` — fields read: `rank`, `inviteCode`, `approvalStatus` (`users.ts` `CampUser`). Redemption-side reads/writes of `users.invite_code`, `users.rank`, `users.approval_status` are unit 03.

## Validation, edge cases & business rules
- **Two validation passes:** client (live check, instant `isSyntacticallyValidCode`, debounced API) is a UX convenience; the action is the security boundary and re-validates everything (`actions.ts:44-46`).
- **Captain-only knobs are re-enforced server-side:** even a crafted POST with `preApprove=on` / `maxUses=50` from a member is ignored — `isCaptain` is recomputed from the DB row, and the maxUses branch only runs for captains (`actions.ts:74-93`).
- **Member invariants:** always `requiresApproval = true`, always `maxUses = 1`, email always required.
- **Captain invariants:** `requiresApproval = !preApprove`; `maxUses ∈ [1,100]`; email required only when `maxUses === 1` (`emailRequired = maxUses === 1`).
- **Email:** trimmed + lowercased; validated against `EMAIL_PATTERN` only when present; required when single-use. Multi-use captain may omit; if present, stored as "lead recipient".
- **Code uniqueness:** checked twice (form check API + action's `findInviteCodeByCode`), with the unique PK as the final backstop on insert; an insert collision (race) surfaces "Couldn't save invite. Try a different code." (`actions.ts:108-110, 137-141`).
- **Generator non-uniqueness:** `generateInviteCode` is `Math.random`-based and can collide; `generateUnusedCode` retries 8× then timestamp-suffixes. The two noun slots can repeat.
- **Client/server hint divergence (ugly truth):** the client effect hardcodes "3–48 chars, lowercase letters / digits / hyphens." while the server/API uses `CODE_RULES_HINT` "…(no spaces)." — same rule, two strings.
- **Check-endpoint test/prod existence semantics differ** — see low-confidence note in Features; in prod a revoked/expired/exhausted code still reads "taken", in E2E it reads "available".
- **No onboarding gate here:** unlike most app screens, `/tools/invite` does not check `nextGate`/required-actions; only invite + approval gates apply. An onboarding-incomplete-but-approved user could in principle reach it (edge case).
- **Submit not blocked on `idle`:** if the availability fetch errored/aborted to `idle`, submit is enabled and relies on the server check to catch a duplicate.
- **`page.tsx` uses `max-w-xl`** (not the global `max-w-lg`) — a deliberate-or-stray width deviation worth noting for a restyle.
- **Rate limiting** only protects the check oracle (per signed-in user id), preventing code enumeration; the mint action itself is not separately rate-limited here.

## Sub-components / variants
- **`InviteForm`** (default export-ish client component) — the whole tool; renders either the form or `SuccessPanel` depending on `result.ok`.
- **`AvailabilityHint`** (`invite-form.tsx:212-255`) — pure presentational hint; returns null for empty code or `idle`; renders checking/available/taken/invalid variants. Icons: `Loader2` (checking), `Check`/emerald (available), `X`/destructive (taken & invalid).
- **`CaptainOptions`** (`invite-form.tsx:257-315`) — captain-only knobs block: "Captain options" heading, pre-approve checkbox with dynamic helper copy, maxUses number input with dynamic helper copy ("Up to N people…" vs "Single-use — once someone signs up, the code is spent."). Rendered only when `isCaptain`.
- **`SuccessPanel`** (`invite-form.tsx:317-368`) — post-mint confirmation with copy + send-another.
- **Server handlers/validators/schemas:**
  - `createInviteAction` (`actions.ts`) — the mint validator + writer; `CreateInviteResult` discriminated union (`actions.ts:11-22`).
  - `generateUnusedCode` (`actions.ts:146-155`) — collision-avoiding generator wrapper (server-only helper).
  - `GET /api/tools/invite/check` (`check/route.ts`) — auth + rate-limited availability oracle.
  - `createInviteCode` / `findInviteCodeByCode` (`invite-codes.ts`) — the only two data-access functions this surface invokes (`findUsableInviteCode`/`consumeInviteCode` belong to redemption, unit 03).
  - `isSyntacticallyValidCode`, `generateInviteCode`, `CODE_RULES_HINT` (`invite-words.ts`) — shared by client, action, and API route.
- No dead/orphaned variants found in these files. (`findUsableInviteCode`/`consumeInviteCode` in `invite-codes.ts` are live but belong to redemption, not this minting surface.)

---

# 12 — My forms + form replay

**Files covered:**
- `apps/web/app/tools/forms/page.tsx` — server component: lists the forms this user has completed and can replay.
- `apps/web/app/tools/forms/[key]/page.tsx` — server component: replay/edit one completed form + render its change log (`ChangeLog` sub-component lives here).
- `apps/web/app/tools/forms/[key]/form-replay.tsx` — client shell wrapping the questionnaire wizard for the replay flow.
- `apps/web/app/tools/forms/[key]/actions.ts` — `"use server"` action `saveFormReplay`: validate → diff → save → record change-log row.
- `apps/web/lib/forms.ts` — `ReplayableForm` registry, `listCompletedForms`, `getReplayableForm`, change-log read/write (`recordFormEdit` / `listFormEdits`), test-mode routing.
- `packages/db/src/questionnaire-edits.ts` — Drizzle read/write for the `questionnaire_edits` change-log table.
- `packages/db/src/id-documents.ts` — pure ID-number split/merge helpers used by `BURNER_PROFILE.load`/`.save` and the change-log filter.
- (supporting, read for contracts) `packages/types/src/questionnaire.ts` (`diffResponses`, `validateResponses`, `displayResponseValue`, `QuestionnaireFieldChange`), `packages/db/src/schema.ts` (`questionnaireEdits` table), `apps/web/components/questionnaire/wizard.tsx` (the shared wizard, unit 04), `apps/web/lib/users.ts` + `packages/db/src/burner-profile.ts` (load/save backends), `apps/web/lib/test-store.ts` (in-memory change-log).

**Purpose:** A read-and-revisit surface for questionnaires the member has already completed. The list page (`/tools/forms`) shows every completed form with its last-edited timestamp; the detail page (`/tools/forms/[key]`) re-opens the form in the questionnaire wizard pre-filled with the saved answers so the member can step back through it and update anything that changed. On final submit it diffs the new answers against the stored ones, re-saves the form (a full idempotent re-submit that also re-satisfies the onboarding gate), and appends a per-field change-log row recording exactly what changed and when. No full version history is kept — only a running log of `field: from → to` entries.

## Features

### Forms list (`tools/forms/page.tsx`)
- Lists every form the current user has **completed** (`listCompletedForms`) — a form appears only once it has a `completedAt` on record (`page.tsx:41`, `lib/forms.ts:107-123`).
- Header copy: title "My forms"; subtitle "Questionnaires you've completed this year. Open one to review and update your answers — we'll keep a log of what you change." (`page.tsx:53-57`).
- Back link to `/tools` labelled "Tools" with a `ChevronLeft` icon (`page.tsx:45-51`).
- Each form rendered as a clickable `Card` linking to `/tools/forms/${form.key}` with `ChevronRight` affordance (`page.tsx:69-86`). Card shows `form.title`, `form.description`, and a "Last edited {date}" line (`page.tsx:77-81`).
- "Last edited" = `form.updatedAt ?? form.completedAt` (falls back to completion time when never edited) (`page.tsx:67`).
- Empty state when `forms.length === 0`: dashed-border panel "You haven't completed any forms yet." (`page.tsx:60-63`).
- Gating chain before render: authed (`getAuthenticatedUserOrRedirect`) → `ensureCampUser` → `hasCampAccess` else `redirect("/signup/required")` → burner profile `completedAt` else `redirect("/onboarding/questionnaire")` → `isApproved` else `redirect("/pending-approval")` (`page.tsx:28-39`).
- `export const dynamic = "force-dynamic"` — reads the Neon Auth session every request (`page.tsx:20`).

### Form replay / edit (`tools/forms/[key]/page.tsx`)
- Resolves the dynamic `[key]` param against the registry via `getReplayableForm(key)`; unknown key → `notFound()` (404) (`[key]/page.tsx:44-45`).
- Loads the user's saved answers + completion state via `form.load(campUser.id)`; if not completed (`!state?.completedAt`) → `redirect("/tools/forms")` (only completed forms are replayable) (`[key]/page.tsx:47-51`).
- Header: `form.title` and subtitle "Step back through the form and update anything that's changed. Last edited {date}." where date = `state.updatedAt ?? state.completedAt` (`[key]/page.tsx:54,65-71`).
- Back link to `/tools/forms` labelled "My forms" (`[key]/page.tsx:58-64`).
- Renders `<FormReplay>` (the wizard) then `<ChangeLog edits={edits}>` (`[key]/page.tsx:73-79`).
- Loads the edit log via `listFormEdits(campUser.id, form.key)` (default limit 20) (`[key]/page.tsx:53`).
- Same gating chain as the list page (`[key]/page.tsx:30-42`), with a comment noting "Gate parity with the rest of the app — onboarding must be done first."
- `export const dynamic = "force-dynamic"` (`[key]/page.tsx:16`).

### Change log (`ChangeLog`, inside `[key]/page.tsx:84-126`)
- Section heading "Change log"; intro copy "Every time you update this form we record what changed. We don't keep old versions — just this running history." (`[key]/page.tsx:87-91`).
- Empty state when `edits.length === 0`: "No edits yet. Changes you make here will show up in this list." (`[key]/page.tsx:92-95`).
- Ordered list (`<ol>`) of edit sessions, each a bordered card showing the edit timestamp (`dateFmt.format(edit.createdAt)`) (`[key]/page.tsx:97-105`).
- Within each session, a list of per-field changes: bold `change.label`, then `change.from` (rendered struck-through, `line-through`) → `change.to` (rendered in foreground colour), separated by an `aria-hidden` arrow "→" (`[key]/page.tsx:106-118`).
- Edits keyed by `edit.id`; changes keyed by `change.fieldId` (`[key]/page.tsx:100,108`).

### Replay client shell (`form-replay.tsx`)
- Wraps `QuestionnaireWizard` (shared wizard, unit 04) seeded with `initialResponses` from the loaded state (`form-replay.tsx:43-53`).
- Wizard configured for the replay flow: `persistProgress={false}` (no per-page saves; only the final submit commits), `submitLabel="Save changes"`, `action={(responses, final) => saveFormReplay(formKey, responses, final)}` (`form-replay.tsx:44-47`).
- On successful completion (`onComplete`): sets local `saved` flag and calls `router.refresh()` to re-render the server component so the change log updates in place (`form-replay.tsx:49-52`).
- Success banner (when `saved`): `role="status"`, `CheckCircle2` icon, "Saved. Your answers — and the change log below — are up to date." (`form-replay.tsx:32-42`).

### `saveFormReplay` server action (`[key]/actions.ts`)
- Re-runs auth + camp-access gate (`getAuthenticatedUserOrRedirect` → `ensureCampUser` → `hasCampAccess` else `redirect("/signup/required")`) (`actions.ts:28-32`). (Note: does NOT re-check onboarding/approval here — only invite gate.)
- Resolves `getReplayableForm(key)`; unknown → `{ ok: false, errors: { _root: "Unknown form." } }` (`actions.ts:34-35`).
- If `final === false` (intermediate "Next" — only reachable if `persistProgress` were true), returns `{ ok: true }` without persisting (`actions.ts:37-38`). In the replay flow `persistProgress=false`, so intermediate Next never calls this at all.
- Validates via `validateResponses(form.questionnaire, rawResponses)`; on failure returns `{ ok: false, errors }` (per-field + `_root` keys) (`actions.ts:40-41`).
- Re-loads stored state; if `!state?.completedAt` returns `{ ok: false, errors: { _root: "This form hasn't been completed yet." } }` (`actions.ts:43-49`).
- Diffs stored vs. new answers (`diffResponses`), filtering out the field whose id === `ID_NUMBER_KEY` ("id.number") so the plaintext ID number never lands in the change-log table (`actions.ts:51-58`).
- Saves the edited answers via `form.save` (full re-submit) (`actions.ts:60`).
- If `changes.length > 0`, appends one change-log row via `recordFormEdit` ({userId, questionnaireKey, version, editedByUserId=campUser.id, changes}) — a no-op replay records no row (`actions.ts:62-70`).
- Revalidates `/tools/forms/${key}` and `/tools/forms` (`actions.ts:72-73`), returns `{ ok: true }`.

### Registry + load/save (`lib/forms.ts`)
- `REGISTRY: ReplayableForm[]` currently contains **only** `BURNER_PROFILE` (`lib/forms.ts:89`). Comment states dietary / driver / future questionnaires slot in later "with no change to the tool, the change-log table, or the replay screen" (`lib/forms.ts:23-32`).
- `BURNER_PROFILE` entry: `key="burner_profile"`, `title="Burner profile"`, `description="The onboarding questionnaire — who you are in the dust, your teams, skills and logistics."`, `questionnaire=QUESTIONNAIRE` (`lib/forms.ts:49-54`).
- `BURNER_PROFILE.load(userId)`: reads `getBurnerProfile`; null → null. Merges decrypted ID number back into responses via `mergeIdNumber` so the owner's replay pre-fills the ID field. Returns `{ responses, completedAt, updatedAt }` (`lib/forms.ts:55-71`).
- `BURNER_PROFILE.save(userId, responses)`: `splitIdNumber` to pull `id.number` out of the JSONB, `upsertBurnerProfile({ userId, version: QUESTIONNAIRE.version, responses: cleaned, markComplete: true })`, then if `idNumber` present `setIdDocuments(userId, { idType, idNumber })`, then `satisfyBurnerProfileAction(userId)` to re-satisfy the onboarding gate (e.g. after a captain re-activated the questionnaire at a new version) (`lib/forms.ts:72-86`).
- `getReplayableForm(key)` = `REGISTRY.find((f) => f.key === key)` (`lib/forms.ts:91-93`).
- `listCompletedForms(userId)`: loops the registry, calls `form.load`, skips any without `completedAt`, returns `CompletedFormSummary[]` (`lib/forms.ts:107-123`).

### Change-log persistence (`lib/forms.ts` + `packages/db/src/questionnaire-edits.ts`)
- `recordFormEdit(input)`: under `isE2ETestMode()` writes to `testStore.recordQuestionnaireEdit`; otherwise `recordQuestionnaireEdit` (DB) (`lib/forms.ts:137-149`).
- `listFormEdits(userId, questionnaireKey, limit = 20)`: under test mode reads `testStore.listQuestionnaireEdits`; otherwise `listQuestionnaireEdits` (DB). Both map rows to `FormEdit` (`lib/forms.ts:151-175`).
- DB `recordQuestionnaireEdit`: inserts one row into `questionnaire_edits`. Caller is responsible for skipping the insert when `changes` is empty (`questionnaire-edits.ts:20-35`).
- DB `listQuestionnaireEdits`: selects rows for `(userId, questionnaireKey)`, ordered `desc(createdAt)` (most-recent-first), `.limit(limit)`; null `changes` coerced to `[]` (`questionnaire-edits.ts:40-68`).
- Test-store `recordQuestionnaireEdit`: pushes ``{ id: `test-edit-${nextSerial++}`, …, createdAt: new Date() }`` (`test-store.ts:281-297`).
- Test-store `listQuestionnaireEdits`: filters by `userId` + `questionnaireKey`, sorts by `createdAt` descending, slices to `limit` (default 20) (`test-store.ts:298-309`).

## User actions & interactions
- **Open the forms list**: navigate to `/tools/forms` (linked from the Tools surface; see unit 11). Back link returns to `/tools`.
- **Open a form to replay**: tap a form card → `/tools/forms/{key}` (`page.tsx:69-72`).
- **Step through the wizard**: "Next"/"Back" page navigation; in replay mode Next advances **locally only** (no save) because `persistProgress=false` (`wizard.tsx:103-108`, `form-replay.tsx:44`).
- **Skip a lone optional unanswered question**: the wizard's final button text becomes "Skip" instead of "Next" when the page has a single optional question with no value (`wizard.tsx:160-172`). (Wizard mechanics belong to unit 04.)
- **Save changes**: final-page submit button labelled "Save changes" → `saveFormReplay(formKey, responses, true)` (`form-replay.tsx:46`, `wizard.tsx:255-257`).
- **See confirmation**: on success a status banner appears and the change log refreshes in place via `router.refresh()` (`form-replay.tsx:32-52`).
- **Back to list**: back link "My forms" → `/tools/forms` (`[key]/page.tsx:58-64`).
- **Read the change log**: scroll to the "Change log" section under the wizard; entries are read-only (no edit/delete actions on the log).

## States & presentations
Applies the global-states rows as follows:
- **Empty (list)**: no completed forms → "You haven't completed any forms yet." (`page.tsx:60-63`).
- **Empty (change log)**: no edits → "No edits yet. Changes you make here will show up in this list." (`[key]/page.tsx:92-95`).
- **Loading**: both pages are `force-dynamic` server components — no in-page spinner; data is awaited server-side before first paint. (Wizard transitions use `isPending` to disable buttons — unit 04.)
- **Populated**: list shows form cards; detail shows the pre-filled wizard + change-log entries.
- **Validation-error**: `saveFormReplay` returns `{ ok: false, errors }` from `validateResponses`; per-field errors render against question fields, `_root`/`_form` render in the wizard banner (`actions.ts:40-41`, `wizard.tsx:176,189-196`). Local page validation (`required`, ID cross-field) blocks Next/Submit before the action runs (`wizard.tsx:79-101`).
- **Submitting/pending**: wizard `isPending` disables Back/Submit during the action transition (`wizard.tsx:62,250,255`).
- **Success**: "Saved. Your answers — and the change log below — are up to date." banner + log refresh (`form-replay.tsx:32-42`).
- **Disabled**: Back disabled on first page / while pending (`wizard.tsx:250`); submit disabled while pending (`wizard.tsx:255`).
- **Invite-gated**: `!hasCampAccess` → `redirect("/signup/required")` on both pages and inside the save action (`page.tsx:30-32`, `[key]/page.tsx:32-34`, `actions.ts:30-32`).
- **Onboarding-incomplete**: burner profile `!completedAt` → `redirect("/onboarding/questionnaire")` (both pages; **not** re-checked in the save action) (`page.tsx:34-36`, `[key]/page.tsx:36-39`).
- **Pending-approval**: `!isApproved` → `redirect("/pending-approval")` (both pages; not in save action) (`page.tsx:37-39`, `[key]/page.tsx:40-42`).
- **Rejected**: covered by `isApproved` returning false for non-approved status → same `/pending-approval` redirect (terminal-rejected handled by that surface). (`isApproved` only treats `approvalStatus === "approved"` (or god email) as approved — `users.ts:231-236`.)
- **Captain-only-locked**: N/A — this surface is open to any approved member; there is no rank gate here. The form being replayable depends on completion, not rank.
- **Not-found**: unknown `[key]` → `notFound()` (404) (`[key]/page.tsx:45`).
- **Not-yet-completed redirect**: replaying a form with no completion → `redirect("/tools/forms")` (`[key]/page.tsx:49-51`).

## Enums, options & configurable values
- **Registry keys**: only `"burner_profile"` is wired today (`lib/forms.ts:50,89`). The key is the stable registry key shared with `required_actions` / `questionnaire_activations`.
- **Questionnaire version**: `QUESTIONNAIRE.version = "2026.05.29-v8"` (`lib/questionnaire.ts:60`) — stamped onto every change-log row and onto the burner-profile re-save.
- **Reserved error-map keys** (wizard banner): `_form` (`FORM_ERROR_KEY`), `_root` (`ROOT_ERROR_KEY`) (`wizard.tsx:21-22`). Action emits `_root` for non-field failures.
- **ID keys**: `ID_NUMBER_KEY = "id.number"`, `ID_TYPE_KEY = "id.type"` (`id-documents.ts:7-8`). `id.number` is excluded from the change log; `id.type` stays in responses.
- **ID type values** (in `splitIdNumber`/`idColumnsFor`): `"passport"` (default) | `"sa_id"` | `null` (`id-documents.ts:15,43-49`).
- **listFormEdits / listQuestionnaireEdits limit**: default `20` (`lib/forms.ts:153`, `questionnaire-edits.ts:42`, `test-store.ts:301`).
- **Empty-display sentinel** in change-log values: `EMPTY_DISPLAY = "—"` (em dash) for unanswered fields (`questionnaire.ts:232,243-245`).
- **Multi-select join**: changed multi-select values rendered as labels joined with `", "` (`questionnaire.ts:259-262,264`).
- **Date format** (both pages): `Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short" })` (`page.tsx:22-25`, `[key]/page.tsx:18-21`).
- **Save labels**: `submitLabel="Save changes"` (replay) vs wizard default "Finish" (`form-replay.tsx:45`, `wizard.tsx:55`).
- **SaveResult type**: `{ ok: true } | { ok: false; errors: Record<string, string> }` (`actions.ts:11-13`).
- **`persistProgress=false`** and **`firstStepSignOut` unset** for the replay flow (the latter defaults false; replay users are established members) (`form-replay.tsx:44`, `wizard.tsx:46,56`).

## Data model touched
(Field names verbatim; must agree with unit 29.)

### `questionnaire_edits` table (`packages/db/src/schema.ts:530-562`, Drizzle export `questionnaireEdits`)
- `id` — `uuid`, `defaultRandom()`, primary key.
- `userId` — `uuid("user_id")`, not null, FK → `users.id`, `onDelete: "cascade"`. The subject whose answers these are.
- `questionnaireKey` — `text("questionnaire_key")`, not null. Same registry key as `required_actions` / `questionnaire_activations` (e.g. "burner_profile").
- `version` — `text("version")`, not null. Catalogue version in force at edit time.
- `editedByUserId` — `uuid("edited_by_user_id")`, FK → `users.id`, `onDelete: "set null"`, **nullable**. Who performed the edit (usually the subject; nullable so a captain editing on someone's behalf, or a deleted account, keeps the log intact).
- `changes` — `jsonb("changes")` typed `$type<QuestionnaireFieldChange[]>()`, not null, default `[]`.
- `createdAt` — `timestamp("created_at", { mode: "date" })`, not null, `defaultNow()`.
- Index `questionnaire_edits_user_key_created_idx` on `(userId, questionnaireKey, createdAt)` (`schema.ts:556-560`).

### `QuestionnaireFieldChange` (one entry in `changes[]`) (`packages/types/src/questionnaire.ts:211-219`)
- `fieldId` — `z.string().min(1)` — the question id (dotted/namespaced, e.g. "id.number").
- `label` — `z.string()` — the question prompt captured **at edit time** (stays readable even if catalogue copy changes later).
- `from` — `z.string()` — human-readable display value before the edit.
- `to` — `z.string()` — human-readable display value after the edit.

### `FormEdit` / `QuestionnaireEditRow` (returned shapes)
- `FormEdit` (`lib/forms.ts:129-135`): `{ id, version, editedByUserId, changes: QuestionnaireFieldChange[], createdAt }` — note it drops `questionnaireKey` from the DB row.
- `QuestionnaireEditRow` (`questionnaire-edits.ts:6-13`): `{ id, questionnaireKey, version, editedByUserId, changes, createdAt }`.
- Test-store `TestQuestionnaireEdit` (`test-store.ts:35-43`): `{ id, userId, questionnaireKey, version, editedByUserId, changes, createdAt }`.

### `burner_profiles` (read by `load`, written by `save`; full table is unit 29)
Touched fields: `responses` (JSONB), `completedAt`, `updatedAt`, `version`, `userId`. `BurnerProfileSummary` returned shape: `{ responses, completedAt, updatedAt, version }` (`users.ts:155-160`). `upsertBurnerProfile` insert/`onConflictDoUpdate` on `userId`, sets `version`, `responses`, `updatedAt = now`, and `completedAt = now` when `markComplete` (else preserves existing) (`burner-profile.ts:134-161`).

### `users` ID columns (via `setIdDocuments`/`getIdDocuments`)
The government ID number is stored encrypted on `users` (AES-256-GCM via `PGCRYPTO_KEY`), in `passportEncrypted` / `saIdEncrypted` columns selected by `idColumnsFor` (`id-documents.ts:43-49`, `users.ts:328-348`). It is merged into responses on `load` and split out on `save`; it is never written to `questionnaire_edits`.

### `CompletedFormSummary` (list-page row) (`lib/forms.ts:95-101`)
`{ key, title, description, completedAt: Date, updatedAt: Date | null }`.

### `ReplayableForm` (registry interface) (`lib/forms.ts:34-47`)
`{ key, title, description, questionnaire, load(userId) → { responses, completedAt, updatedAt } | null, save(userId, responses) → void }`.

## Validation, edge cases & business rules
- **Only completed forms are listed/replayable**: `listCompletedForms` skips any registry entry without `completedAt`; the detail page redirects to the list if the loaded state isn't completed (`lib/forms.ts:113`, `[key]/page.tsx:49-51`).
- **Unknown form key**: list→detail link can only produce known keys, but a hand-typed `[key]` → `notFound()` (404) on the page, and `_root: "Unknown form."` in the save action (`[key]/page.tsx:45`, `actions.ts:35`).
- **Final-submit-only persistence**: replay wizard runs `persistProgress=false`; intermediate Next presses don't hit the server. The diff therefore compares stored answers against the *final* edit, never half-saved progress (`actions.ts:15-22`, `wizard.tsx:30-35`).
- **No-op replay records no row**: when `diffResponses` yields zero changes, the form is still re-saved (identical answers) but `recordFormEdit` is skipped (`actions.ts:62-70`; reinforced by the schema comment `schema.ts:528` and the db helper comment `questionnaire-edits.ts:15-19`).
- **ID-number redaction from the log**: `diffResponses` output is filtered to drop `c.fieldId !== ID_NUMBER_KEY` so the plaintext government ID never enters `questionnaire_edits`. Because `load` merges the decrypted number into the responses, it sits on both sides of the diff and would otherwise be logged (`actions.ts:51-58`).
- **Diff semantics** (`diffResponses`, `questionnaire.ts:298-316`): iterates `flattenQuestions` (questionnaire order), compares via `sameValue`. Multi-selects compared as **sets** (re-ordering is not a change). Empty/absent answers (`undefined`/`null`/`""`/empty array) treated as equal to each other. Only questions in the current catalogue are considered — stale keys from an older version are ignored. Each change's `from`/`to` are `displayResponseValue` (option labels resolved, lists joined, empty → "—").
- **Validation** (`validateResponses`, `questionnaire.ts:324+`): malformed payload → `{ _root: "Malformed response payload" }`; unknown response keys are dropped (question may have been removed in a later version); missing required questions return per-question errors; values normalised per kind.
- **Local pre-submit validation** (wizard): required questions blocked when empty ("This question is required"); cross-field rule validates `id.number` against the chosen `id.type` via `validateIdNumber` before advancing/submitting (`wizard.tsx:79-101`).
- **Re-submit re-satisfies the onboarding gate**: `save` calls `satisfyBurnerProfileAction`, so re-submitting after a captain re-activates the questionnaire at a new version clears the new required-action row. Under E2E test mode this is a no-op (`lib/forms.ts:85`, `users.ts:204-209`).
- **Version stamping**: the change-log row records `form.questionnaire.version` (current catalogue version, `"2026.05.29-v8"`), and the re-save writes that version onto `burner_profiles.version` — so a replay updates the stored version to the current one (`actions.ts:67`, `lib/forms.ts:75`).
- **Save action does NOT re-gate onboarding/approval** — it only re-checks auth + `hasCampAccess` (`actions.ts:28-32`). The page-level gates are the primary enforcement; a request could reach the action after the page passed.
- **`editedByUserId` is always the subject here**: `saveFormReplay` passes `campUser.id` as `editedByUserId` (`actions.ts:66`). The nullable/“captain on behalf” path in the schema exists for a future flow not wired in this surface.
- **Change-log ordering & cap**: most-recent-first, capped at 20 by default (DB `orderBy(desc(createdAt)).limit`, test-store `sort desc + slice`). Older edits beyond 20 are not shown (`questionnaire-edits.ts:62-63`, `test-store.ts:303-308`).
- **`completedAt` overwrite ugly truth**: `lib/forms.ts:78-80` comment claims "markComplete is idempotent on completedAt", but `upsertBurnerProfile`'s `onConflictDoUpdate` sets `completedAt = now` whenever `markComplete` is true (`burner-profile.ts:156-158`) — so a replay actually **bumps `completedAt` to the re-submit time** (not preserving the original completion timestamp). `updatedAt` is also set to `now`. The list/detail "Last edited" line uses `updatedAt ?? completedAt`, so this affects displayed timestamps. <!-- low-confidence: whether this completedAt overwrite is intended; the inline comment and code disagree. -->
- **`final === false` branch is effectively dead in this flow**: replay sets `persistProgress=false`, so the wizard never calls the action with `final=false` (`wizard.tsx:105-108`). The `if (!final) return { ok: true }` guard (`actions.ts:38`) only matters if a future caller reuses this action with `persistProgress=true`.

## Sub-components / variants
- **`FormsListPage`** (`tools/forms/page.tsx`) — list server component. No variants; single empty/populated branch.
- **`FormReplayPage`** (`tools/forms/[key]/page.tsx`) — detail server component; renders `FormReplay` + `ChangeLog`.
- **`ChangeLog`** (`tools/forms/[key]/page.tsx:84-126`) — presentational sub-component; empty vs. populated branch; read-only.
- **`FormReplay`** (`form-replay.tsx`) — client shell; the only consumer of `saveFormReplay`; configures the shared wizard for replay.
- **`saveFormReplay`** (`[key]/actions.ts`) — the single server action / validator pipeline (validate → load-check → diff+redact → save → record → revalidate).
- **`ReplayableForm` registry** (`lib/forms.ts`) — `BURNER_PROFILE` is the only live entry; the registry pattern is built to accept dietary/driver/future forms with no UI change. The `save`/`load` ID-merge logic is bespoke to the burner profile.
- **Change-log read/write helpers** — `recordFormEdit`/`listFormEdits` (lib, with E2E test-mode routing) delegating to `recordQuestionnaireEdit`/`listQuestionnaireEdit` (DB) or `testStore.recordQuestionnaireEdit`/`listQuestionnaireEdits` (in-memory).
- **No dead/orphaned UI variants** found in this surface. The only quasi-dead code is the `final=false` action branch (see Validation) and the contradictory `completedAt` idempotency comment.
- **Shared primitives reused** (not owned here): `QuestionnaireWizard` + field machine (unit 04 / field kinds unit 20); `Card`/`CardHeader`/`CardTitle`/`CardDescription`, `Button`; lucide `ChevronLeft`/`ChevronRight`/`CheckCircle2`.

---

# 13 — Family tree referral graph

**Files covered:**
- `apps/web/app/family-tree/page.tsx` — server page; gates access (invite + approval), loads the roster, renders the page chrome (back-to-Tools link, title, subtitle), mounts the client `<FamilyTree>`.
- `apps/web/app/family-tree/family-tree.tsx` — `"use client"` component; builds the parent→child tree from the flat roster, renders the search box / expand-collapse controls / recursive `<Branch>` rows, and all client-side filtering & expansion state.
- `packages/db/src/relations.ts` — server-only Drizzle query layer; `getReferralRoster()` (the only one the page uses), plus the unused `getInvitesIssuedBy()` and `getRootCodes()` helpers. Defines `ReferralUser`.
- `packages/db/src/schema.ts` — source of the two tables read: `users` (referenced cols: `id`, `display_name`, `rank`, `invite_code`) and `invite_codes` (referenced col: `created_by_user_id`, joined via `code`).
- `apps/web/lib/users.ts` — gating helpers `ensureCampUser`, `hasCampAccess`, `isApproved` (and `CampUser` shape supplying `viewerUserId`).
- `apps/web/lib/auth.ts` — `getAuthenticatedUserOrRedirect` (auth gate, redirects to `/auth/sign-in`).
- `apps/web/lib/access-control.ts` — `isGodEmail` (god accounts bypass invite/approval gates).
- `apps/web/app/tools/page.tsx` — the entry tile that links here (`/tools` → "Family tree" / GitBranch / "See who brought who onto camp.").

**Purpose:** A read-only, whole-camp visualisation of the referral graph — "who brought who onto Camp 404". It renders every camp user as a node in a collapsible parent→child tree, where each node's parent is the user who issued the invite code that node redeemed. **Roots** are accounts with no inviter (god/founder accounts that pre-date the invite system, or whose redeemed code has a NULL `created_by_user_id`); **branches** are accounts whose redeemed invite code maps to an issuing user. The page supports name/invite-code search (with ancestor-path promotion), expand-all/collapse-all, per-node descendant counts, and highlights the viewer's own node and search matches. It is a pure visualisation — there are no mutating actions on this surface.

## Features

### Page chrome & access gating (`page.tsx`)
- `export const dynamic = "force-dynamic"` (`page.tsx:9`) — always server-rendered fresh, never statically cached.
- `export const metadata = { title: "Family tree — Camp 404" }` (`page.tsx:11`).
- **Three sequential gates** before render (`page.tsx:14-21`):
  1. `getAuthenticatedUserOrRedirect()` → if unauthenticated, redirect to `/auth/sign-in` (`auth.ts:40-44`).
  2. `ensureCampUser(authUser)` then `if (!hasCampAccess(campUser, authUser.primaryEmail)) redirect("/signup/required")` — invite-gated (`page.tsx:15-18`).
  3. `if (!isApproved(campUser, authUser.primaryEmail)) redirect("/pending-approval")` — pending/rejected accounts blocked (`page.tsx:19-21`).
- After gates pass: `const roster = await getReferralRoster()` (`page.tsx:23`), then render `<FamilyTree roster={roster} viewerUserId={campUser.id} />` (`page.tsx:40`).
- Layout container: `<main className="mx-auto max-w-3xl px-6 py-10">` (`page.tsx:26`). **NOTE:** this surface uses `max-w-3xl`, not the global `max-w-lg` mobile shell — a deliberately wider tree canvas. <!-- low-confidence: whether the wider width is intentional vs. an oversight; only the literal class is confirmed. -->
- **Back link:** ghost `<Button asChild variant="ghost" size="sm">` wrapping `<a href="/tools">` with a `ChevronLeft` icon and text "Tools" (`page.tsx:27-31`).
- **Header:** `<h1>` "Family tree"; `<p>` subtitle (muted): "Who brought who onto Camp 404. Roots are accounts that pre-date the invite system; every other branch is one invite-code redemption." (`page.tsx:32-38`).

### Roster query (`relations.ts` — `getReferralRoster`)
- Selects one row per user (`relations.ts:22-39`): `id`, `displayName`, `rank` from `users`; `inviteCode` = `users.invite_code`; `inviterId` = `inviteCodes.createdByUserId`.
- `LEFT JOIN invite_codes ON invite_codes.code = users.invite_code` (`relations.ts:33-36`) — left join so users with a NULL `invite_code` (god accounts) still appear, with `inviterId = NULL`.
- `ORDER BY users.displayName ASC` (`relations.ts:37`) — stable ordering; comment "Ordered by displayName so the page is stable."
- `inviterId` is NULL for "the founder / god accounts that pre-date any code" (`relations.ts:18-21`). It is also NULL if a user's redeemed code exists but has a NULL `created_by_user_id` (a root code), or — because of the left join — if the user's `invite_code` no longer matches any `invite_codes.code` row.
- Returns `ReferralUser[]` (`relations.ts:9-15`): `{ id: string; displayName: string | null; rank: "captain" | "member"; inviteCode: string | null; inviterId: string | null }`.

### Tree construction (`family-tree.tsx` — `buildTree`)
- `buildTree(roster)` (`family-tree.tsx:275-287`): builds `Map<id, TreeNode>` of `{ user, children: [] }`, then for each user looks up `byId.get(u.inviterId)`; if a parent node exists, push as its child, else treat as a root. Returns the array of root `TreeNode`s.
- **Orphan-as-root behaviour:** if `inviterId` is non-null but the referenced inviter is NOT in the roster (e.g. inviter excluded/missing), `parent` is `null` and the node becomes a root (`family-tree.tsx:282-284`). No error.
- Memoised on `roster` (`family-tree.tsx:35`).

### Search / filter (`family-tree.tsx`)
- Search input (`family-tree.tsx:84-89`): placeholder "Search by name or invite code…", magnifying-glass `Search` icon absolutely positioned left.
- `matchIds` (`family-tree.tsx:37-55`): trims + lowercases the query; if empty → `null` (no filtering). Otherwise builds a `Set` of user ids whose haystack `` `${displayName ?? ""} ${inviteCode ?? ""}` `` (lowercased) **includes** the query substring.
- **Ancestor promotion** (`family-tree.tsx:45-53`): for every direct match, walk up `inviterId` chain (`parentById` map) and add every ancestor to `matchIds`, "so the path stays visible".
- `visibleTrees` (`family-tree.tsx:75-77`): when searching, only roots whose subtree contains a match are shown (`subtreeHasMatch`). Otherwise all roots.
- `effectiveExpanded` (`family-tree.tsx:68-73`): when searching, force every matched-or-promoted id into the expanded set (merged with user's manual expansion) so a deep match isn't hidden inside a collapsed ancestor.
- `subtreeHasMatch(node, matches)` (`family-tree.tsx:289-292`): true if the node or any descendant id is in `matches`.
- Within an open `<Branch>`, children are also filtered to those whose subtree has a match while searching (`family-tree.tsx:159-161`).

### Expand / collapse state (`family-tree.tsx`)
- `expanded: Set<string>` of user ids (`family-tree.tsx:30-33`). **Default:** every root (`!u.inviterId`) is expanded one level so the page isn't a blank list.
- `toggle(id)` (`family-tree.tsx:57-63`): flips a single id in/out of the set. Wired to each row's chevron button.
- **"Expand all"** button (`family-tree.tsx:91-99`, outline/sm): `setExpanded(new Set(roster.map(u => u.id)))` — every node expanded.
- **"Collapse"** button (`family-tree.tsx:100-106`, outline/sm): `setExpanded(new Set())` — all collapsed (roots still rendered; their children hidden).
- A row only toggles when it `hasChildren` (`family-tree.tsx:197`).

### Branch row rendering (`family-tree.tsx` — `Branch`)
- Recursive. Each `<li>` indents by `paddingLeft: depth * 20` px (`family-tree.tsx:167`).
- **Tree guide lines** (pure CSS, no SVG; only for `depth > 0`, `family-tree.tsx:172-193`): a vertical `border-l` line (full height, or stopping at `bottom: "50%"` when `isLastChild`) plus a horizontal `border-t` elbow (`width: 14`, `top: 22`) joining the row's card. Positioned with `left: (depth - 1) * 20 + 18`.
- **Toggle button** (`family-tree.tsx:195-211`): `h-11 w-6`, `aria-label` "Collapse" when open / "Expand" when closed. Shows `ChevronDown` (open) or `ChevronRight` (closed) when the node has children; a small dot (`h-1.5 w-1.5 rounded-full bg-muted-foreground/40`) for leaf nodes. `disabled` when no children (`disabled:opacity-30`).
- **Node card** (`<Card>`, `family-tree.tsx:213-252`):
  - Avatar slot: a circular bordered badge with a generic `User` (lucide `UserIcon`) glyph — **NOT** the member's `profileImageUrl` (this surface ignores it). <!-- low-confidence: profileImageUrl exists on users but is not selected by getReferralRoster, so the family tree cannot show real avatars. -->
  - Display name: `node.user.displayName ?? "(no name)"` (`family-tree.tsx:226-228`), truncated.
  - **Captain badge:** if `rank === "captain"`, an amber pill reading "Captain" (`family-tree.tsx:229-233`). No badge for `member`.
  - **"You" badge:** if `node.user.id === viewerUserId`, a primary-coloured pill reading "You" (`family-tree.tsx:234-238`).
  - **Invite-code line:** if `inviteCode` present, a muted line "via `<code>`" (monospaced code), truncated (`family-tree.tsx:240-244`). Absent for users with NULL `invite_code`.
  - **Descendant-count pill:** if the node `hasChildren`, a muted pill showing `countDescendants(node)` (`family-tree.tsx:246-250`).
- **Highlight rings** (`family-tree.tsx:213-218`): viewer node gets `ring-1 ring-primary`; a search-match node gets `border-amber-400/60` (only while `matchIds` is active).
- Children render (`family-tree.tsx:255-270`) only when `hasChildren && isOpen && visibleChildren.length > 0`; each child passes `depth + 1` and `isLastChild={idx === visibleChildren.length - 1}`.

### Descendant count (`family-tree.tsx` — `countDescendants`)
- `countDescendants(node)` (`family-tree.tsx:294-302`): walks the subtree and sums `t.children.length` recursively — i.e. **total descendants** (all generations below), not just direct children.

## User actions & interactions
- **Navigate back to Tools** — tap the "Tools" ghost button (`href="/tools"`).
- **Type a search query** — filters the tree to subtrees containing matches by display name OR invite code (case-insensitive substring), auto-expanding matched paths and promoting/showing ancestors.
- **Clear the search** — emptying the field restores the full tree and the user's manual expansion state.
- **Toggle a single node** — tap a node's chevron (only enabled when it has children) to expand/collapse its children.
- **Expand all** — reveal every node.
- **Collapse** — collapse every node to roots only.
- There are **no** mutating actions on this surface: no invite, no edit, no delete, no node selection/drill-in, no link to a member's profile. Read-only.

## States & presentations
Global-state rows that apply:
- **Invite-gated** — non-god user with no `inviteCode` is redirected to `/signup/required` before the page renders (`page.tsx:15-18`; `hasCampAccess` `users.ts:219-224`).
- **Pending-approval** — `approval_status = 'pending'` (non-god) is redirected to `/pending-approval` (`page.tsx:19-21`; `isApproved` `users.ts:231-236`).
- **Rejected** — `approval_status = 'rejected'` (non-god) is **not** `'approved'`, so `isApproved` is false → also redirected to `/pending-approval` (terminal denial). The family-tree page itself draws no distinct rejected screen.
- **Loading** — server component; no client loading state. The list renders once the server query resolves. (No skeleton/spinner.)
- **Empty (no accounts)** — `visibleTrees.length === 0` with no query → a `<Card>` reading "No accounts yet." (`family-tree.tsx:109-114`).
- **Empty (no search matches)** — `visibleTrees.length === 0` with a non-empty query → same card reading "No matches." (`family-tree.tsx:112`).
- **Populated** — the recursive tree of `<Branch>` rows (`family-tree.tsx:116-130`).
- **Viewer-highlight state** — the viewer's own node carries `ring-1 ring-primary` + a "You" pill.
- **Match-highlight state** — matched nodes carry `border-amber-400/60` while a query is active.
- **Disabled state** — leaf-node toggle buttons are `disabled` (`disabled:opacity-30`); the dot replaces the chevron.
- **Captain-only-locked** — **N/A here.** This surface is NOT rank-gated: any approved, invite-holding camp member (captain or member) sees the full whole-camp tree. The `/tools` tile linking here is likewise ungated by rank (`tools/page.tsx:42-47`).
- **NOT present:** no validation-error, submitting/pending, success, onboarding-incomplete, offline/sync, or budget states — there are no forms or writes on this surface. (Onboarding-incomplete is handled upstream by the global gating spine, not in this page.)

## Enums, options & configurable values
- **`rank`** (`schema.ts:31`): `"captain" | "member"`. Only `"captain"` renders a badge; `"member"` renders none. The `TreeUser.rank` / `ReferralUser.rank` types mirror this literal union (`family-tree.tsx:12`, `relations.ts:12`).
- **`approval_status`** (`schema.ts:41-45`, gate input): `"pending" | "approved" | "rejected"`. Only `"approved"` (or god) reaches the page.
- **Indentation step:** `20` px per depth level (`family-tree.tsx:167, 178-189, 261`).
- **Guide-line geometry constants:** vertical line `left: (depth-1)*20 + 18`; horizontal elbow `width: 14`, `top: 22`; last-child vertical `bottom: "50%"` (`family-tree.tsx:178-191`).
- **Default expansion:** roots only, one level (`family-tree.tsx:30-33`).
- **Search haystack:** `` `${displayName ?? ""} ${inviteCode ?? ""}` `` lowercased; substring match (`family-tree.tsx:42-43`).
- **Roster ordering:** `displayName` ascending (`relations.ts:37`).
- **Page width:** `max-w-3xl` (`page.tsx:26`).
- No other configurable thresholds, no pagination limit (whole roster loaded at once).

## Data model touched
**Read-only.** Two tables, joined by `getReferralRoster` (`relations.ts:22-39`):

- **`users`** (`schema.ts:220-303`) — columns read:
  - `id` (`uuid`, PK) → `ReferralUser.id` / node identity / `viewerUserId` comparison.
  - `display_name` (`text`, nullable) → `ReferralUser.displayName` (rendered as `(no name)` when null).
  - `rank` (`rank` enum, NOT NULL, default `member`) → `ReferralUser.rank` (captain badge).
  - `invite_code` (`text`, nullable; `schema.ts:260`) → `ReferralUser.inviteCode` ("via …" line) AND the join key. NULL = god account.
  - (`profile_image_url` exists on the row but is **not** selected — see note above.)
- **`invite_codes`** (`schema.ts:312-342`) — columns read/used:
  - `code` (`text`, PK) → join target (`inviteCodes.code = users.invite_code`).
  - `created_by_user_id` (`uuid`, FK → `users.id`, `onDelete: set null`; `schema.ts:316-318`) → `ReferralUser.inviterId` (the parent edge). NULL for root/bootstrap codes.
- **Viewer identity:** `campUser.id` (the `CampUser` from `ensureCampUser`, `users.ts:39-47`) is passed as `viewerUserId`.

**Unused-but-defined queries** (in the same file, NOT called by this surface):
- `getInvitesIssuedBy(userId)` (`relations.ts:45-53`): all `invite_codes` rows where `created_by_user_id = userId`, ordered by `created_at` asc. <!-- low-confidence: grep finds no caller anywhere in apps/packages; appears orphaned/future. -->
- `getRootCodes()` (`relations.ts:60-67`): all `invite_codes` rows with NULL `created_by_user_id`. <!-- low-confidence: grep finds no caller anywhere in apps/packages; appears orphaned/future. -->

This agrees with unit 29's `users` / `invite_codes` definitions (single schema source `packages/db/src/schema.ts`).

## Validation, edge cases & business rules
- **Access rules (in order):** authenticated → has camp access (god email OR non-null `invite_code`) → approved (god OR `approval_status = 'approved'`). Failing any gate redirects out; the page never partially renders for a blocked user.
- **God accounts** (`isGodEmail`, `access-control.ts:24-31`): email in `GOD_EMAILS` (case-insensitive). They bypass both invite and approval gates regardless of stored `invite_code`/`approval_status`; in the tree they typically appear as **roots** (NULL `invite_code` → NULL `inviterId`).
- **Roots vs branches** is purely derived from `inviterId == null`: a user with no invite code, a user whose code's `created_by_user_id` is NULL, OR a user whose code matches no `invite_codes` row (left join miss) all become roots.
- **Self-referential / cycle safety (source bug — §6):** the `matchIds` ancestor-promotion walk (`family-tree.tsx:47-53`) follows `inviterId` via a `while (cursor)` loop with **no visited-set guard**. A cyclic `inviterId` chain (A invited B, B invited A — e.g. via manual DB edits) makes `cursor` never reach null, so the loop **infinite-loops** (hangs the client render) on any search query. `buildTree` likewise never places such mutually-referencing nodes as roots (they'd both be each other's children). Cycles are presumed impossible by domain (you can't redeem a code before existing), but no code defends against them. <!-- source bug — see verification report §6; doc records current (buggy) behaviour, code change out of scope for this docs PR. -->
- **Missing display name:** rendered "(no name)"; still searchable only by invite code.
- **Match without query:** when `query` is empty, `matchIds` is null → no highlight borders, no forced expansion, full tree shown.
- **Descendant count** counts ALL generations below a node, not just direct children (`countDescendants`).
- **Leaf nodes** cannot be toggled (button disabled, dot marker shown).
- **Whole roster is fetched and rendered every load** — no pagination, no lazy loading; scales to the camp's ~30-80 people by design.
- **Stale-data tolerance:** `force-dynamic` means each visit re-queries; no caching/invalidation concerns on this surface.
- **No write path** → no validation errors, no optimistic UI, no conflict handling.

## Sub-components / variants
- **`<FamilyTree>`** (`family-tree.tsx:22-133`) — the client container: search box, Expand-all/Collapse buttons, empty-state card, list of root `<Branch>`es. Props: `{ roster: TreeUser[]; viewerUserId: string }`.
- **`<Branch>`** (`family-tree.tsx:145-273`) — recursive row. Props `BranchProps` (`family-tree.tsx:135-143`): `{ node, depth, expanded, onToggle, matchIds, viewerUserId, isLastChild }`. Renders guide lines, toggle, the node card (avatar/name/captain badge/you badge/via-code/count pill), then its visible children.
- **Pure helpers (module-scope, not exported):** `buildTree` (roster→roots), `subtreeHasMatch` (match recursion), `countDescendants` (total-descendant count). All defined in `family-tree.tsx`.
- **Types:** `TreeUser` (exported, `family-tree.tsx:9-15`) — structurally identical to `relations.ts`'s `ReferralUser`, duplicated client-side. `TreeNode` (`family-tree.tsx:17-20`): `{ user: TreeUser; children: TreeNode[] }`.
- **Shared UI primitives used:** `@camp404/ui` `Button` (variants `ghost`, `outline`; sizes `sm`), `Card` + `CardContent`, `Input`. Lucide icons: `ChevronLeft` (page), `ChevronDown`/`ChevronRight`/`Search`/`User` (component), `GitBranch` (the `/tools` tile only).
- **Orphaned server helpers (flagged):** `getInvitesIssuedBy` and `getRootCodes` in `relations.ts` are exported but have no callers anywhere in the repo — dead/future code carried alongside the live `getReferralRoster`.
- **No dead UI variants** within the page itself; the only "variant" branching is leaf-vs-parent rendering and the highlight/badge conditionals described above.

---

# 14 — Captain camp management — roster & member detail

**Files covered:**
- `apps/web/app/captains/camp-management/page.tsx` — Server component route. Authn + invite + approval gating, then loads roster rows ONLY when the viewer is a captain; renders the page shell + `<CampManagementRoster locked={!isCaptain}>`.
- `apps/web/app/captains/camp-management/camp-management-roster.tsx` — `"use client"` roster table + per-member detail modal (tabs, approve/reject/ping actions, locked state, search/filter).
- `apps/web/app/captains/camp-management/actions.ts` — `"use server"` server actions: `requireCaptain` gate, `getMemberDetailAction`, `decideApprovalAction`. Decrypts the ID number behind the captain gate.
- `apps/web/lib/camp-roster.ts` — Pure view-model: `toRosterRow` collapses a `CampManagementMember` DB facet bundle into a `RosterRow` (status precedence, labels, derived flags).
- `apps/web/lib/member-detail.ts` — Pure view-model: `presentMemberDetail` builds the serializable `PresentedMember` (overview list + questionnaire-grouped profile sections + approval summary) from a `CampMemberDetail`.
- `packages/db/src/roster.ts` — DB queries: `getCampManagementRoster` (one row per real member with aggregated facets), `getCampMemberDetail` (full per-member detail incl. invite provenance + encrypted ID columns), `isTeamLead`.
- Supporting (followed via imports): `apps/web/lib/users.ts` (`ensureCampUser`, `hasCampAccess`, `isApproved`, `decideUserApproval`); `packages/db/src/burner-profile.ts` (`setUserApproval`); `packages/db/src/crypto.ts` (`decryptOrNull`, AES-256-GCM); `packages/db/src/id-documents.ts` (`mergeIdNumber`, `idColumnsFor`, key constants); `apps/web/lib/questionnaire.ts` + `apps/web/lib/countries.ts` (catalogue + country names); `packages/db/src/schema.ts` (`users`, `burner_profiles`, `driver_profiles`, `team_memberships`, `required_actions`, `invite_codes`).

**Purpose:** The captain-only "who is on camp and where are they up to" command surface. It renders one roster row per real (non-system, non-sanitised) camp member — rank, signup status, and yes/no facets (required questionnaires complete, registered driver, in South Africa) plus home country — searchable and filterable by "awaiting approval". Clicking a row opens a per-member modal (Overview + Profile tabs) that decrypts and shows the member's full burner-profile answers, invite provenance, and government ID; from it a captain can approve or reject a pending applicant (Ping is a disabled placeholder). Access is enforced server-side at the data layer, not by redirect: non-captains reach the page but see a blurred, data-free locked shell, and every server action re-checks captain rank.

## Features

### Page shell + server-side rank gate (`page.tsx`)
- `export const dynamic = "force-dynamic"` (page.tsx:10) — never statically cached.
- `metadata = { title: "Camp management — Camp 404" }` (page.tsx:12).
- Gating order (page.tsx:20-27): `getAuthenticatedUserOrRedirect()` (→ sign-in if unauthenticated) → `ensureCampUser(authUser)` → `if (!hasCampAccess(...)) redirect("/signup/required")` → `if (!isApproved(...)) redirect("/pending-approval")`.
- `isCaptain = campUser.rank === "captain"` (page.tsx:29).
- Data is loaded ONLY for captains: `rows = isCaptain ? (await getCampManagementRoster()).map(toRosterRow) : []` (page.tsx:31-33). The locked view receives ZERO data — clearance is enforced at the server, the comment stresses "non-captains can reach this page but see a locked, empty shell — the server never sends them roster data" (page.tsx:14-17, 30).
- Renders a back `Button` (ghost, sm) linking to `/` labelled "Captains" with a `ChevronLeft` icon (page.tsx:37-41).
- Header: H1 "Camp management" + descriptive paragraph: "Everyone who has signed up, their rank and status, whether they've completed their required questionnaires, registered as a driver, and whether they're in South Africa." (page.tsx:42-49).
- Layout container: `<main className="mx-auto max-w-5xl px-6 py-10">` (page.tsx:36). NOTE: this surface uses `max-w-5xl` (a wide table), not the global `max-w-lg`.
- `<CampManagementRoster rows={rows} locked={!isCaptain} />` (page.tsx:51).

### Roster table (`camp-management-roster.tsx` → `CampManagementRoster`)
- Counts/filter/search strip, hidden entirely when `locked` (lines 113-157).
- Two-button filter toggle group: "All ({rows.length})" and "Awaiting approval" + count badge when `awaitingCount > 0` (lines 116-145). Active filter styled `bg-muted text-foreground`, inactive `text-muted-foreground hover:text-foreground`.
- Search `<Input>` with leading `Search` icon, placeholder "Search name, team, country…", `aria-label="Search the roster"` (lines 146-155).
- 7-column table (lines 166-275): **Member** (display name + comma-joined humanized team list under it), **Rank** (pill), **Status** (pill), **Questionnaires** (`ShieldCheck` icon header, centered yes/no), **Driver** (`Car` icon header, centered yes/no), **In SA** (`Flag` icon header, centered yes/no), **Country** (`MapPin` icon header, country name or "—").
- Rank pill colour by `r.rank === "captain"` → `bg-primary/15 text-primary`; else `r.isLead` → `bg-sky-500/15 text-sky-400`; else → `bg-muted text-muted-foreground` (lines 226-237). Disambiguation by label text (`r.rankLabel`).
- Status pill colour from `STATUS_STYLE[r.status]` (lines 43-49). `title` tooltip on the pill = `"${pendingRequiredActions} outstanding action(s)"` when `pendingRequiredActions > 0`, with singular/plural ("action"/"actions") (lines 245-251).
- Rows are clickable: `onClick={() => setSelectedId(r.id)}`, `cursor-pointer hover:bg-muted/30` (lines 212-216).
- Empty-state messages (lines 197-209): filter `awaiting` → "Nobody is awaiting approval."; else `rows.length === 0` → "No members have signed up yet."; else "No members match your search." (rendered in a `colSpan={7}` cell).
- `YesNo` cell helper (lines 58-71): `value` true → emerald `Check` icon + sr-only "{label}: yes"; false → muted `Minus` (dash) icon + sr-only "{label}: no". sr-only labels: "Required questionnaires complete", "Registered as a driver", "In South Africa".
- `teamLabel(team)` (lines 51-56): splits on `_`, title-cases each word, joins with space (e.g. `power_and_lighting` → "Power And Lighting").

### Locked (non-captain) state (`camp-management-roster.tsx`)
- Filter/search strip is not rendered (`!locked` guard, line 113).
- Table wrapper gets `pointer-events-none select-none opacity-40 blur-[2px]` and `aria-hidden={locked}` (lines 159-165).
- Table body renders `<PlaceholderRows>` — 6 fake rows × 7 cells, each a `h-3 w-16 rounded bg-muted` block ("data here, but hidden") (lines 195, 527-541).
- An absolutely-positioned overlay card (lines 278-289): `Lock` icon, heading "Captain access only", body "Camp management data is visible to captains. Your rank doesn't have clearance for this view."
- The `MemberModal` is NOT mounted when locked (`!locked` guard, line 291) — rows aren't clickable anyway (no real ids).

### Per-member detail modal (`camp-management-roster.tsx` → `MemberModal`)
- Opens when a row is selected (`open = row != null`, line 321). Uses `Dialog`/`DialogContent` (`max-h-[85vh]`, `sm:max-w-lg`).
- Detail fetch (lines 326-343): on each new `rowId`, resets tab to "overview", clears `actionError`, sets `{ state: "loading" }`, calls `getMemberDetailAction(rowId)`; stale responses are discarded via a `cancelled` flag (race-safe when the captain clicks another burner before the first resolves).
- Header: `DialogTitle` = `row?.displayName ?? "Member"`; `DialogDescription` = `member.approvalSummary` while loaded, else "Loading…" (lines 379-384).
- Two tabs, "overview" and "profile" (rendered `capitalize`), active tab gets `border-b-2 border-primary` (lines 387-403).
- Loading body: spinning `Loader2`. Error body: `member.message` styled `text-destructive` (lines 406-415).
- Overview tab (lines 416-427): optional `profileImageUrl` `<img>` (80×80 rounded avatar, `alt=""`) + `<DetailList items={member.overview}>`.
- Profile tab (lines 428-445): if `profileSections.length === 0` → "No questionnaire answers on record yet."; else each section renders an uppercase title heading + `<DetailList items={section.items}>`.
- `DetailList` (lines 504-524): empty → "Nothing recorded."; else a `<dl>` of label (`dt`, muted) / value (`dd`, font-medium) pairs.
- Actions footer (lines 448-498): an "ACTIONS" caption + buttons. Approve/Reject shown ONLY while `isAwaiting` (`member?.approvalStatus === "pending"`). "Ping" button is permanently `disabled` with `title="Coming soon — nudge this member to check the app"` and a `ThumbsUp` icon — future feature (lines 488-496, 449-450 comment).
- `actionError` (if set) shown as `role="alert"` `text-destructive` above the buttons (lines 452-456).

### `getMemberDetailAction(userId)` (`actions.ts`)
- Captain-gated by `requireCaptain()` (returns the gate error if not ok) (lines 49-50).
- `getCampMemberDetail(userId)`; null → `{ ok: false, error: "Member not found." }` (lines 52-53).
- Behind the gate, decrypts the government ID number: `passport = decryptOrNull(detail.passportEncrypted)`, `saId = decryptOrNull(detail.saIdEncrypted)`; chooses `idType` "passport" if passport present, else "sa_id" if saId present, else null (lines 58-64). Merges it back into `responses` via `mergeIdNumber` so the modal can show it (line 65). Comment: "Captains and the owner are the only readers of this field."
- Returns `{ ok: true, member: presentMemberDetail({ ...detail, responses }) }` (line 67).

### `decideApprovalAction(userId, decision)` (`actions.ts`)
- Captain-gated by `requireCaptain()` (lines 79-80).
- Validates `decision` is `"approved"` or `"rejected"` → else `{ ok: false, error: "Unknown decision." }` (lines 82-84).
- Self-decision guard: `if (userId === gate.captainId) return { ok: false, error: "You can't decide on your own account." }` (lines 85-87).
- Persists via `decideUserApproval({ userId, status: decision, decidedByUserId: gate.captainId })` (lines 89-93) → `setUserApproval` stamps `approvalStatus`, `approvalDecidedByUserId`, `approvalDecidedAt`, `updatedAt` (burner-profile.ts:69-84).
- `revalidatePath("/captains/camp-management")` then `{ ok: true }` (lines 94-95). Comment: "Approving unblocks the app on their next load; rejecting holds them at the blocking screen with a terminal message" (lines 70-73).
- Client `decide()` (roster.tsx:345-366) additionally calls `router.refresh()` and optimistically patches local `member.approvalStatus = decision` so the approve/reject buttons disappear immediately.

### `requireCaptain()` gate (`actions.ts:30-43`)
- `getAuthenticatedUser()`; null → `{ ok: false, error: "Not signed in." }`.
- `ensureCampUser(authUser)`; `!hasCampAccess(...)` → `{ ok: false, error: "Your account isn't camp-active yet." }`.
- `campUser.rank !== "captain"` → `{ ok: false, error: "Captain access only." }`.
- Else `{ ok: true, captainId: campUser.id }`.

### `getCampManagementRoster()` (`roster.ts:48-110`)
- Selects one row per `users` row, left-joining `burner_profiles` and `driver_profiles`. Derived columns computed in SQL:
  - `country` = `burner_profiles.responses->>'country'` (string|null).
  - `intendsToDrive` = `coalesce(driver_profiles.intends_to_drive, false)`.
  - `isLead` = `exists (select 1 from team_memberships tm where tm.user_id = users.id and tm.is_lead = true)`.
  - `teams` = `coalesce((select array_agg(tm.team order by tm.team) from team_memberships ...), '{}')`.
  - `pendingRequiredActions` = `(select count(*)::int from required_actions ra where ra.user_id = users.id and ra.status = 'pending' and ra.blocking = true)`.
- `onboardingComplete` = `burner_profiles.completedAt != null`; `driverProfileComplete` = `driver_profiles.completedAt != null`.
- `WHERE users.is_system = false AND users.sanitised = false` (excludes the AI/voice agent and POPIA-sanitised accounts) (lines 89-91).
- `ORDER BY users.display_name ASC` (line 92).

### `getCampMemberDetail(userId)` (`roster.ts:141-198`)
- Single row by `users.id = userId`, with three left joins: `decider` (aliased `users`, on `approval_decided_by_user_id`) for `approvalDecidedByName`; `burner_profiles` for `responses`/`completedAt`/`version`; `invite_codes` (on `users.invite_code = invite_codes.code`) for `inviteNote`; `inviter` (aliased `users`, on `invite_codes.created_by_user_id`) for `invitedByName` (lines 145-176).
- Returns `null` if no row (line 180). Reads raw `passportEncrypted`/`saIdEncrypted` ciphertext (not decrypted here). `responses` defaults to `{}` when null (line 190).

### View-model derivation (`camp-roster.ts`, `member-detail.ts`)
- `toRosterRow` (camp-roster.ts:60-94) — see Validation section for the status precedence rule.
- `rankLabel(rank, isLead)` (camp-roster.ts:97-101): captain → "Captain"; else isLead → "Team Lead"; else "Member".
- `country` resolved to a human name via `COUNTRY_NAME` map (ISO alpha-2 → label), falling back to the raw code, or `null` when unanswered (camp-roster.ts:89-92).
- `inSouthAfrica` = `member.country === "ZA"` (camp-roster.ts:92).
- `presentMemberDetail` (member-detail.ts:111-176) builds: `displayName` (trimmed, fallback "Unnamed burner"), `rankLabel` (captain → "Captain", else "Member" — NOTE: this modal-level label does NOT express Team Lead, unlike the roster row), `approvalSummary` (see `describeApproval`), `profileImageUrl` (from `responses["profile.image"]` if a string), `overview` list, and `profileSections`.
- `overview` items, in order (member-detail.ts:121-149): Country (if answered), Joined (`createdAt` formatted), Onboarding ("Complete"/"Incomplete"), Invite code (`inviteCode` or "— (founder / god account)"), Invited by (if `invitedByName`), Invite note (if `inviteNote`).
- `profileSections` (member-detail.ts:151-164): iterate `QUESTIONNAIRE.pages`, skip non-`"questions"` pages, render each answered question as `{ label: question.prompt, value }` via `renderAnswer`, drop pages with zero answered questions. Section title = page `title`.
- `renderAnswer` (member-detail.ts:46-85): null/empty → null (skipped); `image` → null (surfaced as avatar instead); `multi_select` → comma-joined option labels (null if empty array); `single_select`/`scale`/`toggle`/`combobox` → resolved option label (scale uses `steps`, others use `options`, fall back to raw value); `slider` → `String(raw)`; `date`/`short_text`/`long_text`/default → `String(raw)`.
- `describeApproval` (member-detail.ts:87-109): approved → "Approved by {name} on {date}" (or "Approved" if no decider); rejected → "Rejected by {name} on {date}" (or "Rejected"); pending/default → "Awaiting a captain's decision". Date via `Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" })`.

## User actions & interactions
- **Open the page** (captain): see live roster. (Non-captain): see blurred locked shell + "Captain access only" card; no interactions available.
- **Back to Captains**: ghost button → `/`.
- **Switch filter tab**: "All" ⇄ "Awaiting approval" (client-side `setFilter`).
- **Search**: type into the search box; filters rows by display name, rank label, country, or any humanized team name (case-insensitive, trimmed) (roster.tsx:91-103).
- **Click a row**: opens the member modal and fetches detail (`getMemberDetailAction`).
- **Switch modal tab**: Overview ⇄ Profile.
- **Approve a pending applicant**: green "Approve" button → `decideApprovalAction(id, "approved")`; optimistic local update + `router.refresh()`.
- **Reject a pending applicant**: destructive "Reject" button → `decideApprovalAction(id, "rejected")`.
- **Ping** (disabled placeholder, "Coming soon"): no action.
- **Close modal**: `onOpenChange(false)` (overlay/Esc/X) → clears `selectedId`.

## States & presentations
Global-states rows that apply to THIS surface:
- **Empty**: `rows.length === 0` → "No members have signed up yet."; filtered-to-zero → "No members match your search." / "Nobody is awaiting approval."; modal profile with no answers → "No questionnaire answers on record yet." / `DetailList` empty → "Nothing recorded."
- **Loading**: modal detail fetch → `{ state: "loading" }`, spinning `Loader2`; header description shows "Loading…".
- **Populated**: roster rows rendered; modal `{ state: "loaded" }` with overview + profile sections.
- **Validation-error / action-error**: modal footer `actionError` (`role="alert"`, destructive) from a failed `decideApprovalAction` ("Unknown decision." / "You can't decide on your own account." / "Captain access only." / "Your account isn't camp-active yet." / "Not signed in."). Detail-fetch failure → `{ state: "error" }` body ("Member not found." or any gate error).
- **Submitting/pending**: `isPending` (`useTransition`) disables both Approve/Reject; Approve swaps its icon for a spinning `Loader2`.
- **Success**: decision succeeds → approve/reject buttons disappear (approvalStatus no longer "pending"); table refreshed via `revalidatePath` + `router.refresh()`.
- **Disabled**: "Ping" button always disabled.
- **Invite-gated**: handled upstream — `!hasCampAccess` → redirect `/signup/required` (page) / "Your account isn't camp-active yet." (actions).
- **Pending-approval / Rejected**: these are the SUBJECTS this surface acts on (the awaiting-approval filter + approve/reject). The *viewing* captain, if not approved, is bounced to `/pending-approval` by the page gate; rejected viewers never reach it.
- **Captain-only-locked**: non-captain viewer → blurred, data-free, `aria-hidden` table with placeholder rows + overlay "Captain access only" card; all controls and the modal suppressed. Server sends `rows=[]`.
- NOT applicable: onboarding-incomplete (no nextGate logic here — the gate spine runs before this page; this page only redirects on invite/approval), offline/sync, budget/over-target.

## Enums, options & configurable values
- **`RosterStatus`** (camp-roster.ts:8-13): `"ready" | "onboarding" | "awaiting_approval" | "rejected" | "pending"`.
- **`STATUS_LABEL`** (camp-roster.ts:43-49): ready→"Ready", onboarding→"Onboarding", awaiting_approval→"Awaiting approval", rejected→"Rejected", pending→"Action needed".
- **`STATUS_STYLE`** (roster.tsx:43-49): ready→`bg-emerald-500/15 text-emerald-400`, onboarding→`bg-amber-500/15 text-amber-400`, awaiting_approval→`bg-sky-500/15 text-sky-400`, rejected→`bg-rose-500/15 text-rose-400`, pending→`bg-rose-500/15 text-rose-400` (rejected and pending share the same rose style).
- **Rank labels** (camp-roster.ts:97-101): "Captain" / "Team Lead" / "Member".
- **`Filter`** type (roster.tsx:73): `"all" | "awaiting"`. Filter labels: "All ({count})", "Awaiting approval".
- **Modal tabs** (roster.tsx:317, 388): `"overview" | "profile"`.
- **`DetailState`** (roster.tsx:303-306): `{state:"loading"} | {state:"loaded";member} | {state:"error";message}`.
- **Stored ranks** (`rankEnum`, schema.ts:31): `["captain","member"]`.
- **`approvalStatusEnum`** (schema.ts:41-45): `["pending","approved","rejected"]`.
- **`teamEnum`** (schema.ts:51-60): `kitchen, structures, power_and_lighting, sanitation_and_water, health_and_safety, art_and_activities, ministry_of_memes, ministry_of_vibes` (8 values).
- **`membershipTierEnum`** (schema.ts:62-65): `["full","build_week_only"]`. (Read into `CampManagementMember.membershipTier` but NOT surfaced by either view-model — see dead-fields note.)
- **`decision` arg**: `"approved" | "rejected"` only.
- **ID types** (id-documents.ts:7-8, 43-49): keys `ID_NUMBER_KEY = "id.number"`, `ID_TYPE_KEY = "id.type"`; types `"passport"` → `passportEncrypted`, `"sa_id"` → `saIdEncrypted`, default → passport column.
- **Special country value**: `"ZA"` drives `inSouthAfrica`. Country values are ISO 3166-1 alpha-2 codes; labels from `COUNTRIES`.
- **Date format**: `Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" })`.
- **Placeholder grid**: 6 rows × 7 columns.
- **Crypto** (crypto.ts): AES-256-GCM, `KEY_SALT = "camp404-pgcrypto-v1"`, key from `PGCRYPTO_KEY` (≥16 chars), stored as base64(iv‖tag‖ciphertext), iv 12 bytes, tag 16 bytes.
- **`QUESTIONNAIRE.version`**: `"2026.05.29-v8"` (questionnaire.ts:60) — stamped on `required_actions` / `burner_profiles` elsewhere; section titles consumed here come from `QUESTIONNAIRE.pages[*].title` (e.g. "Add a profile photo", "About you", "A bit about you", "Your ideas for this year's burn", "Team interests", "Cooking competency", "Hardware competency", "Leadership & logistics", "Burn history", "Coming to burn this year?", "Dietary requirements").

## Data model touched
All reads/writes server-side (Neon Postgres via Drizzle). Tables & exact field names:

- **`users`** (schema.ts:220-303): `id`, `authUserId` (`auth_user_id`), `displayName` (`display_name`), `profileImageUrl` (`profile_image_url`), `rank` (`rankEnum`), `isSystem` (`is_system`), `membershipTier` (`membership_tier`), `duesPaid` (`dues_paid`), `passportEncrypted` (`passport_encrypted`), `saIdEncrypted` (`sa_id_encrypted`), `inviteCode` (`invite_code`), `approvalStatus` (`approval_status`), `approvalDecidedByUserId` (`approval_decided_by_user_id`, FK→users.id, onDelete set null), `approvalDecidedAt` (`approval_decided_at`), `sanitised`, `createdAt` (`created_at`), `updatedAt` (`updated_at`).
  - WRITE: `decideApprovalAction` → `setUserApproval` sets `approvalStatus`, `approvalDecidedByUserId`, `approvalDecidedAt`, `updatedAt`.
- **`burner_profiles`** (schema.ts:352-364): `userId` (`user_id`, PK, FK→users.id cascade), `version`, `responses` (jsonb `Record<string,unknown>`), `startedAt`, `completedAt` (`completed_at` — drives `onboardingComplete`), `updatedAt`. `responses->>'country'` and `responses["profile.image"]` and per-question answers are read.
- **`driver_profiles`** (schema.ts:393-420): `userId` (`user_id`, PK), `intendsToDrive` (`intends_to_drive` — drives `isDriver`), `completedAt` (`completed_at` — drives `driverProfileComplete`). (Other driver columns exist but aren't read by this surface.)
- **`team_memberships`** (schema.ts:446-460): `userId` (`user_id`), `team` (`teamEnum`), `isLead` (`is_lead` — drives derived `isLead` and team list). Read via SQL subqueries.
- **`required_actions`**: `user_id`, `status` (= `'pending'`), `blocking` (= `true`) counted into `pendingRequiredActions`.
- **`invite_codes`** (joined): `code`, `note` (→ `inviteNote`), `created_by_user_id` (→ `invitedByName` via aliased users join).
- **`CampManagementMember`** interface (roster.ts:15-38): `id`, `displayName`, `rank`, `approvalStatus`, `isLead`, `teams: string[]`, `duesPaid`, `membershipTier`, `onboardingComplete`, `pendingRequiredActions`, `intendsToDrive`, `driverProfileComplete`, `country: string|null`, `createdAt`.
- **`CampMemberDetail`** interface (roster.ts:117-139): `id`, `displayName`, `rank`, `approvalStatus`, `approvalDecidedAt`, `approvalDecidedByName`, `onboardingComplete`, `onboardingVersion`, `responses`, `passportEncrypted`, `saIdEncrypted`, `inviteCode`, `inviteNote`, `invitedByName`, `createdAt`.
- **`RosterRow`** view-model (camp-roster.ts:15-39): `id`, `displayName`, `rankLabel`, `rank`, `isLead`, `teams`, `status`, `statusLabel`, `approvalStatus`, `awaitingApproval`, `onboardingComplete`, `pendingRequiredActions`, `requiredComplete`, `isDriver`, `driverProfileComplete`, `country: string|null`, `inSouthAfrica`.
- **`PresentedMember`** view-model (member-detail.ts:26-37): `id`, `displayName`, `rankLabel`, `approvalStatus`, `approvalSummary`, `profileImageUrl: string|null`, `overview: DetailItem[]`, `profileSections: DetailSection[]`. `DetailItem={label,value}`, `DetailSection={title,items}`.

## Validation, edge cases & business rules
- **Status precedence** (camp-roster.ts:60-71): `!onboardingComplete` → `onboarding`; else `approvalStatus==="pending"` → `awaiting_approval`; else `approvalStatus==="rejected"` → `rejected`; else `requiredComplete` (i.e. `pendingRequiredActions === 0`) → `ready`; else → `pending` ("Action needed"). Approval sits above generic required-actions because it blocks the member from the app entirely (comment lines 51-58).
- **`awaitingApproval` / "Awaiting approval" filter** = `approvalStatus === "pending"` (camp-roster.ts:62, 28-29).
- **`requiredComplete`** = `pendingRequiredActions === 0` (camp-roster.ts:61).
- **Display name fallback**: trimmed name or `"Unnamed burner"` (camp-roster.ts:75, member-detail.ts:168).
- **Captain gate is enforced server-side, not by redirect**: non-captains load the page but get `rows=[]`; every action calls `requireCaptain()`. The page comment is explicit (page.tsx:14-17, 30; roster.tsx:36-41).
- **Self-decision blocked**: a captain cannot approve/reject their own account (`userId === gate.captainId`) (actions.ts:85-87).
- **Decision whitelist**: only `"approved"`/`"rejected"` accepted (actions.ts:82-84).
- **Decision audit**: stamps `approvalDecidedByUserId` + `approvalDecidedAt` (burner-profile.ts:69-84). `approvalDecidedByName` shown in the modal summary.
- **Approve unblocks / Reject is terminal**: approving lets the member into the app on next load; rejecting holds them at the blocking screen (actions.ts:70-73; schema.ts:33-45 — `rejected` is a terminal denied state).
- **Stale-fetch protection**: rapid row switches discard the earlier in-flight detail response (roster.tsx:326-343).
- **System & sanitised actors excluded** from the roster query (`is_system=false AND sanitised=false`) — the AI/voice agent and POPIA-scrubbed accounts never appear (roster.ts:89-91).
- **Government ID PII**: `id.number` is split out of `responses` into encrypted `passport_encrypted`/`sa_id_encrypted` columns; decrypted ONLY behind the captain gate in `getMemberDetailAction` and merged back via `mergeIdNumber` (which keeps `id.type` in responses, only injects `id.number` if present). `decryptOrNull` swallows decrypt errors → returns null (crypto.ts:72-79). `id.number` is rendered as a `short_text` answer row in the Profile tab via its questionnaire question prompt.
- **`profile.image` answer is NOT a profile row** — it becomes the avatar; `renderAnswer` returns null for `image` kind (member-detail.ts:65-66).
- **Country resolution**: code→label via `COUNTRY_NAME`, falling back to the raw stored value; null when unanswered (both view-models).
- **Empty profile sections dropped**: pages with zero answered questions are skipped (member-detail.ts:161-163); intro pages (`kind !== "questions"`) always skipped (member-detail.ts:155).
- **`scale` vs other selects**: `scale` resolves labels from `question.steps`, every other labelled kind from `question.options` (member-detail.ts:51-62).
- **`revalidatePath` + `router.refresh()`**: after a decision the server data behind the table is re-fetched so the row's status pill updates; the modal optimistically flips locally first.

## Sub-components / variants
- `CampManagementRoster` — main client table + controls.
- `YesNo` — tick/dash cell (roster.tsx:58-71).
- `MemberModal` — per-member dialog with Overview/Profile tabs + actions footer (roster.tsx:308-502).
- `DetailList` — label/value `<dl>` renderer (roster.tsx:504-524).
- `PlaceholderRows` — 6×7 skeleton grid for the locked state (roster.tsx:527-541).
- Server units: `requireCaptain` (gate), `getMemberDetailAction`, `decideApprovalAction` (actions.ts); `getCampManagementRoster`, `getCampMemberDetail`, `isTeamLead` (roster.ts); `toRosterRow`, `rankLabel` (camp-roster.ts); `presentMemberDetail`, `renderAnswer`, `describeApproval` (member-detail.ts).
- **DEAD / orphaned / placeholder**:
  - **"Ping" button** — permanently `disabled`, "Coming soon" tooltip; no handler (roster.tsx:488-496). Future feature.
  - **`isTeamLead(userId)`** (roster.ts:204-217) — exported from this file but NOT used by the camp-management surface (it powers the control panel's team-lead layer elsewhere). Documented here only because it lives in `roster.ts`.
  - **`CampManagementMember.duesPaid` and `.membershipTier`** — fetched by `getCampManagementRoster` (roster.ts:58-59, 98-99) but NEVER read by `toRosterRow` or rendered. Likewise `CampMemberDetail.onboardingVersion` is fetched but unused by `presentMemberDetail`. Dead-but-fetched fields ("explicitly growing surface" — roster.ts:10-13).
  - **`RosterRow.driverProfileComplete`** — derived in `toRosterRow` (camp-roster.ts:88) but not rendered by the table (the Driver column uses `isDriver`/`intendsToDrive`, not completion).
  - **Modal `rankLabel`** (member-detail.ts:169) only distinguishes Captain vs Member — it does NOT surface "Team Lead", unlike the roster row's `rankLabel`. Intentional asymmetry / minor inconsistency.

---

# 15 — Captain announcements / broadcast composer

**Files covered:**
- `apps/web/app/captains/announcements/page.tsx` — server route; gates to captain, loads all announcements, renders the manager shell + intro copy.
- `apps/web/app/captains/announcements/announcements-manager.tsx` — `"use client"` composer + drafts list + published list; all local form state and the four mutation calls.
- `apps/web/app/captains/announcements/actions.ts` — `"use server"` server actions (`saveDraftAction`, `updateDraftAction`, `deleteDraftAction`, `publishAction`) + the `requireCaptain` gate + Zod validation.
- `apps/web/lib/notifications.ts` — `server-only` facade routing every read/write through the real Neon backend or the in-memory `testStore` under `E2E_TEST_MODE`.
- `packages/db/src/broadcasts.ts` — Neon/Drizzle data layer: list, create/update/delete draft, `publishAnnouncement` (transactional fan-out), `resolveAudience`, plus dispatch/recipient queries.
- `packages/db/src/audience.ts` — pure `computeAudience(scope → recipient ids)` resolver shared by inline publish and the cron dispatcher.
- `packages/types/src/announcement.ts` — Zod `AnnouncementPresentation` enum + `ComposeAnnouncementInput` schema (the validation contract).
- `packages/db/src/schema.ts` (broadcast region) — `broadcasts`, `broadcast_targets`, `notification_deliveries` tables + the `broadcast_*` pgEnums.
- `apps/web/lib/test-store.ts` (announcements region) — E2E in-memory mirror of the draft/publish/list operations.

**Purpose:** A captain-only surface to author camp-wide announcements. A captain composes a draft (title, body, presentation variant), saves it (draft = unpublished `broadcasts` row with `kind='announcement'`, `scope='everyone'`), then edits / deletes / publishes it. Publishing fans the message out to every real camp member except the author as one `notification_deliveries` row each, copying title/body/channel/presentation so the recipient inbox and acknowledge gate are self-contained. The same screen lists drafts (editable) and published announcements with delivery roll-ups (recipient count, acknowledged count for the `acknowledge` variant, timestamp, "by you" marker). The actual delivery/push engine is unit 27; this unit stops at the inline fan-out into `notification_deliveries`.

## Features

### Route gate & shell (page.tsx)
- Server component, `export const dynamic = "force-dynamic"` (`page.tsx:9`); `metadata.title = "Announcements — Camp 404"` (`page.tsx:11`).
- Gating spine, in order (`page.tsx:20-30`): `getAuthenticatedUserOrRedirect()` → `ensureCampUser(authUser)` → `!hasCampAccess(...)` redirect `/signup/required` → `!isApproved(...)` redirect `/pending-approval` → `campUser.rank !== "captain"` redirect `/` (home). Explicitly NO locked view here — a non-captain is bounced home, unlike the camp-management roster (`page.tsx:13-17` comment).
- Loads `listAnnouncements()` (all announcements, drafts + published, newest first) and passes `announcements` + `currentUserId = campUser.id` to `<AnnouncementsManager>` (`page.tsx:32, 52-55`).
- Back link: ghost `Button` → `/captains/tools`, labelled "Camp tools" with `ChevronLeft` icon (`page.tsx:36-40`).
- Header: H1 "Announcements & notifications"; muted lead paragraph: "Compose a message, save it as a draft, then publish it to the whole camp. Everyone but you receives it. A full-screen announcement takes over each member's screen until they acknowledge it." (`page.tsx:42-49`).
- Layout: `<main className="mx-auto max-w-3xl px-6 py-10">` (NOTE: `max-w-3xl`, wider than the global `max-w-lg` convention — captured as an ugly truth) (`page.tsx:35`).

### Composer (announcements-manager.tsx)
- Single section card titled "New announcement" when composing, "Edit draft" when `form.editingId` is set (`announcements-manager.tsx:166-183`).
- "Cancel edit" ghost button (with `X` icon) appears only while editing; calls `reset()` (clears form to `EMPTY_FORM` + clears error) (`:171-182, 94-97`).
- Three fields: **Title** (`Input`, `maxLength={120}`, placeholder "Burn-night briefing"); **Message** (`Textarea`, `maxLength={5000}`, `rows={6}`, placeholder "What does everyone need to know?"); **How it lands** (`Select` over the 3 presentation variants) (`:186-244`).
- Presentation `Select` renders each option as icon + label from `PRESENTATION_META`; a muted hint line below shows `PRESENTATION_META[form.presentation].hint` (`:213-244`).
- Inline error (`role="alert"`, destructive colour) and success notice (`text-emerald-400`) banners; notice hidden when an error is present (`:246-255`).
- Single primary submit button: "Save draft" (new) or "Update draft" (editing); spins a `Loader2` while `pending`, else `Pencil` icon (`:257-271`).

### Drafts list (announcements-manager.tsx)
- Section header "Drafts" + `(count)` only when `drafts.length > 0` (`:277-279`).
- Empty state: "No drafts." (`:280-281`).
- Each draft card: `AnnouncementHeader` (title + presentation pill), full body (`whitespace-pre-wrap`), and three action buttons: **Edit** (ghost, `Pencil`), **Delete** (ghost, destructive text, `Trash2`), **Publish to camp** (primary, `Send`) (`:283-323`).
- Drafts = `announcements.filter(a => a.publishedAt === null)` (`:91`).

### Published list (announcements-manager.tsx)
- Section header "Published" + `(count)` only when `published.length > 0` (`:329-331`).
- Empty state: "Nothing published yet." (`:332-335`).
- Each published card: `AnnouncementHeader`, full body, then a meta footer row (`:339-359`):
  - "Sent to {recipientCount} member(s)" (singular/plural).
  - " · by you" appended when `a.senderId === currentUserId`.
  - For `acknowledge` presentation only: `CheckCircle2` icon + "{acknowledgedCount}/{recipientCount} acknowledged".
  - `new Date(a.publishedAt).toLocaleString()` timestamp.
- Published = `announcements.filter(a => a.publishedAt !== null)` (`:92`); published rows are read-only here (no edit/delete/republish controls).

### AnnouncementHeader sub-component (announcements-manager.tsx)
- Title (`h3`) + a rounded-pill badge with the presentation icon and a short word: `"Acknowledge"` / `"Pop-up"` / `"Inbox"` (`:369-393`). `title` attribute = the presentation's `hint`. NOTE: pill text uses different short words ("Pop-up", "Inbox") than the composer `label` strings.

### Server actions (actions.ts)
- `requireCaptain()` — re-runs the page's gate chain at the data layer (defence in depth): not signed in → "Not signed in."; no camp access → "Your account isn't camp-active yet."; not approved → "Your account is still awaiting approval."; `rank !== "captain"` → "Captain access only."; else returns `{ ok:true, captainId }` (`actions.ts:23-40`).
- `saveDraftAction(input)` — gate → `ComposeAnnouncementInput.safeParse` → `createAnnouncementDraft({ senderId: captainId, ...parsed })` → `revalidatePath("/captains/announcements")` → returns `{ ok:true, data:{ id } }` (`:43-60`).
- `updateDraftAction(id, input)` — gate → parse → `updateAnnouncementDraft` returning bool; `false` → error "Draft not found or already published." → revalidate (`:63-85`).
- `deleteDraftAction(id)` — gate → `deleteAnnouncementDraft`; `false` → "Draft not found or already published." → revalidate (`:88-98`).
- `publishAction(id)` — gate → `publishAnnouncement({ id, senderId: captainId })`; passes through its `{ ok:false, error }`; on success revalidate, returns `{ ok:true, data:{ recipientCount } }` (`:104-114`).
- `ActionResult<T>` discriminated union: `{ ok:true }` (+ `data` when `T` is not `undefined`) | `{ ok:false; error:string }` (`:14-16`).

### Data layer (broadcasts.ts)
- `listAnnouncements()` — selects all `broadcasts` where `kind='announcement'`, left-joins `users` for `senderName` (`users.displayName`), computes `recipientCount` and `acknowledgedCount` via correlated `count(*)::int` subqueries over `notification_deliveries`, ordered `desc(createdAt)`; null counts coalesced to 0 (`:117-149`).
- `createAnnouncementDraft(input)` — inserts a `broadcasts` row with `kind='announcement'`, `scope='everyone'`, given title/body/presentation; returns `{ id }` (`:159-175`).
- `updateAnnouncementDraft(input)` — updates title/body/presentation only where `isOwnedAnnouncementDraft` matches; returns bool (`:181-199`).
- `deleteAnnouncementDraft(input)` — deletes where `isOwnedAnnouncementDraft`; returns bool (`:202-212`).
- `publishAnnouncement(input)` — pooled-DB transaction: claim+stamp draft, resolve audience, bulk-insert deliveries `ON CONFLICT DO NOTHING`; returns `PublishResult` (`:228-290`). Detailed below in §Validation.
- `resolveAudience(broadcast, senderId)` — fetches users/memberships/drivers/(targets for individual scope) and delegates to `computeAudience` (`:52-94`).
- Helper `isOwnedAnnouncementDraft(id, senderId)` — the AND predicate locking every draft mutation to: `id` + `senderId` + `kind='announcement'` + `scope='everyone'` + `publishedAt IS NULL` (`:36-44`).

### Pure audience resolver (audience.ts)
- `computeAudience(broadcast, data, senderId)` — builds `real` set = members where `!isSystem && !sanitised`; per-scope id list; returns de-duped ids filtered to `real.has(id) && id !== senderId` (`audience.ts:29-64`). For this unit the scope is always `everyone` → `ids = [...real]`.

## User actions & interactions

- **Type a title** (≤120 chars enforced client-side via `maxLength`).
- **Type a message body** (≤5000 chars enforced client-side via `maxLength`).
- **Pick a presentation** from the Select: `acknowledge` (default) / `popup` / `feed`.
- **Save draft** — primary button; disabled unless both `form.title.trim()` and `form.body.trim()` are non-empty AND not `pending` (`:261`). On success: notice "Draft saved.", form resets, `router.refresh()`.
- **Update draft** — same button while editing; on success notice "Draft updated.", reset, refresh.
- **Cancel edit** — discards edit, returns composer to new-announcement mode (`:171-182`).
- **Edit a draft** — `handleEdit` loads the draft's id/title/body/presentation into the composer; clears error & notice (`:121-130`).
- **Delete a draft** — `handleDelete`; if it was the one being edited, also `reset()`; notice "Draft deleted."; refresh (`:132-145`).
- **Publish to camp** — `handlePublish`; on success notice "Published to {n} member(s)." (singular when `n===1`); if it was being edited, reset; refresh (`:147-161`).
- All four mutations run inside `useTransition`'s `startTransition`; `pending` disables every input and button while in flight (`:89, 107, 135, 150`).
- On any action failure, the returned `error` string is shown in the composer error banner and the operation aborts (no refresh) (`:111-114, 137-139, 152-154`).

## States & presentations

Global-state rows that apply to this surface:

- **Empty** — Drafts: "No drafts."; Published: "Nothing published yet." (`:280-281, 332-335`). Composer always present.
- **Loading** — server-rendered page (`force-dynamic`); the manager has no skeleton; freshness comes from `router.refresh()` after each mutation.
- **Populated** — drafts and published lists render their cards; counts in section headers.
- **Validation-error** — empty title/body disables submit client-side; server-side Zod messages ("Give it a title.", "Write the announcement.") surface in the destructive error banner.
- **Submitting/pending** — `pending` true: all fields + buttons disabled; submit shows spinning `Loader2`.
- **Success** — emerald notice text per action (saved / updated / deleted / published-to-N); notice suppressed if an error is also set.
- **Disabled** — submit disabled when title or body is blank or `pending`; row buttons disabled when `pending`.
- **Invite-gated** — `!hasCampAccess` → redirect `/signup/required` (page) / "Your account isn't camp-active yet." (action).
- **Pending-approval** — `!isApproved` → redirect `/pending-approval` (page) / "Your account is still awaiting approval." (action).
- **Rejected** — terminal; `isApproved` is false for `approval_status='rejected'`, so the same pending-approval block applies (no separate rejected branch in this surface).
- **Captain-only-locked** — there is NO visible-but-locked view here: a non-captain is redirected to `/` (home) entirely (`page.tsx:28-30`); the action returns "Captain access only."

Presentation variants chosen at compose time (how the published delivery interrupts each recipient — recipient-side rendering is unit 27):
- **acknowledge** — full-screen takeover; recipient scrolls and presses Acknowledge to dismiss; the only variant that records `acknowledgedAt` and shows the "X/Y acknowledged" roll-up.
- **popup** — transient dismissable pop-up, no acknowledgement.
- **feed** — silent; lands in the inbox behind the header bell only.

## Enums, options & configurable values

- **`AnnouncementPresentation`** (Zod `z.enum`, `announcement.ts:8-12`; mirrors DB `broadcast_presentation` pgEnum, `schema.ts:166-170`): `"acknowledge"`, `"popup"`, `"feed"`. Type alias in `broadcasts.ts:29-30` derives from `broadcastPresentationEnum.enumValues`.
- **Composer presentation defaults** — `EMPTY_FORM.presentation = "acknowledge"` (`announcements-manager.tsx:75`); Zod `ComposeAnnouncementInput.presentation` `.default("acknowledge")` (`announcement.ts:26`).
- **DB column default** — `broadcasts.presentation` and `notification_deliveries.presentation` both DEFAULT `"feed"` at the schema level (`schema.ts:783-785, 846-848`) — NOTE the schema default (`feed`) differs from the compose default (`acknowledge`); composer/Zod always supplies a value so the DB default is never relied on for announcements. Rationale: the mismatch is intentional and safe because composer values always override the DB default. `"acknowledge"` is the composer's deliberate new-announcement UX choice (full-screen, must-dismiss — the primary use case); the DB `"feed"` is a conservative, least-interruptive fallback for out-of-band/legacy/migration inserts that bypass the composer and supply no presentation.
- **`PRESENTATION_META`** UI map (`announcements-manager.tsx:42-61`):
  - `acknowledge`: label "Full-screen — must acknowledge"; hint "Takes over each member's screen. They scroll and press Acknowledge to dismiss."; icon `Megaphone`.
  - `popup`: label "Pop-up — dismissable"; hint "A transient pop-up. No acknowledgement required."; icon `MessageSquare`.
  - `feed`: label "Quiet — inbox only"; hint "No interruption. Lands behind the header bell."; icon `Bell`.
- **Pill short-words** (`AnnouncementHeader`): `acknowledge`→"Acknowledge", `popup`→"Pop-up", else→"Inbox" (`:385-389`).
- **`broadcast_kind` pgEnum** (`schema.ts:128-134`): `announcement`, `team_message`, `lead_directive`, `reminder`, `system` — this unit hard-codes `kind='announcement'`.
- **`broadcast_scope` pgEnum** (`schema.ts:136-142`) / `BroadcastScope` type (`audience.ts:6-11`): `everyone`, `team`, `team_leads`, `drivers`, `individual` — this unit hard-codes `scope='everyone'`. Other scopes belong to the gating + push UIs (`announcement.ts:18-22` comment).
- **`notification_channel` pgEnum** (`schema.ts:144-148`): `push`, `in_app`, `both`; `broadcasts.channel` DEFAULT `"both"` (`schema.ts:778`). The composer never sets channel — drafts inherit DEFAULT `both`; publish copies it onto each delivery.
- **`push_delivery_status` pgEnum** (`schema.ts:150-155`): `queued`, `sent`, `failed`, `skipped`; `notification_deliveries.pushStatus` DEFAULT `"queued"` (unit 27 territory).
- **Field caps**: title `max(120)` / `maxLength={120}`; body `max(5000)` / `maxLength={5000}`; textarea `rows={6}`.
- **`refType`** stamped on publish-fanned deliveries = `"announcement"`; `refId` = the broadcast id (`broadcasts.ts:279-280`).

## Data model touched

(must agree with unit 29 — the schema.)

- **`broadcasts`** (`schema.ts:763-807`): `id` (uuid pk, `defaultRandom`), `senderId` (uuid → `users.id`, `onDelete:'set null'`), `kind` (`broadcast_kind`, notNull — `'announcement'` here), `scope` (`broadcast_scope`, notNull — `'everyone'` here), `team` (`team` enum, nullable — unused here), `title` (text notNull), `body` (text notNull), `channel` (`notification_channel` notNull default `'both'`), `presentation` (`broadcast_presentation` notNull default `'feed'`), `refType` (text nullable), `refId` (uuid nullable), `publishedAt` (timestamp, NULL=draft), `dispatchedAt` (timestamp, NULL until fanned out), `sendAt` (timestamp, NULL/≤now = immediate), `createdAt` (timestamp notNull defaultNow). Indexes: `broadcasts_sender_idx`, `broadcasts_created_at_idx`.
- **`broadcast_targets`** (`schema.ts:810-823`): `broadcastId`+`userId` composite PK; for `scope='individual'` only — NOT touched by this unit (everyone-scope).
- **`notification_deliveries`** (`schema.ts:830-887`): `id` (uuid pk), `broadcastId` (uuid → `broadcasts.id`, `onDelete:'cascade'`, nullable for system rows), `userId` (uuid → `users.id`, notNull, `onDelete:'cascade'`), `title` (text notNull), `body` (text notNull), `channel` (notNull), `presentation` (notNull default `'feed'`), `pushStatus` (default `'queued'`), `refType`/`refId`, `readAt`, `acknowledgedAt`, `deliveredAt`, `createdAt`. Publish writes one row per recipient copying `title/body/channel/presentation` + `refType='announcement'`/`refId=broadcastId`. Indexes: `..._user_read_idx`, `..._user_ack_idx`, `..._broadcast_idx`, and partial UNIQUE `notification_deliveries_broadcast_user_uniq` on `(broadcastId, userId) WHERE broadcastId IS NOT NULL` (powers `ON CONFLICT DO NOTHING` dedupe).
- **`users`** (read-only here): `id`, `isSystem`, `sanitised` (audience exclusion), `displayName` (sender name). `rank` read for the gate.
- **`team_memberships`** / **`driver_profiles`** read only for non-everyone scopes (not exercised by this unit).
- **`AnnouncementSummary` interface** (`broadcasts.ts:96-110`): `id`, `title`, `body`, `presentation`, `senderId` (nullable), `senderName` (nullable), `publishedAt` (Date|null), `createdAt` (Date), `recipientCount` (number, 0 for drafts), `acknowledgedCount` (number).
- **`DraftInput`** (`broadcasts.ts:151-156`): `senderId`, `title`, `body`, `presentation`.
- **`PublishResult`** (`broadcasts.ts:214-216`): `{ ok:true; recipientCount } | { ok:false; error }`.

## Validation, edge cases & business rules

- **Zod `ComposeAnnouncementInput`** (`announcement.ts:23-27`): `title` `z.string().trim().min(1, "Give it a title.").max(120)`; `body` `z.string().trim().min(1, "Write the announcement.").max(5000)`; `presentation` `AnnouncementPresentation.default("acknowledge")`. Server actions surface `parsed.error.issues[0]?.message ?? "Invalid."` (`actions.ts:50, 71`).
- **Client submit guard** — disabled unless both trimmed title & body are non-empty (`announcements-manager.tsx:261`), so the Zod min(1) is a server-side backstop.
- **Author-private drafts** — every draft mutation is locked by `isOwnedAnnouncementDraft` (id + senderId + kind='announcement' + scope='everyone' + publishedAt IS NULL). A draft owned by another captain, of another kind, or already published is invisible to update/delete/publish → returns `false`/error (`broadcasts.ts:36-44, 181-212`). Captains do NOT see each other's draft edit controls beyond what the predicate enforces server-side; the list shows all announcements but edit/delete/publish only succeed on rows the caller owns.
- **Defence-in-depth gate** — `requireCaptain` re-checks auth/access/approval/rank in every action even though the page already gated; the data layer "trusts the senderId it is handed" (`broadcasts.ts:26-27`), so the action gate is the real authority.
- **Publish transaction** (`broadcasts.ts:228-290`):
  1. Claim: `UPDATE broadcasts SET publishedAt=now, dispatchedAt=now WHERE isOwnedAnnouncementDraft(...)` RETURNING id/title/body/channel/presentation. No row → `{ ok:false, error:"Draft not found, already published, or not yours." }`.
  2. `resolveAudience({ id, scope:'everyone', team:null }, senderId)` → recipient ids.
  3. Zero recipients → `{ ok:true, recipientCount:0 }` (publish still succeeds, fans out to nobody).
  4. Bulk INSERT one delivery per recipient `.onConflictDoNothing()` → `{ ok:true, recipientCount: ids.length }`.
- **Idempotent / double-submit safe** — the claim only flips an unpublished owned row, so a second publish of the same draft finds nothing to claim and is rejected; the `(broadcast_id, user_id)` unique index + `ON CONFLICT DO NOTHING` guarantees no double fan-out even on retry (`broadcasts.ts:218-227, 258-283`).
- **Sender excluded** — `computeAudience` filters `id !== senderId`: the author never receives their own announcement (`audience.ts:63`). UI copy: "Everyone but you receives it."
- **Non-real recipients excluded** — system actors (`isSystem`) and sanitised accounts (`sanitised`) are dropped from the audience (`audience.ts:34-35`).
- **`recipientCount` is the audience size at publish time**, returned to the UI notice; the list's `recipientCount` is a live `count(*)` of delivery rows — these agree because publish creates exactly that many rows (less any `ON CONFLICT` skips).
- **Acknowledged roll-up** is shown only for `presentation='acknowledge'` (`announcements-manager.tsx:350`); popup/feed deliveries never stamp `acknowledgedAt`, and the recipient-side `acknowledgeDelivery` refuses to stamp non-acknowledge deliveries (`broadcasts.ts:450-453`).
- **No edit after publish** — published rows have no edit/delete controls; the owned-draft predicate's `publishedAt IS NULL` clause also blocks server-side mutation. No "unpublish" / "recall" / "republish" action exists.
- **Recipient `senderName`** comes from `users.displayName` via left join; if the sender row was deleted (`senderId` → `set null`), `senderName` is null.

## Sub-components / variants

- **`AnnouncementsManager`** (default export) — the whole client surface; holds `FormState` (`editingId`, `title`, `body`, `presentation`), `error`, `notice`, `pending`.
- **`AnnouncementHeader`** — title + presentation pill; reused by both drafts and published cards.
- **`PRESENTATION_META`** — the icon/label/hint table (3 entries; no dead variants).
- **Server-only validators/handlers:** `requireCaptain` (gate), the four server actions, the data-layer writers, the `isOwnedAnnouncementDraft` predicate, `resolveAudience`/`computeAudience`.
- **E2E test backend** (`test-store.ts:356-471`) — mirrors create/update/delete/publish/list against in-memory arrays under `E2E_TEST_MODE`. NOTE divergences from real behaviour: (a) it carries NO `kind`/`scope` columns, so its draft predicate is only `(id + senderId + publishedAt===null)` — it does not enforce kind/scope ownership; (b) its publish audience is "all `usersByAuthId` values except sender" with NO `isSystem`/`sanitised` filtering; (c) no `ON CONFLICT` dedupe / transaction. The facade (`notifications.ts:117-119`) selects backend by `isE2ETestMode()`.
- **Dead/unused-here:** `broadcasts.ts` also exports `dispatchDueBroadcasts` (scheduled cron fan-out — unit 27), `getPendingAcknowledgements`, `acknowledgeDelivery`, `listInbox`, `countUnread`, `markRead` (recipient inbox/acknowledge gate — unit 27) and the `team`/`team_leads`/`drivers`/`individual` scope branches of `computeAudience` (other compose UIs) — none are exercised by this captain-composer surface, which only ever creates `scope='everyone'` announcements published inline.

---

# 16 — Captain tools hub

**Files covered:**
- `apps/web/app/captains/tools/page.tsx` — the captain-only "Camp tools" index page (server component). Lists captain-clearance tooling as link cards; currently a single entry (Announcements & notifications).
- `apps/web/lib/auth.ts` — `getAuthenticatedUserOrRedirect()` auth gate this page calls first.
- `apps/web/lib/users.ts` — `ensureCampUser()`, `hasCampAccess()`, `isApproved()` gate helpers; `CampUser` shape + `Rank`/`ApprovalStatus` types.
- `apps/web/lib/access-control.ts` — `isGodEmail()` used inside `hasCampAccess`/`isApproved` (god-account bypass).
- `packages/db/src/schema.ts` — `rankEnum` (schema.ts:31), `approvalStatusEnum` (schema.ts:41); the stored fields the gates read.
- `apps/web/app/page.tsx` — the captain control panel's "Camp Tools" quadrant tile (page.tsx:172-177) is the entry point that links here.
- `apps/web/app/captains/announcements/page.tsx` — the sole linked destination; back-links to `/captains/tools`. (Documented as the link target only; its own behaviour belongs to its own unit.)

**Purpose:** The captain tools hub is the captain-clearance index page rendered behind the "Camp Tools" quadrant tile on the captain control layer. It is an exhaustively-gated, read-only list of captain-only tooling presented as tappable cards. It mirrors the member tools hub (unit 10) but with a hard rank gate: any signed-in user who is not a `captain` is redirected to `/` (home) rather than shown a locked view, because — unlike the data-locked camp-management roster — there is nothing useful to show a non-captain here. At present the list holds exactly one tool: "Announcements & notifications" → `/captains/announcements`. New captain tools are added by appending entries to the in-file `TOOLS` array.

## Features

### Captain tools index page (`apps/web/app/captains/tools/page.tsx`)
- **Force-dynamic server component.** `export const dynamic = "force-dynamic"` (page.tsx:14) — never statically cached; gates re-evaluate on every request.
- **Page metadata.** `export const metadata = { title: "Camp tools — Camp 404" }` (page.tsx:16).
- **Four-stage gate chain (in order)** run before any render (page.tsx:41-53):
  1. `getAuthenticatedUserOrRedirect()` — auth gate; redirects to `/auth/sign-in` if unauthenticated (auth.ts:40-44).
  2. `ensureCampUser(authUser)` — resolves the camp-user row (or a synthetic non-persisted row) (users.ts:60-95).
  3. `hasCampAccess(campUser, authUser.primaryEmail)` false → `redirect("/signup/required")` (page.tsx:43-45) — invite gate.
  4. `isApproved(campUser, authUser.primaryEmail)` false → `redirect("/pending-approval")` (page.tsx:46-48) — captain-vetting gate.
  5. `campUser.rank !== "captain"` → `redirect("/")` (page.tsx:51-53) — captain-clearance gate (bounce home, NOT a locked view).
- **Tool list rendering.** Maps the in-file `TOOLS` array (page.tsx:30-38) into an unordered list of cards (page.tsx:69-93). Each card is a full-card `next/link` to `tool.href` wrapping a `Card` with: a 10×10 bordered icon square (`tool.icon`), `CardTitle` (`tool.title`, `text-base`), `CardDescription` (`tool.description`), and a trailing `ChevronRight` (page.tsx:72-90).
- **Back navigation.** A ghost `Button` (`size="sm"`) rendered `asChild` over `<a href="/">` labelled "Captains" with a leading `ChevronLeft` (page.tsx:57-61). Returns to home (the control panel).
- **Header.** `<h1>` "Camp tools"; subtitle "Captain-only tooling for running the camp." (page.tsx:62-67).
- **Layout container.** `<main className="mx-auto max-w-2xl px-6 py-10">` (page.tsx:56) — note `max-w-2xl`, wider than the global `max-w-lg` north-star; matches the member tools hub's `max-w-2xl`.

### Single current tool entry (`TOOLS` array, page.tsx:30-38)
Exactly one entry today:
- `href: "/captains/announcements"`
- `title: "Announcements & notifications"`
- `description: "Compose a camp-wide announcement, save it as a draft, then publish it to everyone. Choose how hard it lands — a full-screen note members must acknowledge, a pop-up, or a quiet inbox entry."`
- `icon: <Megaphone className="h-5 w-5" />` (lucide `Megaphone`).

### Entry point (`apps/web/app/page.tsx:172-177`)
- Reached from the captain control-panel quadrant tile `bottomRight` on the `rank: "captain"` layer: `label: "Camp Tools"`, `hint: "Announcements, ops…"`, `href: "/captains/tools"`, `icon: <Wrench className="h-5 w-5" />` (page.tsx:172-177). The Wrench icon is the shared tools entity icon; this page itself uses no Wrench in its own header.

## User actions & interactions
- **Tap a tool card** → navigate to that tool's `href`. Today the only card navigates to `/captains/announcements`. The entire card is a clickable `Link` (page.tsx:72-75).
- **Tap "Captains" back button** → navigate to `/` (home control panel) (page.tsx:57-61).
- **Keyboard focus** — the tool `Link` has `focus:outline-none focus-visible:ring-2 focus-visible:ring-ring` and rounded corners (`rounded-xl`) on the link wrapper (page.tsx:74). (Note: focus ring is on the `Link`; the member hub puts the ring on the `Card` instead — a cosmetic divergence, see Sub-components.)
- **Hover** — each `Card` has `transition-colors hover:bg-accent/30` (page.tsx:76).
- No forms, no inputs, no mutations occur on this page — it is purely a navigation index. All write/state actions live in the linked tool pages.

## States & presentations
Applicable global-states rows for this surface (no offline/sync rows, no budget rows):

- **Populated** — the only happy-path render: the gated captain sees the header + the `TOOLS` card list. With the current single-entry array there is exactly one card.
- **Empty** — structurally possible if `TOOLS` were emptied (the `<ul>` would render with no `<li>`); there is **no dedicated empty-state copy or placeholder**. Today `TOOLS` always has ≥1 entry, so the empty branch is effectively dead. `<!-- low-confidence: no empty-state component exists; an empty TOOLS array renders a bare <ul>. -->`
- **Loading** — none on-page; this is a server component that renders fully-resolved markup after its `await`ed gates. No skeletons/spinners.
- **Validation-error / Submitting / Success** — N/A on this surface (no forms or mutations). These states belong to the linked tool pages.
- **Disabled** — no disabled controls on this page.
- **Invite-gated** — `hasCampAccess` false → `redirect("/signup/required")` (page.tsx:43-45). Triggered when the user is not a god email AND has no `inviteCode` on their (possibly synthetic) row (users.ts:219-224).
- **Onboarding-incomplete** — **NOT enforced on this page.** Unlike the gating spine in `app/page.tsx`, this page does NOT call `getPendingRequiredActions`/`nextGate`; it only checks invite + approval + rank. A captain with pending blocking required actions would still see this page if they reach the URL directly. `<!-- low-confidence: onboarding gate is intentionally omitted here; only the home gating spine routes to /onboarding/questionnaire. -->`
- **Pending-approval** — `isApproved` false → `redirect("/pending-approval")` (page.tsx:46-48). True when not a god email AND `approvalStatus !== "approved"` (i.e. `pending` or `rejected`) (users.ts:231-236).
- **Rejected** — folded into the pending-approval redirect above: `approvalStatus === "rejected"` also fails `isApproved`, so a rejected user is sent to `/pending-approval` (the terminal denied state is surfaced there, not here).
- **Captain-only-locked** — **does NOT apply as a visible-but-locked layer here.** This page expresses captain-clearance as a hard bounce: `rank !== "captain"` → `redirect("/")` (page.tsx:49-53). There is no opacity-45/lock-icon treatment on this surface; the locked-layer treatment lives only on the home control-panel quadrant grid. Comment in source confirms: "Unlike the data-locked camp-management view, there is nothing useful to show a non-captain here, so bounce them home." (page.tsx:49-50).

## Enums, options & configurable values
- **`Rank`** (users.ts:32) = `"captain" | "member"`; stored via `rankEnum = pgEnum("rank", ["captain", "member"])` (schema.ts:31). This page gates on the literal `"captain"` (page.tsx:51). team-lead is DERIVED, never a stored rank.
- **`ApprovalStatus`** (users.ts:33) = `"pending" | "approved" | "rejected"`; stored via `approvalStatusEnum = pgEnum("approval_status", ["pending", "approved", "rejected"])` (schema.ts:41-45). `isApproved` compares against the literal `"approved"` (users.ts:235).
- **`TOOLS` array** (page.tsx:30-38) — the configurable list of tool cards. Each `ToolEntry` (page.tsx:23-28): `href: string`, `title: string`, `description: string`, `icon: React.ReactNode`. Adding a tool = appending an entry.
- **Redirect targets (literals):** `/auth/sign-in` (auth gate, auth.ts:42), `/signup/required` (invite gate, page.tsx:44), `/pending-approval` (approval gate, page.tsx:47), `/` (non-captain bounce, page.tsx:52).
- **Metadata title:** `"Camp tools — Camp 404"` (page.tsx:16).
- **Layout width:** `max-w-2xl` (page.tsx:56).
- No sliders, scales, ranges, or numeric thresholds on this surface.

## Data model touched
This page performs **reads only** (no writes). Fields read off `CampUser` (users.ts:39-47), which both the real Drizzle `users` row and the in-memory test store produce:
- `CampUser.rank` (`Rank`) — gated against `"captain"` (page.tsx:51). Maps to `users.rank` / `rankEnum` (schema.ts:31, schema.ts:231 `rank: rankEnum("rank").notNull().default("member")`).
- `CampUser.inviteCode` (`string | null`) — read by `hasCampAccess` (users.ts:220-223). Maps to `users.inviteCode`.
- `CampUser.approvalStatus` (`ApprovalStatus`) — read by `isApproved` (users.ts:231-235). Maps to `users.approvalStatus` / `approvalStatusEnum` (schema.ts:41, schema.ts:267 `approvalStatus: approvalStatusEnum("approval_status")`).
- `CampUser.authUserId` — used by `ensureCampUser` to look up the row (users.ts:65).
- `CampUser.id`, `CampUser.displayName`, `CampUser.profileImageUrl` — present on the shape but NOT used by this page.
- `AuthenticatedUser.primaryEmail` (`string | null`) — passed to `hasCampAccess`/`isApproved` for the god-email bypass via `isGodEmail` (access-control.ts:28-32, reads `process.env.GOD_EMAILS`).
- `AuthenticatedUser.id`, `AuthenticatedUser.displayName` — used by `ensureCampUser` to resolve/synthesize the row.

No table is mutated by this surface. (`ensureCampUser` MAY create a god-account row + seed a burner-profile required action on first sign-in (users.ts:70-80), but for any non-god user reaching this page that path is irrelevant — a captain already has a persisted row.)

## Validation, edge cases & business rules
- **Strict gate ordering matters.** Auth → invite (`hasCampAccess`) → approval (`isApproved`) → rank (`=== "captain"`). The first failing gate wins its redirect; later gates never run (page.tsx:41-53).
- **God-email bypass.** `isGodEmail(email)` (case-insensitive match against `GOD_EMAILS` CSV, access-control.ts:28-32) makes `hasCampAccess` AND `isApproved` both return `true` regardless of `inviteCode`/`approvalStatus` (users.ts:223, users.ts:235). **However, the rank gate still applies** — a god email whose row has `rank === "member"` would be bounced home from this page. (`ensureCampUser` creates god rows with `rank: "member"` (users.ts:75), so a god account is NOT automatically a captain; god rights are conceptually about access bypass, not the `captain` rank.) `<!-- low-confidence: god accounts get rank "member" on auto-create (users.ts:75), so a brand-new god email would be redirected to "/" here unless their rank was later set to captain. -->`
- **Synthetic non-persisted row.** A signed-in user with no row and no invite gets a synthetic `CampUser` with `id: ""`, `inviteCode: null`, `rank: "member"`, `approvalStatus: "approved"` (users.ts:86-94). On this page `hasCampAccess` reads `inviteCode: null` → false → bounce to `/signup/required` before the rank gate ever runs.
- **Onboarding gate intentionally absent here** — see States. Only invite + approval + rank are enforced; no `required_actions` check. A captain who hasn't completed onboarding could land here via direct URL.
- **No locked view for non-captains** — explicit product decision (page.tsx:49-50): bounce to `/` rather than render a captain-only-locked layer.
- **Test mode.** Under `E2E_TEST_MODE` the auth/user resolution routes through the in-memory test store/cookie (auth.ts:26-29, users.ts:64); gate semantics are identical. `isTeamLead` is always `false` in test mode (users.ts:448) but team-lead is irrelevant to this captain-clearance page.
- **Static-render guard.** `dynamic = "force-dynamic"` ensures the gates aren't cached across users (page.tsx:14).
- **`tool.href` typing.** `href` is typed `string`, but `next/link`'s typed-routes (`.next/types`) constrain it to known `AppRoutes`; the only current value `/captains/announcements` is a real built page (confirmed: `apps/web/app/captains/announcements/page.tsx` exists and back-links to `/captains/tools`).

## Sub-components / variants
- **Shared UI primitives (`@camp404/ui`):** `Card`, `CardDescription`, `CardHeader`, `CardTitle` (card component); `Button` (used `variant="ghost" size="sm" asChild` for the back link). Lucide icons: `ChevronLeft`, `ChevronRight`, `Megaphone` (page.tsx:3).
- **No bespoke sub-components** are defined on this page beyond the inline `ToolEntry` interface (page.tsx:23-28) and the `TOOLS` constant.
- **Mirror relationship / divergences vs the member tools hub (`apps/web/app/tools/page.tsx`, unit 10):**
  - Member hub has NO rank gate and NO non-captain bounce; it ends after the approval gate (tools/page.tsx:50-58). Captain hub adds the `rank !== "captain"` → `/` bounce (page.tsx:51-53).
  - Member hub has no back button; captain hub adds the "Captains" back-to-`/` button (page.tsx:57-61).
  - Focus-ring placement differs: captain hub puts `focus-visible:ring-2 focus-visible:ring-ring` (and `rounded-xl`) on the `Link`; member hub puts it on the `Card` (`focus-visible:ring-2`) and `focus:outline-none` on the `Link`. Functionally equivalent (both give a visible focus ring), styling differs.
  - Member hub `TOOLS`: Invite a member (`/tools/invite`, `Mail`), My forms (`/tools/forms`, `ClipboardList`), Family tree (`/family-tree`, `GitBranch`). Captain hub `TOOLS`: only Announcements & notifications.
  - Header copy: member "Tools" / "Uncategorised tooling for camp members…"; captain "Camp tools" / "Captain-only tooling for running the camp."
- **No dead/orphaned variants** within this file. The only latent dead branch is the empty-`TOOLS` render path (no card, no placeholder), which never triggers today.

---

# 17 — MCP connect / consent screen

**Files covered:**
- `apps/web/app/mcp/connect/page.tsx` — client-side **sign-in bridge** page (`/mcp/connect`); signs the user in via Google then forwards to the OAuth `authorize` API route.
- `apps/web/app/api/mcp/oauth/authorize/route.ts` — server route that **renders the actual consent HTML** (GET) and **processes approve/deny** (POST). This is the user-facing scope grant/deny surface.
- `apps/web/lib/mcp/consent.ts` — capability gate for surfacing ID-document fields (`canSeeIdDocuments`, `redactIdDocuments`) — defines the consent semantics behind the `aiDataConsent` flag.
- `apps/web/lib/mcp/scope.ts` — `McpScope` snapshot + pure `resolveMcpScope` + per-domain capability predicates; defines what the granted token can do per call.
- `apps/web/lib/mcp/oauth.ts` — OAuth primitives this surface invokes: scope allow-list (`DEFAULT_SCOPE`, `isAllowedScope`), redirect-URI allow-list, client lookup, auth-code issuance/lifetimes.
- `apps/web/lib/mcp/access.ts` — `mcpAccessError`: pure gate mirroring the app's invite/onboarding/approval gates, applied before a token may be granted.
- `apps/web/lib/mcp/origin.ts` — resolves the public origin used to build the `next` redirect / issuer.
- `apps/web/lib/auth-client.ts` — Neon/Better Auth client (`authClient.useSession`, `authClient.signIn.social`) used by the bridge page.
- `packages/db/src/mcp.ts` — `getMcpScopeRows` (scope read), `McpScopeRows`, `Team`; audit/token housekeeping helpers (catalogued in unit 29, referenced here only for the scope read).
- `packages/db/src/schema.ts` — MCP OAuth tables + enums + `users.aiDataConsent` field this surface reads/writes.
- Well-known metadata routes (`oauth-authorization-server`, `oauth-protected-resource`) — advertise the single `mcp:user` scope to discovery clients (read-only context for the consent surface).

**Purpose:** This unit is the human-facing leg of the MCP OAuth flow: the screen(s) where a Camp 404 member, while connecting an MCP client (typically Claude.ai/Claude desktop), (1) signs in if no session exists, and (2) **explicitly approves or denies** the client's request to access their camp data through the MCP connector. Two physical surfaces compose it: a styled client React page at `/mcp/connect` that exists only to establish a Better Auth session and bounce back to the authorize endpoint, and the server-rendered consent HTML emitted by `GET /api/mcp/oauth/authorize`, which names the requesting client, the signed-in identity, and the single coarse scope (`mcp:user`), and offers Deny / Approve buttons. Approval issues a short-lived PKCE auth code; denial redirects back with `error=access_denied`. The supporting `consent.ts` / `scope.ts` define the *meaning* of the granted access: the token's capabilities are resolved fresh on every tool call from live rank/team/driver/consent rows, and the per-subject `aiDataConsent` opt-in gates whether others' ID documents are visible. Before any token is granted, the same gating spine that protects the app (camp access → onboarding complete → captain approval) is re-checked.

## Features

### `/mcp/connect` sign-in bridge (page.tsx)
- Client component (`"use client"`), wrapped in `<Suspense fallback={<Shell>Loading…</Shell>}>` (page.tsx:19). Inner component reads `useSearchParams()`.
- Reads `next` from the query string and sanitizes it via `safeNext` (page.tsx:27, 93-98).
- Subscribes to session via `authClient.useSession()` (page.tsx:28).
- **Auto-forward effect** (page.tsx:31-36): once a session exists (`!isPending && session?.user`), performs `window.location.replace(next)` — a *hard* navigation (not `router.push`) because `next` points at an API route the App Router won't reach (page.tsx:33-34).
- **Google sign-in** (`onGoogle`, page.tsx:38-45): calls `authClient.signIn.social({ provider: "google", callbackURL: window.location.href })`. Per the documented Better Auth gotcha, sign-in returns the user to *this* page (not the explicit `callbackURL`), and the session effect then forwards to `next` (page.tsx:7-16). On error, sets `error` to `err.message ?? "Sign-in failed."`.
- Renders a copy block explaining the user will see what they're approving before the connection completes (page.tsx:57-61), the Google button (page.tsx:62-68), an inline error region, and a "New to Camp 404?" footnote linking to `/auth/sign-in` (page.tsx:74-80).

### `GET /api/mcp/oauth/authorize` — render consent screen (authorize/route.ts:64-112)
- Parses & validates query params via `AuthorizeQuery` zod schema (route.ts:21-29, 33-35). On failure: `errorPage(400, "invalid_request", <first issue message or fallback>)` (route.ts:67-73).
- Resolves the client and scope via `resolveClientOrError` (route.ts:37-58, 75-76). Errors (unknown client, bad redirect URI) become `errorPage`; an `invalid_scope` becomes a redirect-back error.
- If no authenticated session (`getAuthenticatedUser()` null): redirects to `/mcp/connect?next=<encoded /api/mcp/oauth/authorize?…>` (route.ts:78-84) — this is the hand-off to the bridge page above.
- If signed in but **no camp profile** (`findUserByAuthId` null): `errorPage(403, "no_camp_account", …)` instructing the user to enter their invite code in the app first (route.ts:86-93).
- Applies the app gating spine via `mcpAccessError` over `hasCampAccess` / `profileComplete` (`!!profile?.completedAt`) / `isApproved` (route.ts:98-104). Any denial → `errorPage(403, <error>, <description>)`.
- On success: renders `consentHtml` with `clientName`, `scope`, `displayName` (`campUser.displayName ?? authUser.primaryEmail ?? "You"`), and the original params (route.ts:106-111).

### `POST /api/mcp/oauth/authorize` — approve / deny (authorize/route.ts:118-187)
- Reads `multipart/form-data` (route.ts:119-122). On parse failure: `errorPage(400, "invalid_request", "Form body required.")`.
- Extracts `action` (`"approve"` | `"deny"`) and rebuilds the OAuth params from all other form fields (route.ts:124-130), re-validating them with `AuthorizeQuery`.
- **Deny path** (`action === "deny"`, route.ts:142-149): `htmlRedirect` back to `redirect_uri` with `error=access_denied` (+`state` if present). No auth code issued. *(Deny is processed BEFORE re-checking session/gates — a denial always succeeds.)*
- **Approve path** (route.ts:151-186): re-authenticates session (`errorPage(401, "unauthenticated", "Session expired. Try again.")` if gone), re-resolves camp user, re-runs `mcpAccessError`, then `issueAuthCode(...)` and `htmlRedirect` back to `redirect_uri` with `code` (+`state` if present).
- Redirects use `htmlRedirect` (meta-refresh + JS `window.location.replace`), NOT a 302, because CSP `form-action 'self'` silently drops cross-origin 302s from POST handlers (route.ts:259-277).

### ID-document consent gate (consent.ts)
- `canSeeIdDocuments(scope, subject)` (consent.ts:17-23): the rule deciding whether an MCP call may surface a subject's identification documents (passport, SA ID, EFT details, others' reimbursement bank details).
  - **Self always sees own data** regardless of consent: `if (scope.campUserId === subject.id) return true;` (consent.ts:21).
  - Otherwise both gates required: `return scope.isCaptain && subject.aiDataConsent;` (consent.ts:22).
- `redactIdDocuments(scope, row)` (consent.ts:33-45): a **TEST-ONLY helper** that strips `passportEncrypted`, `saIdEncrypted`, `eftDetailsEncrypted` from a row when `canSeeIdDocuments` is false; otherwise returns the row unchanged. **It provides no production defence-in-depth layer:** `redactIdDocuments` has ZERO production callers — only `consent.test.ts` exercises it. The live path (`people.ts`) does its own conditional include keyed on `canSeeIdDocuments` (people.ts:133) rather than calling this helper, so this redaction is not wired into the live tool surface. (Its own doc comment at consent.ts:30-31 calls it a "second line of defence," but that second layer is not actually invoked in production.)
- Everything else (phone, email, emergency contacts, dietary, vehicle details) bypasses this gate and is freely visible at the appropriate tier (consent.ts:11-16).

### Scope snapshot & capability predicates (scope.ts)
- `resolveMcpScope(rows)` (scope.ts:36-52): pure derivation of `McpScope` from `McpScopeRows`; iterates `teamMemberships` to build `memberTeams` (all) and `leadTeams` (those with `isLead`); sets `isCaptain = rank === "captain"`, `isDriver = rows.driverIntent`, `aiDataConsent`.
- `getMcpScope(campUserId)` (scope.ts:58-62): reads rows (`getMcpScopeRows`) and resolves; returns `null` if the user row doesn't exist.
- Resolved **fresh on every tool invocation** — no caps cached on the access token, so a rank change / new team membership takes effect on the next call rather than next reconnect (scope.ts:9-13).
- Predicates: `canReadTeamOps(scope, team)` (captain → all; else member of team) (scope.ts:70-74); `canWriteTeam(scope, team)` (captain or lead of team) (scope.ts:77-80); `canApproveCrossTeam(scope)` (captain or any lead) (scope.ts:83-85); `canAdmin(scope)` (captain only) (scope.ts:88-90). **Test-only / orphaned:** these four predicates (scope.ts:70-90) have NO production caller — only `scope.test.ts` exercises them. The only `scope.ts` exports actually wired into the live surface are `getMcpScope` (via tool-utils.ts:53) and `canSeeIdDocuments` (via people.ts:133, in `consent.ts`); the per-domain capability predicates are an unwired forward-looking surface, not yet load-bearing.

### Scope allow-list / OAuth primitives invoked (oauth.ts)
- `DEFAULT_SCOPE = "mcp:user"` (oauth.ts:13); `ALLOWED_SCOPES = new Set([DEFAULT_SCOPE])` (oauth.ts:14). "Single coarse scope for now. Per-tool scopes can carve this later" (oauth.ts:12).
- `isAllowedScope(scope)` (oauth.ts:16-21): splits on whitespace, drops empties, requires *every* token to be in `ALLOWED_SCOPES`.
- `issueAuthCode(input)` (oauth.ts:129-144): inserts an `mcp_auth_codes` row with TTL `AUTH_CODE_TTL_SEC` (5 min) and the negotiated scope.
- `findClient(clientId)` (oauth.ts:99-107): looks up the DCR-registered client row.
- `isAllowedRedirectUri` (oauth.ts:27-42) — not called by the authorize route's render path (which checks `client.redirectUris.includes(...)` instead) but is the registration-time allow-list backing the URIs that the consent screen later validates against.

## User actions & interactions

On the **bridge page** (`/mcp/connect`):
- Tap **"Sign in with Google"** → social sign-in; on success auto-forwards to `next`.
- Tap **"Sign in first"** link → navigates to `/auth/sign-in`.
- No-action path: if already signed in, the page immediately forwards (`window.location.replace(next)`) with a "Continuing to {next}…" message.

On the **consent screen** (`GET /api/mcp/oauth/authorize` HTML):
- Read who you're signed in as (`Signed in as <displayName>`) and the requesting client name + scope.
- Tap **Approve** (`<button name="action" value="approve">`) → POST → auth code issued → redirect to client with `code`.
- Tap **Deny** (`<button name="action" value="deny">`) → POST → redirect to client with `error=access_denied`.
- The form (`method="POST" action="/api/mcp/oauth/authorize"`) carries all OAuth params as hidden inputs (route.ts:208-213, 243-249) so the POST handler reconstructs the request.

No other interactive controls exist on this surface. There is **no per-scope checkbox, no granular toggle, and no `aiDataConsent` toggle on this `/api/mcp/oauth/authorize` consent screen** — scope is the single coarse `mcp:user`, all-or-nothing. The `aiDataConsent` opt-in is **not** controlled by any profile/settings UI; it is read and written by the MCP identity tools `get_my_ai_consent` (identity.ts:124) and `set_my_ai_consent` (identity.ts:152), which read/write `users.aiDataConsent` (schema.ts:298) and `users.aiDataConsentAt` (schema.ts:299) for the calling user.

## States & presentations

Applicable global-states rows for this surface:

- **Loading** — bridge page: `<Suspense>` fallback "Loading…" (page.tsx:19); `isPending` session check → Shell "Checking session…" (page.tsx:47-49).
- **Populated (consent prompt)** — the rendered consent HTML naming client + identity + scope with Approve/Deny (route.ts:215-252).
- **Submitting/pending** — implicit during POST; the redirect intermediary HTML shows "Redirecting… Continue if not redirected." (route.ts:264-277).
- **Success (approve)** — redirect to `redirect_uri?code=<code>[&state=<state>]` (route.ts:181-186).
- **Success/terminal (deny)** — redirect to `redirect_uri?error=access_denied[&state=<state>]` (route.ts:142-149).
- **Validation-error** — `errorPage(400, "invalid_request", …)` for bad query/form params (route.ts:67-73, 131-137); `invalid_scope` redirect-back (route.ts:50-56).
- **Invite-gated** — `no_camp_access` denial (`errorPage 403`) when `hasCampAccess` is false: "Your account hasn't redeemed an invite code yet…" (access.ts:19-25). Also `no_camp_account` (403) when signed in but no camp profile exists (route.ts:86-93).
- **Onboarding-incomplete** — `onboarding_incomplete` denial (403): "Finish your burner profile in the app before connecting Claude." (access.ts:26-32). Gate: `!!profile?.completedAt`.
- **Pending-approval** — `pending_approval` denial (403): "A captain still needs to approve your account before you can connect Claude." (access.ts:33-39).
- **Rejected** — `isApproved` is false for `approval_status='rejected'` (it only returns true for `approved` or god email), so rejected users hit the same `pending_approval` denial branch (access.ts:33-39; users.ts:231-236). <!-- low-confidence: rejected users surface the "pending_approval" message specifically, not a distinct "rejected" message — the gate collapses both non-approved states into pending_approval -->
- **Unauthenticated bridge state** — bridge page renders the sign-in CTA (page.tsx:55-82). Server authorize GET with no session → redirect to the bridge.
- **Session-expired on approve** — `errorPage(401, "unauthenticated", "Session expired. Try again.")` (route.ts:152-153).
- **Disabled / Empty** — not applicable; this surface has no list/empty state and no disabled-control state beyond the gates above.

Note: god-email accounts bypass every gate (`hasCampAccess` and `isApproved` both short-circuit on `isGodEmail`), so they always reach the consent prompt (users.ts:219-236).

## Enums, options & configurable values

- **OAuth scope set (the entire scope vocabulary):** exactly one value `mcp:user` (`DEFAULT_SCOPE`, oauth.ts:13). Advertised as `scopes_supported: ["mcp:user"]` in both well-known metadata routes (oauth-authorization-server/route.ts:23; oauth-protected-resource/route.ts:19).
- **`AuthorizeQuery` params** (route.ts:21-29): `response_type` literal `"code"`; `client_id` (min 1); `redirect_uri` (URL); `code_challenge` (min 1); `code_challenge_method` enum `["S256"]` default `"S256"`; `scope` optional; `state` optional.
- **`action` form values:** `"approve"` | `"deny"` (route.ts:142, 246-247).
- **OAuth error codes emitted:** `invalid_request`, `unknown_client`, `invalid_redirect_uri`, `invalid_scope`, `no_camp_account`, `no_camp_access`, `onboarding_incomplete`, `pending_approval`, `unauthenticated`, `access_denied` (route.ts + access.ts).
- **Token / code lifetimes** (oauth.ts:8-10): `AUTH_CODE_TTL_SEC = 5*60` (5 min); `ACCESS_TOKEN_TTL_SEC = 24*60*60` (24 h); `REFRESH_TOKEN_TTL_SEC = 30*24*60*60` (30 days).
- **`rank` enum** (schema.ts:31): `["captain", "member"]`.
- **`approval_status` enum** (schema.ts:41-45): `["pending", "approved", "rejected"]`.
- **`team` enum (8 values)** (schema.ts:51-60): `kitchen`, `structures`, `power_and_lighting`, `sanitation_and_water`, `health_and_safety`, `art_and_activities`, `ministry_of_memes`, `ministry_of_vibes`.
- **`mcp_client_auth_method` enum** (schema.ts:1223-1227): `none`, `client_secret_basic`, `client_secret_post`.
- **`mcp_code_challenge_method` enum** (schema.ts:1229-1232): `S256`, `plain`. (Authorize route only accepts `S256`; `plain` exists in storage/PKCE-verify only.)
- **`mcp_audit_outcome` enum** (schema.ts:1234-1237): `success`, `error`.
- **Well-known discovery (read-only context):** `response_types_supported: ["code"]`; `grant_types_supported: ["authorization_code", "refresh_token"]`; `code_challenge_methods_supported: ["S256"]`; `token_endpoint_auth_methods_supported: ["none","client_secret_basic","client_secret_post"]`; `bearer_methods_supported: ["header"]` (oauth-authorization-server/route.ts:23-30; oauth-protected-resource/route.ts:19-22).
- **Redirect-URI allow-list** (oauth.ts:27-42): loopback (`localhost`, `127.0.0.1`, `[::1]`) over http/https, or `https:` to `claude.ai` / `*.claude.ai` / `anthropic.com` / `*.anthropic.com`.
- **`displayName` fallback chain** on the consent screen: `campUser.displayName ?? authUser.primaryEmail ?? "You"` (route.ts:109).
- **`safeNext` defaults**: returns `"/"` for empty, non-`/`-prefixed, or protocol-relative (`//`) values (page.tsx:93-98).

## Data model touched

(must agree with unit 29)

- **`users`** (schema.ts:220-303) — read for the consent gate and scope:
  - `id` (uuid PK), `authUserId` (`auth_user_id`, unique), `displayName` (`display_name`, nullable), `rank` (`rankEnum`, default `member`), `inviteCode` (`invite_code`, nullable — null = god account), `approvalStatus` (`approval_status`, default `approved`).
  - `aiDataConsent` (`ai_data_consent`, boolean, **default `false`**) — the per-subject opt-in read by `canSeeIdDocuments` / `redactIdDocuments` and carried on `McpScope.aiDataConsent` (schema.ts:298).
  - `aiDataConsentAt` (`ai_data_consent_at`, timestamp, nullable) — when consent was given (schema.ts:299). Not read by this surface's code, but is the consent's audit stamp.
  - Encrypted ID fields gated by consent: `passportEncrypted` (`passport_encrypted`), `saIdEncrypted` (`sa_id_encrypted`), `eftDetailsEncrypted` (`eft_details_encrypted`) (schema.ts:241-243).
- **`team_memberships`** — `team` (`teamEnum`), `isLead` (`is_lead`) read by `getMcpScopeRows` → `resolveMcpScope` (mcp.ts:47-53).
- **`driver_profiles`** — `intendsToDrive` (`intends_to_drive`) read for `McpScope.isDriver` (mcp.ts:55-59).
- **`burner_profiles`** — read via `getBurnerProfileByUserId`; only `completedAt` is consulted (`profileComplete = !!profile?.completedAt`) (route.ts:98-103).
- **`mcp_oauth_clients`** (schema.ts:1242-1254) — read via `findClient`: `clientId` (PK), `clientSecretHash` (nullable), `clientName` (NOT NULL — shown on consent screen), `redirectUris` (text[] NOT NULL — validated against the request's `redirect_uri`), `tokenEndpointAuthMethod`, `scope` (nullable), `createdAt`, `lastUsedAt`.
- **`mcp_auth_codes`** (schema.ts:1260-1284) — **written on Approve** via `issueAuthCode`: `code` (PK, plaintext, single-use), `clientId` (FK→clients, cascade), `userId` (FK→users, cascade), `redirectUri`, `codeChallenge`, `codeChallengeMethod` (`mcpCodeChallengeMethodEnum`), `scope` (NOT NULL), `expiresAt` (now + 5 min), `consumedAt` (nullable, flipped on token exchange in unit 29), `createdAt`. Indexes: `mcp_auth_codes_client_idx`, `mcp_auth_codes_expires_idx`.
- **`mcp_access_tokens`** (schema.ts:1289-1311) — not written by the consent screen itself (issued at the token endpoint, unit 29); referenced because the granted scope ultimately lands here.
- **`mcp_audit_log`** (schema.ts:1316-1341) — not written by the consent screen; one row per tool invocation (unit 29).
- `McpScopeRows` interface (mcp.ts:14-22): `user: { id, rank, aiDataConsent }`, `teamMemberships: Array<{ team, isLead }>`, `driverIntent: boolean`.
- `McpScope` interface (scope.ts:15-28): `campUserId`, `rank`, `leadTeams: Team[]`, `memberTeams: Team[]`, `isDriver`, `isCaptain`, `aiDataConsent`.

## Validation, edge cases & business rules

- **Open-redirect protection on the bridge** (`safeNext`, page.tsx:93-98): only accepts a value that starts with a single `/`; rejects empty, absolute, and protocol-relative (`//`) `next` values → falls back to `/`. Comment explicitly flags the protocol-relative attack (page.tsx:96).
- **Hard navigation required**: the bridge forwards via `window.location.replace`, not the App Router, because `next` is an API route (page.tsx:33-35).
- **Better Auth callback gotcha**: `signIn.social` returns to the current page (not the explicit `callbackURL`); the session effect handles the actual forward (page.tsx:7-16, 40-43).
- **Client/redirect validation** (route.ts:37-58): unknown `client_id` → 400 `unknown_client`; `redirect_uri` not in the client's registered `redirectUris` → 400 `invalid_redirect_uri`; both are rendered as `errorPage` (NOT redirected, since the redirect target itself is untrusted).
- **Scope validation**: unrecognised scope → `invalid_scope` *redirect-back* (route.ts:50-56) — done as a redirect (not error page) because the redirect target is already validated by that point.
- **PKCE mandatory**: `code_challenge` required (min 1); `code_challenge_method` constrained to `S256` at the authorize endpoint (route.ts:24-26), even though storage/verify also support `plain`.
- **Gate ordering (GET render)**: parse → resolve client/scope → require session (else bounce to bridge) → require camp profile → `mcpAccessError` (campAccess → profileComplete → approved). First failing gate wins (access.ts:18-41).
- **Gate ordering (POST)**: parse form → resolve client/scope → **if deny, redirect immediately** → require session → require camp profile → `mcpAccessError` → issue code. Denial bypasses session/gate re-checks (route.ts:142-179).
- **`mcpAccessError` precedence** (access.ts): `no_camp_access` > `onboarding_incomplete` > `pending_approval`; returns `null` (allowed) only when all three booleans hold.
- **God-email bypass**: `hasCampAccess` true if `isGodEmail(email)` OR `inviteCode` present; `isApproved` true if `isGodEmail(email)` OR `approvalStatus === "approved"` (users.ts:219-236).
- **Rejected collapses to pending message**: a `rejected` user fails `isApproved` and gets the `pending_approval` description, not a rejection-specific message (no distinct rejected branch in `mcpAccessError`).
- **ID-document consent rule** (consent.ts): self sees own ID docs always; otherwise requires BOTH `isCaptain` AND subject `aiDataConsent`. Default `aiDataConsent` is `false`, so by default a captain cannot see another member's ID docs via MCP. `redactIdDocuments` is *intended* as a defence-in-depth layer applied even if the caller forgot to gate (consent.ts:30-31), but is currently unwired (test-only — see "Sub-components / variants"); the live gate is `canSeeIdDocuments` used directly by `people.ts:133`.
- **Scope freshness**: capabilities are re-derived per tool call from live rows; no caching on the token (scope.ts:9-13).
- **HTML escaping**: every interpolated value in the consent HTML, the redirect HTML, and the error page is run through `escapeHtml` (route.ts:193-200); `htmlRedirect` additionally JSON-encodes the target for the inline `<script>` (route.ts:271).
- **CSP-driven redirect technique**: POST redirects use meta-refresh + JS, never a 302, because `form-action 'self'` would silently drop a cross-origin 302 (route.ts:259-263).
- **Issuer/origin correctness**: well-known issuer and the bridge `next` URL derive origin from request headers / `MCP_PUBLIC_URL`, never `VERCEL_URL`, to avoid pointing at the SSO-gated deploy URL (origin.ts; oauth-authorization-server/route.ts:11-14).
- **`state` passthrough**: `state` is forwarded on both the success (`code`) and deny (`access_denied`) redirects only when present (route.ts:142-148, 181-186).

## Sub-components / variants

- **`MCPConnectPage` / `MCPConnectInner` / `Shell`** (page.tsx) — the only React components; `Shell` is a shared layout wrapper (`max-w-md`, centered) used for loading, signed-in, and signed-out states.
- **`consentHtml`** (route.ts:202-257) — server-rendered consent page (inline `<style>`, dark hard-coded palette `#0a0a0a`/`#fafafa`/`#171717`/`#262626`; NOT the OKLCH brand tokens — this surface is rendered outside the React/Tailwind app shell). Approve/Deny buttons. <!-- ugly truth: the consent HTML uses hard-coded neutral hex colours, divergent from the app's single OKLCH brand palette, because it is a raw HTML response from an API route, not an in-app page. -->
- **`htmlRedirect`** (route.ts:264-277) — meta-refresh + JS redirect intermediary.
- **`errorPage`** (route.ts:298-314) — generic error HTML (title + description), used for all `errorPage(...)` denials.
- **`redirectError`** (route.ts:285-296) — redirect-back error variant (used only for `invalid_scope`).
- **`buildRedirectUrl`** (route.ts:279-283), **`escapeHtml`** (route.ts:193-200), **`parseParams`** / **`resolveClientOrError`** (route.ts:33-58) — internal helpers.
- **Server-only validators/predicates:** `AuthorizeQuery` (zod), `mcpAccessError` (access.ts), `isAllowedScope` / `isAllowedRedirectUri` (oauth.ts), `canSeeIdDocuments` / `redactIdDocuments` (consent.ts), `resolveMcpScope` / `getMcpScope` / `canReadTeamOps` / `canWriteTeam` / `canApproveCrossTeam` / `canAdmin` (scope.ts). Of these, only `getMcpScope` (via tool-utils.ts:53) and `canSeeIdDocuments` (via people.ts:133) are wired into the live tool surface; `redactIdDocuments` (consent.ts:33-45) and the four scope predicates (scope.ts:70-90) are test-only / orphaned (exercised only by `consent.test.ts` / `scope.test.ts`).
- **Dead/orphaned for THIS surface:** `isAllowedRedirectUri` (oauth.ts) is the registration-time guard and is **not invoked** by the authorize route (which validates against the stored `client.redirectUris` instead) — load-bearing for unit 29's `/register`, not the consent render. The `plain` PKCE method (`mcpCodeChallengeMethodEnum`) is accepted in storage/verify but **rejected at the authorize endpoint** (`code_challenge_method` enum is `["S256"]` only). `aiDataConsentAt` is written/maintained elsewhere; this surface only reads `aiDataConsent`. The four `scope.ts` capability predicates (`canReadTeamOps` / `canWriteTeam` / `canApproveCrossTeam` / `canAdmin`, scope.ts:70-90) and `redactIdDocuments` (consent.ts:33-45) have **no production caller** (each is exercised only by its co-located test — `scope.test.ts` / `consent.test.ts`); the live capability surface wired from these modules is just `getMcpScope` (tool-utils.ts:53) and `canSeeIdDocuments` (people.ts:133).

---

# 18 — @camp404/ui component catalog

**Files covered:**
- `packages/ui/src/components/button.tsx` — `Button` + `buttonVariants` (CVA): the single button primitive, 6 variants × 5 sizes, `asChild` slot support.
- `packages/ui/src/components/input.tsx` — `Input`: thin styled wrapper over a native `<input>`, forwards all native input attrs.
- `packages/ui/src/components/textarea.tsx` — `Textarea`: thin styled wrapper over a native `<textarea>`, `min-h-[80px]`.
- `packages/ui/src/components/label.tsx` — `Label`: Radix `LabelPrimitive.Root` wrapper, `peer-disabled` styling.
- `packages/ui/src/components/checkbox.tsx` — `Checkbox`: Radix checkbox with a lucide `Check` indicator.
- `packages/ui/src/components/select.tsx` — Radix Select family (Root/Trigger/Content/Item/Label/Group/Value/Separator/ScrollUp/ScrollDown buttons).
- `packages/ui/src/components/slider.tsx` — `Slider`: Radix Slider, single- or multi-thumb (renders one thumb per value).
- `packages/ui/src/components/card.tsx` — `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter` container family.
- `packages/ui/src/components/dialog.tsx` — Radix Dialog family (Root/Trigger/Portal/Close/Overlay/Content/Header/Footer/Title/Description), built-in close `XIcon`, optional `Close` button in footer.
- `packages/ui/src/components/popover.tsx` — Radix Popover (Root/Trigger/Content); positioned content, `w-72` default.
- `packages/ui/src/components/command.tsx` — cmdk command palette family (Command/Input/List/Empty/Group/Item/Shortcut/Separator) with lucide `Search` icon.
- `packages/ui/src/components/combobox.tsx` — `Combobox`: searchable single-select built by composing Popover + Command + Button; camp-custom (not a raw shadcn primitive).
- `packages/ui/src/components/avatar.tsx` — `Avatar`/`AvatarImage`/`AvatarFallback`: circular image with initials/icon fallback.
- `packages/ui/src/lib/utils.ts` — `cn()` class-merge helper (clsx + tailwind-merge); used by every component.
- `packages/ui/src/lib/__tests__/utils.test.ts` — unit tests pinning `cn()` behaviour.
- `packages/ui/src/styles/globals.css` — single OKLCH `@theme` token source these components reference (`var(--color-*)`, `--radius`); detailed in unit 28, only referenced tokens are noted here.
- `*.stories.tsx` (button/input/label/checkbox/select/slider/textarea/card) — Storybook docs; note: stories under-document a few real variants (see Sub-components/variants).

**Purpose:** This unit is the shared, restyleable primitive layer of Camp 404 — the shadcn-style (verbatim/"new-york") set every screen reuses for buttons, text inputs, labels, checkboxes, selects, sliders, cards, dialogs, popovers, command palettes, comboboxes, and avatars. It is purely presentational and stateless beyond local UI state (open/closed, single combobox `open`); it owns NO data, NO server calls, NO routing, and NO gating logic. All colour comes from the single global OKLCH `@theme` via `var(--color-*)` Tailwind utilities; `cn()` merges caller classes so any consumer can restyle without forking. There is NO barrel index — each component is imported by its own path (`@camp404/ui/components/<name>`). These are the building blocks; the camp-custom navigation (ControlPanel/ControlGrid/QuadrantNav) is unit 19 and tokens are unit 28.

## Features

### Button (button.tsx)
- Single `Button` component backed by a CVA factory `buttonVariants` (button.tsx:7-35), also exported standalone for use on non-button elements.
- `asChild` prop (default `false`): when true, renders via Radix `Slot` so the variant classes are applied to the child element instead of a `<button>` (button.tsx:40,44-45). Used e.g. to style links/triggers as buttons.
- Forwards ref to `HTMLButtonElement` and spreads all native button attributes (`type`, `onClick`, `disabled`, `aria-*`, etc.) (button.tsx:37-39,51).
- Base classes include icon handling: any nested `svg` is forced to `size-4`, `shrink-0`, `pointer-events-none` (button.tsx:8) — so icon buttons auto-size their lucide glyphs.
- Disabled styling baked into base: `disabled:pointer-events-none disabled:opacity-50` (button.tsx:8).
- Focus ring baked into base: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` (button.tsx:8).

### Input (input.tsx)
- Thin styled `<input>`; passes `type` through and spreads all native input attributes (input.tsx:6-19).
- `placeholder:text-muted-foreground`, `disabled:cursor-not-allowed disabled:opacity-50`, file-input styling (`file:border-0 file:bg-transparent file:text-sm file:font-medium`) (input.tsx:12).
- `InputProps = React.InputHTMLAttributes<HTMLInputElement>` (no custom props) (input.tsx:4).

### Textarea (textarea.tsx)
- Thin styled `<textarea>` with `min-h-[80px]`, spreads all native textarea attributes (textarea.tsx:6-18).
- `TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>` (no custom props) (textarea.tsx:4).

### Label (label.tsx)
- Radix `LabelPrimitive.Root` wrapper; `text-sm font-medium leading-none` and `peer-disabled:cursor-not-allowed peer-disabled:opacity-70` so a label tied to a disabled `peer` control visually dims (label.tsx:8-10).
- `"use client"` (label.tsx:1).

### Checkbox (checkbox.tsx)
- Radix `CheckboxPrimitive.Root` with a lucide `Check` icon inside `CheckboxPrimitive.Indicator` (checkbox.tsx:5,21-25).
- `data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground` toggles checked styling; `disabled:cursor-not-allowed disabled:opacity-50` (checkbox.tsx:16).
- Supports tristate (Radix `checked` may be `true | false | "indeterminate"`); no explicit indeterminate visual is added beyond the indicator showing only when checked.
- `"use client"` (checkbox.tsx:1).

### Select (select.tsx)
- Re-exports Radix Select parts as a styled family: `Select` (=Root), `SelectGroup`, `SelectValue`, `SelectTrigger`, `SelectContent`, `SelectLabel`, `SelectItem`, `SelectSeparator`, `SelectScrollUpButton`, `SelectScrollDownButton` (select.tsx:148-159).
- `SelectTrigger` shows a `ChevronDown` icon and clamps the value to one line (`[&>span]:line-clamp-1`) (select.tsx:18-30).
- `SelectContent` is portalled, `position="popper"` by default, `max-h-96 min-w-[8rem]`, with open/close enter/exit animation data-attrs and side-aware slide-in; popper mode adds directional translate offsets and sizes the viewport to the trigger width/height via `--radix-select-trigger-*` (select.tsx:69-98).
- `SelectItem` renders a left-anchored `Check` indicator for the selected item (`SelectPrimitive.ItemIndicator`) and focus styling `focus:bg-accent focus:text-accent-foreground`; disabled item styling `data-[disabled]:pointer-events-none data-[disabled]:opacity-50` (select.tsx:113-133).
- Scroll up/down buttons render `ChevronUp`/`ChevronDown` (select.tsx:34-67).
- `"use client"` (select.tsx:1).

### Slider (slider.tsx)
- Radix `SliderPrimitive.Root` rendered as a function component (NOT forwardRef) (slider.tsx:8-61).
- Defaults `min = 0`, `max = 100` (slider.tsx:12-13).
- Renders one `SliderPrimitive.Thumb` per value, derived from `value` ⊳ `defaultValue` ⊳ `[min, max]` via `_values` memo — so passing a 2-element default yields a range slider; passing none yields a 2-thumb `[min,max]` slider (slider.tsx:16-24,52-58).
- Supports horizontal and vertical orientation (`data-[orientation=vertical]` classes; vertical gets `min-h-44`) (slider.tsx:34,42,48).
- `data-[disabled]:opacity-50` on root; thumb has hover/focus ring growth (`hover:ring-4 focus-visible:ring-4`) (slider.tsx:34,56).
- `data-slot` attributes on root/track/range/thumb for styling hooks (slider.tsx:28,40,46,54).
- `"use client"` (slider.tsx:1).

### Card (card.tsx)
- Container family: `Card` (rounded-xl bordered surface, `bg-card text-card-foreground shadow-sm`), `CardHeader` (`flex flex-col space-y-1.5 p-6`), `CardTitle` (`<h3>`, `text-2xl font-semibold`), `CardDescription` (`<p>`, `text-sm text-muted-foreground`), `CardContent` (`p-6 pt-0`), `CardFooter` (`flex items-center p-6 pt-0`) (card.tsx:4-78).
- All are `forwardRef` div/h3/p wrappers spreading native HTML attributes; no behaviour, pure layout/typography.

### Dialog (dialog.tsx)
- Radix Dialog family as function components: `Dialog`(Root), `DialogTrigger`, `DialogPortal`, `DialogClose`, `DialogOverlay`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription` (dialog.tsx:147-158).
- `DialogContent` is centered (`top/left 50%`, translate −50%), `max-w-[calc(100%-2rem)] sm:max-w-lg` (matches the app's `max-w-lg` shell), portalled over a `DialogOverlay` (`bg-background/80`), with open/close zoom+fade animations (dialog.tsx:50-82).
- `DialogContent` renders a built-in top-right close affordance with a lucide `XIcon` + sr-only "Close" text, gated by `showCloseButton` prop (default `true`) (dialog.tsx:50-78).
- `DialogFooter` has its OWN `showCloseButton` prop (default `false`); when true it appends a `<Button variant="outline">Close</Button>` wrapped in `DialogPrimitive.Close asChild` (dialog.tsx:94-118).
- `DialogHeader`/`DialogFooter` are plain divs with `data-slot` attrs; header is centered on mobile, left-aligned `sm:`; footer is `flex-col-reverse` stacking on mobile, row + right-justified `sm:` (dialog.tsx:84-119).
- `"use client"` (dialog.tsx:1).

### Popover (popover.tsx)
- Radix Popover: `Popover`(=Root), `PopoverTrigger`(=Trigger, raw re-export), `PopoverContent` (styled, forwardRef) (popover.tsx:8-31).
- `PopoverContent` defaults `align = "center"`, `sideOffset = 4`, `w-72`, portalled, side-aware slide/zoom/fade animations, `origin-[--radix-popover-content-transform-origin]` (popover.tsx:12-28).
- `"use client"` (popover.tsx:1).

### Command (command.tsx)
- cmdk-based command palette family: `Command`(Root, `bg-popover`), `CommandInput` (with leading lucide `Search` icon in a bordered wrapper, `h-11`), `CommandList` (`max-h-[300px]` scroll), `CommandEmpty` (`py-6 text-center`), `CommandGroup` (styled `[cmdk-group-heading]`), `CommandItem` (`data-[selected=true]:bg-accent`, `data-[disabled=true]:opacity-50`, auto `size-4` svg), `CommandShortcut` (right-aligned `ml-auto` keyboard-hint span), `CommandSeparator` (command.tsx:9-138).
- `"use client"` (command.tsx:1).

### Combobox (combobox.tsx) — camp-custom composite
- Searchable single-select dropdown composing `Popover` + `Command` + `Button` (variant `outline`, role `combobox`) (combobox.tsx:41-114). Doc-comment notes it was copied verbatim from `RyRy79261/intake-tracker` and is the right primitive for long lookup sets (e.g. country picker) where a plain `Select` would force scrolling hundreds of options (combobox.tsx:34-40).
- Controlled: takes `value: string | undefined`, `onChange: (value: string) => void`, `options: ReadonlyArray<ComboboxOption>` where each option is `{ value, label }` (combobox.tsx:17-32).
- Local `open` state (combobox.tsx:52); selecting an item calls `onChange(o.value)` then closes the popover (combobox.tsx:92-95).
- Trigger button shows the selected option's `label`, or `placeholder` (muted text) when nothing is selected; trailing `ChevronsUpDown` icon (combobox.tsx:57-75).
- Selected row shows a leading lucide `Check` in a fixed-width slot so text doesn't shift; conditional render (not opacity toggle) deliberately avoids a Tailwind-v4 shared-package class-scanner quirk (combobox.tsx:97-103).
- Popover content width matches the trigger via `w-[var(--radix-popover-trigger-width)]` (combobox.tsx:78-79).
- `CommandItem` filters by `value={o.label}` (search matches the label text, not the stored value) (combobox.tsx:91).
- `"use client"` (combobox.tsx:1).

### Avatar (avatar.tsx)
- `Avatar` (Radix `AvatarPrimitive.Root`): circular `h-10 w-10` (default) clipped overflow (avatar.tsx:12-24).
- `AvatarImage`: `object-cover aspect-square`; Radix auto-hides it on load error and shows fallback (avatar.tsx:27-37).
- `AvatarFallback`: centered initials/icon on `var(--color-secondary)` / `var(--color-secondary-foreground)`, `font-semibold` — the ONLY component that references the secondary palette directly via `var(--color-*)` in TSX rather than a Tailwind token class (avatar.tsx:39-51).
- Doc-comment: standard shadcn "new-york" avatar, used by the profile page, the profile editor, and the home header (avatar.tsx:7-11).
- `"use client"` (avatar.tsx:1).

### cn() class merge (lib/utils.ts)
- `cn(...inputs: ClassValue[])` = `twMerge(clsx(inputs))` (utils.ts). Every component merges caller `className` through it so restyling overrides win the Tailwind conflict (later class beats earlier).

## User actions & interactions
These primitives expose interactions through native/Radix/cmdk behaviour; this unit adds no bespoke gestures beyond the Combobox composite.
- **Button:** click/keyboard activate; `disabled` blocks pointer events. When `asChild`, the wrapped element receives the activation (e.g. a link).
- **Input / Textarea:** type, focus, blur, paste, file-pick (input file styling); fully native. No debounce, no masking in this unit.
- **Label:** clicking focuses its associated control via `htmlFor` (native label behaviour); dims when its `peer` control is disabled.
- **Checkbox:** click/Space toggles checked ⇄ unchecked (Radix); supports `defaultChecked`/controlled `checked` + `onCheckedChange` from caller.
- **Select:** open trigger (click/Enter/Space), arrow-key navigate items, type-ahead, select item (closes), scroll via up/down buttons; selected item shows a `Check`.
- **Slider:** drag thumb, arrow-key step (`step` supplied by caller; stories use `step={1}` and `step={5}`), each thumb independently movable for ranges; `disabled` dims and blocks.
- **Dialog:** open via `DialogTrigger`; close via top-right `XIcon` (when `showCloseButton`), optional footer "Close" button, Escape, or overlay click (Radix defaults); focus is trapped while open.
- **Popover:** open via `PopoverTrigger`; close on outside-click/Escape (Radix); side/align configurable.
- **Command:** type to filter, arrow-key navigate, Enter to select an item, `CommandEmpty` shows when no matches.
- **Combobox:** click trigger to open popover → type to filter → click/Enter an item to select (fires `onChange(value)` and closes); selecting persists the option's `value`, displays its `label`.
- **Avatar:** no interaction; image load failure swaps to fallback automatically.

## States & presentations
This unit only realizes the **always-needed** global-states rows; the **gating** rows (invite-gated / onboarding-incomplete / pending-approval / rejected / captain-only-locked) are enforced by routing and the ControlPanel layer (units 19 / gating spine), NOT by these primitives. They are listed below only to mark them out of scope here.

- **Empty:** `CommandEmpty` (`emptyMessage`, default via Command consumers); Combobox `emptyMessage` default `"Nothing found."` (combobox.tsx:47); `SelectValue placeholder`; Input/Textarea `placeholder`; Combobox trigger shows muted `placeholder` (default `"Select…"`, combobox.tsx:45) when unselected; Avatar shows `AvatarFallback` (initials) when no image.
- **Loading:** Avatar shows `AvatarFallback` while the image is still loading (Radix loading-status behaviour); no spinner primitive exists in this unit.
- **Populated:** Select/Combobox show selected `label` + `Check` mark; inputs show their value; cards/avatars render content.
- **Validation-error:** NO built-in error variant on Input/Textarea/Select/Checkbox/Slider/Combobox — error styling/messaging is the consumer's responsibility (e.g. the questionnaire `_form`/`_root` banner). These primitives expose only the focus ring and disabled states; callers add error classes through `className`.
- **Submitting/pending:** no built-in busy/spinner state; Button has no `loading` prop — callers pass `disabled` and swap children. (Confirmed: no `isLoading`/`pending` prop anywhere in these files.)
- **Success:** no success variant; expressed by consumers.
- **Disabled:** universal — Button (`disabled:pointer-events-none disabled:opacity-50`), Input/Textarea/Select/Checkbox (`disabled:cursor-not-allowed disabled:opacity-50`), Slider (`data-[disabled]:opacity-50`), Combobox (`disabled` prop forwarded to its trigger Button), Command items (`data-[disabled=true]`), Select items (`data-[disabled]`). Label dims via `peer-disabled`.
- **Open/closed (UI-local):** Select/Dialog/Popover/Combobox use Radix `data-[state=open|closed]` with zoom/fade/slide animations; Combobox tracks its own `open` React state.
- **Gating rows (OUT OF SCOPE for this unit):** invite-gated, onboarding-incomplete, pending-approval, rejected (terminal), captain-only-locked — none are implemented in `packages/ui/src/components`; they are enforced upstream (app/page.tsx gating spine, ControlPanel locked layers). NO offline/sync states and NO budget/over-target states exist anywhere.

## Enums, options & configurable values

### Button variants (`buttonVariants`, button.tsx:11-28) — 6 variants
- `default` — `bg-primary text-primary-foreground hover:bg-primary/90`
- `destructive` — `bg-destructive text-destructive-foreground hover:bg-destructive/90`
- `outline` — `border border-input bg-background hover:bg-accent hover:text-accent-foreground`
- `secondary` — `bg-secondary text-secondary-foreground hover:bg-secondary/80`
- `ghost` — `hover:bg-accent hover:text-accent-foreground`
- `link` — `text-primary underline-offset-4 hover:underline`
- Default variant: `default` (button.tsx:31).

### Button sizes (button.tsx:22-28) — 5 sizes
- `default` — `h-10 px-4 py-2`
- `sm` — `h-9 rounded-md px-3`
- `lg` — `h-11 rounded-md px-8`
- `icon` — `h-10 w-10`
- `icon-lg` — `h-14 w-14`
- Default size: `default` (button.tsx:32).

> Note: the shared-vocabulary brief lists button variants as `default/outline/ghost/destructive/secondary` and sizes `default/sm/lg/icon` — the code ADDS a 6th variant `link` and a 5th size `icon-lg` beyond the brief. `link` IS used in the app (`apps/web/app/signup/required/invite-gate-form.tsx:63`). `icon-lg` is defined but has NO consumer found in `apps/web/**/*.tsx` (see Sub-components/variants → dead/orphaned).

### Slider configurable values (slider.tsx)
- `min` default `0`, `max` default `100` (slider.tsx:12-13). `step` is caller-supplied (not defaulted here; Radix default 1). Thumb count = number of values in `value`/`defaultValue`, else 2 (`[min,max]`).

### Combobox props/defaults (combobox.tsx:41-51)
- `placeholder` default `"Select…"`; `searchPlaceholder` default `"Search…"`; `emptyMessage` default `"Nothing found."`.
- `ComboboxOption` = `{ value: string; label: string }` (combobox.tsx:17-20).

### Dialog flags (dialog.tsx)
- `DialogContent.showCloseButton` default `true` (dialog.tsx:53). `DialogFooter.showCloseButton` default `false` (dialog.tsx:96).

### Popover defaults (popover.tsx:15)
- `align` default `"center"`; `sideOffset` default `4`; width `w-72`.

### Select defaults (select.tsx:72)
- `SelectContent.position` default `"popper"`; `max-h-96`; `min-w-[8rem]`.

### Tokens referenced (from the single OKLCH `@theme`, globals.css; full set is unit 28)
Used by these primitives via `var(--color-*)`/Tailwind token classes (NOT redefined here):
- `--color-primary: oklch(0.65 0.27 340)`, `--color-primary-foreground: oklch(0.99 0.005 340)`
- `--color-accent: oklch(0.62 0.18 255)`, `--color-accent-foreground: oklch(0.99 0.005 255)`
- `--color-secondary: oklch(0.42 0.18 320)`, `--color-secondary-foreground: oklch(0.98 0.01 330)`
- `--color-destructive: oklch(0.65 0.22 18)`, `--color-destructive-foreground: oklch(0.98 0 0)`
- `--color-background: oklch(0.15 0.05 295)`, `--color-foreground: oklch(0.97 0.02 330)`
- `--color-card: oklch(0.26 0.08 295)` / `--color-card-foreground`; `--color-popover: oklch(0.26 0.08 295)` / `--color-popover-foreground`
- `--color-muted: oklch(0.22 0.06 295)`, `--color-muted-foreground: oklch(0.7 0.05 325)`
- `--color-border` / `--color-input: oklch(0.35 0.1 305)`; `--color-ring: oklch(0.65 0.27 340)`
- `--radius: 0.625rem` (drives `rounded-md`/`rounded-lg`/`rounded-xl` scale).

### lucide-react icons embedded in primitives
`Check` (checkbox, select item, combobox), `ChevronDown`/`ChevronUp` (select trigger + scroll buttons), `ChevronsUpDown` (combobox trigger), `Search` (command input), `XIcon` (dialog close). (`lucide-react ^1.16.0`.)

## Data model touched
None. This unit touches **no database tables and no schema fields** — it is pure presentation. The only TypeScript shape it defines is the UI-local `ComboboxOption` interface:
- `ComboboxOption { value: string; label: string }` (combobox.tsx:17-20).

Consumers map domain data into these props; e.g. the questionnaire `combobox` field passes `question.options` (already `{value,label}`) and persists the chosen `value` string (`apps/web/components/questionnaire/question.tsx:221-231`). Avatars are fed a `src` URL + initials string by `profile/page.tsx` and `home-header.tsx` (no schema knowledge in this unit). All actual entity tables/fields belong to unit 29.

## Validation, edge cases & business rules
- **No validation lives here.** None of these primitives validate input, enforce required fields, or constrain values; validation is the consumer's job (questionnaire field machine, server actions). Inputs accept any native attributes the caller passes (`required`, `pattern`, `min`, `max`, `maxLength`) but the component adds none by default.
- **`cn()` conflict resolution (utils.test.ts):** later Tailwind utility wins (`cn("px-2","px-4") === "px-4"`); falsy entries dropped (`false`/`null`/`undefined`/`""`); nested arrays/objects flattened (clsx semantics). This is the contract that lets any caller override a primitive's classes.
- **Slider thumb derivation:** if neither `value` nor `defaultValue` is an array, the slider falls back to `[min, max]` → renders TWO thumbs (a full-range slider), not zero/one. A single-value slider REQUIRES the caller to pass `value`/`defaultValue` as a 1-element array (slider.tsx:16-24). Edge case to preserve on restyle.
- **Combobox search key:** `CommandItem value={o.label}` means fuzzy search matches the visible label, not the stored `value` (combobox.tsx:91). Selecting fires `onChange(o.value)` and closes (combobox.tsx:92-95). Trigger renders muted placeholder when `value` is unset or not found in `options` (combobox.tsx:53,66-73).
- **Avatar fallback:** Radix swaps to `AvatarFallback` automatically on image load error or while loading; consumers must supply fallback content (initials) — there is no default glyph in the primitive (avatar.tsx:39-51).
- **Dialog double-close affordance:** `DialogContent` close (X) and `DialogFooter` close button are independent flags; both default-states differ (`true` vs `false`). A restyle must keep at least one escape affordance plus Radix Escape/overlay-click so "every gate has an exit" holds.
- **Checkbox tristate:** Radix `checked` may be `"indeterminate"`; the indicator only renders the `Check` glyph (no dash) — indeterminate has no distinct visual here.
- **Select content sizing:** in `popper` position the viewport is sized to the trigger via `--radix-select-trigger-width/height`; Combobox popover uses `--radix-popover-trigger-width`. Preserve these so dropdowns track trigger width.
- **No barrel export:** components are imported per-path (`@camp404/ui/components/<name>`, plus `@camp404/ui/lib/utils`); package `exports` map (package.json) has no aggregate index. Adding/renaming a file changes its public import path.
- **`var(--color-*)` only rule:** colours come exclusively from the single `@theme`; `AvatarFallback` is the one place a raw `bg-[color:var(--color-secondary)]` is inlined. Entities are disambiguated by ICON + LABEL, never colour — restyle must not introduce per-entity hue tables.

## Sub-components / variants
- **Button:** exported `Button` + `buttonVariants` (CVA factory). Variants `default | destructive | outline | secondary | ghost | link`; sizes `default | sm | lg | icon | icon-lg`. `asChild` slot mode.
  - **DEAD/ORPHANED:** size `icon-lg` (`h-14 w-14`) is defined (button.tsx:27) but has **no consumer** in `apps/web/**/*.tsx` (grep found none) and is omitted from `button.stories.tsx` (not in the `Sizes` story or `size` argTypes). Defined-but-unused — reserved for a future feature (e.g. the push-to-talk / large icon button) but currently unused.
  - **UNDER-DOCUMENTED:** `button.stories.tsx` argTypes omit `link` from variants and `icon-lg` from sizes, and the `Sizes` story shows only sm/default/lg — yet both `link` and `icon-lg` exist in code (and `link` is used in `invite-gate-form.tsx:63`).
- **Input / Textarea / Label:** single component each, no variants. `labelVariants` is a CVA with only a base string (no variant axes) — effectively a no-op CVA (label.tsx:8-10).
- **Checkbox:** single component; checked/unchecked/(indeterminate) via Radix data-state.
- **Select family (10 exports):** `Select`, `SelectGroup`, `SelectValue`, `SelectTrigger`, `SelectContent`, `SelectLabel`, `SelectItem`, `SelectSeparator`, `SelectScrollUpButton`, `SelectScrollDownButton` (select.tsx:148-159).
- **Slider:** single function component (note: NOT forwardRef, unlike most others — passing a `ref` won't attach to the DOM root).
- **Card family (6 exports):** `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.
- **Dialog family (10 exports):** `Dialog`, `DialogClose`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogOverlay`, `DialogPortal`, `DialogTitle`, `DialogTrigger`. Two `showCloseButton` flags (Content default true, Footer default false).
- **Popover family (3 exports):** `Popover`, `PopoverTrigger` (raw Radix re-export), `PopoverContent` (styled).
- **Command family (8 exports):** `Command`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandShortcut`, `CommandSeparator`. `CommandShortcut` (keyboard-hint right-aligned span) has no found consumer in `apps/web` — likely orphaned but harmless (provided for completeness of the cmdk family).
- **Combobox:** single composite (`Combobox` + exported `ComboboxOption` type). Camp-custom (composes Popover+Command+Button), not a verbatim shadcn primitive; provenance noted as copied from `RyRy79261/intake-tracker`.
- **Avatar family (3 exports):** `Avatar`, `AvatarImage`, `AvatarFallback`.
- **OUT OF SCOPE (unit 19, present in the same folder):** `control-grid.tsx`, `control-panel.tsx`, `quadrant-nav.tsx` (+ their `.stories.tsx`) — the camp-custom 2×2 quadrant nav / push-to-talk layer; intentionally NOT documented here.

---

# 19 — Control Panel / Control Grid / Quadrant Nav

**Files covered:**
- `packages/ui/src/components/control-panel.tsx` — the LIVE rank-layered 2×2 quadrant home control panel (mobile, one layer at a time, push-to-talk centre, layer tab bar). Also exports the rank model (`ControlPanelRank`, `RANK_LABEL`, `rankLevel`) and the optional `ControlPanelHeader` default header content.
- `packages/ui/src/components/control-grid.tsx` — STORYBOOK-ONLY / DEAD desktop counterpart: lays out every rank layer at once as stacked sections of 4 tiles. Imports the rank model + types from `control-panel.tsx`. Not referenced by any app route; its sole importer is `control-grid.stories.tsx:13` (same dead/Storybook-only status as the `QuadrantNav` v0 prototype).
- `packages/ui/src/components/quadrant-nav.tsx` — PREPARED/UNUSED v0 single-layer four-quadrant nav with a circular push-to-talk centre. No rank model, no lock logic. Explicitly "Superseded by `ControlPanel`" (its story doc). Not referenced by any app route.
- `apps/web/app/page.tsx` — the SOLE live consumer (home, screen 06). Runs the gating spine, derives `viewerRank`, defines `homeLayers`, renders `<ControlPanel>`.
- `apps/web/app/home-header.tsx` — the header node passed into `ControlPanel`'s `header` slot on home: notifications bell + unread badge + avatar link.
- Stories (Storybook only, not shipped): `control-panel.stories.tsx`, `control-grid.stories.tsx`, `quadrant-nav.stories.tsx`.
- `packages/ui/src/styles/globals.css:58-68` — `@keyframes cp-layer-in` (layer-switch transition used by `ControlPanel`).

**Purpose:** Camp 404's home command-centre navigation surface. The live `ControlPanel` presents a 2×2 grid of action tiles ("quadrants") for exactly one *rank layer* at a time, with a circular push-to-talk centre button and a bottom tab bar that switches between three layers (camp member → team lead → captain). Layers above the viewer's own rank stay browsable but are rendered visible-but-locked (dimmed, lock icon, no interaction) — the brief's "captain-only-locked" gating expressed in the nav itself. `ControlGrid` is a desktop reflow of the same data (all layers shown at once), and `QuadrantNav` is the abandoned v0 single-layer prototype; both are prepared but currently unused.

## Features

### ControlPanel — root component (control-panel.tsx:100-177)
- Renders a full-viewport column: header bar (top) → quadrant grid (flex-1) → layer tab bar (bottom). Height `h-[100dvh]`, full width, background `var(--color-background)` (control-panel.tsx:127-132).
- Holds the active layer index in local state, initialised by clamping `initialLayer` into `[0, max(layers.length-1, 0)]` (control-panel.tsx:111-113).
- Resolves `layer = layers[active]`; if there is no layer at that index, renders `null` (early return) (control-panel.tsx:115-116).
- Computes `unlocked = rankLevel(viewerRank) >= rankLevel(layer.rank)` for the currently displayed layer; this single boolean gates all four tiles of the visible layer (control-panel.tsx:118).
- Renders the 2×2 grid as `grid-cols-2 grid-rows-2 gap-px` over a `var(--color-border)` background (the gap shows the border colour as hairlines between tiles). Grid carries `key={active}` and the `animate-[cp-layer-in_200ms_ease-out]` entrance animation, so switching layers replays the fade/scale-in (control-panel.tsx:136-139).
- Maps the four layer slots to four `QuadrantTile`s in fixed order: `topLeft`→`tl`, `topRight`→`tr`, `bottomLeft`→`bl`, `bottomRight`→`br`; each tile receives `locked={!unlocked}` and an `onSelect` that fires `onQuadrantSelect?.(quadrant, corner, layer)` (control-panel.tsx:140-164).
- Renders the push-to-talk `CentreButton` only when a `centre` prop is supplied (control-panel.tsx:166).
- Renders the `LayerTabBar` at the bottom (control-panel.tsx:169-174).

### ControlPanelHeaderBar (control-panel.tsx:179-192)
- Fixed-height (`h-14`) header with bottom border. Left: brand `title` (default `"Camp 404"`). Right: the caller's `header` slot node (control-panel.tsx:187-191).

### CentreButton — push-to-talk (control-panel.tsx:194-213)
- Circular button absolutely centred over the grid (`left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`, `z-20`). Sizing: `w-[22%] min-w-[5rem] max-w-[7rem]`, `aspect-square`, fully round (control-panel.tsx:204-205).
- Label defaults to `"TALK"`; icon defaults to a `Mic` (lucide) at `h-5 w-5`; ARIA label falls back to the visible label (control-panel.tsx:195-196, 200).
- Pointer-event wiring (NOT click): `onPointerDown → centre.onPress`, and `centre.onRelease` fires on `onPointerUp`, `onPointerLeave`, AND `onPointerCancel` (so leaving/cancelling the press also releases) — the press-and-hold contract for PTT (control-panel.tsx:201-204).
- Visual affordances: `active:scale-95` press feedback, `shadow-xl`, `ring-4 ring-[var(--color-background)]` (separates it from the grid), uses `var(--color-primary)` / `var(--color-primary-foreground)` (control-panel.tsx:205).

### LayerTabBar (control-panel.tsx:215-267)
- Fixed-height (`h-14`) bottom `<nav>` with `aria-label="Switch rank view"`, one equal-width button per layer (control-panel.tsx:227-230).
- Per-tab: `isActive = index === active`; `isLocked = rankLevel(viewerRank) < rankLevel(layer.rank)` (independent per-tab lock check, so locked layers can still be browsed/selected) (control-panel.tsx:232-233).
- Tab label uses the SHORT `RANK_TAB_LABEL` (`"Me"` / `"Team Lead"` / `"Captain"`) (control-panel.tsx:253).
- Locked tabs append a `Lock` icon (`h-3 w-3`) next to the label (control-panel.tsx:254).
- Active tab is bold + primary-coloured and shows a small underline pill (`absolute bottom-2 h-0.5 w-6 rounded-full`); inactive tabs are muted with a hover-to-foreground colour shift (control-panel.tsx:245-261).
- `aria-pressed={isActive}`; `aria-label` is `"{RANK_LABEL} view (locked, view only)"` when locked, else `"{RANK_LABEL} view"` — uses the LONG label here, vs short label visually (control-panel.tsx:239-244).
- Clicking any tab (locked or not) calls `onSelect(index)` → `selectLayer` → sets active + fires `onLayerChange?.(index, layer)` (control-panel.tsx:120-124, 238).

### QuadrantTile (control-panel.tsx:285-363)
- Body stack: icon row (icon + a `Lock` `h-3.5 w-3.5` appended when `locked`) → bold title (`quadrant.label`) → optional `quadrant.hint` (muted, `text-xs`) (control-panel.tsx:296-311).
- Corner-aligned content per `CORNER_ALIGN` so each tile's content hugs the grid's outer corner (control-panel.tsx:269-274, 326-329).
- Optional numeric/string `badge`: a rounded pill (`h-5 min-w-5`, primary background) pinned to the tile's TOP edge via `BADGE_CORNER` (always `top-3`, left for tl/bl, right for tr/br — kept at top so it never collides with the corner-aligned title stack) (control-panel.tsx:276-283, 313-324).
- Three render modes (mutually exclusive, checked in this order):
  1. **locked** → a non-interactive `<div aria-disabled="true">` with `opacity-45`. No href, no onClick. (control-panel.tsx:331-338)
  2. **href set** (and not locked) → renders as an `<a href>` with hover background; `onClick` still fires `onSelect` (so navigation + callback both happen) (control-panel.tsx:340-351).
  3. **otherwise** → a `<button type="button">` firing `onSelect` (control-panel.tsx:353-362).

### ControlPanelHeader — optional default header content (control-panel.tsx:365-401)
- Exported helper meant for the `header` slot. NOT used by the live app (home uses `HomeHeader` instead) — only referenced by `control-grid.stories.tsx`.
- Renders an auth button: `UserRound` icon + `userName`, or the literal `"Sign in"` when `userName` is omitted; fires `onAuth` on click (control-panel.tsx:383-390).
- Renders a settings icon button (`Settings`, `aria-label="Settings"`) firing `onSettings` (control-panel.tsx:391-398).

### HomeHeader — the live header slot node (apps/web/app/home-header.tsx)
- Notifications `<Link href="/notifications">` with a `Bell` icon; dynamic `aria-label` = `"Notifications (${notifications} unread)"` when there are unread, else `"Notifications"` (home-header.tsx:26-35).
- Unread badge: rounded primary pill shown only when `notifications` is truthy; displays the count, or the literal `"99+"` when `notifications > 99` (home-header.tsx:36-43).
- Avatar `<Link href="/profile" aria-label="Your profile">`: shows `AvatarImage` when `imageUrl` is set, else `AvatarFallback` with `initials` (home-header.tsx:45-54).

### page.tsx — live home wiring (apps/web/app/page.tsx)
- `export const dynamic = "force-dynamic"` (reads the auth session cookie per request) (page.tsx:27).
- Gating spine before the panel ever renders (page.tsx:29-63): unauthenticated → `<LandingHero/>`; no camp access → redirect `/signup/required`; pending blocking required action (`nextGate`) → redirect to that gate; legacy fallback (no `profile.completedAt`) → redirect `/onboarding/questionnaire`; not approved → redirect `/pending-approval`.
- Derives `viewerRank` (page.tsx:73-78): `campUser.rank === "captain"` → `"captain"`; else if `await isTeamLead(campUser.id)` → `"team_lead"`; else `"camp_member"`.
- Renders `<ControlPanel layers={homeLayers} viewerRank={viewerRank} header={<HomeHeader …/>} centre={{ label: "TALK" }} />` plus `<EnablePush/>` (web-push opt-in) (page.tsx:82-99).
- **Note (ugly truth) — (source gap — §6):** the live `centre` prop supplies only `{ label: "TALK" }` — NO `onPress`/`onRelease`. So the push-to-talk button on home is visible and labelled but currently INERT: it does nothing on press/release. Likewise `onQuadrantSelect` and `onLayerChange` are NOT wired in the app; tile navigation works purely via each quadrant's `href`. The TALK button is intended for the voice pipeline (unit 21), which will attach these handlers later. (page.tsx:94; confirmed no other handler wiring in `apps/web/app` or `apps/web/components`.)

### ControlGrid — desktop reflow (PREPARED/UNUSED) (control-grid.tsx:50-83)
- Same `layers` / `viewerRank` data shape as `ControlPanel`; intended to be selected by viewport so a screen feeds both the same props (control-grid.tsx:41-49).
- Renders ALL layers at once, each as a `ControlGridSection`, inside a centred `max-w-5xl` column (`min-h-[100dvh]`) (control-grid.tsx:57-82).
- Header bar shows `RANK_LABEL[viewerRank]` on the left and the `header` slot on the right (control-grid.tsx:64-69).
- `ControlGridSection` (control-grid.tsx:85-120): section heading = `RANK_LABEL[layer.rank]`; when `locked` (per-layer `rankLevel(viewerRank) < rankLevel(layer.rank)`), shows a `Lock` + `"View only"` pill. Tiles laid out responsively (`grid sm:grid-cols-2 lg:grid-cols-4`) using the shared `QUADRANTS` order array.
- `GridTile` (control-grid.tsx:122-181): same body stack as `ControlPanel`'s tile (icon + optional lock + label + optional hint), `min-h-[8rem]`, rounded `var(--radius)`. **Locked** → dashed-border `aria-disabled` div at `opacity-50`. **href** → `<a>`; **else** → `<button>`. NOTE: `GridTile` does NOT render a `badge` (the grid drops the quadrant badge feature that `ControlPanel` has).

### QuadrantNav — v0 prototype (PREPARED/UNUSED) (quadrant-nav.tsx:31-91)
- Single layer only: four `QuadrantNavItem`s (`{label, href, icon?}`) laid out in a `grid-cols-2 grid-rows-2 gap-px` over `var(--color-border)`, full `h-[100dvh]` (quadrant-nav.tsx:39-49).
- Each tile is always an `<a href>` (no lock logic, no rank, no badge, no callbacks). Corner alignment pushes content TOWARD the centre (e.g. tl → `items-end justify-end pb-12 pr-12`) — opposite of `ControlPanel`'s outward-corner alignment (quadrant-nav.tsx:65-90).
- Centre PTT button: circular `h-24 w-24`, `z-10`, `aria-label={centre.label}`, pointer wiring `onPointerDown→onPress`, `onPointerUp`/`onPointerLeave→onRelease` (NO `onPointerCancel`, unlike `ControlPanel`'s centre) (quadrant-nav.tsx:51-60).
- Explicitly superseded; "v0 layout, to be validated in Figma" (quadrant-nav.tsx:26-30, quadrant-nav.stories.tsx:14-17).

## User actions & interactions
- **Switch rank layer** — tap a tab in the bottom tab bar (`ControlPanel`) to change the visible layer; works for locked layers too (browse-only). Fires `onLayerChange`. (control-panel.tsx:120-124, 238)
- **Activate a quadrant** — tap/click an unlocked tile. If it has an `href` it navigates (`<a>`); regardless it fires `onQuadrantSelect(quadrant, corner, layer)`. Locked tiles are inert (`aria-disabled`, no handler). (control-panel.tsx:340-362)
- **Push-to-talk** — press-and-hold the centre button: pointer-down → `onPress`; pointer-up / pointer-leave / pointer-cancel → `onRelease`. (control-panel.tsx:201-204) Live home does not yet bind these handlers.
- **Open notifications** — tap the bell in the header (`HomeHeader`) → `/notifications`. (home-header.tsx:26-35)
- **Open own profile** — tap the avatar in the header → `/profile`. (home-header.tsx:45-54)
- **Live home tile destinations** (from `homeLayers`, only the camp_member + captain layers carry `href`s):
  - camp_member: My Teams → `/members`; My Tasks → `/meals`; My Profile → `/onboarding/questionnaire`; Tools → `/tools`. (page.tsx:104-130)
  - team_lead layer (Team Roster / Team Tasks / Lead Profile / Team Tools): NO `href`s → tiles are non-navigating buttons (no `onQuadrantSelect` wired → effectively inert). (page.tsx:131-153)
  - captain: Camp Management → `/captains/camp-management`; Camp Tasks → (no href); Finances → (no href); Camp Tools → `/captains/tools`. (page.tsx:154-178)
- **(ControlPanelHeader default, unused live)** — auth button → `onAuth`; settings button → `onSettings`. (control-panel.tsx:383-398)

## States & presentations
Mapping to the global-states rows that apply to this surface:
- **Populated** — at least one layer; `layers[active]` resolves; tiles render labels/hints/icons/badges. (control-panel.tsx:115)
- **Empty** — `layers[active]` undefined → `ControlPanel` renders `null` (no built-in empty placeholder). The home page always passes the fixed 3-layer `homeLayers`, so this only occurs with malformed input. (control-panel.tsx:116)
- **Disabled / Captain-only-locked (the headline state here)** — any layer whose `rank` exceeds `rankLevel(viewerRank)` is *visible but locked*: tabs show a `Lock` icon + `aria-label "(locked, view only)"`; tiles render as `aria-disabled` divs at `opacity-45` (ControlPanel) / `opacity-50` + dashed border (ControlGrid) with a `Lock` glyph and no interactivity. This is the brief's visible-but-locked / captain-only-locked contract realised inside the nav. (control-panel.tsx:233, 242, 331-338; control-grid.tsx:76, 100-105, 151-162)
- **Active-tab indicator** — current layer's tab is bold/primary with an underline pill. (control-panel.tsx:247-261)
- **Layer-switch transition** — `cp-layer-in` keyframe: `opacity 0→1`, `scale 0.98→1` over 200ms ease-out, replayed via `key={active}`. (control-panel.tsx:138; globals.css:58-68)
- **Badge state** — quadrant badge renders only when `badge != null && badge !== "" && badge !== 0`; HomeHeader notification badge collapses values `>99` to `"99+"`. (control-panel.tsx:313-314; home-header.tsx:41)
- **Press feedback** — centre button `active:scale-95`; tiles/tabs/header buttons have hover background/colour transitions. (control-panel.tsx:205, 345, 357)
- **Header notification states** — no unread → bell only, `aria-label "Notifications"`, badge hidden; unread → badge + count in aria-label. (home-header.tsx:28-43)
- **Avatar fallback** — photo when `imageUrl` set, else initials. (home-header.tsx:50-53)
- **Submitting / Success / Validation-error** — NOT expressed by this surface; it is pure navigation with no forms. (The upstream gating states — invite-gated, onboarding-incomplete, pending-approval, rejected — are handled by `page.tsx`'s redirect spine BEFORE the panel renders, never inside the panel.) (page.tsx:29-63)

## Enums, options & configurable values
- **`ControlPanelRank`** (UI-local, control-panel.tsx:13): exactly `"camp_member" | "team_lead" | "captain"`. Deliberately separate from the stored two-rank DB enum.
- **`RANK_ORDER`** (control-panel.tsx:16): `["camp_member", "team_lead", "captain"]` — array index = clearance level (0,1,2). `rankLevel()` returns `RANK_ORDER.indexOf(rank)` (control-panel.tsx:31-33).
- **`RANK_LABEL`** (control-panel.tsx:18-22): `camp_member:"Camp Member"`, `team_lead:"Team Lead"`, `captain:"Captain"`.
- **`RANK_TAB_LABEL`** (control-panel.tsx:25-29): `camp_member:"Me"`, `team_lead:"Team Lead"`, `captain:"Captain"` (short tab variant; "Camp Member" doesn't fit).
- **`ControlPanelCorner`** (control-panel.tsx:35): `"tl" | "tr" | "bl" | "br"`.
- **`CORNER_ALIGN`** (control-panel.tsx:269-274): tl `items-start justify-start text-left`; tr `items-end justify-start text-right`; bl `items-start justify-end text-left`; br `items-end justify-end text-right`.
- **`BADGE_CORNER`** (control-panel.tsx:278-283): tl `top-3 left-3`; tr `top-3 right-3`; bl `top-3 left-3`; br `top-3 right-3`.
- **`QUADRANTS`** order array (control-grid.tsx:16-24): `[{tl,topLeft},{tr,topRight},{bl,bottomLeft},{br,bottomRight}]`.
- **Centre defaults** (control-panel.tsx:195-196): label `"TALK"`; icon `<Mic className="h-5 w-5"/>`; aria falls back to label.
- **`ControlPanel` prop defaults**: `viewerRank="camp_member"` (control-panel.tsx:102), `initialLayer=0` (page comment: "personal context", control-panel.tsx:73,103), `title="Camp 404"` (control-panel.tsx:104). `ControlGrid` `viewerRank="camp_member"` (control-grid.tsx:54).
- **Notification badge cap** (home-header.tsx:41): `"99+"` above 99.
- **`homeLayers`** (live nav content, page.tsx:103-179): three layers as listed under User actions. Labels/hints verbatim — camp_member: My Teams/"Your crews", My Tasks/"What's on you", My Profile/"You & your data", Tools/"Meals, expenses…"; team_lead: Team Roster/"Members in your team", Team Tasks/"Assign & track work", Lead Profile/"Your team setup", Team Tools/"Shifts, notices…"; captain: Camp Management/"Roster & statuses", Camp Tasks/"Camp-wide work board", Finances/"Dues & reimbursements", Camp Tools/"Announcements, ops…". Icons used: `Users`, `ListChecks`, `UserRound`, `Wrench` (all `h-5 w-5`). (page.tsx:2, 103-179)
- **`@keyframes cp-layer-in`** params (globals.css:58-68): `opacity 0→1`, `transform scale(0.98)→scale(1)`; applied 200ms ease-out.

## Data model touched
This is a presentation/navigation surface — it takes plain props and touches NO table directly. The live consumer (`page.tsx`) reads these (must agree with unit 29):
- **`users.rank`** — DB `rankEnum("rank")` = `["captain", "member"]`, NOT NULL, default `"member"` (packages/db/src/schema.ts:31, 231). Mapped to `ControlPanelRank` in `page.tsx`: `captain`→`captain`; otherwise team-lead/member decided below.
- **`team_memberships.is_lead`** (DERIVED team-lead) — `isTeamLead(userId)` resolves via `@camp404/db/roster`: a Drizzle `select({ team: teamMemberships.team }).from(teamMemberships).where(and(eq(teamMemberships.userId, userId), eq(teamMemberships.isLead, true))).limit(1)`, returning `rows.length > 0` — NOT a raw `exists(...)` SQL string (packages/db/src/roster.ts:204-217). Drives the `"team_lead"` `viewerRank`. NOTE: the live page does not import this directly — it calls `isTeamLead` via `@/lib/users` (the store wrapper), which returns `false` under E2E. (page.tsx:76)
- **`CampUser`** fields read on home: `id`, `rank`, `displayName`, `profileImageUrl`, plus approval/access checks (`hasCampAccess`, `isApproved`, `getBurnerProfile().completedAt`, `getPendingRequiredActions`) used by the upstream gating spine, not by the panel itself. (page.tsx:39-78)
- Header inputs: `initials` (from `initialsFrom(displayName ?? primaryEmail)`), `profileImageUrl`, unread count from `countUnread(campUser.id)`. (page.tsx:65-92)
- **Component-level interfaces** (props, not persisted): `ControlPanelQuadrant {label, hint?, href?, icon?, badge?: number|string}` (control-panel.tsx:37-46); `ControlPanelLayer {rank, topLeft, topRight, bottomLeft, bottomRight}` (control-panel.tsx:48-55); `ControlPanelCentre {label?, icon?, ariaLabel?, onPress?, onRelease?}` (control-panel.tsx:57-66); `ControlPanelProps` (control-panel.tsx:68-88); `ControlGridProps` (control-grid.tsx:26-39); `QuadrantNavItem {label, href, icon?}` + `QuadrantNavProps` (quadrant-nav.tsx:6-24).

## Validation, edge cases & business rules
- **`initialLayer` clamping** — clamped to `[0, max(layers.length-1, 0)]`; out-of-range values are pulled in-bounds rather than erroring. (control-panel.tsx:90-92, 111-113)
- **Missing active layer** — `layers[active]` undefined → render `null` (no crash, no fallback UI). (control-panel.tsx:116)
- **Lock rule (interaction gate)** — a tile is interactive iff `rankLevel(viewerRank) >= rankLevel(layer.rank)`. The displayed grid uses one `unlocked` boolean (control-panel.tsx:118); the tab bar evaluates lock per-tab (control-panel.tsx:233); `ControlGrid` evaluates per-section (control-grid.tsx:76). Locked tiles never get an `href` or `onClick` wired — even if the quadrant data carries an `href`, the locked branch (a plain `<div>`) is chosen first, so locked links are non-navigable. (control-panel.tsx:331-351)
- **Browsing locked layers is allowed** — tab clicks always switch the active layer regardless of lock; only the tiles are inert. This is intentional ("visible but locked"). (control-panel.tsx:238)
- **Badge truthiness rule** — a quadrant badge is suppressed for `null`/`undefined`/`""`/`0`; any other number or non-empty string shows. (control-panel.tsx:313-314)
- **Notification badge** — suppressed when falsy; capped display `"99+"` for `>99`. (home-header.tsx:36-43)
- **Centre release safety** — `onRelease` is bound to pointer-up AND pointer-leave AND pointer-cancel, so a hold that drifts off the button or is interrupted still releases (no stuck-recording). (control-panel.tsx:202-204) `QuadrantNav`'s centre omits `onPointerCancel` (looser). (quadrant-nav.tsx:55-57)
- **Rank-model decoupling** — the UI's three-tier `ControlPanelRank` is intentionally NOT the DB's two-rank enum; `team_lead` exists only in the UI layer and is derived at the call site (`page.tsx`) from `is_lead`, never stored. Comments flag this is "kept separate until that derivation is settled." (control-panel.tsx:7-13; schema.ts:454 comment notes a future `users.rank='team_lead'` that does NOT exist today.)
- **Auth-button label fallback** — `ControlPanelHeader` shows `"Sign in"` when `userName` is absent. (control-panel.tsx:389)
- **Accessibility** — decorative icons/badges use `aria-hidden`; tabs expose `aria-pressed` + descriptive `aria-label`; locked tiles use `aria-disabled="true"`; centre/header buttons carry explicit `aria-label`s. (throughout)

## Sub-components / variants
**ControlPanel (LIVE, control-panel.tsx):** `ControlPanel` (root) · `ControlPanelHeaderBar` · `CentreButton` · `LayerTabBar` · `QuadrantTile` (three modes: locked div / `<a>` / `<button>`) · `ControlPanelHeader` (exported default-header helper — only consumed by `control-grid.stories.tsx`, NOT by the live app, which substitutes `HomeHeader`). Exported rank model: `ControlPanelRank`, `RANK_ORDER`(internal), `RANK_LABEL`, `RANK_TAB_LABEL`(internal), `rankLevel`.

**ControlGrid (STORYBOOK-ONLY / DEAD, control-grid.tsx):** `ControlGrid` (root) · `ControlGridSection` · `GridTile` (locked dashed div / `<a>` / `<button>`). Desktop all-layers-at-once reflow of the same props. NOT imported by any app route — its SOLE importer is `control-grid.stories.tsx:13` (parity with the `QuadrantNav` v0/unused caveat below). **Drops the per-quadrant `badge`** that `ControlPanel` supports. Flag: dead/orphaned in production (Storybook-only).

**QuadrantNav (DEAD/ORPHANED v0, quadrant-nav.tsx):** `QuadrantNav` (root) · `QuadrantTile` (always `<a>`). Single-layer, no rank/lock/badge, content aligned toward centre, centre PTT omits `onPointerCancel`. Explicitly "Superseded by `ControlPanel`… kept for reference." Only referenced by `quadrant-nav.stories.tsx`. Flag: dead/orphaned.

**Stories (Storybook-only, not shipped):** `control-panel.stories.tsx` demonstrates `CampMember`/`TeamLead`/`Captain`/`LockedLayer` variants and a `DemoHeader`; `control-grid.stories.tsx` (uses `ControlPanelHeader`); `quadrant-nav.stories.tsx` (`Default`). These illustrate states but are not part of the runtime surface.

**Centre push-to-talk note:** the PTT centre is a confirmed feature of all three components, but on the live home screen its `onPress`/`onRelease` are not wired (`centre={{ label: "TALK" }}` only) — a restyle must preserve the press-and-hold button and its pointer-event contract so the eventual voice pipeline (unit on the voice pipeline) can attach to it.

---

# 20 — Questionnaire field renderer — all question kinds

**Files covered:**
- `apps/web/components/questionnaire/question.tsx` — the field renderer: `QuestionField` (label/helper/error wrapper) + `FieldInput` (per-kind `switch`) + three local sub-renderers `ToggleField`, `ScaleField`, `LongTextField`.
- `packages/types/src/questionnaire.ts` — the Zod schema + TypeScript types for every question kind (the discriminated union), the response value/map types, and the pure helpers `flattenQuestions`, `displayResponseValue`, `diffResponses`, `validateResponses`, `validateOne`.
- `apps/web/lib/questionnaire.ts` — the concrete burner-profile catalogue (`QUESTIONNAIRE`, `version: "2026.05.29-v8"`): the real instances of every kind, with literal options/steps/ranges. Defines `COUNTRY_OPTIONS`, `TEAMS`, `DIETARY_INGREDIENTS`.
- `apps/web/lib/id-validation.ts` — cross-field validator for the `id.number` `short_text` field (SA-ID Luhn / passport regex), invoked by the wizard, not by the renderer itself.
- `packages/ui/src/components/combobox.tsx` — the `Combobox` primitive used by the `combobox` kind (Popover + cmdk filterable list).
- `packages/ui/src/components/slider.tsx` — the Radix `Slider` primitive used by `slider` and `scale` kinds (horizontal + vertical orientation).
- `apps/web/components/profile/avatar-upload.tsx` — the `AvatarUpload` control used by the `image` kind (circular uploader → `/api/uploads/avatar`).
- `apps/web/components/voice/recorder-panel.tsx` — the dictation panel embedded in `long_text` (full voice pipeline is unit 21; covered here only as the host-field touchpoint).
- `apps/web/components/questionnaire/wizard.tsx` — the consumer; decides `fullScreen`, runs local per-page validation, drives `onChange`/`error` props (full wizard is unit 04; covered here only where it shapes renderer behaviour).

**Purpose:** Render any one questionnaire `Question` as the correct input control given its `kind`, surface its prompt/helper/required marker/error, emit a typed `QuestionnaireResponseValue` on change, and define the per-kind data shape, options, ranges, and validation. This is the polymorphic field unit shared by the onboarding wizard (04) and the form-replay flow (12). Exactly **10 question kinds** exist: `slider`, `single_select`, `multi_select`, `short_text`, `long_text`, `date`, `scale`, `toggle`, `combobox`, `image`.

## Features

### `QuestionField` wrapper (question.tsx:43-85)
- Computes a stable field id `fieldId = \`q-${question.id}\`` (question.tsx:50).
- Renders a `<Label htmlFor={fieldId}>` containing `question.prompt` (question.tsx:60-61).
- Required marker: when `"required" in question && question.required`, appends a primary-coloured `*` span, gapped via `ml-1` (`ml-1 text-[color:var(--color-primary)]`) (question.tsx:62-64). Note `long_text`, `multi_select`, `image` default to `required: false`, so they only show `*` if explicitly required.
- Optional helper line: if `question.helper` is set, renders a muted `<p class="text-xs">` (question.tsx:66-70).
- Delegates the actual control to `FieldInput` (question.tsx:71-77), passing `id`, `question`, `value`, `onChange`, `fullScreen`.
- Error line: if `error` prop is set, renders `<p class="text-xs text-destructive" role="alert">{error}</p>` (question.tsx:78-82).
- `fullScreen` prop: a page-level hint that this question owns the viewport (single `scale`, single `long_text`, single `image`). When true the wrapper uses `flex flex-1 flex-col gap-2` instead of `flex flex-col gap-2` (question.tsx:53-58, 35-41).

### `FieldInput` per-kind switch (question.tsx:87-242)
A `switch (question.kind)` with one arm per kind. All arms read `value` defensively (type-guard against the union) and call `onChange` with the kind-appropriate value:

- **`slider`** (question.tsx:101-127): `current = typeof value === "number" ? value : question.min` — defaults to `min` when untouched ("most honest 'no preference' position"). Renders `<Slider>` with `value={[current]}`, `min/max/step` from the question; `onValueChange={(v) => onChange(v[0] ?? current)}`. Below it a 3-up row shows `minLabel ?? min`, the live `current` value (`aria-live="polite"`, bold foreground), and `maxLabel ?? max`.
- **`single_select`** (question.tsx:128-145): shadcn `Select`. `value={typeof value === "string" ? value : undefined}`, `onValueChange={onChange}`. Trigger placeholder `"Choose one…"`. Maps `question.options` → `<SelectItem value={o.value}>{o.label}</SelectItem>`.
- **`multi_select`** (question.tsx:146-174): builds `selected = new Set(value as string[])` when `value` is an array, else empty set. Renders one `Checkbox` + `Label` per option (``checkboxId = `${id}-${o.value}` ``). On check toggle it copies the set, adds/deletes `o.value`, and `onChange(Array.from(next))`. Add only on `checked === true`; otherwise delete (the `"indeterminate"` checkbox state falls into the delete branch).
- **`short_text`** (question.tsx:175-183): `<Input maxLength={question.maxLength} value={typeof value==="string"?value:""} onChange=… />`.
- **`long_text`** (question.tsx:184-193): delegates to `LongTextField` (textarea + dictation; see Sub-components).
- **`date`** (question.tsx:194-202): `<Input type="date" value={…} onChange=… />` — native date picker; emits ISO `yyyy-mm-dd`.
- **`scale`** (question.tsx:203-211): delegates to `ScaleField`. `value={typeof value === "string" ? value : undefined}`.
- **`toggle`** (question.tsx:212-220): delegates to `ToggleField` (segmented control).
- **`combobox`** (question.tsx:221-231): `<Combobox options={question.options} value=… onChange={onChange} placeholder={question.placeholder ?? "Select…"} searchPlaceholder={question.searchPlaceholder ?? "Search…"} />`.
- **`image`** (question.tsx:232-240): centred container `flex flex-1 flex-col items-center justify-center py-4` wrapping `AvatarUpload`. `value={typeof value === "string" ? value : null}`, `onChange={(url) => onChange(url)}` (url can be `null` on remove).

The `switch` has no `default` arm — exhaustive over the 10 kinds (TS discriminated union guarantees coverage). If an unknown kind ever appeared, `FieldInput` returns `undefined` (renders nothing).

### Pure response helpers (packages/types/src/questionnaire.ts)
- **`flattenQuestions(questionnaire)`** (packages/types/src/questionnaire.ts:224-230): concatenates all `questions` from `kind:"questions"` pages, skipping `intro` pages. Used for diffing / resolving a field id → question.
- **`displayResponseValue(question, value)`** (packages/types/src/questionnaire.ts:239-266): renders a stored value as the human-readable string. `undefined | null | ""` → `EMPTY_DISPLAY = "—"`. For `single_select | toggle | combobox` resolves the option `label` (falls back to `String(value)` for unknown). For `scale` resolves the step `label`. For `multi_select`: empty/non-array → `"—"`, else maps each value to its option label (fallback raw) and joins with `", "`. Default arm: arrays join with `", "`, else `String(value)`.
- **`diffResponses(questionnaire, before, after)`** (packages/types/src/questionnaire.ts:298-316): per question (in catalogue order) compares via `sameValue`; emits `QuestionnaireFieldChange { fieldId, label: q.prompt, from: display(before), to: display(after) }`. Stale keys not in the catalogue are ignored.
- **`sameValue`** (packages/types/src/questionnaire.ts:277-289): empty↔empty equal (via `isEmptyValue`); arrays compared as **sorted sets** (re-ordering is not a change); else strict `===`.
- **`isEmptyValue`** (packages/types/src/questionnaire.ts:268-275): `undefined | null | "" | []` are all empty.

### Server/wizard-side validation
- **`validateResponses`** (packages/types/src/questionnaire.ts:324-352) and **`validateOne`** (packages/types/src/questionnaire.ts:354-436): the authoritative per-kind validators (see Validation section). The wizard runs a lighter local pre-check (`validatePageLocally`, wizard.tsx:79-101) before advancing.

## User actions & interactions

- **slider**: drag thumb or keyboard-arrow to set an integer in `[min,max]` by `step`; live value echoed in centre label. Untouched → reads as `min`.
- **single_select**: open dropdown, pick one option (closes on select). Placeholder `"Choose one…"` until chosen.
- **multi_select**: tap each checkbox independently to add/remove; any number including zero. Re-tapping removes.
- **short_text**: type free text up to `maxLength` (native `maxLength` cap on the input).
- **long_text**: type in the textarea (up to `maxLength`), OR tap **"Dictate instead"** (Mic icon) to reveal the `RecorderPanel`; each completed transcript **appends** to existing text (joined with `\n` if needed), capped to `maxLength`; can mix typing + dictation; close dictation via its X (disabled while recording/busy).
- **date**: use the native date picker to select a calendar date → `yyyy-mm-dd`.
- **scale**: drag the vertical slider (mobile) or horizontal slider (desktop) across discrete labelled steps; the value is the selected step's `value`. Default position when untouched is the middle step (`Math.floor(steps.length/2)`).
- **toggle**: tap one segment of the segmented control (`role="radio"` within `role="radiogroup"`). Single selection; tapping another switches.
- **combobox**: open popover, type to filter (cmdk fuzzy filter on the option `label`), tap a row to select (closes); `Check` icon marks the current selection; `"Nothing found."` when filter matches nothing.
- **image**: tap the circular dropzone or the text button to open the OS file picker (`accept="image/*"`); the image is cropped/resized to a square in-browser and uploaded; tap the red X to remove (sets value `null`).
- The wizard's "Next"/"Skip"/"Finish" buttons (not in this unit) trigger validation; on a returned per-field error, the renderer surfaces it under the field (`error` prop). Editing a field clears its error in the wizard's `setResponse` (wizard.tsx:69-77).

## States & presentations

Renderer-local and inherited global-states that apply to this surface:

- **Empty**: every kind renders an unfilled control. `slider`→`min`; `single_select`→`"Choose one…"`; `multi_select`→all unchecked; text→`""`; `date`→empty native field; `scale`→middle step highlighted (not committed); `toggle`→no segment `aria-checked`; `combobox`→placeholder; `image`→dashed-border "Add photo" dropzone.
- **Populated**: controls reflect `value`; `single_select/toggle/combobox` show resolved labels; `multi_select` shows checked boxes; `image` shows the photo with a remove X.
- **Validation-error**: `error` prop renders `text-xs text-destructive role="alert"` under the field (question.tsx:78-82). Per-kind error strings come from `validateOne`/`validatePageLocally`/`validateIdNumber` (see Validation). Page-level `_form`/`_root` errors render in the wizard banner, not here.
- **Submitting / pending**: the wizard's `isPending` (React `useTransition`) disables Back/Next; the renderer fields themselves are NOT disabled mid-submit. `image` has its own `uploading` state (spinner overlay, button disabled, text `"Uploading…"`) (avatar-upload.tsx:100-104, 129). `long_text` dictation has `requesting`/`recording`/`processing`/`error` states (recorder-panel.tsx:59-68).
- **Success**: not expressed in the renderer; the wizard advances or `onComplete` fires. `image` success = the uploaded photo renders in the circle.
- **Disabled**: the `Combobox` primitive accepts `disabled` but the renderer never passes it. `AvatarUpload` buttons disable while `uploading`. The renderer does not otherwise expose a per-field disabled state.
- **fullScreen presentation** (wizard.tsx:149-155): a page is `fullScreen` when `kind==="intro"`, OR a single-question `questions` page whose only question is `scale`, `long_text`, or `image`. This flips `scale` to its `70dvh` vertical layout, lets `long_text` grow (`min-h-[40dvh] flex-1`, no fixed rows), and centres `image` (already centred regardless).
- **Skip vs Next** (wizard.tsx:160-172): a lone optional question with no current answer shows the button label `"Skip"` instead of `"Next"`. This is wizard behaviour, not renderer, but governs how optional single-question pages (profile photo, ideas, bio is required so not skippable) read.
- **Gating states** (invite-gated, onboarding-incomplete, pending-approval, rejected, captain-only-locked): NOT expressed by this renderer — they gate whether the wizard mounts at all (app/page.tsx gating spine). The renderer is rank-agnostic and has no locked variant.

## Enums, options & configurable values

### Question-kind discriminant (packages/types/src/questionnaire.ts:137-149)
`"slider" | "single_select" | "multi_select" | "short_text" | "long_text" | "date" | "scale" | "toggle" | "combobox" | "image"` — exactly 10, via `z.discriminatedUnion("kind", […])`.

### Per-kind schema fields & defaults (packages/types/src/questionnaire.ts)
Every kind has `id: string.min(1)`, `kind` literal, `prompt: string.min(1)`, `helper?: string`.
- **SliderQuestion** (7-19): `min: number`, `max: number`, `step: number.positive().default(1)`, `minLabel?`, `maxLabel?`, `required: boolean.default(true)`.
- **SingleSelectQuestion** (21-31): `options: array({value:string.min(1), label:string.min(1)}).min(2)`, `required.default(true)`.
- **MultiSelectQuestion** (33-43): same `options.min(2)`, `required.default(false)`.
- **ShortTextQuestion** (45-53): `maxLength: number.int().positive().default(120)`, `required.default(true)`.
- **LongTextQuestion** (55-63): `maxLength: number.int().positive().default(1000)`, `required.default(false)`.
- **DateQuestion** (66-73): no extra config; `required.default(true)`. ISO `yyyy-mm-dd`, backed by `<input type="date">`.
- **ScaleQuestion** (78-90): `steps: array({value, label}).min(2)` (ordered top→bottom for mobile), `required.default(true)`.
- **ToggleQuestion** (96-106): `options.min(2)`, `required.default(true)`. Same data shape as single_select; segmented-control render. Comment: intended for small sets (2–4).
- **ComboboxQuestion** (111-123): `options.min(2)`, `placeholder?`, `searchPlaceholder?`, `required.default(true)`.
- **ImageQuestion** (128-135): no extra config; `required.default(false)`. Stored value = public image URL (Vercel Blob in prod).

### Page kinds (packages/types/src/questionnaire.ts:153-177)
- `QuestionsPage` (153-160): `id`, `kind:"questions"`, `title`, `subtitle?`, `questions: array(Question).min(1)`.
- `IntroPage` (165-171): `id`, `kind:"intro"`, `heading`, `body`. No questions, no validation. (Rendered by the wizard, not this unit.)
- `Questionnaire` (179-183): `version: string.min(1)`, `pages: array(QuestionnairePage).min(1)`.

### Response value union (packages/types/src/questionnaire.ts:187-202)
`QuestionnaireResponseValue = number | string | string[] | boolean | null`. `QuestionnaireResponses = Record<string, QuestionnaireResponseValue>`. NOTE: `boolean` is in the union but **no current kind emits a boolean** — slider→`number`, multi_select→`string[]`, image→`string|null`, all others→`string`. (Likely vestigial / future-proofing.)

### Catalogue literal values (apps/web/lib/questionnaire.ts) — the real instances
- **`version: "2026.05.29-v8"`** (apps/web/lib/questionnaire.ts:60).
- **TEAMS** (8 values, 30-39): `kitchen`/Kitchen, `structures`/Structures, `power_and_lighting`/"Power & Lighting", `sanitation_and_water`/"Sanitation & Water", `health_and_safety`/"Health & Safety", `art_and_activities`/"Art & Activities", `ministry_of_memes`/"Ministry of Memes", `ministry_of_vibes`/"Ministry of Vibes". Reused for the 8 team-interest sliders (id `team_interest.<value>`) and the `team_lead.interests` multi_select.
- **DIETARY_INGREDIENTS** (12 values, 44-57): `dairy`/"Dairy / lactose", `gluten`/"Gluten / wheat", `eggs`/Eggs, `soy`/Soy, `peanuts`/Peanuts, `tree_nuts`/"Tree nuts", `shellfish`/Shellfish, `fish`/Fish, `sesame`/Sesame, `alliums`/"Onion / garlic", `nightshades`/"Nightshades (tomato, pepper, aubergine)", `spicy`/"Chilli / heat". Reused for `dietary.dislikes` and `dietary.allergies`.
- **COUNTRY_OPTIONS** (6-9): each ISO 3166-1 alpha-2 country (199 entries in `apps/web/lib/countries.ts`) mapped to `{ value: c.value, label: \`${countryFlag(c.value)} ${c.label}\` }` — flag emoji prefixed; stored value is the alpha-2 code. ZA pinned top.
- **slider ranges** (team interests, 179-189): `min:0, max:5, step:1, minLabel:"Not for me", maxLabel:"Sign me up", required:false`.
- **scale steps — cooking** (201-206): `create`/"Good cook — I can create recipes", `teach`/"Adequate — I can teach recipes", `follow`/"I can follow recipes", `burn`/"I might burn recipes".
- **scale steps — hardware** (222-227): `design`, `build`, `assist`, `novice` (labels per file).
- **scale steps — intent.this_year** (338-345): `definite`/"100% coming", `want`, `try`, `unsure`, `unlikely`, `not_coming` (6 steps).
- **toggle id.type** (113-118): `passport`/Passport, `sa_id`/"South African ID".
- **single_select logistics.driving** (251-255): `yes`/Yes, `no`/No, `maybe`/"Maybe — still working it out".
- **single_select logistics.onsite_before** (262-266): `yes_full`, `yes_partial`, `no`.
- **single_select logistics.onsite_after** (273-277): `yes_full`, `yes_partial`, `no`.
- **multi_select history.camp404_years** (294-301): `2019,2022,2023,2024,2025,2026`.
- **single_select history.afrikaburn_count** (308-313): `0`/"None — first one", `1_2`/"1–2", `3_5`/"3–5", `6_plus`/"6 or more".
- **short_text maxLengths**: `phone`=40 (97), `id.number`=40 (126).
- **long_text maxLengths**: `bio.statement`=2000 (145), `ideas.this_year`=2000 (163), `history.other_burns`=1000 (323), `dietary.notes`=1000 (381).
- **image required:false** (`profile.image`, 70-75).
- **`EMPTY_DISPLAY = "—"`** (packages/types/src/questionnaire.ts:232).

### Recorder / dictation constants (voice; adjacency)
- `RecorderPanel promptKey="questionnaire"` passed from `LongTextField` (question.tsx:460).
- Recorder states `idle | requesting | recording | processing | error` (use-voice-recorder.ts:5-10); `maxDurationMs` default `120_000`; status labels "Allow microphone…", "Transcribing…", "Recording", "Tap to retry", "Tap to record"; mm:ss timer; posts to `/api/voice/transcribe`.

### Slider primitive defaults (slider.tsx:8-15)
`min=0`, `max=100` defaults; vertical orientation `min-h-44`; thumb `size-4`.

## Data model touched

- **`burner_profiles` table** (schema.ts:352-364): `userId` (PK, FK→users, cascade), `version: text notNull`, **`responses: jsonb<Record<string,unknown>> notNull default({})`** — the flat map keyed by `question.id`; `startedAt`, `completedAt?`, `updatedAt`. One row per user; persists across the yearly reset. The catalogue lives in code and is versioned so historical responses stay renderable (`burner_profiles.version`).
- **Response keys are exactly the catalogue question `id`s**, e.g. `profile.image`, `birthday`, `phone`, `country`, `id.type`, `id.number`, `bio.statement`, `ideas.this_year`, `team_interest.<team>` (×8), `competency.cooking`, `competency.hardware`, `team_lead.interests`, `logistics.driving`, `logistics.onsite_before`, `logistics.onsite_after`, `history.camp404_years`, `history.afrikaburn_count`, `history.other_burns`, `intent.this_year`, `dietary.dislikes`, `dietary.allergies`, `dietary.notes`. (Question ids are always dotted/namespaced so they never collide with the reserved `_form`/`_root` error keys — wizard.tsx:16-20.)
- **PII split-out** (apps/web/lib/questionnaire.ts:16-23): `id.number` is removed from `responses` at every write boundary and stored encrypted on `users` as `passport_encrypted` / `sa_id_encrypted` (schema.ts:241-242), keyed off `id.type`. `id.type` is NOT sensitive and stays in `responses`. `birthday` deliberately stays in `responses` (not in the encrypted-PII class). This is enforced at the write boundary (server action), not in the renderer.
- **`image` value** is the public URL string returned by `/api/uploads/avatar` (avatar-upload.tsx:60-61); stored as a plain string in `responses`.
- **Change log** (`QuestionnaireFieldChange`, packages/types/src/questionnaire.ts:211-219): `{ fieldId, label (prompt at edit time), from, to }` — `from`/`to` are human-readable display values. Persisted by the replay flow (form-edit log table, unit 12); produced by `diffResponses`.

## Validation, edge cases & business rules

### `validateOne` per kind (packages/types/src/questionnaire.ts:354-436)
Missing = `raw === undefined || null || ""` (354-360). If missing & `required` → `"This question is required"`; if missing & optional → `{ ok:true, value: undefined }` (dropped from `responses`).
- **slider**: must be a `number` & not NaN (`"Expected a number"`); must be `>= min && <= max` else `"Must be between ${min} and ${max}"`.
- **single_select**: must be `string` (`"Expected a choice"`); must be a known option value else `"Not a valid option"`.
- **multi_select**: must be `string[]` (`"Expected a list of choices"`); filters to allowed values (drops unknowns silently); if `required && filtered.length===0` → `"Pick at least one option"`. Returns the filtered array.
- **short_text / long_text**: must be `string` (`"Expected text"`); `length > maxLength` → `"Max ${maxLength} characters"`.
- **date**: must be `string` (`"Expected a date"`); strict regex `/^\d{4}-\d{2}-\d{2}$/` else `"Use yyyy-mm-dd"`; `Date.parse` must succeed else `"Not a real date"`. (EDGE CASE — source bug, see verification report §6: `Date.parse` is lenient on day-of-month overflow, so an impossible calendar date such as `2026-02-31` passes validation — the regex only enforces shape, and `Date.parse` rolls the overflow into the next month rather than rejecting it.)
- **scale**: must be `string` (`"Pick a level"`); must be a known step value else `"Not a valid level"`.
- **toggle**: same as single_select (`"Expected a choice"` / `"Not a valid option"`).
- **combobox**: same as single_select (`"Expected a choice"` / `"Not a valid option"`).
- **image**: must be a `string` (`"Expected an image URL"`) — NO URL/format validation; any string is accepted.

### `validateResponses` (packages/types/src/questionnaire.ts:324-352)
- First `QuestionnaireResponses.safeParse(raw)`; on failure → `{ ok:false, errors: { _root: "Malformed response payload" } }`.
- Iterates pages (skips `intro`), validates each question, collects per-question errors keyed by `q.id`; only sets `responses[q.id]` when value is not `undefined`. Returns all errors if any. **Unknown response keys are dropped** (a question may have been removed in a later catalogue version).

### Wizard local pre-validation (`validatePageLocally`, wizard.tsx:79-101)
- Intro pages always pass.
- Per question on the page: required-and-missing → `"This question is required"`.
- **Cross-field rule (id.number)**: if `q.id === "id.number"` and a non-empty string, runs `validateIdNumber(responses["id.type"], value)`; on failure sets the field error. This is the only cross-field validation in the flow.

### `validateIdNumber` (id-validation.ts:25-102)
- Trims; empty → `"Document number is required"`.
- `type === "passport"`: regex `/^[A-Z0-9]{6,12}$/i` (alphanumeric 6–12); fail → `"Letters and digits only — typically 6–12 characters."`.
- `type === "sa_id"`: must match `/^\d{13}$/` (`"Must be exactly 13 digits."`); first 6 digits must be a plausible YYMMDD (month 1–12, day 1–31) else `"First six digits aren't a valid YYMMDD date."`; SA-specific Luhn variant (odd 1-based positions summed directly; even positions concatenated, ×2, digit-summed; check digit `(10 - total%10)%10`) else `"Check digit doesn't match — double-check the number."`.
- Neither type chosen → `"Pick the ID document type first"`.
- EDGE CASE — source bug, see verification report §6: `validateIdNumber` (SA-ID Luhn + passport regex) is NOT called by `validateOne`. Server-side, `id.number` is validated only as a `short_text` (must be a string, `length <= 40`) — the SA-ID/passport rule is **client/wizard-only**, so an invalid or malformed document number that is ≤ 40 characters passes server validation and is persisted.

### Renderer edge cases
- **slider untouched** reads as `min` but is only committed on interaction; `onChange(v[0] ?? current)` guards an empty thumb array.
- **scale untouched**: highlights the middle step `Math.floor(steps.length/2)` but does not commit a value until the slider moves; mobile slider axis is inverted (`sliderValue = steps.length-1-currentIndex`) so top label = highest value.
- **multi_select**: `"indeterminate"` checkbox state (anything other than literal `true`) falls into the delete branch (question.tsx:159-162).
- **long_text appendTranscript** (question.tsx:433-439): trims transcript; no-op if empty; joins with `"\n"` only when existing text doesn't already end in whitespace/newline (`/\n\s*$/`); result sliced to `maxLength`.
- **image**: `onChange(null)` on remove; the renderer coerces `null` value back to `null` for `AvatarUpload`. Upload errors are shown inside `AvatarUpload` (its own `error` state), not via the field `error` prop.
- **date** uses the native picker, so locale formatting is the browser's; the stored/validated form is always `yyyy-mm-dd`.

## Sub-components / variants

- **`ToggleField`** (question.tsx:249-288): segmented control. `role="radiogroup"` container; one `<button role="radio" aria-checked>` per option, equal-width (`flex-1`). Selected = primary bg + primary-foreground; others = muted text. Wraps to multiple rows if a label is long. Used by `toggle` kind.
- **`ScaleField`** (question.tsx:297-403): dual layout. **Mobile** (`md:hidden`, `h-[70dvh]`): 3-col grid `[1fr_auto_1fr]` — empty left gutter (reserved for "future secondary label set"), centred **vertical** `Slider`, right `<ol>` of step labels distributed top→bottom (`aria-hidden`). **Desktop** (`hidden md:block`): horizontal `Slider` with labels above each tick in a `repeat(N,minmax(0,1fr))` grid, rendered `[...steps].reverse()`. Value is the step `value`; slider axis is index-inverted. Used by `scale` kind.
- **`LongTextField`** (question.tsx:418-477): textarea (default `rows={6}`, or `min-h-[40dvh] flex-1 resize-none` when `fullScreen`) + on-demand dictation. Local `dictating` boolean toggles between a `"Dictate instead"` outline button (Mic icon) and the `RecorderPanel`. `appendTranscript` appends each transcript to the textarea (capped to `maxLength`). `promptKey="questionnaire"`. Used by `long_text` kind. (Voice pipeline internals = unit 21.)
- **`Combobox`** (combobox.tsx:41-114): Popover-anchored cmdk filterable single-select. Trigger is an outline `Button role="combobox"` showing selected label or placeholder + `ChevronsUpDown`; content is `CommandInput` + `CommandList` + `CommandEmpty` (`emptyMessage` default `"Nothing found."`) + `CommandGroup` of `CommandItem`s (filtered by `o.label`); selected row shows `Check`. Accepts a `disabled` prop the renderer never sets. Used by `combobox` kind.
- **`AvatarUpload`** (avatar-upload.tsx:24-147): large circular (`h-40 w-40`) dashed dropzone; opens file picker (`accept="image/*"`); crops/resizes to square in-browser (`cropResizeToSquare`); POSTs `multipart/form-data` (`image` field) to `/api/uploads/avatar`; shows local object-URL preview then stored URL; remove X sets `null`; own `uploading`/`error`/`preview` states. Used by `image` kind.
- **`Slider`** (slider.tsx:8-61): Radix slider wrapper supporting horizontal + vertical (`orientation`) and multi-thumb (renders one thumb per value). Used by both `slider` and `scale` kinds.

**No dead/orphaned variants found.** All 10 kinds in the discriminated union are rendered by `FieldInput` and validated by `validateOne`; all are instantiated in the live catalogue. The only vestigial element is the `boolean` member of `QuestionnaireResponseValue` (no kind emits it) and the empty left gutter in `ScaleField`'s mobile grid (explicitly "reserved for a future secondary label set").

---

# 21 — Voice dictation pipeline

**Files covered:**
- `apps/web/components/voice/recorder-panel.tsx` — the in-use UI surface: bordered dictation panel with a big circular record button, live waveform, mm:ss timer, status label, dismiss/close, error line. The ONLY voice component actually mounted anywhere.
- `apps/web/components/voice/dictate-button.tsx` — an alternative compact "vertical dictation column" variant (small Button + waveform). **Orphaned / dead — no consumers** (`grep` of `apps/web` finds zero imports outside its own file).
- `apps/web/components/voice/waveform.tsx` — canvas-based time-domain waveform painter; reads an `AnalyserNode` per animation frame. Pure affordance ("the mic is hearing you"); bytes never leave the canvas.
- `apps/web/components/voice/use-voice-recorder.ts` — the cross-browser `MediaRecorder` state machine hook: permission → record → stop → POST → transcript callback; owns the `RecorderState` enum, MIME selection, timeout cap, analyser wiring, cleanup.
- `apps/web/app/api/voice/transcribe/route.ts` — Node-runtime POST route: auth gate, dual rate-limit (user + IP), multipart parse, file-type/size validation, promptKey allow-listing, calls Groq, sanitises error leakage.
- `apps/web/lib/groq.ts` — lazy Groq SDK client + `transcribeAudio(file, {prompt})` wrapper around Whisper Large v3 Turbo.
- `apps/web/lib/voice-prompts.ts` — exports `QUESTIONNAIRE_PROMPT`, the single Whisper domain-biasing string (camp jargon / names / numerals).
- (Supporting, read for completeness) `apps/web/lib/rate-limit.ts` — in-memory token-bucket `rateLimit()` + `getClientIp()`; `apps/web/components/questionnaire/question.tsx` (`LongTextField`, lines 414–477) and `apps/web/components/feedback/report-bug-dialog.tsx` (lines 75–83, 213–220) — the two **consumers** of `RecorderPanel`; `packages/types/src/questionnaire.ts` (`LongTextQuestion`, line 55) — host-field schema.

**Purpose:** Let a member dictate free-form prose into a long-text host field instead of typing on a phone in the desert. The user opts into dictation, holds/taps to record audio in the browser via `MediaRecorder`, sees a live waveform + elapsed timer, then on stop the clip is uploaded to `/api/voice/transcribe`, transcribed by Groq's Whisper Large v3 Turbo (optionally biased by a server-known prompt keyed by `promptKey`), and the returned text is **appended** (never replacing) to the host field, trimmed and clamped to that field's max length. The pipeline is purely browser-Web-Audio + a thin server transcription endpoint; there is no client data layer, no persistence of audio, and no offline support.

## Features

### RecorderPanel (recorder-panel.tsx) — the live dictation surface
- Bordered card panel (`rounded-md border ... bg-[color:var(--color-card)] p-4`) that appears **below** a text input once the user opts into dictation (recorder-panel.tsx:75–76).
- Header row: a **status label** (left) + a **ghost "Close dictation" X button** (right) (recorder-panel.tsx:77–89). The X is `disabled` while `isRecording || isBusy` so you can't dismiss mid-capture (recorder-panel.tsx:85).
- Big **circular primary record button** (`h-16 w-16 rounded-full`), centred (recorder-panel.tsx:90–108):
  - Variant flips to `destructive` while recording, else `default` (recorder-panel.tsx:94).
  - Icon: `Loader2` spinner when busy → `Square` (filled) when recording → `Mic` when idle (recorder-panel.tsx:100–106).
  - `disabled` while `isBusy` (processing/requesting) (recorder-panel.tsx:96).
  - `aria-label` "Stop recording" / "Start recording" (recorder-panel.tsx:98).
- **Live waveform** rendered between button and timer (recorder-panel.tsx:109).
- **mm:ss elapsed timer** shown **only while recording**, mono font, muted colour (recorder-panel.tsx:110–114).
- **Error line** (`role="alert"`, destructive colour) when an error string is present (recorder-panel.tsx:115–122).
- **Panel stays open after each completed recording** so the user can record again without re-tapping "Dictate instead" (documented behaviour, recorder-panel.tsx:18–25).
- Props: `onTranscript(text)`, `onDismiss()`, optional `promptKey` (recorder-panel.tsx:9–16).

### DictateButton (dictate-button.tsx) — ORPHANED VARIANT
- A `w-24` vertical column: a small `size="sm"` shadcn Button (outline / destructive when recording) with a waveform beneath and a `10px` error line (dictate-button.tsx:59–88).
- Same `useVoiceRecorder` wiring, same tap-to-start/tap-to-stop/tap-to-reset behaviour (dictate-button.tsx:39–46).
- Button text label states: "Allow mic" / "Transcribing" / "Stop" / "Try again" / "Dictate" (dictate-button.tsx:48–57).
- `aria-pressed={isRecording}` (dictate-button.tsx:69). Props: `onTranscript`, optional `promptKey`, optional `className`.
- **DEAD: not imported by any file in `apps/web`.** Behaviour duplicates RecorderPanel in compact form. Restyle/keep at designer's discretion, but it ships unmounted today.

### Waveform (waveform.tsx)
- `<canvas>` (`h-6 w-full`, `aria-hidden`), `opacity-40` when not active (waveform.tsx:86–96).
- On effect: sets canvas pixel dims to `clientWidth/Height * devicePixelRatio`, scales ctx by dpr (waveform.tsx:29–33).
- Allocates a `Uint8Array(analyser.fftSize)` byte buffer (waveform.tsx:36).
- **Idle paint** (`drawIdle`): a single flat centre line at `clientHeight/2`, stroke = canvas `color` mixed 25% into transparent, lineWidth 1 (waveform.tsx:38–48).
- **Active paint** (`draw`): per `requestAnimationFrame`, reads `getByteTimeDomainData`, clears, strokes a wave; lineWidth 1.5; stroke = computed `color` (the element carries `text-[color:var(--color-primary)]`, so the wave is hot-magenta primary) (waveform.tsx:50–75, 91).
- Sample mapping: `v = (buffer[i] ?? 128) / 128.0` → 0..2 centred on 1; `y = v*clientHeight/2`; x advances by `clientWidth / buffer.length` (waveform.tsx:64–72).
- Animates only when `active && analyser`; otherwise paints one idle frame (waveform.tsx:77–81). Cleans up via `cancelAnimationFrame` (waveform.tsx:83).

### useVoiceRecorder (use-voice-recorder.ts) — recorder state machine
- `start()` (use-voice-recorder.ts:100–165):
  - Guard: no-op if already `recording` or `requesting` (use-voice-recorder.ts:101).
  - Clears error, sets `requesting` (use-voice-recorder.ts:102–103).
  - `getUserMedia({audio: {echoCancellation:true, noiseSuppression:true, autoGainControl:true}})` (use-voice-recorder.ts:109–115).
  - Builds Web Audio graph: `AudioContext` (with `webkitAudioContext` fallback) → `createMediaStreamSource` → `createAnalyser` with `fftSize = 1024` → exposes the node as `analyser` (use-voice-recorder.ts:118–131).
  - Picks MIME via `pickMimeType()`, constructs `MediaRecorder`, wires `ondataavailable` (push non-empty chunks), `onerror` (→ "Recording failed", error state, teardown), `onstop` (→ `handleStop`) (use-voice-recorder.ts:133–148).
  - `rec.start()`, set `recording`, arm a `setTimeout(stop, maxDurationMs)` auto-stop (use-voice-recorder.ts:150–152).
  - **`TODO(capacitor)`**: on native builds, swap `MediaRecorder` for `@capgo/capacitor-voice-recorder` (returns base64 m4a), gated on `Capacitor.isNativePlatform()` (use-voice-recorder.ts:105–107, 46–52). Not implemented.
- `stop()`: clears the auto-stop timeout, no-ops if recorder missing/inactive, else `rec.stop()` (use-voice-recorder.ts:167–175).
- `handleStop(mimeType)` (use-voice-recorder.ts:177–216): sets `processing`; builds a `Blob` from chunks; tears down audio; if blob `size === 0` → silently return to `idle` (no upload); else builds `FormData` with the file named `clip.m4a` (when mime includes "mp4") or `clip.webm`, appends `promptKey` if present; `POST /api/voice/transcribe`; on non-ok parses `{error}` and throws (`Transcription failed (status)` fallback); on success calls `onTranscript(data.text)` **only if `data.text.trim()` is non-empty**; returns to `idle`. On any throw → sets the error message and `error` state.
- `reset()`: clears error, sets `idle` (use-voice-recorder.ts:218–221) — the path the UI uses to recover from `error`.
- Returns `{ state, error, start, stop, reset, analyser }` (use-voice-recorder.ts:223).
- **Unmount cleanup** (use-voice-recorder.ts:69–86): clears `ondataavailable/onstop/onerror` BEFORE calling `stop()` (so a queued `onstop` can't `setState` on an unmounted component), stops all stream tracks, closes the AudioContext, clears the timeout.
- `safeSet` wrapper guards every `setState` behind a `mountedRef` (use-voice-recorder.ts:88–90).

### POST /api/voice/transcribe (route.ts) — transcription endpoint
- `runtime = "nodejs"` (route.ts:12).
- **Auth gate**: `getAuthenticatedUser()`; null → 401 `{error:"Unauthorized"}` (route.ts:14–18).
- **Per-user rate limit**: key `voice-transcribe:${user.id}`, `limit: 30` (default 60s window); on fail → 429 `{error:"Rate limit exceeded", retryAfterSeconds}` + `Retry-After` header (route.ts:20–26).
- **Per-IP rate limit** (defence in depth, comment: "user.id can be cheap to mint via repeated signups"): key `voice-transcribe-ip:${getClientIp(req.headers)}`, `limit: 60`; on fail → 429 `{error:"Rate limit exceeded"}` + `Retry-After` (route.ts:28–38).
- **Form parse**: `req.formData()`; on throw → 400 `{error:"Invalid form data"}` (route.ts:40–45).
- **File validation**: `form.get("audio")` must be a `File` → else 400 ``{error:"Missing `audio` file"}``; `file.type` must start with `audio/` → else **415** `{error:"File must be audio/*"}`; `file.size > MAX_BYTES` → **413** `{error:"Audio too large"}` (route.ts:47–59).
- **Prompt resolution**: `promptKey` from form; if in `ACCEPTED_PROMPT_KEYS` → use `QUESTIONNAIRE_PROMPT`, else `undefined` (unbiased) (route.ts:61–64).
- **Transcribe**: `transcribeAudio(file, {prompt})` → 200 `{text}` (route.ts:66–68).
- **Error handling**: logs server-side; returns **502**; message scrubbed to `"Voice not configured"` if the error mentions `GROQ_API_KEY`, otherwise generic `"Transcription failed"` — Groq internals are never leaked (route.ts:69–77, 71 comment).

### transcribeAudio / Groq client (groq.ts)
- Lazy singleton `Groq` client; throws `"GROQ_API_KEY is not set"` if env var missing (groq.ts:3–12).
- `transcribeAudio(file, {prompt?})` calls `audio.transcriptions.create` with: `model:"whisper-large-v3-turbo"`, `response_format:"json"`, `temperature:0`, and `prompt` **only when provided** (groq.ts:27–38). Returns `res.text`.
- Header comment: "~216x real-time speed, $0.04/audio-hour" (groq.ts:24–25).

### voice-prompts.ts
- Single exported constant `QUESTIONNAIRE_PROMPT` — see verbatim text in **Enums** below. Comment notes Whisper truncates prompts at ~224 tokens, so keep them short and dense with rare terms (voice-prompts.ts:1–6).

### Consumers (how the transcript lands)
- **Questionnaire long_text field** (`LongTextField`, question.tsx:414–477): renders a `Textarea` (`maxLength={question.maxLength}`) + a "Dictate instead" outline button (`Mic` icon) that toggles local `dictating` state → mounts `RecorderPanel` with `promptKey="questionnaire"` (question.tsx:457–462). `appendTranscript(text)`: trims; ignores empty; joins to existing value with `"\n"` unless the value already ends in trailing whitespace (`/\n\s*$/`), then `.slice(0, question.maxLength)` and `onChange` (question.tsx:433–439). In `fullScreen` mode the textarea grows to `min-h-[40dvh] flex-1` (question.tsx:452–455).
- **Bug-report dialog** (report-bug-dialog.tsx:213–220): mounts `RecorderPanel` **without** a `promptKey` (comment: the route has no bug-report prompt; free-form feedback runs unbiased, route.ts comment confirms) (report-bug-dialog.tsx:214–216). `appendTranscript`: trims; ignores empty; sets a `dictated` flag; appends with the same `"\n"`/`/\n\s*$/` joiner; `.slice(0, DESCRIPTION_MAX)` (report-bug-dialog.tsx:75–83).

## User actions & interactions
- **Opt into dictation**: tap "Dictate instead" (Mic icon) on the host field → mounts RecorderPanel (question.tsx:464–473; report-bug-dialog.tsx:221–231).
- **Start recording**: tap the circular record button while idle/after error-reset → triggers mic permission prompt → recording (recorder-panel.tsx:50–57; dictate-button.tsx:39–46).
- **Stop recording**: tap the (now red, Square) button while recording → stops + uploads + transcribes (recorder-panel.tsx:55).
- **Retry after error**: tap the button while in `error` state → `reset()` back to idle (recorder-panel.tsx:51–53; dictate-button.tsx:40–43).
- **Auto-stop**: recording is force-stopped after `maxDurationMs` (default 120_000 ms = 2 min) (use-voice-recorder.ts:152, 56).
- **Record again**: after a successful transcript the panel returns to idle and stays open; tap to record another clip — transcripts accumulate by appending (recorder-panel.tsx:18–25).
- **Dismiss / close panel**: tap the X ("Close dictation") → `onDismiss()` collapses back to the "Dictate instead" button; disabled while recording or busy (recorder-panel.tsx:79–89).
- Multiple sequential recordings append to the same host field; each non-empty transcript is concatenated with a newline joiner and clamped to the field max.

## States & presentations
RecorderState enum: `idle | requesting | recording | processing | error` (use-voice-recorder.ts:5–10).

Derived UI buckets: `isRecording = state==="recording"`; `isBusy = state==="processing" || state==="requesting"` (recorder-panel.tsx:47–48).

| State | RecorderPanel status label | DictateButton label | Visuals |
|---|---|---|---|
| `idle` | "Tap to record" | "Dictate" | Mic icon, `default`/`outline` variant, enabled |
| `requesting` | "Allow microphone…" | "Allow mic" | Loader2 spinner, button disabled (isBusy) |
| `recording` | "Recording" | "Stop" | filled Square, `destructive` variant, waveform animating, mm:ss timer shown |
| `processing` | "Transcribing…" | "Transcribing" | Loader2 spinner, disabled (isBusy) |
| `error` | "Tap to retry" | "Try again" | Mic icon (after reset path), error line shown (`role="alert"`) |

(recorder-panel.tsx:59–68; dictate-button.tsx:48–57.)

Global-states rows that apply here:
- **Empty**: host field empty + panel collapsed (no recording yet). Blob `size === 0` after stop silently returns to `idle` with no transcript appended (use-voice-recorder.ts:184–187).
- **Loading / Submitting / pending**: `requesting` (waiting on mic permission) and `processing` (uploading + awaiting Whisper) — spinner, button disabled.
- **Populated**: transcript appended to host field; panel idle and reusable.
- **Validation-error**: transcript is clamped to `question.maxLength` / `DESCRIPTION_MAX` on append (no separate validation banner inside the pipeline; host field's textarea `maxLength` also enforces typed input — question.tsx:179, 449).
- **Success**: `onTranscript` fired with non-empty `data.text.trim()`; state → `idle`.
- **Disabled**: record button disabled while `isBusy`; X/close disabled while recording or busy.
- **Error**: see error matrix in **Validation** below.
- **Gating states** (invite-gated / onboarding-incomplete / pending / rejected / captain-only-locked): NOT expressed inside the pipeline UI. The server route only enforces **authentication** (401 if unauthenticated, route.ts:15–18) — there is no rank/approval/onboarding check on `/api/voice/transcribe`. Gating happens upstream at the host surface (the questionnaire/onboarding flow and the feedback layer), not in the voice components. **Edge case / gating asymmetry:** the route checks `getAuthenticatedUser()` truthiness ONLY — it does not read `approval_status`/`nextGate`, so any *authenticated* user (including an unapproved or mid-onboarding member) who reaches the endpoint directly can transcribe. This is asymmetric with the page-gating spine and may be intentional (the route is only reachable from already-gated host surfaces) or a gap (source bug — see verification report §6).

## Enums, options & configurable values
- **RecorderState**: `"idle" | "requesting" | "recording" | "processing" | "error"` (use-voice-recorder.ts:5–10).
- **SUPPORTED_MIME_TYPES** (in priority order; first supported wins) (use-voice-recorder.ts:25–30):
  1. `"audio/webm;codecs=opus"`
  2. `"audio/webm"`
  3. `"audio/mp4"` (comment: "iOS Safari 14.3+")
  4. `"audio/ogg;codecs=opus"`
  - If none supported, `MediaRecorder` is constructed with no `mimeType` option (use-voice-recorder.ts:38–42, 133–134).
- **maxDurationMs** default `120_000` (2 minutes) per clip (use-voice-recorder.ts:21–22, 56).
- **fftSize** = `1024` on the AnalyserNode (use-voice-recorder.ts:128, 118–120 comment).
- **getUserMedia audio constraints**: `echoCancellation:true, noiseSuppression:true, autoGainControl:true` (use-voice-recorder.ts:110–114).
- **Uploaded filename**: `clip.m4a` (mime includes "mp4") else `clip.webm` (use-voice-recorder.ts:192).
- **MAX_BYTES** = `10 * 1024 * 1024` (10 MB; comment "~10 minutes of speech") (route.ts:9).
- **ACCEPTED_PROMPT_KEYS** = `new Set(["questionnaire"])` — the ONLY accepted prompt key (route.ts:10).
- **promptKey values in use**: `"questionnaire"` (long_text questionnaire field); **none** for the bug-report dialog (unbiased) (question.tsx:461; report-bug-dialog.tsx:213–216).
- **Rate limits**: per-user `limit: 30`; per-IP `limit: 60`; both with the default `windowMs = 60_000` (route.ts:20, 31; rate-limit.ts:29, 44).
- **Groq transcription params**: `model:"whisper-large-v3-turbo"`, `response_format:"json"`, `temperature:0`, optional `prompt` (groq.ts:33–37).
- **QUESTIONNAIRE_PROMPT** (verbatim, voice-prompts.ts:8–13):
  > "Camp 404 burner profile. Afrikaburn, Burning Man, Tankwa Karoo, theme camp, Dance of 1000 Flames, Now Now Meow Meow, mutant vehicle, DDT ticket, virgin burner. Skills: cooking, recipes, vegan, kitchen, build, welding, sewing, fire safety, fire spinning, poi, staff, fans, art, decor, lighting, generators, wiring, inverters, LEDs. Roles: team lead, camp lead, treasurer, medic. Ministry of Vibes, Ministry of Memes."
- **Error messages** (client, from `getUserMedia` catch, use-voice-recorder.ts:154–160): `NotAllowedError` → "Microphone permission denied"; `NotFoundError` → "No microphone found"; otherwise → "Couldn't access microphone". Recorder `onerror` → "Recording failed" (use-voice-recorder.ts:142). Transcription failures surface the server `error` string or "Transcription failed".
- **Server error responses**: 401 "Unauthorized"; 429 "Rate limit exceeded" (+`retryAfterSeconds` for the user-limit variant, +`Retry-After` header both); 400 "Invalid form data" / "Missing \`audio\` file"; 415 "File must be audio/*"; 413 "Audio too large"; 502 "Voice not configured" (GROQ_API_KEY) / "Transcription failed" (route.ts:17–76).
- **Host-field length clamps**: questionnaire long_text `maxLength` default `1000` (packages/types/src/questionnaire.ts:60); bug-report `DESCRIPTION_MAX = 5000` (lib/github-feedback.ts:21).

## Data model touched
- **No database tables.** Audio is never persisted; the transcript is the only output, handed to the host field via `onTranscript` and held in the host component's local React state.
- **Request payload** (`FormData` to `/api/voice/transcribe`): field `audio` (a `File`, type `audio/*`, named `clip.webm`/`clip.m4a`), optional field `promptKey` (string) (use-voice-recorder.ts:189–196).
- **Response payload**: `{ text: string }` on success; `{ error: string, retryAfterSeconds?: number }` on failure (route.ts:23, 68, others).
- **Interfaces**:
  - `UseVoiceRecorderOptions { onTranscript:(text:string)=>void; promptKey?:string; maxDurationMs?:number }` (use-voice-recorder.ts:12–23).
  - `RecorderPanelProps { onTranscript:(text:string)=>void; onDismiss:()=>void; promptKey?:string }` (recorder-panel.tsx:9–16).
  - `DictateButtonProps { onTranscript:(text:string)=>void; promptKey?:string; className?:string }` (dictate-button.tsx:10–16).
  - `WaveformProps { analyser:AnalyserNode|null; active:boolean; className?:string }` (waveform.tsx:6–12).
  - `TranscribeOptions { prompt?:string }` (groq.ts:14–21).
- **Host field schema** (where transcript lands): `LongTextQuestion` `{ ...base, kind:"long_text", maxLength:number(default 1000) }` (packages/types/src/questionnaire.ts:55–63); long_text validation: `raw.length > q.maxLength` → `{ ok:false, error:\`Max ${q.maxLength} characters\` }` (packages/types/src/questionnaire.ts:393–396). Bug-report description clamps to `DESCRIPTION_MAX = 5000`.
- **Rate-limit store**: in-memory `Map<string, {tokens, updatedAt}>` keyed `voice-transcribe:<userId>` / `voice-transcribe-ip:<ip>` — per-process, non-persistent, swept every 200 calls (rate-limit.ts:6–24).
- Agrees with unit 29: this pipeline introduces no schema; it consumes `questionnaire_responses` long_text values and the bug-report description (GitHub issue body) via its consumers, not directly.

## Validation, edge cases & business rules
- **Auth required**: route returns 401 if no authenticated user (route.ts:15–18). No rank/approval gating at the route.
- **Dual rate limiting**: per-user (30/min) then per-IP (60/min); IP limit is "defence in depth" against cheap-minted accounts (route.ts:28–29).
- **File type must be `audio/*`** → 415 otherwise (route.ts:51–55). Size cap **10 MB** → 413 (route.ts:57–59).
- **promptKey is server-validated against an allow-list** so clients cannot inject arbitrary Whisper prompts; unknown/empty keys silently fall back to unbiased transcription (route.ts:10, 61–64; use-voice-recorder.ts:16–20 comment).
- **Empty/silent clip**: blob `size === 0` after stop → no upload, silent return to `idle` (use-voice-recorder.ts:184–187).
- **Empty transcript**: `onTranscript` only fires when `data.text.trim()` is non-empty (use-voice-recorder.ts:207); consumers' `appendTranscript` also early-return on empty (question.tsx:434–435; report-bug-dialog.tsx:76–77).
- **Transcript is APPENDED, never replaced**: newline joiner inserted only when the existing value is non-empty and does not already end in trailing whitespace (`/\n\s*$/`); result `.slice(0, max)` clamps to the host field's max length (question.tsx:436–437; report-bug-dialog.tsx:80–81).
- **Auto-stop after 2 min** prevents runaway recordings (use-voice-recorder.ts:152).
- **Cross-browser MIME selection** is mandatory: hardcoding `audio/webm` "makes iOS Safari silently fail — the single biggest cross-browser gotcha" (use-voice-recorder.ts:32–43); falls through to `audio/mp4` for iOS Safari 14.3+.
- **Permission/hardware errors** mapped to friendly messages (`NotAllowedError` / `NotFoundError` / fallback) (use-voice-recorder.ts:153–164).
- **Unmount safety**: handlers detached before `stop()`; all `setState` guarded by `mountedRef`; tracks stopped, AudioContext closed, timeout cleared (use-voice-recorder.ts:69–90).
- **Dismiss disabled mid-capture**: X button disabled while recording/busy so audio isn't orphaned (recorder-panel.tsx:85).
- **Record button disabled while busy** (requesting/processing) to prevent double-trigger (recorder-panel.tsx:96; dictate-button.tsx:68).
- **`start()` is idempotent** for already-`recording`/`requesting` states (use-voice-recorder.ts:101).
- **`stop()` no-ops** if no recorder or recorder already inactive (use-voice-recorder.ts:173).
- **Error masking**: server scrubs Groq internals; only `"Voice not configured"` (missing key) or generic `"Transcription failed"` reach the client (route.ts:71–75). Missing `GROQ_API_KEY` throws on first use of the lazy client (groq.ts:7–8).
- **Webkit fallback**: AudioContext uses `webkitAudioContext` when `AudioContext` is absent (use-voice-recorder.ts:121–124).
- **Native (Capacitor) path is a TODO**, not implemented — current pipeline is web-only `MediaRecorder` (use-voice-recorder.ts:105–107).

## Sub-components / variants
- **RecorderPanel** — the live, in-use surface (mounted by the questionnaire long_text field and the bug-report dialog). Two call sites differ only by `promptKey` (`"questionnaire"` vs none).
- **DictateButton** — **ORPHANED / DEAD variant.** Functionally equivalent compact "vertical column" form (small button + waveform), wired to the same hook, but imported by no file in `apps/web`. Carries identical action/state semantics (tap-start / tap-stop / tap-reset, same labels rephrased). A restyle can resurrect or delete it; it currently ships unused.
- **Waveform** — shared sub-component used by both panels; pure visual affordance, no functional contribution to the transcript (audio bytes never leave the canvas, waveform.tsx:14–19).
- **useVoiceRecorder** — the shared state-machine hook backing both panels; the single source of recorder behaviour, MIME selection, timeout, analyser, cleanup, and upload.
- **Server validators/handlers**: `POST /api/voice/transcribe` (route.ts) is the only handler; `transcribeAudio` (groq.ts) is the Groq adapter; `QUESTIONNAIRE_PROMPT` (voice-prompts.ts) is the only prompt; `rateLimit`/`getClientIp` (rate-limit.ts) supply the limiter; `getAuthenticatedUser` (lib/auth.ts) the auth gate.
- **Stale/ugly truths**: `TODO(capacitor)` native recording branch is unimplemented (use-voice-recorder.ts:105–107); the route comment claims 10 MB "~10 minutes" while the client caps clips at 2 minutes, so the server cap is generous slack, never hit by the in-app flow; `DictateButton` is dead code.

---

# 22 — Avatar upload & image pipeline

**Files covered:**
- `apps/web/components/profile/avatar-upload.tsx` — client React component: the large circular avatar uploader (file picker → client crop/resize → POST upload → URL state).
- `apps/web/lib/image.ts` — client-side canvas image preprocessing: centre-crop to square + downscale + WebP encode. No external dependency.
- `apps/web/app/api/uploads/avatar/route.ts` — server POST route handler: auth + rate-limit + validation, stores normalised image in a private Vercel Blob, returns a same-origin proxy URL (stubbed under E2E / unconfigured Blob).
- `apps/web/app/api/avatar/route.ts` — server GET route handler: the gated proxy that streams a private avatar blob to approved members only.

**Supporting files read (cited inline):** `apps/web/lib/auth.ts` (auth), `apps/web/lib/rate-limit.ts` (token bucket), `apps/web/lib/test-mode.ts` (E2E flag), `apps/web/lib/users.ts` (`findCampUserByAuthId`, `isApproved`, `setProfileImage`), `apps/web/lib/test-store.ts` (in-memory backend), `packages/db/src/burner-profile.ts` (`setUserProfileImage`), `packages/db/src/schema.ts` (`profile_image_url` column), `packages/db/src/account.ts` (delete sanitises image to null), `packages/types/src/questionnaire.ts` (`ImageQuestion` schema + validator). Consumers: `apps/web/components/questionnaire/question.tsx` (image field kind, 04/20), `apps/web/app/profile/edit/edit-form.tsx` + `apps/web/app/profile/actions.ts` (08), `apps/web/app/onboarding/questionnaire/actions.ts` (mirrors photo onto users column).

**Purpose:**
This unit is the complete profile-photo capture-and-serve pipeline. The client uploader lets a member pick an image; the image is centre-cropped to a square, downscaled to 512×512, and re-encoded as WebP entirely in the browser (canvas) so the server only ever receives an already-normalised file. That file is POSTed to `/api/uploads/avatar`, which (after auth + dual rate limiting + content validation) stores it in a **private** Vercel Blob and returns a **same-origin proxy URL** (`/api/avatar?pathname=…`) — never the raw blob URL. The `/api/avatar` GET route streams that private blob back, but only to a signed-in, approved (vetted) camp member. The returned proxy URL is the value persisted by consumers (onboarding image question 04/20 and profile-edit 08) into `users.profile_image_url`. Under `E2E_TEST_MODE=1` or when no Blob token is configured, the network is skipped and a deterministic proxy URL is echoed so the rest of the flow works in test/local dev.

## Features

### Avatar uploader UI (avatar-upload.tsx)
- Large circular tap-target (`h-40 w-40`, `rounded-full`) that opens the OS file picker on click (`inputRef.current?.click()`) — both the circle and a secondary text button trigger it (avatar-upload.tsx:75-87, 123-130, 138-144).
- Hidden native `<input type="file" accept="image/*">` (`className="sr-only"`); change handler calls `handleFile(e.currentTarget.files?.[0] ?? undefined)` (avatar-upload.tsx:138-144).
- On file selection, runs `cropResizeToSquare(file)` (client crop/resize/encode), wraps the resulting Blob into a `File("avatar.webp", { type: blob.type })`, appends it to FormData under key **`image`**, and `fetch("/api/uploads/avatar", { method: "POST", body })` (avatar-upload.tsx:44-53).
- Local **object-URL preview**: immediately after crop, `setPreview(URL.createObjectURL(blob))` shows the just-cropped image rather than the authed proxy (which 401s for a not-yet-approved member mid-onboarding) (avatar-upload.tsx:28-31, 45-46). The previous object URL is revoked via a `useEffect` cleanup keyed on `preview`, and on unmount (avatar-upload.tsx:32-37).
- On success: parses `{ url: string }` and calls `onChange(data.url)` to hand the proxy URL to the parent (avatar-upload.tsx:60-61).
- **Remove** affordance: a small circular destructive button (top-right, `X` icon) shown only when an image is displayed and not uploading; clears error, clears preview, and calls `onChange(null)` (avatar-upload.tsx:107-120).
- Display source priority: `displaySrc = preview ?? value` — local preview wins over the stored URL (avatar-upload.tsx:70).
- `displaySrc` renders an `<img className="object-cover">`; absence renders a `Camera` icon + "Add photo" placeholder inside the dashed circle (avatar-upload.tsx:88-99).
- Resets the file input value (`inputRef.current.value = ""`) in `finally` so re-selecting the same file re-fires `onChange` (avatar-upload.tsx:66).
- Accepts a `className` prop to override the diameter token (avatar-upload.tsx:13-14, 85).

### Client image preprocessing (image.ts)
- `cropResizeToSquare(file, { size = 512, quality = 0.85 })` → `Promise<Blob>` (image.ts:17-42).
- Loads the file via `loadBitmap`, computes the centre-crop square: `edge = Math.min(width, height)`, `sx = (width - edge)/2`, `sy = (height - edge)/2` (image.ts:23-25).
- Draws onto an off-screen `<canvas>` sized `size×size` (default 512×512) using `ctx.drawImage(bitmap, sx, sy, edge, edge, 0, 0, size, size)` (image.ts:27-32).
- Encodes via `canvas.toBlob(resolve, "image/webp", quality)` (image.ts:34-36) — **always requests `image/webp`** at quality 0.85.
- `loadBitmap`: fast path `createImageBitmap(file)`; fallback for unsupported environments builds an `<img>` from an object URL and shims `{ close }` to revoke it; rejects with "Could not load image" on decode error (image.ts:44-66).
- Cleanup: `bitmap.close?.()` in `finally` (image.ts:39-41).

### Upload route — POST /api/uploads/avatar (route.ts)
- `runtime = "nodejs"` (route.ts:12).
- Requires an authenticated user via `getAuthenticatedUser()` → 401 `{ error: "Unauthorized" }` otherwise (route.ts:25-28).
- **Dual rate limiting** (route.ts:30-48):
  - per-user key `avatar-upload:${user.id}`, limit **20** / default 60s window → 429 with `retryAfterSeconds` body + `Retry-After` header.
  - per-IP key `avatar-upload-ip:${getClientIp(req.headers)}`, limit **40** → 429 with `Retry-After` header (defence in depth; comment notes user.id is cheap to mint).
- Parses `req.formData()`; malformed → 400 `{ error: "Invalid form data" }` (route.ts:50-55).
- Extracts the `image` field; validation chain (route.ts:57-66):
  - not a `File` → 400 `{ error: "Missing \`image\` file" }`
  - `!file.type.startsWith("image/")` → 415 `{ error: "File must be image/*" }`
  - `file.size > MAX_BYTES` (5 MB) → 413 `{ error: "Image too large" }`
- **Test / unconfigured-store branch**: if `isE2ETestMode()` OR `!process.env.BLOB_READ_WRITE_TOKEN`, skip the network and return `{ url: avatarProxyUrl(`avatars/${user.id}/test-avatar.webp`) }` (route.ts:68-76).
- **Real upload**: `ext = file.type === "image/png" ? "png" : "webp"`; `put(`avatars/${user.id}/avatar.${ext}`, file, { access: "private", addRandomSuffix: true, contentType: file.type, token })` (`@vercel/blob` ^2.4.0). Returns `{ url: avatarProxyUrl(blob.pathname) }` — never the raw blob URL (route.ts:78-88).
- On `put` failure: logs `console.error("avatar-upload error", err)` → 502 `{ error: "Upload failed" }` (route.ts:89-92).
- `avatarProxyUrl(pathname)` → `/api/avatar?pathname=${encodeURIComponent(pathname)}` (route.ts:96-98).

### Avatar proxy route — GET /api/avatar (route.ts)
- `runtime = "nodejs"` (route.ts:7).
- Auth + approval gate (route.ts:24-34):
  - `getAuthenticatedUser()` null → 401 `"Unauthorized"`.
  - Loads `findCampUserByAuthId(user.id)`; if no row OR `!isApproved(campUser, user.primaryEmail)` → 401 `"Unauthorized"`. Gate is **approval, not ownership** — any approved member can view any member's avatar (header, profile pages, family tree, captain roster) (route.ts:9-22 doc).
- Reads `pathname` query param: missing → 400 `"Missing pathname"`; not starting with `avatars/` → 404 `"Not found"` (prefix scoping prevents reading arbitrary blobs) (route.ts:36-43).
- Test / unconfigured branch: `isE2ETestMode()` OR `!token` → 404 `"Not found"` (nothing to serve) (route.ts:45-49).
- `get(pathname, { access: "private", token })`; if `!result || result.statusCode !== 200` → 404 `"Not found"` (handles missing blob and 304/null-stream conditional variants) (route.ts:52-57).
- Streams `result.stream` with headers (route.ts:58-67):
  - `Content-Type: result.blob.contentType`
  - `Cache-Control: private, max-age=31536000, immutable`
  - `X-Content-Type-Options: nosniff`
- On `get` failure: logs `console.error("avatar-proxy error", err)` → 404 `"Not found"` (route.ts:68-71).

## User actions & interactions
- **Tap circle** or **tap text button** → open file picker (avatar-upload.tsx:77, 125).
- **Select an image file** → crop/resize/encode → preview shown immediately → upload → on success the parent receives the proxy URL (avatar-upload.tsx:39-68).
- **Tap remove (X)** → clears error + preview, `onChange(null)` (clears the photo) (avatar-upload.tsx:107-120).
- **Re-select the same file** → still fires (input value reset in `finally`) (avatar-upload.tsx:66).
- Buttons are `type="button"` so they never submit the host form (avatar-upload.tsx:76, 109, 124).
- In **profile-edit (08)**: the chosen URL is held in form state and rides to the server via a hidden input `name="profileImageUrl"`; "Save changes" submits `updateProfile` (edit-form.tsx:31-32, 56-58). In **onboarding image question (04/20)**: `AvatarUpload` is rendered for the `image` field kind, `onChange((url) => onChange(url))` writes to questionnaire response `profile.image` (question.tsx:232-240).
- aria-labels: "Add a profile photo" / "Change profile photo" (state-dependent), "Remove profile photo" (avatar-upload.tsx:79-81, 115).

## States & presentations
Global-states rows that apply here:
- **Empty** — no `displaySrc`: dashed-border circle, `Camera` icon + "Add photo"; text button reads "Upload a photo" (avatar-upload.tsx:84, 94-99, 129).
- **Loading / Submitting** — `uploading=true`: circle disabled (`disabled:opacity-60`), dark overlay `bg-black/40` + spinning `Loader2` over the image; text button reads "Uploading…"; remove button hidden during upload (avatar-upload.tsx:26, 78, 100-104, 107, 129).
- **Populated** — `displaySrc` set: solid border (when `value` present), image shown `object-cover`, remove button visible, text button reads "Change photo" (avatar-upload.tsx:84, 88-93, 107-120, 129).
- **Validation-error / failure** — `error` state set from a thrown error message; rendered as `role="alert"` destructive text below the control. Message is server `data.error` if present, else "Upload failed" / "Could not load image" (decode) (avatar-upload.tsx:27, 54-63, 132-136).
- **Disabled** — both buttons `disabled={uploading}` (avatar-upload.tsx:78, 126).
- **Success** — handled by `onChange(url)` propagating to the parent; no internal success banner.
- **Invite-gated / Onboarding-incomplete / Pending-approval** — relevant to the **proxy** (GET): a logged-out, no-row, pending, or rejected viewer gets 401, so the `<img>` simply fails to load (route.ts:24-34). During onboarding (member not yet approved) the uploader deliberately shows the **local object-URL preview** instead of the proxy URL, because the proxy would 401 for that member (avatar-upload.tsx:28-31).
- **Rejected** — `isApproved` is false (status `rejected`), so the proxy 401s; image unviewable.
- Note: the upload **POST** route only requires authentication (`getAuthenticatedUser`), NOT approval — a pending member mid-onboarding can still upload (route.ts:25-28). The approval gate lives only on the GET proxy.

## Enums, options & configurable values
- `CropResizeOptions.size` default **512** (output edge length, px) (image.ts:7-8, 19).
- `CropResizeOptions.quality` default **0.85** (WebP quality 0–1) (image.ts:9-10, 19).
- Encode MIME: **`image/webp`** (always requested by the client encoder) (image.ts:35).
- Output filename wrapped by uploader: **`avatar.webp`** (avatar-upload.tsx:48).
- File picker accept filter: **`image/*`** (avatar-upload.tsx:141).
- `MAX_BYTES = 5 * 1024 * 1024` (5 MB hard cap, server) (route.ts:10).
- Per-user upload rate limit: **20** / 60s; per-IP: **40** / 60s (default `windowMs = 60_000`) (route.ts:30, 41; rate-limit.ts:29, 44).
- Blob `put` options: `access: "private"`, `addRandomSuffix: true`, `contentType: file.type` (route.ts:80-85).
- Server stored blob path: `avatars/${user.id}/avatar.${ext}` where `ext` ∈ {`png`, `webp`} — `png` only when `file.type === "image/png"`, else `webp` (route.ts:79-80).
- Test/unconfigured echoed path: `avatars/${user.id}/test-avatar.webp` (route.ts:74).
- Proxy URL shape: `/api/avatar?pathname=<encodeURIComponent(pathname)>` (route.ts:97).
- Proxy cache header: `private, max-age=31536000, immutable`; `X-Content-Type-Options: nosniff` (route.ts:64-65).
- Env vars: `BLOB_READ_WRITE_TOKEN` (Blob store token), `E2E_TEST_MODE=1` (test bypass) (route.ts:68; test-mode.ts:12).
- HTTP status codes returned — POST: 401, 429, 400, 415, 413, 502, 200; GET: 401, 400, 404, 200 (route.ts files).
- `ImageQuestion` (the `image` field kind) schema/validator: `kind: "image"`, `required` default **false** ("profile photos are never mandatory") (packages/types/src/questionnaire.ts:128-134). The `profile.image` question **definition strings** live in the live config (apps/web/lib/questionnaire.ts:63-77): `id: "profile.image"`, `prompt: "Profile photo"`, `helper: "A clear photo of your face works best."`, `required: false`, on page `profile_photo` / title "Add a profile photo" / subtitle "Optional — helps the camp put a face to your name. You can skip and add it later from your profile."

## Data model touched
- **`users.profile_image_url`** (`text("profile_image_url")`, nullable) — the canonical persisted value: the same-origin proxy URL string (`/api/avatar?pathname=…`), NOT the raw blob URL. Lives on the identity row (not in `burner_profiles.responses`) so it's cheap to read for header/profile/family-tree (schema.ts:224-229).
- ⚠️ **Stale source comment**: the `ImageQuestion` doc-comment claims "the stored value is the public URL of the uploaded image (a Vercel Blob URL in production)" (packages/types/src/questionnaire.ts:125-127). This is misleading — consumers persist the gated **proxy URL** (`/api/avatar?pathname=…`), never the raw Vercel Blob URL (route.ts:86-88, 96-98).
- DB setter: `setUserProfileImage(userId, profileImageUrl)` updates `users.profile_image_url` + `updatedAt` (burner-profile.ts:102-111). Exposed app-side as `setProfileImage(userId, url)` routed to real or test backend (users.ts:310-317, 371-373, 431-433).
- Test backend: `testStore.setProfileImage(userId, url)` mutates the in-memory user's `profileImageUrl` + `updatedAt` (test-store.ts:220-228); `CampUser.profileImageUrl` shape (users.ts:39-47, 462-480).
- **Questionnaire response** `profile.image` (key in `burner_profiles.responses` JSONB) — stores the proxy URL string when set via onboarding; `presentMemberDetail` reads `responses["profile.image"]` as a fallback source for the member card image (member-detail.ts:116-119). Note onboarding `actions.ts` mirrors `cleaned["profile.image"]` onto `users.profile_image_url` via `setProfileImage` on every progress + final save (onboarding/questionnaire/actions.ts:69-73).
- Blob object key path: `avatars/<userId>/avatar.<ext>` with a random suffix (Vercel Blob private store; not a DB table) (route.ts:80).
- **Account deletion**: `sanitisedUserPatch` sets `profileImageUrl: null` when anonymising a deleted account (account.ts:29). (The blob object itself is not explicitly deleted in this patch.)

## Validation, edge cases & business rules
- **Client decode failure** → `cropResizeToSquare` rejects ("Could not load image" or "Canvas 2D context unavailable" / "Failed to encode image"); surfaced as the `error` alert (image.ts:31, 37, 55; avatar-upload.tsx:62-63).
- **Centre-crop is forced square** regardless of aspect ratio; no user-adjustable crop box — the centre `min(w,h)` square is always taken (image.ts:23-32).
- **Server re-validates independently** of the client: type must be `image/*`, size ≤ 5 MB, field key must be `image` and an actual `File`. The 5 MB cap "just guards against someone POSTing a raw file directly" since the client already downscales (route.ts:7-9, 57-66).
- **Server does NOT re-crop/re-encode (source gap — see verification report §6)** — the POST handler stores whatever file it receives as-is, trusting the client-side normalisation; it enforces only `contentType` (`image/*`) + the 5 MB cap, with **no server-side decode, square-crop, re-encode, or aspect-ratio check**. The handler treats `png` specially only for the stored extension, otherwise assumes WebP. So a direct POST of a hand-crafted large, non-square, non-WebP image under 5 MB is stored uncropped with its own contentType (route.ts:79-85).
- **Private-by-default security model**: raw blob URLs are never handed to the client; only the gated `/api/avatar` proxy URL is persisted/rendered (route.ts:18-22 doc, 86-88).
- **Proxy prefix scoping**: `pathname` must start with `avatars/` or the proxy 404s — prevents using the proxy to read other (non-avatar) blobs in the store (avatar.../route.ts:40-43).
- **Proxy approval gate** is `isApproved` (god-email OR `approvalStatus === "approved"`), matching the app-wide "can use the app" gate — NOT ownership; pending/rejected/no-row → 401 (avatar.../route.ts:29-34; users.ts:231-236).
- **Mid-onboarding preview hack**: because a not-yet-approved member would 401 on the proxy, the uploader shows the local object-URL preview until the page refreshes (avatar-upload.tsx:28-31).
- **Empty/optional image in questionnaire**: validator treats `undefined | null | ""` as missing; since `image` is `required: false`, missing passes and stores `undefined` (omitted from responses) (questionnaire.ts:360-366). When present, the value must be a string (any string accepted — no URL-format check) else "Expected an image URL" (questionnaire.ts:430-433).
- **Persisted URL normalisation**: consumers store `image.length > 0 ? image : null` — empty string is normalised to `null` in both profile-edit and onboarding (profile/actions.ts:45; onboarding/.../actions.ts:72).
- **Idempotent overwrite**: `addRandomSuffix: true` means each upload produces a new immutable pathname; the `immutable` cache header is safe because the URL changes per upload (route.ts:62-63 doc, 82).
- **No client-side size/type pre-check** beyond `accept="image/*"`; the encoder will attempt any decodable image and the server enforces the hard limits.
- **Rate-limit refill** is token-bucket (continuous refill `limit/windowMs` per ms), `retryAfterSeconds = ceil((1 - tokens)/refillPerMs/1000)` (rate-limit.ts:43-62).

## Sub-components / variants
- **`AvatarUpload`** (avatar-upload.tsx) — the single client component. Props: `value: string | null | undefined`, `onChange: (url: string | null) => void`, `className?: string`. Used in exactly two places: the questionnaire `image` field renderer (question.tsx:232-240) and profile-edit (edit-form.tsx:31). No dead/orphaned variants.
- **`cropResizeToSquare` / `loadBitmap`** (image.ts) — preprocessing helpers; `loadBitmap` carries a non-`createImageBitmap` fallback branch (older/edge browsers) that is otherwise unexercised on the fast path.
- **POST handler** (`uploads/avatar/route.ts`) — validators inline (auth, dual rate-limit, formData parse, file type/size); `avatarProxyUrl` local helper.
- **GET handler** (`avatar/route.ts`) — validators inline (auth, approval, pathname presence, `avatars/` prefix scope, test/unconfigured short-circuit, `statusCode === 200` check).
- **Test/stub variant**: both routes short-circuit under `E2E_TEST_MODE=1` or absent `BLOB_READ_WRITE_TOKEN` — POST echoes a deterministic `test-avatar.webp` proxy URL; GET returns 404 (no store to read). This is a first-class behaviour path, not dead code (uploads/avatar/route.ts:68-76; avatar/route.ts:45-49).

---

# 23 — Auth, session & access-control gating chain

**Files covered:**
- `apps/web/lib/auth.ts` — the `AuthenticatedUser` shape + `getAuthenticatedUser` / `getAuthenticatedUserOrRedirect`; reads Neon Auth session or (in E2E) the test-user cookie.
- `apps/web/lib/auth-client.ts` — client-side Neon Auth (Better Auth) instance (`authClient`) for `useSession()` / `signIn.social()`.
- `apps/web/lib/neon-auth.ts` — server-side Neon Auth instance (`auth`); configures baseUrl + cookie secret + `sameSite: "lax"`.
- `apps/web/lib/users.ts` — `ensureCampUser`, `redeemInviteForUser`, `hasCampAccess`, `isApproved`, `isTeamLead`, `decideUserApproval`, required-action seed/satisfy/read helpers, the real/test backend abstraction.
- `apps/web/lib/access-control.ts` — `isGodEmail` (GOD_EMAILS), `claimInviteCode` (env-code vs DB-code atomic claim), `ClaimedInvite`.
- `apps/web/lib/required-actions.ts` — `nextGate(actions)` + `ACTION_ROUTES` registry; maps a pending blocking required action to its gate route.
- `packages/db/src/activations.ts` — `openActivation`, `ensureRequiredAction`, `satisfyRequiredAction`, `getPendingRequiredActions`, `PendingRequiredAction` (the `required_actions` producer + satisfaction).
- `apps/web/app/api/auth/[...path]/route.ts` — catch-all Better Auth API handler (`auth.handler()` → `GET`/`POST`).

Adjacent files read to map the full spine (not the primary unit but load-bearing):
- `apps/web/lib/test-mode.ts` — `isE2ETestMode()` + `TEST_USER_COOKIE` constant.
- `apps/web/lib/test-store.ts` — in-memory `globalThis` test store backing E2E mode.
- `apps/web/proxy.ts` — `auth.middleware` running the OAuth verifier→cookie exchange on `/auth/*` and `/mcp/*`.
- `apps/web/app/page.tsx` — the canonical gating-spine consumer (home redirect chain).
- `apps/web/app/signup/required/page.tsx` + `actions.ts` + `invite-gate-form.tsx` — the invite gate.
- `apps/web/app/pending-approval/page.tsx` — the captain-approval gate.
- `apps/web/app/auth/page.tsx` + `app/auth/[path]/page.tsx` — sign-in/up routing + OAuth landing.
- `apps/web/app/onboarding/questionnaire/actions.ts` — `saveBurnerProfile` (satisfies the burner-profile gate).
- `apps/web/app/api/test/{login,reset,set-approval,set-rank,complete-onboarding,seed-invite,inspect}/route.ts` — E2E test harness routes that drive gating states.
- `packages/db/src/{invite-codes.ts,roster.ts,burner-profile.ts,versions.ts,crypto.ts}` + `packages/db/src/schema.ts` — DB layer the helpers call.

**Purpose:** This unit is the redirect SPINE every authenticated screen depends on. It answers, in a fixed order, four questions about the current request's user: (1) Are you authenticated? (2) Do you have camp access — a god email or a redeemed invite code? (3) Do you have any pending blocking obligations (the generic `required_actions` gate, today the burner profile)? (4) Has a captain approved you? Each "no" routes to a dedicated gate page that has a built exit. The unit also owns the lazy creation of the `users` (camp-user) row, the atomic invite-code claim, the god-email bypass, the derived `team_lead` rank, and a full E2E test-mode bypass (cookie auth + in-memory store) gated behind `E2E_TEST_MODE=1`.

---

## Features

### Authentication read (`apps/web/lib/auth.ts`)
- `AuthenticatedUser` interface: `{ id: string; primaryEmail: string | null; displayName: string | null }` (auth.ts:13-17). This is the minimal shape both Neon Auth's session and the test harness produce.
- `getAuthenticatedUser(): Promise<AuthenticatedUser | null>` (auth.ts:25-37):
  - If `isE2ETestMode()` is true, first tries the `camp404_test_user` cookie via `readTestUserCookie()`; if present it WINS and Neon Auth is bypassed entirely (auth.ts:26-29).
  - Otherwise `await auth.getSession()`; returns null if `session?.user` is falsy (auth.ts:30-31).
  - Maps the Neon Auth session to `{ id: session.user.id, primaryEmail: session.user.email ?? null, displayName: session.user.name ?? null }` (auth.ts:32-36).
- `getAuthenticatedUserOrRedirect(): Promise<AuthenticatedUser>` (auth.ts:40-44): same as above but `redirect("/auth/sign-in")` when unauthenticated.
- `readTestUserCookie()` (auth.ts:46-61): reads `TEST_USER_COOKIE`, `JSON.parse(decodeURIComponent(raw))`, requires a non-empty string `id` or returns null; defaults `primaryEmail`/`displayName` to null; any parse error → null.

### Neon Auth instances (`neon-auth.ts`, `auth-client.ts`)
- Server (`neon-auth.ts:25-35`): `createNeonAuth({ baseUrl, cookies: { secret, sameSite: "lax" } })`.
  - `baseUrl = process.env.NEON_AUTH_BASE_URL ?? PLACEHOLDER_BASE_URL` where `PLACEHOLDER_BASE_URL = "https://build-placeholder.neon-auth.invalid"` (neon-auth.ts:21,26).
  - `secret = process.env.NEON_AUTH_COOKIE_SECRET ?? PLACEHOLDER_COOKIE_SECRET` where the placeholder is the 50-char `"build-placeholder-secret-build-placeholder-secret"` — secret MUST be ≥32 chars or `createNeonAuth` throws on import (neon-auth.ts:18-23,28).
  - `sameSite: "lax"` chosen deliberately (NOT strict) so cross-site top-level navigations (claude.ai → `/api/mcp/oauth/authorize` → `/mcp/connect`) carry the session cookie (neon-auth.ts:29-33).
- Client (`auth-client.ts:14`): `export const authClient = createAuthClient();` — same-origin fetches to `/api/auth/*`, no base URL. Exposes `authClient.useSession()`, `authClient.signIn.social({ provider: "google" })`.

### Better Auth API handler (`app/api/auth/[...path]/route.ts`)
- `export const { GET, POST } = auth.handler();` (route.ts:8). Proxies Better Auth's whole API surface: sign-in, sign-up, session, OAuth callbacks, etc.
- NOTE (route.ts:4-7): the OAuth verifier-to-cookie exchange does NOT run here — it runs in `proxy.ts` (`auth.middleware`). Without that middleware, social sign-in returns the user with a `session_verifier` in the URL but no session cookie is ever set.

### OAuth verifier exchange (`proxy.ts`)
- `export default auth.middleware({ loginUrl: "/auth/sign-in" });` (proxy.ts).
- `config.matcher = ["/auth", "/auth/:path*", "/mcp/:path*"]` — scoped to the OAuth return trip (`/auth/*`) and the MCP OAuth landing (`/mcp/connect`). Protected routes do their OWN session check in their server components via `getAuthenticatedUser()` (proxy.ts comment).

### Camp-user resolution & lazy creation (`users.ts`)
- `CampUser` interface (users.ts:39-47): `{ id, authUserId, displayName: string|null, profileImageUrl: string|null, inviteCode: string|null, rank: Rank, approvalStatus: ApprovalStatus }`. `Rank = "captain" | "member"`; `ApprovalStatus = "pending" | "approved" | "rejected"` (users.ts:32-33).
- `ensureCampUser(authUser): Promise<CampUser>` (users.ts:60-95):
  - Picks `testBackend` if `isE2ETestMode()` else `realBackend` (users.ts:64).
  - Returns an existing row if found (users.ts:65-66).
  - GOD ACCOUNTS (`isGodEmail(primaryEmail)`): on first sign-in, creates a real persisted row `{ displayName: displayName ?? primaryEmail, inviteCode: null, rank: "member", approvalStatus: "approved" }` and seeds the burner-profile required action (users.ts:70-80).
  - NON-GOD with no row and no invite: returns a SYNTHETIC, NON-PERSISTED row `{ id: "", authUserId, displayName: displayName ?? primaryEmail, profileImageUrl: null, inviteCode: null, rank: "member", approvalStatus: "approved" }` (users.ts:86-94). The empty `id` is never used because every caller checks `hasCampAccess` and redirects first; this avoids writing an orphan "signed in, no invite" row.
- `findCampUserByAuthId(authUserId): Promise<CampUser | null>` (users.ts:174-179): read-only lookup, no cookie/invite writes — for hot paths (e.g. gating the avatar proxy on every image load).
- `toCampUser(row)` (users.ts:462-480): normalizer; defaults `profileImageUrl ?? null`, `approvalStatus ?? "approved"`.

### Access predicates (`users.ts`, `access-control.ts`)
- `hasCampAccess(user: { inviteCode }, email): boolean` (users.ts:219-224): `isGodEmail(email) || !!user.inviteCode`. THIS IS THE INVITE GATE ONLY — a user can pass it but still be `pending`.
- `isApproved(user: { approvalStatus }, email): boolean` (users.ts:231-236): `isGodEmail(email) || user.approvalStatus === "approved"`. God accounts are always approved.
- `isTeamLead(userId): Promise<boolean>` (users.ts:244-247): delegates to backend. Real backend → `dbIsTeamLead` (any `team_memberships` row with `is_lead = true`, roster.ts:204-217). Test backend → always `false` (no membership concept; users.ts:448-450).
- `isGodEmail(email): boolean` (access-control.ts:28-32): case-insensitive membership test against CSV `process.env.GOD_EMAILS`; `null`/`undefined`/empty → false.

### Invite-code claim (`access-control.ts`, `users.ts`)
- `ClaimedInvite` (access-control.ts:10-15): `{ code: string; assignedRank: AssignedRank | null; requiresApproval: boolean }`. `AssignedRank = "captain" | "member"`.
- `claimInviteCode(code): Promise<ClaimedInvite | null>` (access-control.ts:43-57):
  - Trims; empty → null.
  - ENV CODE (`isEnvCode`: `csv(process.env.INVITE_CODES).includes(code)`, access-control.ts:59-61): pure validity check, returns `{ code, assignedRank: null, requiresApproval: false }` — unlimited bootstrap, never assigns rank, never requires approval (access-control.ts:48-49).
  - DB CODE: `consumeDbCode` → in test mode `testStore.consumeInviteCode`, else `dbConsumeInviteCode` (access-control.ts:63-68). Returns `null` on invalid/expired/revoked/exhausted/race-loser.
  - Carries `assignedRank` and `requiresApproval` from the consumed row.
- `consumeInviteCode` (invite-codes.ts:60-83): single atomic `UPDATE ... SET use_count = use_count + 1` with `revokedAt IS NULL`, not-expired, and `max_uses IS NULL OR max_uses > use_count` guards in the WHERE clause; `.returning()` — so two concurrent redeemers can't both win the last use.
- `redeemInviteForUser(authUser, rawCode): Promise<RedeemInviteResult>` (users.ts:111-153) — `RedeemInviteResult = { ok: true } | { ok: false; error: string }`:
  - Trims code; empty → `{ ok: false, error: "Please enter an invite code." }` (users.ts:115-116).
  - Short-circuit: god account OR existing `inviteCode` on file → `{ ok: true }` WITHOUT burning a use (users.ts:122-124).
  - `claimInviteCode` failure → `{ ok: false, error: "That invite code isn't valid." }` (users.ts:126-127).
  - EXISTING row: stamps `inviteCode`; if `assignedRank` differs from current rank, sets rank; if `requiresApproval` and status not already `pending`, tightens to `pending` (users.ts:129-138). Comment: "A vetting-required code only ever tightens access into the queue."
  - FIRST TIME: creates a row stamped with the code, `rank: assignedRank ?? "member"`, `approvalStatus: requiresApproval ? "pending" : "approved"`, and seeds the burner-profile required action (users.ts:144-151).

### Required-actions gate (`required-actions.ts`, `activations.ts`, `users.ts`)
- `ACTION_ROUTES` registry (required-actions.ts:7-11): `{ burner_profile: "/onboarding/questionnaire" }`. Comment: `dietary_requirements` / `driver_profile` slot in here once their bespoke pages exist; until then their activations stay pending but DON'T gate (no mapped route).
- `PendingAction` (required-actions.ts:13-16): `{ actionKey: string; blocking: boolean }`.
- `nextGate(actions): string | null` (required-actions.ts:23-30): iterates in given order (oldest first); SKIPS non-blocking actions; returns the route of the first blocking action that maps to a built gate; null if none. This guarantees a user is never stranded behind a gate with no page.
- `seedBurnerProfileAction(userId)` (users.ts:192-201): no-op under E2E; else `ensureRequiredAction({ userId, type: "questionnaire", actionKey: "burner_profile", title: "Complete your burner profile", version: QUESTIONNAIRE.version })`.
- `satisfyBurnerProfileAction(userId)` (users.ts:204-209): no-op under E2E; else `dbSatisfyRequiredAction(userId, "burner_profile", QUESTIONNAIRE.version)`.
- `getPendingRequiredActions(userId)` (users.ts:212-217): returns `[]` under E2E; else `dbGetPendingRequiredActions(userId)`.
- DB producer `openActivation(activationId)` (activations.ts:36-131): marks a questionnaire activation `open`, fans out one `required_actions` row per matched member via `computeAudience`, idempotent via the `(user_id, action_key)` unique index (`onConflictDoUpdate` re-points version/activation/title/blocking, resets `status: "pending"`, `completedAt: null`). `scope === "opt_in"` returns `{ ok: false, error: "opt_in activations are not yet supported." }`. Unknown scope → `{ ok: false, error: "Unsupported activation scope: <scope>." }`. `PUSH_SCOPES = Set(["everyone","team","team_leads","individual"])` (activations.ts:14).
- `ensureRequiredAction(input)` (activations.ts:138-160): idempotent single-row seed (`onConflictDoNothing` on `(userId, actionKey)`); defaults `version ?? null`, `blocking ?? true`.
- `satisfyRequiredAction(userId, actionKey, completedVersion?)` (activations.ts:167-200): only acts if a row exists AND `status === "pending"`; VERSION-AWARE — if the row's required `version` and `completedVersion` are both set and `!meetsRequiredVersion(version, completedVersion)`, returns `false` and leaves the gate OPEN (a completion against an older version doesn't satisfy). Otherwise sets `status: "completed"`, `completedAt: new Date()`; returns whether a row changed.
- `getPendingRequiredActions(userId)` (activations.ts:203-226): selects rows where `userId` matches, `status = "pending"`, `blocking = true`, ordered `createdAt` ASC (gate order, oldest first).

### The gating SPINE as consumed by the home page (`app/page.tsx:29-63`)
Fixed order, each step its own redirect:
1. `getAuthenticatedUser()` → if null, render `<LandingHero />` (NOT a redirect; page.tsx:30-34).
2. `ensureCampUser(user)` → `if (!hasCampAccess(...)) redirect("/signup/required")` (page.tsx:39-42). **Invite gate.**
3. `nextGate(await getPendingRequiredActions(campUser.id))` → `if (gate) redirect(gate)` (page.tsx:47-48). **Required-actions gate.**
4. Belt-and-braces legacy fallback (page.tsx:50-56): `getBurnerProfile(campUser.id)` → `if (!profile?.completedAt) redirect("/onboarding/questionnaire")`. Comment marks this as a one-release transitional check until `required_actions` seeding is confirmed in prod — DROP once confirmed. This is also what enforces onboarding under E2E (where steps 3's helpers are no-ops).
5. `if (!isApproved(...)) redirect("/pending-approval")` (page.tsx:61-63). **Captain-approval gate.**
6. Past all gates: derives `viewerRank` (`campUser.rank === "captain" ? "captain" : isTeamLead(...) ? "team_lead" : "camp_member"`, page.tsx:73-78) and renders the ControlPanel.

## User actions & interactions
- **Sign in / sign up** (`app/auth/[path]/page.tsx`): `sign-up` path renders bespoke `<SignUpForm />` (sign-up is OPEN — invite check is deferred to the post-auth gate); `sign-in` path renders bespoke `<SignInForm />`; any other path (forgot/reset password, callback, sign-out, magic-link) falls through to Neon Auth's hosted `<AuthView path={path} />` (auth/[path]/page.tsx:19-47).
- **OAuth landing** (`app/auth/page.tsx`): after Google OAuth the proxy exchanges `?neon_auth_session_verifier=…` for a session cookie, then this page forwards authed users to `/` and unauthed to `/auth/sign-in` (auth/page.tsx:20-24).
- **Redeem invite code** (`signup/required/invite-gate-form.tsx` + `actions.ts`): a signed-in user enters a code in the `name="code"` input (autoComplete/spellCheck/autoCapitalize/autoCorrect off, `required`) and submits. `submitInviteCode` server action rate-limits, claims the code, and `redirect("/")` on success; on failure returns `{ ok: false, error }` rendered inline via `useActionState` (form stays on gate). Submit button: "Enter camp" → "Checking…" while `isPending`. Has a "Sign out" link (`/auth/sign-out`).
- **Sign out** is the escape hatch on every terminal gate: `/auth/sign-out` link on the invite gate (`invite-gate-form.tsx:66`) and on the pending/rejected screen (`pending-approval/page.tsx:87`).
- **Captain vetting decision** (`decideUserApproval`, users.ts:253-260): `{ userId, status: "approved" | "rejected", decidedByUserId }`. Caller (camp-management UI, out of this unit's scope) must gate on captain rank; this just persists the decision and stamps the deciding captain + timestamp for the audit trail.
- **Complete onboarding** (`onboarding/questionnaire/actions.ts` `saveBurnerProfile`): on `final` submit it re-checks `hasCampAccess` (redirect to `/signup/required` if lost), validates, persists, calls `satisfyBurnerProfileAction`, then `redirect("/")`. This is what closes gate-step 3/4.
- **E2E harness actions** (test-only, `app/api/test/*`): `POST /api/test/login` (set `camp404_test_user` cookie), `DELETE /api/test/login` (clear it), `POST /api/test/set-approval`, `POST /api/test/set-rank`, `POST /api/test/complete-onboarding`, `POST /api/test/seed-invite`, `/api/test/reset`, `/api/test/inspect`. All return `404 { error: "Not found" }` when `E2E_TEST_MODE !== "1"`.

## States & presentations
Global-states rows expressed BY this unit (it is the producer of all four gating states):

- **Invite-gated** — `hasCampAccess` false → `redirect("/signup/required")`. The gate page (`signup/required/page.tsx`) itself forwards back to `/` if access is (re)gained. Wrapped in `<AuthShell hideBack footer="Camp 404 is invite-only.">`.
- **Onboarding-incomplete** — `nextGate(pending blocking required_actions)` returns `/onboarding/questionnaire` (the only mapped route today), OR the legacy fallback `!profile?.completedAt`. Routes to the questionnaire.
- **Pending-approval** — `approvalStatus === "pending"` (and not god) → `redirect("/pending-approval")`. Page shows amber `Clock` icon, heading "Application submitted", body greeting by display name, "Sign out" button. The only exits: a captain approving (app unlocks on next load) or sign-out (pending-approval/page.tsx:46,74-84).
- **Rejected** — `approvalStatus === "rejected"` (TERMINAL). Same `/pending-approval` page but `destructive` `ShieldX` icon, heading "Application not approved", body "...wasn't approved for camp access this time. If you think this is a mistake, reach out to whoever invited you." (pending-approval/page.tsx:46,65-73). Only exit is sign-out.
- **Captain-only-locked** — surfaced via the derived `viewerRank` the spine computes (page.tsx:73-78); layers above the viewer's rank render visible-but-locked in the ControlPanel (that behaviour lives in unit 02/the ControlPanel itself).

Other applicable global-states:
- **Loading / Submitting** — invite form shows "Checking…" with `disabled` submit while `isPending` (invite-gate-form.tsx:57-59).
- **Validation-error** — invite redeem failures render inline (`role="alert"`, destructive colour) for: "Please enter an invite code.", "That invite code isn't valid.", "Too many attempts — wait a few minutes and try again." (rate-limit). `saveBurnerProfile` returns field errors / `_form` error.
- **Success** — successful redeem/onboarding → `redirect("/")`.
- **Unauthenticated (not a gate redirect)** — home renders `<LandingHero />`; `getAuthenticatedUserOrRedirect` and the gate pages instead `redirect("/auth/sign-in")`.
- **No sync / no budget states** apply here (confirmed: server-only, no client data layer).

Page-level `dynamic = "force-dynamic"` on every gate page + home + `/auth` because they read the session cookie per request and cannot be statically prerendered.

## Enums, options & configurable values
- `rankEnum` = `["captain", "member"]` (schema.ts:31). Default on `users.rank`: `"member"`. team-lead/driver are DERIVED, never stored (schema.ts:27-30).
- `approvalStatusEnum` = `["pending", "approved", "rejected"]` (schema.ts:41-45). Default `"approved"`. `rejected` is terminal.
- `requiredActionTypeEnum` = `["questionnaire", "acknowledgement", "payment", "profile_update"]` (schema.ts:99-104).
- `requiredActionStatusEnum` = `["pending", "completed", "waived", "expired"]` (schema.ts:106-111). Default `"pending"`.
- `questionnaireScopeEnum` = `["everyone", "team", "team_leads", "individual", "opt_in"]` (schema.ts:114-120). `PUSH_SCOPES` supported by the fan-out = `everyone|team|team_leads|individual`; `opt_in` unsupported (deferred pull model); `drivers` is broadcast-only (activations.ts:12-14).
- `activationStatusEnum` = `["draft", "open", "closed"]` (schema.ts:122-126). Default `"draft"`.
- `teamEnum` = `["kitchen", "structures", "power_and_lighting", "sanitation_and_water", "health_and_safety", "art_and_activities", "ministry_of_memes", "ministry_of_vibes"]` (schema.ts:51-60) — referenced via team-lead derivation/audience.
- `AssignedRank` = `"captain" | "member"` (invite-codes.ts).
- `QUESTIONNAIRE.version` = `"2026.05.29-v8"` (questionnaire.ts:60) — used to seed/satisfy the burner-profile action and stamped on `burner_profiles.version`.
- Version comparison: `meetsRequiredVersion(required, completed)` (versions.ts:14-24) parses `^(.*)-v(\d+)$`; if both share a base, compares the `-vN` suffix as an INTEGER (so `-v10 >= -v9`); else lexicographic.
- `ACTION_ROUTES` = `{ burner_profile: "/onboarding/questionnaire" }` (required-actions.ts:7-11) — the only built gate route.
- Required-action defaults: `blocking` default `true` (schema.ts:593, activations.ts:155); `version` default null; seed title `"Complete your burner profile"` (users.ts:199).
- Env-driven config: `GOD_EMAILS` (CSV, case-insensitive, bypasses invite + approval gates), `INVITE_CODES` (CSV bootstrap env codes — unlimited, never assign rank, never require approval), `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` (≥32 chars), `E2E_TEST_MODE` (=`"1"` enables test bypass), `PGCRYPTO_KEY` (≥16 chars, AES-256-GCM for ID docs).
- Cookie: `TEST_USER_COOKIE = "camp404_test_user"` (test-mode.ts:9); test-login cookie opts: `httpOnly: true`, `secure` only in production, `sameSite: "lax"`, `path: "/"`, `maxAge: 60*60` (1 hour) (test/login/route.ts:29-35).
- Invite-redeem rate limit: key `invite-redeem:${authUser.id}`, `limit: 10`, `windowMs: 10 * 60_000` (10 minutes) — per-user, because sign-up is open (signup/required/actions.ts:25-28).

## Data model touched
(Must agree with unit 29.)

**`users` table** (schema.ts:220-303) — the camp-user identity row. Fields touched by this unit:
- `id` (uuid, pk), `authUserId` (`auth_user_id`, text, NOT NULL, UNIQUE — the Neon Auth user id), `displayName` (`display_name`, nullable), `profileImageUrl` (`profile_image_url`, nullable).
- `rank` (`rank` enum, NOT NULL, default `"member"`).
- `isSystem` (`is_system`, bool, default false — the AI/voice agent row; excluded from audiences).
- `inviteCode` (`invite_code`, text, nullable — NULL = god account; durable evidence of access past the invite gate).
- `approvalStatus` (`approval_status` enum, NOT NULL, default `"approved"`).
- `approvalDecidedByUserId` (`approval_decided_by_user_id`, uuid → users.id, on delete set null) and `approvalDecidedAt` (`approval_decided_at`, timestamp) — captain audit stamp set by `setUserApproval`.
- `sanitised` (`sanitised`, bool, default false) — read by audience/roster filters.
- (Also on the row, written by adjacent units: `passportEncrypted`, `saIdEncrypted`, `eftDetailsEncrypted`, `membershipTier`, `duesPaid`, `aiDataConsent`, etc.)

**`invite_codes` table** (schema.ts:312-342):
- `code` (text, pk), `createdByUserId` (`created_by_user_id`, uuid → users.id, set null), `note` (text), `maxUses` (`max_uses`, int, nullable = unlimited), `useCount` (`use_count`, int, NOT NULL, default 0), `expiresAt` (`expires_at`, ts, nullable), `revokedAt` (`revoked_at`, ts, nullable), `assignedRank` (`assigned_rank` rank enum, nullable = redeemer keeps `member`), `invitedEmail` (`invited_email`, text, lowercased on insert), `requiresApproval` (`requires_approval`, bool, NOT NULL, default false — codes minted by non-captains are ALWAYS true), `createdAt`.

**`required_actions` table** (schema.ts:570-609):
- `id` (uuid, pk), `userId` (`user_id`, uuid → users.id, cascade), `type` (`required_action_type` enum, NOT NULL), `actionKey` (`action_key`, text, NOT NULL — e.g. `"burner_profile"`), `version` (text, nullable), `activationId` (`activation_id`, uuid → questionnaire_activations.id, set null), `title` (text, NOT NULL), `blocking` (bool, NOT NULL, default true), `status` (`required_action_status` enum, NOT NULL, default `"pending"`), `dueAt` (`due_at`, ts), `createdAt`, `completedAt` (`completed_at`, ts).
- Indexes: UNIQUE `required_actions_user_action_idx` on `(user_id, action_key)` (drives idempotent upsert/re-activation); `required_actions_user_status_idx` on `(user_id, status)`.

**`team_memberships` table** (schema.ts:446-462) — read for `isTeamLead`:
- `userId` (uuid → users.id, cascade), `team` (team enum, NOT NULL), `isLead` (`is_lead`, bool, NOT NULL, default false), `createdAt`. PK `(userId, team)`. The derived `team_lead` rank = exists any row with `is_lead = true`.

**`questionnaire_activations`** (schema.ts:472-502) and **`questionnaire_activation_targets`** (schema.ts:505-518) — read/written by `openActivation`: activation has `questionnaireKey`, `version`, `title`, `description`, `scope`, `team`, `blocking` (default true), `status` (default `"draft"`), `dueAt`, `activatedByUserId`, `openedAt`, `closedAt`. Targets table is `(activation_id, user_id)` PK for `scope = 'individual'`.

**`burner_profiles`** (schema.ts:352+) — read via `getBurnerProfile` for the legacy onboarding fallback (`completedAt`, `version`, `responses`, `updatedAt`).

**E2E test store (in-memory, `globalThis.__camp404TestStore__`)** mirrors the above with `TestUser` (incl. `approvalDecidedByUserId`, `approvalDecidedAt`), `TestBurnerProfile`, `TestInviteCode`, `TestQuestionnaireEdit`, `TestBroadcast`, `TestDelivery`. Hung off `globalThis` because RSC renders and route handlers get SEPARATE module graphs in the same process (test-store.ts:97-126). Reset via `/api/test/reset`.

## Validation, edge cases & business rules
- **God-email bypass is total:** `isGodEmail` short-circuits BOTH `hasCampAccess` and `isApproved` (and `redeemInviteForUser` doesn't burn a use for them). A god user is auto-created on first sign-in with `inviteCode: null` and `approvalStatus: "approved"` (users.ts:70-80). Match is case-insensitive on the CSV.
- **Synthetic non-persisted row:** a signed-in non-god with no row + no invite never gets a DB row (no orphan); the synthetic row has `id: ""` and is only safe because every caller checks `hasCampAccess` and redirects to `/signup/required` first (users.ts:82-95).
- **Atomic invite claim / race-safety:** the DB `consumeInviteCode` increments `use_count` inside one guarded UPDATE so two racing redeemers cannot both win the last remaining use (invite-codes.ts:60-83); the loser gets `null` → "That invite code isn't valid."
- **Invite code usability** requires ALL: not revoked, `expires_at` null or in the future, `max_uses` null or `> use_count` (invite-codes.ts findUsable/consume; test-store mirror at test-store.ts:339-352, where `expiresAt <= now` is unusable).
- **Approval only ever tightens via redemption:** redeeming a `requiresApproval` code on an existing row moves them to `pending` only if not already `pending`; it never relaxes status (users.ts:135-137 comment: "only ever tightens access into the queue").
- **Pre-approved vs vetting-required first-time creation:** `approvalStatus = requiresApproval ? "pending" : "approved"`; `rank = assignedRank ?? "member"` (users.ts:148-149).
- **Required-action satisfaction is version-aware:** a completion recorded against a version older than the required one leaves the gate OPEN (activations.ts:188-194). Re-opening an activation re-points the row and resets it to `pending` with `completedAt: null` (onConflictDoUpdate).
- **nextGate never strands:** a pending blocking action whose `actionKey` has no entry in `ACTION_ROUTES` (e.g. `dietary_requirements`, `driver_profile` today) is SKIPPED — never redirected to (required-actions.ts:23-30 + comment).
- **Gate ordering is fixed** in `app/page.tsx`: authed → invite → required-actions → legacy onboarding fallback → pending/rejected → app. Each gate page is also self-guarding (e.g. `/signup/required` and `/pending-approval` redirect back out if their precondition is no longer met), so direct navigation can't sit on a stale gate.
- **Pending-approval ordering rule:** the pending screen first requires onboarding done (`!profile?.completedAt → /onboarding/questionnaire`) so a captain only ever reviews a completed profile (pending-approval/page.tsx:39-44).
- **OAuth cookie requires the proxy:** social sign-in returns a `session_verifier` in the URL; only the `/auth/*` + `/mcp/*` middleware exchanges it for a cookie. `sameSite: "lax"` is mandatory for the cross-site MCP OAuth round-trip — `strict` would drop the cookie on cross-site GETs (neon-auth.ts:29-33).
- **Build-time placeholders:** `next build` succeeds without env vars via the placeholder baseUrl/secret; any real request without proper env will fail loudly at the Neon Auth API. Secret < 32 chars throws at import.
- **E2E mode is production-poisonous-if-set:** `E2E_TEST_MODE=1` registers the `/api/test/*` routes and routes auth through the cookie + in-memory store; production must never set it (test-mode.ts:3-13). Under E2E, `seedBurnerProfileAction`/`satisfyBurnerProfileAction`/`getPendingRequiredActions` are no-ops and `isTeamLead` is always false — the legacy `completedAt` fallback in `app/page.tsx` is what preserves the onboarding gate.
- **Rate limit** on invite redemption is per-user (`invite-redeem:<id>`), 10 attempts / 10 min, because sign-up is open and an IP limit is evadable (signup/required/actions.ts:24-34).
- **ID-document encryption side-channel:** during onboarding `saveBurnerProfile` splits the government ID out of the JSONB responses and encrypts it (AES-256-GCM via `PGCRYPTO_KEY`); a missing/short key throws and surfaces as a typed `_form` retry error rather than silently failing (onboarding/questionnaire/actions.ts:48-93; crypto.ts).
- **Test-login cookie validation:** `readTestUserCookie` requires a non-empty string `id`, defaults email/displayName to null, swallows JSON parse errors → null (auth.ts:50-60).

## Sub-components / variants
This is a server-only unit — the "sub-components" are the handlers/validators/backends:

- **Real vs test backend** (`UserBackend` interface, users.ts:264-298): `realBackend` (users.ts:350-408) calls the Drizzle `@camp404/db/*` modules; `testBackend` (users.ts:410-460) calls the in-memory `testStore`. Selected per call by `isE2ETestMode()`. Notable test-backend divergences: `isTeamLead` always returns `false`; ID docs stored RAW (no crypto, so tests need no `PGCRYPTO_KEY`).
- **`auth.handler()`** (`api/auth/[...path]/route.ts`) — the only production auth API entry; the `[...path]` catch-all proxies the whole Better Auth surface.
- **`auth.middleware`** (`proxy.ts`) — the OAuth verifier→cookie exchange; matcher-scoped to `/auth`, `/auth/:path*`, `/mcp/:path*`.
- **Gate pages (consumers, exits of this spine):** `/signup/required` (invite gate, `AuthShell hideBack footer="Camp 404 is invite-only."`), `/pending-approval` (approval gate, two variants: pending=amber `Clock`/"Application submitted", rejected=destructive `ShieldX`/"Application not approved"), `/onboarding/questionnaire` (required-actions gate target). `/auth` (OAuth landing) and `/auth/[path]` (sign-in/up + Neon Auth hosted fallback).
- **`AuthenticatedUser` vs `CampUser`:** two distinct shapes — `AuthenticatedUser` is the auth-layer identity (id/email/name), `CampUser` is the camp-domain row (rank/approval/invite). `ensureCampUser` is the bridge.
- **DEAD / TRANSITIONAL branches flagged in source:**
  - The legacy `completedAt` onboarding fallback in `app/page.tsx:50-56` is explicitly marked "Belt-and-braces fallback (one release) ... Drop once required_actions seeding is confirmed in prod."
  - `ACTION_ROUTES` comment notes `dietary_requirements` / `driver_profile` are NOT yet mapped (their activations stay pending but don't gate) — required-actions.ts:9-10.
  - `opt_in` activation scope is a documented TODO pull model, currently returns an error (activations.ts:46-49).
  - `findUsableInviteCode` (invite-codes.ts) and `findInviteCodeByCode` exist for the invite-creation/availability UI, not consumed by this gating spine directly (claim uses `consumeInviteCode`).
- **E2E harness routes** (`/api/test/*`) are dead in production (404 unless `E2E_TEST_MODE=1`): `login` (cookie set/delete), `reset`, `set-approval`, `set-rank`, `complete-onboarding` (writes `version: "e2e-test"`, `responses: {}`, `markComplete: true`), `seed-invite`, `inspect`.

---

# 24 — App shell, layout & global chrome

**Files covered:**
- `apps/web/app/layout.tsx` — Root layout: `<html>`/`<body>` shell, site metadata + viewport/theme-color, mounts `Providers`, `AcknowledgementGate`, `FeedbackGate`.
- `apps/web/app/providers.tsx` — Client provider wrapper: `NeonAuthUIProvider` wiring router navigation + session-change refresh + theme.
- `apps/web/app/manifest.ts` — PWA / Android web-app manifest (`/manifest.webmanifest`).
- `apps/web/lib/og-image.tsx` — Shared `next/og` (Satori) renderer for the social share card + square app icons (glitched "404" mark).
- `apps/web/app/opengraph-image.tsx` — File-based OG image route delegating to `renderShareImage()`.
- `apps/web/app/twitter-image.tsx` — File-based Twitter (`summary_large_image`) route delegating to `renderShareImage()`.
- `apps/web/app/apple-icon.tsx` — File-based 180×180 Apple touch icon route delegating to `renderSquareIcon(180)`.
- `apps/web/app/icon.svg` — Static browser-tab favicon (inline glitched-404 SVG).
- `apps/web/app/not-found.tsx` — 404 page rendered inside the shell for unmatched routes / `notFound()`.
- `apps/web/app/error.tsx` — Route-segment error boundary (retry / home), inside the shell.
- `apps/web/app/global-error.tsx` — Last-resort error boundary that REPLACES the root layout (own `<html>`/`<body>`, inline-styled).
- `apps/web/app/acknowledgement-gate.tsx` — Full-screen takeover gate for `presentation='acknowledge'` notifications; polls + acknowledges.
- `apps/web/app/feedback-gate.tsx` — Shake-to-report gate; mounts `ReportBugDialog` while signed in.
- `apps/web/app/firebase-messaging-sw.js/route.ts` — Route handler that serves the FCM background service worker at `/firebase-messaging-sw.js`, env-interpolated.
- `apps/web/instrumentation.ts` — Boot-time server hook calling `assertServerEnv()` (fail-fast on missing secrets).
- `apps/web/lib/env.ts` — `assertServerEnv()`: validates required server env vars at boot.
- Supporting (followed imports, cited where load-bearing): `apps/web/components/feedback/use-shake-gesture.ts`, `apps/web/components/feedback/report-bug-dialog.tsx`, `apps/web/app/feedback/actions.ts`, `apps/web/lib/github-feedback.ts`, `apps/web/app/api/notifications/pending/route.ts`, `apps/web/app/api/notifications/acknowledge/route.ts`, `apps/web/lib/notifications.ts`, `packages/db/src/broadcasts.ts`, `packages/db/src/schema.ts`, `apps/web/lib/auth-client.ts`, `apps/web/lib/rate-limit.ts`, `packages/ui/src/styles/globals.css`.

**Purpose:** This unit is the always-present skeleton every Camp 404 page renders inside: the root HTML/body shell with its dark-only theme contract, site-wide metadata (title/description/OG/Twitter/icons/PWA manifest), the OKLCH-matched brand artwork (glitched "404" share card + app icons), the auth/theme provider wiring, the two app-wide gate layers mounted as siblings of `{children}` (the `AcknowledgementGate` full-screen announcement takeover and the `FeedbackGate` shake-to-report bug/feature reporter), the error boundaries (segment-level and root-level), the friendly in-shell 404 page, the FCM background service-worker handler, and the boot-time env assertion that fails a misconfigured deploy loudly. It establishes the chrome and global behaviors; the home header (unit 06), tokens (unit 28), and dialog primitives (unit 25) live elsewhere.

## Features

### Root layout & document shell (`app/layout.tsx`)
- Renders `<html lang="en" suppressHydrationWarning>` → `<body>` → `<Providers>{children}<AcknowledgementGate /><FeedbackGate aiAvailable={…} /></Providers>` (layout.tsx:48-58). The two gates are siblings of `{children}`, always mounted app-wide.
- `suppressHydrationWarning` on `<html>` because next-themes (via `NeonAuthUIProvider`) sets `class="dark"` on `<html>` client-side, causing an attribute mismatch (layout.tsx:45-48).
- Imports `@camp404/ui/styles.css` once (layout.tsx:5) — the single global stylesheet / OKLCH `@theme`.
- `<body>` base styles come from `packages/ui/src/styles/globals.css` `@layer base`: `bg-[color:var(--color-background)] text-[color:var(--color-foreground)]`, `font-feature-settings: "rlig" 1, "calt" 1`; universal `*` border defaults to `var(--color-border)`; native date/time picker indicator forced `filter: invert(0.85)` for dark theme (globals.css:42-55).
- `aiAvailable` is computed server-side as `!!process.env.ANTHROPIC_API_KEY` and passed into `FeedbackGate` (layout.tsx:55) — gates the "Improve with AI" toggle in the report dialog.

### Site metadata (`app/layout.tsx`)
- `metadataBase = new URL("https://camp-404.com")` (SITE_URL const, layout.tsx:7,14) — absolute base that the file-based `opengraph-image` / `twitter-image` / icon routes and canonical URLs resolve against.
- `title: "Camp 404"`; `description: "A calm command centre for a chaotic desert."` (SITE_DESCRIPTION const); `applicationName: "Camp 404"` (layout.tsx:15-17).
- `openGraph`: `type: "website"`, `siteName: "Camp 404"`, `title: "Camp 404"`, `description` (same), `url: "/"`, `locale: "en_GB"` (layout.tsx:18-25).
- `twitter`: `card: "summary_large_image"`, `title: "Camp 404"`, `description` (same) (layout.tsx:26-30).
- The page-not-found route supplies `metadata = { title: "Page not found" }` composed with the root layout template (not-found.tsx:7).

### Viewport / theme color (`app/layout.tsx`)
- `viewport`: `width: "device-width"`, `initialScale: 1`, `maximumScale: 1`, `themeColor: "#0d061e"` (layout.tsx:33-38). `maximumScale: 1` disables pinch-zoom (mobile-first chrome). `#0d061e` = hex of `--color-background` (midnight-violet).

### Providers wrapper (`app/providers.tsx`)
- `"use client"` component wrapping all children in `NeonAuthUIProvider` (Neon/Better Auth UI) (providers.tsx:1,14).
- Props wired: `authClient={authClient}`, `navigate={router.push}`, `replace={router.replace}`, `onSessionChange={() => router.refresh()}`, `redirectTo="/"`, `Link={Link}` (providers.tsx:14-21). `onSessionChange` refreshes server components on every sign-in/out so gated content re-evaluates.
- This provider is what flips `<html class="dark">` (next-themes under the hood) — the app is dark-only.
- `authClient = createAuthClient()` (auth-client.ts:14) — same-origin fetches to `/api/auth/*`, no base URL.

### PWA manifest (`app/manifest.ts`)
- Auto-served at `/manifest.webmanifest`. `name: "Camp 404"`, `short_name: "Camp 404"`, `description: "A calm command centre for a chaotic desert."`, `start_url: "/"`, `display: "standalone"`, `background_color: "#0d061e"`, `theme_color: "#0d061e"` (manifest.ts:6-13).
- Icons: (1) `src: "/icon.svg"`, `sizes: "any"`, `type: "image/svg+xml"`, `purpose: "any"`; (2) `src: "/apple-icon"`, `sizes: "180x180"`, `type: "image/png"`, `purpose: "maskable"` (manifest.ts:14-27).

### Brand artwork renderer (`lib/og-image.tsx`)
- Single shared `next/og` (Satori) renderer; artwork generated at build time, no committed binary assets (og-image.tsx:3-10).
- Hardcoded hex equivalents of OKLCH tokens: `BACKGROUND = "#0d061e"`, `FOREGROUND = "#f7ecf3"`, `MUTED = "#b29ab0"`, `MAGENTA = "rgba(255, 0, 140, 0.92)"`, `CYAN = "rgba(0, 220, 255, 0.92)"` (og-image.tsx:13-17).
- Exports `SHARE_SIZE = { width: 1200, height: 630 }`, `SHARE_CONTENT_TYPE = "image/png"`, `SHARE_ALT = "Camp 404 — a glitched 404 logo on a midnight-violet field. A calm command centre for a chaotic desert."` (og-image.tsx:19-22).
- `renderShareImage()` — 1200×630 OG/Twitter card: kicker "Camp 404", error line "Error 404 — Camp not found", a giant `Glitch404` (fontSize 320, split 14, glow 80), tagline "A calm command centre for a chaotic desert.", with a radial magenta bloom (og-image.tsx:25-108).
- `renderSquareIcon(size)` — square icon for Apple/maskable, fills background edge-to-edge, `Glitch404` sized at `Math.round(size*0.46)` with split `Math.max(2, Math.round(size*0.035))` (og-image.tsx:111-132).
- `Glitch404({fontSize, split, glow=0})` — three stacked "404"s: magenta translated `-split`px, cyan translated `+split`px, foreground on top (RGB-split chromatic aberration). Only sets `textShadow` when `glow` truthy because "Satori chokes on `textShadow: undefined`" (og-image.tsx:135-180).

### File-based image routes
- `app/opengraph-image.tsx` — re-exports `alt`/`size`/`contentType` from og-image and returns `renderShareImage()` (opengraph-image.tsx:14-16).
- `app/twitter-image.tsx` — identical artwork for X/Twitter `summary_large_image` (twitter-image.tsx:13-15).
- `app/apple-icon.tsx` — `size = { width: 180, height: 180 }`, `contentType = "image/png"`, returns `renderSquareIcon(180)`; Apple requires PNG and ignores transparency so background fills edge-to-edge (apple-icon.tsx:5-10).
- `app/icon.svg` — static favicon: 64×64 rounded-rect (`rx="12"`) `#0d061e` base, three monospace "404" texts offset (`#ff008c` magenta at x=30.5, `#00dcff` cyan at x=33.5, `#f7ecf3` foreground at x=32), `font-size="27"`, `font-weight="900"`, `letter-spacing="-1.5"`, `aria-label="Camp 404"` (icon.svg).

### Not-found page (`app/not-found.tsx`)
- Rendered for unmatched routes and `notFound()` calls; sits inside the root layout so the user stays within the shell (not-found.tsx:11-12).
- Layout: `main.mx-auto … max-w-lg …`; big `404` in `--color-primary`; heading "You're properly lost."; copy "This page wandered off into the dust. There's nothing here — but the camp's still standing."; a `<Button asChild>` linking `/` labeled "Back to camp" (not-found.tsx:13-29).

### Segment error boundary (`app/error.tsx`)
- `"use client"`; catches uncaught render/server-action errors in the app tree, keeps user in shell (error.tsx:7-10).
- On error: `console.error(error)` (digest correlates server log) and moves focus to the heading (`headingRef.current?.focus()`) for AT/keyboard users (error.tsx:19-26).
- UI: heading "Something went sideways."; copy "An unexpected error tripped us up. Try again — if it keeps happening, let a camp captain know."; two buttons — "Try again" (`onClick={reset}`) and outline "Back to camp" linking `/` (error.tsx:36-47).

### Root error boundary (`app/global-error.tsx`)
- `"use client"`; last-resort boundary for errors in the root layout itself — it REPLACES the layout, so it ships its own `<html lang="en">`/`<body>` and cannot use app CSS vars; all styling is inline (global-error.tsx:7-23).
- Inline-styled to match dark theme: `background: "#0d061e"`, `color: "#f6eef7"`, system-ui font stack; button `background: "#ef1ec1"` (hardcoded hex of `--color-primary` oklch(0.65 0.27 340)) (global-error.tsx:25-69).
- On error: `console.error(error)` and `headingRef.current?.focus()` (global-error.tsx:17-21).
- UI: heading "Camp 404 hit a snag."; copy "Something failed before the page could load. Try again — if it persists, let a camp captain know."; `<button onClick={reset}>Try again</button>` (global-error.tsx:42-69).

### Acknowledgement gate (`app/acknowledgement-gate.tsx`)
- App-wide full-screen takeover for the `presentation='acknowledge'` notification variant; mounted once in root layout (ack-gate.tsx:8-16).
- Polls `GET /api/notifications/pending` (`cache: "no-store"`) on initial load, on a `setInterval` of `POLL_INTERVAL_MS = 45_000` (45s), and on tab `visibilitychange→visible` + window `focus` (ack-gate.tsx:26,40-67).
- Concurrency guard: monotonic `requestIdRef` token so overlapping polls (interval vs focus) can't let a slower older response clobber a newer one — only the latest request wins (`if (requestId !== requestIdRef.current) return`) (ack-gate.tsx:34-46).
- Shows the OLDEST pending item (`current = queue[0]`) as a `role="dialog" aria-modal="true" aria-labelledby="ack-title"` overlay with `z-[100]`, opaque `bg-[color:var(--color-background)]`, full-screen `fixed inset-0` (ack-gate.tsx:69,105-111).
- While a notification is shown, locks background scroll (`document.body.style.overflow = "hidden"`, restored on cleanup) and resets scroll to top (`scrollRef.current?.scrollTo({ top: 0 })`) (ack-gate.tsx:73-81).
- Renders: Megaphone icon + "Camp announcement" kicker; the item `title` (h1 `#ack-title`); a subline `From {senderName} · {new Date(createdAt).toLocaleString()}` (the "From …" prefix omitted when `senderName` null); the `body` in `whitespace-pre-wrap`; then the Acknowledge block (ack-gate.tsx:105-153).
- Acknowledge button lives at the END of the scroll (not a pinned footer) — member scrolls the whole message to reach it (ack-gate.tsx:135-153).
- If more than one queued, shows "{queue.length - 1} more after this." above the button (ack-gate.tsx:138-142).
- `acknowledge()` POSTs `/api/notifications/acknowledge` `{ deliveryId }`; on success bumps `requestIdRef` (so an in-flight poll can't re-add it), removes the item from `queue`, and calls `router.refresh()` to update unread badge / inbox server components (ack-gate.tsx:85-103).
- Renders nothing (`return null`) when `current` is undefined (empty queue) — unauthenticated visitors get an empty queue from the API, so it's invisible on public pages (ack-gate.tsx:83, 16).

### Feedback gate (shake-to-report) (`app/feedback-gate.tsx`)
- Mounted once in root layout as sibling of `AcknowledgementGate`; shaking the device opens `ReportBugDialog`; shake detection pauses while the dialog is open (feedback-gate.tsx:12-27).
- Gated on the LIVE client session: `signedIn = !isPending && !!session` from `authClient.useSession()`; listener attaches only while signed in and detaches on sign-out (feedback-gate.tsx:23-27). `if (!signedIn) return null` (feedback-gate.tsx:41).
- `useShakeGesture({ enabled: signedIn && !open, onShake: () => setOpen(true) })` (feedback-gate.tsx:27).
- iOS 13+ devicemotion permission: when `signedIn && motionPermissionNeeded()`, requests motion permission once on the first `pointerdown` (`{ once: true }`) (feedback-gate.tsx:32-39).
- Shake is the ONLY trigger (no floating button) — matches RyRy79261/intake-tracker's ShakeToReport (feedback-gate.tsx:14-16).
- Server action enforces auth too as defence in depth (feedback-gate.tsx:18-20).

### Shake detection (`components/feedback/use-shake-gesture.ts`)
- Listens to `devicemotion`, reading `accelerationIncludingGravity` (x/y/z); ignores samples with any null axis (shake.ts:156-167).
- Pure `createShakeDetector` state machine: counts "jolts" where the change in total acceleration magnitude between samples exceeds `threshold`; magnitude is rotation-invariant so tilting (which keeps magnitude ≈9.8) doesn't register, only real movement (shake.ts:60-115).
- Fires when `jolts.length >= requiredJolts` within the rolling `windowMs` AND `now - lastShakeAt >= cooldownMs` (`>=` is inclusive — exact cooldown gap counts) (shake.ts:101-111).
- Default config: `threshold = 8`, `requiredJolts = 5` ("a deliberate, vigorous shake, not an accidental bump"), `windowMs = 800`, `cooldownMs = 3000` (shake.ts:135-139).
- Samples throttled to one per `SAMPLE_THROTTLE_MS = 60` ms (shake.ts:153-162).
- `motionPermissionNeeded()` — true only on browsers exposing `DeviceMotionEvent.requestPermission` (iOS 13+) (shake.ts:21-32). `requestMotionPermission()` returns `"granted" | "denied" | "unsupported"`; non-iOS returns `"granted"` without a prompt (shake.ts:34-52).

### Bug/feature report dialog (`components/feedback/report-bug-dialog.tsx`)
- Files a GitHub issue via `submitFeedbackAction`; nothing stored in our DB (dialog.tsx:39-45).
- Form fields/controls: kind toggle (Bug / Feature, `role="group" aria-label="Report type"`, `aria-pressed`), description Textarea (`rows={6}`, `maxLength={DESCRIPTION_MAX}=5000`, kind-specific label + placeholder), a "Dictate instead" Mic button that swaps in the voice `RecorderPanel` (transcript APPENDED to description via `appendTranscript`, no `promptKey`), and — only when `aiAvailable` — an "Improve with AI" Checkbox (default checked) (dialog.tsx:160-253).
- `appendTranscript` joins with a newline if needed and re-caps to `DESCRIPTION_MAX`; sets `dictated=true` (dialog.tsx:75-83).
- Submit (`handleSubmit`) runs in a `useTransition`; calls `submitFeedbackAction({ kind, description, dictated, useAi: aiAvailable && useAi, route: window.location.pathname })`; success → success view, typed `{ok:false}` → inline error, transport rejection → "Couldn't send your report just now. Please try again." (dialog.tsx:85-106).
- `canSubmit = description.trim().length > 0 && !isPending` (dialog.tsx:108).
- Mid-send dismiss guard: Escape / outside-click / X cannot close while `isPending` (dialog.tsx:113-119).
- Success view: CheckCircle2 + "Report filed"; "Issue #{number} was created on GitHub. Thanks!" when `number > 0`, else "Thanks — your report was sent."; external link "View issue #{number}" / "Open the tracker"; "Done" button (dialog.tsx:122-147).
- State reset on each closed→open transition (dialog.tsx:64-73).

### Feedback server action (`app/feedback/actions.ts` + `lib/github-feedback.ts`)
- `submitFeedbackAction(input)` returns `{ ok: true; number; url } | { ok: false; error }` (actions.ts:15-17,47).
- Auth: returns `{ ok:false, error:"Please sign in to send feedback." }` if no authenticated user (actions.ts:50-51).
- Rate limits (in-memory, per user, per instance): burst `feedback:{user.id}` limit 3 (default 60_000ms window) → "You're sending these quickly — give it a minute and try again."; daily `feedback-day:{user.id}` limit 20 / `windowMs: 86_400_000` → "You've filed a lot of reports today — please try again tomorrow." (actions.ts:56-72; rate-limit.ts:44 default window 60_000).
- Validation `InputSchema`: `kind` ∈ `["bug","feature"]`; `description` trimmed `.min(1,"Please describe the issue.").max(5000)`; `dictated?` boolean; `route?` string `.max(300)`; `useAi?` boolean (actions.ts:19-30).
- PII sanitization `sanitizeReportText`: `redactPii` (bearer/JWT/api-key/AWS/Slack/token-URL/long-blob/messenger-link/@handle/email/intl+local phone/SA-ID-SSN/credit-card) → strip HTML tags → trim → cap (github-feedback.ts:39-85). If empty after sanitizing → "Please describe the issue." (actions.ts:86-89).
- Reporter reference: `findCampUserByAuthId(user.id)?.id || "unlinked"` — opaque camp id, never name/email; sentinel `"unlinked"` pre-invite (actions.ts:91-95).
- E2E test mode short-circuits: returns `{ ok:true, number:0, url:"https://github.com/RyRy79261/camp-404/issues" }` without calling AI/GitHub (actions.ts:97-100).
- Optional AI restructuring: `useAi ? await structureWithAi(kind, sanitized) : null`; any failure → null → plain body (actions.ts:102-103; feedback-ai.ts:71-103 returns `StructuredReport | null`).
- GitHub: requires `GITHUB_FEEDBACK_TOKEN` (missing → "Feedback isn't set up yet. Let a camp captain know."); repo from `GITHUB_FEEDBACK_REPO` or `DEFAULT_REPO = "RyRy79261/camp-404"`, must split into exactly 2 `owner/name` segments else "Feedback isn't configured correctly…" (actions.ts:114-132).
- POSTs `https://api.github.com/repos/{owner}/{name}/issues` with `AbortSignal.timeout(8000)`, headers incl. `X-GitHub-Api-Version: 2022-11-28`, `User-Agent: camp-404-feedback`; body `{ title, body, labels }` (actions.ts:135-155).
- Status mapping: 201 → validate `{number, html_url}` (malformed → "…couldn't read GitHub's reply."), 401 → "GitHub rejected the token…", 403/404 → "…unreachable right now.", 410 → "Issues are turned off…", other → "Couldn't file your report just now…"; network/timeout catch → "Couldn't reach the feedback tracker…" (actions.ts:157-188).
- Issue assembly (`buildFeedbackIssue`): labels `["bug","from-app"]` / `["enhancement","from-app"]`; title from first line capped at `TITLE_MAX = 100` (fallback "Bug report"/"Feature request"); body fenced description or AI structured sections + a `---` + PII-free footer (provenance, voice-dictated marker, opaque reporter id, sanitized route); body capped at `ISSUE_BODY_MAX = 60_000` (github-feedback.ts:28-32,178-199).

### Notification API routes (consumed by AcknowledgementGate)
- `GET /api/notifications/pending` (`runtime="nodejs"`, `dynamic="force-dynamic"`): unauthenticated → `{ pending: [] }` (not 401, gate is app-wide); no camp access (synthetic `id:""`) → `{ pending: [] }`; else `getPendingAcknowledgements(campUser.id)` (pending/route.ts:14-28).
- `POST /api/notifications/acknowledge` (`runtime="nodejs"`): body `z.object({ deliveryId: z.string().uuid() })`; no user → 401 `{error:"unauthorized"}`; bad body → 400 `{error:"invalid"}`; no camp access → `{ok:false}`; else `acknowledgeDelivery({ deliveryId, userId: campUser.id })` returning `{ ok }` (acknowledge/route.ts:13-36).

### FCM background service worker (`app/firebase-messaging-sw.js/route.ts`)
- Route handler serving the FCM compat background SW at root path `/firebase-messaging-sw.js` (`runtime="nodejs"`, `dynamic="force-dynamic"`). Generated (not committed) so config has a single source of truth (sw-route.ts:1-10).
- Interpolates `NEXT_PUBLIC_FIREBASE_*` env (apiKey, authDomain, projectId, messagingSenderId, appId, each `?? ""`) into the SW body (sw-route.ts:12-18).
- SW imports Firebase 12.14.0 compat scripts, initializes the app, and `onBackgroundMessage` shows a notification titled `payload.notification.title || "Camp 404"`, body `n.body || ""`, `icon: "/icon.svg"`, `data: payload.data || {}` (sw-route.ts body string).
- Response headers: `Content-Type: text/javascript; charset=utf-8`, `Cache-Control: public, max-age=0, must-revalidate`, `Service-Worker-Allowed: "/"` (sw-route.ts).

### Boot-time env assertion (`instrumentation.ts` + `lib/env.ts`)
- `register()` runs once on server boot; calls `assertServerEnv()` only when `process.env.NEXT_RUNTIME === "nodejs"` AND `process.env.NEXT_PHASE !== "phase-production-build"` (skips Edge runtime and the build-data-collection phase) (instrumentation.ts:15-22).
- `assertServerEnv(env=process.env)`: no-op when `env.E2E_TEST_MODE === "1"`; iterates `REQUIRED` and throws a multi-line actionable error listing every missing/too-short var (env.ts:32-56).
- `REQUIRED`: a single var `PGCRYPTO_KEY`, `minLength: 16`, hint "16+ required, 32+ recommended (e.g. `openssl rand -base64 32`). Encrypts member ID-document PII at rest." — without it, questionnaire saves with a government ID number throw mid-flow (env.ts:20-26, 1-12).

## User actions & interactions
- **Acknowledge an announcement**: scroll the full-screen takeover to the bottom, press "Acknowledge" → POST acknowledge → item dismissed, next surfaces, server components refresh.
- **Shake to report**: physically shake the device (5 jolts / 800ms window / 3s cooldown / threshold 8) while signed in → opens the bug/feature dialog. (First signed-in `pointerdown` triggers the iOS motion-permission prompt where applicable.)
- **File a bug/feature report**: choose Bug or Feature, type a description (or tap "Dictate instead" to record voice that appends to the description), optionally toggle "Improve with AI", press "Send report"; on success follow the issue link or press "Done"; "Cancel" closes (disabled while sending).
- **Recover from an error**: press "Try again" (`reset()`) or "Back to camp" (`/`) on the segment error boundary; "Try again" on the root error boundary.
- **Escape a 404**: press "Back to camp" → `/`.
- **Install as PWA / receive push**: add to home screen via the manifest; FCM background notifications shown by the service worker.
- Implicit: every page-internal navigation refreshes server components on session change (`onSessionChange → router.refresh()`); pinch-zoom is disabled (`maximumScale: 1`).

## States & presentations
Global-states rows as they apply to this shell unit:
- **Empty**: AcknowledgementGate renders nothing when the pending queue is empty (`return null`); FeedbackGate renders nothing when signed out (`return null`).
- **Loading**: FeedbackGate treats `authClient.useSession().isPending` as not-signed-in (no listener). Report dialog Send button shows `Loader2` spinner + "Sending…" while `isPending`. Acknowledge button shows `Loader2` while `acking`.
- **Populated**: AcknowledgementGate shows the oldest pending item; "{N} more after this." when the queue length > 1.
- **Validation-error**: report dialog Send is disabled until `description.trim().length > 0`; server action returns inline typed errors (rendered in a `role="alert"` banner); acknowledge route returns 400 on a non-uuid `deliveryId`.
- **Submitting/pending**: report dialog blocks dismiss while sending; rate-limit caps (burst 3, daily 20) return "slow down"/"too many" errors.
- **Success**: report dialog success view ("Report filed", optional issue # link); acknowledge dismisses + refreshes.
- **Disabled**: report Cancel disabled while pending; Send disabled when description empty or pending; pinch-zoom disabled globally.
- **Error**: `error.tsx` (segment) and `global-error.tsx` (root layout) boundaries; in-shell `not-found.tsx`.
- **Invite-gated / Onboarding-incomplete / Pending-approval / Rejected / Captain-only-locked**: NOT enforced by this shell — those gates live in `app/page.tsx` (the gating spine, adjacency unit) and individual surfaces. The shell-level notification routes only short-circuit to an empty list / `{ok:false}` when the signed-in user has no camp access (`!hasCampAccess`), avoiding a 500 on a synthetic empty id; this is a no-data degradation, not a routed gate.
- **Unauthenticated**: `/api/notifications/pending` returns `{ pending: [] }` (no 401) so the app-wide gate is silent on public pages; FeedbackGate shows nothing.
- **Theme**: dark-only — `<html class="dark">` set client-side by the provider; `global-error.tsx` hardcodes the dark palette inline since CSS vars are unavailable when the layout never rendered.

## Enums, options & configurable values
- Site constants: `SITE_URL = "https://camp-404.com"`, `SITE_DESCRIPTION = "A calm command centre for a chaotic desert."` (layout.tsx:7-8).
- Theme color / background hex: `#0d061e` (viewport themeColor, manifest background_color + theme_color, og `BACKGROUND`, icon.svg). Root-error button magenta `#ef1ec1`; root-error text `#f6eef7`.
- OG/icon palette: `FOREGROUND="#f7ecf3"`, `MUTED="#b29ab0"`, `MAGENTA="rgba(255,0,140,0.92)"`, `CYAN="rgba(0,220,255,0.92)"`; icon.svg fills `#ff008c`/`#00dcff`/`#f7ecf3`.
- Share image: `SHARE_SIZE = { width: 1200, height: 630 }`, `SHARE_CONTENT_TYPE = "image/png"`, `SHARE_ALT` (full string above). Apple icon `{ width:180, height:180 }`, `image/png`.
- Manifest: `display: "standalone"`, `start_url: "/"`, icon purposes `"any"` + `"maskable"`.
- AcknowledgementGate: `POLL_INTERVAL_MS = 45_000`; overlay `z-[100]`; content `max-w-2xl`.
- Shake config defaults: `threshold=8`, `requiredJolts=5`, `windowMs=800`, `cooldownMs=3000`, `SAMPLE_THROTTLE_MS=60`.
- `motionPermissionResult` ∈ `"granted" | "denied" | "unsupported"`.
- FeedbackKind ∈ `"bug" | "feature"` (github-feedback.ts:9). Issue labels: bug→`["bug","from-app"]`, feature→`["enhancement","from-app"]`.
- StructuredReport.severity ∈ `"critical" | "high" | "medium" | "low"` (github-feedback.ts:18).
- Feedback caps: `DESCRIPTION_MAX = 5000`, `TITLE_MAX = 100`, `ISSUE_BODY_MAX = 60_000`; `route` max 300; burst limit 3 / 60_000ms, daily limit 20 / 86_400_000ms; GitHub `AbortSignal.timeout(8000)`; `DEFAULT_REPO = "RyRy79261/camp-404"`.
- Notification `presentation` enum (`broadcast_presentation`): `"acknowledge" | "popup" | "feed"` (schema.ts:166-169); the gate surfaces only `"acknowledge"`. `notification_deliveries.presentation` defaults `"feed"` (schema.ts:846-848).
- Env vars referenced: `ANTHROPIC_API_KEY` (aiAvailable), `PGCRYPTO_KEY` (required, minLength 16), `E2E_TEST_MODE` ("1" skips assert + AI/GitHub), `NEXT_RUNTIME` ("nodejs"), `NEXT_PHASE` ("phase-production-build"), `GITHUB_FEEDBACK_TOKEN`, `GITHUB_FEEDBACK_REPO`, `NEXT_PUBLIC_FIREBASE_{API_KEY,AUTH_DOMAIN,PROJECT_ID,MESSAGING_SENDER_ID,APP_ID}`.
- FCM SW: Firebase compat version `12.14.0`; SW notification fallback title "Camp 404"; SW `Cache-Control: public, max-age=0, must-revalidate`, `Service-Worker-Allowed: "/"`.

## Data model touched
This unit reads/writes via `lib/notifications.ts` facade → `@camp404/db/broadcasts` (or the in-memory test store under E2E mode). It does NOT write any user/team/profile tables itself.
- **`notification_deliveries`** (schema.ts:830-863) — the only table the AcknowledgementGate touches.
  - Read by `getPendingAcknowledgements(userId)` (broadcasts.ts:403-430): selects `id` (→`deliveryId`), `title`, `body`, joined `users.displayName` (→`senderName`, nullable), `createdAt`; filtered `userId = …` AND `presentation = 'acknowledge'` AND `acknowledgedAt IS NULL`; ordered by `createdAt` ascending (oldest first).
  - Written by `acknowledgeDelivery({deliveryId,userId})` (broadcasts.ts:437-454+): sets `acknowledgedAt = now`, `readAt = now`; predicate `id = deliveryId` AND `userId = userId` AND `presentation = 'acknowledge'` AND `acknowledgedAt IS NULL`; returns whether a row was affected (boolean).
  - Relevant columns: `id` uuid PK, `broadcastId` uuid (FK→broadcasts, cascade, nullable), `userId` uuid (FK→users, cascade, notNull), `title` text notNull, `body` text notNull, `channel` enum notNull, `presentation` enum notNull default `"feed"`, `pushStatus` enum default `"queued"`, `refType` text, `refId` uuid, `readAt` ts, `acknowledgedAt` ts, `deliveredAt` ts, `createdAt` ts notNull defaultNow.
- **`broadcasts`** + **`users`** — read-only join targets in `getPendingAcknowledgements` (`broadcasts.senderId → users.displayName` for `senderName`).
- DTO shapes consumed client-side: `PendingItem` (ack-gate.tsx:18-24) = `{ deliveryId: string; title: string; body: string; senderName: string | null; createdAt: string }` — mirrors `PendingAcknowledgement` (broadcasts.ts:390-396) `{ deliveryId, title, body, senderName: string|null, createdAt: Date }` (Date serialized to string over the API).
- **Feedback path stores nothing in our DB** — GitHub Issues is the store; only an opaque camp user id (`reporterRef`) is exposed.
- **GitHub issue payload**: `{ title, body, labels }` (see assembly above).

## Validation, edge cases & business rules
- **Auth depth-in-defence (feedback)**: FeedbackGate gates the shake listener on the live client session AND the server action re-checks auth (`getAuthenticatedUser`).
- **No-camp-access guard (notifications)**: both notification routes call `hasCampAccess(campUser, user.primaryEmail)`; a signed-in but non-camp user yields a synthetic `id:""` row from `ensureCampUser`, and querying with the empty id "500s on a real DB", so the routes return empty/`{ok:false}` instead.
- **Acknowledge ownership/idempotency**: the DB update is scoped to `userId` and `acknowledgedAt IS NULL` and `presentation='acknowledge'`, so a member can only dismiss their own outstanding full-screen deliveries, and never stamps an acknowledge on a popup/feed delivery (schema/broadcasts comments).
- **Poll race**: `requestIdRef` monotonic token drops superseded responses; `acknowledge()` bumps the token so an in-flight poll can't re-add a just-dismissed item.
- **Scroll lock cleanup**: body `overflow` is captured before forcing `"hidden"` and restored exactly on unmount, so nested overlays don't strand a locked scroll.
- **Dialog dismiss-while-sending**: blocked so the GitHub response/error is never lost; Cancel disabled while pending.
- **Feedback empty-after-sanitize**: HTML-only or PII-only input that sanitizes to empty is rejected with "Please describe the issue." (never files a blank issue).
- **PII redaction order**: secrets matched before generic patterns "before generic patterns split them apart"; international phone regex deliberately consumes all trailing digit groups so the last group can't leak.
- **Markdown-injection hardening**: user/AI free text is fenced (`fenced`, backticks defused to `'''`), inline-coded (`inlineCode` strips backticks + newlines for reporter id/route), or `mdInline`'d (AI prose) so it can't inject headings/fences/blockquotes/lists; AI fields are re-sanitized because "the model can echo PII".
- **GitHub 201-shape validation**: response validated with `GithubIssueSchema` (`number` + `html_url` URL) rather than cast; malformed 201 → "filed, but we couldn't read GitHub's reply."
- **Rate limiter caveat**: in-memory + per-instance, so "best-effort against a determined member"; the daily ceiling exists because the destination is a public tracker.
- **Repo is PUBLIC**: issue bodies are world-readable — never put reporter name/email in the body, only the opaque camp id; the dialog also warns "please don't include personal details."
- **E2E test mode**: `assertServerEnv` no-ops; the feedback action returns a synthetic success without AI/GitHub; notifications route through the in-memory test store.
- **Env fail-fast**: a missing/short `PGCRYPTO_KEY` throws at boot (loud) rather than failing a member's questionnaire save mid-flow (silent); skipped during `next build` and on the Edge runtime.
- **Error-boundary a11y**: both boundaries move focus to the heading (`tabIndex={-1}`) so AT/keyboard users are told the segment was swapped to an error state.
- **`global-error.tsx` self-containment**: must ship its own `<html>`/`<body>` and inline styles because the root layout never rendered and app CSS vars are unavailable.
- **Mobile-first chrome**: `maximumScale: 1` disables pinch-zoom; 404/error pages use `max-w-lg`; ack overlay uses `max-w-2xl` (wider than the app's `max-w-lg`, since it's a full-screen reading takeover, not an in-app surface).
- **Satori quirk**: `Glitch404` only sets `textShadow` when `glow` is truthy because Satori chokes on `textShadow: undefined`.

## Sub-components / variants
- **`Providers`** — client wrapper; the only thing flipping the dark class and refreshing on session change. No variants.
- **`AcknowledgementGate`** — singleton; surfaces ONLY `presentation='acknowledge'` deliveries (popup/feed never appear here — popup handling is a different surface, not in this unit).
- **`FeedbackGate`** — singleton; shake-only trigger. Note (load-bearing): commit history (`655c5e1`, `141c676`) shows a floating feedback button was REMOVED in favor of shake-only; there is no longer a tappable launcher in this shell.
- **`ReportBugDialog`** — props `{ open, onOpenChange, defaultKind="bug", aiAvailable=false }`. Two presentations: form view and success view. The "Improve with AI" block is conditional on `aiAvailable`. The `RecorderPanel` integration intentionally passes NO `promptKey` (generic transcription) — comment notes the transcribe route has no bug-report prompt.
- **`Glitch404`** — shared private sub-component of og-image; two call sites (share card with glow, square icon without). `icon.svg` is a hand-authored static equivalent (monospace, not Satori), used for the favicon + manifest `"any"` icon + FCM SW notification icon.
- **`renderShareImage` / `renderSquareIcon`** — shared renderers behind 3 file-based routes (`opengraph-image`, `twitter-image`, `apple-icon`).
- **`error.tsx` vs `global-error.tsx`** — segment boundary (inside shell, retry + home) vs root boundary (replaces shell, inline-styled, retry only).
- **Server handlers/validators in this unit**: `GET /api/notifications/pending`, `POST /api/notifications/acknowledge` (Zod `{deliveryId: uuid}`), `submitFeedbackAction` (Zod `InputSchema`), `GET /firebase-messaging-sw.js`, `register()` / `assertServerEnv()`.
- **Dead/orphaned**: none confirmed in this unit. The `firebase-messaging-sw.js` route notes a static-export (MOBILE_BUILD) build has no route handlers, so the SW is web-only — a documented degradation, not dead code.

---

# 25 — Global dialogs & feedback (ack-gate, shake-to-report, error)

**Files covered:**
- `apps/web/app/acknowledgement-gate.tsx` — full-screen takeover overlay that polls for and clears the signed-in member's unacknowledged `presentation='acknowledge'` notification deliveries.
- `apps/web/app/feedback-gate.tsx` — invisible mount that wires shake detection (live-session gated) to open the bug/feature dialog; requests iOS motion permission.
- `apps/web/components/feedback/report-bug-dialog.tsx` — the bug/feature report modal (kind toggle, description, voice dictation, optional AI restructure, submit/success/error states).
- `apps/web/components/feedback/use-shake-gesture.ts` — pure shake-detection state machine + React hook + iOS motion-permission helpers.
- `apps/web/app/feedback/actions.ts` — `submitFeedbackAction` server action: auth gate, rate limits, validation, sanitization, optional AI, GitHub issue POST, typed result.
- `apps/web/lib/feedback-ai.ts` — `structureWithAi` optional Claude pass that restructures a raw report into a structured issue (fail-safe → null).
- `apps/web/lib/github-feedback.ts` — pure helpers: PII redaction, sanitization, Markdown-safe escaping, label selection, issue title/body assembly.
- `apps/web/app/error.tsx` — Next.js route-segment error boundary with retry + "back to camp" escape.

Supporting imports read for accuracy: `apps/web/app/layout.tsx` (mount point + `aiAvailable` prop), `apps/web/app/api/notifications/pending/route.ts`, `apps/web/app/api/notifications/acknowledge/route.ts`, `apps/web/lib/rate-limit.ts`, `apps/web/lib/anthropic.ts`, `apps/web/components/voice/recorder-panel.tsx`, `apps/web/lib/notifications.ts`, `packages/db/src/broadcasts.ts`, `packages/db/src/schema.ts`.

**Purpose:** Three globally-mounted overlays/surfaces that sit above the whole app shell. (1) The **AcknowledgementGate** is a full-screen modal takeover that forces the signed-in member to read and explicitly acknowledge each `presentation='acknowledge'` announcement before it dismisses, polling continuously so newly-published announcements interrupt promptly. (2) The **FeedbackGate / ReportBugDialog** is a shake-triggered bug/feature reporter that, after optional AI restructuring and mandatory PII redaction, files a GitHub issue on a public tracker (no DB write). (3) The **route error boundary** catches uncaught render/server-action errors and keeps the user inside the shell with a retry or a home escape. All three are mounted once in the root layout (the first two as siblings in `app/layout.tsx:52-55`) and self-gate on auth/session so they do nothing for logged-out visitors.

## Features

### AcknowledgementGate (acknowledgement-gate.tsx)
- Mounted once in the root layout (`layout.tsx:52`); renders `null` on every page until a pending item exists (`acknowledgement-gate.tsx:83`).
- Polls `GET /api/notifications/pending` (`cache: "no-store"`) for the signed-in member's unacknowledged `acknowledge` deliveries (`:40-42`). Loads on mount, on a `POLL_INTERVAL_MS = 45_000` interval (`:26`, `:56`), AND on tab `visibilitychange`→visible and window `focus` (`:57-61`) so a freshly-published announcement surfaces promptly.
- **Monotonic request token** (`requestIdRef`, `:35`): overlapping polls (interval vs. focus) are de-raced — only the latest request applies its result; a superseded older response is dropped (`:38`, `:45`).
- Renders a queue (`PendingItem[]`); always shows `queue[0]` = `current` (`:69`). Oldest-first ordering comes from the server query (`broadcasts.ts:428`, `orderBy createdAt`).
- **Body scroll lock**: while `current` exists, sets `document.body.style.overflow = "hidden"` and restores the previous value on unmount/change (`:73-81`); also resets the modal scroll position to top whenever a new notification surfaces (`:77`).
- Header shows a `Megaphone` icon + uppercase label "Camp announcement" (`:117-120`), the title (`current.title`, `:124`), and a meta line: `From {senderName} · {localized createdAt}` — the "From …" prefix is omitted when `senderName` is null (`:126-129`). `createdAt` is formatted with `new Date(...).toLocaleString()` (`:128`).
- Body rendered with `whitespace-pre-wrap` (preserves the announcement's line breaks) (`:131-133`).
- **Acknowledge button sits at the END of the scroll, not pinned** — the member must scroll the whole message to reach it (`:135-153`). When `queue.length > 1`, a "{queue.length - 1} more after this." line is shown above the button (`:138-142`).
- On acknowledge: `POST /api/notifications/acknowledge` with `{ deliveryId }` (`:88-92`); on `res.ok`, bumps `requestIdRef.current++` so any in-flight poll can't re-add the just-dismissed item (`:95`), removes the item from the queue revealing the next (`:97`), and calls `router.refresh()` so server components (e.g. unread badge / inbox) reflect it (`:99`). On a non-ok response it silently returns (no item removed) (`:93`).

### FeedbackGate (feedback-gate.tsx)
- Mounted once in the root layout, sibling to AcknowledgementGate (`layout.tsx:55`), receiving `aiAvailable={!!process.env.ANTHROPIC_API_KEY}` — a server-only env check passed down to gate the "Improve with AI" toggle (`layout.tsx:55`, `feedback-gate.tsx:22`).
- **Live-session gate**: reads `authClient.useSession()`; `signedIn = !isPending && !!session` (`:23-24`). Shake listener is attached only while `signedIn && !open`; it detaches immediately on sign-out (`:27`). Renders `null` (no dialog at all) when not signed in (`:41`). The server action enforces auth too as defence in depth (`:18-21` comment).
- **Shake is the only trigger** (no floating button) — matches RyRy79261/intake-tracker's ShakeToReport (`:14-15` comment).
- Shake detection pauses while the dialog is open (`!open` in the `enabled` predicate, `:27`).
- **iOS 13+ motion permission**: when `signedIn && motionPermissionNeeded()`, registers a one-time `pointerdown` listener that calls `requestMotionPermission()` on the first user gesture (`:32-39`).
- Renders `<ReportBugDialog open onOpenChange aiAvailable />` (`:43-49`).

### ReportBugDialog (report-bug-dialog.tsx)
- Bug/feature report modal. **Files a GitHub issue via the server action — nothing is stored in our DB** (`:40-41` comment).
- **Kind toggle**: two buttons, Bug (`Bug` icon) and Feature (`Lightbulb` icon); selected kind uses `variant="default"`, the other `variant="outline"`; `aria-pressed` reflects selection; `role="group" aria-label="Report type"` (`:162-189`).
- **Title/description copy is kind-dependent**: title "Report a bug" / "Request a feature" (`:151-153`); label "What went wrong?" / "What would you like to see?" (`:194-196`); placeholder "What you did, what you expected, and what happened instead." / "Describe the capability or improvement you have in mind." (`:204-208`).
- **Description textarea**: `rows={6}`, `maxLength={DESCRIPTION_MAX}` (= 5000) (`:198-209`).
- **Voice dictation**: a "Dictate instead" button (`Mic` icon) swaps in a `RecorderPanel` (the shared voice pipeline) (`:213-232`). Transcripts are APPENDED to the description via `appendTranscript` (`:75-83`): trims, ignores empty, sets `dictated=true`, joins with a newline only if the existing text doesn't already end in whitespace/newline, and re-clamps the combined text to `DESCRIPTION_MAX` (`:79-82`). No `promptKey` is passed — dictation runs with the generic, unbiased transcription (`:215-217` comment).
- **"Improve with AI" checkbox**: rendered ONLY when `aiAvailable` (`:235`). Default-checked (`useAi` initialises `true`, `:56`). Helper copy: "Improve with AI" / "Restructures your report into a clear title and steps before filing." (`:246-250`).
- **Submit** (`Send report`): calls `submitFeedbackAction({ kind, description, dictated, useAi: aiAvailable && useAi, route: window.location.pathname })` inside a transition (`:85-106`). The effective `useAi` is forced false when AI is unavailable (`:93`).
- **Success view**: replaces the form. Shows `CheckCircle2` + "Report filed"; description is `Issue #{number} was created on GitHub. Thanks!` when `number > 0`, else "Thanks — your report was sent." (`:122-133`). A link (`ExternalLink` icon) opens `result.url` in a new tab labelled `View issue #{number}` (or "Open the tracker" when `number ≤ 0`) (`:135-143`). A "Done" button closes (`:144-146`).
- **Form reset** on every closed→open transition (`:64-73`): resets kind→defaultKind, description→"", dictating→false, dictated→false, useAi→true, error→null, result→null.
- **Mid-send dismissal guard**: Escape / outside-click / X cannot close the dialog while `isPending` (the `onOpenChange` wrapper returns early) (`:111-119`); Cancel is also `disabled` while pending (`:269`).

### use-shake-gesture.ts (use-shake-gesture.ts)
- `motionPermissionNeeded()`: true only on browsers (iOS 13+) where `DeviceMotionEvent.requestPermission` is a function (`:21-32`).
- `requestMotionPermission()`: returns `"granted" | "denied" | "unsupported"`; on non-iOS (`requestPermission` absent) returns `"granted"`; catches a rejected prompt as `"denied"` (`:34-52`).
- `createShakeDetector(config)`: pure, DOM-free state machine (`:87-115`). For each sample it computes the **acceleration magnitude** `√(x²+y²+z²)` (`:76-80`), which is rotation-invariant so tilting (redistributing gravity, magnitude ≈ 9.8) does not register — only real movement does (`:62-66` comment). When `|mag − lastMag| > threshold` it records a jolt timestamp (`:96-97`). Jolts older than `windowMs` are pruned (`:101`). A shake fires when `jolts.length >= requiredJolts` AND `now − lastShakeAt >= cooldownMs` (`>=` is inclusive, matching the `<=` window boundary) (`:102-111`); on fire it stamps `lastShakeAt`, clears jolts, returns true.
- `useShakeGesture({ enabled, onShake, … })`: attaches a `devicemotion` listener while `enabled` (`:144-171`). Reads `event.accelerationIncludingGravity`; bails if any axis is null (`:157-158`). Throttles samples to one per `SAMPLE_THROTTLE_MS = 60` (`:153`, `:161-162`). Uses an `onShakeRef` so a changing callback doesn't re-bind the listener (`:141-142`).

### submitFeedbackAction (feedback/actions.ts)
- `"use server"` action; sole entry for filing feedback. Returns `FeedbackResult` (a discriminated union, see Enums).
- **Auth gate**: `getAuthenticatedUser()`; if absent → `{ ok:false, error:"Please sign in to send feedback." }` (`:50-51`).
- **Rate limits** (in-memory, per-process; best-effort) (`:54-72`): burst `feedback:{user.id}` at `{ limit: 3 }` (default 60s window) → "You're sending these quickly — give it a minute and try again."; daily `feedback-day:{user.id}` at `{ limit: 20, windowMs: 86_400_000 }` → "You've filed a lot of reports today — please try again tomorrow."
- **Input validation** via `InputSchema.safeParse`; on failure returns the first Zod issue message or "Invalid input." (`:74-80`).
- **Sanitize once** (`sanitizeReportText(description, DESCRIPTION_MAX)`): if empty after PII/HTML stripping → "Please describe the issue." (so a blank/HTML-only issue is never filed); the clean text is reused as the AI input so no PII reaches the model (`:83-89`).
- **Opaque reporter reference**: `findCampUserByAuthId(user.id)?.id`; for a signed-in user with no camp row yet (pre-invite) uses the sentinel string `"unlinked"` rather than the raw, more-linkable auth id (`:91-95`).
- **E2E bypass**: under `isE2ETestMode()` returns `{ ok:true, number:0, url:"https://github.com/RyRy79261/camp-404/issues" }` without calling AI or GitHub — exercises auth + validation only (`:97-100`).
- **Optional AI restructure**: `useAi ? structureWithAi(kind, sanitized) : null`; null on any failure → plain body (`:102-103`).
- **Issue assembly**: `buildFeedbackIssue({ kind, description: sanitized, dictated ?? false, reporterRef, route, structured })` (`:105-112`).
- **Config gates**: missing `GITHUB_FEEDBACK_TOKEN` → "Feedback isn't set up yet. Let a camp captain know." (`:114-121`). `GITHUB_FEEDBACK_REPO` (default `RyRy79261/camp-404`) must split on `/` into exactly 2 non-empty segments else "Feedback isn't configured correctly. Let a camp captain know." (`:123-132`).
- **GitHub POST**: `POST https://api.github.com/repos/{owner}/{name}/issues` with `Authorization: Bearer {token}`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, `User-Agent: camp-404-feedback`; body `{ title, body, labels }`; bounded by `AbortSignal.timeout(8000)` (`:134-155`).
- **Response handling** (`:157-188`): `201` → validate against `GithubIssueSchema` ({ number, html_url url }); on validate failure → "Your report was filed, but we couldn't read GitHub's reply."; on success → `{ ok:true, number, url:html_url }`. Status-specific errors: `401` → "GitHub rejected the token — a captain needs to refresh it."; `403`/`404` → "The feedback tracker is unreachable right now."; `410` → "Issues are turned off on the tracker repo."; any other → "Couldn't file your report just now. Please try again."; a thrown error (timeout/network) → "Couldn't reach the feedback tracker. Please try again."

### structureWithAi (lib/feedback-ai.ts)
- Optional "Improve with AI" pass; restructures a (already-sanitized) raw report into a structured issue. **Additive and fail-safe — any problem returns `null` and the caller files the plain template** (`:7-12` comment).
- Calls `anthropic().messages.create` with `model: MODELS.haiku` (`"claude-haiku-4-5-20251001"`), `max_tokens: 1024`, `temperature: 0`, the `SYSTEM_PROMPT`, a single `format_report` tool, forced `tool_choice: { type:"tool", name:"format_report" }`, request `{ timeout: 30_000 }` (`:76-92`).
- Extracts the `tool_use` block named `format_report`; if absent → null (`:94-97`). Validates the tool input against `StructuredSchema`; returns the parsed data or null (`:99-100`). Any thrown error is logged and returns null (`:101-104`).
- `SYSTEM_PROMPT` rules (verbatim, `:56-65`): faithful to the user's report (never invent steps/symptoms/facts); concise specific title (not "App is broken"); for a bug extract steps/expected/actual only if provided (leave empty otherwise, don't guess); for a feature put the request in summary and leave steps/expected/actual empty; severity is a rough triage hint (crash/data-loss = critical or high); leave PII placeholders like `[email]`/`[redacted]` as-is; always call the `format_report` tool, never reply with prose only.

### github-feedback.ts (lib/github-feedback.ts)
- Pure, I/O-free helpers (the action does the fetch) so they stay unit-testable (`:1-2` comment). Repo is PUBLIC, so issue bodies are world-readable: every free-text piece is PII-redacted and a reporter's name/email is never put in the body — only the opaque camp user id (`:3-7` comment).
- `labelsFor(kind)`: bug → `["bug","from-app"]`; feature → `["enhancement","from-app"]`. `from-app` marks provenance; missing labels auto-created by the issues API (`:25-32`).
- `redactPii(input)`: see Validation section for the full pattern list.
- `sanitizeReportText(text, maxLength)`: `redactPii` → strip HTML tags `<[^>]*>` → trim → `slice(0, maxLength)`; empty input returns "" (`:79-85`).
- `buildFeedbackIssue(input)`: assembles `{ title, body, labels }`. Footer is a PII-free provenance line; body sections come from `plainParts` or `structuredParts`; final body is `[...sections, "---", footer].join("\n\n").slice(0, ISSUE_BODY_MAX)` (`:178-200`). Markdown-escaping helpers: `fenced` (code-fence + defuse ``` ``` ``` → `"''' "`), `inlineCode` (strip backticks + collapse newlines, for footer reporter/route), `mdInline` (defuse fences + collapse newlines, for AI prose) (`:87-111`).

### Error boundary (app/error.tsx)
- Default-exported Next.js route-segment error boundary catching uncaught errors thrown while rendering a page or running a server action in the app tree (`:6-11` comment). Receives `{ error: Error & { digest?: string }, reset }` (`:11-17`).
- On error: `console.error(error)` for diagnostics (the digest correlates with the server log) and moves focus to the heading (`tabIndex={-1}`) so SR/keyboard users are told the segment swapped to an error state (`:19-26`).
- Renders a centered card: heading "Something went sideways.", body "An unexpected error tripped us up. Try again — if it keeps happening, let a camp captain know." (`:31-41`), and two actions: "Try again" (`onClick={reset}` re-renders the failed segment) and an outline "Back to camp" link to `/` (`:43-48`).

## User actions & interactions
- **Acknowledge an announcement** — scroll the full-screen takeover to its end, press "Acknowledge"; dismisses the current item and reveals the next (AcknowledgementGate).
- **Open the bug/feature reporter** — physically shake the device (only trigger; only while signed in and the dialog isn't already open).
- **Grant motion permission** — (iOS 13+) the first `pointerdown` after sign-in silently triggers the OS motion-permission prompt.
- **Toggle report kind** — tap Bug or Feature.
- **Type the description** — into the textarea (max 5000 chars).
- **Dictate** — tap "Dictate instead" → record via RecorderPanel; transcript appends to the description; panel stays open for another recording until dismissed.
- **Toggle "Improve with AI"** — checkbox (only when the server has a Claude key; default on).
- **Send report** — files the GitHub issue; button shows a spinner + "Sending…" while pending.
- **Cancel** — closes the dialog (disabled while sending).
- **View filed issue / Done** — from the success view, open the GitHub issue in a new tab, or press Done to close.
- **Retry after error / go home** — on the error boundary, press "Try again" (re-render) or "Back to camp" (navigate to `/`).

## States & presentations
Global-states rows that apply to this unit:
- **Empty** — AcknowledgementGate renders `null` when the pending queue is empty (the common case, including all unauthenticated pages). ReportBugDialog: the description starts empty; submit disabled.
- **Loading** — AcknowledgementGate has no spinner for the initial poll (it simply shows nothing until data arrives). FeedbackGate during `authClient.useSession()` `isPending` treats the user as not-signed-in (renders nothing). RecorderPanel has `requesting` ("Allow microphone…") and `processing` ("Transcribing…") busy states.
- **Populated** — AcknowledgementGate shows `queue[0]` with title/sender/body and "{n} more after this." when queue length > 1. ReportBugDialog shows the full form.
- **Validation-error** — server action returns the first Zod message ("Please describe the issue." for empty, etc.); textarea also enforces `maxLength`; submit button disabled until `description.trim().length > 0`. The acknowledge POST validates `deliveryId` as a UUID (400 on failure).
- **Submitting/pending** — Acknowledge button shows a `Loader2` spinner and is `disabled` while `acking`. ReportBugDialog: `Send report` → spinner + "Sending…"; Cancel disabled; dialog cannot be dismissed by Escape/outside-click/X mid-send.
- **Success** — ReportBugDialog swaps to the "Report filed" view with issue number + link. Acknowledge success removes the item and refreshes server components.
- **Disabled** — submit disabled when description is empty or pending; Cancel disabled while pending; RecorderPanel close/record buttons disabled while recording/busy.
- **Invite-gated / pre-invite** — `submitFeedbackAction` still works for a signed-in user with no camp row, using the `"unlinked"` reporter sentinel. The pending-acknowledgements route returns an empty list for a signed-in user without camp access (`hasCampAccess` false → no deliveries to query).
- **Onboarding-incomplete / pending-approval / rejected** — not specifically gated here; the gates self-gate only on auth/session, so a signed-in member at any onboarding stage can still receive acknowledge takeovers and file feedback (subject to camp-access for the ack queue).
- **Captain-only-locked** — not applicable; both surfaces are member-level.
- **AI-unavailable** — when `aiAvailable` is false the "Improve with AI" checkbox is not rendered and `useAi` is forced false in the submit call.
- **Config-error** — missing GitHub token / misconfigured repo surface as inline `{ok:false}` error banners.
- **Error boundary** — full-screen error state with retry + home escape; focus moved to heading.
- **RecorderPanel sub-states** — `requesting`, `recording` (timer mm:ss + waveform + Stop button), `processing`, `error` ("Tap to retry"), idle ("Tap to record").

## Enums, options & configurable values
- `FeedbackKind = "bug" | "feature"` (`github-feedback.ts:9`); default in dialog is `"bug"` (`report-bug-dialog.tsx:49`).
- `FeedbackResult = { ok:true; number:number; url:string } | { ok:false; error:string }` (`actions.ts:15-17`).
- `StructuredReport.severity` enum: `"critical" | "high" | "medium" | "low"` (`github-feedback.ts:18`, `feedback-ai.ts:20`).
- `AnnouncementPresentation` / `broadcast_presentation` pgEnum: `"acknowledge" | "popup" | "feed"` — only `"acknowledge"` deliveries surface in the gate (`schema.ts:166-170`).
- `DESCRIPTION_MAX = 5000` (`github-feedback.ts:21`).
- `TITLE_MAX = 100` (private, `github-feedback.ts:22`).
- `ISSUE_BODY_MAX = 60_000` (GitHub hard limit is 65536) (`github-feedback.ts:23`).
- `POLL_INTERVAL_MS = 45_000` (`acknowledgement-gate.tsx:26`).
- Shake hook defaults: `threshold = 8`, `requiredJolts = 5`, `windowMs = 800`, `cooldownMs = 3000` (`use-shake-gesture.ts:134-139`); `SAMPLE_THROTTLE_MS = 60` (`:153`).
- Rate limits: burst `{ limit: 3 }` (default 60_000ms window), daily `{ limit: 20, windowMs: 86_400_000 }` (`actions.ts:56`, `:63-66`); `rate-limit.ts` default window 60_000.
- `DEFAULT_REPO = "RyRy79261/camp-404"` (`actions.ts:32`); overridable via `GITHUB_FEEDBACK_REPO` env.
- Env vars: `GITHUB_FEEDBACK_TOKEN` (required to file), `GITHUB_FEEDBACK_REPO` (optional override), `ANTHROPIC_API_KEY` (gates AI + `aiAvailable`), `E2E_TEST_MODE` (`="1"` bypasses AI+GitHub).
- AI model: `MODELS.haiku = "claude-haiku-4-5-20251001"`, `max_tokens: 1024`, `temperature: 0`, request `timeout: 30_000` (`feedback-ai.ts`, `anthropic.ts:18-21`).
- GitHub request timeout: `AbortSignal.timeout(8000)` (`actions.ts:141`).
- StructuredSchema bounds: `title` 1–140, `summary` 1–2000, `stepsToReproduce` array of ≤500-char strings, max 20 items, `expected`/`actual` ≤1000 (`feedback-ai.ts:14-21`). (Note: body assembly re-clamps summary to 2000, steps to 500, expected/actual to 1000, title to `TITLE_MAX=100` — `github-feedback.ts:147-169`.)
- InputSchema: `route` `z.string().max(300).optional()` (`actions.ts:27`).
- MotionPermissionResult: `"granted" | "denied" | "unsupported"` (`use-shake-gesture.ts:14`).
- Issue labels: `["bug","from-app"]` / `["enhancement","from-app"]` (`github-feedback.ts:28-32`).
- GitHub headers: `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, `User-Agent: camp-404-feedback` (`actions.ts:144-147`).

## Data model touched
**Reads / writes** `notification_deliveries` (`packages/db/src/schema.ts:830-863`) — the acknowledge gate's data source:
- `id` (uuid, PK) → exposed as `deliveryId`.
- `broadcastId` (uuid → broadcasts.id, on delete cascade) — joined to fetch sender.
- `userId` (uuid → users.id, on delete cascade) — the recipient; scopes every query.
- `title` (text, not null), `body` (text, not null) — shown in the takeover.
- `channel` (notification_channel enum, not null) — not surfaced by the gate.
- `presentation` (broadcast_presentation enum, not null, default `"feed"`) — gate filters to `"acknowledge"`.
- `pushStatus`, `refType`, `refId`, `deliveredAt` — untouched here.
- `readAt` (timestamp, nullable) — set to `now` on acknowledge.
- `acknowledgedAt` (timestamp, nullable) — gate surfaces rows where this is NULL; set to `now` on acknowledge.
- `createdAt` (timestamp, not null, default now) — order key + meta line.
- Indexes used: `notification_deliveries_user_ack_idx` on `(userId, acknowledgedAt)` (the gate's exact predicate), `notification_deliveries_user_read_idx`, `notification_deliveries_broadcast_idx` (`schema.ts:864-877`).

**Reads** `broadcasts` (left join via `broadcastId`) and `users` (left join via `broadcasts.senderId`) — only `users.displayName` is read, exposed as `senderName` (nullable) (`broadcasts.ts:412`, `:416-420`).

`PendingAcknowledgement` interface (DB layer): `{ deliveryId: string; title: string; body: string; senderName: string | null; createdAt: Date }` (`broadcasts.ts:390-396`). The client mirrors it as `PendingItem` but types `createdAt` as `string` (serialized over JSON) (`acknowledgement-gate.tsx:18-24`).

**Feedback path touches NO Camp 404 table for writes** — GitHub Issues is the store (`actions.ts:42-45` comment). It only READS the camp user row via `findCampUserByAuthId(user.id)` to obtain the opaque `id` as `reporterRef` (falls back to `"unlinked"`). The Better Auth user (`user.id`, `user.primaryEmail`) is read for the auth gate. No `StructuredReport` or issue text persists locally.

Acknowledge action input: `{ deliveryId: string (uuid); userId: string }` → `acknowledgeDelivery` UPDATE sets `{ acknowledgedAt: now, readAt: now }` WHERE `id = deliveryId AND userId = userId AND presentation = 'acknowledge' AND acknowledgedAt IS NULL`; returns whether a row was affected (`broadcasts.ts:437-458`).

## Validation, edge cases & business rules
- **Acknowledge POST**: `Body = z.object({ deliveryId: z.string().uuid() })` → 400 on invalid; unauthenticated → 401; no-camp-access → `{ ok:false }` (never queries with the synthetic empty id, which would 500 on a real DB) (`acknowledge/route.ts`).
- **Pending GET**: unauthenticated → `{ pending: [] }` (NOT 401 — the gate mounts app-wide including the public landing page); no-camp-access → `{ pending: [] }` for the same synthetic-id reason (`pending/route.ts`).
- **Acknowledge query scoping**: `acknowledgeDelivery` is owner-scoped AND presentation-scoped — a member can only dismiss their own deliveries, and a `popup`/`feed` delivery is never stamped acknowledged even if its id is passed (`broadcasts.ts:447-453`).
- **Poll de-race**: monotonic `requestIdRef` drops superseded poll responses; acknowledge bumps the same ref so an in-flight poll can't re-add a just-dismissed item (`acknowledgement-gate.tsx:38,45,95`).
- **Submit description**: required (`.min(1, "Please describe the issue.")`), trimmed, `.max(5000)`; the client also disables submit until non-empty trimmed (`actions.ts:21-26`, `report-bug-dialog.tsx:108`).
- **PII redaction (`redactPii`, ordered, github-feedback.ts:39-76)** — secrets first, then identifiers:
  - `Bearer <token>` → `Bearer [token]`; JWT `eyJ…` → `[jwt]`.
  - `sk-`/`pk-` keys (≥16) → `[secret]`; GitHub `gh[posu]_…` (≥20) → `[secret]`; AWS `AKIA…` (16) → `[secret]`; Slack `xox[baprs]-…` (≥10) → `[secret]`.
  - token-bearing URL params (`token|key|secret|sig|signature|password|access_token|code|auth`=) → `=…[redacted]`.
  - long opaque base64-ish runs (40+ chars) → `[redacted]`.
  - `t.me/`/`wa.me/` links → `[link]`; `@handle` (≥2) → `[handle]`.
  - email → `[email]`; international phone `+…` (consuming ALL trailing digit groups so the last group can't leak) → `[phone]`; local phone `123-456-7890` → `[phone]`.
  - 13-digit SA-ID run → `[id]`; SSN-like `\d{3}-\d{2}-\d{4}` → `[id]`; credit-card 16-digit group → `[card]`.
- **Empty-after-sanitize guard**: HTML-only or all-PII input becomes "" after sanitization → action returns "Please describe the issue."; no blank issue is filed (`actions.ts:86-89`).
- **AI input is the sanitized text**, not raw — no PII reaches the model; AI output is re-sanitized again when the body is assembled (the model can echo PII) (`actions.ts:85-86`, `github-feedback.ts:147,151`).
- **Markdown injection defence**: user/AI text is fenced (`fenced`), AI prose is `mdInline`'d (defuse fences + collapse newlines so it can't inject headings/blockquotes/lists), footer reporter/route are `inlineCode`'d (strip backticks so the inline-code span can't be broken out of) — `route` is client-supplied and treated as untrusted (`github-feedback.ts:87-111`, `:179-189`).
- **Title derivation (plain)**: first line of the sanitized description, sliced to 100 chars; falls back to "Bug report"/"Feature request" if empty (`github-feedback.ts:138-143`, `:133-135`).
- **Title derivation (AI)**: `sanitizeReportText(s.title, 100)` or the same fallback (`github-feedback.ts:152`).
- **Body cap**: final body sliced to `ISSUE_BODY_MAX = 60_000` (`github-feedback.ts:197`).
- **Rate limits are in-memory + per-instance** — best-effort against a determined member; the daily cap is a cheap second check because the destination is a public tracker (`actions.ts:54-55` comment).
- **GitHub timeout**: 8s `AbortSignal`; `structureWithAi` timeout 30s — a stalled GitHub or AI call can't hang the action (timeout maps to a retry message / null) (`actions.ts:141`, `feedback-ai.ts:91`).
- **Footer always present**: "Filed via the in-app reporter" (+ " (voice-dictated)" when `dictated`), `reporter: <id>`, and `from: <route>` when route present, joined with " · " (`github-feedback.ts:183-189`).
- **Shake robustness**: requires 5 jolts within an 800ms window with a 3000ms cooldown so a single bump or a phone settling into a pocket doesn't open the dialog; magnitude is rotation-invariant so reorientation doesn't register (`use-shake-gesture.ts:135-139`, `:62-66`).
- **iOS motion permission** is requested only once, only after sign-in, on the first pointer gesture (`feedback-gate.tsx:32-39`).
- **Body scroll lock** is restored to the previous value (not hard-coded to "") so a nested gate wouldn't clobber it (`acknowledgement-gate.tsx:75,79`).
- **Error boundary** correlates `error.digest` with server logs and focuses the heading for accessibility (`error.tsx:21-25`).

## Sub-components / variants
- **AcknowledgementGate** — single overlay; `role="dialog" aria-modal="true" aria-labelledby="ack-title"`, `z-[100]`, `max-w-2xl` scroll column (note: wider than the app's `max-w-lg` shell — this surface intentionally uses `max-w-2xl`).
- **FeedbackGate** — headless wrapper; renders only `ReportBugDialog` or `null`. Exposes the `aiAvailable` prop. Comment notes a previously-removed floating button — shake is now the ONLY trigger (`feedback-gate.tsx:13-15`).
- **ReportBugDialog** — two render branches by state: the **form view** and the **success view** (`result`). Accepts an unused-by-FeedbackGate `defaultKind?` prop (defaults `"bug"`; FeedbackGate never overrides it, so the dialog always opens on Bug). `aiAvailable?` defaults false.
- **RecorderPanel** (shared voice primitive, `components/voice/recorder-panel.tsx`) — embedded for dictation; states `requesting`/`recording`/`processing`/`error`/idle; big circular record button (`Mic`/`Square`/`Loader2`), `Waveform`, mm:ss timer; appends transcripts; invoked WITHOUT a `promptKey` (generic transcription). Detailed in the voice-pipeline unit; here it is a consumer.
- **use-shake-gesture.ts** exports: `motionPermissionNeeded`, `requestMotionPermission`, `createShakeDetector` (pure, unit-testable), `useShakeGesture`, and types `MotionPermissionResult`, `ShakeSample`, `ShakeDetectorConfig`, `UseShakeGestureOptions`.
- **submitFeedbackAction** — server action; validators/schemas: `InputSchema` (input), `GithubIssueSchema` (GitHub 201 response).
- **structureWithAi** — server-only; schema `StructuredSchema`, tool definition `FORMAT_TOOL` (name `"format_report"`, required `["title","summary"]`), `SYSTEM_PROMPT`.
- **github-feedback.ts** — pure functions: exported `labelsFor`, `redactPii`, `sanitizeReportText`, `buildFeedbackIssue`; private `fenced`, `inlineCode`, `mdInline`, `fallbackTitle`, `plainParts`, `structuredParts`; interfaces `StructuredReport`, `BuildIssueInput`, `BuiltIssue`; type `FeedbackKind`.
- **error.tsx** — default-exported client `Error` component (Next.js error-boundary contract: `{ error, reset }`).
- No dead/orphaned variants found in this unit. Note one minor truth: `MODELS.opus` exists in `anthropic.ts` but this unit uses only `MODELS.haiku`.

---

# 26 — Push notifications opt-in & delivery

**Files covered:**
- `apps/web/components/push/enable-push.tsx` — client opt-in UI; detects support/permission, requests permission on a user gesture, registers/refreshes the FCM token, and re-surfaces foreground messages as native `Notification`s.
- `apps/web/lib/firebase-client.ts` — browser-only Firebase web SDK init; exposes `getMessagingIfSupported()` and `VAPID_KEY`; returns null when unconfigured/unsupported.
- `apps/web/lib/push.ts` — server-only facade over the token data layer with the real-vs-test split (`registerPushToken` / `unregisterPushToken`, no-op under E2E).
- `apps/web/lib/firebase-admin.ts` — lazy firebase-admin singleton; provides the injected `sendPush` (`sendEachForMulticast`) implementation.
- `apps/web/app/api/push/tokens/route.ts` — authenticated POST (register) / DELETE (unregister) device-token registry route.
- `apps/web/app/api/cron/notifications/push/route.ts` — cron-authed GET that drains queued push deliveries via `drainQueuedPush(sendPush)`.
- `apps/web/app/firebase-messaging-sw.js/route.ts` — runtime-generated FCM background service worker served at `/firebase-messaging-sw.js`.
- `packages/db/src/push.ts` — Firebase-free Neon data layer: `upsertPushToken`, `deletePushTokenForUser`, `planPushDrain` (pure), `drainQueuedPush` (DB orchestration).
- `packages/db/src/push-status.ts` — pure decision logic: `shouldPruneToken`, `deliveryPushStatus`, `chunk`, `mapSendResponses`, `PushSend`/`TokenSendResult` types.
- `packages/db/src/schema.ts` (lines 89, 144–155, 734–753, 830–863) — `platformEnum`, `notificationChannelEnum`, `pushDeliveryStatusEnum`, `push_tokens` and `notification_deliveries` tables.
- `apps/web/app/page.tsx` (line 98) — sole mount point of `<EnablePush />` on the authenticated home control panel.

**Purpose:** Lets an authenticated, camp-access-granted member opt in to web push notifications and keeps their FCM device token(s) registered, then delivers queued notifications to those tokens. The opt-in surface is web-only, best-effort, and self-effacing: it renders a single "Enable notifications" button only when push is supported and the browser permission is still undecided; otherwise it renders nothing (and silently refreshes the token when permission was already granted). A daily cron drains queued `push`/`both` `notification_deliveries` to FCM via firebase-admin, marks each delivery `sent`/`failed`/`skipped`, and prunes dead tokens. The push transport is deliberately decoupled: `packages/db` never imports Firebase — the send function is injected.

## Features

### EnablePush opt-in UI (enable-push.tsx)
- Client component (`"use client"`, enable-push.tsx:1) mounted once on the authenticated home page (page.tsx:98), after the gating spine (auth → invite → onboarding → approval) has already passed — so it never prompts signed-out, gated, pending, or rejected users (page.tsx:29-63).
- Support + permission detection on mount (enable-push.tsx:48-73): obtains the Messaging instance via `getMessagingIfSupported()`; if missing, or `typeof Notification === "undefined"`, or `!("serviceWorker" in navigator)`, sets state `"unavailable"`. Otherwise reads `Notification.permission` → `"granted"` / `"denied"` / `"default"`.
- Token auto-refresh when already granted (enable-push.tsx:61-63): on mount, if permission is already `"granted"`, calls `registerToken()` fire-and-forget (`.catch(() => {})`) to refresh the FCM token without any UI.
- Token registration `registerToken()` (enable-push.tsx:25-42): gets the Messaging instance and `VAPID_KEY` (returns `false` if either is missing); registers the service worker `"/firebase-messaging-sw.js"`; obtains an FCM token via `getToken(messaging, { vapidKey, serviceWorkerRegistration })` (returns `false` if no token); POSTs `{ token, platform: "web" }` to `/api/push/tokens`; returns `true`.
- Foreground message surfacing (enable-push.tsx:78-98): while `state === "granted"`, registers one `onMessage` listener that validates `payload.notification` against `FcmNotification` zod schema and, if valid AND `Notification.permission === "granted"`, constructs `new Notification(title, { body: body ?? "", icon: "/icon.svg" })`. Listener is registered exactly once and unsubscribed on cleanup so a remount cannot stack duplicate listeners. (Foreground messages do NOT fire the SW's `onBackgroundMessage`, hence this manual path.)
- Conditional render (enable-push.tsx:100-124): returns `null` for every state except `"default"`; in `"default"` renders a centered `Button` (`variant="secondary"`, `size="sm"`, label "Enable notifications") whose click handler requests permission (see User actions).

### Browser Firebase init (firebase-client.ts)
- NO `server-only` directive, but guarded so it never runs during SSR/RSC (firebase-client.ts:9-13).
- `isConfigured()` (firebase-client.ts:25-33): true only if `apiKey && projectId && messagingSenderId && appId && VAPID_KEY` are all set (note: `authDomain` is read into config but NOT required by `isConfigured`).
- `getMessagingIfSupported()` (firebase-client.ts:40-48): returns `null` if `typeof window === "undefined"` or not configured; else `try`s `await isSupported()` (returns null if unsupported) and returns `getMessaging(firebaseApp())`; any throw → returns `null`.
- `firebaseApp()` (firebase-client.ts:35-37): reuses existing app or `initializeApp(config)`.

### Service worker route (firebase-messaging-sw.js/route.ts)
- `runtime = "nodejs"`, `dynamic = "force-dynamic"` (route.ts:1-2).
- GET serves a generated JS body (Content-Type `text/javascript; charset=utf-8`, `Cache-Control: public, max-age=0, must-revalidate`, `Service-Worker-Allowed: /`) (route.ts:37-43).
- Body imports FCM compat scripts from `https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js` and `…firebase-messaging-compat.js`, calls `firebase.initializeApp(<SW_CONFIG>)`, and registers `messaging.onBackgroundMessage` → `self.registration.showNotification(n.title || "Camp 404", { body: n.body || "", icon: "/icon.svg", data: payload.data || {} })` (route.ts:21-35).
- `SW_CONFIG` interpolates the PUBLIC `NEXT_PUBLIC_FIREBASE_*` env at runtime, each defaulting to `""` (route.ts:12-18). Generated, not committed, to keep one config source of truth.

### Token registry route (api/push/tokens/route.ts)
- `runtime = "nodejs"` (route.ts:7).
- Shared `gate()` (route.ts:21-40): `getAuthenticatedUser()` → 401 `{ error: "unauthorized" }` if none; `ensureCampUser(user)` then `hasCampAccess(campUser, user.primaryEmail)` → 403 `{ error: "forbidden" }` if no access; else returns `{ ok: true, campUserId }`. (Same auth shape as `/api/notifications/acknowledge`.)
- POST (register) (route.ts:42-51): gate, then `RegisterBody.safeParse(await req.json().catch(() => null))` → 400 `{ error: "invalid" }` on failure; calls `registerPushToken({ userId: campUserId, ...parsed.data })`; returns `{ ok: true }`.
- DELETE (unregister) (route.ts:53-62): gate, then `DeleteBody.safeParse(...)` → 400 on failure; calls `unregisterPushToken(campUserId, parsed.data.token)`; returns `{ ok: true }`. **No in-repo caller** — the comment cites "web sign-out / native revoke" but nothing in the repo invokes DELETE on this endpoint (only the POST is wired in `registerToken`).

### Server-only token facade (lib/push.ts)
- `registerPushToken(input)` (push.ts:17-25): no-op (`return`) when `isE2ETestMode()`; else `dbUpsertPushToken(input)`. Accepts `{ userId, token, platform, topics? }`.
- `unregisterPushToken(userId, token)` (push.ts:28-34): no-op under E2E; else `dbDeletePushTokenForUser(userId, token)`.
- Route handlers import this facade, never `@camp404/db/push` directly (push.ts:11-13).

### firebase-admin send fn (lib/firebase-admin.ts)
- Lazy singleton `getApp()` (firebase-admin.ts:13-39): builds only on first send; throws `"Firebase admin is not configured — set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY."` if any of `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` is missing; reuses an existing app if `getApps().length > 0`; else `initializeApp` with `cert({ projectId, clientEmail, privateKey: rawKey.replace(/\\n/g, "\n") })` (env stores PEM with literal `\n`).
- `sendPush: PushSend` (firebase-admin.ts:47-55): returns `[]` immediately if `tokens.length === 0`; else `getMessaging(getApp()).sendEachForMulticast({ tokens, notification, data })` and maps results through `mapSendResponses(tokens, res.responses)`. Per-token failures do NOT throw; only a whole-request failure (bad credentials, >500 tokens) rejects.

### Drain cron route (api/cron/notifications/push/route.ts)
- `runtime = "nodejs"` (route.ts:6).
- GET: `assertCron(req)` → returns its 401 `NextResponse` ("Unauthorized") if not an authorized cron call; else `drainQueuedPush(sendPush)`; success → `{ ok: true, ...result }`; any throw → 503 `{ ok: false, error: <message | "push drain failed"> }`.
- Scheduled daily at `25 9 * * *` (vercel.json), after `dispatch` (`15 9 * * *`) which materialises deliveries, after `reminders` (`0 9 * * *`).

### DB data layer (packages/db/src/push.ts)
- `upsertPushToken({ userId, token, platform, topics? })` (push.ts:20-44): inserts into `push_tokens`; `onConflictDoUpdate` on the unique `token` index — sets `userId`, `platform`, optionally `topics`, and `lastSeenAt: new Date()`. So a re-register (or a device handed to another user) rebinds cleanly. `topics` only written when provided.
- `deletePushTokenForUser(userId, token)` (push.ts:47-60): deletes where `token = token AND userId = userId` (owner-scoped).
- `planPushDrain(queued, tokensByUser, send)` (push.ts:77-111): pure (no DB). For each delivery: filters out tokens already in `deadTokens` from earlier in the run; if no tokens → `"skipped"`. Builds `data = { deliveryId: d.id }` plus `refType`/`refId` when non-null. Chunks tokens by 500 and calls `send(batch, { title, body }, data)`. Sets status via `deliveryPushStatus(results)`; adds tokens to `deadTokens` when `!success && shouldPruneToken(errorCode)`. Returns `{ statusById, deadTokens }`.
- `drainQueuedPush(send)` (push.ts:129-209): reads `notification_deliveries` where `pushStatus = "queued"` AND `channel IN ('push','both')` (selecting `id, userId, title, body, refType, refId`); returns `{ sent: 0, failed: 0, skipped: 0, pruned: 0 }` if none. Loads `push_tokens` for the distinct recipient userIds, groups into `tokensByUser`, runs `planPushDrain`, then in a pooled transaction conditionally updates each delivery `set { pushStatus, deliveredAt: new Date() (only when sent) }` where `id = id AND pushStatus = "queued"` (idempotency claim — `updated.length === 0` ⇒ already handled, skip count). Deletes pruned tokens (`inArray(token, [...deadTokens])`). Always `await pool.end()` in `finally`. Returns `{ sent, failed, skipped, pruned }`.

### Pure decision logic (packages/db/src/push-status.ts)
- `shouldPruneToken(errorCode)` (push-status.ts:13-15): true iff `errorCode` is truthy AND in `PRUNE_CODES`.
- `deliveryPushStatus(results)` (push-status.ts:35-41): `"skipped"` if empty; `"sent"` if any success; else `"failed"`.
- `chunk(items, size)` (push-status.ts:44-49): throws `"chunk size must be >= 1"` if `size < 1`; else slices into batches of at most `size`.
- `mapSendResponses(tokens, responses)` (push-status.ts:57-66): index-aligns each positional response to `tokens[i]` → `{ token, success, errorCode: r.error?.code ?? null }`. firebase-admin does NOT throw on per-token failure; index alignment is how a failure maps to the exact token to prune.

## User actions & interactions
- **Tap "Enable notifications"** (enable-push.tsx:107-119): the ONLY user-facing action. On click: `await Notification.requestPermission()`. If result `!== "granted"`: set state to `"denied"` when result is `"denied"`, otherwise stay `"default"` (e.g. dismissed). If `"granted"`: `await registerToken()` then set state `"granted"`. Any throw in the handler → state `"unavailable"`.
- **(Automatic) token refresh** — no tap required; happens on mount when permission already granted (enable-push.tsx:61-63).
- **(Automatic) foreground notification display** — incoming foreground FCM messages while granted spawn a native `Notification` (enable-push.tsx:85-92).
- **(Automatic) background notification display** — handled by the service worker `onBackgroundMessage` (firebase-messaging-sw.js/route.ts:28-35), independent of the page being open.
- There is NO disable/opt-out toggle in this surface (no UI calls DELETE); revocation is via the browser's own permission controls. <!-- low-confidence: no in-repo caller of the DELETE /api/push/tokens endpoint; sign-out token cleanup appears unimplemented in this repo -->

## States & presentations
EnablePush local state machine `State = "loading" | "unavailable" | "default" | "granted" | "denied"` (enable-push.tsx:16):
- **loading** — initial; renders `null` (detection in flight).
- **unavailable** — push/Notification/serviceWorker unsupported, unconfigured, `getMessagingIfSupported()` null, or a throw during request; renders `null`.
- **default** — permission undecided; **the only state that renders the button**. This is the surface's only visible "empty/undecided" affordance.
- **granted** — permission granted; renders `null`; registers token + foreground listener.
- **denied** — permission denied; renders `null` (never re-prompts; browser controls only).

Server/route presentations:
- **Unauthorized (token route)** — 401 `{ error: "unauthorized" }` (no session). Corresponds to invite-gated/unauthed states being blocked upstream.
- **Forbidden (token route)** — 403 `{ error: "forbidden" }` when `!hasCampAccess` (invite-gated / not-yet-approved-by-access).
- **Invalid (token route)** — 400 `{ error: "invalid" }` on zod parse failure (validation-error).
- **Success (token route)** — 200 `{ ok: true }`.
- **Unauthorized (cron)** — 401 plain text "Unauthorized" when `CRON_SECRET` missing/mismatch.
- **Drain success** — 200 `{ ok: true, sent, failed, skipped, pruned }`.
- **Drain failure / unconfigured Firebase** — 503 `{ ok: false, error }` (firebase-admin throws when env missing).

Per-delivery push states (`push_delivery_status`): `queued` (default, awaiting drain) → `sent` (≥1 token succeeded; `deliveredAt` stamped) / `failed` (all tokens failed) / `skipped` (recipient has no tokens). `in_app`-channel deliveries are never drained, so they remain `queued` forever (push.ts:120-127, by design).

Global-states applicability:
- **Empty** — `state="default"` (button shown) is the "no decision yet" empty affordance; drain "empty" = no queued rows → zeroed result.
- **Loading** — `state="loading"`.
- **Populated** — `state="granted"` with token registered.
- **Validation-error** — token route 400; client request fails silently (no UI error surfaced; `registerToken` swallows fetch outcome).
- **Submitting/pending** — `push_status="queued"`; client request in flight (no spinner shown).
- **Success** — `state="granted"`; route `{ ok: true }`; delivery `sent`.
- **Disabled** — `state="denied"`/`"unavailable"` render nothing (no disabled control is shown).
- **Invite-gated / Onboarding-incomplete / Pending-approval / Rejected** — never reach the mount because the page gating spine redirects first (page.tsx:29-63); the token route additionally enforces auth + `hasCampAccess`.
- **Captain-only-locked** — N/A; push opt-in is rank-agnostic (every camp member sees it).
- NO offline/sync state and NO budget/over-target state (per product invariants).

## Enums, options & configurable values
- `platformEnum = pgEnum("platform", ["web", "ios", "android"])` (schema.ts:89). Client always sends `"web"` (enable-push.tsx:39); `ios`/`android` are accepted by the route enum but unused by web push.
- Route `RegisterBody.platform = z.enum(["web", "ios", "android"])` (tokens/route.ts:15) — mirrors `platformEnum`.
- `notificationChannelEnum = pgEnum("notification_channel", ["push", "in_app", "both"])` (schema.ts:144-148). Drain selects `channel IN ('push','both')` only.
- `pushDeliveryStatusEnum = pgEnum("push_delivery_status", ["queued", "sent", "failed", "skipped"])` (schema.ts:150-155). Default `"queued"`.
- `PRUNE_CODES` (push-status.ts:6-10) — dead-token FCM error codes that trigger deletion: `"messaging/registration-token-not-registered"`, `"messaging/invalid-registration-token"`, `"messaging/invalid-argument"`. Transient codes (e.g. `messaging/internal-error`, `messaging/server-unavailable`) are NOT pruned (push-status.test.ts:16-21).
- FCM multicast batch cap: **500** tokens per `send` (`chunk(tokens, 500)`, push.ts:102; cap noted push-status.ts:43).
- Notification icon: `"/icon.svg"` (both foreground enable-push.tsx:90 and background SW route.ts:32).
- Default background notification title fallback: `"Camp 404"` (SW route.ts:30).
- FCM compat SDK version pinned: `12.14.0` (SW route.ts:22-23).
- Cron schedule: `/api/cron/notifications/push` at `"25 9 * * *"` (vercel.json) — daily ~09:25 UTC.
- Service worker headers: `Cache-Control: public, max-age=0, must-revalidate`, `Service-Worker-Allowed: /` (route.ts:38-42).
- Env (public, client): `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_FIREBASE_VAPID_KEY` (firebase-client.ts:15-23; `isConfigured` requires all EXCEPT `authDomain`).
- Env (server, secret): `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (firebase-admin.ts:17-19); `CRON_SECRET` (cron-auth.ts); `E2E_TEST_MODE` (`"1"` enables test no-op, test-mode.ts).
- `FcmNotification` foreground zod schema: `{ title: string().min(1), body: string().optional() }` (enable-push.tsx:20-23).

## Data model touched
**`push_tokens`** (schema.ts:734-753) — agrees with unit 29:
- `id uuid PK defaultRandom`
- `userId uuid NOT NULL` → `users.id` `ON DELETE cascade`
- `platform platform_enum NOT NULL`
- `token text NOT NULL`
- `topics jsonb $type<string[]> default []` (written only when provided by caller)
- `lastSeenAt timestamp (mode date) NOT NULL defaultNow` (refreshed on upsert conflict)
- `createdAt timestamp (mode date) NOT NULL defaultNow`
- Indexes: `push_tokens_token_idx` UNIQUE on `(token)` (the upsert conflict target); `push_tokens_user_idx` on `(userId)`.

**`notification_deliveries`** (schema.ts:830-863) — fields this unit READS/WRITES (full table owned by units 27/29):
- Reads at drain: `id`, `userId`, `title`, `body`, `refType`, `refId` (push.ts:131-146).
- Filter columns: `pushStatus push_delivery_status NOT NULL default "queued"`; `channel notification_channel NOT NULL`.
- Writes at drain: `pushStatus` ← `sent`/`failed`/`skipped`; `deliveredAt timestamp` ← `new Date()` only when `sent` (push.ts:182-184).
- Other columns on the table (NOT touched here): `broadcastId`, `presentation`, `readAt`, `acknowledgedAt`, `createdAt`.
- FCM `data` payload carries `deliveryId` (always) + `refType`/`refId` (when present) for client deep-linking (push.ts:97-99).

## Validation, edge cases & business rules
- Opt-in button shows ONLY in `state="default"` — never re-prompts after deny; browser is the source of truth for permission (enable-push.tsx:100, 64-65).
- Permission request must run inside the click handler (a user gesture — required by Safari) (enable-push.tsx:9-14, 107-109).
- `registerToken` returns `false` (no error) when Messaging/VAPID/token are unavailable; the fetch result is not inspected — a failed POST is silently best-effort (enable-push.tsx:25-42).
- Foreground notification is only shown if the FCM payload validates AND permission is still `"granted"` at fire time (enable-push.tsx:86-87) — guards against showing notifications after a mid-session revoke.
- `onMessage` listener registered exactly once per `granted` session and unsubscribed on cleanup — prevents duplicate-listener stacking on remount (enable-push.tsx:78-98).
- Token route: requires authenticated session + camp access; both POST and DELETE share the gate; malformed/missing JSON → 400 (route.ts:45,57 use `.catch(() => null)`).
- `token` must be a non-empty string (`z.string().min(1)`); `topics` optional array of strings.
- Upsert rebinds a token to a new owner on conflict (device-handoff safe), refreshing `lastSeenAt` (push.ts:35-43).
- DELETE is owner-scoped: only deletes a `(token, userId)` pair the caller owns (push.ts:54-59) — a user cannot delete another's token.
- Drain idempotency: status update is conditional on row still `queued`; an overlapping run cannot double-write (push.ts:186-193). Comment notes the cron is daily so double-send is not a practical concern.
- Within one drain run, a token classified dead by an earlier delivery is excluded from later deliveries' sends (avoids re-sending to and re-collecting a pruned token); a recipient whose only tokens were pruned earlier yields `"skipped"` for later deliveries (push.ts:88-92; push-drain.test.ts:85-104).
- Delivery status rules: `skipped` (no tokens) / `sent` (≥1 success) / `failed` (all fail) (push-status.ts:35-41; push-status.test.ts:24-41).
- Only prune-class FCM error codes delete the token; transient errors retain it for the next run (push-status.ts:13-15; push.ts:106-108).
- `sendEachForMulticast` returns per-token results positionally and does NOT throw on per-token failure; only whole-request failures (bad credentials, >500 tokens) reject → bubbles to 503 (firebase-admin.ts:42-45, 47-55).
- `chunk` throws if size < 1 (defensive; size is hardcoded 500) (push-status.ts:45).
- E2E test mode: `registerPushToken`/`unregisterPushToken` are no-ops (no DB under Playwright) (push.ts:23,32).
- `packages/db` is intentionally Firebase-free; the FCM `send` fn is injected into `drainQueuedPush` so the Neon package never imports firebase (push.ts:11-14, firebase-admin.ts).
- firebase-admin is lazy/singleton: the app builds and runs with NO Firebase config; a missing-config send throws (→ 503) rather than silently no-op'ing (firebase-admin.ts:8-25).
- `in_app`-only deliveries are never drained and remain `queued` permanently — intentional (push.ts:122-124).
- Service worker route is `force-dynamic` and reads public env at request time; a static-export build has no route handlers, but web push is web-only so that's acceptable (route.ts:1-10).
- Cron auth fails closed: unset/empty `CRON_SECRET` authorizes NO request; constant-time, length-guarded compare (cron-auth.ts:7-22).

## Sub-components / variants
- **EnablePush** is the sole UI component; its only rendered variant is the `state="default"` button (`Button variant="secondary" size="sm"`, label "Enable notifications"). All other states render `null` (no spinner, no error toast, no disabled control).
- **DELETE /api/push/tokens** — implemented and tested-by-contract but **orphaned**: no client/server code in the repo calls it. The documented "web sign-out / native revoke" callers do not exist here. <!-- low-confidence: confirmed via repo-wide grep; only the POST path is wired -->
- **`ios` / `android` platform enum members** — accepted by both `platformEnum` and `RegisterBody`, but unreachable from this web-only surface (the client hardcodes `platform: "web"`). Reserved for a future native client.
- **`topics`** field/param — plumbed end-to-end (`registerPushToken` input → `upsertPushToken`), but the web client never sends `topics`, and the drain does not read `topics`. Currently unused dead-weight in this unit.
- **`refType`/`refId`** propagation — carried into the FCM `data` payload by the drain but consumed by unit 27 (deep-link/inbox), not here.
- Server-only handlers/validators/schemas of this unit: `gate()` + `RegisterBody`/`DeleteBody` (token route); `assertCron`/`isAuthorizedCron` (cron-auth); `planPushDrain` (pure, unit-tested) vs `drainQueuedPush` (DB wrapper); `sendPush` (firebase-admin impl of `PushSend`); `mapSendResponses`/`deliveryPushStatus`/`shouldPruneToken`/`chunk` (pure, unit-tested in push-status.test.ts and push-drain.test.ts).

---

# 27 — Broadcast → delivery → inbox engine

**Files covered:**
- `apps/web/lib/notifications.ts` — Server-only facade: routes every announcement/notification read & write to the Neon-backed `@camp404/db/broadcasts` queries, or the in-memory `testStore` under `E2E_TEST_MODE`. App code imports from here, never `@camp404/db/broadcasts` directly.
- `packages/db/src/broadcasts.ts` — The data layer: draft CRUD, inline publish + fan-out, scheduled dispatch worker, recipient-side reads (inbox, unread count, pending acknowledgements), and the acknowledge/mark-read writes.
- `packages/db/src/audience.ts` — Pure (DB-free) scope→recipient-ids resolver (`computeAudience`) plus the `BroadcastScope` type.
- `apps/web/app/api/notifications/pending/route.ts` — `GET` handler the acknowledge gate polls for a member's unacknowledged full-screen deliveries.
- `apps/web/app/api/notifications/acknowledge/route.ts` — `POST` handler that dismisses one full-screen delivery on the member's behalf.
- `apps/web/app/acknowledgement-gate.tsx` — (adjacent, unit 25) the in-app consumer of the two API routes; included for the delivery→presentation contract.
- `apps/web/app/api/cron/notifications/dispatch/route.ts` — Cron entry point that drains deferred/scheduled broadcasts via `dispatchDueBroadcasts`.
- `apps/web/app/captains/announcements/actions.ts` — (adjacent, unit 15) captain-gated server actions that call the draft/publish facade; included for the gating + write contract.
- `apps/web/app/notifications/page.tsx` — (adjacent, unit 09) inbox page; included for the listInbox/markRead read-then-clear contract.
- `apps/web/app/home-header.tsx` — bell badge consumer of `countUnread`.
- `packages/types/src/announcement.ts` — `ComposeAnnouncementInput` + `AnnouncementPresentation` zod validators.
- `apps/web/lib/test-store.ts` — in-memory backend mirroring the engine under `E2E_TEST_MODE`.
- `packages/db/src/schema.ts` — `broadcasts`, `broadcast_targets`, `notification_deliveries` tables and all enums.

**Purpose:** This is the engine behind the camp's notification system. A *broadcast* is a composed message (one `broadcasts` row) authored by a sender to an audience. It starts as a draft (`publishedAt IS NULL`), then **fan-out** materialises one **delivery** (`notification_deliveries` row) per recipient — copying title/body/channel/presentation onto each so the inbox and acknowledge gate are self-contained. Camp-wide announcements fan out **inline at publish**; deferred/scoped broadcasts are drained by a **scheduled dispatch cron**. The recipient side exposes per-user **inbox** (newest-first), an **unread count** (drives the bell badge), **mark-read**, **pending full-screen acknowledgements**, and **acknowledge** (dismiss). Presentation variants — `acknowledge` (full-screen takeover gate), `popup`, `feed` — decide how each delivery interrupts the recipient. Dedup is enforced by a partial unique index `(broadcast_id, user_id)` plus `ON CONFLICT DO NOTHING` and atomic `dispatched_at` claims, so retries and overlapping cron runs never double-deliver.

## Features

### Facade & backend split (`apps/web/lib/notifications.ts`)
- Defines a `NotificationsBackend` interface (notifications.ts:38-69) implemented twice: `realBackend` delegating to `@camp404/db/broadcasts` (notifications.ts:71-82), and `testBackend` delegating to `testStore` (notifications.ts:84-115).
- `backend()` picks the impl by `isE2ETestMode()` (notifications.ts:117-119); all 10 exported functions route through it.
- Exported surface: `countUnread`, `listInbox`, `markRead`, `getPendingAcknowledgements`, `acknowledgeDelivery`, `listAnnouncements`, `createAnnouncementDraft`, `updateAnnouncementDraft`, `deleteAnnouncementDraft`, `publishAnnouncement` (notifications.ts:121-181).
- Re-exports the types `AnnouncementPresentation`, `AnnouncementSummary`, `InboxItem`, `PendingAcknowledgement`, `PublishResult` (notifications.ts:30-36).
- The rationale comment notes this is the "same real-vs-test backend split `lib/users.ts` uses so the app renders without a database during Playwright runs" (notifications.ts:23-28).

### Audience resolution (`packages/db/src/audience.ts`)
- `computeAudience(broadcast, data, senderId)` (audience.ts:29-64) — PURE, no DB; given scope + membership data returns recipient user-ids.
- Builds a `real` set = members where `!isSystem && !sanitised` (audience.ts:34-36).
- Per-scope id selection (audience.ts:39-61):
  - `everyone` → all real members.
  - `team` → `memberships` filtered to `m.team === broadcast.team`; **if `broadcast.team` is null/unset → empty (nobody)** (audience.ts:43-49).
  - `team_leads` → `memberships` where `isLead` (audience.ts:50-51).
  - `drivers` → `data.driverUserIds` (audience.ts:52-54).
  - `individual` → `data.targetUserIds` (audience.ts:55-57).
  - `default` → `[]` (audience.ts:59-60).
- Final filter (audience.ts:63): de-duplicates via `new Set`, keeps only ids in `real`, and **always excludes the sender** (`id !== senderId`). Implicitly excludes system actors & sanitised accounts via the `real` set.
- `resolveAudience(broadcast, senderId)` in broadcasts.ts:52-94 is the DB half: reads `users` (id, isSystem, sanitised), all `teamMemberships` (userId, team, isLead), `driverProfiles` where `intendsToDrive = true`, and (only when `scope === 'individual'`) `broadcastTargets` for this broadcast id, then calls `computeAudience`. Reads via stateless HTTP driver (`createHttpDb`).

### Draft lifecycle & queries (`packages/db/src/broadcasts.ts`)
- `isOwnedAnnouncementDraft(id, senderId)` (broadcasts.ts:36-44) — shared predicate locking every announcement mutation to: `id` matches AND `senderId` matches author AND `kind = 'announcement'` AND `scope = 'everyone'` AND `publishedAt IS NULL`. Prevents touching non-announcement broadcasts or another sender's draft.
- `listAnnouncements()` (broadcasts.ts:117-149) — captain-facing management list: every `kind = 'announcement'` broadcast (drafts + published), newest first by `createdAt`. Left-joins sender `displayName`; computes `recipientCount` (count of `notification_deliveries` for the broadcast) and `acknowledgedCount` (those with `acknowledged_at IS NOT NULL`) via correlated subqueries; both coalesced to 0.
- `createAnnouncementDraft({senderId, title, body, presentation})` (broadcasts.ts:159-175) — inserts a `broadcasts` row with `kind='announcement'`, `scope='everyone'`, returns `{ id }`.
- `updateAnnouncementDraft({id, senderId, title, body, presentation})` (broadcasts.ts:181-199) — updates title/body/presentation where `isOwnedAnnouncementDraft`; returns `true` iff a row matched (no-op `false` if missing/published/not-author).
- `deleteAnnouncementDraft({id, senderId})` (broadcasts.ts:202-212) — deletes where `isOwnedAnnouncementDraft`; returns `true` iff a row matched.
- `publishAnnouncement({id, senderId})` (broadcasts.ts:228-290) — **inline publish + fan-out**, in one pooled transaction (`createPooledDb`, closes pool in `finally`):
  1. Claim: `UPDATE broadcasts SET publishedAt=now, dispatchedAt=now WHERE isOwnedAnnouncementDraft` returning id/title/body/channel/presentation. If no row → `{ ok:false, error:"Draft not found, already published, or not yours." }` (broadcasts.ts:248-254).
  2. `resolveAudience({id, scope:'everyone', team:null}, senderId)`. If `recipientIds.length === 0` → returns `{ ok:true, recipientCount:0 }` early **without inserting** (broadcasts.ts:265-267).
  3. Bulk-insert one `notificationDeliveries` row per recipient copying `title`, `body`, `channel`, `presentation`, with `refType:"announcement"`, `refId: broadcast.id`, `.onConflictDoNothing()` (broadcasts.ts:269-283).
  4. Returns `{ ok:true, recipientCount: recipientIds.length }`. **Idempotent on draft→published** (claim only flips an unpublished row, so double-submit can't double-fan-out).
- `dispatchDueBroadcasts(now = new Date())` (broadcasts.ts:306-386) — **scheduled fan-out worker**. Selects broadcasts where `publishedAt IS NOT NULL AND dispatchedAt IS NULL AND (sendAt IS NULL OR sendAt <= now)` (broadcasts.ts:324-333). If none → `{ dispatched:0, deliveries:0 }`. For each due broadcast: resolves audience for **its own scope/team**, then in a transaction atomically claims it (`UPDATE … SET dispatchedAt=now WHERE id=? AND dispatchedAt IS NULL` returning id; if already claimed by another run → `false`, skip), then inserts deliveries copying title/body/channel/presentation, `refType: b.refType ?? null`, `refId: b.refId ?? b.id`, with `.onConflictDoNothing()`. Tallies `dispatched`/`deliveries`. Pool closed in `finally`. Note: deliveries are only inserted when `recipientIds.length > 0` (broadcasts.ts:358).

### Recipient-side reads & writes (`packages/db/src/broadcasts.ts`)
- `getPendingAcknowledgements(userId)` (broadcasts.ts:403-430) — a user's outstanding full-screen acknowledgements: deliveries where `userId = ? AND presentation = 'acknowledge' AND acknowledgedAt IS NULL`, **oldest first** (`orderBy(createdAt)` ascending) so the gate clears them in arrival order. Left-joins broadcast→sender to surface `senderName`. Returns `{ deliveryId, title, body, senderName, createdAt }`.
- `acknowledgeDelivery({deliveryId, userId})` (broadcasts.ts:437-458) — sets `acknowledgedAt=now, readAt=now` (acknowledging implicitly reads) where `id = ? AND userId = ? AND presentation = 'acknowledge' AND acknowledgedAt IS NULL`. Returns `true` iff a row matched. **Owner-scoped** (a user can only dismiss their own) and **acknowledge-variant-only** (never stamps a popup/feed delivery).
- `listInbox(userId)` (broadcasts.ts:472-493) — every delivery for the user, newest first (`desc(createdAt)`); left-joins broadcast→sender for `senderName`. Returns `{ id, title, body, presentation, senderName, readAt, acknowledgedAt, createdAt }`.
- `countUnread(userId)` (broadcasts.ts:496-508) — `count(*)::int` of deliveries where `userId = ? AND readAt IS NULL`; coalesced to 0. Drives the header bell badge.
- `markRead(userId, ids)` (broadcasts.ts:516-529) — sets `readAt=now` where `userId = ? AND id IN ids AND readAt IS NULL`. **Empty `ids` is a no-op** (early return). Caller must pass the exact ids it snapshotted so a delivery arriving after the snapshot stays unread.

### API routes
- `GET /api/notifications/pending` (pending/route.ts:14-28) — `runtime="nodejs"`, `dynamic="force-dynamic"`. Returns `{ pending: PendingAcknowledgement[] }`. Unauthenticated → `{ pending: [] }` (NOT a 401 — the gate mounts app-wide incl. public landing). No camp access (synthetic empty id) → `{ pending: [] }` (querying empty id would 500 on a real DB). Otherwise returns `getPendingAcknowledgements(campUser.id)`.
- `POST /api/notifications/acknowledge` (acknowledge/route.ts:15-36) — `runtime="nodejs"`. Body validated by zod `{ deliveryId: z.string().uuid() }`. Unauthenticated → `401 { error:"unauthorized" }`. Invalid body → `400 { error:"invalid" }`. No camp access → `{ ok:false }`. Otherwise calls `acknowledgeDelivery` and returns `{ ok }` (boolean).
- `GET /api/cron/notifications/dispatch` (dispatch/route.ts:13-18) — `runtime="nodejs"`. `assertCron(req)` guard (constant-time `Bearer ${CRON_SECRET}` check; fails closed when secret unset → 401). On pass, runs `dispatchDueBroadcasts()` → `{ ok:true, dispatched, deliveries }`.

### Captain composer actions (`apps/web/app/captains/announcements/actions.ts`)
- All four actions (`saveDraftAction`, `updateDraftAction`, `deleteDraftAction`, `publishAction`) gate via `requireCaptain()` (actions.ts:23-40), which fails with: `"Not signed in."` (no auth), `"Your account isn't camp-active yet."` (no camp access), `"Your account is still awaiting approval."` (not `isApproved`), `"Captain access only."` (`rank !== 'captain'`). On success returns `{ captainId }`.
- `saveDraftAction` / `updateDraftAction` parse input via `ComposeAnnouncementInput.safeParse`; on failure return `{ ok:false, error: issues[0]?.message ?? "Invalid." }` (actions.ts:49-52, 70-73).
- `updateDraftAction` / `deleteDraftAction` surface `"Draft not found or already published."` when the underlying write returns `false`.
- `publishAction` passes through the data-layer `PublishResult` error verbatim; on success returns `{ ok:true, data:{ recipientCount } }`. All four `revalidatePath("/captains/announcements")` on success.

## User actions & interactions

- **Compose / save draft** (captain) → `saveDraftAction`.
- **Edit draft** (captain, author-only, draft-only) → `updateDraftAction`.
- **Delete draft** (captain, author-only, draft-only) → `deleteDraftAction`.
- **Publish announcement** (captain) → `publishAction` → inline fan-out to whole camp; returns recipient count.
- **Acknowledge a full-screen notification** (any member) → AcknowledgementGate "Acknowledge" button at the end-of-scroll → `POST /api/notifications/acknowledge`. The gate then drops the item and advances to the next; `router.refresh()` updates the bell badge/inbox (acknowledgement-gate.tsx:85-103).
- **Open inbox / read notifications** (any member) → `/notifications` page lists inbox then immediately marks the snapshotted ids read (clears the badge) (notifications/page.tsx:33-37).
- **Tap header bell** → navigates to `/notifications`; badge shows unread count (`99+` cap when > 99) (home-header.tsx:27-46).
- **Poll for pending acknowledgements** (automatic) → gate calls `GET /api/notifications/pending` on mount, every 45s, and on tab focus/visibility (acknowledgement-gate.tsx:54-67).
- **Cron dispatch** (system) → `GET /api/cron/notifications/dispatch` drains deferred/scheduled broadcasts.

## States & presentations

**Presentation variants** (`broadcast_presentation`, schema.ts:166-170; mirrored types/announcement.ts:8-12) — copied onto each delivery at fan-out:
- `acknowledge` — full-screen scrollable takeover the recipient must explicitly acknowledge to dismiss (T&C pattern); used for camp-wide must-see announcements. Only this variant appears in the pending queue and accepts `acknowledgeDelivery`. Inbox icon: `Megaphone`.
- `popup` — transient dismissable pop-up, no acknowledgement required. Inbox icon: `MessageSquare`.
- `feed` — silent; lands in the inbox behind the header bell only. Inbox icon: `Bell`. **Schema default** for both `broadcasts.presentation` and `notification_deliveries.presentation`.

**Delivery read/ack states** (per `notification_deliveries` row):
- Unread: `readAt IS NULL` (counts toward bell badge; inbox row shown with "New" pill + highlighted border).
- Read: `readAt` set (set on inbox open, or implicitly on acknowledge).
- Acknowledged: `acknowledgedAt` set (acknowledge variant only) — inbox footer "· acknowledged"; unacknowledged acknowledge-deliveries show "· awaiting acknowledgement" (notifications/page.tsx:93-98).

**Broadcast lifecycle states:** draft (`publishedAt IS NULL`) → published (`publishedAt` set) → dispatched (`dispatchedAt` set; for inline-published camp announcements both are stamped together).

**Global-states rows that apply here:**
- **Empty** — inbox: "No notifications yet." (notifications/page.tsx:54). Pending queue empty → gate `return null` (renders nothing). `dispatchDueBroadcasts` none-due → `{dispatched:0,deliveries:0}`. `recipientCount:0` for a publish that resolves to nobody.
- **Loading** — acknowledge button shows `Loader2` spinner while `acking` (acknowledgement-gate.tsx:150).
- **Populated** — inbox list; pending queue surfaces the oldest item; bell badge shows count.
- **Validation-error** — compose: zod messages "Give it a title.", "Write the announcement."; acknowledge route: `400 { error:"invalid" }` for non-UUID `deliveryId`.
- **Submitting/pending** — `acking` disables the Acknowledge button (acknowledgement-gate.tsx:148); broadcast `published but not dispatched` is the deferred-pending state the cron drains.
- **Success** — `{ok:true, recipientCount}` / `{ok:true}`; gate advances to next item then refreshes.
- **Disabled** — Acknowledge button `disabled={acking}`.
- **Invite-gated / no-camp-access** — pending & acknowledge routes short-circuit to `{pending:[]}` / `{ok:false}` (never query a synthetic empty id); inbox page `redirect("/signup/required")` when `!hasCampAccess` (notifications/page.tsx:27-29).
- **Pending-approval / Rejected** — composer actions block with `"Your account is still awaiting approval."` (captain still held behind vetting cannot publish).
- **Captain-only-locked** — all four composer actions require `rank === 'captain'` else `"Captain access only."`. The data-layer comment (broadcasts.ts:26-27) stresses captain-facing writers MUST be gated by callers; the module trusts the `senderId` it is handed.

## Enums, options & configurable values

- `broadcast_kind` (schema.ts:128-134): `announcement` | `team_message` | `lead_directive` | `reminder` | `system`. This engine's announcement writers hard-lock to `announcement`.
- `broadcast_scope` (schema.ts:136-142, mirrored audience.ts:6-11): `everyone` | `team` | `team_leads` | `drivers` | `individual`. Announcement path hard-locks to `everyone`.
- `notification_channel` (schema.ts:144-148): `push` | `in_app` | `both`. `broadcasts.channel` default `both`.
- `push_delivery_status` (schema.ts:150-155): `queued` | `sent` | `failed` | `skipped`. `notification_deliveries.pushStatus` default `queued`.
- `broadcast_presentation` (schema.ts:166-170): `acknowledge` | `popup` | `feed`. Default `feed` (schema), but `ComposeAnnouncementInput.presentation` zod default is `acknowledge` (types/announcement.ts:26).
- `POLL_INTERVAL_MS = 45_000` (acknowledgement-gate.tsx:26) — pending poll cadence (45s).
- Bell badge cap: `> 99 ? "99+" : count` (home-header.tsx:41); falsy count hides the badge.
- `ComposeAnnouncementInput` (types/announcement.ts:23-27): `title` trimmed, min 1 ("Give it a title."), max 120; `body` trimmed, min 1 ("Write the announcement."), max 5000; `presentation` enum default `acknowledge`.
- `dispatchDueBroadcasts(now = new Date())` default arg.
- Cron auth: `Bearer ${CRON_SECRET}` constant-time compare; fails closed when `CRON_SECRET` unset (cron-auth.ts:12-22).

## Data model touched

**`broadcasts`** (schema.ts:763-807):
- `id` uuid PK (defaultRandom); `senderId` uuid → `users.id` (onDelete: set null, nullable); `kind` `broadcast_kind` notNull; `scope` `broadcast_scope` notNull; `team` `teamEnum` (set only when scope='team'); `title` text notNull; `body` text notNull; `channel` `notification_channel` notNull default `both`; `presentation` `broadcast_presentation` notNull default `feed`; `refType` text (deep-link target type); `refId` uuid; `publishedAt` timestamp (NULL while draft); `dispatchedAt` timestamp (NULL until fan-out done); `sendAt` timestamp (NULL/<=now = immediate, future = deferred to cron); `createdAt` timestamp notNull defaultNow.
- Indexes: `broadcasts_sender_idx` (senderId), `broadcasts_created_at_idx` (createdAt).

**`broadcast_targets`** (schema.ts:810-823) — explicit recipients for `scope='individual'`:
- `broadcastId` uuid notNull → `broadcasts.id` (onDelete cascade); `userId` uuid notNull → `users.id` (onDelete cascade). PK `(broadcastId, userId)`.

**`notification_deliveries`** (schema.ts:830-887) — per-user inbox row:
- `id` uuid PK (defaultRandom); `broadcastId` uuid → `broadcasts.id` (onDelete cascade, **nullable** for system rows); `userId` uuid notNull → `users.id` (onDelete cascade); `title` text notNull; `body` text notNull; `channel` `notification_channel` notNull; `presentation` `broadcast_presentation` notNull default `feed`; `pushStatus` `push_delivery_status` notNull default `queued`; `refType` text; `refId` uuid; `readAt` timestamp; `acknowledgedAt` timestamp (set on explicit acknowledge of `acknowledge` variant); `deliveredAt` timestamp; `createdAt` timestamp notNull defaultNow.
- Indexes: `notification_deliveries_user_read_idx` (userId, readAt); `notification_deliveries_user_ack_idx` (userId, acknowledgedAt); `notification_deliveries_broadcast_idx` (broadcastId); **partial unique** `notification_deliveries_broadcast_user_uniq` on (broadcastId, userId) `WHERE broadcast_id IS NOT NULL` — the dedupe index enabling `ON CONFLICT DO NOTHING` (system rows with null broadcastId exempt).

**Read-only joins / sources:** `users` (id, isSystem, sanitised, displayName); `teamMemberships` (userId, team, isLead); `driverProfiles` (userId where intendsToDrive=true). `push_tokens` (schema.ts:734-753) referenced by the push worker (out of scope here).

**Interfaces (data layer):** `AnnouncementSummary` (broadcasts.ts:96-110: id, title, body, presentation, senderId, senderName, publishedAt, createdAt, recipientCount, acknowledgedCount); `DraftInput` (broadcasts.ts:151-156); `PublishResult` = `{ok:true, recipientCount}` | `{ok:false, error}` (broadcasts.ts:214-216); `DispatchResult` = `{dispatched, deliveries}` (broadcasts.ts:292-295); `PendingAcknowledgement` (broadcasts.ts:390-396: deliveryId, title, body, senderName, createdAt); `InboxItem` (broadcasts.ts:460-469: id, title, body, presentation, senderName, readAt, acknowledgedAt, createdAt).

## Validation, edge cases & business rules

- **Author-private drafts:** every announcement mutation requires `isOwnedAnnouncementDraft` (id + senderId + kind='announcement' + scope='everyone' + publishedAt IS NULL). Editing/deleting/publishing another sender's draft or a published row is a silent no-op (`false` / error string), never an exception.
- **Publish idempotency:** the claim only flips an unpublished owned row, so double-submit can't double-fan-out; `ON CONFLICT DO NOTHING` + the partial unique index make the delivery insert idempotent even on retry.
- **Cron idempotency:** `dispatchDueBroadcasts` atomically claims each broadcast by flipping `dispatchedAt` inside a transaction (`WHERE dispatched_at IS NULL`); a second concurrent run gets no claimed row and skips. Same dedupe index guards the insert.
- **Sender is always excluded** from the audience (`id !== senderId`, audience.ts:63), as are system actors (`isSystem`) and sanitised accounts (`sanitised`).
- **Team-scoped with no team set → nobody** (audience.ts:43-49); caller MUST set the team.
- **Empty audience** → publish returns `{ok:true, recipientCount:0}` with no inserts; cron skips the insert when no recipients.
- **acknowledgeDelivery is variant- and owner-scoped:** only `presentation='acknowledge'` deliveries the caller owns and that are still unacknowledged can be stamped; never marks a popup/feed delivery acknowledged.
- **markRead snapshot rule:** mark exactly the snapshotted ids and only those still `readAt IS NULL`, so a delivery that arrives between snapshot and write isn't silently marked read; empty list is a no-op.
- **Pending order:** oldest-first (gate clears in arrival order); inbox & announcements list: newest-first.
- **Auth/access edge in routes:** unauthenticated pending → empty list (not 401, since the gate mounts on public pages); no-camp-access synthetic empty id is never used in a query (would 500 on a real DB) — returns empty/`{ok:false}`.
- **Acknowledge route validation:** `deliveryId` must be a UUID (zod), else 400; unauthenticated → 401.
- **Cron auth fails closed:** unset/empty `CRON_SECRET` authorizes nobody; constant-time, length-guarded compare.
- **Acknowledge gate concurrency:** a monotonic `requestIdRef` token drops superseded poll responses; after a successful acknowledge it bumps the token so an in-flight poll can't re-add the dismissed item (acknowledgement-gate.tsx:35,45,94-95).
- **Gate scroll lock:** body `overflow:hidden` while a notification is showing; scroll resets to top per new item; restores prior overflow on unmount (acknowledgement-gate.tsx:73-81).
- **`refType`/`refId` deep-link:** publish hard-codes `refType:"announcement"`, `refId: broadcast.id`; dispatch copies `b.refType ?? null` / `b.refId ?? b.id`. <!-- low-confidence: no UI handler currently reads delivery.refType to open a bespoke deep-link target; only the schema comment (schema.ts:787-789) and announcement composer link reference it. The wiring appears intended but not yet built. -->

## Sub-components / variants

- **`@camp404/db/broadcasts` writers (real backend):** `createAnnouncementDraft`, `updateAnnouncementDraft`, `deleteAnnouncementDraft`, `publishAnnouncement` (inline fan-out), `dispatchDueBroadcasts` (scheduled fan-out). Readers: `listAnnouncements`, `getPendingAcknowledgements`, `listInbox`, `countUnread`. State writes: `acknowledgeDelivery`, `markRead`.
- **`computeAudience` / `resolveAudience`** — the pure resolver + its DB-fetching wrapper; shared by the inline publish and the cron dispatch.
- **Validators/handlers:** `ComposeAnnouncementInput` + `AnnouncementPresentation` (zod); `Body` (`{deliveryId: uuid}`) in the acknowledge route; `assertCron`/`isAuthorizedCron` in cron-auth.
- **In-memory test backend (`testStore`)** mirrors the engine for `E2E_TEST_MODE`. **Divergences from the real backend (ugly truths):**
  - `publishBroadcast` (test-store.ts:404-438) fans out to **all users except the sender** with **no system/sanitised/real-set filtering** and **no scope handling** (it has no scope field at all — `TestBroadcast` lacks scope/team/channel/refType/dispatchedAt/sendAt; test-store.ts:64-72). It ignores `presentation` filtering for recipients (every recipient gets the broadcast's presentation copied).
  - There is **no `dispatchDueBroadcasts` equivalent** in the test store — only the inline publish path is modelled.
  - `TestDelivery` (test-store.ts:74-84) lacks `channel`, `pushStatus`, `refType`, `refId`, `deliveredAt` — only the inbox/ack-relevant fields are kept.
  - `acknowledgeDelivery` / `getPendingAcknowledgements` / `countUnread` / `markRead` / `listInbox` otherwise match the real semantics (variant/owner scoping, ordering, unread filter).
  - `reset()` clears `broadcasts` and `deliveries` arrays between tests (test-store.ts:558-567).
- **Dead/unused-here:** `broadcast_kind` values `team_message`, `lead_directive`, `reminder`, `system` and scopes `team`/`team_leads`/`drivers`/`individual` are defined in the engine (audience resolves them) but the only compose path wired in this codebase is the camp-wide `announcement`/`everyone` subset (per the `ComposeAnnouncementInput` comment, types/announcement.ts:18-22: scoped & scheduled compose inputs "land with the gating + push UIs"). `push`/`in_app` channel values and the entire `push_delivery_status` enum are carried on rows but not exercised by this inbox/gate engine (push worker is a separate unit).

---

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

---

# 29 — Canonical data model & enums

**Files covered:**
- `packages/db/src/schema.ts` — THE canonical Drizzle/Postgres schema: every pgEnum, every pgTable, every column + default + index. Source of truth; migrations are generated from it.
- `packages/db/src/index.ts` — driver factories: `createHttpDb()` (HTTP, stateless, no transactions), `createPooledDb()` (WebSocket pool, transaction-capable), `BUILD_PLACEHOLDER_URL`, `Database` type.
- `packages/db/src/account.ts` — account erasure (POPIA/GDPR): `sanitisedUserPatch`, `sanitiseAccount`, `lostCatName`; the exact set of personal rows deleted vs. preserved.
- `packages/db/src/burner-profile.ts` — user-row + burner-profile read/writers: `findUserByAuthId`, `findUserById`, `createCampUser`, `setUserApprovalStatus`, `setUserApproval`, `setUserInviteCode`, `setUserRank`, `setUserProfileImage`, `setUserDisplayName`, `getBurnerProfileByUserId`, `upsertBurnerProfile`, `getIdDocumentColumns`, `setIdDocumentColumns`.
- `packages/db/src/roster.ts` — captain-only camp-management roster + member detail aggregates: `CampManagementMember`, `getCampManagementRoster`, `CampMemberDetail`, `getCampMemberDetail`, `isTeamLead` (derived team-lead check).
- `packages/db/src/activations.ts` — required-actions producer + satisfaction: `openActivation`, `ensureRequiredAction`, `satisfyRequiredAction`, `getPendingRequiredActions`, `PUSH_SCOPES`.
- `packages/db/src/broadcasts.ts` — announcement/notification data layer: drafts, publish, scheduled dispatch, inbox, acknowledgements, unread count.
- `packages/db/src/audience.ts` — PURE scope→recipient-id resolver `computeAudience`, `BroadcastScope` type, `AudienceData`.
- `packages/db/src/push.ts` — push-token upsert/delete + `drainQueuedPush` + pure `planPushDrain`.
- `packages/db/src/push-status.ts` — PURE push decision logic: `shouldPruneToken`, `deliveryPushStatus`, `chunk`, `mapSendResponses`, `PRUNE_CODES`, `PushSend`/`TokenSendResult` types.
- `packages/db/src/invite-codes.ts` — invite-code lifecycle: `findUsableInviteCode`, `consumeInviteCode`, `createInviteCode`, `findInviteCodeByCode`, `InviteCodeRow`, `AssignedRank`.
- `packages/db/src/id-documents.ts` — PURE ID-number split/merge: `ID_NUMBER_KEY`, `ID_TYPE_KEY`, `splitIdNumber`, `mergeIdNumber`, `idColumnsFor`.
- `packages/db/src/crypto.ts` — AES-256-GCM encrypt/decrypt for the `_encrypted` columns (NOT pgcrypto, despite column names): `encrypt`, `decrypt`, `decryptOrNull`.
- `packages/db/src/maintenance.ts` — `backfillIdEncryption` one-shot migration.
- `packages/db/src/questionnaire-edits.ts` — replay change-log writer/reader: `recordQuestionnaireEdit`, `listQuestionnaireEdits`, `QuestionnaireEditRow`.
- `packages/db/src/relations.ts` — referral-graph reads: `getReferralRoster`, `getInvitesIssuedBy`, `getRootCodes`, `ReferralUser`.
- `packages/db/src/versions.ts` — PURE version comparison `meetsRequiredVersion`, `VERSION_RE`.
- `packages/db/src/telegram.ts` — Telegram bot data layer (chats, invites, announcements queue) + types.
- `packages/db/src/mcp.ts` — MCP OAuth scope/audit reads: `getMcpScopeRows`, `appendMcpAuditLog`, `touchAccessToken`, `findActiveAccessToken`, `McpScopeRows`, `Team` type.
- `packages/types/src/roles.ts` — `Rank` (3-value UI ladder, NOT the DB rank enum), `Team` zod enum (mirrors DB).
- `packages/types/src/member.ts` — `DietaryTag`, `EmergencyContact`, `MembershipTier`, `SignupInput`, `MemberProfile`.
- `packages/types/src/questionnaire.ts` — the 10 question kinds, `QuestionnairePage`, `Questionnaire`, response value/validator, `QuestionnaireFieldChange`, `diffResponses`, `validateResponses`, `displayResponseValue`, `flattenQuestions`.
- `packages/types/src/announcement.ts` — `AnnouncementPresentation`, `ComposeAnnouncementInput`.
- `packages/types/src/recipe.ts` — `RecipeStatus`, `RecipeSource`, `RecipeSubmission`, `Ingredient`, `NormalisedRecipe`.
- `packages/types/src/reimbursement.ts` — `ReimbursementStatus`, `ReimbursementAccountType`, `SaAccountDetails`, `InternationalAccountDetails`, `ReimbursementAccount`, `ReimbursementInput`.
- `packages/types/src/voice-intent.ts` — `VoiceIntentName`, `VoiceIntent`.
- `packages/types/src/index.ts` — barrel re-export of all the above.

**Purpose:** This is THE canonical catalog of Camp 404's persisted data: every Postgres table, every column (name + SQL type + nullability + default), every pgEnum (with literal members in order), every index/unique constraint, and the zod mirror types that validate inputs and derive enums. It is server-only — Neon Postgres + Drizzle, with identity (email/password/OAuth/MFA/sessions) held externally in Neon Auth (Better Auth) and joined via `users.auth_user_id` (no auth tables live in this repo). It covers both screened domains (users, invites, burner/dietary/driver profiles, teams, questionnaire activations, required-actions, broadcasts/notifications/push) and screenless/future domains (recipes, documents, reimbursements, team budgets, tasks, adoptees, workshops, inventory + inventory-updates, audit log, telegram bot, MCP OAuth). Every other unit's "Data model touched" must agree with the names and enum members listed here.

## Features

### Enum catalog (schema.ts:25-211, 1223-1237)
26 `pgEnum`s (23 in the main schema + 3 in the MCP block). Listed with literal members in declaration order (verbatim):
- `rank` (schema.ts:31): `["captain", "member"]` — the ONLY two stored ranks. `team_lead` and `driver` are derived, never stored.
- `approval_status` (41): `["pending", "approved", "rejected"]` — membership vetting lifecycle; `rejected` is terminal.
- `team` (51): `["kitchen", "structures", "power_and_lighting", "sanitation_and_water", "health_and_safety", "art_and_activities", "ministry_of_memes", "ministry_of_vibes"]` — 8 working teams; stable identifiers, labels are code-side.
- `membership_tier` (62): `["full", "build_week_only"]`.
- `recipe_status` (67): `["pending", "analysing", "ready", "scheduled", "rejected"]`.
- `recipe_source` (75): `["url", "text", "voice"]`.
- `reimbursement_status` (81): `["submitted", "approved", "paid", "reconciled", "rejected"]`.
- `platform` (89): `["web", "ios", "android"]`.
- `reimbursement_account_type` (91): `["sa", "international"]`.
- `required_action_type` (99): `["questionnaire", "acknowledgement", "payment", "profile_update"]`.
- `required_action_status` (106): `["pending", "completed", "waived", "expired"]`.
- `questionnaire_scope` (114): `["everyone", "team", "team_leads", "individual", "opt_in"]`.
- `activation_status` (122): `["draft", "open", "closed"]`.
- `broadcast_kind` (128): `["announcement", "team_message", "lead_directive", "reminder", "system"]`.
- `broadcast_scope` (136): `["everyone", "team", "team_leads", "drivers", "individual"]`.
- `notification_channel` (144): `["push", "in_app", "both"]`.
- `push_delivery_status` (150): `["queued", "sent", "failed", "skipped"]`.
- `broadcast_presentation` (166): `["acknowledge", "popup", "feed"]`.
- `task_status` (172): `["open", "done", "cancelled"]`.
- `inventory_update_status` (182): `["pending", "approved", "rejected"]`.
- `telegram_chat_kind` (191): `["main_group", "announcement_channel"]`.
- `telegram_invite_status` (200): `["pending", "used", "expired", "revoked"]`.
- `telegram_announcement_status` (208): `["queued", "sent", "failed"]`.
- `mcp_client_auth_method` (1223): `["none", "client_secret_basic", "client_secret_post"]`.
- `mcp_code_challenge_method` (1229): `["S256", "plain"]`.
- `mcp_audit_outcome` (1234): `["success", "error"]`.

### Table catalog (33 tables)
Grouped by domain; full column lists in "Data model touched" below. Screened/active: `users`, `invite_codes`, `burner_profiles`, `dietary_requirements`, `driver_profiles`, `car_members`, `team_memberships`, `questionnaire_activations`, `questionnaire_activation_targets`, `questionnaire_edits`, `required_actions`, `broadcasts`, `broadcast_targets`, `notification_deliveries`, `push_tokens`. Screenless/future: `recipes`, `documents`, `reimbursements`, `team_budgets`, `tasks`, `adoptees`, `workshops`, `workshop_rsvps`, `inventory_items`, `inventory_updates`, `audit_log`, `telegram_chats`, `telegram_invites`, `telegram_announcements`, `mcp_oauth_clients`, `mcp_auth_codes`, `mcp_access_tokens`, `mcp_audit_log`.

### Derived (never-stored) facets
- **team-lead** — derived from `team_memberships.is_lead = true` on ANY team (`isTeamLead`, roster.ts:204; `getCampManagementRoster` `isLead` subquery roster.ts:66). A team-lead user "should also carry `users.rank = 'team_lead'`" per the schema comment (schema.ts:454) BUT `team_lead` is NOT a member of the `rank` pgEnum — this is a stale/aspirational comment; the stored rank can only be `captain` or `member`. The 3-value `Rank` ladder lives only in zod (`roles.ts:5`) for UI use.
- **driver** — derived from `driver_profiles.intends_to_drive = true` (audience.ts:18; broadcasts.ts:73-75; mcp.ts:55-60).
- **car group** — `car_members` rows under a driver.

### Account erasure / "Lost Cat" (account.ts)
`sanitiseAccount(userId)` runs in one pooled transaction: computes the next `lostCatNumber` = `max(users.lost_cat_number) + 1` (account.ts:64), patches the `users` row via `sanitisedUserPatch` (sets `displayName = "Lost Cat #N"`, `authUserId = "deleted:<id>"`, nulls profile image / passport / SA-ID / EFT / emergency contacts / telegram handle+userId / terms fields, `sanitised = true`, `sanitisedAt = now`, `lostCatNumber = N`), then DELETEs the owned personal rows (because the kept `users` row means CASCADE never fires): `burner_profiles`, `dietary_requirements`, `driver_profiles`, `push_tokens`, `notification_deliveries`, `questionnaire_edits`, `required_actions`, `team_memberships`, `car_members` (driver OR passenger), `workshop_rsvps`, `broadcast_targets`, `questionnaire_activation_targets`. Scrubs `reimbursements.account_details_encrypted` to `""` (NOT NULL, so empty string not null) while keeping the row for accounting. Preserves `id`, `inviteCode` (lineage), and all audit/authorship FKs (which now resolve to "Lost Cat #N").

### Required-actions gating engine (activations.ts)
`openActivation(activationId)` flips an activation to `open`, computes recipients via `computeAudience`, and upserts one `required_actions` row per recipient (`onConflictDoUpdate` on `(user_id, action_key)` — re-open re-points version/activation and resets to `pending`, clears `completedAt`). `PUSH_SCOPES = new Set(["everyone", "team", "team_leads", "individual"])` (activations.ts:14). `opt_in` returns `{ ok:false, error:"opt_in activations are not yet supported." }` (DEAD/deferred pull-model path). `satisfyRequiredAction` flips a pending row to `completed` when the completed version `meetsRequiredVersion` the required version; a versionless gate or completion satisfies unconditionally (only a completion recorded against an older `-vN` than the required one leaves the gate open). `getPendingRequiredActions` returns pending + blocking rows oldest-first (the gate order).

### Versioning (versions.ts)
`meetsRequiredVersion(required, completed)` parses `"<base>-v<N>"` via `VERSION_RE = /^(.*)-v(\d+)$/`; when bases match, compares the `-vN` suffix as an integer (so `-v10 > -v9`); otherwise lexicographic fallback (safe for date-prefixed bases like `"2026.05.29-v8"`).

## User actions & interactions
This is a data/server unit — no UI. The user-facing actions that mutate this model (each owned by another unit) are:
- Sign up via invite code → `createCampUser` (rank/approvalStatus optional), `consumeInviteCode` (atomic `use_count++` guarded by revoked/expired/maxUses), `setUserInviteCode`.
- Complete burner profile → `upsertBurnerProfile` (sets/keeps `completedAt`), `satisfyRequiredAction("burner_profile")`.
- Replay/edit a questionnaire → `recordQuestionnaireEdit` (skipped when `changes` empty), diffed via `diffResponses`.
- Edit display name / profile photo → `setUserDisplayName`, `setUserProfileImage`.
- Save government ID → `setIdDocumentColumns` (writes `passport_encrypted`/`sa_id_encrypted` ciphertext via crypto.ts; `idColumnsFor` moves value between columns when type changes, nulling the other).
- Register driver intent / driver questionnaire → writes `driver_profiles` (`intends_to_drive`, vehicle, proficiency).
- Captain mints invite → `createInviteCode` (lowercases `invited_email`).
- Captain vets a member → `setUserApproval({status, decidedByUserId})` (stamps `approval_decided_by_user_id` + `approval_decided_at`); `setUserApprovalStatus` sets status with NO decider (signup queue drop).
- Captain promotes/demotes → `setUserRank`.
- Captain composes/edits/deletes/publishes announcement → `createAnnouncementDraft`, `updateAnnouncementDraft`, `deleteAnnouncementDraft`, `publishAnnouncement` (fans out deliveries to everyone except author).
- Recipient reads/acknowledges notifications → `markRead(ids)`, `acknowledgeDelivery` (only `presentation='acknowledge'`, owner-scoped), `getPendingAcknowledgements`, `listInbox`, `countUnread`.
- Device registers for push → `upsertPushToken`; sign-out → `deletePushTokenForUser`.
- Account self-erasure → `sanitiseAccount`.
- MCP/Telegram flows → see those domains below.

## States & presentations
This unit defines the data substrate for every global-states row; the load-bearing state-carrying columns:
- **Empty / Populated** — generic; nullable columns + `default([])`/`default({})` JSONB represent emptiness (`users.skills`, `burner_profiles.responses`, `dietary_requirements.tags`, `push_tokens.topics`, `recipes.dietary_tags`).
- **Loading** — N/A at data layer (driver round-trips).
- **Validation-error** — `validateResponses` returns `{ ok:false, errors:Record<string,string> }`; `_root: "Malformed response payload"` for a bad payload shape; per-question keys otherwise. `ReimbursementInput`/`SignupInput`/`ComposeAnnouncementInput` zod refinements produce field errors.
- **Submitting/pending** — `recipe_status='pending'|'analysing'`, `reimbursement_status='submitted'`, `inventory_update_status='pending'`, `required_action_status='pending'`, `push_delivery_status='queued'`, `telegram_*_status='pending'|'queued'`, `broadcasts.publishedAt IS NULL` (draft), `dispatchedAt IS NULL` (not yet fanned out).
- **Success/completed** — `*.completedAt` set (burner/dietary/driver), `required_action_status='completed'`, `recipe_status='ready'|'scheduled'`, `reimbursement_status='approved'|'paid'|'reconciled'`, `push_delivery_status='sent'`, `notification_deliveries.acknowledgedAt`/`readAt` set.
- **Disabled / Captain-only-locked** — enforced in app/query layer (roster.ts notes "callers MUST gate this behind a captain rank check"); the data layer trusts the caller. `users.rank` and derived `isLead` drive lock state.
- **Invite-gated** — `users.invite_code` (NULL = god account) + `invite_codes` row state (`findUsableInviteCode` returns null when revoked/expired/exhausted).
- **Onboarding-incomplete** — `required_actions (status='pending', blocking=true)` rows; `getPendingRequiredActions`.
- **Pending-approval** — `users.approval_status='pending'`.
- **Rejected** — `users.approval_status='rejected'` (terminal).
- No offline/sync columns and no budget/over-target columns exist at the data layer (team_budgets exists but carries no over-target/goal state — just assigned vs perceived amounts).

## Enums, options & configurable values
**Stored DB enums:** the 26 `pgEnum`s above (verbatim members).

**Zod enums / mirror types (packages/types):**
- `Rank` (roles.ts:5): `["captain", "team_lead", "member"]` — 3-value UI ladder; INCLUDES `team_lead`, which the DB `rank` enum does NOT. Disagreement is intentional (derived rank for UI).
- `Team` (roles.ts:10): mirrors the 8-value DB `team` enum exactly; comment: "the database is the source of truth."
- `DietaryTag` (member.ts:6): `["vegan", "vegetarian", "gluten_free", "nut_free", "soy_free", "dairy_free", "halal", "kosher", "low_fodmap", "allergy_other"]`.
- `MembershipTier` (member.ts:26): `["full", "build_week_only"]`.
- `AnnouncementPresentation` (announcement.ts:8): `["acknowledge", "popup", "feed"]` (mirrors `broadcast_presentation`).
- `RecipeStatus` / `RecipeSource` (recipe.ts:4,13): mirror DB.
- `ReimbursementStatus` / `ReimbursementAccountType` (reimbursement.ts:4,13): mirror DB.
- `VoiceIntentName` (voice-intent.ts:3): `["add_recipe", "mark_shift_done", "log_expense", "note_to_team", "unknown"]`.
- Question kinds (questionnaire.ts) — 10: `slider`, `single_select`, `multi_select`, `short_text`, `long_text`, `date`, `scale`, `toggle`, `combobox`, `image`. Page kinds: `questions`, `intro`.

**Defaults & ranges (verbatim):**
- `users`: `rank` default `member`; `is_system` false; `dues_paid` false; `skills` `[]`; `previous_afrikaburns` 0; `previous_burning_mans` 0; `first_time` false; `approval_status` default `approved`; `sanitised` false; `ai_data_consent` false; `created_at`/`updated_at` defaultNow.
- `invite_codes`: `use_count` 0; `requires_approval` false (but app rule: non-captain codes ALWAYS true); `created_at` now.
- `burner_profiles`: `responses` `{}`; `started_at` now.
- `dietary_requirements`: `tags` `[]`; `is_anaphylactic` false.
- `driver_profiles`: `intends_to_drive` false; `can_offer_lifts` false; `offroad_experienced` false; `can_tow` false.
- `team_memberships`: `is_lead` false.
- `questionnaire_activations`: `blocking` true; `status` `draft`.
- `required_actions`: `blocking` true; `status` `pending`.
- `recipes`: `status` `pending`; `dietary_tags` `[]`.
- `documents`: `markdown` `""`; `version` 1; `published` false.
- `reimbursements`: `status` `submitted`; `amount` `numeric(12,2)`; `currency` text (ISO 4217).
- `team_budgets`: `currency` default `"ZAR"`; amounts `numeric(12,2)` nullable.
- `push_tokens`: `topics` `[]`; `last_seen_at` now.
- `broadcasts`: `channel` `both`; `presentation` `feed`.
- `notification_deliveries`: `presentation` `feed`; `push_status` `queued`.
- `tasks`: `status` `open`.
- `inventory_items`: `quantity` 0; `requires_maintenance` false; `weight_kg`/`amount` `numeric(10,2)`.
- `inventory_updates`: `status` `pending`; `requires_maintenance` false.
- `workshops`: `capacity` default 20.
- `telegram_invites`: `status` `pending`. `telegram_announcements`: `status` `queued`; `send_after` defaultNow.
- Question defaults (questionnaire.ts): `slider.step` 1; `short_text.maxLength` 120; `long_text.maxLength` 1000; `required` defaults — `true` for slider/single_select/short_text/date/scale/toggle/combobox, `false` for multi_select/long_text/image.
- `ComposeAnnouncementInput`: `title` 1–120 chars; `body` 1–5000 chars; `presentation` default `acknowledge`.
- `ReimbursementInput`: `amount > 0`; `currency` `/^[A-Z]{3}$/`; `description` 1–500; `team` default null; SWIFT/BIC 8–11 chars; SA `accountNumber.min(4)`, `branchCode.min(3)`; at least one of receipt/item photo required.
- `SignupInput`: `saIdNumber` `/^\d{13}$/`; `emergencyContacts` 1–2 items; each contact `name.min(1)`, `phone.min(3)`, `relationship.min(1)`.
- crypto.ts: `ALGO="aes-256-gcm"`, `IV_LEN=12`, `TAG_LEN=16`, `KEY_SALT="camp404-pgcrypto-v1"`, key from `PGCRYPTO_KEY` (≥16 chars), stored as `base64(iv‖tag‖ciphertext)`.
- push-status.ts: FCM batch cap 500 (`chunk(tokens, 500)` in push.ts:102); `PRUNE_CODES = {"messaging/registration-token-not-registered", "messaging/invalid-registration-token", "messaging/invalid-argument"}`.
- id-documents.ts: `ID_NUMBER_KEY="id.number"`, `ID_TYPE_KEY="id.type"`; `idColumnsFor` routes `sa_id` → `sa_id_encrypted`, everything else (default/passport) → `passport_encrypted`.
- index.ts: `BUILD_PLACEHOLDER_URL="postgres://build:build@localhost:5432/build?sslmode=disable"`; `NEON_LOCAL_PROXY=1` → insecure ws on port 5433.
- telegram.ts: `listDueAnnouncements` default limit 25; `listPendingInvitesForUser` filters status=pending + (no expiry OR expiry ≥ now).
- questionnaire-edits.ts: `listQuestionnaireEdits` default limit 20.

## Data model touched
Full column lists (column name + SQL type, with key flags). All timestamps are `timestamp(mode:"date")`; PK = primary key; FK references shown with on-delete.

**users** (schema.ts:220): `id` uuid PK defaultRandom; `auth_user_id` text NOT NULL UNIQUE; `display_name` text; `profile_image_url` text; `rank` rank NOT NULL default member; `is_system` bool NOT NULL default false; `membership_tier` membership_tier; `dues_paid` bool NOT NULL default false; `dues_paid_at` ts; `passport_encrypted` text; `sa_id_encrypted` text; `eft_details_encrypted` text; `skills` jsonb<string[]> default []; `previous_afrikaburns` int default 0; `previous_burning_mans` int default 0; `first_time` bool default false; `emergency_contacts` jsonb<Array<{name,phone,relationship}>>; `invite_code` text (NULL=god); `approval_status` approval_status NOT NULL default approved; `approval_decided_by_user_id` uuid→users.id (set null); `approval_decided_at` ts; `terms_version` text; `terms_consented_at` ts; `sanitised` bool NOT NULL default false; `sanitised_at` ts; `lost_cat_number` int; `telegram_handle` text; `telegram_user_id` text UNIQUE; `ai_data_consent` bool NOT NULL default false; `ai_data_consent_at` ts; `created_at`/`updated_at` NOT NULL defaultNow.

**invite_codes** (312): `code` text PK; `created_by_user_id` uuid→users.id (set null); `note` text; `max_uses` int; `use_count` int NOT NULL default 0; `expires_at` ts; `revoked_at` ts; `assigned_rank` rank (NULL=member); `invited_email` text (lowercased); `requires_approval` bool NOT NULL default false; `created_at` NOT NULL defaultNow. Index: `invite_codes_created_by_idx`.

**burner_profiles** (352): `user_id` uuid PK →users.id (cascade); `version` text NOT NULL; `responses` jsonb<Record<string,unknown>> NOT NULL default {}; `started_at` NOT NULL defaultNow; `completed_at` ts; `updated_at` NOT NULL defaultNow.

**dietary_requirements** (372): `user_id` uuid PK →users.id (cascade); `tags` jsonb<string[]> NOT NULL default []; `allergies` text; `intolerances` text; `is_anaphylactic` bool NOT NULL default false; `notes` text; `version` text NOT NULL; `completed_at` ts; `created_at`/`updated_at` NOT NULL defaultNow. (Single source of dietary data — NO dietary columns on users.)

**driver_profiles** (393): `user_id` uuid PK →users.id (cascade); `intends_to_drive` bool NOT NULL default false; `intent_registered_at` ts; `vehicle_make`/`vehicle_model`/`vehicle_registration` text; `seats_total`/`seats_offered` int; `can_offer_lifts` bool NOT NULL default false; `offroad_experienced` bool NOT NULL default false; `can_tow` bool NOT NULL default false; `proficiency_notes` text; `departure_city` text; `arrival_at`/`departure_at` ts; `notes` text; `version` text NOT NULL; `completed_at` ts; `created_at`/`updated_at` NOT NULL defaultNow.

**car_members** (427): `driver_user_id` uuid NOT NULL →driver_profiles.userId (cascade); `member_user_id` uuid NOT NULL →users.id (cascade); `created_at` NOT NULL defaultNow. PK (driver_user_id, member_user_id). Index `car_members_member_idx`.

**team_memberships** (446): `user_id` uuid NOT NULL →users.id (cascade); `team` team NOT NULL; `is_lead` bool NOT NULL default false; `created_at` NOT NULL defaultNow. PK (user_id, team). Index `team_memberships_team_idx`.

**questionnaire_activations** (472): `id` uuid PK defaultRandom; `questionnaire_key` text NOT NULL; `version` text NOT NULL; `title` text NOT NULL; `description` text; `scope` questionnaire_scope NOT NULL; `team` team (set when scope='team'); `blocking` bool NOT NULL default true; `status` activation_status NOT NULL default draft; `due_at` ts; `activated_by_user_id` uuid→users.id (set null); `opened_at`/`closed_at` ts; `created_at`/`updated_at` NOT NULL defaultNow. Indexes `_key_idx`, `_status_idx`.

**questionnaire_activation_targets** (505): `activation_id` uuid NOT NULL →questionnaire_activations.id (cascade); `user_id` uuid NOT NULL →users.id (cascade). PK (activation_id, user_id).

**questionnaire_edits** (530): `id` uuid PK defaultRandom; `user_id` uuid NOT NULL →users.id (cascade); `questionnaire_key` text NOT NULL; `version` text NOT NULL; `edited_by_user_id` uuid→users.id (set null); `changes` jsonb<QuestionnaireFieldChange[]> NOT NULL default []; `created_at` NOT NULL defaultNow. Index `_user_key_created_idx` (user_id, questionnaire_key, created_at). No full version history kept — domain table holds latest answers.

**required_actions** (570): `id` uuid PK defaultRandom; `user_id` uuid NOT NULL →users.id (cascade); `type` required_action_type NOT NULL; `action_key` text NOT NULL; `version` text; `activation_id` uuid→questionnaire_activations.id (set null); `title` text NOT NULL; `blocking` bool NOT NULL default true; `status` required_action_status NOT NULL default pending; `due_at` ts; `created_at` NOT NULL defaultNow; `completed_at` ts. UNIQUE index `_user_action_idx` (user_id, action_key); index `_user_status_idx`.

**recipes** (613): `id` uuid PK defaultRandom; `submitter_id` uuid NOT NULL →users.id (set null); `source` recipe_source NOT NULL; `status` recipe_status NOT NULL default pending; `source_url` text; `raw_text` text; `audio_blob_url` text; `transcript` text; `normalised` jsonb; `dietary_tags` jsonb<string[]> default []; `analysed_at`/`scheduled_for` ts; `created_at`/`updated_at` NOT NULL defaultNow. Indexes `_status_idx`, `_submitter_idx`.

**documents** (646): `id` uuid PK defaultRandom; `title` text NOT NULL; `slug` text NOT NULL; `category` text NOT NULL; `team` team; `markdown` text NOT NULL default ""; `version` int NOT NULL default 1; `author_id` uuid→users.id (set null); `published` bool NOT NULL default false; `created_at`/`updated_at` NOT NULL defaultNow. UNIQUE `documents_slug_idx`; index `documents_category_idx`.

**reimbursements** (676): `id` uuid PK defaultRandom; `submitter_id` uuid NOT NULL →users.id (set null); `team` team (NULL=general); `amount` numeric(12,2) NOT NULL; `currency` text NOT NULL (ISO 4217); `account_type` reimbursement_account_type NOT NULL; `account_details_encrypted` text NOT NULL; `description` text NOT NULL; `receipt_blob_url`/`item_photo_blob_url`/`voice_memo_blob_url` text; `status` reimbursement_status NOT NULL default submitted; `approver_id` uuid→users.id (set null); `approved_at`/`paid_at`/`reconciled_at` ts; `created_at`/`updated_at` NOT NULL defaultNow. Indexes `_status_idx`, `_submitter_idx`, `_team_idx`. (Log, not a finance system; payments actioned offline.)

**team_budgets** (723): `team` team PK; `currency` text NOT NULL default "ZAR"; `assigned_amount` numeric(12,2); `perceived_amount` numeric(12,2); `notes` text; `updated_at` NOT NULL defaultNow. (Screenless future domain — assigned vs perceived spend; NO over-target/goal state.)

**push_tokens** (734): `id` uuid PK defaultRandom; `user_id` uuid NOT NULL →users.id (cascade); `platform` platform NOT NULL; `token` text NOT NULL; `topics` jsonb<string[]> default []; `last_seen_at` NOT NULL defaultNow; `created_at` NOT NULL defaultNow. UNIQUE `push_tokens_token_idx`; index `push_tokens_user_idx`.

**broadcasts** (763): `id` uuid PK defaultRandom; `sender_id` uuid→users.id (set null); `kind` broadcast_kind NOT NULL; `scope` broadcast_scope NOT NULL; `team` team (when scope='team'); `title` text NOT NULL; `body` text NOT NULL; `channel` notification_channel NOT NULL default both; `presentation` broadcast_presentation NOT NULL default feed; `ref_type` text; `ref_id` uuid; `published_at` ts (NULL=draft); `dispatched_at` ts (NULL=not fanned out); `send_at` ts (NULL/≤now=immediate); `created_at` NOT NULL defaultNow. Indexes `_sender_idx`, `_created_at_idx`.

**broadcast_targets** (810): `broadcast_id` uuid NOT NULL →broadcasts.id (cascade); `user_id` uuid NOT NULL →users.id (cascade). PK (broadcast_id, user_id).

**notification_deliveries** (830): `id` uuid PK defaultRandom; `broadcast_id` uuid→broadcasts.id (cascade, NULL for system rows); `user_id` uuid NOT NULL →users.id (cascade); `title` text NOT NULL; `body` text NOT NULL; `channel` notification_channel NOT NULL; `presentation` broadcast_presentation NOT NULL default feed; `push_status` push_delivery_status NOT NULL default queued; `ref_type` text; `ref_id` uuid; `read_at` ts; `acknowledged_at` ts; `delivered_at` ts; `created_at` NOT NULL defaultNow. Indexes `_user_read_idx`, `_user_ack_idx`, `_broadcast_idx`; partial UNIQUE `_broadcast_user_uniq` (broadcast_id, user_id) WHERE broadcast_id IS NOT NULL.

**tasks** (893): `id` uuid PK defaultRandom; `title` text NOT NULL; `description` text; `assignee_id` uuid→users.id (set null); `team` team; `created_by_user_id` uuid→users.id (set null); `due_at` ts; `status` task_status NOT NULL default open; `created_at` NOT NULL defaultNow; `completed_at` ts. Indexes `_assignee_idx`, `_team_idx`, `_status_idx`.

**adoptees** (920): `id` uuid PK defaultRandom; `slot_number` int NOT NULL; `name` text NOT NULL; `contact` text; `dietary_notes` text; `arrival`/`departure` ts; `tent_assigned`/`bedding_assigned`/`fridge_shelf_assigned` text; `sponsor_id` uuid→users.id (set null); `approved_by_id` uuid→users.id (set null); `created_at` NOT NULL defaultNow.

**workshops** (942): `id` uuid PK defaultRandom; `title` text NOT NULL; `description` text; `starts_at`/`ends_at` ts NOT NULL; `capacity` int NOT NULL default 20; `host_id` uuid→users.id (set null); `created_at` NOT NULL defaultNow.

**workshop_rsvps** (953): `workshop_id` uuid NOT NULL →workshops.id (cascade); `user_id` uuid NOT NULL →users.id (cascade); `created_at` NOT NULL defaultNow. PK (workshop_id, user_id).

**inventory_items** (976): `id` uuid PK defaultRandom; `name` text NOT NULL; `details` text; `team` team NOT NULL; `quantity` int NOT NULL default 0; `unit` text; `weight_kg` numeric(10,2); `requires_maintenance` bool NOT NULL default false; `maintenance_interval_days` int; `last_maintained_at` ts; `next_maintenance_due_at` ts; `maintenance_notes` text; `custodian_user_id` uuid→users.id (set null, NULL=camp storage); `storage_location` text; `last_checked_at` ts; `last_checked_by_user_id` uuid→users.id (set null); `created_by_user_id` uuid→users.id (set null); `archived_at` ts (soft-removal); `created_at`/`updated_at` NOT NULL defaultNow. Indexes `_team_idx`, `_custodian_idx`, `_maintenance_due_idx`.

**inventory_updates** (1049): `id` uuid PK defaultRandom; `item_id` uuid→inventory_items.id (cascade, NULL=create-new proposal); `proposed_by_user_id` uuid NOT NULL →users.id (set null); `status` inventory_update_status NOT NULL default pending; `name` text NOT NULL; `details` text; `team` team NOT NULL; `quantity` int NOT NULL; `unit` text; `weight_kg` numeric(10,2); `requires_maintenance` bool NOT NULL default false; `maintenance_interval_days` int; `custodian_user_id` uuid→users.id (set null); `storage_location` text; `maintenance_performed_at` ts; `note` text; `reviewed_by_user_id` uuid→users.id (set null); `reviewed_at` ts; `review_note` text; `created_at` NOT NULL defaultNow. Indexes `_item_idx`, `_status_idx`, `_proposed_by_idx`. (Full snapshot per row — approving = straight copy onto item; approval NOT team-scoped.)

**audit_log** (1107): `id` uuid PK defaultRandom; `actor_id` uuid→users.id (set null); `action` text NOT NULL; `target` text; `metadata` jsonb; `created_at` NOT NULL defaultNow. Indexes `_actor_idx`, `_action_idx`.

**telegram_chats** (1137): `id` uuid PK defaultRandom; `kind` telegram_chat_kind NOT NULL; `chat_id` text NOT NULL UNIQUE; `title` text NOT NULL; `username` text; `added_by_user_id` uuid→users.id (set null); `added_at` NOT NULL defaultNow; `archived_at` ts.

**telegram_invites** (1156): `id` uuid PK defaultRandom; `user_id` uuid NOT NULL →users.id (cascade); `chat_id` text NOT NULL (NOT an FK); `invite_link` text NOT NULL UNIQUE; `status` telegram_invite_status NOT NULL default pending; `expires_at` ts; `joined_at` ts; `created_at` NOT NULL defaultNow. Indexes `_user_idx`, `_status_idx`.

**telegram_announcements** (1185): `id` uuid PK defaultRandom; `broadcast_id` uuid→broadcasts.id (set null); `chat_id` text NOT NULL; `body` text NOT NULL; `status` telegram_announcement_status NOT NULL default queued; `message_id` text; `error_message` text; `send_after` ts NOT NULL defaultNow; `sent_at` ts; `created_at` NOT NULL defaultNow. Indexes `_status_send_after_idx`, `_broadcast_idx`.

**mcp_oauth_clients** (1242): `client_id` text PK; `client_secret_hash` text (NULL for public clients); `client_name` text NOT NULL; `redirect_uris` text[] NOT NULL; `token_endpoint_auth_method` mcp_client_auth_method NOT NULL; `scope` text; `created_at` NOT NULL defaultNow; `last_used_at` ts.

**mcp_auth_codes** (1260): `code` text PK; `client_id` text NOT NULL →mcp_oauth_clients.clientId (cascade); `user_id` uuid NOT NULL →users.id (cascade); `redirect_uri` text NOT NULL; `code_challenge` text NOT NULL; `code_challenge_method` mcp_code_challenge_method NOT NULL; `scope` text NOT NULL; `expires_at` ts NOT NULL; `consumed_at` ts; `created_at` NOT NULL defaultNow. Indexes `_client_idx`, `_expires_idx`. (PKCE-required, ~5min, plaintext single-use.)

**mcp_access_tokens** (1289): `token_hash` text PK (SHA-256); `refresh_token_hash` text UNIQUE; `client_id` text NOT NULL →mcp_oauth_clients.clientId (cascade); `user_id` uuid NOT NULL →users.id (cascade); `scope` text NOT NULL; `expires_at` ts NOT NULL; `refresh_expires_at` ts; `revoked_at` ts; `created_at` NOT NULL defaultNow; `last_used_at` ts. Indexes `_user_idx`, `_expires_idx`.

**mcp_audit_log** (1316): `id` uuid PK defaultRandom; `user_id` uuid NOT NULL →users.id (cascade); `client_id` text NOT NULL (NOT an FK — survives client deletion); `tool` text NOT NULL; `args_json` jsonb (redacted); `outcome` mcp_audit_outcome NOT NULL; `error_message` text; `duration_ms` int; `created_at` NOT NULL defaultNow. Index `_user_created_idx`.

**Identity tables (external, NOT in repo):** email/password/OAuth/MFA/sessions live in Neon Auth (Better Auth). Joined via `users.auth_user_id` mirroring upstream `user.id` (schema.ts:19-23, 220-222). No `account`/`session`/`verification` Drizzle tables exist in this package.

**Non-table interfaces (read DTOs):** `ReferralUser` (relations.ts), `CampManagementMember` / `CampMemberDetail` (roster.ts), `PendingRequiredAction` (activations.ts), `AnnouncementSummary` / `DraftInput` / `PendingAcknowledgement` / `InboxItem` (broadcasts.ts), `InviteCodeRow` (invite-codes.ts), `McpScopeRows` (mcp.ts), `Telegram*Row` (telegram.ts), `QueuedPushDelivery` / `PushDrainResult` (push.ts), `QuestionnaireEditRow` (questionnaire-edits.ts), `SplitId` (id-documents.ts).

## Validation, edge cases & business rules
- **Two stored ranks only.** `rank ∈ {captain, member}`. `team_lead`/`driver` are derived at read time; the 3-value `Rank` zod ladder is UI-only. The schema.ts:454 comment that a lead "should also carry `users.rank = 'team_lead'`" is STALE — that value is not in the enum and cannot be stored.
- **Approval gating.** `approval_status` defaults `approved` so god accounts and pre-gate accounts retain access. A redeemer of a `requires_approval=true` code is created `pending`. Non-captain-minted codes are ALWAYS `requires_approval=true` (app rule, schema.ts:332-336); only a captain can pre-approve (`requires_approval=false`). `rejected` is terminal. Captain decisions stamp `approval_decided_by_user_id` + `approval_decided_at`; signup-queue drops do not (two distinct writers: `setUserApproval` vs `setUserApprovalStatus`).
- **Invite redemption races.** `findUsableInviteCode` and `consumeInviteCode` both guard on `revoked_at IS NULL` AND (no expiry OR `expires_at > now`) AND (no cap OR `max_uses > use_count`). `consumeInviteCode` does the increment in the same guarded UPDATE → returns null if it became unusable mid-race. `findInviteCodeByCode` ignores state (availability hint only — codes are PK-unique forever).
- **Version-aware gate satisfaction.** A completion recorded against a version older than the required one leaves the gate `pending` (`satisfyRequiredAction` → `meetsRequiredVersion`). `-vN` suffix compared as integer; otherwise lexicographic.
- **Questionnaire validation** (`validateResponses`): unknown response keys are DROPPED (question removed in later version); missing required → per-question error "This question is required"; malformed payload → `{_root}` error. Per-kind rules: slider must be number in `[min,max]`; single_select/toggle/combobox must match an option value; multi_select filters to allowed values, required → ≥1; short/long text ≤ `maxLength`; date strict `/^\d{4}-\d{2}-\d{2}$/` and `Date.parse` valid; scale must match a step value; image any string. `diffResponses` treats multi-selects as sets (reorder ≠ change) and empty/absent as equal. A no-op replay records NO `questionnaire_edits` row.
- **ID document handling.** `id.number` is sensitive → split out of `burner_profiles.responses` and stored encrypted in `users.passport_encrypted`/`sa_id_encrypted` (`idColumnsFor`: `sa_id`→sa_id col, else passport col, nulling the other so switching type moves rather than orphans). `id.type` is NOT sensitive and stays in responses. SA ID validated `/^\d{13}$/` (member.ts).
- **Encryption reality.** Columns named `*_encrypted` and comments say "pgcrypto" but actual impl is Node AES-256-GCM (crypto.ts) — stale comments. Key from `PGCRYPTO_KEY` (≥16 chars or throws). `decryptOrNull` swallows errors → null. `sanitiseAccount` scrubs `reimbursements.account_details_encrypted` to `""` (NOT NULL → empty string, never null).
- **Audience resolution** (`computeAudience`, PURE): always excludes system actors (`is_system`), sanitised accounts, and the sender; de-duplicates. `team` scope with no team set → nobody. `drivers` scope = users with `intends_to_drive`. `everyone` = all real members.
- **Activation fan-out** supports only `PUSH_SCOPES` (everyone/team/team_leads/individual); `opt_in` is unsupported (returns error — DEAD branch), `drivers` is broadcast-only. Upsert on `(user_id, action_key)` makes re-activation idempotent.
- **Announcement drafts are author-private.** All draft writers gate on `kind='announcement' AND scope='everyone' AND publishedAt IS NULL AND senderId=author` (`isOwnedAnnouncementDraft`) — can't mutate another kind/scope sharing an id, can't edit/delete after publish. `publishAnnouncement` is idempotent on draft→published (claims the row in the UPDATE), and `ON CONFLICT DO NOTHING` on the partial unique `(broadcast_id, user_id)` prevents double fan-out. Author never receives their own announcement.
- **Notification read/ack.** `acknowledgeDelivery` only stamps `presentation='acknowledge'` deliveries that are owner-scoped and not yet acknowledged (never marks a feed/popup). `markRead(ids)` only marks the exact snapshotted ids that are still unread (avoids marking a row that arrived after snapshot). `countUnread` = deliveries with `read_at IS NULL`.
- **Push drain.** Reads `push_status='queued' AND channel IN ('push','both')` (NEVER `in_app` — those stay queued forever by design). Per-delivery status: `skipped` if recipient has no tokens, `sent` if ≥1 token succeeds, else `failed`. Dead tokens (3 FCM error codes) pruned. Status write conditional on row still `queued` (overlapping-run safe). FCM multicast capped at 500 tokens/batch.
- **Dispatch worker** (`dispatchDueBroadcasts`) drains broadcasts that are `publishedAt NOT NULL AND dispatchedAt IS NULL AND (send_at NULL OR ≤ now)`; claims each by atomically flipping `dispatched_at` (overlapping-cron safe). Immediate camp-wide announcements still fan out inline in `publishAnnouncement`; this drains the deferred tail.
- **Telegram.** Bots can't add by @handle — every join via a single-use invite link. `telegram_invites.chat_id` is deliberately NOT an FK (chat can be archived without losing historical link). `telegram_user_id` captured from `chat_member` webhook. `listPendingInvitesForUser` returns pending + unexpired only.
- **MCP.** `getMcpScopeRows` is a single read of user row + memberships + driver intent (scope derivation lives in app `lib/mcp/scope.ts`, NOT here). `appendMcpAuditLog` and `touchAccessToken` are best-effort (swallow errors — auditing must never break a tool call). `findActiveAccessToken` requires `revoked_at IS NULL AND expires_at > now`. `args_json` must be redacted at the boundary. `mcp_audit_log.client_id` is NOT an FK (survives client deletion).
- **Driver/HTTP vs pooled.** Transactions require `createPooledDb` (WebSocket); HTTP driver has none. `BUILD_PLACEHOLDER_URL` lets `next build` page-data collection run without secrets — any real query fails loudly.
- **AI data consent.** `ai_data_consent` gates surfacing *only* ID documents / others' bank details to OTHER users' MCP sessions; everything else is freely visible to the appropriate tier. The subject always sees their own data.

## Sub-components / variants
This is a server-only/data unit; the "sub-components" are the pure helpers, validators, and the screenless/future domains.

**Pure (DB-free, unit-testable) helpers:**
- `computeAudience` (audience.ts) — scope→ids.
- `planPushDrain`, `deliveryPushStatus`, `shouldPruneToken`, `chunk`, `mapSendResponses` (push.ts/push-status.ts).
- `splitIdNumber`, `mergeIdNumber`, `idColumnsFor`, `lostCatName`, `sanitisedUserPatch` (id-documents.ts/account.ts).
- `meetsRequiredVersion` (versions.ts).
- `validateResponses`, `validateOne`, `diffResponses`, `displayResponseValue`, `flattenQuestions`, `isEmptyValue`, `sameValue` (questionnaire.ts).
- `encrypt`/`decrypt`/`decryptOrNull` (crypto.ts).

**Validators / input schemas (zod):** `SignupInput`, `MemberProfile`, `EmergencyContact`, `ComposeAnnouncementInput`, `ReimbursementInput` (+ `SaAccountDetails`/`InternationalAccountDetails` discriminated union), `RecipeSubmission`/`NormalisedRecipe`/`Ingredient`, `VoiceIntent` (discriminated on `intent`), `Questionnaire`/`QuestionnairePage`/`Question` (10-kind discriminated union), `QuestionnaireResponses`/`QuestionnaireResponseValue`, `QuestionnaireFieldChange`.

**Drivers:** `createHttpDb` (default), `createPooledDb` (transactions). `Database` type = HTTP db.

**Screenless / future domains catalogued (table + enum level):** recipes (`recipe_status`, `recipe_source`), documents (no enum), reimbursements (`reimbursement_status`, `reimbursement_account_type`), team_budgets (no enum — assigned vs perceived, ZAR default), tasks (`task_status`), adoptees (no enum), workshops + workshop_rsvps (no enum), inventory_items + inventory_updates (`inventory_update_status`), audit_log (no enum), telegram_chats/invites/announcements (`telegram_chat_kind`, `telegram_invite_status`, `telegram_announcement_status`), mcp_oauth_clients/auth_codes/access_tokens/audit_log (`mcp_client_auth_method`, `mcp_code_challenge_method`, `mcp_audit_outcome`).

**Dead / orphaned / stale flags:**
- `opt_in` questionnaire scope — declared in enum but `openActivation` rejects it (deferred pull model, `TODO(opt_in)`).
- `Rank` zod enum includes `team_lead`, which the DB `rank` pgEnum does NOT — UI ladder, not storable; the schema.ts:454 comment about storing `rank='team_lead'` is stale.
- `*_encrypted` column names + "pgcrypto" comments are historical — actual crypto is Node AES-256-GCM (crypto.ts header explains).
- `notification_channel='in_app'` deliveries are intentionally never drained by the push worker (left `queued` forever).
- `VoiceIntentName`/`VoiceIntent` and `NormalisedRecipe`/`Ingredient` are defined but back screenless voice/recipe-AI domains (no current screen in this unit's scope).
- `documents.version` is an integer counter (NOT the `-vN` string scheme used by questionnaire/required-action versions).

---

# 30 — E2E test-mode seam (/api/test/*)

**Files covered:**
- `apps/web/lib/test-mode.ts` — the single env gate (`isE2ETestMode()`) + the test-auth cookie name constant (`TEST_USER_COOKIE`); `server-only`.
- `apps/web/lib/test-store.ts` — the process-wide in-memory `testStore` singleton hung off `globalThis`; mirrors the Neon tables for users, burner profiles, ID docs, questionnaire edits, invite codes, broadcasts, and deliveries. `server-only`.
- `apps/web/app/api/test/login/route.ts` — POST sets / DELETE clears the synthetic auth cookie that `getAuthenticatedUser()` reads in place of Neon Auth.
- `apps/web/app/api/test/reset/route.ts` — POST wipes the in-memory store and the auth cookie (used in `beforeEach`).
- `apps/web/app/api/test/seed-invite/route.ts` — POST inserts a row into the in-memory `invite_codes` store.
- `apps/web/app/api/test/complete-onboarding/route.ts` — POST marks a test user's burner profile complete (skips the 12-page wizard walk).
- `apps/web/app/api/test/set-rank/route.ts` — POST forces a test user's rank (`captain`/`member`).
- `apps/web/app/api/test/set-approval/route.ts` — POST forces a test user's `approvalStatus` (`pending`/`approved`/`rejected`).
- `apps/web/app/api/test/inspect/route.ts` — GET read-only view into the store (by `authUserId` or `code`).
- `apps/web/tests/e2e/_helpers.ts` — Playwright client wrappers (`login`, `resetTestState`, `completeOnboarding`, `redeemInviteAtGate`, `setRank`, `logoutAll`) that drive the seam.

**Purpose:** Provide a server-only, env-gated bypass of Neon Auth and Neon Postgres so Playwright E2E specs can drive authenticated, gated flows deterministically without a real session or database. The entire seam is dormant unless `process.env.E2E_TEST_MODE === "1"` (set only by `playwright.config.ts`'s `webServer.env`); production never sets it, so the `/api/test/*` routes all 404 and the auth/DB helpers always fall through to the real backends. When active, a `globalThis`-scoped in-memory `testStore` stands in for the user / burner-profile / ID-doc / invite-code / broadcast / delivery tables, and a `camp404_test_user` cookie stands in for a Neon Auth session. The `/api/test/*` routes are thin HTTP shells that mutate or read that store; the store is also consumed in-process by the real app code (auth, users, access-control, notifications, forms, invite-check, feedback, avatar/uploads, push) which branch to a test backend whenever `isE2ETestMode()`.

## Features

### isE2ETestMode + TEST_USER_COOKIE (lib/test-mode.ts)
- `isE2ETestMode(): boolean` returns `process.env.E2E_TEST_MODE === "1"` (test-mode.ts:11-13). The single source of truth for whether any of the seam is live.
- `TEST_USER_COOKIE = "camp404_test_user"` (test-mode.ts:9) — the cookie name read by `getAuthenticatedUser()` (auth.ts:48) and written/deleted by the login + reset routes.
- File is `import "server-only"` (test-mode.ts:1).

### testStore singleton (lib/test-store.ts)
- State lives at `globalThis["__camp404TestStore__"]` (test-store.ts:106), lazily created by `globalState()` (test-store.ts:108-126). Rationale (verbatim comment): Next.js gives RSC renders and route handlers separate module graphs in the same process, so a plain module-level singleton would be duplicated and the two halves of a spec wouldn't see each other's writes; hanging state off `globalThis` keeps every module-graph copy pointed at the same store (test-store.ts:97-105).
- Map/array bindings (`usersByAuthId`, `profilesByUserId`, `idDocsByUserId`, `inviteCodes`, `questionnaireEdits`, `broadcasts`, `deliveries`) are captured once as stable references; `nextSerial` is a primitive so it is read/written through `S` (test-store.ts:128-137).
- IDs: `nextId()` returns `` `test-user-${S.nextSerial++}` `` (test-store.ts:146-148); questionnaire edits get `` `test-edit-${S.nextSerial++}` `` (test-store.ts:289); broadcasts and deliveries get `crypto.randomUUID()` (test-store.ts:363, 426).
- Exposes a fat object of methods grouped: users, burner profile, ID documents, questionnaire edit log, invite codes, announcements & notifications, and `reset()`. (Full method list below under Sub-components.)
- File is `import "server-only"` (test-store.ts:1).

### POST /api/test/login (app/api/test/login/route.ts)
- `runtime = "nodejs"` (line 9). 404s if not in test mode (lines 18-20).
- Parses JSON body `LoginBody { id?, email?, displayName? }`; on parse failure defaults to `{}` (line 21).
- Builds the synthetic user: `` id = body.id ?? `test-stack-${Date.now()}` ``; `primaryEmail = body.email ?? null`; `displayName = body.displayName ?? body.email ?? null` (lines 22-26).
- Sets the `camp404_test_user` cookie to `encodeURIComponent(JSON.stringify(user))` with `httpOnly: true`, `secure: process.env.NODE_ENV === "production"`, `sameSite: "lax"`, `path: "/"`, `maxAge: 60 * 60` (1 hour) (lines 28-35).
- Returns `{ ok: true, user }` (line 36). Note: only sets the auth cookie — does NOT create a `testStore` user row; the row is created lazily on first authenticated gated page load via `ensureCampUser` (users.ts:60-95).

### DELETE /api/test/login (app/api/test/login/route.ts)
- 404s if not in test mode (lines 40-42). Deletes the `camp404_test_user` cookie and returns `{ ok: true }` (lines 43-45). (No store mutation.)

### POST /api/test/reset (app/api/test/reset/route.ts)
- `runtime = "nodejs"` (line 8). 404s if not in test mode (lines 11-13).
- Calls `testStore.reset()` (clears all maps/arrays, resets `nextSerial = 1`) then deletes the `camp404_test_user` cookie; returns `{ ok: true }` (lines 14-17). Intended for `beforeEach` (line 6 comment).

### POST /api/test/seed-invite (app/api/test/seed-invite/route.ts)
- `runtime = "nodejs"` (line 8). 404s if not in test mode (lines 21-23).
- Body `SeedBody { code, createdByUserId?, note?, maxUses?, expiresAt?, assignedRank?, requiresApproval? }` (lines 10-18); parse failure → `{}` (line 24).
- Validation: `code` must be a non-empty string, else 400 `{ error: "code is required" }` (lines 25-30).
- Calls `testStore.seedInviteCode(...)` mapping `createdByUserId ?? null`, `note ?? null`, `maxUses ?? null`, `expiresAt ? new Date(body.expiresAt) : null`, `assignedRank ?? null`, `requiresApproval ?? false` (lines 31-39).
- Does NOT forward `invitedEmail` even though `testStore.seedInviteCode` supports it (see Validation/edge cases).
- Returns `{ ok: true, inviteCode: row }` (the full seeded row) (line 40).

### POST /api/test/complete-onboarding (app/api/test/complete-onboarding/route.ts)
- `runtime = "nodejs"` (line 11). 404s if not in test mode (lines 18-20).
- Body `Body { authUserId? }` (lines 13-15); parse failure → `{}` (line 21).
- Validation: missing `authUserId` → 400 `{ error: "authUserId is required" }` (lines 22-27).
- Looks up the user via `testStore.findUserByAuthId`; missing → 404 ``{ error: `No user for authUserId ${body.authUserId}` }`` (lines 28-34).
- Calls `testStore.upsertProfile({ userId: user.id, version: "e2e-test", responses: {}, markComplete: true })` (lines 35-40). Returns `{ ok: true }` (line 41).
- Shortcuts the 12-page burner-profile wizard (whose page-by-page nav/validation/submission is covered at the component layer `components/__tests__/wizard.test.tsx`) so specs reach the post-onboarding gates (home, `/pending-approval`).

### POST /api/test/set-rank (app/api/test/set-rank/route.ts)
- `runtime = "nodejs"` (line 10). 404s if not in test mode (lines 18-20).
- Body `Body { authUserId?, rank?: "captain" | "member" }` (lines 12-15); parse failure → `{}` (line 21).
- Validation: missing `authUserId` OR `rank` not exactly `"captain"`/`"member"` → 400 `{ error: "authUserId and rank (captain|member) required" }` (lines 22-27).
- User-not-found → 404 ``{ error: `No user for authUserId ${body.authUserId}` }`` (lines 28-34).
- Calls `testStore.setUserRank(user.id, body.rank)` then returns `{ ok: true }` (lines 35-36). Promotes a user to captain to reach captain-only surfaces without minting a captain invite.

### POST /api/test/set-approval (app/api/test/set-approval/route.ts)
- `runtime = "nodejs"` (line 11). 404s if not in test mode (lines 18-20).
- Body `Body { authUserId?, status?: "pending" | "approved" | "rejected" }` (lines 13-16); parse failure → `{}` (line 22).
- Validation: missing `authUserId` OR `status` not exactly `"pending"`/`"approved"`/`"rejected"` → 400 `{ error: "authUserId and status (pending|approved|rejected) required" }` (lines 23-33).
- User-not-found → 404 ``{ error: `No user for authUserId ${body.authUserId}` }`` (lines 34-40).
- Calls `testStore.setUserApprovalStatus(user.id, body.status)` then `{ ok: true }` (lines 41-42). NOTE: uses the bare `setUserApprovalStatus` (no decider stamp), NOT `setUserApproval` — so `approvalDecidedByUserId` / `approvalDecidedAt` stay null. Used to exercise the gate's rejected/approved branches without driving the captain camp-management UI (which reads the real Neon DB and so isn't reachable under E2E_TEST_MODE).

### GET /api/test/inspect (app/api/test/inspect/route.ts)
- `runtime = "nodejs"` (line 9). 404s if not in test mode (lines 12-14).
- Reads query params `authUserId` and `code` (lines 15-17).
- If `authUserId`: looks up the user. Missing → `{ user: null }` (line 21). Found → resolves the invite as `user.inviteCode ? (findUsableInviteCode(user.inviteCode) ?? { code: user.inviteCode, createdByUserId: null }) : null` and returns `{ user, inviteCode: invite }` (lines 19-30).
- Else if `code`: returns `{ inviteCode: testStore.findUsableInviteCode(code) }` (which may be null) (lines 32-36).
- Else: 400 `{ error: "Pass ?authUserId=... or ?code=..." }` (lines 38-41).
- Read-only: lets specs assert on internal state (e.g. did a user's row record the invite code another user issued) without a real DB.

### Playwright client helpers (tests/e2e/_helpers.ts)
- `login(page, user: LoginUser = {})` POSTs `/api/test/login` via `page.request` (shares the browser context cookie jar); throws `` `login failed: ${res.status()}` `` if not ok (lines 32-35). Cookie-jar caveat: must use `page.request`, not the standalone `request` fixture, or navigations won't be authenticated (lines 11-17, 25-31).
- `resetTestState(request)` POSTs `/api/test/reset` (lines 38-42).
- `completeOnboarding(request, authUserId)` POSTs `/api/test/complete-onboarding` with `{ authUserId }`; throws `` `completeOnboarding failed: ${res.status()}` `` (lines 55-65). Requires the user row to already exist (hit a gated page once after login so `ensureCampUser` creates it).
- `redeemInviteAtGate(page, code)` navigates to `/signup/required`, waits for the `Invite code` label, fills the code, clicks the `Enter camp` button (lines 73-81). Drives the real redeem flow (not the seam).
- `setRank(request, authUserId, rank)` POSTs `/api/test/set-rank` with `{ authUserId, rank }`; throws `` `setRank failed: ${res.status()}` `` (lines 89-98).
- `logoutAll(context)` clears all cookies on a browser context (lines 101-103). (No `/api/test/login` DELETE call — clears cookies directly.)
- `LoginUser { id?, email?, displayName? }` interface (lines 19-23).

### In-process consumers that branch on isE2ETestMode (not /api/test/* but part of the contract)
These are the real app code paths the seam relies on; each picks the test backend / store when `isE2ETestMode()`:
- `lib/auth.ts` — `getAuthenticatedUser()` reads `camp404_test_user` first in test mode, bypassing Neon Auth (auth.ts:25-37); `readTestUserCookie()` JSON-decodes the cookie, requires a non-empty string `id`, else null (auth.ts:46-61).
- `lib/users.ts` — `ensureCampUser`, `redeemInviteForUser`, `getBurnerProfile`, `findCampUserByAuthId`, etc. all switch `store = isE2ETestMode() ? testBackend : realBackend` (users.ts:64, 118, 165, 177, ...). `testBackend.isTeamLead()` always returns `false` ("the in-memory store models no team memberships, so nobody is a lead", users.ts:447-450). `seedBurnerProfileAction`/`satisfyBurnerProfileAction`/`getPendingRequiredActions` are no-ops/`[]` under test mode (users.ts:192-217).
- `lib/access-control.ts` — `consumeDbCode` calls `testStore.consumeInviteCode(code)` in test mode (access-control.ts:63-68); env codes (e.g. `TEST-INVITE`) short-circuit before the store.
- `lib/notifications.ts` — full `testBackend` mapping all announcement/inbox methods to `testStore` (notifications.ts:84-119).
- `lib/forms.ts` — `recordQuestionnaireEdit` / `listQuestionnaireEdits` route to `testStore` in test mode (forms.ts:144-158).
- `app/api/tools/invite/check/route.ts` — availability check uses `testStore.findUsableInviteCode(raw)` in test mode (route.ts:57-59).
- `app/feedback/actions.ts` — short-circuits before AI/GitHub, returning `` { ok: true, number: 0, url: `https://github.com/${DEFAULT_REPO}/issues` } `` in test mode (actions.ts:97-100).
- `lib/account.ts` — `isE2ETestMode()` returns `{ lostCatNumber: 0 }` (account.ts:11).
- `lib/push.ts` — push subscribe/notify are no-ops in test mode (push.ts:23, 32).
- `app/api/avatar/route.ts` & `app/api/uploads/avatar/route.ts` — bypass the token/blob path in test mode (avatar route.ts:46; uploads route.ts:72).

## User actions & interactions
This is a server/test-harness seam; "users" are E2E specs (via Playwright `request`/`page.request`) and, transitively, the app code. There is no human-facing UI in this unit.
- Sign in synthetically: `POST /api/test/login` (or `login(page, user)`), optionally specifying `id`/`email`/`displayName`.
- Sign out / clear session: `DELETE /api/test/login` (cookie delete) or `logoutAll(context)` (clear all cookies).
- Reset the world between specs: `POST /api/test/reset` (or `resetTestState(request)`).
- Seed an invite code: `POST /api/test/seed-invite` with at least `{ code }`.
- Fast-forward onboarding: `POST /api/test/complete-onboarding` with `{ authUserId }` (or `completeOnboarding(request, authUserId)`).
- Force a rank: `POST /api/test/set-rank` with `{ authUserId, rank }` (or `setRank(request, authUserId, rank)`).
- Force an approval status: `POST /api/test/set-approval` with `{ authUserId, status }`.
- Inspect store state: `GET /api/test/inspect?authUserId=...` or `?code=...`.
- Redeem an invite through the real gate (not the seam): `redeemInviteAtGate(page, code)` → navigates `/signup/required`, fills `Invite code`, clicks `Enter camp`.
- Implicit/required precondition: after login, hit a gated page (e.g. `/`) once so `ensureCampUser` lazily creates the test-store user row before calling complete-onboarding / set-rank / set-approval (which all 404 on a missing row).

## States & presentations
The seam exposes/forces the GLOBAL-STATES gating rows so specs can reach each downstream screen state; the routes themselves have only request/response states.

Route-level states:
- **Disabled / not-found:** any `/api/test/*` route returns HTTP 404 `{ error: "Not found" }` when `!isE2ETestMode()` (every route). This is the production-safety "off" state.
- **Validation-error:** 400 with a specific message — seed-invite (`code is required`), complete-onboarding (`authUserId is required`), set-rank (`authUserId and rank (captain|member) required`), set-approval (`authUserId and status (pending|approved|rejected) required`), inspect (`Pass ?authUserId=... or ?code=...`).
- **Not-found (entity):** complete-onboarding / set-rank / set-approval return 404 ``No user for authUserId ${...}`` when the row doesn't exist yet.
- **Success:** `{ ok: true }` (+ payload for login/seed-invite/inspect).
- **Empty:** inspect returns `{ user: null }` (unknown authUserId) or `{ inviteCode: null }` (unknown/unusable code). Fresh store after reset is empty.

Gating states this seam SETS UP for downstream screens:
- **Invite-gated** (`hasCampAccess` → `/signup/required`): a logged-in test user with no row / no `inviteCode` is synthetic-only (`id: ""`, users.ts:86-94); seeding+redeeming a code clears the gate.
- **Onboarding-incomplete** (nextGate → `/onboarding/questionnaire`): under test mode `getPendingRequiredActions` returns `[]`, so the gate is driven instead by the legacy `completedAt` fallback — complete-onboarding sets `completedAt` to satisfy it.
- **Pending-approval** (`approval_status='pending'` → `/pending-approval`): `set-approval status=pending`.
- **Rejected** (`approval_status='rejected'`, terminal): `set-approval status=rejected`.
- **Captain-only-locked** (rank below surface → visible-but-locked): `set-rank rank=member`; `set-rank rank=captain` unlocks captain surfaces.

Notes: this unit has NO offline/sync states and NO budget/over-target states (consistent with product scope).

## Enums, options & configurable values
- `TestRank = "captain" | "member"` (test-store.ts:9) — mirrors `rankEnum`/schema.ts:31. set-rank and seed-invite accept exactly these two literals.
- `TestApprovalStatus = "pending" | "approved" | "rejected"` (test-store.ts:10) — mirrors `approval_status` enum (schema.ts:41). set-approval accepts exactly these three literals.
- `TestPresentation = "acknowledge" | "popup" | "feed"` (test-store.ts:59) — mirrors `broadcast_presentation` enum (schema.ts:166-170).
- `TEST_USER_COOKIE = "camp404_test_user"` (test-mode.ts:9).
- `GLOBAL_KEY = "__camp404TestStore__"` (test-store.ts:106).
- Cookie options: `httpOnly: true`, `secure` iff `NODE_ENV === "production"`, `sameSite: "lax"`, `path: "/"`, `maxAge: 60 * 60` seconds (login route.ts:30-34).
- Synthetic auth-user id fallback: `` `test-stack-${Date.now()}` `` (login route.ts:23).
- Generated ids: users `` `test-user-${n}` ``; edits `` `test-edit-${n}` ``; broadcasts/deliveries `crypto.randomUUID()`.
- `nextSerial` starts at `1`, reset to `1` (test-store.ts:122, 566).
- complete-onboarding stamps profile `version: "e2e-test"`, `responses: {}` (route.ts:38-39).
- `listQuestionnaireEdits` default `limit = 20` (test-store.ts:301).
- Defaults applied in `createUser`: `rank ?? "member"`, `approvalStatus ?? "approved"`, `profileImageUrl: null`, decider fields null (test-store.ts:166-174).
- Defaults applied in `seedInviteCode`: `createdByUserId/note/maxUses/expiresAt/assignedRank/invitedEmail ?? null`, `useCount: 0`, `revokedAt: null`, `requiresApproval ?? false` (test-store.ts:323-335).
- Playwright env fixtures (config-level, not this module): `E2E_TEST_MODE: "1"`, `INVITE_CODES: "TEST-INVITE"`, `GOD_EMAILS: "god@example.com"` (playwright.config.ts:52-54). Runner: serial, `workers: 1`, `fullyParallel: false`, `retries` 2 in CI else 0, per-test `timeout: 60_000`, `expect.timeout: 10_000` (playwright.config.ts:16-25).

## Data model touched
In-memory mirrors of the Neon/Drizzle tables (must agree with unit 29). Field names below are the in-store TS field names; the schema column is noted where it differs.

- **TestUser** (mirrors `users`, schema.ts:223-274): `id`, `authUserId`, `displayName` (col `display_name`), `profileImageUrl` (col `profile_image_url`), `inviteCode` (col `invite_code`), `rank` (`rankEnum`), `approvalStatus` (col `approval_status`), `approvalDecidedByUserId` (col `approval_decided_by_user_id`), `approvalDecidedAt` (col `approval_decided_at`), `createdAt`, `updatedAt` (test-store.ts:12-24). Keyed by `authUserId` in `usersByAuthId`.
- **TestBurnerProfile** (mirrors `burner_profiles`): `userId`, `version`, `responses: Record<string, unknown>`, `startedAt`, `completedAt: Date | null`, `updatedAt` (test-store.ts:26-33). Keyed by `userId` in `profilesByUserId`.
- **ID documents** (mirrors `users`' encrypted ID columns; raw here, "no crypto" per test-store.ts:265): `{ idType: string | null; idNumber: string | null }` keyed by `userId` in `idDocsByUserId` (test-store.ts:89, 267-277).
- **TestQuestionnaireEdit** (mirrors questionnaire edit log): `id`, `userId`, `questionnaireKey`, `version`, `editedByUserId: string | null`, `changes: QuestionnaireFieldChange[]` (from `@camp404/types`), `createdAt` (test-store.ts:35-43). Stored in `questionnaireEdits[]`.
- **TestInviteCode** (mirrors `invite_codes`, schema.ts:313-336): `code`, `createdByUserId` (col `created_by_user_id`), `note`, `maxUses` (col `max_uses`), `useCount` (col `use_count`, default 0), `expiresAt` (col `expires_at`), `revokedAt` (col `revoked_at`), `assignedRank` (col `assigned_rank`, `rankEnum`), `invitedEmail` (col `invited_email`, schema.ts:331), `requiresApproval` (col `requires_approval`, default false), `createdAt` (test-store.ts:45-57). Keyed by `code` in `inviteCodes`. (`invited_email` IS a real schema column; the in-store `invitedEmail` is never forwarded by the seed-invite route's `SeedBody`, so it is an orphan through the HTTP seam — see edge cases.)
- **TestBroadcast** (mirrors `broadcasts`, schema.ts:783-795): `id`, `senderId: string | null`, `title`, `body`, `presentation` (`broadcast_presentation`), `publishedAt: Date | null` (col `published_at`; null while draft), `createdAt` (test-store.ts:64-72). Stored in `broadcasts[]`.
- **TestDelivery** (mirrors `notification_deliveries`, schema.ts:844-860): `id`, `broadcastId: string | null`, `userId`, `title`, `body`, `presentation` (self-contained copy), `readAt: Date | null`, `acknowledgedAt: Date | null` (col `acknowledged_at`), `createdAt` (test-store.ts:74-84). Stored in `deliveries[]`.
- **AuthenticatedUser** (auth shape the cookie produces): `{ id, primaryEmail: string | null, displayName: string | null }` (auth.ts:13-17).
- Derivations the test backend hard-codes: team-lead always `false` (`is_lead`, schema.ts:455, never modeled in-store); driver/`intends_to_drive` not modeled at all.

## Validation, edge cases & business rules
- **Production safety:** every `/api/test/*` route's first statement is the `isE2ETestMode()` guard → 404 otherwise; the modules are `server-only`; the comment in test-mode.ts:3-7 explicitly warns never to set the flag in deployed environments.
- **JSON parse tolerance:** all POST bodies use `.catch(() => ({}))`, so malformed/empty bodies fall through to the validation checks rather than throwing.
- **Lazy user creation ordering:** complete-onboarding, set-rank, set-approval all 404 if no test-store row exists yet. The row is only created by `ensureCampUser` (god account → real row; otherwise a synthetic non-persisted `id:""` row) or by `redeemInviteForUser`. So specs must hit a gated page after login before forcing rank/approval/onboarding. `login` alone does NOT create a row.
- **Cookie-jar pitfall:** `login` must use `page.request` (shares the browser context jar); other helpers only mutate the process-wide store (keyed by `authUserId`) so they're fine on the standalone `request` fixture (_helpers.ts:11-17).
- **Cookie validity:** `readTestUserCookie` requires a parseable JSON object with a non-empty string `id`; otherwise returns null (treated as unauthenticated). Defaults `primaryEmail`/`displayName` to null (auth.ts:50-60).
- **set-approval uses the non-stamping setter:** it calls `setUserApprovalStatus` (no decider), unlike `setUserApproval` which records `approvalDecidedByUserId`/`approvalDecidedAt` — so test-forced approvals leave the decider fields null.
- **Invite usability rules** (`findUsableInviteCode`, test-store.ts:339-346): null if not found, if `revokedAt` set, if `expiresAt <= now`, or if `maxUses !== null && useCount >= maxUses`. `consumeInviteCode` re-checks usability then increments `useCount` (test-store.ts:347-352) — atomic at the single-method level (and the runner is single-worker, so no real concurrency).
- **inspect invite fallback:** when a user's `inviteCode` is no longer usable (revoked/expired/used-up), inspect still returns a minimal `{ code, createdByUserId: null }` rather than null, so specs can see the recorded code (route.ts:22-24).
- **`invitedEmail` orphan field:** `TestInviteCode.invitedEmail` and the `seedInviteCode` `invitedEmail` param exist (test-store.ts:54, 320, 332) but the seed-invite route's `SeedBody` does NOT expose `invitedEmail` and never forwards it, so it is always null via the route. Effectively dead through the HTTP seam.
- **reset semantics:** clears all maps, truncates arrays via `.length = 0`, and resets `S.nextSerial = 1` — restoring deterministic ids for the next spec (test-store.ts:558-567). reset route also deletes the auth cookie (but `logoutAll` does not call reset).
- **publishBroadcast recipient rule:** fans out one delivery per user whose `u.id !== senderId` (sender excluded), returns `{ ok: true, recipientCount }`; returns `{ ok: false, error: "Draft not found, already published, or not yours." }` if the draft isn't found / already published / not owned by sender (test-store.ts:404-438). Draft update/delete also require `publishedAt === null` and matching `senderId` (test-store.ts:374-403).
- **Acknowledge rule:** `getPendingAcknowledgements`/`acknowledgeDelivery` only consider deliveries with `presentation === "acknowledge"` and `acknowledgedAt === null`; acknowledging stamps both `acknowledgedAt` and `readAt` (test-store.ts:472-513).
- **upsertProfile:** updates existing row in place (preserving `startedAt`), only sets `completedAt` when `markComplete` (test-store.ts:241-264). complete-onboarding always passes `markComplete: true`.
- **No real side effects in test mode:** AI/GitHub feedback, push notifications, blob/avatar token paths, and `account.lostCatNumber` are all stubbed (see consumers list) — specs exercise auth + validation only.
- **Stale comment / debt:** users.ts:187-191 notes required_actions helpers are real-DB only and that "the legacy `completedAt` fallback still present in the home gate preserves test behaviour until a test-store implementation lands" — confirms the onboarding gate under test mode is `completedAt`-driven, not required_actions-driven.

## Sub-components / variants
Server-only unit — the handlers/validators/store methods:

**Route handlers (all gated on `isE2ETestMode()`, `runtime = "nodejs"`):** `POST/DELETE /api/test/login`, `POST /api/test/reset`, `POST /api/test/seed-invite`, `POST /api/test/complete-onboarding`, `POST /api/test/set-rank`, `POST /api/test/set-approval`, `GET /api/test/inspect`.

**testStore methods (lib/test-store.ts):**
- Users: `findUserByAuthId`, `createUser`, `setUserInviteCode`, `setUserRank`, `setUserApprovalStatus`, `setUserApproval` (stamps decider), `setProfileImage`, `setDisplayName`.
- Burner profile: `getProfile`, `upsertProfile`.
- ID documents (raw, no crypto): `setIdDocuments`, `getIdDocuments`.
- Questionnaire edit log: `recordQuestionnaireEdit`, `listQuestionnaireEdits` (default limit 20, sorted desc by `createdAt`).
- Invite codes: `seedInviteCode`, `findUsableInviteCode`, `consumeInviteCode`.
- Announcements & notifications: `createBroadcastDraft`, `updateBroadcastDraft`, `deleteBroadcastDraft`, `publishBroadcast`, `listBroadcasts` (with `recipientCount`/`acknowledgedCount` rollups), `getPendingAcknowledgements`, `acknowledgeDelivery`, `listInbox`, `countUnread`, `markRead`.
- Lifecycle: `reset`.
- Internal (module-private, not on `testStore`): `globalState`, `findUserById`, `nextId`.

**Playwright helper functions (tests/e2e/_helpers.ts):** `login`, `resetTestState`, `completeOnboarding`, `redeemInviteAtGate`, `setRank`, `logoutAll` (+ `LoginUser` interface).

**Dead / orphaned / unused-through-seam:**
- `testStore.setUserApproval` (decider-stamping) is NOT used by set-approval (which uses the bare `setUserApprovalStatus`); it is reachable via the in-process `redeemInviteForUser`/captain flows' `testBackend.setUserApproval` mapping (users.ts:428-430) but not via any `/api/test/*` route.
- `TestInviteCode.invitedEmail` / `seedInviteCode` `invitedEmail` param: present in the store but never settable through the seed-invite route (always null in practice).
- Many `testStore` methods (broadcasts, deliveries, ID docs, questionnaire edits, `setProfileImage`, `setDisplayName`, `getProfile`, `findUsableInviteCode`) have NO dedicated `/api/test/*` route — they are exercised only through the in-process `testBackend` wrappers (users.ts, notifications.ts, forms.ts, access-control.ts) and read back via `/api/test/inspect` (users/invites only) or in the rendered UI.
- `_helpers.ts` `logoutAll` clears cookies directly and never calls `DELETE /api/test/login`; the DELETE handler is thus only reachable by specs that call it explicitly.
