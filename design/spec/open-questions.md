# Camp 404 redesign — open questions & build reconciliations (the punch-list)

**What this is.** Every "Open questions / build reconciliations" item across the 25 surface briefs,
plus the blocker/gap/polish findings from [`coverage-audit.md`](coverage-audit.md), **deduped** and
grouped by theme. This is the punch-list to work through before/during build.

**Legend.**
- **Owner** — who decides: **product** (a content/scope/policy call), **eng** (an implementation
  call), **design** (a visual/interaction call). Some need two; the lead owner is listed first.
- **Severity** — **blocker** (contradicts a LOCKED decision or ships wrong) · **high** (must decide
  before the dependent surface is built) · **med** (decide before ship) · **low** (polish / forward
  note / known-issue carry).
- **Source** — the brief(s) or audit finding the item came from. Items merged from multiple briefs
  list all sources.

**Headline:** **0 blockers.** The audit confirms nothing ships demonstrably wrong against a locked
decision. The work is concentrated in content decisions (questionnaire trio + onboarding catalogue)
and a cluster of small token/copy/privacy reconciliations.

**Totals:** 136 items — 0 blocker · 10 high · 52 med · 74 low. Grouped into 5 themes below
(A content · B token/component · C privacy · D scope · E infra/source-bugs). **5 spec-internal
items were resolved directly after the audit** (B3, B4, D1, D2, E33 — see ✅ markers); the
remaining items are genuine product/eng/design calls for build.

---

## A. Content decisions (product owns the camp's words & question set)

| # | Item | Owner | Severity | Source |
|---|---|---|---|---|
| A1 | **Hardware-competency onboarding page.** Catalogue `competency.hardware` (scale) exists but there is **no OB board step** (boards show 11 steps, catalogue has 12 pages). Keep it as its own page, merge cooking+hardware onto one page, or drop the question? Must survive in some form; drives "Step N of M". *(Recommend: keep, confirm placement.)* | product | high | 04 OQ1; 20; 23 OQ3; 24 OQ7; decisions.md; audit watch-item |
| A2 | **Questionnaire trio scope expansion.** S25→S26→S27 imply a multi-questionnaire sequential queue (Safety / Dietary / Agreements) beyond the single burner-profile. Expressible via existing `required_actions`, **no schema change**, but it is a confirmed scope expansion. Ships now (multiple chained blocking activations) or only the burner-profile gate day-one? | product | high | 23 OQ2; 24 OQ1; 27 OQ2; decisions.md; flows.md |
| A3 | **Questionnaire keys + seed.** Confirm `questionnaireKey` values, `title` strings, and whether Safety/Dietary/Agreements are seeded as permanent "always open" or captain-triggered activations. The queue display depends on this. | product | high | 27 OQ2 |
| A4 | **Sequential vs parallel unlock.** Strict sequential (complete row N before N+1 unlocks) or parallel-with-one-highlighted (all pending, UI highlights "Start next")? Drives the locked-state implementation (Agreements drawn at `opacity:0.55`). | product, eng | high | 27 OQ4; 24 OQ1; db-impact.json |
| A5 | **`ACTION_ROUTES` coverage.** Today only `burner_profile` maps to a route; dietary/driver/agreements activations stay `pending` but can't gate until bespoke runner routes exist (they reuse this runner chrome). In scope for this redesign or deferred? | product, eng | med | 24 OQ2 |
| A6 | **Burner-profile → next-questionnaire moment.** The burner-profile wizard redirects to `/` on submit; if other questionnaires are also blocking the spine immediately re-routes to the next gate with no "here's what's next" moment. Redirect the wizard to S27 instead, to make onboarding continuous? | product | med | 27 OQ6 |
| A7 | **Non-blocking questionnaire display in S27 queue.** Show non-blocking questionnaires in the queue, or only blocking ones? *(Recommend: only blocking; non-blocking lives in My forms.)* | product | low | 27 OQ8 |
| A8 | **Dynamic vs static QCard copy.** For the initial single burner-profile gate, static strings ("Safety & logistics", "8 questions", "~3 min") are fine; once parameterised by the active `required_action`, copy must derive from the activation title/catalogue/time-estimate. | product, eng | low | 23 OQ5 |
| A9 | **Onboarding copy reconciliation.** Confirm the set of board-vs-catalogue copy edits (subtitles, intro body, dietary prompts) with the data owner before editing `questionnaire.ts` strings. | product | med | 04 OQ6 |
| A10 | **Invite-tool final copy.** Supply final marketing copy conveying named slug + configurable use-count + captain pre-approve (placeholder copy in the brief). | product | med | 10 OQ1; 11 OQ7 |
| A11 | **CTA label copy-changeability.** "Are you lost?" is board-canonical; no mechanism exists to vary it without a code change. Flag if seasonal/event copy is wanted. | product | low | 01 OQ3 |
| A12 | **"N more required" plural copy.** Board shows "1 more required before you're unlocked"; confirm the wording for N = 2 and N = 3. | product | low | 27 OQ7 |
| A13 | **Multi-select diff display in ChangeLog.** Option labels joined with ", "; order sorted before compare so reordering is invisible. Confirm this is the desired display for multi-select diffs. | product | low | 12 OQ5 |
| A14 | **Descendant-count semantics.** Family-tree pill counts ALL descendants (total subtree), not direct children; copy "N descendants" is ambiguous. Confirm "total subtree" is intended (it is, in live code). | product | low | 13 OQ3 |
| A15 | **Relative-time formatting.** Board uses "Just now / 2d ago"; live code uses date-only. Confirm relative time is the target (adds a `date-fns` dependency). | product, eng | low | 09 OQ1 |
| A16 | **Notifications row deep-link.** `notification_deliveries` carries `refType`/`refId` but the inbox renders no row tap-action. Deep-link to the referenced surface deferred or permanently out of scope? | product | low | 09 OQ5 |

---

## B. Token & component reconciliations (design + eng; mostly cosmetic, batchable)

| # | Item | Owner | Severity | Source |
|---|---|---|---|---|
| B1 | **`team_interest` range drift.** OB Step 06 draws a 7-segment 0–6 scale; catalogue is `slider` min:0 max:5. A stored 6 fails `validateResponses`. Reconcile **one constant** in `questionnaire.ts` (recommend correct the board to 0–5). | eng, design | high | 04 OQ2; 20; 24 OQ8; db-impact.json; audit watch-item |
| B2 | **Lock the NEW status-token OKLCH values.** `success`/`warning`/`info` are used pervasively (Badge/Alert/StatTile/FilterChip/Toast/AvailabilityHint) but still "proposed — tune for contrast". Lock the values (contrast-check vs `--color-background`) before any Badge/Alert/Toast build starts. | design, eng | high | audit finding #7; 11 OQ6; 24 OQ5; 25 |
| B3 | **✅ RESOLVED (`design-tokens.md` §4 item 29 → `$primary`) — Required-marker `*` colour.** Drawn `$destructive` on boards; two briefs say reconcile to `$primary` per live code; `design-tokens.md` §4 has **no entry** assigning a target. Add the reconciliation line ($primary, overriding boards) or escalate as genuinely undecided. | design | high | audit finding #4; 20; 24 OQ5 |
| B4 | **✅ RESOLVED (unified to `IconBadge`; false claim removed) — `IconChip` → `IconBadge` naming.** Briefs (10, 16) name `IconChip` and 16 wrongly claims "no equivalent exists in `@camp404/ui`"; the library defines `IconBadge` as canonical. Standardise on `IconBadge`; delete the false claim. | eng, design | med | audit finding #5; 10 OQ3 |
| B5 | **`NavCard` vs `ToolCard` naming + `disabled` prop.** S13/S19 use a structurally identical card; live code has two inline compositions. Confirm the shared name (`NavCard` recommended), its package home, and spec the `disabled` prop (needed for the non-captain locked view) at the same time. | eng | med | 10 OQ2 |
| B6 | **Token: captain colour identity.** `$accent` (electric blue) is the chosen captain/match colour (replaces amber) on tree + announcements. Confirm `$accent` is the right semantic for "captain" everywhere vs a dedicated status token; express CaptainPill fill as `$accent / ~15%`, not raw `#00dcff26`. | design | med | 13 OQ4; 14 OQ7 |
| B7 | **Approval-gate pending badge token.** Live code uses amber (`bg-amber-500/15`); board specifies cyan (`$accent` / `#00dcff26`). Board is canonical — replace amber with `bg-accent/15`. Confirm `$accent` resolves to the cyan family. | design | med | 05 |
| B8 | **RankPill token.** `#ff008c2e` raw hex tint → formalise as a semantic token (e.g. `$rank-captain-bg`). | design | med | 07 OQ1; 14 |
| B9 | **Roster INCOMPLETE numeral token.** Mobile uses `$accent`; terminal uses `$primary`/amber-warning intent. Reconcile to a single status token. | design | med | 14 OQ7 |
| B10 | **Runner raw-hex → alpha utilities.** `#f83e5a1a` / `#ff008c1a` → `--color-destructive` / `--color-primary` alpha utilities (+ the new status tokens). Cosmetic, batchable across surfaces. | eng, design | low | 24 OQ5 |
| B11 | **Toast token.** Board uses `$popover`/`$accent`; reconcile to the new status tokens rather than hard-coding success-green / `$accent`. | design | low | 25 |
| B12 | **Glitch colour tokenisation.** Hard-coded `rgba` magenta/cyan/scanbeam diverge from the OKLCH `@theme`; won't update if the palette shifts. Acceptable as intentional art — document as a maintenance caveat. | design | low | 01 OQ4 |
| B13 | **Glyph font face.** Glitch404 glyph uses a system-monospace stack, not JetBrains Mono. Confirm intentional for the oversized decorative art vs switching to the brand mono face. | design | low | 01 OQ2 |
| B14 | **`DictatePill` extraction + one shape.** Codify the pill as the shared dictation trigger across all `long_text` hosts (S05, OB 03/04, announcements) + the bug dialog; wire to `RecorderPanel`; confirm the pill replaces the live outline button. | eng, design | med | 20; 21 OQ2 |
| B15 | **`QCard` extraction.** The S25 gate QCard is structurally identical to the S22 overlay QCard. Extract as a shared component (`title`, `questionCount`, `estimatedMinutes`) if trio-style gates become common. | eng | low | 23 OQ4 |
| B16 | **`QueueCard` sub-component spec.** S27 queue cards need a defined layout (title, status indicator done/next-up/locked, optional due date, tappable next-up). Spec before build. | design, eng | med | 27 OQ3 |
| B17 | **`GoogleMark` extraction.** Identical inline SVG duplicated in sign-in/sign-up forms; extract to a shared component. Low risk, no behaviour change. | eng | low | 02 OQ1 |
| B18 | **EmptyState component reuse.** Announcements draws plain muted text for empties; confirm whether to adopt the canvas `EmptyState` component or keep inline copy. | design | low | 15 OQ7 |
| B19 | **Toast infrastructure (new build).** No toast/sonner primitive in `@camp404/ui`. Confirm sonner vs bespoke, the status-token set, default timeout, and which mutations emit toasts. | eng, design | med | 25 |
| B20 | **Progress copy wording.** "Question N of N" (board) vs "Step N of M" (live). Adopt board wording; confirm no analytics depends on the live string. Also confirm `Math.round((current/total)*100)` for the `NN%` label. | eng | low | 24 OQ3; 04 OQ7 |
| B21 | **Feed icon.** `inbox` (board) or `Bell` (code) for the feed presentation? Pick one. | design | low | 15 OQ1 |
| B22 | **Layout-width normalisation.** Several surfaces drift wider than the `max-w-lg` shell: notifications (`max-w-2xl`), invite-tool (`max-w-xl`), announcements (`max-w-3xl`). Reconcile to the standard mobile-first column unless a wider view is a deliberate product call. Family-tree is the documented wide-shell exception. | design | med | 09 OQ2; 11 OQ5; 15 OQ2 |
| B23 | **`prefers-reduced-motion`.** No motion-reduction fallback for the landing glitch animations (01) or the voice waveform/spinner (21). On a sun/dust phone this matters. Confirm deliberate (the glitch IS the brand) or add a reduced-motion variant. | design | low | 01 OQ1; 21 OQ6 |
| B24 | **TranscriptResult: inline vs separate card; edit affordance.** Does the recorder state ring disappear when transcript-review opens (recommend yes), and is the transcript a read-only `<div>` or an editable `<Textarea>` (recommend inline-editable for noisy environments)? | design | med | 21 OQ1; 21 OQ7 |
| B25 | **Remove-button position on AvatarUpload.** Board uses `{none}`/absolute layout for the 28×28 destructive remove button but specifies no pixel offsets (overlap vs inset). Confirm at component build. | design | low | 22 OQ3 |
| B26 | **OB Step 01 "Upload a photo" link style.** `$accent` text-link (OB board) vs Button-Outline (S11). Current resolution: Button-Outline per S11 canonical — confirm a lighter onboarding treatment isn't intended. | design | low | 22 OQ2 |
| B27 | **Image affordance unification.** Ship the board's rectangular dropzone (10MB/JPG-PNG helper, Uploading, Thumb-with-remove) for generic `image` fields reusing AvatarUpload's pipeline, while `profile.image` keeps the circular crop. Add the client-side 10MB cap the boards imply but code lacks? | design, eng | med | 20 |
| B28 | **Mobile composition of family-tree controls.** Board puts Controls in a row below Search; live groups them in one row. At ≤430px the three controls may need to stack. Confirm preferred composition. | design | low | 13 OQ6 |
| B29 | **Avatar size.** Profile-view board = 96px, live code = 128px. Align to 96px per board. | design | low | 07 OQ2 |
| B30 | **In-card alert vs under-field error.** Adopt both (card-level alert + field-level message) per the board, or just one? Recommend both. | design | low | 24 OQ4 |

---

## C. Privacy / PII (product + data owner)

| # | Item | Owner | Severity | Source |
|---|---|---|---|---|
| C1 | **Member email in plaintext on the roster.** The roster detail renders the auth email unredacted to any captain. Decide: redact/partial-mask, gate behind an explicit reveal, or accept as captain-tier-visible? Do **not** silently ship. | product (data owner) | high | 14 OQ1; db-impact.json; decisions.md |
| C2 | **Whole-camp visibility of the referral graph.** Family tree shows display names whole-camp to any approved member. Lower-sensitivity than the roster email, but confirm whole-camp visibility of the referral graph is acceptable. | product (data owner) | med | 13 OQ5 |
| C3 | **`redactIdDocuments` wiring.** Documented as defence-in-depth in `consent.ts` but has no production caller. Remove (test-only) or wire into the live `people.ts` path. Decide before hardening. | eng | med | 17 OQ3 |
| C4 | **`aiDataConsent` toggle discoverability.** The flag is read/written by MCP identity tools, not by the consent screen. Confirm an in-app path exists for members to set/unset it — if only reachable via Claude, first-time users can't opt in before connecting. | product, eng | med | 17 OQ6 |
| C5 | **Government-ID server-side validation.** SA-ID Luhn / passport-format check is **client-only**; server treats `id.number` as plain text (≤40 chars). Confirm whether to harden server-side (out of scope for the presentation spec; flag for build). Documented source bug — carry as known issue per MEMORY, don't silently patch. | eng | med | 04 OQ4; 20; 24 OQ6 |

---

## D. Scope to confirm (product / eng — behaviour & policy)

| # | Item | Owner | Severity | Source |
|---|---|---|---|---|
| D1 | **✅ RESOLVED (`16-captain-tools.md` rewritten to no-data `CaptainLock`-in-place) — Captain-tools locked state grammar.** `16-captain-tools.md` specs preview-but-locked as a `DimmedList` rendering all cards at `opacity:0.35` — a populated-then-dimmed render. LOCKED decision 3 + flows.md require **structure only, NO data, inert controls** ("dimming a populated render … a data leak and non-conformant"). Rewrite to render chrome + `CaptainLock` in place of the card list. *(Mitigant: TOOLS is a static constant, so the leak is low-stakes — but the pattern taught is wrong.)* | eng, design | med | audit finding #2; 16 |
| D2 | **✅ RESOLVED (`surfaces.json` reconciled; both forks annotated) — Iteration A drop + roster fork resolution.** Contradicts LOCKED decision 2 (Iteration A dropped; fork resolved). Reconcile: mark S17 Captain mgmt superseded/dropped; annotate the fork RESOLVED-by-decision-2; confirm the desktop layout is the terminal-console board. *(Stale analysis artifact, not a board orphan.)* | design (spec editor) | med | audit finding #3; decisions.md; 14; IA |
| D3 | **Promotion-request lifecycle UI.** Where does the *target* accept/decline (their own app — which surface)? Does the requesting captain see a pending-requests list or only the per-member dialog step-state? The acceptance surface needs speccing (likely home rank-section / notifications). | product, design | high | 14 OQ3; IA delta #4 |
| D4 | **Promotion vs invite-code rank.** Invite codes can already mint `assigned_rank='captain'`. Confirm the double-opt-in is the *only* in-app promotion path and code-minted captains bypass it intentionally. | product | med | 14 OQ4 |
| D5 | **Demote / revoke captain.** Boards only assign captain rank. Is there a path to demote a captain back to member? Out of scope here — flag if product wants it. | product | low | 14 OQ8 |
| D6 | **God-account rank.** God accounts auto-create with `rank:"member"`; a god-email would see the non-captain locked captain-tools view. Always manually promote gods, or mint god rows with `rank:"captain"`? | product, eng | med | 16 OQ3 |
| D7 | **Onboarding-gate bypass on tools surfaces.** `/tools`, `/tools/invite`, and `/captains/tools` intentionally skip the `required_actions`/`nextGate` check — a member/captain with pending blocking actions can reach them directly. Confirm this is an acceptable product exception (the home spine handles the funnel) or add a guard. | product | med | 10 OQ6; 11 OQ2; 16 OQ4 |
| D8 | **Profile-edit gating asymmetry.** Both profile-edit server actions re-gate only on auth + invite, not onboarding/approval — a user who became pending/rejected can still save edits or trigger erasure. Intentionally permissive (deletion at any stage may be desirable), or re-check approval in `deleteOwnAccount`? | product, eng | med | 08 OQ1 |
| D9 | **Voice route auth asymmetry.** `/api/voice/transcribe` checks only `getAuthenticatedUser()` truthiness — not approval/required-actions/rank. Likely intentional (only reachable from gated hosts) but confirm as an explicit security decision. | eng | med | 21 OQ5 |
| D10 | **Notifications gate asymmetry.** Users with a redeemed code but incomplete onboarding or pending/rejected approval can reach the inbox. Intentional in live code — confirm pending/rejected users should see notifications, or redirect them. | product | med | 09 OQ6 |
| D11 | **`/auth/sign-up` link asymmetry.** Sign-in card deliberately omits a "Sign up" link (entry via landing CTA + direct URL only). Confirm intentional or add a reciprocal link. | product | low | 02 OQ2; IA |
| D12 | **`name = email` on sign-up.** Intentional shortcut; the burner profile reconciles `displayName` during onboarding. Confirm the onboarding step that collects display/preferred name covers the gap. | product, eng | low | 02 OQ3 |
| D13 | **Minimum password length.** No client-side length rule. If Better Auth imposes a minimum, surface the rule client-side and reflect the server error in the validation section. | eng | low | 02 OQ4 |
| D14 | **Rejected user re-applying a requires-approval code.** A `rejected` user who redeems a new requires-approval code is moved back to `pending` (the `!== "pending"` guard allows it). Intentional second-chance, or should `rejected` be terminal? No UI affordance exists for this path today; captains may see a re-appearing previously-rejected user. | product | med | 03 OQ2; 05 |
| D15 | **Targeted-code email validation.** `invitedEmail` is stored (lowercased) but never validated against the redeemer's email — any authed user can redeem a code naming someone else. Intentional (codes are shareable) or should targeted codes validate the redeemer? | product | med | 03 OQ5 |
| D16 | **`completedAt` overwrite on form replay.** `upsertBurnerProfile` unconditionally sets `completed_at = now()` on replay, silently changing the original completion timestamp. Preserve original (only set when previously null) or accept + update the comment? Confirm the runner's replay/review mode does not reset the gate / `completedAt`. | eng | med | 12 OQ1; 07 OQ4 |
| D17 | **Distinct route vs same-route reveal for gate/wizard.** Gate and wizard both live at `/onboarding/questionnaire`. Sub-route, query param (`?step=0`), or React-state toggle? *(Recommend: gate at root, wizard via query param/sub-route.)* | eng | med | 23 OQ1 |
| D18 | **S27 route definition.** `/onboarding/questionnaire/complete` is proposed. Confirm the exact path and whether it's one shared route (query param for which questionnaire completed) or per-questionnaire. *(Recommend: single shared route.)* | eng | med | 27 OQ1; IA |
| D19 | **Skip semantics.** Single-button Skip/Next label-flip (live code) vs S04's separate "Skip" text link. *(Recommend: single button.)* | design | low | 04 OQ3 |
| D20 | **Profile-photo upload mechanism (OB step 01).** Reuse the dedicated AvatarUpload surface (S11) or an inline picker? Both feed `profile.image` as a URL. | design, eng | low | 04 OQ5; 22 |
| D21 | **toggle: Switch vs segmented selector.** What drives the choice — option count (==2 → Switch, 3–4 → segmented) or a per-question presentational flag? No schema field expresses it. *(Recommend: derive from `options.length`, no schema change.)* | eng | med | 20 |
| D22 | **scale segmented presentation on full-screen pages.** Keep the segmented row on the `70dvh` single-question scale pages, or use a vertical slider full-screen + segments inline? Must keep the discrete-step value. | design | low | 20 |
| D23 | **First-question Back vs Sign out (runner).** Confirm Back is simply disabled on question 1 (matching `firstStepSignOut`) rather than offering a second footer sign-out. | design | low | 24 OQ9 |
| D24 | **Announcements `channel` toggle.** `channel` is fixed to `both` (DB default; composer never sets it). Confirm the composer should expose no push/in-app channel toggle (scoped channel control lives with the push UIs). | product | low | 15 OQ5 |
| D25 | **No unpublish / recall / republish.** By design, captains can't retract a published announcement (only author a fresh one). Confirm this is acceptable. | product | low | 15 OQ6 |
| D26 | **Announcements preview-but-locked data behaviour.** Confirm a non-captain sees **zero** announcement rows (empty lists under CaptainLock) vs structure-only placeholder rows. *(Spec assumes zero data per decision 3.)* | product | low | 15 OQ3 |
| D27 | **Screenshot attachment on the bug reporter.** Board's "Attach a screenshot" checkbox has no code backing; dropped from the intake-tracker port. Confirm dropped (current default) or add screen-capture (changes the GitHub POST + adds an upload path). | product | low | 25 |
| D28 | **Error-boundary "Report" action.** Wire the error card's Report button to open `ReportBugDialog` pre-filled with the trace digest? The boundary may need its own lightweight reporter entry (FeedbackGate mounts only on success paths). | eng | low | 25 |
| D29 | **`QuestionnaireBlock` trigger source.** Mount client-side off a pending blocking `required_action` (needs a pending-actions endpoint mirroring `/api/notifications/pending`) vs a server-rendered gate? | eng | med | 25 |
| D30 | **`popup` presentation ownership.** The third `broadcast_presentation` value (`popup`) is a transient pop-up with no overlay drawn — same surface as Toast, or a distinct notification toast owned by the notifications unit? Flag ownership. | product, eng | med | 25 |
| D31 | **Push opt-out UI.** Once granted, a user can't revoke their push token in-app (must use browser settings) — deliberate per the board. Add a "Disable notifications" toggle to Profile/Settings? | product | med | 26 OQ3 |
| D32 | **Pagination / list caps.** Notifications (`listInbox` no LIMIT) and the ChangeLog (capped at 20, no UI for older). Confirm a hard cap / virtual scroll for notifications and whether the 20-entry log cap silently hiding history is acceptable. | product | low | 09 OQ4; 12 OQ2 |
| D33 | **Stat / chip semantics on the roster.** Confirm exact definitions so counts don't double-claim members: is "INCOMPLETE 7" the same set as "Outstanding 7" (onboarding/required-actions), and "Pending 3" the approval queue? | product | med | 14 OQ5 |
| D34 | **Inline profile field coverage.** Confirm the roster inline profile shows only the board's subset (Country/Email/Dietary/Emergency/Arrival/ID/Outstanding/bring-to-camp) or the full grouped questionnaire, and whether the live Overview/Profile tabs are retained or collapsed into one scroll. | product, design | med | 14 OQ6 |
| D35 | **Home: My Profile destination.** S08 tile has no override href; built view is `/profile`, live code wired `/onboarding/questionnaire`. *(Recommend `/profile`.)* | eng | med | 06 OQ1 |
| D36 | **Home: Camp Tools vs Announcements.** Is Camp Tools a hub linking onward to announcements, or should the tile go straight to one surface? Confirm IA. | product | low | 06 OQ2 |
| D37 | **Customize-mode persistence.** Decision 4 caps schema to `captain_promotion_requests`. Where does the customised layout / pinned set / user-groups persist — localStorage, cookie, or defer Customize mode? **No new table allowed.** | eng | high | 06 OQ3 |
| D38 | **Customize on locked groups.** Can a viewer reorder/pin within preview-but-locked groups, or only unlocked scope? *(Recommend: unlocked-only; locked groups aren't drop targets.)* | design | low | 06 OQ4 |
| D39 | **Future-tile affordance.** What does tapping an un-built destination do — silent no-op, disabled/"coming soon" badge, or hide until built? *(Recommend: visible-but-inert "coming soon", no 404s.)* | design | med | 06 OQ5; IA §3.2 |
| D40 | **Tool-count + badge sourcing.** Confirm derived counts (Camp/Crew/My Tasks from `tasks`; My Teams from `team_memberships`) and that locked-group tiles show NO real counts (decision 3). | eng | low | 06 OQ6 |
| D41 | **Per-tile icon map.** Codify the full per-tool icon set so populated `GridTile` heads match Customize-mode rows. | design | low | 06 OQ7 |
| D42 | **TopChrome reuse vs HomeHeader.** Reconcile the live `HomeHeader` onto the shared `TopChrome` (wordmark + bell + avatar) for consistency. | eng | low | 06 OQ8; 07 OQ3; IA |
| D43 | **`DetailHeader` back-target.** Confirm `DetailHeader`'s back affordance resolves to `/` on `/tools` — derived from router or explicit prop? | eng | low | 10 OQ8 |
| D44 | **Family-tree NavCard route.** Confirm `/family-tree` (outside `/tools/*`) is intentional and registered; if it moves to `/tools/family-tree`, update the NavCard href + S16 brief. | eng | low | 10 OQ4; 13 |
| D45 | **Card treatment consistency (invite tool).** Board cards only the success state; live code cards the whole form. Pick one (recommend card both). | design | low | 11 OQ1 |
| D46 | **Availability-check existence semantics.** Settle whether availability treats revoked/expired/exhausted codes as "taken" consistently across prod and E2E; collapse the two divergent rules-hint strings into one constant. | eng | med | 11 OQ3; 11 OQ4 |
| D47 | **MCP 403 branch styling.** Keep onboarding-incomplete / no-camp-account / no-camp-access / 401 / expired-code as raw `errorPage` HTML (consistent with current code) or design styled in-app pages? Only `pending_approval` is board-styled today. | product, design | med | 17 OQ1; IA §3.1 |
| D48 | **MCP rejected vs pending message.** Both `pending` and `rejected` surface the same "a captain still needs to approve…" text. Add a distinct `rejected` branch ("Your access request was declined.")? | product | low | 17 OQ2; 26 |
| D49 | **MCP footnote destination.** "Sign in" links to `/auth/sign-in`; someone who never had an account should land on a sign-up path. Confirm sign-in vs sign-up (or a unified auth page). | product | low | 17 OQ7 |
| D50 | **`editedByUserId` captain-on-behalf path.** Nullable column exists; no UI wired. Flag for a future captain-tools surface if captains should edit a member's form on their behalf. | product | low | 12 OQ4 |

---

## E. Infra, source-bugs & forward notes (eng; carry, don't necessarily fix now)

| # | Item | Owner | Severity | Source |
|---|---|---|---|---|
| E1 | **Deployment env-var checklist.** `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` (≥32 chars) — build passes with placeholders; runtime fails at the Neon Auth API. Confirm CI/CD injects these before any staging/production deploy. | eng | med | 02 OQ6 |
| E2 | **Firebase config keys.** Verify `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` should be added to `isConfigured()` (read into config but not one of the five required keys; FCM token retrieval may misbehave if absent). | eng | med | 26 OQ6 |
| E3 | **Rate-limit persistence.** The in-memory token-bucket resets on restart and isn't shared across replicas — fine for single-process, but swap to Upstash Redis before any multi-region/multi-replica deploy. | eng | med | 03 OQ3 |
| E4 | **Voice rate-limit retry UX.** The transcribe API returns `retryAfterSeconds` in 429 bodies; the error state shows a plain string. Consider a countdown / "try again in X" message (low-connectivity Tankwa Karoo). Not blocking. | design, eng | low | 21 OQ3 |
| E5 | **Capacitor / native recording.** `TODO(capacitor)` in `use-voice-recorder.ts` is unimplemented; `MediaRecorder` is unavailable on some native platforms. Wire `@capgo/capacitor-voice-recorder` before any native distribution. | eng | med | 21 OQ4 |
| E6 | **Blob lifecycle / orphan cleanup.** Each avatar upload writes a new blob; old blobs are orphaned (overwrite, cancel, account deletion all leak). No cleanup job in scope. Confirm a TTL / orphan-sweep, or an overwrite-without-suffix strategy, before launch. | eng | med | 08 OQ2; 22 OQ1 |
| E7 | **Avatar proxy URL edge cases.** (a) Confirm no case where a stale `initialImageUrl` proxy URL 404s at page-render. (b) A not-yet-approved member who uploads, refreshes, and re-inits with the stored proxy URL gets a 401 `<img>`; handle gracefully (`onError` → empty circle) vs show broken image. | eng | low | 08 OQ5; 22 OQ4 |
| E8 | **DELETE-confirm input not trimmed.** A trailing space silently fails the guard with a generic error. Trim server-side, or make the error explicit ("Type DELETE exactly, no spaces"). | eng | low | 08 OQ3 |
| E9 | **`telegramUserId` unique constraint on sanitised rows.** `sanitisedUserPatch` sets it `null`; the column has a `uniqueIndex`. Confirm multiple deletions all resolve to `null` without conflict (Postgres allows multiple nulls in a unique index). | eng | low | 08 OQ6 |
| E10 | **Post-deletion "Lost Cat" UX.** After redirect to sign-out, a re-login gets a fresh access-less account landing on `/signup/required` with no explanation of why data is gone. Confirm whether a confirmation email or interstitial is wanted. | product | low | 08 OQ4 |
| E11 | **No realtime push on approval.** When a captain approves, the user sees nothing until reload. Future enhancement (push / SSE); forward note, not in scope. | eng | low | 05 |
| E12 | **`metadata.title` stale on approval gate.** Always reads "Application pending" regardless of the rejected branch (not user-facing in-app). Fix to neutral copy or branch conditionally. | eng | low | 05 |
| E13 | **`<Suspense fallback={null}>` flash on SignInForm.** Brief blank flash while `useSearchParams()` resolves. Acceptable for this low-traffic path; flag if perceived latency becomes an issue. | eng | low | 02 OQ5 |
| E14 | **Date-overflow validation gap.** `date` `Date.parse` accepts impossible calendar dates (e.g. `2026-02-31`). Documented source bug — flag to data owner; carry as known issue, don't silently fix. | eng | low | 20; 24 OQ6 |
| E15 | **Family-tree cycle guard (source bug).** Add a `visited` Set to the `matchIds` ancestor-promotion walk (and harden `buildTree`) to prevent an infinite loop on a cyclic `inviterId` chain. Currently undefended (presumed domain-impossible). Confirm fix on rebuild. | eng | med | 13 OQ1 |
| E16 | **Real avatars in the family tree.** Show members' `profile_image_url` (column already on the identity row) instead of the generic glyph? Board draws a glyph. | design, product | low | 13 OQ2 |
| E17 | **System `acknowledge` with null `senderName`.** Suppresses the whole attribution line (incl. "· awaiting acknowledgement"), leaving no prompt to complete the ack. Confirm system-generated `acknowledge` deliveries are real; if so add a fallback attribution line. | product, eng | low | 09 OQ3 |
| E18 | **Silent push-registration failure UX.** If `POST /api/push/tokens` fails, the component still transitions to "granted" and hides the button — user believes push is on but no token stored (deliveries silently "skipped"). Re-surface the button or show a toast on failure? | eng | med | 26 OQ4 |
| E19 | **`DELETE /api/push/tokens` orphan.** The unregister endpoint has no client caller. Should `signOut()` (when implemented) call DELETE to clean up the device token before clearing the session? | eng | low | 26 OQ1 |
| E20 | **No `lastSeenAt` stale-token pruning.** No age-based sweep of stale `push_tokens`; dead rows accumulate. Confirm a periodic sweep is wanted, or that FCM prune codes suffice. | eng | low | 26 OQ2 |
| E21 | **`push_tokens.topics` unused.** Plumbed through `registerPushToken` → `upsertPushToken` but never populated by the web client or read by the drain. Confirm topic-based segmented delivery is planned; if not, dead weight. | eng | low | 26 OQ5 |
| E22 | **Four orphaned MCP scope predicates.** `canReadTeamOps`, `canWriteTeam`, `canApproveCrossTeam`, `canAdmin` in `scope.ts` have no production callers. Planned for a future tool surface, or remove? | eng | low | 17 OQ4 |
| E23 | **MCP consent HTML token palette.** The raw authorize HTML uses hard-coded hex; if the OKLCH tokens should apply, the build needs an inline CSS-variable block or a static stylesheet. Low priority known divergence. | design, eng | low | 17 OQ5 |
| E24 | **E2E expiry-boundary asymmetry.** SQL `consumeInviteCode` treats `expiresAt > now` as alive (alive-if-equal); the test store treats `expiresAt <= now` as dead. A code expiring at the exact current ms behaves differently in test vs prod. Align during test-harness maintenance. | eng | low | 03 OQ4 |
| E25 | **Future form-registry entries.** Dietary/driver questionnaires: registry + UI are forward-compatible (`listCompletedForms` surfaces them when `load` returns a `completedAt`). No action. | eng | low | 12 OQ3 |
| E26 | **Sign-out implementation.** Profile uses a plain `<a href="/auth/sign-out">` full navigation. Confirm this remains the pattern vs a server action / form POST, particularly if CSRF considerations arise. | eng | low | 07 OQ5 |
| E27 | **Profile shell membership.** Confirm `/profile` sits inside the app shell layout vs renders standalone (the Server Component structure suggests it could be standalone; any bottom-nav tab is external to this surface). | eng | low | 07 OQ3 |
| E28 | **Expired queue-row treatment.** `requiredActionStatusEnum` includes `'expired'` but S27 doesn't draw it. Confirm appearance (suggested: greyed card, "Expired — contact a captain", not counted in the pending total). | product, design | low | 27 OQ5 |
| E29 | **`@handle` source.** Reuse `users.telegramHandle` (may be null / not unique) or derive a display slug? No dedicated roster-handle column unless product asks. Confirm the fallback when `telegramHandle` is null. | eng, product | med | 14 OQ2; db-impact.json |
| E30 | **Empty TOOLS guard (captain hub).** No `EmptyState` rendered when `TOOLS` is empty. If tool entries ever become runtime-configurable (vs a code-side array), wire an `EmptyState`. Confirm `TOOLS` stays code-side indefinitely. | eng | low | 16 OQ5 |
| E31 | **Locked-view annotation label.** The Pencil "LOCKED — non-captain view" label is design-only and must be stripped from the built surface. If a visible "CAPTAIN ONLY" badge is desired, that's a separate product decision. | design | low | 16 OQ2 |
| E32 | **`className` diameter override on AvatarUpload.** The prop allows overriding the circle size; no non-120px embed is drawn today. No action unless a future board introduces a variant size. | eng | low | 22 OQ5 |
| E33 | **✅ RESOLVED (added `feature-set-reconciliation.md`; 31/31 reconciled) — Reference-only feature-set capabilities reconciliation.** Tasks, reimbursements, recipes, inventory, team_budgets, adoptees, workshops, telegram_chats, membership_tier all have schema tables/enums but no board, and are never reconciled in one place — they appear only as deletion-cascade targets or FUTURE tiles. Add a "feature-set unit → covered / FUTURE-stub / reference-only-no-board" appendix so the §7 "drop no functionality" contract is satisfied by intent, not omission. | design (spec editor), product | med | audit finding #1 |
| E34 | **Driver-profile capability.** Referenced as roster data + a runner future-write + a `nextGate` skip; no standalone surface. Reference-only — confirm consciously out-of-scope-for-this-redesign as part of E33. | product | low | coverage-audit §2; 24 |
| E35 | **Focus-ring placement.** Member tools hub puts `focus-visible:ring-2` on the `Card`; captain hub puts it on the `Link` wrapper (`rounded-xl`). Standardise across both hubs (recommend ring on `Link`). | design, eng | low | 10 OQ7; 16 OQ6 |

---

> **Cross-references:** the LOCKED decisions ([`_analysis/decisions.md`](_analysis/decisions.md))
> already resolve several would-be questions (roster fork, gating treatment, voice home, the single
> schema change, the no-nuke call). Items above are what remains *open* after those locks (the
> ✅-marked B3/B4/D1/D2/E33 were applied to the spec directly after the audit). A1–A4 and the
> questionnaire-trio cluster are the highest-value product confirmations to make before build.
