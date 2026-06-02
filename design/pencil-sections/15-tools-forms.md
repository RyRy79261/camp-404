### 15. My forms + form replay
**Purpose:** A surface to revisit questionnaires the member has already completed, re-open one pre-filled in the wizard, update answers, and see a running per-field change log.
**Layout & elements:** Mobile single column. List page (`/tools/forms`): back link "Tools" (ChevronLeft) → "/tools"; title "My forms"; subtitle "Questionnaires you've completed this year. Open one to review and update your answers — we'll keep a log of what you change."; one clickable card per completed form (ChevronRight) showing `form.title`, `form.description`, and "Last edited {date}". Detail page (`/tools/forms/[key]`): back link "My forms" → "/tools/forms"; title = form.title; subtitle "Step back through the form and update anything that's changed. Last edited {date}."; the questionnaire wizard pre-filled with saved answers; success banner (role="status", CheckCircle2) "Saved. Your answers — and the change log below — are up to date."; "Change log" section with intro "Every time you update this form we record what changed. We don't keep old versions — just this running history." and an ordered list of edit sessions (timestamp + per-field bold `label`, struck-through `from` → foreground `to`, arrow "→").
**Every action (preserve all):**
- Tap a form card → open `/tools/forms/{key}` replay.
- Wizard "Next"/"Back" → local navigation only (persistProgress=false; no per-page save); lone optional unanswered question shows "Skip".
- Final submit "Save changes" → validate → diff → save → record change-log row → success banner + log refreshes in place.
- Read change log: read-only, no edit/delete.
- Disable conditions: Back disabled on first page / while pending; submit disabled while pending.
**States to design:**
- Empty (list): no completed forms → "You haven't completed any forms yet."
- Empty (change log): no edits → "No edits yet. Changes you make here will show up in this list."
- Loading: server-rendered (force-dynamic), no spinner.
- Populated: form cards / pre-filled wizard + log entries.
- Validation-error: per-field errors on questions; `_root`/`_form` in wizard banner.
- Submitting/pending: Back/Submit disabled.
- Success: saved banner + refreshed log.
- Invite-gated → redirect "/signup/required"; onboarding-incomplete → "/onboarding/questionnaire"; pending/rejected (not approved) → "/pending-approval"; unknown key → notFound() (404); not-yet-completed → redirect "/tools/forms". No rank/captain lock.
**Options & exact values:** Registry key: "burner_profile" (title "Burner profile", description "The onboarding questionnaire — who you are in the dust, your teams, skills and logistics."). Questionnaire version "2026.05.29-v8". Error keys `_form`, `_root`. ID keys "id.number" (redacted from log), "id.type". ID types "passport" (default) | "sa_id" | null. Change-log limit 20 (most-recent-first). Empty value sentinel "—". Multi-select join ", ". Date format `en-ZA`, dateStyle medium / timeStyle short. submitLabel "Save changes".
**Validation & rules:**
- Only completed forms list/replay; uncompleted detail redirects to list.
- Required empty → "This question is required"; ID cross-field validated against id.type before advancing.
- Save: unknown form → "Unknown form."; not completed → "This form hasn't been completed yet."; malformed → "Malformed response payload".
- Diff: multi-selects as sets (reorder ≠ change); empty/null/""/[] equal; stale keys ignored; id.number filtered out of log.
- No-op replay re-saves but records no log row. Re-save re-satisfies onboarding gate and stamps current version.
**Do-not-drop:** Pre-filled replay of completed questionnaires plus an immutable, ID-redacted per-field change log (from → to). Carry forward: a replay bumps `completedAt`/`updatedAt` to re-submit time (comment claims idempotent but code overwrites — low-confidence intent); the `final===false` action branch is effectively dead in this flow.
