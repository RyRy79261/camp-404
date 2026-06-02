# Feature-set unit reconciliation

Resolves coverage-audit finding #1. The redesign is **board-derived**: it specs what the
Pencil canvas draws. `design/feature-set/` (00–30) documents the *live code*, which carries
several capabilities that have a DB table/enum but **no board**. This appendix gives every
feature-set unit — and every un-drawn schema-backed capability — a **conscious disposition**, so
the §7 "drop no functionality" contract is satisfied by intent rather than by omission.

**Disposition legend**
- **Covered** — a redesign brief (or the library/tokens/flows docs) specs it.
- **Transformed** — preserved but reshaped by a locked decision (the change *is* the redesign).
- **Partial (UI covered / backend out)** — the user-facing surface is specced; server-only
  infrastructure (crons, delivery) is deferred to a separate backend spec.
- **Out-of-scope (reference-only, no board)** — a live capability with no board; **not** part of
  this redesign. Not dropped from the product — just not (re)designed here.
- **FUTURE stub** — out-of-scope, but a redesign surface *links to* it; it renders an inert
  "coming soon" tile, not a dead link (see `information-architecture.md` §3).

---

## A. The 31 feature-set units (00–30)

| Unit | Disposition | Home in this spec |
|---|---|---|
| 00 Overview / cross-cutting | Meta | Superseded by `README.md` (this spec's overview) |
| 01 Landing hero | Covered | `surfaces/01-landing.md` |
| 02 Auth shells | Covered | `surfaces/02-auth.md` |
| 03 Invite gate & redemption | Covered | `surfaces/03-invite-gate.md` |
| 04 Onboarding questionnaire wizard | Covered (S04 → OB Step 01–11) | `surfaces/04-onboarding-wizard.md` |
| 05 Pending / rejected approval gate | Covered | `surfaces/05-approval-gate.md` |
| 06 Home — control panel | **Transformed** (quadrant + TALK centre → stacked rank-group S08; decisions 2/5) | `surfaces/06-home.md` |
| 07 Profile view | Covered | `surfaces/07-profile-view.md` |
| 08 Profile edit + delete account | Covered | `surfaces/08-profile-edit.md` |
| 09 Notifications inbox | Covered | `surfaces/09-notifications.md` |
| 10 Tools hub | Covered | `surfaces/10-tools-hub.md` |
| 11 Invite tool (mint codes) | Covered (named/multi-use; app-layer, no schema change) | `surfaces/11-invite-tool.md` |
| 12 My forms + replay | Covered | `surfaces/12-my-forms.md` |
| 13 Family tree | Covered | `surfaces/13-family-tree.md` |
| 14 Captain camp-management (roster) | **Transformed** (Iteration B responsive; + assign-captain flow, decisions 2/4) | `surfaces/14-roster.md` |
| 15 Captain announcements | Covered | `surfaces/15-announcements.md` |
| 16 Captain tools hub | Covered | `surfaces/16-captain-tools.md` |
| 17 MCP connect / consent | Covered (incl. 403 branches) | `surfaces/17-mcp-connect.md` |
| 18 `@camp404/ui` catalog | Covered | `component-library.md` + `design-tokens.md` |
| 19 Control Panel / Grid / Quadrant nav | **Transformed** (quadrant-nav + control-grid + TALK centre **DROPPED**; rank-group launcher replaces them — recommendations P2-7) | `surfaces/06-home.md` + `component-library.md` |
| 20 Questionnaire field renderer (10 kinds) | Covered | `surfaces/20-field-renderer.md` |
| 21 Voice dictation pipeline | **Transformed** (field-level only; home TALK centre removed, decision 5) | `surfaces/21-voice.md` |
| 22 Avatar upload & image pipeline | Covered | `surfaces/22-avatar-upload.md` |
| 23 Auth / session / access-control gating | Covered | `flows.md` (gating spine) + `information-architecture.md` (gate levels) |
| 24 App shell / layout / global chrome | Covered | `information-architecture.md` + `component-library.md` (TopChrome, DetailHeader, AuthShell, error boundaries) |
| 25 Global dialogs & feedback | Covered | `surfaces/25-global-overlays.md` |
| 26 Push opt-in & delivery | **Partial** — opt-in UI covered; FCM delivery + drain cron → backend spec | `surfaces/26-enable-push.md` |
| 27 Broadcast → delivery → inbox engine | **Partial** — composer (15) + inbox (09) covered; dispatch/push/reminder crons → backend spec | `surfaces/15-announcements.md` + `surfaces/09-notifications.md` |
| 28 Design token system | Covered | `design-tokens.md` |
| 29 Canonical data model & enums | Covered (+ the one NEW table) | `_analysis/db-impact.json` + per-brief Data sections |
| 30 E2E test-mode seam (`/api/test/*`) | **Out-of-scope** (test infra, not a UI surface) | reference-only |

**Tally:** 22 Covered · 4 Transformed (06, 14, 19, 21) · 2 Partial (26, 27) · 1 Out-of-scope (30) · 1 Meta (00) · 1 data-model (29) = **31/31 consciously dispositioned.**

---

## B. Schema-backed capabilities with NO board (the un-reconciled cluster from finding #1)

These live tables/enums exist in `packages/db/src/schema.ts` and are named in feature-set §1's job
statement, but **no board draws them**. They are **out-of-scope for this redesign** (the canvas is
the source of truth). None is *removed* from the product or the DB — they are simply not
(re)designed here. The redesign's only schema change remains the single additive
`captain_promotion_requests` table (decision 4); all of the below are left exactly as-is.

| Capability | Schema | Disposition | Note |
|---|---|---|---|
| Tasks | `tasks`, `task_status` | **FUTURE stub** | Home tiles "My / Crew / Camp Tasks" link here; render inert "coming soon" (IA §3.2). No board. |
| Reimbursements / finances | `reimbursements`, `reimbursement_status`, `reimbursement_account_type`, `team_budgets` | **FUTURE stub** | Home "Finances" tile links here; inert. `team_budgets` is a plain note (feature-set §1 anti-scope: no budgets/goals). No board. |
| Recipes | `recipes`, `recipe_status`, `recipe_source` | Out-of-scope (reference-only) | AI recipe analysis reads dietary; no recipe UI drawn. |
| Documents | `documents` | Out-of-scope (reference-only) | No board. |
| Inventory | `inventory_items`, `inventory_updates`, `inventory_update_status` | Out-of-scope (reference-only) | No board. |
| Adoptees | `adoptees` | Out-of-scope (reference-only) | No board. |
| Workshops | `workshops`, `workshop_rsvps` | Out-of-scope (reference-only) | No board. |
| Telegram integration | `telegram_chats`, `telegram_invites`, `telegram_announcements` + enums | Out-of-scope (reference-only) | Separate integration; `telegram_handle` is reused as the roster `@handle` (14-roster). |
| Car / lift sharing | `car_members` | Out-of-scope (reference-only) | Driver/lift facet; no board. |
| Membership tier | `membership_tier` enum | Out-of-scope (reference-only) | No UI in the redesign. |
| Driver profiles (standalone) | `driver_profiles` | Partial — referenced, not a surface | Read on roster + `nextGate` skips `driver_profile`; the standalone driver questionnaire UI is not drawn → FUTURE. |
| Dietary (standalone management) | `dietary_requirements` | Covered as questionnaire; standalone mgmt reference-only | Dietary is a questionnaire page (onboarding) + runner future-write; no standalone dietary-management screen drawn. |

**Contract check (§7 "drop no functionality"):** every capability above is *consciously deferred*,
not silently lost. Re-introducing any of them is a future design pass that adds its boards; until
then they remain in the schema untouched and their entry points (where any exist) are documented
FUTURE stubs, never dead links.
