# Camp 404 — redesign spec

**The entry point.** This folder (`design/spec/`) is the canonical functional specification for
the Camp 404 redesign. Start here, then read in the order below.

---

## Vision & north-star

Camp 404 is the single operational command centre for one ~30–80-person Afrikaburn theme camp:
invite-only, dark-only, mobile-first (430px). It onboards members behind an invite gate, captures
their long-lived burner profile, routes captain announcements, and lets captains vet and manage the
roster — all from a phone in a desert with patchy signal. Ranks are `captain | member`; team-lead
and driver are **derived at read time**, not stored.

> **North-star:** *Camp 404 is a calm command centre for a chaotic desert: every screen must let a
> tired, sunburnt, one-handed phone user answer "what do I need to do, and who needs what from me?"
> in seconds, complete that action in a tap or two or by holding the mic and talking, and never
> strand them behind a gate with nowhere to go.*

Two invariants flow from it everywhere in this spec:
- **The gate always has an exit.** Every blocking state names where the user goes next or how to
  escape (sign out). `nextGate` never routes to a gate with no page.
- **Rank is clearance, not a wall.** Layers above the viewer's rank stay *visible but locked*
  (preview-but-locked / `CaptainLock`), not bounced.

---

## What this spec is, and how it was built

This is a **board-derived** functional spec. The primary source is the Pencil design canvas
(`app.pen`, extracted to `design/.spec-extract/boards/`); `design/feature-set/` (00–30) is the
code-grounded contract kept **reference-only** — it documents the live code, but where the boards
diverge, the boards win and the divergence is flagged, not silently obeyed.

It was assembled by triaging a 50-board census (`_analysis/census.json`), collapsing it to 26
logical surfaces (`_analysis/surfaces.json`), reconciling every redesign intent against the live
schema (`_analysis/db-impact.json`), and resolving the two genuine human forks (roster
art-direction; non-captain gating) plus a short list of build-time reconciliations into **five
LOCKED decisions** (`_analysis/decisions.md`). Those decisions override any conflicting
board/iteration/contract signal for the whole spec.

> **Surface count gloss:** 25 per-surface briefs cover 26 logical surfaces (the field-kind renderer
> and primitive kit fold into shared specs), rendered across 30 route rows + cross-cutting mounts.
> "25 briefs / 26 surfaces / 30 routes" all describe the same set at different granularities.

---

## Reading order & index

Read in this order:

1. **`information-architecture.md`** — the canonical route/page map, gate levels, the navigation
   model, the gating spine, and the zero-orphan proof (every route has an inbound edge; every
   component lands on a page; every undrawn destination is a named FUTURE stub).
2. **`flows.md`** — the cross-surface glue: the gating spine, the cross-screen journeys, and the
   canonical 13-state grammar (the 7 always-needed states + 5 gating states + promotion-pending)
   every surface implements.
3. **`component-library.md`** — ONE deduped component library (atoms → molecules → organisms) folded
   onto `@camp404/ui`, with `mapsTo` (reuse / PROMOTE / NEW) per component and the "must land first"
   ordering.
4. **`design-tokens.md`** — the type scale (Inter + JetBrains Mono as the data-console face), the
   dark palette, the 3 NEW semantic status tokens (success/warning/info), the tint-at-alpha
   convention, radius scale, and §4's 28 concrete normalise-to instructions.
5. **`coverage-audit.md`** — the adversarial coverage critique + scorecard + verdict (summarised
   below).
6. **`open-questions.md`** — the consolidated punch-list: every per-brief open item + every audit
   finding, deduped, grouped by theme, each marked owner + severity. **Work through this before
   build.**
7. **`feature-set-reconciliation.md`** — every feature-set unit (00–30) + every schema-backed
   capability with no board, given a conscious disposition (covered / transformed / partial /
   out-of-scope / FUTURE). Proves the "drop no functionality" contract is satisfied by intent.
8. **The 25 surface briefs** (`surfaces/*.md`) — per-surface functional detail (table below).
9. **`_analysis/`** — the provenance: `census.json` (50-board triage), `surfaces.json` (26 surfaces
   + orphanRisks + componentInventory), `db-impact.json` (schema delta), `decisions.md` (the LOCKED
   decisions, full text).

### Surface briefs

26 logical surfaces over 25 briefs. Complexity is a build-effort estimate (S = small, M = medium,
L = large, XL = extra-large). Cross-cutting surfaces (no own route) are marked `n/a`.

| # | Surface | Route | Brief | Complexity |
|---|---|---|---|---|
| 01 | Landing (glitch 404 splash) | `/` (unauth) | [`surfaces/01-landing.md`](surfaces/01-landing.md) | M |
| 02 | Auth (sign-in / sign-up) | `/auth/sign-in`, `/auth/sign-up`, `/auth`, `/auth/[path]` | [`surfaces/02-auth.md`](surfaces/02-auth.md) | L |
| 03 | Invite gate (redeem code) | `/signup/required` | [`surfaces/03-invite-gate.md`](surfaces/03-invite-gate.md) | M |
| 04 | Onboarding wizard | `/onboarding/questionnaire` | [`surfaces/04-onboarding-wizard.md`](surfaces/04-onboarding-wizard.md) | XL |
| 05 | Approval gate (pending / rejected) | `/pending-approval` | [`surfaces/05-approval-gate.md`](surfaces/05-approval-gate.md) | S |
| 06 | Home (control panel) | `/` (authed) | [`surfaces/06-home.md`](surfaces/06-home.md) | XL |
| 07 | Profile view | `/profile` | [`surfaces/07-profile-view.md`](surfaces/07-profile-view.md) | S |
| 08 | Profile edit + delete account | `/profile/edit` | [`surfaces/08-profile-edit.md`](surfaces/08-profile-edit.md) | L |
| 09 | Notifications inbox | `/notifications` | [`surfaces/09-notifications.md`](surfaces/09-notifications.md) | M |
| 10 | Tools hub | `/tools` | [`surfaces/10-tools-hub.md`](surfaces/10-tools-hub.md) | S |
| 11 | Invite tool (mint codes) | `/tools/invite` | [`surfaces/11-invite-tool.md`](surfaces/11-invite-tool.md) | L |
| 12 | My forms (list + replay) | `/tools/forms`, `/tools/forms/[key]` | [`surfaces/12-my-forms.md`](surfaces/12-my-forms.md) | M |
| 13 | Family tree (referral graph) | `/family-tree` | [`surfaces/13-family-tree.md`](surfaces/13-family-tree.md) | L |
| 14 | Captain roster & member detail | `/captains/camp-management` | [`surfaces/14-roster.md`](surfaces/14-roster.md) | XL |
| 15 | Captain announcements (composer) | `/captains/announcements` | [`surfaces/15-announcements.md`](surfaces/15-announcements.md) | L |
| 16 | Captain tools hub | `/captains/tools` | [`surfaces/16-captain-tools.md`](surfaces/16-captain-tools.md) | S |
| 17 | MCP connect / consent | `/mcp/connect`, `GET/POST /api/mcp/oauth/authorize` | [`surfaces/17-mcp-connect.md`](surfaces/17-mcp-connect.md) | L |
| 20 | Field-kind renderer (10 kinds) | n/a (shared component sheet) | [`surfaces/20-field-renderer.md`](surfaces/20-field-renderer.md) | XL |
| 21 | Voice dictation (RecorderPanel) | n/a (embedded panel) | [`surfaces/21-voice.md`](surfaces/21-voice.md) | L |
| 22 | Avatar upload (shared component) | n/a (embedded sub-component) | [`surfaces/22-avatar-upload.md`](surfaces/22-avatar-upload.md) | M |
| 23 | Questionnaire gate (interstitial) | `/onboarding/questionnaire` (intro) | [`surfaces/23-questionnaire-gate.md`](surfaces/23-questionnaire-gate.md) | M |
| 24 | Questionnaire runner (blocking) | `/onboarding/questionnaire` (required variant) | [`surfaces/24-questionnaire-runner.md`](surfaces/24-questionnaire-runner.md) | L |
| 25 | Global overlays (app-wide) | n/a (mounted app-wide) | [`surfaces/25-global-overlays.md`](surfaces/25-global-overlays.md) | L |
| 26 | Enable push (opt-in component) | n/a (mounted on authed home) | [`surfaces/26-enable-push.md`](surfaces/26-enable-push.md) | M |
| 27 | Questionnaire complete & queue | `/onboarding/questionnaire/complete` (proposed) | [`surfaces/27-questionnaire-complete.md`](surfaces/27-questionnaire-complete.md) | M |

> Brief numbers 18–19 do not exist: Iteration A roster (S17 Captain mgmt) was DROPPED (decision 2)
> and the captain-tools hub folded into brief 16. The field-kind renderer (20) and primitive kit
> (S24, → `design-tokens.md`) are the two surfaces that fold into shared specs rather than getting a
> standalone routed brief.

---

## The five LOCKED decisions

Full text: [`_analysis/decisions.md`](_analysis/decisions.md). These override conflicting
board/iteration/contract signals everywhere.

1. **Output location.** Spec → `design/spec/`. `design/feature-set/` is **reference-only** (boards
   are primary; flag divergences, don't treat the contract as binding).
2. **Roster = Iteration B responsive.** `/captains/camp-management` is one responsive route:
   terminal-console desktop (1040px, JetBrains-Mono) + 430px mobile. **Iteration A (S17 Captain
   mgmt, plain Inter table) is DROPPED.** Unify the desktop board on the shared `CaptainLock`.
   JetBrains Mono is the deliberate **data-console face**.
3. **Rank/captain gating = preview-but-locked.** Lower ranks can *navigate into* captain/higher
   surfaces; the surface **renders its chrome but returns NO data and all controls are inert**
   (`CaptainLock` "VIEW ONLY · no data for your rank"). Not a redirect, not a blocking overlay —
   replaces the live hard redirect on `/captains/*`.
4. **Make-captain = two-sided double opt-in.** Captain sends a request → target accepts in their
   own app before rank flips. The **only** schema change: new table `captain_promotion_requests`
   + new enum `promotion_request_status` (sent | accepted | declined | cancelled). Forward,
   non-breaking. **No DB nuke.**
5. **Voice = field-level dictation only.** Voice lives on `long_text` fields + the bug dialog via
   `DictatePill → RecorderPanel` (S21). No home mic, no TALK centre, no `/dictate` route. The old
   home push-to-talk centre is intentionally gone.

### DB-impact headline

Full delta: [`_analysis/db-impact.json`](_analysis/db-impact.json).

> **No DB nuke. ONE additive table — `captain_promotion_requests` (+ `promotion_request_status`
> enum) — is the entire schema change. Everything else is app-layer.**

The two headline redesign intents need **zero** schema changes: named/multi-use/pre-approve invites
are already fully modelled on `invite_codes` (free-slug `code` PK, `note`, `max_uses` + `use_count`
atomic consume, `requires_approval`, `assigned_rank`), and the OB Step 01–11 onboarding boards map
1:1 onto the existing `questionnaire.ts` v8 catalogue persisting to `burner_profiles.responses`
(jsonb). Roster status pills are the existing `approval_status` enum with one label rename
(`approved` → "Accepted"). Watch-items that are config/app concerns, **not** migrations:
`team_interest` 0–6 vs 0–5 (fix one constant), the S27 "locked" queue-item state (app logic over
`required_actions`), the roster `@handle` (reuse `telegram_handle` or derive), the 7-day invite
expiry (set at mint via the existing `expires_at`).

---

## Coverage summary

Full audit + findings table: [`coverage-audit.md`](coverage-audit.md).

**Scorecard:**
- **Boards homed:** **50 / 50** (10 components + 29 named surfaces + 11 OB steps). Zero board
  orphans.
- **Feature-set units reconciled:** **31 / 31** consciously dispositioned (covered / transformed /
  partial / out-of-scope / FUTURE) — now consolidated in
  [`feature-set-reconciliation.md`](feature-set-reconciliation.md) (resolves audit finding #1). The
  reference-only-no-board capabilities (tasks, reimbursements, recipes, inventory, team_budgets,
  adoptees, workshops, telegram, membership_tier) are listed there as consciously deferred, not
  silently dropped.
- **Findings (all applied post-audit):** 0 blockers · 4 gaps · 3 polish — see "Post-audit
  resolutions" at the end of [`coverage-audit.md`](coverage-audit.md).

**Verdict:** a strong, internally cross-referenced spec — total board coverage, every watch-item
resolved, orphans systematically closed, explicit token/state grammars. **No blockers, and the 4
gaps + naming polish have been applied:** the feature-set reconciliation appendix was added; the
Iteration-A drop was propagated into `surfaces.json`; captain-tools' locked state was moved onto the
no-data preview-but-locked grammar; the required-marker token was resolved (`design-tokens.md` §4
item 29); and `IconChip`→`IconBadge` was unified. The only deliberately-open token item is tuning
the `success`/`warning` OKLCH values for contrast before build. See
[`open-questions.md`](open-questions.md) for the full product/eng punch-list.

---

## Recommended build sequence

Phased by dependency. Phases are ordered; **items within `‖`-marked groups are parallelizable.**
Everything downstream of Phase 1–2 depends on tokens + the promoted component library landing first,
so those two phases gate the rest.

**Phase 0 — Foundation: tokens + status tokens.**
Lock the OKLCH values for the 3 NEW semantic status tokens (`success` / `warning` / `info`) against
`--color-background` (audit finding #7), resolve the required-marker `*` colour (finding #4), apply
`design-tokens.md` §4's 28 normalise-to instructions. Everything that follows depends on these.

**Phase 1 — Promote the `@camp404/ui` component library.**
Lift the shared primitives out of per-screen reinvention into `@camp404/ui`: `Badge` /
`SegmentedControl` / `IconBadge` / `Alert` / `NavCard` / `CaptainLock` / `Avatar` / `RankPill` /
`ProgressBar` / `EmptyState` / `Stepper` / `CodeField` / `AvailabilityHint` / `SuccessHero` /
`Toast`. Standardise the `IconChip` → `IconBadge` name (finding #5). Status tokens (Phase 0) must
land before Badge/Alert/Toast. This is the widest-fan-out dependency in the spec.

**Phase 2 — Gating spine + auth/invite/onboarding.**
The backbone every authed route inherits. Build in spine order:
`02-auth` → `03-invite-gate` → `23-questionnaire-gate` + `20-field-renderer` (the shared field
machine) → `04-onboarding-wizard` / `24-questionnaire-runner` → `05-approval-gate`. Land the
preview-but-locked / `CaptainLock` grammar here (decision 3) so it's reusable downstream.
`01-landing` is parallelizable (`‖`) — it's standalone and touches no spine.

**Phase 3 — Home.**
`06-home` (control panel: rank-group launcher, GridTiles, Customize mode with client-side
persistence only — no new table). Depends on the spine (Phase 2) and the component library
(Phase 1). FUTURE tiles render inert ("coming soon"), never dead links.

**Phase 4 — Member tools.**  `‖` parallelizable across the three:
`10-tools-hub` → ( `11-invite-tool` ‖ `12-my-forms` ‖ `13-family-tree` ). Forms-replay reuses the
Phase-2 field machine; invite-tool is 100% app-layer over the existing `invite_codes` columns.

**Phase 5 — Captain surfaces.**
`16-captain-tools` (hub) → `14-roster` **+ the `captain_promotion_requests` migration** (the one
schema change, decision 4) → `15-announcements`. The migration is the gate for the roster's
two-sided assign-captain flow; the announcement composer's `long_text` body reuses the voice
dictation pill (Phase 7). Captain surfaces inherit preview-but-locked from Phase 2.

**Phase 6 — Notifications & push.**
`09-notifications` (inbox) + `26-enable-push` (opt-in) + the `25-global-overlays` delivery overlays
(`AckTakeover`, `QuestionnaireBlock`, `Toast`). Depends on the announcements fan-out (Phase 5) for
real deliveries to render.

**Phase 7 — Voice.**
`21-voice` (RecorderPanel) wired to the `DictatePill` on every `long_text` field (onboarding steps
03/04, runner, announcements composer body) + the bug dialog. Field-level only (decision 5).
Partially parallelizable with Phase 5/6 once the `DictatePill` shape is fixed in Phase 1.

**Phase 8 — MCP.**
`17-mcp-connect` (bridge + consent + 403 branches). Largely independent of the in-app nav (its own
OAuth gate chain), so it is parallelizable (`‖`) with Phases 3–7 once auth (Phase 2) exists.

**Phase 9 — Global overlays + boundaries (remainder).**
The rest of `25-global-overlays`: `ShakeReporter` → `ReportBugDialog`, `ErrorBoundary` /
`global-error` / `not-found`. Mounted app-wide; depends on the bug-dialog voice path (Phase 7) and
toast infra (Phase 6).

**Cross-phase / confirm-first:** the questionnaire trio scope expansion (S25 → S26 → S27
Safety/Dietary/Agreements sequential queue) is a **product confirmation**, not a schema change —
resolve it (see `open-questions.md`) before building `27-questionnaire-complete` and the multi-queue
behaviour in Phases 2/6.
