# Camp 404 — Canonical Component Library

ONE deduped library for the whole app (atoms → molecules → organisms), zero redundancy.
Built by folding the 57-item candidate inventory (`_analysis/surfaces.json`
`componentInventory`), the 10 canvas reusables (`.spec-extract/boards/00..09`), the
primitive-kit board (`33-s24-primitive-kit.txt`), and all 25 per-surface briefs
(`spec/surfaces/*.md`) onto the existing `@camp404/ui` package
(`packages/ui/src/components/`). Boards are the source of truth; the feature-set is
reference-only (decision #1).

## Conventions

- **`mapsTo` legend**
  - `@camp404/ui/<file>` — **reuse** the existing package primitive as-is (no new component).
  - **PROMOTE** — pattern is hand-rolled in `apps/web` today (or implied by boards); lift it
    into `@camp404/ui` once and kill the per-screen reinvention.
  - **NEW** — does not exist anywhere yet; build it. Package vs. app-local home is noted per entry.
- **Tier**: atom (pure presentational primitive, no app-domain knowledge) · molecule (a few atoms
  + a little layout/logic) · organism (surface-scale composite that owns data/flow).
- **Tokens**: short-form semantic tokens only (`bg-primary`, `text-muted-foreground`…). Status
  tints (`success`/`warning`/`info`) are NEW tokens to add to `globals.css` — every
  ready/awaiting/available/taken colour resolves through them, never raw `emerald/amber/sky/rose`
  or the board's raw hex (`#3fd07a`, `#e0a800`, `#00dcff26`, `#ff008c2e`).
- **Type faces**: Inter = UI/body; **JetBrains Mono = the data-console face** (decision #2) — invite
  slugs, record counts, IDs, progress %, terminal/console chrome, trace codes.
- **Dark-only**: no `dark:` variants (dark-only app).
- **Gating**: preview-but-locked = `CaptainLock` + inert controls + zero data; never a redirect or
  blocking scrim (decision #3).
- **Voice**: field-level dictation only — `DictatePill` → `RecorderPanel` (decision #5). No home mic.

---

## Merge map (what collapsed into what)

The 57 inventory candidates dedupe to **49 canonical components**. Key merges:

| Canonical | Absorbed inventory candidates | Why one |
|---|---|---|
| **Badge** | RankPill/status-pill, captain-pill, you-pill, count-pill, new-pill, RequiredChip, presentation-pill, MOVING chip, role-badge, team-badge, S24 badges/pills | All are `pad·r:999·tinted-fill` text pills. One `Badge` with `variant`+`tone` covers every case. |
| **NavCard** | NavCard (S13), ToolCard (S19), FormCard (S15) | Identical icon-chip + title + description + chevron + Link. `disabled` prop gives S19's ghost; FormCard = NavCard with a "Last edited" meta line. |
| **Alert** | Alert/inline-alert, BlockingNotice, MemberNote, error/success/save-failed banners, S24 alerts | One `Alert` with `tone` (info/warning/destructive/success) + optional icon/title/body. BlockingNotice = persistent destructive Alert. |
| **IconBadge** | IconChip/IconBadge, GridTile IconBox, CaptainLock lock-circle, EmptyState circle, completion-hero circle, notification icon-circle, S06 status circle | One tinted rounded icon container, sized + toned by props. |
| **SegmentedControl** | segmented-control, scale-as-segments, interest segmented-scale, ID-type toggle | One roving radiogroup; renders `scale`, `toggle` (2–4), and the day/week/month case. |
| **OptionCardGroup** | radio-option-row, RadioCardGroup, CheckboxCardGroup, single/multi select-as-cards, CheckboxChipGrid | One stacked option-card list; `mode=single|multi` swaps radio/checkbox; chip-grid is a layout variant. |
| **CodeDisplay** | CodeField, CodeBox, RedactedField | Mono code surface; `shuffle`/`copy`/`redacted` are props. RedactedField = `redacted` variant. |
| **EmptyState** | EmptyState, EmptyLog (inline variant) | EmptyLog is `EmptyState` with `variant="inline"` (no icon circle). |
| RosterRow ⟂ TreeRow ⟂ NotificationRow ⟂ ReorderRow | kept **distinct** | Different anatomy/affordances/data; share atoms (Avatar/Badge/IconBadge) but not a row shape. |

---

# ATOMS

## Button
- **Tier:** atom
- **Used by:** every surface (Landing CTA, auth, gates, footers, tools, roster actions, dialogs, EnablePush, error boundary).
- **mapsTo:** `@camp404/ui/button.tsx` (reuse). Covers Button-Primary (`variant="default"`), Button-Outline (`variant="outline"`), Ghost, Destructive, Link, EnablePush (`secondary`/`outline`). S24 adds no new variant.
- **Props:** `variant` · `size` · `asChild` · `disabled` · native button attrs.
- **Variants:** default · destructive · outline · secondary · ghost · link.
- **States:** default · hover · focus-visible (ring) · disabled (opacity-50) · loading (consumer swaps label + spinner: "Saving…"/"Creating…"/"Submitting…").

## Input
- **Tier:** atom
- **Used by:** auth, invite-gate, onboarding (phone/ID), profile-edit, invite-tool (email/code/number), announcements (title), field-renderer (short_text/date), roster + family-tree search.
- **mapsTo:** `@camp404/ui/input.tsx` (reuse). `type="date"` is the `date` kind; `className="font-mono"` is the invite-slug face.
- **Props:** native input attrs (`type`, `placeholder`, `maxLength`, `autoComplete`, `required`, `disabled`, `name`).
- **Variants:** text · email · password · date · search (leading icon via wrapper) · mono.
- **States:** empty/placeholder · populated · focus · disabled · error (border → destructive, set by host).

## Textarea
- **Tier:** atom
- **Used by:** onboarding (bio/ideas/notes/other-burns), field-renderer (long_text), invite-tool (note), announcements (message), my-forms replay, voice transcript edit, bug dialog.
- **mapsTo:** `@camp404/ui/textarea.tsx` (reuse).
- **Props:** native textarea attrs (`rows`, `maxLength`, `placeholder`, `disabled`); `whitespace-pre-wrap` on display.
- **Variants:** default · fullScreen (`min-h-[40dvh] flex-1 resize-none`).
- **States:** empty · populated · disabled · error.

## Label
- **Tier:** atom
- **Used by:** every form field (auth, gates, onboarding, profile-edit, invite-tool, announcements, field-renderer).
- **mapsTo:** `@camp404/ui/label.tsx` (reuse). Required `*` (`$primary` per live code; flagged token choice) appended by host field shell.
- **Props:** `htmlFor` · native label attrs.
- **Variants:** default · with-required-marker.
- **States:** default · dimmed (field disabled).

## Checkbox
- **Tier:** atom
- **Used by:** field-renderer (multi_select), onboarding (lead-teams/years/dietary), invite-tool (pre-approve), bug dialog (Improve-with-AI), S24 kit.
- **mapsTo:** `@camp404/ui/checkbox.tsx` (reuse).
- **Props:** `checked` · `onCheckedChange` · `disabled`.
- **Variants:** default.
- **States:** unchecked · checked (`$primary` box + check) · disabled.

## Slider
- **Tier:** atom
- **Used by:** field-renderer (slider kind, team_interest; scale full-screen fallback), onboarding step 06.
- **mapsTo:** `@camp404/ui/slider.tsx` (reuse). Boards re-skin `scale`/`toggle` as SegmentedControl, but slider stays canonical for the genuine `slider` kind + the full-viewport scale page.
- **Props:** `value` · `min` · `max` · `step` · `orientation` (horizontal / vertical 70dvh scale).
- **Variants:** horizontal · vertical.
- **States:** untouched (reads min, uncommitted) · populated · disabled.

## Avatar
- **Tier:** atom
- **Used by:** TopChrome, profile-view, profile-edit, roster rows + member profile, family-tree nodes, MCP consent identity row.
- **mapsTo:** `@camp404/ui/avatar.tsx` (reuse). Initials via `initialsFrom()` ("?" on null); photo via proxy; family-tree uses generic `user` glyph.
- **Props:** `src?` · `initials` · `tint?` (per-member mono-initial tint on roster) · `className` (size).
- **Variants:** photo · initials · glyph (tree) · mono-tinted (roster console).
- **States:** image-loaded · fallback (initials/glyph) · loading (Radix native fallback).

## Badge
- **Tier:** atom
- **Used by:** TopChrome (bell count), GridTile (count), profile-view (RankPill), roster (role/status/captain), family-tree (Captain/You/count), notifications (New pill), announcements (presentation pill), runner (RequiredChip), home customize (MOVING chip), S24 kit.
- **mapsTo:** PROMOTE → `@camp404/ui/badge.tsx` (recommendations P0). Single canonical pill replacing every bespoke inline span (RankPill, captain-pill, you-pill, count-pill, new-pill, RequiredChip, presentation-pill, role-badge, team-badge).
- **Props:** `tone` (default/primary/accent/secondary/destructive/success/warning) · `variant` (solid/soft-tint/outline) · `icon?` · `size` (xs/sm) · children.
- **Variants:** default · primary (RankPill captain) · accent (Captain pill, family-tree) · secondary (Captain tint) · success (Approved/Ready) · warning (Outstanding) · destructive (Error/Rejected) · with-icon (RequiredChip lock, presentation megaphone).
- **States:** static (presentational only).

## IconBadge
- **Tier:** atom
- **Used by:** GridTile (IconBox), NavCard (IconChip), CaptainLock (lock-circle), EmptyState (circle), approval-gate (clock/shield-x), questionnaire-gate/runner (clipboard-list), completion-hero (check), notifications (presentation icon circle), tools/captain-tools chips, MCP scope/lock wraps.
- **mapsTo:** PROMOTE → `@camp404/ui/icon-badge.tsx`. One tinted rounded icon container; folds IconChip/IconBox/lock-circle/empty-circle/success-circle.
- **Props:** `icon` (lucide) · `tone` (primary/accent/secondary/success/destructive/muted) · `size` (sm 34 / md 44–48 / lg 60–96) · `shape` (rounded / circle).
- **Variants:** primary-tint · accent-tint · secondary-tint · success-tint · destructive-tint · muted.
- **States:** static · spinner-overlay (host-driven, e.g. avatar uploading).

## Spinner
- **Tier:** atom
- **Used by:** buttons mid-action, avatar-upload, voice processing/requesting, MCP bridge, invite-tool checking.
- **mapsTo:** PROMOTE → `@camp404/ui/spinner.tsx` (lucide `Loader2` + shared `animate-spin` + reduced-motion guard). Today inlined per surface.
- **Props:** `size` · `aria-label`.
- **Variants:** inline (in-button) · overlay (avatar) · centred (panel/page).
- **States:** spinning.

## Divider
- **Tier:** atom
- **Used by:** home (groups/push), profile-edit, captain-tools (locked separator), completion-queue, auth or-divider host.
- **mapsTo:** NEW (app-local util) — 1px `$border` rule; horizontal/vertical; labelled variant = or-divider.
- **Props:** `orientation` · `label?` ("Or continue with").
- **Variants:** plain · labelled (or-divider).
- **States:** static.

## ProgressBar
- **Tier:** atom
- **Used by:** onboarding wizard (all OB steps), questionnaire runner, S04 footer-state port.
- **mapsTo:** PROMOTE → `@camp404/ui/progress-bar.tsx` (today a private fn in `wizard.tsx`). Track + `$primary` fill; mono "Step/Question N of M" + right-aligned mono `NN%` ($accent) ported from S04.
- **Props:** `current` · `total` · `labelMode` (step | question) · `showPercent`.
- **Variants:** step-paged (onboarding) · question-paced (blocking runner).
- **States:** static (reflects current step).

---

# MOLECULES

## TopChrome
- **Tier:** molecule
- **Used by:** home (shared app header; reconcile live `HomeHeader` onto it).
- **mapsTo:** PROMOTE → `@camp404/ui` (board 00; today `HomeHeader`). Wordmark Camp+404(mono) + Bell (IconBadge + count Badge) + Avatar.
- **Props:** `unreadCount` · `avatarImageUrl?` · `avatarInitials` · bell/avatar targets.
- **Variants:** badge-shown · badge-hidden (count 0) · count-capped ("99+").
- **States:** default · unread · photo vs initials.

## DetailHeader
- **Tier:** molecule
- **Used by:** notifications, tools-hub.
- **mapsTo:** PROMOTE → `@camp404/ui` (board 02). 40×40 round back-button (chevron-left) + title.
- **Props:** `title` · `backHref`/`onBack`.
- **Variants:** default.
- **States:** static.

## GhostBack
- **Tier:** molecule
- **Used by:** invite-tool, my-forms (both pages), family-tree, captain-tools, announcements, roster console ("Camp tools").
- **mapsTo:** PROMOTE → `@camp404/ui/ghost-back.tsx`. Lightweight ghost link (chevron-left + label), distinct from the round-pill DetailHeader; today inlined per surface.
- **Props:** `label` · `href`.
- **Variants:** default · console-skin (roster terminal).
- **States:** default · focus.

## SectionHeader
- **Tier:** molecule
- **Used by:** list sections (home groups, announcements Drafts/Published, generic "SECTION · See all").
- **mapsTo:** PROMOTE → `@camp404/ui` (board 01). Label + optional trailing action/count.
- **Props:** `label` · `action?` ("See all") · `count?`.
- **Variants:** plain · with-action · with-count.
- **States:** static.

## Card
- **Tier:** molecule
- **Used by:** nearly every surface (auth shell, gates, profile, tools, roster profile, announcements list, family-tree node, S24).
- **mapsTo:** `@camp404/ui/card.tsx` (reuse). Card/Header/Content/Title/Description/Footer.
- **Props:** standard + `className` (Danger → `border-destructive`; node → ring).
- **Variants:** default · danger (destructive stroke) · selected/ring (roster, viewer node) · interactive (hover tint).
- **States:** default · hover · selected · dimmed/disabled.

## InputField
- **Tier:** molecule
- **Used by:** auth, invite-gate, onboarding, profile-edit, invite-tool, announcements, S24, field-renderer short_text.
- **mapsTo:** PROMOTE → `@camp404/ui/input-field.tsx` (board 06; the canvas Label+Input pairing, today composed inline). Optional helper + error line.
- **Props:** `label` · `helper?` · `error?` · all Input props.
- **Variants:** default · with-helper · error.
- **States:** empty · populated · focus · disabled · error.

## Alert
- **Tier:** molecule
- **Used by:** auth, invite-gate, onboarding (error/save-failed), profile-edit, invite-tool (server error), announcements (error/success), runner (BlockingNotice + in-card InlineAlert), bug dialog, S24, MCP bridge error.
- **mapsTo:** PROMOTE → `@camp404/ui/alert.tsx`. One alert; folds inline-alert, BlockingNotice, MemberNote, error/success/save-failed banners. `role="alert"`/`role="status"`.
- **Props:** `tone` (info/warning/destructive/success) · `icon?` · `title?` · children · `persistent?` (BlockingNotice).
- **Variants:** info (Heads-up/MemberNote) · destructive (validation/server/save-failed) · success (Saved/Draft saved) · persistent-destructive (BlockingNotice).
- **States:** shown · hidden (success suppressed when error present).

## SegmentedControl
- **Tier:** molecule
- **Used by:** S24 kit (day/week/month), field-renderer (scale as segments, toggle 2–4 as radiogroup, ID-type), onboarding (steps 02 ID-type, 06 interest-scale), questionnaire runner (scale 1–5).
- **mapsTo:** PROMOTE → `@camp404/ui/segmented-control.tsx` (recommendations: promote SegmentedControl). Roving `role="radiogroup"`; selected `$primary`. Data contract preserved — emits string value, never boolean.
- **Props:** `options` · `value` · `onChange` · `size` · `aria-label`.
- **Variants:** equal-segment (day/week/month, ID-type) · scale (1–N with min/max labels) · two-up (on/off).
- **States:** unselected · selected · disabled · error.

## SwitchField
- **Tier:** molecule
- **Used by:** S24 kit, field-renderer (toggle drawn as iOS switch for 2-option on/off).
- **mapsTo:** NEW `@camp404/ui/switch.tsx` (no Switch primitive exists; S24 draws it; recommendations note the gap). Presentational variant of the `toggle` kind — persists a string option value, not a boolean.
- **Props:** `checked` · `onChange` · `label`.
- **Variants:** on · off.
- **States:** on · off · disabled.

## Combobox
- **Tier:** molecule
- **Used by:** onboarding (country, step 02), field-renderer (combobox kind).
- **mapsTo:** `@camp404/ui/combobox.tsx` (reuse; uses command + popover). Searchable popover, flag rows, check on selected, "Nothing found." empty.
- **Props:** `options` · `value` · `onChange` · `placeholder` · `searchPlaceholder` · `emptyMessage` · `disabled`.
- **Variants:** default.
- **States:** closed/placeholder · open · filtering · selected · empty-results.

## Select
- **Tier:** molecule
- **Used by:** announcements ("How it lands"); field-renderer single_select fallback (boards re-skin to OptionCardGroup; Select stays for dropdown-appropriate cases).
- **mapsTo:** `@camp404/ui/select.tsx` (reuse).
- **Props:** `value` · `onValueChange` · items (icon + label + hint).
- **Variants:** default · icon+label+hint (presentation selector).
- **States:** closed/placeholder · open · selected · disabled.

## DateControl
- **Tier:** molecule
- **Used by:** onboarding (birthday, step 02), field-renderer (date kind).
- **mapsTo:** `@camp404/ui/input.tsx` `type="date"` (reuse) + calendar affordance. Emits ISO `yyyy-mm-dd`.
- **Props:** `value` · `onChange` · `disabled`.
- **Variants:** default.
- **States:** empty · populated · error.

## OptionCardGroup
- **Tier:** molecule
- **Used by:** onboarding (07–10 radio cards, 08/09 checkbox cards, 11 dietary chip-grid), field-renderer (single/multi as cards), questionnaire runner (radio/checkbox rows).
- **mapsTo:** PROMOTE → `@camp404/ui/option-card-group.tsx`. Folds radio-option-row, RadioCardGroup, CheckboxCardGroup, CheckboxChipGrid.
- **Props:** `options` · `value` · `onChange` · `mode` (single | multi) · `layout` (stack | chip-grid).
- **Variants:** single-radio · multi-checkbox · chip-grid (dietary) · selected card tint.
- **States:** none selected · selected/checked · disabled · error.

## DictatePill
- **Tier:** molecule
- **Used by:** onboarding (03/04 long_text), field-renderer (long_text), announcements (message body), bug dialog.
- **mapsTo:** PROMOTE → `@camp404/ui` (or app `components/voice/`). The single "Dictate instead" trigger (mic + label; unify the OB pill + live outline button on the pill). Launches RecorderPanel.
- **Props:** `onActivate` · `label?`.
- **Variants:** pill (`r:999`) · (legacy outline — deprecate).
- **States:** idle · active (swapped for RecorderPanel).

## AvailabilityHint
- **Tier:** molecule
- **Used by:** invite-tool (code availability line).
- **mapsTo:** NEW (app-local `invite-form.tsx`). Maps `idle|checking|available|taken|invalid` to icon + line (Spinner + success/destructive tones).
- **Props:** `availability` · `code`.
- **Variants:** checking · available (success) · taken (destructive) · invalid (destructive) · idle (null).
- **States:** one per union member; idle renders nothing.

## Stepper
- **Tier:** molecule
- **Used by:** invite-tool (multi-use count 1–100, captain).
- **mapsTo:** NEW (app-local). −/+ buttons mutating a real `number` Input; clamp [1,100].
- **Props:** `value` · `onChange` · `min` · `max`.
- **Variants:** default.
- **States:** default · at-min (− disabled) · at-max (+ disabled) · disabled.

## CodeDisplay
- **Tier:** molecule
- **Used by:** invite-tool (CodeField + Shuffle, success CodeBox), roster console (RedactedField — hidden government ID).
- **mapsTo:** PROMOTE → `@camp404/ui/code-display.tsx`. Mono code surface; `shuffle`/`copy`/`redacted` props fold CodeField, CodeBox, RedactedField.
- **Props:** `value` · `onShuffle?` · `onCopy?` · `redacted?` · `readOnly?`.
- **Variants:** editable+shuffle (CodeField) · readonly+copy (success CodeBox) · redacted (lock + hidden PII).
- **States:** default · copied (label flips 1500 ms) · redacted/locked · disabled.

## NavCard
- **Tier:** molecule
- **Used by:** tools-hub (3 member tools), captain-tools (2 tools, S19), my-forms (FormCard rows).
- **mapsTo:** PROMOTE → `@camp404/ui/nav-card.tsx`. IconBadge chip + title + description + trailing chevron, whole-card Link. `disabled` gives S19 ghost; FormCard = NavCard + "Last edited {date}" meta.
- **Props:** `href` · `icon` · `title` · `description` · `disabled?` · `meta?`.
- **Variants:** default · disabled/locked (captain-tools non-captain) · with-meta (FormCard).
- **States:** default · hover (bg-accent/30) · focus-ring (on Link) · disabled (opacity 0.35, pointer-events none).

## GridTile
- **Tier:** molecule
- **Used by:** home control panel (rank-group tool tiles).
- **mapsTo:** PROMOTE → `@camp404/ui` (board 03). IconBadge (46×46) + optional count Badge + title + hint; optional drag handle in Customize.
- **Props:** `icon` · `iconTone` · `title` · `hint` · `badge?` · `href?` · `disabled` · `dragHandle?`.
- **Variants:** default · with-badge · locked (preview) · dragging · coming-soon (future destination).
- **States:** default · with-count · locked/inert · dragging · coming-soon.

## EmptyState
- **Tier:** molecule
- **Used by:** notifications, my-forms (list + EmptyLog inline), family-tree, roster, announcements (drafts/published), completion-queue (zero rows).
- **mapsTo:** PROMOTE → `@camp404/ui` (board 08). IconBadge circle + heading + body. `variant="inline"` (no circle) = EmptyLog.
- **Props:** `icon` · `heading` · `body` · `variant` (full | inline).
- **Variants:** full (icon circle) · inline (muted box, EmptyLog).
- **States:** static.

## CaptainLock
- **Tier:** molecule
- **Used by:** home (locked rank groups), roster (non-captain), captain-tools (non-captain), captain announcements (non-captain). The single preview-but-locked treatment (decisions #2 + #3).
- **mapsTo:** PROMOTE → `@camp404/ui` (board 09). Lock IconBadge + "Captain access only" + clearance copy; console-skin variant for roster terminal; override "VIEW ONLY · no data for your rank".
- **Props:** `title?` · `body?` · `skin?` (default | console) · `scope?` (surface | group).
- **Variants:** default · console-skinned (roster terminal) · group-scope (home rank-group card).
- **States:** static (never dismissable; controls behind it inert, zero data).

## FilterChip
- **Tier:** molecule
- **Used by:** roster (All / Pending / Captains / Team-dropdown / Outstanding).
- **mapsTo:** NEW (app-local roster). Toggle/count/dropdown/warning pill; active = accent fill+stroke, inactive = muted.
- **Props:** `label` · `count?` · `active` · `tone` (accent | warning | neutral) · `variant` (toggle | dropdown) · `onToggle`.
- **Variants:** toggle · count · dropdown (Team:) · warning (Outstanding).
- **States:** active · inactive · disabled (locked roster).

## StatTile
- **Tier:** molecule
- **Used by:** roster stats strip (Members / Approved / Incomplete).
- **mapsTo:** NEW (app-local roster). Label + big mono number; tone per stat.
- **Props:** `label` · `value` · `sublabel?` · `tone` (accent | success | warning).
- **Variants:** compact (mobile) · with-sublabel (terminal console).
- **States:** static (derived counts).

## RecorderPanel
- **Tier:** molecule
- **Used by:** field-renderer long_text (questionnaire/runner), bug dialog. Reached via DictatePill (decision #5).
- **mapsTo:** PROMOTE/extend `apps/web/components/voice/recorder-panel.tsx` — add the board's NEW `TranscriptResult` review step (Re-record / Use this text). Composes Waveform + `useVoiceRecorder`.
- **Props:** `onTranscript` · `onDismiss` · `promptKey?` · `maxDurationMs?`.
- **Variants:** questionnaire (biased prompt) · generic (bug dialog, no promptKey).
- **States:** idle · requesting · recording (waveform + timer) · processing · error (Try again) · transcript-review (NEW, editable + Re-record/Use this text).

## AvatarUpload
- **Tier:** molecule
- **Used by:** profile-edit, onboarding step 01, field-renderer (image kind).
- **mapsTo:** PROMOTE → shared `apps/web/components/profile/avatar-upload.tsx`. Avatar circle + camera placeholder + crop/upload pipeline → proxy URL via `onChange`. Re-add the error-state re-upload button the board omits.
- **Props:** `value` · `onChange` · `className` (diameter).
- **Variants:** circular crop (profile/onboarding) · rectangular dropzone (generic image field, S05) · 10 MB/JPG-PNG helper.
- **States:** empty · uploading (spinner overlay, disabled) · populated (image + remove X) · error (alert + retry).

## QCard
- **Tier:** molecule
- **Used by:** questionnaire-gate (S25), questionnaire-block overlay (S22).
- **mapsTo:** NEW → extract shared (two consumers). Title + meta chips (list-checks "N questions", timer "about M minutes").
- **Props:** `title` · `questionCount` · `estimatedMinutes`.
- **Variants:** default.
- **States:** static.

## CompletionHero
- **Tier:** molecule
- **Used by:** completion-queue (S27). (Invite-tool / my-forms success states reuse IconBadge + Alert instead.)
- **mapsTo:** NEW (app-local). Success IconBadge (check) + heading + sub-heading + variant slot.
- **Props:** `heading` · `subheading` · `variant` (all-done | more-required) · `pendingCount?`.
- **Variants:** all-done ("Back to camp") · more-required (count + "Start next questionnaire").
- **States:** static (driven by required-actions data).

## QueueCard
- **Tier:** molecule
- **Used by:** completion-queue (S27) required-questionnaire rows.
- **mapsTo:** NEW (app-local). `Card` specialisation: title + status (Badge/IconBadge) + contextual affordance.
- **Props:** `title` · `status` (complete | next-up | locked | expired) · `dueAt?` · `completedAt?` · `href?`.
- **Variants:** complete (check) · next-up (actionable) · locked (opacity 0.55, inert) · expired (defensive).
- **States:** complete · next-up · locked · expired.

## Toast
- **Tier:** molecule
- **Used by:** global overlays (transient confirm/undo).
- **mapsTo:** NEW → `@camp404/ui/toast.tsx` (no toast/sonner primitive exists; recommendations flag it). Status icon + message + optional action (Undo).
- **Props:** `tone` (success/info/warning/error) · `message` · `action?` · `duration`.
- **Variants:** message-only · with-action (Undo). Status tones via NEW status tokens.
- **States:** entering · shown · auto-dismiss · action-tapped.

## OAuthButton
- **Tier:** molecule
- **Used by:** auth (sign-in + sign-up), MCP bridge.
- **mapsTo:** PROMOTE → `@camp404/ui/google-button.tsx`. Button-Outline + shared `GoogleMark` SVG (today duplicated verbatim across sign-in/sign-up). Extract `GoogleMark` once.
- **Props:** `onClick` · `label` ("Continue with Google" / "Sign in with Google") · `disabled`.
- **Variants:** default.
- **States:** default · disabled (during submit) · error (host Alert).

---

# ORGANISMS

## AuthShell
- **Tier:** organism
- **Used by:** auth (sign-in/sign-up), invite-gate, approval-gate.
- **mapsTo:** PROMOTE → keep shared `apps/web/components/auth-shell.tsx`. Centred `min-h-svh` `$muted` shell + Card/CardContent; optional Back + footer.
- **Props:** `hideBack` · `footer?` · `className` · children.
- **Variants:** with-back · hideBack · with-footer ("Camp 404 is invite-only.").
- **States:** static chrome; children own form states.

## SignInForm / SignUpForm
- **Tier:** organism
- **Used by:** auth.
- **mapsTo:** keep app-local (`sign-in-form.tsx` / `sign-up-form.tsx`); compose InputField + Button + Divider + OAuthButton + Alert.
- **Props:** (sign-in) reads `callbackURL`; (sign-up) confirm field.
- **Variants:** sign-in · sign-up.
- **States:** empty · populated · submitting · validation-error · server-error · success (navigates away).

## QuestionField
- **Tier:** organism
- **Used by:** onboarding wizard, questionnaire runner, my-forms replay.
- **mapsTo:** keep `apps/web/components/questionnaire/question.tsx`. Shell (Label + `*` + helper + control slot + error) over a 10-kind switch composing the atoms/molecules above (Slider, SegmentedControl, OptionCardGroup, InputField, DateControl, Combobox, LongTextField, AvatarUpload).
- **Props:** `question` · `value` · `onChange` · `error?` · `fullScreen?`.
- **Variants:** 10 kinds (slider/single_select/multi_select/short_text/long_text/date/scale/toggle/combobox/image); fullScreen.
- **States:** empty · populated · validation-error · disabled · fullScreen.

## LongTextField
- **Tier:** organism
- **Used by:** field-renderer long_text, onboarding 03/04, announcements message, runner.
- **mapsTo:** keep app-local sub-renderer. Textarea + DictatePill → RecorderPanel (append transcript, clamp maxLength).
- **Props:** `question`/`value` · `onChange` · `fullScreen?`.
- **Variants:** inline · fullScreen.
- **States:** typing · dictating (RecorderPanel mounted) · error.

## QuestionnaireWizard
- **Tier:** organism
- **Used by:** onboarding wizard, questionnaire runner (blocking chrome), my-forms replay.
- **mapsTo:** keep `apps/web/components/questionnaire/wizard.tsx`. Paging/validation/persistence engine; hosts ProgressBar + QuestionField + footer (Back/Next/Skip/Finish/Submit) + banners. Shared 1:1 across all callers.
- **Props:** `questionnaire` · `initialResponses` · `action` · `persistProgress` · `firstStepSignOut` · `submitLabel` · `nextLabel` · `onComplete`.
- **Variants:** onboarding (per-step OB pages) · blocking-runner (BlockingTopBar + BlockingNotice + question-paced) · replay (persistProgress=false, "Save changes").
- **States:** page-0 · middle · last · submitting · inline-error · error-banner · save-failed.

## BlockingTopBar
- **Tier:** organism
- **Used by:** questionnaire runner (blocking required-action chrome) — burner/dietary/agreements.
- **mapsTo:** NEW (app-local; reusable across blocking runners). Sticky `$card` header: title + RequiredChip (Badge) + Sign-out + ProgressBar.
- **Props:** `title` · `current` · `total` · `onSignOut`.
- **Variants:** default.
- **States:** sticky; progress reflects step.

## RankGroupCard
- **Tier:** organism
- **Used by:** home control panel (Captain / Team Lead / Team Member groups).
- **mapsTo:** NEW (app-local). GroupHead (IconBadge chip + name + tool-count) + 2-col GridTile grid. Locked higher-rank groups render CaptainLock + zero data.
- **Props:** `rank` · `icon` · `chipTone` · `tiles[]` · `toolCount` · `locked`.
- **Variants:** captain · team-lead · team-member · locked (preview-but-locked).
- **States:** unlocked (data + interactive) · locked (CaptainLock, inert, no data) · customize (tiles → DraggableTileRow).

## CustomizeMode
- **Tier:** organism
- **Used by:** home control panel (drag-to-reorder editor).
- **mapsTo:** NEW (app-local). Help line + DragToReorder (DraggableTileRow + DropSlot) + DragIntoGroup (PinnedGroup + DropZone + NewGroup) + Done. Persists client-side only (no new table, decision #4).
- **Props:** `tiles` · `groups` · `pinned` · `onReorder` · `onPin` · `onNewGroup` · `onDone`.
- **Variants:** default.
- **States:** idle · dragging (MOVING chip + DropSlot/DropZone) · saved.
- **Sub-components (NEW, app-local):** DraggableTileRow (grip + icon + title + MOVING chip; idle/moving), DropSlot, PinnedGroup (accent group + DropZone), NewGroupAffordance.

## EnablePush
- **Tier:** organism
- **Used by:** home (mounted once, post-gate).
- **mapsTo:** keep `apps/web/components/push/enable-push.tsx`. Renders a single Button-Outline only in `default` permission state; null otherwise.
- **Props:** (self-manages permission state machine).
- **Variants:** default-visible · null (loading/unavailable/granted/denied).
- **States:** loading · unavailable · default (button) · granted · denied.

## NotificationRow
- **Tier:** organism (kept distinct)
- **Used by:** notifications inbox.
- **mapsTo:** NEW (app-local `<li>`). IconBadge presentation circle + title + New Badge + time + body + attribution. Distinct anatomy from RosterRow/TreeRow.
- **Props:** `presentation` · `title` · `body` · `senderName?` · `isNew` · `acknowledgedAt?` · `createdAt`.
- **Variants:** unread (primary tint + New pill) · read · acknowledge/popup/feed icon.
- **States:** unread · read · ack-status suffix · attribution-suppressed (null sender).

## RosterRow
- **Tier:** organism (kept distinct)
- **Used by:** roster (mobile list + desktop console table).
- **mapsTo:** NEW (app-local). StatusBar + Avatar (mono-tinted) + name + @handle/country sub-line + RoleBadge + open chevron. Console table vs mobile stacked rows are the responsive pair (RosterTable / RosterList).
- **Props:** `member` · `statusTone` · `selected` · `onSelect` · `responsive` (table | list).
- **Variants:** terminal-table row · mobile stacked row · selected (accent wash / name accent).
- **States:** default · selected · alternating · locked (no data).

## MemberProfile
- **Tier:** organism
- **Used by:** roster (inline expanding member detail).
- **mapsTo:** NEW (app-local). ProfileHead (Avatar + name + @handle + TeamBadges + status/rank Badges) + bio + ProfileFieldGrid (caption/value, decrypted ID via CodeDisplay redacted) + Actions footer (Approve/Reject/Assign-captain).
- **Props:** `member` (grouped detail) · `isCaptain` · `onApprove`/`onReject`/`onAssign`.
- **Variants:** pending (Approve/Reject) · approved · rejected · self (actions hidden).
- **States:** loading · populated · action-error · submitting · success (counts refresh).

## RosterToolbar
- **Tier:** organism
- **Used by:** roster (search + multi-chip filters).
- **mapsTo:** NEW (app-local). Search Input (console-styled) + FilterChip row + Team dropdown over `teamEnum`.
- **Props:** `query` · `onQuery` · `filters` · `onToggleFilter` · `teamFilter`.
- **Variants:** terminal · mobile.
- **States:** default · active-filters · locked (inert).

## AssignCaptainDialog
- **Tier:** organism
- **Used by:** roster (two-sided double opt-in promotion — the only schema change, decision #4).
- **mapsTo:** NEW (app-local) over `@camp404/ui/dialog.tsx`. Window-chrome title + OptInStepTracker (you send → they accept) + Cancel/Send. Inserts `captain_promotion_requests (status=sent)`; rank flips only on target acceptance.
- **Props:** `target` · `requestState` (sent/accepted/declined/cancelled) · `onSend`/`onCancel`.
- **Variants:** console-modal (desktop) · inline modal (mobile).
- **States:** idle · sending · sent (step 1 Done, step 2 Pending) · error.
- **Sub-component:** OptInStepTracker (NEW) — two-step indicator.

## RejectConfirmDialog
- **Tier:** organism
- **Used by:** roster (reject confirmation).
- **mapsTo:** NEW (app-local) over `@camp404/ui/dialog.tsx`. triangle-alert title + body + Keep-pending / Reject(destructive).
- **Props:** `target` · `onReject`/`onKeepPending`.
- **Variants:** default (destructive stroke).
- **States:** idle · submitting.

## FamilyTree
- **Tier:** organism (TreeRow kept distinct)
- **Used by:** family-tree.
- **mapsTo:** NEW (app-local `family-tree.tsx`). Search + Expand/Collapse + recursive `Branch` (guide lines + Toggle + node Card). TreeRow = Avatar(glyph) + name + Captain/You Badges + via-code (mono/CodeDisplay) + descendant-count Badge + toggle. Distinct row anatomy (guide lines, recursion).
- **Props:** `roster` · `viewerUserId`.
- **Variants:** node · viewer-highlight (ring) · match-highlight (accent border) · leaf (dot toggle) · root ("root" label).
- **States:** populated · empty-no-accounts · empty-no-matches · collapsed · match-filtered.

## AnnouncementsManager
- **Tier:** organism
- **Used by:** captain announcements.
- **mapsTo:** keep app-local. Composer (InputField + LongTextField + DictatePill + presentation Select + Alert + Button) + Drafts list (DraftCard) + Published list (PublishedCard). AnnouncementHeader (title + presentation Badge) shared by both card types.
- **Props:** `announcements` · `currentUserId`.
- **Variants:** new · editing (Edit draft + Cancel) · captain · preview-but-locked (CaptainLock, no data).
- **States:** idle · editing · validation-error · submitting · success · action-failure · locked.

## InviteForm
- **Tier:** organism
- **Used by:** invite-tool.
- **mapsTo:** keep app-local (`invite-form.tsx`). Email InputField + NoteField + CaptainOptions(Checkbox + Stepper) | MemberNote(Alert) + CodeDisplay(shuffle) + AvailabilityHint + Create Button → SuccessPanel.
- **Props:** `isCaptain`.
- **Variants:** member (MemberNote, single-use, approval) · captain (CaptainOptions, multi-use, pre-approve).
- **States:** empty/seeded · checking · available · taken · invalid · submitting · server-error · success (SuccessPanel: CodeDisplay copy + Send-another).

## AcknowledgementGate
- **Tier:** organism
- **Used by:** global overlays (full-screen ack of `presentation='acknowledge'` broadcasts).
- **mapsTo:** keep `AcknowledgementGate` (app). Header chip + title + meta + scroll-to-end body + Acknowledge Button; polls; queue "{n} more after this.".
- **Props:** (self-fetches).
- **Variants:** single · queued.
- **States:** null (empty) · populated · submitting (acking) · advance/dismiss.

## QuestionnaireBlock
- **Tier:** organism
- **Used by:** global overlays (app-blocking questionnaire for a post-onboarding required-action). Routed twin = S25 gate (same card/copy, different trigger).
- **mapsTo:** NEW (app overlay variant). IconBadge + eyebrow + heading + body + QCard + Start Button + lock/sign-out row.
- **Props:** blocking `required_action` (key, title, count, estimate).
- **Variants:** overlay (S22) ⟷ routed gate (S25, same composition).
- **States:** null (none pending) · shown.

## ReportBugDialog
- **Tier:** organism
- **Used by:** global overlays (shake-to-report).
- **mapsTo:** keep `ReportBugDialog` (app) over `@camp404/ui/dialog.tsx`. Kind toggle (SegmentedControl-style) + description Textarea + DictatePill→RecorderPanel + optional AI Checkbox + Alert; success view (issue link + Done). FeedbackGate = headless shake wrapper.
- **Props:** `open` · `onOpenChange` · `defaultKind` · `aiAvailable`.
- **Variants:** bug · feature · form-view · success-view.
- **States:** form · submitting (locked) · success · error.

## ErrorBoundary
- **Tier:** organism
- **Used by:** global overlays (route-segment / root-layout / 404).
- **mapsTo:** keep Next file-convention components (app `error.tsx` / `global-error.tsx` / `not-found.tsx`). Card + heading (focus on mount) + retry/home; adopt board's mono trace-code chip (`error.digest`).
- **Props:** `{ error, reset }` (boundary).
- **Variants:** segment-error · global-error · not-found.
- **States:** error shown · retrying.

## MCPConsent
- **Tier:** organism
- **Used by:** mcp-connect (`/mcp/connect` bridge React; `/api/mcp/oauth/authorize` raw consent HTML).
- **mapsTo:** keep app-local (`Shell`/`MCPConnectInner`) + raw server HTML (outside React shell; hard-coded neutral palette by necessity). Consent uses Button + IconBadge + CodeDisplay (mono scope) + 403 gate Card.
- **Props:** bridge reads `next` (`safeNext`); consent carries OAuth params as hidden inputs.
- **Variants:** bridge (loading / auto-forward / CTA / error) · consent (prompt / 403-gate) · approve/deny POST.
- **States:** loading · signed-in-forward · sign-in-CTA · sign-in-error · consent · gate-403 · approve-success · deny.

## LandingHero
- **Tier:** organism
- **Used by:** landing (unauth `/`).
- **mapsTo:** keep `apps/web/app/landing-hero.tsx` (server) + local `Glitch404`. Wordmark + tagline + five-layer Glitch404 + CTA Button + cursor; self-contained inline `glitchStyles` (intentionally not tokenised). CRT/scanlines motif shared with S22 scan overlay.
- **Props:** (none).
- **Variants:** single presentation.
- **States:** static (CSS-animated; auth-present → not rendered).

---

## Notes, recommendations & flags

- **Promote-to-package shortlist (recommendations.md):** `Badge`, `SegmentedControl` confirmed. `Tabs`
  has NO surviving consumer (S17 Captain-mgmt Iteration A — the only tabbed surface — was dropped per
  decision #2); do NOT build Tabs. Additionally promote to `@camp404/ui`: `IconBadge`, `Alert`,
  `NavCard`, `ProgressBar`, `EmptyState`, `CaptainLock`, `TopChrome`, `DetailHeader`, `GhostBack`,
  `SectionHeader`, `GridTile`, `OptionCardGroup`, `InputField`, `CodeDisplay`, `Spinner`, `SwitchField`,
  `Toast`, `OAuthButton`/`GoogleMark`.
- **NEW status tokens** (`success`/`warning`/`info`) must land in `globals.css` before Badge/Alert/
  StatTile/FilterChip/Toast/AvailabilityHint ship — they currently rely on raw hex on the boards.
- **Three+ rows stay distinct:** RosterRow, TreeRow, NotificationRow, and ReorderRow (=DraggableTileRow)
  have different anatomy and data; only shared atoms (Avatar/Badge/IconBadge), not a row shape.
- **DROPPED:** `DictateButton` (dead orphan), terminal-console bespoke read-only panel
  (`MemberReadOnly`/`RedactedID`/`LockedActions` → use CaptainLock + CodeDisplay redacted),
  S17 Captain-mgmt Iteration A wide table, home `ControlPanel` quadrant + TALK centre, `Tabs`,
  bug-dialog screenshot-attach checkbox (no code backing).
- **Voice-as-hero orphan:** voice survives only via DictatePill→RecorderPanel on long_text fields and
  the bug dialog (decision #5); there is no home mic. Flagged in surfaces.json orphanRisks.
- **Build-time reconciliations carried (NOT forks):** scale→SegmentedControl & toggle→SwitchField
  (data stays a string option value); single_select→OptionCardGroup radio rows; ProgressBar
  "Question N of N" on the blocking runner; raw-hex tints → status tokens; AvatarUpload error-state
  re-upload button re-added; `$accent` (not amber) for captain/match on tree & announcements;
  RankPill `#ff008c2e` → `$rank-captain` token.
- **The one schema change** (decision #4) surfaces only in `AssignCaptainDialog` + `MemberProfile`
  (`captain_promotion_requests` / `promotion_request_status`); everything else is presentation-only.
