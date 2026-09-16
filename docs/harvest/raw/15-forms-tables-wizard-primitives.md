# Unit 15 — Heavy interaction primitives: data table, wizard, file upload, markdown editor, dictation

**Donor:** `quagga-portal` / AfrikaBurn Contributors App
**Donor root (this machine):** `/tmp/claude-1000/-home-ryan-repos-Personal-camp-404/845134f9-90e2-4e43-94d4-18d487ff8c56/scratchpad/ab-app`
**Target:** Camp 404 (`/home/ryan/repos/Personal/camp-404`)
**Harvest date:** 2026-09-08. Every claim below is cited `path:line` against source read in full.

---

## 1. Purpose of this unit

This is the donor's *heavy interaction layer* — the components that carry more than a
single value: a responsive data table, a section-navigator wizard, a Blob-backed file
uploader, a Tiptap markdown editor, a dictation hook, and the small pure-logic modules
(`form-logic.ts`, `wizard.ts`) those components are built on.

Three things make this unit unusually high-value for Camp 404:

1. **It is almost entirely tenant-agnostic.** A grep for `groupId|orgId|group_id|tenant|
   isOrg|orgSlug|supplierId|MembershipRole|OrgPermissions` across all of
   `packages/ui/src` returns zero hits. The only workspace couplings in this unit are
   three type imports (`RegistrationStatus` in `status-badge.tsx:2`,
   `ReportType`/`ReportDiagnostics` used by the report components) and four brand CSS
   tokens. Nothing here carries `edition_id`, `group_id`, or the org/participant split.
2. **It fills named holes on Camp 404's live backlog.** `skeleton.tsx` + the 34
   `loading.tsx` files + `ErrorRecovery` are exactly WP7 (#131, "ZERO `loading.tsx`
   files exist across 24 `force-dynamic` pages"). `ResponsiveDataTable` is exactly
   WP9 (#133, roster CSV/sort/mobile) and WP5 (#129, roster data). `Wizard` +
   `deriveWizardProgress` + the registration wizard's autosave machinery are directly
   comparable to Camp 404's `QuestionnaireWizard`.
3. **The two repos are forks of the same scaffold.** `packages/ui/src/lib/utils.ts` is
   byte-identical across both. `dialog.tsx`, `popover.tsx` and `toast.tsx` differ from
   Camp 404's only by semicolons and comment text. So "porting" here is a
   `s|@quagga/|@camp404/|g` + `pnpm format` pass for most files.

---

## 2. File inventory (line counts, `wc -l`)

### 2.1 The core of this unit — `packages/ui/src/`

| File | Lines | Status vs Camp 404 |
|---|---:|---|
| `components/responsive-data-table.tsx` | 376 | **donor-only, drop-in** |
| `components/wizard.tsx` | 165 | donor-only; Camp 404 has `stepper.tsx` (60) which is *not* the same thing |
| `lib/wizard.ts` | 84 | donor-only, pure, zero deps |
| `lib/form-logic.ts` | 96 | donor-only, pure, zero deps |
| `lib/use-dictation.ts` | 170 | donor-only; Camp 404 has `use-voice-recorder.ts` (250) — richer |
| `components/file-upload.tsx` | 417 | donor-only; Camp 404 has `avatar-upload.tsx` only |
| `components/skeleton.tsx` | 204 | **donor-only; Camp 404 has NO skeleton at all** |
| `components/table.tsx` | 118 | donor-only (dependency of `responsive-data-table`) |
| `components/field.tsx` | 74 | donor-only; Camp 404 has `input-field.tsx` |
| `components/textarea-with-count.tsx` | 76 | donor-only |
| `components/password-input.tsx` | 141 | donor-only |
| `components/phone-input.tsx` | 124 | donor-only (+2 npm deps) |
| `components/toggle-group.tsx` | 81 | donor-only (+1 Radix dep) |
| `components/tabs.tsx` | 54 | donor-only (+1 Radix dep) |
| `components/accordion.tsx` | 68 | donor-only (+1 Radix dep, +2 CSS tokens) |
| `components/audience-select.tsx` | 81 | donor-only |
| `components/disabled-hint-tile.tsx` | 52 | donor-only |
| `components/status-badge.tsx` | 66 | donor-only, needs enum re-expression |
| `components/quilt-band.tsx` | 68 | donor-only, AfrikaBurn-branded |
| `components/empty-state.tsx` | 52 | in both; donor adds `action?` prop |
| `components/dialog.tsx` | 155 | in both, near-identical |
| `components/popover.tsx` | 54 | in both, near-identical |
| `components/select.tsx` | 156 | in both; Camp 404 has `tw-animate-css` classes the donor lacks |
| `components/toast.tsx` | 164 | in both, near-identical |
| `components/markdown-editor/markdown-editor.tsx` | 196 | donor-only (+5 npm deps) |
| `components/markdown-editor/markdown-view.tsx` | 46 | donor-only |
| `components/markdown-editor/extensions.ts` | 35 | donor-only |
| `components/markdown-editor/markdown.ts` | 33 | donor-only |
| `lib/report-client.ts` | 138 | donor-only (dictation's transport half lives here) |
| `lib/utils.ts` | 6 | **byte-identical to Camp 404's** |

Subtotal for the files named in the brief plus their hard dependencies: **~3,500 lines**.

### 2.2 Tests (`packages/ui/src/components/__tests__/`)

| Test file | Lines | Covers |
|---|---:|---|
| `use-dictation.test.ts` | 355 | the dictation hook — 11 cases, incl. two privacy guards |
| `file-upload.test.tsx` | 389 | FileUpload — 20 cases, every refusal asserted through a real `<Toaster/>` |
| `markdown-editor.test.tsx` | 244 | editor + view, incl. jsdom `getClientRects` shims |
| `responsive-data-table.test.tsx` | 192 | `projectColumnsToCard` (5 cases) + the component (6 cases) |
| `toast.test.tsx` | 187 | store, `normalizeDuration`, dismiss semantics, roles |
| `tier2-3.test.tsx` | 179 | **wizard state derivation (4 cases)** + markdown round-trip + bulletin |
| `skeleton.test.tsx` | 165 | all 9 skeleton primitives, a11y + shape counts |
| `form-controls.test.tsx` | 138 | Field / TextareaWithCount / PasswordInput / Switch / AckRow |
| `phone-input.test.tsx` | 136 | the E.164 value contract |
| `audience-select.test.tsx` | 95 | the "0 ≠ not-yet-resolved" distinction |
| `toggle-group.test.tsx` | 92 | context-beats-prop precedence, deliberately pinned |
| `form-logic.test.ts` | 78 | `countWords` / `wordCountStatus` / `passwordStrength` |
| `components.test.tsx` | 66 | Badge / PaymentDetailsBlock / DisabledHintTile / EmptyState |

**Subtotal: 2,316 lines of tests directly on this unit.**

### 2.3 Call sites and server halves (donor apps)

| File | Lines | Role |
|---|---:|---|
| `apps/web/components/registration/registration-wizard.tsx` | 939 | the flagship `Wizard` consumer + autosave engine |
| `apps/web/components/registration/field-kit.tsx` | 605 | controlled field primitives feeding the wizard |
| `apps/org/components/supplier-documents/documents-table.tsx` | 418 | RDT with inline edits |
| `apps/org/components/suppliers-table.tsx` | 256 | RDT with `renderExpanded` |
| `apps/org/components/accounts-table.tsx` | 204 | RDT, conditional column set |
| `apps/org/components/registrations-table.tsx` | 76 | RDT, minimal reference |
| `apps/org/components/console-skeleton.tsx` | 76 | app-level skeleton vocabulary on top of the kit |
| `apps/web/app/api/blob/upload/route.ts` | 104 | FileUpload's server boundary (type+size on the token) |
| `apps/org/app/api/blob/upload/route.ts` | 127 | same, plus per-domain authz |
| `packages/core/src/report-server/transcribe.ts` | 238 | dictation's server half (Groq Whisper over raw fetch) |
| `apps/web/components/boundary/error-recovery.tsx` | 81 | the shared `error.tsx` panel |
| `apps/web/components/boundary/not-found-view.tsx` | ~60 | the shared `not-found.tsx` panel |
| **34 × `loading.tsx`** | — | 14 in `apps/web`, 12 in `apps/org`, 5 in `apps/suppliers`, 3 root |
| **10 × `error.tsx` / `global-error.tsx`** | — | root + segment boundaries in all three apps |

---

## 3. Capability list (exhaustive, cited)

### 3.1 `ResponsiveDataTable` — one column declaration, two layouts

- **Declared once, rendered twice.** A caller declares `ResponsiveColumn<T>[]` and gets a
  real `<table>` at `md+` and a stacked card list below `md`
  (`responsive-data-table.tsx:197` `hidden md:block` / `:263` `md:hidden`).
- **Four card roles.** `ResponsiveColumnRole = "title" | "badge" | "actions" | "default"`
  (`:37`). `title` → prominent card heading; `badge` → chip beside the title;
  `actions` → pinned to the card footer above a `border-t`; `default` → a `<dl>`
  label/value pair using the column `header` as the `<dt>` (`:307-330`).
- **`mobileHidden` wins over any role** (`:94-97`) — a hidden column still gets its `<th>`
  and `<td>` at `md+` but is excluded from every card slot.
- **`hideHeader`** renders the `<th>` label `sr-only` (`:211-215`) — used for actions
  columns.
- **`align: "left" | "right" | "center"`** applies to both `<th>/<td>` and the card value
  (`:117-124`, `:318-323`). Note the asymmetry: in the card, only `left` is honoured
  literally — everything else falls back to `text-right` (`:320-322`).
- **Per-row expansion.** Passing `renderExpanded` adds a chevron toggle — a leading
  `<th className="w-8"/>` column at `md+` (`:202`, `:227-234`) and a header-right control
  on mobile (`:297-302`) — and renders a full-width panel beneath the row
  (`colSpan = columns.length + (expandable ? 1 : 0)`, `:186`, `:248-254`) or beneath the
  card (`:341-345`). Open state is a `ReadonlySet<string>` keyed by `getRowKey`
  (`:165-179`).
- **Empty state replaces BOTH layouts** — early return before either renders
  (`:190-192`), so a test asserting `queryByRole("table")` is null actually holds.
- **`rowClassName(row)`** applies to the `<tr>` AND the mobile `<li>` (`:226`, `:273-276`).
- **Accessible naming.** `caption` renders as `<caption className="sr-only">` (`:199`);
  the mobile `<ul>` takes `aria-label` from `mobileAriaLabel ?? caption` when caption is a
  plain string (`:187-188`, `:265`).
- **`projectColumnsToCard<T>()` is exported separately** (`:82`) as a pure function so the
  projection is unit-testable with no React.

### 3.2 `Wizard` + `deriveWizardProgress` — the section navigator

- **Four states**: `WizardSectionState = "done" | "current" | "todo" | "blocked"`
  (`lib/wizard.ts:7`).
- **Precedence, verbatim** (`lib/wizard.ts:51-84`): `done` always wins; else the resolved
  current section is `current`; else `blocked`; else `todo`.
- **Current-section resolution is self-healing.** If `currentId` is omitted, or points at a
  section that is `done` or `blocked`, the current section becomes the *first actionable*
  (not-done, not-blocked) section — so the navigator always highlights the next step a
  person can act on (`lib/wizard.ts:73-80`).
- **Progress copy is derived, not passed**: `` label: `${completed} of ${total} complete` ``
  (`lib/wizard.ts:81`). `index` is 1-based (`:78`).
- **Two variants from one derivation**: `rail` (desktop vertical list with labels,
  `wizard.tsx:115-164`) and `strip` (mobile compact numbered row, `:85-113`).
- **Server-component-safe.** No hooks anywhere in `wizard.tsx`; there is no `"use client"`
  directive on the file.
- **Interactivity is opt-in.** Pass `onSelect` and each step becomes a `<button>`; omit it
  and steps render as static markers with no handler (`wizard.tsx:95-107`, `:139-158`).
- **Blocked steps are never buttons** even when `onSelect` is supplied
  (`onSelect && s.state !== "blocked"`, `:95`, `:139`).
- **a11y**: `<nav aria-label="Registration progress">` (`:88`, `:117`), `aria-current="step"`
  on the current step (`:99`, `:143`, `:154`), markers `aria-hidden` (`:45`), and the strip
  buttons carry `` aria-label={`${s.index}. ${s.label}`} `` because the visible content is
  only a number (`:100`).
- **Marker glyphs**: `done` → `<Check className="h-3.5 w-3.5"/>`, `blocked` → `<Lock
  className="h-3 w-3"/>`, otherwise the 1-based index (`:52-58`). Sizes `h-7 w-7`
  (default) / `h-6 w-6` (`sm`, used by `strip`) (`:48`).

### 3.3 `form-logic.ts` — pure form maths

- **`countWords`** — trim, then split on `/\s+/`; empty/whitespace/nullish is 0;
  hyphenated words are one word (`form-logic.ts:15-20`). Deliberately duplicated from
  `@quagga/core`'s `word-count.ts:13-18` (identical body) to avoid a UI→core dependency;
  the file says so at `:5-9`.
- **`wordCountStatus(value, {min, max})`** → `{count, max, over, under}`;
  `over = max != null && count > max`, `under = min != null && count < min`
  (`:34-48`).
- **`PASSWORD_MIN_LENGTH = 15`** (`:50`) — sourced from the accounts-security spec:
  *15+ chars, no composition rules, no forced rotation, no confirm-twice* (`:48-49`).
- **`passwordStrength(password, min = 15)`** is **length-based ONLY** (`:74-96`):

  | length | score | label | meetsMin |
  |---|---|---|---|
  | 0 | 0 | `""` | false |
  | 1 … min-1 | 1 | `"Too short"` | false |
  | min … 19 | 2 | `"Fair"` | true |
  | 20 … 29 | 3 | `"Good"` | true |
  | ≥ 30 | 4 | `"Strong"` | true |

  `percent = Math.round(Math.min(length, 32) / 32 * 100)` where
  `STRENGTH_FULL_AT = 32` (`:68`, `:79-81`). Note percent is computed *before* the
  length===0 early return but returned as 0 in that branch (`:83`).

### 3.4 `useDictation` — the recording half, with no opinion about pixels

- **Five states**: `DictationState = "idle" | "requesting" | "recording" |
  "transcribing" | "unsupported"` (`use-dictation.ts:24-25`).
- **`supported`** is `typeof window !== "undefined" && typeof MediaRecorder !==
  "undefined" && Boolean(navigator.mediaDevices?.getUserMedia)` (`:61-64`). The
  contract says a UI must **hide** the control when false — `unsupported` is a state,
  not an error (`:17-18`, and the test asserts `error === null` in that case,
  `use-dictation.test.ts:98-101`).
- **Hard stop**: `DEFAULT_MAX_DURATION_MS = 90_000` (`:47`), armed with
  `setTimeout(stop, maxDurationMs)` at `:166`. Rationale given in the source: a forgotten
  microphone is both a privacy problem and a 10 MB upload that gets refused (`:31-33`).
- **Three microphone-release paths**, all going through one `releaseMicrophone()` that
  stops every track and clears the timer (`:67-74`):
  1. normal `onstop` (`:135`);
  2. unmount effect (`:76-83`);
  3. **the hard one** — unmount *while the permission prompt is open*. The unmount effect
     already ran and found `recorderRef.current` null, so nothing else in the hook could
     ever stop the tracks; the guard at `:118-121` stops them explicitly. The source calls
     this "the worst failure this hook has" (`:112-117`), and it has a dedicated test
     labelled `PRIVACY GUARD` (`use-dictation.test.ts:125-153`).
- **Four distinct human-readable errors, never a browser string** (`:107`, `:140`, `:151`,
  `:159`):
  - `"We couldn't use the microphone. You can type instead."` — refused / dismissed /
    no device, all collapsed to one sentence deliberately (`:102-104`).
  - `"That recording was empty."` — zero-byte blob; `transcribeRecording` is **not**
    called (`:137-143`; test asserts no round-trip, `use-dictation.test.ts:206-210`).
  - `"We couldn't hear any speech in that."` — transcript came back empty string;
    `onTranscript` is NOT called, because calling back with `""` would wipe a field
    (`:151`; test at `:213-231`).
  - `"Transcription failed. You can type instead."` — non-Error rejection fallback; an
    `Error`'s own `.message` is surfaced verbatim (`:153-160`).
- **Late-transcript guard**: `mountedRef` is checked before every `setState` and before
  `onTranscript` (`:148`, `:154`) — a transcript arriving after the dialog closed goes
  nowhere (test at `:278-304`).
- **Idempotent `stop()`**: guarded on `recorderRef.current?.state === "recording"`
  (`:86-88`), so a double-tap cannot fire `onstop` twice or fabricate an empty-recording
  error (test at `:331-354`).
- **Blob mime**: `recorder.mimeType || "audio/webm"` (`:132-134`).

### 3.5 `FileUpload` — Vercel Blob client uploads with an honest fallback

- **Client uploads, not server proxy.** Uses `upload()` from `@vercel/blob/client`
  (`file-upload.tsx:12`, `:175-181`) so the file goes browser → Blob directly, bypassing
  the 4.5 MB serverless body cap and giving real progress (`:18-25`).
- **Type + size are a SERVER boundary.** The `handleUploadUrl` route bakes
  `allowedContentTypes` + `maximumSizeInBytes` into the issued token
  (`apps/web/app/api/blob/upload/route.ts:88-93`); the client checks are only there to
  explain a refusal (`file-upload.tsx:49`, `:134-144`).
- **Honest degradation.** `blobConfigured={false}` renders only the URL-paste field plus
  the sentence *"File uploads aren't configured on this deployment — paste a link to an
  already-hosted file instead."* (`:391-396`), and no `<input type="file">` at all
  (`:280`). The URL field survives even when `allowUrlPaste={false}`, because it is the
  only route left (`:352`).
- **Two variants**: `image` → thumbnail grid (`grid-cols-2 sm:grid-cols-4` when
  `maxFiles > 1`, `aspect-square`; `max-h-48` for a single, `:210-243`); `file` → a
  filename chip list with `target="_blank" rel="noopener noreferrer"` links (`:245-275`).
- **`maxFiles` (default 1)** — when `value.length >= maxFiles`, **every** add control is
  removed from the DOM, not disabled (`:104`, `:278`). Test rationale: "an add control
  that can never succeed is a lie" (`file-upload.test.tsx:317-329`).
- **Batch clamping with correct pluralisation**:
  `` `Only ${room} more ${room === 1 ? "file fits" : "files fit"} here.` `` (`:152-154`).
- **Per-file validation and messages**:
  - wrong type, image variant → `"Upload a PNG, JPEG, WebP, or GIF image."`
  - wrong type, file variant → `"That file type isn't allowed here."`
  - oversize → `` `That file is larger than ${formatBytes(maxSizeBytes)}.` `` (`:134-144`)
  - `formatBytes` emits `MB` ≥ 1 MiB, `KB` ≥ 1 KiB, else `B` (`:403-407`) —
    tested at exactly `8 MB` / `512 KB` / `500 B` (`file-upload.test.tsx:167-181`).
- **A file with NO `file.type` passes the type check** (`accepts && file.type && …`,
  `:135`) — deliberate leniency on the client; the server token is the authority.
- **Filename sanitisation before upload**: `file.name.replace(/[^a-zA-Z0-9._-]+/g,
  "-").slice(0, 80)` (`:172-174`); pathname is `` `${kind}/${safeName}` `` (`:175`);
  `clientPayload` is `JSON.stringify({ kind })` (`:178`). Verified end-to-end:
  `"my holiday snap (1).png"` → `"bulletin/my-holiday-snap-1-.png"`
  (`file-upload.test.tsx:206-215`).
- **Progress**: `onUploadProgress` drives a `role="progressbar"` with
  `aria-valuenow/min/max` and a copy line `Uploading… N%` or
  `Uploading {i} of {total}… N%` (`:299-319`).
- **URL paste**: validated with `new URL(candidate)` (`:120-125`), deduped against
  existing values (`:126-129`), committed on click or Enter (`:362-367`).
- **`onCommit` fires one tick after `onChange`** — `setTimeout(onCommit, 0)` (`:107-111`)
  — so a consumer's autosave reads the flushed value rather than the previous list. This
  is an explicitly-tested contract (`file-upload.test.tsx:250-264`).
- **`disabled`** removes every remove-button and disables the URL controls (`:231`,
  `:263`, `:375`, `:384`).
- **`fileNameFromUrl`** decodes the last path segment and falls back to the raw string for
  non-URL legacy values (`:409-416`) — tested for
  `"Public%20Liability%20Cover.pdf"` → `"Public Liability Cover.pdf"` and for
  `"legacy-local-path"` (`file-upload.test.tsx:355-378`).
- **Drag & drop** with a `dragging` visual state (`:198-204`, `:283-287`).
- **Uses `<img>` deliberately, not `next/image`** — an author-supplied URL would need
  host allowlisting the donor chooses not to configure (`:221-222`).

### 3.6 `skeleton.tsx` — the loading-boundary kit (**the single highest-value asset here for Camp 404**)

Nine exports (`skeleton.tsx:31, 47, 68, 92, 111, 132, 153, 172, 182`):

| Export | Behaviour |
|---|---|
| `Skeleton` | one `animate-pulse rounded-md bg-muted` block, `aria-hidden`, **no intrinsic size** so the caller matches the real element (`:31-39`) |
| `SkeletonRegion` | the wrapper every boundary renders once: `aria-busy="true"`, `aria-live="polite"`, `data-loading="true"`, one `sr-only` label defaulting to `"Loading…"` (`:47-65`) |
| `SkeletonText` | N lines, last one `w-2/3` "the way a real paragraph ends" (`:68-85`) |
| `SkeletonHeading` | eyebrow (`h-3 w-40`) + title (`h-7 w-64`) + description (`h-3.5 max-w-xl`); eyebrow/description are opt-OUT flags (`:92-108`) |
| `SkeletonCard` | `rounded-xl border border-border bg-card/40 p-5` + title bar + `SkeletonText` (`:111-129`) |
| `SkeletonRow` | one `flex-1` primary column + `columns-1` trailing bars alternating `w-24`/`w-16` (`:132-150`) |
| `SkeletonCardGrid` | default 6 cards × 2 lines, default class `grid gap-4 sm:grid-cols-2 lg:grid-cols-3` (`:153-169`) |
| `SkeletonField` | label bar `h-3 w-28` above control bar `h-9 w-full rounded-lg` (`:172-179`) |
| `SkeletonForm` | N fields + one submit-button placeholder `h-9 w-32` (`:182-204`) |

The **design rule** is stated in the file header (`:8-13`): a boundary only stops a
navigation feeling broken if it shows the *destination's* shape, so each route composes
these primitives with the **same container classes its page uses** — the swap is a fill,
not a reflow. `apps/org/components/console-skeleton.tsx:7-13` restates this and copies
`PageHeading`'s container classes verbatim (`mb-6 flex flex-col gap-3 sm:flex-row
sm:items-end sm:justify-between`).

**a11y contract, pinned by tests**: every pulse block is `aria-hidden`, and there is
exactly **one** `sr-only` announcement per boundary however many bars are inside
(`skeleton.test.tsx:151-164`). `data-loading="true"` exists so a browser test can prove a
boundary actually appeared (`skeleton.tsx:44-45`, `skeleton.test.tsx:52-57`).

### 3.7 `MarkdownEditor` / `MarkdownView` / `roundTripMarkdown`

- **Value in/out is a markdown STRING**, not HTML (`markdown-editor.tsx:125-131`,
  `:232-239`).
- **The schema IS the sanitiser.** `markdownExtensions` (`extensions.ts:18-35`) configures
  `StarterKit` with `heading: { levels: [2, 3] }` and links restricted to
  `protocols: ["http", "https", "mailto"]`, `openOnClick: false`, `autolink: true`,
  `HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" }`; and
  `Markdown.configure({ html: false, linkify: true, breaks: false, transformPastedText:
  true, transformCopiedText: true })`. `html: false` means raw HTML in the markdown is
  treated as plain text, and the ProseMirror schema can only emit nodes/marks it defines —
  so there is no path for script HTML to render (`extensions.ts:12-16`).
- **Toolbar is exactly six controls**: Bold, Italic, Heading (level 2), Link, Bullet list,
  Numbered list (`markdown-editor.tsx:61-127`). Every button carries `aria-label` +
  `aria-pressed` and `onMouseDown={e => e.preventDefault()}` so clicking does not steal
  the selection (`:38-56`).
- **Link editing is `window.prompt`** — `null` cancels, `""` unsets the mark
  (`:62-70`). (Portability note: this is the one crude bit of the editor.)
- **`role="textbox"` + `aria-multiline="true"` on the editable region** (`:157-162`),
  with a nine-line comment explaining that a bare `contenteditable` announces as a generic
  group; the gap was found because an e2e spec could not locate it by role (`:148-156`).
- **Controlled-reset guard**: an external `value` change calls
  `editor.commands.setContent(value, { emitUpdate: false })` only when it differs from the
  current serialised markdown (`:175-183`) — without `emitUpdate: false` a controlled
  autosaving parent loops against itself (test rationale, `markdown-editor.test.tsx:13-16`).
- **`immediatelyRender: false`** on both editor and view (`:139`, `markdown-view.tsx:36`) —
  required for SSR-safe Tiptap.
- **`MarkdownView`** is the same extension set with `editable: false` (`markdown-view.tsx:31-42`).
  The file states plainly that `react-markdown` is not in the dependency tree, which is why
  Tiptap renders the read-only view too (`:5-10`).
- **`roundTripMarkdown(markdown)`** (`markdown.ts:27-33`) spins up a **detached** Tiptap
  `Editor`, reads `storage.markdown.getMarkdown()`, and destroys it in a `finally`
  (`markdown.ts:14-25`). Requires a DOM; explicitly *not* for hot server paths (`:41-43`).
  Round-trip is idempotent on a second pass (`tier2-3.test.tsx:175-178`).

### 3.8 Supporting controls

- **`Field`** (`field.tsx:33-74`) — label · control · help · error, **stateless and
  server-safe**. It owns no hooks, so ids are explicit: pass the same `htmlFor` to `Field`
  and as the control's `id`; `Field` derives `${htmlFor}-help` / `${htmlFor}-error`
  (`:43-44`) and the caller points `aria-describedby` at them. **Error supersedes help**
  — when `error` is present, `help` is not rendered at all (`:63-71`; tested at
  `form-controls.test.tsx:109-118`). Has a `privacyToggle` right-aligned label-row slot
  (`:26-27`, `:60`).
- **`TextareaWithCount`** (`textarea-with-count.tsx:15-76`) — works controlled *or*
  uncontrolled (mirrors `value`/`defaultValue` into internal state, `:30-37`). Counter is
  `` `${count} / ${maxWords} words` `` when capped, else
  `` `${count} ${count === 1 ? "word" : "words"}` `` (`:43-46`). Over the cap it adds
  `border-destructive` and `aria-invalid` to the textarea and turns the counter
  `text-destructive` (`:58-60`, `:63-66`).
- **`PasswordInput`** (`password-input.tsx:29-141`) — ONE field, show/hide toggle,
  **paste allowed**, no confirm-twice, no composition rules. Strength bar colours:
  `0: bg-transparent, 1: bg-destructive, 2: bg-warning, 3: bg-primary, 4: bg-success`
  (`:21-27`). The meter is a `role="progressbar"` with `aria-label="Password strength"`
  (`:105-110`). **The show/hide button deliberately carries NO `tabIndex={-1}`** — a
  10-line comment at `:90-99` records that it used to, which removed the only
  password-reveal control from the tab order across sign-in, sign-up, reset and change
  password in all three apps.
- **`ToggleGroup` / `ToggleGroupItem` / `toggleVariants`** (`toggle-group.tsx`) — shadcn
  registry pattern on `@radix-ui/react-toggle-group`, with `toggleVariants` **inlined**
  rather than pulled from a `toggle` component so `@radix-ui/react-toggle` is not taken on
  as a second dependency (`:8-11`). Variants `default | outline`; sizes
  `default (h-10 px-3) | sm (h-9 min-w-9 px-2.5) | lg (h-11 px-5)` (`:15-30`).
  **Gotcha, deliberately pinned by a test**: `ToggleGroupItem` resolves
  `context.variant ?? variant` (`:67-70`) — the *group's* context BEATS an item's own
  prop, silently. But because the Provider publishes `undefined` for props the group did
  not set, precedence depends on which props the group happens to set
  (`toggle-group.test.tsx:125-144`).
- **`Tabs`** (`tabs.tsx:7-54`) — plain shadcn Radix tabs, no repo-specific behaviour.
- **`Accordion`** (`accordion.tsx:12-68`) — shadcn Radix accordion; content uses
  `data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down`
  (`:58`), which requires the `--animate-accordion-*` tokens Camp 404 does not have.
- **`Table` primitives** (`table.tsx:6-118`) — standard shadcn new-york set; the root wraps
  in `relative w-full overflow-x-auto` (`:10`). `TableHead` is `h-10 px-3 text-left
  align-middle text-xs font-medium uppercase tracking-wide text-muted-foreground` (`:70-78`);
  `TableCell` is `p-3 align-middle` (`:85-92`).
- **`AudienceSelect`** (`audience-select.tsx:25-81`) — a *dumb* wrapper over `Select`. It
  resolves nothing; the parent runs the server-side resolver and feeds `resolvedCount`
  down, so there is one resolver and one display (`:5-9`). The sentence it owns
  (`resolveLine`, `:41-45`): `0` → `"Resolves to no {noun} yet"`; `1` →
  `` `Resolves to ~1 ${noun.replace(/s$/, "")}` ``; else `` `Resolves to ~${count} ${noun}` ``.
  **`resolvedCount === 0` SHOWS the line; `null`/`undefined` HIDES it** (`:53`) — the test
  calls conflating them "the easy mistake, and it silences the warning precisely when it
  is needed" (`audience-select.test.tsx:204-215`).
- **`DisabledHintTile`** (`disabled-hint-tile.tsx:11-52`) — a deliberately-disabled tile
  that names a parked capability AND says why: `title`, `hint`, optional `icon` (defaults
  to a `Lock`), optional `tag` pill. `aria-disabled="true"`, dashed border, `opacity-70`.
  This is the donor's answer to Camp 404's eight `comingSoon: true` home tiles.
- **`EmptyState`** (`empty-state.tsx:8-52`) — icon + title + description + **`action`
  prop** (`:15`) *and* `children` (`:44`). Camp 404's version has no `action` prop.
- **`StatusBadge`** (`status-badge.tsx) — two exported maps plus a pure lookup:
  `REGISTRATION_STATUS_VARIANT` (`:17-29`) and `REGISTRATION_STATUS_LABEL` (`:31-39`),
  `registrationStatusVariant(status)` (`:42-46`). Verbatim mapping:
  `draft → outline`, `submitted → default`, `under_review → default`,
  `changes_requested → warning`, `approved → success`, `rejected → destructive`,
  `withdrawn → secondary`. The comment notes the map is a plain record so other apps can
  add key sets, and that the reserved payment badges are deliberately NOT shipped
  (`:9-13`).
- **`QuiltBand`** (`quilt-band.tsx:15-68`) — a decorative SVG `<pattern>` band, 30×10 tile,
  three edge-touching diamonds, `aria-hidden`, `h-2.5 w-full`. **AfrikaBurn-branded**:
  fills are `var(--color-ab-teal)` (`:53`), `var(--color-ab-apricot)` (`:56`),
  `var(--color-ab-sage)` (`:60`). Notable trick: `React.useId()` embeds colons which are
  invalid in an SVG `url(#id)`, so the id is `` `quilt-${reactId.replace(/:/g, "")}` ``
  (`:31-32`).
- **`Toast` store** (`toast.tsx`) — module-level store, no provider, surfaced via
  `useSyncExternalStore` with a separate `getServerSnapshot` returning a stable `EMPTY`
  array (`:28-47`, `:145-149`). `DEFAULT_DURATION = 5000` (`:55`);
  `normalizeDuration` passes `Infinity` through, accepts finite `>= 0`, and falls back to
  the default for `NaN`/negative (`:57-61`). `role="alert"` for `error`, `role="status"`
  for the other three (`:121`) — the distinction decides whether a screen reader
  interrupts. `dismiss(undefined)` clears **everything** (`:50-53`). Stack is
  `fixed inset-x-0 bottom-0 z-[100] … sm:items-end` (`:155`).

---

## 4. Data model

**This unit owns no database tables, columns, enums, or migrations.** Every component is
presentational or pure. The only persisted values it touches are indirect:

- `FileUpload` stores **public Vercel Blob URLs as plain strings** in whatever column the
  consumer already has — explicitly "no schema change" (`file-upload.tsx:24-25`,
  `layout-uploads.tsx:8-10`).
- `MarkdownEditor` stores a **markdown string** (the donor's `bulletins.body_md`).
- `StatusBadge` reads the `RegistrationStatus` union from `@quagga/types` — the donor's
  `registration_status` enum, whose members are
  `draft | submitted | under_review | changes_requested | approved | rejected | withdrawn`
  (enumerated verbatim in `status-badge.tsx:20-28` and asserted in
  `form-controls.test.tsx:29-37`).

Constants that behave as schema-adjacent limits:

| Constant | Value | Location |
|---|---|---|
| `PASSWORD_MIN_LENGTH` | `15` | `lib/form-logic.ts:50` |
| `STRENGTH_FULL_AT` | `32` | `lib/form-logic.ts:68` |
| `DEFAULT_MAX_DURATION_MS` (dictation) | `90_000` | `lib/use-dictation.ts:47` |
| `DEFAULT_MAX_BYTES` (upload client pre-check) | `8 * 1024 * 1024` | `file-upload.tsx:31` |
| `IMAGE_TYPES` | `["image/png","image/jpeg","image/webp","image/gif"]` | `file-upload.tsx:32` |
| `DEFAULT_DURATION` (toast) | `5000` | `toast.tsx:55` |
| `MAX_LAYOUT_UPLOADS` | `4` | `packages/types/src/registration.ts:127` |
| `MAX_AUDIO_BYTES` (server) | `10 * 1024 * 1024` | `packages/core/src/report-server/transcribe.ts:41` |
| `TRANSCRIPTIONS_PER_HOUR` | `30` | `.../transcribe.ts:45` |
| `GROQ_MODEL` | `"whisper-large-v3-turbo"` | `.../transcribe.ts:28` |
| `ALLOWED_MIME_PREFIXES` | `["audio/","video/webm","video/mp4"]` | `.../transcribe.ts:42` |
| Server blob policies (web) | `registration-layouts`: IMAGE_TYPES @ 8 MB; `questionnaire-files`: DOC_TYPES @ 25 MB; fallback IMAGE_TYPES @ 8 MB | `apps/web/app/api/blob/upload/route.ts:36-50` |
| Server blob policies (org) | `supplier-documents`: DOC_TYPES @ 25 MB, domain `supplier_documents`; `questionnaire-images`: IMAGE_TYPES @ 8 MB, domain `questionnaires` | `apps/org/app/api/blob/upload/route.ts:45-64` |

`DOC_TYPES` verbatim (`apps/web/app/api/blob/upload/route.ts:18-27`):
`application/pdf`, the four IMAGE_TYPES, `text/plain`, `text/csv`,
`application/msword`,
`application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
`application/vnd.ms-excel`,
`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

---

## 5. Public API surface (exported signatures, verbatim)

### `packages/ui/src/components/responsive-data-table.tsx`

```ts
export type ResponsiveColumnRole = "title" | "badge" | "actions" | "default";

export interface ResponsiveColumn<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  role?: ResponsiveColumnRole;
  mobileHidden?: boolean;
  hideHeader?: boolean;
  align?: "left" | "right" | "center";
  cellClassName?: string;
  headClassName?: string;
}

export interface CardProjection<T> {
  title: ResponsiveColumn<T>[];
  badges: ResponsiveColumn<T>[];
  actions: ResponsiveColumn<T>[];
  pairs: ResponsiveColumn<T>[];
  hidden: ResponsiveColumn<T>[];
}

export function projectColumnsToCard<T>(
  columns: ResponsiveColumn<T>[],
): CardProjection<T>;

export interface ResponsiveDataTableProps<T> {
  columns: ResponsiveColumn<T>[];
  data: T[];
  getRowKey: (row: T) => string;
  renderExpanded?: (row: T) => React.ReactNode;
  rowClassName?: (row: T) => string | undefined;
  emptyState?: React.ReactNode;
  caption?: React.ReactNode;
  className?: string;
  mobileAriaLabel?: string;
}

export function ResponsiveDataTable<T>(props: ResponsiveDataTableProps<T>): JSX.Element;
```

### `packages/ui/src/lib/wizard.ts`

```ts
export type WizardSectionState = "done" | "current" | "todo" | "blocked";

export interface WizardSectionInput {
  id: string;
  label: string;
  done?: boolean;
  blocked?: boolean;
}

export interface WizardSection {
  id: string;
  label: string;
  index: number;          // 1-based
  state: WizardSectionState;
}

export interface WizardProgress {
  sections: WizardSection[];
  completed: number;
  total: number;
  label: string;          // "3 of 6 complete"
  currentId: string | null;
}

export function deriveWizardProgress(
  sections: WizardSectionInput[],
  currentId?: string,
): WizardProgress;
```

### `packages/ui/src/components/wizard.tsx`

```ts
export interface WizardProps {
  sections: WizardSectionInput[];
  currentId?: string;
  variant?: "rail" | "strip";
  onSelect?: (id: string) => void;
  className?: string;
}
export function Wizard(props: WizardProps): JSX.Element;
```

### `packages/ui/src/lib/form-logic.ts`

```ts
export function countWords(input: string | null | undefined): number;

export interface WordCountStatus { count: number; max?: number; over: boolean; under: boolean }
export function wordCountStatus(
  value: string | null | undefined,
  opts?: { min?: number; max?: number },
): WordCountStatus;

export const PASSWORD_MIN_LENGTH = 15;
export type PasswordStrengthScore = 0 | 1 | 2 | 3 | 4;
export interface PasswordStrength {
  length: number; meetsMin: boolean; score: PasswordStrengthScore;
  label: string; percent: number;
}
export function passwordStrength(password: string, min?: number): PasswordStrength;
```

### `packages/ui/src/lib/use-dictation.ts`

```ts
export type DictationState =
  "idle" | "requesting" | "recording" | "transcribing" | "unsupported";

export interface UseDictationOptions {
  onTranscript: (text: string) => void;
  maxDurationMs?: number;   // default 90_000
}

export interface UseDictation {
  state: DictationState;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  supported: boolean;
}

export function useDictation(options: UseDictationOptions): UseDictation;
```

### `packages/ui/src/lib/report-client.ts` (dictation's transport)

```ts
export async function transcribeRecording(audio: Blob): Promise<string>;
```
Posts `multipart/form-data` to `POST /api/report/transcribe` with the part named
`audio` and a filename of `dictation.mp4` or `dictation.webm` chosen from
`audio.type.includes("mp4")` — the extension matters because the server passes the
filename through so Whisper can identify the container (`report-client.ts:123-138`).

### `packages/ui/src/components/file-upload.tsx`

```ts
export interface FileUploadProps {
  value: string[];
  onChange: (urls: string[]) => void;
  handleUploadUrl: string;
  blobConfigured: boolean;
  kind: string;
  variant?: "image" | "file";     // default "image"
  maxFiles?: number;              // default 1
  maxSizeBytes?: number;          // default 8 MiB
  acceptedTypes?: string[];
  allowUrlPaste?: boolean;        // default true
  urlPlaceholder?: string;
  hint?: string;
  disabled?: boolean;
  onCommit?: () => void;
  className?: string;
  ariaLabel?: string;
}
export function FileUpload(props: FileUploadProps): JSX.Element;
```

### `packages/ui/src/components/skeleton.tsx`

```ts
export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;
export function Skeleton(props: SkeletonProps): JSX.Element;
export function SkeletonRegion(props: SkeletonProps & { label?: string }): JSX.Element;
export function SkeletonText(p: { lines?: number; className?: string }): JSX.Element;
export function SkeletonHeading(p: { eyebrow?: boolean; description?: boolean; className?: string }): JSX.Element;
export function SkeletonCard(p: { lines?: number; className?: string }): JSX.Element;
export function SkeletonRow(p: { columns?: number; className?: string }): JSX.Element;
export function SkeletonCardGrid(p: { cards?: number; lines?: number; className?: string }): JSX.Element;
export function SkeletonField(p: { className?: string }): JSX.Element;
export function SkeletonForm(p: { fields?: number; className?: string }): JSX.Element;
```

### Others

```ts
// field.tsx
export interface FieldProps {
  label: React.ReactNode; htmlFor?: string; required?: boolean;
  help?: React.ReactNode; error?: React.ReactNode;
  privacyToggle?: React.ReactNode; children: React.ReactNode; className?: string;
}
export function Field(props: FieldProps): JSX.Element;

// textarea-with-count.tsx
export interface TextareaWithCountProps extends TextareaProps { maxWords?: number; minWords?: number }
// forwardRef<HTMLTextAreaElement, TextareaWithCountProps>
export { TextareaWithCount };

// password-input.tsx
export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  hideStrength?: boolean; minLength?: number;   // default 15
}
export { PasswordInput };

// phone-input.tsx
export interface PhoneInputProps {
  value: string; onChange: (value: string) => void;
  id?: string; placeholder?: string; disabled?: boolean;
  defaultCountry?: Country;   // default "ZA"
  describedBy?: string; className?: string;
}
export function PhoneInput(props: PhoneInputProps): JSX.Element;

// audience-select.tsx
export interface AudienceOption { value: string; label: string }
export interface AudienceSelectProps {
  options: readonly AudienceOption[]; value?: string;
  onValueChange?: (value: string) => void;
  resolvedCount?: number | null; countNoun?: string;   // default "burners"
  placeholder?: string; disabled?: boolean; id?: string; className?: string;
}
export function AudienceSelect(props: AudienceSelectProps): JSX.Element;

// status-badge.tsx
export const REGISTRATION_STATUS_VARIANT: Record<RegistrationStatus, BadgeVariant>;
export const REGISTRATION_STATUS_LABEL: Record<RegistrationStatus, string>;
export function registrationStatusVariant(status: RegistrationStatus): BadgeVariant;
export interface StatusBadge_Props { status: RegistrationStatus; children?: React.ReactNode; className?: string }
export function StatusBadge(props: StatusBadge_Props): JSX.Element;

// disabled-hint-tile.tsx
export interface DisabledHintTileProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string; hint: string; icon?: React.ReactNode; tag?: string;
}
export function DisabledHintTile(props: DisabledHintTileProps): JSX.Element;

// quilt-band.tsx
export interface QuiltBandProps extends React.HTMLAttributes<HTMLDivElement> { opacity?: number }
export function QuiltBand(props: QuiltBandProps): JSX.Element;

// toggle-group.tsx
export { ToggleGroup, ToggleGroupItem, toggleVariants };

// markdown-editor/
export const markdownExtensions: Extensions;
export function roundTripMarkdown(markdown: string): string;
export interface MarkdownEditorProps { value?: string; onChange?: (markdown: string) => void; placeholder?: string; className?: string; ariaLabel?: string }
export function MarkdownEditor(props: MarkdownEditorProps): JSX.Element;
export interface MarkdownViewProps { value: string; className?: string }
export function MarkdownView(props: MarkdownViewProps): JSX.Element;
```

---

## 6. UX behaviours worth stealing wholesale

1. **"Nothing may claim something that isn't true."** The donor's house rule shows up
   concretely here: `FileUpload` removes add controls at the cap instead of disabling them
   (`file-upload.tsx:278`), `DisabledHintTile` names *why* a capability is parked, the
   `blobConfigured={false}` branch says the deployment isn't configured rather than
   offering a dropzone that silently discards drops, and the registration wizard's
   `saveNow()` only reports "saved" once the server holds every edit on screen.
2. **Degrade in the open.** Absent `GROQ_API_KEY` → the microphone is hidden and the copy
   is *"Dictation isn't switched on for this deployment. Typing does exactly the same
   job."*; unsupported browser → *"Dictation isn't available in this browser. Typing does
   exactly the same job."* (`report-dialog.tsx`, the `canDictate` branch).
3. **Say where the audio goes BEFORE recording starts.** The disclosure sits under the
   textarea, not in a post-hoc dialog: *"Dictation sends the recording to our transcription
   provider to turn into text. It isn't stored, and you can edit the words before
   sending."* (`report-dialog.tsx`, marked in-source `{/* Said before the microphone is
   used, not after. */}`). `use-dictation.ts:10-18` makes this a documented obligation of
   any UI built on the hook.
4. **Transcripts APPEND and are clamped.** The reporter appends the transcript to what was
   already typed (`current ? \`${current.trimEnd()} ${text}\` : text`) and slices to
   `REPORT_DESCRIPTION_MAX`, because `maxLength` on a textarea only governs typing — a long
   dictation would otherwise be refused at submit, after the recording, with no indication
   which part was too much (`report-dialog.tsx`, the `onTranscript` callback).
5. **A save indicator that can't lie.** The registration wizard's autosave loops
   `while (dirtyRef.current)`, clearing the dirty flag *before* the await so an edit landing
   mid-write is caught by the next pass; concurrent callers **join** the in-flight flush
   rather than skipping it. The in-source comment records the bug this fixed: submitting
   while an autosave was in flight validated the PREVIOUS draft, so the wizard could show
   "6 of 6 complete" and get "Complete all six sections" back from the server in the same
   click (`registration-wizard.tsx:155-215`).
6. **Autosave cadence**: debounce 1500 ms on `update()`, immediate flush on blur via
   `commit()`, a 20 000 ms safety-net interval, and a flush on unmount
   (`registration-wizard.tsx:216-239`).
7. **Any-order sections, nothing blocked, "Nothing is lost."** The registration wizard maps
   every section to `{ id, label, done }` with no `blocked` at all, and prints
   *"Any order. Nothing is lost."* under the progress bar (`registration-wizard.tsx:290-296`,
   `:357`).
8. **`role="alert"` only for errors.** Toast success/info/warning are `role="status"`;
   only `error` interrupts a screen reader (`toast.tsx:121`, pinned at
   `toast.test.tsx:39-54`).
9. **Card-list a11y**: the mobile projection is a real `<ul>`/`<li>` with an `aria-label`,
   not a stack of divs (`responsive-data-table.tsx:263-271`).
10. **Icon-only buttons always carry a name that identifies the row/toast**:
    `` aria-label={`Remove upload ${i+1}`} ``, `` aria-label={`Dismiss: ${t.title}`} ``,
    `aria-label={isOpen ? "Collapse row" : "Expand row"}`.

---

## 7. Validation and edge-case rules (digit-exact)

| Rule | Value / behaviour | Cite |
|---|---|---|
| Word counting | `trim()` then split on `/\s+/`; nullish/empty → 0; `"a well-run camp"` → 3; `"line one\nline two"` → 4 | `form-logic.ts:15-20`, `form-logic.test.ts:209-213` |
| Password minimum | 15 chars exactly at the boundary → `meetsMin: true`, label `"Fair"`, score 2 | `form-logic.ts:87-89`, `form-logic.test.ts:254-260` |
| Password meter full | 32 chars = 100% | `form-logic.ts:68`, `form-logic.test.ts:268` |
| Dictation hard stop | 90 s default; 5 s in the test → exactly one `stop()` call | `use-dictation.ts:47`, `use-dictation.test.ts:307-328` |
| Empty recording | `audio.size === 0` → error, **no** network call | `use-dictation.ts:137-143` |
| Empty transcript | `""` back from server → error, `onTranscript` **not** called | `use-dictation.ts:150-151` |
| Upload client cap | default 8 MiB; message uses MB/KB/B thresholds at 1 MiB / 1 KiB | `file-upload.tsx:31`, `:403-407` |
| Upload server cap | 8 MiB images / 25 MiB docs, baked into the token | `apps/web/app/api/blob/upload/route.ts:36-50` |
| Unknown upload `kind` | falls back to the **most restrictive** image policy, never a permissive default | `apps/web/app/api/blob/upload/route.ts:34-35`, `:47-50` |
| No `BLOB_READ_WRITE_TOKEN` | route returns **501** with an actionable sentence | `.../route.ts:63-71` |
| Unauthenticated upload | `onBeforeGenerateToken` throws `"Sign in to upload."` → 400 | `.../route.ts:85-86`, `:100-103` |
| Filename sanitisation | `/[^a-zA-Z0-9._-]+/g → "-"`, then `.slice(0, 80)` | `file-upload.tsx:172-174` |
| Duplicate URL | refused with `"That link is already added."`, `onChange` not called | `file-upload.tsx:126-129` |
| Empty URL draft | silently ignored — **no** toast | `file-upload.tsx:118`, `file-upload.test.tsx:245-250` |
| Batch overflow | takes only what fits; singular/plural handled | `file-upload.tsx:148-155` |
| Transcribe body guard | `Content-Length > 10 MiB` → **413 before** `formData()` is parsed | `transcribe.ts:116-131` |
| Transcribe rate limit | 30/hour per account, key `transcribe:${viewer.id}`, 429 + `Retry-After` | `transcribe.ts:100-114` |
| Transcribe MIME | a part declaring **no type FAILS** rather than skipping the check | `transcribe.ts:155-166` |
| Transcribe timeout | 30 000 ms `AbortController` → 504 | `transcribe.ts:180-200` |
| Whisper params | `temperature: "0"`, `response_format: "json"`, **`language` deliberately UNSET** so Afrikaans is not transcribed into nonsense | `transcribe.ts:174-178` |
| Upstream error body | never forwarded — "an upstream error body can quote the request, and the request is somebody's voice" | `transcribe.ts:207-218` |
| Toast duration | `Infinity` persists; `NaN`/negative fall back to 5000 | `toast.tsx:57-61`, `toast.test.tsx:107-128` |
| Audience count line | `0` shows, `null`/`undefined` hides | `audience-select.tsx:53`, `audience-select.test.tsx:204-215` |
| Phone value contract | always a string; `""` on clear, never `undefined`; `+27` seeded; `"+27821234567"` renders `"+27 82 123 4567"` | `phone-input.tsx:254`, `phone-input.test.tsx:35-60` |
| Wizard current fallback | a `currentId` pointing at a done/blocked section falls through to the first actionable | `lib/wizard.ts:73-80`, `tier2-3.test.tsx:122-129` |
| Markdown link protocols | `["http","https","mailto"]` only | `extensions.ts:24` |
| Markdown raw HTML | `html: false` → treated as plain text | `extensions.ts:29` |

---

## 8. Test coverage

- **2,316 lines of Vitest** across 13 files bear directly on this unit (§2.2).
- `packages/ui/vitest.config.ts` runs **jsdom**, `include: ["src/**/__tests__/**/*.test.{ts,tsx}"]`,
  `testTimeout: 30_000` / `hookTimeout: 30_000` with a 20-line comment explaining that 5 s
  is not a hang detector for a jsdom suite under `turbo run test` contention (measured:
  28 s tests / 43 s setup locally, 81 s / 102 s on the runner).
- **Coverage ratchet** on the whole package, measured 2026-08-04: statements 91.92
  (967/1052), branches 87.59 (819/935), functions 86.33 (278/322), lines 92.65 (908/980).
  Enforced floors sit ~3 points under: `{ lines: 89, statements: 88, functions: 83,
  branches: 84 }`. Nothing is excluded beyond `**/__tests__/**` and `**/*.d.ts` — the
  config argues that narrowing `include` "would shrink the denominator rather than measure
  anything".
- Test-writing conventions worth importing:
  - **Refusals are asserted through a real rendered `<Toaster/>`**, never a spy on `toast`,
    because "we called toast.error" and "the user was told something" are different claims
    (`file-upload.test.tsx:12-15`).
  - The module-level toast store is reset **before** each render, or a leaked toast lets a
    later assertion pass for the wrong reason (`file-upload.test.tsx:51-58`).
  - jsdom has no layout, so `markdown-editor.test.tsx:18-49` installs `getClientRects` /
    `getBoundingClientRect` shims on `Range.prototype` and `Text.prototype` — ProseMirror's
    scroll-into-view throws **asynchronously** otherwise, reddening the run rather than any
    single test. **Any port of the markdown editor needs this shim.**
  - Surprising behaviour is pinned deliberately rather than fixed silently — see the
    ToggleGroup precedence test titled `"SURPRISING, AND DELIBERATE"`
    (`toggle-group.test.tsx:125-144`).
- **E2E**: the responsive table is exercised through a documented helper whose comment
  records a real trap — *"The responsive table keeps the desktop `<tr>` in the DOM even at
  360px (it is `display:none`, not removed) while ALSO rendering the mobile `<li>`, so an
  un-scoped match would be strict-mode-ambiguous on the mobile project"*; the fix is a
  `.filter({ visible: true })` (`e2e/specs/supplier/support.ts:27-42`).

---

## 9. Dependency footprint

### Already in Camp 404 (no install needed)
`react` 19, `lucide-react`, `clsx` + `tailwind-merge` (via the identical `cn`),
`class-variance-authority`, `@vercel/blob` (^2.4.0 in both), `@radix-ui/react-dialog`,
`@radix-ui/react-popover`, `@radix-ui/react-select`, `@radix-ui/react-slot`.

### Must be installed before donor code compiles in Camp 404

| Package | Donor range | Needed by |
|---|---|---|
| `@radix-ui/react-toggle-group` | `^1.1.17` | `toggle-group.tsx` |
| `@radix-ui/react-tabs` | `^1.1.14` | `tabs.tsx` |
| `@radix-ui/react-accordion` | `^1.2.18` | `accordion.tsx` |
| `react-phone-number-input` | `^3.4.17` | `phone-input.tsx` |
| `libphonenumber-js` | `^1.13.9` | (transitive of the above; donor declares it directly) |
| `@tiptap/core`, `@tiptap/pm`, `@tiptap/react`, `@tiptap/starter-kit` | `^3.29.0` | `markdown-editor/**` |
| `tiptap-markdown` | `^0.9.0` | `markdown-editor/**` |
| `@vitest/coverage-v8` | `^4.1.10` | only if the ratchet discipline is adopted (Camp 404 has **no** coverage provider in any workspace) |

### Zero-dependency assets (nothing to install)
`lib/form-logic.ts`, `lib/wizard.ts`, `components/wizard.tsx` (lucide only),
`components/skeleton.tsx` (nothing but `cn`), `components/field.tsx`,
`components/disabled-hint-tile.tsx`, `components/table.tsx`,
`components/responsive-data-table.tsx` (lucide + `./table`).

### CSS tokens the donor uses that Camp 404 lacks
- `--color-ab-teal` / `--color-ab-apricot` / `--color-ab-sage` — `quilt-band.tsx:53,56,60`.
- `--color-ab-charcoal` / `--color-ab-warmwhite` — `file-upload.tsx:236` (the image
  remove-button chrome). **This one silently compiles to nothing**: the button would render
  with no background against an arbitrary photo.
- `--animate-accordion-down` / `--animate-accordion-up` + their keyframes —
  `accordion.tsx:58`.

Everything else in this unit uses only semantic tokens that already exist in Camp 404's
`@theme` (`bg-primary`, `bg-muted`, `border-input`, `bg-success`, `bg-warning`,
`text-destructive`, `bg-card`, `text-popover-foreground`, …), so the components re-skin to
Camp 404's magenta/violet with no edits.

### Runtime endpoints the donor assumes
- `POST {handleUploadUrl}` implementing `@vercel/blob`'s `handleUpload` — Camp 404 would
  need a new route; its existing `/api/uploads/avatar` is a different (server-proxy) shape.
- `POST /api/report/transcribe` returning `{ text: string }` — Camp 404's equivalent is
  `POST /api/voice/transcribe`, same response shape, so `report-client.ts:130` needs one
  URL change.

---

## 10. AfrikaBurn / multi-tenant coupling

**Verdict: this is the cleanest unit in the donor.** `rg 'groupId|orgId|group_id|tenant|
isOrg|orgSlug|supplierId|MembershipRole|OrgPermissions|ProjectPermissions'` over
`packages/ui/src` returns **zero hits**. No `edition_id`. No org/participant fork. No
`.org-accent` / `.supplier-accent` conditionals inside any component in this unit.

Coupling that *does* exist, itemised:

| Asset | Coupling | Severity |
|---|---|---|
| `status-badge.tsx:2` | imports `RegistrationStatus` from `@quagga/types` — the 7-member registration lifecycle | **Must re-express.** Camp 404's nearest analogues are `approval_status [pending, approved, rejected]` and `questionnaire_status [draft, published, unpublished]`. The *pattern* (a plain `Record<Enum, BadgeVariant>` + a `Record<Enum, string>` label map + a pure lookup) ports cleanly; the keys do not. |
| `quilt-band.tsx` | AfrikaBurn's quilt motif + three brand tokens | **Leave behind or retheme.** It is the donor's brand identity. If ported, only the SVG-`useId`-colon trick is reusable (`:31-32`). |
| `file-upload.tsx:236` | `bg-ab-charcoal/70 text-ab-warmwhite` | Trivial retoken to `bg-background/70 text-foreground`. |
| `accordion.tsx:58` | `--animate-accordion-*` | Add the two `@theme` tokens + keyframes, or swap for Camp 404's `tw-animate-css` classes. |
| `wizard.tsx:88,117` | `aria-label="Registration progress"` hardcoded | One-word prop-ification; there is no `labelText` prop today. |
| `audience-select.tsx` | `countNoun` defaults to `"burners"` | Already a prop; pass `"members"`. |
| `disabled-hint-tile.tsx:4-9` | comment names AfrikaBurn parked features | Comment only. |
| `transcribe.ts:35-38` | `DOMAIN_PROMPT` full of AfrikaBurn jargon ("binnekring", "Tankwa Town", "Quagga") | Camp 404 already has `apps/web/lib/voice-prompts.ts` `QUESTIONNAIRE_PROMPT` doing the same job. |
| `field-kit.tsx`, `registration-wizard.tsx` | six AfrikaBurn registration sections, `SECTION_KEYS`, placement zones, SOOP sound scale | **Concept-only.** Take the autosave engine and the section-completeness *pattern*; the domain is entirely AfrikaBurn's. |
| `apps/org/app/api/blob/upload/route.ts` | policies carry `domain: OrgDomain` for the org capability check | Camp 404 has no org domains; use the simpler `apps/web` variant (`route.ts`, 104 lines) which has no domain field. |
| The donor `apps/org`/`apps/suppliers` table call sites | live only because of the org/participant/supplier split | The **columns** are AfrikaBurn's; the RDT itself is not. |

One genuine hazard from the donor's own simplification audit that applies here: *"apps/org
and apps/suppliers are close to being the same application twice"* — any component lifted
from an **app** directory (not `packages/ui`) should be assumed to have two near-twins, one
of which is already behind. Everything in §2.1 is from `packages/ui` and has no twin.

---

## 11. Direct capability diff vs Camp 404 (as instructed)

### 11.1 Wizard

| Capability | Donor `Wizard` + `deriveWizardProgress` | Camp 404 |
|---|---|---|
| Component identity | a **navigator** — renders section state, owns no data | `QuestionnaireWizard` (`apps/web/components/questionnaire/wizard.tsx`, 307 lines) is a **whole form runtime**: state, per-page validation, save action, error banners, blocking chrome |
| Progress display | numbered rail (desktop) + numbered strip (mobile), 4 states, `"n of m complete"` | `ProgressBar` + `Stepper` (`packages/ui/src/components/stepper.tsx`, 60 lines) — 3 states `done/active/upcoming`, **horizontal only, no mobile variant, no `blocked` state, no progress label** |
| Navigation model | **any order, click any actionable step** via `onSelect` | strictly linear `handleNext` / back; `pageIndex` is a single integer |
| Current-step resolution | self-healing — falls to the first actionable step | N/A (linear) |
| Pure derivation, unit-testable without React | **yes** (`lib/wizard.ts`, 84 lines, zero imports) | no — derivation is inline in the component |
| Server-component-safe | **yes** (no hooks in `wizard.tsx`) | no (`"use client"`) |
| Autosave | in the consumer (`registration-wizard.tsx:155-239`): 1500 ms debounce + blur flush + 20 s interval + unmount flush + join-in-flight loop | `persistProgress` flag calls the action on every Next; **no debounce, no interval, no in-flight join** |
| Save-state indicator | `SaveState = "idle"|"saving"|"saved"|"error"` + `lastSavedAt` + a `dirty` mirror of the ref | none |
| Blocked/gated steps | `blocked` state renders a `Lock` and is never clickable | none |
| Scroll/focus reset between steps | **neither repo does this** — donor `wizard.tsx` has no effect; Camp 404's WP8 (#132) names it as an open finding at `wizard.tsx:116` | open in both |
| Validation | none (the consumer owns it) | `validateOne` per question + cross-field id/DOB checks, shared with the server validator |

**Net:** the donor's Wizard is *narrower but more reusable*; its real prize is
`deriveWizardProgress` (a pure state machine Camp 404 has no equivalent of) plus the
**autosave engine** in the consumer, which is strictly more robust than anything Camp 404
ships.

### 11.2 Dictation

| Capability | Donor `useDictation` (170 lines) | Camp 404 `useVoiceRecorder` (250 lines) |
|---|---|---|
| States | 5: `idle/requesting/recording/transcribing/unsupported` | 6: `idle/requesting/recording/processing/transcript-review/error` |
| **Transcript review before commit** | ✗ — `onTranscript` fires straight from `onstop` | **✓** — holds the transcript, exposes `accept(text)` / `discard()`; `onTranscript` fires only on `accept` (`use-voice-recorder.ts:238-247`) |
| **`supported` flag / hide-the-control** | **✓** (`use-dictation.ts:61-64`) | ✗ — no `supported`; failure surfaces as an `error` state after the user tries |
| MIME negotiation | none — `new MediaRecorder(stream)` and read back `recorder.mimeType` | **✓** `pickMimeType()` walks `["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus"]` via `MediaRecorder.isTypeSupported` — the file calls hardcoding `audio/webm` "the single biggest cross-browser gotcha" for iOS Safari (`:37-48`) |
| getUserMedia constraints | `{ audio: true }` | `{ echoCancellation, noiseSuppression, autoGainControl }` (`:117-123`) |
| Live waveform | ✗ | **✓** exposes an `AnalyserNode` (`fftSize = 1024`) + `waveform.tsx`, which is also **the only file in Camp 404 honouring `prefers-reduced-motion`** |
| **Unmount-during-permission-prompt guard** | **✓** the standout (`:112-121`), with a dedicated `PRIVACY GUARD` test | ✗ — cleanup only clears handlers and stops `streamRef.current`, which is still null while the prompt is open (`:77-94`) |
| Handler nulling before `stop()` on unmount | ✗ | **✓** (`:82-88`) |
| AudioContext teardown | n/a | **✓** `void audioCtxRef.current?.close()` |
| Empty-recording guard | **✓** short-circuits before the network call (`:137-143`) | ✓ falls back to `idle` (`:192-195`) |
| Empty-transcript distinction | **✓** distinct message; does **not** call back with `""` (`:150-151`) | ✓ returns to `idle` silently, no message |
| Hard duration cap | 90 s | 120 s |
| Server prompt key | none — the domain prompt is server-side per-app | **✓** `promptKey` echoed to the server, which looks up the bias string so the client cannot inject prompts (`:20-25`) |
| Error copy | four fixed human sentences | three (`"Microphone permission denied"` / `"No microphone found"` / `"Couldn't access microphone"`) plus passthrough of server messages |
| Where the transport lives | a separate `report-client.ts` module (a clean seam) | inline `fetch` inside the hook (`:206-209`) |
| Server: rate limit | **per-account 30/hr** via `consumeRateLimit` (`transcribe.ts:100-114`) | **per-account 30 + per-IP 60**, "defence in depth… `user.id` can be cheap to mint" (`apps/web/app/api/voice/transcribe/route.ts:20-41`) |
| Server: pre-parse `Content-Length` guard | **✓** 413 before `formData()` materialises the upload (`transcribe.ts:116-131`) | ✗ — `req.formData()` runs first, then the size check |
| Server: timeout | **✓** 30 s AbortController → 504 | ✗ (delegated to `groq-sdk` defaults) |
| Server: MIME allowlist | `audio/*`, `video/webm`, `video/mp4`; **untyped part FAILS** | `audio/*` only — **rejects the `video/webm` container some browsers emit** |
| Server: SDK | raw `fetch` to `https://api.groq.com/openai/v1/audio/transcriptions` | `groq-sdk` |
| Server: audit line | `console.log("[AUDIT] transcription for user … (N bytes)")` | none |

**Net:** Camp 404's recorder is ahead on UX (review-before-commit, waveform, MIME
negotiation, prompt keys, IP rate limiting) and behind on **two safety items** — the
unmount-during-prompt microphone leak, and the pre-parse body-size guard — plus the
`supported` flag that lets a UI hide the control instead of failing after the tap.

### 11.3 Everything else

- **Data table:** Camp 404 has **no table primitive at all** — no `table.tsx`, no
  `responsive-data-table.tsx`. The roster is hand-rolled.
- **Loading/error boundaries:** Camp 404 has **zero** `loading.tsx` and exactly one
  `error.tsx`. The donor has **34 `loading.tsx`** and **10 error boundaries** plus the
  shared kit and the shared `ErrorRecovery` / `NotFoundView` panels.
- **File upload:** Camp 404 has `avatar-upload.tsx` (server-proxy, avatars only). No
  generic uploader, no Blob client-upload path, no URL-paste fallback.
- **Markdown:** Camp 404 has `react-markdown` + `rehype-sanitize` installed but no editor.
- **Word count / password strength / phone:** no equivalents.
- **Toast/dialog/popover/select/empty-state:** present in both, near-identical (§12).

---

## 12. Portability verdict per asset

**Drop-in** (sed `@quagga/`→`@camp404/`, run `pnpm format` for the semicolon style, done):
`responsive-data-table.tsx` (+ its `table.tsx` dependency), `skeleton.tsx`, `wizard.tsx`,
`lib/wizard.ts`, `lib/form-logic.ts`, `field.tsx`, `textarea-with-count.tsx`,
`password-input.tsx`, `disabled-hint-tile.tsx`, and the four test files that pin them.

**Light-adapt:**
`use-dictation.ts` (retarget `transcribeRecording` at `/api/voice/transcribe`, or merge its
two safety guards into Camp 404's `useVoiceRecorder` rather than porting the hook);
`file-upload.tsx` (retoken `bg-ab-charcoal/70 text-ab-warmwhite` at `:236`; add a
`handleUpload` route); `audience-select.tsx` (`countNoun="members"`);
`toggle-group.tsx` / `tabs.tsx` / `accordion.tsx` (+3 Radix deps, +2 CSS tokens);
`empty-state.tsx` (reconcile `action` vs Camp 404's `children`);
`phone-input.tsx` (+2 npm deps; note it composes the donor's `Select`, which is
API-compatible with Camp 404's).

**Heavy-adapt:**
`markdown-editor/**` (+5 npm deps, +the jsdom `getClientRects` shim in tests, +the
`window.prompt` link flow probably wants replacing); `status-badge.tsx` (re-express the
enum); the blob upload route (Camp 404 has no `handleUpload` route and no `kind` policy
table).

**Concept-only:**
`registration-wizard.tsx`'s autosave engine (steal the *algorithm* — join-in-flight,
clear-before-await, loop-until-clean — not the file); `field-kit.tsx`;
`quilt-band.tsx`; the org table column sets.

---

## 13. Verbatim excerpts — the five most valuable pieces

### 13.1 `projectColumnsToCard` — the whole responsive-table idea in 34 lines
`packages/ui/src/components/responsive-data-table.tsx:77-115`

```ts
/**
 * Partition a column set into its mobile-card slots. `mobileHidden` wins over
 * any role (a hidden column never appears in the card, whatever its role).
 * Declaration order is preserved within every slot.
 */
export function projectColumnsToCard<T>(
  columns: ResponsiveColumn<T>[],
): CardProjection<T> {
  const projection: CardProjection<T> = {
    title: [],
    badges: [],
    actions: [],
    pairs: [],
    hidden: [],
  };

  for (const column of columns) {
    if (column.mobileHidden) {
      projection.hidden.push(column);
      continue;
    }
    switch (column.role) {
      case "title":
        projection.title.push(column);
        break;
      case "badge":
        projection.badges.push(column);
        break;
      case "actions":
        projection.actions.push(column);
        break;
      default:
        projection.pairs.push(column);
        break;
    }
  }

  return projection;
}
```

### 13.2 `deriveWizardProgress` — a pure, self-healing step state machine
`packages/ui/src/lib/wizard.ts:42-84`

```ts
/**
 * Derive per-section states and overall progress.
 *
 * Rules (precedence): a `done` section is always "done". Otherwise the resolved
 * current section is "current"; a `blocked` section is "blocked"; anything else
 * is "todo". When `currentId` is omitted (or points at a done/blocked section),
 * the current section is the first not-done, not-blocked section — so the
 * navigator always highlights the next actionable step.
 */
export function deriveWizardProgress(
  sections: WizardSectionInput[],
  currentId?: string,
): WizardProgress {
  const total = sections.length;
  const completed = sections.filter((s) => s.done).length;

  const isActionable = (s: WizardSectionInput) => !s.done && !s.blocked;
  const requested = currentId
    ? sections.find((s) => s.id === currentId)
    : undefined;
  const resolvedCurrent =
    requested && isActionable(requested)
      ? requested
      : sections.find(isActionable);
  const currentResolvedId = resolvedCurrent?.id ?? null;

  const derived: WizardSection[] = sections.map((s, i) => {
    let state: WizardSectionState;
    if (s.done) state = "done";
    else if (s.id === currentResolvedId) state = "current";
    else if (s.blocked) state = "blocked";
    else state = "todo";
    return { id: s.id, label: s.label, index: i + 1, state };
  });

  return {
    sections: derived,
    completed,
    total,
    label: `${completed} of ${total} complete`,
    currentId: currentResolvedId,
  };
}
```

### 13.3 The dictation privacy guard — the single most valuable 10 lines in this unit
`packages/ui/src/lib/use-dictation.ts:112-121`

```ts
    // The permission prompt is open across that await, and the dialog can be
    // closed while it is. The unmount effect has already run by then and found
    // `recorderRef.current` null, so nothing would ever release these tracks:
    // no recorder means no `stop()`, no `onstop`, and the browser's recording
    // indicator stays lit until the page is reloaded. A live microphone nobody
    // asked for is the worst failure this hook has.
    if (!mountedRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
```

…and the failure semantics that follow (`:131-162`), which are the reason the hook never
shows a browser error string:

```ts
    recorder.onstop = () => {
      const audio = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      releaseMicrophone();

      if (audio.size === 0) {
        if (mountedRef.current) {
          setState("idle");
          setError("That recording was empty.");
        }
        return;
      }

      if (mountedRef.current) setState("transcribing");
      void transcribeRecording(audio)
        .then((text) => {
          if (!mountedRef.current) return;
          setState("idle");
          if (text) onTranscript(text);
          else setError("We couldn't hear any speech in that.");
        })
        .catch((cause: unknown) => {
          if (!mountedRef.current) return;
          setState("idle");
          setError(
            cause instanceof Error
              ? cause.message
              : "Transcription failed. You can type instead.",
          );
        });
    };
```

### 13.4 The skeleton kit's design rule + the region that owns the announcement
`packages/ui/src/components/skeleton.tsx:5-21` and `:41-65`

```ts
/**
 * The shared skeleton kit behind every app-router `loading.tsx`.
 *
 * Why a kit and not one big `<PageSkeleton>`: a route boundary only stops the
 * navigation feeling broken if it shows the DESTINATION's shape. A generic grey
 * page is honest about "something is happening" and dishonest about what — and
 * when the real content lands the layout jumps, which reads as a second load.
 * So each route composes these primitives with the SAME container classes its
 * page uses, and the swap is a fill, not a reflow.
 *
 * Everything here is server-safe: no hooks, no state, no data. That matters —
 * the boundary has to stream before any of the slow work has finished.
 *
 * Accessibility: the pulse blocks are decorative (`aria-hidden`), and the
 * wrapper (`SkeletonRegion`) carries the single polite live region. One
 * announcement per boundary, not one per bar.
 */
```

```tsx
/**
 * The wrapper every loading boundary should render once, at its root. It owns
 * the live region and the `data-loading` hook that lets the E2E suite assert a
 * boundary actually appeared — "we added a skeleton" is only true if a browser
 * can see it.
 */
export function SkeletonRegion({
  className,
  children,
  label = "Loading…",
  ...props
}: SkeletonProps & { label?: string }) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      data-loading="true"
      className={className}
      {...props}
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
```

### 13.5 The autosave engine that made "saved" mean saved
`apps/web/components/registration/registration-wizard.tsx:155-215`

```ts
  /**
   * Flush the draft to the server. Resolves TRUE only once the server holds
   * every edit made so far.
   *
   * This used to return early when a save was already in flight, merely setting
   * a `pending` flag and firing an unawaited follow-up. `handleSubmit` awaited
   * it and took the resolution to mean "draft is saved" — so submitting while an
   * autosave was in flight validated the PREVIOUS draft. That is how the wizard
   * could show "6 of 6 sections complete" in the header and refuse with
   * "Complete all six sections" from the server in the same click.
   *
   * Now: concurrent callers JOIN the in-flight flush rather than skipping it,
   * and the flush loops until the draft is clean, so an edit made mid-write is
   * written by the next iteration instead of being dropped.
   */
  const saveNow = React.useCallback((): Promise<boolean> => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (flushRef.current) return flushRef.current;
    if (!dirtyRef.current) return Promise.resolve(true);

    const run = (async (): Promise<boolean> => {
      while (dirtyRef.current) {
        // Clear BEFORE the await: an edit that lands during the write re-dirties
        // it and is caught by the next pass. Clearing after would swallow it.
        dirtyRef.current = false;
        setSaveState("saving");
        const result = await props.saveAction(props.slug, valuesRef.current);
        if (!result.ok) {
          dirtyRef.current = true; // stay dirty so a later flush retries
          setSaveState("error");
          toast.error("Couldn't save", { description: result.error });
          return false;
        }
        setSaveState("saved");
        setLastSavedAt(new Date());
      }
      // The loop only exits with `dirtyRef` clear, i.e. the server now holds
      // every edit on screen. That — not "a save happened once" — is what the
      // indicator is allowed to call saved.
      setDirty(false);
      return true;
    })();

    flushRef.current = run;
    void run.finally(() => {
      if (flushRef.current === run) flushRef.current = null;
    });
    return run;
  }, [props]);
```

### 13.6 (bonus) The FileUpload commit seam that makes autosave correct
`packages/ui/src/components/file-upload.tsx:107-111`

```ts
  function commit(next: string[]) {
    onChange(next);
    // Let React flush the new value before a consumer's autosave reads it.
    if (onCommit) setTimeout(onCommit, 0);
  }
```

---

## 14. Gotchas and traps for anyone porting this

1. **Both layouts are always in the DOM.** `ResponsiveDataTable` renders the `<table>` and
   the `<ul>` simultaneously; responsiveness is `display:none`, not conditional rendering.
   Consequence A: every cell render function runs twice per row. Consequence B: Playwright
   strict-mode ambiguity — scope selectors with `.filter({ visible: true })`
   (`e2e/specs/supplier/support.ts:27-42`). Consequence C: `getByText` in unit tests must
   be scoped with `within(table)` / `within(cards)`.
2. **`align` is asymmetric in the card.** Only `"left"` is honoured; `"center"` silently
   becomes `text-right` (`responsive-data-table.tsx:318-323`).
3. **`emptyState` must be provided** for the empty branch to trigger — with `emptyState ===
   undefined` and `data.length === 0` you get an empty table plus an empty list
   (`:190`).
4. **Card `<dt>` labels reuse `column.header`**, so a `ReactNode` header renders inside a
   `<dt>` on mobile. Keep headers as strings if you want the `mobileAriaLabel` derivation
   and the `<dt>` to behave.
5. **ToggleGroup: the group's context beats the item's own prop**, but only for props the
   group actually set. Documented and tested, never fixed
   (`toggle-group.tsx:67-70`, `toggle-group.test.tsx:125-144`).
6. **`file.type === ""` skips the client type check** (`file-upload.tsx:135`). Fine only
   because the server token re-enforces — so **do not port `FileUpload` without also
   porting a `handleUpload` route with `allowedContentTypes` + `maximumSizeInBytes`.**
7. **The markdown editor needs jsdom shims in tests** or ProseMirror throws asynchronously
   and reddens the whole run (`markdown-editor.test.tsx:18-49`).
8. **`roundTripMarkdown` constructs and destroys a whole Tiptap editor per call** and needs
   a DOM. Not for server paths (`markdown.ts:41-43`).
9. **`MarkdownEditor`'s `placeholder` prop is declared but never used** —
   `MarkdownEditorProps.placeholder` at `markdown-editor.tsx:128` is destructured away and
   never reaches the editor (`:136-141`). Dead prop; a caller passing it gets nothing.
10. **`PasswordInput` must keep its focusable show/hide toggle.** The 10-line comment at
    `password-input.tsx:90-99` exists because `tabIndex={-1}` was once added and broke
    keyboard-only password reveal across every auth screen in three apps.
11. **`Field` sets no `aria-describedby` itself** — it only *derives the ids*. The caller
    must wire the control. Easy to port and then silently lose the association.
12. **Camp 404's `Select` has `tw-animate-css` classes the donor's lacks**; the donor's
    overlays will sit motionless beside Camp 404's animated ones unless the classes are
    added when porting anything that composes `Select` (e.g. `phone-input.tsx`).
13. **Donor files are uniformly semicolon'd; several Camp 404 `packages/ui` files are not**
    (`button.tsx`, `badge.tsx`, `switch.tsx`, `checkbox.tsx`, `dialog.tsx`, `popover.tsx`),
    despite `.prettierrc.json` setting `"semi": true`. Run `pnpm format` after any paste or
    the styles visibly mix.
14. **`transcribeRecording` hardcodes `/api/report/transcribe`** (`report-client.ts:20`).
    One constant to change for Camp 404's `/api/voice/transcribe`.
15. **Donor comments are not always true.** The donor's own simplification audit found
    eight comments that contradict the code beneath them (including
    `DEPARTMENT_SCOPED_CAPABILITIES`' doc comment saying the opposite of its code). None of
    the eight are in this unit — but read the code under any comment before trusting it.
