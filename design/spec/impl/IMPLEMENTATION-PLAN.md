# Camp 404 redesign — MASTER implementation plan

> **The single entry point for building the `design/spec/` redesign on the live app.**
> Everything here is an *index + a sequence*, not a re-derivation. Per-unit detail lives
> in the plan docs this file orders. Read those for the "how"; read this for the "in what
> order, gating what, in parallel with what".

---

## Overview

**What this is.** A build plan for the Camp 404 redesign — a redesign **on a working,
shipped app**, not greenfield. Every unit is already classified
REUSE / EXTEND / PROMOTE / NEW / DELETE in its plan doc; the job of this file is to merge
the architecture's service-build phases with the spec README's surface-build sequence into
**one master dependency-ordered spine**, and to surface the decisions that gate it.

**The headline.** The redesign is **package-shape-stable**:
- The existing six runtime packages stay (`@camp404/types`, `@camp404/db`, `@camp404/ui`,
  `@camp404/ai-prompts`, `@camp404/telegram`, + dev configs).
- **One new package** — `@camp404/core` (pure, framework-agnostic business logic +
  validation), justified by 7 of 9 domain plans independently asking for it and a real
  non-web consumer (`apps/admin-cli`).
- **One migration** — `0012` (`captain_promotion_requests` table + `promotion_request_status`
  enum). The entire schema delta. Forward, additive, no DB nuke.

Everything else is app-layer / presentation, and most of the service layer is REUSE.

**How `design/spec/impl/` is organised** (the docs this plan sequences):

| Doc / dir | Role |
|---|---|
| `architecture.md` | **Authoritative root.** Package map, layering `types ← {db,core} ← ui ← apps`, the one schema change (migration 0012), the 6-phase service build order, the hybrid-extraction list, the 11 open architectural decisions (8 architectural + 3 elevated). |
| `foundations-tokens.md` | Phase-0 design-system foundations: `@theme` token set, `next/font` wiring, the 29 §4 codemod reconciliations. **Gates everything downstream.** |
| `service-layer/01`–`09` | The 9 service domains (identity/gating, invites, questionnaire, broadcasts, roster+promotion, family-tree, voice, MCP, platform). Overwhelmingly REUSE + EXTRACT-to-`core`. |
| `components/` | 66 component plans (12 atom · 30 molecule · 24 organism), each with `mapsTo` REUSE/PROMOTE/NEW + target package. |
| `app/` | 25 surface plans (01–17, 20–27 — 26 logical surfaces, 30 routes). |
| `coverage-check.md` | The unit registry + coverage scorecard + verdict (0 blockers, 0 gaps, 3 polish). |

**Totals:** 102 plan docs cover 49/49 canonical components, 25/25 routed surfaces, 9/9
service domains, foundations, and architecture (per `coverage-check.md` §4).

---

## Build phases

ONE master dependency-ordered sequence. It **nests the architecture's service phases
(P0–P5) inside the spec README's surface sequence** — service APIs land first, then the
surfaces that consume them are built in gate-spine order. `‖` marks parallelizable items.
The MEMORY green-CI rule governs every box: each change must be independently CI-green;
the biggest single churns land alone.

### The spine at a glance

```text
P0 tokens/fonts ─┬─► P1 scaffold @camp404/core + types deltas
                 │        │
                 │        ├─► P2 db migration 0012 + db EXTENDs  ──┐
                 │        │                                        │
                 │        └─► P3 core extractions (access/clearance first) ─┐
                 │                                                          │
                 ├─► P5 ui leaves (PROMOTE + NEW Toast/Switch) ◄───────────┤ (rides P0 tokens)
                 │        │                                                 │
                 │        └─► P6 ui organisms                               │
                 │                                                         ▼
                 └──────────────────────────► P4 app service APIs ◄────────┘
                                                   │  (promotion, preview-but-locked,
                                                   │   roster stats, S27 queue)
                                                   ▼
                                              P7 surfaces in gate-spine order
                                              (auth/invite/onboarding/approval →
                                               home → tools → captain+assign-captain →
                                               notifications/push → voice → mcp → overlays)
                                              ‖ Landing is standalone, parallelizable throughout
```

---

### Phase 0 — Foundations: tokens + fonts
**Plan:** `foundations-tokens.md`. **No package-graph change.**

- **Lands:** the 3 NEW status tokens (`success`/`warning`/`info`), `--overlay` scrim, the
  named radius scale (`--radius-sm/lg/full` around the existing `--radius` md),
  `--font-*` + `--text-*` size steps in `packages/ui/src/styles/globals.css`; `next/font`
  (Inter + JetBrains Mono) wiring in `apps/web/app/layout.tsx`; the §4 codemods
  (token-spelling group F, status-file groups A/B, radius mapping group H, type strays
  group G; the dark-strip verify is a no-op gate).
- **Files touched:** `packages/ui/src/styles/globals.css`, `apps/web/app/layout.tsx`,
  the 5 status-colour files (roster, family-tree, announcements, pending-approval, invite-form),
  repo-wide verbose-spelling + radius call-sites.
- **Unblocks:** **every component and surface.** Badge/Alert/Toast/StatTile/FilterChip/
  AvailabilityHint need the status tokens; the mono motif needs the font tokens. Hard
  prerequisite for the whole redesign.
- **‖** Group F (token-spelling) is an independent repo-wide codemod; land it early to
  clean the diff surface. Component-build tint rules (groups C/D/E) ride the later
  component PRs (P5/P6), not this phase.

### Phase 1 — Scaffold `@camp404/core` + `@camp404/types` deltas
**Plans:** `architecture.md` §package map / §layering; service-layer 01/05/06.

- **Lands:** `packages/core` stood up empty-but-building (tsconfig/vitest/eslint mirroring
  `@camp404/types`, **depends on `types` only**, export-entry pattern mirroring `db`); the
  `@camp404/types` additions — `StoredRank`/`ApprovalStatus`/`ViewerRank` in `roles.ts`,
  NEW `promotion.ts`, NEW `referral.ts`, `QuestionnaireQueueItem`.
- **Packages touched:** NEW `packages/core`; `packages/types`.
- **Unblocks:** every extraction (P3), the promotion data-access (P2a), and the typed
  return shapes the db EXTENDs need.
- **Acceptance:** `core` builds and resolves from `apps/web` + `apps/admin-cli`; `core`
  has **no** dependency on `db` or `next/*`; the `types` additions compile. Land core
  scaffold first, then move logic into it in P3.

### Phase 2 — `db` deltas (schema + data-access)
**Plans:** `architecture.md` §the one schema change; service-layer 03/05/06.

- **P2a — the migration (its own change):** edit `packages/db/src/schema.ts` (enum + table),
  `db:generate` → `0012_<name>.sql`, **review the generated partial unique index**
  (`WHERE status = 'sent'`), `db:migrate`; add NEW `captain-promotion.ts` data-access +
  `"./captain-promotion"` to `db/package.json` exports.
  - *Unblocks:* the roster two-sided assign-captain flow + the promotion acceptance surface.
- **P2b — db EXTENDs** (`‖` independent of 2a): `roster.ts` add `handle`
  (from `telegramHandle`) to `getCampManagementRoster`; `upsertBurnerProfile` COALESCE
  `completedAt` fix; NEW `listQuestionnaireQueue(userId)`; `relations.ts` re-type to
  `ReferralUser` + **DELETE** dead `getInvitesIssuedBy` / `getRootCodes`.
  - *Unblocks:* roster `@handle`, surface-27 queue, family-tree typing.

### Phase 3 — `core` extractions (pure logic moves, lowest-risk first)
**Plans:** service-layer 01 (lead), 02, 03, 05, 06, 08, 09; `architecture.md` §hybrid-extraction.

Order *within* the phase:
- **3a (the spine — first):** access/clearance — `hasCampAccess`/`isApproved` (bodies,
  app keeps thin shims passing `isGodEmail(email)`), `nextGate` traversal,
  `rankLevel`/`RANK_ORDER`, `deriveViewerRank`, **NEW `requireClearance`** (the heart of
  preview-but-locked, decision D3). Plan 01. Every authed surface inherits this.
- **3b (`‖` after 3a):** invites (02 — also unblocks `admin-cli` reuse); questionnaire
  catalogue + `validateIdNumber` (03 — **largest churn, lands alone**, ~6 import sites);
  family-tree builders **with the cycle guards** (06 — carries the E15 MUST-FIX);
  feedback/initials/image/rate-limit/shake/cron (09); mcp pure helpers + view-models (08).
- **3c:** promotion guards/state machine — `canSendPromotion`/`canDecidePromotion`/
  `nextPromotionStatus`/`promotionStepState` (05). Highest-value test surface.

App-layer shims re-export from `core` so call-sites stay stable. **Move each module's
tests *with* the code**; add the net-new tests the plans call out (invite-words,
id-validation, initials, promotion matrix, cycle-guard regressions).
- **Unblocks:** the service APIs in P4 and the preview-but-locked grammar used by surfaces.

### Phase 4 — App service APIs (new app-layer orchestration over P1–P3)
**Plans:** service-layer 01/05/06/09; `app/` 14/27.

- **Promotion:** `apps/web/lib/promotion.ts` facade (real/test split) +
  `sendCaptainPromotionAction` (roster side) + `accept`/`decline`/`cancel` actions
  (acceptance side; **calls `setUserRank` only on accept**) — plan 05, over migration 0012.
- **Preview-but-locked conversion (plan 01):** `/captains/tools` + `/captains/announcements`
  from hard-redirect → `requireClearance` + shell + `CaptainLock` (data withheld);
  align `camp-management` + `requireCaptain` onto `requireClearance`.
- **Roster derived stats/predicates:** `deriveRosterStats`/`matchesRosterQuery`/`matchesChip`
  in `lib/camp-roster.ts` + `getMemberDetailAction` promotion-step surfacing.
- **Surface-27 queue wrapper:** `getQuestionnaireQueue`.
- **Server hardening (plan 09):** `avatar-blob.ts` orphan cleanup; `RateLimiter` interface
  at call-sites; error-boundary trace chip.
- **Unblocks:** captain surfaces, home rank-section acceptance, notifications, surface 27.

### Phase 5 — NEW reusables + PROMOTEs in `@camp404/ui` (the leaves)
**Plans:** `components/` atoms + molecules (PROMOTE set + NEW). Rides P0 tokens.

- **NEW:** `Toast` + emitter (headline NEW, S4/S9), `Switch` (S4), `Divider`, `DateControl`,
  `QCard`.
- **PROMOTE** into `@camp404/ui`: Badge, IconBadge, ProgressBar, Spinner, Alert,
  AvatarUpload, CaptainLock, CodeDisplay, DetailHeader, DictatePill, EmptyState, GhostBack,
  GridTile, InputField, NavCard, OAuthButton, OptionCardGroup, SectionHeader,
  SegmentedControl, TopChrome.
- **‖** with P4 once token + shim shapes are fixed.
- **Unblocks:** the presentation redesign of every surface + the `popup` delivery rendering.

### Phase 6 — UI organisms + app-local NEW composites
**Plans:** `components/` organisms.

- App-local NEW (cannot live in `@camp404/ui` — `"use client"`/`next/*`/domain-bound):
  AssignCaptainDialog (inserts into `captain_promotion_requests`), BlockingTopBar,
  CustomizeMode (+ subs; client-side persistence only — D4/D37, **no new table**),
  FamilyTree (consumes core tree-build cycle guards), MemberProfile, NotificationRow,
  QuestionnaireBlock, RankGroupCard, RejectConfirmDialog, RosterRow, RosterToolbar,
  AvailabilityHint, CompletionHero, FilterChip, QueueCard, StatTile, Stepper.
- REUSE/EXTEND organisms: AcknowledgementGate, AnnouncementsManager, AuthShell, EnablePush,
  ErrorBoundary, InviteForm, LandingHero, LongTextField, MCPConsent, QuestionField,
  QuestionnaireWizard, ReportBugDialog, SignIn/SignUpForm.
- **Unblocks:** every surface in P7 has its organisms ready.

### Phase 7 — Surfaces, in gate-spine order
**Plans:** `app/` 01–17, 20–27. Maps the README's Phase 2–9 surface order onto the service
APIs now landed. Build in spine order so the preview-but-locked + gating grammar is reusable
downstream:

1. **Auth / invite / onboarding / approval (the gating backbone):**
   `02-auth` → `03-invite-gate` → `23-questionnaire-gate` + `20-field-renderer` →
   `04-onboarding-wizard` / `24-questionnaire-runner` → `05-approval-gate`.
   Lands the preview-but-locked / `CaptainLock` grammar (D3) for reuse.
2. **Home:** `06-home` (rank-group launcher, GridTiles, Customize mode; **REPLACE** render +
   **DELETE** quadrant; FUTURE tiles render inert). Also the **promotion acceptance surface**
   (home rank-section, D3).
3. **Member tools (`‖`):** `10-tools-hub` → (`11-invite-tool` ‖ `12-my-forms` ‖ `13-family-tree`).
4. **Captain surfaces + assign-captain:** `16-captain-tools` → `14-roster` (consumes
   migration 0012 + the assign-captain flow + roster stats) → `15-announcements`.
5. **Notifications & push:** `09-notifications` + `26-enable-push` + the `25-global-overlays`
   delivery overlays (AckTakeover, QuestionnaireBlock, Toast).
6. **Voice:** `21-voice` (RecorderPanel) wired to `DictatePill` on every `long_text` host +
   the bug dialog. Field-level only (D5). `‖` partially with steps 4/5 once DictatePill shape
   is fixed (P5).
7. **MCP:** `17-mcp-connect` (bridge + consent + 403 branches). `‖` with steps 2–6 once auth
   (step 1) exists.
8. **Global overlays + boundaries (remainder):** rest of `25-global-overlays` — ShakeReporter →
   ReportBugDialog, ErrorBoundary / global-error / not-found.

- **‖ throughout:** `01-landing` is standalone — touches no spine, parallelizable at any
  point after P0.

---

## Definition of done

**Per phase, every change must satisfy the project CI gates** (MEMORY: **green-CI-is-done**
— each change is independently CI-green; **do not strand post-green follow-ups**; the user
merges on green):

- **All phases:** `pnpm build` (web + ui + affected packages) green; lint green; typecheck
  green; unit tests green (extracted modules carry their tests *with* the code in P3).
- **P0:** the `foundations-tokens.md` §7 acceptance greps pass (0 status-palette utilities,
  0 `dark:` variants, 0 verbose `[color:var(--color-*)]`, 0 inline `text-[Npx]`, no stray
  `rounded-xl`/`rounded-lg`); app renders in Inter + JetBrains Mono; status/overlay tokens
  legible against `--color-background`.
- **P1:** `core` builds + resolves from `apps/web`/`apps/admin-cli`; **import-graph review
  confirms `core` imports only `types`** (never `db`/`next/*`/React/`server-only`).
- **P2:** migration `0012` runs forward on a real DB; generated partial unique index
  preserved; god accounts / lineage / audit history intact; `db` still imports only `types`.
- **P3:** every shim keeps call-sites stable; new test suites land green (promotion matrix,
  cycle-guard regression, invite-words, id-validation, initials).
- **P4–P6:** services + components green per their plans; layering rules hold
  (`ui` never imports `db`/`next/*`).
- **P7:** **E2E green for the gate spine** (auth → invite → onboarding → approval → home, and
  the captain assign-captain double-opt-in handshake); **visual parity with the Pencil boards**
  per each surface brief.

---

## Unit registry

The full unit registry — every Service / Component / Surface unit, its plan file,
REUSE/EXTEND/PROMOTE/NEW/DELETE status, target package, and key deps — **lives in
[`coverage-check.md`](coverage-check.md)** (§1a services, §1b 66 components, §1c 25 surfaces),
together with the coverage scorecard (§2), the gap/inconsistency list (§3), and the verdict
(§4: 0 blockers · 0 gaps · 3 polish). **Not duplicated here** — that file is the registry.

---

## Open decisions to confirm before/within build

Consolidates the architecture's 8 architectural decisions with the highest-severity items
from `open-questions.md`. **Owner** = who decides; **Gates** = the earliest phase that
cannot ship correctly until it is resolved.

| # | Decision | Owner | Gates |
|---|---|---|---|
| OD1 | **Create `packages/core`?** ✅ **CONFIRMED YES** (user, 2026-06-02) — everything downstream assumes it. (Rejected fallback: fold pure logic into `packages/types`, muddies the type layer.) | lead architect | **P1** (whole spine) |
| OD2 | **Relocate already-pure `db` cores** (`audience`/`push-status`/`planPushDrain`) to `core`? Behaviour-neutral; move-all for a clean "pure logic lives in core" invariant vs leave to avoid import churn. | lead architect | P3 (optional; not blocking) |
| OD3 | **FK delete on `captain_promotion_requests.requested_by_user_id`** — `cascade` (default) vs `set null` + nullable (audit retention). | data owner | **P2a** (migration shape) |
| OD4 | **PII: plaintext member email on roster detail** (C1). ⛔ Do **not** ship plaintext without a recorded mitigation (redact / reveal-gate / accept). Rest of roster ships without it. | data owner | P7 step 4 (that field only) |
| OD5 | **Questionnaire content reconciliations** (A1 hardware-competency keep/merge/drop 12-vs-11 pages; B1 `team_interest` 0–5 vs 0–6 one constant; A9 copy edits). Must be locked **before** editing the catalogue. | product | **P3b** (catalogue move) |
| OD6 | **MCP decision pass** (D47/D48/C3/C4/E22): style-vs-raw the 3 extra 403 branches; distinct `rejected` message; `redactIdDocuments` wire-vs-delete; 4 capability predicates keep-vs-delete; in-app `aiDataConsent` toggle placement; footnote destination. | product + lead architect | P7 step 7 (MCP) |
| OD7 | **Questionnaire-trio scope** (A2/A3/A4) — S25→S26→S27 sequential Safety/Dietary/Agreements queue; product confirmation, **not schema** (rides existing `required_actions`). | product | P7 step 1 / step 5 (S27 + multi-queue) |
| OD8 | **Status-token OKLCH values** (B2) — contrast-check `success`/`warning` against `--color-background`, lock `--overlay` alpha. | design | **P0** (before any Badge/Alert/Toast) |
| OD9 | **Family-tree cycle guard** (E15) — `visited` Set on the `matchIds` ancestor walk + harden `buildTree`. **MUST-FIX before shipping — not optional** (CodeRabbit-elevated). | eng | **P3b** (family-tree extraction) |
| OD10 | **`completedAt` overwrite on replay** (D16) — preserve original (set only when null) or update the contradicting `lib/forms.ts` comment. Data-integrity, **resolve before build** (CodeRabbit-elevated). | eng | **P2b** (`upsertBurnerProfile` COALESCE) |
| OD11 | **Customize-mode persistence** (D37) — localStorage / cookie / defer. **No new table allowed** (decision 4 caps schema to migration 0012). | eng | P6 / P7 step 2 (CustomizeMode) |

Lower-severity items (the rest of `open-questions.md`'s 50 med / 74 low) are decide-before-ship
polish; work the list per-surface as each phase lands. The five spec-internal items B3/B4/D1/D2/E33
are already RESOLVED (✅ in `open-questions.md`).

---

## Risks & sequencing notes

- **Biggest churn — the questionnaire catalogue move (P3b).** `QUESTIONNAIRE` v8 +
  `TEAMS`/`DIETARY`/`COUNTRY` move from `apps/web/lib` to `@camp404/core`, touching ~6
  import sites — the single largest mechanical change. **Land it alone**, gated on the
  content reconciliations (OD5) being locked first, so the import-path move and the content
  edits don't tangle in one red-able diff.
- **The migration is its own change (P2a).** Generate, **review the partial unique index by
  hand** (`WHERE status = 'sent'` can be dropped by drizzle-kit generation), migrate, then
  add the export — as one isolated, independently-green change. It is the gate for the roster
  two-sided assign-captain flow; nothing in P7 step 4 (assign-captain) can land before it.
- **`core ↔ db` cycle is forbidden both directions.** Enforce by import-graph review at P1
  acceptance and every P3 extraction: `core` imports only `types`; `db` imports only `types`;
  they are siblings, never importing each other. This is the property that keeps `core`
  testable without a DB and reusable by `admin-cli`/`mobile`.
- **Token foundations are a hard global prerequisite (P0).** A single component plan built in
  isolation before P0 lands (e.g. Badge needing `success`/`warning`) will strand on red CI.
  The phase order prevents this; do not start P5/P6 component PRs before P0 is merged.
- **No-strand-post-green (MEMORY).** Each extraction/move/surface is an independently
  CI-green change. Do not chase non-blocking flaky markers; do not leave follow-up commits
  after a green merge — fold the fix into the change that needs it, or it strands.
- **CodeRabbit-elevated must-fixes ride their owning phase, not after:** the family-tree
  cycle guard (OD9) lands *inside* the P3b family-tree extraction; the `completedAt`
  preservation (OD10) lands *inside* the P2b `upsertBurnerProfile` EXTEND — neither is a
  post-green follow-up.
- **PII gate is field-scoped, not phase-blocking (OD4).** The roster ships in P7 step 4
  without the plaintext-email field; that one field waits on the data owner's recorded
  mitigation. Don't let it block the rest of the roster.
