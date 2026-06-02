# Information Architecture — Camp 404 (canonical route/page map + navigation model)

**Status:** Canonical IA spec for the REDESIGN. This is the single source of truth for routes, gate levels, navigation edges, and orphan resolution. It supersedes the prior IA in `design/feature-set/00-overview.md §5` (kept as REFERENCE-ONLY).
**Owner:** Information-architecture lead.
**Inputs:** all 25 surface briefs (`design/spec/surfaces/*.md`), `design/spec/_analysis/surfaces.json` (26 surfaces + orphanRisks + componentInventory), `design/spec/_analysis/decisions.md` (LOCKED decisions), `design/spec/component-library.md`, `design/feature-set/00-overview.md §5` (prior IA).
**Mobile-first 430px**, dark-only, invite-only. Ranks: `captain | member` (team-lead & driver DERIVED at read time).

This file's purpose is **zero orphans**: every route has a nav route IN, every home tile has a stated destination (built or explicitly FUTURE), and every component in the library lands on at least one page.

---

## 0 — Legend

**Gate level** (the auth/clearance a viewer must hold to render the surface's data):
- **public** — no session required (unauthenticated reachable).
- **authed-light** — authenticated + camp-access (invite redeemed or god email). Onboarding/approval NOT re-enforced on the surface itself (intentional bypass; the home spine funnels).
- **authed** — full gating spine: auth → invite → onboarding-complete → captain-approval. The standard "you're in the app" bar.
- **captain (preview-but-locked)** — navigable by any authed member; renders chrome only, returns NO data, all controls inert, shows `CaptainLock` "VIEW ONLY · no data for your rank" for non-captains (LOCKED decision 3). NOT a redirect, NOT a blocking overlay.
- **gate** — a blocking interstitial that is itself part of the gating spine (invite gate, onboarding, approval). Has an exit (sign out) per the north-star "the gate always has an exit".
- **n/a (component/overlay)** — not a route; mounted inside a host surface or app-wide.

**Gating spine (LOCKED, ordered, exit-bearing)** — runs on `/` and is the backbone every authed route inherits:
`authenticated? → invite-gated (hasCampAccess) → onboarding-incomplete (nextGate over pending blocking required_actions) → pending/rejected approval (isApproved) → app`. Each gate lets through, sends to a built route, or offers an escape; `nextGate` never routes to a gate with no page.

---

## 1 — ROUTE TABLE

Every route → surface → brief → gate level → composed components. Routes are grouped by branch. "Composes" lists the load-bearing components each route assembles (full per-component inventory in `design/spec/component-library.md`).

### 1.1 — Public / unauth branch

| Route | Surface | Brief | Gate level | Composes |
|---|---|---|---|---|
| `/` (unauth) | Landing (glitch 404 splash) | `01-landing.md` | public | `LandingHero`, `Glitch404`, `Button-Primary` (CTA "Are you lost?"), CRT/scanlines overlay |
| `/auth/sign-in` | Auth — sign-in | `02-auth.md` | public | `AuthShell`, `InputField`×2, `Button-Primary`, `or-divider`, `Google-OAuth-button` (GoogleMark), `Alert` |
| `/auth/sign-up` | Auth — sign-up | `02-auth.md` | public | `AuthShell`, `InputField`×3, `Button-Primary`, `or-divider`, `Google-OAuth-button`, `Alert` |
| `/auth` (bare) | Verifier-exchange landing | `02-auth.md` | public | none rendered (server `redirect("/")` or `/auth/sign-in`) |
| `/auth/[path]` | Hosted Neon Auth fallback (forgot/reset/callback/sign-out/magic-link) | `02-auth.md` | public | `AuthView` (hosted) |

### 1.2 — Gating spine (blocking interstitials)

| Route | Surface | Brief | Gate level | Composes |
|---|---|---|---|---|
| `/signup/required` | Invite gate (redeem code) | `03-invite-gate.md` | gate (authed, no camp-access) | `AuthShell` (footer "Camp 404 is invite-only."), `InputField`, `Alert` (3 errors), `Button-Primary`, sign-out link |
| `/onboarding/questionnaire` | Questionnaire gate (intro) → wizard/runner | `23-questionnaire-gate.md` → `04-onboarding-wizard.md` / `24-questionnaire-runner.md` | gate (authed, onboarding-incomplete) | `QCard`, `Button-Primary`, lock notice, sign-out; then `WizardHeader`, `ProgressBar`/`ProgressLabelRow`, `QuestionField`+`FieldInput` (all 10 kinds), footer-state matrix; blocking variant adds `BlockingTopBar`, `RequiredChip`, `BlockingNotice` |
| `/onboarding/questionnaire/complete` (proposed; see §3 OQ) | Questionnaire complete & queue | `27-questionnaire-complete.md` | authed | `SuccessHero`/`CompletionHero`, `Button-Primary`, `QueueCard`×N (complete/next-up/locked), `RequiredChip`, sign-out |
| `/pending-approval` | Approval gate (pending / rejected) | `05-approval-gate.md` | gate (authed, not approved) | `AuthShell`, `IconBadge` (Clock / ShieldX), `Button-Outline` (sign out) |

### 1.3 — App core (authed)

| Route | Surface | Brief | Gate level | Composes |
|---|---|---|---|---|
| `/` (authed) | Home — control panel | `06-home.md` | authed (full spine) | `TopChrome` (bell+avatar), `RankGroupCard`×3, `GridTile`×N, `CaptainLock` (locked groups), `CustomizeMode` (`DraggableTileRow`, `DropSlot`, `PinnedGroup`/`DropZone`, `NewGroupAffordance`), `EnablePush`, `Divider` |
| `/profile` | Profile view | `07-profile-view.md` | authed | `Avatar`, `RankPill`, `Button-Primary` (Edit), questionnaire-review link, sign-out |
| `/profile/edit` | Profile edit + delete account | `08-profile-edit.md` | authed | `Card`×2, `AvatarUpload`, `InputField`, `Alert`, `Button-Primary`/`Button-Outline`/destructive `Button` |
| `/notifications` | Notifications inbox | `09-notifications.md` | authed-light (invite gate only) | `DetailHeader` (back→`/`), `notification-row`×N, `new-pill`, `EmptyState` (bell-off) |

### 1.4 — Member tools subtree (authed)

| Route | Surface | Brief | Gate level | Composes |
|---|---|---|---|---|
| `/tools` | Tools hub | `10-tools-hub.md` | authed (invite + approval; onboarding bypass) | `DetailHeader` (back→`/`), `NavCard`×3 (`IconChip`+title+desc+chevron) |
| `/tools/invite` | Invite tool (mint codes) | `11-invite-tool.md` | authed (invite + approval) | `GhostBack`→`/tools`, `InputField` (email/note), `CodeField`+`Stepper`, `AvailabilityHint`, `CaptainOptions` (captain) / `MemberNote` (member), `Checkbox`, `Button-Primary`, `SuccessHero`/`SavedBanner` |
| `/tools/forms` | My forms — list | `12-my-forms.md` | authed | `GhostBack`→`/tools`, `FormCard`×N, `EmptyState` ("No forms yet") |
| `/tools/forms/[key]` | My forms — replay/edit | `12-my-forms.md` | authed (+ form must be completed; unknown key→404) | `GhostBack`→`/tools/forms`, `QuestionnaireWizard` (replay), `SavedBanner`, `ChangeLog`/`ChangeLogEntry`/`EmptyLog` |
| `/family-tree` | Family tree (referral graph) | `13-family-tree.md` | authed (wide-shell exception, `max-w-3xl`) | `GhostBack`→`/tools`, `Input` (search), `Button-Outline`×2 (expand/collapse), `tree-row`, `captain-pill`/`you-pill`/`count-pill`, `Card` (empty states) |

### 1.5 — Captain subtree (captain, preview-but-locked)

| Route | Surface | Brief | Gate level | Composes |
|---|---|---|---|---|
| `/captains/tools` | Captain tools hub | `16-captain-tools.md` | captain (preview-but-locked) | `GhostBack`→`/`, `NavCard`×2 (Announcements, Roster & approvals), `CaptainLock` (non-captains: chrome + `CaptainLock` **in place of** the tool list — no data, no cards) |
| `/captains/camp-management` | Captain roster & member detail | `14-roster.md` | captain (preview-but-locked) | `StatsStrip`/`stat-tile`, `RosterToolbar`/`FilterChip`, `RosterTable`/`RosterList`/`roster-row`, `StatusBar`, `RoleBadge`, `Avatar`, `MemberProfile`/`ProfileFieldGrid`, `TeamBadge`, `AssignCaptainDialog`/`OptInStepTracker` (two-step), `RejectConfirmDialog`, `Button-Primary`/`Button-Outline`, `CaptainLock`, `RedactedField` |
| `/captains/announcements` | Captain announcements (composer) | `15-announcements.md` | captain (preview-but-locked) | `GhostBack`→`/captains/tools`, `InputField`/`Textarea`, `PresentationSelect`/`segmented`, `DictatePill`→`RecorderPanel`, `Alert`/`SavedBanner`, `DraftCard`/`PublishedCard`/`AnnouncementHeader`/`PresentationPill`, `EmptyState`, `CaptainLock` |

### 1.6 — MCP / integration (authed via OAuth gates)

| Route | Surface | Brief | Gate level | Composes |
|---|---|---|---|---|
| `/mcp/connect` | MCP sign-in bridge | `17-mcp-connect.md` | public→authed (bridge) | `Shell`, `MCPConnectInner`, `Google-OAuth-button`, `Alert`, sign-in footnote |
| `GET /api/mcp/oauth/authorize` | MCP consent screen | `17-mcp-connect.md` | authed (full MCP gate chain) | raw server HTML: identity row, scope row, `Button-Primary` (Approve) / `Button-Outline` (Deny); 403 Gate Card (`IconBadge` lock) |
| `POST /api/mcp/oauth/authorize` | MCP approve/deny handler | `17-mcp-connect.md` | authed | `htmlRedirect` (no UI) |

### 1.7 — Cross-cutting (NO own route — mounted in hosts / app-wide)

| "Route" | Surface | Brief | Gate level | Mounted by |
|---|---|---|---|---|
| n/a (shared component sheet) | Field-kind renderer (10 kinds) | `20-field-renderer.md` | n/a | `QuestionnaireWizard` on `/onboarding/questionnaire` + `/tools/forms/[key]` |
| n/a (embedded panel) | Voice dictation (RecorderPanel) | `21-voice.md` | n/a (auth at API only) | `LongTextField` (`DictatePill`) on long_text fields + `ReportBugDialog` |
| n/a (embedded sub-component) | Avatar upload | `22-avatar-upload.md` | n/a | `/profile/edit` + onboarding step 01 (`profile.image`) |
| n/a (mounted app-wide) | Global overlays | `25-global-overlays.md` | self-gate on session | root layout: `AckTakeover`, `QuestionnaireBlock` (overlay variant), `ShakeReporter`→`ReportBugDialog`, `ErrorBoundary`/`global-error`/`not-found`, `Toast` |
| n/a (mounted on authed home) | Enable push (opt-in) | `26-enable-push.md` | authed | `/` (authed home) |
| `error.tsx` / `global-error.tsx` / `not-found.tsx` | Error / not-found boundaries | `25-global-overlays.md` | universal | Next file-convention (implicit) |

> **Surface count reconciliation:** surfaces.json lists 26 logical surfaces; this table renders them across 30 route rows + 6 cross-cutting rows. The +rows are route splits of one surface (auth: sign-in/sign-up/bare/fallback = 1 surface, 4 routes; my-forms: list + `[key]` = 1 surface, 2 routes; MCP: bridge + GET + POST = 1 surface, 3 routes; questionnaire: gate + wizard/runner + complete = the S25→S26→S27 trio over the same `/onboarding/questionnaire` root). The "Design-system primitive kit" (S24) is a style guide, not a surface — it backs the component library, not a route.

---

## 2 — NAVIGATION MODEL

Replaces the old quadrant + LayerTabBar + centre-TALK model (DROPPED). The new model has **five entry spines**:

1. **TopChrome** (global header on the authed app) — bell → notifications, avatar → profile.
2. **Home rank-group tiles** (`/` authed) — the launcher; rank-grouped `GridTile`s deep-link into surfaces; higher-rank groups are preview-but-locked.
3. **Member tools hub** (`/tools`) — fans to invite / forms / family-tree.
4. **Captain tools hub** (`/captains/tools`) — fans to announcements / roster.
5. **Gating spine** — the involuntary nav: gates redirect a user to the surface that lets them proceed or escape.

### 2.1 — Nav graph (edge list: SOURCE → DEST [trigger])

```
# ── Unauth entry ────────────────────────────────────────────
/ (unauth, LandingHero)        → /auth/sign-in          [CTA "Are you lost?"]
/auth/sign-in                  → /auth/forgot-password   [Forgot link → /auth/[path]]
/auth/sign-in                  → /auth                   [Google OAuth round-trip]
/auth/sign-in                  → /                       [email sign-in success → spine]
/auth/sign-up                  → /auth/sign-in           [footer "Sign in" link]
/auth/sign-up                  → /                       [sign-up success → spine]
/auth (bare)                   → / | /auth/sign-in       [verifier exchange]

# ── Gating spine (involuntary redirects from / and authed routes) ──
/ (spine) → /auth/sign-in        [no session]      # actually renders LandingHero inline
/ (spine) → /signup/required     [!hasCampAccess]
/ (spine) → /onboarding/questionnaire  [pending blocking required_action via nextGate]
/ (spine) → /pending-approval    [approval pending OR rejected]
/signup/required → /             [redeem success → re-enter spine]
/signup/required → /auth/sign-out [sign out escape]
/onboarding/questionnaire (gate) → /onboarding/questionnaire (wizard) [Start questionnaire]
/onboarding/questionnaire (wizard) → /                   [Finish → spine]
/onboarding/questionnaire → /auth/sign-out               [sign out, step 0 / top bar]
/onboarding/questionnaire/complete → /                   [Back to camp, all done]
/onboarding/questionnaire/complete → /onboarding/questionnaire(next) [Start next questionnaire]
/onboarding/questionnaire/complete → /auth/sign-out      [sign out]
/pending-approval → /            [captain approved → next load → spine]
/pending-approval → /auth/sign-out [sign out — only action]

# ── TopChrome (global header, every authed app page) ──────────
TopChrome.bell    → /notifications
TopChrome.avatar  → /profile

# ── Home (/) rank-group tiles ────────────────────────────────
/  (Member group)  → /profile        [tile "My Profile"]    # destination resolved to /profile
/  (Member group)  → /tools          [tile "Tools"]
/  (Member group)  → FUTURE          [tiles "My Teams", "My Tasks"]   # see §3
/  (Team Lead grp) → FUTURE          [tiles "Crew Roster/Tasks/Forms/Announcements"]  # locked preview unless team-lead
/  (Captain group) → /captains/camp-management  [tile "Camp Management"]
/  (Captain group) → /captains/tools  [tile "Camp Tools"]
/  (Captain group) → FUTURE          [tiles "Camp Tasks", "Finances"]   # see §3
/  (signed-out)    → /auth/sign-in    [LandingHero CTA]

# ── Member tools hub (/tools) ────────────────────────────────
/tools → /tools/invite      [NavCard "Invite a member"]
/tools → /tools/forms       [NavCard "My forms"]
/tools → /family-tree       [NavCard "Family tree"]   # NOTE: only tools NavCard leaving /tools/* subtree
/tools → /                  [DetailHeader back]

/tools/invite → /tools      [GhostBack]
/tools/invite → /tools/invite [Success "Send another" — full reload]
/tools/forms  → /tools      [GhostBack]
/tools/forms  → /tools/forms/[key]  [tap FormCard]
/tools/forms/[key] → /tools/forms   [GhostBack]
/family-tree  → /tools      [GhostBack]   # only nav exit; surface is read-only

# ── Captain tools hub (/captains/tools) ──────────────────────
/captains/tools → /captains/announcements    [NavCard "Announcements & notifications"]
/captains/tools → /captains/camp-management   [NavCard "Roster & approvals"]
/captains/tools → /                           [GhostBack]
/captains/announcements   → /captains/tools   [GhostBack]
/captains/camp-management → /captains/tools | / [Back]   # brief: "captain tools hub / /"

# ── Profile ──────────────────────────────────────────────────
/profile → /profile/edit             [Edit profile]
/profile → /onboarding/questionnaire [Review questionnaire answers]   # replay/review mode
/profile → /auth/sign-out            [Sign out — hard nav]
/profile/edit → /profile             [Cancel / Save success]
/profile/edit → /auth/sign-out       [Delete account success]

# ── Notifications ────────────────────────────────────────────
/notifications → /                   [DetailHeader "Home" back]

# ── MCP ──────────────────────────────────────────────────────
/mcp/connect → /auth                 [Google sign-in]
/mcp/connect → /auth/sign-in         [footnote link]
/mcp/connect → GET /api/mcp/oauth/authorize  [auto-forward "next"]
GET authorize → /mcp/connect?next=…  [no session]
GET authorize → (client redirect_uri)  [Approve→code | Deny→access_denied]

# ── App-wide overlays (no nav edges; mount over current route) ──
AckTakeover            ← any authed page  [pending acknowledge delivery]   → router.refresh on ack
QuestionnaireBlock     ← any authed page  [post-onboarding blocking required_action]  → /onboarding/questionnaire(runner)
ShakeReporter/Dialog   ← any signed-in page [shake gesture]  → GitHub issue (no in-app nav)
ErrorBoundary          ← any route render error  → reset() / "Back to camp" → /
not-found              ← unmatched route  → "Back to camp" → /
```

### 2.2 — Nav graph (indented tree, primary forward spine)

```
/ (unauth) LandingHero
└─ /auth/sign-in ─┬─ /auth/sign-up ─┐
                  ├─ /auth/forgot-password (hosted)
                  └─ /auth → /  (auth success)
                                   │
              ┌────────────────────┘  (gating spine, in order)
              ▼
     /signup/required ──redeem──▶ /onboarding/questionnaire (gate)
                                       └─ wizard/runner ──▶ /onboarding/questionnaire/complete (trio)
                                                                  └──▶ / (all done)
              (approval) ──▶ /pending-approval ──approved──▶ /
                                   │
                                   ▼
                          / (authed) HOME — control panel
                          │   [TopChrome] bell ▶ /notifications · avatar ▶ /profile
                          │
                          ├─ MEMBER group
                          │   ├─ My Profile ▶ /profile ─┬─ /profile/edit
                          │   │                          └─ /onboarding/questionnaire (review)
                          │   ├─ Tools ▶ /tools
                          │   │            ├─ /tools/invite
                          │   │            ├─ /tools/forms ─▶ /tools/forms/[key]
                          │   │            └─ /family-tree
                          │   ├─ My Teams ▶ FUTURE
                          │   └─ My Tasks ▶ FUTURE
                          │
                          ├─ TEAM LEAD group (preview-locked unless derived team-lead)
                          │   ├─ Crew Roster ▶ FUTURE
                          │   ├─ Crew Tasks ▶ FUTURE
                          │   ├─ Crew Forms ▶ FUTURE
                          │   └─ Crew Announcements ▶ FUTURE
                          │
                          └─ CAPTAIN group (preview-locked unless captain)
                              ├─ Camp Management ▶ /captains/camp-management
                              ├─ Camp Tools ▶ /captains/tools
                              │                  ├─ /captains/announcements
                              │                  └─ /captains/camp-management
                              ├─ Camp Tasks ▶ FUTURE
                              └─ Finances ▶ FUTURE

  (independent) /mcp/connect ▶ GET/POST /api/mcp/oauth/authorize   (MCP client OAuth, not in-app nav)
  (app-wide overlays mount over any route — see edge list)
```

### 2.3 — Nav model rules (the grammar)

- **TopChrome is the only persistent chrome.** Bell + avatar appear on the authed app shell. Per `06-home.md` reconcile the live `HomeHeader` onto shared `TopChrome`. Profile/notifications/tools/family-tree use a `DetailHeader` or `GhostBack` back-affordance instead of TopChrome (they are leaf surfaces).
- **Back affordances are explicit, not browser-only.** Two patterns: `DetailHeader` (round-pill back button, used by `/notifications`, `/tools`) and `GhostBack` (chevron + label ghost link, used by `/tools/invite`, `/tools/forms`, `/tools/forms/[key]`, `/family-tree`, `/captains/announcements`, `/captains/tools`, `/captains/camp-management`). Standardise per brief; both resolve to the named parent route.
- **Hub-and-spoke, not tabs.** There is no bottom tab bar. Navigation is: home tiles → surfaces → back to home; tools hubs → tools → back to hub. The two hubs (`/tools`, `/captains/tools`) are the only fan-out indices.
- **Preview-but-locked is navigable, not a wall.** A member CAN open `/captains/*` and the Captain/Team-Lead home groups; they see chrome + `CaptainLock`, no data, inert controls. This replaces the legacy hard redirect on `/captains/*` (LOCKED decision 3). The home rank-group preview uses the same `CaptainLock` "VIEW ONLY · no data for your rank" grammar at group scope.
- **The gating spine is the involuntary nav layer.** Gates are not chosen; they intercept. Each names where the user goes next or how to escape (sign out). `nextGate` never routes to a gate without a page.
- **Voice has no nav node.** Per LOCKED decision 5, voice is field-level only (`DictatePill` → `RecorderPanel` on long_text fields + bug dialog). There is NO home mic, NO TALK centre, NO `/dictate` route. This is the resolution of the top orphan risk (§3).
- **Overlays float, they don't navigate.** `AckTakeover`, `QuestionnaireBlock`, `ShakeReporter`/`ReportBugDialog`, `Toast`, `ErrorBoundary` mount over the current route; only `QuestionnaireBlock` "Start" and `ErrorBoundary` "Back to camp" produce a route change.

---

## 3 — ORPHAN RESOLUTION

Every `surfaces.json` orphanRisk and every home tile, with its stated destination. Items with no built surface are marked **FUTURE — not yet designed** and named with the tile that points at them, so they are *documented stubs, not silent dead links*.

### 3.1 — surfaces.json orphanRisks (each resolved)

| # | orphanRisk | Resolution |
|---|---|---|
| 1 | **Voice lost its home** (TALK centre removed from both home boards) | RESOLVED by LOCKED decision 5: voice is field-level dictation only. Home entry is DROPPED by design. Voice survives via `DictatePill → RecorderPanel` (`21-voice.md`) on every `long_text` field (onboarding steps 03/04, questionnaire runner, announcements composer body) + the bug-report dialog. The §7 contract ("voice input must remain reachable") is satisfied; voice-as-hero is intentionally retired. No nav node; no orphan. |
| 2 | **S21 has no firm route** (drawn as full page, documented as embedded panel) | RESOLVED: `21-voice.md` is host-mounted, **no own route** (§1.7). Host = `LongTextField` (inline panel, replaces the DictatePill in place) and `ReportBugDialog`. The board's full-page + back-nav is a design proxy; built as an inline panel within the host. |
| 3 | **S25 gate vs S22 QuestionnaireBlock overlay** (two owners for the same gate) | RESOLVED by ownership split (`23-questionnaire-gate.md` + `25-global-overlays.md`): **S25 = the ROUTED gate** at `/onboarding/questionnaire` (onboarding burner-profile, redirect-driven). **S22 QuestionnaireBlock = the OVERLAY variant** that fires for a *post-onboarding* blocking `required_action` raised while the member is already in the app. Same card/copy, different trigger. Invariant: never both at once — if the routed S25 redirect would fire, the overlay must not mount. |
| 4 | **S04 footer-state matrix has no home once S04 superseded** | RESOLVED: `04-onboarding-wizard.md` ports S04's full footer-state matrix (page-0 / middle / last / submitting / inline-error / error-banner / save-failed) onto the per-step OB pages + adds `ProgressLabelRow` (mono "Step N of M" + `NN%`). States are explicitly carried, not dropped. |
| 5 | **S17 1040px tables orphaned if mobile-only chosen** | RESOLVED by LOCKED decision 2: roster `/captains/camp-management` is **Iteration B responsive** — desktop = terminal-console (1040px JetBrains-Mono), mobile = 430px card list, ONE route. Iteration A (`S17 Captain mgmt` plain table) is DROPPED. No orphan; the wide layout is the desktop breakpoint of the canonical route. |
| 6 | **Tools-hub Invite card "single-use" stale copy** | RESOLVED: `10-tools-hub.md` fixes the entry-point copy to "Mint a named invite link to bring someone onto Camp 404." matching the multi-use named-slug destination (`11-invite-tool.md`). Also fix the `/signup/required` placeholder from `CAMP-XXXX-XXXX` to the slug format. Entry-point and destination now agree. |
| 7 | **Home tiles → undrawn surfaces** (Camp Tasks, Crew Tasks, Finances, Crew Forms, Crew Announcements) | RESOLVED as documented FUTURE stubs — see §3.2. Each tile is specced; destination marked "FUTURE — not yet designed"; tiles render visible-but-inert ("coming soon"), NOT dead `<a href>` that 404. |
| 8 | **MCP 403 branches undrawn** (onboarding-incomplete, no-camp-access) | RESOLVED: `17-mcp-connect.md` carries `no_camp_account`, `no_camp_access`, `onboarding_incomplete` as `errorPage` HTML responses (consistent with live code); only the `pending_approval` 403 Gate Card is board-styled. Documented as raw-HTML branches, not silent dead-ends. Flagged for product (style vs raw HTML). |

### 3.2 — Every home tile → destination (the launcher's complete map)

From `06-home.md` (S08 control panel). Three rank groups × 4 tiles = 12 tiles. Each has a stated destination; FUTURE tiles name the pointing tile.

**Captain group** (visible to all; preview-locked unless captain):

| Tile | Hint | Badge | Destination |
|---|---|---|---|
| Camp Management | Roster & statuses | — | `/captains/camp-management` (BUILT) |
| Camp Tasks | Camp-wide work board | `12` | **FUTURE — not yet designed** (no board, no route; tile "Camp Tasks") |
| Finances | Dues & reimbursements | — | **FUTURE — not yet designed** (no board, no route; tile "Finances") |
| Camp Tools | Announcements, admin… | — | `/captains/tools` (BUILT; hub → `/captains/announcements`) |

**Team Lead group** (visible to all; preview-locked unless derived team-lead):

| Tile | Hint | Badge | Destination |
|---|---|---|---|
| Crew Roster | Your crew's statuses | — | **FUTURE — not yet designed** (team-scoped roster; tile "Crew Roster") |
| Crew Tasks | Assign & track work | `4` | **FUTURE — not yet designed** (tile "Crew Tasks") |
| Crew Forms | Questionnaire responses | — | **FUTURE — not yet designed** (team-scoped forms; tile "Crew Forms") |
| Crew Announcements | Post to your crew | — | **FUTURE — not yet designed** (team-scoped announce; tile "Crew Announcements") |

**Team Member group** (visible & unlocked to all approved members):

| Tile | Hint | Badge | Destination |
|---|---|---|---|
| My Teams | Your crews | `3` | **FUTURE — not yet designed** (member team view, no `/members` route; tile "My Teams") |
| My Tasks | What's on you | `5` | **FUTURE — not yet designed** (no tasks/meals route; tile "My Tasks") |
| My Profile | You & your data | — | `/profile` (BUILT — resolve destination to `/profile`, not the legacy `/onboarding/questionnaire`; per `06-home.md` OQ1) |
| Tools | Meals, expenses… | — | `/tools` (BUILT; hint copy is aspirational — reconcile to "Invite, forms, family tree") |

**FUTURE-tile build rule (LOCKED carry-forward):** future tiles render enabled-looking but inert ("coming soon" affordance); do NOT wire dead links that 404 (kills the live `My Teams → /members`, `My Tasks → /meals` dead-link bug). Customize-mode layout persistence is client-side only (localStorage/cookie) — NO new table, per LOCKED decision 4.

### 3.3 — Every page has a nav route IN (inbound check)

| Route | Inbound edge(s) |
|---|---|
| `/` (unauth) | direct URL; sign-out lands here |
| `/auth/sign-in` | LandingHero CTA; sign-up footer link; gating-spine (no session); MCP footnote |
| `/auth/sign-up` | direct URL; (asymmetric — no in-app link from sign-in, intentional per `02-auth.md`) |
| `/auth/[path]` | `/auth/sign-in` "Forgot password"; all sign-out links (`/auth/sign-out`) |
| `/signup/required` | gating spine (`!hasCampAccess`); redeem-fail self-loop |
| `/onboarding/questionnaire` | gating spine (pending blocking required_action); `/profile` "Review answers"; `/onboarding/questionnaire/complete` "Start next"; QuestionnaireBlock overlay "Start" |
| `/onboarding/questionnaire/complete` | questionnaire runner final-submit redirect (proposed; §3 OQ below) |
| `/pending-approval` | gating spine (not approved) |
| `/` (authed) | gating spine pass; every back/sign-out-to-home; bell/avatar parent |
| `/profile` | TopChrome avatar; home "My Profile" tile; `/profile/edit` Cancel/Save |
| `/profile/edit` | `/profile` "Edit profile" |
| `/notifications` | TopChrome bell |
| `/tools` | home "Tools" tile; GhostBack from `/tools/invite`, `/tools/forms`, `/family-tree` |
| `/tools/invite` | `/tools` NavCard; success "Send another" self-loop |
| `/tools/forms` | `/tools` NavCard; GhostBack from `[key]` |
| `/tools/forms/[key]` | `/tools/forms` FormCard tap |
| `/family-tree` | `/tools` NavCard |
| `/captains/tools` | home "Camp Tools" tile; GhostBack from `/captains/announcements`; Back from `/captains/camp-management` |
| `/captains/camp-management` | home "Camp Management" tile; `/captains/tools` NavCard "Roster & approvals" |
| `/captains/announcements` | `/captains/tools` NavCard "Announcements & notifications" |
| `/mcp/connect` | MCP client OAuth redirect (no-session); GET-authorize redirect |
| `GET/POST /api/mcp/oauth/authorize` | MCP client OAuth init; `/mcp/connect` auto-forward |

**Result: every route has ≥1 inbound edge.** No orphaned pages.

> **Two inbound-edge notes (flag for build, not orphans):**
> - `/auth/sign-up` has no in-app reciprocal link from `/auth/sign-in` (deliberate per `02-auth.md` — entry via Landing CTA + direct URL). Documented, intentional asymmetry.
> - `/onboarding/questionnaire/complete` (S27) route is **proposed, exact path TBD** (`27-questionnaire-complete.md` OQ1). It is the trio confirmation surface for captain-activated questionnaires (Safety/Dietary/Agreements), a confirmed **scope expansion** to seed (no schema change). Its inbound edge is the questionnaire-runner final-submit redirect; the burner-profile wizard keeps its redirect-to-`/`. Until the trio is seeded, this route is a documented forward stub, not a live orphan.

### 3.4 — Every component lands on ≥1 page (component coverage)

Walking the `surfaces.json` componentInventory; each maps to at least one route/host above.

| Component | Lands on |
|---|---|
| TopChrome | `/` authed (header) |
| SectionHeader | `/captains/announcements` (Drafts/Published headers), list intros |
| DetailHeader | `/notifications`, `/tools` |
| GridTile | `/` authed (rank-group tiles) |
| Button-Primary | nearly every form surface (auth, invite-gate, onboarding, invite-tool, announcements, roster, gates) |
| Button-Outline | auth (Google), approval-gate (sign out), family-tree controls, EnablePush, dialogs |
| InputField | auth, invite-gate, profile-edit, invite-tool, announcements |
| Card | profile-edit, family-tree empties, invite-tool, questionnaire-runner cards, S27 queue |
| EmptyState | `/tools/forms` (no forms), `/notifications` (bell-off), `/captains/announcements` |
| CaptainLock | `/captains/tools`, `/captains/camp-management`, `/captains/announcements`, home locked rank-groups |
| NavCard | `/tools` (×3), `/captains/tools` (×2) |
| IconChip / IconBadge | `/tools`, `/captains/tools`, gate screens (approval, MCP 403) |
| RankPill / status-pill | `/profile`, `/captains/camp-management` (status tags), TopChrome-adjacent |
| Avatar | `/profile`, `/profile/edit`, `/captains/camp-management`, `/family-tree`, TopChrome |
| AvatarUpload | `/profile/edit`, onboarding step 01 |
| ProgressBar / ProgressLabelRow | all OB steps, questionnaire runner |
| WizardHeader | onboarding wizard (all steps) |
| segmented-control | scale/toggle fields (S05), OB steps, announcements presentation, S24 |
| toggle-switch | toggle field variant (S05) |
| checkbox / checkbox-pill | multi_select fields, invite-tool pre-approve, dietary OB step |
| radio-option-row | single_select fields (runner), OB steps 07/10 |
| combobox-field | country field (OB step 02, S05) |
| date-picker-control | birthday field (OB step 02, S05) |
| slider-field | team_interest fields (OB step 06, S05) |
| interest segmented-scale | OB step 06, questionnaire runner scale, S05 |
| DictatePill | OB steps 03/04, announcements composer body, long_text fields → launches RecorderPanel |
| textarea-field | long_text fields, profile-edit, invite-tool note, announcements |
| Alert / inline-alert | auth, invite-gate, profile-edit, invite-tool, runner validation |
| or-divider | `/auth/*` |
| Google-OAuth-button | `/auth/*`, `/mcp/connect` |
| AvailabilityHint | `/tools/invite` |
| Stepper | `/tools/invite` (multi-use) |
| CodeField | `/tools/invite` |
| SuccessHero / completion-hero | `/tools/invite` success, `/tools/forms/[key]`, `/onboarding/questionnaire/complete` |
| SavedBanner / SuccessBanner | `/tools/forms/[key]`, `/captains/announcements`, `/tools/invite` |
| notification-row | `/notifications` |
| new-pill | `/notifications` |
| filter-chip | `/captains/camp-management` |
| roster-row | `/captains/camp-management` |
| stat-tile | `/captains/camp-management` (stats strip) |
| two-step progress tracker | `/captains/camp-management` (assign-captain double opt-in) |
| RedactedField | `/captains/camp-management` (terminal redacted PII) |
| tree-row | `/family-tree` |
| captain-pill / you-pill / count-pill | `/family-tree` |
| mic-ring / waveform-bars / recorder-state-card | RecorderPanel (`21-voice.md`) host-mounted |
| role-group-card | `/` authed (rank groups) |
| reorder-row / drop-slot / drop-zone | `/` authed (Customize mode) |
| QCard / questionnaire-meta-card | `/onboarding/questionnaire` gate (S25), QuestionnaireBlock overlay (S22) |
| blocking-notice-banner | questionnaire runner (S26 blocking chrome) |
| RequiredChip | questionnaire runner, `/onboarding/questionnaire/complete` queue rows |
| colour-swatch-chip | S24 primitive kit (style guide — backs the token spec, `design-tokens.md`) |
| CRT/scanlines overlay | `/` unauth (LandingHero), questionnaire gate/overlay scan layer |
| AckTakeover / QuestionnaireBlock / ShakeReporter / ErrorBoundary / Toast | app-wide overlays (`25-global-overlays.md`) |
| EnablePush | `/` authed home |

**Result: every component in the inventory lands on ≥1 page.** No orphaned components.

> **One component-coverage note:** `colour-swatch-chip` and the broader S24 primitive kit are style-guide artefacts — they back the **token/typography spec** (`design-tokens.md`) and the **component library** rather than rendering on a user route. This is by design (S24 is "n/a — style guide", not a surface), not an orphan.

---

## 4 — INFORMATION-ARCHITECTURE TREE (full sitemap)

```
Camp 404
│
├─ PUBLIC (unauth)
│  ├─ /                         Landing — glitch 404 hero          [public]
│  └─ /auth
│     ├─ /auth/sign-in          Auth — sign-in                     [public]
│     ├─ /auth/sign-up          Auth — sign-up                     [public]
│     ├─ /auth                  Verifier-exchange (no UI)          [public]
│     └─ /auth/[path]           Hosted fallback (forgot/reset/     [public]
│                               callback/sign-out/magic-link)
│
├─ GATING SPINE (blocking interstitials, exit-bearing)
│  ├─ /signup/required          Invite gate (redeem code)          [gate]
│  ├─ /onboarding/questionnaire Questionnaire gate → wizard/runner [gate]
│  │  └─ /onboarding/questionnaire/complete                        [authed]
│  │                            Questionnaire complete & queue (trio; proposed route)
│  └─ /pending-approval         Approval gate (pending / rejected) [gate]
│
├─ APP CORE (authed)
│  ├─ /                         Home — control panel               [authed]
│  │   └─ TopChrome: bell ▶ /notifications · avatar ▶ /profile
│  ├─ /profile                  Profile view                       [authed]
│  │  └─ /profile/edit          Profile edit + delete account      [authed]
│  └─ /notifications            Notifications inbox                 [authed-light]
│
├─ MEMBER TOOLS  (/tools subtree)
│  └─ /tools                    Tools hub                          [authed]
│     ├─ /tools/invite          Invite tool (mint codes)           [authed]
│     ├─ /tools/forms           My forms — list                    [authed]
│     │  └─ /tools/forms/[key]  My forms — replay/edit             [authed]
│     └─ /family-tree           Family tree (referral graph)       [authed, wide shell]
│        (note: /family-tree lives outside /tools/* but is reached from the tools hub)
│
├─ CAPTAIN TOOLS  (/captains subtree — preview-but-locked)
│  └─ /captains/tools           Captain tools hub                  [captain·locked]
│     ├─ /captains/announcements  Captain announcements composer   [captain·locked]
│     └─ /captains/camp-management Captain roster & member detail   [captain·locked]
│        (Iteration B responsive: terminal desktop / 430px mobile)
│
├─ MCP / INTEGRATION
│  ├─ /mcp/connect              MCP sign-in bridge                 [public→authed]
│  └─ /api/mcp/oauth/authorize  MCP consent (GET) + approve/deny (POST)  [authed]
│
├─ CROSS-CUTTING (no own route)
│  ├─ Field-kind renderer       hosted in wizard + form replay     [n/a]
│  ├─ Voice (RecorderPanel)     hosted in long_text + bug dialog   [n/a]
│  ├─ Avatar upload             hosted in profile-edit + OB step 01 [n/a]
│  ├─ Enable push               mounted on authed home             [authed]
│  └─ Global overlays (app-wide)
│     ├─ AckTakeover            full-screen ack of announcements
│     ├─ QuestionnaireBlock     post-onboarding blocking gate overlay
│     ├─ ShakeReporter→ReportBugDialog  shake-to-report (GitHub)
│     ├─ ErrorBoundary / global-error / not-found  (file-convention)
│     └─ Toast                  transient confirm/undo strip
│
└─ FUTURE — NOT YET DESIGNED (documented stubs; tiles point here, render inert)
   ├─ Camp Tasks               ◀ home Captain tile "Camp Tasks"
   ├─ Finances                 ◀ home Captain tile "Finances"
   ├─ Crew Roster              ◀ home Team-Lead tile "Crew Roster"
   ├─ Crew Tasks               ◀ home Team-Lead tile "Crew Tasks"
   ├─ Crew Forms               ◀ home Team-Lead tile "Crew Forms"
   ├─ Crew Announcements       ◀ home Team-Lead tile "Crew Announcements"
   ├─ My Teams                 ◀ home Member tile "My Teams"
   └─ My Tasks                 ◀ home Member tile "My Tasks"
```

---

## 5 — Notes & deltas vs the prior IA (`feature-set/00-overview.md §5`)

The prior IA (reference-only) is superseded by this file. Key deltas:

1. **Quadrant + LayerTabBar + centre-TALK home → rank-group card launcher.** Home (`/`) is now three stacked rank-group cards with `GridTile` grids + Customize mode; the quadrant model and home mic are DROPPED (LOCKED decisions; `06-home.md`).
2. **Captain routes: hard redirect → preview-but-locked.** `/captains/*` and home rank-groups are now navigable with `CaptainLock` (LOCKED decision 3), not bounced to `/`.
3. **Roster route unified to one Iteration B responsive page** (terminal desktop / 430px mobile); the prior unit-14 wide-table Iteration A is DROPPED (LOCKED decision 2).
4. **Make-captain double opt-in added** on `/captains/camp-management` — the ONLY schema change (`captain_promotion_requests` + `promotion_request_status`); LOCKED decision 4. Surfaces a new acceptance touchpoint (target accepts in their own app — likely home rank-section/notifications; flagged in `14-roster.md` OQ3).
5. **Questionnaire is now a trio** (S25 gate → S26 runner → S27 complete+queue) over `/onboarding/questionnaire` + a proposed `/complete` route — a confirmed scope expansion expressed via existing `required_actions` (no schema change).
6. **Onboarding `/onboarding/questionnaire`** now hosts BOTH the friendly per-step wizard (onboarding) and the blocking-required runner chrome (captain-activated), sharing one engine.
7. **Voice has no route node** — field-level only (LOCKED decision 5).
8. **Tools/family-tree copy reconciled** — Invite "single-use" stale copy fixed; `/signup/required` placeholder moved to slug format.
9. **MCP routes added explicitly** (`/mcp/connect` + the authorize API) — the prior IA listed only `/mcp/connect`; the consent GET/POST handlers are now first-class IA nodes.

This IA carries ZERO silent dead links: every undrawn destination is a named FUTURE stub tied to its pointing tile, every route has an inbound edge, and every component in the library lands on a page.
