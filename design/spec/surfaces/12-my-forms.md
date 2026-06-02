# My forms (list + replay) — functional brief

- **Route(s):** `/tools/forms` (list) · `/tools/forms/[key]` (detail / replay)
- **Canonical board(s):** S15 My forms (board 24, 430×1300) — single board contains both LIST VIEW and DETAIL VIEW stacked with a `ViewDivider`
- **Superseded / dropped:** nothing dropped; this surface has no prior iteration
- **Breakpoints:** 430 px mobile-first; no desktop variant drawn — surface scales with standard content-column constraints

---

## Purpose

A read-and-revisit surface for questionnaires the current member has already completed. The list shows every completed form with its last-edited timestamp. The detail page re-opens that form in the shared questionnaire wizard pre-seeded with saved answers; on final submit the app diffs new vs. stored answers, re-saves the form (idempotent), and appends a per-field change-log entry. No full version history is stored — only a running `field: from → to` log surfaced to the member below the wizard.

---

## Layout & modules

### List page (`/tools/forms`)

```
GhostBack ("Tools" ← chevron-left)
Content (gap:16 pad:[4,16,24,16])
  Intro
    h1  "My forms"                           [Inter 24/700 $foreground]
    p   subtitle copy                         [Inter 14/normal $muted-foreground]
  FormCard × N   (one per completed form)
  — OR —
  EmptyState                                  (when no completed forms)
```

**GhostBack** — inline back-link row (`gap:4 pad:[14,12]`). Chevron-left icon (`$muted-foreground`) + label "Tools" (`Inter 15/500 $muted-foreground`). Navigates to `/tools`.

**Intro** — static copy block. Title + subtitle: "Questionnaires you've completed this year. Open one to review and update your answers — we'll keep a log of what you change."

**FormCard** — tappable card (`gap:14 pad:18 r:$radius fill:$card stroke:$border`) for each completed form. Contains a Text block (title, description, "Last edited {date}") and a `chevron-right` icon. Full-width tap target links to `/tools/forms/{key}`.

**EmptyState** — renders when `forms.length === 0`. Text overrides: heading "No forms yet", body "You haven't completed any forms yet."

---

### Detail / replay page (`/tools/forms/[key]`)

```
GhostBack ("My forms" ← chevron-left)
Content (gap:16 pad:[4,16,24,16])
  Intro
    h1  form.title                            [Inter 24/700 $foreground]
    p   "Step back through the form…"         [Inter 14/normal $muted-foreground]
  SavedBanner                                 (visible only after successful save)
  FormReplay                                  (QuestionnaireWizard in replay mode)
  ChangeLog
    heading + intro copy
    Entries × N  (per edit session)
    — OR —
    EmptyLog                                  (when no edits yet)
```

**GhostBack** — chevron-left + label "My forms". Navigates to `/tools/forms`.

**Intro** — `form.title` as h1; subtitle: "Step back through the form and update anything that's changed. Last edited {date}." where date = `updatedAt ?? completedAt`, formatted `en-ZA` medium date + short time.

**SavedBanner** — shown when `saved === true` after a successful replay submit. `fill:#00dcff26 stroke:$border r:$radius gap:10 pad:14`. `circle-check-big` icon (`$accent` colour) + "Saved. Your answers — and the change log below — are up to date." (`Inter 13/normal $foreground`). Has `role="status"`. Hidden on initial page load; appears after `onComplete` fires and `router.refresh()` re-renders.

**FormReplay** — client shell wrapping `QuestionnaireWizard` (unit 04). Configured with `persistProgress={false}`, `submitLabel="Save changes"`, `action={saveFormReplay}`. Pre-seeded with the stored responses. On `onComplete` → set `saved=true` + `router.refresh()`.

**ChangeLog** — presentational section below the wizard. Heading "Change log" (`Inter 17/700 $foreground`); intro "Every time you update this form we record what changed. We don't keep old versions — just this running history." (`Inter 13/normal $muted-foreground`).

**ChangeLog entry** — card per edit session (`pad:14 r:$radius fill:$card stroke:$border gap:6`). Timestamp line (`Inter 11/500 $muted-foreground`); then per-field rows: field label (`Inter 14/700 $foreground`) + Diff row (`from` text `$muted-foreground` · arrow "→" `$muted-foreground` · `to` text `$foreground 500`). Empty/unanswered values display as em dash "—".

**EmptyLog** — when `edits.length === 0`. Inline muted box (`pad:[20,16] fill:$muted r:$radius`): "No edits yet. Changes you make here will show up in this list." (`Inter 13/normal $muted-foreground`). Not the shared `EmptyState` component — this is an inline text-only variant drawn directly on the board.

---

## Components used

| Component | Kind | Role | Key props / variants |
|---|---|---|---|
| `EmptyState` | Reusable (board 08) | List-page empty state | overrides: heading "No forms yet", body "You haven't completed any forms yet." |
| `FormCard` | New (this surface) | Tappable card row on list | `title`, `description`, `lastEdited: Date`, `href` |
| `GhostBack` | New (shared pattern) | Back-navigation row | `label`, `href`; appears on both pages |
| `SavedBanner` | New (this surface) | Post-save confirmation strip | `visible: boolean`; uses `circle-check-big` lucide icon |
| `ChangeLog` | New (this surface) | Read-only edit history section | `edits: FormEdit[]`; empty vs. populated branch |
| `ChangeLogEntry` | New (sub-component of ChangeLog) | Single edit-session card | `edit: FormEdit` (timestamp + per-field diffs) |
| `EmptyLog` | New (inline variant) | ChangeLog empty state | static copy only; not the shared EmptyState |
| `QuestionnaireWizard` | Reusable (unit 04) | Step-through wizard engine | `initialResponses`, `persistProgress={false}`, `submitLabel="Save changes"`, `action`, `onComplete` |

Lucide icons used: `chevron-left`, `chevron-right`, `circle-check-big`.

---

## States

### Global matrix

| State | List page | Detail page |
|---|---|---|
| **Loading** | Server-rendered (`force-dynamic`); no in-page spinner. Wizard button `isPending` handled by unit 04. | Same — awaited server-side. |
| **Populated** | FormCard list | Pre-filled wizard + ChangeLog entries |
| **Empty** | `EmptyState` ("No forms yet") | N/A — incomplete forms redirect away |
| **Validation error** | N/A | Per-field errors from `validateResponses` on wizard fields; `_root`/`_form` in wizard banner |
| **Submitting** | N/A | Wizard Back/Submit disabled (`isPending`) |
| **Success** | — | `SavedBanner` visible; ChangeLog refreshes via `router.refresh()` |
| **Disabled** | — | Back disabled on wizard page 1 or while pending; Submit disabled while pending |

### Gating states (both pages and the save action)

| Gate | Trigger | Resolution |
|---|---|---|
| **Unauthenticated** | No valid session | `redirect` to sign-in (handled by `getAuthenticatedUserOrRedirect`) |
| **Invite-gated** | `!hasCampAccess` | `redirect("/signup/required")` — on both pages AND inside `saveFormReplay` |
| **Onboarding-incomplete** | Burner profile `!completedAt` | `redirect("/onboarding/questionnaire")` — page-level only, not re-checked in the save action |
| **Pending / rejected approval** | `!isApproved` | `redirect("/pending-approval")` — page-level only |
| **Not-yet-completed form (detail)** | Loaded state has no `completedAt` | `redirect("/tools/forms")` — prevents replaying an incomplete form |
| **Unknown key (detail)** | `key` not in registry | `notFound()` → 404 page; save action returns `{ ok:false, errors:{ _root:"Unknown form." } }` |

### Rank gating

**No rank gate on this surface.** Per locked decision 3, preview-but-locked applies to captain/higher surfaces. My forms is open to any approved member — replayability depends on completion status, not rank.

### ChangeLog-specific states

| State | Display |
|---|---|
| **Empty log** | EmptyLog inline variant: "No edits yet. Changes you make here will show up in this list." |
| **Populated log** | ChangeLogEntry cards, most-recent-first, capped at 20 entries |
| **No-op replay** | Wizard re-submits; no ChangeLog row appended (diff was empty); log unchanged |

---

## User actions

| Action | Result |
|---|---|
| Tap FormCard on list | Navigate to `/tools/forms/{key}` |
| Tap back "Tools" (list) | Navigate to `/tools` |
| Tap back "My forms" (detail) | Navigate to `/tools/forms` |
| Tap Next in wizard | Advance wizard page locally; no server call (persistProgress=false) |
| Tap Back in wizard | Return to previous wizard page locally |
| Tap "Skip" (lone optional unanswered) | Wizard advances without requiring an answer (wizard mechanic — unit 04) |
| Tap "Save changes" (final wizard page) | Calls `saveFormReplay(formKey, responses, true)` → validate → diff → save → record → revalidate. On success: SavedBanner appears, ChangeLog refreshes. On error: per-field or banner errors surface in the wizard. |
| Read ChangeLog | Scroll to the log section; entries are read-only — no edit or delete actions |

---

## Data & enums

### `questionnaire_edits` table (`schema.ts:530–562`, export `questionnaireEdits`)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `defaultRandom()` |
| `user_id` | `uuid` FK → `users.id` | Subject whose answers changed; `onDelete: cascade` |
| `questionnaire_key` | `text` | Registry key, e.g. `"burner_profile"` |
| `version` | `text` | Catalogue version stamped at edit time (e.g. `"2026.05.29-v8"`) |
| `edited_by_user_id` | `uuid` FK → `users.id` | Who performed the edit; nullable (`onDelete: set null`) |
| `changes` | `jsonb` (`QuestionnaireFieldChange[]`) | Per-field diffs; default `[]`; not null |
| `created_at` | `timestamp` | `defaultNow()`; used for ordering (desc) |

Index: `questionnaire_edits_user_key_created_idx` on `(user_id, questionnaire_key, created_at)`.

### `QuestionnaireFieldChange` shape (`packages/types/src/questionnaire.ts`)

| Field | Type | Notes |
|---|---|---|
| `fieldId` | `string` (min 1) | Question id, e.g. `"camp_role"` |
| `label` | `string` | Question prompt captured at edit time |
| `from` | `string` | Human-readable display value before edit; `"—"` for empty |
| `to` | `string` | Human-readable display value after edit |

### `burner_profiles` table (`schema.ts:352–364`) — touched on replay save

| Column | Purpose |
|---|---|
| `user_id` PK | Owner |
| `version` | Updated to current catalogue version on re-save |
| `responses` | Full JSONB blob, overwritten with edited answers |
| `completed_at` | Set to `now()` on re-save (`markComplete: true`) — **bumps on every replay** (see Edge cases) |
| `updated_at` | Set to `now()` on re-save |

### `CompletedFormSummary` (list-page shape, `lib/forms.ts`)

`{ key, title, description, completedAt: Date, updatedAt: Date | null }`

"Last edited" display = `updatedAt ?? completedAt`.

### `FormEdit` (detail-page shape, `lib/forms.ts`)

`{ id, version, editedByUserId, changes: QuestionnaireFieldChange[], createdAt }`

### Registry (`lib/forms.ts`)

`ReplayableForm`: `{ key, title, description, questionnaire, load(userId), save(userId, responses) }`

Currently one live entry: `BURNER_PROFILE` — `key="burner_profile"`, `title="Burner profile"`, `description="The onboarding questionnaire — who you are in the dust, your teams, skills and logistics."`. Additional forms (dietary, driver) slot in via the registry with no UI change.

### ID-document columns (users table, touched indirectly)

Government ID number stored encrypted (`passportEncrypted` / `saIdEncrypted`). Merged into responses on `load`; split out and written to `users` on `save`; **explicitly redacted from `questionnaire_edits`** (`id.number` filtered from diff output). `id.type` stays in responses and may appear in the change log.

### Enums / constants — nothing NEW

All enums and tables used here are existing. The only schema addition in the redesign (decision 4) is `captain_promotion_requests` / `promotion_request_status`, which does not touch this surface.

| Constant | Value |
|---|---|
| Registry key (burner profile) | `"burner_profile"` |
| Questionnaire version | `"2026.05.29-v8"` |
| `ID_NUMBER_KEY` | `"id.number"` (excluded from change log) |
| `ID_TYPE_KEY` | `"id.type"` (may appear in change log) |
| ID type values | `"passport"` · `"sa_id"` · `null` |
| Change-log row cap | 20 (default `listFormEdits` limit) |
| Empty display sentinel | `"—"` (em dash) for unanswered fields |
| Date format | `Intl.DateTimeFormat("en-ZA", { dateStyle:"medium", timeStyle:"short" })` |
| Submit label (replay) | `"Save changes"` |
| `persistProgress` | `false` for the replay flow |
| Reserved error keys | `_root` (action non-field failures) · `_form` (wizard banner) |

---

## Validation & edge cases

- **Only completed forms are listed / replayable.** `listCompletedForms` skips any registry entry without `completedAt`; the detail page redirects if loaded state has no `completedAt`.
- **Unknown key → 404.** List → detail links can only produce known keys, but a hand-typed URL gets `notFound()` on the page and `_root:"Unknown form."` in the save action.
- **Final-submit-only persistence.** `persistProgress=false` means intermediate Next presses never call the server action. The diff always compares stored answers against the fully-stepped final state.
- **No-op replay records no log row.** When `diffResponses` yields zero changes the form is still re-saved (idempotent) but `recordFormEdit` is skipped entirely.
- **ID-number redacted from the log.** `id.number` is filtered out of the diff output before any row is written. The owner's ID is still pre-filled in the replay form (merged in via `load`).
- **Diff semantics.** Multi-selects compared as sets (reordering is not a change). Empty/absent values (`undefined`, `null`, `""`, `[]`) are treated as equal. Only questions present in the current catalogue version are considered — stale keys from older versions are ignored.
- **`completedAt` overwrite on replay.** `upsertBurnerProfile` with `markComplete:true` sets `completed_at = now()`, not preserving the original. The inline comment in `lib/forms.ts` claims idempotency, but the SQL disagrees. This means `completedAt` will drift toward the most-recent replay date. Affects "Last edited" display only if `updatedAt` is somehow null (it is always set). Flag for build reconciliation.
- **Version stamping on replay.** The change-log row and `burner_profiles.version` are both updated to the current catalogue version. A replay can therefore satisfy a re-activated required-action row at a newer version.
- **Re-satisfies onboarding gate.** `save` calls `satisfyBurnerProfileAction` — a replay after a captain re-activates the questionnaire at a new version clears the new pending required-action row.
- **`editedByUserId` always equals subject here.** The nullable column exists for a future captain-on-behalf edit flow not wired in this surface.
- **Change-log cap at 20.** Entries beyond 20 (by `created_at desc`) are not shown. No pagination in this design.
- **`final=false` action branch is effectively dead.** `persistProgress=false` means the wizard never calls `saveFormReplay` with `final=false`. The guard exists as future-proofing for callers using `persistProgress=true`.
- **Save action does NOT re-gate onboarding/approval** — only re-checks auth + `hasCampAccess`. Page-level gates are the primary enforcement.
- **Local pre-submit validation (unit 04 wizard).** Required questions blocked before Next/Submit ("This question is required"). Cross-field rule validates `id.number` against `id.type` via `validateIdNumber` before advancing.

---

## Flows

### Entry → list

```
/tools (Tools hub)
  → tap "My forms" tile
  → /tools/forms
      gate chain: auth → ensureCampUser → hasCampAccess → burnerProfile.completedAt → isApproved
      [pass] → render FormCard list or EmptyState
      [fail] → redirect per gate
```

### List → replay

```
/tools/forms
  → tap FormCard
  → /tools/forms/{key}
      gate chain: (same as list) + getReplayableForm(key) + state.completedAt
      [unknown key] → 404
      [state missing completedAt] → redirect /tools/forms
      [pass] → render Intro + FormReplay (pre-filled) + ChangeLog
```

### Replay → save → log refresh

```
wizard: Next × (n-1 pages) → "Save changes" (final page)
  → saveFormReplay(key, responses, true)
      validate → diff → save → [if changes] recordFormEdit
      → revalidatePath /tools/forms/{key}, /tools/forms
      → { ok: true }
  → onComplete: saved=true, router.refresh()
  → SavedBanner visible, ChangeLog re-renders with new entry (if changes existed)
```

### Replay → validation failure

```
"Save changes"
  → saveFormReplay → validateResponses fails
  → { ok: false, errors: { fieldId: "…" } or { _root: "…" } }
  → wizard surfaces per-field errors or banner error
  → user corrects → re-submits
```

### Exit

- Back link "My forms" → `/tools/forms` (from detail)
- Back link "Tools" → `/tools` (from list)
- Browser back / nav — no unsaved-data warning (replay progress is local-only until final submit)

---

## Divergences from feature-set reference

| Reference claim | Board / decision | Resolution |
|---|---|---|
| Reference describes `FormReplay` as a distinct client component file (`form-replay.tsx`) separate from the page | Board shows a single DETAIL VIEW frame with the wizard inline | No UI divergence; `FormReplay` is the client shell wrapping the wizard within the detail page layout — board does not decompose files, only layout. No change needed. |
| Reference notes the EmptyLog is a muted bordered box, not the shared `EmptyState` component | Board confirms: `EmptyLog` is a bespoke inline box (`fill:$muted r:$radius`), distinct from the `EmptyState` component used for the list empty state | Spec uses `EmptyState` for the list only; `EmptyLog` is a distinct inline variant for the change log. |
| Reference mentions `ChevronRight`/`ChevronLeft`/`CheckCircle2` (lucide PascalCase names) | Board uses `chevron-left`, `chevron-right`, `circle-check-big` (kebab lucide IDs) | Board wins on icon identity. The board's `circle-check-big` corresponds to lucide's `CircleCheckBig`; spec records the board's drawn icon name. |
| Reference does not call out the `ViewDivider` (8px `$muted` strip between the two views) | Board explicitly draws `ViewDivider {w:fill_container h:8 fill:$muted}` | `ViewDivider` is a Pencil layout separator between the stacked LIST and DETAIL frames on the single board — it is not a rendered UI element in the running app. No action. |
| Reference's gating note says save action re-checks only `hasCampAccess` (not onboarding/approval) | Board does not depict gating; reference contract is binding here | Confirmed: save action gate is auth + `hasCampAccess` only. Page-level gates cover the rest. |
| `completedAt` idempotency claim in `lib/forms.ts` comment vs. actual SQL (`= now()` on every re-save) | Neither board nor reference catches this discrepancy | Flagged as a build reconciliation (see Edge cases). Does not affect spec design. |

---

## Open questions / build reconciliations

1. **`completedAt` overwrite on replay** — `upsertBurnerProfile` unconditionally sets `completed_at = now()` on replay (`markComplete:true`). This silently changes the "original completion" timestamp. Reconcile: either preserve the original `completedAt` in the upsert (`onConflictDoUpdate` should only update `completedAt` when it was previously null), or accept the current behaviour and update the inline comment. Low-urgency; does not affect the UI spec.

2. **Change-log cap at 20, no pagination** — the board and reference both cap at 20 with no UI for older entries. If a member has replayed many times this silently hides history. Accept for now; revisit if members flag it. No spec change needed at this stage.

3. **Future registry entries** (dietary / driver questionnaires) — the registry and UI are ready; `listCompletedForms` will surface them automatically when `load` returns a `completedAt`. Spec is forward-compatible; no action.

4. **`editedByUserId` captain-on-behalf path** — nullable column exists in schema; no UI flow is wired here. Flag for future captain-tools surface if the camp wants captains to be able to edit a member's form on their behalf.

5. **Multi-select rendering in ChangeLog** — option labels joined with `", "`; order is sorted before comparison so reordering is invisible. Confirm with content owners that this is the desired display for multi-select diffs.
