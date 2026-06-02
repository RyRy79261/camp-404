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
