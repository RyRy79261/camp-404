# Camp 404 redesign spec — adversarial coverage audit

**Status:** Adversarial coverage critique of the redesign spec (`design/spec/`).
**Method:** Hunted for gaps and inconsistencies across all 7 required dimensions — board
coverage (50 boards), feature-set functionality preservation (31 units), component closure,
orphans, typography/token consistency, state completeness, and the named watch-items.
**Inputs checked:** `_analysis/{census.json, surfaces.json, db-impact.json, decisions.md}`,
`.spec-extract/index.md`, `component-library.md`, `design-tokens.md`,
`information-architecture.md`, `flows.md`, all 25 surface briefs, `feature-set/00-30`,
`packages/db/src/schema.ts`.
**Verdict in one line:** the spec is unusually complete — board coverage is 50/50 and every
named watch-item landed — but it carries one real **coverage gap** (the reference-only
feature-set capabilities that have a DB table but no board are never consciously reconciled
in one place) plus a cluster of internal **inconsistencies** where a locked decision (drop
Iteration A; preview-but-locked withholds data, never dims a populated render) is not yet
propagated into every artifact that predates it.

---

## Findings table

Severity: **blocker** = ships wrong/contradicts a LOCKED decision · **gap** = a capability/state/
destination is missing or unreconciled · **polish** = naming/consistency nit.

| # | Severity | Area | Issue | Evidence (file) | Fix |
|---|---|---|---|---|---|
| 1 | **gap** | Functionality preservation | Feature-set §1 names Camp 404's job as tracking "reimbursements / inventory / tasks / meals" and the live schema carries tables/enums for **tasks, reimbursements, recipes, inventory_updates, team_budgets, adoptees, workshops, telegram_chats, dietary_requirements (standalone), driver_profiles (standalone), membership_tier**. NONE of these has a board, and the spec never reconciles them in one place: they appear only incidentally (profile-deletion cascade targets in `08-profile-edit.md`; "Finances/Tasks" FUTURE home tiles; data-model references). There is no single "feature-set unit → covered / FUTURE / out-of-scope" reconciliation, so a reader cannot confirm these capabilities were consciously handled vs silently dropped. | `design/feature-set/00-overview.md` §1, §7; `packages/db/src/schema.ts` (pgEnum `task_status`, `reimbursement_status`, `recipe_status`, `inventory_update_status`, `membership_tier`; pgTable `adoptees`, `workshops`, `team_budgets`, `telegram_chats`); `design/spec/surfaces/08-profile-edit.md:136-147`; `information-architecture.md:464-472` | Add a "Feature-set unit reconciliation" appendix (one row per unit 00–30) marking each **covered-by-brief / mapped-to-FUTURE-stub / explicitly-out-of-scope (reference-only, no board)**. Explicitly classify tasks, reimbursements, recipes, inventory, team_budgets, adoptees, workshops, telegram_chats, membership_tier as reference-only-no-board so the §7 "drop no functionality" contract is consciously satisfied rather than assumed. |
| 2 | **gap** | State completeness / consistency | `16-captain-tools.md` specs the preview-but-locked state as a **`DimmedList` rendering all TOOLS cards at `opacity:0.35`** (a populated-then-dimmed render). LOCKED decision 3 + `flows.md` §3.3 invariant #2 require preview-but-locked to render **structure only, NO data, inert controls** and explicitly call "dimming a populated render … a data leak and non-conformant." The roster brief (14) and the flows grammar follow the no-data rule; captain-tools does not. (Mitigant: the TOOLS list is a static source constant, not server data, so the leak is low-stakes here — but the brief still contradicts the locked grammar and the pattern it teaches is wrong.) | `design/spec/surfaces/16-captain-tools.md:57-67, 96`; `flows.md:135-137, 504-505`; `decisions.md:18-22` | Rewrite the captain-tools locked state to the locked grammar: render the page chrome + a `CaptainLock` panel in place of the card list (no dimmed ghost cards), controls inert, no data. Keep it identical to the roster/announcements locked treatment. |
| 3 | **gap** | Board coverage / consistency | `surfaces.json` still lists **`S17 Captain mgmt` as a `supportingBoard`** ("desktop-wide companion") of the roster surface, and its `forks[]` block frames the roster art-direction as an unresolved human call. Both contradict LOCKED decision 2, which **drops `S17 Captain mgmt` (Iteration A)** and resolves the fork (Iteration B responsive: terminal desktop + mobile). The board still has a home, so this is not a board-orphan — it is a stale analysis artifact that disagrees with a locked decision and with `14-roster.md` / IA (which both say "Iteration A dropped"). | `_analysis/surfaces.json:151-155` (supporting incl. `S17 Captain mgmt`), `:251-296` (forks block); vs `decisions.md:8-16`; `14-roster.md:220`; `information-architecture.md:268, 483` | Reconcile `surfaces.json` to the locked decision: mark `S17 Captain mgmt` as **superseded/dropped** (not supporting), and either remove the roster fork from `forks[]` or annotate it RESOLVED-by-decision-2. Confirm the desktop layout is the terminal-console board, not Iteration A. |
| 4 | **gap** | Token consistency | The required-field marker `*` colour is drawn `$destructive` on the boards but two briefs say "reconcile to `$primary` per live code" — yet `design-tokens.md` §4 (the reconciliation list, items 1–28) has **no entry** assigning a token target for the `*` marker. It is flagged in briefs but never resolved in the token spec, so "status/marker tokens defined before use" is incomplete for this one. | `20-field-renderer.md:19`; `component-library.md:81-82` ("`*` (`$primary` per live code; flagged token choice)"); `design-tokens.md:227-298` (no `*`-marker reconciliation item) | Add a §4 reconciliation line: required-marker `*` → `$primary` (per live code), overriding the boards' `$destructive`; or escalate as an open item in §5 if the colour is genuinely undecided. |
| 5 | **polish** | Component closure / naming | `IconChip` is named as an inline composition / candidate new export in `10-tools-hub.md` and `16-captain-tools.md`; the latter asserts "**No equivalent exists in `@camp404/ui` or the ten canvas reusables**" (16:85). But `component-library.md` defines **`IconBadge`** as the canonical tinted icon container and explicitly folds NavCard's IconChip into it. The briefs and the library use two names for one atom, and the captain-tools claim that no equivalent exists is factually wrong against the library. | `16-captain-tools.md:85`; `10-tools-hub.md:76, 199`; `component-library.md:117-124, 289-295` (`IconBadge` absorbs "NavCard (IconChip)") | Standardise on `IconBadge` (library name); have the two hub briefs reference `IconBadge`/`NavCard` rather than introducing `IconChip`, and delete the "no equivalent exists" claim. |
| 6 | **polish** | Surface-count consistency | `component-library.md:1-9` and `information-architecture.md` refer to "**all 25 per-surface briefs**" and "25 surface briefs," while `surfaces.json` enumerates **26 logical surfaces** and the IA renders 30 route rows. The "25 briefs / 26 surfaces / 30 routes" relationship is explained once (IA §1 reconciliation note) but the "25" vs "26" wording elsewhere reads as a discrepancy on first encounter. | `component-library.md:7`; `information-architecture.md:96`; `surfaces.json:366` ("26 logical surfaces") | Add a one-line gloss wherever "25 briefs" appears: "25 briefs cover 26 logical surfaces (the field-kind renderer + primitive kit fold into shared specs)." Cosmetic, but removes a repeated double-take. |
| 7 | **polish** | Token consistency (open, not yet locked) | `success` / `warning` semantic tokens are used pervasively by Badge/Alert/StatTile/FilterChip/Toast/AvailabilityHint, but their exact OKLCH values are still "proposed … tune for contrast before locking" (open item). They are defined-with-caveat before use (acceptable), but every consumer depends on values that are not finalised, so a contrast miss would ripple widely. | `design-tokens.md:143-150, 330-334` (§5 open items) | Lock the two OKLCH values (contrast-check against `--color-background`) before any Badge/Alert/Toast build starts; until then keep the dependency explicit in the component-library "must land first" note (already present at `component-library.md:601`). |

---

## Dimension-by-dimension results

### 1 — Board coverage: **50/50 homed** ✅
Every board in `_analysis/census.json` (cross-checked against `.spec-extract/index.md`) has a home:
- **10 reusable components** (TopChrome, SectionHeader, DetailHeader, GridTile, Button-Primary,
  Button-Outline, InputField, Card, EmptyState, CaptainLock) → `component-library.md`.
- **29 named page/state/showcase boards** (S01–S27, both Iteration-B rosters) → `surfaces.json`
  as canonical / superseded / supporting.
- **11 OB Step boards (39–49)** → the canonical "OB Step 01–11 series" home for the onboarding
  surface (supersedes S04).
No board is without a classification. **One consistency caveat** (finding #3): `S17 Captain mgmt`
is still tagged "supporting" in `surfaces.json` though decision 2 drops it — it has a home but
the home label contradicts the lock.

### 2 — Functionality preservation: mostly conscious, **one systemic gap** (finding #1)
Confirmed each capability's status:
- **Driver profiles** — referenced (roster data `14-roster.md:150`; runner future-write
  `24-questionnaire-runner.md:132`; `flows.md:110` `nextGate` skips `driver_profile`). No standalone
  surface; reference-only. *Not consciously marked out-of-scope as a capability.*
- **Dietary** — questionnaire page is fully specced (`04-onboarding-wizard.md`); the trio's
  Dietary questionnaire is in `flows.md` §2f. The standalone `dietary_requirements` table is a
  runner-future-write + deletion-cascade only. Mostly covered.
- **Tasks** — FUTURE home tiles (My/Crew/Camp Tasks) in IA §3.2; no surface. Documented FUTURE. ✅
- **Reimbursements / Finances** — FUTURE "Finances" tile (IA §3.2); deletion-scrub target
  (`08-profile-edit.md:147`). Reference-only otherwise; *not reconciled as a capability.*
- **Recipes, inventory, team_budgets, adoptees, workshops, telegram_chats, membership_tier** —
  have schema tables/enums; appear ONLY as deletion-cascade targets or not at all. **Never
  reconciled** → finding #1.
- **MCP** — fully specced (`17-mcp-connect.md`), incl. the 403 branches. ✅
- **Push crons / notifications engine** — specced as far as the visible component reaches
  (`26-enable-push.md` drain cron; `15-announcements.md` fan-out; `09-notifications.md` inbox);
  server infra explicitly scoped to "a separate backend spec." Conscious scoping. ✅
- **Audit log** — `mcp_audit_outcome` enum + approval audit stamps (`approvalDecidedBy/At`) are
  referenced in roster/MCP briefs; no dedicated audit surface (none drawn). Consistent.
- **Adoptees / workshops** — `workshopRsvps` deletion cascade only; never surfaced. → finding #1.

The redesign's headline intents are all preserved and divergence-flagged: quadrant+TALK→S08 home
(voice re-homed, decision 5); per-step onboarding (S04 superseded, hardware gap flagged);
named/multi-use invites (S14, app-layer); roster Iteration B; family-tree rework;
captain-promotion double-opt-in (the one schema change). **Net: 30/31 feature-set units have a
conscious disposition; the cluster of reference-only-no-board capabilities (unit-spanning) is the
one un-reconciled item.**

### 3 — Component closure: ✅ (one naming nit, finding #5)
- Every component referenced in a brief resolves in `component-library.md` (49 canonical
  components from 57 candidates). Spot-checked field-renderer (all 10 kinds → QuestionField/
  FieldInput + atoms), captain-tools, tools-hub, roster, MCP — all resolve.
- Every library component lands on ≥1 surface (IA §3.4 walks the full inventory; verified).
- No duplicate/competing components survive: explicit DROP list (Tabs, DictateButton, terminal
  bespoke read-only panel, ControlPanel quadrant+TALK, Iteration A table, screenshot-attach
  checkbox). Three rows kept deliberately distinct (Roster/Tree/Notification/Reorder).
- **Nit:** `IconChip` (briefs) vs `IconBadge` (library) is one atom under two names → finding #5.

### 4 — Orphans: ✅ (resolved and documented)
- `information-architecture.md` §3.3 proves every route has ≥1 inbound edge; §3.4 proves every
  component lands on a page; §3.1 resolves all 8 `surfaces.json` orphanRisks one-by-one.
- **Voice-home loss is explicitly documented** (decision 5; IA §3.1 row 1; flows §2g) — field-level
  dictation only, no home mic; the §7 "voice reachable" contract satisfied, voice-as-hero
  intentionally retired.
- FUTURE tiles (Camp/Crew Tasks, Finances, Crew Roster/Forms/Announcements, My Teams/Tasks) are
  named documented stubs that render inert ("coming soon"), not dead 404 links.
- Two flagged-not-orphan notes: `/auth/sign-up` asymmetric inbound (intentional); S27 `/complete`
  route path "proposed, TBD" (documented forward stub).

### 5 — Typography / token consistency: ✅ (findings #4, #7)
- `design-tokens.md` covers the full type scale (2 faces, named roles), the dark palette
  (unchanged), the 3 NEW status tokens, the tint-at-alpha convention (no raw hex), overlay/scrim,
  and the radius scale. §4 gives 28 concrete normalise-to instructions reconciling every raw hex
  on the boards (#ff008c2e, #00dcff26, #3fd07a, #e0a800, #f83e5a*, zebra, avatar tints, Google blue).
- **Status tokens defined before use** (success/warning/info in §2.2), with the dependency note in
  the library (must land before Badge/Alert ship). OKLCH values still "to tune" → finding #7.
- **Gap:** required-marker `*` colour flagged in briefs, no reconciliation target in §4 → finding #4.

### 6 — State completeness: ✅
- `flows.md` §3 gives the canonical 13-state grammar (the 7 always-needed + 5 gating + promotion-
  pending) and a surface×state matrix (§3.2) with invariants (§3.3). Preview-but-locked is split
  from the 4 spine-redirect gating states correctly.
- Every relevant surface implements empty/loading/error/submitting/success/disabled where in
  scope; per-brief States sections are exhaustive (e.g. onboarding ports S04's full footer-state
  matrix; MCP enumerates loading/forward/CTA/error/consent/403/approve/deny).
- **One inconsistency** (finding #2): captain-tools renders preview-but-locked as a dimmed
  populated list, contradicting the "render shell, send no data" invariant.

### 7 — Watch-items: **all landed** ✅
| Watch-item | Landed? | Where |
|---|---|---|
| hardware_competency onboarding gap | ✅ flagged, not dropped; 2 reconciliations offered | `04-onboarding-wizard.md:235-238, OQ1`; `decisions.md:39` |
| team_interest 0–6 vs 0–5 | ✅ reconcile-to-0–5 recommended | `04-onboarding-wizard.md:240, OQ2`; `db-impact.json:25-30`; `decisions.md:40` |
| tools-hub "single-use" stale copy | ✅ fixed to "named invite link" | `10-tools-hub.md:66, 185, OQ1`; IA §3.1 row 6 |
| PII email on roster | ✅ flagged as OPEN privacy decision, "do not silently ship" | `14-roster.md:158, 179, OQ1`; `db-impact.json:69` |
| captain-promotion acceptance surface | ✅ decided: Home Captain-group banner + notification mirror | `flows.md:302-334` (resolves roster OQ3); `14-roster.md:236` |
| MCP 403 branches | ✅ pending board-styled; others as errorPage HTML, documented | `17-mcp-connect.md:48`; IA §3.1 row 8 |
| S22/S25 questionnaire-gate single owner | ✅ locked split (S25 routed gate / S22 overlay), "never both" | `23-questionnaire-gate.md:5,18,159`; `25-global-overlays.md:5`; IA §3.1 row 3 |

---

## Coverage scorecard

- **Boards homed:** **50 / 50** (10 components + 29 named surfaces + 11 OB steps). Zero board
  orphans. One stale label (finding #3).
- **Feature-set units reconciled:** **30 / 31** consciously dispositioned (covered, FUTURE-stub, or
  scoped-out). The single shortfall is the absence of a consolidated reconciliation for the
  reference-only-no-board capabilities (tasks/reimbursements/recipes/inventory/team_budgets/
  adoptees/workshops/telegram_chats/membership_tier) — they are not individually surfaced and not
  individually marked out-of-scope (finding #1). Counting that as the one un-reconciled unit.
- **Findings:** **0 blockers · 4 gaps · 3 polish.**

## Verdict

This is a strong, internally-cross-referenced spec: board coverage is total, every named
watch-item is resolved, orphans are systematically closed, and the token/state grammars are
explicit. There are **no blockers** — nothing here ships demonstrably wrong against a locked
decision in a way that breaks the app. The real work is (a) one **coverage gap** — write down,
in one place, that the reference-only feature-set capabilities with a DB table but no board are
consciously out-of-scope-for-this-redesign (finding #1), so the "drop no functionality" contract
is satisfied by intent rather than by omission; and (b) propagating two LOCKED decisions into the
artifacts that predate them — drop Iteration A in `surfaces.json` (finding #3) and bring
captain-tools' locked state onto the no-data preview-but-locked grammar (finding #2). The
remaining items (required-marker token, IconChip/IconBadge naming, 25-vs-26 wording, success/
warning OKLCH lock) are polish that should be cleared before build but block nothing.

---

## Post-audit resolutions (applied 2026-06-02)

All four gaps + two of three polish items were applied directly to the spec after this audit:

- **Finding #1 (gap) — RESOLVED.** Added `feature-set-reconciliation.md`: every feature-set unit
  (00–30) and every schema-backed-but-unboarded capability (tasks, reimbursements, recipes,
  inventory, team_budgets, adoptees, workshops, telegram, membership_tier, standalone driver/dietary)
  now carries an explicit disposition. Scorecard updated to **31/31 reconciled.**
- **Finding #2 (gap) — RESOLVED.** `surfaces/16-captain-tools.md` rewritten: the non-captain state
  now renders chrome + a `CaptainLock` panel **in place of** the tool list (no data, no dimmed ghost
  cards), matching the roster/announcements grammar and `flows.md` §3.3 invariant #2.
- **Finding #3 (gap) — RESOLVED.** `_analysis/surfaces.json` reconciled to decision 2: `S17 Captain
  mgmt` moved from `supportingBoards` to `supersededBoards`; both forks annotated `[RESOLVED — …]`.
- **Finding #4 (gap) — RESOLVED.** `design-tokens.md` §4 item 29 added: required-field marker `*` →
  `$primary` (overriding the boards' `$destructive`).
- **Finding #5 (polish) — RESOLVED.** `IconChip` unified to the library name `IconBadge` across
  `10-tools-hub.md` and `16-captain-tools.md`; the false "no equivalent exists" claim removed.
- **Finding #6 (polish) — RESOLVED.** Surface-count gloss ("25 briefs cover 26 logical surfaces /
  30 routes") added in `README.md`.
- **Finding #7 (polish) — DEFERRED (intentional).** The exact OKLCH values for `success`/`warning`
  remain "tune for contrast before locking" — a genuine pre-build calibration step, tracked in
  `open-questions.md` and `design-tokens.md` §5, not a spec defect.
