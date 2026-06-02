# Spec decisions (locked by user, 2026-06-02)

These override conflicting board/iteration/contract signals for the whole spec.

1. **Output**: spec → `design/spec/`. `design/feature-set/` is **reference-only** (boards are
   the primary source; flag divergences, don't treat the contract as binding).

2. **Roster (`/captains/camp-management`)**: **Iteration B is canonical, responsive.**
   - Desktop = `S17 Roster — Iteration B (terminal console)` (1040px, JetBrains-Mono terminal aesthetic).
   - Mobile = `S17 Roster — Iteration B (mobile)` (430px).
   - **Drop** `S17 Captain mgmt` (the plain Inter wide table, Iteration A) — user deleted it in Pencil;
     the deletion has landed in `app.pen` (now 49 top-level boards; only the two Iteration-B roster
     boards remain). The `design/.spec-extract/` snapshot is frozen at the prior 50-board state for
     provenance (the briefs reference its file paths), and already treats Iteration A as dropped.
   - Unify the desktop terminal board on the shared **`CaptainLock`** (terminal-skinned) instead of its
     bespoke read-only panel.
   - JetBrains Mono is a deliberate **data-console face** for the roster — consistent with the brand's
     existing mono motif (wordmark "404", invite-code slugs, family-tree "via" lines). Codify in type spec.

3. **Rank / captain gating** = **preview-but-locked** (not a hard redirect, not a blocking overlay):
   - Lower ranks **can navigate into** captain/higher surfaces (roster, captain tools, home rank-sections).
   - The surface **renders its structure/chrome** but returns **NO data** and **all controls are inert**.
   - Treatment = `CaptainLock` / "VIEW ONLY · no data for your rank" (same as the home rank-section preview).
   - Replaces the current code's hard redirect on `/captains/*`.

4. **Make-captain flow**: **include** the two-sided double opt-in (captain requests → target accepts in
   their own app before rank flips). Add the **only** schema change in the redesign:
   - new table `captain_promotion_requests` (id, target_user_id, requested_by_user_id, status, created_at, decided_at)
   - new enum `promotion_request_status` = sent | accepted | declined | cancelled
   - Forward, non-breaking migration. **No DB nuke** — confirmed unnecessary.

5. **Voice**: **field-level dictation only.** Voice lives on `long_text` fields + the bug dialog via the
   `DictatePill` → `S21` RecorderPanel. No home-screen mic / no re-homed TALK centre. (Old home push-to-talk
   centre is intentionally gone.)

## Carried build-reconciliations (defaults; not blocking — flag in briefs)

- **Onboarding**: OB Step 01–11 supersedes `S04` (port S04's footer-state matrix onto the per-step pages).
  OB steps map 1:1 to the existing `questionnaire.ts` v8 catalogue → **no schema change**, presentation only.
  - OPEN: catalogue has `hardware_competency` (12 pages) but there is **no OB board for it** (11 steps).
    Treat as a **content question** — does onboarding still capture hardware/building competency? Flag, don't silently drop.
  - `team_interest` drawn 0–6 on OB Step 06 vs catalogue slider 0–5 → reconcile one constant.
- **Home**: `S08 Control panel` canonical; `S07 Home dashboard` superseded. Several home tiles
  (Camp Tasks, Crew Tasks, Finances, Crew Forms, Crew Announcements) point to **undrawn** surfaces →
  spec the tiles but mark destinations "future / not yet designed" (documented, not silent orphans).
- **Invite**: `invite_codes` already supports named/multi-use/note/pre-approve → app-layer only. Fix the
  Tools-hub "single-use" copy (stale) and the S03 gate `CAMP-XXXX-XXXX` placeholder to the slug format.
- **Field renderer**: boards win on drawn affordance (segmented scale, switch toggle) but the underlying
  question **kind** must survive (don't turn a slider into a number field). Reconcile per kind.
- **Tokens**: reconcile drifts to semantic tokens — `$accent` vs amber (tree/announcements), `#ff008c2e`
  RankPill vs `$secondary`, raw hex tints on GridTile; add `success/warning/info` status tokens; radius + type tokens.
- **Questionnaire trio** (S25 gate → S26 runner → S27 complete+queue): the multi-questionnaire sequential
  queue (Safety/Dietary/Agreements) is expressible via the existing `required_actions` engine (no schema
  change); sequential unlock = app logic. Spec as drawn; flag as scope expansion to confirm.
- **PII**: roster detail shows member email in plaintext — privacy decision to raise with data owner.
