# Impl plan — coverage check (the unit registry + scorecard + verdict)

> The coverage auditor's pass over the implementation-planning set. Builds the
> **unit registry** (every Service / Component / Surface unit, its plan file, its
> REUSE/EXTEND/PROMOTE/NEW/DELETE status, target package, key deps), scores
> coverage against the contracts (`component-library.md` 49 canonical components;
> `README.md` surface index 25 briefs / 30 routes; the 9 service domains), and
> records gaps / inconsistencies / a blocker-gap-polish verdict.
>
> Sources: `design/spec/component-library.md`, `design/spec/README.md`,
> `design/spec/impl/architecture.md` (authoritative package map + layering
> `types ← {db,core} ← ui ← apps` + migration 0012 + 6-phase service order),
> `design/spec/impl/foundations-tokens.md`, and every plan in
> `impl/{service-layer,components,app}/`. Status pulled from each plan's header.
>
> **Inventory counts (verified):** 9 service-layer plans · 66 component plans
> (12 atom · 30 molecule · 24 organism) · 25 app plans · architecture.md ·
> foundations-tokens.md = **102 plan docs**.

---

## 1. Unit registry

### 1a. Services (9 domain plans + foundations + architecture)

Status per plan header. Service-layer domains are overwhelmingly **REUSE** (this
is a redesign on a shipped backend); the delta is the EXTRACT-to-`core` moves, the
one schema EXTEND, and a few NEW pure-logic units.

| # | Domain / unit | Plan file | Status | Target package | Key dependencies |
|---|---|---|---|---|---|
| S1 | Identity, access-control & gating spine | `service-layer/01-identity-access-gating.md` | REUSE + 1 EXTEND + EXTRACT | `apps/web/lib` (orchestration) → `@camp404/core` (`hasCampAccess`/`isApproved` bodies, `nextGate` traversal, `rankLevel`/`RANK_ORDER`, `deriveViewerRank`, NEW `requireClearance`) | `@camp404/types` (roles), `@camp404/db` (users/roster reads); backs D3 preview-but-locked |
| S2 | Invite codes (mint / redeem / availability) | `service-layer/02-invites.md` | REUSE + EXTRACT | `@camp404/core` (`generateInviteCode`, `isSyntacticallyValidCode`, `isEnvCodeMatch`) | `@camp404/db/invite-codes`; no schema change |
| S3 | Questionnaire / burner profile / forms / field validation | `service-layer/03-questionnaire-forms.md` | REUSE + EXTRACT | `@camp404/types` (validation engine stays) + `@camp404/core` (`QUESTIONNAIRE` v8 catalogue, `TEAMS`/`DIETARY`/`COUNTRY`, `validateIdNumber`) | `@camp404/db/burner-profile`/`id-documents`/`crypto`; `team_interest` 0–6 fix; COALESCE `completedAt` fix |
| S4 | Broadcasts / notifications inbox / push | `service-layer/04-broadcasts-notifications-push.md` | REUSE + 1 NEW (Toast infra) | `@camp404/ui` (Toast) + `apps/web` (overlays) | `@camp404/db/broadcasts`/`audience`/`push`; AckGate; no schema change |
| S5 | Roster / approvals / captain-promotion (**THE schema change**) | `service-layer/05-roster-approvals-promotion.md` | REUSE + NEW (handshake) + the one schema EXTEND | `@camp404/db` (NEW `captain-promotion.ts` + migration 0012) + `@camp404/core/promotion.ts` (`canSendPromotion`/`canDecidePromotion`/`nextPromotionStatus`/`promotionStepState`) + `@camp404/types/promotion.ts` | migration **0012** `captain_promotion_requests` + `promotion_request_status` enum; `roster.ts` EXTEND add `handle` |
| S6 | Family tree (referral graph) | `service-layer/06-family-tree.md` | REUSE + EXTRACT | `@camp404/core` (`buildTree`/`computeMatchIds`/`subtreeHasMatch`/`countDescendants` + NEW `descendantCountLabel`, **carries cycle guards**) + `@camp404/types/referral.ts` | `@camp404/db/relations` (DELETE dead `getInvitesIssuedBy`/`getRootCodes`); read-only, no schema change |
| S7 | Voice dictation / transcription | `service-layer/07-voice.md` | REUSE | `apps/web` (`/api/voice/transcribe`, Groq Whisper) | `RecorderPanel`; audio never persisted; NEW transcript-review step is presentation; no schema change |
| S8 | MCP connect / OAuth / consent | `service-layer/08-mcp.md` | REUSE + EXTRACT | `@camp404/core/mcp/*` (`mcpAccessError`/`resolveMcpScope`/`canSeeIdDocuments`/scope consts + NEW `buildConsentModel`/`buildGateModel`) | `@camp404/db/mcp`; `users.aiDataConsent` exists; no schema change |
| S9 | Platform / cross-cutting (feedback, media, rate-limit, crypto, test-mode) | `service-layer/09-platform-crosscutting.md` | REUSE + EXTRACT + overlay NEW | `@camp404/core` (`redactPii`/`sanitizeReportText`/`buildFeedbackIssue`, `initialsFrom`, `cropResizeToSquare`, shake detector, rate-limit bucket, `validateIdNumber`) + `@camp404/ui` (Toast, error boundaries) | `@camp404/db/crypto`/`id-documents` (crypto stays in db); GitHub feedback; no schema change |
| — | Package architecture (authoritative root) | `architecture.md` | NEW package `@camp404/core` + REUSE 6 runtime pkgs + the one EXTEND | NEW `@camp404/core`; layering `types ← {db,core} ← ui ← apps` | migration 0012; hybrid-extraction summary; 6-phase build order |
| — | Design-system foundations (tokens + typography) | `foundations-tokens.md` | NEW tokens + EXTEND (codemods) | `@camp404/ui` (`globals.css` `@theme`) + `apps/web` (`next/font`) | NEW status tokens `success`/`warning`/`info` + `--overlay` + radius + `--font-*`/`--text-*`; **gates everything downstream** |

### 1b. Components (66 plans; covers the 49 canonical contract + kept-distinct rows + sub-components)

Status from each plan's `mapsTo`. Package target: `packages/ui` = promoted reusable;
`apps/web` = app-local (cannot live in `@camp404/ui` — `"use client"` / `next/*` /
domain-bound / browser-coupled).

#### Atoms (12)

| Unit | Plan file | Status | Target | Key deps |
|---|---|---|---|---|
| Avatar | `components/atom-avatar.md` | REUSE | `packages/ui/avatar.tsx` | Radix avatar; add `tint` prop |
| Badge | `components/atom-badge.md` | PROMOTE | `packages/ui/badge.tsx` | NEW status tokens (Phase 0); CVA |
| Button | `components/atom-button.md` | REUSE | `packages/ui/button.tsx` | CVA variants |
| Checkbox | `components/atom-checkbox.md` | REUSE | `packages/ui/checkbox.tsx` | Radix checkbox |
| Divider | `components/atom-divider.md` | NEW | `packages/ui/divider.tsx` | `$border`; labelled or-divider |
| IconBadge | `components/atom-iconbadge.md` | PROMOTE | `packages/ui/icon-badge.tsx` | lucide; tone tokens |
| Input | `components/atom-input.md` | REUSE (extend in place) | `packages/ui/input.tsx` | native attrs; mono face |
| Label | `components/atom-label.md` | REUSE | `packages/ui/label.tsx` | required-marker token (finding #4 resolved) |
| ProgressBar | `components/atom-progressbar.md` | PROMOTE | `packages/ui/progress-bar.tsx` | from `wizard.tsx` private fn |
| Slider | `components/atom-slider.md` | REUSE | `packages/ui/slider.tsx` | Radix slider |
| Spinner | `components/atom-spinner.md` | PROMOTE | `packages/ui/spinner.tsx` | lucide `Loader2` + reduced-motion |
| Textarea | `components/atom-textarea.md` | REUSE | `packages/ui/textarea.tsx` | native attrs |

#### Molecules (30)

| Unit | Plan file | Status | Target | Key deps |
|---|---|---|---|---|
| Alert | `components/molecule-alert.md` | PROMOTE | `packages/ui/alert.tsx` | status tokens; folds BlockingNotice/MemberNote/banners |
| AvailabilityHint | `components/molecule-availabilityhint.md` | NEW (app-local) | `apps/web/app/tools/invite/availability-hint.tsx` | Spinner; status tones; invite `Availability` union |
| AvatarUpload | `components/molecule-avatarupload.md` | PROMOTE | `packages/ui/avatar-upload.tsx` | Avatar; crop pipeline (`cropResizeToSquare` core); re-add error retry |
| CaptainLock | `components/molecule-captainlock.md` | PROMOTE | `packages/ui/captain-lock.tsx` | IconBadge; D3 preview-but-locked; console skin |
| Card | `components/molecule-card.md` | REUSE | `packages/ui/card.tsx` | shadcn card family |
| CodeDisplay | `components/molecule-codedisplay.md` | PROMOTE | `packages/ui/code-display.tsx` | folds CodeField/CodeBox/RedactedField; mono |
| Combobox | `components/molecule-combobox.md` | REUSE (extend in place) | `packages/ui/combobox.tsx` | command + popover |
| CompletionHero | `components/molecule-completionhero.md` | NEW (app-local) | `apps/web/app/onboarding/questionnaire/complete/completion-hero.tsx` | IconBadge; required-actions data |
| DateControl | `components/molecule-datecontrol.md` | NEW | `packages/ui/date-control.tsx` | Input `type=date`; ISO emit |
| DetailHeader | `components/molecule-detailheader.md` | PROMOTE | `packages/ui/detail-header.tsx` | round back-button |
| DictatePill | `components/molecule-dictatepill.md` | PROMOTE | `packages/ui/dictate-pill.tsx` | from `dictate-button.tsx`; launches RecorderPanel |
| EmptyState | `components/molecule-emptystate.md` | PROMOTE | `packages/ui/empty-state.tsx` | IconBadge; `variant=inline` = EmptyLog |
| FilterChip | `components/molecule-filterchip.md` | NEW (app-local) | `apps/web/app/captains/camp-management/filter-chip.tsx` | toggle/count/dropdown/warning |
| GhostBack | `components/molecule-ghostback.md` | PROMOTE | `packages/ui/ghost-back.tsx` | chevron-left link; console skin |
| GridTile | `components/molecule-gridtile.md` | PROMOTE | `packages/ui/grid-tile.tsx` | IconBadge + count Badge; drag handle |
| InputField | `components/molecule-inputfield.md` | PROMOTE | `packages/ui/input-field.tsx` | Label + Input + helper/error |
| NavCard | `components/molecule-navcard.md` | PROMOTE | `packages/ui/nav-card.tsx` | IconBadge; folds ToolCard/FormCard; `disabled`/`meta` |
| OAuthButton | `components/molecule-oauthbutton.md` | PROMOTE | `packages/ui/google-button.tsx` | extract `GoogleMark` once; Button-Outline |
| OptionCardGroup | `components/molecule-optioncardgroup.md` | PROMOTE | `packages/ui/option-card-group.tsx` | folds radio/checkbox/chip-grid; `mode`/`layout` |
| QCard | `components/molecule-qcard.md` | NEW | `packages/ui/qcard.tsx` | meta chips; 2 consumers (S25/S22) |
| QueueCard | `components/molecule-queuecard.md` | NEW (app-local) | `apps/web/app/onboarding/questionnaire/complete/queue-card.tsx` | Card; complete/next-up/locked/expired |
| RecorderPanel | `components/molecule-recorderpanel.md` | PROMOTE/EXTEND (app-local) | `apps/web/components/voice/recorder-panel.tsx` | Waveform + `useVoiceRecorder`; NEW TranscriptResult step |
| SectionHeader | `components/molecule-sectionheader.md` | PROMOTE | `packages/ui/section-header.tsx` | label + action/count |
| SegmentedControl | `components/molecule-segmentedcontrol.md` | PROMOTE | `packages/ui/segmented-control.tsx` | roving radiogroup; emits string value |
| Select | `components/molecule-select.md` | REUSE (extend in place) | `packages/ui/select.tsx` | Radix select |
| StatTile | `components/molecule-stattile.md` | NEW (app-local) | `apps/web/app/captains/camp-management/stat-tile.tsx` | mono number; derived counts |
| Stepper | `components/molecule-stepper.md` | NEW (app-local) | `apps/web/app/tools/invite/stepper.tsx` | −/+ over number Input; clamp [1,100] |
| SwitchField | `components/molecule-switchfield.md` | NEW | `packages/ui/switch.tsx` | no Switch primitive exists; persists string option value |
| Toast | `components/molecule-toast.md` | NEW | `packages/ui/toast.tsx` | no toast/sonner; status tokens; emitter (S4/S9) |
| TopChrome | `components/molecule-topchrome.md` | PROMOTE | `packages/ui/top-chrome.tsx` | from `home-header.tsx`; IconBadge + Badge + Avatar |

#### Organisms (24)

| Unit | Plan file | Status | Target | Key deps |
|---|---|---|---|---|
| AcknowledgementGate | `components/organism-acknowledgementgate.md` | REUSE/EXTEND (app-local) | `apps/web` | self-fetches `/api/notifications/*`; `next/navigation` → cannot promote |
| AnnouncementsManager | `components/organism-announcementsmanager.md` | REUSE/EXTEND (app-local) | `apps/web/app/captains/announcements/announcements-manager.tsx` | InputField + LongTextField + DictatePill + Select + Alert + CaptainLock |
| AssignCaptainDialog | `components/organism-assigncaptaindialog.md` | NEW (app-local) | `apps/web/app/captains/camp-management/assign-captain-dialog.tsx` | `@camp404/ui/dialog`; OptInStepTracker (NEW sub); inserts `captain_promotion_requests` (migration 0012) |
| AuthShell | `components/organism-authshell.md` | PROMOTE (keep app-local) | `apps/web/components/auth-shell.tsx` | Card; back + footer |
| BlockingTopBar | `components/organism-blockingtopbar.md` | NEW (app-local) | `apps/web/components/questionnaire/blocking-top-bar.tsx` | Badge (RequiredChip) + ProgressBar + Sign-out |
| CustomizeMode | `components/organism-customizemode.md` | NEW (app-local) | `apps/web/app/home/customize-mode.tsx` (+ DraggableTileRow/DropSlot/PinnedGroup/NewGroupAffordance subs) | client-side persistence only (D4, no new table) |
| EnablePush | `components/organism-enablepush.md` | REUSE (app-local) | `apps/web/components/push/enable-push.tsx` | FCM SDK + `/api/push/tokens`; browser-coupled → cannot promote |
| ErrorBoundary | `components/organism-errorboundary.md` | REUSE + EXTEND (app-local) | `apps/web/{error,global-error,not-found}.tsx` | Next file-convention; mono `error.digest` chip |
| FamilyTree | `components/organism-familytree.md` | NEW (app-local) | `apps/web/app/family-tree/family-tree.tsx` | core tree-build (cycle guards); TreeRow distinct; CodeDisplay |
| InviteForm | `components/organism-inviteform.md` | REUSE/EXTEND (app-local) | `apps/web/app/tools/invite/invite-form.tsx` | InputField + Stepper + Checkbox + CodeDisplay + AvailabilityHint + `createInviteAction` |
| LandingHero | `components/organism-landinghero.md` | REUSE (app-local) | `apps/web/app/landing-hero.tsx` | local Glitch404; CRT/scanlines |
| LongTextField | `components/organism-longtextfield.md` | REUSE/EXTEND (app-local) | `apps/web/components/questionnaire/question.tsx` (sub-renderer) | Textarea + DictatePill → RecorderPanel |
| MCPConsent | `components/organism-mcpconsent.md` | REUSE/EXTEND (app-local + raw server HTML) | `apps/web/app/mcp/connect/*` + `/api/mcp/oauth/authorize` | Button + IconBadge + CodeDisplay; 403 gate |
| MemberProfile | `components/organism-memberprofile.md` | NEW (app-local) | `apps/web/app/captains/camp-management/member-profile.tsx` | Avatar + Badge + CodeDisplay redacted; Approve/Reject/Assign; decrypted ID |
| NotificationRow | `components/organism-notificationrow.md` | NEW (app-local) | `apps/web/app/notifications/notification-row.tsx` | IconBadge + New Badge; kept distinct |
| QuestionField | `components/organism-questionfield.md` | REUSE (extend in place, app-local) | `apps/web/components/questionnaire/question.tsx` | 10-kind switch over the promoted controls; `@camp404/types` Question |
| QuestionnaireBlock | `components/organism-questionnaireblock.md` | NEW (app overlay) | `apps/web/app/questionnaire-block.tsx` | IconBadge + QCard; reads `required_actions`; S22⟷S25 twin |
| QuestionnaireWizard | `components/organism-questionnairewizard.md` | REUSE (light EXTEND, app-local) | `apps/web/components/questionnaire/wizard.tsx` | ProgressBar + QuestionField + footer; 1:1 across callers |
| RankGroupCard | `components/organism-rankgroupcard.md` | NEW (app-local) | `apps/web/app/home/rank-group-card.tsx` | IconBadge + GridTile grid; locked → CaptainLock + zero data |
| RejectConfirmDialog | `components/organism-rejectconfirmdialog.md` | NEW (app-local) | `apps/web/app/captains/camp-management/reject-confirm-dialog.tsx` | `@camp404/ui/dialog`; destructive |
| ReportBugDialog | `components/organism-reportbugdialog.md` | REUSE/EXTEND (app-local) | `apps/web/components/feedback/report-bug-dialog.tsx` | SegmentedControl + Textarea + DictatePill + Checkbox + Alert; screenshot DROPPED |
| RosterRow | `components/organism-rosterrow.md` | NEW (app-local) | `apps/web/app/captains/camp-management/*` (RosterTable/RosterList) | StatusBar + Avatar + Badge; responsive pair; kept distinct |
| RosterToolbar | `components/organism-rostertoolbar.md` | NEW (app-local) | `apps/web/app/captains/camp-management/roster-toolbar.tsx` | search Input + FilterChip row + team dropdown |
| SignInForm / SignUpForm | `components/organism-signinform-signupform.md` | REUSE/EXTEND (app-local) | `apps/web/app/auth/{sign-in,sign-up}-form.tsx` | InputField + Button + Divider + OAuthButton + Alert |

> **49 → 66 reconciliation.** The component-library's 49 canonical entries expand
> to 66 plan files because three library entries each cover multiple distinct
> build units that the library deliberately keeps separate: **(a)** the
> `SignInForm / SignUpForm` library entry is one plan covering two organisms (net
> 0 vs library); **(b)** several library entries name NEW sub-components built in
> the same plan (CustomizeMode → DraggableTileRow/DropSlot/PinnedGroup/
> NewGroupAffordance; AssignCaptainDialog → OptInStepTracker; FamilyTree →
> TreeRow) — these get one plan each, not separate files; **(c)** library entries
> that fold candidates (NavCard←ToolCard/FormCard, CodeDisplay←CodeField/CodeBox/
> RedactedField, OptionCardGroup←4 candidates) stay one plan each. The net 17-plan
> surplus is the row/sub-renderer/organism granularity (QuestionField,
> LongTextField, RosterRow, NotificationRow, RankGroupCard, MemberProfile,
> RosterToolbar, the two dialogs, etc.) that the library lists as organisms but the
> contract's "49" headline counts at a coarser grain. **Every one of the 49
> canonical components has a plan.**

### 1c. Surfaces (25 app plans, 26 logical surfaces, 30 routes)

| # | Surface | Route(s) | Plan file | Status | Target app |
|---|---|---|---|---|---|
| 01 | Landing (glitch 404) | `/` (unauth) | `app/01-landing.md` | REUSE | `apps/web/app/landing-hero.tsx` |
| 02 | Auth (sign-in / sign-up) | `/auth/*` | `app/02-auth.md` | REUSE/EXTEND | `apps/web/app/auth/*` |
| 03 | Invite gate | `/signup/required` | `app/03-invite-gate.md` | REUSE/EXTEND | `apps/web/app/signup/required` |
| 04 | Onboarding wizard | `/onboarding/questionnaire` | `app/04-onboarding-wizard.md` | REUSE/EXTEND | `apps/web/app/onboarding/*` |
| 05 | Approval gate | `/pending-approval` | `app/05-approval-gate.md` | REUSE/EXTEND | `apps/web/app/pending-approval` |
| 06 | Home (control panel) | `/` (authed) | `app/06-home.md` | EXTEND spine (REUSE) + REPLACE render + DELETE quadrant | `apps/web/app/page.tsx` + NEW `apps/web/app/home/*` |
| 07 | Profile view | `/profile` | `app/07-profile-view.md` | REUSE/EXTEND | `apps/web/app/profile` |
| 08 | Profile edit + delete | `/profile/edit` | `app/08-profile-edit.md` | REUSE/EXTEND | `apps/web/app/profile/edit` |
| 09 | Notifications inbox | `/notifications` | `app/09-notifications.md` | REUSE/EXTEND + NEW NotificationRow | `apps/web/app/notifications` |
| 10 | Tools hub | `/tools` | `app/10-tools-hub.md` | REUSE/EXTEND | `apps/web/app/tools` |
| 11 | Invite tool | `/tools/invite` | `app/11-invite-tool.md` | REUSE/EXTEND | `apps/web/app/tools/invite` |
| 12 | My forms (list + replay) | `/tools/forms`, `/tools/forms/[key]` | `app/12-my-forms.md` | REUSE/EXTEND | `apps/web/app/tools/forms` |
| 13 | Family tree | `/family-tree` | `app/13-family-tree.md` | NEW organism + EXTRACT core | `apps/web/app/family-tree` |
| 14 | Captain roster & member detail | `/captains/camp-management` | `app/14-roster.md` | REUSE/EXTEND + NEW (rows/profile/dialogs) + DELETE bespoke overlay + migration 0012 | `apps/web/app/captains/camp-management` |
| 15 | Captain announcements | `/captains/announcements` | `app/15-announcements.md` | REUSE/EXTEND | `apps/web/app/captains/announcements` |
| 16 | Captain tools hub | `/captains/tools` | `app/16-captain-tools.md` | REUSE/EXTEND | `apps/web/app/captains/tools` |
| 17 | MCP connect / consent | `/mcp/connect`, `GET/POST /api/mcp/oauth/authorize` | `app/17-mcp-connect.md` | REUSE/EXTEND | `apps/web/app/mcp/connect` + `/api/mcp/oauth/authorize` |
| 20 | Field-kind renderer (10 kinds) | n/a (shared sheet) | `app/20-field-renderer.md` | REUSE/EXTEND | `apps/web/components/questionnaire/question.tsx` |
| 21 | Voice dictation (RecorderPanel) | n/a (embedded) | `app/21-voice.md` | REUSE/EXTEND | `apps/web/components/voice` |
| 22 | Avatar upload (shared) | n/a (embedded) | `app/22-avatar-upload.md` | PROMOTE | `packages/ui/avatar-upload.tsx` |
| 23 | Questionnaire gate (interstitial) | `/onboarding/questionnaire` (intro) | `app/23-questionnaire-gate.md` | REUSE/EXTEND | `apps/web/app/onboarding/questionnaire` |
| 24 | Questionnaire runner (blocking) | `/onboarding/questionnaire` (required) | `app/24-questionnaire-runner.md` | REUSE/EXTEND + NEW BlockingTopBar | `apps/web/components/questionnaire` |
| 25 | Global overlays (app-wide) | n/a (root layout + file-convention) | `app/25-global-overlays.md` | EXTEND + 2 NEW (QuestionnaireBlock, ToastProvider) | `apps/web/app/layout.tsx` + boundaries |
| 26 | Enable push | n/a (mounted on home) | `app/26-enable-push.md` | REUSE | `apps/web/components/push/enable-push.tsx` |
| 27 | Questionnaire complete & queue | `/onboarding/questionnaire/complete` (proposed) | `app/27-questionnaire-complete.md` | NEW route + NEW (CompletionHero/QueueCard) | `apps/web/app/onboarding/questionnaire/complete` |

> Surfaces 18–19 intentionally do not exist (Iteration-A roster DROPPED per D2;
> captain-tools folded into brief 16). Every routed surface in the README index
> (01–17, 20–27) has exactly one app plan.

---

## 2. Coverage scorecard

### 2a. Component coverage — 49 canonical / 66 plans

- **Component-library contract:** 49 canonical components (12 atom + ~14 molecule
  + ~23 organism after the 57→49 dedup merge map).
- **Plans present:** 66 (12 atom · 30 molecule · 24 organism).
- **Result:** ✅ **49 / 49 covered** (every canonical entry has a plan; the surplus
  17 plans are the kept-distinct rows + named sub-components the library lists at a
  coarser grain — reconciliation in §1b). **The task brief's "66 expected" matches
  the 66 plan files exactly.**

Status distribution across the 66 component plans:
- **REUSE:** Avatar, Button, Checkbox, Input, Label, Slider, Textarea, Card,
  Combobox, Select, + app-local REUSE/EXTEND organisms (AcknowledgementGate,
  AnnouncementsManager, AuthShell, EnablePush, ErrorBoundary, InviteForm,
  LandingHero, LongTextField, MCPConsent, QuestionField, QuestionnaireWizard,
  ReportBugDialog, SignIn/SignUpForm).
- **PROMOTE → `@camp404/ui`:** Badge, IconBadge, ProgressBar, Spinner, Alert,
  AvatarUpload, CaptainLock, CodeDisplay, DetailHeader, DictatePill, EmptyState,
  GhostBack, GridTile, InputField, NavCard, OAuthButton, OptionCardGroup,
  SectionHeader, SegmentedControl, TopChrome, RecorderPanel (app-local PROMOTE),
  AuthShell (formalise app-local).
- **NEW:** Divider, DateControl, QCard, SwitchField, Toast (→ `@camp404/ui`);
  AvailabilityHint, CompletionHero, FilterChip, QueueCard, StatTile, Stepper,
  AssignCaptainDialog, BlockingTopBar, CustomizeMode, FamilyTree, MemberProfile,
  NotificationRow, QuestionnaireBlock, RankGroupCard, RejectConfirmDialog,
  RosterRow, RosterToolbar (→ `apps/web`).

### 2b. Surface coverage

- **Routed surfaces (README index):** 25 briefs / 26 logical surfaces / 30 routes.
- **App plans present:** 25 (01–17, 20–27).
- **Result:** ✅ **25 / 25 covered** — every brief has exactly one app plan; both
  `[key]`/`[path]` dynamic routes are owned by their parent plan (12-my-forms,
  02-auth). The one proposed-NEW route (`/onboarding/questionnaire/complete`, S27)
  has its own plan + NEW route note.

### 2c. Service-domain coverage

- **Domains expected:** 9 (identity/gating, invites, questionnaire, broadcasts,
  roster+promotion, family-tree, voice, MCP, platform) + foundations + architecture.
- **Plans present:** 9 service-layer + `foundations-tokens.md` + `architecture.md`.
- **Result:** ✅ **9 / 9 covered**; foundations + architecture present; the one
  schema change (migration **0012** `captain_promotion_requests` + enum) is owned
  by domain 05 and the architecture root, and is consistently cross-referenced
  ("the only schema change") by all 9 domain plans.

### 2d. DELETE list — dispositioned?

| DELETE-list item | Where dispositioned | Status |
|---|---|---|
| `control-panel.tsx` | `app/06-home.md` ("DEAD, on the DELETE list"; `rankLevel`/`RANK_ORDER` EXTRACT to `core` before deletion) | ✅ |
| `control-grid.tsx` | `app/06-home.md` (same DEAD block) | ✅ |
| `quadrant-nav.tsx` | `app/06-home.md` (same DEAD block) | ✅ |
| `DictateButton` (`dictate-button.tsx`) | `components/molecule-dictatepill.md` ("DROPPED dead orphan … DELETE `dictate-button.tsx`") | ✅ |
| `Tabs` | `components/molecule-segmentedcontrol.md` + `component-library.md` ("NO surviving consumer — do NOT build Tabs"; S17 Iteration A dropped per D2) | ✅ (never built) |
| Terminal read-only panel (`MemberReadOnly`/`RedactedID`/`LockedActions`) | `app/14-roster.md` ("DELETE the bespoke overlay + dropped `MemberReadOnly`/`RedactedID`/`LockedActions`") + `components/molecule-captainlock.md` (replaced by CaptainLock + CodeDisplay redacted) | ✅ |
| Screenshot-attach checkbox | `app/25-global-overlays.md` ("Attach a screenshot checkbox stays DROPPED … nothing to remove — already absent") | ✅ (already absent) |

All 7 DELETE-list items dispositioned. Additional DELETEs the plans add (not on the
brief's list, consistent with architecture): dead `db/relations` exports
`getInvitesIssuedBy` / `getRootCodes` (plan 06 / architecture §db).

---

## 3. Gaps & inconsistencies

### 3a. Layering — clean

- **`@camp404/core` never imports `db`/`next`/React/`server-only`:** architecture
  §layering states the hard rule; every EXTRACT target in the hybrid-extraction
  summary is pure (invite-words, id-validation, github-feedback, initials, tree
  builders, promotion guards, mcp model builders). ✅ No violation found.
- **`@camp404/ui` never imports `db`/`next`:** every organism that is `"use client"`
  / `next/*`-coupled / domain-bound (AcknowledgementGate, EnablePush, FamilyTree,
  InviteForm, LongTextField, MCPConsent, QuestionField, QuestionnaireBlock,
  QuestionnaireWizard, ReportBugDialog, the dialogs, rows, RankGroupCard,
  CustomizeMode, AnnouncementsManager, SignIn/SignUpForm) is **kept app-local**
  with the layering rule cited explicitly in its plan header as the reason. ✅
- **`db` never imports `core`:** crypto/id-documents/maintenance stay in `db`
  (schema-bound) per architecture §db; pure helpers that could move to `core` are
  consciously left in `db` where schema-coupled. ✅
- **`@camp404/db` is the sole owner of the schema change:** migration 0012 lives in
  `db`; the handshake guards (`canSendPromotion` etc.) live in `core`; the view
  shape in `types`. Clean separation. ✅

### 3b. NEW-vs-exists / REUSE-vs-absent — consistent

Spot-checked every NEW and REUSE claim against the plan's own "current state"
verification (each plan greps the live tree):
- **NEW claims verified absent:** Badge (no `badge.tsx`), Divider, DateControl
  (inline `<Input type=date>` today), QCard, SwitchField (no Switch primitive),
  Toast (no toast/sonner), AvailabilityHint, CompletionHero, FilterChip, QueueCard,
  StatTile, Stepper, AssignCaptainDialog, BlockingTopBar, CustomizeMode,
  MemberProfile, NotificationRow, QuestionnaireBlock, RankGroupCard,
  RejectConfirmDialog, RosterRow, RosterToolbar, FamilyTree (organism). All
  confirmed not-present-today by their plans. ✅
- **REUSE claims verified present:** avatar/button/checkbox/input/label/slider/
  textarea/card/combobox/select all exist in `packages/ui` (matches the package's
  verified export list in architecture §ui). ✅
- **No "NEW for something that exists" or "REUSE for something absent" found.** ✅

### 3c. Component-referenced-but-no-plan — none found

Every component named in a surface/organism composition resolves to a plan:
- Surface organisms reference atoms/molecules (Badge, IconBadge, Alert,
  SegmentedControl, OptionCardGroup, CodeDisplay, CaptainLock, GridTile, NavCard,
  EmptyState, etc.) — all have plans. ✅
- Named sub-components (OptInStepTracker, DraggableTileRow, DropSlot, PinnedGroup,
  NewGroupAffordance, TreeRow, GoogleMark, Glitch404, Waveform) are covered **inside**
  their parent organism's plan (AssignCaptainDialog, CustomizeMode, FamilyTree,
  OAuthButton, LandingHero, RecorderPanel). These are intentionally not separate
  plan files — flagged as **polish**, not a gap (a future reader scanning for a
  standalone `OptInStepTracker` plan won't find one; it lives in the dialog plan).

### 3d. Duplicate / should-have-merged — none

The merge map (57→49) is honoured: no plan re-introduces a candidate the library
folded (no separate RankPill/CodeField/CodeBox/RedactedField/ToolCard/FormCard/
inline-alert/BlockingNotice plans). Rows kept deliberately distinct (RosterRow,
TreeRow, NotificationRow, DraggableTileRow) per the contract's explicit
"three+ rows stay distinct" note — correctly **not** merged. ✅

### 3e. Minor inconsistencies (polish-level, non-blocking)

1. **Status-token prerequisite is a soft ordering dep, not encoded as a blocker.**
   Badge / Alert / Toast / StatTile / FilterChip / AvailabilityHint all need the
   NEW `success`/`warning`/`info` tokens (foundations Phase 0) before they can
   ship CI-green. Each plan cites it, but a reader building a single Badge plan in
   isolation could strand on red CI if foundations hasn't landed. **Polish** — the
   build-sequence (README + architecture) covers it; worth a one-line "prereq:
   Phase 0" banner in each token-dependent component plan.
2. **`RecorderPanel` / `AvatarUpload` home ambiguity.** `component-library.md`
   says RecorderPanel "PROMOTE/extend `apps/web/components/voice/recorder-panel.tsx`"
   (stays app-local) while AvatarUpload "PROMOTE → shared `apps/web/components/
   profile/avatar-upload.tsx`" — yet the AvatarUpload **plan** targets
   `packages/ui/avatar-upload.tsx`. Both are defensible (AvatarUpload's crop is
   DOM-pure; RecorderPanel binds `useVoiceRecorder`), and the plans pick the
   correct home, but the library text and the plan disagree on AvatarUpload's
   package for one line. **Polish** — the plan (package `ui`) is the more recent,
   layering-consistent choice.
3. **S27 route is "proposed."** `/onboarding/questionnaire/complete` is a NEW route
   gated on a product confirmation (the questionnaire-trio scope expansion, README
   "cross-phase confirm-first"). The plan exists and is internally consistent, but
   the route's existence depends on an unresolved product decision (open-questions).
   **Polish/confirm-first**, not a planning gap.

---

## 4. Verdict

| Severity | Count | Items |
|---|---|---|
| **Blockers** | **0** | none — every contract is covered, layering is clean, the one schema change is consistently owned, no NEW/REUSE contradiction, no missing plan. |
| **Gaps** | **0** | every one of the 49 canonical components, 25 routed surfaces, and 9 service domains has a plan; all 7 DELETE-list items are dispositioned; no component is referenced without a plan. |
| **Polish** | **3** | (1) status-token Phase-0 prereq not banner-flagged per token-dependent component plan; (2) AvatarUpload package-home line disagrees between `component-library.md` (app) and its plan (`packages/ui`) — plan is correct; (3) S27 `/…/complete` route is product-confirm-gated. |

**Overall:** the implementation-planning set is **complete and internally
consistent**. 102 plan docs cover 49/49 components, 25/25 surfaces, 9/9 service
domains, foundations, and architecture. The hybrid `@camp404/core` boundary and the
`types ← {db,core} ← ui ← apps` layering hold across every plan; the single schema
change (migration 0012) is uniformly attributed; the DELETE list is fully
dispositioned. No blockers, no gaps — only 3 polish items, none of which strands an
independently CI-green change (MEMORY: green-CI-is-done).
