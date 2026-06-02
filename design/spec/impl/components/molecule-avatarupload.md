# AvatarUpload — molecule plan

- **mapsTo:** PROMOTE `apps/web/components/profile/avatar-upload.tsx`
- **Target file:** `packages/ui/src/components/avatar-upload.tsx`

---

## Current state — does it exist? where? gap vs spec

**`packages/ui/src/components/avatar-upload.tsx` — does NOT exist.** Verified by
listing `packages/ui/src/components/` — no `avatar-upload.tsx` is present.

**Existing app-local source:**
`apps/web/components/profile/avatar-upload.tsx` — confirmed at that path, 147 lines.

The component is already shared by two consumers (not three — see below):
- `apps/web/app/profile/edit/edit-form.tsx:9,31` — imports and renders it directly.
- `apps/web/components/questionnaire/question.tsx:28,234–239` — imports it for the
  `image` question kind; no `className` override passed (uses default `h-40 w-40`).

There is **no separate hand-rolled version** in `apps/web` for the onboarding step.
Onboarding uses `QuestionnaireWizard` → `QuestionField` → `FieldInput` (kind `image`)
→ the same `AvatarUpload` import from `components/profile/avatar-upload.tsx`
(`apps/web/lib/questionnaire.ts:71` confirms `kind: "image"` on the profile-photo
page; `apps/web/components/questionnaire/wizard.tsx:155` confirms the image-kind
full-screen treatment). So the component is already shared; the PROMOTE is about
lifting it into `@camp404/ui` so it is no longer app-local.

### Gaps vs spec (cite files)

| Gap | Source | Notes |
|---|---|---|
| **No rectangular dropzone variant** | `component-library.md` AvatarUpload spec: "rectangular dropzone (generic image field, S05)" | Current code has only a circular button; S05 dropzone is not built anywhere yet. |
| **No "10 MB / JPG-PNG helper" line** | `component-library.md` spec: "10 MB/JPG-PNG helper" | No file-type/size hint text is rendered beneath the control in the current code. The API route cap is 5 MB (not 10 MB — board/spec text says 10 MB but route enforces 5 MB; the helper copy must match the server). |
| **Error state lacks a dedicated retry button** | `component-library.md`: "Re-add the error-state re-upload button the board omits." | Current code shows an error `<p>` and leaves the file-input still live; the circle reverts to EMPTY appearance with Camera icon so the user can click again — there is no explicit "Try again" button distinct from just clicking the circle. The spec calls for an explicit retry button to be re-added. |
| **Scrim uses raw `bg-black/40`** | `apps/web/components/profile/avatar-upload.tsx:102` | Uploading overlay: `bg-black/40` — must become `bg-overlay` (the `--overlay` token per `design-tokens.md §2.4`, which targets `oklch(from var(--color-background) l c h / 0.5)`; snap the board's `#00000080` 50% → `--overlay`). |
| **Verbose `[color:var(--color-*)]` token form** | `avatar-upload.tsx:83,116,127,133` | Multiple instances of the verbose token spelling (`text-[color:var(--color-primary)]`, etc.) — P1-5 codemod target; must become short-form (`text-primary`, `border-primary`) in the promoted version. |
| **Empty-circle fill uses raw `#1d133380`** | `design-tokens.md §4 reconciliation #19` | The board draws the avatar empty circle with `fill:#1d133380`; the current code uses `bg-[color:var(--color-muted)]` (different intent). The `--overlay` token is the reconciled target for the 50% scrim; `bg-muted` is correct for the circle background fill. Clarify in build (see Open items). |
| **No `size` prop** | Current API: `className` diameter override only | The spec does not add a `size` prop, but the plan should make the diameter contract explicit. |
| **No "Change photo" outline button variant name** | Current code inlines the trigger text | Minor; no gap in the component itself, but the spec notes "Upload a photo" / "Uploading…" / "Change photo" labels — these are already implemented. |
| **`data-uploading` attribute absent** | — | Useful for consumer-driven disabled state (e.g. `ProfileEditForm` disables Save while uploading). Currently no forwarded signal; consumers must track the `isPending` from the form action separately. |

---

## API — props, variants, sizes, states

### TS prop interface

```ts
export interface AvatarUploadProps {
  /**
   * Current image URL (proxy URL, object URL, or null/undefined when empty).
   * The component renders EMPTY state when falsy.
   */
  value: string | null | undefined;

  /**
   * Called with the stored proxy URL on successful upload, or null when the
   * user removes the photo. Consumers persist this into a hidden form input.
   */
  onChange: (url: string | null) => void;

  /**
   * Visual variant.
   *  - "circle"   — circular crop; for profile-edit and onboarding (default).
   *  - "dropzone" — rectangular dropzone; for generic image field (S05).
   * @default "circle"
   */
  variant?: "circle" | "dropzone";

  /**
   * Diameter (circle variant) or container class (dropzone variant).
   * Defaults to "h-40 w-40" for circle.
   */
  className?: string;

  /**
   * Forwarded to the root wrapper; lets consumers add gap/margin without
   * wrapping.
   */
  wrapperClassName?: string;
}
```

**Note on `onChange(url)`:** the `url` argument is a same-origin proxy URL emitted
by `POST /api/uploads/avatar`. This is an app-layer endpoint; `@camp404/ui` must not
hardcode the upload path. The POST URL is baked into the component today at
`/api/uploads/avatar` — plan step 3 (API decoupling) introduces an `uploadUrl` prop
or convention to keep the package portable. See Build steps.

### Variants

| Variant | Shape | When |
|---|---|---|
| `circle` (default) | `r:999` circular button, 160×160 default | Profile edit, onboarding step 01, field-renderer image kind in `QuestionField` |
| `dropzone` | Rectangular, `r:$radius` (`--radius` md), fill + dashed border | Generic image field S05 — not yet built anywhere; NEW for this plan. |

### Sizes

The component does not expose a discrete `size` prop. Diameter is set via
`className` (default `"h-40 w-40"`). This matches the current API and avoids
a size enum that would need to match every consuming context.

### States

| State | Visual treatment | Board ref |
|---|---|---|
| `empty` | Dashed `border-border` circle; `bg-muted` fill; `Camera` icon (muted-foreground, 32×32); "Add photo" caption (Inter/12/500/muted-foreground) | S11 EMPTY state |
| `uploading` | Filled circle, `bg-muted`; `Loader2` spinner overlay (`animate-spin`, white, 32×32) inside `bg-overlay` scrim; "Uploading…" trigger button disabled (`opacity-60`) | S11 UPLOADING state; `#00000080` → `bg-overlay` |
| `populated` | Photo displayed; `border-primary` solid; destructive 28×28 remove button (`rounded-full bg-destructive text-destructive-foreground`, `X` icon) positioned top-right; "Change photo" trigger | S11 POPULATED state |
| `error` | Reverts to EMPTY visual (dashed circle, Camera icon); error Alert (`tone="destructive"`, no title, body = server error message or "Upload failed") below circle; **explicit "Try again" button** (outline) re-added per spec reconciliation | S11 ERROR state + spec note |

---

## Tokens & type — exact design tokens + type-scale roles

### Colour tokens

| Element | Token | Notes |
|---|---|---|
| Circle border (empty) | `border-border` (dashed) | `$border` = `--color-border`; dashed variant |
| Circle border (populated) | `border-primary` (solid) | `$primary` = hot-magenta |
| Circle fill | `bg-muted` | `$muted` = `--color-muted`; base circle background in all states |
| Circle hover border | `border-primary` | Tint on hover to invite interaction |
| Focus ring | `ring-primary` | `focus-visible:ring-2 focus-visible:ring-primary` |
| Uploading scrim | `bg-overlay` | NEW `--overlay` token = `oklch(from var(--color-background) l c h / 0.5)` replacing `bg-black/40` (design-tokens.md §2.4 reconciliation #19) |
| Spinner (uploading) | `text-white` | On dark scrim overlay; white is correct |
| Remove button fill | `bg-destructive` | Destructive red |
| Remove button icon | `text-destructive-foreground` | White on destructive |
| Error text / Alert | `text-destructive` via `Alert` component | Routed through `Alert tone="destructive"` |
| Trigger link (active) | `text-primary` | "Upload a photo" / "Change photo" |
| Trigger link (disabled) | `text-primary opacity-60` | Uploading state |
| Camera icon / "Add photo" | `text-muted-foreground` | Empty state chrome |
| Helper text | `text-muted-foreground` | "10 MB · JPG or PNG" |

`--overlay` is a NEW token that must land in `packages/ui/src/styles/globals.css`
before the uploading state passes visual review (same dependency as the status
tokens; tracked in `foundations-tokens.md`).

### Type-scale roles (from `design-tokens.md §1.1`)

| Element | Role | Face | Size | Weight |
|---|---|---|---|---|
| Trigger button label ("Upload a photo" / "Change photo") | `--text-body-strong` | Inter | 14px | 500–600 |
| "Add photo" empty placeholder | `--text-caption` | Inter | 12px | 500 |
| Helper hint ("10 MB · JPG or PNG") | `--text-caption` | Inter | 12px | 400 |
| Error body (via Alert) | `--text-body` | Inter | 13–14px | 400 |

No JetBrains Mono — AvatarUpload is a UI control, not a data-console element.

### Radius

| Element | Token | Value |
|---|---|---|
| Circle border | `rounded-full` | `--radius-full` (9999px) |
| Remove button | `rounded-full` | `--radius-full` |
| Dropzone variant container | `rounded-md` | `--radius` (0.625rem) |

---

## Composition & deps — atoms/primitives + @camp404/core helpers

### Atoms used

| Atom | From | Role |
|---|---|---|
| `Spinner` | `@camp404/ui/spinner.tsx` (PROMOTE — does not exist yet) | Uploading overlay; replaces inlined `Loader2 + animate-spin` |
| `Alert` | `@camp404/ui/alert.tsx` (PROMOTE — does not exist yet) | Error state banner; replaces bare `<p role="alert">` |
| `Avatar` | `@camp404/ui/avatar.tsx` (REUSE — exists) | **Not composed inside AvatarUpload directly.** AvatarUpload owns its own `<img>` + `<button>` because it needs the interactive file-pick affordance, the scrim overlay, and the object-URL preview logic — behaviours not in the Radix `Avatar` primitive. The outer form context renders a separate `Avatar` atom (read-only display) where needed. |

### Helpers

| Helper | From | Role |
|---|---|---|
| `cn` | `@camp404/ui/lib/utils` | Class composition — same pattern as every other `@camp404/ui` component |
| `cropResizeToSquare` | `apps/web/lib/image.ts` | Client-side canvas crop + WebP encode — **stays app-local, not imported by `@camp404/ui`**; decoupled via the `uploadUrl` prop or a passed `onUpload` callback (see Build step 3) |

### @camp404/core

No `@camp404/core` dependency. AvatarUpload is a pure presentation + async-upload
molecule; it has no business logic, no rank check, no validation query. It does not
import from `@camp404/db` or `next/*` (after decoupling — see Build step 3).

### No new peer deps

`lucide-react` is already a peer dep of `@camp404/ui`. `Camera`, `Loader2`, and `X`
are the only icons used. `Spinner` (when promoted) wraps `Loader2`; once promoted,
AvatarUpload uses `Spinner` directly.

---

## Absorbs — candidates replaced (from merge map)

The `component-library.md` merge map has no explicit AvatarUpload merge row — it is
a single canonical component with no duplicate candidates. The absorb list is the
set of inline reinventions it replaces:

| Reinvention / candidate | Location | Replacement |
|---|---|---|
| Inline avatar upload (profile-edit) | `apps/web/app/profile/edit/edit-form.tsx:31` (via `apps/web/components/profile/avatar-upload.tsx`) | Delete import from app path; import from `@camp404/ui/avatar-upload` |
| Inline avatar upload (questionnaire image kind) | `apps/web/components/questionnaire/question.tsx:28,234–239` (same source) | Same swap |
| Future: dropzone image field (S05) | Not yet built | `<AvatarUpload variant="dropzone">` |

There is no separate "onboarding avatar upload" component — both onboarding and
profile-edit already share the single file at `components/profile/avatar-upload.tsx`.
After PROMOTE, both consumers import from `@camp404/ui`.

---

## Stories & tests

### Storybook stories

```text
AvatarUpload.stories.tsx (packages/ui/src/components/)

Story: Empty
  — value={null}, no onChange action
  — confirms dashed border, Camera icon, "Add photo" caption, helper hint

Story: Populated
  — value="https://example.com/avatar.webp"
  — confirms solid border-primary, image rendered, remove button visible
  — change-photo trigger reads "Change photo"

Story: Uploading
  — render with uploading=true (internal state; simulate via mock or Storybook play)
  — confirms scrim overlay, Spinner visible, trigger button disabled + "Uploading…"

Story: Error
  — simulate upload failure (mock fetch returns 502)
  — confirms Circle reverts to EMPTY appearance, Alert tone="destructive" shown,
    "Try again" button present

Story: DropzoneVariant
  — variant="dropzone", value={null}
  — confirms rectangular container, dashed border, accepts file

Story: CircleSmall
  — className="h-24 w-24"
  — confirms diameter override; geometry scales

Story: InteractivePlayground (args table)
  — value, variant controls; onChange action logged
```

### Vitest / RTL test cases

```text
avatar-upload.test.tsx (packages/ui/src/components/__tests__/ or co-located)

— renders Camera icon and "Add photo" when value is null (EMPTY state)
— renders <img> with correct src when value is a URL (POPULATED state)
— renders remove button when value is populated
— remove button calls onChange(null) and reverts to EMPTY
— clicking the circle button opens the hidden file input (fires click on inputRef)
— clicking the trigger link button opens the file input
— after a successful mock upload: onChange called with proxy URL; POPULATED rendered
— during upload: trigger button is disabled; aria-label updated to "Uploading…"
— on upload error: Alert tone="destructive" is rendered with error message
— on upload error: circle returns to EMPTY appearance (Camera icon visible)
— "Try again" button is present in error state and triggers file input on click
— forwards className to the circle button element
— hidden file input is sr-only and accept="image/*"
— object-URL preview is used (not value prop) immediately after file selection (before POST resolves)
— useEffect revokes preview object URL on unmount (no memory leak)
```

### Accessibility notes

- The circle `<button>` carries `aria-label`: "Add a profile photo" (empty) /
  "Change profile photo" (populated). This is the primary interactive label.
- The remove `<button>` carries `aria-label="Remove profile photo"`.
- The "Try again" retry `<button>` carries `aria-label="Try uploading again"` or
  equivalent.
- The hidden `<input type="file">` is `sr-only` and does not need its own label
  (it is activated only by the labelled buttons above it; it is not tab-focusable
  directly).
- The uploading scrim overlay (`aria-hidden="true"`) hides the spinner from the
  accessibility tree; the disabled state of the trigger button is the machine-
  readable signal that upload is in progress.
- The error `Alert` uses `role="alert"` (via the Alert component) so screen readers
  announce the error on mount.
- `focus-visible` ring uses `ring-primary` — matches the brand ring token and is
  distinct from the border on the circle.
- Reduced-motion: the `Spinner` component (once promoted) guards `animate-spin`
  with `@media (prefers-reduced-motion: reduce)` — no inline motion override needed
  in AvatarUpload itself.

---

## Build steps — ordered + acceptance criteria

### Step 0 — Prerequisites (not this ticket)

The following must land before AvatarUpload ships to consumers:

1. **`--overlay` token** in `packages/ui/src/styles/globals.css` `@theme`:
   `--overlay: oklch(from var(--color-background) l c h / 0.5)` (or equivalent
   50% scrim token). Required by the uploading state.
   Tracked in `design/spec/impl/foundations-tokens.md`.

2. **`Spinner` atom** at `packages/ui/src/components/spinner.tsx` (PROMOTE plan
   `atom-spinner.md`). AvatarUpload uses it for the uploading overlay.

3. **`Alert` molecule** at `packages/ui/src/components/alert.tsx` (PROMOTE plan
   `molecule-alert.md`). AvatarUpload uses it for the error state.

**Acceptance:** `bg-overlay` resolves to a visible 50% scrim in the browser;
`Spinner` and `Alert` are importable from `@camp404/ui`.

### Step 1 — Extract `cropResizeToSquare` as an injected dependency

`cropResizeToSquare` lives in `apps/web/lib/image.ts`. `@camp404/ui` must not
import from `apps/web`. Add a prop:

```ts
/**
 * Async image preprocessor called with the picked File before upload.
 * Defaults to identity (passes File as-is) so the component can be used
 * without the canvas pipeline in non-web environments or tests.
 * Consumers that need crop/resize pass `cropResizeToSquare` from `lib/image.ts`.
 */
preprocessImage?: (file: File) => Promise<Blob | File>;
```

**Acceptance:** `packages/ui/src/components/avatar-upload.tsx` has zero imports from
`apps/web` or `@/`; it depends only on `react`, `lucide-react`, and internal
`@camp404/ui` utilities.

### Step 2 — Decouple the upload endpoint

Replace the hardcoded `fetch("/api/uploads/avatar", …)` with an injected prop:

```ts
/**
 * URL to POST the image FormData to. Defaults to "/api/uploads/avatar"
 * for backward compatibility, but must be overridden in any context where
 * that path is not available.
 */
uploadUrl?: string;
```

The POST shape is preserved (`FormData` with field `"image"`; response
`{ url: string }`). This keeps the UI package decoupled from the Next.js
route convention while preserving the existing behaviour with no consumer
changes (default matches the current hardcoded path).

**Acceptance:** component source contains no hardcoded `/api/uploads/avatar`
string; the default value of `uploadUrl` prop is `"/api/uploads/avatar"` so
existing consumers compile without change.

### Step 3 — Build `packages/ui/src/components/avatar-upload.tsx`

Implement the full component per the API + state spec above. Key implementation
notes:

- Use `cn` from `../lib/utils`.
- Circle button: `relative flex rounded-full overflow-hidden border-2 border-dashed
  border-border bg-muted text-muted-foreground transition-colors
  hover:border-primary focus-visible:outline-none focus-visible:ring-2
  focus-visible:ring-primary disabled:opacity-60`; when populated switch to
  `border-solid border-primary`.
- Uploading scrim: `absolute inset-0 flex items-center justify-center bg-overlay`
  (not `bg-black/40`).
- Object-URL preview: `useEffect` cleanup revokes the URL keyed on `preview`
  state (pattern from existing source; preserve it).
- Error state: replace bare `<p role="alert">` with `<Alert tone="destructive">`
  from `@camp404/ui/alert`; add an explicit "Try again" `<button>` (outline
  variant) that calls `inputRef.current?.click()`.
- Helper text: render `"10 MB · JPG or PNG"` as `<p className="text-xs
  text-muted-foreground">` below the trigger (matches S11 advisory line "A
  clear photo of your face works best." which the board draws; harmonise copy
  with product).
- Dropzone variant (`variant="dropzone"`): rectangular container with
  `rounded-md border-2 border-dashed border-border bg-muted`; drag-and-drop
  event handlers (`onDragOver`, `onDrop`) in addition to click-to-pick; same
  upload pipeline.

**Acceptance criteria:**
- File exists at `packages/ui/src/components/avatar-upload.tsx`.
- No imports from `apps/web`, `@/`, or `next/*`.
- No raw hex (`#xxxxxx`), no `bg-black/40`, no `emerald-*`, no verbose
  `[color:var(--color-*)]`.
- All four states (empty / uploading / populated / error) render correctly per
  the token table above.
- `variant="dropzone"` renders a rectangular drop-target.
- `preprocessImage` prop default is identity; when `cropResizeToSquare` is
  passed, the canvas pipeline runs before POST.
- `uploadUrl` default is `"/api/uploads/avatar"`.
- TypeScript compiles with zero errors in `packages/ui`.

### Step 4 — Add Storybook stories

Create `packages/ui/src/components/avatar-upload.stories.tsx` with all stories
listed above (Empty, Populated, Uploading, Error, DropzoneVariant, CircleSmall,
InteractivePlayground).

**Acceptance:** all stories render without error in Storybook; Empty / Populated /
Error are visually distinct; the dropzone story shows the rectangular variant.

### Step 5 — Add vitest / RTL tests

Create `packages/ui/src/components/__tests__/avatar-upload.test.tsx` (or
co-located) with all test cases listed above. Mock `fetch` globally in the test
file; mock `URL.createObjectURL` / `URL.revokeObjectURL`.

**Acceptance:** `pnpm test` in `packages/ui` passes all AvatarUpload tests.

### Step 6 — Update consumers in `apps/web`

Swap the `apps/web` import path in both consumers:

1. `apps/web/app/profile/edit/edit-form.tsx:9`
   — `import { AvatarUpload } from "@/components/profile/avatar-upload"`
   → `import { AvatarUpload } from "@camp404/ui/components/avatar-upload"`
   — Add `preprocessImage={cropResizeToSquare}` prop (imported from `@/lib/image`).

2. `apps/web/components/questionnaire/question.tsx:28`
   — Same path swap.
   — No `preprocessImage` override needed if consumers use the default upload
   pipeline (the default `uploadUrl` matches the route); add `preprocessImage`
   for crop/resize.

Delete `apps/web/components/profile/avatar-upload.tsx` once both consumers compile
and all tests pass.

**Acceptance:**
- `apps/web/components/profile/avatar-upload.tsx` is deleted.
- Both consumer files import from `@camp404/ui`.
- `pnpm build` (or tsc) in `apps/web` passes.
- Profile-edit and onboarding image-question surfaces work identically to the
  pre-PROMOTE behaviour.

### Step 7 — Add dropzone usage (deferred, S05 consumer)

When the `image` field-renderer for S05 is built, wire `<AvatarUpload
variant="dropzone">` in the field-renderer image kind. This step is gated on
the S05 surface plan; it is not required for Step 6 acceptance.

---

## Consumers — which molecules/organisms/surfaces use it

| Consumer | File | Usage |
|---|---|---|
| `ProfileEditForm` | `apps/web/app/profile/edit/edit-form.tsx` | Profile photo upload on `/profile/edit` (S10/S11) |
| `QuestionField` (image kind) | `apps/web/components/questionnaire/question.tsx` | Onboarding step 01 profile photo; any `kind: "image"` questionnaire question |
| `QuestionnaireWizard` (via QuestionField) | `apps/web/components/questionnaire/wizard.tsx` | Drives the onboarding + questionnaire-runner page that hosts the image question |
| Future: `FieldRenderer` image kind (S05) | not yet built | Generic image field via `variant="dropzone"` (Build step 7) |

---

## Open items

1. **`--overlay` alpha (50% vs 40%).** The board draws `#00000080` (50%) for the
   uploading overlay; the current code uses `bg-black/40` (40%). `design-tokens.md
   §2.4` proposes `--overlay` at 50% (`/0.5`). The promoted component must use
   `bg-overlay`; the exact alpha is confirmed when the token is defined in
   `foundations-tokens.md`. If 40% is preferred visually, set `--overlay: oklch(…
   / 0.4)` — do not hardcode the alpha in AvatarUpload.

2. **Empty-circle fill token.** `design-tokens.md §4 reconciliation #19` notes the
   board draws `fill:#1d133380` for the empty-circle background, which normalises
   to `--overlay`. The live code uses `bg-muted` — a surface-colour fill, not a
   scrim. The empty circle is a filled circle (not a scrim over content), so
   `bg-muted` is semantically correct and distinguishes the circle from the
   transparent background around it. Confirm whether the board's `#1d133380` was
   intended as a scrim tint over a photo or as the empty-state fill; if the latter,
   `bg-muted` (`oklch(0.22 0.06 295)`) is close enough. Flag for design sign-off;
   do not introduce a new token for this case.

3. **File-size cap copy.** The `component-library.md` spec says "10 MB/JPG-PNG
   helper" but `apps/web/app/api/uploads/avatar/route.ts:9` enforces 5 MB
   (`MAX_BYTES = 5 * 1024 * 1024`). The helper text should read "5 MB · JPG or
   PNG" (matching the actual server cap) unless product decides to raise the route
   limit. Confirm before writing the helper string.

4. **`preprocessImage` default and the upload route.** The default `uploadUrl` is
   `"/api/uploads/avatar"`, which accepts a `File` or `Blob`. The default
   `preprocessImage` is identity (no crop/resize). Callers that want the 512px WebP
   pipeline **must** explicitly pass `preprocessImage={cropResizeToSquare}`.
   Consider whether the component should warn in development when `preprocessImage`
   is omitted, to prevent accidentally uploading large unprocessed files.

5. **`data-uploading` forwarded attribute.** `ProfileEditForm` disables "Save
   changes" independently of the upload's in-flight state, relying on a separate
   `isPending` from `useActionState`. There is no machine-readable signal from
   AvatarUpload that a POST is in flight. A `data-uploading` attribute on the root
   or an `onUploadingChange(boolean)` callback would let `ProfileEditForm` disable
   Save during the upload. Confirm whether this is needed or whether the existing
   behaviour (Save and Upload can race) is acceptable.
